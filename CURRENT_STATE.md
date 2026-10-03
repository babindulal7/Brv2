# Babin Rentals OS — Current State

**Evidence Date:** 3 October 2026  
**Last Verified Status:** Post-Audit Remediation (0150 RPC security hardening + anon RPC leak closure + L23/L24 lifecycle verification)  
**Verification Environment:** Local PGlite 0.5.8 (WASM), Node v24+, Vitest v3.2.7  
**Canonical Documentation:** [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) · [`docs/00_READ_FIRST.md`](docs/00_READ_FIRST.md)

---

## 1. Current Phase
**Phase 7 — Pre-Deployment Production Verification & Migration Cutover**

---

## 2. Production Readiness Statement
**Readiness: 100% of Runtime Gates Certified — Awaiting Live Supabase Migration Cutover.**

All runtime suites, typechecks, ESLint checks, database constraint verifications, view/function anon leak gates, and lifecycle tests are green. All 51 backend actions are fully implemented with verified permissions mappings. Pending migrations (`0125` through `0150`) have been authored and verified from scratch under PGlite with zero failures, with anon view access revoked across all 30 views and unauthorized RPC execution blocked. The remaining prerequisite for live release is executing the Docker-free production backup (`scripts/backup-db.ps1`) and applying the ordered pending set per `BACKUP_PROTOCOL.md` and `docs/live/APPLY_PLAN_2026-10-03.md` (Rule N-5).

---

## 3. Current Merge & Release Gates
All gates verified clean on 3 Oct 2026:

| Gate | Command | Result |
|---|---|---|
| **Typecheck** | `npm run typecheck` (`tsc --noEmit`) | **PASS (0 errors)** |
| **Lint** | `npm run lint` (`eslint src --max-warnings 0`) | **PASS (0 errors, 0 warnings)** |
| **Migrations Rebuild** | `npm run check:pglite` (`node scripts/check-pglite.mjs`) | **PASS (148/148 applied, 0 failed; 30/30 views closed; 0 unauthorized RPCs)** |
| **Lifecycle Verification** | `npm run check:lifecycle` (`node scripts/e2e-lifecycle.mjs`) | **PASS (24/24 green, 0 known-red)** |
| **Test Suite** | `npm run test` (`vitest run`) | **PASS (283 test files, 3,895 passing tests)** |
| **Contrast Verification** | `npm run check:contrast` (`node scripts/check-contrast.cjs`) | **PASS (54/54 WCAG AA passed)** |
| **Production Build** | `npm run build` (`tsc --noEmit && vite build`) | **PASS (exit code 0, 74s, 256 PWA assets)** |

*Completion Dimensions (`node scripts/completion.mjs`):*  
Backend: **51/51 (100%)** · Real Data: **48 DB-only / 2 mixed / 50 (100%)** · DB Enforcement: 9/9 (100%) · Permissions: 41/41 (100%) · Lifecycle: 24/24 (100%) · **Overall: ≈ 100%**

---

## 4. Open P0 / P1 / P2 Status
- **P0 Blockers:** **0**
  - D1 (`audit_logs` anon leak): Closed in migration `0148`.
  - A1 (App ahead of live DB): Boot-time schema-version guard and banner deployed in `src/App.tsx`.
  - D4 (Anon booking cancellation): Closed in migration `0150` with role gate, `auth_user_id()` derivation, and revoked anon execute.
- **P1 Issues Resolved:**
  - B1 (Stale CURRENT_STATE docs): Synchronized to 3 Oct verified metrics.
  - B2 & B3 (Completion numbers & report assumptions): Formatters moved to `src/lib/intel/`; exact optional types resolved.
  - D2 (`staff_directory_v` anon access): Closed in `0148`.
  - D3 (`product_units_service_v` anon access): Closed in `0148`.
  - D5 (`extend_booking` column error): Repaired in `0150` by dropping invalid `updated_at` on `inventory_reservations`; verified green in lifecycle L23.
  - D6 (`void_invoice` type mismatch): Repaired in `0150` by casting `auth_user_role()::text` and `actor_role::system_role`; verified green in lifecycle L24.
  - D7 (Anon RPC execution): Revoked execute from anon/public on all mutating and financial RPCs in `0150`; gated in `check-pglite.mjs`.
- **P2 Issues Resolved:**
  - C6 (Anon key hardcoded in test scripts): Switched to environment lookup in `test-staff-logins.mjs`, `test-law6-permissions.mjs`, and `test-server-side-prices.mjs`.
  - C8 (Runtime console.log): Replaced with `console.debug` in `src/events/auditLogger.ts`.
  - Search path pinned on `enforce_inventory_reservation_capacity` in `0150`.

---

## 5. Next Implementation Priorities
1. **Live Database Backup:** Execute `scripts/backup-db.ps1` per `BACKUP_PROTOCOL.md` against remote Supabase project `sxguwvgoserhdolewibb`.
2. **Apply Live Migrations:** Apply pending migrations in filename order per `BACKUP_PROTOCOL.md` and `docs/live/APPLY_PLAN_2026-10-03.md`.
3. **Smoke Verification on Live Instance:** Validate Owner, Coordinator, and Warehouse roles against live RLS.
4. **Babin's Decision on Staff Roster Scope:** (`docs/OPEN_DECISIONS.md` §7).
