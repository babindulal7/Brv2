# Layer D verification — Dashboard + the order sidebar
v2.5 section: §4 + §5 (lines 111-308)   ·   Our route(s): `/dashboard`
Verified: 31 Aug 2026   ·   Method: repo read + live DB (read-only, Supabase MCP as `postgres`)

> **Relationship to `docs/booqable/dashboard.md`.** That pass (31 Aug, 03:14) is the Layer A/B/C
> record for this screen and is not repeated here. This file verifies only Layer D. It **extends**
> it, and it **contradicts it in four places** — all four because the code moved after it was
> written. Each contradiction is flagged inline as `[CONTRADICTS prior pass]`.
>
> Trust boundary as instructed: v2.5's Layers A, B, C are taken as observed. Every Layer D line
> below was treated as unverified input.

---

## Verdict table

| # | v2.5 Layer D claim | Verdict | Real answer | Evidence (file:line or SQL) |
|---|---|---|---|---|
| **Panel 2 — Going out (§4.5)** ||||
| 1 | `source bookings` | **CONFIRMED** | `listBookings` selects from `bookings`. | `src/lib/queries/bookings.ts:259` (`BASE_COLUMNS`), `:416` (`listBookings`), `:420` (`.from('bookings')`) |
| 2 | `+ clients for name/email` | **MISLEADING** | The embed is `clients ( name )` — **name only**. No email column is selected anywhere on this screen, so Booqable's client-email row cannot be rendered. `MovementList`'s row menu disables WhatsApp/Call/Email for exactly this reason. | `bookings.ts:259-263`; `src/modules/today/MovementList.tsx:340-346` (comment: "`listBookings` joins `clients(name)` and nothing else") |
| 3 | `+ booking_lines for item count` | **CONFIRMED** | `booking_lines ( id, qty )`, with `.is('booking_lines.voided_at', null)` so a voided line is not counted (Law 3). | `bookings.ts:263`, `:423` |
| 4 | `filter … → todaysOutgoing` | **CONFIRMED** | Exists, exported, and is what the panel runs. | `bookings.ts:529-536`; `src/data/today.ts:926-928` (`pickupsQuery`) |
| 5 | `stages Booked, Packed` | **CONFIRMED in code / STRUCTURALLY DEAD in data** | `chips: { stage: ['Booked','Packed'] }`. But the live corpus has **zero** rows in either stage, so this panel returns nothing on every date. See "Backlog I6" below. | `bookings.ts:532`; SQL: `select stage, count(*) from bookings group by stage` → Returned 130, Closed 60, Quote 7, On Rent 3, **Booked 0, Packed 0** |
| 6 | `(+ flag Partial Pickup)` | **MISLEADING** | `'Partial Pickup'` is a real `workflow.ts` flag, but it is **not part of `todaysOutgoing`** — no flag filter exists in the set. It is also **not storable**: `booking_flags` carries `CHECK (flag IN ('Returned Early','Overdue','Missing','Damaged'))`, and `Partial Pickup` is not one of the four. | `src/lib/workflow.ts:176`, `:224`, `:397`; `bookings.ts:529-536` (no flag key); DB brief — `booking_flags_recorded_subset_only` |
| 7 | `window Today \| Tomorrow \| This Week \| Next 7 Days \| Custom` | **MISLEADING** | `periodRange` offers **All · Today · Tomorrow · Next 7 Days · This Week · Next Month** — no `Custom`, and it has a `Next Month` the spec omits. The Dashboard **offers only two of them**: `OFFERED_PERIODS = ['Today','Tomorrow']`, behind a live `TODO(decision)`. | `src/data/today.ts:835-861`; `src/modules/today/Today.tsx:103`, `:91-102` (the TODO) |
| 8 | `reuse periodRange — the same control /operations took on 30 Aug` | **MISLEADING** | Three different things are conflated. `periodRange` is a pure date-range **function** (`data/today.ts:835`); the Dashboard's `PeriodControl` is a two-button group; Operations' five-option set is its own `SCOPE_LABEL`/`SCOPE_ORDER`. They are not one control. (This restates the prior pass's open decision 5, still open.) | `data/today.ts:835`; `Today.tsx:103-152`; `src/modules/operations/OperationsQueues.tsx:179-186` |
| 9 | `order pickup_at asc` | **CONFIRMED** | `sort: { column: 'pickup_at', ascending: true }`. | `bookings.ts:535` |
| 10 | `…grouped by calendar day` | **GAP — not built** | Rows are flat; each carries its own time. No date-heading grouping exists in `MovementList`. | `MovementList.tsx:553-841` (no group node) |
| 11 | `money NONE on list rows` | **CONFIRMED** | `BASE_COLUMNS` selects no rupee column at all; `deposit_required` was removed from the base projection and moved to a second query against `bookings_deposit_v`, which this screen never calls. | `bookings.ts:259-263`, `:396-410` (`readDeposits`), `:265-272` (the "this module cannot leak a rupee figure" note) |
| 12 | `Law 2: figures come from fetchCanonicalBooking on detail` | **GAP** | `fetchCanonicalBooking` exists and is heavily tested, but **has no caller in any `.tsx`**. `BookingDetail` gets its figures from `listInvoices(invoicesForBooking)` + `listPayments(paymentsForBooking)` instead. | grep `fetchCanonicalBooking` across `src/` → only `src/lib/bookingQuery.ts` and `src/lib/__tests__/bookingQuery.test.ts`; `src/modules/rentals/BookingDetail.tsx:36`, `:758`, `:764` |
| 13 | `engine lib/workflow · lib/bs · lib/format` | **CONFIRMED, but not where the spec implies** | All three are used — by `src/data/today.ts`, the row-shaping layer. The panel components themselves import neither: `MovementList` imports `lib/status`, `data/today`, `lib/rbac`, `lib/menuFlip`. A builder told "the panel uses lib/bs" will look in the wrong file. | `src/data/today.ts:3-14`; `MovementList.tsx:1-17` |
| **Panel 3 — Coming back (§4.5)** ||||
| 14 | `source bookings, same query` | **CONFIRMED** | Same `listBookings`, same `BASE_COLUMNS`. Law 2 holds. | `data/today.ts:931-933` |
| 15 | `filter … → todaysIncoming` | **CONFIRMED** | Exists and is what the panel runs. | `bookings.ts:539-546` |
| 16 | `stages On Rent` | **CONFIRMED** | `chips: { stage: ['On Rent'] }`, plus `presence: { cancelled_at: false, actual_return_at: false }`. | `bookings.ts:542-543` |
| 17 | `(+ Returned same-day)` | **GAP — not built** | `todaysIncoming` filters `On Rent` only. Adding `Returned` would also be a no-op against live data for a different reason: **`actual_return_at` is NULL on all 200 bookings**, in every stage, so "returned today" cannot be computed. | `bookings.ts:542`; SQL: `count(*) filter (where actual_return_at is not null)` = 0 in every stage |
| 18 | `order return_at asc, grouped by calendar day` | **CONFIRMED (sort) / GAP (grouping)** | `sort: { column: 'return_at', ascending: true }`; no grouping, as row 10. | `bookings.ts:545` |
| **Footer links (§4.5)** ||||
| 19 | `View late (out) → /rentals?filter=overdue&activity=pickup` | **GAP — not built** | The string `View late` appears nowhere in `src/`. No route accepts `filter=` or `activity=`. | grep `"View late"` across `src/` → zero hits |
| 20 | `View late (in) → /rentals?filter=overdue&activity=return` | **GAP — not built** | Same. | as above |
| 21 | `→ bookings.ts overdue` | **MISLEADING** | `overdue(nowAd)` exists, but it is hardcoded to `return_at` + stage `On Rent` and takes **an instant, not an activity**. It can express `activity=return` and *cannot* express `activity=pickup` — a late pickup is `pickup_at < now` with stage `Booked`/`Packed`, a different column and a different stage set. | `bookings.ts:602-609` |
| 22 | `Both View late links resolve to the same overdue filter set with an activity parameter — copy that, do not build two filters` | **MISLEADING** | This is the spec's headline Layer D recommendation and it is not implementable against `overdue()` as written. One filter set with an activity parameter is a **new** function, not a copy. Booqable's insight (one route, one parameter) is sound; the claim that our `overdue` already is that route is not. | `bookings.ts:602-609` |
| 23 | `View all → /rentals?stage=<set> → listQuery chip group` | **WRONG-NAME** | Both panels' `View all` point at bare **`/operations`**, with no query string. `/rentals` and `/operations` are different screens. | `Today.tsx:720`, `:734`; `MovementList.tsx:526-531` |
| 24 | `Run report → /reports/pickups` (§4.3, the only Layer-D-bearing row of the table) | **GAP** | No `/reports/pickups` route exists. The reports family has eleven routes (`pulse`, `expenses`, `clients`, `promotions`, `staff`, `inventory`, `equipment-performance`, `forecasting`, `cash-flow`, `working-capital`) and none is pickups. Nor does the Dashboard render a `Run report` control. | grep `reports/pickups` across `src/` → zero hits; route map |
| **Panel 1 — the notes/activity feed (§4.5)** ||||
| 25 | `source audit_events` | **CONFIRMED (table) / GAP (wiring)** | `audit_events` exists with **5,378 rows** — the only well-populated table on this screen's horizon. But **no code under `src/modules/today/` reads it**. | SQL: `select count(*) from audit_events` = 5378; grep `audit_events` in `src/modules/today/` + `src/data/today.ts` → zero hits |
| 26 | `already has triggers on bookings, clients, invoices, payments, security_deposits, inventory_units` | **WRONG-NAME** | Six tables is right; the sixth is **`product_units`**, not `inventory_units` — a table by that name does not exist. Also `payments` carries the trigger `AFTER INSERT` only, not `AFTER INSERT/UPDATE` like the other five (it is append-only). | DB brief, `log_audit_event` wiring |
| 27 | `filter latest N by occurred_at` | **WRONG-NAME** | `audit_events` has **no `occurred_at`**; the timestamp is **`created_at`**. (`occurred_at` exists only on `booking_stage_transitions`.) The repo's own reader already sorts on `created_at desc`, matching `idx_audit_events_created_at ... desc`. | DB brief; `src/lib/queries/audit.ts:147`, `:186`, `:272` |
| 28 | `joined to actor via users` | **GAP — deliberately not built** | `listAuditEvents` names its columns explicitly and takes **no embeds**: "`actor_id` → `users` would…" is cut off in the source comment precisely because the join was declined. The filter is by actor **role**, not by name. So a feed row cannot show "who" the way Booqable's notes show an author. | `src/lib/queries/audit.ts:180-186`, `:127-129` |
| 29 | `money amounts on payment/charge events are money — gate with useCanViewMoney` | **MISLEADING, twice** | (a) `audit_events` has **no amount column**. Amounts exist only inside `old_values` / `new_values` / `diff` **jsonb** — so "gate the amounts" means gating a jsonb blob, not a field, and the naive render leaks the whole row. (b) The bigger gate is not money at all: the audit reader is restricted to **`AUDIT_READ_ROLES = ['Owner','Admin','Manager']`**. Warehouse, Technician, Driver and Client see **no feed at all**, not a money-blind feed. | DB brief (`audit_events` columns); `src/lib/queries/audit.ts` `AUDIT_READ_ROLES` |
| 30 | `paging "Load 10 more"` | **GAP — not built** | No pagination control of any kind on this screen. | `Today.tsx:822-931` |
| 31 | `engine lib/audit` | **WRONG-NAME** | `src/lib/audit.ts` is the **write** helper (`logAuditEvent`). The read module is **`src/lib/queries/audit.ts`** (`listAuditEvents`, `auditForRecord`, `auditPeriodFilters`). A builder pointed at `lib/audit` finds no query. | export map; `src/lib/queries/audit.ts` |
| 32 | `engine lib/money (formatMoney) · lib/bs (timestamps)` | **CONFIRMED as modules** | Both exist and export what is named (`money.ts` → `formatMoney`; `bs.ts` → `formatAdDateTime`). Neither is wired to a feed, because no feed exists. | export map; `src/lib/bs.ts` `formatAdDateTime` |
| **§4.6 rulings that carry Layer D weight** ||||
| 33 | Ruling 1: rental day is 06:00→06:00; *"closes the open `TODO(decision)` in `bookings.ts`"* | **CONFIRMED — and already applied** | The TODO is **gone**. `startOfDay`/`endOfDay` now delegate to `lib/operationalDay.ts` with `operationalDayStart` read **per call** from settings, default `'06:00'`. Marked "✅ D4, ruled 30 Aug 2026". `finance.ts` deliberately keeps calendar-midnight helpers so a floor setting cannot move VAT periods. **`[CONTRADICTS prior pass]`** — `dashboard.md` open decision 2 records this as still open. | `bookings.ts:712-742` (the ruling block), `:817-838`; `src/lib/operationalDay.ts:41`, `:124` |
| 34 | Ruling 4: *"panels are named filters on one query, satisfying Law 2 for free"* | **CONFIRMED** | Every query on this page is `listBookings`. `Today.tsx` runs four of them and hands rows down; the Timeline is a `useMemo` merge of two existing result sets, never a fifth fetch. | `Today.tsx:609` (`mergeByTime`), `:464-473` (the query table) |
| 35 | Ruling 5: *"Keep our KPI strip or drop it"* | **CONFIRMED as still open** | Four cards render (`columns={4}`), with `Active Rentals` behind a disclosure. `Cash due` still renders the literal `NOT_TRACKED = 'Not tracked yet'` and carries its own `TODO(decision)`. The 4-vs-6 question also still carries a `TODO(decision)`. | `Today.tsx:454`, `:624` (the 4-vs-6 TODO), `:638-692`, `:693`, `:844` |
| **§5 — the order sidebar** ||||
| 36 | The rail is *the booking-as-hub rail (R8)*, openable over any screen | **MISLEADING for ours** | Ours is not a global overlay. `BookingDetail` renders a per-page `<Rail>`; there is no rail that opens over another screen. | `BookingDetail.tsx:1735` |
| 37 | *"Counts on section headers (`Documents 1`, `Invoices 1`)"* worth taking | **GAP — not built** | The booking rail's cards are titled `Booking Summary`, `Quick Actions`, `Alerts`, `Activity Timeline`. No `Card` title carries a numeric count badge. | `BookingDetail.tsx:979`, `:1005`, `:1034`, `:1044` |
| 38 | *"Paid / Due as two figures side by side, with payment status as a word above them"* | **PARTIAL — GAP on the shape** | `SummaryRows` renders label/value pairs stacked, not a Paid\|Due pair with a status word. The figures themselves are real (`listInvoices` + `listPayments`). | `BookingDetail.tsx:980`, `:758`, `:764` |
| 39 | *"Activity logs reachable from the booking, not only from an admin screen"* | **GAP — not built** | No link to `/admin/audit-log` or `/admin/activity-log` and no `auditForRecord` call anywhere in `BookingDetail.tsx`. The rail's `Activity Timeline` card is a different thing (booking stage history), not the audit trail. | grep `auditForRecord\|audit-log\|activity-log` in `BookingDetail.tsx` → zero hits |
| 40 | *"Documents and Invoices are separate sections — ours agrees"* | **CONFIRMED** | Separate reads (`listInvoices` vs the Docs segment) and separate blocks (Block 4 "Pricing & Payments", Block 5 "Documents & Review"). | `BookingDetail.tsx:1477`, `:1665` |
| 41 | *"Money in this rail is Law 6 territory… hidden means not built into the DOM"* | **CONFIRMED** | `canBookingMoney &&` omits the whole `Booking Summary` card; the tablet/phone sticky money bar is gated the same way and is absent, not greyed. | `BookingDetail.tsx:978`, `:1744` |
| **Known-bad facts this section repeats** ||||
| 42 | §4.4: *"44×44 (Law 16)"* — twice (`:203`, `:205`) | **WRONG-NAME** | 44×44 is **Law 15**. Law 16 is the AI-panel gate. `MovementList.tsx:298` already cites it correctly. | known-bad list; `MovementList.tsx:298` |
| 43 | §4.2: *"on a 768px bench the rail has nowhere to go (Law 15 — width decides)"* | **WRONG-NAME** | The 768px two-column question is **Law 14**. | known-bad list |
| 44 | §4.4: *"Build on the `ClickableRow` component already named as item 3 in the 11 Aug improvement order"* | **GAP — the component and the order both do not exist** | Zero hits for `ClickableRow` in `src/`; every occurrence is prose under `docs/`. `Table.tsx`'s `onRowClick` is not a substitute (no `tabIndex`, no `role`, no Enter/Space, no 44px floor, not in the barrel, Tailwind-classed so it compiles to nothing). **This screen does not use `Table` anyway** — `MovementList` hand-rolls its rows. | known-bad list; `src/components/ui/Table.tsx:113-119`, `:123` |
| **Behaviour v2.5 asserts that the code now contradicts** ||||
| 45 | §4.4: the hover card *"is mostly money… four of its rows are figures a money-blind role must never receive"* | **CONFIRMED as a Booqable observation / already solved in ours** | Our `HoverCard` carries **no rupee figure at all**. The six facts are Project, Duration, Equipment, Delivery mode, Collect from, Return to. Deposit/Payment/Documents/Staff/Notes are absent **by name**, each with its reason recorded in the source. The only money-gated thing on the card is the `Receive Payment` **action**, which takes `useCanViewMoney() && canRecordPayment(role)`. | `MovementList.tsx:181-206`, `:211-216`, `:237` |
| 46 | §4.4 ruling: *"Bind it to tap as well as hover"* | **CONFIRMED — already built** | The card opens on hover, on long-press, and on keyboard focus; its action buttons carry `minHeight: 44`. | `MovementList.tsx:181-183`, `:473-479`, `:298` |

---

## Corrected Layer D

### Panel — Outgoing (v2.5's "Going out")

```
source    bookings                                       bookings.ts:259-263 (BASE_COLUMNS)
          + clients ( name )        — NAME ONLY, no email
          + booking_lines ( id, qty ), voided_at IS NULL  bookings.ts:423
query     listBookings                                    bookings.ts:416
filter    todaysOutgoing(dayAd)                           bookings.ts:529-536
          stage IN ('Booked','Packed')
          pickup_at within the OPERATIONAL day
          cancelled_at IS NULL
widen     pickupsQuery(period, picked)                    data/today.ts:926-928
window    periodRange: All·Today·Tomorrow·Next 7 Days·This Week·Next Month
                                                          data/today.ts:835-861
          OFFERED on the Dashboard: Today · Tomorrow only  Today.tsx:103  [TODO(decision) open]
          NO "Custom" option exists anywhere
day       06:00 → 06:00 Kathmandu, from the `operationalDayStart` SETTING
          (default '06:00'), read per call                 bookings.ts:817-838
                                                           lib/operationalDay.ts:41,124
order     pickup_at asc, tiebreak id                       bookings.ts:535; :461
group     GAP — not built. Rows are flat, each carrying its own time.
money     NONE. No rupee column is in the projection.      bookings.ts:259-263
flags     'Partial Pickup' is NOT applied by this filter, and is NOT storable —
          booking_flags CHECK admits only Returned Early|Overdue|Missing|Damaged
engine    lib/workflow (statusToken, STATUS_ORDER) · lib/bs (dates) · lib/format (clockPad)
          — all reached through src/data/today.ts:3-14, NOT by the panel component
          lib/queries/useList (fetch/state) · lib/status (tokens, in MovementList)
Writes:   none — this panel dispatches no write that can land
Reads:    bookings (base table), via listBookings
```

### Panel — Incoming (v2.5's "Coming back")

```
source    identical — same listBookings, same BASE_COLUMNS   Law 2 holds
filter    todaysIncoming(dayAd)                              bookings.ts:539-546
          stage = 'On Rent'
          return_at within the operational day
          cancelled_at IS NULL AND actual_return_at IS NULL
widen     returnsQuery(period, picked)                        data/today.ts:931-933
order     return_at asc                                       bookings.ts:545
"+ Returned same-day"  GAP — not in the filter, and uncomputable today:
          actual_return_at is NULL on all 200 live bookings
Writes:   none
Reads:    bookings
```

### KPI strip

```
Outgoing today   pickupsQuery result length          Today.tsx:640-646
Incoming today   returnsQuery result length          Today.tsx:647-658
Overdue          overdue(NOW_AD) — stage On Rent,
                 return_at <= now, actual_return_at NULL   bookings.ts:602-609
Cash due         GAP — renders the literal 'Not tracked yet'; no derivation
                 exists in this repo. Money-gated: OMITTED, not blanked   Today.tsx:454, :676-692
Active Rentals   ACTIVE_RENTALS_FILTERS, count only, behind a disclosure  data/today.ts:944
```

### Footer links

```
View late (out)  GAP — not built. And bookings.ts overdue() CANNOT serve it:
                 it is hardcoded to return_at + stage 'On Rent'. A late PICKUP
                 needs pickup_at < now with stage IN ('Booked','Packed') — a new
                 filter set, not a parameter on the existing one.
View late (in)   GAP — not built. overdue() IS this query, minus the route.
View all         Built, but points at bare /operations with no query string —
                 not /rentals?stage=<set>                Today.tsx:720, :734
Run report       GAP — no control, and no /reports/pickups route exists
```

### Panel — the activity feed (v2.5's replacement for Latest notes)

```
source    audit_events                                      5,378 live rows
          — triggers on bookings, clients, invoices, payments (INSERT only),
            security_deposits and **product_units** (NOT 'inventory_units')
filter    latest N by **created_at** desc (there is NO occurred_at column)
          reader: listAuditEvents                          lib/queries/audit.ts:265-272
actor     GAP — no join to users. Columns are named explicitly with no embeds,
          and the actor facet is by ROLE, not name          lib/queries/audit.ts:180-186
gate      NOT a money gate. AUDIT_READ_ROLES = ['Owner','Admin','Manager'].
          Warehouse · Technician · Driver · Client get NO feed at all — which is
          most of the floor, on the floor's first screen.
money     audit_events has no amount column. Figures live inside old_values /
          new_values / diff JSONB. "Gate the amounts with useCanViewMoney" is not
          implementable as written; the unit to gate is the jsonb payload.
paging    GAP — "Load 10 more" not built
engine    **lib/queries/audit.ts** for reads (NOT lib/audit.ts, which is the WRITE
          helper logAuditEvent) · lib/money (formatMoney) · lib/bs (formatAdDateTime)
Writes:   none proposed
Reads:    audit_events — but nothing under src/modules/today/ reads it today
STATUS:   GAP — the whole panel is unbuilt on the Dashboard.
```

### The order sidebar (§5), mapped to ours

```
Ours is BookingDetail's <Rail>, per-page, not a global overlay   BookingDetail.tsx:1735
Booking Summary   SummaryRows over listInvoices(invoicesForBooking)
                  + listPayments(paymentsForBooking)             BookingDetail.tsx:758, :764
                  Money gate: the whole Card is OMITTED when !canBookingMoney  :978
                  Tablet/phone sticky money bar: omitted the same way          :1744
Quick Actions     Print · Share · More                            :1005-1031
Alerts            :1034
Activity Timeline booking stage history — NOT the audit trail     :1044
Counts on headers GAP — no Card title carries a count badge
Activity logs     GAP — no link from the booking to /admin/audit-log
Paid|Due pair     GAP on shape — SummaryRows stacks label/value; no side-by-side
                  pair with a status word above
Writes:  none from the rail; the payment launcher routes to /finance
Reads:   invoices, payments (both via the money-gated finance queries)
```

---

## Money and Law 6

**What is money on `/dashboard`:** exactly one figure — the `Cash due` KPI, which today renders the
string `Not tracked yet` because nothing in the repo derives it. That is the whole money surface.

**Gating mechanism, honestly named:** `useCanViewMoney()` — a **UI** gate, at three call sites:

| Site | What it gates | Evidence |
|---|---|---|
| `Today.tsx:491`, `:679-696` | the `Cash due` KPI card — spread into the array or not | omitted, not blanked |
| `Today.tsx:773-796` | the rail's `Record Payment` button | omitted |
| `MovementList.tsx:211`, `:237` | the hover card's `Receive Payment` action (`&& canRecordPayment(role)`) | omitted |
| `MovementList.tsx:343`, `:347` | the row menu's `Invoice` entry, filtered out of `ROW_MENU` | omitted |

**"Hidden" means not built into the DOM — CONFIRMED.** Every one of the four is an omission from an
array or a JSX conditional, never a CSS hide and never a mask. A money-blind session gets a
three-card KPI strip with no hole.

**Money-blind roles here:** Warehouse · Technician · Driver · Client (`rbac.ts:45-50`, mirroring the
DB's `auth_can_view_money()`, which excludes the same four). The role universe is **nine**, not
eight — `Manager` was appended later.

**Where the DB layer sits, and where it does not.** The screen never needs RLS to protect it,
because it selects no money column: `BASE_COLUMNS` (`bookings.ts:259-263`) has no rupee field, and
`deposit_required` was deliberately moved out of the base projection into a second read against
`bookings_deposit_v` (`bookings.ts:396-410`) which this screen does not call. So the Dashboard is
the one screen where the UI gate and the DB gate cannot disagree — there is nothing to disagree
about. That is a stronger position than v2.5's Layer D describes.

**Where v2.5's instruction becomes unsafe:** its activity-feed block says to gate amounts with
`useCanViewMoney`. On `audit_events` that is not a field-level gate at all (no amount column; the
figures are inside `old_values`/`new_values`/`diff` jsonb), and the operative gate on that table is
role-based read access (`AUDIT_READ_ROLES = ['Owner','Admin','Manager']`), which excludes the entire
floor. Building the feed as specified would give Warehouse an empty panel and Owner a jsonb leak.

---

## What this changes for the build

1. **Do not build the Going-out panel expecting rows.** `stage IN ('Booked','Packed')` matches
   **zero** live bookings (Returned 130 / Closed 60 / Quote 7 / On Rent 3 — SQL above). The panel is
   structurally empty on every date, and will stay so until a booking is created through the OS or
   the seed is changed. Consequence: **the panel's empty state, not its row, is what ships to a
   demo** — and any redesign of the row anatomy (avatar, item count, state pill) is unverifiable
   against live data. Verify row work against the mock store, and say so in the PR.
2. **The Incoming panel is near-empty for the same reason** — only 3 `On Rent` rows exist, returning
   30 Aug / 2 Sep / 3 Sep 2026, and `actual_return_at` is NULL on all 200 bookings. So `Overdue`
   resolves to whichever of the three has passed, and "returned today" is uncomputable.
3. **Drop `clients.email` from the row design.** The query joins `clients ( name )` only. Booqable's
   row shows a client email; ours cannot without widening `BASE_COLUMNS`, which is a Law 6 review
   (that constant is the reason "this module cannot leak a rupee figure" is checkable by reading one
   line). Decide the widening explicitly or drop the email cell.
4. **`View late` is one new filter set, not a copy.** v2.5 says both links resolve to the same
   `overdue` filter with an activity parameter. `overdue()` (`bookings.ts:602-609`) is return-side
   only. Building the pair means adding a `latePickups(nowAd)` — `pickup_at < now`, stage
   `IN ('Booked','Packed')`, `cancelled_at IS NULL` — beside it, and *then* the one-route-one-parameter
   shape is available. Budget it as new work.
5. **Fix the activity-feed contract before anyone codes it.** Four corrections: the timestamp is
   `created_at`; the sixth trigger table is `product_units`; there is no `users` join (the actor
   facet is a role); and the gate is `AUDIT_READ_ROLES`, not `useCanViewMoney`. As specified, the
   feed is invisible to Warehouse, Technician, Driver and Client — i.e. to the floor the Dashboard
   exists for. Rule that before building, not after.
6. **Do not cite `ClickableRow` or the "11 Aug improvement order".** Neither exists.
   `MovementList` hand-rolls its rows and does not use `Table.tsx`, so the a11y work
   (one row = one tab stop, focus-visible ring, 44px floor) has to be done in `MovementList.tsx`
   directly. Cite **Law 15** for 44×44 and **Law 14** for the 768px column question.
7. **Retire the `periodRange`/`PeriodControl`/Operations-scope conflation from the spec.** There is
   no `Custom` period anywhere; there *is* a `Next Month` the spec omits; and the Dashboard offers
   two options behind a live `TODO(decision)` (`Today.tsx:91-102`). Ruling that TODO is cheaper than
   building against the spec's five-option fiction.
8. **The 06:00 day is settled — stop treating it as open.** `startOfDay`/`endOfDay` already read
   `operationalDayStart` per call (default `'06:00'`), and `finance.ts` deliberately keeps calendar
   midnight so a floor setting cannot move VAT periods. Any doc still carrying that `TODO(decision)`
   is stale.
9. **Swap `Rail` for `ReflowRail` on this screen.** `Today.tsx:922-926` renders `<Rail>` for every
   non-phone viewport. `Rail` **is** `CollapsibleAside`, which defaults to collapsed at tablet — and
   `Page.tsx:333-349` names that exact pattern as a rulings-§7 violation ("collapse below 1280 means
   **reflow**, not **hide**"), putting Quick Actions behind a handle on the warehouse tablet this
   product targets. `ReflowRail` is exported from the same file and Today already imports from it.
10. **`fetchCanonicalBooking` has no caller.** v2.5's Law 2 escape hatch ("figures come from
    `fetchCanonicalBooking` on detail") describes an unwired module. If it is the intended pricing
    read, wiring it into `BookingDetail` is its own task; until then, cite `listInvoices` /
    `listPayments` as the real detail-money path.

### `[CONTRADICTS prior pass]` — four items in `docs/booqable/dashboard.md` that the code has moved past

| Prior pass said | Now |
|---|---|
| Gap 1: *"the screen runs on a frozen clock — `TODAY = new Date(Date.UTC(2026, 6, 31))`"* | **Fixed.** `const TODAY = getBusinessToday()` (`data/today.ts:24`), real clock, Kathmandu civil day. `getBusinessToday(now = new Date())` (`bs.ts:277`). |
| Open decision 2: the day-boundary `TODO(decision)` *"is real and still open"* | **Ruled and applied** — D4, 06:00 as a setting (`bookings.ts:712-742`, `operationalDay.ts`). |
| Structure item 3: the body is a two-column grid of the two `MovementList`s | **Extended** — the body is now `main | Rail`, with the two lists inside the main column and a Quick Actions / Quick Info rail beside them (`Today.tsx:773-796`, `:922-926`). This is the substance of the prior pass's open decision 6, now built — and built with `Rail`, the shape that decision warned against (see item 9). |
| Gap 4: *"`AlertsPanel`'s View all points at `/notifications`, a 404"* | **Off this screen.** `AlertsPanel` is no longer imported by `Today.tsx`; it is mounted by `OperationsQueues.tsx:25`, `:490`. The defect moved, it did not close. |

### The page doc is stale — code wins

`docs/pages/06_today.md` describes route `/today`, title `"Today"`, an `AlertsPanel` and a
`CalendarPanel` on the page, and a `minmax(0,1.55fr) minmax(0,1fr)` two-track grid. All four are
false as of 31 Aug: the route is `/dashboard` (`/today` redirects), the title is `"Dashboard"`
(`Today.tsx:826`), `CalendarPanel.tsx` was deleted, and `AlertsPanel` moved to Operations. The doc
needs a rewrite; nothing in it should be cited as Layer D input.

---

## Open questions

1. **Does the Going-out panel ever get rows?** Zero `Booked`/`Packed` bookings exist live.
   *Settles it:* either a seed change that puts bookings in those two stages, or a ruling that the
   Dashboard is demoed against the mock store (`src/lib/mock/`) rather than the live project.
2. **What derives `Cash due`?** *Settles it:* a named query. `payments` is not joined by
   `listBookings`, `bookings.deposit_required` is the amount *required* not *owed*, and both
   `payments` and `invoices` hold **0 rows** live — so even a correct derivation renders zero today.
   Answer the derivation and the corpus together, or delete the card.
3. **Four KPI cards or six?** `Today.tsx:624-637` records the contradiction verbatim: PLAN.md §4.0
   declares the 4-cap superseded while PLAN.md Phase 6 still lists the 6-strip as a live violation,
   and `data/today.ts:186-200` carries a SETTLED-for-six ruling. *Settles it:* one edit to PLAN.md
   retiring the loser.
4. **Who may see the activity feed?** `AUDIT_READ_ROLES` is Owner/Admin/Manager. *Settles it:* a
   ruling on whether the floor's first screen may carry a panel most floor roles cannot see — and if
   yes, whether a narrower "booking events" read (not `audit_events`) is the right source.
5. **`View all` → `/rentals` or `/operations`?** Still open from the prior pass. *Settles it:* a
   destination ruling. Note `/rentals`' facet counts are unwired (`facetCounts.ts` has no caller in
   `src/`), so sending traffic there advertises filters that show no counts.
6. **Does the Dashboard adopt row grouping by day?** v2.5 says both panels group; ours are flat, and
   with `Today|Tomorrow` as the only periods a group heading would always have exactly one group.
   *Settles it:* ruling question 7 above (which periods) first — grouping only earns its cost once a
   multi-day period is offered.
7. **Is the `Partial Pickup` flag meant to be persisted?** It exists in `workflow.ts` but
   `booking_flags`' CHECK admits only four labels, none of them this one. *Settles it:* either a
   migration widening the CHECK, or a ruling that `Partial Pickup` is a derived state
   (`stage='Packed'` with a partial handover session) and never a stored row.
8. **Does the booking rail get header counts and an audit link (§5)?** Both are cheap and both are
   unbuilt. *Settles it:* a scope decision on `BookingDetail`'s rail — it is outside this screen's
   route but inside this spec section.
