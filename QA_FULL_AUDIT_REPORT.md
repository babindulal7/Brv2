# Babin Rentals OS — Full Process / E2E Audit

**Date:** 4 September 2026 · **Commit:** `a930db5` (`step1-foundation`)
**Method:** static audit of a worktree pinned to HEAD, plus the running application driven
against a local database rebuilt from all 85 migrations, plus **read-only** queries against
the production project.

---

## EXECUTIVE SUMMARY

**Verdict: FAIL** — not because the build is broken (it is clean), but because **four of the
business's core create operations are broken on production right now**, and the rental
lifecycle has no terminal step.

The engineering quality here is unusually high. Typecheck, lint, 2378 tests and the
production build are all green; the migration set builds from scratch; the code documents
its own gaps honestly rather than faking success; Law 6 money-masking, the `client_uuid`
idempotency law and the handover gate chain all **work** when tested against a real database.

What fails is not craftsmanship. It is that **the money and operations subsystems have never
been exercised in production** — and they do not survive first contact.

### The single most important finding

`next_document_number` formats with `lpad(value, padding, '0')`, and Postgres `lpad`
**truncates** when the value is longer than the width. Four live sequences have `padding = 1`.
Computed directly against production (read-only):

| sequence | live `current_value` | next number it would mint | should be |
|---|---|---|---|
| booking | 917 | **`B-9`** | `B-918` |
| client | 750 | **`C-7`** | `C-751` |
| invoice | 120 | **`INV-1`** | `INV-121` |
| deposit | 89 | **`DEP-9`** | `DEP-90` |

The *first* create writes a wrong number; the *second* collides on the unique index and
fails. So on production today: **creating a booking, a client, an invoice or a deposit is
broken.** Verified that live still runs the truncating function (`has_greatest_fix = false`).

The fix already exists in this repo — `0085` step 6 replaces the width with
`greatest(padding, length(v))` — and is **verified working on a rebuilt database**, where the
same operation mints `900`, `901`, `902` correctly. **`0085` has not been applied to
production.**

### Why the damage is contained — for now

Production holds master data but **no transactional history at all**:

| bookings | clients | products | invoices | payments | deposits | expenses | operation_sessions | stage transitions |
|---|---|---|---|---|---|---|---|---|
| 246 | 366 | 204 | **0** | **0** | **0** | **0** | **0** | **0** |

Not one invoice, payment, deposit or floor operation has ever been recorded in production.
Every money defect below is therefore **latent, not yet destructive** — and that is the
opportunity: they can all be fixed before the first real transaction, not after.

---

## APP HEALTH

Full detail in [`QA_APP_HEALTH_REPORT.md`](QA_APP_HEALTH_REPORT.md). Summary at HEAD:

| Check | Result |
|---|---|
| `tsc --noEmit` | exit 0 |
| `eslint src --max-warnings 0` | clean |
| `vitest run` | **106/106 files, 2378 tests pass** |
| `vite build` | exit 0, PWA generated |
| `check:rebuild` (all migrations from scratch) | **86 applied, 0 failed** |

One health defect: **the migration set cannot produce a usable database on its own.** No
migration grants base-table privileges to `authenticated`; the app depends on platform
default privileges that are not in the repo. A DR rebuild yields a database the app cannot
read (`42501 permission denied for table users`). Found by driving the app, not by reading it.

---

## MODULE COVERAGE

73 routes are declared in `src/App.tsx`.

| Area | How it was tested | Result |
|---|---|---|
| Login / auth | driven, prod build, 3 roles | works |
| Dashboard (Today) | driven | renders real data |
| Operation + queues | driven | renders, queue chips filter |
| Rentals list / detail | driven | works |
| **Handover workspace** | **driven end-to-end, DB-verified** | **works** |
| Inventory | driven | renders |
| Clients | driven | renders |
| Calendar | driven | renders |
| Finance ▸ Payments / Documents / Expenses | driven | render |
| Reports ▸ Pulse | driven | renders |
| Settings | driven | renders |
| Invoices | route table inspected | **no route exists** |
| Pricing / payments / invoices / availability / inventory / security | static + SQL probes | see findings |
| **Responsive / mobile / PWA offline** | **not tested** | **see Not Covered** |

---

## FULL RENTAL LIFECYCLE RESULT

Tested against the local database, driving the real UI and verifying every step in Postgres.

| Step | Result |
|---|---|
| Create booking (`create_booking`) | **PASS** — minted `900`, stage Quote, line written |
| Idempotency (same `client_uuid` twice) | **PASS** — 2nd call `replayed: true`, exactly 1 row |
| Law 9 enforcement (days must be stated) | **PASS** — refused a line with no `days` |
| Per-row `client_uuid` requirement | **PASS** — refused a line without its own key |
| Actor requirement | **PASS** — refused "no system actor" |
| Handover gates (6 gates) | **PASS** — all enforced, dispatch blocked until cleared |
| Handover dispatch → DB | **PASS** — `operation_sessions` row + stage transition written, stage → **On Rent**, navigated to booking |
| **Close the rental** | **FAIL — impossible.** `closeRental.ts` is 343 lines, fully built, **absent from the actions barrel and imported by nothing**. Verified: it appears in `src/` only inside two comments. |

**The lifecycle cannot complete.** A rental can be created, confirmed, packed, handed over
and returned — and then stops at Returned forever. Deposits are never released and no rental
is ever financially settled.

---

## BUG SUMMARY

Severity: **P0** app cannot operate / data corruption · **P1** core workflow broken ·
**P2** important but workaround exists · **P3** minor · **P4** cosmetic.

**Verified** = reproduced against a database or the running app during this audit.
**Reported** = surfaced by a dimension auditor with cited evidence, **not independently
re-verified** — the adversarial verification pass had not returned at write time.

| ID | Sev | Module | Finding | Status |
|---|---|---|---|---|
| BUG-001 | **P0** | Numbering | `lpad` truncates: live mints `B-9`, `C-7`, `INV-1`, `DEP-9`; second create collides | **Verified (live)** |
| BUG-002 | **P0** | Rentals | Lifecycle cannot reach Closed — `closeRental` has no importers and is not exported | **Verified** |
| BUG-003 | **P0** | Finance | `createInvoice` never reads `booking_crew_lines`/transport — crew charges cannot be billed (NPR 2,817,300 across 79 bookings in the corpus) | **Verified** |
| BUG-004 | **P1** | Security | **Unauthenticated `anon` can INSERT forged rows into `audit_events`**, and Law 3 makes them undeletable by every role incl. `service_role`. Policy `audit_events_insert` is `WITH CHECK (true)` for all roles — **confirmed on the production policy** | **Verified (live policy)** |
| BUG-005 | **P1** | Availability | Same physical unit accepted onto two overlapping bookings. The correct `EXCLUDE` guard exists on `inventory_reservations` — but that table is **empty in both environments** and the real path (`booking_line_units`) has no overlap guard | **Verified** |
| BUG-006 | **P1** | DevOps/DR | No migration grants base-table privileges to `authenticated`; a rebuilt database is unreadable by the app | **Verified** |
| BUG-007 | **P1** | Invoicing | `LINE_KIND_BY_TYPE` maps `Crew`/`Transport`, which are **not** members of `booking_line_type`; real members `Accessory`, `Bundle`, `Manual item` have no mapping and silently fall back to `'Equipment Rental'` (`createInvoice.ts:452`) | **Verified** |
| BUG-008 | **P0** | Rentals | A booking with a pending security deposit can never leave Packed — no code path can reduce `security_deposits.pending_amount` | Reported |
| BUG-009 | **P0** | Payments | Handover money gate blocks 48 of 53 open bookings; R-06 unimplemented | Reported |
| BUG-010 | **P0** | Deposits | Close gate tests `pending_amount` (uncollected) rather than unreturned deposit — 12 closed bookings hold Rs 180,000 of client money | Reported |
| BUG-011 | **P0** | Finance | Raising an invoice permanently blocks handover (DB gate counts Draft balances) | Reported |
| BUG-012 | **P0** | Finance | No payment can be recorded against any app-created invoice — Drafts have no `invoice_no` and `recordPayment` resolves by number | Reported |
| BUG-013 | **P1** | Payments | A payment can be reversed repeatedly and for more than its value; over-reversal erases other payments' money | Reported |
| BUG-014 | **P1** | Security | Forward-only stage transitions bypassable — 0021's column revoke is inert (still present at HEAD) | Reported |
| BUG-015 | **P1** | Security | Law 6 column masking armed on 9 tables; 15 more carry inert column revokes | Reported |
| BUG-016 | **P1** | Rentals | A booking can be inserted directly at any stage, including Closed, with no gate check or stage history | Reported |
| BUG-017 | **P1** | Rentals | A Warehouse user can self-approve a stage reversal dropping a booking three stages back | Reported |
| BUG-018 | **P1** | Availability | `readHolds` is an unbounded PostgREST select silently truncated at 1000 rows; holds are never released | Reported |
| BUG-019 | **P1** | Inventory | Add-Equipment's "unique across the whole system" serial check reads a hardcoded 34-serial seed map, never the database | Reported |
| BUG-020 | **P1** | Rentals | Second pass of a staggered handover/return can never be recorded — reused Law 8 key collides on `operation_sessions` | Reported |
| BUG-021 | **P2** | Performance | `/clients` fetches `invoices` **3× with an identical URL** on one navigation (production build) | **Verified** |
| BUG-022 | **P2** | Security/Perf | `syncEngine.ts:162,182` pulls `products` and `clients` with `select('*')`, against the codebase's own column-naming discipline for masked columns | **Verified** |
| BUG-023 | **P3** | Data | 74 of 120 seed invoices carry VAT rounded to whole rupees, disagreeing with a 2-dec recompute by up to 0.50 (total 22.04). The engine is correct; the data is not — and issued invoices are immutable, so it cannot be corrected in place | **Verified** |
| BUG-024 | **P4** | Naming | `delivery_type` enum contains **"Customer Pickup"** — the banned word survives in the data model behind a UI translation | **Verified** |
| BUG-025 | **P4** | Hygiene | Four zero-byte junk files in the repo root (`0`, `100`, `MAX_EVENTS_PER_SESSION)`, `users`) | **Verified** |

A further 26 findings (mostly P1/P2 across pricing, payments, invoicing, availability and
inventory) are held in the raw finding set. Five audit dimensions had not returned at write
time — see **Not Covered**.

---

## DATA INTEGRITY RESULTS

Checked with SQL against the rebuilt corpus:

| Check | Result |
|---|---|
| Invoice lines sum to subtotal | **0 disagreements** |
| `outstanding = total − paid` | **0 disagreements** |
| `taxable + vat = total` | **0 disagreements** |
| `taxable × vat_rate = vat_amount` | **74 of 120 disagree** (≤ 0.50 each, 22.04 total) — BUG-023 |
| Existing double-committed units | 0 pairs — but only **1 booking in the corpus has unit rows at all** |
| "Nothing is deleted" (Law 3) | **enforced** — DELETE refused even for `service_role` |
| Duplicate-write rejection (`client_uuid`) | **enforced** — replay returns `replayed: true`, 1 row |

---

## FINANCIAL RECONCILIATION

Production has **zero** invoices, payments, deposits and expenses, so there is nothing to
reconcile there — and nothing yet at risk. Against the local corpus, invoice arithmetic
reconciles except the VAT rounding above.

The material finance findings are structural, not arithmetic:

- crew and transport revenue **cannot be invoiced at all** (BUG-003 / BUG-007),
- app-created invoices **cannot receive a payment** (BUG-012, reported),
- issued invoices are correctly immutable: `recalculate_invoice_totals()` collides with
  `reject_invoice_edit_after_issue()`, so **any line write on an issued invoice fails**.
  That is Law 4 working as designed — but it also means the VAT drift can never be corrected
  in place.

---

## SECURITY RESULTS

| Test | Result |
|---|---|
| Law 6 — Warehouse reading money on `client_directory_v` | **PASS** — money columns return `null`; Owner sees real values |
| Law 6 — Warehouse reading `invoices`, `payments`, `expenses`, `invoice_lines`, `security_deposits` | **PASS** — 0 rows; Owner/Coordinator see 120 / 93 / …, so this is masking, not emptiness |
| Warehouse *writing* a price it cannot read | **PASS** — PATCH matched 0 rows; the reported "warehouse can rewrite prices" claim **did not reproduce** |
| Anonymous INSERT into `audit_events` | **FAIL** — HTTP 201, row written, undeletable; production policy confirms it |
| Audit trail SELECT | **PASS** — restricted to Owner / Admin / Manager |

---

## PERFORMANCE RESULTS

Reported with a caveat: the browser pane runs hidden, so **timers are throttled 5–23×**
(measured: a 100 ms timer fired at 494–2290 ms). Only throttle-independent evidence is used.

- `/clients` (production build) issues 5 REST calls, of which `invoices` is fetched **3×
  with an identical URL** — BUG-021.
- `/inventory` (dev) issues 23 calls, 11 of 12 distinct URLs exactly doubled — that doubling
  is React StrictMode in development and **does not occur in production**; not filed.
- No request loop while idle (0 calls in a 12 s idle window).

An earlier reading of a "7-second main-thread freeze at login" was **the throttling
artefact, not the app**, and is withdrawn.

---

## MISSING FEATURES (not bugs)

- **Nepali (BS) dates are unavailable app-wide.** The engine is anchored to a single month
  (Shrawan 2083) and deliberately refuses to guess month lengths outside it; today falls
  outside, so every screen prints "Nepali date unavailable" and shows English instead.
  `src/lib/bs.ts` documents the need for the 2080–2090 BS month-length table. For a Nepali
  rental business this is a significant functional gap — but a stated one, not a defect.
- **Manager Override on session gates** — deliberately absent, with a written reason: no rule
  defines who may override, and no action records the approver.
- **Cash-due on the dashboard** — "No derivation exists in this build", stated on screen.
- **No invoice route** — Finance has no way to open an invoice.

---

## NOT COVERED — stated plainly

- **Responsive / tablet / mobile layouts:** not tested.
- **PWA install, offline, sync-conflict recovery:** not tested.
- **Full 73-route sweep:** roughly 15 routes were driven; the rest were not. Sweeping under a
  hidden, timer-throttled browser pane was too slow to complete reliably, and 15 routes
  actually checked is worth more than 73 nominally visited.
- **Five audit dimensions** — data integrity, forms/validation parity, reports reconciliation,
  cross-module propagation, and concurrency/idempotency — had not returned at write time.
- **The adversarial verification pass had not returned.** Every row marked *Reported* is
  single-source and may not survive scrutiny. Two claims I did check personally — "a warehouse
  user can rewrite prices", and my own earlier "the handover writes nothing to the database" —
  were **both wrong**. That is the honest measure of how much weight an unverified row carries.

---

## FINAL QA VERDICT

# FAIL

Not for want of quality. The build is green, the laws that are implemented are genuinely
enforced at the database rather than in the UI, and the code is unusually honest about its
own gaps. It fails because **four core create operations are broken on production today**,
the rental lifecycle has no terminal step, crew revenue cannot be billed at all, and the
audit trail can be forged by an unauthenticated caller and never cleaned.

One fact should shape the plan more than any other: **production has no transactional history
yet.** Every money defect is still latent. Fixed now, none of them ever becomes a real loss.
