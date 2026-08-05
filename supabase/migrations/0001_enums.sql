-- 0001_enums.sql
-- Babin Rentals OS - every enum type in the consolidated schema model.
-- Generated from schema-model.json (290 extracted definitions, merged by name).
--
-- Declaration order inside a status type IS the lifecycle order: sorting and
-- stage comparisons use the Postgres enum ordinal, so labels must never be
-- reordered after this migration. New labels go on the end with ALTER TYPE
-- ... ADD VALUE, or BEFORE/AFTER an existing label when lifecycle demands it.
--
-- Terminal labels (Cancelled, Void, Reversed, Retired, Archived, Deactivated,
-- Closed) exist because NOTHING IS DELETED - every terminal action in this
-- system is a state change, never a DELETE.

begin;

-- The five workspaces, in stage order, exactly as named in 04 Operations/README.md and Foundation sec 1.8. operation_sessions is restricted by CHECK to Packing/Handover/Return - Reset and Cleaning are queue-driven (cleaning_queue_entries) and have no session concept in any spec.
create type operation_kind as enum (
  'Packing',
  'Handover',
  'Return',
  'Reset',
  'Cleaning'
);

-- Handover sec 2.1 and Return sec 3. Forward-only; Completed is sealed.
create type session_state as enum (
  'Not Started',
  'In Progress',
  'Completed'
);

-- Handover sec 6.2. Decides which transport columns may be non-null and whether a Driver signature is required.
create type delivery_method as enum (
  'Customer Pickup',
  'Babin Delivery',
  'Courier',
  'Third Party'
);

-- Per-unit quantity state on a booking line (Foundation sec 1.2 / Ops README), also carried on session_line_movements.resulting_item_state. 'Packed' is deliberately absent. Distinct from the locked ten inventory_state values carried by assets - never merge the two.
-- NOTE: identical value sets; the passes disagree on whether the type is ordered. Resolved UNORDERED in intent - Foundation sec 1.2 is an unnumbered state table and Missing / Damaged are alternatives to Returned, not successors - but the declaration order below is still the spec's printed order.
create type item_quantity_state as enum (
  'Ready',
  'Picked Up',
  'Returned',
  'Missing',
  'Damaged'
);

-- Packing sec 6, 'Six states, no more.' Reserved / Cleaning Required / Inspection Required are blocker notes on a Pending row, not states.
create type packing_line_state as enum (
  'Pending',
  'Packed',
  'Partial',
  'Missing',
  'Not Required',
  'Replaced'
);

-- Packing sec 6 - condition recorded per packed line.
create type packing_condition as enum (
  'Good',
  'Damaged'
);

-- Handover sec 7.2.
create type handover_line_state as enum (
  'Remaining',
  'Picked Up',
  'Missing'
);

-- Return sec 6.2. Routing destinations (Cleaning, Maintenance, Available) are NOT states - v2.0's nine statuses were collapsed.
create type return_line_state as enum (
  'Outstanding',
  'Returned',
  'Not Returned'
);

-- Return sec 6.2 - tracked separately per returned line.
create type inspection_state as enum (
  'Pending',
  'Inspected'
);

-- Return sec 6.3, single-select radio group. Needs Cleaning / Needs Repair removed - they are destinations, derived.
create type item_condition as enum (
  'Excellent',
  'Good',
  'Fair',
  'Damaged',
  'Lost'
);

-- Return sec 8.5, required at session close for any line never returned.
create type not_returned_decision as enum (
  'Still expected',
  'Charge replacement',
  'Insurance claim',
  'Write off'
);

-- Return sec 8.3, per item.
create type damage_disposition as enum (
  'Charge Client',
  'Absorb',
  'Defer to Insurance'
);

-- Only 'Pending Approval' is named verbatim (Return sec 8.3); 'Approved' is implied by gate 5. Flagged as an inferred value.
create type damage_approval_state as enum (
  'Pending Approval',
  'Approved'
);

-- Derived naming. The specs describe two paths with different consequences: Return sec 8.3 (client has not yet signed off) and Cleaning sec 7.2 (after inspection closed - raises a Manager case instead of deciding the charge).
create type damage_source as enum (
  'Return inspection',
  'Cleaning'
);

-- Union of Handover sec 9.2 (Receiver, Warehouse staff, Driver, Witness) and Return sec 9 (Returning person, Warehouse staff, Witness). Driver applies to Handover only, Returning person to Return only.
create type signature_role as enum (
  'Receiver',
  'Warehouse staff',
  'Driver',
  'Witness',
  'Returning person'
);

-- Scanner sec 3, lowercase verbatim. Deliberately NOT the same vocabulary as operation_kind - the scanner has two contexts (stock_check, lookup) that are not workspaces.
create type scan_context as enum (
  'packing',
  'handover',
  'return',
  'reset',
  'stock_check',
  'lookup'
);

-- Scanner sec 5, the six feedback results.
create type scan_result as enum (
  'Accepted',
  'Duplicate',
  'Wrong job',
  'Not expected here',
  'Blocked',
  'Unknown code'
);

-- Scanner sec 2. QR primary; Barcode 1D lookup only; manual entry always available.
create type scan_code_type as enum (
  'QR',
  'Barcode 1D',
  'Manual entry'
);

-- Evidence sec 6. Matched + Need Review + Unmatched = Total.
create type evidence_match_state as enum (
  'Matched',
  'Need Review',
  'Unmatched'
);

-- Evidence sec 7.1 priority order - first source to resolve wins.
create type evidence_match_source as enum (
  'QR code',
  'barcode',
  'serial OCR',
  'AI recognition',
  'manual assignment'
);

-- Evidence sec 4 - one indicator, four steps.
create type evidence_processing_step as enum (
  'Upload',
  'Processing',
  'Review & Match',
  'Synced'
);

-- Evidence sec 5.2. 'All Photos' is the aggregate view, not a category, so it is not a value.
create type evidence_category as enum (
  'Packing',
  'Pickup / Delivery',
  'Return',
  'Inspection',
  'Damage',
  'Cleaning',
  'Maintenance',
  'Warehouse',
  'Client Documents',
  'Marketing',
  'Others'
);

-- Evidence sec 11.2. ZIP is expanded on upload and never stored as an archive.
create type evidence_media_type as enum (
  'Image',
  'Video',
  'Document'
);

-- Evidence sec 2 'Operations that write evidence'. Distinct from evidence_category - Pickup and Delivery are separate stages but one category.
create type evidence_operation_stage as enum (
  'Packing',
  'Pickup',
  'Delivery',
  'Return',
  'Inspection',
  'Reset',
  'Cleaning',
  'Maintenance',
  'Damage',
  'Inventory',
  'Warehouse',
  'Client documents'
);

-- Cleaning sec 3.1, mutually exclusive. QC is a sub-state of stage 9, not a stage. Priority is a flag and is not a value here.
create type cleaning_queue_state as enum (
  'Waiting',
  'Cleaning',
  'QC',
  'Ready'
);

-- Cleaning sec 7.1, the 'Any Problems?' quad, set per item never per batch.
create type cleaning_problem_state as enum (
  'No Problems',
  'Missing Item',
  'Needs Repair',
  'Damaged'
);

-- Cleaning sec 8 - one workspace, two modes.
create type cleaning_mode as enum (
  'Clean',
  'Reset'
);

-- Derived naming. Five override situations described across Handover sec 11.4, Scanner sec 5, Crew Booking sec 5.1, README stage rules and Cleaning sec 10; no spec names the enum.
create type override_type as enum (
  'Gate override',
  'Scan block override',
  'Double booking override',
  'Stage reversal',
  'QC skip'
);

-- Foundation sec 1.1 / Ops README, identical in both. Declared in this order so Postgres enum ordering IS the lifecycle ordinal - Indexes.md sanctions this explicitly: 'Needs a stage ordinal column OR an enum with the right order'. Cancelled is declared last and carries no ordinal; it is terminal and never a +1 successor.
create type booking_stage as enum (
  'Quote',
  'Draft',
  'Confirmed',
  'Preparing',
  'Ready',
  'Dispatched',
  'On Rent',
  'Return Due',
  'Inspection',
  'Cleaning',
  'Completed',
  'Closed',
  'Cancelled'
);

-- Foundation sec 1.5. DERIVED from stage, never stored. The 'Use' column of Foundation sec 1.1 (Estimate/Internal/Operational/Financial/Terminal) is a different axis that one draft mistook for this enum - it is not a colour category and is not modelled.
create type stage_category as enum (
  'Neutral',
  'Action Required',
  'In Progress',
  'Waiting',
  'Success',
  'Danger'
);

-- Booking Workflow sec 4.6, sec 9.2. Handover is the single outbound workspace covering all four.
create type delivery_type as enum (
  'Customer Pickup',
  'Babin Delivery',
  'Courier',
  'Third Party'
);

-- Lifecycle of a single payment row (Payments.md sec 5.2). 'Refunded' is derived from the existence of a reversal row - a status UPDATE would breach payment immutability.
-- NOTE: a second extraction pass defined payment_status as Unpaid / Partial / Paid / Refunded (Booking Workflow sec 10.4). That is the DERIVED invoice-side vocabulary, not a payment state. Ruling 4 Aug 2026: payment status and invoice status are SEPARATE enums and 'Partial' is an INVOICE state only, never a payment state - the union is refused here on purpose. See invoice_status (Draft / Sent / Partially Paid / Paid / Overdue / Void).
create type payment_status as enum (
  'Received',
  'Refunded',
  'Failed',
  'Cancelled'
);

-- Booking Workflow sec 8.2, verbatim. Tables.md lists the five calculation inputs as Equipment - Sub-rental - Service - Crew - Transport - Crew and Transport are separate tables, not line types, so the two lists do not conflict.
create type booking_line_type as enum (
  'Equipment',
  'Bundle',
  'Accessory',
  'Service',
  'Sub-rental',
  'Manual item'
);

-- Booking Workflow sec 8.2 'Service | Flat or per day'. A Flat service still stores days = 1 explicitly.
create type service_basis as enum (
  'Flat',
  'Per day'
);

-- Job role a crew person holds on a booking - never one of the six RBAC roles (Owner / Manager / Warehouse / Billing / Accounts / Viewer). Roles, not people.
-- NOTE: two passes disagreed on the member list. Pass A (Booking Workflow sec 9.1): Rental Coordinator, Warehouse Staff, Driver, Camera Assistant, Delivery Staff, Director, DoP. Pass B (crew module): Camera Assistant, Focus Puller, Gaffer, Grip, Drone Pilot, Sound Recordist. Union kept, pass A first; 'Camera Assistant' appears in both and is declared once.
create type crew_role as enum (
  'Rental Coordinator',
  'Warehouse Staff',
  'Driver',
  'Camera Assistant',
  'Delivery Staff',
  'Director',
  'DoP',
  'Focus Puller',
  'Gaffer',
  'Grip',
  'Drone Pilot',
  'Sound Recordist'
);

-- Foundation sec 1.3 flags registry, all twelve, verbatim. Only four are ever STORED (see booking_flags constraints); the enum keeps all twelve because the derived flag set renders from the same vocabulary.
create type booking_flag as enum (
  'Partial Pickup',
  'Partial Return',
  'Returned Early',
  'Late Return',
  'Missing',
  'Damaged',
  'Deposit Pending',
  'Payment Due',
  'Overdue',
  'VIP',
  'Blocked',
  'Upgrade Candidate'
);

-- Foundation sec 1.3 Type column.
create type flag_type as enum (
  'Quantity',
  'Timing',
  'Item',
  'Money',
  'Client',
  'Business'
);

-- Booking Workflow sec 11, in stage-gate order, plus the two uploaded kinds. This is the booking-side ROLE a document plays, not the document's own type - the central store (Documents.md sec 4) carries its own 15-prefix identifier registry and its own lifecycle enum (Draft - Pending Approval - Pending Signature - Signed - Issued - Void - Expired), neither of which is redefined here.
create type booking_document_type as enum (
  'Quote',
  'Rental Agreement',
  'Packing List',
  'Delivery Note',
  'Invoice',
  'Receipt',
  'Inspection Report',
  'Damage Report',
  'Client Documents',
  'Insurance'
);

-- Booking Workflow sec 11 'uploaded rather than generated'.
create type document_origin as enum (
  'Generated',
  'Uploaded'
);

-- Booking Workflow sec 11. Internal notes never print.
create type note_type as enum (
  'Booking',
  'Internal',
  'History'
);

-- Where a discount line came from. Stackable: Membership, Coupon, Women-DoP 5%. Not stackable: Student, College, Named-client rates. Tiers auto-disable once the 25% hard cap is reached.
-- NOTE: both passes carry the same seven values; they disagree only on declaration order (pass A puts Manual first, pass B puts it last). Pass A order kept. Reports Suite sec 14.4 separately objects that Student is a membership level (Academy) rather than a discount type - left untidied, as ruled.
create type discount_source as enum (
  'Manual',
  'Membership',
  'Coupon',
  'Women-DoP 5%',
  'Student',
  'College',
  'Named-client rates'
);

-- Customer Profiles (07 CRM) - the eight states mapped down from the twelve internal stages. Chosen over Customer Portal CP-6.2 because CP-6.2's left column uses names that are not in the Status Engine at all (Booked, Packed, Reset, Unverified) and Foundation sec 12 forbids a module redefining workflow.
create type client_visible_state as enum (
  'Quote Ready',
  'Confirmed',
  'Being Prepared',
  'With You',
  'Return Due',
  'Returned',
  'Completed',
  'Cancelled'
);

-- Customer Portal CP-6.2, the six fixed portal timeline dots, verbatim including the lowercase 'you'. A second, coarser projection of the same stage - not a substitute for client_visible_state.
create type client_timeline_step as enum (
  'Quote',
  'Confirmed',
  'Ready',
  'With you',
  'Returned',
  'Completed'
);

-- Severity of a derived booking/delivery alert, ascending. Information blocks nothing, Warning blocks Handover, Critical blocks Confirm. Alerts are DERIVED, never stored - the type exists for the view payload.
-- NOTE: Foundation sec 10 / Booking Workflow sec 12 spell the lowest band 'Information'; Delivery.md spells it 'Info'. Both spec strings are retained verbatim as required, so the type carries two labels for one band. 'Information' is canonical for new writes; a naming ruling should collapse these.
create type alert_severity as enum (
  'Information',
  'Info',
  'Warning',
  'Critical'
);

-- Verbatim from sec 3. Decides which ledger the day lands in: freelance = per-booking cost, internal staff = salary, never a per-booking cost.
create type crew_engagement_type as enum (
  'freelance',
  'internal staff'
);

-- Verbatim from sec 3. Drives the withholding treatment; the actual rates are unconfirmed (Open ?3).
create type crew_pan_status as enum (
  'registered',
  'not registered'
);

-- sec 11, five states, forward order. `Assigned` and `On Shoot` are explicitly removed as states - on-shoot is derived from today falling inside a Confirmed booking.
create type crew_booking_state as enum (
  'Draft',
  'Tentative',
  'Confirmed',
  'Completed',
  'Cancelled'
);

-- sec 11. ONE enum type used by both crew_bookings.payout_state and crew_payouts.state - both drafts named it identically. This is the payout (money out) state and must never be reused for, or joined to, the client's rental payment status.
create type crew_payout_state as enum (
  'Not due',
  'Due',
  'Paid'
);

-- sec 7.1, seven values verbatim including the slash in `Citizenship / Passport` and the spelling `Driving License`. Not tidied.
create type crew_document_type as enum (
  'Contract',
  'NDA',
  'Citizenship / Passport',
  'Driving License',
  'Certifications',
  'Insurance',
  'Medical Certificate'
);

-- Only `Not Submitted` appears verbatim (sec 8); `Submitted` is the implied counterpart. Flagged as partly inferred.
create type timesheet_submission_state as enum (
  'Not Submitted',
  'Submitted'
);

-- INFERRED - the spec names `approval state` (sec 8) and `Timesheet not approved` (sec 15) but never enumerates values. No `Rejected` value is invented because no rejection path is described.
create type timesheet_approval_state as enum (
  'Pending',
  'Approved'
);

-- VOCABULARY ONLY - no column anywhere uses this type. sec 5.3 `Roster = Available + Booked + On Leave + Off Duty`, mutually exclusive, computed from bookings and leave. Kept only so the derived roster view can cast to a fixed vocabulary. `On Shoot` is a subset of Booked and is not a value; `Tentative` is a booking state, not a person state.
create type crew_person_state as enum (
  'Available',
  'Booked',
  'On Leave',
  'Off Duty'
);

-- Superset from 06 Inventory/Add Equipment.md line 73 (the create form). 03 Core Modules/Inventory.md line 75 lists only 8 (Camera-Lens-Lighting-Support-Power-Audio-Media-Accessory) - that is the filter-chip subset, not a second vocabulary. Bundles' 'DIT' and 'Production' are NOT members.
create type product_category as enum (
  'Camera',
  'Lens',
  'Lighting',
  'Grip',
  'Support',
  'Audio',
  'Drone',
  'Monitor',
  'Power',
  'Media',
  'Computing',
  'Case',
  'Bag',
  'Accessory',
  'Consumable',
  'Vehicle',
  'Other'
);

-- One field replacing the three that asked the same question. Governs whether product_units rows may exist.
create type product_tracking_mode as enum (
  'Serialised',
  'Quantity',
  'Consumable'
);

-- Quantity/Consumable modes only.
create type product_unit_of_measure as enum (
  'piece',
  'metre',
  'roll',
  'pack'
);

-- Draft on Save Draft, Active on Create Equipment, Archived by the row action. Never deleted.
create type product_record_state as enum (
  'Draft',
  'Active',
  'Archived'
);

-- THE LOCKED TEN. Lifecycle state of a product unit (Inventory.md sec 4.1 chip order, never alphabetical); also stored by inventory_reservations. No in-transit entry by design. 'Retired' is the terminal state - units are retired, never deleted.
create type inventory_state as enum (
  'In Stock',
  'Reserved',
  'Packed',
  'On Rent',
  'Returning',
  'Inspection',
  'Cleaning',
  'Maintenance',
  'Missing',
  'Retired'
);

-- Intake condition, then inspection only. 'Needs Service' and 'Retired' are not conditions.
create type unit_condition as enum (
  'Excellent',
  'Good',
  'Fair',
  'Damaged',
  'Lost'
);

-- Physical WHERE only. Its 'In Transit' member describes a place, not an inventory state - the authoritative in-transit fact is the open stock_transfers row.
create type location_kind as enum (
  'Warehouse',
  'Case',
  'Drawer',
  'Workshop',
  'With Client',
  'In Transit',
  'Sub-Rental Supplier'
);

-- 'Compatible with' symmetric and informational; 'Requires' directional and drives the missing-accessory warning at packing.
create type compatibility_kind as enum (
  'Compatible with',
  'Requires'
);

-- Add Equipment names invoice-warranty-insurance-manual-certificates; Photo added for the gallery, which Asset Detail treats as the same 50MB attachment store.
create type product_document_kind as enum (
  'Invoice',
  'Warranty',
  'Insurance',
  'Manual',
  'Certificate',
  'Photo'
);

-- OPEN: Warehouse.md shows a Status field and an 'Active Warehouses' KPI but never enumerates the values. Two-value set inferred from the KPI; confirm before shipping.
create type warehouse_status as enum (
  'Active',
  'Inactive'
);

-- Warehouse.md six-level hierarchy (Warehouse -> Room -> Zone -> Rack -> Shelf -> Bin) minus the warehouse root, which is its own table. Add Equipment's five-level 'Warehouse ? Zone ? Rack ? Shelf ? Bin' omits Room and is the subset.
create type storage_level as enum (
  'Room',
  'Zone',
  'Rack',
  'Shelf',
  'Bin'
);

-- Exact Transfer Center vocabulary from Warehouse.md. Both drafts truncated it to three; Temporary Holding and Transit are real members.
create type transfer_kind as enum (
  'Branch Transfers',
  'Warehouse Transfers',
  'Zone Transfers',
  'Temporary Holding',
  'Transit'
);

-- Identical in Warehouse.md and Transfers.md - the claimed conflict does not exist. Forward-only; Cancelled is terminal and reachable from any stage.
create type transfer_status as enum (
  'Pending',
  'Approved',
  'Packing',
  'In Transit',
  'Received',
  'Completed',
  'Cancelled'
);

-- 
create type stock_check_scope as enum (
  'Location',
  'Category',
  'Fleet item',
  'Full warehouse'
);

-- The three ways out per unit.
create type stock_check_outcome as enum (
  'Found',
  'Confirmed missing',
  'Left unverified'
);

-- Why an in-scope unit is not expected. Shown as a separate line, never counted as missing.
create type stock_check_exclusion as enum (
  'On Rent',
  'In Transit',
  'Sub-rented out'
);

-- Forward-only along Draft->Submitted->Approved->Ordered->Received; Cancelled from Draft or Submitted, Rejected from Submitted or Approved.
create type purchase_request_status as enum (
  'Draft',
  'Submitted',
  'Approved',
  'Ordered',
  'Received',
  'Rejected',
  'Cancelled'
);

-- 
create type purchase_request_reason as enum (
  'Demand exceeded',
  'Sub-rent event',
  'Manual'
);

-- Lower-case exactly as the spec writes them. The reason is shown the next time the same item triggers.
create type purchase_request_rejection_reason as enum (
  'not needed',
  'too expensive',
  'sub-rent is cheaper',
  'buying different model',
  'later'
);

-- High ? 8 - Medium 4-7 - Low < 4. Stored ONLY as priority_override_band; the computed band is derived.
create type priority_band as enum (
  'High',
  'Medium',
  'Low'
);

-- The two observed triggers. Manual PRs carry no evidence rows.
create type pr_evidence_kind as enum (
  'Demand exceeded',
  'Sub-rent event'
);

-- DERIVED ONLY - never a stored column. Evaluate top-down, stop at first match. Archived is stored separately (archived_at) and sits outside the sum.
create type bundle_state as enum (
  'On Rent',
  'Reserved',
  'On Maintenance',
  'Partially Available',
  'Available'
);

-- The four counted categories that must sum to Total Items.
create type bundle_line_kind as enum (
  'Equipment',
  'Crew',
  'Vehicle',
  'Box'
);

-- 
create type vehicle_type as enum (
  'Pickup Van',
  'Mini Truck',
  'SUV',
  'Generator Vehicle'
);

-- Never both. Switching clears the other.
create type bundle_discount_kind as enum (
  'percentage',
  'fixed'
);

-- Exclusive. Borrowed + Lent = All.
create type sub_rental_direction as enum (
  'Borrowed',
  'Lent'
);

-- DERIVED from the newest timeline event - not a stored column. 'Active' is NOT a member: it is Reserved + On Rent and belongs only in the KPI row.
create type sub_rental_status as enum (
  'Requested',
  'Reserved',
  'On Rent',
  'Returned',
  'Settled',
  'Cancelled'
);

-- DERIVED overlays that append beside the status badge, never replace it, never counted in a total.
create type sub_rental_flag as enum (
  'Overdue',
  'Extended',
  'Late Pickup',
  'Damaged'
);

-- Six exclusive statuses; sum of statuses = All holds structurally because status is NOT NULL.
create type maintenance_status as enum (
  'Scheduled',
  'In Progress',
  'Waiting Parts',
  'At Vendor',
  'Completed',
  'Cancelled'
);

-- Plain 'Cleaning' is deliberately absent - routine post-rental cleaning is rental Stage 9.
create type maintenance_type as enum (
  'Repair',
  'Inspection',
  'Calibration',
  'Firmware Update',
  'Sensor Cleaning',
  'Internal Cleaning',
  'Fungus Removal',
  'Preventive Service'
);

-- Critical sorts to the top regardless of active sort.
create type maintenance_priority as enum (
  'Low',
  'Medium',
  'High',
  'Critical'
);

-- DERIVED overlays. There is no maintenance_flags table - each is a function of existing columns against one resolved today.
create type maintenance_flag as enum (
  'Overdue',
  'Warranty',
  'Blocked Booking',
  'Awaiting Approval'
);

-- Mandatory when a claim is declined on an in-warranty unit. Two drafts named this warranty_no_claim_reason; kept as warranty_decline_reason.
create type warranty_decline_reason as enum (
  'Accidental damage',
  'Not covered',
  'Claim declined',
  'Faster to pay'
);

-- 95-100 Excellent - 85-94 Good - 70-84 Fair - 50-69 Poor - below 50 Replace. DERIVED from the same function as the score, never a second lookup - 92 is Good.
create type equipment_health_band as enum (
  'Excellent',
  'Good',
  'Fair',
  'Poor',
  'Replace'
);

-- DERIVED requirement, not spec vocabulary: the spec describes automatic preventive creation but never names a source field. Retained because created_by IS NULL alone cannot distinguish an import from a scheduler run.
create type maintenance_source as enum (
  'Manual',
  'Preventive cycle'
);

-- Add Client v2.2 sec 4.1 is CANONICAL and supersedes the Clients Page sec 11.3 list (Production Company / Educational Institution / Freelancer / Government / NGO / Broadcaster / Individual) - Add Client sec 18 says so explicitly.
create type client_type_parent as enum (
  'Organisation',
  'Individual'
);

-- Add Client sec 4.1. Set only when type_parent = Organisation. Rental House additionally feeds the sub-rental supplier picker (sec 4.5).
create type client_organisation_subtype as enum (
  'Production House',
  'Rental House',
  'College / Institution',
  'Corporate / Agency',
  'Government / NGO',
  'Broadcaster',
  'Other'
);

-- Add Client sec 4.2. Individual only, multi-select, optional. Never affects pricing.
create type client_profession as enum (
  'Cinematographer',
  'Director',
  'Assistant Camera',
  'Gaffer',
  'Editor',
  'Photographer',
  'Producer',
  'Sound',
  'Other'
);

-- Add Client sec 4.3. Both parents. Drives reporting and marketing lists only. Segment counts overlap and do NOT sum.
create type client_segment as enum (
  'Wedding / Event',
  'Corporate',
  'Documentary',
  'Music Video',
  'Commercial',
  'Feature',
  'YouTube / Creator',
  'Education',
  'Other'
);

-- Used by clients and client_contacts (two identical draft enums merged). Blocked is NOT a member of this enum - it is a flag on client_flags (Blacklist.md).
create type client_status as enum (
  'Active',
  'Deactivated'
);

-- Add Client sec 4.7, Individual only.
create type government_id_kind as enum (
  'Citizenship',
  'Passport'
);

-- Add Client sec 7.2. Anything beyond Immediate is credit and takes the same gated approval.
create type payment_terms as enum (
  'Immediate',
  '7 days',
  '15 days',
  '30 days'
);

-- Contact Persons.md - the client's stated preference for reminders/receipts. Deliberately kept separate from channel_code: this list includes Push, which is not a v1 messaging channel.
create type preferred_contact_channel as enum (
  'Email',
  'SMS',
  'WhatsApp',
  'Push'
);

-- The v1 communication channel lock (Unified Inbox v3.1 sec 2). Used by client_channel_identities and client_marketing_consents.
-- NOTE: three passes, all agreeing on the four values. CONFLICT RESOLVED upstream: Unified Inbox v3.1 sec 2 cuts channels from 8 to 4 and supersedes v3.0; Settings/Communication Settings.md's five-card set (adding 'Push Notifications' and splitting 'In-App Notifications') is the superseded shape. Facebook Messenger, Instagram, Telegram, phone-call logs and browser push are deferred and must not be addable.
create type channel_code as enum (
  'WhatsApp',
  'Email',
  'SMS',
  'In-App'
);

-- Customer Portal CP-1.2 / CP-12. NE is the portal default; staff set the initial value.
create type portal_language as enum (
  'NE',
  'EN'
);

-- CP-1.3. Two roles inside one client account.
create type portal_user_role as enum (
  'Owner-user',
  'Member'
);

-- DERIVED VOCABULARY - the spec names the transitions (Send invite, remove) but never enumerates states. Flag for confirmation.
create type portal_user_status as enum (
  'Invited',
  'Active',
  'Deactivated'
);

-- CP-1.1: SMS with WhatsApp fallback. Which is primary is CP open item 1.
create type otp_delivery_channel as enum (
  'SMS',
  'WhatsApp'
);

-- Customer Profiles.md. Flags append to state, never replace it.
create type client_flag_type as enum (
  'VIP',
  'Blocked',
  'Upgrade Candidate'
);

-- DERIVED - not named in the specs. Required because Upgrade Candidate is generated automatically (Membership sec 12) and because 'does credit breach auto-block' (Blacklist ?) must be answerable once decided.
create type flag_source as enum (
  'Manual',
  'System'
);

-- Membership sec 5 / Loyalty. Ladder order. There is no 'None' value - no membership is the absence of a live client_memberships row.
create type membership_level as enum (
  'Academy',
  'Creator',
  'Cinematographer',
  'Production Alliance',
  'Elite'
);

-- Membership sec 5. Levels are distinguished by label, never hue.
create type membership_label as enum (
  'Access Member',
  'Partner',
  'Elite Member'
);

-- Membership sec 5. Ticks mark included features only; numeric limits are never perks.
create type membership_perk as enum (
  'Priority Booking',
  'Dedicated Manager',
  'Company Billing',
  'Credit Terms',
  'VIP Support',
  'Custom Solutions'
);

-- DERIVED - the spec gives Edit Plans but no plan lifecycle. Required by the nothing-is-deleted law.
create type membership_plan_status as enum (
  'Active',
  'Retired'
);

-- COMPUTED READ VOCABULARY ONLY - no column of this type may exist anywhere (Membership sec 9: 'computed on read, never stored, never editable'). Expiring is a badge over Active rows and is NOT a value here.
create type membership_status as enum (
  'Active',
  'Grace',
  'Lapsed'
);

-- Membership sec 5 row labels, sec 12 soft limits.
create type membership_limit_kind as enum (
  'Monthly booking limit',
  'Simultaneous rental limit'
);

-- Credit Limits.md + Add Client sec 7.2 - both take the identical gate.
create type commercial_override_kind as enum (
  'Credit Limit',
  'Payment Terms'
);

-- Only 'until approved' is stated (Credit Limits.md). Rejected and Void are derived; the rejection path is unspecified.
create type commercial_override_status as enum (
  'Pending',
  'Approved',
  'Rejected',
  'Void'
);

-- CP-7 requested-document list, plus Rental Agreement which CP-7 renders in the same card and which signed_at requires. Passport and Business registration appear in Add Client sec 4.7 as record fields, not as document kinds - the canonical union is an open question.
create type client_document_kind as enum (
  'Student ID',
  'College letter',
  'PAN / VAT',
  'Citizenship',
  'Rental Agreement'
);

-- CP-7. Verified is a staff action; a portal user may never set it.
create type client_document_status as enum (
  'Pending',
  'Verified'
);

-- CP-11 names only 'Edit requested'. The rest are derived from 'until staff accept'.
create type change_request_status as enum (
  'Edit requested',
  'Accepted',
  'Rejected',
  'Void'
);

-- Marketing consent per client per channel. Transactional consent has NO state - it is implied by the rental relationship.
-- NOTE: two incompatible vocabularies. Unified Inbox sec 3.1: 'Not asked' / 'Opted in' / 'Opted out'. Communication Settings.md (used as from_state/to_state on consent_events): 'Opt-In' / 'Opt-Out' / 'Do Not Disturb', which adds a fourth concept (Do Not Disturb) with no Inbox equivalent. Union kept verbatim; needs a ruling before either side is retired.
create type marketing_consent_state as enum (
  'Not asked',
  'Opted in',
  'Opted out',
  'Opt-In',
  'Opt-Out',
  'Do Not Disturb'
);

-- Taxes.md 'Customer Tax Profiles'. Rendered as an unordered bullet list in the spec - the clients draft claimed ordered:true; corrected to unordered.
create type customer_tax_profile as enum (
  'VAT Registered',
  'Non-VAT Customer',
  'Tax Exempt',
  'Government Organization',
  'NGO',
  'Corporate'
);

-- 05 Finance/Invoices.md. 'Overdue' is derived (due_date vs today on the AD value) and must never be persisted - see invoices constraints.
create type invoice_status as enum (
  'Draft',
  'Sent',
  'Partially Paid',
  'Paid',
  'Overdue',
  'Void'
);

-- 03 Core Modules/Payments.md sec 5.3 - 'Advance Payment, Security Deposit and Refund are payment types, not methods.' The payments table CHECKs payment_type <> 'Security Deposit'; that branch of the entry form writes deposit_movements instead. Booking Workflow sec 10.5 names the same field Rental / Deposit / Refund - same three branches, different vocabulary; the Finance-module wording is used because payments is a finance table.
create type payment_type as enum (
  'Advance Payment',
  'Security Deposit',
  'Refund'
);

-- 03 Core Modules/Payments.md sec 5.3 grouping headers.
create type payment_channel_group as enum (
  'Digital wallets',
  'Bank',
  'Cash',
  'Cards',
  'Other'
);

-- Pricing Engine steps 1-5 in fixed print/calculation sequence. 13 Database/Tables.md abbreviates these as Equipment - Sub-rental - Service - Crew - Transport; the Pricing Engine wording is authoritative because the order is the calculation order.
create type line_kind as enum (
  'Equipment Rental',
  'Sub-Rental',
  'Services',
  'Crew Charges',
  'Transport'
);

-- 05 Finance/Deposits.md 'Settling a deposit' - Release deposit - Apply against a charge. Foundation's shorthand 'refunded or applied' is NOT used: Refunds.md separates deposit release (a liability discharged) from payment refund (revenue reversed) and forbids them sharing a code path.
create type deposit_movement_type as enum (
  'Received',
  'Released',
  'Applied'
);

-- 05 Finance/Deposits.md - 'Damage, missing or late charge'.
create type deposit_charge_type as enum (
  'Damage',
  'Missing',
  'Late'
);

-- Display vocabulary only. DERIVED, never stored: Required from deposits.deposit_required_amount, Received = sum of movements, Pending = Required - Received. Explicitly 'not a payment status' (Booking Workflow sec 10.4).
create type deposit_state as enum (
  'Required',
  'Received',
  'Pending'
);

-- 03 Core Modules/Expenses.md sec 7.2 (v2.2), which supersedes Finance v2.1 sec 9's 'Awaiting Approval' and its omission of Cancelled. Status drives editability.
create type expense_status as enum (
  'Draft',
  'Pending Approval',
  'Approved',
  'Paid',
  'Rejected',
  'Cancelled'
);

-- Recurrence interval of a recurring expense, ascending by period length.
-- NOTE: the two passes differ ONLY in letter case - Expenses.md sec 8 prints 'Daily - weekly - monthly - quarterly - yearly' mid-sentence, so one pass captured the lowercase run verbatim and the other capitalised it. This is one vocabulary, not two, so the union is NOT taken: emitting both 'weekly' and 'Weekly' would create duplicate labels for one interval. Capitalised form is canonical.
create type expense_recurrence as enum (
  'Daily',
  'Weekly',
  'Monthly',
  'Quarterly',
  'Yearly'
);

-- Documents sec 5.1, exclusive. 'Paid', 'Completed' and 'Sent' are explicitly NOT lifecycle values.
create type document_lifecycle_status as enum (
  'Draft',
  'Pending Approval',
  'Pending Signature',
  'Signed',
  'Issued',
  'Void',
  'Expired'
);

-- Documents sec 4 identifier registry (15) plus Call Sheet, which Crew Booking sec 13 declares a generated document of the Documents module. Call Sheet has no prefix in the registry - a gap flagged in mergeNotes.
create type document_type as enum (
  'Quotation',
  'Rental Agreement',
  'Packing List',
  'Delivery Note',
  'Return Report',
  'Inspection Report',
  'Damage Report',
  'Tax Invoice',
  'Receipt',
  'Credit Note',
  'Debit Note',
  'Job Card',
  'Service Report',
  'Incident Report',
  'Insurance Claim',
  'Call Sheet'
);

-- Documents sec 5.3 - tracked per recipient with timestamps, in its own child table, never as a lifecycle value.
create type document_delivery_event as enum (
  'Sent',
  'Viewed',
  'Downloaded'
);

-- Documents sec 9 - each has an owner and an action.
create type document_expiry_type as enum (
  'Quotation',
  'Client ID / passport',
  'Company registration',
  'Insurance policy',
  'Equipment warranty',
  'Tax exemption certificate',
  'Contract'
);

-- Taxes.md Tax Groups. Seed rows for tax_groups.name, not a Postgres enum type - groups are Settings-owned and deactivatable.
create type tax_group_name as enum (
  'Rental Equipment',
  'Product Sales',
  'Membership',
  'Services',
  'Repairs',
  'Insurance',
  'Freight',
  'Miscellaneous'
);

-- Taxes.md Rental Tax Rules.
create type rental_tax_charge_type as enum (
  'Equipment Rental VAT',
  'Damage Charges',
  'Late Fees',
  'Cleaning Charges',
  'Delivery Charges',
  'Pickup Charges'
);

-- Taxes.md Tax Rules, first three bullets.
create type tax_rule_scope as enum (
  'Branch-specific rules',
  'Category-specific rules',
  'Customer-specific rules'
);

-- Taxes.md Tax Rules, last four bullets.
create type tax_rule_type as enum (
  'Tax exemptions',
  'Zero-rated transactions',
  'Tax-inclusive pricing',
  'Tax-exclusive pricing'
);

-- Taxes.md VAT Configuration.
create type vat_pricing_mode as enum (
  'Inclusive Pricing',
  'Exclusive Pricing'
);

-- 03 Core Modules/Payments.md sec 5.6 - CN- corrects an overstated invoice, DN- an understated one.
create type credit_debit_note_type as enum (
  'Credit Note',
  'Debit Note'
);

-- Forward-only state of an accounting period (Finance/Fiscal Year.md). Periods are closed and locked, never deleted.
create type accounting_period_status as enum (
  'Open',
  'Closing',
  'Closed',
  'Locked'
);

-- Fiscal Year.md - Nepali is the default, Gregorian optional.
create type fiscal_calendar_basis as enum (
  'Nepali Fiscal Year',
  'Gregorian Fiscal Year'
);

-- Currencies.md Pricing Rules.
create type fx_pricing_rule as enum (
  'Lock exchange rate at quotation',
  'Lock exchange rate at invoice',
  'Live exchange rate option'
);

-- Where a stored FX rate came from (Currencies.md). On automatic failure the system keeps the most recent verified rate and raises an alert - rate rows are never overwritten.
create type exchange_rate_source as enum (
  'Nepal Rastra Bank (NRB)',
  'Manual Entry',
  'Custom API'
);

-- Currencies.md Default Supported Currencies. Seed rows for currencies.iso_code, NOT a Postgres enum - currencies are enabled/disabled in Settings and new ones must not need a deploy.
create type supported_currency as enum (
  'NPR',
  'USD',
  'EUR',
  'GBP',
  'INR',
  'CNY',
  'JPY',
  'SGD',
  'HKD',
  'AED',
  'AUD',
  'CAD'
);

-- Cases.md sec 5.1. Damage and Missing are values here, never separate tables - Damage Workflow.md and Missing Items.md both name Cases.md as primary spec and say the tab only preselects a chip on the same screen.
create type case_type as enum (
  'Damage',
  'Missing',
  'Theft',
  'Dispute',
  'Vendor'
);

-- Cases.md sec 8.1, in the order the spec table lists them. Forward-only; reversal needs manager approval and writes to audit (Relationships.md cross-row constraints). Exclusive - flags never collapse into this column.
create type case_status as enum (
  'Open',
  'Under Review',
  'Awaiting Decision',
  'In Progress',
  'Resolved',
  'Closed',
  'Cancelled'
);

-- Cases.md sec 8.2. Reports call the same axis 'Severity' (Damage Reports.md filter list) - one column, two labels. Activity Logs.md defines a five-value Severity including 'Informational'; that is the audit-log severity, a different enum in the admin domain, and must not be merged into this one.
create type case_priority as enum (
  'Critical',
  'High',
  'Medium',
  'Low'
);

-- Union of the five per-type sets in Cases.md sec 5.2. Legality is by (case_type, disposition) pair, not by the enum. 'Escalated' (Dispute) and 'Escalate' (Vendor) are two distinct spec strings and are both kept verbatim - do not fold them. 'Police Report' is deliberately absent: Cases.md sec 5.2 states it is a flag, not a disposition.
create type case_disposition as enum (
  'Repair — send to Maintenance',
  'Charge Client',
  'Warranty Claim',
  'Insurance Claim',
  'Write Off',
  'Found',
  'Client Returned',
  'Replace Item',
  'Charge Upheld',
  'Partially Waived',
  'Fully Waived',
  'Escalated',
  'Recover from Partner',
  'Absorb',
  'Escalate'
);

-- Damage Reports.md sec Counterparty, which draws from Cases data. 'Internal' is the value that makes counterparty_id nullable.
create type counterparty_type as enum (
  'Client',
  'Rental Partner',
  'Vendor',
  'Insurance',
  'Internal'
);

-- Cases.md sec 5.3. Overlays that coexist with status, never counted into the status chip reconciliation, never rendered in the Disposition column. Disjoint from case_disposition by construction.
create type case_flag as enum (
  'Under Investigation',
  'Legal',
  'Police Report',
  'Insurance Notified'
);

-- The six terms of the Cases.md sec 7.3 allocation equation, verbatim.
create type allocation_bucket as enum (
  'Charged to Client',
  'Deposit Applied',
  'Insurance Claimed',
  'Warranty Covered',
  'Recovered from Partner',
  'Absorbed'
);

-- Foundation sec 10 Audit contract - the six event classes the log must capture. Stored as a column because RLS masks money-movement rows from Warehouse.
create type audit_event_class as enum (
  'status change',
  'money movement',
  'discount',
  'override',
  'session',
  'cancellation'
);

-- Six categories from Audit Logs sec Audit Categories, plus Uncategorised so category totals always reconcile to the event total (Settings sec 26.2).
create type audit_category as enum (
  'Authentication',
  'Users',
  'Rentals',
  'Inventory',
  'Finance',
  'Administration',
  'Uncategorised'
);

-- Activity Logs sec Modules, verbatim.
create type audit_module as enum (
  'Today Operations',
  'Rentals',
  'Operations',
  'Inventory',
  'Clients',
  'Calendar',
  'Finance',
  'Settings',
  'Authentication',
  'API',
  'Background Jobs'
);

-- Activity Logs sec Action Types, verbatim and in spec order.
create type audit_action as enum (
  'Login',
  'Logout',
  'Create',
  'Update',
  'Delete',
  'Restore',
  'Archive',
  'Approve',
  'Reject',
  'Export',
  'Import',
  'Print',
  'Download',
  'Upload',
  'Payment',
  'Refund',
  'Booking Created',
  'Booking Cancelled',
  'Maintenance Created',
  'Case Created',
  'Permission Changed',
  'Password Changed'
);

-- Activity Logs sec Status.
create type audit_status as enum (
  'Success',
  'Warning',
  'Failed',
  'Blocked',
  'Pending'
);

-- Activity Logs sec Severity; same ladder as the Audit Settings alert priority.
create type audit_severity as enum (
  'Critical',
  'High',
  'Medium',
  'Low',
  'Informational'
);

-- Audit Logs sec Audit Configuration.
create type audit_granularity as enum (
  'Minimal',
  'Standard',
  'Detailed',
  'Forensic'
);

-- Audit Logs sec Retention Policies.
create type retention_period as enum (
  '90 Days',
  '1 Year',
  '3 Years',
  '5 Years',
  '7 Years',
  '10 Years',
  'Forever'
);

-- Device class recorded on activity logs and trusted-device records (Activity Logs sec Device Analysis / Security Settings.md).
create type device_type as enum (
  'Desktop',
  'Mobile',
  'Tablet'
);

-- Authentication sec 3 table rows; each carries its own session lifetime and idle behaviour.
create type session_surface as enum (
  'Desktop (office)',
  'Tablet (warehouse, shared)',
  'Phone (personal)'
);

-- Foundation sec 08, the canonical locked six. Seeds roles.system_role; custom roles carry NULL here.
create type system_role as enum (
  'Owner',
  'Manager',
  'Warehouse',
  'Billing',
  'Accounts',
  'Viewer'
);

-- Permissions Matrix sec Role Hierarchy. Display ladder for the org chart; it does NOT define the role vocabulary - roles.hierarchy_rank carries the ordering.
create type role_hierarchy_level as enum (
  'Owner',
  'Director',
  'System Administrator',
  'Managers',
  'Supervisors',
  'Staff',
  'Viewer'
);

-- Permissions Matrix sec Permission Presets. Applying one rewrites every role_permissions row for the role.
create type permission_preset as enum (
  'No Access',
  'Read Only',
  'Operator',
  'Supervisor',
  'Manager',
  'Administrator',
  'Custom'
);

-- Permissions Matrix sec Permission Columns. Each is controlled independently - hence one row per cell, never a bitmask.
create type permission_column as enum (
  'View',
  'Create',
  'Edit',
  'Approve',
  'Delete',
  'Restore',
  'Export',
  'Print',
  'Manage',
  'Admin'
);

-- Users & Roles sec Permission Levels - the summary shown on a user profile. DERIVED from role_permissions rows; never a stored column.
create type permission_level as enum (
  'No Access',
  'View',
  'Create',
  'Edit',
  'Approve',
  'Delete',
  'Export'
);

-- Permissions Matrix sec Financial Permissions. Never granted to a warehouse role.
create type financial_permission as enum (
  'Purchase Cost',
  'Selling Price',
  'Rental Cost',
  'Profit',
  'Gross Margin',
  'ROI',
  'Depreciation',
  'Salary',
  'Vendor Cost',
  'Tax Details'
);

-- Permissions Matrix sec Approval Permissions (10). Superset of the Users & Roles list of 6; the 6 are all contained here.
create type approval_permission as enum (
  'Booking Approval',
  'Discount Approval',
  'Expense Approval',
  'Purchase Approval',
  'Refund Approval',
  'Maintenance Approval',
  'Case Resolution',
  'Inventory Write-off',
  'Price Change',
  'User Creation'
);

-- Permissions Matrix sec Approval Limits (4 bands). UI presets over the configurable numeric user_approval_authorities.limit_amount - the band itself is never stored.
create type approval_limit_band as enum (
  'Up to Rs 5,000',
  'Up to Rs 25,000',
  'Up to Rs 100,000',
  'Unlimited'
);

-- Permissions Matrix sec Branch Restrictions.
create type branch_scope as enum (
  'All Branches',
  'Assigned Branch',
  'Selected Branches'
);

-- Permissions Matrix sec Warehouse Restrictions.
create type warehouse_scope as enum (
  'All Warehouses',
  'Assigned Warehouse',
  'Selected Warehouses'
);

-- Permissions Matrix sec Data Scope.
create type data_scope as enum (
  'Own Records',
  'Department Records',
  'Branch Records',
  'Warehouse Records',
  'All Records'
);

-- Permissions Matrix sec Time Restrictions.
create type time_restriction as enum (
  'Office Hours',
  'Shift Hours',
  'Custom Schedule',
  '24×7'
);

-- Permissions Matrix sec Device Restrictions.
create type device_restriction as enum (
  'Desktop Only',
  'Mobile Only',
  'Tablet Only',
  'Approved Devices Only'
);

-- Permissions Matrix sec IP Restrictions.
create type ip_restriction as enum (
  'Office Network',
  'VPN',
  'Anywhere',
  'Custom IP Range'
);

-- Permissions Matrix sec API Permissions.
create type api_permission as enum (
  'Read',
  'Write',
  'Webhooks',
  'AI Access',
  'Integration Management'
);

-- Branch Management sec Branch Cards colour-coded status. Archived is terminal.
create type branch_status as enum (
  'Active',
  'Inactive',
  'Under Setup',
  'Archived'
);

-- Teams & Departments: teams and departments are archived, never deleted, and a department cannot be archived while employees are assigned.
create type org_unit_status as enum (
  'Active',
  'Archived'
);

-- Sequence Summary names Active and Archived; the alert list names Disabled Sequence. All three kept - Disabled halts generation reversibly, Archived is terminal.
create type numbering_sequence_status as enum (
  'Active',
  'Disabled',
  'Archived'
);

-- Numbering Sequences sec Reset Rules. The Nepali FY boundary is computed from the AD value; no BS date is stored.
create type sequence_reset_rule as enum (
  'Never',
  'Daily',
  'Monthly',
  'Calendar Year',
  'Nepali Fiscal Year',
  'Gregorian Fiscal Year',
  'Manual'
);

-- Numbering Sequences sec Branch Rules.
create type sequence_branch_rule as enum (
  'Global Sequence',
  'Separate Sequence Per Branch',
  'Separate Sequence Per Warehouse'
);

-- Numbering Sequences sec Number Format. Ordered list held in numbering_sequences.format_components.
create type number_format_component as enum (
  'PREFIX',
  'YEAR',
  'MONTH',
  'DAY',
  'BRANCH CODE',
  'WAREHOUSE CODE',
  'CUSTOM TEXT',
  'AUTO NUMBER'
);

-- Numbering Sequences sec Default System Sequences - the 18 seeded prefixes. Seed list, not a column type; numbering_sequences.prefix is free text with a uniqueness constraint. BR- is retired.
create type default_system_sequence_prefix as enum (
  'BK',
  'EQ',
  'CL',
  'MT',
  'CASE',
  'INV',
  'PAY',
  'EXP',
  'DOC',
  'BND',
  'MEM',
  'PUR',
  'TRF',
  'SR',
  'COUP',
  'DISC',
  'AUD',
  'LOG'
);

-- Version History sec 2.1. Discriminator on automation_artefacts.
create type artefact_type as enum (
  'Workflow',
  'Business Rule',
  'Template',
  'API Integration',
  'Scheduled Job',
  'Event Trigger',
  'AI Configuration'
);

-- Version History sec 2.2 - six states replacing v3.0's eight. Restored and Rollback deleted as states; Deprecated became a flag. SHARED with template_variant_versions because Communication Templates sec 0 says it 'does not define a second version model'.
create type version_state as enum (
  'Draft',
  'In Review',
  'Published',
  'Superseded',
  'Archived',
  'Failed'
);

-- Scheduled-job chain ordering only; null for a plain artefact reference.
create type dependency_mode as enum (
  'parent',
  'child',
  'sequential',
  'parallel'
);

-- Discriminates Event Trigger artefacts from Scheduled Job artefacts.
create type trigger_type as enum (
  'event',
  'schedule'
);

-- Declared per job, never defaulted silently. Resolved against the Date Engine holiday calendar.
create type holiday_behaviour as enum (
  'skip',
  'run'
);

-- Declared per job. Two concurrent runs of one job is a corruption risk.
create type overlap_behaviour as enum (
  'skip',
  'queue',
  'kill'
);

-- Version History: environments reduced from four to two. Development/Testing/Staging/Production retired. No third value may ever be represented.
create type environment as enum (
  'Sandbox',
  'Live'
);

-- Logs sec 3. Exactly five, exhaustive and exclusive: Executions = Succeeded + Failed + Cancelled + Timed out + Running. 'Retrying' explicitly removed - it is attempt_no, a field.
create type execution_status as enum (
  'Running',
  'Succeeded',
  'Failed',
  'Cancelled',
  'Timed out'
);

-- 'retry of <execution ID>' is expressed as kind = retry plus retry_of_execution_id.
create type execution_trigger_kind as enum (
  'event',
  'schedule',
  'manual',
  'API',
  'retry'
);

-- Sandbox replay is the default. Live replay is Owner-only and requires a reason of at least 10 characters.
create type replay_mode as enum (
  'Sandbox replay',
  'Dry run',
  'Live replay'
);

-- Logs sec 9. Named automation_error_class to avoid collision with delivery_error_class, which is a different vocabulary on a different table.
create type automation_error_class as enum (
  'validation',
  'API',
  'timeout',
  'permission',
  'network',
  'AI',
  'data',
  'internal'
);

-- Automation Center sec 2. Tier 3 may never be inserted on a step - Tier 3 actions must be impossible from any node. The value exists so the constraint is expressible.
create type automation_tier as enum (
  'Tier 1',
  'Tier 2',
  'Tier 3'
);

-- Automation Center sec 3. Eight, exclusive. Deliberately NOT the same vocabulary as execution_status - see mergeNotes.
create type queue_state as enum (
  'Waiting',
  'Running',
  'Retrying',
  'Paused',
  'Completed',
  'Failed',
  'Cancelled',
  'Timed Out'
);

-- API sec 2. Payments and Communication are the two categories where cross-provider fallback is forbidden.
create type integration_category as enum (
  'Communication',
  'Payments',
  'Accounting',
  'Storage',
  'Calendar',
  'AI',
  'Documents',
  'Custom'
);

-- API. Reconciliation: Healthy + Warning + Error + Disabled = Integrations. NULL is a real state meaning 'Never tested' - a new integration has no health until a check has run.
create type integration_health as enum (
  'Healthy',
  'Warning',
  'Error',
  'Disabled'
);

-- API. Used on integration_request_logs.method.
create type http_method as enum (
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE'
);

-- Incoming endpoints each carry their own signing secret; outgoing are HMAC-signed over the body.
create type webhook_direction as enum (
  'Incoming',
  'Outgoing'
);

-- Automation Platform Templates sec 6 - eleven, matching the modules the OS actually has. 'Marketing' and 'AI' explicitly removed as categories.
create type automation_template_category as enum (
  'Rentals',
  'Inventory',
  'Finance',
  'Clients',
  'Maintenance',
  'Reports',
  'Communication',
  'Staff',
  'Administration',
  'Integrations',
  'Custom'
);

-- Official + Company = Templates available. There is no Community source, and no rating, review, download count or trending concept.
create type template_source as enum (
  'Official',
  'Company'
);

-- Automation Platform Templates sec 7. Distinct from version_state - this is the template artefact's own lifecycle.
create type template_status as enum (
  'Draft',
  'Published',
  'Deprecated',
  'Archived'
);

-- Install-time input types for automation templates. Reference targets: client type, equipment category, role, integration.
create type template_variable_type as enum (
  'number',
  'text',
  'duration',
  'money',
  'list',
  'reference'
);

-- Surfaced on a name or trigger conflict. Never a silent duplicate.
create type install_conflict_resolution as enum (
  'Replace',
  'Install alongside',
  'Cancel'
);

-- Version History deployment history.
create type deployment_result as enum (
  'Succeeded',
  'Failed',
  'Rolled back'
);

-- Approval Workflows. Archived is terminal.
create type approval_workflow_status as enum (
  'Draft',
  'Active',
  'Paused',
  'Archived'
);

-- Approval Workflows - the five category headings.
create type approval_category as enum (
  'Rental',
  'Finance',
  'Inventory',
  'Operations',
  'Administration'
);

-- Approval Workflows trigger list.
create type approval_trigger as enum (
  'Booking Created',
  'Discount Requested',
  'Expense Submitted',
  'Case Created',
  'Maintenance Requested',
  'Asset Transfer',
  'Purchase Request',
  'Refund Request',
  'Custom Event'
);

-- Approval Workflows.
create type approval_level_mode as enum (
  'Parallel Approval',
  'Sequential Approval',
  'Conditional Approval'
);

-- Approval Workflows. Escalated returns to Pending at a higher level; the other four are terminal.
create type approval_status as enum (
  'Pending',
  'Approved',
  'Rejected',
  'Cancelled',
  'Expired',
  'Escalated'
);

-- Approval Workflows - one row per action taken.
create type approval_action as enum (
  'Approve',
  'Reject',
  'Return for Revision',
  'Cancel',
  'Auto Approve',
  'Auto Reject',
  'Escalate'
);

-- Delivery sec 2. Mandatory on every template and every attempt; drives which metrics apply, which retries are safe, and which traffic is excluded from engagement rates.
create type message_class as enum (
  'Transactional',
  'Reminder',
  'Marketing',
  'Authentication'
);

-- Unified Inbox sec 10, per template, replacing the blanket 'automatically sends' list. The rule behind it: anything asserting the client owes money, or making a claim against them, is reviewed by a person before it leaves.
create type send_policy as enum (
  'may auto-send on the triggering event',
  'draft queued for review by default',
  'always draft',
  'always draft and consent-gated'
);

-- Communication Settings, 'Notification Templates ? Categories'. Kept separate from automation_template_category - see mergeNotes.
create type notification_template_category as enum (
  'Rentals',
  'Finance',
  'Operations',
  'Customer',
  'Staff'
);

-- Communication Templates sec 3 variable registry.
create type variable_type as enum (
  'text',
  'number',
  'money',
  'date',
  'reference',
  'link'
);

-- Communication Templates sec 2. Hindi and 'Custom' from v3.0 are dropped.
create type template_language as enum (
  'English',
  'Nepali'
);

-- A field on the WhatsApp variant, not a label, because it drives both pricing and the consent requirement. Also the WhatsApp conversation billing category.
create type meta_template_category as enum (
  'Utility',
  'Marketing',
  'Authentication'
);

-- Meta's answer, independent of internal approval. Both must pass before a WhatsApp variant can send.
create type meta_approval_state as enum (
  'Approved',
  'Pending',
  'Rejected',
  'Paused'
);

-- GSM-7 (Latin) 160 chars per segment; UCS-2 (Devanagari) 70 chars. Determines the segment budget.
create type sms_encoding as enum (
  'GSM-7',
  'UCS-2'
);

-- Explicit on every message record; the viewer renders sender and recipient from it, never from whichever address was handy.
create type message_direction as enum (
  'inbound',
  'outbound'
);

-- Notifications sec 6. Partially delivered = primary failed, fallback succeeded.
create type notification_status as enum (
  'Delivered',
  'Partially delivered',
  'Failed',
  'Draft',
  'Scheduled',
  'Cancelled'
);

-- Notifications sec 2.2 - the six channel-policy rows. Marketing and OTP are explicitly NOT notification types.
create type notification_type as enum (
  'Booking confirmed',
  'Pickup / return reminder',
  'Invoice / receipt',
  'Late return',
  'Damage / missing',
  'Internal alerts'
);

-- Notifications sec 9, spec casing preserved verbatim.
create type notification_schedule_kind as enum (
  'Immediate',
  'scheduled',
  'event-triggered',
  'workflow-triggered'
);

-- Delivery sec 3. Processing folded into Queued, Retrying removed (a retry is a new attempt), Replied moved out to the conversation. Expired is kept as distinct from failure because WhatsApp messages genuinely expire undelivered.
create type attempt_status as enum (
  'Created',
  'Queued',
  'Sent',
  'Delivered',
  'Read',
  'Clicked',
  'Failed',
  'Expired'
);

-- Delivery sec 9 - causes handled distinctly because the fix differs.
create type delivery_error_class as enum (
  'invalid recipient',
  'outside session window',
  'template not approved',
  'suppressed',
  'rate limited',
  'quality throttled',
  'gateway error',
  'timeout',
  'insufficient balance'
);

-- Only Cancel, Pause and Completed are named verbatim in Broadcasts sec 9.1/sec 10; the builder states are derived from the six-step builder and the send lifecycle. There is deliberately no Rollback and no unsend.
create type campaign_status as enum (
  'Draft',
  'Awaiting approval',
  'Scheduled',
  'Sending',
  'Paused',
  'Completed',
  'Cancelled'
);

-- Broadcasts sec 10, spec casing preserved verbatim.
create type campaign_schedule_kind as enum (
  'Immediate',
  'scheduled',
  'recurring'
);

-- Broadcasts sec 9.1 auto-pause triggers.
create type campaign_pause_reason as enum (
  'bounce rate above threshold',
  'WhatsApp quality drop',
  'opt-out rate above threshold',
  'provider errors above threshold'
);

-- Taxes.md.
create type tax_pricing_mode as enum (
  'Inclusive Pricing',
  'Exclusive Pricing'
);

-- Fixed eight. 'Bank reconciliation completed' is unsatisfiable under ruling A (no general ledger, no bank statement import) - retained verbatim and flagged.
create type period_close_checklist_item as enum (
  'All invoices finalized',
  'Outstanding payments reviewed',
  'Expenses posted',
  'Payroll completed',
  'VAT verified',
  'Inventory adjustments completed',
  'Depreciation calculated',
  'Bank reconciliation completed'
);

-- Currencies.md.
create type exchange_rate_mode as enum (
  'Manual',
  'Automatic'
);

-- Organization.md. NPR default.
create type currency_code as enum (
  'NPR',
  'USD',
  'EUR',
  'INR'
);

-- Organization.md. English default.
create type system_language as enum (
  'English',
  'Nepali'
);

-- Users & Roles.md display vocabulary, kept exact. Online is NEVER stored - see the CHECK on users.account_status.
create type user_account_status as enum (
  'Online',
  'Offline',
  'Inactive',
  'Suspended',
  'Locked'
);

-- Users & Roles.md. Distinct from health_band (Maintenance) - two different band tables that must not be conflated.
create type performance_band as enum (
  '95–100 Outstanding',
  '85–94 Excellent',
  '70–84 Good',
  '60–69 Fair',
  'Below 60 Needs Improvement'
);

-- Security Settings.md, lowercase as written.
create type device_trust_status as enum (
  'trusted',
  'untrusted',
  'blocked'
);

-- CONFLICT RESOLVED: Business Hours.md lines 258-263 lists six; Teams & Departments.md lines 314-322 omits Evening. Business Hours owns shift definition, so six wins.
create type shift_type as enum (
  'Morning',
  'Afternoon',
  'Evening',
  'Night',
  'Custom',
  'Rotating'
);

-- Business Hours.md.
create type hours_scope as enum (
  'Company Default Hours',
  'Branch Hours',
  'Warehouse Hours',
  'Pickup Counter',
  'Return Counter',
  'Office Hours',
  'Emergency Support Hours'
);

-- Week starts Sunday. Saturday is the default weekly holiday, overridable per branch.
create type weekday as enum (
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
);

-- DERIVED MERGE, flagged: Business Hours.md has four separate sections that all override the weekly grid identically. Modelled as one dated-override table with a type discriminator.
create type calendar_exception_type as enum (
  'Public Holiday',
  'Festival',
  'Maintenance Shutdown',
  'Special Operating Day'
);

-- Business Hours.md.
create type maintenance_shutdown_subtype as enum (
  'Planned Shutdown',
  'Warehouse Closure',
  'Inventory Audit Days',
  'Deep Cleaning Days'
);

-- Business Hours.md.
create type special_operating_day_subtype as enum (
  'Extended Hours',
  'Festival Hours',
  'Emergency Operations',
  'Half-Day Operations'
);

-- Built-in holiday library seed list. Seed data for calendar_exceptions.name, not a stored column type.
create type festival as enum (
  'Dashain',
  'Tihar',
  'Holi',
  'Teej',
  'Chhath',
  'Maha Shivaratri',
  'Janai Purnima',
  'Losar',
  'Maghe Sankranti',
  'Eid',
  'Christmas'
);

-- Security Settings.md. Independent of the hard rule that TOTP is required for Owner and Accounts.
create type two_factor_enforcement as enum (
  'Optional',
  'Required for Managers',
  'Required for Administrators',
  'Required for Everyone'
);

-- Security Settings.md. Retained as the configurable method list; the locked v1 login is phone + PIN with OTP fallback.
create type authentication_method as enum (
  'Email Login',
  'Username Login',
  'Google Login',
  'Microsoft Login',
  'Apple Login',
  'LDAP',
  'Active Directory'
);

-- Security Settings.md.
create type threat_type as enum (
  'Brute-force attacks',
  'Suspicious logins',
  'Impossible travel',
  'Multiple failed logins',
  'Privilege escalation',
  'API abuse',
  'Unusual downloads'
);

-- Backup.md.
create type backup_type as enum (
  'Full Backup',
  'Incremental Backup',
  'Differential Backup',
  'Database Backup',
  'Documents Backup',
  'Images',
  'Videos',
  'Configuration Backup',
  'Audit Log Backup',
  'AI Configuration Backup'
);

-- Backup.md.
create type backup_status as enum (
  'Running',
  'Completed',
  'Failed',
  'Cancelled',
  'Verifying',
  'Restored'
);

-- Backup.md.
create type verification_result as enum (
  'Passed',
  'Warning',
  'Failed'
);

-- Backup.md.
create type backup_frequency as enum (
  'Hourly',
  'Every 6 Hours',
  'Daily',
  'Weekly',
  'Monthly',
  'Manual',
  'Before Update',
  'Before Migration',
  'Before Major Import'
);

-- Backup.md.
create type backup_schedule_status as enum (
  'Enabled',
  'Disabled',
  'Paused'
);

-- Backup.md.
create type backup_destination_provider as enum (
  'Local Storage',
  'NAS',
  'External Drive',
  'AWS S3',
  'Google Drive',
  'Dropbox',
  'OneDrive',
  'Backblaze B2',
  'Wasabi',
  'FTP',
  'SFTP'
);

-- Settings.md sec restore. 'Customers' is the spec's word here even though the product vocabulary elsewhere is Clients - kept exact.
create type restore_scope as enum (
  'Entire System',
  'Database Only',
  'Inventory',
  'Rentals',
  'Customers',
  'Finance',
  'Reports',
  'Documents',
  'Images',
  'Audit Logs',
  'Selected Records'
);

-- Unified Inbox sec 2. WhatsApp, Email and In-App are two-way; SMS is send-mostly.
create type channel_direction as enum (
  'two-way',
  'send-mostly'
);

-- Communication Settings.md. Survives the channel merge as the connection state of the merged row.
create type channel_status as enum (
  'Connected',
  'Disconnected',
  'Testing',
  'Error'
);

-- Email.md sec 3.2.
create type suppression_reason as enum (
  'Hard bounce',
  'Soft bounce',
  'Complaint (spam report)'
);

-- CONFLICT RESOLVED: Unified Inbox.md line 150 vs History.md line 83 (which inserts 'Resolved'). Unified Inbox owns the conversation table and History.md line 27 proposes deleting itself in favour of Inbox saved views. Inbox wins; 'Resolved' becomes the resolved_at timestamp, not a state.
create type conversation_state as enum (
  'Open',
  'Snoozed',
  'Closed',
  'Archived',
  'Spam'
);

-- Unified Inbox sec 11. Targets live in comm_sla_targets, not in code.
create type sla_priority as enum (
  'Standard',
  'Booking in progress',
  'Overdue or damage case'
);

-- History.md sec 6. Call log is a note type, never a channel - there is no telephony integration.
create type internal_note_type as enum (
  'Internal note',
  'Call log'
);

-- Broadcasts.md sec 3, lowercase as written. VIP is not a segment (use membership level); branch/city/province/country filters do not exist in v1.
create type segment_kind as enum (
  'all clients',
  'active (rented in 90 days)',
  'inactive',
  'new (joined in 30 days)',
  'membership level',
  'client type',
  'equipment preference',
  'last rental date',
  'custom tags'
);

-- SMS.md sec 1.1. Gateways cut from six to two.
create type gateway_role as enum (
  'primary',
  'failover'
);

-- Email.md sec 3.1 / WhatsApp.md sec 5. 'Not checked' is a real value, never a green tick.
create type health_status as enum (
  'pass',
  'fail',
  'Not checked'
);

-- Set by Meta. Stored in channel_health_checks.value, not as its own column.
create type whatsapp_quality_rating as enum (
  'High',
  'Medium',
  'Low'
);

-- Unified Inbox sec 11 vs Delivery sec 10 - two different meanings of SLA, disambiguated by this scope rather than by two tables.
create type sla_scope as enum (
  'first response',
  'delivery latency'
);

-- Reports Suite.md. Reports reads these; it never defines a metric.
create type report_source_engine as enum (
  'Financial Engine',
  'Inventory',
  'Status Engine',
  'Expenses',
  'Cases'
);

-- Reports.md.
create type report_period_preset as enum (
  'Today',
  'Yesterday',
  'This Week',
  'Last Week',
  'Last 7 Days',
  'Last 30 Days',
  'This Month',
  'Last Month',
  'This Quarter',
  'Last Quarter',
  'This Fiscal Year',
  'Last Fiscal Year',
  'Custom'
);

-- Reports.md, lowercase as written.
create type comparison_basis as enum (
  'previous period',
  'same period last year',
  'previous fiscal year',
  'custom range',
  'entity versus entity'
);

-- 95-100 - 85-94 - 70-84 - 50-69 - below 50, from Maintenance v2.1 sec 8.2. Exactly one health band table exists across Maintenance, Inventory and Equipment; Inventory Reports' third competing set is rejected.
create type health_band as enum (
  'Excellent',
  'Good',
  'Fair',
  'Poor',
  'Replace'
);

-- Reports Suite.md, lowercase as written.
create type forecast_method as enum (
  'moving average',
  'linear regression',
  'seasonal decomposition'
);

-- Activity Logs.md.
create type activity_status as enum (
  'Success',
  'Warning',
  'Failed',
  'Blocked',
  'Pending'
);

-- Activity Logs.md.
create type activity_severity as enum (
  'Critical',
  'High',
  'Medium',
  'Low',
  'Informational'
);

-- Activity Logs.md.
create type activity_module as enum (
  'Today Operations',
  'Rentals',
  'Operations',
  'Inventory',
  'Clients',
  'Calendar',
  'Finance',
  'Settings',
  'Authentication',
  'API',
  'Background Jobs'
);

-- CONFLICT RESOLVED: Activity Logs.md line 275 lists 'Delete'. Reports Suite.md line 54 overrides it verbatim - 'Nothing in this system is deletable ... The log should read Void, Reverse, Retire, Archive, Cancel. If something genuinely deletes a record, that is a defect the log has surfaced.' Delete removed, the four replacements added.
create type activity_action as enum (
  'Login',
  'Logout',
  'Create',
  'Update',
  'Void',
  'Reverse',
  'Retire',
  'Archive',
  'Cancel',
  'Restore',
  'Approve',
  'Reject',
  'Export',
  'Import',
  'Print',
  'Download',
  'Upload',
  'Payment',
  'Refund',
  'Booking Created',
  'Booking Cancelled',
  'Maintenance Created',
  'Case Created',
  'Permission Changed',
  'Password Changed'
);

-- Activity Logs.md. Same value set as device_type but a different column on a different table.
create type activity_device as enum (
  'Desktop',
  'Mobile',
  'Tablet'
);

-- Activity Logs.md.
create type activity_browser as enum (
  'Chrome',
  'Safari',
  'Edge',
  'Firefox',
  'Other'
);

-- Activity Logs.md.
create type activity_os as enum (
  'Windows',
  'macOS',
  'Linux',
  'Android',
  'iOS'
);

-- Fulfillment.md. The five donut slices must sum to Total Requests.
create type fulfillment_status as enum (
  'Fulfilled',
  'Partial',
  'Unfulfilled',
  'Waiting',
  'Overbooked'
);

-- Fulfillment.md.
create type swap_type as enum (
  'Automatic',
  'Manual',
  'Failed'
);

-- Reports.md, lowercase as written. Deliberately NOT unified with expense_recurrence - different spec, different casing, different owner.
create type schedule_frequency as enum (
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'yearly'
);

-- Reports.md. Scheduled delivery only; manual export uses the wider export_format set.
create type schedule_format as enum (
  'PDF',
  'Excel'
);

-- Reports.md.
create type export_format as enum (
  'PDF',
  'Excel',
  'CSV',
  'JSON',
  'Print'
);

commit;

-- 277 enum types.
