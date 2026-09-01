-- =============================================================================
-- 0078_daily_closings.sql — the record a Daily Closing approval writes.
--        ⚠ DRAFT — NOT APPLIED. Do not run this against the live project
--        without explicit approval (CLAUDE.md).
--
-- Raised by `modules/finance/DailyClosing.tsx` (1 Sep 2026), which states the
-- day's position and lets an operator count the drawer, but renders APPROVE as
-- unavailable because there was nowhere to write one. This is that table.
--
--
-- ## What this file does NOT decide
--
-- `WHATSAPP_LINKS_SPEC v1.0` §5.4 defers the closing ritual to
-- `LOCAL_FIRST_CORE_SPEC` §6, which **is not in this repo** (`docs/` has no
-- local-first document; the same absence PLAN.md §4.38(b) records for the
-- 20/24/29 Aug rulings). So four questions are open, and this migration answers
-- the minimum it must to store a row, leaving the rest to Babin:
--
--   1. **Who may approve a closing?** NOT invented here. INSERT is gated on
--      `auth_is_finance_or_admin()` — Owner, Admin, Manager, Coordinator,
--      Accounts — which is the EXISTING predicate for writing finance, mirrored
--      per PLAN.md §4.20 rather than a new authority list. A narrower rule is
--      plausible: `auth_can_approve_late_fee_waiver()` is Owner/Manager only,
--      and a closing is arguably the same class of act. **TODO(decision)** —
--      tightening later is one policy replace and breaks no stored row.
--   2. **May a day be re-opened?** Answered only as far as Law 3 forces:
--      nothing is deleted and an approved closing is immutable. A correction is
--      a VOID plus a new closing, which is the `portal_link_requests` shape
--      (0072) and the `booking_line_units` freeze shape (0076). Whether staff
--      may void at all, and who, is the same open question as 1.
--   3. **What does an unexplained variance cost?** **Nothing here, deliberately.**
--      `variance_reason` is OPTIONAL. Requiring one above some threshold would
--      be a new gate, and PLAN.md §4.38(b) records Babin's 24 Aug standing
--      constraint — BUILD FIRST, RULES LATER: no new business rule until the app
--      runs real jobs. The 31 Aug discount-policy work was the first thing that
--      stance stopped; this is the second. The column exists so the reason can
--      be recorded; no CHECK demands it.
--   4. **Is a closing per branch or per business?** Per BRANCH. `branch_id` is
--      not null and the uniqueness below is per branch/day, because every other
--      operational table in this schema is branch-scoped and a single-branch
--      business is the degenerate case of that, not a different shape.
--
--
-- ## Why the figures are STORED, not recomputed
--
-- Every number below is already derivable from `payments`, `invoices` and
-- `clients` — `lib/queries/closing.ts` derives exactly these. Storing them
-- anyway is deliberate: a closing is a statement someone SIGNED, and the whole
-- point of signing it is that it says what was true at that moment. Recomputing
-- a March closing from today's ledger would silently restate it every time a
-- late correction landed, which is the opposite of a record. Same reasoning
-- `invoices` stores its own totals rather than summing lines on read.
--
-- The consequence is that these columns must never be updated (the freeze
-- trigger enforces it) and must never be treated as the live position — the
-- live position is the query.
--
--
-- ## Money is paisa, and Law 6 applies
--
-- Every amount is `bigint` paisa, the schema's money type everywhere. The table
-- is money end to end, so unlike the four tables 0077 armed there is no
-- non-money half to grant: `authenticated` gets no table-level SELECT at all
-- and reads through `daily_closings_v`, which masks the amounts for a
-- money-blind role exactly like `products_v` (0019). A Warehouse session can
-- therefore see THAT a day was closed and by whom — which is operationally
-- useful — without seeing a rupee of it.
--
--
-- ## Numbering
--
-- Live tops out at `0077_law6_arm_the_four_unarmed_tables` (applied 1 Sep,
-- version 20260901050002), so 0078 is the next free number. ⚠ Re-read
-- `supabase_migrations.schema_migrations` before trusting that — this directory
-- has had two 0074s and two 0076s, and the filename numbers have lied before.
-- =============================================================================

begin;

create table if not exists daily_closings (
  id              uuid        not null default gen_random_uuid() primary key,
  -- Law 8 — every write carries a client-generated UUID; duplicates rejected.
  client_uuid     uuid        not null,
  branch_id       uuid        not null references branches (id),

  -- The OPERATIONAL day being closed, as a date. Not a timestamp: a closing
  -- names a day, and `operationalDayStart` decides where that day begins —
  -- storing an instant here would invite two readers to disagree about which
  -- day a 05:30 row belonged to. `lib/queries/closing.ts` owns that boundary.
  business_date   date        not null,

  -- ── what the operator counted, and what the ledger expected ──────────────
  -- Cash only, both of them. Bank, card and wallet takings are not in a drawer,
  -- so a variance over them would be a figure nobody could act on; the screen
  -- states this and the columns match it.
  counted_cash    bigint      not null,
  expected_cash   bigint      not null,
  -- Stored, not generated: it is `counted - expected` today, and a generated
  -- column would silently change every historic variance if that definition
  -- were ever revised. A CHECK holds the two in agreement instead.
  variance        bigint      not null,
  variance_reason text,

  -- ── the position as it stood, snapshotted (see "Why the figures are STORED") ─
  pickups_count   integer     not null,
  returns_count   integer     not null,
  new_count       integer     not null,
  collected_cash  bigint      not null,
  collected_bank  bigint      not null,
  collected_card  bigint      not null,
  collected_other bigint      not null,
  receivables     bigint      not null,
  deposits_held   bigint      not null,

  approved_at     timestamptz not null default now(),
  approved_by     uuid        not null references users (id),
  created_at      timestamptz not null default now(),

  -- Law 3 — a wrong closing is voided and replaced, never deleted.
  voided_at       timestamptz,
  voided_by       uuid        references users (id),
  void_reason     text,

  constraint daily_closings_client_uuid_key unique (client_uuid),

  -- The variance must equal the two figures it sits between. Cheap, and it
  -- catches the one write that would make the record self-contradicting.
  constraint daily_closings_variance_agrees check (variance = counted_cash - expected_cash),

  -- A count is a count: it may be zero, never negative.
  constraint daily_closings_counts_sane check (
    counted_cash >= 0 and expected_cash >= 0
    and pickups_count >= 0 and returns_count >= 0 and new_count >= 0
    and collected_cash >= 0 and collected_bank >= 0
    and collected_card >= 0 and collected_other >= 0
    and deposits_held >= 0
  ),

  -- A void names its operator and its reason — the `portal_link_requests`
  -- shape (0072). This is NOT a new gate on the business action: it constrains
  -- an undo, which §4.38(b)'s stance is about not adding to, and leaving a
  -- silent void would defeat the record entirely.
  constraint daily_closings_void_is_named check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null
        and void_reason is not null and char_length(btrim(void_reason)) > 0)
  )
);

-- One LIVE closing per branch per day. Partial, so a voided closing does not
-- block the corrected one that replaces it — which is the whole re-open path.
create unique index if not exists daily_closings_one_live_per_branch_day
  on daily_closings (branch_id, business_date)
  where voided_at is null;

create index if not exists daily_closings_branch_date_idx
  on daily_closings (branch_id, business_date desc);

comment on table daily_closings is
  'One signed-off closing per branch per day. The figures are a SNAPSHOT of what was true when it was approved, not a live position — read lib/queries/closing.ts for the live one. Append-only: immutable after insert, voided rather than edited or deleted (Law 3).';
comment on column daily_closings.expected_cash is
  'The day''s CASH takings as the ledger had them at approval. Cash only — bank/card/wallet money is not in a drawer to count.';
comment on column daily_closings.variance_reason is
  'Optional by design. Requiring one would be a new gate, and PLAN.md §4.38(b) records the standing "build first, rules later" constraint. The column is here so a reason CAN be recorded the day someone rules that it must be.';

-- ── Law 3 / Law 4 backstops ─────────────────────────────────────────────────
-- A closing is a signed statement. Editing one silently rewrites what somebody
-- attested to, so the only legal mutation is the void, and the only legal
-- removal is none.

create or replace function reject_update_daily_closing()
returns trigger
language plpgsql
as $$
begin
  -- The void is the one permitted transition, and only from live to voided.
  if OLD.voided_at is null and NEW.voided_at is not null then
    if row(NEW.*) is distinct from row(
      OLD.id, OLD.client_uuid, OLD.branch_id, OLD.business_date,
      OLD.counted_cash, OLD.expected_cash, OLD.variance, OLD.variance_reason,
      OLD.pickups_count, OLD.returns_count, OLD.new_count,
      OLD.collected_cash, OLD.collected_bank, OLD.collected_card, OLD.collected_other,
      OLD.receivables, OLD.deposits_held,
      OLD.approved_at, OLD.approved_by, OLD.created_at,
      NEW.voided_at, NEW.voided_by, NEW.void_reason
    ) then
      raise exception
        'A closing may only be VOIDED, not edited: the void may set voided_at/voided_by/void_reason and nothing else. Void this one and approve a corrected closing.';
    end if;
    return NEW;
  end if;

  raise exception
    'Closing % (branch %, %) is a signed record and is immutable. Void it and approve a corrected closing instead.',
    OLD.id, OLD.branch_id, OLD.business_date;
end;
$$;

comment on function reject_update_daily_closing() is
  'Law 4-shaped immutability for a signed closing. BEFORE UPDATE, so it binds Owner and service_role, which no revoke reaches. The single legal transition is live to voided.';

create trigger trg_daily_closings_freeze
  before update on daily_closings
  for each row execute function reject_update_daily_closing();

create trigger trg_daily_closings_reject_delete
  before delete on daily_closings
  for each row execute function reject_delete_nothing_is_deleted('Void');

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table daily_closings enable row level security;

-- Read: any staff member may see that a day was closed. The AMOUNTS are masked
-- by the view below, not by this predicate — rows and columns are different
-- questions, which is the whole finding of the I5 verification.
create policy daily_closings_staff_read on daily_closings
  for select using (auth_is_staff());

-- Write: the existing finance-write set, mirrored rather than invented (§4.20).
-- See TODO(decision) 1 in the header before narrowing this.
create policy daily_closings_finance_insert on daily_closings
  for insert with check (auth_is_finance_or_admin());

create policy daily_closings_finance_void on daily_closings
  for update using (auth_is_finance_or_admin()) with check (auth_is_finance_or_admin());

-- ── Law 6: the table is money end to end, so nothing reads it raw ───────────
-- 0062's shape, not 0019's inert column revoke: drop the blanket grant, hand
-- back only what a money-blind role may see, and put the amounts behind a view.
revoke select on daily_closings from authenticated;
grant select (
  id, client_uuid, branch_id, business_date,
  pickups_count, returns_count, new_count,
  approved_at, approved_by, created_at,
  voided_at, voided_by, void_reason
) on daily_closings to authenticated;
grant insert, update on daily_closings to authenticated;

create or replace view public.daily_closings_v as
select
  id,
  client_uuid,
  branch_id,
  business_date,
  case when auth_can_view_money() then counted_cash    else null end as counted_cash,
  case when auth_can_view_money() then expected_cash   else null end as expected_cash,
  case when auth_can_view_money() then variance        else null end as variance,
  case when auth_can_view_money() then variance_reason else null end as variance_reason,
  pickups_count,
  returns_count,
  new_count,
  case when auth_can_view_money() then collected_cash  else null end as collected_cash,
  case when auth_can_view_money() then collected_bank  else null end as collected_bank,
  case when auth_can_view_money() then collected_card  else null end as collected_card,
  case when auth_can_view_money() then collected_other else null end as collected_other,
  case when auth_can_view_money() then receivables     else null end as receivables,
  case when auth_can_view_money() then deposits_held   else null end as deposits_held,
  approved_at,
  approved_by,
  created_at,
  voided_at,
  voided_by,
  void_reason
from daily_closings
where auth_is_staff();

grant select on public.daily_closings_v to authenticated;

comment on view public.daily_closings_v is
  'Law 6. The only path to a closing''s amounts — see products_v (0019). Definer rights + an explicit auth_is_staff() row gate (0048), because a definer view bypasses the base table''s row policies as well as its column grants. Do NOT set security_invoker: under 0078''s grants that re-applies the caller''s revoked column grants and kills the read for every role, Owner included (0061''s bug, repaired by 0065). The counts stay visible to every staff role deliberately: the floor may see THAT a day closed without seeing what it took.';

-- ── Post-conditions — refuse to leave this half-landed ──────────────────────
do $$
declare
  v_cols constant text[] := array[
    'counted_cash', 'expected_cash', 'variance', 'collected_cash',
    'collected_bank', 'collected_card', 'collected_other', 'receivables', 'deposits_held'
  ];
  c text;
begin
  if has_table_privilege('authenticated', 'public.daily_closings', 'SELECT') then
    raise exception
      '0078 post-condition failed: authenticated still holds TABLE-level SELECT on daily_closings — the mask is inert, exactly as in 0019/0035/0036.';
  end if;

  foreach c in array v_cols loop
    if has_column_privilege('authenticated', 'public.daily_closings', c, 'SELECT') then
      raise exception '0078 post-condition failed: authenticated can still read daily_closings.% raw.', c;
    end if;
  end loop;

  if not has_column_privilege('authenticated', 'public.daily_closings', 'business_date', 'SELECT') then
    raise exception
      '0078 post-condition failed: business_date is no longer readable — the revoke was over-broad and has taken the non-money half with it.';
  end if;

  if not exists (select 1 from pg_views where schemaname = 'public' and viewname = 'daily_closings_v') then
    raise exception '0078 post-condition failed: daily_closings_v does not exist — the amounts have no sanctioned read path at all.';
  end if;

  if not exists (
    select 1 from pg_views
     where schemaname = 'public' and viewname = 'daily_closings_v' and definition ilike '%where%'
  ) then
    raise exception '0078 post-condition failed: daily_closings_v has no WHERE clause — definer rights with no row gate returns every row to every role.';
  end if;

  if exists (
    select 1 from pg_class k join pg_namespace n on n.oid = k.relnamespace
     where n.nspname = 'public' and k.relname = 'daily_closings_v'
       and coalesce(k.reloptions, '{}') && array['security_invoker=on', 'security_invoker=true']
  ) then
    raise exception '0078 post-condition failed: daily_closings_v is security_invoker — the read dies for every role under this migration''s grants.';
  end if;

  if not exists (
    select 1 from pg_trigger where tgrelid = 'public.daily_closings'::regclass
      and tgname = 'trg_daily_closings_reject_delete'
  ) then
    raise exception '0078 post-condition failed: the Law 3 delete backstop is not registered.';
  end if;

  if not exists (
    select 1 from pg_trigger where tgrelid = 'public.daily_closings'::regclass
      and tgname = 'trg_daily_closings_freeze'
  ) then
    raise exception '0078 post-condition failed: the immutability trigger is not registered — a signed closing could be edited.';
  end if;
end $$;

-- ── The check that proves it, by hand. Run AFTER applying, rolled back ──────
--
--   begin;
--   set local role authenticated;
--   select set_config('app.current_user_id', '<an Owner uuid>', true);
--   select counted_cash from daily_closings limit 1;    -- expect 42501
--   select business_date from daily_closings limit 1;   -- expect no error
--   select counted_cash from daily_closings_v limit 1;  -- expect a figure
--   rollback;
--
--   Then as a Warehouse user: the base-table read must give the SAME 42501 and
--   `daily_closings_v.counted_cash` must be NULL while `business_date` still
--   reads. 42501 for an Owner on the base table is the CORRECT outcome — it is
--   what forces every future call site through the view (0062 §5).
--
--   And the immutability pair, which no grant can express:
--     update daily_closings set counted_cash = 1 where id = '<id>';  -- expect the freeze exception
--     delete from daily_closings where id = '<id>';                  -- expect the Law 3 exception
-- =============================================================================

commit;
