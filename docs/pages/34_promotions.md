# Promotions & Discounts

Route `/reports/promotions` (`src/App.tsx:474-481`, lazy import `src/App.tsx:38`) · component `src/modules/reports/PromotionsReports.tsx` · 240 lines.

## 1. What it is

A read-only campaign report: four KPI cards, a net-impact block, two tables and three rail lists, all printed from one constant module — `src/data/promotionsReports.ts` (imported at `PromotionsReports.tsx:9`) — plus one number typed into the component itself (`totalIssued = 1520 // from spec`, `PromotionsReports.tsx:78`).

It queries nothing. The component's only data import is `../../data/promotionsReports` (`:9`); there is no `lib/queries/*` import, no `useList`, and no import from `src/actions/` anywhere in the file (`:1-9`).

The one behaviour that does real work is export: `ReportToolbar` is passed a `csv` spec (`:93`) whose `build` serialises the same constants (`:23-54`).

## 2. What renders

Top to bottom at desktop (≥ 1180):

1. **`PageHeader`** — icon `box`, title "Promotions & Discounts", description "Analyze campaign performance and discount ROI." (`:82-86`). No actions.
2. **`ReportToolbar`** (`:93`, component `src/components/ui/ReportToolbar.tsx:432-627`) — only `title` and `csv` are passed, so by that component's "a control renders only when the page gave it something real to do" rule (`ReportToolbar.tsx:398-427`) the bar draws **no date range, no branch select, no compare select** — just right-aligned `[CSV]` (`ReportToolbar.tsx:608-612`) and `[Print]` (`:615-617`). The comment at `PromotionsReports.tsx:88-92` states the omission is deliberate: the figures are single totals with no period dimension.
3. **Key-figures grid**, `aria-label="Key figures"`, `repeat(bandCols(4), minmax(0,1fr))` (`:95`). Four hand-rolled `PromoKpiCard`s (`:11-20`), each a label + a 24px figure + a note line:
   - **Promotion Revenue** = `formatMoney(METRICS.promotionRevenue)`, note "Generated from 1520 issued coupons" (`:96-102`).
   - **Discounts Given** = `formatMoney(METRICS.discountsGiven)`, note "7.14x Return on Promotion (ROP)" (`:103-109`).
   - **Net Impact** = `formatMoney(IMPACT.net)`, note "From Rs 10,00,000 gained" (`:110-116`).
   - **Redemption Rate** = "55.4%", note "Of total issued" (`:117-123`).
4. **`ReflowRail`** (`:126-237`, component `src/components/ui/Page.tsx:349-371`) — **the whole body of the report is passed into it**, both the content column and a nested `SideRail`. See §7 gap 8 for what that does at desktop.
   - **Content column** (`:127-200`), a flex column of three `cardStyle` sections:
     - **"Discount Impact Must Net Out"** — three inline figures, Discounts Given (danger), Revenue Gained (success), Net Impact (primary) (`:128-144`).
     - **"Most Used Coupons"** — a 6-column `<table>`: ID · Code · Issued · Redeemed · Expiry · ROP, three rows (`:146-172`).
     - **"Bundle Discount Analysis"** — a 5-column `<table>`: Bundle · Bookings Generated · Bundle Revenue · Discount (negated, danger) · ROP, three rows (`:174-198`).
   - **`SideRail`** (`:202-236`, component `Page.tsx:400-416`) with three `cardStyle` sections:
     - **"Coupon Status"** — `Donut` + `Legend` over `COUPON_DONUT` (`:203-211`, `src/components/ui/Charts.tsx:81-151` and `:154-192`).
     - **"Usage by Client Type"** — four label/count rows (`:213-223`).
     - **"Discount Types"** — four label/amount rows (`:225-235`).

No `FooterNote` (`Page.tsx:443`) is rendered, unlike the sibling report screens (e.g. `ExpenseReports.tsx:630`).

**Responsive bands the file actually reads — both 768 and 1180, all of it indirectly.** The file contains no width literal; three of its imports resolve to `useViewport()` (`src/lib/device.ts:57-79`, breakpoints `phone: 768`, `desktop: 1180` at `device.ts:43`):

- `useBandColumns()` (`:59`, applied at `:95`) → `Page.tsx:391-394`: the KPI grid is **2 columns below 768**, **3 between 768 and 1179**, **4 at ≥ 1180**.
- `ReflowRail` (`:126`) → `Page.tsx:349-371`: at ≥ 1180 it wraps its children in `Rail` → `CollapsibleAside side="right" width={288}` (`Page.tsx:315-331`, `src/components/ui/CollapsibleAside.tsx:155-184`); below 1180 the children become a plain stacked column.
- `SideRail` (`:202`) → `Page.tsx:400-416` → `CollapsibleAside side="left"`, which **defaults to collapsed at phone and tablet** (`CollapsibleAside.tsx:37`) — so below 1180 the three rail cards sit behind a 44px expand handle (`CollapsibleAside.tsx:41-99`).

`useRailGridColumns()` (`Page.tsx:382-384`) is **not** imported, so there is no `content | rail` grid on this page at all — the outer container is a plain flex column (`:81`). `useTabularLayout()` (`device.ts:139-141`) is not imported either, so both tables stay `<table>` at every width. Nothing reads `useCapability()`.

## 3. Data sources

| Screen area | Source kind | Detail |
|---|---|---|
| Promotion Revenue, Discounts Given, Redemption Rate KPIs | **SEED** | `METRICS` — `rupees(2486500)`, `rupees(348200)`, `55.4` (`src/data/promotionsReports.ts:5-9`), rendered at `PromotionsReports.tsx:98`, `:106`, `:119`. |
| "7.14x Return on Promotion (ROP)" note | **SEED** | `RETURN_ON_PROMOTION = 7.14`, a stored constant with the division written in a comment, not computed (`promotionsReports.ts:11-12`), rendered at `:108`. |
| Net Impact KPI + "Discount Impact Must Net Out" card (Given / Gained / Net) | **SEED** | `IMPACT` (`promotionsReports.ts:18-22`), rendered at `:112-115` and `:133-141`. `gained: rupees(1000000)` is annotated in its own source as an "example number" (`promotionsReports.ts:20`). |
| "Generated from 1520 issued coupons" note, donut centre, CSV "Coupons issued" row | **SEED** | `const totalIssued = 1520 // from spec` — a literal in the component, not in the data module (`PromotionsReports.tsx:78`), used at `:101`, `:206`, `:32`. |
| Most Used Coupons table (id, code, issued, redeemed, expiry, rop) | **SEED** | `TOP_COUPONS`, 3 literal objects (`promotionsReports.ts:37-41`), rendered at `:160-169`. |
| Bundle Discount Analysis table (name, bookings, revenue, discount, rop) | **SEED** | `BUNDLE_ANALYSIS`, 3 literal objects (`promotionsReports.ts:43-47`), rendered at `:187-195`. |
| Coupon Status donut + legend | **SEED** | `COUPON_DONUT`, 3 slices with hand-written `percent` strings (`promotionsReports.ts:24-28`), rendered at `:206-208`. |
| Usage by Client Type | **SEED** | `CLIENT_USAGE`, 4 literal rows (`promotionsReports.ts:30-35`), rendered at `:216-221`. |
| Discount Types | **SEED** | `DISCOUNT_TYPES`, 4 slices whose `value` is paisa and whose `display`/`percent` are pre-written strings (`promotionsReports.ts:49-54`), rendered at `:228-233` — the page reformats `value` and ignores both written fields. |
| CSV export body | **SEED** | The same eight constants plus `totalIssued`, serialised at `PromotionsReports.tsx:23-54`. |
| — | **DB** | **None.** No `src/lib/queries/*` import, no RPC, no view. `booking_discounts` — the table `src/lib/bookingQuery.ts:396-448` calls the sole home of booking-level discount — is never read here. |
| — | **LOCAL** | **None, and nothing to serve.** `src/lib/mock/corpus.ts:405-423` builds 17 tables; `booking_discounts` and any coupon/promotion table are not among them and are not even in the declared `UNSERVED` list (`corpus.ts:33-44`), so mock mode would not surface their absence in its banner either. |

Invented on this page: every figure — promotion revenue, discounts given, redemption rate, the 7.14x ROP, revenue gained and net impact, the 1520 issued-coupon count, the three coupon rows and their per-row ROP multiples, the three bundle rows, the redeemed/expired/unused split and its percentages, the four client-type counts, and the four discount-type amounts and percentages.

## 4. Actions and writes

**No dispatches.** The file imports nothing from `src/actions/` (`PromotionsReports.tsx:1-9`), so no capability string is submitted to `checkCapability` (`src/actions/core.ts:124-218`) from this route and there is no `implemented: true/false` to report.

Every control on the page has a handler:

| Control | Where | Handler |
|---|---|---|
| `[CSV]` | `ReportToolbar.tsx:608-612` | `exportCsv` (`ReportToolbar.tsx:502-516`) → `buildReportCsv` (`:300-341`) with the provenance header, quoting via `csvCell` (`src/lib/csv.ts:155-158`), filename `promotions-<day>.csv` (`:344-351`), downloaded through a `Blob` + anchor click (`:353-361`). Real; it writes the constants listed in §3. |
| `[Print]` | `ReportToolbar.tsx:615-617` | `window.print()`. |
| Rail collapse / expand handles | `CollapsibleAside.tsx:65-97`, `:165-169` | `toggle` from `useCollapsed`, persisted to `localStorage` (`src/lib/collapse.ts:17-27`). |

**Buttons with no handler: none.** Nothing on this page claims a write.

## 5. Gates

- **Route.** `/reports/promotions` is inside `MONEY_ROUTES` via the `/reports` prefix (`src/data/nav.ts:147-159`), and `Shell` refuses the whole module for a money-blind role: `const isForbidden = !canViewMoney(user.role) && isMoneySurface(pathname)` (`src/App.tsx:993`), rendering `RestrictedState` instead of the children (`App.tsx:1020-1023`). Unauthenticated users are redirected to `/login` first (`App.tsx:973-975`).
- **Money visibility.** `useCanViewMoney()` (`PromotionsReports.tsx:60`, `src/lib/moneyVisibility.ts:24-27`) → `canViewMoney` (`src/lib/rbac.ts:36-38`), whose `MONEY_BLIND` set is Warehouse, Technician, Driver, Client (`rbac.ts:45-50`).
- **Roles that reach the content:** Owner, Admin, Manager, Coordinator, Accounts (the business 9 minus the four money-blind roles; `rbac.ts:1-14`, `:45-50`).
- **What Law 6 hides:** the entire page. The gate is an early return at `PromotionsReports.tsx:63-76`, so a money-blind role loses not only the rupee figures but also the non-money counts — coupons issued/redeemed/expired, client-type usage, bookings generated. Only the `PageHeader` and the restricted panel remain (`:65-74`).

## 6. States drawn

| State | Present? | How |
|---|---|---|
| Loading | **none** | Nothing async: the constants are module imports (`:9`). No `loading` prop is ever passed. |
| Error | **none** | No query, no `ErrorBanner`, no `error` prop. |
| Empty | **none** | The four arrays are non-empty literals; a `.map` over an empty one (`:160`, `:187`, `:216`, `:228`) would draw an empty `<tbody>`/blank card with no empty state. |
| Restricted | **yes, via `PageBody`** | `restricted` + `restrictedReason` + `restrictedRequiredRole` (`:66-73`) → `RestrictedState` (`src/components/ui/PageBody.tsx:143-150`, `src/components/ui/StateViews.tsx:213-280`). |

`PageBody` is used **only** for the restricted branch — the happy path never renders through it (`children={null}` at `:72`, and lines 80-238 return their own tree).

## 7. Known gaps

1. **`TODO(decision)` markers in this file: none.** The whole page is seed with no marker saying so; the only in-file admission is `// from spec` at `:78` and the "example number" comment in the data module (`src/data/promotionsReports.ts:20`).
2. **`totalIssued` is a literal in the component** (`:78`), not in the data module, and does not reconcile with the table beside it: `TOP_COUPONS` sums to 1200 issued / 720 redeemed (`promotionsReports.ts:38-40`) against the headline 1520 / 842 (`:78`, `promotionsReports.ts:25`). The table is headed "Most Used Coupons" (`:147`), so a subset is plausible — but nothing on screen or in the CSV says it is a subset (`:34-36`).
3. **Net Impact is built on an admitted placeholder.** `IMPACT.gained = rupees(1000000)` carries the comment "example number, since the spec says 'additional bookings × average value'" (`promotionsReports.ts:20`); it drives the Net Impact KPI (`:112-115`), the impact card (`:137`) and two CSV rows (`:29-30`) with no marking of any kind.
4. **`RETURN_ON_PROMOTION` and every `rop` are typed, not derived** (`promotionsReports.ts:12`, `:38-46`). The page prints them as `{x}x` next to the revenue and discount figures they claim to be a ratio of (`:108`, `:167`, `:193`), so a change to either input leaves the multiple stale with nothing to catch it.
5. **The donut's centre label and value are swapped.** `Donut` renders `centreLabel` in the small `--text2` slot and `centreValue` as the bold `.figure` (`Charts.tsx:136-141`); the page passes `centreLabel={String(totalIssued)} centreValue="Issued"` (`:206`), so the count renders as the caption and the word "Issued" renders as the figure.
6. **`note.tone: 'neutral'` resolves to an undefined custom property.** `PromoKpiCard` sets `color: var(--${note.tone})` (`:17`); `--neutral` is not defined in `src/styles/theme.css` — only `--st-neutral-bg` / `--st-neutral-fg` exist (`theme.css:129`, `:255`) — so on the two cards that pass it (`:101`, `:122`) the declaration is invalid and the note inherits the card's text colour instead of a muted one.
7. **`PromoKpiCard`'s own layout styles are applied to the wrong element, and the card is padded twice.** `Card` puts `style` on the outer `<section>` and always wraps children in its own `padding: 14` div (`Page.tsx:44-60`); the caller passes `padding: 'var(--sp-md)', display:'flex', flexDirection:'column', gap:'var(--sp-xs)'` (`:14`). Result: outer padding + inner 14px, and the `gap` spaces a single child, so the label/value/note gap it asks for does nothing. The four `accent`-`-bg` tokens (`--primary-bg`, `--warning-bg`, `--success-bg`, `--progress-bg`) are also undefined in `theme.css`, so the declared `var(--card)` fallback (`:14`) always wins and all four cards share one background.
8. **`PromoKpiCard` is `({...}: any)` and silently drops `icon`.** The props are untyped (`:11`); `icon` is passed on all four cards (`:99`, `:105`, `:111`, `:118`) and the component never renders it (`:13-19`). The shared `KpiStrip`, which does draw the icon tile, exists at `Page.tsx:203-304` and is not used.
9. **The entire report body is passed to `ReflowRail`, which at ≥ 1180 is a 288px collapsible rail.** `ReflowRail` (`:126-237`) → `Rail` → `CollapsibleAside width={288}` with `position: sticky`, `max-height: calc(100vh …)` and its own inner scroll (`Page.tsx:349-366`, `:315-331`, `CollapsibleAside.tsx:155-183`). The page has no `content | rail` grid to put that rail beside — the container at `:81` is a plain flex column and `useRailGridColumns` (`Page.tsx:382`) is not imported. So at desktop both tables and the nested rail render inside one 288px sticky, self-scrolling column. Compare the reports that do it the documented way: `ExpenseReports.tsx:182` + `:536`, `CashFlowReport.tsx:116` + `:306`, `ClientReports.tsx:177` + `:431`. Not unique to this page — `StaffReports.tsx:132`, `EquipmentPerformance.tsx:137`, `InventoryReports.tsx:102` and `ForecastingReports.tsx:118` repeat the same shape.
10. **A left `SideRail` is nested inside that right rail** (`:202-236`). `SideRail` is `CollapsibleAside side="left"` (`Page.tsx:400-416`), which defaults collapsed at phone *and* tablet (`CollapsibleAside.tsx:37`) — so below 1180 the Coupon Status donut, Usage by Client Type and Discount Types are behind a handle. That is precisely the outcome `ReflowRail`'s docstring says the component exists to prevent ("reflow, not hide", `Page.tsx:333-348`), reintroduced one level down. Its collapse state is keyed `left:/reports/promotions` (`CollapsibleAside.tsx:30`).
11. **The restricted panel names the wrong role set.** `restrictedRequiredRole="Owner, Admin, Coordinator or Accounts"` (`:70`) omits **Manager**, whom `canViewMoney` admits (`rbac.ts:45-50`). Five roles pass the gate; the chip names four.
12. **The page's restricted branch is unreachable at this route.** `Shell` already substitutes its own `RestrictedState` on the identical predicate before the component mounts (`App.tsx:993`, `:1020-1023`; `nav.ts:147-159`), so `PromotionsReports.tsx:63-76` — and the more specific reason string it carries — can only ever be seen if the component is mounted somewhere outside `/reports`.
13. **Both tables stay tables below 768.** `useTabularLayout()` (`device.ts:139-141`) is not consulted, so the 6-column coupon table (`:148-171`) and 5-column bundle table (`:176-197`) render unchanged at phone width; they carry no `minWidth` and no `overflow-x` wrapper either, so the columns compress rather than scroll.
14. **`DISCOUNT_TYPES` carries two dead fields that can drift.** Each slice has a pre-formatted `display` and a hand-written `percent` (`promotionsReports.ts:50-53`); the page renders neither, reformatting `value` itself (`:231`). The four `value`s do sum to `METRICS.discountsGiven` today (125000 + 95000 + 85000 + 43200 = 348200 rupees), but nothing enforces it.
15. **The report catalog already records the shortfall from the other side.** `src/modules/reports/catalog.ts:266-273` lists this route under "Discounts" and states that `booking_discounts` "carries the Law 10 approval fields; nothing aggregates them yet" — while still calling this "the built screen". The screen it points at prints invented figures.
16. **No date or branch filter, by design.** `ReportToolbar` is given only `csv` (`:93`) and the comment at `:88-92` argues the case; `ReportToolbar.tsx:398-427` is built to draw no dead controls. Recorded here so a reader does not report it as a missing feature — the consequence is that the CSV's provenance header always prints "Period, All dates" (`ReportToolbar.tsx:330`, `:261`).
