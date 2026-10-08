import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { RentalWindow } from './availability'
import { getBusinessToday } from './bs'

/**
 * # The availability window, read from and written to the URL
 *
 * **PLAN.md §4.44, ruled 4 Sep 2026 (option b).** Availability is not a property
 * of a bundle — it is the answer to "free *when*?" — so the operator picks the
 * window, and it lives in the URL so a checked availability can be linked and
 * shared.
 *
 * Extracted from `modules/inventory/Bundles.tsx` when the bundle **detail** page
 * needed the same window: the guard below is a correctness rule, not a
 * convenience, and two copies of it would drift. Both screens now read the same
 * `?from=` / `?to=` pair, so a link from the list to the detail page carries the
 * operator's window across and the two screens cannot answer different questions
 * about the same bundle.
 */

/** `yyyy-mm-dd` in UTC — what `DateField` reads and writes. */
export function dayValue(iso: string): string {
  return iso.slice(0, 10)
}

/**
 * A day string back to a full UTC instant. **Law — store AD in UTC**; the BS
 * line is rendered from this, never stored.
 */
export function startOfDayUtc(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toISOString()
}

export function addDaysUtc(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString()
}

export interface RentalWindowParams {
  window: RentalWindow
  /** Write one end back to the URL. Empty string clears it back to the default. */
  setWindow: (which: 'from' | 'to', day: string) => void
  /** `?from=…&to=…` for the CURRENT window, to append to a link. */
  search: string
}

/**
 * The window in `?from=` / `?to=`, defaulting to today → tomorrow.
 *
 * One day, half-open, matching `RENTAL_WINDOW_BOUNDS` (§4.30(b)). The guard is
 * the load-bearing part: a window must have width, because `half-open` means
 * `[from, to)`, so `from === to` holds nothing and **every line would read as
 * free** — the exact wrong green §4.44 exists to prevent. A backwards or empty
 * range is pushed to one day rather than passed through.
 *
 * @param onChange run after a window edit — e.g. a list resetting to page 1.
 */
export function useRentalWindowParams(onChange?: () => void): RentalWindowParams {
  const [params, setParams] = useSearchParams()

  const todayIso = useMemo(() => startOfDayUtc(getBusinessToday().toISOString().slice(0, 10)), [])
  const from = params.get('from')
  const to = params.get('to')

  const fromAd = from ? startOfDayUtc(from) : todayIso
  const toAdRaw = to ? startOfDayUtc(to) : addDaysUtc(todayIso, 1)
  const toAd = Date.parse(toAdRaw) > Date.parse(fromAd) ? toAdRaw : addDaysUtc(fromAd, 1)

  const setWindow = (which: 'from' | 'to', day: string) => {
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (day) next.set(which, day)
        else next.delete(which)
        return next
      },
      { replace: true },
    )
    onChange?.()
  }

  /* Built from the RESOLVED window, not from the raw params — a link made while
     the URL carries no `?from=` still hands the destination the same day the
     operator is looking at, instead of letting it re-default independently. */
  const search = `?from=${dayValue(fromAd)}&to=${dayValue(toAd)}`

  return { window: { fromAd, toAd }, setWindow, search }
}
