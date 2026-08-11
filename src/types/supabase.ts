/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: the LIVE schema of Supabase project sxguwvgoserhdolewibb, read on
 * 11 Aug 2026 after migrations 0001-0047 were applied.
 * Regenerate: supabase gen types typescript (or the MCP generate_typescript_types tool).
 *
 * This is the DATABASE row shape. It deliberately does NOT replace
 * `src/types/database.ts`, which is the hand-written APP vocabulary (SystemRole,
 * BookingStatus and the other unions ~63 files import). Keeping them separate
 * means a schema change shows up here as a type error at the query layer,
 * instead of silently rewriting an app-wide union.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accessories: {
        Row: {
          client_uuid: string
          created_at: string
          created_by: string | null
          id: string
          is_mandatory: boolean
          name: string
          product_id: string
          quantity: number
          replacement_cost: number
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_uuid: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_mandatory?: boolean
          name: string
          product_id: string
          quantity?: number
          replacement_cost?: number
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_mandatory?: boolean
          name?: string
          product_id?: string
          quantity?: number
          replacement_cost?: number
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accessories_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accessories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accessories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accessories_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["system_role"] | null
          branch_id: string | null
          category: Database["public"]["Enums"]["audit_category"]
          client_uuid: string
          created_at: string
          device_type: Database["public"]["Enums"]["device_type"]
          diff: Json | null
          event_class: Database["public"]["Enums"]["audit_event_class"]
          id: string
          ip_address: unknown
          module: Database["public"]["Enums"]["audit_module"]
          new_values: Json | null
          old_values: Json | null
          reason: string | null
          record_id: string
          severity: Database["public"]["Enums"]["audit_severity"]
          status: Database["public"]["Enums"]["audit_status"]
          table_name: string
          user_agent: string | null
        }
        Insert: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["system_role"] | null
          branch_id?: string | null
          category?: Database["public"]["Enums"]["audit_category"]
          client_uuid: string
          created_at?: string
          device_type?: Database["public"]["Enums"]["device_type"]
          diff?: Json | null
          event_class?: Database["public"]["Enums"]["audit_event_class"]
          id?: string
          ip_address?: unknown
          module?: Database["public"]["Enums"]["audit_module"]
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
          record_id: string
          severity?: Database["public"]["Enums"]["audit_severity"]
          status?: Database["public"]["Enums"]["audit_status"]
          table_name: string
          user_agent?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["system_role"] | null
          branch_id?: string | null
          category?: Database["public"]["Enums"]["audit_category"]
          client_uuid?: string
          created_at?: string
          device_type?: Database["public"]["Enums"]["device_type"]
          diff?: Json | null
          event_class?: Database["public"]["Enums"]["audit_event_class"]
          id?: string
          ip_address?: unknown
          module?: Database["public"]["Enums"]["audit_module"]
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
          record_id?: string
          severity?: Database["public"]["Enums"]["audit_severity"]
          status?: Database["public"]["Enums"]["audit_status"]
          table_name?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_settings: {
        Row: {
          client_uuid: string
          granularity: Database["public"]["Enums"]["audit_granularity"]
          id: string
          is_enabled: boolean
          min_severity_alert: Database["public"]["Enums"]["audit_severity"]
          module: Database["public"]["Enums"]["audit_module"]
          retention_period: Database["public"]["Enums"]["retention_period"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_uuid: string
          granularity?: Database["public"]["Enums"]["audit_granularity"]
          id?: string
          is_enabled?: boolean
          min_severity_alert?: Database["public"]["Enums"]["audit_severity"]
          module: Database["public"]["Enums"]["audit_module"]
          retention_period?: Database["public"]["Enums"]["retention_period"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_uuid?: string
          granularity?: Database["public"]["Enums"]["audit_granularity"]
          id?: string
          is_enabled?: boolean
          min_severity_alert?: Database["public"]["Enums"]["audit_severity"]
          module?: Database["public"]["Enums"]["audit_module"]
          retention_period?: Database["public"]["Enums"]["retention_period"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_logs: {
        Row: {
          actions_taken: Json
          client_uuid: string
          error_message: string | null
          executed_at: string
          execution_status: string
          id: string
          payload: Json
          rule_id: string
          trigger_event: string
        }
        Insert: {
          actions_taken?: Json
          client_uuid: string
          error_message?: string | null
          executed_at?: string
          execution_status?: string
          id?: string
          payload?: Json
          rule_id: string
          trigger_event: string
        }
        Update: {
          actions_taken?: Json
          client_uuid?: string
          error_message?: string | null
          executed_at?: string
          execution_status?: string
          id?: string
          payload?: Json
          rule_id?: string
          trigger_event?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          actions: Json
          client_uuid: string
          conditions: Json
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          rule_no: string
          trigger_event: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actions?: Json
          client_uuid: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          rule_no: string
          trigger_event: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actions?: Json
          client_uuid?: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          rule_no?: string
          trigger_event?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_logs: {
        Row: {
          backup_no: string
          backup_type: string
          checksum_sha256: string
          client_uuid: string
          completed_at: string
          created_at: string
          error_message: string | null
          file_size_bytes: number
          id: string
          initiated_by: string | null
          started_at: string
          status: string
          storage_location: string
        }
        Insert: {
          backup_no: string
          backup_type?: string
          checksum_sha256: string
          client_uuid: string
          completed_at: string
          created_at?: string
          error_message?: string | null
          file_size_bytes: number
          id?: string
          initiated_by?: string | null
          started_at: string
          status?: string
          storage_location: string
        }
        Update: {
          backup_no?: string
          backup_type?: string
          checksum_sha256?: string
          client_uuid?: string
          completed_at?: string
          created_at?: string
          error_message?: string | null
          file_size_bytes?: number
          id?: string
          initiated_by?: string | null
          started_at?: string
          status?: string
          storage_location?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_logs_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string
          branch_name: string | null
          channel_group: Database["public"]["Enums"]["payment_channel_group"]
          client_uuid: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          qr_code_url: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_name: string
          account_number: string
          bank_name: string
          branch_name?: string | null
          channel_group?: Database["public"]["Enums"]["payment_channel_group"]
          client_uuid: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          qr_code_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string
          branch_name?: string | null
          channel_group?: Database["public"]["Enums"]["payment_channel_group"]
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          qr_code_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_client_state_map: {
        Row: {
          client_visible_state: Database["public"]["Enums"]["client_visible_state"]
          created_at: string
          id: string
          internal_stage: Database["public"]["Enums"]["booking_stage"]
          timeline_step:
            | Database["public"]["Enums"]["client_timeline_step"]
            | null
        }
        Insert: {
          client_visible_state: Database["public"]["Enums"]["client_visible_state"]
          created_at?: string
          id?: string
          internal_stage: Database["public"]["Enums"]["booking_stage"]
          timeline_step?:
            | Database["public"]["Enums"]["client_timeline_step"]
            | null
        }
        Update: {
          client_visible_state?: Database["public"]["Enums"]["client_visible_state"]
          created_at?: string
          id?: string
          internal_stage?: Database["public"]["Enums"]["booking_stage"]
          timeline_step?:
            | Database["public"]["Enums"]["client_timeline_step"]
            | null
        }
        Relationships: []
      }
      booking_crew_lines: {
        Row: {
          accommodation: number
          booking_id: string
          client_uuid: string
          created_at: string
          created_by: string
          crew_member_id: string | null
          crew_role: Database["public"]["Enums"]["crew_role"]
          day_rate: number
          days: number
          id: string
          meals: number
          name: string
          overtime: number
          phone: string | null
          voided_at: string | null
        }
        Insert: {
          accommodation?: number
          booking_id: string
          client_uuid: string
          created_at?: string
          created_by: string
          crew_member_id?: string | null
          crew_role: Database["public"]["Enums"]["crew_role"]
          day_rate?: number
          days?: number
          id?: string
          meals?: number
          name: string
          overtime?: number
          phone?: string | null
          voided_at?: string | null
        }
        Update: {
          accommodation?: number
          booking_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string
          crew_member_id?: string | null
          crew_role?: Database["public"]["Enums"]["crew_role"]
          day_rate?: number
          days?: number
          id?: string
          meals?: number
          name?: string
          overtime?: number
          phone?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_crew_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_crew_lines_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_crew_lines_crew_member_id_fk"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_discounts: {
        Row: {
          applied_at: string
          applied_by: string
          approver_id: string | null
          audit_event_id: string
          booking_id: string
          branch_id: string
          client_uuid: string
          coupon_id: string | null
          created_at: string
          discount_source: Database["public"]["Enums"]["discount_source"]
          id: string
          percent: number
          reason: string | null
        }
        Insert: {
          applied_at?: string
          applied_by: string
          approver_id?: string | null
          audit_event_id: string
          booking_id: string
          branch_id: string
          client_uuid: string
          coupon_id?: string | null
          created_at?: string
          discount_source: Database["public"]["Enums"]["discount_source"]
          id?: string
          percent: number
          reason?: string | null
        }
        Update: {
          applied_at?: string
          applied_by?: string
          approver_id?: string | null
          audit_event_id?: string
          booking_id?: string
          branch_id?: string
          client_uuid?: string
          coupon_id?: string | null
          created_at?: string
          discount_source?: Database["public"]["Enums"]["discount_source"]
          id?: string
          percent?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_discounts_applied_by_fk"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_discounts_approver_id_fk"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_discounts_audit_event_id_fk"
            columns: ["audit_event_id"]
            isOneToOne: false
            referencedRelation: "audit_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_discounts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_discounts_branch_id_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_discounts_coupon_id_fk"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_documents: {
        Row: {
          booking_id: string
          client_uuid: string
          created_at: string
          created_by: string
          doc_type: Database["public"]["Enums"]["booking_document_type"]
          document_id: string
          id: string
          linked_at: string
          origin: Database["public"]["Enums"]["document_origin"]
          produced_in_session_id: string | null
        }
        Insert: {
          booking_id: string
          client_uuid: string
          created_at?: string
          created_by: string
          doc_type: Database["public"]["Enums"]["booking_document_type"]
          document_id: string
          id?: string
          linked_at?: string
          origin: Database["public"]["Enums"]["document_origin"]
          produced_in_session_id?: string | null
        }
        Update: {
          booking_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string
          doc_type?: Database["public"]["Enums"]["booking_document_type"]
          document_id?: string
          id?: string
          linked_at?: string
          origin?: Database["public"]["Enums"]["document_origin"]
          produced_in_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_documents_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_documents_document_id_fk"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_documents_produced_in_session_id_fk"
            columns: ["produced_in_session_id"]
            isOneToOne: false
            referencedRelation: "operation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_flags: {
        Row: {
          booking_id: string
          cleared_at: string | null
          cleared_by: string | null
          cleared_reason: string | null
          client_uuid: string
          created_at: string
          created_by: string
          flag: Database["public"]["Enums"]["booking_flag"]
          flag_type: Database["public"]["Enums"]["flag_type"]
          id: string
          observed_at: string
          observed_in_session_id: string | null
        }
        Insert: {
          booking_id: string
          cleared_at?: string | null
          cleared_by?: string | null
          cleared_reason?: string | null
          client_uuid: string
          created_at?: string
          created_by: string
          flag: Database["public"]["Enums"]["booking_flag"]
          flag_type: Database["public"]["Enums"]["flag_type"]
          id?: string
          observed_at: string
          observed_in_session_id?: string | null
        }
        Update: {
          booking_id?: string
          cleared_at?: string | null
          cleared_by?: string | null
          cleared_reason?: string | null
          client_uuid?: string
          created_at?: string
          created_by?: string
          flag?: Database["public"]["Enums"]["booking_flag"]
          flag_type?: Database["public"]["Enums"]["flag_type"]
          id?: string
          observed_at?: string
          observed_in_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_flags_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_flags_cleared_by_fk"
            columns: ["cleared_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_flags_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_flags_observed_in_session_id_fk"
            columns: ["observed_in_session_id"]
            isOneToOne: false
            referencedRelation: "operation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_line_units: {
        Row: {
          asset_id: string | null
          booking_line_id: string
          cleaning_done_at: string | null
          client_uuid: string
          condition: string | null
          created_at: string
          created_by: string
          damaged: boolean
          handover_session_id: string | null
          id: string
          is_required: boolean
          missing_reason: string | null
          packed: boolean
          packed_at: string | null
          packed_by: string | null
          packing_session_id: string | null
          qty: number
          reset_done_at: string | null
          return_session_id: string | null
          returned_at: string | null
          unit_state: Database["public"]["Enums"]["item_quantity_state"]
        }
        Insert: {
          asset_id?: string | null
          booking_line_id: string
          cleaning_done_at?: string | null
          client_uuid: string
          condition?: string | null
          created_at?: string
          created_by: string
          damaged?: boolean
          handover_session_id?: string | null
          id?: string
          is_required?: boolean
          missing_reason?: string | null
          packed?: boolean
          packed_at?: string | null
          packed_by?: string | null
          packing_session_id?: string | null
          qty?: number
          reset_done_at?: string | null
          return_session_id?: string | null
          returned_at?: string | null
          unit_state?: Database["public"]["Enums"]["item_quantity_state"]
        }
        Update: {
          asset_id?: string | null
          booking_line_id?: string
          cleaning_done_at?: string | null
          client_uuid?: string
          condition?: string | null
          created_at?: string
          created_by?: string
          damaged?: boolean
          handover_session_id?: string | null
          id?: string
          is_required?: boolean
          missing_reason?: string | null
          packed?: boolean
          packed_at?: string | null
          packed_by?: string | null
          packing_session_id?: string | null
          qty?: number
          reset_done_at?: string | null
          return_session_id?: string | null
          returned_at?: string | null
          unit_state?: Database["public"]["Enums"]["item_quantity_state"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_line_units_asset_id_fk"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_line_units_asset_id_fk"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "product_units_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_line_units_booking_line_id_fkey"
            columns: ["booking_line_id"]
            isOneToOne: false
            referencedRelation: "booking_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_line_units_booking_line_id_fkey"
            columns: ["booking_line_id"]
            isOneToOne: false
            referencedRelation: "booking_lines_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_line_units_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_line_units_handover_session_id_fk"
            columns: ["handover_session_id"]
            isOneToOne: false
            referencedRelation: "operation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_line_units_packed_by_fk"
            columns: ["packed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_line_units_packing_session_id_fk"
            columns: ["packing_session_id"]
            isOneToOne: false
            referencedRelation: "operation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_line_units_return_session_id_fk"
            columns: ["return_session_id"]
            isOneToOne: false
            referencedRelation: "operation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_lines: {
        Row: {
          booking_id: string
          bundle_id: string | null
          client_uuid: string
          created_at: string
          created_by: string
          days: number
          description: string | null
          discount_amount: number
          id: string
          is_included: boolean
          line_note: string | null
          line_type: Database["public"]["Enums"]["booking_line_type"]
          markup_amount: number | null
          parent_line_id: string | null
          product_id: string | null
          qty: number
          rate: number
          service_basis: Database["public"]["Enums"]["service_basis"] | null
          sort_order: number
          supplier_cost: number | null
          supplier_id: string | null
          voided_at: string | null
          voided_reason: string | null
        }
        Insert: {
          booking_id: string
          bundle_id?: string | null
          client_uuid: string
          created_at?: string
          created_by: string
          days?: number
          description?: string | null
          discount_amount?: number
          id?: string
          is_included?: boolean
          line_note?: string | null
          line_type: Database["public"]["Enums"]["booking_line_type"]
          markup_amount?: number | null
          parent_line_id?: string | null
          product_id?: string | null
          qty?: number
          rate?: number
          service_basis?: Database["public"]["Enums"]["service_basis"] | null
          sort_order?: number
          supplier_cost?: number | null
          supplier_id?: string | null
          voided_at?: string | null
          voided_reason?: string | null
        }
        Update: {
          booking_id?: string
          bundle_id?: string | null
          client_uuid?: string
          created_at?: string
          created_by?: string
          days?: number
          description?: string | null
          discount_amount?: number
          id?: string
          is_included?: boolean
          line_note?: string | null
          line_type?: Database["public"]["Enums"]["booking_line_type"]
          markup_amount?: number | null
          parent_line_id?: string | null
          product_id?: string | null
          qty?: number
          rate?: number
          service_basis?: Database["public"]["Enums"]["service_basis"] | null
          sort_order?: number
          supplier_cost?: number | null
          supplier_id?: string | null
          voided_at?: string | null
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_lines_bundle_id_fk"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_lines_bundle_id_fk"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_lines_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_lines_parent_line_id_fkey"
            columns: ["parent_line_id"]
            isOneToOne: false
            referencedRelation: "booking_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_lines_parent_line_id_fkey"
            columns: ["parent_line_id"]
            isOneToOne: false
            referencedRelation: "booking_lines_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_lines_product_id_fk"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_lines_product_id_fk"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_lines_supplier_id_fk"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_notes: {
        Row: {
          archived_at: string | null
          body: string
          booking_id: string
          booking_line_id: string | null
          client_uuid: string
          created_at: string
          created_by: string
          id: string
          note_type: Database["public"]["Enums"]["note_type"]
        }
        Insert: {
          archived_at?: string | null
          body: string
          booking_id: string
          booking_line_id?: string | null
          client_uuid: string
          created_at?: string
          created_by: string
          id?: string
          note_type: Database["public"]["Enums"]["note_type"]
        }
        Update: {
          archived_at?: string | null
          body?: string
          booking_id?: string
          booking_line_id?: string | null
          client_uuid?: string
          created_at?: string
          created_by?: string
          id?: string
          note_type?: Database["public"]["Enums"]["note_type"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_notes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_notes_booking_line_id_fkey"
            columns: ["booking_line_id"]
            isOneToOne: false
            referencedRelation: "booking_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_notes_booking_line_id_fkey"
            columns: ["booking_line_id"]
            isOneToOne: false
            referencedRelation: "booking_lines_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_notes_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_stage_transitions: {
        Row: {
          actor_id: string
          actor_role: string
          approved_by: string | null
          audit_event_id: string | null
          booking_id: string
          branch_id: string
          client_uuid: string
          created_at: string
          from_stage: Database["public"]["Enums"]["booking_stage"] | null
          id: string
          is_reversal: boolean
          occurred_at: string
          reason: string | null
          source: string | null
          to_stage: Database["public"]["Enums"]["booking_stage"]
        }
        Insert: {
          actor_id: string
          actor_role: string
          approved_by?: string | null
          audit_event_id?: string | null
          booking_id: string
          branch_id: string
          client_uuid: string
          created_at?: string
          from_stage?: Database["public"]["Enums"]["booking_stage"] | null
          id?: string
          is_reversal?: boolean
          occurred_at?: string
          reason?: string | null
          source?: string | null
          to_stage: Database["public"]["Enums"]["booking_stage"]
        }
        Update: {
          actor_id?: string
          actor_role?: string
          approved_by?: string | null
          audit_event_id?: string | null
          booking_id?: string
          branch_id?: string
          client_uuid?: string
          created_at?: string
          from_stage?: Database["public"]["Enums"]["booking_stage"] | null
          id?: string
          is_reversal?: boolean
          occurred_at?: string
          reason?: string | null
          source?: string | null
          to_stage?: Database["public"]["Enums"]["booking_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_stage_transitions_actor_id_fk"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_stage_transitions_approved_by_fk"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_stage_transitions_audit_event_id_fk"
            columns: ["audit_event_id"]
            isOneToOne: false
            referencedRelation: "audit_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_stage_transitions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_stage_transitions_branch_id_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_transport: {
        Row: {
          booking_id: string
          client_uuid: string
          created_at: string
          created_by: string
          delivery_charge: number
          driver_contact: string | null
          driver_id: string | null
          fuel_charge: number
          id: string
          number_plate: string | null
          special_instructions: string | null
          vehicle: string | null
          zero_charge_override_by: string | null
          zero_charge_override_reason: string | null
        }
        Insert: {
          booking_id: string
          client_uuid: string
          created_at?: string
          created_by: string
          delivery_charge?: number
          driver_contact?: string | null
          driver_id?: string | null
          fuel_charge?: number
          id?: string
          number_plate?: string | null
          special_instructions?: string | null
          vehicle?: string | null
          zero_charge_override_by?: string | null
          zero_charge_override_reason?: string | null
        }
        Update: {
          booking_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string
          delivery_charge?: number
          driver_contact?: string | null
          driver_id?: string | null
          fuel_charge?: number
          id?: string
          number_plate?: string | null
          special_instructions?: string | null
          vehicle?: string | null
          zero_charge_override_by?: string | null
          zero_charge_override_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_transport_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_transport_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_transport_driver_id_fk"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_transport_zero_charge_override_by_fk"
            columns: ["zero_charge_override_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          actual_return_at: string | null
          authorized_contact_id: string | null
          booking_no: string
          branch_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string
          client_uuid: string
          closed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          delivery_type: Database["public"]["Enums"]["delivery_type"]
          deposit_required: number
          id: string
          locked_at: string | null
          locked_by: string | null
          pickup_at: string
          pickup_location: string | null
          project: string | null
          quote_expires_at: string | null
          return_at: string
          return_location: string | null
          stage: Database["public"]["Enums"]["booking_stage"]
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          actual_return_at?: string | null
          authorized_contact_id?: string | null
          booking_no: string
          branch_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id: string
          client_uuid: string
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by: string
          delivery_type: Database["public"]["Enums"]["delivery_type"]
          deposit_required?: number
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          pickup_at: string
          pickup_location?: string | null
          project?: string | null
          quote_expires_at?: string | null
          return_at: string
          return_location?: string | null
          stage?: Database["public"]["Enums"]["booking_stage"]
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          actual_return_at?: string | null
          authorized_contact_id?: string | null
          booking_no?: string
          branch_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string
          client_uuid?: string
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
          deposit_required?: number
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          pickup_at?: string
          pickup_location?: string | null
          project?: string | null
          quote_expires_at?: string | null
          return_at?: string
          return_location?: string | null
          stage?: Database["public"]["Enums"]["booking_stage"]
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bookings_authorized_contact_id_fk"
            columns: ["authorized_contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_branch_id_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_cancelled_by_fk"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_client_id_fk"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_client_id_fk"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_contact_id_fk"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_locked_by_fk"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string
          branch_code: string
          client_uuid: string
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          is_headquarters: boolean
          name: string
          pan_vat_no: string
          phone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address: string
          branch_code: string
          client_uuid: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_headquarters?: boolean
          name: string
          pan_vat_no?: string
          phone: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string
          branch_code?: string
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_headquarters?: boolean
          name?: string
          pan_vat_no?: string
          phone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_batches: {
        Row: {
          batch_no: string
          channel: Database["public"]["Enums"]["channel_code"]
          client_uuid: string
          created_at: string
          created_by: string | null
          failed_count: number
          id: string
          name: string
          scheduled_for: string | null
          sent_count: number
          status: string
          target_segment: Database["public"]["Enums"]["client_segment"] | null
          total_recipients: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          batch_no: string
          channel: Database["public"]["Enums"]["channel_code"]
          client_uuid: string
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          name: string
          scheduled_for?: string | null
          sent_count?: number
          status?: string
          target_segment?: Database["public"]["Enums"]["client_segment"] | null
          total_recipients?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          batch_no?: string
          channel?: Database["public"]["Enums"]["channel_code"]
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          name?: string
          scheduled_for?: string | null
          sent_count?: number
          status?: string
          target_segment?: Database["public"]["Enums"]["client_segment"] | null
          total_recipients?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_batches_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bundle_items: {
        Row: {
          bundle_id: string
          client_uuid: string
          created_at: string
          created_by: string | null
          days: number
          id: string
          is_mandatory: boolean
          product_id: string
          quantity: number
          sort_order: number
        }
        Insert: {
          bundle_id: string
          client_uuid: string
          created_at?: string
          created_by?: string | null
          days?: number
          id?: string
          is_mandatory?: boolean
          product_id: string
          quantity?: number
          sort_order?: number
        }
        Update: {
          bundle_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          days?: number
          id?: string
          is_mandatory?: boolean
          product_id?: string
          quantity?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_items_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v"
            referencedColumns: ["id"]
          },
        ]
      }
      bundles: {
        Row: {
          bundle_code: string
          category_id: string | null
          client_uuid: string
          created_at: string
          created_by: string | null
          daily_rate: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
          weekly_rate: number
        }
        Insert: {
          bundle_code: string
          category_id?: string | null
          client_uuid: string
          created_at?: string
          created_by?: string | null
          daily_rate?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
          weekly_rate?: number
        }
        Update: {
          bundle_code?: string
          category_id?: string | null
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          daily_rate?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
          weekly_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "bundles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundles_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundles_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          absorbed_amount: number
          assessed_amount: number
          case_no: string
          charged_to_client_amount: number
          client_uuid: string
          counterparty_kind: Database["public"]["Enums"]["case_counterparty_kind"]
          counterparty_name: string
          created_at: string
          created_by: string
          deposit_applied_amount: number
          deposit_held_amount: number
          disposition: string | null
          flags: Database["public"]["Enums"]["case_flag"][]
          id: string
          insurance_claimed_amount: number
          linked_booking_id: string | null
          opened_at: string
          owner_id: string
          priority: Database["public"]["Enums"]["case_priority"]
          recovered_from_partner_amount: number
          settled_at: string | null
          status: Database["public"]["Enums"]["case_status"]
          title: string
          type: Database["public"]["Enums"]["case_type"]
          updated_at: string
          warranty_covered_amount: number
        }
        Insert: {
          absorbed_amount?: number
          assessed_amount?: number
          case_no: string
          charged_to_client_amount?: number
          client_uuid: string
          counterparty_kind: Database["public"]["Enums"]["case_counterparty_kind"]
          counterparty_name: string
          created_at?: string
          created_by: string
          deposit_applied_amount?: number
          deposit_held_amount?: number
          disposition?: string | null
          flags?: Database["public"]["Enums"]["case_flag"][]
          id?: string
          insurance_claimed_amount?: number
          linked_booking_id?: string | null
          opened_at?: string
          owner_id: string
          priority: Database["public"]["Enums"]["case_priority"]
          recovered_from_partner_amount?: number
          settled_at?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          title: string
          type: Database["public"]["Enums"]["case_type"]
          updated_at?: string
          warranty_covered_amount?: number
        }
        Update: {
          absorbed_amount?: number
          assessed_amount?: number
          case_no?: string
          charged_to_client_amount?: number
          client_uuid?: string
          counterparty_kind?: Database["public"]["Enums"]["case_counterparty_kind"]
          counterparty_name?: string
          created_at?: string
          created_by?: string
          deposit_applied_amount?: number
          deposit_held_amount?: number
          disposition?: string | null
          flags?: Database["public"]["Enums"]["case_flag"][]
          id?: string
          insurance_claimed_amount?: number
          linked_booking_id?: string | null
          opened_at?: string
          owner_id?: string
          priority?: Database["public"]["Enums"]["case_priority"]
          recovered_from_partner_amount?: number
          settled_at?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          title?: string
          type?: Database["public"]["Enums"]["case_type"]
          updated_at?: string
          warranty_covered_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_linked_booking_id_fkey"
            columns: ["linked_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      category_checklist_tasks: {
        Row: {
          category_id: string
          client_uuid: string
          created_at: string
          created_by: string
          effective_from: string
          id: string
          is_required: boolean
          label: string
          mode: Database["public"]["Enums"]["cleaning_mode"]
          retired_at: string | null
          sort_order: number
          updated_at: string
          version: number
        }
        Insert: {
          category_id: string
          client_uuid: string
          created_at?: string
          created_by: string
          effective_from?: string
          id?: string
          is_required?: boolean
          label: string
          mode: Database["public"]["Enums"]["cleaning_mode"]
          retired_at?: string | null
          sort_order?: number
          updated_at?: string
          version?: number
        }
        Update: {
          category_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string
          effective_from?: string
          id?: string
          is_required?: boolean
          label?: string
          mode?: Database["public"]["Enums"]["cleaning_mode"]
          retired_at?: string | null
          sort_order?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "category_checklist_tasks_category_id_fk"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_checklist_tasks_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      charges: {
        Row: {
          amount: number
          booking_id: string
          charge_no: string
          client_uuid: string
          created_at: string
          created_by: string
          damage_finding_id: string | null
          id: string
          invoice_line_id: string | null
          late_fee_finding_id: string | null
          posted_at: string | null
          source_type: Database["public"]["Enums"]["charge_source_type"]
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          amount: number
          booking_id: string
          charge_no: string
          client_uuid: string
          created_at?: string
          created_by: string
          damage_finding_id?: string | null
          id?: string
          invoice_line_id?: string | null
          late_fee_finding_id?: string | null
          posted_at?: string | null
          source_type: Database["public"]["Enums"]["charge_source_type"]
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string
          charge_no?: string
          client_uuid?: string
          created_at?: string
          created_by?: string
          damage_finding_id?: string | null
          id?: string
          invoice_line_id?: string | null
          late_fee_finding_id?: string | null
          posted_at?: string | null
          source_type?: Database["public"]["Enums"]["charge_source_type"]
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "charges_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_damage_finding_id_fkey"
            columns: ["damage_finding_id"]
            isOneToOne: false
            referencedRelation: "damage_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_damage_finding_id_fkey"
            columns: ["damage_finding_id"]
            isOneToOne: false
            referencedRelation: "damage_findings_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "invoice_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_late_fee_finding_id_fkey"
            columns: ["late_fee_finding_id"]
            isOneToOne: false
            referencedRelation: "late_fee_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_late_fee_finding_id_fkey"
            columns: ["late_fee_finding_id"]
            isOneToOne: false
            referencedRelation: "late_fee_findings_v"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_queue_entries: {
        Row: {
          assigned_to: string | null
          booking_id: string | null
          checklist_version: number | null
          clean_completed_at: string | null
          cleaned_by: string | null
          client_uuid: string
          completed_at: string | null
          created_at: string
          created_by: string
          entered_queue_at: string
          first_task_at: string | null
          id: string
          problem_state: Database["public"]["Enums"]["cleaning_problem_state"]
          qc_at: string | null
          qc_by: string | null
          qc_fail_reason: string | null
          qc_skip_reason: string | null
          qc_skipped: boolean
          requires_clean: boolean
          requires_reset: boolean
          reset_completed_at: string | null
          return_line_id: string | null
          state: Database["public"]["Enums"]["cleaning_queue_state"]
          unit_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          booking_id?: string | null
          checklist_version?: number | null
          clean_completed_at?: string | null
          cleaned_by?: string | null
          client_uuid: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          entered_queue_at?: string
          first_task_at?: string | null
          id?: string
          problem_state?: Database["public"]["Enums"]["cleaning_problem_state"]
          qc_at?: string | null
          qc_by?: string | null
          qc_fail_reason?: string | null
          qc_skip_reason?: string | null
          qc_skipped?: boolean
          requires_clean?: boolean
          requires_reset?: boolean
          reset_completed_at?: string | null
          return_line_id?: string | null
          state?: Database["public"]["Enums"]["cleaning_queue_state"]
          unit_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          booking_id?: string | null
          checklist_version?: number | null
          clean_completed_at?: string | null
          cleaned_by?: string | null
          client_uuid?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          entered_queue_at?: string
          first_task_at?: string | null
          id?: string
          problem_state?: Database["public"]["Enums"]["cleaning_problem_state"]
          qc_at?: string | null
          qc_by?: string | null
          qc_fail_reason?: string | null
          qc_skip_reason?: string | null
          qc_skipped?: boolean
          requires_clean?: boolean
          requires_reset?: boolean
          reset_completed_at?: string | null
          return_line_id?: string | null
          state?: Database["public"]["Enums"]["cleaning_queue_state"]
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_queue_entries_assigned_to_fk"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_queue_entries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_queue_entries_cleaned_by_fk"
            columns: ["cleaned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_queue_entries_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_queue_entries_qc_by_fk"
            columns: ["qc_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_queue_entries_return_line_id_fkey"
            columns: ["return_line_id"]
            isOneToOne: false
            referencedRelation: "return_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_queue_entries_unit_id_fk"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_queue_entries_unit_id_fk"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "product_units_v"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_task_results: {
        Row: {
          batch_ref: string | null
          checklist_task_id: string
          checklist_version: number
          cleaning_queue_entry_id: string
          client_uuid: string
          completed: boolean
          completed_at: string
          created_at: string
          created_by: string
          id: string
          mode: Database["public"]["Enums"]["cleaning_mode"]
        }
        Insert: {
          batch_ref?: string | null
          checklist_task_id: string
          checklist_version: number
          cleaning_queue_entry_id: string
          client_uuid: string
          completed?: boolean
          completed_at?: string
          created_at?: string
          created_by: string
          id?: string
          mode: Database["public"]["Enums"]["cleaning_mode"]
        }
        Update: {
          batch_ref?: string | null
          checklist_task_id?: string
          checklist_version?: number
          cleaning_queue_entry_id?: string
          client_uuid?: string
          completed?: boolean
          completed_at?: string
          created_at?: string
          created_by?: string
          id?: string
          mode?: Database["public"]["Enums"]["cleaning_mode"]
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_task_results_checklist_task_fk"
            columns: ["checklist_task_id"]
            isOneToOne: false
            referencedRelation: "category_checklist_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_task_results_cleaning_queue_entry_id_fkey"
            columns: ["cleaning_queue_entry_id"]
            isOneToOne: false
            referencedRelation: "cleaning_queue_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_task_results_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_change_requests: {
        Row: {
          client_id: string
          client_uuid: string
          created_at: string
          id: string
          portal_user_id: string
          proposed_changes: Json
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["change_request_status"]
          submitted_ip: unknown
          voided_at: string | null
        }
        Insert: {
          client_id: string
          client_uuid: string
          created_at?: string
          id?: string
          portal_user_id: string
          proposed_changes: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["change_request_status"]
          submitted_ip?: unknown
          voided_at?: string | null
        }
        Update: {
          client_id?: string
          client_uuid?: string
          created_at?: string
          id?: string
          portal_user_id?: string
          proposed_changes?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["change_request_status"]
          submitted_ip?: unknown
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_change_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_change_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_change_requests_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_change_requests_reviewed_by_fk"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_channel_identities: {
        Row: {
          address: string
          channel: Database["public"]["Enums"]["channel_code"]
          client_id: string
          client_uuid: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          deactivated_at: string | null
          deactivation_reason: string | null
          id: string
          is_active: boolean
          is_on_whatsapp: boolean | null
        }
        Insert: {
          address: string
          channel: Database["public"]["Enums"]["channel_code"]
          client_id: string
          client_uuid: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          deactivation_reason?: string | null
          id?: string
          is_active?: boolean
          is_on_whatsapp?: boolean | null
        }
        Update: {
          address?: string
          channel?: Database["public"]["Enums"]["channel_code"]
          client_id?: string
          client_uuid?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          deactivation_reason?: string | null
          id?: string
          is_active?: boolean
          is_on_whatsapp?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "client_channel_identities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_channel_identities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_channel_identities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_channel_identities_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_commercial_overrides: {
        Row: {
          approved_at: string | null
          approver_user_id: string | null
          client_id: string
          client_uuid: string
          created_at: string
          created_by: string
          id: string
          kind: Database["public"]["Enums"]["commercial_override_kind"]
          reason: string
          requested_credit_limit: number | null
          requested_payment_terms:
            | Database["public"]["Enums"]["payment_terms"]
            | null
          status: Database["public"]["Enums"]["commercial_override_status"]
          voided_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approver_user_id?: string | null
          client_id: string
          client_uuid: string
          created_at?: string
          created_by: string
          id?: string
          kind: Database["public"]["Enums"]["commercial_override_kind"]
          reason: string
          requested_credit_limit?: number | null
          requested_payment_terms?:
            | Database["public"]["Enums"]["payment_terms"]
            | null
          status?: Database["public"]["Enums"]["commercial_override_status"]
          voided_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approver_user_id?: string | null
          client_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string
          id?: string
          kind?: Database["public"]["Enums"]["commercial_override_kind"]
          reason?: string
          requested_credit_limit?: number | null
          requested_payment_terms?:
            | Database["public"]["Enums"]["payment_terms"]
            | null
          status?: Database["public"]["Enums"]["commercial_override_status"]
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_commercial_overrides_approver_user_id_fk"
            columns: ["approver_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_commercial_overrides_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_commercial_overrides_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_commercial_overrides_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          client_uuid: string
          created_at: string
          created_by: string | null
          deactivated_at: string | null
          deactivated_by: string | null
          designation: string | null
          email: string | null
          full_name: string
          id: string
          is_primary: boolean
          phone: string | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
        }
        Insert: {
          client_id: string
          client_uuid: string
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          designation?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_primary?: boolean
          phone?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          designation?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean
          phone?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_deactivated_by_fk"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_documents: {
        Row: {
          archived_at: string | null
          client_id: string
          client_uuid: string
          contact_id: string | null
          created_at: string
          file_name: string
          file_size_bytes: number
          id: string
          kind: Database["public"]["Enums"]["client_document_kind"]
          mime_type: string
          requested_reason: string | null
          signed_at: string | null
          signed_by_portal_user_id: string | null
          status: Database["public"]["Enums"]["client_document_status"]
          storage_path: string
          uploaded_by_portal_user_id: string | null
          uploaded_by_staff_id: string | null
          uploaded_ip: unknown
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          archived_at?: string | null
          client_id: string
          client_uuid: string
          contact_id?: string | null
          created_at?: string
          file_name: string
          file_size_bytes: number
          id?: string
          kind: Database["public"]["Enums"]["client_document_kind"]
          mime_type: string
          requested_reason?: string | null
          signed_at?: string | null
          signed_by_portal_user_id?: string | null
          status?: Database["public"]["Enums"]["client_document_status"]
          storage_path: string
          uploaded_by_portal_user_id?: string | null
          uploaded_by_staff_id?: string | null
          uploaded_ip?: unknown
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          archived_at?: string | null
          client_id?: string
          client_uuid?: string
          contact_id?: string | null
          created_at?: string
          file_name?: string
          file_size_bytes?: number
          id?: string
          kind?: Database["public"]["Enums"]["client_document_kind"]
          mime_type?: string
          requested_reason?: string | null
          signed_at?: string | null
          signed_by_portal_user_id?: string | null
          status?: Database["public"]["Enums"]["client_document_status"]
          storage_path?: string
          uploaded_by_portal_user_id?: string | null
          uploaded_by_staff_id?: string | null
          uploaded_ip?: unknown
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_signed_by_portal_user_id_fkey"
            columns: ["signed_by_portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_uploaded_by_portal_user_id_fkey"
            columns: ["uploaded_by_portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_uploaded_by_staff_id_fk"
            columns: ["uploaded_by_staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_verified_by_fk"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_flags: {
        Row: {
          client_id: string
          client_uuid: string
          created_at: string
          created_by: string | null
          flag_type: Database["public"]["Enums"]["client_flag_type"]
          id: string
          reason: string | null
          removal_reason: string | null
          removed_at: string | null
          removed_by: string | null
          source: Database["public"]["Enums"]["flag_source"]
        }
        Insert: {
          client_id: string
          client_uuid: string
          created_at?: string
          created_by?: string | null
          flag_type: Database["public"]["Enums"]["client_flag_type"]
          id?: string
          reason?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          source?: Database["public"]["Enums"]["flag_source"]
        }
        Update: {
          client_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          flag_type?: Database["public"]["Enums"]["client_flag_type"]
          id?: string
          reason?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          source?: Database["public"]["Enums"]["flag_source"]
        }
        Relationships: [
          {
            foreignKeyName: "client_flags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_flags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_flags_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_flags_removed_by_fk"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_marketing_consents: {
        Row: {
          channel: Database["public"]["Enums"]["channel_code"]
          client_id: string
          client_uuid: string
          created_at: string
          id: string
          opt_in_actor_id: string | null
          opt_in_source: string | null
          opt_out_origin_channel:
            | Database["public"]["Enums"]["channel_code"]
            | null
          opted_in_at: string | null
          opted_out_at: string | null
          state: Database["public"]["Enums"]["marketing_consent_state"]
          updated_at: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["channel_code"]
          client_id: string
          client_uuid: string
          created_at?: string
          id?: string
          opt_in_actor_id?: string | null
          opt_in_source?: string | null
          opt_out_origin_channel?:
            | Database["public"]["Enums"]["channel_code"]
            | null
          opted_in_at?: string | null
          opted_out_at?: string | null
          state?: Database["public"]["Enums"]["marketing_consent_state"]
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["channel_code"]
          client_id?: string
          client_uuid?: string
          created_at?: string
          id?: string
          opt_in_actor_id?: string | null
          opt_in_source?: string | null
          opt_out_origin_channel?:
            | Database["public"]["Enums"]["channel_code"]
            | null
          opted_in_at?: string | null
          opted_out_at?: string | null
          state?: Database["public"]["Enums"]["marketing_consent_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_marketing_consents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_marketing_consents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_marketing_consents_opt_in_actor_id_fk"
            columns: ["opt_in_actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_memberships: {
        Row: {
          client_id: string
          client_uuid: string
          created_at: string
          created_by: string | null
          fee_paid: number | null
          id: string
          join_date: string
          plan_id: string
          superseded_at: string | null
          superseded_by_id: string | null
        }
        Insert: {
          client_id: string
          client_uuid: string
          created_at?: string
          created_by?: string | null
          fee_paid?: number | null
          id?: string
          join_date: string
          plan_id: string
          superseded_at?: string | null
          superseded_by_id?: string | null
        }
        Update: {
          client_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          fee_paid?: number | null
          id?: string
          join_date?: string
          plan_id?: string
          superseded_at?: string | null
          superseded_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_memberships_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "client_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "client_memberships_v"
            referencedColumns: ["id"]
          },
        ]
      }
      client_merges: {
        Row: {
          client_uuid: string
          created_at: string
          created_by: string
          id: string
          merged_client_id: string
          moved_summary: Json
          surviving_client_id: string
          typed_confirmation: string
        }
        Insert: {
          client_uuid: string
          created_at?: string
          created_by: string
          id?: string
          merged_client_id: string
          moved_summary: Json
          surviving_client_id: string
          typed_confirmation: string
        }
        Update: {
          client_uuid?: string
          created_at?: string
          created_by?: string
          id?: string
          merged_client_id?: string
          moved_summary?: Json
          surviving_client_id?: string
          typed_confirmation?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_merges_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_merges_merged_client_id_fkey"
            columns: ["merged_client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_merges_merged_client_id_fkey"
            columns: ["merged_client_id"]
            isOneToOne: true
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_merges_surviving_client_id_fkey"
            columns: ["surviving_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_merges_surviving_client_id_fkey"
            columns: ["surviving_client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tax_profiles: {
        Row: {
          client_id: string
          client_uuid: string
          created_at: string
          created_by: string | null
          effective_from: string
          exemption_document_id: string | null
          id: string
          profile_type: Database["public"]["Enums"]["customer_tax_profile"]
          superseded_at: string | null
        }
        Insert: {
          client_id: string
          client_uuid: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          exemption_document_id?: string | null
          id?: string
          profile_type: Database["public"]["Enums"]["customer_tax_profile"]
          superseded_at?: string | null
        }
        Update: {
          client_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          exemption_document_id?: string | null
          id?: string
          profile_type?: Database["public"]["Enums"]["customer_tax_profile"]
          superseded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_tax_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tax_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tax_profiles_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tax_profiles_exemption_document_id_fk"
            columns: ["exemption_document_id"]
            isOneToOne: false
            referencedRelation: "document_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address_line: string | null
          approved_credit_limit: number | null
          assigned_staff_id: string | null
          billing_address: string | null
          business_registration: string | null
          city: string | null
          client_code: string
          client_since: string
          client_uuid: string
          country: string
          created_at: string
          created_by: string | null
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          district: string | null
          email: string | null
          government_id_kind:
            | Database["public"]["Enums"]["government_id_kind"]
            | null
          government_id_number: string | null
          id: string
          marketing_photo_consent: boolean
          merged_into_client_id: string | null
          name: string
          notes: string | null
          org_subtype:
            | Database["public"]["Enums"]["client_organisation_subtype"]
            | null
          pan_vat: string | null
          payment_terms: Database["public"]["Enums"]["payment_terms"]
          phone: string
          portal_default_language: Database["public"]["Enums"]["portal_language"]
          postal_code: string | null
          preferred_contact_channels: Database["public"]["Enums"]["preferred_contact_channel"][]
          professions: Database["public"]["Enums"]["client_profession"][]
          referred_by_client_id: string | null
          segments: Database["public"]["Enums"]["client_segment"][]
          source: string | null
          status: Database["public"]["Enums"]["client_status"]
          tags: string[]
          type_parent: Database["public"]["Enums"]["client_type_parent"] | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address_line?: string | null
          approved_credit_limit?: number | null
          assigned_staff_id?: string | null
          billing_address?: string | null
          business_registration?: string | null
          city?: string | null
          client_code: string
          client_since?: string
          client_uuid: string
          country?: string
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          district?: string | null
          email?: string | null
          government_id_kind?:
            | Database["public"]["Enums"]["government_id_kind"]
            | null
          government_id_number?: string | null
          id?: string
          marketing_photo_consent?: boolean
          merged_into_client_id?: string | null
          name: string
          notes?: string | null
          org_subtype?:
            | Database["public"]["Enums"]["client_organisation_subtype"]
            | null
          pan_vat?: string | null
          payment_terms?: Database["public"]["Enums"]["payment_terms"]
          phone: string
          portal_default_language?: Database["public"]["Enums"]["portal_language"]
          postal_code?: string | null
          preferred_contact_channels?: Database["public"]["Enums"]["preferred_contact_channel"][]
          professions?: Database["public"]["Enums"]["client_profession"][]
          referred_by_client_id?: string | null
          segments?: Database["public"]["Enums"]["client_segment"][]
          source?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          tags?: string[]
          type_parent?: Database["public"]["Enums"]["client_type_parent"] | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_line?: string | null
          approved_credit_limit?: number | null
          assigned_staff_id?: string | null
          billing_address?: string | null
          business_registration?: string | null
          city?: string | null
          client_code?: string
          client_since?: string
          client_uuid?: string
          country?: string
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          district?: string | null
          email?: string | null
          government_id_kind?:
            | Database["public"]["Enums"]["government_id_kind"]
            | null
          government_id_number?: string | null
          id?: string
          marketing_photo_consent?: boolean
          merged_into_client_id?: string | null
          name?: string
          notes?: string | null
          org_subtype?:
            | Database["public"]["Enums"]["client_organisation_subtype"]
            | null
          pan_vat?: string | null
          payment_terms?: Database["public"]["Enums"]["payment_terms"]
          phone?: string
          portal_default_language?: Database["public"]["Enums"]["portal_language"]
          postal_code?: string | null
          preferred_contact_channels?: Database["public"]["Enums"]["preferred_contact_channel"][]
          professions?: Database["public"]["Enums"]["client_profession"][]
          referred_by_client_id?: string | null
          segments?: Database["public"]["Enums"]["client_segment"][]
          source?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          tags?: string[]
          type_parent?: Database["public"]["Enums"]["client_type_parent"] | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_assigned_staff_id_fk"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_deactivated_by_fk"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_merged_into_client_id_fkey"
            columns: ["merged_into_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_merged_into_client_id_fkey"
            columns: ["merged_into_client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_referred_by_client_id_fkey"
            columns: ["referred_by_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_referred_by_client_id_fkey"
            columns: ["referred_by_client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
        ]
      }
      containers: {
        Row: {
          barcode: string | null
          branch_id: string
          capacity_slots: number
          category: string | null
          client_uuid: string
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          max_weight_kg: number | null
          name: string
          qr_code: string | null
          status: string
          storage_zone_id: string | null
          updated_at: string
          updated_by: string | null
          warehouse_id: string
        }
        Insert: {
          barcode?: string | null
          branch_id: string
          capacity_slots?: number
          category?: string | null
          client_uuid: string
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          max_weight_kg?: number | null
          name: string
          qr_code?: string | null
          status?: string
          storage_zone_id?: string | null
          updated_at?: string
          updated_by?: string | null
          warehouse_id: string
        }
        Update: {
          barcode?: string | null
          branch_id?: string
          capacity_slots?: number
          category?: string | null
          client_uuid?: string
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          max_weight_kg?: number | null
          name?: string
          qr_code?: string | null
          status?: string
          storage_zone_id?: string | null
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "containers_branch_id_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "containers_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "containers_storage_zone_id_fk"
            columns: ["storage_zone_id"]
            isOneToOne: false
            referencedRelation: "storage_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "containers_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "containers_warehouse_id_fk"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          booking_id: string
          client_id: string
          client_uuid: string
          coupon_id: string
          discount_amount: number
          id: string
          redeemed_at: string
          redeemed_by: string | null
        }
        Insert: {
          booking_id: string
          client_id: string
          client_uuid: string
          coupon_id: string
          discount_amount: number
          id?: string
          redeemed_at?: string
          redeemed_by?: string | null
        }
        Update: {
          booking_id?: string
          client_id?: string
          client_uuid?: string
          coupon_id?: string
          discount_amount?: number
          id?: string
          redeemed_at?: string
          redeemed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_redeemed_by_fk"
            columns: ["redeemed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          client_uuid: string
          code: string
          created_at: string
          created_by: string | null
          current_redemptions: number
          description: string | null
          discount_percent: number
          id: string
          is_active: boolean
          max_discount_amount: number | null
          max_redemptions: number | null
          min_booking_amount: number
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_until: string
        }
        Insert: {
          client_uuid: string
          code: string
          created_at?: string
          created_by?: string | null
          current_redemptions?: number
          description?: string | null
          discount_percent: number
          id?: string
          is_active?: boolean
          max_discount_amount?: number | null
          max_redemptions?: number | null
          min_booking_amount?: number
          updated_at?: string
          updated_by?: string | null
          valid_from: string
          valid_until: string
        }
        Update: {
          client_uuid?: string
          code?: string
          created_at?: string
          created_by?: string | null
          current_redemptions?: number
          description?: string | null
          discount_percent?: number
          id?: string
          is_active?: boolean
          max_discount_amount?: number | null
          max_redemptions?: number | null
          min_booking_amount?: number
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupons_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_assignments: {
        Row: {
          booking_id: string
          call_time: string
          client_uuid: string
          created_at: string
          created_by: string | null
          crew_id: string
          daily_rate: number
          days: number
          id: string
          line_total: number
          notes: string | null
          role_on_shoot: string
          updated_at: string
          updated_by: string | null
          wrap_time: string | null
        }
        Insert: {
          booking_id: string
          call_time: string
          client_uuid: string
          created_at?: string
          created_by?: string | null
          crew_id: string
          daily_rate?: number
          days?: number
          id?: string
          line_total?: number
          notes?: string | null
          role_on_shoot: string
          updated_at?: string
          updated_by?: string | null
          wrap_time?: string | null
        }
        Update: {
          booking_id?: string
          call_time?: string
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          crew_id?: string
          daily_rate?: number
          days?: number
          id?: string
          line_total?: number
          notes?: string | null
          role_on_shoot?: string
          updated_at?: string
          updated_by?: string | null
          wrap_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_assignments_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_profiles_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_assignments_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_profiles_v2_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_assignments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_bookings: {
        Row: {
          booking_id: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          client_uuid: string
          conflict_override_at: string | null
          conflict_override_by: string | null
          conflict_override_reason: string | null
          created_at: string
          created_by: string
          crew_booking_no: string
          crew_member_id: string | null
          day_rate: number
          days: number
          end_date: string
          id: string
          location: string | null
          payout_state: Database["public"]["Enums"]["crew_payout_state"]
          position: string
          production_id: string | null
          start_date: string
          state: Database["public"]["Enums"]["crew_booking_state"]
          travel_warning_acknowledged_at: string | null
          travel_warning_acknowledged_by: string | null
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_uuid: string
          conflict_override_at?: string | null
          conflict_override_by?: string | null
          conflict_override_reason?: string | null
          created_at?: string
          created_by: string
          crew_booking_no: string
          crew_member_id?: string | null
          day_rate: number
          days?: number
          end_date: string
          id?: string
          location?: string | null
          payout_state?: Database["public"]["Enums"]["crew_payout_state"]
          position: string
          production_id?: string | null
          start_date: string
          state?: Database["public"]["Enums"]["crew_booking_state"]
          travel_warning_acknowledged_at?: string | null
          travel_warning_acknowledged_by?: string | null
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_uuid?: string
          conflict_override_at?: string | null
          conflict_override_by?: string | null
          conflict_override_reason?: string | null
          created_at?: string
          created_by?: string
          crew_booking_no?: string
          crew_member_id?: string | null
          day_rate?: number
          days?: number
          end_date?: string
          id?: string
          location?: string | null
          payout_state?: Database["public"]["Enums"]["crew_payout_state"]
          position?: string
          production_id?: string | null
          start_date?: string
          state?: Database["public"]["Enums"]["crew_booking_state"]
          travel_warning_acknowledged_at?: string | null
          travel_warning_acknowledged_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_bookings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_bookings_conflict_override_by_fk"
            columns: ["conflict_override_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_bookings_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_bookings_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_bookings_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_bookings_travel_warning_acknowledged_by_fk"
            columns: ["travel_warning_acknowledged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_documents: {
        Row: {
          archived_at: string | null
          client_uuid: string
          created_at: string
          created_by: string
          crew_member_id: string
          doc_type: Database["public"]["Enums"]["crew_document_type"]
          evidence_file_id: string
          expires_on: string | null
          expiry_acknowledged_at: string | null
          expiry_acknowledged_by: string | null
          id: string
          retention_until: string | null
        }
        Insert: {
          archived_at?: string | null
          client_uuid: string
          created_at?: string
          created_by: string
          crew_member_id: string
          doc_type: Database["public"]["Enums"]["crew_document_type"]
          evidence_file_id: string
          expires_on?: string | null
          expiry_acknowledged_at?: string | null
          expiry_acknowledged_by?: string | null
          id?: string
          retention_until?: string | null
        }
        Update: {
          archived_at?: string | null
          client_uuid?: string
          created_at?: string
          created_by?: string
          crew_member_id?: string
          doc_type?: Database["public"]["Enums"]["crew_document_type"]
          evidence_file_id?: string
          expires_on?: string | null
          expiry_acknowledged_at?: string | null
          expiry_acknowledged_by?: string | null
          id?: string
          retention_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_documents_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_documents_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_documents_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_documents_evidence_file_id_fkey"
            columns: ["evidence_file_id"]
            isOneToOne: false
            referencedRelation: "evidence_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_documents_expiry_acknowledged_by_fk"
            columns: ["expiry_acknowledged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_equipment_assignments: {
        Row: {
          asset_id: string
          booking_id: string
          client_uuid: string
          created_at: string
          created_by: string
          crew_booking_id: string
          id: string
          note: string | null
          released_at: string | null
          released_by: string | null
        }
        Insert: {
          asset_id: string
          booking_id: string
          client_uuid: string
          created_at?: string
          created_by: string
          crew_booking_id: string
          id?: string
          note?: string | null
          released_at?: string | null
          released_by?: string | null
        }
        Update: {
          asset_id?: string
          booking_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string
          crew_booking_id?: string
          id?: string
          note?: string | null
          released_at?: string | null
          released_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_equipment_assignments_asset_id_fk"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_equipment_assignments_asset_id_fk"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "product_units_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_equipment_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_equipment_assignments_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_equipment_assignments_crew_booking_id_fkey"
            columns: ["crew_booking_id"]
            isOneToOne: false
            referencedRelation: "crew_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_equipment_assignments_crew_booking_id_fkey"
            columns: ["crew_booking_id"]
            isOneToOne: false
            referencedRelation: "crew_bookings_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_equipment_assignments_released_by_fk"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_leaves: {
        Row: {
          cancelled_at: string | null
          client_uuid: string
          created_at: string
          created_by: string
          crew_member_id: string
          end_date: string
          id: string
          reason: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          client_uuid: string
          created_at?: string
          created_by: string
          crew_member_id: string
          end_date: string
          id?: string
          reason?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          client_uuid?: string
          created_at?: string
          created_by?: string
          crew_member_id?: string
          end_date?: string
          id?: string
          reason?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_leaves_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_leaves_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_leaves_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members_v"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_members: {
        Row: {
          client_uuid: string
          created_at: string
          created_by: string
          day_rate: number | null
          deactivated_at: string | null
          engagement_type: Database["public"]["Enums"]["crew_engagement_type"]
          full_name: string
          id: string
          internal_note: string | null
          pan_status: Database["public"]["Enums"]["crew_pan_status"]
          phone: string | null
          position: string
          updated_at: string
          withholding_rate: number | null
        }
        Insert: {
          client_uuid: string
          created_at?: string
          created_by: string
          day_rate?: number | null
          deactivated_at?: string | null
          engagement_type: Database["public"]["Enums"]["crew_engagement_type"]
          full_name: string
          id?: string
          internal_note?: string | null
          pan_status: Database["public"]["Enums"]["crew_pan_status"]
          phone?: string | null
          position: string
          updated_at?: string
          withholding_rate?: number | null
        }
        Update: {
          client_uuid?: string
          created_at?: string
          created_by?: string
          day_rate?: number | null
          deactivated_at?: string | null
          engagement_type?: Database["public"]["Enums"]["crew_engagement_type"]
          full_name?: string
          id?: string
          internal_note?: string | null
          pan_status?: Database["public"]["Enums"]["crew_pan_status"]
          phone?: string | null
          position?: string
          updated_at?: string
          withholding_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_members_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_profiles_v2: {
        Row: {
          client_uuid: string
          created_at: string
          created_by: string | null
          crew_code: string
          daily_rate: number
          email: string | null
          full_name: string
          hourly_rate: number
          id: string
          is_active: boolean
          is_internal_staff: boolean
          mobile: string
          primary_role: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_uuid: string
          created_at?: string
          created_by?: string | null
          crew_code: string
          daily_rate?: number
          email?: string | null
          full_name: string
          hourly_rate?: number
          id?: string
          is_active?: boolean
          is_internal_staff?: boolean
          mobile: string
          primary_role: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          crew_code?: string
          daily_rate?: number
          email?: string | null
          full_name?: string
          hourly_rate?: number
          id?: string
          is_active?: boolean
          is_internal_staff?: boolean
          mobile?: string
          primary_role?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_profiles_v2_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_profiles_v2_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_shoot_days: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          approval_state: Database["public"]["Enums"]["timesheet_approval_state"]
          approved_at: string | null
          approved_by: string | null
          break_minutes: number | null
          call_time: string | null
          client_uuid: string
          created_at: string
          created_by: string
          crew_booking_id: string
          driver_crew_member_id: string | null
          id: string
          location: string | null
          overtime_approved_at: string | null
          overtime_approved_by: string | null
          planned_end: string | null
          planned_start: string | null
          submission_state: Database["public"]["Enums"]["timesheet_submission_state"]
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          vehicle_id: string | null
          work_date: string
          wrap_time: string | null
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          approval_state?: Database["public"]["Enums"]["timesheet_approval_state"]
          approved_at?: string | null
          approved_by?: string | null
          break_minutes?: number | null
          call_time?: string | null
          client_uuid: string
          created_at?: string
          created_by: string
          crew_booking_id: string
          driver_crew_member_id?: string | null
          id?: string
          location?: string | null
          overtime_approved_at?: string | null
          overtime_approved_by?: string | null
          planned_end?: string | null
          planned_start?: string | null
          submission_state?: Database["public"]["Enums"]["timesheet_submission_state"]
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          vehicle_id?: string | null
          work_date: string
          wrap_time?: string | null
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          approval_state?: Database["public"]["Enums"]["timesheet_approval_state"]
          approved_at?: string | null
          approved_by?: string | null
          break_minutes?: number | null
          call_time?: string | null
          client_uuid?: string
          created_at?: string
          created_by?: string
          crew_booking_id?: string
          driver_crew_member_id?: string | null
          id?: string
          location?: string | null
          overtime_approved_at?: string | null
          overtime_approved_by?: string | null
          planned_end?: string | null
          planned_start?: string | null
          submission_state?: Database["public"]["Enums"]["timesheet_submission_state"]
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          vehicle_id?: string | null
          work_date?: string
          wrap_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_shoot_days_approved_by_fk"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_shoot_days_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_shoot_days_crew_booking_id_fkey"
            columns: ["crew_booking_id"]
            isOneToOne: false
            referencedRelation: "crew_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_shoot_days_crew_booking_id_fkey"
            columns: ["crew_booking_id"]
            isOneToOne: false
            referencedRelation: "crew_bookings_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_shoot_days_driver_crew_member_id_fkey"
            columns: ["driver_crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_shoot_days_driver_crew_member_id_fkey"
            columns: ["driver_crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_shoot_days_overtime_approved_by_fk"
            columns: ["overtime_approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_shoot_days_submitted_by_fk"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_shoot_days_vehicle_id_fk"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_skills: {
        Row: {
          certification_expiry_date: string | null
          certification_name: string | null
          client_uuid: string
          created_at: string
          crew_id: string
          id: string
          proficiency_level: string
          skill_name: string
        }
        Insert: {
          certification_expiry_date?: string | null
          certification_name?: string | null
          client_uuid: string
          created_at?: string
          crew_id: string
          id?: string
          proficiency_level?: string
          skill_name: string
        }
        Update: {
          certification_expiry_date?: string | null
          certification_name?: string | null
          client_uuid?: string
          created_at?: string
          crew_id?: string
          id?: string
          proficiency_level?: string
          skill_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_skills_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_profiles_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_skills_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_profiles_v2_v"
            referencedColumns: ["id"]
          },
        ]
      }
      damage_findings: {
        Row: {
          approval_state: Database["public"]["Enums"]["damage_approval_state"]
          approved_at: string | null
          approved_by: string | null
          case_id: string | null
          charge_id: string | null
          cleaning_queue_entry_id: string | null
          client_uuid: string
          created_at: string
          created_by: string
          damage_type: string
          description: string
          disposition: Database["public"]["Enums"]["damage_disposition"] | null
          estimated_cost: number | null
          id: string
          return_line_id: string | null
          severity: string
          source: Database["public"]["Enums"]["damage_source"]
          unit_id: string
          updated_at: string
          voided_at: string | null
        }
        Insert: {
          approval_state?: Database["public"]["Enums"]["damage_approval_state"]
          approved_at?: string | null
          approved_by?: string | null
          case_id?: string | null
          charge_id?: string | null
          cleaning_queue_entry_id?: string | null
          client_uuid: string
          created_at?: string
          created_by: string
          damage_type: string
          description: string
          disposition?: Database["public"]["Enums"]["damage_disposition"] | null
          estimated_cost?: number | null
          id?: string
          return_line_id?: string | null
          severity: string
          source: Database["public"]["Enums"]["damage_source"]
          unit_id: string
          updated_at?: string
          voided_at?: string | null
        }
        Update: {
          approval_state?: Database["public"]["Enums"]["damage_approval_state"]
          approved_at?: string | null
          approved_by?: string | null
          case_id?: string | null
          charge_id?: string | null
          cleaning_queue_entry_id?: string | null
          client_uuid?: string
          created_at?: string
          created_by?: string
          damage_type?: string
          description?: string
          disposition?: Database["public"]["Enums"]["damage_disposition"] | null
          estimated_cost?: number | null
          id?: string
          return_line_id?: string | null
          severity?: string
          source?: Database["public"]["Enums"]["damage_source"]
          unit_id?: string
          updated_at?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "damage_findings_approved_by_fk"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_findings_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_findings_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_findings_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_findings_cleaning_queue_entry_fk"
            columns: ["cleaning_queue_entry_id"]
            isOneToOne: false
            referencedRelation: "cleaning_queue_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_findings_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_findings_return_line_id_fkey"
            columns: ["return_line_id"]
            isOneToOne: false
            referencedRelation: "return_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_findings_unit_id_fk"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_findings_unit_id_fk"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "product_units_v"
            referencedColumns: ["id"]
          },
        ]
      }
      deposit_movements: {
        Row: {
          amount: number
          applied_reason: string | null
          bank_account_id: string | null
          charge_type: Database["public"]["Enums"]["deposit_charge_type"] | null
          client_uuid: string
          created_at: string
          handled_by: string
          id: string
          movement_no: string
          movement_type: Database["public"]["Enums"]["deposit_movement_type"]
          security_deposit_id: string
          transaction_ref: string | null
        }
        Insert: {
          amount: number
          applied_reason?: string | null
          bank_account_id?: string | null
          charge_type?:
            | Database["public"]["Enums"]["deposit_charge_type"]
            | null
          client_uuid: string
          created_at?: string
          handled_by: string
          id?: string
          movement_no: string
          movement_type?: Database["public"]["Enums"]["deposit_movement_type"]
          security_deposit_id: string
          transaction_ref?: string | null
        }
        Update: {
          amount?: number
          applied_reason?: string | null
          bank_account_id?: string | null
          charge_type?:
            | Database["public"]["Enums"]["deposit_charge_type"]
            | null
          client_uuid?: string
          created_at?: string
          handled_by?: string
          id?: string
          movement_no?: string
          movement_type?: Database["public"]["Enums"]["deposit_movement_type"]
          security_deposit_id?: string
          transaction_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deposit_movements_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_movements_handled_by_fk"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_movements_security_deposit_id_fkey"
            columns: ["security_deposit_id"]
            isOneToOne: false
            referencedRelation: "security_deposits"
            referencedColumns: ["id"]
          },
        ]
      }
      depreciation_logs: {
        Row: {
          accumulated_depreciation: number
          annual_depreciation: number
          book_value: number
          calculated_at: string
          calculated_by: string | null
          client_uuid: string
          depreciation_method: string
          fiscal_year: string
          id: string
          initial_cost: number
          product_id: string
          product_unit_id: string | null
          residual_value: number
          useful_life_years: number
        }
        Insert: {
          accumulated_depreciation: number
          annual_depreciation: number
          book_value: number
          calculated_at?: string
          calculated_by?: string | null
          client_uuid: string
          depreciation_method?: string
          fiscal_year: string
          id?: string
          initial_cost: number
          product_id: string
          product_unit_id?: string | null
          residual_value: number
          useful_life_years?: number
        }
        Update: {
          accumulated_depreciation?: number
          annual_depreciation?: number
          book_value?: number
          calculated_at?: string
          calculated_by?: string | null
          client_uuid?: string
          depreciation_method?: string
          fiscal_year?: string
          id?: string
          initial_cost?: number
          product_id?: string
          product_unit_id?: string | null
          residual_value?: number
          useful_life_years?: number
        }
        Relationships: [
          {
            foreignKeyName: "depreciation_logs_calculated_by_fk"
            columns: ["calculated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depreciation_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depreciation_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depreciation_logs_product_unit_id_fkey"
            columns: ["product_unit_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depreciation_logs_product_unit_id_fkey"
            columns: ["product_unit_id"]
            isOneToOne: false
            referencedRelation: "product_units_v"
            referencedColumns: ["id"]
          },
        ]
      }
      document_deliveries: {
        Row: {
          channel: Database["public"]["Enums"]["channel_code"]
          client_uuid: string
          delivery_event: Database["public"]["Enums"]["document_delivery_event"]
          document_id: string
          id: string
          recipient_destination: string
          recipient_type: string
          recorded_at: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["channel_code"]
          client_uuid: string
          delivery_event?: Database["public"]["Enums"]["document_delivery_event"]
          document_id: string
          id?: string
          recipient_destination: string
          recipient_type?: string
          recorded_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["channel_code"]
          client_uuid?: string
          delivery_event?: Database["public"]["Enums"]["document_delivery_event"]
          document_id?: string
          id?: string
          recipient_destination?: string
          recipient_type?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_deliveries_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      document_registry: {
        Row: {
          booking_id: string | null
          client_id: string | null
          client_uuid: string
          created_at: string
          created_by: string | null
          document_no: string
          document_type: Database["public"]["Enums"]["document_type"]
          file_size_bytes: number | null
          file_url: string
          generated_by: string | null
          id: string
          lifecycle_status: Database["public"]["Enums"]["document_lifecycle_status"]
          signature_url: string | null
          signed_at: string | null
          signed_by_name: string | null
          updated_at: string
          updated_by: string | null
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          booking_id?: string | null
          client_id?: string | null
          client_uuid: string
          created_at?: string
          created_by?: string | null
          document_no: string
          document_type?: Database["public"]["Enums"]["document_type"]
          file_size_bytes?: number | null
          file_url: string
          generated_by?: string | null
          id?: string
          lifecycle_status?: Database["public"]["Enums"]["document_lifecycle_status"]
          signature_url?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          updated_at?: string
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          booking_id?: string | null
          client_id?: string | null
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          document_no?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          file_size_bytes?: number | null
          file_url?: string
          generated_by?: string | null
          id?: string
          lifecycle_status?: Database["public"]["Enums"]["document_lifecycle_status"]
          signature_url?: string | null
          signed_at?: string | null
          signed_by_name?: string | null
          updated_at?: string
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_registry_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_registry_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_registry_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_registry_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_registry_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_registry_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_files: {
        Row: {
          captured_at: string | null
          category: Database["public"]["Enums"]["evidence_category"]
          client_uuid: string
          confidence: number | null
          content_hash: string
          created_at: string
          created_by: string
          derivative_kind: string | null
          derivative_of_file_id: string | null
          device: string | null
          duration_seconds: number | null
          format: string
          gps_lat: number | null
          gps_lng: number | null
          id: string
          locked_at: string | null
          match_source:
            | Database["public"]["Enums"]["evidence_match_source"]
            | null
          match_state: Database["public"]["Enums"]["evidence_match_state"]
          matched_item_id: string | null
          matched_serial: string | null
          media_type: Database["public"]["Enums"]["evidence_media_type"]
          original_filename: string
          processing_step: Database["public"]["Enums"]["evidence_processing_step"]
          removal_reason: string | null
          removed_at: string | null
          removed_by: string | null
          retention_until: string | null
          size_bytes: number
          storage_path: string
          unmatched_reason: string | null
          updated_at: string
        }
        Insert: {
          captured_at?: string | null
          category: Database["public"]["Enums"]["evidence_category"]
          client_uuid: string
          confidence?: number | null
          content_hash: string
          created_at?: string
          created_by: string
          derivative_kind?: string | null
          derivative_of_file_id?: string | null
          device?: string | null
          duration_seconds?: number | null
          format: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          locked_at?: string | null
          match_source?:
            | Database["public"]["Enums"]["evidence_match_source"]
            | null
          match_state?: Database["public"]["Enums"]["evidence_match_state"]
          matched_item_id?: string | null
          matched_serial?: string | null
          media_type: Database["public"]["Enums"]["evidence_media_type"]
          original_filename: string
          processing_step?: Database["public"]["Enums"]["evidence_processing_step"]
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          retention_until?: string | null
          size_bytes: number
          storage_path: string
          unmatched_reason?: string | null
          updated_at?: string
        }
        Update: {
          captured_at?: string | null
          category?: Database["public"]["Enums"]["evidence_category"]
          client_uuid?: string
          confidence?: number | null
          content_hash?: string
          created_at?: string
          created_by?: string
          derivative_kind?: string | null
          derivative_of_file_id?: string | null
          device?: string | null
          duration_seconds?: number | null
          format?: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          locked_at?: string | null
          match_source?:
            | Database["public"]["Enums"]["evidence_match_source"]
            | null
          match_state?: Database["public"]["Enums"]["evidence_match_state"]
          matched_item_id?: string | null
          matched_serial?: string | null
          media_type?: Database["public"]["Enums"]["evidence_media_type"]
          original_filename?: string
          processing_step?: Database["public"]["Enums"]["evidence_processing_step"]
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          retention_until?: string | null
          size_bytes?: number
          storage_path?: string
          unmatched_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_files_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_files_derivative_of_file_id_fkey"
            columns: ["derivative_of_file_id"]
            isOneToOne: false
            referencedRelation: "evidence_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_files_matched_item_id_fk"
            columns: ["matched_item_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_files_matched_item_id_fk"
            columns: ["matched_item_id"]
            isOneToOne: false
            referencedRelation: "product_units_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_files_removed_by_fk"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_references: {
        Row: {
          booking_id: string | null
          bundle_id: string | null
          case_id: string | null
          cleaning_queue_entry_id: string | null
          client_id: string | null
          client_uuid: string
          created_at: string
          created_by: string
          damage_finding_id: string | null
          evidence_file_id: string
          id: string
          item_id: string | null
          maintenance_id: string | null
          operation_stage: Database["public"]["Enums"]["evidence_operation_stage"]
          packing_line_id: string | null
          removal_reason: string | null
          removed_at: string | null
          return_line_id: string | null
          serial: string | null
          session_id: string | null
        }
        Insert: {
          booking_id?: string | null
          bundle_id?: string | null
          case_id?: string | null
          cleaning_queue_entry_id?: string | null
          client_id?: string | null
          client_uuid: string
          created_at?: string
          created_by: string
          damage_finding_id?: string | null
          evidence_file_id: string
          id?: string
          item_id?: string | null
          maintenance_id?: string | null
          operation_stage: Database["public"]["Enums"]["evidence_operation_stage"]
          packing_line_id?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          return_line_id?: string | null
          serial?: string | null
          session_id?: string | null
        }
        Update: {
          booking_id?: string | null
          bundle_id?: string | null
          case_id?: string | null
          cleaning_queue_entry_id?: string | null
          client_id?: string | null
          client_uuid?: string
          created_at?: string
          created_by?: string
          damage_finding_id?: string | null
          evidence_file_id?: string
          id?: string
          item_id?: string | null
          maintenance_id?: string | null
          operation_stage?: Database["public"]["Enums"]["evidence_operation_stage"]
          packing_line_id?: string | null
          removal_reason?: string | null
          removed_at?: string | null
          return_line_id?: string | null
          serial?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_references_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_references_bundle_id_fk"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_references_bundle_id_fk"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_references_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_references_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_references_cleaning_queue_entry_fk"
            columns: ["cleaning_queue_entry_id"]
            isOneToOne: false
            referencedRelation: "cleaning_queue_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_references_client_id_fk"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_references_client_id_fk"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_references_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_references_damage_finding_id_fkey"
            columns: ["damage_finding_id"]
            isOneToOne: false
            referencedRelation: "damage_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_references_damage_finding_id_fkey"
            columns: ["damage_finding_id"]
            isOneToOne: false
            referencedRelation: "damage_findings_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_references_evidence_file_id_fkey"
            columns: ["evidence_file_id"]
            isOneToOne: false
            referencedRelation: "evidence_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_references_item_id_fk"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_references_item_id_fk"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "product_units_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_references_maintenance_id_fk"
            columns: ["maintenance_id"]
            isOneToOne: false
            referencedRelation: "maintenance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_references_packing_line_id_fkey"
            columns: ["packing_line_id"]
            isOneToOne: false
            referencedRelation: "packing_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_references_return_line_id_fkey"
            columns: ["return_line_id"]
            isOneToOne: false
            referencedRelation: "return_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_references_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "operation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          client_uuid: string
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_uuid: string
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_uuid?: string
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_reversals: {
        Row: {
          amount: number
          client_uuid: string
          created_at: string
          id: string
          original_expense_id: string
          reason: string
          reversal_no: string
          reversed_at: string
          reversed_by: string
        }
        Insert: {
          amount: number
          client_uuid: string
          created_at?: string
          id?: string
          original_expense_id: string
          reason: string
          reversal_no: string
          reversed_at?: string
          reversed_by: string
        }
        Update: {
          amount?: number
          client_uuid?: string
          created_at?: string
          id?: string
          original_expense_id?: string
          reason?: string
          reversal_no?: string
          reversed_at?: string
          reversed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_reversals_original_expense_id_fkey"
            columns: ["original_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_reversals_reversed_by_fk"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          booking_id: string | null
          branch_id: string
          category_id: string
          client_uuid: string
          created_at: string
          created_by: string | null
          description: string
          expense_date: string
          expense_no: string
          id: string
          receipt_size: number | null
          receipt_url: string | null
          status: Database["public"]["Enums"]["expense_status"]
          updated_at: string
          updated_by: string | null
          vendor_name: string
        }
        Insert: {
          amount: number
          booking_id?: string | null
          branch_id: string
          category_id: string
          client_uuid: string
          created_at?: string
          created_by?: string | null
          description: string
          expense_date?: string
          expense_no: string
          id?: string
          receipt_size?: number | null
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
          updated_by?: string | null
          vendor_name: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          branch_id?: string
          category_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          description?: string
          expense_date?: string
          expense_no?: string
          id?: string
          receipt_size?: number | null
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
          updated_by?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_branch_id_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      external_invoices: {
        Row: {
          booking_id: string | null
          currency: string
          document_type: string
          external_id: string
          id: string
          issued_at: string | null
          number: string | null
          raw: Json
          status: string | null
          synced_at: string
          tax_minor: number | null
          total_minor: number
        }
        Insert: {
          booking_id?: string | null
          currency: string
          document_type: string
          external_id: string
          id?: string
          issued_at?: string | null
          number?: string | null
          raw: Json
          status?: string | null
          synced_at?: string
          tax_minor?: number | null
          total_minor: number
        }
        Update: {
          booking_id?: string | null
          currency?: string
          document_type?: string
          external_id?: string
          id?: string
          issued_at?: string | null
          number?: string | null
          raw?: Json
          status?: string | null
          synced_at?: string
          tax_minor?: number | null
          total_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "external_invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      external_refs: {
        Row: {
          created_at: string
          entity: string
          external_id: string
          external_updated_at: string | null
          id: string
          last_pulled_at: string | null
          last_pushed_at: string | null
          local_id: string
          payload_hash: string | null
          provider: string
        }
        Insert: {
          created_at?: string
          entity: string
          external_id: string
          external_updated_at?: string | null
          id?: string
          last_pulled_at?: string | null
          last_pushed_at?: string | null
          local_id: string
          payload_hash?: string | null
          provider?: string
        }
        Update: {
          created_at?: string
          entity?: string
          external_id?: string
          external_updated_at?: string | null
          id?: string
          last_pulled_at?: string | null
          last_pushed_at?: string | null
          local_id?: string
          payload_hash?: string | null
          provider?: string
        }
        Relationships: []
      }
      fiscal_periods: {
        Row: {
          client_uuid: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          end_date_ad: string
          fiscal_year_bs: string
          id: string
          is_closed: boolean
          start_date_ad: string
        }
        Insert: {
          client_uuid: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          end_date_ad: string
          fiscal_year_bs: string
          id?: string
          is_closed?: boolean
          start_date_ad: string
        }
        Update: {
          client_uuid?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          end_date_ad?: string
          fiscal_year_bs?: string
          id?: string
          is_closed?: boolean
          start_date_ad?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_periods_closed_by_fk"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_periods_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillment_outcomes: {
        Row: {
          assigned_staff_id: string | null
          booking_id: string
          booking_line_id: string | null
          branch_id: string
          client_uuid: string
          created_at: string
          created_by: string | null
          delivered_qty: number
          delivery_method: string | null
          due_date_ad: string | null
          estimated_revenue_lost: number | null
          fulfillment_status: Database["public"]["Enums"]["fulfillment_status"]
          id: string
          requested_model_id: string
          requested_qty: number
          resolved_at: string | null
          sub_rental_id: string | null
          substituted_model_id: string | null
          swap_type: Database["public"]["Enums"]["swap_type"] | null
          waiting_since: string | null
          warehouse_id: string
        }
        Insert: {
          assigned_staff_id?: string | null
          booking_id: string
          booking_line_id?: string | null
          branch_id: string
          client_uuid: string
          created_at?: string
          created_by?: string | null
          delivered_qty?: number
          delivery_method?: string | null
          due_date_ad?: string | null
          estimated_revenue_lost?: number | null
          fulfillment_status: Database["public"]["Enums"]["fulfillment_status"]
          id?: string
          requested_model_id: string
          requested_qty: number
          resolved_at?: string | null
          sub_rental_id?: string | null
          substituted_model_id?: string | null
          swap_type?: Database["public"]["Enums"]["swap_type"] | null
          waiting_since?: string | null
          warehouse_id: string
        }
        Update: {
          assigned_staff_id?: string | null
          booking_id?: string
          booking_line_id?: string | null
          branch_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          delivered_qty?: number
          delivery_method?: string | null
          due_date_ad?: string | null
          estimated_revenue_lost?: number | null
          fulfillment_status?: Database["public"]["Enums"]["fulfillment_status"]
          id?: string
          requested_model_id?: string
          requested_qty?: number
          resolved_at?: string | null
          sub_rental_id?: string | null
          substituted_model_id?: string | null
          swap_type?: Database["public"]["Enums"]["swap_type"] | null
          waiting_since?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_outcomes_assigned_staff_id_fk"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_outcomes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_outcomes_booking_line_id_fkey"
            columns: ["booking_line_id"]
            isOneToOne: false
            referencedRelation: "booking_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_outcomes_booking_line_id_fkey"
            columns: ["booking_line_id"]
            isOneToOne: false
            referencedRelation: "booking_lines_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_outcomes_branch_id_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_outcomes_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_outcomes_requested_model_id_fk"
            columns: ["requested_model_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_outcomes_requested_model_id_fk"
            columns: ["requested_model_id"]
            isOneToOne: false
            referencedRelation: "products_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_outcomes_sub_rental_id_fkey"
            columns: ["sub_rental_id"]
            isOneToOne: false
            referencedRelation: "booking_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_outcomes_sub_rental_id_fkey"
            columns: ["sub_rental_id"]
            isOneToOne: false
            referencedRelation: "booking_lines_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_outcomes_substituted_model_id_fk"
            columns: ["substituted_model_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_outcomes_substituted_model_id_fk"
            columns: ["substituted_model_id"]
            isOneToOne: false
            referencedRelation: "products_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_outcomes_warehouse_id_fk"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      handover_lines: {
        Row: {
          booking_line_id: string
          client_uuid: string
          completed_session_id: string | null
          created_at: string
          created_by: string
          first_session_id: string | null
          id: string
          missing_reason: string | null
          picked_up_at: string | null
          qty_required: number
          state: Database["public"]["Enums"]["handover_line_state"]
          updated_at: string
        }
        Insert: {
          booking_line_id: string
          client_uuid: string
          completed_session_id?: string | null
          created_at?: string
          created_by: string
          first_session_id?: string | null
          id?: string
          missing_reason?: string | null
          picked_up_at?: string | null
          qty_required: number
          state?: Database["public"]["Enums"]["handover_line_state"]
          updated_at?: string
        }
        Update: {
          booking_line_id?: string
          client_uuid?: string
          completed_session_id?: string | null
          created_at?: string
          created_by?: string
          first_session_id?: string | null
          id?: string
          missing_reason?: string | null
          picked_up_at?: string | null
          qty_required?: number
          state?: Database["public"]["Enums"]["handover_line_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "handover_lines_booking_line_id_fkey"
            columns: ["booking_line_id"]
            isOneToOne: true
            referencedRelation: "booking_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_lines_booking_line_id_fkey"
            columns: ["booking_line_id"]
            isOneToOne: true
            referencedRelation: "booking_lines_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_lines_completed_session_id_fkey"
            columns: ["completed_session_id"]
            isOneToOne: false
            referencedRelation: "operation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_lines_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_lines_first_session_id_fkey"
            columns: ["first_session_id"]
            isOneToOne: false
            referencedRelation: "operation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_categories: {
        Row: {
          client_uuid: string
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: Database["public"]["Enums"]["product_category"]
          parent_id: string | null
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_uuid: string
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: Database["public"]["Enums"]["product_category"]
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_uuid?: string
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: Database["public"]["Enums"]["product_category"]
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_categories_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_categories_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reservations: {
        Row: {
          asset_id: string | null
          booking_id: string
          booking_line_id: string
          client_uuid: string
          created_at: string
          created_by: string
          id: string
          period: unknown
          product_id: string | null
          qty: number
          released_at: string | null
          released_reason: string | null
          reserved_at: string
          state: Database["public"]["Enums"]["inventory_state"]
        }
        Insert: {
          asset_id?: string | null
          booking_id: string
          booking_line_id: string
          client_uuid: string
          created_at?: string
          created_by: string
          id?: string
          period: unknown
          product_id?: string | null
          qty?: number
          released_at?: string | null
          released_reason?: string | null
          reserved_at?: string
          state?: Database["public"]["Enums"]["inventory_state"]
        }
        Update: {
          asset_id?: string | null
          booking_id?: string
          booking_line_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string
          id?: string
          period?: unknown
          product_id?: string | null
          qty?: number
          released_at?: string | null
          released_reason?: string | null
          reserved_at?: string
          state?: Database["public"]["Enums"]["inventory_state"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_asset_id_fk"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_asset_id_fk"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "product_units_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_booking_line_id_fkey"
            columns: ["booking_line_id"]
            isOneToOne: false
            referencedRelation: "booking_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_booking_line_id_fkey"
            columns: ["booking_line_id"]
            isOneToOne: false
            referencedRelation: "booking_lines_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_product_id_fk"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_product_id_fk"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          client_uuid: string
          created_at: string
          days: number
          description: string
          discount_approved_by: string | null
          discount_percent: number
          discount_reason: string | null
          id: string
          invoice_id: string
          line_kind: Database["public"]["Enums"]["line_kind"]
          line_total: number
          quantity: number
          sort_order: number
          unit_rate: number
        }
        Insert: {
          client_uuid: string
          created_at?: string
          days?: number
          description: string
          discount_approved_by?: string | null
          discount_percent?: number
          discount_reason?: string | null
          id?: string
          invoice_id: string
          line_kind?: Database["public"]["Enums"]["line_kind"]
          line_total?: number
          quantity?: number
          sort_order?: number
          unit_rate?: number
        }
        Update: {
          client_uuid?: string
          created_at?: string
          days?: number
          description?: string
          discount_approved_by?: string | null
          discount_percent?: number
          discount_reason?: string | null
          id?: string
          invoice_id?: string
          line_kind?: Database["public"]["Enums"]["line_kind"]
          line_total?: number
          quantity?: number
          sort_order?: number
          unit_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_discount_approved_by_fk"
            columns: ["discount_approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          booking_id: string
          branch_id: string
          client_id: string
          client_uuid: string
          created_at: string
          created_by: string | null
          credit_note_no: string | null
          currency: string
          discount_amount: number
          discount_approved_by: string | null
          discount_percent: number
          discount_reason: string | null
          due_date: string
          id: string
          invoice_no: string
          issue_date: string
          notes: string | null
          outstanding_amount: number
          paid_amount: number
          pdf_url: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          taxable_amount: number
          total_amount: number
          updated_at: string
          updated_by: string | null
          vat_amount: number
          vat_rate: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          booking_id: string
          branch_id: string
          client_id: string
          client_uuid: string
          created_at?: string
          created_by?: string | null
          credit_note_no?: string | null
          currency?: string
          discount_amount?: number
          discount_approved_by?: string | null
          discount_percent?: number
          discount_reason?: string | null
          due_date: string
          id?: string
          invoice_no: string
          issue_date?: string
          notes?: string | null
          outstanding_amount?: number
          paid_amount?: number
          pdf_url?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          taxable_amount?: number
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          vat_amount?: number
          vat_rate?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          booking_id?: string
          branch_id?: string
          client_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          credit_note_no?: string | null
          currency?: string
          discount_amount?: number
          discount_approved_by?: string | null
          discount_percent?: number
          discount_reason?: string | null
          due_date?: string
          id?: string
          invoice_no?: string
          issue_date?: string
          notes?: string | null
          outstanding_amount?: number
          paid_amount?: number
          pdf_url?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          taxable_amount?: number
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          vat_amount?: number
          vat_rate?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_branch_id_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_discount_approved_by_fk"
            columns: ["discount_approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_voided_by_fk"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      late_fee_findings: {
        Row: {
          actual_return_at: string
          approval_state: Database["public"]["Enums"]["damage_approval_state"]
          approved_at: string | null
          approved_by: string | null
          band: Database["public"]["Enums"]["late_fee_band"]
          booking_id: string
          client_uuid: string
          created_at: string
          created_by: string
          day_rate_amount: number
          fee_amount: number
          full_days_charged: number
          id: string
          overage_minutes: number
          return_session_id: string | null
          scheduled_return_at: string
          voided_at: string | null
          voided_reason: string | null
        }
        Insert: {
          actual_return_at: string
          approval_state?: Database["public"]["Enums"]["damage_approval_state"]
          approved_at?: string | null
          approved_by?: string | null
          band: Database["public"]["Enums"]["late_fee_band"]
          booking_id: string
          client_uuid: string
          created_at?: string
          created_by: string
          day_rate_amount: number
          fee_amount: number
          full_days_charged?: number
          id?: string
          overage_minutes: number
          return_session_id?: string | null
          scheduled_return_at: string
          voided_at?: string | null
          voided_reason?: string | null
        }
        Update: {
          actual_return_at?: string
          approval_state?: Database["public"]["Enums"]["damage_approval_state"]
          approved_at?: string | null
          approved_by?: string | null
          band?: Database["public"]["Enums"]["late_fee_band"]
          booking_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string
          day_rate_amount?: number
          fee_amount?: number
          full_days_charged?: number
          id?: string
          overage_minutes?: number
          return_session_id?: string | null
          scheduled_return_at?: string
          voided_at?: string | null
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "late_fee_findings_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_fee_findings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_fee_findings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_fee_findings_return_session_id_fkey"
            columns: ["return_session_id"]
            isOneToOne: false
            referencedRelation: "operation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_records: {
        Row: {
          actions_taken: string | null
          approved_by: string | null
          client_uuid: string
          completed_at: string | null
          cost: number
          created_at: string
          created_by: string | null
          description: string
          findings: string | null
          id: string
          maintenance_type: string
          performed_by: string | null
          priority: string
          product_unit_id: string
          record_no: string
          scheduled_date: string
          started_at: string | null
          status: string
          updated_at: string
          updated_by: string | null
          vendor_name: string | null
        }
        Insert: {
          actions_taken?: string | null
          approved_by?: string | null
          client_uuid: string
          completed_at?: string | null
          cost?: number
          created_at?: string
          created_by?: string | null
          description: string
          findings?: string | null
          id?: string
          maintenance_type: string
          performed_by?: string | null
          priority?: string
          product_unit_id: string
          record_no: string
          scheduled_date: string
          started_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          vendor_name?: string | null
        }
        Update: {
          actions_taken?: string | null
          approved_by?: string | null
          client_uuid?: string
          completed_at?: string | null
          cost?: number
          created_at?: string
          created_by?: string | null
          description?: string
          findings?: string | null
          id?: string
          maintenance_type?: string
          performed_by?: string | null
          priority?: string
          product_unit_id?: string
          record_no?: string
          scheduled_date?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_records_approved_by_fk"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_performed_by_fk"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_product_unit_id_fkey"
            columns: ["product_unit_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_product_unit_id_fkey"
            columns: ["product_unit_id"]
            isOneToOne: false
            referencedRelation: "product_units_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_limit_breaches: {
        Row: {
          actual_value: number
          approved_by: string | null
          booking_id: string | null
          breach_kind: Database["public"]["Enums"]["membership_limit_kind"]
          client_id: string
          client_uuid: string
          created_at: string
          id: string
          limit_value: number
          membership_id: string
        }
        Insert: {
          actual_value: number
          approved_by?: string | null
          booking_id?: string | null
          breach_kind: Database["public"]["Enums"]["membership_limit_kind"]
          client_id: string
          client_uuid: string
          created_at?: string
          id?: string
          limit_value: number
          membership_id: string
        }
        Update: {
          actual_value?: number
          approved_by?: string | null
          booking_id?: string | null
          breach_kind?: Database["public"]["Enums"]["membership_limit_kind"]
          client_id?: string
          client_uuid?: string
          created_at?: string
          id?: string
          limit_value?: number
          membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_limit_breaches_approved_by_fk"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_limit_breaches_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_limit_breaches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_limit_breaches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_limit_breaches_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "client_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_limit_breaches_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "client_memberships_v"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_plans: {
        Row: {
          annual_fee: number | null
          authorized_users: number | null
          bundle_discount_pct: number | null
          client_uuid: string
          created_at: string
          created_by: string | null
          default_credit_limit: number
          display_order: number
          id: string
          individual_discount_pct: number | null
          label: Database["public"]["Enums"]["membership_label"]
          level: Database["public"]["Enums"]["membership_level"]
          monthly_booking_limit: number | null
          perks: Database["public"]["Enums"]["membership_perk"][]
          retired_at: string | null
          simultaneous_rental_limit: number | null
          status: Database["public"]["Enums"]["membership_plan_status"]
          term_months: number
          updated_at: string
        }
        Insert: {
          annual_fee?: number | null
          authorized_users?: number | null
          bundle_discount_pct?: number | null
          client_uuid: string
          created_at?: string
          created_by?: string | null
          default_credit_limit?: number
          display_order: number
          id?: string
          individual_discount_pct?: number | null
          label: Database["public"]["Enums"]["membership_label"]
          level: Database["public"]["Enums"]["membership_level"]
          monthly_booking_limit?: number | null
          perks?: Database["public"]["Enums"]["membership_perk"][]
          retired_at?: string | null
          simultaneous_rental_limit?: number | null
          status?: Database["public"]["Enums"]["membership_plan_status"]
          term_months?: number
          updated_at?: string
        }
        Update: {
          annual_fee?: number | null
          authorized_users?: number | null
          bundle_discount_pct?: number | null
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          default_credit_limit?: number
          display_order?: number
          id?: string
          individual_discount_pct?: number | null
          label?: Database["public"]["Enums"]["membership_label"]
          level?: Database["public"]["Enums"]["membership_level"]
          monthly_booking_limit?: number | null
          perks?: Database["public"]["Enums"]["membership_perk"][]
          retired_at?: string | null
          simultaneous_rental_limit?: number | null
          status?: Database["public"]["Enums"]["membership_plan_status"]
          term_months?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_plans_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      message_logs: {
        Row: {
          channel: Database["public"]["Enums"]["channel_code"]
          client_uuid: string
          content: string
          created_at: string
          delivered_at: string | null
          destination: string
          error_message: string | null
          gateway_ref: string | null
          id: string
          message_no: string
          recipient_id: string
          recipient_type: string
          sent_at: string | null
          status: string
          subject: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["channel_code"]
          client_uuid: string
          content: string
          created_at?: string
          delivered_at?: string | null
          destination: string
          error_message?: string | null
          gateway_ref?: string | null
          id?: string
          message_no: string
          recipient_id: string
          recipient_type?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["channel_code"]
          client_uuid?: string
          content?: string
          created_at?: string
          delivered_at?: string | null
          destination?: string
          error_message?: string | null
          gateway_ref?: string | null
          id?: string
          message_no?: string
          recipient_id?: string
          recipient_type?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          body_template: string
          channel: Database["public"]["Enums"]["channel_code"]
          client_uuid: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          subject: string | null
          template_code: string
          updated_at: string
          updated_by: string | null
          variables: Json
        }
        Insert: {
          body_template: string
          channel?: Database["public"]["Enums"]["channel_code"]
          client_uuid: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          subject?: string | null
          template_code: string
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Update: {
          body_template?: string
          channel?: Database["public"]["Enums"]["channel_code"]
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          subject?: string | null
          template_code?: string
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: Database["public"]["Enums"]["channel_code"]
          client_uuid: string
          created_at: string
          id: string
          is_read: boolean
          link_url: string | null
          message: string
          notification_no: string
          read_at: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          title: string
          user_id: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["channel_code"]
          client_uuid: string
          created_at?: string
          id?: string
          is_read?: boolean
          link_url?: string | null
          message: string
          notification_no: string
          read_at?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          title: string
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["channel_code"]
          client_uuid?: string
          created_at?: string
          id?: string
          is_read?: boolean
          link_url?: string | null
          message?: string
          notification_no?: string
          read_at?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      number_sequences: {
        Row: {
          current_value: number
          current_year: number
          padding: number
          prefix: string
          sequence_key: string
          updated_at: string
        }
        Insert: {
          current_value?: number
          current_year?: number
          padding?: number
          prefix: string
          sequence_key: string
          updated_at?: string
        }
        Update: {
          current_value?: number
          current_year?: number
          padding?: number
          prefix?: string
          sequence_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      operation_sessions: {
        Row: {
          booking_authorization_verified: boolean
          booking_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          client_uuid: string
          completed_at: string | null
          completed_by: string | null
          courier_name: string | null
          courier_tracking_number: string | null
          created_at: string
          created_by: string
          delivery_address: string | null
          delivery_method: Database["public"]["Enums"]["delivery_method"] | null
          device_id: string | null
          driver_contact: string | null
          driver_name: string | null
          estimated_arrival: string | null
          government_id_verified: boolean
          id: string
          notes: string | null
          operation: Database["public"]["Enums"]["operation_kind"]
          pickup_person_name: string | null
          pickup_person_phone: string | null
          received_at: string | null
          receiver_email: string | null
          receiver_id_document_evidence_id: string | null
          receiver_name: string | null
          receiver_phone: string | null
          returning_person_name: string | null
          session_no: number
          started_at: string | null
          started_by: string | null
          state: Database["public"]["Enums"]["session_state"]
          updated_at: string
          vehicle_plate: string | null
          warehouse_staff_id: string
        }
        Insert: {
          booking_authorization_verified?: boolean
          booking_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_uuid: string
          completed_at?: string | null
          completed_by?: string | null
          courier_name?: string | null
          courier_tracking_number?: string | null
          created_at?: string
          created_by: string
          delivery_address?: string | null
          delivery_method?:
            | Database["public"]["Enums"]["delivery_method"]
            | null
          device_id?: string | null
          driver_contact?: string | null
          driver_name?: string | null
          estimated_arrival?: string | null
          government_id_verified?: boolean
          id?: string
          notes?: string | null
          operation: Database["public"]["Enums"]["operation_kind"]
          pickup_person_name?: string | null
          pickup_person_phone?: string | null
          received_at?: string | null
          receiver_email?: string | null
          receiver_id_document_evidence_id?: string | null
          receiver_name?: string | null
          receiver_phone?: string | null
          returning_person_name?: string | null
          session_no?: number
          started_at?: string | null
          started_by?: string | null
          state?: Database["public"]["Enums"]["session_state"]
          updated_at?: string
          vehicle_plate?: string | null
          warehouse_staff_id: string
        }
        Update: {
          booking_authorization_verified?: boolean
          booking_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_uuid?: string
          completed_at?: string | null
          completed_by?: string | null
          courier_name?: string | null
          courier_tracking_number?: string | null
          created_at?: string
          created_by?: string
          delivery_address?: string | null
          delivery_method?:
            | Database["public"]["Enums"]["delivery_method"]
            | null
          device_id?: string | null
          driver_contact?: string | null
          driver_name?: string | null
          estimated_arrival?: string | null
          government_id_verified?: boolean
          id?: string
          notes?: string | null
          operation?: Database["public"]["Enums"]["operation_kind"]
          pickup_person_name?: string | null
          pickup_person_phone?: string | null
          received_at?: string | null
          receiver_email?: string | null
          receiver_id_document_evidence_id?: string | null
          receiver_name?: string | null
          receiver_phone?: string | null
          returning_person_name?: string | null
          session_no?: number
          started_at?: string | null
          started_by?: string | null
          state?: Database["public"]["Enums"]["session_state"]
          updated_at?: string
          vehicle_plate?: string | null
          warehouse_staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_sessions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_sessions_completed_by_fk"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_sessions_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_sessions_receiver_id_document_fk"
            columns: ["receiver_id_document_evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_sessions_started_by_fk"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_sessions_warehouse_staff_id_fk"
            columns: ["warehouse_staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      override_records: {
        Row: {
          approver_role: string
          approver_user_id: string
          audit_event_id: string
          client_uuid: string
          created_at: string
          created_by: string
          gate_number: number | null
          id: string
          override_type: Database["public"]["Enums"]["override_type"]
          reason: string
          subject_id: string
          subject_type: string
        }
        Insert: {
          approver_role: string
          approver_user_id: string
          audit_event_id: string
          client_uuid: string
          created_at?: string
          created_by: string
          gate_number?: number | null
          id?: string
          override_type: Database["public"]["Enums"]["override_type"]
          reason: string
          subject_id: string
          subject_type: string
        }
        Update: {
          approver_role?: string
          approver_user_id?: string
          audit_event_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string
          gate_number?: number | null
          id?: string
          override_type?: Database["public"]["Enums"]["override_type"]
          reason?: string
          subject_id?: string
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "override_records_approver_user_id_fk"
            columns: ["approver_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "override_records_audit_event_id_fk"
            columns: ["audit_event_id"]
            isOneToOne: false
            referencedRelation: "audit_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "override_records_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_lines: {
        Row: {
          blocker_note: string | null
          booking_line_id: string
          client_uuid: string
          condition: Database["public"]["Enums"]["packing_condition"] | null
          created_at: string
          created_by: string
          id: string
          is_required: boolean
          missing_reason: string | null
          not_required_set_at: string | null
          packed_at: string | null
          packed_by: string | null
          qty_packed_entered: number | null
          qty_required: number
          replacement_packing_line_id: string | null
          session_id: string
          state: Database["public"]["Enums"]["packing_line_state"]
          updated_at: string
          warehouse_location: string | null
        }
        Insert: {
          blocker_note?: string | null
          booking_line_id: string
          client_uuid: string
          condition?: Database["public"]["Enums"]["packing_condition"] | null
          created_at?: string
          created_by: string
          id?: string
          is_required?: boolean
          missing_reason?: string | null
          not_required_set_at?: string | null
          packed_at?: string | null
          packed_by?: string | null
          qty_packed_entered?: number | null
          qty_required: number
          replacement_packing_line_id?: string | null
          session_id: string
          state?: Database["public"]["Enums"]["packing_line_state"]
          updated_at?: string
          warehouse_location?: string | null
        }
        Update: {
          blocker_note?: string | null
          booking_line_id?: string
          client_uuid?: string
          condition?: Database["public"]["Enums"]["packing_condition"] | null
          created_at?: string
          created_by?: string
          id?: string
          is_required?: boolean
          missing_reason?: string | null
          not_required_set_at?: string | null
          packed_at?: string | null
          packed_by?: string | null
          qty_packed_entered?: number | null
          qty_required?: number
          replacement_packing_line_id?: string | null
          session_id?: string
          state?: Database["public"]["Enums"]["packing_line_state"]
          updated_at?: string
          warehouse_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_lines_booking_line_id_fkey"
            columns: ["booking_line_id"]
            isOneToOne: true
            referencedRelation: "booking_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_lines_booking_line_id_fkey"
            columns: ["booking_line_id"]
            isOneToOne: true
            referencedRelation: "booking_lines_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_lines_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_lines_packed_by_fk"
            columns: ["packed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_lines_replacement_packing_line_id_fkey"
            columns: ["replacement_packing_line_id"]
            isOneToOne: false
            referencedRelation: "packing_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_lines_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "operation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reversals: {
        Row: {
          amount: number
          approved_by: string
          client_uuid: string
          created_at: string
          id: string
          original_payment_id: string
          reason: string
          reversal_no: string
          reversed_at: string
          reversed_by: string
        }
        Insert: {
          amount: number
          approved_by: string
          client_uuid: string
          created_at?: string
          id?: string
          original_payment_id: string
          reason: string
          reversal_no: string
          reversed_at?: string
          reversed_by: string
        }
        Update: {
          amount?: number
          approved_by?: string
          client_uuid?: string
          created_at?: string
          id?: string
          original_payment_id?: string
          reason?: string
          reversal_no?: string
          reversed_at?: string
          reversed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_reversals_approved_by_fk"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reversals_original_payment_id_fkey"
            columns: ["original_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reversals_reversed_by_fk"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank_account_id: string | null
          booking_id: string
          branch_id: string
          client_id: string
          client_uuid: string
          created_at: string
          id: string
          invoice_id: string | null
          notes: string | null
          payment_date: string
          payment_no: string
          payment_type: Database["public"]["Enums"]["payment_type"]
          received_by: string
          status: Database["public"]["Enums"]["payment_status"]
          transaction_ref: string | null
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          booking_id: string
          branch_id: string
          client_id: string
          client_uuid: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          payment_date?: string
          payment_no: string
          payment_type?: Database["public"]["Enums"]["payment_type"]
          received_by: string
          status?: Database["public"]["Enums"]["payment_status"]
          transaction_ref?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          booking_id?: string
          branch_id?: string
          client_id?: string
          client_uuid?: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          payment_date?: string
          payment_no?: string
          payment_type?: Database["public"]["Enums"]["payment_type"]
          received_by?: string
          status?: Database["public"]["Enums"]["payment_status"]
          transaction_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_branch_id_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_received_by_fk"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_auth_challenges: {
        Row: {
          attempt_count: number
          client_uuid: string
          code_hash: string
          consumed_at: string | null
          created_at: string
          delivery_channel: Database["public"]["Enums"]["otp_delivery_channel"]
          expires_at: string
          id: string
          ip: unknown
          locked_until: string | null
          phone: string
          portal_user_id: string | null
          voided_at: string | null
        }
        Insert: {
          attempt_count?: number
          client_uuid: string
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          delivery_channel: Database["public"]["Enums"]["otp_delivery_channel"]
          expires_at: string
          id?: string
          ip?: unknown
          locked_until?: string | null
          phone: string
          portal_user_id?: string | null
          voided_at?: string | null
        }
        Update: {
          attempt_count?: number
          client_uuid?: string
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          delivery_channel?: Database["public"]["Enums"]["otp_delivery_channel"]
          expires_at?: string
          id?: string
          ip?: unknown
          locked_until?: string | null
          phone?: string
          portal_user_id?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_auth_challenges_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_sessions: {
        Row: {
          client_id: string
          client_uuid: string
          closed_at: string | null
          created_at: string
          device_id: string
          expires_at: string
          id: string
          ip: unknown
          portal_user_id: string
        }
        Insert: {
          client_id: string
          client_uuid: string
          closed_at?: string | null
          created_at?: string
          device_id: string
          expires_at: string
          id?: string
          ip?: unknown
          portal_user_id: string
        }
        Update: {
          client_id?: string
          client_uuid?: string
          closed_at?: string | null
          created_at?: string
          device_id?: string
          expires_at?: string
          id?: string
          ip?: unknown
          portal_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_sessions_portal_user_id_fkey"
            columns: ["portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_users: {
        Row: {
          activated_at: string | null
          client_id: string
          client_uuid: string
          contact_id: string | null
          created_at: string
          deactivated_at: string | null
          deactivated_by_portal_user_id: string | null
          display_name: string | null
          id: string
          invited_by_portal_user_id: string | null
          invited_by_staff_id: string | null
          language: Database["public"]["Enums"]["portal_language"]
          last_active_at: string | null
          phone: string
          role: Database["public"]["Enums"]["portal_user_role"]
          status: Database["public"]["Enums"]["portal_user_status"]
        }
        Insert: {
          activated_at?: string | null
          client_id: string
          client_uuid: string
          contact_id?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_by_portal_user_id?: string | null
          display_name?: string | null
          id?: string
          invited_by_portal_user_id?: string | null
          invited_by_staff_id?: string | null
          language?: Database["public"]["Enums"]["portal_language"]
          last_active_at?: string | null
          phone: string
          role?: Database["public"]["Enums"]["portal_user_role"]
          status?: Database["public"]["Enums"]["portal_user_status"]
        }
        Update: {
          activated_at?: string | null
          client_id?: string
          client_uuid?: string
          contact_id?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivated_by_portal_user_id?: string | null
          display_name?: string | null
          id?: string
          invited_by_portal_user_id?: string | null
          invited_by_staff_id?: string | null
          language?: Database["public"]["Enums"]["portal_language"]
          last_active_at?: string | null
          phone?: string
          role?: Database["public"]["Enums"]["portal_user_role"]
          status?: Database["public"]["Enums"]["portal_user_status"]
        }
        Relationships: [
          {
            foreignKeyName: "portal_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_users_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_users_deactivated_by_portal_user_id_fkey"
            columns: ["deactivated_by_portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_users_invited_by_portal_user_id_fkey"
            columns: ["invited_by_portal_user_id"]
            isOneToOne: false
            referencedRelation: "portal_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_users_invited_by_staff_id_fk"
            columns: ["invited_by_staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      product_compatibilities: {
        Row: {
          client_uuid: string
          compatible_product_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          product_id: string
          relationship_kind: Database["public"]["Enums"]["compatibility_kind"]
        }
        Insert: {
          client_uuid: string
          compatible_product_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id: string
          relationship_kind?: Database["public"]["Enums"]["compatibility_kind"]
        }
        Update: {
          client_uuid?: string
          compatible_product_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          relationship_kind?: Database["public"]["Enums"]["compatibility_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "product_compatibilities_compatible_product_id_fkey"
            columns: ["compatible_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_compatibilities_compatible_product_id_fkey"
            columns: ["compatible_product_id"]
            isOneToOne: false
            referencedRelation: "products_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_compatibilities_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_compatibilities_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_compatibilities_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v"
            referencedColumns: ["id"]
          },
        ]
      }
      product_documents: {
        Row: {
          client_uuid: string
          created_at: string
          created_by: string | null
          description: string | null
          file_name: string
          file_size: number
          file_url: string
          id: string
          kind: Database["public"]["Enums"]["product_document_kind"]
          mime_type: string
          product_id: string
          product_unit_id: string | null
        }
        Insert: {
          client_uuid: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_name: string
          file_size: number
          file_url: string
          id?: string
          kind?: Database["public"]["Enums"]["product_document_kind"]
          mime_type: string
          product_id: string
          product_unit_id?: string | null
        }
        Update: {
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_name?: string
          file_size?: number
          file_url?: string
          id?: string
          kind?: Database["public"]["Enums"]["product_document_kind"]
          mime_type?: string
          product_id?: string
          product_unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_documents_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_documents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_documents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_documents_product_unit_id_fkey"
            columns: ["product_unit_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_documents_product_unit_id_fkey"
            columns: ["product_unit_id"]
            isOneToOne: false
            referencedRelation: "product_units_v"
            referencedColumns: ["id"]
          },
        ]
      }
      product_units: {
        Row: {
          asset_tag: string
          barcode: string | null
          bin: string | null
          branch_id: string
          client_uuid: string
          condition: Database["public"]["Enums"]["unit_condition"]
          container_id: string | null
          created_at: string
          created_by: string | null
          id: string
          insurance_expires_at: string | null
          last_maintenance_at: string | null
          next_maintenance_at: string | null
          product_id: string
          purchase_date: string | null
          purchase_price: number | null
          qr_code: string | null
          rack: string | null
          replacement_value: number | null
          retired_at: string | null
          retired_by: string | null
          retirement_reason: string | null
          running_hours: number
          serial_no: string | null
          shelf: string | null
          status: Database["public"]["Enums"]["inventory_state"]
          storage_zone_id: string | null
          updated_at: string
          updated_by: string | null
          warehouse_id: string
          warranty_expires_at: string | null
        }
        Insert: {
          asset_tag: string
          barcode?: string | null
          bin?: string | null
          branch_id: string
          client_uuid: string
          condition?: Database["public"]["Enums"]["unit_condition"]
          container_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          insurance_expires_at?: string | null
          last_maintenance_at?: string | null
          next_maintenance_at?: string | null
          product_id: string
          purchase_date?: string | null
          purchase_price?: number | null
          qr_code?: string | null
          rack?: string | null
          replacement_value?: number | null
          retired_at?: string | null
          retired_by?: string | null
          retirement_reason?: string | null
          running_hours?: number
          serial_no?: string | null
          shelf?: string | null
          status?: Database["public"]["Enums"]["inventory_state"]
          storage_zone_id?: string | null
          updated_at?: string
          updated_by?: string | null
          warehouse_id: string
          warranty_expires_at?: string | null
        }
        Update: {
          asset_tag?: string
          barcode?: string | null
          bin?: string | null
          branch_id?: string
          client_uuid?: string
          condition?: Database["public"]["Enums"]["unit_condition"]
          container_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          insurance_expires_at?: string | null
          last_maintenance_at?: string | null
          next_maintenance_at?: string | null
          product_id?: string
          purchase_date?: string | null
          purchase_price?: number | null
          qr_code?: string | null
          rack?: string | null
          replacement_value?: number | null
          retired_at?: string | null
          retired_by?: string | null
          retirement_reason?: string | null
          running_hours?: number
          serial_no?: string | null
          shelf?: string | null
          status?: Database["public"]["Enums"]["inventory_state"]
          storage_zone_id?: string | null
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string
          warranty_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_units_branch_id_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "containers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_retired_by_fk"
            columns: ["retired_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_storage_zone_id_fk"
            columns: ["storage_zone_id"]
            isOneToOne: false
            referencedRelation: "storage_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_warehouse_id_fk"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          asset_code: string
          brand: string
          case_capacity: number | null
          category_id: string
          cleaning_time_minutes: number
          client_uuid: string
          created_at: string
          created_by: string | null
          daily_rate: number | null
          deposit_fixed: number | null
          deposit_percent: number | null
          description: string | null
          hourly_rate: number | null
          id: string
          inspection_required: boolean
          is_active: boolean
          is_subrental_only: boolean
          manufacturer: string | null
          min_rental_days: number
          model: string | null
          monthly_rate: number | null
          name: string
          notes_internal: string | null
          notes_rental: string | null
          notes_warehouse: string | null
          packing_required: boolean
          prep_time_minutes: number
          purchase_date: string | null
          purchase_price: number | null
          quantity_unit:
            | Database["public"]["Enums"]["product_unit_of_measure"]
            | null
          rental_enabled: boolean
          reorder_level: number | null
          replacement_value: number | null
          short_name: string | null
          status: Database["public"]["Enums"]["product_record_state"]
          supplier_id: string | null
          thumbnail_url: string | null
          total_quantity: number
          tracking_mode: Database["public"]["Enums"]["product_tracking_mode"]
          updated_at: string
          updated_by: string | null
          weekend_rate: number | null
          weekly_rate: number | null
          weight_kg: number | null
        }
        Insert: {
          asset_code: string
          brand: string
          case_capacity?: number | null
          category_id: string
          cleaning_time_minutes?: number
          client_uuid: string
          created_at?: string
          created_by?: string | null
          daily_rate?: number | null
          deposit_fixed?: number | null
          deposit_percent?: number | null
          description?: string | null
          hourly_rate?: number | null
          id?: string
          inspection_required?: boolean
          is_active?: boolean
          is_subrental_only?: boolean
          manufacturer?: string | null
          min_rental_days?: number
          model?: string | null
          monthly_rate?: number | null
          name: string
          notes_internal?: string | null
          notes_rental?: string | null
          notes_warehouse?: string | null
          packing_required?: boolean
          prep_time_minutes?: number
          purchase_date?: string | null
          purchase_price?: number | null
          quantity_unit?:
            | Database["public"]["Enums"]["product_unit_of_measure"]
            | null
          rental_enabled?: boolean
          reorder_level?: number | null
          replacement_value?: number | null
          short_name?: string | null
          status?: Database["public"]["Enums"]["product_record_state"]
          supplier_id?: string | null
          thumbnail_url?: string | null
          total_quantity?: number
          tracking_mode?: Database["public"]["Enums"]["product_tracking_mode"]
          updated_at?: string
          updated_by?: string | null
          weekend_rate?: number | null
          weekly_rate?: number | null
          weight_kg?: number | null
        }
        Update: {
          asset_code?: string
          brand?: string
          case_capacity?: number | null
          category_id?: string
          cleaning_time_minutes?: number
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          daily_rate?: number | null
          deposit_fixed?: number | null
          deposit_percent?: number | null
          description?: string | null
          hourly_rate?: number | null
          id?: string
          inspection_required?: boolean
          is_active?: boolean
          is_subrental_only?: boolean
          manufacturer?: string | null
          min_rental_days?: number
          model?: string | null
          monthly_rate?: number | null
          name?: string
          notes_internal?: string | null
          notes_rental?: string | null
          notes_warehouse?: string | null
          packing_required?: boolean
          prep_time_minutes?: number
          purchase_date?: string | null
          purchase_price?: number | null
          quantity_unit?:
            | Database["public"]["Enums"]["product_unit_of_measure"]
            | null
          rental_enabled?: boolean
          reorder_level?: number | null
          replacement_value?: number | null
          short_name?: string | null
          status?: Database["public"]["Enums"]["product_record_state"]
          supplier_id?: string | null
          thumbnail_url?: string | null
          total_quantity?: number
          tracking_mode?: Database["public"]["Enums"]["product_tracking_mode"]
          updated_at?: string
          updated_by?: string | null
          weekend_rate?: number | null
          weekly_rate?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requests: {
        Row: {
          approved_by: string | null
          client_uuid: string
          created_at: string
          created_by: string | null
          estimated_unit_cost: number
          id: string
          pr_no: string
          product_id: string
          quantity: number
          reason_type: Database["public"]["Enums"]["purchase_request_reason"]
          rejection_reason: string | null
          requested_by: string
          status: Database["public"]["Enums"]["purchase_request_status"]
          supplier_id: string | null
          total_estimated_cost: number
          updated_at: string
          updated_by: string | null
          urgency: string
        }
        Insert: {
          approved_by?: string | null
          client_uuid: string
          created_at?: string
          created_by?: string | null
          estimated_unit_cost?: number
          id?: string
          pr_no: string
          product_id: string
          quantity?: number
          reason_type?: Database["public"]["Enums"]["purchase_request_reason"]
          rejection_reason?: string | null
          requested_by: string
          status?: Database["public"]["Enums"]["purchase_request_status"]
          supplier_id?: string | null
          total_estimated_cost?: number
          updated_at?: string
          updated_by?: string | null
          urgency?: string
        }
        Update: {
          approved_by?: string | null
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          estimated_unit_cost?: number
          id?: string
          pr_no?: string
          product_id?: string
          quantity?: number
          reason_type?: Database["public"]["Enums"]["purchase_request_reason"]
          rejection_reason?: string | null
          requested_by?: string
          status?: Database["public"]["Enums"]["purchase_request_status"]
          supplier_id?: string | null
          total_estimated_cost?: number
          updated_at?: string
          updated_by?: string | null
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requests_approved_by_fk"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_requested_by_fk"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      return_accessory_checks: {
        Row: {
          accessory_id: string | null
          accessory_name: string
          client_uuid: string
          created_at: string
          created_by: string
          id: string
          present: boolean
          replacement_cost: number | null
          return_line_id: string
        }
        Insert: {
          accessory_id?: string | null
          accessory_name: string
          client_uuid: string
          created_at?: string
          created_by: string
          id?: string
          present: boolean
          replacement_cost?: number | null
          return_line_id: string
        }
        Update: {
          accessory_id?: string | null
          accessory_name?: string
          client_uuid?: string
          created_at?: string
          created_by?: string
          id?: string
          present?: boolean
          replacement_cost?: number | null
          return_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_accessory_checks_accessory_id_fk"
            columns: ["accessory_id"]
            isOneToOne: false
            referencedRelation: "accessories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_accessory_checks_accessory_id_fk"
            columns: ["accessory_id"]
            isOneToOne: false
            referencedRelation: "accessories_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_accessory_checks_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_accessory_checks_return_line_id_fkey"
            columns: ["return_line_id"]
            isOneToOne: false
            referencedRelation: "return_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      return_lines: {
        Row: {
          booking_line_id: string
          client_uuid: string
          condition: Database["public"]["Enums"]["item_condition"] | null
          created_at: string
          created_by: string
          id: string
          inspected_at: string | null
          inspected_by: string | null
          inspection_state: Database["public"]["Enums"]["inspection_state"]
          inspector_note: string | null
          not_returned_decision:
            | Database["public"]["Enums"]["not_returned_decision"]
            | null
          not_returned_reason: string | null
          qty_expected: number
          returned_at: string | null
          returned_by_name: string | null
          session_id: string | null
          state: Database["public"]["Enums"]["return_line_state"]
          updated_at: string
        }
        Insert: {
          booking_line_id: string
          client_uuid: string
          condition?: Database["public"]["Enums"]["item_condition"] | null
          created_at?: string
          created_by: string
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          inspection_state?: Database["public"]["Enums"]["inspection_state"]
          inspector_note?: string | null
          not_returned_decision?:
            | Database["public"]["Enums"]["not_returned_decision"]
            | null
          not_returned_reason?: string | null
          qty_expected: number
          returned_at?: string | null
          returned_by_name?: string | null
          session_id?: string | null
          state?: Database["public"]["Enums"]["return_line_state"]
          updated_at?: string
        }
        Update: {
          booking_line_id?: string
          client_uuid?: string
          condition?: Database["public"]["Enums"]["item_condition"] | null
          created_at?: string
          created_by?: string
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          inspection_state?: Database["public"]["Enums"]["inspection_state"]
          inspector_note?: string | null
          not_returned_decision?:
            | Database["public"]["Enums"]["not_returned_decision"]
            | null
          not_returned_reason?: string | null
          qty_expected?: number
          returned_at?: string | null
          returned_by_name?: string | null
          session_id?: string | null
          state?: Database["public"]["Enums"]["return_line_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_lines_booking_line_id_fkey"
            columns: ["booking_line_id"]
            isOneToOne: true
            referencedRelation: "booking_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_lines_booking_line_id_fkey"
            columns: ["booking_line_id"]
            isOneToOne: true
            referencedRelation: "booking_lines_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_lines_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_lines_inspected_by_fk"
            columns: ["inspected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_lines_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "operation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_events: {
        Row: {
          booking_id: string | null
          client_uuid: string
          code: string
          code_type: Database["public"]["Enums"]["scan_code_type"]
          conflicting_booking_id: string | null
          context: Database["public"]["Enums"]["scan_context"]
          created_at: string
          created_by: string
          device_id: string
          id: string
          override_record_id: string | null
          queued_offline: boolean
          resolved_unit_id: string | null
          result: Database["public"]["Enums"]["scan_result"]
          result_reason: string | null
          scanned_at: string
          session_id: string | null
          synced_at: string | null
        }
        Insert: {
          booking_id?: string | null
          client_uuid: string
          code: string
          code_type: Database["public"]["Enums"]["scan_code_type"]
          conflicting_booking_id?: string | null
          context: Database["public"]["Enums"]["scan_context"]
          created_at?: string
          created_by: string
          device_id: string
          id?: string
          override_record_id?: string | null
          queued_offline?: boolean
          resolved_unit_id?: string | null
          result: Database["public"]["Enums"]["scan_result"]
          result_reason?: string | null
          scanned_at: string
          session_id?: string | null
          synced_at?: string | null
        }
        Update: {
          booking_id?: string | null
          client_uuid?: string
          code?: string
          code_type?: Database["public"]["Enums"]["scan_code_type"]
          conflicting_booking_id?: string | null
          context?: Database["public"]["Enums"]["scan_context"]
          created_at?: string
          created_by?: string
          device_id?: string
          id?: string
          override_record_id?: string | null
          queued_offline?: boolean
          resolved_unit_id?: string | null
          result?: Database["public"]["Enums"]["scan_result"]
          result_reason?: string | null
          scanned_at?: string
          session_id?: string | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_events_conflicting_booking_id_fkey"
            columns: ["conflicting_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_events_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_events_override_record_fk"
            columns: ["override_record_id"]
            isOneToOne: false
            referencedRelation: "override_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_events_resolved_unit_id_fk"
            columns: ["resolved_unit_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_events_resolved_unit_id_fk"
            columns: ["resolved_unit_id"]
            isOneToOne: false
            referencedRelation: "product_units_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "operation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_sync_conflicts: {
        Row: {
          client_uuid: string
          conflicting_scan_event_id: string | null
          created_at: string
          detected_at: string
          id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          scan_event_id: string
          session_id: string
        }
        Insert: {
          client_uuid: string
          conflicting_scan_event_id?: string | null
          created_at?: string
          detected_at: string
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scan_event_id: string
          session_id: string
        }
        Update: {
          client_uuid?: string
          conflicting_scan_event_id?: string | null
          created_at?: string
          detected_at?: string
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scan_event_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_sync_conflicts_conflicting_scan_event_id_fkey"
            columns: ["conflicting_scan_event_id"]
            isOneToOne: false
            referencedRelation: "scan_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_sync_conflicts_resolved_by_fk"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_sync_conflicts_scan_event_id_fkey"
            columns: ["scan_event_id"]
            isOneToOne: true
            referencedRelation: "scan_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_sync_conflicts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "operation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      security_deposits: {
        Row: {
          applied_amount: number
          booking_id: string
          branch_id: string
          client_id: string
          client_uuid: string
          created_at: string
          created_by: string | null
          deposit_no: string
          id: string
          pending_amount: number
          received_amount: number
          refunded_amount: number
          required_amount: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          applied_amount?: number
          booking_id: string
          branch_id: string
          client_id: string
          client_uuid: string
          created_at?: string
          created_by?: string | null
          deposit_no: string
          id?: string
          pending_amount?: number
          received_amount?: number
          refunded_amount?: number
          required_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          applied_amount?: number
          booking_id?: string
          branch_id?: string
          client_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          deposit_no?: string
          id?: string
          pending_amount?: number
          received_amount?: number
          refunded_amount?: number
          required_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_deposits_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_deposits_branch_id_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_deposits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_deposits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_deposits_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_deposits_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      session_line_movements: {
        Row: {
          booking_line_id: string
          client_uuid: string
          created_at: string
          created_by: string
          device_id: string | null
          id: string
          moved_at: string
          qty: number
          resulting_item_state:
            | Database["public"]["Enums"]["item_quantity_state"]
            | null
          reverses_movement_id: string | null
          scan_event_id: string | null
          serial: string | null
          session_id: string
          unit_id: string | null
        }
        Insert: {
          booking_line_id: string
          client_uuid: string
          created_at?: string
          created_by: string
          device_id?: string | null
          id?: string
          moved_at: string
          qty?: number
          resulting_item_state?:
            | Database["public"]["Enums"]["item_quantity_state"]
            | null
          reverses_movement_id?: string | null
          scan_event_id?: string | null
          serial?: string | null
          session_id: string
          unit_id?: string | null
        }
        Update: {
          booking_line_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string
          device_id?: string | null
          id?: string
          moved_at?: string
          qty?: number
          resulting_item_state?:
            | Database["public"]["Enums"]["item_quantity_state"]
            | null
          reverses_movement_id?: string | null
          scan_event_id?: string | null
          serial?: string | null
          session_id?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_line_movements_booking_line_id_fkey"
            columns: ["booking_line_id"]
            isOneToOne: false
            referencedRelation: "booking_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_line_movements_booking_line_id_fkey"
            columns: ["booking_line_id"]
            isOneToOne: false
            referencedRelation: "booking_lines_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_line_movements_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_line_movements_reverses_movement_id_fkey"
            columns: ["reverses_movement_id"]
            isOneToOne: false
            referencedRelation: "session_line_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_line_movements_scan_event_fk"
            columns: ["scan_event_id"]
            isOneToOne: false
            referencedRelation: "scan_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_line_movements_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "operation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_line_movements_unit_id_fk"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_line_movements_unit_id_fk"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "product_units_v"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          branch_id: string
          client_uuid: string
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          is_active: boolean
          shift_name: string
          start_time: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          branch_id: string
          client_uuid: string
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          is_active?: boolean
          shift_name: string
          start_time: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          branch_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          is_active?: boolean
          shift_name?: string
          start_time?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      signatures: {
        Row: {
          client_uuid: string
          created_at: string
          created_by: string
          device: string
          id: string
          is_required: boolean
          sealed_at: string | null
          session_id: string
          signature_evidence_file_id: string | null
          signature_role: Database["public"]["Enums"]["signature_role"]
          signed_at: string
          signer_name: string
        }
        Insert: {
          client_uuid: string
          created_at?: string
          created_by: string
          device: string
          id?: string
          is_required: boolean
          sealed_at?: string | null
          session_id: string
          signature_evidence_file_id?: string | null
          signature_role: Database["public"]["Enums"]["signature_role"]
          signed_at: string
          signer_name: string
        }
        Update: {
          client_uuid?: string
          created_at?: string
          created_by?: string
          device?: string
          id?: string
          is_required?: boolean
          sealed_at?: string | null
          session_id?: string
          signature_evidence_file_id?: string | null
          signature_role?: Database["public"]["Enums"]["signature_role"]
          signed_at?: string
          signer_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "signatures_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_evidence_file_fk"
            columns: ["signature_evidence_file_id"]
            isOneToOne: false
            referencedRelation: "evidence_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "operation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_gateways: {
        Row: {
          api_endpoint: string
          client_uuid: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          provider_name: string
          sender_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          api_endpoint: string
          client_uuid: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          provider_name: string
          sender_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          api_endpoint?: string
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          provider_name?: string
          sender_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_gateways_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_gateways_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_audit_items: {
        Row: {
          client_uuid: string
          discrepancy_notes: string | null
          exclusion_reason:
            | Database["public"]["Enums"]["stock_check_exclusion"]
            | null
          expected_state: Database["public"]["Enums"]["inventory_state"]
          id: string
          outcome: Database["public"]["Enums"]["stock_check_outcome"]
          product_unit_id: string
          scanned_at: string | null
          scanned_by: string | null
          scanned_state: Database["public"]["Enums"]["inventory_state"] | null
          stock_audit_id: string
        }
        Insert: {
          client_uuid: string
          discrepancy_notes?: string | null
          exclusion_reason?:
            | Database["public"]["Enums"]["stock_check_exclusion"]
            | null
          expected_state: Database["public"]["Enums"]["inventory_state"]
          id?: string
          outcome?: Database["public"]["Enums"]["stock_check_outcome"]
          product_unit_id: string
          scanned_at?: string | null
          scanned_by?: string | null
          scanned_state?: Database["public"]["Enums"]["inventory_state"] | null
          stock_audit_id: string
        }
        Update: {
          client_uuid?: string
          discrepancy_notes?: string | null
          exclusion_reason?:
            | Database["public"]["Enums"]["stock_check_exclusion"]
            | null
          expected_state?: Database["public"]["Enums"]["inventory_state"]
          id?: string
          outcome?: Database["public"]["Enums"]["stock_check_outcome"]
          product_unit_id?: string
          scanned_at?: string | null
          scanned_by?: string | null
          scanned_state?: Database["public"]["Enums"]["inventory_state"] | null
          stock_audit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_audit_items_product_unit_id_fkey"
            columns: ["product_unit_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_audit_items_product_unit_id_fkey"
            columns: ["product_unit_id"]
            isOneToOne: false
            referencedRelation: "product_units_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_audit_items_scanned_by_fk"
            columns: ["scanned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_audit_items_stock_audit_id_fkey"
            columns: ["stock_audit_id"]
            isOneToOne: false
            referencedRelation: "stock_audits"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_audits: {
        Row: {
          audit_no: string
          audited_by: string | null
          branch_id: string
          client_uuid: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          scheduled_date: string
          scope: Database["public"]["Enums"]["stock_check_scope"]
          started_at: string | null
          status: string
          total_discrepancies: number
          total_expected: number
          total_scanned: number
          updated_at: string
          updated_by: string | null
          warehouse_id: string
        }
        Insert: {
          audit_no: string
          audited_by?: string | null
          branch_id: string
          client_uuid: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          scheduled_date: string
          scope?: Database["public"]["Enums"]["stock_check_scope"]
          started_at?: string | null
          status?: string
          total_discrepancies?: number
          total_expected?: number
          total_scanned?: number
          updated_at?: string
          updated_by?: string | null
          warehouse_id: string
        }
        Update: {
          audit_no?: string
          audited_by?: string | null
          branch_id?: string
          client_uuid?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          scheduled_date?: string
          scope?: Database["public"]["Enums"]["stock_check_scope"]
          started_at?: string | null
          status?: string
          total_discrepancies?: number
          total_expected?: number
          total_scanned?: number
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_audits_audited_by_fk"
            columns: ["audited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_audits_branch_id_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_audits_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_audits_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_audits_warehouse_id_fk"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_lines: {
        Row: {
          client_uuid: string
          condition_on_receipt:
            | Database["public"]["Enums"]["unit_condition"]
            | null
          created_at: string
          id: string
          notes: string | null
          product_id: string
          product_unit_id: string | null
          received_quantity: number
          requested_quantity: number
          transfer_id: string
          transferred_quantity: number
        }
        Insert: {
          client_uuid: string
          condition_on_receipt?:
            | Database["public"]["Enums"]["unit_condition"]
            | null
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          product_unit_id?: string | null
          received_quantity?: number
          requested_quantity?: number
          transfer_id: string
          transferred_quantity?: number
        }
        Update: {
          client_uuid?: string
          condition_on_receipt?:
            | Database["public"]["Enums"]["unit_condition"]
            | null
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          product_unit_id?: string | null
          received_quantity?: number
          requested_quantity?: number
          transfer_id?: string
          transferred_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_product_unit_id_fkey"
            columns: ["product_unit_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_product_unit_id_fkey"
            columns: ["product_unit_id"]
            isOneToOne: false
            referencedRelation: "product_units_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_lines_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_uuid: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          destination_branch_id: string
          destination_warehouse_id: string
          destination_zone_id: string | null
          dispatched_at: string | null
          dispatched_by: string | null
          id: string
          notes: string | null
          received_at: string | null
          received_by: string | null
          requested_at: string
          requested_by: string
          source_branch_id: string
          source_warehouse_id: string
          source_zone_id: string | null
          status: Database["public"]["Enums"]["transfer_status"]
          transfer_no: string
          transfer_type: Database["public"]["Enums"]["transfer_kind"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_uuid: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          destination_branch_id: string
          destination_warehouse_id: string
          destination_zone_id?: string | null
          dispatched_at?: string | null
          dispatched_by?: string | null
          id?: string
          notes?: string | null
          received_at?: string | null
          received_by?: string | null
          requested_at?: string
          requested_by: string
          source_branch_id: string
          source_warehouse_id: string
          source_zone_id?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          transfer_no: string
          transfer_type?: Database["public"]["Enums"]["transfer_kind"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_uuid?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          destination_branch_id?: string
          destination_warehouse_id?: string
          destination_zone_id?: string | null
          dispatched_at?: string | null
          dispatched_by?: string | null
          id?: string
          notes?: string | null
          received_at?: string | null
          received_by?: string | null
          requested_at?: string
          requested_by?: string
          source_branch_id?: string
          source_warehouse_id?: string
          source_zone_id?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          transfer_no?: string
          transfer_type?: Database["public"]["Enums"]["transfer_kind"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_approved_by_fk"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_cancelled_by_fk"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_destination_branch_id_fk"
            columns: ["destination_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_destination_warehouse_id_fk"
            columns: ["destination_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_destination_zone_id_fk"
            columns: ["destination_zone_id"]
            isOneToOne: false
            referencedRelation: "storage_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_dispatched_by_fk"
            columns: ["dispatched_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_received_by_fk"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_requested_by_fk"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_source_branch_id_fk"
            columns: ["source_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_source_warehouse_id_fk"
            columns: ["source_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_source_zone_id_fk"
            columns: ["source_zone_id"]
            isOneToOne: false
            referencedRelation: "storage_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_zones: {
        Row: {
          client_uuid: string
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          level: Database["public"]["Enums"]["storage_level"]
          name: string
          parent_id: string | null
          updated_at: string
          updated_by: string | null
          warehouse_id: string
        }
        Insert: {
          client_uuid: string
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          level?: Database["public"]["Enums"]["storage_level"]
          name: string
          parent_id?: string | null
          updated_at?: string
          updated_by?: string | null
          warehouse_id: string
        }
        Update: {
          client_uuid?: string
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          level?: Database["public"]["Enums"]["storage_level"]
          name?: string
          parent_id?: string | null
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_zones_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_zones_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "storage_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_zones_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_zones_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          client_uuid: string
          contact_person: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          pan_vat_no: string | null
          payment_terms_days: number
          phone: string | null
          rating: number | null
          supplier_code: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          client_uuid: string
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          pan_vat_no?: string | null
          payment_terms_days?: number
          phone?: string | null
          rating?: number | null
          supplier_code: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          client_uuid?: string
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          pan_vat_no?: string | null
          payment_terms_days?: number
          phone?: string | null
          rating?: number | null
          supplier_code?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_conflicts: {
        Row: {
          detected_at: string
          entity: string
          external_id: string | null
          external_value: string | null
          field: string
          id: string
          local_id: string | null
          local_value: string | null
          owner: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          detected_at?: string
          entity: string
          external_id?: string | null
          external_value?: string | null
          field: string
          id?: string
          local_id?: string | null
          local_value?: string | null
          owner: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          detected_at?: string
          entity?: string
          external_id?: string | null
          external_value?: string | null
          field?: string
          id?: string
          local_id?: string | null
          local_value?: string | null
          owner?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: []
      }
      sync_inbox: {
        Row: {
          attempts: number
          entity: string | null
          error: string | null
          event: string
          external_id: string | null
          id: string
          processed_at: string | null
          raw: Json
          received_at: string
          signature_ok: boolean
          status: Database["public"]["Enums"]["sync_status"]
        }
        Insert: {
          attempts?: number
          entity?: string | null
          error?: string | null
          event: string
          external_id?: string | null
          id?: string
          processed_at?: string | null
          raw: Json
          received_at?: string
          signature_ok: boolean
          status?: Database["public"]["Enums"]["sync_status"]
        }
        Update: {
          attempts?: number
          entity?: string | null
          error?: string | null
          event?: string
          external_id?: string | null
          id?: string
          processed_at?: string | null
          raw?: Json
          received_at?: string
          signature_ok?: boolean
          status?: Database["public"]["Enums"]["sync_status"]
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          actor: string | null
          at: string
          direction: Database["public"]["Enums"]["sync_direction"]
          duration_ms: number | null
          entity: string | null
          error: string | null
          external_id: string | null
          http_status: number | null
          id: number
          method: string | null
          path: string | null
          payload_hash: string | null
        }
        Insert: {
          actor?: string | null
          at?: string
          direction: Database["public"]["Enums"]["sync_direction"]
          duration_ms?: number | null
          entity?: string | null
          error?: string | null
          external_id?: string | null
          http_status?: number | null
          id?: number
          method?: string | null
          path?: string | null
          payload_hash?: string | null
        }
        Update: {
          actor?: string | null
          at?: string
          direction?: Database["public"]["Enums"]["sync_direction"]
          duration_ms?: number | null
          entity?: string | null
          error?: string | null
          external_id?: string | null
          http_status?: number | null
          id?: number
          method?: string | null
          path?: string | null
          payload_hash?: string | null
        }
        Relationships: []
      }
      sync_outbox: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          entity: string
          error: string | null
          external_id: string | null
          id: string
          idempotency_key: string
          local_id: string
          next_attempt_at: string
          operation: string
          payload: Json
          status: Database["public"]["Enums"]["sync_status"]
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          entity: string
          error?: string | null
          external_id?: string | null
          id?: string
          idempotency_key: string
          local_id: string
          next_attempt_at?: string
          operation: string
          payload: Json
          status?: Database["public"]["Enums"]["sync_status"]
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          entity?: string
          error?: string | null
          external_id?: string | null
          id?: string
          idempotency_key?: string
          local_id?: string
          next_attempt_at?: string
          operation?: string
          payload?: Json
          status?: Database["public"]["Enums"]["sync_status"]
        }
        Relationships: []
      }
      sync_state: {
        Row: {
          cursor: string | null
          entity: string
          last_error: string | null
          last_full_sync_at: string | null
          records_seen: number
          updated_at: string
        }
        Insert: {
          cursor?: string | null
          entity: string
          last_error?: string | null
          last_full_sync_at?: string | null
          records_seen?: number
          updated_at?: string
        }
        Update: {
          cursor?: string | null
          entity?: string
          last_error?: string | null
          last_full_sync_at?: string | null
          records_seen?: number
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          client_uuid: string
          description: string | null
          id: string
          is_encrypted: boolean
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          client_uuid: string
          description?: string | null
          id?: string
          is_encrypted?: boolean
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          client_uuid?: string
          description?: string | null
          id?: string
          is_encrypted?: boolean
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_ledgers: {
        Row: {
          branch_id: string
          client_uuid: string
          created_at: string
          entry_date: string
          entry_no: string
          expense_id: string | null
          fiscal_period_id: string
          id: string
          invoice_id: string | null
          pan_vat_no: string | null
          party_name: string
          tax_amount: number
          tax_direction: string
          tax_rate: number
          tax_type: string
          taxable_amount: number
        }
        Insert: {
          branch_id: string
          client_uuid: string
          created_at?: string
          entry_date: string
          entry_no: string
          expense_id?: string | null
          fiscal_period_id: string
          id?: string
          invoice_id?: string | null
          pan_vat_no?: string | null
          party_name: string
          tax_amount?: number
          tax_direction: string
          tax_rate?: number
          tax_type?: string
          taxable_amount?: number
        }
        Update: {
          branch_id?: string
          client_uuid?: string
          created_at?: string
          entry_date?: string
          entry_no?: string
          expense_id?: string | null
          fiscal_period_id?: string
          id?: string
          invoice_id?: string | null
          pan_vat_no?: string | null
          party_name?: string
          tax_amount?: number
          tax_direction?: string
          tax_rate?: number
          tax_type?: string
          taxable_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_ledgers_branch_id_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_ledgers_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_ledgers_fiscal_period_id_fkey"
            columns: ["fiscal_period_id"]
            isOneToOne: false
            referencedRelation: "fiscal_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_ledgers_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheets: {
        Row: {
          approval_state: Database["public"]["Enums"]["timesheet_approval_state"]
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          break_minutes: number
          client_uuid: string
          clock_in: string
          clock_out: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          shift_id: string | null
          submission_state: Database["public"]["Enums"]["timesheet_submission_state"]
          timesheet_no: string
          total_hours: number | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          approval_state?: Database["public"]["Enums"]["timesheet_approval_state"]
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          break_minutes?: number
          client_uuid: string
          clock_in: string
          clock_out?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          shift_id?: string | null
          submission_state?: Database["public"]["Enums"]["timesheet_submission_state"]
          timesheet_no: string
          total_hours?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          approval_state?: Database["public"]["Enums"]["timesheet_approval_state"]
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          break_minutes?: number
          client_uuid?: string
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          shift_id?: string | null
          submission_state?: Database["public"]["Enums"]["timesheet_submission_state"]
          timesheet_no?: string
          total_hours?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheets_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_approval_authorities: {
        Row: {
          client_uuid: string
          granted_at: string
          granted_by: string | null
          id: string
          is_active: boolean
          max_amount_limit: number | null
          max_discount_pct: number | null
          permission_type: Database["public"]["Enums"]["approval_permission"]
          user_id: string
        }
        Insert: {
          client_uuid: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          max_amount_limit?: number | null
          max_discount_pct?: number | null
          permission_type: Database["public"]["Enums"]["approval_permission"]
          user_id: string
        }
        Update: {
          client_uuid?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          max_amount_limit?: number | null
          max_discount_pct?: number | null
          permission_type?: Database["public"]["Enums"]["approval_permission"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_approval_authorities_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_approval_authorities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          client_uuid: string
          id: string
          role: Database["public"]["Enums"]["system_role"]
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          client_uuid: string
          id?: string
          role: Database["public"]["Enums"]["system_role"]
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          client_uuid?: string
          id?: string
          role?: Database["public"]["Enums"]["system_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          branch_id: string
          client_uuid: string
          created_at: string
          created_by: string | null
          department: string | null
          email: string
          employee_code: string
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          mobile: string
          primary_role: Database["public"]["Enums"]["system_role"]
          updated_at: string
          updated_by: string | null
          warehouse_id: string | null
        }
        Insert: {
          branch_id: string
          client_uuid: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          email: string
          employee_code: string
          full_name: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          mobile: string
          primary_role?: Database["public"]["Enums"]["system_role"]
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Update: {
          branch_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          email?: string
          employee_code?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          mobile?: string
          primary_role?: Database["public"]["Enums"]["system_role"]
          updated_at?: string
          updated_by?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_fuel_logs: {
        Row: {
          branch_id: string
          client_uuid: string
          cost_amount: number
          created_at: string
          fuel_date: string
          fuel_liters: number
          id: string
          odometer: number
          receipt_url: string | null
          recorded_by: string
          vehicle_id: string
        }
        Insert: {
          branch_id: string
          client_uuid: string
          cost_amount: number
          created_at?: string
          fuel_date?: string
          fuel_liters: number
          id?: string
          odometer: number
          receipt_url?: string | null
          recorded_by: string
          vehicle_id: string
        }
        Update: {
          branch_id?: string
          client_uuid?: string
          cost_amount?: number
          created_at?: string
          fuel_date?: string
          fuel_liters?: number
          id?: string
          odometer?: number
          receipt_url?: string | null
          recorded_by?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_fuel_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_fuel_logs_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_fuel_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_trip_logs: {
        Row: {
          booking_id: string | null
          client_uuid: string
          created_at: string
          driver_id: string | null
          end_odometer: number | null
          end_time: string | null
          id: string
          purpose: string
          route_description: string
          start_odometer: number
          start_time: string
          vehicle_id: string
        }
        Insert: {
          booking_id?: string | null
          client_uuid: string
          created_at?: string
          driver_id?: string | null
          end_odometer?: number | null
          end_time?: string | null
          id?: string
          purpose?: string
          route_description: string
          start_odometer: number
          start_time?: string
          vehicle_id: string
        }
        Update: {
          booking_id?: string | null
          client_uuid?: string
          created_at?: string
          driver_id?: string | null
          end_odometer?: number | null
          end_time?: string | null
          id?: string
          purpose?: string
          route_description?: string
          start_odometer?: number
          start_time?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_trip_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_trip_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_trip_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          branch_id: string
          client_uuid: string
          created_at: string
          created_by: string | null
          current_odometer: number
          id: string
          is_active: boolean
          make: string
          manufacturing_year: number | null
          model: string
          registration_plate: string
          updated_at: string
          updated_by: string | null
          vehicle_code: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Insert: {
          branch_id: string
          client_uuid: string
          created_at?: string
          created_by?: string | null
          current_odometer?: number
          id?: string
          is_active?: boolean
          make: string
          manufacturing_year?: number | null
          model: string
          registration_plate: string
          updated_at?: string
          updated_by?: string | null
          vehicle_code: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
        }
        Update: {
          branch_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          current_odometer?: number
          id?: string
          is_active?: boolean
          make?: string
          manufacturing_year?: number | null
          model?: string
          registration_plate?: string
          updated_at?: string
          updated_by?: string | null
          vehicle_code?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          branch_id: string
          client_uuid: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          name: string
          status: Database["public"]["Enums"]["warehouse_status"]
          updated_at: string
          updated_by: string | null
          warehouse_code: string
        }
        Insert: {
          address?: string | null
          branch_id: string
          client_uuid: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          name: string
          status?: Database["public"]["Enums"]["warehouse_status"]
          updated_at?: string
          updated_by?: string | null
          warehouse_code: string
        }
        Update: {
          address?: string | null
          branch_id?: string
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          name?: string
          status?: Database["public"]["Enums"]["warehouse_status"]
          updated_at?: string
          updated_by?: string | null
          warehouse_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          client_uuid: string
          created_at: string
          created_by: string | null
          endpoint_url: string
          event_types: string[]
          id: string
          is_active: boolean
          last_triggered_at: string | null
          secret_token: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_uuid: string
          created_at?: string
          created_by?: string | null
          endpoint_url: string
          event_types?: string[]
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          secret_token: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_uuid?: string
          created_at?: string
          created_by?: string | null
          endpoint_url?: string
          event_types?: string[]
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          secret_token?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhooks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      accessories_v: {
        Row: {
          client_uuid: string | null
          created_at: string | null
          created_by: string | null
          id: string | null
          is_mandatory: boolean | null
          name: string | null
          product_id: string | null
          quantity: number | null
          replacement_cost: number | null
          sort_order: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          is_mandatory?: boolean | null
          name?: string | null
          product_id?: string | null
          quantity?: number | null
          replacement_cost?: never
          sort_order?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          is_mandatory?: boolean | null
          name?: string | null
          product_id?: string | null
          quantity?: number | null
          replacement_cost?: never
          sort_order?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accessories_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accessories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accessories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accessories_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_crew_lines_v: {
        Row: {
          accommodation: number | null
          booking_id: string | null
          client_uuid: string | null
          created_at: string | null
          created_by: string | null
          crew_member_id: string | null
          crew_role: Database["public"]["Enums"]["crew_role"] | null
          day_rate: number | null
          days: number | null
          id: string | null
          meals: number | null
          name: string | null
          overtime: number | null
          phone: string | null
          voided_at: string | null
        }
        Insert: {
          accommodation?: never
          booking_id?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_member_id?: string | null
          crew_role?: Database["public"]["Enums"]["crew_role"] | null
          day_rate?: never
          days?: number | null
          id?: string | null
          meals?: never
          name?: string | null
          overtime?: never
          phone?: string | null
          voided_at?: string | null
        }
        Update: {
          accommodation?: never
          booking_id?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_member_id?: string | null
          crew_role?: Database["public"]["Enums"]["crew_role"] | null
          day_rate?: never
          days?: number | null
          id?: string | null
          meals?: never
          name?: string | null
          overtime?: never
          phone?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_crew_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_crew_lines_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_crew_lines_crew_member_id_fk"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_lines_v: {
        Row: {
          booking_id: string | null
          bundle_id: string | null
          client_uuid: string | null
          created_at: string | null
          created_by: string | null
          days: number | null
          description: string | null
          discount_amount: number | null
          id: string | null
          is_included: boolean | null
          line_note: string | null
          line_type: Database["public"]["Enums"]["booking_line_type"] | null
          markup_amount: number | null
          parent_line_id: string | null
          product_id: string | null
          qty: number | null
          rate: number | null
          service_basis: Database["public"]["Enums"]["service_basis"] | null
          sort_order: number | null
          supplier_cost: number | null
          supplier_id: string | null
          voided_at: string | null
          voided_reason: string | null
        }
        Insert: {
          booking_id?: string | null
          bundle_id?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          days?: number | null
          description?: string | null
          discount_amount?: never
          id?: string | null
          is_included?: boolean | null
          line_note?: string | null
          line_type?: Database["public"]["Enums"]["booking_line_type"] | null
          markup_amount?: never
          parent_line_id?: string | null
          product_id?: string | null
          qty?: number | null
          rate?: never
          service_basis?: Database["public"]["Enums"]["service_basis"] | null
          sort_order?: number | null
          supplier_cost?: never
          supplier_id?: string | null
          voided_at?: string | null
          voided_reason?: string | null
        }
        Update: {
          booking_id?: string | null
          bundle_id?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          days?: number | null
          description?: string | null
          discount_amount?: never
          id?: string | null
          is_included?: boolean | null
          line_note?: string | null
          line_type?: Database["public"]["Enums"]["booking_line_type"] | null
          markup_amount?: never
          parent_line_id?: string | null
          product_id?: string | null
          qty?: number | null
          rate?: never
          service_basis?: Database["public"]["Enums"]["service_basis"] | null
          sort_order?: number | null
          supplier_cost?: never
          supplier_id?: string | null
          voided_at?: string | null
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_lines_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_lines_bundle_id_fk"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_lines_bundle_id_fk"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_lines_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_lines_parent_line_id_fkey"
            columns: ["parent_line_id"]
            isOneToOne: false
            referencedRelation: "booking_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_lines_parent_line_id_fkey"
            columns: ["parent_line_id"]
            isOneToOne: false
            referencedRelation: "booking_lines_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_lines_product_id_fk"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_lines_product_id_fk"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_lines_supplier_id_fk"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      bundles_v: {
        Row: {
          bundle_code: string | null
          category_id: string | null
          client_uuid: string | null
          created_at: string | null
          created_by: string | null
          daily_rate: number | null
          description: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          updated_at: string | null
          updated_by: string | null
          weekly_rate: number | null
        }
        Insert: {
          bundle_code?: string | null
          category_id?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          daily_rate?: never
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          updated_at?: string | null
          updated_by?: string | null
          weekly_rate?: never
        }
        Update: {
          bundle_code?: string | null
          category_id?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          daily_rate?: never
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          updated_at?: string | null
          updated_by?: string | null
          weekly_rate?: never
        }
        Relationships: [
          {
            foreignKeyName: "bundles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundles_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundles_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cases_v: {
        Row: {
          absorbed_amount: number | null
          assessed_amount: number | null
          case_no: string | null
          charged_to_client_amount: number | null
          client_uuid: string | null
          counterparty_kind:
            | Database["public"]["Enums"]["case_counterparty_kind"]
            | null
          counterparty_name: string | null
          created_at: string | null
          created_by: string | null
          deposit_applied_amount: number | null
          deposit_held_amount: number | null
          disposition: string | null
          flags: Database["public"]["Enums"]["case_flag"][] | null
          id: string | null
          insurance_claimed_amount: number | null
          linked_booking_id: string | null
          opened_at: string | null
          owner_id: string | null
          priority: Database["public"]["Enums"]["case_priority"] | null
          recovered_from_partner_amount: number | null
          settled_at: string | null
          status: Database["public"]["Enums"]["case_status"] | null
          title: string | null
          type: Database["public"]["Enums"]["case_type"] | null
          updated_at: string | null
          warranty_covered_amount: number | null
        }
        Insert: {
          absorbed_amount?: never
          assessed_amount?: never
          case_no?: string | null
          charged_to_client_amount?: never
          client_uuid?: string | null
          counterparty_kind?:
            | Database["public"]["Enums"]["case_counterparty_kind"]
            | null
          counterparty_name?: string | null
          created_at?: string | null
          created_by?: string | null
          deposit_applied_amount?: never
          deposit_held_amount?: never
          disposition?: string | null
          flags?: Database["public"]["Enums"]["case_flag"][] | null
          id?: string | null
          insurance_claimed_amount?: never
          linked_booking_id?: string | null
          opened_at?: string | null
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["case_priority"] | null
          recovered_from_partner_amount?: never
          settled_at?: string | null
          status?: Database["public"]["Enums"]["case_status"] | null
          title?: string | null
          type?: Database["public"]["Enums"]["case_type"] | null
          updated_at?: string | null
          warranty_covered_amount?: never
        }
        Update: {
          absorbed_amount?: never
          assessed_amount?: never
          case_no?: string | null
          charged_to_client_amount?: never
          client_uuid?: string | null
          counterparty_kind?:
            | Database["public"]["Enums"]["case_counterparty_kind"]
            | null
          counterparty_name?: string | null
          created_at?: string | null
          created_by?: string | null
          deposit_applied_amount?: never
          deposit_held_amount?: never
          disposition?: string | null
          flags?: Database["public"]["Enums"]["case_flag"][] | null
          id?: string | null
          insurance_claimed_amount?: never
          linked_booking_id?: string | null
          opened_at?: string | null
          owner_id?: string | null
          priority?: Database["public"]["Enums"]["case_priority"] | null
          recovered_from_partner_amount?: never
          settled_at?: string | null
          status?: Database["public"]["Enums"]["case_status"] | null
          title?: string | null
          type?: Database["public"]["Enums"]["case_type"] | null
          updated_at?: string | null
          warranty_covered_amount?: never
        }
        Relationships: [
          {
            foreignKeyName: "cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_linked_booking_id_fkey"
            columns: ["linked_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_channel_identities_v: {
        Row: {
          address: string | null
          channel: Database["public"]["Enums"]["channel_code"] | null
          client_id: string | null
          client_uuid: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          deactivated_at: string | null
          deactivation_reason: string | null
          id: string | null
          is_active: boolean | null
          is_on_whatsapp: boolean | null
        }
        Insert: {
          address?: never
          channel?: Database["public"]["Enums"]["channel_code"] | null
          client_id?: string | null
          client_uuid?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deactivated_at?: string | null
          deactivation_reason?: string | null
          id?: string | null
          is_active?: boolean | null
          is_on_whatsapp?: boolean | null
        }
        Update: {
          address?: never
          channel?: Database["public"]["Enums"]["channel_code"] | null
          client_id?: string | null
          client_uuid?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deactivated_at?: string | null
          deactivation_reason?: string | null
          id?: string | null
          is_active?: boolean | null
          is_on_whatsapp?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "client_channel_identities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_channel_identities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_channel_identities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_channel_identities_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_memberships_v: {
        Row: {
          client_id: string | null
          client_uuid: string | null
          created_at: string | null
          created_by: string | null
          fee_paid: number | null
          id: string | null
          join_date: string | null
          plan_id: string | null
          superseded_at: string | null
          superseded_by_id: string | null
        }
        Insert: {
          client_id?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          fee_paid?: never
          id?: string | null
          join_date?: string | null
          plan_id?: string | null
          superseded_at?: string | null
          superseded_by_id?: string | null
        }
        Update: {
          client_id?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          fee_paid?: never
          id?: string | null
          join_date?: string | null
          plan_id?: string | null
          superseded_at?: string | null
          superseded_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_memberships_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "client_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "client_memberships_v"
            referencedColumns: ["id"]
          },
        ]
      }
      clients_v: {
        Row: {
          address_line: string | null
          approved_credit_limit: number | null
          assigned_staff_id: string | null
          billing_address: string | null
          business_registration: string | null
          city: string | null
          client_code: string | null
          client_since: string | null
          client_uuid: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          district: string | null
          email: string | null
          government_id_kind:
            | Database["public"]["Enums"]["government_id_kind"]
            | null
          government_id_number: string | null
          id: string | null
          marketing_photo_consent: boolean | null
          merged_into_client_id: string | null
          name: string | null
          notes: string | null
          org_subtype:
            | Database["public"]["Enums"]["client_organisation_subtype"]
            | null
          pan_vat: string | null
          payment_terms: Database["public"]["Enums"]["payment_terms"] | null
          phone: string | null
          portal_default_language:
            | Database["public"]["Enums"]["portal_language"]
            | null
          postal_code: string | null
          preferred_contact_channels:
            | Database["public"]["Enums"]["preferred_contact_channel"][]
            | null
          professions: Database["public"]["Enums"]["client_profession"][] | null
          referred_by_client_id: string | null
          segments: Database["public"]["Enums"]["client_segment"][] | null
          source: string | null
          status: Database["public"]["Enums"]["client_status"] | null
          tags: string[] | null
          type_parent: Database["public"]["Enums"]["client_type_parent"] | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address_line?: string | null
          approved_credit_limit?: never
          assigned_staff_id?: string | null
          billing_address?: string | null
          business_registration?: string | null
          city?: string | null
          client_code?: string | null
          client_since?: string | null
          client_uuid?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          district?: string | null
          email?: string | null
          government_id_kind?:
            | Database["public"]["Enums"]["government_id_kind"]
            | null
          government_id_number?: string | null
          id?: string | null
          marketing_photo_consent?: boolean | null
          merged_into_client_id?: string | null
          name?: string | null
          notes?: string | null
          org_subtype?:
            | Database["public"]["Enums"]["client_organisation_subtype"]
            | null
          pan_vat?: string | null
          payment_terms?: never
          phone?: string | null
          portal_default_language?:
            | Database["public"]["Enums"]["portal_language"]
            | null
          postal_code?: string | null
          preferred_contact_channels?:
            | Database["public"]["Enums"]["preferred_contact_channel"][]
            | null
          professions?:
            | Database["public"]["Enums"]["client_profession"][]
            | null
          referred_by_client_id?: string | null
          segments?: Database["public"]["Enums"]["client_segment"][] | null
          source?: string | null
          status?: Database["public"]["Enums"]["client_status"] | null
          tags?: string[] | null
          type_parent?: Database["public"]["Enums"]["client_type_parent"] | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address_line?: string | null
          approved_credit_limit?: never
          assigned_staff_id?: string | null
          billing_address?: string | null
          business_registration?: string | null
          city?: string | null
          client_code?: string | null
          client_since?: string | null
          client_uuid?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          district?: string | null
          email?: string | null
          government_id_kind?:
            | Database["public"]["Enums"]["government_id_kind"]
            | null
          government_id_number?: string | null
          id?: string | null
          marketing_photo_consent?: boolean | null
          merged_into_client_id?: string | null
          name?: string | null
          notes?: string | null
          org_subtype?:
            | Database["public"]["Enums"]["client_organisation_subtype"]
            | null
          pan_vat?: string | null
          payment_terms?: never
          phone?: string | null
          portal_default_language?:
            | Database["public"]["Enums"]["portal_language"]
            | null
          postal_code?: string | null
          preferred_contact_channels?:
            | Database["public"]["Enums"]["preferred_contact_channel"][]
            | null
          professions?:
            | Database["public"]["Enums"]["client_profession"][]
            | null
          referred_by_client_id?: string | null
          segments?: Database["public"]["Enums"]["client_segment"][] | null
          source?: string | null
          status?: Database["public"]["Enums"]["client_status"] | null
          tags?: string[] | null
          type_parent?: Database["public"]["Enums"]["client_type_parent"] | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_assigned_staff_id_fk"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_deactivated_by_fk"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_merged_into_client_id_fkey"
            columns: ["merged_into_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_merged_into_client_id_fkey"
            columns: ["merged_into_client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_referred_by_client_id_fkey"
            columns: ["referred_by_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_referred_by_client_id_fkey"
            columns: ["referred_by_client_id"]
            isOneToOne: false
            referencedRelation: "clients_v"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_assignments_v: {
        Row: {
          booking_id: string | null
          call_time: string | null
          client_uuid: string | null
          created_at: string | null
          created_by: string | null
          crew_id: string | null
          daily_rate: number | null
          days: number | null
          id: string | null
          line_total: number | null
          notes: string | null
          role_on_shoot: string | null
          updated_at: string | null
          updated_by: string | null
          wrap_time: string | null
        }
        Insert: {
          booking_id?: string | null
          call_time?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_id?: string | null
          daily_rate?: never
          days?: number | null
          id?: string | null
          line_total?: never
          notes?: string | null
          role_on_shoot?: string | null
          updated_at?: string | null
          updated_by?: string | null
          wrap_time?: string | null
        }
        Update: {
          booking_id?: string | null
          call_time?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_id?: string | null
          daily_rate?: never
          days?: number | null
          id?: string | null
          line_total?: never
          notes?: string | null
          role_on_shoot?: string | null
          updated_at?: string | null
          updated_by?: string | null
          wrap_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_assignments_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_profiles_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_assignments_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crew_profiles_v2_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_assignments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_bookings_v: {
        Row: {
          booking_id: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          client_uuid: string | null
          conflict_override_at: string | null
          conflict_override_by: string | null
          conflict_override_reason: string | null
          created_at: string | null
          created_by: string | null
          crew_booking_no: string | null
          crew_member_id: string | null
          day_rate: number | null
          days: number | null
          end_date: string | null
          id: string | null
          location: string | null
          payout_state: Database["public"]["Enums"]["crew_payout_state"] | null
          position: string | null
          production_id: string | null
          start_date: string | null
          state: Database["public"]["Enums"]["crew_booking_state"] | null
          travel_warning_acknowledged_at: string | null
          travel_warning_acknowledged_by: string | null
          updated_at: string | null
        }
        Insert: {
          booking_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_uuid?: string | null
          conflict_override_at?: string | null
          conflict_override_by?: string | null
          conflict_override_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_booking_no?: string | null
          crew_member_id?: string | null
          day_rate?: never
          days?: number | null
          end_date?: string | null
          id?: string | null
          location?: string | null
          payout_state?: Database["public"]["Enums"]["crew_payout_state"] | null
          position?: string | null
          production_id?: string | null
          start_date?: string | null
          state?: Database["public"]["Enums"]["crew_booking_state"] | null
          travel_warning_acknowledged_at?: string | null
          travel_warning_acknowledged_by?: string | null
          updated_at?: string | null
        }
        Update: {
          booking_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          client_uuid?: string | null
          conflict_override_at?: string | null
          conflict_override_by?: string | null
          conflict_override_reason?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_booking_no?: string | null
          crew_member_id?: string | null
          day_rate?: never
          days?: number | null
          end_date?: string | null
          id?: string | null
          location?: string | null
          payout_state?: Database["public"]["Enums"]["crew_payout_state"] | null
          position?: string | null
          production_id?: string | null
          start_date?: string | null
          state?: Database["public"]["Enums"]["crew_booking_state"] | null
          travel_warning_acknowledged_at?: string | null
          travel_warning_acknowledged_by?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_bookings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_bookings_conflict_override_by_fk"
            columns: ["conflict_override_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_bookings_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_bookings_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_bookings_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crew_members_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_bookings_travel_warning_acknowledged_by_fk"
            columns: ["travel_warning_acknowledged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_members_v: {
        Row: {
          client_uuid: string | null
          created_at: string | null
          created_by: string | null
          day_rate: number | null
          deactivated_at: string | null
          engagement_type:
            | Database["public"]["Enums"]["crew_engagement_type"]
            | null
          full_name: string | null
          id: string | null
          internal_note: string | null
          pan_status: Database["public"]["Enums"]["crew_pan_status"] | null
          phone: string | null
          position: string | null
          updated_at: string | null
          withholding_rate: number | null
        }
        Insert: {
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          day_rate?: never
          deactivated_at?: string | null
          engagement_type?:
            | Database["public"]["Enums"]["crew_engagement_type"]
            | null
          full_name?: string | null
          id?: string | null
          internal_note?: never
          pan_status?: Database["public"]["Enums"]["crew_pan_status"] | null
          phone?: string | null
          position?: string | null
          updated_at?: string | null
          withholding_rate?: never
        }
        Update: {
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          day_rate?: never
          deactivated_at?: string | null
          engagement_type?:
            | Database["public"]["Enums"]["crew_engagement_type"]
            | null
          full_name?: string | null
          id?: string | null
          internal_note?: never
          pan_status?: Database["public"]["Enums"]["crew_pan_status"] | null
          phone?: string | null
          position?: string | null
          updated_at?: string | null
          withholding_rate?: never
        }
        Relationships: [
          {
            foreignKeyName: "crew_members_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_profiles_v2_v: {
        Row: {
          client_uuid: string | null
          created_at: string | null
          created_by: string | null
          crew_code: string | null
          daily_rate: number | null
          email: string | null
          full_name: string | null
          hourly_rate: number | null
          id: string | null
          is_active: boolean | null
          is_internal_staff: boolean | null
          mobile: string | null
          primary_role: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_code?: string | null
          daily_rate?: never
          email?: string | null
          full_name?: string | null
          hourly_rate?: never
          id?: string | null
          is_active?: boolean | null
          is_internal_staff?: boolean | null
          mobile?: string | null
          primary_role?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          crew_code?: string | null
          daily_rate?: never
          email?: string | null
          full_name?: string | null
          hourly_rate?: never
          id?: string | null
          is_active?: boolean | null
          is_internal_staff?: boolean | null
          mobile?: string | null
          primary_role?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_profiles_v2_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_profiles_v2_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      damage_findings_v: {
        Row: {
          approval_state:
            | Database["public"]["Enums"]["damage_approval_state"]
            | null
          approved_at: string | null
          approved_by: string | null
          case_id: string | null
          charge_id: string | null
          cleaning_queue_entry_id: string | null
          client_uuid: string | null
          created_at: string | null
          created_by: string | null
          damage_type: string | null
          description: string | null
          disposition: Database["public"]["Enums"]["damage_disposition"] | null
          estimated_cost: number | null
          id: string | null
          return_line_id: string | null
          severity: string | null
          source: Database["public"]["Enums"]["damage_source"] | null
          unit_id: string | null
          updated_at: string | null
          voided_at: string | null
        }
        Insert: {
          approval_state?:
            | Database["public"]["Enums"]["damage_approval_state"]
            | null
          approved_at?: string | null
          approved_by?: string | null
          case_id?: string | null
          charge_id?: string | null
          cleaning_queue_entry_id?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          damage_type?: string | null
          description?: string | null
          disposition?: Database["public"]["Enums"]["damage_disposition"] | null
          estimated_cost?: never
          id?: string | null
          return_line_id?: string | null
          severity?: string | null
          source?: Database["public"]["Enums"]["damage_source"] | null
          unit_id?: string | null
          updated_at?: string | null
          voided_at?: string | null
        }
        Update: {
          approval_state?:
            | Database["public"]["Enums"]["damage_approval_state"]
            | null
          approved_at?: string | null
          approved_by?: string | null
          case_id?: string | null
          charge_id?: string | null
          cleaning_queue_entry_id?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          damage_type?: string | null
          description?: string | null
          disposition?: Database["public"]["Enums"]["damage_disposition"] | null
          estimated_cost?: never
          id?: string | null
          return_line_id?: string | null
          severity?: string | null
          source?: Database["public"]["Enums"]["damage_source"] | null
          unit_id?: string | null
          updated_at?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "damage_findings_approved_by_fk"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_findings_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_findings_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_findings_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_findings_cleaning_queue_entry_fk"
            columns: ["cleaning_queue_entry_id"]
            isOneToOne: false
            referencedRelation: "cleaning_queue_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_findings_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_findings_return_line_id_fkey"
            columns: ["return_line_id"]
            isOneToOne: false
            referencedRelation: "return_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_findings_unit_id_fk"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "product_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_findings_unit_id_fk"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "product_units_v"
            referencedColumns: ["id"]
          },
        ]
      }
      late_fee_findings_v: {
        Row: {
          actual_return_at: string | null
          approval_state:
            | Database["public"]["Enums"]["damage_approval_state"]
            | null
          approved_at: string | null
          approved_by: string | null
          band: Database["public"]["Enums"]["late_fee_band"] | null
          booking_id: string | null
          client_uuid: string | null
          created_at: string | null
          created_by: string | null
          day_rate_amount: number | null
          fee_amount: number | null
          full_days_charged: number | null
          id: string | null
          overage_minutes: number | null
          return_session_id: string | null
          scheduled_return_at: string | null
          voided_at: string | null
          voided_reason: string | null
        }
        Insert: {
          actual_return_at?: string | null
          approval_state?:
            | Database["public"]["Enums"]["damage_approval_state"]
            | null
          approved_at?: string | null
          approved_by?: string | null
          band?: Database["public"]["Enums"]["late_fee_band"] | null
          booking_id?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          day_rate_amount?: never
          fee_amount?: never
          full_days_charged?: number | null
          id?: string | null
          overage_minutes?: number | null
          return_session_id?: string | null
          scheduled_return_at?: string | null
          voided_at?: string | null
          voided_reason?: string | null
        }
        Update: {
          actual_return_at?: string | null
          approval_state?:
            | Database["public"]["Enums"]["damage_approval_state"]
            | null
          approved_at?: string | null
          approved_by?: string | null
          band?: Database["public"]["Enums"]["late_fee_band"] | null
          booking_id?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          day_rate_amount?: never
          fee_amount?: never
          full_days_charged?: number | null
          id?: string | null
          overage_minutes?: number | null
          return_session_id?: string | null
          scheduled_return_at?: string | null
          voided_at?: string | null
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "late_fee_findings_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_fee_findings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_fee_findings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "late_fee_findings_return_session_id_fkey"
            columns: ["return_session_id"]
            isOneToOne: false
            referencedRelation: "operation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_plans_v: {
        Row: {
          annual_fee: number | null
          authorized_users: number | null
          bundle_discount_pct: number | null
          client_uuid: string | null
          created_at: string | null
          created_by: string | null
          default_credit_limit: number | null
          display_order: number | null
          id: string | null
          individual_discount_pct: number | null
          label: Database["public"]["Enums"]["membership_label"] | null
          level: Database["public"]["Enums"]["membership_level"] | null
          monthly_booking_limit: number | null
          perks: Database["public"]["Enums"]["membership_perk"][] | null
          retired_at: string | null
          simultaneous_rental_limit: number | null
          status: Database["public"]["Enums"]["membership_plan_status"] | null
          term_months: number | null
          updated_at: string | null
        }
        Insert: {
          annual_fee?: never
          authorized_users?: number | null
          bundle_discount_pct?: never
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          default_credit_limit?: never
          display_order?: number | null
          id?: string | null
          individual_discount_pct?: never
          label?: Database["public"]["Enums"]["membership_label"] | null
          level?: Database["public"]["Enums"]["membership_level"] | null
          monthly_booking_limit?: number | null
          perks?: Database["public"]["Enums"]["membership_perk"][] | null
          retired_at?: string | null
          simultaneous_rental_limit?: number | null
          status?: Database["public"]["Enums"]["membership_plan_status"] | null
          term_months?: number | null
          updated_at?: string | null
        }
        Update: {
          annual_fee?: never
          authorized_users?: number | null
          bundle_discount_pct?: never
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          default_credit_limit?: never
          display_order?: number | null
          id?: string | null
          individual_discount_pct?: never
          label?: Database["public"]["Enums"]["membership_label"] | null
          level?: Database["public"]["Enums"]["membership_level"] | null
          monthly_booking_limit?: number | null
          perks?: Database["public"]["Enums"]["membership_perk"][] | null
          retired_at?: string | null
          simultaneous_rental_limit?: number | null
          status?: Database["public"]["Enums"]["membership_plan_status"] | null
          term_months?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membership_plans_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      product_units_v: {
        Row: {
          asset_tag: string | null
          barcode: string | null
          bin: string | null
          branch_id: string | null
          client_uuid: string | null
          condition: Database["public"]["Enums"]["unit_condition"] | null
          container_id: string | null
          created_at: string | null
          created_by: string | null
          id: string | null
          insurance_expires_at: string | null
          last_maintenance_at: string | null
          next_maintenance_at: string | null
          product_id: string | null
          purchase_date: string | null
          purchase_price: number | null
          qr_code: string | null
          rack: string | null
          replacement_value: number | null
          retired_at: string | null
          retired_by: string | null
          retirement_reason: string | null
          running_hours: number | null
          serial_no: string | null
          shelf: string | null
          status: Database["public"]["Enums"]["inventory_state"] | null
          storage_zone_id: string | null
          updated_at: string | null
          updated_by: string | null
          warehouse_id: string | null
          warranty_expires_at: string | null
        }
        Insert: {
          asset_tag?: string | null
          barcode?: string | null
          bin?: string | null
          branch_id?: string | null
          client_uuid?: string | null
          condition?: Database["public"]["Enums"]["unit_condition"] | null
          container_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          insurance_expires_at?: string | null
          last_maintenance_at?: string | null
          next_maintenance_at?: string | null
          product_id?: string | null
          purchase_date?: string | null
          purchase_price?: never
          qr_code?: string | null
          rack?: string | null
          replacement_value?: never
          retired_at?: string | null
          retired_by?: string | null
          retirement_reason?: string | null
          running_hours?: number | null
          serial_no?: string | null
          shelf?: string | null
          status?: Database["public"]["Enums"]["inventory_state"] | null
          storage_zone_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          warehouse_id?: string | null
          warranty_expires_at?: string | null
        }
        Update: {
          asset_tag?: string | null
          barcode?: string | null
          bin?: string | null
          branch_id?: string | null
          client_uuid?: string | null
          condition?: Database["public"]["Enums"]["unit_condition"] | null
          container_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          insurance_expires_at?: string | null
          last_maintenance_at?: string | null
          next_maintenance_at?: string | null
          product_id?: string | null
          purchase_date?: string | null
          purchase_price?: never
          qr_code?: string | null
          rack?: string | null
          replacement_value?: never
          retired_at?: string | null
          retired_by?: string | null
          retirement_reason?: string | null
          running_hours?: number | null
          serial_no?: string | null
          shelf?: string | null
          status?: Database["public"]["Enums"]["inventory_state"] | null
          storage_zone_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
          warehouse_id?: string | null
          warranty_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_units_branch_id_fk"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "containers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_retired_by_fk"
            columns: ["retired_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_storage_zone_id_fk"
            columns: ["storage_zone_id"]
            isOneToOne: false
            referencedRelation: "storage_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_units_warehouse_id_fk"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      products_v: {
        Row: {
          asset_code: string | null
          brand: string | null
          case_capacity: number | null
          category_id: string | null
          cleaning_time_minutes: number | null
          client_uuid: string | null
          created_at: string | null
          created_by: string | null
          daily_rate: number | null
          deposit_fixed: number | null
          deposit_percent: number | null
          description: string | null
          hourly_rate: number | null
          id: string | null
          inspection_required: boolean | null
          is_active: boolean | null
          is_subrental_only: boolean | null
          manufacturer: string | null
          min_rental_days: number | null
          model: string | null
          monthly_rate: number | null
          name: string | null
          notes_internal: string | null
          notes_rental: string | null
          notes_warehouse: string | null
          packing_required: boolean | null
          prep_time_minutes: number | null
          purchase_date: string | null
          purchase_price: number | null
          quantity_unit:
            | Database["public"]["Enums"]["product_unit_of_measure"]
            | null
          rental_enabled: boolean | null
          reorder_level: number | null
          replacement_value: number | null
          short_name: string | null
          status: Database["public"]["Enums"]["product_record_state"] | null
          supplier_id: string | null
          thumbnail_url: string | null
          total_quantity: number | null
          tracking_mode:
            | Database["public"]["Enums"]["product_tracking_mode"]
            | null
          updated_at: string | null
          updated_by: string | null
          weekend_rate: number | null
          weekly_rate: number | null
          weight_kg: number | null
        }
        Insert: {
          asset_code?: string | null
          brand?: string | null
          case_capacity?: number | null
          category_id?: string | null
          cleaning_time_minutes?: number | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          daily_rate?: never
          deposit_fixed?: never
          deposit_percent?: never
          description?: string | null
          hourly_rate?: never
          id?: string | null
          inspection_required?: boolean | null
          is_active?: boolean | null
          is_subrental_only?: boolean | null
          manufacturer?: string | null
          min_rental_days?: number | null
          model?: string | null
          monthly_rate?: never
          name?: string | null
          notes_internal?: string | null
          notes_rental?: string | null
          notes_warehouse?: string | null
          packing_required?: boolean | null
          prep_time_minutes?: number | null
          purchase_date?: string | null
          purchase_price?: never
          quantity_unit?:
            | Database["public"]["Enums"]["product_unit_of_measure"]
            | null
          rental_enabled?: boolean | null
          reorder_level?: number | null
          replacement_value?: never
          short_name?: string | null
          status?: Database["public"]["Enums"]["product_record_state"] | null
          supplier_id?: string | null
          thumbnail_url?: string | null
          total_quantity?: number | null
          tracking_mode?:
            | Database["public"]["Enums"]["product_tracking_mode"]
            | null
          updated_at?: string | null
          updated_by?: string | null
          weekend_rate?: never
          weekly_rate?: never
          weight_kg?: number | null
        }
        Update: {
          asset_code?: string | null
          brand?: string | null
          case_capacity?: number | null
          category_id?: string | null
          cleaning_time_minutes?: number | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          daily_rate?: never
          deposit_fixed?: never
          deposit_percent?: never
          description?: string | null
          hourly_rate?: never
          id?: string | null
          inspection_required?: boolean | null
          is_active?: boolean | null
          is_subrental_only?: boolean | null
          manufacturer?: string | null
          min_rental_days?: number | null
          model?: string | null
          monthly_rate?: never
          name?: string | null
          notes_internal?: string | null
          notes_rental?: string | null
          notes_warehouse?: string | null
          packing_required?: boolean | null
          prep_time_minutes?: number | null
          purchase_date?: string | null
          purchase_price?: never
          quantity_unit?:
            | Database["public"]["Enums"]["product_unit_of_measure"]
            | null
          rental_enabled?: boolean | null
          reorder_level?: number | null
          replacement_value?: never
          short_name?: string | null
          status?: Database["public"]["Enums"]["product_record_state"] | null
          supplier_id?: string | null
          thumbnail_url?: string | null
          total_quantity?: number | null
          tracking_mode?:
            | Database["public"]["Enums"]["product_tracking_mode"]
            | null
          updated_at?: string | null
          updated_by?: string | null
          weekend_rate?: never
          weekly_rate?: never
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requests_v: {
        Row: {
          approved_by: string | null
          client_uuid: string | null
          created_at: string | null
          created_by: string | null
          estimated_unit_cost: number | null
          id: string | null
          pr_no: string | null
          product_id: string | null
          quantity: number | null
          reason_type:
            | Database["public"]["Enums"]["purchase_request_reason"]
            | null
          rejection_reason: string | null
          requested_by: string | null
          status: Database["public"]["Enums"]["purchase_request_status"] | null
          supplier_id: string | null
          total_estimated_cost: number | null
          updated_at: string | null
          updated_by: string | null
          urgency: string | null
        }
        Insert: {
          approved_by?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          estimated_unit_cost?: never
          id?: string | null
          pr_no?: string | null
          product_id?: string | null
          quantity?: number | null
          reason_type?:
            | Database["public"]["Enums"]["purchase_request_reason"]
            | null
          rejection_reason?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["purchase_request_status"] | null
          supplier_id?: string | null
          total_estimated_cost?: never
          updated_at?: string | null
          updated_by?: string | null
          urgency?: string | null
        }
        Update: {
          approved_by?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          estimated_unit_cost?: never
          id?: string | null
          pr_no?: string | null
          product_id?: string | null
          quantity?: number | null
          reason_type?:
            | Database["public"]["Enums"]["purchase_request_reason"]
            | null
          rejection_reason?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["purchase_request_status"] | null
          supplier_id?: string | null
          total_estimated_cost?: never
          updated_at?: string | null
          updated_by?: string | null
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requests_approved_by_fk"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_requested_by_fk"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_updated_by_fk"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      return_accessory_checks_v: {
        Row: {
          accessory_id: string | null
          accessory_name: string | null
          client_uuid: string | null
          created_at: string | null
          created_by: string | null
          id: string | null
          present: boolean | null
          replacement_cost: number | null
          return_line_id: string | null
        }
        Insert: {
          accessory_id?: string | null
          accessory_name?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          present?: boolean | null
          replacement_cost?: never
          return_line_id?: string | null
        }
        Update: {
          accessory_id?: string | null
          accessory_name?: string | null
          client_uuid?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          present?: boolean | null
          replacement_cost?: never
          return_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_accessory_checks_accessory_id_fk"
            columns: ["accessory_id"]
            isOneToOne: false
            referencedRelation: "accessories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_accessory_checks_accessory_id_fk"
            columns: ["accessory_id"]
            isOneToOne: false
            referencedRelation: "accessories_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_accessory_checks_created_by_fk"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_accessory_checks_return_line_id_fkey"
            columns: ["return_line_id"]
            isOneToOne: false
            referencedRelation: "return_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_fuel_logs_v: {
        Row: {
          branch_id: string | null
          client_uuid: string | null
          cost_amount: number | null
          created_at: string | null
          fuel_date: string | null
          fuel_liters: number | null
          id: string | null
          odometer: number | null
          receipt_url: string | null
          recorded_by: string | null
          vehicle_id: string | null
        }
        Insert: {
          branch_id?: string | null
          client_uuid?: string | null
          cost_amount?: never
          created_at?: string | null
          fuel_date?: string | null
          fuel_liters?: number | null
          id?: string | null
          odometer?: number | null
          receipt_url?: string | null
          recorded_by?: string | null
          vehicle_id?: string | null
        }
        Update: {
          branch_id?: string | null
          client_uuid?: string | null
          cost_amount?: never
          created_at?: string | null
          fuel_date?: string | null
          fuel_liters?: number | null
          id?: string | null
          odometer?: number | null
          receipt_url?: string | null
          recorded_by?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_fuel_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_fuel_logs_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_fuel_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auth_can_view_money: { Args: never; Returns: boolean }
      auth_is_finance_or_admin: { Args: never; Returns: boolean }
      auth_is_staff: { Args: never; Returns: boolean }
      auth_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["system_role"]
      }
      next_booking_stage: {
        Args: { s: Database["public"]["Enums"]["booking_stage"] }
        Returns: Database["public"]["Enums"]["booking_stage"]
      }
      next_document_number: {
        Args: { p_sequence_key: string }
        Returns: string
      }
      retired_stage_to_canonical: {
        Args: { old_stage: string }
        Returns: Database["public"]["Enums"]["booking_stage"]
      }
      set_request_context: { Args: never; Returns: undefined }
    }
    Enums: {
      accounting_period_status: "Open" | "Closing" | "Closed" | "Locked"
      activity_action:
        | "Login"
        | "Logout"
        | "Create"
        | "Update"
        | "Void"
        | "Reverse"
        | "Retire"
        | "Archive"
        | "Cancel"
        | "Restore"
        | "Approve"
        | "Reject"
        | "Export"
        | "Import"
        | "Print"
        | "Download"
        | "Upload"
        | "Payment"
        | "Refund"
        | "Booking Created"
        | "Booking Cancelled"
        | "Maintenance Created"
        | "Case Created"
        | "Permission Changed"
        | "Password Changed"
      activity_browser: "Chrome" | "Safari" | "Edge" | "Firefox" | "Other"
      activity_device: "Desktop" | "Mobile" | "Tablet"
      activity_module:
        | "Today Operations"
        | "Rentals"
        | "Operations"
        | "Inventory"
        | "Clients"
        | "Calendar"
        | "Finance"
        | "Settings"
        | "Authentication"
        | "API"
        | "Background Jobs"
      activity_os: "Windows" | "macOS" | "Linux" | "Android" | "iOS"
      activity_severity:
        | "Critical"
        | "High"
        | "Medium"
        | "Low"
        | "Informational"
      activity_status: "Success" | "Warning" | "Failed" | "Blocked" | "Pending"
      alert_severity: "Information" | "Info" | "Warning" | "Critical"
      allocation_bucket:
        | "Charged to Client"
        | "Deposit Applied"
        | "Insurance Claimed"
        | "Warranty Covered"
        | "Recovered from Partner"
        | "Absorbed"
      api_permission:
        | "Read"
        | "Write"
        | "Webhooks"
        | "AI Access"
        | "Integration Management"
      approval_action:
        | "Approve"
        | "Reject"
        | "Return for Revision"
        | "Cancel"
        | "Auto Approve"
        | "Auto Reject"
        | "Escalate"
      approval_category:
        | "Rental"
        | "Finance"
        | "Inventory"
        | "Operations"
        | "Administration"
      approval_level_mode:
        | "Parallel Approval"
        | "Sequential Approval"
        | "Conditional Approval"
      approval_limit_band:
        | "Up to Rs 5,000"
        | "Up to Rs 25,000"
        | "Up to Rs 100,000"
        | "Unlimited"
      approval_permission:
        | "Booking Approval"
        | "Discount Approval"
        | "Expense Approval"
        | "Purchase Approval"
        | "Refund Approval"
        | "Maintenance Approval"
        | "Case Resolution"
        | "Inventory Write-off"
        | "Price Change"
        | "User Creation"
      approval_status:
        | "Pending"
        | "Approved"
        | "Rejected"
        | "Cancelled"
        | "Expired"
        | "Escalated"
      approval_trigger:
        | "Booking Created"
        | "Discount Requested"
        | "Expense Submitted"
        | "Case Created"
        | "Maintenance Requested"
        | "Asset Transfer"
        | "Purchase Request"
        | "Refund Request"
        | "Custom Event"
      approval_workflow_status: "Draft" | "Active" | "Paused" | "Archived"
      artefact_type:
        | "Workflow"
        | "Business Rule"
        | "Template"
        | "API Integration"
        | "Scheduled Job"
        | "Event Trigger"
        | "AI Configuration"
      attempt_status:
        | "Created"
        | "Queued"
        | "Sent"
        | "Delivered"
        | "Read"
        | "Clicked"
        | "Failed"
        | "Expired"
      audit_action:
        | "Login"
        | "Logout"
        | "Create"
        | "Update"
        | "Delete"
        | "Restore"
        | "Archive"
        | "Approve"
        | "Reject"
        | "Export"
        | "Import"
        | "Print"
        | "Download"
        | "Upload"
        | "Payment"
        | "Refund"
        | "Booking Created"
        | "Booking Cancelled"
        | "Maintenance Created"
        | "Case Created"
        | "Permission Changed"
        | "Password Changed"
      audit_category:
        | "Authentication"
        | "Users"
        | "Rentals"
        | "Inventory"
        | "Finance"
        | "Administration"
        | "Uncategorised"
      audit_event_class:
        | "status change"
        | "money movement"
        | "discount"
        | "override"
        | "session"
        | "cancellation"
      audit_granularity: "Minimal" | "Standard" | "Detailed" | "Forensic"
      audit_module:
        | "Today Operations"
        | "Rentals"
        | "Operations"
        | "Inventory"
        | "Clients"
        | "Calendar"
        | "Finance"
        | "Settings"
        | "Authentication"
        | "API"
        | "Background Jobs"
      audit_severity: "Critical" | "High" | "Medium" | "Low" | "Informational"
      audit_status: "Success" | "Warning" | "Failed" | "Blocked" | "Pending"
      authentication_method:
        | "Email Login"
        | "Username Login"
        | "Google Login"
        | "Microsoft Login"
        | "Apple Login"
        | "LDAP"
        | "Active Directory"
      automation_error_class:
        | "validation"
        | "API"
        | "timeout"
        | "permission"
        | "network"
        | "AI"
        | "data"
        | "internal"
      automation_template_category:
        | "Rentals"
        | "Inventory"
        | "Finance"
        | "Clients"
        | "Maintenance"
        | "Reports"
        | "Communication"
        | "Staff"
        | "Administration"
        | "Integrations"
        | "Custom"
      automation_tier: "Tier 1" | "Tier 2" | "Tier 3"
      backup_destination_provider:
        | "Local Storage"
        | "NAS"
        | "External Drive"
        | "AWS S3"
        | "Google Drive"
        | "Dropbox"
        | "OneDrive"
        | "Backblaze B2"
        | "Wasabi"
        | "FTP"
        | "SFTP"
      backup_frequency:
        | "Hourly"
        | "Every 6 Hours"
        | "Daily"
        | "Weekly"
        | "Monthly"
        | "Manual"
        | "Before Update"
        | "Before Migration"
        | "Before Major Import"
      backup_schedule_status: "Enabled" | "Disabled" | "Paused"
      backup_status:
        | "Running"
        | "Completed"
        | "Failed"
        | "Cancelled"
        | "Verifying"
        | "Restored"
      backup_type:
        | "Full Backup"
        | "Incremental Backup"
        | "Differential Backup"
        | "Database Backup"
        | "Documents Backup"
        | "Images"
        | "Videos"
        | "Configuration Backup"
        | "Audit Log Backup"
        | "AI Configuration Backup"
      booking_document_type:
        | "Quote"
        | "Rental Agreement"
        | "Packing List"
        | "Delivery Note"
        | "Invoice"
        | "Receipt"
        | "Inspection Report"
        | "Damage Report"
        | "Client Documents"
        | "Insurance"
      booking_flag:
        | "Partial Pickup"
        | "Partial Return"
        | "Returned Early"
        | "Late Return"
        | "Missing"
        | "Damaged"
        | "Deposit Pending"
        | "Payment Due"
        | "Overdue"
        | "VIP"
        | "Blocked"
        | "Upgrade Candidate"
      booking_line_type:
        | "Equipment"
        | "Bundle"
        | "Accessory"
        | "Service"
        | "Sub-rental"
        | "Manual item"
      booking_stage:
        | "Quote"
        | "Booked"
        | "Packed"
        | "On Rent"
        | "Returned"
        | "Closed"
      branch_scope: "All Branches" | "Assigned Branch" | "Selected Branches"
      branch_status: "Active" | "Inactive" | "Under Setup" | "Archived"
      bundle_discount_kind: "percentage" | "fixed"
      bundle_line_kind: "Equipment" | "Crew" | "Vehicle" | "Box"
      bundle_state:
        | "On Rent"
        | "Reserved"
        | "On Maintenance"
        | "Partially Available"
        | "Available"
      calendar_exception_type:
        | "Public Holiday"
        | "Festival"
        | "Maintenance Shutdown"
        | "Special Operating Day"
      campaign_pause_reason:
        | "bounce rate above threshold"
        | "WhatsApp quality drop"
        | "opt-out rate above threshold"
        | "provider errors above threshold"
      campaign_schedule_kind: "Immediate" | "scheduled" | "recurring"
      campaign_status:
        | "Draft"
        | "Awaiting approval"
        | "Scheduled"
        | "Sending"
        | "Paused"
        | "Completed"
        | "Cancelled"
      case_counterparty_kind: "Client" | "Partner" | "Vendor"
      case_disposition:
        | "Repair — send to Maintenance"
        | "Charge Client"
        | "Warranty Claim"
        | "Insurance Claim"
        | "Write Off"
        | "Found"
        | "Client Returned"
        | "Replace Item"
        | "Charge Upheld"
        | "Partially Waived"
        | "Fully Waived"
        | "Escalated"
        | "Recover from Partner"
        | "Absorb"
        | "Escalate"
      case_flag:
        | "Under Investigation"
        | "Legal"
        | "Police Report"
        | "Insurance Notified"
      case_priority: "Critical" | "High" | "Medium" | "Low"
      case_status:
        | "Open"
        | "Under Review"
        | "Awaiting Decision"
        | "In Progress"
        | "Resolved"
        | "Closed"
        | "Cancelled"
      case_type: "Damage" | "Missing" | "Theft" | "Dispute" | "Vendor"
      change_request_status: "Edit requested" | "Accepted" | "Rejected" | "Void"
      channel_code: "WhatsApp" | "Email" | "SMS" | "In-App"
      channel_direction: "two-way" | "send-mostly"
      channel_status: "Connected" | "Disconnected" | "Testing" | "Error"
      charge_source_type: "Damage" | "Late Fee"
      cleaning_mode: "Clean" | "Reset"
      cleaning_problem_state:
        | "No Problems"
        | "Missing Item"
        | "Needs Repair"
        | "Damaged"
      cleaning_queue_state: "Waiting" | "Cleaning" | "QC" | "Ready"
      client_document_kind:
        | "Student ID"
        | "College letter"
        | "PAN / VAT"
        | "Citizenship"
        | "Rental Agreement"
      client_document_status: "Pending" | "Verified"
      client_flag_type: "VIP" | "Blocked" | "Upgrade Candidate"
      client_organisation_subtype:
        | "Production House"
        | "Rental House"
        | "College / Institution"
        | "Corporate / Agency"
        | "Government / NGO"
        | "Broadcaster"
        | "Other"
      client_profession:
        | "Cinematographer"
        | "Director"
        | "Assistant Camera"
        | "Gaffer"
        | "Editor"
        | "Photographer"
        | "Producer"
        | "Sound"
        | "Other"
      client_segment:
        | "Wedding / Event"
        | "Corporate"
        | "Documentary"
        | "Music Video"
        | "Commercial"
        | "Feature"
        | "YouTube / Creator"
        | "Education"
        | "Other"
      client_status: "Active" | "Deactivated"
      client_timeline_step:
        | "Quote"
        | "Confirmed"
        | "Ready"
        | "With you"
        | "Returned"
        | "Completed"
      client_type_parent: "Organisation" | "Individual"
      client_visible_state:
        | "Quote Ready"
        | "Confirmed"
        | "Being Prepared"
        | "With You"
        | "Return Due"
        | "Returned"
        | "Completed"
        | "Cancelled"
      commercial_override_kind: "Credit Limit" | "Payment Terms"
      commercial_override_status: "Pending" | "Approved" | "Rejected" | "Void"
      comparison_basis:
        | "previous period"
        | "same period last year"
        | "previous fiscal year"
        | "custom range"
        | "entity versus entity"
      compatibility_kind: "Compatible with" | "Requires"
      conversation_state: "Open" | "Snoozed" | "Closed" | "Archived" | "Spam"
      counterparty_type:
        | "Client"
        | "Rental Partner"
        | "Vendor"
        | "Insurance"
        | "Internal"
      credit_debit_note_type: "Credit Note" | "Debit Note"
      crew_booking_state:
        | "Draft"
        | "Tentative"
        | "Confirmed"
        | "Completed"
        | "Cancelled"
      crew_document_type:
        | "Contract"
        | "NDA"
        | "Citizenship / Passport"
        | "Driving License"
        | "Certifications"
        | "Insurance"
        | "Medical Certificate"
      crew_engagement_type: "freelance" | "internal staff"
      crew_pan_status: "registered" | "not registered"
      crew_payout_state: "Not due" | "Due" | "Paid"
      crew_person_state: "Available" | "Booked" | "On Leave" | "Off Duty"
      crew_role:
        | "Rental Coordinator"
        | "Warehouse Staff"
        | "Driver"
        | "Camera Assistant"
        | "Delivery Staff"
        | "Director"
        | "DoP"
        | "Focus Puller"
        | "Gaffer"
        | "Grip"
        | "Drone Pilot"
        | "Sound Recordist"
      currency_code: "NPR" | "USD" | "EUR" | "INR"
      customer_tax_profile:
        | "VAT Registered"
        | "Non-VAT Customer"
        | "Tax Exempt"
        | "Government Organization"
        | "NGO"
        | "Corporate"
      damage_approval_state: "Pending Approval" | "Approved"
      damage_disposition: "Charge Client" | "Absorb" | "Defer to Insurance"
      damage_source: "Return inspection" | "Cleaning"
      data_scope:
        | "Own Records"
        | "Department Records"
        | "Branch Records"
        | "Warehouse Records"
        | "All Records"
      default_system_sequence_prefix:
        | "BK"
        | "EQ"
        | "CL"
        | "MT"
        | "CASE"
        | "INV"
        | "PAY"
        | "EXP"
        | "DOC"
        | "BND"
        | "MEM"
        | "PUR"
        | "TRF"
        | "SR"
        | "COUP"
        | "DISC"
        | "AUD"
        | "LOG"
      delivery_error_class:
        | "invalid recipient"
        | "outside session window"
        | "template not approved"
        | "suppressed"
        | "rate limited"
        | "quality throttled"
        | "gateway error"
        | "timeout"
        | "insufficient balance"
      delivery_method:
        | "Customer Pickup"
        | "Babin Delivery"
        | "Courier"
        | "Third Party"
      delivery_type:
        | "Customer Pickup"
        | "Babin Delivery"
        | "Courier"
        | "Third Party"
      dependency_mode: "parent" | "child" | "sequential" | "parallel"
      deployment_result: "Succeeded" | "Failed" | "Rolled back"
      deposit_charge_type: "Damage" | "Missing" | "Late"
      deposit_movement_type: "Received" | "Released" | "Applied"
      deposit_state: "Required" | "Received" | "Pending"
      device_restriction:
        | "Desktop Only"
        | "Mobile Only"
        | "Tablet Only"
        | "Approved Devices Only"
      device_trust_status: "trusted" | "untrusted" | "blocked"
      device_type: "Desktop" | "Mobile" | "Tablet"
      discount_source:
        | "Manual"
        | "Membership"
        | "Coupon"
        | "Women-DoP 5%"
        | "Student"
        | "College"
        | "Named-client rates"
      document_delivery_event: "Sent" | "Viewed" | "Downloaded"
      document_expiry_type:
        | "Quotation"
        | "Client ID / passport"
        | "Company registration"
        | "Insurance policy"
        | "Equipment warranty"
        | "Tax exemption certificate"
        | "Contract"
      document_lifecycle_status:
        | "Draft"
        | "Pending Approval"
        | "Pending Signature"
        | "Signed"
        | "Issued"
        | "Void"
        | "Expired"
      document_origin: "Generated" | "Uploaded"
      document_type:
        | "Quotation"
        | "Rental Agreement"
        | "Packing List"
        | "Delivery Note"
        | "Return Report"
        | "Inspection Report"
        | "Damage Report"
        | "Tax Invoice"
        | "Receipt"
        | "Credit Note"
        | "Debit Note"
        | "Job Card"
        | "Service Report"
        | "Incident Report"
        | "Insurance Claim"
        | "Call Sheet"
      environment: "Sandbox" | "Live"
      equipment_health_band: "Excellent" | "Good" | "Fair" | "Poor" | "Replace"
      evidence_category:
        | "Packing"
        | "Pickup / Delivery"
        | "Return"
        | "Inspection"
        | "Damage"
        | "Cleaning"
        | "Maintenance"
        | "Warehouse"
        | "Client Documents"
        | "Marketing"
        | "Others"
      evidence_match_source:
        | "QR code"
        | "barcode"
        | "serial OCR"
        | "AI recognition"
        | "manual assignment"
      evidence_match_state: "Matched" | "Need Review" | "Unmatched"
      evidence_media_type: "Image" | "Video" | "Document"
      evidence_operation_stage:
        | "Packing"
        | "Pickup"
        | "Delivery"
        | "Return"
        | "Inspection"
        | "Reset"
        | "Cleaning"
        | "Maintenance"
        | "Damage"
        | "Inventory"
        | "Warehouse"
        | "Client documents"
      evidence_processing_step:
        | "Upload"
        | "Processing"
        | "Review & Match"
        | "Synced"
      exchange_rate_mode: "Manual" | "Automatic"
      exchange_rate_source:
        | "Nepal Rastra Bank (NRB)"
        | "Manual Entry"
        | "Custom API"
      execution_status:
        | "Running"
        | "Succeeded"
        | "Failed"
        | "Cancelled"
        | "Timed out"
      execution_trigger_kind: "event" | "schedule" | "manual" | "API" | "retry"
      expense_recurrence:
        | "Daily"
        | "Weekly"
        | "Monthly"
        | "Quarterly"
        | "Yearly"
      expense_status:
        | "Draft"
        | "Pending Approval"
        | "Approved"
        | "Paid"
        | "Rejected"
        | "Cancelled"
      export_format: "PDF" | "Excel" | "CSV" | "JSON" | "Print"
      festival:
        | "Dashain"
        | "Tihar"
        | "Holi"
        | "Teej"
        | "Chhath"
        | "Maha Shivaratri"
        | "Janai Purnima"
        | "Losar"
        | "Maghe Sankranti"
        | "Eid"
        | "Christmas"
      financial_permission:
        | "Purchase Cost"
        | "Selling Price"
        | "Rental Cost"
        | "Profit"
        | "Gross Margin"
        | "ROI"
        | "Depreciation"
        | "Salary"
        | "Vendor Cost"
        | "Tax Details"
      fiscal_calendar_basis: "Nepali Fiscal Year" | "Gregorian Fiscal Year"
      flag_source: "Manual" | "System"
      flag_type:
        | "Quantity"
        | "Timing"
        | "Item"
        | "Money"
        | "Client"
        | "Business"
      forecast_method:
        | "moving average"
        | "linear regression"
        | "seasonal decomposition"
      fulfillment_status:
        | "Fulfilled"
        | "Partial"
        | "Unfulfilled"
        | "Waiting"
        | "Overbooked"
      fx_pricing_rule:
        | "Lock exchange rate at quotation"
        | "Lock exchange rate at invoice"
        | "Live exchange rate option"
      gateway_role: "primary" | "failover"
      government_id_kind: "Citizenship" | "Passport"
      handover_line_state: "Remaining" | "Picked Up" | "Missing"
      health_band: "Excellent" | "Good" | "Fair" | "Poor" | "Replace"
      health_status: "pass" | "fail" | "Not checked"
      holiday_behaviour: "skip" | "run"
      hours_scope:
        | "Company Default Hours"
        | "Branch Hours"
        | "Warehouse Hours"
        | "Pickup Counter"
        | "Return Counter"
        | "Office Hours"
        | "Emergency Support Hours"
      http_method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
      inspection_state: "Pending" | "Inspected"
      install_conflict_resolution: "Replace" | "Install alongside" | "Cancel"
      integration_category:
        | "Communication"
        | "Payments"
        | "Accounting"
        | "Storage"
        | "Calendar"
        | "AI"
        | "Documents"
        | "Custom"
      integration_health: "Healthy" | "Warning" | "Error" | "Disabled"
      internal_note_type: "Internal note" | "Call log"
      inventory_state:
        | "In Stock"
        | "Reserved"
        | "Packed"
        | "On Rent"
        | "Returning"
        | "Inspection"
        | "Cleaning"
        | "Maintenance"
        | "Missing"
        | "Retired"
      invoice_status:
        | "Draft"
        | "Sent"
        | "Partially Paid"
        | "Paid"
        | "Overdue"
        | "Void"
      ip_restriction: "Office Network" | "VPN" | "Anywhere" | "Custom IP Range"
      item_condition: "Excellent" | "Good" | "Fair" | "Damaged" | "Lost"
      item_quantity_state:
        | "Ready"
        | "Picked Up"
        | "Returned"
        | "Missing"
        | "Damaged"
      late_fee_band: "None" | "Half Day" | "Full Day"
      line_kind:
        | "Equipment Rental"
        | "Sub-Rental"
        | "Services"
        | "Crew Charges"
        | "Transport"
        | "Late Fee"
      location_kind:
        | "Warehouse"
        | "Case"
        | "Drawer"
        | "Workshop"
        | "With Client"
        | "In Transit"
        | "Sub-Rental Supplier"
      maintenance_flag:
        | "Overdue"
        | "Warranty"
        | "Blocked Booking"
        | "Awaiting Approval"
      maintenance_priority: "Low" | "Medium" | "High" | "Critical"
      maintenance_shutdown_subtype:
        | "Planned Shutdown"
        | "Warehouse Closure"
        | "Inventory Audit Days"
        | "Deep Cleaning Days"
      maintenance_source: "Manual" | "Preventive cycle"
      maintenance_status:
        | "Scheduled"
        | "In Progress"
        | "Waiting Parts"
        | "At Vendor"
        | "Completed"
        | "Cancelled"
      maintenance_type:
        | "Repair"
        | "Inspection"
        | "Calibration"
        | "Firmware Update"
        | "Sensor Cleaning"
        | "Internal Cleaning"
        | "Fungus Removal"
        | "Preventive Service"
      marketing_consent_state:
        | "Not asked"
        | "Opted in"
        | "Opted out"
        | "Opt-In"
        | "Opt-Out"
        | "Do Not Disturb"
      membership_label: "Access Member" | "Partner" | "Elite Member"
      membership_level:
        | "Academy"
        | "Creator"
        | "Cinematographer"
        | "Production Alliance"
        | "Elite"
      membership_limit_kind:
        | "Monthly booking limit"
        | "Simultaneous rental limit"
      membership_perk:
        | "Priority Booking"
        | "Dedicated Manager"
        | "Company Billing"
        | "Credit Terms"
        | "VIP Support"
        | "Custom Solutions"
      membership_plan_status: "Active" | "Retired"
      membership_status: "Active" | "Grace" | "Lapsed"
      message_class:
        | "Transactional"
        | "Reminder"
        | "Marketing"
        | "Authentication"
      message_direction: "inbound" | "outbound"
      meta_approval_state: "Approved" | "Pending" | "Rejected" | "Paused"
      meta_template_category: "Utility" | "Marketing" | "Authentication"
      not_returned_decision:
        | "Still expected"
        | "Charge replacement"
        | "Insurance claim"
        | "Write off"
      note_type: "Booking" | "Internal" | "History"
      notification_schedule_kind:
        | "Immediate"
        | "scheduled"
        | "event-triggered"
        | "workflow-triggered"
      notification_status:
        | "Delivered"
        | "Partially delivered"
        | "Failed"
        | "Draft"
        | "Scheduled"
        | "Cancelled"
      notification_template_category:
        | "Rentals"
        | "Finance"
        | "Operations"
        | "Customer"
        | "Staff"
      notification_type:
        | "Booking confirmed"
        | "Pickup / return reminder"
        | "Invoice / receipt"
        | "Late return"
        | "Damage / missing"
        | "Internal alerts"
      number_format_component:
        | "PREFIX"
        | "YEAR"
        | "MONTH"
        | "DAY"
        | "BRANCH CODE"
        | "WAREHOUSE CODE"
        | "CUSTOM TEXT"
        | "AUTO NUMBER"
      numbering_sequence_status: "Active" | "Disabled" | "Archived"
      operation_kind: "Packing" | "Handover" | "Return" | "Reset" | "Cleaning"
      org_unit_status: "Active" | "Archived"
      otp_delivery_channel: "SMS" | "WhatsApp"
      overlap_behaviour: "skip" | "queue" | "kill"
      override_type:
        | "Gate override"
        | "Scan block override"
        | "Double booking override"
        | "Stage reversal"
        | "QC skip"
      packing_condition: "Good" | "Damaged"
      packing_line_state:
        | "Pending"
        | "Packed"
        | "Partial"
        | "Missing"
        | "Not Required"
        | "Replaced"
      payment_channel_group:
        | "Digital wallets"
        | "Bank"
        | "Cash"
        | "Cards"
        | "Other"
      payment_status: "Received" | "Refunded" | "Failed" | "Cancelled"
      payment_terms: "Immediate" | "7 days" | "15 days" | "30 days"
      payment_type: "Advance Payment" | "Security Deposit" | "Refund"
      performance_band:
        | "95–100 Outstanding"
        | "85–94 Excellent"
        | "70–84 Good"
        | "60–69 Fair"
        | "Below 60 Needs Improvement"
      period_close_checklist_item:
        | "All invoices finalized"
        | "Outstanding payments reviewed"
        | "Expenses posted"
        | "Payroll completed"
        | "VAT verified"
        | "Inventory adjustments completed"
        | "Depreciation calculated"
        | "Bank reconciliation completed"
      permission_column:
        | "View"
        | "Create"
        | "Edit"
        | "Approve"
        | "Delete"
        | "Restore"
        | "Export"
        | "Print"
        | "Manage"
        | "Admin"
      permission_level:
        | "No Access"
        | "View"
        | "Create"
        | "Edit"
        | "Approve"
        | "Delete"
        | "Export"
      permission_preset:
        | "No Access"
        | "Read Only"
        | "Operator"
        | "Supervisor"
        | "Manager"
        | "Administrator"
        | "Custom"
      portal_language: "NE" | "EN"
      portal_user_role: "Owner-user" | "Member"
      portal_user_status: "Invited" | "Active" | "Deactivated"
      pr_evidence_kind: "Demand exceeded" | "Sub-rent event"
      preferred_contact_channel: "Email" | "SMS" | "WhatsApp" | "Push"
      priority_band: "High" | "Medium" | "Low"
      product_category:
        | "Camera"
        | "Lens"
        | "Lighting"
        | "Grip"
        | "Support"
        | "Audio"
        | "Drone"
        | "Monitor"
        | "Power"
        | "Media"
        | "Computing"
        | "Case"
        | "Bag"
        | "Accessory"
        | "Consumable"
        | "Vehicle"
        | "Other"
      product_document_kind:
        | "Invoice"
        | "Warranty"
        | "Insurance"
        | "Manual"
        | "Certificate"
        | "Photo"
      product_record_state: "Draft" | "Active" | "Archived"
      product_tracking_mode: "Serialised" | "Quantity" | "Consumable"
      product_unit_of_measure: "piece" | "metre" | "roll" | "pack"
      purchase_request_reason: "Demand exceeded" | "Sub-rent event" | "Manual"
      purchase_request_rejection_reason:
        | "not needed"
        | "too expensive"
        | "sub-rent is cheaper"
        | "buying different model"
        | "later"
      purchase_request_status:
        | "Draft"
        | "Submitted"
        | "Approved"
        | "Ordered"
        | "Received"
        | "Rejected"
        | "Cancelled"
      queue_state:
        | "Waiting"
        | "Running"
        | "Retrying"
        | "Paused"
        | "Completed"
        | "Failed"
        | "Cancelled"
        | "Timed Out"
      rental_tax_charge_type:
        | "Equipment Rental VAT"
        | "Damage Charges"
        | "Late Fees"
        | "Cleaning Charges"
        | "Delivery Charges"
        | "Pickup Charges"
      replay_mode: "Sandbox replay" | "Dry run" | "Live replay"
      report_period_preset:
        | "Today"
        | "Yesterday"
        | "This Week"
        | "Last Week"
        | "Last 7 Days"
        | "Last 30 Days"
        | "This Month"
        | "Last Month"
        | "This Quarter"
        | "Last Quarter"
        | "This Fiscal Year"
        | "Last Fiscal Year"
        | "Custom"
      report_source_engine:
        | "Financial Engine"
        | "Inventory"
        | "Status Engine"
        | "Expenses"
        | "Cases"
      restore_scope:
        | "Entire System"
        | "Database Only"
        | "Inventory"
        | "Rentals"
        | "Customers"
        | "Finance"
        | "Reports"
        | "Documents"
        | "Images"
        | "Audit Logs"
        | "Selected Records"
      retention_period:
        | "90 Days"
        | "1 Year"
        | "3 Years"
        | "5 Years"
        | "7 Years"
        | "10 Years"
        | "Forever"
      return_line_state: "Outstanding" | "Returned" | "Not Returned"
      role_hierarchy_level:
        | "Owner"
        | "Director"
        | "System Administrator"
        | "Managers"
        | "Supervisors"
        | "Staff"
        | "Viewer"
      scan_code_type: "QR" | "Barcode 1D" | "Manual entry"
      scan_context:
        | "packing"
        | "handover"
        | "return"
        | "reset"
        | "stock_check"
        | "lookup"
      scan_result:
        | "Accepted"
        | "Duplicate"
        | "Wrong job"
        | "Not expected here"
        | "Blocked"
        | "Unknown code"
      schedule_format: "PDF" | "Excel"
      schedule_frequency:
        | "daily"
        | "weekly"
        | "monthly"
        | "quarterly"
        | "yearly"
      segment_kind:
        | "all clients"
        | "active (rented in 90 days)"
        | "inactive"
        | "new (joined in 30 days)"
        | "membership level"
        | "client type"
        | "equipment preference"
        | "last rental date"
        | "custom tags"
      send_policy:
        | "may auto-send on the triggering event"
        | "draft queued for review by default"
        | "always draft"
        | "always draft and consent-gated"
      sequence_branch_rule:
        | "Global Sequence"
        | "Separate Sequence Per Branch"
        | "Separate Sequence Per Warehouse"
      sequence_reset_rule:
        | "Never"
        | "Daily"
        | "Monthly"
        | "Calendar Year"
        | "Nepali Fiscal Year"
        | "Gregorian Fiscal Year"
        | "Manual"
      service_basis: "Flat" | "Per day"
      session_state: "Not Started" | "In Progress" | "Completed"
      session_surface:
        | "Desktop (office)"
        | "Tablet (warehouse, shared)"
        | "Phone (personal)"
      shift_type:
        | "Morning"
        | "Afternoon"
        | "Evening"
        | "Night"
        | "Custom"
        | "Rotating"
      signature_role:
        | "Receiver"
        | "Warehouse staff"
        | "Driver"
        | "Witness"
        | "Returning person"
      sla_priority:
        | "Standard"
        | "Booking in progress"
        | "Overdue or damage case"
      sla_scope: "first response" | "delivery latency"
      sms_encoding: "GSM-7" | "UCS-2"
      special_operating_day_subtype:
        | "Extended Hours"
        | "Festival Hours"
        | "Emergency Operations"
        | "Half-Day Operations"
      stage_category:
        | "Neutral"
        | "Action Required"
        | "In Progress"
        | "Waiting"
        | "Success"
        | "Danger"
      stock_check_exclusion: "On Rent" | "In Transit" | "Sub-rented out"
      stock_check_outcome: "Found" | "Confirmed missing" | "Left unverified"
      stock_check_scope:
        | "Location"
        | "Category"
        | "Fleet item"
        | "Full warehouse"
      storage_level: "Room" | "Zone" | "Rack" | "Shelf" | "Bin"
      sub_rental_direction: "Borrowed" | "Lent"
      sub_rental_flag: "Overdue" | "Extended" | "Late Pickup" | "Damaged"
      sub_rental_status:
        | "Requested"
        | "Reserved"
        | "On Rent"
        | "Returned"
        | "Settled"
        | "Cancelled"
      supported_currency:
        | "NPR"
        | "USD"
        | "EUR"
        | "GBP"
        | "INR"
        | "CNY"
        | "JPY"
        | "SGD"
        | "HKD"
        | "AED"
        | "AUD"
        | "CAD"
      suppression_reason:
        | "Hard bounce"
        | "Soft bounce"
        | "Complaint (spam report)"
      swap_type: "Automatic" | "Manual" | "Failed"
      sync_direction: "pull" | "push"
      sync_status: "pending" | "processing" | "done" | "failed" | "skipped"
      system_language: "English" | "Nepali"
      system_role:
        | "Owner"
        | "Admin"
        | "Warehouse"
        | "Coordinator"
        | "Accounts"
        | "Client"
        | "Technician"
        | "Driver"
        | "Manager"
      tax_group_name:
        | "Rental Equipment"
        | "Product Sales"
        | "Membership"
        | "Services"
        | "Repairs"
        | "Insurance"
        | "Freight"
        | "Miscellaneous"
      tax_pricing_mode: "Inclusive Pricing" | "Exclusive Pricing"
      tax_rule_scope:
        | "Branch-specific rules"
        | "Category-specific rules"
        | "Customer-specific rules"
      tax_rule_type:
        | "Tax exemptions"
        | "Zero-rated transactions"
        | "Tax-inclusive pricing"
        | "Tax-exclusive pricing"
      template_language: "English" | "Nepali"
      template_source: "Official" | "Company"
      template_status: "Draft" | "Published" | "Deprecated" | "Archived"
      template_variable_type:
        | "number"
        | "text"
        | "duration"
        | "money"
        | "list"
        | "reference"
      threat_type:
        | "Brute-force attacks"
        | "Suspicious logins"
        | "Impossible travel"
        | "Multiple failed logins"
        | "Privilege escalation"
        | "API abuse"
        | "Unusual downloads"
      time_restriction:
        | "Office Hours"
        | "Shift Hours"
        | "Custom Schedule"
        | "24×7"
      timesheet_approval_state: "Pending" | "Approved"
      timesheet_submission_state: "Not Submitted" | "Submitted"
      transfer_kind:
        | "Branch Transfers"
        | "Warehouse Transfers"
        | "Zone Transfers"
        | "Temporary Holding"
        | "Transit"
      transfer_status:
        | "Pending"
        | "Approved"
        | "Packing"
        | "In Transit"
        | "Received"
        | "Completed"
        | "Cancelled"
      trigger_type: "event" | "schedule"
      two_factor_enforcement:
        | "Optional"
        | "Required for Managers"
        | "Required for Administrators"
        | "Required for Everyone"
      unit_condition: "Excellent" | "Good" | "Fair" | "Damaged" | "Lost"
      user_account_status:
        | "Online"
        | "Offline"
        | "Inactive"
        | "Suspended"
        | "Locked"
      variable_type: "text" | "number" | "money" | "date" | "reference" | "link"
      vat_pricing_mode: "Inclusive Pricing" | "Exclusive Pricing"
      vehicle_type: "Pickup Van" | "Mini Truck" | "SUV" | "Generator Vehicle"
      verification_result: "Passed" | "Warning" | "Failed"
      version_state:
        | "Draft"
        | "In Review"
        | "Published"
        | "Superseded"
        | "Archived"
        | "Failed"
      warehouse_scope:
        | "All Warehouses"
        | "Assigned Warehouse"
        | "Selected Warehouses"
      warehouse_status: "Active" | "Inactive"
      warranty_decline_reason:
        | "Accidental damage"
        | "Not covered"
        | "Claim declined"
        | "Faster to pay"
      webhook_direction: "Incoming" | "Outgoing"
      weekday:
        | "Sunday"
        | "Monday"
        | "Tuesday"
        | "Wednesday"
        | "Thursday"
        | "Friday"
        | "Saturday"
      whatsapp_quality_rating: "High" | "Medium" | "Low"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      accounting_period_status: ["Open", "Closing", "Closed", "Locked"],
      activity_action: [
        "Login",
        "Logout",
        "Create",
        "Update",
        "Void",
        "Reverse",
        "Retire",
        "Archive",
        "Cancel",
        "Restore",
        "Approve",
        "Reject",
        "Export",
        "Import",
        "Print",
        "Download",
        "Upload",
        "Payment",
        "Refund",
        "Booking Created",
        "Booking Cancelled",
        "Maintenance Created",
        "Case Created",
        "Permission Changed",
        "Password Changed",
      ],
      activity_browser: ["Chrome", "Safari", "Edge", "Firefox", "Other"],
      activity_device: ["Desktop", "Mobile", "Tablet"],
      activity_module: [
        "Today Operations",
        "Rentals",
        "Operations",
        "Inventory",
        "Clients",
        "Calendar",
        "Finance",
        "Settings",
        "Authentication",
        "API",
        "Background Jobs",
      ],
      activity_os: ["Windows", "macOS", "Linux", "Android", "iOS"],
      activity_severity: ["Critical", "High", "Medium", "Low", "Informational"],
      activity_status: ["Success", "Warning", "Failed", "Blocked", "Pending"],
      alert_severity: ["Information", "Info", "Warning", "Critical"],
      allocation_bucket: [
        "Charged to Client",
        "Deposit Applied",
        "Insurance Claimed",
        "Warranty Covered",
        "Recovered from Partner",
        "Absorbed",
      ],
      api_permission: [
        "Read",
        "Write",
        "Webhooks",
        "AI Access",
        "Integration Management",
      ],
      approval_action: [
        "Approve",
        "Reject",
        "Return for Revision",
        "Cancel",
        "Auto Approve",
        "Auto Reject",
        "Escalate",
      ],
      approval_category: [
        "Rental",
        "Finance",
        "Inventory",
        "Operations",
        "Administration",
      ],
      approval_level_mode: [
        "Parallel Approval",
        "Sequential Approval",
        "Conditional Approval",
      ],
      approval_limit_band: [
        "Up to Rs 5,000",
        "Up to Rs 25,000",
        "Up to Rs 100,000",
        "Unlimited",
      ],
      approval_permission: [
        "Booking Approval",
        "Discount Approval",
        "Expense Approval",
        "Purchase Approval",
        "Refund Approval",
        "Maintenance Approval",
        "Case Resolution",
        "Inventory Write-off",
        "Price Change",
        "User Creation",
      ],
      approval_status: [
        "Pending",
        "Approved",
        "Rejected",
        "Cancelled",
        "Expired",
        "Escalated",
      ],
      approval_trigger: [
        "Booking Created",
        "Discount Requested",
        "Expense Submitted",
        "Case Created",
        "Maintenance Requested",
        "Asset Transfer",
        "Purchase Request",
        "Refund Request",
        "Custom Event",
      ],
      approval_workflow_status: ["Draft", "Active", "Paused", "Archived"],
      artefact_type: [
        "Workflow",
        "Business Rule",
        "Template",
        "API Integration",
        "Scheduled Job",
        "Event Trigger",
        "AI Configuration",
      ],
      attempt_status: [
        "Created",
        "Queued",
        "Sent",
        "Delivered",
        "Read",
        "Clicked",
        "Failed",
        "Expired",
      ],
      audit_action: [
        "Login",
        "Logout",
        "Create",
        "Update",
        "Delete",
        "Restore",
        "Archive",
        "Approve",
        "Reject",
        "Export",
        "Import",
        "Print",
        "Download",
        "Upload",
        "Payment",
        "Refund",
        "Booking Created",
        "Booking Cancelled",
        "Maintenance Created",
        "Case Created",
        "Permission Changed",
        "Password Changed",
      ],
      audit_category: [
        "Authentication",
        "Users",
        "Rentals",
        "Inventory",
        "Finance",
        "Administration",
        "Uncategorised",
      ],
      audit_event_class: [
        "status change",
        "money movement",
        "discount",
        "override",
        "session",
        "cancellation",
      ],
      audit_granularity: ["Minimal", "Standard", "Detailed", "Forensic"],
      audit_module: [
        "Today Operations",
        "Rentals",
        "Operations",
        "Inventory",
        "Clients",
        "Calendar",
        "Finance",
        "Settings",
        "Authentication",
        "API",
        "Background Jobs",
      ],
      audit_severity: ["Critical", "High", "Medium", "Low", "Informational"],
      audit_status: ["Success", "Warning", "Failed", "Blocked", "Pending"],
      authentication_method: [
        "Email Login",
        "Username Login",
        "Google Login",
        "Microsoft Login",
        "Apple Login",
        "LDAP",
        "Active Directory",
      ],
      automation_error_class: [
        "validation",
        "API",
        "timeout",
        "permission",
        "network",
        "AI",
        "data",
        "internal",
      ],
      automation_template_category: [
        "Rentals",
        "Inventory",
        "Finance",
        "Clients",
        "Maintenance",
        "Reports",
        "Communication",
        "Staff",
        "Administration",
        "Integrations",
        "Custom",
      ],
      automation_tier: ["Tier 1", "Tier 2", "Tier 3"],
      backup_destination_provider: [
        "Local Storage",
        "NAS",
        "External Drive",
        "AWS S3",
        "Google Drive",
        "Dropbox",
        "OneDrive",
        "Backblaze B2",
        "Wasabi",
        "FTP",
        "SFTP",
      ],
      backup_frequency: [
        "Hourly",
        "Every 6 Hours",
        "Daily",
        "Weekly",
        "Monthly",
        "Manual",
        "Before Update",
        "Before Migration",
        "Before Major Import",
      ],
      backup_schedule_status: ["Enabled", "Disabled", "Paused"],
      backup_status: [
        "Running",
        "Completed",
        "Failed",
        "Cancelled",
        "Verifying",
        "Restored",
      ],
      backup_type: [
        "Full Backup",
        "Incremental Backup",
        "Differential Backup",
        "Database Backup",
        "Documents Backup",
        "Images",
        "Videos",
        "Configuration Backup",
        "Audit Log Backup",
        "AI Configuration Backup",
      ],
      booking_document_type: [
        "Quote",
        "Rental Agreement",
        "Packing List",
        "Delivery Note",
        "Invoice",
        "Receipt",
        "Inspection Report",
        "Damage Report",
        "Client Documents",
        "Insurance",
      ],
      booking_flag: [
        "Partial Pickup",
        "Partial Return",
        "Returned Early",
        "Late Return",
        "Missing",
        "Damaged",
        "Deposit Pending",
        "Payment Due",
        "Overdue",
        "VIP",
        "Blocked",
        "Upgrade Candidate",
      ],
      booking_line_type: [
        "Equipment",
        "Bundle",
        "Accessory",
        "Service",
        "Sub-rental",
        "Manual item",
      ],
      booking_stage: [
        "Quote",
        "Booked",
        "Packed",
        "On Rent",
        "Returned",
        "Closed",
      ],
      branch_scope: ["All Branches", "Assigned Branch", "Selected Branches"],
      branch_status: ["Active", "Inactive", "Under Setup", "Archived"],
      bundle_discount_kind: ["percentage", "fixed"],
      bundle_line_kind: ["Equipment", "Crew", "Vehicle", "Box"],
      bundle_state: [
        "On Rent",
        "Reserved",
        "On Maintenance",
        "Partially Available",
        "Available",
      ],
      calendar_exception_type: [
        "Public Holiday",
        "Festival",
        "Maintenance Shutdown",
        "Special Operating Day",
      ],
      campaign_pause_reason: [
        "bounce rate above threshold",
        "WhatsApp quality drop",
        "opt-out rate above threshold",
        "provider errors above threshold",
      ],
      campaign_schedule_kind: ["Immediate", "scheduled", "recurring"],
      campaign_status: [
        "Draft",
        "Awaiting approval",
        "Scheduled",
        "Sending",
        "Paused",
        "Completed",
        "Cancelled",
      ],
      case_counterparty_kind: ["Client", "Partner", "Vendor"],
      case_disposition: [
        "Repair — send to Maintenance",
        "Charge Client",
        "Warranty Claim",
        "Insurance Claim",
        "Write Off",
        "Found",
        "Client Returned",
        "Replace Item",
        "Charge Upheld",
        "Partially Waived",
        "Fully Waived",
        "Escalated",
        "Recover from Partner",
        "Absorb",
        "Escalate",
      ],
      case_flag: [
        "Under Investigation",
        "Legal",
        "Police Report",
        "Insurance Notified",
      ],
      case_priority: ["Critical", "High", "Medium", "Low"],
      case_status: [
        "Open",
        "Under Review",
        "Awaiting Decision",
        "In Progress",
        "Resolved",
        "Closed",
        "Cancelled",
      ],
      case_type: ["Damage", "Missing", "Theft", "Dispute", "Vendor"],
      change_request_status: ["Edit requested", "Accepted", "Rejected", "Void"],
      channel_code: ["WhatsApp", "Email", "SMS", "In-App"],
      channel_direction: ["two-way", "send-mostly"],
      channel_status: ["Connected", "Disconnected", "Testing", "Error"],
      charge_source_type: ["Damage", "Late Fee"],
      cleaning_mode: ["Clean", "Reset"],
      cleaning_problem_state: [
        "No Problems",
        "Missing Item",
        "Needs Repair",
        "Damaged",
      ],
      cleaning_queue_state: ["Waiting", "Cleaning", "QC", "Ready"],
      client_document_kind: [
        "Student ID",
        "College letter",
        "PAN / VAT",
        "Citizenship",
        "Rental Agreement",
      ],
      client_document_status: ["Pending", "Verified"],
      client_flag_type: ["VIP", "Blocked", "Upgrade Candidate"],
      client_organisation_subtype: [
        "Production House",
        "Rental House",
        "College / Institution",
        "Corporate / Agency",
        "Government / NGO",
        "Broadcaster",
        "Other",
      ],
      client_profession: [
        "Cinematographer",
        "Director",
        "Assistant Camera",
        "Gaffer",
        "Editor",
        "Photographer",
        "Producer",
        "Sound",
        "Other",
      ],
      client_segment: [
        "Wedding / Event",
        "Corporate",
        "Documentary",
        "Music Video",
        "Commercial",
        "Feature",
        "YouTube / Creator",
        "Education",
        "Other",
      ],
      client_status: ["Active", "Deactivated"],
      client_timeline_step: [
        "Quote",
        "Confirmed",
        "Ready",
        "With you",
        "Returned",
        "Completed",
      ],
      client_type_parent: ["Organisation", "Individual"],
      client_visible_state: [
        "Quote Ready",
        "Confirmed",
        "Being Prepared",
        "With You",
        "Return Due",
        "Returned",
        "Completed",
        "Cancelled",
      ],
      commercial_override_kind: ["Credit Limit", "Payment Terms"],
      commercial_override_status: ["Pending", "Approved", "Rejected", "Void"],
      comparison_basis: [
        "previous period",
        "same period last year",
        "previous fiscal year",
        "custom range",
        "entity versus entity",
      ],
      compatibility_kind: ["Compatible with", "Requires"],
      conversation_state: ["Open", "Snoozed", "Closed", "Archived", "Spam"],
      counterparty_type: [
        "Client",
        "Rental Partner",
        "Vendor",
        "Insurance",
        "Internal",
      ],
      credit_debit_note_type: ["Credit Note", "Debit Note"],
      crew_booking_state: [
        "Draft",
        "Tentative",
        "Confirmed",
        "Completed",
        "Cancelled",
      ],
      crew_document_type: [
        "Contract",
        "NDA",
        "Citizenship / Passport",
        "Driving License",
        "Certifications",
        "Insurance",
        "Medical Certificate",
      ],
      crew_engagement_type: ["freelance", "internal staff"],
      crew_pan_status: ["registered", "not registered"],
      crew_payout_state: ["Not due", "Due", "Paid"],
      crew_person_state: ["Available", "Booked", "On Leave", "Off Duty"],
      crew_role: [
        "Rental Coordinator",
        "Warehouse Staff",
        "Driver",
        "Camera Assistant",
        "Delivery Staff",
        "Director",
        "DoP",
        "Focus Puller",
        "Gaffer",
        "Grip",
        "Drone Pilot",
        "Sound Recordist",
      ],
      currency_code: ["NPR", "USD", "EUR", "INR"],
      customer_tax_profile: [
        "VAT Registered",
        "Non-VAT Customer",
        "Tax Exempt",
        "Government Organization",
        "NGO",
        "Corporate",
      ],
      damage_approval_state: ["Pending Approval", "Approved"],
      damage_disposition: ["Charge Client", "Absorb", "Defer to Insurance"],
      damage_source: ["Return inspection", "Cleaning"],
      data_scope: [
        "Own Records",
        "Department Records",
        "Branch Records",
        "Warehouse Records",
        "All Records",
      ],
      default_system_sequence_prefix: [
        "BK",
        "EQ",
        "CL",
        "MT",
        "CASE",
        "INV",
        "PAY",
        "EXP",
        "DOC",
        "BND",
        "MEM",
        "PUR",
        "TRF",
        "SR",
        "COUP",
        "DISC",
        "AUD",
        "LOG",
      ],
      delivery_error_class: [
        "invalid recipient",
        "outside session window",
        "template not approved",
        "suppressed",
        "rate limited",
        "quality throttled",
        "gateway error",
        "timeout",
        "insufficient balance",
      ],
      delivery_method: [
        "Customer Pickup",
        "Babin Delivery",
        "Courier",
        "Third Party",
      ],
      delivery_type: [
        "Customer Pickup",
        "Babin Delivery",
        "Courier",
        "Third Party",
      ],
      dependency_mode: ["parent", "child", "sequential", "parallel"],
      deployment_result: ["Succeeded", "Failed", "Rolled back"],
      deposit_charge_type: ["Damage", "Missing", "Late"],
      deposit_movement_type: ["Received", "Released", "Applied"],
      deposit_state: ["Required", "Received", "Pending"],
      device_restriction: [
        "Desktop Only",
        "Mobile Only",
        "Tablet Only",
        "Approved Devices Only",
      ],
      device_trust_status: ["trusted", "untrusted", "blocked"],
      device_type: ["Desktop", "Mobile", "Tablet"],
      discount_source: [
        "Manual",
        "Membership",
        "Coupon",
        "Women-DoP 5%",
        "Student",
        "College",
        "Named-client rates",
      ],
      document_delivery_event: ["Sent", "Viewed", "Downloaded"],
      document_expiry_type: [
        "Quotation",
        "Client ID / passport",
        "Company registration",
        "Insurance policy",
        "Equipment warranty",
        "Tax exemption certificate",
        "Contract",
      ],
      document_lifecycle_status: [
        "Draft",
        "Pending Approval",
        "Pending Signature",
        "Signed",
        "Issued",
        "Void",
        "Expired",
      ],
      document_origin: ["Generated", "Uploaded"],
      document_type: [
        "Quotation",
        "Rental Agreement",
        "Packing List",
        "Delivery Note",
        "Return Report",
        "Inspection Report",
        "Damage Report",
        "Tax Invoice",
        "Receipt",
        "Credit Note",
        "Debit Note",
        "Job Card",
        "Service Report",
        "Incident Report",
        "Insurance Claim",
        "Call Sheet",
      ],
      environment: ["Sandbox", "Live"],
      equipment_health_band: ["Excellent", "Good", "Fair", "Poor", "Replace"],
      evidence_category: [
        "Packing",
        "Pickup / Delivery",
        "Return",
        "Inspection",
        "Damage",
        "Cleaning",
        "Maintenance",
        "Warehouse",
        "Client Documents",
        "Marketing",
        "Others",
      ],
      evidence_match_source: [
        "QR code",
        "barcode",
        "serial OCR",
        "AI recognition",
        "manual assignment",
      ],
      evidence_match_state: ["Matched", "Need Review", "Unmatched"],
      evidence_media_type: ["Image", "Video", "Document"],
      evidence_operation_stage: [
        "Packing",
        "Pickup",
        "Delivery",
        "Return",
        "Inspection",
        "Reset",
        "Cleaning",
        "Maintenance",
        "Damage",
        "Inventory",
        "Warehouse",
        "Client documents",
      ],
      evidence_processing_step: [
        "Upload",
        "Processing",
        "Review & Match",
        "Synced",
      ],
      exchange_rate_mode: ["Manual", "Automatic"],
      exchange_rate_source: [
        "Nepal Rastra Bank (NRB)",
        "Manual Entry",
        "Custom API",
      ],
      execution_status: [
        "Running",
        "Succeeded",
        "Failed",
        "Cancelled",
        "Timed out",
      ],
      execution_trigger_kind: ["event", "schedule", "manual", "API", "retry"],
      expense_recurrence: ["Daily", "Weekly", "Monthly", "Quarterly", "Yearly"],
      expense_status: [
        "Draft",
        "Pending Approval",
        "Approved",
        "Paid",
        "Rejected",
        "Cancelled",
      ],
      export_format: ["PDF", "Excel", "CSV", "JSON", "Print"],
      festival: [
        "Dashain",
        "Tihar",
        "Holi",
        "Teej",
        "Chhath",
        "Maha Shivaratri",
        "Janai Purnima",
        "Losar",
        "Maghe Sankranti",
        "Eid",
        "Christmas",
      ],
      financial_permission: [
        "Purchase Cost",
        "Selling Price",
        "Rental Cost",
        "Profit",
        "Gross Margin",
        "ROI",
        "Depreciation",
        "Salary",
        "Vendor Cost",
        "Tax Details",
      ],
      fiscal_calendar_basis: ["Nepali Fiscal Year", "Gregorian Fiscal Year"],
      flag_source: ["Manual", "System"],
      flag_type: ["Quantity", "Timing", "Item", "Money", "Client", "Business"],
      forecast_method: [
        "moving average",
        "linear regression",
        "seasonal decomposition",
      ],
      fulfillment_status: [
        "Fulfilled",
        "Partial",
        "Unfulfilled",
        "Waiting",
        "Overbooked",
      ],
      fx_pricing_rule: [
        "Lock exchange rate at quotation",
        "Lock exchange rate at invoice",
        "Live exchange rate option",
      ],
      gateway_role: ["primary", "failover"],
      government_id_kind: ["Citizenship", "Passport"],
      handover_line_state: ["Remaining", "Picked Up", "Missing"],
      health_band: ["Excellent", "Good", "Fair", "Poor", "Replace"],
      health_status: ["pass", "fail", "Not checked"],
      holiday_behaviour: ["skip", "run"],
      hours_scope: [
        "Company Default Hours",
        "Branch Hours",
        "Warehouse Hours",
        "Pickup Counter",
        "Return Counter",
        "Office Hours",
        "Emergency Support Hours",
      ],
      http_method: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      inspection_state: ["Pending", "Inspected"],
      install_conflict_resolution: ["Replace", "Install alongside", "Cancel"],
      integration_category: [
        "Communication",
        "Payments",
        "Accounting",
        "Storage",
        "Calendar",
        "AI",
        "Documents",
        "Custom",
      ],
      integration_health: ["Healthy", "Warning", "Error", "Disabled"],
      internal_note_type: ["Internal note", "Call log"],
      inventory_state: [
        "In Stock",
        "Reserved",
        "Packed",
        "On Rent",
        "Returning",
        "Inspection",
        "Cleaning",
        "Maintenance",
        "Missing",
        "Retired",
      ],
      invoice_status: [
        "Draft",
        "Sent",
        "Partially Paid",
        "Paid",
        "Overdue",
        "Void",
      ],
      ip_restriction: ["Office Network", "VPN", "Anywhere", "Custom IP Range"],
      item_condition: ["Excellent", "Good", "Fair", "Damaged", "Lost"],
      item_quantity_state: [
        "Ready",
        "Picked Up",
        "Returned",
        "Missing",
        "Damaged",
      ],
      late_fee_band: ["None", "Half Day", "Full Day"],
      line_kind: [
        "Equipment Rental",
        "Sub-Rental",
        "Services",
        "Crew Charges",
        "Transport",
        "Late Fee",
      ],
      location_kind: [
        "Warehouse",
        "Case",
        "Drawer",
        "Workshop",
        "With Client",
        "In Transit",
        "Sub-Rental Supplier",
      ],
      maintenance_flag: [
        "Overdue",
        "Warranty",
        "Blocked Booking",
        "Awaiting Approval",
      ],
      maintenance_priority: ["Low", "Medium", "High", "Critical"],
      maintenance_shutdown_subtype: [
        "Planned Shutdown",
        "Warehouse Closure",
        "Inventory Audit Days",
        "Deep Cleaning Days",
      ],
      maintenance_source: ["Manual", "Preventive cycle"],
      maintenance_status: [
        "Scheduled",
        "In Progress",
        "Waiting Parts",
        "At Vendor",
        "Completed",
        "Cancelled",
      ],
      maintenance_type: [
        "Repair",
        "Inspection",
        "Calibration",
        "Firmware Update",
        "Sensor Cleaning",
        "Internal Cleaning",
        "Fungus Removal",
        "Preventive Service",
      ],
      marketing_consent_state: [
        "Not asked",
        "Opted in",
        "Opted out",
        "Opt-In",
        "Opt-Out",
        "Do Not Disturb",
      ],
      membership_label: ["Access Member", "Partner", "Elite Member"],
      membership_level: [
        "Academy",
        "Creator",
        "Cinematographer",
        "Production Alliance",
        "Elite",
      ],
      membership_limit_kind: [
        "Monthly booking limit",
        "Simultaneous rental limit",
      ],
      membership_perk: [
        "Priority Booking",
        "Dedicated Manager",
        "Company Billing",
        "Credit Terms",
        "VIP Support",
        "Custom Solutions",
      ],
      membership_plan_status: ["Active", "Retired"],
      membership_status: ["Active", "Grace", "Lapsed"],
      message_class: [
        "Transactional",
        "Reminder",
        "Marketing",
        "Authentication",
      ],
      message_direction: ["inbound", "outbound"],
      meta_approval_state: ["Approved", "Pending", "Rejected", "Paused"],
      meta_template_category: ["Utility", "Marketing", "Authentication"],
      not_returned_decision: [
        "Still expected",
        "Charge replacement",
        "Insurance claim",
        "Write off",
      ],
      note_type: ["Booking", "Internal", "History"],
      notification_schedule_kind: [
        "Immediate",
        "scheduled",
        "event-triggered",
        "workflow-triggered",
      ],
      notification_status: [
        "Delivered",
        "Partially delivered",
        "Failed",
        "Draft",
        "Scheduled",
        "Cancelled",
      ],
      notification_template_category: [
        "Rentals",
        "Finance",
        "Operations",
        "Customer",
        "Staff",
      ],
      notification_type: [
        "Booking confirmed",
        "Pickup / return reminder",
        "Invoice / receipt",
        "Late return",
        "Damage / missing",
        "Internal alerts",
      ],
      number_format_component: [
        "PREFIX",
        "YEAR",
        "MONTH",
        "DAY",
        "BRANCH CODE",
        "WAREHOUSE CODE",
        "CUSTOM TEXT",
        "AUTO NUMBER",
      ],
      numbering_sequence_status: ["Active", "Disabled", "Archived"],
      operation_kind: ["Packing", "Handover", "Return", "Reset", "Cleaning"],
      org_unit_status: ["Active", "Archived"],
      otp_delivery_channel: ["SMS", "WhatsApp"],
      overlap_behaviour: ["skip", "queue", "kill"],
      override_type: [
        "Gate override",
        "Scan block override",
        "Double booking override",
        "Stage reversal",
        "QC skip",
      ],
      packing_condition: ["Good", "Damaged"],
      packing_line_state: [
        "Pending",
        "Packed",
        "Partial",
        "Missing",
        "Not Required",
        "Replaced",
      ],
      payment_channel_group: [
        "Digital wallets",
        "Bank",
        "Cash",
        "Cards",
        "Other",
      ],
      payment_status: ["Received", "Refunded", "Failed", "Cancelled"],
      payment_terms: ["Immediate", "7 days", "15 days", "30 days"],
      payment_type: ["Advance Payment", "Security Deposit", "Refund"],
      performance_band: [
        "95–100 Outstanding",
        "85–94 Excellent",
        "70–84 Good",
        "60–69 Fair",
        "Below 60 Needs Improvement",
      ],
      period_close_checklist_item: [
        "All invoices finalized",
        "Outstanding payments reviewed",
        "Expenses posted",
        "Payroll completed",
        "VAT verified",
        "Inventory adjustments completed",
        "Depreciation calculated",
        "Bank reconciliation completed",
      ],
      permission_column: [
        "View",
        "Create",
        "Edit",
        "Approve",
        "Delete",
        "Restore",
        "Export",
        "Print",
        "Manage",
        "Admin",
      ],
      permission_level: [
        "No Access",
        "View",
        "Create",
        "Edit",
        "Approve",
        "Delete",
        "Export",
      ],
      permission_preset: [
        "No Access",
        "Read Only",
        "Operator",
        "Supervisor",
        "Manager",
        "Administrator",
        "Custom",
      ],
      portal_language: ["NE", "EN"],
      portal_user_role: ["Owner-user", "Member"],
      portal_user_status: ["Invited", "Active", "Deactivated"],
      pr_evidence_kind: ["Demand exceeded", "Sub-rent event"],
      preferred_contact_channel: ["Email", "SMS", "WhatsApp", "Push"],
      priority_band: ["High", "Medium", "Low"],
      product_category: [
        "Camera",
        "Lens",
        "Lighting",
        "Grip",
        "Support",
        "Audio",
        "Drone",
        "Monitor",
        "Power",
        "Media",
        "Computing",
        "Case",
        "Bag",
        "Accessory",
        "Consumable",
        "Vehicle",
        "Other",
      ],
      product_document_kind: [
        "Invoice",
        "Warranty",
        "Insurance",
        "Manual",
        "Certificate",
        "Photo",
      ],
      product_record_state: ["Draft", "Active", "Archived"],
      product_tracking_mode: ["Serialised", "Quantity", "Consumable"],
      product_unit_of_measure: ["piece", "metre", "roll", "pack"],
      purchase_request_reason: ["Demand exceeded", "Sub-rent event", "Manual"],
      purchase_request_rejection_reason: [
        "not needed",
        "too expensive",
        "sub-rent is cheaper",
        "buying different model",
        "later",
      ],
      purchase_request_status: [
        "Draft",
        "Submitted",
        "Approved",
        "Ordered",
        "Received",
        "Rejected",
        "Cancelled",
      ],
      queue_state: [
        "Waiting",
        "Running",
        "Retrying",
        "Paused",
        "Completed",
        "Failed",
        "Cancelled",
        "Timed Out",
      ],
      rental_tax_charge_type: [
        "Equipment Rental VAT",
        "Damage Charges",
        "Late Fees",
        "Cleaning Charges",
        "Delivery Charges",
        "Pickup Charges",
      ],
      replay_mode: ["Sandbox replay", "Dry run", "Live replay"],
      report_period_preset: [
        "Today",
        "Yesterday",
        "This Week",
        "Last Week",
        "Last 7 Days",
        "Last 30 Days",
        "This Month",
        "Last Month",
        "This Quarter",
        "Last Quarter",
        "This Fiscal Year",
        "Last Fiscal Year",
        "Custom",
      ],
      report_source_engine: [
        "Financial Engine",
        "Inventory",
        "Status Engine",
        "Expenses",
        "Cases",
      ],
      restore_scope: [
        "Entire System",
        "Database Only",
        "Inventory",
        "Rentals",
        "Customers",
        "Finance",
        "Reports",
        "Documents",
        "Images",
        "Audit Logs",
        "Selected Records",
      ],
      retention_period: [
        "90 Days",
        "1 Year",
        "3 Years",
        "5 Years",
        "7 Years",
        "10 Years",
        "Forever",
      ],
      return_line_state: ["Outstanding", "Returned", "Not Returned"],
      role_hierarchy_level: [
        "Owner",
        "Director",
        "System Administrator",
        "Managers",
        "Supervisors",
        "Staff",
        "Viewer",
      ],
      scan_code_type: ["QR", "Barcode 1D", "Manual entry"],
      scan_context: [
        "packing",
        "handover",
        "return",
        "reset",
        "stock_check",
        "lookup",
      ],
      scan_result: [
        "Accepted",
        "Duplicate",
        "Wrong job",
        "Not expected here",
        "Blocked",
        "Unknown code",
      ],
      schedule_format: ["PDF", "Excel"],
      schedule_frequency: ["daily", "weekly", "monthly", "quarterly", "yearly"],
      segment_kind: [
        "all clients",
        "active (rented in 90 days)",
        "inactive",
        "new (joined in 30 days)",
        "membership level",
        "client type",
        "equipment preference",
        "last rental date",
        "custom tags",
      ],
      send_policy: [
        "may auto-send on the triggering event",
        "draft queued for review by default",
        "always draft",
        "always draft and consent-gated",
      ],
      sequence_branch_rule: [
        "Global Sequence",
        "Separate Sequence Per Branch",
        "Separate Sequence Per Warehouse",
      ],
      sequence_reset_rule: [
        "Never",
        "Daily",
        "Monthly",
        "Calendar Year",
        "Nepali Fiscal Year",
        "Gregorian Fiscal Year",
        "Manual",
      ],
      service_basis: ["Flat", "Per day"],
      session_state: ["Not Started", "In Progress", "Completed"],
      session_surface: [
        "Desktop (office)",
        "Tablet (warehouse, shared)",
        "Phone (personal)",
      ],
      shift_type: [
        "Morning",
        "Afternoon",
        "Evening",
        "Night",
        "Custom",
        "Rotating",
      ],
      signature_role: [
        "Receiver",
        "Warehouse staff",
        "Driver",
        "Witness",
        "Returning person",
      ],
      sla_priority: [
        "Standard",
        "Booking in progress",
        "Overdue or damage case",
      ],
      sla_scope: ["first response", "delivery latency"],
      sms_encoding: ["GSM-7", "UCS-2"],
      special_operating_day_subtype: [
        "Extended Hours",
        "Festival Hours",
        "Emergency Operations",
        "Half-Day Operations",
      ],
      stage_category: [
        "Neutral",
        "Action Required",
        "In Progress",
        "Waiting",
        "Success",
        "Danger",
      ],
      stock_check_exclusion: ["On Rent", "In Transit", "Sub-rented out"],
      stock_check_outcome: ["Found", "Confirmed missing", "Left unverified"],
      stock_check_scope: [
        "Location",
        "Category",
        "Fleet item",
        "Full warehouse",
      ],
      storage_level: ["Room", "Zone", "Rack", "Shelf", "Bin"],
      sub_rental_direction: ["Borrowed", "Lent"],
      sub_rental_flag: ["Overdue", "Extended", "Late Pickup", "Damaged"],
      sub_rental_status: [
        "Requested",
        "Reserved",
        "On Rent",
        "Returned",
        "Settled",
        "Cancelled",
      ],
      supported_currency: [
        "NPR",
        "USD",
        "EUR",
        "GBP",
        "INR",
        "CNY",
        "JPY",
        "SGD",
        "HKD",
        "AED",
        "AUD",
        "CAD",
      ],
      suppression_reason: [
        "Hard bounce",
        "Soft bounce",
        "Complaint (spam report)",
      ],
      swap_type: ["Automatic", "Manual", "Failed"],
      sync_direction: ["pull", "push"],
      sync_status: ["pending", "processing", "done", "failed", "skipped"],
      system_language: ["English", "Nepali"],
      system_role: [
        "Owner",
        "Admin",
        "Warehouse",
        "Coordinator",
        "Accounts",
        "Client",
        "Technician",
        "Driver",
        "Manager",
      ],
      tax_group_name: [
        "Rental Equipment",
        "Product Sales",
        "Membership",
        "Services",
        "Repairs",
        "Insurance",
        "Freight",
        "Miscellaneous",
      ],
      tax_pricing_mode: ["Inclusive Pricing", "Exclusive Pricing"],
      tax_rule_scope: [
        "Branch-specific rules",
        "Category-specific rules",
        "Customer-specific rules",
      ],
      tax_rule_type: [
        "Tax exemptions",
        "Zero-rated transactions",
        "Tax-inclusive pricing",
        "Tax-exclusive pricing",
      ],
      template_language: ["English", "Nepali"],
      template_source: ["Official", "Company"],
      template_status: ["Draft", "Published", "Deprecated", "Archived"],
      template_variable_type: [
        "number",
        "text",
        "duration",
        "money",
        "list",
        "reference",
      ],
      threat_type: [
        "Brute-force attacks",
        "Suspicious logins",
        "Impossible travel",
        "Multiple failed logins",
        "Privilege escalation",
        "API abuse",
        "Unusual downloads",
      ],
      time_restriction: [
        "Office Hours",
        "Shift Hours",
        "Custom Schedule",
        "24×7",
      ],
      timesheet_approval_state: ["Pending", "Approved"],
      timesheet_submission_state: ["Not Submitted", "Submitted"],
      transfer_kind: [
        "Branch Transfers",
        "Warehouse Transfers",
        "Zone Transfers",
        "Temporary Holding",
        "Transit",
      ],
      transfer_status: [
        "Pending",
        "Approved",
        "Packing",
        "In Transit",
        "Received",
        "Completed",
        "Cancelled",
      ],
      trigger_type: ["event", "schedule"],
      two_factor_enforcement: [
        "Optional",
        "Required for Managers",
        "Required for Administrators",
        "Required for Everyone",
      ],
      unit_condition: ["Excellent", "Good", "Fair", "Damaged", "Lost"],
      user_account_status: [
        "Online",
        "Offline",
        "Inactive",
        "Suspended",
        "Locked",
      ],
      variable_type: ["text", "number", "money", "date", "reference", "link"],
      vat_pricing_mode: ["Inclusive Pricing", "Exclusive Pricing"],
      vehicle_type: ["Pickup Van", "Mini Truck", "SUV", "Generator Vehicle"],
      verification_result: ["Passed", "Warning", "Failed"],
      version_state: [
        "Draft",
        "In Review",
        "Published",
        "Superseded",
        "Archived",
        "Failed",
      ],
      warehouse_scope: [
        "All Warehouses",
        "Assigned Warehouse",
        "Selected Warehouses",
      ],
      warehouse_status: ["Active", "Inactive"],
      warranty_decline_reason: [
        "Accidental damage",
        "Not covered",
        "Claim declined",
        "Faster to pay",
      ],
      webhook_direction: ["Incoming", "Outgoing"],
      weekday: [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ],
      whatsapp_quality_rating: ["High", "Medium", "Low"],
    },
  },
} as const
