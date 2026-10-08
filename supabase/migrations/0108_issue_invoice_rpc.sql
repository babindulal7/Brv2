-- =============================================================================
-- Migration 0108: `issue_invoice(jsonb)` and `issue_invoice(uuid)` RPC (Stage 1)
--
-- Closes MONEY-06:
-- - Issues an invoice in Draft status with at least one line.
-- - Checks permissions: Owner, Admin, Manager, Accounts (R-05), and auth_can_view_money().
-- - Mints unique invoice_no using next_document_number('invoice') (R-15).
-- - Sets issue_date (defaults to current_date) and calculates due_date based on
--   client payment terms.
-- - Sets status: 'Paid' if outstanding is 0 and total > 0, 'Partially Paid' if paid > 0,
--   or 'Sent'.
-- - Once issued, figures become immutable under reject_invoice_edit_after_issue().
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;

create or replace function public.issue_invoice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice_id   uuid    := (p_payload ->> 'invoice_id')::uuid;
  v_actor        uuid    := nullif(coalesce(p_payload ->> 'issued_by', p_payload ->> 'actor_id', ''), '')::uuid;
  v_issue_date   date    := nullif(coalesce(p_payload ->> 'issue_date', ''), '')::date;
  v_role         system_role;
  v_invoice      invoices%rowtype;
  v_line_count   integer := 0;
  v_invoice_no   text;
  v_terms        text;
  v_term_days    integer := 0;
  v_due_date     date;
  v_new_status   invoice_status;
begin
  -- 1. Role & authorization checks (R-05)
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Accounts') then
    raise exception
      'issue_invoice: this session (%) may not issue an invoice. R-05 gives that to Owner, Admin, Manager and Accounts.',
      coalesce(v_role::text, 'unidentified')
      using errcode = '42501';
  end if;

  if not auth_can_view_money() then
    raise exception
      'issue_invoice: this session cannot read money (Law 6), so it cannot issue an invoice.'
      using errcode = '42501';
  end if;

  if v_invoice_id is null then
    raise exception 'issue_invoice: invoice_id is required.';
  end if;

  -- 2. Verify invoice existence and eligibility
  select * into v_invoice from invoices where id = v_invoice_id;
  if not found then
    raise exception 'issue_invoice: invoice % does not exist.', v_invoice_id;
  end if;

  if v_invoice.voided_at is not null or v_invoice.status = 'Void' then
    raise exception 'issue_invoice: invoice % is voided and cannot be issued.', v_invoice_id;
  end if;

  if v_invoice.status <> 'Draft' or v_invoice.invoice_no is not null then
    raise exception
      'issue_invoice: invoice % is already issued (status %, invoice_no %). Only a Draft can be issued.',
      v_invoice_id, v_invoice.status, v_invoice.invoice_no;
  end if;

  select count(*) into v_line_count from invoice_lines where invoice_id = v_invoice_id;
  if v_line_count = 0 then
    raise exception 'issue_invoice: invoice % has no lines. An empty invoice cannot be issued.', v_invoice_id;
  end if;

  -- 3. Mint invoice number (R-15)
  v_invoice_no := next_document_number('invoice');
  if v_invoice_no is null then
    raise exception 'issue_invoice: next_document_number failed to mint an invoice number.';
  end if;

  -- 4. Date calculation
  v_issue_date := coalesce(v_issue_date, current_date);

  select payment_terms::text into v_terms from clients where id = v_invoice.client_id;
  v_term_days := case coalesce(v_terms, 'Immediate')
                   when '7 days'  then 7
                   when '15 days' then 15
                   when '30 days' then 30
                   else 0
                 end;
  v_due_date := v_issue_date + v_term_days;

  -- 5. Determine status
  if v_invoice.outstanding_amount = 0 and v_invoice.total_amount > 0 then
    v_new_status := 'Paid'::invoice_status;
  elsif v_invoice.paid_amount > 0 then
    v_new_status := 'Partially Paid'::invoice_status;
  else
    v_new_status := 'Sent'::invoice_status;
  end if;

  -- 6. Update the invoice row
  update invoices
     set invoice_no = v_invoice_no,
         issue_date = v_issue_date,
         due_date   = coalesce(v_due_date, due_date),
         status     = v_new_status,
         updated_at = now(),
         updated_by = coalesce(v_actor, v_invoice.updated_by)
   where id = v_invoice_id;

  -- 7. Read back updated invoice
  select * into v_invoice from invoices where id = v_invoice_id;

  return jsonb_build_object(
    'invoice_id',         v_invoice.id,
    'invoice_no',         v_invoice.invoice_no,
    'status',             v_invoice.status,
    'issue_date',         v_invoice.issue_date,
    'due_date',           v_invoice.due_date,
    'booking_id',         v_invoice.booking_id,
    'client_id',          v_invoice.client_id,
    'line_count',         v_line_count,
    'subtotal',           v_invoice.subtotal,
    'discount_amount',    v_invoice.discount_amount,
    'taxable_amount',     v_invoice.taxable_amount,
    'vat_amount',         v_invoice.vat_amount,
    'total_amount',       v_invoice.total_amount,
    'paid_amount',        v_invoice.paid_amount,
    'outstanding_amount', v_invoice.outstanding_amount
  );
end;
$$;

create or replace function public.issue_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return issue_invoice(jsonb_build_object('invoice_id', p_invoice_id));
end;
$$;

comment on function public.issue_invoice(jsonb) is
  'Issues a Draft invoice: mints invoice_no via next_document_number(''invoice'') (R-15), '
  'sets issue_date, derives due_date from client terms, sets status (Sent/Paid), and locks figures '
  'under reject_invoice_edit_after_issue(). R-05 role check enforced.';

comment on function public.issue_invoice(uuid) is
  'Convenience overload of issue_invoice(jsonb).';

revoke execute on function public.issue_invoice(jsonb) from public;
grant execute on function public.issue_invoice(jsonb) to authenticated;

revoke execute on function public.issue_invoice(uuid) from public;
grant execute on function public.issue_invoice(uuid) to authenticated;

commit;
