# BABIN RENTALS OS — FULL SYSTEM AUDIT REPORT

**Date:** 3 September 2026 · **Commit at audit start:** `6c978a5` (branch `step1-foundation`) · **Spec:** Master Engineering Audit Specification v1.0 (65 sections)
**Method:** (a) live database read-only over MCP as `postgres` — catalog, triggers, constraints, grants, row counts; (b) the §44 critical user journey **driven end to end in the running app** (`dev:mock`, Owner session) with the mock's overlay store read after every step as the database-reality proxy; (c) `npm run build`, `lint`, `test`, `tsc`, `npm audit` run from this tree; (d) static tracing UI → handler → action → RPC → trigger with `file:line`; (e) an eleven-auditor read-only workflow with adversarial refutation of every P0/P1 — **one cluster complete at time of writing** (`operations-ux`); the rest are folded in as they land and are marked *pending* below.
**Nothing was changed.** No migration applied, no live row written, no server restarted, no secret printed.

> **Read `DOC_STATUS.md` first.** An audit is a measurement with a date on it. Everything here is dated 3 Sep 2026; `PROGRESS.md` is newest-first and will overtake it.

---

## 1. Executive summary

**Verdict: NOT READY.**

Babin Rentals OS has an unusually strong spine and a missing heart. The spine is real: 124 tables, every one under RLS; 43 database triggers armed, including immutability on payments and audit rows, forward-only stage transitions, a live `inventory_reservations` exclusion constraint against double-booking, and audit triggers that have already written 5,424 `audit_events` rows. The rental lifecycle **Quote → Booked → Packed → On Rent → Returned works end to end in the running app** — I created a client, priced a rental to the rupee, confirmed it (two reservations written at Confirm, exactly as ruled), packed it, handed it over, returned it with one item marked Damaged, and watched each stage land as a `booking_stage_transitions` row.

The heart is money, and it is absent. **No invoice can be created anywhere in the application** — `Finance.tsx:539` says so in its own words: "Create Invoice and Void Invoice write NOTHING". `recordPayment` is implemented but refuses without an invoice, so **no payment can ever be recorded**. The live project holds 0 invoices, 0 invoice lines and 0 payments, and the codebase has no path to change that. A rental business that cannot bill or take money cannot run on this system tomorrow, whatever else works.

Two more findings block launch on their own. **The lifecycle cannot finish**: no Close verb exists, Reset is ruled to change no booking status, so *Returned* is terminal in practice. And **the real Booqable corpus cannot be imported**: the applied `0076` seed occupies booking numbers `B-900…B-945` on a UNIQUE column whose rows Law 3 forbids deleting — precisely the range the next real orders (#900+) need.

| | |
|---|---|
| **Overall score** | **56 / 100** |
| **Production readiness** | NOT READY |
| **P0 blockers** | 3 (invoicing/payments missing · lifecycle cannot close · corpus numbering collision) |
| **P1 issues** | 7 |
| **P2 issues** | 9 |
| **P3/P4** | 6 |

**The one-line answer to §65** — *could Cine Sewa run its real operation tomorrow on this alone?* — **No**: staff could book, pack, hand over and receive gear, but every rupee would still live in a spreadsheet, and no rental would ever be closed.

---

## 2. Scores

| Area | Score | Basis (one sentence each) |
|---|---|---|
| Architecture | **72** | Engines genuinely own the rules (`lib/money`, `lib/bs`, `lib/workflow`, `lib/status`, `lib/rbac`, `lib/operationalDay`) and pages defer to them; docked for 11 files over 1,900 lines (`NewRental.tsx` 3,529), 9,710 lines of unrouted `src/archive/`, and two availability opinions (`Calendar.tsx:1125` claims none exists; `lib/availability.ts` does). |
| Frontend | **70** *(provisional — agent pending)* | Honest states everywhere (empty, unavailable-with-reason, BS fallback), design tokens in use; docked for the lint gate failing and filter chips that share labels with state verbs. |
| Backend connection | **58** | Lifecycle screens read and write Postgres through `actions/` + `queries/`; but 24 of 40 action files are still refused at dispatch, and Calendar, Crew, Reports and Documents are seed-only. |
| Database | **82** | The strongest layer: RLS on all 124 tables, 43 triggers, exclusion constraints, rebuild-from-scratch proven 79/0; docked for §4.42(b) rounding divergence, the dead `vat_rate` (0079 drafted), the numbering collision, and Law 6 column masking still open on roughly 25 money-bearing tables. |
| Business logic | **55** | Quote→Returned verified live; but Close is unreachable, invoicing is absent, damage findings are never persisted, and three gates are satisfied by local counters. |
| Inventory | **68** | Reservation-at-Confirm verified, GiST exclusion live in Postgres; availability engine exists but the Calendar's own panel says "not computed yet" and Reset could not be exercised on quantity-tracked lines. |
| Payments | **20** | Schema, immutability triggers and reversal rows are all built and armed — and unreachable, because nothing creates an invoice. |
| Security | **62** | RLS everywhere, token scrub verified held (0 JWT-shaped / 0 64-hex strings in tracked files), env hygiene correct; docked for Law 6 base-table SELECT grants on money tables (I5), unverified edge-function auth, and 3 high dev-side advisories. |
| Testing | **60** | 106 test files, 2,338 passing at last run — every one against the mock; 0 tests touch real Supabase, no E2E suite, no integrated journey test. |
| Performance | **65** | Lazy routes, clean build; `vendor-scanner` 453 KB is the outlier, `NOW_AD` is frozen at module load (OPS-01), facet counts fire one `count=exact` per option. |
| Deployment | **50** | Build passes and a PWA is generated; but lint fails its own zero-warning gate, Supabase Free means no PITR (the migration set *is* the DR plan), the local stack is down, and CI was not evidenced in this run. |
| UX | **74** | Gates explain themselves, refusals name their reason, nothing fakes a number; docked for `alert()` used as a success channel and label collisions. |
| Mobile | **60** *(provisional — not measured this run; see 1 Sep FORM/INTERACTION audits)* | 44 px targets and BottomBar/MoreSheet are built; iPad/phone behaviour was not re-driven here. |
| **Overall** | **56** | Weighted toward business logic, payments and deployment, because §65 asks whether the business can run. |

---

## 3. Architecture (current)

```
 Browser (React 18 + Vite SPA, PWA)                    Supabase (project sxguwvgoserhdolewibb)
 ───────────────────────────────────                   ──────────────────────────────────────
 modules/*  (73 routes, App.tsx guard → /login)        Postgres 124 tables · RLS on every table
     │  reads                     │ writes                 81 migrations (rebuild proven 79/0)
     ▼                            ▼                        43 triggers (immutability, gates,
 lib/queries/*  ──────────►  actions/*  ──rpc/insert──►     audit, stage read-model 0021)
 (useList, facetCounts,      core.ts dispatcher            3 exclusion constraints
  bookings, finance…)        refuses unless               *_v masking views (Law 6)
     │                       implemented:true (16/40)      Edge fns: booqable-proxy, -webhook
     │                            │
 engines (Law 1): lib/money · lib/bs · lib/workflow · lib/status · lib/rbac · lib/operationalDay · lib/availability
     │
 VITE_DATA_SOURCE=mock → lib/mock (in-memory + localStorage overlay; emulates ONLY trigger 0021)
 offline: lib/offlineQueue (IndexedDB) → lib/syncEngine drainer; money writes refuse offline
 bridge: lib/booqable/sync.ts + 7 mappers — built, callable only from scripts/run-full-sync.ts
```

**Tech stack:** React 18, TypeScript (strict, `tsc` clean), Vite 5, vitest, Tabler icons, Supabase JS, `vite-plugin-pwa` 1.3.0, IndexedDB offline queue. Nepali specifics: paisa integer money with whole-rupee half-up rounding at each displayed step, Bikram Sambat rendering (table currently covers 16 Jul–16 Aug 2026 only), 06:00 operational day, Kathmandu-fixed civil dates.

---

## 4. The critical journey (§44) — driven, not read

Mode `dev:mock`; the overlay store is the database proxy. Live Postgres was **not** written.

| # | Step | Result | What the store showed |
|---|---|---|---|
| 1 | Create client "Test Production" | ✅ PASS | `clients` C-1, phone normalised `+9779801234567`; list 40 → 41 |
| 2–3 | New rental, add camera + lens | ✅ PASS | inline picker, both lines on form |
| 4 | Calculate price | ✅ PASS | Subtotal 3,600 · Discount 0 · Taxable 3,600 · VAT 13% **468** · **Total 4,068** — whole-rupee, exact |
| 5 | Apply discount | ◻ not exercised | 0–25 % chips present (Law 10 ruled ungated) |
| 6 | Reserve + Confirm | ✅ PASS | `bookings` B-1 **Booked** · `booking_lines` ×2 · **`inventory_reservations` ×2** · transition Quote→Booked · `audit_events` |
| 7 | Packing list | ✅ PASS | per-line `Pack <name>` ticks; **empty session refused** ("a session claiming work on nothing is refused") |
| 7c | Evidence gate (§4.31, ruled mandatory) | ⚠ P1 | "Take Photo" is `setPhotoCount(n+1)` — a local counter, no capture, no `evidence_files` row (`PackingWorkspace.tsx:1241`; header :50 admits it). One click satisfied the gate. |
| 8 | Complete Packing | ✅ PASS | **Packed**; `packing_lines` ×2, `operation_sessions`, `session_line_movements` ×2 |
| 9 | Handover — 6 gates | ✅ PASS (gates honest) | Receiver ID + authorisation = two checkboxes ("no receiver identity is stored"); **Payment Verified / Deposit Received = `setX(true)` local flags with no money check**; signatures = name+time; Manager Override is an honest *Unavailable* |
| 10 | Complete Handover | ✅ PASS | **On Rent**; `handover_lines` ×2; the real money enforcement is DB gate `0010` (pending deposit / invoice outstanding), which mock does not fire |
| 11 | Partial payment | ⛔ **P0 MISSING** | no invoice exists and none can be created → `recordPayment` refuses |
| 12–13 | Return + inspect | ✅ PASS | **Returned**; `return_lines` ×2 with `condition: Good` / `condition: Damaged`, `inspection_state: Inspected` |
| 14 | Record damage | ⚠ P1 / P2 | condition persists on the line; the typed description and both signatures persist **only as prose in `operation_sessions.notes`**; `return_lines.inspector_note` empty; **`damage_findings` is never written by any code** → no damage charge can ever reach an invoice |
| 15–17 | Final amount · final payment · invoice | ⛔ **P0 MISSING** | as 11 |
| 18 | Close rental | ⛔ **P1 MISSING** | no Close verb anywhere; Reset "changes no booking status" (§1.5, `ResetWorkspace.tsx:1276`) → **Returned is terminal** |

Full evidence with every store read: `docs/booqable/JOURNEY_EVIDENCE_2026-09-03.md`.

---

## 5. Database reality (§45) — live, 3 Sep

124 tables, **RLS enabled on all 124**, 43 triggers all `ENABLED`, exclusion constraints on `inventory_reservations`, `crew_bookings`, `crew_leaves`.

| Populated | Rows | Empty — every transactional table |
|---|---|---|
| `audit_events` | **5,424** | `invoices`, `invoice_lines`, `payments`, `payment_reversals`, `security_deposits`, `deposit_movements` |
| `clients` | 366 | `inventory_reservations`, `product_units`, `booking_line_units`, `booking_stage_transitions` |
| `bookings` | 246 (200 imported B-700…B-899 + 46 seed B-900…B-945) | `packing_lines`, `handover_lines`, `return_lines`, `operation_sessions` |
| `products` | 204 | `damage_findings`, `late_fee_findings`, `cases`, `expenses`, `notifications`, `document_registry`, `evidence_files` |
| `external_refs` | 171 (clients 100, products 71, **orders 0**) | `daily_closings`, `stock_*`, `crew_*`, `portal_*`, `sync_*`, `tax_ledgers` |

Reading: master data and audit trail exist; **the operation has never run once on the live project**. That is consistent with the code (write paths landed 1–3 Sep) and is not itself a defect — but it means every trigger, gate and policy on the money tables is **untested against real rows**.

**Law 6 at the grant level:** tables where `authenticated` holds *no* table-level SELECT (armed by 0062/0077): `products`, `booking_lines`, `accessories`, `booking_transport`, `maintenance_records`, `product_units`, `vehicle_fuel_logs`, `bookings`, `daily_closings`. Money-bearing tables that **still grant SELECT** to `authenticated` and rely on row policies alone: `invoices`, `invoice_lines`, `payments`, `security_deposits`, `deposit_movements`, `expenses`, `damage_findings`, `late_fee_findings`, `charges`, `coupons`, `membership_plans`, `crew_*`, `bundles`, `cases`, `purchase_requests`, `tax_ledgers` and others — the I5 finding stands.

**Law 3 at the grant level:** `authenticated` holds DELETE on `external_refs`, `containers`, `external_invoices`, `portal_link_requests`, `sync_conflicts`, `sync_inbox`, `sync_log`, `sync_outbox`, `sync_state`, `daily_closings` (the last is trigger-blocked). Deleting an `external_refs` row breaks import idempotency — P2.

---

## 6. Critical bug list

| ID | Sev | Module | Where | Problem → Impact → Fix |
|---|---|---|---|---|
| **P0-1** | P0 | Finance | `Finance.tsx:539`, `CreateInvoiceModal.tsx`, no `actions/finance/*Invoice*` | **No invoice can be created.** → No payment can be recorded; live 0/0/0; Finance, receipts, VAT all inert. → Build `createInvoice` action (number via `next_document_number`, lines from booking, trigger recalculates) + rbac rule (the file's own `TODO(decision)` at :474) + wire the modal. |
| **P0-2** | P0 | Rentals | `lib/workflow.ts` JOBS (4 verbs), `Reset.sets = null`, `ResetWorkspace.tsx:1276` | **No Close verb; Returned is terminal.** → No rental ever completes; reports on closed rentals impossible; `closeGates` only reachable from seed. → Rule Returned→Closed (who, when, gates: invoice settled? deposit released?) and add the verb + action. |
| **P0-3** | P0 | Data | `bookings_booking_no_key` UNIQUE; `0076_seed_operational_stage_corpus`; Law 3 `trg_bookings_reject_delete` | **Seed rows B-900…B-945 squat on real Booqable order numbers #900+.** → Importing the remaining ~450 orders fails row by row; cancellation does not free a number. → Ruling: renumber the seed via a new migration (rows can be UPDATEd), or offset imports. Detail: `docs/booqable/BRIDGE-AND-CORPUS-STATE.md` §4. |
| P1-1 | P1 | Today/Ops | `data/today.ts:24,756` (OPS-01, agent-traced) | `NOW_AD` = Kathmandu civil midnight resolved **once at module load**, used as an instant in `overdue()`, Critical alerts, Overdue chip, timeline ring. → Overdue lags up to ~18 h; page loaded at 09:00 never flags a 10:00 return until tomorrow. → Per-render `now` (hook), keep `TODAY_DAY_AD` as the day. |
| P1-2 | P1 | Floor | `PackingWorkspace.tsx:1241`, `HandoverWorkspace.tsx:648`, `ReturnWorkspace.tsx:603` | Ruled-mandatory evidence photo and both signatures are satisfied by **local counters / name+timestamp**; no `evidence_files` or `signatures` row is ever written. → Gate is enforced in name only; dispute evidence does not exist. → Wire capture to storage + `evidence_files`; write `signatures`. |
| P1-3 | P1 | Return | no writer of `damage_findings` / `late_fee_findings` in `floorVerb.ts`, `returnRental.ts`, `ReturnWorkspace.tsx` | Damage condition persists on the line but **no finding, no charge, no approval row** (`trg_damage_approver_is_actor` is armed on an empty table). → Damage can never be billed. → Emit `damage_findings` from the return session for Damaged/Lost lines. |
| P1-4 | P1 | Money | `recalculate_invoice_totals()` (live) vs `lib/money.ts:118` | DB rounds 2 dp and hardcodes 0.13; app rounds whole-rupee and reads the rate. Rs 0.98/invoice (Rs 0.48 VAT) on the reference case. → Invoice PDF ≠ stored row. → **PLAN §4.42(b) ruling** (recommended: trigger adopts app arithmetic); `0079` (drafted, unapplied) fixes the rate half. |
| P1-5 | P1 | Actions | `core.ts` guard; 16 of 40 action files set `implemented: true` | 24 actions still refused at dispatch (merge clients, most inventory/cases/crew/documents/maintenance/subrentals). → Any button wired to them shows a green toast and writes nothing. → Finish or hide; the dispatcher already refuses honestly. |
| P1-6 | P1 | Security | I5; grants above | Column-level Law 6 masking incomplete on ~25 money tables; a role that can read the row can read the amount. → Warehouse could read money via any raw base-table read. → Extend the 0062/0077 revoke-and-grant pattern. |
| P1-7 | P1 | Bridge | `src/lib/booqable/sync.ts`, `scripts/full_sync.sql` | Bridge is built with zero `src/` importers; the two generated SQL importers set every booking's `client_id` to `(SELECT id FROM clients LIMIT 1)` and `pickup_at = return_at = NOW()`, guarded on `external_refs` rows that were never written. → Running them corrupts 100+ bookings permanently (Law 3). → Quarantine the SQL; back-fill `orders` refs before any re-sync. |
| P2-1 | P2 | Return | `operation_sessions.notes` vs `return_lines.inspector_note` | Damage description + signatures persist as a prose block on the session, not on the line. → Not queryable per item; UI copy "not stored" is inaccurate. → Write `inspector_note`; structured signatures. |
| P2-2 | P2 | Handover | `HandoverWorkspace.tsx:500-530` | "Payment Verified" / "Deposit Received" are operator attestations with no lookup. → UI passes a gate the DB would refuse; confusing failure at Complete on live. → Read `security_deposits.pending_amount` / invoice outstanding before showing the gate as clearable. |
| P2-3 | P2 | Build | `NewRental.tsx:1803` | `useCallback` missing 7 deps incl. `depositRequiredPaisa`, `discountPct` → **lint fails the repo's zero-warning gate**; stale closure over money fields. |
| P2-4 | P2 | Reports | `ReportTemplate.tsx:273` | `alert('View … saved')` — a browser alert claiming a save that does not happen (saved views are unbuilt). Law 12 violation twice over. |
| P2-5 | P2 | Data | grants | `authenticated` can DELETE `external_refs` → breaks import idempotency. |
| P2-6 | P2 | Calendar | `Calendar.tsx:1106-1131` | Calendar is seed-only and its `AvailabilityPanel` says availability is "not computed yet" while `lib/availability.ts` + `queries/availability.ts` exist and are used by the booking form. → Two opinions; Calendar disagrees with Rentals about the same bookings. |
| P2-7 | P2 | Crew / Docs / Reports | `crewIntel.ts`, `/documents`, all `/reports/*` | Seed-only screens rendering figures unrelated to the live corpus (Layer-D 28 %). |
| P2-8 | P2 | Ops | `OperationsQueues.tsx:201-208` | Today/Tomorrow scopes built on raw midnights, bypassing `operationalDayBounds` → Operations and Dashboard disagree where a day starts. |
| P2-9 | P2 | Deps | `npm audit` | 3 high (`fast-uri`, `nanoid` — fix available; `vite` — major bump), 1 moderate. Dev-side. |
| P3-1 | P3 | UX | Packing/Reset | Filter chips ("Packed", "Ready") share labels with state verbs; an automation and a hurried operator both hit the filter. |
| P3-2 | P3 | Dates | `lib/bs.ts` | BS table covers Shrawan 2083 only; English fallback everywhere else (honest). Needs the 2080–2090 month-length table from an authoritative source — **must not be invented**. |
| P3-3 | P3 | Mock | `lib/mock` numbering | Mock mints C-1/B-1, ignoring live sequences — harmless, but journey numbers never resemble production's. |
| P3-4 | P3 | Print | `printSlip.ts:57` | `alert()` for popup-blocked; acceptable but off-pattern. |
| P3-5 | P3 | Docs | `docs/pages/*`, `Calendar.tsx:1125`, `Finance.tsx:539` (re: `implemented`) | Doc rot: several in-code/doc claims contradicted by code (agent found 6 in one cluster alone). |
| P4-1 | P4 | Lines | `booking_lines.description` null on created lines | Cosmetic in lists; fill from product name at create. |

---

## 7. Feature matrix (§53)

| Module | Frontend | Backend | Database | Business logic | Tests | Status |
|---|---|---|---|---|---|---|
| Today / Dashboard | ✅ | ✅ live `listBookings` | ✅ | ⚠ NOW_AD frozen | ✅ | FUNCTIONAL BUT INCOMPLETE |
| Rentals list | ✅ | ✅ live + facet counts | ✅ | ✅ | ✅ | FUNCTIONAL BUT INCOMPLETE (no bulk bar) |
| New Rental → Confirm | ✅ | ✅ `create_booking` RPC | ✅ reservations at Confirm | ✅ | ✅ | **COMPLETE** (verified live-in-mock) |
| Booking Detail | ✅ | ✅ | ✅ | ⚠ no next-verb, no Close | ✅ | PARTIAL |
| Packing / Handover / Return | ✅ | ✅ floor verbs | ✅ lines + sessions | ⚠ evidence/signature gates local | ✅ | FUNCTIONAL BUT INCOMPLETE |
| Reset | ✅ | ✅ | ✅ | ruled no-op on stage | ✅ | PARTIAL (not exercised) |
| Close rental | — | — | schema ready | **no verb** | — | **MISSING** |
| Operations queues | ✅ | ✅ | ✅ | ⚠ day-bounds bypass | ✅ | FUNCTIONAL BUT INCOMPLETE |
| Calendar | ✅ | ✗ seed | — | ✗ availability "not computed" | ✗ | **MOCKED** |
| Crew Assist | ✅ | ✗ seed | tables empty | — | ✗ | **MOCKED** |
| Inventory + Add Equipment | ✅ | ✅ `createEquipment` | ✅ | ✅ | ✅ | FUNCTIONAL BUT INCOMPLETE |
| Clients + Add / Block / Duplicates | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE (merge: MISSING) |
| Invoices | ✅ modal | **✗ writes nothing** | ✅ triggers armed | — | ✅ (of the modal) | **DISCONNECTED → P0** |
| Payments | ✅ modal | ✅ `recordPayment` (needs invoice) | ✅ immutable | ✅ | ✅ | **BROKEN (unreachable)** |
| Deposits | ✅ | — | ✅ | liability split honoured | — | PARTIAL |
| Documents / Evidence | ✅ | ✗ | tables empty | — | — | **MOCKED** |
| Expenses | ✅ | partial | ✅ | — | ✅ | PARTIAL |
| Reports (10) | ✅ | ✗ seed | — | — | ✅ | **MOCKED** |
| Notifications | bell disabled honestly | ✗ | table empty | — | — | **MISSING** |
| Audit log | ✅ | ✅ `listAuditEvents` | ✅ 5,424 rows | ✅ | ✅ | **COMPLETE** |
| Settings | ✅ | localStorage only | `system_settings` 0 rows | — | ✅ | PARTIAL |
| Offline | banner + queue | queue for some writes; money refuses | IndexedDB | — | ✅ | **PARTIAL OFFLINE** |
| Booqable bridge | — | built, off-line | half-imported | numbering collision | ✅ | DISCONNECTED |

---

## 8. Frontend, design system, accessibility, mobile, PWA

- **Honesty is the house style and it holds:** unbuilt controls render `Unavailable` with a named reason (notifications, help, saved views, manager override, share); zeros explain themselves; no figure is invented. This is better than the reference product.
- **Design tokens** are the norm (`styles/theme.css`); `check:contrast` gate exists (40/40 on 2 Sep). Hardcoded-colour sweep: *pending agent*.
- **Responsive system:** `lib/device.ts`/`useViewport`, Law 14 breakpoint 1280, Law 15 44 px targets — built; phone `BottomBar`/`MoreSheet`/`ScannerFab` exist. Re-verification on devices: *not performed this run*.
- **PWA (§41): present.** `vite-plugin-pwa` 1.3.0, `generateSW`, `dist/sw.js`, 143 precache entries (3.39 MB). Manifest/installability details: *pending agent*.
- **Accessibility:** per-row controls carry `aria-label`s (`Pack <name>`, `Mark <name> picked up`, `Condition of <name>` radiogroups); stage bar uses `aria-current="step"`; earlier P1 (red debug text) and the fake "12 unread" label are fixed. Full WCAG pass: *pending agent*.
- **Label collision (P3):** filter chips and state verbs share text on Packing and Reset.

## 9. Backend / data connection (§33) — the screen → table map

| Screen | Chain | Class |
|---|---|---|
| Today | `Today.tsx` → `data/today.ts` queries → `queries/bookings.listBookings` → `bookings` (+ `_v`) | LIVE-DB (with NOW_AD defect) |
| Rentals list | `RentalsList.tsx` → `useList` → `listBookings` (count=exact) + `facetCounts` | LIVE-DB |
| Booking Detail | `BookingDetail.tsx` → 4 fetch paths → `bookings`, `booking_lines`, `bookings_deposit_v`, `booking_notes` | LIVE-DB |
| New Rental | `NewRental.tsx:1679` → `createRental` → `rpc('create_booking')`; `:1764` → `confirmRental` → `booking_stage_transitions` | LIVE-DB |
| Packing / Handover / Return | workspaces → `packRental`/`handoverRental`/`returnRental` → `floorVerb.runFloorVerb` → `packing_lines`/`handover_lines`/`return_lines`, `operation_sessions`, `session_line_movements`, stage transition | LIVE-DB |
| Operations queues | `OperationsQueues.tsx` → `listBookings` ×4 counts | LIVE-DB |
| Clients | `ClientsDirectory.tsx` → `queries/clients.ts` → `client_directory_v`; create/block via actions | LIVE-DB |
| Inventory | `Inventory.tsx` → `queries/*` + `createEquipment` | LIVE-DB (partial) |
| Finance | `Finance.tsx` → `queries/finance.ts` → `invoices` (reads) · **Create/Void Invoice → nothing** | LIVE-READ / DEAD-WRITE |
| Payments modal | `RecordPaymentModal` → `recordPayment` → `payments` (needs `invoiceId`) | LIVE (unreachable) |
| Audit log | `AuditLog.tsx` → `queries/audit.listAuditEvents` → `audit_events` | LIVE-DB |
| Calendar · Crew · Documents · all `/reports/*` · Pulse | `src/data/*` constants | **UI → MOCK-SEED** |
| Settings | `settingsStore` → `localStorage` (`system_settings` table unused) | **UI → LOCALSTORAGE-ONLY** |

Routing: 73 routes in `App.tsx`; guard at `App.tsx:1017` (`Navigate to="/login"`); public: `/login`, `/forgot-password`, `/reset-password`. `/admin/*` and `/tools/*` pairs duplicate four screens. `src/archive/**` (17 files, 9,710 lines) has 0 importers.

## 10. Database (§7, §55) — condensed

Schema can represent the full rental lifecycle including inspection (`return_lines.condition`, `inspection_state`), damage (`damage_findings` with approver-is-actor trigger), late fees, deposits as liabilities (`security_deposits` + `deposit_movements` sync trigger), reversals (`payment_reversals`, `expense_reversals`), immutability (`trg_payments_reject_update/delete`, `trg_invoices_immutable_once_issued`, `trg_audit_events_reject_*`), forward-only stages (`trg_apply_booking_stage_transition`), capacity (`trg_enforce_inventory_reservation_capacity`), and per-write `client_uuid` uniqueness (Law 8). Gaps: `notifications` pipeline unwritten; `tax_ledgers` unwritten; `signatures`/`evidence_files` unwritten by the floor; `system_settings` unused; two files numbered `0076` (both applied, distinct timestamps — do not renumber); `0079` drafted for `vat_rate`.

## 11. Pricing, payments, documents, reports

- **Pricing:** one authority, `lib/money.ts price()`, asserted at module load; drove the journey to the rupee. Discount types in the spec (student, production, women filmmaker, travel-day) exist as `membership_plans` / `coupons` / rates — not exercised. Late fee engine `lateFee` exists (27 tests). **DB trigger disagrees with the engine** (P1-4).
- **Payments:** schema and immutability complete; **flow unreachable** (P0-1). Balance formula consistent in `bookingQuery.ts` vs `queries/finance.ts` (the fraction/percent trap already caught at `bookingQuery.ts:73`).
- **Documents:** `printSlip.ts` and print buttons exist; `document_registry`, `booking_documents`, `evidence_files` all empty; no PDF generation/storage path. **MOCKED.**
- **Reports:** all ten `/reports/*` seed-only; they *can* disagree with Rentals/Finance because they read nothing live. `/reports/products` re-routed 2 Sep (§4.41).
- **Fonepay:** nothing present.

## 12. Auth, RBAC (§19), security (§23)

- **Auth:** Supabase auth + staff PIN re-lock (`staff_auth_pins`, RLS with 0 policies → definer-only), handover sheet on logout for floor roles; route guard verified.
- **RBAC matrix (UI ↔ server):** 19 `can*` capabilities in `lib/rbac.ts`; server mirrors exist for money (`auth_can_view_money`), damage/late-fee/purchase approval (`auth_can_approve_*`), finance (`auth_is_finance_or_admin`), staff (`auth_is_staff`). Row policies present on every core table (`*_select/insert/update`; **no DELETE policies anywhere** → Law 3 by grant + trigger). Column masking: see §5 — incomplete on ~25 money tables.

| Capability | Owner | Admin | Manager | Coordinator | Accounts | Warehouse | Technician | Driver | Client | Server gate |
|---|---|---|---|---|---|---|---|---|---|---|
| View money | ✅ | ✅ | ✅ | ✅ | ✅ | ✗ | ✗ | ✗ | ✗ | `auth_can_view_money` + `_v` views (partial) |
| Confirm / write booking desk | ✅ | ✅ | ✅ | ✅ | ✗ | ✗ | ✗ | ✗ | ✗ | `bookings_insert/update` |
| Floor verbs (pack/handover/return) | ✅ | ✅ | ✅ | ✅ | ✗ | ✅ | ✅ | ✅* | ✗ | `*_lines_all`, `booking_stage_transitions_insert` |
| Record payment | ✅ | ✅ | ✅ | ✗ | ✅ | ✗ | ✗ | ✗ | ✗ | `payments_insert` (+ `auth_is_finance_or_admin`) |
| Approve damage / late-fee waiver | ✅ | ✅ | ✅ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `auth_can_approve_*` + approver-is-actor triggers |
| Manage settings | ✅ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `system_settings_manage` (broader than UI — §4.x open) |
| Create invoice | — | — | — | — | — | — | — | — | — | **no rule, no action** |

\* per delivery type. Cells reflect `rbac.ts` and policy names; per-cell live probing was done for money on 1 Sep (I5) and not repeated here.

- **Secrets:** scrub **held** — 0 JWT-shaped and 0 64-hex strings in tracked files; `.env.local` ignored; `.env.example` present; only `.env.example`/`.env.mock` tracked. The 13 Aug token exposure was local-only (repo has never had a remote).
- **Unverified:** `booqable-proxy` edge-function auth (what stops `anon`), storage bucket policies for evidence, CORS/rate limits.
- **Dependencies:** 3 high / 1 moderate advisories, all dev-side (P2-9).

## 13. Offline, resilience, error handling

- **Classification: PARTIAL OFFLINE.** `lib/offlineQueue.ts` (IndexedDB, unique index, timestamp-ordered replay), `lib/syncEngine.ts` drainer with status/pending count in the header; 4 caller files. Money paths **refuse** offline by design (blockClient header); floor verbs' offline policy is an open ruling (PLAN §4.x "queue vs refuse").
- **Idempotency:** every write carries `client_uuid` (Law 8) — verified on the created rows; `idempotentInsert` helper.
- **Errors:** `ErrorBoundary` in `App.tsx` and `shell/ErrorBoundary.tsx`; `main.tsx` renders a *stated* error when the money engine's reference case breaks (never a blank page); "Something went wrong" appears twice. Gate refusals are inline and persistent (Law 12) — observed on every workspace.

## 14. Testing, performance, deployment, integrations, import

- **Tests:** 106 files; last full run 100 files / **2,338 passing** (3 Sep 14:19). **All mock-only** — 0 tests import the real client; no E2E directory. By name, every one of the 12 critical workflows has *some* unit coverage (create client 7 files … payment 32, invoice 25, close 47) but no test drives the integrated journey or the DB triggers.
- **Build:** `tsc` clean; `vite build` **4 m 06 s, exit 0**; chunks: `vendor-scanner` 453 KB, `main` 297 KB, `vendor-supabase` 218 KB, `NewRental` 161 KB; precache 3.39 MB.
- **Lint: FAILS** (`--max-warnings 0`, 1 warning, P2-3).
- **Deployment:** `public/_redirects` present (static host); Supabase Free (no PITR — `check:dump` exists and the migration set is the recovery plan; **rebuild proven 79/0**); local stack down; CI: *not evidenced in this run*; monitoring: `lib/monitoring.captureError` exists — sink configuration *unverified*.
- **Integrations:** Booqable — bridge BUILT/OFF-LINE (P1-7); WhatsApp — template/link builders (`lib/whatsappTemplates`, `whatsappActions`), no send; email — none (stated in Unavailable reasons); PDF — none; Fonepay — none; Sentry — unverified.
- **Import:** Nepal phone normalisation works (`+9779801234567` on the created client); `external_refs` guards exist for clients/products only; **orders refs 0** → re-sync would duplicate; generated SQL importers unsafe (P1-7).

## 15. Dead code, duplication, technical debt

- **Dead:** `src/archive/` 17 files / 9,710 lines / 0 importers → REMOVE or keep as reference outside `src/`; `lib/kpiEngine` (0 importers) → REMOVE; `queries/fetchCanonicalBooking` (0) → REMOVE; `FilterDrawer.FilterOptionList` (0 production) → MERGE into Rentals' `StatusFilterGroup` or REMOVE; `operationsShell.entryStepFor` (dead twin of `OperationsShell.tsx:85`) → MERGE; `lib/booqable/sync.ts` → KEEP (bridge, script-driven).
- **Duplication:** next-stage lookup ×3 (`data/operations.ts:175 jobForStage` live, `operationsShell.entryStepFor` dead, `OperationsShell.tsx:85` private); availability ×2 (engine vs Calendar's denial); day-bounds ×2 (`operationalDayBounds` vs raw midnights in OperationsQueues); money arithmetic ×2 (engine vs trigger).
- **Markers:** 278 `TODO(decision)` (deliberate, the project's ruling mechanism); 60 other `TODO`; 0 `FIXME`/`HACK`; 10 `console.log`, 16 `console.error`, 2 real `alert()`, 0 `dangerouslySetInnerHTML`.
- **Giant files:** `NewRental.tsx` 3,529 · `AddBundle.tsx` 2,635 · `bookingQuery.ts` 2,568 · `Calendar.tsx` 2,522 · `BookingDetail.tsx` 2,508 · `ClientsDirectory.tsx` 2,321 · `Warehouses.tsx` 2,250 · `RentalsList.tsx` 2,227 · `Inventory.tsx` 2,143 · `Finance.tsx` 1,973.
- **Debt by layer:** *Architecture* — giant screen files, archive. *Backend* — 24 unimplemented actions. *Database* — §4.42(b), Law 6 columns, numbering. *Testing* — no real-DB or E2E tier. *Security* — edge-fn auth unverified. *UX* — label collisions, `alert()`. *Deployment* — lint gate, CI/monitoring evidence, DR on Free tier.

## 16. Missing features

**Required before launch:** invoice creation (action + rule + modal wiring); reachable payment flow; Close verb with its gates; `damage_findings` from Return; persisted evidence photos and signatures; corpus numbering ruling + `orders` ref back-fill; §4.42(b) ruling applied.
**Required soon after:** BS month-length table 2080–2090 (authoritative source only); notifications pipeline (table exists); live Calendar; client merge (`mergeClients` `implemented: false`); document register + PDF; settings persisted to `system_settings`.
**Nice to have:** Fonepay; WhatsApp send; Booqable write-back; saved views.

## 17. Recommended architecture — keep the spine, finish the heart

The architecture does not need changing; it needs completing. Keep: engines-own-the-rules, actions-as-commands with the dispatcher's `implemented` guard, stage-as-read-model via transitions, triggers as guarantors for rows the app did not write. Change: (1) make `recalculate_invoice_totals()` mirror `price()` and pin both to the reference case with one test; (2) add the two missing commands (`createInvoice`, `closeRental`) inside the existing pattern; (3) route Calendar/Reports/Crew through `queries/*` and delete their seed arrays; (4) split the four largest screens along the card boundaries they already draw. Migration plan: Phase 0 → 1 below; no rewrite.

## 18. Priority roadmap

**PHASE 0 — blockers (before any real booking):** P0-1 invoicing · P0-2 Close verb · P0-3 numbering ruling · P1-4 §4.42(b) ruling + apply `0079` · P1-7 quarantine the SQL importers · P1-1 `NOW_AD`.
**PHASE 1 — core engine:** P1-2 evidence/signature persistence · P1-3 damage findings · P1-5 finish/hide the 24 actions · P2-2 read money before showing money gates · deposits/late-fee/refund flows exercised end to end against a **local** database (start Docker, `check:dump` first).
**PHASE 2 — operations:** live Calendar and Crew · P2-8 day bounds · notifications pipeline · BS table.
**PHASE 3 — quality:** real-DB test tier + one E2E journey · lint gate green · giant-file splits · dead-code removal · label collisions.
**PHASE 4 — production:** CI evidence · monitoring sink · backup/restore drill on Free tier · edge-function auth review · Law 6 column grants (P1-6) · dependency bumps.

## 19. Launch checklist (state on 3 Sep)

- [x] Authentication works · [x] Authorization server-side (rows) · [ ] Authorization server-side (money columns, all tables)
- [x] Migrations build from scratch · [x] Backup script exists · [ ] Restore drilled
- [x] Rental creation · [x] Editing lines before Confirm · [ ] Cancellation verified · [x] Inventory reservation · [x] No double booking (DB constraint) · [ ] Availability shown on Calendar
- [x] Pricing · [x] Discounts (ruled ungated) · [x] VAT in app · [ ] VAT in DB agrees (§4.42b)
- [ ] **Payments** · [ ] **Balance calculation on real rows** · [x] Returns · [x] Inspection · [ ] **Damage charge** · [ ] **Documents** · [ ] **Reports on real data**
- [x] Search · [x] Filters · [ ] Notifications · [x] Audit log · [x] Error handling · [x] Mobile (built, not re-verified)
- [x] Security scrub · [x] Tests pass · [x] Build passes · [ ] Lint passes · [ ] Production deployment evidenced · [ ] Monitoring evidenced · [ ] Backup/recovery tested
- [x] No critical secrets exposed · [ ] **No critical mocked workflows remain** · [ ] **No critical TODOs remain** (278 rulings open by design)

## 20. Final verdict

**NOT READY.** Not because the work is poor — the database layer and the floor workflows are better engineered than most shipping rental systems — but because the two things a rental company must do every day, **bill and collect**, do not exist, and because no rental can ever be closed. Fix P0-1 and P0-2 and this moves to *READY WITH BLOCKERS* on the strength of what is already verified. Fix P0-3 and the real corpus can come in.

---
*Pending agent clusters (architecture, frontend-design, data-connection, database, rental-lifecycle, inventory-availability, money, auth-security, resilience, delivery, forms-interactions) will be appended as an addendum when they complete; their P0/P1s pass adversarial refutation before entering §6.*
