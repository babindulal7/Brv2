# Inventory Reports

Route `/reports/inventory` · `src/modules/reports/InventoryReports.tsx` · 153 lines

Mounted at `src/App.tsx:492-499` inside `<Shell>`, lazy-imported at `src/App.tsx:36`, crumbs `Finance › Reports › Inventory Reports` (`src/App.tsx:495`). No `search` prop is passed, so the header search box is omitted (`src/App.tsx:1008`).

## 1. What it is

A four-figure KPI band plus two static tables — asset health by status and top categories by value — drawn entirely from four constants in `src/data/inventoryReports.ts:1-20`. It queries nothing: the component's whole import list (`src/modules/reports/InventoryReports.tsx:1-7`) contains no query file, no action, no hook other than `useBandColumns` and `useCanViewMoney`.

Its only working control is the CSV export in the shared toolbar (`src/modules/reports/InventoryReports.tsx:69` → `src/components/ui/ReportToolbar.tsx:502-516`), plus Print.

## 2. What renders

Desktop, top to bottom:

1. `PageHeader` — box icon, "Inventory Reports", "Monitor stock levels, asset health, and overall inventory accuracy." (`src/modules/reports/InventoryReports.tsx:58-62`; component at `src/components/ui/Page.tsx:66-108`).
2. `ReportToolbar` — passed only `title` and `csv` (`src/modules/reports/InventoryReports.tsx:69`). With no `onChange`/`dateColumn`/`branches`/`onCompareChange`, the toolbar draws **no** date pill, no range select, no branch select and no compare select (`src/components/ui/ReportToolbar.tsx:520`, `:575`, `:595`). What is actually drawn is the CSV button and the Print button (`src/components/ui/ReportToolbar.tsx:607-618`).
3. `<section aria-label="Key figures">` — a hand-rolled grid of four `InventoryKpiCard`s: Total Assets `485`, Utilization `68.4%`, Available `132`, Inventory Accuracy `99.2%` (`src/modules/reports/InventoryReports.tsx:71-100`, values from `src/data/inventoryReports.ts:1-6`).
4. `ReflowRail` wrapping a column containing:
   - `<section aria-label="Asset Health">` — "Asset Health Distribution" header plus a 3-column table Status / Count / Percentage, four rows (`src/modules/reports/InventoryReports.tsx:104-124`, rows from `src/data/inventoryReports.ts:8-13`).
   - `<section aria-label="Top Categories by Value">` — rendered only when `money` is true; header plus Category / Asset Count / Total Value, four rows (`src/modules/reports/InventoryReports.tsx:126-148`, rows from `src/data/inventoryReports.ts:15-20`).

There is no footer note bar (`FooterNote` is exported at `src/components/ui/Page.tsx:443` and not imported here).

**Responsive bands.** The file itself contains no breakpoint literal and no media query; it reads both 768 and 1180 indirectly, through two shared helpers:

- `useBandColumns()` (`src/modules/reports/InventoryReports.tsx:54`) → `src/components/ui/Page.tsx:391-394` → `useViewport()` → `BREAKPOINT = { phone: 768, desktop: 1180 }` (`src/lib/device.ts:43-51`). `bandCols(4)` yields 4 columns at ≥1180, 3 at 768-1179, 2 below 768 (`src/modules/reports/InventoryReports.tsx:71`).
- `ReflowRail` (`src/modules/reports/InventoryReports.tsx:102`) → `src/components/ui/Page.tsx:349-371`: at desktop (≥1180) it wraps the children in `Rail` → `CollapsibleAside` at `width = 288` (`src/components/ui/Page.tsx:315-331`, `src/components/ui/CollapsibleAside.tsx:155-184`); below 1180 it renders a plain full-width flex column.

The consequence at desktop is recorded in section 7: the page root is a flex column (`src/modules/reports/InventoryReports.tsx:57`), not a `content | rail` grid, and `useRailGridColumns` (`src/components/ui/Page.tsx:382-384`) is never called — so at ≥1180 both tables are confined to a 288px sticky, internally-scrolling aside while the rest of the row is empty, and they get *wider* when the window is narrowed past 1180.

Below 768 the Shell swaps the sidebar for `BottomBar` and pads for it (`src/App.tsx:1004`, `:1017`, `:1033`) — shell behaviour, not this page's.

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Total Assets `485` | SEED | `INVENTORY_METRICS.totalAssets`, `src/data/inventoryReports.ts:2`; read at `src/modules/reports/InventoryReports.tsx:74` |
| Utilization `68.4%` | SEED | `INVENTORY_METRICS.utilization`, `src/data/inventoryReports.ts:3`; read at `:81` |
| Available `132` | SEED | `INVENTORY_METRICS.available`, `src/data/inventoryReports.ts:4`; read at `:88` |
| Inventory Accuracy `99.2%` | SEED | `INVENTORY_METRICS.inventoryAccuracy`, `src/data/inventoryReports.ts:5`; read at `:95` |
| Asset Health Distribution table | SEED | `ASSET_HEALTH` — 4 hand-written `{status, count, percentage}` objects, `src/data/inventoryReports.ts:8-13`; mapped at `src/modules/reports/InventoryReports.tsx:115-121` |
| Top Categories by Value table | SEED | `TOP_CATEGORIES` — 4 hand-written `{name, count, value}` objects, `src/data/inventoryReports.ts:15-20`; mapped at `src/modules/reports/InventoryReports.tsx:138-144`, formatted by `formatMoney` (`src/lib/money.ts:62-69`) after an unchecked `as Paisa` cast (`src/modules/reports/InventoryReports.tsx:142`) |
| CSV export body | SEED | Same three constants, re-serialised in `inventoryCsv()` (`src/modules/reports/InventoryReports.tsx:29-49`) |
| CSV provenance header (Report / Period / Generated) | — | Computed in the shared toolbar from the empty filter set: Period prints "All dates" (`src/components/ui/ReportToolbar.tsx:261`, `:328-337`) |

No DB row and no LOCAL row is read on this page. There is no query import at all (`src/modules/reports/InventoryReports.tsx:1-7`), so `src/lib/mock/corpus.ts` is not consulted; the question of whether an inventory-metrics table is served does not arise, because nothing asks for one.

Invented on this page: every figure — 485 total assets, 68.4% utilization, 132 available, 99.2% accuracy, all four asset-health counts and percentages (320/120/35/10 and 66/25/7/2), and all four category rows including their money values (Cameras 45000000, Lenses 30000000, Lighting 12000000, Audio 5000000).

## 4. Actions and writes

**No action is dispatched from this page.** It imports nothing from `src/actions/` (`src/modules/reports/InventoryReports.tsx:1-7`), declares no capability string, and therefore never reaches `createAction`'s `implemented` gate or `checkCapability` (`src/actions/core.ts:124-218`, `:220-254`). Nothing on this page writes.

The two controls that exist are both inside `ReportToolbar`:

| Control | Handler | What it does |
|---|---|---|
| CSV | `exportCsv` (`src/components/ui/ReportToolbar.tsx:609`) | Real: builds the text via `buildReportCsv` (`:300-341`), quotes through `csvCell` (`src/lib/csv.ts:155-158`), names the file `inventory-reports-<today>.csv` (`:344-351`, "All dates" branch), and downloads it via a Blob + synthetic anchor click (`:353-361`). Body from `inventoryCsv(money)` (`src/modules/reports/InventoryReports.tsx:69`, `:29-49`). |
| Print | inline `() => window.print()` (`src/components/ui/ReportToolbar.tsx:615`) | Real: prints the current screen. |

Buttons with no handler: none — the toolbar's design is that a control is not rendered unless the page supplies something for it to do (`src/components/ui/ReportToolbar.tsx:520`, `:575`, `:595`, `:608`).

## 5. Gates

**Route reachability.** `Shell` computes `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`src/App.tsx:993`). `MONEY_ROUTES` contains the prefix `/reports` (`src/data/nav.ts:147-153`) and `isMoneySurface` matches `path === r || path.startsWith(r + '/')` (`src/data/nav.ts:156-159`), so `/reports/inventory` **is** a money surface. `MONEY_BLIND` is `Warehouse, Technician, Driver, Client` (`src/lib/rbac.ts:45-50`), `canViewMoney` is its complement (`src/lib/rbac.ts:36-38`).

- Reach the page and see everything: **Owner, Admin, Manager, Coordinator, Accounts**.
- Refused at the Shell before the component mounts, shown `RestrictedState` with "Your role (X) does not have access to this module.": **Warehouse, Technician, Driver, Client** (`src/App.tsx:1020-1023`).
- Unauthenticated: redirected to `/login` (`src/App.tsx:973-975`).

**Money visibility.** The page calls `useCanViewMoney()` at `src/modules/reports/InventoryReports.tsx:55` (`src/lib/moneyVisibility.ts:24-27` → `canViewMoney(user.role)`), and uses it in two places: to omit the Top Categories by Value section (`:126`) and to omit the same block from the CSV (`:40-47`).

**What is hidden under Law 6 in practice: nothing, because nobody money-blind gets here.** `money` is derived from the same `canViewMoney(user.role)` predicate the Shell already used to refuse the route, and `Shell` guarantees `user` is non-null before rendering children (`src/App.tsx:973`). So for every session that renders this component, `money === true`. The `money &&` branch at `:126` and the `money ? … : []` branch at `:40` are unreachable-false — defence in depth as `src/data/nav.ts:132-136` describes it, not an active cut. The doc comment at `src/modules/reports/InventoryReports.tsx:19-28` describes the cut as live ("the same cut the page makes… would hand a money-blind role, in a file, the one table the screen withholds"); the route guard means that role never obtains the file either way.

## 6. States drawn

- Loading — **none of this page's own.** The Shell's `Suspense` fallback covers the lazy chunk only (`<LoadingSkeleton type="card" label="Loading…" />`, `src/App.tsx:1026`); once mounted the page reads constants synchronously and has no loading path.
- Error — **none of this page's own.** The Shell wraps children in `ErrorBoundary` (`src/App.tsx:1025`).
- Empty — **none.** The tables map arrays that are non-empty literals; there is no zero-row branch (`src/modules/reports/InventoryReports.tsx:115`, `:138`).
- Restricted — **not drawn by this page.** It is drawn *for* this route by the Shell (`RestrictedState`, `src/App.tsx:1022`), which is why the page needs none.

`PageBody.tsx` and `StateViews.tsx` are not imported by this file (`src/modules/reports/InventoryReports.tsx:1-7`).

## 7. Known gaps

1. **`TODO(decision)` markers in this file: none.** The one that touches its toolbar lives upstream — BS month/quarter/fiscal-year presets, `src/components/ui/ReportToolbar.tsx:76-78` — and does not bite here, because this page passes no `dateColumn` and therefore draws no date control at all.

2. **Both tables render inside a 288px rail at desktop.** `ReflowRail` (`src/modules/reports/InventoryReports.tsx:102`) returns `Rail` → `CollapsibleAside width={288}` when viewport is desktop (`src/components/ui/Page.tsx:361-367`, `src/components/ui/CollapsibleAside.tsx:155-184`), and that aside is sticky with `maxHeight: calc(100vh - …)` and its own scrollbar (`src/components/ui/CollapsibleAside.tsx:170-180`). The page root is a plain flex column (`src/modules/reports/InventoryReports.tsx:57`) with no rail track and no call to `useRailGridColumns` (`src/components/ui/Page.tsx:382-384`), so at ≥1180 the two three-column tables occupy 288px with the remainder of the row blank, and a collapse handle appears beside them (`src/components/ui/CollapsibleAside.tsx:165-169`). Below 1180 the same content renders full width. `ReflowRail`'s own docstring says it exists for the `content | rail` grid pattern (`src/components/ui/Page.tsx:333-348`); this page uses it as a plain wrapper.

3. **The `icon` prop passed to every KPI card is dead.** `InventoryKpiCard` destructures only `{ label, value, accent, note }` (`src/modules/reports/InventoryReports.tsx:9`) but is given `icon="box"`, `icon="activity"`, `icon="check"`, `icon="check_circle"` (`:76`, `:83`, `:90`, `:97`). No icon is rendered. The four cards are also typed `any` (`:9`), so nothing catches it.

4. **The note line's colour resolves to nothing for three of the four cards.** The note is `color: var(--${note.tone})` with no fallback (`src/modules/reports/InventoryReports.tsx:14`), and three cards pass `tone: 'neutral'` (`:77`, `:84`, `:98`). `--neutral` is not defined in `src/styles/theme.css` (zero occurrences) or `src/marketing/marketing.css`, so that declaration is invalid at computed-value time and the text inherits the card's colour. `--success` (the fourth card, `:91`) does exist (`src/styles/theme.css:42`, `:185`). The card background is written the same way but *does* carry a fallback — `var(--${accent}-bg, var(--card))` (`:11`) — and `--primary-bg`, `--progress-bg`, `--success-bg` are likewise undefined in `theme.css`, so all four cards paint `var(--card)`, i.e. the accent-tinted background never appears.

5. **The category values are almost certainly rupees cast as paisa, displaying 100× too small.** `TOP_CATEGORIES[].value` is a bare number (`src/data/inventoryReports.ts:15-20`) cast with `as Paisa` at `src/modules/reports/InventoryReports.tsx:45` and `:142`. `formatMoney` divides by 100 (`src/lib/money.ts:62-69`), so Cameras renders as `Rs 4,50,000` for 150 units — Rs 3,000 per camera. Elsewhere in the codebase one Sony FX3 has a replacement value of Rs 5,60,000 (`src/lib/seed.ts:279`). The cast is unchecked, so nothing flags it.

6. **The seeded figures do not reconcile with each other.** `totalAssets` 485 (`src/data/inventoryReports.ts:2`) matches both the asset-health counts (320+120+35+10) and the category counts (150+200+80+55). But `available` 132 (`:4`) implies 353 of 485 deployed = 72.8%, while `utilization` is stated as 68.4% (`:3`). Two of the four KPI cards therefore disagree about how much of the fleet is out.

7. **This page contradicts `/inventory/warehouses` on the same two figures.** `Warehouses.tsx` shows "Inventory Accuracy" computed as an asset-weighted mean over `WAREHOUSES` (`src/modules/inventory/Warehouses.tsx:985`, `src/data/warehouse.ts:446-464`): the four seeded warehouses hold 1290+546+420+251 = 2507 assets (`src/data/warehouse.ts:191`, `:210`, `:229`, `:248`) at 99.6/99.2/99.5/98.9% (`:195`, `:214`, `:233`, `:252`), giving 99.4%. That KPI's footer links straight here (`src/modules/inventory/Warehouses.tsx:990-993`), and a second link does the same from the accuracy card (`:1546-1548`) — landing on a report stating 485 assets at 99.2%.

8. **Those two links point money-blind roles at a route they will be refused.** `/inventory/warehouses` is not a money surface (`src/data/nav.ts:147-153`), so a Warehouse or Technician session reaches `Warehouses.tsx`, and neither `Link` is wrapped in a money check (`src/modules/inventory/Warehouses.tsx:990`, `:1546`). Following either lands on the Shell's `RestrictedState` (`src/App.tsx:993`, `:1020-1023`). Law 6's stated rule is that a forbidden item is absent, not refused (`src/lib/rbac.ts:19`).

9. **`Pulse` labels this report `money: false`.** `TAB_FAMILIES` marks the Inventory tab non-money (`src/modules/reports/Pulse.tsx:132`) while this page renders a rupee table (`src/modules/reports/InventoryReports.tsx:126-148`) and its route is money-gated by prefix (`src/data/nav.ts:149`). The flag's own comment says it "marks the two §12 keeps away from a money-blind role" (`src/modules/reports/Pulse.tsx:122-127`).

10. **The report catalog calls this the built Inventory screen.** `src/modules/reports/catalog.ts:312` records `inventory-status` with `projection: null` and `needs: 'The Inventory report is the built screen.'` — accurate that the screen exists, but it has no projection behind it, which matches what section 3 found.

11. **No date, branch or compare dimension exists to add later without new data.** The page's own comment states it (`src/modules/reports/InventoryReports.tsx:64-68`): the constants carry no date and no warehouse column, so the shared toolbar's filters cannot be switched on by passing props alone.
