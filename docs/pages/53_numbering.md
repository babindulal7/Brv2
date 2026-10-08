# Numbering Sequences

Route `/admin/numbering` · `src/modules/admin/NumberingSequences.tsx` · 1671 lines
Mounted at `src/App.tsx:669-676` inside `<Shell crumbs={[{ label: 'Settings' }, { label: 'Numbering Sequences' }]}>`.
`/tools/numbering` redirects here (`src/App.tsx:134`). Listed as built at `src/App.tsx:757`.

Status: **Seed-only**

---

## 1. What it is

A read-only registry screen for the app's identifier sequences. It lists 20 sequence rows
(`src/data/numbering.ts:132-220`), lets the operator load one into a local **draft**
(`src/modules/admin/NumberingSequences.tsx:396`, `407-413`), and re-renders a preview of the ID
that draft would produce (`src/modules/admin/NumberingSequences.tsx:446-475`).
Every control that would persist a change is a disabled `Unavailable` button
(`src/modules/admin/NumberingSequences.tsx:533-557`, `1347-1351`); the file imports nothing from
`src/actions/` and dispatches nothing.

---

## 2. What renders

Top to bottom at desktop:

| # | Section | Evidence |
|---|---------|----------|
| 1 | Seed-error alert (`role="alert"`, red border), rendered only when `SEED_ERRORS.length > 0` | `NumberingSequences.tsx:516-525` |
| 2 | `PageHeader` "Numbering Sequences" with five action buttons — Add Sequence, Import, Export, Reset Counter, Refresh — all `disabled`, each wrapped in `Unavailable` | `NumberingSequences.tsx:527-560` |
| 3 | Two-column grid: main column + right `Rail` | `NumberingSequences.tsx:562` |
| 4 | `KpiStrip` with 6 KPIs (`columns={6}`) | `NumberingSequences.tsx:564`; items at `data/numbering.ts:591-610` |
| 5 | `SideRail width={210}` "Categories" → Card "Sequence Categories", 6 filter buttons with per-module counts | `NumberingSequences.tsx:567-607`; rows at `data/numbering.ts:633-640` |
| 6 | Card "All Sequences": module `Select`, status `Select`, search `Input` in the card action slot | `NumberingSequences.tsx:609-657` |
| 7 | 11-column table (`minWidth: 980`, `overflowX: 'auto'`) — Code, Sequence Name, Prefix, Format, Padding, Current Counter, Preview, Reset Rule, Scope, Status, Actions | `NumberingSequences.tsx:693-857`; header array at `:706` |
| 8 | Pager row: "Showing X to Y of Z sequences", Rows-per-page `Select`, numbered `PageBtn`s | `NumberingSequences.tsx:860-902` |
| 9 | Footnote naming the unconfigured codes, when `UNCONFIGURED_CODES.length > 0` | `NumberingSequences.tsx:904-910` |
| 10 | Card "Sequence Preview Generator": Select Sequence / Branch / Warehouse, labelled segment chips, Live Preview block (`aria-live="polite"`), four figures (Next Number · Current Counter · Padding Length · Total Length), "Test Next 5 Numbers" button, optional `<ol>` of 5 numbers | `NumberingSequences.tsx:915-1102` |
| 11 | Card "Sequence Configuration": 5 tabs (General · Format · Reset Rules · Scope · Advanced), a Status switch, Cancel, and a disabled Save Changes | `NumberingSequences.tsx:1104-1357`; tabs at `data/numbering.ts:549` |
| 12 | Card "Sequence Analytics" — 5 columns: Records Generated + `TrendLine`, Daily Generation Trend bars, Top Sequences by Usage, Reset History, Branch-wise Generation `Donut`+`Legend` | `NumberingSequences.tsx:1360-1478` |
| 13 | Right `Rail`: Sequence Summary (+period `Select`), Alerts, Quick Actions (4 tiles), Recent Activity | `NumberingSequences.tsx:1481-1660` |
| 14 | `FooterNote` with two extra lines | `NumberingSequences.tsx:1663-1668` |

The render's "AI Numbering Insights" card is deleted, with the reasoning left in a comment block at
`NumberingSequences.tsx:1640-1659`.

**Responsive bands the file itself reads.** It calls `useViewport()` once
(`NumberingSequences.tsx:388`) and branches on it once — `viewport === 'phone'`
(`NumberingSequences.tsx:664`), which is the **768** band (`src/lib/device.ts:43,45-51`). Below 768
the table is replaced by one `SequenceCard` per row: name + code + status chip, a 3-up Prefix /
Padding / Current grid, a preview block, and a 44px-min "Configure" button
(`NumberingSequences.tsx:270-372`, rendered at `:664-691`).

**The file never reads 1180 itself.** It hardcodes its rail grid as
`gridTemplateColumns: 'minmax(0,1fr) auto'` (`NumberingSequences.tsx:562`) instead of calling
`useRailGridColumns()` (`src/components/ui/Page.tsx:382-384`), and it renders `Rail`
(`NumberingSequences.tsx:1481`) rather than `ReflowRail` (`src/components/ui/Page.tsx:349-371`).
The 1180 band therefore reaches this page only indirectly, through shared components:
`Rail`/`SideRail` wrap `CollapsibleAside`, which defaults to collapsed at **phone and tablet**
(`src/components/ui/CollapsibleAside.tsx:29,37`), and `KpiStrip` clamps 6 columns to 2 at phone and
3 at tablet (`src/components/ui/Page.tsx:210-212`).

---

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Sequence table rows (all 11 columns) | SEED | `SEQUENCES`, 20 objects in `src/data/numbering.ts:132-220` |
| Preview column + card preview | SEED | `previewOf()` → `issue()` over `SEQUENCES` (`NumberingSequences.tsx:498-507`; `data/numbering.ts:417-431`), dated to `PREVIEW_YEAR/MONTH/DAY` = `2026`/`05`/`18` (`data/numbering.ts:525-527`) |
| 6 KPIs | SEED | `KPIS`, `data/numbering.ts:591-610`. Four are *derived* from `SEQUENCES` (Active Sequences = 20, Duplicate IDs = 0, Auto Reset Rules = 6, Last Sequence Used = `B-4861`); `Records Generated Today` `'486'`, its delta `'18% vs yesterday'`, `LAST_GENERATED_AGO` `'2 mins ago'` and `HEALTH_SCORE` `'100%'` are literals at `data/numbering.ts:584-589` |
| Categories rail counts | SEED | `countFor()` over `SEQUENCES` (`data/numbering.ts:642-644`) |
| Branch dropdown | SEED | `BRANCHES` (`data/numbering.ts:536-541`) — KTM/PKR marked `confirmed: true`, BTL/BRT `confirmed: false` and labelled "code unconfirmed" in the option text (`NumberingSequences.tsx:939`) |
| Warehouse dropdown | SEED | `WAREHOUSES`, a single `MAIN` row (`data/numbering.ts:545`) |
| Format-token help list | SEED | `FORMAT_TOKENS` (`data/numbering.ts:252-261`) |
| Reset rules / scopes / statuses / per-page / config tabs | SEED | `data/numbering.ts:88-96, 102, 105, 549, 552` |
| Analytics — trend polyline, daily bars, top sequences, reset history, branch donut | SEED | `ANALYTICS` (`data/numbering.ts:651-702`). The comment at `:656` states the 11 trend points are "read off the render's polyline. Relative shape only" |
| Rail — Sequence Summary | SEED | `SUMMARY` (`data/numbering.ts:708-714`); `ARCHIVED_COUNT '3'`, `RECORDS_THIS_MONTH '12,856'`, `HEALTH_SCORE '100%'` literals at `:588-589` |
| Rail — Alerts | SEED | `ALERTS` (`data/numbering.ts:721-727`); three of five counts are the literal `'0'` |
| Rail — Quick Actions | SEED | `QUICK_ACTIONS` (`data/numbering.ts:729-734`) |
| Rail — Recent Activity | SEED | `ACTIVITY`, four hand-written entries (`data/numbering.ts:739-744`) |
| Seed-error banner | SEED (computed) | `SEED_ERRORS`, an IIFE over `SEQUENCES` at `data/numbering.ts:758-807` |

**DB: none.** The file imports no query module and issues no request — its only non-UI imports are
`../../data/numbering`, `../../lib/device` and `../../lib/status`
(`NumberingSequences.tsx:1-47`). A real `number_sequences` table exists
(`supabase/migrations/0007_admin_security.sql:349-357`, RLS at
`supabase/migrations/0033_fleet_bundle_and_sequence_policies.sql:46-55`) with an atomic
`next_document_number()` function (`supabase/migrations/0007_admin_security.sql:359+`), and this page
touches neither.

**LOCAL: none.** `number_sequences` does not appear anywhere in `src/lib/mock/corpus.ts`, and it is
not in that file's `UNSERVED` list either (`src/lib/mock/corpus.ts:33-44`) — so it is unserved *and*
undeclared, meaning the mock banner never mentions it.

Invented on this page: Records Generated Today (486), its 18%-vs-yesterday delta, "2 mins ago",
Sequence Health 100%, Archived Sequences 3, Records Generated 12,856, "Avg. 1,836/day", the 7 daily
bar heights and 11 trend points, all five Top-Sequences figures (5,812 / 3,246 / 1,256 / 1,102 /
682), the reset-history total 17 and its five dated rows, all four branch-mix figures (7,421 /
3,213 / 1,542 / 680), the four Recent Activity entries, every stored counter in `SEQUENCES`
(4861, 492, 2481, 000824, 00054, 0182, 006103, 00276, 00153, 00092, 88, 23, 14) and the two
unconfirmed branch codes BTL/BRT.

---

## 4. Actions and writes

**No dispatches.** The file contains no import from `src/actions/`, no `createAction` call and no
handler that reaches the dispatcher — so no capability string is involved and `checkCapability`
(`src/actions/core.ts:124-218`) is never consulted from this page. `src/actions/core.ts:220-254`
would refuse anything this page tried anyway: `implemented` defaults to `false`
(`src/actions/core.ts:88-89`, checked at `:223`).

Controls that change only React state (no persistence):

| Control | Handler | File:line |
|---|---|---|
| Category buttons (×6) | `setModule` → `setModuleFilter` + `setPage(1)` | `:572-575`, `:434-437` |
| Module / Status selects, search box | `setModule` / `setStatusFilter` / `setQuery` | `:614-655` |
| Row "Configure" icon | `select(code)` — sets `selectedCode`, rebuilds `draft`, zeroes `testCount` | `:790-792`, `:407-413` |
| Phone card "Configure" | same `select(code)` | `:346-369`, `:672` |
| EmptyState "Clear filters" (table and card list) | resets all four filter states | `:681-687`, `:845-850` |
| Pager `PageBtn`s, Rows-per-page | `setPage` / `setPerPage` | `:879-901` |
| Select Sequence / Branch / Warehouse | `select` / `setBranchCode` / `setWarehouseCode` | `:919`, `:933`, `:950` |
| "Test Next 5 Numbers" | `setTestCount(testCount > 0 ? 0 : 5)` | `:1068-1070` |
| Config tabs (×5) | `setTab` | `:1112` |
| General/Format/Reset/Scope fields | `setDraft({...})` — draft only | `:1140`, `:1146`, `:1152`, `:1162`, `:1169`, `:1179`, `:1193`, `:1200`, `:1217`, `:1256`, `:1284` |
| Status switch (`role="switch"`) | `setDraft({ ...draft, active: !draft.active })` | `:1315-1340` |
| Cancel | `select(selected.code)` — re-derives the draft from the seed row | `:1346` |
| Summary period select | `setPeriod` | `:1488` |
| Quick Action "Test Sequence" | `setTestCount(5)` + `previewRef.current?.scrollIntoView` | `:1562-1565` |

Disabled controls, each wrapped in `Unavailable` (`src/components/ui/Unavailable.tsx:35-164`, which
supplies a `title` on hover devices and a 500ms long-press popover otherwise):

- Add Sequence `:533-537` · Import `:538-542` · Export `:543-547` · Reset Counter `:548-552` ·
  Refresh `:553-557`
- Row overflow menu (`more_vert`), every row `:810-831`
- **Save Changes** `:1347-1351`, reason `WHY_READ_ONLY` at `:137`
- Quick Actions "Add Sequence", "Reset Counter", "Export Config" — `disabled={!live}` where `live`
  is only true for "Test Sequence" `:1548`, `:1558`

Inert text styled as links — `<span>` with `aria-disabled` and a `title`, no `onClick`, no anchor:
"View all" (Reset History) `:1447-1449`; "View Full Report →" `:1504-1506`; "View All →" (Alerts)
`:1513-1515`; "View All →" (Recent Activity) `:1607-1609`.

---

## 5. Gates

**Route reach.** `Shell` requires a session and redirects to `/login` otherwise
(`src/App.tsx:973-975`). It then computes
`const isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`src/App.tsx:993`).
`MONEY_ROUTES` includes `'/admin'` (`src/data/nav.ts:150`) and `isMoneySurface` matches
`base === r || base.startsWith(r + '/')` (`src/data/nav.ts:156-159`), so `/admin/numbering` **is** a
money surface. `canViewMoney` is `!MONEY_BLIND.has(role)` over
`{Warehouse, Technician, Driver, Client}` (`src/lib/rbac.ts:36-50`).

- Reach the page: Owner, Admin, Manager, Coordinator, Accounts.
- Blocked with `RestrictedState`: Warehouse, Technician, Driver, Client (`src/App.tsx:1020-1023`).

**Money visibility.** The page never calls `useCanViewMoney()`
(`src/lib/moneyVisibility.ts:24-27`) — the string does not appear in the file. Nothing on the screen
is a currency figure: the analytics counts are record counts, not rupees. So **Law 6 hides nothing
here at page level**; the whole screen is withheld or shown by the route guard above.

`canManageSettings` is `role === 'Owner'` (`src/lib/rbac.ts:360-362`) and is **not** consulted by
this page or its route, so a Coordinator or Accounts session sees the full editable draft panel.
Since no control writes, that grants no capability today.

---

## 6. States drawn

`PageBody` (`src/components/ui/PageBody.tsx:119`) is **not** used by this file.

| State | Present? | How |
|---|---|---|
| Loading | none in the page. The `Shell`'s `<Suspense fallback={<LoadingSkeleton type="card" label="Loading…" />}>` wraps it (`src/App.tsx:1026`), but there is no async read here for it to cover. |
| Error | hand-rolled. `role="alert"` card driven by `SEED_ERRORS` (`NumberingSequences.tsx:516-525`). With the current seed this array is empty, so the banner never renders. Two in-panel `StatedGap` notices also exist: the no-format preview (`:964-967`) and the empty Advanced tab (`:1304-1307`). |
| Empty | `EmptyState` from `StateViews.tsx:34-41`, rendered twice — phone card list `:677-688` and table `colSpan={11}` row `:840-851`. Only reachable by filtering; the seed is never empty. |
| Restricted | not in this file. Supplied by `Shell` via `RestrictedState` (`src/App.tsx:1022`, `src/components/ui/StateViews.tsx:213`). |

---

## 7. Known gaps

1. **The route is money-gated, against its own nav ruling.** `src/data/nav.ts:143-145` states in
   prose that putting `/tools` in `MONEY_ROUTES` "would hide Audit Log, Activity Log, **Numbering**
   and Backup & Restore from the floor, which no spec asks for" — but `/admin` is in that same list
   at `src/data/nav.ts:150`, and this page lives at `/admin/numbering`
   (`src/App.tsx:670`). Warehouse, Technician and Driver therefore get `RestrictedState`
   (`src/App.tsx:993`, `:1022`) on the exact screen that comment says must stay reachable. The page
   shows no money at all (§5).
2. **Redirect direction contradicts the nav comment.** `src/data/nav.ts:137` says "`/admin/*` now
   redirects into `/tools/*`". `src/App.tsx:134` does the reverse: `/tools/numbering` →
   `/admin/numbering`.
3. **The DB disagrees with the screen that calls itself the source of truth.** The header at
   `NumberingSequences.tsx:61-71` claims "Settings ▸ Numbering is the source of truth" for prefixes.
   `supabase/migrations/0012_seed_data.sql:20-30` seeds `number_sequences` with
   `('booking','BK-',…,padding 4)` and `('client','CL-',…,padding 4)`, while
   `src/data/numbering.ts:137,153` carry prefix `B` / `C` with padding 1 (`B-N`, `C-N`). The page
   neither reads nor writes that table, so the two never reconcile.
4. **Equipment format contradicts a live CHECK constraint**, recorded but left standing:
   `data/numbering.ts:244-246` — "numbering.ts says `EQ-CAT-NNNNNN`, the database CHECK says
   `^EQ[0-9]{6}$`".
5. **Two rail cards disagree on screen.** "Archived Sequences 3" comes from the literal
   `ARCHIVED_COUNT = '3'` (`data/numbering.ts:588`, rendered `:710`), while the Alerts card three
   rows below computes "Disabled Sequences" as `SEQUENCES.length - ACTIVE.length`
   (`data/numbering.ts:725`) = **0**, because every one of the 20 rows is `status: 'Active'`.
6. **`Starting Number` is a dead field.** `draft.startingNumber` is set at
   `NumberingSequences.tsx:239`, edited at `:1176-1181`, and read nowhere else — the preview uses
   `selected.counter` (`:442-443`, `:460-475`). Typing in it changes nothing on screen.
7. **`Padding Length` silently ignores input for a format with no `N` run.** `withPadding`
   (`NumberingSequences.tsx:256-262`) only rewrites parts matching `/^N+$/`. The input is enabled
   whenever `draft.format` is non-empty (`:1190`), so after editing Format to e.g. `ABC` in the
   Format tab the field accepts keystrokes and nothing happens. No seeded row is in that state.
8. **The Summary period select filters nothing.** `period` (`:401`, `:1485-1496`) is read at exactly
   one place — a caption above Top Sequences (`:1424`). `SummaryRows rows={SUMMARY}` (`:1499`) and
   `ANALYTICS.topSequences` (`data/numbering.ts:672-678`) are constants; the figures do not move.
9. **`TODO(decision)` markers**, both in the data module, none in the component:
   `src/data/numbering.ts:54` — the seeded counters run far ahead of the highest ID any module
   actually carries (BK 4861 vs `B-753`, CL 2481 vs `C-45`, …), and
   `src/data/numbering.ts:532-535` — Butwal and Bharatpur have no branch code anywhere; `BTL`/`BRT`
   are the file's own guess and need a ruling before a record is issued against them. Both surface
   in the UI: the guessed codes are offered in the Branch select and labelled "code unconfirmed"
   (`NumberingSequences.tsx:939`).
10. **Stale count in the seed's own comments.** `src/data/numbering.ts:47` and `:178-179` both say
    the app "now carries nineteen" sequences; the array holds **20** (`DEP` added at `:211` after
    those comments were written). Nothing renders wrong — every count is derived at
    `:557-644` — but the prose is off by one.
11. **`INSIGHTS` is a dead export.** `src/data/numbering.ts:746-752` is imported by nothing; the
    component deliberately omits it and says why at `NumberingSequences.tsx:36` and `:1640-1659`.
12. **Nine dead or inert controls** — five header buttons, the per-row overflow menu, Save Changes,
    three Quick Action tiles and four link-styled spans. All enumerated with lines in §4. None is a
    silent no-op: each carries a stated reason via `Unavailable` or a `title`.
13. **The rail uses the hide-not-reflow shape.** `Page.tsx:335-341` records the binding rule —
    "'Right rails collapse below 1180' means **reflow**, not **hide**" — and supplies `ReflowRail`
    plus `useRailGridColumns()` for it. This page uses plain `Rail`
    (`NumberingSequences.tsx:1481`) and a hardcoded `'minmax(0,1fr) auto'` grid (`:562`), so on a
    tablet the Summary / Alerts / Quick Actions / Recent Activity cards sit behind a collapse handle
    (`src/components/ui/CollapsibleAside.tsx:37`).
14. **`number_sequences` is unserved and undeclared.** It is absent from `src/lib/mock/corpus.ts`
    entirely and absent from that file's `UNSERVED` array (`:33-44`), whose stated purpose is that
    unfillable tables are "surfaced to the user" in the mock banner (`:22-25`). Nothing surfaces it.
15. **A wrong prefix here now propagates into real action code.** `issue`/`prefixOf` from this
    file's data module are imported by `src/actions/documents/createDocument.ts:3`,
    `src/actions/inventory/createBundle.ts:4`, `src/actions/inventory/createEquipment.ts:3`,
    `src/actions/subrentals/createSubRental.ts:3` and `src/lib/seed.ts:67` — so the seed constants
    documented above are not display-only, even though this screen cannot edit them.
