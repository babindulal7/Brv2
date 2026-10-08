# Cinematography Tools
Route `/tools/cinematography` · `src/modules/settings/Tools.tsx` · 1616 lines · **Status: Partial**

Mounted at `src/App.tsx:693-700` inside `<Shell crumbs={[{ label: 'Tools' }, { label: 'Cinematography' }]} search="Search tools, formulas…">`; lazy-imported at `src/App.tsx:73`. The old path `/settings/tools` is a `replace` redirect to this route (`App.tsx:701`), and both paths are listed in `BUILT` (`App.tsx:779-780`) so `UNBUILT` (`App.tsx:793-804`) does not mount a `Placeholder` over either. The only in-app entry point is the Tools landing card at `src/modules/tools/ToolsLanding.tsx:100-107`.

## 1. What it is

A suite of ten calculators plus a registry of 27 named tools, all of it client-side. Eight camera/lens calculators use formulas transcribed into `src/data/tools.ts:78-263`; two money calculators call `price()` and `discountGate()` in `src/lib/money.ts:125-140` and `:164-171` rather than doing arithmetic in the component (`Tools.tsx:715-724`, `:783`).

Nothing on the page is fetched and nothing is written to a database. The import block (`Tools.tsx:1-44`) contains no `src/actions/`, no `src/lib/queries/`, no `supabase` and no `corpus` import; the only persistence is a `localStorage` favourites array (`src/data/tools.ts:787-809`).

The remaining 17 registry entries are either deep links into other modules or blocked tiles that render a stated reason (`src/data/tools.ts:386-392`).

## 2. What renders

Top to bottom at desktop:

1. **Page header** — `PageHeader` with `icon="tool"`, title `Tools`, description `Calculators and utilities that have no home elsewhere. Anything with a module is opened there, never rebuilt here.` (`Tools.tsx:1148-1174`). `PageHeader` is `src/components/ui/Page.tsx:66-108`. Its `actions` slot holds one hand-rolled `<Link to="/settings">` styled as a secondary button, **Back to Settings**, `height: 34` (`Tools.tsx:1153-1173`).
2. **Registry error banner** — `<ErrorBanner title="The tool registry does not reconcile">` over a `<ul>` of `SEED_ERRORS` (`Tools.tsx:1176-1187`; `ErrorBanner` at `src/components/ui/StateViews.tsx:171-210`). Rendered only when `SEED_ERRORS.length > 0` — see §7.1.
3. **KPI strip** — `<KpiStrip items={KPIS} />` (`Tools.tsx:1189`), four tiles defined at `:1052-1057`: `Tools Used Today`, `Documents Generated`, `Labels Printed`, `Failed Jobs`. **Every `value` is the literal string `'—'`**; each carries a `note` naming why (`No tool-execution log exists (§11)`, `Counted by Finance ▸ Documents`, `Nothing prints a label yet`, `Owned by System Monitor`). `KpiStrip` is `Page.tsx:203-304`.
4. **Explanatory strip** — a `cardStyle` row with an `info` glyph explaining that the four locked headline figures cannot be supplied (`Tools.tsx:1191-1198`).
5. **Two-track grid** — `gridTemplateColumns: 'minmax(0,1fr) auto'`, hardcoded at every width (`Tools.tsx:1200`).
   - **Left column** (`:1201-1451`):
     - **Open calculator card** — rendered only when a tile has been opened (`:1204-1218`): `Card title={open.name}` whose `action` slot holds a `FavouriteButton` (`:867-900`) and a `Button icon="close"` (`:1210-1212`). The body is one of ten components resolved through `CALCULATORS` (`:824-835`): `CropCalculator` (`:311-361`), `FovCalculator` (`:364-399`), `DofCalculator` (`:402-445`), `NdCalculator` (`:448-506`), `ShutterCalculator` (`:509-544`), `TimecodeCalculator` (`:547-611`), `StorageCalculator` (`:614-660`), `BatteryCalculator` (`:663-700`), `PriceCalculator` (`:703-774`), `DiscountCalculator` (`:777-822`). Each renders a `Formula` block (`:240-259`), a `fieldGrid` of `NumField`/`SelectField` (`:281-286`, `:116-180`) and a `Results` panel (`:191-237`); Storage, Battery and Price additionally render a `Gap` note (`:261-279`) at `:650-657`, `:691-697` and `:764-771`. Discount renders a `role="status"` pass/fail strip instead of `Results` (`:801-819`).
     - **`Card title="Tool Categories"`** (`:1221-1334`), wrapped in the `categoriesRef` div (`:1220`). Header actions: a **Favourites** toggle button, `height: 30`, `aria-pressed` (`:1225-1247`); a category `<select aria-label="Filter by category">`, `height: 30`, listing `All Categories` plus only the groups that still have tools (`:1249-1261`); and two 30×30 view-mode buttons, grid and list (`:1263-1284`). Body is either `EmptyState` (`:1288-1298`) or one `<section>` per group (`:1301-1331`) — group title, a live `N tools` count, the group's `note` paragraph, then a grid of `ToolTile`s: `repeat(auto-fill, minmax(232px, 1fr))` in grid view, `1fr` in list view (`:1313`).
     - **`ToolTile`** (`:902-1031`) — 30px icon chip in the group accent, tool name, `FavouriteButton` (suppressed on blocked tiles, `:944`), blurb, the blocked reason when present (`:949-951`), and a footer row of `StateChip`s (`:839-865`): `Runs here` / `Opens {owner}` / `Unavailable`, plus `Needs a decision` when `tool.decision` is set (`:969-973`). Blocked tiles are dashed, transparent and shadowless (`:981-983`). The primary target is a transparent full-card overlay — a `<button>` for calculators (`:1017`), a `<Link>` for deep links (`:1026`) — with the favourite control lifted above it at `zIndex: 2` (`:893-894`); blocked tiles get no overlay at all (`:1030`).
     - **Three-up panel row** — `repeat(auto-fit, minmax(230px, 1fr))` (`:1338`): `Favourite Tools` (`:1339-1352`), `Recent Tools` (`:1354-1367`), `Quick Actions` (`:1369-1396`). Each lists `PanelRow`s (`:1575-1616`). Quick Actions ends with a text button **More — show every tool →** (`:1375-1391`) and a paragraph stating that Backup Database is deliberately absent (`:1392-1395`). Both empty panels render a hand-written paragraph, not `EmptyState` (`:1341-1344`, `:1356-1359`).
     - **`Card title="Where the render's fifteen categories went"`** (`:1399-1432`) — an intro paragraph and a two-column `<table>` (`Render category` / `Ruling`) over `RENDER_DISPOSITION`, inside an `overflowX: 'auto'` box with `minWidth: 440` (`:1405-1406`). Header cells use `thStyle` from `src/components/ui/TableHeaderCell.tsx`; body cells use the local `tdStyle` (`:1529-1534`).
     - **`Card title="Open — needs Babin"`** (`:1434-1450`) — five flagged questions from `OPEN_DECISIONS` (`:1063-1084`), each a question line plus a why line.
   - **Right rail** — `<Rail>` (`Tools.tsx:1453-1519`; `Page.tsx:315-331` → `CollapsibleAside`, `src/components/ui/CollapsibleAside.tsx:15-185`) holding five cards:
     - `Tool Summary` (`:1454-1468`) — `Donut` + `Legend` (`src/components/ui/Charts.tsx:81-152`, `:154-…`) over two slices, `centreLabel="Registered"`, then two `RailRow`s (`:1536-1546`) for favourite count and opened-this-session count, then a paragraph asserting `Available + Unavailable = Registered`.
     - `What Tools owns` (`:1470-1477`), `Alerts` — deliberately empty, prose only (`:1489-1496`), `AI Tool Recommendations` — deliberately dark, prose only (`:1498-1505`), `Keyboard` — two `ShortcutRow`s for `Ctrl / ⌘ + K` and `Ctrl / ⌘ + B` (`:1507-1518`, `:1548-1567`).
6. **Footer note bar** — `<FooterNote extra={['Tools lives inside Settings — Foundation §5.1 keeps it out of the sidebar']} />` (`:1522`; `Page.tsx:443`).

**Responsive bands: this file reads neither 768 nor 1180.** `Tools.tsx:1-44` does not import `src/lib/device.ts`, and the string `useViewport`, `useCapability`, `768` and `1180` appear nowhere in the file. Every width response it has is either a CSS intrinsic grid (`fieldGrid` `minmax(160px, 1fr)` at `:283`; tiles `minmax(232px, 1fr)` at `:1313`; panels `minmax(230px, 1fr)` at `:1338`) or inherited from a shared component:

| what | who reads the band | effect |
|---|---|---|
| `KpiStrip` (`Tools.tsx:1189`) | `Page.tsx:210-212` → `device.ts:57-79`, `BREAKPOINT = { phone: 768, desktop: 1180 }` (`device.ts:43`) | 4 tiles → max 2 below 768, max 3 from 768–1179 |
| `Rail` (`Tools.tsx:1453`) | `CollapsibleAside.tsx:29,37` | collapsed by default at **both** phone and tablet — the five rail cards become a 44px chevron handle |
| page grid `minmax(0,1fr) auto` (`Tools.tsx:1200`) | nobody | the rail track survives at every width; it just narrows to the handle |
| disposition table (`:1405-1406`) | nobody | horizontal scroll below ~440px rather than the card rows `device.ts:139-141` exists for |

## 3. Data sources

| screen area | source kind | detail |
|---|---|---|
| Tool registry — all 27 tiles, names, blurbs, icons, groups, blocked reasons | SEED | `TOOLS`, `src/data/tools.ts:447-716`. 10 `calculator`, 9 `link`, 8 `blocked` (`tools.ts:455`,`463`,`471`,`479`,`487`,`495`,`503`,`511`,`521`,`530` / `548`,`583`,`591`,`638`,`646`,`657`,`665`,`673`,`681` / `558`,`570`,`600`,`612`,`624`,`690`,`701`,`712`). |
| Group headings and their explanatory notes | SEED | `TOOL_GROUPS`, `tools.ts:404-429` — `camera` (primary), `finance` (success), `production` (progress), `deeplink` (neutral). |
| Sensor formats and circle-of-confusion values | SEED | `SENSOR_FORMATS`, `tools.ts:64-68` — FF 36×24/0.029, S35 24.89×18.66/0.019, MFT 17.3×13/0.015. The file argues these are published format definitions rather than business figures (`tools.ts:58-63`). |
| Frame-rate list and drop-frame capability | SEED | `FRAME_RATES`, `tools.ts:175-184` — eight rates; `dropCapable` true only at 29.97 and 59.94. |
| Battery usable-capacity constant | SEED | `USABLE_CAPACITY = 0.85`, `tools.ts:254`; the `+1 spare` rule at `tools.ts:261-263`. |
| Every calculator's prefilled default | SEED | Inline `useState` seeds: FF/36/24/50mm/T2.8 (`Tools.tsx:312-316`), S35/35mm/3 m (`:365-367`), FF/50/2.8/3 (`:403-406`), ND8/T2.8/1-48/ISO800 (`:449-453`), 24 fps/180°/48 (`:510-512`), 29.97 DF at 01:00:00:00 (`:548-553`), 4 h 0 m / 1 camera (`:616-618`), 10 h shoot (`:666`), 13% VAT / 0% discount (`:709-710`), 12% discount (`:778`). |
| The four KPI tiles | SEED | `KPIS`, `Tools.tsx:1052-1057` — all four `value` fields are the literal `'—'`. No figure is drawn. |
| Render-disposition table (15 rows) | SEED | `RENDER_DISPOSITION`, `tools.ts:731-747`. |
| `Open — needs Babin` questions (5 rows) | SEED | `OPEN_DECISIONS`, `Tools.tsx:1063-1084`. |
| Donut, legend, `Registered` centre value, `N tools` group counts | computed | `Tools.tsx:1132-1138` and `:1306` — counted from the (role-filtered) registry array, never typed. |
| Favourites list | LOCAL (browser) | `localStorage` key `babin.tools.favourites` (`tools.ts:787`), read at `tools.ts:789-800`, written at `:802-809`, mounted at `Tools.tsx:1095`. Not `corpus.ts` — see the row below. |
| Recent list | ephemeral | `useState<string[]>([])` (`Tools.tsx:1096`), capped at 5 (`:1121`). Lost on reload; the page says so at `:1356-1359`. |
| All calculator outputs | computed | `tools.ts:78-263` (optics/timecode/storage/battery) and `src/lib/money.ts:125-140`, `:164-171` (price, discount gate). |
| — | DB | **None.** No table, view, RPC or query file. `Tools.tsx:1-44` imports nothing from `src/lib/queries/`, `src/lib/dataAccess`, or `supabase`. |
| — | LOCAL (`corpus.ts`) | **Nothing on this page is served by it.** A case-insensitive search of `src/lib/mock/corpus.ts` for `tool` and `favourite`/`favorite` returns no match: there is no `tools` table, no favourites table, and no tool-execution log in the local store — all three are **UNSERVED**. |

Invented on this page: the tool registry itself — 27 tool names, blurbs, group assignments and blocked-reason sentences authored in `src/data/tools.ts:447-716`, plus the four group notes (`:404-429`), the fifteen render rulings (`:731-747`) and the five open questions (`Tools.tsx:1063-1084`). Also invented: every prefilled input default listed above, notably the **13% VAT** seeded at `Tools.tsx:710` (the field's own hint at `:745` says §2.1 wants this read from Settings ▸ Finance and no settings store exists), the **0.85** usable-capacity constant (`tools.ts:254`) and the **+1 spare** battery rule (`tools.ts:262`). No rupee amount, count or measurement is invented: the four KPI tiles carry `'—'`, and the donut and every group count are computed from the registry.

## 4. Actions and writes

**No dispatch. No capability string. No database write.** `Tools.tsx` imports nothing from `src/actions/` (`:1-44`), so `createAction`'s fail-closed `implemented` check (`src/actions/core.ts:220-254`, default `false` at `:223-225`) and `checkCapability` (`core.ts:124-218`) are never reached from this route. There is no capability to look up in that switch, and neither `ActionNotImplementedError` (`core.ts:95-105`) nor `ActionPermissionError` (`core.ts:108-117`) can be raised here.

The only persistence of any kind is a browser-local write:

| control | file:line | handler | effect |
|---|---|---|---|
| `FavouriteButton` (tile, panel row, open-calculator header) | `Tools.tsx:867-899`; used at `:944`, `:1209`, `:1348` | `onToggle` → `toggleFavourite` (`:1111-1117`) | `setFavourites` + `writeFavourites(next)` → `localStorage['babin.tools.favourites']` (`tools.ts:802-809`). Failures are swallowed by design (`tools.ts:806-808`). |
| Tile overlay (calculator tools) | `:1017` | `onOpen` → `openTool` (`:1119-1122`) | `setOpenId`, unshift onto `recent`, slice to 5 |
| Tile overlay (link tools) | `:1026` | `<Link to={tool.action.to}>` | client-side navigation |
| Blocked tile | `:1030` | none by construction — no overlay, no favourite button (`:944`) | inert card; renders `tool.action.reason` (`:949-951`) |
| `Close` button on the open calculator | `:1210-1212` | `setOpenId(null)` | local |
| `Favourites` filter toggle | `:1225-1247` | `setOnlyFavourites((v) => !v)` | filters `visible` (`:1127-1130`) |
| Category `<select>` | `:1249-1261` | `setGroup` | filters `visible` |
| Grid / list view buttons | `:1263-1284` | `setView` | changes `gridTemplateColumns` (`:1313`) and `minHeight` (`:990`) |
| `EmptyState` → `Clear filters` | `:1293-1297` | clears both filters | local |
| `More — show every tool →` | `:1375-1391` | `showEveryTool` (`:1105-1109`) | clears both filters **and** `scrollIntoView` on `categoriesRef` |
| `PanelRow` (Favourites / Recent / Quick Actions) | `:1602-1612` | `<button onClick={onOpen}>` for calculators, `<Link>` for link tools, inert `<div>` for blocked | local / navigation |
| `Back to Settings` | `:1153-1173` | `<Link to="/settings">` | navigation |
| Every calculator input | `:136-151`, `:171-177`, `:584`, `:795`, `:798` | `setX` | local state only |

Buttons with no handler: **none.** Every `<button>` in the file is wired. What is dead here is not a button but three destinations — see §7.3 and §7.4.

## 5. Gates

**Route reach.** `Shell` holds during session restore (`App.tsx:964-970`), redirects to `/login` without a session (`:973-975`), then computes `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`App.tsx:993`). `MONEY_ROUTES` is `['/finance', '/reports', '/admin', '/tools/pricing', '/tools/depreciation']` (`src/data/nav.ts:147-153`) and `isMoneySurface` prefix-matches on a path segment (`nav.ts:156-159`). **`/tools/cinematography` is not in that list**, so:

- **Reach the page:** all nine `SystemRole` members (`src/types/database.ts:116-125`) — Owner, Admin, Manager, Coordinator, Warehouse, Technician, Accounts, Driver, Client. There is no role check on this route in `App.tsx:693-700` and no `RestrictedState` anywhere in `Tools.tsx`.
- **Refused:** nobody.

The landing card that links here is likewise ungated: `ToolsLanding.tsx:96-109` puts the `Cinematography suite` group outside the money filter at `:130-135`, because `/tools/cinematography` is not a money route.

**Money visibility.** `useCanViewMoney()` (`src/lib/moneyVisibility.ts:24-27` → `canViewMoney`, `src/lib/rbac.ts:36-38`, `MONEY_BLIND = {Warehouse, Technician, Driver, Client}` at `rbac.ts:45-50`) is called once, at `Tools.tsx:1087`, and used once, at `:1093`:

```ts
const tools = useMemo(() => TOOLS.filter((t) => money || !t.money), [money])
```

**What Law 6 hides:** the five tools flagged `money: true` are removed from the array **before render** — `price` (`tools.ts:522`), `discount` (`:531`), `depreciation` (`:549`), `profit` (`:561`), `currency` (`:573`). Nothing is greyed or masked. Because `tools` is the source for the group `<select>` (`Tools.tsx:1256`), the grid (`:1301`), the donut (`:1132-1138`), Quick Actions (`:1140`), Favourites (`:1141`) and Recent (`:1142`), a money-blind session sees:

| | registered | available | unavailable | groups shown |
|---|---|---|---|---|
| Owner · Admin · Manager · Coordinator · Accounts | 27 | 19 | 8 | 4 |
| Warehouse · Technician · Driver · Client | 22 | 16 | 6 | 3 — `Rental & Finance` disappears entirely |

Quick Actions (`dof`, `timecode`, `shutter` — `Tools.tsx:1060`) are all camera tools, so that panel is identical for every role.

## 6. States drawn

`Tools.tsx` does **not** import `src/components/ui/PageBody.tsx:119-207`. It imports two of the four state components directly (`Tools.tsx:11`): `EmptyState` and `ErrorBanner`. `LoadingSkeleton` and `RestrictedState` are not imported.

- **Loading — none in the page.** There is no query to be loading. The reader sees `Shell`'s Suspense fallback `<LoadingSkeleton type="card" label="Loading…" />` while the lazy chunk arrives (`App.tsx:1026`), and nothing after that.
- **Error — present but unreachable.** `ErrorBanner` at `Tools.tsx:1176-1187`, gated on `SEED_ERRORS.length > 0`. See §7.1: the three invariants that populate `SEED_ERRORS` (`tools.ts:763-782`) cannot currently fail. `Shell` also wraps the route in `<ErrorBoundary>` (`App.tsx:1025`).
- **Empty — one real `EmptyState` plus two hand-rolled ones.** `EmptyState` (`StateViews.tsx:34-84`) is used at `Tools.tsx:1288-1298` — `No tools match`, with a `Clear filters` action. The empty Favourites and Recent panels are plain `<p>` paragraphs instead (`:1341-1344`, `:1356-1359`), and the `Alerts` and `AI Tool Recommendations` rail cards are permanently-empty prose (`:1489-1496`, `:1498-1505`).
- **Restricted — none.** No `RestrictedState` in the file, and `Shell`'s guard (`App.tsx:1020-1023`) cannot fire here because the route is not a money surface. The page's only permission behaviour is omission (§5).

## 7. Known gaps

1. **The registry error banner is structurally unreachable.** `SEED_ERRORS` (`src/data/tools.ts:763-782`) has three checks. The first compares `TOOLS.filter(kind !== 'blocked').length + TOOLS.filter(kind === 'blocked').length` against `TOOLS.length` (`:766-772`) — two complementary filters over one array, so the sum is the length by construction and the branch is dead. The other two (duplicate id `:774-776`, orphan group `:778-779`) pass for the current registry. `SEED_ERRORS` is therefore always `[]`, so `Tools.tsx:1176-1187` never renders and the `console.error` at `tools.ts:784` never fires. The rail paragraph at `Tools.tsx:1463-1467` advertises this reconciliation as a live guarantee.
2. **Three `TODO(decision)` markers are rendered to the operator as UI text**, inside `<strong>` tags: `Tools.tsx:655` (Storage — "add codec and bitrate to the item master, or drop the inventory-aware claim"), `:696` (Battery — "measured per body, or manufacturer spec?"), `:770` (Price — "what should a quotation handoff carry?"). Each sits in a `Gap` block (`:261-279`) that also quotes spec section numbers and source filenames (`data/inventory.ts`, `lib/money.ts`) at the user.
3. **The Diagnostics deep link 404s.** `tools.ts:665` routes the `diagnostics` tile to `/system` with owner `System Monitor`. `/system` is not a route in `src/App.tsx` (no match anywhere in the file) and is not in `src/data/nav.ts`, so the `<Link>` at `Tools.tsx:1026` lands on the catch-all **Page not found** screen at `App.tsx:715-741`. The tile still renders the blue `Opens System Monitor` chip (`:959-963`).
4. **Two deep links are visible to money-blind roles and refused on arrival.** Neither `reports` (`tools.ts:646` → `/reports`) nor `backup` (`tools.ts:657` → `/tools/backup`) carries `money: true`, so both survive the filter at `Tools.tsx:1093` for Warehouse, Technician, Driver and Client. `/reports` is in `MONEY_ROUTES` (`nav.ts:149`), and `/tools/backup` redirects to `/admin/backup` (`App.tsx:135`), which `isMoneySurface` matches on the `/admin` prefix (`nav.ts:150,158`). Both therefore produce `RestrictedState` at `App.tsx:1020-1023` for exactly the roles the tile was left visible to. The rail card at `Tools.tsx:1470-1477` states the opposite intent — "a deep-linked tool opens the owning module with the right filter and carries *that module's* permissions".
5. **The rail hides rather than reflows below 1180.** `Tools.tsx:1453` uses `Rail`, which is `CollapsibleAside` (`Page.tsx:315-331`), and `CollapsibleAside.tsx:37` defaults to collapsed at **phone and tablet**. `Page.tsx:333-348` records this as a binding ruling — *"'Right rails collapse below 1180' means **reflow**, not **hide**… Do not wrap those in `CollapsibleAside`"* — and supplies `ReflowRail` (`Page.tsx:349-371`) and `useRailGridColumns()` (`Page.tsx:382-384`) for exactly this. This page uses neither, and hardcodes the grid tracks at `Tools.tsx:1200`. On the 768–1179px warehouse tablet the donut, the alerts card, the AI card and the keyboard card are all behind a chevron.
6. **Nothing in the file reads a breakpoint.** No `src/lib/device.ts` import (`Tools.tsx:1-44`), so `useTabularLayout()` (`device.ts:139-141`) is not consulted for the 15-row disposition table, which stays a `minWidth: 440` table in a horizontal-scroll box at every width (`Tools.tsx:1405-1406`).
7. **Law 15 (44×44) is missed by every hand-rolled control on the page.** `Page.tsx:112-119` names the 44px floor and `Page.tsx:154` implements it as `minHeight: 44`. This file bypasses `Button` for: `FavouriteButton` 26×26 (`Tools.tsx:880-881`), the Favourites filter toggle `height: 30` (`:1233`), the category `<select>` `height: 30` (`:1253`), the two view-mode buttons 30×30 (`:1272-1273`), `controlStyle` `height: 34` on every calculator input and select (`:97`), and the `Back to Settings` link `height: 34` (`:1159`). The one `Button` it does use — Close (`:1210`) — is compliant.
8. **`Registered` is a per-role figure presented as a fact about the product.** The donut centre reads `String(tools.length)` (`Tools.tsx:1456`) over the money-filtered array (`:1093`), so the same screen reports **27 Registered** to an Owner and **22 Registered** to a Warehouse user, with the accompanying paragraph (`:1463-1467`) asserting the counts "cannot drift". Nothing on screen says the total is role-dependent.
9. **Two tiles share a destination, under two different owner labels.** `equipment-checklist` → `/documents` owner `Documents` (`tools.ts:591`) and `documents` → `/documents` owner `Finance ▸ Documents` (`tools.ts:638`); likewise `serial-lookup` (`:673`) and `equipment-utilities` (`:681`) both → `/inventory` with owners `Inventory` and `Inventory ▸ Maintenance`. The chips promise a filtered landing (`Tools.tsx:1470-1477`) that the bare paths do not carry.
10. **The footer note contradicts the route.** `Tools.tsx:1522` renders `Tools lives inside Settings — Foundation §5.1 keeps it out of the sidebar`, and the file header repeats it (`:69-72`), but the screen is mounted at `/tools/cinematography` under the Tools breadcrumb (`App.tsx:693-700`), `/settings/tools` redirects **away** from Settings (`App.tsx:701`), and `App.tsx:687-692` records the opposite ruling. The `Back to Settings` button (`:1153`) sends the user to a module the breadcrumb never came from.
11. **`Recent Tools` cannot survive a reload and `Favourite Tools` cannot leave the browser.** Recent is `useState([])` (`Tools.tsx:1096`); favourites are a `localStorage` array keyed `babin.tools.favourites` (`tools.ts:787`) with silent write failures (`tools.ts:806-808`). Neither is a user or device record, so both differ per browser profile, and the `Opened this session` rail row (`:1461`) is a count of nothing after F5.
12. **A side effect runs inside a `setState` updater.** `toggleFavourite` calls `writeFavourites(next)` from inside the functional updater (`Tools.tsx:1112-1117`). `StrictMode` is on (`src/main.tsx:59`, `:81`), so the updater — and therefore the `localStorage` write — is invoked twice per click in development. The write is idempotent, so nothing is visibly wrong today.
13. **Eight of 27 registry entries are stated blockers, three of them for data the item master does not carry.** `labels` (`tools.ts:600-603`), `vehicle-loading` (`:612-615`), `shot-list` (`:624-628`, the only entry carrying a `decision` string), `profit` (`:558-560`), `currency` (`:570-572`), `integrations` (`:690-692`), `import-export` (`:701-703`), `bulk` (`:712-714`). The Storage and Battery calculators run but on typed rather than looked-up figures for the same reason (`Tools.tsx:650-657`, `:691-697`).
14. **Zero cameras is silently treated as one.** `StorageCalculator` computes `total = perCamera * (num(cameras) || 1)` (`Tools.tsx:622`), so typing `0` into a `step="1"` field with no `min` (`:638`) returns a one-camera figure under the label `Total card and drive space`.
15. **A zero-watt draw returns "1 battery".** `batteryRuntimeHours` divides by `drawWatts` (`tools.ts:256-258`), so `0` yields `Infinity`; `batteriesNeeded` then returns `Math.ceil(shoot / Infinity) + 1 = 1` (`tools.ts:261-263`), and `Tools.tsx:684` prints it because `needed > 0`. Runtime beside it renders `Infinity` through `dp()` → `'—'` (`:290-291`, `:688`).
16. **The ND notation switch reinterprets the number in place.** `NdCalculator` keeps one `ndValue` state across both notations (`Tools.tsx:450`, `:456`): switching `Filter factor` → `Optical density` with `8` in the box silently becomes density 8, i.e. a factor of 10⁸ and ~26.6 stops, with no reset and no warning.
17. **The four locked KPI tiles carry no figure at all.** All four values are `'—'` (`Tools.tsx:1052-1057`), each with a note naming the missing source; the strip is followed by a card explaining the same thing (`:1191-1198`). The tile accents were changed from `neutral` to `primary` for a measured 2.56:1 contrast failure in `lib/status.ts`, and the file records that the underlying token pair is still wrong and "not this file's to fix" (`:1046-1050`).
