-- ============================================================================
-- 0042_deferred_cross_file_fks.sql — generated 10 Aug 2026 (first real apply)
--
-- The first live apply run (PLAN.md §6.28) failed at 0002 on
-- 'relation "branches" does not exist': the chain's numeric order never
-- matched its dependency order, and nothing had ever actually run it. Every
-- inline FK whose target table is created LATER in the stream was stripped
-- at its declaration site (marker comment left in place) and is added back
-- here, after every table exists — the same deferred cross-file FK pattern
-- 0004's foot-of-file section already established (§4.10), applied
-- mechanically to all remaining cases. Net schema on an empty database is
-- identical; only the moment each constraint attaches moved.
-- ============================================================================

alter table bookings
  add constraint bookings_branch_id_fk
  foreign key (branch_id) references branches (id);

alter table bookings
  add constraint bookings_client_id_fk
  foreign key (client_id) references clients (id);

alter table bookings
  add constraint bookings_contact_id_fk
  foreign key (contact_id) references client_contacts (id);

alter table bookings
  add constraint bookings_authorized_contact_id_fk
  foreign key (authorized_contact_id) references client_contacts (id);

alter table bookings
  add constraint bookings_cancelled_by_fk
  foreign key (cancelled_by) references users (id);

alter table bookings
  add constraint bookings_locked_by_fk
  foreign key (locked_by) references users (id);

alter table bookings
  add constraint bookings_created_by_fk
  foreign key (created_by) references users (id);

alter table bookings
  add constraint bookings_updated_by_fk
  foreign key (updated_by) references users (id);

alter table booking_lines
  add constraint booking_lines_product_id_fk
  foreign key (product_id) references products (id);

alter table booking_lines
  add constraint booking_lines_bundle_id_fk
  foreign key (bundle_id) references bundles (id);

alter table booking_lines
  add constraint booking_lines_supplier_id_fk
  foreign key (supplier_id) references suppliers (id);

alter table booking_lines
  add constraint booking_lines_created_by_fk
  foreign key (created_by) references users (id);

alter table booking_line_units
  add constraint booking_line_units_packed_by_fk
  foreign key (packed_by) references users (id);

alter table booking_line_units
  add constraint booking_line_units_packing_session_id_fk
  foreign key (packing_session_id) references operation_sessions (id);

alter table booking_line_units
  add constraint booking_line_units_handover_session_id_fk
  foreign key (handover_session_id) references operation_sessions (id);

alter table booking_line_units
  add constraint booking_line_units_return_session_id_fk
  foreign key (return_session_id) references operation_sessions (id);

alter table booking_line_units
  add constraint booking_line_units_created_by_fk
  foreign key (created_by) references users (id);

alter table booking_crew_lines
  add constraint booking_crew_lines_crew_member_id_fk
  foreign key (crew_member_id) references users (id);

alter table booking_crew_lines
  add constraint booking_crew_lines_created_by_fk
  foreign key (created_by) references users (id);

alter table booking_transport
  add constraint booking_transport_driver_id_fk
  foreign key (driver_id) references users (id);

alter table booking_transport
  add constraint booking_transport_zero_charge_override_by_fk
  foreign key (zero_charge_override_by) references users (id);

alter table booking_transport
  add constraint booking_transport_created_by_fk
  foreign key (created_by) references users (id);

alter table booking_stage_transitions
  add constraint booking_stage_transitions_branch_id_fk
  foreign key (branch_id) references branches (id);

alter table booking_stage_transitions
  add constraint booking_stage_transitions_approved_by_fk
  foreign key (approved_by) references users (id);

alter table booking_stage_transitions
  add constraint booking_stage_transitions_audit_event_id_fk
  foreign key (audit_event_id) references audit_events (id);

alter table booking_stage_transitions
  add constraint booking_stage_transitions_actor_id_fk
  foreign key (actor_id) references users (id);

alter table booking_flags
  add constraint booking_flags_observed_in_session_id_fk
  foreign key (observed_in_session_id) references operation_sessions (id);

alter table booking_flags
  add constraint booking_flags_cleared_by_fk
  foreign key (cleared_by) references users (id);

alter table booking_flags
  add constraint booking_flags_created_by_fk
  foreign key (created_by) references users (id);

alter table booking_discounts
  add constraint booking_discounts_branch_id_fk
  foreign key (branch_id) references branches (id);

alter table booking_discounts
  add constraint booking_discounts_approver_id_fk
  foreign key (approver_id) references users (id);

alter table booking_discounts
  add constraint booking_discounts_applied_by_fk
  foreign key (applied_by) references users (id);

alter table booking_discounts
  add constraint booking_discounts_coupon_id_fk
  foreign key (coupon_id) references coupons (id);

alter table booking_discounts
  add constraint booking_discounts_audit_event_id_fk
  foreign key (audit_event_id) references audit_events (id);

alter table booking_documents
  add constraint booking_documents_produced_in_session_id_fk
  foreign key (produced_in_session_id) references operation_sessions (id);

alter table booking_documents
  add constraint booking_documents_created_by_fk
  foreign key (created_by) references users (id);

alter table booking_notes
  add constraint booking_notes_created_by_fk
  foreign key (created_by) references users (id);

alter table operation_sessions
  add constraint operation_sessions_started_by_fk
  foreign key (started_by) references users (id);

alter table operation_sessions
  add constraint operation_sessions_completed_by_fk
  foreign key (completed_by) references users (id);

alter table operation_sessions
  add constraint operation_sessions_warehouse_staff_id_fk
  foreign key (warehouse_staff_id) references users (id);

alter table operation_sessions
  add constraint operation_sessions_created_by_fk
  foreign key (created_by) references users (id);

alter table session_line_movements
  add constraint session_line_movements_created_by_fk
  foreign key (created_by) references users (id);

alter table packing_lines
  add constraint packing_lines_packed_by_fk
  foreign key (packed_by) references users (id);

alter table packing_lines
  add constraint packing_lines_created_by_fk
  foreign key (created_by) references users (id);

alter table handover_lines
  add constraint handover_lines_created_by_fk
  foreign key (created_by) references users (id);

alter table return_lines
  add constraint return_lines_inspected_by_fk
  foreign key (inspected_by) references users (id);

alter table return_lines
  add constraint return_lines_created_by_fk
  foreign key (created_by) references users (id);

alter table return_accessory_checks
  add constraint return_accessory_checks_created_by_fk
  foreign key (created_by) references users (id);

alter table damage_findings
  add constraint damage_findings_approved_by_fk
  foreign key (approved_by) references users (id);

alter table damage_findings
  add constraint damage_findings_created_by_fk
  foreign key (created_by) references users (id);

alter table signatures
  add constraint signatures_created_by_fk
  foreign key (created_by) references users (id);

alter table scan_events
  add constraint scan_events_created_by_fk
  foreign key (created_by) references users (id);

alter table scan_sync_conflicts
  add constraint scan_sync_conflicts_resolved_by_fk
  foreign key (resolved_by) references users (id);

alter table evidence_files
  add constraint evidence_files_removed_by_fk
  foreign key (removed_by) references users (id);

alter table evidence_files
  add constraint evidence_files_created_by_fk
  foreign key (created_by) references users (id);

alter table evidence_references
  add constraint evidence_references_bundle_id_fk
  foreign key (bundle_id) references bundles (id);

alter table evidence_references
  add constraint evidence_references_maintenance_id_fk
  foreign key (maintenance_id) references maintenance_records (id);

alter table evidence_references
  add constraint evidence_references_client_id_fk
  foreign key (client_id) references clients (id);

alter table evidence_references
  add constraint evidence_references_created_by_fk
  foreign key (created_by) references users (id);

alter table cleaning_queue_entries
  add constraint cleaning_queue_entries_assigned_to_fk
  foreign key (assigned_to) references users (id);

alter table cleaning_queue_entries
  add constraint cleaning_queue_entries_cleaned_by_fk
  foreign key (cleaned_by) references users (id);

alter table cleaning_queue_entries
  add constraint cleaning_queue_entries_qc_by_fk
  foreign key (qc_by) references users (id);

alter table cleaning_queue_entries
  add constraint cleaning_queue_entries_created_by_fk
  foreign key (created_by) references users (id);

alter table cleaning_task_results
  add constraint cleaning_task_results_created_by_fk
  foreign key (created_by) references users (id);

alter table category_checklist_tasks
  add constraint category_checklist_tasks_created_by_fk
  foreign key (created_by) references users (id);

alter table override_records
  add constraint override_records_approver_user_id_fk
  foreign key (approver_user_id) references users (id);

alter table override_records
  add constraint override_records_audit_event_id_fk
  foreign key (audit_event_id) references audit_events (id);

alter table override_records
  add constraint override_records_created_by_fk
  foreign key (created_by) references users (id);

alter table crew_members
  add constraint crew_members_created_by_fk
  foreign key (created_by) references users (id);

alter table crew_bookings
  add constraint crew_bookings_conflict_override_by_fk
  foreign key (conflict_override_by) references users (id);

alter table crew_bookings
  add constraint crew_bookings_travel_warning_acknowledged_by_fk
  foreign key (travel_warning_acknowledged_by) references users (id);

alter table crew_bookings
  add constraint crew_bookings_created_by_fk
  foreign key (created_by) references users (id);

alter table crew_shoot_days
  add constraint crew_shoot_days_vehicle_id_fk
  foreign key (vehicle_id) references vehicles (id);

alter table crew_shoot_days
  add constraint crew_shoot_days_submitted_by_fk
  foreign key (submitted_by) references users (id);

alter table crew_shoot_days
  add constraint crew_shoot_days_approved_by_fk
  foreign key (approved_by) references users (id);

alter table crew_shoot_days
  add constraint crew_shoot_days_overtime_approved_by_fk
  foreign key (overtime_approved_by) references users (id);

alter table crew_shoot_days
  add constraint crew_shoot_days_created_by_fk
  foreign key (created_by) references users (id);

alter table crew_equipment_assignments
  add constraint crew_equipment_assignments_released_by_fk
  foreign key (released_by) references users (id);

alter table crew_equipment_assignments
  add constraint crew_equipment_assignments_created_by_fk
  foreign key (created_by) references users (id);

alter table crew_documents
  add constraint crew_documents_expiry_acknowledged_by_fk
  foreign key (expiry_acknowledged_by) references users (id);

alter table crew_documents
  add constraint crew_documents_created_by_fk
  foreign key (created_by) references users (id);

alter table crew_leaves
  add constraint crew_leaves_created_by_fk
  foreign key (created_by) references users (id);

alter table inventory_reservations
  add constraint inventory_reservations_product_id_fk
  foreign key (product_id) references products (id);

alter table inventory_reservations
  add constraint inventory_reservations_created_by_fk
  foreign key (created_by) references users (id);

alter table fulfillment_outcomes
  add constraint fulfillment_outcomes_requested_model_id_fk
  foreign key (requested_model_id) references products (id);

alter table fulfillment_outcomes
  add constraint fulfillment_outcomes_substituted_model_id_fk
  foreign key (substituted_model_id) references products (id);

alter table fulfillment_outcomes
  add constraint fulfillment_outcomes_assigned_staff_id_fk
  foreign key (assigned_staff_id) references users (id);

alter table fulfillment_outcomes
  add constraint fulfillment_outcomes_branch_id_fk
  foreign key (branch_id) references branches (id);

alter table fulfillment_outcomes
  add constraint fulfillment_outcomes_warehouse_id_fk
  foreign key (warehouse_id) references warehouses (id);

alter table fulfillment_outcomes
  add constraint fulfillment_outcomes_created_by_fk
  foreign key (created_by) references users (id);

alter table inventory_categories
  add constraint inventory_categories_created_by_fk
  foreign key (created_by) references users (id);

alter table inventory_categories
  add constraint inventory_categories_updated_by_fk
  foreign key (updated_by) references users (id);

alter table suppliers
  add constraint suppliers_created_by_fk
  foreign key (created_by) references users (id);

alter table suppliers
  add constraint suppliers_updated_by_fk
  foreign key (updated_by) references users (id);

alter table products
  add constraint products_created_by_fk
  foreign key (created_by) references users (id);

alter table products
  add constraint products_updated_by_fk
  foreign key (updated_by) references users (id);

alter table containers
  add constraint containers_branch_id_fk
  foreign key (branch_id) references branches (id);

alter table containers
  add constraint containers_warehouse_id_fk
  foreign key (warehouse_id) references warehouses (id);

alter table containers
  add constraint containers_storage_zone_id_fk
  foreign key (storage_zone_id) references storage_zones (id);

alter table containers
  add constraint containers_created_by_fk
  foreign key (created_by) references users (id);

alter table containers
  add constraint containers_updated_by_fk
  foreign key (updated_by) references users (id);

alter table product_units
  add constraint product_units_branch_id_fk
  foreign key (branch_id) references branches (id);

alter table product_units
  add constraint product_units_warehouse_id_fk
  foreign key (warehouse_id) references warehouses (id);

alter table product_units
  add constraint product_units_storage_zone_id_fk
  foreign key (storage_zone_id) references storage_zones (id);

alter table product_units
  add constraint product_units_retired_by_fk
  foreign key (retired_by) references users (id);

alter table product_units
  add constraint product_units_created_by_fk
  foreign key (created_by) references users (id);

alter table product_units
  add constraint product_units_updated_by_fk
  foreign key (updated_by) references users (id);

alter table accessories
  add constraint accessories_created_by_fk
  foreign key (created_by) references users (id);

alter table accessories
  add constraint accessories_updated_by_fk
  foreign key (updated_by) references users (id);

alter table product_compatibilities
  add constraint product_compatibilities_created_by_fk
  foreign key (created_by) references users (id);

alter table bundles
  add constraint bundles_created_by_fk
  foreign key (created_by) references users (id);

alter table bundles
  add constraint bundles_updated_by_fk
  foreign key (updated_by) references users (id);

alter table bundle_items
  add constraint bundle_items_created_by_fk
  foreign key (created_by) references users (id);

alter table stock_transfers
  add constraint stock_transfers_source_branch_id_fk
  foreign key (source_branch_id) references branches (id);

alter table stock_transfers
  add constraint stock_transfers_source_warehouse_id_fk
  foreign key (source_warehouse_id) references warehouses (id);

alter table stock_transfers
  add constraint stock_transfers_source_zone_id_fk
  foreign key (source_zone_id) references storage_zones (id);

alter table stock_transfers
  add constraint stock_transfers_destination_branch_id_fk
  foreign key (destination_branch_id) references branches (id);

alter table stock_transfers
  add constraint stock_transfers_destination_warehouse_id_fk
  foreign key (destination_warehouse_id) references warehouses (id);

alter table stock_transfers
  add constraint stock_transfers_destination_zone_id_fk
  foreign key (destination_zone_id) references storage_zones (id);

alter table stock_transfers
  add constraint stock_transfers_requested_by_fk
  foreign key (requested_by) references users (id);

alter table stock_transfers
  add constraint stock_transfers_approved_by_fk
  foreign key (approved_by) references users (id);

alter table stock_transfers
  add constraint stock_transfers_dispatched_by_fk
  foreign key (dispatched_by) references users (id);

alter table stock_transfers
  add constraint stock_transfers_received_by_fk
  foreign key (received_by) references users (id);

alter table stock_transfers
  add constraint stock_transfers_cancelled_by_fk
  foreign key (cancelled_by) references users (id);

alter table stock_transfers
  add constraint stock_transfers_created_by_fk
  foreign key (created_by) references users (id);

alter table stock_transfers
  add constraint stock_transfers_updated_by_fk
  foreign key (updated_by) references users (id);

alter table maintenance_records
  add constraint maintenance_records_performed_by_fk
  foreign key (performed_by) references users (id);

alter table maintenance_records
  add constraint maintenance_records_approved_by_fk
  foreign key (approved_by) references users (id);

alter table maintenance_records
  add constraint maintenance_records_created_by_fk
  foreign key (created_by) references users (id);

alter table maintenance_records
  add constraint maintenance_records_updated_by_fk
  foreign key (updated_by) references users (id);

alter table depreciation_logs
  add constraint depreciation_logs_calculated_by_fk
  foreign key (calculated_by) references users (id);

alter table purchase_requests
  add constraint purchase_requests_requested_by_fk
  foreign key (requested_by) references users (id);

alter table purchase_requests
  add constraint purchase_requests_approved_by_fk
  foreign key (approved_by) references users (id);

alter table purchase_requests
  add constraint purchase_requests_created_by_fk
  foreign key (created_by) references users (id);

alter table purchase_requests
  add constraint purchase_requests_updated_by_fk
  foreign key (updated_by) references users (id);

alter table stock_audits
  add constraint stock_audits_branch_id_fk
  foreign key (branch_id) references branches (id);

alter table stock_audits
  add constraint stock_audits_warehouse_id_fk
  foreign key (warehouse_id) references warehouses (id);

alter table stock_audits
  add constraint stock_audits_audited_by_fk
  foreign key (audited_by) references users (id);

alter table stock_audits
  add constraint stock_audits_created_by_fk
  foreign key (created_by) references users (id);

alter table stock_audits
  add constraint stock_audits_updated_by_fk
  foreign key (updated_by) references users (id);

alter table stock_audit_items
  add constraint stock_audit_items_scanned_by_fk
  foreign key (scanned_by) references users (id);

alter table product_documents
  add constraint product_documents_created_by_fk
  foreign key (created_by) references users (id);

alter table clients
  add constraint clients_assigned_staff_id_fk
  foreign key (assigned_staff_id) references users (id);

alter table clients
  add constraint clients_deactivated_by_fk
  foreign key (deactivated_by) references users (id);

alter table clients
  add constraint clients_created_by_fk
  foreign key (created_by) references users (id);

alter table client_contacts
  add constraint client_contacts_deactivated_by_fk
  foreign key (deactivated_by) references users (id);

alter table client_contacts
  add constraint client_contacts_created_by_fk
  foreign key (created_by) references users (id);

alter table client_flags
  add constraint client_flags_created_by_fk
  foreign key (created_by) references users (id);

alter table client_flags
  add constraint client_flags_removed_by_fk
  foreign key (removed_by) references users (id);

alter table client_merges
  add constraint client_merges_created_by_fk
  foreign key (created_by) references users (id);

alter table membership_plans
  add constraint membership_plans_created_by_fk
  foreign key (created_by) references users (id);

alter table client_memberships
  add constraint client_memberships_created_by_fk
  foreign key (created_by) references users (id);

alter table membership_limit_breaches
  add constraint membership_limit_breaches_approved_by_fk
  foreign key (approved_by) references users (id);

alter table client_commercial_overrides
  add constraint client_commercial_overrides_approver_user_id_fk
  foreign key (approver_user_id) references users (id);

alter table client_commercial_overrides
  add constraint client_commercial_overrides_created_by_fk
  foreign key (created_by) references users (id);

alter table portal_users
  add constraint portal_users_invited_by_staff_id_fk
  foreign key (invited_by_staff_id) references users (id);

alter table client_documents
  add constraint client_documents_uploaded_by_staff_id_fk
  foreign key (uploaded_by_staff_id) references users (id);

alter table client_documents
  add constraint client_documents_verified_by_fk
  foreign key (verified_by) references users (id);

alter table client_tax_profiles
  add constraint client_tax_profiles_created_by_fk
  foreign key (created_by) references users (id);

alter table client_change_requests
  add constraint client_change_requests_reviewed_by_fk
  foreign key (reviewed_by) references users (id);

alter table client_channel_identities
  add constraint client_channel_identities_created_by_fk
  foreign key (created_by) references users (id);

alter table client_marketing_consents
  add constraint client_marketing_consents_opt_in_actor_id_fk
  foreign key (opt_in_actor_id) references users (id);

alter table bank_accounts
  add constraint bank_accounts_created_by_fk
  foreign key (created_by) references users (id);

alter table bank_accounts
  add constraint bank_accounts_updated_by_fk
  foreign key (updated_by) references users (id);

alter table fiscal_periods
  add constraint fiscal_periods_closed_by_fk
  foreign key (closed_by) references users (id);

alter table fiscal_periods
  add constraint fiscal_periods_created_by_fk
  foreign key (created_by) references users (id);

alter table invoices
  add constraint invoices_branch_id_fk
  foreign key (branch_id) references branches (id);

alter table invoices
  add constraint invoices_discount_approved_by_fk
  foreign key (discount_approved_by) references users (id);

alter table invoices
  add constraint invoices_voided_by_fk
  foreign key (voided_by) references users (id);

alter table invoices
  add constraint invoices_created_by_fk
  foreign key (created_by) references users (id);

alter table invoices
  add constraint invoices_updated_by_fk
  foreign key (updated_by) references users (id);

alter table invoice_lines
  add constraint invoice_lines_discount_approved_by_fk
  foreign key (discount_approved_by) references users (id);

alter table payments
  add constraint payments_branch_id_fk
  foreign key (branch_id) references branches (id);

alter table payments
  add constraint payments_received_by_fk
  foreign key (received_by) references users (id);

alter table payment_reversals
  add constraint payment_reversals_reversed_by_fk
  foreign key (reversed_by) references users (id);

alter table payment_reversals
  add constraint payment_reversals_approved_by_fk
  foreign key (approved_by) references users (id);

alter table security_deposits
  add constraint security_deposits_branch_id_fk
  foreign key (branch_id) references branches (id);

alter table security_deposits
  add constraint security_deposits_created_by_fk
  foreign key (created_by) references users (id);

alter table security_deposits
  add constraint security_deposits_updated_by_fk
  foreign key (updated_by) references users (id);

alter table deposit_movements
  add constraint deposit_movements_handled_by_fk
  foreign key (handled_by) references users (id);

alter table expense_categories
  add constraint expense_categories_created_by_fk
  foreign key (created_by) references users (id);

alter table expense_categories
  add constraint expense_categories_updated_by_fk
  foreign key (updated_by) references users (id);

alter table expenses
  add constraint expenses_branch_id_fk
  foreign key (branch_id) references branches (id);

alter table expenses
  add constraint expenses_created_by_fk
  foreign key (created_by) references users (id);

alter table expenses
  add constraint expenses_updated_by_fk
  foreign key (updated_by) references users (id);

alter table expense_reversals
  add constraint expense_reversals_reversed_by_fk
  foreign key (reversed_by) references users (id);

alter table coupons
  add constraint coupons_created_by_fk
  foreign key (created_by) references users (id);

alter table coupons
  add constraint coupons_updated_by_fk
  foreign key (updated_by) references users (id);

alter table coupon_redemptions
  add constraint coupon_redemptions_redeemed_by_fk
  foreign key (redeemed_by) references users (id);

alter table tax_ledgers
  add constraint tax_ledgers_branch_id_fk
  foreign key (branch_id) references branches (id);

alter table branches
  add constraint branches_created_by_fk
  foreign key (created_by) references users (id);

alter table branches
  add constraint branches_updated_by_fk
  foreign key (updated_by) references users (id);

alter table warehouses
  add constraint warehouses_created_by_fk
  foreign key (created_by) references users (id);

alter table warehouses
  add constraint warehouses_updated_by_fk
  foreign key (updated_by) references users (id);

alter table storage_zones
  add constraint storage_zones_created_by_fk
  foreign key (created_by) references users (id);

alter table storage_zones
  add constraint storage_zones_updated_by_fk
  foreign key (updated_by) references users (id);
