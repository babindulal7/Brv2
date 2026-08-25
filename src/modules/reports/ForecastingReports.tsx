import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow } from '../../components/ui/ReportToolbar'
import { FORECAST_METRICS, PURCHASE_FORECAST, MAINTENANCE_FORECAST, SEASONAL_DEMAND } from '../../data/forecastingReports'
import { formatMoney } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'

/** The export body — the headline block and all three forecast tables. */
function forecastCsv(): ReportCsvRow[] {
  return [
    ['Figure', 'Value'],
    ['Forecast revenue', formatMoney(FORECAST_METRICS.forecastRevenue as Paisa)],
    ['Expected bookings', FORECAST_METRICS.expectedBookings],
    ['Predicted shortages', FORECAST_METRICS.predictedShortages],
    ['Forecast accuracy', `${FORECAST_METRICS.forecastAccuracy}%`],
    [],
    ['Inventory purchase forecast'],
    ['Category', 'Recommended item', 'Reason / formula', 'Confidence'],
    ...PURCHASE_FORECAST.map((p): ReportCsvRow => [p.category, p.item, p.reason, p.confidence]),
    [],
    ['Maintenance forecast'],
    ['Asset ID', 'Item', 'Predicted service date', 'Trigger', 'Priority'],
    ...MAINTENANCE_FORECAST.map((m): ReportCsvRow => [m.id, m.item, m.nextService, m.trigger, m.priority]),
    [],
    ['Seasonal demand outlook'],
    ['Event / period', 'Dates', 'Expected lift', 'Top categories'],
    ...SEASONAL_DEMAND.map((s): ReportCsvRow => [s.event, s.dates, s.expectedLift, s.topCategories]),
  ]
}

export default function ForecastingReports() {
  const money = useCanViewMoney()

  /*
   * The whole page is gated on money because its lead figure is Forecast
   * Revenue. That is broader than Law 6 strictly requires — expected bookings,
   * predicted shortages and the maintenance table carry no rupees — but
   * narrowing the gate is a product decision about what a warehouse role should
   * be able to forecast, not a refactor.
   * TODO(decision): whether Forecasting has a money-free half worth showing.
   */
  if (!money) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <PageHeader icon="activity" title="Forecasting & AI" description="Predictive models for revenue, purchases, and maintenance." />
        <PageBody
          restricted
          restrictedReason="Forecasting leads on projected revenue, so the whole report is gated with the money it reports."
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
        title="Forecasting & AI"
        description="Predictive models for revenue, purchases, and maintenance."
      />

      {/*
        Export only. A forecast looks forward from a fixed model run; there is
        no `from`/`to` on any row in `data/forecastingReports` for a date range
        to constrain.
      */}
      <ReportToolbar title="Forecasting & AI" csv={{ filename: 'forecasting', build: forecastCsv }} />

      {/* The shared strip — typed items, icon tile drawn, viewport clamp built
          in. The old hand-rolled `ForecastKpiCard` was `any`-typed and
          silently dropped its `icon` prop. */}
      <KpiStrip
        columns={4}
        items={[
          {
            label: 'Forecast Revenue',
            value: formatMoney(FORECAST_METRICS.forecastRevenue as Paisa),
            icon: 'dollar',
            accent: 'primary',
            note: 'Projected for next 30 days',
          },
          {
            label: 'Expected Bookings',
            value: String(FORECAST_METRICS.expectedBookings),
            icon: 'calendar',
            accent: 'success',
            note: 'Upcoming reservations',
          },
          {
            label: 'Predicted Shortages',
            value: String(FORECAST_METRICS.predictedShortages),
            icon: 'alert_triangle',
            accent: 'danger',
            note: 'High risk stockouts',
          },
          {
            label: 'Forecast Accuracy',
            value: `${FORECAST_METRICS.forecastAccuracy}%`,
            icon: 'check',
            accent: 'progress',
            note: 'Based on historical variance',
          },
        ]}
      />

      {/* Rulings §7 — these tables are the report's CONTENT, not a rail. They
          used to be passed into `ReflowRail`, which at desktop is a 288px
          sticky collapsible box, so the whole report rendered inside one
          self-scrolling rail. There is no aside content on this page, so there
          is no rail at all. */}
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
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)', color: p.confidence === 'High' ? 'var(--success)' : 'var(--ready)' }}>{p.confidence}</td>
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
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)', color: m.priority === 'High' ? 'var(--danger)' : 'var(--ready)' }}>{m.priority}</td>
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
  )
}
