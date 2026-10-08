# Crew Assist

Route `/crew` · `src/modules/crew/CrewBooking.tsx` · 1180 lines

Mounted at `src/App.tsx:257-264` (lazy import at `src/App.tsx:82`), inside `Shell` with the
crumb `Crew Assist`. Status assigned: **Seed-only**.

---

## 1. What it is

A single-surface crew screen: six KPI tiles, a roster-availability chip row, a week calendar of
assignment blocks, a CREW roster table, an ASSIGNMENTS table, and a right rail of summary /
ledger / alerts / quick actions (`src/modules/crew/CrewBooking.tsx:372-703`).

Every figure on it is computed in-process from two constant arrays in `src/data/crew.ts`
(`CREW_ROSTER` at `src/data/crew.ts:102`, `CREW_DATA` at `src/data/crew.ts:124`). The file issues
no query and dispatches no action — every write control on the page is a `disabled` button wrapped
in `Unavailable` (`src/components/ui/Unavailable.tsx:35`).

---

## 2. What renders

Top to bottom at desktop:

| # | Section | Lines |
|---|---|---|
| 1 | `PageHeader` — icon `crew`, title "Crew Assist", description, header action `Book Crew` (disabled, wrapped in `Unavailable`) | `src/modules/crew/CrewBooking.tsx:374-388` |
| 2 | KPI grid — 6 tiles with money, 5 without; column count from `kpiColumns()` | `src/modules/crew/CrewBooking.tsx:400-425`, `:712-716` |
| 2a | `Crew Booked Today` — count of `onShootToday()` assignments | `:407`, predicate `:69-75` |
| 2b | `Available Today` — `roster.available` | `:408` |
| 2c | `Conflicts` — `conflicts.length + travelWarnings.length` | `:409-415` |
| 2d | `Timesheets Outstanding` — literal `"—"` | `:416` |
| 2e | `Billed · Cost · Margin` (`BillingKpiTile`) — money roles only | `:417`, `:845-857` |
| 2f | `Crew-Days · Fill Rate` | `:418-424` |
| 3 | Toolbar — 4 chip buttons (`All`/`Available`/`Booked`/`Unavailable`) with counts; search `Input`; `Date range` and `Export` both disabled under `Unavailable` | `:430-476` |
| 4 | `WeekCalendar` — one row per person with an assignment touching the Monday-based week of `TODAY`, one coloured block per covered day | `:483`, `:903-1017` |
| 5 | `Card "Crew"` — roster table `Name │ Role │ Availability │ Day rate │ Actions`, `Book` per row (disabled) | `:486-544` |
| 6 | `Card "Assignments"` — 8-column table with a select-all checkbox, per-row checkbox, `IntelCard`-wrapped name cell, `View` button | `:546-688` |
| 7 | Right rail — `Roster summary`, `Payout ledger` (money roles only), `Alerts`, `Quick actions` (4 disabled buttons) | `:298-370`, rendered `:694-700` |

### Responsive bands

The file reads `useViewport()` (`src/modules/crew/CrewBooking.tsx:188`) from `src/lib/device.ts`,
which reads **both** locked breakpoints — `BREAKPOINT = { phone: 768, desktop: 1180 }` at
`src/lib/device.ts:43`, banded at `src/lib/device.ts:45-51`. The page derives two booleans:
`desktop` (≥1180) at `:189` and `phone` (<768) at `:190`. The tablet band is the implicit middle.

| Band | What changes |
|---|---|
| **phone** (<768) | KPI grid clamps to 2 columns (`:713`); search input goes 100% wide (`:458`); roster renders as `RosterCard` list instead of a table (`:497-502`, `:743-769`); assignments render as `AssignmentCard` list (`:557-571`, `:772-820`); rail content renders as a plain stacked column (`:699`) |
| **tablet** (768–1179) | KPI grid clamps to 3 columns (`:714`); both tables render as tables, but the Assignments table drops `Production` (`:589`), `Financials (Cost)` (`:591`) and `Payout Status` (`:593`); outer grid collapses to one column (`:481`); rail content reflows beneath the lists (`:699`) |
| **desktop** (≥1180) | Full column count (`:715`); all 8 assignment columns; rail rendered inside `Rail` (`:695`), which is `CollapsibleAside` (`src/components/ui/Page.tsx:327`) |

`Unavailable` additionally branches on capability, not viewport — `useCapability().hasHover`
decides `title` vs long-press popover (`src/components/ui/Unavailable.tsx:44`, `:70-77`, `:111`).

---

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| KPI `Crew Booked Today` | SEED | `CREW_DATA` (`src/data/crew.ts:124`) filtered by `onShootToday()` (`CrewBooking.tsx:69-75`) against `TODAY`, frozen at `Date.UTC(2026, 6, 31)` (`src/lib/bs.ts:153`) |
| KPI `Available Today` | SEED | `rosterSummary(CREW_ROSTER)` — `src/data/crew.ts:503-511`, roster array `src/data/crew.ts:102-115` |
| KPI `Conflicts` | SEED | `detectConflicts()` (`src/data/crew.ts:423-447`) + `detectTravelWarnings()` (`src/data/crew.ts:475-499`), both over `CREW_DATA` |
| KPI `Timesheets Outstanding` | — | Hard-coded string `"—"` at `CrewBooking.tsx:416`; no source of any kind |
| KPI `Billed · Cost · Margin` | SEED | `crewBilling()` (`src/lib/money.ts:208-219`) over `crewDaysBooked(CREW_DATA)` (`src/data/crew.ts:595`), `FEE_PER_CREW_DAY_PAISA = rupees(1000)` (`src/data/crew.ts:382`), `CREW_EXPENSES_THIS_MONTH_PAISA = rupees(329300)` (`src/data/crew.ts:390`) |
| KPI `Crew-Days · Fill Rate` | SEED | `crewDaysBooked()` + `fillRate()` (`src/data/crew.ts:595`, `:600-607`) over `CREW_DATA` and `OPEN_ROLE_REQUESTS` (`src/data/crew.ts:363-366`) |
| Chip row counts | SEED | `rosterChipCounts(CREW_ROSTER)` — `src/data/crew.ts:542-545` |
| Crew Calendar blocks | SEED | `CREW_DATA`; week derived from `mondayOf(TODAY)` (`CrewBooking.tsx:897-905`) |
| CREW table / `RosterCard` | SEED | `CREW_ROSTER` (`src/data/crew.ts:102-115`), filtered at `CrewBooking.tsx:237-244` |
| ASSIGNMENTS table / `AssignmentCard` | SEED | `CREW_DATA` (`src/data/crew.ts:124-360`), filtered at `CrewBooking.tsx:247-261` |
| Hover intel card (name cell) | SEED | `crewGlance()` / `crewDetailGroups()` — `src/data/crewIntel.ts:168-206`, `:208-274` — built from the same `CREW_DATA` rows grouped by `name` (`CrewBooking.tsx:202-210`) |
| Rail `Roster summary` | SEED | `rosterSummary()`; `Timesheets outstanding` row is the literal `"—"` (`CrewBooking.tsx:308`) |
| Rail `Payout ledger` | SEED | `payoutLedger(CREW_DATA)` (`src/data/crew.ts:640-654`); `tdsPaisa`/`netPaisa` are hard `null` (`src/data/crew.ts:651-652`) and render "Not tracked yet" (`CrewBooking.tsx:323-324`) |
| Rail `Alerts` | SEED | conflicts + travel warnings + `OPEN_ROLE_REQUESTS` + a derived payout-due row (`CrewBooking.tsx:1072-1130`) |

**DB: nothing.** The file imports no Supabase client, no query module, and `src/queries/` does not
exist in this repo. The schema for this page does exist and is simply unread — `crew_members` at
`supabase/migrations/0003_operations.sql:1078` and `crew_profiles_v2` at
`supabase/migrations/0009_crew_vehicles.sql:15`.

**LOCAL: nothing.** `src/lib/mock/corpus.ts` serves `booking_crew_lines` (`src/lib/mock/corpus.ts:418`,
built at `:321-332`) but carries **no crew roster or crew assignment table at all** — it is absent
from the `store` (`src/lib/mock/corpus.ts:405-422`) and also absent from `UNSERVED`
(`src/lib/mock/corpus.ts:33-44`), so mock mode's unserved-table banner would never name it either.
Treat the crew roster as UNSERVED by the corpus.

Invented on this page: every rupee and every count — the 12 roster people and their day rates
(`src/data/crew.ts:102-115`), the 11 assignments with their dates, day rates and totals
(`src/data/crew.ts:124-360`), the 2 open role requests (`src/data/crew.ts:363-366`), the
Rs 1,000/crew-day coordination fee (`src/data/crew.ts:382`), the Rs 3,29,300 monthly expense total
(`src/data/crew.ts:390`), and therefore the whole Billed · Cost · Margin tile, the payout ledger
gross figures, the fill rate and the conflict/travel alert lists.

---

## 4. Actions and writes

**This page dispatches nothing.** There is no `import` of any file under `src/actions/` in
`src/modules/crew/CrewBooking.tsx` — the only state-changing calls are React `useState` setters and
`react-router` navigation.

### Controls that write nothing but are drawn as buttons

| Control | Line | State |
|---|---|---|
| Header `Book Crew` | `:382-387` | `disabled`, wrapped in `Unavailable` with `BOOK_CREW_UNAVAILABLE` (`:116-117`). No handler. |
| Rail `Book Crew` | `:347-351` | `disabled` + `Unavailable`. No handler. |
| Rail `Create Call Sheet` | `:352-356` | `disabled` + `Unavailable` (`CALL_SHEET_UNAVAILABLE`, `:126`). No handler. |
| Rail `Open Timesheets` | `:357-361` | `disabled` + `Unavailable` (`TIMESHEETS_UNAVAILABLE`, `:160`). No handler. |
| Rail `Open Payouts` | `:362-366` | `disabled` + `Unavailable` (`PAYOUTS_UNAVAILABLE`, `:161-162`). No handler. |
| Toolbar `Date range` | `:465-469` | `disabled` + `Unavailable` (`DATE_RANGE_UNAVAILABLE`, `:147-148`). No handler. |
| Toolbar `Export` | `:470-474` | `disabled` + `Unavailable` (`EXPORT_UNAVAILABLE`, `:139`). No handler. |
| Roster row `Book` (table) | `:531-535` | `disabled` + `Unavailable`. No handler. |
| Roster row `Book` (phone card) | `:761-765` | `disabled` + `Unavailable`. No handler. |
| Select-all checkbox | `:578-583` | `onChange` → `handleSelectAll` (`:277-280`) → `setSelectedRowIds`. Nothing reads the set. |
| Per-row checkbox | `:608-613` | `onChange` → `handleToggleRow` (`:282-287`). Nothing reads the set. |

### Controls that do something

| Control | Line | Effect |
|---|---|---|
| Chip buttons ×4 | `:433-454` | `setRosterChip` — local filter over `CREW_ROSTER` only |
| Search `Input` | `:459-463` | `setSearchQuery` — filters both lists |
| `Clear Filters` (CREW empty state) | `:491-495` | resets `rosterChip` + `searchQuery` |
| `Clear Filters` (ASSIGNMENTS empty state) | `:551-555` | resets `rosterChip` + `searchQuery` |
| Assignment row `View` | `:677-679` | `navigate('/rentals/' + c.linkedBooking)` |
| `AssignmentCard` `View booking` | `:814-816` | same navigate via `onOpen` (`:568`) |
| Booking-number link in Production cell | `:640-642` | `<Link to={'/rentals/' + c.linkedBooking}>` |
| `IntelCard` primary action `Open booking` | `src/data/crewIntel.ts:204` | route link |
| Alert rows — conflict / travel | `:1152-1157` | `<Link>` to `/rentals/{bookingNo}` |
| Alert rows — unfilled role / payout due | `:1172-1176` | rendered as a plain `<div>`, deliberately no anchor (`:1050-1071`) |

### The action that exists but is not wired here

`src/actions/crew/bookCrew.ts` declares `permissions: ['crew.assign']` (`src/actions/crew/bookCrew.ts:12`)
and has **no `implemented: true`**, so `createAction` throws `ActionNotImplementedError` before
anything observable happens (`src/actions/core.ts:220-222`). The capability string `crew.assign`
**is** mapped in `checkCapability` — `src/actions/core.ts:212` → `rbac.canWriteSharedTriage(ctx.role)`
— so it is not a fail-closed-for-every-role case; the body is simply absent. The only caller in
the repo is `src/modules/rentals/modals/AssignCrewModal.tsx:109`, not this page.

---

## 5. Gates

**Route access.** `App.tsx:257-264` wraps `<CrewBooking />` in `Shell` with no role predicate.
`Shell` redirects to `/login` when there is no session (`src/App.tsx:973-975`) and applies exactly
one role gate: `!canViewMoney(user.role) && isMoneySurface(pathname)` (`src/App.tsx:993`).
`/crew` is **not** in `MONEY_ROUTES` (`src/data/nav.ts:147-153`), so that guard never fires here.
**All nine `SystemRole` values reach this route**, `Client` included — `Crew Assist` is nav item 6
for every role, since `permittedNav()` only filters money surfaces (`src/data/nav.ts:110-116`,
`src/data/nav.ts:73`).

**Money visibility.** This page does **not** call `useCanViewMoney()` (`src/lib/moneyVisibility.ts:24`).
It uses the stricter field gate: `canViewMoneyField(gateContext(user?.role ?? 'Client'), 'asset-finance')`
at `src/modules/crew/CrewBooking.tsx:178-182`. `moneyScope()` returns `'booking-and-client-balance'`
for Coordinator (`src/lib/fieldGating.ts:60`) and `canViewMoneyField` refuses `'asset-finance'` for
that scope (`src/lib/fieldGating.ts:71`). Net effect:

- **Sees money here:** Owner, Admin, Manager, Accounts (`src/lib/fieldGating.ts:53`).
- **Money-blind here:** Coordinator (by field scope), plus Warehouse, Technician, Driver, Client
  (`MONEY_BLIND`, `src/lib/rbac.ts:45-50`, reached via `moneyScope` returning `'none'`).

**Omitted, not masked, under Law 6** when `canCrewMoney` is false:

- `Billed · Cost · Margin` KPI tile, and the grid drops from 6 to 5 columns (`:403`, `:417`)
- `Day rate` column header and cells in the CREW table (`:511`, `:525-529`)
- Rate line on `RosterCard` (`:754-757`)
- `Financials (Cost)` column header and cells in ASSIGNMENTS (`:591`, `:653-658`)
- Money line on `AssignmentCard` (`:804-808`)
- The entire `Payout ledger` rail section (`:317-331`)
- The `Pay` group in the hover detail card (`src/data/crewIntel.ts:254-271`) and the `/day` glance
  line (`src/data/crewIntel.ts:192-194`)

**PII.** The phone number under the crew name is gated by `canViewPII(gctx)` (`:631-633`), as is the
`Contact` group in the detail card (`src/data/crewIntel.ts:249-251`). `gateContext()` at `:178`
passes no `deliveryLinked`, so Driver resolves to `false` (`src/lib/fieldGating.ts:94`);
Warehouse and Technician are never allowed (`src/lib/fieldGating.ts:90-96`).

---

## 6. States drawn

| State | Present? | How |
|---|---|---|
| Loading | **none in this file.** Data is a synchronous module constant. The only loading UI is the route-level `Suspense` fallback `<LoadingSkeleton type="card" label="Loading…" />` in `Shell` (`src/App.tsx:1026`) covering the lazy chunk. |
| Error | **none in this file.** No try/catch, no `ErrorBanner`. Covered only by the `ErrorBoundary` in `Shell` (`src/App.tsx:1025`). |
| Empty | **three, via `EmptyState`** from `src/components/ui/StateViews.tsx:34` — CREW list "Nobody matches this filter" (`:488-496`), ASSIGNMENTS list "No crew assignments found" (`:548-556`), calendar "No bookings this week" (`:930`). Plus one hand-rolled empty line, "No alerts right now." (`:1132-1134`). |
| Restricted | **none in this file.** `RestrictedState` exists at `src/components/ui/StateViews.tsx:213` and is rendered by `Shell` (`src/App.tsx:1022`), but its condition (`isMoneySurface`) is false for `/crew`, so no role ever sees a Restricted view on this page. |

`src/components/ui/PageBody.tsx` is **not imported** by this file — the four states are not routed
through the shared body component.

---

## 7. Known gaps

1. **`TODO(decision)` — where the crew-booking flow lives.** `src/modules/crew/CrewBooking.tsx:112-114`.
   Consequence: `Book Crew` is a disabled `Unavailable` in four places (`:347`, `:382`, `:531`, `:761`).
   The file's own comment (`:77-115`) records that this button previously fired
   `bookCrew({ crewIds: ['CRW-101'] })` with a fabricated id in a format the roster does not use
   (roster ids are `CR-001…`, `src/data/crew.ts:102`) and toasted success synchronously.

2. **`TODO(decision)` — TDS rate.** `src/data/crew.ts:624-626`. `payoutLedger()` returns
   `tdsPaisa: null` and `netPaisa: null` (`src/data/crew.ts:651-652`); the rail prints
   "Not tracked yet" for both (`CrewBooking.tsx:323-324`). Gross is the only real ledger figure.

3. **Stale `TODO(decision)` in a file this page imports.** `src/data/crew.ts:373-381` says
   `FEE_PER_CREW_DAY_PAISA` is "declared **twice** … and again at `data/settings.ts:8` at Rs 500".
   That duplicate no longer exists — `src/data/settings.ts:12-16` records that it was deleted. The
   TODO describes a hazard that is already closed.

4. **The coordination fee on this page ignores the Settings value.** Settings ▸ Financial renders an
   editable `crewCoordinationFeeRupees` field (`src/modules/settings/sections/Financial.tsx:80`,
   default derived at `src/lib/settingsStore.ts:104-108`), but the KPI passes the compile-time
   constant `FEE_PER_CREW_DAY_PAISA` (`CrewBooking.tsx:225`). Editing the setting changes nothing in
   `Billed · Cost · Margin`.

5. **Two different `crewBilling` functions share one name.** The page imports the one at
   `src/lib/money.ts:208` (returns `coordinationFeePaisa`/`billedPaisa`/`costPaisa`/`marginPaisa`);
   `src/data/crew.ts:656-674` exports a second under the identical name with a different shape
   (`feeTotalPaisa`, `netMarginPaisa`) and is imported by nothing. A by-name import from
   `data/crew` would silently pick up the wrong one — the exact hazard item 3's TODO was written
   about, in the same file.

6. **Dead selection state.** `selectedRowIds` (`:197`) is written by `handleSelectAll` (`:277-280`)
   and `handleToggleRow` (`:282-287`) and read only by the checkboxes' own `checked` props
   (`:580`, `:610`). Nothing else consumes it — the checkboxes are UI with no downstream effect.
   This is deliberate per `:108-110`, but it is still an inert control on the screen.

7. **Select-all can tick on a stale selection.** `:580` compares `selectedRowIds.size` to
   `filteredCrew.length` without intersecting the two, and the selection is never cleared when
   `searchQuery` changes (`:192`, `:247-261`). Select 3 rows, then type a query that narrows the
   table to 3 different rows: the header checkbox renders as checked with none of the visible rows
   ticked.

8. **A stale cross-reference to a removed tab.** The `Timesheets Outstanding` KPI note reads
   "Not tracked yet — see Timesheets tab" (`:416`), but the same file's comment at `:390-395` states
   the Booking/Directory/Timesheets/Payouts tab strip was removed, and the rail's `Open Timesheets`
   button says it is unbuilt (`:357-361`). The KPI points the operator at a destination that no
   longer exists on this screen.

9. **Unreachable code path in `AlertsList`.** The `Row` type declares `onSelect` (`:1093`) and the
   renderer branches on it (`:1159-1170`), but no row in the `rows` array (`:1095-1130`) ever sets
   it. The doc comment above (`:1058-1062`) still describes the payout row as having "a real
   destination on this very screen — the Payouts tab", which the code 55 lines below (`:1116-1119`)
   says was removed. Comment and code disagree; the branch is dead.

10. **`Crew Booked Today` renders 0 on the shipped seed.** `TODAY` is frozen at 31 Jul 2026
    (`src/lib/bs.ts:153`) and `onShootToday()` requires `status === 'Confirmed'` (`:70`). The only
    assignment covering 31 Jul is `CB-2026-0007`, which is `Draft` (`src/data/crew.ts:254-273`);
    every `Confirmed` row ends on or before 30 Jul. The headline tile is therefore permanently 0
    until the seed or the frozen date moves.

11. **A person on shoot renders a delivery-truck glyph.** `assignmentTone()` returns `'out'` for
    on-shoot-today (`:43`); the colour is correct solid green (`--st-out-bg: #15803d`,
    `src/styles/theme.css:135`) but `STATUS_ICON.out` is `'truck'` (`src/lib/status.ts:61`), which
    is drawn in the status cell (`:663`) and the calendar block (`:996-1003`).

12. **Roster/assignment join is by display name, not id.** `crewByName` groups on `c.name`
    (`:202-210`) and `rowsWithIntel` looks up by name (`:269`), even though `CrewAssignment` carries
    `crewId` (`src/data/crew.ts:36`) and `detectConflicts` correctly groups by `crewId`
    (`src/data/crew.ts:428`). Two crew sharing a name would merge into one hover card and one
    schedule.

13. **The chips reset a filter they do not drive.** The ASSIGNMENTS empty state's `Clear Filters`
    resets `rosterChip` (`:553`), but `filteredCrew` (`:247-261`) never reads it — the chip row
    filters the roster only (`:237-244`).

14. **Duplicated rail-reflow logic.** `src/components/ui/Page.tsx:348` exports `ReflowRail`,
    documented as the one shape for "rail at desktop, plain column below 1180". This file
    hand-rolls the same branch at `:694-700` rather than using it.

15. **Schema exists, corpus does not.** `crew_members` (`supabase/migrations/0003_operations.sql:1078`)
    and `crew_profiles_v2` (`supabase/migrations/0009_crew_vehicles.sql:15`) are real tables, and
    `src/data/crew.ts:76-79` cites them as the model this seed mirrors — but the mock corpus serves
    no crew roster table and does not list one in `UNSERVED` (`src/lib/mock/corpus.ts:33-44`,
    `:405-422`). Wiring this page has no LOCAL path to fall back to today.
