import type { IconName } from '../components/ui/Icon'
import type { BrandKey } from '../lib/status'
import { roundHalfUp } from '../lib/money'
import type { Paisa } from '../lib/money'
import { captureError } from '../lib/monitoring'

/**
 * **Tools** — registry and formulas, built against `03 Core Modules/Tools.md`
 * v3.1 (Build Locked) and its reference render `Tools.PNG`.
 *
 * ## Why this file is small and the render is not
 *
 * The render is a Tools *Center*: fifteen numbered categories and a stated 118
 * tools. Spec v3.1 §0 exists to demolish exactly that, and it is the newer
 * artefact — six of the fifteen categories are second front doors to modules
 * that already exist, and §1 states the rule that replaces them:
 *
 * > **Tools owns only what has no home elsewhere.** Anything with a module is
 * > deep-linked, never reimplemented.
 *
 * So this registry is not a menu of 118 things. It is the set §1 leaves
 * standing, and every entry declares which of three states it is in:
 *
 *  · `calculator` — Tools owns it, the maths is stated in §3/§5, it runs here.
 *  · `link`       — the owning module exists and is routed; Tools opens it and
 *                   carries **that module's** permissions, never its own (§8).
 *  · `blocked`    — in scope for Tools, not built, or waiting on a decision.
 *                   The reason is rendered. A tool nobody can use must say why
 *                   rather than sit there looking live.
 *
 * Nothing here is invented. Where the spec asks for a figure the product does
 * not hold — codec bitrates, battery draw, purchase prices — the field is an
 * input and the gap is stated, because §2.1's "reads the Inventory item master"
 * is not satisfiable: the item master in `data/inventory.ts` carries no sensor,
 * codec, watt-hour or draw field, and its own comment says purchase records are
 * not part of the equipment seed.
 */

/* ══ 1 · optics and production formulas ══════════════════════════════════
 *
 * These are §3's formulas, transcribed. They live in this file rather than in
 * `lib/` only because `lib/` is not this task's to add to — they are engine
 * code, not seed data, and should move to `lib/optics.ts` the moment that is
 * sanctioned. They are pure and unit-explicit so a screen cannot re-derive them
 * slightly differently, which is the whole reason §3 states them at all.
 */

export interface SensorFormat {
  key: 'ff' | 's35' | 'mft'
  label: string
  /** Sensor width, mm. */
  width: number
  /** Sensor height, mm. */
  height: number
  /** §3.3 — circle of confusion, mm. Stated by the spec for these three only. */
  coc: number
}

/**
 * §3.3 names three formats and gives each a circle of confusion. Dimensions are
 * the published format definitions, not a business figure: full frame *is*
 * 36 × 24. No fourth format is offered, because §3.3 supplies no CoC for one and
 * deriving it would be inventing the number the whole DOF result rests on.
 */
export const SENSOR_FORMATS: readonly SensorFormat[] = [
  { key: 'ff', label: 'Full Frame — 36 × 24 mm', width: 36, height: 24, coc: 0.029 },
  { key: 's35', label: 'Super 35 — 24.89 × 18.66 mm', width: 24.89, height: 18.66, coc: 0.019 },
  { key: 'mft', label: 'Micro Four Thirds — 17.3 × 13 mm', width: 17.3, height: 13, coc: 0.015 },
]

export function sensorFormat(key: string): SensorFormat {
  return SENSOR_FORMATS.find((s) => s.key === key) ?? (SENSOR_FORMATS[0] as SensorFormat)
}

/**
 * §3.1 — `crop = 43.27 ÷ √(sensorW² + sensorH²)`.
 * 43.27 is the full-frame diagonal in mm, so full frame returns 1.0.
 */
export function cropFactor(width: number, height: number): number {
  const diagonal = Math.sqrt(width * width + height * height)
  return diagonal > 0 ? 43.27 / diagonal : Number.NaN
}

/** §3.2 — horizontal and vertical field of view, radians. */
export function fieldOfView(width: number, height: number, focal: number) {
  return {
    horizontal: 2 * Math.atan(width / (2 * focal)),
    vertical: 2 * Math.atan(height / (2 * focal)),
  }
}

/**
 * §3.2 — `width at distance = 2 × distance × tan(FOV ÷ 2)`. Distance in metres
 * in, metres out. "*Width at distance* is the one an operator actually wants:
 * how much of the room fits at 3 m."
 */
export function coverageAtDistance(fovRadians: number, distanceM: number): number {
  return 2 * distanceM * Math.tan(fovRadians / 2)
}

export interface DofResult {
  /** Metres. */
  hyperfocal: number
  near: number
  /** `Infinity` when the subject is at or beyond the hyperfocal distance. */
  far: number
  total: number
}

/**
 * §3.3 — focal and CoC in mm, subject distance in metres, results in metres.
 *
 * ```
 * H    = (focal² ÷ (aperture × coc)) + focal
 * near = (H × s) ÷ (H + (s − focal))
 * far  = (H × s) ÷ (H − (s − focal))     — infinite when s ≥ H
 * ```
 */
export function depthOfField(focal: number, aperture: number, coc: number, subjectM: number): DofResult {
  const h = (focal * focal) / (aperture * coc) + focal
  const s = subjectM * 1000
  const near = (h * s) / (h + (s - focal))
  const farDenominator = h - (s - focal)
  const far = s >= h || farDenominator <= 0 ? Infinity : (h * s) / farDenominator
  return {
    hyperfocal: h / 1000,
    near: near / 1000,
    far: far === Infinity ? Infinity : far / 1000,
    total: far === Infinity ? Infinity : (far - near) / 1000,
  }
}

/**
 * §3.4 — `ND stops = log₂(ND number)`.
 *
 * The spec asserts both notations against one formula: ND8 = 3 stops and
 * ND1.2 = 4 stops. Those agree only once optical density is converted to a
 * filter factor first — `10^1.2 ≈ 15.85`, and `log₂(15.85) = 3.99`. So the one
 * stated formula is applied to both, rather than a second formula being
 * invented for the second notation.
 */
export function ndStopsFromFactor(factor: number): number {
  return Math.log2(factor)
}

export function ndFactorFromDensity(density: number): number {
  return Math.pow(10, density)
}

/** §3.4 — `EV = log₂(aperture² ÷ shutter) + log₂(100 ÷ ISO)`. */
export function exposureValue(aperture: number, shutterSeconds: number, iso: number): number {
  return Math.log2((aperture * aperture) / shutterSeconds) + Math.log2(100 / iso)
}

/** §3.5 — `shutter speed = 1 ÷ (fps × 360 ÷ angle)`. Returns seconds. */
export function shutterSecondsFromAngle(fps: number, angle: number): number {
  return 1 / ((fps * 360) / angle)
}

/** §3.5, the other direction — a shutter of `1/denominator` back to degrees. */
export function angleFromShutterDenominator(fps: number, denominator: number): number {
  return (360 * fps) / denominator
}

export interface FrameRate {
  key: string
  label: string
  /** Frames per timecode second — 29.97 counts 30. */
  nominal: number
  /** Real frames per real second, for durations. */
  actual: number
  /** §3.6 — drop-frame exists at 29.97 and 59.94 and nowhere else. */
  dropCapable: boolean
}

export const FRAME_RATES: readonly FrameRate[] = [
  { key: '23.976', label: '23.976 fps', nominal: 24, actual: 24000 / 1001, dropCapable: false },
  { key: '24', label: '24 fps', nominal: 24, actual: 24, dropCapable: false },
  { key: '25', label: '25 fps (PAL)', nominal: 25, actual: 25, dropCapable: false },
  { key: '29.97', label: '29.97 fps', nominal: 30, actual: 30000 / 1001, dropCapable: true },
  { key: '30', label: '30 fps', nominal: 30, actual: 30, dropCapable: false },
  { key: '50', label: '50 fps', nominal: 50, actual: 50, dropCapable: false },
  { key: '59.94', label: '59.94 fps', nominal: 60, actual: 60000 / 1001, dropCapable: true },
  { key: '60', label: '60 fps', nominal: 60, actual: 60, dropCapable: false },
]

export function frameRate(key: string): FrameRate {
  return FRAME_RATES.find((r) => r.key === key) ?? (FRAME_RATES[1] as FrameRate)
}

/** Frames dropped per minute: 2 at 29.97, 4 at 59.94. */
function dropCount(rate: FrameRate): number {
  return rate.nominal === 30 ? 2 : 4
}

/**
 * §3.6 — `frames = ((hh × 3600) + (mm × 60) + ss) × fps + ff`, then the
 * drop-frame correction.
 *
 * Drop-frame drops *labels*, not frames: two counts per minute, except every
 * tenth minute. §3.6 calls getting this wrong "the single most common source of
 * a wrong delivery", so it is stated rather than assumed.
 */
export function timecodeToFrames(
  hh: number,
  mm: number,
  ss: number,
  ff: number,
  rate: FrameRate,
  drop: boolean,
): number {
  const base = (hh * 3600 + mm * 60 + ss) * rate.nominal + ff
  if (!drop || !rate.dropCapable) return base
  const dropped = dropCount(rate)
  const totalMinutes = hh * 60 + mm
  return base - dropped * (totalMinutes - Math.floor(totalMinutes / 10))
}

export interface Timecode {
  hh: number
  mm: number
  ss: number
  ff: number
}

/** The inverse of `timecodeToFrames`, drop-frame included. */
export function framesToTimecode(frames: number, rate: FrameRate, drop: boolean): Timecode {
  let n = Math.max(0, Math.floor(frames))
  if (drop && rate.dropCapable) {
    const dropped = dropCount(rate)
    const perTenMinutes = rate.nominal * 600 - dropped * 9
    const perMinute = rate.nominal * 60 - dropped
    const tens = Math.floor(n / perTenMinutes)
    const remainder = n % perTenMinutes
    n += dropped * 9 * tens
    if (remainder >= dropped) n += dropped * Math.floor((remainder - dropped) / perMinute)
  }
  return {
    ff: n % rate.nominal,
    ss: Math.floor(n / rate.nominal) % 60,
    mm: Math.floor(n / (rate.nominal * 60)) % 60,
    hh: Math.floor(n / (rate.nominal * 3600)),
  }
}

/** §3.7 — `GB = (bitrate Mbps × seconds) ÷ 8 ÷ 1000`. */
export function storageGb(bitrateMbps: number, seconds: number): number {
  return (bitrateMbps * seconds) / 8 / 1000
}

/**
 * §3.8 — `runtime hours = (battery Wh ÷ draw W) × 0.85`, where 0.85 is the
 * usable share of a cell's rated capacity.
 */
export const USABLE_CAPACITY = 0.85

export function batteryRuntimeHours(wattHours: number, drawWatts: number): number {
  return (wattHours / drawWatts) * USABLE_CAPACITY
}

/** §3.8 — `batteries needed = ceil(shoot hours ÷ runtime) + 1` spare. */
export function batteriesNeeded(shootHours: number, runtimeHours: number): number {
  return Math.ceil(shootHours / runtimeHours) + 1
}

/* ══ 1b · depreciation — `10_TOOLS.md` §10.2 ═════════════════════════════
 *
 * Same placement argument as the optics block above: this is engine code, not
 * seed data, and belongs in `lib/depreciation.ts` the moment adding to `lib/`
 * is sanctioned for this pass. It is here so that `DepreciationCalculator.tsx`
 * obeys Law 1 — *"Pages never implement business logic"* — today rather than
 * carrying a schedule loop inside a component.
 *
 * ## What this deliberately does NOT know
 *
 * **Asset life and salvage are inputs, never defaults.** §10.2's closing note
 * says *"Defaults come from Settings; per-asset values override"* — and there
 * is no such setting. `11_SETTINGS.md` §11.2 gives Financial *tax & fiscal
 * year, currency & terms, deposit % per category, membership matrix,
 * cancellation fee tiers*, and none of the eight sections carries a
 * depreciation default; `lib/settingsStore.ts` has no key for one either.
 * `data/addEquipment.ts`'s `DEPRECIATION_UNAVAILABLE_REASON` already records
 * why: *"depreciation groups are undefined … none may be invented here."*
 * So this module exposes no default life, no default salvage, and no
 * asset-class table. A caller that has not been given a life gets nothing —
 * never a plausible five years.
 *
 * The **method** is a different kind of fact. Straight line is arithmetic
 * stated by its own name, not a ruling about Babin's accounts, so the formula
 * is safe to write down. Which method his accountant applies to which asset
 * class is the unruled part, and that is exactly the IRD pool question the
 * screen refuses to answer.
 */

/** Everything the schedule needs. No field is optional — see the note above. */
export interface DepreciationInput {
  /** Acquisition cost. */
  costPaisa: Paisa
  /** Residual value at the end of the useful life. May be zero, never assumed. */
  salvagePaisa: Paisa
  /** Useful life in whole years. Supplied by the user; never seeded. */
  lifeYears: number
}

export interface DepreciationYear {
  /** 1-based year of the asset's life. */
  year: number
  openingPaisa: Paisa
  depreciationPaisa: Paisa
  /** Written-down value at the year's close. */
  closingPaisa: Paisa
}

/**
 * Straight-line schedule: `annual = (cost − salvage) ÷ life`, applied whole.
 *
 * Two properties the table below depends on, both deliberate:
 *
 *  · **Every step is a whole rupee**, following `lib/money.ts` §2.4's "Half Up,
 *    applied at each displayed step". A schedule whose printed rows do not sum
 *    to the printed total is the same defect §2.8 exists to prevent.
 *  · **The final year absorbs the rounding remainder**, so the last closing WDV
 *    is exactly the salvage value the user typed. Spreading the remainder
 *    instead would leave the asset ending at Rs 1 above or below its own stated
 *    residual, which no accountant would accept and no reader could explain.
 *
 * Returns `[]` for input the method cannot describe — a life below one year, a
 * salvage above cost, a non-finite figure. An empty schedule renders as a
 * stated reason, never as a table of zeros.
 */
export function straightLineSchedule(i: DepreciationInput): DepreciationYear[] {
  const life = Math.floor(i.lifeYears)
  if (!Number.isFinite(life) || life < 1) return []
  if (!Number.isFinite(i.costPaisa) || !Number.isFinite(i.salvagePaisa)) return []
  if (i.costPaisa <= 0 || i.salvagePaisa < 0 || i.salvagePaisa > i.costPaisa) return []

  const depreciable = i.costPaisa - i.salvagePaisa
  const perYear = (roundHalfUp(depreciable / life / 100) * 100) as Paisa

  const rows: DepreciationYear[] = []
  let opening = i.costPaisa
  for (let year = 1; year <= life; year += 1) {
    const last = year === life
    const charge = (last ? opening - i.salvagePaisa : Math.min(perYear, opening - i.salvagePaisa)) as Paisa
    const closing = (opening - charge) as Paisa
    rows.push({ year, openingPaisa: opening, depreciationPaisa: charge, closingPaisa: closing })
    opening = closing
  }
  return rows
}

/**
 * §10.2's "Defaults come from Settings" affordance, rendered as unavailable.
 *
 * Stated once here so the screen and any future Settings section quote the same
 * sentence rather than drifting into two half-explanations.
 */
export const DEPRECIATION_DEFAULTS_UNAVAILABLE_REASON =
  'TODO(decision) — §10.2 says "Defaults come from Settings", but no Settings section carries depreciation defaults: 11_SETTINGS.md §11.2 lists tax & fiscal year, currency & terms, deposit % per category, membership matrix and cancellation tiers, and none of the eight sections is one. Life and salvage are required input here until an accountant supplies the asset lives (data/addEquipment.ts DEPRECIATION_UNAVAILABLE_REASON asks the same question).'

/**
 * §10.2's second tab. Blocked, not unbuilt — the distinction matters.
 *
 * Nothing in this repository names an IRD depreciation pool, and no spec in
 * `updated mds/` supplies pool classes or their statutory rates. Building the
 * tab from generally-known Nepal IRD rates would be inventing the one product
 * decision the tab is about, which `CLAUDE.md` forbids outright. The tab
 * therefore renders this sentence rather than a pool table nobody authorised.
 */
export const IRD_POOL_BLOCKED_REASON =
  'TODO(decision) — the IRD pool method needs its pool classes and their statutory rates. Nothing in this build names an IRD depreciation pool (the only IRD reference in src/ is Settings’ "Tax office" row, whose own note reads "IRD registration details were never supplied for this build"), and no spec in updated mds/ supplies a rate. Typing in generally-known rates would be inventing a tax position on Babin’s behalf.'

/* ══ 2 · the registry ════════════════════════════════════════════════════ */

export type CalcKey =
  | 'crop'
  | 'fov'
  | 'dof'
  | 'nd'
  | 'shutter'
  | 'timecode'
  | 'storage'
  | 'battery'
  | 'price'
  | 'discount'

export type ToolAction =
  /** Tools owns it; the maths is §3 or §5 and runs on this page. */
  | { kind: 'calculator'; calc: CalcKey }
  /** §1 — opens the owning module, which keeps its own permissions (§8). */
  | { kind: 'link'; to: string; owner: string }
  /** In scope, not usable. The reason renders; nothing pretends to work. */
  | { kind: 'blocked'; reason: string }

export type GroupKey = 'camera' | 'finance' | 'production' | 'deeplink'

export interface ToolGroup {
  key: GroupKey
  title: string
  /** Why this group exists at all, in the spec's own terms. */
  note: string
  accent: BrandKey
}

export const TOOL_GROUPS: readonly ToolGroup[] = [
  {
    key: 'camera',
    title: 'Camera & Lens',
    note: '§2 — the valuable half of the render, and valuable because nothing else in the product does it. Formulas are stated in §3 so every implementation agrees.',
    accent: 'primary',
  },
  {
    key: 'finance',
    title: 'Rental & Finance',
    note: '§5 — every one calls the owning engine. A rental calculator that disagrees with the booking page is worse than none, because someone will quote from it.',
    accent: 'success',
  },
  {
    key: 'production',
    title: 'Production, Labels & QR',
    note: '§1 — label and QR generation stay with Tools. Packing lists and equipment checklists already have a home and are deep-linked.',
    accent: 'progress',
  },
  {
    key: 'deeplink',
    title: 'Deep links',
    note: '§1 — anything with a module is opened there, never reimplemented. Each carries the owning module’s permissions, not this page’s.',
    accent: 'neutral',
  },
]

export interface Tool {
  id: string
  name: string
  blurb: string
  icon: IconName
  group: GroupKey
  action: ToolAction
  /**
   * A money tool. Locked rule (e): money-blind roles get the entry **omitted
   * from the array before render**, never greyed or masked.
   */
  money?: true
  /** Rendered as a stated open question — §12 needs Babin, not a guess. */
  decision?: string
}

export const TOOLS: readonly Tool[] = [
  /* ── Camera & Lens — §3. All eight run. ───────────────────────────────── */
  {
    id: 'crop',
    name: 'Crop Factor & Equivalence',
    blurb: 'Sensor size to crop factor, equivalent focal length and equivalent T-stop.',
    icon: 'camera',
    group: 'camera',
    action: { kind: 'calculator', calc: 'crop' },
  },
  {
    id: 'fov',
    name: 'Field of View',
    blurb: 'Horizontal and vertical angle, and how much of the room fits at a distance.',
    icon: 'eye',
    group: 'camera',
    action: { kind: 'calculator', calc: 'fov' },
  },
  {
    id: 'dof',
    name: 'Depth of Field',
    blurb: 'Near, far, total depth and hyperfocal, from the sensor’s circle of confusion.',
    icon: 'photo',
    group: 'camera',
    action: { kind: 'calculator', calc: 'dof' },
  },
  {
    id: 'nd',
    name: 'ND & Exposure',
    blurb: 'Both ND notations — filter factor and optical density — and exposure value.',
    icon: 'sun',
    group: 'camera',
    action: { kind: 'calculator', calc: 'nd' },
  },
  {
    id: 'shutter',
    name: 'Shutter Angle',
    blurb: 'Angle to shutter speed and back. 24 fps at 180° is 1/48.',
    icon: 'video',
    group: 'camera',
    action: { kind: 'calculator', calc: 'shutter' },
  },
  {
    id: 'timecode',
    name: 'Timecode',
    blurb: 'Timecode to frames and back, with drop-frame stated at 29.97 and 59.94.',
    icon: 'timer',
    group: 'camera',
    action: { kind: 'calculator', calc: 'timecode' },
  },
  {
    id: 'storage',
    name: 'Storage',
    blurb: 'Card and drive space from bitrate and running time.',
    icon: 'folder',
    group: 'camera',
    action: { kind: 'calculator', calc: 'storage' },
  },
  {
    id: 'battery',
    name: 'Battery Runtime',
    blurb: 'Runtime from watt-hours and draw, and how many batteries the shoot needs.',
    icon: 'battery',
    group: 'camera',
    action: { kind: 'calculator', calc: 'battery' },
  },

  /* ── Rental & Finance — §5. Engines only. ─────────────────────────────── */
  {
    id: 'price',
    name: 'Rental Price & VAT',
    blurb: 'Subtotal, discount, taxable, VAT and total — straight from the Financial Engine.',
    icon: 'dollar',
    group: 'finance',
    action: { kind: 'calculator', calc: 'price' },
    money: true,
  },
  {
    id: 'discount',
    name: 'Discount Check',
    blurb: 'Whether a number is a valid discount at all — 0 to 100%. The old reason gate and 25% cap were removed 31 Aug 2026.',
    icon: 'receipt',
    group: 'finance',
    action: { kind: 'calculator', calc: 'discount' },
    money: true,
  },
  {
    id: 'depreciation',
    name: 'Depreciation',
    blurb: 'Written-down value of an asset over its life.',
    icon: 'chart',
    group: 'finance',
    /*
     * Was `blocked`. `10_TOOLS.md` §10.2 gives Depreciation its own Tools card
     * and route, so §1's rule now applies to it — *"anything with a module is
     * deep-linked, never reimplemented"* — and a second implementation inside
     * this suite is exactly what §1 exists to prevent. The blocked reason it
     * used to carry (no purchase price, no purchase date) has not gone away;
     * it moved onto the screen that owns the question, where cost and date are
     * required input rather than a missing seed field.
     */
    action: { kind: 'link', to: '/tools/depreciation', owner: 'Tools ▸ Depreciation' },
    money: true,
  },
  {
    id: 'profit',
    name: 'Profit & Margin',
    blurb: 'Margin on a booking against what the gear and crew cost.',
    icon: 'chart',
    group: 'finance',
    action: {
      kind: 'blocked',
      reason: 'Cost of goods is not modelled. Nothing in the build records what a rental costs to fulfil, so a margin would be a guess with a rupee sign on it.',
    },
    money: true,
  },
  {
    id: 'currency',
    name: 'Currency Conversion',
    blurb: 'Convert a foreign-currency quote to NPR.',
    icon: 'card',
    group: 'finance',
    action: {
      kind: 'blocked',
      reason: '§5 requires the owning Currencies engine. There is no rate source in the build, and a hardcoded rate is a wrong number that looks right.',
    },
    money: true,
  },

  /* ── Production, Labels & QR — §1 and §4. ─────────────────────────────── */
  {
    id: 'packing-list',
    name: 'Packing List',
    blurb: 'The pack sheet for a booking.',
    icon: 'checklist',
    group: 'production',
    action: { kind: 'link', to: '/operations?queue=packing', owner: 'Operations ▸ Packing' },
  },
  {
    id: 'equipment-checklist',
    name: 'Equipment Checklist',
    blurb: 'The generated checklist for a job.',
    icon: 'file',
    group: 'production',
    action: { kind: 'link', to: '/documents', owner: 'Documents' },
  },
  {
    id: 'labels',
    name: 'Labels, QR & Barcode',
    blurb: 'Print equipment, SKU, shelf and case labels.',
    icon: 'package',
    group: 'production',
    action: {
      kind: 'blocked',
      reason:
        '§1 keeps this with Tools — it has no other home — but nothing in the build issues a code. The scanner (⌘B) reads them; no screen generates or prints one yet.',
    },
  },
  {
    id: 'vehicle-loading',
    name: 'Vehicle Loading Planner',
    blurb: 'Does this fit in the van — cases and weights against the vehicle.',
    icon: 'truck',
    group: 'production',
    action: {
      kind: 'blocked',
      reason:
        '§4 calls this "the one clearly yours", using weights the item master already holds. It does not hold them: there is no weight or dimension field on an item, and no Transport module to name a vehicle.',
    },
  },
  {
    id: 'shot-list',
    name: 'Shot List & Call Sheet',
    blurb: 'Production paperwork for a shoot day.',
    icon: 'file',
    group: 'production',
    action: {
      kind: 'blocked',
      reason: 'Open — §12. A call sheet is a production document the client’s AD normally writes.',
    },
    decision:
      'Do clients ask you for call sheets and shot lists, or is that their AD’s job? It decides whether this is a free tool, a paid service line, or nothing at all. §4 and §12 both flag it, unanswered.',
  },

  /* ── Deep links — §1. Permissions belong to the owner, not to Tools. ──── */
  {
    id: 'documents',
    name: 'Document Generator',
    blurb: 'Every generated agreement, quote and invoice.',
    icon: 'file',
    group: 'deeplink',
    action: { kind: 'link', to: '/documents', owner: 'Finance ▸ Documents' },
  },
  {
    id: 'reports',
    name: 'Reports',
    blurb: 'Finance, inventory and client reporting.',
    icon: 'chart',
    group: 'deeplink',
    action: { kind: 'link', to: '/reports', owner: 'Reports' },
  },
  {
    id: 'backup',
    name: 'Backup & Restore',
    blurb: 'Scheduled backups and restore points.',
    icon: 'refresh',
    group: 'deeplink',
    /* `/admin/backup` still resolves (App.tsx keeps every shipped URL alive as
       a redirect, Law 3) but the screen's home is nav item 10 now — a deep link
       that lands on a redirect is one hop of nothing. */
    action: { kind: 'link', to: '/tools/backup', owner: 'Tools ▸ Backup & Restore' },
  },
  {
    id: 'diagnostics',
    name: 'Diagnostics',
    blurb: 'Services, jobs, sync and incidents.',
    icon: 'activity',
    group: 'deeplink',
    action: { kind: 'link', to: '/system', owner: 'System Monitor' },
  },
  {
    id: 'serial-lookup',
    name: 'Serial Lookup',
    blurb: 'Find a unit by serial and see where it is.',
    icon: 'search',
    group: 'deeplink',
    action: { kind: 'link', to: '/inventory', owner: 'Inventory' },
  },
  {
    id: 'equipment-utilities',
    name: 'Equipment Health & Warranty',
    blurb: 'Service history, warranty and maintenance state.',
    icon: 'tool',
    group: 'deeplink',
    action: { kind: 'link', to: '/inventory', owner: 'Inventory ▸ Maintenance' },
  },
  {
    id: 'integrations',
    name: 'API & Integrations',
    blurb: 'API keys, webhooks and connected services.',
    icon: 'plug',
    group: 'deeplink',
    action: {
      kind: 'blocked',
      reason: '§0 places this in Administration ▸ Integrations. That screen is not built, so there is nothing to open — and Tools must not grow a second one (§1).',
    },
  },
  {
    id: 'import-export',
    name: 'Import / Export',
    blurb: 'Bring data in, take data out.',
    icon: 'upload',
    group: 'deeplink',
    action: {
      kind: 'blocked',
      reason: '§0 — import belongs to each module, not to a central centre. No module exposes one yet, so there is no destination to send you to.',
    },
  },
  {
    id: 'bulk',
    name: 'Bulk Operations',
    blurb: 'Edit, update or retire many records at once.',
    icon: 'queues',
    group: 'deeplink',
    action: {
      kind: 'blocked',
      reason: '§1 deep-links bulk operations to the owning module’s own table. No module offers multi-select editing yet.',
    },
  },
]

/* ══ 3 · what happened to the render's fifteen categories ════════════════ */

export interface Disposition {
  category: string
  outcome: string
  tone: 'kept' | 'moved' | 'cut'
}

/**
 * The render's grid, category by category, against §0's table and §1's rule.
 * Rendered on the page: a build that silently drops thirteen of fifteen tiles
 * looks like an unfinished copy of the render rather than a decision.
 */
export const RENDER_DISPOSITION: readonly Disposition[] = [
  { category: '01 QR & Barcode Tools', outcome: 'Stays with Tools (§1) — not built', tone: 'kept' },
  { category: '02 Label Printing', outcome: 'Stays with Tools (§1) — not built', tone: 'kept' },
  { category: '03 Document Generator', outcome: 'Deep-links to Finance ▸ Documents', tone: 'moved' },
  { category: '04 Import / Export Center', outcome: 'Deep-links to each module’s own import', tone: 'moved' },
  { category: '05 Bulk Operations', outcome: 'Deep-links to the owning module’s table', tone: 'moved' },
  { category: '06 File Converter', outcome: 'Cut (§1) — real cost, no rental value', tone: 'cut' },
  { category: '07 Currency & Tax Tools', outcome: 'Stays, but calls the Finance engines (§5)', tone: 'kept' },
  { category: '08 Equipment Utilities', outcome: 'Deep-links to Inventory ▸ Maintenance', tone: 'moved' },
  { category: '09 Camera & Lens Tools', outcome: 'Stays — built here, all eight (§3)', tone: 'kept' },
  { category: '10 Production Tools', outcome: 'Split — checklists deep-link, shot list open (§12)', tone: 'kept' },
  { category: '11 AI Utilities', outcome: 'Gated on the data policy, Administration §21.2 unanswered', tone: 'cut' },
  { category: '12 Backup & Restore', outcome: 'Deep-links to Administration ▸ Backup', tone: 'moved' },
  { category: '13 API & Integrations', outcome: 'Deep-links to Administration ▸ Integrations', tone: 'moved' },
  { category: '14 Diagnostics', outcome: 'Deep-links to System Monitor', tone: 'moved' },
  { category: '15 Reports Shortcut', outcome: 'Deep-links to Reports', tone: 'moved' },
]

/* ══ 4 · invariants, reported not thrown ═════════════════════════════════ */

/**
 * §6's count invariant: `Active + Inactive = Total Tools`, and favourite and
 * recently-used are **flags that overlap active, never segments beside it**.
 *
 * The render fails this twice — its donut reads 98 + 6 = 104 against a stated
 * 118, and its category counts sum to 106. Both figures are unreachable here
 * because the donut is computed from this array rather than typed beside it,
 * but the check is kept so a future edit that hardcodes a total fails loudly.
 *
 * Reported, never thrown: a module-scope throw runs before React mounts and
 * blanks the app with no message. Same pattern as `data/expenseReports.ts`.
 */
export const SEED_ERRORS: string[] = (() => {
  const errors: string[] = []

  const available = TOOLS.filter((t) => t.action.kind !== 'blocked').length
  const unavailable = TOOLS.filter((t) => t.action.kind === 'blocked').length
  if (available + unavailable !== TOOLS.length) {
    errors.push(
      `Tool counts do not reconcile: ${available} available + ${unavailable} unavailable is not ${TOOLS.length} registered. §6 requires Active + Inactive = Total.`,
    )
  }

  const ids = TOOLS.map((t) => t.id)
  const duplicate = ids.find((id, i) => ids.indexOf(id) !== i)
  if (duplicate) errors.push(`Two tools share the id "${duplicate}"; ids key the favourites store, so they must be unique.`)

  const orphan = TOOLS.find((t) => !TOOL_GROUPS.some((g) => g.key === t.group))
  if (orphan) errors.push(`Tool "${orphan.name}" is in group "${orphan.group}", which no group declares — it would never render.`)

  return errors
})()

if (SEED_ERRORS.length > 0) {
  console.error(SEED_ERRORS.join(' '))
  captureError(new Error(SEED_ERRORS.join(' ')), { where: 'seed.tools' })
}

/** localStorage key for the favourites flag. §6 — a flag, never a segment. */
export const FAVOURITES_KEY = 'babin.tools.favourites'

export function readFavourites(): string[] {
  try {
    const raw = window.localStorage.getItem(FAVOURITES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const known = new Set(TOOLS.map((t) => t.id))
    return parsed.filter((v): v is string => typeof v === 'string' && known.has(v))
  } catch {
    return []
  }
}

export function writeFavourites(ids: string[]): void {
  try {
    window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify(ids))
  } catch {
    /* Private mode or a full quota. Favouriting is a convenience, never a write
       the operator depends on, so a failure here is silent by design. */
  }
}
