import { useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, Rail, SideRail, SummaryRows, FooterNote, cardStyle } from '../../components/ui/Page'
import { Unavailable } from '../../components/ui/Unavailable'
import { Donut, Legend, catColor } from '../../components/ui/Charts'
import { STATUS, BRAND, BRAND_ON, BRAND_TEXT } from '../../lib/status'
import {
  KPIS,
  CATEGORIES,
  SEQUENCES,
  MODULES,
  STATUSES,
  RESET_RULES,
  SCOPES,
  BRANCHES,
  WAREHOUSES,
  CONFIG_TABS,
  FORMAT_TOKENS,
  PER_PAGE,
  PREVIEW_YEAR,
  PREVIEW_MONTH,
  PREVIEW_DAY,
  DEFAULT_SEQUENCE_CODE,
  STARTING_NUMBER,
  SUMMARY_PERIODS,
  UNCONFIGURED_CODES,
  ANALYTICS,
  SUMMARY,
  ALERTS,
  QUICK_ACTIONS,
  ACTIVITY,
  INSIGHTS,
  SEED_ERRORS,
  countFor,
  segmentsOf,
  paddingOf,
  padTo,
  advance,
} from '../../data/numbering'
import type { ConfigTab, ResetRule, SequenceModule, SequenceRow, SequenceScope } from '../../data/numbering'

/**
 * Administration → **Numbering Sequences**, built against render `CD132C04`
 * (`03 Core Modules/Settings/Numbering Sequences.PNG`) and its spec v3.0.
 *
 * The screen is the ID registry's control surface, so its two panels are wired
 * to one another rather than to fixed strings: the table selects a sequence,
 * the configuration panel edits a **draft** of it, and the preview generator
 * renders whatever that draft would produce. Change Padding Length from 6 to 4
 * and the format, the live preview, the next number and the total length all
 * move together — that is the spec's "live preview updates instantly", and it
 * is also the only way this page can be trusted about what it claims.
 *
 * **Deviations from the render — each one deliberate, do not copy back:**
 *
 *  · **The preview is built from the format, not from a fixed five-chip
 *    string.** The render's preview prints `BK-2026-05-KTM-004862` while the
 *    Format column two panels above says `BK-YYYY-NNNNN`, and its "Total
 *    Length 19" counts neither (that string is 21). A preview that contradicts
 *    the format it is previewing is the worst defect this screen could carry,
 *    so segments come from the format string. BK therefore shows three chips
 *    where the render shows five. Scope selects which *counter* is used, per
 *    spec § Branch Rules — a branch code only appears when the format has a
 *    `BR` token, which is exactly how the spec's own `INV-KTM-2026-00492`
 *    example is built.
 *  · **The render's fourth chip is labelled SEPARATOR and holds `KTM`.** A
 *    branch code is not a separator, and the same panel's Separator field
 *    holds `-`. It is labelled BRANCH here.
 *  · **The categories rail loses its duplicate "All Categories" row.** It
 *    selects the identical set as "All Sequences" six rows above it.
 *  · **Recent Activity shows what happened, not who.** The render puts a face
 *    on each entry; no actor is named for any of them anywhere.
 *  · **Every write is a stated-unavailable control, not a live no-op.** A
 *    wrong counter mints duplicate IDs across the whole product, so nothing
 *    here writes before the confirmation and audit path exists. The reason is
 *    on the control and in the footer, never a silent dead button.
 *
 * Colour, status and role vocabulary come from Foundation, not the render.
 */

const th = {
  textAlign: 'left' as const,
  padding: '8px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
const td = { padding: '9px 10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }
const link = { fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' } as const
const fieldStyle: CSSProperties = {
  width: '100%',
  height: 30,
  padding: '0 9px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
}
const fieldLabel = { display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', marginBottom: 3 } as const
const sub = { fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' } as const
const panelNote = { fontSize: 'var(--t-meta)', color: 'var(--muted)' } as const

/** Every unavailable control on this page states the same reason. */
const WHY_READ_ONLY = 'Not available in this build — a sequence write mints IDs product-wide and needs the confirmation and audit path first.'

const ALL_MODULES = 'All Modules'
const ALL_STATUS = 'All Status'

/** Reused by the pager and by nothing else — kept beside its only caller. */
function PageBtn({ label, active, disabled, onClick }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      style={{
        minWidth: 24,
        height: 24,
        borderRadius: 6,
        border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
        background: active ? 'var(--btn-primary-bg)' : 'transparent',
        color: active ? 'var(--btn-primary-fg)' : 'var(--text2)',
        fontSize: 'var(--t-meta)',
        fontWeight: active ? 700 : 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  )
}

/** States a reason inside a panel that cannot show its normal content. */
function StatedGap({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 9,
        alignItems: 'flex-start',
        padding: 12,
        borderRadius: 'var(--r-btn)',
        border: '1px dashed var(--border2)',
        background: 'var(--card2)',
      }}
    >
      <Icon name="info" size={15} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 1 }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 2 }}>{body}</span>
      </span>
    </div>
  )
}

/**
 * The render draws a dotted trend line under "Records Generated". `Page.tsx`'s
 * `Spark` is private to that module and this one needs the dots, so it is
 * eleven lines here rather than a change to a file this pass does not own.
 */
function TrendLine({ points }: { points: number[] }) {
  const max = Math.max(...points)
  const min = Math.min(...points)
  const span = max - min || 1
  const at = (p: number, i: number) => ({ x: (i / (points.length - 1)) * 100, y: 30 - ((p - min) / span) * 26 - 2 })
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden style={{ width: '100%', height: 46, display: 'block', overflow: 'visible' }}>
      <polyline
        points={points.map((p, i) => { const c = at(p, i); return `${c.x},${c.y}` }).join(' ')}
        fill="none"
        stroke={catColor(0)}
        strokeWidth={1.6}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {points.map((p, i) => {
        const c = at(p, i)
        return <circle key={i} cx={c.x} cy={c.y} r={1.6} fill={catColor(0)} vectorEffect="non-scaling-stroke" />
      })}
    </svg>
  )
}

interface Draft {
  name: string
  code: string
  description: string
  suffix: string
  startingNumber: string
  separator: string
  format: string
  resetRule: ResetRule
  scope: SequenceScope
  active: boolean
}

function draftOf(row: SequenceRow): Draft {
  return {
    name: row.name,
    code: row.code,
    description: row.description ?? '',
    suffix: '',
    startingNumber: STARTING_NUMBER,
    separator: '-',
    format: row.format ?? '',
    resetRule: row.resetRule ?? 'Never',
    scope: row.scope ?? 'Global',
    active: row.status === 'Active',
  }
}

/** Rewrites the leading literal, so Prefix and Format can never disagree. */
function withPrefix(format: string, prefix: string): string {
  const parts = format.split('-')
  parts[0] = prefix.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return parts.join('-')
}

/** Rewrites the `N` run, so Padding Length and Format can never disagree. */
function withPadding(format: string, width: number): string {
  const n = Math.min(Math.max(width, 1), 12)
  return format
    .split('-')
    .map((p) => (/^N+$/.test(p) ? 'N'.repeat(n) : p))
    .join('-')
}

export default function NumberingSequences() {
  const [moduleFilter, setModuleFilter] = useState<SequenceModule | typeof ALL_MODULES>(ALL_MODULES)
  const [statusFilter, setStatusFilter] = useState<string>(ALL_STATUS)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number>(PER_PAGE[0])

  const [selectedCode, setSelectedCode] = useState(DEFAULT_SEQUENCE_CODE)
  const [draft, setDraft] = useState<Draft>(() => draftOf(SEQUENCES.find((s) => s.code === DEFAULT_SEQUENCE_CODE) ?? (SEQUENCES[0] as SequenceRow)))
  const [tab, setTab] = useState<ConfigTab>('General')
  const [branchCode, setBranchCode] = useState(BRANCHES[0]?.code ?? 'KTM')
  const [warehouseCode, setWarehouseCode] = useState(WAREHOUSES[0]?.code ?? 'MAIN')
  const [testCount, setTestCount] = useState(0)
  const [period, setPeriod] = useState<string>(SUMMARY_PERIODS[0])

  const previewRef = useRef<HTMLDivElement>(null)

  const selected = SEQUENCES.find((s) => s.code === selectedCode) ?? (SEQUENCES[0] as SequenceRow)

  function select(code: string) {
    const row = SEQUENCES.find((s) => s.code === code)
    if (!row) return
    setSelectedCode(code)
    setDraft(draftOf(row))
    setTestCount(0)
  }

  /* ── filtering ───────────────────────────────────────────────────────── */

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return SEQUENCES.filter((s) => {
      if (moduleFilter !== ALL_MODULES && s.module !== moduleFilter) return false
      if (statusFilter !== ALL_STATUS && s.status !== statusFilter) return false
      if (!q) return true
      return [s.code, s.name, s.prefix, s.module, s.format ?? '', s.resetRule ?? '', s.scope ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [moduleFilter, statusFilter, query])

  const pageCount = Math.max(1, Math.ceil(rows.length / perPage))
  const current = Math.min(page, pageCount)
  const visible = rows.slice((current - 1) * perPage, current * perPage)

  function setModule(m: SequenceModule | typeof ALL_MODULES) {
    setModuleFilter(m)
    setPage(1)
  }

  /* ── preview, derived from the draft ─────────────────────────────────── */

  const padding = draft.format ? paddingOf(draft.format) : 0
  const nextCounter = selected.counter ? advance(padTo(Number(selected.counter), padding), 1) : null
  const currentCounter = selected.counter ? padTo(Number(selected.counter), padding) : null
  const sep = draft.separator === 'none' ? '' : draft.separator

  const segments = draft.format && nextCounter
    ? segmentsOf(draft.format, {
        year: PREVIEW_YEAR,
        month: PREVIEW_MONTH,
        day: PREVIEW_DAY,
        branchCode,
        warehouseCode,
        counter: nextCounter,
      })
    : []

  const suffix = draft.suffix.trim().toUpperCase()
  const livePreview = segments.length > 0 ? [...segments.map((s) => s.value), ...(suffix ? [suffix] : [])].join(sep) : ''

  const testNumbers =
    testCount > 0 && draft.format && selected.counter
      ? Array.from({ length: testCount }, (_, i) =>
          [
            ...segmentsOf(draft.format, {
              year: PREVIEW_YEAR,
              month: PREVIEW_MONTH,
              day: PREVIEW_DAY,
              branchCode,
              warehouseCode,
              counter: advance(padTo(Number(selected.counter), padding), i + 1),
            }).map((s) => s.value),
            ...(suffix ? [suffix] : []),
          ].join(sep),
        )
      : []

  const branchApplies = draft.scope === 'Per Branch' || draft.format.split('-').includes('BR')
  const warehouseApplies = draft.scope === 'Per Warehouse' || draft.format.split('-').includes('WH')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {SEED_ERRORS.length > 0 && (
        <div role="alert" style={{ ...cardStyle, padding: 12, borderColor: 'var(--danger)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong style={{ fontSize: 'var(--t-ui)', color: 'var(--danger-text)' }}>Sequence seed does not reconcile</strong>
          {SEED_ERRORS.map((e) => (
            <span key={e} style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              {e}
            </span>
          ))}
        </div>
      )}

      <PageHeader
        icon="queues"
        title="Numbering Sequences"
        description="Configure and manage all auto-generated numbers used across Babin Rentals OS."
        actions={
          <>
            <Unavailable reason="Creating a sequence needs the confirmation and audit path — not available in this build.">
              <Button icon="plus" variant="primary" disabled>
                Add Sequence
              </Button>
            </Unavailable>
            <Unavailable reason="Importing sequence definitions overwrites live counters — not available in this build.">
              <Button icon="download" disabled>
                Import
              </Button>
            </Unavailable>
            <Unavailable reason="Export (PDF · Excel · JSON · XML) is specified but not built yet.">
              <Button icon="upload" disabled>
                Export
              </Button>
            </Unavailable>
            <Unavailable reason="Resetting a counter can re-issue an existing ID — it needs the confirmation and audit path first.">
              <Button icon="refresh" disabled>
                Reset Counter
              </Button>
            </Unavailable>
            <Unavailable reason="Nothing to refresh — this build reads a static seed, not a live counter service.">
              <Button icon="refresh" disabled>
                Refresh
              </Button>
            </Unavailable>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <KpiStrip items={KPIS} columns={6} />

          <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <SideRail width={210} label="Categories">
              <Card title="Sequence Categories" bodyStyle={{ padding: 8 }}>
                {CATEGORIES.map((c, i) => {
                  const on = moduleFilter === (c.module ?? ALL_MODULES)
                  return (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => setModule(c.module ?? ALL_MODULES)}
                      aria-pressed={on}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        width: '100%',
                        height: 34,
                        padding: '0 9px',
                        borderRadius: 8,
                        border: 'none',
                        background: on ? 'var(--nav-active-bg)' : 'transparent',
                        color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: on ? 600 : 500,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        textAlign: 'left',
                      }}
                    >
                      <Icon name={c.icon} size={14} style={{ color: on ? 'var(--nav-active-accent)' : catColor(i), flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.name}
                      </span>
                      {/* `--muted` on the selected row's tint measures 4.38:1 — under AA. */}
                      <span className="figure" style={{ fontSize: 'var(--t-meta)', color: on ? 'var(--text2)' : 'var(--muted)' }}>
                        {countFor(c.module)}
                      </span>
                    </button>
                  )
                })}
              </Card>
            </SideRail>

            <Card
              title="All Sequences"
              action={
                <>
                  <select
                    aria-label="Filter by module"
                    value={moduleFilter}
                    onChange={(e) => setModule(e.target.value as SequenceModule | typeof ALL_MODULES)}
                    style={{ ...fieldStyle, width: 'auto', height: 30 }}
                  >
                    <option value={ALL_MODULES}>{ALL_MODULES}</option>
                    {MODULES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter by status"
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value)
                      setPage(1)
                    }}
                    style={{ ...fieldStyle, width: 'auto', height: 30 }}
                  >
                    <option value={ALL_STATUS}>{ALL_STATUS}</option>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <span style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 170 }}>
                    <Icon name="search" size={13} style={{ position: 'absolute', left: 9, color: 'var(--muted)' }} />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value)
                        setPage(1)
                      }}
                      placeholder="Search sequences…"
                      aria-label="Search sequences by module, prefix, name or format"
                      style={{ ...fieldStyle, paddingLeft: 27 }}
                    />
                  </span>
                </>
              }
              bodyStyle={{ padding: 0 }}
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Code', 'Sequence Name', 'Prefix', 'Format', 'Current Counter', 'Reset Rule', 'Scope', 'Status', 'Actions'].map((h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((s) => {
                      const on = s.code === selectedCode
                      const gap = s.format === null
                      return (
                        <tr
                          key={s.code}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            background: on ? 'var(--nav-active-bg)' : 'transparent',
                          }}
                        >
                          <td className="identifier" style={{ ...td, fontWeight: 700 }}>
                            {s.code}
                          </td>
                          <td style={td}>{s.name}</td>
                          <td style={td}>
                            <span
                              className="figure"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                height: 18,
                                padding: '0 6px',
                                borderRadius: 4,
                                background: STATUS.primary.bg,
                                color: STATUS.primary.fg,
                                fontSize: 'var(--t-meta)',
                                fontWeight: 700,
                              }}
                            >
                              {s.prefix}
                            </span>
                          </td>
                          <td
                            className={gap ? undefined : 'figure'}
                            style={{ ...td, color: gap ? 'var(--muted)' : 'var(--text2)', fontStyle: gap ? 'italic' : 'normal' }}
                            title={gap ? 'No format supplied by the render or the spec for this sequence.' : undefined}
                          >
                            {s.format ?? 'Not configured'}
                          </td>
                          <td className="figure" style={{ ...td, fontWeight: 600, color: gap ? 'var(--muted)' : 'var(--text)' }}>
                            {s.counter ?? '—'}
                          </td>
                          <td style={{ ...td, color: 'var(--text2)' }}>{s.resetRule ?? '—'}</td>
                          <td style={{ ...td, color: 'var(--text2)' }}>{s.scope ?? '—'}</td>
                          <td style={td}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                height: 19,
                                padding: '0 7px',
                                borderRadius: 5,
                                background: s.status === 'Active' ? STATUS.in.bg : STATUS.neutral.bg,
                                color: s.status === 'Active' ? STATUS.in.fg : STATUS.neutral.fg,
                                fontSize: 'var(--t-meta)',
                                fontWeight: 600,
                              }}
                            >
                              <Icon name={s.status === 'Active' ? 'check' : 'eye'} size={10} />
                              {s.status}
                            </span>
                          </td>
                          <td style={td}>
                            <span style={{ display: 'flex', gap: 4 }}>
                              <button
                                type="button"
                                onClick={() => select(s.code)}
                                aria-label={`Configure ${s.code} – ${s.name}`}
                                title={`Load ${s.code} into the configuration and preview panels`}
                                style={{
                                  display: 'grid',
                                  placeItems: 'center',
                                  width: 24,
                                  height: 24,
                                  borderRadius: 6,
                                  border: '1px solid var(--border)',
                                  background: 'transparent',
                                  color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                                  cursor: 'pointer',
                                  fontFamily: 'inherit',
                                }}
                              >
                                <Icon name="tool" size={12} />
                              </button>
                              <Unavailable reason="The row menu (archive · duplicate · audit history) is specified but not built yet.">
                                <button
                                  type="button"
                                  disabled
                                  aria-label={`More actions for ${s.code}`}
                                  style={{
                                    display: 'grid',
                                    placeItems: 'center',
                                    width: 24,
                                    height: 24,
                                    borderRadius: 6,
                                    border: '1px solid var(--border)',
                                    background: 'transparent',
                                    color: 'var(--muted)',
                                    cursor: 'not-allowed',
                                    opacity: 0.6,
                                    fontFamily: 'inherit',
                                  }}
                                >
                                  <Icon name="more_vert" size={12} />
                                </button>
                              </Unavailable>
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                    {visible.length === 0 && (
                      <tr>
                        <td colSpan={9} style={{ ...td, padding: 22, textAlign: 'center', color: 'var(--text2)', whiteSpace: 'normal' }}>
                          No sequence matches this filter. Clear the search or pick another category.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderTop: '1px solid var(--border)',
                  fontSize: 'var(--t-meta)',
                  color: 'var(--text2)',
                  flexWrap: 'wrap',
                }}
              >
                <span>
                  {rows.length === 0
                    ? 'Showing 0 sequences'
                    : `Showing ${(current - 1) * perPage + 1} to ${Math.min(current * perPage, rows.length)} of ${rows.length} sequences`}
                </span>
                <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  Rows per page
                  <select
                    value={perPage}
                    onChange={(e) => {
                      setPerPage(Number(e.target.value))
                      setPage(1)
                    }}
                    className="figure"
                    style={{ ...fieldStyle, width: 'auto', height: 26 }}
                  >
                    {PER_PAGE.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <span style={{ display: 'flex', gap: 3 }}>
                  <PageBtn label="‹" disabled={current === 1} onClick={() => setPage(current - 1)} />
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                    <PageBtn key={p} label={String(p)} active={p === current} onClick={() => setPage(p)} />
                  ))}
                  <PageBtn label="›" disabled={current === pageCount} onClick={() => setPage(current + 1)} />
                </span>
              </div>

              {UNCONFIGURED_CODES.length > 0 && (
                <p style={{ margin: 0, padding: '0 12px 11px', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                  {UNCONFIGURED_CODES.join(' · ')} are named in the spec's default system sequences but neither the render nor the
                  spec supplies a format, counter, reset rule or scope for them. Nothing is invented in their place.
                </p>
              )}
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Card title="Sequence Preview Generator">
              <div ref={previewRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 9 }}>
                <label style={{ minWidth: 0 }}>
                  <span style={fieldLabel}>Select Sequence</span>
                  <select value={selectedCode} onChange={(e) => select(e.target.value)} style={fieldStyle}>
                    {SEQUENCES.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} – {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ minWidth: 0 }} title={branchApplies ? undefined : `${draft.scope} sequence — it keeps no per-branch counter and its format has no BR token.`}>
                  <span style={fieldLabel}>Branch</span>
                  <select
                    value={branchCode}
                    disabled={!branchApplies}
                    onChange={(e) => setBranchCode(e.target.value)}
                    style={{ ...fieldStyle, opacity: branchApplies ? 1 : 0.55, cursor: branchApplies ? 'pointer' : 'not-allowed' }}
                  >
                    {BRANCHES.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name} ({b.code})
                        {b.confirmed ? '' : ' — code unconfirmed'}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ minWidth: 0 }} title={warehouseApplies ? undefined : 'Applies only to Per Warehouse sequences. No seeded sequence uses that scope.'}>
                  <span style={fieldLabel}>Warehouse (Optional)</span>
                  <select
                    value={warehouseCode}
                    disabled={!warehouseApplies}
                    onChange={(e) => setWarehouseCode(e.target.value)}
                    style={{ ...fieldStyle, opacity: warehouseApplies ? 1 : 0.55, cursor: warehouseApplies ? 'pointer' : 'not-allowed' }}
                  >
                    {WAREHOUSES.map((w) => (
                      <option key={w.code} value={w.code}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {segments.length === 0 ? (
                <div style={{ marginTop: 12 }}>
                  <StatedGap
                    title={`${selected.code} – ${selected.name} has no format`}
                    body="This sequence is named in the spec's default system list, but no format, counter, reset rule or scope is supplied for it anywhere. There is nothing to preview until one is decided."
                  />
                </div>
              ) : (
                <>
                  {/* Each segment is labelled and coloured so the format reads as
                      a structure, not just as a string. */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                    {segments.map((p, i) => (
                      <span key={`${p.kind}-${i}`} style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                        {i > 0 && <span style={{ color: 'var(--muted)', paddingBottom: 8 }}>{sep || '·'}</span>}
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 3 }}>
                            {p.label}
                          </span>
                          <span
                            className="figure"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              height: 32,
                              padding: '0 11px',
                              borderRadius: 8,
                              border: `1px solid ${BRAND[p.tone]}`,
                              background: 'var(--card2)',
                              color: 'var(--text)',
                              fontSize: 'var(--t-ui)',
                              fontWeight: 700,
                            }}
                          >
                            {p.value}
                          </span>
                        </span>
                      </span>
                    ))}
                    {suffix && (
                      <span style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                        <span style={{ color: 'var(--muted)', paddingBottom: 8 }}>{sep || '·'}</span>
                        <span>
                          <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 3 }}>
                            SUFFIX
                          </span>
                          <span
                            className="figure"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              height: 32,
                              padding: '0 11px',
                              borderRadius: 8,
                              border: `1px solid ${BRAND.success}`,
                              background: 'var(--card2)',
                              color: 'var(--text)',
                              fontSize: 'var(--t-ui)',
                              fontWeight: 700,
                            }}
                          >
                            {suffix}
                          </span>
                        </span>
                      </span>
                    )}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <span style={fieldLabel}>Live Preview</span>
                    <div
                      className="figure"
                      aria-live="polite"
                      style={{
                        padding: '11px 12px',
                        borderRadius: 'var(--r-btn)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        fontSize: 'var(--t-h3)',
                        fontWeight: 700,
                        color: 'var(--text)',
                        letterSpacing: '0.06em',
                        textAlign: 'center',
                        overflowX: 'auto',
                      }}
                    >
                      {livePreview}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: 11, flexWrap: 'wrap' }}>
                    {[
                      { l: 'Next Number', v: livePreview },
                      { l: 'Current Counter', v: currentCounter ?? '—' },
                      { l: 'Padding Length', v: String(padding) },
                      { l: 'Total Length', v: String(livePreview.length) },
                    ].map((x) => (
                      <span key={x.l} style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{x.l}</span>
                        <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginTop: 1 }}>
                          {x.v}
                        </span>
                      </span>
                    ))}
                    <span style={{ marginLeft: 'auto' }}>
                      <Button icon="arrow_right" onClick={() => setTestCount(testCount > 0 ? 0 : 5)}>
                        {testCount > 0 ? 'Hide Test Numbers' : 'Test Next 5 Numbers'}
                      </Button>
                    </span>
                  </div>

                  {testNumbers.length > 0 && (
                    <ol
                      style={{
                        margin: '10px 0 0',
                        padding: '9px 12px',
                        listStyle: 'none',
                        borderRadius: 'var(--r-btn)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '4px 16px',
                      }}
                    >
                      {testNumbers.map((n, i) => (
                        <li key={n} className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                          <span style={{ color: 'var(--muted)', marginRight: 5 }}>{i + 1}.</span>
                          {n}
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}

              <p style={{ margin: '9px 0 0', ...panelNote }}>
                Preview updates automatically when the configuration beside it changes. Nothing here advances a real counter.
              </p>
            </Card>

            <Card title="Sequence Configuration">
              <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                {CONFIG_TABS.map((t) => {
                  const on = tab === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTab(t)}
                      aria-current={on ? 'page' : undefined}
                      style={{
                        height: 28,
                        padding: '0 10px',
                        border: 'none',
                        borderBottom: `2px solid ${on ? 'var(--nav-active-accent)' : 'transparent'}`,
                        background: 'transparent',
                        color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: on ? 700 : 500,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        marginBottom: -1,
                      }}
                    >
                      {t}
                    </button>
                  )
                })}
              </div>

              {tab === 'General' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 9, marginTop: 11 }}>
                  <label style={{ gridColumn: 'span 2', minWidth: 0 }}>
                    <span style={fieldLabel}>
                      Sequence Name<span style={{ color: 'var(--danger-text)' }}> *</span>
                    </span>
                    <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={fieldStyle} />
                  </label>
                  <label style={{ gridColumn: 'span 2', minWidth: 0 }}>
                    <span style={fieldLabel}>
                      Code<span style={{ color: 'var(--danger-text)' }}> *</span>
                    </span>
                    <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} style={fieldStyle} />
                  </label>
                  <label style={{ gridColumn: 'span 2', minWidth: 0 }}>
                    <span style={fieldLabel}>Description</span>
                    <input
                      value={draft.description}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      placeholder="Optional"
                      style={fieldStyle}
                    />
                  </label>

                  <label style={{ gridColumn: 'span 3', minWidth: 0 }}>
                    <span style={fieldLabel}>Prefix</span>
                    <input
                      value={draft.format.split('-')[0] ?? ''}
                      onChange={(e) => setDraft({ ...draft, format: withPrefix(draft.format, e.target.value) })}
                      disabled={!draft.format}
                      style={fieldStyle}
                    />
                  </label>
                  <label style={{ gridColumn: 'span 3', minWidth: 0 }}>
                    <span style={fieldLabel}>Suffix (Optional)</span>
                    <input value={draft.suffix} onChange={(e) => setDraft({ ...draft, suffix: e.target.value })} style={fieldStyle} />
                  </label>

                  <label style={{ gridColumn: 'span 2', minWidth: 0 }}>
                    <span style={fieldLabel}>
                      Starting Number<span style={{ color: 'var(--danger-text)' }}> *</span>
                    </span>
                    <input
                      inputMode="numeric"
                      value={draft.startingNumber}
                      onChange={(e) => setDraft({ ...draft, startingNumber: e.target.value.replace(/\D/g, '') })}
                      style={fieldStyle}
                    />
                  </label>
                  <label style={{ gridColumn: 'span 2', minWidth: 0 }}>
                    <span style={fieldLabel}>
                      Padding Length<span style={{ color: 'var(--danger-text)' }}> *</span>
                    </span>
                    <input
                      inputMode="numeric"
                      value={padding === 0 ? '' : String(padding)}
                      disabled={!draft.format}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/\D/g, ''))
                        if (n > 0) setDraft({ ...draft, format: withPadding(draft.format, n) })
                      }}
                      style={fieldStyle}
                    />
                  </label>
                  <label style={{ gridColumn: 'span 2', minWidth: 0 }}>
                    <span style={fieldLabel}>Separator</span>
                    <select value={draft.separator} onChange={(e) => setDraft({ ...draft, separator: e.target.value })} style={fieldStyle}>
                      {['-', '/', '.', '_', 'none'].map((s) => (
                        <option key={s} value={s}>
                          {s === 'none' ? '(none)' : s}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {tab === 'Format' && (
                <div style={{ marginTop: 11 }}>
                  <label>
                    <span style={fieldLabel}>Format</span>
                    <input
                      value={draft.format}
                      onChange={(e) => setDraft({ ...draft, format: e.target.value.toUpperCase() })}
                      placeholder="No format supplied for this sequence"
                      className="figure"
                      style={fieldStyle}
                    />
                  </label>
                  <p style={{ margin: '8px 0 6px', ...panelNote }}>Tokens, joined by the separator. Spec § Number Format:</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {FORMAT_TOKENS.map((t) => (
                      <div key={t.kind} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 'var(--t-meta)' }}>
                        <span
                          className="figure"
                          style={{
                            minWidth: 62,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: 'var(--card2)',
                            border: '1px solid var(--border)',
                            color: 'var(--text)',
                            fontWeight: 700,
                            textAlign: 'center',
                          }}
                        >
                          {t.placeholder}
                        </span>
                        <span style={{ color: 'var(--text2)', fontWeight: 600 }}>{t.label}</span>
                        <span style={{ color: 'var(--muted)', minWidth: 0 }}>{t.note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === 'Reset Rules' && (
                <div style={{ marginTop: 11 }}>
                  <label style={{ maxWidth: 280, display: 'block' }}>
                    <span style={fieldLabel}>Reset Rule</span>
                    <select
                      value={draft.resetRule}
                      onChange={(e) => setDraft({ ...draft, resetRule: e.target.value as ResetRule })}
                      style={fieldStyle}
                    >
                      {RESET_RULES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p style={{ margin: '9px 0 0', ...panelNote }}>
                    The counter returns to the Starting Number when the rule fires. Nepali Fiscal Year resets on 1 Shrawan;
                    `lib/bs.ts` is the only place that converts a date, and it is not called for a stored value here.
                  </p>
                  <p style={{ margin: '6px 0 0', ...panelNote }}>
                    Spec § Validation Rules — a counter can never move backwards, and an archived sequence generates nothing.
                  </p>
                </div>
              )}

              {tab === 'Scope' && (
                <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {SCOPES.map((s) => (
                    <label key={s} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--t-meta)', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="scope"
                        checked={draft.scope === s}
                        onChange={() => setDraft({ ...draft, scope: s })}
                        style={{ marginTop: 2 }}
                      />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)' }}>{s}</span>
                        <span style={{ display: 'block', color: 'var(--text2)' }}>
                          {s === 'Global'
                            ? 'One counter for the whole company.'
                            : s === 'Per Branch'
                              ? 'A separate counter per branch. The branch code only appears in the ID when the format carries a BR token.'
                              : 'A separate counter per warehouse, keyed on the WH token.'}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {tab === 'Advanced' && (
                <div style={{ marginTop: 11 }}>
                  <StatedGap
                    title="Advanced settings are not specified"
                    body="The render draws this tab but shows no fields on it, and the spec names none. Nothing is invented to fill it — the tab stays empty until a decision supplies its contents."
                  />
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, marginTop: 14 }}>
                <span>
                  <span style={fieldLabel}>Status</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={draft.active}
                      aria-label="Sequence active"
                      onClick={() => setDraft({ ...draft, active: !draft.active })}
                      style={{
                        width: 32,
                        height: 18,
                        borderRadius: 999,
                        border: '1px solid var(--border)',
                        background: draft.active ? BRAND.success : 'var(--card2)',
                        padding: 2,
                        display: 'flex',
                        justifyContent: draft.active ? 'flex-end' : 'flex-start',
                        cursor: 'pointer',
                      }}
                    >
                      {/* §4.2 — the knob takes BRAND_ON. It used to be a raw
                          white literal, which is both a banned hex and under
                          3:1 on the green fill in dark theme. */}
                      <span
                        aria-hidden
                        style={{ width: 12, height: 12, borderRadius: 999, background: draft.active ? BRAND_ON.success : 'var(--muted)' }}
                      />
                    </button>
                    <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{draft.active ? 'Active' : 'Archived'}</span>
                  </span>
                </span>

                <span style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
                  <Button onClick={() => select(selected.code)}>Cancel</Button>
                  <Unavailable reason={WHY_READ_ONLY}>
                    <Button variant="primary" disabled>
                      Save Changes
                    </Button>
                  </Unavailable>
                </span>
              </div>
              <p style={{ margin: '7px 0 0', ...panelNote, textAlign: 'right' }}>
                Edits stay local and drive the preview. Saving needs the confirmation and audit path.
              </p>
            </Card>
          </div>

          <Card title="Sequence Analytics">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={sub}>
                  Records Generated <span style={{ fontWeight: 500, color: 'var(--muted)' }}>({ANALYTICS.generated.note})</span>
                </div>
                <div className="figure" style={{ fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)', marginTop: 5 }}>
                  {ANALYTICS.generated.value}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 'var(--t-meta)', color: 'var(--success-text)', marginTop: 2 }}>
                  <Icon name="arrow_up" size={10} fill />
                  {ANALYTICS.generated.delta}
                </div>
                <div style={{ marginTop: 10 }}>
                  <TrendLine points={ANALYTICS.generated.trend} />
                </div>
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sub}>
                  Daily Generation Trend <span style={{ fontWeight: 500, color: 'var(--muted)' }}>(Last 7 Days)</span>
                </div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 3 }}>{ANALYTICS.dailyTrend.avg}</div>
                <div style={{ display: 'flex', gap: 7, marginTop: 7 }}>
                  <div
                    aria-hidden
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      height: 66,
                      fontSize: 'var(--t-meta)',
                      color: 'var(--muted)',
                      flexShrink: 0,
                      textAlign: 'right',
                    }}
                  >
                    {ANALYTICS.dailyTrend.yTicks.map((t) => (
                      <span key={t} className="figure">
                        {t}
                      </span>
                    ))}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-end', gap: 3, height: 66, borderBottom: '1px solid var(--chart-grid)' }}>
                    {ANALYTICS.dailyTrend.bars.map((b) => (
                      <span
                        key={b.label}
                        style={{ flex: 1, height: `${b.v}%`, background: catColor(0), borderRadius: '3px 3px 0 0', minWidth: 3 }}
                        title={`${b.label}: ${b.v}`}
                      />
                    ))}
                  </div>
                </div>
                <div aria-hidden style={{ display: 'flex', gap: 3, marginTop: 3, paddingLeft: 26 }}>
                  {ANALYTICS.dailyTrend.bars.map((b) => (
                    <span key={b.label} className="figure" style={{ flex: 1, textAlign: 'center', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                      {b.label}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sub}>Top Sequences by Usage</div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', margin: '3px 0 6px' }}>{period}</div>
                {ANALYTICS.topSequences.map((t) => (
                  <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 'var(--t-meta)' }}>
                    <span style={{ width: 66, flexShrink: 0, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.name}
                    </span>
                    {/* One hue — a per-bar rainbow across a single series encodes
                        nothing, which is the rule `Charts.tsx` states for `HBars`. */}
                    <span aria-hidden style={{ flex: 1, minWidth: 0, height: 8, background: 'var(--card2)', borderRadius: 2 }}>
                      <span style={{ display: 'block', width: `${t.pct}%`, height: '100%', background: catColor(3), borderRadius: 2 }} />
                    </span>
                    <span className="figure" style={{ fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>
                      {t.value}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={sub}>Reset History</span>
                  <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>(Last 6 Months)</span>
                  <span style={{ marginLeft: 'auto' }}>
                    <span style={link} aria-disabled title="The full reset log lives in the Audit trail, which is not built yet.">
                      View all
                    </span>
                  </span>
                </div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', margin: '3px 0 6px' }}>
                  Total Resets <span className="figure" style={{ color: 'var(--text)', fontWeight: 600 }}>{ANALYTICS.resetHistory.total}</span>
                </div>
                {ANALYTICS.resetHistory.rows.map((r) => (
                  <div key={r.name} style={{ display: 'flex', gap: 6, padding: '3px 0', fontSize: 'var(--t-meta)' }}>
                    <span style={{ flex: 1, minWidth: 0, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.name}
                    </span>
                    <span style={{ color: 'var(--muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>{r.rule}</span>
                    <span className="figure" style={{ color: 'var(--text)', flexShrink: 0 }}>
                      {r.at}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={sub}>
                  Branch-wise Generation <span style={{ fontWeight: 500, color: 'var(--muted)' }}>({ANALYTICS.generated.note})</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                  <Donut slices={ANALYTICS.branchMix} size={62} />
                  <Legend slices={ANALYTICS.branchMix} />
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Rail>
          <Card
            title="Sequence Summary"
            action={
              <select
                aria-label="Summary period"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                style={{ ...fieldStyle, width: 'auto', height: 26 }}
              >
                {SUMMARY_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            }
          >
            <SummaryRows rows={SUMMARY} />
            <div aria-hidden style={{ height: 6, borderRadius: 999, background: 'var(--card2)', marginTop: 10, overflow: 'hidden' }}>
              <div style={{ width: '100%', height: '100%', background: BRAND.success, borderRadius: 999 }} />
            </div>
            <div style={{ textAlign: 'right', marginTop: 9 }}>
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View Full Report →
              </span>
            </div>
          </Card>

          <Card
            title="Alerts"
            action={
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View All →
              </span>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {ALERTS.map((a) => (
                <div key={a.text} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--t-meta)' }}>
                  <span
                    aria-hidden
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      display: 'grid',
                      placeItems: 'center',
                      border: `1px solid ${BRAND[a.tone]}`,
                      color: BRAND_TEXT[a.tone],
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={a.icon} size={11} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--text2)' }}>{a.text}</span>
                  <span className="figure" style={{ color: 'var(--text)', fontWeight: 600, flexShrink: 0 }}>
                    {a.count}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Quick Actions">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 7 }}>
              {QUICK_ACTIONS.map((q) => {
                const live = q.label === 'Test Sequence'
                const why =
                  q.label === 'Add Sequence'
                    ? 'Creating a sequence needs the confirmation and audit path — not available in this build.'
                    : q.label === 'Reset Counter'
                      ? 'Resetting a counter can re-issue an existing ID — it needs the confirmation and audit path first.'
                      : 'Export (PDF · Excel · JSON · XML) is specified but not built yet.'
                const tile = (
                  <button
                    type="button"
                    disabled={!live}
                    aria-label={q.label}
                    onClick={
                      live
                        ? () => {
                            setTestCount(5)
                            previewRef.current?.scrollIntoView({ block: 'center' })
                          }
                        : undefined
                    }
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      padding: '11px 4px',
                      borderRadius: 'var(--r-btn)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      color: 'var(--text)',
                      fontSize: 'var(--t-meta)',
                      fontWeight: 600,
                      cursor: live ? 'pointer' : 'not-allowed',
                      opacity: live ? 1 : 0.55,
                      fontFamily: 'inherit',
                      textAlign: 'center',
                      lineHeight: 1.25,
                    }}
                  >
                    <Icon name={q.icon} size={17} style={{ color: BRAND[q.tone] }} />
                    {q.label}
                  </button>
                )
                return (
                  <Unavailable
                    key={q.label}
                    style={{ display: 'grid', minWidth: 0 }}
                    reason={live ? 'Jump to the preview generator and roll the next five numbers' : why}
                  >
                    {tile}
                  </Unavailable>
                )
              })}
            </div>
          </Card>

          <Card
            title="Recent Activity"
            action={
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View All →
              </span>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {ACTIVITY.map((a) => (
                <div key={a.what} style={{ display: 'flex', gap: 9 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 7,
                      display: 'grid',
                      placeItems: 'center',
                      background: BRAND[a.tone],
                      color: BRAND_ON[a.tone],
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={a.icon} size={13} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{a.what}</span>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{a.detail}</span>
                    <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{a.at}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="AI Numbering Insights"
            action={
              <span style={link} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                View Insights →
              </span>
            }
          >
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {INSIGHTS.map((t) => (
                <li key={t} style={{ display: 'flex', gap: 8, fontSize: 'var(--t-meta)', alignItems: 'flex-start' }}>
                  <span
                    aria-hidden
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: 999,
                      display: 'grid',
                      placeItems: 'center',
                      border: '1px solid var(--success)',
                      color: 'var(--success-text)',
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    <Icon name="check" size={9} />
                  </span>
                  <span style={{ color: 'var(--text2)' }}>{t}</span>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 11 }}>
              <Unavailable style={{ display: 'grid', minWidth: 0 }} reason="AI analysis is specified but no model is wired up in this build.">
                {/* The wrapper is a grid, so the button stretches to the card's
                    full width the way the render draws it. */}
                <Button icon="sparkles" disabled>
                  Run AI Analysis
                </Button>
              </Unavailable>
            </div>
          </Card>
        </Rail>
      </div>

      <FooterNote
        extra={[
          'Sequence counters are append-only and never reused',
          'Read-only build — no control here writes a counter',
        ]}
      />
    </div>
  )
}
