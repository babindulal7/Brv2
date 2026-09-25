import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow } from '../../components/ui/ReportToolbar'
import {
  INVENTORY_METRICS,
  ASSET_HEALTH,
  TOP_CATEGORIES,
  getInventoryReportSummary,
  type InventoryReportSummary,
} from '../../lib/queries/inventoryReports'
import { formatMoney, rupees } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'

/**
 * The export body.
 *
 * ⚠ Takes `money` and drops the whole Top Categories by Value section without
 * it — the same cut the page makes. This report is NOT restricted as a whole,
 * because asset counts, utilization and audit accuracy are operational facts a
 * warehouse role needs; only the valuation is money. An export that carried the
 * valuation regardless would hand a money-blind role, in a file, the one table
 * the screen withholds.
 */
function inventoryCsv(money: boolean): ReportCsvRow[] {
  return [
    ['Figure', 'Value'],
    ['Total assets', INVENTORY_METRICS.totalAssets],
    ['Utilization', `${INVENTORY_METRICS.utilization}%`],
    ['Available', INVENTORY_METRICS.available],
    ['Inventory accuracy', `${INVENTORY_METRICS.inventoryAccuracy}%`],
    [],
    ['Asset health distribution'],
    ['Status', 'Count', 'Percentage'],
    ...ASSET_HEALTH.map((h): ReportCsvRow => [h.status, h.count, `${h.percentage}%`]),
    ...(money
      ? ([
          [],
          ['Top categories by value'],
          ['Category', 'Asset count', 'Total value'],
          // `TOP_CATEGORIES[].value` is seeded in RUPEES (Rs 4,50,00,000 of
          // cameras, not Rs 4,50,000). The old unchecked `as Paisa` cast made
          // formatMoney divide by 100 and print every category 100× too small;
          // `rupees()` is the sanctioned literal-amount conversion.
          ...TOP_CATEGORIES.map((c): ReportCsvRow => [c.name, c.count, formatMoney(rupees(c.value))]),
        ] as ReportCsvRow[])
      : []),
  ]
}

export default function InventoryReports() {
  const money = useCanViewMoney()
  const [, setSummary] = useState<InventoryReportSummary | null>(null)

  useEffect(() => {
    let active = true
    void getInventoryReportSummary().then((res) => {
      if (active) setSummary(res)
    })
    return () => {
      active = false
    }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="box"
        title="Inventory Reports"
        description="Monitor stock levels, asset health, and overall inventory accuracy."
      />

      {/*
        Export only. `data/inventoryReports` is a 20-line snapshot — a count per
        health status and a value per category — with no date and no warehouse
        column, so there is nothing here for a range or a branch to narrow.
      */}
      <ReportToolbar title="Inventory Reports" csv={{ filename: 'inventory-reports', build: () => inventoryCsv(money) }} />

      {/* §4.41(a): until 6fb1c62 this route rendered ProductReports; the
          restructure swapped screens without rehoming the old one. Now that it
          lives at /reports/products, this line is the way back — the register
          cannot carry it (43-count pinned by rulings §11.3). */}
      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        Product sales, turnover, dead stock and supplier performance moved to{' '}
        <Link to="/reports/products" style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }}>
          Product Reports
        </Link>
      </div>

      {/* The shared strip — typed items, icon tile drawn, viewport clamp built
          in. The old hand-rolled `InventoryKpiCard` was `any`-typed and
          silently dropped its `icon` prop ("check_circle" was not even a
          registry name — never caught, because nothing rendered it). */}
      <KpiStrip
        columns={4}
        items={[
          {
            label: 'Total Assets',
            value: String(INVENTORY_METRICS.totalAssets),
            icon: 'box',
            accent: 'primary',
            note: 'Active fleet items',
          },
          {
            label: 'Utilization',
            value: `${INVENTORY_METRICS.utilization}%`,
            icon: 'activity',
            accent: 'progress',
            note: 'Current deployment rate',
          },
          {
            label: 'Available',
            value: String(INVENTORY_METRICS.available),
            icon: 'check',
            accent: 'success',
            note: 'Ready for rental',
          },
          {
            label: 'Inventory Accuracy',
            value: `${INVENTORY_METRICS.inventoryAccuracy}%`,
            icon: 'checklist',
            accent: 'success',
            note: 'Based on last audit',
          },
        ]}
      />

      {/* Rulings §7 — these tables are the report's CONTENT, not a rail. They
          used to be passed into `ReflowRail`, which at desktop is a 288px
          sticky collapsible box, so the whole report rendered inside one
          self-scrolling rail. There is no aside content on this page, so there
          is no rail at all. */}
      <section aria-label="Asset Health" style={cardStyle}>
        <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Asset Health Distribution</div>
        <DataTableShell ariaLabel="Asset Health Distribution">
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
            <thead>
              <tr style={{ color: 'var(--text2)' }}>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Status</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Count</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Percentage</th>
              </tr>
            </thead>
            <tbody>
              {ASSET_HEALTH.map((h) => (
                <tr key={h.status} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)', fontWeight: 600 }}>{h.status}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{h.count}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{h.percentage}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>
      </section>

      {money && (
        <section aria-label="Top Categories by Value" style={cardStyle}>
          <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Top Categories by Value</div>
          <DataTableShell ariaLabel="Top Categories by Value">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
              <thead>
                <tr style={{ color: 'var(--text2)' }}>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Category</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Asset Count</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Total Value</th>
                </tr>
              </thead>
              <tbody>
                {TOP_CATEGORIES.map((c) => (
                  <tr key={c.name} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)', fontWeight: 600 }}>{c.name}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{c.count}</td>
                    {/* Seed values are rupees — `rupees()`, never a bare
                        `as Paisa` cast, which printed these 100× too small. */}
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{formatMoney(rupees(c.value))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>
        </section>
      )}
    </div>
  )
}
