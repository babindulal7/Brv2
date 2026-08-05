/**
 * Babin Rentals OS — Database Schema Types
 * Generated & typed for migrations 0001 through 0012.
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
export type ItemQuantityState = 'Ready' | 'Picked Up' | 'Returned' | 'Missing' | 'Damaged'
export type PackingLineState = 'Pending' | 'Packed' | 'Partial' | 'Missing' | 'Not Required' | 'Replaced'
export type PhysicalCondition = 'Excellent' | 'Good' | 'Fair' | 'Damaged' | 'Not Inspected'

export type BookingStage =
  | 'Draft'
  | 'Confirmed'
  | 'Ready'
  | 'Preparing'
  | 'Final Checks'
  | 'On Rent'
  | 'Return Pending'
  | 'Returned'
  | 'In Inspection'
  | 'Completed'
  | 'Closed'
  | 'Cancelled'

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
export type SystemRole = 'Owner' | 'Manager' | 'Warehouse' | 'Billing' | 'Accounts' | 'Viewer'
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
          device_type: string
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
          device_type?: string
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
