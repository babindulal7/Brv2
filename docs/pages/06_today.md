# Today Operations
Route `/today` · `src/modules/today/Today.tsx` · 871 lines

Status: **Partial**

---

## 1. What it is

The landing page. `/` redirects here for any signed-in session (`src/App.tsx:111`) and the 404 page's escape hatch points here too (`src/App.tsx:723-736`). It is mounted at `/today` inside `Shell` with the crumb "Today Operations" (`src/App.tsx:157-164`), lazily imported at `src/App.tsx:24`.

One component owns all five queries the screen makes and hands the rows down to four child panels — `MovementList` ×2, `AlertsPanel`, `CalendarPanel` — plus a fifth, `TimelinePanel`, that is a view of the same rows (`Today.tsx:466-871`). Every query goes through `listBookings` (`src/lib/queries/bookings.ts:410`), so all panels read one table.

The page dispatches no action of its own; the only two write attempts on the screen live in `MovementList.tsx` and neither can complete (§4).

---

## 2. What renders

### Desktop (≥1180), top to bottom

| # | Thing | Where |
|---|---|---|
| 1 | `PageHeader` title "Today", description "Today's jobs. Every other day lives in Operation." | `Today.tsx:772-785`; component `src/components/ui/Page.tsx:66-108` |
| 1a | Header action — `DatePill`: BS date over AD date, links to `/calendar?d=<CAL_TODAY_ISO>` | `Today.tsx:38-83`, rendered `:777` |
| 1b | Header action — `PeriodControl`, two buttons `[Today][Tomorrow]` (`OFFERED_PERIODS`) | `Today.tsx:107`, `:109-152`, rendered `:778` |
| 1c | Header action — `MoreFilters` popover button, with a "Clear (n)" link when anything is picked | `Today.tsx:169-316`, rendered `:779` |
| 1d | Header action — **New Rental** `Button`, navigates to `/rentals/new` | `Today.tsx:780-782` |
| 2 | `KpiStrip` with `columns={4}` | `Today.tsx:792`; component `src/components/ui/Page.tsx:203-217` |
| 3 | Right-aligned disclosure button: "2 more figures" / "Fewer figures" | `Today.tsx:793-816` |
| 4 | Two-track grid `minmax(0,1.55fr) minmax(0,1fr)` — left track: Outgoing list then Incoming list; right rail: Alerts then Calendar | `Today.tsx:818-836` |
| 5 | `TimelinePanel`, full width beneath the grid | `Today.tsx:753-764`, rendered `:866` |
| 6 | `FooterNote` | `Today.tsx:868`; component `src/components/ui/Page.tsx:443` |

**KPI cards.** `specKpis` (`Today.tsx:620-673`) is three cards — *Outgoing today* (`truck`, note "Booked and Packed"), *Incoming today* (`return_arrow`, note "N overdue in this period"), *Overdue* (`alert_triangle`, note "Any day · due back, still out") — plus a fourth, *Cash due*, only for a money-permitted session (`Today.tsx:662-672`). Labels switch to "Outgoing · Tomorrow" form when the period is not Today (`:622`, `:629`). `reachableKpis` (`Today.tsx:675-690`) adds *Active Rentals* and *Alerts* behind the disclosure.

**Outgoing / Incoming cards** (`MovementList.tsx:439-867`): header = title, a status `Pill` badge ("N Pending" primary / "N Overdue" danger), and a "View all" link to `/operations` (`:526-531`). Body = at most 6 rows (`ROWS_PER_COLUMN`, `src/data/today.ts:156`; sliced `MovementList.tsx:460`), then a "+ N more <noun>" link to `/operations` (`:846-864`). Each desktop row: time (hh:mm over AM/PM), a monogram avatar, client name, booking-number chip, `project` (or "—"), an "N items" chip, the due stamp, a status `Pill`, a `⋮` kebab, one primary `Link` button, and a late note when overdue (`:553-841`). The row's left border is red when Overdue, blue for Pickup/Delivery, transparent otherwise (`:753-757`). Hovering (or long-pressing, `:473-479`) opens a 520px `HoverCard` (`:181-299`).

**Alerts card** (`AlertsPanel.tsx:94-252`): header "Alerts", a danger pill reading "N · M critical" with an icon, and a "View all" link to `/notifications`. Rows are `<Link>`s: tinted icon disc, title, priority word, detail line, and a right-hand figure (`:154-240`). Sorted Critical → High → Normal (`:62`, `:74-76`).

**Calendar card** (`CalendarPanel.tsx:185-501`): header "Calendar" + "Open Calendar" link; a `KindChips` row (Pickups / Returns / All, `:126-159`); then a wrapping flex row holding (a) the day list — prev/next day chevrons, a BS-leading date heading derived from the selected period (`:64-71`), and up to 250px of scrollable movement rows (`:299-359`) — and (b) the mini month: month label, prev/next-month chevrons, weekday headings, leading spill days, 31 day buttons with BS large and AD in the corner and an event dot, trailing spill days, and a legend paragraph (`:363-497`).

**Timeline card** (`TimelinePanel.tsx:49-186`): header = title, "N of M", "View full timeline" → `/calendar`; body = a vertical rail and a window of 8 rows around "now" (`:47`, `:68-70`), each a `Link` with a dot (ring for the current moment), time, kind, client — project, and a status pill.

### Responsive bands the file actually reads

`Today.tsx:468` calls `useViewport()` from `src/lib/device.ts:57`, which reads **both** locked breakpoints: `BREAKPOINT = { phone: 768, desktop: 1180 }` (`device.ts:43`) via `matchMedia` (`device.ts:64-65`). No other breakpoint is read on this page.

- **≥1180 (desktop)** — the two-track grid above (`Today.tsx:818-836`).
- **768–1179 (tablet)** — one column; the rail reflows beneath the lists in the order Outgoing, Incoming, Alerts, Calendar. It is not hidden and not wrapped in `CollapsibleAside` (`Today.tsx:837-846`).
- **<768 (phone)** — a `SegmentedControl` `[Out][In][Alerts]` with counts, 44px tall (`Today.tsx:328-394`, rendered `:852-860`), showing exactly one of the three panels, followed by the Calendar card (`:861-862`). The Timeline still renders below (`:866`).

Two children read the same hook independently: `MovementList.tsx:454` (`phone` switches each row from the `.movement-row` CSS grid to a stacked card, `:729`, `:748-760`, `:762-783`) and `Page.tsx:210-212` (`KpiStrip` clamps to 2 columns at phone and 3 at tablet, so the requested `columns={4}` only holds at ≥1180).

---

## 3. Data sources

| Screen area | Kind | Detail |
|---|---|---|
| Outgoing list · Outgoing KPI · "N Pending" badge | **DB** | `bookings` with embeds `clients(name)` and `booking_lines(id, qty)` — `BASE_COLUMNS`, `src/lib/queries/bookings.ts:258-262`; query `listBookings` `:410-478`; filter set `todaysOutgoing` `:523-530` (stage IN Booked/Packed, `pickup_at` inside the Kathmandu day, `cancelled_at IS NULL`), widened to the period and narrowed by Status chips by `pickupsQuery` (`src/data/today.ts:904-906`); wired at `Today.tsx:475`, `:509-516`, `:527` |
| Incoming list · Incoming KPI | **DB** | Same table/query; filter set `todaysIncoming` (`bookings.ts:533-540` — stage On Rent, `return_at` in the day, `cancelled_at` and `actual_return_at` both NULL) via `returnsQuery` (`data/today.ts:909-911`); wired `Today.tsx:476`, `:518-528` |
| Alerts panel · Critical rows · Overdue KPI · Incoming "N Overdue" badge | **DB** | Same table; filter set `overdue(NOW_AD)` (`bookings.ts:596-603` — stage On Rent, `return_at <= now`, `actual_return_at IS NULL`), mapped to rows by `overdueAlert` (`data/today.ts:1088-1101`); wired `Today.tsx:531`, `:592`. The Incoming badge is counted off the fetched rows instead (`Today.tsx:574`) |
| Alerts panel · High rows | **DB** | Same table; `quotesExpiring(NOW_AD)` (`bookings.ts:634-641` — stage Quote, `quote_expires_at <= now`), mapped by `quoteLapsedAlert` (`data/today.ts:1112-1123`); wired `Today.tsx:532`, `:593` |
| Active Rentals KPI | **DB** | Same table, count only: `ACTIVE_RENTALS_FILTERS` (`data/today.ts:922-926`) with `withCount: true, page: {index:0,size:1}` (`Today.tsx:538-542`); the figure is `total`, the row is discarded (`:677-681`) |
| Alerts KPI | **DB** (derived) | `alertRows.length` — the same array the Alerts panel renders (`Today.tsx:685`, `:591-594`) |
| Timeline rows · Calendar day list · Calendar event dots | **DB** (derived) | `mergeByTime(pickups.rows, returns.rows)` — no third fetch (`Today.tsx:565`, `data/today.ts:660-661`); dots via `eventDaysOf` over the same rows (`data/today.ts:498-505`, `CalendarPanel.tsx:216`) |
| Row hover card facts (Project, Duration, Equipment, Delivery mode, Collect from, Return to) | **DB** | All six are `bookings` columns mapped by `toMovementRow` (`data/today.ts:1046-1075`, rendered `MovementList.tsx:185-194`) |
| Date pill (BS + AD) · Timeline "now" ring · every date range | **SEED** | `TODAY_DATE` (`src/data/today.ts:61-64`) and `NOW_AD` / `NOW` (`:727`, `:753`) all derive from `TODAY = new Date(Date.UTC(2026, 6, 31))` in `src/lib/bs.ts:153` — a frozen operating day, not the wall clock |
| Mini-month grid: month label, spill days, the 31 day cells | **SEED** | `CAL_MONTH = { bs:'Shrawan 2083', ad:'July 2026' }`, `CAL_LEADING = [29,30]`, `CAL_TRAILING = [1,2]` (`src/data/today.ts:436-439`), and `CAL_DAYS` generated over `MONTH_RANGE` = 1 Jul 2026 + 32 days (`:462-467`). The ◀/▶ month buttons navigate to the literals `/calendar?d=2026-06-01` and `2026-08-01` (`CalendarPanel.tsx:378`, `:386`) |
| Footer note | **SEED** | `FOOTER_NOTE.dates` / `.timezone` from `src/data/nav.ts`, read at `src/components/ui/Page.tsx:444` |
| Cash due KPI | *(none of the three)* | No query and no constant array. The value is the literal string `NOT_TRACKED = 'Not tracked yet'` (`Today.tsx:429`, used `:667`), with the note "No derivation exists in this build". `data/today.ts:288-306` states explicitly that `REVENUE_TODAY_PAISA` must **not** be borrowed for it |

`src/data/today.ts`'s seeded `MOVEMENTS` array (`:115-144`) and its derivatives `PICKUPS` / `RETURNS` / `TIMELINE` / `COUNTS` / `ALERTS` are **not** imported by this page — `Today.tsx:9-24` imports only the query helpers, the filter metadata and the calendar constants. `ROWS_PER_COLUMN` and `ROW_MENU` come from the same file but are configuration, not figures.

Under `VITE_DATA_SOURCE=mock` (`src/lib/supabase.ts:42`, `:66-68`) the DB rows above are served **LOCAL** by `src/lib/mock/corpus.ts`, which fills `bookings`, `booking_lines` and `clients` (`corpus.ts:405-423`). `bookings_deposit_v` is not in `VIEW_OF` (`corpus.ts:435-441`), but this page never sets `withDeposit`, so it never asks for it.

**Invented on this page:** the operating day itself — 31 Jul 2026, from `lib/bs.ts:153` — which fixes the date pill, both list ranges, the overdue cut-off and the Timeline's "now" marker at 05:45 NPT; and the mini-month's month label, its two leading and two trailing spill days, and the fixed July 2026 grid. No rupee figure and no row count on this page is invented — every number in the KPI strip, the badges and the panels is a row count or `total` returned by `listBookings`.

---

## 4. Actions and writes

`Today.tsx` itself dispatches **nothing**. Every control in the page file is either local state (`setPeriod`, `setPicked`, `setSegment`, `setAllKpis`, `Today.tsx:470-473`) or a `navigate()` (`:43`, `:780`).

Both dispatches on the screen come from `src/modules/today/MovementList.tsx`, reachable from the hover card and the `⋮` row menu, and both funnel through `runMovementAction` (`MovementList.tsx:119-151`):

| Control | Capability | Action file | `implemented` | Mapped in `checkCapability`? |
|---|---|---|---|---|
| "Complete Pickup" — hover card `MovementList.tsx:210-215`, row menu `:333-336` | `rental.pickup` | `src/actions/rentals/completePickup.ts:9-11` | **false** — the file declares no `implemented` key, and the default is `false` (`src/actions/core.ts:89`) | **Yes** — `core.ts:197-206` → `rbac.canWriteFloor` |
| "Complete Return" — hover card `MovementList.tsx:216-221`, row menu `:337-340` | `operations.perform` | `src/actions/rentals/returnRental.ts:46-51` | **true** (`:51`) | **Yes** — `core.ts:138-139` → `rbac.canPerformOperations` (`src/lib/rbac.ts:291-293`: Owner, Admin, Manager, Warehouse, Technician) |

Written exactly:

- **Complete Pickup** renders, dispatches `completePickup({ rentalId, equipmentIds: [] })` (`MovementList.tsx:143-145`), action is a stub (`core.ts:223` fails it closed before validate, execute, events or audit). The rejection is swallowed into `console.error` (`MovementList.tsx:150`); the success toast at `:213` / `:335` only runs on a resolved promise, so it never fires.
- **Complete Return** renders, dispatches `completeReturn({ rentalId, lines: [] })` (`MovementList.tsx:146-148`). The action is implemented, but it is always called with an empty `lines` array — a `MovementRow` carries an item *count* and no line ids — and `validateFloorVerb` rejects that (`returnRental.ts:53-55`), so no write ever lands from this page and no toast fires.
- Either dispatch is skipped entirely when no one is signed in — no fallback identity (`MovementList.tsx:125-130`).

Controls that act without an action dispatcher:

- **Copy Booking Number** (`MovementList.tsx:329-332`) writes to the clipboard and fires the one honest success toast on this page.
- Every row **primary** button (Pack / Handover / Return / Open) is a `<Link>`, not a write (`primaryFor`, `MovementList.tsx:58-72`).
- Row-menu **Open**, **Edit**, **Packing List**, **Print Checklist**, **Invoice** are `navigate()` calls (`MovementList.tsx:323-328`).

Buttons with no handler / deliberately inert:

- Row menu: **QR**, **WhatsApp**, **Call**, **Email**, **Duplicate**, **Cancel** carry `aria-disabled`, a `title` reason and an `onClick` that returns early (`MovementList.tsx:342-349`, `:376-383`).
- More Filters: the panel renders 34 chips across 5 groups (`MORE_FILTERS`, `src/data/today.ts:546-559`). Only 9 are live — `Booked`, `Packed` (Pickup group), `Inspection` (mapped onto stage `Returned`) and the six Status stages — because only those resolve to `{ kind: 'stage' }` in `FILTER_SUPPORT` (`data/today.ts:595-640`). The other 25 are genuinely `disabled` buttons wrapped in a `title`-bearing span naming the missing column or join (`Today.tsx:269-304`). A live chip reaches Postgres through `chips.stage` (`data/today.ts:896-901`), intersected with the column's structural stage set; an empty intersection sets `impossible`, and the fetcher returns `{rows: [], total: 0}` without querying (`Today.tsx:511`, `:520`).
- KPI disclosure (`Today.tsx:794-815`), `PeriodControl` (`:127-147`), `SegmentedControl` (`:361-389`) and `KindChips` (`CalendarPanel.tsx:146-155`) are all local state only.

---

## 5. Gates

**Route.** `/today` renders inside `Shell` (`src/App.tsx:157-164`). `Shell` holds during session restore (`App.tsx:964-970`) and redirects to `/login` when there is no user (`:973-975`). Its only role gate is `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`App.tsx:993`); `MONEY_ROUTES` is `/finance`, `/reports`, `/admin`, `/tools/pricing`, `/tools/depreciation` (`src/data/nav.ts:147-153`), so `isMoneySurface('/today')` is false and **every signed-in role reaches this page** — including `Client`, which `rbac.isStaff` (`src/lib/rbac.ts:53`) classifies as external and which the `bookings_select` RLS policy (`auth_is_staff()`) excludes from every booking row (documented at `src/lib/queries/bookings.ts:174-186`). A Client session therefore gets the full page with empty lists rather than a restricted state.

**Money visibility.** `useCanViewMoney()` (`Today.tsx:469`; `src/lib/moneyVisibility.ts:24-27`) → `canViewMoney(role)` (`rbac.ts:36-38`), false for `MONEY_BLIND = Warehouse, Technician, Driver, Client` (`rbac.ts:45-50`) and for any unauthenticated session.

Hidden under Law 6 on this page — all three by **omission**, never masking:

1. The **Cash due** KPI card is spread into the array only when `money` is true (`Today.tsx:662-672`). A money-blind session gets a 3-card strip with no hole and no fourth card in the DOM.
2. The **Invoice** row-menu entry is filtered out of `ROW_MENU` before render (`MovementList.tsx:321`).
3. The hover card's **Receive Payment** action requires `money && user && canRecordPayment(user.role)` — Owner, Coordinator, Accounts (`MovementList.tsx:209`; `rbac.ts:296-299`). It navigates to `/finance`; it does not open a payment modal.

No rupee figure crosses the wire on this page at all: `BASE_COLUMNS` does not name `deposit_required` (`bookings.ts:258-262`) and nothing here passes `withDeposit`. The one money-gated card renders the string "Not tracked yet" even for the roles allowed to see it.

---

## 6. States drawn

| State | Drawn? | How |
|---|---|---|
| Loading | **Yes** | `PageBody` → `LoadingSkeleton` in all four panels: `MovementList.tsx:535-545` (`skeleton="table"`, 6 rows), `AlertsPanel.tsx:142-150` (3 rows), `CalendarPanel.tsx:300-315` (4 rows), `TimelinePanel.tsx:90-100` (8 rows). The KPI strip has no skeleton of its own — `countOf` renders `—` while any of its lists is loading (`Today.tsx:418-420`), as does the Alerts badge (`AlertsPanel.tsx:121`) |
| Error | **Yes** | `PageBody` → `ErrorBanner`, title composed as `Could not load/refresh <noun>` with `useList`'s bare reason underneath (`src/components/ui/PageBody.tsx:152-180`; `src/lib/queries/useList.ts:190-200`). `hasRows` is passed by every panel, so a failed refresh puts the banner *above* surviving rows. `onRetry` is `list.refetch` for the two lists (`MovementList.tsx:539`) and `refetchAll` — all five queries — for Alerts, Calendar and Timeline (`Today.tsx:549-555`, `:729`, `:739`, `:761`) |
| Empty | **Yes** | `PageBody` → `EmptyState`, in both shapes. Unfiltered: "No pickups today" / "No returns tomorrow" / "No movements today" with "Nothing is scheduled in this period." (`Today.tsx:697-698`, `:402-409`; `MovementList.tsx:546-551`, `CalendarPanel.tsx:316-318`, `TimelinePanel.tsx:101-103`). Filtered: `PageBody`'s default "No … match these filters" with a **Clear filters** button wired to `clearFilters` (`Today.tsx:491-494`, `PageBody.tsx:191-196`). `isFiltered` is forced by the page rather than inferred — `picked.length > 0 \|\| period !== 'Today'` (`Today.tsx:489`, passed as `isFilteredOverride` `:527-528`). Alerts has its own empty copy, "Nothing needs attention" (`AlertsPanel.tsx:151-152`) |
| Restricted | **No** | No panel on this page passes `restricted` to `PageBody`, and the route carries no role gate, so `RestrictedState` is unreachable from `/today`. The only restricted view in range is `Shell`'s module guard (`App.tsx:1020-1023`), which never fires for this path (§5) |

---

## 7. Known gaps

**`TODO(decision)` markers in the page file**

1. `Today.tsx:91-106` — which periods Today may offer. `PERIOD_CHIPS` still ships seven (`src/data/today.ts:532`) and six of them are real server-side ranges (`periodRange`, `:813-839`); only `Today` and `Tomorrow` are rendered (`Today.tsx:107`). The `▾` the wireframe draws is deliberately not rendered.
2. `Today.tsx:608-619` — four KPI cards or six. The file names three mutually contradictory sources and resolves none; the compromise is the disclosure at `:793-816`. `src/data/today.ts:186-228` carries the same open question from the other end.
3. `Today.tsx:646-661` — what derives "Cash due". Nothing in the repo computes it; the card renders `NOT_TRACKED` (`:429`, `:667`).

**Markers in files this page depends on**

4. `src/data/today.ts:169-179` — the throughput figure `12 of 25` is not derivable from its own inputs (unused by this page; `THROUGHPUT` is not imported here).
5. `src/data/today.ts:202-228` — the "six KPI cards, SETTLED 6 Aug 2026" ruling versus two later sources.
6. `src/data/today.ts:287-305` — `REVENUE_TODAY_PAISA` is explicitly *not* Cash due.
7. `src/data/today.ts:509-531` — do not delete the five unoffered period chips, because that would decide the open question by making the alternative unbuildable.
8. `src/lib/queries/bookings.ts:212-219` — whether `itemCount` (`sum(qty)` over every line) means "units to physically pull" or "priced lines' units". This number is rendered on every row of this page as "N items" (`MovementList.tsx:713`) and in the hover card (`:189`).
9. `src/lib/queries/bookings.ts:732-737` — the rental day runs 06:00→06:00, but "today's pickups" is bounded at Kathmandu midnight. This changes which bookings appear on this screen at 5am and 11pm.
10. `src/components/ui/PageBody.tsx:48-57` — a refetch *in progress* still blanks surviving rows with a skeleton. Every Retry button on this page hits that.

**Stubs and writes that cannot land**

11. `completePickup` has no `implemented` key (`src/actions/rentals/completePickup.ts:9-16`), so `core.ts:223` fails it closed. The button is offered in two places (`MovementList.tsx:210-215`, `:333-336`).
12. `completeReturn` is implemented but is always handed `lines: []` from here (`MovementList.tsx:147`), which its own `validate` rejects (`returnRental.ts:53-55`). The unit selection has to come from a screen that knows it.
13. `refetchAll` subscribes to `RENTAL_PICKED_UP` and `RENTAL_RETURNED` (`Today.tsx:557-558`), but nothing reachable from this page can emit either — see 11 and 12.

**Dead buttons and dead links**

14. `AlertsPanel.tsx:128-133` — "View all" links to `/notifications`. `src/App.tsx` declares no such route, so it lands on the catch-all 404 (`App.tsx:715-741`).
15. `MovementList.tsx:342-349` — six row-menu entries (QR, WhatsApp, Call, Email, Duplicate, Cancel) are permanently inert with a stated reason.
16. `src/data/today.ts:595-640` — 25 of the 34 More Filters chips are `disabled`, each carrying the column or join it would need.
17. `CalendarPanel.tsx:378`, `:386` — the mini-month's ◀/▶ buttons navigate to the hardcoded literals `2026-06-01` and `2026-08-01`.
18. `CalendarPanel.tsx:112` — `kindOf` tests `m.kind === 'Inspection'`, which `toMovementRow` can never produce (`src/data/today.ts:1058` emits only `Return` / `Pickup` / `Delivery`). Dead branch.
19. `MovementList.tsx:333-341` — the row menu offers **both** "Complete Pickup" and "Complete Return" on every row regardless of `side`, so an Incoming row's menu offers Complete Pickup.

**Frozen clock**

20. `src/data/today.ts:727` sets the page's anchor to `lib/bs.ts`'s `TODAY`, which is `new Date(Date.UTC(2026, 6, 31))` (`src/lib/bs.ts:146-153`) — a frozen seeded operating day, not `new Date()`. Consequences on this page: both list ranges query 31 Jul 2026 whatever the real date is; `overdue()` and `quotesExpiring()` compare against 2026-07-31T00:00Z; `NOW = 345` puts the Timeline's "now" ring at 05:45 NPT (`data/today.ts:753`, `TimelinePanel.tsx:68`, `:116`); and the mini-month is permanently July 2026. `data/today.ts:711-726` states this is deliberate and that flipping `bs.ts:153` moves Today, Calendar, Rentals and Pulse together.

**Comments that disagree with the code they sit on**

21. `src/data/today.ts:537` ("The twelve Foundation stages") and `:551-557` ("populated from `STAGES`, the build-locked twelve") describe the Status filter group. The code reads `STATUS_ORDER`, which is the canonical **six** (`src/lib/workflow.ts:31`, `:53-55`). The code is right; the comments are stale.
22. `src/data/today.ts:406-407` — "§13 — the twelve entries" over a `ROW_MENU` array of **14** entries (`:407-422`). `MovementList.tsx:302` counts 14 correctly.
23. `Today.tsx:157-167` — "The 31 options, and which of them are real". `MORE_FILTERS` renders **34** chips over 32 distinct `FILTER_SUPPORT` keys (`data/today.ts:546-559`).

**Shared-state and duplication notes**

24. `picked` is a flat `string[]` (`Today.tsx:471`) while `Booked` and `Packed` appear in two groups of `MORE_FILTERS` (Pickup, `data/today.ts:547`; Status, `:558`). Toggling either copy sets both `aria-pressed` and counts once toward the "Clear (n)" badge.
25. `TimelinePanel` and the Calendar card's day list render the same `day` array (`Today.tsx:565`, passed `:735` and `:756`). `TimelinePanel.tsx:10-21` records that the duplication was flagged and deliberately not resolved.
26. Neither list query paginates — `todaysOutgoing` / `todaysIncoming` carry no `page` (`bookings.ts:523-540`), so every matching booking is fetched and only 6 are rendered (`MovementList.tsx:460`). The KPI figures are `rows.length` off those full arrays (`Today.tsx:624`, `:631`), so the card and the "+ N more" link agree by construction.
