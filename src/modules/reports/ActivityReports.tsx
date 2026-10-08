import { formatAdDateTime } from '../../lib/bs'
import { useEffect, useMemo, useState } from 'react'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { Donut, Legend, type Slice } from '../../components/ui/Charts'
import Icon from '../../components/ui/Icon'
import { useViewport } from '../../lib/device'
import {
  getActivityReport,
  type ActivityReportData,
  type ActivityReportFilterOptions,
} from '../../lib/queries/activityReports'

type ActivityTab = 'overview' | 'operators' | 'stream'

const th = {
  textAlign: 'left' as const,
  padding: '10px 12px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}

const td = {
  height: 'var(--row-min-h)',
  padding: '10px 12px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  borderBottom: '1px solid var(--border)',
}

export default function ActivityReports() {
  const viewport = useViewport()
  const [activeTab, setActiveTab] = useState<ActivityTab>('overview')
  const [filters, setFilters] = useState<ReportFilters>({})
  const [data, setData] = useState<ActivityReportData | null>(null)

  useEffect(() => {
    let active = true

    const queryOpts: ActivityReportFilterOptions = {
      ...(filters.dateRange?.fromAd ? { from: filters.dateRange.fromAd } : {}),
      ...(filters.dateRange?.toAd ? { to: filters.dateRange.toAd } : {}),
    }

    void getActivityReport(queryOpts).then((res) => {
      if (active) setData(res)
    })

    return () => {
      active = false
    }
  }, [filters])

  const kpis = useMemo<Kpi[]>(() => {
    if (!data) return []
    const m = data.metrics
    const successRate =
      m.totalEvents > 0
        ? Math.round((m.successfulEvents / m.totalEvents) * 100)
        : 100

    return [
      {
        label: 'Total Audit Events',
        value: String(m.totalEvents),
        icon: 'activity',
        accent: 'primary',
        note: `Across ${data.eventsByCategory.length} system domains`,
      },
      {
        label: 'Active Operators',
        value: String(m.activeOperators),
        icon: 'users',
        accent: 'neutral',
        note: `Most active: ${m.mostActiveOperator}`,
      },
      {
        label: 'Operation Success',
        value: `${successRate}%`,
        icon: 'check',
        accent: successRate >= 98 ? 'success' : 'warn',
        note: `${m.failedEvents} logged failures`,
      },
      {
        label: 'High & Critical Flags',
        value: String(m.criticalEvents),
        icon: 'alert_triangle',
        accent: m.criticalEvents === 0 ? 'success' : 'warn',
        note: 'Requires managerial review',
      },
    ]
  }, [data])

  const categorySlices = useMemo<Slice[]>(() => {
    if (!data || data.eventsByCategory.length === 0) return []
    return data.eventsByCategory.map((c) => ({
      label: c.label,
      value: c.count,
      display: String(c.count),
      percent: `${c.percentage}%`,
    }))
  }, [data])

  const severitySlices = useMemo<Slice[]>(() => {
    if (!data || data.eventsBySeverity.length === 0) return []
    return data.eventsBySeverity.map((s) => ({
      label: s.label,
      value: s.count,
      display: String(s.count),
      percent: `${s.percentage}%`,
    }))
  }, [data])

  const exportCsv = (): ReportCsvRow[] => {
    if (!data) return []
    const rows: ReportCsvRow[] = [
      ['Report', 'Staff & System Activity Report'],
      ['Total Events', data.metrics.totalEvents],
      ['Successful Events', data.metrics.successfulEvents],
      ['Failed Events', data.metrics.failedEvents],
      ['Critical Events', data.metrics.criticalEvents],
      ['Active Operators', data.metrics.activeOperators],
      ['Most Active Module', data.metrics.mostActiveModule],
      ['Most Active Operator', data.metrics.mostActiveOperator],
      [],
      ['--- OPERATOR ACTIVITY SUMMARY ---'],
      ['Employee Code', 'Staff Name', 'Primary Role', 'Total Logged Actions', 'Last Active', 'Recent Action'],
      ...data.staffSummaries.map((s): ReportCsvRow => [
        s.employeeCode,
        s.name,
        s.role,
        s.totalActions,
        s.lastActive ?? 'Never',
        s.recentAction ?? 'None',
      ]),
      [],
      ['--- AUDIT EVENT LOG ---'],
      ['Timestamp', 'Operator', 'Role', 'Action', 'Category', 'Module', 'Severity', 'Status', 'Target Table', 'Record ID', 'IP Address'],
      ...data.recentEvents.map((e): ReportCsvRow => [
        e.timestamp,
        e.actorName,
        e.actorRole,
        e.action,
        e.category,
        e.module,
        e.severity,
        e.status,
        e.tableName ?? 'N/A',
        e.recordId ?? 'N/A',
        e.ipAddress ?? 'N/A',
      ]),
    ]
    return rows
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="activity"
        title="Staff & System Activity"
        description="Audit event volume, operator breakdown, and immutable system event log."
      />

      <ReportToolbar
        title="Staff Activity"
        value={filters}
        onChange={setFilters}
        dateColumn="created_at"
        csv={{
          filename: `staff-activity-${activeTab}`,
          build: exportCsv,
        }}
      >
        <div
          role="group"
          aria-label="Staff activity views"
          className="report-view-toggle"
          style={{ display: 'inline-flex' }}
        >
          {([
            ['Activity Overview', 'overview'],
            ['Operator Breakdown', 'operators'],
            ['Audit Trail Stream', 'stream'],
          ] as const).map(([label, key]) => {
            const on = activeTab === key
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => setActiveTab(key)}
                className={`report-toggle-btn ${on ? 'is-active' : ''}`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </ReportToolbar>

      <KpiStrip items={kpis} />

      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: viewport === 'phone' ? '1fr' : '1fr 1fr',
              gap: 'var(--sp-md)',
            }}
          >
            {/* Domain Categories */}
            <div style={cardStyle}>
              <h3
                style={{
                  margin: '0 0 var(--sp-sm)',
                  fontSize: 'var(--t-ui)',
                  fontWeight: 700,
                  color: 'var(--text)',
                }}
              >
                Activity by System Domain
              </h3>
              <p
                style={{
                  margin: '0 0 var(--sp-md)',
                  fontSize: 'var(--t-meta)',
                  color: 'var(--text2)',
                }}
              >
                Volume distribution across operational workflows and modules.
              </p>
              {categorySlices.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-lg)' }}>
                  <Donut
                    slices={categorySlices}
                    centreLabel="Total Events"
                    centreValue={String(data?.metrics.totalEvents ?? 0)}
                    size={140}
                  />
                  <Legend slices={categorySlices} showPercent />
                </div>
              ) : (
                <div style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)', padding: 'var(--sp-md) 0' }}>
                  No activity events recorded in this period.
                </div>
              )}
            </div>

            {/* Severity Distribution */}
            <div style={cardStyle}>
              <h3
                style={{
                  margin: '0 0 var(--sp-sm)',
                  fontSize: 'var(--t-ui)',
                  fontWeight: 700,
                  color: 'var(--text)',
                }}
              >
                Security &amp; Severity Profile
              </h3>
              <p
                style={{
                  margin: '0 0 var(--sp-md)',
                  fontSize: 'var(--t-meta)',
                  color: 'var(--text2)',
                }}
              >
                Breakdown of audit occurrences by operational impact severity.
              </p>
              {severitySlices.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-lg)' }}>
                  <Donut
                    slices={severitySlices}
                    centreLabel="Flags"
                    centreValue={String(data?.metrics.criticalEvents ?? 0)}
                    size={140}
                  />
                  <Legend slices={severitySlices} showPercent />
                </div>
              ) : (
                <div style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)', padding: 'var(--sp-md) 0' }}>
                  No severity markers recorded.
                </div>
              )}
            </div>
          </div>

          {/* Top Contributing Operators */}
          <div style={cardStyle}>
            <h3
              style={{
                margin: '0 0 var(--sp-sm)',
                fontSize: 'var(--t-ui)',
                fontWeight: 700,
                color: 'var(--text)',
              }}
            >
              Top Active Staff Members
            </h3>
            <p
              style={{
                margin: '0 0 var(--sp-md)',
                fontSize: 'var(--t-meta)',
                color: 'var(--text2)',
              }}
            >
              Staff personnel with the highest logged operational action volume.
            </p>

            <DataTableShell ariaLabel="Top Active Staff Members">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Staff Member</th>
                    <th style={th}>Role</th>
                    <th style={th}>Employee Code</th>
                    <th style={th}>Total Actions</th>
                    <th style={th}>Most Recent Action</th>
                    <th style={th}>Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.staffSummaries.slice(0, 5).map((s) => (
                    <tr key={s.userId}>
                      <td style={td}>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{s.name}</div>
                      </td>
                      <td style={td}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 8px',
                            borderRadius: 'var(--r-badge)',
                            fontSize: 'var(--t-meta)',
                            background: 'var(--card2)',
                            border: '1px solid var(--border)',
                            color: 'var(--text2)',
                          }}
                        >
                          {s.role}
                        </span>
                      </td>
                      <td style={td} className="figure">
                        {s.employeeCode}
                      </td>
                      <td className="figure" style={{ ...td, fontWeight: 700, color: 'var(--primary)' }}>
                        {s.totalActions}
                      </td>
                      <td style={td}>{s.recentAction ?? '—'}</td>
                      <td className="figure" style={{ ...td, color: 'var(--text2)' }}>
                        {s.lastActive ? formatAdDateTime(s.lastActive) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          </div>
        </div>
      )}

      {activeTab === 'operators' && (
        <div style={cardStyle}>
          <h3
            style={{
              margin: '0 0 var(--sp-sm)',
              fontSize: 'var(--t-ui)',
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            Staff Operator Performance &amp; Activity
          </h3>
          <p
            style={{
              margin: '0 0 var(--sp-md)',
              fontSize: 'var(--t-meta)',
              color: 'var(--text2)',
            }}
          >
            Detailed action tallies, domain breakdown, and execution status across personnel.
          </p>

          <DataTableShell ariaLabel="Staff Operator Activity Breakdown">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Staff Member</th>
                  <th style={th}>Role</th>
                  <th style={th}>Total Actions</th>
                  <th style={th}>Rentals</th>
                  <th style={th}>Operations</th>
                  <th style={th}>Inventory</th>
                  <th style={th}>Finance</th>
                  <th style={th}>Last Active</th>
                </tr>
              </thead>
              <tbody>
                {data?.staffSummaries.map((s) => (
                  <tr key={s.userId}>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{s.name}</div>
                      <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                        {s.employeeCode}
                      </div>
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: 'var(--r-badge)',
                          fontSize: 'var(--t-meta)',
                          background: 'var(--card2)',
                          border: '1px solid var(--border)',
                          color: 'var(--text2)',
                        }}
                      >
                        {s.role}
                      </span>
                    </td>
                    <td className="figure" style={{ ...td, fontWeight: 700, color: 'var(--primary)' }}>
                      {s.totalActions}
                    </td>
                    <td style={td} className="figure">
                      {s.actionsBreakdown['Rentals'] ?? 0}
                    </td>
                    <td style={td} className="figure">
                      {s.actionsBreakdown['Operations'] ?? 0}
                    </td>
                    <td style={td} className="figure">
                      {s.actionsBreakdown['Inventory'] ?? 0}
                    </td>
                    <td style={td} className="figure">
                      {s.actionsBreakdown['Finance'] ?? 0}
                    </td>
                    <td className="figure" style={{ ...td, color: 'var(--text2)' }}>
                      {s.lastActive ? formatAdDateTime(s.lastActive) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>
        </div>
      )}

      {activeTab === 'stream' && (
        <div style={cardStyle}>
          <h3
            style={{
              margin: '0 0 var(--sp-sm)',
              fontSize: 'var(--t-ui)',
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            Audit Trail Event Stream
          </h3>
          <p
            style={{
              margin: '0 0 var(--sp-md)',
              fontSize: 'var(--t-meta)',
              color: 'var(--text2)',
            }}
          >
            Immutable event history from PostgreSQL audit_events with actor attribution and integrity checks.
          </p>

          <DataTableShell ariaLabel="Audit Trail Event Stream">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Timestamp</th>
                  <th style={th}>Operator</th>
                  <th style={th}>Action</th>
                  <th style={th}>Module</th>
                  <th style={th}>Status</th>
                  <th style={th}>Severity</th>
                  <th style={th}>Target Record</th>
                  <th style={th}>Network IP</th>
                </tr>
              </thead>
              <tbody>
                {data?.recentEvents.map((e) => (
                  <tr key={e.id}>
                    <td className="figure" style={{ ...td, whiteSpace: 'nowrap' }}>
                      {formatAdDateTime(e.timestamp)}
                    </td>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{e.actorName}</div>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                        {e.actorRole}
                      </div>
                    </td>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{e.action}</div>
                      {e.reason && (
                        <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{e.reason}</div>
                      )}
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          borderRadius: 'var(--r-badge)',
                          fontSize: 'var(--t-meta)',
                          background: 'var(--card2)',
                          border: '1px solid var(--border)',
                          color: 'var(--text)',
                        }}
                      >
                        {e.category}
                      </span>
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          borderRadius: 'var(--r-badge)',
                          fontSize: 'var(--t-meta)',
                          fontWeight: 600,
                          background: e.status === 'Success' ? 'var(--badge-success-bg, rgba(16, 185, 129, 0.1))' : 'var(--badge-danger-bg, rgba(239, 68, 68, 0.1))',
                          color: e.status === 'Success' ? 'var(--success)' : 'var(--danger)',
                          border: `1px solid ${e.status === 'Success' ? 'var(--success)' : 'var(--danger)'}`,
                        }}
                      >
                        <Icon name={e.status === 'Success' ? 'check' : 'x'} size={11} />
                        {e.status}
                      </span>
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: 'var(--r-badge)',
                          fontSize: 'var(--t-meta)',
                          fontWeight: 600,
                          color:
                            e.severity === 'Critical' || e.severity === 'High'
                              ? 'var(--danger)'
                              : e.severity === 'Medium'
                                ? 'var(--warn)'
                                : 'var(--text2)',
                        }}
                      >
                        {e.severity}
                      </span>
                    </td>
                    <td style={td}>
                      {e.tableName ? (
                        <span style={{ fontFamily: 'var(--font-id, sans-serif)', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--t-meta)' }}>
                          {e.tableName}
                          {e.recordId ? `:${e.recordId.slice(0, 8)}` : ''}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="figure" style={{ ...td, color: 'var(--text2)' }}>
                      {e.ipAddress ?? '127.0.0.1'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>
        </div>
      )}
    </div>
  )
}
