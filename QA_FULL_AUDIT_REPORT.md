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

## UPDATE — 5 September 2026

Two things happened after this report was first written: the adversarial verification pass
finished, and the P0s were fixed. Both change what is above, so both are recorded here rather
than silently edited in.

### The verification pass finished: 57 findings stand, 11 refuted

Every row marked *Reported* above has now been through an independent refuter. **Eleven were
refuted**, including two filed as P0 — which is the point of running the pass, and the reason
the original report warned that single-source rows carry little weight.

The two that matter most, because they change what the defects actually are:

- **"No payment can be recorded against any app-created invoice" — refuted as unreachable.**
  Not because the mechanism is wrong (it is right: a Draft has no `invoice_no`, and
  `recordPayment` resolved only by number) but because **`createInvoice` has zero callers**.
  `CreateInvoiceModal` imports nothing from `actions/` and its submit handler refuses outright.
  So the defect is real but latent, and the invoice path is unwired end to end.
- **"The same physical unit can be double-booked" — refuted as unreachable.** The mechanical
  half is confirmed and I demonstrated it myself in SQL: the `EXCLUDE` guard sits on the empty
  `inventory_reservations`, and `booking_line_units` has none. But **no application path
  writes `booking_line_units`** — `createRental` sends no `units`, and `planCreationUnits` has
  zero importers. So the hole is real at the database and closed at the app, today.

### One row above was WRONG, and it was mine

The security table claimed *"Warehouse writing a price it cannot read — PASS"*. That was a bad
generalisation: I tested `invoices`, where RLS blocks the rows, and concluded prices were safe.
They were not. A Warehouse session both reads `products.daily_rate` and can rewrite it —
6500.00 → 1.00 over PostgREST, HTTP 200. The verification pass caught it; I reproduced it; it
is fixed in `0092`.

Law 6 turns out to govern **SELECT only**. RLS admits Warehouse to `products` and
`product_units` (correctly — they own serials, location and condition), and neither an RLS
`WITH CHECK` nor a column `REVOKE` can say "but not the price": every signed-in user is the
same Postgres role, `authenticated`. It needs a trigger comparing OLD to NEW, which is what
`0092` adds, reusing the existing `auth_can_view_money()` predicate rather than inventing one.

### Corrected twice on 6 September — and the second correction reversed the first

Worth reading as a sequence, because the lesson is sharper than either finding.

**First**, stating the grants appeared to show that my 0092 reproduction had run on an
over-granted local: under `0093`'s draft shape the same `PATCH /products {"daily_rate": 1}`
returned 403, so I recorded 0092 as defence in depth rather than a live hole.

**Then that draft turned out to be wrong.** Live does not revoke SELECT on those ten tables
outright — it revokes the **table** and grants back **every column except the money ones**.
So `authenticated` reads a booking and simply cannot see `deposit_required`; reads a product
and cannot see `daily_rate`. My draft had wiped those column grants, which would have broken
the application on contact: `src/` reads `bookings` directly in **13 places**, `booking_lines`
in 5, `products` in 3. `0093` was fixed to reproduce the per-column mask exactly, and now
asserts it in both directions.

**Re-tested under the corrected shape**, with 0092's trigger disabled and then enabled:

| trigger | request | result |
|---|---|---|
| disabled | `PATCH /products?id=eq.X {"daily_rate": 1}` as Warehouse | **204 — rate 6500.00 → 1.00** |
| enabled | same request | 400, rate unchanged, named Law 6 refusal |

**So BUG-015 stands as originally filed: a live hole, and 0092 is what closes it.** PostgREST
needs SELECT on `id` to target a row and live grants exactly that; UPDATE is not masked per
column at all, so a money-blind role may write every figure it may not read. That is why Law 6
needs a guard on the write verb rather than another revoke.

The withdrawal is left in the record rather than deleted. Both times I measured against a local
that did not match production — which is the actual finding, and why `0093` now encodes live's
shape rather than an approximation of it.

### BUG-006 is fixed — and the gate now proves it

`0093_state_the_grants.sql` encodes live's actual grant shape, derived read-only from the
production project: `authenticated` may SELECT every table **except** the ten Law 6 money
tables, may DELETE only ten sync/portal scratch tables (Law 3), may UPDATE everything **except**
the 21 immutables (Law 4); `anon`'s writes as live has them (RLS governs them, and every
PUBLIC write policy checks `auth_user_role()`), with `audit_events` INSERT re-revoked so `0091`
survives in either order. It revokes before it grants, so it converges from any starting
state — a no-op on live, the establishing step in a rebuild, and a correction on my
over-granted local (DELETE on `clients` went `t → f` on apply).

`check:rebuild` now asserts that shape after every rebuild with six probes chosen so that a
"grant all" fails them too. Result: **91 applied, 0 failed, grants verified.**

### What is fixed (commits `52c2190`, and this one)

| ID | Fix | Verified by |
|---|---|---|
| BUG-001 | `0089` — `greatest(padding, length(v))`, standalone so live can take it without `0085`'s renumber | minting: `900/901`, `INV-121`, `DEP-90`; padded formats unchanged |
| BUG-002 | `closeRental` exported + a Close control on Booking Detail (R-08 gated) | the action was already correct; it needed a caller |
| BUG-003 / BUG-007 | `createInvoice` reads `booking_crew_lines` and `booking_transport`; the kind map is exhaustive over the enum | new test: 83 500 owed vs 33 300 billed before — a 60% under-bill |
| BUG-004 | `0091` — `anon` loses INSERT on `audit_events`; policy narrowed to `authenticated`/`service_role` | anon POST 201 → **401**, nothing written; authenticated still 201 |
| BUG-008/009/011 | `0090` — R-06's handover gate warns with a named reason recorded in `audit_events`; **R-07's Close gate left hard** | refused without a reason, allowed with one, exactly one audit row, Close still blocked |
| BUG-012 | `recordPayment` accepts `invoiceId`, so a Draft can be settled | latent until the invoice path is wired — see below |
| *new* | `0092` — Law 6 for the write verb on `products` / `product_units` | Warehouse price write refused with a named Law 6 message; warehouse's own fields and Owner's pricing both still work |

### Still open, and why

- **The invoice path is unwired.** `createInvoice` is implemented and `invoice.create` is
  mapped to `canIssueInvoice` (R-05) — the two blockers the modal's comment named are both
  gone. What remains is a product question, now filed as **`PLAN.md` §4.46**: the modal
  collects hand-typed lines while the action derives them from the booking (per R-03). Wiring
  them as they stand would silently discard what the operator typed. Until that is ruled, the
  crew/transport fix and the Draft-payment fix cannot be exercised from a screen.
- **The Close gate's deposit test** reads `pending_amount` (uncollected) rather than unreturned
  deposit. R-07 says "the deposit resolved" without defining it, and SPEC-P0-2 names
  `pending_amount` only under a heading describing what is *already live*. Unruled, so
  unchanged.
- **BUG-005 / BUG-006** stand as written, with BUG-005 qualified as above.

---

## UPDATE {D} 6 September 2026: a P0 the audit missed entirely

**BUG-026 (P0, FIXED) {D} Add Equipment could not create serialised equipment.**

The audit walked this screen and passed it, because the form's own gate panel says
"All gates clear {D} Location set" before the save is attempted. It was wrong. The warehouse
picker was built from `data/warehouse.ts`'s four seed facilities and **none of them is a row in
`warehouses`**:

| offered by the picker | rows in `warehouses` |
|---|---|
| Kathmandu Main Hub (HQ) | 0 |
| Patan Studio Depository | 0 |
| Pokhara Regional Hub | 0 |
| Bhaktapur Heavy Grip & Rigging | 0 |

The table holds `Central Camera Vault` and `Lakeside Equipment Hub` (`0012_seed_data.sql:47`).
`product_units.warehouse_id` is NOT NULL, so `createEquipment` resolved the name and refused.
Every serialised save failed. Fixed: the picker reads the table, the option value is the uuid,
and `createEquipment` resolves by id. Verified by driving the form against real Postgres {D}
`EQ000290` / `EQ000290-01` now sits in `Central Camera Vault`.

**Why the audit missed it, which matters more than the bug.** The unit suite mocked a
`warehouses` row named `Kathmandu Main Hub (HQ)`, and `lib/mock/corpus.ts` invented the same
row with a `code` column the schema does not have. Both test surfaces agreed with the screen
and disagreed with the database. This is the same lesson as the inert column revokes:
**measure against the shape production actually has.** Both fixtures now carry 0012's real rows,
and a test asserts the four seed names are refused.

**BUG-027 (P1, NOT FIXED) {D} the identical defect in stock transfers.**
`Warehouses.tsx` builds its transfer form from the same four seed names (`:740-741` for the defaults;
the Source / Destination Facility dropdowns at `:2239` / `:2249`, whose option value is the name) and `createStockTransfer` resolves **by name** (`:202-217`). 0 of 4 resolve, so every
stock transfer save fails with "is not a warehouse the database knows". The action's comment at
`:213` already admits the screen's list is seed data. Not fixed here because that screen's
warehouse cards are seed as well, so pointing the dropdown at live rows is a visible product
change rather than a silent repair.

**BUG-028 (P4, NOT FIXED)** {D} `EquipmentShared.tsx:267`: `BsAbove` calls setState during
`Header`'s render; React logs the warning on every Add Equipment load.

**Correction to this report's scope.** "Inventory {D} Add Equipment" should not have been
recorded as covered. A form that reports every gate green and then throws on save is exactly
what the brief asked for {D} UI state agreeing with itself while disagreeing with the database
{D} and it was reachable in one click.

---

## UPDATE — 7 September 2026: the seed-label bug class, swept and verified

Yesterday's BUG-026 (Add Equipment's warehouse picker) turned out to be one instance of a
class. A three-angle sweep — from the seed constants forward, from the actions backward, and
from the UI controls forward — found five candidates; each went to an independent verifier
prompted to REFUTE it. **Three confirmed, one refuted, one cleared by the sweeper itself.**

The shape: a screen builds a picker from a hand-written constant in `src/data/`, passes the
chosen LABEL to an action, and the action resolves that label against a real table and refuses.
The UI reports itself healthy; the write always fails.

| # | Finding | Verdict |
|---|---|---|
| BUG-027 | Stock transfer form — seed facility names, and a free-text asset field whose placeholder matches no product | **CONFIRMED P1 — FIXED** |
| BUG-029 | Add Equipment Category — picker offers 17, `inventory_categories` holds 6 | **CONFIRMED P1 — FIXED** |
| BUG-030 | Add Bundle component lines — 19 of 20 seed model names match no `products` row | **CONFIRMED P1 — open** |
| BUG-031 | Add Bundle Primary Category — 10 of 16 offered categories are not rows | **CONFIRMED P1 — open** |
| — | New Rental crew roles vs the `crew_role` enum | **REFUTED — P3, do not file** |
| — | Purchase Requests resolving by `pr_no` | cleared by the sweeper; the screen no longer feeds it seed numbers |

**BUG-029 — Add Equipment's Category picker.** `inventory_categories` holds exactly six rows
(Camera, Lens, Lighting, Audio, Grip, Support) from `0012_seed_data.sql:115-123`, the only
insert into that table in any migration, 0001-0093. The picker offered the `product_category`
enum's seventeen. `products.category_id` is NOT NULL against the table, so **eleven of the
seventeen refused the save** after the form reported every gate clear. This sat in the screen
this report called fixed yesterday: that fix was real but it was one control, and I verified it
with 'Camera' — one of the six that work. The picker now reads the table.

**BUG-030 / BUG-031 — Add Bundle, not fixed.** Reachable from two clickable Inventory
controls at `/inventory/bundles/new`. The verifier's one correction: "always fails" is slightly
overstated, because 'Sony NP-FZ100 Battery' does resolve — a bundle reduced to that single
line could save.

**The refutation is worth as much as the confirmations.** The New Rental crew-role mismatch is
real as a vocabulary split but is NOT this bug: the roles are checked in-process against the
action's own list, the UI does not look healthy, and the write never runs. Filed at P3 with the
reasoning, so nobody re-derives it as a P1.

**Open question this raises, unruled:** the `product_category` enum has seventeen members and
the table has six rows. Reading the table is correct either way — if the other eleven are
meant to exist, a migration seeds them and every table-reading picker shows them with no code
change. But *whether* they should exist is a data decision, not an engineering one.

---

## UPDATE — 7 September 2026 (2): Add Bundle mapped, and it is a rebuild not a picker fix

BUG-031 (Primary Category) is **fixed** — same shape as the other pickers: it now reads
`inventory_categories`, and the payload carries `categoryId` while `category` keeps the NAME.
Keeping the name mattered: `applyDuplicate()` feeds `setCategory()` a name validated against the
seed list, so putting a uuid in `category` would have broken Duplicate Existing.

`createBundle` now takes `categoryId` and a per-line `productId`, resolving uuid-first with the
name path as fallback, and **refuses a line that identifies no product at all** — `validate` used
to let that through to the lookup even though `bundle_items.product_id` is NOT NULL.

### BUG-030 stays open, deliberately, and here is its real size

Swapping the seed model id for a product uuid in `DraftLine.modelId` looks like a two-line change
and is not. `modelId` is a **join key for five derivations** — `availabilityOf`, `breakdownOf`,
`rateDriftOf`, `parentsHolding` and `LineRow`'s own lookup — each doing `MODEL_BY_ID.get(...)` and
failing **silently** on a miss. Put a uuid in there without changing all five and: every table row
disappears (`LineRow` returns null), the donut reads 0/0, `breakdown.equipment` becomes 0, and
`blockingReason` flips to "A bundle needs at least one equipment line". The screen would look
empty and Create Bundle would go Unavailable — a worse failure than the one being fixed.

There is also a **third** seed-fed control feeding the same `lines` array: the "+ Add a case or
bag" select (`AddBundle.tsx:1674-1688`), whose option value is a seed model id. Fix the tree and
miss this one and the screen still cannot save.

And the screen **boots already populated** — name 'Sony FX3 Documentary Kit', category 'Camera',
ten seeded lines — so the very first Create Bundle press reaches the action and refuses on line 1,
after every gate has reported green.

So BUG-030 is: replace the catalogue behind the tree, the box picker, the two filter lists and the
five derivations, and decide what the screen does about `children` and availability, neither of
which has a column. That is a scoped piece of work, not a picker swap, and it is filed as such
rather than half-landed.

### Three further findings, from mapping the action

**BUG-032 (P2) — every discount on a bundle line is validated and then discarded.**
`discountPct`, `discountReason` and `approvedBy` are accepted per line, `discountPct` goes through
`validateDiscount` (including the negative-percent hole closed 31 Aug) — and then none of the three
is written: `bundle_items` has no column for them. The screen runs a full approval ceremony for an
over-10% discount and the approval reaches no row.

**BUG-033 (P2) — a saved draft is an inactive bundle.** `isDraft` is not a status column; it
becomes `is_active: !isDraft`. Any list filtered on `is_active` will not show drafts, so Save Draft
writes a bundle the Bundles screen cannot show.

**BUG-034 (P1) — bundle numbering bricks after nine, on live, today.** The `bundle` sequence has
`padding = 1` (confirmed by direct read of production: prefix `BND-`, `current_value` 0), and
`next_document_number` formats with `lpad(v::text, padding, '0')`, which TRUNCATES when the value
is longer than the padding. So BND-1 through BND-9 mint, and the tenth mints `BND-1` again and
collides. Same root cause as the booking-number defect; `0089` fixes the function, and `0089` is
not applied to live.

---

## UPDATE — 7 September 2026 (3): BUG-030 fixed, and the silent skip with it

Add Bundle builds from `products` now. The tree, the "+ Add a case or bag" select and both
filter lists (category, brand) read the catalogue; `DraftLine.modelId` carries a real
`products.id`; the payload sends `productId`.

**The part that mattered was not the picker.** `modelId` is the join key for `availabilityOf`,
`breakdownOf`, `rateDriftOf` and `LineRow`, each doing `MODEL_BY_ID.get(...)` and **skipping
silently** on a miss. A uuid in `modelId` while those still read the seed map would have emptied
the screen with no error — every row gone, a 0/0 donut, Create Bundle Unavailable. So the three
derivations now take an **injected lookup** (defaulting to the seed map, and they are called from
this screen only), and `LineRow` takes it as a prop.

**A silent failure removed on the way.** `LineRow` did `if (!m) return null`: a line the
catalogue could not resolve **vanished from the table while the totals below still counted it**.
It now renders an explicit row naming the missing item, with a Remove action.

**Honesty in the mapping.** Serialised products get their real per-unit split from `unitsByState`;
quantity-tracked ones report the whole quantity free, because this build commits no units — that
is genuinely zero, not unknown shown as zero. `children` has no column anywhere, so a live model
carries none and the child affordances have nothing to show. The form no longer boots
pre-populated: `INITIAL_LINES`' ten lines carried seed ids, which is why the first Create press
always failed on line 1.

**Verified by driving it:** the tree reads "56 shown of 56 products" with real asset codes, a line
added from it resolves, and Create Bundle **saved** — navigating to a real bundle record. That
path had never worked.

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
| Warehouse *writing* a price it cannot read | **FAIL — this row was WRONG in the first issue of this report.** I tested `invoices`, where RLS blocks the rows, and generalised from it. On `products` a Warehouse session both READS `daily_rate` and rewrote it 6500.00 → 1.00 over PostgREST (HTTP 200). Confirmed by the verification pass, fixed in `0092`. |
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
