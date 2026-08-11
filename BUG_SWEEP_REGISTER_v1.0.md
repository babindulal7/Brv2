# BUG_SWEEP_REGISTER_v1.0

**Target:** Babin Rentals OS — full static sweep per BUG_SWEEP_PROTOCOL_v1.0
**Method:** static audit (file read + tsc + grep), run under the impeccable skill's audit dimensions (see S-A)
**Manifest:** filesystem glob — 133 `.tsx` total, 99 under `src/modules` (see S-D; the workspace is not a git repo)
**Compile baseline:** 28 tsc errors, all in `src/lib/booqable/**` (concurrent session's in-flight work); zero in screens — but the zero is partly fiction: 12+ screen files carry `@ts-nocheck` (see S-C, P1-08, P1-31, P0-6)
**Date:** 10 Aug 2026
**Adversarial verification:** every P0/P1 candidate was re-verified against source; 12 candidates were downgraded (8 to P2, 4 to P3) with recorded evidence — marked † in the tables

---

## 1. Verdict

**Not shippable.** Six P0s stand: one actively posts payments against the wrong invoice, one renders every cost 100x, three are Law 6 money leaks to money-blind roles (including one carried, known, and still unpatched since the N-series spec), and one routed screen crashes on first render behind `@ts-nocheck`. Beneath them, 49 in-app P1s break numbered laws outright — RBAC consulted nowhere on the finance surface, payments mutable and unbounded, fabricated identities (`USR-001`/`Manager`, `mock-user`/`admin`) written into the audit trail, fake success toasts announcing deliveries and payments that never happened, and hardcoded AI panels asserting inventory facts no system computed.

**Shortest path to yes:**

1. **Fix the six P0s in the order given in §3.** They are small, none is blocked on a decision (P0-3's field-gating half is unblocked), and together they close every money-wrong and permission-leak defect of the top severity.
2. **Close the Law 6 / RBAC leak class as one patch family.** Twelve P1s share three patterns: missing `useCanViewMoney`/`canViewMoneyField` (P1-18, P1-21, P1-35, P1-41), ungated money-bearing modal launchers (P1-12), and hand-rolled or absent role checks (P1-04, P1-38). One shared helper pass kills the class.
3. **Collapse the duplicated `recordPayment` action and thread the real session through every dispatch.** P1-05, P1-13, P1-14, P1-17, P1-33 and P1-04 are all one root: two divergent RECORD_PAYMENT registrations plus fabricated `ActionContext`s.
4. **Delete every `@ts-nocheck` and re-run tsc** (P0-6, P1-08, P1-31, plus AddClient) — the compile gate is currently blind exactly where the defects are.
5. **Obtain rulings on open decisions 2 and 5** (§6) — they gate the last P1-class fixes (stacked-discount basis, Warehouse route access).

P2/P3 (166 items) follow in a scheduled polish pass; none blocks a supervised internal demo once the P0s land. Production shipping remains blocked on Phase 2 persistence regardless — the action layer is an acknowledged mock (see §7).

### Impeccable audit health score

| Dimension | Score /4 | Basis in findings |
|---|---|---|
| Correctness & wiring (A, C-wiring) | **1** | P0-6 crash cluster masked by `@ts-nocheck`; duplicate RECORD_PAYMENT registrations; double-dispatch on bulk handover; 6+ orphaned screens/components; floating promises throughout |
| Money & permission law compliance (B, E) | **1** | 5 of 6 P0s are money/permission; 35 money-law P1s; rbac predicates exist and are consulted nowhere on the finance surface; fabricated identities in the audit trail |
| Date engine discipline (F, Law 7) | **2** | lib/bs itself is sound and honest; violations are seed-layer stored-BS strings across 6+ data files, two modules a year off the product's TODAY |
| Design-system & component integrity (C, D) | **2** | theme.css layer is strong; drift in consumers — 2 dead-Tailwind components live on real paths, ~20 phantom-token sites, two parallel Card/Button families disagreeing on Law 15 |
| Interaction integrity & a11y (G, Laws 12/15/16, IMP) | **1** | systemic sub-44 targets incl. the dominant 34px Button; fake success toasts; hardcoded AI panels; loading/error/offline unreachable on nearly every screen |
| **Total** | **7 / 20** | |

**Rating band:** 18–20 impeccable · 14–17 ship with nits · 9–13 fix cycle required · 4–8 **not shippable — systemic defects** · 0–3 rebuild. **This build: 7/20 — not shippable, systemic fix cycle required.**

---

## 2. Counts

### By severity

| Severity | Count |
|---|---|
| P0 | 6 |
| P1 | 53 (49 in-app §4 + 4 skill-layer §5) |
| P2 | 111 (8 † downgraded from P1) |
| P3 | 55 (4 † downgraded from P1) |
| **Total** | **225** |

### By group

| Group | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| A — compile & wiring | 1 | 8 | 19 | 7 | 35 |
| B — the 17 laws | 3 | 29 | 24 | 9 | 65 |
| C — component API | 0 | 2 | 16 | 5 | 23 |
| D — colour & tokens | 0 | 0 | 18 | 3 | 21 |
| E — money | 2 | 6 | 5 | 2 | 15 |
| F — dates | 0 | 4 | 6 | 5 | 15 |
| G — states | 0 | 0 | 4 | 4 | 8 |
| IMP — implementation integrity | 0 | 0 | 15 | 19 | 34 |
| S — skill layer | 0 | 4 | 4 | 1 | 9 |
| **Total** | **6** | **53** | **111** | **55** | **225** |

### By module

| Module | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| finance | 1 | 5 | 5 | 1 | 12 |
| reports | 1 | 3 | 14 | 3 | 21 |
| rentals (+ data/booking, data/rentals, lib/money) | 2 | 9 | 11 | 7 | 29 |
| clients (+ data/clients, data/membership) | 0 | 3 | 9 | 3 | 15 |
| inventory (+ data/inventory) | 2 | 4 | 5 | 2 | 13 |
| operations + crew (+ data/cases, data/crew, data/operations) | 0 | 6 | 12 | 12 | 30 |
| today (+ data/today) | 0 | 3 | 6 | 3 | 12 |
| calendar (+ data/calendar) | 0 | 0 | 2 | 3 | 5 |
| documents | 0 | 0 | 2 | 0 | 2 |
| notifications (+ data/broadcast, sms, inbox) | 0 | 8 | 6 | 4 | 18 |
| automation (+ data/triggers) | 0 | 1 | 3 | 1 | 5 |
| ai | 0 | 1 | 0 | 0 | 1 |
| admin (+ App.tsx routing, data/audit, data/backup) | 0 | 1 | 8 | 3 | 12 |
| settings | 0 | 1 | 2 | 2 | 5 |
| system | 0 | 0 | 3 | 0 | 3 |
| auth | 0 | 0 | 4 | 2 | 6 |
| components (shell + ui) | 0 | 4 | 14 | 7 | 25 |
| skill — babin-report-excellence | 0 | 4 | 5 | 2 | 11 |
| **Total** | **6** | **53** | **111** | **55** | **225** |

---

## 3. P0 block — in fix order

Fix order rationale: P0-1 actively mis-posts money on a live routed screen; P0-2 shows money 100x wrong; P0-3/4/5 are Law 6 permission leaks ordered by exposure surface; P0-6 is a dead-route crash with bounded blast radius that needs a liveness check first (may be a concurrent session's in-flight refactor).

### [P0-1] — Payment records against the wrong invoice — stale invoiceId state

**Screen:** src/modules/finance/modals/RecordPaymentModal.tsx : 26
**Severity:** P0
**Group:** E
**Rule broken:** E-money correctness / A6 stale state
**Root cause:** The modal is mounted unconditionally in Finance.tsx (:586) and `useState(initialInvoiceId || invoices[0]?.id)` captures its initial value on first render only. Clicking '+ Pay' on any row later passes a new `initialInvoiceId` prop, but state never updates, so the select still holds the first invoice (INV-2026-0492) and the payment posts to it unless the user notices the dropdown.
**Fix:** Either mount the modal conditionally (`{showRecordPayment && <RecordPaymentModal …>}`) like RefundPaymentModal, or sync state on open with an effect keyed on `(isOpen, initialInvoiceId)`.
**Acceptance:** Click '+ Pay' on INV-2026-0490 after having previously opened the modal; the invoice select shows INV-2026-0490 and the recorded payment lands on that row.
**Blocked on:** none
**Verified:** CONFIRMED

### [P0-2] — rupees() used as a display formatter renders every cost 100x with no Rs prefix or grouping

**Screen:** src/modules/inventory/PurchaseRequests.tsx : 187
**Severity:** P0
**Group:** E
**Rule broken:** E4/E1 — formatMoney bypassed; money wrong on screen
**Root cause:** Seed costs are plain rupee numbers (data/purchaseRequests.ts:83-85, totalEstimatedCost: 930000). The JSX renders `{rupees(pr.totalEstimatedCost)}` at lines 187, 240, 244, 303 and 319 — `rupees()` is the rupee→paisa converter and returns a bare number, so Rs 9,30,000 displays as '93000000': no currency prefix, no South Asian grouping, visually 100x the real figure.
**Fix:** Store the seed amounts as Paisa (wrap with `rupees()` in data/purchaseRequests.ts, typed Paisa) and render every amount through `formatMoney()`; same for estimatedUnitCost, totalSubRentPaid and each subRental.costPaid.
**Acceptance:** The PR table and detail panel show 'Rs 9,30,000'-style figures identical to formatMoney output for every seeded row.
**Blocked on:** none
**Verified:** CONFIRMED

### [P0-3] — NewRental renders every money figure for any session, including Warehouse (carried N1, unpatched)

**Screen:** src/modules/rentals/NewRental.tsx : 419
**Severity:** P0
**Group:** B
**Rule broken:** Law 6 / Foundation §8.3 / carried N1
**Root cause:** The screen never imports useAuth, canViewMoneyField, or moneyScope. Outstanding (419-429), per-line rates/amounts (600-602), the full pricing breakdown (786-887), deposit ledger, and Booking Summary rail (987-1000) are built and rendered unconditionally, so a Warehouse/Technician/Driver/Client session sees all of it. RentalsList and BookingDetail in the same module already gate correctly — this is the one un-gated money surface left in rentals.
**Fix:** Mirror BookingDetail: `const gctx = gateContext(user?.role ?? 'Client')`; omit (never build) the Outstanding summary tile, rate/discount/amount columns, Section 4 (Pricing & Payments), and the Booking Summary rail when `!canViewMoneyField(gctx,'booking')`; crew Day Rate/Amount columns additionally behind `'asset-finance'`.
**Acceptance:** With a Warehouse (or Coordinator, for crew columns) session on /rentals/new, the DOM contains no Rs figure — not hidden, absent — while Owner/Manager sessions see the current layout unchanged.
**Blocked on:** none for field gating; whether Warehouse may reach /rentals/new at all is §6 decision 5
**Verified:** CONFIRMED

### [P0-4] — Packing (a floor surface) builds and shows Rental Outstanding to every session

**Screen:** src/modules/rentals/PackingWorkspace.tsx : 241
**Severity:** P0
**Group:** B
**Rule broken:** Law 6 / HIS v2.1 §4.3 floor surface / Foundation §8.3
**Root cause:** Line 170 pulls 'Rental Outstanding' from data/booking's SUMMARY and line 241 renders it as a booking-strip tile with no role or surface gating. lib/fieldGating.ts:56-58 codifies HIS v2.1 §4.3: on Pack/Handover/Return/Reset surfaces all Rs is stripped even for capable roles, and HandoverWorkspace/ReturnWorkspace (same strip, same booking) deliberately omit money citing exactly this rule. Packing is the one floor screen that leaks it.
**Fix:** Delete the Outstanding tile and the SUMMARY import; if a payment state is wanted, show a non-monetary state word like Handover's 'Payment: Due/Cleared' boolean tile.
**Acceptance:** Packing's booking strip contains no Rs figure for any role; grep of PackingWorkspace.tsx finds no import from data/booking's money exports; visual parity with Handover's strip.
**Blocked on:** none
**Verified:** CONFIRMED

### [P0-5] — Avg. Booking Value (Rs 18,250) rendered to money-blind roles

**Screen:** src/modules/reports/ClientReports.tsx : 247
**Severity:** P0
**Group:** B
**Rule broken:** Law 6 — money never built for money-blind roles
**Root cause:** The 'Booking Frequency' card renders FREQUENCY unconditionally; data/clientReports.ts:50 includes `formatMoney(rupees(18250))` 'Avg. Booking Value'. /reports/clients is in BUILT and the App.tsx route gate (:820) only blocks /finance, so Warehouse/Technician/Driver sessions see a constructed rupee figure. Every other money surface on this screen is gated; this one slipped.
**Fix:** Filter the FREQUENCY tile the same way KPIS/SUMMARY are filtered: exclude the money tile when `!money` (or gate the datum out at the data layer with canViewMoneyField).
**Acceptance:** A Warehouse session on /reports/clients sees Booking Frequency with two tiles and no rupee figure anywhere in the DOM.
**Blocked on:** none
**Verified:** CONFIRMED

### [P0-6] — Add Equipment cluster crashes at runtime: unresolved identifiers and truncated function bodies hidden by @ts-nocheck

**Screen:** src/modules/inventory/AddEquipment.tsx : 81
**Severity:** P0
**Group:** A
**Rule broken:** A1/A2/A4 compile & wiring — masked by @ts-nocheck
**Root cause:** A half-finished extraction of the old AddEquipment monolith into AddEquipmentContext + seven Section components. AddEquipment.tsx references 10 identifiers neither imported nor defined (PREVIEW_UNAVAILABLE_REASON:81, SAVE_UNAVAILABLE_REASON:126, SEED_ERRORS:129, cardStyle:117, handleSubmit:92/104, viewport:198/204/290, money:277/282, SideRail:206, Rail:291, railContent:292). AddEquipmentContext.tsx has bodies truncated to bare `return }`: sectionDefs useMemo (565), readyChecks useMemo (648), validate() (882) and removeUnit's setTouchedSerials updater (678) all return undefined; setOutcome (925) drops its lines property; serial-duplicate counting calls Map.set with one argument (487) so 'entered twice' can never fire. Section files reference names they never import (SectionPurchase: parseMoney/Unavailable/DEPRECIATION_UNAVAILABLE_REASON; SectionRelationships: CONTAINER_CAPACITY_REASON:353; SectionMaintenance: formatBytes:299 and a 'money' key the context never returns:264; EquipmentRightRail: SideRail:23), and each destructures ~30 phantom keys that are old local variables, not context values. `// @ts-nocheck` sits on all 10 files — the only reason the tsc baseline shows zero errors here. /inventory/new throws ReferenceError on first render. May be a concurrent session's in-flight refactor — **verify liveness before patching** — but as committed it is a dead route.
**Fix:** Finish or revert the refactor: import the missing symbols into AddEquipment.tsx (or render `<EquipmentRightRail/>` and the context-owned railContent), restore the four truncated return values in AddEquipmentContext.tsx (sectionDefs/readyChecks/validate/setTouchedSerials updater, and `setOutcome({kind, lines})`), fix `counts.set(k, (counts.get(k) ?? 0) + 1)`, add the missing imports to each Section file, prune the phantom destructures, then delete every @ts-nocheck in the set.
**Acceptance:** With all @ts-nocheck lines removed, tsc reports zero errors in these 10 files beyond the booqable baseline, and /inventory/new renders, validates, and reports duplicate serials for two identical entries.
**Blocked on:** none
**Verified:** CONFIRMED

---

## 4. P1–P3 by module

P1s in full §3 record format. P2/P3 in compact tables; † marks findings adversarially downgraded from P1 with the evidence footnoted under each table.

### 4.1 Finance

### [P1-01] — Invoice VAT computed locally in float rupees with hardcoded 13% and en-IN formatting

**Screen:** src/modules/finance/modals/CreateInvoiceModal.tsx : 58
**Severity:** P1 · **Group:** E · **Rule broken:** E5/E4/E1 + Law 1 — VAT order, formatMoney, paisa-only
**Root cause:** `vatAmount = Math.round(taxableSubtotal * 0.13)` reimplements the Financial Engine in the page: rupee floats not paisa, Math.round not roundHalfUp/toWholeRupee, VAT rate hardcoded (money.ts says 'from Settings ▸ Finance, never hardcoded'), and line 82 builds the display string with `toLocaleString('en-IN')`, which lib/money explicitly bans as ICU-dependent. The created row's `amount` string then diverges from formatMoney output.
**Fix:** Convert line amounts to paisa with rupees(), run `price({equipment: subtotal, discountPercent: 0, vatPercent: <settings>, payments: 0})` and format with formatMoney; delete the local math and the en-IN template string.
**Acceptance:** Creating an invoice for Rs 1,85,000 + VAT shows figures identical to price()'s breakdown, grouped '1,85,000'-style via formatMoney, and no toLocaleString call remains in the file.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-02] — Paid-status math parses money back out of the formatted display string

**Screen:** src/modules/finance/Finance.tsx : 195
**Severity:** P1 · **Group:** E · **Rule broken:** E4 + Law 1 — money round-tripped through display strings; status derived in page
**Root cause:** `rupees(parseInt(inv.amount.replace(/[^0-9]/g,'')))` treats the display string as the source of truth. For any amount carrying paise ('Rs 1,234.50') the digit-strip yields 123450 rupees — 100x overstatement — and the Paid/Partial threshold (:196) plus refund status (:223) are business-status derivations living in the page instead of a lib/data engine. invoiceIntel.ts already has the safe parseMoney and documents the single-source problem.
**Fix:** Store amountPaisa on InvoiceRow (or use invoiceIntel's amountPaisaOf/parseMoney), and move the Paid/Partial/Issued derivation into data/invoiceIntel.ts or lib.
**Acceptance:** No `parseInt`/regex money parsing remains in Finance.tsx; recording a paisa-bearing payment against a decimal-amount invoice flips status only when paidPaisa >= amountPaisa computed via parseMoney.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-03] — Refund is unbounded and adjusts the aggregate without a reversal row

**Screen:** src/modules/finance/modals/RefundPaymentModal.tsx : 25
**Severity:** P1 · **Group:** B · **Rule broken:** Law 4 — payments immutable via reversal rows
**Root cause:** `currentPaidPaisa` is declared in props but never destructured or checked, so a Rs 50,000 default refund (prefilled at :25) can exceed what was ever paid; Finance.handleRefundSuccess (:220) just clamps with Math.max(0,…) and decrements paidPaisa without appending a negative reversal entry to `payments`, so the payment history no longer sums to paidPaisa — the modal's own subtitle promises 'creating negative reversal entry' and the code doesn't.
**Fix:** Validate refundAmount <= currentPaidPaisa in the modal; in the success handler append `{ad, amountPaisa: -refund, method}` to payments so Σpayments === paidPaisa; drop the 50000 prefill (start empty).
**Acceptance:** Refunding more than paid is rejected inline; after a valid refund the IntelCard Payments group shows the negative reversal row and its sum equals Paid to date.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-04] — Hardcoded ActionContext {USR-001, Manager} and rbac gates never consulted

**Screen:** src/modules/finance/modals/RecordPaymentModal.tsx : 50
**Severity:** P1 · **Group:** B · **Rule broken:** Law 6/RBAC — capability checks bypassed
**Root cause:** recordPayment/refundPayment are invoked with a fabricated identity instead of the useAuth session (RefundPaymentModal:47 same), and actions/core.ts's permission check is a comment. rbac.canRecordPayment allows only Owner/Coordinator/Accounts and canVoidInvoice only Owner/Accounts, yet Finance.tsx draws + Pay/Refund/Void for every role that reaches /finance (Admin and Manager included) and never calls either predicate — 'forbidden items are ABSENT from UI' is the engine's own stated rule.
**Fix:** Pass `{userId: user.id, role: user.role}` from useAuth; render + Pay only when canRecordPayment(role), Void only when canVoidInvoice(role); implement the role check inside createAction against config.permissions.
**Acceptance:** An Admin session on /finance sees no Void button; the audit log line shows the real user id, not USR-001.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-05] — One payment emits PAYMENT_RECORDED three times through two divergent RECORD_PAYMENT actions

**Screen:** src/modules/finance/Finance.tsx : 188
**Severity:** P1 · **Group:** A · **Rule broken:** A5 — floating promise; duplicated action wiring
**Root cause:** The modal awaits actions/payments/recordPayment (emits event #1, payload {id}), then emits PAYMENT_RECORDED directly itself (#2), then onSuccess dynamically imports actions/finance/recordPayment — a second action with the same name RECORD_PAYMENT but a different input shape — which emits #3. The dynamic import's .then() has no .catch(), so a load failure is an unhandled rejection. Any audit logger records three contradictory entries per recording.
**Fix:** Keep exactly one recordPayment action (the finance one has the real input shape), call it once from the modal with the full payload, and let createAction emit the single event; delete the direct DomainEvents.emit and the dynamic import in Finance.tsx.
**Acceptance:** Recording one payment produces exactly one PAYMENT_RECORDED emission with amountPaisa in its payload; no floating .then() remains.
**Blocked on:** none · **Verified:** CONFIRMED

**Finance P2/P3:**

| ID | Location | Grp | Sev | Finding |
|---|---|---|---|---|
| P2-01 † | finance/Finance.tsx:187 | B | P2 | No finance write carries an idempotency key or passes through lib/offlineQueue; CreateInvoiceModal:76 mints ids with Math.random (Law 8) |
| P2-02 † | finance/Finance.tsx:457 | B | P2 | Row actions +Pay/Refund/Void ~22px tall; tab strip 34px (Law 15) |
| P2-03 | finance/modals/RecordPaymentModal.tsx:100 | D | P2 | Error banners hardcode #fee2e2/#991b1b — fallback always wins because --danger-bg doesn't exist (also CreateInvoiceModal:128, RefundPaymentModal:95, VoidInvoiceModal:82) |
| P2-04 | finance/Finance.tsx:49 | A | P2 | Two module-level throws can white-screen the entire app on seed drift; convert to FINANCE_SEED_ERRORS banner (expenseReports precedent) |
| P2-05 | finance/modals/RecordPaymentModal.tsx:34 | G | P2 | Money actions never check network state though rbac's canRecordPayment/canVoidInvoice take isOnline and block offline |
| P3-01 | finance/Finance.tsx:277 | B | P3 | Money-blind CSV export ignores the `money` gate the dead in-screen branch lives behind — two enforcement layers, different shapes |

> † P2-01 downgraded: facts hold (no offlineQueue use, Math.random ids) but PLAN.md:103/:185 track this as open phase work and PROGRESS.md:3970 shows lib/dataAccess.ts already implements the client_uuid wrapper for the real persistence path; the actions layer is an acknowledged mock. † P2-02 downgraded: measurements confirmed, but the canonical Page.tsx Button is itself 34px (systemic) and the repo's own audit grades the Law 15 class P2.

### 4.2 Reports

### [P1-06] — TOP_CATEGORIES raw numbers cast `as Paisa` — camera fleet valued at Rs 4,50,000

**Screen:** src/modules/reports/InventoryReports.tsx : 98
**Severity:** P1 · **Group:** E · **Rule broken:** E1 — paisa-only, unit-labelled amounts
**Root cause:** data/inventoryReports.ts stores value: 45000000 with no rupees() wrapper (every sibling seed uses rupees()); the screen casts it to Paisa so formatMoney divides by 100, printing Rs 4,50,000 as the total value of 150 cinema cameras (~Rs 3,000 each). The author almost certainly meant rupees — a 100x understatement — and nothing marks the unit either way.
**Fix:** Wrap the four values in rupees() in data/inventoryReports.ts (making them Rs 4.5 crore etc.) or retype the field as Paisa built via rupees(); remove the `as Paisa` cast from the screen.
**Acceptance:** 'Top Categories by Value' shows figures plausibly ≥ Rs 1,00,00,000 for 150 cameras and the seed field is typed Paisa with no cast at the call site.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-07] — 'Forecasting & AI' presents fabricated model outputs as live predictions

**Screen:** src/modules/reports/ForecastingReports.tsx : 23
**Severity:** P1 · **Group:** B · **Rule broken:** Law 16 — no AI panel without real computation
**Root cause:** Forecast Revenue Rs 1,25,00,000, 'Forecast Accuracy 92.4% — based on historical variance', predicted shortages and per-asset service dates are all hardcoded seeds in data/forecastingReports.ts with no engine behind them and no on-page disclosure. Pulse sets the precedent (MODEL_DISCLOSURE states its placeholder ratios on the page); this screen claims predictive capability it does not have.
**Fix:** Either back the panel with a real derivation from the ledger, or add an explicit on-page disclosure banner and strip the accuracy/confidence claims until a model exists.
**Acceptance:** The page either derives its figures from a named engine or renders a visible 'illustrative — no model wired' disclosure; no unqualified accuracy percentage remains.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-08] — `// @ts-nocheck` disables type checking on the whole Expenses money screen

**Screen:** src/modules/reports/ExpenseReports.tsx : 1
**Severity:** P1 · **Group:** A · **Rule broken:** A1 — compile gate
**Root cause:** Line 1 opts the file out of tsc entirely, so the 0-error screen baseline is blind here: icon-name mistakes, BrandKey misuse ('neutral' tone mapping) and prop drift compile silently. It is the only screen in the module carrying the pragma.
**Fix:** Delete the pragma and fix whatever surfaces (typed KpiCard note tones, IconName unions).
**Acceptance:** tsc --noEmit passes with the pragma removed and the file contributes zero new errors.
**Blocked on:** none · **Verified:** CONFIRMED

**Reports P2/P3:**

| ID | Location | Grp | Sev | Finding |
|---|---|---|---|---|
| P2-06 | reports/CasesReports.tsx:31 | A | P2 | CasesReports + ProductReports orphaned — no route, no lazy import, no nav entry |
| P2-07 | reports/CashFlowReport.tsx:65 | D | P2 | CashFlow + WorkingCapital use undefined tokens --fs-meta/--text-1/--text-2/--text-3 (17 occurrences) |
| P2-08 | reports/CasesReports.tsx:15 | D | P2 | KPI/status-bar colours use undefined --good/--warn/--bad/--info; tonal encoding dead |
| P2-09 | reports/EquipmentPerformance.tsx:7 | C | P2 | Five screens ship an any-typed local KPI card reimplementing Kpi; bad icon names ('clock','check_circle') and phantom tokens pass silently |
| P2-10 | reports/EquipmentPerformance.tsx:70 | C | P2 | Main content nested inside Rail: 6-column tables squeezed into a 288px collapsible aside (4 screens; PromotionsReports nests SideRail inside Rail) |
| P2-11 | reports/InventoryReports.tsx:37 | B | P2 | Utilization 68.4% contradicts the 84% Today/Pulse publish and reconcile against (Reports §2.2) |
| P2-12 | reports/Pulse.tsx:496 | B | P2 | Utilization % forced on money-blind sessions while fieldGating.canViewUtilization denies it — two enforcement layers disagree, no recorded ruling |
| P2-13 | reports/CashFlowReport.tsx:78 | B | P2 | Binary useCanViewMoney lets Coordinator read company cash flow / balance sheet; moneyScope('Coordinator') is booking-level only; denial copy wrong both ways |
| P2-14 | reports/ClientReports.tsx:154 | A | P2 | Header actions, filters, period chips, PeriodPill and 1,248-client pagination all inert; axis ticks unrelated to plotted values |
| P2-15 | reports/ProductReports.tsx:275 | E | P2 | Chart tooltip builds 'Rs' strings via toLocaleString('en-IN'); dead-control set repeated; DEAD_STOCK vs LOW_STOCK seed contradiction |
| P2-16 | reports/CasesReports.tsx:35 | A | P2 | All controls inert; 'Showing 1 to 25 of 96' over a 6-row table; row selection drives nothing |
| P2-17 | reports/ClientReports.tsx:382 | F | P2 | Hand-typed BS strings ('2083-02-15') stored, outside lib/bs coverage — invented conversions; BS_NOTE contradicts render order |
| P2-18 | reports/StaffReports.tsx:93 | B | P2 | Collection rate derived inline (no zero guard → NaN%); 'Hidden' masks the score instead of omitting; myName check can never match |
| P2-19 † | reports/ClientReports.tsx:411 | B | P2 | 24px pagination, 26px PeriodPill, ~14px eye-icon row action not keyboard reachable (also ProductReports:356) — Law 15 |
| P3-02 † | reports/CasesReports.tsx:6 | B | P3 | Assessed/Outstanding rupee columns + Total Cost KPI have no money gate; latent only because the screen is unrouted |
| P3-03 | reports/PromotionsReports.tsx:33 | IMP | P3 | Rs 10,00,000 'Revenue Gained' is an admitted example number with no on-page disclosure; ROP/ROI copy drift |
| P3-04 | reports/ExpenseReports.tsx:689 | A | P3 | duplicateOf documented as 'surfaced on the row' but never called; several derivations exported and unrendered; Maintenance links route to /inventory |

> † P2-19 downgraded: every measurement checks out, but the repo's adversarially-verified AUDIT_FINDINGS.md grades this Law 15 class P2 on higher-frequency controls. † P3-02 downgraded: facts confirmed, but the screen is unrouted and AUDIT_FINDINGS.md's P3 table already logs this exact fact as P3.

### 4.3 Rentals

### [P1-09] — Editable Advance Payment input on a page that states payments are immutable (carried N2, unpatched)

**Screen:** src/modules/rentals/NewRental.tsx : 865
**Severity:** P1 · **Group:** B · **Rule broken:** Law 4 / carried N2
**Root cause:** Lines 865-873 expose Advance Payment as a free number input; line 921-925 states 'Payments are immutable — no Edit, no Void'. The editable value directly drives 'Rental Paid' (:990) and outstanding, while the Payment History table (903-916) hardcodes an Advance row of 15,000 that the input silently contradicts when edited — the exact edit-in-place Law 4 forbids.
**Fix:** Replace the input with a read-only 'Rental Paid' figure derived from recorded payment rows; new money enters only via a Receive Payment action that appends a row; corrections are reversal rows.
**Acceptance:** No editable input is bound to an existing payment amount anywhere on /rentals/new; changing paid amounts is only possible by appending a payment/reversal row.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-10] — NewRental's Payment History table merges the Deposit row into rental payments

**Screen:** src/modules/rentals/NewRental.tsx : 903
**Severity:** P1 · **Group:** B · **Rule broken:** Law 5 / Foundation §2.2 / F1 pattern (carried)
**Root cause:** Lines 903-916 hardcode a 'Deposit / 25,000' row inside the 'Payment History' table beside the Advance row — the exact deposit-as-payment merge BookingDetail's F1 fix removed (BookingDetail.tsx:682 filters type !== 'Deposit'). Deposits are custody/liability rows and belong in the Deposit panel to the left.
**Fix:** Drop the Deposit row from the history table (or retitle the deposit movement into the Deposit panel's own custody register), mirroring BookingDetail's fixed layout.
**Acceptance:** Payment History (Rental) on /rentals/new lists rental payments only; deposit movements appear solely in the Deposit panel; sum of history rows equals 'Rental Paid'.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-11] — Stacked line-level + header discounts evade the >10% approval gate

**Screen:** src/modules/rentals/NewRental.tsx : 312
**Severity:** P1 · **Group:** B · **Rule broken:** Law 10 / §2.5
**Root cause:** lineAmountPaisa (106-108) applies each line's discountPct (seeded 5% on the three default lines), then price() applies the 7% header discount on top — a combined ~11.65% effective discount on those lines — while the gate at :312 reads only the header percentage, so no reason or approver is ever demanded. The protocol names this exact evasion pattern.
**Fix:** Gate on the effective combined discount (or on both levels independently) once the gate basis is ruled; until then at minimum surface the combined percentage next to the header discount so the evasion is visible.
**Acceptance:** Setting line discounts plus a header discount whose combined effect exceeds 10% triggers the same reason+approver hard block as a single 11% header discount.
**Blocked on:** §6 decision 2 — discount gate basis · **Verified:** CONFIRMED

### [P1-12] — Money-bearing modals (Extend, Assign Crew, Sub-Rental) launch ungated for money-blind roles

**Screen:** src/modules/rentals/BookingDetail.tsx : 274
**Severity:** P1 · **Group:** B · **Rule broken:** Law 6 / HIS v2.1 §4.1
**Root cause:** The header actions at 274-282 render for every role. CreateSubRentalModal exposes vendor cost, client charge, and supplier margin — which §4.1 denies even to Coordinator; AssignCrewModal exposes crew day-rate and total pay ('asset-finance'); ExtendRentalModal exposes rental charges. A Warehouse session whose money blocks are correctly omitted from the page can still open all three and read/enter Rs figures.
**Fix:** Gate the three launcher buttons (and modal mounts) behind canViewMoneyField(gctx,'booking') and, for Assign Crew and Sub-Rental, behind 'asset-finance'.
**Acceptance:** With a Warehouse or Coordinator session, the buttons for modals whose money scope the role lacks are absent, and no modal in the DOM contains an Rs figure the role may not see.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-13] — Record Payment dispatches a hardcoded Rs 5,000 with no user input and no session context

**Screen:** src/modules/rentals/BookingDetail.tsx : 724
**Severity:** P1 · **Group:** E · **Rule broken:** Money correctness / rbac
**Root cause:** Lines 722-728 call recordPayment({ bookingId: id, amountPaisa: 500000 }) — a fixed Rs 5,000 regardless of what is owed — and omit the ctx argument, so actions/core.ts:20 defaults it to { userId: 'system', role: 'admin' }; core.ts's permission check is a comment, so any role that can see the button records a payment attributed to system/admin.
**Fix:** Open a payment form (amount via parseMoney, method, reference), pass the real { userId, role } from useAuth, and block dispatch when the role lacks payment.create.
**Acceptance:** Pressing Record Payment never emits PAYMENT_RECORDED with a fixed amount; the emitted payload carries the operator's real userId/role and a user-entered amount.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-14] — Two divergent recordPayment actions exist and BookingDetail calls one from each button

**Screen:** src/modules/rentals/BookingDetail.tsx : 823
**Severity:** P1 · **Group:** A · **Rule broken:** A2/A6 + implementation integrity
**Root cause:** actions/finance/recordPayment.ts (input {bookingId, amountPaisa,…}) and actions/payments/recordPayment.ts (input {id} — a self-described placeholder) both register name RECORD_PAYMENT and emit PAYMENT_RECORDED with incompatible payload shapes. 'Record Payment' (:723) uses the finance one; 'Receive Payment' (:823) uses the payments one, so event consumers cannot rely on the payload and the two paths will drift.
**Fix:** Delete actions/payments/recordPayment.ts, route both buttons through actions/finance/recordPayment with a real amount and ctx, and update actions/payments imports.
**Acceptance:** Exactly one recordPayment module exists; both buttons dispatch it; PAYMENT_RECORDED has a single payload shape.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-15] — Bulk handover double-dispatches every unit; a single scan dispatches twice

**Screen:** src/modules/rentals/HandoverWorkspace.tsx : 182
**Severity:** P1 · **Group:** A · **Rule broken:** A5 + Law 8
**Root cause:** handOver() (169-180) dispatches handoverRental for the single unit; handOverMany (182-188) calls handOver(uid) per id — each dispatching — and then dispatches handoverRental again with the whole id list, so every unit in a bulk action is sent twice. The scanner path (833-835) routes one scanned item through handOverMany([item.id]), i.e. two dispatches per scan. With no idempotency key these are unguarded duplicate writes. Both promises also float with no .catch.
**Fix:** Make handOver pure-local (state update + log) and dispatch exactly once per user action: singles via handoverRental({unitIds:[uid]}), bulk via one batch call; add .catch with inline error.
**Acceptance:** One user action (scan, Hand Over, or bulk button) produces exactly one handoverRental dispatch whose unitIds match the acted-on set.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-16] — List row BK-2026-0715 contradicts the §10.2 reference booking's client and money

**Screen:** src/data/rentals.ts : 193
**Severity:** P1 · **Group:** E · **Rule broken:** §10.2 reference case / §11 single source
**Root cause:** ROWS[0] gives BK-2026-0715 to 'ABC Films', pickup 31 Jul, amount Rs 86,400, due Rs 0 ('Paid'), while data/booking.ts seeds the same booking number as Himalayan Films, pickup 16 Jul, outstanding Rs 1,24,506. booking.ts's own header rules 'Any screen showing different figures for this booking is wrong.' Clicking the list row opens BookingDetail with a different client and Rs 1,24,506 outstanding against a list cell that said Paid — and BookingDetail's isSeeded banner stays silent because the IDs match.
**Fix:** Renumber ROWS[0] to an unused booking number, or align its client/dates/amount/due to the §10.2 reference figures.
**Acceptance:** For any bookingNo shown on the list, the detail page shows the same client and the list's amount/due reconcile with the detail's Rental Total/Outstanding.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-17] — Writes attributed to a hardcoded 'USR-001' / 'Manager' instead of the session user

**Screen:** src/modules/rentals/PackingWorkspace.tsx : 227
**Severity:** P1 · **Group:** B · **Rule broken:** Audit integrity / Law 8 adjacent
**Root cause:** NewRental 374/383, Packing 227/671, Reset 893, and ExtendRentalModal 60 all pass { userId: 'USR-001', role: 'Manager' } as the action context, so the audit trail records a fabricated identity and an elevated role for whoever is actually signed in (a Warehouse user completing packing is logged as a Manager). BookingDetail (261) already passes the real user, proving the correct pattern exists in-module.
**Fix:** Thread useAuth()'s user into every dispatch (or a shared helper) and remove the literals.
**Acceptance:** grep for 'USR-001' in src/modules/rentals returns nothing; emitted events carry the signed-in user's id and role.
**Blocked on:** none · **Verified:** CONFIRMED

**Rentals P2/P3:**

| ID | Location | Grp | Sev | Finding |
|---|---|---|---|---|
| P2-20 † | rentals/BookingDetail.tsx:260 | B | P2 | No dispatch in the module carries a client UUID or passes through lib/offlineQueue; 'PAY-'+Date.now().slice(-4) ids collision-prone (Law 8) |
| P2-21 | rentals/NewRental.tsx:312 | C | P2 | Discount gate reimplemented inline instead of calling lib/money's discountGate() — §11 reimplementation class |
| P2-22 | rentals/BookingDetail.tsx:262 | B | P2 | alert() for both success and failure on Confirm/Record/Receive Payment (Law 12); console.log event handlers left in |
| P2-23 | rentals/NewRental.tsx:383 | A | P2 | Confirm Booking navigates before the action resolves; all dispatches float without .catch (also 374, Packing 227/671, Reset 893, Evidence 448-449, Handover 176/184) |
| P2-24 | rentals/modals/ExtendRentalModal.tsx:110 | D | P2 | var(--danger-bg,#fee2e2) — token undefined, hex always renders; ~1.5:1 in dark mode (also AssignCrewModal:87, CreateSubRentalModal:98) |
| P2-25 | rentals/EvidenceWorkspace.tsx:331 | D | P2 | Photo placeholders hardcode slate hex gradient (#334155→#0f172a); strip font sizes bypass type tokens |
| P2-26 | rentals/modals/ExtendRentalModal.tsx:24 | F | P2 | Fabricated current return date + rate; local setDate + toLocaleDateString bypass lib/bs; extraAmount priced without the engine; authorization checkbox dead |
| P2-27 | rentals/modals/AssignCrewModal.tsx:16 | IMP | P2 | Invents its own role list, free-text names and default rate instead of CREW_ROSTER; raw 'crew.assigned' event string; onSuccess only console.logs |
| P2-28 | rentals/RentalsList.tsx:302 | IMP | P2 | Disabled controls carry reasons only in title attributes — inert for keyboard/touch; shared Unavailable component exists and is used elsewhere in the same file |
| P2-29 | rentals/PackingWorkspace.tsx:715 | B | P2 | Row actions 22px in all four workspaces; Evidence MiniBtn 20px; row-menu 26px; qty/days inputs 25px — Law 15 on glove-context floor screens |
| P2-30 | rentals/RentalsList.tsx:405 | G | P2 | loading/error/offline unreachable on every rentals screen (structural to mock stage; log as blocked on Phase 2 rather than silently absent) |
| P3-05 † | src/data/booking.ts:209 | B | P3 | 'Customer' in seed copy and delivery vocabulary across BookingDetail, NewRental, Handover (Law 17; partly a documented refusal pending schema-wide enum rename) |
| P3-06 | rentals/PackingWorkspace.tsx:168 | F | P3 | Booking dates re-hardcoded as ISO literals in four workspaces instead of one exported PICKUP_AD/RETURN_AD source |
| P3-07 | rentals/ReturnWorkspace.tsx:337 | IMP | P3 | Progress bar animates width where siblings use scaleX (layout-transition detector hit) |
| P3-08 | rentals/HandoverWorkspace.tsx:898 | IMP | P3 | Ring, RowAction, BLUE_PRIMARY, th/td styles duplicated per workspace file; Packing's 'undefined as never' drift |
| P3-09 | src/lib/money.ts:319 | E | P3 | Carried spec figure Rs 1,24,505 disagrees by Rs 1 with the engine-asserted §10.2 chain (Rs 1,24,506) — do not patch; blocked on §6 decision 4 |
| P3-10 | rentals/RentalsList.tsx:46 | A | P3 | Stale doc comment describes an eight-shift-role map that no longer exists (auth is unified) |
| P3-11 | rentals/NewRental.tsx:398 | F | P3 | Summary bar leads with an em dash for any date outside Shrawan 2083; promote AD when toBs returns null |

> † P2-20 downgraded: same counter-evidence as P2-01 — tracked phase gap in an acknowledged mock layer; lib/dataAccess.ts already implements the Law 8 wrapper for the real path. † P3-05 downgraded: occurrences confirmed, but AUDIT_FINDINGS.md already logs them at P3 and PLAN.md:1808-1814 documents the enum-rename refusal as deliberate pending a coordinated schema change.

### 4.4 Clients

### [P1-18] — 'Customer type' label rendered in the Identity card and in the shared client Intel card

**Screen:** src/modules/clients/ClientDetail.tsx : 241
**Severity:** P1 · **Group:** B · **Rule broken:** Law 17 — the word 'customer' appears nowhere
**Root cause:** ClientDetail.tsx:241 renders { label: 'Customer type', value: client.clientType } and data/clientIntel.ts:76 carries the identical label into every hover Intel card in ClientsDirectory. Both are UI copy, not comments — the one word Law 17 bans, on the module the ruling was made for (PLAN.md §6.1, asked-and-closed three times).
**Fix:** Rename both labels to 'Client type'.
**Acceptance:** grep -ri 'customer' over src/modules/clients and src/data/clientIntel.ts hits only doc comments.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-19] — Clients-module seeds store pre-formatted BS strings with no AD instant behind them

**Screen:** src/data/clients.ts : 99
**Severity:** P1 · **Group:** F · **Rule broken:** Law 7 / F1 — store AD in UTC; BS rendered, never stored
**Root cause:** ClientRecord stores lastRentalBs: '2083/04/03' and lastRentalAd: '18 Jul 2026' as display strings (98-99) — the type's own clientSinceAd doc (116) states the law these fields break. data/membership.ts stores joinBs/renewBs strings and data/stockCheck.ts stores startedAtBS. ClientsDirectory then sorts on the stored BS string lexically (251). No AD Date exists to derive from, so a BS-calendar fix or format change requires re-typing every seed, and the two tabs already disagree on format.
**Fix:** Store one AD instant (ISO string or Date, UTC) per date on ClientRecord/MemberRow/StockCheckSession and derive both BS and AD display at render via lib/bs, as Bundles/Maintenance/Warehouses already do.
**Acceptance:** No *Bs-suffixed string field remains in clients/membership/stockCheck seeds; the directory and membership tabs render BS via formatBs with one consistent format.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-20] — Duplicate & Merge Center shows phone, email and PAN ungated on an unguarded route

**Screen:** src/modules/clients/DuplicateCenter.tsx : 113
**Severity:** P1 · **Group:** B · **Rule broken:** HIS v2.1 §4.2 field gating / Law 6 pattern — PII absent for floor roles
**Root cause:** GroupCard renders Phone/Email/PAN/Type for every candidate (113-122) with no canViewPII(gateContext(...)) check, and App.tsx mounts /clients/duplicates with no role guard (506-513). ClientsDirectory and ClientDetail gate exactly these fields for Warehouse/Technician sessions; this screen is copy-paste drift that reopens the leak — and the merge action (money-affecting: it combines outstanding and deposits) is offered to any role that can reach the page.
**Fix:** Gate the Phone/Email/PAN rows on canViewPII and the merge action on an appropriate role, mirroring ClientsDirectory's gctx usage.
**Acceptance:** A Warehouse session on /clients/duplicates sees no phone/email/PAN values and no merge button.
**Blocked on:** none · **Verified:** CONFIRMED

**Clients P2/P3:**

| ID | Location | Grp | Sev | Finding |
|---|---|---|---|---|
| P2-31 † | clients/ClientsDirectory.tsx:1261 | B | P2 | Credit-pressure 0.8 threshold hand-coded in three pages; merge financial policy implemented in DuplicateCenter page (Law 1 drift, no current disagreement) |
| P2-32 † | clients/ClientsDirectory.tsx:1016 | B | P2 | Row-menu/pagination 26px, tree expander 20px, checkboxes unpadded — systemic Law 15; shared Button itself 34px |
| P2-33 | src/data/membership.ts:81 | F | P2 | daysLeft, grace notes and one BS year contradict the seed's own dates (mutually impossible daysLeft for identical renewAd; joinBs a year off) |
| P2-34 | clients/Clients.tsx:398 | IMP | P2 | 'Manager Overrides: 3' typed and provably wrong — seed yields ≥8 overrides vs CREDIT_POLICY defaults |
| P2-35 | clients/AddClient.tsx:286 | A | P2 | Nine screens fire floating dynamic-import writes with no .catch, no client_uuid, success toast regardless of outcome; createClient invents colliding id scheme |
| P2-36 | clients/ClientDetail.tsx:86 | A | P2 | Client state captured at first render never resyncs on :id param change without unmount |
| P2-37 | clients/ClientsDirectory.tsx:218 | B | P2 | Search matches phone/email/PAN even for sessions whose PII columns are hidden — identification oracle |
| P2-38 | clients/AddClient.tsx:1 | A | P2 | @ts-nocheck opts the whole 928-line form out of the compile gate |
| P2-39 | clients/Clients.tsx:196 | G | P2 | No loading/error/offline path in either clients or inventory module; role-denied body only on AddBundle |
| P3-12 | clients/Clients.tsx:187 | B | P3 | REFERRALS + CREDIT_POLICY seed arrays defined inside page modules; GenerateReferralCode imports seed from another page |
| P3-13 | clients/Membership.tsx:832 | C | P3 | Row-action comment claims 'no /clients/:id route' though ClientDetail exists |
| P3-14 | clients/GenerateReferralCode.tsx:156 | IMP | P3 | Suggested-code placeholder calls Math.random in render — churns per keystroke |

> † P2-31 downgraded: all three call sites use the same 0.8, nothing user-facing wrong, DuplicateCenter's header discloses the pre-Phase-1 local merge; repo ladder puts non-breaking drift at P2. † P2-32 downgraded: measurements verified but the repo's own audit graded the identical Law 15 class P2.

### 4.5 Inventory

### [P1-21] — All money on Purchase Requests renders ungated for every role, including Warehouse

**Screen:** src/modules/inventory/PurchaseRequests.tsx : 140
**Severity:** P1 · **Group:** B · **Rule broken:** Law 6 / Foundation §8.3
**Root cause:** The screen never calls useCanViewMoney: Total Cost (Est) column (140/185-189), Est Unit Cost / Total Cost detail (239-244), Sub-Rental Expenses table with per-supplier costs (300-324), and the KPI strip's hardcoded 'NPR 845,000' / 'NPR 320,000' strings (data/purchaseRequests.ts:69,71) are all built and shown unconditionally. Every sibling inventory screen structurally omits money for the money-blind set; the route carries no role guard. The KPI strings additionally bypass formatMoney with Western grouping.
**Fix:** Gate the cost column, detail cost cells, Sub-Rental Expenses card and money KPI on useCanViewMoney() (omit, never blank); derive KPI figures via formatMoney from Paisa values.
**Acceptance:** A Warehouse/Technician session sees no rupee figure anywhere on /inventory/purchase-requests; money sessions see formatMoney-formatted figures.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-22] — 'Ask AI Assistant' prompt box with a primary Ask button wired to nothing

**Screen:** src/modules/inventory/Warehouses.tsx : 1591
**Severity:** P1 · **Group:** B · **Rule broken:** Law 16 — no AI panel unless backed by real computation
**Root cause:** The Warehouse Map tab renders a message-icon tile, a text input placeholdered 'Ask AI Assistant (e.g. Which warehouse is full?…)' and a primary Ask button with no onClick and no backing computation (1586-1596). The same file's own header comment renames 'AI Warehouse Insights' to 'Warehouse Insights' precisely because labelling deterministic rules as model output is a false claim — this later addition reintroduces the violation as a dead control.
**Fix:** Remove the panel, or replace it with the Unavailable pattern stating no assistant service exists; reinstate only when a real query engine answers it.
**Acceptance:** No AI-labelled input or button exists on the screen without a functioning computation path behind it.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-23] — Asset Detail fabricates availability and record content for every asset

**Screen:** src/modules/inventory/AssetDetail.tsx : 227
**Severity:** P1 · **Group:** B · **Rule broken:** Law 1 / Foundation §6 — availability derived from data, never fabricated
**Root cause:** The 'NEXT FREE' tile hardcodes 'Tomorrow 14:00 · SN-FX3-004 returning' (224-227) for every asset — SN-FX3-004 exists nowhere in seed. availableCount/totalUnits carry invented '?? 3'/'?? 5' fallbacks (72-73). The Documents tab lists five hardcoded Sony FX3 documents for any asset (594-599). The unit table falls back to a fabricated 'EQ000234-01' asset tag (333) and 'EQ000234' code (106,180,690). The accessories expander invents a Sony checklist claimed 'Ticked during Packing & Return QC' (391-395). The Timeline ignores each unit's real booking and prints hardcoded 'BR-2026-0189'/'BR-2026-0195' bars (441-447) — also using the BR- prefix while the app uses BK- (§6 decision 6). Also A6: the lookup `p.code === assetId` (41) can never match because no PARENTS row seeds `code`, so every code-built link 404s.
**Fix:** Derive Live Availability and NEXT FREE from asset.children (or state 'Not derivable — needs the booking calendar' honestly), drop every hardcoded fallback in favour of em-dash gaps, and render the timeline from each unit's real booking reference.
**Acceptance:** Opening any seeded asset shows only figures traceable to data/inventory.ts; a unit with no recorded tag/documents shows '—'; no BR- prefixed booking id appears.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-24] — Bundle-rate override evades the discount gate: unlimited implied discount with no cap and no approver

**Screen:** src/modules/inventory/AddBundle.tsx : 462
**Severity:** P1 · **Group:** B · **Rule broken:** Law 10 — 25% cap, reason + named approver, no bypass
**Root cause:** Line discounts are properly gated, but the §7.3 override path (433-440, 1002-1026) lets any money role set an arbitrary target rate — the screen itself computes and displays the 'Implied extra discount' percentage — while blockingReason (451-466) only requires the rate be > Rs 0 and a 10-character reason. No 25% ceiling, no named approver, no canApproveDiscount check: an override to Rs 1 implies a ~99% discount and creates cleanly. This is exactly the stacked evasion pattern protocol B10 names.
**Fix:** Feed the implied total discount (line discounts + override delta over sum-of-parts) through validateDiscount/canApproveDiscount: block creation above 25% outright and require a named approver above 10%, recording the approver with the override reason.
**Acceptance:** An override implying >25% off sum-of-parts cannot be created by any role; 10–25% requires an eligible named approver recorded on the draft.
**Blocked on:** §6 decision 2 decides the measurement base; the cap and approver requirement apply regardless · **Verified:** CONFIRMED

**Inventory P2/P3:**

| ID | Location | Grp | Sev | Finding |
|---|---|---|---|---|
| P2-40 | src/data/inventory.ts:99 | IMP | P2 | Chips/KPIs describe a fictional 2,486-unit fleet above an 8-model, 245-unit table; chip filters contradict their own counts |
| P2-41 | inventory/Maintenance.tsx:178 | IMP | P2 | Chips claim 86 jobs and KPIs are typed constants above a 3-row seeded table; fabricated 'Cost This Month' rupees(45000); seed rows live in the page |
| P2-42 | src/data/inventory.ts:44 | D | P2 | Maintenance status wears soft-green 'in' badge tokens but amber dot/KPI on the same screen — one status, two hues (Law 11 / §4.2) |
| P2-43 | inventory/StockCheck.tsx:376 | D | P2 | var(--orange-text)/--orange-bg undefined (also AssetDetail, PurchaseRequests); --st-out-bg (solid green) backs danger badges at ~1.4:1 |
| P2-44 | inventory/components/InventoryTree.tsx:12 | A | P2 | Three orphaned bundle components + unrendered EquipmentRightRail shadow the live AddBundle implementations and carry their own money/token defects |
| P3-15 | inventory/Warehouses.tsx:1749 | B | P3 | Garbled staff-tab copy ('capability comes from the business 8 alone'); invented dispatch timestamps ('14:30'/'18:00' hardcoded) |
| P3-16 | inventory/PurchaseRequests.tsx:206 | F | P3 | Dates render AD-only (no BS lead); 'Filter' and 'New Draft PR' buttons dead with no Unavailable reason |

### 4.6 Operations & Crew

### [P1-25] — Return queue's Open Job misroutes to the Evidence page instead of the Return workspace

**Screen:** src/modules/operations/OperationsQueues.tsx : 72
**Severity:** P1 · **Group:** A · **Rule broken:** A-wiring / §1.5 job routes
**Root cause:** resolveJobRoute maps `jLower === 'evidence' || jLower === 'return'` to `/rentals/:id/evidence`, though 'evidence' is not a JobName and the route `/rentals/:bookingNo/return` exists (App.tsx:187). Copy-paste drift when the evidence branch was added.
**Fix:** Map 'return' to `/rentals/${booking}/return`; keep 'evidence' only if a queue can ever carry it, otherwise delete that alias.
**Acceptance:** Clicking Open Job on J-1035/J-1036/J-1031 (job: Return) lands on /rentals/<bk>/return, not /rentals/<bk>/evidence.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-26] — Resolution gate grants Admin and denies Manager, contradicting its own copy and §11

**Screen:** src/modules/operations/CasesQueue.tsx : 76
**Severity:** P1 · **Group:** B · **Rule broken:** Cases §11 role table / rbac.ts role model
**Root cause:** canResolve returns `role === 'Owner' || role === 'Admin'` while the rail badge says 'Manager only' and the restricted text says 'Restricted to Manager and Owner' (863–866). rbac.ts states Manager mirrors Admin unless a spec says otherwise, so a Manager viewing this screen is wrongly locked out and Admin wrongly included relative to the stated rule.
**Fix:** Align code and copy to the §11 ruling — include 'Manager' in canResolve (and 'Admin' only if §11 actually grants it), and make the badge/text name the same role set the function checks.
**Acceptance:** Selecting 'Viewing as Manager' shows the disposition radio group; the rail badge names exactly the roles canResolve accepts.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-27] — KPI tiles and filter-chip counts are hand-typed and reconcile with nothing on the screen

**Screen:** src/modules/operations/SubRental.tsx : 442
**Severity:** P1 · **Group:** E · **Rule broken:** E3/E4 + Foundation §2.8 reconciliation
**Root cause:** 'Active Records 30 — Borrowing (18) · Lending (12)', 'Total Revenue Rs 1,20,000', 'Total Cost Rs 80,000', 'Blended Margin 33.3%' and chip counts 48/4/6/8/16/9/5 are literals, while the table renders the 4-row SUB_RENTAL_DATA (revenues 2,35,000 excl. cancelled; costs 1,66,500). Clicking 'On Rent (16)' shows 1 row. The Rs figures are template strings bypassing formatMoney/paisa.
**Fix:** Derive every KPI and chip count from SUB_RENTAL_DATA (as CasesQueue derives via statusCounts/exposurePaisa), format through formatMoney, compute the blended margin from summed paisa.
**Acceptance:** Each chip count equals the row count its filter produces; KPI figures equal aggregations of the seed array and change when the seed changes.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-28] — Success toasts announce Export and Log Incident actions that never happen

**Screen:** src/modules/operations/CasesWorkspace.tsx : 208
**Severity:** P1 · **Group:** B · **Rule broken:** Law 12 — toasts carry successes only
**Root cause:** showSuccessToast('Exporting', 'Generating cases report...') and showSuccessToast('New Case', 'Opening case logging workspace') fire with no export and no workspace behind them — a false success claim, where CasesQueue discloses the same gaps inline via NEW_CASE_UNAVAILABLE_REASON.
**Fix:** Replace with the inline 'not built yet' disclosure pattern CasesQueue already uses, or wire the real action.
**Acceptance:** No success toast fires unless a report file or creation flow actually results.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-29] — Fake success toasts for Export and 'New Sub-Rental wizard'; the button silently fires a stub with an invented Rs 5,000 cost

**Screen:** src/modules/operations/SubRental.tsx : 534
**Severity:** P1 · **Group:** B · **Rule broken:** Law 12 — toasts carry successes only
**Root cause:** Export toasts 'Generating sub-rental report...' with no report; New Sub-Rental toasts 'Opening Sub-Rental wizard' while no wizard exists, and additionally invokes createSubRental({itemDescription:'Sub-Rental Item', costPaisa:500000}) — a fabricated money payload dispatched from the page.
**Fix:** Inline disclosure for both unbuilt actions; remove the invented-cost stub invocation until a real form supplies the payload.
**Acceptance:** Clicking either button yields an inline stated limitation, no success toast, and no action dispatch with fabricated amounts.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-30] — Book Crew / Export / Create Call Sheet fire success toasts for flows that do not exist

**Screen:** src/modules/crew/CrewBooking.tsx : 171
**Severity:** P1 · **Group:** B · **Rule broken:** Law 12 — toasts carry successes only
**Root cause:** 'Opening crew booking flow' (nothing opens; falls back to hardcoded 'CRW-101' when nothing is selected), 'Generating crew payroll report…' (no export), and 'Call sheets are not built yet — spec §13' delivered as a success toast — a limitation notice in success clothing.
**Fix:** Inline disclosures for unbuilt flows; drop the 'CRW-101' fallback (disable Book Crew with no selection); reserve toasts for completed actions.
**Acceptance:** With nothing selected, Book Crew is disabled or states why inline; no success toast fires without a completed action.
**Blocked on:** none · **Verified:** CONFIRMED

**Operations & Crew P2/P3:**

| ID | Location | Grp | Sev | Finding |
|---|---|---|---|---|
| P2-45 | operations/shell/OperationsShell.tsx:94 | A | P2 | Entire shell/ subtree (+4 steps, EvidencePanel, data/operationsShell.ts) orphaned; two same-named OperationsShell components invite wrong-import regression |
| P2-46 | operations/CasesWorkspace.tsx:43 | A | P2 | Duplicate divergent Cases list; /operations/cases/:id ignores :id so 'Open Case' self-loops |
| P2-47 | operations/CasesWorkspace.tsx:86 | D | P2 | var(--bad)/--warn/--good/--info undefined — every priority/status/KPI colour silently dies |
| P2-48 | operations/SubRental.tsx:512 | D | P2 | Same undefined tokens; active Overdue chip renders white text on unset background |
| P2-49 | operations/CasesQueue.tsx:82 | D | P2 | Solid pills hardcode #fff on token-fg backgrounds — 2.0:1 / 2.5:1 in dark theme (BRAND_ON precedent) |
| P2-50 | operations/SubRental.tsx:52 | F | P2 | BS + AD stored as pre-formatted strings in SubRental and data/crew.ts; Asar dates outside vouched window, pairing suspect |
| P2-51 | crew/CrewBooking.tsx:110 | E | P2 | Billed·Cost·Margin sums payouts over ALL non-cancelled rows while the fee basis counts only Confirmed/Completed — mismatched populations |
| P2-52 | src/data/crew.ts:521 | C | P2 | Dead duplicate crewBilling() diverging from lib/money.ts's canonical engine (§11) |
| P2-53 | operations/CasesWorkspace.tsx:31 | C | P2 | ageDaysOf reimplements ageDays() with a hardcoded copy of TODAY — multi-clock drift bs.ts warns about |
| P2-54 | operations/OperationsQueues.tsx:287 | B | P2 | Phone card layout's primary 'Open Job' action 40px in the touch layout specifically (Law 15) |
| P2-55 | operations/CasesQueue.tsx:727 | B | P2 | Dense sub-44px cluster: RowMenu 24px, Open Case 24px, pager 26px, chips 24-30px on a tablet-facing screen |
| P2-56 | crew/CrewBooking.tsx:545 | IMP | P2 | CrewBooking/CasesWorkspace/SubRental never branch below 768 — fixed-min-width grids ride horizontal scroll on phones |
| P3-17 | operations/CasesWorkspace.tsx:111 | G | P3 | loading/error/whole-screen permission-denied unreachable on all five routed screens in scope |
| P3-18 | operations/CasesQueue.tsx:44 | G | P3 | CASES_SEED_ERROR exported expressly for on-screen surfacing; no Cases screen imports it |
| P3-19 | src/data/cases.ts:898 | E | P3 | 'Found'/'Client Returned' book full assessed value as Absorbed loss while the preview promises 'no charge' |
| P3-20 | operations/shell/steps/ReturnStep.tsx:277 | B | P3 | 'Checked in' prints qtyReturned/qtyExpected — the quoted figure §5.1 forbids (unmounted tree, live if wired) |
| P3-21 | operations/shell/steps/HandoverStep.tsx:71 | A | P3 | Signer name required to enable signing, then discarded — the lock records no signer (unmounted tree) |
| P3-22 | operations/CasesQueue.tsx:892 | A | P3 | Dynamic action imports float with no .catch (also SubRental:542, CrewBooking:168) |
| P3-23 | operations/OperationsQueues.tsx:95 | A | P3 | Dead/no-op controls: Refresh, Export (CasesQueue:242), View on lending rows (SubRental:687), '#' links (CrewBooking:659,670) |
| P3-24 | operations/OperationsQueues.tsx:76 | IMP | P3 | 'Scan Item' scans against a 5-item hardcoded demo list unrelated to any queue or booking |
| P3-25 | operations/OperationsQueues.tsx:27 | B | P3 | Doc headers cite 'the canonical 12-stage workflow' — retired vocabulary presented as authority (also data/operations.ts:6) |
| P3-26 | src/data/operations.ts:31 | IMP | P3 | Queue card counts (8/5/11/9/3) disagree with the job table those cards filter (2/1/3/1 rows) |
| P3-27 | operations/CasesWorkspace.tsx:24 | C | P3 | Direct @tabler/icons-react imports bypass the Icon registry (also SubRental:21) |
| P3-28 | operations/CasesQueue.tsx:541 | IMP | P3 | aria-selected on plain <tr> invalid; both OperationsShell tablists lack arrow-key navigation |

### 4.7 Today

### [P1-31] — Whole screen opts out of TypeScript via @ts-nocheck

**Screen:** src/modules/today/MovementList.tsx : 1
**Severity:** P1 · **Group:** A · **Rule broken:** A1 compile gate / working rules
**Root cause:** Line 1 `// @ts-nocheck` suppresses every type error in the file, which is why the tsc baseline shows zero screen errors — the pragma hides at least one real TS2367 (line 583 compares an object to a string) and any future regressions. The sweep's compile gate is blind to this file.
**Fix:** Remove `@ts-nocheck`, run tsc, and fix each revealed error (starting with `menu !== r.id` → `menu?.id !== r.id`).
**Acceptance:** `node node_modules/typescript/bin/tsc --noEmit` passes with the pragma removed and no new suppressions.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-32] — Pickup/Return completion feedback via blocking alert() for both success and failure

**Screen:** src/modules/today/MovementList.tsx : 78
**Severity:** P1 · **Group:** B · **Rule broken:** Law 12 — errors inline, toasts successes only
**Root cause:** Lines 78–79, 88–89, 221–223, 227–229 route success ('Pickup Completed!') and error ('Failed: ' + err.message) through window.alert — errors are not inline, successes are not toasts, and alert blocks the thread. The app ships a ToastProvider (App.tsx) that this screen ignores.
**Fix:** Success → ToastProvider toast; failure → inline error text on the row/card; remove all alert() calls.
**Acceptance:** grep for `alert(` in MovementList.tsx returns nothing; completing a pickup shows a toast and a failed action shows inline text.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-33] — Mutations dispatched with fabricated identity, fake equipment ids, and no idempotency key

**Screen:** src/modules/today/MovementList.tsx : 77
**Severity:** P1 · **Group:** B · **Rule broken:** Law 8 + RBAC (canPerformOperations)
**Root cause:** completePickup/completeReturn are called with `{ userId: 'mock-user', role: 'admin' }` and `equipmentIds: ['mock-123']` (77, 87, 220, 227). 'admin' is not a SystemRole ('Admin' is), the real session from useAuth is ignored, no client UUID goes through lib/offlineQueue, and the controls are not gated by canPerformOperations — a Client/Warehouse session can 'complete' a pickup as admin.
**Fix:** Pass the real session ctx, generate a client_uuid through lib/offlineQueue, gate the entries behind canPerformOperations(role), and source equipmentIds from the movement's real lines.
**Acceptance:** Action payloads carry the signed-in user's id/role and a client_uuid; the entries are absent for roles failing canPerformOperations.
**Blocked on:** none · **Verified:** CONFIRMED

**Today / Calendar / Documents P2/P3:**

| ID | Location | Grp | Sev | Finding |
|---|---|---|---|---|
| P2-57 † | today/MovementList.tsx:583 | A | P2 | `menu !== r.id` always true (object vs string, TS2367 masked by @ts-nocheck) — hover card co-renders over open row menu |
| P2-58 | today/MovementList.tsx:76 | A | P2 | Dynamic import().then chains have no .catch — chunk-load failure is an unhandled rejection |
| P2-59 | today/MovementList.tsx:413 | D | P2 | var(--warn) undefined — 'Due Soon' rows silently lose their only accent border (Law 11 adjacent) |
| P2-60 | today/MovementList.tsx:388 | IMP | P2 | Rows are click-only divs; doc claims keyboard focus opens intel card but no focus handler exists; ⋮ trigger 22px |
| P2-61 | src/data/today.ts:369 | E | P2 | Hover card hand-types BK-2026-0715's total/outstanding instead of deriving from the booking engine — one booking, two outstandings (blocked on §6 decisions 2–4) |
| P2-62 | today/CalendarPanel.tsx:24 | B | P2 | Day/month-nav ghost buttons 26×26; mini-month day cells 30px (Law 15, landing page's most-used card) |
| P2-63 | calendar/Calendar.tsx:1566 | IMP | P2 | Full-view Conflicts card hardcodes '4' while the KPI band derives 1 from the same seed |
| P2-64 | calendar/Calendar.tsx:723 | B | P2 | Mini-month days 26px, iconBtn 34px, chips 26px, close buttons ~20px (Law 15) |
| P2-65 | documents/Documents.tsx:530 | B | P2 | 'Create Document' silently runs a mock action minting the retired DOC- prefix under {system, admin} ctx; no feedback, no Unavailable |
| P2-66 | documents/Documents.tsx:171 | B | P2 | Row action icons 24×24, pagination 26px (Law 15) |
| P3-29 | today/Today.tsx:225 | A | P3 | RENTAL_PICKED_UP listener can never fire — completePickup emits RENTAL_CONFIRMED; console.log handlers left in |
| P3-30 | today/CalendarPanel.tsx:264 | G | P3 | 'Previous month' navigates to a date the Date Engine cannot name — silently lands on today's window; Calendar disables the identical control with a stated reason |
| P3-31 | src/data/today.ts:430 | F | P3 | CAL_MONTH hand-writes 'Shrawan 2083' over a grid whose first 15 days are Ashadh; §13 comment says twelve entries over a 14-item array |
| P3-32 | calendar/Calendar.tsx:59 | IMP | P3 | Doc comment describes a role-mapping table removed 8 Aug (also Documents.tsx:45-51) |
| P3-33 | calendar/Calendar.tsx:1481 | IMP | P3 | Full-view overlay is role=dialog without aria-modal, focus move, or trap |
| P3-34 | src/data/calendar.ts:350 | IMP | P3 | 'Today's Operations 18' vs rail summary 16 vs Today page's 25 — three answers to one question |

> † P2-57 downgraded: bug confirmed (guard never suppresses the HoverCard) but impact is overlay stacking only — the menu stays on top and operable; wrong-state-shown = P2 by the repo ladder.

### 4.8 Notifications

### [P1-34] — Broadcast seed hand-types impossible BS dates ('May 15, 2082 BS') and sits a year off the product's TODAY

**Screen:** src/data/broadcast.ts : 7
**Severity:** P1 · **Group:** F · **Rule broken:** F1/F5 — BS derived never stored; toBs/formatBs/formatAd bypassed
**Root cause:** PERIOD (:7), CAMPAIGNS.bs '2082/01/15 BS' (53–59), PERFORMANCE.labels 'May 8 BS' (104), UPCOMING bs:'Apr 30'/bsYear:'2082 BS' (114–118) are stored strings pairing an AD month name with a BS year — 'May' is not a BS month — and the whole screen is set in Apr–May 2025 / 2082 BS while every other screen runs on TODAY = 31 Jul 2026 = 16 Shrawan 2083. Nothing flows through lib/bs. Rendered verbatim at BroadcastCenter.tsx 190–193, 373–374, 637–641.
**Fix:** Store AD Date (UTC midnight) anchored near TODAY, derive every BS label at render via toBs/formatBs; where outside the engine's vouched month, show AD alone.
**Acceptance:** No `bs:` string fields in data/broadcast.ts; on-screen BS labels use real BS month names and reconcile with lib/bs for their AD pair.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-35] — No money gating anywhere on SMS Center — gateway balances and a client payment figure render for every role

**Screen:** src/modules/notifications/SmsCenter.tsx : 188
**Severity:** P1 · **Group:** B · **Rule broken:** Law 6 — Warehouse/Technician/Driver/Client see no money
**Root cause:** The screen renders 'NPR 24,560' etc. balances (:188; data/sms.ts 26–31), the Linked Records card shows 'Paid NPR 48,500' (435–441; data/sms.ts:101) and ALERTS carries 'NPR 24,560' (data/sms.ts:153) — with no useCanViewMoney/canViewMoney call in the file. Every other screen in this sweep omits money nodes for the money-blind set; here the figures are built unconditionally into the DOM.
**Fix:** Gate with useCanViewMoney(): omit the Balance column, the Payment linked record and money alerts from the arrays before render (the documentsFor(money) pattern).
**Acceptance:** With role 'Warehouse', no rupee/NPR/USD figure exists in the SMS Center DOM.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-36] — SMS seed stores BS strings, mixes AD month names with BS years, and runs a year behind the product

**Screen:** src/data/sms.ts : 68
**Severity:** P1 · **Group:** F · **Rule broken:** F1/F5 — BS stored; engine bypassed
**Root cause:** MESSAGES.bs are stored strings (68–75); VIEWER.body says 'from May 15, 2082 BS to May 18, 2082 BS' (87) — an AD month with a BS year; every timestamp is May 2025 while TODAY is 31 Jul 2026. The linked booking 'BK-2082-05-1032' (99) also breaks the BK-YYYY-NNNN shape and links (SmsCenter.tsx:427–433) to a booking that exists nowhere in seed.
**Fix:** Re-anchor the seed to AD Dates near TODAY, derive BS at render via lib/bs, and link a real seeded booking number.
**Acceptance:** No stored `bs:` strings; the Sent Time column derives from toBs; the Booking link opens a seeded booking.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-37] — Toasts announce events that did not happen: 'Message delivered', 'Payment recorded', 'Opened Link to Client modal', 'New conversation draft initiated'

**Screen:** src/modules/notifications/UnifiedInbox.tsx : 110
**Severity:** P1 · **Group:** B · **Rule broken:** Law 12 + integrity — toasts must report real successes
**Root cause:** handleSendMessage only appends to local state yet toasts 'Message delivered via WhatsApp' (110) — an operator will believe the client received it; 'New Conversation' (182) and 'Link to Client' (603) toast actions with no implementation; 'Receive Payment' (971) toasts 'Payment recorded' synchronously, before and regardless of the action promise settling.
**Fix:** Toast only on a real success callback; for unbuilt paths use the repo's Unavailable pattern; wording must not claim delivery that did not occur.
**Acceptance:** No toast text asserts an outcome the code did not produce; unbuilt controls state why.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-38] — 'Receive Payment' is live for every role, dispatches a hardcoded Rs 1,000 payment with no session identity or idempotency key

**Screen:** src/modules/notifications/UnifiedInbox.tsx : 964
**Severity:** P1 · **Group:** B · **Rule broken:** Law 6 + Law 8 + canRecordPayment
**Root cause:** The quick launcher (964–975) is not gated by canRecordPayment/useCanViewMoney — a Warehouse/Technician/Driver session can trigger it; it calls recordPayment({bookingId: possibly undefined, amountPaisa: 100000}) under actions/core.ts's default ctx {userId:'system', role:'admin'} with no client UUID, no .catch on the import chain, and an unconditional success toast. Today it hits a console-mock — this becomes a P0 the day the action is wired to Supabase.
**Fix:** Gate behind canRecordPayment(role) (omit for others), collect a real amount, pass session ctx + client_uuid, toast only on resolve, handle rejection inline.
**Acceptance:** Money-blind roles never see the button; a recorded payment carries the signed-in user and a client_uuid; toast only after success.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-39] — Inbox data model stores BS strings on every message and the composer hardcodes '22 Shrawan 2083 BS, Just now'

**Screen:** src/modules/notifications/UnifiedInbox.tsx : 88
**Severity:** P1 · **Group:** F · **Rule broken:** F1/F5 / Law 7 — BS rendered never stored
**Root cause:** data/inbox.ts stores sentAtBs / lastMessageAtBs as pre-rendered strings (46–47, 70–71); the screen writes a new message with sentAtAd = real wall clock (10 Aug 2026 = 26 Shrawan) but sentAtBs hardcoded to '22 Shrawan 2083' (87–88), so the stored pair disagrees with itself and with the app's TODAY. No call to lib/bs exists in the module.
**Fix:** Drop the *AtBs fields; store AD instants only and derive the BS label at render through toBs/formatBs.
**Acceptance:** grep for 'Bs:' string fields in data/inbox.ts returns nothing; message timestamps render BS derived from their own AD value.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-40] — 'Use AI Draft' inserts a hardcoded reply asserting stock availability and a reservation no system made

**Screen:** src/modules/notifications/UnifiedInbox.tsx : 129
**Severity:** P1 · **Group:** B · **Rule broken:** Law 16 — no AI surface without real computation
**Root cause:** handleApplyAiSuggestion (129–134) injects 'yes we have 2x Sony FX6 V-Mount batteries available. I have reserved them for your dispatch…' — fabricated inventory facts and a fabricated reservation, presented in an 'AI Suggestion' panel (747) with no backing computation. Staff could send this to a real client.
**Fix:** Remove the panel or back it with a real availability query; until then mark it Unavailable with the reason.
**Acceptance:** No AI-labelled surface produces content that is not computed from data.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-41] — Financial Summary gate hand-rolls `role === 'Warehouse'` — Technician, Driver and Client sessions see Lifetime Spend, Outstanding and Deposit

**Screen:** src/modules/notifications/UnifiedInbox.tsx : 137
**Severity:** P1 · **Group:** B · **Rule broken:** Law 6 — money-blind set is 4 roles, not 1
**Root cause:** Line 137 reimplements the money gate locally instead of using useCanViewMoney/canViewMoney, whose MONEY_BLIND set is {Warehouse, Technician, Driver, Client} (lib/rbac.ts:45–50). Three money-blind roles get the full financial block (926–946); the masking note also says 'masked' where the law demands structural absence (the code does omit, the copy misstates).
**Fix:** Replace with `const money = useCanViewMoney()` and reuse it for the Receive Payment launcher; reword the placeholder to say the figures are omitted.
**Acceptance:** With role 'Technician', no money node exists in the inbox DOM.
**Blocked on:** none · **Verified:** CONFIRMED

**Notifications P2/P3:**

| ID | Location | Grp | Sev | Finding |
|---|---|---|---|---|
| P2-67 | notifications/BroadcastCenter.tsx:388 | IMP | P2 | Fake pagination ('1 to 6 of 56', pages 1–10) and a dozen active-looking dead buttons; ⋮ Actions glyph is not a control |
| P2-68 | src/data/sms.ts:101 | E | P2 | Money hand-typed as 'NPR 24,560'/'USD 48.30'/'Paid NPR 48,500' template strings bypassing formatMoney and the Rs convention |
| P2-69 | notifications/SmsCenter.tsx:312 | IMP | P2 | Fake pagination ('1 to 25 of 2,158' over 8 rows); viewer actions are bare icons; empty-label calendar button with no aria-label |
| P2-70 | notifications/UnifiedInbox.tsx:120 | E | P2 | Template fill hardcodes outstanding 'Rs 45,000' + item name while claiming variables come from the booking (CONV-2026-003 really owes Rs 1,20,000) |
| P2-71 | notifications/UnifiedInbox.tsx:267 | D | P2 | var(--hover) (14 uses) and var(--t-title) undefined — selected/active states render transparent; raw rgba shadows; fill tokens used as text |
| P2-72 | notifications/UnifiedInbox.tsx:199 | C | P2 | KPI cards, toast system and money check all reimplemented locally instead of KpiStrip/ToastProvider/moneyVisibility; modal lacks Esc/focus trap |
| P3-35 † | notifications/BroadcastCenter.tsx:451 | B | P3 | 'customer' in builder copy, {{customer_name}} template variable, 'VIP Customers' activity line (Law 17) |
| P3-36 | notifications/BroadcastCenter.tsx:54 | IMP | P3 | Chart y-axis (0–8K) unrelated to plotted values; series highlight hover-only (also SmsCenter VolumeChart) |
| P3-37 | src/data/sms.ts:153 | IMP | P3 | Alerts contradict the gateway table beside them (wrong gateway latency, 'low balance' on the largest balance) |
| P3-38 | src/data/inbox.ts:344 | IMP | P3 | 'Messages Today' counts all messages ever; 'Median First Response 18 mins' is a hardcoded string styled as computed |

> † P3-35 downgraded: all four occurrences verified, but the repo's doubly-verified audit classifies customer-word leaks as P3 one-line edits.

### 4.9 Automation · AI · Admin · Settings · System · Auth

### [P1-42] — Three admin screens render live-looking AI panels with hardcoded content and dead inputs

**Screen:** src/modules/automation/EventTriggers.tsx : 571
**Severity:** P1 · **Group:** B · **Rule broken:** Law 16
**Root cause:** EventTriggers 'AI Trigger Assistant — Preview' (571-625), AuditSettings 'AI Audit Assistant' (583-603, not even labelled Preview) and BackupRestore 'AI Backup Advisor — Preview' (565-601) each render seed-transcribed advisory bullets plus a free-typing input ('Ask AI about backups…') with an arrow glyph wired to no handler, no disabled attribute and no stated reason. The repo's own precedent (NumberingSequences.tsx:1426, Tools.tsx AI card) is a disabled control wrapped in Unavailable with the reason attached.
**Fix:** Replace each input with the Unavailable-wrapped disabled pattern ('No model is wired up in this build') and either derive the advisory bullets from the screen's own seed counts or label them as render transcription pending removal.
**Acceptance:** No focusable, live-styled AI input exists on /automation, /admin/audit or /admin/backup; each AI card states why it is dark.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-43] — AI suggestions are hardcoded constants while the page claims they are computed from seed data

**Screen:** src/modules/ai/AiAssistant.tsx : 174
**Severity:** P1 · **Group:** B · **Rule broken:** Law 16
**Root cause:** SUGGESTIONS (26-33) is a literal array in the .tsx with no derivation from any src/data seed, yet line 174 prints 'The suggestions above are computed from seed data.' data/today.ts exposes RETURN_OVERDUE and could back the first claim, but nothing is read from it. The Ask input, Ask button, four PROMPT chips and 'New conversation' are live-looking controls wired to nothing (the 'Not wired to a model yet' note covers the model, not the dead controls).
**Fix:** Either actually derive each suggestion from the seeds so the on-page claim is true, or change the copy to state the suggestions are illustrative and render the Ask input via the shared Unavailable pattern.
**Acceptance:** Every rendered suggestion's figure is traceable to a src/data export (change the seed, the suggestion changes), or the panel is explicitly marked unavailable and the false sentence is gone; Ask/prompt controls are functional or visibly inert with a reason.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-44] — Restore Center offers a 'Customers' restore scope

**Screen:** src/modules/admin/BackupRestore.tsx : 310
**Severity:** P1 · **Group:** B · **Rule broken:** Law 17
**Root cause:** src/data/backup.ts:64 lists 'Customers' in RESTORE_SCOPES; BackupRestore.tsx renders every scope as a radio label (310-319), putting the banned word directly in the UI.
**Fix:** Rename the scope to 'Clients' in src/data/backup.ts RESTORE_SCOPES.
**Acceptance:** The 'Restore What?' radio group on /admin/backup reads 'Clients'; repo grep for 'Customers' in data/backup.ts is empty.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-45] — Four completed screens are orphaned — no route, no import anywhere

**Screen:** src/modules/settings/BusinessHours.tsx : 1609
**Severity:** P1 · **Group:** A · **Rule broken:** A3 / §0.4 manifest reconciliation
**Root cause:** BusinessHours.tsx (1666 lines), CommunicationSettings.tsx, Tools.tsx and Timesheet.tsx are imported by nothing: App.tsx imports only modules/settings/Settings, Settings.tsx's SYSTEM_LINKS names none of them, and data/nav.ts carries no path. Three are deep Generation-C builds with exported Pane/Rail pairs explicitly designed 'so Settings can mount this screen as a pane'; Tools' own doc comment says it 'lives inside Settings', yet Settings never mounts it.
**Fix:** Add routes or Settings-pane mounts via the exported Pane/Rail pairs, plus SYSTEM_LINKS rows; decide whether Timesheet is superseded by CrewBooking's Timesheets tab and either route it or delete it.
**Acceptance:** Each of the four default exports is reachable from a URL or a Settings link; SCREENS.md and App.tsx agree; no default-exported screen module has zero importers.
**Blocked on:** none · **Verified:** CONFIRMED

**Automation / Admin / Settings / System / Auth P2/P3:**

| ID | Location | Grp | Sev | Finding |
|---|---|---|---|---|
| P2-73 | src/App.tsx:609 | A | P2 | /admin/audit labelled 'Immutable Audit Trail' but mounts AuditSettings (double-mounted); the real log sits at /admin/audit-log — every 'View all activity' link lands wrong |
| P2-74 | admin/SystemRestoreModal.tsx:13 | A | P2 | Unreachable dead code faking a 2FA gate and a completed restore; contradicts BackupRestore's documented restore-stays-unwired decision; undefined tokens |
| P2-75 | automation/EventTriggers.tsx:429 | C | P2 | Decorative pagination ('1 to 10 of 148' over 7 rows); Create/Test/Import/Export/Refresh, Edit/Test Trigger, Quick Actions, FILTERS all dead with no Unavailable |
| P2-76 | admin/BackupRestore.tsx:268 | C | P2 | Dead header actions; pager claims 1,248 over 8 rows; per-row download/verify/more glyphs are bare icons, invisible to keyboard/SR |
| P2-77 | admin/AuditSettings.tsx:173 | C | P2 | Dead header quartet; toggles flip local state that persists nowhere with no 'presentational' disclosure (Settings.tsx precedent exists) |
| P2-78 | settings/Timesheet.tsx:20 | C | P2 | Button icon="download"/"edit" renders the literal words inside the buttons — two Button families with colliding icon prop types |
| P2-79 | settings/Timesheet.tsx:54 | D | P2 | Badge.tsx still Tailwind-class based (compiles to nothing) — badges render as bare text; hardcoded palette; banned IconStar |
| P2-80 | admin/ActivityLog.tsx:58 | C | P2 | ActivityLog + AuditLog wrap their main table in <Rail> (288px collapsible aside) — content collapses behind a chevron on phones |
| P2-81 | admin/ActivityLog.tsx:75 | F | P2 | Log timestamps render AD-only via browser-locale toLocaleString, bypassing lib/bs (also AuditLog:76) |
| P2-82 | admin/AuditLog.tsx:5 | C | P2 | Hand-rolled any-typed KPI cards; dead icon props naming icons that don't exist; undefined --neutral/--text3 tokens; '14,502 activities' over 3 rows |
| P2-83 | system/SystemMonitor.tsx:162 | D | P2 | var(--orange-text) does not exist — pending-mutations warning colour silently lost |
| P2-84 | system/SystemMonitor.tsx:76 | A | P2 | handleForceSync awaits drainQueue() with no catch — a failed drain leaves the button stuck on 'Syncing...' forever |
| P2-85 | system/SystemMonitor.tsx:18 | IMP | P2 | All 'observed' telemetry hardcoded; header pill 'All systems operational' directly above a Degraded row and 2 open incidents |
| P2-86 | auth/ScreenLock.tsx:28 | D | P2 | Lock overlay hardcodes rgba(255,255,255,0.95) — white sheet over the app in dark theme; var(--modal) exists for exactly this |
| P2-87 | auth/ScreenLock.tsx:131 | A | P2 | 'Sign out as Ramesh' hardcodes the user and navigates without calling logout() — session survives the sign-out |
| P2-88 | auth/HandoverSheet.tsx:49 | C | P2 | 'Hand over & log out' and 'Skip' are the same action — note and recipient silently discarded |
| P2-89 | admin/AuditSettings.tsx:61 | IMP | P2 | Toggle knob raw #fff on success-green fill — ~2.3:1 in dark theme; BRAND_ON.success exists for this (NumberingSequences precedent) |
| P2-90 | automation/EventTriggers.tsx:398 | F | P2 | triggers/audit/backup seeds store BS strings dated May 2025 — a different 'today' than the whole app; suspected F2 off-by-one (needs converter check) |
| P2-91 | automation/EventTriggers.tsx:136 | G | P2 | Seven scoped screens render seed unconditionally — none of the five states reachable |
| P2-92 | auth/Login.tsx:175 | B | P2 | ~17px text buttons on tablet-first auth surfaces; the two shared Button primitives encode contradictory readings of Law 15 (34 vs 44) |
| P3-39 † | automation/EventTriggers.tsx:168 | B | P3 | 'Customers' category and 'Customer Created' trigger render on screen (Law 17; data/triggers.ts:20,88) |
| P3-40 | settings/BusinessHours.tsx:160 | IMP | P3 | ToneChip/KpiCard/DestControl/Unavailable/downloadCsv copy-pasted across three settings screens; drift begun |
| P3-41 | auth/HandoverSheet.tsx:32 | C | P3 | Three booking-number formats render: BR-1043, BK-2026-0713, BKG-4102 — blocked on §6 decision 6 |
| P3-42 | settings/Timesheet.tsx:6 | F | P3 | AD-only rows with malformed times ('14:30 PM'); inline mock array; negative-margin Card hack |
| P3-43 | admin/BackupRestore.tsx:135 | IMP | P3 | Fixed repeat(6/7)-column grids never collapse below 768 (also EventTriggers, AuditSettings, SystemMonitor) |
| P3-44 | admin/AuditSettings.tsx:240 | D | P3 | Rainbow catColor(i) where colour encodes nothing (also SystemMonitor resource bars) |
| P3-45 | admin/NumberingSequences.tsx:928 | A | P3 | Starting Number field edits draft state nothing consumes — no visible consequence, no stated non-consequence |
| P3-46 | auth/Login.tsx:28 | G | P3 | Login accepts any input; 'Send OTP' performs the login; no invalid-credential path exists |

> † P3-39 downgraded: facts confirmed, but AUDIT_FINDINGS.md's P3 section lists these exact lines as known one-line data-file edits.

### 4.10 Components (shell + ui)

### [P1-46] — Scanner teardown calls zxing reset() which does not exist; camera can never be stopped

**Screen:** src/components/shell/ScannerFab.tsx : 70
**Severity:** P1 · **Group:** A · **Rule broken:** A5/A2 — call into a method that does not exist in the installed dependency
**Root cause:** ScannerFab calls `(codeReader.current as any)?.reset()` at 70 and 99. Verified against node_modules: @zxing/browser 0.2.1 has NO reset() on BrowserCodeReader or BrowserMultiFormatReader (grep of .d.ts and .js: zero hits) — reset() was the old @zxing/library API; the `as any` cast is the tell. The optional chain guards only the ref, not `.reset`, so once a reader exists, closing the panel (or toggling continuous, or unmount) invokes undefined() and throws TypeError in the effect/cleanup. Separately, `decodeFromVideoDevice()` (:85) resolves to an IScannerControls whose `.stop()` is the real teardown — that promise result is discarded, so no code path stops the camera stream or decode loop: the camera light stays on after the panel closes.
**Fix:** Capture the controls (`const controls = await codeReader.current.decodeFromVideoDevice(...)`), store in a ref, call `controlsRef.current?.stop()` in cleanup. Delete both `(… as any)?.reset()` calls. Stop MediaStream tracks if stop() leaves them (BrowserCodeReader.releaseAllStreams if available).
**Acceptance:** Open the scanner panel with a camera present, close it: no TypeError in console, camera indicator light goes off, no ErrorBanner. Toggling Continuous mode remounts the camera without a throw.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-47] — Command palette (global ⌘K surface) is styled entirely in Tailwind classes that compile to nothing

**Screen:** src/components/shell/CommandPalette.tsx : 191
**Severity:** P1 · **Group:** C · **Rule broken:** Component API / dead-Tailwind precedent documented in Toast.tsx, Modal.tsx, Card.tsx doc comments
**Root cause:** Toast/Modal/Card/Button/Input/StateViews were all rewritten because "Tailwind's Vite plugin is registered but no CSS file imports tailwindcss, so every one of those classes compiled to nothing" (their doc comments). CommandPalette was missed: everything from the `fixed inset-0 z-50` overlay (:191) down to the result rows is Tailwind classNames. At runtime the palette renders as an unstyled, non-overlaying block in normal document flow — no backdrop, no positioning, no dark card. It is mounted globally in App.tsx (:87) and is the ⌘K affordance the Header search button points every user at.
**Fix:** Rewrite CommandPalette to the inline-style + CSS-variable system exactly as Toast.tsx/Modal.tsx were (same prop shapes, same behaviour), using --dropdown/--border/--shadow-modal and the t-* type tokens.
**Acceptance:** Pressing Ctrl/⌘K shows a centered floating palette over a dimmed backdrop in both themes; DOM inspection shows no Tailwind utility classNames left in the file.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-48] — Select renders completely unstyled (dead Tailwind) and is live in the shift-handover logout flow

**Screen:** src/components/ui/Select.tsx : 23
**Severity:** P1 · **Group:** C · **Rule broken:** Same dead-Tailwind defect class; live call path via HandoverSheet
**Root cause:** Select.tsx is 100% Tailwind utility classNames which compile to nothing — same root cause the Card.tsx/Toast.tsx doc comments record. Unlike most of the Tailwind set, Select IS on a live path: HandoverSheet.tsx imports it via the components/ui barrel, and Header.tsx opens HandoverSheet on logout for Warehouse/Technician/Driver roles. Those floor roles get a bare unstyled native select and unstyled labels in a modal. The class strings are also a hardcoded dark-only slate palette, so even if Tailwind were activated it would break light theme.
**Fix:** Rewrite Select to the inline-style + token system (mirror Input.tsx, the already-converted sibling with the same label/error/helperText API), including the 44px min-height and --input-* tokens.
**Acceptance:** HandoverSheet's role/handover dropdown renders with input tokens in both themes; no Tailwind classNames remain in Select.tsx.
**Blocked on:** none · **Verified:** CONFIRMED

### [P1-49] — Page.tsx Button is 34px tall — the app's dominant button (~70 screens) breaks Law 15

**Screen:** src/components/ui/Page.tsx : 143
**Severity:** P1 · **Group:** B · **Rule broken:** Law 15 — 44×44 touch targets
**Root cause:** Page.tsx's Button hardcodes `height: 34` (:143). This is the button used by roughly 70 screens (every ui/Page importer, plus StateViews' EmptyState/ErrorBanner and BarcodeScannerModal). The parallel Button.tsx explicitly documents the law — "Law 15: minimum 44px touch target on every device — never relaxed, even for sm" — and uses minHeight 44, so the two families disagree on a numbered law and the smaller one won the app. No doc comment in Page.tsx claims a deviation.
**Fix:** Change Page.tsx Button to `minHeight: 44` (keep visual compactness with padding if desired, but the hit target must reach 44px). Re-check dense toolbars at 768 afterwards.
**Acceptance:** Computed height of every Page.tsx Button instance ≥ 44px; no layout overflow on the 768 breakpoint on RentalsList/Finance toolbars.
**Blocked on:** none · **Verified:** CONFIRMED

**Components P2/P3:**

| ID | Location | Grp | Sev | Finding |
|---|---|---|---|---|
| P2-93 † | components/shell/Header.tsx:246 | A | P2 | Log Out <button> nested inside the user-profile <button> — invalid HTML; works in practice because React builds the DOM programmatically |
| P2-94 | components/ui/index.ts:1 | C | P2 | SYSTEMIC: two parallel Card/Button families ship simultaneously with measurable drift (34 vs 44px, differing Card APIs); barrel exports the wrong family as default; StockCheck/PurchaseRequests mix families in one screen |
| P2-95 | components/ui/BarcodeScannerModal.tsx:292 | D | P2 | Scan banners mix undefined *-bg tokens (light hex fallback always wins) with real dark-theme *-text tokens — ~1.3:1/1.5:1 in dark; internal fallback drift; --nav-active-accent-bg wrong token name |
| P2-96 | components/shell/Header.tsx:141 | D | P2 | Branch/FY pills hardcode dark-theme rgba/hex failing light-theme contrast (≈1.6:1/2.2:1); 11px under the --t-th floor; branch label duplicates data/nav BRANCH; static FY will go stale |
| P2-97 | components/shell/CommandPalette.tsx:62 | B | P2 | Palette ignores RBAC — Warehouse gets Finance and booking-creation commands; labels drift from data/nav; advertises shortcuts no code implements (New Booking action blocked on §6 decision 5; rest unblocked) |
| P2-98 | components/shell/ScannerFab.tsx:159 | B | P2 | Scanner fabricates success: every real code beeps OK and reads 'ticked' with no engine behind it — wrong-job only triggerable by a code containing the literal 'ERR' |
| P2-99 | components/ui/BarcodeScannerModal.tsx:87 | A | P2 | Matcher accepts name-substring — a fragment can tick the wrong asset; fabricated default bookingId 'BK-2026-0710' (prefix part blocked on §6 decision 6; matcher fix unblocked) |
| P2-100 | components/ui/WarehouseMap.tsx:64 | D | P2 | var(--app-bg) does not exist — token is --app; map canvas and scanner manual-entry input render transparent (also ScannerFab:275) |
| P2-101 | components/ui/index.ts:6 | C | P2 | Nine exported components are dead code in never-compiling Tailwind, embedding latent violations (global Ctrl+B duplicate binding, reimplemented STATUS tokens, parseMoney bypass) |
| P2-102 | components/ui/MoneyField.tsx:23 | B | P2 | Money components take fully-built figures as props and mask per role — the construct-then-hide anti-pattern as an API (B6); unused today, invites a leak on first adoption |
| P2-103 | components/ui/Badge.tsx:89 | C | P2 | Badge unstyled (dead Tailwind, live in Timesheet); bypasses the Icon registry with 13 direct Tabler imports; gives VIP the deliberately-unregistered star |
| P2-104 | components/shell/Header.tsx:177 | IMP | P2 | Bell hardcodes '12 unread' into badge and aria-label with no backing store; bell and Help buttons do nothing |
| P2-105 | components/shell/Header.tsx:21 | B | P2 | Sub-44px targets across shell/overlay chrome (10 sites: Header 34px, Sidebar 26px, Aside handles 24-28px, Modal close 32px, Toast dismiss 20px, IntelCard peek 26px, WarehouseMap zoom 36px, ScannerFab 24-30px, scanner chips 26-30px) |
| P2-106 | components/ui/Page.tsx:196 | IMP | P2 | KpiStrip locks columns to items.length — six KPIs collapse to unreadable slivers on phone; no breakpoint behaviour |
| P3-47 | components/ui/Page.tsx:128 | D | P3 | var(--btn-danger-bg,#dc2626) — token never defined, dark theme gets the light-theme red (also Button.tsx:59) |
| P3-48 | components/ui/Button.tsx:64 | D | P3 | Gold variant hardcodes #d8a93a/#000 — dark-theme gold baked into both themes (currently unused) |
| P3-49 | components/shell/ScannerFab.tsx:329 | C | P3 | FAB wears the 'search' magnifier; no barcode glyph in the registry; CommandPalette/ScannerInput bypass the registry to get one |
| P3-50 | components/shell/ScannerFab.tsx:108 | IMP | P3 | New AudioContext per beep, never closed — feedback audio dies after ~6 scans in capped browsers (also BarcodeScannerModal:28) |
| P3-51 | components/ui/Modal.tsx:45 | IMP | P3 | aria-modal + Esc but no focus trap and no initial focus move — inherited by every modal consumer |
| P3-52 | components/shell/Header.tsx:121 | IMP | P3 | Search affordance shows only ⌘K on a Windows-primary deployment; opens palette via synthetic KeyboardEvent coupling |
| P3-53 | components/ui/Charts.tsx:336 | C | P3 | LineChart tooltip passes a percent string `as unknown as number` and approximates its x position — drifts off the hovered point |

> † P2-93 downgraded: nesting confirmed and invalid per spec, but React-built DOM does not reparent — the inner button works; wrong-but-working = P2 by the repo ladder.

---

## 5. Skill findings

### 5.1 Protocol pre-flight findings (§0.1–§0.4)

- **S-A:** ".impeccable" in the repo is a hook-cache directory (hook.cache.json), not the quality-bar document §0.1's authority table describes; the sweep ran under the impeccable skill's audit dimensions instead.
- **S-B:** The two carried fix-spec files (BR2613_BOOKING_DETAIL_FIX_SPEC_v1.0.md, NEW_BOOKING_FIX_SPEC_v1.0.md) do not exist anywhere in the workspace; their §4 carry-forward IDs are unverifiable as documents, and only the inline headline items quoted by the protocol itself were checked.
- **S-C:** Baseline drift: protocol §0.3 expects 29 tsc errors in 16 untracked screen WIP files; actual baseline is 28 errors, all inside src/lib/booqable/** (a concurrent session's in-flight work), zero in screens.
- **S-D:** Protocol §0.4's git commands are unusable — the workspace is not a git repository; the manifest was built by filesystem glob (133 tsx total; 99 under src/modules vs the protocol's "85 screens" — the delta is subcomponent files in module subfolders, enumerated per sweep agent's filesSwept).

### 5.2 Skill-verify sweep — babin-report-excellence (§0.2)

The precedent §0.2 warns about has recurred: the 8 Aug palette correction fixed the token doc and the lint whitelist but left the shipped asset layer and the checker on the retired system.

### [S1] — report.css still ships all four retired hues as live status tokens — the nine-hue palette precedent is NOT fully fixed

**Screen:** .claude/skills/babin-report-excellence/assets/report.css : 15
**Severity:** P1 · **Group:** S · **Rule broken:** Protocol §0.2 / D2 retired hues / corrected design-tokens.md §2
**Root cause:** The 8 Aug correction replaced design-tokens.md and purged the lint whitelist but never touched the shipped stylesheet. Lines 14-16 declare --status-prep:#F5C518, --status-move:#2FD4C4, --status-return:#8B5CF6, --status-attention:#FF9F43 (plus the rest of the ORIGINAL nine-hue system). SKILL.md still instructs every report to link this file, and card-templates.html badge classes resolve into these hues, so every generated report renders banned colours regardless of what the corrected token doc says.
**Fix:** Rewrite report.css to consume src/styles/theme.css variables per corrected design-tokens.md §2 (five-plus-gold). Delete the nine --status-* declarations and remap badge/delta classes onto the theme.css pairs.
**Acceptance:** grep for #2FD4C4|#8B5CF6|#FF9F43|#F5C518 across the skill's assets returns zero hits; badge and kpi-delta classes resolve only to var() names that exist in src/styles/theme.css.
**Blocked on:** none · **Verified:** CONFIRMED

### [S2] — Asset layer contradicts the corrected token doctrine: 40+ hardcoded hexes and an alien token vocabulary that does not exist in theme.css

**Screen:** .claude/skills/babin-report-excellence/assets/report.css : 4
**Severity:** P1 · **Group:** S · **Rule broken:** corrected design-tokens.md §1 ('Do not declare a hex anywhere') / D1
**Root cause:** Corrected design-tokens.md §1 states theme.css is the only file where a colour value may exist, yet report.css (:root block, ~20 hexes + rgba literals), report-print.css (14 hexes twice over) and _light-tokens.css (13 hexes) all declare their own palettes under the ORIGINAL semantic names (--surface-base, --text-primary, --accent, --status-*) — none of which exist in theme.css. SKILL.md's draft pass points at BOTH the corrected doc and these assets, so the skill gives contradictory instructions and the assets win whenever markup is copied.
**Fix:** Migrate all three CSS assets to reference theme.css tokens, keeping only pure #fff/#000 print literals. The light surface derives from theme.css's light block, not a parallel hand-rolled set.
**Acceptance:** Every var() consumed in assets/*.css is defined in src/styles/theme.css; the only literal hexes remaining in assets are #fff/#000; lint_report.py on a rendered report using these assets reports no non-token hex.
**Blocked on:** none · **Verified:** CONFIRMED

### [S3] — check_contrast.py validates a frozen copy of the retired palette, not the shipped tokens — it will report PASS forever regardless of drift

**Screen:** .claude/skills/babin-report-excellence/scripts/check_contrast.py : 24
**Severity:** P1 · **Group:** S · **Rule broken:** Protocol §0.2 broken-auditor precedent / SKILL.md line 41 claim
**Root cause:** The DARK/LIGHT dicts (24-33) hardcode the ORIGINAL token values; the script reads no CSS file. Its LIGHT accents (#1F5FD0/#9A7620) do not even match the generated _light-tokens.css (#296DE0/#927127), proving it is disconnected from shipped values. It never checks the status hues or the --on-brand/--on-progress/--on-success pairs the corrected doc cites as the whole point of commit 15210f6. SKILL.md claims it 'verifies every token pair meets WCAG AA on both themes' — it verifies 12 frozen literals. Same defect class as the original APPROVED_HEX incident: a checker that green-lights banned state.
**Fix:** Make the script parse its pairs from the actual stylesheets (theme.css once assets are migrated), including status fg/bg and on-brand ink pairs, and fail on any var referenced in assets but undefined in the source. Also fix the 'muted (large only)' classification — see S9.
**Acceptance:** Editing any colour in the source stylesheet changes check_contrast.py's output; the script fails when a shipped pair drops below AA (demonstrable by temporarily lightening --muted).
**Blocked on:** none · **Verified:** CONFIRMED

### [S4] — Canonical templates and reference docs seed wrong money format: 'NPR' prefix, Western grouping, M/K abbreviations

**Screen:** .claude/skills/babin-report-excellence/assets/card-templates.html : 66
**Severity:** P1 · **Group:** S · **Rule broken:** E3 / lib/money formatMoney / corrected design-tokens.md §5
**Root cause:** The corrected token doc §5 mandates 'Rs on the value, lakh grouping (Rs 1,85,000, never Rs 185,000)' via formatMoney. The copy-paste source of truth contradicts it throughout: card-templates.html lines 10 ('NPR 2.4M'), 26-28 ('NPR 180K'), 66-81 ('NPR 1,120,000' — Western grouping), 95-96; kpi-cards.md 7, 26-27; families/financial.md 17 ('Every figure NPR'); executive-summary.md 23 ('NPR 180k'). Every report built from these templates ships wrong money formatting. (Distinct from the already-fixed app-screen grouping item — this is the skill's asset layer.)
**Fix:** Replace every NPR figure in card-templates.html and the four reference docs with Rs + lakh-grouped values; drop M/K abbreviations or define a sanctioned lakh/crore abbreviation; state that figures come from formatMoney.
**Acceptance:** grep for 'NPR' under the skill directory returns zero hits; all template figures are Rs-prefixed with lakh grouping matching lib/money output.
**Blocked on:** none · **Verified:** CONFIRMED

**Skill-verify P2/P3:**

| ID | Location | Grp | Sev | Finding |
|---|---|---|---|---|
| S5 | assets/card-templates.html:37 | S | P2 | Reference docs/templates still teach the retired status vocabulary; the Due Soon badge resolves to retired orange #FF9F43 instead of var(--progress) |
| S6 | scripts/build_light_variant.py:52 | S | P2 | The anti-drift generator emits syntactically invalid CSS ('.export, @media print {' — the whole rule is dropped), and its output has already drifted three ways from the hand-maintained print CSS and check_contrast.py |
| S7 | reference/design-tokens.md:66 | S | P2 | The CORRECTED doc names phantom text tokens --text-1/--text-2/--text-3 that do not exist in theme.css (real names: --text/--text2/--muted) |
| S8 | scripts/lint_report.py:56 | S | P2 | Hex gate has three bypasses: 3/4/8-digit hexes, <style> blocks and rgb()/hsl() literals all pass — the lint cannot catch the exact defect class this skill previously shipped, which now lives in a linked stylesheet |
| S9 | assets/report.css:53 | IMP | P2 | 12px text on --text-muted measures 3.16:1 on the card surface — below AA; check_contrast.py is calibrated to miss it ('muted large only' at 3.0 while the CSS uses muted at the smallest sizes) |
| S10 | reference/design-tokens.md:57 | S | P3 | Doc claims 'the scale is fluid — never a fixed px' but theme.css --fs-* tokens are fixed px values; operative rule right, factual claim wrong |
| S11 | assets/report.css:77 | IMP | P3 | Canonical callout style is a 3px left accent border — the flagged side-tab antipattern, propagated as house style to every generated report |

---

## 6. Blocked-on decisions — ranked by defects unblocked

Where blockedOn names an open decision, the defect is logged here and **not patched** — silently patching freezes an undecided rule into a client-facing figure.

| Rank | Decision (§3 of protocol) | Defects unblocked | Severity weight |
|---|---|---|---|
| 1 | **Decision 2 — discount gate basis (line-level, booking gross, or both)** | P1-11 (NewRental stacked discounts evade the gate), P1-24 (AddBundle override measurement base — the 25% cap and named-approver requirement are unblocked and should be patched now), P2-61 (today.ts frozen outstanding, shared with 3–4) | 2×P1 + 1×P2 |
| 2 | **Decision 5 — whether Warehouse may reach /rentals/new at all** | P0-3's routing half (the field-gating half is unblocked — patch it regardless), P2-97 (CommandPalette 'Create New Booking' action for Warehouse) | touches a P0 + 1×P2 |
| 3 | **Decision 6 — booking number prefix, BK- vs BR-** | P2-99 (BarcodeScannerModal fabricated 'BK-2026-0710' default — matcher fix unblocked), P3-41 (three formats: BR-1043 / BK-2026-0713 / BKG-4102), plus P1-23's BR- timeline-bar cleanup rides on it | 1×P2 + 1×P3 (+P1 cleanup) |
| 4 | **Decision 4 — rounding rule (one-rounding-in-paisa vs round-at-each-step)** | P3-09 (Rs 1,24,505 vs 1,24,506 — the carried F1 figure vs the engine's asserted chain; whichever is ruled canonical rewrites the whole rounding convention), P2-61 (shared) | 1×P2 + 1×P3, but it arbitrates the §10.2 reference case every money screen reconciles against |
| 5 | **Decision 3 — crew charges discountable; VAT on the coordination fee** | P2-61 (shared) | 1×P2 |
| 6 | **Decision 1 — coordination fee per crew-day** | No register defect is blocked on it, but CrewBooking's fee/margin math (P2-51) will re-open when ruled | 0 direct |

---

## 7. Cannot be verified statically (protocol §7)

Everything below needs the app running on the Windows machine (`vite build` cannot run on Linux — rollup binary is win32-only). Items flagged in this register that fall under §7 are **suspicions with a reproduction step**, not confirmed-at-runtime facts:

1. **All Law 15 pixel measurements** (P1-49, P2-02, P2-19, P2-29, P2-32, P2-54, P2-55, P2-62, P2-64, P2-66, P2-92, P2-105) — computed from style objects; confirm with DevTools box inspection at 768/1180 and touch emulation.
2. **All contrast figures** (P2-24, P2-49, P2-71, P2-89, P2-95, P2-96, S9) — computed from token values; spot-check with a contrast tool in both live themes.
3. **P0-6 liveness** — the AddEquipment cluster may be a concurrent session's in-flight refactor (the memory file warns another session live-edits this repo). Repro: open /inventory/new, expect ReferenceError on first render. Verify before patching.
4. **P1-46 scanner teardown** — needs a real camera: open/close the scanner panel, watch for TypeError and whether the camera light stays on. @zxing hardware behaviour is out of static scope entirely.
5. **P3-50 AudioContext exhaustion** — scan ~10 times in one session; verify the beep dies after the browser's context cap.
6. **P1-47 / P1-48 / P2-79 / P2-103 unstyled rendering** — dead-Tailwind conclusions rest on the repo's own doc comments that no CSS file imports tailwindcss; confirm visually (Ctrl+K palette, HandoverSheet select, Timesheet badges).
7. **P2-93 nested-button behaviour** — verify the Log Out click and validateDOMNesting warning across Chrome/Edge on the actual tablet.
8. **Five-states reachability** (P2-30, P2-39, P2-91, P3-17) — structural to the mock stage; real verification only possible once lib/bookingQuery wiring lands.
9. **P2-90 suspected F2 off-by-one** — Jestha 8, 2082 vs May 21/22 2025 needs a converter check; lib/bs's table covers Shrawan 2083 only, so the sweep cannot arbitrate.
10. **P2-50 Asar pairing** — '2083/03/10' ↔ 24 Jun looks off by one against the anchor pair, but Asar month length is the known open boundary; do not patch on suspicion.
11. **P2-36 param-change resync** — currently no reachable same-route navigation exists; repro requires programmatic navigation between /clients/:id values.
12. **Real data flow, PWA install, service worker, offline round-trip through Dexie, Supabase RLS enforcing Law 6 against a live session, Booqable sync** — all out of scope per protocol §7; the action layer audited here is an acknowledged console-mock, which is why several Law 8 candidates were downgraded rather than promoted.
13. **S-C baseline re-check** — re-run `tsc --noEmit` on Windows after every `@ts-nocheck` removal (P0-6, P1-08, P1-31, P2-38) to establish the true error count; the current 28-error booqable baseline belongs to a concurrent session's in-flight work and will move under this sweep's feet.

— End of register —







