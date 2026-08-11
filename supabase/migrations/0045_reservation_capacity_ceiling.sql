-- ============================================================================
-- 0045_reservation_capacity_ceiling.sql — generated 11 Aug 2026
-- (PLAN.md Phase 1 checklist item: "Exclusion constraint so double-booking is
--  impossible, not merely unlikely" — audited PARTIAL, one of its two holes
--  closed here.)
--
-- WHY
-- ---
-- `inventory_reservations_no_double_booking` (0003_operations.sql:1470-1472)
-- is real and correct, but it keys on `asset_id` only:
--
--     exclude using gist (asset_id with =, period with &&)
--       where (released_at is null and asset_id is not null)
--
-- `inventory_reservations_serialised_xor_quantity` (0003:1458-1459) forces
-- `(asset_id is null) <> (product_id is null)`, so every quantity-mode hold
-- has `asset_id IS NULL` and is excluded by that WHERE clause outright. And
-- `product_tracking_mode` (0001:505-509) has three values, two of which —
-- 'Quantity' and 'Consumable' — have no `product_units` rows at all
-- ("Governs whether product_units rows may exist", 0001:504) and therefore
-- can only ever be held by `product_id`. Today nothing anywhere caps those:
-- 500 of a 200-unit stock is a legal INSERT. The EXCLUDE makes serialised
-- double-booking impossible and leaves quantity-tracked stock unbounded.
--
-- This is not a newly-invented rule. 0003:1490-1491 already asks for it
-- verbatim:
--
--     -- TRIGGER REQUIRED: the sum of qty of live holds for a product over any
--     --   overlapping period must not exceed stock on hand.
--
-- A plain EXCLUDE cannot express it — "sum of qty across rows, at every
-- instant in a range" is an aggregate over a sweep, not a pairwise operator
-- test — which is why 0003 wrote it as a TRIGGER REQUIRED and not as a
-- fourth constraint. Written here.
--
-- WHAT "STOCK ON HAND" MEANS — from the spec, not invented
-- --------------------------------------------------------
-- `06 Inventory/Add Equipment.md` §5.1 defines it per mode:
--   Serialised  — "One row per unit with a serial. Stock = number of units"
--   Quantity    — "No units. Stock = `142 of 200`"  (§5.5 = `Total Quantity`)
--   Consumable  — "Quantity, and consumed on return — never comes back"
-- So the ceiling is `products.total_quantity` for Quantity and Consumable,
-- and `count(product_units)` for Serialised. Both are read below; neither is
-- a number this file chose.
--
-- SCOPE — READ THIS BEFORE ASSUMING MORE WAS BUILT THAN WAS
-- ----------------------------------------------------------
-- 0003:1488-1498 lists FIVE `-- TRIGGER REQUIRED` items on
-- `inventory_reservations`. This file implements exactly the one PLAN.md's
-- Phase 1 checklist names — the capacity ceiling above. It deliberately does
-- NOT implement the other four, which are Phase 3 ("the engines") work and
-- would mean writing the Confirm/Cancel transactions here:
--   - "no row may exist for a booking at stage Quote or Draft"
--   - "period must lie within the booking's pickup_at..return_at window"
--   - "cancelling a booking sets released_at/released_reason on every live
--      hold in the same transaction"
--   - "insert and release happen only through the Confirm and Cancel
--      transactions, never by direct write"
-- 0021_forward_only_stage_transitions.sql:28-33 already recorded the same
-- boundary from the other side: something must place a hold when a booking
-- is Confirmed and release it when it is Cancelled, that need is "real and
-- unbuilt", and it is not schema-layer plumbing. Until that engine exists
-- this ceiling — like the EXCLUDE beside it — guards a table nothing is yet
-- obliged to populate. That is a Phase 3 gap, not a defect in this file.
--
-- CONCURRENCY
-- -----------
-- Two sessions inserting holds for the same product cannot see each other's
-- uncommitted rows, so a bare read-and-compare would let both pass and both
-- commit — the exact failure mode an EXCLUDE does not have. The function
-- takes a `for update` row lock on the `products` row before reading, so
-- holds against one product serialise against each other. Same device, same
-- reason, as `apply_booking_stage_transition()`'s lock on `bookings`
-- (0021:105-108).
--
-- `security definer` for the same reason as `log_audit_event()` (0010:22)
-- and `apply_booking_stage_transition()` (0021:98): an enforcement trigger
-- that reads sibling rows under the caller's RLS would under-count whatever
-- the caller cannot see, and an enforcement check that can be weakened by
-- narrowing the caller's visibility is not an enforcement check.
--
-- FILE ONLY — never applied to any live Supabase project (repo hard rule).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 ▸ The index the check reads through.
--
-- The EXCLUDE's own gist index covers `(asset_id, period)`. Nothing covers
-- `(product_id, period)` — which is precisely the lookup a quantity hold's
-- capacity check performs, on every insert. Partial on `released_at is null`
-- to match both the EXCLUDE's predicate and the query below. `btree_gist` is
-- already installed (0003:37) and is what allows a uuid `=` key beside a
-- range `&&` key in a gist index.
-- ---------------------------------------------------------------------------
create index if not exists idx_inventory_reservations_product_period
  on inventory_reservations
  using gist (product_id, period)
  where (released_at is null and product_id is not null);


-- ---------------------------------------------------------------------------
-- 2 ▸ The ceiling.
--
-- Peak concurrency, not a naive total: two holds of 100 each on a stock of
-- 150 are perfectly legal if they do not overlap, and summing every hold
-- that touches the window would reject them. The sweep evaluates the sum of
-- live holds at each candidate instant and compares the maximum.
--
-- The candidate instants are the lower bounds of the overlapping live holds,
-- clamped to the new row's own period. That is sufficient: the occupancy
-- function only ever steps up at a hold's lower bound, so its maximum over
-- any window is attained at one of them or at the window's own start — and
-- the new row is itself one of the live rows, so its start is always in the
-- candidate set. Clamping to `NEW.period` keeps this row answerable for the
-- window it actually claims, rather than raising on a pre-existing breach
-- somewhere else on the timeline.
--
-- Both hold shapes are counted, because for a Serialised product they draw
-- on the same finite pool of units: a model-level hold of 3 plus a serial
-- hold on a fourth unit is 4 units claimed. Serial holds alone can never
-- breach the ceiling — the EXCLUDE already allows each unit at most one live
-- hold per instant — but they do consume capacity a model-level hold must
-- not double-claim.
--
-- Liveness is `released_at is null`, the same test the EXCLUDE uses, not
-- `state` — a released hold consumes nothing, and `state` is the unit's
-- lifecycle, not the hold's.
-- ---------------------------------------------------------------------------
create or replace function enforce_inventory_reservation_capacity()
returns trigger
language plpgsql
security definer
as $$
declare
  v_product_id     uuid;
  v_tracking_mode  product_tracking_mode;
  v_total_quantity int;
  v_capacity       int;
  v_peak           int;
begin
  -- A released hold consumes nothing. This is also the release path
  -- (Cancel sets released_at), which must never be blocked by a ceiling.
  if NEW.released_at is not null then
    return NEW;
  end if;

  -- Which product's stock does this hold draw on? A quantity hold names it;
  -- a serial hold reaches it through the unit.
  if NEW.product_id is not null then
    v_product_id := NEW.product_id;
  else
    select pu.product_id into v_product_id
    from product_units pu
    where pu.id = NEW.asset_id;

    if v_product_id is null then
      raise exception
        'Reservation rejected: asset % does not resolve to a product.', NEW.asset_id;
    end if;
  end if;

  -- Lock first, read second -- see the CONCURRENCY note in this file's header.
  select p.tracking_mode, p.total_quantity
    into v_tracking_mode, v_total_quantity
  from products p
  where p.id = v_product_id
  for update;

  if not found then
    raise exception
      'Reservation rejected: product % does not exist.', v_product_id;
  end if;

  if v_tracking_mode = 'Serialised' then
    -- "Stock = number of units" (Add Equipment.md §5.1). TODO(decision):
    -- every unit counts here, including 'Retired' and 'Lost' ones. Which of
    -- the locked ten inventory_states remove a unit from the availability
    -- pool is genuinely unruled -- see PLAN.md §4.14 -- so this file takes
    -- the loose bound, which can only ever be too permissive, never too
    -- strict. It still closes "unbounded": you cannot hold 500 of a
    -- three-unit product. Tightening it is a one-line change here once the
    -- state list is ruled.
    select count(*) into v_capacity
    from product_units pu
    where pu.product_id = v_product_id;
  else
    -- 'Quantity' and 'Consumable': "Total Quantity" (Add Equipment.md §5.5).
    v_capacity := v_total_quantity;
  end if;

  with live as (
    select r.period, r.qty
    from inventory_reservations r
    where r.released_at is null
      and r.product_id = v_product_id
      and r.period && NEW.period
    union all
    select r.period, r.qty
    from inventory_reservations r
    join product_units pu on pu.id = r.asset_id
    where r.released_at is null
      and pu.product_id = v_product_id
      and r.period && NEW.period
  ),
  candidates as (
    select distinct lower(l.period) as at
    from live l
    where NEW.period @> lower(l.period)
  )
  select coalesce(max(occupancy.held), 0) into v_peak
  from (
    select (
      select coalesce(sum(l.qty), 0)
      from live l
      where l.period @> c.at
    ) as held
    from candidates c
  ) occupancy;

  if v_peak > v_capacity then
    raise exception
      'Reservation rejected: product % would have % units held at once between % and %, but stock on hand is %.',
      v_product_id, v_peak, lower(NEW.period), upper(NEW.period), v_capacity;
  end if;

  return NEW;
end;
$$;

comment on function enforce_inventory_reservation_capacity() is
  'The capacity half of "double-booking is impossible". inventory_reservations_no_double_booking (0003) keys on asset_id and so covers Serialised holds only; this covers the quantity-mode holds that constraint''s WHERE clause excludes, by peak concurrent qty against stock on hand. Implements 0003:1490-1491.';

-- AFTER, so the new row is already visible to the sweep and counts itself.
-- On UPDATE too: "An extension widens it and must re-run the availability
-- check" (comment on inventory_reservations.period, 0003:1480), and a
-- widened period or a raised qty is exactly that.
create trigger trg_enforce_inventory_reservation_capacity
  after insert or update on inventory_reservations
  for each row execute function enforce_inventory_reservation_capacity();

commit;
