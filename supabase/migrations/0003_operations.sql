-- 0003_operations.sql
-- Babin Rentals OS - the operations domain: 24 tables covering sessions,
-- packing, handover, return, inspection, damage, signatures, scanning,
-- evidence, cleaning, overrides, crew, reservations and fulfilment.
--
-- Generated from schema-model.json (domain = "operations"). Enum types are
-- created in 0001_enums.sql and are only used here. Tables in other domains
-- (bookings, booking_lines, users, assets, items, products, categories,
-- bundles, clients, cases, charges, maintenance_records, sub_rentals,
-- productions, vehicles, branches, warehouses, audit_events) are referenced
-- by foreign key and are never defined here.
--
-- LAWS ENCODED IN THIS FILE, IN THE DATABASE, WITH NO ROLE BYPASS:
--   * NOTHING IS DELETED. Terminal actions are state changes - Cancel, Void,
--     Reverse, Retire, Archive, Deactivate, Close. No DELETE is granted to any
--     role (see the grants block at the foot of this file), including Owner.
--   * Every user-written table carries client_uuid uuid not null unique. A
--     replayed offline write is REJECTED, never applied twice.
--   * Every timestamp is timestamptz in UTC (AD). There is no BS column
--     anywhere in this schema and none may be added.
--   * Money is numeric(14,2). Never float.
--   * days is not null default 1 on every priced line.
--   * A reason that unblocks a rule is >= 10 characters, enforced by CHECK.
--   * Append-only tables (scan_events, session_line_movements,
--     override_records) take no UPDATE and no DELETE from anyone.
--   * Warehouse sees no monetary value. That is RLS and column grants, never
--     UI hiding - RLS is enabled on every table below and the policies are
--     written in the policy migration.
--
-- Constraints that Postgres cannot express as a CHECK/UNIQUE/EXCLUDE - the
-- cross-row, cross-table, forward-only and append-only rules - are emitted as
-- "-- TRIGGER REQUIRED:" comments at the point they belong. They are not
-- optional and they are not application logic.

begin;

create extension if not exists btree_gist;


-- ===========================================================================
-- operation_sessions
-- One packing, handover or return session against a booking, owning its own
-- receiver, staff, timestamps, evidence, signatures and item set. A booking
-- may run several sessions per operation; a later session is never covered by
-- an earlier session's signature.
-- ===========================================================================
create table operation_sessions (
  id                                uuid not null default gen_random_uuid() primary key,
  client_uuid                       uuid not null unique,
  booking_id                        uuid not null references bookings (id),
  operation                         operation_kind not null,
  session_no                        int not null default 1,
  state                             session_state not null default 'Not Started',
  started_at                        timestamptz,
  started_by                        uuid references users (id),
  completed_at                      timestamptz,
  completed_by                      uuid references users (id),
  cancelled_at                      timestamptz,
  cancel_reason                     text,
  warehouse_staff_id                uuid not null references users (id),
  delivery_method                   delivery_method,
  receiver_name                     text,
  receiver_phone                    text,
  receiver_email                    text,
  receiver_id_document_evidence_id  uuid, -- FK to evidence_files added at the foot of this file (forward reference)
  government_id_verified            boolean not null default false,
  booking_authorization_verified    boolean not null default false,
  received_at                       timestamptz,
  returning_person_name             text,
  pickup_person_name                text,
  pickup_person_phone               text,
  vehicle_plate                     text,
  driver_name                       text,
  driver_contact                    text,
  courier_name                      text,
  courier_tracking_number           text,
  delivery_address                  text,
  estimated_arrival                 timestamptz,
  device_id                         text,
  notes                             text,
  created_at                        timestamptz not null default now(),
  created_by                        uuid not null references users (id),
  updated_at                        timestamptz not null default now(),

  constraint operation_sessions_session_no_unique
    unique (booking_id, operation, session_no),

  constraint operation_sessions_operation_is_a_session
    check (operation in ('Packing', 'Handover', 'Return')),

  constraint operation_sessions_delivery_method_iff_handover
    check ((operation = 'Handover') = (delivery_method is not null)),

  constraint operation_sessions_pickup_person_method
    check (delivery_method in ('Customer Pickup', 'Third Party')
           or (pickup_person_name is null and pickup_person_phone is null)),

  constraint operation_sessions_vehicle_method
    check (delivery_method in ('Babin Delivery', 'Third Party')
           or (vehicle_plate is null and driver_name is null and driver_contact is null)),

  constraint operation_sessions_courier_method
    check (delivery_method = 'Courier'
           or (courier_name is null and courier_tracking_number is null)),

  constraint operation_sessions_address_not_on_customer_pickup
    check (delivery_method is distinct from 'Customer Pickup'
           or (delivery_address is null and estimated_arrival is null)),

  constraint operation_sessions_receiver_only_on_handover
    check (operation = 'Handover'
           or (receiver_name is null
               and receiver_phone is null
               and receiver_email is null
               and receiver_id_document_evidence_id is null
               and received_at is null)),

  constraint operation_sessions_returning_person_only_on_return
    check (operation = 'Return' or returning_person_name is null),

  constraint operation_sessions_completed_after_started
    check (completed_at is null or started_at is null or completed_at >= started_at)
);

comment on column operation_sessions.client_uuid is
  'Idempotency key. A resubmitted Complete Session may not open or close a second session.';
comment on column operation_sessions.booking_id is
  'BK-2026-0715 is a display identifier on bookings, never a foreign key. Sessions belong to the operation but are always scoped to one booking.';
comment on column operation_sessions.session_no is
  '1-based order within (booking_id, operation): the morning collection is 1, the evening collection is 2.';
comment on column operation_sessions.started_at is
  'AD/UTC. BS is never written to the database.';
comment on column operation_sessions.receiver_id_document_evidence_id is
  'A reference to the stored ID document, NEVER the government ID number. Visible to Owner, Manager and Billing only - never Warehouse.';
comment on column operation_sessions.government_id_verified is
  'Session gate 1, first half.';
comment on column operation_sessions.booking_authorization_verified is
  'Session gate 1, second half.';
comment on column operation_sessions.cancelled_at is
  'Cancel ends an open session without reversing movements already recorded.';
comment on column operation_sessions.courier_tracking_number is
  'Courier only. TODO(decision): Handover section 17 leaves open whether a tracking number is mandatory on Courier handovers.';
comment on column operation_sessions.cancel_reason is
  'TODO(decision): no minimum length is stated for a cancel reason, unlike the 10-character floor on overrides. Decide whether cancel carries the same floor.';

-- Only one session In Progress per (booking, operation); a second user opens
-- read-only. Packing is further limited to one session per booking entirely.
create unique index operation_sessions_one_in_progress
  on operation_sessions (booking_id, operation)
  where state = 'In Progress';

create unique index operation_sessions_one_packing_per_booking
  on operation_sessions (booking_id)
  where operation = 'Packing';

-- TRIGGER REQUIRED: state is forward-only, Not Started -> In Progress ->
--   Completed. A reversal requires a Manager override_records row written to
--   audit; there is no other path backwards.
-- TRIGGER REQUIRED: a Completed session is immutable - no further movements,
--   signatures or evidence references may attach, and no column may be updated.
-- TRIGGER REQUIRED: a Handover session may not close unless the six session
--   gates pass (receiver verified, every item scanned or Missing-with-reason,
--   payment verified, deposit received, required signatures, mandatory
--   evidence), or a Manager override_records row exists for gate 1, 3 or 4.
--   Gates 3 and 4 apply to every session, not only the first.
-- TRIGGER REQUIRED: a Return session may not close unless its six gates pass
--   (scanned and serial-verified, every returned line inspected with a
--   condition, accessories checked, evidence on every Damaged or Lost line,
--   damage charges approved or Absorb/Defer, required signatures).
-- TRIGGER REQUIRED: a Packing session may not close unless every required
--   packing_lines row is Packed, Missing-with-reason, or Replaced.
-- TRIGGER REQUIRED: 'Items Handed Over' / 'Items Returned' must never block a
--   close - they are booking conditions deciding the stage, not session gates.
-- TRIGGER REQUIRED: session close is one transaction - movements, inventory,
--   booking stage, signatures, evidence sealing, documents, timelines and
--   audit all land or none do.
-- TRIGGER REQUIRED: session open and close each write an audit_events row. No
--   DELETE by any role including Owner; a session that produced nothing is
--   completed empty.

alter table operation_sessions enable row level security;


-- ===========================================================================
-- session_line_movements
-- The append-only record of what physically moved in a session - one row per
-- serialised unit, or one row per quantity entry for non-serialised stock.
-- Every partial-quantity counter in Packing, Handover and Return sums from here.
-- ===========================================================================
create table session_line_movements (
  id                    uuid not null default gen_random_uuid() primary key,
  client_uuid           uuid not null unique,
  session_id            uuid not null references operation_sessions (id),
  booking_line_id       uuid not null references booking_lines (id),
  unit_id               uuid references assets (id),
  serial                text,
  qty                   int not null default 1,
  resulting_item_state  item_quantity_state,
  moved_at              timestamptz not null,
  scan_event_id         uuid, -- FK to scan_events added at the foot of this file (forward reference)
  device_id             text,
  reverses_movement_id  uuid references session_line_movements (id),
  created_at            timestamptz not null default now(),
  created_by            uuid not null references users (id),

  constraint session_line_movements_qty_positive check (qty > 0)
);

comment on column session_line_movements.client_uuid is
  'The offline queue replays with the same key, so a replayed scan cannot double-count.';
comment on column session_line_movements.session_id is
  'Direction - out at handover, in at return - is derived from this session''s operation and is never stored.';
comment on column session_line_movements.resulting_item_state is
  'NULL on Packing sessions: packing does not move the item out of the warehouse.';
comment on column session_line_movements.moved_at is
  'Device time of the physical move, UTC. Ordering derives from it and it is never hand-set.';
comment on column session_line_movements.created_at is
  'Server receipt time; differs from moved_at for queued offline scans.';
comment on column session_line_movements.reverses_movement_id is
  'A correction is a compensating row, never an UPDATE and never a DELETE.';
comment on column session_line_movements.created_by is
  'The acting user, not the assignee.';

-- TRIGGER REQUIRED: resulting_item_state must be NULL when the parent
--   session's operation = 'Packing', 'Picked Up' on Handover, and in
--   ('Returned','Missing','Damaged') on Return. The operation lives on the
--   parent row, so this cannot be a CHECK.
-- TRIGGER REQUIRED: a serialised unit may move at most once per direction per
--   booking - unique on (booking_line_id, unit_id) within one session
--   operation where unit_id is not null - so 'Already packed at 10:24' never
--   double-counts. The operation is on the parent session, so this cannot be
--   a unique index here.
-- TRIGGER REQUIRED: the sum of qty for a booking line in one direction may
--   never exceed the line's required quantity ('4 of 4 already packed').
-- TRIGGER REQUIRED: movements may only be written while the parent session
--   state = 'In Progress'.
-- TRIGGER REQUIRED: child accessories never appear as movements - they are
--   checklist ticks only - and non-serialised stock resolves no unit_id.
-- TRIGGER REQUIRED: no UPDATE and no DELETE. A mistake is a compensating row
--   referencing reverses_movement_id.

alter table session_line_movements enable row level security;


-- ===========================================================================
-- packing_lines
-- Per booking line state inside the packing workspace: six line states,
-- partial quantities, condition, shelf location, missing reason, replacement.
-- ===========================================================================
create table packing_lines (
  id                           uuid not null default gen_random_uuid() primary key,
  client_uuid                  uuid not null unique,
  session_id                   uuid not null references operation_sessions (id),
  booking_line_id              uuid not null references booking_lines (id),
  state                        packing_line_state not null default 'Pending',
  qty_required                 int not null,
  qty_packed_entered           int,
  is_required                  boolean not null default true,
  condition                    packing_condition,
  warehouse_location           text,
  packed_at                    timestamptz,
  packed_by                    uuid references users (id),
  missing_reason               text,
  blocker_note                 text,
  replacement_packing_line_id  uuid references packing_lines (id),
  not_required_set_at          timestamptz,
  created_at                   timestamptz not null default now(),
  created_by                   uuid not null references users (id),
  updated_at                   timestamptz not null default now(),

  constraint packing_lines_one_row_per_booking_line unique (booking_line_id),

  constraint packing_lines_missing_needs_reason
    check (state <> 'Missing' or char_length(missing_reason) >= 10),

  constraint packing_lines_replaced_needs_replacement
    check (state <> 'Replaced' or replacement_packing_line_id is not null)
);

comment on column packing_lines.qty_packed_entered is
  'Non-serialised lines only - the manually entered count. NULL for serialised lines, whose packed count is summed from session_line_movements.';
comment on column packing_lines.is_required is
  'Optional lines may finish Pending and are auto-set to Not Required at completion.';
comment on column packing_lines.blocker_note is
  'Why a Pending line cannot be packed. A note, never a status.';
comment on column packing_lines.condition is
  'Damaged prompts a swap and, if accepted, sets this line to Replaced.';

-- TRIGGER REQUIRED: state = 'Packed' only when the packed count equals
--   qty_required; 'Partial' only when 0 < packed count < qty_required. The
--   packed count is summed from session_line_movements for serialised lines.
-- TRIGGER REQUIRED: qty_packed_entered is NULL for serialised booking lines
--   and NOT NULL only where the booking line is non-serialised. The tracking
--   mode lives on the product, so this cannot be a CHECK here.
-- TRIGGER REQUIRED: completion does not re-reserve inventory - inventory is
--   reserved at Confirm and held in inventory_reservations.
-- TRIGGER REQUIRED: completion sets booking stage 4 Ready and the items remain
--   in the warehouse; the item quantity state is NOT set to 'Picked Up'.
-- TRIGGER REQUIRED: no DELETE. Cancel Packing discards nothing.

alter table packing_lines enable row level security;


-- ===========================================================================
-- handover_lines
-- Per booking line outbound state. Three states only, holding the invariant
-- Remaining + Picked Up + Missing = Total across chips, donut and footer.
-- ===========================================================================
create table handover_lines (
  id                    uuid not null default gen_random_uuid() primary key,
  client_uuid           uuid not null unique,
  booking_line_id       uuid not null references booking_lines (id),
  state                 handover_line_state not null default 'Remaining',
  qty_required          int not null,
  missing_reason        text,
  first_session_id      uuid references operation_sessions (id),
  completed_session_id  uuid references operation_sessions (id),
  picked_up_at          timestamptz,
  created_at            timestamptz not null default now(),
  created_by            uuid not null references users (id),
  updated_at            timestamptz not null default now(),

  constraint handover_lines_one_row_per_booking_line unique (booking_line_id),

  constraint handover_lines_missing_needs_reason
    check (state <> 'Missing' or char_length(missing_reason) >= 10)
);

comment on column handover_lines.state is
  'Picked Up is reachable only at full quantity.';
comment on column handover_lines.completed_session_id is
  'Session that took the last unit - the stamp shown in the Session column.';
comment on column handover_lines.missing_reason is
  'The 10-character floor stated for overrides and packing is applied here.';

-- TRIGGER REQUIRED: state = 'Picked Up' only when the summed out-movement
--   quantity equals qty_required.
-- TRIGGER REQUIRED: a line may not be handed over unless its packing_lines row
--   is Packed or Replaced.
-- TRIGGER REQUIRED: the booking reaches Stage 6 On Rent only when every line
--   is Picked Up or Missing-with-reason; otherwise Stage 5 Dispatched with a
--   Partial Pickup flag. This condition must never block a session close.
-- TRIGGER REQUIRED: no DELETE - a cancelled handover leaves handed-over lines
--   handed over.

alter table handover_lines enable row level security;


-- ===========================================================================
-- return_lines
-- Per booking line inbound state plus the inspection result. Inspection is the
-- second half of the return workspace, not a separate screen: three line
-- states, a separate inspection state, a single-select condition, and the
-- decision for anything never returned.
-- ===========================================================================
create table return_lines (
  id                     uuid not null default gen_random_uuid() primary key,
  client_uuid            uuid not null unique,
  booking_line_id        uuid not null references booking_lines (id),
  state                  return_line_state not null default 'Outstanding',
  qty_expected           int not null,
  session_id             uuid references operation_sessions (id),
  returned_at            timestamptz,
  inspection_state       inspection_state not null default 'Pending',
  condition              item_condition,
  inspector_note         text,
  inspected_by           uuid references users (id),
  inspected_at           timestamptz,
  returned_by_name       text,
  not_returned_reason    text,
  not_returned_decision  not_returned_decision,
  created_at             timestamptz not null default now(),
  created_by             uuid not null references users (id),
  updated_at             timestamptz not null default now(),

  constraint return_lines_one_row_per_booking_line unique (booking_line_id),

  constraint return_lines_not_returned_needs_reason_and_decision
    check (state <> 'Not Returned'
           or (not_returned_reason is not null and not_returned_decision is not null)),

  constraint return_lines_inspected_needs_condition_and_actor
    check (inspection_state <> 'Inspected'
           or (condition is not null and inspected_by is not null and inspected_at is not null))
);

comment on column return_lines.condition is
  'Single-select radio group - exactly one value per item, never a multi-select. The build that shipped Excellent and Damaged both active is the defect this column type prevents. Routing follows from it.';
comment on column return_lines.inspection_state is
  'Tracked separately from the line state, per returned line.';
comment on column return_lines.session_id is
  'The session that received the line - the last one, where receipt is split across loads.';

-- TRIGGER REQUIRED: a Damaged or Lost line must carry at least one
--   evidence_references row with operation_stage in ('Return','Inspection',
--   'Damage') before any charge is raised.
-- TRIGGER REQUIRED: session close requires every returned line inspected with
--   a condition set, and accessories checked on every inspected item.
-- TRIGGER REQUIRED: any unresolved Not Returned blocks Stage 10 Completed; any
--   unsettled Damaged blocks Stage 11 Closed.
-- TRIGGER REQUIRED: no DELETE.

alter table return_lines enable row level security;


-- ===========================================================================
-- return_accessory_checks
-- Per-accessory Present/Missing checklist inside the inspection panel. A
-- missing accessory is not a missing item - it is counted and charged
-- separately, against its own replacement cost.
-- ===========================================================================
create table return_accessory_checks (
  id                uuid not null default gen_random_uuid() primary key,
  client_uuid       uuid not null unique,
  return_line_id    uuid not null references return_lines (id),
  accessory_id      uuid references items (id),
  accessory_name    text not null,
  present           boolean not null,
  replacement_cost  numeric(14,2),
  created_at        timestamptz not null default now(),
  created_by        uuid not null references users (id),

  constraint return_accessory_checks_one_per_accessory
    unique (return_line_id, accessory_name)
);

comment on column return_accessory_checks.accessory_id is
  'Child accessory in the item master; NULL where the accessory is only named.';
comment on column return_accessory_checks.replacement_cost is
  'The accessory''s own replacement cost, not the item''s. Writable by Owner, Manager or Billing only and hidden from Warehouse entirely - Warehouse records Present/Missing. TODO(decision): Return section 16 leaves open whether this is copied from the item master or entered per case.';
comment on column return_accessory_checks.present is
  'A missing accessory never increments the missing-items counter: the two counters are separate populations computed from different tables.';

-- TRIGGER REQUIRED: accessories must be checked on every inspected item before
--   session close (Return gate 3).
-- TRIGGER REQUIRED (RLS): replacement_cost may only be written by Owner,
--   Manager or Billing. Enforced by column grant and policy, not by the form.

alter table return_accessory_checks enable row level security;


-- ===========================================================================
-- damage_findings
-- A recorded damage observation - at return inspection or later at cleaning -
-- with evidence, severity, an approval gate and a disposition. Warehouse
-- records the finding; a Manager approves the amount. This table records
-- findings; the Financial Engine computes every amount.
-- ===========================================================================
create table damage_findings (
  id                       uuid not null default gen_random_uuid() primary key,
  client_uuid              uuid not null unique,
  source                   damage_source not null,
  return_line_id           uuid references return_lines (id),
  cleaning_queue_entry_id  uuid, -- FK to cleaning_queue_entries added at the foot of this file (forward reference)
  unit_id                  uuid not null references assets (id),
  damage_type              text not null,
  description              text not null,
  severity                 text not null,
  estimated_cost           numeric(14,2),
  approval_state           damage_approval_state not null default 'Pending Approval',
  approved_by              uuid references users (id),
  approved_at              timestamptz,
  disposition              damage_disposition,
  case_id                  uuid references cases (id),
  charge_id                uuid references charges (id),
  voided_at                timestamptz,
  created_at               timestamptz not null default now(),
  created_by               uuid not null references users (id),
  updated_at               timestamptz not null default now(),

  constraint damage_findings_exactly_one_parent
    check (num_nonnulls(return_line_id, cleaning_queue_entry_id) = 1),

  constraint damage_findings_parent_matches_source
    check ((source = 'Return inspection' and return_line_id is not null)
           or (source = 'Cleaning' and cleaning_queue_entry_id is not null)),

  constraint damage_findings_approved_needs_approver
    check (approval_state <> 'Approved'
           or (approved_by is not null and approved_at is not null))
);

comment on column damage_findings.source is
  'Damage found at cleaning is after the client signed off and raises a Manager case instead of a direct charge decision.';
comment on column damage_findings.severity is
  'TODO(decision): no spec states the severity scale values, so this stays text until Babin sets them. It becomes an enum the moment the scale is decided.';
comment on column damage_findings.estimated_cost is
  'NULL until a Manager or Billing user enters it at approval. Warehouse has no cost field at all.';
comment on column damage_findings.approval_state is
  'Pending charges do not enter Total Deductions.';
comment on column damage_findings.disposition is
  'Per item. Absorb and Defer to Insurance satisfy the session gate without a charge.';
comment on column damage_findings.charge_id is
  'The charge posted to the Financial Engine. This workspace never calculates.';
comment on column damage_findings.voided_at is
  'Terminal state. A finding is never deleted.';

-- TRIGGER REQUIRED: at least one evidence_references row must exist before
--   charge_id may be set - a charge raised without evidence is a charge that
--   cannot be defended.
-- TRIGGER REQUIRED: rows with approval_state = 'Pending Approval' are excluded
--   from Total Deductions.
-- TRIGGER REQUIRED (RLS): estimated_cost may only be set by Owner, Manager or
--   Billing, never Warehouse; approved_by must hold Owner or Manager.
-- TRIGGER REQUIRED: return session close requires every damage finding
--   approved, or marked Absorb / Defer to Insurance.
-- TRIGGER REQUIRED: no DELETE - void only.

alter table damage_findings enable row level security;


-- ===========================================================================
-- signatures
-- A signature captured at the close of a session. Belongs to the session,
-- never to the booking - a later session is never covered by an earlier
-- session's signature.
-- ===========================================================================
create table signatures (
  id                          uuid not null default gen_random_uuid() primary key,
  client_uuid                 uuid not null unique,
  session_id                  uuid not null references operation_sessions (id),
  signature_role              signature_role not null,
  signer_name                 text not null,
  signed_at                   timestamptz not null,
  device                      text not null,
  signature_evidence_file_id  uuid, -- FK to evidence_files added at the foot of this file (forward reference)
  is_required                 boolean not null,
  sealed_at                   timestamptz,
  created_at                  timestamptz not null default now(),
  created_by                  uuid not null references users (id),

  constraint signatures_witness_is_never_required
    check (signature_role <> 'Witness' or is_required = false)
);

comment on column signatures.session_id is
  'NOT NULL, and there is no booking_id column on this table: a signature with no session is the defect this whole rule exists to prevent.';
comment on column signatures.is_required is
  'Computed from the delivery method at capture time and then frozen. Witness is always false and renders as Optional, never as pending.';
comment on column signatures.sealed_at is
  'Set at session close; after this the row is immutable.';
comment on column signatures.signed_at is
  'UTC. Captured at the close of the session, never before.';

create unique index signatures_one_per_role_per_session
  on signatures (session_id, signature_role)
  where signature_role <> 'Witness';

-- TRIGGER REQUIRED: signed_at >= the parent session's completed_at -
--   signatures are captured at close, never before. The build that signed
--   three at 10:16 with eleven items still out is what this forbids.
-- TRIGGER REQUIRED: signature_role = 'Driver' only where the session's
--   delivery_method in ('Babin Delivery','Courier','Third Party');
--   'Returning person' only on Return sessions; 'Receiver' only on Handover
--   sessions. The delivery method lives on the parent row.
-- TRIGGER REQUIRED: a Handover session cannot close without Receiver and
--   Warehouse staff signatures; a Return session cannot close without
--   Returning person and Warehouse staff.
-- TRIGGER REQUIRED: immutable once sealed_at is set - no UPDATE, no DELETE.
-- TODO(decision): the correction path for a wrong signature is undefined in
--   every spec read. Until it is decided, there is no reverse or supersede
--   column here and none may be invented.

alter table signatures enable row level security;


-- ===========================================================================
-- scan_events
-- Append-only log of every scan, in every context, online or offline. The
-- single input record of the warehouse: unit, context, job, user, device,
-- time, result.
-- ===========================================================================
create table scan_events (
  id                      uuid not null default gen_random_uuid() primary key,
  client_uuid             uuid not null unique,
  context                 scan_context not null,
  session_id              uuid references operation_sessions (id),
  booking_id              uuid references bookings (id),
  code                    text not null,
  code_type               scan_code_type not null,
  resolved_unit_id        uuid references assets (id),
  result                  scan_result not null,
  result_reason           text,
  conflicting_booking_id  uuid references bookings (id),
  scanned_at              timestamptz not null,
  synced_at               timestamptz,
  queued_offline          boolean not null default false,
  device_id               text not null,
  override_record_id      uuid, -- FK to override_records added at the foot of this file (forward reference)
  created_at              timestamptz not null default now(),
  created_by              uuid not null references users (id),

  constraint scan_events_job_context_names_a_job
    check (context in ('lookup', 'stock_check') or booking_id is not null),

  constraint scan_events_lookup_carries_no_job
    check (context not in ('lookup', 'stock_check')
           or (session_id is null and booking_id is null)),

  -- Reset and Cleaning are queues, not sessions, so a reset scan resolves no
  -- session_id even though it names a job.
  constraint scan_events_session_only_where_a_session_exists
    check (context in ('packing', 'handover', 'return') or session_id is null)
);

comment on column scan_events.client_uuid is
  'Generated on the device before the scan leaves it, so the offline replay is idempotent. A replayed scan is rejected, never re-applied.';
comment on column scan_events.context is
  'Context changes the consequence, never the interaction.';
comment on column scan_events.resolved_unit_id is
  'NULL when the code is not a Babin unit and falls through to lookup.';
comment on column scan_events.conflicting_booking_id is
  'Named on a wrong-job scan - the single most expensive floor mistake.';
comment on column scan_events.scanned_at is
  'Device clock time of the read, UTC. Replay is in scanned_at order.';
comment on column scan_events.synced_at is
  'NULL while queued offline.';
comment on column scan_events.override_record_id is
  'Set when a Manager overrides a Blocked scan with a reason. Warehouse can never override.';

-- TRIGGER REQUIRED: append-only. No UPDATE and no DELETE, by any role
--   including Owner.
-- TRIGGER REQUIRED: a scan may never write money and may never change booking
--   stage on its own. It advances a job; the job's own gate changes status.
-- TRIGGER REQUIRED: child accessories and non-serialised stock never resolve
--   to a scannable unit.
-- TRIGGER REQUIRED: result = 'Duplicate' must not produce a
--   session_line_movements row - no double count.
-- TRIGGER REQUIRED: not scanning something records nothing - absence is never
--   converted into a state.
-- TRIGGER REQUIRED: every scan writes an audit_events row carrying unit,
--   context, job, user, device, time and result.

alter table scan_events enable row level security;


-- ===========================================================================
-- scan_sync_conflicts
-- A queued offline scan that collided on ordered replay - surfaced to a human
-- on the affected job, never silently overwritten and never resolved by
-- last-write-wins.
-- ===========================================================================
create table scan_sync_conflicts (
  id                        uuid not null default gen_random_uuid() primary key,
  client_uuid               uuid not null unique,
  scan_event_id             uuid not null references scan_events (id),
  conflicting_scan_event_id uuid references scan_events (id),
  session_id                uuid not null references operation_sessions (id),
  detected_at               timestamptz not null,
  resolved_by               uuid references users (id),
  resolved_at               timestamptz,
  resolution_note           text,
  created_at                timestamptz not null default now(),

  constraint scan_sync_conflicts_one_card_per_losing_scan unique (scan_event_id),

  constraint scan_sync_conflicts_resolution_names_a_human
    check ((resolved_at is null) = (resolved_by is null))
);

comment on column scan_sync_conflicts.resolved_at is
  'NULL means open. There is no state column because no spec names its values. TODO(decision): decide whether resolution needs a structured outcome enum; resolution_note is free text until then.';
comment on column scan_sync_conflicts.detected_at is
  'When the server detected the collision during ordered replay.';

-- TRIGGER REQUIRED: a conflict is never silently discarded and last-write-wins
--   is never used.
-- TRIGGER REQUIRED: a session may not close while it carries a conflict with
--   resolved_at IS NULL. Derived - the specs require human resolution but do
--   not name it as a gate.
-- TRIGGER REQUIRED: no DELETE.

alter table scan_sync_conflicts enable row level security;


-- ===========================================================================
-- evidence_files
-- The physical media record. Stored once, hashed, de-duplicated, never
-- modified, never hard-deleted, and locked when the booking closes.
-- ===========================================================================
create table evidence_files (
  id                    uuid not null default gen_random_uuid() primary key,
  client_uuid           uuid not null unique,
  content_hash          text not null unique,
  storage_path          text not null,
  original_filename     text not null,
  media_type            evidence_media_type not null,
  format                text not null,
  size_bytes            bigint not null,
  duration_seconds      int,
  captured_at           timestamptz,
  device                text,
  gps_lat               numeric(9,6),
  gps_lng               numeric(9,6),
  processing_step       evidence_processing_step not null default 'Upload',
  match_state           evidence_match_state not null default 'Unmatched',
  match_source          evidence_match_source,
  confidence            numeric(5,2),
  matched_item_id       uuid references items (id),
  matched_serial        text,
  unmatched_reason      text,
  category              evidence_category not null,
  derivative_of_file_id uuid references evidence_files (id),
  derivative_kind       text,
  removed_at            timestamptz,
  removed_by            uuid references users (id),
  removal_reason        text,
  locked_at             timestamptz,
  retention_until       date,
  created_at            timestamptz not null default now(),
  created_by            uuid not null references users (id),
  updated_at            timestamptz not null default now(),

  constraint evidence_files_unmatched_resolves_nothing
    check (match_state <> 'Unmatched'
           or (matched_item_id is null and matched_serial is null)),

  constraint evidence_files_confidence_is_a_percentage
    check (confidence is null or (confidence >= 0 and confidence <= 100)),

  -- The band mapping, for AI recognition only. QR code, barcode and exact
  -- serial OCR auto-accept as Matched regardless of any score.
  constraint evidence_files_ai_confidence_bands
    check (match_source is distinct from 'AI recognition'
           or confidence is null
           or (confidence >= 95 and match_state = 'Matched')
           or (confidence >= 70 and confidence < 95 and match_state = 'Need Review')
           or (confidence < 70 and match_state = 'Unmatched')),

  constraint evidence_files_removal_needs_a_reason
    check (removed_at is null or removal_reason is not null),

  constraint evidence_files_duration_is_video_only
    check (duration_seconds is null or media_type = 'Video')
);

comment on column evidence_files.content_hash is
  'A duplicate upload creates a new evidence_references row, not a new file.';
comment on column evidence_files.media_type is
  'ZIP is expanded on upload and never stored as an archive.';
comment on column evidence_files.match_state is
  'Matched + Need Review + Unmatched = Total; percentages are derived, never stored.';
comment on column evidence_files.match_source is
  'First source to resolve wins; QR and barcode auto-accept regardless of AI score.';
comment on column evidence_files.confidence is
  'AI score only; not shown for deterministic reads. The thresholds live in Settings > Evidence and are never hardcoded in application code.';
comment on column evidence_files.processing_step is
  'Queued offline files show as Pending Upload, never as Unmatched.';
comment on column evidence_files.gps_lat is
  'NULL unless GPS is enabled per organisation in Settings. GPS is off by default.';
comment on column evidence_files.gps_lng is
  'NULL unless GPS is enabled per organisation in Settings. GPS is off by default.';
comment on column evidence_files.derivative_of_file_id is
  'Rotate, crop and compress produce a derivative; the original is retained untouched.';
comment on column evidence_files.removed_at is
  'Soft delete only. Removed files move to the Archived filter and stay readable to Owner and Manager.';
comment on column evidence_files.locked_at is
  'Set when the booking reaches Stage 11 Closed. After this: no additions, no removals, no reassignment.';
comment on column evidence_files.size_bytes is
  'TODO(decision): caps of 50 MB for images and 500 MB for video are proposed and unconfirmed. No CHECK is emitted until the caps are set.';
comment on column evidence_files.duration_seconds is
  'Video only. TODO(decision): the 3-minute cap is proposed and unconfirmed.';
comment on column evidence_files.retention_until is
  'TODO(decision): 7 years from booking close is proposed and unconfirmed, with Marketing exempt and retained indefinitely.';

-- TRIGGER REQUIRED: no hard delete. Remove requires removal_reason and is
--   audited.
-- TRIGGER REQUIRED: no row may be inserted, removed or reassigned once
--   locked_at is set.
-- TRIGGER REQUIRED: category = 'Marketing' requires the client record to carry
--   a marketing-consent flag.
-- TRIGGER REQUIRED: the per-booking cap of 500 files is enforced before the
--   upload begins, not after.
-- TRIGGER REQUIRED: every upload, match, reassignment, removal and export
--   writes an audit_events row naming who exported, when, and which files.

alter table evidence_files enable row level security;


-- ===========================================================================
-- evidence_references
-- The join that makes one stored file appear everywhere it is relevant -
-- booking, item, serial, bundle, stage, session, inspection, damage,
-- maintenance, client, case - without copying it.
-- ===========================================================================
create table evidence_references (
  id                       uuid not null default gen_random_uuid() primary key,
  client_uuid              uuid not null unique,
  evidence_file_id         uuid not null references evidence_files (id),
  operation_stage          evidence_operation_stage not null,
  session_id               uuid references operation_sessions (id),
  booking_id               uuid references bookings (id),
  item_id                  uuid references items (id),
  bundle_id                uuid references bundles (id),
  serial                   text,
  packing_line_id          uuid references packing_lines (id),
  return_line_id           uuid references return_lines (id),
  damage_finding_id        uuid references damage_findings (id),
  cleaning_queue_entry_id  uuid, -- FK to cleaning_queue_entries added at the foot of this file (forward reference)
  maintenance_id           uuid references maintenance_records (id),
  client_id                uuid references clients (id),
  case_id                  uuid references cases (id),
  removed_at               timestamptz,
  removal_reason           text,
  created_at               timestamptz not null default now(),
  created_by               uuid not null references users (id),

  constraint evidence_references_needs_a_target
    check (num_nonnulls(session_id, booking_id, item_id, bundle_id, serial,
                        packing_line_id, return_line_id, damage_finding_id,
                        cleaning_queue_entry_id, maintenance_id, client_id,
                        case_id) >= 1),

  constraint evidence_references_operational_stage_needs_a_session
    check (operation_stage not in ('Packing', 'Pickup', 'Delivery', 'Return', 'Inspection')
           or session_id is not null),

  constraint evidence_references_detach_needs_a_reason
    check (removed_at is null or removal_reason is not null),

  -- NULLS NOT DISTINCT: without it the null-heavy target tuple would let the
  -- same file be attached to the same target over and over.
  constraint evidence_references_no_duplicate_target
    unique nulls not distinct (evidence_file_id, operation_stage, session_id,
                               packing_line_id, return_line_id, damage_finding_id,
                               cleaning_queue_entry_id, maintenance_id, case_id,
                               client_id)
);

comment on column evidence_references.session_id is
  'Evidence produced by an operation attaches to the session that captured it, never to the booking alone.';
comment on column evidence_references.booking_id is
  'Scoping and search key only; never the sole anchor for operational evidence.';
comment on column evidence_references.serial is
  'The SN- key the compare view pairs on across stages.';
comment on column evidence_references.operation_stage is
  'References with operation_stage = ''Client documents'' are hidden from Warehouse entirely.';

-- TRIGGER REQUIRED: no reference may be added, removed or reassigned once the
--   file's locked_at is set.
-- TRIGGER REQUIRED: a return_lines row with condition in ('Damaged','Lost')
--   must carry at least one reference with operation_stage in
--   ('Return','Inspection','Damage') before a charge is raised.
-- TRIGGER REQUIRED: a cleaning_queue_entries row with problem_state =
--   'Damaged' requires a reference.
-- TRIGGER REQUIRED: references belonging to a Completed session are sealed and
--   immutable.
-- TRIGGER REQUIRED: no DELETE - soft detach only.

alter table evidence_references enable row level security;


-- ===========================================================================
-- cleaning_queue_entries
-- One item in the cleaning/reset queue, across all bookings or filtered to
-- one. Reset and Cleaning are two modes of this one workspace, which is why
-- neither has a session.
-- ===========================================================================
create table cleaning_queue_entries (
  id                  uuid not null default gen_random_uuid() primary key,
  client_uuid         uuid not null unique,
  unit_id             uuid not null references assets (id),
  booking_id          uuid references bookings (id),
  return_line_id      uuid references return_lines (id),
  state               cleaning_queue_state not null default 'Waiting',
  requires_clean      boolean not null default true,
  requires_reset      boolean not null default false,
  clean_completed_at  timestamptz,
  reset_completed_at  timestamptz,
  entered_queue_at    timestamptz not null default now(),
  first_task_at       timestamptz,
  completed_at        timestamptz,
  assigned_to         uuid references users (id),
  cleaned_by          uuid references users (id),
  qc_by               uuid references users (id),
  qc_at               timestamptz,
  qc_skipped          boolean not null default false,
  qc_skip_reason      text,
  qc_fail_reason      text,
  problem_state       cleaning_problem_state not null default 'No Problems',
  checklist_version   int,
  created_at          timestamptz not null default now(),
  created_by          uuid not null references users (id),
  updated_at          timestamptz not null default now(),

  -- A self-approved check is not a check.
  constraint cleaning_queue_entries_qc_is_a_second_pair_of_eyes
    check ((qc_skipped = true and qc_skip_reason is not null)
           or (qc_skipped = false
               and (qc_by is null or cleaned_by is null or qc_by <> cleaned_by))),

  constraint cleaning_queue_entries_clean_only_when_required
    check (requires_clean = true or clean_completed_at is null),

  constraint cleaning_queue_entries_reset_only_when_required
    check (requires_reset = true or reset_completed_at is null)
);

comment on column cleaning_queue_entries.unit_id is
  'The queue is per item, not per booking.';
comment on column cleaning_queue_entries.state is
  'The four states are mutually exclusive and sum to the queue total.';
comment on column cleaning_queue_entries.requires_reset is
  'An item needing only cleaning is done after cleaning; a camera needs both modes.';
comment on column cleaning_queue_entries.assigned_to is
  'Who the work is assigned to - distinct from cleaned_by, the actor who ticks the boxes. When they differ, both are recorded.';
comment on column cleaning_queue_entries.qc_skipped is
  'Only when the cleaner is the only staff on shift.';
comment on column cleaning_queue_entries.qc_skip_reason is
  'Mandatory when qc_skipped, and written to audit. TODO(decision): no minimum length is stated, unlike the 10-character floor on overrides.';
comment on column cleaning_queue_entries.problem_state is
  'Set per item, never per batch. A problem removes the item from the batch and routes it.';
comment on column cleaning_queue_entries.checklist_version is
  'Which checklist version applied at completion - part of the audit record.';

-- TRIGGER REQUIRED: state may reach 'Ready' only when every required task in
--   the item's category checklist is ticked for each required mode,
--   problem_state = 'No Problems', and any required evidence is captured.
-- TRIGGER REQUIRED: a problem_state other than 'No Problems' removes the item
--   from the batch and routes it (Missing Item -> warehouse investigation,
--   Needs Repair -> Maintenance, Damaged -> Manager review) without blocking
--   the other items in the batch.
-- TRIGGER REQUIRED: problem_state = 'Damaged' requires an evidence_references
--   row and raises a damage_findings row with source = 'Cleaning' plus a case
--   for Manager review.
-- TRIGGER REQUIRED: stage 9 completes only when both required modes are done
--   for every item that requires them.
-- TRIGGER REQUIRED: no DELETE - entries leave the queue by reaching Ready or
--   by routing out.

alter table cleaning_queue_entries enable row level security;


-- ===========================================================================
-- cleaning_task_results
-- One row per item per ticked checklist task, carrying the acting user - never
-- one row for a batch. 'All 24 cleaned by Ramesh' is not an audit trail if
-- three people worked the shift.
-- ===========================================================================
create table cleaning_task_results (
  id                       uuid not null default gen_random_uuid() primary key,
  client_uuid              uuid not null unique,
  cleaning_queue_entry_id  uuid not null references cleaning_queue_entries (id),
  checklist_task_id        uuid not null, -- FK to category_checklist_tasks added at the foot of this file (forward reference)
  checklist_version        int not null,
  mode                     cleaning_mode not null,
  completed                boolean not null default true,
  completed_at             timestamptz not null default now(),
  batch_ref                uuid,
  created_at               timestamptz not null default now(),
  created_by               uuid not null references users (id),

  constraint cleaning_task_results_one_per_task_version
    unique (cleaning_queue_entry_id, checklist_task_id, checklist_version)
);

comment on column cleaning_task_results.client_uuid is
  'A shared tick across a batch generates one key per item row.';
comment on column cleaning_task_results.checklist_version is
  'Frozen at tick time so the audit can state which version applied.';
comment on column cleaning_task_results.batch_ref is
  'Groups rows written by one batch tick so a shared tick is traceable. A batch is an ephemeral selection, not an entity - this is a grouping token, not a foreign key.';
comment on column cleaning_task_results.created_by is
  'The actor who ticked it, not the assignee. NOT NULL - this is the whole point of the rule.';

-- TRIGGER REQUIRED: a batch tick writes one row per selected item carrying
--   that item's acting user - never one row for the batch.
-- TRIGGER REQUIRED: a task may only be ticked for an item whose category owns
--   it. No cross-category tasks: a lens is never asked to Charge Batteries.
-- TRIGGER REQUIRED: mode must match the referenced task's mode.

alter table cleaning_task_results enable row level security;


-- ===========================================================================
-- category_checklist_tasks
-- The versioned category cleaning/reset checklist defined in Settings >
-- Inventory. The category checklist is the checklist; a task shared by several
-- categories is simply a row in each list that owns it.
-- ===========================================================================
create table category_checklist_tasks (
  id              uuid not null default gen_random_uuid() primary key,
  client_uuid     uuid not null unique,
  category_id     uuid not null references categories (id),
  mode            cleaning_mode not null,
  label           text not null,
  is_required     boolean not null default true,
  sort_order      int not null default 0,
  version         int not null default 1,
  effective_from  timestamptz not null default now(),
  retired_at      timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid not null references users (id),
  updated_at      timestamptz not null default now(),

  constraint category_checklist_tasks_unique_per_version
    unique (category_id, mode, label, version)
);

comment on column category_checklist_tasks.is_required is
  'Only required tasks gate item completion.';
comment on column category_checklist_tasks.version is
  'Incremented on change so completed work records the version that applied.';
comment on column category_checklist_tasks.retired_at is
  'Retire, never delete - historical cleaning_task_results rows must still resolve their task.';

-- TRIGGER REQUIRED: there is no separate 'common checklist' overriding
--   category logic. A shared task is a row in each category that owns it.
-- TRIGGER REQUIRED: a retired task remains resolvable by historical
--   cleaning_task_results rows.
-- TRIGGER REQUIRED: no DELETE.

alter table category_checklist_tasks enable row level security;


-- ===========================================================================
-- override_records
-- The one place an authorised person breaks a rule: handover gate overrides,
-- blocked-scan overrides, crew double-booking overrides, QC skips and stage
-- reversals. Always a named approver plus a reason, always audited.
-- ===========================================================================
create table override_records (
  id                uuid not null default gen_random_uuid() primary key,
  client_uuid       uuid not null unique,
  override_type     override_type not null,
  subject_type      text not null,
  subject_id        uuid not null,
  gate_number       int,
  reason            text not null,
  approver_user_id  uuid not null references users (id),
  approver_role     text not null,
  audit_event_id    uuid not null references audit_events (id),
  created_at        timestamptz not null default now(),
  created_by        uuid not null references users (id),

  -- A database constraint with no role bypass, including Owner.
  constraint override_records_reason_min_10_chars
    check (char_length(reason) >= 10),

  constraint override_records_only_gates_1_3_4_are_overridable
    check (override_type <> 'Gate override' or gate_number in (1, 3, 4)),

  constraint override_records_gate_number_belongs_to_gate_overrides
    check (override_type = 'Gate override' or gate_number is null),

  constraint override_records_approver_is_owner_or_manager
    check (approver_role in ('Owner', 'Manager')),

  constraint override_records_subject_is_a_known_table
    check (subject_type in ('operation_sessions', 'scan_events', 'crew_bookings',
                            'bookings', 'cleaning_queue_entries'))
);

comment on column override_records.subject_id is
  'The overridden row. Polymorphic by subject_type, so there is no single FK.';
comment on column override_records.gate_number is
  'Handover session gates 1, 3 and 4 only. Gates 2, 5 and 6 are not overridable by anyone.';
comment on column override_records.approver_role is
  'Frozen at approval time. Warehouse can never override.';
comment on column override_records.created_by is
  'The user who requested the override, who may differ from the approver.';

-- TRIGGER REQUIRED (RLS): insert restricted to Owner and Manager within their
--   approval-limit scope by role, branch and warehouse/storage zone. An
--   approver outside scope is rejected.
-- TRIGGER REQUIRED: append-only. An override is never edited and never
--   deleted.

alter table override_records enable row level security;


-- ===========================================================================
-- crew_members
-- A crew person: engagement type, tax status, standard rate, contact - and
-- deliberately no stored rating. Performance is expressed as observable facts
-- derived from bookings and shoot days.
-- ===========================================================================
create table crew_members (
  id               uuid not null default gen_random_uuid() primary key,
  client_uuid      uuid not null unique,
  full_name        text not null,
  position         text not null,
  phone            text,
  engagement_type  crew_engagement_type not null,
  pan_status       crew_pan_status not null,
  withholding_rate numeric(5,2),
  day_rate         numeric(14,2),
  internal_note    text,
  deactivated_at   timestamptz,
  created_by       uuid not null references users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint crew_members_withholding_rate_is_a_percentage
    check (withholding_rate is null
           or (withholding_rate >= 0 and withholding_rate <= 100))
);

comment on column crew_members.position is
  'Free text, not an enum: the rate table lists roles but never closes the set.';
comment on column crew_members.withholding_rate is
  'NULL means Not configured and must never be coerced to 0 - a zero deduction is a number someone will trust. No DEFAULT is permitted on this column.';
comment on column crew_members.day_rate is
  'Standard cost rate, the default copied onto a new booking line. What the client is billed is a Financial Engine figure and is never stored.';
comment on column crew_members.internal_note is
  'The private judgement field kept in place of a public score. Denied to Warehouse and Viewer.';
comment on column crew_members.deactivated_at is
  'Terminal state. A crew record is never deleted.';

-- NO numeric rating column may exist on this table. Jobs completed,
--   repeat-request rate, no-shows and late arrivals are derived from
--   crew_bookings and crew_shoot_days.
-- NO stored person-state column. Available / Booked / On Leave / Off Duty are
--   computed from bookings and leave.
-- TRIGGER REQUIRED: deactivation is the only terminal action - DELETE is
--   refused.

alter table crew_members enable row level security;


-- ===========================================================================
-- crew_bookings
-- A crew member engaged on a production for a period at a day rate, with a
-- payout state structurally distinct from the client's rental payment status.
-- ===========================================================================
create table crew_bookings (
  id                             uuid not null default gen_random_uuid() primary key,
  client_uuid                    uuid not null unique,
  crew_booking_no                text not null unique,
  production_id                  uuid references productions (id),
  booking_id                     uuid references bookings (id),
  crew_member_id                 uuid references crew_members (id),
  position                       text not null,
  day_rate                       numeric(14,2) not null,
  days                           int not null default 1,
  start_date                     date not null,
  end_date                       date not null,
  location                       text,
  state                          crew_booking_state not null default 'Draft',
  payout_state                   crew_payout_state not null default 'Not due',
  conflict_override_by           uuid references users (id),
  conflict_override_reason       text,
  conflict_override_at           timestamptz,
  travel_warning_acknowledged_by uuid references users (id),
  travel_warning_acknowledged_at timestamptz,
  cancelled_at                   timestamptz,
  cancel_reason                  text,
  created_by                     uuid not null references users (id),
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),

  constraint crew_bookings_number_format
    check (crew_booking_no ~ '^CB-[0-9]{4}-[0-9]{4}$'),

  constraint crew_bookings_days_at_least_one check (days >= 1),

  constraint crew_bookings_end_after_start check (end_date >= start_date),

  constraint crew_bookings_confirmed_names_a_person
    check (state not in ('Confirmed', 'Completed') or crew_member_id is not null),

  constraint crew_bookings_override_reason_min_10_chars
    check (conflict_override_by is null
           or (char_length(conflict_override_reason) >= 10
               and conflict_override_at is not null)),

  constraint crew_bookings_cancel_needs_reason
    check (state <> 'Cancelled'
           or (cancel_reason is not null and cancelled_at is not null)),

  -- A hard block at booking time, not an after-the-fact alert. Released only
  -- by a valid conflict_override_by + conflict_override_reason.
  constraint crew_bookings_no_double_booking
    exclude using gist (
      crew_member_id with =,
      daterange(start_date, end_date, '[]') with &&
    ) where (state = 'Confirmed' and conflict_override_by is null)
);

comment on column crew_bookings.crew_booking_no is
  'CB-2026-0001: prefix, four-digit AD year, four-digit sequence restarting yearly. Never the retired CB-250530-001 form.';
comment on column crew_bookings.production_id is
  'TODO(decision): nullable only until the placement lock is settled. Under the option where crew lives inside a Production this becomes NOT NULL and is the mandatory parent.';
comment on column crew_bookings.booking_id is
  'uuid FK, not the human BK-2026-0715 string.';
comment on column crew_bookings.crew_member_id is
  'Nullable so a Draft can exist before a person is chosen; required from Confirmed onward by CHECK. An unassigned Confirmed booking is a Critical alert, which only makes sense if the state is reachable.';
comment on column crew_bookings.day_rate is
  'Cost side of the line, frozen at booking. Never a live read of crew_members.day_rate.';
comment on column crew_bookings.days is
  'Mandatory on every priced line. A single-day line stores 1 explicitly, never by omission, and it is never inferred from the date range.';
comment on column crew_bookings.payout_state is
  'The money-out state for this engagement. NEVER the client''s payment status on the rental.';
comment on column crew_bookings.location is
  'Feeds the travel-feasibility check against adjacent bookings.';

-- TRIGGER REQUIRED: a booking may not overlap a crew_leaves row for the same
--   person - leave overlapping anything is blocked. Cross-table, so it cannot
--   be an EXCLUDE here.
-- TRIGGER REQUIRED: Tentative overlapping Confirmed is allowed and raises a
--   warning; it is never blocked.
-- TRIGGER REQUIRED: adjacent-day bookings in different locations raise a
--   travel-feasibility warning carrying the required travel time from the
--   Settings location-pair matrix. Warning only, never a block.
-- TRIGGER REQUIRED: the conflict override actor's role must be Owner or
--   Manager.
-- TRIGGER REQUIRED: a crew member with an expired crew_documents row of a type
--   required for this position cannot move to Confirmed.
-- NO billed, cost or margin columns exist here. Those three are read from the
--   Financial Engine per booking and per production. Crew cost and crew
--   revenue are separate P&L lines; this table must never be joinable into
--   rental payments or into the deposit liability ledger.

alter table crew_bookings enable row level security;


-- ===========================================================================
-- crew_shoot_days
-- One row per crew booking per working day: call and wrap, the timesheet
-- (planned, actual, break) and its approval state. Approval is the payout gate.
-- ===========================================================================
create table crew_shoot_days (
  id                    uuid not null default gen_random_uuid() primary key,
  client_uuid           uuid not null unique,
  crew_booking_id       uuid not null references crew_bookings (id),
  work_date             date not null,
  call_time             timestamptz,
  wrap_time             timestamptz,
  location              text,
  driver_crew_member_id uuid references crew_members (id),
  vehicle_id            uuid references vehicles (id),
  planned_start         timestamptz,
  planned_end           timestamptz,
  actual_start          timestamptz,
  actual_end            timestamptz,
  break_minutes         int,
  submission_state      timesheet_submission_state not null default 'Not Submitted',
  submitted_by          uuid references users (id),
  submitted_at          timestamptz,
  approval_state        timesheet_approval_state not null default 'Pending',
  approved_by           uuid references users (id),
  approved_at           timestamptz,
  overtime_approved_by  uuid references users (id),
  overtime_approved_at  timestamptz,
  created_by            uuid not null references users (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint crew_shoot_days_one_row_per_day unique (crew_booking_id, work_date),

  constraint crew_shoot_days_approved_needs_submission
    check (approval_state <> 'Approved'
           or (submission_state = 'Submitted' and approved_by is not null)),

  constraint crew_shoot_days_break_is_not_negative
    check (break_minutes is null or break_minutes >= 0),

  constraint crew_shoot_days_actual_end_after_start
    check (actual_end is null or actual_start is null or actual_end >= actual_start)
);

comment on column crew_shoot_days.client_uuid is
  'Required by the offline queue - mobile timesheet entry is the offline case.';
comment on column crew_shoot_days.work_date is
  'AD. "On shoot today" derives from this against today; it is never a stored flag.';
comment on column crew_shoot_days.submitted_by is
  'Staff submit on the crew member''s behalf - crew have no OS accounts in v1.';
comment on column crew_shoot_days.approval_state is
  'The payout gate. Owner or Manager only.';
comment on column crew_shoot_days.overtime_approved_by is
  'Overtime must be approved before it is payable. The hours themselves are derived, not stored - this records only the approval fact.';
comment on column crew_shoot_days.updated_at is
  'Frozen once approval_state = ''Approved''.';

-- NO overtime_hours column. Overtime is computed from actual against planned
--   and the Settings threshold - the alert derives from the same figures the
--   table shows, or it does not fire.
--   TODO(decision): the threshold itself (10 h is proposed) is unconfirmed and
--   lives in Settings, never in this schema.
-- TRIGGER REQUIRED: a person may not hold two shoot days on the same work_date
--   across engagements, including a staff driver's logistics day - no one is
--   paid twice for one day. The person is on the parent row, so this cannot be
--   an EXCLUDE here.
-- TRIGGER REQUIRED: a crew_payouts row may not be raised while any covered day
--   has approval_state <> 'Approved'; the disabled action must state
--   'Timesheet not approved'.
-- TRIGGER REQUIRED: a completed shoot day with submission_state =
--   'Not Submitted' raises a task.
-- TRIGGER REQUIRED: work_date must fall within the parent booking's
--   start_date..end_date.
-- TRIGGER REQUIRED: Approved rows are immutable - a correction reopens
--   approval and is audited.

alter table crew_shoot_days enable row level security;


-- ===========================================================================
-- crew_equipment_assignments
-- A responsibility label: which crew member is accountable for which
-- serialised asset during an existing rental. Never a stock movement and never
-- a second checkout path.
-- ===========================================================================
create table crew_equipment_assignments (
  id               uuid not null default gen_random_uuid() primary key,
  client_uuid      uuid not null unique,
  crew_booking_id  uuid not null references crew_bookings (id),
  booking_id       uuid not null references bookings (id),
  asset_id         uuid not null references assets (id),
  released_at      timestamptz,
  released_by      uuid references users (id),
  note             text,
  created_by       uuid not null references users (id),
  created_at       timestamptz not null default now(),

  constraint crew_equipment_assignments_release_names_an_actor
    check ((released_at is null) = (released_by is null))
);

comment on column crew_equipment_assignments.booking_id is
  'The rental the gear is already on. Must match the parent crew booking''s booking_id.';
comment on column crew_equipment_assignments.asset_id is
  'The serialised asset. The SN- string itself is read from assets and is never copied here.';
comment on column crew_equipment_assignments.released_at is
  'Responsibility ends when the unit is Returned. Inferred terminal - the spec names no explicit action.';
comment on column crew_equipment_assignments.created_by is
  'The assigning actor. This IS the assignment fact; a separate assigned_by would duplicate it.';

-- One accountable person per serial at a time.
create unique index crew_equipment_assignments_one_holder_per_serial
  on crew_equipment_assignments (booking_id, asset_id)
  where released_at is null;

-- TRIGGER REQUIRED: the asset must already be on the referenced booking -
--   (booking_id, asset_id) must resolve to one of that booking's serialised
--   lines. An assignment for a serial not on the booking is rejected.
-- TRIGGER REQUIRED: an assignment must never decrement availability, change
--   asset state, or create a session_line_movements row. Assign / Replace /
--   Return Equipment are launchers into Booking, Handover or Return with the
--   item pre-selected.
-- NO return_status column - return status is read from Return & Inspection.
-- NO serial column - the SN- string is read from assets.
-- NO monetary column may ever be added here. This is the one crew surface
--   Warehouse can see in full, and it stays that way only while it carries no
--   money.

alter table crew_equipment_assignments enable row level security;


-- ===========================================================================
-- crew_documents
-- Crew documents including government IDs: stored by reference with a type and
-- an expiry, and no ID number column at all.
-- ===========================================================================
create table crew_documents (
  id                     uuid not null default gen_random_uuid() primary key,
  client_uuid            uuid not null unique,
  crew_member_id         uuid not null references crew_members (id),
  doc_type               crew_document_type not null,
  evidence_file_id       uuid not null references evidence_files (id),
  expires_on             date,
  expiry_acknowledged_by uuid references users (id),
  expiry_acknowledged_at timestamptz,
  retention_until        date,
  archived_at            timestamptz,
  created_by             uuid not null references users (id),
  created_at             timestamptz not null default now(),

  constraint crew_documents_acknowledgement_names_a_human
    check ((expiry_acknowledged_at is null) = (expiry_acknowledged_by is null))
);

comment on column crew_documents.evidence_file_id is
  'Stored once with references, never duplicated. Referenced from a person record here - never attached to a booking, an export, a call sheet, a WhatsApp message or a support bundle.';
comment on column crew_documents.expires_on is
  'AD. Alerts name the document type and the expiry date, never a number.';
comment on column crew_documents.retention_until is
  'Engagement plus the statutory period. TODO(decision): the retention period is unconfirmed.';
comment on column crew_documents.archived_at is
  'Terminal. Never deleted.';

-- NO document-number column exists on this table - only the file reference,
--   the type and the expiry. A schema-level guarantee, not a UI choice.
-- TRIGGER REQUIRED: an expired document of a type required for a position
--   blocks confirming that crew member onto a booking in that position. The
--   required-document-per-position map lives in Settings.
-- TRIGGER REQUIRED: doc_type = 'Medical Certificate' is permitted only for
--   positions configured as requiring it (drone operator, driver) - health
--   data needs a stated reason to exist. The position map is in Settings, so
--   this cannot be a CHECK.
-- TRIGGER REQUIRED (RLS): rows are FILTERED OUT, not masked, for Manager,
--   Billing, Warehouse and Viewer - the existence of a document is itself
--   disclosure. Owner and Accounts only.

alter table crew_documents enable row level security;


-- ===========================================================================
-- crew_leaves
-- A period a crew member is unavailable. Without it 'On Leave' has no source
-- and 'leave overlapping anything is blocked' has nothing to enforce against.
-- ===========================================================================
create table crew_leaves (
  id             uuid not null default gen_random_uuid() primary key,
  client_uuid    uuid not null unique,
  crew_member_id uuid not null references crew_members (id),
  start_date     date not null,
  end_date       date not null,
  reason         text,
  cancelled_at   timestamptz,
  created_by     uuid not null references users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint crew_leaves_end_after_start check (end_date >= start_date),

  constraint crew_leaves_no_overlapping_leave
    exclude using gist (
      crew_member_id with =,
      daterange(start_date, end_date, '[]') with &&
    ) where (cancelled_at is null)
);

comment on column crew_leaves.reason is
  'Free text. No leave-type enum: the spec names no categories and inventing them would be speculative. Owner and Manager only, since it can carry health or personal detail.';
comment on column crew_leaves.cancelled_at is
  'Terminal. Never deleted.';

-- TRIGGER REQUIRED: leave may not overlap any non-cancelled crew_bookings row
--   for the same crew member. Cross-table, so it cannot be an EXCLUDE here. No
--   override path is described, so none is provided.

alter table crew_leaves enable row level security;


-- ===========================================================================
-- inventory_reservations
-- The hold placed on stock when a booking reaches Confirmed, released when it
-- is Cancelled. Nothing is reserved at Quote or Draft. This table is what
-- makes double-booking structurally impossible rather than a screen-level check.
-- ===========================================================================
create table inventory_reservations (
  id               uuid not null default gen_random_uuid() primary key,
  client_uuid      uuid not null unique,
  booking_id       uuid not null references bookings (id),
  booking_line_id  uuid not null references booking_lines (id),
  asset_id         uuid references assets (id),
  product_id       uuid references products (id),
  qty              int not null default 1,
  period           tstzrange not null,
  state            inventory_state not null default 'Reserved',
  reserved_at      timestamptz not null default now(),
  released_at      timestamptz,
  released_reason  text,
  created_at       timestamptz not null default now(),
  created_by       uuid not null references users (id),

  -- A hold is either serialised or quantity, never both.
  constraint inventory_reservations_serialised_xor_quantity
    check ((asset_id is null) <> (product_id is null)),

  constraint inventory_reservations_qty_positive check (qty > 0),

  constraint inventory_reservations_serialised_hold_is_one
    check (asset_id is null or qty = 1),

  constraint inventory_reservations_release_carries_a_reason
    check (released_at is null or released_reason is not null),

  -- The same serial cannot be held by two live bookings over overlapping dates.
  constraint inventory_reservations_no_double_booking
    exclude using gist (asset_id with =, period with &&)
    where (released_at is null and asset_id is not null)
);

comment on column inventory_reservations.client_uuid is
  'Idempotency - a retried Confirm must not double-reserve.';
comment on column inventory_reservations.booking_line_id is
  'If reservation fails on any line, Confirm is rejected with the conflicting line named.';
comment on column inventory_reservations.period is
  'AD/UTC range from pickup_at to return_at. An extension widens it and must re-run the availability check. Availability logic runs on the AD date, always.';
comment on column inventory_reservations.state is
  'Reserved is a real state, not a filter - an item reserved for Thursday is not available on Thursday, and the Calendar must show that. There is no provisional or soft-hold state and none may be added.';
comment on column inventory_reservations.reserved_at is
  'Written by the Confirm transaction, never earlier.';
comment on column inventory_reservations.released_at is
  'Set by Cancel. The row remains - released, never deleted.';

-- TRIGGER REQUIRED: no row may exist for a booking at stage Quote or Draft. A
--   quotation is an estimate and nothing is reserved until staff convert it.
-- TRIGGER REQUIRED: the sum of qty of live holds for a product over any
--   overlapping period must not exceed stock on hand.
-- TRIGGER REQUIRED: period must lie within the booking's pickup_at..return_at
--   window.
-- TRIGGER REQUIRED: cancelling a booking sets released_at and released_reason
--   on every live hold in the same transaction.
-- TRIGGER REQUIRED: insert and release happen only through the Confirm and
--   Cancel transactions, never by direct write. No DELETE - a hold is
--   released, not removed.

alter table inventory_reservations enable row level security;


-- ===========================================================================
-- fulfillment_outcomes
-- Records demand that could not be met, at the moment it could not be met. The
-- one report input that cannot be reconstructed later - a booking never made
-- and an item never available leave no trace anywhere else in the schema.
-- ===========================================================================
create table fulfillment_outcomes (
  id                     uuid not null default gen_random_uuid() primary key,
  client_uuid            uuid not null unique,
  booking_id             uuid not null references bookings (id),
  booking_line_id        uuid references booking_lines (id),
  requested_model_id     uuid not null references products (id),
  requested_qty          int not null,
  delivered_qty          int not null default 0,
  fulfillment_status     fulfillment_status not null,
  substituted_model_id   uuid references products (id),
  swap_type              swap_type,
  sub_rental_id          uuid references sub_rentals (id),
  waiting_since          timestamptz,
  resolved_at            timestamptz,
  delivery_method        text,
  assigned_staff_id      uuid references users (id),
  due_date_ad            date,
  branch_id              uuid not null references branches (id),
  warehouse_id           uuid not null references warehouses (id),
  estimated_revenue_lost numeric(14,2),
  created_at             timestamptz not null default now(),
  created_by             uuid references users (id),

  constraint fulfillment_outcomes_delivered_within_requested
    check (delivered_qty >= 0 and delivered_qty <= requested_qty),

  constraint fulfillment_outcomes_fulfilled_means_all_delivered
    check (fulfillment_status <> 'Fulfilled' or delivered_qty = requested_qty),

  constraint fulfillment_outcomes_unfulfilled_means_none_delivered
    check (fulfillment_status <> 'Unfulfilled' or delivered_qty = 0),

  constraint fulfillment_outcomes_partial_is_strictly_between
    check (fulfillment_status <> 'Partial'
           or (delivered_qty > 0 and delivered_qty < requested_qty)),

  constraint fulfillment_outcomes_waiting_starts_a_clock
    check (fulfillment_status <> 'Waiting' or waiting_since is not null)
);

comment on column fulfillment_outcomes.booking_line_id is
  'NULL where the shortage is at booking level rather than line level.';
comment on column fulfillment_outcomes.fulfillment_status is
  'TODO(decision): the reverse implications are not encodable until it is decided whether Waiting and Overbooked rows may carry delivered_qty = 0 or delivered_qty = requested_qty. Only the forward implications are enforced above.';
comment on column fulfillment_outcomes.sub_rental_id is
  'The sub-rental that covered the gap. Its cost is a Profitability input and is Warehouse-hidden.';
comment on column fulfillment_outcomes.resolved_at is
  'NULL while still waiting. A shortage later covered by a sub-rental sets resolved_at and remains counted as a shortage that occurred.';
comment on column fulfillment_outcomes.estimated_revenue_lost is
  'FROZEN AT WRITE TIME, deliberately stored. Derivable as shortage x rate x days only if the rate at the time is recoverable - rates change, so a derived version would restate history on every later report run. Column-level denied to Warehouse.';
comment on column fulfillment_outcomes.created_by is
  'NULL when written by the availability check rather than by a person.';

-- TRIGGER REQUIRED: the fulfilment donut's five slices must sum to Total
--   Requests.
-- TRIGGER REQUIRED: a row is recorded at the moment of the shortage and can
--   never be back-filled - live availability at a past instant is
--   reconstructible only from asset state history, not from current asset
--   state.
-- TRIGGER REQUIRED: rows are never deleted; a resolved shortage still counts
--   as a shortage that occurred.

alter table fulfillment_outcomes enable row level security;


-- ===========================================================================
-- Deferred foreign keys.
-- These seven point forward to tables declared later in this file. They are
-- ordinary foreign keys and carry no different meaning.
-- ===========================================================================
alter table operation_sessions
  add constraint operation_sessions_receiver_id_document_fk
  foreign key (receiver_id_document_evidence_id) references evidence_files (id);

alter table session_line_movements
  add constraint session_line_movements_scan_event_fk
  foreign key (scan_event_id) references scan_events (id);

alter table scan_events
  add constraint scan_events_override_record_fk
  foreign key (override_record_id) references override_records (id);

alter table signatures
  add constraint signatures_evidence_file_fk
  foreign key (signature_evidence_file_id) references evidence_files (id);

alter table damage_findings
  add constraint damage_findings_cleaning_queue_entry_fk
  foreign key (cleaning_queue_entry_id) references cleaning_queue_entries (id);

alter table evidence_references
  add constraint evidence_references_cleaning_queue_entry_fk
  foreign key (cleaning_queue_entry_id) references cleaning_queue_entries (id);

alter table cleaning_task_results
  add constraint cleaning_task_results_checklist_task_fk
  foreign key (checklist_task_id) references category_checklist_tasks (id);


-- ===========================================================================
-- Grants.
-- NOTHING IS DELETED: no DELETE is granted on any operations table, to any
-- role, including Owner. Terminal actions are the state changes named on each
-- table - Cancel, Void, Reverse, Retire, Archive, Deactivate, Close.
-- The three append-only tables additionally take no UPDATE from anyone: a
-- mistake on them is a compensating row, never an edit.
-- ===========================================================================
revoke delete on
  operation_sessions,
  session_line_movements,
  packing_lines,
  handover_lines,
  return_lines,
  return_accessory_checks,
  damage_findings,
  signatures,
  scan_events,
  scan_sync_conflicts,
  evidence_files,
  evidence_references,
  cleaning_queue_entries,
  cleaning_task_results,
  category_checklist_tasks,
  override_records,
  crew_members,
  crew_bookings,
  crew_shoot_days,
  crew_equipment_assignments,
  crew_documents,
  crew_leaves,
  inventory_reservations,
  fulfillment_outcomes
from public, anon, authenticated;

revoke update on
  session_line_movements,
  scan_events,
  override_records
from public, anon, authenticated;

commit;
