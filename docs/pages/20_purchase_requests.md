# Purchase Requests

Route `/inventory/purchase-requests` · `src/modules/inventory/PurchaseRequests.tsx` · 556 lines

Mounted at `src/App.tsx:306-313` inside `Shell`, with `crumbs=[{label:'Inventory'},{label:'Purchase Requests'}]` and the header search placeholder `"Search request, item, supplier…"` (`src/App.tsx:309`). The component is lazy-loaded (`src/App.tsx:55`). `Shell` (`src/App.tsx:943-1039`) supplies the session redirect (`:973-975`), the sidebar / bottom bar, `MockBanner`, `OfflineBanner` and the money-surface guard (`:993`).

**Status: Seed-only.**

---

## 1. What it is

A procurement queue drawn entirely from one constant array — three purchase requests in `src/data/purchaseRequests.ts:68-162` — with a status-tab filter, a row table, and a right-hand detail panel that shows each request's refused-booking and sub-rental evidence (`src/modules/inventory/PurchaseRequests.tsx:447-521`).

It issues exactly one write attempt: `approvePurchaseRequest` via a dynamic import at `:159-160`. That action never sets `implemented`, so `src/actions/core.ts:223-225` throws before anything runs, and the failure lands in an inline error line at `:526-531`.

The file imports nothing from `src/lib/queries/`, nothing from `src/lib/dataAccess`, and nothing from `src/lib/mock/` (import block, `:1-18`). There is no fetch, no loading state and no retry anywhere in it.

## 2. What renders

Desktop, top to bottom.

| # | Element | Evidence |
|---|---|---|
| 1 | `PageHeader` — title "Purchase Requests", description "Data-driven equipment acquisition workflows based on turnaways and sub-rental evidence." No icon prop is passed | `:189-216`; component `src/components/ui/Page.tsx:66-76` |
| 1a | Header actions: **Filter** and **New Draft PR**, both `disabled` and both wrapped in `Unavailable` with a stated reason | `:203-214`; `src/components/ui/Unavailable.tsx:35-164` |
| 2 | KPI strip — a hand-rolled `grid` of `auto-fit minmax(200px,1fr)`, one card per entry in `PURCHASE_REQUEST_KPIS`: icon chip, label, headline figure, sub-line. Today that is three cards (Draft Requests · Pending Approval · Approved / In Flight) | `:223-250`; `src/data/purchaseRequests.ts:202-206` |
| 3 | Status tab row — six plain `<button>`s (All · Draft · Submitted · Approved · Ordered · Received) over a bottom border. Not `Tabs`, not a `Segmented`; the active one is coloured plus bordered plus bold | `:253-272` |
| 4 | Two-column `grid`, `gridTemplateColumns: activePR ? '1fr 420px' : '1fr'` — the detail track exists only while a row is selected | `:274` |
| 5 | **`${activeTab} Purchase Requests (${filteredPRs.length})`** `Card` holding the table | `:276`; component `src/components/ui/Page.tsx:28-42` |
| 5a | `EmptyState` when the tab filters to zero rows, with a "Show all" action on every tab except All | `:277-283`; `src/components/ui/StateViews.tsx:34-84` |
| 5b | Table in an `overflowX:'auto'` box, no `minWidth`: PR Number · Equipment Item (name over `reason`) · Qty · Priority pill · **Total Cost (Est)** · Status pill · Requested By (first name over `dateCreatedAD`). Whole rows are clickable and tint when selected | `:285-371` |
| 6 | **PR Overview — `${prNo}`** `Card`, with an `Icon name="close"` button in the header action slot that clears the selection | `:378-445`, close at `:381-384` |
| 6a | Equipment block: item name, `(x qty)`, Category | `:387-393` |
| 6b | A `1fr 1fr` sub-grid: **Est Unit Cost**, **Total Cost**, Preferred Supplier (or "TBD"), Priority Score `n (Band)` | `:395-422` |
| 6c | Justification Notes tinted block, rendered only when `notes` is set | `:438-443` |
| 7 | **Acquisition Evidence (Data Room)** `Card` | `:447-521` |
| 7a | Refused Bookings (Losses) — a `refusedCount` "Events" figure, then a bordered table Booking · Client · Shortage. The Booking cell is a `Link` to `/rentals/${bookingRef}` | `:449-478`, link `:467-469` |
| 7b | Sub-Rental Expenses — a total figure, then a bordered table Sub-Rent Ref · Supplier · **Cost** | `:480-519` |
| 8 | Inline `role="alert"` error line, shown only after a failed or refused decision | `:526-531`, style `:37-46` |
| 9 | Decision buttons — **Reject PR** + **Approve Purchase** when `status === 'Submitted'`; **Mark as Ordered** when `status === 'Approved'`. No buttons for the other five statuses | `:534-550` |

Note on ordering: the error line at `:526-531` sits **above** the decision buttons, not beside them, despite the comment at `:31-35` describing it as "beside the buttons that raised it".

### Responsive bands

**This file reads neither breakpoint.** It does not import `src/lib/device.ts` at all (import block, `:1-18`), so nothing in it branches on 768 or 1180. `Card` and `PageHeader` do not read the viewport either — `src/components/ui/Page.tsx` imports `useViewport` at `:8` but calls it only in `KpiStrip` (`:210`), `ReflowRail` (`:360`), `useRailGridColumns` (`:383`) and `useBandColumns` (`:392`), none of which this page uses. `Button` (`src/components/ui/Button.tsx:1-2`) and `EmptyState` (`src/components/ui/StateViews.tsx:1-3`) import nothing from `device.ts`.

The only breakpoint-shaped adaptation in the file is CSS: `auto-fit minmax(200px,1fr)` on the KPI grid (`:223`) and `overflowX:'auto'` around the main table (`:285`).

| Threshold | Read where | What changes |
|---|---|---|
| **none (width)** | — | The detail grid's second track is the literal `420px` (`:274`) with no viewport test, so at tablet and phone widths the panel keeps its full width and squeezes the table column. `useRailGridColumns()` exists for exactly this (`src/components/ui/Page.tsx:382-384`, drops the second track below 1180) and is not called here |
| **none (capability, not width)** | `Unavailable` at `:204` and `:209` → `useCapability()` (`src/components/ui/Unavailable.tsx:44`; `src/lib/device.ts:111-130`) | Without hover the disabled-reason becomes a 500 ms long-press popover instead of a `title` attribute |
| 768 / 1180 (outside this page) | `Shell` → `useViewport()` (`src/App.tsx:957`) | Below 768 the sidebar is replaced by the bottom bar and page padding gains the bar inset (`src/App.tsx:1004`, `:1017`, `:1033`) |

The table has no phone fallback. `useTabularLayout()` (`src/lib/device.ts:139-141`), which exists to switch a wide table to card rows below 768, is not imported.

## 3. Data sources

| Screen area | Kind | Detail |
|---|---|---|
| KPI strip (3 cards) | SEED | `PURCHASE_REQUEST_KPIS`, `src/data/purchaseRequests.ts:202-206`. Values are `countByStatus()` (`:199-200`) over the same `PURCHASE_REQUESTS` array — today `1 / 1 / 1`. Read at `:224` |
| Status tab counts / row list | SEED | `requestsList`, initialised from `PURCHASE_REQUESTS` (`:93`; `src/data/purchaseRequests.ts:68-162`, three rows), filtered client-side at `:100-103` |
| Table row fields (PR no, item, qty, priority, status, requester, date) | SEED | Fields off each `PurchaseRequest` literal, `src/data/purchaseRequests.ts:69-161`; rendered `:315-365` |
| Total Cost (Est) column | SEED | `pr.totalEstimatedCost` (`src/data/purchaseRequests.ts:78,111,144`), formatted by `formatMoney` (`src/lib/money.ts:62-69`); rendered `:344` |
| PR Overview — Est Unit Cost / Total Cost | SEED | `estimatedUnitCost`, `totalEstimatedCost` (`src/data/purchaseRequests.ts:77-78,110-111,143-144`); rendered `:404`, `:408` |
| PR Overview — Preferred Supplier | SEED | `suggestedSupplier`, present on two of three rows (`src/data/purchaseRequests.ts:84,117`); rendered `:414` |
| PR Overview — Priority Score | SEED | The hand-typed `priorityScore` / `priority` fields (`src/data/purchaseRequests.ts:82-83,115-116,148-149`), **not** the exported `calculatePRPriority()` (`:59-66`), which nothing calls; rendered `:418-420` |
| Justification Notes | SEED | `notes` strings (`src/data/purchaseRequests.ts:89,125,154`); rendered `:441` |
| Refused Bookings table + count | SEED | `refusedCount` and `refusedBookings[]` (`src/data/purchaseRequests.ts:79-80,90-95,113,126-129,146,155-157`); rendered `:452`, `:464-473` |
| Sub-Rental table, total and count | SEED | `totalSubRentPaid` and `subRentals[]` with `costPaid` (`src/data/purchaseRequests.ts:79,96-100,112,130-133,145,158-160`); rendered `:492-494`, `:507-514` |
| Session identity for the dispatch | *(auth)* | `useAuth()` at `:88`; user shape `src/lib/auth.tsx:13-18` |
| `isOnline` passed into `ActionContext` | *(browser)* | `useNetwork()` at `:90`; `navigator.onLine` + online/offline listeners, `src/lib/network.ts:3-18` |

**Nothing on this page is DB or LOCAL.**

- **DB:** the table genuinely exists — `create table purchase_requests` at `supabase/migrations/0004_inventory.sql:578-601`, RLS enabled at `:727`, enums at `supabase/migrations/0001_enums.sql:634-642`, and generated types for both `purchase_requests` (`src/types/supabase.ts:7770`) and the view `purchase_requests_v` (`src/types/supabase.ts:12048`). **No file under `src/` queries either one** — a repo-wide search for `purchase_request` returns only the migrations and `src/types/supabase.ts`.
- **LOCAL:** `purchase_requests` is **UNSERVED** by the mock store. It is absent from the `Store` built at `src/lib/mock/corpus.ts:405-423`, absent from the `UNSERVED` announcement list at `:33-44` (so the mock banner never mentions it), and `purchase_requests_v` is absent from `VIEW_OF` at `:435-441`. It is unserved *and* unannounced.

Invented on this page: every rupee figure and every count — the three unit costs (Rs 465,000 / 285,000 / 145,000), the three totals (930,000 / 285,000 / 145,000), the three sub-rental totals (168,000 / 85,000 / 22,000) and the six individual `costPaid` amounts; the priority scores 14.6 / 8.9 / 4.5; the refused-booking counts 4 / 2 / 1 and their seven booking references, client names and shortage quantities; the six sub-rental references and five supplier names; the PR numbers PR-2026-0010…0012, the requester names, and both AD/BS date pairs. The three KPI tiles are counts *of that same invented array*, so they are internally consistent and describe nothing real.

## 4. Actions and writes

**One dispatch in the file.**

| Dispatch | Capability | Action file | `implemented` | Mapped in `checkCapability`? |
|---|---|---|---|---|
| `approvePurchaseRequest({ prId, status }, ctx)` — `:159-160`, called with `'Approved'`, `'Rejected'` or `'Ordered'` (`type PRDecision`, `:28`) | `purchase.approve` (`src/actions/inventory/approvePurchaseRequest.ts:11`) | `src/actions/inventory/approvePurchaseRequest.ts:9-37` — `execute` only `console.log`s `[DB TX] …` (`:18`) and returns `{ success: true }` | **false** — the key is never set, and `ActionConfig.implemented` defaults false (`src/actions/core.ts:89`, enforced `:223-225`) | **Yes** — `case 'purchase.approve': return rbac.canWriteSharedTriage(ctx.role)` (`src/actions/core.ts:213-214`), which is `isStaff(role)` (`src/lib/rbac.ts:255-257`, `:53-55`) |

Written exactly: **Approve Purchase / Reject PR / Mark as Ordered render, dispatch `APPROVE_PURCHASE_REQUEST`, action is a stub (`src/actions/core.ts:223-225` fails it closed).** The `implemented` throw happens *before* the context check (`:228-233`) and *before* the permission check (`:236-241`), so the correctly-mapped `purchase.approve` capability is never actually evaluated today.

Consequences that are correct in the code and worth stating:

- The row moves **only** on the resolved path (`:161-163`), which is unreachable. `setRequestsList` never runs today.
- Failures are caught at `:164-167`, `console.error`'d, and written into `actionError`, which renders inline at `:526-531`. No toast.
- `dispatchContext()` (`:122-123`) returns `null` with no session and the handler refuses to dispatch (`:152-157`) rather than substituting an identity.
- `isOnline` is passed (`:123`), so `checkCapability`'s `ctx.isOnline ?? true` (`src/actions/core.ts:126`) does not silently default to the fail-open direction. `canWriteSharedTriage` ignores it anyway (`src/lib/rbac.ts:255-257`).
- `EVENT_TYPES.PURCHASE_REQUEST_UPDATED` exists (`src/events/eventBus.ts:94`, `'inventory.purchase_request_updated'`) but is emitted only from inside `execute`'s return, i.e. never.

**Controls that write nothing:**

| Control | Behaviour | Evidence |
|---|---|---|
| **Filter** (header) | `disabled`, wrapped in `Unavailable` — "Filter is not built — the status tabs below are the only filter on this screen." | `:204-208` |
| **New Draft PR** (header) | `disabled`, wrapped in `Unavailable` — "there is no purchase-request intake screen or route in this release, and no action that raises one." | `:209-213` |
| Six status tabs | `onClick` sets local `activeTab` only | `:255-257` |
| Table rows | `onClick` sets local `selectedPrId` and clears `actionError` | `:307`, `:107-110` |
| Close (×) on the overview card | clears the selection | `:381` |
| "Show all" in the empty state | sets `activeTab` to `'All'` | `:282` |
| Booking refs in the evidence table | `Link` to `/rentals/${bookingRef}` — the route resolves (`src/App.tsx:246-253`) but `BookingDetail` serves one seeded booking regardless of the param (`src/modules/rentals/BookingDetail.tsx:688-691`) | `:467-469` |

There are **no unhandled buttons** — every control either has a handler, is a `Link`, or is `disabled` with a reason.

## 5. Gates

**Route access.** The only gate `Shell` applies is `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`src/App.tsx:993`). `MONEY_ROUTES` is `/finance`, `/reports`, `/admin`, `/tools/pricing`, `/tools/depreciation` (`src/data/nav.ts:147-153`), matched as a path-segment prefix (`:156-159`) — `/inventory/purchase-requests` is not among them. So **all nine roles reach this route once signed in**, including the four money-blind roles (`Warehouse`, `Technician`, `Driver`, `Client` — `src/lib/rbac.ts:45-50`) and including the external `Client` role, which nothing on this route excludes (`src/App.tsx:306-313` carries no role prop; `isStaff` (`src/lib/rbac.ts:53-55`) is never called in `App.tsx`).

The route has **no nav entry** — `/inventory/purchase-requests` does not appear anywhere in `src/data/nav.ts`. It is reachable by typed URL or deep link only.

**Money visibility.** `useCanViewMoney()` is called once at `:89` (`src/lib/moneyVisibility.ts:24-27` → `canViewMoney`, `src/lib/rbac.ts:36-38`, which mirrors `auth_can_view_money()`). No session at all is also money-blind (`moneyVisibility.ts:26`).

**Hidden under Law 6** (all *omitted*, never masked or zeroed):

| Element | Gate | Evidence |
|---|---|---|
| Any KPI tile whose headline `value` matches `/\bNPR\b\|\bRs\.?\b\|₹/i` | tile dropped from the grid | `:84-85`, `:224` |
| A tile's `change` sub-line when the sub-line carries a currency token | sub-line dropped, count kept | `:245-247` |
| **Total Cost (Est)** table column | `{money && <th …>}` / `{money && <td …>}` — header and cells both dropped, so the column disappears | `:296`, `:341-347` |
| **Est Unit Cost** and **Total Cost** cells in the overview grid | both dropped; Preferred Supplier and Priority Score remain | `:400-411` |
| Sub-rental block heading | "Sub-Rental Expenses" → "Sub-Rentals Used" | `:489` |
| Sub-rental total figure | `formatMoney(totalSubRentPaid)` → `"${subRentals.length} Events"` | `:492-494` |
| Sub-rental **Cost** column | header and cells both dropped | `:503`, `:511-513` |

⚠ **The KPI money scan is a no-op against today's seed.** `PURCHASE_REQUEST_KPIS` values are now bare counts (`"1"`) and the sub-lines are prose — "Accumulating evidence", "Awaiting a decision", "Cleared to purchase" (`src/data/purchaseRequests.ts:202-206`). No tile contains `NPR`, `Rs` or `₹`, so `isMoneyText` is false for all six strings and the filter at `:224`/`:245` drops nothing for any role. The comment block at `:69-83` and `:218-222` describes tiles (`value: 'NPR 320,000'`, `'NPR 845,000 total'`, "Sub-Rent Cost Avoidance", "Pending Approval stays 2") that no longer exist in the data module.

**Not gated by role:** the decision buttons. They render for every signed-in role on a `Submitted` / `Approved` request (`:534-550`) with no `rbac` call in the file; the refusal is expected to come from the dispatcher. Today that refusal is `ActionNotImplementedError`, not `ActionPermissionError` — see §7.

## 6. States drawn

`PageBody` (`src/components/ui/PageBody.tsx`) is **not** used — it is not imported (`:1-18`).

| State | Present? | Evidence |
|---|---|---|
| **Loading** | **None.** There is no fetch, so nothing loads. The only skeleton a user sees is `Shell`'s `Suspense` fallback while the lazy chunk downloads (`src/App.tsx:1026`), which belongs to `App.tsx` | `:1-18` (no query import); `src/App.tsx:1026` |
| **Error** | Hand-rolled only — a bare `<p role="alert">` with a local style object (`:37-46`, `:526-531`) carrying the caught dispatch message. `ErrorBanner` (`src/components/ui/StateViews.tsx:171-210`) is not imported. There is no load-error state, because there is no load | `:526-531` |
| **Empty** | Yes — one `EmptyState` (`src/components/ui/StateViews.tsx:34-84`) when the active tab filters to zero, with tab-specific title/description and a "Show all" action on every tab but All | `:277-283` |
| **Restricted** | **None in this file.** The header comment at `:56-67` records that `RestrictedState` was considered and deliberately rejected. `RestrictedState` (`src/components/ui/StateViews.tsx:213-280`) is reachable only through `Shell`'s money guard (`src/App.tsx:1020-1023`), which can never fire for this route (see §5) | `:56-67`; `src/App.tsx:993`, `:1020-1023` |

## 7. Known gaps

**`TODO(decision)` markers in this file**

| Line | Decision |
|---|---|
| `:138-147` | Which roles may approve a purchase request, and above what value a second approval is required. See the contradiction below — the premise of this marker is now stale |
| `:424-437` | Whether a free-text justification note counts as money for Law 6 (hide the note, strip the amount, or restrict who may write one). None of the three seeded notes carries a figure (`src/data/purchaseRequests.ts:89,125,154`), so it is a latent channel, not a live leak |

**`TODO(decision)` in files this page depends on**

| Line | Decision |
|---|---|
| `src/data/purchaseRequests.ts:188-192` | What "Sub-Rent Cost Avoidance" means and where it is sourced. The tile is absent rather than guessed, which is why the KPI strip is three cards and not four |
| `src/actions/core.ts:66-71` | `inspection.create` / `.pass` / `.fail` stay unmapped. Not this page's capability, but it is the live example of the fail-closed behaviour this page's comment relies on |

**The comment at `:138-147` contradicts `core.ts` and `rbac.ts`**

The handler's doc block states: *"The action declares `permissions: ['purchase.approve']` and `lib/rbac` has no rule for it … `core.ts` denies an unknown capability by name, so the dispatch already fails closed."* Both halves are false as of the current code:

- `src/actions/core.ts:213-214` maps `case 'purchase.approve': return rbac.canWriteSharedTriage(ctx.role)`.
- `src/lib/rbac.ts:255-257` defines `canWriteSharedTriage` as `isStaff(role)` — every role except `Client`.

So the capability is mapped and broad. The dispatch does still fail closed, but for a different reason (`implemented` is false, `src/actions/core.ts:223-225`), and the buttons are ungated on a rule that now *does* exist. `rbac.ts:246-253` flags the consequence itself: mirroring `purchase_requests_all` = `auth_is_staff()` admits **Driver and Technician to a spend-authorising verb**, "probably not intended", and asks for the RLS policy to be changed first.

**Stubs and dead controls**

- **No decision can be recorded.** `approvePurchaseRequest` has no `implemented: true` (`src/actions/inventory/approvePurchaseRequest.ts:9-37`) and its `execute` writes nothing — one `console.log('[DB TX] …')` at `:18`. All three buttons (`:536`, `:539`, `:546`) therefore produce the inline `ActionNotImplementedError` text and nothing else.
- **No intake.** There is no route, screen or action that *creates* a purchase request — `New Draft PR` is disabled with that reason (`:209-213`), and `src/actions/inventory/` has no create-PR action.
- **No filter beyond the six status tabs** (`:204-208`). The header search placeholder promises "Search request, item, supplier…" (`src/App.tsx:309`) but nothing on this page consumes a search term.
- **`calculatePRPriority()` is dead code.** Exported at `src/data/purchaseRequests.ts:59-66` and called from nowhere in `src/`. The page renders the hand-typed `priorityScore` instead (`:418-419`), and one of the three disagrees with the formula: for `pr-002` the formula yields `4 + 2 + (85000/285000)*10 = 8.98 → 9.0`, while the stored value is `8.9` (`src/data/purchaseRequests.ts:115`). `pr-001` (14.6) and `pr-003` (4.5) do match.
- **`subRentCount` is never read.** The field exists on every row (`src/data/purchaseRequests.ts:36`, values at `:81,114,147`) and the page uses `subRentals.length` instead (`:494`). They agree today, so the drift is latent.

**The KPI strip cannot follow a status change**

`PURCHASE_REQUEST_KPIS` is evaluated once at module load from the `PURCHASE_REQUESTS` constant (`src/data/purchaseRequests.ts:199-206`), while the table reads component state `requestsList` (`:93`). The success path at `:161-163` mutates only the state, so a landed decision would move a row between tabs while the three tiles above it kept the old counts. Unobservable today because the action always throws — it becomes a live defect the moment `implemented: true` is set.

**Contradictions with other surfaces**

- **This page is documented as archived.** `src/data/inventory.ts:185-187` records that Purchase Requests is *"archived"* and that its screen "leaves Inventory's surface", while `/inventory/purchase-requests` "still resolves". The route is indeed still mounted (`src/App.tsx:306-313`) and appears in no nav section (`src/data/nav.ts`), so the page is live but unreachable through the UI — reachable only by typed URL.
- **The DB has the table; the app has the array.** `purchase_requests` is a real table with RLS, a status enum and a `purchase_requests_v` view (`supabase/migrations/0004_inventory.sql:578-601`, `:727`; `supabase/migrations/0001_enums.sql:634-642`; `src/types/supabase.ts:7770`, `:12048`), and no code reads any of it. The screen's seven statuses (`src/data/purchaseRequests.ts:4`) match the enum exactly, which makes the gap a wiring gap rather than a modelling one.
- **The mock corpus does not announce the gap.** `purchase_requests` is neither in the mock `Store` (`src/lib/mock/corpus.ts:405-423`) nor in `UNSERVED` (`:33-44`), so in mock mode the banner that exists to prevent "an unexplained empty screen" (`corpus.ts:22-25`) says nothing about this table.
- **Money-blind roles reach a screen the DB masks.** `Warehouse`, `Technician` and `Driver` can open this route (§5); the page omits every figure, but it also renders every supplier name and sub-rental reference for them (`:509-510`) — that is the deliberate reading recorded at `:48-67`, noted here so the choice is visible rather than assumed.

**Other observations**

- The evidence-table Booking links point at `/rentals/B-189` etc. (`:467-469`); `BookingDetail` reads `bookingNo` off the URL but serves one seeded booking's data regardless (`src/modules/rentals/BookingDetail.tsx:688-691`, which says so in its own comment). Two of these refs also appear as hardcoded strings on a third screen — `B-189` and `B-195` in `src/modules/inventory/AssetDetail.tsx:618,623` — against a different client name for `B-189`.
- Table rows are clickable `<tr>` elements with `cursor:'pointer'` and no `role`, `tabIndex` or key handler (`:305-314`), so selection is mouse/touch only.
- `PRIORITY_COLORS` and `STATUS_COLORS` are rebuilt on every render inside the component body (`:170-184`) rather than hoisted; both are pure constants.
- `PRIORITY_COLORS.High.bg` and `STATUS_COLORS.Approved.bg` / `.Rejected.bg` use CSS-variable fallbacks (`var(--st-out-bg, rgba(239,68,68,0.1))`, `:171,179,182`) while the neighbouring entries do not, so the same token is written two ways in one object.
