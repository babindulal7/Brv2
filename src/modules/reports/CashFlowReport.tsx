import { useEffect, useState } from 'react'
import { Card, PageHeader, KpiStrip, ReflowRail, SummaryRows, FooterNote, cardStyle, useRailGridColumns } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { ReportToolbar, reportDateRange } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow } from '../../components/ui/ReportToolbar'
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
  getLiquiditySummary,
  type LiquiditySummary,
} from '../../lib/queries/liquidity'

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
/*
 * `height` on a table cell behaves as a MINIMUM, so this is the §7.3 row floor
 * ("rows >= 56px") stated with the token rather than reached by inflating the
 * padding; the horizontal padding is left exactly as it was.
 *
 * The floor is a data-integrity rule and not a density preference. A row under
 * 56px cannot contain a 44px hit area, so the target overhangs the rows either
 * side, and where two rows overlap the later one in the DOM wins the tap. This
 * statement carries no row control today, which is the reason the floor belongs
 * on the shared constant rather than on the day somebody adds a drill-through
 * to a cash line: the row is already safe when that happens. `num` derives from
 * this object and the `<th scope="row">` label cells spread it, so a line rises
 * as a whole row instead of one half of it.
 */
const td = {
  height: 'var(--row-min-h)',
  padding: '10px',
  fontSize: 'var(--fs-body)',
  borderBottom: '1px solid var(--divider)',
}
const num = { ...td, textAlign: 'right' as const, fontFamily: 'var(--font-id)' }

/**
 * The export body — the statement as the page draws it, with the two rules the
 * report exists to enforce carried into the file rather than lost in it:
 * deposits are reported beside the statement and never inside a cash total, and
 * paper profit is quoted only to name the gap.
 */
function cashFlowCsv(): ReportCsvRow[] {
  return [
    ['Basis', 'Cash — actual money in and out, not the accrual P&L'],
    [],
    ['Line', 'NPR'],
    ['Opening cash balance', money(OPENING_CASH)],
    ...CASH_LINES.map((l): ReportCsvRow => [l.detail ? `${l.label} (${l.detail})` : l.label, signed(l.amount)]),
    ['Net operating cash', signed(netOperatingCash())],
    ['Net cash movement', signed(netCash())],
    ['Closing cash balance', money(closingCash())],
    [],
    ['Reconciliation', 'NPR'],
    ['Paper profit (accrual)', money(PAPER_PROFIT)],
    ['Cash generated', signed(netCash())],
    ['Gap', money(profitToCashGap())],
    // Client money, refundable — reported beside the statement, never in it.
    ['Held in trust (deposits)', money(DEPOSITS_HELD)],
    [],
    ['Collection', 'Value'],
    ['Invoiced', money(INVOICED)],
    ['Cash collected', money(cashIn())],
    ['Collection rate', `${collectionRate()}%`],
    ['Uncollected', money(uncollected())],
    ['Overdue', money(OVERDUE)],
    ['Operating runway', `${runwayMonths()} months`],
  ]
}

export default function CashFlowReport() {
  /* Rulings §7 — the rail track goes away below 1280 so `ReflowRail`'s
     inline column is not squeezed by a rail column that is still there. */
  const railGridColumns = useRailGridColumns()
  const canSeeMoney = useCanViewMoney()

  // Law 6: a money-blind role is not shown a masked figure — the page is not
  // built. The bespoke card that used to say so is now the shared RESTRICTED
  // state, which also names the roles to ask.
  if (!canSeeMoney) {
    return (
      <>
        <PageHeader title="Cash Flow" description="Finance ▸ Reports" />
        <PageBody
          restricted
          restrictedReason="Cash reporting is money end to end — every line of the statement, every KPI and the whole reconciliation."
          restrictedRequiredRole="Owner, Admin, Coordinator or Accounts"
        >
          {null}
        </PageBody>
      </>
    )
  }

  const [, setSummary] = useState<LiquiditySummary | null>(null)

  useEffect(() => {
    let active = true
    void getLiquiditySummary().then((res) => {
      if (active) setSummary(res)
    })
    return () => {
      active = false
    }
  }, [])

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

      {/*
        The period is passed WITHOUT an `onChange`, so no picker is drawn and the
        export header still names the real range instead of "All dates". It is
        not editable because it cannot be: `data/liquidityReports` holds one
        month's closed statement and its engine functions take no range — a
        picker here would relabel the page and leave every figure where it was.
      */}
      <div style={{ marginTop: 'var(--sp-md)' }}>
        <ReportToolbar
          title="Cash Flow"
          value={{ dateRange: reportDateRange('cash_date', PERIOD_START, PERIOD_END) }}
          csv={{ filename: 'cash-flow', build: cashFlowCsv }}
        />
      </div>

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

      <div style={{ display: 'grid', gridTemplateColumns: railGridColumns, gap: 'var(--sp-md)', marginTop: 'var(--sp-md)' }}>
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

        <ReflowRail width={300}>
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
        </ReflowRail>
      </div>

      <FooterNote extra={['Cash basis — actual money in and out, not the accrual P&L.']} />
    </>
  )
}
