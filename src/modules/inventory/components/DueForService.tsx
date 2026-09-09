import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../../components/ui/Page'
import { Unavailable } from '../../../components/ui/Unavailable'
import { ErrorBanner } from '../../../components/ui/StateViews'
import { ServiceDueBadge } from '../../../components/ui/ServiceDueBadge'
import { readUnitsDueForService } from '../../../lib/queries/serviceDue'
import { serviceStatus, type ServiceRow } from '../../../lib/serviceDue'

/**
 * **Due for service** — the saved view RULING 2026-09-08 (R-28) puts on
 * Inventory ▸ Maintenance.
 *
 * ## Live, unlike the table below it
 *
 * The rest of this tab still renders `MAINTENANCE_DATA`, a hand-typed seed. This
 * section reads `product_units_service_v` — the real thing — because due-ness is
 * derived from real bookings and a fixture of it would be a fixture of an
 * arithmetic result, which is the least useful kind.
 *
 * ## `Create job` is NOT wired, and says so
 *
 * R-28 asks for a row action that pre-fills a `Preventive Service` job.
 * `createMaintenanceJob` in `src/actions/maintenance` is `implemented: false`,
 * and this tab's own header records what happens when a modal pretends
 * otherwise: `LogMaintenanceModal` "mints `MJ-2026-${random}` … emits
 * MAINTENANCE_STARTED directly and reports success with no write". So the action
 * renders through `Unavailable` with the reason on it — this file's established
 * convention, and the repo's: **unbuilt renders as Unavailable, never as a fake
 * success.** When the action lands, the `Unavailable` wrapper comes off and the
 * button inside it is already the right button.
 *
 * ## Sorted by how late it is
 *
 * `readUnitsDueForService` orders by `overdue_days` descending, nulls last. A
 * unit past its grace window is the one to act on today; a usage-due unit
 * carries no overdue count at all (`0103` — "overdue by N days" has no meaning
 * against a rental-day threshold) and sits below them rather than above.
 */
export function DueForService() {
  const [rows, setRows] = useState<readonly ServiceRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    readUnitsDueForService()
      .then((due) => {
        if (!cancelled) {
          setRows(due)
          setError(null)
        }
      })
      .catch((failure: unknown) => {
        if (cancelled) return
        /* This one DOES surface its failure, unlike the badge's read. It is the
           subject of the section, and an empty backlog that silently means "the
           query failed" is how a maintenance backlog disappears. */
        setRows([])
        setError(failure instanceof Error ? failure.message : String(failure))
      })
    return () => {
      cancelled = true
    }
  }, [])

  /* Nothing due is not an empty state worth a panel. R-28's badge renders
     nothing when nothing is due for the same reason: a screenful of "all clear"
     teaches the eye to skip the one row that is not. */
  if (rows !== null && rows.length === 0 && error === null) return null

  return (
    <Card title="Due for service" bodyStyle={{ padding: 0 }}>
      <p
        style={{
          margin: 0,
          padding: 'var(--sp-sm) var(--sp-md)',
          fontSize: 'var(--t-meta)',
          color: 'var(--muted)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        Time or usage, whichever came first. A due unit is still bookable — this warns, it does not hold.
      </p>

      {error !== null && <ErrorBanner message={error} />}

      {rows === null ? (
        <div style={{ padding: 'var(--sp-md)', color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>Reading…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={th}>Unit</th>
                <th style={th}>State</th>
                <th style={th}>Why</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status = serviceStatus(row)
                if (status === null) return null
                return (
                  <tr key={row.unitId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={cell}>
                      <Link
                        to={`/inventory/${row.unitId}`}
                        className="identifier"
                        style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 600 }}
                      >
                        {row.unitId.slice(0, 8)}
                      </Link>
                    </td>
                    <td style={cell}>
                      <ServiceDueBadge row={row} />
                    </td>
                    <td style={{ ...cell, color: 'var(--text2)', whiteSpace: 'normal' }}>{status.detail}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>
                      <Unavailable reason={CREATE_JOB_UNAVAILABLE}>
                        <button
                          type="button"
                          disabled
                          style={{
                            border: '1px solid var(--border)',
                            background: 'transparent',
                            color: 'var(--muted)',
                            borderRadius: 'var(--r-chip)',
                            padding: '4px 10px',
                            fontSize: 'var(--t-meta)',
                            minHeight: 32,
                          }}
                        >
                          Create job
                        </button>
                      </Unavailable>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

const CREATE_JOB_UNAVAILABLE =
  'Creating a maintenance job is not built yet — createMaintenanceJob is implemented: false, so this would report a job that was never written.'

const th = {
  textAlign: 'left' as const,
  padding: '8px 12px',
  fontSize: 'var(--t-meta)',
  color: 'var(--muted)',
  fontWeight: 600,
  whiteSpace: 'nowrap' as const,
}

const cell = {
  padding: '8px 12px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  whiteSpace: 'nowrap' as const,
}
