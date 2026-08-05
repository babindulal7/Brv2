import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { PageHeader, Card, FooterNote, cardStyle } from '../../components/ui/Page'
import { STATUS } from '../../lib/status'
import { formatMoney, rupees, toRupees } from '../../lib/money'
import type { Paisa } from '../../lib/money'

/**
 * **Reports ▸ Pulse — Foundation v2.0 §5.3.**
 *
 * > "Executive Dashboard — deleted. The owner's business view is Reports ▸
 * > Pulse, with its locked KPI order: Revenue · Cash (collected vs outstanding)
 * > · Equipment utilization % · Exceptions (overdue + damage). **Four cards, not
 * > five.** One door per job."
 *
 * This is where the money KPIs went when §5.2 removed them from Today. The
 * order is locked, so the array below is written in it and never sorted.
 *
 * §5.4 caps a page at four KPIs and one chart. There are four cards and one
 * chart, and the chart is the only one on the page.
 */

/* Every amount is paisa (§2.3); nothing here is a typed rupee string. */
const REVENUE_MTD = rupees(1847500)
const REVENUE_PRIOR = rupees(1562000)
const COLLECTED = rupees(1423000)
const OUTSTANDING = rupees(424500)

/** §5.3's "Cash (collected vs outstanding)" — the pair, not one of them. */
const CASH_TOTAL = (COLLECTED + OUTSTANDING) as Paisa
const COLLECTED_PCT = Math.round((COLLECTED / CASH_TOTAL) * 100)

const UTILIZATION = 84
const EXCEPTIONS = { overdue: 4, damage: 2 }

const CARDS = [
  {
    label: 'Revenue',
    value: formatMoney(REVENUE_MTD),
    sub: `${Math.round(((toRupees(REVENUE_MTD) - toRupees(REVENUE_PRIOR)) / toRupees(REVENUE_PRIOR)) * 100)}% vs last month`,
    icon: 'dollar' as const,
    tone: 'in' as const,
    to: '/finance?when=month',
  },
  {
    label: 'Cash',
    value: formatMoney(COLLECTED),
    sub: `${COLLECTED_PCT}% collected · ${formatMoney(OUTSTANDING)} outstanding`,
    icon: 'card' as const,
    tone: 'primary' as const,
    to: '/finance?filter=outstanding',
  },
  {
    label: 'Equipment utilization',
    value: `${UTILIZATION}%`,
    sub: 'Value on rent ÷ total rentable value',
    icon: 'chart' as const,
    tone: 'progress' as const,
    to: '/inventory?view=utilization',
  },
  {
    label: 'Exceptions',
    value: String(EXCEPTIONS.overdue + EXCEPTIONS.damage),
    sub: `${EXCEPTIONS.overdue} overdue · ${EXCEPTIONS.damage} damage`,
    icon: 'alert_triangle' as const,
    tone: 'danger' as const,
    to: '/operations?queue=cases',
  },
]

/** Six months of revenue in paisa, so the chart and the card share one unit. */
const TREND: Array<{ month: string; value: Paisa }> = [
  { month: 'Falgun', value: rupees(1210000) },
  { month: 'Chaitra', value: rupees(1385000) },
  { month: 'Baishakh', value: rupees(1298000) },
  { month: 'Jestha', value: rupees(1502000) },
  { month: 'Ashadh', value: rupees(1562000) },
  { month: 'Shrawan', value: rupees(1847500) },
]
const PEAK = Math.max(...TREND.map((t) => t.value))

export default function Pulse() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="activity"
        title="Pulse"
        description="The business at a glance. Four numbers, one door each."
      />

      {/* §5.3 — four cards, in the locked order. */}
      <section
        aria-label="Business pulse"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 'var(--sp-md)' }}
      >
        {CARDS.map((c) => {
          const tok = STATUS[c.tone]
          return (
            <Link
              key={c.label}
              to={c.to}
              className="lift"
              style={{
                ...cardStyle,
                ...({ '--lift-accent': tok.fg } as React.CSSProperties),
                padding: '15px 16px',
                textDecoration: 'none',
                display: 'block',
                minWidth: 0,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 9,
                    display: 'grid',
                    placeItems: 'center',
                    background: tok.bg,
                    color: tok.fg,
                    flexShrink: 0,
                  }}
                >
                  <Icon name={c.icon} size={16} fill />
                </span>
                <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>{c.label}</span>
              </span>
              <span
                className="kpi-value"
                style={{
                  display: 'block',
                  fontSize: 'clamp(17px, 1.6vw, 24px)',
                  fontWeight: 700,
                  color: 'var(--text)',
                  letterSpacing: '-0.02em',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.15,
                }}
              >
                {c.value}
              </span>
              <span className="figure" style={{ display: 'block', marginTop: 5, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                {c.sub}
              </span>
            </Link>
          )
        })}
      </section>

      {/* §5.4 — one chart per page, and this is it. */}
      <Card title="Revenue — last six months">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 148, padding: '4px 0' }}>
          {TREND.map((t) => {
            const pct = (t.value / PEAK) * 100
            const latest = t === TREND[TREND.length - 1]
            return (
              <span key={t.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                  {formatMoney(t.value)}
                </span>
                <span
                  style={{
                    width: '100%',
                    height: `${pct}%`,
                    minHeight: 4,
                    // 4px rounded ends anchored to the baseline.
                    borderRadius: '4px 4px 0 0',
                    background: latest ? 'var(--cat-1)' : 'var(--st-primary-bg)',
                  }}
                  title={`${t.month}: ${formatMoney(t.value)}`}
                />
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{t.month}</span>
              </span>
            )
          })}
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          Nepali fiscal year runs Shrawan–Ashadh (§3.4), so Shrawan is month one, not the seventh.
        </p>
      </Card>

      <FooterNote extra={['Amounts are integer paisa throughout — see lib/money.ts']} />
    </div>
  )
}
