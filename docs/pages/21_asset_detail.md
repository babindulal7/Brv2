# Asset Detail

Route `/inventory/:assetId` · `src/modules/inventory/AssetDetail.tsx` · 898 lines

Mounted at `src/App.tsx:322-329` inside `Shell` with `crumbs=[{label:'Inventory'},{label:'Asset'}]` and the header search placeholder `"Search equipment, serial, SKU, category…"`. Declared last of the `/inventory/*` group so a literal segment (`new`, `warehouses`, `stock-check`, `purchase-requests`) is matched first (`src/App.tsx:275-321`). Lazy-loaded (`src/App.tsx:52`).

---

## 1. What it is

A single equipment record rendered as a hero block, a 2–4 tile answer strip and six tabs (`src/modules/inventory/AssetDetail.tsx:200-207`). The record is found by `PARENTS.find(p => p.code === assetId || p.children?.some(c => c.serial === assetId))` — a linear scan of the eight-row constant array `PARENTS` in `src/data/inventory.ts:475-653` (`AssetDetail.tsx:165`).

It reads no query module and dispatches no action: the import block (`AssetDetail.tsx:1-16`) contains nothing from `src/lib/queries/`, nothing from `src/actions/`, and nothing from `src/lib/dataAccess`. The one editor on the page states this itself — "Editing this session only — unit records are not persisted yet" (`AssetDetail.tsx:118`).

## 2. What renders

Desktop (`viewport === 'desktop'`, ≥1180), top to bottom:

| # | Element | Evidence |
|---|---|---|
| 0 | **Not-found branch** — when no `PARENTS` row matches, the whole page is replaced by `EmptyState` "Equipment not found" / `No asset matches "<assetId>"…` with a `Browse Inventory` button → `navigate('/inventory')`. Returns before any hook below the lookup runs | `AssetDetail.tsx:174-185`; component `src/components/ui/StateViews.tsx:34-84` |
| 1 | Breadcrumb line `Inventory › {category} › {name}` plus an identifier chip holding `asset.code ?? 'EQ000234'` | `AssetDetail.tsx:212-232` |
| 2 | Header buttons: `Print Labels` (secondary, icon `download`) → opens the QR modal on `asset.children[0].serial ?? 'SN-FX3-001'`; `Book Asset` (primary, icon `checklist`) → `navigate('/rentals/new')` | `AssetDetail.tsx:234-241` |
| 3 | Hero card — 72px image tile (`asset.image` or a `box` glyph), `<h1>` name, an `External Sub-Rental` badge when `isSubRented`, and a meta line `Brand: {asset.brand ?? 'Sony'} · Category · code`. The card's border turns 2px orange when `isSubRented` | `AssetDetail.tsx:245-307`; badge `:282-296`; border `:254` |
| 4 | Live Availability panel inside the hero — `{availableCount} / {totalUnits} Units` plus a green/red dot | `AssetDetail.tsx:309-333` |
| 5 | Answer strip, `repeat(cols(2 + utilization + money), minmax(0,1fr))`: **AVAILABLE NOW** (`n of m`, sub-line "In Kathmandu HQ"), **NEXT FREE** ("Tomorrow 14:00" / "SN-FX3-004 returning"), **UTILISATION (90D)** when `canViewUtilization`, **RECOVERY %** when `useCanViewMoney` | `AssetDetail.tsx:336-389` |
| 6 | Tab strip — `Units · Timeline · Maintenance · [Money] · Documents · Activity`, `overflowX:'auto'`, `minHeight:44` per button, active tab bordered and filled | `AssetDetail.tsx:392-419`; tab list `:200-207` |
| 7 | **Units** tab — `Card title="Fleet Units & Serial Records"` holding a 9-column table (`minWidth` 900 desktop / 720 tablet): chevron · Serial Number · Asset Tag · Condition · Status · Location · Usage/Rentals · Last Seen · Actions (`Label`, `Edit`) | `AssetDetail.tsx:422-601`; table `:456-597` |
| 7a | Expansion row per unit: "Child Accessories Checklist (Ticked during Packing & Return QC)" — chips from `u.childAccessories`, or a four-item hardcoded fallback | `AssetDetail.tsx:556-591`; fallback array `:565-570` |
| 7b | Edit row per unit: `UnitEditor` — an `EditableRows` form over serial · assetTag · status · location · condition · replacement, opened unlocked on mount, with a `Close` button that refuses while anything is dirty | `AssetDetail.tsx:56-122,547-554`; field specs `:23-47`; rows component `src/components/ui/EditableRows.tsx:58-162` |
| 8 | **Timeline** tab — `Card title="Gantt Timeline — Availability & Bookings"`, one lane per child unit with a bar whose text and width depend only on `u.status` | `AssetDetail.tsx:604-636` |
| 9 | **Maintenance** tab — a four-figure summary strip (Last Service · Next Due · Tickets Open · Damage Cases Open), each rendered only if its field is present, then a 7-column service-history table or a one-line gap message | `AssetDetail.tsx:639-724`; gap `:717-721` |
| 10 | **Money** tab (only when `money`) — four cards (Purchase Price · Lifetime Earnings · Recovery % · Repairs to Date) at `repeat(cols(4),…)`, then `Card title="Monthly Fleet Revenue Progression"` whose entire body is the sentence "Not available — needs the revenue engine (TODO(decision), PLAN.md §4.9)" | `AssetDetail.tsx:727-783`; revenue card `:777-781` |
| 11 | **Documents** tab — `repeat(cols(3),…)` grid of five document tiles (name · size · date), no link, no download control | `AssetDetail.tsx:786-808` |
| 12 | **Activity** tab — `Card title="Immutable Asset DNA (Activity Log)"`, one row per `activityLog` entry, or a one-line gap message | `AssetDetail.tsx:811-850`; gap `:844-848` |
| 13 | QR label modal (when `selectedUnitForQr`) — `position:fixed`, `width:400`, a white label showing `BABIN RENTALS`, a bordered box containing the `queues` icon, the serial, and `{name} · {code}`; footer `Close` and `Print Label Sheet` | `AssetDetail.tsx:853-895` |

The page does **not** use `PageBody` (`src/components/ui/PageBody.tsx:119`) — it is absent from the import block (`AssetDetail.tsx:1-16`).

### Responsive bands

**This file reads both breakpoints.** It calls `useViewport()` (`AssetDetail.tsx:158`, imported `:8`), and `BREAKPOINT = { phone: 768, desktop: 1180 }` (`src/lib/device.ts:43-51`).

| Threshold | Read where | What changes |
|---|---|---|
| 768 | `cols()` — `viewport === 'phone' ? min(n,2)` | Answer strip, Money grid and Documents grid clamp to 2 columns (`AssetDetail.tsx:159`, used at `:337,729,788`) |
| 768 | `viewport === 'phone'` at `:425` | The Units table is not rendered at all; one `<article>` card per unit replaces it, carrying serial, status, condition, location, asset tag, last seen and the same `Label` / `Edit` buttons (`:431-454`) |
| 768 | `viewport === 'phone'` at `:671` | The service-history table is replaced by one card per service event (`:673-687`) |
| 1180 | `viewport === 'tablet'` at `:457` and `:690` | Table `minWidth` drops 900 → 720 (Units) and 760 → 640 (Maintenance); both tables sit inside an `overflowX:'auto'` wrapper (`:456,689`) |
| 1180 | `cols()` — `viewport === 'tablet' ? min(n,3)` | The three grids clamp to 3 columns (`:159`) |

The QR modal reads neither band: it is a fixed `width: 400` with no `max-width` (`AssetDetail.tsx:864`), so it is wider than a 375px phone viewport.

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| The record itself (name, category, condition, children) | SEED | `PARENTS` in `src/data/inventory.ts:475-653`, matched at `AssetDetail.tsx:165`. Eight hand-typed rows, seventeen units |
| Breadcrumb chip + hero code | SEED | `asset.code ?? 'EQ000234'` (`AssetDetail.tsx:230,304`). **No `PARENTS` row carries a `code`** — a grep of `src/data/inventory.ts` for `code:` finds none — so every asset prints the literal `EQ000234` |
| Hero brand | SEED | `asset.brand ?? 'Sony'` (`AssetDetail.tsx:300`). No row carries `brand`, so RED, NISI, Aputure, DJI and Sennheiser all print "Sony" |
| Hero image | SEED | `asset.image` (`AssetDetail.tsx:270`). No row carries one; the `box` glyph always renders. The field's own comment says "No image is bundled with the seed" (`src/data/inventory.ts:428-429`) |
| Live Availability + AVAILABLE NOW | SEED (derived) | `children.filter(status==='In Stock').length ?? 3` and `children.length ?? 5` (`AssetDetail.tsx:196-197`). For the two quantity-tracked SKUs — BNC Cable 3m (`src/data/inventory.ts:604-618`) and Core SWX NANO (`:639-652`), neither of which has `children` — the fallbacks print **"3 of 5 units"** for a SKU with no unit rows |
| "In Kathmandu HQ" sub-line | SEED | Hardcoded string in the component, not in `src/data` (`AssetDetail.tsx:343`) |
| NEXT FREE tile | SEED | Hardcoded `"Tomorrow 14:00"` / `"SN-FX3-004 returning"` (`AssetDetail.tsx:348-351`). Identical for every asset; `SN-FX3-004` is not a serial in `PARENTS` |
| UTILISATION (90D) | SEED | `asset.utilizationPct` (`AssetDetail.tsx:357`). Unseeded on all eight rows, so the gap line always renders (`:365-367`). The "70 shoot days" sub-line (`:362`) is a hardcoded literal that would print beside any future value |
| RECOVERY % (both tiles) | SEED | `asset.recoveryPct` (`AssetDetail.tsx:375,756`). Unseeded on all eight rows. "Paid for itself 14 Nov 2025" (`:380`) is a hardcoded literal |
| Units table — serial, status, location, condition | SEED | `ChildRow` fields, `src/data/inventory.ts:343-379`, seeded at `:497-511,537-540,559-563,579-584,599-602,633-637` |
| Units table — Asset Tag | SEED | `u.assetTag ?? 'EQ000234-01'` (`AssetDetail.tsx:441,493`). No child carries `assetTag`, so every unit of every asset prints the same literal tag |
| Units table — Usage / Rentals, Last Seen | SEED | `u.usageHours` / `u.rentalCount` / `u.lastSeen` (`AssetDetail.tsx:521-533`). None seeded; both cells print `—`. `lastSeen` is rendered through `formatAd` (`src/lib/bs.ts:114-116`) |
| Child accessories checklist | SEED | `u.childAccessories` or a four-item array hardcoded in the component — "XLR Top Handle Unit", "NP-FZ100 Battery (x2)", "Body Cap & Sensor Protector", "BC-QZ1 Dual Charger" (`AssetDetail.tsx:565-570`). No child is seeded with `childAccessories`, so those four Sony-FX3 accessories render under **every** expanded unit of every asset, including lenses and cables |
| Timeline bars | SEED | Hardcoded in the component: `"On Rent · B-189 (Vision Prod)"` at 40% width (`AssetDetail.tsx:616-620`) and `"Reserved · B-195 (10-14 Aug)"` at 35% with a 30% offset (`:621-625`). The unit's own `booking` field (`src/data/inventory.ts:346`, seeded with real values such as `B-710`, `B-713`, `B-718`) is never read on this page |
| Maintenance summary strip | SEED | `lastServiceAd` / `nextServiceDueAd` / `maintenanceTicketsOpen` / `damageCasesOpen` (`AssetDetail.tsx:642-668`). Seeded on Sony FX6 (`src/data/inventory.ts:492-493`) and RED Komodo X (`:532-535`) only; the other six assets render an empty strip |
| Service history table | SEED | `asset.serviceHistory` (`AssetDetail.tsx:671,688,703`). Unseeded on all eight rows, so the "needs a service-ticket engine" line always renders |
| Money — Purchase Price | SEED | `asset.purchasePricePaisa` (`AssetDetail.tsx:732`), seeded on two rows only: `rupees(1350000)` (`src/data/inventory.ts:490`) and `rupees(1750000)` (`:530`). The other six print "Not on record for this asset" |
| Money — Lifetime Earnings, Repairs to Date, Monthly Revenue | SEED | `lifetimeEarningsPaisa` / `repairsToDatePaisa` (`AssetDetail.tsx:743,767`) — unseeded on all eight rows; the revenue card has no data path at all, only a static sentence (`:777-781`) |
| Money — formatting | SEED | `formatMoney` from `src/lib/money.ts:62-69` (`Rs` prefix, lakh grouping) |
| Documents tab | SEED | Five document objects hardcoded in the component with names, byte sizes and dates (`AssetDetail.tsx:789-794`). Not from `src/data`, not from `document_registry`, not from any store |
| Activity tab | SEED | `asset.activityLog` (`AssetDetail.tsx:813`). Unseeded on all eight rows, so the "needs an audit-log engine" line always renders |
| QR label modal | SEED | Serial from component state; the "QR code" is the `queues` icon inside a bordered box (`AssetDetail.tsx:878-880`) — no encoder is called |
| Unit editor drafts | SEED | `UnitEditor`'s `onSave` writes to local `useState` only (`AssetDetail.tsx:61-65`) |

No DB row and no LOCAL row reaches this page. `src/lib/mock/corpus.ts` **does** serve `products`, `product_units` and their `_v` views (`src/lib/mock/corpus.ts:414,437-438`), and `src/lib/queries/inventory.ts` exposes `listInventory` / `listUnits` for exactly this data — this page asks neither.

Invented on this page: the asset code `EQ000234` and the unit tag `EQ000234-01`; the brand "Sony" on seven of eight assets; the 3-of-5 unit ratio on the two SKUs that have no units; the "In Kathmandu HQ" location; the whole NEXT FREE tile ("Tomorrow 14:00", "SN-FX3-004 returning"); the "70 shoot days" and "Paid for itself 14 Nov 2025" sub-lines; the four child accessories under every unit; the two Timeline bookings B-189 and B-195 and their bar widths; and all five Documents entries with their sizes and dates.

## 4. Actions and writes

**No dispatch exists on this page.** `AssetDetail.tsx:1-16` imports nothing from `src/actions/`, so no capability string is checked, `checkCapability` (`src/actions/core.ts:124-218`) is never consulted, and `createAction`'s fail-closed `implemented` gate (`src/actions/core.ts:222-225`) is never reached.

Every control and where it goes:

| Control | Handler | What actually happens |
|---|---|---|
| `Print Labels` (header) | `AssetDetail.tsx:235` | Local state — opens the QR modal on the first child serial, or the literal `'SN-FX3-001'` when the asset has no children |
| `Book Asset` (header) | `AssetDetail.tsx:238` | `navigate('/rentals/new')` — the new-booking route, with no asset carried across |
| `Browse Inventory` (not-found state) | `AssetDetail.tsx:181` | `navigate('/inventory')` |
| Tab buttons ×6 | `AssetDetail.tsx:399` | `setActiveTab` |
| Row chevron | `AssetDetail.tsx:480` | `toggleUnit` — local `Set<string>` (`:187-194`) |
| `Label` (per unit, table and phone card) | `AssetDetail.tsx:446,536` | Opens the QR modal |
| `Edit` (per unit, table and phone card) | `AssetDetail.tsx:447,540` | Toggles `editingUnit`; mounts `UnitEditor` |
| `Save` (per field, inside `UnitEditor`) | `src/components/ui/EditableRows.tsx:149` → `edit.saveField` (`src/lib/edit/useEditMode.ts:160-206`) → `onSave` (`AssetDetail.tsx:61-65`) | Validates, then merges the patch into a local `useState` draft. **Nothing is persisted**; the component says so at `:118` |
| `Cancel` (per field) | `src/components/ui/EditableRows.tsx:152` | `edit.cancelField` — drops the draft keys |
| `Close` (editor) | `AssetDetail.tsx:83-91` | `edit.stopEditing()`; refuses while dirty and prints `Unsaved: …` inline |
| `Close` / `✕` (modal) | `AssetDetail.tsx:869,890` | `setSelectedUnitForQr(null)` |
| `Print Label Sheet` (modal, primary, icon `download`) | `AssetDetail.tsx:891` | `setSelectedUnitForQr(null)` — **it closes the modal and nothing else.** No print call, no blob, no window.print |

The `replacement` field is declared `immutable` with the reason "Replacement value sums to the parent SKU (§3.3). Change it on the parent record, not the unit." (`AssetDetail.tsx:46`), so `EditableRows` renders it read-only with a lock glyph in edit mode (`src/components/ui/EditableRows.tsx:77-96`).

## 5. Gates

**Route reach.** `Shell` holds the session redirect (`src/App.tsx:973-975`) and one role gate: `!canViewMoney(role) && isMoneySurface(pathname)` (`:993`). `MONEY_ROUTES` is `/finance`, `/reports`, `/admin`, `/tools/pricing`, `/tools/depreciation` (`src/data/nav.ts:147-153`) — `/inventory` is not among them. There is no `isStaff()` check on this route. **All nine roles reach this page, Client included** (`SystemRole` list at `src/lib/rbac.ts:4-14`).

**Money.** `const money = useCanViewMoney()` (`AssetDetail.tsx:138`) → `canViewMoney(user.role)` → `!MONEY_BLIND.has(role)`, where `MONEY_BLIND` is Warehouse · Technician · Driver · Client (`src/lib/moneyVisibility.ts:24-27`, `src/lib/rbac.ts:36-50`). An absent session is money-blind (`moneyVisibility.ts:26`).

Hidden from those four roles under Law 6:

- The **Money tab is absent from the tab strip**, not disabled (`AssetDetail.tsx:204`), and its pane is double-guarded by `activeTab === 'Money' && money` (`:727`) — so a stale `activeTab` cannot render it.
- The **RECOVERY %** tile in the answer strip is omitted, and the strip's column count drops with it (`:337,372`).
- Nothing else on the page prints money. `formatMoney` appears in the Money tab (`:734,745,768`), the Maintenance service-history cost cells (`:684,710`) and the editor's read-only Replacement row (`:112`).

**A gap under the same law:** the Maintenance tab's `Cost` column and the editor's `Replacement value` row are **not** money-gated. `serviceHistory` is unseeded so the cost column never renders today, but the Replacement row does — `UnitEditor` prints `formatMoney(draft.replacement)` (`AssetDetail.tsx:112`) with no `money` check, and the row list is built unconditionally (`:106-113`). A Warehouse user pressing `Edit` sees a rupee figure.

**Utilization.** `gctx = gateContext(user?.role ?? 'Client')` (`AssetDetail.tsx:140`) → `canViewUtilization(gctx)` (`:146`), which for the default surface returns `canViewMoney(c.role)` (`src/lib/fieldGating.ts:80-83`). On this page `utilization` and `money` therefore compute the **same boolean** from the same role set — the answer strip is 2 tiles or 4 tiles, never 3. Nothing sets `surface: 'floor'` here.

## 6. States drawn

| State | Present? | How |
|---|---|---|
| Loading | **None in the page.** Data is a synchronous module import (`AssetDetail.tsx:15`), so there is nothing to wait for. The only skeleton is `Shell`'s `Suspense` fallback for the lazy chunk — `<LoadingSkeleton type="card" label="Loading…" />` (`src/App.tsx:1026`) |
| Error | **None in the page.** No `ErrorBanner`, no `try/catch`, no error prop. `Shell`'s `ErrorBoundary` (`src/App.tsx:1025`) is the only backstop. Two *field-level* inline errors exist inside the editor: the unsaved-changes alert (`AssetDetail.tsx:97-102`) and `EditableRows`' per-field `role="alert"` message (`src/components/ui/EditableRows.tsx:140-145`) |
| Empty | **Yes, shared** — `EmptyState` "Equipment not found" for an unmatched `assetId` (`AssetDetail.tsx:174-185`; `src/components/ui/StateViews.tsx:34-84`). Plus four **hand-rolled** in-tab gaps, all plain `<div>`s: Maintenance (`:717-721`), Money ×4 cards + revenue card (`:738,749-751,762,770-772,778-780`), Activity (`:844-848`), and the two answer-strip tiles (`:365-367,383-385`) |
| Restricted | **None.** `RestrictedState` is never imported here, and `Shell`'s instance (`src/App.tsx:1020-1023`) cannot fire on `/inventory` because it is not a money surface. Money-blind roles simply lose the tab and the tile |

## 7. Known gaps

1. **`asset.code` is never seeded, so the route's own primary key cannot match.** The lookup is `p.code === assetId || p.children?.some(c => c.serial === assetId)` (`AssetDetail.tsx:165`), and no row in `PARENTS` carries a `code` (`src/data/inventory.ts:475-653`; the field is declared optional at `:425-426` under a `TODO(decision)` at `:420-423`). Only a **child serial** can reach this page. Consequences, each a live link in another screen:
   - `StockCheck.tsx:524` and `:567` link `/inventory/${u.assetCode || u.serial}` — `assetCode` comes from the database row, so every one of those links lands on "Equipment not found".
   - `BookingDetail.tsx:1496` links `/inventory/${it.serial}`, and B-715's seeded serial is `SN102` (`src/data/booking.ts:255`) — not a serial in `PARENTS`. Not found.
   - `src/data/equipmentIntel.ts:42-44` falls back to `row.name` when a row has neither children nor code, producing `/inventory/BNC%20Cable%203m` for the two quantity-tracked SKUs. Not found.
   - The links that do resolve are the ones built from `PARENTS`' own child serials: `rackIntel.ts:183`, `equipmentIntel.ts:120`, and the packing/handover/return/reset workspaces.

2. **`TODO(decision)` markers rendered as user-facing text.** Four gap messages print the marker and a `PLAN.md` section number on screen: `"Not available — needs the utilization engine (TODO(decision), PLAN.md §4)"` (`AssetDetail.tsx:366`), `"Not available (TODO(decision), PLAN.md §4)"` (`:384,762`), `"needs a service-ticket engine (TODO(decision), PLAN.md §4.9)"` (`:719`), `"needs the revenue engine (TODO(decision), PLAN.md §4.9)"` (`:750,779`), `"needs a maintenance-cost engine"` (`:771`), `"needs an audit-log engine"` (`:846`). The backing `TODO(decision)`s are declared at `src/data/inventory.ts:411-423` and `:454-460`.

3. **Dead initial state.** `expandedUnits` is seeded with `['SN-FX3-001','SN-FX3-002']` (`AssetDetail.tsx:160`); neither serial exists in `PARENTS`, so no row is ever pre-expanded. The same non-existent serial is the `Print Labels` fallback (`:235`), which prints a QR label for a unit that does not exist whenever a quantity-tracked SKU is open.

4. **`Print Label Sheet` is a dead button.** Primary styling, `download` icon, and an `onClick` that only calls `setSelectedUnitForQr(null)` (`AssetDetail.tsx:891`). The modal's "QR code" is the `queues` icon in a bordered square (`:878-880`) — nothing encodes the serial.

5. **The Documents tab lists five files nothing can open.** The array is hardcoded inline (`AssetDetail.tsx:789-794`), the tiles have no `onClick`, no `href` and no download control (`:795-805`), and the file sizes and dates are invented. It does not read `document_registry` or `src/data/documents.ts`.

6. **The Timeline tab shows the same two bookings for every asset.** Bar text and width are literals keyed only on `u.status` (`AssetDetail.tsx:616-625`), while the unit's real `booking` value — `B-710`, `B-713`, `B-718`, `B-716`, `B-711` in the seed — is never read. Two units of two different assets both On Rent both claim `B-189 (Vision Prod)`.

7. **The child-accessory checklist is one asset's accessory list shown under all of them** (`AssetDetail.tsx:565-570`). It is also captioned "Ticked during Packing & Return QC" while every chip renders a green `check` glyph unconditionally (`:584`) — there is no tick state, and `ca.quantity` and `ca.required` are declared (`src/data/inventory.ts:368`) and never rendered.

8. **The unit editor writes nowhere and the page never re-reads it.** `onSave` sets local state (`AssetDetail.tsx:61-65`) and its own comment says "every action under `src/actions/` is still a stub" (`:62-63`). Closing the editor (`:451,551`) discards the draft: the row below still renders `u.*` from `PARENTS`, so a saved edit vanishes on close with no message.

9. **Status and condition are free-text inputs.** `UNIT_FIELDS` validates them against `INV_STATUSES` (`AssetDetail.tsx:18-21,33-37`) and `CONDITIONS` (`:39-42`) at save time, but `EditableRows` renders every keyed row as `<input type="text">` (`src/components/ui/EditableRows.tsx:121-133`) — there is no `select` variant in `EditableRowDef` (`:30-44`). The operator types "In Stock" by hand and learns it was wrong on Save.

10. **Money leaks into the editor.** The Replacement row prints `formatMoney` with no `useCanViewMoney` check (`AssetDetail.tsx:112`), unlike every other money site on the page. Warehouse/Technician/Driver/Client can open it.

11. **A comment claims a fix the file does not contain.** `AssetDetail.tsx:537-539`: "Was `navigate('/inventory')` — a button labelled Edit that returned to the list and edited nothing. It now opens the unit's fields." True for the table (`:540`) and the phone card (`:447`) — but what it opens saves to nothing (gap 8), so the button still edits nothing durable.

12. **Contradiction with the sibling list page.** `/inventory` reads `products_v` / `product_units_v` through `src/lib/queries/inventory.ts` (per `16_inventory.md` §3) and prints `stockLabel`, real rack/shelf/bin locations and real asset codes; opening a unit from it lands on this page, which prints a different vocabulary from a different, invented source — `EQ000234`, "Shelf A1", "In Kathmandu HQ". Nothing on screen marks the transition. `MockBanner` (`src/App.tsx:1006`) marks mock **mode**, not a seeded **page**.

13. **The QR modal is not a dialog.** No `role="dialog"`, no `aria-modal`, no focus trap, no Escape handler and no backdrop click-to-close (`AssetDetail.tsx:853-895`); the fixed `width: 400` (`:864`) overflows a 375px phone, the one width where this label would actually be printed from a scanner.

14. **The row-expand chevron misses the 44px floor** the tab strip observes. It is a bare `<button>` with `border:none, background:transparent` around a 12px icon and no min height (`AssetDetail.tsx:478-484`), against `minHeight: 44` on each tab (`:405`).
