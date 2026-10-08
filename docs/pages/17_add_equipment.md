# Add Equipment

Route `/inventory/new` · `src/modules/inventory/AddEquipment.tsx` · 308 lines

Mounted at `src/App.tsx:279-286` inside `Shell` with `crumbs=[{label:'Inventory'},{label:'Add Equipment'}]` and the header search placeholder `"Search equipment, serial, SKU, category…"`. The route is declared **before** `/inventory/:code` (`src/App.tsx:275-278`) so `new` is never read as an equipment code. `Shell` (`src/App.tsx:943-1040`) supplies the session redirect (`:973-975`), the sidebar/bottom bar and the money-surface guard (`:993`).

The 308-line file is a shell. Almost all of the behaviour lives in three places it imports:

| File | Lines | What it holds |
|---|---|---|
| `src/modules/inventory/components/AddEquipmentContext.tsx` | 1135 | every piece of form state, all derivations, `validate`, `handleSubmit`, and the whole right rail (`railContent`, `:704-944`) |
| `src/modules/inventory/components/EquipmentShared.tsx` | 264 | `Field`, `SectionCard`, badges, table styles, draft interfaces, `barcodePayload` |
| `src/data/addEquipment.ts` | 310 | every list the form offers, and the stated reasons for the controls that are absent |

Seven `Section*.tsx` components (`SectionIdentity` 267, `SectionStockUnits` 294, `SectionRelationships` 262, `SectionLocation` 99, `SectionPurchase` 113, `SectionPricing` 183, `SectionMaintenance` 155) each pull what they need out of `useEquipmentContext()` and render it.

---

## 1. What it is

A seven-section form for creating one equipment record. It reads **no database and no local store** — `AddEquipment.tsx` and every component and data module it reaches import nothing from `src/lib/queries/*` or `src/lib/dataAccess`; every list it offers comes from a `src/data/*.ts` constant array (import block `src/data/addEquipment.ts:1-6`).

Both submit buttons say `(not stored)` on their face (`src/modules/inventory/AddEquipment.tsx:129,132`). They run this screen's own validation pass and print a report titled "nothing was stored" (`:211`), then dispatch `createEquipment`, which is an action with no `implemented` flag (`src/actions/inventory/createEquipment.ts:12-15`) — so `actions/core.ts` throws `ActionNotImplementedError` before `validate` or `execute` (`src/actions/core.ts:223-225`).

## 2. What renders

Desktop (`viewport === 'desktop'`, ≥1180), top to bottom:

| # | Element | Evidence |
|---|---|---|
| 1 | Breadcrumb `<nav>` — `Inventory` link › `Add Equipment` › a pill reading `Asset code · Assigned on save`. Deliberately no Back button. | `AddEquipment.tsx:90-112`; pill text from `src/data/addEquipment.ts:104-107` |
| 2 | `PageHeader` — icon `box`, title "Add Equipment", one-line description | `AddEquipment.tsx:114-118`; component `src/components/ui/Page.tsx:66` |
| 3 | Header actions: `Cancel` (ghost — opens the discard modal if `isDirty`, else navigates to `/inventory`); `Preview` (**disabled**, wrapped in `Unavailable`); `Save Draft (not stored)`; `Create Equipment (not stored)` (primary) | `AddEquipment.tsx:119-135` |
| 4 | A `role="note"` card carrying `SAVE_UNAVAILABLE_REASON` — "Equipment writes are not built yet — there is no data layer behind this form." | `AddEquipment.tsx:139-152`; string `src/data/addEquipment.ts:230-231` |
| 5 | `ErrorBanner` "Nothing was created" — the last `createEquipment` rejection, rendered only when `dispatchError` is set | `AddEquipment.tsx:156` |
| 6 | `ErrorBanner` "Seed data does not reconcile" — a `<ul>` of `SEED_ERRORS`, rendered only when that array is non-empty | `AddEquipment.tsx:158-169`; computed `src/data/addEquipment.ts:264-310` |
| 7 | `ErrorBanner` "This equipment may already exist" — name + SKU + stock of the matched model, with `Open Inventory` and `Continue Anyway` buttons | `AddEquipment.tsx:172-191`; match `src/data/addEquipment.ts:147-156` |
| 8 | `ErrorBanner` "N things to fix…" — a `<ul>` of the derived `errors` map, only after a submit has been attempted | `AddEquipment.tsx:194-205` |
| 9 | Success report card (`role="status"`, green border) — "Record validated / Draft validated — nothing was stored", then `outcome.lines` | `AddEquipment.tsx:208-222`; lines built `AddEquipmentContext.tsx:649-666` |
| 10 | Three-column grid `auto minmax(0,1fr) auto` | `AddEquipment.tsx:224-231` |
| 10a | Left: sticky `SideRail width={196} label="Sections"` — the section nav. One row per `sectionDefs` entry with an ordinal, label and a status dot (red if `blocked`, green if `complete`, hollow otherwise), then an "Any order" note. Anchor links, not a stepper. | `AddEquipment.tsx:233-237`; `components/EquipmentRightRail.tsx:13-65`; defs `AddEquipmentContext.tsx:282-305` |
| 10b | Centre: the seven section cards, in order — Identity, Stock & Units, Relationships, Location, **Purchase**, **Pricing & Rental**, Maintenance & Documents. The two bold ones are omitted entirely when `money` is false. | `AddEquipment.tsx:240-265` |
| 10c | Right: `Rail width={324} label="Record summary"` holding five cards — Quick Info, Codes, Equipment Preview, Relationship Summary, Ready to Rent, Quick Actions | `AddEquipment.tsx:267-270`; `AddEquipmentContext.tsx:704-944` |
| 11 | `FooterNote` with the extra line "Assets are retired with a reason, never deleted" | `AddEquipment.tsx:276` |
| 12 | Discard `Modal` — "Discard this equipment record?", `Keep Editing` / `Discard` | `AddEquipment.tsx:278-297` |

Inside the sections:

| Section | Contents | Evidence |
|---|---|---|
| 1 Identity | Equipment Name*, Short Name, read-only Asset Code, Category* (`<select>`), Brand*, Model; a "Manufacturer differs from Brand" checkbox that reveals a Manufacturer field; a 1000-char plain `<textarea>` with a live counter and an explicit note that no formatting toolbar is drawn; a 132×100 thumbnail dropzone (5 MB) and a multi-file gallery (50 MB each) | `SectionIdentity.tsx:37-265`; limits `AddEquipmentContext.tsx:86-90` |
| 2 Stock & Units | Three tracking-mode buttons (Serialised / Quantity / Consumable). **Serialised**: a 9-column table (`# · Serial* · Asset Tag · Barcode · QR · Status · Condition · Purchase Date · remove`) inside `overflow-x:auto` at `minWidth:720`, plus `Import CSV`, `Generate Asset Tags`, `Add Unit`. **Quantity/Consumable**: Total Quantity with −/+ buttons, Reorder Level, Unit `<select>` | `SectionStockUnits.tsx:34-292`; modes `src/data/addEquipment.ts:47-51` |
| 3 Relationships | *Containment* — `Stored In` `<select>` (Case/Bag models only) and a `Contains` picker with per-item quantity rows; suggested-children chips; a stated-absence note that no container carries a capacity. *Kit membership* — read-only chips. *Compatibility* — `Compatible with` and `Requires` pickers rendering removable chips | `SectionRelationships.tsx:33-260`; capacity note `src/data/addEquipment.ts:254-255` |
| 4 Location | Warehouse* `<select>`, Storage bin* `<select>` (disabled until a warehouse is chosen, each option labelled `N of M free`), and a capacity callout that turns red when `stockCount > freeSlots` | `SectionLocation.tsx:23-97` |
| 5 Purchase | Purchase date (BS above AD), Supplier, Asset owner, Purchase price, Replacement value, Warranty months, Insurance policy, Insurance expiry, and a **disabled** Depreciation group `<select>` wrapped in `Unavailable` | `SectionPurchase.tsx:32-111` |
| 6 Pricing & Rental | Daily / Weekly / Monthly / Hourly / Weekend rates, Minimum rental days; a deposit toggle (% of replacement value ↔ fixed amount) with a live computed hint; Preparation and Cleaning minutes; three checkboxes — Rental enabled, Inspection required on return, Packing required | `SectionPricing.tsx:42-181` |
| 7 Maintenance & Documents | Inspection interval, Maintenance cycle, Service vendor; a note that running hours and expected life are deliberately not offered; a document uploader **gated on `useCanViewMoney()`**; Warehouse notes and Internal notes textareas | `SectionMaintenance.tsx:31-153`; gate `:10,73` |

### Responsive bands

The page calls `useViewport()` once (`AddEquipment.tsx:39`). That hook reads **both** locked breakpoints — `BREAKPOINT = { phone: 768, desktop: 1180 }` (`src/lib/device.ts:43-51`) — but the page branches on `viewport === 'desktop'` only, at three places:

- `AddEquipment.tsx:227` — the grid drops from `auto minmax(0,1fr) auto` to a single `1fr` column.
- `AddEquipment.tsx:233` — the sticky section-nav `SideRail` is **not rendered at all** below 1180.
- `AddEquipment.tsx:267-273` — the right rail reflows: `<Rail>` at desktop, a plain stacked column below it. This is the hand-rolled equivalent of `ReflowRail` (`src/components/ui/Page.tsx:349-371`) and avoids putting rail content behind a `CollapsibleAside` handle.

**So only the 1180 boundary changes this page. 768 is read by the hook and distinguishes nothing here — phone and tablet render identically.** The units table keeps `minWidth:720` inside a horizontal scroller at every width (`SectionStockUnits.tsx:95-96`); `useTabularLayout()` (`src/lib/device.ts:139-141`) is not called anywhere on this screen, so there is no card-row fallback below 768. Field rows reflow through CSS instead — `repeat(auto-fit, minmax(200px,1fr))` (`EquipmentShared.tsx:24-28`) — which responds to container width without reading a breakpoint. `Unavailable` reads `useCapability()` for hover (`src/components/ui/Unavailable.tsx:44`), not a width band.

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Category `<select>` (17 values) | SEED | `EQUIPMENT_CATEGORIES`, `src/data/addEquipment.ts:34-36` = `INVENTORY_CATEGORIES` (`src/data/addBundle.ts:31`) plus the literal `'Consumable'` |
| Asset Code field, breadcrumb pill, Codes card | SEED | the literal string `'Assigned on save'` — `ASSET_CODE_ON_SAVE` / `NEXT_ASSET_CODE`, `src/data/addEquipment.ts:104-107` |
| Per-unit Asset Tag column | SEED | `assetTagFor(assetCode, i)`, `src/data/addEquipment.ts:118-120` — composed from the placeholder above |
| Barcode / QR payload column | SEED | `barcodePayload()`, `EquipmentShared.tsx:252-255` — `NEXT_ASSET_CODE` joined to the typed serial |
| Tracking modes, quantity units, intake conditions | SEED | `src/data/addEquipment.ts:47-51`, `:54`, `:61` |
| `Stored In` container list | SEED | `CONTAINER_MODELS`, `src/data/addEquipment.ts:161-163` — `INVENTORY_MODELS` filtered by `BOX_CATEGORIES` (`src/data/addBundle.ts:125`, `:53`) |
| `Contains` / `Compatible with` / `Requires` lists | SEED | `ATTACHABLE_MODELS`, `src/data/addEquipment.ts:166-168` — the whole of `INVENTORY_MODELS` |
| Suggested-children chips | SEED | `suggestedChildrenFor()`, `src/data/addEquipment.ts:189-201` — parent/child edges inside `INVENTORY_MODELS` |
| Kit-membership chips ("Used in bundles") | SEED | `bundlesUsing()`, `src/data/addEquipment.ts:177-181` ← `BUNDLES`, `src/data/bundles.ts:173` |
| Duplicate-serial index (the "already belongs to X" message) | SEED | `EXISTING_SERIALS`, `src/data/addEquipment.ts:133-144` ← `PARENTS` (`src/data/inventory.ts:475`) + `UNITS` (`src/data/packing.ts:43`) |
| Duplicate-model banner (name · SKU · stock) | SEED | `existingModelMatch()`, `src/data/addEquipment.ts:147-156` ← `INVENTORY_MODELS` |
| Warehouse `<select>` | SEED | `WAREHOUSES`, `src/data/warehouse.ts:180` |
| Storage-bin `<select>` and its `used / capacity` figures | SEED | `STORAGE_LOCATIONS`, `src/data/warehouse.ts:264-274` — nine hand-written bins; the file itself says they are "a **sample, not the full layout** — 9 bins are seeded against 20 declared zones" (`:260-262`) |
| Rail "Created date" | SEED | `TODAY`, `src/lib/bs.ts:153` — a fixed `Date.UTC(2026, 6, 31)`, also the default purchase date `todayIso` (`AddEquipmentContext.tsx:92`) |
| Rail "Created by" | LOCAL / DB | `user.name` from `useAuth()` (`AddEquipmentContext.tsx:709`), which selects `id, full_name, primary_role` from `users` (`src/lib/auth.tsx:76-80`). In mock mode that table **is** served — `corpus.ts:62-66`, registered `:406`. This is the only value on the page not from a `src/data/*.ts` constant. |
| Every stock count, unit row, preview count, Ready-to-Rent gate, deposit figure | operator input | derived in-memory from what is typed; nothing is fetched. `products` and `product_units` **are** served by `src/lib/mock/corpus.ts` (`:156`, `:188`, `:413-414`) — this page queries neither. |

Invented on this page: the 17 category names, the whole model catalogue behind the container / contains / compatible / requires pickers and the duplicate-model banner (name, SKU, brand, stock), the existing-serial index used to say "already belongs to", the bundle names shown as kit membership, the three warehouses, the nine storage bins and every one of their `capacity` / `used` numbers, and the fixed operating date of 31 July 2026 shown as "Created date" and pre-filled as every unit's purchase date.

## 4. Actions and writes

One dispatch on the whole page.

| Trigger | Capability declared | Action file | `implemented` | Mapped by `checkCapability`? |
|---|---|---|---|---|
| `Save Draft (not stored)` (`AddEquipment.tsx:128`) and `Create Equipment (not stored)` (`:131`), both through `submit(mode)` (`:67-84`) | `inventory.create` (`src/actions/inventory/createEquipment.ts:14`) | `src/actions/inventory/createEquipment.ts` | **false** — the field is absent, and `ActionConfig.implemented` defaults to `false` (`src/actions/core.ts:89`) | **Yes** — `src/actions/core.ts:166-167` → `rbac.canCreateBundle` (`src/lib/rbac.ts:186-188`) = Owner, Admin, Manager |

What actually happens on click: `submit()` calls `handleSubmit(mode)` (this screen's validation pass), then dynamically imports `createEquipment` and calls it with `{ name: name || 'New Equipment', isDraft: mode === 'draft' }` and `{ userId: user.id, role: user.role }` (`AddEquipment.tsx:76-79`). `createAction` throws `ActionNotImplementedError` at `src/actions/core.ts:223-225` — **before** the context check, the permission check, `validate` and `execute`. The `.catch` at `AddEquipment.tsx:80-83` logs it and puts the message in the persistent "Nothing was created" banner. So the write renders, dispatches `CREATE_EQUIPMENT`, and the action is a stub (`core.ts` fails it closed); the mapped capability is never reached.

Only two fields of the seven-section form are passed to the action. `CreateEquipmentInput` also accepts `category` and `quantity` (`createEquipment.ts:5-10`) and neither is supplied; serials, units, location, relationships, pricing, purchase, documents and notes have no path into it at all.

### Buttons and controls with no write path

| Control | Behaviour | Evidence |
|---|---|---|
| `Preview` | `disabled`, no `onClick`, wrapped in `Unavailable` with `PREVIEW_UNAVAILABLE_REASON` | `AddEquipment.tsx:123-127`; reason `src/data/addEquipment.ts:233-234` |
| `Print Labels — not built` | not a button — an inert `<span>` inside `Unavailable` | `AddEquipmentContext.tsx:903-908` |
| `Packing List Preview — needs a saved record` | not a button — an inert `<span>` inside `Unavailable` | `AddEquipmentContext.tsx:909-914` |
| Depreciation group | `<select disabled>` inside `Unavailable`, single option "Not defined yet — §16" | `SectionPurchase.tsx:103-109` |
| `Generate Asset Tags` (rail and section header) | real: rewrites every unit's `assetTag` in state and fires a success toast | `AddEquipmentContext.tsx:417-420` |
| `Check Duplicates` | real: scans in-memory against `EXISTING_SERIALS` + `existingModelMatch`, writes `duplicateReport` | `AddEquipmentContext.tsx:518-529` |
| `Copy Asset Code` | real: `navigator.clipboard.writeText(assetCode)` — copies the string `Assigned on save` | `AddEquipmentContext.tsx:531-536` |
| `Import CSV` | real: `FileReader`, first CSV column, header rows dropped, merged into `units` state | `AddEquipmentContext.tsx:423-458` |
| Image / document attach | real but local only: `URL.createObjectURL`, type and size checks, revoked on unmount | `AddEquipmentContext.tsx:460-506`, `:331-338` |
| `Open Inventory` / `Discard` | `navigate('/inventory')` | `AddEquipment.tsx:181-183`, `:288-290` |

## 5. Gates

**Route.** `/inventory` is not in `MONEY_ROUTES` (`src/data/nav.ts:147-153`), so `isMoneySurface('/inventory/new')` is false and the `Shell` guard at `src/App.tsx:993` never fires. Every signed-in role reaches this page. There is no per-role guard inside the component. That includes `Client`, the portal-only role — which `src/lib/auth.tsx:117-129` assigns to any authenticated identity carrying no `users` row. Not signed in: `Shell` redirects to `/login` (`src/App.tsx:973-975`).

**Money.** `useCanViewMoney()` (`src/lib/moneyVisibility.ts:24-27`) → `canViewMoney(role)` (`src/lib/rbac.ts:36-38`), false for the `MONEY_BLIND` set — `Warehouse`, `Technician`, `Driver`, `Client` (`src/lib/rbac.ts:45-50`).

What Law 6 removes when `money` is false:

| Hidden | Evidence |
|---|---|
| The whole **Purchase** section — omitted from the tree, not disabled | `AddEquipment.tsx:253-256` |
| The whole **Pricing & Rental** section | `AddEquipment.tsx:258-261` |
| Their two entries in the section nav, so the remaining five renumber 1–5 | `AddEquipmentContext.tsx:289-292`, ordinal from array index `EquipmentRightRail.tsx:42` |
| The **Documents** uploader in section 7, replaced by a line naming who can attach them. The comment states this is the money gate standing in because `lib/rbac` has no document capability. | `SectionMaintenance.tsx:8-10,73,123-131` |
| Two of the five Ready-to-Rent rows ("Daily rate set", "Replacement value set") | `AddEquipmentContext.tsx:373-376` |
| Any rentability verdict — `rentable = money && …`, so a money-blind session is told "Pricing pending — Owner or Admin" instead of "all gates clear" | `AddEquipmentContext.tsx:387`, `:834-838`, `:842-843` |
| The validation report's publish line reads "Would publish as Draft — pricing is set by Owner or Admin" | `AddEquipmentContext.tsx:659-660` |
| All money computation is skipped, not masked: `replacementPaisa`, `dailyPaisa` and `depositPaisa` are `null` when `money` is false | `AddEquipmentContext.tsx:197-206` |
| `isDirty` ignores the money fields for a money-blind session | `AddEquipmentContext.tsx:358` |

Note the asymmetry: the money gate governs whether the page **shows** rates and documents. It does not govern whether the page may create equipment — that is `inventory.create` → Owner/Admin/Manager, which is never evaluated because the action is a stub.

## 6. States drawn

`PageBody` is **not used** — `AddEquipment.tsx` does not import it. All four states are hand-rolled or absent:

| State | Present? | Evidence |
|---|---|---|
| Loading | **None in the page.** The only skeleton is `Shell`'s `Suspense` fallback for the lazy chunk (`src/App.tsx:1026`). There is no query to wait on. | `AddEquipment.tsx` (no `LoadingSkeleton` import) |
| Error | **Four hand-rolled `ErrorBanner`s** from `StateViews` (`src/components/ui/StateViews.tsx:171-210`) — dispatch rejection (`:156`), seed reconciliation (`:158`), duplicate model (`:172`), validation summary (`:194`). Plus inline per-field errors via `Field` (`EquipmentShared.tsx:59-63`) and per-unit serial errors (`SectionStockUnits.tsx:133-138`). All inline and persistent; toasts carry successes only (`AddEquipmentContext.tsx:419,455,528,534`). | as cited |
| Empty | **None**, and correct — a create form has nothing to be empty of. The rail's Preview card renders "Untitled equipment" and "no serial yet" placeholders in place of an empty state (`AddEquipmentContext.tsx:752`, `:763`). | — |
| Restricted | **None in the page.** `RestrictedState` is reachable only through the `Shell` guard (`src/App.tsx:1020-1023`), which cannot fire for this route. | — |

## 7. Known gaps

| # | Gap | Evidence |
|---|---|---|
| 1 | **The primary action is a stub.** `createEquipment` sets no `implemented` flag, so `core.ts` throws `ActionNotImplementedError` before anything runs. Its `execute` body would `console.log('[DB TX] …')` and return a fabricated `equipmentId` if it were ever reached — it writes nothing. | `src/actions/inventory/createEquipment.ts:12-51`; default `src/actions/core.ts:89`; throw `:223-225` |
| 2 | **The dispatch fires even when validation failed.** `handleSubmit(mode)` returns `void` and `submit()` does not check the result, so an invalid form still calls `createEquipment`. Today the outcome is the same "Nothing was created" banner either way, which means the banner blames the missing data layer for a failure whose real cause was the operator's input. The moment the action is implemented, this dispatches an invalid record. | `AddEquipment.tsx:67-84`; `AddEquipmentContext.tsx:625-647` |
| 3 | **Only `name` and `isDraft` are dispatched.** Serials, units, category, quantity, warehouse, bin, relationships, rates, deposit, purchase figures, documents and notes have no path into the action. Even fully implemented, this write would drop the entire form. | `AddEquipment.tsx:78`; input shape `src/actions/inventory/createEquipment.ts:5-10` |
| 4 | **`errors.category` and `errors.brand` are read but never written.** `sectionDefs` marks Identity blocked on them (`:284`) and `SectionIdentity` renders both fields `required` with `error={errors.category}` / `errors.brand` — but `validate()` never sets either key. Both red asterisks are decoration; the section dot can never turn red for them. | keys read `AddEquipmentContext.tsx:284`, `SectionIdentity.tsx:63,69,79,86`; `validate` sets only `name`, `manufacturer`, `stock`, `reorder`, `relationships`, `location`, `purchasePrice`, `replacementValue`, `dailyRate`, `deposit` — `AddEquipmentContext.tsx:540-623` |
| 5 | **Asset tags render as `Assigned on save-01`.** `assetTagFor` composes from the placeholder Asset Code, so every Asset Tag cell, the barcode payload and the `Generate Asset Tags` toast print that string. `data/addEquipment.ts` documents the placeholder as deliberate but does not address what it does downstream. | `src/data/addEquipment.ts:118-120`; rendered `SectionStockUnits.tsx:141,145`; toast `AddEquipmentContext.tsx:419`; payload `EquipmentShared.tsx:252-255` |
| 6 | **`Copy Asset Code` copies the literal words "Assigned on save"** to the clipboard and toasts "Asset code copied · Assigned on save". | `AddEquipmentContext.tsx:531-536` |
| 7 | `TODO(decision)` — **the Asset Code format is unresolved.** `createEquipment.execute` states that `data/numbering.ts` (`EQ-CAT-NNNNNN`), `lib/seed.ts` and `products_asset_code_format` (`EQ000234`) disagree on the shape, and refuses to pick one. `corpus.ts` independently mints `EQ` + six digits (`:157`) — a third authority. | `src/actions/inventory/createEquipment.ts:21-28`; `src/lib/mock/corpus.ts:157` |
| 8 | `TODO(decision)` — **depreciation groups are undefined**, so the control is disabled and states the gap. | `src/data/addEquipment.ts:247-248`; rendered `SectionPurchase.tsx:103-109` |
| 9 | `TODO(decision)` — **no container in the item master carries a capacity**, so the over-capacity warning for containment cannot be computed. The text is rendered inline to the operator. | `src/data/addEquipment.ts:254-255`; rendered `SectionRelationships.tsx:162-165` |
| 10 | **Bin over-capacity warns but never blocks.** `overCapacity` drives a red callout in section 4, and `validate()` has no corresponding check — Create succeeds with 20 units assigned to a bin with 3 free slots. | warning `SectionLocation.tsx:71-96`; derived `AddEquipmentContext.tsx:258-259`; absent from `validate` `AddEquipmentContext.tsx:540-623` |
| 11 | **The 44px touch floor is broken in the two densest controls.** `inputStyle()` sets `minHeight:44` (`EquipmentShared.tsx:15`), which `Page.tsx:113-118` names as the Law-15 lever, but the units table overrides it to `height:31` on the serial input, condition select and date input, and the contained-item quantity input to `height:28`. | `SectionStockUnits.tsx:131,163,181`; `SectionRelationships.tsx:108` |
| 12 | **No responsive treatment below 768.** The units table stays a 720px-wide table in a horizontal scroller at phone width; `useTabularLayout()` — the helper written for exactly this ("below 768 a wide table is not a table — it is a horizontal scrollbar hiding the columns that matter") — is not called. | `SectionStockUnits.tsx:95-96`; helper `src/lib/device.ts:132-141` |
| 13 | **The section nav disappears entirely below 1180** rather than reflowing, so a tablet or phone session has no jump list and no per-section completion dots — the one affordance that tells an operator which of seven sections still has a problem. The right rail beside it does reflow. | `AddEquipment.tsx:233-237` vs `:267-273` |
| 14 | **"Created date" is a frozen seed date.** The rail prints `TODAY` = 31 July 2026 and pre-fills it as every unit's purchase date, on a build whose working date is later. | `src/lib/bs.ts:150-153`; rail `AddEquipmentContext.tsx:671,710`; default `AddEquipmentContext.tsx:92,123` |
| 15 | **The `!user` branch at `AddEquipment.tsx:69-74` is unreachable.** `Shell` returns `<Navigate to="/login">` before rendering children when `user` is null, so the "You are not signed in" banner cannot render. Harmless, but it is defence that is already covered upstream. | `AddEquipment.tsx:69-74`; `src/App.tsx:973-975` |
| 16 | **Contradiction with `/inventory`.** The Inventory list reads `products_v` and `product_units_v` through `src/lib/queries/inventory.ts` and paginates server-side; this page offers a *different* catalogue — the seeded `INVENTORY_MODELS` array — in its container, contains, compatibility and duplicate-detection controls. The duplicate check therefore answers "does this serial exist?" against `src/data/inventory.ts` + `src/data/packing.ts`, not against the rows `/inventory` displays. Nothing on screen marks the two as different universes. | this page `src/data/addEquipment.ts:1-6`; the list's queries cited in `docs/pages/16_inventory.md` §1 |
| 17 | **Every field is optional for a Draft and almost every field is optional for Create.** `validate()` gates Create on exactly two things — a serial per unit and warehouse + bin. Name, category and brand do not block. The `required` asterisks on Category and Brand (gap 4) therefore misdescribe the rule as well as failing to enforce it. | `AddEquipmentContext.tsx:543-557`, `:584`, `:601-603` |
| 18 | **`SEED_ERRORS` renders reconciliation failures to the operator**, in an `ErrorBanner` titled "Seed data does not reconcile", worded for a developer ("§3: model X has category Y, which the Add Equipment list does not offer"). It is empty when the seed is consistent, but any drift in `src/data/addBundle.ts` surfaces as an operator-facing error. | `src/data/addEquipment.ts:264-310`; rendered `AddEquipment.tsx:158-169` |
