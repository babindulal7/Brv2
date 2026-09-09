import { formatBsOrAd, formatAd } from './bs'

/**
 * # Preventive service — the RULE
 *
 * RULING 2026-09-08 (R-28). Babin ruled three things and this module holds the
 * reading half of all three:
 *
 *   1. a unit is due when EITHER its elapsed-time interval OR its usage interval
 *      since the last completed preventive job is reached, whichever first;
 *   2. being due **warns only** — the unit stays bookable;
 *   3. the interval lives on the product MODEL.
 *
 * ## Law 1: this module decides, `queries/serviceDue.ts` fetches
 *
 * Nothing here touches a database, so every sentence a screen shows is testable
 * by execution. And nothing here re-derives due-ness: `due_reason` is computed
 * by `product_units_service_v` (migration `0103`) and read, not recomputed. A
 * second implementation of "is this due" in TypeScript is precisely the drift
 * this repo keeps paying for — the VAT rate has three sources and none of them
 * is authoritative. There is one source for this, and it is the view.
 *
 * What IS decided here is how the answer is SAID: which token, which words,
 * which date. That is presentation, it has no other home, and it is the part a
 * test can pin without a Postgres.
 *
 * ## Never colour alone
 *
 * Every state below carries a label AND an icon. `tone` is the third channel,
 * not the only one — CLAUDE.md's "never colour alone", which is an
 * accessibility rule before it is a style one.
 */

/** One row of `product_units_service_v`, as the view spells it. */
export interface ServiceRow {
  readonly unitId: string
  readonly productId: string
  /** When the last completed `Preventive Service` job finished, or intake. */
  readonly lastServiceAt: string
  readonly daysSinceService: number
  readonly rentalDaysSinceService: number
  readonly meterHoursSinceService: number
  /** The TIME due date. Null when the model sets no day interval — see `0103`. */
  readonly dueAt: string | null
  /** `'time'` · `'usage'` · null when the model has no plan, or nothing is due. */
  readonly dueReason: 'time' | 'usage' | null
  /** Days past `due_at` + grace. Null for a usage-only reason — see `0103`. */
  readonly overdueDays: number | null
  readonly serviceIntervalDays: number | null
  readonly serviceIntervalRentalDays: number | null
  readonly serviceIntervalMeterHours: number | null
  readonly serviceGraceDays: number
}

/** What a screen renders. `null` from `serviceStatus` means: show nothing. */
export interface ServiceStatus {
  /** `'due'` while inside the grace window, `'overdue'` past it. */
  readonly level: 'due' | 'overdue'
  /** The badge's words. Never the only signal — see the module note. */
  readonly label: string
  /** A design token name, resolved by `Badge`. Never the only signal either. */
  readonly tone: 'neutral' | 'danger'
  /** The tooltip: why it is due, and against what. */
  readonly detail: string
}

/**
 * Is this unit due, and how should that be said?
 *
 * `null` when nothing is due — which is the normal answer for every unit of
 * every model that has no preventive plan, and that is most of the catalogue.
 * Callers render nothing rather than an "OK" badge: a row that says nothing is
 * a row with nothing to say, and a fleet of green ticks trains the eye to skip
 * the one amber one.
 */
export function serviceStatus(row: ServiceRow): ServiceStatus | null {
  if (row.dueReason === null) return null

  const overdue = row.overdueDays !== null && row.overdueDays > 0

  return {
    level: overdue ? 'overdue' : 'due',
    label: overdue ? `Overdue by ${String(row.overdueDays ?? 0)} days` : 'Service due',
    /* R-28: the badge is a NEUTRAL token while it is merely due, and danger only
       once it is past grace. Due is information; overdue is a problem. Painting
       "due" in danger from day one is how a warning becomes wallpaper. */
    tone: overdue ? 'danger' : 'neutral',
    detail: serviceDetail(row),
  }
}

/**
 * The tooltip R-28 specifies, in its own words:
 *
 *     Due 14 Bhadra 2083 · 30 Aug 2026 — time
 *     — usage (42 of 40 rental days)
 *
 * The usage sentence names the counter that crossed and what it crossed, because
 * "due" with no number is a fact an operator cannot check. Where BOTH usage
 * counters have crossed, rental days are named first: they are the ones a
 * coordinator can reconcile against a booking list without opening the unit.
 */
export function serviceDetail(row: ServiceRow): string {
  if (row.dueReason === 'time') {
    const due = row.dueAt === null ? null : new Date(row.dueAt)
    const when =
      due === null || Number.isNaN(due.getTime())
        ? `${String(row.daysSinceService)} days since the last service`
        : `Due ${formatBsOrAd(due)} · ${formatAd(due)}`
    return `${when} — time (${String(row.daysSinceService)} of ${String(row.serviceIntervalDays ?? 0)} days)`
  }

  if (
    row.serviceIntervalRentalDays !== null &&
    row.rentalDaysSinceService >= row.serviceIntervalRentalDays
  ) {
    return `Due — usage (${String(row.rentalDaysSinceService)} of ${String(row.serviceIntervalRentalDays)} rental days)`
  }

  if (
    row.serviceIntervalMeterHours !== null &&
    row.meterHoursSinceService >= row.serviceIntervalMeterHours
  ) {
    return `Due — usage (${formatHours(row.meterHoursSinceService)} of ${formatHours(row.serviceIntervalMeterHours)} meter hours)`
  }

  /* Unreachable while the view and this module agree on what `'usage'` means.
     Stated rather than thrown: a tooltip is not worth an exception, and a
     sentence that says the reason is unreadable is more useful to whoever has to
     fix the disagreement than a blank one. */
  return 'Due — usage, but the counter that crossed could not be identified.'
}

/** One decimal, and no trailing `.0` — a meter reads 42 hours, not 42.0. */
function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}

/**
 * Does this model have a preventive plan at all?
 *
 * The empty state R-28 asks the model page for (`No preventive plan`) and the
 * answer to "why does nothing on this model ever badge". All three intervals
 * null means every trigger is off, which is deliberate and is the default for
 * every model in the catalogue.
 */
export function hasServicePlan(model: {
  serviceIntervalDays: number | null
  serviceIntervalRentalDays: number | null
  serviceIntervalMeterHours: number | null
}): boolean {
  return (
    model.serviceIntervalDays !== null ||
    model.serviceIntervalRentalDays !== null ||
    model.serviceIntervalMeterHours !== null
  )
}
