# GAP CHECK — claim-by-claim verification against the tree

**Run 1 Sep 2026.** Ten agents (five verifying claim clusters, five attacking every absence
verdict) read `src/` with `file:line` citations, under one rule: **code wins over docs**.
Companion to [`GAP-CHECK_2026-08-31.md`](GAP-CHECK_2026-08-31.md). Read-only; nothing was edited.

## Tally

| Verdict | N | Meaning |
|---|---|---|
| CONFIRMED | 17 | true of the current tree as stated |
| **PARTIAL** | **17** | half right — and in most cases the wrong half is the actionable one |
| **FALSE** | **4** | not true, and no evidence it ever was |
| MOVED | 0 | — |
| UNVERIFIABLE | 0 | every claim settled from source, including the Law 6 one |

**No absence verdict survived refutation unchanged.** Where the walk said "X does not exist", the
attackers either found X (R1, R5) or found the *mechanism* built elsewhere while the specific
mounting was genuinely missing (Q1, D2, D3). That pattern — **built somewhere, missing here** — is
the single most repeated shape in this verification, and it is exactly what a UI walk cannot see.

---

## 1. The four that are simply wrong

**R1 — "No `FilterRail` exists."** It exists, is live, and predates the walk by three days.
`src/modules/inventory/Inventory.tsx:925` defines `FilterRail`, rendered twice (desktop rail at
`:1698`, reflowed inline below 1280 at `:2119` — the correct Law-14 behaviour), fed by
`src/data/inventory.ts:857 FILTER_RAIL`. Three more pages carry a literal Filters column via
`SideRail` (OperationsQueues `:725`, Finance `:1298`, ClientsDirectory `:1197`).
`FilterDrawer.tsx` is the rail's *successor* on Rentals, not the rail.
**The genuinely dead piece is `FilterOptionList`** (`FilterDrawer.tsx:676`) — the component that
draws facet counts beside checkboxes — with zero production importers; Rentals hand-rolls
`StatusFilterGroup` (`RentalsList.tsx:549`) instead.

**R5 — "No facet counts anywhere except Operations' queue chips."** `facetCounts.ts` is live on
Rentals: `RentalsList.tsx:27` imports `useFacetCounts`, called at `:563`, rendering a per-stage
figure beside each Status checkbox at `:618-623` — **gated on `enabled: open`**, so the counts
only fire while the Status accordion is expanded. A walk that never opened the drawer would see
none. Renders `—`, never `0`, while unknown.
Also settled: **the "second `facetCounts.ts`" from the layer-d pass is not a second module** —
it is two git-worktree copies under `.claude/worktrees/`, byte-identical (`diff -q`). Our own
backlog note repeating that has been corrected.

**P2d — "Finance period control shows '— 31 Aug 2026' (start date blank)."** No Finance period
control renders a blank start; Finance's date inputs default to `''` and print *"No dates picked
— showing every day."* (`Finance.tsx:1128`). **The em dash is the Bikram Sambat placeholder, and
it is a real bug the walk misread.** `AS_OF` (`Finance.tsx:180`) is `{ bs: bs ? formatBs(bs) : '—',
ad: formatAd(TODAY) }`, and `lib/bs.ts:108-114 toBs` returns **null outside Shrawan 2083** —
anchor 16 Jul 2026 + 32 days = **16 Jul – 16 Aug 2026 only**. Every date after 16 Aug has no BS
rendering. See §3.

**P8d — "FY 2083/84 + branch chip in the top bar."** Neither exists. `Header.tsx` (416 lines,
mounted `App.tsx:1031`) has zero matches for FY/2083/fiscal/branch. Branch selection exists only
as a `<select>` inside `ReportToolbar` when `branches.length > 1`. Worse, **`ReportToolbar.tsx:75`
carries a comment asserting "the header pill says FY 2083/84"** — doc rot that likely seeded the
claim. A builder trusting this would never build the global FY/branch scope, believing it done.

## 2. The load-bearing build-order assumptions — both half wrong

**Item 3, "`lib/workflow` already knows the next transition."** The **data** is in `lib/workflow`;
the **function** is not. It exports `canAdvance(from, to)`, `jobThatSets(to)` and
`planTransition({from, to})` — all of which need *both* ends. There is no exported
`nextStage`/`nextVerb` anywhere in `src/`.

The concept is built **three times outside it**: `data/operations.ts:175 jobForStage(stage)`
(live), `data/operationsShell.ts:97 entryStepFor` (**dead** — its only importer has no importers),
and a private duplicate at `OperationsShell.tsx:85` (live). The refutation pass added that a
Returned booking **already gets a primary button labelled "Reset"** on Operations Queues
(`OperationsQueues.tsx:880`) and in `MovementList.primaryFor` (`:60-74`), and that the generic
Operations button already opens a dialog with Reset pre-highlighted. **So the Booking Detail gap
is a label, not missing logic.**

⚠ **But the far end is genuinely unbuildable as the gap check writes it.** It prescribes leading
with "Reset/Close". **There is no Close verb anywhere.** `JOBS` holds four verbs; `Reset.sets` is
`null` (`workflow.ts:105`); `closeGates` (`:264`) is called only from `workflow.ts:364` and
`seed.ts:1210`; `ResetWorkspace`'s terminal control is "Complete Reset", which records a reset and
does **not** close. Returned → Closed has no action, no gate evaluation and no caller.

**Item 4, "`periodRange` — the rail's date section and the report toolbar share it."**
`periodRange` exists and is alive (`data/today.ts:835`, four real importers) but answers **6 of
the spec's 16 presets** (All, Today, Tomorrow, Next 7 Days, This Week, Next Month) — no fiscal
year, no quarters, no yesterday/last-week/this-month/this-year. The two fiscal presets live in a
different file (`data/pulse.ts:547`). **And `ReportToolbar` never imports it** — it computes its
own `presetWindow` (`:240-245`). Finance's rail date section and Rentals' Custom range are bare
`<input type="date">` with no presets at all.
So item 4 is *"extend `periodRange` by ten cases and migrate ReportToolbar off its private
presets"*, not "wire a picker to an engine that already answers".

## 3. 🐞 Real defects the walk did not find

These are the return on verifying rather than accepting. None is in the gap check.

1. **`/rentals/B-701/evidence` refuses to load — the B-715 constant is not gone.**
   `EvidenceWorkspace.tsx:111` uses `BOOKING.no` as a route default *and* `:174-175` hard-gates
   `if (bookingNo !== BOOKING.no) return <BookingNotLoaded/>`. The walk praised the route fix
   having only checked Booking Detail (where it is genuinely fixed, `BookingDetail.tsx:877`).
2. **A case logged with no booking is filed against B-715.** `LogCaseModal.tsx:90`
   `linkedRecordId: booking || 'B-715'` — silently attaches unrelated cases to one real booking.
3. **BS dates are broken for every date after 16 Aug 2026.** `lib/bs.ts` covers only Shrawan 2083
   (16 Jul – 16 Aug); `toBs` returns null beyond it, so the Finance header pill *and* the
   Dashboard date pill (`data/today.ts:76-80`) render `—` where the BS date belongs. **This
   contradicts the BS-above-AD law the gap check praises as live** — it is live only inside a
   32-day window that ended a fortnight before the walk. **The fix already exists as dead code:**
   `lib/bs.ts:135 formatBsOrAd()` ("Never null, never an em dash, never a guessed BS day") has
   zero importers. The deeper fix is the missing BS month-length table (`bs.ts:50-65`).
4. **Operations and Today disagree about where a day starts.** `OperationsQueues.tsx:201-208`
   builds Today/Tomorrow from raw `T00:00:00.000`/`T23:59:59.999` Kathmandu midnights and never
   calls `operationalDayBounds`, while Today is anchored at 06:00 through `queries/bookings.ts`.
   D4 is built but only one importer consumes it. **Two screens will report different "today"s.**
5. **⌘K promises record search and only navigates.** `CommandPalette.tsx:100-130`'s entire corpus
   is nav destinations plus Open Scanner and Switch theme; the box that opens it advertises
   *"Search equipment, serial, SKU, category…"* (`App.tsx:276`). Typing a serial returns nothing.
6. **"Save View" is an honestly-disabled placeholder** (`RentalsList.tsx:1547`, `disabled`, with an
   `Unavailable` reason) — the gap check lists it as a thing the app does beyond the reference.
7. **`EvidenceWorkspace`'s bulk bar is seven buttons with no `onClick`** (`:434-448`). Dead
   controls of exactly the kind this repo has shipped before.
8. **Four routed screens have no data-loading state because they have no query** — Crew, Calendar,
   Documents and Pulse render seeded constants synchronously. The skeleton the walk saw everywhere
   is `App.tsx:1049`'s *chunk*-load fallback, not a data skeleton.

## 4. Corrections to specific gap-check lines

- **R3 / P2c — "two floating 'More Filters', one is a duplicate."** Two do render, and **neither is
  a duplicate**: `Today.tsx:894/:898` own *different* state (`pickedOut` vs `pickedIn`) and carry
  distinct accessible names (`:206`). The code comment at `:808-814` names this exact hazard.
  **Deleting one would strip a list of its only filter entry point.**
- **R8 — the Payment Due grey.** Settled from source; **no Law 6 breach, and no Warehouse session
  needed.** The grey comes from `c.unavailable` (`data/rentals.ts:606`) because **no outstanding-
  balance column exists to query**. The absent-not-disabled rule the claim asks for **is already
  implemented**: `chipsFor(canSeeMoney)` (`data/rentals.ts:612`) removes the chip from the array
  before render, locked by tests (`rentalsList.test.ts:133-134`). A money-blind session never sees
  it; a money-visible one sees it greyed. "Fixing" this would re-enable a filter with nothing
  behind it.
- **P2a — deposit "Rs 0".** Symptom real, cause wrong: the wire is complete and correct
  (`bookings_deposit_v` → `depositRequired` → cell). **The data is genuinely zero** — live: 246
  bookings, 245 with `deposit_required = 0`, **0 nulls**; only B-731 carries 25,000. Root cause is
  `0002_bookings.sql:38`, `not null default 0`, so *"no deposit decided"* and *"zero"* are the same
  value and the `—` branch is unreachable. **The cited "open decision §9.8" does not exist in
  PLAN.md.** The real open item is that migration's own TODO.
- **P2b — "11:30 AM seed values."** Not seed. `data/rentals.ts ROWS` is dead in production; the
  list reads `listBookings`. The uniform figure is **11:45**, which is Booqable-imported
  `T06:00:00Z`. 11:30 is **one real row (B-701)** that happens to sort first — the booking the walk
  had open. The re-cut lever is `scripts/sync-all-booqable-data.mjs:111-118`, **not** `seed.ts`
  (mock-only; `.env.local` is `VITE_DATA_SOURCE=live`).
- **Q2 — bulk bars.** Rentals genuinely has no row selection. But the framing is wrong: a
  selection-gated bulk bar is the house pattern on **six** live screens (ClientsDirectory,
  Documents, Bundles, Membership, Maintenance, CrewBooking). Rentals is an outlier, not an unbuilt
  capability. Inventory's "Bulk Actions" is `disabled` as a **literal**, inert at every selection
  size by ruling — not "correctly greyed at 0".
- **R7 — Export/Import in page headers.** Dominant but not universal; ClientsDirectory's *Export
  Selected* is deliberately bound to row selection and cannot move to a page header. Import was
  already removed from Rentals. `ReportToolbar` is built-but-dead (test-only importer).
- **D2 / D3 — the pickers.** The **picker is built**: `booking/DateTimeField.tsx:270-403` is the
  §4.2 shape minus colour — inline date+time, `CalendarPopover` with BS under each AD numeral, Esc
  and outside-click, plus a `TimeListPopover`. A tri-state `AvailabilityVerdict` vocabulary already
  exists (`itemCatalogue.ts:97-136`), but **per item, not per day**. Missing: day colouring, the
  15-min interval (it builds 48 half-hour slots), and the `operationalDayStart` anchor. Also
  `booqable/map/availability.ts:461` is a documented **no-op**, so the Booqable-fed day source the
  spec assumes does not exist.
- **D1 / D6 confirmed on a much wider search:** no `RangePicker`/`DatePicker`/`PeriodPicker`/
  `TimeSelect` has **ever existed on any branch** (`git log --all --diff-filter=A` → zero), nor in
  `dist/`, nor in either worktree. One dead artifact worth knowing: `types/supabase.ts:13320` has a
  generated `report_period_preset` enum with **13 different presets** from the live DB, zero
  consumers. The two calendars that exist (`DateTimeField`'s and `Calendar.tsx`'s `MiniMonth`) are
  **private duplicates** — neither is reusable without extraction, so the spec's "one shared
  calendar core" has to be built.

## 5. What the walk got right

Seventeen claims confirmed, including every one that praises the app's discipline: the Finance
empty state's self-explanation (`Finance.tsx:1386`), the no-derivation register, the six-stage
progress bar with icon + colour + text, `/rentals/:bookingNo` parameterisation, Operations' scope
chips and counted queue chips, Clients' wired Find Duplicates, and Inventory's four tabs with
scope-stating KPI sublabels that render `—` rather than 0. The walk's read of the app's *character*
was accurate. What it could not do — and what a UI walk structurally cannot do — is tell built
from wired, or here from anywhere.
