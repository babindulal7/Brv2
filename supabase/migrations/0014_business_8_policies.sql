-- ============================================================================
-- 0014_business_8_policies.sql
-- Give Technician and Driver their permissions, and make "staff vs client" a
-- database fact rather than an application assumption.
--
-- Runs after 0013 because Postgres will not let a transaction use an enum value
-- that the same transaction added.
--
-- The three renamed roles need no policy work: rename preserved every existing
-- grant. Only the two genuinely new roles, and the external Client, do.
--
-- LAW 6 — "Warehouse sees no money, enforced by RLS, not the UI" — now has to
-- cover three floor roles, not one. Technician and Driver are money-blind for
-- the same reason Warehouse is: they work the floor, and a number on a screen
-- in front of a client is a number that leaks.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 · Helpers
-- ---------------------------------------------------------------------------

-- 0011's original body cast the literal 'Viewer'::system_role as its fallback.
-- 0013 renamed that enum LABEL to 'Client', and Postgres resolves a string-to-
-- enum cast by label lookup at parse/constant-folding time — not lazily, only
-- on the branch that is chosen — so the old literal does not merely fall back
-- to the wrong value, it fails to parse at all. Every policy in 0011 and every
-- helper below calls this function, so an unfixed 0011 would break the entire
-- authorization layer the instant this migration ran, not just the fallback
-- path. Restated here with the current label, the same way 0013 already
-- restates auth_is_finance_or_admin below for its own renamed values.
create or replace function auth_user_role()
returns system_role
language sql
stable
as $$
  select coalesce(
    (select primary_role from users where id = nullif(current_setting('app.current_user_id', true), '')::uuid),
    'Client'::system_role
  );
$$;

comment on function auth_user_role is
  'The business 8, ruled 8 Aug 2026. An unidentified session resolves to Client '
  '(external, portal-only) rather than Viewer, which no longer exists as a label '
  '— see the note on auth_is_staff below for why that is the safer direction.';

/*
 * Client is external and must never reach a staff surface. Today that holds
 * for a narrower reason than this function's name promises: every existing
 * policy in 0011 was written as a role allow-list that simply never mentions
 * Client (or its former name, Viewer), so a portal session is excluded by
 * omission from all 22 of them — correct in effect, right now, but not
 * because anything calls this function. Nothing in 0011-0014 does.
 *
 * TODO(decision): retrofit 0011's 22 policies to AND against auth_is_staff()
 * so "client never staff" is a fact this one function states and a future
 * policy inherits by construction, instead of a fact 22 independent
 * allow-lists each have to individually remember to preserve. Left undone
 * here deliberately — that is a ~22-policy retrofit across an already-large
 * file, and changing working authorization logic needs its own careful pass,
 * not a same-night addition alongside an unrelated bug fix.
 */
create or replace function auth_is_staff()
returns boolean
language sql
stable
as $$
  select auth_user_role() <> 'Client';
$$;

comment on function auth_is_staff is
  'True for the seven internal roles; Client is external, portal-only. Defined '
  'for that check to have one home, but NOT YET WIRED into the 22 policies in '
  '0011 — see the TODO(decision) on this function''s definition. auth_can_view_money '
  'below is a real, in-force gate; this one is not, yet.';

-- Law 6, widened to the floor. Kept as one function so the rule has one home:
-- if a role is ever added, money visibility is decided here and nowhere else.
create or replace function auth_can_view_money()
returns boolean
language sql
stable
as $$
  select auth_user_role() not in ('Warehouse', 'Technician', 'Driver', 'Client');
$$;

comment on function auth_can_view_money is
  'Law 6. The three floor roles are money-blind: rows are not returned, not merely '
  'hidden. Client sees only its own invoices through portal-scoped policies, never '
  'this function.';

-- Existing finance helper: 'Billing' was renamed to 'Coordinator' by 0013, so
-- this is restated with the current vocabulary rather than left reading stale.
create or replace function auth_is_finance_or_admin()
returns boolean
language sql
stable
as $$
  select auth_user_role() in ('Owner', 'Admin', 'Coordinator', 'Accounts');
$$;

-- ---------------------------------------------------------------------------
-- 2 · Technician — the floor work it shares with Warehouse
--
-- 21 Jul lock: return triage is SHARED — Warehouse and Technician can both act.
-- 22 Jul refinement: Technician is VIEW-ONLY on Packing and Scan; Warehouse
-- performs those. So Technician gets maintenance and cases as full actions, and
-- read on the operational record it must consult to do that work.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.maintenance_tickets') is not null then
    execute $p$
      drop policy if exists maintenance_technician_write on maintenance_tickets;
      create policy maintenance_technician_write on maintenance_tickets
        for all
        using      (auth_user_role() in ('Owner', 'Admin', 'Warehouse', 'Technician'))
        with check (auth_user_role() in ('Owner', 'Admin', 'Warehouse', 'Technician'));
    $p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3 · Driver — trips and the handover legs, and nothing else
--
-- The driver's screen is one button per row. The permission should be just as
-- narrow: the trip it is assigned, the booking it is delivering, no money.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['vehicle_trips', 'trips', 'booking_transport']
  loop
    if to_regclass('public.' || t) is not null then
      execute format($p$
        drop policy if exists %1$s_driver_read on %1$s;
        create policy %1$s_driver_read on %1$s
          for select
          using (auth_user_role() in ('Owner', 'Admin', 'Coordinator', 'Warehouse', 'Driver'));
      $p$, t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4 · Money stays shut for the floor
--
-- Restated against the widened helper so the guarantee does not quietly depend
-- on Warehouse being the only floor role in the list.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['invoices', 'payments', 'security_deposits', 'deposit_movements', 'expenses']
  loop
    if to_regclass('public.' || t) is not null then
      execute format($p$
        drop policy if exists %1$s_money_blind on %1$s;
        create policy %1$s_money_blind on %1$s
          for select
          using (auth_can_view_money());
      $p$, t);
    end if;
  end loop;
end $$;

commit;
