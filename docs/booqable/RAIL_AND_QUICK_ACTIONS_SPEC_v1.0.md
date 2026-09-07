# SIDE RAIL & QUICK ACTIONS — INTERACTION SPEC v1.0

**For:** Babin Rentals OS · **Source:** live Booqable admin, 30–31 Aug 2026, read-only, incl. three interaction probes (section collapse · whole-rail toggle · split-button caret)
**Companion to:** BOOQABLE_REFERENCE_SPEC v2.5 (structural capture). This file answers one question in depth: *where do filters and quick actions live, and how do they open?*

> ## ⛔ AMENDED 7 Sep 2026 — read before building §3
>
> Reviewed 5 Sep against the repo. **§1 and §2 (the observed placement grammar) hold.**
> Two corrections were applied to §3–§6:
>
> 1. **The 1180 breakpoint was struck by PLAN §4.38a on 31 Aug** — Law 14 is now 768 / **1280**
>    (`src/lib/breakpoints.ts`, test-guarded). A column at ≥1180 would land a layout rail on
>    the 1180–1279 iPad-Pro-landscape band that 1280 exists to protect.
> 2. **Five of the six components in §3 already exist under other names.** Build them as
>    deltas, never as new files — see the mapping at the head of §3.
>
> Law numbers were off by one throughout (width is **14**, 44×44 is **15**); corrected in place.

---

## 1. THE SIDE RAIL — placement grammar, observed

Booqable's list screens share one skeleton, left to right:

```
[main nav] │ [FILTER RAIL 183px] │ [content: tabs → metric strip → toolbar → table]
```

The rail inventory across every captured screen:

| Screen | Rail sections (top→bottom) | Pinned at rail bottom |
|---|---|---|
| Bookings | Status ✓counts · Payment status ✓counts · Date range · Tag | Export |
| Inventory ▸ Products | Product type ▾ · Product tax profile ▾ · Pricing structure template ▾ · Price ruleset ▾ · Tag cloud | Import · Export |
| Inventory ▸ Downtime | Attention required ✓counts · Status ✓counts (2 pre-checked) · Reason ✓counts · Item type ✓counts | — |
| Customers | Customer type ✓counts · Marketing emails ✓counts · Customer tax profile ▾ · Customer created 📅 | Import · Export |
| Documents (Invoices) | Finalized ▾ · Sent ▾ · Payment status ✓counts · Date range 📅 · Due date 📅 | Export |
| Coupons | Status ✓counts · Coupon validity 📅 | — |
| Reports (Company perf.) | Reporting period 📅 · Comparison ▾ · Status ✓counts (period-scoped) | — |
| Reports (Customer) | Performance 📅 · Show revenue by ▾ · Status ✓counts · type/marketing ✓ · 2 date filters | Export |
| Activity logs | date 📅 · actor ▾ (top bar, not a rail) | — |

**The grammar that falls out:**

1. **Identity facets first, lifecycle facets second, dates third, tags last.** Every rail follows this order where the groups exist.
2. **Export/Import are RAIL furniture, pinned at the bottom** — never in the header, never in the toolbar. The rail owns "what slice am I looking at", so the export of that slice lives with it.
3. **Counts belong to checkbox facets; dropdowns get none.** (Booqable is inconsistent about *which* control a group gets — three idioms in one product, §12.1 — but wherever checkboxes appear, counts appear.)
4. **Two date dimensions coexist as two named sections** (Date range + Due date; Customer created + Latest order) — never one picker with a mode switch.
5. **Pre-checked defaults are visible state** — Downtime ships Scheduled+Started checked; the report ships four statuses checked. The default scope is *shown*, not hidden (contrast: the Bookings list's Cancelled/Archived exclusion, which is invisible — the one place Booqable hides scope, and the one we flagged as a hazard).

### 1.1 How it opens and closes — the three observed mechanics

**[observed] Section collapse.** Each section header is a full-width click target with a chevron at the far right (`Status ^`). Click anywhere on the header → the body (checkboxes) unmounts, the chevron flips to `v`, sections below slide up. State is per-section, independent. No animation worth copying — instant.

**[observed] Whole-rail toggle.** One icon button (▯) sits LEFT OF THE PAGE TITLE — not in the rail itself. Click → the entire rail unmounts and content takes the full width; the icon switches to a filled/active state and is the only trace the rail exists. Click again → rail returns with all its state (sections, checks) intact. The same control drives the right rail on Dashboard/Booking Detail (order sidebar toggle, top-right).

**[observed] Async counts.** During load the rail renders its facet checkboxes WITHOUT counts, then counts arrive with the data. The rail never blocks on the query; labels first, numbers later.

**[observed] Chip × pattern.** Where a filter is active, it also appears as removable state near the content (tag chips, serial chips) — removal is one ×, no trip back into the rail required.

---

## 2. QUICK ACTIONS — the five families, and where each lives

Booqable places actions in exactly five places. Nothing observed lives anywhere else.

### F1 — Header primary (+ split-create)
One blue button, top-right of every list: `Add booking` · `Add product ▾` · `Add customer` · `Add coupon` · `Add collection ▾` · `Add bundle ▾`. Where multiple create types exist on one screen, the button is a **split button**: label = default create, caret = menu of siblings `[caret menu contents unverified]`. The global `+ New booking` also sits pinned at the top of the main nav — the one create that exists everywhere.
**Opens:** navigation to the create screen (which in Booqable eagerly writes a draft — §18, do not copy).

### F2 — Bulk bar (selection-scoped)
`Actions ▾ · N selected · Select all N` sits in the TOOLBAR, above the table, left-aligned. Disabled/grey at 0 selected; the row checkboxes feed it. "Select all N" selects the QUERY, not the page.
**Opens:** dropdown menu under the button. *(Never opened here — it is the mutating surface.)*

### F3 — Row-level verb
At most ONE verb button per row, right-aligned, colour-coded by consequence: Downtime rows carry `→| End` (green). List rows otherwise carry NO buttons — the row is a link, full stop. Destructive row controls appearing only on hover (Booking Detail line ×) exist and are an anti-pattern (§10.4).

### F4 — Panel quick links
On dashboard-style panels: actions live in the PANEL HEADER (right-aligned: `Run report`, period button) and the PANEL FOOTER (`View late` left · `View all` right). They are links carrying the panel's filter, widened — never new queries.

### F5 — Detail-page verb rail
Booking Detail header: breadcrumb · status pill · **one amber NEXT-verb button** (`↑ Pickup`) · `⋯` overflow · sidebar toggle. Document pages: `Delete · Print · Download · [✓ Finalize] · Send` — the full action set inline, primary rightmost, destructive leftmost. The order sidebar (right rail) holds section-scoped creates (`New contract`, `New payment`) — **booking-scoped creates live in the booking's rail, not in any global menu** (R8, booking-as-hub).

---

## 3. OUR COMPONENTS — the build spec

> ⛔ **These are deltas, not new components.** Measured at HEAD 5 Sep with a positive control;
> re-confirmed 7 Sep. Build into the file named on the right — a parallel set is the one
> failure mode this section can cause.
>
> | §3 name | What actually exists | File |
> |---|---|---|
> | `<FilterRail>` | `FilterDrawer` — an overlay panel, not a column (its header says why the column was abandoned) | `components/ui/FilterDrawer.tsx` |
> | `<RailSection>` | a disclosure inside `FilterDrawer`; per-route collapse already exists as `useCollapsed` | `FilterDrawer.tsx` · `lib/collapse.ts` |
> | `<RailToggle>` | `FilterButton` — already carries the count badge and `aria-expanded` | `FilterDrawer.tsx:380` |
> | `<FacetGroup>` | `FilterOptionList` + `useFacetCounts` (wired to /rentals on 1 Sep) | `FilterDrawer.tsx:676` · `lib/queries/facetCounts.ts` |
> | the chip × pattern | `ActiveFilterChips` | `FilterDrawer.tsx:468` |
> | the column form | `SideRail` / `CollapsibleAside` — used in 9 files across the module tree (clients, documents, finance, inventory ×2, operations ×2, rentals, reports), so it is not a /clients remnant | `components/ui/Page.tsx:403` |
> | `<BulkBar>` | **not built** — needs a server-side id endpoint and a ruled verb list first (see §3.4) | — |
>
> Two further corrections inside §3: the counts source is **`facetCounts.ts`**, not the
> unbuilt `booking_facets()` RPC (§9.2 of the reference spec is stale on this); and
> `<RailSection>` collides only with a file-local helper in the unrouted
> `src/archive/operations/CasesQueue.tsx` (`:913`) — no export, no route, so the name is free.
> **`periodRange`** is not a `lib/` engine — it is a six-case helper in `src/data/today.ts`,
> so "one date engine, they cannot disagree" is an aspiration, not a fact, until it moves.

Six components, all in `src/components/ui/`, engine-fed, no business logic (Law 1).

### 3.1 `<FilterRail>` + `<RailSection>`

```tsx
<FilterRail storageKey="rentals">          // per-screen persistence of collapse state
  <RailSection title="Stage" defaultOpen>
    <FacetGroup group="stage" />           // reads listQuery chip group + booking_facets()
  </RailSection>
  <RailSection title="Payment" money>      // Law 6: NOT BUILT for money-blind roles
    <FacetGroup group="payment_status" />
  </RailSection>
  <RailSection title="Period"><PeriodRange /></RailSection>   // the ONE date engine
  <RailPinned><ExportButton scope="currentQuery" /></RailPinned>
</FilterRail>
```

- Section header = full-width button, chevron right, `aria-expanded`, 44px min height (Law 15). Collapse per-section, persisted per screen (localStorage-class convenience, not server state).
- **Counts from `booking_facets(filters)`** (one RPC, §9.2) — render label-first, counts async, exactly as observed. A checked facet with count 0 stays visible (the opt-in census, §9.2).
- Facet checkboxes ALWAYS carry counts; we do not build the dropdown idiom for filterable enums at all (one idiom everywhere — L4). Dropdowns are reserved for single-choice display options (`Show revenue by`).
- **Default scope is rendered as pre-checked boxes** — adopting Downtime's honesty, refusing the Bookings list's invisible exclusion. Cancelled/Archived show unchecked with their counts.
- Two date dimensions = two named `<RailSection>`s, each a `periodRange` instance with its column named (`starts_at` vs `due_at` — listQuery's named-column date support, §14.5).
- Export lives pinned in the rail, exports the CURRENT query via lib/csv, and rides inside the money gate where the tab is money-gated (the 15 Aug exportConfig lesson).

### 3.2 `<RailToggle>` + responsive law

- One icon button LEFT OF THE PAGE TITLE (PageHeader gains an optional `railToggle` slot). Toggles the rail wholesale; filled state when hidden; rail state survives.
- **Law 14 (width decides — 768 / 1280):** ≥1280 the filter panel is persistent and default open. 768–1279 the same panel, default CLOSED, opened by `FilterButton`. *(As captured on 31 Aug this line read: "**Law 15 (width decides):** ≥1180 rail is a column, default open. 768–1180 rail defaults CLOSED, toggle opens it as an overlay column." Three things changed: the breakpoint 1180 was struck by PLAN §4.38a, the law is 14 not 15, and the ≥1280 presentation is a persistent panel rather than a layout column — `FilterDrawer` was written to remove that column.)* <768 (bench/phone) there is no rail column at all — the toggle opens a **full-height bottom sheet** with the same `<RailSection>` children, an sticky Apply row showing the would-be result count (from the same facets RPC), and 44×44 targets throughout. One component tree, three presentations.
- The Dashboard/Detail right rail (notes feed, order sidebar) uses the same toggle mechanic mirrored top-right.

### 3.3 `<QuickCreate>` (header primary)

- One primary button per screen, top-right of PageHeader `actions`. Split-caret only where sibling creates exist (Inventory: Product | Bundle | Collection); caret opens a plain menu, `aria-haspopup`, Escape closes.
- **Navigates to a form that writes NOTHING until save** — the opposite of Booqable's eager draft (§18). No draft rows from navigation, ever.
- Global create: exactly one — `New booking` in the main nav, pinned. All other creates are screen-scoped or booking-scoped (R8).

### 3.4 `<BulkBar>`

- Toolbar-left: `Actions ▾ · N selected · Select all {total}` — disabled until N>0; "Select all" binds the QUERY (server-side ids), and the bar then reads "All 653 selected · Clear".
- Menu items are capability-gated per role (core.ts checkCapability) — an item a role can't perform is ABSENT, not disabled (same rule as money: not built).
- Every bulk verb confirms with the count in the button ("Archive 14 bookings").

### 3.5 `<RowVerb>`

- At most one per row, right-aligned, ALWAYS visible (never hover-revealed), 44×44, colour + label (Law 11). Reserved for floor verbs on queue screens (Operations: Pack/Handover/Return/Reset; Downtime: End). Ordinary list rows get none — the row is one link, one tab stop (L6).

### 3.6 `<PanelActions>` (dashboard panels)

- Header-right: the panel's period button (+ optional report link). Footer: exception link left (`View late (N)` — WITH count, our improvement), widen link right (`View all`). Both are links carrying the panel's named filter set (bookings.ts), never separate queries.

### 3.7 Detail-page verb rail (already ruled, restated for completeness)

- Booking Detail: ONE next-verb button from lib/workflow (amber, right of the status pill), `⋯` overflow for rare actions, sidebar toggle far right. Documents: `Print · Download · [Finalize] · Send` with Delete demoted into `⋯` (we do not put Delete as a peer of Print — Law 3 temperament, and Booqable's own footer red-button placement is the anti-pattern).

---

## 4. PLACEMENT MAP — our screens

| Our screen | Rail? | Quick actions |
|---|---|---|
| /dashboard | right rail = activity feed (toggle top-right); NO filter rail | PanelActions on Going out / Coming back |
| /rentals | FilterRail (Stage✓ · Flags✓ · Payment✓[money] · Period · Client) + Export pinned | QuickCreate `New booking` · BulkBar · no row verbs |
| /operations | FilterRail (verb queues✓ · Attention required✓ (L3 four-way) · day scope) | RowVerb per queue row |
| /inventory | FilterRail (Category✓(collections) · Status✓ · Type✓) + Import/Export | QuickCreate split (Product|Bundle|Collection) · BulkBar |
| /inventory/downtime | FilterRail (Attention✓ · Status✓ pre-checked · Reason✓) | RowVerb `End` |
| /clients | FilterRail (Type✓ · Flags✓ · Created 📅 · Last booking 📅) + Export | QuickCreate `New client` · BulkBar |
| /documents | FilterRail (register tabs · Finalized✓ · Sent✓ · Payment✓[money] · 2 dates) + Export | doc-page verb rail |
| /reports/* | FilterRail (Period · Comparison ▾ · scope✓ per-surface default) + Export | — |
| /calendar | no rail — scale buttons in header (Day/Week/Month/Today) | Check availability · Subscribe |

## 5. ANTI-PATTERNS refused (all observed)

Three filter idioms in one product → one (L4) · invisible default exclusions → pre-checked visible scope · hover-only destructive controls → always-visible 44×44 · eager draft on create-navigation → write-on-save only · `Delete` as a header peer of `Print` / red delete in a form footer → demoted to overflow · a bulk `Actions` menu enabled at 0 selected (theirs greys it — keep that).

## 6. OPEN DECISIONS

1. **Rail width token** — Booqable ≈183px; ours must fit the **1280** breakpoint math with the nav. Propose 216px at ≥1280, sheet below.
2. **Collapse-state persistence scope** — per screen per device (localStorage) proposed; server-side per user is more work for little gain.
3. **`Select all {query}` + bulk verbs** — needs the server-side id-list endpoint before BulkBar ships; sequence it with the Wave 1 list conversions.
