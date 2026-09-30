import { Pagination } from '../../components/ui/Pagination'
import { useMemo, useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, FooterNote, cardStyle } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { EmptyState } from '../../components/ui/StateViews'
import { SearchInput } from '../../components/ui/SearchInput'
import { ListControlRow } from '../../components/ui/ListWorkspace'
import { STATUS, BRAND, BRAND_TEXT } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import { formatMoney } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import {
  listMembers,
  TABS,
  PLANS,
  PLAN_VIEWS,
  COMPARISON_ROWS,
  STACK_NOTE,
  GRACE_NOTE,
  LEGEND,
  BUCKET_TONE,
  MEMBER_ROWS_PER_PAGE,
  chipsFor,
  kpisFor,
  type MembershipTier,
  type Plan,
  type MemberRow,
  type MemberBucket,
  type PlanView,
  type Usage,
} from '../../lib/queries/membership'
import './clients.css'

/* ── small parts ───────────────────────────────────────────────────────── */

/**
 * How a membership TIER looks — decided here, in the presentation layer, and
 * deliberately not in `src/data`. The data layer carries the tier (a domain
 * fact: `ClientRecord.membership`, `Plan.name`); this file decides its paint.
 *
 * A tier may not wear a **status** token. v4.1 §2 gives each of the seven hues
 * exactly one operational meaning — orange is "out with the client", green is
 * "home & settled" - and a tier is an attribute of a client, not a state of a
 * rental. The old `data/clients.ts:TIER_TONE` typed tiers as `StatusKey`, which
 * put Elite in the orange the floor reads as "the gear is out".
 *
 * The comparison page still needs five plans to separate at a glance, so this
 * uses `--cat-1..5` — the design system's **categorical** ramp
 * (`components/ui/Charts.tsx`), whose whole job is identity, never state. It is
 * applied as **icon ink on the card surface**: no solid fill, no uppercase word,
 * none of `STATUS_BLOCK`'s anatomy, so it cannot be read as a status block.
 * Measured >= 3:1 against `--surface` in both themes (`--cat-2` is 3.37 in light,
 * which is why the ink sits on the card and not on `--surface-2`, where the same
 * slot measures 2.98).
 *
 * §7.4 still holds — colour is never the only signal: every plan also carries a
 * distinct icon glyph, its name, its price and its segment word.
 */
const TIER_ACCENT: Record<MembershipTier, string> = {
  Academy: 'var(--cat-1)',
  Creator: 'var(--cat-2)',
  Cinematographer: 'var(--cat-3)',
  'Production Alliance': 'var(--cat-4)',
  Elite: 'var(--cat-5)',
}

/**
 * A label chip. Given a `status` it wears that status token; given none it is a
 * quiet surface chip — which is what every **non-status** fact gets here (a
 * membership tier, a plan's segment word), so no hue is spent on something that
 * is not an operational state.
 */
function Pill({ text, status, small }: { text: string; status?: StatusKey; small?: boolean }) {
  const c = status ? STATUS[status] : undefined
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: small ? 18 : 21,
        padding: small ? '0 6px' : '0 8px',
        borderRadius: 5,
        background: c ? c.bg : 'var(--surface-2)',
        color: c ? c.fg : 'var(--text)',
        border: c?.border ? `1px solid ${c.border}` : undefined,
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
        style={{ display: 'block', height: 4, borderRadius: 'var(--r-badge)', background: 'var(--card2)', marginTop: 4, overflow: 'hidden' }}
      >
        <span style={{ display: 'block', width: `${u.pct}%`, height: '100%', background: BRAND[tone], borderRadius: 'var(--r-badge)' }} />
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
    <article className="membership-plan-card" style={{ ...cardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        {/*
          The plan's mark. The glyph carries the tier's categorical colour; the
          tile itself is unpainted, so the card shows no coloured block a reader
          could mistake for a status. See `TIER_ACCENT`.
        */}
        <span
          style={{
            width: 34,
            height: 34,
            display: 'grid',
            placeItems: 'center',
            color: TIER_ACCENT[p.name],
            flexShrink: 0,
          }}
        >
          <Icon name={p.icon} size={20} fill />
        </span>
        <span style={{ minWidth: 0 }}>
          <span
            style={{ display: 'block', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {p.name}
          </span>
          <span style={{ display: 'block', marginTop: 3 }}>
            <Pill text={p.badge} small />
          </span>
        </span>
      </div>

      {/* §8.3 — the annual fee is a rupee figure, so it is absent for Warehouse. */}
      {money && (
        <div className="membership-price-wrap">
          <span className="figure membership-price-amount client-mono" style={{ fontSize: p.per ? 19 : 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
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
          <span key={l.label} style={{ display: 'flex', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', alignItems: 'baseline' }}>
            <span style={{ color: 'var(--text2)', flex: 1, minWidth: 0 }}>{l.label}</span>
            <span className="figure client-mono" style={{ fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
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
                /* --ready-text, not --st-progress-fg — the MIRROR of the
                   white-on-light bug, and it bites the dark theme instead.
                   --st-progress-fg is --on-ready, which is near-black
                   (#231a05 / #1c1405) in BOTH themes because it is ink for a
                   solid yellow fill. This glyph carries no fill, so on the
                   dark card it was black-on-black. Its two sibling branches
                   already name text-safe tokens; this one was the outlier. */
                color:
                  f.kind === 'neutral'
                    ? 'var(--ready-text)'
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
        {memberCount > 0 && <button
          type="button"
          onClick={onViewMembers}
          title={`Filter the member list to ${p.name}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--sp-xs)',
            marginTop: 7,
            padding: 0,
            border: 'none',
            background: 'transparent',
            fontFamily: 'inherit',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            color: 'var(--link)',
            cursor: 'pointer',
          }}
        >
          View members
          <Icon name="arrow_right" size={12} />
        </button>}
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
/*
 * `height` on a `<td>` behaves as a MINIMUM, so this is the §7.3 row floor
 * ("rows >= 56px") expressed with the token rather than with padding
 * arithmetic. Horizontal padding stays at 10 — the floor is a vertical law and
 * this table is wide enough already.
 *
 * This is a DATA-INTEGRITY fix, not a density preference. The members table
 * gives every row two controls, a selection checkbox on the left and the
 * find-in-directory button on the right, and at 10 + 10 + a --t-meta line the
 * row stood around 37px — too short to contain the 44px hit area §7.3 owes
 * either of them. A target bigger than its row overhangs into the neighbour,
 * and because an absolutely positioned hit area wins the hit test the LATER
 * row in the DOM takes any tap in the overlap band; that is precisely the bug
 * commit 7d38cdf fixed on the floor workspaces. A selection checkbox is the
 * worst place for it: `selected` is what a bulk action reads, so a boundary
 * tap quietly puts the wrong member into the set and the operator sees a
 * plausible count either way. The same constant also floors the plan
 * comparison table above, which carries no controls but owes the row law
 * anyway and reads better at the same rhythm.
 */
const td = { height: 'var(--row-min-h)', padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const, verticalAlign: 'top' as const }

/* ── screen ────────────────────────────────────────────────────────────── */

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
  const [params, setParams] = useSearchParams()
  const search = params.get('mq') ?? ''
  const money = useCanViewMoney()

  const [bucket, setBucket] = useState<MemberBucket | null>(null)
  const [level, setLevel] = useState<MembershipTier | null>(null)
  const [renewingSoon, setRenewingSoon] = useState(false)
  const [planView, setPlanView] = useState<PlanView>('Cards')
  const [perPage, setPerPage] = useState<number>(MEMBER_ROWS_PER_PAGE[1])
  const [page, setPage] = useState(1)

  const [memberList, setMemberList] = useState<MemberRow[]>([])

  useEffect(() => {
    let active = true
    listMembers().then((res) => {
      if (active) {
        setMemberList(res.rows)
      }
    }).catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const chips = useMemo(() => chipsFor(memberList), [memberList])
  const kpis = useMemo(() => kpisFor(memberList, money), [memberList, money])

  const rows = useMemo(
    () =>
      memberList.filter((m) => {
        if (search && !`${m.name} ${m.id} ${m.level} ${m.kind}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) return false
        if (bucket && m.bucket !== bucket) return false
        if (level && m.level !== level) return false
        // "Renews within 30 days" is forward-looking — a member already past the
        // renewal date is overdue, not renewing soon.
        if (renewingSoon && !(m.daysLeft >= 0 && m.daysLeft <= 30)) return false
        return true
      }),
    [memberList, search, bucket, level, renewingSoon],
  )
  const hasMemberFilters = Boolean(search || bucket || level || renewingSoon)

  const pageCount = Math.max(1, Math.ceil(rows.length / perPage))
  const current = Math.min(page, pageCount)
  const pageRows = rows.slice((current - 1) * perPage, current * perPage)

  const resetPage = () => setPage(1)

  const headers: Array<{ label: string; money?: boolean }> = [
    { label: 'Member' },
    { label: 'Level' },
    { label: 'Status' },
    { label: 'Health' },
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
                <Button icon="settings" onClick={() => navigate('/settings')}>
                  Settings
                </Button>
              </>
            }
          />

          <div style={{ display: 'flex', gap: 'var(--sp-xs)', borderBottom: '1px solid var(--border)' }}>
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
          </>
        }
      >
        <p style={{ margin: '-4px 0 12px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          {money
            ? 'Credit limits shown are defaults. Actual approved limit may vary per member.'
            : 'Fees and credit limits are not shown for this role.'}
        </p>

        {planView === 'Cards' ? (
          <div className="membership-plan-grid">
            {PLANS.map((p) => (
              <PlanCard
                key={p.name}
                p={p}
                money={money}
                memberCount={memberList.filter((m) => m.level === p.name).length}
                onViewMembers={() => {
                  setLevel(p.name)
                  setBucket(null)
                  resetPage()
                }}
              />
            ))}
          </div>
        ) : (
          <DataTableShell ariaLabel="Plan comparison" data-table-scroll style={{ overflowX: 'auto' }}>
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
                      {memberList.filter((m) => m.level === p.name).length}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </DataTableShell>
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

      <ListControlRow
        search={
          <SearchInput
            value={search}
            onChange={(value) => {
              const next = new URLSearchParams(params)
              if (value) next.set('mq', value)
              else next.delete('mq')
              setParams(next, { replace: true })
              resetPage()
            }}
            onClear={() => {
              const next = new URLSearchParams(params)
              next.delete('mq')
              setParams(next, { replace: true })
              resetPage()
            }}
            placeholder="Search members"
            aria-label="Search members"
          />
        }
      />

      {/* ── quick filters ─────────────────────────────────────────────── */}
      <div className="client-chip-track" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
              className={`client-filter-chip ${on ? 'is-active' : ''}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                minHeight: 44,
                padding: '0 11px',
                borderRadius: 'var(--r-sm)',
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
                className="client-chip-badge figure client-mono"
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
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--sp-sm)' }}>
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
        </span>
      </div>

      {level && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-sm)',
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
            gap: 'var(--sp-sm)',
            padding: '9px 12px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--card2)',
            /* Flush in the card's top corners (body padding is 0), so it takes
               the card's radius — otherwise its square corners paint over the
               14px arc. See ClientsDirectory's strip for the same pattern. */
            borderRadius: 'var(--r-card) var(--r-card) 0 0',
            flexWrap: 'wrap',
          }}
        >
          <Pagination page={current} total={rows.length} pageSize={perPage} onPageChange={setPage} pageSizeOptions={MEMBER_ROWS_PER_PAGE} onPageSizeChange={(size) => { setPerPage(size); resetPage() }} />
        </div>

        <DataTableShell ariaLabel="Membership directory" data-table-scroll className="client-table-shell" style={{ overflowX: 'auto' }}>
          <table className="client-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: money ? 1240 : 880 }}>
            <thead>
              <tr style={{ background: 'var(--th-bg)' }}>
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
                  <td colSpan={shownHeaders.length + 1} style={{ padding: '24px 16px' }}>
                    <EmptyState
                      title={hasMemberFilters ? 'No members match this filter' : 'No membership records to show'}
                      description={hasMemberFilters
                        ? 'No membership record matches the current search and filters.'
                        : 'Membership records will appear here when available.'}
                      {...(hasMemberFilters ? { actionLabel: 'Clear all filters', onAction: () => {
                        setBucket(null)
                        setLevel(null)
                        setRenewingSoon(false)
                        const next = new URLSearchParams(params)
                        next.delete('mq')
                        setParams(next, { replace: true })
                        resetPage()
                      } } : {})}
                    />
                  </td>
                </tr>
              ) : (
                pageRows.map((m: MemberRow) => (
                  <tr key={m.id} className="client-row" style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
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
                      {/*
                        Quiet on purpose. The Status cell immediately to the
                        right is where this row spends its colour, and a second
                        tinted chip beside it competed with the one signal that
                        is actually operational. The tier is named in words and
                        is filterable from the Level control above.
                      */}
                      <Pill text={m.level} small />
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
                      <span
                        className="figure client-mono"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontWeight: 700,
                          fontSize: 'var(--t-meta)',
                          color: (m.healthScore ?? 80) >= 70
                            ? 'var(--success-text)'
                            : (m.healthScore ?? 80) >= 55
                            ? 'var(--warn-text)'
                            : 'var(--danger-text)',
                        }}
                        title={`Member health & reliability score: ${m.healthScore ?? 80}/100`}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: (m.healthScore ?? 80) >= 70
                              ? 'var(--success-text)'
                              : (m.healthScore ?? 80) >= 55
                              ? 'var(--warn-text)'
                              : 'var(--danger-text)',
                          }}
                        />
                        {m.healthScore ?? 80} / 100
                      </span>
                    </td>

                    <td style={td}>
                      <span className="figure client-mono" style={{ display: 'block' }}>{m.joinBs}</span>
                      <span className="figure client-mono" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{m.joinAd}</span>
                    </td>

                    <td style={td}>
                      <span className="figure client-mono" style={{ display: 'block' }}>{m.renewBs}</span>
                      <span className="figure client-mono" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{m.renewAd}</span>
                    </td>

                    <td
                      className="figure client-mono"
                      style={{ ...td, color: m.daysLeft < 0 ? 'var(--danger-text)' : 'var(--text)', fontWeight: 600 }}
                    >
                      {m.daysLeft} days
                    </td>

                    {money && <td className="figure client-mono" style={td}>{formatMoney(m.feePaisa)}</td>}

                    {money && (
                      <td style={td}>
                        <span className="figure client-mono" style={{ display: 'block', color: 'var(--success-text)', fontWeight: 600 }}>
                          {formatMoney(m.savingsPaisa)}
                        </span>
                        <span className="figure client-mono" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                          ({m.savingsNote})
                        </span>
                      </td>
                    )}

                    {money && (
                      <td className="figure client-mono" style={{ ...td, fontWeight: 600 }}>
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
                        <span className="figure client-mono" style={{ display: 'block', fontWeight: 600 }}>
                          {formatMoney(m.creditPaisa)}
                        </span>
                        {m.creditDefaultPaisa !== undefined && (
                          <span
                            className="figure client-mono"
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

                    <td style={{ ...td, width: 44, textAlign: 'right' }}>
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
                          minWidth: 44,
                          minHeight: 44,
                          borderRadius: 'var(--r-xs)',
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
        </DataTableShell>

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
          <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {LEGEND.map((l) => (
              <span key={l.text} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Icon name="dot" size={9} style={{ color: BRAND[l.tone] }} />
                {l.text}
              </span>
            ))}
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

      {/* No `extra` any more. It carried "Discount stacking is capped at 25%",
          a cap D3 rescinded (see STACK_NOTE in data/membership.ts, which is
          rendered above this in BOTH the embedded and standalone views). The
          surviving rule is stated there once; repeating a shortened version in
          a footer strip is how the two got to disagree in the first place. */}
      {!embedded && <FooterNote />}
    </div>
  )
}
