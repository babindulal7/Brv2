# Inventory

Route `/inventory` · `src/modules/inventory/Inventory.tsx` · 2088 lines

Mounted at `src/App.tsx:266-273` inside `Shell` with `crumbs=[{label:'Inventory'}]` and the header search placeholder `"Search equipment, serial, SKU, category…"`. `Shell` (`src/App.tsx:943-1040`) supplies the session redirect (`:973-975`), the sidebar/bottom bar, `MockBanner`, `OfflineBanner` and the money-surface guard (`:993`).

The route is one screen with **four tab panes**, addressed by a `?tab=` search parameter (`src/modules/inventory/Inventory.tsx:1166-1176`, slugs at `src/data/inventory.ts:211-216`). Three of those panes are separate components documented elsewhere. Everything below describes the **Equipment** pane — the default — unless it says otherwise.

---

## 1. What it is

The equipment catalogue list. It reads `products_v` (one row per model) through `listInventory` (`src/lib/queries/inventory.ts:785-821`), and loads the per-serial `product_units_v` rows lazily when a row is expanded (`src/lib/queries/inventory.ts:847-884`, called from `src/modules/inventory/Inventory.tsx:433`). Filtering, sorting, paging and the row count are all server-side — the file contains no `.filter()`, `.sort()` or `.slice()` over fetched rows.

It writes nothing. `Inventory.tsx` imports nothing from `src/actions/` (import block, `src/modules/inventory/Inventory.tsx:1-67`); its only outbound effects are `navigate('/inventory/new')` (`:1405`) and a client-side CSV blob download (`:1100-1133`).

## 2. What renders

Desktop (`viewport === 'desktop'`, i.e. ≥1180), top to bottom:

| # | Element | Evidence |
|---|---|---|
| 1 | `PageHeader` — icon `box`, title "Inventory", description "The master equipment database — every physical asset owned, sub-rented, repaired or transferred." | `src/modules/inventory/Inventory.tsx:1413-1418`; component `src/components/ui/Page.tsx:66-76` |
| 2 | Header action cluster, **Equipment tab only** (`tab === 'Equipment'`): `Refresh` → `refreshAll`; `Import` **disabled**, wrapped in `Unavailable`; `Export` (wrapped in a `<span title=…>` naming the page scope); `Add Equipment` primary → `/inventory/new` | `src/modules/inventory/Inventory.tsx:1384-1409` |
| 3 | Tab strip, `role="tablist"`, four tabs `Equipment · Bundles · Stock Check · Maintenance`, `flexWrap:'nowrap'` + `overflowX:'auto'` at every width, `minHeight:44` per tab | `src/modules/inventory/Inventory.tsx:1431-1477`; tab list `src/data/inventory.ts:193` |
| 4 | `KpiStrip`, `columns={6}` — six cards, each a separate count query (see §3) | `src/modules/inventory/Inventory.tsx:1315-1329,1495` |
| 5 | Chip row — six chips `All · Available · On Rent · Maintenance · Damaged · Missing`, horizontally scrolling, `minHeight:44`, each carrying an icon as well as a tone; then a `Clear Filters` button disabled unless `filtersOn` | `src/modules/inventory/Inventory.tsx:1510-1596`; chips `src/data/inventory.ts:302-309` |
| 6 | One-line explainer under the chip row, rendered only when `chip.kind !== 'all'` — different text for a status chip vs the Damaged condition chip | `src/modules/inventory/Inventory.tsx:1609-1625` |
| 7 | Two-column grid `auto minmax(0,1fr)` — left `SideRail width={216} label="Categories"` holding `FilterRail`, right the list card | `src/modules/inventory/Inventory.tsx:1637-1655` |
| 7a | `FilterRail`: "Filters" heading + `Reset`; then 14 rows from `FILTER_RAIL` — 4 live checkbox groups (Category 17 values, Status 10, Condition 5, Serialisation 3) and 10 greyed rows each with its own `title` reason and a "no query" tag; then a footnote; then a disabled `Save Current View` button in `Unavailable` | `src/modules/inventory/Inventory.tsx:928-1086`; rows `src/data/inventory.ts:772-846` |
| 8 | List card toolbar: `"N models"` or `"N selected"` + `Clear selection`; right side `Bulk Actions` **disabled** in `Unavailable`, `Sort by` `<Select>` (5 options, 2 rendered `disabled` with a reason), a density toggle, and a table/grid view toggle | `src/modules/inventory/Inventory.tsx:1659-1771` |
| 9 | Sort-unavailable banner — rendered only when `query.sortUnavailable !== null` | `src/modules/inventory/Inventory.tsx:1775-1780` |
| 10 | `PageBody` wrapping the list (see §6) | `src/modules/inventory/Inventory.tsx:1793-1936` |
| 10a | **Table view** (default): `minWidth:1060`, columns *checkbox · chevron · Equipment/Unit · Category · Stock · Status · Location · Condition · [Replacement / unit (NPR)] · Actions*. Only the Equipment header is a sort control; the other five are plain `<th>` | `src/modules/inventory/Inventory.tsx:1866-1934,1905-1909` |
| 10b | Parent row: select checkbox, expand chevron (serialised models only), `IntelCard`-wrapped name block (thumb + name + category chip + asset code + tracking-mode chip for non-serialised), category, `stockLabel`, `StatusBreakdown` (dot + count + label per non-zero state), a literal `—` in Location with a `title` explaining Location is per-unit, `ConditionBadge`, optional money cell, and an inert `more_vert` glyph inside `Unavailable` | `src/modules/inventory/Inventory.tsx:548-681` |
| 10c | Expansion rows (after `listUnits` resolves): one row per unit showing asset tag, serial-or-"No serial on file", "Unit i of n", category, empty Stock cell, `StatusBadge`, `rack · shelf · bin`, `ConditionBadge`, optional replacement value, inert `more_vert` | `src/modules/inventory/Inventory.tsx:463-535` |
| 10d | Expansion non-row states: "Loading units…", an error line + `Retry`, or "This model has no unit rows yet." | `src/modules/inventory/Inventory.tsx:683-707` |
| 10e | **Grid view** (toggle, tabular widths only): `repeat(auto-fill, minmax(230px,1fr))` cards with thumb, name, category chip, breakdown, stock, condition, optional replacement value | `src/modules/inventory/Inventory.tsx:1831-1865` |
| 11 | Pagination footer: `Showing X to Y of Z models · N units on this page`, `Rows per page` `<Select>` (10/25/50/100), and « ‹ [5-page window] › » | `src/modules/inventory/Inventory.tsx:1939-2057`; window `:252-256`; options `src/data/inventory.ts:1057` |
| 12 | Standing note: "Status is written by the Status Engine from booking and workspace events. There is no manual status control in Inventory — not in a row menu, not in bulk." | `src/modules/inventory/Inventory.tsx:2077-2081` |
| 13 | `FooterNote` with the extra line "Equipment is retired, never deleted" | `src/modules/inventory/Inventory.tsx:2085` |

When `tab !== 'Equipment'`, items 4–13 are replaced wholesale by one component and the header action cluster disappears (`equipmentActions` is `null`, `:1385`):

| Tab | Renders | Evidence |
|---|---|---|
| Bundles | `<Bundles />` (1504 lines) | `src/modules/inventory/Inventory.tsx:1480`; `src/modules/inventory/Bundles.tsx:368` |
| Maintenance | `<Maintenance />` (955 lines) | `src/modules/inventory/Inventory.tsx:1482`; `src/modules/inventory/Maintenance.tsx:466` |
| Stock Check | `<StockCheck embedded />` (795 lines) — `embedded` suppresses that screen's own `PageHeader` and its scan-field `autoFocus` | `src/modules/inventory/Inventory.tsx:1492`; `src/modules/inventory/StockCheck.tsx:50,259,614` |

### Responsive bands

**This file reads both breakpoints.** It imports `useTabularLayout` and `useViewport` from `src/lib/device.ts` (`src/modules/inventory/Inventory.tsx:15`), and `BREAKPOINT = { phone: 768, desktop: 1180 }` (`src/lib/device.ts:43`).

| Threshold | Read where | What changes |
|---|---|---|
| **768** | `useTabularLayout()` at `:1196` → `useViewport() !== 'phone'` (`src/lib/device.ts:139-141`) | Below 768 the `minWidth:1060` table is not rendered at all; `ParentCardView` cards replace it regardless of the table/grid toggle (`:1814-1830`, cards `:733-873`, nested unit cards `:876-924`) |
| **768** | `phone = viewport === 'phone'` at `:1383` | The four header buttons drop their text labels and keep icons only (`:1388,1392,1402,1406`); `Clear Filters` loses its label (`:1594`) |
| **1180** | `viewport === 'desktop'` at `:1640,1645,2066` | At ≥1180 the grid is `auto minmax(0,1fr)` and the rail renders in the left track. Below 1180 the grid collapses to one column and the same `FilterRail` renders **inline beneath the list card** instead — reflow, not hide |
| 768 / 1180 | `KpiStrip` internally | The six KPI cards clamp to 2 columns at phone and 3 at tablet (`src/components/ui/Page.tsx:210-212`) |
| — (capability, not width) | `Unavailable` → `useCapability()` (`src/components/ui/Unavailable.tsx:44`) | Where there is no hover, every greyed control's reason becomes a 500 ms long-press popover instead of a `title` (`src/components/ui/Unavailable.tsx:70-77,111`). Seven controls on this page rely on it |

## 3. Data sources

Configured data source is **live**: `.env.local` sets `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` and no `VITE_DATA_SOURCE`, and `IS_MOCK` defaults false (`src/lib/supabase.ts:42,66-68`). The LOCAL rows below apply only under `VITE_DATA_SOURCE=mock`.

| Screen area | Source kind | Detail |
|---|---|---|
| Equipment table / cards / grid rows | DB | `products_v` — `supabase.from('products_v').select(...)` in `listInventory`, `src/lib/queries/inventory.ts:792-794`. Columns named one by one at `:533-537`; money variant `:540`. Baseline predicate `status in (Draft, Active)` from `catalogue()` `:925-930` |
| Category chip, `Thumb` icon, Category facet filtering | DB | `category:inventory_categories!inner ( code, name )` embed, `src/lib/queries/inventory.ts:536`; facet column `category.name` `:491` |
| `StatusBreakdown`, `stockLabel`, `ConditionBadge` on a parent | DB | `units:product_units_v ( status, condition )` non-inner embed, `src/lib/queries/inventory.ts:537`; counted into `unitsByState` / `unitConditions` by `toRow` `:681-718` |
| Chip + Status facet narrowing | DB | Dedicated `!inner` semi-join alias `unit_state:product_units_v!inner ( id )`, added to the SELECT only when the group is non-empty (`src/lib/queries/inventory.ts:543,789`); filter column `unit_state.status` `:468` |
| Condition facet + Damaged chip narrowing | DB | Second, separate `!inner` alias `unit_condition:product_units_v!inner ( id )` (`src/lib/queries/inventory.ts:546,790`), filter column `unit_condition.condition` `:481` |
| Serialisation facet | DB | `products.tracking_mode`, straight off the parent — `SERIALISATION_COLUMN` `src/lib/queries/inventory.ts:501` |
| Expansion rows (per-serial units) | DB | `product_units_v` — `supabase.from('product_units_v').select(...).eq('product_id', productId)`, `src/lib/queries/inventory.ts:859-862`; 22 columns at `:629-633`, money variant `:635`. Fired only after `open` goes true (`src/modules/inventory/Inventory.tsx:422-451`) |
| Six KPI figures | DB | Six independent `useList` calls over the same `listInventory`, each `withCount: true` with `page: { index:0, size:1 }` — the card reads `total`, not rows (`src/modules/inventory/Inventory.tsx:222-232,1280-1286`). None passes `withMoney` |
| `Showing X to Y of Z models` | DB | `list.total`, from `withCount: true` on the main query (`src/modules/inventory/Inventory.tsx:1261,1331`) |
| `N units on this page` | DB | `list.rows.reduce((a,r)=>a+r.unitCount,0)` — page-scoped and labelled as such (`src/modules/inventory/Inventory.tsx:1375,1956`) |
| Same tables in mock mode | LOCAL | `products` and `product_units` **are** served — `src/lib/mock/corpus.ts:156-217`, wired in at `:413-414`; `products_v`/`product_units_v` map onto them at `:437-438`. `inventory_categories` is served from migration 0012's six real rows (`:82-98,409`). The embeds resolve because both relationships are declared (`src/lib/mock/engine.ts:78-79`) |
| Category facet **option list** | SEED | `PRODUCT_CATEGORIES` — the 17 `product_category` enum members, written as an exhaustive `Record` (`src/data/inventory.ts:709-728`), used by `FILTER_RAIL` `:773` |
| Status facet option list | SEED | `INV_ORDER` — the 10 `inventory_state` members in enum declaration order (`src/data/inventory.ts:104`), used at `:781` |
| Condition facet option list | SEED | `CONDITIONS` — the 5 `unit_condition` members (`src/data/inventory.ts:151-152`), used at `:832` |
| Serialisation facet option list | SEED | `TRACKING_MODES` — the 3 `product_tracking_mode` members (`src/data/inventory.ts:739-740`), used at `:833` |
| Ten greyed rail rows and their reason strings | SEED | `FILTER_RAIL`'s `kind:'blocked'` entries, `src/data/inventory.ts:774-845` |
| Badge colours, dots, icons, status wording | SEED | `INV_STYLE` `src/data/inventory.ts:59-70`, `INV_DOT` `:77-88`, `INV_TONE` `:114-125`, `INV_LABEL` `:249-260`, `CONDITION_TONE` `:165-172`, `CATEGORY_ICON` `:660-668` |
| Sort options and the two "unavailable" reasons | SEED | `SORTS` `src/data/inventory.ts:1023-1029`, `SORT_UNAVAILABLE` `:1050-1055` |
| Hover Intel glance / detail card contents | DB (via SEED shaping) | `inventoryGlance` / `inventoryDetailGroups` build `IntelGlance`/`IntelGroup[]` **from the fetched `InventoryListRow`**, not from constants (`src/data/inventory.ts:936-1019`), called at `src/modules/inventory/Inventory.tsx:573-576,1343-1351` |
| Bundles tab | SEED | `src/modules/inventory/Bundles.tsx` imports `src/data/bundles.ts` (`BUNDLES` at `src/data/bundles.ts:173`) and no query module — a grep for `lib/queries`, `lib/supabase`, `actions/` or `useList` in that file returns nothing |
| Maintenance tab | SEED | `src/modules/inventory/Maintenance.tsx:16-24` imports `src/data/maintenance.ts`; same grep returns nothing |
| Stock Check tab | SEED | `src/modules/inventory/StockCheck.tsx:12` imports `SAMPLE_STOCK_CHECKS` (`src/data/stockCheck.ts:121`); its only non-seed import is the action at `:176` |

`PARENTS` — the eight hand-typed rows with invented rupee figures at `src/data/inventory.ts:475-653` — is **not** imported by `Inventory.tsx`. Its import block (`src/modules/inventory/Inventory.tsx:37-58`) names only vocabularies, label maps and pure derivations (`breakdownOf`, `conditionOf`, `stockLabel`, `unitLocationOf`, `inventoryGlance`, `inventoryDetailGroups`).

**Invented on this page:** no figures. Every number on the Equipment tab — the six KPI counts, the model total, the per-status breakdowns, the stock label, the units-on-page sum, both money columns — is derived from a row returned by `products_v` or `product_units_v`. The seed content that does reach this pane is vocabulary and presentation only (facet option lists, colour tokens, icons, the word "Available", the ten blocked-facet reason strings). The other three tabs in the same tab strip are entirely seeded, and nothing in the strip distinguishes them from the Equipment tab.

## 4. Actions and writes

**The Equipment pane dispatches no `createAction` at all.** `src/modules/inventory/Inventory.tsx:1-67` imports nothing from `src/actions/`, so `checkCapability` (`src/actions/core.ts:124-218`) is never consulted from this pane and nothing here can hit the `default: return undefined` denial at `src/actions/core.ts:215-216`.

Every control on the Equipment pane and where it goes:

| Control | Handler | Effect | Built? |
|---|---|---|---|
| `Refresh` (`:1387`) | `refreshAll` (`:1288-1304`) | Calls `.refetch()` on the list and all six KPI queries — seven round trips | Yes |
| `Import` (`:1391-1394`) | **none** | `<Button disabled>` inside `Unavailable`, reason "Import is not built — there is no catalogue intake pipeline in this release." | No — dead by construction |
| `Export` (`:1401-1403`) | `exportCsv(list.rows, money)` (`:1100-1133`) | Builds a CSV string from the rows **on this page**, `URL.createObjectURL` → synthetic `<a download="inventory-page.csv">.click()`. No network, no table | Yes, client-side only |
| `Add Equipment` (`:1405-1407`) | `navigate('/inventory/new')` | Route mounted at `src/App.tsx:279-286` → `AddEquipment.tsx` | Navigation only |
| Empty-state `Add Equipment` (`:1812`) | same `navigate` | Rendered only when `filtersOn` is false | Navigation only |
| Tab buttons (`:1449-1475`) | `setTab` (`:1168-1176`) | Rewrites `?tab=` with `{ replace: true }` | Yes |
| Six chips (`:1534-1566`) | `setChip` + `setPage(1)` | Local state → `inventoryQuery` → server filter | Yes |
| `Clear Filters` (`:1571-1595`) | `clearFilters` (`:1218-1222`) | Resets facets and chip | Yes |
| Rail group headers (`:1009-1037`) | `toggleGroup` | Local open/closed set, seeded with `Category` and `Status` open (`:941`) | Yes |
| Rail checkboxes (`:1054-1059`) | `toggleFacet` (`:1205-1216`) | Local `Facets` → server filter | Yes |
| Rail `Reset` (`:968-986`) | `clearFilters` | Disabled when `activeCount === 0` | Yes |
| `Save Current View` (`:1079-1083`) | **none** | `<Button disabled>` in `Unavailable`, reason "Saved views are not built — there is nowhere to store one." | No — dead by construction |
| `Bulk Actions` (`:1692-1696`) | **none** | `<Button disabled>` in `Unavailable`, citing §4.1 (status is Status-Engine-written) plus "Nothing else is built to act on a selection yet." | No — dead by construction |
| Row `more_vert` glyphs (`:528-532`, `:676-680`, `:803-806`) | **none** | A bare `<Icon>` inside `Unavailable` — not a `<button>`, so there is no click to swallow | No — deliberately not a control |
| Row / header / card checkboxes (`:583-589`, `:764-770`, `:1872-1878`) | `toggleRow` / `toggleAllOnPage` (`:1353-1368`) | Mutates a `Set<string>` of `products.id`. Nothing consumes it except the "N selected" label and `Clear selection` | Renders; leads nowhere (see §7) |
| `Clear selection` (`:1673-1688`) | `setSelected(new Set())` | Yes |
| Expand chevron / `Show units` (`:594-611`, `:831-855`) | `setOpen` → `useUnitsOnDemand` (`:413-459`) | Read-only `listUnits` call | Yes |
| Units `Retry` (`:687-702`) | `units.retry` (`:453-456`) | Clears the request key, bumps a nonce, refetches | Yes |
| `Sort by` (`:1700-1723`) | `setSort` + `setPage(1)` | Three options map to `.order()`; two render `disabled` with a reason (`src/lib/queries/inventory.ts:1023-1035`) | Partly — see §7 |
| Equipment column header (`:1882-1903`) | `setSort` A–Z ⇄ Z–A | Yes |
| Density toggle (`:1726-1744`) | `setDensity` | Cell padding only (`:83-89`) | Yes |
| Table/grid toggle (`:1748-1768`) | `setView` | Ignored below 768 (`:1814`) | Yes |
| `Rows per page` (`:1961-1975`) | `setRowsPerPage` + `setPage(1)` | Yes |
| Pager buttons (`:1983-2055`) | `setPage` | Yes |

**One action is reachable from this route**, from the embedded Stock Check pane at `/inventory?tab=stock-check`:

| Dispatch | Capability | Action file | `implemented` | Mapped by `checkCapability`? |
|---|---|---|---|---|
| `RECONCILE_STOCK_CHECK` — "Reconcile & complete audit", `src/modules/inventory/StockCheck.tsx:168-185` | `inventory.audit` | `src/actions/inventory/reconcileStockCheck.ts:9-12` | **Not set** → defaults `false` (`src/actions/core.ts:89`) | **Yes** — `src/actions/core.ts:202` → `rbac.canWriteFloor` (`src/lib/rbac.ts:227-229`) |

It renders, dispatches `RECONCILE_STOCK_CHECK`, and the action is a stub: `createAction` throws `ActionNotImplementedError` at `src/actions/core.ts:223-225`, **before** the permission check, `validate` or `execute`. The pane catches it and shows the message inline (`src/modules/inventory/StockCheck.tsx:181-184`), and the session status is only flipped after a resolve that cannot happen (`:180`). `Bundles.tsx`, `Maintenance.tsx` and `DamageTab.tsx` dispatch nothing at all.

## 5. Gates

**Route access — every signed-in role.** `Shell` redirects when `!user` (`src/App.tsx:973-975`) and otherwise refuses only money surfaces: `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`src/App.tsx:993`). `MONEY_ROUTES` is `/finance`, `/reports`, `/admin`, `/tools/pricing`, `/tools/depreciation` (`src/data/nav.ts:147-153`) — `/inventory` is not among them. No role check exists inside `Inventory.tsx`.

**The real row gate is in the database, not the UI.** Both views carry `where auth_is_staff()` — `product_units_v` at `supabase/migrations/0048_view_row_predicates.sql:596`, `products_v` at `:671` — and `auth_is_staff()` is `auth_user_role() <> 'Client'` (`supabase/migrations/0014_business_8_policies.sql:65-71`). A Client-role session therefore reaches the screen and receives zero rows, which the screen draws as "No equipment yet" (§6), not as a restriction.

**Money — `useCanViewMoney()` at `src/modules/inventory/Inventory.tsx:1189`.** It returns `canViewMoney(user.role)`, `false` for no session (`src/lib/moneyVisibility.ts:24-27`); `MONEY_BLIND = { Warehouse, Technician, Driver, Client }` (`src/lib/rbac.ts:45-50`). What that boolean does here:

| Surface | Money-blind behaviour | Evidence |
|---|---|---|
| The query itself | `withMoney` is spread on the gate, so the select string never names `daily_rate` or `replacement_value` at all | `:1258-1264`, columns `src/lib/queries/inventory.ts:540,788` |
| Units query | Same gate, and the cache key includes it so a role change refetches | `:419,433` |
| Table column | The `Replacement / unit (NPR)` header and every cell are **omitted**, not blanked; `tableColumns` drops from 10 to 9 | `:1371,1915,671-675,521-525` |
| Phone card | The `Rs …/day` line is omitted; the unit card's `Replacement …` line is omitted | `:816-824,917-921` |
| Grid card | The value line is omitted | `:1858-1862` |
| CSV export | Two columns are absent from the header and from every row; a masked-or-unasked figure would export as an empty cell, never `0` | `:1102,1117-1121` |
| Filter rail | The `Purchase Value` greyed row (`money: true`) is filtered out of the rail entirely | `:989`; flag `src/data/inventory.ts:830` |
| Hover Intel card | The `Money` group and the glance's `Replacement …` line are never constructed | `src/data/inventory.ts:948-950,999-1007` |

The view masks the nine money columns independently (`CASE WHEN auth_can_view_money() THEN … ELSE NULL`, `supabase/migrations/0048_view_row_predicates.sql:616-648`), so not asking is belt-and-braces rather than the only protection.

**A second, stricter money gate also runs on this screen.** The hover card uses `canViewMoneyField(gctx, 'asset-finance')` (`src/lib/fieldGating.ts:67-72`) over `gctx = gateContext(role)` (`src/modules/inventory/Inventory.tsx:1199-1200`), and `moneyScope` gives `Coordinator` only `booking-and-client-balance` (`src/lib/fieldGating.ts:55-62`). See §7 item 3 for the divergence that produces.

## 6. States drawn

`PageBody` is used for the Equipment list (`src/modules/inventory/Inventory.tsx:1793-1813`), in its fixed restricted → error → loading → empty → children ladder (`src/components/ui/PageBody.tsx:143-206`).

| State | Present? | How |
|---|---|---|
| Loading | Yes, shared | `loading={list.loading}` → `LoadingSkeleton type="table" rows={6} label="Loading equipment…"` (`:1794,1802-1803`; `src/components/ui/PageBody.tsx:182-184`) |
| Error | Yes, shared, both shapes | `error={list.error}` + `hasRows={list.rows.length > 0}` + `onRetry={refreshAll}` (`:1795-1797`). With rows on screen the banner renders **above** them and the table survives; with none it replaces the body (`src/components/ui/PageBody.tsx:161-179`). `useList` deliberately keeps the old rows on a failed refetch (`src/lib/queries/useList.ts:196-199`) |
| Empty | Yes, shared, both variants | `empty={list.isEmpty \|\| query.impossible}`, `emptyIsFiltered={list.isFiltered}` (`:1798-1799`). Filtered → "No equipment matches these filters" + `Clear filters`; unfiltered → "No equipment yet" + `Add Equipment` (`:1804-1812`) |
| Restricted | **None** | `restricted` is never passed to `PageBody` (props at `:1793-1813`), and `RestrictedState` (`src/components/ui/StateViews.tsx:213`) is not imported by this file. The only `RestrictedState` that can appear on this route is `Shell`'s money-surface refusal (`src/App.tsx:1020-1023`), which `/inventory` never triggers |

Hand-rolled states outside `PageBody`:

- The lazy unit expansion draws its own three states inline — "Loading units…", an error line plus a `Retry` link, and "This model has no unit rows yet." — as full-width table rows (`:683-707`) and as card-mode spans (`:858-866`).
- The sort-unavailable banner (`:1775-1780`) is a persistent inline paragraph, not a toast.
- Six KPI values render `—` rather than `0` while loading, on error, or on a null total (`countOf`, `:241-243`).
- `Showing … of —` when `total` is null (`:1953`).

## 7. Known gaps

1. **The `impossible` empty message prints `[object Object]`.** `src/modules/inventory/Inventory.tsx:1807` interpolates `${chip}` into `` `The “${chip}” chip and the Status filter do not overlap…` ``, but `chip` is an `EquipmentChip` **object** (`:1178`, type `src/data/inventory.ts:297-300`), not a string — the string member is `chip.label`. The sibling explainer three hundred lines earlier gets this right (`:1614,1620` use `chip.label`). Reproduce: pick the `On Rent` chip, then tick only `In Stock` in the rail's Status group — `inventoryQuery` intersects the two on `unit_state.status`, finds no overlap, and sets `impossible` (`:191-193`).

2. **Row selection leads nowhere and is never cleared.** `selected` (`:1186`) is written by three controls (`:1353-1368`) and read by exactly two things: the `"N selected"` label (`:1670`) and `Clear selection` (`:1673`). The only consumer that would act on it, `Bulk Actions`, is disabled by construction (`:1692-1696`). Nothing resets it when the chip, the facets, the page or the rows-per-page change (`:1205-1216,1218-1222,1537-1540,1963-1965,1986`), so the count can name models that are not on screen and cannot be reached again except by clearing.

3. **Two money gates disagree for Coordinator, on one screen.** `useCanViewMoney()` is `true` for Coordinator (`src/lib/rbac.ts:36-50` — Coordinator is not in `MONEY_BLIND`), so `money` is true and the table renders the `Replacement / unit (NPR)` column and the CSV carries both money columns (`:1371,1915,1102`). The hover card on the same rows uses `canViewMoneyField(gctx,'asset-finance')`, which is `false` for Coordinator (`src/lib/fieldGating.ts:55-72`), so the `Money` group and the glance's `Replacement …` line are omitted (`src/data/inventory.ts:948-950,999`). A Coordinator therefore sees the replacement value in the table and is told nothing about it in the card built from the same row.

4. **The screen shows two different words for one state.** `INV_LABEL` exists specifically to render `'In Stock'` as **"Available"** at the render boundary (`src/data/inventory.ts:249-260`, reasoning `:225-248`), and the chip, badges, breakdown, KPI labels and CSV all go through it. The filter rail does not: its Status group's options are `INV_ORDER`, the raw enum members (`src/data/inventory.ts:781`), and `FilterRail` prints the option verbatim (`src/modules/inventory/Inventory.tsx:1060`). So at desktop the chip row says **Available** and the rail checkbox 20 cm to its left says **In Stock**, for the same filter over the same column.

5. **The file states it does not use `CollapsibleAside`; it does.** `src/modules/inventory/Inventory.tsx:1633-1635` — "It is deliberately not wrapped in `CollapsibleAside` — other pages depend on that component's collapse-by-default and this page must not change it." The rail is rendered as `<SideRail width={216} label="Categories">` (`:1646`), and `SideRail` **is** `CollapsibleAside` (`src/components/ui/Page.tsx:400-416`). The stated outcome survives by accident: `SideRail` is only mounted at `viewport === 'desktop'` (`:1645`), and `CollapsibleAside` defaults collapsed only at phone and tablet (`src/components/ui/CollapsibleAside.tsx:37`). What the comment does not account for is the collapse handle it inherits and the per-route `localStorage` memory under the key `left:/inventory` (`src/components/ui/CollapsibleAside.tsx:30,37`, `src/lib/collapse.ts`): an operator who collapses the rail once finds it collapsed on every later visit, with `Expand Categories` as the only way back.

6. **The rail's own heading and its collapse label disagree.** The card's `<h2>` says "Filters" (`:967`) while the wrapper is labelled `Categories` (`:1646`), so the handle's `aria-label`/`title` read "Collapse Categories" over a panel headed Filters (`src/components/ui/CollapsibleAside.tsx:68-69,165`).

7. **Two of the five sorts cannot run, and are handled twice.** `SORT_UNAVAILABLE` covers `'Units, most first'` and `'Needs attention first'` (`src/data/inventory.ts:1050-1055`); `inventorySort` returns `null` for both (`src/lib/queries/inventory.ts:1031-1033`) and `inventoryQuery` falls back to `name asc` while reporting the reason (`src/modules/inventory/Inventory.tsx:201-202`). The `<option>`s are also `disabled` (`:1718`), so the banner at `:1775-1780` is unreachable through the UI — it can only fire if `sort` is set some other way. `TODO(persistence)` for both: a `product_unit_counts` view (`src/lib/queries/inventory.ts:1011-1013`, `src/data/inventory.ts:1047-1048`).

8. **Ten of the fourteen filter-rail rows have no query behind them** — Brand, Location, Warehouse, Case, Booking, Supplier, Purchase Date, Purchase Value, Tags, Saved Views (`src/data/inventory.ts:774-845`). Each carries its own reason and eight of the ten name a column that exists. `Location` and `Booking` were live `FacetKey` members and are not any more (`src/data/inventory.ts:672-681`).

9. **A state chip silently cannot reach a quantity- or consumable-tracked SKU.** State lives on `product_units`; those SKUs have no unit rows, so the `!inner` semi-join drops them (`src/lib/queries/inventory.ts:96-102,776-778`). The screen says so in the chip explainer (`:1609-1625`) and in the glance (`src/data/inventory.ts:942-946`), but a quantity SKU still simply vanishes from the table the moment any state chip is pressed.

10. **No on-hand figure exists for a quantity-tracked SKU.** `TODO(persistence)` at `src/lib/queries/inventory.ts:135-136`: `products` carries `total_quantity` and `reorder_level` and nothing else, so `stockLabel` prints the total with its unit of measure and states nothing about how many are on the shelf (`src/data/inventory.ts:870-879`). The mock's `'142 of 200'` is deliberately unreproducible.

11. **`TODO(decision)`s that reach this page.** (a) `products.status` vs `products.is_active` — two liveness flags with nothing in the schema relating them; `catalogue()` narrows on `status` alone and the Intel card states both unreconciled (`src/lib/queries/inventory.ts:920-924`, `src/data/inventory.ts:987-996`). (b) Whether the six-chip row is meant to be the complete status vocabulary or a shortcut over a rail that still offers all ten (`src/data/inventory.ts:287-295`). (c) A `PageBody`-wide one: a refetch **in progress** still blanks a good list, because `loading` outranks `children` unconditionally (`src/components/ui/PageBody.tsx:46-57`) — so `Refresh` (`:1387`) replaces the table with a skeleton for the duration of seven queries.

12. **The CSV's money columns are formatted strings, not numbers.** The header says `Daily rate (NPR)` / `Replacement / unit (NPR)` (`:1102`) but the cells are `formatMoney(...)` (`:1119-1120`), which returns `Rs 6,500` with a currency prefix and lakh grouping (`src/lib/money.ts:62-69`). A spreadsheet reads the column as text. The file name is `inventory-page.csv` (`:1130`) and the export covers only the rows on the current page — stated in the button's wrapper `title` (`:1399`) and in the function's own comment (`:1094-1099`).

13. **The Damaged chip ORs with the rail, where the status chip ANDs.** A status chip and the rail's Status group are intersected on the same column, and a non-overlap is refused (`:181-194`). The Damaged chip instead **adds** its condition to whatever the rail's Condition group already holds (`:1241-1246`), so ticking `Excellent` in the rail and then pressing `Damaged` widens the result to models having an Excellent unit **or** a Damaged unit. Consistent with the two-alias semantics (`src/lib/queries/inventory.ts:470-479`), but the two chip kinds behave oppositely against the rail and nothing on screen says so.

14. **Comment counts and cross-references are stale.** (a) `src/lib/queries/inventory.ts:327` and `:178` say `CATEGORY_ICON` leaves "nine categories" without an icon; `CATEGORY_ICON` has seven entries (`src/data/inventory.ts:660-668`) against seventeen enum members (`:709-727`) — ten lack an icon, and `src/data/inventory.ts:706-707` repeats the same wrong nine. (b) `src/lib/queries/inventory.ts:161-165` says "a full read of all 1467 lines finds only checkboxes"; the file is 2088 lines. (c) The same module points at `Inventory.tsx:1021-1059` for the chip row (`:70`), `:875-879` for the old in-memory predicates (`:463,477`) and `:293` for `ParentRowView`'s `open` (`:838`); the current lines are `:1524-1568`, `:181-194` and `:565`.

15. **The page has no search input, so the search half of the query is never exercised from here.** `SEARCH_COLUMNS` is defaulted for other callers (`src/lib/queries/inventory.ts:556,802`) and `sanitiseSearchTerm` guards it (`src/lib/queries/listQuery.ts:105-116`), but `Inventory.tsx` passes no `search`. The search box the operator sees in the header belongs to `Shell` and is a command-palette trigger that dispatches a synthetic ⌘K keydown (`src/components/shell/Header.tsx:109-147`), not a filter on this list.

16. **Three of the four tabs on this route are seed-only, and the tab strip does not distinguish them.** Bundles, Maintenance and Stock Check read `src/data/bundles.ts`, `src/data/maintenance.ts` and `src/data/stockCheck.ts` and import no query module (§3), while Equipment is fully database-backed. `MockBanner` marks mock **mode**; nothing marks a seeded **pane** inside a live session.

17. **Stock Check's one write is a stub that the pane treats as the gate to a status change.** `reconcileStockCheck` sets no `implemented`, so it defaults `false` (`src/actions/inventory/reconcileStockCheck.ts:9-12`, `src/actions/core.ts:89`) and throws before `validate`/`execute` (`src/actions/core.ts:223-225`) — its `execute` is a `console.log('[DB TX] …')` (`:19`). The capability `inventory.audit` **is** mapped (`src/actions/core.ts:202`), so the failure an operator sees is the build-gap message, not a permission error. Reachable from this route at `?tab=stock-check` (`src/modules/inventory/Inventory.tsx:1492`).
