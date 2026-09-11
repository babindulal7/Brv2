-- =============================================================================
-- Migration 0121: void_invoice(p_payload jsonb) RPC (Stage 2)
--
-- Law 3: Financial records are immutable. Voiding an invoice is a documented act.
-- Law 4: Payments immutable.
--
-- Single-transaction RPC to void an invoice:
-- - Validates caller role (auth_is_finance_or_admin() or app.override_role)
-- - Validates void_reason >= 10 chars
-- - If invoice is paid (paid_amount > 0), checks or auto-issues a credit_notes row
--   using next_document_number('credit_note')
-- - Updates invoices status = 'Void', void_reason, voided_by, voided_at
-- - Emits audit event
-- - Returns jsonb: { invoice_id, status: 'Void', credit_note_no, voided_at }
-- =============================================================================

begin;

create or replace function void_invoice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice_id        uuid;
  v_client_uuid       uuid;
  v_reason            text;
  v_created_by        uuid;
  v_caller_role       text;
  v_current_status    invoice_status;
  v_paid_amount       numeric(14,2);
  v_total_amount      numeric(14,2);
  v_credit_note_no    text;
  v_credit_note_id    uuid;
  v_voided_at         timestamptz;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'GATE:gate.invoice.void_reason|Payload must be a JSON object.' using errcode = 'P0001';
  end if;

  v_invoice_id := (p_payload ->> 'invoice_id')::uuid;
  if v_invoice_id is null then
    raise exception 'GATE:gate.invoice.void_reason|invoice_id is required.' using errcode = 'P0001';
  end if;

  v_reason := btrim(coalesce(p_payload ->> 'reason', ''));
  if length(v_reason) < 10 then
    raise exception 'GATE:gate.invoice.void_reason|Voiding an invoice requires a reason of at least 10 characters.' using errcode = 'P0001';
  end if;

  v_client_uuid := nullif(p_payload ->> 'client_uuid', '')::uuid;
  if v_client_uuid is null then
    v_client_uuid := gen_random_uuid();
  end if;

  v_created_by := nullif(p_payload ->> 'created_by', '')::uuid;
  if v_created_by is null then
    v_created_by := nullif(current_setting('app.current_user_id', true), '')::uuid;
    if v_created_by is null then
      begin
        v_created_by := auth.uid();
      exception when others then
        null;
      end;
    end if;
  end if;

  -- 1. Role check: Owner, Admin, Manager, Accounts
  v_caller_role := coalesce(
    nullif(current_setting('app.override_role', true), ''),
    auth_user_role()
  );

  if not (auth_is_finance_or_admin() or v_caller_role in ('Owner', 'Admin', 'Manager', 'Accounts')) then
    raise exception 'GATE:gate.invoice.void_role|Only Owner, Admin, Manager, or Accounts may void an invoice.' using errcode = 'P0001';
  end if;

  -- 2. Fetch invoice state
  select status, paid_amount, total_amount
  into v_current_status, v_paid_amount, v_total_amount
  from invoices
  where id = v_invoice_id;

  if not found then
    raise exception 'Invoice % not found.', v_invoice_id using errcode = 'P0002';
  end if;

  if v_current_status = 'Void' then
    raise exception 'GATE:gate.invoice.void_immutable|Invoice % is already voided and cannot be modified.', v_invoice_id using errcode = 'P0001';
  end if;

  -- 3. If paid_amount > 0, ensure credit note exists or mint one
  if coalesce(v_paid_amount, 0) > 0 then
    select id, credit_note_no
    into v_credit_note_id, v_credit_note_no
    from credit_notes
    where invoice_id = v_invoice_id
    order by created_at desc
    limit 1;

    if v_credit_note_id is null then
      v_credit_note_no := next_document_number('credit_note');
      insert into credit_notes (
        client_uuid,
        credit_note_no,
        invoice_id,
        amount,
        reason,
        created_by
      ) values (
        v_client_uuid,
        v_credit_note_no,
        v_invoice_id,
        v_paid_amount,
        v_reason,
        coalesce(v_created_by, (select id from users order by created_at limit 1))
      )
      returning id into v_credit_note_id;
    end if;
  end if;

  -- 4. Update the invoice to Void
  v_voided_at := now();

  update invoices
  set status = 'Void',
      void_reason = v_reason,
      voided_by = v_created_by,
      voided_at = v_voided_at,
      credit_note_no = coalesce(v_credit_note_no, credit_note_no)
  where id = v_invoice_id;

  -- 5. Audit event
  insert into audit_events (
    event_class,
    category,
    module,
    action,
    severity,
    table_name,
    record_id,
    actor_id,
    actor_role,
    old_values,
    new_values,
    reason
  ) values (
    'status change',
    'Finance',
    'Finance',
    'Update',
    'Informational',
    'invoices',
    v_invoice_id,
    v_created_by,
    v_caller_role,
    jsonb_build_object('status', v_current_status),
    jsonb_build_object('status', 'Void', 'credit_note_no', v_credit_note_no),
    v_reason
  );

  return jsonb_build_object(
    'invoice_id', v_invoice_id,
    'status', 'Void',
    'credit_note_no', v_credit_note_no,
    'voided_at', v_voided_at
  );
end;
$$;

grant execute on function void_invoice(jsonb) to authenticated;

comment on function void_invoice(jsonb) is
  'Stage 2 (0121): Atomically issues credit note if invoice was paid, and voids invoice.';

commit;
