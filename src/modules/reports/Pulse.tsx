import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { PageHeader, Card, ReflowRail, FooterNote, Button, cardStyle, useRailGridColumns } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { DataTableShell } from '../../components/ui/DataTable'
import { LineChart, GroupedBars } from '../../components/ui/Charts'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { ReportToolbar, reportDateRange } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow } from '../../components/ui/ReportToolbar'
import { BRAND, BRAND_ON, STATUS } from '../../lib/status'
import type { BrandKey } from '../../lib/status'
import { formatMoney, grouped, toRupees } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { getBusinessToday, toBs, formatBs, formatAd } from '../../lib/bs'
import { useAuth } from '../../lib/auth'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import './reports.css'
import { IS_MOCK } from '../../lib/supabase'
import {
  PERIODS,
  DEFAULT_PERIOD,
  DEFINITIONS,
  PERIOD_BASIS,
  RECONCILIATION,
  SCHEDULES,
  UPCOMING,
  LEDGER_ASSERTION_ERRORS,
  FLEET_RECONCILIATION_ERRORS,
  MODEL_DISCLOSURE,
  figuresFor,
  previousPeriod,
  rangeLabel,
  dueStatus,
  getPulseLiveSummary,
  type ChartView,
  type PeriodFigures,
  type EquipmentRow,
  type PulseLiveSummary,
} from '../../lib/queries/pulse'

/*
 * The operating day, resolved once when this module loads, from the real
 * clock in Kathmandu (`lib/bs.ts`'s `getBusinessToday`). It replaced an
 * imported `TODAY` constant frozen at 31 Jul 2026.
 */
const TODAY = getBusinessToday()


/**
 * **Finance ▸ Reports ▸ Pulse** — built against `03 Core Modules/Reports.PNG`
 * and its spec `Reports.md` v2.1, on Foundation v2.0 §5.3.
 *
 * Every figure on the page is a grouping of the one daily ledger in
 * `data/pulse.ts`. The page computes no business metric: it picks a period,
 * hands `(from, to)` to `figuresFor`, and renders what comes back. §2.1 —
 * *"Reports reads, it does not compute."*
 *
 * **Deviations from the render, each one a locked rule — never copy these back:**
 *  · **Four KPI cards, not five.** Foundation §5.3 locks the order — Revenue ·
 *    Cash (collected vs outstanding) · Equipment utilization · Exceptions
 *    (overdue + damage) — and the 8 Aug ruling that let Today grow to six cards
 *    covered Today and Inventory only. The render shows five (Revenue · Net
 *    Profit · Utilization · Active Rentals · Outstanding Receivable) and
 *    `Reports.md` §7 asks for a third set (Revenue · Net Profit · Utilization ·
 *    Outstanding Receivable). §5.3 wins; the conflict is reported, not copied.
 *    Net profit and outstanding are still on the page — profit as a chart view,
 *    outstanding on the Cash card, which is where §5.3 puts it.
 *  · **One chart** (§5.4), so the render's four chart panels — Revenue Trend ·
 *    Expense vs Profit · Cash Flow · Utilization Trend — become four *views* of
 *    one chart. `DEFINITIONS` in the data file is keyed by exactly those four.
 *  · `NPR 42,50,000` → `Rs 42,50,000`, through `lib/money` (§2.3).
 *  · The render draws Revenue Trend as a line while a `Compare: Last Month`
 *    control sits above it doing nothing to the chart. §9 says a comparison is
 *    *"rendered as a second labelled series, never merged into the first"*, and
 *    `Charts` has no two-line component and no dual axis — both deliberate — so
 *    with a comparison active the single-series views become paired bars on one
 *    axis, each series labelled with its own range. Turn comparison off and the
 *    line returns.
 *  · The render's Utilization tile is **purple** and its charts carry cyan and
 *    violet; §4.2 bans all three. Allowed families only, and the chart takes the
 *    validated categorical palette from `components/ui/Charts` in fixed order.
 *  · The render's sidebar is the old 13-item numbered one. §5.1 locks 8
 *    unnumbered sections + Settings, and the shell owns it either way.
 *  · The render's range reads `1 Jul – 31 Jul 2026` under a BS line of
 *    `16 – 31 Shrawan 2083` — thirty AD days over fifteen BS days, with Ashadh
 *    dates labelled Shrawan. Every date here comes from `lib/bs`, which covers
 *    Shrawan 2083 only and says so rather than guessing (§4.1).
 *  · The render's charts run Jan–Dec with solid actuals in months that have not
 *    happened, under a July range. The period drives every panel here (§3), and
 *    the ledger stops at today, so a future actual cannot be drawn.
 *  · The render's Upcoming panel marks a receivable due 3 Aug as *Overdue 3
 *    days* beside rows implying today is 31 Jul. Status is derived from one
 *    clock — the period's as-of date — and never stored (§4.3).
 *  · Saved Reports, the custom builder and PDF/Excel export are §10–§11 and are
 *    not built. Rather than four controls that do nothing, the rail carries the
 *    reports that exist and states what is missing.
 */

/* ── small shared styles ───────────────────────────────────────────────── */

const th = {
  textAlign: 'left' as const,
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
/*
 * `height` on a `<td>` behaves as a MINIMUM, so this is the §7.3 row floor
 * ("rows >= 56px") expressed with the token rather than with padding
 * arithmetic; horizontal padding and the top alignment stay as they are.
 *
 * Both tables below are read-only today, and their two-line cells — AD over BS
 * on a due date, unit-days under an equipment name — already clear the floor on
 * their own. That is the argument for putting it on the constant rather than
 * leaving it to the content: a single-line row must not end up shorter than the
 * two-line row beside it, and no row may be too short to hold a 44px hit area,
 * because a target that overhangs its row hands the tap to the next row in the
 * DOM. The floor is what stops that before a control is ever added here.
 */
const td = { height: 'var(--row-min-h)', padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', verticalAlign: 'top' as const }

/* Law 15 — hit area over paint, number from `--tap`. One consumer: the range
   Select above the pulse table. */
const selStyle = {
  minHeight: 'var(--tap)',
  padding: '0 8px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--border)',
  background: 'var(--card2)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
}

/* Law 14 / v4.1 §7.3 — 44px hit area on every interactive target, and §5's
   escape hatch: "compact visual allowed ONLY with an invisible pseudo-element
   extending the hit area to 44 — the law is the HIT AREA, not the paint."

   The paint stays 30 here on purpose, and the difference from every other strip
   on this screen is that this constant dresses TWO different things: the `Link`
   for a family that has a page, and an `aria-disabled` `<span>` for the eight
   that do not. Growing the box would have inflated the span as well — a hit area
   on something with nothing to hit — and shrinking only the interactive half
   would leave a strip of 44px links beside 30px spans, which reads as two kinds
   of tab rather than one kind in two states. So the constant keeps the shared
   paint and the interactive consumer alone carries `className="tap"`, which
   grows its target underneath the pill without moving a pixel of the strip. */
const tabStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 30,
  padding: '0 11px',
  borderRadius: 'var(--r-badge)',
  fontSize: 'var(--t-meta)',
  fontWeight: 600,
  textDecoration: 'none',
  whiteSpace: 'nowrap' as const,
}

/**
 * `Reports.md` §8 — eleven tabs, in the render's order. `to` is `null` where the
 * family has no page in this build; `money` marks the two §12 keeps away from a
 * money-blind role. Both facts are read off this table rather than typed into
 * the caption, so the strip and its explanation cannot drift apart.
 */
const TAB_FAMILIES: Array<{ label: string; to: string | null; money: boolean }> = [
  { label: 'Dashboard', to: '/reports/pulse', money: false },
  { label: 'Revenue', to: null, money: true },
  { label: 'Rentals', to: null, money: false },
  { label: 'Inventory', to: '/reports/inventory', money: false },
  { label: 'Clients', to: '/reports/clients', money: true },
  { label: 'Operations', to: null, money: false },
  { label: 'Finance', to: '/reports/cash-flow', money: true },
  { label: 'Maintenance', to: '/reports/equipment-performance', money: false },
  { label: 'Cases', to: '/reports/cases', money: false },
  { label: 'Staff', to: '/reports/staff', money: false },
  { label: 'Custom', to: null, money: false },
]

/* ── the four chart views ──────────────────────────────────────────────── */

const VIEW_ORDER: ChartView[] = ['revenue', 'cash', 'profit', 'utilization']
const VIEW_LABEL: Record<ChartView, string> = {
  revenue: 'Revenue',
  cash: 'Cash flow',
  profit: 'Expense vs profit',
  utilization: 'Utilization',
}

/**
 * Axis ticks are a **scale**, not an amount: `Rs 2,01,800` five times over does
 * not fit the gutter `Charts` reserves, and the exact figure is on every hover
 * target and in the card header. Thousands, grouped by `lib/money`'s `grouped`
 * so the lakh rule is not re-implemented here.
 */
function thousands(rupeeValue: number): string {
  return Math.abs(rupeeValue) >= 1000 ? `${grouped(rupeeValue / 1000)}K` : grouped(rupeeValue)
}

function ticksFor(max: number, fmt: (v: number) => string): string[] {
  return [0, 1, 2, 3, 4].map((i) => fmt((max * i) / 4))
}

/* ── deltas — §7, "each card compares to the previous period" ──────────── */

interface Delta {
  /** `flat` earns a neutral dot: an arrow on a figure that did not move reads
      as a rise or a fall at a glance, which is the opposite of what happened. */
  direction: 'up' | 'down' | 'flat'
  text: string
  good: boolean
}

function pctDelta(now: number, then: number, upIsGood = true): Delta | null {
  if (then <= 0) return null
  const d = ((now - then) / then) * 100
  if (Math.abs(d) < 0.05) return { direction: 'flat', text: 'Unchanged vs previous period', good: true }
  const up = d > 0
  return { direction: up ? 'up' : 'down', text: `${Math.abs(d).toFixed(1)}% vs previous period`, good: up === upIsGood }
}

function countDelta(now: number, then: number, unitUp: string, unitDown: string, upIsGood: boolean): Delta {
  const d = now - then
  if (d === 0) return { direction: 'flat', text: 'Unchanged vs previous period', good: true }
  const up = d > 0
  return {
    direction: up ? 'up' : 'down',
    text: `${Math.abs(d)} ${up ? unitUp : unitDown} than previous period`,
    good: up === upIsGood,
  }
}

/* ── KPI card ──────────────────────────────────────────────────────────── */

interface CardModel {
  label: string
  value: string
  sub: string
  icon: IconName
  accent: BrandKey
  to: string
  linkLabel: string
  delta: Delta | null
  /** §2.2 — set when the headline disagrees with the engine that owns it. */
  discrepancy: boolean
}

function KpiCard({ c }: { c: CardModel }) {
  return (
    <article
      className="lift report-kpi-card"
      style={{
        ...cardStyle,
        padding: '13px 14px',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        borderColor: c.discrepancy ? 'var(--danger)' : 'var(--border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 'var(--r-sm)',
            background: BRAND[c.accent],
            color: BRAND_ON[c.accent],
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name={c.icon} size={16} fill />
        </span>
        <div
          style={{
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            color: 'var(--text2)',
            minWidth: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {c.label}
        </div>
      </div>

      <div
        className={c.discrepancy ? undefined : 'kpi-value figure'}
        style={{
          marginTop: 9,
          fontSize: c.discrepancy ? 'var(--t-ui)' : 'clamp(17px, 1.5vw, 23px)',
          fontWeight: 700,
          color: c.discrepancy ? 'var(--danger-text)' : 'var(--text)',
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
          whiteSpace: c.discrepancy ? 'normal' : 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {c.value}
      </div>

      <div style={{ marginTop: 5, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{c.sub}</div>

      {c.delta && (
        <div
          style={{
            marginTop: 5,
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            color:
              c.delta.direction === 'flat'
                ? 'var(--muted)'
                : c.delta.good
                  ? 'var(--success-text)'
                  : 'var(--danger-text)',
          }}
        >
          <Icon
            name={c.delta.direction === 'flat' ? 'dot' : c.delta.direction === 'up' ? 'arrow_up' : 'arrow_down'}
            size={12}
            fill
          />
          {c.delta.text}
        </div>
      )}

      <Link
        to={c.to}
        style={{
          marginTop: 'auto',
          paddingTop: 9,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--sp-xs)',
          fontSize: 'var(--t-meta)',
          fontWeight: 600,
          color: 'var(--link)',
          textDecoration: 'none',
        }}
      >
        {c.linkLabel}
        <Icon name="arrow_right" size={12} />
      </Link>
    </article>
  )
}

/* ── page ──────────────────────────────────────────────────────────────── */

export default function Pulse() {
  const money = useCanViewMoney()
  if (!IS_MOCK) return (
    <PageShell>
      <PageHeader title="Pulse" description="Business overview" />
      <section aria-label="Key figures" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--sp-md)' }}>
        {(money
          ? ['Revenue', 'Cash', 'Equipment utilisation', 'Exceptions']
          : ['Equipment utilisation', 'Exceptions']
        ).map((label) => <Card key={label} title={label}><p style={{ margin: 0, color: 'var(--muted)' }}>Not tracked yet.</p></Card>)}
      </section>
      <Card title="Reports"><p style={{ margin: 0 }}>Open a report to see recorded invoices, collections, and rental activity.</p><Link to="/finance?tab=reports" style={{ color: 'var(--link)', display: 'inline-block', padding: '12px 0', minHeight: 44 }}>Browse reports</Link></Card>
    </PageShell>
  )
  return <DemoPulse />
}

function DemoPulse() {
  const money = useCanViewMoney()
  const { user } = useAuth()
  const periodRef = useRef<HTMLSelectElement>(null)
  const viewport = useViewport()
  /* Rulings §7 — the rail track goes away below 1280 so `ReflowRail`'s
     inline column is not squeezed by a rail column that is still there.
     Called here, above the no-period early return, because it is a hook. */
  const railGridColumns = useRailGridColumns()

  const [periodKey, setPeriodKey] = useState<string>(DEFAULT_PERIOD)
  const [compareOn, setCompareOn] = useState(true)
  const [view, setView] = useState<ChartView>('revenue')
  const [, setLiveSummary] = useState<PulseLiveSummary | null>(null)

  useEffect(() => {
    let active = true
    void getPulseLiveSummary().then((res) => {
      if (active) setLiveSummary(res)
    })
    return () => {
      active = false
    }
  }, [])

  const period = PERIODS.find((p) => p.key === periodKey) ?? null
  const range = period?.range ?? null

  const figures = useMemo(() => (range ? figuresFor(range.from, range.to) : null), [range])
  const compareRange = useMemo(
    () => (figures && compareOn ? previousPeriod(figures.from, figures.to) : null),
    [figures, compareOn],
  )
  const compare = useMemo(
    () => (compareRange ? figuresFor(compareRange.from, compareRange.to) : null),
    [compareRange],
  )

  /* Every preset the ledger or the BS table cannot vouch for, with its reason —
     §4.2's list stays complete rather than quietly dropping the ones that fail. */
  const disabledPresets = PERIODS.filter((p) => p.range === null)
  const unavailable = [...new Set(disabledPresets.filter((p) => p.why).map((p) => p.why as string))]

  const barLabel = figures ? rangeLabel(figures.from, figures.to) : null

  /*
   * The shared `ReportToolbar` (`09_FINANCE.md` §9.7) owns the compare control,
   * the CSV and Print. Pulse keeps its own PERIOD select as a child rather than
   * using the toolbar's date range, and that is deliberate: `PERIODS` carries
   * presets the ledger cannot vouch for, each with the REASON it is unavailable
   * (`p.why`), and a generic rolling-window picker cannot say any of that. Two
   * date controls in one bar would be worse than one bespoke one.
   *
   * `value` is passed WITHOUT an `onChange`, which is how the toolbar is told
   * "this is the period, and it is not yours to change": no picker is drawn,
   * and the export header still names the real range instead of "All dates".
   *
   * ⛔ `generatedBy` was `user?.name ?? 'Unknown user'`, and that row LEAVES THE
   * BUILDING. §11's whole point is that a printed report can be verified later,
   * and `Generated by,Unknown user` is a provenance line that cannot be
   * verified and was never true of anyone.
   *
   * The row is now OMITTED with no session rather than the export refused —
   * which is the choice `ReportCsvSpec.generatedBy` already documents (*"omitted
   * rather than guessed when the screen has no session in hand"*), and
   * `buildReportCsv` writes the line only when it has a name. Why omit and not
   * refuse: unlike the damage approval or the late-fee waiver, an export
   * asserts nothing about who DECIDED anything. It is a read of figures that
   * were already true, and the header still carries the report, the period, the
   * compare state and the timestamp. A CSV nobody signed is honest; a CSV
   * signed "Unknown user" is a forged signature on a file that outlives the
   * session.
   */
  const periodBar = (
    <ReportToolbar
      title="Pulse"
      {...(figures ? { value: { dateRange: reportDateRange('day', figures.from, figures.to) } } : {})}
      compare={compareOn ? 'previous' : 'off'}
      onCompareChange={(next) => setCompareOn(next === 'previous')}
      {...(money && figures
        ? {
            csv: {
              filename: 'pulse',
              build: () => pulseCsvBody(figures, compareRange),
              ...(user ? { generatedBy: user.name } : {}),
            },
          }
        : {})}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          padding: '4px 10px',
          borderRadius: 'var(--r-input)',
          border: '1px solid var(--border)',
          background: 'var(--card2)',
          minWidth: 0,
        }}
      >
        <Icon name="calendar" size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        {/* §4.1 — BS above AD, from the one Date Engine. When the engine cannot
            vouch for the BS side it says so and the AD range takes the lead
            line, rather than a guessed Nepali date leading the page. */}
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, minWidth: 0 }}>
          <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            {barLabel ? (barLabel.bs ?? barLabel.ad) : 'No period'}
          </span>
          <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            {barLabel ? (barLabel.bs ? barLabel.ad : 'BS unavailable — see Report summary') : '—'}
          </span>
        </span>
      </span>

      <select
        ref={periodRef}
        value={periodKey}
        onChange={(e) => setPeriodKey(e.target.value)}
        aria-label="Report period"
        style={selStyle}
      >
        {PERIODS.map((p) => (
          <option key={p.key} value={p.key} disabled={p.range === null}>
            {p.label}
            {p.range === null ? ' — unavailable' : ''}
          </option>
        ))}
      </select>

      {figures && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 26,
            padding: '0 9px',
            // §3.3 — --r-badge (999) is numeric count badges only; a status
            // takes --r-chip. See DESIGN_DIRECTION_SPEC_v4.1 §4.
            borderRadius: 'var(--r-chip)',
            background: figures.live ? STATUS.in.bg : STATUS.neutral.bg,
            color: figures.live ? STATUS.in.fg : STATUS.neutral.fg,
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          <Icon name={figures.live ? 'dot' : 'timer'} size={12} fill />
          {figures.live ? 'Live — period still open' : 'Snapshot — period closed'}
        </span>
      )}
    </ReportToolbar>
  )

  const header = (
    <PageHeader
      icon="activity"
      title="Pulse"
      description="The business at a glance. One period drives every card, chart and panel below."
    />
  )

  const boundErrors = [...LEDGER_ASSERTION_ERRORS, ...FLEET_RECONCILIATION_ERRORS]
  const assertions = boundErrors.length > 0 && (
    <ErrorBanner
      title="The seed ledger broke a bound"
      message={
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {boundErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      }
    />
  )

  /*
   * §2.2's reconciliation checks Revenue, Utilization and Overdue against
   * their engines, but the ledger's SIZE — its expense ratios, collection
   * timing, three of five fleet day rates — has no engine yet, because the
   * business has not supplied real ones. That gap doesn't fail a check the
   * way a mismatch does; it just means the totals below are a shape, not a
   * confirmed number. Stated plainly rather than left for a reader to
   * discover the hard way. See MODEL_DISCLOSURE's doc comment in data/pulse.ts.
   */
  const disclosure = (
    <div
      style={{
        ...cardStyle,
        padding: '10px 12px',
        display: 'flex',
        gap: 'var(--sp-sm)',
        alignItems: 'flex-start',
        fontSize: 'var(--t-meta)',
        color: 'var(--text2)',
        borderColor: 'var(--border2)',
      }}
    >
      <Icon name="info" size={14} style={{ flexShrink: 0, marginTop: 1, color: 'var(--muted)' }} />
      {MODEL_DISCLOSURE}
    </div>
  )

  if (!figures) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {header}
        {periodBar}
        <EmptyState
          icon={<Icon name="calendar" size={26} />}
          title="This period cannot be reported on"
          description={period?.why ?? 'Pick a period the ledger covers.'}
        />
        <FooterNote />
      </div>
    )
  }

  const activeView: ChartView = money ? view : 'utilization'
  const def = DEFINITIONS[activeView]
  const label = rangeLabel(figures.from, figures.to)
  const compareLabel = compareRange ? rangeLabel(compareRange.from, compareRange.to) : null

  /* ── §5.3's four cards, in the locked order ──────────────────────────── */

  const check = (card: string) => RECONCILIATION.find((r) => r.card === card) ?? null

  /** §2.2 — where a headline differs from its engine, the card shows the gap. */
  function reconciled(c: CardModel): CardModel {
    const r = check(c.label)
    if (!r || r.ok) return c
    return {
      ...c,
      value: 'Does not reconcile',
      sub: `${r.figure} — Pulse says ${r.pulse}, ${r.engine} says ${r.source}`,
      accent: 'danger',
      delta: null,
      discrepancy: true,
    }
  }

  const cards: CardModel[] = []

  if (money) {
    cards.push(
      reconciled({
        label: 'Revenue',
        value: formatMoney(figures.revenue),
        sub: `${figures.days} ${figures.days === 1 ? 'day' : 'days'} · profit ${formatMoney(figures.profit)}`,
        icon: 'dollar',
        accent: 'primary',
        to: '/finance',
        linkLabel: 'Open Finance',
        delta: compare ? pctDelta(figures.revenue, compare.revenue) : null,
        discrepancy: false,
      }),
      reconciled({
        label: 'Cash',
        value: formatMoney(figures.collected),
        /* The share can exceed 100% on a short period and that is not a defect:
           a day's collections settle earlier invoices as well as its own, which
           is the distinction §6.1 exists to keep. */
        sub: `${figures.collectedPct}% of the period's revenue · ${formatMoney(figures.outstanding)} outstanding`,
        icon: 'card',
        accent: 'success',
        to: '/reports/cash-flow',
        linkLabel: 'Open Cash Flow report',
        delta: compare ? pctDelta(figures.collected, compare.collected) : null,
        discrepancy: false,
      }),
    )
  }

  cards.push(
    reconciled({
      label: 'Equipment utilization',
      value: `${figures.utilization}%`,
      sub: 'Unit-days on rent ÷ units owned × days',
      icon: 'chart',
      accent: 'progress',
      to: '/inventory',
      linkLabel: 'Open Inventory',
      delta: compare ? countDelta(figures.utilization, compare.utilization, 'pp higher', 'pp lower', true) : null,
      discrepancy: false,
    }),
    reconciled({
      label: 'Exceptions',
      value: String(figures.overdue + figures.damage),
      sub: `${figures.overdue} overdue · ${figures.damage} damage, open at ${formatAd(figures.to)}`,
      icon: 'alert_triangle',
      accent: 'danger',
      to: '/operations?queue=cases',
      linkLabel: 'Open Cases queue',
      delta: compare
        ? countDelta(figures.overdue + figures.damage, compare.overdue + compare.damage, 'more open', 'fewer open', false)
        : null,
      discrepancy: false,
    }),
  )

  /* ── the one chart (§5.4), in four views ─────────────────────────────── */

  const labels = figures.buckets.map((b) => b.label)
  const pairs = compare ? Math.min(figures.buckets.length, compare.buckets.length) : 0

  /* `drawn` is false whenever an EmptyState stands in for the chart, so the
     axis caption below cannot describe an axis that is not on screen. */
  let drawn = true
  const blank = (title: string, description: string) => {
    drawn = false
    return <EmptyState icon={<Icon name="chart" size={26} />} title={title} description={description} />
  }

  const chart = (() => {
    if (figures.buckets.length < 2) {
      return blank('A single day does not make a trend', 'Widen the period to at least two days to see this chart.')
    }

    if (activeView === 'profit') {
      const groups = figures.buckets.map((b) => ({
        label: b.label,
        values: [toRupees(b.revenue), toRupees(b.expenses), toRupees(b.profit)],
      }))
      const max = Math.max(...groups.flatMap((g) => g.values))
      if (max <= 0) return blank('Nothing to chart', 'No movement in this period.')
      return (
        <GroupedBars
          groups={groups}
          series={['Revenue', 'Expenses', 'Profit']}
          yTicks={ticksFor(max, thousands)}
          format={(v) => formatMoney(Math.round(v * 100) as Paisa)}
        />
      )
    }

    if (activeView === 'cash') {
      const groups = figures.buckets.map((b) => ({
        label: b.label,
        values: [toRupees(b.cashIn), toRupees(b.cashOut)],
      }))
      const max = Math.max(...groups.flatMap((g) => g.values))
      if (max <= 0) return blank('Nothing to chart', 'No cash moved in this period.')
      return (
        <GroupedBars
          groups={groups}
          series={['Cash in', 'Cash out']}
          yTicks={ticksFor(max, thousands)}
          format={(v) => formatMoney(Math.round(v * 100) as Paisa)}
        />
      )
    }

    const isRevenue = activeView === 'revenue'
    const current = figures.buckets.map((b) => (isRevenue ? toRupees(b.revenue) : b.utilization))
    const fmtTick = isRevenue ? thousands : (v: number) => `${Math.round(v)}%`
    const fmtValue = isRevenue ? (v: number) => formatMoney(Math.round(v * 100) as Paisa) : (v: number) => `${Math.round(v)}%`

    /* §9 — the comparison is a second **labelled** series, never merged into
       the first. `Charts` has no two-line component and no dual axis (both
       deliberate), so the paired view is grouped bars on one axis. */
    if (compare && compareLabel && pairs >= 2) {
      const cmp = compare.buckets.map((b) => (isRevenue ? toRupees(b.revenue) : b.utilization))
      const groups = Array.from({ length: pairs }, (_, i) => ({
        label: labels[i] ?? '',
        values: [current[i] ?? 0, cmp[i] ?? 0],
      }))
      const max = Math.max(...groups.flatMap((g) => g.values))
      if (max <= 0) return blank('Nothing to chart', 'No movement in either period.')
      return (
        <GroupedBars
          groups={groups}
          series={[label.ad, compareLabel.ad]}
          yTicks={ticksFor(max, fmtTick)}
          format={fmtValue}
        />
      )
    }

    const max = Math.max(...current)
    if (max <= 0) return blank('Nothing to chart', 'No movement in this period.')
    return (
      <LineChart
        points={current}
        labels={labels}
        yTicks={ticksFor(max, fmtTick)}
        seriesLabel={def.title}
        format={fmtValue}
      />
    )
  })()

  const chartTotal =
    activeView === 'revenue'
      ? formatMoney(figures.revenue)
      : activeView === 'profit'
        ? `Profit ${formatMoney(figures.profit)}`
        : activeView === 'cash'
          ? `Net ${formatMoney(figures.netCash)}`
          : `${figures.utilization}%`

  /* Money-blind roles see the fleet by rental days; ordering by revenue would
     leak the ranking the Revenue column is omitted to hide. */
  const equipment: EquipmentRow[] = money
    ? figures.equipment
    : [...figures.equipment].sort((a, b) => b.rentalDays - a.rentalDays)

  const upcoming = [...UPCOMING].sort((a, b) => a.due.getTime() - b.due.getTime())

  /* §8's eleven families. `to` is set only where a page really exists; §12 also
     keeps the two money families out of a money-blind role's reach. */
  const tabs = TAB_FAMILIES.map((t) => ({
    label: t.label,
    current: t.label === 'Dashboard',
    to: t.to === null ? null : t.money && !money ? null : t.to,
    gated: t.to !== null && t.money && !money,
  }))
  const unbuiltTabs = tabs.filter((t) => t.to === null && !t.gated).map((t) => t.label)
  const gatedTabs = tabs.filter((t) => t.gated).map((t) => t.label)

  // §5.3's cards are dense — icon, label, value, delta and a link — so below
  // desktop they get the same treatment as BookingDetail's facts strip: two
  // across on the 768–1279px tablet band, one across on phone, rather than
  // squeezing all of `cards.length` into a viewport that has no room for it
  // (Law 13/14).
  const cardsCols =
    viewport === 'desktop'
      ? `repeat(${cards.length}, minmax(0,1fr))`
      : viewport === 'tablet'
        ? `repeat(${Math.min(cards.length, 2)}, minmax(0,1fr))`
        : '1fr'

  // The content/rail split only has room on desktop; below 1280 the rail
  // track goes away and `ReflowRail` renders its cards as a plain inline
  // column under the content — Rulings §7's "reflow, not hide". This used to
  // be `Rail` (CollapsibleAside), which put all four rail cards behind a 44px
  // handle on the warehouse tablet, and a fixed `300px` track that could not
  // shrink when the rail collapsed at desktop.
  const bodyCols = railGridColumns

  return (
    <PageShell width="full" className="report-v2">
      {header}
      {assertions}
      {disclosure}
      {periodBar}

      {/* §4.2's preset list stays complete: the ones the engines cannot answer
          are still offered, disabled, and their reason is one click away rather
          than two paragraphs across the top of the page. */}
      {unavailable.length > 0 && (
        <details>
          <summary style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', cursor: 'pointer' }}>
            {disabledPresets.length} presets are unavailable — why?
          </summary>
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'flex-start', marginTop: 6 }}>
            <Icon name="info" size={13} style={{ color: 'var(--muted)', marginTop: 2, flexShrink: 0 }} />
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {unavailable.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
          </div>
        </details>
      )}

      {/* §5.3 — four cards in the locked order, two of them omitted outright
          for a money-blind role rather than masked (§8.3). */}
      <section
        aria-label="Business pulse"
        style={{ display: 'grid', gridTemplateColumns: cardsCols, gap: 'var(--sp-md)' }}
      >
        {cards.map((c) => (
          <KpiCard key={c.label} c={c} />
        ))}
      </section>

      {!money && (
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          Revenue, cash, receivables and every rupee figure on this report are not part of your role's view, so they are
          not loaded onto this page at all.
        </p>
      )}

      {/* §8 — the eleven report families, as the render lays them out. Three of
          them have a page in this build and are links; the rest are drawn in a
          visibly unavailable state with the reason stated below the strip,
          because a tab that goes nowhere is worse than one that admits it. */}
      <nav aria-label="Report families">
        {/* The row gap is no longer the column gap, and the reason is the tap
            areas rather than the look: eleven tabs wrap on any laptop, and a
            30px tab whose target is 44 reaches 7px past its own edge top and
            bottom. At the old symmetric 6px gap the second line's targets
            climbed 8px into the first line's, and the later element in the DOM
            wins a contested point — so a click just under "Inventory" would have
            opened whatever sat below it. 16px is the first step on the 4px grid
            that clears the 14px the two halves need. Columns stay tight at 6:
            every label is wider than 44, so no tab grows sideways. */}
        <div style={{ display: 'flex', columnGap: 6, rowGap: 'var(--sp-lg)', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
          {tabs.map((t) =>
            t.to ? (
              <Link
                key={t.label}
                to={t.to}
                className="tap"
                aria-current={t.current ? 'page' : undefined}
                style={{
                  ...tabStyle,
                  border: `1px solid ${t.current ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                  background: t.current ? 'var(--nav-active-bg)' : 'var(--card)',
                  color: t.current ? 'var(--nav-active-accent)' : 'var(--text2)',
                }}
              >
                {t.label}
              </Link>
            ) : (
              <span
                key={t.label}
                aria-disabled="true"
                style={{
                  ...tabStyle,
                  border: '1px dashed var(--border)',
                  background: 'transparent',
                  /* `--disabled` measures 2.6:1 on the light card and §6 wants
                     4.5:1 read in both themes. The dashed border, the
                     `aria-disabled` and the caption carry the state instead —
                     never the colour alone. */
                  color: 'var(--muted)',
                  cursor: 'not-allowed',
                }}
              >
                {t.label}
              </span>
            ),
          )}
        </div>
        <p style={{ margin: '7px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          {unbuiltTabs.length > 0 && (
            <>
              Not built: {unbuiltTabs.join(' · ')} {/* — Reports §8 names these families; nothing behind them exists in this
              build yet. */}These reports are not available yet. {' '}
            </>
          )}
          {gatedTabs.length > 0 && <>Not in your role&rsquo;s view: {gatedTabs.join(' · ')}.</>}
        </p>
      </nav>

      <div style={{ display: 'grid', gridTemplateColumns: bodyCols, gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <Card
            title={def.title}
            action={
              <>
                <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginRight: 4 }}>
                  {chartTotal}
                </span>
                {money &&
                  VIEW_ORDER.map((v) => {
                    const on = v === activeView
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setView(v)}
                        aria-pressed={on}
                        style={{
                          height: 28,
                          padding: '0 10px',
                          borderRadius: 'var(--r-badge)',
                          border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                          background: on ? 'var(--nav-active-bg)' : 'var(--card2)',
                          color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                          fontSize: 'var(--t-meta)',
                          fontWeight: 600,
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {VIEW_LABEL[v]}
                      </button>
                    )
                  })}
              </>
            }
          >
            {chart}

            {drawn && (
              <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                {activeView === 'utilization'
                  ? 'Axis in per cent of the rentable fleet — hover a mark for the exact figure.'
                  : /* Axis in thousands of rupees — hover a mark for the exact figure, which is the one lib/money prints. */ "Amounts are shown in thousands of rupees. Hover a mark for the exact amount."}
              </p>
            )}

            {/* §9 — the comparison always states its own range. */}
            {compareOn && (
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: '1px solid var(--border)',
                  fontSize: 'var(--t-meta)',
                  color: 'var(--text2)',
                }}
              >
                {compare && compareLabel ? (
                  <>
                    <strong style={{ color: 'var(--text)' }}>Compared with {compareLabel.ad}</strong>
                    {' — '}
                    {money
                      ? `revenue ${formatMoney(compare.revenue)} · expenses ${formatMoney(compare.expenses)} · profit ${formatMoney(compare.profit)} · net cash ${formatMoney(compare.netCash)} · utilization ${compare.utilization}%`
                      : `utilization ${compare.utilization}% · ${compare.overdue + compare.damage} exceptions open`}
                  </>
                ) : (
                  <>
                    Comparison unavailable — the {figures.days} days before this period fall outside the seed ledger, so
                    there is nothing to compare against.
                  </>
                )}
              </div>
            )}

            {/* §5.1 — every report carries its definition. */}
            <dl
              style={{
                margin: '10px 0 0',
                paddingTop: 10,
                borderTop: '1px solid var(--border)',
                display: 'grid',
                gridTemplateColumns: 'max-content minmax(0,1fr)',
                columnGap: 12,
                rowGap: 4,
                fontSize: 'var(--t-meta)',
              }}
            >
              {[
                ['What it shows', def.shows],
                ['Formula', def.formula],
                ['Source', def.source],
                ['Period basis', def.basis],
                ['Excludes', def.excludes],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{k}</dt>
                  <dd style={{ margin: 0, color: 'var(--text2)' }}>{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card
            title="Top equipment"
            action={
              <Link
                to="/reports/inventory"
                style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}
              >
                View full inventory report →
              </Link>
            }
            bodyStyle={{ padding: 0 }}
          >
            <DataTableShell ariaLabel="Equipment utilization" data-table-scroll className="report-table-shell" style={{ overflowX: 'auto' }}>
              <table className="report-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    <th style={th}>Equipment</th>
                    {money && <th style={{ ...th, textAlign: 'right' }}>Revenue</th>}
                    <th style={{ ...th, textAlign: 'right' }}>Rental days</th>
                    <th style={{ ...th, width: 190 }}>Utilization</th>
                  </tr>
                </thead>
                <tbody>
                  {equipment.map((r) => (
                    <tr key={r.name} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                      {money && (
                        <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {formatMoney(r.revenue)}
                        </td>
                      )}
                      <td className="figure" style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {r.rentalDays}
                        {/* §5.3 — the ceiling is on the row, so a rental-day count
                            that exceeds it cannot pass unnoticed again. */}
                        <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 400 }}>
                          of {r.capacity} unit-days
                        </div>
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                          <div aria-hidden style={{ flex: 1, height: 6, borderRadius: 'var(--r-badge)', background: 'var(--card2)', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(r.utilization, 100)}%`, height: '100%', background: BRAND.success, borderRadius: 'var(--r-badge)' }} />
                          </div>
                          <span className="figure" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {r.utilization}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableShell>
          </Card>

          {money && (
            <Card
              title="Upcoming payments & receivables"
              action={
                <Link to="/finance" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}>
                  View all in Finance →
                </Link>
              }
              bodyStyle={{ padding: 0 }}
            >
              <DataTableShell ariaLabel="Upcoming payments and receivables" data-table-scroll className="report-table-shell" style={{ overflowX: 'auto' }}>
                <table className="report-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Type', 'Reference', 'Client / Vendor', 'Due date', 'Amount', 'Status'].map((h) => (
                        <th key={h} style={{ ...th, textAlign: h === 'Amount' ? 'right' : 'left' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.map((u) => {
                      /* §4.3 — one clock. Status is derived from the period's
                         as-of date, never typed into the row. */
                      const status = dueStatus(u.due, figures.to)
                      const tok = STATUS[status.tone]
                      const bs = toBs(u.due)
                      return (
                        <tr key={u.reference} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={td}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                              <Icon name={u.kind === 'Receivable' ? 'receipt' : 'card'} size={13} />
                              {u.kind}
                            </span>
                          </td>
                          <td className="identifier" style={{ ...td, fontWeight: 600 }}>
                            {u.reference}
                          </td>
                          <td style={{ ...td, color: 'var(--text2)' }}>{u.party}</td>
                          <td style={td}>
                            <div>{formatAd(u.due)}</div>
                            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{bs ? formatBs(bs) : '—'}</div>
                          </td>
                          <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {formatMoney(u.amount)}
                          </td>
                          <td style={td}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                height: 20,
                                padding: '0 8px',
                                borderRadius: 'var(--r-badge)',
                                background: tok.bg,
                                color: tok.fg,
                                fontSize: 'var(--t-meta)',
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <Icon name={status.tone === 'danger' ? 'alert_triangle' : 'timer'} size={11} fill />
                              {status.text}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </DataTableShell>
              <p style={{ margin: 0, padding: '10px 12px', borderTop: '1px solid var(--border)', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                Ageing is measured from {formatAd(figures.to)}{/* , the period's last day — the one clock this page uses (§4.3). */}, the period's last day — the one clock this page uses . </p>
            </Card>
          )}
        </div>

        <ReflowRail width={300}>
          <Card title="Report summary">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <RailRow label="Report period" value={label.bs ?? 'BS unavailable'} sub={label.ad} />
              {label.bsNote && (
                <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{label.bsNote}</p>
              )}
              <RailRow
                label="Data compared with"
                value={compareLabel ? compareLabel.ad : 'None'}
                sub={compareOn && !compareLabel ? 'Outside the seed ledger' : undefined}
              />
              <RailRow label="Generated by" value={user ? `${user.name} · ${user.role}` : 'Not signed in'} />
              <RailRow label="Generated on" value={formatAd(TODAY)} sub="Asia/Kathmandu" />
              <RailRow
                label="Data freshness"
                value={figures.live ? 'Live' : 'Nightly snapshot'}
                sub={figures.live ? 'The period is still open' : `Closed ${formatAd(figures.to)}`}
              />
              <RailRow label="Revenue recognition" value="Spread across rental days" sub={PERIOD_BASIS} />
            </div>
            <div style={{ marginTop: 11 }}>
              <Button icon="calendar" onClick={() => periodRef.current?.focus()}>
                Edit date range
              </Button>
            </div>
          </Card>

          {/* §2.2 — the assertion runs on load and is visible, not buried. */}
          <Card title="Reconciliation">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {RECONCILIATION.filter((r) => money || r.card !== 'Revenue').map((r) => (
                <div key={r.figure} style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'flex-start' }}>
                  <Icon
                    name={r.ok ? 'check' : 'error'}
                    size={14}
                    fill
                    style={{ marginTop: 2, flexShrink: 0, color: r.ok ? 'var(--success-text)' : 'var(--danger-text)' }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{r.figure}</div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                      {r.ok ? `Matches ${r.engine} — ${r.source}` : `Pulse ${r.pulse} · ${r.engine} ${r.source}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              Reports never defines a metric — it reads the engine that owns it, and says so when the two disagree.
            </p>
          </Card>

          {/* §12 gives the floor no scheduling rights and every schedule here
              delivers a financial report, so the card is not built for a
              money-blind session rather than built and emptied. */}
          {money && (
            <Card title="Scheduled reports">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {SCHEDULES.map((s) => (
                  <div key={s.name} style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'flex-start' }}>
                    <Icon name="refresh" size={13} style={{ marginTop: 2, flexShrink: 0, color: 'var(--muted)' }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{s.name}</div>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                        {s.cadence} · {s.recipients}
                      </div>
                      {/* §11 — every schedule shows its last run and its result. */}
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Last run {s.lastRun}</div>
                    </div>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        height: 20,
                        padding: '0 8px',
                        borderRadius: 'var(--r-badge)',
                        background: s.lastResult === 'Delivered' ? STATUS.in.bg : STATUS.danger.bg,
                        color: s.lastResult === 'Delivered' ? STATUS.in.fg : STATUS.danger.fg,
                        fontSize: 'var(--t-meta)',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {s.lastResult}
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                {/* Read-only. Creating, editing and retrying a schedule is Reports §11 and is not built, so no control is drawn
                for it. */}Read-only. Schedule editing is not available yet. </p>
            </Card>
          )}

          <Card title="Other reports">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-sm)' }}>
              {(money
                ? [
                    { to: '/reports/cash-flow', label: 'Cash flow', icon: 'chart' as IconName },
                    { to: '/reports/working-capital', label: 'Working capital', icon: 'card' as IconName },
                    { to: '/reports/expenses', label: 'Expenses', icon: 'receipt' as IconName },
                    { to: '/reports/clients', label: 'Clients', icon: 'users' as IconName },
                  ]
                : [
                    { to: '/reports/inventory', label: 'Inventory', icon: 'box' as IconName },
                    { to: '/operations?queue=cases', label: 'Cases', icon: 'alert_triangle' as IconName },
                  ]
              ).map((a) => (
                <Link key={a.to} to={a.to} className="lift" style={quickStyle}>
                  <Icon name={a.icon} size={17} />
                  {a.label}
                </Link>
              ))}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              {/* Saved reports and the custom builder are Reports §10 and are not built; these are the reports that exist
              today. */}Saved reports and custom reports are not available yet. </p>
          </Card>
        </ReflowRail>
      </div>

      <FooterNote
        extra={[
          /* Every amount is integer paisa — see lib/money.ts */ "Amounts shown in rupees",
          'Reports reads its figures from the owning engine; it never defines a metric',
        ]}
      />
    </PageShell>
  )
}

/* ── rail row ──────────────────────────────────────────────────────────── */

function RailRow({ label, value, sub }: { label: string; value: string; sub?: string | undefined }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 'var(--t-meta)' }}>
      <span style={{ color: 'var(--text2)', flexShrink: 0 }}>{label}</span>
      <span style={{ marginLeft: 'auto', textAlign: 'right', minWidth: 0 }}>
        <span className="figure" style={{ display: 'block', fontWeight: 600, color: 'var(--text)' }}>
          {value}
        </span>
        {sub && <span style={{ display: 'block', color: 'var(--muted)' }}>{sub}</span>}
      </span>
    </div>
  )
}

const quickStyle = {
  ...cardStyle,
  padding: '11px 8px',
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  gap: 6,
  fontSize: 'var(--t-meta)',
  fontWeight: 600,
  color: 'var(--text2)',
  textDecoration: 'none',
  textAlign: 'center' as const,
}

/* ── §11 export ────────────────────────────────────────────────────────── */

/**
 * *"Every export prints the period, the comparison range, the filters applied
 * and the generation timestamp in its header, so a printed report can be
 * verified later."*
 *
 * This used to be a whole exporter — its own quoting rule, its own Blob, its own
 * anchor click, its own filename. All four now belong to `ReportToolbar`, which
 * writes the report name, the period, the compare state, the timestamp and the
 * operator ahead of what this returns, and quotes every cell through
 * `lib/csv.ts`'s `csvCell` rather than a fourth hand-written copy of the rule.
 * What is left here is what only Pulse knows: the three provenance lines the
 * shared header does not model, and the same grouping the page rendered, so the
 * export and the screen cannot drift.
 *
 * PDF and Excel are the other two formats §11 asks for and neither is built —
 * no button is drawn for them.
 */
function pulseCsvBody(f: PeriodFigures, compareRange: { from: Date; to: Date } | null): ReportCsvRow[] {
  const compared = compareRange ? rangeLabel(compareRange.from, compareRange.to) : null

  return [
    ['Compared with', compared ? `${compared.bs ? `${compared.bs} / ` : ''}${compared.ad}` : 'None'],
    ['Filters', 'None — Pulse reports the whole business'],
    ['Revenue recognition', PERIOD_BASIS],
    [
      'Data freshness',
      f.live ? 'Live — the period is still open' : `Snapshot, refreshed nightly (period closed ${formatAd(f.to)})`,
    ],
    [],
    ['Figure', 'Value'],
    ['Revenue', formatMoney(f.revenue)],
    ['Expenses', formatMoney(f.expenses)],
    ['Profit', formatMoney(f.profit)],
    ['Collected', formatMoney(f.collected)],
    ['Outstanding receivable', formatMoney(f.outstanding)],
    ['Cash in', formatMoney(f.cashIn)],
    ['Cash out', formatMoney(f.cashOut)],
    ['Net cash', formatMoney(f.netCash)],
    ['Deposits held', formatMoney(f.deposits)],
    ['Equipment utilization', `${f.utilization}%`],
    ['Exceptions open', String(f.overdue + f.damage)],
    [],
    ['Equipment', 'Revenue', 'Rental days', 'Capacity (unit-days)', 'Utilization'],
    ...f.equipment.map((e): ReportCsvRow => [
      e.name,
      formatMoney(e.revenue),
      String(e.rentalDays),
      String(e.capacity),
      `${e.utilization}%`,
    ]),
    [],
    ['Bucket', 'Revenue', 'Expenses', 'Profit', 'Cash in', 'Cash out', 'Utilization'],
    ...f.buckets.map((b): ReportCsvRow => [
      b.label,
      formatMoney(b.revenue),
      formatMoney(b.expenses),
      formatMoney(b.profit),
      formatMoney(b.cashIn),
      formatMoney(b.cashOut),
      `${b.utilization}%`,
    ]),
  ]
}
