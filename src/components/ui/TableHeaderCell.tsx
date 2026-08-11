import type { CSSProperties } from 'react'

/**
 * Shared `<th>` cell recipe for hand-rolled `<table>` markup.
 *
 * Five screens (Tools, ReturnWorkspace, Settings, CrewBooking, Timesheet)
 * each carried their own near-identical header-cell style — same intent,
 * five slightly different paddings. This is the one canonical version they
 * all migrate onto.
 *
 * Row background (`--th-bg`) is a `<tr>`-level concern, not a per-cell one —
 * most tables already set it there and should keep doing so; this object
 * only covers what belongs on the `<th>` itself.
 */
export const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  borderBottom: '1px solid var(--border)',
}
