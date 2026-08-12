import { Card, PageHeader, KpiStrip, Rail, SummaryRows, FooterNote } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { ReportToolbar, reportDateRange } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow } from '../../components/ui/ReportToolbar'
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
  LIABILITIES_ARE_COMPLETE,
  untrackedLines,
  currentAssets,
  currentLiabilities,
  workingCapital,
  workingCapitalCeiling,
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
 *
 * ## ⚠ Three figures on this screen are withheld, and that is the fix
 *
 * `data/liquidityReports.ts` used to hand-type `Trade payables: rupees(42_200)`
 * with no supplier-invoice table anywhere in `supabase/migrations/`. It was not
 * only displayed: it fed `currentLiabilities()`, and through it
 * `workingCapital()`, `currentRatio()` and `freeCash()` — four figures this
 * page states as fact, one of them ("free cash") the kind somebody spends.
 *
 * `WIREFRAME_RULINGS_2026-08-12.md` §8 names it, and `09_FINANCE.md` §9.6 rules
 * that Payables *"renders the honest 'not tracked yet' empty state, never a
 * fabricated figure"* — so leaving it would have had the app saying "not
 * tracked yet" on the Payables report and Rs 42,200 of the same liability here.
 *
 * The line is now `amount: null` and three derived figures return `null` while
 * it is. They render `NOT_TRACKED`, the liability subtotal is relabelled
 * "tracked only", and a persistent card above the recommendation says which
 * class of obligation is missing and gives the ceiling *as* a ceiling. Nothing
 * is deleted and nothing is zeroed: the day supplier invoices are recorded,
 * `LIABILITIES_ARE_COMPLETE` flips and every figure returns with no edit here.
 */

const money = (p: Paisa) => formatMoney(p)

/**
 * **The one string this report may print where a figure is missing.**
 *
 * `WIREFRAME_RULINGS_2026-08-12.md` §8 and `09_FINANCE.md` §9.7 — *"A report
 * with no data source shows 'not tracked yet', never zeros."* Never a dash,
 * never `Rs 0`, never a plausible default: each of those reads as a figure
 * somebody computed.
 */
const NOT_TRACKED = 'Not tracked yet'

const moneyOrNot = (p: Paisa | null) => (p === null ? NOT_TRACKED : money(p))

/**
 * The untracked liability lines, named.
 *
 * Empty today would mean the gap closed; the report reads it rather than
 * hardcoding "payables", so the day a supplier-invoice table lands the
 * disclosure disappears on its own and nothing here needs editing.
 */
const UNTRACKED_LIABILITIES = untrackedLines('liability')
const UNTRACKED_LABELS = UNTRACKED_LIABILITIES.map((l) => l.label).join(', ')

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

/**
 * The export body — the position as the page draws it, assets then liabilities
 * then the difference, plus the liquidity rail.
 *
 * Liabilities are written in parentheses exactly as the table shows them, so a
 * reader comparing file to screen is comparing the same two things. Deposits
 * held in trust keep their own line for the reason the whole report exists: they
 * sit in the operating account, which is what makes them easy to spend twice.
 */
function workingCapitalCsv(): ReportCsvRow[] {
  const share = (p: Paisa | null) =>
    p === null ? NOT_TRACKED : `${Math.round(((p as number) / (currentAssets() as number)) * 100)}%`
  /* An untracked line exports the words, never `0` and never an empty cell — a
     spreadsheet SUMs a blank as zero, which is the fabrication this whole change
     exists to stop, only now it is in a file somebody sent their accountant. */
  const cell = (p: Paisa | null, parens = false) =>
    p === null ? NOT_TRACKED : parens ? `(${money(p)})` : money(p)
  return [
    ['Line', 'Nature', 'NPR', 'Share'],
    ...POSITION.filter((l) => l.side === 'asset').map((l): ReportCsvRow => [l.label, l.nature, cell(l.amount), share(l.amount)]),
    ['Current assets', '', money(currentAssets()), '100%'],
    ...POSITION.filter((l) => l.side === 'liability').map((l): ReportCsvRow => [l.label, l.nature, cell(l.amount, true), '']),
    [
      LIABILITIES_ARE_COMPLETE ? 'Current liabilities' : 'Current liabilities (tracked only)',
      LIABILITIES_ARE_COMPLETE ? '' : `Excludes: ${UNTRACKED_LABELS}`,
      `(${money(currentLiabilities())})`,
      '',
    ],
    ['Working capital', LIABILITIES_ARE_COMPLETE ? '' : `At most ${money(workingCapitalCeiling())}`, moneyOrNot(workingCapital()), ''],
    [],
    ['Figure', 'Value'],
    ['Current ratio', currentRatio() === null ? NOT_TRACKED : `${currentRatio()}`],
    ['Cash conversion cycle', `${CASH_CONVERSION_DAYS} days`],
    ['Prior cash conversion cycle', `${CASH_CONVERSION_DAYS_PRIOR} days`],
    ['Free cash', moneyOrNot(freeCash())],
    ['Free cash cover', freeCashMonths() === null ? NOT_TRACKED : `${freeCashMonths()} months`],
    ['Tied in receivables', money(receivables())],
    ['Receivable share of assets', `${receivableShare()}%`],
    ['Overdue', money(OVERDUE)],
    ['Held in trust (deposits)', money(DEPOSITS_HELD)],
    ['Released per day of cycle', money(cashPerDayOfCycle())],
    ['Upside at a 20-day cycle', money(cycleUpside(20))],
  ]
}

export default function WorkingCapitalReport() {
  const canSeeMoney = useCanViewMoney()

  // Law 6 — a balance sheet is money in every line. Shared RESTRICTED state, so
  // the reader is told which roles to ask rather than only that they cannot look.
  if (!canSeeMoney) {
    return (
      <>
        <PageHeader title="Working Capital" description="Finance ▸ Reports" />
        <PageBody
          restricted
          restrictedReason="Balance-sheet reporting is money in every line — assets, liabilities, free cash and the collection cycle derived from them."
          restrictedRequiredRole="Owner, Admin, Coordinator or Accounts"
        >
          {null}
        </PageBody>
      </>
    )
  }

  const bs = toBs(PERIOD_END)
  const asAt = bs ? `As at ${formatAd(PERIOD_END)} (${formatBs(bs, { suffix: true })})` : `As at ${formatAd(PERIOD_END)}`

  const assets = POSITION.filter((l) => l.side === 'asset')
  const liabilities = POSITION.filter((l) => l.side === 'liability')
  const shareOf = (p: Paisa) => Math.round(((p as number) / (currentAssets() as number)) * 100)

  /* Law 11 / Rulings §8 — a KPI whose source is missing loses its value, its
     accent AND its delta. A green tile reading "Not tracked yet" with an
     encouraging arrow beside it is worse than no tile: the arrow is a claim
     about a movement in a figure nobody has. */
  const kpis: Kpi[] = [
    workingCapital() === null
      ? {
          label: 'Working capital',
          value: NOT_TRACKED,
          icon: 'dollar',
          accent: 'neutral',
          note: `at most ${money(workingCapitalCeiling())} — ${UNTRACKED_LABELS.toLowerCase()} unknown`,
        }
      : {
          label: 'Working capital',
          value: money(workingCapital() as Paisa),
          icon: 'dollar',
          accent: 'success',
          delta: { direction: 'up', text: 'Rs 62,000 vs last month', good: true },
          note: 'current assets less liabilities',
        },
    currentRatio() === null
      ? {
          label: 'Current ratio',
          value: NOT_TRACKED,
          icon: 'chart',
          accent: 'neutral',
          note: `${money(currentAssets())} ÷ an incomplete liability total`,
        }
      : {
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
    freeCash() === null
      ? {
          label: 'Free cash',
          value: NOT_TRACKED,
          icon: 'dollar',
          accent: 'neutral',
          note: 'obligations are not fully known, so no figure here is spendable',
        }
      : {
          label: 'Free cash',
          value: money(freeCash() as Paisa),
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

      {/*
        A balance sheet is a position at an instant, not a window, so the range
        passed here is that one date at both ends — and it is passed without an
        `onChange`, so no picker is drawn over figures no picker could move.
      */}
      <div style={{ marginTop: 'var(--sp-md)' }}>
        <ReportToolbar
          title="Working Capital"
          value={{ dateRange: reportDateRange('as_at', PERIOD_END, PERIOD_END) }}
          csv={{ filename: 'working-capital', build: workingCapitalCsv }}
        />
      </div>

      {/*
        Law 12 — the gap is stated inline and persistently, above the figures it
        qualifies, rather than as a footnote under them. A reader who stops after
        the headline must still have been told which side of the balance sheet
        is incomplete.
      */}
      {!LIABILITIES_ARE_COMPLETE && (
        <Card title="This balance sheet is incomplete">
          <p style={{ fontSize: 'var(--fs-body)', lineHeight: 1.6, margin: 0 }}>
            <strong>{UNTRACKED_LABELS}</strong> {UNTRACKED_LIABILITIES.length === 1 ? 'is' : 'are'} not tracked.
            There is no supplier-invoice table in this system, so nothing here knows what Babin owes its suppliers
            or its sub-rental partners. Working capital, the current ratio and free cash all divide by or subtract
            the liability total, so all three read <strong>{NOT_TRACKED}</strong> rather than a figure computed over
            a set that is missing a whole class of obligation.
          </p>
          <p style={{ marginTop: 11, marginBottom: 0, fontSize: 'var(--fs-body)', lineHeight: 1.6, color: 'var(--text-2)' }}>
            What is known: current assets are {money(currentAssets())} and tracked liabilities are{' '}
            {money(currentLiabilities())}, so working capital is <strong>at most {money(workingCapitalCeiling())}</strong> —
            a ceiling, not a position. The figures return the day supplier invoices are recorded; nothing on this
            screen needs changing when they are.
          </p>
        </Card>
      )}

      <Card>
        <p style={{ fontSize: 'var(--fs-body)', lineHeight: 1.6 }}>
          <strong>Recommendation.</strong>{' '}
          {LIABILITIES_ARE_COMPLETE ? (
            <>
              Working capital is <strong>{moneyOrNot(workingCapital())}</strong> at a current ratio of{' '}
              {currentRatio()} — comfortably liquid. But{' '}
            </>
          ) : (
            <>
              Liquidity cannot be stated while {UNTRACKED_LABELS.toLowerCase()} {UNTRACKED_LIABILITIES.length === 1 ? 'is' : 'are'}{' '}
              unrecorded — see above. What the collection side says is unaffected by that gap, and it is the actionable
              half:{' '}
            </>
          )}
          {money(DEPOSITS_HELD)} of the cash is client deposits Babin must give back, and the{' '}
          {CASH_CONVERSION_DAYS}-day cash cycle is <em>entirely</em> receivables. Collect the {money(OVERDUE)} overdue
          and ring-fence the deposits: the cycle drops to about 20 days and the balance sheet stops flattering itself.
        </p>

        <ul style={{ margin: '13px 0 0 18px', fontSize: 'var(--fs-body)', lineHeight: 1.75 }}>
          <li>
            Working capital {moneyOrNot(workingCapital())} — current assets {money(currentAssets())} less{' '}
            {LIABILITIES_ARE_COMPLETE ? 'current liabilities' : 'the tracked liabilities'}{' '}
            {money(currentLiabilities())}
            {LIABILITIES_ARE_COMPLETE ? '' : `, which exclude ${UNTRACKED_LABELS.toLowerCase()}`}.
          </li>
          <li>
            {currentRatio() === null ? (
              <>Current ratio and quick ratio {NOT_TRACKED.toLowerCase()} — both divide by the liability total.</>
            ) : (
              <>
                Current ratio {currentRatio()}, quick ratio {currentRatio()} — no inventory for resale, so both are the
                same.
              </>
            )}
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
            {freeCash() === null ? (
              <>Free cash after obligations {NOT_TRACKED.toLowerCase()} — the obligations are not all known.</>
            ) : (
              <>
                Free cash after obligations is {moneyOrNot(freeCash())} — {freeCashMonths()} months of operating cost.
              </>
            )}
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

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 'var(--sp-md)', marginTop: 'var(--sp-md)' }}>
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
                  <td style={l.amount === null ? { ...num, color: 'var(--text-3)', fontFamily: 'inherit' } : num}>
                    {l.amount === null ? NOT_TRACKED : money(l.amount)}
                  </td>
                  <td style={{ ...num, color: 'var(--text-3)' }}>{l.amount === null ? '—' : `${shareOf(l.amount)}%`}</td>
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
                  {/* An untracked line loses the parentheses and the danger tone
                      along with its figure — both are the visual grammar of "this
                      is a number", and it is not one. Law 11: the words carry the
                      meaning, never the colour. */}
                  <td
                    style={
                      l.amount === null
                        ? { ...num, color: 'var(--text-3)', fontFamily: 'inherit' }
                        : { ...num, color: 'var(--danger-text)' }
                    }
                  >
                    {l.amount === null ? NOT_TRACKED : `(${money(l.amount)})`}
                  </td>
                  <td style={td} />
                </tr>
              ))}
              <tr>
                <th style={{ ...td, fontWeight: 600 }} scope="row">
                  {LIABILITIES_ARE_COMPLETE ? 'Current liabilities' : 'Current liabilities · tracked only'}
                </th>
                <td style={{ ...td, color: 'var(--text-2)' }}>
                  {LIABILITIES_ARE_COMPLETE ? '' : `Excludes ${UNTRACKED_LABELS.toLowerCase()}`}
                </td>
                <td style={{ ...num, fontWeight: 600 }}>({money(currentLiabilities())})</td>
                <td style={td} />
              </tr>
              <tr>
                <th style={{ ...td, fontWeight: 700, borderTop: '2px solid var(--border)', borderBottom: 'none' }} scope="row">
                  Working capital
                </th>
                <td style={{ ...td, color: 'var(--text-2)', borderTop: '2px solid var(--border)', borderBottom: 'none' }}>
                  {LIABILITIES_ARE_COMPLETE ? '' : `At most ${money(workingCapitalCeiling())}`}
                </td>
                <td
                  style={{
                    ...num,
                    fontWeight: 700,
                    borderTop: '2px solid var(--border)',
                    borderBottom: 'none',
                    ...(workingCapital() === null ? { color: 'var(--text-3)', fontFamily: 'inherit' } : {}),
                  }}
                >
                  {moneyOrNot(workingCapital())}
                </td>
                <td style={{ ...td, borderTop: '2px solid var(--border)', borderBottom: 'none' }} />
              </tr>
            </tbody>
          </table>
        </Card>

        <Rail width={300}>
          <Card title="Liquidity">
            <SummaryRows
              rows={[
                freeCash() === null
                  ? { label: 'Free cash', value: NOT_TRACKED }
                  : { label: 'Free cash', value: moneyOrNot(freeCash()), tone: 'success' as const },
                { label: 'Held in trust', value: money(DEPOSITS_HELD), tone: 'danger' },
                { label: 'Per day of cycle', value: money(cashPerDayOfCycle()) },
                { label: 'Upside at 20 days', value: money(cycleUpside(20)), tone: 'success' },
              ]}
            />
          </Card>
        </Rail>
      </div>

      <FooterNote
        extra={[
          'No inventory for resale — the fleet is a fixed asset, so current and quick ratios match.',
          ...(LIABILITIES_ARE_COMPLETE
            ? []
            : [`${UNTRACKED_LABELS} not tracked — no supplier-invoice table exists, so three derived figures are withheld.`]),
        ]}
      />
    </>
  )
}
