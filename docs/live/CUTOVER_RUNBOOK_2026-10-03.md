# Babin Rentals OS — Live Database Cutover Runbook

**Date:** 3 October 2026  
**Target Environment:** Production Supabase (`aws-0-ap-southeast-1.pooler.supabase.com` / PostgreSQL 15+)  
**Scope:** Pending migrations `0079` through `0150` (67 migrations)  
**Authority:** `BACKUP_PROTOCOL.md` · `docs/00_READ_FIRST.md` · `CLAUDE.md` · `docs/PERMISSIONS.md` · `RULINGS-*.md` · Rule N-5  

---

## 1. Executive Summary & Readiness Status

All local gates are green as of 3 Oct 2026:
- **Scratch Migrations:** 148/148 migrations applied cleanly in PGlite from scratch (`check:pglite`).
- **Anon Leak Gates:** 30/30 public views closed to anon; 21/21 anon-executable functions restricted to safe calculators/RLS helpers (`0148`, `0150`).
- **End-to-End Lifecycle:** 24/24 steps verified green (`check:lifecycle`), including L23 (`extend_booking`) and L24 (`void_invoice`).
- **Test Suite:** 283 test files / 3,895 tests passing (`vitest run`).
- **Production Build:** Clean bundle and PWA service worker generated in 52s (`npm run build`).

Production currently carries 75 applied migrations, topping out at `0089` (with gaps from `0079` onwards). A total of **67 pending migrations** (`0079` through `0150`, excluding `0047` demo seed) must be applied to bring production to 100% parity with the application codebase.

---

## 2. Phase 0 — Pre-Flight Checklist & Decisions

### 2.1 The Seven Renamed Migrations (Confirmed Applied)
Live `supabase_migrations.schema_migrations` records 7 migrations under legacy or timestamp-based slugs. These are verified identical in purpose and must **NOT** be re-executed:

| Local File | Live Slug | Live Version | Decision |
|---|---|---|---|
| `0056_0_auth_role_falls_back_to_auth_uid.sql` | `0056_auth_role_falls_back_to_auth_uid` | `20260812160730` | **SKIP** (already applied) |
| `0059_users_self_read_accepts_auth_uid.sql` | `0057_users_self_read_accepts_auth_uid` | `20260812170827` | **SKIP** (already applied) |
| `0060_staff_row_for_the_current_owner_identity.sql` | `0058_staff_row_for_babindulal7` | `20260812170856` | **SKIP** (already applied) |
| `0069_purchase_approval_owner_manager_only.sql` | `purchase_approval_owner_manager_only` | `20260824194129` | **SKIP** (already applied) |
| `0073_auth_role_resolves_without_pre_request_hook.sql` | `0056_auth_role_resolves_without_pre_request_hook` | `20260812160830` | **SKIP** (already applied) |
| `0081_ruled_sequences_completion.sql` | `ruled_sequences_completion` | `20260815185424` | **SKIP** (already applied) |
| `0082_seed_operational_stage_corpus.sql` | `0076_seed_operational_stage_corpus` | `20260831141204` | **SKIP** (already applied) |

### 2.2 Excluded Migration: `0047_seed_reference_corpus.sql`
- **Hazard:** Contains ~125 demo/reference rows designed for empty local instances. Live production already contains genuine business records and holds `0047_seed_tail_b917_equipment_line`.
- **Decision:** **EXCLUDE FROM CUTOVER**. Do not run `0047_seed_reference_corpus.sql` against production.

### 2.3 Unexplained Live Rows
- `archive_bakery_pos_schema` (`20260809220713`) — Pre-existing legacy schema backup; leave untouched.
- `0047_seed_tail_b917_equipment_line` (`20260812155050`) — Historical seed artifact; leave untouched.

---

## 3. Phase 1 — Production Backup Protocol

Before any migration is executed, perform a physical database snapshot:

### Step 1.1: Capture Timestamped Dump
Run from the repository root:
```powershell
# In PowerShell:
$env:DB_URL = "postgresql://postgres.[project-ref]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"
.\scripts\backup-db.ps1 -DbUrl $env:DB_URL
```
*Output file:* `production_backup_YYYYMMDD_HHmmss.sql`

### Step 1.2: Verify Dump Integrity
Verify the dump is non-empty and contains valid DDL/data:
```bash
Get-Item production_backup_*.sql | Select-Object Name, Length, LastWriteTime
```
Ensure size is consistent with previous exports (>2 MB).

### Step 1.3: Refresh Live Migration Registry
In the Supabase SQL Editor, run:
```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```
Save the resulting text into `docs/live/schema_migrations_$(Get-Date -Format 'yyyy-MM-dd').txt`.

---

## 4. Phase 2 — Phased Migration Execution Plan

Migrations must be applied sequentially in **three isolated stages**. Each migration runs in its own transaction (`BEGIN ... COMMIT`). If any statement fails, the transaction rolls back immediately without leaving corrupt partial state.

### Stage A: Core Financials, Sequences & Bookings (`0079` – `0100`)
Focus: VAT authority, monotonic document numbering, sticky drafts, payment net calculations, and transition constraints.

```bash
# Order of Execution:
1.  0079_invoice_vat_rate_is_authoritative.sql
2.  0080_draft_is_sticky.sql
3.  0085_booking_numbers_bare.sql
4.  0086_invoice_write_rights_and_draft_without_number.sql
5.  0087_payment_totals_exclude_refunds_and_net_reversals.sql
6.  0088_booking_no_numeric_index.sql
7.  0090_r06_handover_money_gate_warns.sql
8.  0091_audit_events_refuse_anonymous_writes.sql
9.  0092_law6_warehouse_cannot_rewrite_prices.sql
10. 0093_state_the_grants.sql
11. 0094_stage_is_written_only_by_its_transition.sql
12. 0095_views_are_read_only.sql
13. 0096_create_invoice_rpc.sql
14. 0097_sync_cursors_are_server_written.sql
15. 0098_invoice_totals_match_engine.sql
16. 0099_create_booking_discount_audit_class.sql
17. 0100_reservations_written_by_transition.sql
```

**Stage A Verification Query:**
```sql
SELECT count(*) FROM pg_proc WHERE proname IN ('create_invoice', 'apply_booking_stage_transition');
-- Expected: 2
```

---

### Stage B: RLS Enforcements, Stage Gates & Maintenance (`0101` – `0127`)
Focus: Role assignment, money-blind isolation, conflict tracking, floor gate requirements, void discipline, and index optimizations.

```bash
# Order of Execution:
18. 0101_staff_roles_are_assignable.sql
19. 0102_law6_money_blind_cannot_write_booking_money.sql
20. 0103_preventive_maintenance.sql
21. 0104_reservation_conflicts_are_recorded.sql
22. 0105_stage_gate_requires_floor_rows.sql
23. 0106_close_gate_requires_invoice.sql
24. 0107_payments_validation_guards.sql
25. 0108_issue_invoice_rpc.sql
26. 0109_cancel_booking_rpc.sql
27. 0110_client_own_rows_rls.sql
28. 0111_extend_booking_rpc.sql
29. 0112_partial_return_missing_case.sql
30. 0113_law17_delivery_type_client_pickup.sql
31. 0114_unit_status_engine.sql
32. 0115_stage_gates.sql
33. 0116_close_gate.sql
34. 0117_invoice_void_discipline.sql
35. 0118_payment_ceiling.sql
36. 0119_server_side_prices.sql
37. 0120_users_visibility_and_role_ceiling.sql
38. 0121_void_invoice_rpc.sql
39. 0122_inspection_operation_session.sql
40. 0123_categorize_equipment_inventory.sql
41. 0124_reservations_follow_booking_dates.sql
42. 0125_rental_drafts.sql
43. 0126_performance_indexes.sql
44. 0127_query_optimization_indexes.sql
```

**Stage B Verification Query:**
```sql
SELECT count(*) FROM information_schema.tables 
WHERE table_name IN ('rental_drafts', 'equipment_maintenance_records', 'inspection_operation_sessions');
-- Expected: 3
```

---

### Stage C: Security Closure, Anon Leak Lock & RPC Hardening (`0128` – `0150`)
Focus: Audit log views, storage buckets, consumable handover deductions, smart notes, anon leak closure (D1–D3), service-line exemptions, and mutation RPC lockdown (D4–D7).

```bash
# Order of Execution:
45. 0128_transition_cinema_assets_to_serialized.sql
46. 0129_audit_logs_view.sql
47. 0130_law6_arm_money_grants_remaining_tables.sql
48. 0131_close_gate_pending_damage.sql
49. 0132_create_booking_crew_transport.sql
50. 0133_create_documents_storage_bucket.sql
51. 0134_bundle_items_soft_delete.sql
52. 0135_zero_value_close_override.sql
53. 0136_payment_reversal_ceiling.sql
54. 0137_law17_delivery_method_client_pickup.sql
55. 0138_subrental_return_by_date.sql
56. 0139_return_gate_exempt_non_physical_lines.sql
57. 0140_stock_adjustments.sql
58. 0141_return_gate_consumable_exemption.sql
59. 0142_consumable_stock_deduction_on_handover.sql
60. 0143_smart_intel_notes_fields.sql
61. 0144_booking_project_type.sql
62. 0145_document_registry_read_scope.sql
63. 0146_record_editor_transactions.sql
64. 0147_quote_editor_transactions.sql
65. 0148_view_anon_leak_closure.sql                         <-- P0/D1 closure
66. 0149_handover_gate_exempt_non_physical_lines.sql        <-- Service-only rental fix
67. 0150_rpc_security_and_mutation_closure.sql              <-- P0/D4, P1/D5-D7 closure
```

---

## 5. Phase 3 — Post-Cutover Sanity Verification

Execute these verification queries immediately in the Supabase SQL editor:

### Test 1: Zero Views Readable by Anon (Audit D1 Verification)
```sql
SELECT count(*) AS leaking_views
FROM information_schema.views v
JOIN information_schema.table_privileges p 
  ON p.table_schema = v.table_schema AND p.table_name = v.table_name
WHERE v.table_schema = 'public'
  AND p.grantee IN ('anon', 'public')
  AND p.privilege_type = 'SELECT';
-- Expected: 0
```

### Test 2: Mutation RPCs Blocked from Anon (Audit D4–D7 Verification)
```sql
SELECT count(*) AS unauthorized_mutating_rpcs
FROM information_schema.routine_privileges p
JOIN information_schema.routines r
  ON r.routine_schema = p.routine_schema AND r.routine_name = p.routine_name
WHERE p.routine_schema = 'public'
  AND p.grantee IN ('anon', 'public')
  AND p.routine_name IN (
    'cancel_booking', 'extend_booking', 'void_invoice', 
    'issue_invoice', 'create_booking', 'next_document_number',
    'record_reservation_conflicts', 'recompute_unit_status'
  );
-- Expected: 0
```

### Test 3: Operational Day & Role Check
```sql
SELECT 
  public.auth_user_role() IS NOT NULL AS rls_role_resolved,
  public.now_npt() IS NOT NULL AS npt_operational_time_active;
-- Expected: true, true
```

---

## 6. Phase 4 — Disaster Recovery & Rollback Protocol

If any migration in Stage A, B, or C fails unrecoverably or causes data inconsistency:

1. **Halt Execution Immediately:** Do not run subsequent files.
2. **Assess Blast Radius:** Each file runs in an atomic `BEGIN ... COMMIT` block. If the failing file rolled back, earlier completed migrations are still sound.
3. **Full Database Rollback (if necessary):**
   ```powershell
   psql "$env:DB_URL" -f "production_backup_YYYYMMDD_HHmmss.sql"
   ```
   *Note:* The backup file contains `--clean --if-exists`, ensuring complete restoration to the exact pre-cutover state.
4. **Notify Team & Log:** Record error line, failing table/constraint name, and notify Babin.
