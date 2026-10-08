# Layer D verification — Report pages — Company performance & Availability
**v2.5 §15 (lines 951-1028) · Our routes: `/reports/*` · Verified 31 Aug 2026 · repo read + live DB (read-only)**

**Headline: §15.3 names `kpiEngine` as the engine behind Company performance. `src/lib/kpiEngine.ts` has zero importers anywhere in `src/`, is typed against the `RentalRow` seed rather than any DB row, and contains no `delta` anything — all four of §15's kpiEngine claims fail. Meanwhile the one thing §15 says we lack, the page-level comparison selector, is already built in `ReportToolbar`.**

## Verdict table

| # | v2.5 claim | Verdict | Real answer | Evidence |
|---|---|---|---|---|
| 1 | `company kpiEngine over …` | **GAP** | Dead code. All six exports have zero call sites in `src/`; the only `kpiEngine` strings in `src/` are two comments in a seed file. | `src/lib/kpiEngine.ts:10,22,40,44,48,56`; grep → `src/data/rentals.ts:60,113` only |
| 2 | `… over bookings ⨝ booking_lines ⨝ clients, period-scoped` | **GAP** | No report screen queries the DB. `grep -rln "lib/queries\|lib/supabase" src/modules/reports/` matches only `ReportCatalog.tsx`, and that import is `financeRestriction`, a role gate. | `Pulse.tsx:33`; `src/data/pulse.ts:1-5`; `ExpenseReports.tsx:33`; `ReportCatalog.tsx:12`; `docs/pages/INDEX.md:58-67` all "Seed-only" |
| 3 | `attribution = starts_at` | **WRONG-NAME** | Our column is **`bookings.pickup_at`**. `starts_at` is Booqable's wire name, absent from `src/lib/queries/` and `src/modules/reports/`. | schema brief; grep → 0 hits; `src/lib/booqable/map/orders.ts:217` |
| 4 | `… matching the 06:00 day question — same engine input` | **MISLEADING** | `lib/operationalDay` (`'06:00'`) is imported by **no report and not by the toolbar**. Report windows are Kathmandu **midnight** to midnight. | grep `operationalDay` in reports → 0; `ReportToolbar.tsx:166-168` |
| 5 | `kpiEngine delta{direction,text,good?}` | **WRONG-NAME** | `Delta` is declared **locally in `Pulse.tsx`**. Real shape `{direction:'up'\|'down'\|'flat'; text:string; good:boolean}` — `good` is **required** (v2.5 marks it optional) and `'flat'` is a third direction v2.5 omits. | `Pulse.tsx:204-211,213,220`; `kpiEngine.ts` whole 63-line file has no delta |
| 6 | "what it gains is the page-level comparison selector" | **MISLEADING** | Already built: `ReportCompare = 'off'\|'previous'`, a page-level `<select>`, driving every Pulse tile. What's missing is only the **Previous year** option. | `ReportToolbar.tsx:104,340,615`; `Pulse.tsx:423,600,614,629` |
| 7 | §15.5(2) "kpiEngine supports deltas; selector is UI work only" | **GAP** | Neither half holds — see #5 and #6. | as above; `src/data/pulse.ts:606` (compare range = period before, not year before) |
| 8 | `scope Reserved+Started+Returned+Archived; parameterised default per surface` | **GAP** | No report has a status facet. `ReportFilters = Pick<ListFilters,'dateRange'\|'chips'>` and **no report passes `chips`**. Vocabulary also doesn't map: `booking_stage` is `Quote\|Booked\|Packed\|On Rent\|Returned\|Closed` — no Reserved/Started/Archived exists. | `ReportToolbar.tsx:101`; `grep "chips:" src/modules/reports/*.tsx` → 0 |
| 9 | §15.1 "status facets with counts scoped to the period" | **GAP** | ⚠ known-bad repeat. `facetCounts.ts` is tested but unwired; no screen shows an option count; nothing named `*facet*` exists in the DB. | `src/lib/queries/facetCounts.ts`; `FilterDrawer.tsx:672` |
| 10 | per-KPI ⓘ definitions (§9.3 adoption) | **GAP** | `CardModel` = `{label,value,sub,icon,accent,to,linkLabel,delta,discrepancy}` — no definition member, no ⓘ. `DEFINITIONS` is `Record<ChartView,…>`: the *chart* has a definition, the six tiles don't. | `Pulse.tsx:234-243,244+,566,896`; `src/data/pulse.ts:681` |
| 11 | `avail` as a report source | **GAP** | No `/reports/availability` route, no availability screen. | route table; `ls src/modules/reports/` |
| 12 | `availability = stock − overlapping plannings (Booqable-mastered)` | **WRONG-NAME** | Formula is real and **local**: `lib/availability.ts` (`conflictingHolds`, `windowsOverlap`, `selectUnitsForLine`, `explainShortfall`, `RENTAL_WINDOW_BOUNDS='half-open'`). `lib/queries/availability.ts` reads `inventory_reservations.period` + `product_units_v`. It serves **unit assignment at booking creation**, never a report. | `lib/availability.ts:104,130`; `lib/queries/availability.ts:36,220,262,637` |
| 13 | `shortage "With shortage" = available < 0 for any day` | **GAP** | Unimplemented. Only hit is `predictedShortages`, the literal `15` in a constants file. | `src/data/forecastingReports.ts:3-8`; `ForecastingReports.tsx:95-96` |
| 14 | `charts Revenue/AOV over time — our LineChart already fits` | **MISLEADING** | `LineChart` exists, is in the barrel, Pulse uses it — but it is **single-series** (`points:number[]`, one `seriesLabel`, no dual axis), so it cannot render the comparison the same paragraph requires; Pulse already swaps to `GroupedBars`. **No AOV series exists** in any figures source. | `Charts.tsx:196-208`; `ui/index.ts:15`; `Pulse.tsx:704-712,60-73` |
| 15 | `duration lib/format needs a formatter (ours renders days only)` | **MISLEADING** | Gap real, description wrong twice. `lib/format.ts` renders **no durations** (5 exports: `clock,clockPad,grouped,rs,bsAdPair`, 57 lines). A d/h/m formatter **already exists**: `formatOverage` → `"2d 3h"`. It's a promote, not a write. | `src/lib/format.ts:1-57`; `src/lib/lateFee.ts:272-287` |
| 16 | §15.4 "our Pulse + **Owner Report** combined" | **WRONG-NAME** | **No Owner Report exists** — zero hits for `Owner Report\|owner-report\|ownerReport` in `src/` or `docs/pages/INDEX.md`. Our only company-level report is Pulse. | grep → none; `docs/pages/INDEX.md:58` |
| 17 | §15.4 "the **31**-report program" | **WRONG-NAME** | The register holds **47** entries; its own header calls it "the 43-report register" quoting a spec that says 45. Three numbers, none 31. **10** carry a route. | `catalog.ts:4,224`; `grep -c "projection:"` → 47 |
| 18 | Company-performance revenue by rental start, as servable | **GAP (code + corpus)** | Returns zero even if built. 150 bookings start Aug 2026; `booking_lines`=0 → revenue-by-start = **0**. `product_units`=0, `inventory_reservations`=0. **Zero** `public` functions match `%availab%`/`%shortage%`/`%kpi%`/`%revenue%`. | SQL 31 Aug (read-only), single SELECT → `150, 0, 0, 0, 0, 0` |
| 19 | "New customers created within the period" as portable | **MISLEADING** | Definition portable, figure meaningless: all **366** clients have `created_at` in Aug 2026 (the reseed), so the tile reads 366 of 366. Also Law 17 — **New clients**, never "customers". | same SQL, `new_clients_aug = 366` vs base 366 |

## Corrected Layer D

```
company    GAP — not built. No company-performance report; no report screen reads
           the database. Ten seed-only screens (Pulse, Expense, Client, Promotions,
           Staff, Inventory, EquipmentPerformance, Forecasting, CashFlow,
           WorkingCapital). NOT lib/kpiEngine — zero importers, typed against the
           RentalRow seed. Nearest built thing: Pulse.tsx over data/pulse.ts's
           figuresFor(from, to), one dated seed ledger.
attribution GAP. The column, when built, is bookings.pickup_at — NOT `starts_at`.
           Window: Kathmandu midnight-to-midnight (ReportToolbar's
           startOfNepalDay/endOfNepalDay), NOT the 06:00 operational day.
compare    BUILT, one option missing. components/ui/ReportToolbar.tsx — page-level
           <select>, ReportCompare = 'off' | 'previous'. Deep-import: ReportToolbar
           is NOT in the ui barrel. Delta (Pulse.tsx:204-211, local, not an engine):
             { direction: 'up'|'down'|'flat'; text: string; good: boolean }
           Producers pctDelta / countDelta. Missing: "previous year" + a figures
           source with a year of history (ledger starts 1 May 2026).
scope      GAP. Reports carry no status facet; `chips` is in the type, unused.
           When built the vocabulary is booking_stage: Quote|Booked|Packed|On Rent|
           Returned|Closed. No Reserved / Started / Archived exists in this system.
facets     GAP — no screen shows an option count; countFacet/useFacetCounts unwired;
           nothing named *facet* exists in the DB.
avail      GAP as a report. FORMULA built elsewhere for another purpose:
             lib/availability.ts        — conflictingHolds, windowsOverlap,
                                          selectUnitsForLine, explainShortfall
             lib/queries/availability.ts — planAssignment, planCreationUnits
           Reads: inventory_reservations (period tstzrange) · product_units_v ·
                  booking_line_units — all 0 rows today.
           Writes: inventory_reservations via reserveAssignedUnits (booking creation).
shortage   GAP. "available < 0" exists nowhere. ForecastingReports' "15" is a literal.
charts     PARTIAL. Charts.tsx LineChart (:196) is barrel-exported and single-series
           only; a compared series must use GroupedBars (:346), which Pulse does.
           AOV over time: GAP — figuresFor() has no average-order-value bucket.
duration   GAP in lib/format (renders NO durations). formatOverage at
           lib/lateFee.ts:272 already emits "2d 3h" — promote it, don't rewrite.
definitions GAP — no per-KPI ⓘ; DEFINITIONS is keyed by ChartView, not by tile.

Writes: none — every /reports/* screen is read-only.
Reads:  nothing from Postgres. All ten read src/data/*.ts seeds.
```

## Money and Law 6

**Money figures here:** Revenue, Profit, Collected, Cash/Outstanding, Top-equipment revenue on Pulse; all of `/reports/cash-flow`, `/reports/working-capital`, `/reports/expenses`, plus the tab families `Pulse.tsx:164-174` marks `money: true` (Revenue, Clients, Finance). Non-money: utilization, counts, inventory, staff.

**Money-blind roles:** `useCanViewMoney()` → `canViewMoney(user.role)` in `lib/rbac`, mirroring `auth_can_view_money()` — **Warehouse, Technician, Driver, Client**, plus any unauthenticated session (`moneyVisibility.ts:26` returns `false` with no user).

**Gating mechanism — `useCanViewMoney` only, used correctly.** Pulse **omits**, never masks: `Pulse.tsx:590` builds money tiles inside `if (money)`, `:565` forces `activeView='utilization'` so money chart views are unreachable, `:749` builds equipment rows only when `money`. Nothing reaches the DOM for a blind role — "hidden" genuinely means not built.

**RLS and the masked `_v` views do not participate on this screen**, because no report queries Postgres. **Law 6 on `/reports/*` is enforced in exactly one layer today: a React hook.** The 20 money-masking views and the `*_money_blind` policies are real and correct but sit downstream of a query no report makes; a defect in `useCanViewMoney` currently has nothing behind it.

## What this changes for the build

1. **Delete or wire `lib/kpiEngine.ts` — stop citing it.** Zero importers, seed-typed, no delta contract. Any plan saying "kpiEngine already does X" is planning against dead code. (It survived unexamined because it is on §2.4's 19-module engine list.)
2. **The comparison selector is built; stop scheduling it.** The real backlog item is the **previous-year** option plus a figures source with a year of history.
3. **Promote `Delta`/`pctDelta`/`countDelta` out of `Pulse.tsx`** into a shared engine before a second report grows its own copy.
4. **Promote `formatOverage` (`lateFee.ts:272`) into `lib/format`** as the one duration formatter. Do not write a new one; do not believe "ours renders days only".
5. **Any company-performance report must name its attribution column on the tile.** Ours is `pickup_at`, windowed at Kathmandu midnight. Wanting the 06:00 day means threading `operationalDay` into `ReportToolbar` — a change to every report's period, not a report-local decision.
6. **Do not build revenue / AOV / items-ordered tiles against live data yet.** `booking_lines` is empty: a correctly-built tile returns Rs 0 over 150 August bookings and will read as a bug.
7. **A "New clients" tile is unsafe against this corpus** — all 366 clients were created in August, so it equals the total. And call it *clients* (Law 17).
8. **An Availability report is a new screen, not a wiring job.** The formula serves unit assignment; a report needs its own product-grained projection, and both source tables are empty.
9. **"With shortage" needs a definition before code.** `available < 0` presumes overbooking is representable — check `enforce_inventory_reservation_capacity` and `lib/bookingRules.ts`'s `getAllowOverbooking`, or define shortage as *demand > stock* from unreserved lines.
10. **Per-KPI ⓘ is a real gap our side too.** `CardModel` needs a definition member and `KpiCard` needs to render it before §9.3's money-tile rule can be claimed.
11. **The register is 47 entries, not 31.** `catalog.ts`'s own header (43) and the spec it quotes (45) are both stale against its 47 rows.

## Doc/code contradictions recorded
- `catalog.ts:4` calls itself "The 43-report register" and quotes a spec saying "45 reports", while `REPORTS` holds **47** entries. Code wins: 47, of which 10 are routed.
- `docs/pages/INDEX.md:58-67` labels all ten report routes "Seed-only" — this **agrees** with the code and is the correct record; v2.5 §15.3 is what disagrees.

## Known-bad facts §15 repeats
- **facetCounts** — §15.1 holds up "status facets with counts scoped to the period" as a mechanic to copy without noting that no screen in this repo shows an option count today and no server-side counterpart exists.
- **§2.4's 19-module engine list** — §15.3's whole company/compare block rests on `kpiEngine` being a live engine, which is exactly the failure mode that list creates.
- §15 does **not** repeat the law-number, BrandKey, Card, `next_document_number` or ClickableRow errors.

## Open questions
1. **Revenue attribution for our reports** (§15.5(1)) — `pickup_at`, `invoices.issue_date`, or `payments.payment_date`? *Settled by:* a PLAN.md §4 ruling. Not purely preference: `invoices` and `payments` hold 0 rows, so only `pickup_at` is answerable against today's corpus.
2. **Does the report period follow the 06:00 operational day or civil midnight?** They disagree silently and nobody has chosen. *Settled by:* a ruling, then threading `operationalDay` into `ReportToolbar` or documenting midnight as deliberate.
3. **Can availability ever be negative?** *Settled by:* `SELECT prosrc FROM pg_proc WHERE proname='enforce_inventory_reservation_capacity'` read together with `lib/bookingRules.ts`. Not checked this pass.
4. **Is 47 the intended report count?** *Settled by:* reconciling `09_FINANCE.md §9.6` with `WIREFRAME_RULINGS_2026-08-12.md §11.3` and recording one number.
5. **Do money-blind roles actually get NULL from the views at runtime?** Unverifiable from `/reports/*`, which never queries. *Settled by:* an authenticated session per role (set `app.current_user_id` to a real `users` row) against `clients_v`/`products_v`.
6. **Are `CasesReports.tsx` and `ProductReports.tsx` dead or pending?** Both routeless with no importer. *Settled by:* a ruling — delete, or route and register them.