import Icon from '../../components/ui/Icon'
import { Card, PageHeader, KpiStrip, Rail, SummaryRows, FooterNote, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { formatMoney } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { toBs, formatBs, formatAd } from '../../lib/bs'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import {
  PERIOD_START,
  PERIOD_END,
  CASH_LINES,
  OPENING_CASH,
  INVOICED,
  PAPER_PROFIT,
  DEPOSITS_HELD,
  cashIn,
  netOperatingCash,
  netCash,
  closingCash,
  collectionRate,
  uncollected,
  runwayMonths,
  profitToCashGap,
  collectionUpside,
  OVERDUE,
} from '../../data/liquidityReports'

/**
 * **Finance ▸ Reports ▸ Cash Flow** — built from the `Babin Cash Flow Report`
 * design, with its structure taken from the report-excellence skill: the answer
 * first, then findings, then business impact, and only then the figures.
 *
 * The reason that order matters here is specific, not stylistic. This report
 * exists to say one uncomfortable thing — a NPR 229K paper profit became NPR 83K
 * of cash — and a reader who meets the statement table before the sentence has
 * to do that subtraction themselves.
 *
 * **Two rules enforced in `data/liquidityReports`, not here:**
 *  · **Deposits never enter a cash total.** They are client funds held in trust.
 *    `netCash()` cannot reach them; they are reported beside the statement.
 *  · **Cash basis.** `PAPER_PROFIT` is quoted only to name the gap. It is never
 *    added to a cash line.
 *
 * **Deviations from the design (each a locked rule — do not copy back):**
 *  · the design prints `NPR 83K`; §2.1 puts `Rs` on the value, so every figure
 *    here goes through `lib/money`'s `formatMoney` and lakh grouping.
 *  · the design hardcodes "lifting collection to 80% converts roughly NPR 63K".
 *    That is derived by `collectionUpside(80)` — a sentence with a number in it
 *    is a calculation, and calculations belong to the engine.
 *  · money-blind roles get nothing: this is a money page end to end, so the
 *    whole body is omitted from the DOM rather than masked.
 */

const money = (p: Paisa) => formatMoney(p)

/** +/− prefix for a signed movement. Sign carries meaning on a cash statement. */
function signed(p: Paisa): string {
  const n = p as number
  return (n > 0 ? '+' : '') + formatMoney(p)
}

const th = {
  textAlign: 'left' as const,
  padding: '9px 10px',
  fontSize: 'var(--fs-meta)',
  color: 'var(--text-3)',
  fontWeight: 600,
  borderBottom: '1px solid var(--divider)',
}
const td = {
  padding: '10px',
  fontSize: 'var(--fs-body)',
  borderBottom: '1px solid var(--divider)',
}
const num = { ...td, textAlign: 'right' as const, fontFamily: 'var(--font-id)' }

export default function CashFlowReport() {
  const canSeeMoney = useCanViewMoney()

  // Law 6: a money-blind role is not shown a masked figure — the page is not built.
  if (!canSeeMoney) {
    return (
      <>
        <PageHeader title="Cash Flow" description="Finance ▸ Reports" />
        <Card>
          <div style={{ padding: '22px 4px', textAlign: 'center' }}>
            <Icon name="error" size={22} />
            <h3 style={{ fontSize: 'var(--fs-h3)', margin: '9px 0 5px' }}>Money isn’t shown here</h3>
            <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-2)' }}>
              Cash reporting is for Owner, Admin, Coordinator and Accounts.
            </p>
          </div>
        </Card>
      </>
    )
  }

  const bsStart = toBs(PERIOD_START)
  const bsEnd = toBs(PERIOD_END)
  const period = bsStart && bsEnd
    ? `${formatBs(bsStart)} – ${formatBs(bsEnd, { suffix: true })}`
    : `${formatAd(PERIOD_START)} – ${formatAd(PERIOD_END)}`

  const kpis: Kpi[] = [
    {
      label: 'Net cash flow',
      value: signed(netCash()),
      icon: 'chart',
      accent: 'success',
      delta: { direction: 'up', text: 'cash-positive', good: true },
      note: 'operating + investing',
    },
    {
      label: 'Cash collected',
      value: money(cashIn()),
      icon: 'dollar',
      accent: 'primary',
      delta: { direction: 'up', text: '2% vs last month', good: true },
      note: `${collectionRate()}% of ${money(INVOICED)} invoiced`,
    },
    {
      label: 'Closing cash',
      value: money(closingCash()),
      icon: 'card',
      accent: 'primary',
      delta: { direction: 'up', text: `from ${money(OPENING_CASH)}`, good: true },
      note: 'own funds, excludes deposits',
    },
    {
      // Rising uncollected cash is bad news. The delta arrow points up and the
      // tone says so — `good: false` is what stops an increase reading as a win.
      label: 'Uncollected',
      value: money(uncollected()),
      icon: 'timer',
      accent: 'danger',
      delta: { direction: 'up', text: `${100 - collectionRate()}% of billed`, good: false },
      note: `receivables · ${money(OVERDUE)} overdue`,
    },
    {
      label: 'Operating runway',
      value: `${runwayMonths()} mo`,
      icon: 'activity',
      accent: 'progress',
      delta: { direction: 'up', text: '0.2 mo vs last month', good: true },
      note: 'closing cash ÷ operating burn',
    },
  ]

  return (
    <>
      <PageHeader
        title="Cash Flow"
        description={`${period} · cash basis · NPR · 3 min read`}
      />

      {/* The answer, before any figure. */}
      <Card>
        <p style={{ fontSize: 'var(--fs-body)', lineHeight: 1.6 }}>
          <strong>Recommendation.</strong> The month was cash-positive at{' '}
          <strong>{signed(netCash())}</strong>, but only <strong>{collectionRate()}%</strong> of invoiced
          revenue was collected — {money(uncollected())} sits in receivables. Collect the{' '}
          {money(OVERDUE)} overdue and tighten payment terms: a {money(PAPER_PROFIT)} paper profit is
          only worth the cash it becomes, and operating runway is {runwayMonths()} months.
        </p>

        <ul style={{ margin: '13px 0 0 18px', fontSize: 'var(--fs-body)', lineHeight: 1.75 }}>
          <li>
            Cash-positive: {signed(netCash())} net movement; closing cash {money(closingCash())} from a{' '}
            {money(OPENING_CASH)} open.
          </li>
          <li>
            Only {collectionRate()}% of invoiced revenue collected — {money(cashIn())} in against{' '}
            {money(INVOICED)} billed.
          </li>
          <li>
            <strong>Profit is not cash:</strong> {money(PAPER_PROFIT)} paper profit became{' '}
            {money(netCash())} cash. The {money(profitToCashGap())} gap is receivables plus capex.
          </li>
          <li>
            Operating cash alone was {signed(netOperatingCash())} — the equipment purchase is a one-off,
            not a running cost.
          </li>
          <li>
            {money(DEPOSITS_HELD)} of deposits held in trust — refundable, and not the company’s to spend.
          </li>
        </ul>

        <p style={{ marginTop: 13, fontSize: 'var(--fs-body)', lineHeight: 1.6, color: 'var(--text-2)' }}>
          <strong style={{ color: 'var(--text-1)' }}>Business impact.</strong> Lifting collection from{' '}
          {collectionRate()}% to 80% converts about {money(collectionUpside(80))} more receivables to cash
          this cycle — more than the entire month’s equipment spend.
        </p>
      </Card>

      <div style={{ marginTop: 'var(--sp-md)' }}>
        <KpiStrip items={kpis} columns={5} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 'var(--sp-md)', marginTop: 'var(--sp-md)' }}>
        <Card title={`Cash movement · ${period}`}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <caption style={{ captionSide: 'top', textAlign: 'left', paddingBottom: 8, fontSize: 'var(--fs-meta)', color: 'var(--text-3)' }}>
              Cash basis. Deposits held in trust are excluded from every line below.
            </caption>
            <thead>
              <tr>
                <th style={th} scope="col">Line</th>
                <th style={{ ...th, textAlign: 'right' }} scope="col">NPR</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th style={{ ...td, fontWeight: 600 }} scope="row">Opening cash balance</th>
                <td style={num}>{money(OPENING_CASH)}</td>
              </tr>
              {CASH_LINES.map((l) => (
                <tr key={l.label}>
                  <th style={{ ...td, fontWeight: 400 }} scope="row">
                    {l.label}
                    {l.detail && (
                      <span style={{ display: 'block', fontSize: 'var(--fs-meta)', color: 'var(--text-3)' }}>{l.detail}</span>
                    )}
                  </th>
                  <td style={{ ...num, color: (l.amount as number) < 0 ? 'var(--danger-text)' : 'var(--text-1)' }}>
                    {signed(l.amount)}
                  </td>
                </tr>
              ))}
              <tr>
                <th style={{ ...td, fontWeight: 600 }} scope="row">Net operating cash</th>
                <td style={{ ...num, fontWeight: 600 }}>{signed(netOperatingCash())}</td>
              </tr>
              <tr>
                <th style={{ ...td, fontWeight: 700, borderTop: '2px solid var(--border)' }} scope="row">
                  Net cash movement
                </th>
                <td style={{ ...num, fontWeight: 700, borderTop: '2px solid var(--border)' }}>{signed(netCash())}</td>
              </tr>
              <tr>
                <th style={{ ...td, fontWeight: 700, borderBottom: 'none' }} scope="row">Closing cash balance</th>
                <td style={{ ...num, fontWeight: 700, borderBottom: 'none' }}>{money(closingCash())}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginTop: 11, padding: '9px 11px', ...cardStyle, fontSize: 'var(--fs-meta)', color: 'var(--text-2)' }}>
            Deposits held in trust ({money(DEPOSITS_HELD)}) are tracked separately and excluded above —
            client money, refundable, never revenue.
          </p>
        </Card>

        <Rail width={300}>
          <Card title="Reconciliation">
            <SummaryRows
              rows={[
                { label: 'Paper profit (accrual)', value: money(PAPER_PROFIT) },
                { label: 'Cash generated', value: signed(netCash()), tone: 'success' },
                { label: 'Gap', value: money(profitToCashGap()), tone: 'danger' },
                { label: 'Held in trust', value: money(DEPOSITS_HELD) },
              ]}
            />
          </Card>
        </Rail>
      </div>

      <FooterNote extra={['Cash basis — actual money in and out, not the accrual P&L.']} />
    </>
  )
}
