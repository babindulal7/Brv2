import { PageHeader, Card, Rail, cardStyle } from '../../components/ui/Page'
import { ACTIVITY_METRICS, ACTIVITY_ROWS } from '../../data/activityLog'
import { useAuth } from '../../lib/auth'

function LogKpiCard({ label, value, accent, note }: any) {
  return (
    <Card style={{ padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)', background: `var(--${accent}-bg, var(--card))` }}>
      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: `var(--${accent})` }}>{value}</div>
      <div style={{ fontSize: 'var(--t-meta)', color: `var(--${note.tone})` }}>{note.text}</div>
    </Card>
  )
}

export default function ActivityLog() {
  const { user } = useAuth()
  const isManager = user?.role === 'Owner' || user?.role === 'Manager' || user?.role === 'Admin'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="activity"
        title="Activity Log"
        description="Monitor system usage, views, and exports. 90-day retention."
      />

      <section aria-label="Key figures" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
        <LogKpiCard
          label="Total Activities"
          value={ACTIVITY_METRICS.totalActivities.toLocaleString()}
          icon="activity"
          accent="primary"
          note={{ text: 'Last 90 days', tone: 'neutral' }}
        />
        <LogKpiCard
          label="Failed"
          value={ACTIVITY_METRICS.failed}
          icon="alert_triangle"
          accent="danger"
          note={{ text: 'Errors or denials', tone: 'danger' }}
        />
        <LogKpiCard
          label="Critical"
          value={ACTIVITY_METRICS.critical}
          icon="alert_circle"
          accent="warning"
          note={{ text: 'Requires attention', tone: 'warning' }}
        />
        <LogKpiCard
          label="Unique Users"
          value={ACTIVITY_METRICS.uniqueUsers}
          icon="users"
          accent="success"
          note={{ text: 'Active in period', tone: 'neutral' }}
        />
      </section>

      <Rail>
        <section aria-label="Activity History" style={cardStyle}>
          <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Recent Activity</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
            <thead>
              <tr style={{ color: 'var(--text2)' }}>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Time</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>User</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Action</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Resource</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Status</th>
                {isManager && <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Network / Location</th>}
              </tr>
            </thead>
            <tbody>
              {ACTIVITY_ROWS.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)', color: 'var(--text2)' }}>{new Date(r.timestamp).toLocaleString()}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)', fontWeight: 600 }}>{r.user}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{r.action}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{r.resource}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)', color: r.status === 'Success' ? 'var(--success)' : 'var(--danger)' }}>{r.status}</td>
                  {isManager && <td style={{ padding: 'var(--sp-sm) var(--sp-md)', color: 'var(--text3)' }}>{r.ip} — {r.location}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </Rail>
    </div>
  )
}
