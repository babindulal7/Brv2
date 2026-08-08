import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { PageHeader, Button, FooterNote, KpiStrip } from '../../components/ui/Page'
import MovementList from './MovementList'
import AlertsPanel from './AlertsPanel'
import TimelinePanel from './TimelinePanel'
import CalendarPanel from './CalendarPanel'
import {
  PICKUPS,
  RETURNS,
  TODAY_DATE,
  MORE_FILTERS,
  UNSUPPORTED_FILTERS,
  SEEDED_PERIODS,
  filterMovements,
  mergeByTime,
  PICKUP_PENDING,
  RETURN_OVERDUE,
  CAL_TODAY_ISO,
  dashboardKpis,
} from '../../data/today'
import { useCanViewMoney } from '../../lib/moneyVisibility'

/**
 * §3 Nepal Mode date pill — BS leads at field size, AD one step smaller
 * beneath. This is the anchor the mini-calendar derives its BS days from, so
 * the two can never disagree.
 */
function DatePill() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      /* The render draws a chevron here. It opens the full Calendar at this
         date — a real destination — rather than a picker this page has nothing
         to do with: the period chips already scope the panels. */
      onClick={() => navigate(`/calendar?d=${CAL_TODAY_ISO}`)}
      aria-label="Open the Calendar at today's date"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 36,
        padding: '0 11px',
        borderRadius: 'var(--r-btn)',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <Icon name="calendar" size={15} style={{ color: 'var(--muted)' }} />
      <span style={{ textAlign: 'left', lineHeight: 1.25 }}>
        <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
          {TODAY_DATE.bs}
        </span>
        <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{TODAY_DATE.ad}</span>
      </span>
      <Icon name="chevron_down" size={14} style={{ color: 'var(--muted)' }} />
    </button>
  )
}

/**
 * §11 — everything that is not a period chip lives behind **one** entry point.
 *
 * The period chips themselves moved into the calendar card's header, where the
 * Dashboard render draws them. They still scope every panel, because every
 * panel reads the one movements query (§4) — so this button sits beside the
 * date pill rather than on a filter strip the render does not have.
 */
function MoreFilters({
  picked,
  setPicked,
}: {
  picked: string[]
  setPicked: (fn: (p: string[]) => string[]) => void
}) {
  const [more, setMore] = useState(false)

  const toggle = (o: string) => setPicked((p) => (p.includes(o) ? p.filter((x) => x !== o) : [...p, o]))

  return (
    <div style={{ position: 'relative' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        {picked.length > 0 && (
          <button
            type="button"
            onClick={() => setPicked(() => [])}
            style={{ border: 'none', background: 'transparent', color: 'var(--link)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Clear {picked.length}
          </button>
        )}
        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 36,
            padding: '0 11px',
            borderRadius: 'var(--r-btn)',
            border: '1px solid var(--border)',
            background: more ? 'var(--nav-active-bg)' : 'var(--card)',
            color: more ? 'var(--nav-active-accent)' : 'var(--text2)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Icon name="settings" size={13} />
          More Filters
          {picked.length > 0 && (
            <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--nav-active-accent)' }}>
              {picked.length}
            </span>
          )}
        </button>
      </span>

      {more && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 35,
            /* The button is no longer a full-width bar, so the panel sizes to
               the viewport instead of to its trigger. */
            width: 'min(760px, calc(100vw - 340px))',
            padding: 14,
            borderRadius: 'var(--r-card)',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-modal)',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
            gap: 14,
          }}
        >
          {MORE_FILTERS.map((g) => (
            <div key={g.group} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
                {g.group}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {g.options.map((o) => {
                  const on = picked.includes(o)
                  // A chip that cannot filter says so, rather than looking live
                  // and returning everything.
                  const dead = UNSUPPORTED_FILTERS.has(o)
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => !dead && toggle(o)}
                      aria-pressed={on}
                      aria-disabled={dead ? true : undefined}
                      title={dead ? 'Not on the movements query yet' : undefined}
                      style={{
                        height: 24,
                        padding: '0 8px',
                        borderRadius: 6,
                        border: `1px solid ${on ? 'transparent' : 'var(--border)'}`,
                        background: on ? 'var(--st-primary-bg)' : 'transparent',
                        color: dead ? 'var(--muted)' : on ? 'var(--st-primary-fg)' : 'var(--text2)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: on ? 600 : 500,
                        cursor: dead ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {o}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {/* §11 — the Status group's *values* were superseded, not the group.
              Dashboard.md lists six, three of which are not Foundation stages,
              so it is populated from the build-locked twelve. */}
          <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
            Status uses the twelve Foundation stages, not Dashboard.md §11’s six — three of those
            (“Booked”, “Packed”, “Returned”) are not workflow statuses. Dimmed chips are not on the
            movements query yet and are inert rather than silently ignored.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Today Operations — the landing page.
 *
 * Layout is the Dashboard render: KPI cards → three columns (Pickups · Returns
 * · Alerts) → Timeline beside the calendar card. §5.7's throughput strip is not
 * in the render and is not drawn here; `THROUGHPUT` in `data/today` is
 * currently unrendered because of it.
 *
 * §4 Single Source Rule: every panel here reads one movements query. The seed
 * array stands in for it until the engines exist (PLAN.md Phase 1–3), so the
 * page keeps its shape when the query lands — no panel fetches for itself, and
 * every count on this page is derived from that one array.
 *
 * §2 also asks for no scrolling on desktop. That cannot hold alongside §6's
 * "minimum 6 rows visible per column" at 1920×1080 — six rows plus the KPI
 * band, the throughput strip and the timeline row exceed the viewport. The
 * 6-row minimum is the checkable rule of the two, so it wins; the rows were
 * compacted to keep the overflow to roughly one screen edge rather than three.
 */
export default function Today() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState('Today')
  const [picked, setPicked] = useState<string[]>([])

  /*
   * Foundation §8.3 — the one question this page asks about the signed-in
   * session. It decides which KPI cards exist at all, which alerts are in the
   * list, and which facts the hover card carries. Nothing is masked anywhere
   * below: `money === false` means the markup was never built.
   */
  const money = useCanViewMoney()

  // §11 + §4 — the chips scope every panel, because every panel reads one query.
  const pickups = filterMovements(PICKUPS, period, picked)
  const returns = filterMovements(RETURNS, period, picked)
  const day = mergeByTime(pickups, returns)
  const seeded = SEEDED_PERIODS.includes(period)
  const emptyNote = seeded
    ? 'No movements match these filters.'
    : `Nothing seeded for “${period}”. The movements query lands in Phase 3; until then only Today and All carry data.`

  /*
   * The render titles the columns "Pickups Today" / "Returns Today". That is
   * only true while the period *is* Today — with the chips now inside the
   * calendar card, a heading that keeps saying "Today" over next month's rows
   * is the one way this layout could mislead. The default reads exactly as the
   * render does.
   */
  const on = (noun: string) => (period === 'Today' ? `${noun} Today` : `${noun} · ${period}`)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {/* §3 — the title is "Today". No number prefix, in the page or the sidebar. */}
      <PageHeader
        title="Today"
        description="Overview of today's activities"
        actions={
          <>
            <DatePill />
            <MoreFilters picked={picked} setPicked={setPicked} />
            <Button icon="plus" variant="primary" onClick={() => navigate('/rentals/new')}>
              New Rental
            </Button>
          </>
        }
      />

      {/*
        The render's six cards: Active Rentals · Pickups · Returns · Revenue ·
        Utilization · Critical Alerts. A money-blind session gets four — the
        strip is built from `dashboardKpis(money)` and lays out however many
        cards that returns, so Revenue and Utilization leave no gap behind.
      */}
      <KpiStrip items={dashboardKpis(money)} />

      {/* §2 — "Three columns fill equal height." `stretch`, not `start`. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,0.85fr)',
          gap: 'var(--sp-md)',
          alignItems: 'stretch',
        }}
      >
        <MovementList
          title={on('Pickups')}
          badge={`${PICKUP_PENDING} Pending`}
          badgeStatus="primary"
          rows={pickups}
          moreNoun="pickups"
          viewAll="/operations"
          emptyNote={emptyNote}
        />
        <MovementList
          title={on('Returns')}
          badge={`${RETURN_OVERDUE} Overdue`}
          badgeStatus="danger"
          rows={returns}
          moreNoun="returns"
          viewAll="/operations"
          emptyNote={emptyNote}
        />
        <AlertsPanel />
      </div>

      {/* The render gives the calendar card the wider half of this row, because
          it carries the day list *and* the month. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.35fr)',
          gap: 'var(--sp-md)',
          alignItems: 'stretch',
        }}
      >
        <TimelinePanel
          title={period === 'Today' ? "Today's Timeline" : `Timeline · ${period}`}
          rows={day}
          emptyNote={emptyNote}
        />
        <CalendarPanel period={period} setPeriod={setPeriod} rows={day} emptyNote={emptyNote} />
      </div>

      <FooterNote />
    </div>
  )
}
