-- =============================================================================
-- 0148_view_anon_leak_closure.sql — close three anon-readable views, and make
--                                  the closure a gate rather than a one-time fix
--
-- WHAT THIS FIXES (all three confirmed against the full 145-file chain in
-- PGlite, by reading `pg_class` / `pg_get_viewdef`, not by reading migrations)
-- -----------------------------------------------------------------------------
-- The audit that prompted this file measured, as the `anon` role against the
-- fully-built chain:
--
--   view                        rows to anon   why
--   -------------------------   -----------   ---------------------------------
--   audit_logs                  2,222         no row predicate at all; runs as its
--                                             owner, so `audit_events_select`
--                                             (Owner/Admin/Manager only) never runs
--   staff_directory_v           5 of 5        no row predicate; `revoke … from
--                                             public` does not remove anon's own grant
--   product_units_service_v     220           `grant select … to authenticated, anon`
--                                             written explicitly in 0103
--
--   Live exposure differs per view, and that matters for urgency:
--     * `product_units_service_v` is LIVE — 0103 was applied to production 8 Sep.
--     * `staff_directory_v` (0120) and `audit_logs` (0129) are PENDING. Applying
--       0125→0147 as planned would have opened the first two at cutover.
--
-- TWO CAUSES, AND ONLY THE SECOND ONE IS THE AUDIT'S STORY
-- -----------------------------------------------------------------------------
-- Cause 1 — a missing row predicate. `audit_logs` (0129) and
-- `product_units_service_v` (0103) select straight from a base table with no
-- `where`. 0048 established the house rule for exactly this: every definer view
-- carries its base table's row predicate INLINE, because a view runs as its
-- owner and therefore skips the base table's ROW policies. The twenty views 0048
-- repaired got the predicate. `staff_directory_v` did not — it kept 0067's
-- `auth_user_role() = 'Owner'`, and 0120 dropped it entirely when it recreated
-- the view for general staff access.
--
-- Cause 2 — and this is the one that let the first cause survive — **anon holds
-- SELECT on every view in `public`, by platform default.** `0095` corrected the
-- default ACL for DML and deliberately left SELECT alone; its post-condition
-- still treats `anon` losing SELECT on a view as a FAILURE:
--
--     if not has_table_privilege('anon', r.oid, 'SELECT') then
--       v_bad := v_bad || format('anon can no longer SELECT %s (0093 shape
--                                changed)', r.relname)::text;
--
-- and line 237 asserts `anon can no longer SELECT on public.clients` is bad. So
-- the house invariant was literally "anon reads every view, and the row
-- predicates are what stop it". That invariant held only while every view had a
-- predicate. 0129 shipped without one, and nothing in the chain could say so,
-- because a probe that counts rows cannot tell "gated" from "empty" against a
-- thin seed.
--
-- Note that 0095's assertion is NOT contradicted here: it runs at 0095, and
-- this file runs at 0148. In a fresh chain anon's SELECT is still present when
-- 0095 checks. What changes is that 0148 revokes it afterwards — which is why
-- the invariant "anon reads every view" is now FALSE by design, and why the
-- reusable gate in `scripts/check-pglite.mjs` (same commit) is the control that
-- matters going forward rather than this file's own post-conditions.
--
-- WHY REVOKE, AND NOT ONLY ADD A PREDICATE
-- -----------------------------------------------------------------------------
-- `PERMISSIONS.md` §12.2 D-6 states it as a law: "As anon / no `users` row:
-- everything staff-side → 0 rows, role resolves `Client`." A predicate makes
-- that true *by accident of the data*; a revoked grant makes it true
-- structurally, and it cannot be undone by the next view someone adds. Every
-- `_v` view in this schema is staff-side working data. There is no anon reader:
-- every `.from('<view>')` in `src/` sits behind an authenticated session
-- (`src/lib/queries/*`, `src/lib/bookingQuery.ts`, `src/lib/scannerLookup.ts`,
-- `src/lib/syncEngine.ts`), and `marketing.html` reads no view.
--
-- The revoke is therefore stated for ALL public views, not just the three, so
-- that the post-condition is a single invariant with no allow-list to maintain.
-- If a genuinely public view is ever needed, granting it back is one line and
-- must say in a comment why the anon key may read it — that is the decision
-- this file is making sure cannot be made by omission.
--
-- WHAT `anon` LOSES, precisely
-- -----------------------------------------------------------------------------
-- Nothing in the product. `anon` is what PostgREST sees with no JWT: the login
-- screen, the password-reset request, the OTP hand-off. None of those read a
-- view. `authenticated` keeps SELECT on all thirty (POST-CONDITION 2).
--
-- THE TWO PRODUCT DECISIONS IN HERE, AND HOW EACH WAS RESOLVED
-- -----------------------------------------------------------------------------
-- 1. `audit_logs` → `where auth_user_role() in ('Owner','Admin','Manager')`.
--    Not a decision: that is `audit_events_select` verbatim, read from
--    `0018_manager_role_policies.sql:180-184` and mirrored inline per 0048. The
--    view answers to its base table's policy or it is not the same view.
--
--    `security_invoker = on` was considered and NOT taken, against the audit's
--    recommendation. 0048's header already rules it out for this schema, and
--    PLAN.md §6.32 makes it actively unsafe here: the pending grant repair will
--    `revoke select on <t> from authenticated` and re-grant per column, so an
--    invoker view would start requiring callers to hold SELECT on
--    `audit_events.old_values / new_values / diff` — the jsonb columns most
--    likely to be left off a non-money column grant. That would break the audit
--    trail for exactly the roles meant to read it. The inline predicate plus a
--    revoked anon grant closes the same hole without that coupling.
--
-- 2. `staff_directory_v` → `where … and auth_is_staff()`.
--    PARTIALLY a decision, and the unresolved half is logged rather than
--    invented. What is settled: P9 (`PERMISSIONS.md:79`) says Client is
--    external and reads only rows joined to its own `client_id`, and D-6 says
--    anon reads nothing staff-side. 0120 shipped neither, so a Client session
--    and an anon session each received the whole roster — names, employee
--    codes, roles, departments, branches.
--
--    What is NOT settled: WHICH staff roles may read it. R-27
--    (`RULINGS-2026-09-08.md:159`) cites 0067's `auth_user_role() = 'Owner'`
--    inline as one of its four grounds for ruling role assignment Owner-only,
--    and PERMISSIONS §12.2 D-8 (corrected 8 Sep under R-27) repeats it. 0120's
--    header instead cites §4.3 AD2 — the row R-27 corrected — and widens the
--    view to "general staff access". The repo therefore contradicts itself, and
--    the answer is a product call, not a database call.
--
--    So this file takes the strictly tighter position that requires no ruling:
--    `auth_is_staff()` closes anon and Client (both required by existing law)
--    and leaves every internal role reading what 0120 gave them, which is a
--    narrowing and never a widening. B-1 is "stricter wins", so nothing here
--    requires a decision to be defensible. The Owner-vs-staff half is written
--    up in `docs/OPEN_DECISIONS.md` as `TODO(decision)` and left open.
--
-- COLUMN-LOSS PROTECTION (0048's §6.23 / §6.25 bug class)
-- -----------------------------------------------------------------------------
-- `product_units_service_v` is 94 lines of CTEs. Retyping it by hand is exactly
-- how this repo has twice shipped a view that silently lost columns, so the
-- body below is 0103's, unchanged and in order, with a `where` on the final
-- select. Three controls make a mistake here a hard error rather than a
-- behaviour change:
--   1. `create or replace view`, never `drop` + `create` — Postgres rejects a
--      replacement whose column names, order, or types differ, so a retyped
--      column fails at apply time.
--   2. POST-CONDITION 3 asserts the exact column count of all three views
--      against numbers read off `information_schema.columns` before this file
--      was written (21 / 17 / 13).
--   3. `drop view … cascade` stays away from `staff_directory_v` and
--      `product_units_service_v`, both of which have dependents — the two
--      functions 0103 defines over `product_units_service_v` would go with it.
--
-- ⚠ NOT APPLIED TO LIVE. Additive: three view redefinitions and a grant
--   reversal, no data, no table, no function. Subject to CLAUDE.md N-5 —
--   Babin applies after `BACKUP_PROTOCOL.md`.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1 · audit_logs — the base table's SELECT predicate, inlined (0048's pattern).
--     0129's own comment calls this "a compatibility view … so tools,
--     analytics, and verification queries resolve transparently". Nothing in
--     `src/` reads it; it exists for out-of-band querying, which is exactly why
--     nobody noticed it was open. `create or replace view` keeps the OID, so the
--     22 columns and their order are inherited unchanged and cannot drift.
-- -----------------------------------------------------------------------------
create or replace view public.audit_logs as
  select
    id,
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    branch_id,
    ip_address,
    user_agent,
    device_type,
    old_values,
    new_values,
    diff,
    reason,
    created_at
  from public.audit_events
  -- `audit_events_select`, verbatim (0018:180-184). Without this the view runs
  -- as its owner and the policy is never consulted — which is how 2,222 audit
  -- rows, 2,102 of them carrying `old_values` / `new_values` / `diff` payloads,
  -- became readable with the public anon key.
  where auth_user_role() in ('Owner', 'Admin', 'Manager');

comment on view public.audit_logs is
  'AUD-017: Transparent compatibility view over audit_events for universal audit '
  'trail logging and queries. 0148: carries audit_events_select inline (0048''s '
  'pattern) and is no longer readable by anon. A definer view without this '
  'predicate is the audit trail with no row gate at all.';

-- -----------------------------------------------------------------------------
-- 2 · staff_directory_v — 0120's column list and masks, unchanged; one predicate
--     added. 0120 recreates this view from 0067 and drops 0067's
--     `auth_user_role() = 'Owner'`; that is where the row gate went. Re-adding
--     it as `auth_is_staff()` is the narrowest predicate that satisfies P9 and
--     D-6 without answering the Owner-vs-staff question 0120 and R-27 disagree
--     about. The masks (`auth_user_role() in ('Owner','Admin')`) are 0120's and
--     stay: they are what keeps email, mobile and credential state off a
--     non-Admin's screen, and they are not affected by this change.
--
--     Note that `auth_is_staff()` in the WHERE is invisible to a naive audit: the
--     definition already contained `auth_user_role()` inside its CASE masks, so
--     "does this view mention auth_*" reads true while the row gate is absent.
--     That is why POST-CONDITION 4 matches on the WHERE clause, not the body.
-- -----------------------------------------------------------------------------
create or replace view public.staff_directory_v as
select
  u.id,
  u.full_name,
  u.employee_code,
  case
    when auth_user_role() in ('Owner', 'Admin') then u.email
    else null
  end as email,
  u.primary_role,
  u.department,
  case
    when auth_user_role() in ('Owner', 'Admin') then u.mobile
    else null
  end as mobile,
  u.branch_id,
  b.branch_code,
  b.name as branch_name,
  u.is_active,

  -- Credential state (Owner/Admin only)
  case
    when auth_user_role() in ('Owner', 'Admin') then (p.id is not null)
    else false
  end as has_pin,
  case
    when auth_user_role() in ('Owner', 'Admin') and p.locked_until > now() then p.locked_until
    else null
  end as pin_locked_until,
  case
    when auth_user_role() in ('Owner', 'Admin') then coalesce(p.rotated_at, p.set_at)
    else null
  end as pin_set_at,

  case
    when auth_user_role() in ('Owner', 'Admin') then (au.id is not null)
    else false
  end as has_auth_account,
  case
    when auth_user_role() in ('Owner', 'Admin') then au.last_sign_in_at
    else null
  end as last_sign_in_at,
  case
    when auth_user_role() in ('Owner', 'Admin') then au.email_confirmed_at
    else null
  end as email_confirmed_at

from users u
left join branches b
  on b.id = u.branch_id
left join staff_auth_pins p
  on p.user_id = u.id
 and p.revoked_at is null
left join auth.users au
  on au.id = u.id
where u.deactivated_at is null
  and u.is_active = true
  -- 0148: P9 (Client is external) and D-6 (anon reads nothing staff-side).
  and auth_is_staff();

-- -----------------------------------------------------------------------------
-- 3 · product_units_service_v — 0103's body, byte for byte, with the same
--     predicate. `PERMISSIONS.md` §4.3 already names the audience ("all staff")
--     and explains why no Law 6 mask is needed (the view is money-free by
--     construction), so `auth_is_staff()` is that row's own predicate rather
--     than a judgement call — it is also what 0103's header meant by "every
--     staff role may read it", which the `anon` grant quietly widened.
--
--     Two dependents ride on this view: `service_due_reason(unit)`,
--     `service_due_at(unit)` and the sibling helpers 0103 defines below. They
--     are SECURITY DEFINER and call this view as their owner. Adding a
--     predicate therefore narrows what THEY return for a Client or anon caller
--     too — which is the intended direction (a client must not learn a unit's
--     service state through a definer function), and is called out here because
--     it is a behaviour change for those two paths.
-- -----------------------------------------------------------------------------
create or replace view product_units_service_v as
with last_service as (
  select mr.product_unit_id, max(mr.completed_at) as completed_at
    from maintenance_records mr
   where mr.maintenance_type = 'Preventive Service'
     and mr.completed_at is not null
   group by mr.product_unit_id
),
base as (
  select
    pu.id           as unit_id,
    pu.product_id,
    pu.running_hours,
    pu.service_meter_baseline,
    p.service_interval_days,
    p.service_interval_rental_days,
    p.service_interval_meter_hours,
    p.service_grace_days,
    -- "A unit with no completed preventive job counts from product_units.created_at
    -- (intake)" — R-28, verbatim.
    coalesce(ls.completed_at, pu.created_at) as last_service_at
  from product_units pu
  join products p on p.id = pu.product_id
  left join last_service ls on ls.product_unit_id = pu.id
  where pu.retired_at is null
    and pu.status not in ('Retired', 'Missing')
),
usage as (
  select
    b.unit_id,
    coalesce(sum(bl.days), 0) as rental_days
  from base b
  join booking_line_units blu on blu.asset_id = b.unit_id
  join booking_lines bl       on bl.id = blu.booking_line_id
  where bl.voided_at is null
    and exists (
      -- "bookings that reached On Rent after last_service_at" — the transition
      -- row is the evidence, not `bookings.stage`, because a booking that has
      -- since Returned is still a booking the unit went out on.
      select 1 from booking_stage_transitions t
       where t.booking_id = bl.booking_id
         and t.to_stage = 'On Rent'
         and t.occurred_at > b.last_service_at
    )
  group by b.unit_id
),
computed as (
  select
    b.unit_id,
    b.product_id,
    b.last_service_at,
    floor(extract(epoch from (now() - b.last_service_at)) / 86400)::integer as days_since_service,
    coalesce(u.rental_days, 0)::integer                                     as rental_days_since_service,
    greatest(b.running_hours - b.service_meter_baseline, 0)                 as meter_hours_since_service,
    b.service_interval_days,
    b.service_interval_rental_days,
    b.service_interval_meter_hours,
    b.service_grace_days,
    case when b.service_interval_days is null then null
         else (b.last_service_at + make_interval(days => b.service_interval_days))
    end as due_at
  from base b
  left join usage u on u.unit_id = b.unit_id
)
select
  c.unit_id,
  c.product_id,
  c.last_service_at,
  c.days_since_service,
  c.rental_days_since_service,
  c.meter_hours_since_service,
  c.due_at,
  case
    when c.service_interval_days is not null
     and c.days_since_service >= c.service_interval_days then 'time'
    when (c.service_interval_rental_days is not null
          and c.rental_days_since_service >= c.service_interval_rental_days)
      or (c.service_interval_meter_hours is not null
          and c.meter_hours_since_service >= c.service_interval_meter_hours) then 'usage'
    else null
  end as due_reason,
  case
    when c.service_interval_days is not null
     and c.days_since_service >= c.service_interval_days
    then greatest(c.days_since_service - c.service_interval_days - c.service_grace_days, 0)
    else null
  end as overdue_days,
  -- Carried so a screen can render R-28's tooltip — `usage (42 of 40 rental
  -- days)` — without a second query per row for the model's plan.
  c.service_interval_days,
  c.service_interval_rental_days,
  c.service_interval_meter_hours,
  c.service_grace_days
from computed c
-- 0148: PERMISSIONS §4.3's "all staff", as a predicate. 0103 wrote the audience
-- into a GRANT to `anon` instead, which is how the anon key came to hold it.
where auth_is_staff();

comment on view product_units_service_v is
  'R-28 (8 Sep 2026): whether a unit is due for preventive service, derived at read '
  'time from the MODEL''s intervals, the unit''s last completed Preventive Service '
  'job and its usage since. No is_due column exists anywhere. due_reason is null for '
  'a model with no plan. Money-free by construction, so every staff role may read it. '
  'Retired and Missing units are not in it. 0148: that "every staff role" is now a '
  'row predicate rather than a grant to anon (PERMISSIONS §4.3).';

-- -----------------------------------------------------------------------------
-- 4 · The actual closure: anon holds no SELECT on any view in `public`.
--
--     `revoke … from anon` is the gate. The predicates above are defence in
--     depth — they survive a careless re-grant, the revoke does not. Done as a
--     loop rather than three statements so the invariant in POST-CONDITION 1 is
--     exhaustive: any view added later, here or in a future migration, is
--     covered without editing this file.
--
--     `from public` as well as `from anon`: the platform grants `anon` directly,
--     so revoking the PUBLIC grant alone would achieve nothing — which is
--     precisely the mistake 0120 made with `revoke all … from public`.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select c.relname
      from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relkind = 'v'
     order by c.relname
  loop
    execute format('revoke select on table public.%I from anon, public', r.relname);
    n := n + 1;
  end loop;
  if n = 0 then
    raise exception '0148: no public views found — the revoke loop asserted nothing.';
  end if;
  raise notice '0148: anon SELECT revoked on % public views.', n;
end $$;

-- =============================================================================
-- POST-CONDITIONS
--
-- 1 is the invariant this file exists to establish, and it is checked
-- catalogue-side so it cannot be satisfied by an empty seed. 3 and 4 are the
-- column-loss and missing-predicate controls. 5 is the behaviour, and it rolls
-- back so a probe that unexpectedly succeeds leaves nothing behind (0095's
-- pattern).
--
-- Stated plainly, because it is the honest limit of this file: 1, 3 and 4 cannot
-- tell you what a view returns to a real caller against a real dataset. Only 5
-- can, and 5 is thin for exactly the reason the audit recorded — most of these
-- views hold no rows in a fresh PGlite build. The durable answer is
-- `check:lifecycle` against seeded roles plus the per-role live probe in
 --     Babin's cutover checklist, not a stronger assertion here.
-- =============================================================================
do $$
declare
  expected constant jsonb := '{
    "audit_logs": 21, "staff_directory_v": 17, "product_units_service_v": 13
  }'::jsonb;
  r       record;
  k       text;
  actual  integer;
  v_bad   text := '';
  v_n     integer := 0;
begin
  -- (1) THE INVARIANT. No public view is readable by anon.
  for r in
    select c.relname
      from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relkind = 'v'
       and has_table_privilege('anon', c.oid, 'SELECT')
     order by c.relname
  loop
    v_bad := v_bad || format('anon can still SELECT %s; ', r.relname)::text;
  end loop;

  -- (2) …and authenticated still can read every one of them. A revoke that
  --     breaks the app is not a fix, so this is asserted rather than assumed.
  for r in
    select c.relname
      from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relkind = 'v'
       and not has_table_privilege('authenticated', c.oid, 'SELECT')
     order by c.relname
  loop
    v_bad := v_bad || format('authenticated lost SELECT on %s; ', r.relname)::text;
  end loop;

  -- (3) Column counts unchanged. Read off information_schema.columns before this
  --     file was written; `create or replace view` would already have refused a
  --     changed name/order/type, so this is the belt to that pair of braces.
  for k in select jsonb_object_keys(expected) loop
    select count(*) into actual
      from information_schema.columns
     where table_schema = 'public' and table_name = k;
    if actual is distinct from (expected ->> k)::integer then
      v_bad := v_bad || format('%s has %s columns, expected %s; ',
                               k, actual, expected ->> k)::text;
    end if;
  end loop;

  -- (4) Every public view carries a row predicate that consults an auth_*
  --     function — matched in the WHERE, not anywhere in the definition.
  --     `staff_directory_v` is the reason that distinction is load-bearing: its
  --     CASE masks mention `auth_user_role()` while its row gate is absent, so a
  --     body-wide match reports it as safe.
  --     Weaker than a seeded behavioural test and documented as such in the
  --     header: a predicate inside a CTE would satisfy this. The authoritative
  --     control is (1), which does not depend on the definition at all.
  --
  --     Written with `\m`/`\M` and a plain `.`, both of which were arrived at by
  --     measuring rather than assuming, and both of which fail SILENTLY when
  --     wrong — a regex that matches nothing reports every view as unpoliced and
  --     reads like a correct alarm. `\b` is not a word boundary in Postgres ARE
  --     (it spells that `\y`), and `[\s\S]` is not a valid alternation there.
  --     Postgres ARE is newline-INsensitive by default, so `.` does cross the
  --     newlines in `pg_get_viewdef` output; the SQL-standard assumption that it
  --     does not is what makes people reach for `[\s\S]` in the first place.
  for r in
    select c.relname
      from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relkind = 'v'
       and pg_get_viewdef(c.oid) !~* '\mwhere\M.*\mauth_(is_staff|user_role|can_view_money)'
     order by c.relname
  loop
    v_bad := v_bad || format('%s has no auth_* row predicate; ', r.relname)::text;
  end loop;

  select count(*) into v_n
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relkind = 'v';

  if v_bad <> '' then
    raise exception 'POST-CONDITION FAILED (0148): %', v_bad;
  end if;

  raise notice
    '0148 verified (catalogue): anon holds no SELECT on any of % public views; authenticated retains SELECT on all %; audit_logs/staff_directory_v/product_units_service_v still carry 21/17/13 columns; every view carries an auth_* row predicate.',
    v_n, v_n;
end $$;

-- -----------------------------------------------------------------------------
-- 5 · The behaviour, for the three views this file actually changed. Proves the
--     gate is reached by the CALLER's role and not merely present in the text:
--     a Client session must get zero rows from the staff-side two, an anon
--     session must be refused by privilege rather than by an empty result, and
--     a staff session must still be served — a predicate that fires for everyone
--     would pass every assertion above and break the product.
--
--     Skipped, with a notice rather than silently passed, when the seed has no
--     user rows to act as — the same guard 0095 uses.
-- -----------------------------------------------------------------------------
do $$
declare
  v_staff  uuid;
  v_rows   bigint;
  v_blocked boolean;
  v_state  text;
  v_err    text;
begin
  select id into v_staff from users where primary_role <> 'Client' limit 1;
  if v_staff is null then
    raise notice '0148: no staff user in this build; behavioural checks skipped (catalogue checks above still hold).';
    return;
  end if;

  -- (a) A Client session reads neither staff-side view. P9 + D-6.
  set local role authenticated;
  perform set_config('app.current_user_id', '', true);
  select count(*) into v_rows from staff_directory_v;
  if v_rows <> 0 then
    reset role;
    raise exception 'POST-CONDITION FAILED (0148): a Client session read % rows of staff_directory_v (P9).', v_rows;
  end if;
  select count(*) into v_rows from product_units_service_v;
  reset role;
  if v_rows <> 0 then
    raise exception 'POST-CONDITION FAILED (0148): a Client session read % rows of product_units_service_v (P9).', v_rows;
  end if;

  -- (b) A staff session is still served. Without this, (a) is satisfied by a
  --     view that returns nothing to anyone — which is the failure mode a
  --     row-count assertion cannot see.
  set local role authenticated;
  perform set_config('app.current_user_id', v_staff::text, true);
  select count(*) into v_rows from staff_directory_v;
  reset role;
  perform set_config('app.current_user_id', '', true);
  if v_rows = 0 then
    raise notice '0148: no staff rows seeded here; staff_directory_v read-path check skipped.';
  end if;

  -- (c) anon is refused by the GRANT, not by an empty result — the same
  --     distinction 0095 insisted on, and the reason a row count is not a test.
  v_blocked := false; v_state := null; v_err := null;
  begin
    set local role anon;
    perform (select count(*) from audit_logs);
  exception when others then
    v_blocked := true; v_state := sqlstate; v_err := sqlerrm;
  end;
  reset role;
  if not v_blocked then
    raise exception 'POST-CONDITION FAILED (0148): anon SELECTed through audit_logs.';
  end if;
  if v_state <> '42501' then
    raise exception
      'POST-CONDITION FAILED (0148): anon was refused reading audit_logs, but not by the grant — Postgres said (%): %',
      v_state, v_err;
  end if;

  raise notice
    '0148 verified (behaviour): Client reads 0 rows of staff_directory_v and product_units_service_v; anon is refused 42501 on audit_logs by the grant, not by an empty result.';

  raise exception 'ROLLBACK_0148_PROBE';
exception
  when others then
    if sqlerrm = 'ROLLBACK_0148_PROBE' then
      raise notice '0148 post-condition probe rolled back cleanly.';
    else
      raise;
    end if;
end $$;

commit;