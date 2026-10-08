# Sub-Rental

Route `/operations/sub-rental` · `src/modules/operations/SubRental.tsx` · 783 lines

Mounted at `src/App.tsx:391-398` inside `Shell` with `crumbs=[{label:'Operations'},{label:'Sub Rental'}]` and the header search placeholder `"Search SR ID, equipment, partner…"`; lazy-loaded at `src/App.tsx:83`. `Shell` (`src/App.tsx:943-1040`) supplies the session redirect (`:973-975`), sidebar / bottom bar, `MockBanner` (`:1006`), `OfflineBanner` (`:1007`), the `ErrorBoundary` + `Suspense` fallback (`:1025-1029`) and the money-surface guard (`:993`). The `Shell` header's search control is not a page filter — it dispatches a synthetic `⌘K` to open the command palette (`src/components/shell/Header.tsx:109-147`); the page's own two search boxes are separate (`src/modules/operations/SubRental.tsx:221-228`, `:610-617`).

Nothing in `src/` links to this route. The only two occurrences of the string `/operations/sub-rental` are the route declaration (`src/App.tsx:392`) and a prose mention in `src/data/inventory.ts:181`; it is absent from `NAV` (`src/data/nav.ts`), so the page is reached by typed URL only.

Status: **Seed-only.**

---

## 1. What it is

A two-tab read-only screen over four hard-coded sub-rental transactions declared inside the page file itself (`src/modules/operations/SubRental.tsx:44-111`). Tab one is a filterable transaction table; tab two (`:184-373`, `:510-517`) groups those same four rows by `counterparty` into a supplier directory.

The import block (`:1-21`) contains no `src/actions/`, no `src/lib/queries`, no `src/lib/dataAccess` and no `src/lib/supabase`. It dispatches nothing and writes nothing; its only outbound effects are `navigate()` (`:766`) and one `<Link>` (`:708`).

## 2. What renders

Desktop, `subTab === 'Transactions'` (the initial value, `:390`), top to bottom:

| # | Element | Evidence |
|---|---|---|
| 1 | Sub-tab bar — two bare `<button>`s, "Transactions" and "Suppliers", the active one carrying `aria-current="page"` and a 2px `--nav-active-accent` bottom border | `:481-508` |
| 2 | KPI grid — `gridTemplateColumns: repeat(4, 1fr)` when `canSeeFinance`, `repeat(1, 1fr)` otherwise | `:522` |
| 2a | "Active Records" tile — the literal `30`, sub-line the literal `"Borrowing (18) · Lending (12)"` | `:523-533`, figure `:528`, sub-line `:531` |
| 2b | "Total Revenue" tile — the literal string `Rs 1,20,000` (not `formatMoney`) | `:536-546`, figure `:541` |
| 2c | "Total Cost" tile — the literal string `Rs 80,000` | `:547-557`, figure `:552` |
| 2d | "Blended Margin" tile — the literal `33.3%` | `:558-568`, figure `:563` |
| 2b–2d are rendered only inside `{canSeeFinance && …}` | | `:534-570` |
| 3 | Filter chip row — seven chips (All 48 · Overdue 4 · Reserved 6 · Picked Up 8 · On Rent 16 · Returned 9 · Checked In 5); every count is a literal in the array, not a `.length` | array `:576-584`, buttons `:585-606` |
| 4 | Search `Input`, width 240, `IconSearch` leading icon, placeholder "Search SR ID, equipment, partner…" | `:610-617`; `icon` prop `src/components/ui/Input.tsx:17`, `:49-60` |
| 5 | "Export" `Button variant="secondary" disabled` wrapped in `Unavailable` carrying `EXPORT_REASON` | `:618-622`, reason `:162-163`, component `src/components/ui/Unavailable.tsx:35-164` |
| 6 | "New Sub-Rental" `Button variant="primary" disabled` wrapped in `Unavailable` carrying `NEW_SUB_RENTAL_REASON` — rendered only when `canSeeFinance` | `:630-636`, reason `:159-160` |
| 7 | Transaction table inside `Card padding="none"`, in an `overflowX:auto` div; no `minWidth` is set on the table | `:641`, `:653-654`; `Card` `src/components/ui/Card.tsx:22`, `:79` |
| 7a | Header row: select-all checkbox · SR ID & Direction · Counterparty · Equipment · Dates · **Revenue & Cost** (only when `canSeeFinance`) · Status · Actions | `:656-672`, money column `:669` |
| 7b | Row: per-row checkbox (`:681-688`); SR ID plus a direction line with `IconArrowDownLeft`/`IconArrowUpRight` coloured `--info`/`--good` (`:689-695`); counterparty wrapped in `IntelCard` plus, when present, a `<Link>` to `/rentals/{linkedBooking}` (`:696-710`); `{quantity}x {equipment}` plus a "Rental Value:" line gated on `canSeeFinance` (`:711-720`); BS date range over AD date range (`:721-728`); Revenue, a margin badge and a "Cost:" line, whole cell gated on `canSeeFinance` (`:729-748`); an "OVERDUE" pill when `isOverdue` plus a coloured status dot (`:749-761`); a "View" `Button size="sm"` (`:762-770`) | as cited |
| 7c | When `filteredData.length === 0`, the table is replaced by `EmptyState` titled "No records found" with a "Clear Filters" action | `:642-651` |

`subTab === 'Suppliers'` replaces items 2–7 entirely with `SupplierDirectoryTable` (`:510-517`, component `:184-373`):

| # | Element | Evidence |
|---|---|---|
| S1 | A count line — "N counterpart{y/ies} — every Sub Rental record grouped by who it's with" — and a 240px supplier search `Input` | `:217-229` |
| S2 | Table columns: Supplier · Relationship · Units In-House · Records · Last Transaction · **Lifetime Revenue & Cost** · **Margin**, the last two only when `canSeeFinance` | `:254-260` |
| S3 | Row: `IntelCard`-wrapped supplier name with a `truck` icon tile and an "OVERDUE ACTIVE" line (`:266-300`; icon `src/components/ui/Icon.tsx:117`); a gold-outline relationship badge using `--ext-line`/`--ext-fg` (`:301-317`); units in-house (`:318-320`); "N active / N past · N total" (`:321-328`); last-transaction AD date (`:329-331`); revenue + cost (`:332-341`); a margin percentage badge, red below zero (`:342-363`) | as cited |
| S4 | When the search matches nothing, `EmptyState` titled "No suppliers match" with a "Clear search" action | `:232-238` |

**Responsive bands: this file reads none.** `src/lib/device.ts` is not in the import block (`:1-21`); the words `useViewport`, `useCapability`, `useTabularLayout` and `BREAKPOINT` do not appear in the file. The KPI grid is a fixed `repeat(4, 1fr)` (`:522`), the chip row and toolbar rely on `flexWrap: 'wrap'` (`:574`, `:575`), and both tables sit in `overflowX: 'auto'` containers (`:240`, `:653`) — so below 1180 and below 768 the layout is identical apart from wrapping and horizontal scroll.

Two breakpoint behaviours arrive indirectly, from components the page mounts, not from the page:
- `IntelCard` reads `useViewport()` and renders its detail `Modal` as a bottom sheet at `phone` (< 768) — `src/components/ui/IntelCard.tsx:98`, `:211`.
- `Unavailable` reads `useCapability().hasHover` and swaps the `title` tooltip for a 500 ms long-press popover — `src/components/ui/Unavailable.tsx:44`, `:70-77`, `:111`. That is a capability branch, not a width band.
- `Shell` itself swaps the sidebar for a bottom bar at `phone` — `src/App.tsx:957-958`, `:1004`, `:1033`.

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Every transaction row (4 records: SR-2026-0032/0033/0034/0035) | SEED | `SUB_RENTAL_DATA`, a module-scope constant array declared **inside the page file** rather than under `src/data/` — `src/modules/operations/SubRental.tsx:44-111`. `src/data/supplierIntel.ts:13-22` states this placement explicitly. |
| Supplier grouping (both the hover card and the Suppliers tab) | SEED | `groupByCounterparty(SUB_RENTAL_DATA)` at `:118`, over the same array; `src/data/supplierIntel.ts:99-107` |
| Supplier phone / email / subrental discount % | SEED | `SUPPLIER_CONTACTS`, a constant array in `src/data/supplierIntel.ts:74-83` — two of the four counterparties have entries; the other two render "Not on file" (`src/data/supplierIntel.ts:215`, `:240-241`) |
| "Active Records" tile = 30, "Borrowing (18) · Lending (12)" | SEED | JSX literals, `:528`, `:531` — not derived from `SUB_RENTAL_DATA` |
| "Total Revenue" Rs 1,20,000 · "Total Cost" Rs 80,000 · "Blended Margin" 33.3% | SEED | JSX literals, `:541`, `:552`, `:563` — not `formatMoney`, not summed from the rows |
| Seven filter-chip counts (48 / 4 / 6 / 8 / 16 / 9 / 5) | SEED | literal `count` fields in the chip array, `:577-583` |
| Per-row rental value / revenue / cost / margin | SEED | `rupees(...)` literals on each record, `:56-58`, `:72-74`, `:89-91`, `:105-107`; rendered through `formatMoney` (`src/lib/money.ts:62-69`) |
| Supplier lifetime revenue / cost / margin, last-transaction date | SEED | derived in `src/data/supplierIntel.ts:109-111`, `:304-332`, `:275-277` from the same four seeded records |
| — | DB | **none.** No table, view or RPC is queried. No query file is imported. |
| — | LOCAL | **none.** `src/lib/mock/corpus.ts` serves 17 store keys (`:405-423`) plus the ten `UNSERVED` placeholders (`:33-44`); there is no `suppliers` key and no sub-rental table. A `suppliers` table does exist in the live schema — `src/lib/rbac.ts:99` names its `suppliers_all` policy — but it is **UNSERVED** by the corpus and unqueried by this page. |

Invented on this page: all four transaction records and their IDs, counterparties, equipment, quantities, BS/AD dates and statuses; every rupee figure on the screen (per-row rental value, revenue, cost and margin; the three KPI money tiles; the supplier lifetime revenue/cost/margin columns); the "Active Records" count of 30 and its Borrowing 18 / Lending 12 split; all seven filter-chip counts totalling 48; and the two seeded supplier phone/email/discount records in `src/data/supplierIntel.ts:74-83`.

## 4. Actions and writes

**No dispatch of any kind.** The file imports nothing from `src/actions/`, and the strings `createAction`, `dispatch` and `showSuccessToast` do not appear in it. The header comment (`:122-158`) records that the previous version of this page dispatched `createSubRental({ itemDescription: 'Sub-Rental Item', costPaisa: 500000 })` from an ungated header button and that the dispatch was removed.

The capability this page would need, traced anyway because the page's own comment makes a claim about it:

| Capability | Action file | `implemented` | Mapped in `checkCapability`? |
|---|---|---|---|
| `subrental.create` | `src/actions/subrentals/createSubRental.ts:11-43` | **false** — the key is absent, and `src/actions/core.ts:223-225` throws `ActionNotImplementedError` before validate/execute/events | **Yes** — `src/actions/core.ts:194-195` maps it to `rbac.canWriteBookingDesk` (`src/lib/rbac.ts:215-217` → `BOOKING_DESK` = Owner, Admin, Manager, Coordinator, Warehouse, `src/lib/rbac.ts:71-77`) |

That action is reached only from `src/modules/rentals/modals/CreateSubRentalModal.tsx:105-108`, which `BookingDetail` mounts (`src/modules/rentals/BookingDetail.tsx:31`, `:2157`) — never from this page. Its `execute` body only `console.log`s (`src/actions/subrentals/createSubRental.ts:22`) and mints an ID via `issue('SR', …)` (`:21`, `src/data/numbering.ts:417-430`); it persists nothing.

Buttons with no handler, or a handler that reaches nothing:

| Control | Line | State |
|---|---|---|
| "Export" | `:618-622` | `disabled`, no `onClick`. Renders greyed with `EXPORT_REASON` on hover / long-press. Not built. |
| "New Sub-Rental" | `:630-636` | `disabled`, no `onClick`, and only rendered for `canSeeFinance` roles. Not built. |
| "View" (per row) | `:762-770` | `onClick` is `undefined` whenever the record has no `linkedBooking` — true for SR-2026-0033 (`:63-77`) and SR-2026-0035 (`:96-110`), i.e. 2 of the 4 seeded rows. The button still renders enabled-looking (`src/components/ui/Button.tsx:89`, `:105-106` only grey it when `disabled`), so it is a dead control on half the table. |
| Select-all checkbox | `:657-664` → `handleSelectAll` `:445-448` | Writes `selectedRowIds` (`:389`). Nothing else reads it except the checkboxes' own `checked` props (`:660`, `:684`). No bulk-action bar exists in the file. |
| Per-row checkbox | `:681-688` → `handleToggleRow` `:450-455` | Same — selection is stored and never used. |

Working controls: the two sub-tab buttons (`:485-506`), the seven filter chips (`:587`), both search inputs (`:225`, `:614`), the two `EmptyState` reset actions (`:237`, `:647-650`), the `<Link>` to `/rentals/{linkedBooking}` (`:708`, route `src/App.tsx:247`), the "View" `navigate()` on rows that have a linked booking (`:766`), and the `IntelCard` "Open" triggers inside the hover card's detail groups (`src/data/supplierIntel.ts:195`, `:229`). None of them write.

## 5. Gates

**Route access — every signed-in role, including the external `Client` role.** `Shell` redirects only when there is no session (`src/App.tsx:973-975`) and refuses a route only when `!canViewMoney(role) && isMoneySurface(pathname)` (`:993`). `MONEY_ROUTES` is `/finance`, `/reports`, `/admin`, `/tools/pricing`, `/tools/depreciation` (`src/data/nav.ts:147-153`) — `/operations/sub-rental` is not among them, so the guard never fires here and no role is refused. There is no per-route role check anywhere in `App.tsx` (no `RequireRole`, `Guard`, `isStaff` or `allowedRoles` in the file).

**Money visibility — the page does not use `useCanViewMoney`.** `src/lib/moneyVisibility.ts:24-27` is not imported. The single flag is `canSeeFinance = canViewMoneyField(gctx, 'asset-finance')` at `:385`, over `gctx = gateContext(user?.role ?? 'Client')` at `:379`. Resolving through `src/lib/fieldGating.ts:55-72`:

| Role | `moneyScope` | `canSeeFinance` |
|---|---|---|
| Owner, Admin, Manager, Accounts | `full` (`fieldGating.ts:53`, `:59`) | **true** |
| Coordinator | `booking-and-client-balance` (`:60`) | **false** — `asset-finance` is excluded at `:71` |
| Warehouse, Technician, Driver, Client | `none` (`:61`) | **false** |

`surface` is always `'default'` here — `gateContext` is called with no options (`:379`, `fieldGating.ts:41-43`), so the floor override at `fieldGating.ts:57-58` never applies on this route.

Hidden under Law 6 when `canSeeFinance` is false (each is omitted from the tree, not CSS-hidden):
- the three money KPI tiles, and the grid collapses to one column — `:522`, `:534-570`
- the "New Sub-Rental" control entirely — `:630-636`
- the transactions table's "Revenue & Cost" header and cell — `:669`, `:729-748`
- the per-row "Rental Value" line — `:715-719`
- the supplier table's "Lifetime Revenue & Cost" and "Margin" headers and cells — `:259-260`, `:332-341`, `:342-363`
- inside the hover card: the "Lifetime revenue" glance line (`src/data/supplierIntel.ts:126-129`), the "Commercial" group with lifetime revenue/cost/blended margin/subrental discount (`:201-219`), and the whole "Transaction history" group (`:220-232`)
- `SupplierDirectoryRow.financial` is omitted from the row object rather than zeroed (`src/data/supplierIntel.ts:289-295`, `:319-329`)

PII gate (`canViewPII`, `src/lib/fieldGating.ts:92-96`) hides the hover card's "Contact" group — phone and email — from Warehouse and Technician, and from Driver too: `deliveryLinked` is never set on this page's `gctx` (`:379`), so `fieldGating.ts:94` returns false for Driver (`src/data/supplierIntel.ts:235-244`).

## 6. States drawn

| State | Present | How |
|---|---|---|
| Loading | **no** | The page has no async read, so it has no loading state of its own. `PageBody` is not imported. The only skeleton on this route is `Shell`'s `Suspense` fallback for the lazy chunk — `src/App.tsx:1026`, `src/components/ui/StateViews.tsx:87-165`. |
| Error | **no** | No `ErrorBanner`, no `try`/`catch`, no error state. `Shell`'s `ErrorBoundary` (`src/App.tsx:1025`) is the only backstop. |
| Empty | **yes ×2**, hand-rolled around the shared component | `EmptyState` from `src/components/ui/StateViews.tsx:34-84` — transactions "No records found" / "Clear Filters" (`:643-651`) and suppliers "No suppliers match" / "Clear search" (`:233-238`). Both are the filtered-empty shape; with `SUB_RENTAL_DATA` non-empty at module scope (`:44-111`) the unfiltered-empty case is unreachable. |
| Restricted | **no** | `RestrictedState` is not imported. `Shell` can render it (`src/App.tsx:1020-1023`) but only for money surfaces, and this route is not one (`src/data/nav.ts:147-153`). A money-blind role therefore sees the page with its figures omitted, never a restricted screen. |

## 7. Known gaps

1. **`TODO(decision)` at `src/modules/operations/SubRental.tsx:147` is stale and states the opposite of the code.** It reads: "its capability is `subrental.create`, and `actions/core.ts:109-125` maps no rule for that string. An unmapped capability is denied fail-closed, so *no role* may create a sub-rental today." `src/actions/core.ts:194-195` **does** map `subrental.create`, to `rbac.canWriteBookingDesk` — Owner, Admin, Manager, Coordinator, Warehouse (`src/lib/rbac.ts:215-217`, `:71-77`). The cited line range `109-125` in today's `core.ts` is the `ActionPermissionError` class, not the switch (`core.ts:107-117`). Written per the rule: the code maps it; the comment says it does not.
2. **The visible gate and the real capability disagree about who may create a sub-rental.** The control is gated on `canSeeFinance` (`:630`) = Owner/Admin/Manager/Accounts (`src/lib/fieldGating.ts:53`), while the capability resolves to Owner/Admin/Manager/Coordinator/Warehouse (`src/lib/rbac.ts:215-217`). Accounts sees a control it may not use; Coordinator and Warehouse may use it and never see it.
3. **Every KPI and every chip count is a literal that contradicts the rows below it.** "Active Records 30" (`:528`) over a 4-record array (`:44-111`) of which 2 are active by `ACTIVE_STATUSES` (`src/data/supplierIntel.ts:85`). Chip counts total 48 (`:577-583`) over the same 4 rows — selecting "On Rent 16" (`:581`) shows one row. The three money tiles (`:541`, `:552`, `:563`) are internally consistent with each other (120,000 − 80,000 = 40,000 → 33.3%) but match nothing: summing the array gives Rs 2,35,000 revenue and Rs 1,66,500 cost (`:56-58`, `:72-74`, `:89-91`, `:105-107`).
4. **The "View" button is dead on rows without a linked booking** — `onClick` is `undefined` at `:766`, and `Button` only greys itself when `disabled` (`src/components/ui/Button.tsx:89`, `:105-106`), so SR-2026-0033 (`:63-77`) and SR-2026-0035 (`:96-110`) render a live-looking button that does nothing.
5. **Row selection leads nowhere.** `selectedRowIds` (`:389`) is written by `handleSelectAll` (`:445-448`) and `handleToggleRow` (`:450-455`) and read only by the checkboxes themselves (`:660`, `:684`). No bulk-action bar exists in the file.
6. **The page reads no breakpoint.** `src/lib/device.ts` is absent from the imports (`:1-21`), so the KPI grid stays `repeat(4, 1fr)` (`:522`) and both tables stay tables at every width, scrolling horizontally (`:240`, `:653`) — the exact behaviour `src/lib/device.ts:132-141` describes as "not a table — it is a horizontal scrollbar hiding the columns that matter."
7. **The route is unreachable through the UI.** `/operations/sub-rental` appears only at `src/App.tsx:392` and in prose at `src/data/inventory.ts:181`; it is in no nav list, so the page is typed-URL-only.
8. **Stub referenced by the page's own refusal text.** `NEW_SUB_RENTAL_REASON` (`:159-160`) points the operator at the booking-level flow. That flow's action is a stub: `src/actions/subrentals/createSubRental.ts:11-13` sets no `implemented`, so `src/actions/core.ts:223-225` refuses it. `CreateSubRentalModal` documents this itself (`src/modules/rentals/modals/CreateSubRentalModal.tsx:79-104`), including that `CreateSubRentalInput` carries no client-charge field, so the charge and margin the modal collects reach nothing.
9. **Wrong path in the refusal comment.** `:135` cites "`modals/CreateSubRentalModal.tsx`", which relative to this file would be `src/modules/operations/modals/…`. The file is at `src/modules/rentals/modals/CreateSubRentalModal.tsx`.
10. **`src/data/supplierIntel.ts:6-8` contradicts this page and misquotes its source.** It states "There is no supplier directory or profile screen anywhere in this app" — the Suppliers tab (`:184-373`, `:510-517`) is one, as the same file's later note acknowledges (`src/data/supplierIntel.ts:32-42`). It also attributes to `src/data/inventory.ts` the reason "Suppliers arrive with Sub Rental, which is blocked on open decisions"; the blocked Supplier facet there now reads "products.supplier_id exists (0004:125), but it is a uuid and this rail must offer supplier names. No query joins suppliers to the catalogue." (`src/data/inventory.ts:810-816`).
11. **The `suppliers` table exists in the schema and nothing on this page touches it.** `src/lib/rbac.ts:99` names the live `suppliers_all` policy (Owner/Admin/Manager); the supplier directory is instead synthesised by grouping four in-file transaction records (`:118`, `src/data/supplierIntel.ts:99-107`), and `src/lib/mock/corpus.ts:405-423` serves no `suppliers` store key.
12. **Runtime coupling between a page and a `src/data/` module.** `src/data/supplierIntel.ts:46` type-imports `SubRentalRecord` from this page while the page value-imports four functions back (`:13-19`). The type import is erased, so there is no runtime cycle today (documented at `src/data/supplierIntel.ts:13-22`), but the record type and its seed data live in a lazy-loaded route component rather than in `src/data/`.
