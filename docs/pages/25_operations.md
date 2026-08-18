# Operation Queues

Route `/operations` · `src/modules/operations/OperationsQueues.tsx` · 725 lines

Mounted at `src/App.tsx:358-365` inside `Shell` with `crumbs=[{label:'Operations Queues'}]` and the header search placeholder `"Search job, booking, client, kit…"`; lazy-loaded at `src/App.tsx:58`. `Shell` (`src/App.tsx:943-1040`) supplies the session redirect (`:973-975`), sidebar / bottom bar, `MockBanner` (`:1006`), `OfflineBanner` (`:1007`), the `ErrorBoundary` + `Suspense` fallback (`:1025-1029`) and the money-surface guard (`:993`). `/operations` is in `BUILT` (`src/App.tsx:762`), so no `Placeholder` is derived for it. The nav label is "Operation", singular (`src/data/nav.ts:70`), while the breadcrumb says "Operations Queues" and the on-page `PageHeader` title is "Operation" (`src/modules/operations/OperationsQueues.tsx:452`).

Status: **Partial.**

---

## 1. What it is

One time-ordered job list over the `bookings` table, filtered by four queue chips (Pack · Handover · Return · Reset), two grouping chips and a day scope, all held in the URL (`src/modules/operations/OperationsQueues.tsx:316-320`). Every predicate is sent to Postgres — the file contains no `.filter()` over fetched rows; the list and the four chip counts are five separate `useList` calls against the same fetcher (`:200`, `:351-353`, `:361-364`).

It writes nothing. The import block (`:1-26`) contains no `src/actions/`, no `src/lib/dataAccess` and no `src/lib/supabase`; its only outbound effects are `setSearchParams`, `navigate()` and `<Link>` (§4).

## 2. What renders

Desktop (`viewport === 'desktop'`, ≥1180), default URL (no params), top to bottom:

| # | Element | Evidence |
|---|---|---|
| 1 | `PageHeader` — icon `queues`, title "Operation", description "One floor list for every day. Queue chips filter it; they never replace it." | `:449-469`; component `src/components/ui/Page.tsx:66-108` |
| 1a | Header actions: a `role="group" aria-label="Day scope"` of three `aria-pressed` chips — Today · Tomorrow · Custom (Custom carries a `chevron_down` icon) | `:456-463`, `SCOPE_ORDER` `:147`, `SCOPE_LABEL` `:146` |
| 1b | `Button icon="refresh"` "Refresh" → `refreshAll` | `:464-466`, `refreshAll` `:372-378` |
| 2 | Custom date row — rendered **only** when `scope === 'custom'`: `From` and `To` native `type="date"` inputs plus a note that reads "Dates are Kathmandu civil days; the stored instants are UTC." with dates picked, or "No dates picked — showing every day." without | `:471-495` |
| 3 | `role="group" aria-label="Group queues by pickup or return side"` — two `aria-pressed` chips, "Pickup Today" and "Return Today" | `:504-510`; labels `src/data/operations.ts:128-131` |
| 4 | `role="group" aria-label="Queues"` — four `QueueChip`s (Packing · Handover · Return & Inspection · Reset), each an icon + title + count badge, then a fifth element that is a `<Link>` to `/operations/cases` styled as an inactive chip with an `external_link` icon | `:513-535`; `CHIPS` `:121`; titles `src/data/operations.ts:66-70`; `QueueChip` `:238-277` |
| 4a | The count badge prints `…` while a first count is in flight, `—` when `total` is `null`, otherwise the number. `—` is documented as "not a zero" | `:247-249` |
| 5 | Two-track grid `minmax(0,1fr) auto` — the list `Card` and the `Rail` | `:537-544` |
| 5a | `Card` titled `` `${listLabel}${countSuffix}` `` (e.g. "All jobs — 12 jobs"); the count suffix is omitted entirely until `list.total` is non-null | `:545-549`, `:387-395` |
| 5b | Card `action`: a "Clear filter" `Button`, rendered only when `isFiltered` | `:547`, `isFiltered` `:325` |
| 5c | `PageBody` wrapping the table — `skeleton="table"`, `skeletonRows={5}`, `noun="jobs"` | `:557-570` |
| 5d | Table (tablet + desktop): `minWidth: 760` inside an `overflowX:auto` div; header row `Time │ Booking │ Client │ Project │ Items │ Stage │ Action │ ""` | `:649-660` |
| 5e | Row: due instant (`formatDueAt`, red + bold when `isPastDue`, plus a 2px red left border), booking-no `<Link>` to `/rentals/:bookingNo`, client `<Link>` to `/clients/:clientId`, `project ?? '—'`, `itemCount`, `StageBadge`, a primary `Button` labelled with the verb → `jobRoute()`, and a `more_vert` `<Link>` back to `/rentals/:bookingNo` | `:662-708`; `StageBadge` `:280-301`; `formatDueAt` `src/data/operations.ts:342-353`; `jobRoute` `src/data/operations.ts:331-333` |
| 6 | `Rail width` default 288, holding two panels | `:719`; `Rail` `src/components/ui/Page.tsx:315-331` |
| 6a | `Card title="Crew Load"` — a paragraph reading "Not tracked yet — a per-person warehouse-job load needs an assignment this schema does not carry", naming `booking_crew_lines` and `cleaning_queue_entries.assigned_to` as the wrong sources | `:418-427` |
| 6b | An `info` note card carrying `NO_MONEY_NOTE`: "Warehouse view — no monetary values are shown or requested on this screen." | `:429-443`; string `src/data/operations.ts:364` |
| 7 | `FooterNote` with the extra line "Queues are stages — no page defines its own status names" | `:722` |

### Responsive bands

**This file reads both locked breakpoints, indirectly.** It imports `useViewport` from `src/lib/device.ts` (`:25`) and calls it once at `:308`; `BREAKPOINT = { phone: 768, desktop: 1180 }` is `src/lib/device.ts:43`. There is no pixel literal for either threshold in this file — both branches are derived at `:309-310`.

| Threshold | Read where | What changes |
|---|---|---|
| **768** | `tabular = viewport !== 'phone'` (`:309`) | ≥768 renders the table (`:649-713`) and the Card body drops its padding to 0 (`:548`). <768 renders card rows instead (`:571-646`): time + verb on line 1, booking-no · client on line 2, stage badge + item count + project on line 3, and one full-width 44px-high primary button labelled with the verb that calls `jobRoute()`. Past-due switches the card's left border to `2px solid var(--danger)` (`:583`). |
| **768** | chip row wrap (`:516`) | ≥768 the queue chip row is `flexWrap: 'wrap'`, `overflowX: visible`; <768 it is `nowrap` with `overflowX: auto` and 4px bottom padding — a horizontally scrolling strip. |
| **1180** | `railBesideList = viewport === 'desktop'` (`:310`) | ≥1180 the grid is `minmax(0,1fr) auto` and the rail content is wrapped in `Rail` (`:540`, `:719`). Below 1180 the grid collapses to `1fr` and the same `railContent` is rendered **bare**, reflowed beneath the list rather than wrapped — the file states this is deliberate, because `CollapsibleAside` defaults to collapsed at both tablet and phone (`src/components/ui/CollapsibleAside.tsx:37`) and would hide the panels behind a 44px handle (`:717-719`, `:48-54`). |

At desktop the `Rail` is expanded by default but user-collapsible, persisted per route in localStorage (`src/components/ui/CollapsibleAside.tsx:30-41`).

## 3. Data sources

| Screen area | Kind | Detail |
|---|---|---|
| The job table (every row: time, booking no, client, project, item count, stage) | **DB** | `bookings` — `listBookings()` in `src/lib/queries/bookings.ts:410-478`, select `BASE_COLUMNS` (`:258-262`) = `id, booking_no, client_id, project, stage, pickup_at, return_at, actual_return_at, delivery_type, pickup_location, return_location, quote_expires_at, cancelled_at, closed_at, created_at, clients ( name ), booking_lines ( id, qty )`, with `.is('booking_lines.voided_at', null)` (`:417`). Called from `fetchBookings` (`src/modules/operations/OperationsQueues.tsx:200`) via `useList` (`:351`). |
| "Items" column | **DB** | `sum(qty)` over the live `booking_lines` embed, not a row count — `sumQty` `src/lib/queries/bookings.ts:307-309`, mapped at `:350`. |
| "Time" column / past-due emphasis | **DB** | `pickup_at` for Pack/Handover, `return_at` for Return/Reset — `DUE_COLUMN` `src/data/operations.ts:146-151`, selected in `toJobRow` `src/data/operations.ts:281`. `isPastDue` compares that instant against `Date.now()` resolved once per render (`src/modules/operations/OperationsQueues.tsx:381`, `src/data/operations.ts:293`). |
| Stage badge and the verb on each row | **DB** (derived) | `bookings.stage` mapped through `jobForStage` → `JOBS[j].runsAt` (`src/data/operations.ts:172-174`; `src/lib/workflow.ts:101-106`). No stored job state exists. |
| The four chip counts | **DB** | The same query with `page: {index:0,size:1}` and `withCount:true` — `queueCountFilters` `src/data/operations.ts:230-232`, `useQueueCount` `src/modules/operations/OperationsQueues.tsx:203-205`. The number is the server's `count: 'exact'` (`src/lib/queries/bookings.ts:415`), not a constant. |
| Which stages each queue selects | **DB predicate** | `operationQueue()` `src/lib/queries/bookings.ts:660-703`: packing→`['Booked']`, handover→`['Packed']`, return→`['On Rent']`, reset→`['Returned']`, all with `presence: { cancelled_at: false }`. |
| Day scope ("Today" / "Tomorrow") | **SEED** | The anchor is `TODAY = new Date(Date.UTC(2026, 6, 31))` — a hard-coded constant, `src/lib/bs.ts:153` ("Fixed to the seeded operating day"), read at `src/modules/operations/OperationsQueues.tsx:141`. The `+05:45` boundary itself is derived from `NPT_OFFSET_MIN` (`src/lib/bs.ts:64`, formatted at `:133`), not re-typed. |
| Day scope ("Custom") | operator input | The two `type="date"` inputs, held in `?from=` / `?to=` (`:319-320`, `:475-489`). |
| Crew Load panel | **none** | Renders an explicit "Not tracked yet" paragraph. The old `CREW_LOAD` array of four invented people was deleted, recorded at `src/data/operations.ts:42-47`; the panel now names the missing assignment (`src/modules/operations/OperationsQueues.tsx:418-427`). |
| Queue titles, icons, URL keys, route segments | constants (labels only) | `QUEUES` `src/data/operations.ts:65-71`, `URL_KEY` `:100`, `JOB_ROUTE_SEGMENT` `:324-329`. Vocabulary, not figures. |

Under `VITE_DATA_SOURCE=mock` the same code path is served locally: `bookings`, `clients` and `booking_lines` are all built by the corpus (`src/lib/mock/corpus.ts:250-287`, `:405-423`) and are **not** in `UNSERVED` (`src/lib/mock/corpus.ts:33-44`); both embeds this page needs are declared in the mock relationship graph (`src/lib/mock/engine.ts:69-70`) and `count: 'exact'` is computed before paging (`src/lib/mock/engine.ts:486`). `.env.local` sets no `VITE_DATA_SOURCE`, so `IS_MOCK` is false and the live project is used (`src/lib/supabase.ts:42`, `:66-68`).

Invented on this page: nothing in the table or the chips — every figure is a server count or a column. The one invented input is the **day scope's anchor**: "Today" and "Tomorrow" mean 31 Jul and 1 Aug 2026, from the hard-coded `TODAY` constant (`src/lib/bs.ts:153`), not the real clock.

## 4. Actions and writes

**No action is dispatched from this page.** The import block (`src/modules/operations/OperationsQueues.tsx:1-26`) imports nothing from `src/actions/`, and a search of the file for `createAction`, `dispatch` or any capability string returns nothing. Consequently there is no capability to check against `checkCapability` (`src/actions/core.ts:124-218`) and nothing here can hit the `implemented !== true` fail-closed throw (`src/actions/core.ts:222-224`).

Every interactive element and where it goes:

| Control | Handler | Effect |
|---|---|---|
| Day scope chips ×3 (`:458`) | `setScope` `:338` | `patch({ day })`, clearing `from`/`to` unless Custom. URL only. |
| From / To date inputs (`:475-489`) | `patch({ from })` / `patch({ to })` | URL only; empty string deletes the param. |
| Refresh `Button` (`:464`) | `refreshAll` `:372-378` | Calls `refetch()` on the list and all four count queries — five queries. |
| Group chips ×2 (`:506`) | `setQuick` `:337` | `patch({ quick, queue: null })` — toggles off if already active. |
| Queue chips ×4 (`:519-527`) | `setActive` `:336` | `patch({ queue, quick: null })` — toggles off if already active. |
| Cases chip (`:530-534`) | `<Link>` | Navigates to `/operations/cases`, mounted at `src/App.tsx:367-374` (`CasesWorkspace`). |
| "Clear filter" `Button` (`:547`) | `clearAllFilters` `:339` | `setParams(new URLSearchParams())` — wipes every param. |
| `PageBody` Retry (`:559`) | `refreshAll` | Rendered only in the error state (`src/components/ui/PageBody.tsx:161-167`). |
| `PageBody` "Clear filters" (`:564`) | `clearAllFilters` | Rendered only in the filtered-empty state (`src/components/ui/PageBody.tsx:191-196`). |
| Row verb `Button` (`:695-697`) and phone card verb button (`:621-642`) | `navigate(jobRoute(bookingNo, job))` | `/rentals/:bookingNo/{packing,handover,return,reset}` — all four are mounted (`src/App.tsx:186-229`). |
| Booking-no link (`:677`, `:600`) and `more_vert` link (`:700-706`) | `<Link>` | Both go to `/rentals/:bookingNo` (`src/App.tsx:246-253`). |
| Client name link (`:682`, `:606`) | `<Link>` | `/clients/:id` (`src/App.tsx:576-583`). |

Buttons with no handler: **none.** Every `<button>` in the file carries an `onClick`.

## 5. Gates

**Route access.** `/operations` is not in `MONEY_ROUTES` (`src/data/nav.ts:147-153`), so `isMoneySurface('/operations')` is false and `Shell`'s guard (`src/App.tsx:993`) never fires. The only gate is the session check at `src/App.tsx:973-975`. Every role in the business 9 (`src/lib/rbac.ts:1-20`) therefore reaches the route, **including `Client`** — which is external (`src/lib/rbac.ts:52-55`). The page itself imposes no role check: it never calls `useAuth`, `canPerformOperations`, `canWriteFloor` or `RestrictedState`, and never passes `restricted` to `PageBody` (`:557-569`). A `Client` session reaching this URL is stopped only at the row: `bookings_select` is `auth_is_staff()` (`auth_user_role() <> 'Client'`), recorded at `src/lib/queries/bookings.ts:172-186`, so the query returns zero rows and the screen renders an ordinary empty state rather than a restricted one.

**Money visibility.** `useCanViewMoney` (`src/lib/moneyVisibility.ts:24-27`) is **not** imported or called on this page. It does not need to be: nothing money-shaped is fetched. `fetchBookings` calls `listBookings` without `withDeposit` (`:200`), so `deposit_required` is never named in a select and `readDeposits` (`src/lib/queries/bookings.ts:394-408`) never runs; `BASE_COLUMNS` carries no money column at all (`src/lib/queries/bookings.ts:258-262`) and the `booking_lines` embed asks only for `id, qty` — `qty` is outside 0019's revoked set (`src/lib/queries/bookings.ts:200-203`).

**What Law 6 hides here.** Nothing is masked, because nothing is requested. Both the page header comment (`:73-79`) and `src/data/operations.ts:356-364` state the same reason: `bookings.deposit_required` is unmasked on the base table and `bookings_select` admits Warehouse, Technician and Driver, so the query refusing to ask is the only barrier. There is no rupee figure, no rate, no total and no deposit anywhere in the render; the rail carries a standing note saying so (`:429-443`).

## 6. States drawn

All four exist, all through the shared `PageBody` (`:557-570`), in its fixed ladder restricted → error → loading → empty → children (`src/components/ui/PageBody.tsx:14-20`).

| State | How | Notes |
|---|---|---|
| **Loading** | `loading={list.loading}`, `skeleton="table"`, `skeletonRows={5}`, `noun="jobs"` (`:558`, `:565-567`) | Renders `LoadingSkeleton` with the label "Loading jobs…" (`src/components/ui/PageBody.tsx:182-184`). Separately, each chip shows `…` while its own count is first loading (`:247`). |
| **Error** | `error={list.error}`, `onRetry={refreshAll}`, `hasRows={jobs.length > 0}` (`:558-561`) | With rows on screen the banner renders **above** them and is titled "Could not refresh jobs"; with none it replaces the body and is titled "Could not load jobs" (`src/components/ui/PageBody.tsx:161-179`). Chip-count errors do **not** reach this banner — they surface as a `title` tooltip on the chip only (`:252`). |
| **Empty** | `empty={list.isEmpty}`, `emptyIsFiltered={list.isFiltered}`, `onClearFilters` (`:562-564`) | Copy is written per case: `emptyTitle` is `` `Nothing in ${listLabel} for ${scopeLabel}` `` when filtered, else "No jobs right now"; `emptyMessage` differs for a single queue, a group and neither (`:397-402`). |
| **Restricted** | via `PageBody`'s `restricted` prop — **never passed** here | The only restricted surface reachable from this route is `Shell`'s own money guard, which does not apply (§5). Hand-rolled: none. |

`isFiltered` is supplied as an explicit override (`isFilteredOverride: isFiltered`, `:352`) rather than derived, because selecting a chip replaces the whole filter set instead of adding to a baseline (`:341-350`; the mechanism is `src/lib/queries/useList.ts:256` and the reasoning `:212-255`).

## 7. Known gaps

1. **`TODAY` is a hard-coded date, so "Today" is not today.** `dayOffsetFromToday` builds the scope from `TODAY` (`src/modules/operations/OperationsQueues.tsx:140-142`), and `TODAY` is `new Date(Date.UTC(2026, 6, 31))` — 31 Jul 2026 — declared "fixed to the seeded operating day… it becomes the real clock when data is wired" (`src/lib/bs.ts:152-153`). The default scope is `'today'` (`:150`), so on any real date the page opens on 31 Jul 2026. Meanwhile `isPastDue` compares against the genuine clock, `Date.now()` (`:381`, `src/data/operations.ts:293`), so every row the default view can show is flagged red past-due. Two clocks on one screen.

2. **`TODO(decision)` in this file, at `:85`** — spec 03 §3.1 draws five chips including `(Cases 1)`; the taken decision is to drop Cases from the chip row and keep it as a link to its own route (`:82-113`). Three reasons are given (Cases has no due instant, its counterparty may be a vendor, and it is not in `bookings`). Revisit condition is stated: "if Cases gains a due instant and a booking link".

3. **The unfiltered "All jobs" view filters on a column half its rows do not display.** `withScope` binds the day range to `filters.sort.column` and the comment claims this "keeps 'Today' meaning the same thing as the instant in the row" (`:177-190`). That holds for a single queue and for either group, but with no chip selected `jobListFilters` returns `unionFilters(JOB_ORDER, 'pickup_at')` (`src/data/operations.ts:218`) while `toJobRow` still shows `return_at` for Return and Reset rows (`src/data/operations.ts:281`). Under "Today", a Return row is selected because its *pickup* was today and then displays a due time that may be a week away. `src/data/operations.ts:209-213` acknowledges the ordering half of this; the day-filter half is not acknowledged anywhere.

4. **`src/data/operations.ts`'s comments contradict this page in three places.** (a) `:111-119` states "this screen has no date control at all, which is why `operationQueue`'s optional `fromAd`/`toAd` are never passed" — the screen has had a day scope since 12 Aug (`:123-132`) and does bind dates, just through `withScope`'s own `dateRange` rather than through those parameters, which remain unused (`src/data/operations.ts:217`). (b) `:73-81` states "the screen swaps in `<CasesQueue />` wholesale instead" — it does not; there is no such import and the swap was removed (`:82-113`). (c) `:340` states "this screen has no date filter, so a queue can hold jobs from more than one day" as the reason `formatDueAt` prints a date. Stale in the same way.

5. **The list has no paging and no page control.** Neither `jobListFilters` (`src/data/operations.ts:215-219`) nor the screen ever sets `page`, and `applyListFilters` only calls `.range()` when it is present (`src/lib/queries/listQuery.ts:186-189`). Every matching booking is fetched in one request, bounded only by PostgREST's server-side max-rows. The `tiebreak: 'id'` that `listBookings` defaults in for deterministic paging (`src/lib/queries/bookings.ts:455`) does nothing here.

6. **Chip-count queries fetch column payload they never read.** `queueCountFilters` sets `page: {index:0,size:1}` but still runs the full `BASE_COLUMNS` select, including the `clients ( name )` and `booking_lines ( id, qty )` embeds (`src/data/operations.ts:230-232` → `:200` → `src/lib/queries/bookings.ts:258-262`). Four such queries plus the list fire on every filter change and on every Refresh (`:361-364`, `:372-378`).

7. **A count failure is hover-only.** `QueueChip` puts the error string in a `title` attribute (`:252`) and prints `—` in the badge. `src/lib/device.ts:81-90` provides `useCapability().hasHover` precisely because the warehouse tablet may have no hover; this page does not read it, so on a touch device a failed count is indistinguishable from "no number" with no way to see why. Law 12 asks for errors inline and persistent, which the list's own error state does honour (§6).

8. **The `more_vert` kebab is not a menu.** It renders as an overflow affordance but is a plain `<Link>` to `/rentals/:bookingNo` (`:700-706`) — the same destination as the booking-number link two cells earlier (`:677-679`).

9. **A bookmarked `?queue=cases` selects nothing.** `queueFromParam` can still answer `'Cases'` (`src/data/operations.ts:100-109`), which `:323` maps to `activeJob = null`. The result is the unfiltered "All jobs" list with no chip lit, and `isFiltered` still true via the default day scope (`:325`), so a "Clear filter" button appears for a filter the user cannot see.

10. **`toJobRow` can drop rows the header count still counts.** `jobs` is a `flatMap` that discards any row whose stage carries no job (`:382-385`, `src/data/operations.ts:277-279`), but `countSuffix` prints the server's `total` (`:395`) and `PageBody`'s `empty` reads `list.isEmpty`, i.e. `rows.length === 0` (`src/lib/queries/useList.ts:264`). If a filter set ever returned an off-stage row, the card title would over-count and an all-dropped page would render an empty table body with no empty state. The filter sets make it unreachable today, and `src/data/operations.ts:264-276` argues dropping is the honest response.

11. **Upstream `TODO(decision)`s this page's numbers inherit.** (a) What "late" means for the Pack, Handover and Reset queues is unruled, so no per-queue overdue count exists (`src/data/operations.ts:29-31`). (b) The reset queue's `'Returned'` stage is three retired stages collapsed into one by migration 0015, so Reset shows inspected, cleaned and completed bookings as one undifferentiated list (`src/lib/queries/bookings.ts:669-682`). (c) Whether the Items column means "units to physically pull" or "priced lines' units" is unruled — every line is summed, bundle parents and service lines included (`src/lib/queries/bookings.ts:211-219`). (d) A refresh in progress blanks the table for its duration, because `loading` outranks `children` in `PageBody` (`src/components/ui/PageBody.tsx:47-57`).
