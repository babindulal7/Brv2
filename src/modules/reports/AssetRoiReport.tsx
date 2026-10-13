import { useEffect, useState, useMemo } from 'react'
import { PageHeader, KpiStrip, Card } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { PageBody } from '../../components/ui/PageBody'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow } from '../../components/ui/ReportToolbar'
import { Badge } from '../../components/ui/Badge'
import { formatMoney } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import {
  getFleetAssetRoiSummary,
  type FleetRoiSummary,
} from '../../lib/queries/assetRoi'

/**
 * # Asset ROI & True Cost of Ownership Report (Pillar 4)
 *
 * Provides visibility into equipment profitability:
 * Net ROI = Invoiced Revenue - (Purchase Price + Maintenance Expense).
 *
 * Adheres strictly to Law 1 (exact integer Paisa math) and Law 6 (role restricted).
 */
export default function AssetRoiReport() {
  const canSeeMoney = useCanViewMoney()
  const viewport = useViewport()
  const [summary, setSummary] = useState<FleetRoiSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')

  useEffect(() => {
    let active = true
    setLoading(true)
    void getFleetAssetRoiSummary().then((res) => {
      if (active) {
        setSummary(res)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  const categories = useMemo(() => {
    if (!summary) return ['All']
    const set = new Set(summary.rows.map((r) => r.category))
    return ['All', ...Array.from(set).sort()]
  }, [summary])

  const filteredRows = useMemo(() => {
    if (!summary) return []
    return summary.rows.filter((r) => {
      if (categoryFilter !== 'All' && r.category !== categoryFilter) return false
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return (
        r.assetTag.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        (r.serialNo && r.serialNo.toLowerCase().includes(q))
      )
    })
  }, [summary, categoryFilter, query])

  // CSV export generator
  const exportCsv = (): ReportCsvRow[] => {
    if (!summary) return []
    const headers: ReportCsvRow = [
      'Asset Tag',
      'Serial No',
      'Product Name',
      'Category',
      'Purchase Price (NPR)',
      'Lifetime Revenue (NPR)',
      'Maintenance Cost (NPR)',
      'Net Profit (NPR)',
      'ROI %',
      'Maintenance Drag %',
      'Utilization %',
    ]

    const dataRows: ReportCsvRow[] = summary.rows.map((r) => [
      r.assetTag,
      r.serialNo ?? '—',
      r.productName,
      r.category,
      formatMoney(r.purchasePricePaisa),
      formatMoney(r.lifetimeRevenuePaisa),
      formatMoney(r.maintenanceCostPaisa),
      formatMoney(r.netProfitPaisa),
      `${r.roiPercent}%`,
      `${r.maintenanceDragPercent}%`,
      `${r.utilizationPercent}%`,
    ])

    return [
      ['Figure', 'Value'],
      ['Total Capital Invested', formatMoney(summary.totalCapitalInvestedPaisa)],
      ['Total Invoiced Revenue', formatMoney(summary.totalInvoicedRevenuePaisa)],
      ['Total Maintenance Expense', formatMoney(summary.totalMaintenanceExpensePaisa)],
      ['Net Fleet Return', formatMoney(summary.netFleetReturnPaisa)],
      ['Fleet ROI %', `${summary.fleetRoiPercent}%`],
      ['Average Maintenance Drag %', `${summary.averageMaintenanceDragPercent}%`],
      [],
      ['Asset Level Breakdown'],
      headers,
      ...dataRows,
    ]
  }

  // Law 6: Money Blindness Guard
  if (!canSeeMoney) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <PageHeader
          icon="chart"
          title="Asset ROI & Depreciation"
          description="True cost of ownership, lifetime equipment return, and maintenance drag analytics."
        />
        <PageBody
          restricted
          restrictedReason="Asset ROI is calculated entirely in financial currency — capital expenditure, revenue, maintenance costs, and profit margin — so this report is unavailable to your role."
          restrictedRequiredRole="Owner, Admin, or Accounts"
        >
          {null}
        </PageBody>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="chart"
        title="Asset ROI & True Cost of Ownership"
        description="Comprehensive capital allocation performance: Net Return = Revenue - (Purchase Price + Maintenance Expense)."
        search={{
          value: query,
          onChange: setQuery,
          placeholder: 'Search by asset tag, serial, or model... (press /)',
          ariaLabel: 'Search equipment ROI',
        }}
      />

      <ReportToolbar
        title="Asset ROI & True Cost of Ownership"
        csv={{
          filename: 'asset_roi_report',
          build: exportCsv,
        }}
      >
        <button
          type="button"
          onClick={() => {
            setLoading(true)
            void getFleetAssetRoiSummary().then((res) => {
              setSummary(res)
              setLoading(false)
            })
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            minHeight: 44,
            padding: '0 14px',
            borderRadius: 'var(--r-btn)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 'var(--t-meta)',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Refresh
        </button>
      </ReportToolbar>

      {summary && (
        <KpiStrip
          columns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : 5}
          items={[
            {
              label: 'Total Capital Invested',
              value: formatMoney(summary.totalCapitalInvestedPaisa),
              icon: 'box',
              accent: 'neutral',
              definition: 'Total historical purchase price across all active fleet units.',
            },
            {
              label: 'Lifetime Rental Revenue',
              value: formatMoney(summary.totalInvoicedRevenuePaisa),
              icon: 'chart',
              accent: 'primary',
              definition: 'Cumulative rental booking charges generated by fleet assets.',
            },
            {
              label: 'Fleet Net Margin',
              value: formatMoney(summary.netFleetReturnPaisa),
              icon: 'card',
              accent: (summary.netFleetReturnPaisa as number) >= 0 ? 'success' : 'danger',
              definition: 'Net Profit = Lifetime Revenue - (Capital Invested + Maintenance Expense).',
            },
            {
              label: 'Fleet Overall ROI',
              value: `${summary.fleetRoiPercent > 0 ? '+' : ''}${summary.fleetRoiPercent}%`,
              icon: 'activity',
              accent: summary.fleetRoiPercent >= 0 ? 'success' : 'danger',
              definition: 'Return on Capital = (Net Profit / Capital Invested) * 100.',
            },
            {
              label: 'Avg Maintenance Drag',
              value: `${summary.averageMaintenanceDragPercent}%`,
              icon: 'tool',
              accent: summary.averageMaintenanceDragPercent > 10 ? 'danger' : 'neutral',
              definition: 'Maintenance Drag = (Cumulative Maintenance Cost / Lifetime Revenue) * 100.',
            },
          ]}
        />
      )}

      {/* Category filter toolbar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>
            Category:
          </span>
          <select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{
              minHeight: 44,
              padding: '0 12px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
            }}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* High-density Asset ROI table */}
      <Card bodyStyle={{ padding: 0 }}>
        <DataTableShell ariaLabel="Asset ROI and True Cost of Ownership table">
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--card2)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 12px', fontSize: 'var(--t-caption)', fontWeight: 600 }}>
                  Asset Tag / Serial
                </th>
                <th style={{ padding: '10px 12px', fontSize: 'var(--t-caption)', fontWeight: 600 }}>
                  Equipment Model
                </th>
                <th style={{ padding: '10px 12px', fontSize: 'var(--t-caption)', fontWeight: 600 }}>
                  Purchase Cost
                </th>
                <th style={{ padding: '10px 12px', fontSize: 'var(--t-caption)', fontWeight: 600 }}>
                  Revenue
                </th>
                <th style={{ padding: '10px 12px', fontSize: 'var(--t-caption)', fontWeight: 600 }}>
                  Maintenance
                </th>
                <th style={{ padding: '10px 12px', fontSize: 'var(--t-caption)', fontWeight: 600 }}>
                  Net Margin
                </th>
                <th style={{ padding: '10px 12px', fontSize: 'var(--t-caption)', fontWeight: 600 }}>
                  ROI %
                </th>
                <th style={{ padding: '10px 12px', fontSize: 'var(--t-caption)', fontWeight: 600 }}>
                  Maint Drag
                </th>
                <th style={{ padding: '10px 12px', fontSize: 'var(--t-caption)', fontWeight: 600 }}>
                  Utilization
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--text2)' }}>
                    Loading fleet ROI metrics…
                  </td>
                </tr>
              )}
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--text2)' }}>
                    No equipment matching filters
                  </td>
                </tr>
              )}
              {!loading && filteredRows.map((r) => {
                const isPositive = (r.netProfitPaisa as number) >= 0
                return (
                  <tr
                    key={r.unitId}
                    style={{ borderBottom: '1px solid var(--border)', fontSize: 'var(--t-caption)' }}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{r.assetTag}</div>
                      {r.serialNo && (
                        <div style={{ fontSize: 'var(--t-micro)', color: 'var(--text2)' }}>
                          {r.serialNo}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text)' }}>{r.productName}</div>
                      <div style={{ fontSize: 'var(--t-micro)', color: 'var(--text2)' }}>
                        {r.category} · {r.daysOwned}d in service
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-id, sans-serif)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatMoney(r.purchasePricePaisa)}
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-id, sans-serif)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatMoney(r.lifetimeRevenuePaisa)}
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-id, sans-serif)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatMoney(r.maintenanceCostPaisa)}
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        fontFamily: 'var(--font-id, sans-serif)',
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 600,
                        color: isPositive ? 'var(--st-in-fg)' : 'var(--st-danger-fg)',
                      }}
                    >
                      {formatMoney(r.netProfitPaisa)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <Badge
                        tone={isPositive ? 'in' : 'danger'}
                        label={`${r.roiPercent > 0 ? '+' : ''}${r.roiPercent}%`}
                        size="sm"
                      />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          fontWeight: 500,
                          color: r.maintenanceDragPercent > 10 ? 'var(--st-danger-fg)' : 'var(--text2)',
                        }}
                      >
                        {r.maintenanceDragPercent}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div
                          style={{
                            width: 48,
                            height: 6,
                            background: 'var(--card2)',
                            borderRadius: 3,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, r.utilizationPercent)}%`,
                              height: '100%',
                              background: 'var(--primary)',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 'var(--t-micro)', color: 'var(--text2)' }}>
                          {r.utilizationPercent}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </DataTableShell>
      </Card>
    </div>
  )
}
