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
| **Overall score** | **52 / 100** (56 before the addenda; unchanged by the 3 Sep refutation and Addendum C — five cluster P1s fell to P2, six forms P2s arrived, and P1-5 was itself over-stated) |
| **Production readiness** | NOT READY |
| **P0 blockers** | 3 (invoicing/payments missing · lifecycle cannot close · corpus numbering) |
| **P1 issues** | **9** — 6 direct (P1-5 reclassified P2) + 3 promoted from the clusters after refutation (P1-8 no live backup · P1-9 token in archives · P1-10 no test reaches a database); 5 cluster P1s fell to P2 |
| **P2 issues** | 9 direct (P1-5 reclassified in, P2-3 withdrawn) + about 30 across Addenda A–C (incl. the 5 downgraded P1s) |
| **P3/P4** | 6 direct + the addenda's long tails |

**The one-line answer to §65** — *could Cine Sewa run its real operation tomorrow on this alone?* — **No**: staff could book, pack, hand over and receive gear, but every rupee would still live in a spreadsheet, and no rental would ever be closed.

---

## 2. Scores

| Area | Score | Basis (one sentence each) |
|---|---|---|
| Architecture | **72** | Engines genuinely own the rules (`lib/money`, `lib/bs`, `lib/workflow`, `lib/status`, `lib/rbac`, `lib/operationalDay`) and pages defer to them; docked for 11 files over 1,900 lines (`NewRental.tsx` 3,529), 9,710 lines of unrouted `src/archive/`, and two availability opinions (`Calendar.tsx:1125` claims none exists; `lib/availability.ts` does). |
| Frontend | **70** *(provisional — agent pending)* | Honest states everywhere (empty, unavailable-with-reason, BS fallback), design tokens in use; docked for filter chips that share labels with state verbs (the lint-gate dock was withdrawn 3 Sep — the failure was in-flight code; HEAD and tree lint clean). |
| Backend connection | **58** | Lifecycle screens read and write Postgres through `actions/` + `queries/`; but 24 of 40 action files are still refused at dispatch, and Calendar, Crew, Reports and Documents are seed-only. |
| Database | **82** | The strongest layer: RLS on all 124 tables, 43 triggers, exclusion constraints, rebuild-from-scratch proven 79/0; docked for §4.42(b) rounding divergence, the dead `vat_rate` (0079 drafted), the numbering collision, and Law 6 column masking still open on roughly 25 money-bearing tables. |
| Business logic | **55** | Quote→Returned verified live; but Close is unreachable, invoicing is absent, damage findings are never persisted, and three gates are satisfied by local counters. |
| Inventory | **68** | Reservation-at-Confirm verified, GiST exclusion live in Postgres; availability engine exists but the Calendar's own panel says "not computed yet" and Reset could not be exercised on quantity-tracked lines. |
| Payments | **20** | Schema, immutability triggers and reversal rows are all built and armed — and unreachable, because nothing creates an invoice. |
| Security | **62** | RLS everywhere, token scrub verified held (0 JWT-shaped / 0 64-hex strings in tracked files), env hygiene correct; docked for Law 6 base-table SELECT grants on money tables (I5), unverified edge-function auth, and 3 high dev-side advisories. |
| Testing | **60** | 106 test files, 2,338 passing at last run — every one against the mock; 0 tests touch real Supabase, no E2E suite, no integrated journey test. |
| Performance | **65** | Lazy routes, clean build; `vendor-scanner` 453 KB is the outlier, `NOW_AD` is frozen at module load (OPS-01), facet counts fire one `count=exact` per option. |
| Deployment | **50** | Build passes and a PWA is generated; lint is clean (3 Sep re-run); but Supabase Free means no PITR (the migration set *is* the DR plan), the local stack is down, and CI was not evidenced in this run. |
| UX | **74** | Gates explain themselves, refusals name their reason, nothing fakes a number; docked for `alert()` used as a success channel and label collisions. |
| Mobile | **60** *(provisional — not measured this run; see 1 Sep FORM/INTERACTION audits)* | 44 px targets and BottomBar/MoreSheet are built; iPad/phone behaviour was not re-driven here. |
| **Overall** | **52** (56 before Addenda) | Weighted toward business logic, payments and deployment, because §65 asks whether the business can run. Revisions from agent clusters: Testing 58, Deployment **35**, Security **55** — see Addendum B. The 3 Sep refutation moved five cluster P1s to P2 and Addendum C added six P2s: net unchanged at 52. |

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
| **P0-3** | P0 | Data | `bookings_booking_no_key` UNIQUE; `0076_seed_operational_stage_corpus`; Law 3 `trg_bookings_reject_delete`; `lib/booqable/map/orders.ts:264` | **Two incompatible numbering conventions, and a seed squatting on one of them.** The 200 imported rows and the ad-hoc SQL use `B-<Booqable number>`; the typed bridge mints `booking_no` via `next_document_number('BK')` and *never* reads the Booqable number (DEL-18, correcting `BRIDGE-AND-CORPUS-STATE.md` §4). So a `runFullPull` re-import **duplicates** all 200 under fresh BK numbers, while the SQL path **collides** on B-900…B-945, which Law 3 will not let anyone delete. → Rule one convention (PLAN §4), back-fill `orders` refs for B-700…B-899 keyed on the Booqable UUID, and either honour Booqable numbers with a collision check or renumber the seed. |
| P1-1 | P1 | Today/Ops | `data/today.ts:24,756` (OPS-01, agent-traced) | `NOW_AD` = Kathmandu civil midnight resolved **once at module load**, used as an instant in `overdue()`, Critical alerts, Overdue chip, timeline ring. → **Refuted 3 Sep: stands, and the lag was understated** — up to ~24 h per fresh daily load and unbounded for a tab left open; the applied `0076` corpus stamps every `return_at` at 06:00 NPT = 00:15Z, fifteen minutes *after* the anchor, so every standard-time return is invisible as overdue on Dashboard, Operations and the Rentals list for the whole day it falls due, while Booking Detail (live `new Date()`) already says Overdue — screens disagree. Lazy routes freeze at their own first import, so Today, Rentals and Operations can hold different days; the engine's guard cannot catch it (a midnight ISO string passes `toMinute`). Not ruled in §4.0–4.42; not touched by the 1–2 Sep fixes; Finance's `overdueInvoices` is unaffected (day-based). → Per-render `now` (hook), keep `TODAY_DAY_AD` as the day. |
| P1-2 | P1 | Floor | `PackingWorkspace.tsx:1241`, `HandoverWorkspace.tsx:648`, `ReturnWorkspace.tsx:603` | Ruled-mandatory evidence photo and both signatures are satisfied by **local counters / name+timestamp**; no `evidence_files` or `signatures` row is ever written. → Gate is enforced in name only; dispute evidence does not exist. → Wire capture to storage + `evidence_files`; write `signatures`. |
| P1-3 | P1 | Return | no writer of `damage_findings` / `late_fee_findings` in `floorVerb.ts`, `returnRental.ts`, `ReturnWorkspace.tsx` | Damage condition persists on the line but **no finding, no charge, no approval row** (`trg_damage_approver_is_actor` is armed on an empty table). → Damage can never be billed. → Emit `damage_findings` from the return session for Damaged/Lost lines. |
| P1-4 | P1 | Money | `recalculate_invoice_totals()` (live) vs `lib/money.ts:118` | DB rounds 2 dp and hardcodes 0.13; app rounds whole-rupee and reads the rate. Rs 0.98/invoice (Rs 0.48 VAT) on the reference case. → Invoice PDF ≠ stored row. → **PLAN §4.42(b) ruling** (recommended: trigger adopts app arithmetic); `0079` (drafted, unapplied) fixes the rate half. |
| P1-5 | **P2** (was P1 — corrected by Addendum C) | Actions | `core.ts:228-232` guard; **16 of 37** action files declaring `implemented` set it true (recounted 3 Sep at the tree *and* at HEAD; Addendum A's "27" is retracted below) | 21 actions are refused at dispatch (merge clients, most inventory/cases/crew/documents/maintenance/subrentals). The dispatcher throws `ActionNotImplementedError` *before* execute and every caller catches it into an inline error, so **no green toast can fire** — the real defect is §37 honesty: Save Draft, Reconcile & complete audit and the three Booking-Detail modals are enabled controls that fail 100 % of the time (FORMS-02/03/04). → Gate them with `Unavailable` or build the actions. |
| P1-6 | P1 | Security | I5; grants above | Column-level Law 6 masking incomplete on ~25 money tables; a role that can read the row can read the amount. → Warehouse could read money via any raw base-table read. → Extend the 0062/0077 revoke-and-grant pattern. |
| P1-7 | P1 | Bridge | `src/lib/booqable/sync.ts`, `scripts/full_sync.sql` | Bridge is built with zero `src/` importers; the two generated SQL importers set every booking's `client_id` to `(SELECT id FROM clients LIMIT 1)` and `pickup_at = return_at = NOW()`, guarded on `external_refs` rows that were never written. → Running them corrupts 100+ bookings permanently (Law 3). → Quarantine the SQL; back-fill `orders` refs before any re-sync. |
| P1-8 | P1 (DEL-13 — refuted 3 Sep, **stands**) | Data / DR | `scripts/check-dump.mjs:10`; live org plan re-read on 3 Sep = **free**, project ACTIVE_HEALTHY, PG 17.6.1 | **No verified dump of the live database exists anywhere in the workspace.** Supabase Free has no PITR or automated backup; the only `pg_dump`-shaped file is the 805 KB *dev* dump of 2 Sep; nothing writes `backup_logs`. → A bad migration, a mistaken MCP write or an auto-pause loses 366 clients / 246 bookings, and `check-rebuild.mjs` itself says the migration set does not reproduce production. → `pg_dump` live now, `check:dump`, restore once into the local stack, weekly off-machine dump. **First item in Phase 0.** P1 not P0 only because the loss has not happened. |
| P1-9 | P1 (DEL-16 — refuted 3 Sep, **stands, wider**) | Security | `../backups/**`, `../QA-BACKUP-2026-09-01-4696af8/`, `../babin-rentals-os.rar` | The scrub held in the repo (0 token-shaped strings at HEAD and across `git log -p --all`), but the live-shaped Booqable token survives in five pre-scrub archives **and in two plaintext working-tree copies the first pass missed** — the 31 Aug snapshot's `scripts/*.mjs` and the QA-BACKUP worktree's `sync-booqable-data.mjs`. Every doc since 1 Sep says "rotate first"; none records a rotation. Values were counted, never read. → Rotate in Booqable, keep it only as the `booqable-proxy` function secret, then delete or re-scrub the archives. Exposure is this machine and any hand-off built from it (no remote has ever existed). |
| P1-10 | P1 (DEL-01 + DEL-02 — refuted 3 Sep, both **stand**; one finding) | Testing | `vitest.config.ts:35`; `scripts/check-rebuild.mjs:34` | **No automated test reaches a database.** 106 vitest files replace `../supabase` wholesale; no Playwright/Cypress dependency, config or spec exists; no pgTAP; zero tests name `validate_booking_gates`, `recalculate_invoice_totals`, `trg_bookings_reject_delete` or the 0021 trigger — and PLAN §4.42 itself demands the reference-case-through-the-trigger test. → A wrong column, an RLS refusal, a trigger rejection or a numbering collision on live passes every green run; BUG-011/012 were found only by hand-probing live. → pgTAP inside `check:rebuild`'s scratch DB, starting with §2.8 through the trigger; Playwright against `dev:local` for the 12 critical workflows, Owner + Warehouse identities. |
| P2-1 | P2 | Return | `operation_sessions.notes` vs `return_lines.inspector_note` | Damage description + signatures persist as a prose block on the session, not on the line. → Not queryable per item; UI copy "not stored" is inaccurate. → Write `inspector_note`; structured signatures. |
| P2-2 | P2 | Handover | `HandoverWorkspace.tsx:500-530` | "Payment Verified" / "Deposit Received" are operator attestations with no lookup. → UI passes a gate the DB would refuse; confusing failure at Complete on live. → Read `security_deposits.pending_amount` / invoice outstanding before showing the gate as clearable. |
| P2-3 | **withdrawn** (was P2) | Build | `NewRental.tsx:1803` | The `useCallback` exhaustive-deps warning that "failed the zero-warning gate" was measured on the other session's *uncommitted* working copy, not on the repo. Re-linted 3 Sep: **0 warnings at HEAD** (`git show HEAD:` through eslint's stdin; no commit has touched the file since the audit began), **0 at the tree**, and the full `npm run lint` gate exits 0. The stale-closure-over-money concern goes with it. |
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

- **Secrets:** the scrub held **inside the tracked repo** — 0 JWT-shaped and 0 64-hex strings in tracked files; `.env.local` ignored; `.env.example` present. **But the Booqable token persists in five pre-scrub archives on this machine** (`backups/babin-rentals-os-pre-miraz-uiux-backup-2026-08-31/.git` and its `.zip`, `backups/git-history-2026-09-01-pre-scrub/all-refs.bundle`, `QA-BACKUP-2026-09-01-4696af8/full-history.bundle`, and the 147 MB `babin-rentals-os.rar`) — **and in two plaintext working-tree copies the first pass missed** (the 31 Aug snapshot's `scripts/*.mjs`; `QA-BACKUP-2026-09-01-4696af8/worktree/scripts/sync-booqable-data.mjs`) — values counted, never read; **no document records a rotation** (DEL-16, refuted 3 Sep: stands, wider → P1-9). Exposure remains local-only (no remote has ever existed), but any hand-off built from those archives carries it. Rotate, then re-scrub or delete the archives.
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

**PHASE 0 — blockers (before any real booking):** P0-1 invoicing · P0-2 Close verb · P0-3 numbering ruling · P1-4 §4.42(b) ruling + apply `0079` · P1-7 quarantine the SQL importers · P1-1 `NOW_AD` · **P1-8 live `pg_dump` + one restore drill (do this first)** · **P1-9 rotate the Booqable token, then re-scrub the archives**.
**PHASE 1 — core engine:** P1-2 evidence/signature persistence · P1-3 damage findings · P1-5 (now P2) gate or finish the 21 refused actions · FORMS-05/06 make Purchase Request and Bundles write and read the database · P2-2 read money before showing money gates · deposits/late-fee/refund flows exercised end to end against a **local** database (start Docker, `check:dump` first).
**PHASE 2 — operations:** live Calendar and Crew · P2-8 day bounds · notifications pipeline · BS table.
**PHASE 3 — quality:** P1-10 pgTAP in `check:rebuild` + Playwright for the 12 workflows · lint stays green (clean at HEAD and tree, 3 Sep) · giant-file splits · dead-code removal · label collisions.
**PHASE 4 — production:** CI evidence · monitoring sink · backup/restore drill on Free tier · edge-function auth review · Law 6 column grants (P1-6) · dependency bumps.

## 19. Launch checklist (state on 3 Sep)

- [x] Authentication works · [x] Authorization server-side (rows) · [ ] Authorization server-side (money columns, all tables)
- [x] Migrations build from scratch · [x] Backup script exists · [ ] Restore drilled
- [x] Rental creation · [x] Editing lines before Confirm · [ ] Cancellation verified · [x] Inventory reservation · [x] No double booking (DB constraint) · [ ] Availability shown on Calendar
- [x] Pricing · [x] Discounts (ruled ungated) · [x] VAT in app · [ ] VAT in DB agrees (§4.42b)
- [ ] **Payments** · [ ] **Balance calculation on real rows** · [x] Returns · [x] Inspection · [ ] **Damage charge** · [ ] **Documents** · [ ] **Reports on real data**
- [x] Search · [x] Filters · [ ] Notifications · [x] Audit log · [x] Error handling · [x] Mobile (built, not re-verified)
- [x] Security scrub · [x] Tests pass · [x] Build passes · [x] Lint passes (3 Sep: clean at HEAD and tree) · [ ] Production deployment evidenced · [ ] Monitoring evidenced · [ ] Backup/recovery tested
- [x] No critical secrets exposed · [ ] **No critical mocked workflows remain** · [ ] **No critical TODOs remain** (278 rulings open by design)

## 20. Final verdict

**NOT READY.** Not because the work is poor — the database layer and the floor workflows are better engineered than most shipping rental systems — but because the two things a rental company must do every day, **bill and collect**, do not exist, and because no rental can ever be closed. Fix P0-1 and P0-2 and this moves to *READY WITH BLOCKERS* on the strength of what is already verified. Fix P0-3 and the real corpus can come in.

---

## Addendum A — agent cluster: resilience (score 46) · *refuted 3 Sep: 0 of 3 P1s stand — all three downgraded to P2*

28 findings, 15 verified by tracing or running, 8 inferred, 0 secrets. **Score revisions:** Deployment **50 → 45** (monitoring is a silent no-op: `lib/monitoring.ts:214` returns immediately without `VITE_SENTRY_DSN`, which is unset, so **all 27 `captureError` sites log nothing** — RES-09). Offline classification confirmed **PARTIAL**, with the queue itself carrying three P1 defects. The cluster also claimed that at HEAD `b7356ce` **27** action files set `implemented: true` (not 16). **That claim is retracted**: a direct grep on 3 Sep finds **16** at the working tree and 16 at HEAD (37 files declare the key), and the forms cluster counted 16 independently. The brief's figure stands.

| ID | Sev | Where | Problem → impact → fix |
|---|---|---|---|
| RES-01 | **P2** (was P1) | `floorVerb.ts:1157-1159`, `offlineQueue.ts:101-109`, `dataAccess.ts:117,206,218` | One action updating N rows offline **queues only the first row**: every unit shares one `actionUuid`, `enqueueMutation` dedupes on `[table+action+clientUuid]` and returns `false`, and `safeUpdate`/`idempotentInsert` discard it while returning success. → A multi-unit Return/Pack captured offline silently loses all units after the first; the screen says saved. → Key the queue per row (`${actionUuid}:${rowId}`), propagate `queued`/`false`. |
| RES-02 | **P2** (was P1) | `offlineQueue.ts:127,192` | Replay marks a row `syncing` before the call; pending selects only `pending`, dead-letter only `failed`. A tab closed mid-drain **strands the row forever**; `pendingCount` reads 0. → Silent loss. → Reset `syncing` → `pending` on module load (replay is idempotent via stored `client_uuid`). |
| RES-06 | **P2** (was P1; §4.21 open) | `dataAccess.ts:118,207`; `floorVerb.ts` has no offline guard | A queued write and a committed write return the **identical shape** — no `queued` discriminant — so Pack/Handover/Return/Reset can report "saved" for rows sitting in IndexedDB; in true airplane mode the verb's own reads fail first and it throws a raw read error. → Decide §4.21(1); add `queued: true` and render "Queued — not yet saved". |
| RES-07 | P2 | `auth.tsx:182-185`; `vite.config.ts:50,61` | With a persisted session but no network, the `users` profile read fails and Shell routes to `/login`; the SW cache never includes `rest/v1/users`. → **A warehouse tablet cannot start the app offline at all** — the Phase 9 "airplane mode" gate fails at the login screen. → Persist `{id,name,role}` beside the session; re-validate on reconnect. |
| RES-09 | P2 | `monitoring.ts:214,303` | `captureError` no-op without DSN; global handlers attach nothing. → Zero error tracking in the current build. → `if (!DSN && DEV) console.error(...)`; set the DSN per environment. |
| RES-12 | P2 | `OperationsShell.tsx:150-152,297` | "Offline · N queued" chip counts button presses and is zeroed by a 600 ms timer — never reads the real queue. → A fabricated pending count on the floor UI. → Use `useSync().pendingCount`. |
| RES-15 | P2 | `vite.config.ts:61-70` | Workbox NetworkFirst caches `rest/v1/bookings*` keyed by URL only. → On a shared tablet a Manager's money-bearing response can be served to a later Warehouse login offline — **Law 6 bypass via browser cache**. → Key the cache by user id or clear `supabase-*` caches on sign-in/out. |
| RES-16 | P2 | `syncEngine.ts:162,171`; `localStore.ts:9` | `pullDeltas` reads base `products` with `select('*')` and stores `daily_rate_paisa` in IndexedDB for every role. → Money lands on a Warehouse device (or the pull is silently swallowed on 42501). → Pull from `products_v` / `client_directory_v` with an explicit column list. |
| RES-10 | P2 | `syncEngine.ts:164-196`; `localStore.ts` | 600 rows pulled every 25 s into a cache with **zero readers**; "Offline Mode active (Dexie cache)" (`Header.tsx:266`) is a false description. → Wire a `useList` fallback or stop pulling and drop the claim. |
| RES-03/04/05/08/11 | P2 | `offlineQueue.ts:69,101-109,202-205`; `dataAccess.ts:128,216`; `auth.tsx:244-255` | Dead-lettered rows block retries as duplicates; replay is blind last-write-wins with no conflict write; the "failed mid-request → queue" branch can never match postgrest-js's message shape; `getSession()` has no `.catch` (permanent "Restoring session…"); dead-letter review exists only in unrouted `archive/`. |
| RES-13…28 | P3/P4 | banner copy over-promises and lacks `aria-live`; SW runtime patterns name non-existent tables; no retry backoff; raw Postgres error text reaches operators; `SoundEngine` dead; per-row `client_uuid`s minted per attempt on floor line inserts; offline stack has no behavioural tests; `createLiveClient` throws pre-mount on missing env; single ErrorBoundary excludes the shell; no "as of HH:MM" freshness; manifest "Scan" shortcut points at a route that does not exist. |

Contradictions the cluster settled against older docs (code wins): PLAN.md Phase 9's "the Dexie queue has no producer / nothing drains it" — `dataAccess` is imported by 17 files and `drainQueue` runs on boot, on `online`, and every 25 s; OFFLINE_SPEC_v1_VERIFICATION §5–6's "floor screens dispatch empty payloads / supply no action key" — all four workspaces now mint a completion key once and dispatch real lines.

**Refutation (3 Sep, adversarial, traced):** every mechanism is confirmed exactly as filed and none is ruled or fixed — PLAN §4.35 registered E-P1-1/2 on 16 Aug and never re-verified them; §4.21 is still OPEN (PLAN.md carries *two* headings numbered 4.21, at :2575 and :2621 — doc rot). Severity fell because the ordinary offline path never reaches the write loop: `floorVerb` reads `booking_lines` first (not in the SW cache pattern) and throws on failure, and a connection lost mid-loop throws loudly because the "Failed to fetch" branch in `dataAccess` cannot match postgrest-js's error shape (the cluster's own RES-05). The silent N−1 loss (RES-01) and the stranded `syncing` row (RES-02) therefore need `navigator.onLine` to flip *between* a verb's reads and its write loop — a real but seconds-wide race, widest in `completeResetQueue`, which has no reads inside the loop. `floorVerb.ts` is the only `src/actions` file writing through `dataAccess` with no online guard; the other 12 refuse offline or detect a queued payload by its missing server column — a house workaround RES-06 could adopt without waiting on §4.21. Note also that RES-01's headline citation (`safeUpdate('booking_line_units'`) exists only in the other session's uncommitted `floorVerb.ts`, not at HEAD. **All three re-raise to P1 the moment §4.21(1) rules "queue" for floor verbs.**

## Addendum B — agent cluster: delivery (score 50) · *refuted 3 Sep: 4 of 6 P1s stand (DEL-13, DEL-16, DEL-01, DEL-02 → §6 P1-8…P1-10); DEL-10 and DEL-12 downgraded to P2*

27 findings, 8 verified by running, 7 inferred; **6 P1**. Its own re-run of the suite: **104 files / 2,363 tests passing** (3 Sep). **Score revisions:** Testing 60 → **58**; Deployment 45 → **35** (no host chosen, CI has never executed, no live backup); Security 62 → **55** (token in archives, no storage policies, cache bypass). Overall → **52**.

| ID | Sev | Where | Problem → impact → fix |
|---|---|---|---|
| DEL-13 | P1 **stands** (operational blocker → P1-8) | `scripts/check-dump.mjs:10` | **No verified dump of the LIVE database exists anywhere on disk**; Supabase Free has no PITR or automated backup; the only dump is an 805 KB local-stack file. → A bad migration, a mistaken MCP write, or a project auto-pause loses 366 clients / 246 bookings with no recovery except migrations that do not reproduce production. → `pg_dump` live now, run `check:dump`, restore once into the local stack, schedule a weekly off-machine dump. **Do this before anything else in Phase 0.** |
| DEL-10 | **P2** (was P1) | `.github/workflows/ci.yml:8` | **CI has never run** — the workflow triggers on push/PR and the repo has no remote. → The typecheck/test/build gate is enforced by session discipline only. → Push to a private remote; add `npm run lint` to the job (DEL-11). |
| DEL-12 | **P2** (was P1) | `README.md:137-139`, `vercel.json`, `Dockerfile`+`nginx.conf`, `public/_redirects` | **No hosting target chosen or deployed**; three deploy configs coexist and already disagree on cache rules. → Nothing is live for the business; a Vercel deploy could pin devices to a stale `index.html`/manifest. → Rule the host (PLAN §4), delete the other two, add html/manifest no-cache to the survivor. |
| DEL-16 | P1 **stands, wider** (→ P1-9) | `../backups/**`, `../QA-BACKUP-*/full-history.bundle`, `../babin-rentals-os.rar` | Token scrub held in the repo, but a live-shaped 64-char Booqable token remains in **five pre-scrub archives** on this machine. → If not rotated, it is valid and readable from plaintext copies. → Rotate in Booqable, store only as the `booqable-proxy` function secret, delete or re-scrub the archives. |
| DEL-01 | P1 **stands** (→ P1-10) | `vitest.config.ts:35` | No E2E/browser tests; the 12 critical workflows are covered only by unit suites that replace `../supabase` with an in-file recording builder. → A wrong column, RLS refusal, trigger rejection or numbering collision on live passes every green run. → Playwright against `dev:local` (now buildable) for the 12 workflows, Owner + Warehouse identities. |
| DEL-02 | P1 **stands** (→ P1-10) | `scripts/check-rebuild.mjs:34` | Nothing asserts database behaviour — no pgTAP, no test exercises `validate_booking_gates`, `recalculate_invoice_totals`, `trg_bookings_reject_delete` or the 0021 trigger; the mock emulates only 0021. → Trigger-level money, gate and immutability rules are unverified by any automated run. → pgTAP inside `check:rebuild`'s scratch DB, starting with the §2.8 reference case through the trigger. |
| DEL-22 | P2 | `EvidenceWorkspace.tsx:345`, migrations | **No Supabase Storage bucket exists in any migration and no `storage.from()` call exists in `src`**, yet damage reports require a photo. → Evidence, damage and receipt photos cannot be stored anywhere — deepens P1-2. → Migration creating `evidence`/`receipts` buckets with role-scoped policies; one upload helper. |
| DEL-17 | P2 | `supabase/functions/booqable-webhook/index.ts:121` | Only `booqable-proxy` is deployed (ACTIVE v1, `verify_jwt=true`); the webhook is not, and nothing imports the bridge. → No inbound sync path exists; orders after #899 never arrive. |
| DEL-18 | P2 | `lib/booqable/map/orders.ts:264` | Bridge mints `BK` numbers; imported rows use `B-<Booqable no.>` — two conventions. → Folded into P0-3 above. |
| DEL-05 | P3 | `src/lib/supabase.ts:2` | The mock backend and the whole seed corpus (96 KB source) are compiled into the **live** main chunk. → Dead weight plus fabricated names/emails shipped to every production visitor. → Split entries by build mode. |
| DEL-03 | P2 | `actions/clients/updateClient.ts:24` | `UPDATE_CLIENT` still has no `implemented: true`; the dispatcher refuses it, so ClientDetail inline edit cannot persist (honestly). |
| DEL-20 | P2 | `ImportCenter.tsx:63` | Client CSV import parses, maps and de-duplicates but its Import button is permanently disabled — "no client-import action exists". |
| DEL-07 / DEL-14 | P2 | `vite.config.ts:47`; `monitoring.ts:303` | Same findings as RES-15 (cache bypass of Law 6 on shared tablets) and RES-09 (DSN unset → error tracking a no-op). |
| DEL-24 | P3 | live project | A schema `bakery_archive` (22 unindexed-FK lints on `cake_orders`) exists in production that no migration creates. → Untracked objects; a from-scratch rebuild would not reproduce them. → Identify owner; drop via approved migration or document as external. |
| DEL-04 / DEL-08 / DEL-06 | P2–P3 | `ScannerFab.tsx:3`, `dist/sw.js`, `src/data/*` | The 453 KB scanner chunk is modulepreloaded on every page; the SW precaches all 143 entries (3.38 MB) on first visit; 1.1 MB of fixture arrays ride the route chunks. |
| DEL-09 | P3 | advisors (ran) | 319 unindexed FKs, 403 multiple-permissive-policy warnings, 11 `auth_rls_initplan` warnings, 86 unused indexes — negligible at 246 bookings, visible later. |
| DEL-15 / DEL-19 / DEL-21 / DEL-23 / DEL-25 / DEL-26 / DEL-27 | P3–P4 | various | Health checks only on the Docker path; the two SQL importers confirmed as armed hazards; three phone normalisers with different rules; auth email on shared Free-tier SMTP; CLI migration tracking disabled (manual apply by design — add a ledger-vs-directory diff in CI); `count: 'exact'` on every list; coverage limited to `src/lib` with no threshold. |

Contradictions the cluster settled: BUG-013's stub list (every `[DB TX]` in `src/actions` is inside a JSDoc history note); `BRIDGE-AND-CORPUS-STATE.md` §4's one-to-one numbering claim (the typed bridge never reads Booqable's number) and §6's "hard-coded in four scripts" (superseded — all four read `process.env` at HEAD; the exposure moved to the archives); `FULL_FUNCTIONAL_AUDIT.md` §12/§14's "environment cannot be built" (it can, 79/0 — those rows are untested, not blocked); README's "two deploy configs" (there are three); this report's own "100 files / 2,338 tests" (104 / 2,363 on re-run).

**Refutation (3 Sep, adversarial):** DEL-13 was re-verified *live* — the organisation's plan is `free` and the project is ACTIVE_HEALTHY on PG 17.6.1, so "no PITR, no automated backup" is current; a workspace-wide hunt found one `pg_dump`-shaped file, the 805 KB dev dump. DEL-16 was re-counted (values never read) and found **wider**: beyond the five archives, the token sits in plaintext in the 31 Aug snapshot's working-tree scripts and in the QA-BACKUP worktree's sync script; the zip, bundles and rar were not opened and are inferred by construction. DEL-01 and DEL-02 stand as one finding — no test reaches a database — with PLAN §4.42 itself naming the missing trigger test. DEL-10 fell because there is no defect: `ci.yml` is well-formed and would run on first push; the missing piece is one decision (a private remote). DEL-12 fell because the host decision is already a registered `TODO(decision)` at `README.md:138` (the filed `:129` was off), each config is individually valid, and the nginx-vs-vercel cache drift only bites once a host is chosen (P3 latent).

## Addendum C — agent cluster: forms & interactions (score 58) · *no P1 filed; nothing to refute*

12 findings (6 P2, 5 P3, 1 P4), 10 verified by running or tracing, 7 inferred, 0 secrets. The cluster ran 12 form suites (**222 tests pass** at the tree), eslint on 11 form files (exit 0) and a comment-stripping dead-control scan over `src/modules` + `src/components`, and traced every named form's submit target and refresh path. **Verdict on §36/§37:** seven of ten named forms validate inline (Law 12) and write through implemented actions with Law 8 keys; but the §12 test — *submit, refresh, still there* — fails for Add Bundle, Purchase Request and Log Case, four enabled controls open onto dispatcher-refused stubs, nine dead controls recorded on 17 Aug are still live, no form has an unsaved-changes guard, and validation is duplicated per form while the shared engine has zero importers.

| ID | Sev | Where | Problem → impact → fix |
|---|---|---|---|
| FORMS-01 | P2 | `EvidenceWorkspace.tsx:472` (7 map-generated buttons from `data/evidence.ts:96`); `PackingWorkspace.tsx:719`; `ReturnWorkspace.tsx:851` | **Nine dead enabled controls survive the 1–2 Sep dead-button fixes**: selecting a photo renders Assign Product / Assign Category / Download / Export ZIP / Generate PDF / Rotate / Remove with no handler and no `disabled`; both floor **Print** buttons are bare. → Operators press Print and nothing happens; Remove/Download silently do nothing — the exact class BUG-004 was filed for. → Wrap all nine in `Unavailable` (or wire Print to `printSlip` as New Rental does); key the seven by label so a new entry without a reason fails to compile. |
| FORMS-02 | P2 | `NewRental.tsx:2572` → `saveDraft.ts:18` (`implemented: false`) | **Save Draft fails on every press** — honest inline error, dishonest control (§37). The Cancel-after-draft branch is unreachable because `draftPersisted` is only set on success. → Operators cannot park a half-built booking; local state is the only copy. → Gate with `Unavailable` until `rental.draft` exists (its id placeholder is a `TODO(decision)` in the file). |
| FORMS-03 | P2 | `StockCheck.tsx:877` → `reconcileStockCheck.ts:20` | **A stock audit can never be completed from the UI**; the primary button is enabled whenever a session is selected and always ends in the inline error, while the sibling *Confirm missing* on the same screen is honestly Unavailable — the screen contradicts itself. → Gate it; no action writes `stock_audits.completed_at`. |
| FORMS-04 | P2 | `BookingDetail.tsx:1471,1476,1588-1594` → `extendRental.ts:18`, `bookCrew.ts:20`, `createSubRental.ts:21` | **Three full modal forms** (Extend rental, Assign crew, Create sub-rental) validate properly and are refused on every submit. → An operator fills a multi-field form and learns only at submit that nothing can be saved; on a Booked rental they read as live features. → Gate the openers (reuse `SubRental.tsx`'s reason) or build the three actions. |
| FORMS-05 | P2 | `PurchaseRequests.tsx:293,171`; `CreatePurchaseRequestModal.tsx:74` | **New Purchase Request fabricates locally**: the modal only emits an event, the list prepends the payload and closes as a success, nothing writes `purchase_requests`; the row vanishes on refresh — while *approve* on the same screen is real. → Approvals can act on phantom rows. → Gate the opener (Maintenance pattern) until a `purchase.create` action exists; refetch instead of prepending. |
| FORMS-06 | P2 | `AddBundle.tsx:682`; `Bundles.tsx:26-27`; `lib/queries/bundles.ts` (0 importers) | **Add Bundle writes for real, then lands on a list that cannot show it**: the toast quotes a real BND code, but the Bundles tab renders the seed arrays and never queries the database. → §12 fails for every bundle (Layer-D 28 % class). → Wire `Bundles.tsx` to `lib/queries/bundles.ts` through `useList`, refetch on `BUNDLE_CREATED`. |
| FORMS-07 | P3 | all forms; `AddBundle.tsx:1728` | No `beforeunload` / `useBlocker` anywhere under `src/`; Cancel-only confirms on four forms, none on Add Bundle. → Sidebar, Back or reload silently discards a New Rental draft that Save Draft (FORMS-02) also cannot keep. → One shared `useUnsavedGuard(isDirty)`. |
| FORMS-08 | P3 | `lib/validation.ts:5` (0 importers); `NewRental.tsx:1290-1295` | No schema library; validation re-invented per form *and* per action; the two days-rules disagree — New Rental's `Math.max(0, round)` blocks a same-day rental that `validation.ts` and Law 9 at the DB allow. → Rule the same-day question; make New Rental call `validateRentalDates`. |
| FORMS-09 | P3 | `settingsStore.ts:492-497`; `NewRental.tsx:1276` | Settings validate inline but persist to `localStorage` only; `system_settings` holds 0 rows live and New Rental reads the VAT rate from this store — **a money rule is per-browser**; two devices can price the same booking at different VAT. → Back the store with `system_settings`, keep `localStorage` as the offline cache. |
| FORMS-10 | P3 | `ExpenseReports.tsx:929-933` | The honest-disabled *New Expense* / *Import* carry a **false reason** — "nothing in the app writes an expense row" — while `/finance/expenses` writes one (`createExpense`, Law 8 key, refetch). BUG-006's rationale was wrong when written. → Point the reason at `/finance/expenses`; correct BUG-006. |
| FORMS-11 | P3 | `ClientDetail.tsx:367-374`; `updateClient.ts` stub | Inline edit saves to component state only; the three money modals on the same screen are honestly Unavailable. Labelled, so P3 (= DEL-03). → Build `updateClient` by mirroring the `clients` RLS. |
| FORMS-12 | P4 | `Input.tsx:123-136`; `RecordPaymentModal.tsx:339`; `LogCaseModal.tsx:170` | Inline errors persist (Law 12) but are not announced — no `role="alert"`; modal labels lack `htmlFor`; `NewRental.tsx:1551/1879` still `console.error` after b7356ce (file in flight). |

**Feature matrix (19 rows).** COMPLETE: Login · Add Client · Add Equipment · Record Payment · Expenses sheet · the BUG-002/003/004/006/007/009 dead-control fixes (all still present at their lines) · Clients-directory bulk actions (Export Selected writes a real CSV; Block/Unblock dispatch `blockClient` per id with a ≥10-char reason). FUNCTIONAL_BUT_INCOMPLETE: New Rental → Confirm (Save Draft refused) · Add Bundle (list seed-only). PARTIAL: Stock Check · Settings · Bundles/Documents/Evidence bulk menus. MOCKED: Log Case (mints `CASE-2026-<random>`, writes nothing; opener honestly gated) · Client Detail inline edit · Purchase Request. DISCONNECTED: the three Booking-Detail modals · Invoice create/void (= P0-1, not re-filed). MISSING: Rentals-list bulk actions (the only `selected` set is the status filter). RULED: Inventory bulk actions — its `Unavailable` cites "Inventory §4.1", which is *Inventory.md v3.0* §4.1, not PLAN.md §4.1 (token drift).

**Contradictions settled (code wins):** `FUNCTIONAL_BUGS.md` BUG-007's "0 dead enabled buttons on /evidence" — the probe never selected a photo; BUG-006's "nothing writes an expense row" — `createExpense` existed at HEAD and at 4696af8 with no commits between; PLAN.md §6.4's "nothing wired to" the Clients bulk selection — stale; `INTERACTION_INVENTORY.md` §2's "none on packing/return" — both bare Print buttons were already listed in `docs/pages/09_packing.md:183` and `11_return.md:144` on 17 Aug; `ExpenseReports.tsx`'s own reasons misdirect operators away from a working form; **this report's P1-5** — the dispatcher throws before execute and every caller catches into an inline error, so the defect is honesty, not fake success (reclassified P2 above); **this report's P2-3** — clear at the tree *and* at HEAD (no commit has touched the file since the audit began); withdrawn.

**Score for the dimension: 58** — seven honest, working forms against three fabricating ones, four always-fail controls, nine dead controls and no draft or unsaved-changes path on the most-used screen. Frontend and UX in §2 stay as scored: this cluster measured wiring, not design.

*Addenda A–C are complete and refuted. The remaining eight clusters — architecture, frontend-design, data-connection, database, rental-lifecycle, inventory-availability, money, auth-security — **failed on the first run with "API Error: 529 Overloaded"**, an upstream outage rather than a repo finding, and were re-launched on 3 Sep with the completed agents cached. Their results append here as Addenda D onward; their P0/P1s enter §6 only after refutation. Until then the Frontend and Mobile scores stay provisional.*
