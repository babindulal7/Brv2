# Activity Log

Route `/admin/activity-log` · `src/modules/admin/ActivityLog.tsx` · 306 lines

Mounted at `src/App.tsx:660-667` inside `<Shell crumbs={[{ label: 'Settings' }, { label: 'Activity Log' }]}>`, lazy-loaded at `src/App.tsx:43`. A second URL resolves here: `/tools/activity-log` is a `replace` redirect to this path (`src/App.tsx:133`). Reached from Settings ▸ System ▸ Administration (`src/modules/settings/sections/System.tsx:43`).

**Status: Seed-only.**

---

## 1. What it is

A read-only usage timeline — "who did what, where", newest first — grouped by UTC date, with three `<select>` filters (user, module, date) (`src/modules/admin/ActivityLog.tsx:112-114`). Every row it draws is one of eight hand-written constants in `src/data/activityLog.ts:75-172`; the file imports no query, no action and no `supabase` client (`src/modules/admin/ActivityLog.tsx:1-18`).

It is deliberately not the Audit Log: the component header states this records usage while `AuditLog` records state changes (`src/modules/admin/ActivityLog.tsx:36-44`), and the two read from two separate seed files.

## 2. What renders

Top to bottom at desktop:

1. **`PageHeader`** — icon `activity`, title "Activity", description "Who did what, where — newest first. Usage, not state changes; those live in the Audit Log." (`src/modules/admin/ActivityLog.tsx:95-99`; component at `src/components/ui/Page.tsx:66-108`).
2. **`KpiStrip`, 4 columns** — Entries / Failed / People / Modules (`src/modules/admin/ActivityLog.tsx:84-89, 101`; component at `src/components/ui/Page.tsx:203-304`).
3. **Filter row**, `role="search"` `aria-label="Filter activity"` — three `<select>`s in a 3-column grid: User, Module, Date (`src/modules/admin/ActivityLog.tsx:103-115`). Each select carries `minHeight: 44` (`src/modules/admin/ActivityLog.tsx:295-306`).
4. **Timeline card** — one `<section aria-label="Activity on {date}">` per UTC day, each with an uppercase date `<h2>` and an `<ol>` of entries (`src/modules/admin/ActivityLog.tsx:134-156`). Each `<li>` is a 3-column grid: right-aligned `HH:MM`, a dot-and-line spine, then the sentence (`src/modules/admin/ActivityLog.tsx:168-238`). Under the sentence sit a module tag, a status tag (`error`/`check` icon + the word), and — for Owner/Manager/Admin only — `{ip} — {location}` (`src/modules/admin/ActivityLog.tsx:224-234`).
   Where the filters exclude everything, this card is replaced by an `EmptyState` (`src/modules/admin/ActivityLog.tsx:117-132`).
5. **Retention line** — the literal string from `src/data/activityLog.ts:193` (`src/modules/admin/ActivityLog.tsx:159`).
6. **`FooterNote`** (`src/modules/admin/ActivityLog.tsx:161`; component at `src/components/ui/Page.tsx:443-469`).

### Responsive bands

The file reads viewport through `useViewport()` (`src/modules/admin/ActivityLog.tsx:56`), whose bands are `phone < 768`, `tablet < 1180`, `desktop` (`src/lib/device.ts:43-51`).

**It branches on 768 only.** Three call sites all test `viewport === 'phone'`:

- Filter grid drops from `repeat(3, minmax(0,1fr))` to one column (`src/modules/admin/ActivityLog.tsx:108`).
- Card padding tightens from `4px 18px 18px` to `4px 14px 14px` (`src/modules/admin/ActivityLog.tsx:134`).
- Each entry drops from `76px 18px 1fr` to `18px 1fr` and the time moves from its own left column to a line above the sentence; the spine survives both (`src/modules/admin/ActivityLog.tsx:179, 184-188, 207-211`).

**1180 is never read in this file.** It reaches the page only indirectly, through `KpiStrip`, which clamps a requested 4 columns to 3 at tablet and 2 at phone (`src/components/ui/Page.tsx:210-212`).

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Timeline rows (all 8) | SEED | `ACTIVITY_ROWS` — 8 hand-written objects, `src/data/activityLog.ts:75-172`; re-sorted newest-first into `ACTIVITY_TIMELINE`, `src/data/activityLog.ts:175-177` |
| KPI "Entries" | SEED | `ACTIVITY_METRICS.totalActivities` = `ACTIVITY_ROWS.length` = 8 (`src/data/activityLog.ts:182`) |
| KPI "Failed" | SEED | count of `status === 'Failed'` = 2 (`src/data/activityLog.ts:183`; rows `ACT-003`, `ACT-008`) |
| KPI "People" | SEED | distinct `user` = 4, one of which is the literal `'Unknown'` (`src/data/activityLog.ts:184`, row at `:103-104`) |
| KPI "Modules" | SEED | distinct `module` = 7 (`src/data/activityLog.ts:185`) |
| User filter options | SEED | `ACTIVITY_USERS`, derived from the same 8 rows (`src/data/activityLog.ts:197-199`) |
| Module filter options | SEED | `ACTIVITY_MODULES_PRESENT`, the intersection of `ACTIVITY_MODULES` with modules actually present (`src/data/activityLog.ts:27-37, 202-204`) |
| Date filter options | SEED | `ACTIVITY_DAYS`, the two UTC dates present: `2026-08-09`, `2026-08-08` (`src/data/activityLog.ts:206-208`) |
| Target identifiers (`B-713`, `INV-492`) | SEED | rendered by `targetLabel()` through `issue()` in the numbering registry (`src/data/activityLog.ts:67-72`; `src/data/numbering.ts:417-431`) — the registry is itself a constant array (`src/data/numbering.ts:132-220`) |
| IP address + location | SEED | `ip` / `location` fields on each row, e.g. `110.44.112.5` / `Kathmandu, NP` (`src/data/activityLog.ts:85-86`) |
| Retention sentence | SEED | literal `'Retention policy: 90 days. This build shows the seeded activity only.'` (`src/data/activityLog.ts:193`) |
| Footer note bar | SEED | `FOOTER_NOTE` constant (`src/data/nav.ts:428-432`) via `src/components/ui/Page.tsx:444` |

No DB row. There is no activity table in the generated database types — the nearest is `audit_events` (`src/types/database.ts:916-934`), which this page does not read. No LOCAL row either: the mock corpus serves 13 tables plus reference data and lists its gaps in `UNSERVED` (`src/lib/mock/corpus.ts:22-44`); no activity table appears in either list, so an activity table is not merely unserved, it does not exist in this build.

Invented on this page: every figure and every string — all 8 timeline entries (actor names, verbs, screens, statuses, IP addresses and cities), all four KPI values (8 entries / 2 failed / 4 people / 7 modules), the two dates the date filter offers, and the "90 days" retention claim.

## 4. Actions and writes

**No dispatch. No write. No import from `src/actions/`** (`src/modules/admin/ActivityLog.tsx:1-18` is the complete import list). `checkCapability` (`src/actions/core.ts:124-218`) is therefore not consulted by anything on this page.

Every interactive control and where it goes:

| Control | Handler | Effect |
|---|---|---|
| User `<select>` | `onChange` → `setWho` (`src/modules/admin/ActivityLog.tsx:112, 278`) | local `useState` filter only (`:60, 66`) |
| Module `<select>` | `onChange` → `setMod` (`:113, 278`) | local `useState` filter only (`:61, 67`) |
| Date `<select>` | `onChange` → `setDay` (`:114, 278`) | local `useState` filter only (`:62, 68`) |
| "Clear filters" button in the empty state | `onAction` → resets all three to `'All'` (`:125-129`) | local state only; rendered only when at least one filter is set (`:91, 122`) |

Buttons with no handler: none — the page renders no other button.

## 5. Gates

**Route reach.** `Shell` refuses the route for any role where `!canViewMoney(role) && isMoneySurface(pathname)` (`src/App.tsx:993`). `MONEY_ROUTES` contains the bare prefix `'/admin'` (`src/data/nav.ts:147-153`) and `isMoneySurface` matches on `path.startsWith(r + '/')` (`src/data/nav.ts:156-159`), so `/admin/activity-log` **is** a money surface.

- Reach the page: **Owner, Admin, Manager, Coordinator, Accounts** (`canViewMoney`, `src/lib/rbac.ts:36-50`).
- Refused with `RestrictedState`: **Warehouse, Technician, Driver, Client** — the `MONEY_BLIND` set (`src/lib/rbac.ts:45-50`), refused at `src/App.tsx:1020-1023`.

This screen displays no money of any kind, so the refusal is a side effect of the `/admin` prefix, not of the content. See §7.

**Money visibility.** The page does not call `useCanViewMoney()` (`src/lib/moneyVisibility.ts:24-27`) — there is no rupee figure on it to gate. Nothing is hidden under Law 6 *within* the page.

**In-page role gate.** IP address and location are shown only when `user?.role === 'Owner' || 'Manager' || 'Admin'` — a role literal written in the component, not a `lib/rbac` predicate (`src/modules/admin/ActivityLog.tsx:58`, consumed at `:151, 229-233`). Combined with the route gate, the false branch of that test only ever applies to **Coordinator** and **Accounts**.

## 6. States drawn

| State | Present? | How |
|---|---|---|
| Loading | **No** in this file. The only loading UI is `Shell`'s Suspense fallback for the lazy chunk, `<LoadingSkeleton type="card" label="Loading…" />` (`src/App.tsx:1026`) — that is chunk-load, not data-load. The data is a module constant, so there is nothing to wait for. |
| Error | **No** in this file. `ErrorBoundary` wraps the route children (`src/App.tsx:1025`) and catches a render throw; there is no `ErrorBanner` and no error branch on the page. |
| Empty | **Yes**, hand-rolled — `EmptyState` imported directly from `StateViews`, not through `PageBody` (`src/modules/admin/ActivityLog.tsx:6, 117-132`; component at `src/components/ui/StateViews.tsx:34-84`). |
| Restricted | **Yes**, but supplied by the shell, not by the page — `RestrictedState` at `src/App.tsx:1020-1023`. |

The page does **not** use `src/components/ui/PageBody.tsx` (compare its four-state ladder at `src/components/ui/PageBody.tsx:143-204`).

## 7. Known gaps

1. **`TODO(decision)` markers in `ActivityLog.tsx`: none.** There are none in `src/data/activityLog.ts` either.

2. **The floor cannot reach this screen, and two files say it should.** `src/data/nav.ts:143-145` argues that listing `/tools` as a money route "would hide Audit Log, Activity Log, Numbering and Backup & Restore from the floor, which no spec asks for" — but the same array lists `'/admin'` (`src/data/nav.ts:149`), and the four screens moved to `/admin/*` on 15 Aug (`src/App.tsx:131-135`). The outcome the comment was written to prevent is exactly the current behaviour: `src/App.tsx:993` refuses `/admin/activity-log` to Warehouse, Technician, Driver and Client.

3. **Stale comment that hides gap 2.** `src/data/nav.ts:137` reads "`/admin/*` now redirects into `/tools/*`". The router does the opposite — `/tools/activity-log` redirects to `/admin/activity-log` (`src/App.tsx:133`), with the four `/tools/*` redirects at `src/App.tsx:132-135`. A reader taking that comment at face value would conclude the `'/admin'` entry is dead.

4. **A live dead door in Settings.** The Administration card lists "Activity Log → `/admin/activity-log`" for every role (`src/modules/settings/sections/System.tsx:41-48`), and the System tab is `money: false` so it is never filtered out (`src/data/settings.ts:135`; the only money filter is on whole tabs, `src/modules/settings/Settings.tsx:177`). A Warehouse operator therefore sees the link and lands on "Access restricted" — the failure shape `src/lib/rbac.ts:180-185` names ("forbidden is absent, not attempted and refused").

5. **The KPI strip ignores the filters.** `kpis` reads `ACTIVITY_METRICS` (`src/modules/admin/ActivityLog.tsx:84-89`), which is computed over all of `ACTIVITY_ROWS` (`src/data/activityLog.ts:181-186`), while the timeline below reads the filtered `rows` (`src/modules/admin/ActivityLog.tsx:64-70`). Filtering to Module = Authentication leaves one entry on screen under a card still reading "Entries 8".

6. **Times render in UTC while the footer bar on the same screen claims NPT.** `hhmm()` is `new Date(iso).toISOString().slice(11, 16)` (`src/modules/admin/ActivityLog.tsx:291-293`), so `2026-08-09T14:22:00Z` draws as `14:22`; `FooterNote` two elements below prints "Timezone: Asia/Kathmandu (NPT)" (`src/modules/admin/ActivityLog.tsx:161`; `src/data/nav.ts:430`), where that instant is 20:07.

7. **Date headers are AD-only while the footer claims BS above AD.** The group header prints the raw `YYYY-MM-DD` slice (`src/modules/admin/ActivityLog.tsx:147`, key built at `:75`); `FooterNote` prints "All dates are shown in BS above AD" (`src/data/nav.ts:429`). No BS date appears anywhere on this page.

8. **"People — Distinct actors" counts a non-person.** `uniqueUsers` is `new Set(rows.map(r => r.user)).size` (`src/data/activityLog.ts:184`) and one row's user is the literal `'Unknown'`, the failed sign-in (`src/data/activityLog.ts:103-104`). `'Unknown'` is also offered as a selectable option in the User filter (`src/data/activityLog.ts:197-199`).

9. **The unfiltered empty branch is unreachable.** `EmptyState` renders when `groups.length === 0` (`src/modules/admin/ActivityLog.tsx:117`), and the seed always supplies 8 rows (`src/data/activityLog.ts:75-172`), so the no-`actionLabel` variant at `:122` can never be shown with the current data source.

10. **A `LOG — Activity Log` sequence exists in the numbering registry and nothing issues against it.** `src/data/numbering.ts:219` registers code `LOG`, prefix `LOG`, with `format: null` and `counter: null`; every row on this page carries a hand-written `id` like `'ACT-001'` (`src/data/activityLog.ts:78`) which is never rendered and never passed through `issue()`.

11. **In-page role literal instead of an `rbac` predicate.** `src/modules/admin/ActivityLog.tsx:58` hard-codes `'Owner' | 'Manager' | 'Admin'` to gate the IP/location column. `src/lib/rbac.ts:99` already names that exact set (`BACK_OFFICE`), and `src/lib/rbac.ts:191-197` states the rule that role sets belong there, one predicate per set. No capability covers "may see network metadata".

12. **The retention claim is unenforced.** The page states "Retention policy: 90 days" (`src/data/activityLog.ts:193`, rendered at `src/modules/admin/ActivityLog.tsx:159`) with no store to retain anything in — the same sentence continues "This build shows the seeded activity only", which is the honest half.
