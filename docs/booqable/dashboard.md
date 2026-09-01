# Dashboard

| | |
|---|---|
| Booqable route | `/` |
| Our route | `/dashboard` (`src/App.tsx:158`); `/today` is a `Navigate … replace` to it (`:169`) |
| Our component | `src/modules/today/Today.tsx` (folder name unchanged) |
| Captured from | **No archive file.** Booqable's side is a single live DOM read recorded in *Reference Extraction Spec v1.0* §4, 30 Aug 2026. No saved page exists in this repo to re-check it against. |
| Our side verified | 31 Aug 2026, against code |

> **What this file is.** The **Layer A / B / C** record for this screen — our side, verified against
> code. Layer D is not here: it is verified in
> [`layer-d/dashboard.md`](layer-d/dashboard.md), which supersedes §D below wherever they differ.
> The Booqable side is now carried by [`REFERENCE_SPEC_v2.5.md`](REFERENCE_SPEC_v2.5.md) §4–§5;
> this file predates v2.5 and cites v1.0's §4 for it.
>
> **Reading rule.** Every Booqable-side line below is `[spec §4]` — traceable only to that one DOM
> read, not re-checkable here. Every our-side line carries a `file:line`. Do not let the two blur.
>
> **Reconciled 31 Aug (late).** The four items `layer-d/dashboard.md` flagged as
> `[CONTRADICTS prior pass]` have been folded in: the frozen clock and the `/notifications` 404 are
> recorded as closed, the rental-day decision as ruled and built, and §A2 now describes the
> post-00:28 file. Re-verified in code, not taken from the flag.

---

## A. Structure

### A1 · Booqable `[spec §4.2 — unverifiable in this repo]`

Three list panels. No KPI strip, no chart, no page date-range picker, no search.

1. **Latest notes** — 10 rows newest-first, `Load 10 more`. Row = author · free-text body ·
   `DD-MM-YYYY HH:mm` · booking ref.
2. **Going out** — `Run report` + `Next 7 days`; rows grouped under an absolute date heading
   ("Wednesday September 2 2026"); row = time · avatar initials · client name · client email ·
   item count + state ("1 reserved") · booking ref. Footer: `View late` · `View all`.
3. **Coming back** — no `Run report`; rows grouped under a **relative** heading ("Tomorrow") —
   their own inconsistency with panel 2. Footer: `View late` · `View all`.

### A2 · Ours, as built `[verified 31 Aug — see the timestamp note]`

> **`Today.tsx` was replaced at 00:28:52 on 31 Aug**, mid-audit, by another session applying
> `babin-booqable-layout-30Aug2026.zip` (uncommitted). Line numbers below are the **current**
> file. The structure changed less than the churn suggests — see the delta at the end.

Not three list panels. Top to bottom:

| # | Thing | Evidence |
|---|---|---|
| 1 | `PageHeader title="Dashboard"`; actions = `DatePill`, `PeriodControl`, **New Rental** | `Today.tsx:812-824` |
| 2 | **`KpiStrip … columns={4}`** + a "N more figures" / "Fewer figures" disclosure | `Today.tsx:831-855` |
| 3 | Two-column grid: `MovementList` "Outgoing Today" \| "Incoming Today", **each with its own filter row above it** | `Today.tsx:880-887` |
| 4 | `TimelinePanel` "Today's Timeline" | `Today.tsx:906` |
| 5 | **`Rail label="Quick actions"`** — `Card` "Quick Actions" (New Rental · money-gated Record Payment · Open Operation · Open Calendar) and `Card` "Quick Info" (Active rentals, Overdue) | `Today.tsx:765-798`, `:909-913` |
| 6 | `FooterNote` | `Today.tsx:916` |

Phone (<768) swaps the grid for a `SegmentedControl` `[Out][In]` showing one list at a time.

**What the 00:28 change actually did:** split the single page-level filter state into per-list
`pickedOut`/`pickedIn`, moved the one `MoreFilters` popover out of the header and instantiated it
twice (once above each list), and added the right-hand rail. It did **not** touch the KPI strip,
the two movement panels, the Timeline or the period control — those are byte-identical to before.
The rail is the part that carries a ruling problem; see open decision 6.

**Differences that matter:**

- **We have a KPI strip; Booqable has none.** The spec is right that this is a real choice
  (§4.6 ruling 5), not an oversight. It is four cards — *Outgoing today*, *Incoming today*,
  *Overdue*, and a money-gated *Cash due* — plus two behind the disclosure.
- **We have no notes panel and no activity feed.** `MovementList.tsx:206` records the reason
  in place: no notes column is selected by `listBookings`.
- **We do not group rows under date headings** — neither absolute nor relative. Rows are flat,
  each carrying its own time (`MovementList.tsx:604`, `:820-821`).
- **Panel titles are dynamic**: `Outgoing Today` becomes `Outgoing · Tomorrow` when the period
  changes (`Today.tsx:678`).

---

## B. Function

### B1 · Booqable's verified destinations `[spec §4.3]`

| Panel | Control | Destination |
|---|---|---|
| Going out | `Run report` | `/reports/pickups` |
| Going out | `Next 7 days` | client-side scope change, no href |
| Going out | `View late` | `/orders/overdue?filters[activity]=start` |
| Going out | `View all` | `/orders?filters[statuses][]=reserved&filters[statuses][]=started` |
| Coming back | `View late` | `/orders/overdue?filters[activity]=stop` |
| Coming back | `View all` | `/orders?filters[statuses][]=started&filters[statuses][]=stopped` |
| Both | any row cell | `/orders/{uuid}` |
| Notes | `Load 10 more` | appends 10, same panel |

**The finding worth keeping:** every panel is the same bookings query under a different named
filter, and each footer link is that filter widened. `activity=start` means pickup, `activity=stop`
means return — their overdue screen is *one* route taking an activity parameter, not two screens.

### B2 · Ours, as built `[verified 31 Aug]`

| Control | Type | Destination / effect | Evidence |
|---|---|---|---|
| `PeriodControl` | 2 buttons | local state only — offers **`['Today','Tomorrow']`** | `Today.tsx:103`, `:110` |
| `DatePill` | link | `/calendar?d=${CAL_TODAY_ISO}` | `Today.tsx:39` |
| `MoreFilters` | popover | local state; 34 chips, **only 9 live** | `Today.tsx:169-316`; `data/today.ts:595-640` |
| New Rental | button | `/rentals/new` | `Today.tsx:780-782` |
| Panel `View all` | link | **bare `/operations`** — no query string | `MovementList.tsx:568-573`; `Today.tsx:690`, `:704` |
| `+ N more` overflow | link | same bare `/operations` | `MovementList.tsx:899-917` |
| Timeline `View full timeline` | link | `/calendar`, no query | `TimelinePanel.tsx:81-86` |
| Row primary button | link | Pack / Handover / Return / Open | `MovementList.tsx:58-72` |
| Row `⋮` → Complete Pickup | dispatch | **cannot land** — `implemented` unset, fails closed | `completePickup.ts:9-16`; `core.ts:223` |
| Row `⋮` → Complete Return | dispatch | **cannot land** — always called with `lines: []`, own validator rejects | `MovementList.tsx:147`; `returnRental.ts:53-55` |

**Three gaps against the Booqable shape:**

1. **`View late` does not exist.** The string appears nowhere in `src/`. Booqable's
   exception-chip pattern — surfacing lateness as a count on the normal list rather than a
   separate alarm surface — is genuinely unbuilt. It is also the one thing
   `BOOQABLE_DESIGN_PRINCIPLES.md:43-45` already singled out as worth copying.
2. **`View all` carries no filter.** Ours points at `/operations` bare; the spec's Layer D
   proposes `/rentals?stage=<set>`. Those are different screens, not different query strings.
   Decide which before building.
3. **Status translation (R3, ours down to theirs).** `reserved`→Booked, `started`→On Rent (our
   *Packed* has no counterpart), `stopped`→Returned. The spec's judgement call — that Booqable
   puts `started` in *Going out* because a partly-collected order still has items to fetch, and
   that our `Partial Pickup` flag says it better than a stage does — is sound but unconfirmed.

---

## C. Hover & interaction

`[observed — Booqable, spec §4.4]`

- Panel action labels are `<span>` inside real `<a>`/`<button>`, so keyboard and focus work.
- **Each row cell is its own anchor** to the same `/orders/{uuid}`: a four-column row is four tab
  stops to one destination.
- Client email renders as body text *inside* the row link, so clicking it opens the booking rather
  than acting on the address. `[unverified]` whether a separate mail affordance exists.

`[observed — ours, 31 Aug]`

- Rows open a 520px `HoverCard` on hover, or on long-press for touch (`MovementList.tsx:181-299`,
  `:473-479`). The card is where *Complete Pickup* and *Complete Return* live — both of which
  cannot write (§B2).
- Row left border is red when Overdue, blue for Pickup/Delivery, transparent otherwise
  (`MovementList.tsx:753-757`). Status is *also* carried by a `Pill` with text, so Law 11 holds —
  but the border alone does encode a distinction, and it should not be the only carrier.

`[ruled — what ours must do]`

- **One row = one link = one tab stop.** Cells inside are not separately focusable.
- **Hover reveals nothing that matters.** Anything worth showing on hover belongs in the row or
  behind an explicit control (**Law 15**, 44×44 — the spec cites this as Law 16, which is actually
  the AI-panel gate) — hover fails the packing bench, which is touch-only. *This is currently
  violated:* the two floor verbs are hover-card-only.
- **Row hover = background token shift only.** No lift, no shadow, no border-colour-alone change.
- **Focus-visible ring is mandatory**, and must not be the same treatment as hover.
- **Booking ref is the affordance**; the rest of the row is the hit area.

> A saved page cannot prove what Booqable pops on hover. If hover cards matter, that is one live
> session with the real app, not another archive save.

---

## D. Backend data link

**Outgoing panel**
```
source   bookings + embeds clients(name), booking_lines(id, qty)   bookings.ts:258-262
query    listBookings                                              bookings.ts:410-478
filter   todaysOutgoing — stage IN (Booked, Packed), pickup_at in
         the Kathmandu day, cancelled_at IS NULL                   bookings.ts:523-530
widen    pickupsQuery(period, picked) — periodRange + stage chips   data/today.ts:904-906
money    NONE on rows. Law 2 holds: no rupee column is selected.
engines  lib/workflow (stage) · lib/bs (dates) · lib/queries/useList
```

**Incoming panel**
```
filter   todaysIncoming — stage On Rent, return_at in the day,
         cancelled_at AND actual_return_at both NULL               bookings.ts:533-540
widen    returnsQuery(period, picked)                              data/today.ts:909-911
```

**Overdue KPI / alerts**
```
filter   overdue(NOW_AD) — stage On Rent, return_at <= now,
         actual_return_at IS NULL                                  bookings.ts:596-603
```

The spec's Layer D instinct is correct and already true in code: **the panels are named filters on
one query**, which satisfies Law 2 for free. `bookings.ts` also carries `quotesExpiring`, which the
spec's list of four omits.

**Panel 1 — Latest notes: does not map, and must not be copied as-is.**

The spec's decomposition of the ten captured notes is the strongest evidence in the document. Nine
of ten are typed records living as prose — a payment, two charges, four damage records, a booking
line, a policy, a downtime block — and only one (`bill chahi paxi lane`) is a genuine free-text
instruction. Every one is invisible to every report.

`[ruled]` Our panel is **not** a notes feed. It is a **recent-activity feed reading
`audit_events`**, rendering typed events with their own icons and amounts, free text being one
event type among many.

**The table is ready. The join back to its subjects is not.** Checked live on
`sxguwvgoserhdolewibb`, 31 Aug:

- `audit_events` holds **5,378 rows** across 21 columns — `event_class`, `category`, `module`,
  `action`, `severity`, `actor_id`, `actor_role`, `old_values`, `new_values`, `diff`, `reason`,
  `created_at`. A genuinely typed event store, which is exactly what this ruling wants.
- **Six `log_audit_event` triggers exist**, on `bookings`, `clients`, `invoices`, `payments`,
  `security_deposits` and `product_units`. The spec says `inventory_units`; the table is
  `product_units`. Every domain it names is covered.
- The table guards itself in the database: `reject_update_append_only` and
  `reject_delete_nothing_is_deleted`.

Three things that raise the cost:

1. **The audit trail outlives its subjects.** `invoices` and `payments` currently hold **zero
   rows**, while `audit_events` carries 1,070 invoice events and 93 payment events about them. A
   feed row joining back to its record will not resolve. Rendering an event whose subject is gone
   is the *normal* case here, not an edge case — design for it first.
2. **No code under `src/modules/today/` reads `audit_events`.** It is read today only by
   `/admin/audit-log`, and the two screens that would neighbour this feed — `/admin/audit-log` and
   `/admin/activity-log` — are both **Seed-only** (`docs/pages/INDEX.md`, docs 51 and 52).
3. **`booking_lines` is empty**, so the "N items" chip already on every Dashboard row is 0 for all
   200 live bookings. A feed added above rows that are themselves under-reading is the A5
   failure — two surfaces disagreeing — arriving by a new route.

One event type the spec's trigger list omits: `booking_discounts` / `Approve`, 120 rows.

Money on such a feed is Law 6 territory, and here the spec's instruction is unsafe as written. It
says to gate amounts with `useCanViewMoney`. Law 6's operative clause is **"RLS, not the UI"**
(`PLAN.md:23`), and PLAN.md records that it *"fails at the database"* (`:190`) and that
*"Until step 3 is applied, Law 6 is a UI convention"* (`:1145`, `:1207`). Gating in the UI alone is
option (c) in PLAN.md's own list, pre-rejected at `:1200` as *"Contradicts Law 6's own wording."*

The four money-blind roles — Warehouse, Technician, Driver, Client — are correct as implemented
(`rbac.ts:45-50`), but they are a **code** widening, not law text: Law 6 as written names only
Warehouse. The role universe is **nine**, not eight (`Manager` was reopened by
`0017_reopen_manager_role.sql`). Hidden must continue to mean **not built into the DOM**, which is
what the Dashboard already does.

---

## E. Verdict

**Keep**
- Panels as named filters on one bookings query — already how ours works.
- The `View late (N)` exception-chip pattern — unbuilt, cheap, and the one Booqable idea this
  screen most clearly lacks.
- One overdue route taking an activity parameter, rather than two screens.
- No money on list rows.

**Drop**
- The notes panel as a notes panel. Adopt the typed-event feed instead, at the real cost above.
- Booqable's date-heading inconsistency (absolute in one panel, relative in the other).

**Differs, and ours wins**
- We keep the KPI strip. Booqable's dashboard answers only "what moves today"; ours also answers
  "how much is overdue". That is a deliberate divergence, not a gap to close.
- Our `Partial Pickup` flag expresses a part-collected booking better than Booqable's lack of any
  state between Reserved and Started (R3, A3).

**Gaps in our build** — these outrank everything above
1. **Neither floor verb on this screen can write** (§B2). Three of the spec's interaction rulings
   are about rows whose primary actions fail closed.
2. **25 of 34 More Filters chips are inert**, each labelled with the column or join it needs
   (`data/today.ts:595-640`).

**Two gaps this file listed have since closed — verified in code 31 Aug:**

- ~~The screen runs on a frozen clock.~~ **Fixed.** `const TODAY = getBusinessToday()`
  (`data/today.ts:24`) — the real clock, on the Kathmandu civil day (`bs.ts:277`). The
  `Date.UTC(2026, 6, 31)` constant is gone.
- ~~`AlertsPanel`'s "View all" points at `/notifications`, a 404.~~ **Off this screen.**
  `AlertsPanel` is no longer imported by `Today.tsx`; it is mounted by `OperationsQueues.tsx`.
  The defect moved rather than closed — chase it there.

---

## F. Open decisions

**1. Does the Dashboard keep its KPI strip?** `[cost: low to reverse — one array]`
Booqable has none. Ours has four cards plus two behind a disclosure, and one of them (*Cash due*)
renders the literal string `NOT_TRACKED = 'Not tracked yet'` because nothing in the repo derives
it (`Today.tsx:446`, `:650-660`). Deciding "keep" should also decide what Cash due is, or remove
it. Related open marker: `Today.tsx:608-619` names three contradictory sources for whether the
strip is four cards or six and resolves none.

**2. ~~What does the rental day mean for "today's pickups"?~~ — RULED AND BUILT**
`[was: high cost — silently wrong rows at 5am and 11pm]`
**Closed since this file was first written.** The `TODO(decision)` at
`src/lib/queries/bookings.ts` is gone, replaced by the ruling: **the operational day starts at
06:00, as a setting** — `operationalDayStart`, default `"06:00"`, changeable in
Settings ▸ Organisation. The boundary arithmetic lives in the new `src/lib/operationalDay.ts`
(the pure half, Law 1); `bookings.ts` reads it.

One point from the earlier draft still stands as a record of *why* it was ruled that way. The
spec's §4.6 argued it from all four captured Booqable bookings sitting at 06:00/06:15 — which is
Booqable's **default pickup time**, and which `BOOQABLE_DESIGN_PRINCIPLES.md:146` (anti-pattern
A6) registers as *"default times masking reality,"* explicitly not to be copied. The 06:00→06:00
rental day is a real Babin rule, and that — not their defaults — is the honest ground for the
ruling. Making it a *setting* rather than a constant is a better answer than either.

**3. `View all` → `/rentals` or `/operations`?** `[cost: medium — a wrong destination is a
retrained habit, not a code fix]`
Ours goes to bare `/operations` today. The spec's Layer D proposes `/rentals?stage=<set>`. These
are different screens. Note `/rentals` renders eleven filter groups of which **exactly one**
(Status) has a query behind it, and it shows no counts at all (`RentalsList.tsx:579-593`,
`:1070`) — so sending traffic there advertises filters that do not filter.

**4. Is the activity feed worth its cost now?** `[cost: high — but for a different reason than
"the table isn't ready"]`
The table *is* ready: 5,378 live rows, 21 typed columns, six `log_audit_event` triggers, and
database-level append-only guards. The Booqable finding — nine of ten notes are typed records
living as prose — justifies the direction, and the store exists to receive it.

The cost is in the join, not the table. `invoices` and `payments` hold **zero rows** while
`audit_events` carries 1,070 invoice and 93 payment events about them, so a feed row usually
cannot resolve its own subject. Both neighbouring screens (`/admin/audit-log`,
`/admin/activity-log`) are Seed-only. Decide what an event whose record is gone renders as
**before** building, because today that is the common case, not the exception.

**5. Which control is "the period control"?** `[cost: low, but it is a real conflation]`
Spec §4.5 says "reuse `periodRange` — the same control `/operations` took on 30 Aug" and lists
*Today | Tomorrow | This Week | Next 7 Days | Custom*. Three different things are being merged:
`periodRange` is a date-range **function** (`data/today.ts:813-839`); the Dashboard's
`PeriodControl` offers **two** options (`Today.tsx:103`); the five-option set is
`SCOPE_LABEL`/`SCOPE_ORDER` on **OperationsQueues** (`:179-186`). `Today.tsx:91-106` carries an
open `TODO(decision)` on exactly which periods the Dashboard may offer, and `data/today.ts:509-531`
warns against deleting the five unoffered chips because that would decide the question by making
the alternative unbuildable.

**6. The `babin-booqable-layout` zip is now applied — does it stay?** `[cost: medium — it is a
live ruling violation, and the test that guarded the ruling was deleted in the same change]`
**This is no longer a question about an artifact on disk.** Another session applied the zip at
00:28:52 on 31 Aug, mid-audit; `Today.tsx` and `OperationsQueues.tsx` now hash-match it exactly,
and the change is **uncommitted**.

Its `Today.tsx` is **not** a Booqable-structure rework: it keeps the KPI strip verbatim, keeps both
`MovementList` panels and the Timeline, and keeps the two-option period control. What it actually
changes is filter placement (one `MoreFilters` popover becomes two, one above each list) plus a
right-hand Quick Actions / Quick Info rail.

It renders `<Rail>` unconditionally for every non-phone width, which
`src/components/ui/Page.tsx:333-349` warns violates the rulings-§7 requirement that collapse below
1280 means *reflow, not hide* — putting rail content behind a handle on the warehouse tablet this
product targets. The companion Ops file avoids that trap; this one does not.

Do **not** read the concurrent deletion of `calendar.kpiBand.test.tsx` as related to this. That
was `/calendar`'s KPI band, retired deliberately at the owner's instruction and logged at
`PROGRESS.md:850`. An earlier draft of this pack paired the two; it was wrong. (It does leave
`/calendar` with no test coverage at all — a separate matter.)
