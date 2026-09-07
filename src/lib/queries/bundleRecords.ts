import { supabase } from '../supabase'
import { rupees } from '../money'
import { listBundlesWithItems } from './bundles'
import type { BundleWithItems, BundleComponent, ListBundlesOptions } from './bundles'
import { availabilityRules, readCandidates, readHolds } from './availability'
import { selectUnitsForLine, isRetired } from '../availability'
import type { RentalWindow, UnitCandidate, UnitHold, AssignmentOutcome } from '../availability'
import type { BundleRecord, BundleLine, BundleBooking, BlockedBy } from '../../data/bundles'

/**
 * # The Bundles pane's records, from the database, for a stated window
 *
 * `modules/inventory/Bundles.tsx` consumed `data/bundles.ts`'s `ACTIVE_BUNDLES`
 * — nine hand-written literals — while `actions/inventory/createBundle.ts` wrote
 * real rows. A bundle you created could never appear on the screen that lists
 * bundles. This module is the other half of that wire: it returns the same
 * `BundleRecord` shape the pane and `factsOf` already consume, so the screen's
 * derivations, chips and donut are untouched.
 *
 * ## Why a window is a required argument
 *
 * **PLAN.md §4.44, ruled 4 Sep 2026 (option b).** `BundleLine.unitsAvailable` is
 * not a property of a bundle — it is the answer to "free *when*?". The seed
 * baked in a single figure as though the question had one answer; wiring that to
 * live data without a window would have made every un-booked bundle render
 * `Available`, a confident claim that all of its gear is free, on the screen an
 * operator uses to promise kit to a client.
 *
 * So the window is a parameter with no default. A caller that does not know
 * which window it means cannot call this, which is the intended pressure.
 *
 * ## What is derived, and what is simply absent
 *
 * Availability comes from the real engine — `readCandidates` + `readHolds` feed
 * `selectUnitsForLine`, the same path `planCreationUnits` uses to assign units
 * at creation, under the same §4.30 rules. Nothing is re-implemented here.
 *
 * These `BundleRecord` fields have **no column anywhere** and are therefore left
 * empty rather than guessed (§4.44's closing note):
 *
 * | Field | Why absent |
 * |---|---|
 * | `tags` | no column on `bundles` |
 * | `lockMode` | no column; `data/bundles.ts` calls Virtual the default |
 * | `nextConflictAd` | the seed itself says it "is seeded, not computed" |
 * | `substitutes` · `replaceable` | no column on `bundle_items` |
 * | `kind` other than `equipment` | `bundle_items.product_id` is `not null references products`, so a live bundle **cannot** hold a crew, vehicle or box line |
 *
 * `weightKg` is likewise absent, so `factsOf`'s `totalWeightKg` reads `null` —
 * its own "only when every line knows" rule, reached honestly.
 */

/** How a rejected unit's reason maps onto the three words the donut counts. */
function blockedByOf(outcome: AssignmentOutcome, now: number): { blockedBy?: BlockedBy; freesAd?: Date } {
  let earliestFree: number | null = null
  let held = false
  let maintenance = false

  for (const rejection of outcome.rejected) {
    if (rejection.reason.kind === 'held') {
      held = true
      const end = Date.parse(rejection.reason.by.window.toAd)
      if (earliestFree === null || end < earliestFree) earliestFree = end
      continue
    }
    if (rejection.reason.kind === 'state' && rejection.reason.state === 'Maintenance') maintenance = true
  }

  /*
   * Precedence, and the gap in it.
   *
   * A held unit outranks a maintenance one because "it is with a client until
   * the 3rd" is the more actionable sentence. `On Rent` vs `Reserved` is decided
   * by whether the hold has actually started — a future commitment is not out.
   *
   * `Missing` and `Retired` are the gap: they are in `DISQUALIFYING_UNIT_STATES`
   * and genuinely reduce availability, but `BlockedBy` has no member for either,
   * so a line short only for those reasons carries NO `blockedBy`. That is
   * deliberate. Attributing lost gear to `On Maintenance` would put a wrong word
   * on screen, and the pane already has a reconcile note for counts that do not
   * add up. Adding a fourth `BlockedBy` member changes the donut's four fixed
   * segments and is a spec question, not a wiring one.
   */
  if (held) {
    const started = earliestFree !== null && outcome.rejected.some(
      (r) => r.reason.kind === 'held' && Date.parse(r.reason.by.window.fromAd) <= now,
    )
    return {
      blockedBy: started ? 'On Rent' : 'Reserved',
      ...(earliestFree === null ? {} : { freesAd: new Date(earliestFree) }),
    }
  }
  if (maintenance) return { blockedBy: 'On Maintenance' }
  return {}
}

/** One component's line, with availability measured against `window`. */
function lineOf(
  item: BundleComponent,
  pool: readonly UnitCandidate[],
  holds: readonly UnitHold[],
  window: RentalWindow,
  now: number,
): BundleLine {
  const rules = availabilityRules()
  /* `unitsStock` is "units owned" (`data/bundles.ts:51`), so a retired unit is
     not stock — the business no longer has it. Everything else counts, including
     units that are merely busy; that is what makes `x of y available` a sentence
     worth printing. */
  const owned = pool.filter((unit) => !isRetired(unit))

  /*
   * Asking for `owned.length` rather than `item.quantity` is deliberate: it
   * makes `assigned.length` the TRUE number of free units, so the preview can
   * say "1 of 3 available" rather than capping at what this bundle happens to
   * need. `factsOf` clamps with `min`/`max` anyway, so the derived counts are
   * identical either way — only the printed pair differs.
   */
  const outcome =
    owned.length === 0
      ? ({ assigned: [], shortfall: item.quantity, rejected: [] } as AssignmentOutcome)
      : selectUnitsForLine({
          needed: owned.length,
          window,
          candidates: owned,
          holds,
          disqualifyingStates: rules.disqualifyingStates,
          bounds: rules.bounds,
        })

  const unitsAvailable = outcome.assigned.length
  const short = unitsAvailable < item.quantity

  return {
    /* The preview tree's heading. The product's own category is the only
       grouping the live model has; §4.44 records that Crew / Vehicle /
       Boxes & Bags cannot arise here at all. */
    group: item.category ?? 'Uncategorised',
    model: item.productName,
    kind: 'equipment',
    quantity: item.quantity,
    unitsStock: owned.length,
    unitsAvailable,
    /* Asserted by the seed's own invariant: set only where the line is short. */
    ...(short ? blockedByOf(outcome, now) : {}),
    /* Money, and `null` is not zero — `queries/bundles.ts`'s header. A
       money-blind session gets 0 here, which makes `factsOf`'s sum-of-parts and
       saving meaningless for that session; the pane gates every money figure on
       the same flag before rendering, so those numbers are never shown to it. */
    unitRatePaisa: item.dailyRate ?? rupees(0),
  }
}

interface BookingLineRow {
  bundle_id: string | null
  bookings: {
    booking_no: string
    pickup_at: string | null
    return_at: string | null
    clients: { name: string } | null
  } | null
}

/**
 * The live commitment against each bundle, via **`booking_lines.bundle_id`** —
 * a real FK since `0042:52`, which is why `BundleRecord.booking` is sourceable
 * at all and `factsOf`'s `On Rent` / `Reserved` states are not guesses.
 *
 * Law 3 — a removed line is `voided_at`, never deleted, and a voided line
 * commits nothing. A bundle carrying several live lines keeps the one that is
 * out now, else the soonest future one, because that is the commitment an
 * operator is about to trip over.
 */
async function readBundleBookings(bundleIds: readonly string[], now: number): Promise<Map<string, BundleBooking>> {
  const out = new Map<string, BundleBooking>()
  if (bundleIds.length === 0) return out

  const { data, error } = await supabase
    .from('booking_lines')
    .select('bundle_id, bookings ( booking_no, pickup_at, return_at, clients ( name ) )')
    .in('bundle_id', [...new Set(bundleIds)])
    .is('voided_at', null)

  if (error) throw new Error(`Could not read the bookings holding these bundles: ${error.message}`)

  for (const row of (data ?? []) as unknown as BookingLineRow[]) {
    const b = row.bookings
    if (row.bundle_id === null || b === null || b.pickup_at === null || b.return_at === null) continue

    const startAd = new Date(b.pickup_at)
    const endAd = new Date(b.return_at)
    if (Number.isNaN(startAd.getTime()) || Number.isNaN(endAd.getTime())) continue
    /* Already handed back: not a commitment any more, and not this screen's
       business. Only `out` and `reserved` are states `BundleBooking` can hold. */
    if (endAd.getTime() < now) continue

    const candidate: BundleBooking = {
      id: b.booking_no,
      client: b.clients?.name ?? 'Unnamed client',
      startAd,
      endAd,
      state: startAd.getTime() <= now ? 'out' : 'reserved',
    }

    const held = out.get(row.bundle_id)
    if (
      held === undefined ||
      (held.state === 'reserved' && candidate.state === 'out') ||
      (held.state === candidate.state && candidate.startAd.getTime() < held.startAd.getTime())
    ) {
      out.set(row.bundle_id, candidate)
    }
  }
  return out
}

export interface ListBundleRecordsOptions {
  /** One bundle only, by code or uuid — see `ListBundlesOptions.bundleRef`. */
  bundleRef?: string
  /**
   * Include each component's `daily_rate`. **Money.** Pass the caller's own
   * money gate — never a literal `true`.
   */
  withMoney?: boolean
  limit?: number
}

/**
 * Every bundle — live and archived — as the pane's own record shape, with
 * availability measured against `window`.
 *
 * Two reads beyond `listBundlesWithItems`: the candidate units for every product
 * any bundle names, and every live hold. Both are fetched once for the whole
 * list rather than per bundle.
 *
 * Bundles are evaluated **independently of one another**: two bundles that both
 * name the last free camera are both reported as covering it. That is correct
 * for a catalogue — only one of them will be booked — and is why this does not
 * carry `planCreationUnits`'s cross-line `claimed` set. Within a single bundle
 * the pool IS shared, so one free unit never covers two of its lines.
 */
export async function listBundleRecords(
  window: RentalWindow,
  opts: ListBundleRecordsOptions = {},
): Promise<BundleRecord[]> {
  /* Built up rather than written inline: `exactOptionalPropertyTypes` is on,
     so passing `withMoney: undefined` is not the same as omitting it. */
  const listOpts: ListBundlesOptions = { includeArchived: true }
  if (opts.withMoney !== undefined) listOpts.withMoney = opts.withMoney
  if (opts.limit !== undefined) listOpts.limit = opts.limit
  if (opts.bundleRef !== undefined) listOpts.bundleRef = opts.bundleRef

  const bundles: BundleWithItems[] = await listBundlesWithItems(listOpts)
  if (bundles.length === 0) return []

  const productIds = [...new Set(bundles.flatMap((b) => b.items.map((i) => i.productId)))]
  const [candidatesByProduct, holds, bookings] = await Promise.all([
    readCandidates(productIds),
    readHolds(null),
    readBundleBookings(bundles.map((b) => b.id), Date.parse(window.fromAd)),
  ])

  const now = Date.parse(window.fromAd)

  return bundles.map((b): BundleRecord => {
    /* Shared within the bundle, so a `qty: 2` line cannot be covered twice by
       one unit, and two lines naming the same product compete honestly. */
    const claimed = new Set<string>()
    const lines = b.items.map((item) => {
      const pool = (candidatesByProduct.get(item.productId) ?? []).filter((u) => !claimed.has(u.unitId))
      const line = lineOf(item, pool, holds, window, now)
      let taken = 0
      for (const unit of pool) {
        if (taken >= Math.min(line.unitsAvailable, item.quantity)) break
        claimed.add(unit.unitId)
        taken += 1
      }
      return line
    })

    const booking = bookings.get(b.id)

    return {
      /* The pane addresses and searches a bundle by its code, and the record's
         `id` is what it renders — matching `ClientRecord`, whose `id` is the
         client code while the uuid travels separately. */
      id: b.bundleCode,
      name: b.name,
      category: b.category ?? 'Uncategorised',
      /* No column. §4.44 — absent, not invented. */
      tags: [],
      ...(b.isActive ? {} : { archived: true }),
      ...(booking === undefined ? {} : { booking }),
      bundleRatePaisa: b.dailyRate,
      lines,
    }
  })
}

/**
 * One bundle, for a stated window, or `null` when the reference matches nothing.
 *
 * The narrowing happens in the SQL (`bundleRef` reaches `listBundlesWithItems`'s
 * `.eq`), not by fetching every bundle and filtering in memory — so the detail
 * page reads one row and only the units and holds its own components need.
 *
 * `null` is "no such bundle", never "the read failed": a failure throws, and the
 * screen tells those apart because `PageBody` ranks error above empty.
 */
export async function getBundleRecord(
  ref: string,
  window: RentalWindow,
  opts: ListBundleRecordsOptions = {},
): Promise<BundleRecord | null> {
  const rows = await listBundleRecords(window, { ...opts, bundleRef: ref })
  return rows[0] ?? null
}
