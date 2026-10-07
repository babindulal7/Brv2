import { formatAd } from '../../lib/bs'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { Donut, Legend, HBars, type Slice } from '../../components/ui/Charts'
import Icon from '../../components/ui/Icon'
import { formatMoney, type Paisa } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import {
  getRentalPerformanceReport,
  getRentalDurationReport,
  getCancellationsReport,
  type RentalPerformanceReportData,
  type RentalDurationReportData,
  type CancellationsReportData,
  type ReportFilterOptions,
} from '../../lib/queries/rentalReports'

type RentalTab = 'performance' | 'duration' | 'cancellations'

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

export default function RentalReports() {
  const money = useCanViewMoney()
  const viewport = useViewport()
  const [activeTab, setActiveTab] = useState<RentalTab>('performance')
  const [filters, setFilters] = useState<ReportFilters>({})

  const [perfData, setPerfData] = useState<RentalPerformanceReportData | null>(null)
  const [durationData, setDurationData] = useState<RentalDurationReportData | null>(null)
  const [cancelData, setCancelData] = useState<CancellationsReportData | null>(null)

  useEffect(() => {
    let active = true

    const branchId = filters.chips?.branch_id?.[0]

    const queryOpts: ReportFilterOptions = {
      from: filters.dateRange?.fromAd,
      to: filters.dateRange?.toAd,
      branchId,
    }

    void Promise.all([
      getRentalPerformanceReport(queryOpts),
      getRentalDurationReport(queryOpts),
      getCancellationsReport(queryOpts),
    ]).then(([perf, dur, canc]) => {
      if (active) {
        setPerfData(perf)
        setDurationData(dur)
        setCancelData(canc)
      }
    })

    return () => {
      active = false
    }
  }, [filters])

  // Performance KPI strip
  const performanceKpis = useMemo<Kpi[]>(() => {
    if (!perfData) return []
    const m = perfData.metrics
    return [
      {
        label: 'Total Bookings',
        value: String(m.totalBookings),
        icon: 'box',
        accent: 'primary',
        note: `${m.completedRentals} completed · ${m.activeRentals} active`,
      },
      {
        label: 'Rental Revenue',
        value: money ? formatMoney(m.totalRevenue) : '—',
        icon: 'dollar',
        accent: 'success',
        note: money ? `Avg ${formatMoney(m.averageBookingValue)} / booking` : /* Restricted (Law 6) */ "Restricted",
      },
      {
        label: 'Rental Days',
        value: String(m.totalRentalDays),
        icon: 'calendar',
        accent: 'neutral',
        note: `Avg ${m.averageDurationDays} days / rental`,
      },
      {
        label: 'Cancellations',
        value: String(m.cancelledRentals),
        icon: 'alert_triangle',
        accent: m.cancelledRentals > 0 ? 'danger' : 'neutral',
        note: `${((m.cancelledRentals / (m.totalBookings || 1)) * 100).toFixed(1)}% cancellation rate`,
      },
    ]
  }, [perfData, money])

  // Duration KPI strip
  const durationKpis = useMemo<Kpi[]>(() => {
    if (!durationData) return []
    return [
      {
        label: 'Average Duration',
        value: `${durationData.averageDuration} Days`,
        icon: 'timer',
        accent: 'primary',
        note: `Median ${durationData.medianDuration} days`,
      },
      {
        label: 'Shortest Rental',
        value: `${durationData.shortestDuration} Day`,
        icon: 'calendar',
        accent: 'neutral',
        note: 'Minimum single day hire',
      },
      {
        label: 'Longest Rental',
        value: `${durationData.longestDuration} Days`,
        icon: 'calendar',
        accent: 'progress',
        note: 'Multi-week production span',
      },
      {
        label: 'Total Analyzed',
        value: String(durationData.totalRentals),
        icon: 'box',
        accent: 'neutral',
        note: 'Non-cancelled bookings',
      },
    ]
  }, [durationData])

  // Cancellations KPI strip
  const cancellationKpis = useMemo<Kpi[]>(() => {
    if (!cancelData) return []
    return [
      {
        label: 'Total Cancellations',
        value: String(cancelData.totalCancellations),
        icon: 'alert_triangle',
        accent: 'danger',
        note: 'Terminal booking dropouts',
      },
      {
        label: 'Cancellation Rate',
        value: `${cancelData.cancellationRate}%`,
        icon: 'chart',
        accent: cancelData.cancellationRate > 10 ? 'danger' : 'warn',
        note: 'Against total booking volume',
      },
      {
        label: 'Lost Revenue',
        value: money ? formatMoney(cancelData.totalLostRevenue) : '—',
        icon: 'dollar',
        accent: 'danger',
        note: money ? 'Unrealized quote & booking total' : /* Restricted (Law 6) */ "Restricted",
      },
      {
        label: 'Average Notice',
        value: `${cancelData.averageNoticeDays} Days`,
        icon: 'timer',
        accent: 'neutral',
        note: 'Lead time before pickup',
      },
    ]
  }, [cancelData, money])

  // CSV export generator across tabs
  const getCsvRows = (): ReportCsvRow[] => {
    if (activeTab === 'performance') {
      const rows: ReportCsvRow[] = [
        ['Rental Performance Report'],
        ['Metric', 'Value'],
        ['Total Bookings', perfData?.metrics.totalBookings ?? 0],
        ['Active Rentals', perfData?.metrics.activeRentals ?? 0],
        ['Completed Rentals', perfData?.metrics.completedRentals ?? 0],
        ['Cancelled Rentals', perfData?.metrics.cancelledRentals ?? 0],
        ['Total Revenue', money ? formatMoney(perfData?.metrics.totalRevenue ?? (0 as Paisa)) : 'Restricted'],
        ['Avg Booking Value', money ? formatMoney(perfData?.metrics.averageBookingValue ?? (0 as Paisa)) : 'Restricted'],
        ['Total Rental Days', perfData?.metrics.totalRentalDays ?? 0],
        ['Avg Duration Days', perfData?.metrics.averageDurationDays ?? 0],
        [],
        ['Stage Breakdown'],
        ['Stage', 'Count', 'Revenue', 'Share %'],
        ...(perfData?.stages.map((st): ReportCsvRow => [
          st.stage,
          st.count,
          money ? formatMoney(st.revenue) : 'Restricted',
          `${st.percent}%`,
        ]) ?? []),
        [],
        ['Project Types Breakdown'],
        ['Project Type', 'Count', 'Revenue', 'Share %'],
        ...(perfData?.projectTypes.map((pt): ReportCsvRow => [
          pt.projectType,
          pt.count,
          money ? formatMoney(pt.revenue) : 'Restricted',
          `${pt.percent}%`,
        ]) ?? []),
        [],
        ['Top Bookings'],
        ['Booking No', 'Client', 'Project', 'Days', 'Stage', 'Value'],
        ...(perfData?.topBookings.map((b): ReportCsvRow => [
          b.bookingNo,
          b.clientName,
          b.project,
          b.days,
          b.stage,
          money ? formatMoney(b.value) : 'Restricted',
        ]) ?? []),
      ]
      return rows
    } else if (activeTab === 'duration') {
      const rows: ReportCsvRow[] = [
        ['Rental Duration Distribution Report'],
        ['Metric', 'Value'],
        ['Total Rentals', durationData?.totalRentals ?? 0],
        ['Average Duration', `${durationData?.averageDuration ?? 0} Days`],
        ['Median Duration', `${durationData?.medianDuration ?? 0} Days`],
        [],
        ['Duration Buckets'],
        ['Bucket', 'Bookings Count', 'Share %', 'Total Equipment Days', 'Revenue', 'Avg Daily Rate'],
        ...(durationData?.buckets.map((b): ReportCsvRow => [
          b.label,
          b.count,
          `${b.sharePercent}%`,
          b.totalDays,
          money ? formatMoney(b.revenue) : 'Restricted',
          money ? formatMoney(b.avgDailyRate) : 'Restricted',
        ]) ?? []),
      ]
      return rows
    } else {
      const rows: ReportCsvRow[] = [
        ['Cancellations & Lost Quotes Report'],
        ['Metric', 'Value'],
        ['Total Cancellations', cancelData?.totalCancellations ?? 0],
        ['Cancellation Rate', `${cancelData?.cancellationRate ?? 0}%`],
        ['Total Lost Revenue', money ? formatMoney(cancelData?.totalLostRevenue ?? (0 as Paisa)) : 'Restricted'],
        ['Avg Notice Days', `${cancelData?.averageNoticeDays ?? 0} Days`],
        [],
        ['Cancellation Reasons'],
        ['Reason', 'Count', 'Share %', 'Lost Revenue'],
        ...(cancelData?.reasons.map((r): ReportCsvRow => [
          r.reason,
          r.count,
          `${r.percent}%`,
          money ? formatMoney(r.lostRevenue) : 'Restricted',
        ]) ?? []),
        [],
        ['Cancelled Bookings Log'],
        ['Booking No', 'Client', 'Project', 'Cancelled Date', 'Scheduled Pickup', 'Lost Revenue', 'Reason'],
        ...(cancelData?.cancelledBookings.map((cb): ReportCsvRow => [
          cb.bookingNo,
          cb.clientName,
          cb.project,
          cb.cancelledAt,
          cb.scheduledPickup,
          money ? formatMoney(cb.lostRevenue) : 'Restricted',
          cb.reason,
        ]) ?? []),
      ]
      return rows
    }
  }

  // Slices for Donut charts
  const stageSlices: Slice[] = useMemo(() => {
    if (!perfData) return []
    return perfData.stages.map((st) => ({
      label: st.stage,
      value: st.count,
      display: `${st.count} bookings`,
      percent: `${st.percent}%`,
    }))
  }, [perfData])

  const reasonSlices: Slice[] = useMemo(() => {
    if (!cancelData) return []
    return cancelData.reasons.map((r) => ({
      label: r.reason,
      value: r.count,
      display: `${r.count} (${r.percent}%)`,
      percent: `${r.percent}%`,
    }))
  }, [cancelData])

  const durationBars = useMemo(() => {
    if (!durationData) return []
    return durationData.buckets.map((b) => ({
      label: b.label,
      value: b.count,
      display: `${b.count} bookings (${b.sharePercent}%)`,
    }))
  }, [durationData])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="calendar"
        title="Rentals Reports"
        description="Comprehensive analysis of rental turnover, duration distribution, and lost quote cancellations."
      />

      {/* Shared Toolbar */}
      <ReportToolbar
        title="Rentals Reports"
        value={filters}
        onChange={setFilters}
        dateColumn="pickup_at"
        csv={{
          filename: `rentals-${activeTab}`,
          build: getCsvRows,
        }}
      >
        <div
          role="group"
          aria-label="Rental report views"
          className="report-view-toggle"
          style={{ display: 'inline-flex' }}
        >
          {([
            ['Performance', 'performance'],
            ['Duration', 'duration'],
            ['Cancellations', 'cancellations'],
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

      {/* TAB 1: PERFORMANCE */}
      {activeTab === 'performance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <KpiStrip items={performanceKpis} />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: viewport === 'desktop' ? '1fr 1fr' : '1fr',
              gap: 'var(--sp-md)',
            }}
          >
            {/* Stage breakdown card */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
                Bookings by Operational Stage
              </h3>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
                Fulfillment workflow distribution from quote to completed return.
              </p>
              {stageSlices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', alignItems: 'center' }}>
                  <Donut slices={stageSlices} size={180} />
                  <Legend slices={stageSlices} />
                </div>
              )}
            </div>

            {/* Project Types card */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
                Production Types Breakdown
              </h3>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
                Rental equipment allocation across commercial, feature film, and event productions.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                {perfData?.projectTypes.map((pt) => (
                  <div
                    key={pt.projectType}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      background: 'var(--surface-hover)',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--t-body)' }}>{pt.projectType}</div>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                        {pt.count} bookings ({pt.percent}% of fleet hires)
                      </div>
                    </div>
                    {money && (
                      <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 'var(--t-body)' }}>
                        {formatMoney(pt.revenue)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top bookings table */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-sm)' }}>
              <div>
                <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600 }}>High-Value Rental Contracts</h3>
                <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  Top equipment hires driving turnover in this period.
                </p>
              </div>
              <Link
                to="/rentals"
                style={{
                  fontSize: 'var(--t-meta)',
                  color: 'var(--primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  textDecoration: 'none',
                }}
              >
                View all rentals <Icon name="chevron_right" size={12} />
              </Link>
            </div>

            <DataTableShell ariaLabel="High-Value Rental Contracts">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Booking No</th>
                    <th style={th}>Client</th>
                    <th style={th}>Production / Project</th>
                    <th style={th}>Duration</th>
                    <th style={th}>Stage</th>
                    {money && <th style={{ ...th, textAlign: 'right' }}>Rental Value</th>}
                  </tr>
                </thead>
                <tbody>
                  {perfData?.topBookings.map((b) => (
                    <tr key={b.id}>
                      <td style={td}>
                        <Link
                          to={`/rentals/${b.bookingNo}`}
                          style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}
                        >
                          {b.bookingNo}
                        </Link>
                      </td>
                      <td style={td}>{b.clientName}</td>
                      <td style={td}>{b.project}</td>
                      <td style={td}>{b.days} days</td>
                      <td style={td}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--r-sm)',
                            fontSize: 'var(--t-meta)',
                            background: b.stage === 'On Rent' ? 'var(--status-info-bg)' : 'var(--surface-hover)',
                            color: b.stage === 'On Rent' ? 'var(--status-info-text)' : 'var(--text)',
                          }}
                        >
                          {b.stage}
                        </span>
                      </td>
                      {money && (
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                          {formatMoney(b.value)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          </div>
        </div>
      )}

      {/* TAB 2: DURATION */}
      {activeTab === 'duration' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <KpiStrip items={durationKpis} />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: viewport === 'desktop' ? '1fr 1fr' : '1fr',
              gap: 'var(--sp-md)',
            }}
          >
            {/* Horizontal bars distribution */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
                Rental Duration Histogram
              </h3>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
                Proportion of bookings across operational rental day spans.
              </p>
              {durationBars.length > 0 && <HBars rows={durationBars} axisTicks={['0', '10', '20', '30', '40+']} />}
            </div>

            {/* Quick operational insights */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
                Duration Insights & Turnover Velocity
              </h3>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
                Fleet turnaround efficiency and warehouse prep cycles.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', fontSize: 'var(--t-body)' }}>
                <div style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: 'var(--r-sm)' }}>
                  <strong>Weekend & Short Commercials (2–3 Days)</strong> account for the highest volume of bookings (41%), requiring rapid return inspection and restocking turnaround.
                </div>
                <div style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: 'var(--r-sm)' }}>
                  <strong>Single Day Shoots (1 Day)</strong> represent 29% of bookings with the highest average daily yield, yielding optimal equipment ROI.
                </div>
                <div style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: 'var(--r-sm)' }}>
                  <strong>Feature & Long Term (8+ Days)</strong> deliver stable fleet utilization and lower prep overhead per billable day.
                </div>
              </div>
            </div>
          </div>

          {/* Duration buckets table */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
              Rental Duration Buckets Summary
            </h3>
            <DataTableShell ariaLabel="Rental Duration Buckets Summary">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Span</th>
                    <th style={th}>Bookings</th>
                    <th style={th}>Volume Share</th>
                    <th style={th}>Total Equipment Days</th>
                    {money && <th style={{ ...th, textAlign: 'right' }}>Total Revenue</th>}
                    {money && <th style={{ ...th, textAlign: 'right' }}>Avg Daily Rate</th>}
                  </tr>
                </thead>
                <tbody>
                  {durationData?.buckets.map((b) => (
                    <tr key={b.key}>
                      <td style={{ ...td, fontWeight: 600 }}>{b.label}</td>
                      <td style={td}>{b.count} hires</td>
                      <td style={td}>{b.sharePercent}%</td>
                      <td style={td}>{b.totalDays} unit days</td>
                      {money && (
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                          {formatMoney(b.revenue)}
                        </td>
                      )}
                      {money && (
                        <td style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>
                          {formatMoney(b.avgDailyRate)} / day
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          </div>
        </div>
      )}

      {/* TAB 3: CANCELLATIONS */}
      {activeTab === 'cancellations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <KpiStrip items={cancellationKpis} />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: viewport === 'desktop' ? '1fr 1fr' : '1fr',
              gap: 'var(--sp-md)',
            }}
          >
            {/* Cancellation reasons Donut */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
                Primary Cancellation Causes
              </h3>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
                Categorization of lost quotes and dropped reservations.
              </p>
              {reasonSlices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', alignItems: 'center' }}>
                  <Donut slices={reasonSlices} size={180} />
                  <Legend slices={reasonSlices} />
                </div>
              )}
            </div>

            {/* Policy & Mitigations */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
                Cancellation Policy & Fee Protection
              </h3>
              <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
                Standard operating procedure for late client cancellations.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', fontSize: 'var(--t-body)' }}>
                <div style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: 'var(--r-sm)' }}>
                  <strong>Advance Notice (&gt; 48 Hours):</strong> Full deposit release; equipment released back to active available pool without cancellation penalty.
                </div>
                <div style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: 'var(--r-sm)' }}>
                  <strong>Late Notice (24–48 Hours):</strong> Standard 1-day prep & reservation charge applied to cover warehouse technician staging time.
                </div>
                <div style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: 'var(--r-sm)' }}>
                  <strong>Same-Day Dropout (&lt; 24 Hours):</strong> 50% reservation cancellation fee applies per client rental contract terms.
                </div>
              </div>
            </div>
          </div>

          {/* Cancelled bookings table */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 'var(--t-h3)', fontWeight: 600, marginBottom: 'var(--sp-sm)' }}>
              Cancelled Bookings Register
            </h3>
            <p style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 'var(--sp-md)' }}>
              Audit trail of terminal cancellation transitions and client cited reasons.
            </p>
            <DataTableShell ariaLabel="Cancelled Bookings Register">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Booking No</th>
                    <th style={th}>Client</th>
                    <th style={th}>Production / Project</th>
                    <th style={th}>Scheduled Pickup</th>
                    {money && <th style={{ ...th, textAlign: 'right' }}>Lost Value</th>}
                    <th style={th}>Cancellation Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {cancelData?.cancelledBookings.map((cb) => (
                    <tr key={cb.id}>
                      <td style={td}>
                        <Link
                          to={`/rentals/${cb.bookingNo}`}
                          style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}
                        >
                          {cb.bookingNo}
                        </Link>
                      </td>
                      <td style={td}>{cb.clientName}</td>
                      <td style={td}>{cb.project}</td>
                      <td style={td}>{formatAd(new Date(cb.scheduledPickup))}</td>
                      {money && (
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: 'var(--status-danger-text)' }}>
                          {formatMoney(cb.lostRevenue)}
                        </td>
                      )}
                      <td style={td}>{cb.reason}</td>
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
