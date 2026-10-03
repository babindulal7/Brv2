import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { Donut, Legend, type Slice } from '../../components/ui/Charts'
import { ReportFamiliesNav } from '../../components/ui/ReportFamiliesNav'
import Icon from '../../components/ui/Icon'
import { formatMoney, rupees } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import {
  listCases,
  type Case,
  CASE_TYPE_ICON,
  CASE_PRIORITY_META,
  CASE_STATUS_META,
} from '../../lib/queries/cases'

type CasesTab = 'overview' | 'financial' | 'types' | 'register'

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

export default function CasesReport() {
  const money = useCanViewMoney()
  const viewport = useViewport()
  const [activeTab, setActiveTab] = useState<CasesTab>('overview')
  const [filters, setFilters] = useState<ReportFilters>({})
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)

    void listCases().then((res) => {
      if (active) {
        setCases(res.rows)
        setLoading(false)
      }
    })

    return () => {
      active = false
    }
  }, [filters])

  // KPIs
  const kpis = useMemo<Kpi[]>(() => {
    const openCount = cases.filter((c) => !['Resolved', 'Closed'].includes(c.status)).length
    const totalAssessed = rupees(cases.reduce((sum, c) => sum + (c.assessedPaisa as number), 0))
    const totalRecovered = rupees(
      cases.reduce(
        (sum, c) =>
          sum +
          (c.chargedToClientPaisa as number) +
          (c.depositAppliedPaisa as number) +
          (c.insuranceClaimedPaisa as number) +
          (c.recoveredFromPartnerPaisa as number),
        0,
      ),
    )
    const totalAbsorbed = rupees(cases.reduce((sum, c) => sum + (c.absorbedPaisa as number), 0))
    const resolutionRate = cases.length > 0
      ? Math.round(((cases.length - openCount) / cases.length) * 100)
      : 0

    return [
      {
        label: 'Open Incident Cases',
        value: String(openCount),
        icon: 'alert_triangle',
        accent: openCount > 0 ? 'warn' : 'neutral',
        note: `${cases.length} total recorded cases`,
      },
      {
        label: 'Assessed Exposure',
        value: money ? formatMoney(totalAssessed) : '—',
        icon: 'dollar',
        accent: 'danger',
        note: money ? 'Total hardware risk evaluated' : 'Restricted (Law 6)',
      },
      {
        label: 'Recovered Claims',
        value: money ? formatMoney(totalRecovered) : '—',
        icon: 'check',
        accent: 'success',
        note: money ? `${resolutionRate}% resolution rate` : 'Restricted (Law 6)',
      },
      {
        label: 'Absorbed Loss',
        value: money ? formatMoney(totalAbsorbed) : '—',
        icon: 'arrow_down',
        accent: (totalAbsorbed as number) > 0 ? 'danger' : 'neutral',
        note: money ? 'Losses absorbed by Babin Rentals' : 'Restricted (Law 6)',
      },
    ]
  }, [cases, money])

  // Priority Donut slices
  const prioritySlices: Slice[] = useMemo(() => {
    const counts: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 }
    cases.forEach((c) => {
      counts[c.priority] = (counts[c.priority] ?? 0) + 1
    })
    return Object.entries(counts).map(([pri, cnt]) => ({
      label: pri,
      value: cnt,
      display: `${cnt} cases`,
      percent: cases.length > 0 ? `${Math.round((cnt / cases.length) * 100)}%` : '0%',
    }))
  }, [cases])

  // Type Donut slices
  const typeSlices: Slice[] = useMemo(() => {
    const counts: Record<string, number> = {}
    cases.forEach((c) => {
      counts[c.type] = (counts[c.type] ?? 0) + 1
    })
    return Object.entries(counts).map(([type, cnt]) => ({
      label: type,
      value: cnt,
      display: `${cnt} cases`,
      percent: cases.length > 0 ? `${Math.round((cnt / cases.length) * 100)}%` : '0%',
    }))
  }, [cases])

  // Status breakdown
  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {}
    cases.forEach((c) => {
      counts[c.status] = (counts[c.status] ?? 0) + 1
    })
    return Object.entries(counts).map(([status, cnt]) => ({
      status,
      count: cnt,
      share: cases.length > 0 ? Math.round((cnt / cases.length) * 100) : 0,
    }))
  }, [cases])

  // CSV rows
  function getCsvRows(): ReportCsvRow[] {
    if (activeTab === 'financial') {
      return [
        ['Incident Cases Financial Impact Report'],
        ['Case No', 'Title', 'Assessed Cost', 'Charged Client', 'Deposit Applied', 'Insurance', 'Warranty', 'Absorbed'],
        ...cases.map((c): ReportCsvRow => [
          c.id,
          c.title,
          money ? formatMoney(c.assessedPaisa) : 'Restricted',
          money ? formatMoney(c.chargedToClientPaisa) : 'Restricted',
          money ? formatMoney(c.depositAppliedPaisa) : 'Restricted',
          money ? formatMoney(c.insuranceClaimedPaisa) : 'Restricted',
          money ? formatMoney(c.warrantyCoveredPaisa) : 'Restricted',
          money ? formatMoney(c.absorbedPaisa) : 'Restricted',
        ]),
      ]
    } else {
      return [
        ['Incident Cases Register'],
        ['Case No', 'Type', 'Title', 'Counterparty', 'Priority', 'Status', 'Opened Date', 'Assessed', 'Absorbed'],
        ...cases.map((c): ReportCsvRow => [
          c.id,
          c.type,
          c.title,
          c.counterpartyName,
          c.priority,
          c.status,
          c.openedAd.toLocaleDateString(),
          money ? formatMoney(c.assessedPaisa) : 'Restricted',
          money ? formatMoney(c.absorbedPaisa) : 'Restricted',
        ]),
      ]
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="alert_triangle"
        title="Cases & Incident Reports"
        description="Incident logs, damage assessments, repair quotes, warranty claims, and client loss recovery."
      />

      <ReportFamiliesNav current="Cases" />

      <ReportToolbar
        title="Cases & Incident Reports"
        value={filters}
        onChange={setFilters}
        dateColumn="opened_at"
        csv={{
          filename: `cases-${activeTab}`,
          build: getCsvRows,
        }}
      >
        <div
          role="group"
          aria-label="Cases report views"
          className="report-view-toggle"
          style={{ display: 'inline-flex' }}
        >
          {([
            ['Incident Overview', 'overview'],
            ['Financial Impact', 'financial'],
            ['Incident Types', 'types'],
            ['Cases Register', 'register'],
          ] as const).map(([label, tab]) => {
            const active = activeTab === tab
            return (
              <button
                key={tab}
                type="button"
                className="tap"
                onClick={() => setActiveTab(tab)}
                aria-pressed={active}
                style={{
                  height: 32,
                  padding: '0 12px',
                  fontSize: 'var(--t-meta)',
                  fontWeight: active ? 600 : 400,
                  border: '1px solid var(--border)',
                  background: active ? 'var(--nav-active-bg)' : 'transparent',
                  color: active ? 'var(--nav-active-accent)' : 'var(--text2)',
                  borderRadius:
                    tab === 'overview'
                      ? 'var(--rad-sm) 0 0 var(--rad-sm)'
                      : tab === 'register'
                        ? '0 var(--rad-sm) var(--rad-sm) 0'
                        : 0,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </ReportToolbar>

      {/* KPI Strip */}
      <KpiStrip items={kpis} />

      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: viewport === 'phone' ? '1fr' : '320px 1fr', gap: 'var(--sp-md)', alignItems: 'start' }}>
          <div style={{ ...cardStyle, padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h4 style={{ margin: '0 0 var(--sp-md)', alignSelf: 'flex-start', fontSize: 'var(--t-h4)', color: 'var(--text)' }}>
              Priority Distribution
            </h4>
            <Donut slices={prioritySlices} size={180} />
            <div style={{ marginTop: 'var(--sp-md)', width: '100%' }}>
              <Legend slices={prioritySlices} />
            </div>
          </div>

          <DataTableShell ariaLabel="Active cases status distribution and workflow stage">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Status</th>
                  <th style={th}>Case Count</th>
                  <th style={th}>Share of Total</th>
                  <th style={th}>Resolution State</th>
                </tr>
              </thead>
              <tbody>
                {statusBreakdown.map((s) => (
                  <tr key={s.status}>
                    <td style={td}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: 'var(--rad-sm)',
                          fontSize: 'var(--t-micro)',
                          fontWeight: 600,
                          background:
                            s.status === 'Resolved' || s.status === 'Closed'
                              ? 'var(--success-surface)'
                              : s.status === 'Under Review' || s.status === 'Awaiting Decision'
                                ? 'var(--warn-surface)'
                                : 'var(--danger-surface)',
                          color:
                            s.status === 'Resolved' || s.status === 'Closed'
                              ? 'var(--success)'
                              : s.status === 'Under Review' || s.status === 'Awaiting Decision'
                                ? 'var(--warn)'
                                : 'var(--danger)',
                        }}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td style={td} className="figure">{s.count}</td>
                    <td style={td} className="figure">{s.share}%</td>
                    <td style={td}>
                      {['Resolved', 'Closed'].includes(s.status) ? (
                        <span style={{ color: 'var(--success)' }}>Resolved</span>
                      ) : (
                        <span style={{ color: 'var(--warn)' }}>Pending Action</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>
        </div>
      )}

      {activeTab === 'financial' && (
        <DataTableShell ariaLabel="Financial settlement, client billing, deposit coverage, and loss absorption">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Case No</th>
                <th style={th}>Incident Title</th>
                <th style={th}>Assessed Cost</th>
                <th style={th}>Billed to Client</th>
                <th style={th}>Deposit Applied</th>
                <th style={th}>Insurance / Partner</th>
                <th style={th}>Absorbed Loss</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td style={td}><strong>{c.id}</strong></td>
                  <td style={td}>{c.title}</td>
                  <td style={td} className="figure">{money ? formatMoney(c.assessedPaisa) : 'Restricted'}</td>
                  <td style={{ ...td, color: 'var(--success)' }} className="figure">
                    {money ? formatMoney(c.chargedToClientPaisa) : 'Restricted'}
                  </td>
                  <td style={td} className="figure">
                    {money ? formatMoney(c.depositAppliedPaisa) : 'Restricted'}
                  </td>
                  <td style={td} className="figure">
                    {money
                      ? formatMoney(rupees((c.insuranceClaimedPaisa as number) + (c.recoveredFromPartnerPaisa as number)))
                      : 'Restricted'}
                  </td>
                  <td
                    style={{ ...td, color: (c.absorbedPaisa as number) > 0 ? 'var(--danger)' : 'var(--text2)' }}
                    className="figure"
                  >
                    {money ? formatMoney(c.absorbedPaisa) : 'Restricted'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>
      )}

      {activeTab === 'types' && (
        <div style={{ display: 'grid', gridTemplateColumns: viewport === 'phone' ? '1fr' : '320px 1fr', gap: 'var(--sp-md)', alignItems: 'start' }}>
          <div style={{ ...cardStyle, padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h4 style={{ margin: '0 0 var(--sp-md)', alignSelf: 'flex-start', fontSize: 'var(--t-h4)', color: 'var(--text)' }}>
              Incident Types
            </h4>
            <Donut slices={typeSlices} size={180} />
            <div style={{ marginTop: 'var(--sp-md)', width: '100%' }}>
              <Legend slices={typeSlices} />
            </div>
          </div>

          <DataTableShell ariaLabel="Breakdown of incident categories and occurrence volume">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Incident Category</th>
                  <th style={th}>Total Incidents</th>
                  <th style={th}>Share of Total</th>
                  <th style={th}>Severity Profile</th>
                </tr>
              </thead>
              <tbody>
                {typeSlices.map((t) => (
                  <tr key={t.label}>
                    <td style={td}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Icon name={CASE_TYPE_ICON[t.label as keyof typeof CASE_TYPE_ICON] ?? 'alert_triangle'} size={15} />
                        <strong>{t.label}</strong>
                      </span>
                    </td>
                    <td style={td} className="figure">{t.value}</td>
                    <td style={td} className="figure">{t.percent}</td>
                    <td style={td}>{t.label === 'Damage' ? 'Hardware Repairs' : t.label === 'Theft' ? 'Asset Replacement' : 'Operational Triage'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>
        </div>
      )}

      {activeTab === 'register' && (
        <DataTableShell ariaLabel="Exhaustive register of all incident cases and claim settlements">
          {loading ? (
            <div style={{ padding: 'var(--sp-xl)', textAlign: 'center', color: 'var(--muted)' }}>
              Loading cases register…
            </div>
          ) : cases.length === 0 ? (
            <div style={{ padding: 'var(--sp-xl)', textAlign: 'center', color: 'var(--muted)' }}>
              No incident cases found.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Case No</th>
                  <th style={th}>Type</th>
                  <th style={th}>Title</th>
                  <th style={th}>Counterparty</th>
                  <th style={th}>Priority</th>
                  <th style={th}>Status</th>
                  <th style={th}>Opened Date</th>
                  <th style={th}>Assessed Cost</th>
                  <th style={th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id}>
                    <td style={td}><strong>{c.id}</strong></td>
                    <td style={td}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Icon name={CASE_TYPE_ICON[c.type] ?? 'alert_triangle'} size={14} />
                        {c.type}
                      </span>
                    </td>
                    <td style={td}>{c.title}</td>
                    <td style={td}>{c.counterpartyName}</td>
                    <td style={td}>
                      <span style={{ color: `var(--${CASE_PRIORITY_META[c.priority]?.token ?? 'neutral'})` }}>
                        {c.priority}
                      </span>
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          borderRadius: 'var(--rad-sm)',
                          fontSize: 'var(--t-micro)',
                          fontWeight: 600,
                          background: 'var(--card-subtle)',
                        }}
                      >
                        <Icon name={CASE_STATUS_META[c.status]?.icon ?? 'flag'} size={12} />
                        {c.status}
                      </span>
                    </td>
                    <td style={td}>{c.openedAd.toLocaleDateString()}</td>
                    <td style={td} className="figure">{money ? formatMoney(c.assessedPaisa) : 'Restricted'}</td>
                    <td style={td}>
                      {c.linked?.linkedRecordId ? (
                        <Link
                          to={`/rentals/${c.linked.linkedRecordId}`}
                          style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }}
                        >
                          View Booking
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DataTableShell>
      )}
    </div>
  )
}
