/**
 * Babin Rentals OS — Database Schema Types
 * Generated & typed for migrations 0001 through 0012; hand-corrected to
 * 0015_canonical_six_stages.sql's stage model on 10 Aug 2026 (Master Data Map
 * v2.1 audit) pending a real `db:types` regeneration.
 * Adheres strictly to the 17 non-negotiable laws.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/* =============================================================================
 * Enums
 * ============================================================================= */

export type OperationKind = 'Packing' | 'Handover' | 'Return' | 'Reset' | 'Cleaning'
export type SessionState = 'Not Started' | 'In Progress' | 'Completed'
export type DeliveryMethod = 'Client Pickup' | 'Babin Delivery' | 'Courier' | 'Third Party'
/**
 * Mirrors `create type item_quantity_state` (`0001_enums.sql:42-48`) — five
 * members, `Damaged` among them.
 *
 * TODO(decision) — this **contradicts** `ItemState` in `src/lib/workflow.ts:120`,
 * which is four members because §1.6 rules `Damaged` "a condition carried
 * alongside `Returned`, not a fifth mutually-exclusive bucket". The engine's
 * `assertItemCounts` sums four buckets; a row stored as `Damaged` is in none of
 * them, so the invariant would fail on real data.
 *
 * Narrowing this type to four **without a migration would be a lie about the
 * DB** — Postgres would still accept `'Damaged'` on `booking_line_units.unit_state`
 * (`0002:235`) and `session_line_movements.resulting_item_state` (`0003:198`).
 * Resolving it needs an enum rebuild plus a home for the condition (the
 * `booking_line_units.condition` column, `0002:245`, is the candidate), which is
 * a Phase 1 schema call. Left as-is deliberately. See PLAN.md §4.16.
 */
export type ItemQuantityState = 'Ready' | 'Picked Up' | 'Returned' | 'Missing' | 'Damaged'
/** `crew_role` (0001_enums.sql:313-325) — the twelve, verbatim. The seed roster's own vocabulary is NOT this list. */
export type CrewRoleDb =
  | 'Rental Coordinator'
  | 'Warehouse Staff'
  | 'Driver'
  | 'Camera Assistant'
  | 'Delivery Staff'
  | 'Director'
  | 'DoP'
  | 'Focus Puller'
  | 'Gaffer'
  | 'Grip'
  | 'Drone Pilot'
  | 'Sound Recordist'
export type PackingLineState = 'Pending' | 'Packed' | 'Partial' | 'Missing' | 'Not Required' | 'Replaced'
export type PhysicalCondition = 'Excellent' | 'Good' | 'Fair' | 'Damaged' | 'Not Inspected'
export type SignatureRole = 'Receiver' | 'Warehouse staff' | 'Driver' | 'Witness' | 'Returning person'

/* ── operations enums (0001_enums.sql), typed 12 Aug 2026 ──────────────────
 *
 * `src/actions/rentals/floorVerb.ts` writes the five operations tables below
 * through `idempotentInsert`/`safeUpdate`, both of which are generic over
 * `keyof Database['public']['Tables']` — an untyped table is not writable
 * through the data-access layer at all. Same reason `booking_stage_transitions`
 * was typed on 11 Aug (see its own note). Mirrors of the migration, not new
 * vocabulary: every member below is copied from `0001_enums.sql` verbatim.
 */

/** `0001_enums.sql:61-64`. Packing's own two-value condition, NOT `item_condition`. */
export type PackingCondition = 'Good' | 'Damaged'
/** `0001_enums.sql:67-71`. Three states holding Remaining + Picked Up + Missing = Total. */
export type HandoverLineState = 'Remaining' | 'Picked Up' | 'Missing'
/** `0001_enums.sql:74-78`. Routing destinations are derived, never states. */
export type ReturnLineState = 'Outstanding' | 'Returned' | 'Not Returned'
/** `0001_enums.sql:81-84`. Tracked separately from the line state, per returned line. */
export type InspectionState = 'Pending' | 'Inspected'
/** `0001_enums.sql:87-93`. Single-select — exactly one value per item. */
export type ItemCondition = 'Excellent' | 'Good' | 'Fair' | 'Damaged' | 'Lost'
/** `0001_enums.sql:96-101`. Mandatory alongside a Not Returned reason. */
export type NotReturnedDecision = 'Still expected' | 'Charge replacement' | 'Insurance claim' | 'Write off'
/** `0001_enums.sql:117-120`. Return inspection is before the client signs off; Cleaning is after, and raises a case. */
export type DamageSource = 'Return inspection' | 'Cleaning'
/** `0001_enums.sql:111-114`. Pending charges do not enter Total Deductions. */
export type DamageApprovalState = 'Pending Approval' | 'Approved'
/** `0001_enums.sql:104-108`. Absorb and Defer to Insurance satisfy the gate without a charge. */
export type DamageDisposition = 'Charge Client' | 'Absorb' | 'Defer to Insurance'
/** `0001_enums.sql:221-226`. The four are mutually exclusive and sum to the queue total. */
export type CleaningQueueState = 'Waiting' | 'Cleaning' | 'QC' | 'Ready'
/** `0001_enums.sql:229-234`. Set per item, never per batch. */
export type CleaningProblemState = 'No Problems' | 'Missing Item' | 'Needs Repair' | 'Damaged'

/**
 * The canonical six (0015_canonical_six_stages.sql), in lifecycle order —
 * matches `BookingStatus` in src/lib/workflow.ts §1.2 exactly. Cancelled is a
 * Flag on `bookings.cancelled_at`, not a stage (0015 header). The retired
 * pre-0015 values survive only in workflow.ts §1.4's migration map.
 */
export type BookingStage =
  | 'Quote'
  | 'Booked'
  | 'Packed'
  | 'On Rent'
  | 'Returned'
  | 'Closed'

export type InventoryState =
  | 'Available'
  | 'Reserved'
  | 'In Transit'
  | 'On Rent'
  | 'Pending Return Inspection'
  | 'In Maintenance'
  | 'Pending Reset'
  | 'Pending Cleaning'
  | 'Missing'
  | 'Retired'

export type ProductTrackingMode = 'Serialised' | 'Quantity' | 'Consumable'
export type ClientTypeParent = 'Organisation' | 'Individual'
/**
 * The business 9 — reopened 9 Aug 2026 by Hover Intel System v2.1, which
 * gates on Owner/Admin/Manager/Accounts as four distinct roles.
 *
 * History: migration 0013 (8 Aug 2026) folded the Foundation 6's Manager into
 * Admin in place ("Admin *is* the Ops Manager"), alongside Billing→Coordinator
 * and Viewer→Client, and added Technician/Driver — the business 8. Migration
 * 0017 (9 Aug 2026) restored Manager as its own label; 0018 gives it exactly
 * the grants Admin already had everywhere, since HIS v2.1 never states a rule
 * where the two diverge. A future spec that *does* distinguish them is a new
 * ruling, not assumed here.
 *
 * `Client` is EXTERNAL: portal only, never a staff surface. Guard with
 * `isStaff()`, and note it is also the deny-by-default fallback for an
 * unidentified session.
 */
export type SystemRole =
  | 'Owner'
  | 'Admin'
  | 'Manager'
  | 'Coordinator'
  | 'Warehouse'
  | 'Technician'
  | 'Accounts'
  | 'Driver'
  | 'Client'
export type InvoiceStatus = 'Draft' | 'Sent' | 'Partially Paid' | 'Paid' | 'Overdue' | 'Void'
export type PaymentStatus = 'Received' | 'Refunded' | 'Failed' | 'Cancelled'
export type PaymentType = 'Advance Payment' | 'Security Deposit' | 'Refund'
export type DepositMovementType = 'Received' | 'Released' | 'Applied'
export type DepositChargeType = 'Damage' | 'Missing' | 'Late'
export type ExpenseStatus = 'Draft' | 'Pending Approval' | 'Approved' | 'Paid' | 'Rejected' | 'Cancelled'
/**
 * Live `line_kind` enum, re-read from `pg_enum` on 4 Sep 2026. `'Late Fee'` was
 * added by `0016` and was missing here.
 *
 * ⚠ There is still **no `'Damage'` and no `'Missing'`**, though
 * `charges.invoice_line_id`'s own comment promises `line_kind = 'Damage'`. A
 * damage or missing-item charge therefore cannot become an invoice line at all
 * (audit P1-12), which blocks `addInvoiceLine` (SPEC-P0-1 §3.2). Widening the
 * enum is a ruling — it settles deposit-versus-invoice precedence too — so this
 * type states what the database accepts today, not what the comment claims.
 */
export type LineKind =
  | 'Equipment Rental'
  | 'Sub-Rental'
  | 'Services'
  | 'Crew Charges'
  | 'Transport'
  | 'Late Fee'
export type ChannelCode = 'WhatsApp' | 'Email' | 'SMS' | 'In-App'
export type VehicleType = 'Pickup Van' | 'Mini Truck' | 'SUV' | 'Generator Vehicle'
export type DocumentLifecycleStatus = 'Draft' | 'Pending Approval' | 'Pending Signature' | 'Signed' | 'Issued' | 'Void' | 'Expired'
export type DocumentType =
  | 'Quotation'
  | 'Rental Agreement'
  | 'Packing List'
  | 'Delivery Note'
  | 'Return Report'
  | 'Inspection Report'
  | 'Damage Report'
  | 'Tax Invoice'
  | 'Receipt'
  | 'Credit Note'
  | 'Debit Note'
  | 'Job Card'
  | 'Service Report'
  | 'Incident Report'
  | 'Insurance Claim'
  | 'Call Sheet'

export type AuditEventClass = 'status change' | 'money movement' | 'discount' | 'override' | 'session' | 'cancellation'
export type AuditCategory = 'Authentication' | 'Users' | 'Rentals' | 'Inventory' | 'Finance' | 'Administration' | 'Uncategorised'
export type AuditModule =
  | 'Today Operations'
  | 'Rentals'
  | 'Operations'
  | 'Inventory'
  | 'Clients'
  | 'Calendar'
  | 'Finance'
  | 'Settings'
  | 'Authentication'
  | 'API'
  | 'Background Jobs'

export type AuditAction =
  | 'Login'
  | 'Logout'
  | 'Create'
  | 'Update'
  | 'Delete'
  | 'Restore'
  | 'Archive'
  | 'Approve'
  | 'Reject'
  | 'Export'
  | 'Import'
  | 'Print'
  | 'Download'
  | 'Upload'
  | 'Payment'
  | 'Refund'
  | 'Booking Created'
  | 'Booking Cancelled'
  | 'Maintenance Created'
  | 'Case Created'
  | 'Permission Changed'
  | 'Password Changed'

export type AuditSeverity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational'
/** `create type device_type as enum (…)` — 0001_enums.sql:1402. Note it is a device CLASS, not a platform: there is no 'Web' member. */
export type DeviceType = 'Desktop' | 'Mobile' | 'Tablet'
export type StorageLevel = 'Room' | 'Zone' | 'Rack' | 'Shelf' | 'Bin'
export type WarehouseStatus = 'Active' | 'Inactive' | 'Under Maintenance' | 'Closed'

/* =============================================================================
 * Database Table Models
 * ============================================================================= */

export interface Database {
  public: {
    Tables: {
      branches: {
        Row: {
          id: string
          client_uuid: string
          branch_code: string
          name: string
          address: string
          phone: string
          email: string | null
          pan_vat_no: string
          is_headquarters: boolean
          is_active: boolean
          created_at: string
          created_by: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          client_uuid: string
          branch_code: string
          name: string
          address: string
          phone: string
          email?: string | null
          pan_vat_no?: string
          is_headquarters?: boolean
          is_active?: boolean
          created_at?: string
          created_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['branches']['Insert']>
      }

      warehouses: {
        Row: {
          id: string
          client_uuid: string
          warehouse_code: string
          branch_id: string
          name: string
          address: string | null
          status: WarehouseStatus
          is_primary: boolean
          is_active: boolean
          created_at: string
          created_by: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          client_uuid: string
          warehouse_code: string
          branch_id: string
          name: string
          address?: string | null
          status?: WarehouseStatus
          is_primary?: boolean
          is_active?: boolean
          created_at?: string
          created_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['warehouses']['Insert']>
      }

      storage_zones: {
        Row: {
          id: string
          client_uuid: string
          warehouse_id: string
          code: string
          name: string
          level: StorageLevel
          description: string | null
          parent_id: string | null
          is_active: boolean
          created_at: string
          created_by: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          client_uuid: string
          warehouse_id: string
          code: string
          name: string
          level?: StorageLevel
          description?: string | null
          parent_id?: string | null
          is_active?: boolean
          created_at?: string
          created_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['storage_zones']['Insert']>
      }

      users: {
        Row: {
          id: string
          client_uuid: string
          employee_code: string
          email: string
          full_name: string
          mobile: string
          primary_role: SystemRole
          department: string | null
          branch_id: string
          warehouse_id: string | null
          is_active: boolean
          last_login_at: string | null
          created_at: string
          created_by: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          client_uuid: string
          employee_code: string
          email: string
          full_name: string
          mobile: string
          primary_role?: SystemRole
          department?: string | null
          branch_id: string
          warehouse_id?: string | null
          is_active?: boolean
          last_login_at?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['users']['Insert']>
      }

      clients: {
        Row: {
          id: string
          client_uuid: string
          client_no: string
          type_parent: ClientTypeParent
          organisation_subtype: string | null
          company_name: string | null
          full_name: string
          email: string
          mobile: string
          pan_vat_no: string | null
          address: string
          city: string
          status: string
          credit_limit: number
          is_vip: boolean
          is_blocked: boolean
          created_at: string
          created_by: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          client_uuid: string
          client_no: string
          type_parent: ClientTypeParent
          organisation_subtype?: string | null
          company_name?: string | null
          full_name: string
          email: string
          mobile: string
          pan_vat_no?: string | null
          address: string
          city?: string
          status?: string
          credit_limit?: number
          is_vip?: boolean
          is_blocked?: boolean
          created_at?: string
          created_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['clients']['Insert']>
      }

      products: {
        Row: {
          id: string
          client_uuid: string
          category_id: string
          supplier_id: string | null
          name: string
          slug: string
          model_number: string | null
          tracking_mode: ProductTrackingMode
          rental_rate_daily: number
          deposit_rate: number
          total_stock: number
          available_stock: number
          is_active: boolean
          created_at: string
          created_by: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          client_uuid: string
          category_id: string
          supplier_id?: string | null
          name: string
          slug: string
          model_number?: string | null
          tracking_mode?: ProductTrackingMode
          rental_rate_daily?: number
          deposit_rate?: number
          total_stock?: number
          available_stock?: number
          is_active?: boolean
          created_at?: string
          created_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['products']['Insert']>
      }

      /**
       * `0004_inventory.sql:380` — applied, but missing from this file, which
       * is why `actions/inventory/createBundle.ts`'s `idempotentInsert('bundles', …)`
       * did not typecheck. Transcribed column-for-column from the migration;
       * nothing here is inferred.
       */
      bundles: {
        Row: {
          id: string
          client_uuid: string
          bundle_code: string
          name: string
          description: string | null
          category_id: string | null
          daily_rate: number
          weekly_rate: number
          is_active: boolean
          created_at: string
          created_by: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          client_uuid: string
          bundle_code: string
          name: string
          description?: string | null
          category_id?: string | null
          daily_rate?: number
          weekly_rate?: number
          is_active?: boolean
          created_at?: string
          created_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['bundles']['Insert']>
      }

      /** `0004_inventory.sql:407`. `days` carries Law 9 — never by omission. */
      bundle_items: {
        Row: {
          id: string
          client_uuid: string
          bundle_id: string
          product_id: string
          quantity: number
          days: number
          is_mandatory: boolean
          sort_order: number
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          client_uuid: string
          bundle_id: string
          product_id: string
          quantity?: number
          days?: number
          is_mandatory?: boolean
          sort_order?: number
          created_at?: string
          created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['bundle_items']['Insert']>
      }

      /**
       * Transcribed from the **live** catalog on 13 Aug 2026
       * (`information_schema.columns`), not from a migration file — this table
       * existed in the database while this file did not declare it, so
       * `lib/queries/availability.ts` could not typecheck against it.
       *
       * `period` is a `tstzrange`, which PostgREST serialises as a string like
       * `["2026-08-13 00:00+00","2026-08-16 00:00+00")`. It is typed `string`
       * here rather than a parsed shape because nothing in `src/` decomposes it
       * yet, and inventing a range type would be guessing at how it will be read.
       *
       * `state` is the `inventory_state` enum, defaulting to `'Reserved'`.
       * `asset_id` and `product_id` are both nullable: a reservation names a
       * serialised unit **or** a quantity of a product, never both.
       */
      inventory_reservations: {
        Row: {
          id: string
          client_uuid: string
          booking_id: string
          booking_line_id: string
          asset_id: string | null
          product_id: string | null
          qty: number
          period: string
          state: string
          reserved_at: string
          released_at: string | null
          released_reason: string | null
          created_at: string
          created_by: string
        }
        Insert: {
          id?: string
          client_uuid: string
          booking_id: string
          booking_line_id: string
          asset_id?: string | null
          product_id?: string | null
          qty?: number
          period: string
          state?: string
          reserved_at?: string
          released_at?: string | null
          released_reason?: string | null
          created_at?: string
          created_by: string
        }
        Update: Partial<Database['public']['Tables']['inventory_reservations']['Insert']>
      }

      inventory_units: {
        Row: {
          id: string
          client_uuid: string
          product_id: string
          warehouse_id: string
          storage_zone_id: string | null
          asset_code: string
          serial_number: string | null
          current_state: InventoryState
          physical_condition: PhysicalCondition
          health_score: number
          purchase_price: number | null
          is_active: boolean
          created_at: string
          created_by: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          client_uuid: string
          product_id: string
          warehouse_id: string
          storage_zone_id?: string | null
          asset_code: string
          serial_number?: string | null
          current_state?: InventoryState
          physical_condition?: PhysicalCondition
          health_score?: number
          purchase_price?: number | null
          is_active?: boolean
          created_at?: string
          created_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['inventory_units']['Insert']>
      }

      bookings: {
        Row: {
          id: string
          client_uuid: string
          booking_no: string
          client_id: string
          branch_id: string
          warehouse_id: string
          stage: BookingStage
          stage_number: number
          /** 0002:33,86 — "Set by the Return workspace"; stamped by the Return verb since 3 Sep 2026 (RT-01). */
          actual_return_at: string | null
          pickup_datetime: string
          return_datetime: string
          days: number
          delivery_method: DeliveryMethod
          delivery_address: string | null
          project_title: string | null
          shoot_type: string | null
          /** 0144 — controlled project-type list; NULL for legacy rows and Drafts. */
          project_type: string | null
          /** 0144 — custom description, only when project_type is 'Other'. */
          project_type_other: string | null
          location: string | null
          notes: string | null
          created_at: string
          created_by: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          client_uuid: string
          booking_no: string
          client_id: string
          branch_id: string
          warehouse_id: string
          stage?: BookingStage
          stage_number?: number
          actual_return_at?: string | null
          pickup_datetime: string
          return_datetime: string
          days?: number
          delivery_method?: DeliveryMethod
          delivery_address?: string | null
          project_title?: string | null
          shoot_type?: string | null
          /** 0144 — controlled project-type list; NULL for legacy rows and Drafts. */
          project_type?: string | null
          /** 0144 — custom description, only when project_type is 'Other'. */
          project_type_other?: string | null
          location?: string | null
          notes?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['bookings']['Insert']>
      }

      /**
       * `0002_bookings.sql:427-462`. Append-only history of every stage
       * movement and, per `0002:80-81`, **the only writer of `bookings.stage`**
       * — that column is a read model maintained by this table's trigger and a
       * direct UPDATE of it is rejected. Typed here on 11 Aug 2026 because
       * `src/lib/bookingTransition.ts` needs it; the table itself has existed
       * since `0002`.
       *
       * `from_stage`/`to_stage` are `booking_stage`, which `0015` rebuilt as
       * the canonical six. `from_stage` is null only on the row that creates
       * the booking at Quote. No `Update` is ever legal (`0002:485` revokes it
       * and `safeUpdate`'s immutable list refuses it); the alias below exists
       * only to satisfy the shared `Tables` shape.
       */
      booking_stage_transitions: {
        Row: {
          id: string
          client_uuid: string
          booking_id: string
          branch_id: string
          from_stage: BookingStage | null
          to_stage: BookingStage
          is_reversal: boolean
          approved_by: string | null
          reason: string | null
          /** 0155 — written only on a Close that skipped an unresolved deposit. */
          deposit_skip_reason: string | null
          audit_event_id: string | null
          occurred_at: string
          actor_id: string
          actor_role: string
          source: string | null
          created_at: string
        }
        Insert: {
          id?: string
          client_uuid: string
          booking_id: string
          branch_id: string
          from_stage?: BookingStage | null
          to_stage: BookingStage
          is_reversal?: boolean
          approved_by?: string | null
          reason?: string | null
          deposit_skip_reason?: string | null
          audit_event_id?: string | null
          occurred_at?: string
          actor_id: string
          actor_role: string
          source?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['booking_stage_transitions']['Insert']>
      }

      booking_lines: {
        Row: {
          id: string
          client_uuid: string
          booking_id: string
          product_id: string | null
          unit_id: string | null
          line_kind: LineKind
          description: string
          quantity: number
          days: number
          daily_rate: number
          discount_percent: number
          line_total: number
          item_state: ItemQuantityState
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          client_uuid: string
          booking_id: string
          product_id?: string | null
          unit_id?: string | null
          line_kind?: LineKind
          description: string
          quantity?: number
          days?: number
          daily_rate?: number
          discount_percent?: number
          line_total?: number
          item_state?: ItemQuantityState
          sort_order?: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['booking_lines']['Insert']>
      }

      /** `0002_bookings.sql:314-340` — priced crew on a booking. Declared the day New Rental started writing it (BUG_AUDIT_LIFECYCLE NR-02). */
      booking_crew_lines: {
        Row: {
          id: string
          client_uuid: string
          booking_id: string
          crew_member_id: string | null
          name: string
          crew_role: CrewRoleDb
          phone: string | null
          day_rate: number
          days: number
          overtime: number
          accommodation: number
          meals: number
          voided_at: string | null
          created_at: string
          created_by: string
        }
        Insert: {
          id?: string
          client_uuid: string
          booking_id: string
          crew_member_id?: string | null
          name: string
          crew_role: CrewRoleDb
          phone?: string | null
          day_rate?: number
          days?: number
          overtime?: number
          accommodation?: number
          meals?: number
          voided_at?: string | null
          created_at?: string
          created_by: string
        }
        Update: Partial<Database['public']['Tables']['booking_crew_lines']['Insert']>
      }

      /** `0002_bookings.sql:373-395` — one transport row per booking (`booking_id` unique). */
      booking_transport: {
        Row: {
          id: string
          client_uuid: string
          booking_id: string
          vehicle: string | null
          number_plate: string | null
          driver_id: string | null
          driver_contact: string | null
          delivery_charge: number
          fuel_charge: number
          zero_charge_override_by: string | null
          zero_charge_override_reason: string | null
          special_instructions: string | null
          created_at: string
          created_by: string
        }
        Insert: {
          id?: string
          client_uuid: string
          booking_id: string
          vehicle?: string | null
          number_plate?: string | null
          driver_id?: string | null
          driver_contact?: string | null
          delivery_charge?: number
          fuel_charge?: number
          zero_charge_override_by?: string | null
          zero_charge_override_reason?: string | null
          special_instructions?: string | null
          created_at?: string
          created_by: string
        }
        Update: Partial<Database['public']['Tables']['booking_transport']['Insert']>
      }

      invoices: {
        Row: {
          id: string
          client_uuid: string
          /** R-15 — NULL while Draft; minted at issue. */
          invoice_no: string | null
          booking_id: string
          client_id: string
          branch_id: string
          status: InvoiceStatus
          /** R-15 — NULL until issued. */
          issue_date: string | null
          due_date: string
          currency: string
          subtotal: number
          discount_amount: number
          discount_percent: number
          taxable_amount: number
          vat_rate: number
          vat_amount: number
          total_amount: number
          paid_amount: number
          outstanding_amount: number
          voided_at: string | null
          voided_by: string | null
          void_reason: string | null
          credit_note_no: string | null
          notes: string | null
          pdf_url: string | null
          created_at: string
          created_by: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          client_uuid: string
          invoice_no?: string | null
          booking_id: string
          client_id: string
          branch_id: string
          status?: InvoiceStatus
          issue_date?: string | null
          due_date: string
          currency?: string
          subtotal?: number
          discount_amount?: number
          discount_percent?: number
          taxable_amount?: number
          vat_rate?: number
          vat_amount?: number
          total_amount?: number
          paid_amount?: number
          outstanding_amount?: number
          voided_at?: string | null
          voided_by?: string | null
          void_reason?: string | null
          credit_note_no?: string | null
          notes?: string | null
          pdf_url?: string | null
          created_at?: string
          created_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>
      }

      /**
       * Added 4 Sep 2026. This table was **absent from this file entirely**,
       * so `idempotentInsert('invoice_lines', …)` did not typecheck and
       * SPEC-P0-1 §3.1's "one `invoice_lines` row per `booking_lines` row" had
       * no typed route. Columns read from the live `information_schema` on
       * 4 Sep, not from a migration file.
       *
       * ⚠ Note for whoever regenerates types: the `booking_lines` block above
       * describes THIS table's shape (`line_kind`, `quantity`, `unit_rate`,
       * `discount_percent`, `line_total`), not `booking_lines`'s. Live
       * `booking_lines` carries `line_type`, `qty`, `rate`, `discount_amount`,
       * `is_included`, `bundle_id`, `supplier_*` and `voided_at`, and has no
       * `unit_id`, `line_kind` or `item_state` at all. The two were swapped.
       * Left alone here because correcting it would change the type of a table
       * other code already writes through, which is a separate, testable change.
       */
      invoice_lines: {
        Row: {
          id: string
          client_uuid: string
          invoice_id: string
          line_kind: LineKind
          description: string
          quantity: number
          days: number
          unit_rate: number
          discount_percent: number
          discount_reason: string | null
          discount_approved_by: string | null
          line_total: number
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          client_uuid: string
          invoice_id: string
          line_kind?: LineKind
          description: string
          quantity?: number
          days?: number
          unit_rate?: number
          discount_percent?: number
          discount_reason?: string | null
          discount_approved_by?: string | null
          line_total?: number
          sort_order?: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['invoice_lines']['Insert']>
      }

      payments: {
        Row: {
          id: string
          client_uuid: string
          payment_no: string
          booking_id: string
          invoice_id: string | null
          client_id: string
          branch_id: string
          amount: number
          payment_type: PaymentType
          status: PaymentStatus
          payment_date: string
          bank_account_id: string | null
          transaction_ref: string | null
          notes: string | null
          received_by: string
          created_at: string
        }
        Insert: {
          id?: string
          client_uuid: string
          payment_no: string
          booking_id: string
          invoice_id?: string | null
          client_id: string
          branch_id: string
          amount: number
          payment_type?: PaymentType
          status?: PaymentStatus
          payment_date?: string
          bank_account_id?: string | null
          transaction_ref?: string | null
          notes?: string | null
          received_by: string
          created_at?: string
        }
        Update: never // Payments are immutable!
      }

      security_deposits: {
        Row: {
          id: string
          client_uuid: string
          deposit_no: string
          booking_id: string
          client_id: string
          branch_id: string
          required_amount: number
          received_amount: number
          refunded_amount: number
          applied_amount: number
          pending_amount: number
          created_at: string
          created_by: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          client_uuid: string
          deposit_no: string
          booking_id: string
          client_id: string
          branch_id: string
          required_amount?: number
          received_amount?: number
          refunded_amount?: number
          applied_amount?: number
          pending_amount?: number
          created_at?: string
          created_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['security_deposits']['Insert']>
      }

      deposit_movements: {
        Row: {
          id: string
          client_uuid: string
          movement_no: string
          security_deposit_id: string
          movement_type: DepositMovementType
          amount: number
          bank_account_id: string | null
          transaction_ref: string | null
          charge_type: DepositChargeType | null
          applied_reason: string | null
          handled_by: string
          created_at: string
        }
        Insert: {
          id?: string
          client_uuid: string
          movement_no: string
          security_deposit_id: string
          movement_type?: DepositMovementType
          amount: number
          bank_account_id?: string | null
          transaction_ref?: string | null
          charge_type?: DepositChargeType | null
          applied_reason?: string | null
          handled_by: string
          created_at?: string
        }
        Update: never // Deposit movements are immutable!
      }

      audit_events: {
        Row: {
          id: string
          client_uuid: string
          event_class: AuditEventClass
          category: AuditCategory
          module: AuditModule
          action: AuditAction
          severity: AuditSeverity
          status: string
          table_name: string
          record_id: string
          actor_id: string | null
          actor_role: SystemRole | null
          branch_id: string | null
          ip_address: string | null
          user_agent: string | null
          device_type: DeviceType
          old_values: Json | null
          new_values: Json | null
          diff: Json | null
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          client_uuid: string
          event_class?: AuditEventClass
          category?: AuditCategory
          module?: AuditModule
          action?: AuditAction
          severity?: AuditSeverity
          status?: string
          table_name: string
          record_id: string
          actor_id?: string | null
          actor_role?: SystemRole | null
          branch_id?: string | null
          ip_address?: string | null
          user_agent?: string | null
          device_type?: DeviceType
          old_values?: Json | null
          new_values?: Json | null
          diff?: Json | null
          reason?: string | null
          created_at?: string
        }
        Update: never // Audit events are immutable!
      }

      /* ═══════════════════════════════════════════════════════════════════
       * operations — `0003_operations.sql`
       *
       * The five tables the four floor verbs (Pack · Handover · Return ·
       * Reset) write. Typed 12 Aug 2026 for the same stated reason
       * `booking_stage_transitions` was typed on 11 Aug: `idempotentInsert`
       * and `safeUpdate` are generic over `keyof Database['public']['Tables']`,
       * so a table absent from here cannot be written through the data-access
       * layer at all — and casting around that generic would silently switch
       * off payload checking on exactly the writes that most need it.
       *
       * Columns are copied from `0003_operations.sql`, nullability included.
       * `Insert` marks optional every column the migration gives a DEFAULT.
       * No column is added, renamed or omitted; where the migration and
       * `src/lib/workflow.ts` disagree the migration is what is typed, because
       * this file describes Postgres.
       * ═══════════════════════════════════════════════════════════════════ */

      /**
       * `0003_operations.sql:47-123`. One Packing, Handover or Return session
       * against a booking — `operation_sessions_operation_is_a_session` (:88)
       * limits `operation` to those three, so `'Reset'`/`'Cleaning'` are
       * members of `OperationKind` that this table refuses. Reset has no
       * session at all (`0003:855-857`).
       */
      operation_sessions: {
        Row: {
          id: string
          client_uuid: string
          booking_id: string
          operation: OperationKind
          session_no: number
          state: SessionState
          started_at: string | null
          started_by: string | null
          completed_at: string | null
          completed_by: string | null
          cancelled_at: string | null
          cancel_reason: string | null
          warehouse_staff_id: string
          delivery_method: DeliveryMethod | null
          receiver_name: string | null
          receiver_phone: string | null
          receiver_email: string | null
          receiver_id_document_evidence_id: string | null
          government_id_verified: boolean
          booking_authorization_verified: boolean
          received_at: string | null
          returning_person_name: string | null
          pickup_person_name: string | null
          pickup_person_phone: string | null
          vehicle_plate: string | null
          driver_name: string | null
          driver_contact: string | null
          courier_name: string | null
          courier_tracking_number: string | null
          delivery_address: string | null
          estimated_arrival: string | null
          device_id: string | null
          notes: string | null
          created_at: string
          created_by: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_uuid: string
          booking_id: string
          operation: OperationKind
          session_no?: number
          state?: SessionState
          started_at?: string | null
          started_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          cancelled_at?: string | null
          cancel_reason?: string | null
          warehouse_staff_id: string
          delivery_method?: DeliveryMethod | null
          receiver_name?: string | null
          receiver_phone?: string | null
          receiver_email?: string | null
          receiver_id_document_evidence_id?: string | null
          government_id_verified?: boolean
          booking_authorization_verified?: boolean
          received_at?: string | null
          returning_person_name?: string | null
          pickup_person_name?: string | null
          pickup_person_phone?: string | null
          vehicle_plate?: string | null
          driver_name?: string | null
          driver_contact?: string | null
          courier_name?: string | null
          courier_tracking_number?: string | null
          delivery_address?: string | null
          estimated_arrival?: string | null
          device_id?: string | null
          notes?: string | null
          created_at?: string
          created_by: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['operation_sessions']['Insert']>
      }

      /**
       * `0003_operations.sql:190-207`. Append-only: `0003:1643-1647` revokes
       * UPDATE from every role, and a correction is a compensating row via
       * `reverses_movement_id`. `Update` is `never` for the same reason
       * `payments`' is.
       */
      session_line_movements: {
        Row: {
          id: string
          client_uuid: string
          session_id: string
          booking_line_id: string
          unit_id: string | null
          serial: string | null
          qty: number
          resulting_item_state: ItemQuantityState | null
          moved_at: string
          scan_event_id: string | null
          device_id: string | null
          reverses_movement_id: string | null
          created_at: string
          created_by: string
        }
        Insert: {
          id?: string
          client_uuid: string
          session_id: string
          booking_line_id: string
          unit_id?: string | null
          serial?: string | null
          qty?: number
          resulting_item_state?: ItemQuantityState | null
          moved_at: string
          scan_event_id?: string | null
          device_id?: string | null
          reverses_movement_id?: string | null
          created_at?: string
          created_by: string
        }
        Update: never // Append-only — 0003:1643 revokes UPDATE from everyone.
      }

      /** `0003_operations.sql:250-278`. One row per booking line (unique :271). */
      packing_lines: {
        Row: {
          id: string
          client_uuid: string
          session_id: string
          booking_line_id: string
          state: PackingLineState
          qty_required: number
          qty_packed_entered: number | null
          is_required: boolean
          condition: PackingCondition | null
          warehouse_location: string | null
          packed_at: string | null
          packed_by: string | null
          missing_reason: string | null
          blocker_note: string | null
          replacement_packing_line_id: string | null
          not_required_set_at: string | null
          created_at: string
          created_by: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_uuid: string
          session_id: string
          booking_line_id: string
          state?: PackingLineState
          qty_required: number
          qty_packed_entered?: number | null
          is_required?: boolean
          condition?: PackingCondition | null
          warehouse_location?: string | null
          packed_at?: string | null
          packed_by?: string | null
          missing_reason?: string | null
          blocker_note?: string | null
          replacement_packing_line_id?: string | null
          not_required_set_at?: string | null
          created_at?: string
          created_by: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['packing_lines']['Insert']>
      }

      /**
       * `0003_operations.sql:309-327`. Note it carries **no `session_id`** —
       * a line outlives any one session, so the session is recorded as
       * `first_session_id` / `completed_session_id` instead.
       */
      /**
       * `0002_bookings.sql:225-262` — one row per physical unit committed to a
       * line, carrying the per-item quantity state. Declared here the day the
       * floor verbs started WRITING it (BUG_AUDIT_LIFECYCLE X-03); until then
       * nothing in `src/` updated the table, so it had no Update shape to need.
       * Only the columns the floor writes are typed; `released_at` /
       * `released_by` (0076) are read-only from here — the freeze trigger makes
       * a released row immutable, so they are never in a patch.
       */
      booking_line_units: {
        Row: {
          id: string
          client_uuid: string
          booking_line_id: string
          asset_id: string | null
          qty: number
          unit_state: ItemQuantityState
          is_required: boolean
          packed: boolean
          packed_at: string | null
          packed_by: string | null
          packing_session_id: string | null
          handover_session_id: string | null
          return_session_id: string | null
          returned_at: string | null
          condition: string | null
          missing_reason: string | null
          damaged: boolean
          reset_done_at: string | null
          cleaning_done_at: string | null
          released_at: string | null
          released_by: string | null
          created_at: string
          created_by: string
        }
        Insert: {
          id?: string
          client_uuid: string
          booking_line_id: string
          asset_id?: string | null
          qty?: number
          unit_state?: ItemQuantityState
          is_required?: boolean
          packed?: boolean
          packed_at?: string | null
          packed_by?: string | null
          packing_session_id?: string | null
          handover_session_id?: string | null
          return_session_id?: string | null
          returned_at?: string | null
          condition?: string | null
          missing_reason?: string | null
          damaged?: boolean
          reset_done_at?: string | null
          cleaning_done_at?: string | null
          created_at?: string
          created_by: string
        }
        Update: Partial<Omit<Database['public']['Tables']['booking_line_units']['Insert'], 'client_uuid' | 'created_by'>>
      }

      /**
       * `0003_operations.sql:449-481`. Declared the day the Return verb started
       * WRITING it (BUG_AUDIT_LIFECYCLE RT-02). `estimated_cost` is typed but
       * never written from the OS: `0034` revokes SELECT on it from
       * `authenticated` and `0003:488` reserves it for the approver.
       */
      damage_findings: {
        Row: {
          id: string
          client_uuid: string
          source: DamageSource
          return_line_id: string | null
          cleaning_queue_entry_id: string | null
          unit_id: string
          damage_type: string
          description: string
          severity: string
          estimated_cost: number | null
          approval_state: DamageApprovalState
          approved_by: string | null
          approved_at: string | null
          disposition: DamageDisposition | null
          case_id: string | null
          charge_id: string | null
          voided_at: string | null
          created_at: string
          created_by: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_uuid: string
          source: DamageSource
          return_line_id?: string | null
          cleaning_queue_entry_id?: string | null
          unit_id: string
          damage_type: string
          description: string
          severity: string
          estimated_cost?: number | null
          approval_state?: DamageApprovalState
          approved_by?: string | null
          approved_at?: string | null
          disposition?: DamageDisposition | null
          case_id?: string | null
          charge_id?: string | null
          voided_at?: string | null
          created_at?: string
          created_by: string
          updated_at?: string
        }
        Update: Partial<Omit<Database['public']['Tables']['damage_findings']['Insert'], 'client_uuid' | 'created_by'>>
      }

      handover_lines: {
        Row: {
          id: string
          client_uuid: string
          booking_line_id: string
          state: HandoverLineState
          qty_required: number
          missing_reason: string | null
          first_session_id: string | null
          completed_session_id: string | null
          picked_up_at: string | null
          created_at: string
          created_by: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_uuid: string
          booking_line_id: string
          state?: HandoverLineState
          qty_required: number
          missing_reason?: string | null
          first_session_id?: string | null
          completed_session_id?: string | null
          picked_up_at?: string | null
          created_at?: string
          created_by: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['handover_lines']['Insert']>
      }

      /** `0003_operations.sql:356-385`. Inspection is a column set here, not a second table. */
      return_lines: {
        Row: {
          id: string
          client_uuid: string
          booking_line_id: string
          state: ReturnLineState
          qty_expected: number
          session_id: string | null
          returned_at: string | null
          inspection_state: InspectionState
          condition: ItemCondition | null
          inspector_note: string | null
          inspected_by: string | null
          inspected_at: string | null
          returned_by_name: string | null
          not_returned_reason: string | null
          not_returned_decision: NotReturnedDecision | null
          created_at: string
          created_by: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_uuid: string
          booking_line_id: string
          state?: ReturnLineState
          qty_expected: number
          session_id?: string | null
          returned_at?: string | null
          inspection_state?: InspectionState
          condition?: ItemCondition | null
          inspector_note?: string | null
          inspected_by?: string | null
          inspected_at?: string | null
          returned_by_name?: string | null
          not_returned_reason?: string | null
          not_returned_decision?: NotReturnedDecision | null
          created_at?: string
          created_by: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['return_lines']['Insert']>
      }

      /**
       * `0003_operations.sql:859-897`. **Per item, not per booking** (:899) —
       * this is why Reset takes unit ids and not a line list. `requires_reset`
       * gates `reset_completed_at` by CHECK (:895).
       */
      cleaning_queue_entries: {
        Row: {
          id: string
          client_uuid: string
          unit_id: string
          booking_id: string | null
          return_line_id: string | null
          state: CleaningQueueState
          requires_clean: boolean
          requires_reset: boolean
          clean_completed_at: string | null
          reset_completed_at: string | null
          entered_queue_at: string
          first_task_at: string | null
          completed_at: string | null
          assigned_to: string | null
          cleaned_by: string | null
          qc_by: string | null
          qc_at: string | null
          qc_skipped: boolean
          qc_skip_reason: string | null
          qc_fail_reason: string | null
          problem_state: CleaningProblemState
          checklist_version: number | null
          created_at: string
          created_by: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_uuid: string
          unit_id: string
          booking_id?: string | null
          return_line_id?: string | null
          state?: CleaningQueueState
          requires_clean?: boolean
          requires_reset?: boolean
          clean_completed_at?: string | null
          reset_completed_at?: string | null
          entered_queue_at?: string
          first_task_at?: string | null
          completed_at?: string | null
          assigned_to?: string | null
          cleaned_by?: string | null
          qc_by?: string | null
          qc_at?: string | null
          qc_skipped?: boolean
          qc_skip_reason?: string | null
          qc_fail_reason?: string | null
          problem_state?: CleaningProblemState
          checklist_version?: number | null
          created_at?: string
          created_by: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['cleaning_queue_entries']['Insert']>
      }

      /**
       * `0003_operations.sql:518-535`. One signature per role per session.
       * Required for Handover sessions before stage transition (0115:320-326).
       */
      signatures: {
        Row: {
          id: string
          client_uuid: string
          session_id: string
          signature_role: SignatureRole
          signer_name: string
          signed_at: string
          device: string
          signature_evidence_file_id: string | null
          is_required: boolean
          sealed_at: string | null
          created_at: string
          created_by: string
        }
        Insert: {
          id?: string
          client_uuid: string
          session_id: string
          signature_role: SignatureRole
          signer_name: string
          signed_at: string
          device: string
          signature_evidence_file_id?: string | null
          is_required: boolean
          sealed_at?: string | null
          created_at?: string
          created_by: string
        }
        Update: Partial<Database['public']['Tables']['signatures']['Insert']>
      }
    }
  }
}
