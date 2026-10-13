import { kathmanduCivil } from './bs'
import { operationalDayBounds, operationalDayOf } from './operationalDay'
import type { RentalWindow } from './availability'

const DAY_MS = 86_400_000
function validDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const time = Date.parse(`${day}T00:00:00Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day
}

/** Inclusive day selection, half-open booking window, using the configured Nepal shift. */
export function shortagePeriod(fromDay: string, toDay: string, startMinutes: number): RentalWindow | null {
  if (!validDay(fromDay) || !validDay(toDay) || fromDay > toDay) return null
  const from = operationalDayBounds(fromDay, startMinutes).fromAd
  const through = operationalDayBounds(toDay, startMinutes).toAd
  return { fromAd: new Date(from).toISOString(), toAd: new Date(Date.parse(through) + 1).toISOString() }
}

export function defaultShortageDays(now: Date, startMinutes: number): { from: string; to: string } {
  const from = operationalDayOf(now.toISOString(), startMinutes)
  return { from, to: new Date(Date.parse(`${from}T00:00:00Z`) + 30 * DAY_MS).toISOString().slice(0, 10) }
}

/** Calendar cells label civil dates; do not relabel the instant as the previous shift's date. */
export function shortageCalendarLink(instantAd: string): string {
  const civil = new Date(kathmanduCivil(new Date(instantAd))).toISOString().slice(0, 10)
  return `/calendar?d=${civil}`
}
