# Babin Rentals OS — Release Baseline Gate Audit

**Audit Date:** 2026-10-13T03:40:00+05:45 (Nepal Time, Asia/Kathmandu)  
**Auditor / Integration Agent:** TestingRealityChecker (`agency-reality-checker`)  
**Environment:** Local checkout (PGlite 0.5.8 in-process Postgres, Node v24, Vitest v1.6.1, Vite 5)  
**Status:** **HOLD** (Local gates green; live Supabase RLS/JWT and production promotion unverified/unauthorized)  

---

## 1. Environment & Source State

- **OS / Shell:** Windows 10/11, PowerShell
- **Node / npm:** Node.js v24.x, npm v10.x
- **Git Branch:** `main` (clean baseline execution)
- **Database Engine:** PGlite 0.5.8 (PostgreSQL 18.3 on wasm32-unknown-emscripten)
- **Live Supabase:** Unconnected in this run (no JWT / PostgREST live session)

---

## 2. Mandatory Gate Execution Summary

| Order | Command | Exit Code | Recorded Result / Scope | Status |
|:-----:|:--------|:---------:|:------------------------|:------:|
| 1 | `npm run typecheck` | 0 | `tsc --noEmit` — 0 errors | **PASS** |
| 2 | `npm run lint` | 0 | `eslint src --max-warnings 0` — 0 errors, 0 warnings | **PASS** |
| 3 | `npm run lint:shell` | 0 | 650 files checked; all satisfy PageHeader, single primary CTA, 44px floor, no dev notes | **PASS** |
| 4 | `npm run lint:ui-copy` | 0 | 0 developer-text violations; 4/4 copy tests pass | **PASS** |
| 5 | `npm run lint:progress` | 0 | `PROGRESS.md` newest entry carries Completion and Remaining blocks | **PASS** |
| 6 | `npm run check:contrast` | 0 | 54/54 color contrast combinations pass WCAG AA (light + dark) | **PASS** |
| 7 | `npm run check:fixtures` | 0 | 640 production files scanned; 0 test fixture imports | **PASS** |
| 8 | `npm run check:pglite` | 0 | 160/160 migrations applied from scratch; 30 views non-anon; 20 public RPCs authorized; 66 definer search_paths pinned | **PASS** |
| 9 | `npm run check:lifecycle` | 0 | 30/30 booking lifecycle steps green through real Postgres + RLS | **PASS** |
| 10 | `npm test` | 0 | 338 test files passed; 4,309/4,309 tests passed | **PASS** |
| 11 | `npm run build` | 0 | `tsc --noEmit && vite build` → `dist/`; PWA precache 298 entries (7,581 KiB) | **PASS** |

---

## 3. Optional Additional Gate Verification

| Command | Exit Code | Result | Status |
|:--------|:---------:|:-------|:------:|
| `npm run check:anon` | 0 | 20 callable functions, 130 tables RLS on, 0 view leaks, cancel/extend/void mutations denied to anon and restricted roles | **PASS** |
| `npm run test:audit-coverage` | 0 | 4 tables (`products`, `stock_transfers`, `purchase_requests`, `cleaning_queue_entries`) insert/update audit triggers verified immutable | **PASS** |
| `npm run test:race` | 0 | Sequential & concurrent reservation conflict tests verified against GiST exclusion constraint (`inventory_reservations`) | **PASS** |
| `npm run completion` | 0 | Mean of 5 dimensions: ≈ 99% (Backend 52/52, DB surfaces 51/53, DB gates 9/9, Permissions 42/42, Lifecycle 30/30) | **PASS** |

---

## 4. Key Findings

1. **Local Build & Type Safety:** The codebase is fully synchronized. Zero TypeScript or ESLint errors exist across all active application modules.
2. **Database Invariants:** All 160 database migrations replay cleanly in in-process Postgres (`PGlite`). No security or definer search_path leaks detected.
3. **Lifecycle Integrity:** The 30 lifecycle steps correctly enforce half-open interval reservations, custody transitions, money-blind role filtering, and immutable payment records.
4. **Current Defect Horizon:** The 64px single-header standard overflows on small viewports (<768px, specifically 360px–390px) on `Calendar`, `Finance`, `Operations`, and `Settings`.
5. **Release Hold:** In compliance with N-5, live promotion is on HOLD until staging PostgREST/JWT verification and Owner authorization are completed.
