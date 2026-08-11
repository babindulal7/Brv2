import { PageHeader, Card, Rail, cardStyle } from '../../components/ui/Page'
import { INVENTORY_METRICS, ASSET_HEALTH, TOP_CATEGORIES } from '../../data/inventoryReports'
import { formatMoney } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'

function InventoryKpiCard({ label, value, accent, note }: any) {
  return (
    <Card style={{ padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)', background: `var(--${accent}-bg, var(--card))` }}>
      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: `var(--${accent})` }}>{value}</div>
      <div style={{ fontSize: 'var(--t-meta)', color: `var(--${note.tone})` }}>{note.text}</div>
    </Card>
  )
}

export default function InventoryReports() {
  const money = useCanViewMoney()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="box"
        title="Inventory Reports"
        description="Monitor stock levels, asset health, and overall inventory accuracy."
      />

      <section aria-label="Key figures" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
        <InventoryKpiCard
          label="Total Assets"
          value={INVENTORY_METRICS.totalAssets}
          icon="box"
          accent="primary"
          note={{ text: 'Active fleet items', tone: 'neutral' }}
        />
        <InventoryKpiCard
          label="Utilization"
          value={`${INVENTORY_METRICS.utilization}%`}
          icon="activity"
          accent="progress"
          note={{ text: 'Current deployment rate', tone: 'neutral' }}
        />
        <InventoryKpiCard
          label="Available"
          value={INVENTORY_METRICS.available}
          icon="check"
          accent="success"
          note={{ text: 'Ready for rental', tone: 'success' }}
        />
        <InventoryKpiCard
          label="Inventory Accuracy"
          value={`${INVENTORY_METRICS.inventoryAccuracy}%`}
          icon="check_circle"
          accent="success"
          note={{ text: 'Based on last audit', tone: 'neutral' }}
        />
      </section>

      <Rail>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <section aria-label="Asset Health" style={cardStyle}>
            <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Asset Health Distribution</div>
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
          </section>

          {money && (
            <section aria-label="Top Categories by Value" style={cardStyle}>
              <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Top Categories by Value</div>
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
                      <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{formatMoney(c.value as Paisa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </Rail>
    </div>
  )
}
