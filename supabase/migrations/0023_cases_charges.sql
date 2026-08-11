-- =============================================================================
-- 0023_cases_charges.sql — the two tables `damage_findings.case_id`,
-- `damage_findings.charge_id` and `evidence_references.case_id` were declared
-- against since 0003_operations.sql, but that neither migration nor any other
-- ever created ("assets"/"documents" was the same defect; those two are fixed
-- by repointing to product_units/document_registry — see the forward-
-- reference comments left at each site once product_units/document_registry
-- existed. cases/charges had no real table AT ALL to repoint to, so those
-- three FKs were stripped to plain uuid with an explicit TODO(decision)
-- instead, per CLAUDE.md's hard rule against inventing a product decision).
--
-- That decision doesn't need inventing — it's already made. `src/data/
-- cases.ts`'s own header: "Cases (Incident Management) seed data — `04
-- Operations/Cases.md` v1.1 (Build Locked)". Build-locked means Cases is a
-- ruled, spec'd feature, not an open question; only its *database* form was
-- never written. `cases` below is that spec's `Case` interface ported to DDL,
-- the same "spec exists in TS, port it to SQL" step every other table in this
-- project has already been through.
--
-- `charges` has no equivalent dedicated spec doc. It exists here only because
-- damage_findings.charge_id already needed a real target ("The charge posted
-- to the Financial Engine. This workspace never calculates." —
-- 0003_operations.sql) and 0016_late_fee.sql explicitly deferred wiring
-- late_fee_findings.charge_id to it for the same reason. Kept intentionally
-- minimal: the bridge from an *approved* finding to a *posted* invoice line,
-- nothing more invented onto it.
--
-- Placed after 0003 (damage_findings, evidence_references), 0006 (invoice_
-- lines), 0009 (crew/vehicles — irrelevant here but numerically last of the
-- originally-dependent files) and 0016 (late_fee_findings) — charges
-- references invoice_lines and late_fee_findings, both created later than
-- damage_findings, so this could not have lived inline in 0003 without
-- hitting the exact forward-reference problem this file exists to close.
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Vocabularies. Fixed 10 Aug 2026 (first real apply): four of the six enums
-- this file originally declared — case_type, case_priority, case_status,
-- case_flag — already exist in 0001_enums.sql with label-identical
-- definitions (compared value-by-value before removing, not assumed).
-- 0001 owns them, comments and all; this file was written for a different
-- thread (§4.10) and re-derived them from src/data/cases.ts without noticing
-- 0001 already had them from the spec directly. Only the two enums 0001 does
-- NOT carry are declared here.
-- ----------------------------------------------------------------------------

create type case_counterparty_kind as enum (
  'Client', 'Partner', 'Vendor'
);
comment on type case_counterparty_kind is
  'src/data/cases.ts CounterpartyKind, verbatim.';

create type charge_source_type as enum (
  'Damage', 'Late Fee'
);
comment on type charge_source_type is
  'The two finding tables that post a charge today: damage_findings, late_fee_findings (0016_late_fee.sql). Not a general vocabulary — extend only when a third finding type is added.';


-- ===========================================================================
-- cases
-- Incident management: damage, missing/theft, disputes and vendor recovery,
-- each with its own closed disposition set, a priority/status pair, and the
-- §7.3 allocation buckets that stay zero until a disposition is chosen.
--
-- Deliberately narrower than src/data/cases.ts's full `Case` interface:
-- ported are the scalar/enum fields plus the one relational fact damage_
-- findings/evidence_references actually need (a real `id` to point at).
-- NOT modeled here — left for whenever CasesWorkspace.tsx is itself wired to
-- real data (it currently isn't: AUDIT_FINDINGS.md P0 #2 — no useCanViewMoney
-- gate; P1 #13 — it reads its own disjoint local array, not this table's
-- future row shape, so there is no live consumer to build the fuller
-- relational model against yet):
--   - `equipment` (per-case unit list — would be a case_units join table)
--   - `evidence` (CaseEvidence's pickup/return/general photo buckets —
--     evidence_references already exists and is the real mechanism; a case's
--     evidence is queried via evidence_references.case_id, not duplicated
--     here)
--   - the rest of `linked` (Sub-Rental linkage, maintenanceJobId, invoiceId,
--     insuranceClaim — Booking linkage alone is modeled below, since that is
--     the relationship damage_findings' own flow implies)
--   - `timelineExtra` (free-form timeline entries beyond what audit_events
--     already captures)
-- ===========================================================================

create table cases (
  id                              uuid                    not null default gen_random_uuid() primary key,
  client_uuid                     uuid                    not null unique,
  case_no                         text                    not null unique,
  type                            case_type               not null,
  title                           text                    not null,
  counterparty_kind               case_counterparty_kind  not null,
  counterparty_name               text                    not null,
  priority                        case_priority           not null,
  status                          case_status             not null default 'Open',
  -- TODO(decision, low-risk): DISPOSITIONS_BY_TYPE in src/data/cases.ts is a
  -- closed set *per type* (five different lists). A single CHECK spanning all
  -- five, transcribing strings that include an em-dash ('Repair — Send to
  -- Maintenance'), is exactly the kind of hand-copied literal this schema's
  -- own conventions (§2.3's paisa rule, §7's engine-only money) exist to
  -- avoid getting subtly wrong. Left as free text with the source cited,
  -- same as damage_findings.severity above it in 0003 ("no spec states the
  -- values, so this stays text").
  disposition                     text,
  linked_booking_id                uuid                   references bookings (id),
  assessed_amount                  numeric(14,2)          not null default 0,
  deposit_held_amount              numeric(14,2)          not null default 0,
  -- §7.3 allocation buckets — all zero until `disposition` is set, enforced
  -- below rather than only asserted in the TS seed layer.
  charged_to_client_amount         numeric(14,2)          not null default 0,
  deposit_applied_amount           numeric(14,2)          not null default 0,
  insurance_claimed_amount         numeric(14,2)          not null default 0,
  warranty_covered_amount          numeric(14,2)          not null default 0,
  recovered_from_partner_amount    numeric(14,2)          not null default 0,
  absorbed_amount                  numeric(14,2)          not null default 0,
  owner_id                         uuid                   not null references users (id),
  flags                            case_flag[]            not null default '{}',
  opened_at                        timestamptz            not null default now(),
  settled_at                       timestamptz,
  created_at                       timestamptz            not null default now(),
  created_by                       uuid                   not null references users (id),
  updated_at                       timestamptz            not null default now(),

  constraint cases_no_format check (case_no ~ '^CASE-[0-9]{4}-[0-9]{4}$'),

  constraint cases_amounts_non_negative check (
    assessed_amount >= 0 and deposit_held_amount >= 0
    and charged_to_client_amount >= 0 and deposit_applied_amount >= 0
    and insurance_claimed_amount >= 0 and warranty_covered_amount >= 0
    and recovered_from_partner_amount >= 0 and absorbed_amount >= 0
  ),

  -- src/data/cases.ts: "§7.3 allocation — all zero until `disposition` is
  -- set (asserted below)". Ported from a TS assertion to a DB CHECK.
  constraint cases_no_allocation_before_disposition check (
    disposition is not null
    or (charged_to_client_amount = 0 and deposit_applied_amount = 0
        and insurance_claimed_amount = 0 and warranty_covered_amount = 0
        and recovered_from_partner_amount = 0 and absorbed_amount = 0)
  ),

  constraint cases_settled_needs_settled_status check (
    settled_at is null or status in ('Resolved', 'Closed')
  )
);

comment on column cases.case_no is
  'CASE-2026-0035: prefix, four-digit AD year, four-digit sequence — src/data/cases.ts §0 #6, "every ID is four digits after the year, sub-rentals included".';
comment on column cases.counterparty_name is
  'Display name only. No partner/vendor table exists yet in this schema (Sub Rental is its own open area — PLAN.md''s sub-rental margin decision) — this stays free text until one does, same reasoning as damage_findings.severity staying text.';
comment on column cases.linked_booking_id is
  'The one relationship modeled from src/data/cases.ts''s fuller `LinkedRecords` — see the file header for what is deliberately not modeled yet. Nullable: a Vendor case may have no direct booking.';
comment on column cases.owner_id is
  'The accountable person. No separate `owner_role` column — role is read live from users.primary_role (the business-8 vocabulary, 0013_business_8_roles.sql); storing a second, narrower ''Warehouse | Manager | Owner'' copy here would reintroduce the exact retired-vocabulary drift 0013/0015 exist to close (''Manager'' is not a business-8 role at all).';
comment on column cases.flags is
  'Overlay only, per src/data/cases.ts: "never counted, never a disposition".';
comment on column cases.opened_at is
  'AD, UTC — law 7. Rendered as BS, never stored as BS.';
comment on column cases.settled_at is
  'Resolved/Closed only, enforced by cases_settled_needs_settled_status — src/data/cases.ts: "when the allocation was settled, for the Recovered This Month card".';

-- TRIGGER REQUIRED: disposition, once set, must be one of
--   DISPOSITIONS_BY_TYPE[type] (src/data/cases.ts) — application-enforced
--   today per the TODO(decision) above the column.
-- TRIGGER REQUIRED (RLS): Warehouse sees no money columns on this table
--   (law 6) — same column-hiding shape damage_findings.estimated_cost uses.
-- NOTHING IS DELETED: no DELETE for any role including Owner.

revoke delete on cases from public, anon, authenticated;

create index idx_cases_status on cases (status) where status not in ('Closed', 'Cancelled');
create index idx_cases_booking on cases (linked_booking_id);
create index idx_cases_owner on cases (owner_id);

alter table cases enable row level security;


-- ===========================================================================
-- charges
-- The bridge from an approved finding (damage or late fee) to a posted
-- invoice line. Deliberately thin — see the file header for why.
-- ===========================================================================

create table charges (
  id                  uuid                not null default gen_random_uuid() primary key,
  client_uuid         uuid                not null unique,
  charge_no           text                not null unique,
  source_type         charge_source_type  not null,
  damage_finding_id   uuid                references damage_findings (id),
  late_fee_finding_id uuid                references late_fee_findings (id),
  booking_id          uuid                not null references bookings (id),
  amount              numeric(14,2)       not null,
  invoice_line_id     uuid                references invoice_lines (id),
  posted_at           timestamptz,
  voided_at           timestamptz,
  void_reason         text,
  created_at          timestamptz         not null default now(),
  created_by          uuid                not null references users (id),

  constraint charges_no_format check (charge_no ~ '^CHG-[0-9]{4}-[0-9]{4}$'),

  constraint charges_amount_non_negative check (amount >= 0),

  -- Same exclusive-parent shape damage_findings itself already uses for
  -- return_line_id/cleaning_queue_entry_id.
  constraint charges_exactly_one_source
    check (num_nonnulls(damage_finding_id, late_fee_finding_id) = 1),

  constraint charges_source_matches_type check (
    (source_type = 'Damage' and damage_finding_id is not null)
    or (source_type = 'Late Fee' and late_fee_finding_id is not null)
  ),

  constraint charges_void_needs_reason check (
    voided_at is null or (void_reason is not null and char_length(btrim(void_reason)) > 0)
  ),

  -- A voided charge was never posted, and a posted charge is never voided
  -- through this row — a correction voids and a new charge is raised,
  -- mirroring damage_findings' own "never edited, never deleted" shape.
  constraint charges_not_both_posted_and_voided
    check (posted_at is null or voided_at is null)
);

comment on column charges.amount is
  'Snapshotted from the finding at posting time — this table records the posted amount, it does not compute it. Same "workspace never calculates" rule damage_findings.charge_id states.';
comment on column charges.invoice_line_id is
  'NULL until the Financial Engine actually posts this as an invoice_lines row (line_kind = ''Damage'' or ''Late Fee''). damage_findings'' own TRIGGER REQUIRED note ("posting it as an invoice_lines row... is a Financial Engine action, not something this table does itself") applies here identically.';
comment on column charges.voided_at is
  'Terminal state. A charge is never deleted or edited in place.';

-- TRIGGER REQUIRED: charge_no assigned only at creation, sequential per year,
--   same shape as booking_no/crew_booking_no.
-- TRIGGER REQUIRED (RLS): Warehouse sees no rows at all (law 6) — this table
--   is money by definition, not a column-mask case.
-- NOTHING IS DELETED: no DELETE for any role including Owner.

revoke delete on charges from public, anon, authenticated;

create index idx_charges_booking on charges (booking_id);
create index idx_charges_damage_finding on charges (damage_finding_id) where damage_finding_id is not null;
create index idx_charges_late_fee_finding on charges (late_fee_finding_id) where late_fee_finding_id is not null;

alter table charges enable row level security;


-- ===========================================================================
-- Close the three dangling FKs 0003_operations.sql stripped pending this file
-- ===========================================================================

alter table damage_findings
  add constraint damage_findings_case_id_fkey foreign key (case_id) references cases (id);

alter table damage_findings
  add constraint damage_findings_charge_id_fkey foreign key (charge_id) references charges (id);

alter table evidence_references
  add constraint evidence_references_case_id_fkey foreign key (case_id) references cases (id);

commit;
