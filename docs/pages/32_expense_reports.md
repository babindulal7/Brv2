# Expense Reports

Route `/reports/expenses` (`src/App.tsx:453-463`) · component `src/modules/reports/ExpenseReports.tsx` · 854 lines.

## 1. What it is

A read-only expense **report**: one hand-written array of 27 rows in `src/data/expenseReports.ts:194-750`, filtered in memory by seven controls, with every KPI, chip count, donut slice, rail figure and pager number recomputed from the filtered rows (`ExpenseReports.tsx:223-257`).

It is not the ledger. `/finance/expenses` renders `modules/finance/Expenses.tsx` over the real `expenses` table (`src/App.tsx:426-433`, `src/lib/queries/finance.ts:1057-1080`); this route touches no query module — its only data import is `../../data/expenseReports` (`ExpenseReports.tsx:17-34`). `modules/finance/Expenses.tsx:42-46` states the same split from the other side.

The page performs no write of any kind and imports nothing from `src/actions/` (imports, `ExpenseReports.tsx:1-34`).

## 2. What renders

Top to bottom at desktop:

1. **`PageHeader`** — icon `card`, title "Expenses", description "Track operating costs, control spending, and monitor company expenses." (`ExpenseReports.tsx:301-316`). Actions: `[Import]` and a primary `[+ New Expense]` (`:310-313`) — neither has an `onClick`. A comment at `:307-309` records that an Export button that also had no handler was removed and the toolbar now owns CSV.
2. **Seed-reconciliation `ErrorBanner`** — rendered only when `SEED_ERRORS.length > 0`, as a `<ul>` of failure strings (`:320-331`). See §6 for whether it fires today.
3. **Key-figures grid**, `aria-label="Key figures"`, `repeat(bandCols(4), minmax(0,1fr))` (`:333`). Four hand-rolled `KpiCard`s (`:109-174`), each an icon tile + label + figure + note + a drill-down `<Link>`:
   - **Total Expenses** = `formatMoney(totals.total)`, note "`{totals.count}` recorded this period" (`:334-342`).
   - **Budget Remaining** / **Over Budget** — label, accent and note all flip on `budget.over` (`:343-355`).
   - **Pending Approval** — a *count*, with the pending amount as its note (`:356-364`).
   - **Largest Expense** — the largest `amount` in the filtered rows, vendor as note, `—` when there are none (`:365-373`).
4. **Category chip row** — `All` plus the 11 `CATEGORIES`, each with a `CATEGORY_ICON` glyph and a count, `aria-pressed` on the selected one (`:379-417`). Counts are computed over `scoped` (every filter applied except category), the rule stated at `:210-222`.
5. **Two-track grid** `gridTemplateColumns: railGridColumns` (`:419`).
   - **Left column**
     - **`ReportToolbar`** (`:428-466`, component `src/components/ui/ReportToolbar.tsx:432-627`): a BS-above-AD period pill, a "Date range" `<select>` (All dates / Last 7 / 30 / 90 / Custom range), two `type="date"` inputs when Custom is picked, a "Branch" `<select>` (drawn only because `BRANCHES` has two entries — `ReportToolbar.tsx:575`), then this page's own children — Status, Payment Method and Vendors `<select>`s and a search box (`ExpenseReports.tsx:439-463`) — then a `[Clear]` button that appears only when something is filtered (`:465`), then right-aligned `[CSV]` and `[Print]` (`ReportToolbar.tsx:607-618`). An inverted from/to range prints a persistent inline `role="alert"` (`ReportToolbar.tsx:620-624`).
     - **`Card`** titled "`{rows.length}` expense(s)", body padding 0 (`:468`), holding a `PageBody` around a `overflow-x: auto` wrapper and a `minWidth: 940` table with ten columns — Expense ID · Date · Category · Vendor · Description · Amount (right-aligned) · Payment Method · Status · Paid By · Actions (`:472-498`). Row shape at `:690-776`: our id + "Bill {billNo}"; AD over BS; category chip + sub-category; vendor; description; amount with an "incl. VAT" sub-line when `vat !== null`; method + masked instrument; status badge from `STATUS_TOKEN`; paid-by or `—`; a link for rows carrying `link`, otherwise `—`.
     - **Pager**, drawn only when `rows.length > 0`: "Showing A to B of N", `[Previous]`, `{current} / {pageCount}`, `[Next]`, and a 10/25/50 rows-per-page `<select>` (`:500-532`).
   - **`ReflowRail width={300}`** (`:536`, component `src/components/ui/Page.tsx:349-371`) holding four cards:
     - **Expense Summary** — Total, Paid, Pending, Recurring, Reclaimable VAT rows plus a "Budget Used" percentage and a progress bar that turns `BRAND.danger` when over (`:537-563`).
     - **Top Categories** — `Donut` + `Legend` (`src/components/ui/Charts.tsx:81-151`, `:154-…`), or an `EmptyState` "Nothing to chart" when no slice has value (`:565-574`).
     - **Upcoming Payments** — the six `RECURRING` schedules, each BS · AD + expected amount, with a "View All" link (`:576-604`).
     - **Quick Actions** — a 2×1 grid of two `QUICK_ACTIONS` buttons and two `QUICK_ACTIONS_MORE` links (`:606-626`).
6. **`FooterNote`** with the extra line "Capital purchases become assets in Inventory, never expenses" (`:630`); the two standing lines come from `FOOTER_NOTE` (`src/data/nav.ts:428-432`).

**Responsive bands the file actually reads — both 768 and 1180.** Three hooks, all resolving to `useViewport()` (`src/lib/device.ts:57-79`, breakpoints `phone: 768`, `desktop: 1180` at `device.ts:43`):

- `useBandColumns()` (`ExpenseReports.tsx:179`, applied at `:333`) → `src/components/ui/Page.tsx:391-394`: the KPI grid is **2 columns below 768**, **3 between 768 and 1179**, **4 at ≥ 1180**.
- `useRailGridColumns()` (`:182`, applied at `:419`) → `Page.tsx:382-384`: `minmax(0,1fr) auto` at ≥ 1180, a single `minmax(0,1fr)` track below it.
- `ReflowRail` (`:536`) → `Page.tsx:349-371`: at ≥ 1180 it is a `Rail`/`CollapsibleAside`; below 1180 the same four cards reflow into a plain stacked column (never hidden behind a handle).

The table is **not** responsive: `useTabularLayout()` (`src/lib/device.ts:139-141`) is not imported, so below 768 the ten-column `minWidth: 940` table stays a table and scrolls sideways inside its container (`:480-481`). Nothing on the page reads `useCapability()`.

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Every table row (id, bill no, date, category, vendor, description, amount, VAT, method, status, paid-by, branch, link) | **SEED** | `EXPENSES`, 27 literal objects, `src/data/expenseReports.ts:194-750`. Amounts are written as `rupees(85000)` etc. (`money.ts:23-25`); VAT figures are typed paisa literals (`expenseReports.ts:266`, `:369`, `:430`…). |
| Card title count, pager totals | **SEED** | `rows.length` over the filtered seed array (`ExpenseReports.tsx:242-257`). |
| Total Expenses / Paid / Pending / Pending count / Reclaimable VAT / Recurring | **SEED** | `totalsOf(rows)` — one pass over rows whose status is in `RECORDED` = Pending Approval, Approved, Paid (`expenseReports.ts:127`, `:833-850`), called at `ExpenseReports.tsx:247`. |
| Budget Remaining / Over Budget / Budget Used % / the bar | **SEED** | `budgetOf(rows)` against the single constant `MONTHLY_BUDGET = rupees(1297500)` (`expenseReports.ts:760`, `:853-864`), called at `ExpenseReports.tsx:248`. No budget is stored anywhere; `finance.ts:908-909` states the `expenses` table has no budget column. |
| Largest Expense | **SEED** | `rows.reduce(...)` over the filtered rows (`ExpenseReports.tsx:250-253`). |
| Top Categories donut + legend | **SEED** | `toSlices(byCategory(rows))` (`expenseReports.ts:870-891`), called at `ExpenseReports.tsx:249`; colours from `CAT`/`catColor` (`Charts.tsx:18-31`). |
| Category chips and their counts | **SEED** | `CATEGORIES`, 11 strings (`expenseReports.ts:76-88`); counts computed at `ExpenseReports.tsx:382`. |
| Status dropdown | **SEED** | `EXPENSE_STATUSES` (`expenseReports.ts:92-99`) — a screen-local list, *not* the `expense_status` DB enum the ledger screen uses (`modules/finance/Expenses.tsx:37`). |
| Payment Method dropdown | **SEED** | `PAYMENT_METHODS`, 7 strings (`expenseReports.ts:129-137`). `finance.ts:899-903` records that `expenses` has **no method column at all**. |
| Vendors dropdown | **SEED** | de-duplicated from the seed rows (`ExpenseReports.tsx:208`); `finance.ts:1035-1039` names this as the pattern that stops working against the real table. |
| Branch dropdown | **SEED** | `BRANCHES` = "Boudha (Head Office)", "Thamel Branch" (`expenseReports.ts:146`), passed at `ExpenseReports.tsx:436`. The real column is a uuid FK (`finance.ts:1140-1151`). |
| Upcoming Payments | **SEED** | `RECURRING`, six schedules with `expected` amounts (`expenseReports.ts:779-786`). |
| Quick Actions tiles and links | **SEED** | `QUICK_ACTIONS` / `QUICK_ACTIONS_MORE` (`expenseReports.ts:1040-1046`). |
| Opening date range, the period pill | **SEED** | `SEEDED_RANGE = reportDateRange('expense_date', PERIOD.from, PERIOD.to)` (`ExpenseReports.tsx:106`) over `PERIOD` = 1–31 Jul 2026 (`expenseReports.ts:41`). |
| "Last 7/30/90 days" presets | **SEED** | Computed from `TODAY`, the fixed seeded operating day 31 Jul 2026 (`src/lib/bs.ts:153`, used at `ReportToolbar.tsx:234`), not the wall clock. |
| BS dates on rows, in the pill, in the CSV | derived at render | `toBs`/`formatBs` (`src/lib/bs.ts:93-105`). `toBs` returns `null` outside Shrawan 2083 (`bs.ts:50`, `:97`), which is why the pill can print "BS unavailable for this range" (`ReportToolbar.tsx:280`) and a row can print `—` for its BS line (`ExpenseReports.tsx:702`). |
| Seed-reconciliation banner text | **SEED** | `SEED_ERRORS`, computed at module load from the same array (`expenseReports.ts:980-1036`). |
| Anything from the database | **none** | No import from `src/lib/queries/*`, no `useList`, no `supabase` reference in the file (imports, `ExpenseReports.tsx:1-34`). |
| Under `VITE_DATA_SOURCE=mock` | **LOCAL — irrelevant here** | `expenses` is listed in `UNSERVED` (`src/lib/mock/corpus.ts:33-44`), so the table is unserved by the local store — but this page never asks the store anything, so mock mode changes nothing on it. |

Invented on this page: every figure. The 27 rows and all their amounts and VAT splits, the Rs 12,97,500 monthly budget, the six recurring schedules and their expected amounts, the two branch names, the 11 categories, the 7 payment methods and the 1–31 Jul 2026 period are all literals in `src/data/expenseReports.ts`; four of them (payment method, VAT, vendor bill number, budget) have no column in the real `expenses` table at all (`src/lib/queries/finance.ts:894-909`).

## 4. Actions and writes

**No dispatch of any kind occurs on this page.** `src/modules/reports/ExpenseReports.tsx` imports nothing from `src/actions/`, calls no `createAction` result, and names no capability string (imports, `:1-34`). `checkCapability` (`src/actions/core.ts:124-218`) is therefore never reached from this route, and no capability on this page needs a case in that switch. There is no expense action anywhere under `src/actions/` — `src/actions/finance/` contains only `recordPayment.ts`.

Nothing on the page mutates anything outside React state. The controls that do work:

| Control | What it actually does |
|---|---|
| Category chips | `setCategory` + `setPage(1)` (`:387-390`) |
| Status / Payment Method / Vendors selects | `Sel`'s `onChange` → `setStatus`/`setMethod`/`setVendor` + `setPage(1)` (`:439-441`, `:660-676`) |
| Search box | `setQuery` + `setPage(1)`; matches id, vendor, description, category, bill no (`:443-448`, `:231-238`) |
| Date range / custom dates / Branch | `ReportToolbar` → `setReport` + `setPage(1)` (`:431-434`); range applied at `:230` via `withinReportRange` (`ReportToolbar.tsx:207-213`), branch at `:229` |
| `[Clear]` | `clearAll` — resets all six filters and the range back to `SEEDED_RANGE` (`:263-271`) |
| `[Previous]` / `[Next]` / rows-per-page | `setPage` / `setPerPage` (`:506-529`) |
| `[CSV]` | Real: `exportCsv` builds the file from `expensesCsv(rows)` (`:437`, `:793-839`) through `buildReportCsv` and downloads it via a Blob anchor (`ReportToolbar.tsx:502-516`, `:300-341`, `:353-361`) |
| `[Print]` | `window.print()` (`ReportToolbar.tsx:615`) |

Buttons and links with **no handler or no destination**:

- `[Import]` — `<Button icon="upload">` with no `onClick` (`:310`).
- `[+ New Expense]` — `<Button icon="plus" variant="primary">` with no `onClick` (`:311-313`).
- Both **Quick Actions** tiles ("New Expense", "Import") — `<button type="button" className="lift">` with no `onClick` (`:609-612`).
- All four **KPI drill-down links** — "View Detailed Report", "View Budget", "View Pending", "View Expense" — every one has `to="/reports/expenses"`, the route already being viewed (`:340`, `:353`, `:362`, `:371`).
- **"View All"** on Upcoming Payments and **"Recurring Expenses"** in Quick Actions both link to `/automation` (`:579`, `:619`), which has no `<Route>` in `src/App.tsx` and is not in `NAV`, so both land on the catch-all 404 (`src/App.tsx:715-741`; `/automation` is asserted removed in `src/modules/settings/__tests__/settingsSections.test.ts:134`).

## 5. Gates

**Reaching the route.** `/reports/expenses` mounts inside `Shell` (`src/App.tsx:453-463`). `Shell` redirects an unauthenticated session to `/login` (`:973-975`), then computes `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`:993`). `MONEY_ROUTES` contains the `/reports` prefix (`src/data/nav.ts:147-153`, matcher at `:156-159`), so the whole report module is a money surface. Money-blind roles are **Warehouse, Technician, Driver, Client** (`src/lib/rbac.ts:36-50`); each gets the shell's own `RestrictedState` and never reaches this component (`src/App.tsx:1020-1023`). Reaching roles: **Owner, Admin, Manager, Coordinator, Accounts**.

**Money visibility inside the page.** `useCanViewMoney()` at `:184` → `src/lib/moneyVisibility.ts:24-27` → `canViewMoney` (`rbac.ts:36-38`). When false the component returns early at `:279-297`: header, a `PageBody restricted`, and the footer — and nothing else. Law 6 here is total rather than per-figure: the toolbar, the CSV button, the chips, the table and the rail are never mounted, so the rows never enter the DOM (the reasoning is stated at `:273-278`, and asserted in `src/modules/reports/__tests__/ExpenseReports.toolbar.test.tsx:148-160`).

Because the shell guard fires first for exactly the same role set, this in-page branch is defence in depth: in the running app it is unreachable, and only a test that mocks `lib/auth` (as `ExpenseReports.toolbar.test.tsx:53-55` does) renders it.

**Hidden under Law 6:** the entire page. There is no money-free variant — every KPI, the Amount column, the VAT sub-line, the donut and all five rail summary rows are amounts.

## 6. States drawn

- **Loading — none.** No async source exists, and `PageBody` is mounted without a `loading` prop (`:472-479`), so its skeleton branch (`PageBody.tsx:182-184`) is unreachable here.
- **Error — hand-rolled, and conditional on the seed.** `ErrorBanner` from `StateViews` (`:320-331`, component `StateViews.tsx:171-210`), driven by `SEED_ERRORS`. `PageBody`'s own `error` prop is never passed. `SEED_ERRORS` runs four assertion families at module load — Total = Paid + Pending, the last `MONTHLY_HISTORY` point equals the derived total, per-row VAT = 13% of the VAT-inclusive amount with a vendor PAN present, unique ids, and no vendor bill wearing the `INV` prefix (`expenseReports.ts:980-1036`, `wearsPrefixOf` at `src/data/numbering.ts:506-509`). With the array as committed all of them pass (Paid = Rs 4,96,000, Pending = Rs 86,500, total Rs 5,82,500, matching `MONTHLY_HISTORY`'s July entry at `expenseReports.ts:808`), so the banner does not render today.
- **Empty — via `PageBody`**, with the two questions split: `emptyIsFiltered` picks between "No expenses match these filters" + a working `[Clear filters]` button and "No expenses recorded" with no action (`:472-479`, `PageBody.tsx:186-204`). A second, hand-rolled `EmptyState` covers the donut card alone (`:566-567`).
- **Restricted — via `PageBody`** (`:287-293` → `RestrictedState`, `StateViews.tsx:213-280`), with a reason and a `requiredRole` chip.
- Plus one state neither component owns: the toolbar's inverted-date-range `role="alert"` line (`ReportToolbar.tsx:620-624`).

## 7. Known gaps

1. **No `TODO(decision)` marker in this file** — `grep TODO src/modules/reports/ExpenseReports.tsx` returns nothing. But `src/data/expenseReports.ts:762-764` says of `CAPITAL_THRESHOLD` / `APPROVAL_THRESHOLD` (both `null`) "see the page's TODO", and the page carries no such TODO. The two thresholds are dead constants and the decision is recorded nowhere on this screen.
2. **Three primary controls are dead.** `[Import]` (`:310`), `[+ New Expense]` (`:311-313`) and both Quick Actions tiles (`:609-612`) render with no `onClick`. Nothing on screen distinguishes them from the working buttons beside them.
3. **All four KPI links point at the current route** (`:340`, `:353`, `:362`, `:371`) — "View Budget" and "View Pending" re-render the page unchanged.
4. **Two links lead to a 404.** `/automation` (`:579`, `:619`) has no route in `src/App.tsx` and is absent from `NAV`, so both fall to the catch-all (`App.tsx:715-741`).
5. **The `Maintenance` row link goes to the inventory list.** The ternary at `:765` handles `Booking` → `/rentals/{id}` and `Case` → `/operations?queue=cases`; `Maintenance` and `Sub-Rental` fall through to `/inventory`, so `MT-2026-0114` (`expenseReports.ts:274`) opens a list, not the maintenance record it names.
6. **The restricted copy omits Manager.** `:289-290` says "Ask an Owner, Admin, Coordinator or Accounts user" and `requiredRole="Owner, Admin, Coordinator or Accounts"`, but `canViewMoney` admits **Manager** as well (`rbac.ts:36-50` — money-blind is Warehouse/Technician/Driver/Client). A Manager is told to ask someone with rights they already have.
7. **Largest Expense counts rows every other figure excludes.** `:250-253` reduces over all filtered rows, including `Draft`, `Rejected` and `Cancelled`, while `totalsOf` restricts to `RECORDED` (`expenseReports.ts:127`, `:834`). With today's seed the largest row is a Paid one so the discrepancy is invisible; a larger Draft would put a figure in the KPI strip that is in no total on the page.
8. **Budget Used is filter-sensitive against a fixed month budget.** `budgetOf(rows)` divides the *filtered* rows by the whole-month `MONTHLY_BUDGET` (`:248`, `expenseReports.ts:853-864`), so selecting one category or one branch reports that share of the month's budget as "Budget Used %" and inflates "Budget Remaining" — the label does not say which rows it counted.
9. **`rangeNarrowed` is true for a wider range too.** `:259-260` compares the range to `SEEDED_RANGE` by inequality, so switching the preset to "All dates" — which widens the window — puts the page into the "filtered" branch and shows `[Clear]` (`:261-262`, `:465`).
10. **The table does not adapt below 768.** `minWidth: 940` inside an `overflow-x` wrapper (`:480-481`) with no `useTabularLayout()` branch, which `src/lib/device.ts:136-141` describes as "not a table — a horizontal scrollbar hiding the columns that matter". The sibling ledger screen does branch (`modules/finance/Expenses.tsx:921`).
11. **CSV money is text, not numbers.** `expensesCsv` writes `formatMoney(...)` into the Amount and VAT cells (`:826`, `:828`), so `Rs 85,000` cannot be summed in a spreadsheet. The file states the trade and refuses to decide it (`:789-791`).
12. **A large part of the seed module is unreachable from any screen.** `MONTHLY_HISTORY` (`expenseReports.ts:796-809`), `ageing` (`:905`), `cumulativeTrend` (`:924`), `byMethod`/`byBranch`/`byVendor`/`byStatus` (`:892-902`), `lakh`/`lakhTicks` (`:961-971`), `duplicateOf` (`:948-958`), `STATUS_RULE` (`:113-120`), `DEPARTMENTS`/`PROJECTS` (`:150-151`) and both thresholds have no importer anywhere in `src/` (only `PERIOD_CHIPS` is used elsewhere, by `modules/reports/ProductReports.tsx:8`). So the ageing donut, the Budget-vs-Actual chart, the cumulative trend and the duplicate warning exist as data and are drawn nowhere.
13. **`STATUS_RULE` promises row actions the table does not draw.** The seed defines Edit/Submit/Discard/Pay/Reverse/Withdraw per status (`expenseReports.ts:113-120`); the table's "Actions" column renders only a cross-reference link or a dash (`:759-773`). No expense can be approved, paid, reversed or discarded from this screen.
14. **The seed contains the duplicate its own rule exists to catch.** `EXP-2026-0705` and `EXP-2026-0698` share vendor "Photo Concern", bill `4417` and amount Rs 3,500 (`expenseReports.ts:566-584`, `:730-749`) — exactly `duplicateOf`'s first clause (`:948-958`) — and the page never calls it, so nothing is flagged.
15. **Two Expenses screens disagree about what an expense is.** This one filters on payment method (`:227`), prints reclaimable VAT (`:729-731`), a vendor bill number (`:698`) and a budget (`:343-355`); `src/lib/queries/finance.ts:894-909` records that the real table has a column for none of the four, and `modules/finance/Expenses.tsx:55-61` deliberately refuses to import any of this file's constants. The category vocabularies also differ — 11 names here (`expenseReports.ts:76-88`) against the five `expense_categories` codes `EXP-FUEL`…`EXP-MISC` in the local store (`src/lib/mock/corpus.ts:112-120`) — as do the branch names ("Boudha (Head Office)" / "Thamel Branch" here vs "Kathmandu Main" at `corpus.ts:68-70`).
16. **Inherited `TODO(decision)` markers reachable from this page's dependencies:** BS month / quarter / fiscal-year range presets, so the toolbar offers rolling day windows only (`src/components/ui/ReportToolbar.tsx:75-78`); and what a refresh-in-progress looks like over rows already on screen (`src/components/ui/PageBody.tsx:55-57`) — inert here, since nothing refreshes.
17. **The file's header cites spec documents for its rules** (`:36-59`) — render deviations, `§2.1`, `§2.3`, `§4.2`. Those are claims about intent; everything recorded above is what the committed code does.
