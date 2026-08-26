import { Fragment, useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import Icon from '../../components/ui/Icon'
import { PageHeader, KpiStrip, FooterNote, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { toBs, formatBs, formatAdDateTime } from '../../lib/bs'
import { useList } from '../../lib/queries/useList'
import type { ListFilters } from '../../lib/queries/listQuery'
import type { Json } from '../../types/supabase'
import {
  listAuditEvents,
  auditRestriction,
  auditPeriodFilters,
  AUDIT_KPI_FILTERS,
  AUDIT_MODULES,
  AUDIT_ACTOR_ROLES,
  AUDIT_PERIODS,
  type AuditEventListRow,
  type AuditPeriod,
} from '../../lib/queries/audit'

/**
 * **Audit Log — `10_TOOLS.md` §10.4.**
 *
 * ```
 * ┌ ← Audit Log            [entity ▾][user ▾][date ▾] ┐
 * │ when │ who │ action │ entity │ before → after │ ▸ │
 * │ Append-only. View-only for every role including   │
 * │ Owner. No edit, no delete, no bulk action         │
 * │ anywhere on this page.                            │
 * └───────────────────────────────────────────────────┘
 * PHONE: card rows, ▸ expands the before/after diff.
 * ```
 *
 * Reads the REAL trail: `audit_events` via `lib/queries/audit.ts` — the table
 * `lib/audit.ts` `logAuditEvent` writes on every covered verb. The six seeded
 * literals this file used to render (`data/auditLog.ts AUDIT_ROWS`) are gone;
 * filtering and paging are server-side per `listQuery.ts`, with `id` as the
 * stable tiebreak.
 *
 * ## The absence is the feature
 *
 * §10.4's last two lines are the whole specification of this screen's
 * behaviour, and they are a list of things that must **not** exist. So, stated
 * plainly for the next reader and for any audit of this file:
 *
 *  · There is no row checkbox, no select-all, and no bulk action bar.
 *  · There is no edit control, inline or otherwise. Nothing on this page is an
 *    `<input>` — the three filters are `<select>`s, which change what is shown
 *    and nothing else.
 *  · There is no delete, void, archive or hide. Law 3 gives every entity a named
 *    terminal action; an audit **entry** is not an entity with a lifecycle — it
 *    is the record of one, and it has no terminal action at all. The DB agrees:
 *    the table is immutable at the API layer and backstopped in 0046.
 *  · **Owner is not special here.** No role unlocks a write, because there is
 *    no write to unlock — a trail an administrator can edit is not a trail.
 *
 * `lib/queries/audit.ts` holds the same line: it exports `listAuditEvents` and
 * nothing that mutates.
 *
 * ## Who sees anything at all
 *
 * `audit_events_select` admits Owner/Admin/Manager only (0018:179-184), while
 * the route is reachable by five roles. A Coordinator or Accounts session gets
 * zero rows from RLS — which must render as **restricted, never empty** —
 * so `auditRestriction()` is spread into `PageBody`, whose ladder puts
 * restricted above everything. The old per-column network gate is gone with
 * the seed: every session that receives rows at all is one of the three
 * investigation roles, so the Network column renders whenever rows do.
 *
 * The `←` is wireframe shorthand for "this is a sub-page" (`PLAN.md` Phase 5,
 * Rulings §4). The crumb trail lives in the shell; there is no Back button.
 *
 * The KPI strip predates this spec and no prose removes it — Rulings §1, *"a
 * panel survives unless a spec removes it in prose."* Its four figures are now
 * `count` queries against the live table (`AUDIT_KPI_FILTERS`), each a question
 * the schema can answer; the seed's Voided/Archived/Reversals could not be
 * asked of `audit_action` and are replaced, not re-faked.
 */

const ALL = 'All'
const PAGE_SIZE = 25

/** Stated policy, quoted from the schema's own default — `audit_settings.retention_period` defaults to '7 Years' (0007:280). */
const RETENTION_NOTE = 'Retention policy: 7 years, the audit_settings default.'

/** A KPI figure, or an explicit non-value while it is unknown — never a fabricated 0. */
function countOf(list: { loading: boolean; error: string | null }, value: number | null): string {
  return list.loading || list.error !== null || value === null ? '—' : String(value)
}

export default function AuditLog() {
  const viewport = useViewport()
  const { user } = useAuth()

  /* RLS on `audit_events` admits Owner/Admin/Manager only. Everyone else who
     can reach this route gets zero rows — restricted, never empty. */
  const restriction = auditRestriction(user?.role)

  const [module, setModule] = useState<string>(ALL)
  const [role, setRole] = useState<string>(ALL)
  const [period, setPeriod] = useState<AuditPeriod>('All time')
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)

  /* Every filter change goes through here so the page resets and no row stays
     expanded across a result set it is no longer part of. */
  const patch = useCallback((apply: () => void) => {
    apply()
    setPage(0)
    setExpanded(null)
  }, [])

  /* The COMPLETE filter set, server-side. An "All" select sends an empty chip
     group, which `applyListFilters` reads as no constraint. Sort (created_at
     desc) and tiebreak (id) are the fetcher's own defaults. */
  const filters: ListFilters = {
    ...auditPeriodFilters(period),
    chips: {
      module: module === ALL ? [] : [module],
      actor_role: role === ALL ? [] : [role],
    },
    page: { index: page, size: PAGE_SIZE },
  }

  const fetchEvents = useCallback((f: ListFilters) => listAuditEvents({ ...f, withCount: true }), [])
  const list = useList<AuditEventListRow>(fetchEvents, filters)

  /* Four count queries (one-row pages, `total` read, rows ignored) — the
     RentalsList KPI pattern. A KPI is never "filtered": its set is the card's
     own definition. */
  const entriesKpi = useList<AuditEventListRow>(fetchEvents, AUDIT_KPI_FILTERS.entries, { isFilteredOverride: false })
  const failedKpi = useList<AuditEventListRow>(fetchEvents, AUDIT_KPI_FILTERS.failed, { isFilteredOverride: false })
  const blockedKpi = useList<AuditEventListRow>(fetchEvents, AUDIT_KPI_FILTERS.blocked, { isFilteredOverride: false })
  const criticalKpi = useList<AuditEventListRow>(fetchEvents, AUDIT_KPI_FILTERS.critical, { isFilteredOverride: false })

  const kpis: Kpi[] = [
    { label: 'Entries', value: countOf(entriesKpi, entriesKpi.total), icon: 'file', accent: 'primary', note: 'Whole trail' },
    { label: 'Failed', value: countOf(failedKpi, failedKpi.total), icon: 'error', accent: 'danger', note: 'Writes that did not land' },
    { label: 'Blocked', value: countOf(blockedKpi, blockedKpi.total), icon: 'lock', accent: 'neutral', note: 'Refused by policy' },
    { label: 'Critical', value: countOf(criticalKpi, criticalKpi.total), icon: 'alert_triangle', accent: 'danger', note: 'Highest severity' },
  ]

  const clearFilters = useCallback(() => {
    patch(() => {
      setModule(ALL)
      setRole(ALL)
      setPeriod('All time')
    })
  }, [patch])

  /* The net under the pager: a page past the end of a freshly-narrowed list
     would ask Postgres for rows that do not exist. */
  const pageCount = list.total === null ? null : Math.max(1, Math.ceil(list.total / PAGE_SIZE))
  useEffect(() => {
    if (pageCount !== null && page > pageCount - 1) setPage(Math.max(0, pageCount - 1))
  }, [pageCount, page])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
      <PageHeader
        icon="lock"
        title="Audit Log"
        description="Append-only record of every state change. View-only for every role, Owner included."
      />

      {/* KPI counts and the filter row would leak "how much history exists" to
          a session RLS refuses, so both render only past the restriction. */}
      {!restriction.restricted && (
        <>
          <KpiStrip items={kpis} columns={4} />

          {/* §10.4's `[entity ▾][user ▾][date ▾]`. The only inputs on the page.
              Module is the schema's own entity vocabulary; the actor filter is
              by ROLE because `users` is self-scoped and names cannot honestly
              be listed (see `lib/queries/audit.ts`). */}
          <div
            role="search"
            aria-label="Filter the audit trail"
            style={{
              display: 'grid',
              gridTemplateColumns: viewport === 'phone' ? 'minmax(0,1fr)' : 'repeat(3, minmax(0,1fr))',
              gap: 'var(--sp-sm)',
            }}
          >
            <Filter
              label="Module"
              value={module}
              onChange={(v) => patch(() => setModule(v))}
              options={AUDIT_MODULES}
              allLabel="All modules"
            />
            <Filter
              label="Actor role"
              value={role}
              onChange={(v) => patch(() => setRole(v))}
              options={AUDIT_ACTOR_ROLES}
              allLabel="All roles"
            />
            <Filter
              label="Period"
              value={period}
              onChange={(v) => patch(() => setPeriod(AUDIT_PERIODS.find((p) => p === v) ?? 'All time'))}
              options={AUDIT_PERIODS}
            />
          </div>
        </>
      )}

      <PageBody
        {...restriction}
        loading={list.loading}
        error={list.error}
        onRetry={list.refetch}
        hasRows={list.rows.length > 0}
        empty={list.isEmpty}
        emptyIsFiltered={list.isFiltered}
        onClearFilters={clearFilters}
        noun="audit events"
        skeleton="table"
        skeletonRows={6}
        {...(!list.isFiltered
          ? {
              emptyTitle: 'Nothing in the trail yet',
              emptyMessage:
                'Every covered state change writes a row here as it happens. ' +
                'An empty trail means nothing has been recorded — never that something was removed.',
            }
          : {})}
      >
        {viewport === 'phone' ? (
          /* PHONE: card rows, `▸` expands the before/after diff. */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
            {list.rows.map((r) => (
              <AuditCard
                key={r.id}
                row={r}
                open={expanded === r.id}
                onToggle={() => setExpanded((cur) => (cur === r.id ? null : r.id))}
              />
            ))}
          </div>
        ) : (
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    <th style={th}>When</th>
                    <th style={th}>Who</th>
                    <th style={th}>Action</th>
                    <th style={th}>Entity</th>
                    <th style={th}>Before → after</th>
                    <th style={th}>Network</th>
                    {/* No global `.sr-only` exists in this build — off-screen
                        inline, the same pattern BookingDetail.tsx uses. */}
                    <th style={{ ...th, width: 44 }}>
                      <span style={srOnly}>Detail</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((r) => {
                    const open = expanded === r.id
                    const changes = auditChanges(r)
                    const first = changes[0]
                    return (
                      <Fragment key={r.id}>
                        <tr style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ ...td, color: 'var(--text2)' }}>
                            <WhenCell iso={r.createdAtAd} />
                          </td>
                          <td style={{ ...td, fontWeight: 600 }}>
                            {r.actorRole ?? '—'}
                            <span
                              className="identifier"
                              title={r.actorId ?? undefined}
                              style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 500 }}
                            >
                              {shortId(r.actorId)}
                            </span>
                          </td>
                          <td style={td}>
                            <ActionPill action={r.action} />
                          </td>
                          <td style={td}>
                            <span className="identifier">{r.tableName}</span>
                            <span
                              className="identifier"
                              title={r.recordId}
                              style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}
                            >
                              {shortId(r.recordId)}
                            </span>
                          </td>
                          <td style={{ ...td, whiteSpace: 'normal' }}>
                            {first ? (
                              <Diff before={first.before} after={first.after} />
                            ) : (
                              <span style={{ color: 'var(--muted)' }}>{r.reason ?? '—'}</span>
                            )}
                            {changes.length > 1 && (
                              <span style={{ marginLeft: 8, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                                +{changes.length - 1} more
                              </span>
                            )}
                          </td>
                          <td style={{ ...td, color: 'var(--muted)' }}>
                            {r.ipAddress ? <span className="figure">{r.ipAddress}</span> : '—'}
                          </td>
                          <td style={td}>
                            <DiscloseButton
                              open={open}
                              onToggle={() => setExpanded((cur) => (cur === r.id ? null : r.id))}
                              row={r}
                            />
                          </td>
                        </tr>
                        {open && (
                          <tr style={{ background: 'var(--card2)' }}>
                            <td colSpan={7} style={{ ...td, whiteSpace: 'normal', padding: '12px 14px' }}>
                              <ChangeDetail row={r} changes={changes} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Server-side paging. `withCount: true` makes the caption a count of
            the whole matching set, not of the page in hand. */}
        {pageCount !== null && pageCount > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--sp-md)',
              marginTop: 'var(--sp-md)',
            }}
          >
            <PagerButton
              label="Previous page"
              icon="chevron_left"
              disabled={page === 0}
              onClick={() => {
                setPage((p) => Math.max(0, p - 1))
                setExpanded(null)
              }}
            />
            <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              Page {page + 1} of {pageCount}
              {list.total !== null ? ` · ${list.total} entries` : ''}
            </span>
            <PagerButton
              label="Next page"
              icon="chevron_right"
              disabled={page >= pageCount - 1}
              onClick={() => {
                setPage((p) => p + 1)
                setExpanded(null)
              }}
            />
          </div>
        )}
      </PageBody>

      <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.6 }}>
        Append-only. View-only for every role including Owner — this page carries no edit, no delete and no bulk action, by
        specification. {RETENTION_NOTE}
      </p>

      <FooterNote />
    </div>
  )
}

/* ── derived view-model ──────────────────────────────────────────────────── */

interface AuditFieldChange {
  field: string
  before: string
  after: string
}

/** A `jsonb` scalar → words. `null`/absent is an em-dash, never invented text. */
function fmtValue(v: Json | undefined): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return v === '' ? '—' : v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

function isJsonObject(v: Json | null): v is { [key: string]: Json | undefined } {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * §10.4's `before → after`, derived from the two snapshots the writer recorded.
 *
 * The union of keys across `old_values` and `new_values`, keeping only the
 * fields that actually differ. The `diff` column is deliberately NOT read — no
 * ruling fixes its shape (`lib/queries/audit.ts`), and deriving from the
 * snapshots means the disclosure can never disagree with them. A snapshot that
 * is not an object (a bare string, an array) renders as one whole-value change
 * rather than being dropped.
 */
function auditChanges(row: AuditEventListRow): AuditFieldChange[] {
  const { oldValues, newValues } = row
  if (oldValues === null && newValues === null) return []

  if (!isJsonObject(oldValues) && !isJsonObject(newValues)) {
    const before = fmtValue(oldValues ?? undefined)
    const after = fmtValue(newValues ?? undefined)
    return before === after ? [] : [{ field: 'Values', before, after }]
  }

  const before = isJsonObject(oldValues) ? oldValues : {}
  const after = isJsonObject(newValues) ? newValues : {}
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]

  return keys
    .map((k) => ({ field: k, before: fmtValue(before[k]), after: fmtValue(after[k]) }))
    .filter((c) => c.before !== c.after)
}

/** First 8 hex characters of a uuid, with the full id on `title` at call sites. */
function shortId(id: string | null): string {
  return id ? `${id.slice(0, 8)}…` : '—'
}

/* ── parts ─────────────────────────────────────────────────────────────── */

/**
 * BS above AD — the pair the footer promises ("All dates are shown in BS above
 * AD"). `toBs` vouches for one month only and returns `null` outside it; a null
 * becomes an omitted line rather than a wrong date (Law 7 — BS is rendered,
 * never stored). The AD line, rendered in Kathmandu, is always present.
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

function AuditCard({ row, open, onToggle }: { row: AuditEventListRow; open: boolean; onToggle: () => void }) {
  const changes = auditChanges(row)
  const first = changes[0]
  return (
    <article style={{ ...cardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <ActionPill action={row.action} />
        <span className="identifier" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }} title={row.recordId}>
          {row.tableName} {shortId(row.recordId)}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <WhenCell iso={row.createdAtAd} />
        </span>
      </div>
      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        {row.actorRole ?? '—'} · <span className="identifier" title={row.actorId ?? undefined}>{shortId(row.actorId)}</span>
      </div>
      {first ? <Diff before={first.before} after={first.after} /> : row.reason ? (
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{row.reason}</span>
      ) : null}
      <DiscloseButton open={open} onToggle={onToggle} row={row} wide />
      {open && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 9 }}>
          <ChangeDetail row={row} changes={changes} />
        </div>
      )}
    </article>
  )
}

/** §10.4's `▸`. A disclosure, never an action — it changes nothing. */
function DiscloseButton({
  open,
  onToggle,
  row,
  wide,
}: {
  open: boolean
  onToggle: () => void
  row: AuditEventListRow
  wide?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${open ? 'Hide' : 'Show'} the change detail for ${row.tableName} ${row.recordId}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        /* Law 15 — 44×44 at every width, desktop included. */
        minWidth: 44,
        minHeight: 44,
        width: wide ? '100%' : undefined,
        borderRadius: 'var(--r-btn)',
        border: `1px solid ${wide ? 'var(--border)' : 'transparent'}`,
        background: 'transparent',
        color: 'var(--text2)',
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      <Icon name={open ? 'chevron_down' : 'chevron_right'} size={15} />
      {wide && (open ? 'Hide detail' : 'Show detail')}
    </button>
  )
}

/**
 * The expanded row: every differing field, then the record's own investigation
 * facts — severity, status, class, category, the full ids the cells truncate,
 * the reason when one was recorded, and the user agent when captured. All of it
 * read, none of it editable.
 */
function ChangeDetail({ row, changes }: { row: AuditEventListRow; changes: AuditFieldChange[] }) {
  const meta: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: 'Severity', value: row.severity },
    { label: 'Status', value: row.status },
    { label: 'Event', value: row.eventClass },
    { label: 'Category', value: row.category },
    { label: 'Record id', value: row.recordId, mono: true },
    { label: 'Actor id', value: row.actorId ?? '—', mono: true },
    { label: 'Device', value: row.deviceType },
    ...(row.reason ? [{ label: 'Reason', value: row.reason }] : []),
    ...(row.userAgent ? [{ label: 'User agent', value: row.userAgent }] : []),
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {changes.length > 0 ? (
        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {changes.map((c) => (
            <div key={c.field} style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', alignItems: 'baseline' }}>
              <dt
                style={{
                  fontSize: 'var(--t-th)',
                  fontWeight: 700,
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {c.field}
              </dt>
              <dd style={{ margin: 0 }}>
                <Diff before={c.before} after={c.after} />
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          No field snapshot was recorded for this event.
        </span>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
        {meta.map((m) => (
          <span key={m.label} style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.label}</span>{' '}
            <span className={m.mono ? 'identifier' : undefined} style={{ color: 'var(--text2)' }}>
              {m.value}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * `before → after`.
 *
 * Law 11 — never colour alone. The arrow glyph and the two words carry the
 * direction; the tones only reinforce what the text already says, so this reads
 * correctly in monochrome and to a screen reader.
 */
function Diff({ before, after }: { before: string; after: string }) {
  return (
    <span style={{ fontSize: 'var(--t-meta)', lineHeight: 1.5 }}>
      <span style={{ color: 'var(--text2)', textDecoration: 'line-through' }}>{before}</span>
      <Icon name="arrow_right" size={12} style={{ margin: '0 6px', color: 'var(--muted)', verticalAlign: 'middle' }} />
      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{after}</span>
    </span>
  )
}

/**
 * Law 11 — icon + label + colour on every action. The vocabulary is the
 * `audit_action` enum; an unmapped member falls to the neutral record tone
 * rather than crashing on an enum the DB grew.
 */
const DANGER_ACTIONS = new Set(['Delete', 'Reject', 'Booking Cancelled'])
const PROGRESS_ACTIONS = new Set(['Refund', 'Restore', 'Permission Changed', 'Password Changed'])
const NEUTRAL_ACTIONS = new Set(['Archive', 'Logout', 'Export', 'Import', 'Print', 'Download', 'Upload'])

function ActionPill({ action }: { action: AuditEventListRow['action'] }) {
  const tone = DANGER_ACTIONS.has(action)
    ? { bg: 'var(--st-danger-bg)', fg: 'var(--st-danger-fg)', icon: 'error' as const }
    : PROGRESS_ACTIONS.has(action)
      ? { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)', icon: 'return_arrow' as const }
      : NEUTRAL_ACTIONS.has(action)
        ? { bg: 'var(--card2)', fg: 'var(--text2)', icon: 'box' as const }
        : { bg: 'var(--nav-active-bg)', fg: 'var(--nav-active-accent)', icon: 'file' as const }
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
      <Icon name={tone.icon} size={11} />
      {action}
    </span>
  )
}

/** Prev/Next — 44×44 (Law 15), disabled honestly rather than hidden. */
function PagerButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string
  icon: 'chevron_left' | 'chevron_right'
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 44,
        minHeight: 44,
        borderRadius: 'var(--r-btn)',
        border: '1px solid var(--border)',
        background: 'var(--card)',
        color: disabled ? 'var(--muted)' : 'var(--text)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon name={icon} size={16} />
    </button>
  )
}

function Filter({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly string[]
  /** The "no constraint" row. Omit for a select whose options already cover everything (Period's 'All time'). */
  allLabel?: string
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <span
        style={{ fontSize: 'var(--t-th)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}
      >
        {label}
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
        {allLabel && <option value={ALL}>{allLabel}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

const th: CSSProperties = {
  textAlign: 'left',
  padding: '9px 12px',
  fontSize: 'var(--t-th)',
  fontWeight: 700,
  color: 'var(--text2)',
  whiteSpace: 'nowrap',
}

/*
 * §7.3's row floor ("rows >= 56px"), stated with the token rather than as
 * padding arithmetic: `height` on a `<td>` is read as a MINIMUM, so it lifts
 * the short rows and leaves the tall ones — and the horizontal padding —
 * exactly where they are.
 *
 * This is a hit-testing guarantee, not a density preference. The floor is what
 * lets a 44px target sit INSIDE its own row; below it the target overhangs the
 * neighbouring row, and the row that comes later in the DOM wins a tap in the
 * overlapping band — the wrong-row failure fixed on the four floor workspaces.
 * This table clears 56 today only by accident: `DiscloseButton` is a real 44x44
 * box, so it drags each row to about 66. That guarantee rests on one control's
 * paint. Written as the token it becomes structural instead, and the `colSpan`
 * detail row underneath inherits the same floor rather than being exempt.
 */
const td: CSSProperties = {
  height: 'var(--row-min-h)',
  padding: '11px 12px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
}

const srOnly: CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }

const selectStyle: CSSProperties = {
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
