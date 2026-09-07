-- RULING 2026-09-07 (R-19/R-20): booking counter re-pointed 917 -> 945 so the next
-- mint is B-946, not a truncated B-9 that collides; 0089 then applied to live under
-- Babin's explicit word (CLAUDE.md 15 N-5). See RULINGS-2026-09-07.md.
-- =============================================================================
-- ROLLBACK for 0089, applied to PRODUCTION (sxguwvgoserhdolewibb) 7 Sep 2026.
--
-- Taken because Babin approved applying 0089 to live with NO database dump in
-- existence (PHASE-0 step 0 is still open). This file is the only restore point
-- for what that apply changed, so it is captured verbatim from production
-- BEFORE the change, via pg_get_functiondef.
--
-- What 0089 changed on live, and how to undo each part:
--
--   1. `next_document_number` was replaced. The pre-change definition is below,
--      exactly as production held it. Note it had NO search_path pin
--      (proconfig was null); 0089 adds `set search_path = public, pg_temp`.
--      Restoring the body below also drops that pin, which is a security
--      regression (0050 convention) — restore only to undo a real fault.
--
--   2. A `transfer` row was inserted into `number_sequences`. To undo:
--        delete from number_sequences where sequence_key = 'transfer';
--      Safe ONLY while no stock_transfers row has been numbered from it.
--
--   3. SEPARATELY (not part of 0089): the `booking` counter was re-pointed
--      917 -> 945, so the next mint is B-946 rather than a truncated B-9 that
--      collides. No booking row was touched. To undo:
--        update number_sequences set current_value = 917 where sequence_key = 'booking';
--      Undoing this re-bricks booking creation; it is recorded for completeness,
--      not as a recommendation.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.next_document_number(p_sequence_key text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare
  v_rec record;
  v_year integer := extract(year from current_date);
  v_next_val bigint;
  v_formatted text;
begin
  select * into v_rec from number_sequences where sequence_key = p_sequence_key for update;

  if not found then
    raise exception 'Number sequence % does not exist', p_sequence_key;
  end if;

  -- A year-less sequence must never reset on a year change: it would re-issue
  -- a number it has already handed out.
  if v_rec.include_year and v_rec.current_year <> v_year then
    v_next_val := 1;
    update number_sequences
    set current_year = v_year, current_value = 1, updated_at = now()
    where sequence_key = p_sequence_key;
  else
    v_next_val := v_rec.current_value + 1;
    update number_sequences
    set current_value = v_next_val, current_year = v_year, updated_at = now()
    where sequence_key = p_sequence_key;
  end if;

  if v_rec.include_year then
    v_formatted := v_rec.prefix || v_year::text || '-' || lpad(v_next_val::text, v_rec.padding, '0');
  else
    v_formatted := v_rec.prefix || lpad(v_next_val::text, v_rec.padding, '0');
  end if;

  return v_formatted;
end;
$function$;
