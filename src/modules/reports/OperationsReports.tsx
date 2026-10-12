import { formatAd, formatAdDateTime } from '../../lib/bs'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { Donut, Legend, type Slice } from '../../components/ui/Charts'
import Icon from '../../components/ui/Icon'
import { useViewport } from '../../lib/device'
import {
  getOperationsReport,
  type OperationsReportData,
  type ReportFilterOptions,
} from '../../lib/queries/operationReports'

type OpTab = 'pickups' | 'returns' | 'overdue' | 'packing'

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

export default function OperationsReports() {
  const viewport = useViewport()
  const [activeTab, setActiveTab] = useState<OpTab>('pickups')
  const [filters, setFilters] = useState<ReportFilters>({})
  const [data, setData] = useState<OperationsReportData | null>(null)

  useEffect(() => {
    let active = true

    const branchId = filters.chips?.branch_id?.[0]
    const queryOpts: ReportFilterOptions = {
      from: filters.dateRange?.fromAd,
      to: filters.dateRange?.toAd,
      branchId,
    }

    void getOperationsReport(queryOpts).then((res) => {
      if (active) setData(res)
    })

    return () => {
      active = false
    }
  }, [filters])

  // Pickups KPI Strip
  const pickupKpis = useMemo<Kpi[]>(() => {
    if (!data) return []
    const m = data.metrics
    return [
      {
        label: 'Total Dispatches',
        value: String(m.totalPickups),
        icon: 'truck',
        accent: 'primary',
        note: 'Completed handover sessions',
      },
      {
        label: 'On-Time Handover',
        value: `${m.onTimePickupRate}%`,
        icon: 'timer',
        accent: 'success',
        note: 'Fulfillment within schedule',
      },
      {
        label: 'ID Verified',
        value: `${m.idVerificationRate}%`,
        icon: 'check',
        accent: m.idVerificationRate >= 95 ? 'success' : 'warn',
        note: 'Government ID documentary proof',
      },
      {
        label: 'Pending Dispatches',
        value: String(data.packingJobs.filter((p) => p.state === 'packed').length),
        icon: 'box',
        accent: 'neutral',
        note: 'Staged and ready for client pickup',
      },
    ]
  }, [data])

  // Returns KPI Strip
  const returnKpis = useMemo<Kpi[]>(() => {
    if (!data) return []
    const m = data.metrics
    const cleanReturns = data.returnConditions.find((c) => c.condition.includes('Clean'))?.count || 0
    const damageReturns = data.returnConditions.find((c) => c.condition.includes('Damage'))?.count || 0
    return [
      {
        label: 'Total Returns',
        value: String(m.totalReturns),
        icon: 'return_arrow',
        accent: 'primary',
        note: 'Checked-in return sessions',
      },
      {
        label: 'On-Time Returns',
        value: `${m.onTimeReturnRate}%`,
        icon: 'timer',
        accent: 'success',
        note: 'Returned on scheduled day',
      },
      {
        label: 'Clean & Ready',
        value: `${cleanReturns} (${Math.round((cleanReturns / (m.totalReturns || 1)) * 100)}%)`,
        icon: 'sparkles',
        accent: 'success',
        note: 'Passed immediate QC check',
      },
      {
        label: 'Exceptions / Damage',
        value: String(damageReturns),
        icon: 'alert_triangle',
        accent: damageReturns > 0 ? 'danger' : 'neutral',
        note: 'Flagged for technician assessment',
      },
    ]
  }, [data])

  // Overdue KPI Strip
  const overdueKpis = useMemo<Kpi[]>(() => {
    if (!data) return []
    const m = data.metrics
    const severeCount = data.overdueList.filter((o) => o.severity === 'severe').length
    return [
      {
        label: 'Currently Overdue',
        value: String(m.currentlyOverdue),
        icon: 'alert_triangle',
        accent: m.currentlyOverdue > 0 ? 'danger' : 'neutral',
        note: 'Active rentals past return date',
      },
      {
        label: 'Critical (6+ Days)',
        value: String(severeCount),
        icon: 'alert_triangle',
        accent: severeCount > 0 ? 'danger' : 'neutral',
        note: 'Requires immediate case escalation',
      },
      {
        label: 'Grace Period (1–2 Days)',
        value: String(data.overdueList.filter((o) => o.severity === 'moderate').length),
        icon: 'timer',
        accent: 'warn',
        note: 'Late extension follow-up',
      },
      {
        label: 'Fleet At Risk',
        value: `${data.overdueList.length} Hires`,
        icon: 'box',
        accent: 'neutral',
        note: 'Unreturned equipment packages',
      },
    ]
  }, [data])

  // Packing KPI Strip
  const packingKpis = useMemo<Kpi[]>(() => {
    if (!data) return []
    const m = data.metrics
    const packedCount = data.packingJobs.filter((p) => p.state === 'packed').length
    const pendingCount = data.packingJobs.filter((p) => p.state === 'pending').length
    return [
      {
        label: 'Packing Jobs',
        value: String(m.totalPackingJobs),
        icon: 'box',
        accent: 'primary',
        note: 'Pre-dispatch staging jobs',
      },
      {
        label: 'Fulfillment Rate',
        value: `${m.packingFulfillmentRate}%`,
        icon: 'chart',
        accent: 'success',
        note: 'Line items accurately verified',
      },
      {
        label: 'Staged & Ready',
        value: String(packedCount),
        icon: 'sparkles',
        accent: 'success',
        note: 'Packed awaiting handover',
      },
      {
        label: 'Pending Staging',
        value: String(pendingCount),
        icon: 'timer',
        accent: pendingCount > 0 ? 'warn' : 'neutral',
        note: 'Requires warehouse technician prep',
      },
    ]
  }, [data])

  // CSV rows generator
  const getCsvRows = (): ReportCsvRow[] => {
    if (activeTab === 'pickups') {
      return [
        ['Operations - Pickups & Handover Report'],
        ['Metric', 'Value'],
        ['Total Dispatches', data?.metrics.totalPickups ?? 0],
        ['On-Time Handover Rate', `${data?.metrics.onTimePickupRate ?? 0}%`],
        ['Government ID Verification Rate', `${data?.metrics.idVerificationRate ?? 0}%`],
        [],
        ['Delivery Methods Breakdown'],
        ['Method', 'Count', 'Share %'],
        ...(data?.deliveryMethods.map((dm): ReportCsvRow => [dm.method, dm.count, `${dm.percent}%`]) ?? []),
        [],
        ['Handover Sessions Log'],
        ['Booking No', 'Client', 'Pickup Time', 'Delivery Method', 'Receiver', 'ID Verified', 'Status'],
        ...(data?.pickups.map((p): ReportCsvRow => [
          p.bookingNo,
          p.clientName,
          p.pickupAt,
          p.deliveryType,
          p.receiverName,
          p.idVerified ? 'Yes' : 'No',
          p.status,
        ]) ?? []),
      ]
    } else if (activeTab === 'returns') {
      return [
        ['Operations - Returns & Check-in Inspections Report'],
        ['Metric', 'Value'],
        ['Total Returns', data?.metrics.totalReturns ?? 0],
        ['On-Time Return Rate', `${data?.metrics.onTimeReturnRate ?? 0}%`],
        [],
        ['Return Condition Breakdown'],
        ['Condition', 'Count', 'Share %'],
        ...(data?.returnConditions.map((rc): ReportCsvRow => [rc.condition, rc.count, `${rc.percent}%`]) ?? []),
        [],
        ['Return Sessions Log'],
        ['Booking No', 'Client', 'Return Time', 'Returning Person', 'Condition', 'Cleaning Required', 'Damage Suspected'],
        ...(data?.returns.map((r): ReportCsvRow => [
          r.bookingNo,
          r.clientName,
          r.returnAt,
          r.returningPerson,
          r.condition,
          r.cleaningRequired ? 'Yes' : 'No',
          r.damageSuspected ? 'Yes' : 'No',
        ]) ?? []),
      ]
    } else if (activeTab === 'overdue') {
      return [
        ['Operations - Overdue Fleet Tracking Report'],
        ['Metric', 'Value'],
        ['Currently Overdue Bookings', data?.metrics.currentlyOverdue ?? 0],
        [],
        ['Overdue Bookings Log'],
        ['Booking No', 'Client', 'Project', 'Scheduled Return', 'Days Overdue', 'Severity', 'Delivery Method'],
        ...(data?.overdueList.map((o): ReportCsvRow => [
          o.bookingNo,
          o.clientName,
          o.project,
          o.scheduledReturn,
          o.daysOverdue,
          o.severity,
          o.deliveryType,
        ]) ?? []),
      ]
    } else {
      return [
        ['Operations - Packing & Prep Fulfillment Report'],
        ['Metric', 'Value'],
        ['Total Packing Jobs', data?.metrics.totalPackingJobs ?? 0],
        ['Packing Fulfillment Rate', `${data?.metrics.packingFulfillmentRate ?? 0}%`],
        [],
        ['Packing Jobs List'],
        ['Booking No', 'Client', 'Project', 'Pickup Scheduled', 'Item Count', 'State'],
        ...(data?.packingJobs.map((p): ReportCsvRow => [
          p.bookingNo,
          p.clientName,
          p.project,
          p.pickupScheduled,
          p.itemCount,
          p.state,
        ]) ?? []),
      ]
    }
  }

  // Slices for Donut charts
  const deliverySlices: Slice[] = useMemo(() => {
    if (!data) return []
    return data.deliveryMethods.map((dm) => ({
      label: dm.method,
      value: dm.count,
      display: `${dm.count} (${dm.percent}%)`,
      percent: `${dm.percent}%`,
    }))
  }, [data])

  const returnSlices: Slice[] = useMemo(() => {
    if (!data) return []
    return data.returnConditions.map((rc) => ({
      label: rc.condition,
      value: rc.count,
      display: `${rc.count} (${rc.percent}%)`,
      percent: `${rc.percent}%`,
    }))
  }, [data])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="truck"
        title="Operations Reports"
        description="Dispatch handover fulfillment, return check-in inspections, overdue fleet tracking, and pre-flight packing jobs."
      />

      {/* Shared Toolbar */}
      <ReportToolbar
        title="Operations Reports"
        value={filters}
        onChange={setFilters}
        dateColumn="pickup_at"
        csv={{
          filename: `operations-${activeTab}`,
          build: getCsvRows,
        }}
      >
        <div
          role="group"
          aria-label="Operations report views"
          className="report-view-toggle"
          style={{ display: 'inline-flex' }}
        >
          {([
            ['Pickups & Handover', 'pickups'],
            ['Returns & Inspections', 'returns'],
            ['Overdue Fleet', 'overdue'],
            ['Packing Fulfillment', 'packing'],
          ] as const).map(([label, key]) => {
            const on = activeTab === key
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => setActiveTab(key)}
                className={`report-toggle-btn ${on ? 'is-active' : ''}`}
                style={{ minHeight: 44 }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </ReportToolbar>

      {/* TAB 1: PICKUPS & HANDOVER */}
      {activeTab === 'pickups' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <KpiStrip items={pickupKpis} columns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : 4} />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: viewport === 'desktop' ? '1fr 1fr' : '1fr',
              gap: 'var(--sp-md)',
            }}
          >
            {/* Delivery Methods Chart */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
                Handover Fulfillment Method
              </h3>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
                Client collection vs Babin vehicle delivery logistics.
              </p>
              {deliverySlices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', alignItems: 'center' }}>
                  <Donut slices={deliverySlices} size={180} />
                  <Legend slices={deliverySlices} />
                </div>
              )}
            </div>

            {/* Verification & Compliance */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
                Custody Transfer Verification
              </h3>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
                Compliance protocol enforcement for equipment custody release.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', fontSize: 'var(--t-body)' }}>
                <div style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: 'var(--r-sm)' }}>
                  <strong>Government ID Verification:</strong> 95.7% of handovers recorded scanned citizenship or passport proof before equipment release.
                </div>
                <div style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: 'var(--r-sm)' }}>
                  <strong>Booking Authorization:</strong> Operator verified authorized collector against client organizational roster.
                </div>
                <div style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: 'var(--r-sm)' }}>
                  <strong>Digital Signature:</strong> Mandatory signed receipt stored under Evidence Workspace for every handover.
                </div>
              </div>
            </div>
          </div>

          {/* Pickups Table */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-sm)' }}>
              <div>
                <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600 }}>Recent Handover Sessions</h3>
                <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  Log of dispatched equipment packages and receiving parties.
                </p>
              </div>
              <Link
                to="/operations"
                style={{
                  fontSize: 'var(--t-meta)',
                  color: 'var(--primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  textDecoration: 'none',
                }}
              >
                Go to Operations Desk <Icon name="chevron_right" size={12} />
              </Link>
            </div>

            <DataTableShell ariaLabel="Recent Handover Sessions">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Booking No</th>
                    <th style={th}>Client</th>
                    <th style={th}>Pickup Instant</th>
                    <th style={th}>Method</th>
                    <th style={th}>Receiver Name</th>
                    <th style={th}>ID Verified</th>
                    <th style={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.pickups.map((p) => (
                    <tr key={p.id}>
                      <td style={td}>
                        <Link
                          to={`/rentals/${p.bookingNo}`}
                          style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}
                        >
                          {p.bookingNo}
                        </Link>
                      </td>
                      <td style={td}>{p.clientName}</td>
                      <td style={td}>{formatAdDateTime(p.pickupAt)}</td>
                      <td style={td}>{p.deliveryType}</td>
                      <td style={td}>{p.receiverName}</td>
                      <td style={td}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--r-sm)',
                            fontSize: 'var(--t-meta)',
                            background: p.idVerified ? 'var(--status-success-bg)' : 'var(--status-warn-bg)',
                            color: p.idVerified ? 'var(--status-success-text)' : 'var(--status-warn-text)',
                          }}
                        >
                          {p.idVerified ? 'Verified' : 'Pending'}
                        </span>
                      </td>
                      <td style={td}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--r-sm)',
                            fontSize: 'var(--t-meta)',
                            background: 'var(--surface-hover)',
                            color: 'var(--text)',
                          }}
                        >
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          </div>
        </div>
      )}

      {/* TAB 2: RETURNS & INSPECTIONS */}
      {activeTab === 'returns' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <KpiStrip items={returnKpis} columns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : 4} />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: viewport === 'desktop' ? '1fr 1fr' : '1fr',
              gap: 'var(--sp-md)',
            }}
          >
            {/* Condition Distribution Chart */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
                Return Inspection Results
              </h3>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
                Equipment health check-in breakdown upon return.
              </p>
              {returnSlices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', alignItems: 'center' }}>
                  <Donut slices={returnSlices} size={180} />
                  <Legend slices={returnSlices} />
                </div>
              )}
            </div>

            {/* Warehouse QC Routing */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
                Return Check-in Workflow
              </h3>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
                Automated triage and workspace routing upon check-in.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', fontSize: 'var(--t-body)' }}>
                <div style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: 'var(--r-sm)' }}>
                  <strong>Immediate Restock (76%):</strong> Clean and verified units routed directly to Reset Workspace for barcode scan and shelf assignment.
                </div>
                <div style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: 'var(--r-sm)' }}>
                  <strong>Cleaning Queue (17%):</strong> Lens dust, sensor inspection, or outdoor cable cleaning routed to Cleaning bay.
                </div>
                <div style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: 'var(--r-sm)' }}>
                  <strong>Damage Finding (7%):</strong> Scratch, dent, or electrical fault automatically creates damage finding and holds security deposit.
                </div>
              </div>
            </div>
          </div>

          {/* Returns Table */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
              Recent Check-in Inspections
            </h3>
            <DataTableShell ariaLabel="Recent Check-in Inspections">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Booking No</th>
                    <th style={th}>Client</th>
                    <th style={th}>Return Time</th>
                    <th style={th}>Returning Person</th>
                    <th style={th}>Condition Status</th>
                    <th style={th}>Cleaning Required</th>
                    <th style={th}>Damage Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.returns.map((r) => (
                    <tr key={r.id}>
                      <td style={td}>
                        <Link
                          to={`/rentals/${r.bookingNo}`}
                          style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}
                        >
                          {r.bookingNo}
                        </Link>
                      </td>
                      <td style={td}>{r.clientName}</td>
                      <td style={td}>{formatAdDateTime(r.returnAt)}</td>
                      <td style={td}>{r.returningPerson}</td>
                      <td style={td}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--r-sm)',
                            fontSize: 'var(--t-meta)',
                            background: r.condition.includes('Damage')
                              ? 'var(--status-danger-bg)'
                              : r.condition.includes('Cleaning')
                                ? 'var(--status-warn-bg)'
                                : 'var(--status-success-bg)',
                            color: r.condition.includes('Damage')
                              ? 'var(--status-danger-text)'
                              : r.condition.includes('Cleaning')
                                ? 'var(--status-warn-text)'
                                : 'var(--status-success-text)',
                          }}
                        >
                          {r.condition}
                        </span>
                      </td>
                      <td style={td}>{r.cleaningRequired ? 'Yes (Cleaning Bay)' : 'No'}</td>
                      <td style={td}>
                        {r.damageSuspected ? (
                          <span style={{ color: 'var(--status-danger-text)', fontWeight: 600 }}>Flagged</span>
                        ) : (
                          'Clear'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          </div>
        </div>
      )}

      {/* TAB 3: OVERDUE FLEET */}
      {activeTab === 'overdue' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <KpiStrip items={overdueKpis} columns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : 4} />

          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-sm)' }}>
              <div>
                <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600 }}>Active Overdue Rentals Register</h3>
                <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  Rentals currently on rent past scheduled return deadline. Automatic late fees accrue per operational day.
                </p>
              </div>
            </div>

            <DataTableShell ariaLabel="Active Overdue Rentals Register">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Booking No</th>
                    <th style={th}>Client</th>
                    <th style={th}>Production / Project</th>
                    <th style={th}>Scheduled Return</th>
                    <th style={th}>Days Overdue</th>
                    <th style={th}>Delivery Method</th>
                    <th style={th}>Severity</th>
                    <th style={th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.overdueList.map((o) => (
                    <tr key={o.id}>
                      <td style={td}>
                        <Link
                          to={`/rentals/${o.bookingNo}`}
                          style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}
                        >
                          {o.bookingNo}
                        </Link>
                      </td>
                      <td style={td}>{o.clientName}</td>
                      <td style={td}>{o.project}</td>
                      <td style={td}>{formatAd(new Date(o.scheduledReturn))}</td>
                      <td style={{ ...td, fontWeight: 600, color: 'var(--status-danger-text)' }}>
                        {o.daysOverdue} days late
                      </td>
                      <td style={td}>{o.deliveryType}</td>
                      <td style={td}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--r-sm)',
                            fontSize: 'var(--t-meta)',
                            textTransform: 'capitalize',
                            background: o.severity === 'severe' ? 'var(--status-danger-bg)' : 'var(--status-warn-bg)',
                            color: o.severity === 'severe' ? 'var(--status-danger-text)' : 'var(--status-warn-text)',
                            fontWeight: 600,
                          }}
                        >
                          {o.severity}
                        </span>
                      </td>
                      <td style={td}>
                        <Link
                          to={`/rentals/${o.bookingNo}/return`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 10px',
                            background: 'var(--primary)',
                            color: '#fff',
                            borderRadius: 'var(--r-sm)',
                            fontSize: 'var(--t-meta)',
                            textDecoration: 'none',
                            fontWeight: 600,
                          }}
                        >
                          Process Return
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          </div>
        </div>
      )}

      {/* TAB 4: PACKING FULFILLMENT */}
      {activeTab === 'packing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <KpiStrip items={packingKpis} columns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : 4} />

          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-sm)' }}>
              <div>
                <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600 }}>Pre-Dispatch Packing Queue</h3>
                <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  Staging queue for warehouse prep and accessories assembly prior to handover.
                </p>
              </div>
              <Link
                to="/operations"
                style={{
                  fontSize: 'var(--t-meta)',
                  color: 'var(--primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  textDecoration: 'none',
                }}
              >
                Go to Packing Workspace <Icon name="chevron_right" size={12} />
              </Link>
            </div>

            <DataTableShell ariaLabel="Pre-Dispatch Packing Queue">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Booking No</th>
                    <th style={th}>Client</th>
                    <th style={th}>Production / Project</th>
                    <th style={th}>Scheduled Pickup</th>
                    <th style={th}>Line Items</th>
                    <th style={th}>Prep Status</th>
                    <th style={th}>Floor Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.packingJobs.map((pj) => (
                    <tr key={pj.id}>
                      <td style={td}>
                        <Link
                          to={`/rentals/${pj.bookingNo}`}
                          style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}
                        >
                          {pj.bookingNo}
                        </Link>
                      </td>
                      <td style={td}>{pj.clientName}</td>
                      <td style={td}>{pj.project}</td>
                      <td style={td}>{formatAdDateTime(pj.pickupScheduled)}</td>
                      <td style={td}>{pj.itemCount} items</td>
                      <td style={td}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--r-sm)',
                            fontSize: 'var(--t-meta)',
                            textTransform: 'capitalize',
                            background: pj.state === 'packed' ? 'var(--status-success-bg)' : 'var(--status-warn-bg)',
                            color: pj.state === 'packed' ? 'var(--status-success-text)' : 'var(--status-warn-text)',
                            fontWeight: 600,
                          }}
                        >
                          {pj.state}
                        </span>
                      </td>
                      <td style={td}>
                        <Link
                          to={`/rentals/${pj.bookingNo}/packing`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 10px',
                            background: pj.state === 'packed' ? 'var(--surface-hover)' : 'var(--primary)',
                            color: pj.state === 'packed' ? 'var(--text)' : '#fff',
                            borderRadius: 'var(--r-sm)',
                            fontSize: 'var(--t-meta)',
                            textDecoration: 'none',
                            fontWeight: 600,
                          }}
                        >
                          {pj.state === 'packed' ? 'Review Packing' : 'Pack Booking'}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          </div>
        </div>
      )}
    </div>
  )
}
