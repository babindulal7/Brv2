import { kathmanduCivil, NPT_OFFSET_MIN } from './bs'

/**
 * # The operational day — D4, ruled 30 Aug 2026
 *
 * `docs/booqable/REFERENCE_SPEC_v2.5.md` Appendix A0, D4: **the rental day runs
 * 06:00 → 06:00, as a setting.** Babin's ruling, evidenced twice in the live
 * Booqable account (Settings ▸ Rental period ▸ Default booking times, both
 * 06:00; and the client contract clause २.१) and by every captured booking
 * sitting at 06:00/06:15.
 *
 * This closes the `TODO(decision)` that lived in `queries/bookings.ts`'s
 * day-boundary block: "today's pickups" no longer means Kathmandu midnight to
 * midnight — it means the operational day, whose start the owner sets in
 * Settings (`operationalDayStart`, default `"06:00"`).
 *
 * ## What lives here, and what deliberately does not
 *
 * This module is the PURE half (Law 1): given a day and a start-of-day, it
 * answers where the day's boundaries sit and which operational day an instant
 * belongs to. It reads no storage — `queries/bookings.ts` reads the setting
 * and passes it in, the same split `lib/availability.ts` /
 * `queries/availability.ts` already use for the two availability rules.
 *
 * ## Which days this governs — and which it must NOT
 *
 * The operational day is the FLOOR's day: today's pickups, today's returns,
 * the Operations queues, the pickups report. It does **not** govern:
 *
 *  - **Finance day boundaries** (`queries/finance.ts` keeps its own
 *    calendar-midnight helpers). A payment taken at 05:30 belongs to that
 *    calendar date on the VAT books; moving tax-period boundaries with a floor
 *    setting would be a books-of-account change nobody ruled.
 *  - **Audit / activity-log day scopes** (`queries/audit.ts`). "What happened
 *    on the 12th" is a calendar question.
 *  - **BS calendar rendering** (`lib/bs.ts`). Which civil date it is never
 *    moves; only which *shift* an instant belongs to does.
 */

/** The ruled default — A0 D4. `settingsStore` carries the same string. */
export const OPERATIONAL_DAY_START_DEFAULT = '06:00'

/** Minutes after Kathmandu midnight that the ruled default names. */
export const OPERATIONAL_DAY_START_DEFAULT_MINUTES = 6 * 60

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * `"HH:mm"` → minutes after midnight, or `null` when the string is not a
 * clock time. `null` rather than a throw, because the one caller that faces
 * user-editable storage (`queries/bookings.ts`) must fall back to the ruled
 * default rather than take a screen down over a hand-edited localStorage —
 * the same posture `unitStatesForRule` takes on an unrecognised label.
 */
export function parseDayStart(value: string): number | null {
  const match = HH_MM.exec(value.trim())
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/**
 * The stored setting value → minutes, falling back to the RULED default on
 * anything unparseable. Falling back to something permissive (midnight) would
 * silently re-rule D4; falling back to the ruling keeps a corrupted setting
 * from changing which bookings the 5am shift sees.
 */
export function dayStartMinutesFrom(value: unknown): number {
  const parsed = typeof value === 'string' ? parseDayStart(value) : null
  return parsed ?? OPERATIONAL_DAY_START_DEFAULT_MINUTES
}

/**
 * `+05:45`, formatted from `bs.ts`'s `NPT_OFFSET_MIN` rather than typed again.
 * `Calendar.md` §4.2 calls holding more than one copy of Nepal's offset "the
 * highest-priority correctness bug in the product" — this is the one string
 * form, and `queries/bookings.ts` imports it instead of building its own.
 */
export const NPT_OFFSET_STRING = `${NPT_OFFSET_MIN < 0 ? '-' : '+'}${String(
  Math.floor(Math.abs(NPT_OFFSET_MIN) / 60),
).padStart(2, '0')}:${String(Math.abs(NPT_OFFSET_MIN) % 60).padStart(2, '0')}`

const DAY_MS = 86_400_000

/** `YYYY-MM-DD` + n days, UTC-midnight arithmetic — day numbers are never added. */
function shiftDay(dayAd: string, days: number): string {
  const t = Date.parse(`${dayAd}T00:00:00.000Z`)
  if (Number.isNaN(t)) {
    throw new Error(`Expected an AD day (YYYY-MM-DD), got ${JSON.stringify(dayAd)}`)
  }
  return new Date(t + days * DAY_MS).toISOString().slice(0, 10)
}

function two(n: number): string {
  return String(n).padStart(2, '0')
}

/** Minutes after midnight → `"HH:mm:00.000"`. */
function clockOf(minutes: number): string {
  return `${two(Math.floor(minutes / 60))}:${two(minutes % 60)}:00.000`
}

export interface OperationalDayBounds {
  /** First instant INSIDE the day — `<day>T<start><+05:45>`. */
  readonly fromAd: string
  /**
   * Last instant INSIDE the day, to the millisecond — one ms before the next
   * day's start. `applyListFilters` compares with `lte` ("inclusive at both
   * ends"), so the bound must be the last value inside rather than the first
   * value after; the microsecond sliver this leaves open is the same one the
   * old midnight boundary accepted knowingly, for the same reason.
   */
  readonly toAd: string
}

/**
 * The boundaries of one operational day.
 *
 * With `startMinutes = 360` (06:00), day `2026-08-12` runs
 * `2026-08-12T06:00:00.000+05:45` → `2026-08-13T05:59:59.999+05:45`.
 * With `startMinutes = 0` it degrades exactly to the old calendar-midnight
 * pair (`T00:00:00.000` → same-day `T23:59:59.999`), so a business that rules
 * the day starts at midnight gets precisely the pre-D4 behaviour.
 */
export function operationalDayBounds(dayAd: string, startMinutes: number): OperationalDayBounds {
  assertStartMinutes(startMinutes)
  const fromAd = `${dayAd}T${clockOf(startMinutes)}${NPT_OFFSET_STRING}`

  if (startMinutes === 0) {
    return { fromAd, toAd: `${dayAd}T23:59:59.999${NPT_OFFSET_STRING}` }
  }

  // One ms before the NEXT day's start: HH:(mm-1):59.999 of the next calendar day.
  const endMinutes = startMinutes - 1
  const toAd = `${shiftDay(dayAd, 1)}T${two(Math.floor(endMinutes / 60))}:${two(endMinutes % 60)}:59.999${NPT_OFFSET_STRING}`
  return { fromAd, toAd }
}

/**
 * Which operational day an instant belongs to.
 *
 * A booking at 05:30 Kathmandu belongs to YESTERDAY's operational day when the
 * day starts at 06:00, and to today's when it starts at 00:00 — that sentence
 * is the D4 acceptance test, pinned in `__tests__/operationalDay.test.ts`.
 *
 * Implemented by shifting the instant back by the day-start and asking
 * `kathmanduCivil` — the SAME function the render side uses to decide which
 * day an instant belongs to — which civil date the shifted instant falls on.
 * The day a screen filters by and the day it labels therefore come from one
 * arithmetic.
 */
export function operationalDayOf(instantAd: string, startMinutes: number): string {
  assertStartMinutes(startMinutes)
  const t = Date.parse(instantAd)
  if (Number.isNaN(t)) {
    throw new Error(`Expected a full ISO instant, got ${JSON.stringify(instantAd)}`)
  }
  return new Date(kathmanduCivil(new Date(t - startMinutes * 60_000))).toISOString().slice(0, 10)
}

function assertStartMinutes(startMinutes: number): void {
  if (!Number.isInteger(startMinutes) || startMinutes < 0 || startMinutes >= 24 * 60) {
    throw new Error(
      `The operational day start must be whole minutes within one day (0–1439); got ${JSON.stringify(startMinutes)}. ` +
        'Use dayStartMinutesFrom() on the stored setting rather than passing it raw.',
    )
  }
}
