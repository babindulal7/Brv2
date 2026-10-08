import { useEffect, useState } from 'react'
import { listBookingCrew, type BookingCrewRow } from '../../lib/queries/bookingCrew'
import { formatAdDateTime } from '../../lib/bs'
import { formatMoney, rupees } from '../../lib/money'
import { Button } from '../../components/ui/Button'
import { formatGateError } from '../../lib/gates'

export function BookingCrewList({ bookingId, includeMoney, version }: { bookingId: string; includeMoney: boolean; version: number }) {
  const [rows, setRows] = useState<BookingCrewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null); setRows([])
    listBookingCrew(bookingId, includeMoney).then((result) => {
      if (!cancelled) { setRows(result); setLoading(false) }
    }).catch((err: unknown) => {
      if (!cancelled) { setError(formatGateError(err)); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [bookingId, includeMoney, version, retry])
  if (loading) return <p role="status">Loading assigned crew…</p>
  if (error) return <div role="alert"><p>{error}</p><Button onClick={() => setRetry((v) => v + 1)}>Retry crew</Button></div>
  if (!rows.length) return <p>No crew assigned to this booking yet.</p>
  return <ul aria-label="Assigned crew" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--sp-md)' }}>
    {rows.map((row) => <li key={row.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 'var(--sp-sm)', overflowWrap: 'anywhere' }}>
      <strong>{row.name ?? 'Crew name unavailable'}</strong><div>{row.role}</div>
      <div style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>Call: {row.callTime ? formatAdDateTime(row.callTime) : 'Not recorded'}</div>
      <div style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>Wrap: {row.wrapTime ? formatAdDateTime(row.wrapTime) : 'Not recorded'}</div>
      <div>{row.days} {row.days === 1 ? 'day' : 'days'}</div>
      {includeMoney && <div>Daily rate: {row.dailyRate === null ? 'Not available' : formatMoney(rupees(row.dailyRate))} · Total pay: {row.lineTotal === null ? 'Not available' : formatMoney(rupees(row.lineTotal))}</div>}
    </li>)}
  </ul>
}
