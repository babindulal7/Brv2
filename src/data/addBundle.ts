import { rupees, roundHalfUp, type Paisa } from '../lib/money'
import type { IconName } from '../components/ui/Icon'
import { ACTIVE_BUNDLES } from './bundles'
import type { BundleRecord } from './bundles'

/**
 * **Add Bundle seed — Inventory ▸ Bundles ▸ Add Bundle v1.1.**
 *
 * §7 is the rule this file exists to make structural: *"Pricing — derived, never
 * typed."* The build this replaces held a typed `Default Daily Rate` **and** a
 * Pricing Summary that recited the Bundles list page's seeded figures, so the
 * ten discounts the user had just entered moved nothing on screen.
 *
 * Nothing derivable is stored here. A model carries its stock pools and its
 * current daily rate; a draft line carries a quantity, the original rate
 * **stored at creation** (§7.4) and one discount. Sum of parts, bundle
 * discounts, the daily rate, the ready ratio, the blocked list, the donut and
 * the item breakdown are all functions of those two arrays.
 *
 * **Models, never serials** (§12). A bundle holds `Sony FX3 Body ×1`; packing
 * assigns whichever unit is free.
 */

/* ── categories ────────────────────────────────────────────────────────── */

/**
 * §4 — *"Primary category values come from Inventory v3.0"*, and §0 #10 rejects
 * the render's `DIT` and `Production` outright: *"A category list that exists in
 * two places with two contents is the drift this system keeps producing."*
 */
export const INVENTORY_CATEGORIES = [
  'Camera',
  'Lens',
  'Lighting',
  'Grip',
  'Support',
  'Audio',
  'Drone',
  'Monitor',
  'Power',
  'Media',
  'Computing',
  'Case',
  'Bag',
  'Accessory',
  'Vehicle',
  'Other',
] as const

export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number]

/** §10.3 — a case is equipment and *is* priced in the bundle rate (§10.4). */
export const BOX_CATEGORIES: ReadonlySet<InventoryCategory> = new Set<InventoryCategory>(['Case', 'Bag'])

/** Category → a glyph that exists in the `components/ui/Icon` registry. */
const CATEGORY_ICON: Record<InventoryCategory, IconName> = {
  Camera: 'camera',
  Lens: 'photo',
  Lighting: 'sparkles',
  Grip: 'tool',
  Support: 'box',
  Audio: 'headset',
  Drone: 'activity',
  Monitor: 'eye',
  Power: 'battery',
  Media: 'folder',
  Computing: 'automation',
  Case: 'package',
  Bag: 'package',
  Accessory: 'plug',
  Vehicle: 'truck',
  Other: 'queues',
}

export const iconForCategory = (c: InventoryCategory): IconName => CATEGORY_ICON[c]

/* ── the inventory tree ────────────────────────────────────────────────── */

/** §5.3 — an accessory is a **child or a line, never both**. */
export interface ModelChild {
  id: string
  /** §5.2 — required children need confirmation to remove; optional ones do not. */
  required: boolean
}

export interface InventoryModel {
  id: string
  sku: string
  name: string
  brand: string
  category: InventoryCategory
  /** §5.1 — `stock = available + reserved + onRent + maintenance`, asserted below. */
  stock: number
  available: number
  reserved: number
  onRent: number
  maintenance: number
  /** Today's daily rate for one unit. A line stores its own copy at creation (§7.4). */
  unitRatePaisa: Paisa
  /** §8.3 — when the held units come back. AD, UTC; **BS is rendered, never stored**. */
  nextFreeAd?: Date
  children?: ModelChild[]

  /*
   * ── deliberately NOT seeded ────────────────────────────────────────────
   * §9 asks the summary for a total weight. No weight exists anywhere in this
   * project's item master, so seeding one would be inventing a physical fact
   * nobody supplied. §9 states the honest rendering: `—` where any line has no
   * weight, never 0.
   *
   * TODO(decision) — PLAN.md §4: where do per-model weights come from? Bundles,
   * Packing and any transport manifest all need them.
   */
  weightKg?: number
}

const ad = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

/**
 * The models the render's Inventory Tree shows, with the pools it prints per row
 * — Stock / Available / Reserved / On Rent — plus the maintenance pool §5.1's
 * identity needs to close. §0 records that *"every row in the build satisfies
 * this"*, and `SEED_ERRORS` keeps it that way.
 */
export const INVENTORY_MODELS: InventoryModel[] = [
  {
    id: 'M-FX3-BODY',
    sku: 'CAM-SONY-FX3-BODY',
    name: 'Sony FX3 Camera Body',
    brand: 'Sony',
    category: 'Camera',
    stock: 4,
    available: 3,
    reserved: 1,
    onRent: 0,
    maintenance: 0,
    unitRatePaisa: rupees(8000),
    nextFreeAd: ad(2026, 8, 2),
    children: [
      { id: 'M-FX3-HANDLE', required: true },
      { id: 'M-FZ100', required: true },
      { id: 'M-FZ100-CHG', required: true },
      { id: 'M-USBC', required: false },
      { id: 'M-SR-CAGE', required: false },
    ],
  },
  {
    id: 'M-FX3-HANDLE',
    sku: 'ACC-TH-001',
    name: 'Sony FX3 Top Handle',
    brand: 'Sony',
    category: 'Accessory',
    stock: 6,
    available: 6,
    reserved: 0,
    onRent: 0,
    maintenance: 0,
    unitRatePaisa: rupees(400),
  },
  {
    id: 'M-FZ100',
    sku: 'BAT-SONY-FZ100',
    name: 'Sony NP-FZ100 Battery',
    brand: 'Sony',
    category: 'Power',
    stock: 8,
    available: 6,
    reserved: 1,
    onRent: 1,
    maintenance: 0,
    unitRatePaisa: rupees(300),
    nextFreeAd: ad(2026, 7, 19),
  },
  {
    id: 'M-FZ100-CHG',
    sku: 'BAT-CHG-001',
    name: 'Sony Dual Battery Charger',
    brand: 'Sony',
    category: 'Power',
    stock: 4,
    available: 4,
    reserved: 0,
    onRent: 0,
    maintenance: 0,
    unitRatePaisa: rupees(500),
  },
  {
    id: 'M-USBC',
    sku: 'CAB-USB-C-001',
    name: 'USB-C Cable 1m',
    brand: 'Generic',
    category: 'Accessory',
    stock: 10,
    available: 8,
    reserved: 1,
    onRent: 0,
    maintenance: 1,
    unitRatePaisa: rupees(100),
    nextFreeAd: ad(2026, 8, 5),
  },
  {
    id: 'M-SR-CAGE',
    sku: 'RIG-SR-FX3-001',
    name: 'SmallRig Cage',
    brand: 'SmallRig',
    category: 'Accessory',
    stock: 3,
    available: 3,
    reserved: 0,
    onRent: 0,
    maintenance: 0,
    unitRatePaisa: rupees(600),
  },
  {
    id: 'M-NISI-35',
    sku: 'LENS-NISI-35',
    name: 'NISI Athena 35mm T1.9',
    brand: 'NISI',
    category: 'Lens',
    stock: 3,
    available: 2,
    reserved: 0,
    onRent: 1,
    maintenance: 0,
    unitRatePaisa: rupees(4000),
    /* §8.3's worked example — 19 Jul 2026 is 4 Shrawan 2083, rendered by lib/bs. */
    nextFreeAd: ad(2026, 7, 19),
  },
  {
    id: 'M-NISI-50',
    sku: 'LENS-NISI-50',
    name: 'NISI Athena 50mm T1.9',
    brand: 'NISI',
    category: 'Lens',
    stock: 3,
    available: 2,
    reserved: 0,
    onRent: 1,
    maintenance: 0,
    unitRatePaisa: rupees(4000),
    nextFreeAd: ad(2026, 7, 21),
  },
  {
    id: 'M-NISI-85',
    sku: 'LENS-NISI-85',
    name: 'NISI Athena 85mm T1.9',
    brand: 'NISI',
    category: 'Lens',
    stock: 3,
    available: 2,
    reserved: 0,
    onRent: 1,
    maintenance: 0,
    unitRatePaisa: rupees(4000),
    nextFreeAd: ad(2026, 7, 21),
  },
  {
    id: 'M-MAN-504X',
    sku: 'SUP-MAN-504X',
    name: 'Manfrotto 504X Video Tripod',
    brand: 'Manfrotto',
    category: 'Support',
    stock: 2,
    available: 2,
    reserved: 0,
    onRent: 0,
    maintenance: 0,
    unitRatePaisa: rupees(1200),
  },
  {
    id: 'M-PK-BM5',
    sku: 'MON-PK-BM5',
    name: 'PortKeys BM5 Monitor',
    brand: 'PortKeys',
    category: 'Monitor',
    stock: 1,
    available: 1,
    reserved: 0,
    onRent: 0,
    maintenance: 0,
    unitRatePaisa: rupees(2000),
  },
  {
    id: 'M-CASE-1610',
    sku: 'CASE-PEL-1610',
    name: 'Pelican 1610 Hard Case',
    brand: 'Pelican',
    category: 'Case',
    stock: 3,
    available: 3,
    reserved: 0,
    onRent: 0,
    maintenance: 0,
    unitRatePaisa: rupees(800),
  },
  {
    id: 'M-BAG-ACC',
    sku: 'BAG-ACC-001',
    name: 'Accessory Bag',
    brand: 'Generic',
    category: 'Bag',
    stock: 4,
    available: 4,
    reserved: 0,
    onRent: 0,
    maintenance: 0,
    unitRatePaisa: rupees(400),
  },
  {
    id: 'M-LENS-CASE',
    sku: 'BAG-LENS-CASE',
    name: 'NISI Lens Case',
    brand: 'NISI',
    category: 'Bag',
    stock: 5,
    available: 5,
    reserved: 0,
    onRent: 0,
    maintenance: 0,
    unitRatePaisa: rupees(300),
  },
  {
    id: 'M-MAN-XPRO',
    sku: 'SUP-MAN-XPRO',
    name: 'Manfrotto XPRO Monopod',
    brand: 'Manfrotto',
    category: 'Support',
    stock: 3,
    available: 3,
    reserved: 0,
    onRent: 0,
    maintenance: 0,
    unitRatePaisa: rupees(700),
  },
  {
    id: 'M-APT-600D',
    sku: 'LGT-APT-600D',
    name: 'Aputure LS 600d Pro',
    brand: 'Aputure',
    category: 'Lighting',
    stock: 3,
    available: 1,
    reserved: 0,
    onRent: 2,
    maintenance: 0,
    unitRatePaisa: rupees(5000),
    nextFreeAd: ad(2026, 8, 11),
  },
  {
    id: 'M-KUPO-40',
    sku: 'GRP-KUPO-40',
    name: 'Kupo Master C-Stand 40"',
    brand: 'Kupo',
    category: 'Grip',
    stock: 8,
    available: 6,
    reserved: 2,
    onRent: 0,
    maintenance: 0,
    unitRatePaisa: rupees(250),
    nextFreeAd: ad(2026, 8, 5),
  },
  {
    id: 'M-RODE-WGO2',
    sku: 'AUD-RODE-WGO2',
    name: 'Rode Wireless GO II',
    brand: 'Rode',
    category: 'Audio',
    stock: 5,
    available: 5,
    reserved: 0,
    onRent: 0,
    maintenance: 0,
    unitRatePaisa: rupees(700),
  },
  {
    id: 'M-CFA-160',
    sku: 'MED-CFA-160',
    name: 'CFexpress Type A 160GB',
    brand: 'Sony',
    category: 'Media',
    stock: 6,
    available: 5,
    reserved: 0,
    onRent: 0,
    maintenance: 1,
    unitRatePaisa: rupees(250),
    nextFreeAd: ad(2026, 8, 14),
  },
  {
    id: 'M-DJI-RS4',
    sku: 'SUP-DJI-RS4',
    name: 'DJI RS 4 Pro Gimbal',
    brand: 'DJI',
    category: 'Support',
    stock: 2,
    available: 1,
    reserved: 1,
    onRent: 0,
    maintenance: 0,
    unitRatePaisa: rupees(2000),
    nextFreeAd: ad(2026, 8, 3),
  },
]

export const MODEL_BY_ID: ReadonlyMap<string, InventoryModel> = new Map(INVENTORY_MODELS.map((m) => [m.id, m]))

export const modelOf = (id: string): InventoryModel | undefined => MODEL_BY_ID.get(id)

export const ALL_BRANDS = Array.from(new Set(INVENTORY_MODELS.map((m) => m.brand))).sort()

/**
 * Models that hang off another model. The tree shows them **nested under their
 * parent only** — listing an accessory twice, once inside the FX3 and once as a
 * sibling of it, is the same double-count §5.3 rules out on the lines.
 * A search or a filter overrides this: a hidden row you cannot find is worse.
 */
export const CHILD_MODEL_IDS: ReadonlySet<string> = new Set(
  INVENTORY_MODELS.flatMap((m) => (m.children ?? []).map((c) => c.id)),
)

export const ROOT_MODELS = INVENTORY_MODELS.filter((m) => !CHILD_MODEL_IDS.has(m.id))

export const USED_CATEGORIES = INVENTORY_CATEGORIES.filter((c) => INVENTORY_MODELS.some((m) => m.category === c))

/* ── crew, vehicle and tags ────────────────────────────────────────────── */

/** §10.1 — **roles, not people**, each with a headcount. */
export const CREW_ROLES = [
  'Camera Assistant',
  'Focus Puller',
  'Gaffer',
  'Grip',
  'Drone Pilot',
  'Sound Recordist',
] as const
export type CrewRole = (typeof CREW_ROLES)[number]

/** §10.2 — one suggestion, priced in the booking's Transport section (§10.4). */
export const VEHICLE_TYPES = ['Pickup Van', 'Mini Truck', 'SUV', 'Generator Vehicle'] as const
export type VehicleType = (typeof VEHICLE_TYPES)[number]

export const TAG_OPTIONS = [
  'Documentary',
  'Travel',
  'Corporate',
  'Wedding',
  'Event',
  'Feature',
  'Studio',
  'Aerial',
] as const

/* ── the draft ─────────────────────────────────────────────────────────── */

/** §6.3 — percentage **or** fixed amount, never both. Switching clears the other. */
export type DiscountKind = 'pct' | 'fixed'

export interface DraftLine {
  key: string
  modelId: string
  /** §8.1 — `requiredQty`. */
  qty: number
  /**
   * §7.4 — *"Original rates are **stored on the line** at creation."* An
   * inventory rate change must never silently restate an advertised saving; it
   * raises the drift banner instead, and the operator chooses to refresh.
   */
  originalRatePaisa: Paisa
  discountKind: DiscountKind
  /** Percent of the original rate. Percentages stay numeric — `lib/money` §2.3. */
  discountPct: number
  discountFixedPaisa: Paisa
  /** §5.3 — model ids priced **inside** this line, at Rs 0 of their own. */
  childIds: string[]
  /** Foundation §9 — a discount above 10% carries a reason and an approver. */
  discountReason: string
  approvedBy: string | null
}

export interface CrewPick {
  role: CrewRole
  headcount: number
}

/**
 * The ten lines the render's Bundle Items table shows — **corrected by §5.3**.
 *
 * The render gives the FX3 line 5 children (Top Handle, Battery, Charger, USB-C,
 * Cage) while Battery and Battery Charger appear *again* as independent lines
 * with their own quantities and rates: *"That battery is in the bundle twice,
 * priced twice, and counted twice in availability."* Here they are promoted —
 * they are lines, so they are no longer children, and the FX3 line reads 3.
 *
 * §7.2's arithmetic against these ten lines: Σ original×qty **Rs 26,100**,
 * Σ discounts **Rs 2,320**, Σ bundle×qty **Rs 23,780**. Every one of the three
 * is now computed by `pricingOf`, so the panel cannot recite Rs 22,500 / 4,500 /
 * 18,000 at them again.
 */
export const INITIAL_LINES: DraftLine[] = [
  line('L1', 'M-FX3-BODY', 1, 'pct', 10, 0, ['M-FX3-HANDLE', 'M-USBC', 'M-SR-CAGE']),
  line('L2', 'M-NISI-35', 1, 'fixed', 0, 400),
  line('L3', 'M-NISI-50', 1, 'fixed', 0, 400),
  line('L4', 'M-NISI-85', 1, 'fixed', 0, 400),
  line('L5', 'M-FZ100', 4, 'pct', 0, 0),
  line('L6', 'M-FZ100-CHG', 1, 'pct', 0, 0),
  line('L7', 'M-MAN-504X', 1, 'pct', 10, 0),
  line('L8', 'M-PK-BM5', 1, 'fixed', 0, 200),
  line('L9', 'M-CASE-1610', 1, 'pct', 0, 0),
  line('L10', 'M-BAG-ACC', 1, 'pct', 0, 0),
]

function line(
  key: string,
  modelId: string,
  qty: number,
  discountKind: DiscountKind,
  pct: number,
  fixedRupees: number,
  childIds: string[] = [],
): DraftLine {
  const m = MODEL_BY_ID.get(modelId)
  return {
    key,
    modelId,
    qty,
    originalRatePaisa: m ? m.unitRatePaisa : (0 as Paisa),
    discountKind,
    discountPct: pct,
    discountFixedPaisa: rupees(fixedRupees),
    childIds,
    discountReason: '',
    approvedBy: null,
  }
}

/** §10 — the render's rail counts 1 crew and 1 vehicle; here they are real picks. */
export const INITIAL_CREW: CrewPick[] = [{ role: 'Camera Assistant', headcount: 1 }]
export const INITIAL_VEHICLE: VehicleType | null = 'Pickup Van'

/* ── derivation — every figure the screen prints comes from here ────────── */

/**
 * §6.3 — one discount or the other, and the result may never fall below Rs 0.
 */
export function bundleRateOf(l: DraftLine): Paisa {
  const cut =
    l.discountKind === 'pct'
      ? roundHalfUp(l.originalRatePaisa * (l.discountPct / 100))
      : l.discountFixedPaisa
  return Math.max(0, l.originalRatePaisa - cut) as Paisa
}

export interface LineTotals {
  originalTotal: Paisa
  bundleRate: Paisa
  /** §6.2 — `Line Total = Bundle Rate × Required Qty`. */
  lineTotal: Paisa
  discountTotal: Paisa
  /** Effective percentage off, whichever way the discount was entered. */
  discountPct: number
}

export function totalsOf(l: DraftLine): LineTotals {
  const bundleRate = bundleRateOf(l)
  const originalTotal = (l.originalRatePaisa * l.qty) as Paisa
  const lineTotal = (bundleRate * l.qty) as Paisa
  const discountTotal = (originalTotal - lineTotal) as Paisa
  const discountPct =
    l.originalRatePaisa === 0 ? 0 : roundHalfUp(((l.originalRatePaisa - bundleRate) / l.originalRatePaisa) * 100)
  return { originalTotal, bundleRate, lineTotal, discountTotal, discountPct }
}

export interface Pricing {
  sumOfPartsPaisa: Paisa
  discountsPaisa: Paisa
  computedRatePaisa: Paisa
  savingPct: number
}

/** §7.1, verbatim. Nothing below is stored. */
export function pricingOf(lines: DraftLine[]): Pricing {
  let sum = 0
  let bundle = 0
  for (const l of lines) {
    const t = totalsOf(l)
    sum += t.originalTotal
    bundle += t.lineTotal
  }
  const discounts = sum - bundle
  return {
    sumOfPartsPaisa: sum as Paisa,
    discountsPaisa: discounts as Paisa,
    computedRatePaisa: bundle as Paisa,
    savingPct: sum === 0 ? 0 : roundHalfUp((discounts / sum) * 100),
  }
}

/** Why a short line is short — drives both the donut and the blocked list. */
export type BlockedBy = 'Reserved' | 'On Rent' | 'On Maintenance'

export interface BlockedLine {
  key: string
  model: InventoryModel
  /** §8.3 — `Short by 1`. */
  short: number
  by: BlockedBy
  freesAd: Date | undefined
}

export interface Availability {
  readyItems: number
  totalItems: number
  blockedItems: number
  blocked: BlockedLine[]
  /** §8.2 — the donut and the summary read this one array. */
  segments: Array<{ label: 'Ready' | 'Reserved' | 'On Rent' | 'On Maintenance'; value: number }>
  /** The latest return date across the blocked lines — `null` when nothing is short. */
  readyAd: Date | null
}

/**
 * §8.1 — *"A line is blocked only when it has fewer available units than it
 * requires."* The build flagged NISI Athena 35mm while it held 2 of 3 units free
 * against a required quantity of 1: it was measuring units *not available*
 * instead of units *short*.
 */
/**
 * The model lookup these derivations resolve a line against.
 *
 * It defaults to `MODEL_BY_ID`, the SEED catalogue, which is what every caller
 * used until 7 Sep. Add Bundle now passes a map built from `products` instead,
 * because `bundle_items.product_id` is a uuid FK and 19 of the 20 seed model
 * names match no row — so a line keyed on a seed id could never be saved.
 *
 * The parameter exists rather than a module swap because a miss here is
 * SILENT: every one of these functions does `lookup.get(...)` and skips the
 * line. Put a real product uuid in `DraftLine.modelId` while these still read
 * the seed map and the screen empties itself — no error, no line, a 0/0 donut
 * and a Create button that goes Unavailable.
 */
export type ModelLookup = ReadonlyMap<string, InventoryModel>

export function availabilityOf(lines: DraftLine[], lookup: ModelLookup = MODEL_BY_ID): Availability {
  let readyItems = 0
  let totalItems = 0
  const blocked: BlockedLine[] = []

  for (const l of lines) {
    const m = lookup.get(l.modelId)
    if (!m) continue
    totalItems += l.qty
    readyItems += Math.min(m.available, l.qty)
    const short = Math.max(0, l.qty - m.available)
    if (short > 0) {
      /* Attribute the shortfall to the largest pool actually holding units. */
      const by: BlockedBy =
        m.onRent >= m.reserved && m.onRent >= m.maintenance
          ? 'On Rent'
          : m.reserved >= m.maintenance
            ? 'Reserved'
            : 'On Maintenance'
      blocked.push({ key: l.key, model: m, short, by, freesAd: m.nextFreeAd })
    }
  }

  const shortBy = (by: BlockedBy) => blocked.reduce((s, b) => (b.by === by ? s + b.short : s), 0)
  const dates = blocked.map((b) => b.freesAd).filter((d): d is Date => d instanceof Date)

  return {
    readyItems,
    totalItems,
    blockedItems: totalItems - readyItems,
    blocked,
    segments: [
      { label: 'Ready', value: readyItems },
      { label: 'Reserved', value: shortBy('Reserved') },
      { label: 'On Rent', value: shortBy('On Rent') },
      { label: 'On Maintenance', value: shortBy('On Maintenance') },
    ],
    readyAd: dates.length === 0 ? null : new Date(Math.max(...dates.map((d) => d.getTime()))),
  }
}

export interface ItemBreakdown {
  equipment: number
  crew: number
  vehicle: number
  boxes: number
  /** §9 — `equipment + crew + vehicle + boxes`, by construction. */
  totalItems: number
  /** §9 — `—` where any line has no weight. Never 0. */
  totalWeightKg: number | null
}

export function breakdownOf(
  lines: DraftLine[],
  crew: CrewPick[],
  vehicle: VehicleType | null,
  lookup: ModelLookup = MODEL_BY_ID,
): ItemBreakdown {
  let equipment = 0
  let boxes = 0
  for (const l of lines) {
    const m = lookup.get(l.modelId)
    if (!m) continue
    if (BOX_CATEGORIES.has(m.category)) boxes += l.qty
    else equipment += l.qty
  }
  const crewCount = crew.reduce((s, c) => s + c.headcount, 0)
  const vehicleCount = vehicle ? 1 : 0

  const models = lines.map((l) => lookup.get(l.modelId)).filter((m): m is InventoryModel => !!m)
  const totalWeightKg = models.every((m) => typeof m.weightKg === 'number')
    ? lines.reduce((s, l) => s + (lookup.get(l.modelId)?.weightKg ?? 0) * l.qty, 0)
    : null

  return {
    equipment,
    crew: crewCount,
    vehicle: vehicleCount,
    boxes,
    totalItems: equipment + crewCount + vehicleCount + boxes,
    totalWeightKg: models.length === 0 ? null : totalWeightKg,
  }
}

/**
 * §7.4 — a line whose stored original no longer matches the model's current
 * rate. Nothing is refreshed silently; the screen offers the choice and states
 * the difference.
 */
export function rateDriftOf(
  lines: DraftLine[],
  lookup: ModelLookup = MODEL_BY_ID,
): Array<{ key: string; model: InventoryModel; from: Paisa; to: Paisa }> {
  const out: Array<{ key: string; model: InventoryModel; from: Paisa; to: Paisa }> = []
  for (const l of lines) {
    const m = lookup.get(l.modelId)
    if (m && m.unitRatePaisa !== l.originalRatePaisa) {
      out.push({ key: l.key, model: m, from: l.originalRatePaisa, to: m.unitRatePaisa })
    }
  }
  return out
}

/** §5.3 — the lines that already hold this model as a child, if any. */
export function parentsHolding(lines: DraftLine[], modelId: string): DraftLine[] {
  return lines.filter((l) => l.childIds.includes(modelId))
}

/* ── §3 · Duplicate Existing ───────────────────────────────────────────── */

const MODEL_BY_NAME: ReadonlyMap<string, InventoryModel> = new Map(INVENTORY_MODELS.map((m) => [m.name, m]))

/** The bundles the header's `Duplicate Existing` control can copy from. */
export const TEMPLATE_BUNDLES: readonly BundleRecord[] = ACTIVE_BUNDLES

export interface DuplicateResult {
  name: string
  category: InventoryCategory | ''
  tags: string[]
  lines: DraftLine[]
  crew: CrewPick[]
  vehicle: VehicleType | null
  /** Models the source bundle holds that this inventory tree does not. Stated, never dropped silently. */
  unmatched: string[]
}

const isCategory = (v: string): v is InventoryCategory =>
  (INVENTORY_CATEGORIES as readonly string[]).includes(v)
const isCrewRole = (v: string): v is CrewRole => (CREW_ROLES as readonly string[]).includes(v)
const isVehicle = (v: string): v is VehicleType => (VEHICLE_TYPES as readonly string[]).includes(v)

/**
 * Copies a saved bundle into a fresh draft. Rates come from **this** tree, not
 * from the source bundle — a duplicate is a new bundle priced today, and §7.4
 * only protects rates already stored on a saved line.
 */
export function duplicateFrom(b: BundleRecord): DuplicateResult {
  const lines: DraftLine[] = []
  const crew: CrewPick[] = []
  const unmatched: string[] = []
  let vehicle: VehicleType | null = null
  let n = 0

  for (const l of b.lines) {
    if (l.kind === 'crew') {
      if (isCrewRole(l.model)) crew.push({ role: l.model, headcount: l.quantity })
      else unmatched.push(`${l.model} (crew role)`)
      continue
    }
    if (l.kind === 'vehicle') {
      if (isVehicle(l.model)) vehicle = l.model
      else unmatched.push(`${l.model} (vehicle)`)
      continue
    }
    const m = MODEL_BY_NAME.get(l.model)
    if (!m) {
      unmatched.push(l.model)
      continue
    }
    n += 1
    lines.push({
      key: `D${b.id}-${n}`,
      modelId: m.id,
      qty: l.quantity,
      originalRatePaisa: m.unitRatePaisa,
      discountKind: 'pct',
      discountPct: 0,
      discountFixedPaisa: rupees(0),
      childIds: [],
      discountReason: '',
      approvedBy: null,
    })
  }

  return {
    name: `Copy of ${b.name}`,
    category: isCategory(b.category) ? b.category : '',
    tags: [...b.tags],
    lines,
    crew,
    vehicle,
    unmatched,
  }
}

/* ── §5.1 · assertions that can fail, and say so ───────────────────────── */

/**
 * ⛔ Reported, never thrown. A module-scope `throw` runs before React mounts, so
 * no boundary catches it and the operator gets a blank screen — `lib/money.ts`
 * hit exactly that and was fixed the same way.
 */
export const SEED_ERRORS: string[] = (() => {
  const errs: string[] = []
  const ids = new Set<string>()
  const skus = new Set<string>()

  for (const m of INVENTORY_MODELS) {
    if (ids.has(m.id)) errs.push(`Duplicate model id ${m.id}.`)
    ids.add(m.id)
    if (skus.has(m.sku)) errs.push(`Duplicate SKU ${m.sku}.`)
    skus.add(m.sku)

    const pools = m.available + m.reserved + m.onRent + m.maintenance
    if (pools !== m.stock) {
      errs.push(
        `§5.1: ${m.sku} — available ${m.available} + reserved ${m.reserved} + on rent ${m.onRent} + ` +
          `maintenance ${m.maintenance} = ${pools}, against a stock of ${m.stock}.`,
      )
    }
    if (m.available < m.stock && !m.nextFreeAd) {
      errs.push(`§8.3: ${m.sku} holds units it cannot say the return date of.`)
    }
    for (const c of m.children ?? []) {
      if (!MODEL_BY_ID.has(c.id)) errs.push(`${m.sku} names a child model ${c.id} that does not exist.`)
    }
  }

  for (const l of INITIAL_LINES) {
    if (!MODEL_BY_ID.has(l.modelId)) errs.push(`Draft line ${l.key} names a model ${l.modelId} that does not exist.`)
    /* §5.3 — a child of one line may never be a line of its own. */
    for (const childId of l.childIds) {
      if (INITIAL_LINES.some((o) => o.modelId === childId)) {
        const m = MODEL_BY_ID.get(childId)
        errs.push(
          `§5.3: ${m?.name ?? childId} is both a child of ${MODEL_BY_ID.get(l.modelId)?.name ?? l.modelId} ` +
            'and a line of its own — it would be priced twice and counted twice in availability.',
        )
      }
    }
  }

  return errs
})()
