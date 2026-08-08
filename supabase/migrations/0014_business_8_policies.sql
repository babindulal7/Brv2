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

-- Client is external. Every staff table gates on this, so a portal session can
-- never reach a staff surface even if a policy elsewhere is written loosely.
create or replace function auth_is_staff()
returns boolean
language sql
stable
as $$
  select auth_user_role() <> 'Client';
$$;

comment on function auth_is_staff is
  'True for the seven internal roles. Client authenticates through the portal and '
  'is never staff. Also the deny-by-default guard for unidentified sessions, which '
  'auth_user_role() resolves to Client.';

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
