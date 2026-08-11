import { PageHeader, Card, Rail, cardStyle } from '../../components/ui/Page'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useAuth } from '../../lib/auth'
import { formatMoney } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { STAFF_METRICS, STAFF_LIST } from '../../data/staffReports'

function StaffKpiCard({ label, value, accent, note }: any) {
  return (
    <Card style={{ padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)', background: `var(--${accent}-bg, var(--card))` }}>
      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: `var(--${accent})` }}>{value}</div>
      <div style={{ fontSize: 'var(--t-meta)', color: `var(--${note.tone})` }}>{note.text}</div>
    </Card>
  )
}

export default function StaffReports() {
  const money = useCanViewMoney()
  const { user } = useAuth()

  if (!money) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <PageHeader icon="users" title="Staff Performance" description="Track revenue handled, collections, and task completion." />
        <Card style={{ padding: 'var(--sp-xl)', textAlign: 'center', color: 'var(--text2)' }}>
          Staff financial performance data is restricted for your role.
        </Card>
      </div>
    )
  }

  const isManager = user?.role === 'Owner' || user?.role === 'Manager' || user?.role === 'Admin'
  const myName = user?.name // For hiding/showing performance score

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="users"
        title="Staff Performance"
        description="Track revenue handled, collections, and task completion."
      />

      <section aria-label="Key figures" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
        <StaffKpiCard
          label="Revenue Handled"
          value={formatMoney(STAFF_METRICS.revenueHandled as Paisa)}
          icon="dollar"
          accent="primary"
          note={{ text: 'Total gross handled this month', tone: 'neutral' }}
        />
        <StaffKpiCard
          label="Collection Rate"
          value={`${STAFF_METRICS.collectionRate}%`}
          icon="check"
          accent="success"
          note={{ text: 'Average across all staff', tone: 'success' }}
        />
        <StaffKpiCard
          label="Tasks Completed"
          value={STAFF_METRICS.tasksCompleted}
          icon="check"
          accent="progress"
          note={{ text: 'Across all workspaces', tone: 'neutral' }}
        />
        <StaffKpiCard
          label="Avg Response Time"
          value={STAFF_METRICS.averageResponseTime}
          icon="clock"
          accent="warning"
          note={{ text: 'Time to acknowledge task', tone: 'neutral' }}
        />
      </section>

      <Rail>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <section aria-label="Staff Breakdown" style={cardStyle}>
            <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Team Breakdown</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
              <thead>
                <tr style={{ color: 'var(--text2)' }}>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Staff</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Role</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)', textAlign: 'right' }}>Revenue Handled</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)', textAlign: 'right' }}>Collections</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)', textAlign: 'right' }}>Collection Rate</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)', textAlign: 'center' }}>Tasks</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)', textAlign: 'center' }}>Performance Score</th>
                </tr>
              </thead>
              <tbody>
                {STAFF_LIST.map((s) => {
                  const rate = ((s.collections / s.revenueHandled) * 100).toFixed(1)
                  // RBAC for performance score
                  const canSeeScore = isManager || s.name === myName

                  return (
                    <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 'var(--sp-sm) var(--sp-md)', fontWeight: 600 }}>{s.name}</td>
                      <td style={{ padding: 'var(--sp-sm) var(--sp-md)', textTransform: 'capitalize' }}>{s.role}</td>
                      <td style={{ padding: 'var(--sp-sm) var(--sp-md)', textAlign: 'right' }}>{formatMoney(s.revenueHandled as Paisa)}</td>
                      <td style={{ padding: 'var(--sp-sm) var(--sp-md)', textAlign: 'right', color: 'var(--success)' }}>{formatMoney(s.collections as Paisa)}</td>
                      <td style={{ padding: 'var(--sp-sm) var(--sp-md)', textAlign: 'right' }}>{rate}%</td>
                      <td style={{ padding: 'var(--sp-sm) var(--sp-md)', textAlign: 'center' }}>{s.tasksCompleted}</td>
                      <td style={{ padding: 'var(--sp-sm) var(--sp-md)', textAlign: 'center', fontWeight: 600 }}>
                        {canSeeScore ? (
                          <span style={{ color: s.performanceScore >= 90 ? 'var(--success)' : 'var(--primary)' }}>{s.performanceScore}</span>
                        ) : (
                          <span style={{ color: 'var(--text3)' }}>Hidden</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        </div>
      </Rail>
    </div>
  )
}
