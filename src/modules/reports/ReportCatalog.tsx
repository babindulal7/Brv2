import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, KpiStrip, FooterNote } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import type { Kpi } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { ErrorBanner } from '../../components/ui/StateViews'
import { SearchInput } from '../../components/ui/SearchInput'
import { formatMoney } from '../../lib/money'
import { useViewport } from '../../lib/device'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { financeRestriction } from '../../lib/queries/finance'
import { catColor } from '../../components/ui/Charts'
import {
  PERIODS,
  DEFAULT_PERIOD,
  LEDGER_COVERAGE,
  MODEL_DISCLOSURE,
  figuresFor,
  rangeLabel,
} from '../../data/pulse'
import type { PeriodFigures } from '../../data/pulse'
import { GROUPS, REPORTS, CATALOG_ERRORS, reportsIn, type CatalogReport, type GroupKey } from './catalog'
import { ReportTemplate } from './ReportTemplate'
import Pulse from './Pulse'
import ExpenseReports from './ExpenseReports'
import ClientReports from './ClientReports'
import PromotionsReports from './PromotionsReports'
import StaffReports from './StaffReports'
import InventoryReports from './InventoryReports'
import ProductReports from './ProductReports'
import EquipmentPerformance from './EquipmentPerformance'
import ForecastingReports from './ForecastingReports'
import CashFlowReport from './CashFlowReport'
import WorkingCapital from './WorkingCapitalReport'
import RentalReports from './RentalReports'
import OperationsReports from './OperationsReports'
import DamageMaintenanceReports from './DamageMaintenanceReports'
import SalesVatReports from './SalesVatReports'
import ActivityReports from './ActivityReports'
import AssetRoiReport from './AssetRoiReport'
import RevenueReport from './RevenueReport'
import CasesReport from './CasesReport'
import CustomReport from './CustomReport'
import './reports.css'

const DEDICATED_REPORTS: Record<string, React.ComponentType> = {
  '/reports/pulse': Pulse,
  '/reports/revenue': RevenueReport,
  '/reports/expenses': ExpenseReports,
  '/reports/clients': ClientReports,
  '/reports/promotions': PromotionsReports,
  '/reports/staff': StaffReports,
  '/reports/inventory': InventoryReports,
  '/reports/products': ProductReports,
  '/reports/equipment-performance': EquipmentPerformance,
  '/reports/forecasting': ForecastingReports,
  '/reports/cash-flow': CashFlowReport,
  '/reports/working-capital': WorkingCapital,
  '/reports/rentals': RentalReports,
  '/reports/operations': OperationsReports,
  '/reports/damage-maintenance': DamageMaintenanceReports,
  '/reports/cases': CasesReport,
  '/reports/sales': SalesVatReports,
  '/reports/vat-tax': SalesVatReports,
  '/reports/activity': ActivityReports,
  '/reports/asset-roi': AssetRoiReport,
  '/reports/custom': CustomReport,
}

/**
 * # `09_FINANCE.md` §9.6 — the Report Catalog, the way into all 43
 *
 * ```
 * │ Finance ▸ Reports                      [Simple ◉ | Detailed ○] │
 * │                                        [🔍 find a report]      │
 * │ SIMPLE (default)                                               │
 * │ ┌────────┐┌────────┐┌────────┐┌────────┐  the locked Pulse row │
 * │ │Revenue ││Cash    ││Utilis. ││Except. │                       │
 * │ ┌──────────────────────────────────────┐                       │
 * │ │ one revenue chart                    │  + top-8 ROI table    │
 * │ └──────────────────────────────────────┘  + 3 plain sentences  │
 * │ DETAILED — 10 groups, 43 reports                               │
 * ```
 *
 * ## 43, not the 45 §9.6 prints
 *
 * `WIREFRAME_RULINGS_2026-08-12.md` §11.3 deduplicated the register: Profit &
 * Loss lives in 01 only, `05 Outstanding` collapsed into `06 Receivables`, and
 * the Payments and Expenses entries **deep-link into their Finance tabs rather
 * than duplicating them**. The count on this page is read from `REPORTS.length`
 * rather than typed, so the copy cannot disagree with the register, and
 * `catalog.ts`'s `CATALOG_ERRORS` asserts the ruled numbers at module load —
 * the banner below is what a drift looks like.
 *
 * A tab deep-link is drawn as a link that names its tab, never as a report tile
 * (see `ReportRow`): a reader must be able to tell "this opens the Payments
 * tab" from "this opens a report" without clicking either.
 *
 * ## The catalog holds no figures of its own
 *
 * Every number on the Simple view is a projection of `data/pulse.ts`'s
 * `figuresFor(from, to)` — the single dated ledger this module already had.
 * `CONFLICTS.md` §09.7: *"Do not add a 14th seed module for the catalog… or the
 * template will be shared while the numbers stay 45 independent inventions."*
 * `catalog.ts` beside this file is a **register** (names, groups, routes,
 * projections) and contains no amount at all.
 *
 * ## Selecting a report opens the §9.7 template in place
 *
 * Not a route change. `App.tsx` is not this task's file, and more importantly
 * §9.6 calls itself *"the way into all 45"* — a catalog that navigates away is a
 * link list, which is the defect line 3 of the spec names. The breadcrumb trail
 * inside `ReportTemplate` returns here. **No Back button** —
 * `WIREFRAME_RULINGS_2026-08-12.md` §4.
 *
 * The ~9 reports that already have a full screen keep it: their tile links out
 * as well, so a deep link that exists is never hidden behind an in-page view.
 *
 * ## Three layouts
 *
 * - **Desktop ≥1280** — three group columns.
 * - **Tablet 768–1279** — *"2 group columns"*.
 * - **Phone <768** — *"accordion, one group open at a time"*, which is a real
 *   behaviour and not a narrow grid: opening a group closes the last.
 */

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
 * `height` on a table cell behaves as a MINIMUM, so this is the §7.3 row floor
 * ("rows >= 56px") written with the token instead of padding arithmetic; the
 * horizontal padding stays where it was.
 *
 * The reason is tap accuracy, not density. A 44px hit area does not fit inside
 * a row of 10+~18+10, so it overhangs the rows above and below, and because an
 * absolutely-positioned target wins the hit test the LATER row takes the tap in
 * that band. The equipment table here is read-only, but the floor is what makes
 * a row safe for the first control it is ever given, and the `<th scope="row">`
 * model cell spreads this same object so the whole row lifts, not half of it.
 */
const td = { height: 'var(--row-min-h)', padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', borderBottom: '1px solid var(--border)' }

/** §9.6's "the locked Pulse row" — four tiles, and the fourth is a count. */
function pulseKpis(f: PeriodFigures): Kpi[] {
  return [
    { label: 'Revenue', value: formatMoney(f.revenue), icon: 'dollar', accent: 'success', note: `${f.days} days` },
    {
      label: 'Cash',
      value: formatMoney(f.netCash),
      icon: 'card',
      accent: 'primary',
      note: `${formatMoney(f.cashIn)} in · ${formatMoney(f.cashOut)} out`,
    },
    { label: 'Utilisation', value: `${f.utilization}%`, icon: 'chart', accent: 'progress', note: 'of fleet capacity' },
    {
      /* A count, not money — the one tile a money-blind role could be shown if
         the catalog is ever opened to them. It is not today (the whole page is
         behind `financeRestriction`), but the shape is kept deliberately: Law 6
         wants a strip that does not go empty, not four money figures. */
      label: 'Exceptions',
      value: `${f.overdue + f.damage}`,
      icon: 'alert_triangle',
      accent: f.overdue + f.damage > 0 ? 'danger' : 'neutral',
      note: `${f.overdue} overdue · ${f.damage} damage`,
    },
  ]
}

export interface ReportCatalogProps {
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

export function ReportCatalog({
  loading: propLoading,
  error: propError,
  onRetry: propOnRetry,
}: ReportCatalogProps = {}) {
  const viewport = useViewport()
  const money = useCanViewMoney()
  const restriction = financeRestriction(money)

  const [detailed, setDetailed] = useState(false)
  const [query, setQuery] = useState('')
  const [openReport, setOpenReport] = useState<CatalogReport | null>(null)
  /** Phone only — §9.6: "accordion, one group open at a time". */
  const [openGroup, setOpenGroup] = useState<GroupKey | null>('01')
  const [periodKey, setPeriodKey] = useState<string>(DEFAULT_PERIOD)

  const period = PERIODS.find((p) => p.key === periodKey) ?? PERIODS[0]
  const range = period?.range ?? null
  const figures = useMemo(() => (range && money ? figuresFor(range.from, range.to) : null), [range, money])
  const dates = range ? rangeLabel(range.from, range.to) : null

  /**
   * §9.6's `[🔍 find a report]`. Matches the report name and its group name, so
   * "finance" finds the seven in group 06 and "vat" finds the one. A search
   * switches to the flat result list regardless of the Simple/Detailed toggle —
   * somebody typing a report name is looking for that report, not for a view.
   */
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return REPORTS.filter((r) => {
      const g = GROUPS.find((x) => x.key === r.group)
      return r.name.toLowerCase().includes(q) || (g ? `${g.key} ${g.name}`.toLowerCase().includes(q) : false)
    })
  }, [query])

  if (openReport) {
    const DedicatedComponent = openReport.route ? DEDICATED_REPORTS[openReport.route] : undefined
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <div>
          <button
            type="button"
            onClick={() => setOpenReport(null)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Icon name="chevron_left" size={13} />
            Back to Report Catalog
          </button>
        </div>
        {DedicatedComponent ? (
          <DedicatedComponent />
        ) : (
          <ReportTemplate report={openReport} onBackToCatalog={() => setOpenReport(null)} />
        )}
      </div>
    )
  }

  const columns = viewport === 'desktop' ? 3 : viewport === 'tablet' ? 2 : 1

  return (
    <div className="report-v2">
      {/* The register's own reconciliation. `data/pulse.ts` and
          `data/inventory.ts` use the same shape: assert, and show the failure on
          the page rather than in a console nobody reads. */}
      {CATALOG_ERRORS.length > 0 && (
        <ErrorBanner title="The report register does not reconcile" message={CATALOG_ERRORS.join(' ')} />
      )}

      {/* §9.6 header row — the toggle and the search. */}
      <div className="report-toolbar-row">
        <div
          role="group"
          aria-label="Report view"
          className="report-view-toggle"
        >
          {([['Simple', false], ['Detailed', true]] as const).map(([label, isDetailed]) => {
            const on = detailed === isDetailed
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => setDetailed(isDetailed)}
                className={`report-toggle-btn ${on ? 'is-active' : ''}`}
              >
                {label}
              </button>
            )
          })}
        </div>

        <div className="report-search-shell">
          <SearchInput
            value={query}
            onChange={setQuery}
            onClear={() => setQuery('')}
            placeholder="Find a report…"
            aria-label="Find a report by name or group"
          />
        </div>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>
          Period
          <select
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value)}
            className="report-period-select"
          >
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key} disabled={p.range === null} title={p.why ?? undefined}>
                {p.label}
                {p.range === null ? ' — unavailable' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Law 6 — the whole catalog is money. `restricted` outranks every other
          state in `PageBody`, so a money-blind session is told which role to ask
          rather than shown an empty catalog. */}
      <PageBody
        noun="reports"
        loading={propLoading}
        error={propError}
        onRetry={propOnRetry}
        skeleton="table"
        {...restriction}
      >
        {matches ? (
          <Card title={`${matches.length} report${matches.length === 1 ? '' : 's'} matching “${query.trim()}”`} bodyStyle={{ padding: 0 }}>
            {matches.length === 0 ? (
              <p style={{ margin: 0, padding: 'var(--sp-md)', fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.6 }}>
                No report in the register of {REPORTS.length} {/* has that name. The four Sales &amp; Marketing reports were cut —
                §9.6: no */}has that name. The four Sales &amp; Marketing reports were cut — : no <span className="identifier">leads</span>, <span className="identifier">campaigns</span>,{' '}
                <span className="identifier">conversion</span> or <span className="identifier">acquisition</span> {/* table exists.
                Two more names moved rather than went: rulings §11.3 collapsed */}table exists. Two more names moved rather than went: rulings collapsed <strong>Outstanding</strong> into{' '}
                <strong>06 Receivables</strong>, and <strong>Profit &amp; Loss</strong> now lives in <strong>01 Overview</strong> only.
              </p>
            ) : (
              matches.map((r) => <ReportRow key={r.key} report={r} onOpen={() => setOpenReport(r)} showGroup />)
            )}
          </Card>
        ) : detailed ? (
          <DetailedView
            columns={columns}
            phone={viewport === 'phone'}
            openGroup={openGroup}
            setOpenGroup={setOpenGroup}
            onOpen={setOpenReport}
          />
        ) : (
          <SimpleView figures={figures} whyNoFigures={period?.why ?? null} />
        )}
      </PageBody>

      <FooterNote
        extra={[
          dates ? (dates.bs ? `As of ${dates.ad} · BS ${dates.bs}` : `As of ${dates.ad}`) : `Ledger covers ${LEDGER_COVERAGE}`,
          `${REPORTS.length} reports. Choose a report to open its details.`,
        ]}
      />
    </div>
  )
}

/* ── SIMPLE ──────────────────────────────────────────────────────────────── */

function SimpleView({ figures, whyNoFigures }: { figures: PeriodFigures | null; whyNoFigures: string | null }) {
  if (!figures) {
    return (
      <Card title="Not tracked yet">
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.6 }}>
          {whyNoFigures ?? 'The selected period is outside the ledger.'} The ledger covers {LEDGER_COVERAGE}{/* . No figure
          is shown rather than a zero — §9.7. */}. No figure is shown rather than a zero — </p>
      </Card>
    )
  }

  const top = [...figures.equipment].sort((a, b) => (b.revenue as number) - (a.revenue as number)).slice(0, 8)
  const maxRevenue = Math.max(...figures.buckets.map((b) => b.revenue as number), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <KpiStrip items={pulseKpis(figures)} columns={4} />

      {/* ONE revenue chart. Law 11 — the bars are decoration and every value is
          printed beside its label, so the chart is never the only statement. */}
      <Card title="Revenue">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {figures.buckets.map((b) => (
            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 78, flexShrink: 0, textAlign: 'right', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                {b.label}
              </span>
              <span aria-hidden style={{ flex: 1, minWidth: 0, height: 14, background: 'var(--card2)', borderRadius: 3 }}>
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${((b.revenue as number) / maxRevenue) * 100}%`,
                    minWidth: 2,
                    background: catColor(3),
                    borderRadius: 3,
                  }}
                />
              </span>
              <span className="figure" style={{ width: 104, flexShrink: 0, textAlign: 'right', fontSize: 'var(--t-meta)' }}>
                {formatMoney(b.revenue)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/*
        §9.6 draws a "top-8 ROI table". **It is not ROI and is not labelled as
        one.** Return on investment needs what each unit cost, and there is no
        purchase-cost column anywhere — the same gap `catalog.ts` records for
        `03 Equipment Lifecycle` and `10 Investment Decisions`, and the same one
        `data/addEquipment.ts:207` refuses to invent asset lives for.

        Revenue and utilisation per model are real and answer most of what the
        tile is for, so they are shown under their own names. Printing them
        under "ROI" would be a fabricated figure with a correct number in it,
        which is the hardest kind to catch.
      */}
      <Card title="Top 8 models by revenue">
        <DataTableShell ariaLabel="Top 8 models by revenue" data-table-scroll style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--th-bg)' }}>
                <th style={th} scope="col">Model</th>
                <th style={{ ...th, textAlign: 'right' }} scope="col">Revenue</th>
                <th style={{ ...th, textAlign: 'right' }} scope="col">Rental days</th>
                <th style={{ ...th, textAlign: 'right' }} scope="col">Utilisation</th>
              </tr>
            </thead>
            <tbody>
              {top.map((e) => (
                <tr key={e.name}>
                  <th style={{ ...td, fontWeight: 400 }} scope="row">{e.name}</th>
                  <td className="figure" style={{ ...td, textAlign: 'right' }}>{formatMoney(e.revenue)}</td>
                  <td className="figure" style={{ ...td, textAlign: 'right' }}>{e.rentalDays}</td>
                  <td className="figure" style={{ ...td, textAlign: 'right' }}>{e.utilization}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>
        <p style={{ margin: '11px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.6 }}>
          Ordered by revenue, not by return: no purchase-cost column exists, so return on investment is{' '}
          <strong>not tracked yet</strong> rather than approximated by revenue.
        </p>
      </Card>

      {/* "+ 3 plain sentences" — derived, so they move with the period. */}
      <Card title="In three sentences">
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 'var(--t-meta)', color: 'var(--text)', lineHeight: 1.8 }}>
          <li>
            The business billed {formatMoney(figures.revenue)} over {figures.days} days and has collected{' '}
            {formatMoney(figures.collected)} of it — {figures.collectedPct}%.
          </li>
          <li>
            Cash moved {formatMoney(figures.netCash)} net: {formatMoney(figures.cashIn)} in against{' '}
            {formatMoney(figures.cashOut)} out, with {formatMoney(figures.deposits)} of client deposits held separately and
            counted in neither.
          </li>
          <li>
            The fleet ran at {figures.utilization}%, and {figures.overdue + figures.damage} exceptions are open —{' '}
            {figures.overdue} overdue and {figures.damage} damage.
          </li>
        </ol>
        <p style={{ margin: '11px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.6 }}>{MODEL_DISCLOSURE}</p>
      </Card>
    </div>
  )
}

/* ── DETAILED ────────────────────────────────────────────────────────────── */

function DetailedView({
  columns,
  phone,
  openGroup,
  setOpenGroup,
  onOpen,
}: {
  columns: number
  phone: boolean
  openGroup: GroupKey | null
  setOpenGroup: (g: GroupKey | null) => void
  onOpen: (r: CatalogReport) => void
}) {
  return (
    <div
      className="report-catalog-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: 'var(--sp-md)',
        alignItems: 'start',
      }}
    >
      {GROUPS.map((g) => {
        const reports = reportsIn(g.key)
        /* Phone — one group open at a time. At tablet and desktop every group
           is open, because a grid of collapsed headers is a worse table of
           contents than the list itself. */
        const open = phone ? openGroup === g.key : true
        return (
          <Card key={g.key} bodyStyle={{ padding: 0 }}>
            <button
              type="button"
              onClick={() => (phone ? setOpenGroup(open ? null : g.key) : undefined)}
              aria-expanded={phone ? open : undefined}
              disabled={!phone}
              className="report-group-header"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-sm)',
                width: '100%',
                minHeight: 44,
                padding: '10px 14px',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
                fontFamily: 'inherit',
                fontSize: 'var(--t-ui)',
                fontWeight: 700,
                textAlign: 'left',
                cursor: phone ? 'pointer' : 'default',
              }}
            >
              <span className="figure report-group-code" style={{ color: 'var(--muted)' }}>{g.key}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{g.name}</span>
              <span className="figure report-group-count" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>
                {reports.length}
              </span>
              {phone && <Icon name={open ? 'chevron_up' : 'chevron_down'} size={13} />}
            </button>
            {open && reports.map((r) => <ReportRow key={r.key} report={r} onOpen={() => onOpen(r)} />)}
          </Card>
        )
      })}
    </div>
  )
}

/** The row's own metrics, shared by the report button and the tab link so the
    two are the same size and both clear Law 15's 44px floor at every width. */
const rowBox = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--sp-sm)',
  flex: 1,
  minWidth: 0,
  minHeight: '44px',
  padding: '8px 14px',
  fontFamily: 'inherit',
  fontSize: 'var(--t-meta)',
  textAlign: 'left' as const,
  cursor: 'pointer',
}

/**
 * One report in the catalog.
 *
 * Law 11 — a report with no source is not marked by a colour or a dimmed row.
 * It carries the words "not tracked yet" and an icon, and it stays clickable:
 * the §9.7 template's job in that case is to say *why*, and hiding the row
 * would leave the register looking shorter than the count the register asserts.
 *
 * **Rulings §11.3 — two rows in group 06 are not reports.** Payments and
 * Expenses each *are* a Finance tab, and the ruling is that the register entry
 * deep-links into that tab rather than duplicating it. Such a row is drawn as a
 * link, says which tab it opens in words beside an arrow — Law 11 again, never
 * a colour or a different weight alone — and never opens the §9.7 template. A
 * reader can tell it from a report row without hovering anything.
 */
function ReportRow({ report, onOpen, showGroup = false }: { report: CatalogReport; onOpen: () => void; showGroup?: boolean }) {
  const untracked = report.projection === null && report.route === null && !report.financeTab
  const group = GROUPS.find((g) => g.key === report.group)

  const name = (
    <span style={{ flex: 1, minWidth: 0 }}>
      {report.name}
      {showGroup && group && <span style={{ color: 'var(--muted)' }}>{` · ${group.key} ${group.name}`}</span>}
    </span>
  )

  /* Rulings §11.3 — the tab deep-link. `financeTab` implies a route;
     `CATALOG_ERRORS` refuses the register otherwise, and the banner at the top
     of this page says so, but the guard is kept here too so a bad entry renders
     as an ordinary row rather than as a link to `undefined`. */
  if (report.financeTab && report.route) {
    return (
      <div className="report-row-shell" style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
        <Link
          to={report.route}
          aria-label={`${report.name} — opens the ${report.financeTab} tab in Finance`}
          style={{ ...rowBox, color: 'var(--text)', textDecoration: 'none' }}
        >
          <Icon name="arrow_right" size={11} style={{ color: 'var(--link)', flexShrink: 0 }} />
          {name}
          <span
            className="report-tab-badge"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0,
              padding: '0 7px',
              height: 20,
              borderRadius: 'var(--r-badge)',
              border: '1px solid var(--border)',
              background: 'var(--card2)',
              color: 'var(--link)',
              fontSize: 'var(--t-meta)',
            }}
          >
            {`Opens the ${report.financeTab} tab`}
          </span>
        </Link>
      </div>
    )
  }

  return (
    <div className="report-row-shell" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', borderBottom: '1px solid var(--border)' }}>
      <button
        type="button"
        onClick={onOpen}
        style={{ ...rowBox, border: 'none', background: 'transparent', color: 'var(--text)' }}
      >
        <Icon name="dot" size={11} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        {name}
        {untracked && (
          <span
            className="report-untracked-badge"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              flexShrink: 0,
              padding: '0 7px',
              height: 20,
              borderRadius: 'var(--r-badge)',
              border: '1px solid var(--border)',
              background: 'var(--card2)',
              color: 'var(--text2)',
              fontSize: 'var(--t-meta)',
            }}
          >
            <Icon name="info" size={11} />
            Not tracked yet
          </span>
        )}
        {report.unresolved && (
          <span title={report.unresolved} style={{ flexShrink: 0, color: 'var(--muted)', display: 'inline-flex' }}>
            <Icon name="flag" size={12} />
          </span>
        )}
      </button>
    </div>
  )
}

export default ReportCatalog
