-- ============================================================================
-- 0015_canonical_six_stages.sql
-- booking_stage: the retired thirteen -> the canonical six.
--
-- Audit finding, 8 Aug 2026: booking_stage (0001_enums.sql:252-266) still held
-- all thirteen retired stage values -- Quote, Draft, Confirmed, Preparing,
-- Ready, Dispatched, On Rent, Return Due, Inspection, Cleaning, Completed,
-- Closed, Cancelled -- used as bookings.stage and as
-- booking_stage_transitions.from_stage/to_stage, while src/lib/workflow.ts:31
-- had already moved the app onto the canonical six: Quote . Booked . Packed .
-- On Rent . Returned . Closed. The Decisions doc (8 Aug 2026, sec 7/Q26) rules
-- this migration should already have happened. Nothing has ever been applied
-- to a live database -- every migration in this repo, including this one, is
-- file-level SQL, unexecuted.
--
-- THE MAPPING -- workflow.ts sec 1.4's RETIRED table (lines 245-259),
-- transcribed verbatim. This file did not invent it.
--
--   Quote      -> Quote                                  (no flag, no job)
--   Draft      -> Quote      + Flag 'Draft'               (quote not yet sent)
--   Confirmed  -> Booked                                  (no flag)
--   Preparing  -> Booked     + job Pack:'In Progress'
--   Ready      -> Packed                                  (no flag)
--   Dispatched -> Packed     + Flag 'Partial Pickup'
--   On Rent    -> On Rent                                 (no flag)
--   Return Due -> On Rent    + Flag 'Due Soon'
--   Inspection -> Returned   + job Return:'In Progress'
--   Cleaning   -> Returned   + job Reset:'In Progress'
--   Completed  -> Returned                                (no flag)
--   Closed     -> Closed                                  (no flag)
--   Cancelled  -> Quote      + Flag 'Cancelled'
--
-- CANCELLED STAYS A FLAG, NOT A SEVENTH STAGE
-- --------------------------------------------
-- workflow.ts:31 declares BookingStatus a closed six-member union with no
-- Cancelled member, and workflow.ts:149-167 places 'Cancelled' in the
-- separate Flag union under an explicit ruling: "sec 1.3 -- Cancelled is a
-- flag, not a status. It preserves where the booking died." bookings already
-- carries cancelled_at / cancelled_by / cancellation_reason
-- (0002_bookings.sql:39-41), independent of stage -- that is where this
-- flag's data already lives, and always has. Consequence: the two CHECK
-- constraints keyed on stage/to_stage = 'Cancelled' are rewritten below, and
-- the "reachable from any stage" exception for Cancelled that
-- booking_stage_transitions relied on (comment at 0002:488) goes away --
-- cancellation is an orthogonal terminal action on bookings, not a step in
-- the forward-only stage lifecycle.
--
-- WHAT THIS FILE DOES NOT DO
-- ---------------------------
-- Postgres cannot drop a single enum value, only the whole type, so only the
-- STATUS axis of the mapping above (the "-> X" column) is representable as a
-- change to this one enum. The flag and job-state axes -- Draft, Partial
-- Pickup, Due Soon, and the four job states -- have no storage anywhere in
-- this schema today: booking_flags' own CHECK constraint
-- (0002_bookings.sql:535-537) permits storing only 'Returned Early',
-- 'Late Return', 'Missing', 'Damaged', and there is no job-state table at
-- all. Those two axes are silently NOT persisted by this migration -- flagged
-- back to the Build agent's caller rather than invented here, since adding
-- flag/job storage is a schema decision this task was not asked to make.
-- Nothing is actually lost today only because zero bookings and zero
-- booking_stage_transitions rows exist yet to have carried that information
-- (confirmed: 0012_seed_data.sql has no booking or transition rows).
--
-- THE REBUILD PATTERN
-- --------------------
-- Create a fresh six-value type; migrate every column that used the old type
-- onto it via ADD COLUMN / backfill / DROP COLUMN / RENAME (four columns,
-- enumerated in the sections below, are the type's only uses anywhere in this
-- repo -- confirmed by grep across supabase/ and src/); drop the old
-- thirteen-value type once nothing references it; rename the new type back
-- onto the name booking_stage so nothing downstream has to know a rebuild
-- happened.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1 - The new enum. Declared in canonical order (Quote..Closed) so ordinal
-- comparisons (forward-only, no-skipping) keep working exactly as 0001's
-- comment on the old type promised for that one.
-- ----------------------------------------------------------------------------

create type booking_stage_v2 as enum (
  'Quote',
  'Booked',
  'Packed',
  'On Rent',
  'Returned',
  'Closed'
);

-- ----------------------------------------------------------------------------
-- 2 - The migration map, written once and reused for every column below.
-- workflow.ts keeps fromRetiredStage() around "for the schema migration and
-- the go-live import of pre-v2.0 records (sec 9.6)" -- this is that same
-- map's SQL twin, kept (not dropped at the end of this file) for the same
-- reason: it will be needed again if pre-migration data is ever imported.
-- ----------------------------------------------------------------------------

create function retired_stage_to_canonical(old_stage text)
returns booking_stage_v2
language sql
immutable
as $$
  select case old_stage
    when 'Quote'      then 'Quote'
    when 'Draft'      then 'Quote'
    when 'Confirmed'  then 'Booked'
    when 'Preparing'  then 'Booked'
    when 'Ready'      then 'Packed'
    when 'Dispatched' then 'Packed'
    when 'On Rent'    then 'On Rent'
    when 'Return Due' then 'On Rent'
    when 'Inspection' then 'Returned'
    when 'Cleaning'   then 'Returned'
    when 'Completed'  then 'Returned'
    when 'Closed'     then 'Closed'
    when 'Cancelled'  then 'Quote'
    else null
    -- NULL in, NULL out -- from_stage is legitimately null on a booking's
    -- first transition. Any other unmapped input is impossible today: every
    -- caller below passes a booking_stage-typed column cast to text, and
    -- that type had exactly these thirteen members, no others. A future
    -- caller feeding this function looser text (e.g. a go-live import) should
    -- reconsider this branch -- an unmapped non-null value here currently
    -- resolves to NULL rather than raising, which a NOT NULL column will
    -- catch loudly but a nullable one (from_stage) will not.
  end::booking_stage_v2;
$$;

comment on function retired_stage_to_canonical is
  'workflow.ts sec 1.4''s RETIRED table, transcribed to SQL. Status axis only '
  '-- see this migration''s header for why the flag/job axes are not '
  'represented here. Kept after this migration runs for the same reason '
  'workflow.ts keeps fromRetiredStage(): a future import of pre-v2.0 records.';

-- ----------------------------------------------------------------------------
-- 3 - bookings.stage
-- ----------------------------------------------------------------------------

alter table bookings add column stage_v2 booking_stage_v2;

update bookings set stage_v2 = retired_stage_to_canonical(stage::text);

alter table bookings alter column stage_v2 set not null;
alter table bookings alter column stage_v2 set default 'Quote';

alter table bookings drop constraint bookings_cancelled_requires_actor_and_reason;
drop index bookings_branch_stage_pickup_idx;
drop index bookings_branch_stage_return_idx;
drop index bookings_client_stage_idx;

alter table bookings drop column stage;
alter table bookings rename column stage_v2 to stage;

comment on column bookings.stage is
  'Read model of booking_stage_transitions. Written ONLY by that table''s trigger; a direct UPDATE is rejected.';

-- Rewritten to key off cancelled_at instead of stage = 'Cancelled' -- the old
-- literal no longer exists in booking_stage. Same shape, same guarantee:
-- actor and reason travel with cancellation or the row is rejected.
alter table bookings add constraint bookings_cancelled_requires_actor_and_reason check (
  cancelled_at is null
  or (cancelled_by is not null
      and cancellation_reason is not null
      and char_length(btrim(cancellation_reason)) > 0)
);

create index bookings_branch_stage_pickup_idx on bookings (branch_id, stage, pickup_at);
create index bookings_branch_stage_return_idx on bookings (branch_id, stage, return_at);
create index bookings_client_stage_idx on bookings (client_id, stage);

-- ----------------------------------------------------------------------------
-- 4 - booking_stage_transitions.from_stage / to_stage
-- ----------------------------------------------------------------------------

alter table booking_stage_transitions add column from_stage_v2 booking_stage_v2;
alter table booking_stage_transitions add column to_stage_v2 booking_stage_v2;

update booking_stage_transitions set
  from_stage_v2 = retired_stage_to_canonical(from_stage::text),
  to_stage_v2   = retired_stage_to_canonical(to_stage::text);

alter table booking_stage_transitions alter column to_stage_v2 set not null;

-- booking_stage_transitions_cancel_needs_reason (to_stage <> 'Cancelled' or
-- reason present) is DROPPED, not rewritten: to_stage can no longer BE
-- 'Cancelled' -- the literal does not exist in the new type -- so the
-- condition this constraint guards can never fire again. Cancellation moved
-- off the stage lifecycle entirely; bookings_cancelled_requires_actor_and_
-- reason above now carries the equivalent guarantee in the place cancellation
-- actually lives.
alter table booking_stage_transitions drop constraint booking_stage_transitions_cancel_needs_reason;
alter table booking_stage_transitions drop constraint booking_stage_transitions_no_self_transition;
drop index booking_stage_transitions_branch_idx;

alter table booking_stage_transitions drop column from_stage;
alter table booking_stage_transitions drop column to_stage;

alter table booking_stage_transitions rename column from_stage_v2 to from_stage;
alter table booking_stage_transitions rename column to_stage_v2 to to_stage;

comment on column booking_stage_transitions.from_stage is
  'Null only on the row that creates the booking, at Quote. (Previously '
  '"Quote or Draft" -- Draft is now a Flag on Quote, not a separate stage.)';
comment on column booking_stage_transitions.to_stage is
  'The stage this transition moves the booking to -- one of the canonical '
  'six. Never Cancelled: cancellation is a flag on bookings.cancelled_at, '
  'not a stage a transition can target.';

alter table booking_stage_transitions add constraint booking_stage_transitions_no_self_transition check (
  from_stage is null or from_stage <> to_stage
);

create index booking_stage_transitions_branch_idx on booking_stage_transitions (branch_id, to_stage, occurred_at);

-- ----------------------------------------------------------------------------
-- 5 - booking_client_state_map.internal_stage
--
-- Structural re-point only, and flagged rather than redesigned. The table's
-- own premise -- one row per stage, thirteen stages projecting down to eight
-- client_visible_state values -- no longer holds: internal_stage now has six
-- possible values, not thirteen, and its UNIQUE constraint means at most six
-- rows can ever exist, not thirteen (and client_visible_state still has
-- eight). Which of the eight client_visible_state values each canonical
-- stage should now resolve to -- Confirmed and Preparing both land on
-- Booked; do they still need to read as two different client-visible states,
-- or must client_visible_state itself be reworked to match six keys instead
-- of thirteen? -- is a real product decision that the research this
-- migration was built from never made. It is NOT decided here. The table is
-- re-typed and otherwise left exactly as it stood: unseeded (confirmed --
-- 0012_seed_data.sql carries zero rows for this table today, so nothing is
-- lost by not deciding this now) and still carrying its stale
-- "SEED ASSERTION REQUIRED: COUNT(*) = 13" comment in 0002_bookings.sql,
-- which this file cannot edit under its own instructions. Flagged back to the
-- Build agent's caller rather than guessed at.
-- ----------------------------------------------------------------------------

alter table booking_client_state_map add column internal_stage_v2 booking_stage_v2;

update booking_client_state_map set internal_stage_v2 = retired_stage_to_canonical(internal_stage::text);

alter table booking_client_state_map alter column internal_stage_v2 set not null;

alter table booking_client_state_map drop constraint booking_client_state_map_internal_stage_key;
alter table booking_client_state_map drop column internal_stage;
alter table booking_client_state_map rename column internal_stage_v2 to internal_stage;

alter table booking_client_state_map add constraint booking_client_state_map_internal_stage_key unique (internal_stage);

comment on column booking_client_state_map.internal_stage is
  'The real key -- now one of the canonical SIX booking_stage values, not '
  'thirteen. TODO(decision): this table''s premise (thirteen internal stages '
  'projecting onto eight client_visible_state values) no longer holds with '
  'only six possible keys; whether client_visible_state should shrink to '
  'match, or several of its values should be reachable from one '
  'internal_stage row, is unresolved -- see 0015_canonical_six_stages.sql '
  'section 5.';

-- ----------------------------------------------------------------------------
-- 6 - Retire the thirteen-value type and put the new one in its place.
-- ----------------------------------------------------------------------------

drop type booking_stage;
alter type booking_stage_v2 rename to booking_stage;

comment on type booking_stage is
  'Foundation sec 1.1 / workflow.ts sec 1.2, the canonical six, in lifecycle '
  'order (Postgres enum ordering IS the ordinal -- same convention the '
  'retired thirteen-value type used). Rebuilt by 0015_canonical_six_stages.sql '
  'from the retired thirteen -- see that file for the full mapping and what '
  'it could not carry forward (flags, job state).';

commit;
