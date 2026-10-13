import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { Button, cardStyle } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { DateField } from '../../components/ui/DateField'
import { findShortages, type ShortageRow } from '../../lib/shortages'
import { readShortageInputs, type ShortageInputs } from '../../lib/queries/shortages'
import { availabilityRules } from '../../lib/queries/availability'
import { formatAdDateTime } from '../../lib/bs'
import { dayStartMinutesFrom, OPERATIONAL_DAY_START_DEFAULT_MINUTES } from '../../lib/operationalDay'
import { getSetting, subscribeSettings } from '../../lib/settingsStore'
import { defaultShortageDays, shortageCalendarLink, shortagePeriod } from '../../lib/shortagePeriod'

/**
 * **Shortages** — products whose live holds exceed the stock they own, for a
 * period you choose (C7). The arithmetic is `lib/shortages.ts`; this only asks
 * for a window, shows the answer, and says honestly what it cannot see.
 *
 * Dates select inclusive operational days; shortagePeriod owns their AD/UTC
 * boundaries. The calendar drill-down still labels the instant's civil date.
 */

const dayStart = () => dayStartMinutesFrom(getSetting('operationalDayStart'))

export default function ShortageSection() {
  const startMinutes = useSyncExternalStore(subscribeSettings, dayStart, () => OPERATIONAL_DAY_START_DEFAULT_MINUTES)
  const [fromDay, setFromDay] = useState(() => defaultShortageDays(new Date(), startMinutes).from)
  const [toDay, setToDay] = useState(() => defaultShortageDays(new Date(), startMinutes).to)
  const [inputs, setInputs] = useState<ShortageInputs | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    setInputs(null)
    setError(null)
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
  }, [reload])

  const window = useMemo(() => shortagePeriod(fromDay, toDay, startMinutes), [fromDay, toDay, startMinutes])

  const computed = useMemo<{ rows: ShortageRow[] | null; error: string | null }>(() => {
    if (!inputs || !window) return { rows: null, error: null }
    try {
      return { rows: findShortages({
        window,
        products: inputs.products,
        holdsByProduct: inputs.holdsByProduct,
        bounds: availabilityRules().bounds,
      }), error: null }
    } catch (err: unknown) {
      return { rows: null, error: err instanceof Error ? err.message : 'Availability could not be calculated.' }
    }
  }, [inputs, window])
  const rows = computed.rows
  const displayError = error ?? computed.error

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
          <Button icon="refresh" onClick={() => setReload(value => value + 1)}>Refresh shortages</Button>
        </div>
        <p style={{ margin: 'var(--sp-sm) 0 0', color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
          Includes each selected operational day, starting at {String(Math.floor(startMinutes / 60)).padStart(2, '0')}:{String(startMinutes % 60).padStart(2, '0')} Nepal time.
        </p>
        {!window && (
          <p role="alert" style={{ margin: 'var(--sp-sm) 0 0', fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>
            Choose a From date that is on or before the To date.
          </p>
        )}
      </div>

      {displayError && (
        <p role="alert" style={{ margin: 0, padding: 'var(--sp-md)', fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>
          {displayError}
        </p>
      )}

      {!displayError && rows === null && window && (
        <p style={{ margin: 0, padding: 'var(--sp-md)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Reading bookings…</p>
      )}

      {!displayError && rows !== null && rows.length === 0 && (
        <p style={{ margin: 0, padding: 'var(--sp-md)', fontSize: 'var(--t-meta)' }}>
          No product is over-committed in this period.
        </p>
      )}

      {!displayError && rows !== null && rows.length > 0 && (
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
                    <Link to={`/inventory/${r.productId}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>{r.name}</Link> <span style={{ color: 'var(--text2)', fontWeight: 400 }}>{r.assetCode}</span>
                  </td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{r.totalQuantity}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{r.peakHeld}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)', fontWeight: 600, color: 'var(--danger-text)' }}>
                    {r.over}
                  </td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}><Link to={shortageCalendarLink(r.peakAtAd)} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>{formatAdDateTime(r.peakAtAd)} · Calendar</Link></td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>
                    {r.holders.map((h, i) => (
                      <span key={h.bookingId}>
                        {i > 0 ? ', ' : ''}
                        <Link to={`/rentals/${h.bookingNo}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>{h.bookingNo}</Link>
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
