import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, Button, Rail, SummaryRows, FooterNote, cardStyle } from '../../components/ui/Page'
import { EmptyState } from '../../components/ui/StateViews'
import { STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import { canViewMoney } from '../../lib/rbac'
import type { Role } from '../../lib/rbac'
import { formatMoney } from '../../lib/money'
import { formatAd } from '../../lib/bs'
import { useTabularLayout } from '../../lib/device'
import {
  CASES,
  CASE_TYPE_ICON,
  CASE_STATUSES,
  CASE_STATUS_META,
  CASE_PRIORITY_META,
  CASE_FLAGS,
  CASE_FLAG_META,
  DISPOSITIONS_BY_TYPE,
  ROWS_PER_PAGE_OPTIONS,
  NEW_CASE_UNAVAILABLE_REASON,
  CASE_WORKSPACE_ROUTE,
  statusCounts,
  flagCounts,
  openCasesCount,
  exposurePaisa,
  recoveredThisMonthPaisa,
  outstandingOf,
  allocationOf,
  chargeClientProjection,
  resolutionPreview,
  defaultAllocationFor,
  statusAfterDisposition,
  agingNote,
  ageDays,
  openedBsLabel,
} from '../../data/cases'
import type { Case, CaseStatus, CaseFlag } from '../../data/cases'

/**
 * **Cases — Incident Management** — `04 Operations/Cases.md` v1.1 (Build
 * Locked, supersedes v1.0), matched to the `Cases.PNG` render for layout and
 * tokens, with §0's corrections applied rather than the render's numbers
 * copied verbatim. See `data/cases.ts`'s header for the full correction list
 * and the date-engine / row-count trade-offs this build makes.
 *
 * This is `?queue=cases` — the fifth Operations queue (§1.5: "Cases is a
 * queue with its own owner, not a job"), which is why it is its own
 * component rather than a branch inside `OperationsQueues.tsx`'s generic
 * 8-column job table: Cases' 14 columns, disposition vocabulary and
 * money-bearing rail do not fit that shape.
 *
 * **Warehouse sees no money** (§11's role table) — `canViewMoney(role)`
 * structurally omits Assessed/Outstanding/Financial Impact rather than
 * masking them, the same primitive `data/operations.ts`'s `NO_MONEY_NOTE`
 * describes for the other four queues. There is no auth session yet
 * (Phase 7), so `role` below is a local "viewing as" toggle rather than a
 * real session — every other workspace in this build that needs a role
 * check is in the same position.
 */

const BLUE_PRIMARY = { background: 'var(--cat-1)', color: '#fff', border: '1px solid transparent' } as const
/** `CASES` is asserted non-empty at module load in `data/cases.ts`; this names that guarantee once instead of an unchecked index everywhere below. */
const FIRST_CASE = CASES[0] as Case
const ROLES: Role[] = ['Owner', 'Admin', 'Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver', 'Client']
/** §11 — Resolution is Manager/Owner only. */
function canResolve(role: Role): boolean {
  return role === 'Owner' || role === 'Admin'
}

function Pill({ token, icon, label, solid, strike }: { token: StatusKey; icon: IconName; label: string; solid?: boolean | undefined; strike?: boolean | undefined }) {
  const t = STATUS[token]
  // Same fill-weight trick §4.2 uses for On Rent (solid) vs Returned (soft) — reused here for Critical/High and Under Review/In Progress.
  const skin = solid ? { background: t.fg, color: '#fff' } : { background: t.bg, color: t.fg }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 21,
        padding: '0 8px',
        borderRadius: 'var(--r-badge)',
        fontSize: 'var(--t-meta)',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        textDecoration: strike ? 'line-through' : undefined,
        ...skin,
      }}
    >
      <Icon name={icon} size={11} fill={solid === true} />
      {label}
    </span>
  )
}

function StatusPill({ status }: { status: CaseStatus }) {
  const m = CASE_STATUS_META[status]
  return <Pill token={m.token} icon={m.icon} label={status} solid={m.solid} strike={m.strike} />
}
function PriorityPill({ priority }: { priority: Case['priority'] }) {
  const m = CASE_PRIORITY_META[priority]
  return <Pill token={m.token} icon={m.icon} label={priority} solid={m.solid} />
}
function FlagPill({ flag }: { flag: CaseFlag }) {
  const m = CASE_FLAG_META[flag]
  return <Pill token={m.token} icon={m.icon} label={flag} />
}

function DateCell({ ad }: { ad: Date }) {
  return (
    <div style={{ lineHeight: 1.4 }}>
      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', fontWeight: 600 }}>{openedBsLabel(ad)}</div>
      <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{formatAd(ad)}</div>
    </div>
  )
}

const th = { textAlign: 'left' as const, padding: '9px 10px', fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap' as const, borderBottom: '1px solid var(--border)' }
const td = { padding: '9px 10px', fontSize: 'var(--t-meta)', color: 'var(--text)', verticalAlign: 'top' as const }

export default function CasesQueue() {
  /* DEVICES.md §7 build order item 1 — the 14-column table (minWidth up to
     1180) is unreadable below 768; the right rail's fixed 340px column breaks
     too. Law 13: branch on capability, not platform. */
  const tabular = useTabularLayout()
  const [role, setRole] = useState<Role>('Admin')
  const [statusFilter, setStatusFilter] = useState<'All' | CaseStatus>('All')
  const [flagFilter, setFlagFilter] = useState<CaseFlag | null>(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string>(FIRST_CASE.id)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState<(typeof ROWS_PER_PAGE_OPTIONS)[number]>(25)
  const [draftDisposition, setDraftDisposition] = useState<Record<string, string>>({})
  const [overrides, setOverrides] = useState<Record<string, Partial<Case>>>({})
  const [newCaseNote, setNewCaseNote] = useState(false)

  const money = canViewMoney(role)

  /* ── overrides let "Confirm Disposition" be a real action instead of a dead radio group ── */
  const cases = useMemo(() => CASES.map((c) => (overrides[c.id] ? { ...c, ...overrides[c.id] } : c)), [overrides])
  const byId = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases])

  const chips = useMemo(() => statusCounts(cases), [cases])
  const flagChipCounts = useMemo(() => flagCounts(cases), [cases])
  const openCount = useMemo(() => openCasesCount(cases), [cases])
  const exposure = useMemo(() => exposurePaisa(cases), [cases])
  const recovered = useMemo(() => recoveredThisMonthPaisa(cases), [cases])
  const awaitingDecision = chips['Awaiting Decision']

  const filtered = useMemo(
    () =>
      cases.filter((c) => {
        if (statusFilter !== 'All' && c.status !== statusFilter) return false
        if (flagFilter && !c.flags.includes(flagFilter)) return false
        if (query) {
          const hay = `${c.id} ${c.title} ${c.counterpartyName} ${c.linked.linkedRecordId} ${c.equipment === 'Multiple' ? '' : c.equipment.map((e) => `${e.name} ${e.serial}`).join(' ')}`.toLowerCase()
          if (!hay.includes(query.toLowerCase())) return false
        }
        return true
      }),
    [cases, statusFilter, flagFilter, query],
  )

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage))
  const pageSafe = Math.min(page, pageCount)
  const pageRows = filtered.slice((pageSafe - 1) * rowsPerPage, pageSafe * rowsPerPage)

  const selected = byId.get(selectedId) ?? FIRST_CASE

  const setFilter = (s: CaseStatus | 'All') => {
    setStatusFilter(s)
    setPage(1)
  }
  const toggleFlag = (f: CaseFlag) => {
    setFlagFilter((p) => (p === f ? null : f))
    setPage(1)
  }
  const toggleChecked = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const selectRow = (id: string) => setSelectedId(id)

  const confirmDisposition = (c: Case) => {
    const disposition = draftDisposition[c.id]
    if (!disposition) return
    const allocation = defaultAllocationFor(c, disposition)
    setOverrides((prev) => ({ ...prev, [c.id]: { ...prev[c.id], disposition, status: statusAfterDisposition(disposition), ...allocation } }))
    setDraftDisposition((prev) => {
      const next = { ...prev }
      delete next[c.id]
      return next
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {/* ── header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--nav-active-bg)', color: 'var(--nav-active-accent)', flexShrink: 0 }}>
              <Icon name="eye" size={17} fill />
            </span>
            <h1 style={{ margin: 0, fontSize: 'var(--t-h1)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.015em' }}>Cases</h1>
          </div>
          <p style={{ margin: '5px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Manage damage, missing items, disputes, theft and operational incidents.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            Viewing as
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              aria-label="Simulate viewing role — no auth session is built yet (Phase 7)"
              style={{ height: 30, borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', padding: '0 6px' }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <Button icon="download">Export</Button>
          <span title={NEW_CASE_UNAVAILABLE_REASON}>
            <button
              type="button"
              onClick={() => setNewCaseNote(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 'var(--r-btn)',
                fontSize: 'var(--t-meta)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                ...BLUE_PRIMARY, opacity: 0.85,
              }}
            >
              <Icon name="plus" size={14} />
              New Case
            </button>
          </span>
        </div>
      </div>
      {newCaseNote && (
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', fontSize: 'var(--t-meta)', color: 'var(--progress-text)' }}>
          <Icon name="info" size={13} />
          {NEW_CASE_UNAVAILABLE_REASON}
          <button type="button" onClick={() => setNewCaseNote(false)} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--link)', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', fontSize: 'var(--t-meta)' }}>
            Dismiss
          </button>
        </div>
      )}

      {/* ── §3 KPI cards ────────────────────────────────────────────────── */}
      <section aria-label="Key figures" style={{ display: 'grid', gridTemplateColumns: money ? 'repeat(4, minmax(0,1fr))' : 'repeat(2, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
        <div style={{ ...cardStyle, padding: '13px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>
            <Icon name="alert_triangle" size={14} style={{ color: STATUS.danger.fg }} />
            Open Cases
          </div>
          <div className="figure" style={{ fontSize: 'var(--t-h2)', fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>{openCount}</div>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>Open + Under Review + Awaiting Decision + In Progress</div>
        </div>
        <div style={{ ...cardStyle, padding: '13px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>
            <Icon name="timer" size={14} style={{ color: STATUS.progress.fg }} />
            Awaiting Decision
          </div>
          <div className="figure" style={{ fontSize: 'var(--t-h2)', fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>{awaitingDecision}</div>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>Waiting on a Manager decision</div>
        </div>
        {money && (
          <>
            <div style={{ ...cardStyle, padding: '13px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>
                <Icon name="briefcase" size={14} style={{ color: 'var(--primary)' }} />
                Exposure
              </div>
              <div className="figure" style={{ fontSize: 'var(--t-h2)', fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>{formatMoney(exposure)}</div>
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>Assessed value of open cases</div>
            </div>
            <div style={{ ...cardStyle, padding: '13px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 600 }}>
                <Icon name="checklist" size={14} style={{ color: STATUS.in.fg }} />
                Recovered This Month
              </div>
              <div className="figure" style={{ fontSize: 'var(--t-h2)', fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>{formatMoney(recovered)}</div>
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>Charged + claimed + covered, settled</div>
            </div>
          </>
        )}
      </section>
      {!money && (
        <div style={{ ...cardStyle, display: 'flex', gap: 7, alignItems: 'flex-start', padding: 12, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
          <Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          Warehouse view — Exposure, Recovered This Month, Assessed and Outstanding are not shown or requested on this screen (Foundation §8.3, Cases §11).
        </div>
      )}

      {/* ── §2 status chips + flag chips ───────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {(['All', ...CASE_STATUSES] as const).map((s) => {
            const on = statusFilter === s
            const count = s === 'All' ? cases.length : chips[s]
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                aria-pressed={on}
                style={{
                  height: 30, padding: '0 12px', borderRadius: 8, border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                  background: on ? 'var(--nav-active-bg)' : 'transparent', color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                  fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                }}
              >
                {s} <span className="figure">({count})</span>
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          <span style={{ fontWeight: 600 }}>Flags:</span>
          {CASE_FLAGS.map((f) => {
            const m = CASE_FLAG_META[f]
            const on = flagFilter === f
            const t = STATUS[m.token]
            return (
              <button
                key={f}
                type="button"
                onClick={() => toggleFlag(f)}
                aria-pressed={on}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 8px', borderRadius: 999,
                  border: `1px solid ${on ? t.fg : 'var(--border)'}`, background: on ? t.bg : 'transparent', color: on ? t.fg : 'var(--text2)',
                  fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <Icon name={m.icon} size={10} />
                {f} <span className="figure">({flagChipCounts[f]})</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── toolbar ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(1)
          }}
          placeholder="Search case ID, equipment, booking, client…"
          aria-label="Search cases"
          style={{ flex: 1, minWidth: 220, height: 34, padding: '0 10px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', outline: 'none' }}
        />
        {statusFilter !== 'All' || flagFilter ? (
          <Button
            onClick={() => {
              setStatusFilter('All')
              setFlagFilter(null)
              setPage(1)
            }}
          >
            Clear Filters
          </Button>
        ) : null}
      </div>

      {/* ── table + rail ────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: tabular ? 'minmax(0,1fr) 340px' : '1fr',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        <Card bodyStyle={{ padding: 0 }}>
          {checked.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: '1px solid var(--border)', background: 'var(--nav-active-bg)' }}>
              <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--nav-active-accent)' }}>{checked.size} selected</span>
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Bulk Actions</span>
              <button type="button" onClick={() => setChecked(new Set())} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--link)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--t-meta)' }}>
                Clear
              </button>
            </div>
          )}
          {!tabular && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10 }}>
              {pageRows.length === 0 && (
                <EmptyState
                  title="No cases found"
                  description="Try another filter, or clear filters to see every case."
                  actionLabel="Clear Filters"
                  onAction={() => {
                    setStatusFilter('All')
                    setFlagFilter(null)
                    setQuery('')
                  }}
                />
              )}
              {pageRows.map((c) => {
                const isSel = c.id === selectedId
                const note = agingNote(c)
                return (
                  <article
                    key={c.id}
                    onClick={() => selectRow(c.id)}
                    style={{
                      ...cardStyle,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 7,
                      cursor: 'pointer',
                      borderColor: isSel ? 'var(--nav-active-accent)' : 'var(--border)',
                      background: isSel ? 'var(--nav-active-bg)' : 'var(--card)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span className="identifier" style={{ fontWeight: 700, color: 'var(--text)' }}>{c.id}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                        <Icon name={CASE_TYPE_ICON[c.type]} size={13} />
                        {c.type}
                      </span>
                    </div>

                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', fontWeight: 600 }}>{c.title}</div>

                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                      {c.counterpartyKind} · {c.counterpartyName}
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <PriorityPill priority={c.priority} />
                      <StatusPill status={c.status} />
                      {c.flags.map((f) => (
                        <FlagPill key={f} flag={f} />
                      ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 'var(--t-meta)' }}>
                      <span className="figure" style={{ color: note ? 'var(--danger-text)' : 'var(--text2)', fontWeight: note ? 700 : 400 }}>
                        {ageDays(c.openedAd)}d open
                        {note && <Icon name="alert_triangle" size={11} style={{ color: 'var(--danger-text)', marginLeft: 3 }} />}
                      </span>
                      {money && (
                        <span className="figure" style={{ fontWeight: 700, color: outstandingOf(c) > 0 ? 'var(--danger-text)' : 'var(--success-text)' }}>
                          {formatMoney(outstandingOf(c))} outstanding
                        </span>
                      )}
                    </div>

                    <Link
                      to={CASE_WORKSPACE_ROUTE(c.id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: 40,
                        marginTop: 2,
                        borderRadius: 'var(--r-btn)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: 600,
                        textDecoration: 'none',
                        ...BLUE_PRIMARY,
                      }}
                    >
                      Open Case
                    </Link>
                  </article>
                )
              })}
            </div>
          )}
          {tabular && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: money ? 1180 : 940 }}>
              <thead>
                <tr style={{ background: 'var(--th-bg)' }}>
                  <th style={{ ...th, width: 26 }} />
                  {['Case ID', 'Type', 'Title', 'Counterparty', 'Linked Booking', 'Equipment', 'Priority', 'Status', 'Disposition']
                    .concat(money ? ['Assessed', 'Outstanding'] : [])
                    .concat(['Age', 'Owner', 'Actions'])
                    .map((h) => (
                      <th key={h} style={th}>
                        {h}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((c) => {
                  const isSel = c.id === selectedId
                  const note = agingNote(c)
                  return (
                    <tr
                      key={c.id}
                      onClick={() => selectRow(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          selectRow(c.id)
                        }
                      }}
                      tabIndex={0}
                      aria-selected={isSel}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: isSel ? 'var(--nav-active-bg)' : 'transparent',
                        borderLeft: isSel ? '2px solid var(--nav-active-accent)' : '2px solid transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ ...td, width: 26 }} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggleChecked(c.id)} aria-label={`Select ${c.id}`} />
                      </td>
                      <td style={td}>
                        <div className="identifier" style={{ fontWeight: 700, color: 'var(--text)' }}>{c.id}</div>
                        <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Opened</div>
                        <DateCell ad={c.openedAd} />
                      </td>
                      <td style={td}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                          <Icon name={CASE_TYPE_ICON[c.type]} size={13} />
                          {c.type}
                        </span>
                      </td>
                      <td style={{ ...td, maxWidth: 190 }}>{c.title}</td>
                      <td style={td}>{c.counterpartyKind}</td>
                      <td style={td}>
                        {c.linked.linkedRecordKind === 'Booking' ? (
                          <Link to={`/rentals/${c.linked.linkedRecordId}`} className="identifier" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none', fontSize: 'var(--t-meta)' }}>
                            {c.linked.linkedRecordId}
                          </Link>
                        ) : (
                          <span className="identifier" style={{ fontSize: 'var(--t-meta)', color: 'var(--text)', fontWeight: 600 }}>{c.linked.linkedRecordId}</span>
                        )}
                        <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{c.counterpartyName}</div>
                      </td>
                      <td style={{ ...td, color: 'var(--text2)' }}>
                        {c.equipment === 'Multiple' ? 'Multiple' : (
                          <>
                            {c.equipment[0]?.name}
                            <div className="identifier" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{c.equipment[0]?.serial}</div>
                          </>
                        )}
                      </td>
                      <td style={td}>
                        <PriorityPill priority={c.priority} />
                      </td>
                      <td style={td}>
                        <StatusPill status={c.status} />
                      </td>
                      <td style={{ ...td, color: 'var(--text2)' }}>{c.disposition ?? '—'}</td>
                      {money && (
                        <>
                          <td className="figure" style={{ ...td, fontWeight: 600 }}>{formatMoney(c.assessedPaisa)}</td>
                          <td className="figure" style={{ ...td, fontWeight: 700, color: outstandingOf(c) > 0 ? 'var(--danger-text)' : 'var(--success-text)' }}>{formatMoney(outstandingOf(c))}</td>
                        </>
                      )}
                      <td className="figure" style={{ ...td, fontWeight: 600 }} title={note ?? undefined}>
                        {ageDays(c.openedAd)}d {note && <Icon name="alert_triangle" size={11} style={{ color: 'var(--danger-text)', marginLeft: 3 }} />}
                      </td>
                      <td style={{ ...td, color: 'var(--text2)' }}>
                        {c.owner}
                        <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{c.ownerRole}</div>
                      </td>
                      <td style={{ ...td, minWidth: 150 }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                          <Link
                            to={CASE_WORKSPACE_ROUTE(c.id)}
                            style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 8px', borderRadius: 6, fontSize: 'var(--t-meta)', fontWeight: 600, textDecoration: 'none', ...BLUE_PRIMARY }}
                          >
                            Open Case
                          </Link>
                          <RowMenu caseId={c.id} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={money ? 14 : 12} style={{ padding: 0 }}>
                      <EmptyState
                        title="No cases found"
                        description="Try another filter, or clear filters to see every case."
                        actionLabel="Clear Filters"
                        onAction={() => {
                          setStatusFilter('All')
                          setFlagFilter(null)
                          setQuery('')
                        }}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', flexWrap: 'wrap', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            <span>
              Showing {filtered.length === 0 ? 0 : (pageSafe - 1) * rowsPerPage + 1} to {Math.min(pageSafe * rowsPerPage, filtered.length)} of {filtered.length} cases
            </span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              Rows per page
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value) as (typeof ROWS_PER_PAGE_OPTIONS)[number])
                  setPage(1)
                }}
                aria-label="Rows per page"
                className="figure"
                style={{ height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
              >
                {ROWS_PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </span>
            <span style={{ display: 'flex', gap: 3 }}>
              <button type="button" disabled={pageSafe <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={pagerBtn(false)}>
                ‹
              </button>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                <button key={p} type="button" onClick={() => setPage(p)} style={pagerBtn(p === pageSafe)} aria-current={p === pageSafe}>
                  {p}
                </button>
              ))}
              <button type="button" disabled={pageSafe >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} style={pagerBtn(false)}>
                ›
              </button>
            </span>
          </div>
        </Card>

        {/* ── §6 right rail — Case Summary → Evidence → Resolution → Financial Impact → Linked Records → Timeline → Quick Actions ── */}
        <Rail>
          <CaseRail c={selected} role={role} money={money} draft={draftDisposition[selected.id] ?? ''} onDraft={(v) => setDraftDisposition((p) => ({ ...p, [selected.id]: v }))} onConfirm={() => confirmDisposition(selected)} />
        </Rail>
      </div>

      <FooterNote extra={['Open Cases, chip counts and Exposure are computed from the case list, never hand-typed']} />
    </div>
  )
}

function pagerBtn(on: boolean) {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 26, height: 26, borderRadius: 6,
    border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`, background: on ? 'var(--nav-active-bg)' : 'transparent',
    color: on ? 'var(--nav-active-accent)' : 'var(--text2)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  } as const
}

/** §4.5's `⋮` — Assign Owner · Add Note · View Timeline · Duplicate · Archive. Same disclosure pattern as `BookingDetail.tsx`'s Operations menu. */
function RowMenu({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false)
  const items = ['Assign Owner', 'Add Note', 'View Timeline', 'Duplicate', 'Archive']
  return (
    <span style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`More actions for ${caseId}`}
        aria-haspopup="menu"
        style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer' }}
      >
        <Icon name="more_vert" size={13} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 20 }} onClick={() => setOpen(false)} />
          <div role="menu" style={{ position: 'absolute', right: 0, top: 28, minWidth: 168, padding: 6, borderRadius: 'var(--r-btn)', background: 'var(--dropdown)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-modal)', zIndex: 21 }}>
            {items.map((label) => (
              <span
                key={label}
                role="menuitem"
                tabIndex={0}
                title={`${label} is not built yet for Cases`}
                aria-disabled
                style={{ display: 'flex', alignItems: 'center', height: 30, padding: '0 9px', borderRadius: 7, fontSize: 'var(--t-meta)', color: 'var(--muted)', cursor: 'not-allowed' }}
              >
                {label}
              </span>
            ))}
          </div>
        </>
      )}
    </span>
  )
}

function RailSection({ title, children, badge }: { title: string; children: React.ReactNode; badge?: string | undefined }) {
  return (
    <section style={{ ...cardStyle, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
        {badge && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{badge}</span>}
      </div>
      {children}
    </section>
  )
}

function EvidencePhotoBox({ label, at }: { label: string; at?: string | undefined }) {
  return (
    <div style={{ borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ height: 76, background: at ? 'linear-gradient(135deg,#334155,#0f172a)' : 'var(--card2)', display: 'grid', placeItems: 'center', color: '#94a3b8' }}>
        <Icon name="photo" size={18} />
      </div>
      <div style={{ padding: '6px 8px' }}>
        <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{label}</div>
        <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{at ?? 'No photo attached'}</div>
      </div>
    </div>
  )
}

function CaseRail({
  c,
  role,
  money,
  draft,
  onDraft,
  onConfirm,
}: {
  c: Case
  role: Role
  money: boolean
  draft: string
  onDraft: (v: string) => void
  onConfirm: () => void
}) {
  const dispositions = DISPOSITIONS_BY_TYPE[c.type]
  const alloc = allocationOf(c)
  const outstanding = outstandingOf(c)
  const projection = c.disposition === null && c.depositHeldPaisa > 0 ? chargeClientProjection(c) : null
  const canDoResolution = canResolve(role)
  // `timelineExtra` already opens with its own "Case opened" entry for the handful of cases that carry one — only synthesize a default when there isn't one, so the opening line never doubles up.
  const timeline = (
    c.timelineExtra && c.timelineExtra.length > 0
      ? c.timelineExtra
      : [{ actor: c.owner, at: c.openedAd, text: `Case opened${c.linked.linkedRecordKind === 'Booking' ? ` from ${c.linked.linkedRecordId}` : ''}` }]
  )
    .slice()
    .sort((a, b) => b.at.getTime() - a.at.getTime())

  return (
    <>
      {/* 1 · Case Summary */}
      <RailSection title={c.id} badge={c.type}>
        <SummaryRows
          rows={[
            { label: 'Type', value: c.type },
            { label: 'Counterparty', value: c.counterpartyKind },
            { label: 'Client / Partner', value: c.counterpartyName },
            { label: 'Equipment', value: c.equipment === 'Multiple' ? 'Multiple' : `${c.equipment[0]?.name} (${c.equipment[0]?.serial})` },
            { label: 'Linked Booking', value: c.linked.linkedRecordId },
            { label: 'Opened', value: `${openedBsLabel(c.openedAd)} · ${formatAd(c.openedAd)}` },
            { label: 'Age', value: `${ageDays(c.openedAd)} days` },
            { label: 'Owner', value: `${c.owner} (${c.ownerRole})` },
          ]}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <PriorityPill priority={c.priority} />
          <StatusPill status={c.status} />
        </div>
        {c.flags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {c.flags.map((f) => (
              <FlagPill key={f} flag={f} />
            ))}
          </div>
        )}
        {agingNote(c) && (
          <p style={{ margin: '9px 0 0', display: 'flex', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--danger-text)', fontWeight: 600 }}>
            <Icon name="alert_triangle" size={12} />
            {agingNote(c)}
          </p>
        )}
      </RailSection>

      {/* 2 · Evidence — above Resolution, §6.1's restored panel */}
      <RailSection title="Evidence" badge={c.type === 'Damage' ? 'Pickup vs Return' : undefined}>
        {c.type === 'Damage' && (c.evidence.pickup?.length || c.evidence.return?.length) ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <EvidencePhotoBox label="At Pickup" at={c.evidence.pickup?.[0]?.at} />
            <EvidencePhotoBox label="At Return" at={c.evidence.return?.[0]?.at} />
          </div>
        ) : c.evidence.general?.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {c.evidence.general.map((p) => (
              <EvidencePhotoBox key={p.id} label={p.file} at={p.at} />
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No evidence uploaded yet.</p>
        )}
      </RailSection>

      {/* 3 · Resolution — Manager/Owner only */}
      <RailSection title="Resolution" badge="Manager only">
        {!canDoResolution ? (
          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            Restricted to Manager and Owner. Viewing as <strong>{role}</strong>.
          </p>
        ) : c.disposition ? (
          <SummaryRows rows={[{ label: 'Disposition', value: c.disposition, tone: 'primary' }]} />
        ) : (
          <>
            <p style={{ margin: '0 0 8px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Select a disposition to proceed</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dispositions.map((opt) => {
                const picked = draft === opt
                return (
                  <label key={opt} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '7px 8px', borderRadius: 8, border: `1px solid ${picked ? 'var(--nav-active-accent)' : 'var(--border)'}`, background: picked ? 'var(--nav-active-bg)' : 'transparent', cursor: 'pointer' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                      <input type="radio" name={`disposition-${c.id}`} checked={picked} onChange={() => onDraft(opt)} />
                      {opt}
                    </span>
                    {picked && <span style={{ marginLeft: 22, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{resolutionPreview(c, opt)}</span>}
                  </label>
                )
              })}
            </div>
            <button
              type="button"
              disabled={!draft}
              onClick={onConfirm}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', height: 34, marginTop: 10,
                borderRadius: 'var(--r-btn)', fontSize: 'var(--t-meta)', fontWeight: 600, fontFamily: 'inherit', cursor: draft ? 'pointer' : 'not-allowed',
                ...(draft ? BLUE_PRIMARY : { background: 'var(--card2)', color: 'var(--muted)', border: '1px solid var(--border)' }),
              }}
            >
              <Icon name="checklist" size={14} />
              Confirm Disposition
            </button>
            {!draft && <p style={{ margin: '5px 0 0', textAlign: 'right', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Select a disposition above first</p>}
          </>
        )}
      </RailSection>

      {/* 4 · Financial Impact — hidden from Warehouse */}
      {money && (
        <RailSection title="Financial Impact" badge={c.disposition ? 'Actual' : 'Projected'}>
          {c.disposition === null && (
            <p style={{ margin: '0 0 8px', fontSize: 'var(--t-meta)', color: 'var(--progress-text)', fontWeight: 600 }}>PROJECTED IMPACT — no money moves until a disposition is set</p>
          )}
          <SummaryRows
            rows={[
              { label: 'Assessed', value: formatMoney(c.assessedPaisa) },
              { label: 'Deposit held', value: formatMoney(c.depositHeldPaisa) },
              ...(projection ? [{ label: 'If charged to client', value: `${formatMoney(projection.depositApplied)} applied · ${formatMoney(projection.invoiced)} invoiced` }] : []),
              ...(c.disposition
                ? ([
                    alloc.chargedToClient > 0 && { label: 'Charged to client', value: formatMoney(alloc.chargedToClient) },
                    alloc.depositApplied > 0 && { label: 'Deposit applied', value: formatMoney(alloc.depositApplied), tone: 'success' as const },
                    alloc.insuranceClaimed > 0 && { label: 'Insurance claimed', value: formatMoney(alloc.insuranceClaimed) },
                    alloc.warrantyCovered > 0 && { label: 'Warranty covered', value: formatMoney(alloc.warrantyCovered) },
                    alloc.recoveredFromPartner > 0 && { label: 'Recovered from partner', value: formatMoney(alloc.recoveredFromPartner) },
                    alloc.absorbed > 0 && { label: 'Absorbed', value: formatMoney(alloc.absorbed) },
                  ].filter(Boolean) as { label: string; value: string; tone?: 'success' }[])
                : []),
              { label: 'Outstanding', value: formatMoney(outstanding), tone: outstanding > 0 ? 'danger' : 'success' },
            ]}
          />
        </RailSection>
      )}

      {/* 5 · Linked Records */}
      <RailSection title="Linked Records">
        <SummaryRows
          rows={
            [
              { label: c.linked.linkedRecordKind, value: c.linked.linkedRecordId },
              c.linked.clientName && { label: 'Client', value: c.linked.clientName },
              c.linked.partnerName && { label: 'Partner', value: c.linked.partnerName },
              { label: 'Equipment', value: c.equipment === 'Multiple' ? 'Multiple' : c.equipment.map((e) => e.serial).join(', ') },
              c.linked.maintenanceJobId && { label: 'Maintenance job', value: c.linked.maintenanceJobId },
              money && c.linked.invoiceId && { label: 'Invoice', value: c.linked.invoiceId },
              money && c.linked.insuranceClaim && { label: 'Insurance claim', value: c.linked.insuranceClaim },
            ].filter(Boolean) as { label: string; value: string }[]
          }
        />
        {c.linked.linkedRecordKind === 'Booking' ? (
          <Link to={`/rentals/${c.linked.linkedRecordId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 9, fontSize: 'var(--t-meta)', color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }}>
            Open booking <Icon name="external_link" size={11} />
          </Link>
        ) : (
          <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Sub-rental, maintenance, invoice and insurance detail routes are not built yet — shown as reference text.</p>
        )}
      </RailSection>

      {/* 6 · Timeline — newest first */}
      <RailSection title="Timeline">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {timeline.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 'var(--t-meta)' }}>
              <Icon name="dot" size={9} style={{ color: 'var(--muted)', marginTop: 4, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--text)' }}>{t.text}</div>
                <div style={{ color: 'var(--muted)', marginTop: 1 }}>
                  {t.actor} · {openedBsLabel(t.at)} · {formatAd(t.at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </RailSection>

      {/* 7 · Quick Actions */}
      <RailSection title="Quick Actions">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
          {(['Add Note', 'Upload Evidence', 'More'] as const).map((label) => (
            <span key={label} title={`${label} is not built yet for Cases`}>
              <button
                type="button"
                disabled
                style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '9px 4px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'not-allowed', fontFamily: 'inherit' }}
              >
                <Icon name={label === 'Add Note' ? 'file' : label === 'Upload Evidence' ? 'upload' : 'more_vert'} size={15} />
                {label}
              </button>
            </span>
          ))}
        </div>
      </RailSection>
    </>
  )
}
