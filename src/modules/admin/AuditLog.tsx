import { PageHeader, Card, Rail, cardStyle } from '../../components/ui/Page'
import { AUDIT_METRICS, AUDIT_ROWS } from '../../data/auditLog'
import { useAuth } from '../../lib/auth'

function AuditKpiCard({ label, value, accent, note }: any) {
  return (
    <Card style={{ padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)', background: `var(--${accent}-bg, var(--card))` }}>
      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: `var(--${accent})` }}>{value}</div>
      <div style={{ fontSize: 'var(--t-meta)', color: `var(--${note.tone})` }}>{note.text}</div>
    </Card>
  )
}

export default function AuditLog() {
  const { user } = useAuth()
  const isManager = user?.role === 'Owner' || user?.role === 'Manager' || user?.role === 'Admin'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="settings"
        title="Audit Log"
        description="Immutable record of state mutations. 7-year retention."
      />

      <section aria-label="Key figures" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
        <AuditKpiCard
          label="Total Mutations"
          value={AUDIT_METRICS.totalMutations.toLocaleString()}
          icon="edit"
          accent="primary"
          note={{ text: 'Last 7 years', tone: 'neutral' }}
        />
        <AuditKpiCard
          label="Voided Records"
          value={AUDIT_METRICS.voids}
          icon="slash"
          accent="danger"
          note={{ text: 'Safe deletion equivalent', tone: 'neutral' }}
        />
        <AuditKpiCard
          label="Archived Records"
          value={AUDIT_METRICS.archives}
          icon="archive"
          accent="progress"
          note={{ text: 'Hidden from active views', tone: 'neutral' }}
        />
        <AuditKpiCard
          label="Reversals"
          value={AUDIT_METRICS.reversals}
          icon="corner_up_left"
          accent="warning"
          note={{ text: 'Financial corrections', tone: 'warning' }}
        />
      </section>

      <Rail>
        <section aria-label="Audit History" style={cardStyle}>
          <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Mutation History</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
            <thead>
              <tr style={{ color: 'var(--text2)' }}>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Time</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>User</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Action</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Resource</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Before</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>After</th>
                {isManager && <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Network / Location</th>}
              </tr>
            </thead>
            <tbody>
              {AUDIT_ROWS.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)', color: 'var(--text2)' }}>{new Date(r.timestamp).toLocaleString()}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)', fontWeight: 600 }}>{r.user}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{r.action}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{r.resource}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)', color: 'var(--danger)' }}>{r.before}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)', color: 'var(--success)' }}>{r.after}</td>
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
