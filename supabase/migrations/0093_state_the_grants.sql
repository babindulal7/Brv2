-- =============================================================================
-- 0093_state_the_grants.sql — 6 Sep 2026
--
-- **The migration set could not produce a database the application can use.**
--
-- ## What was wrong
--
-- After rebuilding from all migrations and signing in (token 200), every read
-- failed:
--
--   42501 — permission denied for table users
--   hint: GRANT SELECT ON public.users TO authenticated;
--
-- No migration in this repo grants a base-table privilege to `authenticated`.
-- The app's entire data access rested on the hosting platform's default
-- privileges — which live has, and a fresh database does not.
--
-- Worse than "no grants": on a hosted project the platform default is FULL DML
-- for anon/authenticated/service_role, and earlier migrations then REVOKE
-- selectively — DELETE for Law 3 ("nothing is deleted"), UPDATE for Law 4
-- (immutable payments, audit rows, logs), SELECT for Law 6 (money base tables
-- hidden behind `_v` views). In a scratch build those revokes ran against
-- nothing, so the obvious "grant all" here would silently undo all three laws.
--
-- ## What this states — the FINAL shape, derived from live on 6 Sep 2026
--
-- Read-only against the production project, 124 base tables, 26 views:
--
--   authenticated  SELECT   all but 10  (the Law 6 base tables + staff_auth_pins)
--                  INSERT   all but 1   (staff_auth_pins)
--                  UPDATE   all but 21  (Law 4 immutables, logs, staff_auth_pins)
--                  DELETE   only 10     (sync/external/portal scratch tables)
--   anon           SELECT   all but 1   (staff_auth_pins)
--                  INSERT   all but 2   (staff_auth_pins, and audit_events per 0091)
--                  UPDATE   as authenticated; DELETE as authenticated
--   service_role   everything
--   views          SELECT for all three
--   sequences      USAGE, SELECT, UPDATE for all three
--   functions      EXECUTE for all three, except 8 withheld from anon (the staff
--                  PIN / password-reset / audit-trigger set) and 2 from
--                  authenticated (the two trigger functions)
--
-- `anon`'s writes are kept as live has them. RLS is the control that governs
-- them (verified: every PUBLIC write policy checks `auth_user_role()`, which anon
-- cannot satisfy), and narrowing anon further is a separate decision, not this
-- file's. The one exception is `audit_events` INSERT, which `0091` closed after
-- an unauthenticated forgery — that revoke is re-asserted here so this file can
-- never re-open it, whatever order the two are applied in.
--
-- ## Convergent, not additive
--
-- Every privilege is REVOKED from all tables first and then GRANTED on exactly
-- the right set. That makes the file correct from any starting point: a no-op on
-- live (which already has this shape), the establishing step in a scratch build,
-- and a correction on a local stack someone over-granted by hand. It is safe to
-- re-run.
--
-- Default privileges are set to match live's, so tables and functions created by
-- LATER migrations inherit the platform baseline in a rebuild exactly as they do
-- on the hosted project — with later revokes then narrowing them, as now.
--
-- `check:rebuild` now asserts this shape after every rebuild, so a future
-- migration that quietly relies on a grant nobody stated will fail the gate
-- instead of failing the first person who restores from backup.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1 · Schema, sequences, and the default privileges live already has.
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant usage, select, update on all sequences in schema public to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant usage, select, update on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2 · Tables and views: revoke everything, then grant the shape.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;

-- SELECT — Law 6, and it is a COLUMN mask, not a table one.
--
-- ⚠ Corrected 6 Sep 2026, before this file ever reached live. It first revoked
-- SELECT on these ten tables outright, which is NOT what live does and would
-- have broken the application: `src/` reads `bookings` directly in 13 places,
-- `booking_lines` in 5, `products` in 3. Live revokes the TABLE and then grants
-- back every column except the money ones — so staff read a booking, and simply
-- cannot see `deposit_required`. That per-column list IS Law 6, restated below
-- exactly as live holds it.
grant select on all tables in schema public to anon, authenticated;
revoke select on
  accessories, booking_lines, booking_transport, bookings, daily_closings,
  maintenance_records, product_units, products, staff_auth_pins, vehicle_fuel_logs
from authenticated;
revoke select on staff_auth_pins from anon;

do $$
declare
  masked constant jsonb := jsonb_build_object(
    'accessories',         jsonb_build_array('replacement_cost'),
    'booking_lines',       jsonb_build_array('rate','discount_amount','supplier_cost','markup_amount'),
    'booking_transport',   jsonb_build_array('delivery_charge','fuel_charge'),
    'bookings',            jsonb_build_array('deposit_required'),
    'daily_closings',      jsonb_build_array('counted_cash','expected_cash','variance','variance_reason',
                                             'collected_cash','collected_bank','collected_card','collected_other',
                                             'receivables','deposits_held'),
    'maintenance_records', jsonb_build_array('cost'),
    'product_units',       jsonb_build_array('purchase_price','replacement_value'),
    'products',            jsonb_build_array('purchase_price','replacement_value','daily_rate','weekly_rate',
                                             'monthly_rate','hourly_rate','weekend_rate','deposit_percent','deposit_fixed'),
    'vehicle_fuel_logs',   jsonb_build_array('cost_amount')
  );
  tbl  text;
  cols text;
begin
  for tbl in select jsonb_object_keys(masked) loop
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
    from pg_attribute a
    where a.attrelid = format('public.%I', tbl)::regclass
      and a.attnum > 0 and not a.attisdropped
      and not (masked -> tbl) ? a.attname;

    if cols is null then
      raise exception 'POST-CONDITION FAILED (0093): % has no unmasked columns to grant.', tbl;
    end if;
    execute format('grant select (%s) on public.%I to authenticated', cols, tbl);
  end loop;
end $$;

-- INSERT — everything except the PIN table (and, for anon, the audit trail: 0091).
grant insert on all tables in schema public to anon, authenticated;
revoke insert on staff_auth_pins from anon, authenticated;
revoke insert on audit_events from anon;

-- UPDATE — Law 4: payments, reversals, audit rows and every log are immutable.
grant update on all tables in schema public to anon, authenticated;
revoke update on
  audit_events, automation_logs, backup_logs, booking_stage_transitions,
  client_merges, coupon_redemptions, deposit_movements, depreciation_logs,
  document_deliveries, expense_reversals, membership_limit_breaches, message_logs,
  override_records, payment_reversals, payments, scan_events,
  session_line_movements, staff_auth_pins, tax_ledgers, vehicle_fuel_logs,
  vehicle_trip_logs
from anon, authenticated;

-- DELETE — Law 3: nothing is deleted. The ten exceptions are sync scratch,
-- external mirrors and portal link requests, exactly as live holds them.
grant delete on
  containers, daily_closings, external_invoices, external_refs, portal_link_requests,
  sync_conflicts, sync_inbox, sync_log, sync_outbox, sync_state
to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3 · Functions. Grant all, then withhold the sets live withholds — resolved by
--     name through pg_proc so the signatures need not be restated here.
-- -----------------------------------------------------------------------------
grant execute on all functions in schema public to anon, authenticated, service_role;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('apply_booking_stage_transition', 'log_audit_event',
                        'record_password_reset_request', 'revoke_own_staff_pin',
                        'revoke_staff_pin_for', 'set_staff_pin', 'staff_pin_status',
                        'verify_staff_pin')
  loop
    execute format('revoke execute on function %s from anon', r.sig);
    if r.proname in ('apply_booking_stage_transition', 'log_audit_event') then
      execute format('revoke execute on function %s from authenticated', r.sig);
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 4 · Post-conditions — the shape, asserted by identity, plus 0091 intact.
-- -----------------------------------------------------------------------------
do $$
declare
  v_bad text[] := '{}';
  t     text;
begin
  -- Law 6 is a COLUMN mask: the table is closed, the money columns stay closed,
  -- and everything else must remain readable or the app cannot render a booking.
  foreach t in array array['bookings','booking_lines','products','product_units','daily_closings'] loop
    if has_table_privilege('authenticated', format('public.%I', t), 'SELECT') then
      v_bad := v_bad || format('authenticated can SELECT all of %s (Law 6)', t)::text;
    end if;
  end loop;
  if not has_column_privilege('authenticated', 'public.bookings', 'stage', 'SELECT') then
    v_bad := v_bad || 'authenticated cannot SELECT bookings.stage (the app reads it in 13 places)'::text;
  end if;
  if not has_column_privilege('authenticated', 'public.bookings', 'id', 'SELECT') then
    v_bad := v_bad || 'authenticated cannot SELECT bookings.id'::text;
  end if;
  if has_column_privilege('authenticated', 'public.bookings', 'deposit_required', 'SELECT') then
    v_bad := v_bad || 'authenticated can SELECT bookings.deposit_required (Law 6)'::text;
  end if;
  if not has_column_privilege('authenticated', 'public.products', 'name', 'SELECT') then
    v_bad := v_bad || 'authenticated cannot SELECT products.name'::text;
  end if;
  if has_column_privilege('authenticated', 'public.products', 'daily_rate', 'SELECT') then
    v_bad := v_bad || 'authenticated can SELECT products.daily_rate (Law 6)'::text;
  end if;
  -- … but must read the ordinary ones, and the views that mask the money.
  foreach t in array array['clients','users','invoices','payments','client_directory_v'] loop
    if not has_table_privilege('authenticated', format('public.%I', t), 'SELECT') then
      v_bad := v_bad || format('authenticated cannot SELECT %s', t)::text;
    end if;
  end loop;

  -- Law 3: no DELETE on business rows; DELETE on sync scratch.
  if has_table_privilege('authenticated', 'public.clients', 'DELETE') then
    v_bad := v_bad || 'authenticated can DELETE clients (Law 3)'::text;
  end if;
  if not has_table_privilege('authenticated', 'public.sync_log', 'DELETE') then
    v_bad := v_bad || 'authenticated cannot DELETE sync_log'::text;
  end if;

  -- Law 4: payments immutable; ordinary rows still editable.
  if has_table_privilege('authenticated', 'public.payments', 'UPDATE') then
    v_bad := v_bad || 'authenticated can UPDATE payments (Law 4)'::text;
  end if;
  if not has_table_privilege('authenticated', 'public.clients', 'UPDATE') then
    v_bad := v_bad || 'authenticated cannot UPDATE clients'::text;
  end if;

  -- 0091 must survive this file in either order.
  if has_table_privilege('anon', 'public.audit_events', 'INSERT') then
    v_bad := v_bad || 'anon can INSERT audit_events (0091 undone)'::text;
  end if;
  if not has_table_privilege('authenticated', 'public.audit_events', 'INSERT') then
    v_bad := v_bad || 'authenticated cannot INSERT audit_events'::text;
  end if;

  -- The RPCs the app lives on, and the ones anon must never reach.
  if not has_function_privilege('authenticated', 'next_document_number(text)', 'EXECUTE') then
    v_bad := v_bad || 'authenticated cannot EXECUTE next_document_number'::text;
  end if;
  if has_function_privilege('anon', 'verify_staff_pin(text)', 'EXECUTE') then
    v_bad := v_bad || 'anon can EXECUTE verify_staff_pin'::text;
  end if;

  if array_length(v_bad, 1) is not null then
    raise exception 'POST-CONDITION FAILED (0093): %', array_to_string(v_bad, '; ');
  end if;

  raise notice '0093 verified: grants match the live shape — Law 3/4/6 revokes intact, 0091 intact, RPCs reachable.';
end $$;

commit;
