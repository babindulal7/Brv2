-- RULING 2026-09-29 (Option A, OPEN_DECISIONS.md #4): Consumables deplete at Handover.
-- =============================================================================
-- Migration 0142: Automatic consumable stock deduction on Handover.
--
-- Law 1: The database is the law.
-- 0141 stops the Return gate from demanding a receipt for Consumable-tracked
-- lines. Without this migration nothing would ever decrement
-- products.total_quantity when consumables (gaffer tape, gels, batteries)
-- leave the building — the count would silently stop meaning anything.
--
-- Shape follows 0112_partial_return_missing_case.sql exactly: a trigger on
-- booking_stage_transitions insert, keyed on to_stage, idempotency by UNIQUE
-- constraint (not a bare not-exists), post-condition check at the end.
--
-- Why 'On Rent' and not 'Packed': Handover completes Packed -> On Rent and is
-- the point of no return. Packing can be redone or the booking cancelled
-- before anything leaves; deducting at Packed would charge stock for gear
-- still on the shelf.
--
-- Interaction with 0140's products_bulk_quantity_rpc_only: that trigger
-- refuses DIRECT total_quantity updates only when current_user =
-- 'authenticated'. This function is SECURITY DEFINER, so its update runs as
-- the function owner and is not refused — same as adjust_stock()'s own
-- update. A client UPDATE on products is still refused; only this trigger and
-- adjust_stock() may move the number, and each leaves its own audit row
-- (consumable_stock_movements here, stock_adjustments there) so "why did this
-- number change" stays answerable without filtering a mixed table by cause.
-- =============================================================================

begin;

create table consumable_stock_movements (
  id                uuid          not null default gen_random_uuid() primary key,
  client_uuid       uuid          not null,
  booking_id        uuid          not null references bookings (id),
  booking_line_id   uuid          not null references booking_lines (id),
  product_id        uuid          not null references products (id),
  qty               integer       not null,
  quantity_before   integer       not null,
  quantity_after    integer       not null,
  created_at        timestamptz   not null default now(),
  created_by        uuid          not null references users (id),

  constraint consumable_stock_movements_client_uuid_key unique (client_uuid),
  constraint consumable_stock_movements_qty_positive check (qty > 0),
  constraint consumable_stock_movements_quantity_before_nonneg check (quantity_before >= 0),
  constraint consumable_stock_movements_quantity_after_nonneg check (quantity_after >= 0),
  -- One deduction per line, ever — a re-run of the trigger (e.g. a Handover
  -- session reopened and re-closed) must not double-charge stock. This UNIQUE
  -- is the real idempotency guard; the not-exists check in the function only
  -- avoids a wasted attempt.
  constraint consumable_stock_movements_one_per_line unique (booking_line_id)
);

create index idx_consumable_stock_movements_booking on consumable_stock_movements (booking_id);
create index idx_consumable_stock_movements_product on consumable_stock_movements (product_id, created_at desc);

alter table consumable_stock_movements enable row level security;

-- Reporting audience only: an automatic system effect, never an operator
-- write, so no insert/update/delete policy — the SECURITY DEFINER trigger
-- below bypasses RLS. Mirrors stock_adjustments_select (0140).
create policy consumable_stock_movements_select on consumable_stock_movements for select to authenticated
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'));

revoke all on consumable_stock_movements from public, anon, authenticated;
grant select on consumable_stock_movements to authenticated;

create or replace function public.deduct_consumable_stock_on_handover()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_line       record;
  v_before     integer;
  v_after      integer;
begin
  -- Only trigger on transition to 'On Rent' (Handover complete)
  if NEW.to_stage <> 'On Rent' then
    return NEW;
  end if;

  -- Every Consumable-tracked line on this booking that hasn't already been
  -- deducted (the unique constraint on booking_line_id is the real guard;
  -- this check just avoids a wasted attempt on a re-run).
  for v_line in
    select bl.id as booking_line_id, bl.product_id, bl.qty
    from booking_lines bl
    join products p on p.id = bl.product_id
    where bl.booking_id = NEW.booking_id
      and bl.voided_at is null
      and p.tracking_mode = 'Consumable'
      and not exists (
        select 1 from consumable_stock_movements csm
        where csm.booking_line_id = bl.id
      )
  loop
    select total_quantity into v_before
      from products
     where id = v_line.product_id
       for update;

    if v_before is null then
      -- Product row missing — should not happen given the FK, but never
      -- silently skip a stock event; fail loudly instead.
      raise exception 'GATE:gate.handover.consumable_product_missing|Consumable product % not found for booking line %.', v_line.product_id, v_line.booking_line_id using errcode = 'P0001';
    end if;

    v_after := greatest(0, v_before - v_line.qty);
    -- Deliberately clamped at zero rather than raising: Handover has already
    -- happened by the time this trigger fires (it runs on the stage
    -- transition itself), so refusing here would block a completed handover
    -- over a stock-count discrepancy that predates this booking. A negative
    -- total_quantity going forward would be worse than a clamped one; the
    -- undercount is instead visible for a Manager to correct with
    -- adjust_stock() (0140), with the real reason on record.

    update products
       set total_quantity = v_after,
           updated_at = now()
     where id = v_line.product_id;

    insert into consumable_stock_movements (
      client_uuid, booking_id, booking_line_id, product_id,
      qty, quantity_before, quantity_after, created_by
    ) values (
      gen_random_uuid(), NEW.booking_id, v_line.booking_line_id, v_line.product_id,
      v_line.qty, v_before, v_after, NEW.actor_id
    );
  end loop;

  return NEW;
end;
$$;

comment on function public.deduct_consumable_stock_on_handover() is
  'Automatically decrements products.total_quantity for Consumable-tracked booking lines when a booking transitions to On Rent (Handover complete). Clamped at zero; a pre-existing undercount surfaces for a Manager to fix via adjust_stock(), not as a blocked handover.';

-- Fires after the transition is applied, same timing as trg_return_missing_case
drop trigger if exists trg_consumable_stock_deduction on public.booking_stage_transitions;
create trigger trg_consumable_stock_deduction
  after insert on public.booking_stage_transitions
  for each row execute function public.deduct_consumable_stock_on_handover();

-- -----------------------------------------------------------------------------
-- Post-conditions verification
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'trg_consumable_stock_deduction'
       and tgrelid = 'public.booking_stage_transitions'::regclass
  ) then
    raise exception 'POST-CONDITION FAILED: trg_consumable_stock_deduction trigger missing on booking_stage_transitions.';
  end if;
end;
$$;

commit;
