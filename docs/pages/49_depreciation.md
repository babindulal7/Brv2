# Depreciation Calculator
Route `/tools/depreciation` · `src/modules/tools/DepreciationCalculator.tsx` · 520 lines · **Status: Partial**

Mounted at `src/App.tsx:633-640` inside `<Shell crumbs={[{ label: 'Tools' }, { label: 'Depreciation' }]}>`; lazy-imported at `src/App.tsx:69`. The route passes **no** `search` prop, so `Shell` spreads nothing into `HeaderBar` (`App.tsx:1008`) and the header renders without a search placeholder — unlike `/tools` (`App.tsx:624-631`), which passes `"Search tools…"`.

## 1. What it is

A working sheet, not a record. Five fields (`DepreciationCalculator.tsx:79-83`) feed one pure function, `straightLineSchedule` in `src/data/tools.ts:330-349`, which returns a year-by-year opening/depreciation/WDV table rendered at `:266-334` with a book-value line chart at `:336-338`.

Nothing on the page is fetched and nothing is saved: the file's imports (`:1-15`) contain no query module and no `src/actions/` import, and its own header says so — "Nothing here is saved against an asset — it is a working sheet" (`:121`), repeated in the footer bar (`:345`).

The second tab, **IRD pool view**, is a stated blocker with no fields at all (`:360-392`).

## 2. What renders

Top to bottom at desktop:

1. **Page header** — `PageHeader` with `icon="chart"`, title `Depreciation`, description `Book and IRD pool views. Nothing here is saved against an asset — it is a working sheet.` (`:118-122`). `PageHeader` itself is `src/components/ui/Page.tsx:66-108`.
2. **Tab row** — a `<div role="tablist" aria-label="Depreciation method">` (`:125-128`) holding two `TabButton`s (`:421-455`): **Book view** and **IRD pool view** at tablet/desktop, shortened to **Book** and **IRD** at phone (`:126-127`). Each is a `<button role="tab" aria-selected>` with `minHeight: 44` (`:439-440`), active state painted `--btn-primary-bg`/`--btn-primary-fg` (`:444-445`).
3. **Book tab** (`tab === 'book'`, the initial state at `:77`) — a two-track CSS grid (`:133-143`):
   - **Left, `Card title="Asset"`** (`:144-245`), five `Field` blocks (`Field` at `:457-478`; uppercase `--t-th` label, red `*` when `required`, `--t-meta` hint):
     - **Asset** `<select>` (`:146-166`) — options `Not selected — enter figures by hand`, `Whole fleet` (value `__fleet__`, `:70`), then one option per priced parent (`:160-164`). Hint: `Picking a recorded asset fills its purchase price. Everything else stays yours to enter.`
     - **Purchase date** `<input type="date">`, marked required (`:168-180`), hint `No item in the master carries a purchase date, so this is never prefilled.`
     - **Purchase price** `<input inputMode="decimal" placeholder="Rs">`, required (`:182-191`).
     - **Useful life (years)** — required; a number-ish `<input inputMode="numeric">` (`:198-205`) beside an `Unavailable`-wrapped dashed chip reading **`No default from Settings`** with a `lock` glyph (`:206-225`). `Unavailable` (`src/components/ui/Unavailable.tsx:35-164`) puts the reason in `title` on hover devices and behind a 500 ms long-press popover where `hasHover` is false.
     - **Salvage value** — required, hint `Zero is a valid answer. It is not the assumed one.` (`:229-238`).
     - A method note in `--muted`: `Method: straight line — (cost − salvage) ÷ life, each step rounded to a whole rupee, with the last year absorbing the remainder…` (`:240-243`).
   - **Right column** (`:247-341`) — one of two things:
     - **Blockers card** while any reason stands (`:248-263`): `cardStyle` box, an `info` glyph, the heading **No schedule yet**, and a `<ul>` of the reasons computed at `:92-107`.
     - **Results** otherwise: `Card title="Schedule"` with `bodyStyle={{ padding: 0 }}` (`:266-334`) and `Card title="Book value curve"` (`:336-338`) wrapping `BookValueCurve` (`:403-417`), which prepends year 0 = acquisition cost to the closing values and hands them to `LineChart` (`src/components/ui/Charts.tsx:196-…`), with four y-ticks derived from the maximum point (`:406-407`).
4. **Footer note bar** — `<FooterNote extra={['Nothing on this page is written to an asset record']} />` (`:345`), implemented at `src/components/ui/Page.tsx:443-469` over `FOOTER_NOTE` (`src/data/nav.ts:428-432`).

**IRD tab** (`:130-131` → `IrdPoolView`, `:360-392`): a single `cardStyle` panel — amber `lock` tile, `<h2>` **IRD pool view is blocked on a decision**, the blocked reason string (`:383`), and a second paragraph naming what would unblock it (`:385-389`). No inputs, no chart, no table.

**Responsive bands.** The file reads `useViewport()` (`:6`, `:76`), which is `src/lib/device.ts:57-79` over `BREAKPOINT = { phone: 768, desktop: 1180 }` (`device.ts:43-51`) — so **both** 768 and 1180 are read. Three things change:

| band | tab labels (`:126-127`) | grid (`:139`) | schedule (`:267`) |
|---|---|---|---|
| phone (<768) | `Book` / `IRD` | one column | stacked card rows (`:268-288`), **no total row** |
| tablet (768–1179) | `Book view` / `IRD pool view` | one column | `<table>` in an `overflow-x: auto` box, `minWidth: 420` (`:290-332`) |
| desktop (≥1180) | `Book view` / `IRD pool view` | `minmax(320px, 380px) minmax(0, 1fr)` — inputs beside results | same table |

Nothing here is wrapped in `CollapsibleAside`/`Rail`; the comment at `:136-138` states that deliberately.

## 3. Data sources

| screen area | source kind | detail |
|---|---|---|
| Asset dropdown options | SEED | `PRICED_ASSETS = PARENTS.filter(p => p.purchasePricePaisa !== undefined)` (`DepreciationCalculator.tsx:73`) over `PARENTS`, `src/data/inventory.ts:475-653`. **Two of the eight rows qualify** — `Sony FX6 Cinema Camera` (`inventory.ts:490`) and `RED Komodo X` (`inventory.ts:530`). |
| Purchase-price prefill on select | SEED | `rupees(1350000)` = Rs 13,50,000 (`inventory.ts:490`) and `rupees(1750000)` = Rs 17,50,000 (`inventory.ts:530`), divided by 100 into the rupee input at `DepreciationCalculator.tsx:154`. |
| Purchase date | — | Never sourced. `ParentRow` (`inventory.ts:387-473`) declares no purchase-date field, so the input stays blank by construction (`:173-179`). |
| Cost · life · salvage | user input | `:85-87`, parsed by `parseMoney` (`src/lib/money.ts:76-81`) and `Number()`. |
| Schedule rows, Total, WDV, curve | computed | `straightLineSchedule` (`src/data/tools.ts:330-349`) over the four inputs; formatting through `formatMoney` (`money.ts:62-69`), rounding through `roundHalfUp` (`money.ts:37-39`). |
| `No default from Settings` chip reason | SEED | `DEPRECIATION_DEFAULTS_UNAVAILABLE_REASON`, `src/data/tools.ts:357-358` — a hand-written sentence, rendered at `:206`. |
| IRD tab body | SEED | `IRD_POOL_BLOCKED_REASON`, `src/data/tools.ts:369-370`, rendered at `:383`. |
| Footer note bar | SEED | `FOOTER_NOTE`, `src/data/nav.ts:428-432`. |
| — | DB | **None.** No table, no view, no RPC, no query file: the imports at `:1-15` include nothing from `src/lib/queries/`. |
| — | LOCAL | **None consulted.** `src/lib/mock/corpus.ts` does serve `products` and `product_units` (`corpus.ts:413-414`) and synthesises `products_v` (`corpus.ts:437`), but this page issues no request, so no corpus row reaches it. Note that corpus rows set `purchase_price: null, purchase_date: null` anyway (`corpus.ts:176`), and `src/lib/queries/inventory.ts` only ever selects `purchase_price` behind an explicit `withMoney` flag on *units* (`inventory.ts:635`, `:744`, `:827`) — never on products. |

Invented on this page: the two purchase prices in the asset picker — Rs 13,50,000 for the Sony FX6 (`src/data/inventory.ts:490`) and Rs 17,50,000 for the RED Komodo X (`src/data/inventory.ts:530`). Every other rupee figure on screen is either typed by the operator or arithmetic over what they typed; no schedule, life, salvage or date is seeded anywhere.

## 4. Actions and writes

**No dispatch. No write. No capability string.** The file imports nothing from `src/actions/` (`DepreciationCalculator.tsx:1-15`), so `createAction`'s fail-closed `implemented` check and `checkCapability` (`src/actions/core.ts:124-218`, `:220-254`) are never reached from this route. There is therefore no capability to look up in that switch, and no `ActionNotImplementedError`/`ActionPermissionError` path on this page.

Every interactive control and where its handler goes:

| control | file:line | handler | effect |
|---|---|---|---|
| `Book view` / `Book` tab button | `:126` → `:433-454` | `onClick={() => onSelect('book')}` | local `setTab` (`:77`) |
| `IRD pool view` / `IRD` tab button | `:127` → `:433-454` | `onClick={() => onSelect('ird')}` | local `setTab` |
| Asset `<select>` | `:147-165` | `onChange` at `:150-155` | `setAssetName`, and `setCost(String(row.purchasePricePaisa / 100))` **only when the chosen row has a price** |
| Purchase date `<input type="date">` | `:173-179` | `setPurchaseDate` | state only — read by nothing else in the file |
| Purchase price `<input>` | `:183-190` | `setCost` | feeds `parseMoney` (`:85`) |
| Useful life `<input>` | `:198-205` | `setLife` | feeds `Number()` (`:87`) |
| Salvage `<input>` | `:230-237` | `setSalvage` | feeds `parseMoney` (`:86`) |
| `No default from Settings` chip | `:206-225` | none — inert `<span>` inside `Unavailable` | shows a reason string; not a button |

Buttons with no handler: **none.** The only two `<button>` elements in the file are the tab buttons (`:433`), both wired. There is no Save, Export, Print or Apply-to-asset control anywhere in the file.

## 5. Gates

**Route reach.** `Shell` holds during session restore (`App.tsx:964-970`), redirects to `/login` without a session (`:973-975`), then computes `isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`App.tsx:993`). `/tools/depreciation` **is** in `MONEY_ROUTES` (`src/data/nav.ts:147-153`, entry at `:152`), and `isMoneySurface` matches `path === r || path.startsWith(r + '/')` (`nav.ts:156-159`). So:

- **Reach the page:** Owner, Admin, Manager, Coordinator, Accounts — the five `SystemRole` members not in `MONEY_BLIND`.
- **Refused:** Warehouse, Technician, Driver, Client — the `MONEY_BLIND` set (`src/lib/rbac.ts:45-50`), via `canViewMoney` (`rbac.ts:36-38`). They get `RestrictedState` (`App.tsx:1020-1023`), never the calculator.

The nav never offers the route either: `/tools` itself stays in the sidebar for every role (it is not a money route), but `ToolsLanding.tsx:130-135` drops the Depreciation card for money-blind roles, and the `Calculators` group with it (`ToolsLanding.tsx:68-76`).

**Money visibility inside the page: none.** `DepreciationCalculator.tsx` does **not** import `useCanViewMoney` (`src/lib/moneyVisibility.ts:24-27`) — the imports at `:1-15` do not include it, and no field, column or card on the page is conditioned on it. Every rupee it draws (`formatMoney` at `:283-285`, `:308-327`, `:407`, `:414`) is protected solely by the route being listed in `MONEY_ROUTES`. That is one gate, not two — see §7.

**What Law 6 hides here:** nothing *within* the page. The gate is all-or-nothing at the route.

## 6. States drawn

**None via `PageBody` or `StateViews`.** The file imports neither `src/components/ui/PageBody.tsx:119-207` nor `src/components/ui/StateViews.tsx` (`EmptyState:34`, `LoadingSkeleton:87`, `ErrorBanner:171`, `RestrictedState:213`).

- **Loading** — none in the page (there is no query to be loading). The reader sees `Shell`'s `Suspense` fallback `<LoadingSkeleton type="card" label="Loading…" />` while the lazy chunk arrives (`App.tsx:1026`).
- **Error** — none in the page. `Shell` wraps the route in `<ErrorBoundary>` (`App.tsx:1025`).
- **Empty** — **hand-rolled**, and it is the page's main state: the *No schedule yet* card at `:248-263`, driven by the blocker list at `:92-107`. It is a `cardStyle` box with an `info` glyph and a bulleted list of reasons, not `EmptyState`. Its wording is inline and persistent by design (`:249-250`).
- **Restricted** — **not in the page**; supplied by `Shell` at `App.tsx:1020-1023` for the four money-blind roles.

The IRD tab (`:360-392`) is a fifth, page-specific "blocked" panel — also hand-rolled, not one of the four shared states.

## 7. Known gaps

1. **Purchase date is marked required and is required by nothing.** The `Field` carries `required` (`:170`), painting a red `*` (`:472`), but `purchaseDate` (`:80`) appears in no blocker (`:92-107`) and in no argument to `straightLineSchedule` (`:109-112`, `src/data/tools.ts:295-302`). A complete schedule, total and chart render with the date blank. The variable is written at `:177` and read nowhere else in the file.
2. **Operator-facing copy contains the literal string `TODO(decision)`.** Both blocked reasons begin with it and both are rendered verbatim to the user: `DEPRECIATION_DEFAULTS_UNAVAILABLE_REASON` (`src/data/tools.ts:358`) reaches the chip's `title`/`aria-label` and long-press popover (`:206`, `Unavailable.tsx:109-111`, `:135-161`), and `IRD_POOL_BLOCKED_REASON` (`src/data/tools.ts:370`) is body text at `:383`. Both quote spec filenames (`11_SETTINGS.md`, `updated mds/`) at the operator.
3. **Half the screen is a stated blocker.** `IrdPoolView` (`:360-392`) renders no fields and computes nothing; the tab exists because the wireframe draws it (`:352-359`).
4. **`Whole fleet` is an option that refuses to run.** Selecting it (`:159`) short-circuits the blocker list to a single sentence and returns before any other check (`:93-99`), so the schedule side is permanently the *No schedule yet* card while it is chosen.
5. **Useful life is unbounded.** The only life checks are `Number.isFinite` and `Math.floor(lifeYears) < 1` (`:102`); the input has no `max` (`:198-205`) and `straightLineSchedule` loops `for (let year = 1; year <= life; …)` with no cap (`src/data/tools.ts:341`). Typing `999999` builds a 999,999-element array and the desktop branch emits one `<tr>` per element (`:302-317`).
6. **A fractional life is silently floored.** `5.5` passes the blocker (`Math.floor(5.5) = 5`, `:102`) and `tools.ts:331` floors it; the table then shows five years with nothing on screen saying the `.5` was dropped.
7. **Salvage equal to cost renders a table of zeros.** Both guards use strict `>` (`:105`; `src/data/tools.ts:334`), so `cost = salvage` produces a full-length schedule whose every depreciation cell is `Rs 0` and whose curve is flat. `tools.ts:326-328` states the intent that an unusable input "renders as a stated reason, never as a table of zeros" — it holds for the cases that return `[]`, not for this one.
8. **The phone layout drops the Total.** `totalCharged` (`:114`) and the closing-WDV total are only in the table's `<tfoot>` (`:319-330`), which exists solely in the non-phone branch. Below 768 (`:267-288`) the operator sees per-year cards and no total at all.
9. **The asset select never clears a prefill.** `onChange` (`:150-155`) writes `cost` only when the chosen row has a price; switching afterwards to `Not selected` or `Whole fleet` leaves the previously injected figure in **Purchase price** with no asset named beside it.
10. **The picker offers 2 of 8 catalogue rows.** `PRICED_ASSETS` (`:73`) keeps only rows carrying `purchasePricePaisa`, which is exactly two (`src/data/inventory.ts:490`, `:530`). The other six parents — including every non-camera category — cannot be selected at all, and nothing on screen says why the list is short.
11. **A retracted comment is still being cited.** `src/data/tools.ts:33-35` justifies making these fields inputs partly because `data/inventory.ts`'s "own comment says purchase records are not part of the equipment seed". `src/data/inventory.ts:748-752` records that this very sentence was one of ten filter-rail reasons found "factually wrong about the schema", and names the real columns (`products.purchase_date` 0004:102, `products_v.purchase_price` 0048:616).
12. **The date hint states a seed fact as if it were the whole story.** `:171` says "No item in the master carries a purchase date". True of `PARENTS` (`inventory.ts:387-473` declares no such field), but `products.purchase_date` exists in the schema (`inventory.ts:819-823`) and no query on this page or in `src/lib/queries/inventory.ts` selects it — the gap is an unwritten query plus null data (`src/lib/mock/corpus.ts:176`), not an absent column.
13. **Single-gate money exposure.** The page renders rupees with no `useCanViewMoney()` check of its own (absent from `:1-15`), unlike the report screens that drop their own figures (`src/data/nav.ts:135-136`). Its entire Law 6 protection is the one `MONEY_ROUTES` entry at `src/data/nav.ts:152`; removing or mistyping that line silently exposes every figure here to Warehouse, Technician, Driver and Client.
14. **The tab widget is incomplete for assistive tech.** `role="tablist"` (`:125`) and `role="tab"` + `aria-selected` (`:434-436`) are present, but no `id`/`aria-controls` pair is emitted and neither panel (`:130-343`) carries `role="tabpanel"`; there is no arrow-key handling on the tab row.
15. **No `TODO(decision)` marker in this file.** A search of `DepreciationCalculator.tsx` returns none; the two the screen shows both live in `src/data/tools.ts` (`:358`, `:370`).
