-- =============================================================================
-- 0061 — `bookings_deposit_v`: the one money column on `bookings`, masked.
--
-- ## Why this exists, and why it is a SEPARATE migration from 0062
--
-- Law 6 does not hold at the database today. Executed live on 16 Aug 2026 as
-- `warehouse@babinrentals.com` (`set local role authenticated` +
-- `app.current_user_id`), inside a rolled-back transaction:
--
--     auth_user_role()      -> 'Warehouse'
--     auth_can_view_money() -> false          <- the database KNOWS
--     sum(bookings.deposit_required) -> 13,65,000     <- and hands it over
--     sum(booking_lines.rate)        ->  6,64,695
--     sum(products.daily_rate)       ->  1,78,755
--
-- `payments` and `invoices` correctly return zero rows, because they are guarded
-- by row policies predicated on `auth_can_view_money()`. The four tables above
-- were guarded only by `0019`'s `revoke select (col) … from authenticated`,
-- **and that revoke has never done anything**: `authenticated` holds TABLE-level
-- SELECT, which covers every column, and a column-level revoke cannot subtract
-- from it. `pg_attribute.attacl` is null on all four tables — the revoke did not
-- even record itself. `0019:140-143` states the opposite in writing ("there is
-- no direct-table path left that could accidentally bypass the mask"). There
-- always was one, from the moment 0019 applied.
--
-- ## This file is the SAFE half. It is additive and breaks nothing.
--
-- `0062` carries the breaking half — the table-level revoke and the per-column
-- grants that finally arm the mask. Applying 0062 before the application reads
-- this view would take the app down: every `select` naming `deposit_required`
-- starts returning `42501` for **every** role, Owner included.
--
--     APPLY ORDER, and it is not optional:
--       1. this file (additive, zero risk)         <- apply any time
--       2. ship the call-site change to bookings_deposit_v
--       3. 0062 (breaking until step 2 has shipped) <- apply LAST
--
-- ## Why a two-column view instead of a full `bookings_v`
--
-- `bookings` has exactly ONE money column (`deposit_required` — confirmed
-- against `information_schema.columns`; nothing else on the table matches
-- amount/price/rate/total/cost/vat). A full mirror view would have to reproduce
-- all 28 columns AND keep PostgREST's embeds working — `bookings` is read with
-- `clients ( … )` and `booking_lines ( … )` embedded, and embed inference
-- through a view is fragile. A two-column view keyed by `id` sidesteps that
-- entirely: the caller keeps its existing `.from('bookings')` query with its
-- embeds untouched, and asks for the deposit separately only when it actually
-- wants one (`withDeposit`, already an opt-in flag at both call sites).
--
-- The masking expression is `0019`'s, unchanged, so there is one idiom for this
-- in the schema and not two.
-- =============================================================================

begin;

create or replace view bookings_deposit_v as
select
  b.id,
  case when auth_can_view_money() then b.deposit_required else null end as deposit_required
from bookings b;

comment on view bookings_deposit_v is
  'Law 6. `bookings.deposit_required` is the single money column on bookings; this view is the '
  'only path to it once 0062 revokes table-level SELECT. Money-blind roles (Warehouse, '
  'Technician, Driver, Client) read null, exactly as booking_lines_v does for rate. Two columns '
  'by design - the caller keeps querying bookings directly for everything else so PostgREST '
  'embeds are unaffected.';

/*
 * `security_invoker` matters here. Without it the view runs as its OWNER, which
 * would bypass the row policies on `bookings` and hand every booking's id to any
 * caller. With it, the view is subject to `bookings_select` (`auth_is_staff()`)
 * exactly as a direct read would be, and `auth_can_view_money()` then decides
 * whether the figure or a null comes back.
 *
 * Postgres 15+. The live project is 17.6 (checked), so this is available.
 */
alter view bookings_deposit_v set (security_invoker = on);

grant select on bookings_deposit_v to authenticated;

commit;
