import Icon from '../../components/ui/Icon'
import { Card, PageHeader, KpiStrip, Rail, SummaryRows, FooterNote } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { formatMoney } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { toBs, formatBs, formatAd } from '../../lib/bs'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import {
  PERIOD_END,
  POSITION,
  CASH_CONVERSION_DAYS,
  CASH_CONVERSION_DAYS_PRIOR,
  DEPOSITS_HELD,
  OVERDUE,
  currentAssets,
  currentLiabilities,
  workingCapital,
  currentRatio,
  freeCash,
  freeCashMonths,
  receivables,
  receivableShare,
  cashPerDayOfCycle,
  cycleUpside,
} from '../../data/liquidityReports'

/**
 * **Finance ▸ Reports ▸ Working Capital** — built from the
 * `Babin Working Capital Report` design.
 *
 * Equipment rental has an unusual balance sheet and the report is shaped around
 * it: there is **no inventory for resale** (the fleet is a fixed asset, not
 * stock, so the current and quick ratios are identical) and effectively **no
 * supplier credit**, since sub-rental partners settle within the month. That
 * leaves receivables as the only real working-capital lever, which is why the
 * whole report drives at the collection cycle.
 *
 * **One correction to the design, and it is a substantive one.** The design
 * renders "Cash Conversion Cycle 28 days ▲ 3 days" with the same positive tone
 * as every other rising KPI. A collection cycle getting *longer* is bad news.
 * The report-excellence skill's own operations family says to invert delta
 * colours where lower is better, and its design did not follow that rule here.
 * This screen passes `good: false`, so the arrow still points up and the tone
 * reads as a warning.
 *
 * **Also enforced:** deposits are stripped out of free cash. They sit in the
 * operating account, which is exactly what makes them easy to spend by mistake.
 */

const money = (p: Paisa) => formatMoney(p)

const th = {
  textAlign: 'left' as const,
  padding: '9px 10px',
  fontSize: 'var(--fs-meta)',
  color: 'var(--text-3)',
  fontWeight: 600,
  borderBottom: '1px solid var(--divider)',
}
const td = { padding: '10px', fontSize: 'var(--fs-body)', borderBottom: '1px solid var(--divider)' }
const num = { ...td, textAlign: 'right' as const, fontFamily: 'var(--font-id)' }

export default function WorkingCapitalReport() {
  const canSeeMoney = useCanViewMoney()

  if (!canSeeMoney) {
    return (
      <>
        <PageHeader title="Working Capital" description="Finance ▸ Reports" />
        <Card>
          <div style={{ padding: '22px 4px', textAlign: 'center' }}>
            <Icon name="error" size={22} />
            <h3 style={{ fontSize: 'var(--fs-h3)', margin: '9px 0 5px' }}>Money isn’t shown here</h3>
            <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-2)' }}>
              Balance-sheet reporting is for Owner, Admin, Coordinator and Accounts.
            </p>
          </div>
        </Card>
      </>
    )
  }

  const bs = toBs(PERIOD_END)
  const asAt = bs ? `As at ${formatAd(PERIOD_END)} (${formatBs(bs, { suffix: true })})` : `As at ${formatAd(PERIOD_END)}`

  const assets = POSITION.filter((l) => l.side === 'asset')
  const liabilities = POSITION.filter((l) => l.side === 'liability')
  const shareOf = (p: Paisa) => Math.round(((p as number) / (currentAssets() as number)) * 100)

  const kpis: Kpi[] = [
    {
      label: 'Working capital',
      value: money(workingCapital()),
      icon: 'dollar',
      accent: 'success',
      delta: { direction: 'up', text: 'Rs 62,000 vs last month', good: true },
      note: 'current assets less liabilities',
    },
    {
      label: 'Current ratio',
      value: `${currentRatio()}`,
      icon: 'chart',
      accent: 'success',
      delta: { direction: 'up', text: 'healthy above 1.5', good: true },
      note: `${money(currentAssets())} ÷ ${money(currentLiabilities())}`,
    },
    {
      // The one the design got wrong: up is worse here.
      label: 'Cash conversion cycle',
      value: `${CASH_CONVERSION_DAYS} days`,
      icon: 'timer',
      accent: 'danger',
      delta: {
        direction: 'up',
        text: `${CASH_CONVERSION_DAYS - CASH_CONVERSION_DAYS_PRIOR} days slower`,
        good: false,
      },
      note: 'all receivables — nothing is stocked',
    },
    {
      label: 'Free cash',
      value: money(freeCash()),
      icon: 'dollar',
      accent: 'primary',
      note: `after obligations · ${freeCashMonths()} months cover`,
    },
    {
      label: 'Tied in receivables',
      value: money(receivables()),
      icon: 'users',
      accent: 'progress',
      delta: { direction: 'up', text: `${receivableShare()}% of assets`, good: false },
      note: `4 clients owing · ${money(OVERDUE)} overdue`,
    },
  ]

  return (
    <>
      <PageHeader title="Working Capital" description={`${asAt} · NPR · 3 min read`} />

      <Card>
        <p style={{ fontSize: 'var(--fs-body)', lineHeight: 1.6 }}>
          <strong>Recommendation.</strong> Working capital is <strong>{money(workingCapital())}</strong> at
          a current ratio of {currentRatio()} — comfortably liquid. But {money(DEPOSITS_HELD)} of the cash
          is client deposits Babin must give back, and the {CASH_CONVERSION_DAYS}-day cash cycle is{' '}
          <em>entirely</em> receivables. Collect the {money(OVERDUE)} overdue and ring-fence the deposits:
          the cycle drops to about 20 days and the balance sheet stops flattering itself.
        </p>

        <ul style={{ margin: '13px 0 0 18px', fontSize: 'var(--fs-body)', lineHeight: 1.75 }}>
          <li>
            Working capital {money(workingCapital())} — current assets {money(currentAssets())} less
            current liabilities {money(currentLiabilities())}.
          </li>
          <li>
            Current ratio {currentRatio()}, quick ratio {currentRatio()} — no inventory for resale, so
            both are the same.
          </li>
          <li>
            Cash conversion cycle {CASH_CONVERSION_DAYS} days, and{' '}
            {CASH_CONVERSION_DAYS - CASH_CONVERSION_DAYS_PRIOR} days slower than last month — rentals are
            pre-agreed, so every day of it is collection.
          </li>
          <li>
            {money(DEPOSITS_HELD)} of the cash is not Babin’s — refundable deposits sitting in the
            operating account.
          </li>
          <li>
            Free cash after obligations is {money(freeCash())} — {freeCashMonths()} months of operating
            cost.
          </li>
        </ul>

        <p style={{ marginTop: 13, fontSize: 'var(--fs-body)', lineHeight: 1.6, color: 'var(--text-2)' }}>
          <strong style={{ color: 'var(--text-1)' }}>Business impact.</strong> Every day cut from the{' '}
          {CASH_CONVERSION_DAYS}-day cycle releases about {money(cashPerDayOfCycle())}. Reaching 20 days
          frees roughly {money(cycleUpside(20))} — without borrowing a rupee.
        </p>
      </Card>

      <div style={{ marginTop: 'var(--sp-md)' }}>
        <KpiStrip items={kpis} columns={5} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 'var(--sp-md)', marginTop: 'var(--sp-md)' }}>
        <Card title={`The position · ${asAt}`}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th} scope="col">Line</th>
                <th style={th} scope="col">Nature</th>
                <th style={{ ...th, textAlign: 'right' }} scope="col">NPR</th>
                <th style={{ ...th, textAlign: 'right' }} scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((l) => (
                <tr key={l.label}>
                  <th style={{ ...td, fontWeight: 400 }} scope="row">{l.label}</th>
                  <td style={{ ...td, color: 'var(--text-2)' }}>{l.nature}</td>
                  <td style={num}>{money(l.amount)}</td>
                  <td style={{ ...num, color: 'var(--text-3)' }}>{shareOf(l.amount)}%</td>
                </tr>
              ))}
              <tr>
                <th style={{ ...td, fontWeight: 600 }} scope="row">Current assets</th>
                <td style={td} />
                <td style={{ ...num, fontWeight: 600 }}>{money(currentAssets())}</td>
                <td style={{ ...num, fontWeight: 600 }}>100%</td>
              </tr>
              {liabilities.map((l) => (
                <tr key={l.label}>
                  <th style={{ ...td, fontWeight: 400 }} scope="row">{l.label}</th>
                  <td style={{ ...td, color: 'var(--text-2)' }}>{l.nature}</td>
                  <td style={{ ...num, color: 'var(--danger-text)' }}>({money(l.amount)})</td>
                  <td style={td} />
                </tr>
              ))}
              <tr>
                <th style={{ ...td, fontWeight: 600 }} scope="row">Current liabilities</th>
                <td style={td} />
                <td style={{ ...num, fontWeight: 600 }}>({money(currentLiabilities())})</td>
                <td style={td} />
              </tr>
              <tr>
                <th style={{ ...td, fontWeight: 700, borderTop: '2px solid var(--border)', borderBottom: 'none' }} scope="row">
                  Working capital
                </th>
                <td style={{ ...td, borderTop: '2px solid var(--border)', borderBottom: 'none' }} />
                <td style={{ ...num, fontWeight: 700, borderTop: '2px solid var(--border)', borderBottom: 'none' }}>
                  {money(workingCapital())}
                </td>
                <td style={{ ...td, borderTop: '2px solid var(--border)', borderBottom: 'none' }} />
              </tr>
            </tbody>
          </table>
        </Card>

        <Rail>
          <Card title="Liquidity">
            <SummaryRows
              rows={[
                { label: 'Free cash', value: money(freeCash()), tone: 'success' },
                { label: 'Held in trust', value: money(DEPOSITS_HELD), tone: 'danger' },
                { label: 'Per day of cycle', value: money(cashPerDayOfCycle()) },
                { label: 'Upside at 20 days', value: money(cycleUpside(20)), tone: 'success' },
              ]}
            />
          </Card>
        </Rail>
      </div>

      <FooterNote extra={['No inventory for resale — the fleet is a fixed asset, so current and quick ratios match.']} />
    </>
  )
}
