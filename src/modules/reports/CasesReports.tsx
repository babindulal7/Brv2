import { useMemo, useState } from 'react'
import { Card, PageHeader, Button, ReflowRail, SummaryRows, useRailGridColumns, useBandColumns } from '../../components/ui/Page'
import Icon from '../../components/ui/Icon'
import { useViewport } from '../../lib/device'
import { formatMoney } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { CASES, CASE_TYPES, isOpenStatus, outstandingOf } from '../../data/cases'
import type { Case, CaseType } from '../../data/cases'

/**
 * Cases Reports.
 *
 * ## Every figure here used to be a string literal
 *
 * `Total Cases '96'`, `Resolved '72'`, `Open '18'`, `Overdue '6'`,
 * `Total Cost 'Rs 3,42,800'`, a twelve-month trend of hand-typed bar heights,
 * a `Damage 38 / Missing 24 / Dispute 16 / Theft 9` breakdown and a six-row
 * `CASE_ROWS` table that shared no id with any real case — all invented, on a
 * screen sitting beside `CasesQueue`, which renders the *real* register from
 * `data/cases.ts`. The two disagreed on every number.
 *
 * Rulings §8: *"a report with no data source shows 'not tracked yet', never
 * zeros… Never seed a plausible default."* So each figure below is either
 * counted off `CASES` — the same list `CasesQueue` renders, so the report and
 * the queue cannot drift — or it says what it is missing.
 *
 * Two figures are deliberately NOT rendered as numbers:
 *   · **Overdue** — a case is overdue against a target resolution date, and
 *     `Case` carries `openedAd`/`settledAd` but no target. There is no SLA
 *     anywhere in the repo to derive one from.
 *   · **Avg Resolution Time** and the **monthly trend** — both need a period
 *     selection over a case history this seed does not span.
 */

const NOT_TRACKED = 'Not tracked yet'

function Bar({ label, value, max, tone = 'var(--cat-1)' }: { label: string; value: number; max: number; tone?: string }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 35px', gap: 'var(--sp-sm)', alignItems: 'center', fontSize: 'var(--t-meta)' }}>
    <span style={{ color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    <span style={{ height: 8, background: 'var(--card2)', borderRadius: 99, overflow: 'hidden' }}><span style={{ display: 'block', width: `${max ? (value / max) * 100 : 0}%`, height: '100%', background: tone, borderRadius: 99 }} /></span>
    <span className="figure" style={{ color: 'var(--text)', textAlign: 'right' }}>{value}</span>
  </div>
}

export default function CasesReports() {
  const money = useCanViewMoney()
  /* KpiStrip's clamp, applied to this screen's hand-rolled key-figure grid:
     six cards side by side is unreadable below 1180. */
  const bandCols = useBandColumns()
  /* Rulings §7 — the rail track goes away below 1180 so `ReflowRail`'s
     inline column is not squeezed by a rail column that is still there. */
  const railGridColumns = useRailGridColumns()
  const viewport = useViewport()
  const tabular = viewport !== 'phone'
  const [period, setPeriod] = useState('This Month')
  const [selected, setSelected] = useState(CASES[0]?.id ?? '')

  const figures = useMemo(() => {
    const open = CASES.filter((c) => isOpenStatus(c.status))
    const settled = CASES.filter((c) => !isOpenStatus(c.status))
    const assessed = CASES.reduce((sum, c) => sum + c.assessedPaisa, 0) as Paisa
    const byType = CASE_TYPES.map((t: CaseType) => ({ label: t, value: CASES.filter((c) => c.type === t).length }))
    return {
      total: CASES.length,
      open: open.length,
      settled: settled.length,
      assessed,
      byType: byType.sort((a, b) => b.value - a.value),
      maxType: Math.max(1, ...byType.map((b) => b.value)),
    }
  }, [])

  const kpis: Array<[string, string, string, string]> = [
    ['Total Cases', String(figures.total), 'In the case register', 'var(--cat-1)'],
    ['Resolved / Closed', String(figures.settled), 'Settled, allocation complete', 'var(--success-text)'],
    ['Open', String(figures.open), 'Open, under review, awaiting decision or in progress', 'var(--warning-text)'],
    // Rulings §8 — no target resolution date exists on `Case`, so "overdue"
    // cannot be selected for. Saying so beats a plausible 6.
    ['Overdue', NOT_TRACKED, 'No target resolution date is recorded on a case', 'var(--muted)'],
    ...(money ? [['Total Assessed', formatMoney(figures.assessed), 'Sum of assessed value across all cases', 'var(--danger-text)'] as [string, string, string, string]] : []),
    ['Avg Resolution Time', NOT_TRACKED, 'Needs a case history spanning the selected period', 'var(--muted)'],
  ]

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
    <PageHeader title="Cases Reports" description="Analyze incidents, resolution performance, exposure, and operational risk." actions={<><Button icon="refresh">Compare</Button><Button icon="download">Export</Button><Button icon="eye">Saved Views</Button><Button icon="calendar_stats" variant="primary">Schedule Report</Button></>} />
    {/* Law 15 — these were 30px tall; they are real `aria-pressed` toggles. */}
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{['This Month', 'Last Month', 'This Quarter', 'This Year', 'Custom Range'].map((x) => <button key={x} onClick={() => setPeriod(x)} aria-pressed={period === x} style={{ minHeight: 44, padding: '0 11px', borderRadius: 'var(--r-sm)', border: `1px solid ${period === x ? 'var(--nav-active-accent)' : 'var(--border)'}`, background: period === x ? 'var(--nav-active-bg)' : 'var(--card)', color: period === x ? 'var(--nav-active-accent)' : 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--t-meta)' }}>{x}</button>)}</div>
    <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>{['Case Type', 'Severity', 'Status', 'Owner', 'Client Type', 'Date Range'].map((x) => <Button key={x} icon="chevron_down">{x}</Button>)}<Button icon="queues">Clear Filters</Button></div>
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bandCols(kpis.length)}, minmax(0,1fr))`, gap: 10 }}>{kpis.map(([label, value, note, tone]) => <Card key={label}><div style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>{label}</div><div className={value === NOT_TRACKED ? undefined : 'figure'} style={{ color: tone, fontSize: value === NOT_TRACKED ? 'var(--t-ui)' : 'var(--t-h2)', fontWeight: 700, marginTop: 6 }}>{value}</div><div style={{ color: 'var(--muted)', fontSize: 'var(--t-meta)', marginTop: 3 }}>{note}</div></Card>)}</div>
    <div style={{ display: 'grid', gridTemplateColumns: railGridColumns, gap: 'var(--sp-md)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: viewport === 'desktop' ? '1.35fr 1fr' : '1fr', gap: 'var(--sp-md)' }}>
          <Card title="Cases by Type">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {figures.byType.map((b, i) => <Bar key={b.label} label={b.label} value={b.value} max={figures.maxType} tone={`var(--cat-${(i % 5) + 1})`} />)}
            </div>
          </Card>
          <Card title="Cases Trend">
            {/* Rulings §8 — the twelve bars here were hand-typed heights with no
                month behind any of them. */}
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
              {NOT_TRACKED} — a month-by-month trend needs a case history spanning the selected period, and the register
              holds {figures.total} case{figures.total === 1 ? '' : 's'} without a period index.
            </p>
          </Card>
        </div>
        <Card
          title="Cases List"
          action={<span style={{ color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>Showing {CASES.length} of {CASES.length} cases</span>}
          bodyStyle={{ padding: 0 }}
        >
          {tabular ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: viewport === 'tablet' ? 700 : 950 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    {(money
                      ? ['Case ID', 'Type', 'Title', 'Counterparty', 'Status', 'Assessed', 'Outstanding']
                      : ['Case ID', 'Type', 'Title', 'Counterparty', 'Status']
                    ).map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '9px 10px', color: 'var(--text2)', fontSize: 'var(--t-th)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CASES.map((c: Case) => {
                    const outstanding = outstandingOf(c)
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setSelected(c.id)}
                        style={{ borderTop: '1px solid var(--border)', background: selected === c.id ? 'var(--nav-active-bg)' : 'transparent', cursor: 'pointer' }}
                      >
                        <td className="identifier" style={{ padding: '11px 10px', fontSize: 'var(--t-meta)', color: 'var(--link)', fontWeight: 600 }}>{c.id}</td>
                        <td style={{ padding: '11px 10px', fontSize: 'var(--t-meta)' }}>{c.type}</td>
                        <td style={{ padding: '11px 10px', fontSize: 'var(--t-meta)' }}>{c.title}</td>
                        <td style={{ padding: '11px 10px', fontSize: 'var(--t-meta)' }}>{c.counterpartyName}</td>
                        <td style={{ padding: '11px 10px', fontSize: 'var(--t-meta)', fontWeight: 600 }}>{c.status}</td>
                        {money && (
                          <>
                            <td className="figure" style={{ padding: '11px 10px', fontSize: 'var(--t-meta)' }}>{formatMoney(c.assessedPaisa)}</td>
                            <td className="figure" style={{ padding: '11px 10px', fontSize: 'var(--t-meta)', color: outstanding > 0 ? 'var(--danger-text)' : 'var(--text)' }}>{formatMoney(outstanding)}</td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Shell rule — seven columns become one card per case below 768. */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', padding: 'var(--sp-sm)' }}>
              {CASES.map((c: Case) => {
                const outstanding = outstandingOf(c)
                return (
                  <article key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <span className="identifier" style={{ color: 'var(--link)', fontWeight: 700 }}>{c.id}</span>
                      <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>{c.type}</span>
                      <span style={{ fontSize: 'var(--t-th)', fontWeight: 600 }}>{c.status}</span>
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)' }}>{c.title}</div>
                    <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{c.counterpartyName}</div>
                    {money && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 'var(--t-meta)' }}>
                        <span className="figure">{formatMoney(c.assessedPaisa)} assessed</span>
                        <span className="figure" style={{ color: outstanding > 0 ? 'var(--danger-text)' : 'var(--text2)' }}>{formatMoney(outstanding)} outstanding</span>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </Card>
      </div>
      <ReflowRail>
        <Card title="Cases Summary">
          <SummaryRows
            rows={[
              { label: 'Total Cases', value: String(figures.total) },
              { label: 'Resolved / Closed', value: String(figures.settled) },
              { label: 'Open', value: String(figures.open) },
              { label: 'Overdue', value: NOT_TRACKED },
              ...(money ? [{ label: 'Total Assessed', value: formatMoney(figures.assessed), tone: 'danger' as const }] : []),
            ]}
          />
        </Card>
        <Card title="Top Case Types">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
            {figures.byType.map((b) => (
              <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-meta)' }}>
                <span>{b.label}</span>
                <span className="figure" style={{ fontWeight: 700 }}>{b.value}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Quick Actions">
          <div style={{ display: 'grid', gap: 'var(--sp-sm)' }}>
            {['Export PDF', 'Export Excel', 'Schedule Report', 'Create Dashboard Widget'].map((x) => <Button key={x} icon="download">{x}</Button>)}
          </div>
        </Card>
        <div style={{ color: 'var(--muted)', fontSize: 'var(--t-meta)' }}><Icon name="info" size={13} /> Period: {period}</div>
      </ReflowRail>
    </div>
  </div>
}
