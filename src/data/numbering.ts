import type { Kpi } from '../components/ui/Page'
import type { IconName } from '../components/ui/Icon'
import type { Slice } from '../components/ui/Charts'
import type { BrandKey } from '../lib/status'

/**
 * Numbering Sequences seed data — transcribed from render `CD132C04`
 * (`03 Core Modules/Settings/Numbering Sequences.PNG`) and its spec.
 *
 * This module is the **ID registry of record**: every other screen's record
 * numbers are supposed to be what these formats produce. Three consequences
 * shape the file:
 *
 *  1. Nothing that can be derived is typed twice. The KPI counts, the category
 *     counts, the "Last Sequence Used" string, the padding lengths, the total
 *     length and the pagination totals are all computed from `SEQUENCES`, so a
 *     row edit cannot leave a headline figure lying about the table below it.
 *  2. `SEED_ERRORS` asserts the invariants at module load and **reports** them
 *     (never throws — a module-scope throw runs before React mounts and blanks
 *     the app). The page renders them.
 *  3. Where the render contradicts itself, the reasoning is written down beside
 *     the correction rather than left for the next reader to rediscover.
 *
 * ── Corrections applied to the render ─────────────────────────────────────
 *
 * **CASE is four digits, not five.** The render draws `CASE-YYYY-NNNNN`, but
 * `04 Operations/Cases.md`'s ID registry and `src/data/cases.ts` both use the
 * four-digit form and `cases.ts` asserts `/^CASE-\d{4}-\d{4}$/` at load. Two
 * authorities against one stale render: the format here is `CASE-YYYY-NNNN`.
 *
 * **Five formats disagreed with their own counters.** A format's run of `N`s is
 * its padding length, so `BK-YYYY-NNNNN` (five) cannot produce the counter
 * `004861` (six) that the same render prints in the table, in the "Last
 * Sequence Used" KPI and as "Padding Length 6" in the configuration panel. The
 * counter is corroborated three ways and the format string once, so the format
 * strings for BK, INV, CL, PAY and EXP were widened/narrowed to match their
 * counters. `assertFormatMatchesCounter` in `SEED_ERRORS` now makes that class
 * of mistake impossible to reintroduce silently.
 *
 * ── TODO(decision) — counters disagree with the modules they number ────────
 *
 * Separately from the digit-form fix above, the counters this render supplies
 * are far ahead of the highest ID actually seeded in the module each sequence
 * numbers, and several use a padding width no other file uses:
 *
 *     BK    here 004861 (6)  ·  booking.ts / calendar.ts max BK-2026-0753 (4)
 *     INV   here 00492  (5)  ·  documents.ts / pulse.ts  max INV-2026-0162 (4)
 *     CL    here 002481 (6)  ·  clients.ts               max CL-2026-0045  (4)
 *     MT    here 00054  (5)  ·  maintenance.ts / cases.ts max MT-2026-0043 (4)
 *     CASE  here 0182   (4)  ·  cases.ts                 max CASE-2026-0041
 *     PAY   here 006103 (6)  ·  documents.ts             max PAY-2026-0745 (4)
 *     EXP   here 00276  (5)  ·  expenseReports.ts        max EXP-2026-0724 (4)
 *
 * Every one of those modules uses **four** digits. Changing the padding here
 * would move the "Last Sequence Used" KPI, the live preview and the total
 * length — headline figures the render supplies — so it is not done unasked.
 * The ruling needed is: does the app standardise on four-digit counters
 * (making this render stale in seven more places), or do the modules re-pad?
 */

/* ── vocabulary ────────────────────────────────────────────────────────────
   Screen-local to sequences. `lib/workflow.ts` owns BookingStatus / JobState /
   ItemState and none of them describe a counter, so nothing here shadows it. */

export const MODULES = ['Rental', 'Finance', 'Inventory', 'Operations', 'Administration'] as const
export type SequenceModule = (typeof MODULES)[number]

/** Spec § Reset Rules, in the order the spec lists them. */
export const RESET_RULES = [
  'Never',
  'Daily',
  'Monthly',
  'Calendar Year',
  'Nepali Fiscal Year',
  'Gregorian Fiscal Year',
  'Manual',
] as const
export type ResetRule = (typeof RESET_RULES)[number]

/** Spec § Branch Rules. Scope selects which **counter** is used, not what the
 *  string looks like — a Per Branch sequence keeps one counter per branch and
 *  only prints a branch code if its format carries a `BR` token. */
export const SCOPES = ['Global', 'Per Branch', 'Per Warehouse'] as const
export type SequenceScope = (typeof SCOPES)[number]

export const STATUSES = ['Active', 'Archived'] as const
export type SequenceStatus = (typeof STATUSES)[number]

/** Every sequence starts at 1 — that is the definition of a counter, not a
 *  seeded figure. The render confirms it for BK. */
export const STARTING_NUMBER = '1'

/* ── the sequences ─────────────────────────────────────────────────────────
   Ordering follows the render's table for the ten rows it draws, then the
   spec's § Default System Sequences order for the eight it does not. */

export interface SequenceRow {
  code: string
  name: string
  prefix: string
  module: SequenceModule
  /** Only BK's description appears in the render; the field is optional there
   *  (no required marker), so the rest stay empty rather than invented. */
  description: string | null
  /** `null` = neither the render nor the spec supplies a format for this one. */
  format: string | null
  counter: string | null
  resetRule: ResetRule | null
  scope: SequenceScope | null
  status: SequenceStatus
}

export const SEQUENCES: SequenceRow[] = [
  { code: 'BK', name: 'Booking', prefix: 'BK', module: 'Rental', description: 'Rental booking references', format: 'BK-YYYY-NNNNNN', counter: '004861', resetRule: 'Calendar Year', scope: 'Per Branch', status: 'Active' },
  { code: 'INV', name: 'Invoice', prefix: 'INV', module: 'Finance', description: null, format: 'INV-BR-YYYY-NNNNN', counter: '00492', resetRule: 'Calendar Year', scope: 'Per Branch', status: 'Active' },
  { code: 'CL', name: 'Client', prefix: 'CL', module: 'Administration', description: null, format: 'CL-YYYY-NNNNNN', counter: '002481', resetRule: 'Never', scope: 'Global', status: 'Active' },
  { code: 'EQ', name: 'Equipment', prefix: 'EQ', module: 'Inventory', description: null, format: 'EQ-CAT-NNNNNN', counter: '000824', resetRule: 'Never', scope: 'Global', status: 'Active' },
  { code: 'MT', name: 'Maintenance', prefix: 'MT', module: 'Operations', description: null, format: 'MT-YYYY-NNNNN', counter: '00054', resetRule: 'Nepali Fiscal Year', scope: 'Per Branch', status: 'Active' },
  { code: 'CASE', name: 'Incident Case', prefix: 'CASE', module: 'Operations', description: null, format: 'CASE-YYYY-NNNN', counter: '0182', resetRule: 'Calendar Year', scope: 'Per Branch', status: 'Active' },
  { code: 'PAY', name: 'Payment', prefix: 'PAY', module: 'Finance', description: null, format: 'PAY-YYYY-NNNNNN', counter: '006103', resetRule: 'Calendar Year', scope: 'Per Branch', status: 'Active' },
  { code: 'EXP', name: 'Expense', prefix: 'EXP', module: 'Finance', description: null, format: 'EXP-YYYY-NNNNN', counter: '00276', resetRule: 'Calendar Year', scope: 'Per Branch', status: 'Active' },
  { code: 'PUR', name: 'Purchase', prefix: 'PUR', module: 'Finance', description: null, format: 'PUR-YYYY-NNNNN', counter: '00153', resetRule: 'Calendar Year', scope: 'Per Branch', status: 'Active' },
  { code: 'TRF', name: 'Transfer', prefix: 'TRF', module: 'Inventory', description: null, format: 'TRF-YYYY-NNNNN', counter: '00092', resetRule: 'Calendar Year', scope: 'Per Branch', status: 'Active' },

  /*
   * The render stops at ten but claims eighteen — "Showing 1 to 10 of 18", the
   * "Active Sequences 18" KPI and the rail summary all agree on eighteen, and
   * the spec's § Default System Sequences names exactly eighteen. The eight
   * below complete that set so the counts reconcile against real rows instead
   * of a hardcoded total.
   *
   * Their identity (code, name, module) is specified; their format, counter,
   * reset rule and scope are not, anywhere. Those stay `null` and render as a
   * stated "Not configured" rather than as a made-up figure.
   */
  { code: 'DOC', name: 'Document', prefix: 'DOC', module: 'Administration', description: null, format: null, counter: null, resetRule: null, scope: null, status: 'Active' },
  { code: 'BND', name: 'Bundle', prefix: 'BND', module: 'Rental', description: null, format: null, counter: null, resetRule: null, scope: null, status: 'Active' },
  { code: 'MEM', name: 'Membership', prefix: 'MEM', module: 'Rental', description: null, format: null, counter: null, resetRule: null, scope: null, status: 'Active' },
  { code: 'SR', name: 'Sub Rental', prefix: 'SR', module: 'Rental', description: null, format: null, counter: null, resetRule: null, scope: null, status: 'Active' },
  { code: 'COUP', name: 'Coupon', prefix: 'COUP', module: 'Finance', description: null, format: null, counter: null, resetRule: null, scope: null, status: 'Active' },
  { code: 'DISC', name: 'Discount', prefix: 'DISC', module: 'Finance', description: null, format: null, counter: null, resetRule: null, scope: null, status: 'Active' },
  { code: 'AUD', name: 'Audit', prefix: 'AUD', module: 'Administration', description: null, format: null, counter: null, resetRule: null, scope: null, status: 'Active' },
  { code: 'LOG', name: 'Activity Log', prefix: 'LOG', module: 'Administration', description: null, format: null, counter: null, resetRule: null, scope: null, status: 'Active' },
]

/** The eight above, so the page can explain the "Not configured" rows once
 *  rather than repeating a tooltip on every cell. */
export const UNCONFIGURED_CODES = SEQUENCES.filter((s) => s.format === null).map((s) => s.code)

/* ── number building ───────────────────────────────────────────────────────

   A format is `-`-joined tokens. The first is the literal prefix; the rest are
   the spec's § Number Format tokens. Building the preview from the format —
   rather than from a fixed five-chip string — is what keeps the Preview
   Generator from contradicting the Format column directly above it.

   It also reproduces the spec's own worked examples exactly:
     INV-BR-YYYY-NNNNN  + KTM → INV-KTM-2026-00492   (spec § Number Format)
     EQ-CAT-NNNNNN            → EQ-CAM-000824        (spec § Number Format)
     BK-YYYY-NNNNNN           → BK-2026-004861       (render's "Last Used" KPI)
*/

export type TokenKind = 'PREFIX' | 'YEAR' | 'MONTH' | 'DAY' | 'BRANCH' | 'WAREHOUSE' | 'CATEGORY' | 'COUNTER'

/** Spec § Number Format, with the placeholder each token wears in a format. */
export const FORMAT_TOKENS: Array<{ kind: TokenKind; placeholder: string; label: string; note: string }> = [
  { kind: 'PREFIX', placeholder: '(literal)', label: 'Prefix', note: 'The first segment, written literally' },
  { kind: 'YEAR', placeholder: 'YYYY', label: 'Year', note: 'AD year at the moment of creation' },
  { kind: 'MONTH', placeholder: 'MM', label: 'Month', note: 'Two-digit AD month' },
  { kind: 'DAY', placeholder: 'DD', label: 'Day', note: 'Two-digit AD day' },
  { kind: 'BRANCH', placeholder: 'BR', label: 'Branch code', note: 'Three-letter branch code' },
  { kind: 'WAREHOUSE', placeholder: 'WH', label: 'Warehouse code', note: 'Warehouse code' },
  { kind: 'CATEGORY', placeholder: 'CAT', label: 'Custom text', note: 'Substituted at creation, e.g. the equipment category' },
  { kind: 'COUNTER', placeholder: 'N…', label: 'Auto number', note: 'One N per digit of padding' },
]

const TONE_BY_KIND: Record<TokenKind, BrandKey> = {
  PREFIX: 'primary',
  YEAR: 'success',
  MONTH: 'primary',
  DAY: 'primary',
  BRANCH: 'progress',
  WAREHOUSE: 'progress',
  CATEGORY: 'progress',
  COUNTER: 'primary',
}

export interface Segment {
  kind: TokenKind
  label: string
  value: string
  tone: BrandKey
}

export interface BuildContext {
  year: string
  month: string
  day: string
  branchCode: string
  warehouseCode: string
  /** Already padded. */
  counter: string
}

function kindOf(part: string, index: number): TokenKind {
  if (index === 0) return 'PREFIX'
  if (/^N+$/.test(part)) return 'COUNTER'
  if (part === 'YYYY') return 'YEAR'
  if (part === 'MM') return 'MONTH'
  if (part === 'DD') return 'DAY'
  if (part === 'BR') return 'BRANCH'
  if (part === 'WH') return 'WAREHOUSE'
  return 'CATEGORY'
}

/** Splits a format into labelled, coloured segments with their live values. */
export function segmentsOf(format: string, ctx: BuildContext): Segment[] {
  return format.split('-').map((part, i) => {
    const kind = kindOf(part, i)
    const value =
      kind === 'PREFIX'
        ? part
        : kind === 'COUNTER'
          ? ctx.counter
          : kind === 'YEAR'
            ? ctx.year
            : kind === 'MONTH'
              ? ctx.month
              : kind === 'DAY'
                ? ctx.day
                : kind === 'BRANCH'
                  ? ctx.branchCode
                  : kind === 'WAREHOUSE'
                    ? ctx.warehouseCode
                    : part
    return { kind, label: kind, value, tone: TONE_BY_KIND[kind] }
  })
}

export function buildNumber(format: string, ctx: BuildContext): string {
  return segmentsOf(format, ctx)
    .map((s) => s.value)
    .join('-')
}

/** Padding is the length of the counter's `N` run — one place, so the table,
 *  the configuration panel and the preview cannot disagree about it. */
export function paddingOf(format: string): number {
  const run = format.split('-').find((p) => /^N+$/.test(p))
  return run ? run.length : 0
}

export function padTo(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

/** Counters are append-only; `step` never goes negative. */
export function advance(counter: string, step: number): string {
  return padTo(Number(counter) + Math.max(0, step), counter.length)
}

/* ── preview generator inputs ──────────────────────────────────────────────
   The render dates its preview to 2026-05. Left as the supplied figure rather
   than read off the clock so a screenshot diff against the render stays clean;
   everything downstream of it is computed. */

export const PREVIEW_YEAR = '2026'
export const PREVIEW_MONTH = '05'
export const PREVIEW_DAY = '18'

/**
 * Branch codes: KTM is printed in the render, and `data/warehouse.ts` confirms
 * KTM and PKR (`WH-KTM-01`, `WH-PKR-01`).
 * TODO(decision) — Butwal and Bharatpur have no code anywhere in the app or the
 * specs. BTL/BRT below follow the same first-consonants convention as the two
 * confirmed ones and need a ruling before any record is issued against them.
 */
export const BRANCHES: Array<{ name: string; code: string; confirmed: boolean }> = [
  { name: 'Kathmandu', code: 'KTM', confirmed: true },
  { name: 'Pokhara', code: 'PKR', confirmed: true },
  { name: 'Butwal', code: 'BTL', confirmed: false },
  { name: 'Bharatpur', code: 'BRT', confirmed: false },
]

/** The render offers one. No sequence is Per Warehouse, so the control that
 *  reads this is always in its stated-unavailable state. */
export const WAREHOUSES: Array<{ name: string; code: string }> = [{ name: 'Main Warehouse', code: 'MAIN' }]

export const DEFAULT_SEQUENCE_CODE = 'BK'

export const CONFIG_TABS = ['General', 'Format', 'Reset Rules', 'Scope', 'Advanced'] as const
export type ConfigTab = (typeof CONFIG_TABS)[number]

export const PER_PAGE = [10, 25, 50] as const

/* ── derived headline figures ──────────────────────────────────────────────
   Everything below counts rows. None of it is typed as a literal. */

const ACTIVE = SEQUENCES.filter((s) => s.status === 'Active')

/** Spec § Reset Rules: an *automatic* rule is one that fires without a human. */
const AUTO_RESET = SEQUENCES.filter((s) => s.resetRule !== null && s.resetRule !== 'Never' && s.resetRule !== 'Manual')

/** Spec § Validation Rules — "No duplicate prefixes". */
const DUPLICATE_PREFIXES = SEQUENCES.filter(
  (s, i) => SEQUENCES.findIndex((o) => o.prefix.toUpperCase() === s.prefix.toUpperCase()) !== i,
).map((s) => s.prefix)

const BK = SEQUENCES.find((s) => s.code === 'BK')

/** The render's "Last Sequence Used" KPI, rebuilt from BK's own format and
 *  counter instead of copied as a string — if either changes, so does this. */
export const LAST_SEQUENCE_USED =
  BK && BK.format && BK.counter
    ? buildNumber(BK.format, {
        year: PREVIEW_YEAR,
        month: PREVIEW_MONTH,
        day: PREVIEW_DAY,
        branchCode: 'KTM',
        warehouseCode: 'MAIN',
        counter: BK.counter,
      })
    : '—'

/** Supplied by the render; not derivable from a static seed. */
export const GENERATED_TODAY = '486'
export const GENERATED_TODAY_DELTA = '18% vs yesterday'
export const LAST_GENERATED_AGO = '2 mins ago'
export const HEALTH_SCORE = '100%'
export const ARCHIVED_COUNT = '3'
export const RECORDS_THIS_MONTH = '12,856'

export const KPIS: Kpi[] = [
  { label: 'Active Sequences', value: String(ACTIVE.length), icon: 'queues', accent: 'primary', note: 'View all' },
  {
    label: 'Records Generated Today',
    value: GENERATED_TODAY,
    icon: 'checklist',
    accent: 'success',
    delta: { direction: 'up', text: GENERATED_TODAY_DELTA },
  },
  { label: 'Last Sequence Used', value: LAST_SEQUENCE_USED, icon: 'file', accent: 'primary', note: LAST_GENERATED_AGO },
  {
    label: 'Duplicate IDs',
    value: String(DUPLICATE_PREFIXES.length),
    icon: 'alert_triangle',
    accent: 'danger',
    note: DUPLICATE_PREFIXES.length === 0 ? 'No duplicates' : DUPLICATE_PREFIXES.join(', '),
  },
  { label: 'Auto Reset Rules', value: String(AUTO_RESET.length), icon: 'refresh', accent: 'progress', note: 'View rules' },
  { label: 'Sequence Health', value: HEALTH_SCORE, icon: 'activity', accent: 'success', note: 'All good' },
]

/* ── categories rail ───────────────────────────────────────────────────────

   The render's counts are 4 / 6 / 6 / 6 / 5 = 27 against the "18 sequences"
   printed in the same card, so they cannot all be right. Assigning the spec's
   eighteen sequences to the five modules reproduces the render's Rental 4 and
   Finance 6 exactly and totals 18 — two independent corroborations that this
   is the intended mapping and that Inventory / Operations / Administration
   were the stale numbers. Counts are computed from `SEQUENCES`, so the rail
   can no longer drift from the table beside it.

   The render also repeats an "All Categories 18" row below a divider. It
   selects the identical set as "All Sequences" at the top of the same list, so
   it is dropped rather than shipped as a second control that cannot differ. */

export interface Category {
  name: string
  /** `null` = no filter. */
  module: SequenceModule | null
  icon: IconName
}

export const CATEGORIES: Category[] = [
  { name: 'All Sequences', module: null, icon: 'queues' },
  { name: 'Rental', module: 'Rental', icon: 'calendar' },
  { name: 'Finance', module: 'Finance', icon: 'dollar' },
  { name: 'Inventory', module: 'Inventory', icon: 'box' },
  { name: 'Operations', module: 'Operations', icon: 'crew' },
  { name: 'Administration', module: 'Administration', icon: 'settings' },
]

export function countFor(module: SequenceModule | null): number {
  return module === null ? SEQUENCES.length : SEQUENCES.filter((s) => s.module === module).length
}

/* ── analytics ─────────────────────────────────────────────────────────────
   Bar heights and the trend polyline are transcribed from the render's shapes,
   the same way the existing bar heights were. They carry no unit and the page
   labels neither with a value. */

export const ANALYTICS = {
  generated: {
    value: RECORDS_THIS_MONTH,
    note: 'This Month',
    delta: '24% vs last month',
    /** Eleven points, read off the render's polyline. Relative shape only. */
    trend: [20, 42, 47, 21, 38, 36, 60, 35, 52, 48, 63],
  },
  dailyTrend: {
    yTicks: ['3K', '2K', '1K', '0'],
    avg: 'Avg. 1,836/day',
    bars: [
      { label: 'Tue', v: 58 },
      { label: 'Wed', v: 44 },
      { label: 'Thu', v: 66 },
      { label: 'Fri', v: 72 },
      { label: 'Sat', v: 54 },
      { label: 'Sun', v: 78 },
      { label: 'Mon', v: 88 },
    ],
  },
  topSequences: [
    { name: 'BK – Booking', value: '5,812', pct: 100 },
    { name: 'INV – Invoice', value: '3,246', pct: 56 },
    { name: 'PAY – Payment', value: '1,256', pct: 22 },
    { name: 'EQ – Equipment', value: '1,102', pct: 19 },
    { name: 'CASE – Case', value: '682', pct: 12 },
  ],
  resetHistory: {
    total: '17',
    rows: [
      { name: 'BK – Booking', rule: 'Calendar Year', at: '2082-01-01' },
      { name: 'INV – Invoice', rule: 'Calendar Year', at: '2082-01-01' },
      { name: 'MT – Maintenance', rule: 'Nepali Fiscal Year', at: '2082-01-16' },
      { name: 'EXP – Expense', rule: 'Calendar Year', at: '2082-01-01' },
      { name: 'PAY – Payment', rule: 'Calendar Year', at: '2082-01-01' },
    ],
  },
  branchMix: [
    { label: 'Kathmandu', value: 7421, display: '58%', percent: '(7,421)' },
    { label: 'Pokhara', value: 3213, display: '25%', percent: '(3,213)' },
    { label: 'Butwal', value: 1542, display: '12%', percent: '(1,542)' },
    { label: 'Bharatpur', value: 680, display: '5%', percent: '(680)' },
  ] as Slice[],
}

/* ── right rail ────────────────────────────────────────────────────────────*/

export const SUMMARY_PERIODS = ['This Month', 'This Quarter', 'This Year'] as const

export const SUMMARY = [
  { label: 'Active Sequences', value: String(ACTIVE.length) },
  { label: 'Archived Sequences', value: ARCHIVED_COUNT },
  { label: 'Records Generated', value: RECORDS_THIS_MONTH },
  { label: 'Last Generated', value: LAST_GENERATED_AGO },
  { label: 'Health Score', value: HEALTH_SCORE },
]

/**
 * The render rings each alert in its own hue. Its palette includes an orange
 * that `BRAND` has no key for, so Disabled Sequences takes `neutral` — §4.2's
 * five-colour law, not a shortage of ideas.
 */
export const ALERTS: Array<{ text: string; count: string; icon: IconName; tone: BrandKey }> = [
  { text: 'Counter Near Limit', count: '0', icon: 'alert_triangle', tone: 'progress' },
  { text: 'Duplicate Prefix Risk', count: String(DUPLICATE_PREFIXES.length), icon: 'flag', tone: 'progress' },
  { text: 'Failed Resets', count: '0', icon: 'error', tone: 'danger' },
  { text: 'Disabled Sequences', count: String(SEQUENCES.length - ACTIVE.length), icon: 'eye', tone: 'neutral' },
  { text: 'Configuration Conflicts', count: '0', icon: 'check', tone: 'success' },
]

export const QUICK_ACTIONS: Array<{ label: string; icon: IconName; tone: BrandKey }> = [
  { label: 'Add Sequence', icon: 'plus', tone: 'primary' },
  { label: 'Reset Counter', icon: 'refresh', tone: 'success' },
  { label: 'Export Config', icon: 'download', tone: 'progress' },
  { label: 'Test Sequence', icon: 'tool', tone: 'neutral' },
]

/** The render puts an avatar beside each entry. No actor is named for any of
 *  them anywhere, so each takes the icon of what happened instead of a face
 *  attached to nobody. */
export const ACTIVITY: Array<{ what: string; detail: string; at: string; icon: IconName; tone: BrandKey }> = [
  { what: 'Sequence Created', detail: 'TRF – Transfer sequence created', at: 'Today, 10:24 AM', icon: 'plus', tone: 'success' },
  { what: 'Counter Reset', detail: 'BK – Booking counter reset to 1', at: 'Today, 09:15 AM', icon: 'refresh', tone: 'progress' },
  { what: 'Configuration Updated', detail: 'INV – Invoice format updated', at: 'Yesterday, 04:32 PM', icon: 'settings', tone: 'primary' },
  { what: 'Prefix Changed', detail: 'EXP – Prefix changed from EX to EXP', at: 'Yesterday, 11:05 AM', icon: 'tool', tone: 'primary' },
]

export const INSIGHTS = [
  'All sequences are healthy.',
  'No unused sequences detected.',
  'Consider adding branch code to EQ.',
  'MT sequence reset will occur in 24 days.',
  'Optimal padding length configured.',
]

/* ── seed invariants ───────────────────────────────────────────────────────
   Reported, never thrown: a module-scope throw runs before React mounts and
   blanks the app. `NumberingSequences.tsx` renders whatever lands here. */

export const SEED_ERRORS: string[] = (() => {
  const errs: string[] = []

  const seenCode = new Set<string>()
  const seenPrefix = new Set<string>()
  for (const s of SEQUENCES) {
    if (seenCode.has(s.code)) errs.push(`Duplicate sequence code "${s.code}".`)
    seenCode.add(s.code)

    const p = s.prefix.toUpperCase()
    if (seenPrefix.has(p)) errs.push(`§ Validation Rules: duplicate prefix "${s.prefix}".`)
    seenPrefix.add(p)

    // A format's run of Ns *is* its padding, so a counter of a different width
    // could never have been produced by it. This is the check that catches the
    // CASE five-vs-four-digit class of mistake.
    if (s.format !== null && s.counter !== null) {
      const width = paddingOf(s.format)
      if (width === 0) {
        errs.push(`"${s.code}" format "${s.format}" has no counter token.`)
      } else if (width !== s.counter.length) {
        errs.push(
          `"${s.code}" format "${s.format}" pads to ${width} digits but its counter "${s.counter}" is ${s.counter.length}.`,
        )
      }
    }

    if ((s.format === null) !== (s.counter === null)) {
      errs.push(`"${s.code}" has a format without a counter, or the reverse.`)
    }
  }

  const byModule = CATEGORIES.filter((c) => c.module !== null).reduce((n, c) => n + countFor(c.module), 0)
  if (byModule !== SEQUENCES.length) {
    errs.push(`Category counts total ${byModule} but there are ${SEQUENCES.length} sequences.`)
  }

  for (const s of SEQUENCES) {
    if (!MODULES.includes(s.module)) errs.push(`"${s.code}" is in module "${s.module}", which has no category row.`)
  }

  return errs
})()
