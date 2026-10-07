/**
 * Calendar Workspace — the screen's vocabulary, and what is left of its seed.
 *
 * ## 4 Sep 2026 · the bars, the rail figures and the festivals went live or went
 *
 * `modules/calendar/Calendar.tsx` had zero imports from `lib/queries` or
 * `lib/supabase`: every bar, every rail number and every festival on the page
 * came from this file, under today's real date, beside a Dashboard reading the
 * live database. The two contradicted each other in front of the operator.
 *
 * What this file still owns is the screen's **vocabulary** — the view names, the
 * bar kinds and their skins, the layer names, the zoom steps, the quick actions,
 * the legend, the shortcuts. Those are design facts and have no database.
 *
 * What it no longer owns is any **assertion about the business**:
 *
 *  - `ROWS` is empty. It carried a fleet, a crew roster and two warehouse bays
 *    that do not exist (0 `vehicles`, 0 `crew_profiles_v2`, 0 `product_units`).
 *    The transcription survives as `ARCHIVED_RENDER_ROWS` — Law 3, archive, do
 *    not delete — and is not rendered.
 *  - `HOLIDAYS` is empty, for two independent reasons; see its own note.
 *  - `EVENT_DETAIL` is empty. It was the render's one open booking, keyed by
 *    booking NUMBER, and the page now draws live bookings — so a live `B-715`
 *    would have inherited invented crew, a vehicle and a shoot in Dolpa.
 *  - `TODAY_SUMMARY` / `UPCOMING` no longer carry values. They are slots now:
 *    each row either names a live count the screen fetches, or states why there
 *    is no figure (Rulings §8 — never a literal, never a plausible zero).
 *
 * ⚠ **Spec-derived** — `03 Core Modules/Calendar.md` v3.2 (Build Locked), now
 * reconciled against the two `03 Core Modules` renders (`Calendar.PNG` and
 * `Calendar - Full View.PNG`).
 *
 * Three deliberate departures from those renders, each forced by Foundation:
 *
 *  1. **No purple.** §4.2 bans purple / violet / cyan / teal / indigo outright.
 *     The renders draw Sub-Rental bars in purple; they move to the **gold
 *     outline** §4.2 reserves for exactly that ("Gold, outline only —
 *     sub-rental, partner equipment"). The renders' purple Utilization KPI is
 *     moot — the KPI band was removed from the screen on 12 Aug 2026.
 *  2. **Dates are AD instants, never pre-rendered BS strings.** The renders
 *     label the same week "10–16 Shrawan"; the Date Engine's anchor
 *     (16 Jul 2026 = 1 Shrawan 2083) makes it 11–17. Nothing here stores a BS
 *     string — every BS label is produced by `lib/bs.ts` at render time, so the
 *     screen cannot disagree with the rest of the product.
 *  3. **No money.** Foundation §8.3 — the Warehouse role sees no financial
 *     figure anywhere. The one money-adjacent row (`Payment Due`) is marked
 *     `money: true` so the screen can omit it structurally rather than mask it.
 */

import type { IconName } from '../components/ui/Icon'
import { getBusinessToday } from '../lib/bs'
import { quotesExpiring, todaysIncoming, todaysOutgoing } from '../lib/queries/bookings'
import { invoicesDueInPeriod } from '../lib/queries/finance'
import type { ListFilters } from '../lib/queries/listQuery'
import { overDays, periodRange, type LivePeriod } from './today'

/*
 * The operating day, resolved once when this module loads, from the real
 * clock in Kathmandu (`lib/bs.ts`'s `getBusinessToday`). It replaced an
 * imported `TODAY` constant frozen at 31 Jul 2026.
 */
const TODAY = getBusinessToday()


/* ── time ──────────────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000

/**
 * Plain **AD** day arithmetic, relative to the one `TODAY` in `lib/bs.ts`.
 * Nepali date maths never happens here — `toBs` is the only converter and it is
 * called at render time.
 */
export function adDay(offset: number): Date {
  return new Date(TODAY.getTime() + offset * DAY_MS)
}

/** Whole days between two UTC-midnight AD dates. */
export function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS)
}

/* ── views ─────────────────────────────────────────────────────────────── */

/**
 * §5.1 draws the tab row as `[Month][Week][Timeline][Availability]`, and the
 * spec's opening line — *"Simple month view by default; other views are
 * options"* — makes Month the landing view rather than the timeline.
 *
 * Two consequences, both deliberate:
 *  · `Resource Timeline` is now spelled **Timeline**. The view is unchanged —
 *    same rows, same bars, same zoom steps — only the tab label moved.
 *  · The old `Day` tab is gone. Its whole job was "show me one day", which
 *    §5.1 now gives to the day peek / bottom sheet / phone agenda that a day
 *    click opens. Keeping both would put the same day on screen two ways.
 */
export const VIEWS = ['Month', 'Week', 'Timeline', 'Availability'] as const
export type ViewName = (typeof VIEWS)[number]

/** §5.1 — "Simple month view by default". */
export const DEFAULT_VIEW: ViewName = 'Month'

/**
 * The tab row each width may show.
 *
 * §5.1's tablet box draws `[Month][Week]` and its phone box draws no tab row at
 * all — the phone layout is the month grid plus the selected-day agenda beneath
 * it. This is a *layout* narrowing, not a deletion: every view stays reachable
 * on a wider window, and nothing is removed from `VIEWS`.
 */
export const VIEWS_BY_WIDTH: Record<'desktop' | 'tablet' | 'phone', readonly ViewName[]> = {
  desktop: VIEWS,
  tablet: ['Month', 'Week'],
  phone: ['Month'],
}

/* ── layers ────────────────────────────────────────────────────────────── */

/**
 * §5.1 Notes — *"Multi-layer overlays (crew, maintenance, transport) are
 * desktop-only."*
 *
 * The month grid's base layer is the booking layer: what is reserved, out,
 * blocked, cleaning, sub-rented, in conflict or expiring. Crew duty, the
 * maintenance bench and the vehicles ride *over* it as toggleable overlays,
 * and below 1280 they are not offered at all — the narrow grid states that in
 * words rather than silently dropping rows.
 */
export type LayerName = 'Crew' | 'Maintenance' | 'Transport'

export const LAYERS: Array<{ name: LayerName; label: string; icon: IconName }> = [
  { name: 'Crew', label: 'Crew', icon: 'crew' },
  { name: 'Maintenance', label: 'Maintenance', icon: 'tool' },
  { name: 'Transport', label: 'Transport', icon: 'truck' },
]

/**
 * The overlay a bar belongs to, or `null` when it is part of the base booking
 * layer.
 *
 * `row` is nullable because a live booking bar has **no resource row**: the
 * Month and Week views draw bookings, and the resource dimension they would
 * hang off (`product_units`, `booking_line_units`) is empty on the live
 * database. With no row, only the bar's own kind can place it — which is
 * correct rather than a degraded answer: a Crew Duty band is a crew bar and a
 * Maintenance bar is a maintenance bar whatever they are drawn against, and the
 * two row-shaped tests below (`type === 'Crew'`, `type === 'Vehicles'`) exist
 * only because a resource row can carry a bar whose kind does not say so.
 */
export function layerOf(row: ResourceRow | null, bar: Bar): LayerName | null {
  if (row?.type === 'Crew' || bar.kind === 'Crew Duty') return 'Crew'
  if (row?.type === 'Vehicles') return 'Transport'
  if (bar.kind === 'Maintenance') return 'Maintenance'
  return null
}

/** §3 — Resource Timeline rows are grouped by resource type, in render order. */
export const ROW_TYPES = ['Equipment', 'Vehicles', 'Crew', 'Warehouse Bays'] as const
export type RowType = (typeof ROW_TYPES)[number]

/** Zoom steps, in days rendered. "Fit" returns to 7. */
export const ZOOM_STEPS = [3, 5, 7, 10, 14, 21] as const
export const DEFAULT_ZOOM = 7

/* ── bars ──────────────────────────────────────────────────────────────── */

/**
 * §6 — every bar type appears in the legend; the build the spec reviewed ended
 * its legend in "More".
 *
 * TODO(decision): `Crew Duty` is drawn in both renders (Sunil's "Warehouse Duty
 * · Morning Shift" band) but `Calendar.md` §6's legend does not enumerate it,
 * so its tone is a guess — it borrows `progress`, which also carries Cleaning.
 * Needs a ruling: is a crew shift a calendar bar at all, or roster furniture?
 */
export type BarKind =
  | 'Available'
  | 'Reserved'
  | 'On Rent'
  | 'Completed'
  | 'Quote'
  | 'Draft'
  | 'Cleaning'
  | 'Maintenance'
  | 'Crew Duty'
  | 'Blocked'
  | 'Sub-Rental Out'
  | 'Sub-Rental In'
  | 'Conflict'
  | 'Quote Expiry'
  | 'Case Escalation'

export interface BarSkin {
  bg: string
  /**
   * The ink that goes **ON `bg`** — an on-colour (§3.2). Correct only where
   * `bg` is actually painted behind the text. For the same kind rendered as
   * text on a card, use `ink`.
   */
  fg: string
  /**
   * The same kind as **text on a `--card` surface** — a text-safe colour.
   *
   * Added 26 Aug 2026. `Calendar.tsx`'s `SelectedEventPanel` was reading `fg`
   * for its kind label, which is wrong by construction: an on-colour is picked
   * to sit on its OWN fill, so on a card it renders white-on-card for every
   * white-ink hue and NEAR-BLACK for the two dark-ink ones. Maintenance's
   * `--on-ready` (#1C1405) on a dark card was the worst case — effectively
   * invisible.
   *
   * This is the split `INV_DOT` and `CONDITION_INK` already make against their
   * own block tables: a status needs two colours, and which one you want
   * depends on what is behind the text. Carrying both on the row means a
   * caller cannot pick wrong by accident.
   */
  ink: string
  /** Outline colour; also the legend swatch. */
  line: string
  /**
   * Dashed rather than solid. §4 leaves exactly one use for this — the gold
   * sub-rental mark, which §2 keeps outline-only so it cannot be read as a
   * yellow status, and which uses dash-vs-solid to separate Out from In.
   * A STATUS must never set it: every status is a solid block.
   */
  dash?: boolean
  icon?: IconName
}

/**
 * Bar kind → its skin. Every kind that is a STATUS is a solid block
 * (DESIGN_DIRECTION_SPEC_v4.1 §4); the only outline left in this table is gold.
 *
 * ## The rule the two rewritten comments below used to quote
 *
 * Both cited **§4.2 "solid = out, soft = in"** — the 24 Aug morning fill rule,
 * which v4.1 lists by name in its own supersedes line and §3 replaces with
 * "everything is solid now". Two bars were still built on it:
 *
 *  - **`Available`** was `bg: 'transparent'` + `dash: true` — a dashed green
 *    outline, on a spec where §2 says gold is the ONLY outline on screen.
 *  - **`Maintenance`** was `bg: 'transparent'` with yellow ink, deliberately
 *    outlined so it would not be "byte-identical to Cleaning".
 *
 * That last one deserves its own note, because the problem it solved is real
 * and the solution is now illegal. Cleaning and Maintenance ARE the same hue
 * under §4 — both are yellow, "being worked in-house" — and v4.1 does not
 * offer a second weight to separate them with. §7.4 supplies the separator it
 * does intend: never colour alone. These two rows carry different words
 * (`Cleaning` / `Maintenance`) and different icons (`refresh` / `tool`), which
 * is what tells a reset queue from a repair bench. The legend swatches now
 * match by design; the legend rows do not, because each prints its kind.
 */
export const BAR_STYLE: Record<BarKind, BarSkin> = {
  /* `icon` stays absent, as it always was: Available is the ABSENCE of a
     booking, and every other kind's icon marks a thing that is happening. The
     word on the bar is the carrier §7.4 requires. */
  Available: { bg: 'var(--st-in-bg)', fg: 'var(--st-in-fg)', ink: 'var(--success-text)', line: 'var(--success)' },
  Reserved: { bg: 'var(--st-primary-bg)', fg: 'var(--st-primary-fg)', ink: 'var(--primary-text)', line: 'var(--st-primary-fg)', icon: 'calendar_event' },
  Completed: { bg: 'var(--st-neutral-bg)', fg: 'var(--st-neutral-fg)', ink: 'var(--muted)', line: 'var(--border)', icon: 'check' },
  Quote: { bg: 'transparent', fg: 'var(--muted)', ink: 'var(--muted)', line: 'var(--border)', dash: true, icon: 'file' },
  Draft: { bg: 'transparent', fg: 'var(--muted)', ink: 'var(--muted)', line: 'var(--border)', dash: true, icon: 'file' },
  /* §4 — orange, "out with the client", and solid like every other status. */
  'On Rent': { bg: 'var(--st-out-bg)', fg: 'var(--st-out-fg)', ink: 'var(--warn-text)', line: 'var(--st-out-bg)', icon: 'calendar_event' },
  Cleaning: { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)', ink: 'var(--ready-text)', line: 'var(--st-progress-fg)', icon: 'refresh' },
  /* Same yellow as Cleaning on purpose — see the header. The icon and the word
     separate them; the fill is not allowed to. */
  Maintenance: { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)', ink: 'var(--ready-text)', line: 'var(--progress)', icon: 'tool' },
  'Crew Duty': { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)', ink: 'var(--ready-text)', line: 'var(--st-progress-fg)', icon: 'crew' },
  Blocked: { bg: 'var(--st-neutral-bg)', fg: 'var(--st-neutral-fg)', ink: 'var(--muted)', line: 'var(--st-neutral-fg)', icon: 'package' },
  /* §2 — gold, outline only, and the ONE exception to the solid rule above.
     It is kept outline precisely so it can never be read as a yellow status.
     The renders draw these purple; purple is retired. */
  'Sub-Rental Out': { bg: 'transparent', fg: 'var(--ext-fg)', ink: 'var(--ext-fg)', line: 'var(--ext-line)', icon: 'external_link' },
  'Sub-Rental In': { bg: 'transparent', fg: 'var(--ext-fg)', ink: 'var(--ext-fg)', line: 'var(--ext-line)', dash: true, icon: 'return_arrow' },
  Conflict: { bg: 'var(--st-danger-bg)', fg: 'var(--st-danger-fg)', ink: 'var(--danger-text)', line: 'var(--danger)', icon: 'alert_triangle' },
  'Quote Expiry': { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)', ink: 'var(--ready-text)', line: 'var(--st-progress-fg)', icon: 'timer' },
  'Case Escalation': { bg: 'var(--st-danger-bg)', fg: 'var(--st-danger-fg)', ink: 'var(--danger-text)', line: 'var(--danger)', icon: 'flag' },
}

export const BAR_KINDS = Object.keys(BAR_STYLE) as BarKind[]

export interface Bar {
  /** Stable key; also the selection key for the Selected Event panel. */
  id: string
  kind: BarKind
  /** Bold first line — a booking number, or the event name. */
  label: string
  /**
   * The booking this bar IS, when it is one — `bookings.booking_no`, the value
   * `/rentals/:bookingNo` takes.
   *
   * Carried explicitly rather than parsed back out of `label`. The screen used
   * to decide whether a bar could be opened by asking whether its label looked
   * like a booking number (`isIssuedBy('BK', bar.label)`), which is a guess
   * about a string; a bar that carries its own booking cannot be wrong about
   * it, and a bar with none — a maintenance window, a conflict marker — is
   * unopenable by construction rather than by a pattern that might one day
   * match. Absent means "this bar is not a booking", never "we could not tell".
   */
  bookingNo?: string
  draftId?: string
  /** Second line — client / project / reason. */
  sub?: string
  /** Inclusive AD start day (UTC midnight). */
  from: Date
  /** Inclusive AD end day (UTC midnight). */
  to: Date
  /** Client, when the bar belongs to one. Drives the Client filter. */
  client?: string
  /** Trailing chip, e.g. a sub-rental return-by promise. Never a date. */
  note?: string
  /**
   * The AD instant the `note` refers to. The BS day is appended by the screen
   * through `lib/bs.ts` — this used to read `note: 'Return by 20 Shrawan'`, a
   * typed-in BS string that contradicted this file's own header and would have
   * drifted the moment `TODAY` or the offsets moved.
   */
  noteAt?: Date
  /** Right-edge dot — a flag needing attention on this bar. */
  dot?: 'danger' | 'progress' | 'primary' | 'success'
}

/**
 * One lane of the timeline grid: a label column and the bars drawn against it.
 *
 * Deliberately says nothing about what the lane IS. The grid geometry — the day
 * columns, the clipping, the today marker, the zoom — is the same whether a lane
 * is a camera or a booking, and the Week view needs the second kind: it draws
 * one lane per live booking, because the resource dimension a lane would
 * otherwise carry (`product_units`) has no rows.
 *
 * `ResourceRow` below is this plus the one thing a *resource* lane knows and a
 * booking lane cannot: which kind of resource it is.
 */
export interface LaneRow {
  id: string
  name: string
  /**
   * Whether `name` is an ISSUED IDENTIFIER and should be set in the identifier
   * face — true for a booking lane, whose name is `booking_no`, false for a
   * resource lane, whose name is a product name and whose identifier is `code`.
   *
   * A flag rather than a guess at the render: setting a client's name or a
   * product's name in the monospace identifier face is the same class of error
   * as printing a booking number in the prose face, and neither is decidable
   * from the string.
   */
  identifier?: boolean
  /** Serial / crew code / bay code — rendered in the identifier face. */
  code?: string
  /** Third line: unit count, or the lane's own state. */
  meta: string
  metaTone?: 'success' | 'primary' | 'muted' | 'progress'
  icon: IconName
  bars: Bar[]
}

export interface ResourceRow extends LaneRow {
  type: RowType
}

/**
 * The row roster and bar placement transcribed from `Calendar.PNG`.
 *
 * ## Archived 4 Sep 2026 — it asserted a business that does not exist
 *
 * Read as a picture this is a faithful transcription. Read as data it was a
 * claim, rendered as fact under today's date, that Babin Rentals owns:
 *
 *  - **a camera van** (`VH-01-BA-5920`) — `vehicles` has 0 rows;
 *  - **two crew** (Ramesh CR-001, Sunil CR-002) — `crew_profiles_v2`,
 *    `crew_assignments` and `shifts` all have 0 rows, and nothing in `src/`
 *    writes any of them;
 *  - **two warehouse bays** (BAY-A, BAY-P2);
 *  - **five pieces of equipment with serial numbers and unit counts** — "1
 *    unit", "2 units", "1 set" — where `product_units` has 0 rows, so there is
 *    no unit anywhere to count;
 *  - **eight bookings** (B-702 … B-731) that are not in the 246 live ones,
 *    a maintenance bench (`maintenance_records`: 0 rows, no writer in `src/`),
 *    a cleaning queue (`cleaning_queue_entries`: 0 rows) and a case escalation
 *    (`cases`: 0 rows).
 *
 * It is kept, not deleted (Law 3), because it is the only written record of how
 * the render laid the timeline out, and rebuilding the resource view later
 * should not mean re-reading a PNG. **It is not rendered and must not be**: it
 * is a picture of a product, not a state of this one.
 */
const ARCHIVED_RENDER_ROWS: ResourceRow[] = [
  {
    id: 'eq-fx3',
    type: 'Equipment',
    name: 'Sony FX3',
    code: 'SN-CAM-0102',
    meta: '1 unit',
    metaTone: 'success',
    icon: 'camera',
    bars: [
      { id: 'bk-0715-fx3', kind: 'On Rent', label: 'B-715', sub: 'Himalayan Films', client: 'Himalayan Films', from: adDay(-1), to: adDay(1), dot: 'success' },
      { id: 'cl-fx3', kind: 'Cleaning', label: 'Cleaning', sub: 'Maya Production', client: 'Maya Production', from: adDay(3), to: adDay(3), dot: 'progress' },
      { id: 'rs-fx3', kind: 'Reserved', label: 'Reserved', sub: 'Pixel Studio', client: 'Pixel Studio', from: adDay(4), to: adDay(5) },
      { id: 'bk-0702-fx3', kind: 'On Rent', label: 'B-702', sub: 'Classic Media', client: 'Classic Media', from: adDay(-6), to: adDay(-4) },
      { id: 'bk-0731-fx3', kind: 'Reserved', label: 'B-731', sub: 'Himalayan Films', client: 'Himalayan Films', from: adDay(8), to: adDay(10) },
    ],
  },
  {
    id: 'eq-komodo',
    type: 'Equipment',
    name: 'RED Komodo X',
    code: 'SN-CAM-0201',
    meta: '1 unit',
    metaTone: 'success',
    icon: 'video',
    bars: [
      { id: 'bk-0712-kmx', kind: 'On Rent', label: 'B-712', sub: 'Classic Media', client: 'Classic Media', from: adDay(0), to: adDay(2), dot: 'success' },
      { id: 'cf-kmx', kind: 'Conflict', label: 'CONFLICT', sub: 'Double Booking', from: adDay(3), to: adDay(3), dot: 'danger' },
      { id: 'bk-0718-kmx', kind: 'On Rent', label: 'B-718', sub: 'Nepal Docs Lab', client: 'Nepal Docs Lab', from: adDay(4), to: adDay(5) },
      { id: 'mt-kmx', kind: 'Maintenance', label: 'Sensor Clean', sub: 'Service Center', from: adDay(-5), to: adDay(-4) },
    ],
  },
  {
    id: 'eq-aputure',
    type: 'Equipment',
    name: 'Aputure 600D Pro',
    code: 'SN-LGT-0013',
    meta: '2 units',
    metaTone: 'primary',
    icon: 'battery',
    bars: [
      { id: 'bl-ap6', kind: 'Blocked', label: 'Blocked', sub: 'Demo Shoot', from: adDay(-1), to: adDay(-1) },
      { id: 'bk-0716-ap6', kind: 'On Rent', label: 'B-716', sub: 'Maya Production', client: 'Maya Production', from: adDay(1), to: adDay(2), dot: 'success' },
      { id: 'mt-ap6', kind: 'Maintenance', label: 'Maintenance', sub: 'Service Center', from: adDay(5), to: adDay(5), dot: 'progress' },
      { id: 'qt-ap6', kind: 'Quote Expiry', label: 'Q-88', sub: 'Expires today', client: 'Pixel Studio', from: adDay(7), to: adDay(7), dot: 'progress' },
    ],
  },
  {
    id: 'eq-rs4',
    type: 'Equipment',
    name: 'DJI RS 4 Pro',
    code: 'SN-GIM-0004',
    meta: '2 units',
    metaTone: 'success',
    icon: 'tool',
    bars: [
      { id: 'bk-0715-rs4', kind: 'On Rent', label: 'B-715', sub: 'Himalayan Films', client: 'Himalayan Films', from: adDay(-1), to: adDay(1), dot: 'progress' },
      { id: 'bk-0720-rs4', kind: 'On Rent', label: 'B-720', sub: 'Pixel Studio', client: 'Pixel Studio', from: adDay(3), to: adDay(5) },
      { id: 'av-rs4', kind: 'Available', label: 'Available', from: adDay(-5), to: adDay(-2) },
    ],
  },
  {
    id: 'eq-athena',
    type: 'Equipment',
    name: 'NISI Athena Prime Set',
    code: 'SN-LEN-0501',
    meta: '1 set',
    metaTone: 'muted',
    icon: 'photo',
    bars: [
      { id: 'sr-out-ath', kind: 'Sub-Rental Out', label: 'Sub-Rental Out', sub: 'Filmgear Rentals', client: 'Filmgear Rentals', from: adDay(0), to: adDay(2), note: 'Return by', noteAt: adDay(4), dot: 'primary' },
      { id: 'sr-in-ath', kind: 'Sub-Rental In', label: 'Sub-Rental In', sub: 'Filmgear Rentals', client: 'Filmgear Rentals', from: adDay(4), to: adDay(5), note: 'Expected', noteAt: adDay(4), dot: 'primary' },
      { id: 'cs-ath', kind: 'Case Escalation', label: 'CASE-2026-0041', sub: 'Lens element haze', from: adDay(9), to: adDay(9), dot: 'danger' },
    ],
  },
  {
    id: 'vh-van',
    type: 'Vehicles',
    name: 'Camera Van',
    code: 'VH-01-BA-5920',
    meta: '1 unit',
    metaTone: 'primary',
    icon: 'truck',
    bars: [
      { id: 'bk-0712-van', kind: 'On Rent', label: 'B-712', sub: 'Classic Media', client: 'Classic Media', from: adDay(-1), to: adDay(1), dot: 'success' },
      { id: 'bk-0718-van', kind: 'On Rent', label: 'B-718', sub: 'Nepal Docs Lab', client: 'Nepal Docs Lab', from: adDay(3), to: adDay(4) },
      { id: 'mt-van', kind: 'Maintenance', label: 'Servicing', sub: 'Workshop', from: adDay(8), to: adDay(9) },
    ],
  },
  {
    id: 'cr-001',
    type: 'Crew',
    name: 'Ramesh (DIT)',
    code: 'CR-001',
    meta: 'On Duty',
    metaTone: 'success',
    icon: 'crew',
    bars: [
      { id: 'bk-0715-cr1', kind: 'Reserved', label: 'B-715', sub: 'Full Day', client: 'Himalayan Films', from: adDay(-1), to: adDay(1), dot: 'primary' },
      { id: 'bk-0720-cr1', kind: 'Reserved', label: 'B-720', sub: 'Full Day', client: 'Pixel Studio', from: adDay(3), to: adDay(5), dot: 'primary' },
    ],
  },
  {
    id: 'cr-002',
    type: 'Crew',
    name: 'Sunil (Warehouse)',
    code: 'CR-002',
    meta: 'On Duty',
    metaTone: 'success',
    icon: 'crew',
    bars: [
      { id: 'duty-cr2', kind: 'Crew Duty', label: 'Warehouse Duty', sub: 'Morning Shift', from: adDay(-1), to: adDay(5) },
    ],
  },
  {
    id: 'wb-studio-a',
    type: 'Warehouse Bays',
    name: 'Studio Floor A',
    code: 'BAY-A',
    meta: 'Warehouse',
    metaTone: 'muted',
    icon: 'box',
    bars: [
      { id: 'bl-studio-a', kind: 'Blocked', label: 'Closed', sub: 'Dashain Holiday (Warehouse Closed)', from: adDay(-3), to: adDay(-1) },
      { id: 'cl-studio-a', kind: 'Cleaning', label: 'Reset & QC', sub: 'Return queue', from: adDay(1), to: adDay(2) },
    ],
  },
  {
    id: 'wb-prep-2',
    type: 'Warehouse Bays',
    name: 'Prep Bay 2',
    code: 'BAY-P2',
    meta: 'Warehouse',
    metaTone: 'muted',
    icon: 'package',
    bars: [
      { id: 'pk-prep2', kind: 'Reserved', label: 'Packing', sub: 'B-718', client: 'Nepal Docs Lab', from: adDay(2), to: adDay(3) },
      { id: 'bl-prep2', kind: 'Blocked', label: 'Blocked', sub: 'Tihar (Laxmi Puja)', from: adDay(11), to: adDay(12) },
    ],
  },
]

/** The archive, exported so it is reachable by name rather than commented out. */
export { ARCHIVED_RENDER_ROWS }

/**
 * The resource rows the Timeline view draws — **empty, and that is the honest
 * answer.**
 *
 * A resource timeline is one lane per physical thing. The lanes would come from
 * `product_units` (0 rows), the bars on them from `booking_line_units` (0 rows),
 * and the overlays from `maintenance_records`, `cleaning_queue_entries` and
 * `crew_assignments` (0 rows each; `maintenance_records` and `crew_assignments`
 * have no writer in `src/` either, while `cleaning_queue_entries` does — see
 * `TODAY_SUMMARY`'s Cleaning row). A resource-centric view is therefore
 * *structurally* writable and *actually* empty, so the screen states that
 * instead of drawing `ARCHIVED_RENDER_ROWS` above.
 *
 * The Month and Week views do not depend on this: they draw the live bookings
 * through `lib/queries/calendar.ts`, which needs no resource dimension. That
 * read maps three stages only — Booked and Packed to `Reserved`, On Rent to
 * `On Rent` — and excludes cancellations, so of the 246 bookings in the
 * database at most **49** can ever reach the grid (30 Booked + 16 Packed +
 * 3 On Rent, none cancelled, counted 4 Sep 2026); the other 197 are Quote,
 * Returned or Closed and have no bar kind. Making this array live is what makes
 * the Timeline view live, and nothing else.
 *
 * Typed `ResourceRow[]` rather than `never[]` so the Timeline's plumbing keeps
 * its real types and the day it has rows is a data change, not a refactor.
 */
export const ROWS: ResourceRow[] = []

/* ── filters ───────────────────────────────────────────────────────────── */

/**
 * The Client filter's options.
 *
 * Empty by construction now that `ROWS` is: the clients on screen are whoever
 * the live bookings in the window belong to, which only the screen knows after
 * its read returns. `modules/calendar/Calendar.tsx` derives the list from the
 * bars it loaded, so the dropdown offers the clients actually on the grid
 * rather than five names transcribed from a render.
 *
 * Kept exported as the empty seed rather than removed, so the derivation stays
 * visibly in one place and the Timeline view has a list to widen the day it
 * gains rows.
 */
export const CLIENTS: string[] = Array.from(
  new Set(ROWS.flatMap((r) => r.bars.map((b) => b.client).filter((c): c is string => Boolean(c)))),
).sort()

export interface SavedView {
  name: string
  /** Applied verbatim when the view is picked — no dead entries. */
  rowType: 'All' | RowType
  kinds: BarKind[]
  /** The one marked default in the render. */
  starred?: boolean
}

/**
 * The render drew five. **None survives**, and all five are below by name
 * rather than silently missing.
 *
 * A saved view applies a row type and a set of bar kinds, so a view is only
 * real if one of those two narrows something:
 *
 *  - `Warehouse View`, `Equipment View` and `Crew Schedule` apply nothing but a
 *    row type, and `ROWS` is empty — each is a button whose only possible
 *    outcome is the empty state.
 *  - `Conflict View` is that case one step further out: `Conflict` and
 *    `Case Escalation` are kinds nothing produces (see `QUICK_ACTIONS` on why
 *    no query lists a conflict), so filtering to them can only ever clear the
 *    grid.
 *  - `My Bookings` was kept on 4 Sep and **archived the same day**. It applied
 *    `kinds: ['On Rent', 'Reserved']`, which is *exactly* the set
 *    `CALENDAR_BAR_KINDS` says the read can produce — every bar on the grid
 *    already matches it. So it removed no bar and added no bar, and its only
 *    observable effect was to flip the page into "filtered" mode: the chip row
 *    lit up, the empty state stopped saying "nothing is booked in this window"
 *    and started saying "nothing matches the current filters", and a
 *    Clear-filters control appeared for filters that were doing nothing. A
 *    control that changes only the page's account of itself is worse than one
 *    that does nothing at all.
 *
 *    Its NAME is the second problem and the one that decides it cannot simply
 *    be re-pointed: "my" bookings means the bookings assigned to the signed-in
 *    operator, and nothing in the schema records that assignment
 *    (`crew_assignments` has 0 rows and no writer). Reviving it needs that
 *    record, not a different `kinds` array.
 *
 * They come back the day the timeline has rows, the day a conflict query
 * exists, and the day a booking knows whose it is — not before, because a
 * live-looking control that can only empty the screen, or only relabel it, is
 * worse than an absent one.
 */
export const SAVED_VIEWS: SavedView[] = []

/** All five of the render's views, kept by name (Law 3). See the note above. */
export const ARCHIVED_SAVED_VIEWS: SavedView[] = [
  { name: 'My Bookings', rowType: 'All', kinds: ['On Rent', 'Reserved'], starred: true },
  { name: 'Warehouse View', rowType: 'Warehouse Bays', kinds: [] },
  { name: 'Equipment View', rowType: 'Equipment', kinds: [] },
  { name: 'Crew Schedule', rowType: 'Crew', kinds: [] },
  { name: 'Conflict View', rowType: 'All', kinds: ['Conflict', 'Case Escalation'] },
]

/** Why the Saved Views list is empty, rendered on the panel face. */
export const SAVED_VIEWS_NOT_AVAILABLE =
  'No saved view narrows anything yet. Every one the render drew scoped the resource timeline, which has no ' +
  'rows, filtered to event kinds no booking can carry, or selected the kinds every booking already has. They ' +
  'are kept by name in ARCHIVED_SAVED_VIEWS and return when the data behind them does.'

/* ── right rail ────────────────────────────────────────────────────────── */

/**
 * Festivals are stored as **AD** ranges; the BS label beside them is rendered by
 * `lib/bs.ts`, so the list can never drift from the grid above it.
 */
export interface Holiday {
  name: string
  from: Date
  to: Date
}

/**
 * The three festivals the render drew. **Archived 4 Sep 2026 — they were wrong
 * twice over.**
 *
 * ### 1. They had no source
 *
 * There is no holiday table anywhere in the schema — not in any of the 125
 * `create table` statements under `supabase/migrations`. These three dates were
 * typed into a seed file and then rendered as authoritative: `holidayOn` shaded
 * month cells, printed a festival's name inside the day, coloured the day number
 * with the weekend's `--danger-text`, and filled a "Festivals & Holidays" card
 * whose footer said *"Holiday calendars are configured in Settings"* — of a
 * calendar configured nowhere. `data/businessHours.ts` then read the same three
 * rows and turned them into gazetted closures with `blocksBooking: true`, so one
 * invented list became a scheduling rule on a second screen.
 *
 * ### 2. The dates were wrong anyway
 *
 * Dashain is an autumn festival; it is dated here at the end of **July**.
 * Whatever else is true, 28–30 Jul 2026 is not Dashain, and an operator who
 * planned a shoot around this grid would have planned around a fiction.
 *
 * ### Why nothing replaces them
 *
 * A festival calendar is **BS calendar data** — the same class of fact as the
 * month lengths `PLAN.md` §4.34 refuses to infer, and refuses for the same
 * reason: putting a wrong Nepali date in front of a client is the defect
 * `Calendar.md` §4.2 calls the highest-priority correctness bug in the product.
 * Nepal's festival dates are lunar and are fixed each year by the Nepal Calendar
 * Determination Committee; they cannot be computed from an anchor and they
 * cannot be guessed from a render.
 *
 * `TODO(decision)` — a real source. The three shapes it could take, none of
 * which is this file's to choose:
 *   (a) the same 2000–2100 BS table §4.34 already needs, extended with the
 *       gazetted public-holiday list, shipped as data and versioned;
 *   (b) a `holidays` table with a migration, editable in Settings — which is
 *       what the card's own footer already promises, and what
 *       `businessHours.ts`'s `CalException` shape is already written against;
 *   (c) per-branch closures only, with no national festival list at all, on the
 *       argument that what a warehouse needs to know is whether IT is open.
 * Until one is picked, the screen says the calendar is not loaded rather than
 * showing three days it made up.
 */
export const ARCHIVED_RENDER_HOLIDAYS: Holiday[] = [
  { name: 'Dashain', from: new Date(Date.UTC(2026, 6, 28)), to: new Date(Date.UTC(2026, 6, 30)) },
  { name: 'Buddha Jayanti', from: new Date(Date.UTC(2026, 7, 8)), to: new Date(Date.UTC(2026, 7, 8)) },
  { name: 'Tihar (Laxmi Puja)', from: new Date(Date.UTC(2026, 7, 11)), to: new Date(Date.UTC(2026, 7, 12)) },
]

/**
 * The festival and public-holiday calendar — empty, because none is loaded.
 *
 * Read the archive above before adding a row here. A date in this array shades
 * the month grid, labels the day, colours its number as non-working and feeds
 * `businessHours.ts`'s closures; it is a scheduling assertion, not decoration.
 */
export const HOLIDAYS: Holiday[] = []

/**
 * The festival covering an AD day, or `null`.
 *
 * Always `null` today. Kept as the one lookup so that loading a real calendar is
 * a change to `HOLIDAYS` alone — no caller has to be found and rewired.
 *
 * ⚠ Callers must not read a `null` here as "this is an ordinary working day".
 * It means "no holiday calendar is loaded", which is a different fact and the
 * reason `modules/calendar/Calendar.tsx` no longer shades or labels anything
 * from it: an unshaded cell that silently meant "we do not know" was the whole
 * defect.
 */
export function holidayOn(d: Date): Holiday | null {
  const t = d.getTime()
  return HOLIDAYS.find((h) => t >= h.from.getTime() && t <= h.to.getTime()) ?? null
}

/** Why the festival card and the grid say nothing about holidays. Rendered, not hidden in a tooltip. */
export const HOLIDAYS_NOT_TRACKED = 'No holiday calendar is loaded.'

/**
 * The live counts the two rail cards can actually ask for.
 *
 * Each key names ONE query, and the screen fetches exactly these. Adding a key
 * here without a query behind it is how the literals below came to exist in the
 * first place, so the union is deliberately small and every member is spoken
 * for in `CountSlot`'s table.
 */
export type CountKey =
  /** `todaysOutgoing(dayAd)` — pickups due on the operating day that have not left. */
  | 'todayPickups'
  /** `todaysIncoming(dayAd)` — returns due on the operating day that are still out. */
  | 'todayReturns'
  /** `todaysOutgoing` widened over the card's own window — pickups starting in it. */
  | 'upcomingPickups'
  /** `quotesExpiring(windowEnd, windowStart)` — quotes lapsing inside the window. */
  | 'upcomingQuoteExpiry'
  /** `invoicesDueInPeriod(from, to)` — unsettled invoices falling due in the window. */
  | 'upcomingPaymentDue'

/**
 * One row of a rail card.
 *
 * ⛔ This used to be a `CountRow` carrying a hand-typed `value: number`. Ten
 * numbers — 3 pickups, 5 returns, 4 cleaning, 12 bookings, 4 payments due —
 * rendered under today's real date, beside a Dashboard reading the live
 * database, where the honest figures for 4 Sep are zero and zero. Rulings §8:
 * *a number with no real source renders "not tracked yet", never a plausible
 * default and never zero.*
 *
 * So a row no longer carries a value at all. It carries either a `key` (the
 * screen counts it) or a `reason` (the screen says why it cannot). Exactly one
 * of the two, which is what makes a third silent state impossible.
 */
export interface CountSlot {
  label: string
  tone: string
  icon?: IconName
  /** §8.3 — omitted from the markup entirely for a role that may not see money. */
  money?: boolean
  /** The live count this row shows. `null` when nothing computes it. */
  key: CountKey | null
  /** Why there is no figure. Stated on the card face whenever `key` is null. */
  reason?: string
}

/**
 * ## Why three of these five rows have no number
 *
 * Not an oversight and not a backlog item to be quietly zeroed — each names a
 * table that is empty, and no query module counts any of the three:
 *
 *  - **Cleaning** — `cleaning_queue_entries` has 0 rows on this database.
 *
 *    ⛔ This row used to say *"nothing in the app writes one"*. That was
 *    already false when it was written: `actions/rentals/floorVerb.ts`'s
 *    `enqueueReturnedUnits` inserts one entry per returned unit on **every**
 *    Return (`idempotentInsert('cleaning_queue_entries', …)`), and that writer
 *    landed on 3 Sep 2026 and was driven. The table is empty because no Return
 *    has been recorded against this database yet, which is a different fact and
 *    a temporary one.
 *
 *    What is true, and what actually keeps the figure off the card, is that
 *    **no query module reads the table for a count**. `lib/queries/availability.ts`
 *    reads it to exclude a unit that is still on the bench — a per-unit
 *    predicate, not a total — and there is nothing else. A number here would
 *    have to be derived on this screen, which Law 1 forbids.
 *  - **Maintenance** — `maintenance_records` has 0 rows and no writer in `src/`
 *    (checked 4 Sep 2026: every mention is a comment, `lib/rbac.ts`, or the
 *    generated `types/supabase.ts`).
 *  - **Sub-Rental Return** — the same finding the Sub-Rental figure got on
 *    3 Sep, and rendered the same way for the same reason.
 */
export const TODAY_SUMMARY: CountSlot[] = [
  { label: 'Pickup', tone: 'var(--primary)', key: 'todayPickups' },
  { label: 'Return', tone: 'var(--progress)', key: 'todayReturns' },
  {
    label: 'Cleaning',
    tone: 'var(--success)',
    key: null,
    reason:
      'Recording a return puts each unit on the reset bench, but no return has been recorded on this database ' +
      'yet and no query counts the bench, so there is no figure to show.',
  },
  {
    label: 'Maintenance',
    tone: 'var(--danger)',
    key: null,
    reason: 'Maintenance records are not written anywhere in the app yet, so there is nothing to count.',
  },
  {
    label: 'Sub-Rental Return',
    tone: 'var(--ext-line)',
    key: null,
    reason: 'Sub-rentals are not tracked as their own records yet — the same gap the Sub-Rental figure names.',
  },
]

/**
 * The *Upcoming (Next 7 Days)* card.
 *
 * ⚠ **"Bookings" became "Pickups"**, and that is a correction rather than a
 * rename. "12 Bookings in the next 7 days" has no definition: bookings starting
 * in the window? ending in it? live at any point during it? Three different
 * numbers, and the row never said which. What the query behind it counts is
 * pickups whose day falls inside the window — `todaysOutgoing` widened over the
 * card's own range — so the row now says that. Making the label true beats
 * inventing a rule to make the old label true.
 *
 * `Case Escalations` has no source for the same reason as Cleaning above:
 * `cases` has 0 rows. `Sub-Rental Returns` is the plural of the row in
 * `TODAY_SUMMARY` and stands or falls with it.
 */
export const UPCOMING: CountSlot[] = [
  { label: 'Pickups', tone: 'var(--primary-text)', icon: 'calendar_event', key: 'upcomingPickups' },
  {
    label: 'Sub-Rental Returns',
    tone: 'var(--ext-fg)',
    icon: 'return_arrow',
    key: null,
    reason: 'Sub-rentals are not tracked as their own records yet.',
  },
  { label: 'Quote Expiry', tone: 'var(--progress-text)', icon: 'timer', key: 'upcomingQuoteExpiry' },
  {
    label: 'Case Escalations',
    tone: 'var(--danger-text)',
    icon: 'alert_triangle',
    key: null,
    reason: 'No case has been raised, and nothing on this screen escalates one.',
  },
  { label: 'Payment Due', tone: 'var(--progress-text)', icon: 'dollar', money: true, key: 'upcomingPaymentDue' },
]

/* ── the queries behind the five live figures ──────────────────────────── */

/**
 * The window the *Upcoming* card's own heading promises — **(Next 7 Days)**.
 *
 * Taken from `data/today.ts`'s period vocabulary rather than written out here,
 * so "next 7 days" means the same span of days on this card as it does on the
 * Dashboard chip of the same name: today plus the next six, inclusive, which is
 * the reading `periodRange` documents and the one that matches how the chip sits
 * beside "Today" and "Tomorrow".
 */
export const UPCOMING_PERIOD: LivePeriod = 'Next 7 Days'

/**
 * `periodRange` is typed `DayRange | null` because the **All** chip means "no
 * date constraint". `UPCOMING_PERIOD` is not that chip, so the fallback below is
 * unreachable — it exists so a future edit that points this at 'All' produces a
 * one-day card rather than an unbounded count of every pickup ever recorded.
 */
function upcomingWindow(dayAd: string): { from: string; to: string } {
  return periodRange(UPCOMING_PERIOD, dayAd) ?? { from: dayAd, to: dayAd }
}

/**
 * A count wants `total`, not rows. `withCount: true` reports the full matching
 * count regardless of the range, and `page` is not a narrowing predicate
 * (`useList`'s `narrowingKey` ignores it), so a count query can never make a
 * card read as "filtered". Same constant, same reasoning, as
 * `data/rentals.ts`'s `COUNT_PAGE`.
 */
const COUNT_PAGE: ListFilters['page'] = { index: 0, size: 1 }

/**
 * Both ends of the Upcoming window as INSTANTS, for `quotesExpiring`.
 *
 * `quote_expires_at` is a `timestamptz`, so the bounds have to be instants — a
 * bare `YYYY-MM-DD` would be read by Postgres as midnight UTC, which is 05:45
 * that morning in Kathmandu, and quotes lapsing before then on the first day
 * would be missed. The two instants are lifted off `todaysOutgoing`, which
 * already builds the operational-day boundary; `lib/queries/calendar.ts` and
 * `data/today.ts`'s `overDays` take the same route and for the same reason —
 * `startOfDay` / `endOfDay` are module-private in `queries/bookings.ts` and
 * re-deriving Nepal's offset in a data file is how a second, wrong copy of it
 * gets written.
 */
function upcomingInstants(dayAd: string): { open: string; close: string } {
  const window = upcomingWindow(dayAd)
  return {
    open: todaysOutgoing(window.from).dateRange?.fromAd ?? window.from,
    close: todaysOutgoing(window.to).dateRange?.toAd ?? window.to,
  }
}

/**
 * The four figures counted against `bookings`, as filter sets.
 *
 * Named here rather than assembled in the screen for the reason
 * `queries/bookings.ts` names its own sets: change what "today's pickups" means
 * once, and every surface showing it moves together. The Calendar's Pickup row
 * and the Dashboard's Pickups column are now the same server-side count of the
 * same set, so they cannot disagree while both look right.
 *
 * ## ⛔ Why this is a function of the day and no longer a constant
 *
 * It was `RAIL_BOOKING_COUNTS`, an object built from `data/today.ts`'s
 * `TODAY_DAY_AD` — which that module resolves **once, when it is imported**. A
 * warehouse tablet left on the Calendar overnight therefore kept counting
 * yesterday's pickups and yesterday's returns under a card headed *Today's
 * Summary*, with today's date rendered directly above them from
 * `getBusinessToday()`. The card contradicted its own heading and looked
 * completely normal doing it.
 *
 * Taking the day as an argument moves the decision to the caller, which renders
 * it (`Calendar.tsx` resolves `businessDayAd()` per render), so the figure and
 * the heading are computed from the same day. `useList` keys its effect on the
 * VALUE of the filter set (`filterKey`), not its identity, so rebuilding these
 * objects every render costs nothing and re-queries only when the day actually
 * turns over.
 *
 * **No money.** None of the four passes `withDeposit`, and a count carries no
 * figure anyway — the Calendar is a Warehouse surface (Foundation §8.3).
 */
export function railBookingCounts(dayAd: string): Record<Exclude<CountKey, 'upcomingPaymentDue'>, ListFilters> {
  const window = upcomingWindow(dayAd)
  const instants = upcomingInstants(dayAd)
  return {
    /** Today ▸ Pickup — pickups due on the operating day that have not left yet. */
    todayPickups: { ...todaysOutgoing(dayAd), page: COUNT_PAGE },
    /** Today ▸ Return — returns due on the operating day, still out. */
    todayReturns: { ...todaysIncoming(dayAd), page: COUNT_PAGE },
    /**
     * Upcoming ▸ Pickups — the same outgoing set, widened across the card's own
     * window. This is what the row that used to say "Bookings" actually counts,
     * which is why it now says Pickups.
     */
    upcomingPickups: { ...overDays(todaysOutgoing, window, dayAd), page: COUNT_PAGE },
    /**
     * Upcoming ▸ Quote Expiry — quotes lapsing INSIDE the window.
     *
     * `quotesExpiring` had only an upper bound, which answers "already expired,
     * however long ago" — a backward-looking question on a card headed *Next 7
     * Days*. It now takes the window's lower bound too, in the data layer.
     */
    upcomingQuoteExpiry: { ...quotesExpiring(instants.close, instants.open), page: COUNT_PAGE },
  }
}

/**
 * The one figure counted against `invoices` — Upcoming ▸ Payment Due.
 *
 * ⚠ **Money.** Kept in its own function rather than folded into the four above
 * precisely so the money-blind path is a different call the screen has to make
 * on purpose: `CountList` already omits a `money: true` row from the markup for
 * a role that may not see it (§8.3 — omission, not masking), and the screen must
 * not run this query for that role either. A money-blind session would get
 * `{ rows: [], total: 0 }` back from RLS, and rendering that 0 would be a
 * permission answer dressed as a business fact.
 *
 * Takes the day for the same reason `railBookingCounts` does — see its note.
 */
export function railInvoiceCounts(dayAd: string): Record<'upcomingPaymentDue', ListFilters> {
  const window = upcomingWindow(dayAd)
  return {
    upcomingPaymentDue: { ...invoicesDueInPeriod(window.from, window.to), page: COUNT_PAGE },
  }
}

/**
 * The render's four tiles. `to` is a route that exists; `unavailable` states the
 * reason instead of pretending — §0 forbids a control that goes nowhere.
 *
 * ## Why this is a union rather than two optional fields
 *
 * It was `{ label; icon; to?; unavailable? }`, which admits a fourth shape
 * neither branch handles: **both absent**. The screen's `runQuickAction` read
 * `if (a.to) navigate(a.to)` and fell off the end for such a tile — a live,
 * enabled, hoverable button that did nothing at all when pressed, which is the
 * exact defect this change removed everywhere else. The union makes that tile
 * unwriteable: a tile either goes somewhere or says why it cannot, and the
 * compiler is what enforces it rather than a convention.
 *
 * The `action?: 'conflicts'` in-page hook that used to live here went with the
 * conflict filter it drove — see `QUICK_ACTIONS` below. Nothing else was ever an
 * in-page action, so the field is gone rather than left as a one-member union
 * nobody uses.
 *
 * `kind` is carried explicitly rather than left implicit in which optional field
 * is set, because TypeScript narrows a union only on a property whose types are
 * unit types — `string` is not one, so `if (a.unavailable)` narrows nothing and
 * the render would still be handed `to: string | undefined` and be back where it
 * started. The literal makes the discrimination real at both ends.
 */
export type QuickAction =
  /** Goes somewhere. `to` is a route that exists. */
  | { kind: 'route'; label: string; icon: IconName; to: string; unavailable?: never }
  /** Goes nowhere, and `unavailable` is the reason, stated on its face. */
  | { kind: 'unavailable'; label: string; icon: IconName; to?: never; unavailable: string }

export const QUICK_ACTIONS: QuickAction[] = [
  { kind: 'route', label: 'New Rental', icon: 'plus', to: '/rentals/new' },
  { kind: 'unavailable', label: 'Block Equipment', icon: 'package', unavailable: 'The Block dialog is not built yet' },
  { kind: 'route', label: 'New Maintenance', icon: 'tool', to: '/inventory' },
  /*
   * ⛔ Was `action: 'conflicts'`, which filtered the grid to the `Conflict` and
   * `Case Escalation` bar kinds. Both were seed inventions — the live read
   * produces `Reserved` and `On Rent` and nothing else — so the button's only
   * possible outcome became an empty grid captioned as if it had checked.
   *
   * Nothing in the product lists conflicting bookings. The overlap defence is
   * the GiST exclusion on `inventory_reservations`, which REJECTS a write; and
   * `lib/availability.ts` answers "can this booking's lines be covered" for one
   * booking at confirm time. Neither can be asked "show me every clash on the
   * calendar" — that is a different query over a table of assignments that has
   * no rows. Stated rather than pretended.
   */
  {
    kind: 'unavailable',
    label: 'View Conflicts',
    icon: 'alert_triangle',
    unavailable:
      'Nothing lists conflicts: the overlap rule is enforced per booking when one is confirmed, and no query ' +
      'sweeps the calendar for clashes.',
  },
]

/**
 * The event-marker key along the bottom of the render's timeline card. These are
 * *point* markers on a day, distinct from the bar kinds above.
 *
 * It is a **legend**, so it carries no counts. It used to be typed as a row of
 * figures with every value hand-set to `0` — eleven numbers that were never
 * rendered but that any future reader would reasonably have wired up as real
 * ones. A legend row is a label, a tone and an icon; nothing else.
 */
export interface LegendMarker {
  label: string
  tone: string
  icon: IconName
  /** §8.3 — omitted from the markup entirely for a role that may not see money. */
  money?: boolean
}

export const EVENT_MARKERS: LegendMarker[] = [
  { label: 'Pickup', tone: 'var(--success-text)', icon: 'arrow_up' },
  { label: 'Return', tone: 'var(--primary-text)', icon: 'arrow_down' },
  { label: 'Handover', tone: 'var(--text2)', icon: 'crew' },
  { label: 'Return Session', tone: 'var(--text2)', icon: 'return_arrow' },
  { label: 'Cleaning', tone: 'var(--progress-text)', icon: 'refresh' },
  { label: 'Maintenance', tone: 'var(--progress-text)', icon: 'tool' },
  { label: 'Sub-Rental Out', tone: 'var(--ext-fg)', icon: 'external_link' },
  { label: 'Sub-Rental In', tone: 'var(--ext-fg)', icon: 'return_arrow' },
  { label: 'Case Escalation', tone: 'var(--danger-text)', icon: 'flag' },
  { label: 'Quote Expiry', tone: 'var(--progress-text)', icon: 'timer' },
  { label: 'Payment Due', tone: 'var(--danger-text)', icon: 'dollar', money: true },
]

export const SHORTCUTS: Array<{ key: string; label: string }> = [
  { key: 'F', label: 'Full Calendar' },
  { key: 'T', label: 'Today' },
  /* Follows the tab's new name. `R` still opens the resource timeline; the key
     is unchanged so a hand that learned it does not have to relearn it. */
  { key: 'R', label: 'Timeline' },
  { key: '?', label: 'Shortcuts Help' },
]

/* ── selected event ────────────────────────────────────────────────────── */

/**
 * Detail for the one booking the render opens. Every date is an AD instant —
 * the panel renders BS above AD from `lib/bs.ts`, never from a stored string.
 */
export interface EventDetail {
  bookingNo: string
  status: string
  client: string
  project: string
  equipment: Array<{ name: string; code: string; icon: IconName }>
  pickup: { at: Date; time: string }
  return: { at: Date; time: string }
  handoverSession: { at: Date; time: string }
  returnSession: { at: Date; time: string }
  crew: string[]
  vehicle: string
  notes: string
}

/**
 * The render's one open booking. **Archived 4 Sep 2026 — it became a collision
 * hazard the moment the grid went live.**
 *
 * This map is keyed by booking NUMBER, and the screen looked a bar's label up in
 * it to decide whether to print a pickup time, a crew list, a vehicle and a
 * shoot note. That was harmless while every bar was seed. It stopped being
 * harmless when `lib/queries/calendar.ts` started drawing real bookings — the
 * Booked, Packed and On Rent ones, at most 49 of the 246 in the database:
 * a live `B-715` would have been shown Ramesh, Sunil, Anita, Bikash
 * and Prakash, a camera van it does not have, and *"Outdoor shoot in Dolpa.
 * Weather dependent."* — five fabricated crew and a location, presented as that
 * booking's record.
 *
 * Kept by name (Law 3) because it is the written record of what the Selected
 * Event panel is meant to show. It comes back as a per-booking READ — the
 * sessions, crew and vehicle all have tables — not as a keyed literal.
 */
export const ARCHIVED_RENDER_EVENT_DETAIL: Record<string, EventDetail> = {
  'B-715': {
    bookingNo: 'B-715',
    status: 'On Rent',
    client: 'Himalayan Films',
    project: 'Documentary Project',
    equipment: [
      { name: 'Sony FX3', code: 'SN-CAM-0102', icon: 'camera' },
      { name: 'DJI RS 4 Pro', code: 'SN-GIM-0004', icon: 'tool' },
    ],
    pickup: { at: adDay(-1), time: '08:00' },
    return: { at: adDay(1), time: '18:00' },
    handoverSession: { at: adDay(-1), time: '07:00' },
    returnSession: { at: adDay(1), time: '19:00' },
    crew: ['Ramesh (DIT)', 'Sunil (Warehouse)', 'Anita (Driver)', 'Bikash (AC)', 'Prakash (Gaffer)'],
    vehicle: 'Camera Van (VH-01-BA-5920)',
    notes: 'Outdoor shoot in Dolpa. Weather dependent.',
  },
}

/**
 * Booking number → its sessions, crew, vehicle and notes. **Empty.**
 *
 * Nothing here may be keyed by a number a live booking could also carry — see
 * the archive above. Filling this needs a per-booking read
 * (`operation_sessions`, `crew_assignments`, the booking's own notes), not a
 * literal, and until then the Selected Event panel prints the bar's own window
 * and says session times live on the booking.
 */
export const EVENT_DETAIL: Record<string, EventDetail> = {}

/** §8.2 — a booking is cancelled, never deleted, so no action here deletes. */
export const EVENT_ACTIONS: Array<{ label: string; icon: IconName; to?: string; unavailable?: string }> = [
  { label: 'Edit Booking', icon: 'file' },
  { label: 'Duplicate', icon: 'package', unavailable: 'Duplicate needs the booking draft flow' },
  { label: 'Move / Drag', icon: 'arrow_right', unavailable: 'Drag-to-reschedule is not wired yet' },
  { label: 'More Actions', icon: 'more_vert', unavailable: 'The booking action menu lives on the booking page' },
]
