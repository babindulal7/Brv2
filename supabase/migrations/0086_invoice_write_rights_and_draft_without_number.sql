-- =============================================================================
-- 0086 — Make SPEC-P0-1 §3.1 implementable: align invoice write rights to R-05,
--        give `invoice_lines` a write policy at all, and let a Draft carry no
--        number (R-15).
--        DRAFT — **NOT APPLIED**. PHASE-0-PLAN.md Step 0 (live dump, restore
--        test, token rotation) must land first. CLAUDE.md forbids applying to
--        live without explicit approval either way. Verify the ledger
--        (`supabase_migrations.schema_migrations`) before trusting this header;
--        headers in this directory have been wrong before.
--
-- ## ⚠ Three gaps in PHASE-0-PLAN.md, not duplicates of it
--
-- Each of these blocks Step 3.4 ("`createInvoice` + wire `CreateInvoiceModal`")
-- from passing SPEC-P0-1 §5's own acceptance test. All three were measured
-- against the LIVE catalogue on 3–4 Sep, not read from the SQL files.
--
-- **(1) `invoice_lines` has no write policy.** SPEC-P0-1 §1 lists the table as
--      "exists, RLS on" and §3.1 has `createInvoice` write "one `invoice_lines`
--      row per `booking_lines` row". But:
--
--        select policyname, cmd from pg_policies
--         where schemaname='public' and tablename='invoice_lines';
--        -- → exactly ONE row: invoice_lines_select | SELECT
--
--      Postgres denies any command with no permissive policy, so every INSERT
--      raises `42501 new row violates row-level security policy`, for every
--      role including Owner. And because `trg_recalc_invoice_lines` fires only
--      on `invoice_lines`, an invoice that keeps no lines holds zero totals for
--      ever — a header with no lines is not a smaller invoice, it is a silently
--      free one.
--
-- **(2) The ruled rights and the live policy disagree.** R-05 and SPEC-P0-1
--      §3.1 both give invoice create/issue to **Owner · Admin · Manager ·
--      Accounts**. Live says otherwise:
--
--        invoices_insert / invoices_update
--          WITH CHECK (auth_user_role() = ANY (ARRAY[
--            'Owner','Admin','Manager','Coordinator']))
--
--      Accounts — the role the ruling names — is **absent**, and Coordinator,
--      which the ruling does not name, is **present**. Left alone, an Accounts
--      user is offered Create and Issue controls Postgres refuses (the
--      reachable-then-refused shape Law 6's absent-not-disabled rule exists to
--      prevent), while Coordinator keeps a database right the ruling withdraws.
--
--      PLAN.md §4.20's method is explicit about the order: **change the POLICY
--      first, then the predicate.** This is that change. `lib/rbac`'s
--      `canIssueInvoice` is written to match it in the same commit.
--
--      This also settles the AUTHSEC-01 half of the audit's finding for the
--      create/update path. It deliberately does NOT touch who may VOID — R-04
--      rules the void *mechanism* (Void + Credit Note) and no ruling restates
--      the void role set, so per R-00 (silence is not supersession) the older
--      position stands and `canVoidInvoice` is left alone.
--
-- **(3) A Draft cannot exist without a number.** R-15 says a Draft carries no
--      `invoice_no`, minted instead by `next_document_number('invoice')` at the
--      moment of issue, so an abandoned draft leaves no gap in the tax-invoice
--      sequence (Nepal IRD requires no gaps among issued invoices). But live:
--
--        invoices.invoice_no   text     NOT NULL
--        invoices.issue_date   date     NOT NULL DEFAULT CURRENT_DATE
--
--      Both are NOT NULL, so R-15 is unimplementable as the schema stands and
--      SPEC-P0-1 §3.1's "`invoice_no` — null" cannot be written. PHASE-0-PLAN
--      lists no migration for this.
-- =============================================================================

begin;

-- ── (3) A Draft carries no number and no issue date ─────────────────────────
-- The UNIQUE constraint stays. In Postgres, NULLs are distinct under UNIQUE, so
-- many un-issued Drafts coexist happily while issued numbers stay unique.

alter table public.invoices alter column invoice_no drop not null;
alter table public.invoices alter column issue_date drop not null;
alter table public.invoices alter column issue_date drop default;

comment on column public.invoices.invoice_no is
  'R-15. NULL while the invoice is a Draft. Minted by next_document_number(''invoice'') at the '
  'moment of issue, in the same transaction, so an abandoned draft leaves no gap in the issued '
  'sequence. UNIQUE still holds — NULLs are distinct under UNIQUE.';

comment on column public.invoices.issue_date is
  'R-15. NULL until the invoice is issued. Was NOT NULL DEFAULT CURRENT_DATE, which dated every '
  'Draft as though it had already been issued.';

/*
 * The two travel together. A row with a number and no date, or a date and no
 * number, is a half-issued invoice — a state neither R-02 nor R-15 admits, and
 * one that would put a gap in the sequence exactly where IRD forbids it.
 */
alter table public.invoices drop constraint if exists invoices_issued_together;
alter table public.invoices add constraint invoices_issued_together check (
  (invoice_no is null and issue_date is null)
  or (invoice_no is not null and issue_date is not null)
);

-- ── (2) Invoice write rights follow R-05 ────────────────────────────────────

drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert
  on public.invoices
  for insert
  with check (
    auth_user_role() = any (array[
      'Owner'::system_role,
      'Admin'::system_role,
      'Manager'::system_role,
      'Accounts'::system_role
    ])
  );

drop policy if exists invoices_update on public.invoices;
create policy invoices_update
  on public.invoices
  for update
  using (
    auth_user_role() = any (array[
      'Owner'::system_role,
      'Admin'::system_role,
      'Manager'::system_role,
      'Accounts'::system_role
    ])
  );

-- ── (1) `invoice_lines` becomes writable, by the same four ──────────────────
-- Split INSERT and UPDATE rather than `for all`, so the grant reads next to the
-- invoices pair above and a later reader can diff them line for line.
-- No DELETE policy: Law 3. A wrong line is corrected by Void + Credit Note
-- (R-04), which `invoices_void_requires_reason` already shapes.

drop policy if exists invoice_lines_insert on public.invoice_lines;
create policy invoice_lines_insert
  on public.invoice_lines
  for insert
  with check (
    auth_user_role() = any (array[
      'Owner'::system_role,
      'Admin'::system_role,
      'Manager'::system_role,
      'Accounts'::system_role
    ])
  );

drop policy if exists invoice_lines_update on public.invoice_lines;
create policy invoice_lines_update
  on public.invoice_lines
  for update
  using (
    auth_user_role() = any (array[
      'Owner'::system_role,
      'Admin'::system_role,
      'Manager'::system_role,
      'Accounts'::system_role
    ])
  );

-- ── Post-conditions ─────────────────────────────────────────────────────────

do $$
declare
  v_cmds text;
  v_bad  int;
begin
  -- (1) invoice_lines now admits INSERT and UPDATE, and still refuses DELETE.
  select string_agg(distinct cmd, ',' order by cmd) into v_cmds
    from pg_policies where schemaname = 'public' and tablename = 'invoice_lines';

  if v_cmds is distinct from 'INSERT,SELECT,UPDATE' then
    raise exception
      'POST-CONDITION 1 FAILED: invoice_lines policies cover %, expected exactly INSERT,SELECT,UPDATE', v_cmds;
  end if;

  -- (2) All four write policies carry the R-05 set, and none carries Coordinator.
  select count(*) into v_bad
    from pg_policies
   where schemaname = 'public'
     and policyname in ('invoices_insert','invoices_update','invoice_lines_insert','invoice_lines_update')
     and not (
       coalesce(qual, with_check) like '%Owner%'
       and coalesce(qual, with_check) like '%Admin%'
       and coalesce(qual, with_check) like '%Manager%'
       and coalesce(qual, with_check) like '%Accounts%'
     );
  if v_bad <> 0 then
    raise exception 'POST-CONDITION 2 FAILED: % invoice write policies do not carry the R-05 role set', v_bad;
  end if;

  select count(*) into v_bad
    from pg_policies
   where schemaname = 'public'
     and policyname in ('invoices_insert','invoices_update','invoice_lines_insert','invoice_lines_update')
     and coalesce(qual, with_check) like '%Coordinator%';
  if v_bad <> 0 then
    raise exception 'POST-CONDITION 2 FAILED: Coordinator survives in % invoice write policies; R-05 withdraws it', v_bad;
  end if;

  -- (3) A Draft can exist with no number, and a half-issued row cannot.
  if (select is_nullable from information_schema.columns
       where table_schema='public' and table_name='invoices' and column_name='invoice_no') <> 'YES' then
    raise exception 'POST-CONDITION 3 FAILED: invoices.invoice_no is still NOT NULL — R-15 is unimplementable';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.invoices'::regclass and conname = 'invoices_issued_together'
  ) then
    raise exception 'POST-CONDITION 3 FAILED: invoices_issued_together was not created';
  end if;

  -- (4) The number is still unique among ISSUED invoices.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.invoices'::regclass and conname = 'invoices_no_key' and contype = 'u'
  ) then
    raise exception 'POST-CONDITION 4 FAILED: the invoice_no UNIQUE constraint was lost';
  end if;

  -- (5) RLS is still enabled on both. A policy on an RLS-disabled table is decoration.
  if not (select bool_and(relrowsecurity) from pg_class
           where oid in ('public.invoices'::regclass, 'public.invoice_lines'::regclass)) then
    raise exception 'POST-CONDITION 5 FAILED: RLS is not enabled on invoices and invoice_lines';
  end if;

  -- (6) The totals trigger still fires on an `invoice_lines` write.
  -- Catalogue half only; the behavioural half is the probe below. Without this
  -- trigger the new INSERT policy would let a header keep lines and zero totals
  -- for ever — a silently free invoice, which is worse than the refusal it
  -- replaces.
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.invoice_lines'::regclass
       and not tgisinternal
       and tgname = 'trg_recalc_invoice_lines'
  ) then
    raise exception
      'POST-CONDITION 6 FAILED: trg_recalc_invoice_lines is gone, so a line write would leave the header at zero.';
  end if;

  raise notice '0086 post-conditions passed: R-05 rights applied, invoice_lines writable, Drafts carry no number.';
end $$;

-- ── Behavioural post-conditions ─────────────────────────────────────────────
--
-- The catalogue block above reads pg_policies. `rls-masks-rows-not-columns` is
-- the standing lesson that a catalogue read is not proof: an inert column
-- REVOKE and an enforced one look identical in pg_class, and this repo has
-- shipped three of the inert kind. This migration's own footer already says
-- "prove it with role simulation, never with a zero-row read" — so it is proved
-- here rather than left as a paragraph for a human to run by hand.
--
-- Everything below is written inside a subtransaction and rolled back by a
-- sentinel exception, the idiom `0094` uses. PL/pgSQL variables are NOT
-- transactional, so a failure recorded in `v_fail` survives the rollback and is
-- re-raised afterwards; the probe therefore leaves no row behind whether it
-- passes or fails.
--
-- Two scratch users are created because neither the live project nor the
-- migration chain's own seed (`0012`) contains an **Accounts** row — 0012 seeds
-- Owner, Manager, Warehouse and a `Billing` string — so the role this migration
-- exists to admit could not otherwise be exercised at all.
do $$
declare
  v_booking  uuid;
  v_client   uuid;
  v_branch   uuid;
  v_accounts uuid := gen_random_uuid();
  v_coord    uuid := gen_random_uuid();
  v_invoice  uuid;
  v_no       text;
  v_total    numeric;
  v_refused  boolean;
  v_err      text;
  v_fail     text;
begin
  select b.id, b.client_id, b.branch_id
    into v_booking, v_client, v_branch
    from bookings b
   where b.cancelled_at is null
   order by b.created_at
   limit 1;

  if v_booking is null then
    raise notice
      '0086: this database holds no booking, so the behavioural probe was skipped. '
      'The catalogue post-conditions above still ran.';
    return;
  end if;

  begin
    insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id)
    values
      (v_accounts, gen_random_uuid(), 'PROBE-0086-A', 'probe-0086-accounts@invalid.test',
       'Probe Accounts', '+977-9700000086', 'Accounts', v_branch),
      (v_coord, gen_random_uuid(), 'PROBE-0086-C', 'probe-0086-coordinator@invalid.test',
       'Probe Coordinator', '+977-9700000087', 'Coordinator', v_branch);

    -- ── (A) Accounts — the role R-05 names and the old policy omitted ───────
    set local role authenticated;
    perform set_config('app.current_user_id', v_accounts::text, true);

    insert into invoices (client_uuid, booking_id, client_id, branch_id, due_date, discount_percent, vat_rate)
    values (gen_random_uuid(), v_booking, v_client, v_branch, current_date, 0, 0.1300)
    returning id, invoice_no into v_invoice, v_no;

    -- R-15: no number, and `invoices_issued_together` means no issue_date either.
    if v_no is not null then
      v_fail := format('BEHAVIOURAL 1 FAILED: a Draft was created carrying invoice_no %s; R-15 mints it at issue.', v_no);
    end if;
    if v_fail is null and (select issue_date from invoices where id = v_invoice) is not null then
      v_fail := 'BEHAVIOURAL 1 FAILED: a Draft was dated as though issued; R-15 leaves issue_date null.';
    end if;

    -- ── (B) the line lands AND the totals trigger fires on it ──────────────
    insert into invoice_lines (client_uuid, invoice_id, line_kind, description, quantity, days, unit_rate, line_total)
    values (gen_random_uuid(), v_invoice, 'Equipment Rental', '0086 probe line', 1, 1, 1000, 1000);

    select total_amount into v_total from invoices where id = v_invoice;
    if v_fail is null and coalesce(v_total, 0) = 0 then
      v_fail := format(
        'BEHAVIOURAL 2 FAILED: a line of 1000 landed but total_amount is %s. trg_recalc_invoice_lines did not fire '
        '(or its own UPDATE was refused by invoices_update), so this policy set ships headers that keep lines and '
        'stay free.', coalesce(v_total, 0));
    end if;

    reset role;
    perform set_config('app.current_user_id', '', true);

    -- ── (C) Coordinator — the role R-05 withdraws ──────────────────────────
    v_refused := false;
    begin
      set local role authenticated;
      perform set_config('app.current_user_id', v_coord::text, true);
      insert into invoices (client_uuid, booking_id, client_id, branch_id, due_date)
      values (gen_random_uuid(), v_booking, v_client, v_branch, current_date);
    exception when others then
      v_refused := true;
      v_err := sqlerrm;
    end;
    reset role;
    perform set_config('app.current_user_id', '', true);

    if v_fail is null and not v_refused then
      v_fail := 'BEHAVIOURAL 3 FAILED: a Coordinator raised an invoice. R-05 withdrew that right.';
    end if;
    if v_fail is null and position('row-level security' in coalesce(v_err, '')) = 0 then
      v_fail := format('BEHAVIOURAL 3 FAILED: Coordinator was refused, but not by RLS. Postgres said: %s', v_err);
    end if;

    -- ── (D) Coordinator cannot write a LINE either ─────────────────────────
    -- Checked separately: the two tables carry two policy sets and an invoice
    -- whose header is locked but whose lines are open is still a money hole.
    v_refused := false;
    begin
      set local role authenticated;
      perform set_config('app.current_user_id', v_coord::text, true);
      insert into invoice_lines (client_uuid, invoice_id, line_kind, description, quantity, days, unit_rate, line_total)
      values (gen_random_uuid(), v_invoice, 'Equipment Rental', 'coordinator line', 1, 1, 500, 500);
    exception when others then
      v_refused := true;
      v_err := sqlerrm;
    end;
    reset role;
    perform set_config('app.current_user_id', '', true);

    if v_fail is null and not v_refused then
      v_fail := 'BEHAVIOURAL 4 FAILED: a Coordinator appended a line to an invoice. R-05 withdrew that right.';
    end if;

    raise exception 'ROLLBACK_0086_PROBE';
  exception
    when others then
      reset role;
      if sqlerrm <> 'ROLLBACK_0086_PROBE' then
        raise;
      end if;
      perform set_config('app.current_user_id', '', true);
      if v_fail is not null then
        raise exception '%', v_fail;
      end if;
      raise notice
        '0086 behavioural probe passed and rolled back: Accounts raised a numberless Draft, the line moved the '
        'totals, Coordinator was refused on both tables.';
  end;
end $$;

/*
 * ## What is deliberately NOT constrained: a Draft with no lines
 *
 * The header note above calls a lineless header "a silently free one", and
 * nothing here forbids it. That is on purpose. SPEC-P0-1 §3.1 creates the Draft
 * first and appends to it for the whole rental (R-02, R-03) — damage and late
 * fees arrive at return through `addInvoiceLine` (§3.2) — so a Draft is empty
 * between its creation and its first line, and a NOT-NULL-shaped constraint on
 * "has at least one line" would make the ruled lifecycle impossible.
 *
 * The place to refuse a free invoice is `issue_invoice` (SPEC-P0-1 §3.3), which
 * is where a figure becomes final and a tax number is minted. That function is
 * not written yet and is out of this migration's scope; when it is, an empty
 * line set is one of the conditions it must refuse.
 */

commit;

-- =============================================================================
-- ## Prove it with role simulation, never with a zero-row read
--
-- `rls-masks-rows-not-columns` is the standing lesson: an empty table and a
-- perfectly-enforced policy are indistinguishable, and the MCP connection runs
-- privileged and bypasses RLS entirely.
--
-- This section used to be two blocks of SQL for a human to paste. It is now the
-- **behavioural post-condition block above**, which runs both directions —
-- Accounts admitted, Coordinator refused on the header AND on the line — inside
-- a rollback, every time this migration is applied. An instruction nobody runs
-- proves nothing; that is the whole reason the inert REVOKEs elsewhere in this
-- directory survived three audits.
--
-- What still wants a human, once, after applying: mint an invoice through
-- `create_invoice` (0096) from the running application as a signed-in Accounts
-- user, and read the row back on the Finance screen. The block above proves the
-- policies; only the application proves the wiring.
--
-- ## What this migration deliberately leaves alone
--
--   · **Who may void.** No 4 Sep ruling restates it, so R-00 keeps the older
--     position and `canVoidInvoice` (Owner, Accounts) stands — still at odds
--     with the policy set here. That is AUTHSEC-01's remaining half and it
--     needs a ruling, not a migration.
--   · **`discount_amount`.** R-17 makes it derived; `recalculate_invoice_totals`
--     already overwrites it, so no constraint is added to say so twice.
-- =============================================================================
