# Audit Settings

Route `/admin/audit` (`src/App.tsx:602-609`) and `/admin/audit-settings` (`src/App.tsx:611-618`) · component `src/modules/admin/AuditSettings.tsx` · 612 lines

**Status: Seed-only.**

## 1. What it is

A configuration screen for audit logging, retention, audit rules, compliance rules and legal holds, plus an analytics card and a right rail (`src/modules/admin/AuditSettings.tsx:165-610`). Every figure, row and label on it is imported from the constant arrays in `src/data/audit.ts` — the file's own header calls that file "Audit Settings seed data — transcribed from render `13590713`" (`src/data/audit.ts:4`).

The component imports nothing from `src/lib/queries/*`, `src/actions/*`, `src/lib/dataAccess` or `src/lib/supabase`; its whole import list is UI kit, status tokens and `../../data/audit` (`src/modules/admin/AuditSettings.tsx:1-25`). Nothing on it reads or writes a database, and no control it renders is wired to a handler beyond four local toggles.

## 2. What renders

Top to bottom at desktop:

1. **PageHeader** — `settings` icon, title "Audit Settings", one-line description, and four `Button`s in the action slot: **Create Audit Rule** (primary), **Export**, **Verify Logs**, **Refresh** (`src/modules/admin/AuditSettings.tsx:168-182`).
2. **Two-track grid** `minmax(0,1fr) auto` — content column plus `Rail` (`src/modules/admin/AuditSettings.tsx:184`).
3. **KPI strip**, `items={KPIS} columns={6}` (`src/modules/admin/AuditSettings.tsx:186`) — Audit Events Today, Monitored Modules, Audit Rules, Retention Period, Log Integrity, Compliance Score (`src/data/audit.ts:6-13`).
4. **Row 1 — three cards**, grid `1fr / 1.05fr / 1.25fr` (`src/modules/admin/AuditSettings.tsx:188`):
   - **Audit Configuration** (`:189-266`) — a "Global Audit Logging" row with a `Toggle` and a hard-coded "Enabled" label (`:201-204`); an "Audit Level (Granularity)" button showing the literal string "Detailed" with a `chevron_down` (`:206-233`); a two-column "Log These Events" grid of 12 labelled toggles (`:236-250`, data `src/data/audit.ts:15-28`); an "Exclude System Heartbeat Logs" row with a toggle defaulted off (`:252-265`).
   - **Audit Categories** (`:268-300`) — 3×3 tiles of name + "N events today" (`src/data/audit.ts:30-40`), with a dead "View all →" link in the card action slot (`:271-273`).
   - **Retention Policies** (`:302-347`) — 4-column table (Module / Retention Period / Action After Expiry / Status), `minWidth: 380` inside an `overflowX: auto` box (`:311-312`); the "Never Delete" cell is recoloured and bolded (`:327-335`); every Status cell is a hard-coded `StatusPill text="Active"` (`:337`); footer holds an **Add Retention Policy** button (`:345`).
5. **Row 2 — three cards**, grid `1.5fr / 1fr / 1fr` (`src/modules/admin/AuditSettings.tsx:350`):
   - **Audit Rules** (`:351-393`) — 7-column table, `minWidth: 560` (`:361`), seven rows from `src/data/audit.ts:55-63`; Status is again a hard-coded "Active" pill (`:379`); last column is a bare `more_vert` icon, not a button (`:382-384`); footer holds a **Create Audit Rule** button (`:391`).
   - **Compliance Rules** (`:395-418`) — five rows, each with a check icon, name, cadence and a hard-coded "Compliant" pill (`:404-413`); **Create Compliance Rule** button (`:416`).
   - **Legal Hold** (`:420-443`) — note text, "3 Active Legal Holds" line, a **Manage Legal Holds** button (`:427`), and three stat cells Oldest Hold / Locked Records / Expires On (`:429-442`).
6. **Audit Analytics (This Month)** (`:446-501`) — one card holding a fixed **six-column** grid (`:447`): Events by Module (total + `Donut` + `Legend`, `:448-456`), Events by User (`RankBars`, `:458-462`), Events by Branch (`RankBars`, `:464-468`), High-Risk Actions (`MiniLine`, `:470-475`), Audit Growth (`MiniLine`, `:477-482`), AI Audit Insights (bullet list + dead "View Insights →" link, `:484-499`).
7. **Right rail** (`:504-604`) — Audit Summary (`SummaryRows` + a progress bar hard-coded to `width: '98%'`, `:505-510`), Alerts (`:512-529`), Quick Actions (2×2 buttons, `:531-559`), Recent Activity (`:561-581`), AI Audit Assistant (a text input with no `value`, no `onChange`, no form, `:583-603`).
8. **FooterNote** with the extra string "All audit logs are immutable and tamper-proof" (`:607`); the other two strings and the version come from `src/data/nav.ts:428-432`.

**Responsive bands: this file reads neither 768 nor 1180.** It does not import `src/lib/device.ts` at all (import list, `src/modules/admin/AuditSettings.tsx:1-25`), and every grid it declares is a fixed template — `minmax(0,1fr) auto` (`:184`), three columns (`:188`, `:350`), six columns (`:447`), 2-up (`:237`, `:532`), 3-up (`:276`, `:429`) — none of them change at any width. It also does not use `useRailGridColumns()` or `useBandColumns()` (`src/components/ui/Page.tsx:382-394`), and it renders `Rail`, not `ReflowRail` (`:504`).

Two behaviours are inherited from the shared kit rather than declared here:

- `KpiStrip` clamps its own column count — 2 at phone, 3 at tablet — via `useViewport()` (`src/components/ui/Page.tsx:210-212`), reading `BREAKPOINT = { phone: 768, desktop: 1180 }` (`src/lib/device.ts:43-51`).
- `Rail` is `CollapsibleAside` (`src/components/ui/Page.tsx:315-331`), which defaults to **collapsed at phone and tablet** (`src/components/ui/CollapsibleAside.tsx:29-37`), so the five rail cards sit behind a 44px handle below 1180.

The two tables scroll horizontally below their `minWidth` (`:311`, `:360`); `useTabularLayout()`, the card-row alternative for phones (`src/lib/device.ts:139-141`), is not called.

## 3. Data sources

| Screen area | Source kind | Detail |
| --- | --- | --- |
| KPI strip (6 cards, values, deltas, sparklines) | SEED | `KPIS` — `src/data/audit.ts:6-13`, rendered `src/modules/admin/AuditSettings.tsx:186` |
| "Log These Events" — 12 toggles and their on-state | SEED | `LOG_EVENTS` — `src/data/audit.ts:15-28`, rendered `:238-248` |
| Global Audit Logging state / "Enabled" label / "Detailed" level | SEED | String literals in the component: `:201-203`, `:227` |
| Audit Categories tiles ("1,824 events today" etc.) | SEED | `CATEGORIES` — `src/data/audit.ts:30-40`, rendered `:277-298` |
| Retention Policies table | SEED | `RETENTION` — `src/data/audit.ts:42-53`, rendered `:323-340`; Status column is the literal "Active" (`:337`) |
| Audit Rules table | SEED | `AUDIT_RULES` — `src/data/audit.ts:55-63`, rendered `:372-386`; Status column is the literal "Active" (`:379`) |
| Compliance Rules list | SEED | `COMPLIANCE` — `src/data/audit.ts:65-71`, rendered `:404-413`; Status is the literal "Compliant" (`:411`) |
| Legal Hold note, count, oldest, locked, expires | SEED | `LEGAL_HOLD` — `src/data/audit.ts:73-79`, rendered `:421-441` |
| Events by Module donut + legend + total | SEED | `BY_MODULE`, `TOTAL_EVENTS` — `src/data/audit.ts:81-89`, rendered `:450-455` |
| Events by User / Events by Branch bars | SEED | `BY_USER`, `BY_BRANCH` — `src/data/audit.ts:91-104`, rendered `:461`, `:467` |
| High-Risk Actions figure + line chart | SEED | `HIGH_RISK` — `src/data/audit.ts:106-113`, rendered `:472-474` |
| Audit Growth figure + line chart | SEED | `GROWTH` — `src/data/audit.ts:115-121`, rendered `:479-481` |
| AI Audit Insights bullets | SEED | `INSIGHTS` — `src/data/audit.ts:123-129`, rendered `:492-497` |
| Audit Summary rows + 98% bar | SEED | `SUMMARY` — `src/data/audit.ts:131-138`, rendered `:506`; the bar width is the literal `'98%'` (`:508`) |
| Alerts list | SEED | `ALERTS` — `src/data/audit.ts:140-146`, rendered `:521-527` |
| Quick Actions tiles | SEED | `QUICK_ACTIONS` — `src/data/audit.ts:148-153`, rendered `:533-557` |
| Recent Activity list | SEED | `ACTIVITY` — `src/data/audit.ts:155-161`, rendered `:570-579` |
| Footer note strings + version | SEED | `FOOTER_NOTE` — `src/data/nav.ts:428-432`, via `FooterNote` (`src/components/ui/Page.tsx:443-444`) |
| AI Audit Assistant input | — | Static markup, no data and no submit target (`:583-603`) |

No DB row: the component imports no query module, no Supabase client and no action (`src/modules/admin/AuditSettings.tsx:1-25`), and `src/lib/queries/` contains only `availability`, `bookings`, `clients`, `facetCounts`, `filterParams`, `finance`, `inventory`, `listQuery`, `useClients`, `useFilters`, `useList` — nothing audit-related.

No LOCAL row either: `buildCorpus()` serves 13 tables — `users`, `branches`, `warehouses`, `inventory_categories`, `storage_zones`, `expense_categories`, `clients`, `products`, `product_units`, `bookings`, `booking_lines`, `booking_line_units`, `booking_crew_lines`, `invoices`, `payments`, `security_deposits`, `booking_stage_transitions` (`src/lib/mock/corpus.ts:405-423`) — and `UNSERVED` lists ten more (`src/lib/mock/corpus.ts:33-44`). **No audit table appears in either list; every table this screen would need is UNSERVED, and in fact unnamed anywhere in the corpus.**

Invented on this page: all of it — the 12,846 events today, 26 monitored modules, 84 audit rules, 7-year retention, 100% log integrity, 98% compliance score, the nine categories' per-day event counts, the nine retention rows, the seven audit rules and their timestamps, the five compliance cadences, the three legal holds / 18,542 locked records, the 38,642 total events and its module split, the five named users and four named branches with their counts, both line charts, the five AI insights, the six summary rows and their 98% bar, the five alerts, and the five recent-activity entries.

## 4. Actions and writes

**No dispatches. The file imports nothing from `src/actions/`** (`src/modules/admin/AuditSettings.tsx:1-25`), so there is no capability string to check against `checkCapability` (`src/actions/core.ts:124-218`) and no `implemented` flag in play. Nothing on this screen persists anything.

Controls with **no handler at all** (`Button` accepts an optional `onClick` and simply omits it when not passed — `src/components/ui/Page.tsx:120-134`, `:147`):

| Control | Line | State |
| --- | --- | --- |
| **Create Audit Rule** (header, primary) | `:174-176` | renders, no `onClick`, dead |
| **Export** (header) | `:177` | renders, no `onClick`, dead |
| **Verify Logs** (header) | `:178` | renders, no `onClick`, dead |
| **Refresh** (header) | `:179` | renders, no `onClick`, dead |
| Audit Level "Detailed" dropdown (`<button>`) | `:208-229` | renders a chevron, no `onClick`, no menu — the value is the literal "Detailed" |
| **Add Retention Policy** | `:345` | renders, no `onClick`, dead |
| **Create Audit Rule** (card footer) | `:391` | renders, no `onClick`, dead |
| **Create Compliance Rule** | `:416` | renders, no `onClick`, dead |
| **Manage Legal Holds** | `:427` | renders, no `onClick`, dead |
| Quick Actions ×4 (Create Rule, Verify Integrity, Export Evidence, Generate Report) | `:534-557` | four `<button type="button">` with no `onClick`, dead |
| Row overflow `more_vert` on every Audit Rules row | `:382-384` | an `Icon`, not a button — no keyboard target, no menu |
| "AI Audit Assistant" text input | `:596-600` | uncontrolled, no `onChange`, no form, no submit; the `arrow_right` beside it is an `Icon`, not a button (`:601`) |
| Seven "View all →" / "Manage Policies →" / "View Insights →" links | `:271`, `:305`, `:354`, `:398`, `:487`, `:515`, `:564` | `<span aria-disabled title="Not built yet — see SCREENS.md for what is done">` — not anchors, no destination |

The only interactive control that does anything is `Toggle` (`:39-64`): its `onClick` flips a `useState` local to that one switch (`:40`, `:47`). Sixteen toggles render — 1 global, 12 event types, 1 heartbeat exclusion (`:202`, `:246`, `:264`) — and none of them read from or write to anything outside their own component instance. Nothing is persisted; a remount restores the seeded value.

## 5. Gates

**Route reach.** Both routes are wrapped in `Shell` (`src/App.tsx:604-608`, `:613-617`). `Shell` redirects to `/login` when there is no session (`src/App.tsx:973-975`), then computes `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`src/App.tsx:993`). `MONEY_ROUTES` includes the prefix `/admin` (`src/data/nav.ts:147-153`), matched as `path === r || path.startsWith(r + '/')` (`src/data/nav.ts:156-159`), so **both audit routes are money surfaces**. `canViewMoney` is `!MONEY_BLIND.has(role)` over `Warehouse, Technician, Driver, Client` (`src/lib/rbac.ts:36-50`).

So the roles that reach this screen are **Owner, Admin, Manager, Coordinator, Accounts**. Warehouse, Technician, Driver and Client get `RestrictedState` instead of the page body (`src/App.tsx:1020-1023`, component at `src/components/ui/StateViews.tsx:213-236`).

**Money visibility inside the page: none.** The component never calls `useCanViewMoney()` (`src/lib/moneyVisibility.ts:24-27`) and never imports it. It does not need to for the roles that get here, but note that the screen does print a money string — the audit rule condition "Amount > NPR 100,000" (`src/data/audit.ts:56`, rendered `:376`) — and its only protection is the route-level check above. Nothing on the page is hidden or omitted under Law 6 by the page itself.

**No settings gate.** `canManageSettings(role)` is `role === 'Owner'` (`src/lib/rbac.ts:360-362`) and `checkCapability` maps `settings.manage` to it (`src/actions/core.ts:136-137`). Neither is called here, so **Coordinator and Accounts reach a system-configuration screen with 16 toggles and nine "create/manage" controls on it.** They are currently harmless because none of them writes (§4), but the gate is absent, not passing.

## 6. States drawn

- **Loading** — none in the page. The only spinner is `Shell`'s `Suspense` fallback for the lazy chunk: `<LoadingSkeleton type="card" label="Loading…" />` (`src/App.tsx:1026`). The page itself has no async work to wait for.
- **Error** — none in the page. `Shell` wraps children in `ErrorBoundary` (`src/App.tsx:1025`), which renders `ErrorBanner` titled "This screen hit a problem" on a thrown render error (`src/components/shell/ErrorBoundary.tsx:47-52`).
- **Empty** — none, and unreachable: every list is a module-level constant array with a fixed non-zero length (`src/data/audit.ts:6-161`), so no code path produces zero rows.
- **Restricted** — not in the page; supplied by `Shell` for money-blind roles (`src/App.tsx:1020-1023`).

`src/components/ui/PageBody.tsx` (the shared Restricted → Error → Loading → Empty ladder, `:119-201`) is **not** imported by this file.

## 7. Known gaps

- **No `TODO(decision)` marker exists in either file.** `src/modules/admin/AuditSettings.tsx` and `src/data/audit.ts` contain none. The gap is undeclared rather than logged.
- **Every write control is dead.** Nine buttons, one dropdown, one search input and one row-overflow icon have no handler — full list with lines in §4. Per the dispatcher's own reasoning ("a UI that reports success for work it did not do is worse than one that is visibly unbuilt", `src/actions/core.ts:16-18`), these are silently inert rather than reporting anything: a click on **Create Audit Rule** does nothing at all, with no toast and no error.
- **The toggles lie after the first click.** `Toggle` holds local `useState` (`:39-47`), but the word beside the global switch is the hard-coded literal "Enabled" (`:203`). Switching Global Audit Logging off leaves the screen reading `Enabled` next to an off switch, and the change survives nothing — no dispatch, no persistence, and a remount restores `on` (`:202`).
- **Both line charts draw against a y-axis they do not use.** `MiniLine` scales by `max = Math.max(...d.points)` (`:111`) and then prints `d.yTicks` verbatim beside it (`:120-124`). `HIGH_RISK.points` tops out at 126 against ticks `150/100/50/0` (`src/data/audit.ts:110-112`), and `GROWTH.points` tops out at 38 against ticks `40K/30K/20K/10K/0` (`src/data/audit.ts:118-120`). In both cards the highest plotted point is drawn flush at the top of the SVG regardless of the top tick, so the labelled scale is decorative.
- **Chart x-labels do not correspond to points.** Both series carry 9 points and 5 labels (`src/data/audit.ts:111-112`, `:119-120`), and the labels are laid out with `justifyContent: 'space-between'` under the plot (`:147-153`), so the five dates land under arbitrary positions rather than under their samples.
- **The 9th audit category repeats colour 8.** `CATEGORIES` has nine entries (`src/data/audit.ts:30-40`) and is coloured `catColor(i)` (`:288`), which clamps at slot 8 (`src/components/ui/Charts.tsx:29-31`). "Documents" and "AI & Automation" therefore share a hue. The kit documents this as intended behaviour for a 9th series ("repeats slot 8 visibly rather than inventing a hue", `src/components/ui/Charts.tsx:7-10`) — the data layer's job of folding into "Others" was not done here.
- **"Log These Events" cycles the categorical palette**, `catColor(i % 8)` over 12 events (`:240`), which is the one thing `src/components/ui/Charts.tsx:7` states the kit exists to prevent ("in fixed order, **never cycled**"). Events 9-12 wear the colours of events 1-4.
- **The rail is hidden, not reflowed, below 1180.** The page renders `Rail` (`:504`). `src/components/ui/Page.tsx:333-348` states the binding rule for exactly this case — "'Right rails collapse below 1180' means **reflow**, not **hide**" — and names `ReflowRail` as the component that obeys it. On the 768-1179px warehouse tablet, Audit Summary, Alerts, Quick Actions, Recent Activity and the AI assistant all sit behind a 44px handle (`src/components/ui/CollapsibleAside.tsx:37`, `:41-98`).
- **The six-column analytics grid never collapses.** `gridTemplateColumns: 'repeat(6, minmax(0,1fr))'` is fixed (`:447`), as are the two three-column card rows (`:188`, `:350`) and the page's own `minmax(0,1fr) auto` track (`:184`, which should be `useRailGridColumns()` per `src/components/ui/Page.tsx:382-384`). A donut plus legend, two bar charts, two line charts and a bullet list are squeezed into six equal tracks at every width the file supports.
- **Two URLs, two different breadcrumbs, one screen.** `/admin/audit` renders crumbs `Administration › Immutable Audit Trail` (`src/App.tsx:605`) while `/admin/audit-settings` renders `Admin › Audit Settings` (`src/App.tsx:614`). Neither crumb says "Audit Settings" on the route everything actually links to, and the first one names the *Audit Log*'s subject matter. `/admin/audit-settings` is referenced nowhere else in `src/` — every in-app link (`src/modules/settings/sections/System.tsx:44`, `:172`, `src/modules/settings/Settings.tsx:309`, `src/data/settings.ts:760`, `src/modules/settings/sections/BranchesWarehouses.tsx:1312`) points at `/admin/audit` — so it is an orphan duplicate rather than a redirect, unlike the four `/tools/*` paths which are `Navigate … replace` (`src/App.tsx:132-135`).
- **`/admin/audit-settings` is missing from `BUILT`.** The set lists `/admin/audit` (`src/App.tsx:754`) but not the second spelling. It happens not to matter because `UNBUILT` is derived from `NAV` and `/admin` is not in `NAV` (`src/data/nav.ts:137`), but the derivation the comment at `src/App.tsx:772-774` warns about would break if `/admin/audit-settings` were ever added to nav.
- **Seven "View all" affordances are `<span aria-disabled>`**, not links or buttons (`:271`, `:305`, `:354`, `:398`, `:487`, `:515`, `:564`). They are styled with `--link` (`:37`) so they read as links, they are not focusable, and their `title` points a user at `SCREENS.md`.
- **Every status cell is a literal.** `StatusPill` takes only `text` and always paints `STATUS.in` (`:66-84`), and the three call sites pass hard-coded "Active" / "Active" / "Compliant" (`:337`, `:379`, `:411`). No row can ever show a disabled rule, a lapsed policy or a failed compliance check, and the pill carries no icon — `src/lib/status.ts:52-65` states that colour is never the sole carrier and pairs every status key with an icon in `STATUS_ICON`, which this component does not use.
- **The Audit Summary progress bar is a decoration.** Its width is the literal `'98%'` (`:508`) sitting under `SummaryRows` whose six values include a "Storage Used" of "486 GB (38%)" and a "Compliance Score" of "98%" (`src/data/audit.ts:131-138`) — the bar is not computed from either.
- **Dead fields in the seed.** `HIGH_RISK.sub = 'This Month'` (`src/data/audit.ts:109`) is never rendered; `QUICK_ACTIONS`' tone union declares `'primary'` twice (`src/data/audit.ts:148`).
- **The doc comment above the component cites a spec.** `:158-164` explains the "Forever / Never Delete" retention row as "Foundation's 'nothing is deleted' rule showing up in the retention table". What the code does is compare the seed string `r.action === 'Never Delete'` and recolour that one cell (`:327-335`); the row's content is a constant in `src/data/audit.ts:51`, not a rule the code enforces anywhere.
- **No test covers this screen.** No file under `src/` other than `src/App.tsx` and the component itself mentions `AuditSettings`.
