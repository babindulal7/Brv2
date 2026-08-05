import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, FooterNote, cardStyle } from '../../components/ui/Page'
import { EmptyState } from '../../components/ui/StateViews'
import { STATUS, BRAND, BRAND_TEXT } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import { formatMoney } from '../../lib/money'
import { useCanViewMoney } from '../today/useMoneyVisibility'
import { TIER_TONE, type MembershipTier } from '../../data/clients'
import {
  TABS,
  PLANS,
  PLAN_VIEWS,
  COMPARISON_ROWS,
  STACK_NOTE,
  GRACE_NOTE,
  MEMBERS,
  LEGEND,
  BUCKET_TONE,
  MEMBER_ROWS_PER_PAGE,
  chipsFor,
  kpisFor,
} from '../../data/membership'
import type { Plan, MemberRow, MemberBucket, PlanView, Usage } from '../../data/membership'

/* ── small parts ───────────────────────────────────────────────────────── */

function Pill({ text, status, small }: { text: string; status: StatusKey; small?: boolean }) {
  const c = STATUS[status]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: small ? 18 : 21,
        padding: small ? '0 6px' : '0 8px',
        borderRadius: 5,
        background: c.bg,
        color: c.fg,
        border: c.border ? `1px solid ${c.border}` : undefined,
        // §4.3.6 — the floor is --t-th; raw px also opts out of --ui-scale.
        fontSize: 'var(--t-th)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  )
}

/**
 * Usage bar. A capped row is coloured and labelled "Limit reached" — the label
 * is what carries the meaning, the colour only reinforces it.
 */
function UsageBar({ u }: { u: Usage }) {
  const tone = u.suspended ? 'neutral' : u.capped ? 'danger' : 'primary'
  return (
    <span style={{ display: 'block', minWidth: 74 }}>
      <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
        {u.text}
      </span>
      <span
        aria-hidden
        style={{ display: 'block', height: 4, borderRadius: 999, background: 'var(--card2)', marginTop: 4, overflow: 'hidden' }}
      >
        <span style={{ display: 'block', width: `${u.pct}%`, height: '100%', background: BRAND[tone], borderRadius: 999 }} />
      </span>
      {(u.capped || u.suspended) && (
        <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: BRAND_TEXT[tone], marginTop: 2 }}>
          {u.suspended ? 'Suspended' : 'Limit reached'}
        </span>
      )}
    </span>
  )
}

function PlanCard({ p, money, onViewMembers, memberCount }: {
  p: Plan
  money: boolean
  memberCount: number
  onViewMembers: () => void
}) {
  const limits = money ? p.limits : p.limits.filter((l) => !l.money)
  return (
    <article style={{ ...cardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            display: 'grid',
            placeItems: 'center',
            background: STATUS[p.badgeKey].bg,
            color: STATUS[p.badgeKey].fg,
            border: STATUS[p.badgeKey].border ? `1px solid ${STATUS[p.badgeKey].border}` : undefined,
            flexShrink: 0,
          }}
        >
          <Icon name={p.icon} size={18} fill />
        </span>
        <span style={{ minWidth: 0 }}>
          <span
            style={{ display: 'block', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {p.name}
          </span>
          <span style={{ display: 'block', marginTop: 3 }}>
            <Pill text={p.badge} status={p.badgeKey} small />
          </span>
        </span>
      </div>

      {/* §8.3 — the annual fee is a rupee figure, so it is absent for Warehouse. */}
      {money && (
        <div>
          <span className="figure" style={{ fontSize: p.per ? 19 : 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            {p.price}
          </span>
          {p.per && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginLeft: 4 }}>{p.per}</span>}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {p.discounts.map((d) => (
          <span key={d} style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            {d}
          </span>
        ))}
      </div>

      <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {limits.map((l) => (
          <span key={l.label} style={{ display: 'flex', gap: 8, fontSize: 'var(--t-meta)', alignItems: 'baseline' }}>
            <span style={{ color: 'var(--text2)', flex: 1, minWidth: 0 }}>{l.label}</span>
            <span className="figure" style={{ fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
              {l.value}
            </span>
          </span>
        ))}
      </div>

      <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {p.features.map((f) => (
          <span key={f.text} style={{ display: 'flex', gap: 6, fontSize: 'var(--t-meta)', alignItems: 'center' }}>
            <Icon
              name={f.kind === 'off' ? 'close' : f.kind === 'pending' ? 'timer' : 'dot'}
              size={12}
              style={{
                color:
                  f.kind === 'neutral'
                    ? 'var(--st-progress-fg)'
                    : f.kind === 'on'
                      ? 'var(--success-text)'
                      : 'var(--disabled)',
                flexShrink: 0,
              }}
            />
            <span style={{ color: f.kind === 'off' ? 'var(--muted)' : 'var(--text2)' }}>{f.text}</span>
          </span>
        ))}
      </div>

      <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: 9 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          <Icon name="users" size={13} style={{ color: 'var(--muted)' }} />
          <span className="figure">{memberCount}</span> {memberCount === 1 ? 'member' : 'members'}
        </span>
        {/*
          The render leaves this as a link to nowhere. The members it names are
          in the table on this same screen, so it filters that table instead of
          navigating — a real destination beats a plausible one.
        */}
        <button
          type="button"
          onClick={onViewMembers}
          disabled={memberCount === 0}
          title={memberCount === 0 ? `No member is on the ${p.name} plan yet` : `Filter the member list to ${p.name}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 7,
            padding: 0,
            border: 'none',
            background: 'transparent',
            fontFamily: 'inherit',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            color: memberCount === 0 ? 'var(--disabled)' : 'var(--link)',
            cursor: memberCount === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          View members
          <Icon name="arrow_right" size={12} />
        </button>
      </div>
    </article>
  )
}

const th = {
  textAlign: 'left' as const,
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
const td = { padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const, verticalAlign: 'top' as const }

function PageBtn({ label, active, disabled, onClick }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      style={{
        minWidth: 26,
        height: 26,
        borderRadius: 7,
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

/* ── screen ────────────────────────────────────────────────────────────── */

/** Bulk membership actions have no service behind them yet; the buttons say so. */
const BULK_REASON = 'Bulk membership actions are not built yet — no reminder or level-change service exists'

/**
 * A control the screen cannot honour is rendered visibly unavailable **with the
 * reason attached**, never as a live-looking button that does nothing. The
 * shared `Button` takes no `title`, so the reason rides on a wrapper that is
 * also the accessible description.
 */
function Unavailable({ reason, children }: { reason: string; children: ReactNode }) {
  return (
    <span title={reason} aria-label={reason} style={{ display: 'inline-flex' }}>
      {children}
    </span>
  )
}

/**
 * Clients → **Membership**, built from renders `Clients - Memberships.PNG` and
 * `Clients - Memberships Tab.PNG`.
 *
 * Foundation §5.1 makes Membership a **tab on Clients**, not a screen of its
 * own, so `Clients.tsx` renders this with `embedded` and owns the page title and
 * the tab strip. The standalone shape is kept for the `/clients/memberships`
 * deep link, where the tabs route back to `/clients`.
 *
 * Dates render **BS above AD**. The render puts AD first, but this table sits
 * inside the Clients page whose footer states "All dates are shown in BS above
 * AD" (`data/nav.ts`), and the directory table one tab away already leads with
 * BS — one page cannot state a date rule its own table breaks.
 */
export default function Membership({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate()
  const money = useCanViewMoney()

  const [bucket, setBucket] = useState<MemberBucket | null>(null)
  const [level, setLevel] = useState<MembershipTier | null>(null)
  const [renewingSoon, setRenewingSoon] = useState(false)
  const [planView, setPlanView] = useState<PlanView>('Cards')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [perPage, setPerPage] = useState<number>(MEMBER_ROWS_PER_PAGE[1])
  const [page, setPage] = useState(1)

  const chips = useMemo(() => chipsFor(MEMBERS), [])
  const kpis = useMemo(() => kpisFor(MEMBERS, money), [money])

  const rows = useMemo(
    () =>
      MEMBERS.filter((m) => {
        if (bucket && m.bucket !== bucket) return false
        if (level && m.level !== level) return false
        // "Renews within 30 days" is forward-looking — a member already past the
        // renewal date is overdue, not renewing soon.
        if (renewingSoon && !(m.daysLeft >= 0 && m.daysLeft <= 30)) return false
        return true
      }),
    [bucket, level, renewingSoon],
  )

  const pageCount = Math.max(1, Math.ceil(rows.length / perPage))
  const current = Math.min(page, pageCount)
  const pageRows = rows.slice((current - 1) * perPage, current * perPage)

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((m) => selected.has(m.id))
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) pageRows.forEach((m) => next.delete(m.id))
      else pageRows.forEach((m) => next.add(m.id))
      return next
    })

  const resetPage = () => setPage(1)

  const headers: Array<{ label: string; money?: boolean }> = [
    { label: 'Member' },
    { label: 'Level' },
    { label: 'Status' },
    { label: 'Join Date (BS / AD)' },
    { label: 'Renewal Date (BS / AD)' },
    { label: 'Days Left' },
    { label: 'Paid (Fee)', money: true },
    { label: 'Membership Savings (vs full price)', money: true },
    { label: 'Lifetime Spend', money: true },
    { label: 'Bookings (This Month)' },
    { label: 'Active Rentals' },
    { label: 'Credit Limit (Rs)', money: true },
  ]
  const shownHeaders = money ? headers : headers.filter((h) => !h.money)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {!embedded && (
        <>
          <PageHeader
            title="Clients"
            description="Manage memberships, renewals and member benefits"
            actions={
              <>
                {/*
                  The render's primary verb. Nothing enrols a member — there is
                  no membership-creation flow anywhere in the build — so it is
                  disabled with the reason rather than navigating to this same
                  view, which would look like it had done something.
                */}
                <Unavailable reason="Membership enrolment is not built yet — no flow creates a membership record">
                  <Button icon="plus" variant="primary" disabled>
                    New Membership
                  </Button>
                </Unavailable>
                <Button icon="settings" onClick={() => navigate('/settings')}>
                  Settings
                </Button>
              </>
            }
          />

          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)' }}>
            {/*
              §8.3 — Credit is a money surface end to end, so for a money-blind
              role the tab is **absent** here exactly as it is absent from the
              tab strip `Clients.tsx` owns. Left in, it would offer a tab that
              silently lands on the directory instead.
            */}
            {TABS.filter((t) => money || t !== 'Credit').map((t) => {
              const on = t === 'Membership'
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    if (!on) navigate(`/clients?tab=${t.toLowerCase()}`)
                  }}
                  aria-current={on ? 'page' : undefined}
                  style={{
                    height: 34,
                    padding: '0 12px',
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
        </>
      )}

      <KpiStrip items={kpis} columns={kpis.length} />

      <Card
        title="Membership Plans"
        action={
          <>
            {PLAN_VIEWS.map((v) => (
              <Button key={v} variant={planView === v ? 'primary' : 'secondary'} onClick={() => setPlanView(v)}>
                {v}
              </Button>
            ))}
            <Unavailable reason="Plan editing is not built yet — plan definitions are seed data, not a settings surface">
              <Button icon="tool" disabled>
                Edit Plans
              </Button>
            </Unavailable>
          </>
        }
      >
        <p style={{ margin: '-4px 0 12px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          {money
            ? 'Credit limits shown are defaults. Actual approved limit may vary per member.'
            : 'Fees and credit limits are not shown for this role.'}
        </p>

        {planView === 'Cards' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 10, alignItems: 'stretch' }}>
            {PLANS.map((p) => (
              <PlanCard
                key={p.name}
                p={p}
                money={money}
                memberCount={MEMBERS.filter((m) => m.level === p.name).length}
                onViewMembers={() => {
                  setLevel(p.name)
                  setBucket(null)
                  resetPage()
                }}
              />
            ))}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
              <thead>
                <tr style={{ background: 'var(--th-bg)' }}>
                  <th style={th}>Benefit</th>
                  {PLANS.map((p) => (
                    <th key={p.name} style={{ ...th, textAlign: 'right' }}>
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.filter((r) => money || !r.money).map((r) => (
                  <tr key={r.label} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...td, color: 'var(--text2)' }}>{r.label}</td>
                    {PLANS.map((p) => (
                      <td key={p.name} className="figure" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                        {r.pick(p)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td style={{ ...td, color: 'var(--text2)' }}>Members on plan</td>
                  {PLANS.map((p) => (
                    <td key={p.name} className="figure" style={{ ...td, textAlign: 'right' }}>
                      {MEMBERS.filter((m) => m.level === p.name).length}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <p
          style={{
            margin: '12px 0 0',
            display: 'flex',
            gap: 6,
            alignItems: 'flex-start',
            fontSize: 'var(--t-meta)',
            color: 'var(--text2)',
          }}
        >
          <Icon name="info" size={13} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 1 }} />
          {STACK_NOTE}
        </p>
      </Card>

      {/* ── quick filters ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {chips.map((c) => {
          const on = bucket === c.bucket
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => {
                setBucket(c.bucket)
                resetPage()
              }}
              aria-pressed={on}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                height: 32,
                padding: '0 11px',
                borderRadius: 8,
                border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                background: on ? 'var(--nav-active-bg)' : 'var(--card)',
                color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                fontSize: 'var(--t-meta)',
                fontWeight: on ? 600 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {c.label}
              <span
                className="figure"
                style={{
                  minWidth: 18,
                  height: 18,
                  borderRadius: 5,
                  display: 'inline-grid',
                  placeItems: 'center',
                  background: 'var(--card2)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 700,
                  padding: '0 4px',
                }}
              >
                {c.count}
              </span>
            </button>
          )
        })}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button
            icon="calendar"
            variant={renewingSoon ? 'primary' : 'secondary'}
            onClick={() => {
              setRenewingSoon((v) => !v)
              resetPage()
            }}
          >
            Renews within 30 days
          </Button>
          <Unavailable reason="Advanced membership filters are not built yet — the status, level and renewal filters on this row are the ones that exist">
            <Button icon="queues" disabled>
              More filters
            </Button>
          </Unavailable>
          <Unavailable reason="Membership export is not built yet — no export service exists">
            <Button icon="download" disabled>
              Export
            </Button>
          </Unavailable>
        </span>
      </div>

      {level && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 'var(--r-btn)',
            background: 'var(--nav-active-bg)',
            border: '1px solid var(--border)',
            fontSize: 'var(--t-meta)',
            color: 'var(--text)',
          }}
        >
          <Icon name="card" size={14} style={{ color: 'var(--nav-active-accent)' }} />
          Showing <strong>{level}</strong> members only
          <button
            type="button"
            onClick={() => {
              setLevel(null)
              resetPage()
            }}
            style={{
              marginLeft: 'auto',
              border: 'none',
              background: 'transparent',
              color: 'var(--link)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Clear level filter
          </button>
        </div>
      )}

      {/* ── members ───────────────────────────────────────────────────── */}
      <Card bodyStyle={{ padding: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 12px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--card2)',
            flexWrap: 'wrap',
          }}
        >
          <input
            type="checkbox"
            aria-label="Select all members on this page"
            checked={allOnPageSelected}
            onChange={toggleAll}
          />
          <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            {selected.size} selected
          </span>
          {['Send Reminder', 'Change Level', 'More'].map((b) => (
            <Unavailable key={b} reason={BULK_REASON}>
              <Button disabled>{b}</Button>
            </Unavailable>
          ))}
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--link)',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Clear selection
            </button>
          )}
          <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            Rows per page
            <select
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value))
                resetPage()
              }}
              className="figure"
              style={{
                height: 26,
                padding: '0 6px',
                borderRadius: 7,
                border: '1px solid var(--border)',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
                fontFamily: 'inherit',
              }}
            >
              {MEMBER_ROWS_PER_PAGE.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: money ? 1240 : 880 }}>
            <thead>
              <tr style={{ background: 'var(--th-bg)' }}>
                <th style={{ ...th, width: 28 }} />
                {shownHeaders.map((h) => (
                  <th key={h.label} style={th}>
                    {h.label}
                  </th>
                ))}
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={shownHeaders.length + 2} style={{ padding: '24px 16px' }}>
                    <EmptyState
                      title="No members match this filter"
                      description="No membership record matches the status, level and renewal filters currently applied."
                      actionLabel="Clear all filters"
                      onAction={() => {
                        setBucket(null)
                        setLevel(null)
                        setRenewingSoon(false)
                        resetPage()
                      }}
                    />
                  </td>
                </tr>
              ) : (
                pageRows.map((m: MemberRow) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...td, width: 28 }}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${m.name}`}
                        checked={selected.has(m.id)}
                        onChange={() =>
                          setSelected((prev) => {
                            const next = new Set(prev)
                            if (next.has(m.id)) next.delete(m.id)
                            else next.add(m.id)
                            return next
                          })
                        }
                      />
                    </td>

                    <td style={td}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          aria-hidden
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 7,
                            background: STATUS[m.avatarTone].bg,
                            color: STATUS[m.avatarTone].fg,
                            border: STATUS[m.avatarTone].border ? `1px solid ${STATUS[m.avatarTone].border}` : undefined,
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: 'var(--t-meta)',
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {m.initials}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 600 }}>{m.name}</span>
                          <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{m.kind}</span>
                        </span>
                      </span>
                    </td>

                    <td style={td}>
                      <Pill text={m.level} status={TIER_TONE[m.level]} small />
                    </td>

                    <td style={td}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: 'var(--t-meta)',
                          fontWeight: 600,
                          color: BRAND_TEXT[BUCKET_TONE[m.bucket]],
                        }}
                      >
                        <Icon name="dot" size={9} />
                        {/* §4.2 — colour never carries the state alone, so Grace
                            is named in words rather than left to a blue dot. */}
                        {m.bucket === 'Lapsed' ? 'Lapsed' : m.bucket === 'Grace' ? 'In grace' : 'Active'}
                      </span>
                      <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>
                        {m.statusNote}
                      </span>
                    </td>

                    <td style={td}>
                      <span className="figure" style={{ display: 'block' }}>{m.joinBs}</span>
                      <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{m.joinAd}</span>
                    </td>

                    <td style={td}>
                      <span className="figure" style={{ display: 'block' }}>{m.renewBs}</span>
                      <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{m.renewAd}</span>
                    </td>

                    <td
                      className="figure"
                      style={{ ...td, color: m.daysLeft < 0 ? 'var(--danger-text)' : 'var(--text)', fontWeight: 600 }}
                    >
                      {m.daysLeft} days
                    </td>

                    {money && <td className="figure" style={td}>{formatMoney(m.feePaisa)}</td>}

                    {money && (
                      <td style={td}>
                        <span className="figure" style={{ display: 'block', color: 'var(--success-text)', fontWeight: 600 }}>
                          {formatMoney(m.savingsPaisa)}
                        </span>
                        <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                          ({m.savingsNote})
                        </span>
                      </td>
                    )}

                    {money && (
                      <td className="figure" style={{ ...td, fontWeight: 600 }}>
                        {formatMoney(m.lifetimePaisa)}
                      </td>
                    )}

                    <td style={td}>
                      <UsageBar u={m.bookings} />
                    </td>
                    <td style={td}>
                      <UsageBar u={m.rentals} />
                    </td>

                    {money && (
                      <td style={td}>
                        <span className="figure" style={{ display: 'block', fontWeight: 600 }}>
                          {formatMoney(m.creditPaisa)}
                        </span>
                        {m.creditDefaultPaisa !== undefined && (
                          <span
                            className="figure"
                            style={{
                              display: 'block',
                              fontSize: 'var(--t-meta)',
                              color: 'var(--muted)',
                              textDecoration: m.creditWithdrawn ? 'line-through' : 'none',
                            }}
                          >
                            {m.creditWithdrawn ? formatMoney(m.creditDefaultPaisa) : `(Default ${formatMoney(m.creditDefaultPaisa)})`}
                          </span>
                        )}
                      </td>
                    )}

                    <td style={{ ...td, width: 40, textAlign: 'right' }}>
                      {/*
                        There is no `/clients/:id` route, so the honest
                        destination is the directory filtered to this member —
                        the label says exactly that, and `?q=` is what the
                        directory search reads on mount.
                      */}
                      <button
                        type="button"
                        aria-label={`Find ${m.name} in the client directory`}
                        title={`Find ${m.name} in the client directory`}
                        onClick={() => navigate(`/clients?q=${encodeURIComponent(m.name)}`)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--muted)',
                          cursor: 'pointer',
                          width: 26,
                          height: 26,
                          borderRadius: 6,
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Icon name="external_link" size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '10px 14px',
            flexWrap: 'wrap',
            fontSize: 'var(--t-meta)',
            color: 'var(--text2)',
          }}
        >
          <span>
            {rows.length === 0
              ? 'Showing 0 members'
              : `Showing ${(current - 1) * perPage + 1} to ${Math.min(current * perPage, rows.length)} of ${rows.length} members`}
          </span>
          <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {LEGEND.map((l) => (
              <span key={l.text} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Icon name="dot" size={9} style={{ color: BRAND[l.tone] }} />
                {l.text}
              </span>
            ))}
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
            <PageBtn label="‹" disabled={current === 1} onClick={() => setPage(current - 1)} />
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
              <PageBtn key={p} label={String(p)} active={p === current} onClick={() => setPage(p)} />
            ))}
            <PageBtn label="›" disabled={current === pageCount} onClick={() => setPage(current + 1)} />
          </span>
        </div>
      </Card>

      <p
        style={{
          margin: 0,
          display: 'flex',
          gap: 6,
          alignItems: 'flex-start',
          fontSize: 'var(--t-meta)',
          color: 'var(--text2)',
        }}
      >
        <Icon name="info" size={13} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 1 }} />
        {GRACE_NOTE}
      </p>

      {!embedded && <FooterNote extra={['Discount stacking is capped at 25%']} />}
    </div>
  )
}
