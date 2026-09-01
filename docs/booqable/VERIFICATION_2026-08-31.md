# Independent re-derivation of the §2.4 corrections — 31 Aug 2026

**[`CORRECTIONS.md`](CORRECTIONS.md) is the authority. This file is not a second register.**

A separate session re-derived the extraction spec's repo-side claims from scratch, without reading
`CORRECTIONS.md` first, using twelve parallel agents each required to cite `file:line` or command
output and forbidden from treating any document as evidence. It reached the same conclusions.
This file records that agreement, and one correction to its own first draft.

Independent reproduction is worth recording here for the same reason
[`layer-d/INDEPENDENT-SPOTCHECK.md`](layer-d/INDEPENDENT-SPOTCHECK.md) exists: a corrections
register is the artifact where an error would be hardest to notice.

---

## 1. What was independently reproduced

Every one of these was reached without reference to `CORRECTIONS.md`, and matches it:

| Finding | `CORRECTIONS.md` |
|---|---|
| `BrandKey` has `warn`, not `purple`; `purple` is retired (`status.ts:134`, `:129-132`) | §4 |
| Law 9 → **Law 7** (dates); Law 16 → **Law 15** (44×44) | §2 |
| §2.4's 19-engine list omits 23 of 42 `src/lib` entries, including `availability`, `lateFee`, `damage`, `bookingTransition` | §3 |
| Two `Card`s exist; `Card.tsx` **does** have `subtitle` | §5 |
| `ClickableRow` does not exist, and neither does the "11 Aug improvement order" that names it | §6 |
| Faceted counts are **built and unwired**, not unbuilt — `facetCounts.ts` has been dead code since 12 Aug | §7 |
| No money on Dashboard list rows | §8 |
| Test counts: 2,169 / 87 measured; the 2,174 / 88 figure is the sandbox's | §13 |
| The three 30 Aug zips, and `babin-booqable-layout` applying at **00:28:52 mid-audit** | §13 |
| The `<Rail>` / rulings-§7 "reflow, not hide" violation (`Page.tsx:333-349`) | `layer-d/dashboard.md:271` |

Also reproduced, and confirmed live against `sxguwvgoserhdolewibb`: all 28 §2.4 tables resolve;
`bookings_booking_no_format` is `CHECK ((booking_no ~ '^B-[0-9]+$'::text))` verbatim; migration
0055 is applied (`20260812150509`); all 16 "NOT APPLIED" migration headers are false;
`booking_flags_recorded_subset_only` limits storable flags to four, so **`Due Soon` and
`Partial Pickup` have no persistence path**; six `log_audit_event` triggers exist, on
`product_units` — not the spec's `inventory_units`.

## 2. What `CORRECTIONS.md` has that this pass did not find

Read it, not this file. It is ahead on at least four counts:

- **§9** — `todaysIncoming` excludes returned bookings, breaking §4.3's status mapping.
- **§10** — `next_document_number` has the wrong argument name *and* fails at runtime.
- **§11** — `PageBody`'s status ladder is not a plain switch.
- **§12** — the audit-feed proposal names a column that does not exist.

It also frames the problem better than this pass did: an error in a shared contract list is copied
into every screen generated from it, so the correction belongs once at the root rather than fifty
times at the leaves.

## 3. Correction to this file's own first draft

An earlier version of this file escalated the deletion of
`src/modules/calendar/__tests__/calendar.kpiBand.test.tsx`, having found it as a ` D` in
`git status` and paired it with the concurrent `<Rail>` width rework. **That was wrong, twice.**

- The retirement was **deliberate and logged** — `PROGRESS.md:850`, *"Retired its guard test…
  Deleting the band without deleting the test would have left a red suite asserting a ruling the
  owner had reversed."* The band itself was removed at the **owner's explicit instruction**
  (30 Aug), and `Rulings §1` was reversed on the record rather than left to read as drift.
- It guarded **`/calendar`'s** KPI band, not the Dashboard's, so it had no bearing on the `Today.tsx`
  rail change it was paired with.

The method failure is worth more than the finding: working-tree state was read and a story inferred
from it **without checking `PROGRESS.md` for the reason**. That is the exact failure mode this
repo's doc discipline exists to prevent, committed while auditing a document for the same class of
error. One consequence stands, though: `/calendar` now has **no test coverage at all**
(`PROGRESS.md:850-854`).

## 4. One live note

The tree is being edited concurrently and `tsc` state moves between runs. Observed on 31 Aug:
`Login.tsx(5,1) TS6133` at ~02:10 during an auth refactor (`PasswordInput.tsx`, `AuthCard.tsx`,
`Login.tsx` all touched within ten minutes), then gone; later, three errors in
`discount.test.ts` / `money.test.ts` from a `discount`/`money` refactor in flight.

**Do not "fix" these from a reading session** — they belong to work in progress. Take a gate
reading as true of a moment, and re-take it before relying on it. `vitest` was stable at
**2,169 / 87, exit 0** across two full runs hours apart.
