# DECISION SHEET — Booqable reference extraction

**31 August 2026.** Closes the pack. Blockers first, then the laws worth adopting, then what to
investigate. Every item states **what it unblocks** and **the cost of getting it wrong**, because a
decision with neither is a discussion.

Nothing here was decided unilaterally. Items in §1 are **Babin's calls** — they cost money or data
to reverse, and the v1.1 spec was right to surface rather than resolve them. Items in §2 are
documentation-side rulings this pass **did** settle, because they cost nothing to reverse and
leaving them open blocks writing.

---

## 1. BLOCKERS — need Babin, in this order

### ~~B1. Does the rental day run 06:00 → 06:00?~~ — ✅ **CLOSED. Ruled 06:00, and built.**

> ⚠ **Corrected 31 Aug, at the end of this session.** B1 was drafted as the pack's top blocker.
> Re-checking the tree before publishing found it **already ruled and already implemented** by a
> concurrent session. It is recorded here as closed rather than deleted, because the reasoning about
> its *cost* still stands and because how it closed is itself the lesson.

**The ruling.** The rental day runs **06:00 → 06:00, as a setting** — `operationalDayStart`,
default `"06:00"`. Babin's ruling, dated 30 Aug, evidenced twice in the live Booqable account
(Settings ▸ Rental period ▸ Default booking times, both 06:00; and client contract clause २.१) and
by every captured booking sitting at 06:00/06:15.

**Where it now lives:**

- `src/lib/operationalDay.ts` — **new**. The pure half, per Law 1: given a day and a start-of-day it
  answers where the boundaries sit and which operational day an instant belongs to. Reads no
  storage.
- `src/lib/queries/bookings.ts` — reads the setting and passes it in. **The `TODO(decision)` that
  this sheet was written to surface is gone from the file.**
- `src/lib/settingsStore.ts:47,227` — the `operationalDayStart` key.
- `src/modules/settings/sections/Organisation.tsx` — where the owner sets it.

**The part worth keeping.** The ruling is deliberately scoped, and the scoping is the good bit. The
operational day governs **the floor's day only** — today's pickups, today's returns, the Operations
queues, the pickups report. It explicitly does **not** govern:

- **Finance day boundaries** — a payment taken at 05:30 belongs to that calendar date on the VAT
  books. Moving tax-period boundaries with a floor setting would be a books-of-account change
  nobody ruled.
- **Audit and activity-log day scopes** — "what happened on the 12th" is a calendar question.
- **BS calendar rendering** — which civil date it is never moves; only which *shift* an instant
  belongs to does.

**Still worth checking, because the ruling did not make it go away.** `ListFilters` has no
half-open date range — `dateRange` is `gte`/`lte`, inclusive at both ends
(`src/lib/queries/listQuery.ts:156-160`), while a 06:00→06:00 window is half-open by nature
(`>= 06:00 today`, `< 06:00 tomorrow`). Confirm how `operationalDay.ts` resolves that against the
shared contract — either the contract changed, or the boundary is being expressed some other way,
and which one it is matters for every other caller.

> **Lesson, recorded because it will recur:** this pack spent its first hours establishing facts and
> its last hour discovering one of them had changed underneath it. **Re-check the tree before
> publishing anything long-running.** This repo is edited concurrently.

**Also learned from the same file:** the authority for this ruling is
`docs/booqable/REFERENCE_SPEC_v2.5.md` Appendix A0, D4 — **a v2.5 of the extraction spec that
supersedes the v1.1 this pack was written against.** That file is not on disk anywhere in the
workspace. **Find v2.5 before acting on anything here**; where the two disagree, v2.5 wins, and
several of this pack's corrections may already be incorporated in it.

---

### B2. Do booking list rows carry the rental total?

**Unblocks:** `/rentals`' columns, the Dashboard rows, and every future list of bookings. The spec
asks for this to be decided **once, for all lists**, and that is right.

**What the spec got wrong here matters.** It says our list rows carry no money at all. They do:
`BookingListRow.depositRequired` exists, sourced from the **masked view `bookings_deposit_v`**,
opt-in via `listBookings({ withDeposit: true })`, and rendered only behind `useCanViewMoney()`
(`src/lib/queries/bookings.ts:99-108`). That is a considered Law 6 implementation already in place.

**So the real question is narrower:** should a row also carry the **rental total** and the
**outstanding balance**?

**And there is a blocker under the blocker.** Nothing in the repo can currently compute a rental
total for a list row. `fetchCanonicalBooking` cannot either — `CanonicalEngineInput` types `crew`,
`transport`, `vatPercent` and `payments` as literally `null`
(`src/lib/bookingQuery.ts:462-483`). Answering "yes" therefore commissions an engine, not a column.

**Cost of getting it wrong.** Say yes carelessly and a Warehouse operator sees money, breaching
Law 6 at the RLS layer where it is hardest to notice. Say no carelessly and the floor cannot see
what a booking is worth without opening it, which is the complaint that started this.

> **Recommendation:** keep deposits as they are. Defer rental total until the canonical engine can
> produce one. Decide the *principle* now, build the column later.

---

### B3. Does the Dashboard keep its KPI strip?

**Unblocks:** the Dashboard layout, and the precedent for every other screen's strip.

**State of play.** Booqable's dashboard has **no** KPIs, no chart, no date-range picker, no
search — three list panels and nothing else. Ours has a KPI strip, recently thinned: the Alerts KPI
was removed with its panel on 30 Aug, Overdue remains because a query still backs it.

**The trap to avoid.** "Booqable does not have one" is not an argument. Booqable is a SaaS product
onboarding strangers; this is one company's floor screen. Copying the absence is as thoughtless as
copying the presence.

**Cost.** A strip nobody reads is permanent noise at the top of the most-opened screen. Removing
one people did read costs a daily glance they now have to hunt for.

> **Recommendation:** keep only KPIs that (a) a query backs today and (b) name a number nobody can
> get faster elsewhere. On current evidence that is Overdue and little else. **Decide deliberately
> — do not let it erode by deletion.**

---

### B4. Should `Coming back` include same-day returns?

**Unblocks:** `todaysIncoming`, and the honesty of the Dashboard's second panel.

The spec's §4.3 maps Coming back to `[On Rent]` *"plus Returned for the same day"*. **The code does
not do this and cannot**: `todaysIncoming` sets `stage = ['On Rent']` and
`presence.actual_return_at = false`, which positively excludes anything returned
(`src/lib/queries/bookings.ts:538-545`).

**Cost.** As built, a booking disappears from Coming back the instant it is returned — so the panel
answers "what is still outstanding", not "what was due back today". Both are legitimate; they are
different questions and the panel's title should match whichever is chosen.

> **Recommendation:** leave the query alone and **rename the panel to match what it does.** Cheaper
> and more honest than widening the filter.

---

### B5. Cancelled and Archived excluded by default — adopt or not?

**Unblocks:** `/rentals`' base scope and its facet arithmetic.

Booqable excludes both from the default 654, computes facet counts inside that scope, and still
shows the excluded counts so an operator can opt in. Two behaviours in one control — a filter and a
census — and it is a good pattern.

**The hazard the spec correctly names:** the exclusion is invisible. A cancelled booking
"disappears" and the operator has no way to know a base predicate did it.

Our `bookings.ts` already excludes cancellations, and does it via `presence: { cancelled_at: false }`
rather than a stage filter — because **`Cancelled` is not a stage in this system, it is a flag**
(`0015` header). That is the right mechanism.

> **Recommendation:** adopt the exclusion **and** adopt Booqable's mitigation — show the excluded
> count somewhere visible. The pattern is only safe with both halves.

---

## 2. RULED this pass — documentation-side, reversible, blocking nothing

| # | Ruling | Why |
|---|---|---|
| R-a | **Every money tile carries a one-line definition on the tile.** | Straight adoption of the spec's best cheap idea. This business has already lost time reconciling two figures that were never comparable (Bookings-list Revenue vs the Documents register — ex-tax-including-unpaid versus totalling-issued-invoices). The definition is not decoration; it prevents the next reconciliation. |
| R-b | **This pack cites laws by their real `PLAN.md` §0 number.** | The spec's numbers are wrong in a cluster (see `CORRECTIONS.md` §2) and the repo's own code cites them correctly. A doc that disagrees with the code it describes is worse than no doc. |
| R-c | **Every backlog item carries a checkbox.** | A generated worklist with nowhere to record completion has already cost this project a session of re-reading files. |
| R-d | **A live-database claim needs an identity.** | `npm run check:db` run bare connects as `anon`; RLS filters all 23 tables to zero and it says so twice. Its zeros are evidence of nothing. See `LIVE-DB-VERIFICATION.md` §7. |
| R-e | **Layer A and Layer C may not be written without a live session.** | No Booqable archive exists in this repo. Generating structure from nothing produces fabricated observation, which is the failure mode this project is most exposed to. |
| R-f | **The Dashboard notes panel becomes an activity feed over typed events, reading `audit_events.created_at`** — not `occurred_at`, which does not exist. | The spec's decomposition of the ten Booqable notes is its best analysis: nine of ten are typed records living as prose, invisible to every report. |

---

## 3. ADOPT — from Booqable, structurally, no decision needed

- [ ] **Counts on section headers** (`Documents 1`, `Invoices 1`). Cheap, and tells an operator
      whether opening is worth it.
- [ ] **Paid / Due as two figures side by side, with the payment status as a word above them.**
- [ ] **Activity log reachable from the booking**, not only from an admin screen. Ours currently
      reaches `audit_events` only through `modules/admin/AuditLog.tsx`.
- [ ] **Documents and Invoices as separate sections** — a quote is not an invoice. Ours already
      agrees; recorded so nobody merges them.
- [ ] **Facet counts beside filter options**, shown *within* the current scope.
- [ ] **Status carried by text *and* colour** (Law 11). Booqable does this correctly and it is
      worth copying rather than re-deriving.

## 4. DO NOT ADOPT — closed, do not re-open

| Item | Why |
|---|---|
| Booqable's visual design | R1 — the reference is structural. Our design system survives untouched. |
| Paisa + VAT-on-discounted-total | R2 — whole rupees, one rounding. The two systems differ on every booking for the whole bridge period; this is known and accepted. |
| `Allow shortage` as a record | R4 — it is permission to oversell, not a record. Our external-gear tracking has no counterpart and must never be overwritten by a sync. |
| Their four RBAC levels | R5 — cannot express our roles. Do not narrow ours to fit. |
| `Continue setup 9/11` | Onboarding scaffolding for a SaaS trial, not an operating tool. |
| Free-text notes as the primary record | The anti-pattern the whole §4.5 analysis exists to name. |
| Per-cell row anchors | Their four-column row is four tab stops to one destination. Ours must be one. |
| `Started` vs `Picked up` drift | Their filter rail and their rows disagree on the same screen. Ours uses the canonical six with flags. |

---

## 5. INVESTIGATE — cheap checks that would change a decision

- [x] **RLS policy correctness per money-blind role.** ✅ **DONE 31 Aug — exercised at runtime**,
      not read off the policies: `SET ROLE authenticated` + `app.current_user_id`, per role, read-only.
      Full result in [`RLS-PER-ROLE-2026-08-31.md`](RLS-PER-ROLE-2026-08-31.md).
      **The gate is real and correct** for all four money-blind roles; RLS provably filters
      (Warehouse 246 bookings / Client 0); unknown uid fails closed to `Client`; the `_v` masks
      work on live data (Owner 366 `payment_terms`, Warehouse 0); `payments` has no UPDATE/DELETE
      policy so immutability is enforced by the database.
      **One breach found:** base `clients` still leaks `payment_terms` to money-blind staff — 366
      values to a Warehouse session — because `0062` armed the column mask for four tables and
      **`clients` is not one of them**, while `0038`'s column-revoke was the shape `0062`'s own
      header calls ineffective. `src/lib/queries/clients.ts:18-20` asserts the opposite as fact.
      Reachable via `src/lib/syncEngine.ts:166` (`.from('clients').select('*')`). **Needs a
      `0062`-shaped migration for `clients` + a call-site change first — Babin's approval, not
      actioned here.**
- [ ] **Wire `facetCounts.ts` to `/rentals`.** The engine exists and is *completely unwired*:
      `countFacet` is imported only by its own test, `useFacetCounts` has no caller in `src/`, and
      `FilterOptionList` is mounted only in its own test. The job is wiring, not building.
- [ ] **Run one Booqable order through the bridge in isolation** and diff every money field and the
      stage by hand. **No Booqable order has ever crossed the bridge** — `external_refs` holds only
      100 clients and 71 products. R2, R3 and R4 are all rulings about order translation and are
      therefore entirely unexercised.
- [ ] **Seed `Booked` and `Packed` bookings.** Zero rows exist in either stage live, so the
      Dashboard's Going out panel is structurally empty and cannot be evaluated or demoed.
- [ ] **Reconcile the two `Card` components** before any screen spec cites "the Card contract".
- [x] **Hash-diff `babin-booqable-layout-30Aug2026.zip`.** ✅ **Done — and it is now APPLIED.**
      It landed at **00:28:52 on 31 Aug**, mid-audit, by a concurrent session; `Today.tsx` and
      `OperationsQueues.tsx` hash-match it exactly. The "not applied" reading above was true only
      before that. See `CORRECTIONS.md` §13.
- [ ] **Fix the hover card's keyboard path.** `MovementList.tsx`'s private `HoverCard` has no
      `onFocus`/`onBlur` despite its own doc claiming otherwise, and `IntelCard.tsx:28-31` already
      records the defect. Hover-only fails the packing bench, which is touch.

---

## 6. Collisions worth stating plainly

The skill this pack follows requires that a ruling colliding with an existing law or applied
migration be stated, not implemented silently. Two collisions:

**B1 vs the shared filter contract.** Ruling the rental day to 06:00 requires a half-open range
that `ListFilters` cannot express. The ruling is a product call; the contract change is a
refactor touching every caller. **Standing alternative if the refactor is refused:** keep Kathmandu
midnight and state the 06:00 convention in the UI copy instead, so the screen and the floor at
least agree in writing.

**B2 vs Law 6.** Any rental total on a list row must be masked at the view, as
`bookings_deposit_v` already is — not filtered in the component. **Hidden means not built into the
DOM**, not `display:none`. If the engine that produces the total cannot also produce a masked view,
the answer to B2 is no by default, regardless of product preference.

---

## 7. How this sheet relates to v2.5's Appendix A

[`REFERENCE_SPEC_v2.5.md`](REFERENCE_SPEC_v2.5.md) landed at 01:57 on 31 Aug with **its own decision
sheet** (Appendix A) and an appendix of Babin's rulings (A0). **v2.5's is the primary one.** This
sheet is now the repo-side complement to it, and the two fit together like this:

| | v2.5 Appendix A | This sheet |
|---|---|---|
| Scope | All 13 screens, from live observation | Two screens, checked against repo + live DB |
| Blockers | D1 open; D2/D3/D4/D5 ruled in A0 | B1 closed by A0's D4; B2–B5 remain |
| Authority | **Wins on anything about Booqable** | Wins on anything about **this repo** |

**Where this sheet adds something A doesn't have:**

- **A.5 lists two items as open that the code has already settled.** *"true faceting vs base-scope
  counts"* — already faceted, by the better rule, in `facetCounts.ts`; the real problem is that it
  is **entirely unwired**. *"money on list rows"* — deposits already ship via the masked view
  `bookings_deposit_v` behind `useCanViewMoney()`; the open part is only the **rental total**, and
  nothing in the repo can compute one. See `CORRECTIONS.md` §7–§8 and B2 above.
- **A.3 lists the `booking_facets(filters)` RPC as an adoption.** Confirmed absent from all 72
  migrations and from the live database — but wiring the engine that already exists is the smaller
  first move.
- **A0's D3 collides with live schema, and this sheet verified it.** Both Law 10 constraints are in
  the database right now (`booking_discounts_hard_cap`;
  `booking_discounts_over_ten_needs_reason_and_approver`). v2.5 states the collision; this pass
  confirmed it against Postgres. See `CAPTURE-BACKLOG.md` §1.
- **Law numbers.** A.5 cites "Law 15" for the 768px two-column question; it is **Law 14**.

**What neither sheet decides:** the Layer D of v2.5's other eleven screens, which was written from
the §2.4 contract list that `CORRECTIONS.md` shows is unreliable. Verifying it is the backlog.
