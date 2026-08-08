import { rupees, roundHalfUp, type Paisa } from '../lib/money'
import type { IconName } from '../components/ui/Icon'

/**
 * **Bundles seed — Inventory ▸ Bundles v1.1 §1.**
 *
 * §1's rule is the whole reason this file exists:
 *
 * > *"Every number on this page is computed at render. None is stored, seeded
 * > or typed."*
 *
 * The build this replaces stored `sumOfPartsPaisa` beside a hand-typed chip
 * array reading `All 51 · 28 · 6 · 9 · 5 · 3` against **three** seeded rows.
 * §1 names that failure exactly: *"a computed value written as a literal. A
 * seeded 42 beside a seeded 28 + 6 + 9 + 5 + 3 will always drift, because
 * nothing forces them to agree."*
 *
 * So nothing derivable is stored here. A bundle holds **lines** — a model, the
 * quantity it requires, the stock behind that model and the model's current
 * daily rate — plus the booking it is committed to, if any. Item counts, the
 * ready ratio, the blocked list, the state, the donut, the sum of parts and the
 * saving are all functions of those lines (`factsOf`), so they cannot disagree
 * with each other.
 *
 * **Models, never serials** (§10). A bundle does not hold `SN-FX3-102`; it holds
 * `Sony FX3 Camera Body ×1`, and packing assigns whichever unit is free.
 */

/* ── shape ─────────────────────────────────────────────────────────────── */

/** §2 — the five states a live bundle can be in, plus the archived shelf. */
export type BundleState = 'Available' | 'Reserved' | 'On Rent' | 'Partially Available' | 'On Maintenance'

/**
 * §4.2 — the four things a bundle carries. Crew and vehicle are **suggestions
 * priced elsewhere** (§8); a case is equipment and *is* priced in the rate.
 */
export type BundleLineKind = 'equipment' | 'crew' | 'vehicle' | 'box'

/** Why a short line is short. Drives both the blocked list and the donut. */
export type BlockedBy = 'Reserved' | 'On Rent' | 'On Maintenance'

export interface BundleLine {
  /** Preview-tree heading — the model's inventory category, or Crew / Vehicle / Boxes / Bags. */
  group: string
  model: string
  kind: BundleLineKind
  /** Units of this model the bundle requires. */
  quantity: number
  /** Units owned. The preview reads `1 of 3 available` from this pair. */
  unitsStock: number
  /** Units free right now. */
  unitsAvailable: number
  /** Set only where `unitsAvailable < quantity`; asserted below. */
  blockedBy?: BlockedBy
  /** When the short units come back. AD, UTC — **BS is rendered, never stored**. */
  freesAd?: Date
  /** Today's daily rate for one unit. §7 — sum of parts is computed from these. */
  unitRatePaisa: Paisa

  /*
   * ── deliberately NOT seeded ──────────────────────────────────────────────
   *
   * §6 asks the summary for a total weight. No weight exists anywhere in this
   * project's item master (`data/inventory.ts` carries none), so seeding one
   * per line would mean inventing a physical fact nobody supplied. §9 already
   * states the honest rendering: *"`—` where any line has no weight, never 0."*
   *
   * TODO(decision) — PLAN.md §4: where do per-model weights come from? They are
   * needed by Bundles, Packing and any airline/transport manifest.
   */
  weightKg?: number
}

export interface BundleBooking {
  /** `BK-` prefix, Foundation numbering. Links to `/rentals/:bookingNo`. */
  id: string
  client: string
  /** AD, UTC. `lib/bs` renders the BS line above it. */
  startAd: Date
  endAd: Date
  /** `out` = currently with the client; `reserved` = a future commitment. */
  state: 'out' | 'reserved'
}

export interface BundleRecord {
  id: string
  name: string
  /** §4.1 — one value, labelled `(Primary)`. The full mix is in the preview. */
  category: string
  tags: string[]
  archived?: boolean
  booking?: BundleBooking
  /**
   * The advertised daily rate, equipment only (§7/§8).
   *
   * TODO(decision) — Bundles.md §14 ⭐: *"Is the bundle rate set manually, or a
   * discount percentage off the sum of parts?"* The render shows a set figure,
   * so it is stored as one; the saving is derived against it. If it turns out to
   * be a percentage, this field becomes `discountPct` and the rate joins the
   * derived values.
   */
  bundleRatePaisa: Paisa
  lines: BundleLine[]
}

const ad = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

/* ── seed ──────────────────────────────────────────────────────────────── */

/**
 * The seven active bundles and two archived ones the render shows, with their
 * lines expanded so every figure on the page has something to derive from.
 *
 * Two renders disagree with their own arithmetic, and §0 lists both as defects:
 * Sony FX3 Documentary Kit prints `18 Items` over `14 + 1 + 1 + 3` (= 19), and
 * Grip & Support prints `28` over lines summing to 27. Deriving the total from
 * the lines fixes both — the totals below are 19 and 27, which is the render
 * corrected rather than copied.
 */
export const BUNDLES: BundleRecord[] = [
  {
    id: 'BND-00023',
    name: 'Sony FX3 Documentary Kit',
    category: 'Camera',
    tags: ['Documentary', 'Travel', 'Corporate'],
    bundleRatePaisa: rupees(18000),
    lines: [
      { group: 'Camera', model: 'Sony FX3 Camera Body', kind: 'equipment', quantity: 1, unitsStock: 3, unitsAvailable: 1, unitRatePaisa: rupees(9000) },
      { group: 'Camera', model: 'Sony FX3 Top Handle', kind: 'equipment', quantity: 1, unitsStock: 2, unitsAvailable: 2, unitRatePaisa: rupees(400) },
      { group: 'Camera', model: 'SmallRig Cage', kind: 'equipment', quantity: 1, unitsStock: 2, unitsAvailable: 2, unitRatePaisa: rupees(600) },
      { group: 'Lens', model: 'NISI Athena 35mm T1.9', kind: 'equipment', quantity: 1, unitsStock: 3, unitsAvailable: 3, unitRatePaisa: rupees(2500) },
      { group: 'Lens', model: 'NISI Athena 50mm T1.9', kind: 'equipment', quantity: 1, unitsStock: 3, unitsAvailable: 3, unitRatePaisa: rupees(2500) },
      { group: 'Lens', model: 'NISI Athena 85mm T1.9', kind: 'equipment', quantity: 1, unitsStock: 3, unitsAvailable: 3, unitRatePaisa: rupees(2500) },
      { group: 'Support', model: 'Manfrotto 504X Video Tripod', kind: 'equipment', quantity: 1, unitsStock: 4, unitsAvailable: 4, unitRatePaisa: rupees(1500) },
      { group: 'Support', model: 'Manfrotto XPRO Monopod', kind: 'equipment', quantity: 1, unitsStock: 3, unitsAvailable: 3, unitRatePaisa: rupees(700) },
      { group: 'Power', model: 'Sony NP-FZ100 Battery', kind: 'equipment', quantity: 3, unitsStock: 8, unitsAvailable: 6, unitRatePaisa: rupees(300) },
      { group: 'Power', model: 'Sony Dual Battery Charger', kind: 'equipment', quantity: 1, unitsStock: 4, unitsAvailable: 4, unitRatePaisa: rupees(500) },
      { group: 'Storage', model: 'CFexpress Type A 160GB', kind: 'equipment', quantity: 2, unitsStock: 6, unitsAvailable: 6, unitRatePaisa: rupees(250) },
      { group: 'Crew', model: 'Camera Assistant', kind: 'crew', quantity: 1, unitsStock: 4, unitsAvailable: 3, unitRatePaisa: rupees(0) },
      { group: 'Vehicle', model: 'Pickup Van', kind: 'vehicle', quantity: 1, unitsStock: 2, unitsAvailable: 2, unitRatePaisa: rupees(0) },
      { group: 'Boxes / Bags', model: 'Pelican 1610 Hard Case', kind: 'box', quantity: 1, unitsStock: 4, unitsAvailable: 4, unitRatePaisa: rupees(400) },
      { group: 'Boxes / Bags', model: 'NISI Lens Case', kind: 'box', quantity: 1, unitsStock: 3, unitsAvailable: 3, unitRatePaisa: rupees(300) },
      { group: 'Boxes / Bags', model: 'Accessory Bag', kind: 'box', quantity: 1, unitsStock: 6, unitsAvailable: 6, unitRatePaisa: rupees(200) },
    ],
  },
  {
    id: 'BND-00019',
    name: 'RED Komodo X Basic Package',
    category: 'Camera',
    tags: ['Feature', 'Corporate'],
    bundleRatePaisa: rupees(24000),
    booking: {
      id: 'BK-2026-0712',
      client: 'Himalayan Films',
      startAd: ad(2026, 7, 27),
      endAd: ad(2026, 8, 3),
      state: 'out',
    },
    lines: [
      { group: 'Camera', model: 'RED Komodo X Brain', kind: 'equipment', quantity: 1, unitsStock: 2, unitsAvailable: 0, blockedBy: 'On Rent', freesAd: ad(2026, 8, 3), unitRatePaisa: rupees(14000) },
      { group: 'Camera', model: 'RED DSMC3 RF Mount', kind: 'equipment', quantity: 1, unitsStock: 2, unitsAvailable: 0, blockedBy: 'On Rent', freesAd: ad(2026, 8, 3), unitRatePaisa: rupees(800) },
      { group: 'Lens', model: 'DZOFilm Vespid 35mm T2.1', kind: 'equipment', quantity: 1, unitsStock: 2, unitsAvailable: 0, blockedBy: 'On Rent', freesAd: ad(2026, 8, 3), unitRatePaisa: rupees(1800) },
      { group: 'Lens', model: 'DZOFilm Vespid 50mm T2.1', kind: 'equipment', quantity: 1, unitsStock: 2, unitsAvailable: 0, blockedBy: 'On Rent', freesAd: ad(2026, 8, 3), unitRatePaisa: rupees(1800) },
      { group: 'Lens', model: 'DZOFilm Vespid 75mm T2.1', kind: 'equipment', quantity: 1, unitsStock: 2, unitsAvailable: 0, blockedBy: 'On Rent', freesAd: ad(2026, 8, 3), unitRatePaisa: rupees(1800) },
      { group: 'Power', model: 'Core SWX NANO Micro 98', kind: 'equipment', quantity: 4, unitsStock: 12, unitsAvailable: 4, blockedBy: 'On Rent', freesAd: ad(2026, 8, 3), unitRatePaisa: rupees(300) },
      { group: 'Storage', model: 'RED PRO CFexpress 660GB', kind: 'equipment', quantity: 2, unitsStock: 4, unitsAvailable: 0, blockedBy: 'On Rent', freesAd: ad(2026, 8, 3), unitRatePaisa: rupees(600) },
      { group: 'Monitor', model: 'SmallHD Indie 7', kind: 'equipment', quantity: 1, unitsStock: 2, unitsAvailable: 1, unitRatePaisa: rupees(1500) },
      { group: 'Support', model: "O'Connor 1030DS Tripod", kind: 'equipment', quantity: 1, unitsStock: 2, unitsAvailable: 1, unitRatePaisa: rupees(2200) },
      { group: 'Accessory', model: '15mm Rod Set', kind: 'equipment', quantity: 2, unitsStock: 4, unitsAvailable: 2, unitRatePaisa: rupees(250) },
      { group: 'Accessory', model: 'Wooden Camera Cage', kind: 'equipment', quantity: 1, unitsStock: 2, unitsAvailable: 0, blockedBy: 'On Rent', freesAd: ad(2026, 8, 3), unitRatePaisa: rupees(700) },
      { group: 'Accessory', model: 'SDI Cable Set', kind: 'equipment', quantity: 2, unitsStock: 8, unitsAvailable: 5, unitRatePaisa: rupees(100) },
      { group: 'Crew', model: 'Camera Assistant', kind: 'crew', quantity: 1, unitsStock: 4, unitsAvailable: 2, unitRatePaisa: rupees(0) },
      { group: 'Vehicle', model: 'Pickup Van', kind: 'vehicle', quantity: 1, unitsStock: 2, unitsAvailable: 1, unitRatePaisa: rupees(0) },
      { group: 'Boxes / Bags', model: 'Pelican 1637 Air Case', kind: 'box', quantity: 1, unitsStock: 3, unitsAvailable: 1, unitRatePaisa: rupees(500) },
      { group: 'Boxes / Bags', model: 'DZOFilm Lens Case', kind: 'box', quantity: 1, unitsStock: 2, unitsAvailable: 1, unitRatePaisa: rupees(300) },
    ],
  },
  {
    id: 'BND-00017',
    name: 'Wedding Filmmaking Kit',
    category: 'Camera',
    tags: ['Wedding', 'Event'],
    bundleRatePaisa: rupees(20000),
    booking: {
      id: 'BK-2026-0719',
      client: 'DreamWeavers Studio',
      startAd: ad(2026, 8, 3),
      endAd: ad(2026, 8, 7),
      state: 'reserved',
    },
    lines: [
      { group: 'Camera', model: 'Sony A7S III Body', kind: 'equipment', quantity: 2, unitsStock: 4, unitsAvailable: 4, unitRatePaisa: rupees(5000) },
      { group: 'Lens', model: 'Sony 24-70mm GM II', kind: 'equipment', quantity: 2, unitsStock: 3, unitsAvailable: 3, unitRatePaisa: rupees(1500) },
      { group: 'Lens', model: 'Sony 70-200mm GM II', kind: 'equipment', quantity: 1, unitsStock: 2, unitsAvailable: 2, unitRatePaisa: rupees(1800) },
      { group: 'Lens', model: 'Sigma 35mm Art', kind: 'equipment', quantity: 1, unitsStock: 3, unitsAvailable: 3, unitRatePaisa: rupees(1000) },
      { group: 'Audio', model: 'Rode Wireless GO II', kind: 'equipment', quantity: 2, unitsStock: 5, unitsAvailable: 5, unitRatePaisa: rupees(700) },
      { group: 'Audio', model: 'Sennheiser MKE 600', kind: 'equipment', quantity: 1, unitsStock: 3, unitsAvailable: 3, unitRatePaisa: rupees(800) },
      { group: 'Lighting', model: 'Aputure MC Pro', kind: 'equipment', quantity: 3, unitsStock: 8, unitsAvailable: 8, unitRatePaisa: rupees(250) },
      { group: 'Support', model: 'DJI RS 4 Pro Gimbal', kind: 'equipment', quantity: 1, unitsStock: 2, unitsAvailable: 2, unitRatePaisa: rupees(2000) },
      { group: 'Support', model: 'Manfrotto 504X Video Tripod', kind: 'equipment', quantity: 1, unitsStock: 4, unitsAvailable: 4, unitRatePaisa: rupees(1500) },
      { group: 'Power', model: 'Sony NP-FZ100 Battery', kind: 'equipment', quantity: 4, unitsStock: 8, unitsAvailable: 6, unitRatePaisa: rupees(300) },
      { group: 'Storage', model: 'CFexpress Type A 160GB', kind: 'equipment', quantity: 2, unitsStock: 6, unitsAvailable: 6, unitRatePaisa: rupees(250) },
      { group: 'Crew', model: 'Focus Puller', kind: 'crew', quantity: 1, unitsStock: 3, unitsAvailable: 3, unitRatePaisa: rupees(0) },
      { group: 'Vehicle', model: 'SUV', kind: 'vehicle', quantity: 1, unitsStock: 2, unitsAvailable: 2, unitRatePaisa: rupees(0) },
      { group: 'Boxes / Bags', model: 'Pelican 1560 Hard Case', kind: 'box', quantity: 1, unitsStock: 4, unitsAvailable: 4, unitRatePaisa: rupees(500) },
      { group: 'Boxes / Bags', model: 'Lens Roll', kind: 'box', quantity: 1, unitsStock: 5, unitsAvailable: 5, unitRatePaisa: rupees(300) },
      { group: 'Boxes / Bags', model: 'Lighting Bag', kind: 'box', quantity: 1, unitsStock: 4, unitsAvailable: 4, unitRatePaisa: rupees(250) },
    ],
  },
  {
    id: 'BND-00014',
    name: 'Aputure 600D Pro Lighting Kit',
    category: 'Lighting',
    tags: ['Corporate', 'Studio'],
    bundleRatePaisa: rupees(16000),
    lines: [
      { group: 'Lighting', model: 'Aputure LS 600d Pro', kind: 'equipment', quantity: 2, unitsStock: 3, unitsAvailable: 1, blockedBy: 'On Rent', freesAd: ad(2026, 8, 11), unitRatePaisa: rupees(5000) },
      { group: 'Lighting', model: 'Aputure LS 300x', kind: 'equipment', quantity: 2, unitsStock: 4, unitsAvailable: 4, unitRatePaisa: rupees(2500) },
      { group: 'Lighting', model: 'Aputure Light Dome III', kind: 'equipment', quantity: 2, unitsStock: 3, unitsAvailable: 2, unitRatePaisa: rupees(600) },
      { group: 'Grip', model: 'Kupo Master C-Stand 40"', kind: 'equipment', quantity: 4, unitsStock: 8, unitsAvailable: 6, unitRatePaisa: rupees(250) },
      { group: 'Power', model: 'Aputure V-Mount Battery Plate', kind: 'equipment', quantity: 1, unitsStock: 2, unitsAvailable: 0, blockedBy: 'Reserved', freesAd: ad(2026, 8, 10), unitRatePaisa: rupees(400) },
      { group: 'Grip', model: 'Matthews Sandbag 25lb', kind: 'equipment', quantity: 1, unitsStock: 6, unitsAvailable: 6, unitRatePaisa: rupees(300) },
      { group: 'Boxes / Bags', model: 'Lighting Road Case', kind: 'box', quantity: 1, unitsStock: 3, unitsAvailable: 3, unitRatePaisa: rupees(900) },
      { group: 'Boxes / Bags', model: 'Stand Bag', kind: 'box', quantity: 1, unitsStock: 5, unitsAvailable: 5, unitRatePaisa: rupees(400) },
      { group: 'Boxes / Bags', model: 'Modifier Bag', kind: 'box', quantity: 1, unitsStock: 4, unitsAvailable: 4, unitRatePaisa: rupees(300) },
    ],
  },
  {
    id: 'BND-00011',
    name: 'DJI Inspire 3 Combo Kit',
    category: 'Drone',
    tags: ['Aerial', 'Feature'],
    bundleRatePaisa: rupees(28000),
    lines: [
      { group: 'Drone', model: 'DJI Inspire 3 Aircraft', kind: 'equipment', quantity: 1, unitsStock: 2, unitsAvailable: 1, unitRatePaisa: rupees(18000) },
      { group: 'Drone', model: 'DJI Zenmuse X9-8K Air Gimbal', kind: 'equipment', quantity: 1, unitsStock: 2, unitsAvailable: 1, unitRatePaisa: rupees(4500) },
      { group: 'Lens', model: 'DJI DL PZ 17-28mm T3.0', kind: 'equipment', quantity: 1, unitsStock: 2, unitsAvailable: 2, unitRatePaisa: rupees(1800) },
      { group: 'Lens', model: 'DJI DL 35mm F2.8', kind: 'equipment', quantity: 1, unitsStock: 2, unitsAvailable: 2, unitRatePaisa: rupees(1200) },
      { group: 'Power', model: 'DJI TB51 Intelligent Battery', kind: 'equipment', quantity: 4, unitsStock: 6, unitsAvailable: 2, blockedBy: 'On Rent', freesAd: ad(2026, 8, 12), unitRatePaisa: rupees(800) },
      { group: 'Storage', model: 'DJI PROSSD 1TB', kind: 'equipment', quantity: 1, unitsStock: 3, unitsAvailable: 3, unitRatePaisa: rupees(900) },
      { group: 'Crew', model: 'Drone Pilot', kind: 'crew', quantity: 1, unitsStock: 2, unitsAvailable: 2, unitRatePaisa: rupees(0) },
      { group: 'Boxes / Bags', model: 'DJI Inspire 3 Case', kind: 'box', quantity: 1, unitsStock: 2, unitsAvailable: 2, unitRatePaisa: rupees(2500) },
      { group: 'Boxes / Bags', model: 'TB51 Battery Case', kind: 'box', quantity: 1, unitsStock: 3, unitsAvailable: 3, unitRatePaisa: rupees(1500) },
    ],
  },
  {
    id: 'BND-00008',
    name: 'Podcast Studio Kit',
    category: 'Audio',
    tags: ['Studio', 'Corporate'],
    bundleRatePaisa: rupees(8000),
    lines: [
      { group: 'Audio', model: 'Shure SM7B', kind: 'equipment', quantity: 4, unitsStock: 6, unitsAvailable: 4, unitRatePaisa: rupees(900) },
      { group: 'Audio', model: 'RodeCaster Pro II', kind: 'equipment', quantity: 1, unitsStock: 2, unitsAvailable: 2, unitRatePaisa: rupees(3000) },
      { group: 'Audio', model: 'Cloudlifter CL-1', kind: 'equipment', quantity: 2, unitsStock: 2, unitsAvailable: 0, blockedBy: 'On Maintenance', freesAd: ad(2026, 8, 14), unitRatePaisa: rupees(500) },
      { group: 'Audio', model: 'Rode PSA1+ Boom Arm', kind: 'equipment', quantity: 4, unitsStock: 6, unitsAvailable: 6, unitRatePaisa: rupees(250) },
      { group: 'Audio', model: 'Sennheiser HD 280 Headphones', kind: 'equipment', quantity: 2, unitsStock: 8, unitsAvailable: 8, unitRatePaisa: rupees(100) },
      { group: 'Boxes / Bags', model: 'Microphone Case', kind: 'box', quantity: 1, unitsStock: 3, unitsAvailable: 3, unitRatePaisa: rupees(300) },
      { group: 'Boxes / Bags', model: 'Cable Bag', kind: 'box', quantity: 1, unitsStock: 4, unitsAvailable: 4, unitRatePaisa: rupees(200) },
      { group: 'Boxes / Bags', model: 'Accessory Case', kind: 'box', quantity: 1, unitsStock: 4, unitsAvailable: 4, unitRatePaisa: rupees(200) },
    ],
  },
  {
    id: 'BND-00007',
    name: 'Grip & Support Kit',
    category: 'Grip',
    tags: ['Studio', 'Feature'],
    bundleRatePaisa: rupees(12000),
    lines: [
      { group: 'Grip', model: 'Kupo Master C-Stand 40"', kind: 'equipment', quantity: 8, unitsStock: 12, unitsAvailable: 12, unitRatePaisa: rupees(900) },
      { group: 'Grip', model: 'Matthews Sandbag 25lb', kind: 'equipment', quantity: 8, unitsStock: 20, unitsAvailable: 20, unitRatePaisa: rupees(250) },
      { group: 'Support', model: 'Manfrotto Super Clamp', kind: 'equipment', quantity: 4, unitsStock: 10, unitsAvailable: 10, unitRatePaisa: rupees(500) },
      { group: 'Support', model: 'Avenger Grip Head', kind: 'equipment', quantity: 4, unitsStock: 10, unitsAvailable: 10, unitRatePaisa: rupees(450) },
      { group: 'Boxes / Bags', model: 'Grip Road Case', kind: 'box', quantity: 1, unitsStock: 3, unitsAvailable: 3, unitRatePaisa: rupees(700) },
      { group: 'Boxes / Bags', model: 'Stand Bag', kind: 'box', quantity: 2, unitsStock: 5, unitsAvailable: 5, unitRatePaisa: rupees(350) },
    ],
  },

  /* Archived — counted separately, outside the chip sum (§2). */
  {
    id: 'BND-00003',
    name: 'Canon C300 Mk II Legacy Kit',
    category: 'Camera',
    tags: ['Legacy'],
    archived: true,
    bundleRatePaisa: rupees(7000),
    lines: [
      { group: 'Camera', model: 'Canon C300 Mk II Body', kind: 'equipment', quantity: 1, unitsStock: 1, unitsAvailable: 1, unitRatePaisa: rupees(7000) },
      { group: 'Power', model: 'Canon BP-A60 Battery', kind: 'equipment', quantity: 2, unitsStock: 4, unitsAvailable: 4, unitRatePaisa: rupees(400) },
      { group: 'Boxes / Bags', model: 'Camera Hard Case', kind: 'box', quantity: 1, unitsStock: 2, unitsAvailable: 2, unitRatePaisa: rupees(400) },
    ],
  },
  {
    id: 'BND-00002',
    name: 'GoPro Hero 9 Action Pack',
    category: 'Camera',
    tags: ['Legacy', 'Travel'],
    archived: true,
    bundleRatePaisa: rupees(2200),
    lines: [
      { group: 'Camera', model: 'GoPro Hero 9 Black', kind: 'equipment', quantity: 2, unitsStock: 4, unitsAvailable: 4, unitRatePaisa: rupees(900) },
      { group: 'Accessory', model: 'GoPro Mount Set', kind: 'equipment', quantity: 2, unitsStock: 6, unitsAvailable: 6, unitRatePaisa: rupees(400) },
      { group: 'Boxes / Bags', model: 'Accessory Bag', kind: 'box', quantity: 1, unitsStock: 6, unitsAvailable: 6, unitRatePaisa: rupees(200) },
    ],
  },
]

/* ── derivation — everything the screens print comes from here ──────────── */

export interface DonutSegment {
  label: 'Available' | 'Reserved' | 'On Rent' | 'On Maintenance'
  value: number
}

export interface BundleFacts {
  equipment: number
  crew: number
  vehicle: number
  boxes: number
  /** §4.2 — `equipment + crew + vehicle + boxes`, by construction. */
  totalItems: number
  /** §4.3 — `Σ min(unitsAvailable, quantity)`. */
  readyItems: number
  blockedItems: number
  blockedLines: BundleLine[]
  /** §2.1 — exactly one state wins. */
  state: BundleState
  /** §6.2 — sums to `totalItems`; the first entry is the donut centre. */
  segments: DonutSegment[]
  /** §7 — `Σ unitRate × qty` over priced lines. Crew and vehicle are not priced here (§8). */
  sumOfPartsPaisa: Paisa
  savingPaisa: Paisa
  savingPct: number
  /** §9 — `null` where any priced line has no weight. Never 0. */
  totalWeightKg: number | null
}

const qtyOf = (b: BundleRecord, kind: BundleLineKind) =>
  b.lines.reduce((s, l) => (l.kind === kind ? s + l.quantity : s), 0)

/** §8/§10.4 — crew and vehicle are priced in the booking, not in the bundle rate. */
export const isPriced = (l: BundleLine) => l.kind === 'equipment' || l.kind === 'box'

export function factsOf(b: BundleRecord): BundleFacts {
  const equipment = qtyOf(b, 'equipment')
  const crew = qtyOf(b, 'crew')
  const vehicle = qtyOf(b, 'vehicle')
  const boxes = qtyOf(b, 'box')
  const totalItems = equipment + crew + vehicle + boxes

  const readyItems = b.lines.reduce((s, l) => s + Math.min(l.unitsAvailable, l.quantity), 0)
  const blockedItems = b.lines.reduce((s, l) => s + Math.max(0, l.quantity - l.unitsAvailable), 0)
  const blockedLines = b.lines.filter((l) => l.unitsAvailable < l.quantity)

  /*
   * §2.1 state precedence — evaluated top down, first match wins. Without this
   * a bundle that is both partially available and reserved would be counted in
   * two chips and the invariant in §2 could never hold.
   */
  const allInMaintenance = b.lines.some(
    (l) => l.blockedBy === 'On Maintenance' && l.unitsAvailable === 0 && l.quantity > 0,
  )
  const state: BundleState = b.booking?.state === 'out'
    ? 'On Rent'
    : b.booking?.state === 'reserved'
      ? 'Reserved'
      : allInMaintenance
        ? 'On Maintenance'
        : readyItems < totalItems
          ? 'Partially Available'
          : 'Available'

  /*
   * §6.1 — the donut counts **required items**, not stock units. A bundle out
   * with a client has all of its required items out; one committed to a future
   * booking has all of them reserved. Otherwise each short unit is attributed to
   * whatever is holding it.
   */
  let segments: DonutSegment[]
  if (state === 'On Rent') {
    segments = [
      { label: 'Available', value: 0 },
      { label: 'Reserved', value: 0 },
      { label: 'On Rent', value: totalItems },
      { label: 'On Maintenance', value: 0 },
    ]
  } else if (state === 'Reserved') {
    segments = [
      { label: 'Available', value: 0 },
      { label: 'Reserved', value: totalItems },
      { label: 'On Rent', value: 0 },
      { label: 'On Maintenance', value: 0 },
    ]
  } else {
    const short = (by: BlockedBy) =>
      b.lines.reduce((s, l) => (l.blockedBy === by ? s + Math.max(0, l.quantity - l.unitsAvailable) : s), 0)
    segments = [
      { label: 'Available', value: readyItems },
      { label: 'Reserved', value: short('Reserved') },
      { label: 'On Rent', value: short('On Rent') },
      { label: 'On Maintenance', value: short('On Maintenance') },
    ]
  }

  const sumOfPartsPaisa = b.lines.reduce(
    (s, l) => (isPriced(l) ? s + l.unitRatePaisa * l.quantity : s),
    0,
  ) as Paisa
  const savingPaisa = (sumOfPartsPaisa - b.bundleRatePaisa) as Paisa
  const savingPct = sumOfPartsPaisa === 0 ? 0 : roundHalfUp((savingPaisa / sumOfPartsPaisa) * 100)

  const priced = b.lines.filter(isPriced)
  const totalWeightKg = priced.every((l) => typeof l.weightKg === 'number')
    ? priced.reduce((s, l) => s + (l.weightKg ?? 0) * l.quantity, 0)
    : null

  return {
    equipment,
    crew,
    vehicle,
    boxes,
    totalItems,
    readyItems,
    blockedItems,
    blockedLines,
    state,
    segments,
    sumOfPartsPaisa,
    savingPaisa,
    savingPct,
    totalWeightKg,
  }
}

/** §4.3's ratio wears a different verb per state — the render says `22 / 22 Out`. */
export function ratioLabelOf(f: BundleFacts): string {
  if (f.state === 'On Rent') return `${f.totalItems} / ${f.totalItems} Out`
  if (f.state === 'Reserved') return `${f.totalItems} / ${f.totalItems} Reserved`
  return `${f.readyItems} / ${f.totalItems} Ready`
}

export const ACTIVE_BUNDLES = BUNDLES.filter((b) => !b.archived)
export const ARCHIVED_BUNDLES = BUNDLES.filter((b) => b.archived)

export const BUNDLE_STATES: BundleState[] = [
  'Available',
  'Reserved',
  'On Rent',
  'Partially Available',
  'On Maintenance',
]

export const STATE_COUNTS: Record<BundleState, number> = BUNDLE_STATES.reduce(
  (acc, s) => {
    acc[s] = ACTIVE_BUNDLES.filter((b) => factsOf(b).state === s).length
    return acc
  },
  {} as Record<BundleState, number>,
)

/**
 * §3 — a headline that deliberately overlaps two chips. Never summed with them.
 *
 * Note what is **not** counted: a bundle out with a client has every one of its
 * units unavailable, so a naive `blockedItems > 0` test folds every On Rent
 * bundle in and the card reads 4 where three bundles actually need a human. A
 * bundle that is out is doing its job.
 */
export const NEEDS_ATTENTION = ACTIVE_BUNDLES.filter((b) => {
  const s = factsOf(b).state
  return s === 'Partially Available' || s === 'On Maintenance'
}).length

export const ALL_CATEGORIES = Array.from(new Set(BUNDLES.map((b) => b.category))).sort()
export const ALL_TAGS = Array.from(new Set(BUNDLES.flatMap((b) => b.tags))).sort()

/** Category → registry glyph. Unknown categories fall back rather than crash. */
const CATEGORY_ICONS: Record<string, IconName> = {
  Camera: 'camera',
  Lens: 'photo',
  Lighting: 'sparkles',
  Audio: 'headset',
  Power: 'battery',
  Support: 'box',
  Storage: 'folder',
  Monitor: 'eye',
  Accessory: 'package',
  Grip: 'tool',
  Drone: 'activity',
  Crew: 'crew',
  Vehicle: 'truck',
  'Boxes / Bags': 'package',
}

export function iconFor(group: string): IconName {
  return CATEGORY_ICONS[group] ?? 'queues'
}

/* ── §1.1 · assertions that can fail, and say so ────────────────────────── */

/**
 * ⛔ Reported, never thrown. A module-scope `throw` runs before React mounts, so
 * no boundary catches it and the operator gets a blank screen — `lib/money.ts`
 * hit exactly that and fixed it the same way. §1.1 also insists the check be
 * honest: *"A green tick above false arithmetic is worse than no check, because
 * it trains everyone to stop reading it."*
 */
export const SEED_ERRORS: string[] = (() => {
  const errs: string[] = []

  const chipSum = BUNDLE_STATES.reduce((s, k) => s + STATE_COUNTS[k], 0)
  if (chipSum !== ACTIVE_BUNDLES.length) {
    errs.push(
      `§2: the five state chips sum to ${chipSum} but All reads ${ACTIVE_BUNDLES.length}. ` +
        'State precedence must let exactly one state win per bundle.',
    )
  }

  const ids = new Set<string>()
  for (const b of BUNDLES) {
    if (ids.has(b.id)) errs.push(`Duplicate bundle id ${b.id}.`)
    ids.add(b.id)

    const f = factsOf(b)

    if (f.equipment > f.totalItems) {
      errs.push(`§4.2: ${b.id} counts ${f.equipment} equipment against ${f.totalItems} total items.`)
    }
    if (f.equipment + f.crew + f.vehicle + f.boxes !== f.totalItems) {
      errs.push(`§4.2: ${b.id} breakdown does not sum to its total.`)
    }
    if (b.lines.filter((l) => l.kind === 'equipment').length === 0) {
      errs.push(`§14: ${b.id} has no equipment line.`)
    }

    const segSum = f.segments.reduce((s, x) => s + x.value, 0)
    if (segSum !== f.totalItems) {
      errs.push(`§6.2: ${b.id} donut segments sum to ${segSum} against ${f.totalItems} required items.`)
    }

    if (f.sumOfPartsPaisa < b.bundleRatePaisa) {
      errs.push(`§7: ${b.id} bundle rate exceeds its sum of parts, so the saving is negative.`)
    }

    for (const l of b.lines) {
      if (l.unitsAvailable > l.unitsStock) {
        errs.push(`${b.id} · ${l.model}: ${l.unitsAvailable} available against ${l.unitsStock} in stock.`)
      }
      if (l.unitsAvailable < l.quantity && !l.blockedBy) {
        errs.push(`§8.1: ${b.id} · ${l.model} is short but names no reason.`)
      }
      if (l.blockedBy && l.unitsAvailable >= l.quantity && b.booking === undefined) {
        errs.push(`§8.1: ${b.id} · ${l.model} is flagged ${l.blockedBy} while it has enough units free.`)
      }
    }
  }

  return errs
})()
