-- ============================================================================
-- 0044_law3_delete_backstops.sql — generated 11 Aug 2026
-- (PLAN.md Phase 1 audit, fix group: "constraints that enforce laws 3, 4, 5,
--  9, 10 at the database" — laws 9 and 5 verified DONE, law 4 verified DONE
--  for app roles; laws 3 and 10 had the two holes closed here.)
--
-- WHY — hole 1, law 3 (nothing is deleted)
-- -----------------------------------------
-- Every other schema file revokes DELETE `from public, anon, authenticated`
-- (0003:1616, 0004:691, 0005:1007, 0006:537, 0007:401, 0008:220, 0009:266).
-- 0002_bookings.sql alone revokes `from public` and nothing else, on all
-- eleven of its tables (0002:110, 214, 298, 358, 416, 485, 561, 679, 731,
-- 767, 804), and 0016_late_fee.sql:236 repeats the same shape on
-- late_fee_findings.
--
-- `from public` does not touch a privilege granted directly to a role, and
-- Supabase grants DELETE directly to `anon` and `authenticated` on every
-- table in the exposed schema. The rest of the repo assumes exactly this —
-- that is why the other seven files name the two roles explicitly. So today
-- every booking table, and late_fee_findings, is deletable by any signed-in
-- session: law 3 is enforced nowhere for the twelve tables the booking
-- workspace is built on.
--
-- WHY — hole 2, law 3's promised trigger backstop
-- ------------------------------------------------
-- 0002 and 0016 carry twelve `-- TRIGGER REQUIRED: raise on DELETE, so no
-- role with a direct grant can bypass the revoke` comments (0002:111, 215,
-- 299, 359, 417, 486, 562, 680, 732, 768; 0016:237). No such trigger exists
-- in any of the 43 files. A revoke is not a backstop: `service_role` is a
-- documented writer on this schema (0040:60-68) and bypasses RLS and role
-- grants by Supabase design, and the table owner keeps every privilege
-- regardless of what is revoked from anyone else. A BEFORE DELETE trigger
-- is the only mechanism that binds all of them, which is precisely what
-- those comments asked for. Written here.
--
-- 0002:486 additionally promises a raise on UPDATE for
-- booking_stage_transitions ("APPEND-ONLY. No UPDATE, no DELETE, for anyone
-- including Owner. A wrong transition is corrected by inserting a reversal
-- row." — 0002:483-484). Added.
--
-- WHY — hole 3, law 10 (the stacked 25% cap was UPDATE-blind)
-- ------------------------------------------------------------
-- The per-row caps are table CHECKs (0002:592-599) and therefore hold on
-- UPDATE as well as INSERT. The *cumulative* cap is not a CHECK — it cannot
-- be, it reads sibling rows — it is enforce_booking_discount_stacking()
-- (0002:633-676), and that trigger was registered `before insert` only
-- (0002:674-676). UPDATE on booking_discounts is not revoked and
-- booking_discounts_money_blind (0036:133-136) is `for all`, so a
-- Coordinator could insert 10 + 10 and then edit one row to 20: each row
-- passes its own CHECK, the booking lands at 30%, and the "no role bypass,
-- including Owner" clause of law 10 is broken by an ordinary UPDATE.
-- The trigger is re-registered `before insert or update` below.
--
-- FORWARD-ONLY, not an edit to 0002/0016 — same choice 0015, 0021 and 0043
-- made for defects found in 0002. A second `revoke` of a privilege that was
-- already revoked is a no-op, so this file is safe to run against a database
-- built from the corrected files or the original ones.
--
-- DELIBERATELY NOT REVOKED FROM service_role: 0040:60-68 records that the
-- Booqable Edge Functions are service_role and are the only writer on the
-- sync tables. Revoking from it would be a functional change to that
-- integration, and it would not help anyway — service_role bypasses the
-- grant system. The triggers below are what binds it.
--
-- FILE ONLY — never applied to any live Supabase project (repo hard rule).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1 ▸ law 3 · the revokes 0002 and 0016 should have written.
--     Privilege list and table list are unchanged; only the role list widens
--     from `public` to the `public, anon, authenticated` the other seven
--     schema files already use.
-- ---------------------------------------------------------------------------
revoke delete on
  bookings,
  booking_lines,
  booking_line_units,
  booking_crew_lines,
  booking_transport,
  booking_stage_transitions,
  booking_flags,
  booking_discounts,
  booking_documents,
  booking_notes,
  booking_client_state_map
from public, anon, authenticated;

-- Append-only: a wrong transition is corrected by inserting a reversal row.
revoke update on booking_stage_transitions from public, anon, authenticated;

revoke delete on late_fee_findings from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2 ▸ law 3 · the DELETE backstop the twelve `TRIGGER REQUIRED` comments
--     promise. One function, one trigger per table, the table's own named
--     terminal action passed as the argument so the error tells the caller
--     what to do instead of deleting.
--
--     Not SECURITY DEFINER on purpose: a BEFORE DELETE trigger fires for
--     whoever attempts the delete regardless of who owns the function, and
--     an unprivileged body has nothing to escalate.
-- ---------------------------------------------------------------------------
create or replace function reject_delete_nothing_is_deleted()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Law 3 (nothing is deleted): DELETE on % is rejected for every role including Owner and service_role. Terminal action: %.',
    TG_TABLE_NAME, TG_ARGV[0];
end;
$$;

comment on function reject_delete_nothing_is_deleted() is
  'Law 3 backstop. The revokes in 0002/0016/0044 stop role grants; this stops the table owner and service_role, which no revoke reaches. TG_ARGV[0] is the table''s named terminal action.';

-- 0002:109 — "Terminal action is Cancel."
create trigger trg_bookings_reject_delete
  before delete on bookings
  for each row execute function reject_delete_nothing_is_deleted('Cancel');

-- 0002:213 — "a removed line is Voided so it stays visible in history."
create trigger trg_booking_lines_reject_delete
  before delete on booking_lines
  for each row execute function reject_delete_nothing_is_deleted('Void');

-- 0002:297 — "a unit is released by voiding its parent line or by Swap."
create trigger trg_booking_line_units_reject_delete
  before delete on booking_line_units
  for each row execute function reject_delete_nothing_is_deleted('Void the parent line, or Swap');

-- 0002:357 — "terminal action is Void."
create trigger trg_booking_crew_lines_reject_delete
  before delete on booking_crew_lines
  for each row execute function reject_delete_nothing_is_deleted('Void');

-- 0002:415-416 — no terminal action named; a transport row is corrected, not removed.
create trigger trg_booking_transport_reject_delete
  before delete on booking_transport
  for each row execute function reject_delete_nothing_is_deleted('correct the row in place');

-- 0002:483-484 — "A wrong transition is corrected by inserting a reversal row."
create trigger trg_booking_stage_transitions_reject_delete
  before delete on booking_stage_transitions
  for each row execute function reject_delete_nothing_is_deleted('insert a reversal row');

-- 0002:559-560 — "a Late Return row is not auto-cleared"; a raised flag stays raised.
create trigger trg_booking_flags_reject_delete
  before delete on booking_flags
  for each row execute function reject_delete_nothing_is_deleted('none — a raised flag stays raised');

-- 0002:678 — "a withdrawn discount is a new row, and audit already holds the original."
create trigger trg_booking_discounts_reject_delete
  before delete on booking_discounts
  for each row execute function reject_delete_nothing_is_deleted('a withdrawn discount is a new row');

-- 0002:729-730 — "the document's terminal action is Archive, taken in the document store."
create trigger trg_booking_documents_reject_delete
  before delete on booking_documents
  for each row execute function reject_delete_nothing_is_deleted('Archive, in the document store');

-- 0002:766 — "terminal action is Archive."
create trigger trg_booking_notes_reject_delete
  before delete on booking_notes
  for each row execute function reject_delete_nothing_is_deleted('Archive');

-- 0016:235-236 — "Terminal action is Void."
create trigger trg_late_fee_findings_reject_delete
  before delete on late_fee_findings
  for each row execute function reject_delete_nothing_is_deleted('Void');

-- booking_client_state_map is deliberately absent from the trigger list. Its
-- revoke is corrected above, but it is the 13-row seeded stage→client-state
-- lookup (0002:799 "SEED ASSERTION REQUIRED: COUNT(*) = 13"), not booking
-- history, and it is the one table in 0002 whose comments never ask for a
-- DELETE trigger. Pinning a seed table shut would make reseeding it a schema
-- change; that is a different decision from law 3 and is not taken here.


-- ---------------------------------------------------------------------------
-- 3 ▸ law 3 · booking_stage_transitions is append-only, so UPDATE needs the
--     same backstop DELETE just got (0002:486 asks for both).
-- ---------------------------------------------------------------------------
create or replace function reject_update_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Law 3 (append-only): UPDATE on % is rejected for every role including Owner and service_role. Correction: %.',
    TG_TABLE_NAME, TG_ARGV[0];
end;
$$;

comment on function reject_update_append_only() is
  'Law 3/4 backstop for append-only tables, mirroring reject_delete_nothing_is_deleted(). TG_ARGV[0] is the correction path the table does support.';

create trigger trg_booking_stage_transitions_reject_update
  before update on booking_stage_transitions
  for each row execute function reject_update_append_only('insert a reversal row');


-- ---------------------------------------------------------------------------
-- 4 ▸ law 10 · the cumulative cap must survive UPDATE, not only INSERT.
--
--     Body is 0002:633-672 unchanged except for the sibling filter: the
--     existing-sum and exclusive-source reads now exclude the row being
--     written (`id <> NEW.id`). On INSERT that is a no-op — the row does not
--     exist yet, and NEW.id is already populated by the column default. On
--     UPDATE it is what stops the row being counted against itself, which
--     would otherwise reject every edit that left the total unchanged.
--
--     TODO(decision) — whether booking_discounts should be append-only
--     outright (`revoke update`, the shape 0003/0005/0006 use for their
--     append-only tables) is NOT decided here. 0002:678 says "a withdrawn
--     discount is a new row", which reads append-only, but the table has no
--     voided_at and percent is `check (percent >= 0)`, so there is no way to
--     express a withdrawal as a row today. Resolving that needs a ruling on
--     how a discount is withdrawn, not a guess — add it to PLAN.md §4. Until
--     then UPDATE stays legal and this trigger governs it.
--
--     The 'Manual' stacking-matrix TODO(decision) at 0002:625-632 is
--     untouched and still open.
-- ---------------------------------------------------------------------------
create or replace function enforce_booking_discount_stacking()
returns trigger
language plpgsql
as $$
declare
  v_existing_sum numeric(5,2);
  v_total numeric(5,2);
  v_exclusive_sources discount_source[] := array['Student', 'College', 'Named-client rates']::discount_source[];
begin
  select coalesce(sum(percent), 0) into v_existing_sum
  from booking_discounts
  where booking_id = NEW.booking_id
    and id <> NEW.id;

  v_total := v_existing_sum + NEW.percent;

  if v_total > 25 then
    raise exception 'Law 10: this booking''s discounts would total % percent across % row(s), over the 25 percent hard cap that applies to the stacked total, not just one row.',
      v_total, (select count(*) + 1 from booking_discounts where booking_id = NEW.booking_id and id <> NEW.id);
  end if;

  if v_total > 10 and not (char_length(btrim(NEW.reason)) >= 10 and NEW.approver_id is not null) then
    raise exception 'Law 10: this booking''s stacked discount total (% percent) crosses 10 percent even though this row alone is % percent — the reason (>=10 chars) and named-approver requirement applies to the row that crosses the cumulative threshold, not only to a row over 10 percent on its own.',
      v_total, NEW.percent;
  end if;

  if NEW.discount_source = any(v_exclusive_sources) then
    if v_existing_sum > 0 then
      raise exception 'Law 10: % does not stack with any other discount on the same booking, but this booking already has another discount row applied.', NEW.discount_source;
    end if;
  elsif exists (
    select 1 from booking_discounts
    where booking_id = NEW.booking_id and id <> NEW.id and discount_source = any(v_exclusive_sources)
  ) then
    raise exception 'Law 10: this booking already has a % discount, which does not stack with any other discount.',
      (select discount_source from booking_discounts where booking_id = NEW.booking_id and id <> NEW.id and discount_source = any(v_exclusive_sources) limit 1);
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_booking_discounts_stacking on booking_discounts;

create trigger trg_booking_discounts_stacking
  before insert or update on booking_discounts
  for each row execute function enforce_booking_discount_stacking();
