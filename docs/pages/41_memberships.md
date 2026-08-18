# Memberships

Route `/clients/memberships` · `src/modules/clients/Membership.tsx` · 915 lines

Status: **Seed-only**

## 1. What it is

A membership plan catalogue and a 14-row member table, both drawn entirely from the constant arrays in `src/data/membership.ts:76` (`MEMBERS`) and `src/data/membership.ts:274` (`PLANS`) — no query, no action, no write anywhere in the file (imports, `src/modules/clients/Membership.tsx:1-26`).

The same component renders twice: standalone at `/clients/memberships` (`src/App.tsx:537-544`) and, with `embedded` set, as the Membership tab of the Clients screen (`src/modules/clients/Clients.tsx:226`). `embedded` suppresses the page header, the tab strip and the footer note (`src/modules/clients/Membership.tsx:322`, `:912`).

## 2. What renders

Desktop, top to bottom, standalone (`embedded = false`, default at `src/modules/clients/Membership.tsx:261`):

1. **PageHeader** — title "Clients", description "Manage memberships, renewals and member benefits" (`Membership.tsx:324-345`). Two actions: **New Membership**, disabled inside `Unavailable` (`:335-339`), and **Settings**, which navigates to `/settings` (`:340-342`).
2. **Tab strip** (`:347-382`) — `TABS` from `src/data/membership.ts:16` = Clients · Membership · Referral · Credit. `Credit` is filtered out when the session cannot see money (`:354`). A non-active tab navigates to `/clients?tab=<lowercased label>` (`:361`); the active tab's onClick does nothing (`:360-362`).
3. **KPI strip** (`:386`) — `kpisFor(MEMBERS, money)` (`src/data/membership.ts:220-239`): Total Members, Active, Expiring (≤30 days), Grace (≤30 days), Lapsed, plus Membership Revenue only when money is visible.
4. **Card "Membership Plans"** (`:388-477`). Header actions: two view-toggle buttons Cards / Comparison Table (`:392-396`) and **Edit Plans**, disabled inside `Unavailable` (`:397-401`). Body: a note paragraph whose text swaps on money visibility (`:405-409`); then either a fixed five-column grid of `PlanCard` (`:411-426`, `gridTemplateColumns: 'repeat(5, minmax(0,1fr))'` at `:412`) or a comparison table (`:428-461`) with a "Members on plan" count row (`:451-458`); then `STACK_NOTE` with an info icon (`:464-476`).
   Each `PlanCard` (`:80-203`) draws an icon tile, plan name, a badge Pill, the price block (money only, `:118-125`), discount lines, limits, features, a member count, and a **View members** button that filters the table below rather than navigating (`:177-199`).
5. **Quick-filter chip row** (`:480-552`) — five chips from `chipsFor(MEMBERS)` (`src/data/membership.ts:250-258`) with counts; then right-aligned **Renews within 30 days** toggle (`:531-540`), **More filters** disabled (`:541-545`) and **Export** disabled (`:546-550`).
6. **Level-filter banner**, rendered only when a plan card set `level` (`:554-590`), with a "Clear level filter" link.
7. **Members card** (`:593-896`), body padding zeroed:
   - Toolbar (`:594-663`): select-all checkbox, "N selected", three disabled bulk buttons **Send Reminder / Change Level / More** (`:614-618`), a "Clear selection" link when anything is selected (`:619-635`), and a Rows-per-page select of 5 / 10 / 25 (`:636-662`, `src/data/membership.ts:409`).
   - Table (`:665-862`): columns are Member · Level · Status · Join Date (BS / AD) · Renewal Date (BS / AD) · Days Left · Paid (Fee)† · Membership Savings (vs full price)† · Lifetime Spend† · Bookings (This Month) · Active Rentals · Credit Limit (Rs)† · Actions (`:304-318`). † columns are dropped for a money-blind session (`:318`). Row internals: avatar initials tile (`:716-733`), status dot with the bucket named in words (`:741-764`), BS above AD in both date cells (`:766-774`), `UsageBar` for bookings and rentals (`:58-78`, `:802-807`), and a row action button that navigates to `/clients?q=<member name>` (`:837-855`).
   - Footer (`:864-895`): "Showing X to Y of Z members", the four-dot `LEGEND` (`:881-886`), and a numbered pager (`:888-894`, `PageBtn` at `:216-240`).
8. **Grace-period note** paragraph (`:898-910`, `src/data/membership.ts:399-400`).
9. **FooterNote** with the extra line "Discount stacking is capped at 25%" (`:912`) — standalone only.

**Responsive bands: this file reads neither 768 nor 1180.** There is no `useViewport`, no `useCapability`, no `src/lib/device.ts` import and no media query anywhere in it (imports `:1-26`). Two imported components read a band on its behalf:

- `KpiStrip` clamps its column count to 2 below 768 and 3 below 1180 (`src/components/ui/Page.tsx:210-212`, breakpoints at `src/lib/device.ts:43`), so the KPI row is the only part of this page that reflows.
- `Unavailable` reads `useCapability().hasHover` (`src/components/ui/Unavailable.tsx:44`), which is a pointer query, not a width — it swaps the disabled-reason tooltip for a long-press popover.

Everything else is fixed at every width: the plan grid is a hard five columns (`:412`), and both tables keep pixel `minWidth`s — 780 for the comparison table (`:429`) and 1240 / 880 for the member table (`:666`) — inside `overflowX: 'auto'` wrappers (`:428`, `:665`). Below roughly 1180 the plan cards squeeze and the tables scroll sideways rather than reflowing to cards. The shell separately replaces the sidebar with a bottom bar below 768 (`src/App.tsx:957-958`, `:1004`, `:1033`), but that is shell furniture, not this page.

## 3. Data sources

| screen area | source kind | detail |
|---|---|---|
| KPI strip (6 cards) | SEED | `kpisFor(MEMBERS, money)` — `src/data/membership.ts:220-239`, counting over `MEMBERS` (`src/data/membership.ts:76-203`). Revenue card sums `totalFeesPaisa` (`:212-214`). Called at `Membership.tsx:274`. |
| Plan cards | SEED | `PLANS` — `src/data/membership.ts:274-373`; rendered `Membership.tsx:414`. |
| Comparison table | SEED | `COMPARISON_ROWS` over the same `PLANS` — `src/data/membership.ts:383-391`; `Membership.tsx:433`, `:441`. |
| "Members on plan" / PlanCard member count | SEED | `MEMBERS.filter(...)` — `Membership.tsx:418`, `:455`. |
| Quick-filter chips and their counts | SEED | `chipsFor(MEMBERS)` — `src/data/membership.ts:250-258`; `Membership.tsx:273`. |
| Members table rows (all 12 data columns) | SEED | `MEMBERS` — `src/data/membership.ts:76-203`; filtered at `Membership.tsx:276-287`. |
| Tab strip labels | SEED | `TABS` — `src/data/membership.ts:16`. |
| Tier pill colour | SEED | `TIER_TONE` — `src/data/clients.ts:70-76`; used `Membership.tsx:742`. |
| Legend · stacking note · grace note | SEED | `LEGEND`, `STACK_NOTE`, `GRACE_NOTE` — `src/data/membership.ts:396-407`. |
| Rows-per-page options | SEED | `MEMBER_ROWS_PER_PAGE` — `src/data/membership.ts:409`. |
| Footer note bar | SEED | `FOOTER_NOTE` — `src/data/nav.ts:428-432`, via `FooterNote` (`src/components/ui/Page.tsx:443-444`). |

There is **no DB row and no LOCAL row on this page.** The file imports nothing from `src/lib/queries` (`Membership.tsx:1-26`). For completeness: the schema does hold `membership_plans` (`supabase/migrations/0005_clients.sql:339`), `client_memberships` (`:411`) and `membership_limit_breaches` (`:469`), and a sibling surface reads `membership_plans_v` through `listMembershipPlans` (`src/lib/queries/clients.ts:492-504`) — this page reads none of them. In mock mode there would be nothing to read either: `membership_plans` is listed in `UNSERVED` (`src/lib/mock/corpus.ts:33-44`), `client_memberships` has no entry in the store at all (`src/lib/mock/corpus.ts:405-423`), and `client_directory_v.membership_level` is hardcoded `null` (`src/lib/mock/corpus.ts:495`).

Invented on this page: every figure — the 14 members with their names, join and renewal dates, days-left counts, fees paid, savings, lifetime spend, credit limits and booking/rental usage; the five plans' annual fees, discount percentages, booking/rental/user limits and default credit limits; all six KPI values including Membership Revenue; and every chip and "members on plan" count — all from `src/data/membership.ts`.

## 4. Actions and writes

**No dispatch of any kind.** The file imports nothing from `src/actions` (`Membership.tsx:1-26`), so no capability string is ever handed to `checkCapability` (`src/actions/core.ts:124-218`) from this page, and no `createAction` wrapper is reached. There is no membership action file to dispatch to: `src/actions/clients/` holds only `blockClient.ts`, `createClient.ts`, `mergeClients.ts` and `updateClient.ts`, and the only occurrence of the word "membership" under `src/actions` is a comment (`src/actions/clients/createClient.ts:379`).

Every control on the page and what it actually does:

| control | file:line | behaviour |
|---|---|---|
| New Membership | `Membership.tsx:335-339` | **Disabled, no onClick.** Wrapped in `Unavailable` with the reason "Membership enrolment is not built yet — no flow creates a membership record". |
| Settings | `:340-342` | `navigate('/settings')`. |
| Tab buttons | `:356-380` | `navigate('/clients?tab=…')` for a non-active tab; the active tab's handler is a no-op (`:360-362`). |
| Cards / Comparison Table | `:392-396` | `setPlanView` — local state only. |
| Edit Plans | `:397-401` | **Disabled, no handler.** Reason: plan definitions are seed data. |
| PlanCard "View members" | `:177-199`, `:419-423` | Local `setLevel` + `setBucket(null)` + reset page. Disabled when the plan has zero members. |
| Filter chips (×5) | `:484-527` | Local `setBucket` + reset page. |
| Renews within 30 days | `:531-540` | Local `setRenewingSoon` toggle. |
| More filters | `:541-545` | **Disabled, no handler.** |
| Export | `:546-550` | **Disabled, no handler** — reason "no export service exists". (Contrast the Clients directory's Export, which writes a real CSV at `src/modules/clients/Clients.tsx:97-139`.) |
| Clear level filter | `:570-588` | Local. |
| Select-all / per-row checkboxes | `:605-610`, `:699-711` | Local `Set<string>` state. |
| Send Reminder · Change Level · More | `:614-618` | **All three disabled, no handler,** sharing one reason constant `BULK_REASON` (`:245`). |
| Clear selection | `:620-634` | Local. |
| Rows per page | `:638-661` | Local `setPerPage` + reset page. |
| Row action ↗ | `:837-855` | `navigate('/clients?q=<name>')`. The directory reads `q` on mount (`src/modules/clients/ClientsDirectory.tsx:296`). |
| Pager ‹ / n / › | `:216-240`, `:889-893` | Local `setPage`. |
| EmptyState "Clear all filters" | `:682-692` | Local — clears bucket, level and renewingSoon. |

Buttons with no handler at all: **New Membership, Edit Plans, More filters, Export, Send Reminder, Change Level, More** — seven, every one of them `disabled` and every one carrying a stated reason through `Unavailable`.

## 5. Gates

**Route.** `Shell` (`src/App.tsx:943-1040`) requires a resolved session and redirects to `/login` otherwise (`:973-975`). Its only role gate is the money-surface backstop (`:993`), and `/clients/memberships` is not a money surface: `MONEY_ROUTES` is `/finance`, `/reports`, `/admin`, `/tools/pricing`, `/tools/depreciation` (`src/data/nav.ts:145-153`), matched by `isMoneySurface` (`:156-159`). So all nine `SystemRole` values (`src/types/database.ts:116-125`) reach this route once signed in — including the external `Client` role; there is no `isStaff()` check (`src/lib/rbac.ts:53-55`) on this route or in this file.

**Money.** `const money = useCanViewMoney()` (`Membership.tsx:263`) → `canViewMoney` (`src/lib/rbac.ts:36-38`), false for the `MONEY_BLIND` set Warehouse · Technician · Driver · Client (`src/lib/rbac.ts:45-50`).

Hidden under Law 6 when `money` is false — omitted, never masked or zeroed:

- The **Credit tab** is absent from the tab strip (`:354`).
- The **Membership Revenue** KPI card is absent (`src/data/membership.ts:228`), leaving five cards.
- On each plan card, the **price block does not render** (`:118-125`) and money-flagged limits are filtered out, dropping "Default Credit Limit" (`:86`, `src/data/membership.ts:287` etc.).
- The comparison table drops the **Annual Fee** and **Default Credit Limit** rows (`:441`, `src/data/membership.ts:384`, `:390`).
- Four table columns disappear — **Paid (Fee)**, **Membership Savings**, **Lifetime Spend**, **Credit Limit (Rs)** (`:304-318`, `:783`, `:785-794`, `:796-800`, `:809-828`) — and the table's `minWidth` drops from 1240 to 880 (`:666`).
- The plans note swaps to "Fees and credit limits are not shown for this role." (`:406-408`).

Every visible rupee figure passes through `formatMoney` (`src/lib/money.ts:62-69`) — `:783`, `:788`, `:798`, `:812`, `:824`, and `src/data/membership.ts:233`.

## 6. States drawn

- **Loading — none in this file.** The data is a module constant, so nothing is ever pending. The only loading UI on the route is the shell's `Suspense` fallback for the lazy chunk (`src/App.tsx:1026`, `LoadingSkeleton type="card"`).
- **Error — none in this file.** No `ErrorBanner`, no retry path. A throw would be caught by the shell's `ErrorBoundary` (`src/App.tsx:1025`).
- **Empty — yes, hand-placed, not via `PageBody`.** `EmptyState` (`src/components/ui/StateViews.tsx:34`) is rendered inside a spanning table cell (`Membership.tsx:679-694`) with "Clear all filters". It can only fire from filtering: `MEMBERS` has 14 rows and is never empty, so the "nothing here yet" case is unreachable.
- **Restricted — none in this file.** `RestrictedState` appears only in the shell's money guard (`src/App.tsx:1020-1023`), which never triggers on this route (§5).

`PageBody` (`src/components/ui/PageBody.tsx`) is **not used** — the file imports `EmptyState` directly from `StateViews` (`Membership.tsx:5`), so the restricted → error → loading → empty ladder is absent and three of the four states simply do not exist here.

## 7. Known gaps

1. **No `TODO(decision)` marker in either file** (`Membership.tsx`, `src/data/membership.ts` — grep-checked, zero hits). But the seed it paints with carries one: `src/data/clients.ts:66-68` records that the tier→colour map is "a rendering choice, not a ruling", and every Level pill on this page is drawn from it (`Membership.tsx:742`).
2. **Zero writes and seven dead buttons.** Nothing here enrols, renews, changes a level, sends a reminder or exports. See §4 for the list with reasons; every one is `disabled` with a stated reason rather than silently inert.
3. **This page and the tab beside it disagree about where plan economics come from.** `Membership.tsx` renders annual fee, discounts, limits and default credit limit from the `PLANS` constant (`src/data/membership.ts:274-373`). The Credit tab of the same screen reads the same policy from `membership_plans_v` (`src/lib/queries/clients.ts:492-504`) precisely because `supabase/migrations/0005_clients.sql:461-464` quotes the table's own comment — "no plan value may be hardcoded in application code — every read comes from this table". Both render inside one screen (`src/modules/clients/Clients.tsx:226`, `:228-230`), so Clients can show two different plan catalogues in two tabs. The Credit tab also draws an empty state when the table holds no active plan (`src/modules/clients/Clients.tsx:440`) while this page always shows five.
4. **A stale comment routes the row action to a search instead of a record.** `Membership.tsx:831-836` states "There is no `/clients/:id` route, so the honest destination is the directory filtered to this member". That route exists — `src/App.tsx:576-583` mounts `/clients/:id` → `ClientDetail`. The button still works (`ClientsDirectory.tsx:296` reads `q`), but it opens a name search, not the member's profile.
5. **The seed breaks the renewal rule the schema states in words.** `supabase/migrations/0005_clients.sql:435`: "every renewal falls on the join anniversary. A member who joined 10 Feb cannot renew on 05 Jan." `MEMBERS` M-2 (`src/data/membership.ts:86-94`) joins 10 Feb 2026 and renews 05 Jan 2027 — the exact case the comment names as impossible. M-1 (`:78-85`) joins 15 Jan and renews 05 Jan; M-10 (`:159-166`) joins and renews on the same day, 12 Dec 2026.
6. **The grace countdown is computed two different ways inside one array.** M-12 (`src/data/membership.ts:176-184`) has `daysLeft: -26` and the note "In grace — 4d left", i.e. 30 − 26 under the 30-day rule in `GRACE_NOTE` (`:399-400`). M-9 (`:150-157`) has `daysLeft: -12` and the note "In grace — 12d left", which restates the overdue count instead — under the same rule that member has 18 days left. The table prints both figures a few columns apart (`Membership.tsx:761-763` and `:776-781`).
7. **`daysLeft` is a stored constant, so nothing on this page moves with the calendar.** The "Renews within 30 days" filter tests it directly (`Membership.tsx:283`) and the Active/Expiring/Grace/Lapsed buckets are hand-assigned per row (`src/data/membership.ts:80`, `:89`, …), so "Renews in 61d" will read 61 days forever and the chip counts never change. Nor is any date converted: `joinBs` / `renewBs` are pre-typed strings (`src/data/membership.ts:81` etc.), so the "All dates are shown in BS above AD" footer claim (`src/data/nav.ts:429`) is met here by transcription, not by `lib/bs`.
8. **The three filters cannot all be reached from the filter row.** Chips set `bucket` only (`Membership.tsx:487-490`); `level` can only be set from a plan card's View members (`:419-423`) and only cleared from the banner (`:570-588`); `renewingSoon` is its own toggle (`:534-537`). The only control that clears all three is the empty state's "Clear all filters" (`:686-691`), which is unreachable unless the filters already returned nothing.
9. **Selection is never pruned.** `selected` is a `Set<string>` (`:269`) that no effect clears when `rows` changes (`:276-287`), so the "N selected" count (`:611-613`) can name members that filtering or paging has taken off screen. Inert today only because all three bulk actions are disabled (`:614-618`).
10. **The standalone page duplicates the tab strip Clients owns, from a different list.** `Membership.tsx:347-382` renders `TABS` (`src/data/membership.ts:16`); `src/modules/clients/Clients.tsx:164-191` renders `TAB_DEFS` (`:37-42`). The two agree today — including on hiding Credit from money-blind roles — but nothing keeps them in step.
11. **Standalone, the page titles itself "Clients", not Memberships** (`Membership.tsx:325`), under the breadcrumb "Clients / Directory & Membership" (`src/App.tsx:540`), so `/clients/memberships` and `/clients` present identical headings.
