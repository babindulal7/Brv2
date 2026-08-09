-- ============================================================================
-- 0016_late_fee.sql
-- Late fee: schema support for Decisions -- 8 Aug 2026, sec 3 Q2.
--
--   "Late fee: <=30 min grace -> 0 . under 2h -> half day . 2h or more ->
--   full day, then full days."
--
-- The formula itself lives in src/lib/money.ts's lateFee() (pure, no I/O,
-- integer paisa, same file this project already uses for every other money
-- calculation). This migration is the schema half: a place to persist a
-- raised finding and a revenue-side vocabulary slot for it, following the
-- strongest existing precedent in this schema -- damage_findings
-- (0003_operations.sql:449-509) -- a Return-workspace-owned record of an
-- observed fact, gated behind Manager/Billing pricing visibility, that only
-- becomes a chargeable amount once approved. This workspace never
-- calculates; src/lib/money.ts already does that.
--
-- Nothing has ever been applied to a live database -- every migration in
-- this repo, including this one, is file-level SQL, unexecuted.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
-- ----------------------------------------
-- It does not add a `charge_id` column pointing at a `charges` table. That
-- table is referenced from damage_findings.charge_id
-- (0003_operations.sql:465, "The charge posted to the Financial Engine")
-- but is not defined ANYWHERE in this migration set -- confirmed by grep
-- across all 15 prior files, zero `create table charges`. Adding a second
-- dangling FK here would compound a pre-existing, unreconciled gap (the
-- open PLAN.md task "Reconcile schema DDL against the 11 rulings") rather
-- than fix anything. TODO(decision) / schema gap: once `charges` exists,
-- add `charge_id uuid references charges (id)` to late_fee_findings,
-- mirroring damage_findings.charge_id exactly.
--
-- It does not write RLS policies. Every table below only carries
-- `enable row level security` with no policies attached, the same state
-- every table in 0002/0003 was left in pending 0011_rls_policies.sql --
-- which predates this table and is an existing file this task may not
-- edit. A follow-up migration is needed once policy work is reconciled
-- generally.
--
-- It does not decide granularity (booking-level vs per return_lines.returned_at,
-- for a Return split across multiple sessions), whether "one day's rate"
-- scopes to equipment only or also crew/transport, or the exact rounding of
-- "then full days" beyond the first 24h. All three are genuinely open --
-- see src/lib/money.ts's lateFee() doc comment and PLAN.md sec 4 -- and are
-- marked TODO(decision) at the column below rather than guessed here.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1 . invoice_lines vocabulary -- a Late Fee line
--
-- line_kind's declaration order IS the Pricing Engine's fixed calculation
-- order for steps 1-5 (0001_enums.sql:1036, "Equipment Rental -> Sub-Rental
-- -> Services -> Crew Charges -> Transport"). A late fee is computed AFTER
-- Return, potentially after the original invoice already issued -- it is not
-- a sixth step in that original chain. Appended, not inserted mid-list, so
-- the existing five keep their positions and their meaning as "the
-- calculation order" is undisturbed.
--
-- Safe to add in this same transaction: the new value is only ever declared
-- here, never used as a literal in this file (0013_business_8_roles.sql's
-- own comment: "Enum additions cannot be used in the same transaction that
-- creates them").
-- ----------------------------------------------------------------------------

alter type line_kind add value if not exists 'Late Fee';

comment on type line_kind is
  'Pricing Engine steps 1-5 in fixed print/calculation sequence (Equipment '
  'Rental . Sub-Rental . Services . Crew Charges . Transport), plus Late Fee '
  '-- appended 8 Aug 2026 sec 3 Q2, deliberately out-of-band: a late fee is '
  'computed after Return, sometimes after the original invoice already '
  'issued, never as a sixth step in the original five-step chain.';


-- ----------------------------------------------------------------------------
-- 2 . late_fee_band -- the three tiers, verbatim from the ruling
--
-- Kept as its own DB enum with the same three members src/lib/money.ts's
-- LateFeeResult.band union uses, rather than reusing an unrelated type --
-- workflow.ts sec 11's "modules import; modules never redefine" is a TS-side
-- rule, but the same discipline applies here: one vocabulary, declared once,
-- shared verbatim by both layers.
-- ----------------------------------------------------------------------------

create type late_fee_band as enum (
  'None',
  'Half Day',
  'Full Day'
);

comment on type late_fee_band is
  'Decisions -- 8 Aug 2026 sec 3 Q2, verbatim: None (<=30 min grace), Half '
  'Day (under 2h), Full Day (2h or more, then full days). Same three values '
  'as lib/money.ts''s LateFeeResult[''band''] -- kept byte-identical '
  'deliberately.';


-- ----------------------------------------------------------------------------
-- 3 . late_fee_findings
--
-- The observed fact (scheduled vs actual return, and the computed
-- breakdown), gated behind the same Manager/Billing-only pricing-visibility
-- shape damage_findings already uses. Mirrors damage_findings' own
-- structure closely on purpose -- see the file header above.
-- ----------------------------------------------------------------------------

create table late_fee_findings (
  id                  uuid                   not null default gen_random_uuid() primary key,
  client_uuid         uuid                   not null unique,
  booking_id          uuid                   not null references bookings (id),
  return_session_id   uuid                   references operation_sessions (id),
  scheduled_return_at timestamptz            not null,
  actual_return_at    timestamptz            not null,
  overage_minutes     numeric(10,2)          not null,
  band                late_fee_band          not null,
  full_days_charged   integer                not null default 0,
  day_rate_amount     numeric(14,2)          not null,
  fee_amount          numeric(14,2)          not null,
  approval_state      damage_approval_state  not null default 'Pending Approval',
  approved_by         uuid                   references users (id),
  approved_at         timestamptz,
  voided_at           timestamptz,
  voided_reason       text,
  created_at          timestamptz            not null default now(),
  created_by          uuid                   not null references users (id),

  constraint late_fee_findings_overage_non_negative check (overage_minutes >= 0),

  -- The ruling's own three thresholds, enforced at the database, not just
  -- trusted from the TS caller -- same reasoning as law 10's discount gate.
  constraint late_fee_findings_band_matches_overage check (
    (band = 'None'     and overage_minutes <= 30)
    or (band = 'Half Day' and overage_minutes > 30  and overage_minutes < 120)
    or (band = 'Full Day' and overage_minutes >= 120)
  ),

  constraint late_fee_findings_full_days_matches_band check (
    (band = 'Full Day' and full_days_charged >= 1)
    or (band <> 'Full Day' and full_days_charged = 0)
  ),

  constraint late_fee_findings_money_non_negative check (
    day_rate_amount >= 0 and fee_amount >= 0
  ),

  -- An early return is the separate, already-modeled 'Returned Early'
  -- concept (booking_flags, 0002_bookings.sql) -- not this table's concern
  -- at all. This CHECK keeps the two from ever being conflated in one row.
  constraint late_fee_findings_actual_not_before_scheduled check (
    actual_return_at >= scheduled_return_at
  ),

  -- This table holds RAISED findings only, same as damage_findings holds
  -- only actual damage. A return within the 30-minute grace produces
  -- band = 'None' and feePaisa = 0 from lib/money.ts's lateFee(), and that
  -- result is never written here at all, exactly as "no damage" writes no
  -- damage_findings row -- so band = 'None' is unrepresentable as a row,
  -- not merely undocumented as out of scope.
  constraint late_fee_findings_no_none_band_rows check (band <> 'None'),

  constraint late_fee_findings_approved_needs_approver check (
    approval_state <> 'Approved'
    or (approved_by is not null and approved_at is not null)
  ),

  constraint late_fee_findings_void_needs_reason check (
    voided_at is null
    or (voided_reason is not null and char_length(btrim(voided_reason)) > 0)
  )
);

comment on column late_fee_findings.booking_id is
  'TODO(decision): whether this is written once per booking (at whichever '
  'session finally completes the Return job) or per return session on a '
  'multi-session Return is unruled -- see lib/money.ts''s lateFee() doc. '
  'bookings.actual_return_at''s own comment ("Evaluated once, at the return '
  'session") reads singular/booking-level, which is why booking_id is the '
  'required link and return_session_id below is only advisory.';
comment on column late_fee_findings.return_session_id is
  'Which session recorded the finding, where known. Nullable: not every '
  'caller can supply this yet, and the booking-vs-session granularity '
  'question above is still open.';
comment on column late_fee_findings.scheduled_return_at is
  'Snapshot of bookings.return_at at the moment this finding was raised -- '
  'not a live join. return_at can move on an extension (0002_bookings.sql: '
  '"An extension moves this value... but is not a stage change"), and a '
  'late fee must be judged against what was agreed at the time, not '
  'whatever the column reads later.';
comment on column late_fee_findings.actual_return_at is
  'Snapshot of bookings.actual_return_at. That column exists in the schema '
  'but nothing in src/ writes it yet (ReturnWorkspace.tsx has no '
  'persistence layer at all) -- this table cannot be populated end-to-end '
  'until that wiring exists. Not fabricated here.';
comment on column late_fee_findings.overage_minutes is
  'The exact elapsed minutes lib/money.ts''s lateFee() computed, not '
  'pre-rounded -- see that function''s doc comment for why rounding '
  'duration would be its own invented rule.';
comment on column late_fee_findings.day_rate_amount is
  'The one-day rate lateFee() was given, snapshotted for audit. '
  'TODO(decision): which lines this aggregates (equipment only, or also '
  'crew/transport) is unruled -- see lib/money.ts''s LateFeeInput.dayRatePaisa.';
comment on column late_fee_findings.fee_amount is
  'lateFee()''s feePaisa, in rupees, at this table''s money precision. This '
  'workspace records the amount; it does not compute it a second time.';
comment on column late_fee_findings.approval_state is
  'Reuses damage_approval_state rather than a near-duplicate type -- same '
  'two-state meaning (Warehouse/Return records a fact; a Manager or Billing '
  'approves the amount before it counts), same as damage_findings.';
comment on column late_fee_findings.approved_by is
  'Owner, Admin (Manager) or Accounts (Billing) only -- never Warehouse. '
  'Enforced by RLS once policies are written; see the file header.';
comment on column late_fee_findings.voided_at is
  'Terminal state. A finding is never deleted or edited in place -- a '
  'correction voids the old row and inserts a new one, same as '
  'damage_findings.';

-- TRIGGER REQUIRED: at most one live (voided_at is null) row per booking_id
--   -- a correction voids the prior row rather than updating it in place.
-- TRIGGER REQUIRED: at least one evidence_references row (return-session
--   evidence) should back a raised finding, same principle as
--   damage_findings' own "a charge raised without evidence is a charge that
--   cannot be defended" -- not enforced here because no spec ties late-fee
--   evidence to a specific evidence_references operation_stage value yet.
-- TRIGGER REQUIRED (RLS): day_rate_amount, fee_amount, approval_state and
--   approved_by are writable only by Owner, Admin or Accounts -- Warehouse
--   sees no money at all (law 6), same column-hiding shape damage_findings
--   uses for estimated_cost.
-- TRIGGER REQUIRED: once a finding's approval_state = 'Approved', posting it
--   as an invoice_lines row of line_kind = 'Late Fee' is a Financial Engine
--   action, not something this table does itself -- damage_findings'
--   pattern again ("This workspace never calculates").
-- NOTHING IS DELETED: no DELETE for any role including Owner. Terminal
--   action is Void.
revoke delete on late_fee_findings from public;
-- TRIGGER REQUIRED: raise on DELETE, so no role with a direct grant can bypass the revoke.

create index late_fee_findings_live_idx on late_fee_findings (booking_id) where voided_at is null;
create index late_fee_findings_approval_idx on late_fee_findings (approval_state) where voided_at is null;

alter table late_fee_findings enable row level security;


-- ----------------------------------------------------------------------------
-- 4 . settlement path -- unchanged, noted for continuity only
--
-- deposit_movements.charge_type already has 'Late' (0001_enums.sql:1053-1057,
-- 0006_finance.sql). That remains the correct, unmodified SETTLEMENT step --
-- once a late_fee_findings row is Approved and posted as a Late Fee invoice
-- line, an operator may choose to pay/offset it from the security deposit
-- via a deposit_movements row with movement_type = 'Applied',
-- charge_type = 'Late', exactly as that column already models. Nothing in
-- 0006_finance.sql is touched by this migration.
-- ----------------------------------------------------------------------------
