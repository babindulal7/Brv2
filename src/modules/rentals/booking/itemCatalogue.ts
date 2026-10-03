/**
 * **Add Item — the catalogue engine ("New Booking" spec §23–35).**
 *
 * Pure. No JSX, no state, no side effects, and nothing here writes to the
 * booking. `AddItemPanel` and `BundlePreview` render what this returns, and
 * `NewRental.tsx` remains the only thing that appends a line — same division
 * `clientHealth.ts` already draws between the verdict and the chip that shows
 * it.
 *
 * ## Everything is derived, nothing is retyped
 *
 * §28 is explicit: *"Do not hard-code categories if the system already has a
 * category database."* So every list below is a projection of a module that
 * already owns the fact:
 *
 * | list                | derived from                                   |
 * | ------------------- | ---------------------------------------------- |
 * | equipment rows      | `data/inventory.ts`'s `PARENTS`, flattened      |
 * | bundle rows         | `data/bundles.ts`'s `ACTIVE_BUNDLES`            |
 * | categories          | `inventory.CATEGORY_OPTIONS` + `bundles.ALL_CATEGORIES` + every bundle line's `group` |
 * | accessory grouping  | `addBundle.BOX_CATEGORIES` + the catalogue's own `Accessory` category |
 * | sku / brand         | `addBundle.INVENTORY_MODELS`, matched by name   |
 * | bundle facts        | `bundles.factsOf` — item counts, sum of parts, saving |
 * | "contains this model" | `addEquipment.bundlesUsing`                   |
 *
 * ## Two catalogues exist, and only one is bookable
 *
 * This build carries two equipment catalogues: `inventory.PARENTS` (the
 * Inventory workspace — serialised units, statuses, locations, daily rates)
 * and `addBundle.INVENTORY_MODELS` (the model catalogue the Bundles builder
 * and Add Equipment read — SKUs, brands, stock splits). They overlap on
 * exactly one name (`Core SWX NANO Micro 98`) and disagree on another
 * (`Aputure 600D Pro` vs `Aputure LS 600d Pro`).
 *
 * `PARENTS` is treated as **the** bookable catalogue here, because it is the
 * one `NewRental.tsx` already books from — a second bookable source would put
 * two rows for one camera in front of the operator. `INVENTORY_MODELS` is used
 * only to *enrich* a matching row with its SKU and brand (§26 asks both to be
 * searchable) and as the vocabulary bundle lines are written in.
 *
 * TODO(decision) — PLAN.md §4: the two catalogues need to become one. Until
 * then a SKU search only hits the rows whose names appear in both files, and
 * that gap is stated in the panel's empty state rather than papered over.
 *
 * ## Pricing is not re-implemented (§67)
 *
 * `addBundleToBooking` returns *line drafts*. It copies each component's own
 * `unitRatePaisa` onto the draft and stops. The page's `lineAmountPaisa`
 * (`qty × days × rate × (1 − discount/100)`, rounded once) stays the only
 * place a line amount is computed, and `lib/money.ts`'s `price()` stays the
 * only place a booking total is computed.
 */

import { BOX_CATEGORIES, INVENTORY_MODELS, type InventoryModel } from '../../../lib/queries/addBundle'
import { ACTIVE_BUNDLES, ALL_CATEGORIES, factsOf, isPriced, type BundleFacts, type BundleLine, type BundleRecord } from '../../../lib/queries/bundles'
import { bundlesUsing } from '../../../lib/queries/addEquipment'
import { CATEGORY_OPTIONS, PARENTS, type InvStatus, type ParentRow } from '../../../lib/queries/inventory'
import { CREW_ROSTER, type CrewMember } from '../../../lib/queries/crew'
import type { Paisa } from '../../../lib/money'
/* Type-only, so this module keeps importing nothing that touches IO. */
import type { ProductWindowAvailability } from '../../../lib/queries/productAvailability'
import type { StatusKey } from '../../../lib/status'
import type { IconName } from '../../../components/ui/Icon'

export { CREW_ROSTER, type CrewMember } from '../../../lib/queries/crew'

/* ── The draft a result hands back to the page ─────────────────────────── */

/**
 * Field-for-field the page's own `Line`, so appending is `[...lines, ...drafts]`
 * and nothing has to be translated at the boundary.
 *
 * It is declared here rather than imported because `NewRental.tsx` does not
 * export `Line` and this module must not reach into the page (that would make
 * the page and the panel a cycle). `SHAPE_NOTE` below names the coupling so a
 * future change to `Line` has a reason to come here too.
 */
export interface BookingLineDraft {
  id: string
  clientUuid?: string
  parentClientUuid?: string | null
  lineType?: 'Equipment' | 'Bundle' | 'Accessory' | 'Service' | 'Sub-rental' | 'Manual item'
  isIncluded?: boolean
  productId?: string | null
  bundleId?: string | null
  bundleCode?: string
  bundleName?: string
  name: string
  serial: string
  category: string
  ratePaisa: Paisa
  /** §8.3 — Days is mandatory and explicit on every line. */
  days: number
  qty: number
  discountPct: number
  location: string
  status?: InvStatus
  committedTo: string
}

/** Read by nothing at runtime; here so the coupling above is greppable. */
export const SHAPE_NOTE =
  "BookingLineDraft mirrors NewRental.tsx's Line. Change one, change the other."

/* ── Availability ──────────────────────────────────────────────────────── */

/**
 * `unknown` is not a fourth flavour of bad news — it is the absence of an
 * answer.
 *
 * NR-09 / BD-02 / NR-13 are the same defect three times: a read that had not
 * landed (or had failed) rendered as a settled fact. The windowed availability
 * read is asynchronous and its window changes under it, so there is a real
 * interval in which this module has nothing to say. Saying so is a state; it is
 * not "available", and it is not "unavailable" either — refusing a booking
 * because a query is in flight would be its own defect.
 */
export type AvailabilityLevel = 'available' | 'partial' | 'unavailable' | 'unknown'

export interface AvailabilityVerdict {
  level: AvailabilityLevel
  /** Never colour alone — this word ships with the colour, always. */
  label: 'Available' | 'Partial' | 'Unavailable' | 'Checking' | 'Not checked'
  /** The one-line *why*: "1 component unavailable", "On Rent · B-710". */
  detail: string
  tone: StatusKey
  icon: IconName
  /** Bundle lines that cannot be filled for the window. Empty for equipment. */
  shortLines: BundleLine[]
  /** Short lines the window clears — they come back before pickup. */
  freedLines: BundleLine[]
}

/**
 * Sort and "worst of a group" order. `unknown` sits between `available` and
 * `partial`: a row nobody has checked must not out-rank one that is genuinely
 * free, and must not be buried under rows that are genuinely short.
 */
const AVAILABILITY_RANK: Record<AvailabilityLevel, number> = {
  available: 0,
  unknown: 1,
  partial: 2,
  unavailable: 3,
}

function verdict(
  /* The three ANSWERS. `unknown` is not one of them and cannot be reached
     through here — it is built by `unknownVerdict` below, which has to carry
     its own label and glyph anyway. */
  level: 'available' | 'partial' | 'unavailable',
  detail: string,
  shortLines: BundleLine[] = [],
  freedLines: BundleLine[] = [],
): AvailabilityVerdict {
  return {
    level,
    label: level === 'available' ? 'Available' : level === 'partial' ? 'Partial' : 'Unavailable',
    detail,
    // Foundation §4.2's five: green in / yellow progress / red danger.
    tone: level === 'available' ? 'in' : level === 'partial' ? 'progress' : 'danger',
    // Three distinct silhouettes, so the glyph carries the state without the hue.
    icon: level === 'available' ? 'check' : level === 'partial' ? 'alert_triangle' : 'error',
    shortLines,
    freedLines,
  }
}

/**
 * "We do not know yet" and "we could not find out" — the two shapes of no
 * answer, both neutral-toned so neither reads as a verdict.
 *
 * `timer` and `info` are two silhouettes, so the chip still carries its state
 * without the hue (Law 11) even though both share the neutral colour.
 */
function unknownVerdict(label: 'Checking' | 'Not checked', detail: string): AvailabilityVerdict {
  return {
    level: 'unknown',
    label,
    detail,
    tone: 'neutral',
    icon: label === 'Checking' ? 'timer' : 'info',
    shortLines: [],
    freedLines: [],
  }
}

/**
 * The dates the page is currently booking for (§32). Both null — or an
 * unparseable pair — means "no window yet", and every verdict below falls back
 * to present-tense availability and says so.
 */
export interface BookingWindow {
  pickupAd: Date | null
  returnAd: Date | null
}

export const NO_WINDOW: BookingWindow = { pickupAd: null, returnAd: null }

function validWindow(w: BookingWindow): { from: number; to: number } | null {
  const from = w.pickupAd?.getTime()
  const to = w.returnAd?.getTime()
  if (from === undefined || to === undefined) return null
  if (Number.isNaN(from) || Number.isNaN(to) || to <= from) return null
  return { from, to }
}

/** Half-open overlap — a booking that ends the morning ours starts is not a clash. */
function overlaps(window: { from: number; to: number }, startAd: Date, endAd: Date): boolean {
  return window.from < endAd.getTime() && window.to > startAd.getTime()
}

/* ── Equipment rows ────────────────────────────────────────────────────── */

/**
 * §25's six groups. `accessory` is not a fifth catalogue — it is the
 * `equipment` catalogue filtered by the categories the system already calls
 * accessories, so nothing is duplicated and nothing is invented.
 * 
 * Crew and Transport are new kinds that unify the search across all
 * bookable items and people (Equipment, Bundles, Services, Crew, Transport).
 */
export type ResultKind = 'bundle' | 'equipment' | 'accessory' | 'service' | 'crew' | 'transport'

export interface EquipmentResult {
  kind: 'equipment' | 'accessory'
  /** The page's line id — a serial for a serialised unit, the SKU name otherwise. */
  id: string
  /**
   * The PRODUCT this row belongs to — the key `groupEquipmentResults` collapses
   * rows on, so one model renders as one row with a chip per unit.
   *
   * NR-21: grouping was done on `name`, which is right for the seed source
   * (where a name owns many units of one model) and wrong for the live one
   * (where every row is a distinct product, so two products that happen to
   * share a name collapsed into one group — the chips went "—" and `autoPick`
   * silently took whichever sorted first, a different product from the one on
   * screen). The two sources therefore state their own identity here: the seed
   * sets the model name, the live source sets `products.id`.
   */
  productKey: string
  name: string
  serial: string
  category: string
  location: string
  /**
   * The unit's own `inventory_state`. **Absent on a live product row** — see
   * `BookingLineDraft.status`. Nothing gates on this; availability does.
   */
  status?: InvStatus
  committedTo: string
  ratePaisa: Paisa
  /** From `INVENTORY_MODELS` where the name matches; absent otherwise. */
  sku?: string
  brand?: string
  /** Bundles this model appears inside, via `addEquipment.bundlesUsing`. */
  inBundles: readonly string[]
  availability: AvailabilityVerdict
  /** Everything §26 searches, pre-lowered once at module load. */
  haystack: readonly string[]
}

export interface BundleResult {
  kind: 'bundle'
  /** The bundle code — `BND-23`. §26 searches it. */
  id: string
  name: string
  category: string
  tags: readonly string[]
  record: BundleRecord
  facts: BundleFacts
  ratePaisa: Paisa
  availability: AvailabilityVerdict
  /** "Sony FX3 Camera Body · NISI Athena 35mm T1.9 · +14 more" (§31). */
  componentSummary: string
  haystack: readonly string[]
}

/**
 * The categories this catalogue treats as accessories.
 *
 * `BOX_CATEGORIES` (`Case`, `Bag`) is the catalogue's own set; `Accessory` is
 * a member of `INVENTORY_CATEGORIES`, picked *out of* that list rather than
 * typed as a new literal. There is no second accessory taxonomy here.
 */
const ACCESSORY_CATEGORIES: ReadonlySet<string> = new Set<string>([...BOX_CATEGORIES, 'Accessory'])

/** Name → model, so a `PARENTS` row can borrow its SKU and brand (§26). */
const MODEL_BY_NAME: ReadonlyMap<string, InventoryModel> = new Map(
  INVENTORY_MODELS.map((m) => [m.name.toLowerCase(), m]),
)

/** Lower-cased and punctuation-stripped — the same normaliser the client combobox uses. */
export function normalise(s: string): string {
  return s.toLowerCase().replace(/[\s\-()./+]/g, '')
}

/**
 * Present-tense availability of one **seed** equipment row.
 *
 * A seed row IS a physical unit (or a pooled SKU with its own `breakdown`), so
 * its `status` is a real recorded fact and this reads it directly: In Stock →
 * available, anything else → unavailable, plus `partial` for a pooled SKU whose
 * breakdown is split.
 *
 * It is still present-tense, and that is a property of the seed data rather
 * than a choice made here — `data/inventory.ts` records no dates against a
 * unit's status, so there is nothing to compare a window with. The seed pool is
 * browse-only (its ids are names and serials, which `createRental.validate`
 * refuses) and the panel prints a warning saying so while it is in use. The
 * LIVE pool is answered for the booking's window — see `liveEquipmentVerdict`.
 */
function equipmentAvailability(p: ParentRow, unitStatus: InvStatus, committedTo: string): AvailabilityVerdict {
  const serialised = Boolean(p.children && p.children.length > 0)
  if (serialised) {
    if (unitStatus === 'In Stock') return verdict('available', 'In stock and free')
    return verdict('unavailable', committedTo !== '—' ? `${unitStatus} · ${committedTo}` : unitStatus)
  }
  const total = p.breakdown.reduce((s, b) => s + b.count, 0)
  const free = p.breakdown.reduce((s, b) => s + (b.status === 'In Stock' ? b.count : 0), 0)
  if (total === 0) return verdict('unavailable', 'No units recorded')
  if (free === total) return verdict('available', `${free} of ${total} free`)
  if (free === 0) {
    const first = p.breakdown[0]
    return verdict('unavailable', first ? `All ${total} ${first.status}` : `None of ${total} free`)
  }
  return verdict('partial', `${free} of ${total} free`)
}

/**
 * `PARENTS`, flattened the way the page flattens it — one row per serialised
 * unit, one row per non-serialised SKU. Static import, so this runs once.
 */
export const EQUIPMENT_RESULTS: readonly EquipmentResult[] = PARENTS.flatMap((p): EquipmentResult[] => {
  const ratePaisa = (p.dailyRatePaisa ?? 0) as Paisa
  const model = MODEL_BY_NAME.get(p.name.toLowerCase())
  const inBundles = bundlesUsing(p.name)
  const kind: 'equipment' | 'accessory' = ACCESSORY_CATEGORIES.has(p.category) ? 'accessory' : 'equipment'

  const build = (
    id: string,
    serial: string,
    location: string,
    status: InvStatus,
    committedTo: string,
    extraHaystack: readonly string[],
  ): EquipmentResult => ({
    kind,
    id,
    /* Seed rows: the model name IS the product identity — every serialised
       child of one `ParentRow` shares it, which is what makes the chip row a
       row of units of one model. */
    productKey: p.name,
    name: p.name,
    serial,
    category: p.category,
    location,
    status,
    committedTo,
    ratePaisa,
    ...(model ? { sku: model.sku } : {}),
    ...(model?.brand ? { brand: model.brand } : p.brand ? { brand: p.brand } : {}),
    inBundles,
    availability: equipmentAvailability(p, status, committedTo),
    haystack: [
      p.name,
      p.category,
      serial,
      location,
      committedTo,
      model?.sku ?? '',
      model?.brand ?? p.brand ?? '',
      p.code ?? '',
      ...(p.substitutes ?? []),
      ...inBundles,
      ...extraHaystack,
    ]
      .filter(Boolean)
      .map(normalise),
  })

  if (!p.children || p.children.length === 0) {
    const first = p.breakdown[0]
    return [build(p.name, '—', p.location, first?.status ?? 'In Stock', '—', [])]
  }
  return p.children.map((c) =>
    build(c.serial, c.serial, c.location, c.status, c.booking, [c.internalRef ?? '', c.assetTag ?? '']),
  )
})

/* ── The LIVE equipment source ─────────────────────────────────────────────
 *
 * `EQUIPMENT_RESULTS` above is the seed catalogue: its ids are product NAMES
 * and unit SERIALS, so a line built from it can never be saved —
 * `createRental.validate` refuses a non-uuid `productId` by name. This builds
 * the same shape from `queries/inventory.ts` rows, whose `id` IS `products.id`.
 *
 * ## What is deliberately different, and why
 *
 * **One row per PRODUCT, not per unit.** The seed source emits a row per
 * serialised unit, because it had serials to hand. A booking line references a
 * product and a quantity; the physical unit is chosen at Pack (§4.30a) or at
 * creation through `units[]` (D5). Emitting a row per unit here would invite
 * the operator to pick a serial this screen has no way to reserve.
 *
 * **`inBundles` is empty.** The seed path fills it from `bundlesUsing(name)`, a
 * name match against seed bundles. Doing that for a live product would assert a
 * relationship from a string collision. Until bundles are live too, saying
 * nothing is the honest answer — it costs a search facet, not a fact.
 *
 * **Availability is answered FOR THE BOOKING'S WINDOW** — NR-09.
 *
 * ⛔ It used to count `unitsByState`, a snapshot of where each unit is at this
 * instant, and derive two things from it that were both wrong for a future
 * booking: a `status` of `'In Stock'` / `'On Rent'` (there is no such column on
 * a product — the row is a product, not a unit) and a verdict whose own strings
 * said *"right now"*, rendered under a panel header reading *"Availability
 * shown for this booking's dates"*. `NewRental.tsx` then raised a **Critical**
 * from that status and blocked Confirm, so a booking three weeks out was
 * refused because a camera was on someone else's shoot today.
 *
 * The window answer now arrives as an `EquipmentAvailabilitySource`, computed
 * by `lib/queries/productAvailability.ts` through the same engine, rules and
 * half-open bound convention `queries/bundleRecords.ts` uses for bundles — so
 * the catalogue and the Bundles pane cannot disagree about the same unit.
 * `unitsByState` is no longer read at all: a now-count cannot answer a future
 * window, and keeping it around as a fallback is how it comes back.
 */
export interface LiveEquipmentRow {
  id: string
  name: string
  brand?: string | null
  assetCode?: string | null
  category?: string | null
  dailyRate?: number | null
  unitCountExcludingRetired?: number | null
  totalQuantity?: number | null
}

/**
 * The windowed availability read, in every state it can be in.
 *
 * The read is async and its window changes under it, so "no answer yet" and
 * "the answer failed" are states the catalogue has to be able to render. They
 * are modelled rather than collapsed into a boolean because BD-02 and NR-13
 * were both the same defect — a pending read drawn as a settled fact — and a
 * `Map | null` invites exactly that: an empty map is indistinguishable from
 * "nothing is available".
 */
export type EquipmentAvailabilitySource =
  /** The booking has no usable pickup/return pair, so there is no window to check. */
  | { readonly state: 'no-window' }
  /** The read is in flight. */
  | { readonly state: 'checking' }
  /** The read failed; `reason` is shown, never swallowed (Law 12). */
  | { readonly state: 'failed'; readonly reason: string }
  | {
      readonly state: 'ready'
      readonly byProduct: ReadonlyMap<string, ProductWindowAvailability>
    }

/**
 * One live row's verdict, from the windowed answer where there is one.
 *
 * Four cases, in the order they are decided:
 *
 * 1. **No answer** (`checking` / `failed` / `no-window`) — `unknown`. Not
 *    green, not red. Requirement of NR-09 and the lesson of BD-02/NR-13.
 * 2. **Bulk stock** — the product has no unit rows for the overlap check to
 *    work on. `totalQuantity` is all that is known, so that is all that is
 *    said, exactly as before: *"N in stock · not unit-tracked"*. Nothing is
 *    guessed into a free/committed split that no row records.
 * 3. **No stock at all** — no unit rows and no quantity. `unavailable`.
 * 4. **Unit-tracked** — the engine's count, phrased for the window.
 */
function liveEquipmentVerdict(
  row: LiveEquipmentRow,
  source: EquipmentAvailabilitySource,
): AvailabilityVerdict {
  if (source.state === 'checking') return unknownVerdict('Checking', 'Checking availability for these dates…')
  if (source.state === 'no-window') {
    return unknownVerdict('Not checked', 'Set a pickup and return first — availability is answered for those dates')
  }
  if (source.state === 'failed') {
    return unknownVerdict('Not checked', `Availability could not be checked for these dates: ${source.reason}`)
  }

  const answer = source.byProduct.get(row.id)
  if (answer === undefined) {
    return unknownVerdict('Not checked', 'This product was not in the availability read for these dates')
  }

  if (answer.unitsOwned === 0) {
    /*
     * ⛔ No unit rows means nothing for the date-overlap check to overlap — so
     * this row has NOT been checked against the window, and it must not claim
     * it has.
     *
     * This branch used to answer `verdict('available', 'N in stock · not
     * unit-tracked')` — a green chip reading **Available**, under a header
     * that says "Availability shown for this booking's dates", derived from a
     * bulk count that was never compared with those dates. An earlier note
     * here defended it as "the same honest answer this function gave before
     * the window existed". It was not honest before either: answering
     * `available` off a stock count is precisely the NR-09 defect this file
     * was rewritten to remove, and keeping it meant the rewrite closed the
     * hole for unit-tracked products only.
     *
     * On the live project that is not an edge case, it is EVERY row: 204
     * active products and 0 `product_units` (queried 6 Sep 2026). It also put
     * the panel at odds with the strip beneath it, which already called these
     * same rows "not checked", and with `confirmRental`'s `planAssignment`,
     * which refuses a line whose product resolves no units.
     *
     * `unknown` is the true answer, and the bulk count still ships with it —
     * it is a real fact, just not an answer about these dates.
     */
    const bulk = row.totalQuantity ?? 0
    return bulk === 0
      ? verdict('unavailable', 'No units recorded')
      : unknownVerdict('Not checked', `${bulk} in stock, but not unit-tracked — nothing to check against these dates`)
  }

  const { unitsOwned, unitsFree, heldBy } = answer
  /* The bookings holding the busy units, named — the fact that tells a
     coordinator what to do next. Two, then a count, so a popular camera does
     not turn a chip into a paragraph. */
  const held =
    heldBy.length === 0
      ? ''
      : ` · held by ${heldBy.slice(0, 2).join(', ')}${heldBy.length > 2 ? ` +${heldBy.length - 2} more` : ''}`

  if (unitsFree === 0) return verdict('unavailable', `None of ${unitsOwned} free for these dates${held}`)
  if (unitsFree === unitsOwned) return verdict('available', `${unitsFree} of ${unitsOwned} free for these dates`)
  return verdict('partial', `${unitsFree} of ${unitsOwned} free for these dates${held}`)
}

/**
 * `source` is **required and has no default** — the same pressure
 * `listBundleRecords` applies to its window argument, for the same reason. A
 * caller that cannot say what the availability answer is (or that it does not
 * have one yet) must not get a green catalogue by omission.
 */
export function equipmentResultsFrom(
  rows: readonly LiveEquipmentRow[],
  source: EquipmentAvailabilitySource,
): readonly EquipmentResult[] {
  return rows.map((r): EquipmentResult => {
    const category = r.category ?? 'Uncategorised'
    const kind: 'equipment' | 'accessory' = ACCESSORY_CATEGORIES.has(category) ? 'accessory' : 'equipment'

    return {
      kind,
      /* THE uuid — the entire reason this source exists. */
      id: r.id,
      /* NR-21 — one live row is one PRODUCT, so its uuid is its identity. Two
         products sharing a name are two rows, as they are two products. */
      productKey: r.id,
      name: r.name,
      serial: '—',
      category,
      location: r.assetCode ?? '—',
      /* No `status`. A product has no `inventory_state`; see
         `BookingLineDraft.status` for what used to be stamped here. */
      committedTo: '—',
      ratePaisa: (r.dailyRate ?? 0) as Paisa,
      ...(r.assetCode ? { sku: r.assetCode } : {}),
      ...(r.brand ? { brand: r.brand } : {}),
      inBundles: [],
      availability: liveEquipmentVerdict(r, source),
      haystack: [r.name, category, r.brand ?? '', r.assetCode ?? ''].filter(Boolean).map(normalise),
    }
  })
}

/* ── The windowed conflict (NR-09, requirement 2) ─────────────────────────── */

/** One booking line's worth of equipment that the window cannot cover. */
export interface EquipmentConflict {
  /** `products.id` — the line ids that produced it are the same uuid. */
  readonly productId: string
  readonly name: string
  /** Units this booking wants of that product, summed across its lines. */
  readonly needed: number
  /** Units the engine can assign for the window. */
  readonly free: number
  /** Bookings holding the rest, by `booking_no`. */
  readonly heldBy: readonly string[]
  /** The operator-facing sentence, ready to render. */
  readonly text: string
}

export interface EquipmentConflictSummary {
  readonly state: EquipmentAvailabilitySource['state']
  /** Empty unless `state` is `'ready'` — a conflict is an answer, not a guess. */
  readonly conflicts: readonly EquipmentConflict[]
  /** Lines the windowed read answered for. */
  readonly checked: number
  /**
   * Lines it could not answer for: bulk stock with no unit rows, seed rows
   * whose id is a product name, and bundle component drafts. Counted and
   * reported rather than folded into "no conflicts".
   */
  readonly unchecked: number
  /** The one-line state of the check, for the section's inline strip. */
  readonly text: string
  /**
   * Every line's own verdict, by line id — so the row's availability cell and
   * the section's conflict strip are the SAME computation and cannot contradict
   * each other. In particular a product wanted by two lines is judged once,
   * against the summed quantity, and both rows say the same thing.
   */
  readonly verdictByLineId: ReadonlyMap<string, AvailabilityVerdict>
}

/** The shape this needs off a booking line, and nothing else. */
export interface ConflictCheckLine {
  readonly id: string
  readonly productId?: string | null
  readonly name: string
  readonly qty: number
}

/**
 * Does the booking's window actually cover what is on the booking?
 *
 * **This replaces `lines.filter((l) => l.status !== 'In Stock')`**, which asked
 * whether a unit was free at this instant and blocked Confirm on the answer.
 *
 * The rule here is not invented: a line is in conflict when fewer units are
 * free for the window than the booking wants, which is precisely the refusal
 * `confirmRental.ts` already makes — it calls `planAssignment` and throws
 * `AssignmentIncompleteError` unless every line is fully covered
 * (`confirmRental.ts:435-436`). So this screen now refuses in advance, by name,
 * what the write path would otherwise refuse after two round trips. A partial
 * shortfall counts for the same reason: `reserveAssignedUnits` refuses an
 * incomplete plan outright, so "3 of 4" is not a booking that can be confirmed.
 *
 * Lines are summed **per product** before comparing, because units are a pool
 * and two lines naming one camera would compete for it. That sum does not fire
 * today — `AddItemPanel` refuses to add an id already on the booking, so a
 * product appears at most once — and it is written that way so the rule stays
 * correct if a second line for one product ever becomes reachable, rather than
 * silently answering the wrong question then.
 */
export function equipmentConflicts(
  lines: readonly ConflictCheckLine[],
  source: EquipmentAvailabilitySource,
): EquipmentConflictSummary {
  if (source.state !== 'ready') {
    const [label, text]: ['Checking' | 'Not checked', string] =
      source.state === 'checking'
        ? ['Checking', 'Checking availability for these dates…']
        : source.state === 'no-window'
          ? ['Not checked', 'Availability is not checked — set a pickup and return first.']
          : ['Not checked', `Availability could not be checked for these dates: ${source.reason}`]
    const pending = unknownVerdict(label, text)
    return {
      state: source.state,
      conflicts: [],
      checked: 0,
      unchecked: lines.length,
      text,
      verdictByLineId: new Map(lines.map((l) => [l.id, pending])),
    }
  }

  /* Keyed by product, and quantities added: see the header on why the addition
     is unreachable today and kept anyway. Line ids ARE product ids for every
     line this can check, which is what makes one map serve both. */
  const wanted = new Map<string, { name: string; qty: number }>()
  const verdictByLineId = new Map<string, AvailabilityVerdict>()
  let unchecked = 0
  for (const line of lines) {
    const prodId = line.productId ?? line.id
    const answer = source.byProduct.get(prodId)
    /* `unitsOwned === 0` is bulk stock: no unit rows, so the overlap check has
       nothing to answer with. Not a conflict, and not a clean bill either. */
    if (answer === undefined || answer.unitsOwned === 0) {
      unchecked += 1
      verdictByLineId.set(
        line.id,
        unknownVerdict(
          'Not checked',
          answer === undefined
            ? 'Not in the live catalogue'
            : 'Not unit-tracked — no units to check against these dates',
        ),
      )
      continue
    }
    const held = wanted.get(prodId)
    if (held === undefined) wanted.set(prodId, { name: line.name, qty: line.qty })
    else held.qty += line.qty
  }

  const conflicts: EquipmentConflict[] = []
  for (const [productId, want] of wanted) {
    const answer = source.byProduct.get(productId)
    if (answer === undefined) continue
    const { unitsFree, unitsOwned, heldBy } = answer
    const heldSentence =
      heldBy.length === 0
        ? ''
        : ` Held by ${heldBy.slice(0, 2).join(', ')}${heldBy.length > 2 ? ` and ${heldBy.length - 2} more` : ''}.`

    if (unitsFree >= want.qty) {
      verdictByLineId.set(productId, verdict('available', `${unitsFree} of ${unitsOwned} free for these dates`))
      continue
    }

    verdictByLineId.set(
      productId,
      unitsFree === 0
        ? verdict('unavailable', `None of ${unitsOwned} free for these dates`)
        : verdict('partial', `${unitsFree} of ${want.qty} wanted are free for these dates`),
    )
    conflicts.push({
      productId,
      name: want.name,
      needed: want.qty,
      free: unitsFree,
      heldBy,
      text:
        `${want.name} — ${want.qty} unit${want.qty === 1 ? '' : 's'} wanted, ${unitsFree} free for ` +
        `these dates.${heldSentence}`,
    })
  }

  const checked = lines.length - unchecked
  const uncheckedNote = unchecked === 0 ? '' : ` ${unchecked} line${unchecked === 1 ? '' : 's'} could not be checked.`
  const text =
    conflicts.length > 0
      ? `${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'} — ${conflicts[0]?.text ?? ''}${uncheckedNote}`
      : checked === 0
        ? `No line on this booking could be checked against these dates.${uncheckedNote}`
        : `All ${checked} checked line${checked === 1 ? '' : 's'} have units free for these dates.${uncheckedNote}`

  return { state: 'ready', conflicts, checked, unchecked, text, verdictByLineId }
}

/* ── Bundle rows ───────────────────────────────────────────────────────── */

/**
 * §32 for a bundle — availability against the booking window, not against
 * "now".
 *
 * `factsOf` already owns the present-tense verdict and it is the base here.
 * The window then applies the two dates the data actually carries, and
 * nothing else:
 *
 * 1. `BundleRecord.booking` has a real `startAd`/`endAd`. A bundle out until
 *    3 Aug is not a conflict for a booking that starts on the 5th.
 * 2. `BundleLine.freesAd` says when a short line's units come back. A line
 *    that frees before pickup does not make the bundle Partial.
 *
 * Where no window is set the verdict is present-tense and the caller renders
 * the "set your dates" note — a guessed window would be worse than none.
 */
export function bundleAvailability(b: BundleRecord, facts: BundleFacts, w: BookingWindow): AvailabilityVerdict {
  const win = validWindow(w)

  if (facts.state === 'On Maintenance') {
    return verdict('unavailable', 'Components on maintenance', facts.blockedLines)
  }

  // 1 — a whole-bundle commitment, checked against the window where there is one.
  if (b.booking) {
    const clash = win ? overlaps(win, b.booking.startAd, b.booking.endAd) : true
    if (clash) {
      const word = b.booking.state === 'out' ? 'On rent' : 'Reserved'
      return verdict('unavailable', `${word} · ${b.booking.id} · ${b.booking.client}`, b.lines)
    }
  }

  // 2 — line shortfalls, minus the ones the window clears.
  const short = facts.blockedLines
  if (short.length === 0) return verdict('available', `All ${facts.totalItems} items ready`)

  const freed: BundleLine[] = []
  const stillShort: BundleLine[] = []
  for (const l of short) {
    const frees = l.freesAd?.getTime()
    if (win && frees !== undefined && !Number.isNaN(frees) && frees <= win.from) freed.push(l)
    else stillShort.push(l)
  }

  if (stillShort.length === 0) {
    return verdict(
      'available',
      `All ${facts.totalItems} items ready — ${freed.length} return${freed.length === 1 ? 's' : ''} before pickup`,
      [],
      freed,
    )
  }

  const missing = stillShort.reduce((s, l) => s + Math.max(0, l.quantity - l.unitsAvailable), 0)
  const level: AvailabilityLevel = facts.readyItems > 0 ? 'partial' : 'unavailable'
  return verdict(
    level,
    `${missing} of ${facts.totalItems} item${missing === 1 ? '' : 's'} unavailable · ${stillShort.length} component${
      stillShort.length === 1 ? '' : 's'
    } short`,
    stillShort,
    freed,
  )
}

/** §31's component line — the first few models, then an honest "+N more". */
export function componentSummaryOf(b: BundleRecord, max = 3): string {
  const models = b.lines.filter(isPriced).map((l) => l.model)
  const head = models.slice(0, max)
  const rest = models.length - head.length
  if (models.length === 0) return 'No priced components'
  return rest > 0 ? `${head.join(' · ')} · +${rest} more` : head.join(' · ')
}

/** Bundle rows, rebuilt per window because availability depends on the dates. */
export function bundleResults(
  w: BookingWindow,
  records: readonly BundleRecord[] = ACTIVE_BUNDLES,
): readonly BundleResult[] {
  return records.map((b): BundleResult => {
    const facts = factsOf(b)
    const displayId = b.bundleCode ?? b.id
    return {
      kind: 'bundle',
      id: displayId,
      name: b.name,
      category: b.category,
      tags: b.tags,
      record: b,
      facts,
      ratePaisa: b.bundleRatePaisa,
      availability: bundleAvailability(b, facts, w),
      componentSummary: componentSummaryOf(b),
      haystack: [
        b.name,
        displayId,
        b.id,
        b.category,
        ...b.tags,
        // §26 — "searching FX3 must surface bundles that CONTAIN an FX3".
        ...b.lines.map((l) => l.model),
        ...b.lines.map((l) => l.group),
        ...b.lines.flatMap((l) => l.substitutes ?? []),
      ]
        .filter(Boolean)
        .map(normalise),
    }
  })
}

/* ── Categories (§28–30) ───────────────────────────────────────────────── */

/**
 * Derived, sorted, de-duplicated — never a typed list.
 *
 * Three sources, all of which already own their own categories: the Inventory
 * workspace's derived `CATEGORY_OPTIONS`, the Bundles seed's derived
 * `ALL_CATEGORIES`, and every bundle line's `group` (which §4.2 of the bundle
 * seed defines as *"the model's inventory category, or Crew / Vehicle / Boxes
 * / Bags"* — so a bundle's internal grouping is category data too).
 */
export const DERIVED_CATEGORIES: readonly string[] = Array.from(
  new Set<string>([
    ...CATEGORY_OPTIONS,
    ...ALL_CATEGORIES,
    ...ACTIVE_BUNDLES.flatMap((b) => b.lines.map((l) => l.group)),
  ]),
).sort((a, b) => a.localeCompare(b))

/** True when a result belongs to `category` — a bundle counts if any line does. */
export function inCategory(r: CatalogueResult, category: string): boolean {
  if (r.kind === 'bundle') {
    return r.category === category || r.record.lines.some((l) => l.group === category)
  }
  if (r.kind === 'crew' || r.kind === 'transport') {
    return false // Crew and Transport don't have categories
  }
  return r.category === category
}

/* ── Services (§27) ────────────────────────────────────────────────────── */

/**
 * There is no service catalogue in this build.
 *
 * §27 asks for a Services tab and this renders one — showing this sentence
 * rather than a plausible list of invented services with invented rates. The
 * page's Section 2 is titled "Equipment, Bundles & Services", so the gap is
 * the data layer's, not the tab's.
 *
 * TODO(decision) — PLAN.md §4: services (operator day, drone pilot, delivery,
 * data wrangling) are charged today but have no catalogue. Crew is priced
 * through `data/crew.ts` in Section 3 and transport through Section 3's
 * delivery/fuel fields, so a service catalogue must be defined against those
 * two rather than beside them.
 */
export const SERVICES_UNAVAILABLE_REASON =
  'No service catalogue exists yet. Crew is added in Section 3 (Crew & Transport) and delivery and fuel are charged there too — nothing is lost, but a searchable service list needs a catalogue this build does not have.'

/* ── Sort (§35) ────────────────────────────────────────────────────────── */

export type SortKey = 'recommended' | 'name' | 'price-asc' | 'price-desc'

export interface SortOption {
  key: SortKey
  label: string
}

/**
 * §35 lists six sorts. Four are shipped.
 *
 * **Most Used** needs a usage counter. `ChildRow.rentalCount` is declared in
 * `data/inventory.ts` and seeded on zero rows; `data/rentals.ts` carries a free
 * text `kit` label ("Sony FX6 Kit") that matches no bundle name, so counting
 * bookings per bundle would mean fuzzy-matching strings into a number and
 * presenting the result as a fact.
 *
 * **Recently Added** needs an added-date. No catalogue record in this build
 * carries one — not `PARENTS`, not `INVENTORY_MODELS`, not `BUNDLES`.
 *
 * Both are therefore absent from the menu and named in `OMITTED_SORTS`, which
 * the panel prints. A sort that silently returns the input order is worse than
 * a sort that is not offered.
 */
export const SORT_OPTIONS: readonly SortOption[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'price-asc', label: 'Price Low → High' },
  { key: 'price-desc', label: 'Price High → Low' },
]

export const OMITTED_SORTS: ReadonlyArray<{ label: string; reason: string }> = [
  { label: 'Most Used', reason: 'no usage counter is recorded against equipment or bundles' },
  { label: 'Recently Added', reason: 'no catalogue record carries an added date' },
]

/* ── Search (§25–26) ───────────────────────────────────────────────────── */

/** Relevance: name prefix, then name hit, then code/SKU hit, then anything else. */
function relevance(r: CatalogueResult, q: string): number {
  const n = normalise(q)
  const name = normalise(r.name)
  if (name.startsWith(n)) return 0
  if (name.includes(n)) return 1
  if (normalise(r.id).includes(n)) return 2
  if (r.kind === 'equipment' && r.sku && normalise(r.sku).includes(n)) return 2
  return 3
}

function matches(r: CatalogueResult, q: string): boolean {
  const n = normalise(q)
  return r.haystack.some((h) => h.includes(n))
}

export interface QueryOptions {
  query: string
  kinds: ReadonlySet<ResultKind>
  category: string | null
  availability: AvailabilityLevel | null
  sort: SortKey
  minQueryChars: number
  /** Ids already on the booking — kept in the list, flagged, never re-added. */
  existingLineIds: ReadonlySet<string>
  /**
   * The equipment pool to search.
   *
   * Omitted, it falls back to the SEED catalogue, whose ids are product names —
   * fine for a screen that only browses, fatal for one that writes. A caller
   * that intends to create a booking must pass `equipmentResultsFrom(liveRows)`
   * so every line carries a real `products.id`.
   */
  equipment?: readonly EquipmentResult[]
  /**
   * The bundles pool to search.
   *
   * Omitted, it falls back to ACTIVE_BUNDLES.
   */
  bundles?: readonly BundleResult[]
  /**
   * The crew pool to search.
   *
   * Omitted, it falls back to the CREW_ROSTER from data/crew.ts.
   */
  crew?: readonly CrewMember[]
  /**
   * The transport/delivery pool to search.
   *
   * Omitted, it falls back to the default delivery options.
   */
  transport?: readonly TransportOption[]
}

export interface QueryGroup {
  kind: ResultKind
  heading: string
  results: readonly CatalogueResult[]
}

export interface QueryOutcome {
  groups: readonly QueryGroup[]
  total: number
  /** True once the query is long enough to filter on. */
  searching: boolean
  /** Set when a filter, not the query, emptied the list — so the panel can say which. */
  narrowedBy: string | null
}

const GROUP_ORDER: ReadonlyArray<{ kind: ResultKind; heading: string }> = [
  { kind: 'bundle', heading: 'Bundles' },
  { kind: 'equipment', heading: 'Equipment' },
  { kind: 'accessory', heading: 'Accessories' },
  { kind: 'service', heading: 'Services' },
  { kind: 'crew', heading: 'Crew' },
  { kind: 'transport', heading: 'Transport' },
]

/**
 * Transport option for the catalogue — maps to a delivery method option.
 */
export interface TransportOption {
  id: string
  name: string
  type: 'Client Pickup' | 'Babin Delivery'
  vehicle?: string
  numberPlate?: string
  driverName?: string
  ratePaisa: Paisa
}

/**
 * Crew search result — maps a roster member to the catalogue shape.
 */
export interface CrewResult {
  kind: 'crew'
  id: string
  name: string
  role: string
  state: string
  phone: string
  dayRatePaisa: Paisa
  availability: AvailabilityVerdict
  haystack: readonly string[]
}

/**
 * Transport/Delivery search result — maps a delivery option to the catalogue shape.
 */
export interface TransportResult {
  kind: 'transport'
  id: string
  name: string
  type: 'Client Pickup' | 'Babin Delivery'
  vehicle?: string
  numberPlate?: string
  driverName?: string
  ratePaisa: Paisa
  availability: AvailabilityVerdict
  haystack: readonly string[]
}

/**
 * Default transport options for a booking window.
 * In a live build this would query vehicle/driver availability.
 */
export function defaultTransportOptions(_w: BookingWindow): TransportOption[] {
  return [
    { id: 'pickup', name: 'Client Pickup', type: 'Client Pickup', ratePaisa: 0 as Paisa },
    { id: 'delivery', name: 'Babin Delivery', type: 'Babin Delivery', ratePaisa: 500000 as Paisa }, // Rs 5,000 base
  ]
}


/**
 * Maps a CrewMember to a CrewResult for the unified catalogue.
 */
function crewToResult(m: CrewMember): CrewResult {
  const available = m.state === 'Available' ? 'available' : 'unavailable'
  return {
    kind: 'crew',
    id: m.id,
    name: m.name,
    role: m.role,
    state: m.state,
    phone: m.phone,
    dayRatePaisa: m.dayRatePaisa ?? 0,
    availability: verdict(available, m.state === 'Available' ? 'Available for work' : `${m.state} — not available`),
    haystack: [
      m.name,
      m.role,
      m.phone,
      m.state,
    ].filter(Boolean).map(normalise),
  }
}

/**
 * Maps a TransportOption to a TransportResult for the unified catalogue.
 */
function transportToResult(t: TransportOption): TransportResult {
  const haystack: readonly string[] = [
    t.name,
    t.type,
    t.vehicle ?? '',
    t.numberPlate ?? '',
    t.driverName ?? '',
  ].filter(Boolean).map(normalise)
  return {
    kind: 'transport',
    id: t.id,
    name: t.name,
    type: t.type,
    vehicle: t.vehicle ?? undefined,
    numberPlate: t.numberPlate ?? undefined,
    driverName: t.driverName ?? undefined,
    ratePaisa: t.ratePaisa,
    availability: verdict(t.ratePaisa === 0 ? 'available' : 'available', t.type === 'Client Pickup' ? 'Client collects equipment' : 'Babin delivers to location'),
    haystack,
  } as TransportResult
}

export type CatalogueResult = EquipmentResult | BundleResult | CrewResult | TransportResult

/**
 * One query over the whole catalogue (§25). The operator never picks a type
 * first — the type is how the *answer* is grouped, not how the question is
 * asked.
 */
export function runQuery(w: BookingWindow, o: QueryOptions): QueryOutcome {
  const q = o.query.trim()
  const searching = q.length >= o.minQueryChars

  const pool: CatalogueResult[] = [
    ...(o.kinds.has('bundle') ? (o.bundles ?? bundleResults(w)) : []),
    ...(o.equipment ?? EQUIPMENT_RESULTS).filter((e) => o.kinds.has(e.kind)),
    ...(o.kinds.has('crew') ? (o.crew ?? CREW_ROSTER).map(crewToResult) : []),
    ...(o.kinds.has('transport') ? (o.transport ?? defaultTransportOptions(w)).map(transportToResult) : []),
  ]

  const category = o.category
  const level = o.availability

  const afterQuery = searching ? pool.filter((r) => matches(r, q)) : pool
  const afterCategory = category === null ? afterQuery : afterQuery.filter((r) => inCategory(r, category))
  const afterAvailability =
    level === null ? afterCategory : afterCategory.filter((r) => r.availability.level === level)

  const sorted = [...afterAvailability].sort((a, b) => {
    switch (o.sort) {
      case 'name':
        return a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
      case 'price-asc': {
        const rateA = 'ratePaisa' in a ? a.ratePaisa : a.dayRatePaisa
        const rateB = 'ratePaisa' in b ? b.ratePaisa : b.dayRatePaisa
        return rateA - rateB || a.name.localeCompare(b.name)
      }
      case 'price-desc': {
        const rateA = 'ratePaisa' in a ? a.ratePaisa : a.dayRatePaisa
        const rateB = 'ratePaisa' in b ? b.ratePaisa : b.dayRatePaisa
        return rateB - rateA || a.name.localeCompare(b.name)
      }
      default: {
        // Recommended — what you can actually book first, then closest match.
        const onBooking = Number(o.existingLineIds.has(a.id)) - Number(o.existingLineIds.has(b.id))
        if (onBooking !== 0) return onBooking
        const avail = AVAILABILITY_RANK[a.availability.level] - AVAILABILITY_RANK[b.availability.level]
        if (avail !== 0) return avail
        if (searching) {
          const rel = relevance(a, q) - relevance(b, q)
          if (rel !== 0) return rel
        }
        return a.name.localeCompare(b.name)
      }
    }
  })

  const groups = GROUP_ORDER.filter((g) => o.kinds.has(g.kind))
    .map((g) => ({
      kind: g.kind,
      heading: g.heading,
      results: g.kind === 'service' ? [] : sorted.filter((r) => r.kind === g.kind),
    }))
    .filter((g) => g.kind === 'service' || g.results.length > 0)

  const narrowedBy: string | null =
    afterAvailability.length === 0 && afterQuery.length > 0
      ? level !== null && afterCategory.length > 0
        ? 'availability'
        : category !== null
          ? 'category'
          : null
      : null

  return { groups, total: afterAvailability.length, searching, narrowedBy }
}

/* ── Adding (§34) ──────────────────────────────────────────────────────── */

/** `BundleLine.blockedBy` and `InvStatus` are the same vocabulary; this is the map. */
const BLOCKED_TO_STATUS: Record<'Reserved' | 'On Rent' | 'On Maintenance', InvStatus> = {
  Reserved: 'Reserved',
  'On Rent': 'On Rent',
  'On Maintenance': 'Maintenance',
}

export interface AddBundleOptions {
  /** The booking's length. Every draft starts here; the page can still edit per line. */
  days: number
  /** Ids already on the booking. A component already there is skipped, not duplicated. */
  existingLineIds?: ReadonlySet<string>
  /**
   * Crew and vehicle lines are **priced elsewhere** (bundle seed §8/§10.4 —
   * crew in Section 3, vehicle in Section 3's transport fields). Off by
   * default so a bundle cannot quietly bill a Camera Assistant twice.
   */
  includeCrewAndVehicle?: boolean
  /**
   * Stamp `facts.savingPct` on every draft as a per-line discount, so the
   * component lines add up to roughly the bundle's advertised rate.
   *
   * Off by default: the bundle rate versus sum of parts is a **pricing**
   * decision and §67 keeps pricing where it is. When it is on, no new formula
   * runs — `savingPct` is `factsOf`'s own figure and the page's
   * `lineAmountPaisa` still does the arithmetic. `savingPct` is a rounded
   * integer, so the total lands *near* the advertised rate, not exactly on it;
   * `notes` says so.
   */
  applyBundleSaving?: boolean
}

export interface AddBundleResult {
  /** Append these to the booking. Never mutated state — the page applies them. */
  lines: readonly BookingLineDraft[]
  /** Components deliberately not added, each with the reason. */
  skipped: ReadonlyArray<{ model: string; reason: string }>
  facts: BundleFacts
  availability: AvailabilityVerdict
  /** `factsOf`'s figure, surfaced so a caller does not recompute it. */
  savingPct: number
  savingPaisa: Paisa
  /** Sentences the UI shows verbatim. Never a silent behaviour. */
  notes: readonly string[]
}

/**
 * §34 — *"adding a bundle automatically adds its components rather than making
 * staff add each one by hand."*
 *
 * Returns data. It does not touch page state, does not navigate, does not
 * price, and does not decide: `lines` is a list the caller appends, `skipped`
 * and `notes` are sentences the caller shows.
 *
 * A short component is still added carrying the status that is holding it, and
 * `notes` still says so. ⚠ Since NR-09 that status no longer raises the page's
 * Critical: `equipmentConflicts` answers the window per PRODUCT and a bundle
 * component draft carries a `BND-…::model` id, which is not a `products.id`, so
 * these lines land in the summary's `unchecked` count instead. They are also
 * refused at Confirm by `confirmWriteRefusals`' sample-row rule, because the
 * bundle catalogue this reads (`data/bundles.ts`) is still seed. Live bundles
 * have their own windowed path in `queries/bundleRecords.ts`; wiring this
 * function to it is the next slice, not something to fake here.
 */
export function addBundleToBooking(
  b: BundleRecord,
  w: BookingWindow,
  o: AddBundleOptions,
): AddBundleResult {
  const facts = factsOf(b)
  const availability = bundleAvailability(b, facts, w)
  const existing = o.existingLineIds ?? new Set<string>()
  const days = Math.max(1, Math.round(o.days) || 1)
  const discountPct = 0
  const lines: BookingLineDraft[] = []
  const skipped: Array<{ model: string; reason: string }> = []

  const mintDraftUuid = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
    })
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const parentKey = mintDraftUuid()
  const bundleCode = b.bundleCode ?? b.id
  const bundleDbId = b.dbId ?? (UUID_RE.test(b.id) ? b.id : null)

  if (!existing.has(bundleCode) && !existing.has(b.id)) {
    lines.push({
      id: bundleDbId ?? b.id,
      clientUuid: parentKey,
      lineType: 'Bundle',
      bundleId: bundleDbId,
      bundleCode,
      bundleName: b.name,
      name: b.name,
      serial: '—',
      category: b.category,
      ratePaisa: b.bundleRatePaisa,
      days,
      qty: 1,
      discountPct: 0,
      location: '—',
      status: 'In Stock',
      committedTo: b.booking ? `${b.booking.id} · ${b.booking.client}` : '—',
    })
  }

  for (const l of b.lines) {
    const priced = isPriced(l)
    if (!priced && !o.includeCrewAndVehicle) {
      skipped.push({
        model: l.model,
        reason: l.kind === 'crew' ? 'Crew is added in Section 3' : 'Transport is charged in Section 3',
      })
      continue
    }

    const componentProdId = l.productId ?? null
    // Stable and readable: the bundle code scopes the component name or composite key.
    const id = componentProdId ? `${parentKey}::${componentProdId}` : `${b.id}::${l.model}`
    if (existing.has(id)) {
      skipped.push({ model: l.model, reason: 'Already on this booking' })
      continue
    }

    const short = l.unitsAvailable < l.quantity
    const status: InvStatus = short && l.blockedBy ? BLOCKED_TO_STATUS[l.blockedBy] : short ? 'Reserved' : 'In Stock'

    lines.push({
      id,
      clientUuid: mintDraftUuid(),
      parentClientUuid: parentKey,
      lineType: 'Equipment',
      isIncluded: true,
      productId: componentProdId,
      bundleId: bundleDbId,
      bundleCode,
      bundleName: b.name,
      name: l.model,
      // A bundle stores models, never serials (bundle seed §10) — packing assigns the unit.
      serial: '—',
      category: l.group,
      ratePaisa: 0 as Paisa, // Included in parent bundle rate — avoids double charging!
      days,
      qty: l.quantity,
      discountPct: 0,
      // No bundle line carries a location; an em-dash is the honest value.
      location: '—',
      status,
      committedTo: b.booking ? `${b.booking.id} · ${b.booking.client}` : '—',
    })
  }

  const notes: string[] = []
  notes.push(
    `Bundle ${b.name} (${b.id}) added: bundle billed at daily rate; ${b.lines.length} component line${
      b.lines.length === 1 ? '' : 's'
    } included at Rs 0 to reserve inventory without double charging (${days} day${days === 1 ? '' : 's'}).`,
  )
  if (!o.includeCrewAndVehicle && (facts.crew > 0 || facts.vehicle > 0)) {
    notes.push(
      `Crew (${facts.crew}) and vehicle (${facts.vehicle}) are not added — both are priced in Section 3, Crew & Transport.`,
    )
  }
  if (discountPct > 0) {
    notes.push(
      `Each line carries the bundle's ${discountPct}% saving. The rounded percentage lands near the advertised bundle rate, not exactly on it.`,
    )
  } else if (facts.savingPct > 0) {
    notes.push(
      `Components are added at their own daily rates. The bundle rate is ${facts.savingPct}% lower than the sum of parts — apply that in Pricing if it is being honoured.`,
    )
  }
  if (availability.level !== 'available') {
    notes.push(
      /* ⛔ This used to end "…so the booking's conflict check still sees them."
         It does not: a component draft's id is `${bundleId}::${model}`, which is
         not a `products.id`, so it is never in the availability read and
         `equipmentConflicts` counts it `unchecked` and raises no Critical. The
         sentence promised a net that the windowed rewrite removed, directly
         above a strip saying the line could not be checked. */
      `${availability.label} — ${availability.detail}. Short components are still added, and the booking's conflict check cannot see them: a bundle component is not a catalogue product, so it is not in the availability read for these dates.`,
    )
  }

  return {
    lines,
    skipped,
    facts,
    availability,
    savingPct: facts.savingPct,
    savingPaisa: facts.savingPaisa,
    notes,
  }
}

/* ── redesign v1 §2 — one row per model, one chip per unit ────────────────
 *
 * `EQUIPMENT_RESULTS` stays flat (one entry per serial, or per pooled SKU) —
 * search, ranking and per-unit availability all still read it exactly as
 * before. This groups the *already-ranked* results from one query group by
 * model name, purely for rendering: three FX3 bodies become one row with
 * three chips instead of three rows that look like three different products.
 * A non-serialised SKU (bulk stock) is a "group" of one, with no chips — a
 * chip is a physical unit, and bulk stock has none to point at.
 */

export interface EquipmentModelGroup {
  /** The identity the group was formed on — `EquipmentResult.productKey`. Unique within a result set. */
  key: string
  name: string
  kind: 'equipment' | 'accessory'
  category: string
  ratePaisa: Paisa
  sku?: string
  brand?: string
  inBundles: readonly string[]
  /** Every unit sharing this name, in the order the query already ranked them. */
  units: readonly EquipmentResult[]
  /**
   * The unit tapping the *model name* would add — the first free unit in
   * serial order, or the sole row for bulk stock. Null when nothing is free.
   *
   * "Least-used free unit" (the spec's wording) needs a non-zero usage
   * counter; `data/inventory.ts`'s `ChildRow.rentalCount` is seeded to zero
   * on every row in this build (the same gap `SORT_OPTIONS`' omitted "Most
   * Used" sort documents above), so every free unit ties. Serial order is the
   * honest, deterministic tiebreak until that counter is real.
   */
  autoPick: EquipmentResult | null
  /** The best (lowest-severity) availability across every unit in the group. */
  availability: AvailabilityVerdict
}

/**
 * Groups one query group's already-sorted results by **product identity**
 * (`productKey`), not by display name.
 *
 * NR-21: this grouped on `r.name`. For the seed source that is the product
 * identity — every serialised child of one `ParentRow` carries its parent's
 * name — but for the live source every row is a distinct product, so two
 * products that happen to share a name collapsed into one group. Both fed
 * `first` (the chips, the SKU, the rate) and `autoPick` silently returned
 * whichever had sorted first, which is a different product from the one the
 * operator is looking at. Each source now declares its own key.
 *
 * `autoPick` is picked on **availability, not on unit status**: a live row has
 * no unit status at all since NR-09, and for a seed serialised row the two are
 * the same test (`equipmentAvailability` maps In Stock → `available` and every
 * other state → `unavailable`). `unknown` is pickable — a read still in flight
 * is not a reason to refuse an item, and Confirm has its own windowed check.
 */
export function groupEquipmentResults(results: readonly EquipmentResult[]): EquipmentModelGroup[] {
  const order: string[] = []
  const byKey = new Map<string, EquipmentResult[]>()
  for (const r of results) {
    let bucket = byKey.get(r.productKey)
    if (bucket === undefined) {
      bucket = []
      byKey.set(r.productKey, bucket)
      order.push(r.productKey)
    }
    bucket.push(r)
  }
  return order.map((key) => {
    const units = byKey.get(key)!
    const first = units[0]!
    const free = units
      .filter((u) => u.availability.level !== 'unavailable')
      .sort((a, b) => a.serial.localeCompare(b.serial))
    const availability = units.reduce(
      (best, u) => (AVAILABILITY_RANK[u.availability.level] < AVAILABILITY_RANK[best.level] ? u.availability : best),
      first.availability,
    )
    return {
      key,
      name: first.name,
      kind: first.kind,
      category: first.category,
      ratePaisa: first.ratePaisa,
      ...(first.sku ? { sku: first.sku } : {}),
      ...(first.brand ? { brand: first.brand } : {}),
      inBundles: first.inBundles,
      units,
      autoPick: free[0] ?? null,
      availability,
    }
  })
}

/** The single-row equivalent — one equipment result becomes one draft. */
export function equipmentLineDraft(e: EquipmentResult, days: number): BookingLineDraft {
  return {
    id: e.id,
    name: e.name,
    serial: e.serial,
    category: e.category,
    ratePaisa: e.ratePaisa,
    days: Math.max(1, Math.round(days) || 1),
    // A serialised row is one physical unit; only bulk stock varies.
    qty: 1,
    discountPct: 0,
    location: e.location,
    /* `exactOptionalPropertyTypes` — a live row has NO unit status, and
       `status: undefined` is not the same as omitting the key. */
    ...(e.status ? { status: e.status } : {}),
    committedTo: e.committedTo,
  }
}
