# Babin Rentals OS — Current State

**Evidence Date:** 25 September 2026  
**Last Verified Status:** Post-Audit Remediation (P1/P2 resolution + 44/44 backend actions implemented)  
**Verification Environment:** Local PGlite 0.5.8 (WASM), Node v20+, Vitest v3.2.7  
**Canonical Documentation:** [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) · [`docs/00_READ_FIRST.md`](docs/00_READ_FIRST.md)

---

## 1. Current Phase
**Phase 7 — Pre-Deployment Production Verification & Migration Cutover**

---

## 2. Production Readiness Statement
**Readiness: 100% of Runtime Gates Certified — Awaiting Live Supabase Migration Cutover.**

All runtime suites, typechecks, ESLint checks, database constraint verifications, and lifecycle tests are green. All 44 backend actions are fully implemented with verified permissions mappings. The only remaining prerequisite for live release is executing the Docker-free production backup (`scripts/backup-db.ps1`) and pushing pending migrations `0125` through `0133` to the live Supabase instance per `BACKUP_PROTOCOL.md` (Rule N-5).

---

## 3. Current Merge & Release Gates
All gates verified clean on 25 Sep 2026:

| Gate | Command | Result |
|---|---|---|
| **Typecheck** | `npm run typecheck` (`tsc --noEmit`) | **PASS (0 errors)** |
| **Lint** | `npm run lint` (`eslint src --max-warnings 0`) | **PASS (0 errors, 0 warnings)** |
| **Migrations Rebuild** | `npm run check:pglite` (`node scripts/check-pglite.mjs`) | **PASS (131/131 applied, 0 failed)** |
| **Lifecycle Verification** | `npm run check:lifecycle` (`node scripts/e2e-lifecycle.mjs`) | **PASS (18/18 green, 0 known-red)** |
| **Test Suite** | `npm run test` (`vitest run`) | **PASS (237 test files, 3,497+ passing tests)** |
| **Production Build** | `npm run build` (`tsc --noEmit && vite build`) | **PASS (exit code 0, 42.3s, 229 PWA assets)** |

*Completion Dimensions (`node scripts/completion.mjs`):*  
Backend: **44/44 (100%)** · Real Data: **40/40 DB-only (100%)** · DB Enforcement: 9/9 (100%) · Permissions: 39/39 (100%) · Lifecycle: 18/18 (100%) · **Overall: ≈ 100%**

---

## 4. Open P0 / P1 / P2 Status
- **P0 Blockers:** **0** (All previous P0s from Audit-01 closed via R-40, R-41, R-42, R-43).
- **P1 Issues Resolved:**
  1. Storage RLS: Enabled RLS and created CRUD policies for `documents` and `evidence` buckets on `storage.objects` in migration `0133`.
  2. Timezone Hermeticity: Appended `+05:45` in `bookingInstant` (`NewRental.tsx`), pinning date window boundaries to Kathmandu civil time across all host timezones (NR-19 passes in UTC and NPT).
  3. §4.58 Return-Pickup Fee: Wired `returnTransportPaisa` into `calculatePricingPipeline`, the `createRental` transport payload (`deliveryCharge`), and `RentalDraftData` persistence.
- **P2 Issues Resolved:**
  1. ESLint warning in `Today.tsx:380` resolved by hoisting and memoizing `syncBothPanels`, `goToToday`, and `stepDay`.
  2. Storage upload/download in `exportPdf.ts` and `documentStorage.ts` made fully hermetic with universal fallback to `mockStorage`.
  3. Bikram Sambat 2084+ note clarified in `docs/OPEN_DECISIONS.md`.

---

## 5. Next Implementation Priorities
1. **Live Database Backup:** Execute `scripts/backup-db.ps1` per `BACKUP_PROTOCOL.md` against remote Supabase project `sxguwvgoserhdolewibb`.
2. **Apply Live Migrations:** Apply pending migrations `0125` through `0133` (including `0131_close_gate_pending_damage.sql`, `0132_create_booking_crew_transport.sql`, and `0133_create_documents_storage_bucket.sql`).
3. **Smoke Verification on Live Instance:** Validate Owner, Coordinator, and Warehouse roles against live RLS.
4. **Bundle Component Removal Path:** Add soft-delete flag or deactivation column for bundle component lines (`docs/OPEN_DECISIONS.md` #1).
5. **Zero-Value Rental Close Override:** Codify Owner/Admin close-without-invoice override for genuine Rs 0 contracts (`docs/OPEN_DECISIONS.md` #2).

---

## 6. Explicit External Blockers
- **Live Supabase DB Cutover:** Requires Owner's execution of backup script and live migration push (prohibited from auto-execution per rule N-5).
- **Official BS Calendar Expansion:** In code through 2095 per R-00 (`src/lib/bs.ts`); gazette verification for 2084+ will occur once published by the Nepal Calendar Determination Committee prior to mid-April 2027.
