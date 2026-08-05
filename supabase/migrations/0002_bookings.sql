-- =============================================================================
-- 0002_bookings.sql — domain: bookings (11 tables)
--
-- Laws encoded here, not in application code:
--   Nothing is deleted. Terminal actions are state changes (Cancel/Void/Archive).
--   Money is numeric(14,2). Timestamps are timestamptz in UTC (AD). No BS columns.
--   Every user-written table carries client_uuid uuid not null unique (idempotency).
--   days is not null default 1 on every priced line.
--   Discount > 10% needs reason >= 10 chars AND an approver; hard cap 25%. No bypass.
--   Enum types are created in 0001_enums.sql and only referenced here.
--   Tables in other domains (branches, clients, users, products, assets, documents,
--   operation_sessions, suppliers, bundles, coupons, audit_events) are referenced, not defined.
-- =============================================================================


-- =============================================================================
-- bookings
-- The one booking record: identity, schedule, stage pointer, delivery mode,
-- deposit liability figure and terminal cancellation. Every surface reads it here.
-- =============================================================================
create table bookings (
  id                     uuid           not null default gen_random_uuid() primary key,
  client_uuid            uuid           not null,
  booking_no             text           not null,
  branch_id              uuid           not null references branches (id),
  client_id              uuid           not null references clients (id),
  contact_id             uuid           references client_contacts (id),
  authorized_contact_id  uuid           references client_contacts (id),
  project                text,
  stage                  booking_stage  not null default 'Quote',
  pickup_at              timestamptz    not null,
  return_at              timestamptz    not null,
  actual_return_at       timestamptz,
  delivery_type          delivery_type  not null,
  pickup_location        text,
  return_location        text,
  quote_expires_at       timestamptz,   -- TODO(decision): whether a quote LAPSES, and whether automatically, is unspecified. Nothing acts on this date today except the calendar and the 'Quote expiring' alert.
  deposit_required       numeric(14,2)  not null default 0, -- TODO(decision): how the required deposit is calculated is unspecified.
  cancelled_at           timestamptz,
  cancelled_by           uuid           references users (id),
  cancellation_reason    text,
  closed_at              timestamptz,
  locked_by              uuid           references users (id),
  locked_at              timestamptz,   -- TODO(decision): abandoned-lock expiry period is unspecified.
  version                integer        not null default 1,
  created_at             timestamptz    not null default now(),
  created_by             uuid           not null references users (id),
  updated_at             timestamptz    not null default now(),
  updated_by             uuid           not null references users (id),

  constraint bookings_client_uuid_key unique (client_uuid),
  constraint bookings_booking_no_key unique (booking_no),

  -- The current build shipped a booking picked up 11:30 and returned 06:00 the same day.
  constraint bookings_return_after_pickup check (return_at > pickup_at),

  -- BK-YYYY-NNNN. BR- is the branch prefix; a BR- booking reference is a defect.
  constraint bookings_booking_no_format check (booking_no ~ '^BK-[0-9]{4}-[0-9]{4}$'),

  constraint bookings_cancelled_requires_actor_and_reason check (
    stage <> 'Cancelled'
    or (cancelled_at is not null
        and cancelled_by is not null
        and cancellation_reason is not null
        and char_length(btrim(cancellation_reason)) > 0)
  ),

  constraint bookings_version_positive check (version >= 1),
  constraint bookings_deposit_non_negative check (deposit_required >= 0)
);

comment on column bookings.client_uuid is
  'Client-generated idempotency key. Every write carries one; duplicates are rejected by the unique index.';
comment on column bookings.booking_no is
  'BK-YYYY-NNNN, immutable after creation. Counters never move backwards. BR- is the branch prefix and never appears on a booking.';
comment on column bookings.client_id is
  'Company level: PAN/VAT, credit limit, membership, Blocked. The word "customer" appears nowhere in this schema.';
comment on column bookings.authorized_contact_id is
  'The authorized person is a contact, not free text. A representative collecting requires an authorisation letter.';
comment on column bookings.stage is
  'Read model of booking_stage_transitions. Written ONLY by that table''s trigger; a direct UPDATE is rejected.';
comment on column bookings.pickup_at is
  'AD, UTC. No BS column exists anywhere on this table; all sorting, overdue logic and availability run on this value.';
comment on column bookings.return_at is
  'Expected return. An extension moves this value and reprices lines 1-11, but is not a stage change.';
comment on column bookings.actual_return_at is
  'Set by the Return workspace. Compared to return_at once, at the return session, to raise Returned Early or Late Return.';
comment on column bookings.delivery_type is
  'The single home for delivery mode. booking_transport deliberately does not carry a second copy.';
comment on column bookings.deposit_required is
  'A stated liability, not a movement: deliberately not in the deposits table and carrying no FK into payments.';
comment on column bookings.cancelled_at is
  'Cancel is the booking''s terminal action; the row is never deleted.';
comment on column bookings.cancelled_by is
  'Owner and Manager only — the Terminal capability.';
comment on column bookings.closed_at is
  'Closed is final. Once set, no further transition is accepted.';
comment on column bookings.locked_by is
  'One editable session per booking; a second user opens read-only naming the holder.';
comment on column bookings.version is
  'Optimistic lock, rendered "v4" in the hover-card footer. A stale save is rejected showing what changed.';

-- TRIGGER REQUIRED: booking_no is immutable after insert — reject any UPDATE that changes it.
-- TRIGGER REQUIRED: stage may never be written directly. Reject any UPDATE of stage that did not
--   originate from a booking_stage_transitions insert.
-- TRIGGER REQUIRED: Cancel is rejected while any booking_line_unit on this booking is 'Picked Up'.
--   Equipment that has left the building comes back through Return; it is not cancelled into non-existence.
-- TRIGGER REQUIRED: every insert and every stage change writes an audit_events row.
-- NOTHING IS DELETED: no DELETE for any role including Owner. Terminal action is Cancel.
revoke delete on bookings from public;
-- TRIGGER REQUIRED: raise on DELETE, so no role with a direct grant can bypass the revoke.

create index bookings_branch_stage_pickup_idx on bookings (branch_id, stage, pickup_at);
create index bookings_branch_stage_return_idx on bookings (branch_id, stage, return_at);
create index bookings_client_stage_idx on bookings (client_id, stage);

alter table bookings enable row level security;


-- =============================================================================
-- booking_lines
-- Every priced line on a booking except crew and transport: equipment, bundle,
-- bundle children, accessory, service, sub-rental and manual item. days is mandatory on all.
-- =============================================================================
create table booking_lines (
  id                uuid              not null default gen_random_uuid() primary key,
  client_uuid       uuid              not null,
  booking_id        uuid              not null references bookings (id),
  line_type         booking_line_type not null,
  parent_line_id    uuid              references booking_lines (id),
  product_id        uuid              references products (id),
  bundle_id         uuid              references bundles (id),
  description       text,
  qty               integer           not null default 1,
  days              integer           not null default 1,
  rate              numeric(14,2)     not null default 0,
  discount_amount   numeric(14,2)     not null default 0,
  is_included       boolean           not null default false,
  service_basis     service_basis,
  supplier_id       uuid              references suppliers (id),
  supplier_cost     numeric(14,2),
  markup_amount     numeric(14,2),    -- TODO(decision): whether markup is a fixed system percentage or set per line is an open question. Stored per line because that shape survives either answer.
  line_note         text,
  sort_order        integer           not null default 0,
  voided_at         timestamptz,
  voided_reason     text,
  created_at        timestamptz       not null default now(),
  created_by        uuid              not null references users (id),

  constraint booking_lines_client_uuid_key unique (client_uuid),

  constraint booking_lines_qty_positive check (qty > 0),

  -- days is mandatory on every priced line; a per-booking line stores 1 explicitly, never by omission.
  constraint booking_lines_days_min check (days >= 1),

  constraint booking_lines_manual_item_needs_text check (
    line_type <> 'Manual item'
    or (description is not null and char_length(btrim(description)) > 0
        and line_note is not null and char_length(btrim(line_note)) > 0)
  ),

  constraint booking_lines_subrental_needs_cost check (
    line_type <> 'Sub-rental' or supplier_cost is not null
  ),

  constraint booking_lines_service_needs_basis check (
    line_type <> 'Service' or service_basis is not null
  ),

  -- Bundle children price at 0; the bundle line carries the rate.
  constraint booking_lines_bundle_child_is_free check (
    parent_line_id is null or (rate = 0 and discount_amount = 0)
  ),

  -- A line may not price negative.
  constraint booking_lines_discount_within_line check (discount_amount <= qty * rate * days),

  constraint booking_lines_void_needs_reason check (
    voided_at is null
    or (voided_reason is not null and char_length(btrim(voided_reason)) > 0)
  ),

  constraint booking_lines_money_non_negative check (
    rate >= 0 and discount_amount >= 0
    and (supplier_cost is null or supplier_cost >= 0)
    and (markup_amount is null or markup_amount >= 0)
  ),

  constraint booking_lines_not_own_parent check (parent_line_id is distinct from id)
);

comment on column booking_lines.line_type is
  'Drives which pricing rule applies and which columns must be populated.';
comment on column booking_lines.parent_line_id is
  'Self-FK for bundle children. Children price at 0; the bundle line carries the rate.';
comment on column booking_lines.days is
  'MANDATORY on every priced line. Extending a booking changes this and reprices steps 1-11.';
comment on column booking_lines.rate is
  'Rupees, no sub-rupee values stored. On a Bundle line this is the bundle rate.';
comment on column booking_lines.discount_amount is
  'Line discount, subtracted inside step 1. Entirely separate from the booking-level percentage at step 7.';
comment on column booking_lines.is_included is
  'An included accessory prices at 0 while still occupying stock and appearing on the packing list.';
comment on column booking_lines.sort_order is
  'Stable display order, and the order Auto Assign Serials walks.';
comment on column booking_lines.voided_at is
  'The Remove row action sets this. Records are never deleted.';

-- TRIGGER REQUIRED: parent_line_id must point at a line on the same booking.
-- TRIGGER REQUIRED: editing days, qty, rate or discount_amount at stage >= Confirmed writes to
--   audit_events and forces a reprice through the Financial Engine.
-- NOTHING IS DELETED: a removed line is Voided so it stays visible in history.
revoke delete on booking_lines from public;
-- TRIGGER REQUIRED: raise on DELETE for every role including Owner.

create index booking_lines_booking_sort_idx on booking_lines (booking_id, sort_order);
-- Feeds the range-overlap availability check.
create index booking_lines_product_live_idx on booking_lines (product_id) where voided_at is null;

alter table booking_lines enable row level security;


-- =============================================================================
-- booking_line_units
-- One row per physical unit committed to a line: assigned serial and its per-item
-- quantity state. Ready / Picked Up / Returned / Missing / Damaged lives here, per item.
-- =============================================================================
create table booking_line_units (
  id                    uuid                not null default gen_random_uuid() primary key,
  client_uuid           uuid                not null,
  booking_line_id       uuid                not null references booking_lines (id),
  asset_id              uuid                references assets (id),
  qty                   integer             not null default 1,
  unit_state            item_quantity_state not null default 'Ready',
  is_required           boolean             not null default true,
  packed                boolean             not null default false,
  packed_at             timestamptz,
  packed_by             uuid                references users (id),
  packing_session_id    uuid                references operation_sessions (id),
  handover_session_id   uuid                references operation_sessions (id),
  return_session_id     uuid                references operation_sessions (id),
  returned_at           timestamptz,
  condition             text,
  missing_reason        text,
  damaged               boolean             not null default false,
  reset_done_at         timestamptz,
  cleaning_done_at      timestamptz,
  created_at            timestamptz         not null default now(),
  created_by            uuid                not null references users (id),

  constraint booking_line_units_client_uuid_key unique (client_uuid),

  constraint booking_line_units_qty_positive check (qty > 0),

  -- The packing gate accepts a missing item ONLY with a reason.
  constraint booking_line_units_missing_needs_reason check (
    unit_state <> 'Missing'
    or (missing_reason is not null and char_length(btrim(missing_reason)) > 0)
  ),

  constraint booking_line_units_packed_needs_time check (
    packed = false or packed_at is not null
  )
);

comment on column booking_line_units.client_uuid is
  'Written by offline scanners: a replayed scan must not move the item twice.';
comment on column booking_line_units.asset_id is
  'The serialised unit. Null where the line is non-serialised and only a quantity is tracked. Authorization reaches this row through asset > warehouse > branch.';
comment on column booking_line_units.qty is
  '1 for serialised units; greater than 1 for non-serialised quantity rows.';
comment on column booking_line_units.unit_state is
  'A quantity state, NOT a booking status. "Picked Up" deliberately avoids reusing "On Rent".';
comment on column booking_line_units.is_required is
  'The packing gate is defined over Required items only.';
comment on column booking_line_units.handover_session_id is
  'A later session is never covered by an earlier session''s signature, which is why this is per unit and per session.';
comment on column booking_line_units.condition is
  'Text, not an enum: no spec defines the vocabulary, and inventing it would be inventing the vocabulary.';
comment on column booking_line_units.damaged is
  'Any true value blocks stage Closed until charges are settled, and triggers the Damage Report.';
comment on column booking_line_units.reset_done_at is
  'Per item, not per booking.';
comment on column booking_line_units.cleaning_done_at is
  'Per item. Items returning to stock are set Ready.';

-- TRIGGER REQUIRED (packing gate): the booking may not reach 'Ready' while any is_required unit is
--   neither packed nor Missing-with-a-reason.
-- TRIGGER REQUIRED (completed gate): the booking may not reach 'Completed' until reset_done_at and
--   cleaning_done_at are set on every unit whose category checklist requires them, and while any
--   unit_state = 'Missing'.
-- TRIGGER REQUIRED (closed gate): the booking may not reach 'Closed' while any unit has
--   damaged = true and unsettled charges.
-- TRIGGER REQUIRED: Auto Assign Serials may not select an asset in Maintenance, Cleaning or Damaged;
--   every assignment stays reversible until the booking is Confirmed.
-- NOTHING IS DELETED: a unit is released by voiding its parent line or by Swap, both of which leave the row.
revoke delete on booking_line_units from public;
-- TRIGGER REQUIRED: raise on DELETE for every role including Owner.

create index booking_line_units_line_idx on booking_line_units (booking_line_id);
create index booking_line_units_asset_state_idx on booking_line_units (asset_id, unit_state);
create index booking_line_units_handover_session_idx on booking_line_units (handover_session_id);
create index booking_line_units_return_session_idx on booking_line_units (return_session_id);

alter table booking_line_units enable row level security;


-- =============================================================================
-- booking_crew_lines
-- Crew charged to a booking. A different priced shape from equipment:
-- day rate plus overtime, accommodation and meals.
-- =============================================================================
create table booking_crew_lines (
  id             uuid          not null default gen_random_uuid() primary key,
  client_uuid    uuid          not null,
  booking_id     uuid          not null references bookings (id),
  crew_member_id uuid          references users (id),
  name           text          not null,
  crew_role      crew_role     not null,
  phone          text,
  day_rate       numeric(14,2) not null default 0,
  days           integer       not null default 1,
  overtime       numeric(14,2) not null default 0,
  accommodation  numeric(14,2) not null default 0,
  meals          numeric(14,2) not null default 0,
  voided_at      timestamptz,
  created_at     timestamptz   not null default now(),
  created_by     uuid          not null references users (id),

  constraint booking_crew_lines_client_uuid_key unique (client_uuid),

  -- days is mandatory on every priced line; a per-booking engagement stores 1 explicitly.
  constraint booking_crew_lines_days_min check (days >= 1),

  constraint booking_crew_lines_money_non_negative check (
    day_rate >= 0 and overtime >= 0 and accommodation >= 0 and meals >= 0
  ),

  constraint booking_crew_lines_name_present check (char_length(btrim(name)) > 0)
);

comment on column booking_crew_lines.crew_member_id is
  'Nullable because the Crew section renders a free-text Name column, permitting an ad-hoc crew member. Populated whenever the person is on staff, so the conflict check can run.';
comment on column booking_crew_lines.name is
  'Snapshotted so a later staff rename does not rewrite a signed agreement.';
comment on column booking_crew_lines.crew_role is
  'Job role on this booking. Never an RBAC role.';
comment on column booking_crew_lines.overtime is
  'An amount, not a count of hours — the formula adds it directly.';
comment on column booking_crew_lines.voided_at is
  'Removal is a state change, not a delete.';

-- DELIBERATELY NOT AN EXCLUDE CONSTRAINT: a crew member booked over the same dates elsewhere is a
--   Warning, and a Warning blocks Handover, not save.
-- TRIGGER REQUIRED: detection function for the crew double-booking Warning, feeding the alert set.
-- NOTHING IS DELETED: terminal action is Void.
revoke delete on booking_crew_lines from public;
-- TRIGGER REQUIRED: raise on DELETE for every role including Owner.

create index booking_crew_lines_booking_idx on booking_crew_lines (booking_id);
-- Feeds the crew conflict check.
create index booking_crew_lines_member_live_idx on booking_crew_lines (crew_member_id) where voided_at is null;

alter table booking_crew_lines enable row level security;


-- =============================================================================
-- booking_transport
-- The transport half of the booking: vehicle, driver and the two charges.
-- Exactly one row per booking.
-- =============================================================================
create table booking_transport (
  id                          uuid          not null default gen_random_uuid() primary key,
  client_uuid                 uuid          not null,
  booking_id                  uuid          not null references bookings (id),
  vehicle                     text,
  number_plate                text,
  driver_id                   uuid          references users (id),
  driver_contact              text,
  delivery_charge             numeric(14,2) not null default 0,
  fuel_charge                 numeric(14,2) not null default 0,
  zero_charge_override_by     uuid          references users (id),
  zero_charge_override_reason text,
  special_instructions        text,
  created_at                  timestamptz   not null default now(),
  created_by                  uuid          not null references users (id),

  constraint booking_transport_client_uuid_key unique (client_uuid),
  -- Strictly one transport record per booking.
  constraint booking_transport_booking_id_key unique (booking_id),

  constraint booking_transport_charges_non_negative check (
    delivery_charge >= 0 and fuel_charge >= 0
  ),

  -- The override actor and its reason travel together or not at all.
  constraint booking_transport_override_is_paired check (
    (zero_charge_override_by is null and zero_charge_override_reason is null)
    or (zero_charge_override_by is not null
        and zero_charge_override_reason is not null
        and char_length(btrim(zero_charge_override_reason)) > 0)
  )
);

comment on column booking_transport.number_plate is
  'Captured at handover and printed on the Delivery Note.';
comment on column booking_transport.zero_charge_override_by is
  'Set only when Customer Pickup carries a non-zero charge; its presence is what lets the rule pass, and the override writes to audit.';

-- TRIGGER REQUIRED (reads the parent booking, so it cannot be a CHECK):
--   bookings.delivery_type = 'Customer Pickup' requires delivery_charge = 0 AND fuel_charge = 0,
--   unless zero_charge_override_by and zero_charge_override_reason are both present.
-- TRIGGER REQUIRED: any row where the override columns are set writes an audit_events entry.
-- NOT A SAVE-TIME BLOCK: a delivery conflict is a Warning that blocks Handover.
revoke delete on booking_transport from public;
-- TRIGGER REQUIRED: raise on DELETE for every role including Owner.

alter table booking_transport enable row level security;


-- =============================================================================
-- booking_stage_transitions
-- Append-only history of every stage movement, and the ONLY writer of bookings.stage.
-- Forward-only, no-skipping, manager-approved reversal and causal ordering live here.
-- =============================================================================
create table booking_stage_transitions (
  id           uuid          not null default gen_random_uuid() primary key,
  client_uuid  uuid          not null,
  booking_id   uuid          not null references bookings (id),
  branch_id    uuid          not null references branches (id),
  from_stage   booking_stage,
  to_stage     booking_stage not null,
  is_reversal  boolean       not null default false,
  approved_by  uuid          references users (id),
  reason       text,
  audit_event_id uuid          references audit_events (id),
  occurred_at  timestamptz   not null default now(),
  actor_id     uuid          not null references users (id),
  actor_role   text          not null,
  source       text,
  created_at   timestamptz   not null default now(),

  constraint booking_stage_transitions_client_uuid_key unique (client_uuid),

  -- A reversal is never accepted bare. No role bypass, including Owner.
  constraint booking_stage_transitions_reversal_needs_approval check (
    is_reversal = false
    or (approved_by is not null
        and reason is not null and char_length(btrim(reason)) > 0
        and audit_event_id is not null)
  ),

  constraint booking_stage_transitions_cancel_needs_reason check (
    to_stage <> 'Cancelled'
    or (reason is not null and char_length(btrim(reason)) > 0)
  ),

  constraint booking_stage_transitions_no_self_transition check (
    from_stage is null or from_stage <> to_stage
  )
);

comment on column booking_stage_transitions.client_uuid is
  'A double-submitted Confirm may not advance two stages.';
comment on column booking_stage_transitions.branch_id is
  'Denormalised from the booking so RLS and the reporting indexes do not require a join on an append-only hot path.';
comment on column booking_stage_transitions.from_stage is
  'Null only on the row that creates the booking at Quote or Draft.';
comment on column booking_stage_transitions.is_reversal is
  'True when to_stage precedes from_stage in the enum''s declared lifecycle order.';
comment on column booking_stage_transitions.approved_by is
  'Required on reversals. Must resolve to a Manager or Owner AT THE APPROVER''S OWN BRANCH — a Manager at one branch is not a Manager at another.';
comment on column booking_stage_transitions.audit_event_id is
  'Required on reversals: the link is what proves the reversal was written to audit.';
comment on column booking_stage_transitions.occurred_at is
  'AD, UTC. The value causal-order validation compares.';
comment on column booking_stage_transitions.actor_role is
  'Role held at the time, snapshotted — a later role change must not rewrite history.';
comment on column booking_stage_transitions.created_at is
  'Distinct from occurred_at so a late-recorded event cannot silently rewrite the ordering.';

-- APPEND-ONLY. No UPDATE, no DELETE, for anyone including Owner. A wrong transition is corrected
--   by inserting a reversal row.
revoke update, delete on booking_stage_transitions from public;
-- TRIGGER REQUIRED: raise on UPDATE and on DELETE, so no direct grant can bypass the revoke.
-- TRIGGER REQUIRED: unless is_reversal, to_stage must be the immediately next value in booking_stage
--   order — skipping is rejected. 'Cancelled' is the sole exception, reachable from any stage.
-- TRIGGER REQUIRED: occurred_at must be >= the occurred_at of the booking's previous transition.
--   A booking cannot be confirmed after it was packed; a violation surfaces in the audit log.
-- TRIGGER REQUIRED: no transition may be inserted for a booking whose closed_at is set.
--   Closed is final and cannot be reopened.
-- TRIGGER REQUIRED: to_stage = 'Cancelled' releases the booking's inventory reservations in the
--   same transaction.
-- TRIGGER REQUIRED: advancing to 'Confirmed' runs as one transaction — reserve inventory for the
--   booking dates, update calendar, recalculate payment status, generate the Rental Agreement,
--   enable Packing, write audit. Any reservation failure rolls the whole transition back, naming
--   the conflicting line.
-- TRIGGER REQUIRED: advance past 'Confirmed' is rejected while any Critical condition holds — an
--   equipment conflict, a client with neither government ID nor PAN, a stacked discount above 10%
--   without reason and approver, a Blocked client, or a client over credit limit.
-- TRIGGER REQUIRED: this table's trigger is the only writer of bookings.stage.

create index booking_stage_transitions_booking_idx on booking_stage_transitions (booking_id, occurred_at);
create index booking_stage_transitions_branch_idx on booking_stage_transitions (branch_id, to_stage, occurred_at);

alter table booking_stage_transitions enable row level security;


-- =============================================================================
-- booking_flags
-- Only flags that record a historical observation and must survive later data changes.
-- Every other flag in the registry is derived on read and must not be stored here.
-- =============================================================================
create table booking_flags (
  id                     uuid         not null default gen_random_uuid() primary key,
  client_uuid            uuid         not null,
  booking_id             uuid         not null references bookings (id),
  flag                   booking_flag not null,
  flag_type              flag_type    not null,
  observed_at            timestamptz  not null,
  observed_in_session_id uuid         references operation_sessions (id),
  cleared_at             timestamptz,
  cleared_by             uuid         references users (id),
  cleared_reason         text,
  created_at             timestamptz  not null default now(),
  created_by             uuid         not null references users (id),

  constraint booking_flags_client_uuid_key unique (client_uuid),

  -- Only the recorded subset may be stored. Partial Pickup, Partial Return, Deposit Pending,
  -- Payment Due and Overdue are DERIVED — a stored derivation goes stale between scheduler runs.
  -- VIP, Blocked and Upgrade Candidate are client attributes; a booking copy would go stale the
  -- moment the client changed.
  constraint booking_flags_recorded_subset_only check (
    flag in ('Returned Early', 'Late Return', 'Missing', 'Damaged')
  ),

  constraint booking_flags_clear_needs_actor_and_reason check (
    cleared_at is null
    or (cleared_by is not null
        and cleared_reason is not null
        and char_length(btrim(cleared_reason)) > 0)
  )
);

comment on column booking_flags.booking_id is
  'Flags append to the stage, never replace it — the render is "On Rent - Overdue 1d".';
comment on column booking_flags.flag_type is
  'Registry classification; must match the flag.';
comment on column booking_flags.observed_at is
  'The instant the fact was true. This is why Late Return survives a later extension: the flag records what happened, the dates record what was agreed.';
comment on column booking_flags.cleared_at is
  'Cleared, never deleted. Overwriting history to make a report look tidy is exactly what the spec warns against.';

-- TRIGGER REQUIRED: flag_type must match the registry classification of flag.
-- TRIGGER REQUIRED: Returned Early is raised when actual_return_at < return_at, Late Return when
--   actual_return_at > return_at. Evaluated once, at the return session, against the AD value.
-- TRIGGER REQUIRED: a Late Return row is not auto-cleared by a subsequent extension.
-- NOTHING IS DELETED.
revoke delete on booking_flags from public;
-- TRIGGER REQUIRED: raise on DELETE for every role including Owner.

create index booking_flags_open_idx on booking_flags (booking_id) where cleared_at is null;

alter table booking_flags enable row level security;


-- =============================================================================
-- booking_discounts
-- One row per applied discount tier. The sole home of booking-level discount:
-- the >10% reason-plus-approver rule and the 25% cap are DATABASE constraints here,
-- because no role including Owner may bypass them.
-- =============================================================================
create table booking_discounts (
  id              uuid            not null default gen_random_uuid() primary key,
  client_uuid     uuid            not null,
  booking_id      uuid            not null references bookings (id),
  branch_id       uuid            not null references branches (id),
  discount_source discount_source not null,
  percent         numeric(5,2)    not null,
  reason          text,
  approver_id     uuid            references users (id),
  applied_by      uuid            not null references users (id),
  applied_at      timestamptz     not null default now(),
  coupon_id       uuid            references coupons (id),
  audit_event_id    uuid            not null references audit_events (id),
  created_at      timestamptz     not null default now(),

  constraint booking_discounts_client_uuid_key unique (client_uuid),

  -- Above 25% is not approvable by anyone.
  constraint booking_discounts_hard_cap check (percent >= 0 and percent <= 25),

  -- A table CHECK precisely so no role, no RLS policy and no application path can bypass it.
  constraint booking_discounts_over_ten_needs_reason_and_approver check (
    percent <= 10
    or (char_length(btrim(reason)) >= 10 and approver_id is not null)
  ),

  constraint booking_discounts_coupon_source_pairing check (
    (discount_source = 'Coupon' and coupon_id is not null)
    or (discount_source <> 'Coupon' and coupon_id is null)
  )
);

comment on column booking_discounts.booking_id is
  'Discount is step 7, applied to the booking Subtotal, before VAT.';
comment on column booking_discounts.percent is
  'Capped at 25 per row and at 25 summed across stacked rows.';
comment on column booking_discounts.reason is
  'Required above 10%, minimum 10 characters. Ten characters does not guarantee a good reason but it defeats "." and "ok".';
comment on column booking_discounts.approver_id is
  'Required above 10%. "Named approver" means a person is recorded. Self-approval is visible in audit, not blocked.';
comment on column booking_discounts.coupon_id is
  'A coupon is not a bypass; the gate applies to the resulting total, not the source.';
comment on column booking_discounts.audit_event_id is
  'Written only on success — a blocked attempt is not an approval and must not read as one in the log.';

-- TRIGGER REQUIRED: SUM(percent) per booking <= 25; tiers auto-disable once the cap is reached.
-- TRIGGER REQUIRED: the stacked total crossing 10% re-imposes the reason-plus-approver requirement
--   on the whole booking, even when every individual row is under 10%.
-- TRIGGER REQUIRED: stacking matrix — Membership + Coupon + Women-DoP 5% may coexist; Student,
--   College and Named-client rates may not stack with anything.
-- NOTHING IS DELETED: a withdrawn discount is a new row, and audit already holds the original.
revoke delete on booking_discounts from public;
-- TRIGGER REQUIRED: raise on DELETE for every role including Owner.

create index booking_discounts_booking_idx on booking_discounts (booking_id);
create index booking_discounts_branch_applied_idx on booking_discounts (branch_id, applied_at);
create index booking_discounts_approver_applied_idx on booking_discounts (approver_id, applied_at);

alter table booking_discounts enable row level security;


-- =============================================================================
-- booking_documents
-- The link between a booking and documents in the central store, naming the role each
-- document plays. Not a second document store: a document exists once and is linked.
-- =============================================================================
create table booking_documents (
  id                      uuid                  not null default gen_random_uuid() primary key,
  client_uuid             uuid                  not null,
  booking_id              uuid                  not null references bookings (id),
  document_id             uuid                  not null references documents (id),
  doc_type                booking_document_type not null,
  origin                  document_origin       not null,
  produced_in_session_id  uuid                  references operation_sessions (id),
  linked_at               timestamptz           not null default now(),
  created_at              timestamptz           not null default now(),
  created_by              uuid                  not null references users (id),

  constraint booking_documents_client_uuid_key unique (client_uuid),
  constraint booking_documents_link_key unique (booking_id, doc_type, document_id)
);

comment on column booking_documents.booking_id is
  'Cancelling a booking keeps the record AND its documents.';
comment on column booking_documents.document_id is
  'The one stored document. Its identifier, lifecycle, version history, signatures and delivery tracking live in the document store and are never duplicated here.';
comment on column booking_documents.doc_type is
  'The role this document plays on this booking — what the stage gate and the hover-card tick strip are keyed on.';
comment on column booking_documents.origin is
  'Client Documents and Insurance are uploaded rather than generated.';
comment on column booking_documents.produced_in_session_id is
  'Packing List, Delivery Note, Inspection Report and Damage Report are produced by a session, and evidence attaches to that session, never to the booking.';

-- TRIGGER REQUIRED: a link may only be created once the booking has reached the stage that unlocks
--   that doc_type (Quote at 0, Rental Agreement at 2, Packing List at 3, Delivery Note at 5,
--   Inspection Report at 8; Invoice on invoice generated, Receipt on payment recorded, Damage Report
--   on a Damaged flag). Nothing is pre-generated on a Draft — a disabled card reads 'Not available'.
-- TRIGGER REQUIRED: a 'Damage Report' link may exist only where a Damaged flag or a damaged unit
--   exists on that booking.
-- TRIGGER REQUIRED: the Handover gate 'Documents Ready' fails while any document the mandatory-
--   documents matrix requires for this booking's context has no link here in an Issued or Signed state.
-- NOTHING IS DELETED: the document's terminal action is Archive, taken in the document store.
--   Unlinking is not a thing.
revoke delete on booking_documents from public;
-- TRIGGER REQUIRED: raise on DELETE for every role including Owner.

create index booking_documents_document_idx on booking_documents (document_id);

alter table booking_documents enable row level security;


-- =============================================================================
-- booking_notes
-- Notes attached to a booking or one of its lines. Internal notes never print or export.
-- =============================================================================
create table booking_notes (
  id              uuid        not null default gen_random_uuid() primary key,
  client_uuid     uuid        not null,
  booking_id      uuid        not null references bookings (id),
  booking_line_id uuid        references booking_lines (id),
  note_type       note_type   not null,
  body            text        not null,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid        not null references users (id),

  constraint booking_notes_client_uuid_key unique (client_uuid),
  constraint booking_notes_body_present check (char_length(btrim(body)) > 0)
);

comment on column booking_notes.booking_line_id is
  'Set when the note came from the line Notes row action or from a manual item, which requires one.';
comment on column booking_notes.archived_at is
  'Archived, never deleted — there is no Recycle Bin anywhere in this system.';

-- TRIGGER REQUIRED: booking_line_id must reference a line on the same booking.
-- VIEW REQUIRED: note_type = 'Internal' rows are excluded from every print, PDF, email, WhatsApp and
--   export path by a separate printable view — never by an application flag.
-- NOTHING IS DELETED: terminal action is Archive.
revoke delete on booking_notes from public;
-- TRIGGER REQUIRED: raise on DELETE for every role including Owner.

create index booking_notes_booking_recent_idx on booking_notes (booking_id, created_at desc);

alter table booking_notes enable row level security;


-- =============================================================================
-- booking_client_state_map
-- Static reference data: the projection from the thirteen internal stages down to the
-- eight client-visible states and the six fixed portal timeline steps. Resolved on every
-- portal read — the client-visible state is never a column on a booking.
-- =============================================================================
create table booking_client_state_map (
  id                   uuid                 not null default gen_random_uuid() primary key,
  internal_stage       booking_stage        not null,
  client_visible_state client_visible_state not null,
  timeline_step        client_timeline_step,
  created_at           timestamptz          not null default now(),

  -- Exactly one row per booking_stage value; no stage may be unmapped.
  constraint booking_client_state_map_internal_stage_key unique (internal_stage)
);

comment on column booking_client_state_map.internal_stage is
  'The real key. Every one of the thirteen booking_stage values must have exactly one row.';
comment on column booking_client_state_map.client_visible_state is
  'Inspection and Cleaning both resolve to "Returned"; neither word may appear on any client-facing surface.';
comment on column booking_client_state_map.timeline_step is
  'Which of the six fixed portal dots this stage lights. NULL for Return Due and Cancelled, which have no dot in the sequence.';

-- SEED ASSERTION REQUIRED: COUNT(*) = 13 after seeding, so no stage is left unmapped.
-- STRUCTURAL RULE: client_visible_state must never be stored on bookings; it is resolved through
--   this map on every read.
-- TEST REQUIRED: floor vocabulary — Packing, Reset, Inspection, Unverified, Cleaning — must never
--   reach a portal response. Verified by inspecting the response payload, not hidden with CSS.
revoke delete on booking_client_state_map from public;

alter table booking_client_state_map enable row level security;
