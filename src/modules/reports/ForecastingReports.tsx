import { PageHeader, Card, Rail, cardStyle } from '../../components/ui/Page'
import { FORECAST_METRICS, PURCHASE_FORECAST, MAINTENANCE_FORECAST, SEASONAL_DEMAND } from '../../data/forecastingReports'
import { formatMoney } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'

function ForecastKpiCard({ label, value, accent, note }: any) {
  return (
    <Card style={{ padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)', background: `var(--${accent}-bg, var(--card))` }}>
      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: `var(--${accent})` }}>{value}</div>
      <div style={{ fontSize: 'var(--t-meta)', color: `var(--${note.tone})` }}>{note.text}</div>
    </Card>
  )
}

export default function ForecastingReports() {
  const money = useCanViewMoney()

  if (!money) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <PageHeader icon="activity" title="Forecasting & AI" description="Predictive models for revenue, purchases, and maintenance." />
        <Card style={{ padding: 'var(--sp-xl)', textAlign: 'center', color: 'var(--text2)' }}>
          Forecasting data is restricted for your role.
        </Card>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="activity"
        title="Forecasting & AI"
        description="Predictive models for revenue, purchases, and maintenance."
      />

      <section aria-label="Key figures" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
        <ForecastKpiCard
          label="Forecast Revenue"
          value={formatMoney(FORECAST_METRICS.forecastRevenue as Paisa)}
          icon="dollar"
          accent="primary"
          note={{ text: 'Projected for next 30 days', tone: 'neutral' }}
        />
        <ForecastKpiCard
          label="Expected Bookings"
          value={FORECAST_METRICS.expectedBookings}
          icon="calendar"
          accent="success"
          note={{ text: 'Upcoming reservations', tone: 'success' }}
        />
        <ForecastKpiCard
          label="Predicted Shortages"
          value={FORECAST_METRICS.predictedShortages}
          icon="alert_triangle"
          accent="danger"
          note={{ text: 'High risk stockouts', tone: 'danger' }}
        />
        <ForecastKpiCard
          label="Forecast Accuracy"
          value={`${FORECAST_METRICS.forecastAccuracy}%`}
          icon="check"
          accent="progress"
          note={{ text: 'Based on historical variance', tone: 'neutral' }}
        />
      </section>

      <Rail>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <section aria-label="Inventory Purchase Forecast" style={cardStyle}>
            <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Inventory Purchase Forecast</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
              <thead>
                <tr style={{ color: 'var(--text2)' }}>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Category</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Recommended Item</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Reason / Formula</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {PURCHASE_FORECAST.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)', fontWeight: 600 }}>{p.category}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{p.item}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{p.reason}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)', color: p.confidence === 'High' ? 'var(--success)' : 'var(--warning)' }}>{p.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section aria-label="Maintenance Forecast" style={cardStyle}>
            <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Maintenance Forecast</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
              <thead>
                <tr style={{ color: 'var(--text2)' }}>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Asset ID</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Item</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Predicted Service Date</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Trigger</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Priority</th>
                </tr>
              </thead>
              <tbody>
                {MAINTENANCE_FORECAST.map((m) => (
                  <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)', fontWeight: 600 }}>{m.id}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{m.item}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{m.nextService}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{m.trigger}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)', color: m.priority === 'High' ? 'var(--danger)' : 'var(--warning)' }}>{m.priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section aria-label="Seasonal Demand" style={cardStyle}>
            <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Seasonal Demand Outlook</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
              <thead>
                <tr style={{ color: 'var(--text2)' }}>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Event / Period</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Dates</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Expected Lift</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Top Categories</th>
                </tr>
              </thead>
              <tbody>
                {SEASONAL_DEMAND.map((s) => (
                  <tr key={s.event} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)', fontWeight: 600 }}>{s.event}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{s.dates}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)', color: s.expectedLift.startsWith('+') ? 'var(--success)' : 'var(--danger)' }}>{s.expectedLift}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{s.topCategories}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </Rail>
    </div>
  )
}
