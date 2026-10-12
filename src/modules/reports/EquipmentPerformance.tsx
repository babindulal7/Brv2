import { useEffect, useState } from 'react'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { PageBody } from '../../components/ui/PageBody'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow } from '../../components/ui/ReportToolbar'
import {
  EQUIPMENT_METRICS,
  TOP_PERFORMERS,
  WORST_PERFORMERS,
  getEquipmentPerformanceSummary,
  type EquipmentPerformanceSummary,
} from '../../lib/queries/equipmentPerformance'
import { formatMoney } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'

/**
 * The export body — the same four headline figures and the same two tables the
 * page draws, in the order it draws them.
 *
 * Only ever reached from a session that passed the money gate: the toolbar is
 * not rendered at all on the restricted branch above, so there is no path from
 * a money-blind role to this function.
 */
function equipmentCsv(): ReportCsvRow[] {
  const performer = (p: (typeof TOP_PERFORMERS)[number]): ReportCsvRow => [
    p.id,
    p.name,
    p.category,
    formatMoney(p.revenue as Paisa),
    `${p.utilization}%`,
  ]
  const columns: ReportCsvRow = ['ID', 'Name', 'Category', 'Revenue', 'Utilization']

  return [
    ['Figure', 'Value'],
    ['Equipment revenue', formatMoney(EQUIPMENT_METRICS.revenue as Paisa)],
    // ROI and payback are NOT exported: nothing records what a unit cost, so
    // they had no source. A fabricated figure that leaves the app in a file is
    // the worst version of the defect.
    ['Idle cost', formatMoney(EQUIPMENT_METRICS.idleCost as Paisa)],
    [],
    ['Top performing equipment'],
    columns,
    ...TOP_PERFORMERS.map(performer),
    [],
    ['Equipment needing attention'],
    columns,
    ...WORST_PERFORMERS.map(performer),
  ]
}

export default function EquipmentPerformance() {
  const money = useCanViewMoney()
  const viewport = useViewport()
  const [, setSummary] = useState<EquipmentPerformanceSummary | null>(null)

  useEffect(() => {
    let active = true
    void getEquipmentPerformanceSummary().then((res) => {
      if (active) setSummary(res)
    })
    return () => {
      active = false
    }
  }, [])

  /*
   * Law 6. Every figure on this page is money or a ratio derived from it, so
   * there is no money-free version to show. The page used to say so in a plain
   * `<Card>`; it now renders the shared RESTRICTED state, which names the roles
   * to ask instead of leaving the reader to guess — and no toolbar is drawn
   * above it, because an Export button over data the role may not read would be
   * a route around the gate.
   */
  if (!money) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <PageHeader icon="activity" title="Equipment Performance" description="Revenue, utilization and idle cost across the fleet. ROI and payback need a purchase-cost column no table provides." />
        <PageBody
          restricted
          restrictedReason="Equipment performance is reported entirely in money — revenue, ROI, payback and idle cost — so there is no version of this page your role can see."
          restrictedRequiredRole="Owner, Admin, Coordinator or Accounts"
        >
          {null}
        </PageBody>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="activity"
        title="Equipment Performance"
        description="Revenue, utilization and idle cost across the fleet. ROI and payback need a purchase-cost column no table provides."
      />

      {/*
        No date range and no branch: `data/equipmentPerformance` is three
        pre-aggregated constants with neither a date nor a branch column on any
        row, so either control would move the label and not one figure. They
        arrive by passing two more props the day this report reads Postgres.
      */}
      <ReportToolbar title="Equipment Performance" csv={{ filename: 'equipment-performance', build: equipmentCsv }} />

      {/* The shared strip — typed items, icon tile drawn, viewport clamp built
          in. The old hand-rolled `PerfKpiCard` was `any`-typed and silently
          dropped its `icon` prop ("clock" was not even a registry name — never
          caught, because nothing rendered it).

          Rulings §8 — "a report with no data source shows 'not tracked yet',
          never zeros… Never seed a plausible default." Return on investment
          and payback both need what each unit cost; no migration provides a
          purchase-cost column, so both state the gap instead of printing
          1.45x and 8.2 months. */}
      <KpiStrip
        columns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : 4}
        items={[
          {
            label: 'Equipment Revenue',
            value: formatMoney(EQUIPMENT_METRICS.revenue as Paisa),
            icon: 'dollar',
            accent: 'primary',
            note: 'Generated by fleet',
          },
          {
            label: 'Average ROI',
            value: 'Not tracked yet',
            icon: 'chart',
            accent: 'neutral',
            note: 'Needs a purchase-cost column, which no table provides',
          },
          {
            label: 'Avg Payback Period',
            value: 'Not tracked yet',
            icon: 'timer',
            accent: 'neutral',
            note: 'Cannot be derived without unit cost',
          },
          {
            label: 'Idle Cost',
            value: formatMoney(EQUIPMENT_METRICS.idleCost as Paisa),
            icon: 'alert_triangle',
            accent: 'progress',
            note: 'Opportunity cost of unrented gear',
          },
        ]}
      />

      {/* Rulings §7 — these tables are the report's CONTENT, not a rail. They
          used to be passed into `ReflowRail`, which at desktop is a 288px
          sticky collapsible box, so the whole report rendered inside one
          self-scrolling rail. There is no aside content on this page, so there
          is no rail at all. */}
      <section aria-label="Top Performing Equipment" style={cardStyle}>
        <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Top Performing Equipment</div>
        <DataTableShell ariaLabel="Top Performing Equipment">
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)', minWidth: 520 }}>
            <thead>
              <tr style={{ color: 'var(--text2)' }}>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>ID</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Name</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Category</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Revenue</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Utilization</th>
              </tr>
            </thead>
            <tbody>
              {TOP_PERFORMERS.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)', fontWeight: 600 }}>{p.id}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{p.name}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{p.category}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{formatMoney(p.revenue as Paisa)}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{p.utilization}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>
      </section>

      <section aria-label="Worst Performing Equipment" style={cardStyle}>
        <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Equipment Needing Attention</div>
        <DataTableShell ariaLabel="Equipment Needing Attention">
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)', minWidth: 520 }}>
            <thead>
              <tr style={{ color: 'var(--text2)' }}>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>ID</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Name</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Category</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Revenue</th>
                <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Utilization</th>
              </tr>
            </thead>
            <tbody>
              {WORST_PERFORMERS.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)', fontWeight: 600 }}>{p.id}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{p.name}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{p.category}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{formatMoney(p.revenue as Paisa)}</td>
                  <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{p.utilization}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>
      </section>
    </div>
  )
}
