/** `450` (minutes since midnight) → `"7:30 AM"`. */
export function clock(minOfDay: number): string {
  let h = Math.floor(minOfDay / 60) % 24
  const m = minOfDay % 60
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ap}`
}

/**
 * `540` → `"09:00 AM"`. Two-digit hour, so a column of times aligns without a
 * monospace hack. Dashboard.md §6 renders pickup times this way.
 */
export function clockPad(minOfDay: number): string {
  let h = Math.floor(minOfDay / 60) % 24
  const m = minOfDay % 60
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}`
}

/**
 * South Asian (lakh) digit grouping — `185000` → `"1,85,000"`. Foundation §02
 * and Dashboard.md §18 both require it; `toLocaleString('en-IN')` is not used
 * because it is locale-data dependent and would silently regroup under a
 * different ICU build.
 *
 * The last three digits stay together, everything above them groups in twos.
 */
export function grouped(n: number): string {
  const neg = n < 0
  const s = String(Math.round(Math.abs(n)))
  if (s.length <= 3) return (neg ? '-' : '') + s
  const tail = s.slice(-3)
  const head = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${neg ? '-' : ''}${head},${tail}`
}

/** `185000` → `"Rs 1,85,000"`. */
export function rs(n: number): string {
  return `Rs ${grouped(n)}`
}

/**
 * Renders a BS/AD date pair per Foundation §3.2 — BS leads at field size with a
 * "BS" suffix, AD sits one step smaller. Digits are Latin always (§3.4), and the
 * month spelling is the locked romanization (§3.3), never Devanagari — that
 * applies even under Nepal Mode with English UI, which is the default (§3.1).
 *
 * This takes pre-resolved BS components rather than converting AD→BS itself.
 * The real AD↔BS conversion is Date Engine territory (Phase 3, not built yet);
 * for now callers supply the already-known BS day/month/year, matched to the
 * capsule's reference dates.
 */
export function bsAdPair(bsDay: number, bsMonth: string, bsYear: number, adLabel: string): { bs: string; ad: string } {
  return { bs: `${bsDay} ${bsMonth} ${bsYear} BS`, ad: adLabel }
}
