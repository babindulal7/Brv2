# Staff Performance

Route `/reports/staff` (`src/App.tsx:483-490`, lazy import `src/App.tsx:39`) · component `src/modules/reports/StaffReports.tsx` · 179 lines.

## 1. What it is

A read-only per-person report: four KPI cards and one seven-column team table, all printed from a single constant module — `src/data/staffReports.ts`, imported at `StaffReports.tsx:9` (`STAFF_METRICS`, `STAFF_LIST`).

It queries nothing. The component's only data import is `../../data/staffReports` (`:9`); there is no `lib/queries/*` import, no `useList`, and no import from `src/actions/` anywhere in the file (`:1-9`).

The only behaviour that does real work is export: `ReportToolbar` is passed a `csv` spec (`:93-98`) whose `build` serialises the same two constants (`:30-49`).

## 2. What renders

Top to bottom at desktop (≥ 1180):

1. **`PageHeader`** — icon `users`, title "Staff Performance", description "Track revenue handled, collections, and task completion." (`:81-85`, component `src/components/ui/Page.tsx:66-108`). No `actions`.
2. **`ReportToolbar`** (`:92-99`, component `src/components/ui/ReportToolbar.tsx:432-627`) — only `title` and `csv` are passed, so under that component's "a control renders only when the page has given it something real to do" rule (`ReportToolbar.tsx:398-427`) the bar draws **no date range, no branch select, no compare select** — just right-aligned `[CSV]` (`ReportToolbar.tsx:608-612`) and `[Print]` (`:615-617`). The comment at `StaffReports.tsx:87-91` states the omission is deliberate: `data/staffReports` has "no date on any row and no branch column".
3. **Key-figures grid**, `aria-label="Key figures"`, `repeat(bandCols(4), minmax(0,1fr))` (`:101`). Four hand-rolled `StaffKpiCard`s (`:11-19`), each a label + a 24px figure + a note line:
   - **Revenue Handled** = `formatMoney(STAFF_METRICS.revenueHandled)`, note "Total gross handled this month" (`:102-108`).
   - **Collection Rate** = `` `${STAFF_METRICS.collectionRate}%` ``, note "Average across all staff" (`:109-115`).
   - **Tasks Completed** = `STAFF_METRICS.tasksCompleted`, note "Across all workspaces" (`:116-122`).
   - **Avg Response Time** = `STAFF_METRICS.averageResponseTime`, note "Time to acknowledge task" (`:123-129`).
4. **`ReflowRail`** (`:132-176`, component `Page.tsx:349-371`) — **the entire report body is passed into it**. See §7 gap 6 for what that does at desktop.
   - **"Team Breakdown"** — one `cardStyle` section (`:134`) with a title bar (`:135`) and a seven-column `<table>` (`:136-173`): Staff · Role · Revenue Handled · Collections · Collection Rate · Tasks · Performance Score (`:139-145`). One row per `STAFF_LIST` entry (`:149-171`); three rows today.

There is no rail content, no `SideRail`, and no `FooterNote` (`Page.tsx:443`) — unlike the sibling report screens (e.g. `ExpenseReports.tsx:630`).

**Responsive bands the file actually reads — both 768 and 1180, both indirectly.** The file contains no width literal; two of its imports resolve to `useViewport()` (`src/lib/device.ts:57-79`, breakpoints `phone: 768`, `desktop: 1180` at `device.ts:43`):

- `useBandColumns()` (`:54`, applied at `:101`) → `Page.tsx:391-394`: the KPI grid is **2 columns below 768**, **3 between 768 and 1179**, **4 at ≥ 1180**.
- `ReflowRail` (`:132`) → `Page.tsx:349-371`: at ≥ 1180 it wraps its children in `Rail` → `CollapsibleAside side="right" width={288}` (`Page.tsx:315-331`, `src/components/ui/CollapsibleAside.tsx:155-184`); below 1180 the children become a plain full-width stacked column (`Page.tsx:368-370`).

`useRailGridColumns()` (`Page.tsx:382-384`) is **not** imported, so there is no `content | rail` grid on this page — the outer container is a plain flex column (`:80`). `useTabularLayout()` (`device.ts:139-141`) is not imported either, so the seven-column table stays a `<table>` at every width. Nothing reads `useCapability()` (`device.ts:111-130`).

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Revenue Handled KPI | **SEED** | `STAFF_METRICS.revenueHandled = rupees(4500000)` (`src/data/staffReports.ts:6`), rendered at `StaffReports.tsx:104`. |
| Collection Rate KPI | **SEED** | `STAFF_METRICS.collectionRate = 94.2` (`staffReports.ts:7`), rendered at `:111`. Stored, not derived — see §7 gap 2. |
| Tasks Completed KPI | **SEED** | `STAFF_METRICS.tasksCompleted = 412` (`staffReports.ts:8`), rendered at `:118`. |
| Avg Response Time KPI | **SEED** | `STAFF_METRICS.averageResponseTime = '18m'` (`staffReports.ts:9`), rendered at `:125`. |
| Team Breakdown — Staff, Role, Tasks, Performance Score | **SEED** | `STAFF_LIST`, 3 literal objects `STF-001`…`STF-003` (`staffReports.ts:23-54`), rendered at `:156`, `:157`, `:161`, `:164`. |
| Team Breakdown — Revenue Handled, Collections | **SEED** | `s.revenueHandled` / `s.collections` from the same three literals (`staffReports.ts:28-29`, `:38-39`, `:48-49`), rendered at `:158-159`. |
| Team Breakdown — Collection Rate column | **SEED (computed)** | `((s.collections / s.revenueHandled) * 100).toFixed(1)` at `:150`, over the seed figures above. The only number on the page derived from anything. |
| CSV export body | **SEED** | The same two constants, serialised at `:30-49`. |
| — | **DB** | **None.** No `src/lib/queries/*` import, no RPC, no view. Nothing named `performance_score`, `tasks_completed`, `revenue_handled` or `staff_performance` exists anywhere under `supabase/` or `src/lib/queries/` (grepped, zero matches). The `users` table that does exist (`src/types/database.ts:318-328`, read by `src/lib/auth.tsx:76-80`) carries `primary_role` and no performance columns, and this page never reads it. |
| — | **LOCAL** | **None served, and nothing to serve.** `src/lib/mock/corpus.ts` builds its store at `:124` onward and its only staff-shaped table is `USERS` — three rows minted purely so auth can boot (`corpus.ts:56-66`, exposed as `users` at `:406`). No staff-performance table exists in the corpus and none is listed in `UNSERVED` (`corpus.ts:33-44`), so mock mode's banner would not report the absence either. |

Invented on this page: every figure. Rs 45,00,000 revenue handled, the 94.2% collection rate, 412 tasks, the 18m average response time, and all three staff rows — their names, their `STF-` ids, their roles, their revenue-handled and collections amounts, their per-person task counts, their per-person response times, and all three performance scores (94 / 88 / 91).

## 4. Actions and writes

**No dispatches.** The file imports nothing from `src/actions/` (`:1-9`), so no capability string is submitted to `checkCapability` (`src/actions/core.ts:124-218`) from this route, and there is no `implemented: true/false` to report. Nothing on this page writes to anything.

Every control on the page has a handler:

| Control | Where | Handler |
|---|---|---|
| `[CSV]` | `ReportToolbar.tsx:608-612` | `exportCsv` (`ReportToolbar.tsx:502-516`) → `buildReportCsv` (`:300-341`) with the §11 provenance header, quoting via `csvCell` (`src/lib/csv.ts:155-158`), filename `staff-performance-<day>.csv` (`:344-351`), delivered by `Blob` + anchor click (`:353-361`). Real; it writes the constants listed in §3. |
| `[Print]` | `ReportToolbar.tsx:615-617` | `window.print()`. |
| Rail collapse / expand handle | `CollapsibleAside.tsx:65-97`, `:165-169` | `toggle` from `useCollapsed`, persisted to `localStorage` under key `right:/reports/staff` (`CollapsibleAside.tsx:30`, `src/lib/collapse.ts:17-27`). |

**Buttons with no handler: none.** Nothing on this page claims a write.

The export repeats the screen's own score gate rather than dumping every score: `staffCsv(isManager, myName)` (`:96`) applies `isManager || s.name === myName ? s.performanceScore : 'Hidden'` at `:46`, the same test the table uses at `:152`. The reasoning is written out at `:21-29`.

## 5. Gates

- **Route.** `/reports/staff` is inside `MONEY_ROUTES` via the `/reports` prefix (`src/data/nav.ts:147-159`), and `Shell` refuses the whole module for a money-blind role: `const isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`src/App.tsx:993`), rendering `RestrictedState` in place of the children (`App.tsx:1020-1023`). Unauthenticated visitors are redirected to `/login` first (`App.tsx:973-975`). `/reports/staff` is not in `NAV` at all — `permittedNav` never offers it (`nav.ts:110-116`, `:132-136`), so the route is reachable only by typed URL, a deep link, or the report catalog entry (`src/modules/reports/catalog.ts:469`).
- **Money visibility.** `useCanViewMoney()` (`:55`, `src/lib/moneyVisibility.ts:24-27`) → `canViewMoney` (`src/lib/rbac.ts:36-38`), whose `MONEY_BLIND` set is Warehouse, Technician, Driver, Client (`rbac.ts:45-50`).
- **Roles that reach the content:** Owner, Admin, Manager, Coordinator, Accounts — the business 9 (`src/types/database.ts:116-125`) minus the four money-blind roles.
- **What Law 6 hides:** the entire page. The gate is an early return at `:61-74`, so a money-blind role loses the non-money columns too — Staff, Role, Tasks, Performance Score — not just the rupee columns. Only the `PageHeader` and the restricted panel remain (`:64-71`), and the comment at `:58-60` states this is deliberate ("there is no money-free version of it"). No export is offered above it.
- **A second, narrower gate inside the page.** `isManager = user?.role === 'Owner' || 'Manager' || 'Admin'` (`:76`) plus `s.name === myName` (`:152`, `myName = user?.name` at `:77`) decides the Performance Score cell: a match prints the score (`:164`), otherwise the literal string "Hidden" (`:166`). Coordinator and Accounts pass the money gate and therefore see every rupee figure on the page, but see "Hidden" in all three score cells — see §7 gap 4 for why the self-match branch cannot fire.

## 6. States drawn

| State | Present? | How |
|---|---|---|
| Loading | **none** | Nothing async: the constants are module imports (`:9`). No `loading` prop is ever passed to `PageBody`. |
| Error | **none** | No query, no `ErrorBanner`, no `error` prop. |
| Empty | **none** | `STAFF_LIST` is a non-empty literal; if it were emptied, `:149` would map to an empty `<tbody>` under a full header row with no empty state. `PageBody`'s `empty` prop (`src/components/ui/PageBody.tsx:186-204`) is never passed. |
| Restricted | **yes, via `PageBody`** | `restricted` + `restrictedReason` + `restrictedRequiredRole` (`:66-68`) → `RestrictedState` (`PageBody.tsx:143-150`, `src/components/ui/StateViews.tsx:213-280`). |

`PageBody` is used **only** for the restricted branch — the happy path never renders through it (`children={null}` at `:70`, and `:79-178` return their own tree).

## 7. Known gaps

1. **`TODO(decision)` markers in this file: none.** The whole page is seed and nothing on screen or in the export says so. The KPI notes assert periods and scopes the data cannot support — "Total gross handled **this month**" (`:107`) and "Across all workspaces" (`:121`) — over constants that carry no date and no branch, which the file's own comment concedes at `:88-91`.
2. **The headline block and the table it sits above do not reconcile, and two of the four are impossible from the rows.** `STAFF_METRICS` and `STAFF_LIST` are independent literals (`staffReports.ts:5-10` vs `:23-54`) with nothing tying them together:
   - Revenue Handled says Rs 45,00,000 (`staffReports.ts:6`); the three rows sum to Rs 25,50,000 (`:28`, `:38`, `:48`). A gap of Rs 19,50,000 on the same screen.
   - Collection Rate says 94.2%, labelled "Average across all staff" (`:7`, note at `:114`); the rows give 92.0 / 96.5 / 98.9 — a 95.8% mean and a 94.7% weighted rate. Neither is 94.2.
   - Avg Response Time says 18m (`:9`); the three `averageResponseTime` values are 12m / 15m / 22m, mean 16.3m (`:31`, `:41`, `:51`) — and those per-row values are **never rendered**, there is no response-time column in the table (`:139-145`).
   - Tasks Completed (412) is the one figure that does reconcile: 145 + 112 + 155 (`:30`, `:40`, `:50`).
3. **`performanceScore` is a bare number with no definition anywhere.** `staffReports.ts:19` comments only `// out of 100`. Nothing computes it, nothing states its inputs, and the table colours it green at ≥ 90 and blue below (`:164`) — a threshold typed into the page rather than into any engine. This is the figure the page spends two gates (`:46`, `:152`) protecting.
4. **Identity is matched by display-name string equality, so the "see your own score" branch cannot fire.** `myName = user?.name` (`:77`) is `users.full_name` (`src/lib/auth.tsx:164`); `s.name` is an invented literal (`staffReports.ts:26`, `:36`, `:46`). `STF-001`…`STF-003` are not `users.id` and there is no join column at all. Against the mock corpus the three signed-in identities are Babin Dulal, Ram Thapa and Sita Sharma (`corpus.ts:63-65`) — none of which appears in `STAFF_LIST` — so a non-manager sees "Hidden" in every row including their own, on screen (`:166`) and in the CSV (`:46`). Name equality is also neither unique nor stable if it ever did match.
5. **The restricted panel names the wrong role set, and the branch is unreachable at this route.** `restrictedRequiredRole="Owner, Admin, Coordinator or Accounts"` (`:68`) omits **Manager**, whom `canViewMoney` admits (`rbac.ts:45-50`) and whom the page's own `isManager` test names one line later (`:76`) — five roles pass the gate, the chip names four. Separately, `Shell` already substitutes its own `RestrictedState` on the identical predicate before this component mounts (`App.tsx:993`, `:1020-1023`; `nav.ts:147-159`), so `:61-74` and its more specific reason string can only be seen if the component is mounted outside `/reports`. Identical wording and identical omission appear at `src/modules/reports/PromotionsReports.tsx:70`.
6. **The whole report body is passed to `ReflowRail`, which at ≥ 1180 is a 288px collapsible rail.** `ReflowRail` (`:132`) → `Rail` → `CollapsibleAside width={288}` with `position: sticky`, `maxHeight: calc(100vh …)` and its own contained scroll (`Page.tsx:349-366`, `:315-331`, `CollapsibleAside.tsx:155-183`). This page has no `content | rail` grid to place that rail beside — `:80` is a plain flex column and `useRailGridColumns` (`Page.tsx:382`) is not imported. So the seven-column team table renders inside a 288px sticky self-scrolling column at desktop, and full-width below 1180 — the table is **wider on a tablet than on a monitor**. Compare the reports that do it the documented way: `ExpenseReports.tsx:182` + `:536`, `CashFlowReport.tsx:116` + `:306`, `ClientReports.tsx:177` + `:431`. Not unique to this page — `PromotionsReports.tsx:126`, `EquipmentPerformance.tsx:137`, `InventoryReports.tsx:102` and `ForecastingReports.tsx:118` repeat the same shape.
7. **The table stays a seven-column table below 768.** `useTabularLayout()` (`device.ts:139-141`) is not consulted, and the table carries no `minWidth` and no `overflow-x` wrapper (`:136`), so at phone width the columns compress rather than scroll or become card rows — the alternative `device.ts:132-141` calls "the locked alternative".
8. **`StaffKpiCard` is `({ ... }: any)` and silently drops `icon`.** The props are untyped (`:11`); `icon` is passed on all four cards (`:105`, `:112`, `:119`, `:126`) and the component never destructures or renders it (`:11-19`). The shared `KpiStrip`, which does draw an icon tile, exists at `Page.tsx:203-304` and is not used.
9. **Three of the four accent tokens the cards ask for are not defined, so all four cards share one background.** `StaffKpiCard` sets `background: var(--${accent}-bg, var(--card))` (`:13`) — `--primary-bg`, `--success-bg`, `--progress-bg` and `--warning-bg` all have **zero** definitions in `src/styles/theme.css`, so the `var(--card)` fallback always wins. (The foreground `var(--${accent})` at `:15` does resolve: `--primary`, `--success`, `--progress`, `--warning` exist at `theme.css:42-48` and `:185-189`.) `App.tsx:818-829` records the same `--warning-bg` defect being found and fixed elsewhere in the app.
10. **`note.tone: 'neutral'` resolves to an undefined custom property on three of the four cards.** `StaffKpiCard` sets `color: var(--${note.tone})` (`:16`); `--neutral` has zero definitions in `theme.css` — only `--st-neutral-bg` / `--st-neutral-fg` exist (`theme.css:129`, `:255`) — so the notes at `:107`, `:121` and `:128` render an invalid declaration and inherit the card's text colour instead of a muted one. `--success` (`:114`) is the only tone that resolves. Same defect, same component shape, as `PromotionsReports.tsx:17`.
11. **`var(--text3)` on the "Hidden" cell is also undefined** (`:166`) — zero definitions in `theme.css`. The word that signals a withheld score therefore renders in the inherited body colour rather than a de-emphasised one, at `fontWeight: 600` (`:162`), looking like a value rather than an absence.
12. **`StaffKpiCard` pads the card twice and asks for a gap that cannot apply.** `Card` puts `style` on the outer `<section>` and always wraps children in its own `padding: 14` div (`Page.tsx:44-60`); the caller passes `padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)'` (`:13`). Result: outer padding plus inner 14px, and because the section has exactly one child (no `title` is passed, so `Page.tsx:45` renders nothing) the `gap` spaces nothing.
13. **The report attributes revenue and collections to a role the app forbids from seeing money.** `STF-003` is a **Technician** credited with Rs 4,50,000 handled and Rs 4,45,000 collected (`staffReports.ts:46-49`), and Technician is inside `MONEY_BLIND` (`rbac.ts:45-50`) — a role that by Law 6 cannot see a rupee figure anywhere, including this one about itself.
14. **No date or branch filter, by design — with a consequence in the export.** `ReportToolbar` is given only `title` and `csv` (`:92-98`) and the comment at `:87-91` argues the case; `ReportToolbar.tsx:398-427` is built to draw no dead controls. Recorded so a reader does not report it as a missing feature. The consequence is that every export's provenance header prints "Period, All dates" (`ReportToolbar.tsx:330`, `:261`) over figures whose own KPI note claims "this month" (`:107`).
15. **The report catalog calls this route the finished article.** `src/modules/reports/catalog.ts:469` lists `staff-performance` with `route: '/reports/staff'`, `projection: null` and `needs: 'The Staff report is the built screen.'` — while the two entries beside it, Activity and Shifts, are honestly marked as having no data source (`catalog.ts:470-485`). The screen it points at prints invented figures from a constant file.
16. **No test covers this page.** `src/modules/reports/__tests__/` holds four files, none for Staff (`catalog.test.ts`, `ExpenseReports.toolbar.test.tsx`, `payables.test.ts`, `ReportCatalog.dedup.test.tsx`); the only two files in the repo mentioning `StaffReports` are `src/App.tsx` and the component itself.
