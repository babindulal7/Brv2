import { PageHeader, Card, ReflowRail, SideRail, cardStyle, useBandColumns } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow } from '../../components/ui/ReportToolbar'
import { Donut, Legend } from '../../components/ui/Charts'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { formatMoney } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { METRICS, RETURN_ON_PROMOTION, IMPACT, COUPON_DONUT, CLIENT_USAGE, TOP_COUPONS, BUNDLE_ANALYSIS, DISCOUNT_TYPES } from '../../data/promotionsReports'

function PromoKpiCard({ label, value, accent, note }: any) {
  // Mock KpiCard implementation to match ExpenseReports
  return (
    <Card style={{ padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)', background: `var(--${accent}-bg, var(--card))` }}>
      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: `var(--${accent})` }}>{value}</div>
      <div style={{ fontSize: 'var(--t-meta)', color: `var(--${note.tone})` }}>{note.text}</div>
    </Card>
  )
}

/** The export body — the headline block, both tables and the two rail lists. */
function promotionsCsv(totalIssued: number): ReportCsvRow[] {
  return [
    ['Figure', 'Value'],
    ['Promotion revenue', formatMoney(METRICS.promotionRevenue as Paisa)],
    ['Discounts given', formatMoney(METRICS.discountsGiven as Paisa)],
    ['Return on promotion', `${RETURN_ON_PROMOTION}x`],
    ['Revenue gained', formatMoney(IMPACT.gained as Paisa)],
    ['Net impact', formatMoney(IMPACT.net as Paisa)],
    ['Redemption rate', `${METRICS.redemptionRate}%`],
    ['Coupons issued', totalIssued],
    [],
    ['Most used coupons'],
    ['ID', 'Code', 'Issued', 'Redeemed', 'Expiry', 'ROP'],
    ...TOP_COUPONS.map((c): ReportCsvRow => [c.id, c.code, c.issued, c.redeemed, c.expiry, `${c.rop}x`]),
    [],
    ['Bundle discount analysis'],
    ['Bundle', 'Bookings generated', 'Bundle revenue', 'Discount', 'ROP'],
    ...BUNDLE_ANALYSIS.map((b): ReportCsvRow => [
      b.name,
      b.bookings,
      formatMoney(b.revenue as Paisa),
      `-${formatMoney(b.discount as Paisa)}`,
      `${b.rop}x`,
    ]),
    [],
    ['Usage by client type'],
    ...CLIENT_USAGE.map((u): ReportCsvRow => [u.type, u.count]),
    [],
    ['Discount types'],
    ...DISCOUNT_TYPES.map((t): ReportCsvRow => [t.label, formatMoney(t.value as Paisa)]),
  ]
}

export default function PromotionsReports() {
  /* KpiStrip's clamp, applied to this screen's hand-rolled key-figure grid:
     four or six cards side by side is unreadable below 1180. */
  const bandCols = useBandColumns()
  const money = useCanViewMoney()

  // Law 6 — promotion revenue, discounts given and net impact are all rupees.
  if (!money) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <PageHeader icon="box" title="Promotions & Discounts" description="Analyze campaign performance and discount ROI." />
        <PageBody
          restricted
          restrictedReason="Promotions are reported as revenue against discount given, so every headline figure on this page is money."
          restrictedRequiredRole="Owner, Admin, Coordinator or Accounts"
        >
          {null}
        </PageBody>
      </div>
    )
  }

  const totalIssued = 1520 // from spec

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="box"
        title="Promotions & Discounts"
        description="Analyze campaign performance and discount ROI."
      />

      {/*
        Export only. `TOP_COUPONS` carries an `expiry` string and nothing else
        dated; the campaign figures above it are single totals with no period
        dimension, so a date range would filter one column of one table.
      */}
      <ReportToolbar title="Promotions & Discounts" csv={{ filename: 'promotions', build: () => promotionsCsv(totalIssued) }} />

      <section aria-label="Key figures" style={{ display: 'grid', gridTemplateColumns: `repeat(${bandCols(4)}, minmax(0,1fr))`, gap: 'var(--sp-md)' }}>
        <PromoKpiCard
          label="Promotion Revenue"
          value={formatMoney(METRICS.promotionRevenue as Paisa)}
          icon="tag"
          accent="primary"
          note={{ text: `Generated from ${totalIssued} issued coupons`, tone: 'neutral' }}
        />
        <PromoKpiCard
          label="Discounts Given"
          value={formatMoney(METRICS.discountsGiven as Paisa)}
          icon="dollar"
          accent="warning"
          note={{ text: `${RETURN_ON_PROMOTION}x Return on Promotion (ROP)`, tone: 'success' }}
        />
        <PromoKpiCard
          label="Net Impact"
          value={formatMoney(IMPACT.net as Paisa)}
          icon="chart"
          accent="success"
          note={{ text: `From ${formatMoney(IMPACT.gained as Paisa)} gained`, tone: 'success' }}
        />
        <PromoKpiCard
          label="Redemption Rate"
          value={`${METRICS.redemptionRate}%`}
          icon="refresh"
          accent="progress"
          note={{ text: 'Of total issued', tone: 'neutral' }}
        />
      </section>

      <ReflowRail>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          <section aria-label="Discount Impact" style={cardStyle}>
            <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Discount Impact Must Net Out</div>
            <div style={{ display: 'flex', flexDirection: 'row', gap: 'var(--sp-xl)', padding: 'var(--sp-md)' }}>
              <div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Discounts Given</div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--danger)' }}>{formatMoney(IMPACT.given as Paisa)}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Revenue Gained</div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--success)' }}>{formatMoney(IMPACT.gained as Paisa)}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Net Impact</div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--primary)' }}>{formatMoney(IMPACT.net as Paisa)}</div>
              </div>
            </div>
          </section>

          <section aria-label="Most Used Coupons" style={cardStyle}>
            <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Most Used Coupons</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
              <thead>
                <tr style={{ color: 'var(--text2)' }}>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>ID</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Code</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Issued</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Redeemed</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Expiry</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>ROP</th>
                </tr>
              </thead>
              <tbody>
                {TOP_COUPONS.map((c) => (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)', fontWeight: 600 }}>{c.id}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{c.code}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{c.issued}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{c.redeemed}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{c.expiry}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)', color: 'var(--success)' }}>{c.rop}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section aria-label="Bundle Discount Analysis" style={cardStyle}>
            <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Bundle Discount Analysis</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
              <thead>
                <tr style={{ color: 'var(--text2)' }}>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Bundle</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Bookings Generated</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Bundle Revenue</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>Discount</th>
                  <th style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>ROP</th>
                </tr>
              </thead>
              <tbody>
                {BUNDLE_ANALYSIS.map((b) => (
                  <tr key={b.name} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)', fontWeight: 600 }}>{b.name}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{b.bookings}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)' }}>{formatMoney(b.revenue as Paisa)}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)', color: 'var(--danger)' }}>-{formatMoney(b.discount as Paisa)}</td>
                    <td style={{ padding: 'var(--sp-sm) var(--sp-md)', color: 'var(--success)' }}>{b.rop}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

        </div>

        <SideRail>
          <section aria-label="Coupon Donut" style={cardStyle}>
            <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Coupon Status</div>
            <div style={{ padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', alignItems: 'center' }}>
              <Donut slices={COUPON_DONUT} centreLabel={String(totalIssued)} centreValue="Issued" />
              <div style={{ width: '100%' }}>
                <Legend slices={COUPON_DONUT} />
              </div>
            </div>
          </section>

          <section aria-label="Campaign Usage by Client Type" style={cardStyle}>
            <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Usage by Client Type</div>
            <div style={{ padding: 'var(--sp-md)' }}>
              {CLIENT_USAGE.map(u => (
                <div key={u.type} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-xs)', fontSize: 'var(--t-meta)' }}>
                  <span style={{ color: 'var(--text2)' }}>{u.type}</span>
                  <span style={{ fontWeight: 600 }}>{u.count}</span>
                </div>
              ))}
            </div>
          </section>

          <section aria-label="Discount Types" style={cardStyle}>
            <div style={{ fontSize: 'var(--t-body)', fontWeight: 600, padding: 'var(--sp-md)', borderBottom: '1px solid var(--border)' }}>Discount Types</div>
            <div style={{ padding: 'var(--sp-md)' }}>
              {DISCOUNT_TYPES.map(t => (
                <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-xs)', fontSize: 'var(--t-meta)' }}>
                  <span style={{ color: 'var(--text2)' }}>{t.label}</span>
                  <span style={{ fontWeight: 600 }}>{formatMoney(t.value as Paisa)}</span>
                </div>
              ))}
            </div>
          </section>
        </SideRail>
      </ReflowRail>
    </div>
  )
}
