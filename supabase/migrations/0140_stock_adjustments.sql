begin;

-- RULING 2026-09-29: bulk stock is product-wide; Manager+ may correct it with a reason.
create table stock_adjustments (
  id uuid not null default gen_random_uuid() primary key,
  client_uuid uuid not null unique,
  product_id uuid not null references products(id),
  delta integer not null check (delta <> 0),
  quantity_before integer not null check (quantity_before >= 0),
  quantity_after integer not null check (quantity_after >= 0),
  reason text not null check (length(btrim(reason)) >= 10),
  created_at timestamptz not null default now(),
  created_by uuid not null references users(id),
  constraint stock_adjustments_arithmetic check (quantity_after = quantity_before + delta)
);

create index idx_stock_adjustments_product on stock_adjustments(product_id, created_at desc);
alter table stock_adjustments enable row level security;

create policy stock_adjustments_select on stock_adjustments for select to authenticated
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'));

revoke all on stock_adjustments from public, anon, authenticated;
grant select on stock_adjustments to authenticated;

create or replace function public.reject_direct_bulk_quantity_update()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and NEW.total_quantity is distinct from OLD.total_quantity then
    raise exception 'GATE:gate.stock_adjust.rpc_required|Use the audited stock adjustment action to change quantity.' using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

create trigger products_bulk_quantity_rpc_only
before update of total_quantity on products
for each row execute function public.reject_direct_bulk_quantity_update();

create or replace function public.adjust_stock(
  p_product_id uuid,
  p_delta integer,
  p_reason text,
  p_actor_id uuid,
  p_client_uuid uuid
) returns table (product_id uuid, quantity_before integer, quantity_after integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before integer;
  v_after integer;
  v_tracking product_tracking_mode;
  v_existing stock_adjustments%rowtype;
begin
  if auth_user_role() not in ('Owner', 'Admin', 'Manager') or auth_user_role() is null then
    raise exception 'GATE:gate.stock_adjust.role|Only Owner, Admin, or Manager may adjust stock.' using errcode = 'P0001';
  end if;
  if p_actor_id is distinct from auth.uid() then
    raise exception 'GATE:gate.stock_adjust.actor|Adjustment actor must be the signed-in user.' using errcode = 'P0001';
  end if;
  if p_client_uuid is null then
    raise exception 'GATE:gate.stock_adjust.idempotency|Adjustment requires a client UUID.' using errcode = 'P0001';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'GATE:gate.stock_adjust.delta_zero|Adjustment must be a non-zero whole number.' using errcode = 'P0001';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception 'GATE:gate.stock_adjust.reason_missing|Stock adjustment requires a reason of at least 10 characters.' using errcode = 'P0001';
  end if;

  -- The product lock serialises concurrent adjustments and retries.
  select p.total_quantity, p.tracking_mode into v_before, v_tracking
    from products p where p.id = p_product_id for update;
  if not found then
    raise exception 'GATE:gate.stock_adjust.product_not_found|Product not found.' using errcode = 'P0001';
  end if;

  select * into v_existing from stock_adjustments sa where sa.client_uuid = p_client_uuid;
  if found then
    if v_existing.product_id <> p_product_id or v_existing.delta <> p_delta
       or v_existing.reason <> btrim(p_reason) or v_existing.created_by <> p_actor_id then
      raise exception 'GATE:gate.stock_adjust.idempotency_conflict|Client UUID already belongs to a different adjustment.' using errcode = 'P0001';
    end if;
    return query select v_existing.product_id, v_existing.quantity_before, v_existing.quantity_after;
    return;
  end if;

  if v_tracking = 'Serialised' then
    raise exception 'GATE:gate.stock_adjust.wrong_tracking_mode|Serialised products are corrected by adding or retiring individual units.' using errcode = 'P0001';
  end if;
  v_after := v_before + p_delta;
  if v_after < 0 then
    raise exception 'GATE:gate.stock_adjust.negative_result|Adjustment would take stock below zero.' using errcode = 'P0001';
  end if;

  update products set total_quantity = v_after, updated_at = now(), updated_by = p_actor_id
   where id = p_product_id;
  insert into stock_adjustments
    (client_uuid, product_id, delta, quantity_before, quantity_after, reason, created_by)
  values
    (p_client_uuid, p_product_id, p_delta, v_before, v_after, btrim(p_reason), p_actor_id);
  return query select p_product_id, v_before, v_after;
end;
$$;

revoke all on function public.adjust_stock(uuid, integer, text, uuid, uuid) from public, anon;
grant execute on function public.adjust_stock(uuid, integer, text, uuid, uuid) to authenticated;

commit;
