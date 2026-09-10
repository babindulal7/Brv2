import { useEffect, useState } from 'react'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow } from '../../components/ui/ReportToolbar'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useAuth } from '../../lib/auth'
import { formatMoney } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import {
  STAFF_METRICS,
  STAFF_LIST,
  getStaffReportsSummary,
  type StaffReportsSummary,
} from '../../lib/queries/staffReports'

/**
 * The export body.
 *
 * ⚠ It takes the same two arguments the TABLE uses to decide whether a
 * performance score is visible, and withholds the score the same way. An export
 * that dumped every score regardless would be a way to read, in a spreadsheet,
 * exactly what the screen refuses to show — which is how a permission gate gets
 * quietly repealed by a download button.
 */
function staffCsv(isManager: boolean, myName: string | undefined): ReportCsvRow[] {
  return [
    ['Figure', 'Value'],
    ['Revenue handled', formatMoney(STAFF_METRICS.revenueHandled as Paisa)],
    ['Collection rate', `${STAFF_METRICS.collectionRate}%`],
    ['Tasks completed', STAFF_METRICS.tasksCompleted],
    ['Average response time', STAFF_METRICS.averageResponseTime],
    [],
    ['Staff', 'Role', 'Revenue Handled', 'Collections', 'Collection Rate', 'Tasks', 'Performance Score'],
    ...STAFF_LIST.map((s): ReportCsvRow => [
      s.name,
      s.role,
      formatMoney(s.revenueHandled as Paisa),
      formatMoney(s.collections as Paisa),
      `${((s.collections / s.revenueHandled) * 100).toFixed(1)}%`,
      s.tasksCompleted,
      isManager || s.name === myName ? s.performanceScore : 'Hidden',
    ]),
  ]
}

export default function StaffReports() {
  const money = useCanViewMoney()
  const { user } = useAuth()
  const [, setSummary] = useState<StaffReportsSummary | null>(null)

  useEffect(() => {
    let active = true
    void getStaffReportsSummary().then((res) => {
      if (active) setSummary(res)
    })
    return () => {
      active = false
    }
  }, [])

  // Law 6 — revenue handled and collections are the report; there is no
  // money-free version of it, so the shared RESTRICTED state stands in for the
  // whole page and no export is offered above it.
  if (!money) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <PageHeader icon="users" title="Staff Performance" description="Track revenue handled, collections, and task completion." />
        <PageBody
          restricted
          restrictedReason="Staff performance is measured in revenue handled and collections, so there is no version of this page your role can see."
          restrictedRequiredRole="Owner, Admin, Coordinator or Accounts"
        >
          {null}
        </PageBody>
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

      {/*
        Export only. `data/staffReports` is two constants — a headline block and
        one row per person — with no date on any row and no branch column, so a
        date range or a branch picker here would narrow nothing.
      */}
      <ReportToolbar
        title="Staff Performance"
        csv={{
          filename: 'staff-performance',
          build: () => staffCsv(isManager, myName),
          ...(user?.name ? { generatedBy: user.name } : {}),
        }}
      />

      {/* The shared strip — typed items, icon tile drawn, viewport clamp built
          in. The old hand-rolled `StaffKpiCard` was `any`-typed and silently
          dropped its `icon` prop ("clock" was not even a registry name — never
          caught, because nothing rendered it). */}
      <KpiStrip
        columns={4}
        items={[
          {
            label: 'Revenue Handled',
            value: formatMoney(STAFF_METRICS.revenueHandled as Paisa),
            icon: 'dollar',
            accent: 'primary',
            note: 'Total gross handled this month',
          },
          {
            label: 'Collection Rate',
            value: `${STAFF_METRICS.collectionRate}%`,
            icon: 'check',
            accent: 'success',
            note: 'Average across all staff',
          },
          {
            label: 'Tasks Completed',
            value: String(STAFF_METRICS.tasksCompleted),
            icon: 'check',
            accent: 'progress',
            note: 'Across all workspaces',
          },
          {
            label: 'Avg Response Time',
            value: STAFF_METRICS.averageResponseTime,
            icon: 'timer',
            accent: 'neutral',
            note: 'Time to acknowledge task',
          },
        ]}
      />

      {/* Rulings §7 — this table is the report's CONTENT, not a rail. It used
          to be passed into `ReflowRail`, which at desktop is a 288px sticky
          collapsible box, so the whole seven-column table rendered inside one
          self-scrolling rail. There is no aside content on this page, so there
          is no rail at all. */}
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
  )
}
