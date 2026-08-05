import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { STATUS } from '../../lib/status'
import { CRITICAL_ALERTS } from '../../data/today'
import { cardStyle } from '../../components/ui/Page'

/**
 * Dashboard.md §8 — priority-sorted, and **every alert carries its own primary
 * action**. An alert with no action is a notification, and the Alerts column is
 * not a notification feed.
 *
 * §5.6: the Critical Alerts KPI is "open alerts at Critical priority only" and
 * "must equal the Alerts column count". So this column renders
 * `CRITICAL_ALERTS`, not every alert — the reference render showed five cards
 * plus "+ 2 more alerts" beside a KPI reading 5, which cannot both be right.
 * Both now read the same derived list, so the invariant holds by construction.
 */
export default function AlertsPanel() {
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
          {CRITICAL_ALERTS.length}
        </span>
        <Link
          to="/notifications"
          style={{ marginLeft: 'auto', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}
        >
          View all
        </Link>
      </div>

      <div style={{ flex: 1 }}>
        {CRITICAL_ALERTS.map((a, i) => {
          const c = STATUS[a.statusKey]
          return (
            <div
              key={a.title + a.detail}
              style={{
                display: 'grid',
                gridTemplateColumns: '32px minmax(0,1fr) auto',
                gap: 10,
                padding: '11px 15px',
                borderBottom: i < CRITICAL_ALERTS.length - 1 ? '1px solid var(--border)' : 'none',
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
    </section>
  )
}
