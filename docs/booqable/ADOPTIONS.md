# ADOPTIONS — what to actually build from the Booqable bundle

**Written 7 Sep 2026** from a five-lens review of `REFERENCE_SPEC_v2.5.md` and its two companion
specs, then corrected the same day by a three-lens verification pass that found nine of the first
draft's claims wrong. Every figure below was counted by hand at HEAD on 7 Sep.

## How to use this file

The reference spec is a **reference, not a plan**. Between them the three specs create roughly
55 build obligations with no cost, no owner and no order — and §7's "order of work" was not what
the team actually did, correctly so: the work that landed came from the QA audit, the lifecycle
register and `RULINGS-2026-09-04.md`, none of which a Booqable capture can see.

This file is the whole shortlist. **Everything here sits behind the P0 register** in
`REMEDIATION_AUDIT_2026-09-05.md` — its Phase 1 runs Step 0 → SEC-01 → DB-01 → DB-03 → MONEY-02 →
MONEY-01 → INV-02, and nothing below outranks it.

> ⚠ `AUDIT_VERIFICATION_2026-09-06.md` is **uncommitted** at the repo root (untracked as of 7 Sep).
> Commit it or a citation to it dangles on a clean clone.

Anything in the specs and **not** in this file is "when the screen is touched", or post-bridge.
Cost bands: **S** under ~2 h · **M** about half a day · **L** multi-day.

## Build — in this order

- [ ] **1 · A definition on every money tile.** `S` component, `M` copy · `components/ui/Page.tsx`
      Booqable's three different "Revenue" figures cost this business a reconciliation nobody could
      close; one line of copy on the tile prevents the next one. Note the tile has **no info icon
      to hang it off** — `Page.tsx`'s only `Icon name="info"` is in `FooterNote` (`:460`), and the
      `note` slot is already used across the app to carry a second figure. So this is a `definition`
      prop **plus** a new affordance on `KpiStrip` (`:205`), then the copy for each money tile.
      *(spec L1 · §9.3, §14.3, §15.1)*

- [ ] **2 · Zeros explain themselves.** `M` · engines: `lib/money.ts` (`lateFee()`, `:310`) and the
      deposit read in `lib/queries/bookings.ts` (`readDeposits`, over `bookings_deposit_v`)
      Rule first, then the named inputs that were excluded — Booqable's deposit tooltip is the
      model. Applies wherever a computed figure lands at 0 or below expectation. PR priority already
      does this ("Not scored"). Note `lib/lateFee.ts` is the **waiver policy** wrapper, not the
      arithmetic, and there is no deposit-resolver module to point at. *(spec L2 · §10.3)*

- [ ] **3 · One next-verb in the Booking Detail header.** `S` · engine: `lib/workflow`
      Add `nextVerb(stage, flags)` on the existing `JOB_ORDER` / `planTransition`, and let both the
      header and the Operations row verb read it. Collapses the **two** duplicate
      `JOB_ORDER.find(j => JOBS[j].runsAt === …)` lookups (`data/operations.ts:176`,
      `OperationsShell.tsx:120`) — `workflow.ts:128` is a different predicate, leave it.
      Close exists since 4 Sep. *(spec §10.1 · RAIL §3.7)*

- [ ] **4 · Put a count on the Cancelled chip.** `S` · `src/data/rentals.ts` (`CHIPS` `:596`,
      `LIVE_ONLY` `:682`) + `lib/queries/facetCounts.ts`
      ⚠ The first draft of this item was wrong: the exclusion is **not invisible**. `/rentals`
      already renders a `Cancelled` chip that flips `cancelled_at`, and the empty state explains
      itself. What is missing is Booqable's *second* half — the excluded rows' **count**, shown so
      the operator can see there is something to opt into. "Archived" has no booking-level
      equivalent at HEAD (0 hits in `data/rentals.ts` and `queries/bookings.ts`), so do not spec it.
      **Ruling B5 decides whether the count is worth it.** *(spec §9.2, §9.7)*

- [ ] **5 · One date engine, facing both directions.** `L` · `periodRange` (`src/data/today.ts:920`)
      **and** `PERIODS` (`src/data/pulse.ts:583`)
      ⚠ Also corrected: there are **two** preset engines with disjoint directions, and the spec
      names neither problem. `periodRange` is six cases — All, Today, Tomorrow, Next 7 Days, This
      Week, Next Month — **entirely forward-looking, with no past range at all**. `PERIODS` is the
      backward half (This/Last quarter, This/Last fiscal year, BS month to date) and **already
      carries the Shrawan-anchored fiscal presets**. So the work is not "add forward presets" — it
      is to promote one engine to `lib/`, give it `operationalDayStart` and `weekStarts` as inputs,
      fold the other's cases in, and retire the duplicate. Only then is "one date engine, they
      cannot disagree" a true sentence. *(DATE_TIME §4.1)*

- [ ] **6 · Audit the preview card's payload for money-blind roles.** `S` · `components/ui/IntelCard.tsx`
      The card the spec calls its most valuable adoption **is already built** — mounted on 12
      modules, hover plus 450 ms long-press, gated blocks omitted rather than CSS-hidden. There is
      nothing to build; there is one thing to check: what each glance payload contains for a
      money-blind role. Its **keyboard path is already closed** (`tabIndex=0`, `role=button`,
      `aria-haspopup/expanded`, Enter/Space, focus/blur containment, Escape). Ignore §4.4's
      instruction to "build on `ClickableRow`" — no such component has ever existed.
      *(spec §4.4, §9.5, §11.4)*

- [ ] **7 · `latePickups()` and counted "View late" links.** `S` · `lib/queries/bookings.ts`
      Three of the four "Attention required" facets already exist as named filter sets
      (`todaysOutgoing`, `todaysIncoming`, `overdue`); only late-pickup is missing, and `overdue`
      is hardcoded to return_at. Add the one query, surface the four as chips on /operations and
      two counted footer links on the Dashboard. **No new component.** *(spec §12.2 L3)*

- [ ] **8 · Counts on the remaining /rentals filter groups.** `M` for the date groups, **blocked and
      unsized** for the rest · `lib/queries/facetCounts.ts` + `src/data/rentals.ts`
      The status group has had counts since 1 Sep (`9c81017`; `RentalsList.tsx:559` is still the
      only `useFacetCounts` call in `src`). The engine counts by handing the page's counter a chip
      on a **bookings column**, so the date-shaped groups drop straight in — but any group that is
      not a bookings column needs a different mechanism first. Scope that before committing to it.
      *(spec §9.2, §9.8)*

- [ ] **9 · Export lives with the filters.** `S` · `lib/csv.ts` + `components/ui/FilterDrawer.tsx`
      ⚠ Corrected: `lib/csv.ts` is **not** "imported by one screen" — three files import it
      (`ReportToolbar.tsx`, `ImportCenter.tsx`, `Finance.tsx`), and `ReportToolbar` is mounted
      across the reports family. It is the single quoting rule but not the single export path;
      several screens hand-roll their own CSV beside it. Pinning Export inside `FilterDrawer`
      — which has no export control today — is what makes "export the current query" true
      everywhere at once, inside the money gate wherever the surface is gated. *(RAIL §1, §3.1)*

## Already correct — checked, no work

- **Deposit placement (was item 10).** Verified 7 Sep at HEAD: `BookingDetail.tsx` renders
  `Deposit Required` *after* Rental Total / Paid / Outstanding as a separate row, and the totals
  never include it — Law 5 already drawn as a layout, exactly as §10.1 recommends. Nothing to do.

## Deferred — and why

1. **Tri-state availability calendar and per-slot dots** (DATE_TIME §4.2). No data to colour from:
   live carries 0 `inventory_reservations` and 0 `product_units`, and the bridge's
   `mapAvailabilities` is a deliberate no-op (its `plannings` sibling does map). The engine half
   now exists — `capacityFor` in `lib/availability.ts:734`, added 7 Sep for the quantity-tracked
   catalogue — so ship day-grain uncoloured until reservations exist. A wrong green is a double
   booking. Keep only the "name the blocker" text.
2. **The six-component rail build** (RAIL §3). Five of the six already exist under other names; the
   spec now carries the mapping. `BulkBar` additionally needs a server-side id endpoint and a ruled
   verb list before it can ship safely.
3. **A second picker family** (DATE_TIME §4). `DateField` is the one ruled picker, imported in 14
   files. The "variants" are props and modes on it.
4. **"Attention required" as a component.** It is four predicates, not a component (item 7).
5. **A Downtime module.** Fold into Maintenance; route "Missing" to cases. A third home for one
   lifecycle is the cost.
6. **Post-bridge cluster:** portal staff cards, the iCal feed (an unexpiring credential until a
   token lifecycle is designed), contract signatures, away mode, expected stock, per-client tax
   profile (`client_tax_profiles` exists with 0 rows — the decision is adopt or retire), and every
   standing-discount-policy line (moot: Law 10 is ungated).

## Open rulings this file waits on

| # | Question | Blocks |
|---|---|---|
| B3 | Keep the Dashboard KPI strip, or drop it? Booqable has none. | nothing — but it is a one-word answer |
| B5 | Is the excluded-Cancelled **count** worth showing beside the chip? | item 4 |
| D1 | Purchase cost is OS-mastered (the bridge mapper cannot carry it); deposits can be backfilled either side. Confirm, then size with a local `SELECT`, not the Booqable script. | the depreciation/ROI reports |
| — | Is `operationalDayStart` an organisation setting or a device preference? It is localStorage today, and Daily Closing reads it. | trustworthy day boundaries |
