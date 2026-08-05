-- 0005_clients.sql
-- Babin Rentals OS - the clients domain: 16 tables covering the account record,
-- contact people, flags, merges, membership plans and memberships, commercial
-- overrides, documents, tax profiles, the customer portal (users, OTP
-- challenges, sessions, change requests) and messaging identity and consent.
--
-- Generated from schema-model.json (domain = "clients"). Enum types are created
-- in 0001_enums.sql and are only used here. Tables in other domains (users,
-- bookings, documents) are referenced by foreign key and are never defined here.
--
-- LAWS ENCODED IN THIS FILE, IN THE DATABASE, WITH NO ROLE BYPASS:
--   * NOTHING IS DELETED. Terminal actions are state changes - Deactivate,
--     Retire, Void, Supersede, Archive, Close. No DELETE is granted to any
--     role (see the grants block at the foot of this file), including Owner.
--   * Every user-written table carries client_uuid uuid not null unique. A
--     replayed write is REJECTED, never applied twice.
--   * Every timestamp is timestamptz in UTC (AD). There is no BS column
--     anywhere in this schema and none may be added.
--   * Money is numeric(14,2). Never float.
--   * Discount above 10% requires a reason of >= 10 characters AND a non-null
--     named approver; 25% is a hard cap. The identical gate shape governs
--     credit limits and payment terms here, as a table CHECK, not app logic.
--   * Warehouse role sees NO monetary values. That is column-level grants and
--     RLS, never CSS hiding - see the notes at the foot of this file.
--   * Deposits are liabilities and never join into payments. No table here
--     carries an FK into payments.
--   * The append-only tables take no UPDATE and no DELETE from anyone.

begin;


-- =============================================================================
-- clients
-- The account record - one row per client, Organisation or Individual. Money,
-- PAN/VAT, credit, membership and the Blocked flag all attach here, never to a
-- person. There is no separate companies table.
-- =============================================================================
create table clients (
  id                         uuid                         not null default gen_random_uuid() primary key,
  client_uuid                uuid                         not null,
  client_code                text                         not null,
  type_parent                client_type_parent,
  org_subtype                client_organisation_subtype,
  name                       text                         not null,
  phone                      text                         not null,
  email                      text,
  pan_vat                    text,
  business_registration      text,
  website                    text,
  government_id_kind         government_id_kind,
  government_id_number       text,
  address_line               text,
  city                       text,
  district                   text,
  postal_code                text,
  country                    text                         not null default 'Nepal',
  billing_address            text,
  approved_credit_limit      numeric(14,2),
  payment_terms              payment_terms                not null default 'Immediate',
  client_since               date                         not null default current_date,
  professions                client_profession[]          not null default '{}',
  segments                   client_segment[]             not null default '{}',
  source                     text,
  referred_by_client_id      uuid                         references clients (id),
  tags                       text[]                       not null default '{}',
  preferred_contact_channels preferred_contact_channel[]  not null default '{WhatsApp}',
  marketing_photo_consent    boolean                      not null default false,
  notes                      text,
  assigned_staff_id          uuid                         references users (id),
  status                     client_status                not null default 'Active',
  deactivated_at             timestamptz,
  deactivated_by             uuid                         references users (id),
  deactivation_reason        text,
  merged_into_client_id      uuid                         references clients (id),
  portal_default_language    portal_language              not null default 'NE',
  created_at                 timestamptz                  not null default now(),
  created_by                 uuid                         references users (id),
  updated_at                 timestamptz                  not null default now(),

  constraint clients_client_uuid_key unique (client_uuid),

  -- A duplicate blocks the save and offers "Open existing client". Phone is the
  -- unique identifier, not email.
  constraint clients_phone_key unique (phone),

  constraint clients_client_code_key unique (client_code),

  -- /clients/CL-2026-0034. AD year only.
  constraint clients_client_code_format check (client_code ~ '^CL-[0-9]{4}-[0-9]{4}$'),

  constraint clients_phone_format check (phone ~ '^\+977(97|98)[0-9]{8}$'),

  constraint clients_pan_vat_nine_digits check (pan_vat is null or pan_vat ~ '^[0-9]{9}$'),

  constraint clients_org_subtype_pairing check (
    type_parent is null
    or (type_parent = 'Organisation' and org_subtype is not null)
    or (type_parent = 'Individual'   and org_subtype is null)
  ),

  constraint clients_professions_individual_only check (
    type_parent = 'Individual' or cardinality(professions) = 0
  ),

  constraint clients_org_fields_null_for_individual check (
    type_parent is distinct from 'Individual'
    or (business_registration is null and website is null)
  ),

  constraint clients_gov_id_null_for_organisation check (
    type_parent is distinct from 'Organisation'
    or (government_id_kind is null and government_id_number is null)
  ),

  -- At least one channel must remain selected. A cardinality CHECK, not UI.
  constraint clients_at_least_one_contact_channel check (
    cardinality(preferred_contact_channels) >= 1
  )
);

comment on column clients.client_uuid is
  'Client-generated idempotency key on every write; duplicates rejected.';
comment on column clients.client_code is
  'ID registry human key and deep-link segment. AD year only - BS is never written.';
comment on column clients.type_parent is
  'Required on create, but MUST stay physically nullable: legacy untyped rows keep working and surface in the Unassigned bucket. Required-on-INSERT is enforced by trigger, never by NOT NULL.';
comment on column clients.org_subtype is
  'Organisation only. The only one of the three type fields that changes behaviour (identity doc, VAT, deposit rule, credit).';
comment on column clients.name is
  'One column; the label swaps by type - Organisation name / Full name.';
comment on column clients.phone is
  'The natural key. Phone is the unique identifier, not email.';
comment on column clients.pan_vat is
  'The single home for PAN/VAT, at company level. Not required at create; the booking Confirm gate enforces it.';
comment on column clients.government_id_number is
  'Individual only. No format rule is stated anywhere in the specs and none is invented here.';
comment on column clients.approved_credit_limit is
  'NULL means "use the membership plan default". Written ONLY by an Approved client_commercial_overrides row. Never typed by a user.';
comment on column clients.payment_terms is
  'Anything beyond Immediate is credit by another name and takes the same gated approval as a credit override.';
comment on column clients.client_since is
  'AD only. Rendered BS-above-AD; BS is never stored.';
comment on column clients.professions is
  'Enum array rather than a junction table because it is a fixed closed list used only for filter/report facets. TODO(decision): decide whether profession COUNTS need a junction table; the array cannot carry per-assignment metadata.';
comment on column clients.source is
  'Free text deliberately. TODO(decision): the value list for Source is an explicit open question (Add Client section 19) - it stays text until that list is ruled on.';
comment on column clients.marketing_photo_consent is
  'Permission to use photos of the rental in marketing. A DIFFERENT thing from message-marketing consent, which is per-channel in client_marketing_consents.';
comment on column clients.status is
  'Deactivated is terminal, never a DELETE. Blocked is never written here - it is a flag on client_flags.';
comment on column clients.deactivation_reason is
  'TODO(decision): Customer Profiles.md requires a confirmation dialog but never says a reason is mandatory for Deactivate. Do not make NOT NULL until that is decided.';
comment on column clients.merged_into_client_id is
  'The losing record is retained and points at the survivor; set together with status = Deactivated.';
comment on column clients.created_by is
  'Nullable - imported clients have no actor.';

-- TRIGGER REQUIRED: type_parent must be supplied on INSERT. Pre-existing NULL
-- rows are permitted and surface as Unassigned. This cannot be a NOT NULL.
-- TRIGGER REQUIRED: a Warehouse-created client saves with no membership row and
-- approved_credit_limit NULL (Rs 0 effective).
-- TRIGGER REQUIRED: approved_credit_limit, and any payment_terms other than
-- 'Immediate', may only be written by an Approved client_commercial_overrides
-- row. No direct UPDATE path, for any role including Owner.
-- STRUCTURAL RULE: no outstanding, deposit_held, current_rentals,
-- last_rental_date, membership_status or verified column may exist on this
-- table - all are derived. The green Verified tick is undefined in the specs and
-- is deliberately not modelled. No BS date column may exist.

alter table clients enable row level security;


-- =============================================================================
-- client_contacts
-- The person at a client - who books, collects, signs and receives messages.
-- Deliberately separate from the account so a coordinator can leave without
-- taking the account history. Money never attaches here.
-- =============================================================================
create table client_contacts (
  id             uuid          not null default gen_random_uuid() primary key,
  client_uuid    uuid          not null,
  client_id      uuid          not null references clients (id),
  full_name      text          not null,
  designation    text,
  phone          text,
  email          text,
  is_primary     boolean       not null default false,
  status         client_status not null default 'Active',
  deactivated_at timestamptz,
  deactivated_by uuid          references users (id),
  created_at     timestamptz   not null default now(),
  created_by     uuid          references users (id),
  updated_at     timestamptz   not null default now(),

  constraint client_contacts_client_uuid_key unique (client_uuid)
);

comment on column client_contacts.client_id is
  'Single-parent. TODO(decision): whether a person may belong to two companies is explicitly unspecified (Companies.md, Contact Persons.md); answering yes turns this into a junction table.';
comment on column client_contacts.phone is
  'Which number the WhatsApp goes to; the identity a portal login is invited against.';
comment on column client_contacts.status is
  'Deactivate is terminal - the name stays readable on signatures and audit entries.';

-- At most one primary contact per client.
create unique index client_contacts_one_primary_per_client
  on client_contacts (client_id)
  where is_primary and status = 'Active';

-- TRIGGER REQUIRED (deferrable, on the client-create transaction): a client with
-- type_parent = 'Organisation' must have at least one contact. Never a NOT NULL
-- on clients.
-- TRIGGER REQUIRED: raise on DELETE for every role including Owner. Deactivating
-- a contact must not alter, revoke or invalidate any handover signature, audit
-- row or completed booking.

alter table client_contacts enable row level security;


-- =============================================================================
-- client_flags
-- Application and removal of the three Client-type flags. Flags coexist with the
-- client's state and append to it - Blocked is emphatically not a status.
-- =============================================================================
create table client_flags (
  id             uuid             not null default gen_random_uuid() primary key,
  client_uuid    uuid             not null,
  client_id      uuid             not null references clients (id),
  flag_type      client_flag_type not null,
  source         flag_source      not null default 'Manual',
  reason         text,
  created_at     timestamptz      not null default now(),
  created_by     uuid             references users (id),
  removed_at     timestamptz,
  removed_by     uuid             references users (id),
  removal_reason text,

  constraint client_flags_client_uuid_key unique (client_uuid),

  -- Automation has no human actor; a person's decision must name the person.
  constraint client_flags_manual_requires_actor check (
    source <> 'Manual' or created_by is not null
  )
);

comment on column client_flags.client_id is
  'Company level - otherwise a second contact books around the block. TODO(decision): Blacklist.md asserts company level and simultaneously flags the level as unspecified.';
comment on column client_flags.source is
  'Separates a person''s decision from automation. Upgrade Candidate is generated automatically.';
comment on column client_flags.reason is
  'TODO(decision): nullable ONLY because Blacklist.md leaves mandatory-reason unsettled while arguing it should be mandatory. Do not ship nullable for Blocked without that ruling.';
comment on column client_flags.created_at is
  'UTC. This IS the applied-at timestamp.';
comment on column client_flags.removed_at is
  'Removal is a state change on the row; the row is never deleted.';
comment on column client_flags.removal_reason is
  'A block whose reason nobody recorded becomes a block nobody dares remove.';

-- At most one live flag of each kind per client.
create unique index client_flags_one_live_per_kind
  on client_flags (client_id, flag_type)
  where removed_at is null;

-- TRIGGER REQUIRED: INSERT of a booking for a client holding a live Blocked flag
-- is rejected at the database. No role bypass, including Owner; Sales cannot
-- override it.
-- TRIGGER REQUIRED: that trigger fires on NEW-booking INSERT ONLY. A Blocked flag
-- must not cancel existing bookings, void invoices, remove portal access to
-- existing records, or touch rental history.
-- TRIGGER REQUIRED: raise if 'Blocked' is ever written into clients.status.
-- TRIGGER REQUIRED: raise on DELETE. Removal sets removed_at, removed_by,
-- removal_reason.
-- UI CONTRACT (not enforceable here): the block reason must be exposed as DOM
-- text in the gate output, not as a tooltip on a disabled button.

alter table client_flags enable row level security;


-- =============================================================================
-- client_merges
-- The permanent record of a merge. Merge is irreversible at the data level and
-- is one of the three largest blast radii in the product.
-- =============================================================================
create table client_merges (
  id                  uuid        not null default gen_random_uuid() primary key,
  client_uuid         uuid        not null,
  surviving_client_id uuid        not null references clients (id),
  merged_client_id    uuid        not null references clients (id),
  typed_confirmation  text        not null,
  moved_summary       jsonb       not null,
  created_at          timestamptz not null default now(),
  created_by          uuid        not null references users (id),

  constraint client_merges_client_uuid_key unique (client_uuid),

  -- A merged client may not be merged again.
  constraint client_merges_merged_client_id_key unique (merged_client_id),

  constraint client_merges_distinct_parties check (surviving_client_id <> merged_client_id),

  -- The user types the action name, not "yes".
  -- TODO(decision): the exact required action word is never stated in the specs;
  -- until it is ruled on this CHECK can only reject the empty string and "yes".
  constraint client_merges_typed_confirmation_not_yes check (
    char_length(btrim(typed_confirmation)) > 0
    and lower(btrim(typed_confirmation)) <> 'yes'
  )
);

comment on column client_merges.client_uuid is
  'Idempotency - critical here: a replayed merge must be rejected, not applied twice.';
comment on column client_merges.merged_client_id is
  'Retained, Deactivated, stamped with merged_into_client_id. Never deleted.';
comment on column client_merges.moved_summary is
  'What moved, counted at merge time - bookings, invoices, payments, cases, portal logins. The confirm dialog must name both clients and state what moves, so the counts are captured here.';
comment on column client_merges.created_by is
  'Owner or Manager only.';

-- TRIGGER REQUIRED: a client that appears as merged_client_id may never appear as
-- surviving_client_id on any row (cross-row rule; not expressible as a CHECK).
-- TRIGGER REQUIRED: the merge transaction repoints bookings, invoices, payments,
-- cases and portal logins, sets the merged client's status to Deactivated and its
-- merged_into_client_id, and deletes nothing. Deposits repoint as LIABILITIES and
-- must NOT be recomputed into Rental Payments in the process.
-- TRIGGER REQUIRED: if both clients hold a live Owner-user portal login the
-- transaction must resolve to exactly one, or the one-Owner-user partial unique
-- index aborts it.
-- TRIGGER REQUIRED: append-only - raise on UPDATE and on DELETE, so no direct
-- grant can bypass the revoke at the foot of this file.

alter table client_merges enable row level security;


-- =============================================================================
-- membership_plans
-- The five membership levels and their full economics. Every number here is
-- data, never a constant in code.
-- =============================================================================
create table membership_plans (
  id                        uuid                   not null default gen_random_uuid() primary key,
  client_uuid               uuid                   not null,
  level                     membership_level       not null,
  label                     membership_label       not null,
  annual_fee                numeric(14,2),
  individual_discount_pct   numeric(5,2),
  bundle_discount_pct       numeric(5,2),
  monthly_booking_limit     int,
  simultaneous_rental_limit int,
  authorized_users          int,
  default_credit_limit      numeric(14,2)          not null default 0,
  term_months               int                    not null default 12,
  perks                     membership_perk[]      not null default '{}',
  display_order             int                    not null,
  status                    membership_plan_status not null default 'Active',
  retired_at                timestamptz,
  created_at                timestamptz            not null default now(),
  created_by                uuid                   references users (id),
  updated_at                timestamptz            not null default now(),

  constraint membership_plans_client_uuid_key unique (client_uuid),
  constraint membership_plans_level_key unique (level),
  constraint membership_plans_display_order_key unique (display_order),

  -- 25% is a hard cap, not approvable by anyone, including Owner.
  constraint membership_plans_discount_hard_cap check (
    (individual_discount_pct is null or (individual_discount_pct >= 0 and individual_discount_pct <= 25))
    and (bundle_discount_pct is null or (bundle_discount_pct >= 0 and bundle_discount_pct <= 25))
  ),

  constraint membership_plans_term_positive check (term_months > 0)
);

comment on column membership_plans.label is
  'Levels are distinguished by label, never hue.';
comment on column membership_plans.annual_fee is
  'NULL for Elite - "Custom". TODO(decision): Elite pricing is an open question (Membership section 16); the NULL is a placeholder for a ruling, not a permanent shape.';
comment on column membership_plans.individual_discount_pct is
  'NULL for Elite ("Negotiated"). Cinematographer at 20% already trips the >10% approval gate before any stacking.';
comment on column membership_plans.monthly_booking_limit is
  'NULL means Unlimited. SOFT limit - the booking proceeds and a breach is logged.';
comment on column membership_plans.simultaneous_rental_limit is
  'NULL means Unlimited. Soft limit.';
comment on column membership_plans.authorized_users is
  'NULL means Unlimited. TODO(decision): this is NOT the same number as the portal cap of one Owner-user plus up to five Members; the two are stated independently and conflict (Academy allows 1, the portal allows 6).';
comment on column membership_plans.default_credit_limit is
  'The derived source for a client''s credit. Nobody types a credit limit into a client record.';
comment on column membership_plans.perks is
  'Empty for Academy, Creator and Cinematographer (rendered as an em dash). Numeric limits never take a tick.';
comment on column membership_plans.status is
  'Retire is terminal - a plan with historic members can never be deleted.';

-- PRICING-LAYER INVARIANT, enforced where the discount is WRITTEN (booking_discounts),
-- not here: a stacked discount total above 25% must be IMPOSSIBLE, not merely
-- discouraged; any applied discount above 10% requires a reason of >= 10
-- characters AND a non-null named approver, with no role bypass including Owner.
-- Membership never stacks with student 10%, college 20% or standing client
-- discounts. It may stack with a coupon and the Women-DoP 5% rate.
-- STRUCTURAL RULE: no plan value may be hardcoded in application code - every
-- read comes from this table.
-- TRIGGER REQUIRED: raise on DELETE. Plans are Retired, never deleted.

alter table membership_plans enable row level security;


-- =============================================================================
-- client_memberships
-- The membership a client holds, as a history. Carries only what is WRITTEN -
-- join date, plan, fee paid. No status and no renewal-date column: both are
-- computed on every read.
-- =============================================================================
create table client_memberships (
  id               uuid          not null default gen_random_uuid() primary key,
  client_uuid      uuid          not null,
  client_id        uuid          not null references clients (id),
  plan_id          uuid          not null references membership_plans (id),
  join_date        date          not null,
  fee_paid         numeric(14,2),
  superseded_by_id uuid          references client_memberships (id),
  superseded_at    timestamptz,
  created_at       timestamptz   not null default now(),
  created_by       uuid          references users (id),

  constraint client_memberships_client_uuid_key unique (client_uuid),

  constraint client_memberships_not_self_superseding check (
    superseded_by_id is null or superseded_by_id <> id
  )
);

comment on column client_memberships.client_id is
  'TODO(decision): which entity a tier attaches to when both a company and an individual hold one is explicitly unresolved (Companies.md, Loyalty.md).';
comment on column client_memberships.plan_id is
  'A level change writes a NEW row and supersedes the previous one; the old row is retained.';
comment on column client_memberships.join_date is
  'AD. The anchor of the entire renewal engine - every renewal falls on the join anniversary. A member who joined 10 Feb cannot renew on 05 Jan.';
comment on column client_memberships.fee_paid is
  'Nullable for Elite, whose fee is negotiated and may be unset at join.';

-- At most one live membership per client.
create unique index client_memberships_one_live_per_client
  on client_memberships (client_id)
  where superseded_at is null;

-- STRUCTURAL RULE: NO status column may exist. membership_status
-- (Active / Grace / Lapsed) is computed on every read, never stored, never
-- editable. NO next_renewal or last_renewal column may exist - both derive from
-- join_date and the plan's term_months. A renewal date set once at signup and
-- never rolled forward is the defect this schema replaces.
-- READ-TIME INVARIANTS the derivation must satisfy: next_renewal > today and
-- <= 365 days out on a 12-month term, always on the join anniversary;
-- grace_remaining = grace_days + d, and at grace_remaining <= 0 the row reads
-- Lapsed automatically with no manual action; Expiring is a badge over Active
-- where 0 <= d <= expiring_window and must never render as "Status: Expiring"
-- nor be added into Total = Active + Grace + Lapsed.
-- TRIGGER REQUIRED: for a membership that computes Lapsed the effective credit
-- limit is Rs 0 and booking/rental limits are suspended. The approved figure
-- stays READABLE (struck through or in tooltip) but must not be spendable.
-- TRIGGER REQUIRED: raise on DELETE. Rows are superseded, never deleted - a
-- lapsed member's spend and savings history is retained.

alter table client_memberships enable row level security;


-- =============================================================================
-- membership_limit_breaches
-- Append-only log of soft-limit breaches. The booking proceeds; the system warns,
-- logs and suggests an upgrade. The automatic input to the Upgrade Candidate flag.
-- =============================================================================
create table membership_limit_breaches (
  id            uuid                  not null default gen_random_uuid() primary key,
  client_uuid   uuid                  not null,
  client_id     uuid                  not null references clients (id),
  membership_id uuid                  not null references client_memberships (id),
  breach_kind   membership_limit_kind not null,
  booking_id    uuid                  references bookings (id),
  limit_value   int                   not null,
  actual_value  int                   not null,
  created_at    timestamptz           not null default now(),
  approved_by   uuid                  references users (id),

  constraint membership_limit_breaches_client_uuid_key unique (client_uuid),

  -- Beyond ONE booking over the configured limit a named approver is required.
  constraint membership_limit_breaches_over_one_needs_approver check (
    actual_value <= limit_value + 1 or approved_by is not null
  )
);

comment on column membership_limit_breaches.membership_id is
  'The membership held at breach time, so the breach stays interpretable after a level change.';
comment on column membership_limit_breaches.booking_id is
  'Nullable - a simultaneous-rental breach is a state, not a single booking.';
comment on column membership_limit_breaches.limit_value is
  'The configured limit at breach time, snapshotted so a later Edit Plans does not rewrite history.';
comment on column membership_limit_breaches.approved_by is
  'Required beyond one booking over the configured limit; must hold Manager authority.';

-- STRUCTURAL RULE: a breach must NEVER block the booking. Limits are soft - the
-- booking proceeds, the system warns and logs.
-- TRIGGER REQUIRED: append-only. Raise on UPDATE and on DELETE for every role
-- including Owner, so no direct grant can bypass the revoke at the foot of this
-- file.

alter table membership_limit_breaches enable row level security;


-- =============================================================================
-- client_commercial_overrides
-- One gated request to move a client off a derived commercial default - the
-- credit limit derived from the membership plan, or payment terms beyond
-- Immediate. Identical gate shape to the discount gate.
-- =============================================================================
create table client_commercial_overrides (
  id                      uuid                       not null default gen_random_uuid() primary key,
  client_uuid             uuid                       not null,
  client_id               uuid                       not null references clients (id),
  kind                    commercial_override_kind   not null,
  requested_credit_limit  numeric(14,2),
  requested_payment_terms payment_terms,
  reason                  text                       not null,
  status                  commercial_override_status not null default 'Pending',
  approver_user_id        uuid                       references users (id),
  approved_at             timestamptz,
  voided_at               timestamptz,
  created_at              timestamptz                not null default now(),
  created_by              uuid                       not null references users (id),

  constraint client_commercial_overrides_client_uuid_key unique (client_uuid),

  -- Enforced in the database, not the application. Ten characters does not
  -- guarantee a good reason; it defeats "ok".
  constraint client_commercial_overrides_reason_min_length check (
    char_length(btrim(reason)) >= 10
  ),

  -- No self-approval, no role bypass, including Owner.
  constraint client_commercial_overrides_approval_requires_other_approver check (
    status <> 'Approved'
    or (approver_user_id is not null and approver_user_id <> created_by)
  ),

  -- Exactly one requested value, matching kind.
  constraint client_commercial_overrides_kind_payload check (
    (kind = 'Credit Limit'  and requested_credit_limit is not null and requested_payment_terms is null)
    or (kind = 'Payment Terms' and requested_payment_terms is not null and requested_credit_limit is null)
  )
);

comment on column client_commercial_overrides.client_id is
  'Credit sits at company level.';
comment on column client_commercial_overrides.kind is
  'Both use the same gate - payment terms beyond Immediate is credit by another name.';
comment on column client_commercial_overrides.status is
  'The client saves with, and operates on, the DEFAULT until Approved. The override is never provisional-and-live.';
comment on column client_commercial_overrides.approver_user_id is
  'The named approver; must hold Manager authority.';
comment on column client_commercial_overrides.voided_at is
  'Terminal state for a withdrawn or superseded request.';

-- TRIGGER REQUIRED: only an Approved row of this table may write
-- clients.approved_credit_limit or move clients.payment_terms off 'Immediate'.
-- TRIGGER REQUIRED: a failed gate blocks the OVERRIDE, not the client save.
-- TRIGGER REQUIRED: raise on DELETE, and on UPDATE of an Approved row. Rows are
-- Voided, never deleted; Approved rows are never edited.

alter table client_commercial_overrides enable row level security;


-- =============================================================================
-- portal_users
-- A client-side login. Explicitly a SEPARATE authentication namespace from staff
-- accounts - it must not be a row in the staff users table and carries none of
-- the staff role capabilities.
-- =============================================================================
create table portal_users (
  id                            uuid               not null default gen_random_uuid() primary key,
  client_uuid                   uuid               not null,
  client_id                     uuid               not null references clients (id),
  contact_id                    uuid               references client_contacts (id),
  phone                         text               not null,
  display_name                  text,
  role                          portal_user_role   not null default 'Member',
  language                      portal_language    not null default 'NE',
  status                        portal_user_status not null default 'Invited',
  invited_by_staff_id           uuid               references users (id),
  invited_by_portal_user_id     uuid               references portal_users (id),
  activated_at                  timestamptz,
  last_active_at                timestamptz,
  deactivated_at                timestamptz,
  deactivated_by_portal_user_id uuid               references portal_users (id),
  created_at                    timestamptz        not null default now(),

  constraint portal_users_client_uuid_key unique (client_uuid),

  -- Global phone uniqueness is deliberately NOT asserted: whether a person can
  -- belong to two companies is unspecified.
  constraint portal_users_client_phone_key unique (client_id, phone),

  constraint portal_users_exactly_one_inviter check (
    (invited_by_staff_id is not null and invited_by_portal_user_id is null)
    or (invited_by_staff_id is null and invited_by_portal_user_id is not null)
  )
);

comment on column portal_users.client_id is
  'The RLS anchor. Every portal query is scoped to this column at the database.';
comment on column portal_users.contact_id is
  'Optional. The Owner-user is created from a phone number at the client and Members are invited by phone; neither flow states a contact record exists first. client_id is therefore the mandatory parent and contact_id the optional link.';
comment on column portal_users.phone is
  'The login identity. There is no username and no password anywhere in this chain.';
comment on column portal_users.display_name is
  'Every write is attributed by name, phone, timestamp and IP; this is where the name comes from when there is no contact row.';
comment on column portal_users.role is
  'Owner-user sees money, credit, signing and user management; Member sees none of it.';
comment on column portal_users.status is
  'Deactivated rather than deleted, because past writes stay attributed to this row.';
comment on column portal_users.invited_by_staff_id is
  'Set for the Owner-user, created by a Coordinator from the Clients page. There is no public sign-up.';
comment on column portal_users.invited_by_portal_user_id is
  'Set for Members, invited by the Owner-user. Babin staff do not manage the client''s internal people.';

-- Exactly one Owner-user per client. This index is what makes an Owner-user
-- transfer, and a merge of two portal-enabled clients, resolve rather than
-- silently duplicate.
create unique index portal_users_one_owner_user_per_client
  on portal_users (client_id)
  where role = 'Owner-user' and status <> 'Deactivated';

-- TRIGGER REQUIRED: at most N non-Deactivated Members per client.
-- TODO(decision): the cap is written as 5 but is starred as an open item - it
-- must read from a configurable Settings value, not a hardcoded 5, and it can
-- conflict with membership_plans.authorized_users (Academy allows 1).
-- STRUCTURAL RULE: no password, password_hash or staff_user_id column may exist
-- on this table.
-- TRIGGER REQUIRED: raise on DELETE. Removal sets status = 'Deactivated' so prior
-- write attribution survives.

alter table portal_users enable row level security;


-- =============================================================================
-- portal_auth_challenges
-- One issued OTP. Passwordless customer authentication: phone number to 6-digit
-- code, with validity, attempt and lockout limits held in the database.
-- =============================================================================
create table portal_auth_challenges (
  id               uuid                 not null default gen_random_uuid() primary key,
  client_uuid      uuid                 not null,
  phone            text                 not null,
  portal_user_id   uuid                 references portal_users (id),
  code_hash        text                 not null,
  delivery_channel otp_delivery_channel not null,
  created_at       timestamptz          not null default now(),
  expires_at       timestamptz          not null,
  attempt_count    int                  not null default 0,
  locked_until     timestamptz,
  consumed_at      timestamptz,
  voided_at        timestamptz,
  ip               inet,

  constraint portal_auth_challenges_client_uuid_key unique (client_uuid),

  constraint portal_auth_challenges_ten_minute_validity check (
    expires_at = created_at + interval '10 minutes'
  ),

  -- The sixth attempt is rejected and sets locked_until.
  constraint portal_auth_challenges_attempt_ceiling check (
    attempt_count >= 0 and attempt_count <= 5
  )
);

comment on column portal_auth_challenges.phone is
  'The challenge is issued against a phone BEFORE identity is proven, so there is no FK to portal_users at issue time.';
comment on column portal_auth_challenges.portal_user_id is
  'Resolved on successful verification only.';
comment on column portal_auth_challenges.code_hash is
  'The 6-digit code is stored only as a hash. OTP values are never stored, displayed, logged or exported - masked for every role including Owner.';
comment on column portal_auth_challenges.delivery_channel is
  'TODO(decision): SMS with WhatsApp fallback is stated, but which channel is PRIMARY is an open item (CP open item 1).';
comment on column portal_auth_challenges.locked_until is
  'now() + 15 minutes when attempt_count reaches 5.';
comment on column portal_auth_challenges.consumed_at is
  'Single-use. DERIVED - implied by "then re-OTP" but never stated as single-use in the spec.';
comment on column portal_auth_challenges.voided_at is
  'Terminal for a superseded or expired challenge. TODO(decision): the retention period for spent OTP challenge rows is unspecified.';
comment on column portal_auth_challenges.ip is
  'Attribution requires IP on writes; capturing it at authentication is the corollary.';

-- TRIGGER REQUIRED: a challenge with consumed_at set can never verify again
-- (forward-only, not expressible as a CHECK).
-- TRIGGER REQUIRED: on the sixth attempt, set locked_until = now() + interval
-- '15 minutes' and reject.
-- STRUCTURAL RULE: no password column may exist anywhere in the portal auth
-- chain. No created_by: the row is minted by the service on an unauthenticated
-- request.
-- TRIGGER REQUIRED: raise on DELETE. Rows are voided, never deleted.

alter table portal_auth_challenges enable row level security;


-- =============================================================================
-- portal_sessions
-- A device-bound portal session. Thirty days per device, then re-OTP.
-- =============================================================================
create table portal_sessions (
  id             uuid        not null default gen_random_uuid() primary key,
  client_uuid    uuid        not null,
  portal_user_id uuid        not null references portal_users (id),
  client_id      uuid        not null references clients (id),
  device_id      text        not null,
  ip             inet,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  closed_at      timestamptz,

  constraint portal_sessions_client_uuid_key unique (client_uuid),

  constraint portal_sessions_thirty_day_validity check (
    expires_at = created_at + interval '30 days'
  )
);

comment on column portal_sessions.client_id is
  'Denormalised DELIBERATELY: the RLS predicate reads client_id straight off the session with no join, so tenant isolation cannot be broken by a bad join.';
comment on column portal_sessions.device_id is
  'Sessions are per device.';
comment on column portal_sessions.closed_at is
  'Set on Log out or when staff deactivate the user. Never deleted.';

-- TRIGGER REQUIRED: session.client_id must equal portal_users.client_id for the
-- referenced user (cross-row rule).
-- TRIGGER REQUIRED: setting portal_users.status = 'Deactivated' closes every open
-- session for that user in the SAME transaction.
-- TRIGGER REQUIRED: raise on DELETE. Rows are closed, never deleted.

alter table portal_sessions enable row level security;


-- =============================================================================
-- client_documents
-- Files attached to the client record: identity documents, PAN/VAT, requested
-- documents and the signed rental agreement.
-- =============================================================================
create table client_documents (
  id                         uuid                   not null default gen_random_uuid() primary key,
  client_uuid                uuid                   not null,
  client_id                  uuid                   not null references clients (id),
  contact_id                 uuid                   references client_contacts (id),
  kind                       client_document_kind   not null,
  requested_reason           text,
  file_name                  text                   not null,
  storage_path               text                   not null,
  mime_type                  text                   not null,
  file_size_bytes            bigint                 not null,
  status                     client_document_status not null default 'Pending',
  uploaded_by_staff_id       uuid                   references users (id),
  uploaded_by_portal_user_id uuid                   references portal_users (id),
  uploaded_ip                inet,
  created_at                 timestamptz            not null default now(),
  verified_by                uuid                   references users (id),
  verified_at                timestamptz,
  signed_at                  timestamptz,
  signed_by_portal_user_id   uuid                   references portal_users (id),
  archived_at                timestamptz,

  constraint client_documents_client_uuid_key unique (client_uuid),

  -- Hard ceiling 50 MB per file, matching Evidence v1.1.
  constraint client_documents_file_size_ceiling check (file_size_bytes > 0 and file_size_bytes <= 52428800),

  constraint client_documents_mime_allowlist check (
    mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/heic')
  ),

  constraint client_documents_exactly_one_uploader check (
    (uploaded_by_staff_id is not null and uploaded_by_portal_user_id is null)
    or (uploaded_by_staff_id is null and uploaded_by_portal_user_id is not null)
  ),

  -- Portal-originated writes are attributed by name, phone, timestamp and IP.
  constraint client_documents_portal_upload_requires_ip check (
    uploaded_by_portal_user_id is null or uploaded_ip is not null
  )
);

comment on column client_documents.client_id is
  'RLS anchor for portal reads.';
comment on column client_documents.contact_id is
  'A citizenship document belongs to a PERSON even when the account is a company.';
comment on column client_documents.requested_reason is
  'Shown to the client on one line - "Needed for your 20% college discount". The reason is what makes clients actually send them.';
comment on column client_documents.status is
  'Pending until a staff member verifies. Verification is a staff action, never a portal one.';
comment on column client_documents.uploaded_by_portal_user_id is
  'Portal uploads are attributed to the individual user, never to the client organisation.';
comment on column client_documents.signed_at is
  'Rental agreement. Both paths supported: on-screen signature, or download then upload a signed copy.';
comment on column client_documents.signed_by_portal_user_id is
  'A signature reading only "Rana Pictures" is worthless in a dispute.';
comment on column client_documents.archived_at is
  'Terminal. Documents underpin the booking Confirm gate and any dispute, so they are archived, never deleted.';

-- TRIGGER REQUIRED: status may only move Pending -> Verified, and only by a staff
-- actor. A portal user may NEVER set Verified (forward-only transition).
-- TRIGGER REQUIRED: no file may be categorised Marketing unless
-- clients.marketing_photo_consent is true.
-- TRIGGER REQUIRED: raise on DELETE. Documents are archived, never deleted.

alter table client_documents enable row level security;


-- =============================================================================
-- client_tax_profiles
-- The tax standing of a client, with the exemption document that evidences it.
-- =============================================================================
create table client_tax_profiles (
  id                    uuid                 not null default gen_random_uuid() primary key,
  client_uuid           uuid                 not null,
  client_id             uuid                 not null references clients (id),
  profile_type          customer_tax_profile not null,
  exemption_document_id uuid                 references documents (id),
  effective_from        date                 not null,
  superseded_at         timestamptz,
  created_at            timestamptz          not null default now(),
  created_by            uuid                 references users (id),

  constraint client_tax_profiles_client_uuid_key unique (client_uuid),

  constraint client_tax_profiles_exempt_requires_document check (
    profile_type <> 'Tax Exempt' or exemption_document_id is not null
  )
);

comment on column client_tax_profiles.exemption_document_id is
  'Required when Tax Exempt. The certificate itself expires; expiry blocks and prompts a request for an updated copy.';
comment on column client_tax_profiles.superseded_at is
  'Terminal - a profile is superseded by a newer row, never edited and never deleted.';

-- One live profile per client.
create unique index client_tax_profiles_one_live_per_client
  on client_tax_profiles (client_id)
  where superseded_at is null;

-- STRUCTURAL RULE: no pan_number or vat_registration_no column may exist here.
-- PAN/VAT lives once, on clients.pan_vat. Two columns would be two sources of truth.
-- TRIGGER REQUIRED (at the booking gate, not here): an expired client ID or a
-- missing PAN blocks Confirm on a new booking; the gate reads this table and
-- client_documents.

alter table client_tax_profiles enable row level security;


-- =============================================================================
-- client_change_requests
-- A portal-originated PROPOSED edit to the client's own contact details. The
-- portal is read-mostly: an edit lands as a request for staff, never a silent
-- overwrite, because the client record feeds invoices and agreements.
-- =============================================================================
create table client_change_requests (
  id               uuid                  not null default gen_random_uuid() primary key,
  client_uuid      uuid                  not null,
  client_id        uuid                  not null references clients (id),
  portal_user_id   uuid                  not null references portal_users (id),
  proposed_changes jsonb                 not null,
  status           change_request_status not null default 'Edit requested',
  submitted_ip     inet,
  reviewed_by      uuid                  references users (id),
  reviewed_at      timestamptz,
  voided_at        timestamptz,
  created_at       timestamptz           not null default now(),

  constraint client_change_requests_client_uuid_key unique (client_uuid),

  constraint client_change_requests_review_pairing check (
    (reviewed_by is null) = (reviewed_at is null)
  )
);

comment on column client_change_requests.portal_user_id is
  'Every write is attributed to the individual user, not to the client organisation.';
comment on column client_change_requests.proposed_changes is
  'Field-level proposed values. TODO(decision): jsonb rather than column-per-field because CP-11 names only "contact details" and never enumerates which fields are editable - decide the editable field set, then decide whether a typed shape replaces this.';
comment on column client_change_requests.status is
  'Only "Edit requested" is named by the spec; the rest derive from "until staff accept".';
comment on column client_change_requests.voided_at is
  'Terminal for a withdrawn or superseded request. Requests are voided, never deleted.';

-- TRIGGER REQUIRED: a change request may NEVER write to clients directly. Only a
-- staff acceptance applies the change, as a separate audited write.
-- STRUCTURAL RULE: no portal action may alter an invoice, booking or availability
-- by itself.
-- TODO(decision): whether a Member (as opposed to Owner-user) may raise a contact
-- change request is not stated - the CP-1.3 role table does not list it. Do not
-- grant it to Member by default in the RLS policy.
-- TRIGGER REQUIRED: raise on DELETE.

alter table client_change_requests enable row level security;


-- =============================================================================
-- client_channel_identities
-- Per-channel identity for a client - the phone number, email address or in-app
-- handle a message is actually addressed to.
-- =============================================================================
create table client_channel_identities (
  id                  uuid         not null default gen_random_uuid() primary key,
  client_uuid         uuid         not null,
  client_id           uuid         not null references clients (id),
  contact_id          uuid         references client_contacts (id),
  channel             channel_code not null,
  address             text         not null,
  is_on_whatsapp      boolean,
  is_active           boolean      not null default true,
  deactivated_at      timestamptz,
  deactivation_reason text,
  created_at          timestamptz  not null default now(),
  created_by          uuid         references users (id),

  constraint client_channel_identities_client_uuid_key unique (client_uuid)
);

comment on column client_channel_identities.contact_id is
  'Contacts are the addressees for Email, SMS, WhatsApp and push - "which number the WhatsApp goes to". Nullable because the Unified Inbox identity panel is client-level.';
comment on column client_channel_identities.address is
  'E.164 number or email address. Masked to last four for every role below Manager/Accounts.';
comment on column client_channel_identities.is_on_whatsapp is
  'DELIBERATELY tri-state: NULL means never checked. The fallback condition "delivery fails OR number not on WhatsApp" depends on that distinction.';
comment on column client_channel_identities.deactivation_reason is
  'For example, a hard bounce flagged the record for a corrected address.';

-- Unique among ACTIVE rows only.
create unique index client_channel_identities_unique_active_address
  on client_channel_identities (client_id, channel, address)
  where is_active;

-- STRUCTURAL RULE: "No reachable channel" must be DERIVED from all identities
-- plus the suppression list plus failure history - never stored as a second flag
-- that goes stale.
-- STRUCTURAL RULE: suppression is absolute and lives on its own table; a
-- suppressed address is excluded from every send including transactional. It is
-- deliberately NOT modelled as a column here.
-- STRUCTURAL RULE: government ID, PAN and payment-card content are never accepted
-- or stored on a message or an identity row.
-- TRIGGER REQUIRED: raise on DELETE. Rows are deactivated, never deleted.

alter table client_channel_identities enable row level security;


-- =============================================================================
-- client_marketing_consents
-- Current MESSAGE-marketing consent per client per channel. Transactional
-- consent is not stored - it is implied by the rental relationship and derived.
-- =============================================================================
create table client_marketing_consents (
  id                     uuid                    not null default gen_random_uuid() primary key,
  client_uuid            uuid                    not null,
  client_id              uuid                    not null references clients (id),
  channel                channel_code            not null,
  state                  marketing_consent_state not null default 'Not asked',
  opted_in_at            timestamptz,
  opt_in_source          text,
  opt_in_actor_id        uuid                    references users (id),
  opted_out_at           timestamptz,
  opt_out_origin_channel channel_code,
  created_at             timestamptz             not null default now(),
  updated_at             timestamptz             not null default now(),

  constraint client_marketing_consents_client_uuid_key unique (client_uuid),

  -- (client_id, channel) is the real key; id is only a surrogate.
  constraint client_marketing_consents_client_channel_key unique (client_id, channel),

  constraint client_marketing_consents_opt_in_requires_provenance check (
    state <> 'Opted in'
    or (opted_in_at is not null and opt_in_source is not null and opt_in_actor_id is not null)
  )
);

comment on column client_marketing_consents.state is
  'TODO(decision): marketing_consent_state carries two unreconciled vocabularies - "Not asked / Opted in / Opted out" from Unified Inbox section 3.1, and "Opt-In / Opt-Out / Do Not Disturb" from Communication Settings.md, which adds a fourth concept with no Inbox equivalent. A ruling is needed before either side is retired; only the Inbox vocabulary is used in the CHECK above.';
comment on column client_marketing_consents.opted_in_at is
  'AD/UTC. Opted in is recorded with source, date and actor or it is not recorded at all.';
comment on column client_marketing_consents.opt_out_origin_channel is
  'The channel the opt-out ARRIVED on, which may differ from this row''s channel - a STOP on SMS opts the client out of email and WhatsApp too.';

-- TRIGGER REQUIRED: opting out on any one channel sets 'Opted out' on EVERY
-- channel for that client, honoured within one minute.
-- TRIGGER REQUIRED: state may not move from 'Opted out' back to 'Opted in'
-- without an explicit new client opt-in event; opt-out is otherwise irreversible
-- (forward-only transition).
-- TRIGGER REQUIRED: a spam complaint suppresses the email address permanently and
-- sets email marketing consent to 'Opted out'.
-- STRUCTURAL RULE: no transactional-consent column exists - it is derived from an
-- active or recent booking and cannot be withdrawn while a booking is active.
-- TRIGGER REQUIRED: state changes APPEND to a consent-event history; this row is
-- a projection over that history. Never deleted.

alter table client_marketing_consents enable row level security;


-- ===========================================================================
-- NOTHING IS DELETED: no DELETE is granted on any clients-domain table, to any
-- role, including Owner. Terminal actions are the state changes named on each
-- table - Deactivate, Retire, Void, Supersede, Archive, Close.
-- ===========================================================================
revoke delete on
  clients,
  client_contacts,
  client_flags,
  client_merges,
  membership_plans,
  client_memberships,
  membership_limit_breaches,
  client_commercial_overrides,
  portal_users,
  portal_auth_challenges,
  portal_sessions,
  client_documents,
  client_tax_profiles,
  client_change_requests,
  client_channel_identities,
  client_marketing_consents
from public, anon, authenticated;

-- APPEND-ONLY: a mistake on these is a compensating row, never an edit.
revoke update on
  client_merges,
  membership_limit_breaches
from public, anon, authenticated;

-- WAREHOUSE SEES NO MONEY. This is grants and RLS, never CSS hiding. The
-- monetary columns must be ABSENT from the row projection for Warehouse,
-- Technician and Driver - not present-and-blank. Emitted here as the required
-- column-level revokes, to be applied against the named roles in the roles
-- migration:
--   clients                     - approved_credit_limit, payment_terms
--   membership_plans            - annual_fee, individual_discount_pct,
--                                 bundle_discount_pct, default_credit_limit
--   client_memberships          - fee_paid
--   client_commercial_overrides - the whole table
--   client_documents            - the whole table (Owner / Manager / Billing only)
--   client_tax_profiles         - the whole table
-- Rental Coordinator may see money but may not Block (client_flags) or Merge
-- (client_merges). Approve on client_commercial_overrides is Owner/Manager only.
-- portal_auth_challenges is service-role only: NO portal user and NO staff role
-- may read it - reading another phone's challenge row is account takeover.
-- Portal reads are scoped to client_id at the database on every clients-domain
-- table; a Member-role portal user is additionally denied
-- clients.approved_credit_limit, clients.payment_terms and the membership
-- discount percentage.

commit;
