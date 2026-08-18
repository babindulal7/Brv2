# Warehouse Management

Route `/inventory/warehouses` · `src/modules/inventory/Warehouses.tsx` · 2210 lines

Mounted at `src/App.tsx:288-295` inside `Shell`, with `crumbs=[{label:'Inventory'},{label:'Warehouses'}]` and the header search placeholder `"Search warehouse, zone, bay…"` (`src/App.tsx:291`). The component is lazy-loaded (`src/App.tsx:53`). `Shell` (`src/App.tsx:943-1040`) supplies the session redirect (`:973-975`), sidebar/bottom bar, `MockBanner`, `OfflineBanner` and the money-surface guard (`:993`).

**Status: Seed-only.**

---

## 1. What it is

A read-only facility register drawn entirely from four constant arrays in `src/data/warehouse.ts` (`:180`, `:264`, `:276`, `:395`) — four warehouses, nine bin records, six transfers, six staff. Every KPI, chart, alert and rail row is computed from those arrays at render time by helpers in the same file (`totalsOf` `:446`, `alertsOf` `:525`, `recentActivity` `:610`, `transferActivity` `:642`, `insightsOf` `:670`).

It issues exactly one write attempt in the whole file — `createStockTransfer` via a dynamic import at `src/modules/inventory/Warehouses.tsx:723-729` — and that action does not set `implemented`, so `src/actions/core.ts:223-225` throws before anything runs. Every other mutating control on the screen is disabled with a stated reason.

The file imports nothing from `src/lib/queries/` and nothing from `src/lib/mock/` (import block, `src/modules/inventory/Warehouses.tsx:1-53`). There is no fetch, no loading state and no retry anywhere in it.

## 2. What renders

Desktop, top to bottom.

| # | Element | Evidence |
|---|---|---|
| 1 | `PageHeader` — icon `home`, title "Warehouse Management", description "Manage warehouses, storage locations, capacity, transfers and warehouse operations." | `:853-857`; component `src/components/ui/Page.tsx:66-76` |
| 2 | Header actions: **Add Warehouse** (disabled, `Unavailable`), **Transfer Stock** (opens the modal), **Print Labels** (disabled, `Unavailable`), **Export** (CSV of the *filtered* rows), **Refresh** (disabled, `Unavailable`) | `:858-881` |
| 3 | `ErrorBanner` listing `SEED_ERRORS`, rendered only when the seed fails to reconcile | `:886-897`; assertions `src/data/warehouse.ts:721-758` |
| 4 | Two-track flex row, `flexWrap:'wrap'`, content column `flex:'1 1 560px'`, rail beside it | `:906-907` |
| 5 | Six KPI cards, `auto-fit minmax(132px,1fr)`: Total Warehouses · Active Warehouses · Total Assets Stored · Capacity Used · Open Transfers · Inventory Accuracy. Each carries a footer control — a filter-clearing link, a status filter, a `Link` to `/inventory`, an occupancy `Bar`, a jump to the Transfer Center, a `Link` to `/reports/inventory` | `:909-995`; card `:374-431` |
| 6 | Four facility cards, `auto-fit minmax(228px,1fr)`: photo, name, status `Pill`, code chip, branch, manager avatar, occupancy `Ring`, Assets/Capacity figures, Available Space, "View Warehouse →" | `:998-1085` |
| 7 | **Warehouse List** card, `id="warehouse-list"` — toolbar with search `Input`, Branch `Select`, Status `Select`, table/cards view toggle | `:1088-1174` |
| 7a | Alert-filter strip, shown only when a rail alert row is active, with a Clear button | `:1176-1195` |
| 7b | `EmptyState` when the page slice is empty | `:1197-1205` |
| 7c | Cards view: `auto-fill minmax(232px,1fr)` tiles with name, code·branch, occupancy bar, status pill, "Open →" | `:1206-1226` |
| 7d | Table view (default): `minWidth:1010`, ten sortable columns (`COLUMNS` `:464-475`) plus an Actions column — 28px photo thumbnail, code, branch, manager avatar, zones, capacity, stacked occupancy %+bar, equipment, transfers, status pill; row actions are an eye button and an **inert `more_vert` glyph** wrapped in `Unavailable` | `:1227-1347`, `:1335-1339` |
| 7e | Pagination footer: "Showing X to Y of Z warehouses", Rows-per-page `Select` (10/25/50, `:477`), ‹ · numbered pages · › | `:1349-1446` |
| 8 | Analytics row, `auto-fit minmax(228px,1fr)` — **Capacity Utilization** (`Donut` + `Legend`, "Rank warehouses by occupancy"), **Inventory Distribution** (`HBars`, link to `/inventory`), **Transfer Activity** (`GroupedBars` in an `overflow-x` box, "Open Transfer Center"), **Inventory Accuracy** (per-warehouse bars scaled 98–100%, link to `/reports/inventory`) | `:1451-1550` |
| 9 | Warehouse profile card, `id="warehouse-profile"`, titled `<name> — <code>`, with the branch·address in the header action slot; six tabs: Overview · Storage Layout (n) · Warehouse Map · Capacity · Transfer Center (n) · Staff (n) | `:1553-1601` |
| 9a | **Overview** — photo + General panel (Warehouse, Code, Branch, Status pill) and Location panel (Manager, Address, Phone, Zones, Assets), then a note naming the spec fields that are absent and a `TODO(decision)` | `:1604-1643` |
| 9b | **Storage Layout** — coverage sentence, zone rollup cards (`auto-fit minmax(230px,1fr)`), then a `minWidth:660` bin table Zone·Room·Rack·Shelf·Bin·Occupancy; the Rack cell is wrapped in `IntelCard` | `:1646-1734`, `:1704-1711` |
| 9c | **Warehouse Map** — `WarehouseMap` (600px, zoom/pan, room→zone boxes) plus a disabled "Ask AI Assistant" input and Ask button inside `Unavailable` | `:1737-1759`; `src/components/ui/WarehouseMap.tsx:58-272` |
| 9d | **Capacity** — six `Figure` tiles, a 72px `Ring` + full-width `Bar`, and a note that Reserved/expansion capacity are not fields, with a `TODO(decision)` | `:1762-1790` |
| 9e | **Transfer Center** — count line + Create Transfer button, then a `minWidth:940` table Transfer·Type·Route·Assets·Status·Requested·Date(BS over AD)·Next Step. Next Step is a **disabled** Cancel and a **disabled** step button, or the word "Closed" | `:1793-1880`, `:1852-1871` |
| 9f | **Staff** — `auto-fit minmax(238px,1fr)` cards (avatar, name, floor job title, shift, phone, duty pill) and a note that these titles are not system roles | `:1883-1916` |
| 10 | Right rail, `Rail width={296}` — **Warehouse Summary** (8 `SummaryRows`), **Alerts** (5 clickable rows that filter the table, each with its threshold in `title`), **Quick Actions** (4 tiles: 2 live, 2 `Unavailable`), **Recent Activity** (5 entries), **Warehouse Insights** | `:1923-2083` |
| 11 | `FooterNote` with the extra line "Warehouses are closed, never deleted" | `:2086` |
| 12 | Create Stock Transfer modal (`role="dialog"`, 520px): Transfer Type, Source/Destination `Select`s, Asset, Serial, Reason/Notes, inline `ErrorBanner`s, a note that advancing is not built, Cancel + Create | `:2089-2207` |

### Responsive bands

**This file reads neither breakpoint.** It does not import `src/lib/device.ts` at all (import block, `:1-53`), so nothing in it branches on 768 or 1180. Its own adaptation is CSS only: the outer `flexWrap:'wrap'` with a 560px content basis (`:906-907`, and the comment at `:899-905` explaining that a `minmax(0,1fr) auto` grid squeezed the table column to 27px on a 375px tablet), `auto-fit minmax()` grids at `:917`, `:1004`, `:1207`, `:1455`, `:1606`, `:1661`, `:1764`, `:1888`, `:2138`, and `overflowX:'auto'` around the three wide tables (`:1228` minWidth 1010, `:1684` minWidth 660, `:1810` minWidth 940) and the grouped-bar chart (`:1498`).

Breakpoints reach the rendered page only through three children:

| Threshold | Read where | What changes |
|---|---|---|
| **768 and 1180** | `Rail` (`:1923`) → `Page.tsx:315-331` → `CollapsibleAside.tsx:29,37` → `useViewport()` (`src/lib/device.ts:57-79`, `BREAKPOINT = {phone:768, desktop:1180}` at `:43`) | Below 1180 (phone **and** tablet) the whole right rail is collapsed by default to a 44px handle (`CollapsibleAside.tsx:41-75`); a user toggle overrides it |
| **768** | `IntelCard` on the Rack cell (`:1704`) → `IntelCard.tsx:98,211` | The rack detail modal renders as a bottom sheet on phone |
| none (capability, not width) | `Unavailable` (`:859`, `:867`, `:875`, `:1335`, `:1744`, `:1855`, `:1862`, `:2032`) → `useCapability()` (`Unavailable.tsx:44`) | Without hover, the disabled-reason becomes a 500ms long-press popover instead of a `title` |

## 3. Data sources

| Screen area | Kind | Detail |
|---|---|---|
| Six KPI cards | SEED | `totalsOf(WAREHOUSES)` at `:525` over `src/data/warehouse.ts:180-257` (4 rows); `totalsOf` at `src/data/warehouse.ts:446-465` |
| Facility cards | SEED | `WAREHOUSES` mapped directly at `:1006` |
| Facility photos | *(remote URL)* | Unsplash stock URLs on each row — `src/data/warehouse.ts:198,217,236,255`, each commented "Placeholder Unsplash stock photo pending a real photo". `Photo` degrades to a tile on error (`:261-271`) |
| Warehouse List table / cards | SEED | `filtered` = client-side filter+sort over `WAREHOUSES` (`:558-600`); paging by `.slice()` at `:605` |
| Search — zone/room/rack/shelf/bin match | SEED | `STORAGE_LOCATIONS`, `src/data/warehouse.ts:264-274` (9 bins), read at `:570-574` |
| Search — staff match | SEED | `WAREHOUSE_STAFF`, `src/data/warehouse.ts:395-402` (6 rows), via `staffOf` (`:467-469`), read at `:575` |
| Search — asset/serial match | SEED | the in-memory `transfers` state, seeded from `TRANSFERS` (`:513`; `src/data/warehouse.ts:276-393`), read at `:576-578` |
| Capacity Utilization donut | SEED | `capacitySlices` from `totals.used` / `totals.available` (`:807-810`) |
| Inventory Distribution bars | SEED | `EQUIPMENT_DISTRIBUTION`, `src/data/warehouse.ts:410-418` — seven hand-written category counts summing to 2,507 |
| Transfer Activity grouped bars | SEED | `transferActivity(transfers)` (`:529`; `src/data/warehouse.ts:642-655`) |
| Inventory Accuracy card | SEED | `accuracyPct` field per warehouse (`src/data/warehouse.ts:195,214,233,252`); asset-weighted mean at `:451,463` |
| Profile ▸ Overview | SEED | fields off the selected `Warehouse` row (`:1610-1631`) |
| Profile ▸ Storage Layout | SEED | `zonesOf(selected.id)` (`:821`; `src/data/warehouse.ts:484-498`) and `STORAGE_LOCATIONS` filtered at `:822-825` |
| Rack hover/detail card | SEED | `rackGlance` / `rackDetailGroups` (`:843-844`; `src/data/rackIntel.ts:115,149`) joining `STORAGE_LOCATIONS` with `PARENTS` (`src/data/inventory.ts:475`) and `SAMPLE_STOCK_CHECKS` (`src/data/stockCheck.ts:121`) |
| Profile ▸ Warehouse Map | SEED | `STORAGE_LOCATIONS` grouped Room→Zone (`src/components/ui/WarehouseMap.tsx:18-35`); layout is topological, not coordinates (`:6-10`) |
| Profile ▸ Capacity | SEED | `usedOf` / `availableSpace` / `accuracyPct` off the selected row (`:1765-1770`) |
| Profile ▸ Transfer Center | SEED | `transfersOf(transfers, selected.name)` (`:827`; `src/data/warehouse.ts:471-473`) |
| Profile ▸ Staff | SEED | `staffOf(selected.name)` (`:826`) |
| Rail ▸ Warehouse Summary | SEED | `totals` (`:1925-1935`) |
| Rail ▸ Alerts | SEED | `alertsOf(WAREHOUSES, transfers)` (`:526`; `src/data/warehouse.ts:525-568`), thresholds `CAPACITY_ALERT_PCT=85`, `LOW_SPACE_SLOTS=100`, `ACCURACY_ALERT_PCT=99` (`:510-512`) |
| Rail ▸ Recent Activity | SEED | `recentActivity(transfers)` (`:527`; `src/data/warehouse.ts:610-622`) |
| Rail ▸ Warehouse Insights | SEED | `insightsOf(WAREHOUSES)` (`:528`; `src/data/warehouse.ts:670-712`) |
| Dates (BS + AD) | *(computed)* | `toBs`/`formatBs`/`formatAd` from `src/lib/bs.ts:93,102,114`; `TODAY` is the frozen constant `2026-07-31` (`src/lib/bs.ts:153`) |
| Session identity (`requestedBy`, dispatch ctx) | *(auth)* | `useAuth()` at `:490`; user shape `src/lib/auth.tsx:14-16` |

**Nothing on this page is DB or LOCAL.** `src/lib/mock/corpus.ts` does serve a `warehouses` table (`:72-74`, registered at `:408`) but it holds exactly **one** row (`WH-KTM-01`) and this page never reads it — there is no query import in the file (`:1-53`). `storage_locations`, `stock_transfers` and any warehouse-staff table are absent from the corpus store (`:405-423`) and are **not** in the `UNSERVED` list either (`:33-44`), so they are unserved and unannounced.

Invented on this page: every figure — the four warehouses and their capacity / occupancy / equipmentCount / availableSpace / zonesCount / activeTransfers / accuracyPct, the 2,507 asset total and its seven-category split, the nine bin capacity/used pairs, the six stock transfers with their reference numbers and timestamps, the six staff records with names, shifts and phone numbers, and everything derived from them (81% capacity used, 99.4% accuracy, the donut, the bars, the alert counts, the insight sentences).

## 4. Actions and writes

**One dispatch in the file.**

| Dispatch | Capability | Action file | `implemented` | Mapped in `checkCapability`? |
|---|---|---|---|---|
| `createStockTransfer({sourceWarehouse, targetWarehouse, itemCount:1}, ctx)` — `:723-729` | `inventory.transfer` (`src/actions/inventory/createStockTransfer.ts:14`) | `src/actions/inventory/createStockTransfer.ts:12-54` | **false** — the key is never set, and `ActionConfig.implemented` defaults false (`src/actions/core.ts:89`) | **Yes** — `case 'inventory.transfer': return rbac.canWriteFloor(ctx.role)` (`src/actions/core.ts:201,206`) |

Written exactly: the Create Transfer button renders, dispatches `CREATE_STOCK_TRANSFER`, action is a stub (`src/actions/core.ts:223-225` fails it closed). Note the order in the dispatcher — the `implemented` throw happens *before* the context check (`:228`) and *before* the permission check (`:236-241`), so the correctly-mapped `inventory.transfer` capability is never reached today. The `.catch()` at `:799-802` puts the thrown message into the modal's `ErrorBanner` (`:2184`), so the modal stays open and no row appears.

`dispatchContext()` (`:632-633`) refuses to substitute an identity: no session → `transferError` and no dispatch (`:714-719`).

The success path (`:730-798`) — append the row, close the modal, jump to the source warehouse's Transfer Center — is unreachable today.

**Controls that write nothing:**

| Control | Behaviour | Evidence |
|---|---|---|
| Add Warehouse (header) | `disabled`, wrapped in `Unavailable` with reason | `:859-863` |
| Print Labels (header) | `disabled`, wrapped in `Unavailable` | `:867-871` |
| Refresh (header) | `disabled`, wrapped in `Unavailable` — "no source to re-fetch" | `:875-879` |
| Row `more_vert` | not a button at all — an inert `<span>` glyph in `Unavailable` | `:1335-1339` |
| Transfer Center **Cancel** | `disabled`, reason `TRANSFER_TRANSITION_UNAVAILABLE` | `:1854-1860`; string `:484-485` |
| Transfer Center next step (Approve / Start Packing / Dispatch / Mark Received / Reconcile & Complete, from `TRANSFER_FLOW` `src/data/warehouse.ts:163-171`) | `disabled`, same reason | `:1861-1866` |
| "Ask AI Assistant" input + Ask button | both `disabled` inside `Unavailable` | `:1744-1757` |
| Quick Actions ▸ Add Warehouse, Print QR Labels | `Unavailable` tiles, no `onClick` key at all (`disabled = !('onClick' in q)`) | `:2000,2002,2006,2031-2034` |

**Client-side-only effects (no action, no network):** `exportCsv` builds a Blob and clicks a synthetic `<a download>` (`:435-458`), called from Export (`:872`, filtered rows) and Quick Actions ▸ Export Report (`:2003`, all rows). Everything else is local state: filters (`:499-506`), sort (`:607-608`), alert filter (`:610-618`), profile selection/tab (`:509-510`, `:547-556`), and the transfers array (`:513`).

## 5. Gates

**Route access.** The only gate `Shell` applies is `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`src/App.tsx:993`). `MONEY_ROUTES` is `/finance`, `/reports`, `/admin`, `/tools/pricing`, `/tools/depreciation` (`src/data/nav.ts:147-153`), and `isMoneySurface` is a path-segment prefix match (`src/data/nav.ts:156-159`) — `/inventory/warehouses` is not among them. So **all eight roles reach this route once signed in**, including the money-blind four (`Warehouse`, `Technician`, `Driver`, `Client` — `src/lib/rbac.ts:45-50`) and including the external `Client` role, which nothing on this route excludes (`src/App.tsx:288-295` carries no role prop; `isStaff` from `src/lib/rbac.ts:53-55` is not called in `App.tsx`). The route has no nav entry either — `/inventory/warehouses` does not appear anywhere in `src/data/nav.ts`.

**Money visibility.** `useCanViewMoney` (`src/lib/moneyVisibility.ts:24-27`) is **not imported by this file** (import block `:1-53`) and no rupee figure is rendered. That is correct rather than a gap: the header comment at `:108-111` records that a previously-shown "NPR 42.8M Replacement Value" was removed, and no money field exists on `Warehouse` (`src/data/warehouse.ts:36-55`). `grouped()` (`src/lib/money.ts:48-55`) is used purely as a digit-grouping formatter for slot and asset counts.

**Nothing is hidden under Law 6 on this screen** — there is no figure for it to withhold.

**Field gating.** `gateContext(user?.role ?? 'Client')` is memoised at `:496` and passed into `rackGlance` / `rackDetailGroups` at `:843-844`. Both functions declare the parameter as `_gctx` and never read it (`src/data/rackIntel.ts:115,149`), so no role-based field filtering actually happens in the rack card.

## 6. States drawn

`PageBody` (`src/components/ui/PageBody.tsx`) is **not** used — it is not imported (`:1-53`). All states are hand-rolled from `StateViews` primitives.

| State | Present? | Evidence |
|---|---|---|
| **Loading** | **None.** There is no fetch, so nothing loads. The only skeleton a user sees is `Shell`'s `Suspense` fallback while the lazy chunk downloads (`src/App.tsx:1026`), which belongs to `App.tsx`, not this page | `:1-53` (no query import); `src/App.tsx:1026` |
| **Error** | Yes, three hand-rolled `ErrorBanner`s (`src/components/ui/StateViews.tsx:171-210`): seed-reconciliation failures (`:886-897`), modal form validation (`:2183`), and the failed dispatch reason (`:2184`) | as cited |
| **Empty** | Yes, four hand-rolled `EmptyState`s (`src/components/ui/StateViews.tsx:34-84`): no warehouse matches the filters, with a Clear-filters action (`:1199-1204`); no bins mapped (`:1655-1658`); no transfers touch this warehouse (`:1807`); no staff posted (`:1886`). Plus two plain-text empties — "No transfers are on the ledger." (`:1492`) and "No storage mapped for this warehouse." (`src/components/ui/WarehouseMap.tsx:195`) | as cited |
| **Restricted** | **None in this file.** `RestrictedState` (`src/components/ui/StateViews.tsx:213-280`) is reachable only through `Shell`'s money guard (`src/App.tsx:1020-1023`), which can never fire for this route (see §5) | `src/App.tsx:993,1020-1023` |

## 7. Known gaps

**`TODO(decision)` markers in this file**

| Line | Decision |
|---|---|
| `:698-704` | `CreateStockTransferInput` carries source, target and an item count only. The transfer **type**, asset name, serial, source/destination zones and the operator's notes are collected by the modal and never sent |
| `:1640` | Whether a warehouse record carries a geocode and a floor/building line (the spec's Description, GPS, Maps link, Floor, Building have no field) |
| `:1786-1787` | Whether reserved slots are tracked per zone or per warehouse — the Capacity donut is Used/Available only because Reserved is not a field |

**`TODO(decision)` in files this page depends on**

| Line | Decision |
|---|---|
| `src/data/warehouse.ts:507-508` | Whether Warehouse Management reads the Maintenance and Stock Check ledgers for its alert rail. Until then three of the render's five alert rows (low stock, maintenance due, audit due) are absent, restated on screen at `:1990-1993` |
| `src/actions/inventory/createStockTransfer.ts:23-30` | Whether the Stock Transfer series is coded `TR` or `TRF`. The registry says `TRF`; the seed and this screen show `TR-2026-00xx` |

**Stubs and dead controls** — all eight are listed with their lines in §4. The load-bearing ones:

- **No transfer can be advanced or cancelled.** `advance(id, next)` was deleted; the note in its place (`:635-664`) records that it wrote local state plus a fabricated timestamp and fired the create action with no context and no `.catch()`. `src/actions/inventory/` has `createStockTransfer` and nothing that transitions an existing transfer, so all five step buttons and Cancel are disabled (`:1854-1866`).
- **Transfer numbering is guessed by the action.** `createStockTransfer.ts:31` returns `` `TR-${Date.now().toString().slice(-4)}` `` when no id is supplied — four digits off a clock, which collide and restart arbitrarily. The screen surfaces this at `:737-755`. Unreachable today because the action is a stub.
- **The create path hardcodes a single asset.** `itemCount: 1` (`:726`), `assetCount: 1` (`:763`), and the zones are the alphabetically-first seeded zone of each facility rather than where the asset is (`:760-762`).
- Warehouse edit and the row menu do not exist (`:1335-1339`); Add Warehouse has no intake screen (`:859`, `:2000`); no label pipeline exists (`:867`, `:2002`); the AI assistant has no query engine (`:1744`).

**Wiring that does not do what its comment says**

- `:829-838` describes `rackGlance`/`rackDetailGroups` as building "a full field-gated object graph (role/PII/money filtering) per bin row" and memoises them for that reason. Both functions ignore the gate context entirely (`src/data/rackIntel.ts:115,149` — parameter named `_gctx`, never referenced). The memo is still a real perf win; the stated reason is not accurate.
- The rack detail card's "Items in this rack" group is **always** the placeholder. `itemsInRack` substring-matches `ChildRow.location` against the rack id, and no seeded location string contains "Rack" — stated by the join's own header (`src/data/rackIntel.ts:14-19`) and falling through to `[{label:'Contents', value:'No items currently logged against this rack'}]` (`src/data/rackIntel.ts:186`).

**Contradictions with other surfaces**

- **This exact component is mounted twice in the app.** `src/modules/settings/sections/BranchesWarehouses.tsx:14` imports it and renders `<Warehouses />` whole at `:524`, under Settings ▸ Branches & Warehouses, complete with its own `PageHeader` and `Rail` (acknowledged at `BranchesWarehouses.tsx:56-60`).
- **The nav data says this page moved.** `src/data/nav.ts:326-332` records the ruling that Warehouses left Inventory for Settings and sets `SPEC_TABS['/inventory']` to four tabs excluding it — yet the route persists (`src/App.tsx:288-295`) and appears in no nav section.
- **Two sources describe the warehouse→branch relationship.** This page filters and groups on the free-text `branch` string (`:531`, `:564`, `:1115-1130`; field at `src/data/warehouse.ts:40`), while `src/data/settings.ts:409-414` carries a separate `WAREHOUSE_BRANCH_ID` map. That file's own comment says the field belongs on the `Warehouse` record and that "two sources describe one relationship" (`src/data/settings.ts:403-407`), and `BranchesWarehouses.tsx:63-65` states the free-text branch names match no `Branch.name` — so this page's "Across 4 branches" KPI note (`:924`) counts four *strings*, not four branch records, of which `src/data/settings.ts:395-401` says only three exist.

**Other observations**

- Facility images are remote `images.unsplash.com` URLs (`src/data/warehouse.ts:197-198, 216-217, 235-236, 254-255`), each labelled a placeholder. `Photo` falls back to a `home` glyph tile on load failure (`:251`, `:261-271`).
- The `Bar` on the Inventory Accuracy card is scaled `(accuracyPct - 98) * 50` (`:1531`), i.e. a 98–100% window, disclosed in the card's own footnote (`:1542-1545`).
- KPI ▸ Total Warehouses "View All" is `disabled` whenever no filter is set (`:926`) — inert in the default state, but it carries a `title` saying why.
- `SEED_ERRORS` is computed but currently empty: all four rows satisfy `capacity − availableSpace === equipmentCount` and the stored `occupancy`, the distribution sums to the 2,507 asset total, and all six transfer dates (2026-08-04 … 2026-08-07) fall inside the single month `lib/bs` can convert (`src/lib/bs.ts:41-50`, anchor 16 Jul 2026 + 32 days). The banner at `:886` therefore does not render today.
