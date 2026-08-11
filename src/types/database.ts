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
export type DeliveryMethod = 'Customer Pickup' | 'Babin Delivery' | 'Courier' | 'Third Party'
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
export type PackingLineState = 'Pending' | 'Packed' | 'Partial' | 'Missing' | 'Not Required' | 'Replaced'
export type PhysicalCondition = 'Excellent' | 'Good' | 'Fair' | 'Damaged' | 'Not Inspected'

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
export type LineKind = 'Equipment Rental' | 'Sub-Rental' | 'Services' | 'Crew Charges' | 'Transport'
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
          pickup_datetime: string
          return_datetime: string
          days: number
          delivery_method: DeliveryMethod
          delivery_address: string | null
          project_title: string | null
          shoot_type: string | null
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
          pickup_datetime: string
          return_datetime: string
          days?: number
          delivery_method?: DeliveryMethod
          delivery_address?: string | null
          project_title?: string | null
          shoot_type?: string | null
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

      invoices: {
        Row: {
          id: string
          client_uuid: string
          invoice_no: string
          booking_id: string
          client_id: string
          branch_id: string
          status: InvoiceStatus
          issue_date: string
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
          invoice_no: string
          booking_id: string
          client_id: string
          branch_id: string
          status?: InvoiceStatus
          issue_date?: string
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
    }
  }
}
