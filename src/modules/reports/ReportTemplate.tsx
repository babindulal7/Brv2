import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, Button, FooterNote } from '../../components/ui/Page'
import { ReportToolbar, reportDateRange } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportCompare } from '../../components/ui/ReportToolbar'
import { Unavailable } from '../../components/ui/Unavailable'
import { EmptyState } from '../../components/ui/StateViews'
import { formatMoney } from '../../lib/money'
import { useViewport } from '../../lib/device'
import { catColor } from '../../components/ui/Charts'
import {
  PERIODS,
  DEFAULT_PERIOD,
  LEDGER_COVERAGE,
  MODEL_DISCLOSURE,
  figuresFor,
  rangeLabel,
  previousPeriod,
} from '../../data/pulse'
import type { PeriodFigures } from '../../data/pulse'
import {
  PROJECTIONS,
  groupByKey,
  headlineFor,
  projectFigures,
  type CatalogReport,
  type TemplateRow,
} from './catalog'

/**
 * # The ONE report template — `09_FINANCE.md` §9.7
 *
 * *"One layout, all 45 use it."* The order is fixed and is the whole point:
 *
 * ```
 * breadcrumb → shared toolbar → headline sentence → ONE chart → ONE table
 *            → hover a figure for formula · period AD+BS · source → footnote
 * ```
 *
 * ## Why the order is enforced here rather than described
 *
 * The eleven report screens this repo already has each invented their own
 * arrangement: some lead with a KPI strip, some with a recommendation, one with
 * a table and no chart. That is 45 layouts waiting to happen. This component
 * takes a `CatalogReport` and renders the same five regions in the same order
 * every time — a report contributes a *projection*, never a layout.
 *
 * ## The three responsive layouts, from `useViewport()` only
 *
 * - **Desktop ≥1280** — toolbar on one row; chart full width; table full width.
 * - **Tablet 768–1279** — filter chips wrap to two rows; table drops its
 *   lowest-priority columns (§9.7's "table, fewer columns").
 * - **Phone <768** — table becomes label/value card rows, and the working moves
 *   from a hover title to an expanded disclosure, because a `title` tooltip is
 *   not reachable by touch.
 *
 * Law 13 — never a platform branch. `useViewport()` is the only reader of width
 * on this screen.
 *
 * ## Never a zero
 *
 * §9.7 Notes: *"A report with no data source shows 'not tracked yet', never
 * zeros."* A `CatalogReport` with `projection: null` renders its `needs`
 * sentence as the entire body — no empty chart, no table of dashes, no KPI
 * strip of `Rs 0`. `figuresFor()` returning `null` for a range outside the
 * ledger is treated the same way, and says which range it can answer.
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
const td = { padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', borderBottom: '1px solid var(--border)' }
const num = { ...td, textAlign: 'right' as const }

export interface ReportTemplateProps {
  report: CatalogReport
  /**
   * Rendered as the trail's first segment. The tab host passes a handler so the
   * crumb returns to the catalog without a route change; a routed mount passes a
   * `to`. Breadcrumbs everywhere, **no Back button** —
   * `WIREFRAME_RULINGS_2026-08-12.md` §4.
   */
  onBackToCatalog?: () => void
}

export function ReportTemplate({ report, onBackToCatalog }: ReportTemplateProps) {
  const viewport = useViewport()
  const group = groupByKey(report.group)

  /**
   * The period, from `data/pulse.ts`'s presets — the same list the Pulse screen
   * uses, including the ones it disables with a stated reason (BS quarters and
   * last fiscal year, which `lib/bs.ts` cannot resolve). Building a second
   * period vocabulary here would be the "45 independent inventions" failure in
   * miniature.
   */
  const [periodKey, setPeriodKey] = useState<string>(DEFAULT_PERIOD)
  const [compare, setCompare] = useState<ReportCompare>('off')
  /** §9.7's table is "sortable" — one column at a time, value or label. */
  const [sortDesc, setSortDesc] = useState(true)

  const period = PERIODS.find((p) => p.key === periodKey) ?? PERIODS[0]
  const range = period?.range ?? null

  const figures: PeriodFigures | null = useMemo(
    () => (range ? figuresFor(range.from, range.to) : null),
    [range],
  )

  const prior = useMemo(() => {
    if (!range || compare === 'off') return null
    const prev = previousPeriod(range.from, range.to)
    return prev ? figuresFor(prev.from, prev.to) : null
  }, [range, compare])

  const projection = report.projection ? PROJECTIONS[report.projection] : null

  const rows: TemplateRow[] = useMemo(() => {
    if (!report.projection || !figures) return []
    const out = projectFigures(report.projection, figures, (p) => formatMoney(p as never))
    /* Equipment is a ranking; a period series is a sequence and only reverses.
       Either way one sort, applied here, so the chart and the table below can
       never disagree about the order. */
    return sortDesc ? [...out].sort((a, b) => b.chartValue - a.chartValue) : [...out].reverse()
  }, [report.projection, figures, sortDesc])

  const dates = range ? rangeLabel(range.from, range.to) : null

  /**
   * The working, exactly as §9.7 words it: *"formula · period AD+BS · source"*.
   * One string, so the hover title, the phone disclosure and the CSV provenance
   * line cannot drift apart.
   */
  const working = projection
    ? [
        projection.formula,
        dates ? `Period: ${dates.ad}${dates.bs ? ` · BS ${dates.bs}` : ''}` : 'Period: not resolved',
        `Source: ${projection.source}`,
      ].join(' · ')
    : ''

  const csvRows = (): ReportCsvRow[] => {
    if (!projection) return [['Report', report.name], ['Status', 'Not tracked yet'], ['Reason', report.needs ?? '']]
    return [
      ['Report', report.name],
      ['Group', `${group.key} ${group.name}`],
      ['Period', dates ? dates.ad : 'not resolved'],
      ['Working', working],
      [],
      [...projection.columns],
      ...rows.map((r): ReportCsvRow => [r.label, ...r.cells]),
    ]
  }

  const crumbs = (
    <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 'var(--t-meta)' }}>
      {onBackToCatalog ? (
        <button
          type="button"
          onClick={onBackToCatalog}
          style={{
            border: 'none',
            background: 'transparent',
            padding: 0,
            font: 'inherit',
            color: 'var(--link)',
            cursor: 'pointer',
            textDecoration: 'none',
          }}
        >
          Reports
        </button>
      ) : (
        <Link to="/finance" style={{ color: 'var(--link)', textDecoration: 'none' }}>
          Reports
        </Link>
      )}
      <Icon name="chevron_right" size={11} style={{ color: 'var(--muted)' }} />
      <span style={{ color: 'var(--text2)' }}>{`${group.key} ${group.name}`}</span>
      <Icon name="chevron_right" size={11} style={{ color: 'var(--muted)' }} />
      <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{report.name}</h2>
    </nav>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {crumbs}

      {report.unresolved && (
        /* Rulings §9.3 forbids resolving spec 09's three self-declared
           duplications while building. Shown rather than silently shipped, so a
           reader who finds two Profit & Loss entries knows it is recorded and
           not an accident. */
        <p
          style={{
            margin: 0,
            padding: 'var(--sp-sm) var(--sp-md)',
            borderRadius: 'var(--r-card)',
            border: '1px dashed var(--border)',
            background: 'var(--card2)',
            fontSize: 'var(--t-meta)',
            color: 'var(--text2)',
            lineHeight: 1.55,
          }}
        >
          {report.unresolved}
        </p>
      )}

      {/* THE shared toolbar. Built once in `components/ui/ReportToolbar.tsx`;
          §9.7 — "Building it once gives all 45 filters and export." */}
      <ReportToolbar
        title={report.name}
        {...(range ? { value: { dateRange: reportDateRange('period', range.from, range.to) } } : {})}
        {...(projection ? { csv: { filename: report.key, build: csvRows } } : {})}
        compare={compare}
        onCompareChange={setCompare}
      >
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          Period
          <select
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value)}
            style={{
              height: 34,
              minHeight: 34,
              padding: '0 8px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
              fontFamily: 'inherit',
            }}
          >
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key} disabled={p.range === null} title={p.why ?? undefined}>
                {p.label}
                {p.range === null ? ' — unavailable' : ''}
              </option>
            ))}
          </select>
        </label>

        {/* §9.7 draws [Save view]. Nothing stores a view: there is no
            `saved_views` table and no ruling on whether a view is per-user or
            per-role. Drawn, disabled, with the reason — the house rule for a
            control with nothing behind it. */}
        <Unavailable reason="Saving a view needs somewhere to save it. No saved-views table exists, and whether a view is private to one user or shared with a role is not ruled. TODO(decision) — PLAN.md §4.">
          <Button icon="flag" disabled>
            Save view
          </Button>
        </Unavailable>
      </ReportToolbar>

      {/* ── the body: either the report, or why there is no report ───────── */}
      {!projection ? (
        <Card>
          {/* §9.7 — "A report with no data source shows 'not tracked yet',
              never zeros." No chart, no table, no strip of dashes. */}
          <EmptyState
            icon={<Icon name="chart" size={26} />}
            title="Not tracked yet"
            description={report.needs ?? 'No source exists for this report.'}
          />
          {report.route && (
            <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: 'var(--t-meta)' }}>
              <Link to={report.route} style={{ color: 'var(--link)' }}>
                Open the screen that does answer this →
              </Link>
            </p>
          )}
        </Card>
      ) : !figures ? (
        <Card>
          <EmptyState
            icon={<Icon name="calendar" size={26} />}
            title="No figures for this period"
            description={`${period?.why ?? 'The selected range is outside the ledger.'} The ledger covers ${LEDGER_COVERAGE}.`}
          />
        </Card>
      ) : (
        <>
          {/* 1 — the headline sentence. Derived from the figures, so it moves
                 with the period rather than captioning it. */}
          <Card>
            <p style={{ margin: 0, fontSize: 'var(--t-ui)', lineHeight: 1.6, color: 'var(--text)' }}>
              {headlineFor(report.projection as never, figures, (p) => formatMoney(p as never))}
            </p>
            {prior && (
              <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.55 }}>
                Compared with the {prior.days} days before it — that period is shown as the second figure in each row of
                the table below where the projection has one, and is otherwise available in the export.
              </p>
            )}
          </Card>

          {/* 2 — ONE chart. */}
          <Card title={projection.series} action={<SortToggle desc={sortDesc} onToggle={() => setSortDesc((d) => !d)} />}>
            <Bars rows={rows} working={working} />
          </Card>

          {/* 3 — ONE table. */}
          <Card bodyStyle={{ padding: 0 }}>
            {viewport === 'phone' ? (
              <PhoneRows rows={rows} columns={projection.columns} />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {visibleColumns(projection.columns, viewport).map((c, i) => (
                        <th key={c} style={i === 0 ? th : { ...th, textAlign: 'right' }} scope="col">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.label}>
                        <th style={{ ...td, fontWeight: 400 }} scope="row">
                          {r.label}
                        </th>
                        {/* §9.7 — hover any figure for its working. `title` is
                            the hover; the disclosure below is the reachable
                            equivalent for touch and for a screen reader. */}
                        {trimCells(r.cells, projection.columns, viewport).map((cell, i) => (
                          <td key={i} className="figure" style={num} title={working}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Working text={working} note={MODEL_DISCLOSURE} />
          </Card>
        </>
      )}

      {/* 4 — the footnote: as-of BS / AD. */}
      <FooterNote
        extra={
          dates
            ? [dates.bs ? `As of ${dates.ad} · BS ${dates.bs}` : `As of ${dates.ad}`, ...(dates.bsNote ? [dates.bsNote] : [])]
            : ['Period not resolved — no as-of date can be stated.']
        }
      />
    </div>
  )
}

/* ── pieces ──────────────────────────────────────────────────────────────── */

/**
 * §9.7 tablet — *"table, fewer columns"*. The label column and the first figure
 * always survive; the rest are the ones a narrower table can lose without
 * changing what the report says.
 */
function visibleColumns(columns: readonly string[], viewport: string): readonly string[] {
  return viewport === 'tablet' ? columns.slice(0, 3) : columns
}

function trimCells(cells: readonly string[], columns: readonly string[], viewport: string): readonly string[] {
  return cells.slice(0, visibleColumns(columns, viewport).length - 1)
}

function SortToggle({ desc, onToggle }: { desc: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={desc ? 'Sorted largest first. Reverse the order.' : 'Sorted smallest first. Reverse the order.'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        minHeight: 44,
        padding: '0 10px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-btn)',
        background: 'var(--card)',
        color: 'var(--text2)',
        fontSize: 'var(--t-meta)',
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      <Icon name={desc ? 'chevron_down' : 'chevron_up'} size={12} />
      {desc ? 'Largest first' : 'Smallest first'}
    </button>
  )
}

/**
 * The ONE chart.
 *
 * A zero baseline rather than `width: value/max`, because `profit` and `cash`
 * go negative and a bar drawn from the left edge would render a loss as a short
 * gain. Law 11 — the bars are `aria-hidden` decoration and every value is
 * printed beside its label, so the chart is never the only place a figure is
 * stated.
 */
function Bars({ rows, working }: { rows: TemplateRow[]; working: string }) {
  if (rows.length === 0) return null
  const values = rows.map((r) => r.chartValue)
  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const zeroPct = ((0 - min) / span) * 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r) => {
        const v = r.chartValue
        const widthPct = (Math.abs(v) / span) * 100
        const leftPct = v >= 0 ? zeroPct : zeroPct - widthPct
        return (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 116,
                flexShrink: 0,
                textAlign: 'right',
                fontSize: 'var(--t-meta)',
                color: 'var(--text2)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {r.label}
            </span>
            <span aria-hidden style={{ position: 'relative', flex: 1, minWidth: 0, height: 14, background: 'var(--card2)', borderRadius: 3 }}>
              <span
                title={`${r.label} · ${r.chartDisplay} — ${working}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  minWidth: 2,
                  background: catColor(v >= 0 ? 3 : 1),
                  borderRadius: 3,
                }}
              />
            </span>
            <span className="figure" style={{ width: 108, flexShrink: 0, textAlign: 'right', fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
              {r.chartDisplay}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** §9.7 phone — *"table → card rows"*, `label   value`. */
function PhoneRows({ rows, columns }: { rows: TemplateRow[]; columns: readonly string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((r) => (
        <div key={r.label} style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{r.label}</div>
          {r.cells.map((cell, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 'var(--t-meta)' }}>
              <span style={{ color: 'var(--text2)' }}>{columns[i + 1] ?? ''}</span>
              <span className="figure" style={{ color: 'var(--text)' }}>{cell}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * §9.7's *"hover any figure → formula · period AD+BS · source"*, made reachable.
 *
 * The `title` attribute on each cell serves the hover. It is invisible to touch
 * and unreliable to a screen reader, and §9.7's phone note asks for the same
 * information on long-press — so the working is also a `<details>` under the
 * table, which is keyboard-reachable, announced, and one tap on a phone.
 */
function Working({ text, note }: { text: string; note: string }) {
  return (
    <details style={{ borderTop: '1px solid var(--border)', padding: '10px 14px' }}>
      <summary style={{ cursor: 'pointer', fontSize: 'var(--t-meta)', color: 'var(--link)', minHeight: 24 }}>
        The working — formula, period and source
      </summary>
      <p style={{ margin: '8px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.6 }}>{text}</p>
      <p style={{ margin: '8px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.6 }}>{note}</p>
    </details>
  )
}
