import { useCallback, useState } from 'react'
import type { CSSProperties } from 'react'
import Icon from '../../components/ui/Icon'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Card, PageHeader, Button, KpiStrip, FooterNote } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import type { Kpi } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { Unavailable } from '../../components/ui/Unavailable'
import { STATUS, BRAND, BRAND_ON } from '../../lib/status'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { canManageSettings } from '../../lib/rbac'
import { toBs, formatBs, formatAdDateTime } from '../../lib/bs'
import { useList } from '../../lib/queries/useList'
import type { ListFilters } from '../../lib/queries/listQuery'
import {
  listNumberSequences,
  numberingRestriction,
  formatConvention,
  previewNextNumber,
  previewNextNumbers,
  type NumberSequenceRow,
  type SequenceShape,
} from '../../lib/queries/numbering'
import '../settings/settings.css'

/**
 * Administration → **Numbering Sequences** — the registry the product really
 * mints from.
 *
 * Converted from seed to live 21 Aug 2026 (Phase 1 item 1.5c). This page now
 * reads the REAL `number_sequences` table via `lib/queries/numbering.ts` — the
 * exact rows `next_document_number()` takes `for update` when a booking,
 * client, invoice or membership number is issued. The 20-row display registry
 * in `data/numbering.ts` is no longer rendered here; it remains alive because
 * `actions/documents/createDocument.ts`, `actions/inventory/createEquipment.ts`
 * and friends still read `prefixOf`/`issue` from it — reconciling those onto
 * the DB allocator is later wiring, not this screen's.
 *
 * ## The preview never consumes a number
 *
 * `next_document_number()` has no dry-run: it advances `current_value` before
 * returning (0055:140-180), so this screen NEVER calls the RPC. The Next
 * Number column and the preview panel are `previewNextNumbers()` — a pure
 * restatement of the function's own formatting rules over the row already
 * fetched. Read-only by construction; a concurrent mint can outdate the
 * preview, nothing on this page can advance a counter.
 *
 * ## What the seed build drew that this one deliberately does not
 *
 * The old screen rendered `data/numbering.ts` plus invented figures the page
 * doc (docs/pages/53) itemises: "Records Generated Today 486", "2 mins ago",
 * "Sequence Health 100%", 11 trend points, five Top-Sequences counts, a reset
 * history, a branch-mix donut, four Recent Activity entries and an Alerts
 * card. None of those is a question `number_sequences` (or any live table)
 * answers today, so under Law 16 they are removed rather than re-faked — the
 * KPI strip below asks only what the schema can answer (row counts and
 * `updated_at`), the same move the Audit Log conversion made.
 *
 * Columns the seed table drew that the DB does not carry — Sequence Name,
 * Module, Description, Format string, Reset Rule, Scope, Status — are likewise
 * gone rather than invented: the live table's vocabulary is `sequence_key`,
 * `prefix`, `padding`, `include_year`, `current_year`, `current_value`,
 * `updated_at`, and the Format column here is derived from those
 * (`formatConvention`), so it can never disagree with what the RPC produces.
 *
 * ## Writes stay stated-unavailable
 *
 * §10.6's warning stands: *"editing a live sequence is gated and written to
 * audit"* — a wrong counter mints duplicate IDs product-wide. The
 * configuration panel edits a LOCAL draft of the three live format columns and
 * drives the preview with it; Save Changes remains `Unavailable` until the
 * confirmation-and-audit action path exists. Phase 2.7 put the draft editor
 * itself behind the settings gate (`canManageSettings` — the same tier
 * Settings edits under): a non-settings role reads a stated gate in the
 * Sequence Configuration card instead of a draft form whose only purpose is
 * staging a write that role may never make. The gate is deliberately narrower
 * than the table's own RLS (`number_sequences_all` is `auth_is_staff()`,
 * 0033 — broad so document creation can advance counters through the RPC);
 * §10.6's rule is about EDITING a sequence's format, and that is what this
 * gates. Refresh, previously a stated dead button ("nothing to refresh —
 * static seed"), is now a real refetch.
 *
 * ## Who sees anything at all
 *
 * `number_sequences_select` is `auth_is_staff()` (0033:46-49). The route's
 * money-surface guard already stops the floor roles at `/admin/*`, but the
 * screen gates on the table's own policy (`numberingRestriction`) so an
 * RLS-empty result can never render as "no sequences exist". No money column
 * exists on the table, so Law 6 withholds nothing on this surface.
 *
 * ## Mock mode
 *
 * `number_sequences` is not in the mock corpus and not in its `UNSERVED`
 * banner list; the mock engine answers with `[]` plus a console warning, so
 * this page degrades to `PageBody`'s honest empty state — the copy below says
 * exactly why the registry can read empty.
 */

/** Every unavailable write on this page states the same reason. */
const WHY_READ_ONLY =
  'Not available in this build — a sequence write mints IDs product-wide and needs the confirmation and audit path first.'

/**
 * Phase 2.7 — what a non-settings role reads where the draft editor would be.
 * The gate is `canManageSettings`, the same tier Settings edits under (Owner
 * today; the role set lives in `rbac.ts`, not here).
 */
const SETTINGS_ONLY_UNAVAILABLE =
  'Sequence configuration is gated by canManageSettings — the same tier Settings edits under (Owner today). ' +
  'A sequence write mints IDs product-wide. The registry and the preview stay readable for every staff role; ' +
  'only drafting a format change is withheld, because its sole purpose is staging a write this role may not make.'

const th: CSSProperties = {
  textAlign: 'left',
  padding: '9px 12px',
  fontSize: 'var(--t-th)',
  fontWeight: 700,
  color: 'var(--text2)',
  whiteSpace: 'nowrap',
}

/*
 * §7.3's row floor ("rows >= 56px"), carried by the token rather than by
 * padding arithmetic: `height` on a `<td>` behaves as a MINIMUM, so it lifts
 * the single-line rows while the two-line ones (`currentValue` with its
 * "in <year>" line, `WhenCell` with BS above AD) keep the height they compute.
 *
 * Worth stating even though this registry is read-only in this build. The floor
 * is what makes a 44px hit area fit inside its own row instead of overhanging
 * the neighbour, where the row later in the DOM wins the tap. The
 * `SETTINGS_ONLY_UNAVAILABLE` note above describes a GATE, not an absence: the
 * moment the draft editor is ungated this table grows a per-sequence control,
 * and a sequence write mints IDs product-wide. A row that was already tall
 * enough cannot be the reason such a write lands on the wrong sequence.
 */
const td: CSSProperties = {
  height: 'var(--row-min-h)',
  padding: '11px 12px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
}

const fieldLabel: CSSProperties = {
  display: 'block',
  fontSize: 'var(--t-th)',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--muted)',
  marginBottom: 5,
}

/** Law 15 — 44px minimum on every input, desktop included. */
const fieldStyle: CSSProperties = {
  width: '100%',
  minHeight: 44,
  padding: '8px 12px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-body)',
  fontFamily: 'inherit',
}

const panelNote: CSSProperties = { fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.6 }

/**
 * BS above AD — the pair the footer promises. `toBs` vouches for one month
 * only and returns `null` outside it; a null becomes an omitted line rather
 * than a wrong date (Law 7 — BS is rendered, never stored).
 */
function WhenCell({ iso }: { iso: string }) {
  const d = new Date(iso)
  const bs = Number.isNaN(d.getTime()) ? null : toBs(d)
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      {bs && <span className="figure">{formatBs(bs)}</span>}
      <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
        {formatAdDateTime(iso)}
      </span>
    </span>
  )
}

/** Law 11 — colour + icon + label, never colour alone. */
function YearSegmentChip({ includeYear }: { includeYear: boolean }) {
  const tone = includeYear ? STATUS.progress : STATUS.in
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 21,
        padding: '0 8px',
        borderRadius: 'var(--r-badge)',
        background: tone.bg,
        color: tone.fg,
        fontSize: 'var(--t-th)',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name={includeYear ? 'calendar' : 'check'} size={11} />
      {includeYear ? 'Resets yearly' : 'Continuous'}
    </span>
  )
}

function PrefixChip({ prefix }: { prefix: string }) {
  return (
    <span
      className="figure"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 20,
        padding: '0 7px',
        borderRadius: 'var(--r-chip)',
        /*
         * A prefix is an IDENTIFIER, not a state.
         *
         * This wore `STATUS.primary` — the hue v4.1 §2 assigns exactly one
         * meaning, "committed / scheduled". Spending it on a literal string
         * like "INV-" teaches the eye that blue means nothing in particular,
         * which is the whole failure the seven-hue table exists to prevent
         * ("a hue never means two things").
         *
         * A recessed surface reads as "this is a value" without claiming a
         * status. The mono face (`className="figure"`, already here) is what
         * actually signals identifier-ness.
         */
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        color: 'var(--text2)',
        fontSize: 'var(--t-meta)',
        fontWeight: 700,
      }}
    >
      {prefix}
    </span>
  )
}

/**
 * §10.6's phone layout — one sequence per card, the preview under the fields.
 * The preview string is passed in so a card and a table row can only ever
 * print the same figure.
 */
function SequenceCard({ row, next }: { row: NumberSequenceRow; next: string }) {
  return (
    <article style={{ borderTop: '1px solid var(--border)', padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="identifier" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
          {row.sequenceKey}
        </span>
        <PrefixChip prefix={row.prefix} />
        <span style={{ marginLeft: 'auto' }}>
          <YearSegmentChip includeYear={row.includeYear} />
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '6px 10px' }}>
        <CardField label="Format" value={formatConvention(row)} mono />
        <CardField label="Padding" value={String(row.padding)} />
        <CardField label="Counter" value={String(row.currentValue)} />
      </div>

      <div
        style={{
          padding: '9px 11px',
          borderRadius: 'var(--r-btn)',
          border: '1px solid var(--border)',
          background: 'var(--card2)',
        }}
      >
        <span style={{ display: 'block', fontSize: 'var(--t-th)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          Next number
        </span>
        <span className="identifier" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
          {next}
        </span>
      </div>

      <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'baseline' }}>
        <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Last advanced</span>
        <WhenCell iso={row.updatedAtAd} />
      </div>
    </article>
  )
}

function CardField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <span style={{ fontSize: 'var(--t-th)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        {label}
      </span>
      <span className={mono ? 'identifier' : 'figure'} style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', fontWeight: 600 }}>
        {value}
      </span>
    </span>
  )
}

/**
 * The configuration panel's LOCAL draft of the three live format columns.
 * Keyed to its sequence so a selection change discards a stale draft without
 * an effect; `paddingText` is text so the field can be emptied mid-edit.
 */
interface Draft {
  key: string
  prefix: string
  paddingText: string
  includeYear: boolean
}

function draftOf(row: NumberSequenceRow): Draft {
  return { key: row.sequenceKey, prefix: row.prefix, paddingText: String(row.padding), includeYear: row.includeYear }
}

/** The RPC `lpad`s to whatever is stored; the draft clamps to 1–12 as the old build did — 1 IS "no padding". */
function draftPadding(text: string): number {
  const n = Number.parseInt(text, 10)
  if (Number.isNaN(n) || n < 1) return 1
  return Math.min(n, 12)
}

export default function NumberingSequences() {
  const viewport = useViewport()
  const { user } = useAuth()

  /* RLS on `number_sequences` admits staff only (0033). A Client session gets
     zero rows — restricted, never empty. */
  const restriction = numberingRestriction(user?.role)

  /* Phase 2.7 — the draft editor's gate. See SETTINGS_ONLY_UNAVAILABLE. */
  const mayManage = canManageSettings(user?.role ?? 'Client')

  const fetchSequences = useCallback((f: ListFilters) => listNumberSequences({ ...f, withCount: true }), [])
  /* The whole registry, unpaged and unfiltered — one row per document kind,
     bounded by migration, so there is nothing for a filter bar to do. */
  const list = useList<NumberSequenceRow>(fetchSequences, {})

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected = list.rows.find((r) => r.sequenceKey === selectedKey) ?? list.rows[0] ?? null

  const [draft, setDraft] = useState<Draft | null>(null)
  /* A draft belongs to one sequence; when the selection moves, the stale draft
     is ignored and the stored row is re-drafted — no effect needed. */
  const activeDraft = selected ? (draft && draft.key === selected.sequenceKey ? draft : draftOf(selected)) : null

  const [testCount, setTestCount] = useState(0)

  function select(key: string) {
    setSelectedKey(key)
    setTestCount(0)
  }

  /* ── KPI figures — questions the schema answers, derived from the ONE full
        fetch (the registry is the whole table; nothing here narrows the list
        client-side). '—' while unknown, never a fabricated 0. ─────────────── */

  const known = !list.loading && list.error === null
  let yearless = 0
  let yearScoped = 0
  let lastMoved: string | null = null
  for (const r of list.rows) {
    if (r.includeYear) yearScoped += 1
    else yearless += 1
    if (lastMoved === null || Date.parse(r.updatedAtAd) > Date.parse(lastMoved)) lastMoved = r.updatedAtAd
  }

  const kpis: Kpi[] = [
    {
      label: 'Registered Sequences',
      value: known && list.total !== null ? String(list.total) : known ? String(list.rows.length) : '—',
      icon: 'file',
      accent: 'primary',
      note: 'One per document kind',
    },
    {
      label: 'Year-less',
      value: known ? String(yearless) : '—',
      icon: 'check',
      accent: 'success',
      note: 'Continuous counter — never resets',
    },
    {
      label: 'Year-scoped',
      value: known ? String(yearScoped) : '—',
      icon: 'calendar',
      accent: 'progress',
      note: 'Counter restarts each calendar year',
    },
    {
      label: 'Last Advanced',
      value: known && lastMoved !== null ? formatAdDateTime(lastMoved) : '—',
      icon: 'timer',
      accent: 'neutral',
      note: 'Most recent counter movement',
    },
  ]

  /* ── the selected sequence's stored shape, and the draft's what-if shape ── */

  const selectedShape: SequenceShape | null = selected
    ? {
        prefix: selected.prefix,
        padding: selected.padding,
        includeYear: selected.includeYear,
        currentYear: selected.currentYear,
        currentValue: selected.currentValue,
      }
    : null

  const draftShape: SequenceShape | null =
    selected && activeDraft
      ? {
          prefix: activeDraft.prefix,
          padding: draftPadding(activeDraft.paddingText),
          includeYear: activeDraft.includeYear,
          currentYear: selected.currentYear,
          currentValue: selected.currentValue,
        }
      : null

  const draftChanged =
    selected !== null &&
    draftShape !== null &&
    (draftShape.prefix !== selected.prefix ||
      draftShape.padding !== selected.padding ||
      draftShape.includeYear !== selected.includeYear)

  const testNumbers = selectedShape && testCount > 0 ? previewNextNumbers(selectedShape, testCount) : []

  return (
    <div className="settings-v2" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
      <PageHeader
        icon="queues"
        title="Numbering Sequences"
        description="The live registry next_document_number() mints from — one counter per document kind, read directly from the database."
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
            {/* Live since the conversion: this re-reads the registry. The seed
                build stated "nothing to refresh"; that is no longer true. */}
            <Button icon="refresh" onClick={list.refetch}>
              Refresh
            </Button>
          </>
        }
      />

      {/* KPI counts would leak how much of a registry exists to a session RLS
          refuses, so the strip renders only past the restriction. */}
      {!restriction.restricted && <KpiStrip items={kpis} columns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : 4} />}

      <PageBody
        {...restriction}
        loading={list.loading}
        error={list.error}
        onRetry={list.refetch}
        hasRows={list.rows.length > 0}
        empty={list.isEmpty}
        emptyIsFiltered={list.isFiltered}
        noun="number sequences"
        skeleton="table"
        skeletonRows={6}
        emptyTitle="No sequences in the registry"
        emptyMessage={
          'The live database seeds this table (migrations 0012, 0055, 0056 — ten sequences). ' +
          'An empty read means this session’s data source serves none: the mock corpus does not carry number_sequences.'
        }
      >
        <Card
          title="Sequence Registry"
          action={
            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              Next numbers are computed read-only — only next_document_number() mints.
            </span>
          }
          bodyStyle={{ padding: 0 }}
        >
          {viewport === 'phone' ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {list.rows.map((r) => (
                <SequenceCard key={r.sequenceKey} row={r} next={previewNextNumber(r)} />
              ))}
            </div>
          ) : (
            <div className="admin-table-shell">
              <DataTableShell ariaLabel="Document numbering sequences" data-table-scroll style={{ overflowX: 'auto' }}>
                <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Sequence', 'Prefix', 'Format', 'Padding', 'Year Segment', 'Current Counter', 'Next Number', 'Last Advanced'].map((h) => (
                        <th key={h} className="admin-th" style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list.rows.map((r) => (
                      <tr key={r.sequenceKey} className="admin-row" style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="identifier admin-td settings-mono" style={{ ...td, fontWeight: 700 }}>
                          {r.sequenceKey}
                        </td>
                        <td className="admin-td" style={td}>
                          <PrefixChip prefix={r.prefix} />
                        </td>
                        {/* Derived from the row's own columns (formatConvention),
                            so this column can never disagree with the generator. */}
                        <td className="identifier admin-td settings-mono" style={{ ...td, color: 'var(--text2)' }}>
                          {formatConvention(r)}
                        </td>
                        <td className="figure admin-td settings-mono" style={{ ...td, color: 'var(--text2)' }}>
                          {r.padding}
                        </td>
                        <td className="admin-td" style={td}>
                          <YearSegmentChip includeYear={r.includeYear} />
                        </td>
                        <td className="figure admin-td settings-mono" style={{ ...td, fontWeight: 600 }}>
                          {r.currentValue}
                          {r.includeYear && (
                            <span className="figure settings-mono" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 500 }}>
                              in {r.currentYear}
                            </span>
                          )}
                        </td>
                        <td
                          className="identifier admin-td settings-mono"
                          style={{ ...td, fontWeight: 700 }}
                          title="Computed from the stored counter via the next_document_number() convention — reading this consumes nothing."
                        >
                          {previewNextNumber(r)}
                        </td>
                        <td className="admin-td" style={{ ...td, color: 'var(--text2)' }}>
                          <WhenCell iso={r.updatedAtAd} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
            </div>
          )}
        </Card>

        {selected && selectedShape && activeDraft && draftShape && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: viewport === 'phone' ? 'minmax(0,1fr)' : 'repeat(2, minmax(0,1fr))',
              gap: 'var(--sp-md)',
              marginTop: 'var(--sp-md)',
              alignItems: 'start',
            }}
          >
            <Card title="Next Number Preview">
              <label style={{ display: 'block' }}>
                <span style={fieldLabel}>Select Sequence</span>
                <Select value={selected.sequenceKey} onChange={(e) => select(e.target.value)} style={fieldStyle}>
                  {list.rows.map((r) => (
                    <option key={r.sequenceKey} value={r.sequenceKey}>
                      {r.sequenceKey} ({r.prefix})
                    </option>
                  ))}
                </Select>
              </label>

              <div style={{ marginTop: 'var(--sp-md)' }}>
                <span style={fieldLabel}>Next Number</span>
                <div
                  className="identifier settings-mono"
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
                  {previewNextNumber(selectedShape)}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-md)', marginTop: 11, flexWrap: 'wrap' }}>
                {[
                  { l: 'Format', v: formatConvention(selectedShape), mono: true },
                  { l: 'Current Counter', v: String(selected.currentValue), mono: false },
                  { l: 'Padding', v: String(selected.padding), mono: false },
                  { l: 'Year Segment', v: selected.includeYear ? `Yes — ${selected.currentYear}` : 'No', mono: false },
                ].map((x) => (
                  <span key={x.l} style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{x.l}</span>
                    <span
                      className={x.mono ? 'identifier' : 'figure'}
                      style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginTop: 1 }}
                    >
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
                    <li key={n} className="identifier" style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                      <span className="figure" style={{ color: 'var(--muted)', marginRight: 5 }}>{i + 1}.</span>
                      {n}
                    </li>
                  ))}
                </ol>
              )}

              <p style={{ margin: '9px 0 0', ...panelNote }}>
                Computed from the stored counter using next_document_number()&rsquo;s own formatting rules (0055). The RPC has no
                dry-run — calling it consumes a number — so nothing on this page invokes it, and a concurrent mint elsewhere can
                outdate this preview without this page ever advancing a counter.
              </p>
            </Card>

            {!mayManage ? (
              <Card title="Sequence Configuration">
                {/* Phase 2.7 — the gate, stated rather than a form that quietly
                    saves nothing this role could ever persist. Inert on
                    purpose: no field, no switch, no disabled Save to poke. */}
                <div role="note" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Icon name="lock" size={16} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
                  <p style={{ margin: 0, ...panelNote }}>{SETTINGS_ONLY_UNAVAILABLE}</p>
                </div>
              </Card>
            ) : (
            <Card title="Sequence Configuration">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 9 }}>
                <label style={{ minWidth: 0 }}>
                  <span style={fieldLabel}>Prefix</span>
                  <Input
                    value={activeDraft.prefix}
                    onChange={(e) =>
                      setDraft({ ...activeDraft, prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })
                    }
                    className="identifier"
                    style={fieldStyle}
                  />
                </label>
                <label style={{ minWidth: 0 }}>
                  <span style={fieldLabel}>Padding Length</span>
                  <Input
                    inputMode="numeric"
                    value={activeDraft.paddingText}
                    onChange={(e) => setDraft({ ...activeDraft, paddingText: e.target.value.replace(/\D/g, '') })}
                    className="figure"
                    style={fieldStyle}
                  />
                </label>
              </div>

              <div style={{ marginTop: 11 }}>
                <span style={fieldLabel}>Year Segment</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={activeDraft.includeYear}
                    aria-label="Include a year segment"
                    onClick={() => setDraft({ ...activeDraft, includeYear: !activeDraft.includeYear })}
                    style={{
                      /* Law 15 — the pressable area is 44px even though the
                         drawn track is smaller. */
                      minWidth: 44,
                      minHeight: 44,
                      display: 'grid',
                      placeItems: 'center',
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 32,
                        height: 18,
                        borderRadius: 'var(--r-badge)',
                        border: '1px solid var(--border)',
                        background: activeDraft.includeYear ? BRAND.progress : 'var(--card2)',
                        padding: 2,
                        display: 'flex',
                        justifyContent: activeDraft.includeYear ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 'var(--r-badge)',
                          background: activeDraft.includeYear ? BRAND_ON.progress : 'var(--muted)',
                        }}
                      />
                    </span>
                  </button>
                  <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                    {activeDraft.includeYear
                      ? 'Year in the number — counter restarts each calendar year'
                      : 'No year — continuous counter, never resets'}
                  </span>
                </span>
              </div>

              <div style={{ marginTop: 'var(--sp-md)' }}>
                <span style={fieldLabel}>Draft Preview</span>
                <div
                  className="identifier"
                  aria-live="polite"
                  style={{
                    padding: '9px 12px',
                    borderRadius: 'var(--r-btn)',
                    border: `1px solid ${draftChanged ? BRAND.progress : 'var(--border)'}`,
                    background: 'var(--card2)',
                    fontSize: 'var(--t-ui)',
                    fontWeight: 700,
                    color: 'var(--text)',
                    letterSpacing: '0.04em',
                    textAlign: 'center',
                    overflowX: 'auto',
                  }}
                >
                  {previewNextNumber(draftShape)}
                </div>
                {draftChanged && (
                  <p style={{ margin: '6px 0 0', ...panelNote }}>
                    <Icon name="info" size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    Draft differs from the stored row — nothing is saved, the preview is the only thing this changes.
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 7, marginTop: 14 }}>
                <Button onClick={() => setDraft(draftOf(selected))}>Cancel</Button>
                <Unavailable reason={WHY_READ_ONLY}>
                  <Button variant="primary" disabled>
                    Save Changes
                  </Button>
                </Unavailable>
              </div>
              <p style={{ margin: '7px 0 0', ...panelNote, textAlign: 'right' }}>
                Edits stay local and drive the preview. Saving needs the confirmation and audit path.
              </p>
            </Card>
            )}
          </div>
        )}
      </PageBody>

      <FooterNote
        extra={[
          'Sequence counters are append-only and never reused',
          'Numbers are minted only by next_document_number() — no control here writes a counter',
        ]}
      />
    </div>
  )
}
