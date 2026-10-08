# Pulse

Route `/reports/pulse` (`src/App.tsx:444-451`) · component `src/modules/reports/Pulse.tsx` · 1309 lines.
Lazy-loaded (`src/App.tsx:33`), wrapped in `Shell` with crumbs Finance ▸ Reports ▸ Pulse (`src/App.tsx:447`).

## 1. What it is

A single-period business dashboard: four KPI cards, one chart with four views, a fleet table, an
upcoming-money table, and a four-card rail (`src/modules/reports/Pulse.tsx:742-1211`).

Every figure on it is a grouping of one generated daily ledger in `src/data/pulse.ts:260-304`; the
component itself computes no business metric — it picks a period and calls `figuresFor(from, to)`
(`src/modules/reports/Pulse.tsx:334`, `src/data/pulse.ts:462-518`).

There is no query file behind this page. `Pulse.tsx:1-34` imports nothing from `src/lib/queries/`
and nothing from `src/lib/dataAccess`; the only value on screen that reaches a database is the
signed-in user's name and role.

## 2. What renders

Top to bottom at desktop (`src/modules/reports/Pulse.tsx:742-1211`):

1. **PageHeader** — icon `activity`, title "Pulse", one description line (`:459-465`).
2. **Seed-assertion ErrorBanner** — rendered only when `LEDGER_ASSERTION_ERRORS` or
   `FLEET_RECONCILIATION_ERRORS` is non-empty (`:467-479`). Both are computed at module load
   (`src/data/pulse.ts:768-781`, `:790-809`).
3. **Model-disclosure strip** — a bordered card printing `MODEL_DISCLOSURE`
   (`:490-506`; string at `src/data/pulse.ts:829-832`).
4. **Toolbar row** — the shared `ReportToolbar` (`:379-457`) carrying, in order: a BS-over-AD range
   pill built by the page itself (`:395-419`), the page's own 13-item period `<select>` (`:421-434`),
   a Live/Snapshot chip (`:436-455`), then the toolbar's own Compare select, CSV button and Print
   button (`src/components/ui/ReportToolbar.tsx:595-618`).
   The toolbar draws **no** date picker here: Pulse passes `value` without `onChange` and without
   `dateColumn` (`:382`), and `ReportToolbar.tsx:520` only draws the date control when both exist.
5. **`<details>` disclosure** — "N presets are unavailable — why?", listing the distinct `why`
   strings of the disabled presets (`:752-766`).
6. **KPI card grid** — `Revenue · Cash · Equipment utilization · Exceptions` in that locked order
   (`:546-603`, rendered `:770-777`). Each card: icon tile, label, value, sub-line, delta chip vs the
   previous period, and a link out (`:210-317`).
7. **Report-families tab strip** — 11 chips from `TAB_FAMILIES` (`:128-140`, rendered `:790-837`).
   Three are `<Link>`s (Dashboard, Inventory, Clients/Finance depending on money); the remaining
   eight render as `aria-disabled` dashed `<span>`s, with a caption naming the unbuilt ones (`:828-836`).
8. **Two-column body** (`:839-1203`) — content column plus a 300px rail track.
   - **Chart card** (`:841-942`) — title from `DEFINITIONS[activeView].title`, a total on the right,
     four view buttons (Revenue · Cash flow · Expense vs profit · Utilization) at `:848-874`, then the
     chart, an axis caption (`:880-886`), a comparison summary line (`:889-914`), and a five-row
     definition `<dl>` — What it shows / Formula / Source / Period basis / Excludes (`:917-941`).
   - **Top equipment table** (`:944-998`) — Equipment · Revenue · Rental days (with "of N unit-days"
     ceiling) · Utilization bar. `minWidth: 520` inside `overflowX:auto` (`:956-957`).
   - **Upcoming payments & receivables table** (`:1000-1077`, money roles only) — Type · Reference ·
     Client/Vendor · Due date (AD over BS) · Amount · Status, plus an ageing footnote (`:1073-1075`).
     `minWidth: 720` inside `overflowX:auto` (`:1010-1011`).
   - **Rail** (`:1080-1202`) — Report summary (six rows + an "Edit date range" button), Reconciliation
     (three checks), Scheduled reports (money only), Other reports (a 2×2 link grid).
9. **FooterNote** with two extra clauses (`:1205-1210`).

**Chart shape depends on state, not on the view alone** (`:618-694`): with fewer than 2 buckets an
`EmptyState` replaces the chart (`:619-621`); `profit` and `cash` are always `GroupedBars`
(`:623-655`); `revenue` and `utilization` are `GroupedBars` when a comparison resolves and at least 2
pairs exist (`:665-681`), otherwise `LineChart` (`:685-692`). Because `compareOn` defaults to `true`
(`:328`), the default first paint of the Revenue view is paired bars, not a line.

**Responsive bands.** The file reads viewport through `useViewport()` (`:325`), which is the 768 /
1180 pair — `BREAKPOINT = { phone: 768, desktop: 1180 }` (`src/lib/device.ts:43-51`). Both bands are
read. What changes:

- KPI grid columns (`:729-734`): desktop → one column per card; tablet (768–1179) → 2 columns;
  phone (<768) → 1 column.
- Body grid (`:740`): desktop → `minmax(0,1fr) 300px`; tablet and phone → single column, so the rail
  stacks under the content.
- The rail's own contents collapse behind a 44px handle at **both** tablet and phone, because `Rail`
  is `CollapsibleAside` (`src/components/ui/Page.tsx:315-331`) and that component defaults collapsed
  when `viewport === 'phone' || viewport === 'tablet'` (`src/components/ui/CollapsibleAside.tsx:37`).
- Nothing else branches. Both tables keep their desktop `minWidth` at every band and scroll
  horizontally (`:956-957`, `:1010-1011`); the page does not call `useTabularLayout()`
  (`src/lib/device.ts:139-141`).

## 3. Data sources

| screen area | source kind | detail |
|---|---|---|
| KPI cards — Revenue, Cash, Utilization, Exceptions | SEED | `figuresFor()` over the generated ledger, `src/data/pulse.ts:462-518` / `:260-304`. Inputs: `FLEET` (`src/data/pulse.ts:136-142`) and the ratio constants `SERVICES_RATIO … CAPITAL_AMOUNT` (`src/data/pulse.ts:205-216`). Rendered `Pulse.tsx:546-603` |
| Chart, all four views | SEED | `figures.buckets` from `bucketize()` (`src/data/pulse.ts:430-455`); consumed `Pulse.tsx:607-694` |
| Chart definition rows (formula/source/basis/excludes) | SEED | `DEFINITIONS` constant, `src/data/pulse.ts:673-710` |
| Top equipment table | SEED | `figuresFor().equipment`, `src/data/pulse.ts:481-491`. Names, owned units and day rates from `FLEET` (`src/data/pulse.ts:136-142`); two of the five owned-unit counts are cross-checked against `PARENTS` in `src/data/inventory.ts:475` (Aputure at `:566-568`, Ronin at `:587-589`) by `FLEET_RECONCILIATION_ERRORS` (`src/data/pulse.ts:790-809`) |
| Upcoming payments & receivables | SEED | `UPCOMING` array, `src/data/pulse.ts:364-371` |
| Exceptions count and its sub-line | SEED | `EXCEPTIONS` array, `src/data/pulse.ts:336-346`, filtered by `openAt` at `src/data/pulse.ts:494-495` |
| Period presets and their "unavailable" reasons | SEED | `PERIODS`, `src/data/pulse.ts:561-594`; `DEFAULT_PERIOD = 'this-month'` at `:596` |
| Reconciliation rail card | SEED | `RECONCILIATION`, `src/data/pulse.ts:734-759`, comparing the ledger against `UTILIZATION_PCT = 84` and `REVENUE_TODAY_PAISA = rupees(185000)` (`src/data/today.ts:306-307`) and `COUNTS`' Overdue = 4 (`src/data/today.ts:280-285`) |
| Scheduled reports rail card | SEED | `SCHEDULES`, `src/data/pulse.ts:875-879` — including the hand-typed `lastRun` strings `'31 Jul 2026, 08:00'` etc. |
| "Generated by" rail row and the CSV provenance line | DB | `users.full_name` / `users.primary_role`, selected by `loadProfile` in `src/lib/auth.tsx:75-80`, surfaced as `user.name` / `user.role` (`Pulse.tsx:1092`, `:390`). In mock mode the same three columns come from the local corpus's hand-written `users` rows (`src/lib/mock/corpus.ts:62-66`) |
| Every date, BS and AD | SEED | one fixed clock, `TODAY = 31 Jul 2026` (`src/lib/bs.ts:153`); BS conversion anchored to 16 Jul 2026 = 1 Shrawan 2083 and valid for that one month only (`src/lib/bs.ts:41-50`, `:93-99`) |
| Tab strip and "Other reports" link grids | — | static arrays inside the component, `Pulse.tsx:128-140` and `:1179-1189` |
| Model-disclosure text | SEED | `MODEL_DISCLOSURE`, `src/data/pulse.ts:829-832` |

No area of this page is LOCAL. `src/lib/mock/corpus.ts` is reached only indirectly, through auth, for
the operator's name and role; the corpus serves no table this page reads, and `data/pulse.ts` has no
table behind it at all — it is generated in the browser at module load.

Invented on this page: every rupee figure (revenue, expenses, profit, collected, outstanding, cash
in/out, net cash, deposits, per-model revenue, every Upcoming amount), every utilization percentage,
every rental-day and unit-day count, both exception counts, the three unreconciled fleet day rates
and unit counts (Sony FX3, DJI RS 3 Pro, Sony FE 24-70mm GM II — `src/data/pulse.ts:126-134`), and
the three scheduled-report rows with their last-run timestamps.

## 4. Actions and writes

**This page dispatches nothing.** `Pulse.tsx` imports no module from `src/actions/`, declares no
capability string, and calls no `createAction` product. `checkCapability`
(`src/actions/core.ts:124-218`) is therefore never consulted from this route, and no
`ActionNotImplementedError` / `ActionPermissionError` path can be reached from it.

Every interactive control and what it actually does:

| control | file:line | what happens |
|---|---|---|
| Period `<select>` | `Pulse.tsx:421-434` | `setPeriodKey` — local state. Options with `range === null` are `disabled` and suffixed "— unavailable" (`:429-431`) |
| Compare `<select>` | `ReportToolbar.tsx:596-605`, wired at `Pulse.tsx:383-384` | `setCompareOn` — local state |
| Four chart-view buttons | `Pulse.tsx:852-873` | `setView(v)` — local state, `aria-pressed` reflects it |
| CSV button | `ReportToolbar.tsx:608-612` → `exportCsv` at `:502-516` | Real: builds the text through `buildReportCsv` (`:300-341`) with the body from `pulseCsvBody` (`Pulse.tsx:1264-1309`), then `Blob` + anchor click (`ReportToolbar.tsx:353-361`). Rendered only when `money && figures` (`Pulse.tsx:385-393`) |
| Print button | `ReportToolbar.tsx:615-617` | Real: `window.print()` |
| "Edit date range" | `Pulse.tsx:1102-1104` | `periodRef.current?.focus()` — moves focus to the period select. No dialog, no range editor |
| `<details>` presets disclosure | `Pulse.tsx:752-766` | native disclosure, no handler |
| KPI card links | `Pulse.tsx:298-314`, targets at `:556`, `:570`, `:585`, `:596` | `<Link>` to `/finance`, `/reports/cash-flow`, `/inventory`, `/operations?queue=cases` — all routed (`src/App.tsx:763`, `:520`, `:759`, `:762`) |
| Tab-strip chips | `Pulse.tsx:792-826` | Three are `<Link>`s; the other eight render as `<span aria-disabled="true">` with `cursor:not-allowed` — deliberately inert, not dead handlers |
| "View full inventory report →" | `Pulse.tsx:947-952` | `<Link to="/reports/inventory">` (routed, `src/App.tsx:492-499`) |
| "View all in Finance →" | `Pulse.tsx:1004-1006` | `<Link to="/finance">` |
| "Other reports" tiles | `Pulse.tsx:1190-1195` | `<Link>`s to `/reports/cash-flow`, `/reports/working-capital`, `/reports/expenses`, `/reports/clients` (money) or `/reports/inventory`, `/operations?queue=cases` (non-money) — all routed |

Buttons with no handler: none. Every control listed above either changes local state, navigates, or
performs a real browser action.

## 5. Gates

**Route reach.** `Shell` redirects to `/login` when there is no session (`src/App.tsx:973-975`), then
computes `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)`
(`src/App.tsx:993`). `MONEY_ROUTES` includes the `/reports` prefix (`src/data/nav.ts:147-153`,
matched at `:156-159`), so `/reports/pulse` is a money surface. `canViewMoney` is false for the
`MONEY_BLIND` set — Warehouse, Technician, Driver, Client (`src/lib/rbac.ts:36-50`).

So the roles that reach this component are **Owner, Admin, Manager, Coordinator, Accounts**. The
other four get `RestrictedState` from the Shell (`src/App.tsx:1020-1023`) and Pulse never mounts.

**Money visibility.** Inside the page, `const money = useCanViewMoney()` (`Pulse.tsx:322`) →
`canViewMoney(user.role)`, false with no session (`src/lib/moneyVisibility.ts:24-27`). Everything the
`money` flag controls is **omitted**, never masked:

- Revenue and Cash KPI cards are not pushed into the array at all (`Pulse.tsx:548-576`).
- The four view buttons are not rendered and `activeView` is forced to `utilization` (`:523`, `:848`).
- The Top-equipment Revenue column — header and cells both — is dropped (`:961`, `:970-974`), and the
  rows are re-sorted by rental days so the omitted revenue ranking cannot be inferred (`:707-709`).
- The whole Upcoming payments & receivables card is not built (`:1000`).
- The Scheduled reports rail card is not built (`:1136`).
- The Reconciliation card drops its Revenue row (`:1111`).
- The comparison summary switches to a utilization/exceptions sentence (`:903-905`).
- The CSV button is not passed to the toolbar, so it is not drawn (`:385-393`).
- The "Other reports" grid swaps to two non-money destinations (`:1186-1189`).
- The two money tab families (Revenue, Clients/Finance) lose their `to` and are captioned "Not in
  your role's view" (`:718-722`, `:835`).
- A plain sentence states the omission (`:779-784`).

Note the consequence: because the Shell already refuses the whole `/reports` prefix to every
money-blind role, **none of that `!money` branch can be reached through the app as routed.** See §7.

## 6. States drawn

- **Loading** — none in this file. Every figure is a synchronous module constant, so there is nothing
  to wait for. The only skeleton is the Shell's `Suspense` fallback for the lazy chunk,
  `LoadingSkeleton type="card"` (`src/App.tsx:1026`).
- **Error** — hand-rolled, via `ErrorBanner` from `StateViews` (`Pulse.tsx:467-479`,
  `src/components/ui/StateViews.tsx:171-210`). It reports broken seed bounds, not a failed fetch;
  there is no fetch. Both source arrays are expected empty as the data stands: the per-model cap in
  `distribute()` makes `rentalDays ≤ capacity` structural (`src/data/pulse.ts:157-181`), the ledger
  cannot contain a day after `TODAY` (`src/data/pulse.ts:218-219`), and `FLEET`'s two reconciled
  models match `PARENTS` exactly — 4 vs `'4 units'` and 2 vs `'2 units'`
  (`src/data/pulse.ts:137-139` against `src/data/inventory.ts:568`, `:589`).
- **Empty** — two kinds, both `EmptyState` from `StateViews` (`src/components/ui/StateViews.tsx:34-84`).
  A whole-page one when `figuresFor` returns null (`Pulse.tsx:508-521`), and a chart-slot one for a
  one-bucket period or an all-zero series (`Pulse.tsx:613-616`, used at `:620`, `:629`, `:646`, `:672`, `:684`).
- **Restricted** — not in this file. It comes from the Shell (`src/App.tsx:1020-1023`).
- `PageBody` (`src/components/ui/PageBody.tsx:119-207`) is **not** used by this page; the states above
  are each chosen inline.

## 7. Known gaps

1. **The stated cash-flow formula does not match the code.** `DEFINITIONS.cash.formula` says
   *"Cash in = collections + deposits"* and `excludes` says deposits *"appear here"*
   (`src/data/pulse.ts:687`, `:690`) — and both strings are rendered on screen in the definition list
   (`Pulse.tsx:929-940`). The ledger sets `d.cashIn = d.collected` (`src/data/pulse.ts:302`);
   `d.deposits` is computed (`:266`) and never added to cash in. Deposits reach the CSV as a separate
   line (`Pulse.tsx:1285`) but appear in no chart. The Cash flow view therefore under-reports cash in
   by the deposits it says it includes.
2. **The whole money-blind branch is unreachable.** `Pulse.tsx` carries eleven `money`-conditioned
   omissions (listed in §5) plus a bespoke non-money sort (`:707-709`) and a non-money "Other reports"
   list (`:1186-1189`), but the Shell refuses `/reports/*` to every role for which `money` is false
   (`src/App.tsx:993` + `src/data/nav.ts:147-153` + `src/lib/rbac.ts:45-50`). No routed role can render
   that code. It is dead unless the route gate changes.
3. **`exportHeader` in `src/data/pulse.ts:837-862` is dead code.** It is exported and imported
   nowhere — a repo-wide search finds only the definition. Its job moved to `ReportToolbar`'s
   `buildReportCsv` (`src/components/ui/ReportToolbar.tsx:300-341`), and Pulse now passes only the
   three extra provenance lines through `pulseCsvBody` (`Pulse.tsx:1264-1275`). Two of those lines —
   `Compared with` and `Data freshness` — are duplicated between the dead function and the live body.
4. **`TODO(decision)` markers reachable from this page** (all in `src/data/pulse.ts`, all rendered as
   user-visible text):
   - `PERIOD_BASIS` = `'Spread across rental days — TODO(decision), Reports §5.2'`
     (`src/data/pulse.ts:664-671`). This string is printed **three times**: in the chart's Period-basis
     row (`Pulse.tsx:933`), in the rail's Revenue-recognition sub-line (`Pulse.tsx:1099`), and in the
     CSV (`Pulse.tsx:1270`). Revenue recognition is unanswered; every revenue figure on the page moves
     if it is answered differently.
   - `'TODO(decision): are quarters BS or AD?'` is the `why` text on the two disabled quarter presets
     (`src/data/pulse.ts:574`, `:580`) and is rendered verbatim in the `<details>` disclosure
     (`Pulse.tsx:760-762`).
   - The three damage refs `CASE-2026-0101 / 0118 / 0125` resolve to no row in `src/data/cases.ts`
     (`src/data/pulse.ts:331-334`).
   - Three of five `FLEET` models are unsourced assumptions and the seed files that mention a Sony FX3
     disagree with each other (`src/data/pulse.ts:126-134`); their unit counts and day rates are
     excluded from `FLEET_RECONCILIATION_ERRORS` by `RECONCILED_MODELS` (`src/data/pulse.ts:145`).
5. **Named-but-unbuilt features, drawn as prose rather than controls.** Saved reports and the custom
   builder (`Pulse.tsx:1197-1200`), schedule create/edit/retry (`:1170-1173`), PDF and Excel export
   (`:1261-1262`), and eight of eleven report families (`:828-834`, from `TAB_FAMILIES`' `to: null`
   entries at `:128-140`). None of these draws a dead button — but none of them exists either.
6. **Cross-page contradiction: two different figures both called "Cash".** Pulse's Cash card shows
   `figures.collected` (`Pulse.tsx:563`). `ReportCatalog`, rendered inside the Finance ▸ Reports tab
   (`src/modules/finance/Finance.tsx:1042`), builds its "locked Pulse row" from the same
   `figuresFor()` ledger but puts `f.netCash` on the tile it also labels **Cash**
   (`src/modules/reports/ReportCatalog.tsx:99-104`). Same period, same ledger, same label, two
   numbers, two clicks apart.
7. **The rail is behind a handle on the target device.** Pulse uses `<Rail>` (`Pulse.tsx:1080`), which
   is `CollapsibleAside` (`src/components/ui/Page.tsx:315-331`), which defaults collapsed at tablet
   *and* phone (`src/components/ui/CollapsibleAside.tsx:37`). `Page.tsx:333-348` documents a binding
   ruling that rails below 1180 must **reflow, not hide**, and provides `ReflowRail` for exactly that
   — Pulse does not use it. On the 768–1179px band the Report summary, Reconciliation, Scheduled
   reports and Other reports cards, and the "Edit date range" button, are all one tap away instead of
   on screen.
8. **Both tables horizontally scroll below 768.** `minWidth: 520` (`Pulse.tsx:957`) and `minWidth: 720`
   (`:1011`) are kept at every width inside `overflowX:auto` containers. `src/lib/device.ts:139-141`
   states the opposite rule for this codebase — below 768 a wide table "is not a table… Card rows…
   are the locked alternative" — and exports `useTabularLayout()` for it, which this page never calls.
9. **The default period cannot show a BS date.** `DEFAULT_PERIOD` is `this-month` = 1–31 Jul 2026
   (`src/data/pulse.ts:557`, `:568`, `:596`), but `toBs` only vouches for 16 Jul – 16 Aug 2026
   (`src/lib/bs.ts:41-50`, `:93-99`). So `rangeLabel` returns `bs: null` (`src/data/pulse.ts:629-634`)
   and the toolbar pill's lead line falls back to the AD range with "BS unavailable — see Report
   summary" beneath it (`Pulse.tsx:413-417`). BS-over-AD, the stated rule, is not what the page shows
   on first paint.
10. **`figures === null` is effectively unreachable through the UI.** The whole-page EmptyState
    (`Pulse.tsx:508-521`) only fires when the selected period has no range, but every option with
    `range === null` is rendered `disabled` (`:429`) and `DEFAULT_PERIOD` always resolves
    (`src/data/pulse.ts:596`, `:568`). It is a real guard against a ledger change, not a state an
    operator can produce.
11. **The chart's paired-bar series labels are full range strings.** With comparison on, the two
    series are labelled `label.ad` and `compareLabel.ad` (`Pulse.tsx:676`) — e.g.
    `1 Jul 2026 – 31 Jul 2026` — inside a legend sized for short series names
    (`src/components/ui/Charts.tsx:346-358`).
