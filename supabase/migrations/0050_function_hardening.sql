-- ============================================================================
-- 0050_function_hardening.sql — generated 11 Aug 2026
-- (written as 0045, renumbered on collision: a concurrent session had already
--  taken 0043-0047.)
--
-- WHY — part 1, mutable search_path (16 WARNs)
-- ---------------------------------------------
-- Supabase's advisor reports WARN `function_search_path_mutable` against
-- sixteen `public` functions. A function without a pinned `search_path`
-- resolves unqualified names using the *caller's* search_path at call time.
-- An attacker who can prepend a schema they control makes every unqualified
-- reference inside the function resolve to their object instead of ours.
--
-- That is not academic here, for two reasons specific to this schema:
--
--  1. `apply_booking_stage_transition()` and `log_audit_event()` are
--     SECURITY DEFINER (`prosecdef = true`, verified on the live database).
--     A hijacked name inside a definer function executes with the *owner's*
--     rights — the classic privilege-escalation shape.
--  2. `auth_user_role()` is the root of every RLS policy in the schema. It
--     reads `users` unqualified. Shadow `users` and you choose your own role,
--     which silently unlocks every policy in `0018`-`0042` at once — including
--     the money gates `auth_can_view_money()` and `auth_is_finance_or_admin()`
--     that Law "Warehouse sees no money" depends on. It is the single highest-
--     leverage function in the database and it was unpinned.
--
-- WHY `public, pg_temp` AND NOT `''`
-- -----------------------------------
-- The strictest remediation is `set search_path = ''` plus schema-qualifying
-- every reference in every body. That is not done here, and the reason is
-- deliberate rather than lazy: it requires rewriting sixteen function bodies,
-- and a rewrite that silently changes behaviour is a worse outcome than a
-- pinned path. Every one of these bodies references `public` objects
-- unqualified (tables such as `users`, `audit_events`, `invoices`; enum types
-- such as `system_role`, `booking_stage`, `audit_action`), so `''` would break
-- all sixteen immediately.
--
-- `set search_path = public, pg_temp` pins the path — which is exactly what
-- the lint asks for and what defeats the injection — while leaving each body
-- resolving the same objects it resolves today. Behaviour is unchanged; only
-- the caller's ability to influence resolution is removed.
--
-- `pg_temp` is listed LAST on purpose. When `pg_temp` is not named explicitly,
-- Postgres searches the temporary schema *first* for relations, which would
-- leave the shadowing hole half-open — a caller could still create a temp
-- table named `users`. Naming it last forces `public` to win.
--
-- One body was checked individually rather than by pattern: `log_audit_event()`
-- calls `gen_random_uuid()`. On PostgreSQL 17.6 (this instance) that is a
-- `pg_catalog` builtin, not the pgcrypto version, so it needs no `extensions`
-- entry on the path. No other flagged function references anything outside
-- `public` and `pg_catalog`.
--
-- WHY — part 2, btree_gist in public (1 WARN)
-- --------------------------------------------
-- The extension IS moved, and the checks that justified moving it are below.
-- The brief allowed for the possibility that it could not be moved safely; on
-- inspection it can, so it is.
--
-- Three exclusion constraints depend on it — `crew_bookings_no_double_booking`,
-- `crew_leaves_no_overlapping_leave`, `inventory_reservations_no_double_booking`
-- — via the `gist_uuid_ops` operator class that btree_gist supplies (three
-- indexes reference it). The move is nevertheless safe:
--
--   * `pg_extension.extrelocatable` is true for btree_gist, so
--     `alter extension ... set schema` is a supported operation on it.
--   * Index-to-opclass dependencies are recorded by OID, not by name. Moving
--     the opclass to another schema does not invalidate an index built on it;
--     nothing is reindexed and no constraint is dropped.
--   * Future `exclude using gist (uuid_col with =, ...)` DDL still resolves,
--     because a default operator class is looked up by (access method, type)
--     across the catalog rather than through `search_path`.
--   * The `extensions` schema already exists on this project (Supabase creates
--     it), so nothing new has to be granted.
--
-- The three constraints are re-verified as still present and valid at the foot
-- of this file. If that assertion ever fails, the move is the thing to revert.
--
-- NOT FIXED HERE — `auth_leaked_password_protection`
-- ---------------------------------------------------
-- The advisor also reports one WARN that no migration can close: leaked-
-- password protection (HaveIBeenPwned checking) is a Supabase Auth project
-- setting, toggled in the dashboard under Authentication -> Policies, not a
-- database object. Named here so the next reader does not go looking for the
-- SQL that turns it on. Logged in PLAN.md §6.32.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Part 1 — pin search_path on all sixteen flagged functions.
-- Signatures were generated from `pg_get_function_identity_arguments()` on the
-- live database rather than transcribed, so an overload cannot be missed or
-- mis-signed.
-- ---------------------------------------------------------------------------

-- RLS roots — highest leverage, listed first.
alter function public.auth_user_role()                     set search_path = public, pg_temp;
alter function public.auth_is_staff()                      set search_path = public, pg_temp;
alter function public.auth_can_view_money()                set search_path = public, pg_temp;
alter function public.auth_is_finance_or_admin()           set search_path = public, pg_temp;

-- SECURITY DEFINER functions — escalation risk if a name is hijacked.
alter function public.apply_booking_stage_transition()     set search_path = public, pg_temp;
alter function public.log_audit_event()                    set search_path = public, pg_temp;

-- Money / invoice triggers.
alter function public.sync_payment_to_invoice()            set search_path = public, pg_temp;
alter function public.recalculate_invoice_totals()         set search_path = public, pg_temp;
alter function public.reject_invoice_edit_after_issue()    set search_path = public, pg_temp;
alter function public.sync_deposit_balances()              set search_path = public, pg_temp;
alter function public.enforce_booking_discount_stacking()  set search_path = public, pg_temp;

-- Booking stage / validation helpers.
alter function public.validate_booking_gates()             set search_path = public, pg_temp;
alter function public.next_booking_stage(s booking_stage)  set search_path = public, pg_temp;
alter function public.retired_stage_to_canonical(old_stage text)
                                                           set search_path = public, pg_temp;

-- Sequencing and request context.
alter function public.next_document_number(p_sequence_key text)
                                                           set search_path = public, pg_temp;
alter function public.set_request_context()                set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- Part 2 — move btree_gist out of public.
-- ---------------------------------------------------------------------------
alter extension btree_gist set schema extensions;

-- ---------------------------------------------------------------------------
-- Post-conditions, asserted rather than assumed.
-- ---------------------------------------------------------------------------
do $$
declare
  unpinned text[];
  ext_schema text;
  missing text[];
begin
  -- Check 1 — no flagged function is left with a mutable search_path.
  select array_agg(p.proname order by p.proname) into unpinned
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'enforce_booking_discount_stacking','sync_payment_to_invoice',
       'reject_invoice_edit_after_issue','next_document_number',
       'recalculate_invoice_totals','sync_deposit_balances',
       'validate_booking_gates','auth_user_role','auth_is_finance_or_admin',
       'auth_is_staff','auth_can_view_money','retired_stage_to_canonical',
       'next_booking_stage','set_request_context','log_audit_event',
       'apply_booking_stage_transition')
     and (p.proconfig is null
          or not exists (select 1 from unnest(p.proconfig) c
                          where c like 'search\_path=%'));

  if unpinned is not null then
    raise exception '0050 post-condition failed: still-mutable search_path on: %',
      array_to_string(unpinned, ', ');
  end if;

  -- Check 2 — btree_gist actually left public.
  select e.extnamespace::regnamespace::text into ext_schema
    from pg_extension e where e.extname = 'btree_gist';

  if ext_schema is distinct from 'extensions' then
    raise exception '0050 post-condition failed: btree_gist is in schema %, expected extensions',
      coalesce(ext_schema, '<not installed>');
  end if;

  -- Check 3 — the three exclusion constraints that depend on it survived the
  -- move, and are still valid. This is the assertion that would catch a bad
  -- relocation; if it ever fires, revert the `alter extension` above.
  select array_agg(x order by x) into missing
    from unnest(array[
      'crew_bookings_no_double_booking',
      'crew_leaves_no_overlapping_leave',
      'inventory_reservations_no_double_booking']) as x
   where not exists (
     select 1 from pg_constraint c
      where c.conname = x and c.contype = 'x' and c.convalidated
   );

  if missing is not null then
    raise exception '0050 post-condition failed: exclusion constraint(s) lost or invalidated by the btree_gist move: %',
      array_to_string(missing, ', ');
  end if;

  raise notice '0050 OK — 16 functions pinned, btree_gist moved to extensions, 3 exclusion constraints intact';
end $$;
