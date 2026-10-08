# Babin Rentals OS — Critical Risk & Security Audit Report

**Repository:** `babindulal7/Brv2`  
**Date:** 2026-10-08  
**Mode:** READ-ONLY AUDIT  

This report documents critical technical, security, schema, and operational risks across all identified branches, evaluated against Babin Rentals OS business and architectural laws.

---

## 1. Executive Risk Matrix

| Risk Domain | Severity | Primary Branches Affected | Description | Actionable Verification / Test |
|---|---|---|---|---|
| **Migration Sequence Collision** | **CRITICAL** | `main`, `step1-foundation` | `0159` prefix collision: `main` has `0159_grant_non_money_columns.sql`, while `step1-foundation` has `0159_saved_views.sql` and renumbered the grant migration to `0162`. Applying `step1-foundation` directly over `main` will corrupt migration tracking. | Verify Supabase migration history table `_supabase_migrations` against `0159`–`0162`. Run `npm run check:pglite` or migration dry-run. |
| **Missing Migration Gap on Main** | **CRITICAL** | `main` | `main` only contains migrations `0001`–`0062` plus the stray `0159`. Migrations `0063` through `0158` (96 migrations covering audit logging, damage limits, late fees, pricing models) are missing from `main`. | Compare schema diff between `main` and `step1-foundation`. Run vitest database mock tests. |
| **Duplicate Migration Prefix** | **HIGH** | `main` | `main` contains duplicate prefix `0056`: `0056_auth_role_resolves_without_pre_request_hook.sql` and `0056_ruled_sequences_completion.sql`. | Renumber duplicate `0056` prefixes to match `step1-foundation` canonical sequence. |
| **Uncommitted Working Tree Mutation** | **HIGH** | `main` (active checkout) | `main` contains 20 modified files and 6 untracked files (including conflict resolution modals and data age badges). Any branch switch (`git checkout`) will fail or risk data loss. | Never run checkout until working tree changes are committed to a safe feature branch or stashed. |
| **Competing Settings Schema (0158)** | **HIGH** | `claude/zen-swartz-228eaa`, `step1-foundation` | `zen-swartz` created an insecure version of `0158_settings_table.sql` relying on direct table updates (`auth_is_owner()`), whereas `step1-foundation` created an idempotent `public.set_setting()` RPC with audit triggers. Merging `zen-swartz` would downgrade security. | Enforce that `step1-foundation`'s RPC-gated `0158_settings_table.sql` is retained and `zen-swartz` is discarded. |
| **Law 6 Money-Blind Staff Isolation** | **HIGH** | All branches | Operations staff (Warehouse, Delivery, Crew) must have zero visibility of money amounts, revenue KPIs, and invoice charges. `step1-foundation` enforces this via 0162 column grants and `useCanViewMoney()`, but UI branches must not re-introduce leaks. | Run `npm test -- src/lib/__tests__/rbac.test.ts` and `src/modules/finance/__tests__/Finance.restricted.test.tsx`. |
| **Double-Booking & Concurrency** | **MEDIUM** | `step1-foundation`, `feat/unified-crew-delivery-search` | Double-booking prevention must be strictly server-side / atomic in `confirmRental.ts` and availability RPCs, not just UI checks. | Run `npm test -- src/actions/rentals/__tests__/confirmRental.test.ts` and `src/lib/__tests__/availability.test.ts`. |
| **Operational Rental Day (06:00–06:00)** | **MEDIUM** | `claude/md-brief-gaps`, `step1-foundation` | Rental days run 06:00 to 06:00 NPT. Return countdowns and movement panels in `md-brief-gaps` must calculate against operational day boundary, not calendar midnight. | Run `npm test -- src/lib/__tests__/returnCountdown.test.ts` and `src/modules/today/__tests__/todayQuery.test.ts`. |
| **Fake Seed Data Contamination (Law 16)** | **MEDIUM** | `claude/zen-swartz-228eaa`, `step1-foundation` | Older branches imported `src/data/inventoryReports.ts` with hardcoded seed figures. `step1-foundation` dropped this file (`4fabe1e`). Stale merges could re-introduce fake data. | Ensure `src/data/inventoryReports.ts` remains deleted; verify report modules query real database views. |
| **Unstable UI Branch Tests** | **MEDIUM** | `claude/work-tree-feature-copy-2eb747` | Branch `318c9a3` records 9 failing tests from an incomplete Codex port. Wholesale merge will break CI. | Do not merge `claude/work-tree-feature-copy-2eb747` in bulk. Extract only validated standalone components. |
| **Accidental Secret Disclosure** | **LOW (PASS)** | All branches | Live `.env.local` containing Supabase URL and service keys is properly ignored in `.gitignore`. No secret tokens were found committed in git history. | Continue enforcing `.gitignore` exclusion for `.env*` files. |

---

## 2. Deep Technical Breakdown of High-Risk Items

### 2.1 Database Migration 0159 Collision & Missing Range (0063–0158)
* **The Collision:**
  * On `main`, commit `79ec345` added:
    ```
    supabase/migrations/0159_grant_non_money_columns.sql
    ```
  * In `step1-foundation`, migration `0159` is:
    ```
    supabase/migrations/0159_saved_views.sql
    ```
    And the non-money column grants were correctly numbered as:
    ```
    supabase/migrations/0162_grant_non_money_columns.sql
    ```
* **The Missing Range:**
  * `main` only contains migrations `0001` to `0062` and this lone `0159`.
  * `step1-foundation` contains the complete production migration chain:
    * `0063`–`0150`: RLS hardening, damage limits, approval workflows, invoice closures.
    * `0151`–`0157`: Audit triggers on all mutation paths.
    * `0158`: Centralized `settings` table with history trigger.
    * `0159`: Saved views table and schema.
    * `0160`: Dynamic pricing structures.
    * `0161`: Booking project type permissions.
    * `0162`: Non-money column grants to authenticated role.
* **Impact:** If `main` is applied to production or merged carelessly with `step1-foundation`, the migration tool will fail with duplicate migration IDs or missing prerequisite tables.

### 2.2 Law 6: Money Blindness & RLS Staff Isolation
* In Babin Rentals OS, roles `Warehouse`, `Delivery`, `Technician`, and `Crew` are legally barred from seeing rental amounts, daily revenue, or deposit balances.
* Migration `0162_grant_non_money_columns.sql` strips table-level `SELECT` on financial tables and grants column-level access only to operational attributes.
* In `claude/md-brief-gaps`, the new Fonepay payment method cards and Record Payment modal correctly restrict payment recording to authorized roles (`canTakePayment`), but any changes to `ChoiceCards.tsx` must ensure no monetary totals are leaked to unprivileged roles.

### 2.3 Double-Booking Prevention & Server-Side Availability
* In `step1-foundation`, `confirmRental.ts` validates line inventory counts against live bookings before issuing confirmation.
* In `feat/unified-crew-delivery-search`, adding delivery transport modes does not consume physical fleet stock, but Crew lines must respect crew availability roster limits.

### 2.4 Uncommitted Working Tree on Main
* The working directory at `C:\Users\use\Desktop\babin-rentals-os` contains:
  * 20 modified files in `src/modules/finance`, `src/modules/rentals`, `src/components/ui`.
  * 6 untracked files implementing Phase 9 conflict resolution and data age badges:
    * `ConflictNotificationBanner.tsx`
    * `ConflictResolutionModal.tsx`
    * `DataAgeBadge.tsx`
    * `ConflictResolution.test.tsx`
    * `DataAgeBadge.test.tsx`
    * `offlineQueue.test.ts`
* Any attempt to perform a git checkout or pull without committing or stashing will either abort or overwrite these files.
