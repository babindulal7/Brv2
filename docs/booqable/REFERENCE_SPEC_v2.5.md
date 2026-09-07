# BOOQABLE → BABIN RENTALS OS — REFERENCE EXTRACTION SPEC v2.5 — COMPLETE + RULED

**Date:** 30 Aug 2026
**Source:** v1.0 from a saved Dashboard (30 Aug 22:02). **v1.1–v1.2 add LIVE sessions** on `babin-rentals.booqable.com` — read-only, no record created, sent or changed.
**Deliverable:** a spec for Claude Code, not code
**Status of the reference:** STRUCTURAL ONLY (29 Aug ruling stands — see §1)

> ## ⛔ READ THIS FIRST — what in this document is trustworthy
>
> Amended 7 Sep 2026 after an independent five-lens review (5 Sep, against HEAD `467e7f1`).
> **The capture itself is unchanged.** What changed is the labelling around it.
>
> **Layers A, B and C are trusted.** Every Booqable-side observation in this file was
> re-checked and held. That capture is the reason to keep the document.
>
> **Layer D is 28% verified — do not build from it.** The repo's own audit confirmed 93 of
> 329 repo-side claims; 110 are GAP, 85 MISLEADING, 34 WRONG-NAME. Read
> [`CORRECTIONS.md`](CORRECTIONS.md) first, and read **§5 of**
> [`LAYER-D-VERIFICATION.md`](LAYER-D-VERIFICATION.md) **in place of §2.4** — that file
> states outright that its §5 replaces §2.4. **Carry one correction forward into it:** §5.5's
> "ZERO callers" rows for `facetCounts.ts` and `queries/bundles.ts` went stale within days —
> `useFacetCounts` has been wired to /rentals since 1 Sep (`RentalsList.tsx:27,:559`) and
> `bundles.ts` is live via `bundleRecords.ts`. Re-grep any dead-module claim before trusting it.
>
> **The body is older than its own appendix on discounts.** Appendix A0 (D3) reversed the
> Law 10 gate on 30 Aug; PLAN.md §0 Law 10 now reads **UNGATED** and migrations 0074/0075
> dropped the constraints. Every gate passage below carries a ⛔ marker.
>
> **Law numbers in the original text were off by one** (width, 44×44 and the AD/UTC law).
> They are corrected in place below and marked where corrected.
>
> **Both companion specs were reviewed and amended the same day** —
> [`RAIL_AND_QUICK_ACTIONS_SPEC_v1.0.md`](RAIL_AND_QUICK_ACTIONS_SPEC_v1.0.md) and
> [`DATE_TIME_PICKER_SPEC_v1.1.md`](DATE_TIME_PICKER_SPEC_v1.1.md). The build shortlist
> drawn from all three is [`ADOPTIONS.md`](ADOPTIONS.md).

---

## 0. How to use this document

Feed this whole file to Claude Code inside the `babin-rentals-os` repo. It does three jobs:

1. **§1–§2** set the rules: what may and may not be taken from Booqable, and the four layers to capture per screen.
2. **§3–§5** are a finished worked example — the Dashboard — at full depth. Use it as the quality bar.
3. **§6–§7** are the template and the run instructions for the remaining ~50 screens, which Claude Code generates itself from `docs/booqable/` and the local archive.

**Verify every Layer D line before building.** §2.4's contract list was written without repo
access and later measured at **28% correct** — read `LAYER-D-VERIFICATION.md` §5 instead, then
`CORRECTIONS.md`. Note that §8 is not the corrective it looks like: it disclaims only the *live
database*, and in the same breath repeats §2.4's claim that the table, engine and route names
"come from the repo's measured state". The audit showed those were not measured either, so
neither section's assurance survives. Verify each line yourself.

---

## 1. Standing rulings — do not re-litigate

These are already decided. A generated screen spec that contradicts one of them is wrong.

| # | Ruling | Source |
|---|---|---|
| R1 | Booqable is a **structural** reference — IA, panels, columns, filters, actions, statuses, empty states. Its visual design is **not** adopted. Our design system and tokens survive untouched. | 29 Aug |
| R2 | Money: **whole rupees, one rounding**. Booqable's paisa + VAT-on-discounted-total is not adopted. The two systems differ on every booking for the whole bridge period. | 19 Aug |
| R3 | Status: map **ours down to theirs**, never theirs up to ours. Booqable has nothing between Reserved and Started. | 19 Aug |
| R4 | Sub-rental: Booqable's `Allow shortage` is permission to oversell, not a record. Our external-gear tracking has **no counterpart** and must never be overwritten by a sync. | 19 Aug |
| R5 | RBAC: Booqable's four levels cannot express our nine roles. Do not narrow ours to fit. | 19 Aug |
| R6 | Dates: Booqable is AD-only DD-MM-YYYY. We store AD in UTC and render BS. Never store BS. | Law 7 *(cited as Law 9 in the original)* |
| R7 | The word **"customer" appears nowhere** — they are clients. Booqable's nav says "Customers"; ours says Clients. | Law 17 |
| R8 | Booking-as-hub is law: no booking-related create action outside Booking Detail. | 29 Aug adoption |

**Anti-patterns not to copy** (already registered in `BOOQABLE_DESIGN_PRINCIPLES_v1.2`): free-text notes standing in for typed records, per-cell row anchors, `Started` vs `Picked up` vocabulary drift, kit contents as prose in a description field, single-use SEO tags as a taxonomy.

---

## 2. What to capture per screen — the four layers

The 19 Aug `docs/booqable/` capture covered Layer A only. Layers B, C and D are the new work.

### 2.1 Layer A — STRUCTURE (what is on the page)
Panels and their order · columns · filters and chips · grouping and sort · statuses shown · counts and badges · empty/loading/error text · what is above the fold.

### 2.2 Layer B — FUNCTION (what each control does)
Every control: its label, its type (link / button / menu / toggle / date control), its **destination** (route + query params) or its **effect** (what row changes, what gets written), whether it is reversible, and which roles may use it.

A control is only specified when its destination or effect is named. "Opens a modal" is not a specification.

### 2.3 Layer C — HOVER & INTERACTION
Hover affordance · focus behaviour · tab stops per row · what appears on hover that is not on the page at rest · keyboard path · touch equivalent for anything hover-only.

> **Honest limit.** A saved static page cannot show JS-driven hover cards, dropdown menus or transient tooltips — only what sat in the DOM at save time. For every screen, Layer C is therefore part observation, part **our decision**. Mark each line `[observed]` or `[ruled]`. Do not present a ruling as an observation.

### 2.4 Layer D — BACKEND DATA LINK
For every panel and every column: the **table or view**, the **filter**, the **engine** that computes it, and the **action** that writes it. Named against the real repo, not invented.

> ⛔ **SUPERSEDED — §5 of [`LAYER-D-VERIFICATION.md`](LAYER-D-VERIFICATION.md) replaces this
> list.** It was written on 30 Aug in a session with **no repo access**, then labelled
> "measured". Measured afterwards: **28% correct** (93 of 329 claims). It names 19 engines
> against the ~50 top-level modules `src/lib` holds today, so it omits roughly 31 — and its
> errors were copied forward verbatim into six later sections.
> The list is kept below unchanged as the historical record — it is not a contract.

**The contracts as named on 30 Aug — historical, 28% verified, do not build from this:**

*Tables / views the app already reaches:* `bookings` · `booking_lines` · `booking_line_units` · `clients` · `clients_v` · `client_directory_v` · `client_flags` · `membership_plans_v` · `products_v` · `product_units_v` · `invoices` · `payments` · `payment_reversals` · `security_deposits` · `expenses` · `expense_categories` · `branches` · `operation_sessions` · `cleaning_queue_entries` · `users` · `audit_events` · `number_sequences` · bridge tables `external_refs` · `external_invoices` · `sync_outbox` · `sync_conflicts`

*RPCs:* `create_booking(jsonb)` · `next_document_number(kind)`

*Query layer:* `src/lib/queries/listQuery.ts` (filter→PostgREST builder) · `useList.ts` (loading/error/isEmpty/isFiltered/total/refetch) · `src/lib/queries/bookings.ts` (named filter sets: `todaysOutgoing`, `todaysIncoming`, `overdue`, `operationQueue`) · `src/lib/bookingQuery.ts` `fetchCanonicalBooking` (Law 2 for one booking)

*Engines in `src/lib`:* `audit` · `auth` · `bookingQuery` · `bs` · `dataAccess` · `discount` · `format` · `kpiEngine` · `money` · `moneyVisibility` · `network` · `offlineQueue` · `rbac` · `status` · `supabase` · `textSize` · `theme` · `validation` · `workflow`

*UI contracts:* `PageHeader {icon,title,description,actions}` (no `subtitle`) · `Card {title,action,children,style,bodyStyle}` (no `subtitle`) · `Kpi {label,value,icon,accent,delta,note,spark}` · `PageBody` status wrapper, fixed order **restricted → error → loading → empty → children** · `BrandKey = neutral|primary|progress|success|danger|purple` · `IconName` is a fixed ~60-name registry — no `lock`/`wallet`/`clock`/`gauge`/`scale`/`coin`/`trending_up`; use `error`/`dollar`/`timer`/`activity`/`chart`/`card`/`users`

*Canonical booking stages:* Quote · Booked · Packed · On Rent · Returned · Closed. Flags: Due Soon · Partial Pickup · Picked Up.
*Live booking-number format:* `^B-[0-9]+$` (migration 0055 applied).

---

## 3. Global chrome — verified from the capture

### 3.1 Booqable's nav, and the vocabulary gap

| UI label | Real route | Our equivalent | Note |
|---|---|---|---|
| Dashboard | `/` | `/dashboard` | renamed from `/today` 30 Aug; `/today` is a replace-redirect |
| Calendar | `/calendar/products` | `/calendar` | theirs defaults to a **product** axis, not a date axis |
| Bookings | `/orders` | `/rentals` | UI says Bookings, URL says orders — their own drift |
| Customers | `/customers` | `/clients` | Law 17 — ours is Clients everywhere |
| Inventory | `/product_groups` | `/inventory` | their inventory root is a *group* list, not an item list |
| Coupons | `/coupons` | — | not built |
| Documents | `/reports/documents/invoices` | `/documents` | theirs is filed **under Reports** |
| Online store | `/settings/online-bookings` | — | theirs is filed **under Settings** |
| App store | `/app-store` | — | not applicable |
| Reports | `/reports` | `/reports` | |
| Settings | `/settings/general` | `/settings` | |

Primary CTA: **New booking** → `/orders/new`.
Utilities: `Continue setup 9/11 completed` · `Ask Bo (BETA)` · `Scan a barcode` · `Help` · avatar `BD — Babin Dulal` with a numeric badge of **1** `[unverified: badge meaning]`.

**Two findings worth taking:**
- Booqable files *Documents* under Reports and *Online store* under Settings. Both are the "group by what it governs" principle from the 15 Aug Settings reshape, applied to the nav. Ours already separates them — no change, but the precedent supports the current shape.
- `Continue setup 9/11` is a persistent progress affordance in the nav. We have no equivalent. **[ruled: not adopted]** — it is onboarding scaffolding for a SaaS trial, not an operating tool.

### 3.2 What the Dashboard does *not* have

No KPI strip. No chart. No date-range picker for the page. No search. The whole screen is three list panels.

This is worth stating plainly because our `/dashboard` currently carries a KPI strip. Booqable's dashboard answers *"what moves today and what did people write down"* and nothing else.

---

## 4. WORKED EXAMPLE — Dashboard

### 4.1 Page identity
- **Booqable:** `/` — three panels, no KPIs, no charts.
- **Ours:** `/dashboard` (`src/modules/today/`, folder name unchanged).
- **Purpose:** the floor's first screen. What goes out, what comes back, what people wrote down.

### 4.2 Layer A — Structure

> **CORRECTED IN v1.1 by the live session.** v1.0 read the three panels as a vertical stack. They are not.

**Layout:** a **two-column page** — a main column carrying *Going out* then *Coming back*, and a **fixed right rail** carrying *Latest notes*. A toggle button in the page header shows/hides the rail. Ours must decide rail-vs-stack deliberately; on a 768px bench the rail has nowhere to go (Law 14 — width decides).

**Right rail — Latest notes**
- 10 rows, newest first, `Load 10 more` pagination (no infinite scroll, no "view all").
- Row: author name (bold) · note body (free text, any length) · timestamp `DD-MM-YYYY HH:mm` · booking ref `#830` with a small booking icon.
- No filter, no search, no author facet.

**Panel 2 — Going out**
- Header controls: `Run report` (link) and `Next 7 days` (period button).
- Rows grouped under a full date heading: `Wednesday September 2 2026`.
- Row: time `06:15` · avatar initials `AS` · client name · client email · item count + state `1 reserved` · booking ref `#906`.
- Footer: `View late` · `View all`.

**Panel 3 — Coming back**
- No `Run report`. **Has its own period button, reading `Tomorrow`** — v1.0 mistook this for a date group heading. Both panels carry an independent period control; they do not share one page-level scope.
- Row: same anatomy; state reads `3 picked up` in amber (Going out's `1 reserved` is blue — state is carried by text *and* colour, which satisfies Law 11).
- Footer: `View late` · `View all`.

**Observed volumes at capture:** 2 going out (2 & 3 Sep), 2 coming back (tomorrow), 10 notes.

### 4.3 Layer B — Function (verified destinations)

| Panel | Control | Type | Destination / effect |
|---|---|---|---|
| Going out | `Run report` | link | `/reports/pickups` |
| Going out | `Next 7 days` | button | period selector, no href — client-side scope change |
| Going out | `View late` | link | `/orders/overdue?filters[activity]=start` |
| Going out | `View all` | link | `/orders?filters[statuses][]=reserved&filters[statuses][]=started` |
| Coming back | `View late` | link | `/orders/overdue?filters[activity]=stop` |
| Coming back | `View all` | link | `/orders?filters[statuses][]=started&filters[statuses][]=stopped` |
| Both | any row cell | link | `/orders/{uuid}` |
| Notes | `Load 10 more` | button | appends the next 10, same panel |

**This is the single most useful thing in the capture.** Every panel is the *same bookings query* under a different named filter, and every footer link is that filter widened. `activity=start` means pickup, `activity=stop` means return. Their overdue screen is one route taking an activity parameter, not two screens.

**Status translation to our canonical six** (per R3, mapping ours down to theirs):

| Booqable | Ours |
|---|---|
| `reserved` | Booked |
| `started` | On Rent (our Packed has no counterpart) |
| `stopped` | Returned |

So the two `View all` links become:
- Going out → stages `[Booked, Packed]` + flag `Partial Pickup`
- Coming back → stages `[On Rent]`, plus `Returned` for the same day

> `[judgement]` Booqable includes `started` in *Going out* because a partly-picked-up order still has items to collect. Our `Partial Pickup` flag expresses this better than a stage does. Confirm before building.

### 4.4 Layer C — Hover & interaction

`[observed]`
- Panel action labels (`Run report`, `Next 7 days`, `View late`, `View all`) are `<span>` inside a real `<a>`/`<button>`, computed `cursor: pointer`. Correct elements, so keyboard and focus work by default.
- **Each row cell is its own anchor** to the same `/orders/{uuid}`. A four-column row is four tab stops to one destination.
- The client email is rendered as body text **inside the row link**, so clicking it opens the booking rather than acting on the address. `[unverified]` whether a separate mail affordance exists elsewhere on the row — the tab stopped responding before that could be confirmed.

`[observed, LIVE]` **THE ROW HOVER CARD.** Hovering any Going out / Coming back row opens a full booking preview:

```
Booking #906                                   [ 1 reserved ]   ← status pill
AS   Aadarsha Sitoula                                  View ↗   ← opens the client
     aadarshasitoula07@gmail.com
📅   02-09-2026 06:15 — 03-09-2026 06:00                        ← full rental period
1x   Venus Optics Laowa 10mm f/2.8 Zero-D FF AF (Sony E)   Rs.2,000.00
     Total excl. taxes                                    Rs.2,000.00
     Tax                                                    Rs.260.00
     Total incl. taxes                                    Rs.2,260.00
     Paid                                                     Rs.0.00
     Due                                                   Rs.2,260.00
              [ View booking #906 ]
```

This is the single most valuable thing the live session produced, and it carries a problem: **the card is mostly money**. Four of its rows are figures a money-blind role must never receive (Law 6: Warehouse · Technician · Driver · Client).

It also confirms tax at 13% (2,000 → 260) and, again, the 06:00 rental day.

`[observed, LIVE]` The same hover card does **not** appear on the Bookings list (§9). The richest affordance in the product exists on exactly one screen.

`[ruled]` — what ours must do:
- **Adopt the preview card** — it answers "what is in this booking" without leaving the floor screen, which is the most common question at the bench.
- **Bind it to tap as well as hover.** Hover-only fails the packing bench, which is touch. A long-press or an explicit chevron control, 44×44 (Law 15).
- **Gate the money block by role, not by CSS.** For money-blind roles the four figure rows are *not built*, and the card still renders with client, period and lines.
- **One row = one link = one tab stop.** Build on the `ClickableRow` component already named as item 3 in the 11 Aug improvement order. Cells inside it are not separately focusable.
- **Hover reveals nothing that matters.** No data may be hover-only — it fails touch, which is the packing bench's only input. Anything worth showing on hover belongs in the row or behind an explicit control (Law 15, 44×44).
- **Row hover = background token shift only.** No lift, no shadow, no border colour change alone (Law 11 — never colour alone).
- **Focus-visible ring is mandatory** and must not be the same treatment as hover.
- **Booking ref is the affordance.** `#906` reads as the link; the rest of the row is the hit area.
- Any status pill carries **shape or text**, never colour alone (Law 11).

> A saved page cannot prove what Booqable pops on hover. If hover cards matter to you, that is one live session with the real app, not another archive save.

### 4.5 Layer D — Backend data link

**Panel 2 — Going out**
```
source    bookings (+ clients for name/email; booking_lines for item count)
filter    src/lib/queries/bookings.ts → todaysOutgoing, widened to the selected period
stages    Booked, Packed  (+ flag Partial Pickup)
window    period button: Today | Tomorrow | This Week | Next 7 Days | Custom
          reuse periodRange — the same control /operations took on 30 Aug
order     pickup_at asc, grouped by calendar day
money     NONE on list rows. Law 2: figures come from fetchCanonicalBooking on detail.
engine    lib/workflow (stage + flags) · lib/bs (date render) · lib/format (time)
```

**Panel 3 — Coming back**
```
source    bookings, same query
filter    bookings.ts → todaysIncoming
stages    On Rent (+ Returned same-day)
order     return_at asc, grouped by calendar day
```

**Footer links**
```
View late (out)  → /rentals?filter=overdue&activity=pickup   → bookings.ts overdue
View late (in)   → /rentals?filter=overdue&activity=return   → bookings.ts overdue
View all         → /rentals?stage=<set>                      → listQuery chip group
```
Both `View late` links resolve to the **same** `overdue` filter set with an activity parameter — copy that, do not build two filters.

**Panel 1 — Latest notes: this one does not map, and must not be copied as-is.**

The ten captured notes decompose as:

| Note | What it actually is | Where it belongs |
|---|---|---|
| `30000 Paid` #235 | a payment | `payments` |
| `2500 late fee pending` #858 | a charge | charges / `invoices` line |
| `extra 2000 add … clip rod holder` #561 | a charge | charges |
| `50mm UV filter break down (damage), 24mm rear cap missing, intercom antenna damage, 3-pin cable damage` #880 | four damage records | cases / damage, one row each |
| `Master headset missing` #864 | a damage/loss record | cases |
| `7 set intercom` #873 | a booking line | `booking_lines` |
| `Don't book bundle components` #870 | a policy | product/bundle rule |
| `gimble rest on aug 6` #762 | a downtime block | maintenance / downtime |
| `Chinese Currency` #830 | ambiguous — a payment currency, or a client attribute | `payments` or client field — **ask the author** |

**Nine of the ten rows are typed records living as prose.** Only #861 (`bill chahi paxi lane`) is a genuine free-text instruction. Every one of them is invisible to every report — this is the 19 Aug finding, now demonstrated on live data.

`[ruled]` Our Dashboard panel is **not** a notes feed. It is a **recent activity feed reading `audit_events`**, rendering typed events with their own icons and amounts, with free-text notes as one event type among many — not the only one. A note that carries a number is a defect in data entry, and the entry surfaces must make the typed path easier than the prose path.

```
source    audit_events (already has triggers on bookings, clients, invoices,
          payments, security_deposits, inventory_units)
filter    latest N by occurred_at, joined to actor via users
money     amounts on payment/charge events are money — gate with useCanViewMoney
          (Law 6: Warehouse · Technician · Driver · Client see no money)
paging    "Load 10 more", matching Booqable — no infinite scroll
engine    lib/audit · lib/money (formatMoney) · lib/bs (timestamps)
```

### 4.6 Rulings this capture produces

1. **The rental day is 06:00→06:00.** All four captured bookings sit at 06:00/06:15, which is Booqable's default pickup and return time. This closes the open `TODO(decision)` in `bookings.ts` about whether "today's pickups" means midnight–midnight or 06:00–06:00. Rule it 06:00 and the Dashboard stops disagreeing with the floor at 5am and 11pm. **Confirm before building.**
2. **Notes panel becomes an audit-event feed** (§4.5).
3. **One row, one tab stop** (§4.4).
4. **Panels are named filters on one query**, satisfying Law 2 for free (§4.5).
5. **Keep our KPI strip or drop it — decide deliberately.** Booqable has none. This is a real choice, not an oversight to copy.

---

## 5. Bonus capture — the order sidebar

The saved page also carried Booqable's **order sidebar**: `position: fixed`, right-anchored, `z-index: 30`, collapsed to `0px` at save time. It is the booking-as-hub rail (R8) and it can open over any screen.

Its sections, verbatim:

```
Email        Send email · View email history (1)
Documents    [1]  New contract · New quote · Packing slip · Quote #766 (30-08-2026 15:57, Rs.6,000.00)
Invoices     [1]  Pro forma  Rs.6,000.00
Payments     Payment due — Paid Rs.0.00 · Due Rs.6,000.00 · New payment
Tags         Add tags
Notes
Activity logs  View activity logs
```

Worth taking:
- **Counts on section headers** (`Documents 1`, `Invoices 1`) — cheap, and tells the operator whether opening is worth it.
- **Paid / Due as two figures side by side**, with the payment *status* as a word above them.
- **Activity logs reachable from the booking**, not only from an admin screen.
- Documents and Invoices are **separate sections** — a quote is not an invoice. Ours agrees.

Money in this rail is Law 6 territory: the whole Payments and Invoices block is hidden for money-blind roles, and hidden means **not built into the DOM**, not visually hidden.

---

## 9. SCREEN 2 — Bookings list (`/orders`)

Captured live, 30 Aug. This is item 1 in the run order because of the faceted counts.

### 9.1 Structure

**Header:** title `Bookings` · rail toggle · centred `Search…` · primary CTA **`Add booking`**.

> Vocabulary drift to *not* copy: the Dashboard's CTA says **New booking**, this page's says **Add booking**. Same action, two words. Ours picks one.

**Left filter rail** — collapsible sections, `Export` pinned at the bottom:

| Section | Options (with live counts) |
|---|---|
| Status | Draft (6) · Reserved (2) · Started (5) · Returned (641) · Archived (0) · Canceled (253) |
| Payment status | Payment due (72) · Partially paid (34) · Paid (545) · Overpaid (3) · Process deposit (0) |
| Date range | `All time` (picker) |
| Tag | `WEBSHOP34` |

**Tabs:** `All` · `Upcoming` · `Late` · `With shortage` — saved views, not filters.
**`Hide metrics`** collapses the metric strip.

**Metric strip — four tiles:** `Bookings 654` · `Items ordered 2890` · `Revenue Rs.10,106,318.39` ⓘ · `Due Rs.1,422,867.18` ⓘ

> Refines the "3-number money strip" noted on 29 Aug: it is **2 counts + 2 money figures**, and the money ones carry definitions.

**Toolbar:** `Actions ▾` · `N bookings selected` · `Columns` · `Showing 1-30 of 654` · pager `1 2 3 4 5 › »` · `Select all 654 bookings`

**Table:** `#` · `Customer` · `Status` · `From` · `Until` · `Price` · `Payment status`. Sort arrows on `#`, `Status`, `From`. `Tags` is available but hidden by default (from the Customize columns menu).

### 9.2 The faceted counts — and the arithmetic that explains them

```
Draft 6 + Reserved 2 + Started 5 + Returned 641          = 654  ← the headline count
Payment due 72 + Partially 34 + Paid 545 + Over 3 + Dep 0 = 654
Canceled 253 · Archived 0                                 = NOT in the 654
```

**The rule to copy:** the default scope **excludes Cancelled and Archived**, facet counts are computed *within* that scope, and the excluded statuses still display their own count so the operator can opt in. Two behaviours in one control — a filter and a census.

**This is our biggest unbuilt filter item, and the naive build is the slow one.** Eleven filter options means eleven `count` queries per page load through PostgREST. Do not do that.

```
GAP — not built.  Recommended: one Postgres function

  booking_facets(filters jsonb) RETURNS jsonb

  returning every status and payment-status count for the CURRENT filter set
  in ONE call. Security INVOKER, search_path pinned per 0050 — so a
  money-blind session's facet counts obey the same RLS as its rows.

  Called from listQuery.ts alongside the page query; the count strip and the
  chip counts read the same result, so they cannot disagree.
```

### 9.3 The two money definitions — previously unexplained

Both tooltips, captured live:

| Tile | Definition (verbatim) |
|---|---|
| Revenue | "The total amount before taxes, including unpaid orders." |
| Due | "The total amount that remains to be paid." |

**This closes the 19 Aug open item.** The Bookings-list Revenue disagreed with the Documents register and no one knew why. It is **ex-tax and includes unpaid orders**; the register totals issued invoices. They answer different questions and were never meant to match. Not a bug — a naming failure.

`[ruled]` **Every money tile in our app carries a one-line definition on the tile.** This business has already lost time reconciling two numbers that were never comparable. The definition is not decoration; it is the thing that prevents the next reconciliation.

### 9.4 Function

| Control | Type | Effect |
|---|---|---|
| Status / Payment checkboxes | multi-select facet | narrows the list; counts recompute in scope |
| `All` / `Upcoming` / `Late` / `With shortage` | tabs | saved views |
| `Hide metrics` | toggle | collapses the strip |
| `Columns` | menu | Customer · Status · From · Until · Price · Payment status · **Tags** |
| `Actions ▾` | bulk menu | acts on checked rows — **not opened; it is the mutating control on this screen** |
| `Export` | download | CSV of the current filter set |
| row | link | `/orders/{uuid}` |

### 9.5 Hover & interaction

- `[observed]` **No preview card here.** The Dashboard's rich hover card does not exist on this screen.
- `[observed]` The row link is an `<a href="/orders/{uuid}">` **wrapped in a `<label>`** (the row checkbox's label). A label wrapping a link makes the click target ambiguous — click behaviour depends on where in the row you land. Do not copy.
- `[observed]` ⓘ tooltips are real tooltip nodes, keyboard-reachable in principle; the row cards are not.
- `[ruled]` If we adopt the preview card (§4.4), it belongs on **every** list of bookings, not one. An affordance that exists on one screen teaches nobody.

### 9.6 Status vocabulary — the drift, re-confirmed live

The filter rail says **`Started`**. The rows render **`Picked up`**. Same state, two words, on the same screen. Ours uses the canonical six with flags; this is the concrete reason not to inherit their vocabulary.

Live status pills observed in rows: `Draft` (grey) · `Reserved` (blue) · `Picked up` (amber) · `Returned` (green). Colour *and* text — Law 11 satisfied, worth copying.

### 9.7 Backend data link

```
source    bookings + clients (customer name) + invoices/payments (price, payment status)
filter    listQuery.ts chip groups:  stage[]  ·  payment_status[]  ·  date range  ·  tag
scope     DEFAULT EXCLUDES Cancelled + Archived — encode as a base predicate,
          not as a chip, so an empty chip group still means "no constraint"
          within scope (the hazard already pinned by the 12 Aug tests)
counts    booking_facets() RPC — see §9.2
sort      #, stage, starts_at  (server-side; a client-side sort is wrong once
          rows come from Postgres and the page is 30 of 654)
paging    30/page, server-side; "Select all 654" must select the QUERY, not the page
money     Price + Payment status columns are money. Law 6: for money-blind roles
          these columns are NOT BUILT — not hidden with CSS. Note this DIVERGES
          from bookings.ts, which deliberately carries no money on list rows at
          all. Rule it: money-visible roles get the columns, or nobody does.
engine    lib/workflow (stage) · lib/money (formatMoney) · lib/moneyVisibility
          (useCanViewMoney) · lib/bs (dates) · lib/kpiEngine (the strip)
export    lib/csv.ts already exists and is imported by exactly ONE screen.
          This is where it earns its place.
```

### 9.8 Open decisions

1. **Money on list rows** — Booqable puts Price and Payment status on every row; our `bookings.ts` carries none. Cost of getting it wrong: either the floor cannot see what a booking is worth, or a Warehouse operator can. Decide once, for all lists.
2. **Facet counts scope** — do counts respect the *other* active filters (true faceting) or only the base scope? Booqable's sum to the headline, which implies base scope only. True faceting is more useful and more expensive.
3. **Cancelled/Archived default exclusion** — adopt as a base predicate? It is invisible to the operator, which is a hazard when a booking "disappears".

---

## 10. SCREEN 3 — Booking detail (`/orders/{uuid}`)

Captured live on booking **#906** (Reserved, Rs.2,260.00). Read-only: no verb pressed, no document created, no payment recorded.

### 10.1 Structure

**Header:** `Bookings › #906` · status pill `1 reserved` · **one amber verb button `↑ Pickup`** · `⋯` overflow · `←|` sidebar toggle.

> **The single-verb header is the pattern worth taking.** One primary button showing the *next* transition, not a row of every possible action. Ours has more steps than theirs (Pack · Handover · Return · Reset vs their Pickup/Return), so per R3 the header shows our next verb, and the extra steps are ours alone.

**Two cards, left column**
- `Customer` — avatar · name · email · `×` to detach.
- `Information` — `Add field` button, plus existing custom fields (`Mobile`). Per-booking custom fields.

**One card, right column**
- `Pickup` — `Add billing address` · `From 02-09-2026 06:15` · `Until 03-09-2026 06:00`, as **inline-editable date and time inputs**. No modal, no edit mode.

**Lines block**
- `Search to add products` + a barcode/scan control on the right of the search bar.
- Column heads: `Available` · `Quantity` · `Charge` · `Edit for all items`.
- Line row: drag handle `☰` · expander `⌄` · product thumbnail · product name · `1 reserved` · availability chip **`⊙ 0 left`** · quantity with `+`/`−` steppers · charge `1 day` + `Rs.2,000.00 ⌃` · inline edit icon · line total `Rs.2,000.00` · remove `×`.
- Below the line: **a serial chip `LAO-10MM-ZDFF-SE-01` with an `×`.**
- `Add custom line` (dropdown).

**Totals block** (right-aligned, in this exact order):
```
Subtotal                                          Rs.2,000.00
Add a discount        ← link
Add a coupon          ← link  (separate mechanism from discount)
Total discount                                        Rs.0.00
─────────────────────────────────────────────────────────────
Total excl. taxes                                 Rs.2,000.00
Vat                                                 Rs.260.00
Total incl. taxes                                 Rs.2,260.00
Security deposit  ⓘ                                   Rs.0.00
100% of product security deposit value
```

**The deposit sits below `Total incl. taxes` and is not added into it.** Booqable already treats the deposit as a thing held rather than revenue earned — which is our Law 5 (deposits are liabilities) expressed in a layout. Copy the placement.

### 10.2 The serial chips — evidence for the open B4 decision

`LAO-10MM-ZDFF-SE-01` on the line is a **specific stock item assigned to this booking at booking time**, removable by the operator.

This is the live counterpart to `booking_line_units.asset_id` and the 27 Jul "least-used unit auto-reserved at creation" lock, and it bears directly on **B4**, still open: *wire Booqable, or move serial allocation from booking creation to Pack?*

**What the capture actually proves:** allocating serials at creation is not theoretical — it is how this business's live system runs today, and staff already work with removable per-unit chips. It does not prove allocation-at-creation is the right choice for us; it removes "nobody does it that way" as an argument against it. `create_booking(jsonb)` already accepts `units` as an optional array per line, so **both options remain open against the same signature.** Still Babin's call.

### 10.3 The tooltip pattern worth stealing

Hovering ⓘ beside the zero deposit gives, verbatim:

> "Security deposits are not charged on services, sales items and custom lines. Security deposit is not charged on: Venus Optics Laowa 10mm f/2.8 Zero-D FF Autofocus Lens (Sony E)"

It does two things at once: states the **rule**, then names **the specific input that triggered it**. An operator seeing `Rs.0.00` gets the reason without opening a settings page.

`[ruled]` **Any computed money figure that resolves to zero, or to less than the operator expects, explains itself the same way** — rule first, then the named inputs excluded. This is cheap and it is exactly the class of confusion that produced the two-revenue-totals problem in §9.3.

### 10.4 Hover & interaction

- `[observed]` The line's **remove `×` and the product thumbnail appear only on row hover.** A destructive control that exists only on hover fails touch entirely — and the packing bench is touch. Do not copy.
- `[observed]` `Charge` shows `1 day  Rs.2,000.00 ⌃` — the chevron expands the pricing breakdown in place.
- `[observed]` Dates and times are inline inputs; there is no save button visible, so it commits on blur/change. Any adoption needs an explicit optimistic-update and failure path (Law 12 — errors inline, toasts carry successes only).
- `[ruled]` Ours puts line removal behind a visible 44×44 control (Law 15), and confirms it if the booking is past Packed.

### 10.5 The order sidebar, open

Sections and counts, live on #906:

```
Email          Send email · View email history (1)
Documents [1]  New contract · New quote · Packing slip
               Quote #767   30-08-2026 19:23   Rs.2,260.00
Invoices  [1]  Pro forma                       Rs.2,260.00
Payments       Payment due · Paid Rs.0.00 · Due Rs.2,260.00 · New payment
Tags           Add tags
Notes
Activity logs  View activity logs
```

Document types in play: **contract · quote · packing slip · pro forma**. Quote and Pro forma both equal the booking total, so the pro forma is generated from the quote, not entered.

Everything from `Documents` down is money or money-adjacent. Law 6: for money-blind roles the Invoices and Payments sections are **not built**; Email, Tags, Notes and Activity logs remain.

### 10.6 Backend data link

```
read      fetchCanonicalBooking (lib/bookingQuery.ts) — Law 2, ONE query
          bookings · booking_lines · booking_line_units · clients
          · invoices · payments · security_deposits · audit_events
lines     booking_lines (qty, charge period, price) + booking_line_units (asset_id)
serials   the chips ARE booking_line_units rows; removing one is a delete of that
          row, not an edit of the line
avail     "0 left" — inventory availability at the line's date range.
          NOTE dataAccess.ts:201 says inventory_reservations is Booqable-mastered,
          so this number has no local source yet.  GAP.
money     lib/money — whole rupees, ONE rounding (R2). Booqable shows paisa here
          (Rs.2,260.00); ours will differ on this very booking. Expected, ruled.
deposit   security_deposits table (its own table, with the
          payments_no_security_deposit check). Resolution chain global → product
          → client is the 29 Aug F2 spec addition; the exclusion rule captured in
          §10.3 belongs in that engine, not in the screen.
discount  ⛔ SUPERSEDED 31 Aug — Law 10 is now UNGATED (A0 D3; PLAN.md §0 Law 10).
          No reason, no approver, no cap below 100%, no role tier; 0074 and 0075
          dropped the DB constraints. Booqable's freedom IS the rule now.
          Captured 30 Aug, when the gate stood — verbatim: "lib/discount — Law 10:
          >10% needs reason ≥10 chars + named approver, 25% cap, DB constraint, no
          role bypass including Owner. / Booqable's 'Add a discount' has NO such
          gate. Do not copy its freedom."
writes    createRental → create_booking(jsonb) RPC (0059, NOT YET APPLIED)
          the four floor verbs: packRental · handoverRental · returnRental
          · completeReset  (all implemented)
          cancelRental · extendRental — NOT implemented, fail closed
docs      next_document_number(kind) mints refs; per-prefix sequences (F5, law)
```

### 10.7 Open decisions

1. **B4 — serial allocation at creation or at Pack.** §10.2 informs it; it does not settle it.
2. ⛔ **VOID (ruled 31 Aug: no gate).** ~~**Discount gate.** Booqable lets anyone discount freely. Law 10 does not. Confirm the floor understands that a >10% discount now needs a reason and a named approver — this is a workflow change for staff, not just a code rule.~~ **Nothing to confirm — there is no ceremony to explain.** The floor briefing that survives is the opposite one: discounts are ungated.
3. **Availability on the line.** `0 left` is genuinely useful at the bench and we have no local source for it. Either the Booqable bridge feeds it during the 7-month window, or the line shows nothing rather than a wrong number.

---

## 11. SCREEN 4 — Calendar (`/calendar/products`)

Captured live. Read-only.

### 11.1 It is a product × time gantt, not a calendar

This is the headline. The left axis is **products**, the top axis is **time**. There is no month grid, no day cells, no agenda. `/calendar/products` is the **only** calendar route on the account — no crew axis, no location axis, no booking axis.

**Structure**
- Header: rail toggle · `Calendar` · centred `Search…` · `Actions ▾`
- `Check availability` — blue primary, pinned at the top-left corner of the grid
- Left axis: product rows, alphabetical. Some carry a `⌄` and expand to variations / stock items, revealing the group code (e.g. `GRP-20-20-SKM-001`)
- Top axis: a month band (`August 2026` | `September 2026`) above day columns (`Wed 26`, `Thu 27`, …)
- Scale controls: `Day` · `Week` · `Month`, plus `Today`, `‹` `›` stepping, and a horizontal scrollbar
- **`Subscribe`** — the iCal feed
- **Today is a vertical green line**, not a highlighted column
- Bars are green blocks spanning day columns

**Bar label format** — worth copying verbatim:
```
{qty}x - {client name}    {start} – {end}  •  #{booking}
1x - Ronin Rana           06:00 – 06:00    •  #824
```
Quantity, who, when, and the booking ref in one line. Everything the floor needs to decide whether to click.

### 11.2 What this cannot do, and why it matters for us

Booqable's calendar answers exactly one question: *when is this product out?* It cannot answer *who is working Saturday?* — there is no crew axis, and no route for one.

Our Calendar module has to serve both. The schema already reflects that: **GiST exclusion constraints on crew double-booking and overlapping leave, releasable only by a logged conflict override.** Booqable has no counterpart, so this is R4 territory — a place where ours is deliberately larger, and a sync must never flatten it.

`[ruled]` Adopt the gantt for products. Add a **crew axis as a second view on the same shell**, sharing the scale controls and the today marker. Do not inherit the single-axis limit just because the reference has it.

### 11.3 Function

| Control | Effect |
|---|---|
| `Day` / `Week` / `Month` | time scale |
| `Today` | scroll to now |
| `‹` `›` | step by one scale unit |
| `Check availability` | availability lookup for a product/date range |
| `Subscribe` | iCal feed URL |
| `Actions ▾` | menu (not opened — may contain mutating items) |
| row `⌄` | expand product → variations / stock items |

### 11.4 Hover

`[observed]` **No preview card.** Hovering a bar gives nothing — no tooltip, no card. That is now three screens (Bookings list, Booking detail lines, Calendar) confirming the rich preview exists **only** on the Dashboard.

`[ruled]` If we build the preview card, the calendar bar is the single place it pays off most — a bar carries less information than a list row, so the hover has more work to do. Bind it to tap as well (Law 15).

### 11.5 Backend data link

```
rows      products_v, expanding to product_units_v  (the ⌄ rows)
bars      bookings ⨝ booking_lines filtered to the row's product,
          spanning starts_at → ends_at
scale     Day/Week/Month → the same periodRange engine already reused by
          /operations and the Dashboard panels. One date engine, three screens.
today     lib/bs — marker position is AD/UTC derived, rendered BS (Law 7)
crew axis crew assignments + the GiST exclusion constraints.  OURS ONLY.
avail     "Check availability" hits the same availability source as the line's
          "0 left" — Booqable-mastered today.  GAP (see §10.6).
iCal      Subscribe needs a token-authed READ-ONLY feed endpoint. It is a URL
          that leaves the building, so it carries no money and no client email
          — booking ref, product, and times only.
```

### 11.6 An anomaly in the live data, worth checking

Several bars read **`0x - Meera Gurung  06:00 – 06:00 • #898`** — quantity **zero** — on bookings that the Dashboard shows as `3 picked up`.

`[observed, unexplained]` A zero-quantity line is either a display convention we have not decoded, or real zero-quantity rows in the live data. Worth one query before the bridge copies them across. Flagged, not diagnosed.

### 11.7 Open decisions

1. **Crew axis** — same shell as products, or a separate screen? Same shell is cheaper and teaches one interaction.
2. **iCal scope** — which roles may mint a subscribe URL, and does it die when they leave? A feed URL is a credential with no expiry unless one is built.

---

## 12. SCREEN 5 — Inventory (`/product_groups`), Downtime, and Product detail

Captured live. Read-only — no `End`, no `Add stock items`, no save.

### 12.1 Inventory list

**Header:** `Inventory` · Search · `Add product` **with a split dropdown** (other create types behind the caret).
**Tabs:** `Products` · `Bundles` · `Collections` · **`Downtime`**
**Filter rail:** Product type · Product tax profile · Pricing structure template · Price ruleset — **all plain `All` dropdowns, no counts.**
**Pinned:** `Import` **and** `Export` (the Bookings list had Export only).
**Toolbar:** `Actions ▾` · `0 products selected` · `Select all 178 products` · `Showing 1-30 of 178` · pager.
**Columns:** thumbnail · `Name` · `Product type` · `Pricing` (`Flat fee Rs.4,000.00 per day`) · `Visible` (online-store visibility).

> **Inconsistency to not inherit:** Bookings filters are checkboxes with live counts; Inventory filters are bare dropdowns; and the Downtime tab **on this same screen** has counts again. Three idioms in one product. Ours picks one — faceted checkboxes — and uses it everywhere.

### 12.2 Downtime — CAPTURE GAP CLOSED, and bigger than the gap list implied

The 19 Aug list called this "Product → Downtime tab". It is that, **and** a top-level Inventory tab with its own screen. This is Booqable's entire maintenance mechanism.

**Filter rail (with counts):**

| Group | Options |
|---|---|
| **Attention required** | Starting today (0) · Ending today (0) · Overdue start (0) · Overdue end (0) |
| Status | Scheduled (0) · **Started (3)** ✓ · Ended (6) · Cancelled (0) — *Scheduled and Started pre-checked* |
| Reason | **Maintenance (3) · Repair (0) · Missing (0)** |
| Item type | Trackable (2) · … |

**Columns:** `Product` · `Identifier` · `Location` · `Reason` · `From ▲` · `Until` · `Status` · row action `→| End`

**Live rows (3):**
```
Sony GM 24mm F1.4                LEN-24-GM-SON-01    Maintenance  11-06-2026 → 31-08-2026  Started
DJI Ronin 4D 6K (Body Only)      CAM-R4D6K-DJI-001   Maintenance  28-06-2026 → 31-08-2026  Started
Hollyland 8 person comset, 1 pc  (no identifier)     Maintenance  24-08-2026 → 05-09-2026  Started
```
The third row has **no identifier** — a non-trackable/bulk item, which is why `Item type: Trackable (2)` counts only two.

**Two things this settles.**

1. **It is where two of the dashboard notes belong.** `gimble rest on aug 6` (#762) is a Downtime record with reason *Maintenance*. `Master headset missing` (#864) is a Downtime record with reason **Missing** — the enum already exists. §4.5 argued those notes were typed records living as prose; this is the type they should have been.

2. **`Attention required` is the exception-chip pattern, generalised.** Starting today · Ending today · Overdue start · Overdue end — four exception facets over one date range, each with a live count. Our design principles already logged `View late (N)` as an adoption; this is the better, more general form.

`[ruled]` **Every dated workflow in our app gets the same four-way exception group** — starting today, ending today, overdue start, overdue end — driven by the same date engine. One pattern, one implementation, every screen that has a start and an end.

### 12.3 Product detail — eight tabs, URL-routed

`/product_groups/{uuid}/{tab}` — the tab is in the path, so tabs are linkable and back works.

`Inventory` · `Variations` · `Pricing` · `Settings` · `Online store` · `History` · `Downtime` · `Cross-sell`

> Corrects the 29 Aug note: there is no "Info" tab — it is **`Settings`** — and `Downtime` is a product tab **as well as** a top-level one.

**Header:** `Duplicate product` · rail toggle.
**Right rail:** `Tags` · `Barcode` (Add barcode) · `Collections (1)` → *Lights* · `Notes` (Add note) · `Activity logs`.

**Inventory tab** — the stock items
- Sub-tabs `Current stock (1)` · `Expected stock (0)` *(incoming stock — a purchasing concept we do not have)*
- Controls: `Search identifier` · `Filter by status` · `All types` · `Add stock items`
- Columns: `Identifier` · `Status` · `Type` · **`Purchase cost`** · **`Purchase date`** · `Available from` · `Available until`
- Row: `APURTURE-1200X-LIGHT-01` · ● In stock · Regular

**Pricing tab**
- **`Charge for this product`** ✓ — *"Disable this option if you don't charge money for this item."* The free-item toggle, confirmed.
- **Pricing method** — three radios: `Flat fee` (Price `Rs.4,000.00` + Per `Day`) · `Fixed price` (per booking) · `Pricing structure` (tiered)
- `Preview pricing`
- Discounts: *"Customer and coupon discounts can be applied to this product on both online and manual orders"* — per-product discount eligibility
- **Security deposits** → `Security deposit value` = **Rs. 0.00** — *"Set the amount used to calculate the security deposit for orders. You can adjust how deposits are charged in Pricing settings."*
- **Default purchase cost** → `Default cost per item` = **empty** — *"Set a default purchase cost of this product to calculate ROI. This value will be used as a default and fallback for all past, current, and future items."*

**History tab**
- Columns: `Date` · `Action` · `Items` · `Booking` · `Customer` · **`Employee`**
- The per-unit movement ledger naming who did it — confirmed.
- **Empty for this product, and it draws no empty state** — bare column headers over blank space. Our `PageBody` already solves this; it is a place ours is simply better.

### 12.4 THE OPERATIONAL FINDING — read this one

On this product, **both** money inputs are unset:

```
Security deposit value   Rs. 0.00     ← product level
Default cost per item    (blank)      ← product level
Purchase cost            (blank)      ← unit level, APURTURE-1200X-LIGHT-01
```

Two consequences, both live today:

1. **Deposits are not being charged on this product.** This is exactly why booking #906's `Security deposit` computed `Rs.0.00` (§10.1) — not a bug, an unset field.
2. **The depreciation / ROI model has no input data at all.** Purchase cost is *the* input, and it is empty at both the unit level and the product-level fallback.

`[ruled]` This is **not a spec problem — it is a data problem in the live system**, and no amount of correct code fixes it. Every ROI, depreciation and asset-value report we build will correctly render zeros until purchase costs and deposit values are entered. Decide whether to backfill them in Booqable during the bridge period or at import; do not discover this after the reports are built.

> Sampled on one product. Worth one query across all 178 before deciding — the fix is data entry either way, but the size of the job is unknown.

### 12.5 Backend data link

```
list      products_v  ·  units: product_units_v
cost      unit purchase_cost, falling back to the product-level default.
          This IS the depreciation engine's input. Model the fallback in the
          engine, not the screen (Law 1).
deposit   product-level deposit value; resolution chain global → product →
          client is the 29 Aug F2 addition. The exclusion rule captured in
          §10.3 lives in the same engine.
downtime  maintenance / cases.  reason ENUM Maintenance · Repair · Missing.
          status Scheduled → Started → Ended (+ Cancelled).
          A unit on downtime must be unavailable — the same overlap problem the
          crew GiST constraints already solve; use the same mechanism.
history   audit_events + the existing audit trigger on inventory_units,
          actor rendered as the Employee column.
facets    "Attention required" is four date predicates over one range —
          feed them from periodRange, same engine as everywhere else.
GAP       Settings · Variations · Online store · Cross-sell tabs NOT opened.
          The 19 Aug "buffer before/after in hours per product" was not found
          on Inventory, Pricing or History — it is presumably under Settings.
          STILL OPEN.
```

### 12.6 Open decisions

1. **Backfill purchase cost and deposit value, or accept zero-valued asset reports for the 7-month bridge?** Blocks any depreciation work.
2. **Downtime: its own module, or folded into cases?** It has its own lifecycle, reasons and exception facets — that argues for its own module with cases linking to it.
3. **`Expected stock`** — do we model incoming stock at all? Booqable does; we have no purchasing flow.
4. Minor: the identifier reads `APURTURE-1200X-LIGHT-01` for a product named *Aperture*. Our `products_asset_code_format` CHECK constrains shape, not spelling — a typo'd code is permanent once units exist.

---

## 13. SCREEN 6 — Product Settings tab, Variations, and Customers

Captured live. Read-only — nothing saved, nothing enabled, nothing created.

### 13.1 Product → Settings tab: BOTH remaining product gaps closed

**The buffer setting is here.** Bottom of the Settings tab, its own section:

```
Buffer time
  Buffer before   [ 0 ] [Hours ▾]      Buffer after   [ 0 ] [Hours ▾]
```

Helper copy, verbatim: *"Temporarily mark items as unavailable before or after bookings to accommodate preparation, cleaning, maintenance, or unexpected events like late returns."*

And below it, **an inline worked example**: a mini four-day gantt showing `1x Macbook pro 12:00–18:00` with hatched zones either side and the annotation *"This item can't be rented out during buffer time."*

Three things this settles:

1. **The 19 Aug "buffer before/after in hours per product" taking now has its exact home**: product Settings tab, value + unit, before and after independently.
2. **Both buffers are `0` on the sampled product.** The cleaning-window feature is *unused* in the live system — the same data pattern as §12.4 (deposits unset, purchase costs unset). The features our specs most admire are the ones this business has not switched on.
3. **The inline-example pattern is worth adopting**: a setting that changes availability *draws its effect* right in the form. Our buffer setting should render the same picture from the same date engine — not a static illustration.

**Also on this tab:**
- `Name` · `Stock Keeping Unit (SKU)` = `APURTURE-1200X-LIGHT` — so §12.6's typo'd unit identifier is *inherited from the SKU*; fix the SKU spelling and new units follow.
- **`Description on documents` is the kit-contents-as-prose anti-pattern, live**: a "What's Included:" list of 11 components (Control Box, Power Cable, Head Cable, Reflector, 120cm Softbox, Jumbo Stand, Socket, Sand Bag, Bowens Mount Cap, Clamp/Controller Clamp, Carrying Case) in a free-text field. Invisible to packing lists, damage records and per-component tracking — the registered anti-pattern, photographed in the wild.
- **`Delete product` is a red button sitting at the form footer next to `Cancel`/`Save`.** Ours has no delete (Law 3 — nothing is deleted), and no destructive control lives in a form footer.

### 13.2 Product → Variations tab: gap closed, minor

Opt-in feature, off for this product: *"Enable variations if this product comes in different options, like sizes or colors."* One `Enable variations` button. A sizes/colours mechanism aimed at apparel-style inventory; nothing in it for cinema gear that stock items don't already do. **Drop** — noted so nobody re-opens the question.

### 13.3 Customers list (`/customers`)

**Rail:** `Customer type` — Individual **(338)** · Company **(30)** · `Marketing emails` — Subscribed **(190)** · Not subscribed **(178)** · `Customer tax profile` — bare `All` dropdown · `Customer created` — `All time` date · `Import` + `Export` pinned.

> The mixed-idiom disease again: faceted counts and a bare dropdown *in the same rail*. (Also: volume was 358 customers at the 19 Aug capture, 368 now — 10 new in 11 days.)

**Columns:** `#` · `Name` · `Email` · `Created at` · `Latest order`. Sequential client refs (`#377`, `#376`, …) — the E5 adoption, confirmed live. Toolbar identical in shape to Bookings/Inventory: `Actions ▾` · `Columns` · pager · `Select all 368 customers`.

### 13.4 Customer detail — the 19 Aug capture gap, closed

**Breadcrumb** `Customers › Aadarsha Sitoula` · **four tabs**: `Information` · `Bookings` · `Payment methods` · `Accounts`.

**Information tab:**
- General information: name field; helper copy *"The information you enter here will be used on documents like invoices and to identify the customer."*
- Information column: `Email` · `Subscribed to marketing emails` checkbox · `Customer type` (Individual ▾)
- **Settings column: `Discount percentage` [ 0 ] · `Tax profile` [ 13% VAT ▾]**
- `Custom fields` section with a `Manage custom fields` link — `Phone` renders with a country-flag picker (🇳🇵 default)
- Right rail: `Tags` · `Barcode` (**a barcode per client** — check-in by scan) · `Notes` · `Activity logs`

### 13.5 The find: a standing per-client discount, and what it does to Law 10

> ⛔ **MOOT since 31 Aug.** This section reasons about a Law 10 ceremony that no longer
> exists — discounts are UNGATED, so a standing 15% needs no approver and breaches no
> threshold. `standing_discount_pct` exists on no table. What survives is a data-model
> question with no ceremony attached: *should a standing client discount be a membership
> plan or a column on `clients`?* Filed that way in §13.7 #1. The observation below —
> that live clients #371 and #363 carry standing discounts — is real and worth keeping.

`Discount percentage` on the client is a **standing discount applied to every booking**. Law 10 gates *a* discount: >10% needs a reason ≥10 chars + a named approver, 25% cap, DB constraint, no role bypass.

So: a client with a standing 15% breaches the threshold **on every booking**. Approve once at the client, or once per booking? The difference is real — approve-once means one audit row authorises an open-ended stream of discounts; per-booking means the approver signs each time and the floor feels the friction.

`[ruled — proposal, needs Babin]` A standing client discount **>10% requires the Law 10 ceremony once, at the client**, writing one `audit_events` row; each booking that *applies* it references that authorisation rather than re-approving. Raising the percentage re-triggers the ceremony. The 25% cap binds the sum of standing + per-booking discount. This keeps the DB constraint one rule with one input.

Also in that column: **per-client `Tax profile`**. Our model has a single 13% VAT. A client-level tax profile exists in Booqable (13% VAT was the value here, but the *mechanism* allows others — presumably 0% for exempt orgs). Open decision, finance-flavoured.

### 13.6 Backend data link

```
list       clients_v / client_directory_v — facets: type, (marketing n/a)
detail     fetch by client id; custom fields join
discount   NEW CLIENT FIELD: standing_discount_pct — feeds lib/discount, which
           already owns Law 10. The gate lives in the engine, never the screen.
tax        per-client tax profile — GAP, single-rate today; decision needed
barcode    client barcode → @zxing scanner already in the stack; check-in by scan
custom     ONE custom-fields system serves per-booking "Add field" (§10.1) and
           per-client fields, with ONE admin surface (Manage custom fields)
accounts   CAPTURED in §14.1 — invite-only portal accounts, binding by
           construction. The deny-all on the 3 portal_* tables can end.
```

### 13.7 Open decisions

1. **Standing client discount × Law 10** — §13.5's proposal, needs a yes/no.
2. **Per-client tax profile** — support, or single-rate with exempt handled at invoice level?
3. **Client barcode** — adopt for check-in? Cheap: the scanner exists.
4. ~~Accounts tab~~ — captured, see §14.1.

---

## 14. SCREEN 7 — Customer Accounts tab, Documents register, Reports index

Captured live. Read-only — no invite sent, no report run.

### 14.1 Customer → Accounts tab: THE PORTAL BINDING, ANSWERED

The tab renders an empty state, and the empty state *is* the answer:

> **"Add your first customer account."**
> *"Send an invite to a user to create a customer account and add their details. This saves customers time and ensures orders are placed under the correct profiles."*
> `[Send invite]`

**The model:** a portal login is created **by a staff-side invite sent from the client record.** The account is born *under* the client — the binding is established at creation, by construction. There is no self-registration and no email-matching heuristic anywhere in the flow.

This is the answer to the question that has kept `portal_users` / `portal_sessions` / `portal_auth_challenges` deny-all since 11 Aug:

```
portal_users        rows are INSERTED BY STAFF with client_id set — the invite
                    carries it. No inference, ever.
portal_sessions     bind to a portal_user; RLS = session.portal_user.client_id
portal_auth_chal.   scoped the same way
invite flow         mint token → email link → account activates ON the client
```

`[ruled — proposal]` Adopt the invite-only model verbatim. It is the *safe* binding (the 11 Aug fear was "guessing it wrong exposes one client's data to another" — invite-only removes the guessing), it matches how a B2B rental house actually onboards clients, and it means migration 0054's documented deny-all can finally become real policies.

Also observed: **zero portal accounts exist** — this client (and, per the empty state, every client) has none. The portal feature is unused live. That is the fourth unused feature (deposits, purchase costs, buffers, portal), and together they say something important: **the bridge import will carry operational data, not configuration.** Configuration — deposits, costs, buffers, portal invites — starts from us.

And a small observation with a big consequence: this empty state (headline + explanation + primary action) is Booqable's *good* empty-state pattern — the History tab (§12.3) drew nothing. Even the reference is inconsistent; our `PageBody` does it uniformly.

### 14.2 Documents register (`/reports/documents/invoices`)

**Tabs:** `Invoices` · `Contracts` · `Quotes` — three registers, one screen. **Metric strip (four tiles):**

```
Nr. of invoices   667
Paid amount       Rs.8,936,852.86
Revenue           Rs.10,124,768.39   ⓘ
Due               Rs.1,393,799.68    ⓘ
```

**Rail:** `Finalized` (All ▾) · `Sent` (All ▾) — **finalisation and sending are independent lifecycle facts** — then `Payment status` checkboxes with counts (Payment due 77 · Partially paid 36 · Paid 547 · Overpaid 7 · Process deposit 0 — sums to 667) · **two date filters**: `Date range` (invoice date) and `Due date` · `Export`.

**Columns:** `#` · `Booking` · `Customer` · `Invoice date` · `Due date` · `Excl. taxes` · `Incl. taxes` · `Deposit` · `Due` · `Payment status`.

**Three live observations worth money:**

1. **`#29-R1` is in the register.** The invoice-revision suffix (E3 adoption: revisions keep the number, append `-R1`) is not a design note — it is live practice on this account.
2. **An overdue `Due date` renders as an amber pill with a clock icon** (`🕐 27-05-2026`) — the date itself becomes the alert, in the date column, no separate flag column. Cheap and excellent; adopt.
3. **667 documents, but the highest invoice number is #33** (list sorted by `#` descending: 33, 32, 31, 30, 29-R1, 28…). With the `Finalized` filter and the pro formas seen on #906's sidebar, the model is plain: **documents live unnumbered as pro formas; a number is minted at finalisation, and finalisation freezes them.** `[inference — verify with one Finalized=Yes filter click]` Our schema already agrees (invoices immutable once issued, Void + Credit Note) — what this adds is that *the register must carry both populations* and expect most rows to be unnumbered.

### 14.3 The two-revenue mystery — CLOSED, both definitions verbatim

| Screen | Figure today | Tooltip, verbatim |
|---|---|---|
| Bookings list | Rs.10,106,318.39 | "The total amount before taxes, including unpaid orders." |
| Invoices register | Rs.10,124,768.39 | "The total amount on **finalized invoices** before taxes, including unpaid invoices." |

Different populations — **orders** vs **finalized invoices**. They can never agree, and neither is wrong. Note the register's figure is *higher*; `[hypothesis]` the bookings strip computes over the default scope which excludes Cancelled (§9.2), while cancelled bookings' finalized invoices still count in the register. One query verifies.

This completes what §9.3 started: every money figure on every screen now has a name. The 19 Aug open item is closed in full.

### 14.4 Reports index (`/reports`)

**Audience-grouped** (the E8 finding, confirmed live), each group with a one-line purpose and each report with a one-line promise:

| Group | Reports |
|---|---|
| Business reports | Company performance |
| Inventory reports | Product performance · Availability · Product fulfillment |
| Customer reports | Customer report |
| Coupon reports | Coupons |
| Activity | Activity logs |
| Background tasks | Background tasks |

**Eight entries.** Against our **31 designed / 12 built** report pages. Two lessons, not one:

1. Booqable ships eight reports and runs a business of 654 bookings on them. The pressure our 31 reports answer is real, but the *index* must not present 31 equal doors. **Adopt the audience grouping and the one-line promise per card** ("See how often products are rented out and how much they made") — a report card that states its question is the difference between a reports *menu* and a reports *pile*.
2. Between the 18 Aug archive and today, Booqable **renamed** two reports (Pickups → Product fulfillment; Rental products → Product performance). Their names drift; their routes (`/reports/pickups`) do not. Name from the route, not the label, when the bridge maps anything.

### 14.5 Backend data link

```
accounts   portal_users (+invite token flow) — see §14.1; unblocks 0054's
           deny-all → real policies
register   invoices ⨝ bookings ⨝ clients; payments for Paid amount
           facets: payment_status counts (booking_facets() pattern, §9.2)
           TWO date dimensions: issued_at AND due_at — listQuery already
           supports a date range; it needs to support naming WHICH column
overdue    due_at < today AND not Paid → amber pill treatment in the date cell
numbering  next_document_number() fires at FINALISATION, not creation —
           matches the pro-forma model; per-prefix sequences (F5) unchanged
reports    audience-grouped index; each card = {question, route, roles}.
           Money-blind roles: money-question cards are NOT BUILT (Law 6),
           so the index a Warehouse operator sees is genuinely shorter.
```

### 14.6 Open decisions

1. **Portal invite-only model** — §14.1's proposal. Unblocks three tables and the whole client portal.
2. **Register scope** — one register screen with three tabs (theirs) vs our Documents module's current shape. Theirs wins on "everything issued, one place"; confirm.
3. **Reports index regrouping** — our 31 into audiences (Owner / Finance / Floor / Clients), with per-card one-line promises. Cheap, high-value, zero schema.

---

## 15. SCREEN 8 — The report pages: Company performance & Availability

Captured live. Read-only — reports are views; nothing was generated or exported.

### 15.1 Company performance (`/reports/company_performance`)

The source of the E1 Owner Report skeleton, now seen in full.

**Rail:** `Reporting period` (This month, `01-08-2026 → 31-08-2026`) · **`Comparison` (`Previous year` ▾)** · `Status` facets **with counts scoped to the period**: Draft (2) · Reserved (0) ✓ · Started (5) ✓ · Returned (99) ✓ · Archived (0) ✓ · Canceled (36).

**Body, top to bottom:**
1. KPI strip — `Total revenue Rs.838,665.00` · `Bookings 104` · `Total items ordered 550` · `New customers 25`, each with ⓘ
2. `Revenue over time` — daily line chart across the period
3. `Order metrics` — second KPI row: `Average order value Rs.8,064.08` · `Avg. rental duration 1 day 14 hours` · `Avg. items per order 5.3` · **`Fulfillment rate 100% ↑ 100pp`** (delta vs the comparison period, in green)
4. `Average order value over time` — second chart

**The KPI definitions, captured verbatim:**

| KPI | Tooltip |
|---|---|
| Total revenue | "Total revenue (excl. taxes) from orders **starting within** the selected period." |
| Bookings | "Total number of orders within the selected period." |
| Total items ordered | "Total number of items ordered within the selected period." |
| New customers | "Number of new customers created within the selected period." |

**This is a THIRD revenue definition.** The estate now reads:

| Where | Population | Attribution |
|---|---|---|
| Bookings list | all non-cancelled orders, unpaid included | none (running total) |
| Invoices register | finalized invoices, unpaid included | none (running total) |
| Company performance | orders | **rental start date in period** |

Three screens, three formulas, all reasonable, all different. Without the tooltips this is three "Revenue" labels that never agree. With them it is a coherent system. **The money-tile-definition rule (§9.3) is now proven three times over.**

**Contextual scope defaults — a subtlety worth copying deliberately:** the *list* default excludes Cancelled + Archived (includes Draft); this *report* default excludes Cancelled + **Draft** (includes Archived). A report counts business done; a worklist counts work that exists. Same facet component, different default per context — parameterise the default, don't hard-code it into the component.

**The comparison mechanism:** one `Previous year` dropdown drives every delta on the page (`↑ 100pp` on fulfillment). Our kpiEngine's `delta {direction, text, good?}` contract already matches this shape — what it gains here is the *page-level* comparison selector rather than per-tile baselines.

### 15.2 Availability (`/reports/availability`)

**Rail:** `Filter` → **`With shortage`** checkbox (the E7 adoption, live) · `Reporting period` (This week) · `Tag` cloud.
**Body:** `Search for products` · two sortable columns: `Product` · `Available` (count for the period).

Two lessons:

1. **The report is one question asked well** — "how many of each product are free this week?", with one exception filter (`With shortage`) to invert it into a problem list. This is the *shape* our smaller floor reports should have: one question, one table, one exception toggle.
2. **The tag cloud is the taxonomy failure rendered as UI.** Hundreds of single-use SEO tags (`1.4 (1)` · `100MM (1)` · `1TB CFEXPRESS CARD (1)` · …) presented as a filter rail. Every tag matches one product, so the filter is useless — the 19 Aug "tags are not a taxonomy" finding, demonstrated as wreckage. Ours: tags get a vocabulary or they don't get a filter.

### 15.3 Backend data link

```
company    kpiEngine over bookings ⨝ booking_lines ⨝ clients, period-scoped;
           attribution = starts_at (per the captured definition, matching the
           06:00 day question — same engine input)
compare    page-level comparison selector → kpiEngine delta{} per tile
scope      report default: Reserved+Started+Returned+Archived; list default:
           all but Cancelled/Archived. Parameterised default per surface.
avail      availability = stock − overlapping plannings (Booqable-mastered
           today; the §10.6 GAP applies here too)
shortage   "With shortage" = rows where available < 0 for any day in period
charts     Revenue/AOV over time — our Charts LineChart already fits
duration   "1 day 14 hours" — avg duration formatting; lib/format needs a
           duration formatter (ours renders days only)
```

### 15.4 What this means for the 31-report program

Booqable's Company performance ≈ our Pulse + Owner Report combined, and it is ONE page with six numbers, two charts, and a comparison dropdown. The babin-report-excellence skill's answer-first structure is *more* opinionated than this — keep ours — but two mechanics transfer directly: the page-level comparison selector, and per-KPI ⓘ definitions (which the skill should require on every money figure, per §9.3's rule).

### 15.5 Open decisions

1. **Revenue attribution for OUR reports** — by rental start (theirs), by invoice date, or by payment date? Three defensible answers; the Owner Report must pick one and name it on the tile.
2. **Comparison periods** — previous period / previous year / none. kpiEngine supports deltas; the selector is UI work only.
3. **Duration formatter** — adopt "1 day 14 hours" formatting into lib/format.

---

## 16. SCREEN 9 — Coupons and Activity logs (the last 19 Aug gaps)

Captured live. Read-only.

### 16.1 Coupons (`/coupons`)

**Rail:** `Status` — Active (5) · Inactive (0) · `Coupon validity` ⓘ (All time).
**Columns:** `Coupon code` · `Discount` · `Minimum spend` ⓘ · `Eligible items` · `Usage` ⓘ · `Start date` · `End date` · `Status` · `Tags`.

**The five live coupons:**

| Code | Discount | Eligible items | Usage | Window |
|---|---|---|---|---|
| THUNDER25 | −25% | Amaran 200d S LED Video Light, +24 | 0 used | 01-09 → 30-09-2026 |
| SUJAL15 | −15% | (all) | **0/1 used** | — |
| WOMENINFILM | −5% | (all) | 0 used | — |
| STUDENT10 | −10% | 77mm Close-Up Filter, +169 | 6 used | — |
| Student with college letter | −20% | (all) | 1 used | — |

**What a coupon actually is here:** a **pre-authorised discount policy** — percentage + minimum spend + product scoping + usage limit (`0/1 used`) + validity window + active toggle. And the codes are *policies with names*: `WOMENINFILM`, `STUDENT10`, and `Student with college letter` — that last one has spaces in it, so it is not a marketing code typed at checkout; it is a policy a staff member applies at the counter when shown a college letter.

> ⛔ **The Law 10 question this resolves was itself closed on 31 Aug — no gate at all.**
> The coupon *mechanism* below (pre-authorised policy: scope, expiry, usage limit) stays
> interesting as a product idea; the ceremony arithmetic around it no longer applies.

~~**This resolves the Law 10 question §13.5 opened, and in Booqable's favour of the same shape:**~~

Two of these coupons (−25%, −20%) exceed the >10% threshold — but a coupon is authorised **once, at creation**, with scope, expiry and usage limits attached, then *referenced* per booking. Booqable therefore runs two discount mechanisms with two authorisation models:

| Mechanism | Authorised | Our mapping |
|---|---|---|
| "Add a discount" (§10.1) | never (no gate) | Law 10 ceremony **per booking** |
| Coupon | once, at creation | Law 10 ceremony **once, at policy creation** |

`[ruled — proposal]` Adopt **discount policies** as a first-class object: `{code, pct, scope, window, usage_limit, authorised_by, reason}` — created under the full Law 10 ceremony, then applied by reference. The standing client discount (§13.5) becomes a policy scoped to one client, so there is ONE authorisation model, not three. The 25% cap binds policy + ad-hoc combined per booking, one DB constraint. `Usage (6 used)` gives the audit trail per application for free.

### 16.2 Activity logs (`/reports/activity_logs`)

**Layout:** master-detail. Left rail = date filter (`All time`) + **actor filter (`Anyone` ▾)** + a chronological list grouped by day; right pane = *"Choose an activity log in the sidebar to inspect details."*

**The rows are sentences.** Verbatim from today's real operations:

```
Pick up CFX-A-LEX-002 on Booking #898              Rupesh Karki  21:08
Book and reserve CFX-A-LEX-002 on Booking #898     Rupesh Karki  20:59
Return 8 different items on Booking #901           Rupesh Karki  20:42
Reserve Booking #905                               Rupesh Karki  20:21
Reserve Booking #906                               Rupesh Karki  20:20
Change return time of Booking #900 to 2026-09-01 06:00:00        20:20
Receive Rs.4,000.00 in payment                     Rupesh Karki  20:14
Change discount of Booking #901                    Rupesh Karki  20:14
Update Tilta Mirage Matte Box Basic Kit + VND in Komodo + …      19:57
```

**This is the renderer the §4.5 ruling needs.** Our Dashboard feed reads `audit_events`; this screen shows how those events become legible: **one sentence template per event type**, actor chip, time, entity links. Copy the pattern, not the strings:

- Template registry: `pickup(unit, booking)` → "Pick up {unit} on {booking}" — one template per audit event type, tested, so a new event type without a template fails loudly rather than rendering JSON.
- **The actor filter is the Employee dimension** of the product History tab (§12.3), generalised to everything.
- Money appears inside sentences ("Receive Rs.4,000.00 in payment") — Law 6 means money-blind roles get the event with the amount elided ("Receive a payment"), not the event hidden.
- **"Change discount of Booking #901" happened today with no ceremony** — the Law 10 contrast, caught live in the log.

### 16.3 Backend data link

```
coupons    proposal: discount_policies table {code, pct, scope(product/client),
           window, usage_limit, authorised_by, reason} + applications counted
           via booking_discounts referencing the policy. lib/discount owns the
           combined-cap rule. Creation writes the Law 10 audit_events row.
           ⛔ 31 Aug: BOTH lines above are now false. lib/discount validates
           arithmetic only (0–100); there is no combined cap and no Law 10
           ceremony, so creation writes no approval audit row. See §16.1.
activity   audit_events (already triggered on 6 tables) + a sentence-template
           registry per event type; actor filter = users join; per-entity
           scoping already exists (booking sidebar "View activity logs").
detail     right pane = event payload inspection — not opened; assume diff
           view; ours renders the audit row's before/after.
```

### 16.4 Gap ledger — where the 19 Aug list now stands

| Gap | Status |
|---|---|
| Product → Downtime | **closed** (§12.2) |
| Product → Variations | **closed** (§13.2) |
| Customer detail | **closed** (§13.4, §14.1) |
| Coupons screen | **closed** (§16.1) |
| Activity logs screen | **closed** (§16.2) |
| New customer form | still needs a re-save by Babin (truncated archive file) |
| Scan a barcode | open — needs hardware interaction, low spec value |
| Background tasks | pane renders empty with no empty state (§17.3); archive documents the populated shape |

### 16.5 Open decisions

1. **Discount policies** (§16.1) — one authorisation model unifying coupons, standing client discounts and the ad-hoc gate. The biggest single simplification this capture has produced; needs a yes.
2. **Sentence-template registry** for audit event rendering — one template per event type, enforced.

---

## 17. SCREEN 10 — The tail: Quotes & Contracts registers, Product fulfillment, Background tasks

Captured live. Read-only.

### 17.1 Quotes and Contracts registers (`/reports/documents/{quotes|contracts}`)

Same screen as Invoices (§14.2), tab-routed by URL. Shared columns: `#` · `Booking` · `Customer` · **`Confirmed` · `Signed`** · `Document date` · `Excl. taxes` · `Incl. taxes`.

**Volumes:** 768 quotes · 86 contracts (19 Aug: 699 · 84).

**The numbering finding that completes §14.2:** quotes are **numbered at creation** — all 768 carry sequential numbers, the newest (#768, quote for booking #907) minted today. Invoices are numbered **at finalisation** (667 documents, highest number 33). Two numbering policies live in one system, by document type:

| Document | Number minted | Why it works |
|---|---|---|
| Quote | at creation | quotes are cheap, revisable, plural |
| Invoice | at finalisation | an invoice number is a legal fact; pro formas stay unnumbered |

`[ruled — proposal]` Ours adopts exactly this split: `next_document_number('quote')` fires at creation, `next_document_number('invoice')` at finalisation. One sentence in the numbering law (F5) settles it.

**Quotes outnumber bookings (768 > 654).** Multiple quotes per booking is normal practice — #903 carries quotes #763, #764, #765. A re-quote is a new numbered document, not an edit. This matches the E3 revision philosophy and our immutability law.

**Contracts carry `Confirmed` and `Signed` lifecycle columns** — visible rows show document dates with those two blank, so the signature workflow exists and is largely unused (consistent with §14.1's conclusion: configuration features are unused; the bridge imports operations).

### 17.2 Product fulfillment (`/reports/pickups`)

Minimal: `Reporting period` (**defaults to Today**) · `Export` · results table — today showing a proper **`No results found`** empty state (nothing goes out on 31-08).

Two notes: the Dashboard's "Run report" (§4.3) lands here with the panel's context, making this the drill-down of *Going out* — the report and the panel must share the `todaysOutgoing` filter set or they will disagree. And this page HAS an empty state while Background tasks (below) and product History (§12.3) draw none — the inconsistency catalogued one final time.

### 17.3 Background tasks (`/reports/background_tasks`)

The main pane renders **nothing** — nav only, no table, no empty state, on two visits. Either an empty queue with no empty state, or the screen requires a task in flight. The 18 Aug archive documents its populated shape (queue with Failed states and downloadable output); nothing new was extractable live. Our equivalent keeps `PageBody`'s guarantee: an empty queue *says* it is empty.

### 17.4 Customer report (`/reports/customers`) — recovered

Captured on a second visit (fresh tab). Richer than its index card promised.

**Rail:** `Performance` period (This week) · **`Show revenue by: Bookings`** — an **attribution selector** · Status facets with period counts (Draft 3 · Reserved 2 · Started 2 · Returned 2 · Archived 0 · Canceled 0) · Customer type · Marketing emails · Customer created · Latest order (two date dimensions again) · `Export`.

**Metric strip:** `New customers 2` · `Total revenue Rs.37,500.00` · `Average order value Rs.6,250.00` · `Total balance due Rs.36,100.00`.

**Columns:** `#` · `Name` · `Email` · **`Discount %`** · **`Balance due`** · `Bookings` · `Revenue` · `Revenue %` · `Avg. order value` · **`AOV deviation`** · `Tags`.

Three things this settles or sharpens:

1. **Revenue attribution is a USER CONTROL here, not a fixed formula.** `Show revenue by` (showing `Bookings`; the other options sit behind a custom dropdown, not opened) means Booqable's answer to Appendix A's attribution question is *let the reader choose, and label the choice*. That is a stronger pattern than picking one: the Owner Report can default to one attribution and expose the selector, provided the tile names the current choice (law L1 covers it).
2. **A live standing client discount exists: client #371 (Sakriya Kafle), `Discount % = 10%`.** The §13.5/D3 collision is not theoretical — the mechanism is in use today, sitting exactly at the Law 10 threshold. D3's ceremony-once-at-the-client proposal now has a concrete migration case.
3. **`AOV deviation` (e.g. `-4%`) is a comparative per-row metric** — each client against the company average. Cheap to compute, immediately readable, worth adopting in our client reports. `Balance due` per client + `Total balance due` on the strip is the skeleton of our unbuilt Overdue Receivables report — reuse `data/liquidityReports` as already planned.

### 17.5 Still not captured

**Scan a barcode** needs hardware. **New customer form** still needs Babin's re-save (§16.4). The `Show revenue by` option list — one click, next live session.

---

## 18. SCREEN 11 — Bundles, Cross-sell, Online store, Packing slip, Quote (the "missing things" pass)

Captured live, read-only. One deliberate exclusion: **`/orders/new` was NOT opened** — Booqable creates draft orders eagerly (6 drafts exist on the account), so opening the new-booking screen is a write. The "add equipment" surface is already captured anyway: Booqable's new booking IS an empty Booking Detail (29 Aug note), and §10.1 documents its line editor (search-to-add + barcode + steppers) in full.

### 18.1 Bundles — the other half of the kits-vs-bundles confusion

**List** (`Inventory ▸ Bundles`): **46 bundles** (51 on 19 Aug — the 18 Aug renaming consolidated five away). Columns: thumbnail · `Name` · inline tag chips · `Online store` Visible pill. **No price column** — a bundle's price is not a stored number. Rail: Tag chips (meaningful here — `FX3 BUNDLE`, `SONY 2` — unlike the product tag wreckage). Tier-suffix naming from the 18 Aug pass is live: *RED Komodo + Nisi - **Lite***, *Sony FX3A + Thypoch Simera-C - **Premium***.

**Detail** (`RED Komodo + Nisi - Lite`) — four tabs: `Contents` · `Pricing` · `Settings` · `Online store`.

**The Contents tab is the finding.** True bundles have **structured component lines**:

| Column | Example row |
|---|---|
| ☰ drag · thumbnail · Product | Red Komodo 6k Camera |
| Variation | — |
| Pricing (the component's own rate) | Flat fee Rs.8,000.00 per day |
| **Discount %** | `68˜` |
| **Discounted price** | Rs.2,500.00 |
| Quantity (steppers) | 1 |
| Total | Rs.2,500.00 · remove `×` |

Nine components, discounts 40–90% (camera 68˜ → Rs.2,500 · lens 40% → Rs.3,000 · CFast cards **90%** → Rs.100 · matte box 70% · monitor 80% · batteries 80%). The `˜` marks percentages **derived from a target price** rather than entered round. **The bundle's price IS the sum of its discounted component lines** — `Preview pricing` shows the composition; the Pricing tab holds only `Taxable` + a product tax profile + `Eligible for discounts`.

Three consequences:

1. **The 19 Aug confusion is fully resolved.** True bundles = structured lines with pricing math. Kit-style *products* = prose in "Description on documents". Both halves now captured; ours models both as `bundle_items` rows and generates any prose views from structure.
2. **Component Discount % is PRICE COMPOSITION, not a discount event.** A 90% figure inside a bundle definition must never touch any discount gate or cap — it is how the bundle's price is built, not a concession to a client. Keep `bundle_items.component_price` a separate concept from `booking_discounts`, whatever D3's final shape.
3. **Note #870 ("Don't book bundle components") is explained.** Components carry steep in-bundle discounts (90% off cards); the operational rule exists because booking components separately breaks both the pricing and the auto-reservation. Ours enforces it structurally — bundle components are not independently bookable while their bundle line exists — instead of by a sticky note.

### 18.2 Product ▸ Cross-sell and Online store tabs (gaps closed)

**Cross-sell:** one `Recommended products` search-to-add list — per-product storefront recommendations, *"visible when Cross-sell is enabled in Settings"* (a global gate). Empty on the sampled product. **Defer** — a storefront concern for the post-bridge era; nothing operational.

**Online store:** `Show in online store` toggle — with the nuance that a hidden product *"can still appear as a cross-sell recommendation on other products' pages"* — plus a **second, marketing Description** (rich text; `Write AI product description BETA`; `Excerpt` for tight spaces) and an SEO block (`Page title`, 0/60 chars guidance).

**So a product carries TWO descriptions:** the marketing one (storefront) and "Description on documents" (§13.1 — what prints on quotes and packing slips). Ours keeps that split, but the documents side is *generated from structure* (§18.4), not hand-typed.

### 18.3 Packing slip (`/orders/{uuid}/packing_slip`)

Header actions: `Print` · `Download` only. Right rail: `Tags` · `Notes` — **per document**.

The document: client block (name · email · phone) · company block (address, phone, email, plus-code, link) + logo · `Booking #906` / From / Until · then **`Qty` · `Name` — and no money anywhere.** The line prints the product, its **"What's Included" prose as the packing checklist** (Lens · Front Lens Cap (72mm) · Rear Lens Cap · Lens Hood · UV Filter · Pouch), the handling note (*"Always turn off the camera before changing the lens…"*), and **the assigned serial in its own box** (`LAO-10MM-ZDFF-SE-01`).

This is why the kit prose exists — it renders as the bench checklist. Ours generates the same checklist from `bundle_items` + `booking_line_units`, so the slip gains per-component checkboxes and damage-track granularity that prose can never have. Money-free stays law on this document (it goes to the floor and into the case with the gear).

### 18.4 Quote document (`/documents/{uuid}` — Quote #766, booking #905)

**Header:** `Delete` · `Print` · `Download` · **`Send`** (primary). **Right rail:** a **`Signature`** section (`Request signature` · `Sign now` · ⋯) — the signature machinery lives on quotes too, not just contracts — then a **document timeline** (*"30-08-2026 · Document sent 30-08-2026 15:57"*) — the per-document email history, answering the "email" item without opening a compose — then `Tags` · `Notes`.

**The document:** client + company blocks · `Date ✏` · Booking ref + period · **`Quote #766 ✏`** (client name, date and number carry inline-edit pencils — editable while unsent/unfinalised) · line with **duration on the line** (`1x · 4 days · Rs.6,000.00`) plus the What's-Included prose · `Insert a reference` · `Subtotal` · `Total incl. taxes` · **`Replacement Cost Rs.0.00`** · a `TERMS & CONDITIONS — BABIN RENTALS` section.

**`Replacement Cost Rs.0.00` is D1 printing itself onto client paper.** The quote wants to tell the client what the gear is worth if lost — and renders zero because replacement/purchase values are unset. The backfill decision is not only about internal ROI reports; it is already visible to every client who reads a quote.

### 18.5 What this adds to the ledger

| Item from Babin's list | Status |
|---|---|
| Bundles | **captured** (§18.1) — list + detail + pricing model |
| Cross-sell | **captured** (§18.2) — defer to post-bridge |
| Packing slip | **captured** (§18.3) |
| Quote | **captured** (§18.4) — incl. signature + send timeline |
| Email | **partially captured** — per-document sent-timeline (§18.4); the compose modal and Settings ▸ Emails templates stay unopened (compose is one click from Send; templates are archive-covered) |
| Add equipment | **already captured** (§10.1); `/orders/new` deliberately not opened — it writes a draft |
| Customer ▸ Payment methods | still unopened (in-page click, extension risk; Stripe unconnected so likely trivial) |

### 18.6 Open decisions (new)

1. **Bundle price recomputation** — Booqable derives bundle price from component lines at *definition* time. When a component's base rate changes later, does the bundle price follow (live composition) or stay as quoted (frozen composition)? Ours must pick; frozen-at-booking is consistent with invoice immutability, live-at-definition with catalogue coherence. Booqable's behaviour not determined from a read-only pass.
2. **Replacement cost on client documents** — keep the line (argues for D1 backfill urgency) or drop it from our quote template until values exist? A printed Rs.0.00 teaches clients the gear is worthless.

---

## 19. SCREEN 12 — The remaining-pages sweep: Collections, Settings ▸ Emails, Contract document

Captured live, read-only.

### 19.1 Collections (`Inventory ▸ Collections`) — the taxonomy that works

**12 collections**, and everything the product tags are not: `All products (System) 206` · `Bundle Deals 35` · `Camera 10` · `Camera Stabilizer Systems 9` · **`Lenses 35` with children** (`Sony Mirrorless E-Mount Lenses 20` · `Cine Lenses 7` · `Lens Adapters 5`) · `Monitor And Wireless Video System 12` · `Wireless Follow Focus Systems 3` · `Lights 15` · `Tripods 5` · `Battery System 7`.

Columns: ☰ drag · thumbnail · `Name` · `Products` (count) · `Online store` Visible. So Booqable HAS a working taxonomy — **hierarchical, hand-ordered, counted, with one System collection** — living beside the tag wreckage (§15.2). The lesson for L10 sharpens: our categories are collection-shaped (a curated tree with counts), and tags simply do not exist until they earn a vocabulary.

### 19.2 Settings ▸ Emails — the email architecture, live

- **BCC audit trail is configured live:** *"Send a copy of all outgoing emails to:"* → `babindulal7@gmail.com` (multiple addresses allowed). The F-series adoption, confirmed in use.
- **Shared `Header` and `Footer`**, edited once, used in every template.
- **System emails** — *"built-in templates that support your workflow. They are triggered by actions within the system, and some can be edited before sending"* — with per-trigger toggles (`Send online booking confirmation`). **The full template list (14):** Customer accounts × 5 (Account confirmation · Account invitation · Email address updated · Password updated · Reset password) · Payment SCA authentication · **Signature received** · Webshop confirmation · **Invoice approaching due date** · **Invoice overdue** · Send contract · Send quote · Send invoice · Order confirmation.

Two things worth taking: the **event-per-template architecture** (every email is a named system event with a template and a toggle — maps 1:1 onto our audit-event types and the L9 sentence registry), and **automated dunning exists** (`approaching due date` + `overdue`) — a receivables feature our Overdue Receivables report should pair with. Also live-confirmed: the Settings rail matches the archive's 20 sub-pages, plus `Website integration` (drift since 18 Aug).

### 19.3 Contract document (`Contract #88`, booking #903)

Same shell as the quote (§18.4): `Delete · Print · Download · Send`, Signature rail (`Request signature` · `Sign now`), editable pencils, per-line **prices included** (unlike the packing slip), kit prose per line. No sent-timeline entry — consistent with the register's blank Confirmed/Signed columns.

**The T&C block is the find — it is BILINGUAL (English, then Nepali), and it is load-bearing:**

- **Clause २.१ codifies the 06:00→06:00 rental day in the client contract**: pickup day 6:00 से return day 6:00 सम्म. **D4's ruling matches what clients already sign** — the setting's default is contractually anchored, and changing it in Settings (as D4 allows) means the contract text must follow. Wire the T&C template to the same `operationalDayStart` setting, or the two will drift.
- English sections observed: 9 Payment (full payment before pickup · additional charges settled on return · *"Babin Rentals may hold security deposit **or ID** until proper return"*) · 10 Cancellation (holding charges; same-day = minimum one-day charge) · **11 Biometric (Fingerprint) Consent** (identity verification only · stored securely · optional with alternative verification · deletable after rental) · 12 Dispute Resolution (Nepali jurisdiction) · 13 Customer Agreement.
- Nepali sections cite **मुलुकी देवानी संहिता २०७४** and **उपभोक्ता संरक्षण ऐन २०७५**, and include late-return terms (ढिलो फिर्ती: policy-based extra charges; first-time goodwill discretion).

`[observed only — not specced]` The biometric-consent clause implies the business collects fingerprints at handover. Whether the OS ever stores biometric data is a decision with legal weight far beyond this spec; nothing here rules on it. What the OS *does* need from this page: the T&C template is per-language, versioned, and bound to the day-boundary setting.

### 19.4 Sweep ledger — final

| Page | Status |
|---|---|
| Collections | **captured** (§19.1) |
| Settings ▸ Emails + templates | **captured** (§19.2) — email item now fully closed |
| Contract document | **captured** (§19.3) |
| Customer ▸ Payment methods | **skipped deliberately** — direct URL renders blank (the client-side quirk covers customer detail generally), reaching it needs three fragile steps through a lockup-prone extension, and with Stripe unconnected it is almost certainly an empty state. Template work for the repo pass. |
| Email compose modal | unopened — one click from Send; architecture captured via §19.2 instead |
| `/orders/new` | never opened — writes a draft (§18) |
| Scan a barcode · Ask Bo | hardware / assistant overlays; out of scope |

---

## 20. SCREEN 13 — Pro forma, Rental period settings, Custom fields, Security

Captured live, read-only. This closes every surface a read-only session can reach.

### 20.1 The pro forma — the numbering model, now OBSERVED

`/documents/{uuid}` on #905's invoice renders the title **"Invoice Pro forma" — no number** — and the header holds `Delete · Print · Download · ✓ Finalize (green) · Send`. **§14.2's inference is upgraded to observed: the number is minted by `Finalize`, which is a distinct action from `Send`.** (Not clicked — it is the write.) Body: totals only (`Subtotal → Total incl. taxes → Replacement Cost Rs.0.00 → Paid → Due`), `Insert a reference` and `Add footer` affordances. **No Signature rail** — signatures belong to quotes and contracts, never invoices. L8 stands exactly as written.

### 20.2 Settings ▸ Rental period — D4's anchor, observed

Sub-pages: Rental period · Default booking times · Operating hours · Time intervals · **Away mode** · **Apply to manual bookings** · Period picker.

- **Period modes** (radio): `Dates and times` ✓ (with `Enable time selection` ✓ — disabled means dates-only + defaults) · `Fixed durations` · `Fixed time slots` (no multi-day).
- **`Default booking times`: Pick up `06:00` · Return `06:00`** — the setting itself, the source of every 06:00 booking in the system, and precisely the `operationalDayStart` shape D4 ruled. Booqable splits it into a pick-up/return *pair*; ours can stay one value unless Babin wants asymmetric defaults.
- **`Away mode`: unchecked** — *"Block all pickups and returns between selected date ranges."* The F1 Dashain/Tihar feature exists and is the **sixth unused feature**.
- **`Apply to manual bookings`: unchecked** — *"Rental period settings always apply in your online store. Choose whether they should also apply to bookings created in the back office. Staff can be given permission to override these restrictions."* **An architecture finding: period rules are channel-scoped** — storefront always, back office opt-in, with per-staff override permission. Ours should express the same three-layer scoping (channel default · org opt-in · per-role override) rather than one global flag.
- A `New period picker` opt-in toggle (off) — Booqable ships UI rewrites behind per-account toggles.

### 20.3 Settings ▸ Custom fields — the one-admin-surface claim, confirmed

Exactly as §13.6 modelled: **three entity scopes on one page** — `Customer information` · `Booking information` · `Product information` — each a drag-ordered list of fields with a **`Show on documents`** column (`All documents`), an `Add <scope> field` button, and checkout collection via *"add them to your checkout form"* (`Edit checkout form` link).

Live fields: Customer = `Phone` · `Main address` · `Phone Number`; Booking = `Delivery address` · `Billing address` · `Mobile`. Note **`Phone` and `Phone Number` coexist** — a duplicate born of free-form field creation. Ours: creating a field warns on near-duplicate names.

So a custom field = `{scope, name, order, show_on_documents, collect_at_checkout}`. That is the whole model; adopt it verbatim.

### 20.4 Settings ▸ Security — the E6 page shape, and the live posture

Four org-level controls: `Require 2FA for all users` (**off**) · `Email confirmation for new devices` (**on** — the only control enabled) · `IP Restrictions` (**off**; *"does not apply to the account owner"* — an owner-bypass ours will NOT copy, per Law 10's no-Owner-bypass philosophy) · `Single sign-on` (**off**; Okta/Google Workspace, XML config download, `Require SSO for all users`).

Ours already specs session timeout, password policy, 2FA and screen lock under People & Access; this adds new-device email confirmation and the explicit *require-for-all* framing per control. The owner-exemption anti-pattern is noted and refused.

### 20.5 The unused-features ledger, final

Deposits · purchase costs · buffers · portal accounts · contract signatures · **away mode** — six features configured to nothing. The conclusion of §14.1 holds stronger than ever: the bridge imports *operations*; every piece of *configuration* starts from us, and the OS onboarding checklist should walk Babin through exactly these six.

---

## 21. THE SETTINGS COMPENDIUM — all 17 remaining pages, live

Captured live, read-only, in one pass. With §12–§20 this completes every Settings page.

### 21.1 General (`/settings/general`) — and the find of the pass

Company info (name · email *"shown to customers on documents and used as the reply-to"* · phone *"internal, not shown"* · website · logo ≥1200×1200 PNG) · Address (on documents; billing address separate) · **Additional details (2 lines)** — *"such as bank or tax information"* on documents · Regional settings (TZ `(GMT+05:45) Kathmandu` · first day `Sunday` · date `dd-mm-yyyy` · AM/PM toggle · Metric/Imperial *"used to calculate delivery distances and fees"*).

**`Personalize your labels` — a vocabulary remapper.** Six renameable terms: Customer · Order · Quote · Contract · Packing slip · Pickup · Return. **`Order` is already remapped to "Booking"** — which explains the UI-vs-route drift (§3.1) at its source. `Customer` sits at default.

`[actionable today]` **Set `Customer` → "Client" here and Booqable itself speaks Law 17** for the whole bridge period — UI, documents, and emails. One field, no code, aligns both systems' vocabulary. The strongest single quick win this capture found.

### 21.2 Pricing (`/settings/prices`)

Enable/disable pricing globally (disabled = prices hidden, deposits still manual) · Currency `Nepalese Rupee`, symbol `Rs.`, before amount.

**Pricing structure templates — 9, and they are REAL, not samples:** `Days wise discount` · `Wireless video` · `Babin small items magic arm clamp plates` · `Babin Daily` · `Rental Rate Card` + 4 shipped examples. **Advanced pricing rulesets — 4 live:** `SUMMER25` · `New year` · `Christmas Discount` (×2) — seasonal pricing is *in use* (a seventh feature that IS configured, unlike the six that are not).

**Security deposits, the chain root:** *"Set the default security deposit for new bookings. This can be overridden per customer or per booking."* Current value: **`No deposit`** — the observed global root of every Rs.0.00 deposit in the system. F2's chain (global → product → client) is now fully witnessed at every level, all empty.

### 21.3 Taxes (`/settings/taxes`)

Prices **include vs exclude tax** as a mode, each with a worked preview (Rs.5.00 → 4.55+0.45 vs 5.00+0.50). *"Taxes are calculated using product tax profiles and optional customer tax rules."* **Two product tax profiles live: `Tax and tds` and `Tax`** (one default), plus the customer-tax-rules section — the third tax layer (§18.1's product profile + §13.4's client profile + this mode switch).

### 21.4 Payment providers (`/settings/payments`)

Stripe connect card — *"credit cards, local payment methods, and Tap to Pay… pre-authorize cards and send payment requests from the back office"* — **unconnected** (as known). `Browse providers` for others. Nothing else on the page: payments configuration IS provider connection.

### 21.5 Custom fields · Locations · Emails · Documents · Translations

- **Locations:** one row — `Babin Rentals · Pickup · Visible` — with stock-per-location and customer pickup choice framed as the purpose. Single-branch today; our branches model is a superset.
- **Documents (`/settings/documents`):** `Edit document templates` + **`Custom CSS`** · per-type (Invoices/Contracts/Quotes) **date display: date+time vs date-only** · page size `A4` · **Document numbering: `Global level` vs `Prefix level`** — F5, observed as the actual setting · **Invoice due dates: auto-set when finalized** (feeds the amber overdue pill, §14.2).
- **Translations (`/settings/locale`):** customer-facing wording overrides ONLY (*"not your back office"*), grouped: Documents · Cart · Checkout · Payments · Online bookings · Deliveries · Customer accounts · Errors · **Signature page**; `{{amount}}`-style placeholders preserved. Email content explicitly separate (Settings → Emails).

### 21.6 Account and billing (`/settings/account`)

`Grow` plan · **$1,368/year**, next cycle 20 Mar 2027 · a 15% forever coupon · Mobile app extra · **API usage meter: 535 / 150,000 this month** (the sync budget gauge, §19's API ceiling — currently 0.4% used). **Team: 5 active, 1 seat left** — Babin Dulal (Account owner) · Aryan Chaudhary (**2FA badge**, Limited) · Jayaram Jyoti (Limited) · Rupesh Karki (Limited) · Suren Dhital (Limited) · one more below the fold.

Worth noticing: **Suren Dhital is both a team member here and client #363 carrying the 20% standing discount** (§17.4) — a staff-as-client case. Ours needs a stance on staff rentals (a flag on the client, and whether staff discounts route through the same D3 mechanism), because the live business already does it.

### 21.7 Online bookings — all nine

- **Overview:** three channels — **Booking page: LIVE at `https://babinrentals.com`** (the storefront IS the hosted booking page) · Website builder: **Offline** add-on, *mutually exclusive* (publishing it takes the booking page down) · Website integration: embeds.
- **Booking page:** status + customize/branding/preferences/checkout links.
- **Website builder:** Offline, last updated 8 months ago; themes `Radical` + `Focus`; menus (`Main menu`: Home, Catalog, Collections); no pages; publish/revert (1 of 1).
- **Website integration:** WordPress plugin · Shopify · Squarespace · custom JS snippet.
- **Cross-sell:** global `Show cross-sell on product pages` + section title/subtitle + **layout List vs Carousel** + *"only show products available for the selected rental period, up to N"* — availability-aware recommendations.
- **Preferences (`/settings/online-reservations`) — the D2 page:** `Enable customer accounts` with three modes (**optional** / required at checkout / required to browse) · `Customers can create an account` toggle (*"you can still invite them manually"*) · **CAPTCHA on registration (reCAPTCHA v3, invisible)** · **`New accounts need to verify email`**. Then availability semantics: **Enable = reserve only when available, auto-reserved; Disable = order anyway, creates a DRAFT, nothing reserved** (the origin of the 6 drafts). Sub-sections: Last minute bookings · Add to cart button · Coupon codes · Branding · Favicon · Sorting · Show prices · Custom domain · Online store status.
- **Pickup and delivery:** default pickup location (`Babin Rentals`) · deliveries via app-store add-on · delivery countries allowlist · `Require delivery address when selecting a rental period` toggle.
- **Checkout:** **form composition FROM custom fields** — live rows Name · Email · Addresses (pickup/delivery form) · `MOBILE NUMBER (Order Field: Mobile)` + `Add item` — §20.3's fields consumed here. **Payments in checkout, four modes:** full amount · down payment · **security deposit only** · show no payment options; plus *"Terms for amounts due later"* text.
- **SEO:** page title 52/60 + meta 145/160, live SERP preview, both filled with real copy.

### 21.8 What this pass changes

1. **D2 is confirmed against Booqable's own model:** self-registration with **mandatory email verification**, optional CAPTCHA, and manual invite still available — exactly the safe form ruled in A0. No daylight between the ruling and the reference.
2. **The label remapper (§21.1) is the immediate action** — Customer→Client in Booqable today.
3. **Seasonal/tiered pricing is configured and real** (9 templates, 4 rulesets) — the bridge must import pricing structures, not just flat fees, and our pricing engine needs tiered + seasonal shapes on day one.
4. **The deposit chain's global root is `No deposit`** — D1's backfill starts by setting one default here.
5. **Numbering (global vs prefix), invoice due dates, custom CSS on documents** — all real settings our Settings ▸ Financial already models or can adopt one-to-one.

---

## APPENDIX A0 — RULINGS OF 30 AUG (supersede the recommendations below)

Babin answered four of the five blockers. These are his rulings; each is recorded with what implementing it requires. D1 (purchase-cost backfill) remains open pending the sizing query.

### D4 — RULED: the operational day is 06:00→06:00, **as a setting**
Default 06:00, changeable in Settings. *(v2.4: observed in Booqable at Settings ▸ Rental period ▸ Default booking times as a Pick up/Return pair, both 06:00 — §20.2; and codified in the client contract clause २.१ — §19.3.)* Implementation: `bookings.ts` named filters take the day boundary from settingsStore (new key `operationalDayStart`, default "06:00"), not a literal — the same pattern as `quoteValidityDays`. The TODO(decision) closes; Dashboard, Operations and the pickups report all read the same setting.

### D3 — RULED: **no discount gate** ("copy Booqable")

> ✅ **All three consequences below were discharged on 31 Aug 2026** — PLAN.md §0 Law 10
> now reads "Discounts are UNGATED", migration **0074** dropped the `booking_discounts`
> constraint and **0075** the `invoice_lines` one, and `lib/discount` carries no approval
> path. The "until a migration drops it" hazard and the standing policies offer are both
> spent. Treat any re-added gate as a regression.

Recorded as Babin's ruling, with the consequences stated plainly, because this **reverses Law 10** — one of PLAN.md's 17 non-negotiable laws — and collides with schema already applied:

1. The DB constraint on `booking_discounts` (>10% requires reason ≥10 chars + named approver; 25% cap) is **live in the applied migrations**. Until a migration drops it, an ungated UI will write discounts the database rejects — the screen says yes, Postgres says no.
2. Dropping it requires: a PLAN.md law amendment (Foundation is canonical and wins disagreements — the law text itself must change), a migration removing the constraint, and gutting `lib/discount`'s approval path plus its tests (Law 10 is pinned by the suite).
3. What is lost is not friction but **the audit trail**: today's live system shows exactly where that leads — "Change discount of Booking #901" with no reason recorded, and standing discounts (#363 at 20%) nobody authorised in writing.

**Standing offer recorded:** the discount-policies shape (authorise once, apply by reference) delivers Booqable's zero-friction floor UX while keeping the audit row. If the objection was per-booking ceremony rather than accountability itself, policies are the door back — one line to reopen.

### D2 — RULED: **self-registration + matching** for the portal
Babin's choice, against the 11 Aug caution. The spec therefore REQUIRES the one safe form of it: **binding only by proof of inbox** — a self-registering user is bound to a client record only after verifying control of the exact email address already stored on that client (verification link to that address; no fuzzy matching, no name matching, no domain matching, ever). An email that matches no client creates an unbound account with access to nothing, surfaced to staff as a pending link request. RLS stays deny-all for unbound accounts, so the failure mode of a bad match remains "sees nothing", never "sees someone else's bookings". The 3 portal_* tables can now get real policies on this model.

### D5 — RULED: serials assigned **at creation**
The 27 Jul least-used-unit lock stands; B4 closes. `create_booking(jsonb)` is called WITH `units` per line. Consequence accepted: the allocation needs a live availability source during the bridge — `inventory_reservations` is Booqable-mastered (§10.6), so either the bridge feeds it or creation falls back to unit-less lines (the signature allows both, so the floor never blocks on a sync gap). Pack confirms/swaps what creation assigned.

---

## APPENDIX A — THE DECISION SHEET

Everything this capture raised that needs Babin's answer, consolidated. Ordered by what they unblock, not by screen.

### A.1 Blockers — answer these before the next build session

| # | Decision | Evidence | Recommendation | Unblocks |
|---|---|---|---|---|
| D1 | **Backfill purchase costs + deposit values** — in Booqable now, or at import? | §12.4: both unset on sampled product; deposits not being charged; ROI model has no input | Backfill in Booqable during the bridge (data stays mastered where operations run); one query across 178 products sizes the job first | Every depreciation / ROI / asset-value report; correct deposits on live bookings |
| D2 | ~~Portal binding~~ **RULED — see A0** | §14.1 | self-registration, bound ONLY by verified control of the client's stored email | closed |
| D3 | ~~Discount policies~~ ✅ **CLOSED — no gate; every consequence discharged 31 Aug (PLAN Law 10 · 0074 · 0075)** | §13.5, §16.1, §17.4 | no gate (Law 10 reversal — A0 lists what that requires and costs) | closed — all consequences discharged 31 Aug |
| D4 | ~~The operational day~~ **RULED — see A0** | §4.6 | 06:00→06:00 as a setting | closed |
| D5 | ~~B4~~ **RULED — see A0** | §10.2 | at creation; 27 Jul lock stands | closed |

### A.2 One-line laws — cheap to state now, encode as built

- **L1** Every money tile carries its one-line definition on the tile (§9.3, proven three times by §15.1).
- **L2** Every computed money figure that resolves to zero or less-than-expected explains itself: rule first, then the named inputs (§10.3).
- **L3** Every dated workflow gets the four-way exception facet group — Starting today · Ending today · Overdue start · Overdue end — from `periodRange` (§12.2).
- **L4** One filter idiom everywhere: faceted checkboxes with counts (§12.1: Booqable runs three idioms; we run one).
- **L5** Facet defaults are per-surface parameters, never hard-coded: worklists exclude Cancelled+Archived, reports exclude Cancelled+Draft (§15.1).
- **L6** One row = one link = one tab stop; no data and no destructive control is hover-only (§4.4, §10.4).
- **L7** Overdue dates render as the alert (amber + clock in the date cell), not a separate flag column (§14.2).
- **L8** Quote numbers mint at creation; invoice numbers at finalisation (§17.1).
- **L9** Audit events render through a sentence-template registry — one template per event type, missing template fails loudly; amounts elided (not events hidden) for money-blind roles (§16.2).
- **L10** Tags get a controlled vocabulary or they get no filter (§15.2).

### A.3 Adoptions — build when the screen is touched

Preview hover card on every booking list, tap-equivalent, money block role-gated (§4.4) · order-sidebar section counts + Paid/Due pairing (§5, §10.5) · deposit rendered below the total, never added (§10.1) · single next-verb header on Booking Detail (§10.1) · buffer form draws its effect from the real date engine (§13.1) · client barcode check-in (§13.4) · crew axis as second view on the calendar shell (§11.2) · page-level comparison selector on reports (§15.1) · audience-grouped reports index with one-line promises, money cards not built for money-blind roles (§14.4) · duration formatter "1 day 14 hours" (§15.3) · `booking_facets(filters)` RPC serving strip + chips (§9.2).

### A.4 Investigations — one query each, before the bridge copies data

- **I1** Zero-quantity calendar bars (`0x` on #898) — display convention or real rows? (§11.6)
- **I2** The two revenue totals' Rs.18,450 gap — confirm the cancelled-bookings hypothesis (§14.3).
- **I3** Purchase-cost coverage across all 178 products — sizes D1 (§12.4).
- **I4** Contracts' Confirmed/Signed usage — if genuinely unused, the OS contract flow starts from zero (§17.1).

### A.5 Open, smaller

Per-client tax profile (§13.5) · money on list rows (§9.8) · true faceting vs base-scope counts (§9.8) · Owner Report attribution: default + a labelled `Show revenue by` selector, per §17.4 · `Expected stock` / purchasing (§12.6) · iCal minting rights + expiry (§11.7) · Downtime as own module vs cases (§12.6) · register as one screen with three tabs (§14.6) · two-column Dashboard vs stack at 768px (§4.2, Law 15).

---

## 6. Per-screen template

Copy this per screen. One file per screen at `docs/booqable/<screen>.md`.

```markdown
# <Screen name>
Booqable route: <path>            Our route: <path>
Captured from: <archive file>     Date: <save date>

## A. Structure
Panels (in order) ·  Columns ·  Filters/chips ·  Grouping & sort
Statuses shown ·  Counts/badges ·  Empty / loading / error text

## B. Function
| Control | Type | Destination or effect | Reversible | Roles |

## C. Hover & interaction
[observed] ...
[ruled] ...
Tab stops per row:  Touch equivalent:  Focus treatment:

## D. Backend data link
source / filter / order / window / money / engine / action
Writes: <action file> → <table>  |  Reads: <table or view>

## E. Verdict
Keep: ·  Drop: ·  Differs (and why ours wins): ·  Gaps in our build:

## F. Open decisions
<numbered, each with the cost of getting it wrong>
```

**Rules for filling it in**
- Every destination is a real route with real params, or the row says `unknown`.
- Every Layer C line is tagged `[observed]` or `[ruled]`.
- Every Layer D line names a real table, view, engine or action from §2.4. If nothing in the repo serves it, write `GAP — not built` rather than inventing a name.
- Cite the archive file a claim came from. A claim with no source is a guess.

---

## 7. Claude Code run instructions

Run inside the repo. `docs/booqable/` already holds the 19 Aug capture (00-INDEX + 14 page docs + PARITY.md) — **extend those files, do not replace them.**

1. **Read first, in this order:** `PLAN.md` (17 laws) → `PROGRESS.md` (newest-first, the live authority) → `docs/booqable/00-INDEX.md` → `docs/booqable/PARITY.md` → `BOOQABLE_DESIGN_PRINCIPLES_v1.2`.
2. **Do not re-capture Layer A** where a 19 Aug page doc exists. Add sections B, C, D, E, F to it.
3. **Order of work** — highest operational value first:
   1. Bookings list (`/orders`) — the faceted counts item, our highest-value unbuilt filter
   2. Booking detail + the order sidebar (§5)
   3. Calendar
   4. Inventory / product detail (buffers, purchase cost, History tab)
   5. Customers → Clients
   6. Documents · Reports index
   7. Settings sub-pages (compare against the 15 Aug four-tab reshape before writing anything)
4. **Close the 19 Aug capture gaps** where the archive allows: New customer form (was truncated — needs re-saving), Product → Downtime, Product → Variations, Customer detail, Coupons, Activity logs, Scan a barcode.
5. **Every screen spec ends with `## F. Open decisions`.** Do not resolve a decision that costs money or data to reverse — surface it.
6. **Verify before claiming.** Any statement about the live database must be checked with `npm run check:db` (v2) and not quoted from a dated line in an older doc. That failure mode has already cost this project once — see the 16 Aug correction.
7. **Gates after any code:** `tsc` adds 0 errors · `vitest` all pass (2174/2174 across 88 files as of 30 Aug) · `vite build` exit 0 on Babin's machine (`node_modules` is Windows-only).
8. **Log to `PROGRESS.md`** in house style: Did / Found / Ruled / Verified / Blocked. Log what was *verified*, not what was written.

---

## 8. Honest limits of this document

- v2.5 (COMPLETE) covers **fifteen** areas — ALL Settings pages now captured live (the 18 Aug archive is fully superseded for Settings). Every surface a read-only browser session can reach has been captured; what remains needs hardware (Scan a barcode), a write (/orders/new, Finalize, Send, compose), or Babin (New customer form re-save). — every live-capturable screen is done. Remaining: Scan a barcode (hardware), New customer form (needs Babin's re-save), customer Bookings/Payment methods tabs, product Online store/Cross-sell tabs, Settings sub-pages (archive-covered), the `Show revenue by` option list. Template work for the repo pass: Dashboard, Bookings list, Booking detail, Calendar, Inventory (incl. Downtime + product tabs), Customers (incl. the Accounts tab), Documents register + Reports index. Remaining unseen: Settings sub-pages (the 18 Aug archive already covers these — 20 sub-pages docd), Coupons, customer Bookings/Payment methods tabs, product Online store/Cross-sell tabs, Contracts/Quotes register tabs, remaining report pages (Product performance, Product fulfillment, Customer, Coupons, Activity logs, Background tasks), Scan a barcode, Ask Bo.
- Product detail: Inventory, Pricing, History, **Settings and Variations** now opened (buffer found under Settings). Online store and Cross-sell remain unopened.
- Customer detail: Information and Accounts tabs captured; **Bookings and Payment methods** tabs remain uncaptured.
- The Booking detail's open sidebar was read from the DOM, **not screenshotted** — the browser extension stopped responding on that page. Section list and figures are real; the open-state layout and column widths are not captured.
- The live session was **read-only**: navigation, hovering, and one menu opened. No record was created, sent, changed or deleted. The `Actions ▾` bulk menu was deliberately not opened.
- **v1.0 said hover could not be captured from a saved page. That was right** — the live session found a booking preview card and two money definitions that the archive simply did not contain. Any remaining screen specced from the archive alone will have the same hole. Spec the rest live.
- **No claim here was checked against the live Supabase database.** The table, engine and route names come from the repo's measured state; the *data* claims come from the saved page only.
- The order sidebar in §5 was captured **collapsed** (`width: 0`). Its section list and figures are real; its open-state layout, ordering and any hover behaviour are not.
