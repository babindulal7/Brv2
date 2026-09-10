-- =============================================================================
-- Migration 0117: Invoice Void Discipline & Credit Notes (S1-3)
--
-- Law 3: Financial records are immutable. Voiding an invoice is a documented act.
--
-- 1. Helper function auth_is_finance_or_admin() updated to R-05 / S1-a default:
--    Owner, Admin, Manager, Accounts (Coordinator excluded).
-- 2. Table credit_notes created with document numbering sequence 'credit_note'.
-- 3. Invoices void trigger enforces:
--    - Role check: gate.invoice.void_role
--    - Reason check (>=10 chars) & auto-stamps voided_by/voided_at: gate.invoice.void_reason
--    - Paid invoice requires existing credit note: gate.invoice.void_paid
-- 4. Invoices once Void are completely immutable: gate.invoice.void_immutable
--
-- N-5: Written, numbered, tested locally under PGlite.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1 · Update auth_is_finance_or_admin() to Owner, Admin, Manager, Accounts (R-05)
-- -----------------------------------------------------------------------------

create or replace function auth_is_finance_or_admin()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select auth_user_role() in ('Owner', 'Admin', 'Manager', 'Accounts');
$$;

comment on function auth_is_finance_or_admin is
  'Stage 1 (0117): Owner, Admin, Manager, Accounts per R-05 / S1-a. Coordinator excluded.';

-- -----------------------------------------------------------------------------
-- 2 · Number sequence for credit notes
-- -----------------------------------------------------------------------------

insert into number_sequences (sequence_key, prefix, current_year, current_value, padding, include_year)
values ('credit_note', 'CN-', extract(year from current_date)::int, 0, 1, false)
on conflict (sequence_key) do nothing;

-- -----------------------------------------------------------------------------
-- 3 · Table credit_notes
-- -----------------------------------------------------------------------------

create table if not exists credit_notes (
  id              uuid          not null default gen_random_uuid() primary key,
  client_uuid     uuid          not null unique default gen_random_uuid(),
  credit_note_no  text          not null unique,
  invoice_id      uuid          not null references invoices (id),
  amount          numeric(14,2) not null,
  reason          text          not null,
  created_at      timestamptz   not null default now(),
  created_by      uuid          not null references users (id),

  constraint credit_notes_amount_positive check (amount > 0),
  constraint credit_notes_reason_length check (char_length(btrim(reason)) >= 10)
);

comment on table credit_notes is
  'Stage 1 (0117): Formal credit notes issued against invoices. Required before voiding a paid invoice.';

alter table credit_notes enable row level security;

-- Policies for credit_notes
drop policy if exists credit_notes_select on credit_notes;
create policy credit_notes_select on credit_notes
  for select
  using (
    auth_is_finance_or_admin()
  );

drop policy if exists credit_notes_insert on credit_notes;
create policy credit_notes_insert on credit_notes
  for insert
  with check (
    auth_is_finance_or_admin()
  );

-- No DELETE policy: Law 3.

-- -----------------------------------------------------------------------------
-- 4 · Replace old CHECK constraint on invoices
-- -----------------------------------------------------------------------------

alter table invoices drop constraint if exists invoices_void_requires_reason;

-- -----------------------------------------------------------------------------
-- 5 · Trigger for invoice void discipline & immutability
-- -----------------------------------------------------------------------------

create or replace function reject_invoice_edit_after_issue()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 1. Voided invoices are completely immutable
  if OLD.status = 'Void' then
    raise exception 'GATE:gate.invoice.void_immutable|A voided invoice is immutable and cannot be modified.' using errcode = 'P0001';
  end if;

  -- 2. Draft invoices can be edited freely (except cannot transition directly to Void without discipline)
  if OLD.status = 'Draft' and NEW.status <> 'Void' then
    return NEW;
  end if;

  -- 3. Voiding transition: status becomes 'Void'
  if NEW.status = 'Void' and OLD.status <> 'Void' then
    -- (a) Role check: Owner, Admin, Manager, Accounts
    if not (auth_is_finance_or_admin() or coalesce(current_setting('app.override_role', true), '') in ('Owner', 'Admin', 'Manager', 'Accounts')) then
      raise exception 'GATE:gate.invoice.void_role|Only Owner, Admin, Manager, or Accounts may void an invoice.' using errcode = 'P0001';
    end if;

    -- (b) Reason check (>= 10 chars)
    if length(coalesce(btrim(NEW.void_reason), '')) < 10 then
      raise exception 'GATE:gate.invoice.void_reason|Voiding an invoice requires a reason of at least 10 characters.' using errcode = 'P0001';
    end if;

    -- Auto-stamp voided_by and voided_at if not set
    if NEW.voided_by is null then
      NEW.voided_by := nullif(current_setting('app.current_user_id', true), '')::uuid;
      if NEW.voided_by is null then
        begin
          NEW.voided_by := auth.uid();
        exception when others then
          null;
        end;
      end if;
    end if;
    if NEW.voided_at is null then
      NEW.voided_at := now();
    end if;

    if NEW.voided_by is null or NEW.voided_at is null then
      raise exception 'GATE:gate.invoice.void_reason|Voiding an invoice requires voided_by and voided_at.' using errcode = 'P0001';
    end if;

    -- (c) If paid_amount > 0, credit note must exist
    if OLD.paid_amount > 0 then
      if not exists (
        select 1 from credit_notes
        where invoice_id = NEW.id
      ) then
        raise exception 'GATE:gate.invoice.void_paid|Cannot void an invoice with payments unless a credit note has been issued.' using errcode = 'P0001';
      end if;

      if NEW.credit_note_no is null then
        select credit_note_no into NEW.credit_note_no
        from credit_notes
        where invoice_id = NEW.id
        order by created_at desc
        limit 1;
      end if;
    end if;

    -- Figures must remain unchanged while voiding
    if NEW.subtotal is distinct from OLD.subtotal
      or NEW.discount_amount is distinct from OLD.discount_amount
      or NEW.discount_percent is distinct from OLD.discount_percent
      or NEW.taxable_amount is distinct from OLD.taxable_amount
      or NEW.vat_amount is distinct from OLD.vat_amount
      or NEW.total_amount is distinct from OLD.total_amount
      or NEW.due_date is distinct from OLD.due_date
    then
      raise exception 'Law 4/finance: invoice % cannot change its own figures while being voided.', OLD.invoice_no;
    end if;

    return NEW;
  end if;

  -- 4. An issued invoice cannot revert to Draft
  if NEW.status = 'Draft' and OLD.status <> 'Draft' then
    raise exception 'Law 4/finance: an issued invoice (%) cannot revert to Draft.', OLD.invoice_no;
  end if;

  -- 5. Figures are immutable on issued invoices
  if NEW.subtotal is distinct from OLD.subtotal
    or NEW.discount_amount is distinct from OLD.discount_amount
    or NEW.discount_percent is distinct from OLD.discount_percent
    or NEW.taxable_amount is distinct from OLD.taxable_amount
    or NEW.vat_amount is distinct from OLD.vat_amount
    or NEW.total_amount is distinct from OLD.total_amount
    or NEW.due_date is distinct from OLD.due_date
  then
    raise exception 'Law 4/finance: invoice % is issued (status %) — its figures are immutable. Corrections take Void + Credit Note, never a direct edit.', OLD.invoice_no, OLD.status;
  end if;

  return NEW;
end;
$$;

commit;
