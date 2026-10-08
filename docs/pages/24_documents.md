# Documents
Route `/documents` and `/finance/documents` · `src/modules/documents/Documents.tsx` · 1466 lines

Status: **Seed-only**

---

## 1. What it is

The document register. Lazily imported at `src/App.tsx:57` and mounted twice as a page — `/documents` inside `Shell` with the crumb "Documents & Registry" (`src/App.tsx:349-356`) and `/finance/documents` with the crumbs "Finance / Tax & Invoices" (`src/App.tsx:435-442`) — plus a third time as Finance's Documents tab, `<Documents embedded />` (`src/modules/finance/Finance.tsx:1041`). One default-exported component `Documents({ embedded = false })` (`Documents.tsx:415`) with six file-local helpers: `isoToDate` (`:101`), `TypeChip` (`:109`), `StatusPill` (`:131`), `DocTile` (`:155`), `ActionIcon` (`:176`), `RowMenu` (`:210`), `PageBtn` (`:322`).

The file imports nothing from `src/actions/`, nothing from `src/lib/queries/`, and nothing from `src/lib/dataAccess`. Every row, count, tab and panel comes from the constant arrays in `src/data/documents.ts`, filtered and sorted in-memory (`Documents.tsx:488-519`). Nothing on the screen writes.

---

## 2. What renders

### Desktop (≥1180), top to bottom

| # | Thing | Where |
|---|---|---|
| 1 | `ScreenHeader` — icon `file`, title "Documents", description "Every rental and finance document in one place…" | `:595-622`; component `src/modules/finance/TabHeader.tsx:40` |
| 1a | Header action — **Upload Document**, `disabled`, wrapped in `Unavailable reason={NOT_BUILT}` | `:602-606` |
| 1b | Header action — **Import**, `disabled`, wrapped in `Unavailable reason={NOT_BUILT}` | `:607-611` |
| 1c | Header action — **Export**, enabled, `onClick={exportCsv}` | `:612-614` |
| 1d | Header action — **Create Document**, primary, `disabled`, wrapped in `Unavailable reason={CREATE_UNAVAILABLE}` | `:615-619`; reason string `:376-377` |
| 2 | `KpiStrip items={kpis} columns={kpis.length}` — five tiles | `:624`; `kpis` memo `:426` |
| 3 | Tab strip: `All Documents` + one tab per category, `aria-current` on the active one, shares the `category` state with the rail | `:628-655` |
| 4 | Three-column grid `auto minmax(0,1fr) auto` | `:660` |
| 4a | **Left rail** — `SideRail width={228} label="Categories"` | `:849`; `SideRail` `src/components/ui/Page.tsx:400` |
| 4a-i | `Card` "Document Categories" — `All Documents` + one button per category, each with a `catColor`-tinted icon and a count | `:665-711` |
| 4a-ii | `Card` "Filters" with a "Clear All" action — Date Range (two `<input type="date">`), Document Type, Status, Related To, Branch, then the line "Filters apply instantly — there is no Apply step." | `:713-843` |
| 4b | **Centre** `Card` with `bodyStyle={{padding:0}}` | `:856` |
| 4b-i | Toolbar: search box (omitted when `embedded`), "Sort by" `<Select>` of `SORTS`, and a `[Table][Cards]` segmented toggle | `:857-938` |
| 4b-ii | Bulk bar, rendered only when `selected.size > 0`: "N selected", **Consolidate** (disabled, own reason), **Download** / **Email** / **Archive** (disabled, `NOT_BUILT`), "Clear selection" | `:941-1002` |
| 4b-iii | Either the `EmptyState`, the card grid, or the table | `:1004`, `:1017`, `:1054` |
| 4b-iv | Table: select-all checkbox, Document Name, Type, Related To, Client / Vendor, Status, Created On, and a sticky-right Actions column | `:1055-1199`; `stickyRight` `:75-80` |
| 4b-v | Pager row: "Showing X to Y of Z documents", `‹ 1 2 … ›`, "Rows per page" `<Select>` of `PER_PAGE` | `:1202-1246` |
| 4c | **Right rail** — `Rail width={300} label="Document summary"` | `:1450`; `Rail` `src/components/ui/Page.tsx:315` |
| 4c-i | `Card` "Document Summary" — `Donut` + `Legend` over `slices`, centre value = `total` | `:1253-1258` |
| 4c-ii | `Card` "Pending Signatures" with a working "View All" that sets category `All` and status `Pending Signature` | `:1260-1317` |
| 4c-iii | `Card` "Missing Documents" — its "View All" is an `Unavailable` span, not a button | `:1319-1366`, action `:1322-1327` |
| 4c-iv | `Card` "Expiring / Due Soon" | `:1371-1383` |
| 4c-v | `Card` "Quick Actions" — a grid of disabled tiles, one enabled "Document Templates" button that selects the Templates category, and a footnote saying storage is unwired | `:1385-1446` |
| 5 | `FooterNote` with three extra lines | `:1457-1463` |

**Table row cells** (`:1094-1194`), in header order: a checkbox; the Document Name cell wrapped in `IntelCard` (`:1105-1123`) showing a `DocTile` glyph, the name and the id; a `TypeChip`; Related To, which is a `<Link>` only when `RELATED_TARGET[kind].route` is non-null and otherwise an `Unavailable` span naming the unbuilt screen (`:1130-1148`); Client / Vendor; Status as a `StatusPill` with the record state on its own line beneath (`:1152-1167`); Created On as a BS line above an AD line (`:1169-1177`); and the sticky action cell holding three permanently disabled `ActionIcon`s — View, Download, Send — plus `RowMenu` (`:1179-1193`).

**`RowMenu`** (`:210-304`) is a `⋮` button opening a `role="menu"`. The first entry is "Open &lt;relatedTo&gt;", a real `<Link>` when the target route exists and an `aria-disabled` span otherwise (`:257-277`). Below a divider, all seven `ROW_MENU` entries — Download, Print, Email, WhatsApp, Share Link, Duplicate, Archive — render as `aria-disabled` spans with `title={NOT_BUILT}` and a close glyph (`:281-294`). There is no Delete anywhere; the menu closes with a paragraph saying so (`:297-299`). The menu flips upward when there is no room below (`useMenuFlip`, `src/lib/menuFlip.ts:25`, height constant `:208`).

**Hover intel.** Each Document Name cell wraps its content in `IntelCard` (`:1105`), whose glance and detail groups are built once per visible row in a memo (`:536-539`) from `documentGlance` / `documentDetailGroups` (`src/data/documentIntel.ts:59`, `:87`). It opens on hover where hover exists and on a 500 ms long-press where it does not (`src/components/ui/IntelCard.tsx:97`, `:117-124`).

### Responsive bands the file actually reads

`Documents.tsx:450` calls `useViewport()` from `src/lib/device.ts:57`, whose thresholds are `BREAKPOINT = { phone: 768, desktop: 1180 }` (`device.ts:43`). **Both 768 and 1180 are read.** What changes:

- **desktop (≥1180)** — `desktop` is true (`:451`), so the grid is three tracks (`:660`), the category/filter column renders as `SideRail` (`:849`) and the summary column as `Rail` (`:1450`). In Cards mode the grid is `repeat(auto-fill, minmax(238px, 1fr))` (`:1022`).
- **tablet (768–1179)** — `desktop` is false: the grid collapses to one track (`:660`), the left rail becomes a plain `<div style={{order: 2}}>` and the right rail `order: 3` (`:851`, `:1452`), so the list sits first and both rails reflow beneath it rather than hiding. The `[Table][Cards]` toggle still decides; in Cards mode the grid is `repeat(3, minmax(0,1fr))` (`:1022`).
- **phone (<768)** — everything above, plus `cardView` is forced true regardless of the toggle (`:453`), and the card grid is `repeat(2, minmax(0,1fr))` (`:1022`). The toggle's pressed state reads `cardView`, not `cards`, so it reports what is actually drawn (`:910`), and its buttons are 44×44 (`:921-922`).
- The table itself is not width-branched: it always renders at `minWidth: 820` inside an `overflowX: 'auto'` wrapper (`:1055-1056`), so at tablet width in Table mode it scrolls sideways with the Actions column pinned right (`:1085`, `:1180`).
- One shared component reads the same breakpoints: `KpiStrip` clamps to 2 columns at phone and 3 at tablet (`src/components/ui/Page.tsx:210-212`).

`embedded` is **not** a responsive branch (`TabHeader.tsx:33-38`). It demotes the `<h1>` to a subtitle row keeping the four actions (`TabHeader.tsx:53-70`) and drops the toolbar search box (`:873-889`), because the Shell already renders one for `/finance`.

---

## 3. Data sources

| Screen area | Kind | Detail |
|---|---|---|
| KPI tile 1 "Total Documents" | SEED | `totalDocuments(money)` summing `CATEGORIES[].count` — `src/data/documents.ts:287-289`, `:45-54`. 1,248 with finance, 936 without |
| KPI tiles 2–5 | SEED | String literals `'132'`, `'18'`, `'24'`, `'16'` in `kpisFor` — `src/data/documents.ts:325-335` |
| Tab strip + rail category list + counts | SEED | `CATEGORIES` via `categoriesFor(money)` — `src/data/documents.ts:45-54`, `:283-285` |
| Document table / card rows | SEED | `DOCUMENTS` (27 rows) via `documentsFor(money)` — `src/data/documents.ts:204-246`, `:279-281` |
| Document Type filter options | SEED | `new Set(allDocs.map(d => d.type))` — `Documents.tsx:459-462` |
| Status filter options | SEED | `DOC_STATUSES` — `src/data/documents.ts:80-88` |
| Related To filter options | SEED | derived from `allDocs`, labelled by `RELATED_TARGET` — `Documents.tsx:464-467`, `src/data/documents.ts:112-119` |
| Branch filter options | SEED | `BRANCHES` — `src/data/documents.ts:259` |
| Rows-per-page options | SEED | `PER_PAGE` — `src/data/documents.ts:268` |
| Hover intel card (glance + 5–6 detail groups) | SEED | `documentGlance` / `documentDetailGroups` over the same `DocRow` — `src/data/documentIntel.ts:59`, `:87` |
| Document Summary donut + legend | SEED | `summarySlices(categories)` over `CATEGORIES[].count` — `src/data/documents.ts:294-302` |
| Pending Signatures list | SEED | in-memory filter of `DOCUMENTS` for `status === 'Pending Signature'` — `Documents.tsx:1286-1288`. Its footnote is the literal `PENDING_SIGNATURE_TOTAL = 18` — `src/data/documents.ts:342` |
| Missing Documents list | SEED | `MISSING` via `missingFor(money)` — `src/data/documents.ts:353-358`, `:360-362`. Footnote is the literal `MISSING_TOTAL = 16` — `:343` |
| Expiring / Due Soon list | SEED | `EXPIRING` via `expiringFor(money)` — `src/data/documents.ts:377-383`, `:385-387` |
| Quick Action tiles | SEED | `QUICK_ACTIONS` via `quickActionsFor(money)` — `src/data/documents.ts:398-403`, `:405-407` |
| Row menu entries | SEED | `ROW_MENU` — `src/data/documents.ts:410-418` |
| BS / AD date pair in the Created On cell | computed | `toBs` / `formatBs` / `formatAd` over the row's own `createdAd` — `src/lib/bs.ts:93`, `:102`, `:114` |
| Export CSV file | SEED | built client-side from the filtered `rows` array — `Documents.tsx:542-557` |
| — | DB | **none.** The file contains no query import, no `useList`, no `dataAccess` call |
| — | LOCAL | **none.** `buildStore()` serves 17 keys plus the `UNSERVED` stubs (`src/lib/mock/corpus.ts:405-426`) and has no documents key. The schema's real table is `document_registry` (`supabase/migrations/0009_crew_vehicles.sql:193-217`), with `document_deliveries` beside it (`:247`); neither is in the corpus, so both are **UNSERVED**, and this page reads neither |

Invented on this page: every figure — the eight category counts (542 / 312 / 126 / 88 / 54 / 72 / 36 / 18) and therefore the 1,248 total, the donut and its percentages, the four literal KPI values 132 / 18 / 24 / 16, the 27 document rows with their ids, parties, branches, dates and record states, the "18 documents pending signature" and "16 missing in active rentals" footnotes, the "412 documents pinned" / "268 documents pinned" template lines, and the three Expiring entries.

---

## 4. Actions and writes

**The page dispatches nothing.** There is no import from `src/actions/` anywhere in `Documents.tsx` (imports are `:1-48`), so no capability string is ever checked for this screen and `checkCapability` (`src/actions/core.ts:124`) is never reached from here.

Every write-shaped control:

| Control | Where | State |
|---|---|---|
| Upload Document (header) | `:602-606` | renders `disabled` inside `Unavailable`, no `onClick`, dispatches nothing |
| Import (header) | `:607-611` | renders `disabled` inside `Unavailable`, no `onClick`, dispatches nothing |
| Create Document (header, primary) | `:615-619` | renders `disabled` inside `Unavailable`, no `onClick`, dispatches nothing |
| Consolidate (bulk bar) | `:975-979` | renders `disabled` inside `Unavailable`, no `onClick`, dispatches nothing |
| Download / Email / Archive (bulk bar) | `:980-984` | render `disabled` inside `Unavailable`, no `onClick`, dispatch nothing |
| View / Download / Send (row action icons) | `:1184-1186`; `ActionIcon` `:176-198` | `<button disabled>` by construction — the component has no `onClick` prop at all |
| Row menu: Download, Print, Email, WhatsApp, Share Link, Duplicate, Archive | `:281-294` | rendered as `aria-disabled` `<span>`s, not buttons; no handler |
| Quick Action tiles (Create Quote / Invoice / Receipt, Upload Document) | `:1388-1413` | `<button disabled>`, no `onClick` |
| Missing Documents "View All" | `:1322-1327` | an `Unavailable` span wrapping text; no handler |

Controls that do work, all local-only: **Export** builds and downloads a CSV blob from the filtered rows (`:612`, `:542-557`); **Document Templates** selects the Templates category (`:1418-1420`); Pending Signatures **View All** sets the category and status filters (`:1263-1269`); **Clear All** resets the filters (`:716-733`, `:471-480`); the tabs, rail categories, search, five filter fields, sort header buttons, view toggle, row checkboxes, select-all, "Clear selection", pager and rows-per-page are all `useState` mutations.

Buttons with no handler at all: the nine disabled `Button`s and tiles listed above, plus the three `ActionIcon`s and the seven row-menu spans — 19 controls, none of which is wired.

**The related action that exists but is unused.** `src/actions/documents/createDocument.ts:11-13` declares `name: 'CREATE_DOCUMENT'`, `permissions: ['document.create']`, and **no `implemented` field**, so it defaults to `false` and the dispatcher throws `ActionNotImplementedError` before validate (`core.ts:222-224`). Its `execute` only mints an id and `console.log`s `[DB TX] Created document …` (`createDocument.ts:21-22`) — it writes nothing. `document.create` **is** mapped in `checkCapability`, to `rbac.canWriteBookingDesk` (`core.ts:193-195`, `src/lib/rbac.ts:71-77`), so the capability is not the blocker; the missing body is. This page never imports it — the header comment at `Documents.tsx:348-374` records that it used to.

---

## 5. Gates

**Route reach.** Both page routes sit inside `Shell`, which redirects to `/login` when there is no session (`src/App.tsx:973-975`). The only role gate in `Shell` is `!canViewMoney(user.role) && isMoneySurface(pathname)` (`src/App.tsx:993`).

- `/documents` is **not** in `MONEY_ROUTES` (`src/data/nav.ts:147-153`), so every authenticated role reaches it — Owner, Admin, Manager, Coordinator, Accounts, and the money-blind Warehouse, Technician, Driver, Client. There is no `isStaff` check on this route, so an external Client role is not blocked from it either.
- `/finance/documents` is caught by the `/finance` prefix (`nav.ts:156-159`), so the four money-blind roles get `RestrictedState` instead of the page (`src/App.tsx:1020-1023`). The same applies to the embedded mount at `/finance` (`Finance.tsx:1041`).

**Money visibility.** The page does **not** use `useCanViewMoney()`. It calls `canViewMoney(role)` directly off the session (`Documents.tsx:415-418`), with `role` falling back to `'Client'` when there is no user. That is the same rule the hook wraps (`src/lib/moneyVisibility.ts:24-27`), so the answer is identical: `MONEY_BLIND = {Warehouse, Technician, Driver, Client}` (`src/lib/rbac.ts:45-50`).

**What Law 6 hides.** Not masked — removed from the arrays before render:

- every `finance: true` row, so the two Tax Invoices, the Credit Note, the Receipt, the Quotation, the `INV · v2` template and the archived `INV-140` never enter `allDocs` (`src/data/documents.ts:279-281`);
- the Finance category, so the Finance tab, the Finance rail entry and the Finance donut slice do not exist (`:283-285`), and the "Total Documents" KPI drops from 1,248 to 936 (`:287-289`);
- the Tax Invoice row in Missing Documents (`:360-362`);
- the Quotation Q-88 row in Expiring / Due Soon (`:385-387`);
- three of the four Quick Action tiles — Create Quote, Create Invoice, Create Receipt (`:405-407`).

**Field-level defence in depth.** `gateContext(role)` is memoized at `Documents.tsx:422` and passed to the intel builders. Inside them, the "Finance document" badge and the "Finance document: Yes" detail field are additionally gated on `canViewMoneyField(gctx, 'booking')` (`src/data/documentIntel.ts:69`, `:131`, rule at `src/lib/fieldGating.ts:67-72`). No money **amount** exists anywhere on `DocRow` (`src/data/documents.ts:121-190`), so there is no figure for a field gate to strip.

---

## 6. States drawn

`PageBody` is **not** imported. The four states are hand-rolled or absent:

- **Loading — none.** Every source is a synchronous module constant; there is no async boundary in the file, so no skeleton is ever needed or drawn.
- **Error — none.** No fetch, no `try`/`catch`, no `ErrorBanner`.
- **Empty — yes, hand-rolled.** `EmptyState` from `src/components/ui/StateViews.tsx:34` is rendered directly at `Documents.tsx:1004-1016` when `visible.length === 0`, with a description that names the selected category and an action that is "Clear All filters" when filters are dirty and "Back to All Documents" when they are not.
- **Restricted — none on the page.** It is drawn one level up: `Shell` renders `RestrictedState` (`StateViews.tsx:213`) for a money-blind role at `/finance/documents` or `/finance` (`src/App.tsx:1020-1023`). At `/documents` no role is ever refused, so the page itself never draws it.

---

## 7. Known gaps

**TODO(decision) markers**

- `Documents.tsx:371-374` — the create flow: which document types an operator may raise by hand, what each needs beyond a title, and which record it attaches to.
- `Documents.tsx:970` and the user-visible reason string at `:975` — whether Consolidate produces a new registered document (with its own type, number and terminal action) or a one-off unstored download.
- `src/data/documents.ts:148-159` — `recordState` is free text, and three of its values are not members of the real vocabularies: `Invoice: Unpaid` and `Invoice: Adjusted` are not in `InvoiceStatus`, `Payment: Cleared` is not in `PaymentStatus`, `Job: Scheduled` has no vocabulary at all.
- `src/data/documents.ts:195-202` — document numbering is unruled; `RA-2026-0715` etc. still borrow the old booking counter, which no longer matches booking `B-715`.

**Stubs and dead controls**

- 19 controls render with no handler — see the table in section 4. Nine of them are `disabled` `Button`s inside `Unavailable`; the rest are `disabled` `<button>`s or `aria-disabled` `<span>`s.
- `src/actions/documents/createDocument.ts` has no `implemented: true` and an `execute` that only `console.log`s (`:21-22`). Nothing on this page calls it.
- Five of the six `RELATED_TARGET` kinds have `route: null` (`src/data/documents.ts:112-119`), so Payment, Case, Maintenance job and Template rows show their id as inert text with a reason, both in the table cell (`:1142-1146`) and in the row menu's first entry (`:266-276`).

**Link targets that do not resolve**

- The archived row `RA-2026-0702` links to `/rentals/B-702` (`src/data/documents.ts:245`), and the Missing Documents panel links to `/rentals/B-722` (`src/data/documents.ts:354-356`, rendered `Documents.tsx:1338-1340`). Neither booking number exists in `src/data/rentals.ts`, whose seeded set is B-709 … B-716.
- `BookingDetail` serves one seeded booking and takes only the identity from the URL, flagging anything else via `isSeeded` (`src/modules/rentals/BookingDetail.tsx:688-691`). So every Related To link except `B-715` opens a non-seeded view.
- The two equipment rows link to `/inventory/EQ-RED-0004` and `/inventory/SN-AP6-0204` (`src/data/documents.ts:235-236`). Neither code appears anywhere else under `src/data/`, and `AssetDetail` renders "Equipment not found" for an unmatched id (`src/modules/inventory/AssetDetail.tsx:165`, `:178-179`).

**Contradictions and inconsistencies**

- **The counts do not describe the table.** The rail, the tabs, the donut centre and the "Total Documents" KPI all report installation totals summing to 1,248 (`Documents.tsx:431`, `:666`, `:1255`; `src/data/documents.ts:45-54`) while the table holds 27 rows. The `FooterNote` states this (`:1461`), but the pager's own "Showing 1 to 10 of N documents" line (`:1214-1218`) counts the seeded rows, so two different totals sit on one screen.
- **The four literal KPIs ignore the money gate.** `kpisFor` role-adjusts only the first tile; "This Month Created 132", "Pending Signatures 18", "Expiring / Due Soon 24" and "Missing Documents 16" are the same strings for every role (`src/data/documents.ts:325-335`). A Warehouse session therefore sees the Missing panel filtered down to three rows under a footnote that still reads 16 (`Documents.tsx:1362-1364`, `MISSING_TOTAL` `src/data/documents.ts:343`), and the same mismatch on Pending Signatures (`:1312-1315`).
- **The Pending Signatures panel and its own KPI disagree in kind.** The panel lists rows derived from the seed (three of them, `Documents.tsx:1286-1288`); the KPI beside it and the footnote below it are the constant 18.
- **`/finance/documents` is crumbed "Finance / Tax & Invoices"** (`src/App.tsx:438`) but renders the full Documents register titled "Documents" with all eight categories, because it is mounted with no `embedded` prop and therefore `embedded === false` (`Documents.tsx:415`) — the same component and the same unfiltered data as `/documents`.
- **The branch filter always lets "All Branches" rows through.** `d.branch !== ALL_BRANCHES` is the third clause of the branch test (`Documents.tsx:505`), so the two Template rows appear under every branch selection. Unremarked in the file.
- **Sorting does not reset the page.** Every filter setter calls `setPage(1)`, but the sort `<Select>` (`:895`) and the sort header buttons (`:573`) do not; the clamp at `:522` keeps the page in range but the reader stays on page N of a re-ordered list.
- **`Recycle Bin` is deliberately absent.** The ninth render tab is Archived, in the same slot with the same count, and the row menu offers Archive with no Delete (`src/data/documents.ts:56-64`, `Documents.tsx:296-299`). Recorded here because it is a knowing divergence from the approved render, not an omission.
