-- =============================================================================
-- 0077 — Law 6: arm the mask on the four tables I5 found unarmed.
--        ✅ APPLIED to the live project (sxguwvgoserhdolewibb) on 1 Sep 2026
--        with the owner's explicit approval ("ok do all") — recorded in
--        supabase_migrations.schema_migrations as 20260901050002. Pre-flighted
--        in begin/rollback first (post-conditions passed, nothing persisted),
--        then applied; afterwards all 12 role-simulated probes returned as
--        intended: 4× 42501 on the money columns, operational columns readable,
--        all four _v views serving. ⚠ As ever, this header is not evidence —
--        verify with has_table_privilege / pg_views.
--
-- Closes the four latent Law 6 breaches recorded in
-- `docs/booqable/I5-RLS-MONEY-VERIFICATION.md` §3 (31 Aug 2026, live database,
-- read-only). For each of these four, all three conditions held at once:
-- `authenticated` holds SELECT on the base table, the row policy evaluates
-- `true` for a money-blind role, and the base-table money columns are raw —
-- the `case when auth_can_view_money()` mask exists only in the `_v` view,
-- which the role is not obliged to use.
--
--   accessories          replacement_cost                  → Warehouse
--   booking_transport    delivery_charge, fuel_charge      → Warehouse, Driver
--   maintenance_records  cost                              → Warehouse
--   vehicle_fuel_logs    cost_amount                       → Warehouse, Driver
--
-- Nothing leaks today only because all four tables are empty. This is a latent
-- breach that activates on the first row written, not a theoretical one.
--
--
-- ## ⚠ THE ONE-LINE FIX IN I5 §3 DOES NOT WORK — READ THIS FIRST
--
-- I5 §3 proposes `revoke select (<col>) on <table> from authenticated`, one
-- line per table, and calls it "the mechanism 0062 already established". That
-- reads 0062 backwards. 0062's whole subject is that this statement is inert:
--
--     "`0019` tried to mask money with `revoke select (col) … from
--      authenticated` and it has never worked, because `authenticated` also
--      holds TABLE-level SELECT and a table grant covers every column. A
--      column revoke cannot subtract from a table grant; PostgreSQL does not
--      even record it (`pg_attribute.attacl` is null on all four tables)."
--
-- 0048's header carries the same finding against the live database
-- (`pg_class.relacl` = `authenticated=arwDxtm/postgres`; the `r` is table-wide
-- SELECT). Supabase grants table-level SELECT on every table in `public` to
-- `authenticated` at project creation, so this is the standing condition, not
-- an accident of one migration.
--
-- Two of I5's four proposed lines have in fact ALREADY BEEN ISSUED, and the
-- live catalogue is the proof they did nothing:
--
--     0035:38  revoke select (replacement_cost) on accessories       …
--     0036:151 revoke select (cost_amount)      on vehicle_fuel_logs …
--
-- Both ran when 0035/0036 applied. Re-issuing them would be a no-op for the
-- second time. Read off the live project 1 Sep 2026, read-only:
--
--     table                 has_table_privilege(authenticated,'SELECT')   cols with attacl
--     accessories                          true                                  0
--     booking_transport                    true                                  0
--     maintenance_records                  true                                  0
--     vehicle_fuel_logs                    true                                  0
--     bookings            (0062 applied)   false                                27
--     products            (0062 applied)   false                                35
--
-- The top four are the breach, stated exactly. `attacl = 0` on every column of
-- all four is the column revoke leaving no trace whatsoever — PostgreSQL did
-- not record it, because there was no column ACL to subtract from. The bottom
-- two are the same four-line problem already fixed the right way: 0062 dropped
-- the table grant and handed back 27 and 35 named columns, and `table_select`
-- is now false on both. This file does to the four what 0062 did to those.
--
-- The mechanism 0062 ACTUALLY established is the reverse of 0019's, and it is
-- what this file performs:
--
--     revoke select on <table> from authenticated;                 -- drop the blanket
--     grant  select (<every non-money column>) to authenticated;   -- hand back the rest
--
-- After this, the only path to a money column on these four tables is the
-- matching `_v` view, which re-applies `auth_can_view_money()` per role.
--
--
-- ## Two of the four `_v` views did not exist. This file creates them.
--
-- I5 §3 says "each table has a masked `_v` sibling (`accessories_v`,
-- `vehicle_fuel_logs_v`, …)". The ellipsis is doing work it cannot do:
--
--   · `accessories_v`         — exists. 0035:40, re-emitted with a row
--                               predicate by 0048:107.
--   · `vehicle_fuel_logs_v`   — exists. 0036:152, re-emitted by 0048:717.
--   · `booking_transport_v`   — DOES NOT EXIST. Never written, in any file.
--                               `src/lib/bookingQuery.ts:466` independently
--                               records this: "it is UNMASKED money on a base
--                               table: no `booking_transport_v`".
--   · `maintenance_records_v` — DOES NOT EXIST. Never written, in any file.
--
-- A bare revoke on those two would leave every money-visible role — Owner,
-- Admin, Coordinator, Accounts — with no path at all to `delivery_charge`,
-- `fuel_charge` or `cost`, rather than a masked one. So this file creates both
-- views in the same migration as the revoke, which is the 0019 / 0035 / 0036
-- convention (revoke and view always ship together, never apart).
--
--
-- ## The revoke does not break the two views that already exist
--
-- Checked, not assumed. A view's body runs with its OWNER's privileges unless
-- the view carries `security_invoker`, in which case it runs with the caller's
-- column grants — which is exactly what a revoke removes. That is the failure
-- 0065 had to repair on `bookings_deposit_v` after 0061 set the reloption.
--
-- Confirmed twice, from both directions. In the tree, `security_invoker`
-- appears in five files (0019, 0048, 0061, 0065, 0067); the only view ever SET
-- to invoker rights is `bookings_deposit_v` (0061:78), which 0065:242 resets,
-- and neither `accessories_v` nor `vehicle_fuel_logs_v` is named in any of the
-- five. On the live project, 1 Sep 2026, `pg_class.reloptions` agrees:
--
--     view                  reloptions   ncols   has WHERE
--     accessories_v          (none)        12      true
--     vehicle_fuel_logs_v    (none)        11      true
--     booking_transport_v    — does not exist —
--     maintenance_records_v  — does not exist —
--
-- No reloption means definer rights: the view owner reads the base table, the
-- caller needs no column grant, and the revoke below cannot reach them. The
-- two absent rows are the same query confirming §"Two of the four `_v` views
-- did not exist" above against the catalogue rather than against a grep.
--
-- The two new views are created without the reloption for the same reason.
-- ⚠ Do NOT set `security_invoker` on any of the four — under this migration
-- that re-applies the caller's revoked column grants and kills the one
-- sanctioned read path for every role, Owner included.
--
--
-- ## No application code has to move to a view first
--
-- Grepped `src/` for both the four table names and the five money column
-- names. There is no call site to break:
--
--   · `.from('accessories' | 'booking_transport' | 'maintenance_records' |
--     'vehicle_fuel_logs')` — zero matches, single- or double-quoted.
--   · The column-name hits are all in `src/types/supabase.ts` (generated
--     types, not queries), one forbidden-word list in
--     `src/actions/rentals/__tests__/floorVerbs.test.ts:475`, and prose
--     comments in `bookingQuery.ts` / `BookingDetail.tsx` that state these
--     tables have no query path yet.
--   · No SQL function or trigger reads them either: the only `from <table>`
--     occurrences across every migration in the tree are the two masking-view bodies in
--     0035 and 0036.
--
-- This makes 0077 materially cheaper than 0062, which needed a 74-call-site
-- audit (AUDIT_0062.md) and two schema-side prerequisites (0065) before it was
-- safe. Nothing reads these four tables, so nothing can regress.
--
-- ⚠ The obligation this creates is forward-looking. PostgREST issues
-- `RETURNING` on insert/update, and an unqualified one names every column — so
-- the FIRST write path built against any of these four tables must either send
-- `Prefer: return=minimal` or name only granted columns. Same hazard 0065
-- documented ("old clients issue RETURNING * the instant the grants change");
-- here it is a future obligation rather than a live blocker, purely because no
-- such write path exists yet.
--
--
-- ## The row predicates below were read from `pg_policies` on live, not inferred
--
-- Same discipline 0048 used ("read from `pg_policies` on the live database
-- rather than inferred from the migration that wrote it"). All six policies on
-- the four tables, 1 Sep 2026:
--
--     accessories_all               ALL      Owner, Admin, Manager, Warehouse
--     booking_transport_driver_read SELECT   Owner, Admin, Coordinator, Warehouse, Driver
--     booking_transport_insert_ops  INSERT   (with-check only)
--     booking_transport_update_ops  UPDATE   auth_is_finance_or_admin()
--     maintenance_records_select    SELECT   auth_is_staff()
--     maintenance_records_all       ALL      Owner, Admin, Manager, Warehouse
--     vehicle_fuel_logs_all         ALL      Owner, Admin, Manager, Coordinator, Warehouse, Driver
--
-- All PERMISSIVE. The two new views take the effective SELECT gate from this
-- table and nothing else.
--
--   · `booking_transport` — the only SELECT policy is
--     `booking_transport_driver_read` (0014:141, created inside a `do $$` loop
--     over three table names): Owner, Admin, Coordinator, Warehouse, Driver.
--     0054:144/150 add INSERT and UPDATE policies only, which do not gate a
--     read. NOTE: Manager and Accounts are NOT on that list, so neither can
--     read a transport row at all today — Accounts being a money-visible role
--     that still cannot reach `delivery_charge`. That is pre-existing and
--     unchanged here; `booking_transport_v` mirrors the policy verbatim rather
--     than quietly widening it. Flagged for a ruling, not fixed in a Law 6
--     file.
--   · `maintenance_records` — `maintenance_records_select` (0020:107) is
--     `auth_is_staff()`, and `maintenance_records_all` (0018:143) is
--     Owner/Admin/Manager/Warehouse. The two are PERMISSIVE and therefore OR
--     together, so `auth_is_staff()` is the effective read gate. Same
--     reasoning 0048's header states for its eighteen `auth_is_staff()` views.
--
--
-- ## Checked and deliberately NOT changed
--
--   · `vehicle_fuel_logs_v`'s row predicate is BROADER than its table's
--     policy. 0048's header says this view should carry
--     Owner/Admin/Manager/Coordinator/Warehouse/Driver — the
--     `vehicle_fuel_logs_all` list — but the SQL it shipped (0048:731) reads
--     `where auth_is_staff()`, which also admits Accounts and Technician. Not
--     touched here: this migration does not widen it, and narrowing a definer
--     view's row gate is a row-visibility decision, not a Law 6 one. But it
--     becomes the sanctioned gate the moment the base table closes, so it
--     needs its own ruling. Logged, not silently fixed.
--   · `anon` keeps its table-level SELECT, matching 0062, which revoked from
--     `authenticated` only. `anon` resolves through `auth_user_role()` to
--     `Client` (the unmatched-user fallback), and all four policies exclude
--     Client, so RLS returns it zero rows. The money columns are therefore
--     unreachable for `anon` — but by a ROW denial, not a grant denial. If any
--     of these four policies is ever widened to Client, this needs revisiting
--     in the same change.
--
--
-- ## Apply-order and pre-conditions
--
-- ⚠ THE NUMBER. This file was first written as 0075 and renumbered to 0077
-- after reading the live ledger. Do not renumber it back down. As of 1 Sep
-- 2026, `supabase_migrations.schema_migrations` shows **live at 0076**, not
-- 0070:
--
--     …0065_arm_0062_prerequisites          28 Aug 07:05
--     …0062_law6_column_grants_arm_the_mask  28 Aug 07:06   ← 0065 BEFORE 0062,
--                                                             as 0065's header requires
--     …0070_create_booking_parent_line_linkage
--     …0071_create_booking_units_at_creation 31 Aug 11:57
--     …0072_portal_email_binding_policies    31 Aug 12:01
--     …0074_drop_discount_gate               31 Aug 12:42
--     …0075_drop_invoice_lines_discount_gate 31 Aug 13:19
--     …0076_seed_operational_stage_corpus    31 Aug 14:12
--
-- So 0071 / 0072 / 0074 are NOT awaiting approval — they are applied, along
-- with a 0075 and a 0076 this file's author had not seen. 0075 and 0076 were
-- both taken while this file was being written. 0077 is the next free number.
--
-- ⚠ `0076_booking_line_units_release.sql` is on disk, does NOT appear in the
-- ledger, and collides with the applied `0076_seed_operational_stage_corpus`.
-- Another session's file; not touched here, but it needs renumbering before it
-- can apply. Re-read the ledger before trusting any number in this directory —
-- it moved twice during this session alone.
--
-- ## 0062 is applied, so this pattern is deployed and proven, not novel
--
-- Confirmed from the ledger above AND from the catalogue: `bookings` and
-- `products` both show `has_table_privilege(authenticated,'SELECT') = false`
-- with 27 and 35 column-level ACLs — 0062's exact design, live and working.
-- That is what makes 0077 a repeat of a proven change rather than a first
-- attempt. Note that 0062's own file header still reads ⛔ DO NOT APPLY; it is
-- stale, and the ledger is the authority. Do not diagnose from headers here.
--
-- 0077 has no ordering dependency on 0071, 0072, 0074, 0075 or 0076 — disjoint
-- tables.
--
-- ⚠ MAINTENANCE OBLIGATION, same as 0062: a column added to any of these four
-- tables is UNREADABLE until it is added to the grant list below. That is the
-- fail-closed direction and it is deliberate, but `alter table … add column`
-- is now a two-file change for these four tables. Counts are stated per table
-- so a future addition shows up as a post-condition mismatch rather than as a
-- silently ungranted column.
--
-- Column lists were first read from the `create table` blocks — accessories
-- 0004:298, maintenance_records 0004:513, booking_transport 0002:373,
-- vehicle_fuel_logs 0009:169 — then checked against `pg_attribute` on the live
-- project (1 Sep 2026, read-only), same provenance 0062 used. Names, order and
-- counts match exactly:
--
--     accessories          12 columns   id, client_uuid, product_id, name, quantity,
--                                       is_mandatory, replacement_cost, sort_order,
--                                       created_at, created_by, updated_at, updated_by
--     booking_transport    14 columns
--     maintenance_records  21 columns
--     vehicle_fuel_logs    11 columns
--
-- corroborated for two of them by 0048's own asserted view counts
-- (`accessories_v`: 12, `vehicle_fuel_logs_v`: 11). The post-conditions block
-- below re-checks every count at apply time regardless, since the live read
-- and the apply are separated in time.
--
-- All four tables were still empty on 1 Sep 2026 (0 rows each), so applying
-- this changes no user-visible figure anywhere — it only closes the door
-- before the first row arrives.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · accessories — 12 columns, 11 granted, 1 masked (→ accessories_v)
--
-- The `revoke select (replacement_cost)` at 0035:38 stays in the tree as
-- history; it is superseded, not repeated. This is the statement that makes it
-- real.
-- ---------------------------------------------------------------------------
revoke select on accessories from authenticated;
grant select (
  id, client_uuid, product_id, name, quantity, is_mandatory,
  sort_order, created_at, created_by, updated_at, updated_by
) on accessories to authenticated;

-- ---------------------------------------------------------------------------
-- 2 · booking_transport — 14 columns, 12 granted, 2 masked
--     (→ booking_transport_v, created in §5 below)
--
-- `zero_charge_override_by` / `_reason` stay granted deliberately. They are the
-- audit trail for a Customer-Pickup booking carrying a non-zero charge
-- (0002:383) — Coordinator and Warehouse need to see THAT an override was taken
-- and by whom, which is not the same as seeing what it was worth. Same split
-- 0035 made on `late_fee_findings` (band/overage visible, amount masked).
-- ---------------------------------------------------------------------------
revoke select on booking_transport from authenticated;
grant select (
  id, client_uuid, booking_id, vehicle, number_plate, driver_id,
  driver_contact, zero_charge_override_by, zero_charge_override_reason,
  special_instructions, created_at, created_by
) on booking_transport to authenticated;

-- ---------------------------------------------------------------------------
-- 3 · maintenance_records — 21 columns, 20 granted, 1 masked
--     (→ maintenance_records_v, created in §5 below)
--
-- `vendor_name` stays granted: it is who did the work, not what it cost.
-- Warehouse runs maintenance operationally (`maintenance_records_all`,
-- 0018:143) and needs findings/actions_taken/status/scheduled_date to do it.
-- ---------------------------------------------------------------------------
revoke select on maintenance_records from authenticated;
grant select (
  id, client_uuid, record_no, product_unit_id, maintenance_type, priority,
  status, description, findings, actions_taken, vendor_name, scheduled_date,
  started_at, completed_at, performed_by, approved_by, created_at, created_by,
  updated_at, updated_by
) on maintenance_records to authenticated;

-- ---------------------------------------------------------------------------
-- 4 · vehicle_fuel_logs — 11 columns, 10 granted, 1 masked
--     (→ vehicle_fuel_logs_v)
--
-- `odometer` and `fuel_liters` stay granted — they are the operational record a
-- Driver logs and a Coordinator reconciles. Only the rupee figure goes.
-- `receipt_url` also stays: the file itself is governed by storage policy, not
-- by this grant, and blanking the link would hide the evidence rather than the
-- amount. Flagged because a receipt image obviously SHOWS the amount — that is
-- a storage-bucket question (I5 §4 territory), and pretending a column grant
-- answers it would be false comfort.
-- ---------------------------------------------------------------------------
revoke select on vehicle_fuel_logs from authenticated;
grant select (
  id, client_uuid, vehicle_id, fuel_date, odometer, fuel_liters,
  receipt_url, branch_id, recorded_by, created_at
) on vehicle_fuel_logs to authenticated;

-- ---------------------------------------------------------------------------
-- 5 · The two masking views that were never written
--
-- Column names, order and types match the base table exactly, so a future query
-- can swap the table name for the view name with no other change (0019's rule).
-- Definer rights + the row predicate stated EXPLICITLY in the view body — the
-- 0048/0065 pattern, since a definer view bypasses the base table's row
-- policies as well as its column grants and would otherwise have no row gate at
-- all.
-- ---------------------------------------------------------------------------

create or replace view public.booking_transport_v as
select
  id,
  client_uuid,
  booking_id,
  vehicle,
  number_plate,
  driver_id,
  driver_contact,
  case when auth_can_view_money() then delivery_charge else null end as delivery_charge,
  case when auth_can_view_money() then fuel_charge else null end as fuel_charge,
  zero_charge_override_by,
  zero_charge_override_reason,
  special_instructions,
  created_at,
  created_by
from booking_transport
where auth_user_role() = any (array['Owner','Admin','Coordinator','Warehouse','Driver']::system_role[]);

grant select on public.booking_transport_v to authenticated;

comment on view public.booking_transport_v is
  'Law 6. The only path to booking_transport.delivery_charge / fuel_charge once '
  '0077 arms the mask -- see products_v (0019) for the pattern. Definer rights + '
  'explicit row predicate (0048): the role list mirrors booking_transport_driver_read '
  '(0014) verbatim, which notably excludes Manager AND Accounts. Do NOT set '
  'security_invoker on this view - that re-applies the caller''s revoked column '
  'grants and kills the read for every role. zero_charge_override_by/_reason stay '
  'visible: the floor sees THAT an override was taken, never what it was worth.';

create or replace view public.maintenance_records_v as
select
  id,
  client_uuid,
  record_no,
  product_unit_id,
  maintenance_type,
  priority,
  status,
  description,
  findings,
  actions_taken,
  vendor_name,
  case when auth_can_view_money() then cost else null end as cost,
  scheduled_date,
  started_at,
  completed_at,
  performed_by,
  approved_by,
  created_at,
  created_by,
  updated_at,
  updated_by
from maintenance_records
where auth_is_staff();

grant select on public.maintenance_records_v to authenticated;

comment on view public.maintenance_records_v is
  'Law 6. The only path to maintenance_records.cost once 0077 arms the mask -- see '
  'products_v (0019) for the pattern. Definer rights + explicit row predicate '
  '(0048): auth_is_staff() is the effective read gate, since maintenance_records_select '
  '(0020) and maintenance_records_all (0018) are PERMISSIVE and OR together. Do NOT '
  'set security_invoker on this view. Warehouse keeps findings/actions_taken/status '
  '-- it runs the maintenance; it just never sees the bill.';

-- ---------------------------------------------------------------------------
-- 6 · Post-conditions — refuse to leave this half-landed
--
-- Four independent checks, because every one of them has a real failure mode
-- this thread has already hit at least once:
--
--   1. The blanket table grant is actually gone. This is the check 0019/0035/
--      0036 never had, and its absence is why three migrations shipped a mask
--      that was inert for three weeks.
--   2. Each money column is unreachable AND a neighbouring operational column
--      is still readable. Catches an over-broad revoke that takes the floor's
--      own screens down with the money.
--   3. The base-table column counts match what the grant lists were written
--      against. A column added since this file was drafted shows up here rather
--      than as a silent 42501 at runtime.
--   4. All four views exist, carry a WHERE clause, and are definer-rights. The
--      missing-WHERE case is 0048's stated failure mode; the invoker case is
--      0061's, which 0065 had to repair.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tables constant text[] := array[
    'accessories', 'booking_transport', 'maintenance_records', 'vehicle_fuel_logs'
  ];
  v_money constant jsonb := '{
    "accessories":         ["replacement_cost"],
    "booking_transport":   ["delivery_charge", "fuel_charge"],
    "maintenance_records": ["cost"],
    "vehicle_fuel_logs":   ["cost_amount"]
  }'::jsonb;
  v_keep constant jsonb := '{
    "accessories":         "name",
    "booking_transport":   "number_plate",
    "maintenance_records": "status",
    "vehicle_fuel_logs":   "fuel_liters"
  }'::jsonb;
  v_counts constant jsonb := '{
    "accessories": 12, "booking_transport": 14,
    "maintenance_records": 21, "vehicle_fuel_logs": 11
  }'::jsonb;
  v_views constant text[] := array[
    'accessories_v', 'booking_transport_v', 'maintenance_records_v', 'vehicle_fuel_logs_v'
  ];
  t text;
  c text;
  v_actual int;
begin
  foreach t in array v_tables loop
    -- 1 · the blanket is gone
    if has_table_privilege('authenticated', format('public.%I', t), 'SELECT') then
      raise exception
        '0077 post-condition failed: authenticated still holds TABLE-level SELECT on public.% -- the mask is inert, exactly as in 0019/0035/0036.', t;
    end if;

    -- 2a · every money column is unreachable
    for c in select jsonb_array_elements_text(v_money -> t) loop
      if has_column_privilege('authenticated', format('public.%I', t), c, 'SELECT') then
        raise exception
          '0077 post-condition failed: authenticated can still read %.% -- Law 6 is not armed on this column.', t, c;
      end if;
    end loop;

    -- 2b · the operational half survived
    if not has_column_privilege('authenticated', format('public.%I', t), v_keep ->> t, 'SELECT') then
      raise exception
        '0077 post-condition failed: %.% is no longer readable -- the revoke was over-broad and has taken an operational column with it.', t, v_keep ->> t;
    end if;

    -- 3 · the column list this file was written against still holds
    select count(*) into v_actual
      from information_schema.columns
     where table_schema = 'public' and table_name = t;
    if v_actual is distinct from (v_counts ->> t)::int then
      raise exception
        '0077 post-condition failed: public.% has % columns, expected % -- a column was added or dropped since this file was drafted and is now ungranted (fail-closed). Update the grant list above.', t, v_actual, (v_counts ->> t)::int;
    end if;
  end loop;

  -- 4 · every masking view is present, row-gated, and definer-rights
  foreach t in array v_views loop
    if not exists (
      select 1 from pg_views where schemaname = 'public' and viewname = t
    ) then
      raise exception '0077 post-condition failed: view public.% does not exist -- the money columns have no sanctioned read path at all.', t;
    end if;

    if not exists (
      select 1 from pg_views
       where schemaname = 'public' and viewname = t and definition ilike '%where%'
    ) then
      raise exception '0077 post-condition failed: view public.% has no WHERE clause -- definer rights with no row gate returns every row to every role (0048''s stated failure mode).', t;
    end if;

    if exists (
      select 1 from pg_class k join pg_namespace n on n.oid = k.relnamespace
       where n.nspname = 'public' and k.relname = t
         and coalesce(k.reloptions, '{}') && array['security_invoker=on', 'security_invoker=true']
    ) then
      raise exception '0077 post-condition failed: view public.% is security_invoker -- under this migration the caller''s revoked column grants apply and the read dies for every role (0061''s bug, repaired by 0065).', t;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7 · The check that proves it, by hand. Run AFTER applying, in a transaction
--     that rolls back, exactly as I5 §1 did — the MCP/service connection
--     bypasses RLS and proves nothing on its own.
--
--     begin;
--     set local role authenticated;
--     select set_config('app.current_user_id', '<a Warehouse user uuid>', true);
--
--     select replacement_cost from accessories         limit 1;  -- expect 42501
--     select delivery_charge  from booking_transport   limit 1;  -- expect 42501
--     select cost             from maintenance_records limit 1;  -- expect 42501
--     select cost_amount      from vehicle_fuel_logs   limit 1;  -- expect 42501
--
--     select name         from accessories             limit 1;  -- expect no error
--     select number_plate from booking_transport       limit 1;  -- expect no error
--
--     select replacement_cost from accessories_v         limit 1;  -- expect null
--     select delivery_charge  from booking_transport_v   limit 1;  -- expect null
--     select cost             from maintenance_records_v limit 1;  -- expect null
--     select cost_amount      from vehicle_fuel_logs_v   limit 1;  -- expect null
--     rollback;
--
--     Then repeat as an Owner user: the four base-table reads must give the
--     SAME 42501, and the four `_v` reads must give real figures. **42501 for
--     Owner on a base table is the CORRECT outcome** — it is what forces every
--     future call site through a view (0062 §5 states the same).
--
--     ⚠ All four tables were still empty on 1 Sep (0 rows, re-checked). On an empty table a
--     `select <money col>` still raises 42501 — the privilege check precedes
--     the scan — so the denial half of this check is meaningful today. The `_v`
--     half returns zero rows rather than a null until a row exists, so it
--     proves nothing yet; insert one row per table inside the rolled-back
--     transaction if the mask itself needs proving rather than assuming.
-- ---------------------------------------------------------------------------

commit;
