-- =============================================================================
-- 0151_payment_numbering_short_format.sql
--
-- Payment Numbering Ruling (Babin, 3 Oct 2026):
-- Switch payment sequence from four-digit padded format ('PAY-0094') to
-- short sequential format ('PAY-94') with padding = 1 and include_year = false.
--
-- Background:
-- - Historical payments 1..93 ('PAY-2026-0001' .. 'PAY-2026-0093') remain
--   immutable under Law 3 and Law 4 (trg_payments_reject_update).
-- - In 0081_ruled_sequences_completion.sql, payment was left pending Babin's
--   ruling. This migration applies Babin's decision (Option 2), aligning new
--   payment receipts with other short document sequences ('BK-1', 'INV-1').
-- - In 0089_next_document_number_never_truncates.sql, payment regex
--   '^PAY-([0-9]{4}-)?[0-9]+$' already validates both historical and short formats.
-- =============================================================================

begin;

update public.number_sequences
set padding = 1,
    include_year = false,
    updated_at = now()
where sequence_key = 'payment';

-- Prove that payment sequence configuration is updated to padding 1, include_year false
do $$
declare
  v_rec record;
begin
  select padding, include_year into v_rec
  from public.number_sequences
  where sequence_key = 'payment';

  if v_rec.padding <> 1 or v_rec.include_year <> false then
    raise exception 'POST-CONDITION FAILED: payment sequence padding is % (expected 1), include_year is % (expected false)',
      v_rec.padding, v_rec.include_year;
  end if;
end $$;

commit;
