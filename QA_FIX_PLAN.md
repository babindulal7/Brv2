# QA Fix Plan — Babin Rentals OS

Derived from [`QA_FULL_AUDIT_REPORT.md`](QA_FULL_AUDIT_REPORT.md), 4 September 2026, commit `a930db5`.

**Written 4 Sep as document-and-classify only** (audit brief §41). Since then some items have
been **fixed in the repo** — see the status table below — but **nothing has been applied to
production**, and nothing should be before the two gates below.

## STATUS — 5 September 2026

| Item | State |
|---|---|
| FIX-1 numbering | **done** — `0089`, standalone so live can take it without `0085`'s renumber. **Not applied to live.** |
| FIX-2 `closeRental` | **done** — exported, Close control on Booking Detail (R-08 gated) |
| FIX-3 crew/transport billing | **done** — plus the line-kind map made exhaustive; new test pins a 60% under-bill |
| FIX-4 the four reported money/lifecycle P0s | **done** for three (`0090`, R-06) · BUG-010 **deliberately not fixed**, see §9 |
| FIX-12 anonymous audit forgery | **done** — `0091`. **Not applied to live.** |
| *new* Law 6 for the write verb (BUG-015) | **done — closes an ACTIVE live hole.** `0092`. Re-tested 6 Sep under live's real per-column grant shape: trigger off → `PATCH /products` as Warehouse returns 204 and rewrites the rate; trigger on → 400, rate holds. An interim note calling this defence-in-depth was measured against a wrong local and is withdrawn. **Not applied to live.** |
| FIX-5 double-booking | open — and re-scoped: the DB hole is real but no app path reaches it (see the report's 5 Sep update) |
| FIX-9 state the grants (BUG-006) | **done** — `0093` encodes live's shape, including Law 6 as a **per-column** SELECT mask (its first draft revoked the whole table and would have broken 13 booking reads on contact). Converges from any state; `check:rebuild` asserts it. |
| *new* Add Equipment could not create serialised gear (BUG-026) | **done — closed an ACTIVE defect, no migration.** The picker offered four facilities that do not exist in `warehouses`; every serialised save was refused. Driven end to end against real Postgres. The unit mock and `lib/mock/corpus.ts` both held one of the fictional rows, which is why the suite stayed green — both now carry `0012`'s real rows. |
| *new* Stock transfers (BUG-027) | **done** — and it was three bugs: seed facility names, a free-text asset field whose own placeholder matches no product, AND `next_document_number('transfer')` having no row. The third is `0089`, so **live stays broken until `0089` applies**. |
| *new* Add Equipment Category picker (BUG-029) | **done** — offered 17, the table holds 6, so 11 refused the save. Found by the sweep, in the screen fixed yesterday. |
| *new* Add Bundle component lines (BUG-030) | open — **a rebuild, not a picker swap.** `modelId` is the join key for five derivations that fail silently; a naive uuid swap empties the screen. Plus a third seed-fed control (the case/bag select) feeds the same lines. Scoped in the audit report. |
| *new* Add Bundle Primary Category (BUG-031) | **done** — reads `inventory_categories`; payload carries `categoryId` while `category` keeps the NAME so Duplicate Existing still works. |
| *new* Bundle line discounts discarded (BUG-032) | open — validated, approved, then written nowhere. |
| *new* A saved draft is an inactive bundle (BUG-033) | open — `isDraft` becomes `is_active: false`. |
| *new* Bundle numbering bricks after nine (BUG-034) | open — `padding = 1` + lpad truncation, confirmed on live. `0089` fixes the function and is not applied. |
| FIX-6 … FIX-8, FIX-10 … FIX-11, FIX-13 … FIX-17 | open |

**Five migrations now wait on the dump: `0089`, `0090`, `0091`, `0092`, `0093`.** All five are verified
on a rebuilt database (`check:rebuild`: 91 applied, 0 failed, grants asserted) and none has touched live.

The invoice path gained a new blocker that is a ruling, not work: **`PLAN.md` §4.46** — does an
invoice bill the booking's lines, or the ones typed on the form? Until that is answered the
crew/transport fix and the Draft-payment fix cannot be reached from a screen.

---

## Gates that come before any fix

1. **A restorable production dump exists.** `PHASE-0-PLAN.md` step 0 still blocks everything,
   and it has not been done. Take it and prove a restore.
2. **Rotate the Booqable API token.** It was committed in plaintext, scrubbed from history on
   2 Sep, and has still never been rotated. Treat it as burned.

The one fact that shapes the ordering: **production has 246 bookings, 366 clients and 204
products, but zero invoices, payments, deposits, expenses, operation sessions and stage
transitions.** Every money defect is latent. There is a window to fix them before the first
real transaction — and that window closes the day someone raises an invoice.

---

## 1 · CRITICAL — production cannot correctly create records today

**FIX-1 · Apply the numbering fix (BUG-001).**
Live mints `B-9`, `C-7`, `INV-1`, `DEP-9`; the second create of each collides. The fix is
already written and verified: `0085` step 6 replaces `lpad(v, padding, '0')` with
`lpad(v, greatest(padding, length(v)), '0')`.
*Action:* apply `0085` + `0088` to production, behind gate 1.
*Regression test:* assert `next_document_number` output equals `current_value + 1` as text for
every sequence — mint it, do not inspect the counter. A counter assertion is exactly what
let this bug through.
*Note:* `0085` also renumbers bookings to bare digits and parks the 46 seed bookings at
90000+. Confirm that renumber is still wanted before applying — it is a one-way change.

**FIX-2 · Export `closeRental` and give it a control (BUG-002).**
343 lines of finished code, absent from `src/actions/rentals/index.ts` and imported by
nothing. Add the export, wire a Close action on the Returned queue and the booking detail.
*Regression test:* drive a booking Quote → … → Returned → **Closed** and assert `closed_at`,
the stage transition row, and deposit release.

**FIX-3 · Bill crew and transport (BUG-003, BUG-007).**
`createInvoice` reads only `booking_lines`. Crew charges live in `booking_crew_lines`
(NPR 2,817,300 across 79 bookings in the corpus) and can never reach an invoice.
Two defects in one place:
- read `booking_crew_lines` and transport, and map them to line kinds;
- `LINE_KIND_BY_TYPE` is keyed on values the enum does not contain (`Crew`, `Transport`)
  while the real members `Accessory`, `Bundle`, `Manual item` have **no** mapping and fall
  back to `'Equipment Rental'` at `createInvoice.ts:452`. Make the map exhaustive over the
  enum and fail loudly on an unmapped kind rather than silently mislabelling.
*Regression test:* invoice a booking with equipment + crew + a bundle; assert the total
equals an independent recomputation and that each line carries its true kind.

**FIX-4 · Verify and then fix the four reported P0 money/lifecycle blocks.**
BUG-008 (pending deposit traps a booking at Packed), BUG-009 (money gate blocks 48 of 53 open
bookings), BUG-011 (raising an invoice permanently blocks handover), BUG-012 (no payment can
be recorded against an app-created Draft). These are single-source and unverified; each is
severe if true and each has a cited mechanism. **Reproduce each one first**, then fix.
They interlock — a Draft invoice both blocks handover and cannot receive payment — so design
the fix across all four rather than one at a time.

---

## 2 · CORE WORKFLOW

**FIX-5 · Close the double-booking hole (BUG-005).**
The right guard already exists — `inventory_reservations_no_double_booking`, an `EXCLUDE`
constraint — but the table is **empty in both environments** and unit commitment happens
through `booking_line_units`, which has no overlap guard. Either make the reservation path
the one that actually writes, or put an equivalent exclusion guard on `booking_line_units`.
Do not leave the only protection in application code.
*Regression test:* attempt to commit one `asset_id` to two overlapping bookings; the database
must refuse it.

**FIX-6 · Deposit accounting (BUG-010).** The Close gate tests `pending_amount`, which measures
*uncollected* deposit, not *unreturned* deposit. Verify, then correct the predicate and add a
deposit-release step to Close.

**FIX-7 · Payment reversal bounds (BUG-013).** Verify, then constrain: total reversed must never
exceed the original payment, and a payment must not be reversible twice.

**FIX-8 · Staggered sessions (BUG-020).** The reused Law 8 key collides on `operation_sessions`,
so a second partial handover or return cannot be recorded. Partial pickups are normal in this
business; this needs a per-pass key.

---

## 3 · DATA INTEGRITY

**FIX-9 · Make the migration set self-sufficient (BUG-006).**
No migration grants base-table privileges to `authenticated`. A DR rebuild produces a database
the application cannot read. Add the grants (or `ALTER DEFAULT PRIVILEGES`) as a migration, and
extend `check:rebuild` to assert `authenticated` can SELECT a representative table — the gate
currently documents this risk in its header but does not test it.

**FIX-10 · Stage integrity (BUG-014, BUG-016, BUG-017).** Verify, then: make forward-only
transitions actually enforced (0021's column revoke is inert — check `has_column_privilege`,
not `has_table_privilege`), refuse direct inserts at arbitrary stages, and stop a Warehouse
user self-approving a multi-stage reversal.

**FIX-11 · Seed VAT drift (BUG-023).** 74 of 120 seed invoices carry whole-rupee VAT that
disagrees with the engine by up to 0.50 (22.04 total). The engine is right; the seed data is
wrong. Because issued invoices are immutable this cannot be corrected in place — regenerate
the corpus rather than patching it, and do not "fix" it by loosening Law 4.

---

## 4 · BACKEND / SECURITY

**FIX-12 · Stop anonymous audit forgery (BUG-004) — do this early.**
`audit_events_insert` is `WITH CHECK (true)` for **all** roles and `anon` holds INSERT.
Confirmed on the production policy, and reproduced locally: an unauthenticated caller wrote a
row (HTTP 201) that Law 3 then makes **undeletable by every role including `service_role`**.
The anon key ships in the client bundle by design, so this is reachable by anyone.
*Fix:* restrict the INSERT policy to `authenticated` with a `WITH CHECK` that ties the row to
`auth.uid()`. Note the clean-up problem: forged rows already written cannot be removed, so fix
the policy before anyone exploits it.
*Regression test:* an `anon` INSERT must return 401/403 and write nothing.

**FIX-13 · Finish Law 6 column masking (BUG-015).** Masking is armed on 9 tables; 15 more carry
column revokes that are inert. Row masking is genuinely working (verified), so this is about
closing the column-level gap — and every `REVOKE … (column)` in this repo should be re-checked
with `has_column_privilege`.

**FIX-14 · Availability read path (BUG-018).** `readHolds` is an unbounded PostgREST select
silently truncated at 1000 rows, and holds are never released. Paginate, and add release.

**FIX-15 · Serial uniqueness (BUG-019).** Add-Equipment's "unique across the whole system"
check reads a hardcoded 34-serial seed map instead of the database. Make it query, and add a
unique constraint so the database is the authority.

---

**FIX-18 · Point the stock-transfer form at real warehouses (BUG-027).**
`Warehouses.tsx:740-741` defaults the transfer endpoints to `WAREHOUSES[0].name` /
`[1].name`, and the Source / Destination Facility dropdowns at `:2239` / `:2249` render the same seed list; `createStockTransfer:202-217`
resolves by name and refuses. 0 of the 4 names exist, so no transfer can be saved. The read
half already exists — `useWarehouses()` in `lib/queries/warehouses.ts`, added for
Add Equipment. Note the product question this raises: that screen's warehouse CARDS
(capacity, occupancy, rack map) are seed data with no columns behind them, so a dropdown of
real facilities will name places the cards above do not show.
*Regression test:* saving a transfer between the two real warehouses writes a
`stock_transfers` row; a seed facility name is refused before anything is written.


**FIX-19 · Point Add Bundle at the database (BUG-030, BUG-031).**
Both of that screen's entity pickers offer hand-written labels the database does not hold:
component lines come from `data/addBundle.ts`'s `INVENTORY_MODELS` (19 of 20 match no
`products` row — the real catalogue is Booqable-shaped, e.g. 'Sony FX3 Cinema Line Camera
(Body Only)'), and Primary Category offers 16 against the same six `inventory_categories`
rows. `createBundle` resolves both by name (`:252`, `:275`), so Create Bundle and Save Draft
both refuse. Reachable from two controls at `/inventory/bundles/new`.
The read halves already exist: `listInventory` for products, `listInventoryCategories` for
categories (added for BUG-029).
*Regression test:* a bundle built from picker choices saves; a seed model name is refused
before anything is written.

**FIX-20 · Rule whether the other eleven categories should exist (decision, not work).**
`product_category` has seventeen members; `inventory_categories` has six rows. The pickers now
read the table, which is right either way — but if the missing eleven are intended, they need
a migration, and every table-reading picker picks them up for free.


## 5 · FRONTEND

**FIX-16 · `syncEngine` column discipline (BUG-022).** `syncEngine.ts:162,182` pulls `products`
and `clients` with `select('*')` — the exact pattern the rest of the codebase avoids because
"`select('*')` is how a masked column leaks back in". Name the columns.

**FIX-17 · Duplicate fetch (BUG-021).** `/clients` fetches `invoices` three times with an
identical URL in the production build. Likely a query-key or dependency-array issue.

---

## 6 · UX / MISSING FEATURES

- **BS dates (highest user-visible gap).** The date engine covers one month and today is
  outside it, so BS dates are unavailable app-wide. Ship the 2080–2090 BS month-length table.
  This is a stated gap, not a defect — but for a Nepali rental business it is the most visible
  thing on this list.
- **No invoice route.** Finance cannot open an invoice. Needed before invoicing goes live.
- **Manager Override** stays absent until someone rules who may override and how the approver
  is recorded. The screen's refusal to fake it is correct — leave it.
- **`delivery_type` enum says "Customer Pickup"** (BUG-024). The UI translates it, but the
  banned word is in the data model. Rename with a migration when one is nearby.

---

## 7 · PERFORMANCE

No performance defect is confirmed beyond BUG-021. **Re-measure with a visible browser
window** before doing any performance work — this audit's timings were taken through a hidden,
timer-throttled pane, and one early "7-second freeze" turned out to be the measurement, not
the app.

---

## 8 · TECHNICAL DEBT / HYGIENE

- Delete the four zero-byte junk files in the repo root and add the pattern to `.gitignore`
  (BUG-025).
- `check:rebuild` should assert application-role readability (see FIX-9), otherwise it keeps
  passing on databases the app cannot use.
- 26 further findings across pricing, payments, invoicing, availability and inventory are held
  in the raw finding set and should be triaged into this plan once verified.

---

## 9 · WHAT TO DO ABOUT THE UNVERIFIED FINDINGS

Five audit dimensions (data integrity, forms/validation parity, reports reconciliation,
cross-module propagation, concurrency) and the adversarial verification pass had not returned
when this plan was written. Every finding marked *Reported* is single-source.

Two claims I checked personally did **not** survive: "a warehouse user can rewrite prices"
(refuted — RLS blocks the rows) and my own "the handover writes nothing to the database"
(refuted — it writes correctly; I had clicked the wrong button, because the label changes to
*Complete Handover* once all items resolve). Treat the *Reported* rows accordingly:
**reproduce before fixing.** The cost of verifying is an hour; the cost of "fixing" something
that was never broken is a regression in working code.
