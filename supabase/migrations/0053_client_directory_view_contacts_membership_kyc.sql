-- ============================================================================
-- 0053_client_directory_view_contacts_membership_kyc.sql — 11 Aug 2026
--
-- Extends `client_directory_v` (0052) with the three things the Clients screen
-- needs that 0052 did not carry: the primary contact, the current membership
-- level, and KYC document counts. With these the screen's `ClientRecord` can be
-- built entirely from real rows — no field defaulted to a plausible-looking
-- value, which was the reason the swap was held back rather than shipped half
-- done.
--
-- MEMBERSHIP MAPS 1:1, NOTHING INVENTED
-- ------------------------------------
-- The `membership_level` enum is Academy | Creator | Cinematographer |
-- Production Alliance | Elite — character-for-character the app's own
-- `MembershipTier` union (src/data/clients.ts). Verified against pg_enum before
-- writing this, not assumed.
--
-- "CURRENT" MEMBERSHIP = the row that has not been superseded. `client_
-- memberships` is append-only history (Law 3: an upgrade supersedes, it does
-- not overwrite), so picking `max(created_at)` would be wrong the moment a
-- membership is back-dated. `superseded_at is null` is the actual predicate.
--
-- KYC IS DERIVED, AND ONE OF ITS FOUR STATES CANNOT OCCUR
-- ------------------------------------------------------
-- `client_document_status` has only Pending | Verified. The app's `KycStatus`
-- has four: Verified | Pending Review | Rejected | Not Submitted. Three are
-- derivable and are derived here:
--   no documents at all      -> Not Submitted
--   at least one Verified    -> Verified
--   documents, none verified -> Pending Review
-- **'Rejected' is not representable** — no rejected state exists in the schema
-- and no column records a rejection reason. It is therefore never produced,
-- rather than approximated by reusing 'Pending Review' (which would report a
-- rejected client as merely awaiting review — a materially different fact).
-- TODO(decision): whether client document rejection is a real workflow state.
-- If it is, it needs a `Rejected` enum member and a reason column before any
-- screen can honestly show it.
--
-- PII NOTE: contact name/designation/phone are exposed to every staff role,
-- the same as `clients.phone` already is through `clients_v`. The app gates
-- these at render via `canViewPII` (HIS v2.1 §4.2). There is no database-side
-- PII gate for `client_contacts` — `client_channel_identities` got one in 0039
-- and this table did not. That asymmetry is pre-existing and is NOT silently
-- widened here, but it is also not fixed here; flagged so it is visible.
-- ============================================================================

-- `create or replace view` cannot rename, retype, drop or REORDER an existing
-- column, and this body reorders 0052's — Postgres refuses with
--   ERROR: cannot change name of view column "approved_credit_limit" to "created_at"
-- so the view has to be dropped and rebuilt rather than replaced. Nothing
-- depends on it at this point in the sequence (0067's staff view comes later),
-- and the grant and comment below are re-issued after the create, so the drop
-- costs nothing. Without this, 0053 and 0054 both abort and no database can be
-- built from scratch (BUG-010, PLAN.md §4.42a).
drop view if exists client_directory_v;
create view client_directory_v as
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
  c.created_at,
  c.approved_credit_limit,
  c.payment_terms,

  -- Money aggregates: NULL for a money-blind session, never 0. A rendered
  -- "Rs 0" would be a false claim about a real balance (Foundation §8.3).
  case when auth_can_view_money() then coalesce(inv.outstanding_total, 0) else null end
    as outstanding_amount,
  case when auth_can_view_money() then coalesce(dep.held_total, 0) else null end
    as deposit_held_amount,
  case when auth_can_view_money() then coalesce(pay.paid_total, 0) else null end
    as total_paid_amount,

  coalesce(bk.active_count, 0)  as active_bookings_count,
  coalesce(bk.total_count, 0)   as total_bookings_count,
  bk.last_pickup_at,

  ct.full_name    as contact_name,
  ct.designation  as contact_designation,
  ct.phone        as contact_phone,

  mem.level       as membership_level,

  coalesce(doc.total_count, 0)    as kyc_docs_count,
  coalesce(doc.verified_count, 0) as kyc_verified_count
from clients_v c
left join lateral (
  select sum(i.outstanding_amount) as outstanding_total
  from invoices i
  where i.client_id = c.id
) inv on true
left join lateral (
  -- Held = received minus refunded minus applied. Law 5: a deposit is a
  -- liability and is deliberately NOT netted against anything owed.
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
  -- There is no 'Cancelled' booking_stage: the canonical six are Quote/Booked/
  -- Packed/On Rent/Returned/Closed, and cancelling is a named terminal action
  -- recorded in `cancelled_at` (Law 3), not a stage.
  select
    count(*) filter (where b.stage <> 'Closed' and b.cancelled_at is null) as active_count,
    count(*)                                                              as total_count,
    max(b.pickup_at)                                                      as last_pickup_at
  from bookings b
  where b.client_id = c.id
) bk on true
left join lateral (
  select k.full_name, k.designation, k.phone
  from client_contacts k
  where k.client_id = c.id and k.deactivated_at is null
  order by k.is_primary desc, k.created_at
  limit 1
) ct on true
left join lateral (
  select p.level
  from client_memberships m
  join membership_plans p on p.id = m.plan_id
  where m.client_id = c.id and m.superseded_at is null
  order by m.join_date desc
  limit 1
) mem on true
left join lateral (
  select
    count(*)                                        as total_count,
    count(*) filter (where d.status = 'Verified')   as verified_count
  from client_documents d
  where d.client_id = c.id and d.archived_at is null
) doc on true
where auth_is_staff();

grant select on client_directory_v to authenticated;

comment on view client_directory_v is
  'One row per client with everything a directory row needs: aggregates (outstanding, deposit held, total paid, booking counts, last pickup), primary contact, current membership level and KYC counts. Query this for any client list — never re-aggregate in a screen (Law 1/Law 2). Money columns are NULL for money-blind roles, never 0.';
