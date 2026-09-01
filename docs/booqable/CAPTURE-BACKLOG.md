# VERIFICATION BACKLOG — what still needs checking in `REFERENCE_SPEC_v2.5.md`

> ⚠ **This file was rewritten on 31 Aug.** It began as a *capture* backlog, on the premise that
> ~49 Booqable screens were unspecced and needed live sessions. **That premise is dead.**
> `REFERENCE_SPEC_v2.5.md` (1,531 lines, 118 KB) landed in this directory at 01:57 and covers
> **13 screens plus a 17-page Settings compendium** — the whole product. The capture is done.
>
> What is **not** done is verifying v2.5's **repo-side** claims. That is what this file now tracks.

**How to use this file.** Every item is a checkbox. **Tick it in the same commit as the work.**
A generated worklist with nowhere to record completion has already cost this project a session of
re-reading files.

---

## Why this backlog exists at all

`CORRECTIONS.md` checked the **v1.1** spec against this repo and found that its Booqable-side
observations held up while **its repo-side assertions mostly did not** — §2.4 is labelled
*"measured, do not re-derive"* and most of its checkable claims fail.

**v2.5 inherits that section unchanged.** Its §2.4 is the same contract list, its R6 still cites
"Law 9" for dates (it is Law 7), and its Appendix A.5 still lists as open two things this repo has
already settled in code. So the corrections still apply, and every screen v2.5 adds is a screen
whose **Layer D** (backend data link) was written from that same unreliable contract list.

**The rule that follows:** trust v2.5's Layers A, B and C — they were observed live. **Verify every
Layer D line against the repo or the live database before building from it.**

---

## 1. Blocking — do these before any build session

- [x] **D3 vs Law 10 — RESOLVED AND APPLIED 31 Aug. This entry is kept only so its earlier,
      now-false warnings are not re-read as current.**

      **What actually happened.** Babin's final word on 31 Aug was *"don't put any gate on
      discount."* The policies alternative (`0073`) was **deleted unapplied**; `0074_drop_discount_gate.sql`
      replaced it and **was applied to the live project** with explicit approval, followed by
      `0075_drop_invoice_lines_discount_gate.sql` — written the same session because 0074 had not
      named `invoice_lines`, which carried its own copy of both rules.

      **Live state, verified from `pg_constraint`:** all three discount-writing tables now carry the
      identical rule — `booking_discounts_percent_sane`, `invoices_discount_percent_sane`,
      `invoice_lines_discount_percent_sane`, each `discount_percent >= 0 and <= 100`.
      **Zero `over_ten_needs_reason` checks remain anywhere in the database.**
      `trg_booking_discounts_stacking` survived, so the exclusive-source matrix (Student / College /
      Named-client rates) still refuses to stack. `schema_migrations` tops out at
      `0075_drop_invoice_lines_discount_gate`.

      **Three ≤25 caps deliberately survive**, none being a per-discount ceremony:
      `coupons.discount_percent`, `membership_plans.*_discount_pct`,
      `user_approval_authorities.max_discount_pct`. The first two cap a product configured once; the
      third defines a role authority `rbac.ts:canApproveDiscount` now ignores.

      **~~Do not build any discount UI against the current schema~~ — that warning is void.** The
      schema now matches the app. `PLAN.md` Law 10 carries the amended text; gates re-run green after
      the change (`tsc` 0 · `vitest` 91 files / 2,209 tests · `vite build` exit 0).

      ⚠ **What this entry got wrong, recorded so the method improves:** it said the collision spanned
      *five* tables. It spans **six** — `user_approval_authorities` was folded into a shared row and
      is also not named `user_approval`. A migration written against the short name would have failed.

- [ ] **D1 — purchase-cost + deposit backfill.** The only blocker A0 leaves open. Needs the sizing
      query first (I3 below).
- [ ] **Confirm v2.5 is the current version.** It supersedes v1.1 and v1.2. If a v2.6+ exists, this
      whole pack defers to it.

## 2. Verify v2.5's Layer D, per screen

Each screen's Layer D names tables, views, engines and actions. Those came from the §2.4 list that
`CORRECTIONS.md` shows is wrong in at least six places. Check each screen's Layer D against source
and the live DB, and record GAPs.

**All 14 were worked on 31 Aug.** 329 Layer D claims checked; the tally and the cross-cutting
findings are in §7. Each line below carries its own verdict split.

- [x] §4 Dashboard — done 31 Aug, 42 claims: 16 CONFIRMED / 6 WRONG-NAME / 12 GAP / 8 MISLEADING,
      see [`layer-d/dashboard.md`](layer-d/dashboard.md). Covers §5 (order sidebar) too. **I6
      confirmed by SQL** — `stage IN ('Booked','Packed')` matched zero of 200 live bookings, so the
      Going out panel was structurally empty on every date. **Resolved 31 Aug by the applied
      `0076_seed_operational_stage_corpus`** — 30 Booked + 16 Packed + 92 lines, dated from
      `current_date` at apply time; Going out now reads 6 today, 26 over the next 7 days, and the
      corpus runs to 24 Sep. Verified through the RLS path as Coordinator, not just as admin. Supersedes the older
      [`dashboard.md`](dashboard.md) on five points (frozen clock, the day-boundary TODO, the
      two-column body, `AlertsPanel`, `docs/pages/06_today.md`).
- [x] §9 Bookings list (`/orders` → `/rentals`) — done 31 Aug, 38 claims: 15 CONFIRMED / 3 WRONG-NAME
      / 14 GAP / 6 MISLEADING, see [`layer-d/bookings-list.md`](layer-d/bookings-list.md). Confirms
      `CORRECTIONS.md` §7–§8 against v2.5 §9.7: rows **already** carry money (`depositRequired` via
      `bookings_deposit_v`), and `lib/kpiEngine` — the engine v2.5 names for the metric strip — has
      **zero importers anywhere in the repo**.
- [x] §10 Booking detail (`/orders/{uuid}` → `/rentals/:bookingNo`) — done 31 Aug, 27 claims:
      8 CONFIRMED / 3 WRONG-NAME / 8 GAP / 8 MISLEADING, see
      [`layer-d/booking-detail.md`](layer-d/booking-detail.md). §10.6's entire Layer D describes
      `fetchCanonicalBooking`, which has **zero callers in `src/` outside its own test** — the route
      reads through four different functions. A second `facetCounts.ts`.
- [x] §11 Calendar — done 31 Aug, 19 claims: 7 CONFIRMED / 2 WRONG-NAME / 5 GAP / 4 MISLEADING /
      1 UNVERIFIABLE, see [`layer-d/calendar.md`](layer-d/calendar.md). `/calendar` imports **no**
      supabase client, query module or action — it is seed-only, so every §11.5 line specifies
      something unbuilt. The one column-level fact v2.5 states (`starts_at`→`ends_at`) names two
      columns that exist on no table. Still no test coverage.
- [x] §12 Inventory, Downtime, Product detail — done 31 Aug, 22 claims: 5 CONFIRMED / 4 WRONG-NAME /
      8 GAP / 4 MISLEADING / 1 UNVERIFIABLE, see [`layer-d/inventory.md`](layer-d/inventory.md).
      **Answers I3 and rescopes D1** (below). §12.5 repeats the `inventory_units` phantom verbatim.
- [x] §13 Product Settings tab, Variations, Customers — done 31 Aug, 16 claims: 4 CONFIRMED /
      1 WRONG-NAME / 3 GAP / 8 MISLEADING, see
      [`layer-d/product-settings-clients.md`](layer-d/product-settings-clients.md). Only three of
      §13.6's eight lines survive: the detail fetch is keyed on `client_code`, **not `id`** (a literal
      implementation returns zero rows), and the "GAP" tax profile is a fully-modelled unused table
      (`client_tax_profiles`). Law 17 is breached at all six cited sites — **none on `/clients`**.
- [x] §14 Customer Accounts tab, Documents register, Reports index — done 31 Aug, 21 claims:
      5 CONFIRMED / 3 WRONG-NAME / 7 GAP / 5 MISLEADING / 1 UNVERIFIABLE, see
      [`layer-d/accounts-documents-reports.md`](layer-d/accounts-documents-reports.md). v2.5 points
      the whole §14 backend link at the wrong screen: the register it describes is built and DB-backed
      at **Finance ▸ Invoices** (`listInvoices`), while `/documents` has **zero** database reads.
      §14.5 repeats the `booking_facets()` fabrication verbatim.
- [x] §15 Report pages — Company performance & Availability — done 31 Aug, 20 claims: 1 CONFIRMED /
      5 WRONG-NAME / 9 GAP / 5 MISLEADING. `layer-d/report-pages.md` was recovered from the run log
      and written 31 Aug 13:30 — the harness had blocked the subagent's own write, so the findings
      briefly existed only as transcript text. Headline: §15.3 rests on `lib/kpiEngine`,
      which has zero importers and is typed against the `RentalRow` seed; all ten `/reports/*` screens
      are seed-only; and the one thing §15 says we lack — a page-level comparison selector — is
      already built at `ReportToolbar.tsx:615`.
- [x] §16 Coupons and Activity logs — done 31 Aug, 16 claims: 3 CONFIRMED / 2 WRONG-NAME / 6 GAP /
      5 MISLEADING, see [`layer-d/coupons-activity.md`](layer-d/coupons-activity.md). §16.3's only
      fully correct line is "`audit_events` already triggered on 6 tables". The stacked 25% cap is a
      **DB trigger**, not `lib/discount`; the actor filter cannot be a `users` join because `users`
      RLS is self-scoped. **Repeats none of the six known-bad facts** — the only clean section.
- [x] §17 Quotes & Contracts registers, Product fulfillment, Background tasks — done 31 Aug,
      21 claims: 8 CONFIRMED / 7 GAP / 4 MISLEADING / 2 UNVERIFIABLE, see
      [`layer-d/quotes-contracts.md`](layer-d/quotes-contracts.md). **Answers I4** (below). Found a
      **new defect of the `next_document_number` class**: seven live call sites in
      `src/lib/booqable/sync.ts` pass sequence keys (`'EQ'`, `'CL'`, `'BK'`, `'PAY'`, `'DEP'`) that do
      not exist in `number_sequences` and raise at runtime — the parameter is typed `string`, so they
      typecheck.
- [x] §18 Bundles, Cross-sell, Online store, Packing slip, Quote — done 31 Aug, 23 claims:
      9 CONFIRMED / 2 WRONG-NAME / 5 GAP / 6 MISLEADING / 1 UNVERIFIABLE, see
      [`layer-d/bundles-store.md`](layer-d/bundles-store.md). §18.1 invents
      **`bundle_items.component_price`** — `bundle_items` has 10 columns and **not one** carries a
      rate, discount or price. Treat it the way `CORRECTIONS.md` treats §2.4: an invented Layer D name
      that must not reach a migration. `src/lib/queries/bundles.ts` is a third fully-built,
      fully-unwired query module.
- [x] §19 Collections, Settings ▸ Emails, Contract document — done 31 Aug, 19 claims: 2 CONFIRMED /
      1 WRONG-NAME / 7 GAP / 8 MISLEADING / 1 UNVERIFIABLE, see
      [`layer-d/collections-emails.md`](layer-d/collections-emails.md). Migration
      `0008_automation_comms` **is applied** — all eleven comms tables exist live with 0 rows and
      **zero readers in `src/`**. Comms is a wiring job, not a migration job. `/settings` persists to
      per-browser `localStorage`, not `system_settings`.
- [x] §20 Pro forma, Rental period settings, Custom fields, Security — done 31 Aug, 21 claims:
      5 CONFIRMED / 1 WRONG-NAME / 9 GAP / 6 MISLEADING, see
      [`layer-d/proforma-security.md`](layer-d/proforma-security.md). **D4's 06:00→06:00 operational
      day is genuinely built end to end** — but it persists to browser `localStorage`, so every
      "today" panel is per-browser. Repeats **none** of the six known-bad facts, and corroborates the
      Law 7 correction from `Organisation.tsx:71`.
- [x] §21 The Settings compendium — all 17 remaining pages — done 31 Aug, 24 claims: 5 CONFIRMED /
      1 WRONG-NAME / 10 GAP / 8 MISLEADING, see
      [`layer-d/settings-compendium.md`](layer-d/settings-compendium.md). Every §21 claim of the form
      "our Settings already models this" is **false at the persistence layer**: no table, query or
      action reaches `/settings`, and the live `system_settings` has 0 rows and zero readers. Repeats
      **none** of the six known-bad facts; its single law citation (Law 17) is correct.

## 3. Corrections v2.5 still needs

These were found against v1.1 and **still apply** — v2.5 carries the same §2.4 and the same law
citations. Full detail in [`CORRECTIONS.md`](CORRECTIONS.md).

**A tick here means the correction is now re-evidenced from source or the live DB by the 31 Aug pass
— it does *not* mean v2.5 has been edited.** Nothing in `REFERENCE_SPEC_v2.5.md` has changed; every
line below still needs the doc edit. Ticked items are settled beyond re-litigation.

- [x] **Law numbers.** R6 cites "Law 9" for dates; it is **Law 7**. A.5 cites "Law 15" for the
      768px two-column question; it is **Law 14**. 44×44 is Law 15, not 16.
      *Re-evidenced 31 Aug at four spec sites and against our own code, which already cites them
      correctly:* §4.2 line 122 (Law 15→14), §4.4 lines 203/205 and §10.4 line 495 (Law 16→15),
      §11.5 (Law 9→7) and §11.4 (Law 16→15). Ours agree: `MovementList.tsx:298` and
      `Calendar.tsx:105` both say Law 15 for 44×44, `Organisation.tsx:71` says Law 7 for dates,
      `PLAN.md:113`/`:827` bind Law 9 to `days >= 1` and the six priced-line tables.
- [x] **§2.4's engine list** names 19 modules; `src/lib` has **37** plus four subdirectories. The 18
      omitted include `availability`, `bookingRules`, `bookingTransition`, `damage`, `lateFee`.
      *Re-evidenced 31 Aug, and the cost is now visible:* §15.3 built its whole company/compare block
      on `lib/kpiEngine` **because the list names it as an engine**. It has zero importers. Four
      sections inherited this failure mode.
- [ ] **`BrandKey`** — spec invents `purple` (retired), drops `warn` (real).
      *Left unticked deliberately:* no section re-derived the union from source this pass — §19 only
      restated it as a carried fact (`neutral|primary|progress|warn|success|danger`). **Re-check it
      against the token source before editing v2.5.**
- [x] **`Card`** — the spec describes `Page.tsx`'s Card; the barrel exports `Card.tsx`, which **does**
      have `subtitle`. *Re-evidenced 31 Aug at `Card.tsx:19`, plus `footer` and `padding`.*
- [x] **`next_document_number`** takes `p_sequence_key`, not `kind`. supabase-js RPC args are named,
      so the spec's version fails at **runtime**.
      *Re-evidenced 31 Aug from three directions:* §10.6 line 541 is the only place in v2.5 carrying
      the wrong name, and every call site in this repo already uses `p_sequence_key`
      (`createBundle.ts:295-297` is correct). **The failure class is wider than the argument name** —
      see §17: `sync.ts` passes seven non-existent sequence keys and
      `actions/documents/createDocument.ts:21` mints from the clock instead of calling the RPC at all.
      Note v2.5:1137 writes the arg *positionally*, which is compatible with the real signature and so
      is not itself a repeat — but it is a trap for anyone translating it to supabase-js.
- [x] **`ClickableRow`** (L6's natural home) does not exist, and neither does the "11 Aug improvement
      order" that supposedly names it. `Table.tsx`'s `onRowClick` is not a substitute — no
      `tabIndex`, no `role`, no Enter/Space, no 44px floor, not exported from the barrel, and
      Tailwind-classed so it compiles to nothing here.
      *Re-evidenced 31 Aug:* zero hits in `src/`. §4.4 line 204 instructs builders to build the
      preview card on it, and §9.5 inherits the phantom by cross-reference. `/rentals` does not use
      `Table.tsx` either, so neither the phantom nor its inaccessible `onRowClick` is a model there.
      The row a11y work belongs in `MovementList.tsx`, which hand-rolls its rows.

## 4. A.5 items this repo has already answered

v2.5's "Open, smaller" list carries two items the code settled. **Close them rather than deciding
them.**

- [x] **"true faceting vs base-scope counts"** — already faceted, and by the better rule.
      `src/lib/queries/facetCounts.ts` counts each option **with its own group's selection removed**,
      so a group can be widened, not only narrowed. **But it is completely unwired:** `countFacet` is
      imported only by its own test, `useFacetCounts` has no caller in `src/`, and the count-rendering
      `FilterOptionList` is mounted only in its own test. **No screen shows an option count today.**
      A.3's `booking_facets(filters)` RPC is a reasonable later step — confirmed absent from all 72
      migrations and from the live DB — but **wiring the existing engine is the smaller, better first
      move.**

      **Fully evidenced 31 Aug — closed as a question, open as a wiring task.** Five independent
      sections re-derived it and it held every time:
      - **Engine side.** Built and tested. Three call graphs, all dead ends: `countFacet` → its own
        test only; `useFacetCounts` → nothing in `src/`; `FilterOptionList` → its own test only.
      - **DB side (new this pass).** Nothing named `*facet*` exists in the live database — absent from
        `pg_proc`, no facet view, no facet table. So `booking_facets()` is a fabrication on **both**
        sides, and v2.5 repeats it verbatim at §14.5 and by cross-reference at §9.2.
      - **Screen side.** `/rentals` uses a hand-rolled `StatusFilterGroup` with bare, count-less
        checkboxes and ten permanently disabled groups (§9). `/clients` counts in the **browser**, via
        `clientMetrics()` over a **500-row fetch** — so the chip counts and the Total Clients KPI go
        silently wrong at 501 clients (366 today, +10 in 11 days) (§13). Categories on `/collections`
        have no counts at all (§19). No report has a status facet (§15).
      - **The inversion to stop repeating.** v2.5 §9.7 calls the engine *unbuilt*. It is built,
        tested, and merely **unwired** — the opposite error, and the more expensive one, because it
        commissions a rewrite of working code.
      - **Smallest honest first move:** replace `StatusFilterGroup` (`RentalsList.tsx:532-599`) with
        the barrel's `FilterOptionList` fed by `useFacetCounts` over the stage group. One group, six
        options, one screen.
- [x] **"money on list rows"** — partly already there. `BookingListRow.depositRequired` comes from
      the **masked view `bookings_deposit_v`**, opt-in via `listBookings({ withDeposit: true })`, and
      renders only behind `useCanViewMoney()`. What is genuinely absent is the **rental total**, and
      it is absent for a hard reason: `fetchCanonicalBooking` cannot compute one either —
      `CanonicalEngineInput` types `crew`, `transport`, `vatPercent` and `payments` as literally
      `null`. So the question is not "should rows carry money" but "should they carry the rental
      total", and answering yes commissions an engine, not a column.

      **Confirmed 31 Aug (§9).** Four gating layers were traced end to end: `useCanViewMoney()` →
      query omission → DOM omission → the masked definer-rights view. There is **no** Price column and
      **no** payment-status column; `depositRequired` is the single money figure on a row. So §9.8
      open decision 1 is **already decided for deposits** and should be re-scoped to the rental total
      alone. Two caveats for whoever builds it: under `VITE_DATA_SOURCE=mock` every Deposit cell
      renders `—` even for an Owner (`bookings_deposit_v` is in neither `VIEW_OF` nor `UNSERVED` in
      `src/lib/mock/corpus.ts`); and the claim at `bookings.ts:376-379` that the base-table read
      "42501s for every role" is **wrong** — `anon` still holds `SELECT` on
      `bookings.deposit_required`, and RLS, not the revoke, is what blocks it.

## 5. Investigations — A.4, plus what this repo adds

- [ ] **I1** Zero-quantity calendar bars (`0x` on #898) — display convention or real rows?
- [ ] **I2** The two revenue totals' Rs.18,450 gap — confirm the cancelled-bookings hypothesis.
- [x] **I3** Purchase-cost coverage across all 178 products — sizes D1.
      **Answered 31 Aug (§12), and it is worse than the sample suggested.** `purchase_price`,
      `replacement_value`, `purchase_date`, `deposit_percent` and `deposit_fixed` are NULL on **all
      204 products** — not 178, and **0% coverage**, so **D1 is a full backfill, not a top-up**.
      Add a deferred second pass for the unit layer: `product_units` holds **0 rows** now but held 192
      before a reseed, so a products-only backfill will not finish the job. Do not build any
      depreciation, ROI or asset-value report before D1 lands — there is no engine, and every figure
      would correctly be zero.
- [x] **I4** Contracts' Confirmed/Signed usage — if unused, the OS contract flow starts from zero.
      **Answered 31 Aug (§17): it starts from zero.** No `confirmed_at` column exists anywhere on
      `document_registry`, the table holds 0 rows, and there is no write path — `/documents` reads a
      constant array and `actions/documents/createDocument.ts` is a `console.log` stub with no
      importer. Nothing to migrate or preserve; **design freely.** One decision falls out of it: rule
      what "Confirmed" *means* before building it (add `confirmed_at`, derive from
      `lifecycle_status='Issued'`, or derive from `bookings.stage`) — choosing silently in a component
      would invent a product decision.
- [x] **I5 (added)** **RLS policy correctness per money-blind role.** **DONE 31 Aug —
      [`I5-RLS-MONEY-VERIFICATION.md`](I5-RLS-MONEY-VERIFICATION.md).** Ran as Warehouse and as
      Client against the live DB (read-only, `set local role authenticated` +
      `app.current_user_id`, rolled back). 156 money columns probed.
      **Result: no money leaks today, but four latent Law 6 breaches found.**
      - ✅ **Masking provably works** — same view, same rows: Coordinator gets 204 values from
        `products_v.daily_rate`, Warehouse gets 204 `NULL`s. Not a null-for-everyone column;
        the raw values are there. Client sees **zero rows** (excluded by `auth_is_staff()`).
      - ✅ `bookings`, `products`, `product_units` — base-table `SELECT` **revoked** for
        `authenticated`. This is what makes their `_v` masks real.
      - ❌ **35 of 38 money base tables still grant `SELECT` to `authenticated`**, so their `_v`
        mask is bypassable. On **four**, the row policy also admits a money-blind role to **raw**
        money: `accessories.replacement_cost` (Warehouse) · `booking_transport.delivery_charge`
        + `fuel_charge` (Warehouse, **Driver**) · `maintenance_records.cost` (Warehouse) ·
        `vehicle_fuel_logs.cost_amount` (Warehouse, **Driver**). All four predicates evaluate
        `true` as Warehouse. **They leak on the first row written** — all four are empty today,
        which is the only thing preventing it. Fix is one `REVOKE SELECT (col)` per table, the
        mechanism `0062` already established; **no migration written by that pass.**
      - ⚠ **Still open, narrowed:** the money core — `invoices`, `payments`, `security_deposits`,
        `expenses`, `invoice_lines`, `booking_lines` — is **empty**, so its policies have never
        been exercised against a row and its grant is open. An empty table and a correct policy
        both return zero rows. **Do this together with I6**, then re-run the harness unchanged.
      - 📌 **New finding:** `Technician` appears **0 times in all 232 policies** (Warehouse 52,
        Coordinator 39, Driver 4) and in no view — its only mention in the entire schema is
        inside `auth_can_view_money()`. Safe for Law 6 by accident; it also means the Technician
        role is **non-functional at the data layer** and cannot read the maintenance and damage
        records it exists to work on. Raise against the capability matrix (`PLAN.md` §4.20) —
        do **not** fix by widening a policy in passing.
- [ ] **I6 (added)** **Seed `Booked` and `Packed` bookings.** Live stages are Returned 130 · Closed 60
      · Quote 7 · On Rent 3 — **zero in either stage `todaysOutgoing` filters on**. The Dashboard's
      Going out panel is structurally empty on every date and cannot be demoed or evaluated.
      *Finding re-confirmed by SQL 31 Aug (§4).* Two additions: the **Incoming** panel is near-empty
      for a second reason (only 3 `On Rent` rows, and `actual_return_at` is NULL on all 200 bookings,
      so "Returned same-day" is uncomputable); and `booking_lines` holds **0 rows**, so the Items
      column reads "0 items" on every row.

      **31 Aug — root cause found; the item as written would not have fixed it. Migration written
      and proven; NOT applied.**

      1. **`src/lib/seed.ts` already generates exactly what this item asks for** —
         `STAGE_PLAN` has `{Booked, 30, 1..24}` and `{Packed, 16, 0..2}`, the latter commented as
         what "gives Today's outgoing queue and the packing floor something to show". Seeding was
         never the missing idea.
      2. **Its anchor is frozen one month in the past.** `ANCHOR = kathmandu(2026, 6, 31, 6, 0)` —
         31 Jul 2026. Its doc comment justified the freeze by citing *"`bs.ts`'s `TODAY`,
         31 Jul 2026"* — **a constant that no longer exists.** `bs.ts:255` records that
         `export const TODAY = new Date(Date.UTC(2026, 6, 31))` was replaced by
         `getBusinessToday()` (the real clock) precisely because a frozen day made every overdue
         chip "measure distance from a day in the past". **The app was un-frozen; the seed was
         not.** Regenerating `0047` today would still emit Packed pickups dated 31 Jul – 2 Aug and
         leave the panel empty. Comment corrected in place, with a `TODO(decision)` for PLAN.md §4
         — fixed anchor keeps `0047` byte-reproducible and the tests stable; clock-relative keeps
         the Today screens meaningful. **Not decided here.**
      3. **The live corpus is not the seed corpus at all.** 200 bookings with **0** rows in
         `external_refs` and **0** in `booking_stage_transitions` — bulk-inserted directly,
         bypassing both the bridge and the transition machinery. Its stage spread mirrors the
         Booqable account, and Booqable **cannot** produce these two stages: `reserved → Booked`
         exists but that account holds only 2 Reserved, and **`Packed` has no Booqable equivalent**
         ("OS-only, never pushed" — `booqable/map/orders.ts:168`). **This is R3 in effect, not an
         oversight.**

      **Delivered:** [`supabase/migrations/0074_seed_operational_stage_corpus.sql`](../../supabase/migrations/0074_seed_operational_stage_corpus.sql)
      — 30 Booked + 16 Packed + 92 lines, every timestamp derived from `current_date` **at apply
      time** so it cannot go stale the way the frozen anchor did. Line rates come from each
      product's own `daily_rate`, so no figure is hand-typed.
      **Proven, not asserted:** the whole body was executed against the live DB inside
      `begin; … rollback;` — it ran clean through `validate_booking_gates`, the audit trigger and
      all ten `booking_lines` CHECKs, and `todaysOutgoing`'s exact predicate then returned
      **Today 6 · Tomorrow 9 · Next 7 days 26** (from 0/0/0), across 46 distinct clients.
      Post-rollback the DB was re-checked: 200 bookings, 0 seed rows, `B-899` still the high-water
      mark. **Nothing was persisted.**

- [x] **I6a — APPLIED 31 Aug**, on Babin's explicit instruction, as
      **`0076_seed_operational_stage_corpus`** (registered `20260831141204`).

      **Renumbered 0074 → 0076 before applying.** A concurrent session had written a *different*
      `0074_drop_discount_gate` and applied it at 12:42, plus `0075_drop_invoice_lines_discount_gate`
      at 13:19 — so two files carried each of 0074 and 0075 on disk. Only
      `supabase_migrations.schema_migrations` revealed it; the filenames did not.
      ⚠ **OUTCOME, recorded 31 Aug ~21:35 — one collision resolved, one landed.**
      - `0075_law6_arm_the_four_unarmed_tables.sql` (the I5 follow-up) **renumbered itself to
        `0077_`** and no longer collides. ✅
      - `0076_booking_line_units_release.sql` **was applied anyway**, at `20260831213343`.
        **`schema_migrations` therefore now holds TWO applied migrations both numbered 0076** —
        `0076_seed_operational_stage_corpus` (14:12) and `0076_booking_line_units_release`
        (21:33). Postgres does not mind, because the primary key is the *version* timestamp and
        those differ. **Humans will.** "Apply 0076" and "revert 0076" are now ambiguous
        instructions, and the two touch unrelated things (a seed corpus; a units-release column
        pair plus a freeze trigger). **Always disambiguate by full name or version, never by the
        four-digit prefix**, and treat the prefix as a label rather than an identity.

      This is now the fourth numbering collision in a single day across two sessions. The
      standing rule below is the response.

      **This has happened three times in one day**, which makes it a standing hazard rather than
      an accident: two sessions are writing migrations into the same directory, and a filename
      cannot see what its neighbour did. **Read
      `select version, name from supabase_migrations.schema_migrations order by version desc` and
      take the next number from THAT, immediately before applying — never from `ls`.** Applied
      state is the only authority; filenames and `NOT APPLIED` headers both lie.

      **Result, measured immediately after applying:** bookings 200 → **246** · `booking_lines`
      0 → **92** · Packed **16** · Booked **30** · **Today ▸ Going out 0 → 6**, Tomorrow 9,
      Next 7 days 26. Seeded rows are `B-900 … B-945`, one per client, 2 lines / 3 items each,
      values from each product's own `daily_rate`.

      **Two things this does not do.** It does not fix **Coming back** — `actual_return_at` is
      still NULL on all pre-existing bookings and only 3 `On Rent` rows exist; seeding those means
      moving bookings *through* the handover gate, which needs deposits and invoices.
      And it is **not self-refreshing**: dates were resolved from `current_date` on 31 Aug, so this
      corpus ages exactly as `seed.ts`'s frozen anchor did, just from a later start. When Going out
      empties again the fix is a fresh migration of the same shape — **not** an edit to 0076, whose
      rows cannot be deleted (Law 3). The retreat is cancellation, keyed on
      `project = 'Seed corpus — operational stages (0076)'`.
- [ ] **I7 (added)** **Run one Booqable order through the bridge and hand-diff every money field and
      the stage.** `external_refs` holds only 100 clients + 71 products — **no order has ever
      crossed**, so R2, R3 and R4 are entirely unexercised.
      *Now blocked by a code defect, found 31 Aug (§17): fix `src/lib/booqable/sync.ts` first.* Seven
      live call sites pass sequence keys that do not exist in `number_sequences` — `'EQ'` (:462),
      `'CL'` (:799), `'BK'` (:926), `'PAY'` (:1212, :1236), `'DEP'` (:1240, :1247) — and every one
      raises at runtime. `external_refs` now holds 171 rows with `last_pulled_at` NULL on **every**
      row and `sync_log` is empty, consistent with the pull never reaching the minting step. Narrow
      `mintDocumentNumber`'s parameter from `string` to the union of the 10 real keys so the next
      wrong literal cannot compile.

## 6. Standing cautions

- [ ] **This repo is edited concurrently.** The `babin-booqable-layout` zip was applied at 00:28:52
      *during* the audit that produced this pack, and two verification agents consequently read
      different content under the same path. **Re-check facts established at the start of a long
      session before relying on them at the end.**
- [ ] **A live-DB claim needs an identity.** `npm run check:db` run bare connects as `anon`; RLS
      filters all 23 tables to zero and it says so twice. It reported `external_refs 0` where the
      table holds 171. Use `--email/--password`, or the MCP route.
- [ ] **Never open the `Actions ▾` bulk menu** in a Booqable session — it is the mutating control on
      the Bookings list, and every capture so far has deliberately left it closed.
- [ ] Re-read any record you interacted with and confirm state unchanged before ending a session.

## 7. Layer D verification — done 31 Aug

All 14 screens in §2 were worked. The consolidated report is
[`LAYER-D-VERIFICATION.md`](LAYER-D-VERIFICATION.md); the per-screen evidence is in
[`layer-d/`](layer-d/), one file per section.

> ✅ **Both files reconciled 31 Aug 13:30.** `LAYER-D-VERIFICATION.md` landed at 13:24, after this
> backlog was ticked at 13:19 — the warning that stood here was true for five minutes.
> `layer-d/report-pages.md` (§15) was recovered from the run log and written; the harness had
> blocked that subagent's own write, so its findings existed only as transcript text. Its content
> is the agent's verbatim write-up, unedited apart from dropping the harness note above the title.
> All fourteen per-screen files are now on disk and every link in this section resolves.

**329 Layer D claims checked.**

| Verdict | Count | What it means |
|---|---:|---|
| CONFIRMED | **93** | exists and is what v2.5 says it is |
| MISLEADING | **85** | exists, but v2.5 describes its behaviour, scope or gating incorrectly |
| GAP | **110** | nothing in the repo or DB serves it; it is not built |
| WRONG-NAME | **34** | something real serves it, under a different name |
| UNVERIFIABLE | **7** | cannot be settled from the repo or the DB |

**Only 28% of v2.5's Layer D survived contact with the repo.** Layers A, B and C remain trusted;
Layer D is now checked, and it should be read through `layer-d/` rather than from v2.5 directly.

**What repeats across sections — read these before planning any build:**

1. **Built-and-unwired is the dominant failure mode, and v2.5 consistently misreads it as
   "unbuilt".** Five fully-built, fully-tested modules have **zero callers in `src/`**:
   `facetCounts.ts` (§4 above), `lib/kpiEngine.ts` (§9, §15), `fetchCanonicalBooking` +
   `priceCanonicalBooking` (§10 — 2,568 lines), `src/lib/queries/bundles.ts` (§18), and
   `auditForRecord()` (§16). Each one is authoritative-looking code sitting beside the real path,
   which is exactly how §10.6 and §15.3 came to describe modules their routes never touch. **Before
   scheduling any engine, grep for its importers.**
2. **Whole screens have no data path at all.** `/calendar`, all ten `/reports/*`, `/documents`,
   `/admin/activity-log`, `/settings` and both bundle screens import no supabase client, no query
   module and no action. Their Layer D lines are specifications, not descriptions.
3. **`/settings` persists to per-browser `localStorage`.** `system_settings` exists live with 0 rows
   and zero readers. Any plan that says "set the default in Settings" writes to one operator's
   browser — including `operationalDayStart`, on which every "today" panel depends.
4. **The corpus is empty where the money is.** `booking_lines`, `product_units`,
   `inventory_reservations`, `invoices`, `payments`, `coupons`, `document_registry` and the eleven
   comms tables all hold **0 rows**. A correctly-built revenue tile returns Rs 0 over 150 August
   bookings. **That is corpus, not defect — do not paper over it in the UI.**
5. **v2.5 invents Layer D names.** Beyond §2.4's six: `bundle_items.component_price` (§18),
   `inventory_units` (§12 — the real table is `product_units`), `occurred_at` (§4 — it is
   `created_at`), `starts_at`/`ends_at` (§11 — the window is `bookings.pickup_at`/`return_at`), and
   `booking_facets()` (§9, §14). **None of these may reach a migration.**
6. **Per-role RLS correctness is still unverified project-wide** — the single most repeated
   UNVERIFIABLE, raised by §10, §12, §13, §20 and §21. The MCP session runs as `postgres` with
   `rolbypassrls`, so `auth_user_role()` resolves to `'Client'` and every `_v` view returns zero rows
   for gate reasons. This is **I5**, and it stays open. A wrong policy is a Law 6 breach no UI gating
   can repair.
7. **Doc rot is systemic in `docs/pages/`.** Eleven of the fourteen sections found `NN_*.md` files
   contradicted by current code — stale line anchors (`07_rentals_list.md` is ~24 lines short
   throughout; `23_calendar.md` ~95), retired frozen-clock claims, and UI described that no longer
   renders. **Code wins in every case.** `docs/pages/24_documents.md` (§17) was the one clean file.

---

## 8. UI-pattern gaps from the 31 Aug live walk — [`GAP-CHECK_2026-08-31.md`](GAP-CHECK_2026-08-31.md)

Filed 1 Sep from Babin's delivery. Its P0 (data wiring) is **not** listed here as one box because
it is two work items — see the filing note: Wave 1 wiring makes screens read our DB truthfully;
matching Booqable's live numbers (653 bookings, 93 Aug payments vs our 246 / 0 on 1 Sep)
additionally needs the corpus import/bridge, which no current wave contains. Tick in the same
commit as the work.

- [ ] **Wave 1 re-scope + wiring** — Today/Dashboard, Operations, RentalsList onto
      `queries/bookings.ts`. Re-scope first: the 12 Aug conversion was never driven, and
      `Today.tsx`/`OperationsQueues.tsx` were overwritten 00:28:52 31 Aug. D4 boundaries already
      exist in `bookings.ts`. Acceptance for *this* box: the walked screens read the live DB
      (246/0/0 today) with honest empties — not the #898/#903 numbers.
- [ ] **⛔ RULING NEEDED — the seed corpus squats on live Booqable booking numbers.**
      `bookings.booking_no` is UNIQUE; the import used Booqable's own numbers (B-700…B-899);
      applied `0076_seed_operational_stage_corpus` then took **B-900…B-945**, the range the next
      real orders need (the capture probed Booqable **#906** live). Those rows **cannot be
      deleted** (Law 3) and cancelling does not free the number. Importing orders #900+ fails on
      the unique index until this is ruled. Options and costs:
      [`BRIDGE-AND-CORPUS-STATE.md`](BRIDGE-AND-CORPUS-STATE.md) §4. **Babin's call, not an
      agent's** — it is a live write against an applied migration's rows.
- [ ] **Corpus import/bridge decision** — how Booqable's remaining ~450 orders / 93 payments reach
      our DB. Blocked on the numbering ruling above. Note the bridge is **already built** (109 KB
      `sync.ts`, seven mappers, the `booqable-proxy` Edge Function, and `scripts/run-full-sync.ts`
      as the entry point) — this is a ruling + a back-fill, not a build.
- [ ] **Back-fill `external_refs` for the 200 imported bookings** before any re-sync. They carry
      **zero** `orders` refs, so `runFullPull` would re-insert rather than update — and Law 3
      makes those duplicates permanent. §5.
- [ ] **🔑 Rotate the Booqable API token — Babin only.** It is hard-coded in four git-tracked
      scripts since commit `201f772` (13 Aug). No git remote exists, so exposure is local — but
      `.rar`/`.zip` handoffs carry history. Rotate → move to the `booqable-proxy` env → then
      scrub the scripts (scrubbing first only hides it). §6. **No agent should rotate this.**
- [ ] **Fix or quarantine `scripts/full_sync.sql` + `generated_import.sql`.** Every booking INSERT
      uses `client_id = (SELECT id FROM clients LIMIT 1)` and `pickup_at = return_at = NOW()`, and
      their idempotency guard checks `external_refs` rows that were never written — so running
      either file today permanently inserts 100 (or 25) mis-clientned, zero-length bookings. §5.
- [ ] **`booking_facets()` RPC + FilterRail on Rentals** (RAIL spec §1, §3.1–3.2). ⚠ §6.5: the RPC
      is a v2.5 fabrication today — design it fresh, do not transcribe v2.5's description. Chip
      grammar identity → lifecycle → dates → tags; Export/Import move into the rail when it lands.
      ⚠ Partly moved since the walk: `facetCounts` was wired to `/rentals` on 31 Aug (PROGRESS
      "facetCounts wired to /rentals"), and layer-d found a *second* `facetCounts.ts` — grep for
      both before building; the walk's "no facet counts anywhere" no longer holds.
- [ ] **Next-verb header on Booking Detail** (F5/§10.1) — single primary from `lib/workflow`'s
      next transition; replaces the generic "Operations" link + ⋮.
- [ ] **RangePicker presets via `periodRange`** (DATE_TIME_PICKER v1.0 §4.1 — 13 Booqable presets
      + This/Last fiscal year + Next 7 days), shared by rails and the report toolbar.
- [ ] **PeriodPicker, uncoloured first** (§4.2) — availability colouring stays blocked on the
      §10.6 availability source; neutral calendar until it exists, never guessed green.
- [ ] **Verify the "Payment Due" grey chip as Warehouse** — if that grey is the money gate, the
      rule is absent-not-disabled (Law 6). Unverifiable from an Owner session; also I5-adjacent.
- [ ] **P2 sweep** — deposit column: decide §9.8 or hide until D1 backfill · duplicate "More
      Filters" on Dashboard · Finance period control renders "— 31 Aug 2026" with a blank start.
- [x] **Deliver or retire the v1.1 date-picker spec — DONE 03:13 1 Sep, by the concurrent
      session.** [`DATE_TIME_PICKER_SPEC_v1.1.md`](DATE_TIME_PICKER_SPEC_v1.1.md) filed from
      Babin's delivery (§4.4 flips to BS-prominent, matching the app); v1.0 bannered superseded.
      Residue that session flagged: v1.1 §5 decision 2 still carries v1.0's AD-primary framing —
      after §4.4 the real open question is whether an AD-primary comfort toggle exists.

## The per-screen template

Unchanged from `REFERENCE_SPEC_v2.5.md` §6. Reproduced there; not duplicated here. The **rules for
filling it in** are amended by §3 above: cite laws by their real `PLAN.md` §0 number, cite our side
from `docs/pages/NN_*.md` and source, and treat §2.4 as **unverified input** rather than as the
contract list.
