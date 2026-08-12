import { Fragment, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import Icon from '../../components/ui/Icon'
import { PageHeader, KpiStrip, FooterNote, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { EmptyState } from '../../components/ui/StateViews'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import {
  AUDIT_METRICS,
  AUDIT_ROWS,
  AUDIT_ENTITY_KINDS,
  AUDIT_USERS,
  AUDIT_DAYS,
  RETENTION_NOTE,
  entityLabel,
} from '../../data/auditLog'
import type { AuditRow } from '../../data/auditLog'

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
 * ## The absence is the feature
 *
 * §10.4's last two lines are the whole specification of this screen's
 * behaviour, and they are a list of things that must **not** exist. So, stated
 * plainly for the next reader and for any audit of this file:
 *
 *  · There is no row checkbox, no select-all, and no bulk action bar.
 *  · There is no edit control, inline or otherwise. Nothing on this page is an
 *    `<input>` except the three filters, which change what is shown and nothing
 *    else.
 *  · There is no delete, void, archive or hide. Law 3 gives every entity a named
 *    terminal action; an audit **entry** is not an entity with a lifecycle — it
 *    is the record of one, and it has no terminal action at all.
 *  · **Owner is not special here.** The role check below decides one thing only:
 *    whether the network/location columns render. It never unlocks a write,
 *    because there is no write to unlock. `SystemRestoreModal` gates a
 *    destructive act on Owner; this page gates nothing on Owner, deliberately —
 *    a trail an administrator can edit is not a trail.
 *
 * `data/auditLog.ts` holds the same line: it exports no mutation helper.
 *
 * The `←` is wireframe shorthand for "this is a sub-page" (`PLAN.md` Phase 5,
 * Rulings §4). The crumb trail lives in the shell; there is no Back button.
 *
 * The KPI strip predates this spec and no prose removes it — Rulings §1, *"a
 * panel survives unless a spec removes it in prose."* Its four figures are now
 * counted from the rows rather than hand-typed beside them.
 */

const ALL = 'All'

export default function AuditLog() {
  const viewport = useViewport()
  const { user } = useAuth()

  /* Network and location are investigation detail, not the record itself. The
     three roles that run an investigation see them; everybody else sees the
     mutation. This is the only thing role decides on this page. */
  const showNetwork = user?.role === 'Owner' || user?.role === 'Manager' || user?.role === 'Admin'

  const [entityKind, setEntityKind] = useState<string>(ALL)
  const [who, setWho] = useState<string>(ALL)
  const [day, setDay] = useState<string>(ALL)
  const [expanded, setExpanded] = useState<string | null>(null)

  const rows = useMemo(
    () =>
      [...AUDIT_ROWS]
        .filter((r) => entityKind === ALL || r.entity.kind === entityKind)
        .filter((r) => who === ALL || r.user === who)
        .filter((r) => day === ALL || r.timestamp.slice(0, 10) === day)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [entityKind, who, day],
  )

  const kpis: Kpi[] = [
    { label: 'Entries', value: String(AUDIT_METRICS.totalMutations), icon: 'file', accent: 'primary', note: 'In this trail' },
    { label: 'Voided', value: String(AUDIT_METRICS.voids), icon: 'error', accent: 'danger', note: 'Never deleted' },
    { label: 'Archived', value: String(AUDIT_METRICS.archives), icon: 'box', accent: 'progress', note: 'Hidden, not removed' },
    { label: 'Reversals', value: String(AUDIT_METRICS.reversals), icon: 'return_arrow', accent: 'primary', note: 'Corrections' },
  ]

  const filtered = entityKind !== ALL || who !== ALL || day !== ALL

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
      <PageHeader
        icon="lock"
        title="Audit Log"
        description="Append-only record of every state change. View-only for every role, Owner included."
      />

      <KpiStrip items={kpis} columns={4} />

      {/* §10.4's `[entity ▾][user ▾][date ▾]`. The only inputs on the page. */}
      <div
        role="search"
        aria-label="Filter the audit trail"
        style={{
          display: 'grid',
          gridTemplateColumns: viewport === 'phone' ? 'minmax(0,1fr)' : 'repeat(3, minmax(0,1fr))',
          gap: 'var(--sp-sm)',
        }}
      >
        <Filter label="Entity" value={entityKind} onChange={setEntityKind} options={AUDIT_ENTITY_KINDS} />
        <Filter label="User" value={who} onChange={setWho} options={AUDIT_USERS} />
        <Filter label="Date" value={day} onChange={setDay} options={AUDIT_DAYS} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Icon name="search" size={22} />}
          title="Nothing in the trail matches this filter"
          description="The record is append-only — an empty result means nothing was recorded under these terms, never that something was removed."
          {...(filtered
            ? {
                actionLabel: 'Clear filters',
                onAction: () => {
                  setEntityKind(ALL)
                  setWho(ALL)
                  setDay(ALL)
                },
              }
            : {})}
        />
      ) : viewport === 'phone' ? (
        /* PHONE: card rows, `▸` expands the before/after diff. */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          {rows.map((r) => (
            <AuditCard
              key={r.id}
              row={r}
              open={expanded === r.id}
              onToggle={() => setExpanded((cur) => (cur === r.id ? null : r.id))}
              showNetwork={showNetwork}
            />
          ))}
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: showNetwork ? 940 : 780 }}>
              <thead>
                <tr style={{ background: 'var(--th-bg)' }}>
                  <th style={th}>When</th>
                  <th style={th}>Who</th>
                  <th style={th}>Action</th>
                  <th style={th}>Entity</th>
                  <th style={th}>Before → after</th>
                  {showNetwork && <th style={th}>Network / location</th>}
                  {/* No global `.sr-only` exists in this build — off-screen
                      inline, the same pattern BookingDetail.tsx uses. */}
                  <th style={{ ...th, width: 44 }}>
                    <span style={srOnly}>Detail</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const open = expanded === r.id
                  const first = r.changes[0]
                  return (
                    <Fragment key={r.id}>
                      <tr style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ ...td, color: 'var(--text2)' }}>
                          <span className="figure">{when(r.timestamp)}</span>
                        </td>
                        <td style={{ ...td, fontWeight: 600 }}>
                          {r.user}
                          <span style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 500 }}>
                            {r.role}
                          </span>
                        </td>
                        <td style={td}>
                          <ActionPill action={r.action} />
                        </td>
                        <td className="identifier" style={td}>
                          {entityLabel(r.entity, r.timestamp)}
                        </td>
                        <td style={{ ...td, whiteSpace: 'normal' }}>
                          {first ? <Diff before={first.before} after={first.after} /> : <span style={{ color: 'var(--muted)' }}>—</span>}
                          {r.changes.length > 1 && (
                            <span style={{ marginLeft: 8, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
                              +{r.changes.length - 1} more
                            </span>
                          )}
                        </td>
                        {showNetwork && (
                          <td style={{ ...td, color: 'var(--muted)' }}>
                            <span className="figure">{r.ip}</span> — {r.location}
                          </td>
                        )}
                        <td style={td}>
                          <DiscloseButton open={open} onToggle={() => setExpanded((cur) => (cur === r.id ? null : r.id))} row={r} />
                        </td>
                      </tr>
                      {open && (
                        <tr style={{ background: 'var(--card2)' }}>
                          <td colSpan={showNetwork ? 7 : 6} style={{ ...td, whiteSpace: 'normal', padding: '12px 14px' }}>
                            <ChangeList row={r} />
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

      <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.6 }}>
        Append-only. View-only for every role including Owner — this page carries no edit, no delete and no bulk action, by
        specification. {RETENTION_NOTE}
      </p>

      <FooterNote />
    </div>
  )
}

/* ── parts ─────────────────────────────────────────────────────────────── */

function AuditCard({
  row,
  open,
  onToggle,
  showNetwork,
}: {
  row: AuditRow
  open: boolean
  onToggle: () => void
  showNetwork: boolean
}) {
  const first = row.changes[0]
  return (
    <article style={{ ...cardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <ActionPill action={row.action} />
        <span className="identifier" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
          {entityLabel(row.entity, row.timestamp)}
        </span>
        <span className="figure" style={{ marginLeft: 'auto', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
          {when(row.timestamp)}
        </span>
      </div>
      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        {row.user} · {row.role}
      </div>
      {first && <Diff before={first.before} after={first.after} />}
      <DiscloseButton open={open} onToggle={onToggle} row={row} wide />
      {open && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 9 }}>
          <ChangeList row={row} />
          {showNetwork && (
            <p style={{ margin: '9px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              <span className="figure">{row.ip}</span> — {row.location}
            </p>
          )}
        </div>
      )}
    </article>
  )
}

/** §10.4's `▸`. A disclosure, never an action — it changes nothing. */
function DiscloseButton({ open, onToggle, row, wide }: { open: boolean; onToggle: () => void; row: AuditRow; wide?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${open ? 'Hide' : 'Show'} the change detail for ${row.id}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: wide ? 'center' : 'center',
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

function ChangeList({ row }: { row: AuditRow }) {
  return (
    <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
      {row.changes.map((c) => (
        <div key={c.field} style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', alignItems: 'baseline' }}>
          <dt style={{ fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {c.field}
          </dt>
          <dd style={{ margin: 0 }}>
            <Diff before={c.before} after={c.after} />
          </dd>
        </div>
      ))}
    </dl>
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

/** Law 11 — icon + label + colour on every action. */
function ActionPill({ action }: { action: AuditRow['action'] }) {
  const tone =
    action === 'Void' || action === 'Cancel'
      ? { bg: 'var(--st-danger-bg)', fg: 'var(--st-danger-fg)', icon: 'error' as const }
      : action === 'Reverse'
        ? { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)', icon: 'return_arrow' as const }
        : action === 'Retire' || action === 'Archive' || action === 'Close'
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
      }}
    >
      <Icon name={tone.icon} size={11} />
      {action}
    </span>
  )
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly string[]
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <span style={{ fontSize: 'var(--t-th)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>
        {label}
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
        <option value={ALL}>All {label.toLowerCase()}s</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Law 7 — the stored instant is AD/UTC; this only renders it. */
function when(iso: string): string {
  const d = new Date(iso)
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`
}

const th: CSSProperties = {
  textAlign: 'left',
  padding: '9px 12px',
  fontSize: 'var(--t-th)',
  fontWeight: 700,
  color: 'var(--text2)',
  whiteSpace: 'nowrap',
}

const td: CSSProperties = {
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
