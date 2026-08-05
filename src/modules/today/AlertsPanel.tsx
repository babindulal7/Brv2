import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { STATUS } from '../../lib/status'
import { criticalAlertsFor, lesserAlertsFor } from '../../data/today'
import { cardStyle } from '../../components/ui/Page'
import { useCanViewMoney } from './useMoneyVisibility'

/**
 * Dashboard.md §8 — priority-sorted.
 *
 * ⚠ TODO(decision) — PLAN.md §4: §8 also says **"every alert carries its own
 * primary action… an alert with no action is a notification, not an alert."**
 * `Dashboard.PNG` draws no action on these rows, the page was matched to the
 * render, and the inline actions came out; the rows are now inert text. Each
 * `AlertRow` still carries `action` and `to`, and `carriesMoney` still reads
 * `action` to keep money alerts away from a money-blind session, so the field
 * is load-bearing but unrendered. Either the whole row becomes a link to
 * `a.to` (which keeps the render's look and restores §8), or §8's rule is
 * dropped for this column. Not mine to pick.
 *
 * §5.6: the Critical Alerts KPI is "open alerts at Critical priority only" and
 * "must equal the Alerts column count". So this column renders
 * `CRITICAL_ALERTS`, not every alert — the reference render showed five cards
 * plus "+ 2 more alerts" beside a KPI reading 5, which cannot both be right.
 * Both now read the same derived list, so the invariant holds by construction.
 */
export default function AlertsPanel() {
  /*
   * §8.3 — the money alerts are filtered out of the list itself, so a
   * money-blind session has no row to read, no count to add up and no "+ N
   * more" pointing at one. Nothing here is masked.
   */
  const money = useCanViewMoney()
  const alerts = criticalAlertsFor(money)
  const rest = lesserAlertsFor(money).length

  return (
    <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '13px 15px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>Alerts</h2>
        <span
          className="figure"
          style={{
            marginLeft: 8,
            height: 21,
            padding: '0 8px',
            borderRadius: 'var(--r-badge)',
            background: 'var(--st-danger-bg)',
            color: 'var(--st-danger-fg)',
            fontSize: 'var(--t-meta)',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {alerts.length}
        </span>
        <Link
          to="/notifications"
          style={{ marginLeft: 'auto', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}
        >
          View all
        </Link>
      </div>

      <div style={{ flex: 1 }}>
        {alerts.map((a, i) => {
          const c = STATUS[a.statusKey]
          return (
            <div
              key={a.title + a.detail}
              style={{
                display: 'grid',
                gridTemplateColumns: '32px minmax(0,1fr) auto',
                gap: 10,
                padding: '11px 15px',
                borderBottom: i < alerts.length - 1 ? '1px solid var(--border)' : 'none',
                alignItems: 'start',
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  background: c.bg,
                  color: c.fg,
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon name={a.icon} size={16} fill />
              </span>

              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{a.title}</div>
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 'var(--t-meta)',
                    color: 'var(--text2)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {a.detail}
                </div>

                {/* Reverted inline actions to match Dashboard.PNG */}
              </div>

              <span
                className={a.right.startsWith('Rs') ? 'figure' : undefined}
                style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: STATUS[a.rightTone].fg, whiteSpace: 'nowrap', paddingTop: 2 }}
              >
                {a.right}
              </span>
            </div>
          )
        })}
      </div>

      {/* The render's "+ 2 more alerts". The count is what is actually left
          below Critical for *this* session, so it can never advertise a money
          alert a money-blind role is not allowed to open. */}
      {rest > 0 && (
        <Link
          to="/notifications"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 15px',
            borderTop: '1px solid var(--border)',
            color: 'var(--link)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          <Icon name="plus" size={13} />
          {rest} more {rest === 1 ? 'alert' : 'alerts'}
        </Link>
      )}
    </section>
  )
}
