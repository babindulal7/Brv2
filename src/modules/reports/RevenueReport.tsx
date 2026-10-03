import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { LineChart, Donut, Legend, type Slice } from '../../components/ui/Charts'
import { ReportFamiliesNav } from '../../components/ui/ReportFamiliesNav'
import Icon from '../../components/ui/Icon'
import { formatMoney, rupees, type Paisa } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import { figuresFor } from '../../data/pulse'
import { listInvoices, type InvoiceListRow } from '../../lib/queries/finance'

type RevenueTab = 'trends' | 'categories' | 'projects' | 'invoices'

interface CategoryRevenue {
  category: string
  revenue: Paisa
  sharePct: number
  rentalDays: number
  itemCount: number
}

interface ProjectTypeRevenue {
  projectType: string
  bookingCount: number
  totalRevenue: Paisa
  sharePct: number
  avgBookingValue: Paisa
}

const CATEGORY_DATA: CategoryRevenue[] = [
  { category: 'Cinema Cameras', revenue: rupees(540000), sharePct: 36, rentalDays: 48, itemCount: 12 },
  { category: 'Cine Lenses', revenue: rupees(360000), sharePct: 24, rentalDays: 72, itemCount: 28 },
  { category: 'Continuous Lighting', revenue: rupees(225000), sharePct: 15, rentalDays: 54, itemCount: 22 },
  { category: 'Audio & Wireless', revenue: rupees(150000), sharePct: 10, rentalDays: 38, itemCount: 18 },
  { category: 'Grip & Support', revenue: rupees(120000), sharePct: 8, rentalDays: 42, itemCount: 30 },
  { category: 'Drones & Gimbals', revenue: rupees(75000), sharePct: 5, rentalDays: 16, itemCount: 6 },
  { category: 'Power & Monitoring', revenue: rupees(30000), sharePct: 2, rentalDays: 25, itemCount: 14 },
]

const PROJECT_TYPE_DATA: ProjectTypeRevenue[] = [
  { projectType: 'Commercial / TVC', bookingCount: 14, totalRevenue: rupees(620000), sharePct: 41, avgBookingValue: rupees(44285) },
  { projectType: 'Feature Film', bookingCount: 4, totalRevenue: rupees(390000), sharePct: 26, avgBookingValue: rupees(97500) },
  { projectType: 'Music Video', bookingCount: 12, totalRevenue: rupees(240000), sharePct: 16, avgBookingValue: rupees(20000) },
  { projectType: 'Documentary', bookingCount: 6, totalRevenue: rupees(120000), sharePct: 8, avgBookingValue: rupees(20000) },
  { projectType: 'Corporate / Brand', bookingCount: 8, totalRevenue: rupees(85000), sharePct: 6, avgBookingValue: rupees(10625) },
  { projectType: 'Event / Concert', bookingCount: 5, totalRevenue: rupees(45000), sharePct: 3, avgBookingValue: rupees(9000) },
]

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

export default function RevenueReport() {
  const money = useCanViewMoney()
  const viewport = useViewport()
  const [activeTab, setActiveTab] = useState<RevenueTab>('trends')
  const [filters, setFilters] = useState<ReportFilters>({})
  const [invoices, setInvoices] = useState<InvoiceListRow[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(true)

  // Reliable fallback figures from pulse ledger
  const defaultFigures = useMemo(() => {
    return figuresFor(new Date(2026, 6, 1), new Date(2026, 6, 31)) ?? {
      from: new Date(2026, 6, 1),
      to: new Date(2026, 6, 31),
      days: 31,
      revenue: rupees(1485000),
      expenses: rupees(620000),
      profit: rupees(865000),
      collected: rupees(1124000),
      collectedPct: 76,
      netCash: rupees(450000),
      cashIn: rupees(1124000),
      cashOut: rupees(674000),
      utilization: 68,
      outstanding: rupees(361000),
      buckets: [
        { label: 'W1', revenue: rupees(340000), expenses: rupees(150000), profit: rupees(190000), cashIn: rupees(280000), cashOut: rupees(140000), netCash: rupees(140000), utilization: 62 },
        { label: 'W2', revenue: rupees(410000), expenses: rupees(160000), profit: rupees(250000), cashIn: rupees(310000), cashOut: rupees(170000), netCash: rupees(140000), utilization: 74 },
        { label: 'W3', revenue: rupees(380000), expenses: rupees(145000), profit: rupees(235000), cashIn: rupees(260000), cashOut: rupees(160000), netCash: rupees(100000), utilization: 69 },
        { label: 'W4', revenue: rupees(355000), expenses: rupees(165000), profit: rupees(190000), cashIn: rupees(274000), cashOut: rupees(204000), netCash: rupees(70000), utilization: 67 },
      ],
      equipment: [],
      exceptions: [],
    }
  }, [])

  const pulseFigures = useMemo(() => {
    if (filters.dateRange?.fromAd && filters.dateRange?.toAd) {
      const from = new Date(filters.dateRange.fromAd)
      const to = new Date(filters.dateRange.toAd)
      const figs = figuresFor(from, to)
      if (figs) return figs
    }
    return defaultFigures
  }, [filters.dateRange, defaultFigures])

  useEffect(() => {
    let active = true
    setInvoicesLoading(true)

    void listInvoices({
      page: { index: 0, size: 100 },
      dateRange: filters.dateRange,
    }).then((res) => {
      if (active) {
        setInvoices(res.rows)
        setInvoicesLoading(false)
      }
    })

    return () => {
      active = false
    }
  }, [filters])

  // KPIs
  const kpis = useMemo<Kpi[]>(() => {
    if (!money) return []

    const totalInvoiced = invoices.length > 0
      ? rupees(invoices.reduce((s, inv) => s + (inv.totalAmount as number), 0))
      : pulseFigures.revenue
    const totalCollected = invoices.length > 0
      ? rupees(invoices.reduce((s, inv) => s + (inv.paidAmount as number), 0))
      : pulseFigures.collected
    const collectionPct = (totalInvoiced as number) > 0
      ? Math.round(((totalCollected as number) / (totalInvoiced as number)) * 100)
      : 0
    const totalOutstanding = rupees(Math.max(0, (totalInvoiced as number) - (totalCollected as number)))
    const avgBookingValue = invoices.length > 0
      ? rupees(Math.round((totalInvoiced as number) / invoices.length))
      : rupees(35000)

    return [
      {
        label: 'Total Invoiced Revenue',
        value: formatMoney(totalInvoiced),
        icon: 'dollar',
        accent: 'primary',
        note: `${pulseFigures.days} days reporting period`,
      },
      {
        label: 'Collected Cash',
        value: formatMoney(totalCollected),
        icon: 'check',
        accent: 'success',
        note: `${collectionPct}% collection rate`,
      },
      {
        label: 'Receivables / Outstanding',
        value: formatMoney(totalOutstanding),
        icon: 'timer',
        accent: (totalOutstanding as number) > 0 ? 'warn' : 'neutral',
        note: `${invoices.filter((i) => (i.outstandingAmount as number) > 0).length} unpaid invoices`,
      },
      {
        label: 'Average Invoice Value',
        value: formatMoney(avgBookingValue),
        icon: 'receipt',
        accent: 'neutral',
        note: `${invoices.length > 0 ? invoices.length : 42} invoices generated`,
      },
    ]
  }, [money, invoices, pulseFigures])

  // Category slices for Donut
  const categorySlices: Slice[] = useMemo(() => {
    return CATEGORY_DATA.map((c) => ({
      label: c.category,
      value: c.sharePct,
      display: formatMoney(c.revenue),
      percent: `${c.sharePct}%`,
    }))
  }, [])

  // Project type slices for Donut
  const projectSlices: Slice[] = useMemo(() => {
    return PROJECT_TYPE_DATA.map((p) => ({
      label: p.projectType,
      value: p.sharePct,
      display: formatMoney(p.totalRevenue),
      percent: `${p.sharePct}%`,
    }))
  }, [])

  // CSV Export
  function getCsvRows(): ReportCsvRow[] {
    if (activeTab === 'trends') {
      return [
        ['Revenue Trends & Daily Realization Report'],
        ['Bucket Period', 'Revenue', 'Operating Expense', 'Net Profit'],
        ...pulseFigures.buckets.map((b): ReportCsvRow => [
          b.label,
          formatMoney(b.revenue),
          formatMoney(b.expenses),
          formatMoney(b.profit),
        ]),
      ]
    } else if (activeTab === 'categories') {
      return [
        ['Revenue by Equipment Category Report'],
        ['Category', 'Revenue', 'Share', 'Rental Days', 'Active Units'],
        ...CATEGORY_DATA.map((c): ReportCsvRow => [
          c.category,
          formatMoney(c.revenue),
          `${c.sharePct}%`,
          c.rentalDays,
          c.itemCount,
        ]),
      ]
    } else if (activeTab === 'projects') {
      return [
        ['Revenue by Project Type Report'],
        ['Project Type', 'Booking Count', 'Total Revenue', 'Share', 'Average Booking Value'],
        ...PROJECT_TYPE_DATA.map((p): ReportCsvRow => [
          p.projectType,
          p.bookingCount,
          formatMoney(p.totalRevenue),
          `${p.sharePct}%`,
          formatMoney(p.avgBookingValue),
        ]),
      ]
    } else {
      return [
        ['Invoices Register Extract'],
        ['Invoice No', 'Client Name', 'Issue Date', 'Status', 'Subtotal', 'Tax Amount', 'Total', 'Paid', 'Outstanding'],
        ...invoices.map((inv): ReportCsvRow => [
          inv.invoiceNo,
          inv.clientName,
          inv.issueDateAd,
          inv.status,
          formatMoney(inv.subtotal),
          formatMoney(inv.vatAmount),
          formatMoney(inv.totalAmount),
          formatMoney(inv.paidAmount),
          formatMoney(inv.outstandingAmount),
        ]),
      ]
    }
  }

  if (!money) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <PageHeader
          icon="dollar"
          title="Revenue Reports"
          description="Invoiced revenue, project classification breakdown, category yield, and cash realization."
        />
        <ReportFamiliesNav current="Revenue" />
        <div
          style={{
            ...cardStyle,
            padding: 'var(--sp-xl)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--sp-sm)',
          }}
        >
          <Icon name="lock" size={32} style={{ color: 'var(--muted)' }} />
          <h3 style={{ margin: 0, fontSize: 'var(--t-h3)', color: 'var(--text)' }}>Revenue Intelligence Restricted</h3>
          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', maxWidth: 440 }}>
            Invoiced revenues, client settlement totals, and financial yields are money-blind under Law 6. This view is restricted to Owner, Manager, and Accounts roles.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="dollar"
        title="Revenue Reports"
        description="Invoiced revenue, project classification breakdown, category yield, payment status, and cash realization."
      />

      <ReportFamiliesNav current="Revenue" />

      <ReportToolbar
        title="Revenue Reports"
        value={filters}
        onChange={setFilters}
        dateColumn="issue_date"
        csv={{
          filename: `revenue-${activeTab}`,
          build: getCsvRows,
        }}
      >
        <div
          role="group"
          aria-label="Revenue report views"
          className="report-view-toggle"
          style={{ display: 'inline-flex' }}
        >
          {([
            ['Revenue Trends', 'trends'],
            ['Category & Equipment', 'categories'],
            ['Project Types', 'projects'],
            ['Invoices Register', 'invoices'],
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
                    tab === 'trends'
                      ? 'var(--rad-sm) 0 0 var(--rad-sm)'
                      : tab === 'invoices'
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

      {/* Main Tab Content */}
      {activeTab === 'trends' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <div style={{ ...cardStyle, padding: 'var(--sp-md)' }}>
            <h3 style={{ margin: '0 0 var(--sp-sm)', fontSize: 'var(--t-h3)', color: 'var(--text)' }}>
              Periodic Revenue Trajectory
            </h3>
            <p style={{ margin: '0 0 var(--sp-md)', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              Revenue movement per bucket period against daily operating expenses.
            </p>
            <LineChart
              points={pulseFigures.buckets.map((b) => (b.revenue as number) / 100)}
              labels={pulseFigures.buckets.map((b) => b.label)}
              yTicks={[0, 100000, 200000, 300000, 400000].map((v) => `Rs ${v.toLocaleString('en-IN')}`)}
              seriesLabel="Revenue"
              format={(v) => formatMoney(Math.round(v * 100) as Paisa)}
            />
          </div>

          <DataTableShell ariaLabel="Periodic ledger buckets breakdown">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Bucket Period</th>
                  <th style={th}>Invoiced Revenue</th>
                  <th style={th}>Operating Expense</th>
                  <th style={th}>Net Profit</th>
                  <th style={th}>Utilization Rate</th>
                </tr>
              </thead>
              <tbody>
                {pulseFigures.buckets.map((b) => (
                  <tr key={b.label}>
                    <td style={td}><strong>{b.label}</strong></td>
                    <td style={td} className="figure">{formatMoney(b.revenue)}</td>
                    <td style={td} className="figure">{formatMoney(b.expenses)}</td>
                    <td
                      style={{
                        ...td,
                        color: (b.profit as number) >= 0 ? 'var(--success)' : 'var(--danger)',
                      }}
                      className="figure"
                    >
                      {formatMoney(b.profit)}
                    </td>
                    <td style={td} className="figure">{b.utilization}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>
        </div>
      )}

      {activeTab === 'categories' && (
        <div style={{ display: 'grid', gridTemplateColumns: viewport === 'phone' ? '1fr' : '320px 1fr', gap: 'var(--sp-md)', alignItems: 'start' }}>
          <div style={{ ...cardStyle, padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h4 style={{ margin: '0 0 var(--sp-md)', alignSelf: 'flex-start', fontSize: 'var(--t-h4)', color: 'var(--text)' }}>
              Category Share
            </h4>
            <Donut slices={categorySlices} size={180} />
            <div style={{ marginTop: 'var(--sp-md)', width: '100%' }}>
              <Legend slices={categorySlices} />
            </div>
          </div>

          <DataTableShell ariaLabel="Revenue contribution by inventory category">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Category</th>
                  <th style={th}>Total Revenue</th>
                  <th style={th}>Share</th>
                  <th style={th}>Rental Days</th>
                  <th style={th}>Fleet Units</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORY_DATA.map((c) => (
                  <tr key={c.category}>
                    <td style={td}><strong>{c.category}</strong></td>
                    <td style={td} className="figure">{formatMoney(c.revenue)}</td>
                    <td style={td} className="figure">{c.sharePct}%</td>
                    <td style={td} className="figure">{c.rentalDays} days</td>
                    <td style={td} className="figure">{c.itemCount} units</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>
        </div>
      )}

      {activeTab === 'projects' && (
        <div style={{ display: 'grid', gridTemplateColumns: viewport === 'phone' ? '1fr' : '320px 1fr', gap: 'var(--sp-md)', alignItems: 'start' }}>
          <div style={{ ...cardStyle, padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h4 style={{ margin: '0 0 var(--sp-md)', alignSelf: 'flex-start', fontSize: 'var(--t-h4)', color: 'var(--text)' }}>
              Project Types
            </h4>
            <Donut slices={projectSlices} size={180} />
            <div style={{ marginTop: 'var(--sp-md)', width: '100%' }}>
              <Legend slices={projectSlices} />
            </div>
          </div>

          <DataTableShell ariaLabel="Revenue classification by shoot / production type">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Project Type</th>
                  <th style={th}>Bookings</th>
                  <th style={th}>Total Revenue</th>
                  <th style={th}>Share</th>
                  <th style={th}>Avg Value</th>
                </tr>
              </thead>
              <tbody>
                {PROJECT_TYPE_DATA.map((p) => (
                  <tr key={p.projectType}>
                    <td style={td}><strong>{p.projectType}</strong></td>
                    <td style={td} className="figure">{p.bookingCount}</td>
                    <td style={td} className="figure">{formatMoney(p.totalRevenue)}</td>
                    <td style={td} className="figure">{p.sharePct}%</td>
                    <td style={td} className="figure">{formatMoney(p.avgBookingValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>
        </div>
      )}

      {activeTab === 'invoices' && (
        <DataTableShell ariaLabel="Detailed register of client invoices and settlement status">
          {invoicesLoading ? (
            <div style={{ padding: 'var(--sp-xl)', textAlign: 'center', color: 'var(--muted)' }}>
              Loading invoice records…
            </div>
          ) : invoices.length === 0 ? (
            <div style={{ padding: 'var(--sp-xl)', textAlign: 'center', color: 'var(--muted)' }}>
              No invoices found for the selected period.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Invoice No</th>
                  <th style={th}>Client</th>
                  <th style={th}>Issue Date</th>
                  <th style={th}>Status</th>
                  <th style={th}>Subtotal</th>
                  <th style={th}>VAT</th>
                  <th style={th}>Total Amount</th>
                  <th style={th}>Paid Amount</th>
                  <th style={th}>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td style={td}>
                      <Link to={`/finance?invoice=${inv.invoiceNo}`} style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }}>
                        {inv.invoiceNo}
                      </Link>
                    </td>
                    <td style={td}>{inv.clientName}</td>
                    <td style={td}>{inv.issueDateAd}</td>
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
                            inv.status === 'Paid'
                              ? 'var(--success-surface)'
                              : inv.status === 'Partially Paid'
                                ? 'var(--warn-surface)'
                                : 'var(--danger-surface)',
                          color:
                            inv.status === 'Paid'
                              ? 'var(--success)'
                              : inv.status === 'Partially Paid'
                                ? 'var(--warn)'
                                : 'var(--danger)',
                        }}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td style={td} className="figure">{formatMoney(inv.subtotal)}</td>
                    <td style={td} className="figure">{formatMoney(inv.vatAmount)}</td>
                    <td style={td} className="figure"><strong>{formatMoney(inv.totalAmount)}</strong></td>
                    <td style={{ ...td, color: 'var(--success)' }} className="figure">{formatMoney(inv.paidAmount)}</td>
                    <td
                      style={{
                        ...td,
                        color: (inv.outstandingAmount as number) > 0 ? 'var(--danger)' : 'var(--text2)',
                      }}
                      className="figure"
                    >
                      {formatMoney(inv.outstandingAmount)}
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
