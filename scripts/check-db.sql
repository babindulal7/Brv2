-- =============================================================================
-- check-db.sql — the questions PostgREST cannot answer.
--
-- Paste into the Supabase SQL editor and run. Read-only throughout: every
-- statement is a SELECT, nothing is created, altered or advanced. In
-- particular `next_document_number()` is NOT called anywhere below, because
-- calling it would advance a counter and change the thing being measured.
--
-- Run this BEFORE browsing the app. `scripts/check-db.mjs` tells you what the
-- app's own client can see; this tells you what is actually there. When they
-- disagree, the difference is RLS, and that is worth knowing precisely.
-- =============================================================================


-- 1 ──────────────────────────────────────────────────────────────────────────
-- WHICH MIGRATIONS ARE APPLIED
--
-- The first question, and the one that explains most surprises. Four files are
-- known-unapplied as of 15 Aug: 0047 (seed corpus), 0055 (ruled identifiers),
-- 0058 (late-fee rank), 0059 (create_booking). Apply order is NOT file order —
-- 0055 must go before 0047.
--
-- This is also the query to run before renaming the duplicate 0057/0058 files:
-- renaming an APPLIED migration makes Supabase treat it as new.

select version, name
from supabase_migrations.schema_migrations
order by version;


-- 2 ──────────────────────────────────────────────────────────────────────────
-- IS THERE ANY DATA AT ALL
--
-- A page that renders "No bookings" is correct when this returns zero. Check
-- here before concluding a screen is broken.

select 'bookings' as table_name, count(*) from bookings
union all select 'booking_lines', count(*) from booking_lines
union all select 'booking_line_units', count(*) from booking_line_units
union all select 'booking_discounts', count(*) from booking_discounts
union all select 'clients', count(*) from clients
union all select 'products', count(*) from products
union all select 'invoices', count(*) from invoices
union all select 'payments', count(*) from payments
union all select 'security_deposits', count(*) from security_deposits
union all select 'expenses', count(*) from expenses
union all select 'users', count(*) from users
union all select 'branches', count(*) from branches
order by 1;


-- 3 ──────────────────────────────────────────────────────────────────────────
-- DOES YOUR SESSION HAVE AN IDENTITY
--
-- `auth_user_role()` decides every policy in the app. If this returns 'Client'
-- you are an unidentified session — the safe default, and the reason a screen
-- can look empty while the table is full. `users` needs a row whose id is your
-- auth.uid() (migration 0058_staff_row_for_the_current_owner_identity).

select
  auth.uid()          as auth_uid,
  auth_user_role()    as resolved_role,
  auth_is_staff()     as is_staff,
  auth_can_view_money() as can_view_money;


-- 4 ──────────────────────────────────────────────────────────────────────────
-- ARE THE VIEWS THE APP SELECTS FROM PRESENT
--
-- `src/lib/queries/` selects from views, not base tables, in several places.
-- A missing view is a screen that errors rather than empties.

select table_name,
       case when table_name is null then 'MISSING' else 'present' end as status
from (values
  ('clients_v'), ('client_directory_v'), ('membership_plans_v'),
  ('products_v'), ('product_units_v')
) as wanted(name)
left join information_schema.views v
  on v.table_schema = 'public' and v.table_name = wanted.name;


-- 5 ──────────────────────────────────────────────────────────────────────────
-- IS create_booking() THERE, AND IS IT SECURITY INVOKER
--
-- `prosecdef` must be FALSE. A `security definer` create_booking would bypass
-- RLS on all five of its inserts — including booking_discounts_money_blind,
-- which is what stops a Warehouse session attaching a discount.

select p.proname,
       p.prosecdef as is_security_definer,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_booking', 'next_document_number', 'auth_user_role', 'auth_can_view_money')
order by p.proname;


-- 6 ──────────────────────────────────────────────────────────────────────────
-- WHICH IDENTIFIER FORMAT IS LIVE
--
-- The single most confusing possible mismatch. Before 0055 the booking format
-- is `^BK-[0-9]{4}-[0-9]{4}$`; after it, `^B-[0-9]+$`. `src/data/booking.ts`
-- and the whole app already read `B-715`, so if this still shows the BK form,
-- 0055 is unapplied and any booking the app writes will be rejected.

select rel.relname as table_name,
       con.conname as constraint_name,
       pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public'
  and con.conname like '%_format'
order by rel.relname;


-- 7 ──────────────────────────────────────────────────────────────────────────
-- ANY TABLE WITH RLS ON AND NO POLICY IS DENY-ALL TO EVERYONE
--
-- Three are expected and deliberate: portal_users, portal_sessions,
-- portal_auth_challenges — the Client Portal auth surface, held shut until the
-- session→client_id binding is ruled. Anything ELSE in this list is a bug, and
-- the screen that reads it will look permanently empty.

select c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity
  and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
order by 1;


-- 8 ──────────────────────────────────────────────────────────────────────────
-- IS THE STAGE ENUM STILL THE RETIRED TWELVE
--
-- `src/lib/workflow.ts` encodes the canonical six (Quote · Booked · Packed ·
-- On Rent · Returned · Closed). If this returns twelve, the app and the
-- database disagree about what a booking stage is, and the collapse migration
-- has not been written.

select enumlabel as stage, enumsortorder
from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'booking_stage'
order by enumsortorder;


-- 9 ──────────────────────────────────────────────────────────────────────────
-- THE NUMBER SEQUENCES, AND WHERE THEIR COUNTERS STAND
--
-- Read-only. A counter far ahead of the highest id actually present is the
-- known open gap, not a fault. Lowering one would mint an identifier that
-- already exists against a unique column — which is why no UI edits these.

select sequence_key, prefix, current_year, current_value, padding
from number_sequences
order by sequence_key;
