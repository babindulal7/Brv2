# Client Reports

Route `/reports/clients` (`src/App.tsx:465-472`) · component `src/modules/reports/ClientReports.tsx` · 512 lines.

## 1. What it is

A read-only client analytics **report**: eleven cards and one six-row table, every figure of which is a pre-aggregated literal in `src/data/clientReports.ts` (imported at `ClientReports.tsx:9-27` — the file's only data import).

It touches no query module, no `useList`, no `supabase` reference and nothing under `src/actions/` (imports, `ClientReports.tsx:1-27`). The only behaviour it owns beyond rendering is a CSV download and `window.print()`, both supplied by `ReportToolbar` (`ClientReports.tsx:210`).

The screen is not the Clients module. `/clients` renders `modules/clients/Clients.tsx` and `/clients/:id` renders `modules/clients/ClientDetail.tsx` over `client_directory_v` (`src/App.tsx:137-144`, `:576-583`); this route shares no data with either, and its six row ids do not resolve in that module (§7.1).

## 2. What renders

Top to bottom at desktop:

1. **`PageHeader`** — no icon, title "Client Reports", description "Analyze client value, revenue, retention, payment behavior, and rental performance." (`ClientReports.tsx:188-191`). No `actions` prop, so the header carries no buttons. A comment at `:193-209` records that four header buttons (Compare · Export · Saved Views · Schedule Report), a fourteen-chip period row and eight dropdown-shaped buttons were removed rather than wired, and states that this report deliberately gets **no date range** because every card above the table is a dateless constant.
2. **`ReportToolbar`** (`:210`, component `src/components/ui/ReportToolbar.tsx:432-627`) — passed only `title` and `csv`. Because `dateColumn`/`onChange` are omitted no date control is drawn (`ReportToolbar.tsx:520`), `branches` is omitted so no branch select (`:575`), `onCompareChange` is omitted so no compare select (`:595`). What renders is a bar containing exactly **`[CSV]`** and **`[Print]`**, right-aligned (`:607-618`).
3. **Two-track grid** `gridTemplateColumns: railGridColumns` (`:212`).

**Left column:**

4. **`KpiStrip`** with `columns={kpis.length}` (`:214`, component `src/components/ui/Page.tsx:203-304`) — four cards, each an icon tile, label, figure, an up/down delta line and a 12-point sparkline: Total Clients 1,248 · Active Clients 436 · Returning Clients 81% · Outstanding Receivables Rs 5,42,000 (`src/data/clientReports.ts:7-12`). The fourth is dropped when money is off (`:180`).
5. **Three-card grid**, `repeat(3, minmax(0,1fr))` when money is on, `repeat(2, …)` when off (`:216`):
   - **Client Growth Trend** — the file's own `GrowthChart` (`:48-113`): a five-label y-axis column, an SVG with five grid lines and three polylines with point circles, a seven-label x-axis row, and a three-swatch legend beneath. See §7.4 for what the axis labels describe.
   - **Revenue by Client (Top 10)** — money-gated (`:221-225`); `HBars` with ten rows and a six-tick axis (`Charts.tsx:444-504`).
   - **Client Retention Analysis** — `Donut size={116}` with centre "Total / 1,248" beside a `Legend` (`:227-232`, `Charts.tsx:81-151`, `:154-192`).
6. **Four-card grid**, `1fr 1fr 1fr 0.75fr` when money is on, `1fr 1fr 0.75fr` when off (`:235`):
   - **Booking Frequency** (`:236-252`) — three (or two) stat tiles, each a bordered icon square, figure and label. The icon takes `catColor(i)` (`:241`), i.e. the categorical *series* palette (`Charts.tsx:18-31`) applied to three unrelated statistics.
   - **Outstanding Ageing** — money-gated (`:254-261`); `Donut size={100}` + `Legend`, five buckets.
   - **Membership Analysis** (`:263-292`) — a 2×1 Members / Non-Members block (count, percentage, "of total clients") over a rule, then a row of three stat pairs (one when money is off).
   - **Damage & Case Analysis** (`:294-305`) — four label/figure rows, the figure coloured by `BRAND_TEXT[c.tone]`.
7. **Client Performance Overview** card, body padding 0 (`:308-428`), holding an `overflow-x: auto` wrapper around a `minWidth: 1000` table. Thirteen columns with money on, ten with it off (`:313-316`): Client · Client ID · Membership · Bookings · Rental Days · *Revenue (Rs)* · *Outstanding (Rs)* · *Lifetime Value (Rs)* · Last Booking · Late Returns · Cases · Status · Actions. Row shape (`:326-392`): name and id are both `<Link to={/clients/{id}}>`; the membership cell is a `STATUS[membershipKey]` chip; Outstanding is red or green on `hasOutstanding` (`:365`); Last Booking prints `lastAd` on the first line and `lastBs` in link-blue beneath it (`:371-374`); Status is the hardcoded string "Active" (`:377`); Actions is an eye glyph wrapped in a `role="button"` span that navigates, plus a bare `more_vert` glyph (`:378-390`).
8. **Table footer** (`:396-427`) — "Showing 1 to 6 of 1,248 clients" with `BS_NOTE` beneath it, and a nine-button pager `« ‹ 1 2 3 4 … 209 ›` in which `1` is styled current. All nine are literal strings (`:402`).

**`ReflowRail`** (`:431-506`, component `Page.tsx:349-371`), four cards plus a note block:

9. **Client Summary** — `SummaryRows` over six rows, four when money is off (`:432-434`, `Page.tsx:419-439`).
10. **Top Clients by Lifetime Value** — money-gated (`:436-457`); five rank/name/amount rows and a working `<Link to="/clients">` "View All Clients →".
11. **High Risk Clients** — money-gated (`:459-486`); a three-column header and five rows, the ageing figure red when `severe`. Its "View All High Risk →" is a `<span>`, not a link (`:482-484`).
12. **Client Insights** — four info-icon bullets (`:488-497`).
13. **A bare `cardStyle` block** (`:499-505`) reading "All amounts are in NPR" and "Data last updated: Today, 10:30 AM" with a decorative refresh glyph — both hardcoded strings.
14. **`FooterNote`** with no `extra` (`:509`); its two standing lines come from `FOOTER_NOTE` (`src/data/nav.ts:428-432`).

**Responsive bands the file actually reads — 1180 directly, 768 only through `KpiStrip`.** The file does not import `src/lib/device.ts`. It reaches the breakpoints through three components, all of which resolve to `useViewport()` (`device.ts:57-79`, `BREAKPOINT = { phone: 768, desktop: 1180 }` at `device.ts:43`):

- `useRailGridColumns()` (`ClientReports.tsx:177`, applied at `:212`) → `Page.tsx:382-384`: `minmax(0,1fr) auto` at ≥ 1180, one `minmax(0,1fr)` track below it.
- `<ReflowRail>` (`:431`) → `Page.tsx:349-371`: a collapsible `Rail` at ≥ 1180; below 1180 the same five blocks reflow into a plain stacked column rather than hiding behind a handle.
- `<KpiStrip>` (`:214`) → `Page.tsx:210-212`: the requested four columns are clamped to **2 below 768** and **3 between 768 and 1179**.

**Nothing else on the page responds.** The three-card grid (`:216`), the four-card grid (`:235`), the Booking Frequency tile grid (`:237`), the Membership 2×1 (`:264`) and its stat row (`:282`) are all fixed column counts at every width. The table does not adapt: `useTabularLayout()` (`device.ts:139-141`) is not imported, so below 768 the thirteen-column `minWidth: 1000` table stays a table and scrolls sideways (`:309-310`). Nothing reads `useCapability()`.

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| KPI strip (4 tiles, deltas, sparklines) | **SEED** | `KPIS`, `src/data/clientReports.ts:7-12`. Sparkline arrays are hand-written 0–100 series (`Page.tsx:186-201`). |
| Client Growth Trend — axis ticks, x labels, 3 × 15 points | **SEED** | `GROWTH`, `clientReports.ts:16-24`. |
| Revenue by Client (Top 10) + its axis | **SEED** | `REVENUE_BY_CLIENT` `:26-37`, `REVENUE_AXIS` `:38`. |
| Client Retention donut, legend, centre total | **SEED** | `RETENTION` `:40-44`, `RETENTION_TOTAL` `:45`. |
| Booking Frequency tiles | **SEED** | `FREQUENCY` `:47-51`. |
| Outstanding Ageing donut, legend, centre total | **SEED** | `AGEING` `:53-59`, `AGEING_TOTAL` `:60`. |
| Membership Analysis counts, shares, three stats | **SEED** | `MEMBERSHIP` `:62-70`. |
| Damage & Case Analysis | **SEED** | `CASES` `:72-77`. |
| Client Performance Overview — all six rows, every cell | **SEED** | `CLIENTS`, six literal objects, `clientReports.ts:111-118`. Money cells are pre-formatted strings (`'4,85,000'`), not `Paisa`. |
| Table "Status" column | hardcoded | Literal `Active` on every row (`ClientReports.tsx:377`). `ClientRow` has no status field (`clientReports.ts:79-94`). |
| "Showing 1 to 6 of 1,248 clients" and the nine pager buttons | hardcoded | String literals (`ClientReports.tsx:398`, `:402`); neither derives from `CLIENTS.length`. |
| Client Summary rail | **SEED** | `SUMMARY` `:120-127`. |
| Top Clients by Lifetime Value | **SEED** | `TOP_CLIENTS` `:129-135`. |
| High Risk Clients | **SEED** | `HIGH_RISK` `:137-143`. |
| Client Insights bullets | **SEED** | `INSIGHTS` `:145-150` — four sentences, including "21 clients are at risk of churn", a figure that appears in no other constant on the page. |
| BS note under the table | **SEED** | `BS_NOTE` `:152`. |
| "Data last updated: Today, 10:30 AM" | hardcoded | `ClientReports.tsx:502`. Nothing refreshes; the glyph beside it has no handler. |
| Footer note bar | constant | `FOOTER_NOTE` (`src/data/nav.ts:428-432`). |
| Money formatting on every seeded amount | derived at render | `formatMoney(rupees(n))` (`src/lib/money.ts:23-25`, `:62-69`) — applied inside the data file, not the page. |
| CSV provenance header (period, generation stamp) | derived at click | `buildReportCsv` (`ReportToolbar.tsx:300-341`); period prints "All dates" because no range is passed (`:261`). |
| Anything from the database | **none** | No `src/lib/queries/*` import, no RPC, no view. |
| The local store | **LOCAL — not consulted** | `src/lib/mock/corpus.ts` *does* serve `clients` (`corpus.ts:412`) and synthesises `client_directory_v` with outstanding, deposit-held, paid, booking counts and last pickup per client (`corpus.ts:444-501`). This page asks it nothing, so mock mode changes no figure here. |

Invented on this page: every figure. The 1,248 client count, 436 active, 81% returning, Rs 5,42,000 outstanding, all five sparklines, the three 15-point growth series, the ten revenue bars, the three retention segments, the three frequency averages, the five ageing buckets, the membership 356/892 split and its three stats, the four case counts, all six table rows (bookings, rental days, revenue, outstanding, lifetime value, both dates, late returns, cases), the six summary rows, the five top clients, the five high-risk clients and the four insight sentences are literals in `src/data/clientReports.ts`, whose own header calls the file "Client Reports seed data — transcribed from render `D1353039`" (`:5`).

## 4. Actions and writes

**No dispatch of any kind occurs on this page.** `src/modules/reports/ClientReports.tsx` imports nothing from `src/actions/`, calls no `createAction` result and names no capability string (imports, `:1-27`). `checkCapability` (`src/actions/core.ts:124-218`) is never reached from this route, so the question of whether a capability this page uses is mapped there does not arise — it dispatches none. No client-report action exists anywhere under `src/actions/`.

Controls that do something:

| Control | What it actually does |
|---|---|
| `[CSV]` (`:210`) | Real. `exportCsv` builds the file from `clientsCsv(money)` (`:124-166`) through `buildReportCsv` and downloads it via a Blob anchor (`ReportToolbar.tsx:502-516`, `:353-361`). Filename `client-reports-<generation day>.csv` (`:344-351`). |
| `[Print]` (`ReportToolbar.tsx:615`) | `window.print()`. |
| Client name / Client ID cells (`:329-336`) | `<Link to={/clients/{c.id}}>` — routes, but to a not-found page. See §7.1. |
| Eye glyph in Actions (`:380-387`) | `onClick={() => navigate(/clients/{c.id})}` on a `<span role="button">`. Same destination, same outcome. |
| "View All Clients →" (`:453-455`) | `<Link to="/clients">` — a real, built route (`App.tsx:137-144`). |

Buttons and glyphs with **no handler**:

- **All nine pager buttons** — `<button type="button">` with no `onClick`, no state, no `useState` anywhere in the file (`:405-424`). `1` is permanently `aria-current="page"`.
- **`more_vert`** in every Actions cell (`:388`) — a bare `<Icon>`, no wrapper, no role, no handler.
- **"View All High Risk →"** (`:482-484`) — a `<span>` styled as a link, carrying `aria-disabled` and `title="Not built yet — see SCREENS.md for what is done"`. It is not an anchor and has no destination.
- **The refresh glyph** beside "Data last updated" (`:503`) — decorative.

The CSV body is money-aware in the same shape the screen is: `clientsCsv(money)` cuts Outstanding Receivables and Average Lifetime Value from the summary block, the three money columns from the client rows, and omits the Outstanding-ageing, Top-clients and High-risk sections entirely (`:127-138`, `:149-165`). Its header comment (`:115-123`) states the reason — otherwise the download would be the way around the gate.

## 5. Gates

**Reaching the route.** `/reports/clients` mounts inside `Shell` (`App.tsx:465-472`). `Shell` holds while the session restores, then redirects an unauthenticated user to `/login` (`:964-975`), then computes `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`:993`). `MONEY_ROUTES` carries the `/reports` prefix (`src/data/nav.ts:147-153`, matcher `:156-159`), so the whole report module is a money surface. `MONEY_BLIND` is **Warehouse, Technician, Driver, Client** (`src/lib/rbac.ts:45-50`); each gets the shell's own `RestrictedState` and never reaches this component (`App.tsx:1020-1023`). The nav filter withholds the surface from the same four roles (`nav.ts:110-116`).

Roles that reach the page: **Owner, Admin, Manager, Coordinator, Accounts** — the five non-money-blind members of `SystemRole` (`src/types/database.ts:116-125`).

**Money visibility inside the page.** `useCanViewMoney()` at `:179` → `moneyVisibility.ts:24-27` → `canViewMoney` (`rbac.ts:36-38`). Unlike `ExpenseReports`, this page does **not** restrict as a whole — the comment at `:118-122` argues that bookings, rental days, retention and case counts are operational facts a money-blind role needs. Instead it omits five things individually:

| Hidden when `money` is false | Line |
|---|---|
| KPI tile "Outstanding Receivables" | `:180` |
| Summary rows "Outstanding Receivables" and "Average Lifetime Value" | `:181` |
| Membership stats "Membership Revenue" and "Savings Provided" (only Renewal Rate survives) | `:182` |
| Frequency tile "Avg. Booking Value" | `:185` |
| Whole cards: Revenue by Client, Outstanding Ageing, Top Clients, High Risk | `:221`, `:254`, `:436`, `:459` |
| Table columns Revenue / Outstanding / Lifetime Value — header and cell both | `:313-315`, `:361-370` |
| The same cuts in the CSV | `:127-138`, `:149-165` |

Every omission is a removal from the tree, never a mask, which is what `moneyVisibility.ts:19-22` and `rbac.ts:19` require.

**But none of that branch is reachable in the running app.** The shell guard denies the route to exactly the four roles for which `useCanViewMoney()` returns false, and returns `false` for a missing user only after `Shell` has already redirected to `/login`. So `money` is `true` for every session that can render this component: the money-blind layout, the ten-column table and the money-blind CSV branch are defence in depth and are not exercised by any code path in the app. No test file covers this module (`src/modules/reports/__tests__/` holds `catalog.test.ts`, `ExpenseReports.toolbar.test.tsx`, `payables.test.ts`, `ReportCatalog.dedup.test.tsx` only), so nothing exercises them in test either.

## 6. States drawn

**None of the four.** The file imports neither `PageBody` nor `StateViews` (`:1-27`) and renders no substitute:

- **Loading — none.** There is no async source; every constant is available at module load.
- **Error — none.** Nothing can fail. There is no seed-reconciliation check of the kind `ExpenseReports` runs, so the internal disagreements in §7.5 are never surfaced.
- **Empty — none.** Every card maps a non-empty constant unconditionally. `CLIENTS` is never zero-length, so `<tbody>` always has six rows; if the constant were emptied the table would render a head with no body and the footer would still read "Showing 1 to 6 of 1,248 clients".
- **Restricted — not by this file.** The only restricted state a user can see on this route is the shell's, drawn one level up (`App.tsx:1020-1023`) before the component mounts.

The one non-happy state anywhere in the rendered tree is `ReportToolbar`'s inverted-date-range `role="alert"` (`ReportToolbar.tsx:620-624`), which cannot fire here because no date control is drawn.

## 7. Known gaps

1. **Every row link resolves to "Client not found".** `CLIENTS` ids are `CLI-0001`…`CLI-0006` (`clientReports.ts:112-117`) and the name cell, the id cell and the eye button all navigate to `/clients/{id}` (`ClientReports.tsx:329`, `:334`, `:381`). `/clients/:id` mounts `ClientDetail` (`App.tsx:576-583`), which looks the id up as `client_code` and renders `PageBody empty` with `emptyTitle="Client not found"` for a miss (`ClientDetail.tsx:420-422`). None of the six names exists in the clients register. **This is a live `TODO(decision)`**, recorded at `clientReports.ts:96-110`: the prefix `CLI-` is a second client sequence that ruling §2.1 forbids (the sequence is `C-`, `data/numbering.ts`), and the file argues that renaming it to `C-1` would replace a dead link with a *wrong* one pointing at a different real client, so it is left standing until someone decides which real client each report row means. Three separate controls per row therefore lead to a dead end.
2. **The Membership `—` case never fires; the dash renders as a chip.** `:339` tests `c.membership === '—'` (U+2014, em dash). The one row with no membership carries `'-'` (U+002D, hyphen) at `clientReports.ts:115`. The equality fails, so "Creative Frame" falls to the `else` branch and renders a `STATUS['neutral']` badge whose text is a hyphen, instead of the muted dash the branch at `:340` was written for.
3. **The BS/AD note contradicts the render, and so does the footer.** The table prints `lastAd` on the first line and `lastBs` beneath it (`:372-373`), and the component's own doc comment says so: "The client table shows AD above BS and says so in a note beneath" (`:171-172`). The note it actually renders is `BS_NOTE` = **"BS dates are shown above AD dates"** (`clientReports.ts:152`, rendered at `:399`) — the opposite of the render, and the opposite of what the doc comment claims the note says. `FooterNote` at `:509` then prints the standing line "All dates are shown in BS above AD" (`nav.ts:429`), so the page states the wrong order twice. Every other dated screen in the app puts BS first, which is what makes this table the exception the note was meant to explain.
4. **The growth chart's y-axis describes numbers the chart does not plot.** `GrowthChart` scales by `max = Math.max(...GROWTH.series.flatMap(s => s.points))` (`:51`), which is **108**; the five axis labels beside it read 1.5K · 1.2K · 900 · 600 · 300 (`clientReports.ts:17`, rendered `:60-64`). So a Total-Clients series running 70→108 is drawn touching the line labelled "1.5K", and the baseline is labelled "300" rather than 0. The x-axis is likewise decorative: seven date labels (`clientReports.ts:18`) are spread with `justify-content: space-between` (`:96`) under **fifteen** plotted points per series (`clientReports.ts:20-22`), so no interior label sits under the point it names.
5. **The ageing donut and its own centre total disagree by Rs 1,000.** The five `AGEING` values sum to 5,41,000 (`clientReports.ts:54-58`) while `AGEING_TOTAL` is Rs 5,42,000 (`:60`) — the same figure as the Outstanding Receivables KPI (`:11`) and the Summary row (`:124`). `Donut` computes each sweep from the slice sum, not from the centre string (`Charts.tsx:93`), so the arcs describe Rs 5,41,000 under a centre reading Rs 5,42,000, and the printed shares (43.4 / 23.6 / 20.3 / 9.0 / 3.7, `:54-58`) are struck against the 542,000 figure — 48,000/542,000 is 8.9%, printed as 9.0%.
6. **The pager is nine dead buttons over a fixed six rows.** `:405-424` renders `« ‹ 1 2 3 4 … 209 ›` with no `onClick` on any of them and no state in the file; `:398` states "Showing 1 to 6 of 1,248 clients", and 1,248 ÷ 6 is 208, not the 209 the last page button claims. `CLIENTS.length` is 6 and is used nowhere in either string.
7. **"View All High Risk →" is a self-declaring stub** (`:482-484`) — an `aria-disabled` `<span>` whose `title` reads "Not built yet — see SCREENS.md for what is done". It sits directly beneath "View All Clients →", a working link (`:453`), with the same styling.
8. **The eye control is a span, not a button.** `:380-387` puts `role="button"` and `onClick` on a `<span>` with no `tabIndex` and no `onKeyDown`, so the only per-row navigation in the Actions column is mouse-only. The `more_vert` glyph beside it (`:388`) has no handler at all.
9. **Four of the five High Risk clients have no row, and one appears nowhere else.** Everest Pictures, Ferry Tale Studios, Nepal Ad Works and Vision Production (`clientReports.ts:138-141`) appear only in `REVENUE_BY_CLIENT` (`:33-36`); Mountain Films (`:142`) appears in no other constant in the file. The card carries no link per row, so a reader cannot reach any of them.
10. **The Status column is a constant.** `:377` renders the literal "Active" in green for every row regardless of data; `ClientRow` has no status field (`clientReports.ts:79-94`).
11. **`FILTERS` is a dead export.** `clientReports.ts:14` exports the eight filter labels the removed dropdown row used. `ClientReports.tsx:9-27` does not import it and no other file imports from `data/clientReports` at all — the module has exactly one consumer.
12. **`Slice.percent` is read defensively for a required field.** `Charts.tsx:33-39` declares `percent: string` (not optional), yet the CSV writes `(s.percent ?? '')` twice (`:146`, `:156`). Harmless, but it pairs with a genuine hazard the file documents at `:142-145`: on `RETENTION`, `display` carries the share and `percent` carries the *count*, so the two CSV blocks head those columns differently ("Share, Clients" at `:145` vs "Amount, Share" at `:155`) and a future reader who trusts the field names will label one of them wrong.
13. **The screen shows nothing the local store could already answer.** `corpus.ts:444-501` synthesises `client_directory_v` with per-client outstanding, deposit held, total paid, active and total booking counts and last pickup — five of the columns this table prints as invented strings — and the page never asks for any of it.
14. **Inherited `TODO(decision)` markers reachable from this page's dependencies:** BS month / quarter / fiscal-year range presets, which is why the shared toolbar can only offer rolling day windows (`ReportToolbar.tsx:75-78`) — inert here, since this page draws no date control at all.
15. **The file's comments cite rulings and a render as authority** — "Rulings §7" (`:176`), "Law 6 / P0-5 (BUG_SWEEP_REGISTER_v1.0)" (`:183-184`), "built from render `D1353039`" (`:169`), and `clientReports.ts:5` says the same. Those are claims about intent; everything recorded above is what the committed code does.
