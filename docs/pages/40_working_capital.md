# Working Capital

Route `/reports/working-capital` · `src/modules/reports/WorkingCapitalReport.tsx` · 477 lines

Status: **Seed-only**

---

## 1. What it is

A read-only balance-sheet report: a recommendation card, five key-figure tiles, a position table
(assets → liabilities → working capital) and a Liquidity rail. Every figure is read from constant
arrays and derivation functions in `src/data/liquidityReports.ts:143-251`; the file imports no query
module and no action (`WorkingCapitalReport.tsx:1-30`).

Three derived figures — working capital, current ratio, free cash — are deliberately withheld and
render the string `Not tracked yet` (`WorkingCapitalReport.tsx:85`), because the Trade payables line
carries `amount: null` (`liquidityReports.ts:147-152`) and every derivation gates on
`LIABILITIES_ARE_COMPLETE` (`liquidityReports.ts:169`, consumed at `:202-239`).

The whole screen is behind money visibility (`WorkingCapitalReport.tsx:159`, `:163`), and the route
is additionally behind the Shell's money-surface guard (`src/App.tsx:993`).

---

## 2. What renders

Top to bottom at desktop:

| # | Element | Lines |
|---|---|---|
| 1 | `PageHeader` — no icon, title "Working Capital", description `${asAt} · NPR · 3 min read` | `WorkingCapitalReport.tsx:262` |
| 2 | `ReportToolbar` — renders only the **CSV** and **Print** buttons | `WorkingCapitalReport.tsx:269-275` |
| 3 | `Card` "This balance sheet is incomplete" — two paragraphs naming the untracked liability and stating the ceiling. Rendered only while `!LIABILITIES_ARE_COMPLETE`, which is `false` today | `WorkingCapitalReport.tsx:283-299` |
| 4 | Untitled `Card` — "Recommendation." paragraph, a five-item `<ul>`, then a "Business impact." paragraph | `WorkingCapitalReport.tsx:301-363` |
| 5 | `KpiStrip columns={5}` — Working capital · Current ratio · Cash conversion cycle · Free cash · Tied in receivables | `WorkingCapitalReport.tsx:189-258`, rendered `:365-367` |
| 6 | Grid `content \| rail`: `Card` "The position · ${asAt}" holding a 4-column table (Line · Nature · NPR · Share) — asset rows, a **Current assets** subtotal, liability rows, a **Current liabilities · tracked only** subtotal, then a rule-topped **Working capital** row | `WorkingCapitalReport.tsx:369-449` |
| 7 | `ReflowRail width={300}` → `Card` "Liquidity" with four `SummaryRows`: Free cash · Held in trust · Per day of cycle · Upside at 20 days | `WorkingCapitalReport.tsx:451-464` |
| 8 | `FooterNote` — the two standing notes (`src/data/nav.ts:428-432`) plus two page extras | `WorkingCapitalReport.tsx:467-474` |

`asAt` is built at `WorkingCapitalReport.tsx:178-179` from `PERIOD_END = 2026-08-15 UTC`
(`liquidityReports.ts:30`). `toBs` (`src/lib/bs.ts:93-99`) can vouch for that day — it is offset 30
from the 16 Jul 2026 anchor and Shrawan 2083 has 32 days (`bs.ts:42-50`) — so the header reads
**"As at 15 Aug 2026 (31 Shrawan 2083 BS)"** rather than falling back to the AD-only branch.

The toolbar draws no date picker, no branch select and no compare select. `ReportToolbar` renders a
control only when the page passes the matching capability prop (`ReportToolbar.tsx:520`, `:575`,
`:595`), and this page passes only `title`, `value` and `csv` (`WorkingCapitalReport.tsx:270-274`).
The `value.dateRange` it does pass therefore reaches only the CSV filename
(`ReportToolbar.tsx:344-351`) and the CSV's "Period" header line (`ReportToolbar.tsx:330`).

### Responsive bands

The file reads **neither breakpoint directly** — it imports nothing from `src/lib/device.ts` and
names no pixel threshold. Both bands reach it through shared components, all resolving through
`useViewport()` (`device.ts:57-79`) over `BREAKPOINT = { phone: 768, desktop: 1180 }`
(`device.ts:43`):

- **1180** — `useRailGridColumns()` (`WorkingCapitalReport.tsx:158`, defined `Page.tsx:382-384`)
  returns `minmax(0,1fr) auto` at desktop and `minmax(0,1fr)` below, applied to the grid at
  `WorkingCapitalReport.tsx:369`. Its partner `ReflowRail` (`Page.tsx:349-371`) returns
  `Rail` → `CollapsibleAside` at desktop (`Page.tsx:361-366`) and a plain flex column below
  (`Page.tsx:368-370`). So below 1180 the Liquidity card drops under the position table full-width;
  at ≥1180 it is a 300px aside that `CollapsibleAside` can collapse to a 44px sticky handle
  (`CollapsibleAside.tsx:37`, `:41-56`).
- **768 and 1180** — `KpiStrip` (`Page.tsx:203-212`) clamps the requested `columns={5}` to
  **2 tiles at phone, 3 at tablet, 5 at desktop**.
- Shell-level: below 768 `Sidebar` is replaced by `BottomBar` and the main pad reserves `BAR_BOX`
  (`App.tsx:957-958`, `:1004`, `:1017`, `:1033`).

There is **no phone treatment for the position table**: `useTabularLayout()` (`device.ts:139-141`)
is not imported, the `<table>` carries no `minWidth` and sits in no `overflow-x` wrapper
(`WorkingCapitalReport.tsx:371`), so four columns squeeze rather than reflow below 768.

---

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Position table — asset rows (Cash at bank, Cash in hand, Trade receivables) | SEED | `POSITION` — `src/data/liquidityReports.ts:143-146`; filtered at `WorkingCapitalReport.tsx:181`, mapped `:381-390` |
| Position table — liability rows (Trade payables, Deposits refundable) | SEED | `POSITION` — `liquidityReports.ts:147-153`; filtered `WorkingCapitalReport.tsx:182`, mapped `:397-416`. Trade payables is `amount: null` and prints `Not tracked yet` (`:412`) |
| Current assets subtotal · Share column | SEED | `currentAssets()` / `sumSide()` — `liquidityReports.ts:177-183`; `shareOf` at `WorkingCapitalReport.tsx:183` |
| Current liabilities (tracked only) subtotal | SEED | `currentLiabilities()` — `liquidityReports.ts:189`; label branches on `LIABILITIES_ARE_COMPLETE` at `WorkingCapitalReport.tsx:419-422` |
| Working capital row + KPI + ceiling wording | SEED | `workingCapital()` returns `null` (`liquidityReports.ts:202-205`); `workingCapitalCeiling()` (`:208-209`) supplies the "At most" text (`WorkingCapitalReport.tsx:432`, `:294`) |
| Current ratio KPI and bullet | SEED | `currentRatio()` returns `null` (`liquidityReports.ts:218-221`); rendered `WorkingCapitalReport.tsx:206-221`, `:329-336` |
| Cash conversion cycle KPI + bullets | SEED | `CASH_CONVERSION_DAYS = 28`, `CASH_CONVERSION_DAYS_PRIOR = 25` — `liquidityReports.ts:173-174`; rendered `WorkingCapitalReport.tsx:222-234`, `:338-342` |
| Free cash KPI, bullet, rail row | SEED | `freeCash()` / `freeCashMonths()` return `null` (`liquidityReports.ts:231-239`); rendered `WorkingCapitalReport.tsx:235-249`, `:347-355`, `:455-457` |
| Tied in receivables KPI, "4 clients owing", receivable share | SEED | `receivables()` (`liquidityReports.ts:191-192`, reading the `POSITION` row at `:146`), `receivableShare()` (`:241-242`); the client count is a literal in the note string (`WorkingCapitalReport.tsx:256`) and in the row's `nature` (`liquidityReports.ts:146`) |
| Held in trust (deposits) — recommendation, bullet, rail | SEED | `DEPOSITS_HELD = rupees(25_000)` — `liquidityReports.ts:59`; rendered `WorkingCapitalReport.tsx:316`, `:344`, `:458` |
| Overdue figure | SEED | `OVERDUE = rupees(36_400)` — `liquidityReports.ts:251`; rendered `WorkingCapitalReport.tsx:256`, `:317` |
| Per day of cycle · Upside at 20 days | SEED | `cashPerDayOfCycle()` / `cycleUpside()` — `liquidityReports.ts:245-249`; rendered `WorkingCapitalReport.tsx:360-361`, `:459-460` |
| "Rs 62,000 vs last month" delta · "healthy above 1.5" delta | SEED | String literals in the KPI objects — `WorkingCapitalReport.tsx:203`, `:219`. No prior-period source exists in `liquidityReports.ts` for either |
| Period / "As at" line | SEED | `PERIOD_END` — `liquidityReports.ts:30`; formatted `WorkingCapitalReport.tsx:178-179` |
| CSV export body | SEED | Same constants re-serialised in `workingCapitalCsv()` — `WorkingCapitalReport.tsx:119-153` |
| Money-gate decision (whether the body renders at all) | DB | Session role from `users.primary_role`, read by `useAuth` and consumed via `useCanViewMoney()` — `src/lib/moneyVisibility.ts:24-27` |

No DB table, view or RPC supplies any figure on this page.

**LOCAL: nothing, and the concept is absent from the store.** `src/lib/mock/corpus.ts` builds a
17-key store (`corpus.ts:405-426`) and names its 10 known-absent tables (`corpus.ts:33-44`). Neither
list contains a balance-sheet, general-ledger, cash-position or supplier-invoice table. The only
liability-shaped table it does serve is `security_deposits` (`corpus.ts:374-388`, `:421`), which is
**not** the source of this page's `DEPOSITS_HELD` — that is the constant at `liquidityReports.ts:59`.
Trade payables has no table anywhere: `as_at`, `bills`, `supplier_invoices` and `accounts_payable`
return nothing under `supabase/`, which is what `liquidityReports.ts:120-142` and
`catalog.ts:406-407` both record.

Invented on this page: Cash at bank Rs 3,98,000, Cash in hand Rs 25,000, Trade receivables
Rs 1,55,000 and its "4 clients owing", Deposits refundable / held in trust Rs 25,000, Overdue
Rs 36,400, the 28-day and 25-day cash conversion cycles, the monthly operating burn Rs 1,35,000
behind free-cash cover (`liquidityReports.ts:62`), the "Rs 62,000 vs last month" and "healthy above
1.5" delta strings, and every figure derived from those — current assets Rs 5,78,000, tracked
liabilities Rs 25,000, the Rs 5,53,000 ceiling, the 27% receivable share, Rs 5,535.71 released per
day of cycle and the Rs 44,285.68 upside at 20 days. The three figures the page refuses to state
(working capital, current ratio, free cash) are the only ones on the screen that are not invented.

---

## 4. Actions and writes

**No dispatches.** The file imports nothing from `src/actions/` (`WorkingCapitalReport.tsx:1-30`),
so `createAction` and `checkCapability` (`src/actions/core.ts:220-254`, `:124-218`) are never
reached from this screen and there is no capability string to map. (`money.view` *is* mapped at
`core.ts:140-141`, but this page calls `useCanViewMoney()` directly rather than dispatching it.)

The page writes nothing. Its two controls both belong to the shared toolbar:

| Control | Handler | Effect |
|---|---|---|
| **CSV** | `exportCsv` — `ReportToolbar.tsx:609`, `:502-516` | Builds the provenance header (`:300-341`) plus `workingCapitalCsv()`'s body (`WorkingCapitalReport.tsx:119-153`), quotes through `csvCell`, downloads `working-capital-2026-08-15-to-2026-08-15.csv` via a Blob anchor (`ReportToolbar.tsx:344-361`). No write, no network. |
| **Print** | `ReportToolbar.tsx:615-617` | `window.print()`. |

Buttons with no handler: **none on this page.** The only other clickable element is the rail's
collapse/expand handle at ≥1180 (`CollapsibleAside.tsx:41-97`), which toggles a localStorage flag.

The CSV spec omits `generatedBy` (`WorkingCapitalReport.tsx:273`), so the export carries no
"Generated by" line (`ReportToolbar.tsx:334`). Untracked lines export the words `Not tracked yet`
rather than a blank or a zero (`WorkingCapitalReport.tsx:125-126`).

---

## 5. Gates

**Route guard (App.tsx).** Mounted at `App.tsx:528-535` inside `Shell`. `Shell` holds while auth
resolves (`App.tsx:964-970`), redirects to `/login` with no session (`:973-975`), then computes
`isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`:993`). `/reports` is a
money-surface prefix (`src/data/nav.ts:147-153`, matched at `nav.ts:156-159`), so
`/reports/working-capital` matches and a money-blind role gets the Shell's own `RestrictedState`
(`App.tsx:1020-1023`) — this component is never mounted.

**Money visibility (Law 6).** `MONEY_BLIND = { Warehouse, Technician, Driver, Client }`
(`src/lib/rbac.ts:45-50`); `canViewMoney` is `!MONEY_BLIND.has(role)` (`rbac.ts:36-38`);
`useCanViewMoney()` returns `false` for any absent session (`moneyVisibility.ts:24-27`).

| Role | Reaches the report body? |
|---|---|
| Owner, Admin, Manager, Coordinator, Accounts | Yes |
| Warehouse, Technician, Driver, Client | No — stopped at `App.tsx:993`; the page's own gate at `WorkingCapitalReport.tsx:163` would stop them again |

**What is hidden under Law 6: the entire page**, including the "This balance sheet is incomplete"
disclosure and the cash-conversion-cycle KPI, which carries no rupees. The component returns the
header plus a `PageBody restricted` and nothing else (`WorkingCapitalReport.tsx:163-176`).

**Reachability.** Reports is not in `NAV` (`nav.ts:132-136`), so there is no sidebar entry. The only
in-app link is Pulse's "Other reports" card, and only on its money branch
(`src/modules/reports/Pulse.tsx:1179-1182`). The Finance ▸ Reports tab renders `ReportCatalog`
(`src/modules/finance/Finance.tsx:1042`) off the register in `catalog.ts`, which has **no Working
Capital entry** — see §7.

---

## 6. States drawn

| State | Present? | How |
|---|---|---|
| Loading | **No** in the page. The only spinner is `Shell`'s `Suspense` fallback for the lazy chunk (`App.tsx:1026`); constants need no load. |
| Error | **No** in the page. `ErrorBoundary` at `App.tsx:1025` is the only backstop. |
| Empty | **No.** `POSITION` always has five rows (`liquidityReports.ts:143-154`) and no `empty` branch exists. The nearest thing is the `Not tracked yet` string, which is a *withheld figure*, not an empty state. |
| Restricted | **Yes, via `PageBody`** — `WorkingCapitalReport.tsx:167-171` passes `restricted`, `restrictedReason` and `restrictedRequiredRole`; `PageBody` short-circuits to `RestrictedState` (`PageBody.tsx:143-150`, `StateViews.tsx:213-280`). Children are `null` (`WorkingCapitalReport.tsx:172`). |

`PageBody` is imported and used **only** inside the restricted branch; the happy path never renders
through it (`WorkingCapitalReport.tsx:260-475`).

---

## 7. Known gaps

1. **No `TODO(decision)` markers in this file.** Zero matches for `TODO(decision)` in
   `WorkingCapitalReport.tsx`. The nearest open decision reachable from here is `ReportToolbar`'s BS
   month/quarter/fiscal-year presets (`ReportToolbar.tsx:72-75`), which this page does not use.
2. **`--text-1`, `--text-2`, `--text-3` and `--fs-meta` are not defined anywhere.**
   `src/styles/theme.css` is the app's only loaded stylesheet (`src/main.tsx:41`); it defines
   `--text`, `--text2`, `--muted` (`theme.css:82`, `:214`) and `--fs-body: 16px` (`:338`), but no
   `--text-1/-2/-3` and no `--fs-meta`. These four tokens appear only in this file and
   `CashFlowReport.tsx`. Every declaration using them is invalid at computed-value time and inherits
   instead. Affected here: the table header row (`WorkingCapitalReport.tsx:99-106`), the Nature
   column (`:384`, `:400`, `:421`, `:431`), the Share column (`:388`), the incomplete-balance-sheet
   second paragraph (`:292`), the Business-impact paragraph (`:358-359`), and — the one that
   matters — **the muted grey the file uses to strip a figure's "this is a number" grammar from an
   untracked line** (`:385`, `:408`, `:440`, argued at `:401-404`). The parentheses and the danger
   tone are correctly dropped; the substitute grey is not applied.
3. **The restricted copy names the wrong role set.** `restrictedRequiredRole="Owner, Admin,
   Coordinator or Accounts"` (`WorkingCapitalReport.tsx:170`) omits **Manager**, who passes both
   gates (`rbac.ts:45-50` — Manager is not in `MONEY_BLIND`). Identical defect to
   `docs/pages/38_forecasting.md` §7.7.
4. **The page's own restricted state is unreachable through the router.** `Shell` renders its own
   `RestrictedState` *instead of* `children` for a money-blind role (`App.tsx:993`, `:1020-1023`),
   so `WorkingCapitalReport.tsx:163-176` — the branch carrying the better copy, with the reason and
   the "Requires" chip — never runs for the roles it was written for.
5. **This built report is missing from the report register.** `catalog.ts` lists every report with a
   `key`/`route` (`catalog.ts:227-500`); Cash Flow is there at `:239` with
   `route: '/reports/cash-flow'`, and there is **no Working Capital entry at all** — the string
   "Working Capital" appears in that file only inside the Payables `needs` sentence (`:407`). So
   Finance ▸ Reports (`Finance.tsx:1042` → `ReportCatalog.tsx:120`) cannot link to it, and
   `App.tsx:784` lists the route as BUILT while the register does not know it exists.
6. **The page states a receivables figure the register says nobody may state.** `catalog.ts:388-397`
   gives Receivables `route: null` and the reason *"A figure here is one the database cannot
   defend."* This page prints Rs 1,55,000 tied in receivables and Rs 36,400 overdue as fact
   (`WorkingCapitalReport.tsx:251-257`, `:317`) from `liquidityReports.ts:146` and `:251`. It is the
   same shape as the payables fabrication the file's own header was written about
   (`WorkingCapitalReport.tsx:54-72`), one line up the same table.
7. **The same two business figures have a second, different source elsewhere.** `Finance.tsx:553`
   computes `receivableTotal` by summing `outstandingAmount` over the live/mock `invoices` query and
   renders it as "Receivable (outstanding)" (`Finance.tsx:834`); `:554` does the same for overdue.
   Those are queried; this page's are constants. Two screens, one figure, two sources — they can
   only agree by coincidence.
8. **The balance sheet is dated two weeks after the app's operating day.** `PERIOD_END` is
   15 Aug 2026 (`liquidityReports.ts:30`) while the app's single `TODAY` is 31 Jul 2026
   (`src/lib/bs.ts:153`), the day every other screen's countdowns and presets resolve against.
9. **`'as_at'` is an invented column name.** `reportDateRange('as_at', …)`
   (`WorkingCapitalReport.tsx:272`) — the string appears nowhere else in `src/` or `supabase/`. It is
   inert today because no query consumes the filter, but it is the column a wired version would ask
   Postgres for.
10. **Two KPI deltas are literals with no source.** `delta: { text: 'Rs 62,000 vs last month' }`
    (`WorkingCapitalReport.tsx:203`) and `'healthy above 1.5'` (`:219`) sit on the
    `LIABILITIES_ARE_COMPLETE` branches. `liquidityReports.ts` holds no prior-period balance sheet,
    so the moment payables are recorded and those branches light up, the page asserts a
    month-on-month movement nothing computed. The cash-conversion delta beside them **is** derived
    (`:230`), which makes the two literals harder to spot.
11. **Free cash quotes a months-of-cover figure at two decimals.** `freeCashMonths()` rounds to
    1/100 (`liquidityReports.ts:236-239`) and is printed raw at `WorkingCapitalReport.tsx:248` and
    `:352`; every other cover/runway figure in the sibling report rounds to one decimal
    (`runwayMonths()`, `liquidityReports.ts:87-88`). Currently masked because the value is `null`.
12. **False precision in the rail.** `cashPerDayOfCycle()` is an integer-paisa division
    (`liquidityReports.ts:245-246`), so "about" Rs 5,535.71 per day and a Rs 44,285.68 upside render
    to the paisa (`WorkingCapitalReport.tsx:360-361`, `:459-460`) beside prose that calls them
    approximations.
13. **No sub-768 table treatment.** `useTabularLayout()` (`device.ts:139-141`) exists for exactly
    this and is not imported; the 4-column position table stays a table at phone width with no
    `overflow-x` wrapper (`WorkingCapitalReport.tsx:371`).
14. **A dead computation in the toolbar for this page.** `periodLines(value.dateRange)` runs on
    every render (`ReportToolbar.tsx:447`) but is only rendered inside the `dateColumn && onChange`
    block (`:520-543`), which this page does not satisfy. The page's own comment
    (`WorkingCapitalReport.tsx:264-268`) credits the omitted `onChange` alone; `dateColumn` is also
    absent, and either one suppresses the control.
15. **The disclosure card and the recommendation card overlap heavily.** `:283-299` and `:310-315`
    state the same gap in the same words two cards apart; nothing suppresses the second when the
    first is showing.
