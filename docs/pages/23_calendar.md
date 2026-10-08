# Calendar

Route `/calendar` · `src/modules/calendar/Calendar.tsx` · 2399 lines

Mounted at `src/App.tsx:340-347` inside `Shell` with `crumbs=[{label:'Calendar & Dispatch'}]` and the header search placeholder `"Search events, bookings, equipment…"`. The component is lazy-loaded at `src/App.tsx:56`. `Shell` (`src/App.tsx:943-1039`) supplies the session redirect (`:973-975`), the sidebar / bottom bar, `MockBanner`, `OfflineBanner`, the `ErrorBoundary` + `Suspense` fallback (`:1025-1029`) and the money-surface guard (`:993`). `/calendar` is listed in `BUILT` at `src/App.tsx:760`, so no `Placeholder` is derived for it.

Status: **Seed-only.**

---

## 1. What it is

A resource-scheduling screen with four views — Month (default), Week, Timeline, Availability — over ten hardcoded resource rows and their bars (`src/data/calendar.ts:217-357`, `src/modules/calendar/Calendar.tsx:1350`, `src/data/calendar.ts:60-64`). Every date on it is converted at render time by `src/lib/bs.ts` from the fixed operating day `TODAY = 31 Jul 2026` (`src/lib/bs.ts:153`); nothing stores a BS string.

It reads no database and writes nothing. The import block (`src/modules/calendar/Calendar.tsx:1-41`) contains no `src/actions/`, no `src/lib/dataAccess`, no `src/lib/supabase`, no query module and no `src/lib/mock/corpus` — a grep for all of those over the file returns nothing. Its only outbound effects are `navigate()` calls (§4).

## 2. What renders

Desktop (`viewport === 'desktop'`, ≥1180), default mode, `view === 'Month'`, top to bottom:

| # | Element | Evidence |
|---|---|---|
| 1 | `PageHeader` — icon `calendar`, title "Calendar", description "Plan resources, track availability, and manage operational schedules." | `src/modules/calendar/Calendar.tsx:2230-2245`; component `src/components/ui/Page.tsx:66-108` |
| 1a | Header actions: `navButtons` (Today + the month stepper, or Today + ‹ › + the range pill), `Filters` toggle, `Full View` (desktop only), `New Rental` primary | `:2234-2243`, `navButtons` `:1676-1695`, `Full View` `:2239` |
| 1b | Month stepper `‹ Shrawan 2083 / Jul–Aug 2026 ›` — **both arrows are permanently `disabled`** and carry `MONTH_STEP_BLOCKED` as their `title` | `:1642-1672`, reason string `:118-119`, `iconBtnOff` `:2394-2399` |
| 2 | `monthStepNote` — an on-page `role="note"` repeating `MONTH_STEP_BLOCKED`, rendered only when `view` is Month or Availability | `:2247`, defined `:1697-1702`, `monthOnly` `:1674` |
| 3 | KPI band, `<section aria-label="Key figures">`, `repeat(4, …)` at desktop | `:2252-2292` |
| 3a | **Active Bookings** — count of `Reserved` + `On Rent` bars across `ROWS` | `:2260-2264`, derivation `:1541-1544` |
| 3b | **Today's Operations** — count of bars covering `TODAY`, plus a `View Today` button → `/today` | `:2265-2270`, derivation `:1545-1551` |
| 3c | **Equipment Utilization** — `NotTracked`, prints "not tracked yet" and the reason | `:2271-2282`, component `:390-401` |
| 3d | **Schedule Conflicts** — count of `Conflict` + `Case Escalation` bars, red when > 0 | `:2283-2291`, derivation `:1520-1523` |
| 4 | Control row: `viewTabs` (`role="tablist"`, 4 tabs), `layerToggles` (Crew / Maintenance / Transport, Month view only), and right-aligned `Row Type` + `Client` selects | `:2294-2307`; tabs `:1705-1734`; layers `:1737-1763`; selects `:1765-1793` |
| 5 | Event-type chip row — 12 chips from `BAR_KINDS`, each `aria-pressed`, plus `Clear event types` when any is on. Desktop only | `:2312`, defined `:1813-1843`; kinds `src/data/calendar.ts:170` |
| 6 | Main grid, `230px minmax(0,1fr) auto` when Filters is open, otherwise `minmax(0,1fr) auto` | `:2314-2332` |
| 6a | `filtersPanel` (left, only when `showFilters`): Filters heading + `Clear All`; Search `Input`; Event Type chips; Client select; Resource Type select; Resource select; Saved Views list (5 entries) | `:2323`, defined `:1856-1946`; saved views `src/data/calendar.ts:374-380` |
| 6b | `centre` — `AvailabilityPanel`, `monthCard` or `timelineCard` | `:1988` |
| 6b-i | `monthCard`: header line (BS range / AD range of `monthDays`), `MonthGrid`, a below-1180 note, then `markerLegend` | `:1971-1986`; grid `:716-870`; legend `:1845-1854` |
| 6b-ii | `timelineCard`: header line (BS/AD range of `days`) + `zoomControl` in Timeline or `"{view} view · fixed window"` otherwise, `Timeline`, then `markerLegend` | `:1948-1969`; `Timeline` `:493-679`; zoom `:1795-1811` |
| 6b-iii | `Timeline` header: a sort button (heading + "N items", cycles group → A–Z → Z–A) and one generated column per day showing BS day, BS month/year, AD short date, weekday, with a `Today` pill and Saturday/holiday shading | `:520-608`; sort modes `:126-132` |
| 6b-iv | `Timeline` rows: label cell (`IconTile`, name, code, tinted meta) and a bar track; `BarView` places each bar with clipped corners, an icon, label, sub-line, optional trailing note and a status dot | `:611-666`; `BarView` `:405-489` |
| 6b-v | `AvailabilityPanel` — a shared `EmptyState` saying availability is not computed, plus one explanatory line. No data | `:1055-1069` |
| 6c | `SelectedEventPanel` — rendered **under** the centre column when a bar is selected: kind badge, client/project, equipment list, four `DateBlock`s (or Starts/Ends + a note), crew avatars, vehicle, notes, and an `Open Booking` button for `BK`-issued labels | `:2326`, defined `:1237-1331` |
| 6d | `Rail width={300} label="Event detail"` holding `railDefault` then `shortcutsCard` | `:2328-2331`; `Rail` `src/components/ui/Page.tsx:315-331` |
| 6d-i | `railDefault`: `MiniMonth` (7×N BS day buttons, busy dots, both month arrows), `FestivalCard` (3 holidays + a dead `Manage`), Today's Summary, Upcoming (Next 7 Days), Quick Actions (4 tiles) | `:2018-2076`; `MiniMonth` `:1073-1155`; `FestivalCard` `:1159-1199`; `CountList` `:1201-1218` |
| 6d-ii | `shortcutsCard` — 4 key rows from `SHORTCUTS` | `:1990-2016`; `src/data/calendar.ts:468-475` |
| 7 | Keyboard-shortcuts panel, toggled by `?` | `:2359-2371` |
| 8 | `FooterNote` with the extra line "Bookings are cancelled, never deleted" | `:2373` |
| 9 | `dayOverlay` — the `DaySheet` fixed overlay, when a day is picked and the width is not phone | `:2375`, `:2083-2087`, `DaySheet` `:1002-1041` |

**Full View** is a separate early return that replaces the whole page (`:2091-2224`): its own header row (title, `navButtons`, a 300px search `Input`, Filters, Exit Full View), `monthStepNote`, the tabs/layers/selects row, the same three-track grid with a `Rail` holding `SelectedEventPanel` + an `EVENT_ACTIONS` Quick Actions card + `shortcutsCard`, then a four-card bottom strip (Today's Summary, Conflicts + `View Conflicts`, Utilization `NotTracked`, Upcoming), the shortcuts panel and the day overlay.

### Responsive bands

**This file reads both breakpoints, indirectly.** It imports `useViewport` from `src/lib/device.ts` (`:14`) and calls it once at `:1343`; `BREAKPOINT = { phone: 768, desktop: 1180 }` lives at `src/lib/device.ts:43-51`. The file itself contains no pixel literal for either threshold — every branch is `desktop` / `phone` derived at `:1344-1345`.

| Threshold | Read where | What changes |
|---|---|---|
| **1180** | `desktop = viewport === 'desktop'` (`:1344`) | Full View is only reachable at ≥1180 (`full = fullChoice && desktop`, `:1384`; the button `:2239`; the `F` key `:1427`). The `R` → Timeline key is desktop-only (`:1429`). Layer toggles render desktop-only (`:1737`) and `layerVisible` returns **false** for every Crew / Maintenance / Transport bar below 1180 (`:1481-1488`), so those bars vanish from the grid and the day list; the grid states this in words (`:1978-1983`) and the day list repeats it (`:984-989`). The event-type chip row and the header Row Type / Client selects are desktop-only (`:2300-2305`, `:2312`) and move into `filtersPanel` instead. The layout switches from `content | rail` grid to a single flex column with the rail contents reflowed beneath (`:2314`, `:2333-2357`). |
| **1180** | `VIEWS_BY_WIDTH[viewport]` (`:1381`; `src/data/calendar.ts:74-78`) | Desktop offers 4 tabs; tablet offers Month + Week only; phone offers Month only, and `viewTabs` renders nothing at all when the list has one entry (`:1705`). `view` is derived, not stored, so a resize can never strand the page on a hidden tab (`:1382`). |
| **1180** | `MonthGrid`'s `desktop` (`:733`) | ≥1180 cells are `minHeight:92` and carry up to two booking **chips** plus "+N more"; below that cells carry coloured **dots** (`:735-736`, `:818-859`). |
| **1180 / 768** | `DaySheet side` (`:2084`) | Day click opens a right-edge sheet at desktop, a bottom sheet at tablet. |
| **768** | `phone = viewport === 'phone'` (`:1345`) | The day agenda is **not** a sheet — it renders inline in a `Card` beneath the grid (`:2083`, `:2343`), and `day` falls back to `TODAY` so an agenda is always present (`:1386`). Cells shrink to `minHeight:56` with 4 dots max (`:735-736`), weekday headers become single letters (`:743`), BS and AD stack vertically in each cell (`:787`), and the holiday name is dropped from the cell (`:812`). |
| **768** | KPI band columns (`:2256`) | 4 columns at desktop, 2 at tablet **and** phone. |
| **768** | Reflowed rail grid (`:2348`) | `railDefault` + `shortcutsCard` sit two-abreast at tablet, one column at phone. |

Not a viewport band: `Timeline`'s `compact` flag is `days.length > 10` (`:513`), i.e. a **zoom** band — it halves bar height and drops the BS month line from the column head.

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Timeline rows, bars, month-grid jobs | SEED | `ROWS` — 10 resources, 28 bars, `src/data/calendar.ts:217-357`; consumed `src/modules/calendar/Calendar.tsx:1451-1474`, `:1490-1494` |
| Bar colours, icons, dash weights, legend swatches | SEED | `BAR_STYLE` / `BAR_KINDS`, `src/data/calendar.ts:150-170` |
| Client filter options | SEED | Derived from `ROWS`' `client` fields, `src/data/calendar.ts:361-363` |
| Resource / Row Type filter options | SEED | `ROW_TYPES` `src/data/calendar.ts:109`; resource list from `ROWS`, `Calendar.tsx:1905-1907` |
| Saved Views (5) | SEED | `SAVED_VIEWS`, `src/data/calendar.ts:374-380` |
| Layer toggles (Crew / Maintenance / Transport) | SEED | `LAYERS` + `layerOf`, `src/data/calendar.ts:94-106` |
| Zoom steps (3/5/7/10/14/21) | SEED | `ZOOM_STEPS`, `src/data/calendar.ts:113-114` |
| Festivals & Holidays card, holiday shading, cell holiday labels | SEED | `HOLIDAYS` (Dashain 28–30 Jul, Buddha Jayanti 8 Aug, Tihar 11–12 Aug 2026) + `holidayOn`, `src/data/calendar.ts:394-403` |
| Today's Summary counts (Pickup 3 · Return 5 · Cleaning 4 · Maintenance 2 · Sub-Rental Return 2) | SEED | `TODAY_SUMMARY`, `src/data/calendar.ts:414-420`; rendered `Calendar.tsx:2030`, `:2175` |
| Upcoming (Next 7 Days) counts (Bookings 12 · Sub-Rental Returns 2 · Quote Expiry 3 · Case Escalations 1 · Payment Due 4) | SEED | `UPCOMING`, `src/data/calendar.ts:422-428`; rendered `Calendar.tsx:2036`, `:2203` |
| Quick Actions tiles (4) | SEED | `QUICK_ACTIONS`, `src/data/calendar.ts:443-448` |
| Event-marker legend (11 labels) | SEED | `EVENT_MARKERS`, `src/data/calendar.ts:454-466`; only `icon`/`label`/`tone` are read — `value` is never rendered (`Calendar.tsx:1845-1854`) |
| Shortcuts card | SEED | `SHORTCUTS`, `src/data/calendar.ts:468-475` |
| Selected Event detail — client, project, equipment, pickup/return, handover/return sessions, 5 crew, vehicle, notes | SEED | `EVENT_DETAIL`, `src/data/calendar.ts:498-516`. **One key only: `B-715`.** Every other bar renders the Starts/Ends fallback (`Calendar.tsx:1283-1291`) |
| Agenda row times | SEED | `timeOn` reads `EVENT_DETAIL` and returns `null` for anything else, so most rows show a day window instead (`Calendar.tsx:287-293`, `:896`) |
| Full View event Quick Actions (4) | SEED | `EVENT_ACTIONS`, `src/data/calendar.ts:519-524` |
| KPI Active Bookings / Today's Operations / Schedule Conflicts | SEED (derived) | Reduced over `ROWS`, `Calendar.tsx:1541-1551`, `:1520-1523` |
| Mini-month busy dots | SEED (derived) | `busyDays` reduced over `ROWS`, `Calendar.tsx:1507-1513` |
| Equipment Utilization (both places) | none | `NotTracked` placeholder, `Calendar.tsx:2271-2282`, `:2187-2198` |
| Availability tab | none | `EmptyState`, `Calendar.tsx:1055-1069` |
| Every BS and AD date label, the Today marker, the range/month labels | computed | `src/lib/bs.ts` — `toBs` (`:93-99`), `formatBs` (`:102`), `formatAd` (`:114`), `eachDay` (`:141`), `isWeekend` (`:156`) — off the anchor 16 Jul 2026 = 1 Shrawan 2083 (`:41-43`) and the fixed `TODAY = 31 Jul 2026` (`:153`) |
| Session role | live-ish | `useAuth()` (`Calendar.tsx:1337`), which resolves `users.primary_role` in `src/lib/auth.tsx:78,165` |

**DB:** none. No table, view or RPC is queried anywhere on this page — there is no `src/queries/` directory in the repo, and `Calendar.tsx` imports no query module (`:1-41`).

**LOCAL:** none reached. For reference, `src/lib/mock/corpus.ts:405-421` does serve `bookings`, `booking_lines`, `booking_crew_lines` and `booking_stage_transitions`, so a wired calendar would have rows; `operation_sessions` — where the Handover / Return Session times seeded at `src/data/calendar.ts:510-511` would come from — is **UNSERVED** (`src/lib/mock/corpus.ts:33-44`). There is no holidays/festival table in the corpus store at all.

Invented on this page: every resource row, booking number, client name, serial and bar window in `ROWS`; the three festival dates in `HOLIDAYS`; the Today's Summary counts 3/5/4/2/2; the Upcoming counts 12/2/3/1/4; and the whole `B-715` detail record (project, five crew names, vehicle plate, notes and its four session times).

## 4. Actions and writes

**No dispatches. Zero.** `Calendar.tsx` imports nothing from `src/actions/` (`:1-41`), declares no capability string, and calls no `createAction` product. `checkCapability` (`src/actions/core.ts:124-218`) is therefore never reached from this route, and the `implemented` fail-closed gate (`src/actions/core.ts:222-224`) never fires here. Nothing on this page persists anything.

Buttons that navigate (`useNavigate`, `:1336`, `:1238`):

| Control | Destination | Evidence |
|---|---|---|
| `New Rental` (header, primary) | `/rentals/new` | `:2240` |
| `View Today` (KPI card) | `/today` | `:2269` |
| `Open Booking` (Selected Event panel) — rendered only when `isIssuedBy('BK', label)` | `/rentals/{label}` | `:1324-1328`; `isIssuedBy` `src/data/numbering.ts:486-494`, `BK` format `B-N` `src/data/numbering.ts:137` |
| Agenda row (`DayJobRow`) — a `<button>` only for `BK` labels, otherwise a plain `<div>` | `/rentals/{label}` | `:874-937` (`:931-935`), wired `:2080` |
| Quick Action `New Rental` | `/rentals/new` | `src/data/calendar.ts:444` via `runQuickAction` `:1598-1601` |
| Quick Action `New Maintenance` | `/inventory` | `src/data/calendar.ts:446` |
| Full View `EVENT_ACTIONS` → `Edit Booking` | `/rentals/{bookingNo}` | `:2154-2158`; the entry carries neither `to` nor `unavailable` (`src/data/calendar.ts:520`) |

All destinations resolve: `/rentals/new` `src/App.tsx:177`, `/rentals/:bookingNo` `src/App.tsx:247`, `/today` and `/inventory` are in `BUILT` (`src/App.tsx:749,759`).

Local-state-only controls (no write, no navigation): view tabs (`:1714`), layer toggles (`:1746`), event-type chips and `Clear event types` (`:1822`, `:1838`), `Clear All` (`:1860`), Saved View rows (`:1920`), the Timeline sort header (`:523`), zoom `+`/`−`/`Fit` (`:1798`, `:1804`, `:1807`), `Today` (`:1678`), prev/next range (`:1684`, `:1687`), `Filters` toggle (`:2237`, `:2110`), `Full View` / `Exit Full View` (`:2239`, `:2111`), month-grid day cells (`:760`), mini-month day cells (`:1124`), bar selection (`:423`), `View Conflicts` (`:2185`, `:2047`), and every close `×` (`:1027`, `:1254`).

Buttons with no working handler:

| Control | State | Evidence |
|---|---|---|
| Header month `‹` / `›` | `disabled aria-disabled`, no `onClick` | `:1644`, `:1668` |
| Mini-month `‹` / `›` | Have an `onClick`, but `prevOk` / `nextOk` are false for every reachable anchor because `toBs` returns `null` outside Shrawan 2083 | `:1082-1083`, `:1088-1108`; `src/lib/bs.ts:50,97` |
| `Manage` on the Festivals card | A `<span aria-disabled>` with `line-through` — not a button, not focusable, no handler | `:1167-1169` |
| Quick Action `Block Equipment` | Renders as `Unavailable` (disabled, reason on the face) | `src/data/calendar.ts:445`; `Unavailable` `:352-383` |
| `Duplicate` / `Move / Drag` / `More Actions` (Full View) | Render as `Unavailable` | `src/data/calendar.ts:521-523`, `:2148` |
| Any `EVENT_ACTIONS` entry when the selected bar is not `BK`-issued | Replaced by `Unavailable` "Select a booking bar first" | `:2151-2153` |

## 5. Gates

**Route.** Any authenticated session reaches `/calendar`. `Shell` redirects to `/login` when there is no user (`src/App.tsx:973-975`) and then applies exactly one further test: `!canViewMoney(user.role) && isMoneySurface(pathname)` (`src/App.tsx:993`). `MONEY_ROUTES` is `/finance`, `/reports`, `/admin`, `/tools/pricing`, `/tools/depreciation` (`src/data/nav.ts:147-153`), so `/calendar` is not a money surface and the guard never fires for it. Money-blind roles — Warehouse, Technician, Driver, Client (`src/lib/rbac.ts:45-50`) — all reach the page. There is **no `isStaff` test** on this route or in this component, so the external `Client` role reaches this staff screen too.

**Money visibility.** This page does *not* use the shared `useCanViewMoney()` hook (`src/lib/moneyVisibility.ts:24-27`). It calls the underlying rule directly: `role = user ? user.role : 'Client'` (`:1338`) then `money = canViewMoney(role)` (`:1339`, `src/lib/rbac.ts:36-38`). The answer is identical — `Client` is in `MONEY_BLIND`, so an unresolved session is money-blind — but the call site differs from the rest of the app.

**Hidden under Law 6.** Exactly two things, and both are **absent from the markup**, not masked:

- `Payment Due` (value 4) in the Upcoming card — `money: true` at `src/data/calendar.ts:427`, filtered at `CountList`'s `rows.filter((r) => money || !r.money)` (`:1205`).
- `Payment Due` in the event-marker legend — `src/data/calendar.ts:465`, filtered at `:1847`.

Nothing else on the page is a currency figure, so for a money-blind role the calendar is otherwise complete.

## 6. States drawn

`PageBody` (`src/components/ui/PageBody.tsx:119-207`) is **not imported**. The only `StateViews` component used is `EmptyState`, pulled from the `components/ui` barrel (`:6`; barrel re-export `src/components/ui/index.ts:21`; component `src/components/ui/StateViews.tsx:34-84`).

| State | Present? | Detail |
|---|---|---|
| Loading | **none** | Nothing on the page is async. The `LoadingSkeleton` a visitor may see belongs to `Shell`'s `Suspense` fallback while the lazy chunk downloads (`src/App.tsx:1026`), not to this screen. |
| Error | **none** | No error path exists in the file. `Shell`'s `ErrorBoundary` (`src/App.tsx:1025`) is the only backstop. |
| Empty | **three, two hand-rolled** | `EmptyState` in `AvailabilityPanel` (`:1058-1062`); hand-rolled "No resources match these filters" inside `Timeline` (`:668-675`); hand-rolled "No jobs on this day under the current filters." inside `DayJobList` (`:971-974`). |
| Restricted | **none** | No `RestrictedState`, no role branch that withholds the screen. Only the two money rows are dropped (§5). |

## 7. Known gaps

1. **Stale `TODO(decision)`.** `:97-98` says "this table is now duplicated on Rentals and Calendar. It belongs in `lib/rbac.ts`" — but there is no shift-role→system-role table in this file any more. The role comes straight off the session at `:1338`, and `src/lib/auth.tsx:5-11` records that the two vocabularies were merged on 8 Aug 2026. The marker documents a mapping that no longer exists.
2. **`TODO(decision)` on the `Crew Duty` bar tone.** `src/data/calendar.ts:123-125` — the kind is drawn in both renders but is not in the legend the spec enumerates, so its colour borrows `progress` (the same family as Cleaning) as an admitted guess.
3. **No month other than Shrawan 2083 is reachable, anywhere on the page.** The header arrows ship `disabled` with the reason printed on the page face (`:118-119`, `:1644`, `:1668`, note `:1697-1702`); the mini-month arrows have handlers but `prevOk`/`nextOk` are false for every reachable anchor because `toBs` returns `null` outside the one month `src/lib/bs.ts` vouches for (`:1082-1083`; `src/lib/bs.ts:50,97`). Picking a day only re-anchors inside the same BS month (`pickDay` `:1603-1606` → `anchorFor` `:168-171` → `bsMonthDays` `:174-183`).
4. **One of four views draws no data.** `AvailabilityPanel` (`:1055-1069`) renders an `EmptyState` saying no engine computes availability. The tab is still offered at desktop (`src/data/calendar.ts:60`, `:74-78`).
5. **Utilization is a placeholder in both locations** — the KPI band (`:2271-2282`) and the Full View bottom strip (`:2187-2198`), both via `NotTracked` (`:390-401`).
6. **`Today` opens a modal.** `goToday()` sets `dayChoice = TODAY` (`:1401-1404`), and at desktop/tablet any non-null `day` renders the fixed-overlay `DaySheet` and locks body scroll (`:1437-1445`, `:2083-2087`). So the header `Today` button (`:1678`), the `T` key (`:1428`) and the zoom `Fit` button (`:1807`) all pop a modal sheet over the calendar as a side effect of a navigation action.
7. **The rail's counts contradict the page's own derived counts.** Today's Summary is hardcoded — Pickup 3, Return 5, Cleaning 4, Maintenance 2 (`src/data/calendar.ts:414-420`) — while the KPI card two inches away counts bars covering today from `ROWS` (`:1545-1551`). The same applies to Upcoming's `Bookings 12` (`src/data/calendar.ts:423`) against Active Bookings (`:1541-1544`). Nothing reconciles them.
8. **Dead seed field.** All eleven `EVENT_MARKERS` carry `value: 0` (`src/data/calendar.ts:454-466`), but `markerLegend` renders only the icon and the label (`:1845-1854`). The field is never read.
9. **The rail and the KPIs ignore the filters the grid obeys.** `busyDays` (`:1507-1513`), `conflictCount` (`:1520-1523`), `activeBookings` (`:1541-1544`) and `todaysOperations` (`:1545-1551`) all reduce over the unfiltered `ROWS`, while the grid and the day list use the filtered `rows` (`:1451-1474`). Apply a client filter or a saved view and the mini-month dots and all three figures stay where they were.
10. **Mislabelled rail.** In the default desktop layout the rail is `label="Event detail"` (`:2328`) but holds the mini month, festivals, summaries, quick actions and shortcuts; the actual selected-event panel renders in the centre column instead (`:2326`). In Full View the same label is correct (`:2135-2137`).
11. **The Shortcuts card advertises two inert keys below 1180.** It renders at every width (`:2330`, `:2354`) and always lists `F — Full Calendar` and `R — Timeline` (`src/data/calendar.ts:468-475`), but both handlers are gated on `desktop` (`:1427`, `:1429`). Tablet cannot reach the Timeline view by any route — `VIEWS_BY_WIDTH.tablet` is `['Month','Week']` (`src/data/calendar.ts:76`).
12. **Detail exists for exactly one booking.** `EVENT_DETAIL` has a single key, `B-715` (`src/data/calendar.ts:498-516`). Selecting any of the other bars produces the Starts/Ends fallback with no crew, vehicle or notes (`:1283-1291`), and `timeOn` returns `null` so every agenda row for them shows a day window instead of a time (`:287-293`, `:896`).
13. **`Edit Booking` does not open an edit surface.** The entry has no `to` and no `unavailable` (`src/data/calendar.ts:520`), so `:2154-2158` sends it to `/rentals/{bookingNo}` — the identical destination as `Open Booking` (`:1325`) and as clicking the agenda row (`:2080`).
14. **`Manage` on the Festivals card is not a control.** It is a struck-through `<span aria-disabled>` (`:1167-1169`) — keyboard users cannot reach it and it has no reason string of its own; the card's footnote says "Holiday calendars are configured in Settings" (`:1194-1196`), which is a different claim from the one the strike-through makes.
15. **Two dialogs with no focus management.** `DaySheet` sets `role="dialog" aria-modal="true"` (`:1008-1010`) and the Full View shell sets `role="dialog"` (`:2094-2095`); neither traps focus, moves initial focus, or restores it on close. Escape closes them via the window-level key handler (`:1418-1424`), which ignores events originating in `INPUT`/`TEXTAREA`/`SELECT` (`:1417`).
16. **Escape cannot clear the phone agenda.** `:1420` guards the `dayChoice` reset with `!phone`, and `day` falls back to `TODAY` at phone anyway (`:1386`), so the agenda is permanent there — deliberate, but it means the phone layout has no way to deselect a day.
17. **Full View is unreachable below 1180** (`:1384`), taking the Conflicts card, the event Quick Actions card and the Selected Event rail in that mode with it.
18. **Self-declared spec disagreements, kept in the code.** The file states three and I record them as written: the phone cell keeps BS/AD day digits although the render shows "dots only" (`:708-714`, drawn `:784-809`); the week is labelled 11–17 Shrawan rather than the render's 10–16 because the Date Engine's anchor wins (`:70-74`, `src/lib/bs.ts:41-43`); and Sub-Rental bars are gold outlines rather than the render's purple (`src/data/calendar.ts:162-164`, `:150-168`).
