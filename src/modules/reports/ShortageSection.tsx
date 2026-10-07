import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cardStyle } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { DateField } from '../../components/ui/DateField'
import { findShortages, type ShortageRow } from '../../lib/shortages'
import { readShortageInputs, type ShortageInputs } from '../../lib/queries/shortages'
import { availabilityRules } from '../../lib/queries/availability'
import { formatAdDateTime } from '../../lib/bs'
import type { RentalWindow } from '../../lib/availability'

/**
 * **Shortages** — products whose live holds exceed the stock they own, for a
 * period you choose (C7). The arithmetic is `lib/shortages.ts`; this only asks
 * for a window, shows the answer, and says honestly what it cannot see.
 *
 * Dates are typed as Kathmandu calendar days and turned into AD/UTC instants
 * here (Law 7): from the start of the first day to the start of the day after
 * the last, so the last day is included.
 */

const KATHMANDU_OFFSET = '+05:45'

const dayText = (d: Date): string => d.toISOString().slice(0, 10)

function windowFor(fromDay: string, toDay: string): RentalWindow | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDay) || !/^\d{4}-\d{2}-\d{2}$/.test(toDay)) return null
  const from = new Date(`${fromDay}T00:00:00${KATHMANDU_OFFSET}`)
  const afterTo = new Date(`${toDay}T00:00:00${KATHMANDU_OFFSET}`)
  afterTo.setUTCDate(afterTo.getUTCDate() + 1)
  if (Number.isNaN(from.getTime()) || Number.isNaN(afterTo.getTime()) || afterTo <= from) return null
  return { fromAd: from.toISOString(), toAd: afterTo.toISOString() }
}

export default function ShortageSection() {
  const [fromDay, setFromDay] = useState(() => dayText(new Date()))
  const [toDay, setToDay] = useState(() => dayText(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)))
  const [inputs, setInputs] = useState<ShortageInputs | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void readShortageInputs()
      .then((next) => {
        if (!active) return
        setInputs(next)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!active) return
        setInputs(null)
        setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      active = false
    }
  }, [])

  const window = useMemo(() => windowFor(fromDay, toDay), [fromDay, toDay])

  const rows = useMemo<ShortageRow[] | null>(() => {
    if (!inputs || !window) return null
    try {
      return findShortages({
        window,
        products: inputs.products,
        holdsByProduct: inputs.holdsByProduct,
        bounds: availabilityRules().bounds,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      return null
    }
  }, [inputs, window])

  return (
    <section aria-label="Shortages" style={cardStyle}>
      <div style={{ padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 'var(--t-body)', fontWeight: 600 }}>Shortages</div>
        <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 4 }}>
          Products whose bookings, at the busiest moment in the period, need more than the stock the product owns.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-md)', marginTop: 'var(--sp-sm)' }}>
          <DateField label="From" ariaLabel="From" showBs={false} clearable value={fromDay} onChange={setFromDay} />
          <DateField label="To" ariaLabel="To" showBs={false} clearable value={toDay} onChange={setToDay} />
        </div>
        {!window && (
          <p role="alert" style={{ margin: 'var(--sp-sm) 0 0', fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>
            Choose a From date that is on or before the To date.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" style={{ margin: 0, padding: 'var(--sp-md)', fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>
          {error}
        </p>
      )}

      {!error && rows === null && window && (
        <p style={{ margin: 0, padding: 'var(--sp-md)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Reading bookings…</p>
      )}

      {!error && rows !== null && rows.length === 0 && (
        <p style={{ margin: 0, padding: 'var(--sp-md)', fontSize: 'var(--t-meta)' }}>
          No product is over-committed in this period.
        </p>
      )}

      {!error && rows !== null && rows.length > 0 && (
        <DataTableShell ariaLabel="Over-committed products">
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)', minWidth: 560 }}>
            <thead>
              <tr style={{ color: 'var(--text2)' }}>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Product</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>In stock</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Needed at peak</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Short by</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Peak at</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Bookings holding it</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)', fontWeight: 600 }}>
                    {r.name} <span style={{ color: 'var(--text2)', fontWeight: 400 }}>{r.assetCode}</span>
                  </td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{r.totalQuantity}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{r.peakHeld}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)', fontWeight: 600, color: 'var(--danger-text)' }}>
                    {r.over}
                  </td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{formatAdDateTime(r.peakAtAd)}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>
                    {r.holders.map((h, i) => (
                      <span key={h.bookingId}>
                        {i > 0 ? ', ' : ''}
                        <Link to={`/rentals/${h.bookingNo}`}>{h.bookingNo}</Link>
                        {h.qty > 1 ? ` ×${h.qty}` : ''}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>
      )}

      <p style={{ margin: 0, padding: 'var(--sp-sm) var(--sp-md) var(--sp-md)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        Measured against each product’s stock on hand, the same ceiling the database enforces. Units out in Maintenance,
        Missing or Retired are not subtracted, so a fleet short because gear is in the workshop is not shown here.
      </p>
    </section>
  )
}
