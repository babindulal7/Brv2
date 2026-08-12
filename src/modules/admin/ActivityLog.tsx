import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import Icon from '../../components/ui/Icon'
import { PageHeader, KpiStrip, FooterNote, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { EmptyState } from '../../components/ui/StateViews'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import {
  ACTIVITY_METRICS,
  ACTIVITY_TIMELINE,
  ACTIVITY_USERS,
  ACTIVITY_MODULES_PRESENT,
  ACTIVITY_DAYS,
  RETENTION_NOTE,
  targetLabel,
} from '../../data/activityLog'
import type { ActivityRow } from '../../data/activityLog'

/**
 * **Activity Log — `10_TOOLS.md` §10.5.**
 *
 * ```
 * ┌ ← Activity              [user ▾][module ▾][date ▾] ┐
 * │ ● 10:42  who │ did what, where                     │
 * │ ● 10:31  who │ did what, where   timeline, newest  │
 * │ ● 09:58  who │ did what, where   first             │
 * └────────────────────────────────────────────────────┘
 * ```
 *
 * §10.5 draws a **timeline**, not a table — a dotted rail with the time on the
 * left and the sentence on the right — and that is what this renders at every
 * width. The rail collapses to a single column below 768 rather than becoming a
 * card grid, because a timeline that loses its spine stops being one.
 *
 * ## Not the audit trail
 *
 * The two screens look alike and are not. Audit records **state changes** and is
 * append-only and view-only by specification (§10.4). This records **usage** —
 * who looked at what, who exported, who failed to sign in. A failed sign-in has
 * no before/after and belongs only here. Keeping them separate is why
 * `data/activityLog.ts` and `data/auditLog.ts` are two files rather than one
 * table with a `kind` column.
 *
 * The KPI strip predates this spec and no prose removes it (Rulings §1). Its
 * figures are counted from the rows; the old seed's `critical: 12` card is gone
 * because nothing in the build assigns a severity to an activity row, and
 * Rulings §8 forbids the plausible default that would have kept it.
 *
 * The `←` is wireframe shorthand — breadcrumbs, no Back button.
 */

const ALL = 'All'

export default function ActivityLog() {
  const viewport = useViewport()
  const { user } = useAuth()
  const showNetwork = user?.role === 'Owner' || user?.role === 'Manager' || user?.role === 'Admin'

  const [who, setWho] = useState<string>(ALL)
  const [mod, setMod] = useState<string>(ALL)
  const [day, setDay] = useState<string>(ALL)

  const rows = useMemo(
    () =>
      ACTIVITY_TIMELINE.filter((r) => who === ALL || r.user === who)
        .filter((r) => mod === ALL || r.module === mod)
        .filter((r) => day === ALL || r.timestamp.slice(0, 10) === day),
    [who, mod, day],
  )

  /** Newest first, grouped by day so the spine carries a date header. */
  const groups = useMemo(() => {
    const byDay = new Map<string, ActivityRow[]>()
    for (const r of rows) {
      const key = r.timestamp.slice(0, 10)
      const bucket = byDay.get(key)
      if (bucket) bucket.push(r)
      else byDay.set(key, [r])
    }
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [rows])

  const kpis: Kpi[] = [
    { label: 'Entries', value: String(ACTIVITY_METRICS.totalActivities), icon: 'activity', accent: 'primary', note: 'In this log' },
    { label: 'Failed', value: String(ACTIVITY_METRICS.failed), icon: 'error', accent: 'danger', note: 'Errors or refusals' },
    { label: 'People', value: String(ACTIVITY_METRICS.uniqueUsers), icon: 'users', accent: 'success', note: 'Distinct actors' },
    { label: 'Modules', value: String(ACTIVITY_METRICS.modulesTouched), icon: 'queues', accent: 'progress', note: 'Touched' },
  ]

  const filtered = who !== ALL || mod !== ALL || day !== ALL

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
      <PageHeader
        icon="activity"
        title="Activity"
        description="Who did what, where — newest first. Usage, not state changes; those live in the Audit Log."
      />

      <KpiStrip items={kpis} columns={4} />

      <div
        role="search"
        aria-label="Filter activity"
        style={{
          display: 'grid',
          gridTemplateColumns: viewport === 'phone' ? 'minmax(0,1fr)' : 'repeat(3, minmax(0,1fr))',
          gap: 'var(--sp-sm)',
        }}
      >
        <Filter label="User" value={who} onChange={setWho} options={ACTIVITY_USERS} />
        <Filter label="Module" value={mod} onChange={setMod} options={ACTIVITY_MODULES_PRESENT} />
        <Filter label="Date" value={day} onChange={setDay} options={ACTIVITY_DAYS} />
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={<Icon name="search" size={22} />}
          title="No activity matches this filter"
          description="Try a wider date, another module, or clear the filters to see the whole timeline."
          {...(filtered
            ? {
                actionLabel: 'Clear filters',
                onAction: () => {
                  setWho(ALL)
                  setMod(ALL)
                  setDay(ALL)
                },
              }
            : {})}
        />
      ) : (
        <div style={{ ...cardStyle, padding: viewport === 'phone' ? '4px 14px 14px' : '4px 18px 18px' }}>
          {groups.map(([date, entries]) => (
            <section key={date} aria-label={`Activity on ${date}`}>
              <h2
                style={{
                  margin: '14px 0 4px',
                  fontSize: 'var(--t-th)',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                }}
              >
                <span className="figure">{date}</span>
              </h2>
              <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {entries.map((r, i) => (
                  <Entry key={r.id} row={r} last={i === entries.length - 1} phone={viewport === 'phone'} showNetwork={showNetwork} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.6 }}>{RETENTION_NOTE}</p>

      <FooterNote />
    </div>
  )
}

/* ── one line of the timeline ──────────────────────────────────────────── */

function Entry({ row, last, phone, showNetwork }: { row: ActivityRow; last: boolean; phone: boolean; showNetwork: boolean }) {
  const failed = row.status === 'Failed'
  const target = targetLabel(row.target, row.timestamp)

  return (
    <li
      style={{
        display: 'grid',
        /* Desktop/tablet keep §10.5's two columns — time on the left of the
           spine, the sentence to its right. Phone drops to one column and the
           time moves above the sentence; the spine survives at both. */
        gridTemplateColumns: phone ? '18px minmax(0,1fr)' : '76px 18px minmax(0,1fr)',
        gap: '0 10px',
        alignItems: 'start',
      }}
    >
      {!phone && (
        <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', padding: '10px 0', textAlign: 'right' }}>
          {hhmm(row.timestamp)}
        </span>
      )}

      {/* The spine. Law 11 — the dot is decoration; the status is stated in
          words on the row itself, never by colour alone. */}
      <span aria-hidden style={{ display: 'grid', gridTemplateRows: 'auto 1fr', justifyItems: 'center', height: '100%' }}>
        <span
          style={{
            marginTop: 13,
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: failed ? 'var(--danger)' : 'var(--nav-active-accent)',
            flexShrink: 0,
          }}
        />
        {!last && <span style={{ width: 1, height: '100%', background: 'var(--border)' }} />}
      </span>

      <div style={{ padding: '10px 0 14px', minWidth: 0 }}>
        {phone && (
          <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            {hhmm(row.timestamp)}
          </span>
        )}
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text)', lineHeight: 1.55 }}>
          <strong style={{ fontWeight: 700 }}>{row.user}</strong> {row.action.toLowerCase()}
          {target && (
            <>
              {' '}
              <span className="identifier" style={{ fontWeight: 600 }}>
                {target}
              </span>
            </>
          )}
          <span style={{ color: 'var(--text2)' }}> in {row.where}</span>
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
          <Tag icon="queues" text={row.module} />
          {/* Law 11 — icon + label + colour. Success is not shown as a bare
              green dot, and failure is never colour alone. */}
          <Tag icon={failed ? 'error' : 'check'} text={row.status} tone={failed ? 'danger' : 'neutral'} />
          {showNetwork && (
            <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
              {row.ip} — {row.location}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

function Tag({ icon, text, tone = 'neutral' }: { icon: 'queues' | 'error' | 'check'; text: string; tone?: 'neutral' | 'danger' }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: 20,
        padding: '0 7px',
        borderRadius: 'var(--r-badge)',
        background: tone === 'danger' ? 'var(--st-danger-bg)' : 'var(--card2)',
        color: tone === 'danger' ? 'var(--st-danger-fg)' : 'var(--text2)',
        fontSize: 'var(--t-th)',
        fontWeight: 700,
      }}
    >
      <Icon name={icon} size={10} />
      {text}
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

/** Law 7 — stored AD/UTC, rendered here. */
function hhmm(iso: string): string {
  return new Date(iso).toISOString().slice(11, 16)
}

const selectStyle: CSSProperties = {
  width: '100%',
  /* Law 15 — 44×44 at every width. */
  minHeight: 44,
  padding: '8px 12px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-body)',
  fontFamily: 'inherit',
}
