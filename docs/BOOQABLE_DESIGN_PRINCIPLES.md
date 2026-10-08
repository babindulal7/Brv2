# BOOQABLE DESIGN PRINCIPLES — What Makes It Work, What the OS Copies

**Version 1.2 · 29 Aug 2026 · Analysis doc (direction only, no build work)**

> **Filed to the repo 29 Aug 2026.** This document existed only in conversation until now. It is
> reproduced below unchanged. An appendix by a different author follows the original — it alters
> no ruling and adds none.

---

## 0. Ruling & Scope

| Question | Ruling |
|---|---|
| Booqable's role | **Structural reference** — IA, flows, density, interaction patterns |
| Visual design | **NOT copied.** Babin Rentals OS design system stays locked (dark cinematic + light toggle, Outfit / Source Sans 3 / JetBrains Mono, 5-colour status law, gold external) |
| When this applies | **LATER.** Build-first stance (24 Aug) holds — nothing here changes built screens now. This doc is the reference for future design passes. |
| Evidence base | 51 saved screens (18 Aug capture), parity docs (19 Aug), fresh DOM read of Dashboard / Bookings / Booking #831 / Products / New product / FX3A detail / Calendar |

---

## 1. Why Booqable Works — The 10 Principles

### P1 · One global primary action

The entire app has **one** global CTA: **New booking**. Everything else is secondary. No screen
competes with it.

> Evidence: topbar carries only "New booking"; list pages carry at most Add / Export / Actions /
> Columns — 3–4 buttons total on a page managing 620 bookings.

**OS status: ALIGNED.** "One primary button per row" lock (28 Jul) + New Rental as nav position 1
(12 Aug) is the same idea. Keep enforcing it.

### P2 · Dashboard = today's physical movements, nothing else

Dashboard is two lists: **Going out** and **Coming back**, time-grouped (06:00, 08:00…), each row
= booking ref + client + View button. No charts, no KPIs, no feed on the main working surface.

> Evidence: Dashboard headings are exactly "Going out" / "Coming back", with "View late (1)" as
> the only exception surfacing.

**OS status: ALIGNED** with the Today page lock (today's jobs only). Worth copying: the
**"View late (N)"** pattern — exceptions as a count-chip on the normal list, not a separate alarm
surface.

### P3 · The booking is the hub — everything created from inside it

On Booking #831 you can: Send email · New contract · New quote · New payment · add lines · add
custom line · add tags · add field. Documents, payments and communication are **created from the
booking**, then live in their registers. Staff never leave the booking to do booking work.

> Evidence: Booking #831 action row; line items editable inline with "1 day Rs.2,500.00" per line.

**OS status: PARTIAL.** Booking Detail spec has the pieces but the hub principle should be stated
as law: **no booking-related create action lives outside Booking Detail.** Finance tabs are
registers/reports of what bookings created — not entry doors.

### P4 · Availability at the point of decision

When adding a line, the row itself shows **"0 left" / "1 left"** for the chosen dates. No separate
availability check step.

> Evidence: Booking #831 line rows.

**OS status: ALIGNED and stronger** (green/red per-serial with hard block, 27 Jul lock). Keep ours;
the principle is confirmed.

### P5 · Status is two thin dimensions, never one fat one

Rental state (Draft · Reserved · Started · Returned · Archived · Canceled) and payment state
(Payment due · Partially paid · Paid · Overpaid · Process deposit) are **separate filter groups**,
shown as separate badges. Neither list exceeds 6.

> Evidence: Bookings list filter panel.

**OS status: ALIGNED.** 6-status lifecycle + payment as separate field is the same shape. Do not
let future rules re-merge them.

### P6 · List page anatomy: money strip → faceted filters → flat table → Export/Columns

Bookings list opens with three numbers (**Items ordered · Revenue · Due**), filters carry live
counts on every option, then one flat table. Every list has Export; columns are user-configurable.

> Evidence: Bookings list headings + filter labels; Products/Bookings both carry Export · Actions ·
> Columns.

**OS status: PARTIAL.** Faceted filter counts already flagged as the highest-value unbuilt item
(19 Aug). The 3-number money strip on top of each list is worth adopting as a standard: **every
list answers "how many / how much / how much owed" before showing rows.**

### P7 · Quick create, complete later

New product = four short sections (General information · Product type · Pricing · Variations),
three buttons (Duplicate · Cancel · Save). You can save with almost nothing and enrich later on
the detail page.

> Evidence: New product form structure.

**OS status: ALIGNED.** Quick Add + auto "complete profile" task (21 Jul) is the same principle
with better follow-through (Booqable has no completion task).

### P8 · Per-unit identity with structured references

Product detail lists stock items as structured refs: `CAM-FX3A-SON-KIT-001 / -002 / -03`.
Category-prefixed, human-readable, scannable.

> Evidence: FX3A detail stock items.

**OS status: ALIGNED** (asset/unit model, JetBrains Mono IDs). Note their inconsistency (`-03` vs
`-002`) — our numbering must be system-generated, never typed.

### P9 · Calendar is a viewer, not a workspace

Calendar = Today · Day · Week · Month · Subscribe (iCal). No editing, no layers, no config.

> Evidence: Calendar buttons — that is the entire toolbar.

**OS status: ALIGNED** with the 28 Jul "simple month view default" softening. The
**Subscribe/iCal** export is a cheap, high-value addition for later (staff phones get the schedule
with zero app opens).

### P10 · Flat, short nav — registers not modules

10 top-level items, no nesting, each item is a register (list of things) rather than a "module."
Settings holds all configuration; working pages hold none.

> Evidence: saved nav — Dashboard · Calendar · Bookings · Customers · Inventory · Coupons ·
> Documents · Online store · App store · Reports.

**OS status: ALIGNED** (11-item fixed nav, Settings registry). The sharper lesson: **configuration
never appears on working pages** — if a page needs a setting, it links to Settings, it doesn't
embed it.

---

## 2. What NOT to Copy (observed failures in the same screens)

| # | Anti-pattern | Evidence | OS answer |
|---|---|---|---|
| A1 | Money facts as free-text notes | Damage valuations, extra charges, part payments typed into the dashboard feed | Real fields on Booking Detail — already planned |
| A2 | Kit contents as prose | FX3A contents live in "Description on documents" text | Bundle lines with mandatory/replaceable flags — locked |
| A3 | No state between Reserved and Started | Packing is invisible to Booqable | Our Packed status + Floor verbs stay; sync maps DOWN |
| A4 | Tag chaos | Hundreds of single-use SEO tags on products | Tags = curated taxonomy only |
| A5 | Two revenue totals that disagree | Bookings Rs.10,058,518.39 vs Documents Rs.10,076,968.39, unexplained | Every OS figure carries its formula on hover (Reports Reorg law) |
| A6 | Default times masking reality | 06:00/06:00 defaults → nearly all bookings "at 06:00" | Fine for us (6AM→6AM rental day is a real rule), but pickup/return **actual** times must be captured at Handover/Return |
| A7 | Unscoped credentials | 17 full-access API tokens, no scope, no last-used | Scoped tokens + last-used column in our Settings/API |
| A8 | Paisa + VAT-on-discounted-total | Rs.12,000.60 totals | Ruled 19 Aug: whole rupees, one rounding — ours wins |

---

## 3. The Short Version (the "Booqable law" in one paragraph)

**One primary action. Today = what moves in and out. The booking is the hub. Availability where
you decide. Two thin status dimensions. Lists open with money, filter with counts, always export.
Create fast, complete later. Every unit has a name. Calendar shows, never edits. Nav is flat
registers; config lives only in Settings.**

The OS already encodes 8 of the 10 principles as locks. The two genuinely new adoptions for a
later pass:

1. **P6 money strip** — 3-number header on every list (with the already-planned faceted filter
   counts).
2. **P3 stated as law** — no booking-related create action outside Booking Detail; plus the P2
   "View late (N)" exception-chip pattern and P9 iCal subscribe as small additions.

---

## 4. Additional Patterns (second pass — Customers, Documents, Employees, Reports screens)

| # | Pattern | Evidence | Where it lands in the OS |
|---|---|---|---|
| E1 | **Owner Report skeleton.** One page: Total revenue · Bookings · Items ordered · New customers → Revenue over time → Order metrics (AOV · avg rental duration · avg items/order · **fulfillment rate**) → Payment overview (**Total collected · Total outstanding · Deposits held · Deposits outstanding**) → Top customers by revenue → Orders by status | Company performance report | Reports module — monthly Owner Report spec. Deposit held/outstanding split and fulfillment rate are new metrics to add |
| E2 | **Per-client deposit policy.** Default per customer: No deposit / % of booking total / product-specific deposits / fixed amount — alongside per-client discount % and tax profile | New customer form, Security deposit section | Clients module — new field on client profile; New Rental reads it as the deposit default (overridable per booking) |
| E3 | **Invoice revisions keep their number** with a suffix: `#29-R1`, `#25-R1` — never a fresh number for a corrected invoice | Documents list | Finance/Documents — document numbering rule; audit- and VAT-friendly |
| E4 | **Money strip is register-wide**, not Bookings-only: Documents opens with Nr. of invoices · Paid amount · Revenue · Due | Documents list header | Confirms P6 as a standard for **every** list: Rentals, Documents, Clients, Payments |
| E5 | **Every entity is citable by number.** Clients carry sequential refs (#367, #366 …) just like bookings and invoices | Customers list | ID law — clients get visible sequential refs in JetBrains Mono, same as BR-XXXX bookings |
| E6 | **Security page pattern.** Per-user: login activity (device + app version + timestamp), 2FA, multiple authentication methods | Employees / User settings | Settings → Security spec — copy the login-activity table shape |
| E7 | **Shortage-first availability.** Availability report has a one-click "With shortage" filter; fulfillment report is a cross-booking pull manifest per item | Availability + Pickups reports | Calendar/Inventory — shortage filter; Packing workspace — cross-booking pull view already close, keep it |
| E8 | Reports index grouped by audience: Business / Inventory / Customer / Coupon / Activity (background tasks live under Activity) | Reports index | Reports Reorg — grouping model confirms our audience-first layout |

**Priority within Section 4 for the later pass:** E1 and E2 are spec-level additions (real new
capability). E3–E5 are one-line laws to adopt. E6–E8 confirm or lightly extend existing specs.

---

## 5. Third-Pass Findings (Settings · product tabs · booking variants · document registers)

| # | Pattern | Evidence | Where it lands in the OS |
|---|---|---|---|
| F1 | **Away mode.** Block all pickups and returns for selected date ranges, with a toggle for whether it also applies to manual bookings | Settings → Rental period | Settings registry — new entry. Direct Nepal use: Dashain/Tihar closure block on the calendar and New Rental |
| F2 | **Three-level deposit resolution.** Same 4 deposit options (none / % of total / product-specific / fixed) exist at global (Pricing settings) → per-product (Pricing tab) → per-client (customer form). Most specific wins | Settings (2) + FX3A Pricing tab + New customer | Deposit law: client overrides product overrides global. Extends E2 |
| F3 | **Payment modal splits Order amount vs Security deposit** in one entry; methods = Cash / Bank transfer / Card / Other; single "Pay Rs.X" action | Booking #831 payment modal | Finance — payment entry spec. Deposit money never mixes into revenue; refund path stays clean |
| F4 | **New booking = booking detail screen, empty.** "Save as draft" + empty-state prompt; no create wizard — the record page is the form | New booking screen | Noted as a **deliberate difference**, not a change: OS keeps its New Rental flow (availability-first). Principle worth remembering for other entities: prefer record-page-as-form over wizards where no hard checks are needed |
| F5 | **Per-prefix document numbering.** Invoices #33 · Contracts #85 · Quotes #699 run independent sequences; Settings offers Global vs Prefix-level numbering | Documents registers + Settings (9) | Documents numbering law, pairs with E3 (`-R1` revisions). Also: invoice due-date toggle with default term |
| F6 | **Tabbed product detail by concern**: Info (name · SKU · doc description · images · **buffer before/after**) · Pricing (**"Charge for this product" free-item toggle** · structure · ruleset · tax profile · deposit · **default purchase cost**) · Online store (SEO/embed) · History (datetime + booking ref + client + employee) · Cross-sell · Stock items | FX3A six saved tabs | Equipment Detail template — tab set and field placement confirmed against a real account |
| F7 | **BCC audit trail.** One setting: send a copy of every outgoing email to a fixed address | Settings → Emails | Communication Center — cheap org-wide comms archive, one setting |
| F8 | **Customer report KPI strip**: New customers · Total revenue · Average order value · Total balance due, filterable by the same status/type/subscription facets as the Clients list | Customer report | Clients report spec — reuse list facets on the report |
| F9 | Custom fields grouped by entity (Customer / Booking / Product); security page offers org-wide 2FA requirement + IP restrictions; "Write AI description" buttons embedded in the product form | Settings (6) · (10) · FX3A Online tab | Custom fields spec confirmed; Settings → Security additions; AI-assist buttons connect to the Gear Guide idea |

**Priority within Section 5:** F1–F3 are spec-level additions (Away mode, deposit resolution chain,
split payment modal). F5 is a numbering law. F4, F6–F9 confirm or lightly extend existing specs.

---

## 6. Status

- This doc = direction reference only. No screen rework now (build-first, 24 Aug).
- Pattern-level specs (money strip, faceted counts, iCal, exception chips) → to be written
  **after** the working app milestones, on request.
- Visual design system: unchanged and not negotiable per this doc.

*End of v1.2*

---
---

# APPENDIX — added 29 Aug 2026, different author

**Nothing above was altered, and no ruling here is changed, softened or added to.** This appendix
exists for one reason: to record what the word **ALIGNED** in §1 does and does not claim, before a
later reader takes it as a statement about shipped code.

## A · What the "OS status" column measures

Read in context, §1's status column tracks whether **a design decision has been made** that
matches the Booqable principle. It cites locks and dates — "28 Jul lock", "12 Aug", "27 Jul lock"
— not screens. That is a legitimate axis and this appendix disputes no entry on it.

The risk is narrow: "ALIGNED" is a word a future reader will read as "built". In this repo that is
not hypothetical. `DOC_STATUS.md` §9 records **five** separate occasions where stale prose drove a
wrong conclusion, and the entire `docs/pages/` pack exists because intent and code had drifted
apart without anyone noticing.

## B · The same principles, measured against the code

`docs/pages/` — 55 documents, one per route, written 17 Aug against source with `file:line`
evidence and explicitly forbidden from citing any spec. Cross-referenced against §1:

| Principle | §1 says | Screen it depends on | Page-pack status |
|---|---|---|---|
| P2 · Dashboard = today's movements | ALIGNED | `/today` | **Partial** — every count is a real query, but the operating day is the frozen constant `TODAY = 31 Jul 2026` (`src/lib/bs.ts:153`) and both write paths are dead ([06_today.md](pages/06_today.md)) |
| P3 · Booking is the hub | PARTIAL | `/rentals/:bookingNo` | **Seed-only** — every rupee figure invented; the one implemented write cannot be reached ([14_booking_detail.md](pages/14_booking_detail.md)) |
| P4 · Availability at the point of decision | ALIGNED and stronger | `/rentals/new` | **Seed-only** — no query module is imported at all ([08_new_rental.md](pages/08_new_rental.md)) |
| P6 · List anatomy / money strip | PARTIAL | `/rentals` | **Partial** — reads are genuine server-side queries; ten of eleven filter groups have no query behind them ([07_rentals_list.md](pages/07_rentals_list.md)) |
| P9 · Calendar is a viewer | ALIGNED | `/calendar` | **Seed-only**, and no month other than Shrawan 2083 is reachable ([23_calendar.md](pages/23_calendar.md)) |
| P10 · Flat nav, config only in Settings | ALIGNED | `src/data/nav.ts` | **Confirmed in code** — 11 fixed items, and `permittedNav` filters on `canViewMoney` rather than a hardcoded role |

**P10 is the only one of these confirmed at the code level.** The rest are confirmed as
*decisions* — which is what §1 claims, and all it claims.

## C · What this changes

**Nothing, now.** §0 rules "LATER" and §6 rules "no screen rework now". Both stand; this appendix
is not a request to revisit them. Two observations for whoever picks the doc up:

1. **The two new adoptions in §3 get cheaper after the screens are real, not before.** A money
   strip on `/rentals` would today sit above a list whose facet counts have no query behind them,
   and on `/rentals/:bookingNo` it would render invented rupees. P6 and P3 are worth exactly what
   §3 says — once the pages underneath them read from a store.
2. **A5 is already present in our own tree.** "Two revenue totals that disagree" is the failure
   class `docs/pages/` was built to expose, and it found ours: `35_staff_reports.md` records a
   headline block that does not reconcile with the table beneath it, with two of its four figures
   impossible from the rows.

**If any statement in §1–§5 is ever converted into a build task, read the matching page doc
first.** That is the rule the rest of this repo now runs on, and this document is not an exception
to it.
