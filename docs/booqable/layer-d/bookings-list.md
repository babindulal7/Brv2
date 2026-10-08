# Layer D verification — Bookings list
v2.5 section: §9 (lines 309-431)   ·   Our route(s): /rentals
Verified: 31 Aug 2026   ·   Method: repo read + live DB (read-only)

Module under test: `src/modules/rentals/RentalsList.tsx` (2142 lines, single file).
Query layer: `src/lib/queries/bookings.ts`, `src/data/rentals.ts`, `src/lib/queries/listQuery.ts`.

> **Correction to this task's own briefing.** The briefing said RentalsList "has been refactored
> behind `useRentalsListState` in `src/modules/rentals/components/RentalsListContext.tsx`". Neither
> exists. `src/modules/rentals/` contains no `components/` directory (`ls` returns `__tests__`,
> `booking`, `modals`, and ten `.tsx` files), and a repo-wide grep for `useRentalsListState` and
> `RentalsListContext` across `src/` and `docs/` returns **zero hits**. The screen is still the
> 2142-line monolith. Every line citation below is against that file as it stands today.

---

## Verdict table

| # | v2.5 Layer D claim | Verdict | Real answer | Evidence (file:line or SQL) |
|---|---|---|---|---|
| 1 | `source  bookings + clients (customer name)` | **CONFIRMED** | `listBookings` selects `bookings` with an embedded `clients ( name )`. | `src/lib/queries/bookings.ts:259-263` (`BASE_COLUMNS`), `:420` (`.from('bookings')`), `:336` (`clientName: r.clients?.name`) |
| 2 | `source … + invoices/payments (price, payment status)` | **GAP** | Neither table is touched by this screen. `BASE_COLUMNS` names `bookings`, `clients`, `booking_lines` and nothing else; there is no invoice or payment join anywhere in `listBookings`. Live: `invoices` = 0 rows, `payments` = 0 rows. | `bookings.ts:259-263`; `select count(*) from invoices` → 0, `from payments` → 0 |
| 3 | `filter  listQuery.ts chip groups: stage[]` | **CONFIRMED** | `stage` is the one real chip group, declared in the URL schema and sent as `chips: { stage: [...] }`. | `RentalsList.tsx:697` (`chips: ['stage']`), `:713` (`allow: { stage: STATUS_ORDER … }`), `src/data/rentals.ts:799-802` (`narrowStages`) |
| 4 | `filter  … payment_status[]` | **GAP** | No `payment_status` column exists on `bookings` (schema brief; 29 columns, none named that). The chip that would need it — `Payment Due` — ships permanently `disabled` with a written reason. | `src/data/rentals.ts:442-443` (`PAYMENT_DUE_UNAVAILABLE`), `RentalsList.tsx:1303-1311` (disabled render) |
| 5 | `filter  … date range` | **CONFIRMED (with a stated limit)** | One `dateRange` on `pickup_at` only. A return-date range is impossible: `ListFilters.dateRange` names a single column and `applyListFilters` cannot OR two. The screen says so on-screen. | `RentalsList.tsx:698` (`dateColumn: 'pickup_at'`), `:1000` (`setDateRange('pickup_at', …)`), `:1414-1417` (the sentence) |
| 6 | `filter  … tag` | **GAP** | `bookings` has no tag column. `booking_flags`' CHECK admits only `Returned Early / Overdue / Missing / Damaged`, so VIP/Priority-style tags are unstorable. The `tag` filter group in the rail renders `disabled`. | Schema brief (`booking_flags_recorded_subset_only`); `src/data/rentals.ts:905`; `RentalsList.tsx:1083-1108` |
| 7 | `scope  DEFAULT EXCLUDES Cancelled … encode as a base predicate, not as a chip` | **CONFIRMED** | Exactly this shape. `LIVE_ONLY = { cancelled_at: false }` is a **presence** predicate spread into every chip's filter set by `bySortedPickup()`, not a chip value; the `Cancelled` chip is the single opt-in that flips it. Live corpus: 60 of 200 bookings are cancelled, so the predicate removes 30% of the table. | `src/data/rentals.ts:694` (`LIVE_ONLY`), `:696-698` (`bySortedPickup`), `:773` (the `Cancelled` chip); `select count(*) from bookings where cancelled_at is not null` → 60 of 200 |
| 8 | `scope  … + Archived` | **GAP** | There is no Archived state in our model. `bookings` has `closed_at` and `cancelled_at`; `Closed` is one of the canonical six stages and is **not** excluded by default. Nothing in the repo or DB implements "archived". | Schema brief (`bookings` columns); `src/lib/workflow.ts` `STATUS_ORDER`; `src/data/rentals.ts:694` excludes cancellation only |
| 9 | `counts  booking_facets() RPC — see §9.2` | **CONFIRMED as absent** | The RPC genuinely does not exist. Nothing named `*facet*` exists in `pg_proc` in schema `public`. | `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%facet%'` → **0** |
| 10 | §9.2 "This is our biggest **unbuilt** filter item" — i.e. no facet engine exists | **MISLEADING** | The engine **exists and is tested**: `src/lib/queries/facetCounts.ts` (`countFacet`, `useFacetCounts`), and `FilterOptionList` draws the count beside an option. It implements the *harder* semantics — each option counted with its own group's selection removed. The real defect is that it is **completely unwired**. | `src/lib/queries/facetCounts.ts`; `src/components/ui/index.ts:19` exports `FilterOptionList` |
| 11 | (corollary) any screen shows an option count today | **GAP** | **No screen shows an option count.** `countFacet` is imported by exactly one file, its own test (`facetCounts.test.ts:9`). `useFacetCounts` has **zero** callers in `src/`. `FilterOptionList` is mounted **only** in `FilterDrawer.test.tsx`. `/rentals`' own filter rail renders `StatusFilterGroup` — a hand-rolled accordion of bare checkboxes with **no count** — for Status and `disabled` buttons for the other ten groups. | grep across `src/`: `countFacet` → test only; `useFacetCounts` → none; `FilterOptionList` → `FilterDrawer.tsx:672` (def) + `FilterDrawer.test.tsx` (mount) only. `RentalsList.tsx:532-599`, `:1079-1109` |
| 12 | §9.8 open decision 2 — "do counts respect the other active filters, or only base scope?" | **MISLEADING (already closed in code)** | Answered, in the more useful direction: drop the option's **own** group's chips, keep every other group constraining. Do not re-open it. | `src/lib/queries/facetCounts.ts` doc comment; `CORRECTIONS.md:184-227` |
| 13 | §9.2 "Eleven filter options means eleven `count` queries per page load" | **CONFIRMED as a cost, but not our current cost** | True of a naive build and `facetCounts.ts` says so itself, which is why the hook is opt-in per group. Moot today: nothing calls it, so `/rentals` issues **zero** facet counts. | `src/lib/queries/facetCounts.ts`; claim 11 |
| 14 | `sort  #, stage, starts_at (server-side)` | **MISLEADING** | Server-side sorting is real but there is **one** sort and it is not selectable: `pickup_at` ascending, defaulted inside `listBookings`. Some chips override it (`Returning` → `return_at`). There is **no sort UI at all** — grep for `aria-sort`, `onSort`, `setSort`, `sortBy` in `RentalsList.tsx` returns zero hits; the `<th>`s are plain text. So `#` and `stage` are not sortable by anyone. | `bookings.ts:455` (`sort: filters.sort ?? { column: 'pickup_at', ascending: true }`), `src/data/rentals.ts:697`, `:757`; `RentalsList.tsx:1671-1695` (headers) |
| 15 | `paging  30/page, server-side` | **WRONG-NAME (30 → 20)** | Server-side paging is CONFIRMED (`page: { index, size }` → `.range()`, `withCount: 'exact'`). The page size is **20 by default**, chooseable from `[5, 10, 20, 50]`, and rides `?per=` in the URL. Never 30. | `RentalsList.tsx:678-681`, `:876`, `src/data/rentals.ts:374` (`ROWS_PER_PAGE`), `bookings.ts:421` |
| 16 | `paging  … "Select all 654" must select the QUERY, not the page` | **GAP** | There is no selection at all on this screen — no row checkbox, no select-all, no `N selected` counter. The rule is sound and unimplemented. | `RentalsList.tsx:1698-1910` (the `<tbody>` — no `<input type="checkbox">` in any row) |
| 17 | `money  Price + Payment status columns are money` | **GAP (those two columns do not exist here)** | Our table columns are `Booking · Client/Project · Items · Pickup · Return · Status · Deposit · Actions`. There is no Price column and no Payment status column. | `RentalsList.tsx:976-984` (`headers`), `src/data/rentals.ts:371` (`OPTIONAL_COLUMNS`) |
| 18 | `money  Law 6: for money-blind roles these columns are NOT BUILT — not hidden with CSS` | **CONFIRMED, for the money column we do have** | `Deposit` is removed from the DOM, not masked: `show('Deposit')` is false so the `<th>` (`:983`), the `<td>` (`:1889`) and the card block (`:1558`) are never emitted; `Deposit` is stripped from the column-chooser array before render (`:838`); and `withDeposit` is never passed, so the query never names the column (`:868`). Omission, not CSS. | `RentalsList.tsx:838`, `:868`, `:975`, `:983`, `:1558`, `:1889` |
| 19 | `money  … DIVERGES from bookings.ts, which deliberately carries no money on list rows at all` | **MISLEADING** | Money already rides a list row. `BookingListRow.depositRequired: Paisa \| null` exists and is populated from `bookings_deposit_v` in a second, id-keyed query, run only when `withDeposit` is set — which `RentalsList` spreads only behind `useCanViewMoney()`. | `bookings.ts:106` (field), `:400-414` (`readDeposits`), `:478-481`; `RentalsList.tsx:655`, `:868` |
| 20 | (backlog claim) the deposit comes from the **masked view** `bookings_deposit_v` | **CONFIRMED at the database** | Live view definition: `SELECT id, CASE WHEN auth_can_view_money() THEN deposit_required ELSE NULL::numeric END FROM bookings b WHERE auth_is_staff();` — and `reloptions` is NULL, i.e. **security_invoker is not set**, so it runs definer-rights as the code comment claims. | `select pg_get_viewdef('public.bookings_deposit_v'::regclass, true)` and `select reloptions from pg_class …` |
| 21 | (implied by `bookings.ts:376-382`) the base-table column read "42501s for **every** role" after 0062 | **MISLEADING** | Half-armed. `authenticated` has **INSERT, REFERENCES, UPDATE** on `bookings.deposit_required` but **no SELECT** — the revoke is real for the app role. **`anon` still holds SELECT on the column.** RLS saves it in practice (`bookings_select` is `auth_is_staff()`, and `auth_user_role()` defaults to `'Client'`, so anon gets zero rows), but the sentence "every role" is not true as written. | `select grantee, privilege_type from information_schema.column_privileges where table_name='bookings' and column_name='deposit_required'` → anon:SELECT present, authenticated:SELECT absent; `select polname, pg_get_expr(polqual,polrelid) from pg_policy where polrelid='public.bookings'::regclass` → `bookings_select = auth_is_staff()` |
| 22 | (backlog claim) the rental **TOTAL** is genuinely absent because `fetchCanonicalBooking` types crew/transport/vatPercent/payments as `null` | **CONFIRMED** | All four are literal `null` types on `CanonicalEngineInput`, each with its reason written out. No rental total can be computed from it, on a list row or anywhere else. | `src/lib/bookingQuery.ts:462` (`crew: null`), `:471` (`transport: null`), `:475` (`vatPercent: null`), `:483` (`payments: null`) |
| 23 | `engine  lib/workflow (stage)` | **CONFIRMED** | `STATUS_ORDER`, `statusToken`, `BookingStatus` imported and driving the stage chips and the Status accordion. | `RentalsList.tsx:17-18`, `:578`, `:1196` |
| 24 | `engine  lib/money (formatMoney)` | **CONFIRMED** | Imported and used on both deposit renders. | `RentalsList.tsx:13`, `:1561`, `:1900` |
| 25 | `engine  lib/moneyVisibility (useCanViewMoney)` | **CONFIRMED** | The single money gate on the screen. | `RentalsList.tsx:15`, `:655` |
| 26 | `engine  lib/bs (dates)` | **CONFIRMED** | `formatAd` and `getBusinessToday` imported; the operating day is resolved from the real Kathmandu clock at module load. | `RentalsList.tsx:14`, `:55`, `src/lib/bs.ts:277-279` |
| 27 | `engine  lib/kpiEngine (the strip)` | **WRONG-NAME** | `lib/kpiEngine.ts` is **not imported by this screen, or by any file in `src/`** — grep for all six of its exports (`calculateActiveRentals`, `countOverdue`, `calculatePickupsToday`, `calculateReturnsToday`, `calculateRevenueToday`, `calculatePaymentDue`) returns zero call sites outside the module. The strip is four `useList(listBookings)` count queries over the named filter sets in `RENTAL_KPI_FILTERS`. | `RentalsList.tsx:908-912`, `:933-938`; `src/data/rentals.ts:879-890`; grep: `kpiEngine` appears in `src/` only in two comments in `data/rentals.ts` |
| 28 | `export  lib/csv.ts already exists and is imported by exactly ONE screen` | **MISLEADING (three importers, and none is this one)** | `lib/csv.ts` is imported by `components/ui/ReportToolbar.tsx:4`, `modules/clients/ImportCenter.tsx:9`, and referenced by `modules/reports/Pulse.tsx:1310` — not one screen. `/rentals` imports it **not at all**: its Export button is `disabled`, wrapped in `Unavailable`, with the file-format and per-role-column decisions logged to `PLAN.md §4.22`. | grep `lib/csv` across `src/`; `RentalsList.tsx:1143-1147` |
| 29 | §9.4 `row → link /orders/{uuid}` | **WRONG-NAME** | Our row links to `/rentals/:bookingNo` — the human booking number (`B-…`), not a uuid, and the route param is `bookingNo`. Two links per row: booking no → booking, client name → `/clients/:id`. | `RentalsList.tsx:1712`, `:1748`; route map: `/rentals/:bookingNo` |
| 30 | §9.4 `Actions ▾` bulk menu — "the mutating control on this screen" | **GAP as a bulk control; a per-row equivalent exists** | No bulk menu and no selection. There **is** a per-row `⋮` (`RowOperations`) opening Open Booking + the four `OPERATIONS` verbs, with disallowed entries visible-and-greyed carrying the reason. It mutates nothing itself — every entry is a `<Link>` into a workspace route. | `RentalsList.tsx:366-464`, `:424-459`; `src/data/booking.ts` `OPERATIONS` |
| 31 | §9.4 `Columns` menu | **CONFIRMED** | `ColumnMenu` really hides columns; the offerable set is `Items · Pickup · Return · Deposit`, with `Deposit` stripped for money-blind roles before render. State is component-local (`useState`), so it does **not** survive a refresh. | `RentalsList.tsx:471-524`, `:664`, `:838` |
| 32 | §9.4 `Export` = CSV of the current filter set | **GAP** | Button drawn, `disabled`, no handler, no pipeline. | `RentalsList.tsx:1143-1147` |
| 33 | §9.4 tabs `All / Upcoming / Late / With shortage` as saved views | **GAP** | We have no tabs (removed 12 Aug with Productions) and no saved views — `Save View` and `Save as new filter` are both `disabled` with reasons. What we have instead is 12 quick-filter chips (one permanently disabled) + 6 stage chips + a Sub-Rental chip, all encoded in the query string. | `RentalsList.tsx:59-87` (header note), `:1473-1477`, `:1111-1115`; `src/data/rentals.ts:391-416` |
| 34 | §9.1 metric strip = **2 counts + 2 money figures** (`Revenue`, `Due`) | **GAP for the money half** | Ours is four counts and no money: `Active Rentals · Today Pickups · Today Returns · Overdue`. Revenue and Due are not computable — see claim 22 — and `Payment Due` / `Utilization` were deliberately deleted rather than dashed. | `RentalsList.tsx:933-938`; `src/data/rentals.ts:876-878` |
| 35 | §9.3 `[ruled]` every money tile carries a one-line definition on the tile | **CONFIRMED as available, vacuous here** | `Kpi` carries a `note` and all four of our tiles use it to state the card's own predicate ("On Rent now", "Past due, never returned"). But there is no money tile on this screen, so the ruling is untested here. | `RentalsList.tsx:933-938`; `src/components/ui/Page.tsx` `Kpi` |
| 36 | §9.1 columns `# · Customer · Status · From · Until · Price · Payment status`, `Tags` hidden by default | **Layer A — trusted, not adopted** | Ours: `Booking · Client / Project · Items · Pickup · Return · Status · Deposit`. `Customer` must not be copied as a word (`CLAUDE.md` hard rule; `PLAN.md §6.1`); `Price`/`Payment status`/`Tags` have no source (claims 2, 4, 6). | `RentalsList.tsx:976-984` |
| 37 | §9.5 cross-reference "if we adopt the preview card (§4.4)" | **KNOWN-BAD inherited** | §4.4 is the section that tells builders to build on `ClickableRow`. **`ClickableRow` does not exist** — zero hits across `src/`; and `Table.tsx`'s `onRowClick` is not a substitute (no `tabIndex`, no `role`, no Enter/Space, no 44px floor, not in the barrel, Tailwind-classed). `/rentals` does not use `Table.tsx` at all — it hand-rolls its `<table>` — and its hover affordance is `IntelCard`, which is keyboard-reachable because it wraps a real `<Link>`. | grep `ClickableRow` in `src/` → 0; `RentalsList.tsx:1664-1912` (hand-rolled table), `:1704-1740` (`IntelCard` + `<Link>`) |
| 38 | §9.7's implicit "the list can show a rental price today" | **GAP, structurally** | Beyond claim 22: the live corpus has **200 bookings and 0 `booking_lines`**, so even a built total would render empty. Our `Items` column already renders `0 items` for every row for the same reason. | `select count(*) from booking_lines` → **0**; `bookings.ts:308-310` (`sumQty`) |

---

## Corrected Layer D

```
source    bookings (base table)
          + clients ( name )            embedded join, for the Client column
          + booking_lines ( id, qty )   embedded, .is('booking_lines.voided_at', null),
                                        summed to the Items column  [LIVE ROWS: 0]
          + bookings_deposit_v (id, deposit_required)   SECOND id-keyed query,
                                        only when withDeposit is set
          NOT invoices. NOT payments. NOT booking_transport. NOT booking_crew_lines.

filter    listQuery.ts chip groups actually sent:
            stage[]   — the six canonical stages, from the chip row AND the rail
                        accordion (one state, two doors), INTERSECTED with the
                        quick chip's own stage set, never replacing it
            id[]      — the derived Sub-Rental set, from subRentalBookingIds()
                        over booking_lines_v (§11.1: a booking is sub-rental if
                        any line is; never stored)
          plus presence flags (cancelled_at, actual_return_at) and ONE dateRange
          on pickup_at.
          GAP — not built: payment_status[] (no column), tag[] (no column),
          and a return-date range (ListFilters carries one dateRange).
          An empty chip array means NO CONSTRAINT, so an empty intersection is
          reported as `impossible` and the empty state renders — nothing is sent.

order     pickup_at ASC, server-side, defaulted in listBookings; some chips
          override (Returning → return_at ASC). Tiebreak `id`.
          GAP — not built: any user-facing sort. No sortable header exists.

scope     DEFAULT EXCLUDES CANCELLED, as a base presence predicate
          (`LIVE_ONLY = { cancelled_at: false }`), spread into every chip's
          filter set — not as a chip value. The `Cancelled` chip is the opt-in.
          Live: this removes 60 of 200 bookings.
          "Archived" has no counterpart in our model; `Closed` is a stage and is
          NOT excluded.

window    server-side paging, page size 20 (choices 5/10/20/50) via ?per=,
          `withCount: 'exact'` so "Showing X to Y of Z" counts the whole match.
          Page clamps down when a narrowed count lands.
          GAP — not built: row selection, select-all, bulk actions.

money     ONE money figure on the row: Deposit (`deposit_required`).
          Read path: bookings_deposit_v, definer-rights,
            WHERE auth_is_staff()
            CASE WHEN auth_can_view_money() THEN deposit_required ELSE NULL END
          Call-site gate: `withDeposit` spread only behind useCanViewMoney(), and
          the column, the chooser entry and the card block are all removed from
          the tree — omission, never a masked cell.
          GAP — not built: rental total, outstanding, Revenue tile, Due tile.
          Blocker is structural: CanonicalEngineInput types crew, transport,
          vatPercent and payments as literal `null`.

engine    lib/workflow    (STATUS_ORDER, statusToken — stage)
          lib/money       (formatMoney)
          lib/moneyVisibility (useCanViewMoney)  ← the single money gate
          lib/bs          (formatAd, getBusinessToday — real Kathmandu clock)
          lib/queries/useFilters + listQuery (the URL-as-filter-state layer)
          lib/queries/bookings (listBookings; RENTAL_KPI_FILTERS drives the strip)
          NOT lib/kpiEngine — it has zero importers anywhere in src/.

counts    GAP — not built as wired. The engine EXISTS and is tested
          (lib/queries/facetCounts.ts: countFacet, useFacetCounts; the renderer
          is FilterOptionList in FilterDrawer.tsx, exported from the barrel), and
          it implements per-group-exclusion semantics — the harder, correct ones.
          It has NO caller in src/. No screen shows an option count today.
          booking_facets(filters jsonb) does not exist in the database.
          The job is to WIRE the existing engine to /rentals, not to build one.

export    GAP — not built. lib/csv.ts exists and already has three importers
          (ReportToolbar, ImportCenter, Pulse); /rentals is not one of them. The
          Export button is `disabled` with a reason, pending two decisions in
          PLAN.md §4.22: file format, and which columns a role may export (a
          full-column CSV walks around Law 6).

Writes: NONE. This screen writes no table and calls no RPC. Its only mutating
        affordance is navigation: RowOperations links into
        /rentals/:bookingNo/{packing,handover,return,reset}, which own the writes.
Reads:  bookings (base), clients (embed), booking_lines (embed),
        booking_lines_v (sub-rental derivation), bookings_deposit_v (deposit only).
```

---

## Money and Law 6

**What is money on this screen:** exactly one figure — `Deposit`, rendered in the table cell, in the
phone card row, and in the row IntelCard's Money group. Nothing else on `/rentals` is a rupee
amount. There is no Price column, no Payment status column, no Revenue tile and no Due tile.

**Who is money-blind here:** `MONEY_BLIND` is Warehouse, Technician, Driver, Client
(`src/lib/rbac.ts`), mirroring the database's `auth_can_view_money()`, whose body is
`auth_user_role() not in ('Warehouse','Technician','Driver','Client')`. Note that `/rentals` is
**not** in `MONEY_ROUTES`, so every authenticated role reaches the route; the gating is per-figure,
not per-route.

**How the gating is done — all four layers, and they agree:**

1. **Component**: `const money = useCanViewMoney()` (`RentalsList.tsx:655`) is the single gate.
2. **Query omission**: `withDeposit` is spread conditionally (`:868`), so a money-blind session's
   SQL never names the column. `chipsFor(money)` and `filterGroupsFor(money)` strip the money chip
   and money filter groups *before* render (`:834-835`).
3. **DOM omission, not CSS**: `show('Deposit')` gates the `<th>` (`:983`), the `<td>` (`:1889`) and
   the card block (`:1558`); `Deposit` is filtered out of the column-chooser array (`:838`) so it
   cannot even be re-enabled. **"Hidden" here genuinely means not built into the DOM** — there is no
   masked cell to un-hide and no `display:none`.
4. **Database**: the figure is only reachable through `bookings_deposit_v`, verified live as
   `SELECT id, CASE WHEN auth_can_view_money() THEN deposit_required ELSE NULL END FROM bookings
   WHERE auth_is_staff()`, definer-rights (`reloptions` is NULL, so `security_invoker` is unset).

**One real crack, found at the database.** `src/lib/queries/bookings.ts:376-379` asserts that after
migration 0062 the base-table column read "42501s for every role". Column grants say otherwise:
`authenticated` has INSERT/REFERENCES/UPDATE on `bookings.deposit_required` but **no SELECT** (good),
while **`anon` still holds SELECT on it**. Row-level security is what actually stops anon —
`bookings_select` is `auth_is_staff()` and `auth_user_role()` defaults to `'Client'` — so there is no
live leak, but the defence is one layer thinner than the comment claims, and the comment should not
be quoted as proof.

**Deliberate money absences, and why they are not laziness:** `Payment Due` (chip), Revenue and Due
(tiles), and rental total / outstanding (columns) are all *unbuildable*, not merely unbuilt:
`CanonicalEngineInput` types `crew`, `transport`, `vatPercent` and `payments` as literal `null`
(`bookingQuery.ts:462,471,475,483`), and `payments_select` is `auth_is_finance_or_admin()` — narrower
than money-visibility — so summing it would report "nothing paid" to a Coordinator. Each absence
carries a written reason string on the disabled control rather than a dash.

---

## What this changes for the build

1. **Do not write `booking_facets()`. Wire `facetCounts.ts` instead.** The engine exists, is tested,
   and already implements the semantics §9.8's open decision 2 was asking about. The work on
   `/rentals` is: replace the hand-rolled `StatusFilterGroup` (`RentalsList.tsx:532-599`) with
   `FilterOptionList` from the barrel, and feed it `useFacetCounts` over the `stage` group. That is
   one group, six options, one screen — not a Postgres function.
2. **Close §9.8 open decision 1 as already-decided for deposits, and re-scope it.** List rows carry
   money today. The live question is only "should a list row carry the *rental total*", and the
   answer is blocked on the four `null`s in `CanonicalEngineInput`, not on a product preference.
3. **Do not copy the "30/page" or the sort-arrow spec.** Our paging is 20 (5/10/20/50) and our sort
   is a fixed server-side `pickup_at ASC`. If sortable headers are wanted, they are a genuinely new
   build: no header on this screen is interactive today.
4. **If bulk actions are adopted, they arrive with selection state, and "select all" must mean the
   query.** Neither exists. Design the selection and the `Actions ▾` menu together or the "select
   all 654" hazard is re-created from scratch.
5. **Stop citing "every role 42501s" for `bookings.deposit_required`.** Fix the comment at
   `bookings.ts:376-379`, and consider a `revoke select … from anon` so the grant matches the claim.
6. **The screen renders empty against live data regardless of code quality.** 200 bookings, 0
   `booking_lines` → every `Items` cell is `0 items`, every sub-rental derivation is empty, and any
   future line-derived figure is blank. That is corpus, not defect; do not "fix" it in the UI.
7. **The `Customer` vocabulary in §9.1/§9.7 is not adoptable.** `CLAUDE.md`'s hard rule and
   `PLAN.md §6.1` close it: they are clients. `clients ( name )` is the join; `Client / Project` is
   the column header.
8. **`docs/pages/07_rentals_list.md` needs a refresh, not a rewrite.** Its substance holds but two
   things have drifted: every `RentalsList.tsx` line anchor is roughly 24 lines short (it cites
   Export at `:1119`, now `:1143-1147`; `useCanViewMoney` at `:631`, now `:655`; `withDeposit` at
   `:844`, now `:868`), and its line 81 claims "the frozen operating day `2026-07-31`
   (`src/lib/bs.ts:153`)". **The code wins:** `RentalsList.tsx:55` is
   `const TODAY = getBusinessToday()`, and `bs.ts:277-279` reads the real Kathmandu clock. Its
   mock-mode finding is still correct — `bookings_deposit_v` appears in neither `VIEW_OF` nor
   `UNSERVED` in `src/lib/mock/corpus.ts`, so every Deposit cell is `—` under
   `VITE_DATA_SOURCE=mock`, even for an Owner.
9. **Flagged known-bad inheritance:** §9.5 sends builders to §4.4, which names `ClickableRow`.
   It does not exist. `/rentals` does not use `Table.tsx` either — it hand-rolls its `<table>` — so
   neither the phantom component nor `Table.tsx`'s inaccessible `onRowClick` is a model to copy
   here. §9 itself repeats **none** of the wrong law numbers; its one law citation ("Law 6" for
   money) is correct.

---

## Open questions

1. **Should the default exclusion of cancelled bookings be visible?** §9.8's open decision 3 asks
   this and it is still open for us. We *do* exclude by base predicate (claim 7), and 60 of 200 live
   bookings are cancelled — a third of the table silently absent. The footer note says "Cancelled
   bookings are retained, never deleted", which is a different sentence from "they are not in this
   list". *Settled by:* a product ruling on whether the empty state and the count line should name
   the exclusion, e.g. "140 of 200 — 60 cancelled, not shown".
2. **Is `Closed` the thing "Archived" should map to, or is Archived simply not ours?** Booqable
   excludes Archived by default; our `Closed` is a live stage shown by default. *Settled by:* a
   ruling in `PLAN.md` on whether `Closed` bookings should drop out of the default scope, which is a
   one-line change to `LIVE_ONLY`.
3. **Does the un-revoked `anon` SELECT on `bookings.deposit_required` need a migration?** Today RLS
   covers it. *Settled by:* running the base-table select as an `anon`-keyed session and confirming
   0 rows rather than a masked value — and, if a migration is wanted, an approved
   `revoke select (deposit_required) on bookings from anon`.
4. **Does the deposit figure ever actually render?** Every path was verified structurally, but never
   with a money-visible authenticated session against live data. *Settled by:* signing in as an Owner
   against the live project and reading one Deposit cell; and separately as a Warehouse user to
   confirm the `<th>` is absent from the DOM rather than empty. The MCP session cannot do this — it
   runs as `postgres` with no app identity, where `auth_user_role()` returns `'Client'`.
5. **Should the column-chooser state persist?** `hiddenCols` is `useState`, so a refresh restores
   every column while every *filter* survives in the URL (§18). Inconsistent, deliberately or not.
   *Settled by:* a ruling on whether column visibility is a filter (URL) or a preference
   (localStorage / user settings).
