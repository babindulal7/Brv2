# Rentals List
Route `/rentals` · `src/modules/rentals/RentalsList.tsx` · 2111 lines

Status: **Partial**

---

## 1. What it is

The bookings list. Lazily imported at `src/App.tsx:25` and mounted at `/rentals` inside `Shell` with the single crumb "Rentals List" (`src/App.tsx:166-173`). One default-exported component, `RentalsList()` (`RentalsList.tsx:626`), plus seven file-local helpers (`Tag` `:81`, `ExternalGearMark` `:146`, `Track` `:214`, `Avatar` `:245`, `RowOperations` `:342`, `ColumnMenu` `:447`, `StatusFilterGroup` `:508`, `PageBtn` `:2016`).

Every row, count and pager number is a server-side query through `listBookings` (`src/lib/queries/bookings.ts:410`); the file contains no `.filter()` over fetched rows. It imports nothing from `src/actions/` and dispatches nothing — it is a read-and-navigate screen.

---

## 2. What renders

### Desktop (≥1180), top to bottom

| # | Thing | Where |
|---|---|---|
| 1 | `PageHeader` title "Rentals", description "Manage all bookings and their current status" | `:1098-1126`; component `src/components/ui/Page.tsx` |
| 1a | Header action — **New Rental** primary `Button` → `navigate('/rentals/new')` | `:1103-1105` |
| 1b | Header action — **Refresh** `Button` → `refreshAll` | `:1106-1108` |
| 1c | Header action — **Export** `Button`, `disabled`, wrapped in `Unavailable` | `:1119-1123` |
| 2 | `KpiStrip` with `columns={4}` — Active Rentals · Today Pickups · Today Returns · Overdue | `kpis` `:909-914`, rendered `:1130` |
| 3 | Stage chip row: `All` + the six `STATUS_ORDER` stages, each with `STAGE_ICON` glyph, `aria-pressed` | `:1150-1192`; `STAGE_ICON` `:137-144` |
| 4 | Second chip row: `Sub-Rental` chip, a divider, the eleven/twelve quick-filter chips, then a right-aligned `[Table][Cards][Timeline]` view toggle | `:1194-1348` |
| 5 | Custom-range strip (From / To `<input type="date">`, "Clear range", and a sentence saying it matches **pickup** only) — rendered only when the quick chip is `Custom` | `:1352-1395` |
| 6 | `ActiveFilterChips` — one removable chip per active filter, renders nothing when unfiltered | `:1400` |
| 7 | A one-track grid (`minmax(0,1fr)`) holding either the Timeline placeholder card or the results `Card` | `:1402-1977` |
| 7a | Results `Card` title = `countedTitle` ("N Rentals found", or "Rentals" while the count is null) | `countedTitle` `:981`, `:1437` |
| 7b | Card actions — `FilterButton` (opens the drawer, shows `f.activeCount`) and a disabled **Save View** button in `Unavailable` | `:1443-1453` |
| 7c | `PageBody` wrapping the table | `:1470-1503` |
| 7d | The table: `<thead>` of `headers` + a sticky "Actions" `<th>` carrying the `ColumnMenu` gear | `headers` `:952-960`, `:1658-1683` |
| 7e | Pager row — "Showing X to Y of Z rentals", `‹ 1 2 3 … ›` from `pageWindow`, and a "Rows per page" `<select>` of `ROWS_PER_PAGE` | `:1920-1973`; `pageWindow` `:597-601` |
| 8 | `FilterDrawer` (`position: fixed`, left side) containing the `filtersCard` | `filtersCard` `:1009-1094`, `:1990-2000` |
| 9 | `FooterNote` with four or five lines | `:2002-2010` |

**Table row cells** (`:1685-1909`), in `headers` order: Booking (an `IntelCard`-wrapped `<Link>` to `/rentals/:bookingNo`, a "Created …" line, and Overdue / Cancelled / Sub-rented tags — `:1690-1728`); Client / Project (avatar, client `<Link>` to `/clients/:clientId`, project or "—", pickup location or "—" — `:1730-1775`); Items (`:1777-1794`); Pickup and Return, each date + time + location (`:1796-1848`); Status (stage pill with `STAGE_ICON`, an optional red `statusNote`, and the four-dot `Track` — `:1850-1886`); Deposit (`:1889-1903`); and the sticky action cell holding `RowOperations` (`:1906-1908`).

**`RowOperations`** (`:342-440`) is a `⋮` button opening a `role="menu"` with "Open Booking" plus the four `OPERATIONS` entries. Entries whose stage does not match stay visible and greyed as `aria-disabled` `<span>`s carrying the reason in `title` (`:431-433`); enabled ones are `<Link>`s to `/rentals/:bookingNo/{packing|handover|return|reset}` (`:420-429`). The menu flips upward when there is no room below inside `[data-table-scroll]` (`:353-360`).

**Hover intel.** Both the table's Booking cell and the card row's booking chip wrap the link in `IntelCard` (`:1547`, `:1691`), which opens on hover where hover exists and on a 500 ms long-press where it does not (`src/components/ui/IntelCard.tsx:97`, `:117-124`).

### Responsive bands the file actually reads

`RentalsList.tsx:807` calls `useViewport()` from `src/lib/device.ts:57`, whose thresholds are `BREAKPOINT = { phone: 768, desktop: 1180 }` (`device.ts:43`). **Both 768 and 1180 are read.** What changes:

- **phone (<768)** — `tabular` is false (`:808`), so the card-row branch renders instead of the table regardless of the `view` toggle (`:1504`). Each card is avatar + client + project, an optional Deposit block, the booking chip + status pill + Overdue/Cancelled/Sub-rented tags, an items line, a pickup line, then one full-width "Open Booking" `<Link>` beside `RowOperations` (`:1506-1624`). Both chip rows switch from `flexWrap: 'wrap'` to `overflowX: 'auto'` (`:1157-1159`, `:1199-1201`).
- **tablet (768–1179)** — the table still renders, at `minWidth: 720` instead of 1040 (`:1655`). `NARROW_COLUMNS = {Items, Return}` are dropped by `show()` (`:949-951`). Chip rows scroll horizontally (same ternaries as above). **Deposit is deliberately not dropped by width** — the comment at `:942-947` states money is a role rule, not a width rule, and `show()` confirms it.
- **desktop (≥1180)** — full table, chips wrap.

Three shared components this page renders also read the same two breakpoints: `KpiStrip` clamps to 2 columns at phone and 3 at tablet (`src/components/ui/Page.tsx:210-212`), `FilterDrawer` scroll-locks the body on phone only (`src/components/ui/FilterDrawer.tsx:116-117`, `:167`), and `IntelCard` reads viewport for popover placement (`src/components/ui/IntelCard.tsx:98`). The Filters panel is `position: fixed` and reachable from the same button at all three widths — it costs no layout track anywhere (`:786-796`, `:1402-1413`).

---

## 3. Data sources

| Screen area | Kind | Detail |
|---|---|---|
| Table rows | DB | `bookings`, columns named in `BASE_COLUMNS` with `clients ( name )` and `booking_lines ( id, qty )` embeds — `src/lib/queries/bookings.ts:258-262`, executed `:410-478`. Called from `fetchRentals` `:841-848`, mapped by `toRentalListRow` (`src/data/rentals.ts:1007-1065`) |
| Item count | DB | `sum(booking_lines.qty)` over non-voided lines — `bookings.ts:307-309`, `.is('booking_lines.voided_at', null)` at `bookings.ts:417` |
| Total / pager / "N Rentals found" | DB | `count: 'exact'` via `withCount: true` — `bookings.ts:415`, passed `:844`; read `:855`, `:981`, `:1933-1935` |
| KPI · Active Rentals | DB | `ACTIVE_RENTALS_FILTERS` (`src/data/today.ts:922-926`) + one-row page — `src/data/rentals.ts:883`, hook `:885` |
| KPI · Today Pickups | DB | `todaysOutgoing(TODAY_DAY_AD)` — `bookings.ts:523-530`, wired `src/data/rentals.ts:885`, hook `:886` |
| KPI · Today Returns | DB | `todaysIncoming(TODAY_DAY_AD)` — `bookings.ts:533-540`, wired `src/data/rentals.ts:887`, hook `:887` |
| KPI · Overdue | DB | `overdue(NOW_AD)` — `bookings.ts:596-603`, wired `src/data/rentals.ts:889`, hook `:888` |
| Deposit column / card block / intel line | DB | `bookings_deposit_v (id, deposit_required)`, a second id-keyed query — `bookings.ts:394-408`, run only when `withDeposit` (`bookings.ts:472-475`), which is spread only behind `money` (`:844`) |
| Sub-Rental chip + gold outline | DB | `booking_lines_v` select `booking_id, line_type`, `.in('line_type', SUB_RENTAL_LINE_TYPES)`, `.is('voided_at', null)`, paged 1000 at a time — `src/data/rentals.ts:534-572`; predicate `isSubRentalBooking` (`src/data/booking.ts:248-250`) |
| Stage chips / Status accordion vocabulary | SEED | `STATUS_ORDER` derived from `BOOKING_STATUS` (`src/lib/workflow.ts:43-55`). A `lib/` constant, not `src/data/` — it mirrors the Postgres `booking_stage` enum, verified at `bookings.ts:490-519`. No figures |
| Quick-filter chip labels | SEED | `CHIPS` array — `src/data/rentals.ts:596-609`. Labels only; each maps to a real `ListFilters` in `chipFilters` (`src/data/rentals.ts:732-783`), except `Payment Due` which has none (`:442-443`) |
| Filters-rail group labels | SEED | `FILTER_GROUPS` — `src/data/rentals.ts:77-89`. Eleven labels; only `Status` has a query behind it (`:1056-1057`) |
| Row `⋮` menu entries | SEED | `OPERATIONS` — `src/data/booking.ts:317-322`. Four `{label, icon, path, enabledAt}` records; routes and stage gates, no data |
| "Quick filters are relative to …" footer, and every date-relative chip and KPI | SEED | `TODAY = new Date(Date.UTC(2026, 6, 31))` — `src/lib/bs.ts:153`. `NOW_AD` and `TODAY_DAY_AD` are derived from it (`src/data/today.ts:727`, `:730`) |
| Avatar tone and monogram | DB-derived | `avatarToneFor(clientId)` (`src/data/today.ts:997-1001`) and `monogramOf(clientName)` (`:1008-1013`) — pure functions of queried fields |
| Whole page in mock mode (`VITE_DATA_SOURCE=mock`, `src/lib/supabase.ts:42`) | LOCAL | `bookings`, `booking_lines`, `clients` are in the store (`src/lib/mock/corpus.ts:405-423`); `booking_lines_v` resolves to `booking_lines` (`corpus.ts:439`). **`bookings_deposit_v` is UNSERVED** — absent from `VIEW_OF` (`corpus.ts:435-441`) and from `UNSERVED` (`corpus.ts:33-44`), so `read()` warns and returns `[]` (`src/lib/mock/client.ts:99-108`) |

The seed array `ROWS` (`src/data/rentals.ts:153-349`, eight hand-typed bookings with `amount` / `due` / `deposit` / `crew` / `kit`) lives in the same module this page imports from but is **not** imported by it — the import list at `RentalsList.tsx:28-47` names fourteen symbols and `ROWS` is not one of them.

Invented on this page: no rendered figure — every count, item count, deposit and date comes from a query. What is invented is the furniture and the clock: the eleven `FILTER_GROUPS` labels, the twelve `CHIPS` labels, the four `OPERATIONS` menu entries, and the frozen operating day `2026-07-31` (`src/lib/bs.ts:153`) that every date chip and three of the four KPI cards are measured against.

---

## 4. Actions and writes

**No dispatches.** The file imports nothing from `src/actions/`; a grep for `actions/` and `dispatch` across all 2111 lines returns no match. No capability string is named anywhere in it, so `checkCapability` (`src/actions/core.ts:124-218`) and `createAction`'s `implemented` gate (`core.ts:222-224`) are never reached from this screen. Nothing on this page writes to the database.

Every interactive control, and what it actually does:

| Control | Where | What happens |
|---|---|---|
| New Rental | `:1103-1105` | `navigate('/rentals/new')`. Navigation only |
| Refresh | `:1106-1108` | `refreshAll` (`:890-896`) re-runs the list query and the four KPI counts. **Does not** re-run `subRentalBookingIds` |
| Export | `:1119-1123` | `disabled`, no `onClick`, wrapped in `Unavailable` with a reason. Dead button by design |
| Save View | `:1449-1453` | `disabled`, no `onClick`, `Unavailable`. Dead button |
| Save as new filter | `:1087-1091` | `disabled`, no `onClick`, `Unavailable`. Dead button |
| Ten filter-rail groups (all but Status) | `:1059-1084` | Rendered as `disabled` `<button>`s with a `title` reason. No handler |
| Status accordion checkboxes | `:567` | `f.toggleChip('stage', s)` — writes `?stage=` on the URL |
| `All` stage chip | `:1166` | `f.setChipGroup('stage', [])` — empties the group rather than sending `in ()` |
| Six stage chips | `:1178` | `toggleStatus` → `f.toggleChip('stage', s)` (`:971-973`) |
| Sub-Rental chip | `:1232` | `f.setExtra('sub', subOn ? undefined : 'on')`. Rendered `disabled` inside `Unavailable` while `subIds === null` (`:1216-1228`) |
| Eleven live quick chips | `:1290` | `pickChip` → `f.setExtra('quick', …)`, dropping the param for `All` (`:965-967`) |
| Payment Due chip | `:1279-1287` | `disabled`, `Unavailable`, reason `PAYMENT_DUE_UNAVAILABLE` (`src/data/rentals.ts:442-443`). No query behind it |
| Timeline view toggle | `:1330-1339` | `disabled`, `Unavailable`. Table/Cards toggle `setView` (`:1341`) — component state, not the URL |
| Custom From / To dates | `:1368`, `:1377` | `setRange` → `f.setDateRange('pickup_at', …)` (`:975-977`) |
| Clear range / Clear all | `:1382`, `:1016` | `setRange('','')` / `f.clearAll` (`src/lib/queries/useFilters.ts:426-437`) |
| Filters button | `:1443-1448` | Toggles local `filtersOpen` |
| Column chooser checkboxes | `:492`, `:1671-1678` | Local `hiddenCols` `Set` state (`:640`). Not persisted, not on the URL |
| Pager `‹ N ›` | `:1939-1943` | `f.setPage` → rewrites `?page=` with `replace` (`useFilters.ts:410-424`) |
| Rows per page | `:1952` | `setPerPage` (`:700-716`) — writes `?per=`, deletes `?page=` |
| Row `⋮` → an operation | `:420-429` | `<Link>` to `/rentals/:bookingNo/{path}`. Navigation. Disabled entries are inert `<span aria-disabled>` (`:431-433`) |
| Booking / client / Open Booking links | `:387-396`, `:1553-1559`, `:1599-1619`, `:1698-1709`, `:1734-1745` | React Router `<Link>`s only |

---

## 5. Gates

**Route reach.** `/rentals` sits inside `Shell` (`src/App.tsx:166-173`). `Shell` redirects to `/login` when there is no session (`App.tsx:973-975`) and then applies one guard: `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`App.tsx:993`). `MONEY_ROUTES` is `['/finance','/reports','/admin','/tools/pricing','/tools/depreciation']` (`src/data/nav.ts:147-153`) — `/rentals` is not among them, so **every authenticated role reaches this route**, money-blind ones included. There is no per-role restriction on the page itself.

What limits a Client session is the database, not this file: `bookings_select` is `using (auth_is_staff())` and `auth_is_staff()` is `auth_user_role() <> 'Client'` (recorded at `src/lib/queries/bookings.ts:172-180`), so a Client gets zero rows rather than a restricted screen.

**Money visibility.** One call: `const money = useCanViewMoney()` (`:631`), which is `canViewMoney(user.role)` and `false` for no session at all (`src/lib/moneyVisibility.ts:24-27`). `MONEY_BLIND` is Warehouse, Technician, Driver, Client (`src/lib/rbac.ts:45-50`); everyone else — Owner, Admin, Manager, Coordinator, Accounts — sees money. `role` falls back to `'Client'` when `user` is null (`:629`).

Hidden under Law 6 when `money` is false — all six are **omissions, not masks**:

1. `withDeposit` is never passed, so the `bookings_deposit_v` query never runs (`:844`).
2. `Deposit` is removed from `optionalColumns`, so it is not even offered in the column chooser (`:814`).
3. `show('Deposit')` is false, so the header (`:959`), the table cell (`:1889`) and the card-row deposit block (`:1534`) are all absent from the tree.
4. The `Payment Due` chip is filtered out of the chip array by `chipsFor` (`:810`; `src/data/rentals.ts:612-614`).
5. The `Payment`, `Deposit` and `Amount` filter groups are filtered out by `filterGroupsFor` (`:811`; `src/data/rentals.ts:95-99`).
6. `RENTAL_DEPOSIT_NOTE` is dropped from the footer (`:2008`).

A seventh gate is finer-grained: the Intel card's deposit line and Money group are built only when `canViewMoneyField(gctx, 'booking')` passes (`src/data/rentals.ts:1121`, `:1179`), where `gctx = gateContext(role)` (`:637`). `moneyScope` puts Owner/Admin/Manager/Accounts at `'full'` and Coordinator at `'booking-and-client-balance'` (`src/lib/fieldGating.ts:53-62`), so booking-level deposit passes for Coordinator too — consistent with `canViewMoney('Coordinator')` being true.

The page never passes `restricted` to `PageBody`, so no role sees a restricted state here.

---

## 6. States drawn

Via `PageBody` (`:1470-1503`; component `src/components/ui/PageBody.tsx:119-207`), whose fixed ladder is restricted → error → loading → empty → children.

| State | Drawn? | How |
|---|---|---|
| Loading | Yes | `loading={list.loading \|\| (subOn && subPending)}` (`:1476`) → `LoadingSkeleton type="table" rows={6}` (`:1487-1488`; `StateViews.tsx:87`) |
| Error | Yes | `error={subOn && !subPending && subIds === null ? SUB_RENTAL_UNANSWERED : list.error}` (`:1480`), with `onRetry={refreshAll}` and `hasRows` so a failed refresh banners **above** surviving rows instead of replacing them (`:1481-1482`; `PageBody.tsx:152-180`) |
| Empty | Yes | `empty={list.isEmpty \|\| query.impossible}` (`:1483`), `emptyIsFiltered={list.isFiltered}`, and a three-way `emptyMessage` distinguishing an empty derived sub-rental set, an impossible stage intersection, and a genuinely empty table (`:1490-1502`) |
| Restricted | **No** | The `restricted` prop is never passed. `RestrictedState` exists (`StateViews.tsx:213`) and `Shell` can render it (`App.tsx:1020-1023`), but `/rentals` is not a money surface so that branch is unreachable for this route |

Hand-rolled beside the four: the Timeline placeholder card with a "Back to Table" button (`:1414-1434`); the `Unavailable` hover/long-press reason popovers on the six disabled controls (`src/components/ui/Unavailable.tsx:35-49`); and `countOf` (`:584-586`), which renders a KPI as `—` rather than `0` while loading, on error, or when the count is null.

---

## 7. Known gaps

1. **`TODO(decision)` — ten of the eleven filter groups have no query.** `RentalsList.tsx:1046-1054` records that Rental Type and Tags have no column at all, Equipment Category needs `bookings → booking_lines → products.category_id`, Client Type needs `clients.type_parent`, Staff has no assignment table, and Location is free text — each needing an embed-scoped filter `applyListFilters` cannot build (`src/lib/queries/listQuery.ts:141-192`). They render as `disabled` buttons (`:1059-1084`).

2. **The whole date axis is a frozen constant, not the clock.** `TODAY = new Date(Date.UTC(2026, 6, 31))` (`src/lib/bs.ts:153`), and `NOW_AD` / `TODAY_DAY_AD` derive from it (`src/data/today.ts:727`, `:730`). So "Today Pickups", "Today Returns", "Overdue", `Tomorrow`, `Next 7 Days` and `Returning` all measure against 31 Jul 2026 whatever the wall clock says, and the footer prints that date as fact (`:2005`). `bs.ts:150-151` says it "becomes the real clock when data is wired"; the data is wired and it has not.

3. **Refresh does not refresh the sub-rental set.** `subRentalBookingIds()` runs once in an effect with `[]` dependencies (`:753-772`); `refreshAll` re-runs the list and the four counts only (`:890-896`). With `?sub=on`, pressing Refresh re-queries the rows against a stale id set.

4. **`Payment Due` is a permanently dead chip.** `unavailable: PAYMENT_DUE_UNAVAILABLE` (`src/data/rentals.ts:606`), because `bookings` carries no outstanding balance (`:442-443`). `chipFilters` still has a `case 'Payment Due'` returning the unfiltered set (`src/data/rentals.ts:780-781`), reachable only if the chip is ever enabled.

5. **Three drawn controls have no pipeline at all**: Export (`:1119-1123`), Save View (`:1449-1453`), Save as new filter (`:1087-1091`) — all `disabled`, no handler, each with an `Unavailable` reason.

6. **Timeline is a third view that does not exist.** `VIEWS` declares it (`src/data/rentals.ts:101`), the toggle is `disabled` (`:1330-1339`), and a placeholder card handles the case where `view === 'Timeline'` (`:1414-1434`) — which the disabled button makes unreachable.

7. **Nothing on this page searches.** `listBookings` declares `SEARCH_COLUMNS = ['booking_no','project']` (`bookings.ts:367`) and `useFilters` exposes `setSearch` (`src/lib/queries/useFilters.ts:353`), but the page never calls it and never puts `search` in `listFilters` (`:852`). The Shell mounts this route with the placeholder "Search booking, client, equipment, invoice…" (`App.tsx:169`), and that control is a button that fires ⌘K to open the CommandPalette (`src/components/shell/Header.tsx:109-113`), not a list filter. `bookings.ts:357-366` separately records that client-name search would silently return nothing even if it were wired.

8. **View mode and hidden columns are lost on reload.** `view` (`:639`) and `hiddenCols` (`:640`) are component state while every filter, the page and the page size ride the URL (`:653-696`). A shared link reproduces the filters but not the layout.

9. **Refresh blanks the table while it runs.** `PageBody.tsx:46-57` carries a `TODO(decision)` stating that `loading` outranks `children` unconditionally, so a manual Retry over surviving rows swaps them for a skeleton. This page's Refresh button (`:1106`) is a direct route into that case.

10. **Mock mode cannot show a deposit at all.** `bookings_deposit_v` is neither in `VIEW_OF` nor in `UNSERVED` (`src/lib/mock/corpus.ts:33-44`, `:435-441`), so `read()` console-warns and returns `[]` (`src/lib/mock/client.ts:99-108`), `readDeposits` builds an empty map without erroring (`bookings.ts:394-408`), and every Deposit cell renders `—` even for an Owner session (`:1900`). The banner does not name it, because `UNSERVED` is what the banner lists.

11. **Mock mode's sub-rental answer is structurally empty.** `corpus.ts:274-286` writes `booking_lines` rows with no `line_type` key, so `.in('line_type', ['Sub-rental'])` matches nothing and the chip always reports "No booking carries a sub-rented line" (`:1495-1496`). Live behaviour is the same today per `src/data/rentals.ts:485-493`, but for a different reason — there the column exists and holds only `Equipment`.

12. **A comment in this file misstates what a bad icon name does.** `:118-121` claims indexing `STATUS_ICON` and casting to `IconName` "renders `undefined`, which React throws on". `Icon` actually logs `console.error` and renders a red `[Icon:name]` placeholder (`src/components/ui/Icon.tsx:189-192`). The underlying fact is real — `STATUS_ICON.neutral = 'circle_dashed'` and `STATUS_ICON.progress = 'progress'` (`src/lib/status.ts:58`, `:60`) are absent from `REGISTRY` (`Icon.tsx:79-172`) — but unreachable from this page: `Tag` (`:81-103`) is only ever called with `status="danger"` (`:1581`, `:1582`, `:1720`, `:1721`), which maps to `alert_triangle`, which exists (`Icon.tsx:120`).

13. **Contradiction with Booking Detail — two operations tables, and one of them is gated on a seed.** This page's row `⋮` reads `OPERATIONS` from `src/data/booking.ts:317-322` and gates each entry on the **queried** `row.status` (`:403`). Booking Detail renders `OperationsShell` (`BookingDetail.tsx:19`, `:2094`), which derives its job list from `JOBS`/`JOB_ORDER` (`src/modules/operations/OperationsShell.tsx:6`, `:178`) and is handed `BOOKING.status` — the hard-coded `'Booked'` seed constant at `src/data/booking.ts:114-124`. The two tables agree on stages today (`OPERATIONS.enabledAt` Booked/Packed/On Rent/Returned vs `JOBS[*].runsAt`, `src/lib/workflow.ts:101-106`), so the same booking can offer different operations on the list and on its own detail page purely because the detail page is reading a constant.

14. **Mock `delivery_type` is not an enum member.** `corpus.ts:260` writes `delivery_type: 'Pickup'`, while the `delivery_type` enum is `'Customer Pickup' | 'Babin Delivery' | 'Courier' | 'Third Party'` (`bookings.ts:60-64`). The Intel card's Detail group prints it verbatim (`src/data/rentals.ts:1156`), so mock sessions read "Pickup" where live sessions read "Customer Pickup".

15. **`fetchRentals` returns `total: 0` for an impossible filter set.** `:843` short-circuits before the query with `{ rows: [], total: 0 }`, so the card title reads "0 Rentals found" (`:981`) for a set that was never sent to Postgres. Consistent with the empty state's message (`:1497-1498`), but the count is asserted rather than measured.
