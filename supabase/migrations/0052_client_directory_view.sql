-- ============================================================================
-- 0052_client_directory_view.sql — 11 Aug 2026
--
-- The Clients directory needs a row shape no single table holds: alongside the
-- client's own columns it shows Outstanding, Deposit Held, active bookings and
-- the last rental date — every one of them an aggregate over invoices,
-- security_deposits and bookings.
--
-- WHY A VIEW AND NOT FOUR QUERIES IN THE SCREEN
-- --------------------------------------------
-- Law 1: pages never implement business logic. "Outstanding for a client" is a
-- definition, not a rendering detail — if the screen sums invoices itself, then
-- the next screen that needs the same number sums them slightly differently and
-- the two disagree. That is exactly the drift Law 2's Single Query Rule exists
-- to prevent. One definition, here, consumed by every surface.
--
-- LAW 6 — MONEY IS ABSENT, NOT MASKED
-- -----------------------------------
-- The three money aggregates resolve to NULL unless `auth_can_view_money()`
-- passes, matching the `_v` convention 0019 established and 0048 hardened. The
-- client's own `approved_credit_limit`/`payment_terms` are already
-- column-REVOKEd on the base table, so they are read here through `clients_v`
-- rather than `clients` — selecting them directly would fail for every role.
--
-- ROW VISIBILITY — this view is SECURITY DEFINER like its siblings (required:
-- it reads columns revoked from `authenticated`), so it carries its base
-- table's row predicate inline exactly as 0048 requires. Without that line the
-- view would hand every authenticated session every client row.
-- ============================================================================

create or replace view client_directory_v as
select
  c.id,
  c.client_code,
  c.name,
  c.phone,
  c.email,
  c.address_line,
  c.city,
  c.district,
  c.country,
  c.status,
  c.client_since,
  c.type_parent,
  c.org_subtype,
  c.pan_vat,
  c.deactivated_at,
  c.approved_credit_limit,
  c.payment_terms,

  -- Money aggregates. NULL for a money-blind session, never 0 — a rendered
  -- "Rs 0" is a claim about the client's balance, and that claim would be false.
  case when auth_can_view_money() then coalesce(inv.outstanding_total, 0) else null end
    as outstanding_amount,
  case when auth_can_view_money() then coalesce(dep.held_total, 0) else null end
    as deposit_held_amount,
  case when auth_can_view_money() then coalesce(pay.paid_total, 0) else null end
    as total_paid_amount,

  -- Operational counts carry no money and stay visible to every staff role:
  -- the floor legitimately needs to know a client has live bookings.
  coalesce(bk.active_count, 0)  as active_bookings_count,
  coalesce(bk.total_count, 0)   as total_bookings_count,
  bk.last_pickup_at
from clients_v c
left join lateral (
  select sum(i.outstanding_amount) as outstanding_total
  from invoices i
  where i.client_id = c.id
) inv on true
left join lateral (
  -- Held = received minus what has been refunded or applied. Law 5: a deposit
  -- is a liability, so this figure is deliberately NOT netted against anything
  -- the client owes — it never touches Outstanding.
  select sum(greatest(s.received_amount - s.refunded_amount - s.applied_amount, 0)) as held_total
  from security_deposits s
  where s.client_id = c.id
) dep on true
left join lateral (
  select sum(p.amount) as paid_total
  from payments p
  where p.client_id = c.id and p.status = 'Received'
) pay on true
left join lateral (
  -- "Active" = not finished and not cancelled. NOTE: there is no 'Cancelled'
  -- booking_stage — the canonical six are Quote/Booked/Packed/On Rent/Returned/
  -- Closed (lib/workflow.ts, and 0015 in the database), and cancellation is its
  -- own `cancelled_at` column because Law 3 makes cancelling a named terminal
  -- action rather than a stage a booking travels to. Postgres rejected the
  -- first draft of this view for exactly that reason.
  select
    count(*) filter (where b.stage <> 'Closed' and b.cancelled_at is null) as active_count,
    count(*)                                                              as total_count,
    max(b.pickup_at)                                                      as last_pickup_at
  from bookings b
  where b.client_id = c.id
) bk on true
-- Row predicate, inline (0048's rule for every SECURITY DEFINER masking view).
where auth_is_staff();

grant select on client_directory_v to authenticated;

comment on view client_directory_v is
  'One row per client with the directory aggregates (outstanding, deposit held, total paid, booking counts, last pickup). Query this for any client list — never re-aggregate invoices/deposits/bookings in a screen (Law 1/Law 2). Money columns are NULL for money-blind roles, never 0.';
