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

import { BOX_CATEGORIES, INVENTORY_MODELS } from '../../../data/addBundle'
import type { InventoryModel } from '../../../data/addBundle'
import { ACTIVE_BUNDLES, ALL_CATEGORIES, factsOf, isPriced } from '../../../data/bundles'
import type { BundleFacts, BundleLine, BundleRecord } from '../../../data/bundles'
import { bundlesUsing } from '../../../data/addEquipment'
import { CATEGORY_OPTIONS, PARENTS } from '../../../data/inventory'
import type { InvStatus, ParentRow } from '../../../data/inventory'
import type { Paisa } from '../../../lib/money'
import type { StatusKey } from '../../../lib/status'
import type { IconName } from '../../../components/ui/Icon'

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
  name: string
  serial: string
  category: string
  ratePaisa: Paisa
  /** §8.3 — Days is mandatory and explicit on every line. */
  days: number
  qty: number
  discountPct: number
  location: string
  status: InvStatus
  committedTo: string
}

/** Read by nothing at runtime; here so the coupling above is greppable. */
export const SHAPE_NOTE =
  "BookingLineDraft mirrors NewRental.tsx's Line. Change one, change the other."

/* ── Availability ──────────────────────────────────────────────────────── */

export type AvailabilityLevel = 'available' | 'partial' | 'unavailable'

export interface AvailabilityVerdict {
  level: AvailabilityLevel
  /** Never colour alone — this word ships with the colour, always. */
  label: 'Available' | 'Partial' | 'Unavailable'
  /** The one-line *why*: "1 component unavailable", "On Rent · B-710". */
  detail: string
  tone: StatusKey
  icon: IconName
  /** Bundle lines that cannot be filled for the window. Empty for equipment. */
  shortLines: BundleLine[]
  /** Short lines the window clears — they come back before pickup. */
  freedLines: BundleLine[]
}

const AVAILABILITY_RANK: Record<AvailabilityLevel, number> = {
  available: 0,
  partial: 1,
  unavailable: 2,
}

function verdict(
  level: AvailabilityLevel,
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
 * §25's four groups. `accessory` is not a fifth catalogue — it is the
 * `equipment` catalogue filtered by the categories the system already calls
 * accessories, so nothing is duplicated and nothing is invented.
 */
export type ResultKind = 'bundle' | 'equipment' | 'accessory' | 'service'

export interface EquipmentResult {
  kind: 'equipment' | 'accessory'
  /** The page's line id — a serial for a serialised unit, the SKU name otherwise. */
  id: string
  name: string
  serial: string
  category: string
  location: string
  status: InvStatus
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

export type CatalogueResult = EquipmentResult | BundleResult

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
 * Present-tense availability of one equipment row.
 *
 * The **line-level rule is the page's own, unchanged**: `NewRental.tsx` treats
 * `status !== 'In Stock'` as a conflict, so a row that is not In Stock is not
 * offered as Available here either. The extra state this adds is `partial`,
 * and only for non-serialised SKUs, where the row stands for a pool of units
 * and the parent's own `breakdown` already says how that pool is split. That
 * is more information about the same fact, not a different rule — the
 * `status` this module stamps on a `BookingLineDraft` is byte-identical to
 * what the page's own flatten would have stamped.
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
 * **Availability is present-tense and says so.** It counts `unitsByState`, the
 * same shape the seed path counts `breakdown` with. It does NOT consult the
 * booking window: real window availability is `queries/availability.ts`'s GiST
 * overlap check, which is a per-item query and not something to fire once per
 * catalogue row while someone types. The detail string states the basis, so a
 * verdict is never mistaken for one the window was applied to.
 */
export interface LiveEquipmentRow {
  id: string
  name: string
  brand?: string | null
  assetCode?: string | null
  category?: string | null
  dailyRate?: number | null
  unitsByState?: Partial<Record<string, number>> | null
  unitCountExcludingRetired?: number | null
  totalQuantity?: number | null
}

export function equipmentResultsFrom(rows: readonly LiveEquipmentRow[]): readonly EquipmentResult[] {
  return rows.map((r): EquipmentResult => {
    const category = r.category ?? 'Uncategorised'
    const kind: 'equipment' | 'accessory' = ACCESSORY_CATEGORIES.has(category) ? 'accessory' : 'equipment'

    /* `unitsByState` is absent for a non-serialised product; `totalQuantity`
       carries its bulk count instead. Neither is guessed into the other. */
    const byState = r.unitsByState ?? {}
    const free = byState['In Stock'] ?? 0
    const tracked = r.unitCountExcludingRetired ?? 0
    const total = tracked > 0 ? tracked : (r.totalQuantity ?? 0)

    const availability =
      total === 0
        ? verdict('unavailable', 'No units recorded')
        : tracked === 0
          ? /* Bulk stock with no per-unit rows — the count is all we know, and
               claiming a free/committed split we cannot see would be invention. */
            verdict('available', `${total} in stock · not unit-tracked`)
          : free === 0
            ? verdict('unavailable', `None of ${total} free right now`)
            : free === total
              ? verdict('available', `${free} of ${total} free right now`)
              : verdict('partial', `${free} of ${total} free right now`)

    return {
      kind,
      /* THE uuid — the entire reason this source exists. */
      id: r.id,
      name: r.name,
      serial: '—',
      category,
      location: r.assetCode ?? '—',
      status: (free > 0 || tracked === 0 ? 'In Stock' : 'On Rent') as InvStatus,
      committedTo: '—',
      ratePaisa: (r.dailyRate ?? 0) as Paisa,
      ...(r.assetCode ? { sku: r.assetCode } : {}),
      ...(r.brand ? { brand: r.brand } : {}),
      inBundles: [],
      availability,
      haystack: [r.name, category, r.brand ?? '', r.assetCode ?? ''].filter(Boolean).map(normalise),
    }
  })
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
export function bundleResults(w: BookingWindow): readonly BundleResult[] {
  return ACTIVE_BUNDLES.map((b): BundleResult => {
    const facts = factsOf(b)
    return {
      kind: 'bundle',
      id: b.id,
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
  if (r.kind !== 'bundle' && r.sku && normalise(r.sku).includes(n)) return 2
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
]

/**
 * One query over the whole catalogue (§25). The operator never picks a type
 * first — the type is how the *answer* is grouped, not how the question is
 * asked.
 */
export function runQuery(w: BookingWindow, o: QueryOptions): QueryOutcome {
  const q = o.query.trim()
  const searching = q.length >= o.minQueryChars

  const pool: CatalogueResult[] = [
    ...(o.kinds.has('bundle') ? bundleResults(w) : []),
    ...(o.equipment ?? EQUIPMENT_RESULTS).filter((e) => o.kinds.has(e.kind)),
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
      case 'price-asc':
        return a.ratePaisa - b.ratePaisa || a.name.localeCompare(b.name)
      case 'price-desc':
        return b.ratePaisa - a.ratePaisa || a.name.localeCompare(b.name)
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
 * A short component is added with the status that is holding it, so the page's
 * existing conflict rule (`status !== 'In Stock'`) raises the same Critical
 * alert it would for any other unavailable line. A bundle cannot smuggle an
 * unavailable camera onto a booking past the check.
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
  const discountPct = o.applyBundleSaving && facts.savingPct > 0 ? facts.savingPct : 0

  const lines: BookingLineDraft[] = []
  const skipped: Array<{ model: string; reason: string }> = []

  for (const l of b.lines) {
    const priced = isPriced(l)
    if (!priced && !o.includeCrewAndVehicle) {
      skipped.push({
        model: l.model,
        reason: l.kind === 'crew' ? 'Crew is added in Section 3' : 'Transport is charged in Section 3',
      })
      continue
    }

    // Stable and readable: the bundle code scopes the component name.
    const id = `${b.id}::${l.model}`
    if (existing.has(id)) {
      skipped.push({ model: l.model, reason: 'Already on this booking' })
      continue
    }

    const short = l.unitsAvailable < l.quantity
    const status: InvStatus = short && l.blockedBy ? BLOCKED_TO_STATUS[l.blockedBy] : short ? 'Reserved' : 'In Stock'

    lines.push({
      id,
      name: l.model,
      // A bundle stores models, never serials (bundle seed §10) — packing assigns the unit.
      serial: '—',
      category: l.group,
      ratePaisa: l.unitRatePaisa,
      days,
      qty: l.quantity,
      discountPct,
      // No bundle line carries a location; an em-dash is the honest value.
      location: '—',
      status,
      committedTo: b.booking ? `${b.booking.id} · ${b.booking.client}` : '—',
    })
  }

  const notes: string[] = []
  notes.push(
    `${lines.length} component line${lines.length === 1 ? '' : 's'} from ${b.name} (${b.id}), ${days} day${
      days === 1 ? '' : 's'
    } each.`,
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
      `${availability.label} — ${availability.detail}. Short components are added with the status holding them, so the booking's conflict check still sees them.`,
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

/** Groups one query group's already-sorted equipment/accessory results by model name. */
export function groupEquipmentResults(results: readonly EquipmentResult[]): EquipmentModelGroup[] {
  const order: string[] = []
  const byName = new Map<string, EquipmentResult[]>()
  for (const r of results) {
    if (!byName.has(r.name)) {
      byName.set(r.name, [])
      order.push(r.name)
    }
    byName.get(r.name)!.push(r)
  }
  return order.map((name) => {
    const units = byName.get(name)!
    const first = units[0]!
    const free = units.filter((u) => u.status === 'In Stock').sort((a, b) => a.serial.localeCompare(b.serial))
    const availability = units.reduce(
      (best, u) => (AVAILABILITY_RANK[u.availability.level] < AVAILABILITY_RANK[best.level] ? u.availability : best),
      first.availability,
    )
    return {
      name,
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
    status: e.status,
    committedTo: e.committedTo,
  }
}
