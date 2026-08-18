# Add Bundle

Route `/inventory/bundles/new` · `src/modules/inventory/AddBundle.tsx` · 2629 lines

Mounted at `src/App.tsx:331-338` inside `Shell` with `crumbs=[{label:'Inventory'},{label:'Bundles'},{label:'New Bundle'}]` and the header search placeholder `"Search inventory, category…"`. Lazy-loaded at `src/App.tsx:49`. `Shell` (`src/App.tsx:943-1040`) supplies the session redirect (`:973-975`), the sidebar/bottom bar and the money-surface guard (`:993`).

The screen is one file plus one data module:

| File | Lines | What it holds |
|---|---|---|
| `src/modules/inventory/AddBundle.tsx` | 2629 | all state, all rendering, `saveBundle`, and four local components — `Tile` (`:2040`), `Prompt` (`:2088`), `TreeRow` (`:2146`), `LineRow` (`:2278`) |
| `src/data/addBundle.ts` | 853 | the model catalogue, the ten opening draft lines, and every derivation (`totalsOf`, `pricingOf`, `availabilityOf`, `breakdownOf`, `rateDriftOf`, `duplicateFrom`) |

---

## 1. What it is

A five-section form for building one equipment bundle: details and rate, an inventory tree to pick models from, a priced line table, crew/vehicle/box suggestions, and notes (`AddBundle.tsx:923`, `:1213`, `:1361`, `:1492`, `:1619`).

It reads **no database and no local store**. Every model, rate, stock pool and template bundle it offers comes from `src/data/addBundle.ts`, which in turn pulls `ACTIVE_BUNDLES` from `src/data/bundles.ts` (`src/data/addBundle.ts:3`, `:733`). No import from `src/lib/queries/*` appears in either file.

Its one write, `createBundle`, is **not** a stub: `implemented: true` at `src/actions/inventory/createBundle.ts:26`, and `execute` calls `idempotentInsert('bundles', …)` and `idempotentInsert('bundle_items', …)` (`:49`, `:63`). The page's own comment says the opposite — see §7 gap 1.

## 2. What renders

Desktop (`viewport === 'desktop'`, ≥1180), top to bottom:

| # | Element | Evidence |
|---|---|---|
| 1 | `Banner tone="danger"` "The inventory tree does not reconcile." — a `<ul>` of `SEED_ERRORS`, rendered only when that array is non-empty | `AddBundle.tsx:824-832`; computed `src/data/addBundle.ts:812-853` |
| 2 | `PageHeader` — icon `plus`, title "New Bundle", description "Create a reusable equipment kit and set bundle pricing." | `AddBundle.tsx:835-838` |
| 3 | Header actions: `Import Template` (**disabled**, wrapped in `Unavailable`) and a `Duplicate Existing…` `<select>` listing every `ACTIVE_BUNDLES` row | `AddBundle.tsx:840-865` |
| 4 | `Banner tone="info"` "Copied from a saved bundle" with a `Dismiss` button — only after `applyDuplicate` runs | `AddBundle.tsx:869-882` |
| 5 | `Banner tone="warning"` "N component rates have changed since this bundle was priced." with a `Refresh rates` button — only when `rateDriftOf` returns rows | `AddBundle.tsx:885-911`; derivation `src/data/addBundle.ts:712-721` |
| 6 | Two-column grid `minmax(0,1fr) auto` — main column, then the rail | `AddBundle.tsx:913-920` |
| 6a | **Section 1 · Bundle Details** | `AddBundle.tsx:923-1209` |
| 6b | A nested grid `minmax(230px,286px) minmax(0,1fr)` holding **Section 2 · Search Inventory** beside the filter row + **Section 3 · Bundle Items** | `AddBundle.tsx:1212` |
| 6c | **Section 4 · Crew, Vehicle and Boxes** | `AddBundle.tsx:1492-1616` |
| 6d | **Section 5 · Notes (Optional)** — a 500-char `<textarea>` with a live counter | `AddBundle.tsx:1619-1634`; limit `:383` |
| 6e | Footer bar: `Cancel` (left), then `Save Draft` and `Create Bundle` (right) | `AddBundle.tsx:1640-1684` |
| 6f | `Banner tone="danger"` "Nothing was saved." — the persistent `saveError` | `AddBundle.tsx:1689-1693` |
| 6g | Right rail — `Rail width={318} label="Bundle summary"` holding four cards | `AddBundle.tsx:1697-1935` |
| 7 | Three modal `Prompt`s, each conditional: include-required-children (`askParent`), promote-a-child-to-a-line (`askPromote`), remove-a-required-child (`askRemoveChild`) | `AddBundle.tsx:1939-2033`; component `:2088-2143` |

Inside the sections:

| Section | Contents | Evidence |
|---|---|---|
| 1 Bundle Details | Bundle Name*, a read-only `Bundle ID` pill reading "Assigned on save", Primary Category* (`<select>` over the 16 `INVENTORY_CATEGORIES`), an Active/Inactive toggle button; then Description `<textarea>`, removable Tag chips with an `+ Add tag` `<select>`, and a Thumbnail file picker (`FileReader` → data URL, held in state only). Below a rule: the computed `Default Daily Rate (Equipment Only)` pill, an `Override on/off` toggle, and — when override is on — a Target daily rate input and a Reason input with a live `n/10 characters minimum` hint. | `AddBundle.tsx:924-1208`; categories `src/data/addBundle.ts:31-48` |
| 2 Search Inventory | An `Expand all / Collapse all` link in the header, a search box over `name + sku + brand + category`, and a 5-column table (`Model · Stock · Avail · Res · Rent`) in a 460px scroller with sticky headers. Roots only while unfiltered; a search or filter reveals child models too. Each row's name is a button that adds the model; expanded rows list children as their own add-buttons. Empty result draws "No model matches this search." plus a `Clear filters` button. | `AddBundle.tsx:1213-1298`; row component `:2146-2275`; root/child split `src/data/addBundle.ts:418-422` |
| filter row | Category, Brand, Availability (`Any / Units free now / Nothing free`) and Has Children `<select>`s, a `Clear All` button (wrapped in `Unavailable` when no filter is set), and an `N shown of M models` counter | `AddBundle.tsx:1302-1359`; predicate `:793-802` |
| 3 Bundle Items | Title `Bundle Items (n)` with `Clear All Items`. A 9-column table inside `overflow-x:auto` at `minWidth:760` — Equipment Model/Category · Required Qty · Original Rate · Discount · Bundle Rate · **Line Total** · Children · Availability · Remove — with a `<tfoot>` totalling lines, items, sum of parts, discounts, computed rate and `ready / total`. Empty state: a `package` icon and "No items in this bundle yet". | `AddBundle.tsx:1361-1475`; row component `:2278-2629` |
| 3 · per-line expansions | A `%`/`Rs` discount-kind `<select>` (switching one clears the other); above 10% effective a `Needs approval ▾` / `Approved ▾` toggle opens a row with a Reason input and an Approver button gated on `canApproveDiscount(role, pct)`. A `Children ▾` toggle opens a checkbox list with `Select all` / `Clear all`; a child that is already its own line is checkbox-`disabled` and labelled "already its own line — a child or a line, never both". | `AddBundle.tsx:2365-2426`, `:2509-2626` |
| 3 (below) | `Banner tone="danger"` "A line discount is not authorised." — one `<li>` per failing line | `AddBundle.tsx:1477-1487`; derived `:502-508` |
| 4 Crew, Vehicle and Boxes | Three columns in `repeat(auto-fit, minmax(250px,1fr))`. **Crew** — a `Not in Rate` badge, per-role headcount `<input type=number>` with a remove button, and an `+ Add a crew role` `<select>` over the six `CREW_ROLES`. **Vehicle** — a `Not in Rate` badge and a single `<select>` over the four `VEHICLE_TYPES`. **Boxes** — a read-only list of the Case/Bag lines already in the table, plus an `+ Add a case or bag` `<select>` that routes into `requestAdd`. | `AddBundle.tsx:1493-1615`; lists `src/data/addBundle.ts:429-441`, `:53` |
| rail 1 Bundle Summary | A `Donut` sized 108 with `readyItems / totalItems` in the centre, a `Legend`, then `SummaryRows` — Total Items, Equipment, Crew (not in rate), Vehicle (not in rate), Boxes / Bags, Total Weight. Total Weight renders `—`, plus a second paragraph carrying a literal `TODO(decision)` about where weights come from. | `AddBundle.tsx:1700-1734`; `breakdownOf` `src/data/addBundle.ts:680-705` |
| rail 2 Pricing Summary | `SummaryRows` — Sum of Parts, Bundle Discounts, (when override is on: Computed from lines, Override rate, Implied extra discount), Bundle Daily Rate — then a green `You Save` strip with amount and percent | `AddBundle.tsx:1737-1779`; `pricingOf` `src/data/addBundle.ts:582-597` |
| rail 3 Availability Summary | `n / m Ready` and `k blocked items` lines that swap icon and colour on `blockedItems === 0`; then either an explanatory paragraph or per-blocked cards (`Short by n`, `Held by: …`, a BS-above-AD return date) with a `View all blocked items (n)` toggle and an "Estimated bundle ready" date | `AddBundle.tsx:1782-1892`; `availabilityOf` `src/data/addBundle.ts:628-667` |
| rail 4 Quick Actions | Three `Tile`s — `Packing List` (toggles an inline model×qty list), `Export Lines` (CSV download), `Reset Draft`. The first two are wrapped in `Unavailable` when `lines.length === 0`. | `AddBundle.tsx:1894-1929`; `Tile` `:2040-2085` |

### Responsive bands

The page calls `useViewport()` once (`AddBundle.tsx:395`) and derives two booleans: `desktop` and `phone` (`:396-397`). That hook reads **both** locked breakpoints — `BREAKPOINT = { phone: 768, desktop: 1180 }` (`src/lib/device.ts:43-51`) — and **this page branches on both**:

- **1180 (`desktop`)** — the outer grid drops from `minmax(0,1fr) auto` to one column (`:916`); the Section 1 field grids drop from 4-up/3-up to `repeat(2, minmax(0,1fr))` (`:924`, `:1012`); the tree/table grid drops from `minmax(230px,286px) minmax(0,1fr)` to `1fr`, so Search Inventory stacks above Bundle Items (`:1212`); the rail stops being a `Rail` and becomes a plain stacked column (`:1934`) — the hand-rolled equivalent of `ReflowRail` (`src/components/ui/Page.tsx:349`), which keeps rail content out of a `CollapsibleAside` handle.
- **768 (`phone`)** — the two Section 1 field grids collapse to a single `1fr` column (`:924`, `:1012`), and the footer save bar becomes `position: sticky; bottom: 0` with a `--bg` backdrop (`:1648-1656`).

`useTabularLayout()` (`src/lib/device.ts:139-141`) is **not** called anywhere here, so both tables stay tables at phone width: the tree table has no `minWidth` but sits in a 460px vertical scroller (`:1243`), and Bundle Items keeps `minWidth: 760` inside `overflow-x: auto` (`:1390-1391`). Section 4's three columns reflow through CSS `repeat(auto-fit, minmax(250px,1fr))` (`:1493`) without reading a breakpoint. `Unavailable` reads `useCapability()` for hover, not a width band (`src/components/ui/Unavailable.tsx:44`).

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Inventory tree — every model row, its SKU, brand, category and its Stock/Avail/Res/Rent pools | SEED | `INVENTORY_MODELS`, 20 hand-written models, `src/data/addBundle.ts:125-404` |
| Tree child rows (`required` / `optional`) | SEED | `children` arrays on the same models, e.g. `src/data/addBundle.ts:139-145` |
| Every Original Rate, and so every Bundle Rate, Line Total, Sum of Parts, Bundle Discounts, Bundle Daily Rate and `You Save` figure | SEED | `unitRatePaisa` per model (`src/data/addBundle.ts:137`, `:158`, `:171`, …), summed by `pricingOf` (`:582-597`) |
| The ten opening Bundle Items lines, with their opening discounts (10% / Rs 400 / Rs 200) | SEED | `INITIAL_LINES`, `src/data/addBundle.ts:500-511` |
| Ready ratio, blocked list, "Held by", donut segments, "Estimated bundle ready" date | SEED | derived by `availabilityOf` (`src/data/addBundle.ts:628-667`) from the pools above; return dates are `nextFreeAd` literals, e.g. `:138`, `:172`, `:227` |
| Primary Category `<select>` (16 values) | SEED | `INVENTORY_CATEGORIES`, `src/data/addBundle.ts:31-48` |
| Tag `<select>` (8 values) | SEED | `TAG_OPTIONS`, `src/data/addBundle.ts:443-452` |
| Crew role `<select>` (6 values) and the opening `Camera Assistant ×1` | SEED | `CREW_ROLES` `src/data/addBundle.ts:429-436`; `INITIAL_CREW` `:538` |
| Vehicle `<select>` (4 values) and the opening `Pickup Van` | SEED | `VEHICLE_TYPES` `src/data/addBundle.ts:440`; `INITIAL_VEHICLE` `:539` |
| Brand filter `<select>` | SEED | `ALL_BRANDS`, derived from `INVENTORY_MODELS`, `src/data/addBundle.ts:410` |
| `Duplicate Existing…` list, and everything `applyDuplicate` writes into the form | SEED | `TEMPLATE_BUNDLES = ACTIVE_BUNDLES`, `src/data/addBundle.ts:733` ← `src/data/bundles.ts:498` ← `BUNDLES` `src/data/bundles.ts:173`; copier `src/data/addBundle.ts:756-803` |
| Pre-filled Bundle Name, Description and three tags | SEED | literals at `AddBundle.tsx:403`, `:406-408`, `:409` |
| Pre-filled override rate `18,000` | SEED | literal at `AddBundle.tsx:414` |
| `Bundle ID` field | — | the literal string "Assigned on save" (`AddBundle.tsx:947`); no number is minted here, and `:350-382` records that a module-scope `issue('BND', …)` was removed for colliding |
| Approver button label, and `canApproveDiscount` input | LOCAL / DB | `user.name` and `user.role` from `useAuth()` (`AddBundle.tsx:1436-1437`), which selects `id, full_name, primary_role` from `users` (`src/lib/auth.tsx:163-165`). In mock mode `users` **is** served (`src/lib/mock/corpus.ts:62-66`, registered `:406`). This is the only value on the page not from a `src/data/*.ts` constant. |
| BS dates beside every return date | computed | `toBs` / `formatBs` / `formatAd`, `AddBundle.tsx:248-263` |
| `bundles` / `bundle_items` (the write targets) | — | **UNSERVED by `src/lib/mock/corpus.ts`.** Neither table is in the `Store` built at `:405-423`, and neither is in the `UNSERVED` list at `:33-44` either, so mock mode neither serves them nor names them as missing. A write lands in a table `client.ts:119` creates on the fly (`store[target] ??= []`). Under the checked-in `.env.local` there is no `VITE_DATA_SOURCE`, so `IS_MOCK` is false (`src/lib/supabase.ts:42`) and the write goes to the live project. |

Invented on this page: all 20 equipment models and their SKUs, brands and categories; every stock, available, reserved, on-rent and maintenance count; every daily rate (Rs 8,000 FX3 body, Rs 4,000 per NISI prime, Rs 300 battery, …) and therefore every figure in the Pricing Summary, the table footer and the `You Save` strip; every `nextFreeAd` return date and the "Estimated bundle ready" date derived from them; the ten opening draft lines and their opening discounts; the opening crew pick and vehicle; the pre-filled bundle name, description and tags; the pre-filled Rs 18,000 override rate; and the whole `Duplicate Existing` catalogue, which is `src/data/bundles.ts`.

## 4. Actions and writes

One action, two triggers.

| Trigger | Capability declared | Action file | `implemented` | Mapped by `checkCapability`? |
|---|---|---|---|---|
| `Save Draft` (`AddBundle.tsx:1668`) and `Create Bundle` (`:1679`), both through `saveBundle(isDraft)` (`:573-628`) | `inventory.create` (`src/actions/inventory/createBundle.ts:25`) | `src/actions/inventory/createBundle.ts` | **true** (`:26`) | **Yes** — `src/actions/core.ts:166-167` → `rbac.canCreateBundle` (`src/lib/rbac.ts:186-188`) = Owner, Admin, Manager |

What actually happens on click. `saveBundle` refuses with an inline banner when `user` is null (`:574-579`), builds `items` from the lines (`:580-586`), clears `saveError`, sets `saving`, then dynamically imports `createBundle` and awaits it with a real `{ userId, role }` context (`:589-605`). `createAction` passes the `implemented` check (`src/actions/core.ts:223`), passes the context check (`:228`), and evaluates `inventory.create` (`:236-241`). For Owner/Admin/Manager that resolves `true` and `execute` runs: `issue('BND', …)` mints a code, then `idempotentInsert('bundles', …)` and one `idempotentInsert('bundle_items', …)` per item (`createBundle.ts:46-76`), then a `BUNDLE_CREATED` event (`:78-90`). Success reporting and `navigate('/inventory')` sit only on the resolved path (`AddBundle.tsx:606-619`); the rejection lands in the persistent danger banner (`:620-626`); `saving` is cleared in `finally` (`:627`).

**What the payload carries, and what it drops.** `CreateBundleInput` is `{ name, category?, items?, itemCount?, isDraft? }` (`createBundle.ts:15-21`), and each item is `{ modelId, qty, discountPct, discountReason, approvedBy }` (`AddBundle.tsx:580-586`). Everything else the form collects has no path into the action: the description, the tags, the thumbnail, the Active toggle, the notes, the computed or override daily rate, the override reason, the crew picks, the vehicle, each line's `discountKind` / `discountFixedPaisa`, and each line's `childIds`. `execute` writes `daily_rate: 0, weekly_rate: 0` and `is_active: !input.isDraft` (`createBundle.ts:55-56`, `:53`).

### Buttons and controls, and what each one does

| Control | Behaviour | Evidence |
|---|---|---|
| `Import Template` | `disabled`, no `onClick`, wrapped in `Unavailable` — "Templates are not built — there is no bundle template store in this release." | `AddBundle.tsx:841-845` |
| `Duplicate Existing…` `<select>` | real, local: `applyDuplicate` overwrites name, category, tags, lines, crew, vehicle from `TEMPLATE_BUNDLES` and reports unmatched models in an info banner | `AddBundle.tsx:846-864`, `:719-736` |
| `Refresh rates` | real, local: rewrites every line's `originalRatePaisa` from the model's current rate | `AddBundle.tsx:891-904` |
| `Expand all` / `Collapse all` | real, local: sets `treeOpen` to every root with children, or empty | `AddBundle.tsx:1218-1224` |
| Tree model / child name buttons | real, local: `requestAdd` — bumps qty if already a line, raises the promote prompt if it is a child elsewhere, raises the include-children prompt if it has children, else adds it | `AddBundle.tsx:666-682`, `:2185-2211`, `:2231-2257` |
| `Clear All` (filters) / `Clear All Items` | real, local: `clearFilters` (`:804-810`) / `setLines([])` (`:1367`); each is wrapped in `Unavailable` when there is nothing to clear | `AddBundle.tsx:1345-1355`, `:1366-1376` |
| Per-line qty, discount kind, discount value, reason, approver, remove | real, local: `patch` / `removeLine` on component state | `AddBundle.tsx:638-641`; rendered `:2349-2426`, `:2486-2506`, `:2577-2626` |
| Children checkboxes, `Select all`, `Clear all` | real, local: `toggleChild`, which raises the confirm prompt when unchecking a `required` child | `AddBundle.tsx:695-710`, `:2517-2532` |
| `Packing List` | real, local: toggles an inline `<ul>` of model×qty plus crew and vehicle marked "not in rate". Nothing is printed or stored. | `AddBundle.tsx:1896`, `:1901-1928` |
| `Export Lines` | real: builds a 12-column CSV and triggers a Blob download named `bundle-draft-lines.csv` | `AddBundle.tsx:747-785`; `downloadCsv` `:338-346` |
| `Reset Draft` | real, local: restores `INITIAL_LINES`, `INITIAL_CREW`, `INITIAL_VEHICLE` and clears the override | `AddBundle.tsx:738-745` |
| Thumbnail `Add image` | real but local only: `FileReader.readAsDataURL` into state; never uploaded, and the hint says so ("held in this browser only") | `AddBundle.tsx:1099-1114`, `:1077` |
| `Cancel` | `navigate('/inventory')` — no discard confirmation, and the form is not persisted | `AddBundle.tsx:1659` |
| `Save Draft` | blocked by `Unavailable` while `draftBlockingReason` is set (seed errors, or an empty name); otherwise dispatches | `AddBundle.tsx:535-540`, `:1661-1671` |
| `Create Bundle` | blocked by `Unavailable` while `blockingReason` is set (seed errors, empty name, no category, no equipment line, an invalid line discount, an override at ≤ Rs 0, or an override reason under 10 chars); otherwise dispatches | `AddBundle.tsx:510-525`, `:1672-1682` |

## 5. Gates

**Route.** `/inventory` is not in `MONEY_ROUTES` (`src/data/nav.ts:147-153`), so `isMoneySurface('/inventory/bundles/new')` is false and the `Shell` guard at `src/App.tsx:993` never fires. Every signed-in role reaches the route, including `Client` — the portal-only role `src/lib/auth.tsx:117-129` assigns to any authenticated identity with no `users` row. Not signed in: `Shell` redirects to `/login` (`src/App.tsx:973-975`). There is no per-role route guard.

**Money.** `useCanViewMoney()` (`src/lib/moneyVisibility.ts:24-27`) → `canViewMoney(role)` (`src/lib/rbac.ts:36-38`), false for the `MONEY_BLIND` set — `Warehouse`, `Technician`, `Driver`, `Client` (`src/lib/rbac.ts:45-50`).

**What Law 6 hides here is the entire page.** `AddBundle.tsx:476-490` returns early: a `PageHeader` plus `RestrictedState` (`src/components/ui/StateViews.tsx:213`), with the reason "Creating a bundle is not available for your role. A bundle sets prices…" and `requiredRole="Owner, Admin, Coordinator or Accounts"`. Nothing is masked field-by-field; the form is not drawn at all. So the four money-blind roles see the lock card and the other five roles (Owner, Admin, Manager, Coordinator, Accounts) see the complete form.

**Hook ordering.** The four `useMemo`s sit deliberately **above** the money gate (`:470-473`), with a comment at `:459-469` recording that a live role change had previously changed the hook count between renders.

**Discount approval, per line.** `canApproveDiscount(role, t.discountPct)` is computed inside `LineRow` from *that line's* effective percentage (`AddBundle.tsx:2317`) → `src/lib/rbac.ts:274-282`: Owner at any percentage up to the 25% cap, Admin and Manager up to 15%, nobody offline, nobody above 25%. When it is false the Approver control is replaced by a red sentence naming who to ask (`:2612-2615`).

**Write capability.** `inventory.create` → `canCreateBundle` = Owner, Admin, Manager (`src/lib/rbac.ts:186-188`), mirroring `bundles_manage` in `supabase/migrations/0035_accessory_bundle_and_ledger_masking.sql:62-65` (`Owner, Admin, Manager`). `bundle_items_all` is a wider set — `Owner, Admin, Manager, Warehouse` (`supabase/migrations/0033_fleet_bundle_and_sequence_policies.sql:85-88`).

## 6. States drawn

`PageBody` (`src/components/ui/PageBody.tsx:119`) is **not** imported. Of the four shared states only `RestrictedState` is used; the rest are hand-rolled or absent.

| State | Present? | Evidence |
|---|---|---|
| Loading | **None in the page.** No query, nothing to wait on. The only skeleton is `Shell`'s `Suspense` fallback for the lazy chunk (`src/App.tsx:1026`). The two save buttons do carry an in-flight state — `disabled={saving}` and the label "Saving…" (`AddBundle.tsx:1668-1670`, `:1679-1681`). | as cited |
| Error | **Three hand-rolled `Banner`s**, all `role="alert"` via `Banner`'s own logic (`AddBundle.tsx:291-334`, `:312`): seed reconciliation (`:824-832`), unauthorised line discount (`:1477-1487`), and the save failure "Nothing was saved." (`:1689-1693`). Plus inline per-line discount errors (`:2619-2623`). `ErrorBanner` from `StateViews` is not used. Toasts carry successes only — `useToast()` is destructured for `showSuccessToast` alone (`:399`). | as cited |
| Empty | **Two hand-rolled.** Bundle Items with no lines draws a `package` icon and "No items in this bundle yet" (`AddBundle.tsx:1379-1388`); the tree with no matches draws "No model matches this search." plus a `Clear filters` button (`:1258-1268`). Section 4's crew and boxes columns each carry a one-line empty sentence (`:1504`, `:1596`). `EmptyState` from `StateViews` is not used. | as cited |
| Restricted | **Yes** — `RestrictedState` from `StateViews`, at the money gate (`AddBundle.tsx:9`, `:484-487`). | as cited |

## 7. Known gaps

| # | Gap | Evidence |
|---|---|---|
| 1 | **The file's own save-seam comment is stale in both of its claims, and it is the comment that decides how the page describes itself.** It states that `inventory.create` "maps no rule for that string" at `actions/core.ts:109-125`, and that "Until it is ruled and the action is implemented, every press of these buttons ends in the banner below". Both are now false: `core.ts:166-167` maps `inventory.create` → `canCreateBundle`, and `createBundle.ts:26` sets `implemented: true`. An Owner pressing `Create Bundle` today does not get the banner — the dispatcher reaches `execute` and inserts rows. | comment `AddBundle.tsx:565-571`; mapping `src/actions/core.ts:166-167`; flag `src/actions/inventory/createBundle.ts:26` |
| 2 | **`bundle_items.product_id` is a `uuid` FK to `products`, and the action passes a seed model id.** `items[].modelId` is `'M-FX3-BODY'` (`src/data/addBundle.ts:127`), handed straight to the insert. The column is `product_id uuid not null references products (id)`. Nothing between the form and the insert maps a seed model to a `products` row — no such mapping exists anywhere in this page's imports. | payload `AddBundle.tsx:581`; insert `src/actions/inventory/createBundle.ts:65`; column `supabase/migrations/0004_inventory.sql:411` |
| 3 | **`bundles.category_id` is a `uuid` FK to `inventory_categories`, and the action passes the display name.** `category` is `'Camera'` (`AddBundle.tsx:404`, `:598`), inserted as `category_id: input.category \|\| null`. The column is `category_id uuid references inventory_categories (id)`. The corpus keeps a real code→uuid map for exactly this (`src/lib/mock/corpus.ts:100`); this path does not use it. | `src/actions/inventory/createBundle.ts:52`; column `supabase/migrations/0004_inventory.sql:386` |
| 4 | **The bundle's rate is computed all over this screen and then written as zero.** `CreateBundleInput` has no rate field, so `effectiveRatePaisa`, `pricing.computedRatePaisa`, the override rate and the override reason are never sent; `execute` hard-codes `daily_rate: 0, weekly_rate: 0`. The success toast then quotes `formatMoney(effectiveRatePaisa)` "per day" — a figure the row does not contain. | input shape `src/actions/inventory/createBundle.ts:15-21`; write `:55-56`; toast `AddBundle.tsx:610-613` |
| 5 | **The Active toggle is ignored.** Section 1's Status control writes `active` state (`AddBundle.tsx:405`, `:963`) which is never read again; `is_active` is derived from `isDraft` instead. So "Create Bundle" with Status set to Inactive stores `is_active: true`. | `src/actions/inventory/createBundle.ts:53`; `active` unused after `AddBundle.tsx:1007` |
| 6 | **A fixed-rupee discount reaches the action as zero, and is never re-validated.** The payload sends `l.discountPct`, which is `0` on a `discountKind: 'fixed'` line (`src/data/addBundle.ts:475`, cleared at `AddBundle.tsx:2375`), so `createBundle.validate`'s `if (item.discountPct && item.discountPct > 0)` skips it entirely. The UI validates the *effective* percentage instead (`totalsOf(l).discountPct`, `AddBundle.tsx:504`), so the two gates measure different numbers. Today the UI gate blocks the case; the server-side gate would not. | payload `AddBundle.tsx:583`; validate `src/actions/inventory/createBundle.ts:32-38` |
| 7 | **`childIds` never leave the page.** The whole child/promote/`a child or a line, never both` machinery (`AddBundle.tsx:665-710`, `:2509-2574`) produces `childIds`, and the payload does not carry them. `bundle_items` has an `is_mandatory` column the insert never sets. | payload `AddBundle.tsx:580-586`; column `supabase/migrations/0004_inventory.sql:414` |
| 8 | **Crew, vehicle, description, tags, notes and thumbnail have no write path.** Section 4 and Section 5 are collected and rendered into the rail's counts and the packing list, then dropped at save. | state `AddBundle.tsx:406-410`, `:429-432`; payload `:580-604` |
| 9 | **The bundle code is minted client-side from a clock fragment.** `issue('BND', Number(Date.now().toString().slice(-4)))` takes the last four digits of epoch milliseconds, so two saves within the same 10-second window can produce the same `BND-` number against a `unique (bundle_code)` constraint. This is the exact defect `AddBundle.tsx:350-382` documents at length and refuses to commit in the form — it names `next_document_number(p_sequence_key)` as the only safe source and asserts "Whatever eventually writes a bundle does the same". The action does not. | `src/actions/inventory/createBundle.ts:46`; constraint `supabase/migrations/0004_inventory.sql:396`; the page's own note `AddBundle.tsx:350-382` |
| 10 | **The insert asks for a read-back on a table with a column-level SELECT revoke.** `idempotentInsert` defaults `returnRow: true` and issues `.insert().select().single()` (`dataAccess.ts:88`, `:100-101`), which requests every column; `0035:67` revokes `select (daily_rate, weekly_rate) on bundles from authenticated`. `dataAccess.ts:57-76` documents this precise two-permission hazard and provides `{ returnRow: false }` for it. `createBundle` does not pass it, and it needs `dbBundle.id` for the child rows, so it cannot simply opt out. | `src/actions/inventory/createBundle.ts:49`, `:59`; `src/lib/dataAccess.ts:56-101`; revoke `supabase/migrations/0035_accessory_bundle_and_ledger_masking.sql:67` |
| 11 | **The action bypasses the Booqable source switch.** `bundles` and `bundle_items` are both in `BOOQABLE_READ_ONLY_TABLES` (`dataAccess.ts:256-261`) — "read-only from the OS … only `booqable/sync.ts`'s pull phases may write it" — and `insertViaSourceSwitch` exists to refuse exactly this call. `createBundle` calls the raw `idempotentInsert`, so the guard never runs. | `src/actions/inventory/createBundle.ts:5`, `:49`, `:63`; guard `src/lib/dataAccess.ts:256-261`, `:332-343` |
| 12 | **The `RestrictedState` names the wrong roles.** Its `requiredRole` is "Owner, Admin, Coordinator or Accounts", and its body says to ask one of those four. The write capability is Owner/Admin/**Manager** (`canCreateBundle`). Manager — the one role in the write set that the card omits — is told to ask someone else; Coordinator and Accounts are told they may create bundles, and reach the full form, but their save is refused by `ActionPermissionError` at `core.ts:239`. | `AddBundle.tsx:484-487`; rule `src/lib/rbac.ts:186-188`; throw `src/actions/core.ts:236-241` |
| 13 | `TODO(decision)` — **per-model weight has no source**, so Total Weight renders `—` and the rail prints the marker to the operator, in a card labelled `TODO(decision)`. | `AddBundle.tsx:1728-1733`; seed note `src/data/addBundle.ts:104-114`; `breakdownOf` returns `null` `src/data/addBundle.ts:693-695` |
| 14 | **`SEED_ERRORS` renders developer-worded reconciliation failures to the operator**, in a danger banner titled "The inventory tree does not reconcile." with strings like "§5.1: CAM-SONY-FX3-BODY — available 3 + reserved 1 …". It is empty while the seed is consistent, but any drift in `src/data/addBundle.ts` surfaces as an operator-facing alert *and* blocks both save buttons. | banner `AddBundle.tsx:824-832`; strings `src/data/addBundle.ts:812-853`; block `:511-512`, `:536-537` |
| 15 | **`Cancel` discards silently.** It calls `navigate('/inventory')` with no dirty check and no confirm, on a form that opens pre-filled with a name, a description, three tags and ten priced lines. `AddEquipment` on the sibling route draws a discard modal for the same act. | `AddBundle.tsx:1659`; contrast `docs/pages/17_add_equipment.md` §2 item 12 |
| 16 | **The escape key on a `Prompt` only fires when the dialog already holds focus.** `onKeyDown` is on the backdrop `<div>` (`AddBundle.tsx:2114-2116`), which has no `tabIndex` and receives no autofocus, and there is no focus trap or backdrop `onClick` — so the comment above it, "Escape and the backdrop both close it", overstates what is wired. | `AddBundle.tsx:2087`, `:2101-2117` |
| 17 | **The write targets are unserved and unnamed in mock mode.** `bundles` and `bundle_items` are absent from the corpus `Store` (`corpus.ts:405-423`) *and* absent from `UNSERVED` (`:33-44`), which is the list the mock banner shows the user. Under `VITE_DATA_SOURCE=mock` an insert silently creates the table in the overlay (`client.ts:119`, `:140`) and nothing anywhere reports that these rows have no corpus behind them. | `src/lib/mock/corpus.ts:33-44`, `:405-423`; `src/lib/mock/client.ts:117-144` |
| 18 | **`itemCount` means two different things depending on the button.** Save Draft sends `lines.length` (a count of lines); Create Bundle sends `breakdown.totalItems` (equipment + crew + vehicle + boxes, `src/data/addBundle.ts:702`). The same field on `BUNDLE_CREATED` therefore carries incomparable numbers. | `AddBundle.tsx:600`; event `src/actions/inventory/createBundle.ts:84` |
| 19 | **`execute` still carries the stub-era `console.log('[DB TX] …')`** immediately before the real insert — the exact log line `actions/core.ts:9-18` names as the marker of the fabricated-success generation. | `src/actions/inventory/createBundle.ts:47`; `src/actions/core.ts:9-18` |
| 20 | **The header docblock describes a four-section page.** It says "four numbered sections down the main column"; the file renders five (`Section n={1}`…`n={5}`), Notes being the fifth. | `AddBundle.tsx:59-60`; sections `:923`, `:1213`, `:1361`, `:1492`, `:1619` |
