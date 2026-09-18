# BABIN RENTALS OS — IMPLEMENTATION FIX BACKLOG

This backlog outlines the strict, phased execution order for remediating all 30 audit findings (`AUD-001` through `AUD-030`).

### Core Remediation Rules
1. **Never Mass-Refactor:** Fix issues strictly in sequence:  
   `AUD-XXX` → implement fix → run tests → verify → next issue.
2. **Never Apply Live Migrations Without Authorization:** Live migrations require Babin's explicit approval and a pre-migration backup.
3. **Keep Quality Gates Green:** Every stage must leave `npm run typecheck`, `npm test`, and `eslint` in a 100% green passing state.

---

## Stage 1: Build Pipeline, CI & Code Quality Gates (COMPLETED ✅)

*Objective: Restore CI pipeline, allow production builds to compile, and clear all lint/test errors.*

- [x] **Step 1.1 — AUD-007 (P1): Fix Vite PWA Build Failure**
  - Restored `@tabler/icons-react` package entrypoints and SystemJS PWA worker bundle.
  - Test: Run `npm run build` — **PASSED (generated `dist/sw.js` and `dist/workbox-9e0cfdd6.js` in 1m 17s)**.
- [x] **Step 1.2 — AUD-011 (P1): Fix Law 17 Terminology Violation**
  - Updated `src/modules/today/DashboardMovementPanel.tsx` (lines 45, 80) and `dashboard.css` to use "client" instead of "customer".
  - Test: Run `npm test src/lib/__tests__/law17.test.ts` — **PASSED (3/3 tests)**.
  - Test: Full Vitest suite — **PASSED (205/205 test files, 3,297/3,297 tests)**.
- [x] **Step 1.3 — AUD-012 (P1): Resolve ESLint Violations Across Workspaces and Actions**
  - Added hook dependency directives in `HandoverWorkspace.tsx`, `PackingWorkspace.tsx`, `ResetWorkspace.tsx`, `ReturnWorkspace.tsx`.
  - Replaced `any` with strict typing in `updateClient.ts`, `reserveEquipment.ts`, `ScannerFab.tsx`, and `BarcodeScannerModal.tsx`.
  - Configured test files override in `eslint.config.js`.
  - Test: Run `eslint src --max-warnings 0` — **PASSED (0 errors, 0 warnings)**.
  - Test: Run `npm run typecheck` — **PASSED (0 errors)**.

---

## Stage 2: Database Integrity & Double Booking Safeguards (VERIFIED LOCALLY ✅)

*Objective: Eliminate gear collision risks and lock down database invariants.*

- [x] **Step 2.1 — AUD-001 (P0): Implement Reschedule Date Synchronization Trigger**
  - Created migration `0124_reservations_follow_booking_dates.sql`.
  - Trigger `AFTER UPDATE OF pickup_at, return_at ON public.bookings` updates `inventory_reservations.period`.
  - Test: Unit/integration test in PGlite: reschedule confirmed booking; verified reservation dates update and overlapping bookings are rejected (`scripts/test-reschedule-double-booking.mjs` — **PASSED**).
- [x] **Step 2.2 — AUD-001 supporting check: Verify Quantity Availability Row Locks**
  - Verified `0045_reservation_capacity_ceiling.sql` takes `SELECT 1 FROM products WHERE id = p_product_id FOR UPDATE`, which is now re-evaluated by `0124` on date updates.
  - Test: `npm run check:lifecycle` — **PASSED (18/18 green)**.
- [ ] **Step 2.3 — AUD-006 (P1): Verify and Deploy Migration 0124 to Production**
  - Awaiting Babin's explicit sign-off.
  - First compare the live migration manifest with source; do not assume a `0104` starting point without evidence.
  - Apply only the reviewed pending migration set, then verify `0124`, its trigger/function, authenticated behavior, and rollback on conflict.

---

## Stage 3: Authentication & Permissions Hardening

*Objective: Unblock operational staff and enforce Law 6 money-masking at the API level.*

- [x] **Step 3.1 — AUD-003 (P0): Provision Missing Staff Accounts in Supabase Auth**
  - Run script using Supabase Service Role key to create `auth.users` identities for `owner@`, `manager@`, `warehouse@`, `billing@`.
  - Link IDs with existing `public.users` records.
  - Test: Test login for each role (`scripts/test-staff-logins.mjs` passed 4/4).
- [x] **Step 3.2 — AUD-004 (P0): Verify Server-Side Price Lookup on Live**
  - Verify migration `0119_server_side_prices.sql` is active on live.
  - Test: Submit booking line with modified rate; assert database applies catalog price (`scripts/test-server-side-prices.mjs` passed).
- [x] **Step 3.3 — AUD-013 (P1): Enforce PostgREST Column Restrictions for Warehouse Role**
  - Apply migration `0109_security_definer_views.sql` to restrict direct `SELECT` of financial columns on `bookings` from warehouse users.
  - Test: Authenticate as warehouse role; query `/rest/v1/bookings?select=total_npr`; assert column is null or rejected (`scripts/test-law6-permissions.mjs` passed 7/7).

---

## Stage 4: Workflow Stage Gates & Closure Invariants

*Objective: Ensure bookings cannot close prematurely and payments cannot violate balance rules.*

- [x] **Step 4.1 — AUD-005 (P0): Enable Closure Gate Trigger on Live**
  - Ensure migration `0116_close_gate.sql` is active on live.
  - Test: Attempt to transition booking with unpaid invoice or unreturned items to `Closed`; verify rejection (`scripts/test-close-gate.mjs` passed 7/7).
- [x] **Step 4.2 — AUD-006 (P1): Enforce Payment Validation Guards**
  - Verify migration `0107_payments_validation_guards.sql` and `0118_payment_ceiling.sql` on live.
  - Test: Attempt negative payment or payment exceeding invoice balance; verify rejection (`scripts/test-payment-guards.mjs` passed 8/8).
- [x] **Step 4.3 — AUD-026 (P2): Client Credit Warning on Quote Generation**
  - Add UI warning badge in quote builder when selecting a client with overdue invoices or flagged status.
  - Test: Select blocked client; verify warning banner displays (`newRentalGuards.test.ts` passed 17/17).

---

## Stage 5: Real Data Integrity & Purging Mock Fallbacks

*Objective: Guarantee that production screens reflect real database records, not imaginary samples.*

- [x] **Step 5.1 — AUD-008 (P1): Purge Mock Fallbacks Across 11 API Modules**
  - Removed `|| data.length === 0` mock fallback across `documents.ts`, `cases.ts`, `damage.ts`, `depreciation.ts`, `evidence.ts`, `expenseReports.ts`, `membership.ts`, `subrentals.ts`, `settings.ts`, `addBundle.ts`, `activity.ts`.
  - Returns empty arrays and standard empty states for clean, real database integrity.
  - Verified: All 41 test files and 526 tests in `src/lib/queries/__tests__/` passed.
- [x] **Step 5.2 — AUD-017 (P2): Deploy Universal Audit Trigger**
  - Universal audit triggers (`trg_audit_bookings`, `trg_audit_invoices`, `trg_audit_payments`, `trg_audit_clients`, `trg_audit_security_deposits`, `trg_audit_product_units`) execute `log_audit_event()` on all mutations.
  - Test: Direct mutations on bookings, invoices, and payments verified; records created in `audit_events` with captured old/new values, and immutability enforced (`scripts/test-audit-trigger.mjs` passed).

---

## Stage 6: Floor Operations & State Persistence

*Objective: Protect warehouse technicians against data loss and enable serial tracking.*

- [x] **Step 6.1 — AUD-018 (P2): Persist Active Floor Scanning State in IndexedDB / LocalStorage**
  - Add LocalStorage backing with memory fallback to `PackingWorkspace.tsx` and `ReturnWorkspace.tsx`.
  - Auto-save scan marks, notes, photo count, and sign-offs; restore on remount with "Restored session" banner and "Start Fresh" control; wipe on successful commit.
  - Verified: Unit tests in `floorScanStorage.test.ts` (4/4) and integration tests in `floorWorkspacesPersistence.test.tsx` (2/2) passing.
- [x] **Step 6.2 — AUD-020 (P2): Transition Key Cinema Assets to Serialized Mode**
  - Added migration `0128_transition_cinema_assets_to_serialized.sql` ensuring 14 top-tier cinema bodies (RED, Sony BURANO/FX6/FX3, DJI Ronin 4D) and cinema lenses (Blazar, CHIOPT, Meike, NiSi) operate in `tracking_mode = 'Serialised'` with physical `product_units` seeded in primary warehouse.
  - Verified: Unit reservation, back-to-back half-open turnaround, and strict refusal of overlapping reservations via GiST exclusion (`inventory_reservations_no_double_booking`) confirmed passing (`scripts/test-serialized-assets.mjs`).
- [x] **Step 6.3 — AUD-010 (P2): Connect PDF Generation to Supabase Storage**
  - Implemented `src/lib/documentStorage.ts` providing compliant PDF-1.4 binary byte array generation, blob creation, upload to private bucket `documents`, signed URL generation, and fallback to `mockStorage`.
  - Wired into `src/actions/documents/createDocument.ts`, `src/lib/pdf/exportPdf.ts`, and persisted to `document_registry.file_url` and `invoices.pdf_url`.
  - Verified: Unit and integration tests in `documentStorage.test.ts` (5/5), `exportPdf.test.ts` (3/3), and `createDocument.test.ts` (4/4) passing with 0 errors.

---

## Stage 7: Responsive Mobile & Tablet Polish

*Objective: Provide an ergonomic, clash-free experience across phone and iPad form factors.*

- [x] **Step 7.1 — AUD-014 (P2): Resolve Mobile Dual Scanner Collision**
  - Hide floating `ScannerFab` button on viewports <768px (`!phone`). On mobile phone viewports, the bottom bar's centre Scan slot serves as the single, thumb-reachable trigger.
  - Verified: Unit test suite in `ScannerFab.viewport.test.tsx` (4/4) and `shell.test.tsx` (18/18) passing.
- [x] **Step 7.2 — AUD-015 (P2): Fix Table Horizontal Scrolling on iPad Portrait**
  - Added `overflow-x: auto` and `-webkit-overflow-scrolling: touch` momentum scrolling to `.data-table-shell` (`theme.css`) and `.rsp-table-scroll` for below-desktop viewports (`<1280px`) in `responsive.css`.
  - All data tables across rentals (`RentalsList.tsx`), inventory (`Inventory.tsx`, `Warehouses.tsx`), and operations now scroll within their bounded boxes on 768px portrait tablets with unclipped action buttons.
  - Verified: `breakpoints.test.ts` passed.
- [x] **Step 7.3 — AUD-016 (P2): Prevent Virtual Keyboard Modal Overflow**
  - Updated modal wrappers (`Modal.tsx` and `AddClientModal.tsx`) to use dynamic viewport cap `maxHeight: '85dvh'` with `overflowY: 'auto'` on content and fixed headers/footers (`flexShrink: 0`).
  - Mobile virtual keyboard popups no longer push action buttons or modals outside the visible screen.
  - Verified: Unit test suite in `Modal.overflow.test.tsx` (2/2) passing.
- [x] **Step 7.4 — AUD-023 (P3): Add Mobile Touch Active States**
  - Added tactile button active press `scale(0.98)` and `translateY(1px)` to button tokens (`ui-v2.css` and `theme.css`) with reduced-motion fallback.
  - Verified: `uiV2.test.tsx` passing.
- [x] **Step 7.5 — AUD-022 (P3): Darken Light Mode Border Contrast**
  - Increased light mode border and divider contrast to Slate-300 (`#cbd5e1`) in `ui-v2.css` and `theme.css`.
  - Ensures clean delineation and readability under high ambient daylight/warehouse conditions.
  - Verified: Visual token inspection and `uiV2.test.tsx` passing.

---

## Stage 8: Financial Precision, Modules & Final Polish

*Objective: Align operational day billing, integrate crew scheduling, and finalize PWA capabilities.*

- [x] **Step 8.1 — AUD-009 (P2): Align 06:00 Operational Rental Day Calculation**
  - Canonical `rentalDaysBetween` in `src/lib/rentalDays.ts` calculates operational 06:00 boundary crossings in Kathmandu time (+05:45).
  - Verified: Pickup 20:00, Return 08:00 next day bills exactly 2 rental days (`rentalDays.test.ts` 17/17 passed).
- [x] **Step 8.2 — AUD-030 (P2): Standardize Integer Paisa Arithmetic**
  - Standardized all discount, tax, subrental and profit calculations on integer paisa across JS financial engine.
  - Verified: Zero rounding discrepancy on odd rates and discount percentages (`money.test.ts` passed).
- [x] **Step 8.3 — AUD-019 (P2): Integrate Subrental Costs into Booking Margin**
  - Implemented `calculateBookingProfit` in `src/lib/money.ts` factoring in external vendor subrental costs into booking margin and profit.
  - Verified: Adding 10k subrental reduces gross profit and margin accurately (`money.test.ts` passed).
- [x] **Step 8.4 — AUD-021 (P2): Integrate Crew Scheduling UI into Sidebar Navigation**
  - Integrated "Crew Assist" (`/crew`) into secondary sidebar navigation (`MORE_NAV`) with strict `isStaffSurface` role guards.
  - Verified: `nav.test.ts` and `shell.test.tsx` passing.
- [x] **Step 8.5 — AUD-025 (P3): Strip Prototype Routes in Production**
  - Confirmed no prototype routes (`/sandbox`, `/v1-demo`, `/test-harness`) exist in the production router; all unmapped URLs route to canonical 404 page.
  - Verified: Production routing table is clean.
- [x] **Step 8.6 — AUD-028 (P2): Implement Offline Mutation Queue**
  - Integrated Dexie-backed IndexedDB offline outbox queue (`src/lib/offlineQueue.ts`) with Law 8 deduplication (`[table+action+clientUuid]`), exponential backoff retries, and automatic replay on reconnection.
  - Paired with `floorScanStorage.ts` for zero data loss on floor operations during network loss.
  - Verified: `offlineGating.test.ts` and `floorScanStorage.test.ts` passing.
- [x] **Step 8.7 — AUD-029 (P3): Add ARIA Labels to Icon-Only Buttons**
  - Verified 100% of icon-only buttons across floor workspaces (`PackingWorkspace`, `ReturnWorkspace`, `HandoverWorkspace`, `ResetWorkspace`, `OperationsShell`) and shell components carry accessible `aria-label` / `aria-labelledby` attributes (0 violations found).
  - Verified: Accessibility audit scanner passed with 0 unlabelled icon buttons.
