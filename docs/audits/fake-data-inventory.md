# Babin Rentals OS — Fake/Mock/Demo Data Inventory

**Generated:** 2026-10-05  
**Scope:** Full repository audit of all fake/mock/demo/sample business data sources  
**Goal:** Remove all invented business records from production paths; show only genuine persisted data or honest empty states

---

## Executive Summary

The repository contains **three distinct categories** of fake data that leak into production paths:

| Category | Location | Risk Level | Status |
|----------|----------|------------|--------|
| **Runtime Mock Mode** | `src/lib/mock/`, `src/lib/supabase.ts` | 🔴 **CRITICAL** — `VITE_DATA_SOURCE=mock` builds a production bundle serving 13 tables of fake clients, bookings, invoices, payments, products, units, deposits, audit events | Active in `dev:mock`, `build:mock` |
| **Seed Migration 0047** | `supabase/migrations/0047_seed_reference_corpus.sql` | 🔴 **CRITICAL** — 3,800+ lines inserting fake clients, products, bookings, invoices, payments, deposits, units, audit events | **NOT APPLIED** to live (per header), but exists as migration |
| **Seed Migration 0082 (was 0076)** | `supabase/migrations/0082_seed_operational_stage_corpus.sql` | 🔴 **CRITICAL** — **ALREADY APPLIED TO LIVE** (31 Aug 2026) — inserted 46 bookings (B-900..B-945) with fake operational data | **LIVE IN PRODUCTION** |

**Additionally:** Reference seed `0012_seed_data.sql` inserts **legitimate configuration** (branches, warehouses, roles, fiscal year, bank accounts, expense categories, equipment categories) — **KEEP THIS**, it is not fake business data.

---

## 1. Runtime Mock Mode (src/lib/mock/)

### Files
| File | Size | Purpose |
|------|------|---------|
| `src/lib/mock/client.ts` | 50 KB | Drop-in Supabase client replacement; serves fake data from corpus + localStorage mutation overlay |
| `src/lib/mock/corpus.ts` | 36 KB | Transforms `seed.ts` output into snake_case DB rows; serves 13 tables, lists 11 unserved tables |
| `src/lib/mock/engine.ts` | 26 KB | Query engine (filters, joins, pagination, ordering) over in-memory store |
| `src/lib/mock/recordEditor.ts` | 6 KB | Mutation persistence to localStorage |
| `src/lib/mock/storage.ts` | 11 KB | Mock Supabase Storage bucket/object API |
| `src/lib/seed.ts` | 100 KB | **Source of truth** — generates deterministic fake corpus (clients, products, bookings, invoices, payments, etc.) |
| `src/lib/seedCompact.ts` | 18 KB | Transport form of seed for live seeding |

### Activation
- Controlled by `VITE_DATA_SOURCE` env var (build-time inlined by Vite)
- `dev:mock` / `build:mock` → `VITE_DATA_SOURCE=mock` (via `.env.mock`)
- `dev` / `build` → `VITE_DATA_SOURCE=live` (default)

### Tables Served by Mock Corpus (13)
| Table | Row Count (approx) | Fake Data Type |
|-------|-------------------|----------------|
| `clients` | 40 | Fake companies, contacts, addresses, KYC, payment terms |
| `products` | 22 | Camera, lens, lighting, audio, grip, support equipment |
| `product_units` | 125 | Serialized units with fake serial numbers, conditions, locations |
| `bookings` | 120 | Fake rental bookings across all stages (Quote→Closed) |
| `booking_lines` | 89 | Equipment lines with fake rates, quantities, discounts |
| `booking_discounts` | 64 | Manual/Volume/Seasonal discount lines |
| `booking_crew_lines` | 93 | Crew assignments with fake rates |
| `booking_stage_transitions` | 130 | Stage history with fake timestamps |
| `invoices` | 93 | Draft/Sent/Partially Paid/Paid/Void invoices |
| `invoice_lines` | 89 | Invoice line items |
| `payments` | 125 | Cash/Bank/Digital/Adjustment payments |
| `deposit_movements` | 89 | Security deposit holds/releases |
| `security_deposits` | 40 | Deposit records linked to bookings |

### Tables NOT Served (11 — show as empty in mock mode)
- `expenses`, `membership_plans`, `operation_sessions`, `cleaning_queue_entries`
- `client_flags`, `payment_reversals`, `external_refs`, `external_invoices`
- `sync_conflicts`, `sync_outbox`

### Code Paths Using `IS_MOCK`
| File | Lines | Behavior |
|------|-------|----------|
| `src/lib/supabase.ts` | 44, 77 | Exports mock client when `IS_MOCK=true` |
| `src/lib/dataAccess.ts` | 14, 41 | Disables offline queue in mock mode |
| `src/lib/schemaGuard.ts` | 2, 214, 253, 257 | Skips schema check in mock mode |
| `src/lib/smartHoverLoaders.ts` | 9, 398 | Returns empty for intel cards in mock mode |
| `src/lib/auth.tsx` | 2, 411, 437, 488, 520 | Mock sign-in, profile, PIN, reset |
| `src/lib/documentStorage.ts` | 2 | Uses mock storage |
| `src/lib/evidenceStorage.ts` | 2 | Uses mock storage |

---

## 2. Seed Migration 0047 — Reference Corpus (NOT Applied to Live)

**File:** `supabase/migrations/0047_seed_reference_corpus.sql` (3,800+ lines)

**Generated from:** `src/lib/seed.ts` via `npm run seed:sql`

**Tables Populated (14):**
| Table | Rows | Notes |
|-------|------|-------|
| `clients` | 40 | Fake client records with codes CL-1..CL-40 |
| `products` | 22 | Equipment catalog |
| `product_units` | 125 | Serialized units |
| `bookings` | 120 | Full booking lifecycle |
| `booking_lines` | 89 | Equipment lines |
| `booking_discounts` | 64 | Discount lines |
| `booking_crew_lines` | 93 | Crew assignments |
| `booking_line_units` | 64 | Unit allocations |
| `booking_stage_transitions` | 130 | Stage history |
| `invoices` | 93 | Invoice records |
| `invoice_lines` | 89 | Invoice lines |
| `payments` | 125 | Payment records |
| `deposit_movements` | 89 | Deposit movements |
| `security_deposits` | 40 | Security deposits |
| `audit_events` | 93 | Audit trail |

**Header Warning:** "Re-applying is NOT a no-op — it is a one-shot seed that FAILS CLOSED... Apply it ONCE, into a database that has never held it"

**Status:** Explicitly **NOT APPLIED** to live per header. Exists as migration file only.

---

## 3. Seed Migration 0082 — Operational Stage Corpus (APPLIED TO LIVE)

**File:** `supabase/migrations/0082_seed_operational_stage_corpus.sql` (12 KB)

**History:** Originally written as 0074, renumbered to 0076, applied 31 Aug 2026 as `20260831141204 0076_seed_operational_stage_corpus`

**Applied to Live:** YES — "Result, measured immediately after: bookings 200 → 246"

**Data Inserted:**
- 46 bookings (B-900 through B-945)
- Stages: Packed (16), Booked (30), with pickup dates centered on application date
- **Purpose:** Fix empty "Going out" dashboard panel

**Critical Issue:** Uses `current_date` at apply time, so dates age. Not self-refreshing. Live production database now contains these 46 fake bookings.

---

## 4. Reference Seed 0012 — LEGITIMATE CONFIGURATION (KEEP)

**File:** `supabase/migrations/0012_seed_data.sql`

**Content (ALL LEGITIMATE - DO NOT REMOVE):**
| Section | Tables | Purpose |
|---------|--------|---------|
| Number Sequences | `number_sequences` | Booking/Client/Invoice/Payment/Deposit/Expense/Equipment prefixes |
| Branches | `branches` | Kathmandu HQ + Pokhara Branch |
| Warehouses/Zones | `warehouses`, `storage_zones` | Physical locations |
| Users | `users` | 4 system users (Owner, Manager, Warehouse, Billing) |
| Fiscal Periods | `fiscal_periods` | Nepali FY 2083/84 |
| Bank Accounts | `bank_accounts` | Nabil Bank + eSewa |
| Expense Categories | `expense_categories` | Maintenance, Fuel, Sub-rental, Utilities |
| Equipment Categories | `inventory_categories` | Camera, Lens, Lighting, Audio, Grip, Support |

**Uses:** `ON CONFLICT DO NOTHING` — idempotent, safe to re-apply.

---

## 5. Hardcoded Fallbacks & Demo Data in Components

### Search Results (Partial)
| Pattern | Files Found | Risk |
|---------|-------------|------|
| `?? mockData` / `?? demoData` | Need to search | Fallback to fake data |
| `useState([...mock...])` | Need to search | Local fake state |
| `Math.random()` for financial data | Need to search | Non-deterministic fake |
| `localStorage` fallback data | Need to search | Stale fake data |

### Dashboard/KPI Components (Need Verification)
- `src/modules/today/` — Today page
- `src/modules/reports/` — All report modules
- `src/modules/calendar/` — Calendar views
- `src/modules/finance/` — Finance dashboards

---

## 6. Test Fixtures (ISOLATED — KEEP IN TEST PATHS)

| Path | Purpose | Production Risk |
|------|---------|-----------------|
| `src/lib/mock/__tests__/` | Mock engine tests | None — test-only |
| `src/data/__tests__/` | Data layer tests | None — test-only |
| `src/__tests__/e2e/` | E2E tests | None — test-only |
| `src/actions/**/__tests__/` | Action tests | None — test-only |
| `vitest.config.ts` | Test config | None — test-only |

**Note:** Test fixtures must remain in test paths only. Ensure no test imports leak into production bundles.

---

## 7. Environment Configuration

### Current Env Files
| File | VITE_DATA_SOURCE | Purpose |
|------|-----------------|---------|
| `.env.mock` | `mock` | Development mock mode |
| `.env.mock.local` | (empty) | Local overrides |
| `.env.example` | (empty) | Template for live |
| `.env.local` | (user-defined) | Live credentials |
| `.env.localdb.local` | (localdb) | Local PGlite testing |

### Build Commands
| Command | Mode | VITE_DATA_SOURCE | Production Safe? |
|---------|------|-----------------|------------------|
| `npm run build` | production | `live` (default) | ✅ YES |
| `npm run build:mock` | production | `mock` | ❌ **NO** — builds fake data bundle |
| `npm run dev` | dev | `live` (default) | ✅ YES |
| `npm run dev:mock` | dev | `mock` | Dev only |
| `npm run dev:local` | dev | `localdb` | Dev only |

---

## 8. Action Plan — Classification by Task

### A. Code Changes (Safe — No DB Writes)
| Task | Files | Description |
|------|-------|-------------|
| **A1** | `src/lib/supabase.ts` | Remove mock client export from production build; `IS_MOCK` must be `false` in production |
| **A2** | `src/lib/mock/` | Move entire directory to `src/lib/__mocks__/` (Jest/Vitest convention) or delete; ensure no production imports |
| **A3** | `src/lib/seed.ts`, `seedCompact.ts` | Move to `scripts/seed/` or `tests/fixtures/`; not importable from app code |
| **A4** | `package.json` | Remove `build:mock` script or rename to `build:test` with clear warning |
| **A5** | `.env.mock` | Rename to `.env.mock.example` or delete; mock mode must be opt-in via explicit flag |
| **A6** | Components using `IS_MOCK` | Replace mock branches with proper empty/error/loading states |
| **A7** | `src/lib/dataAccess.ts` | Remove `IS_MOCK` branch; offline queue always active for real data |
| **A8** | `src/lib/schemaGuard.ts` | Remove `IS_MOCK` shortcut; real schema check always runs |

### B. Database Cleanup (Destructive — Requires Approval)
| Task | Target | Description |
|------|--------|-------------|
| **B1** | `0047_seed_reference_corpus.sql` | **DELETE** migration file (not applied to live) |
| **B2** | `0082_seed_operational_stage_corpus.sql` | **MANIFEST** 46 fake bookings (B-900..B-945) for human review; prepare deletion script |
| **B3** | Live DB audit | Query for seeded bookings by `booking_no` pattern `B-9[0-4][0-9]` and related rows |

### C. Verification & Tests
| Task | Description |
|------|-------------|
| **C1** | Add test: fresh tenant shows empty states everywhere |
| **C2** | Add test: no mock imports in production bundle |
| **C3** | Add test: Dashboard/Reports/Calendar/Finance show empty states correctly |
| **C4** | Run full test suite, lint, typecheck, build |
| **C5** | Verify RLS/security gates unaffected |

---

## 9. Detailed File-to-Real-Source Mapping

### Clients Module
| Fake Source | Real Source | Action |
|-------------|-------------|--------|
| `src/lib/mock/corpus.ts` → `clients` table | `src/data/clients.ts` → `clients_v` view / `clients` table | Remove mock; use real query |
| `0047` seed clients | Same | Delete seed migration |

### Inventory Module
| Fake Source | Real Source | Action |
|-------------|-------------|--------|
| `src/lib/mock/corpus.ts` → `products`, `product_units` | `src/data/inventory.ts` → `products_v`, `product_units_v` | Remove mock |
| `0047` seed products/units | Same | Delete seed migration |
| `0012` equipment categories | **KEEP** — legitimate config | No change |

### Rentals/Bookings Module
| Fake Source | Real Source | Action |
|-------------|-------------|--------|
| `src/lib/mock/corpus.ts` → `bookings`, lines, discounts, crew | `src/data/rentals.ts`, `src/data/booking.ts` → views | Remove mock |
| `0047` seed bookings | Same | Delete seed migration |
| `0082` live fake bookings (B-900..B-945) | Same | **Manifest for deletion approval** |

### Calendar Module
| Fake Source | Real Source | Action |
|-------------|-------------|--------|
| Mock bookings + `0082` fake bookings | `src/data/calendar.ts` → `bookings` + `booking_stage_transitions` | Remove fake; query real |

### Finance/Reports Module
| Fake Source | Real Source | Action |
|-------------|-------------|--------|
| Mock invoices, payments, deposits | `src/data/invoiceIntel.ts`, `src/data/paymentIntel.ts`, `src/data/finance/*.ts` | Remove mock; compute from real |
| `0047` seed invoices/payments/deposits | Same | Delete seed migration |

### Maintenance/Operations Module
| Fake Source | Real Source | Action |
|-------------|-------------|--------|
| Mock bookings with stage transitions | `src/data/operations.ts`, `src/data/maintenance.ts` | Remove mock |

### Crew/Delivery Module
| Fake Source | Real Source | Action |
|-------------|-------------|--------|
| `booking_crew_lines` mock data | `src/data/crew.ts`, `src/data/crewIntel.ts` | Remove mock |

---

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `build:mock` accidentally run for production | Medium | 🔴 High — ships fake data bundle | Remove script; gate on `NODE_ENV=production` |
| `VITE_DATA_SOURCE=mock` in production env | Low | 🔴 High | Document: production must never have this |
| 0047 applied to live by mistake | Low | 🔴 High | Header warns; migration not in applied list |
| 0082 fake bookings remain in live | **Certain** | 🟡 Medium | Already live; need approved deletion manifest |
| Test fixtures leak to production bundle | Low | 🟡 Medium | Verify `vitest.config.ts` excludes from build |
| Empty states not implemented | Medium | 🟡 Medium | Implement per module spec in task |

---

## 11. Next Steps

1. **Immediate:** Create this inventory document ✅
2. **Code cleanup (A1-A8):** Remove mock from production paths
3. **Database manifest (B1-B3):** Document 0082 fake rows for approval
4. **Verification (C1-C5):** Add tests, run full suite
5. **Deliver:** `docs/audits/fake-data-candidates.csv` (for 0082), cleanup results

---

## Appendix: Seed.ts Corpus Details (from buildCorpus)

```typescript
// SeedCorpus structure returned by buildCorpus():
{
  branches: BranchSpec[],           // 2 (from 0012)
  warehouses: WarehouseSpec[],      // 2 (from 0012)
  users: UserSpec[],                // 4 (from 0012)
  categories: CategorySpec[],       // 6 (from 0012)
  bankAccounts: BankAccountSpec[],  // 2 (from 0012)
  expenseCategories: ExpenseCatSpec[], // 4 (from 0012)
  fiscalPeriods: FiscalPeriodSpec[],  // 1 (from 0012)
  
  // GENERATED FAKE DATA (13 tables):
  clients: ClientSpec[],            // 40
  products: ProductSpec[],          // 22
  productUnits: ProductUnitSpec[],  // 125
  bookings: BookingSpec[],          // 120
  bookingLines: BookingLineSpec[],  // 89
  bookingDiscounts: DiscountSpec[], // 64
  bookingCrewLines: CrewLineSpec[], // 93
  bookingLineUnits: UnitLineSpec[], // 64
  stageTransitions: TransitionSpec[], // 130
  invoices: InvoiceSpec[],          // 93
  invoiceLines: InvoiceLineSpec[],  // 89
  payments: PaymentSpec[],          // 125
  depositMovements: DepositSpec[],  // 89
  securityDeposits: DepositSpec[],  // 40
}
```

All fake data is deterministic (seeded by string keys via MD5) — same every boot.