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
import { useDomainEvent } from '../../events/useDomainEvent'
import { EVENT_TYPES } from '../../events/eventBus'
import { useViewport } from '../../lib/device'
import { useToast } from '../../components/ui/Toast'

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
      onClick={() => navigate(`/calendar?d=${CAL_TODAY_ISO}`)}
      aria-label="Open the Calendar at today's date"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        height: 40,
        padding: '0 14px',
        borderRadius: 'var(--r-btn)',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.2s ease',
      }}
      className="lift"
    >
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          background: 'var(--st-primary-bg)',
          color: 'var(--st-primary-fg)',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name="calendar" size={14} />
      </div>
      <span style={{ textAlign: 'left', lineHeight: 1.25 }}>
        <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.01em' }}>
          {TODAY_DATE.bs}
        </span>
        <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 500 }}>{TODAY_DATE.ad}</span>
      </span>
      <Icon name="chevron_down" size={14} style={{ color: 'var(--muted)', marginLeft: 2 }} />
    </button>
  )
}

/**
 * §11 — everything that is not a period chip lives behind **one** entry point.
 */
function MoreFilters({
  picked,
  setPicked,
}: {
  picked: string[]
  setPicked: (fn: (p: string[]) => string[]) => void
}) {
  const [more, setMore] = useState(false)
  const { showSuccessToast } = useToast()

  const toggle = (o: string) => setPicked((p) => (p.includes(o) ? p.filter((x) => x !== o) : [...p, o]))

  return (
    <div style={{ position: 'relative' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {picked.length > 0 && (
          <button
            type="button"
            onClick={() => setPicked(() => [])}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--link)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: '4px 8px',
            }}
          >
            Clear ({picked.length})
          </button>
        )}
        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            height: 40,
            padding: '0 14px',
            borderRadius: 'var(--r-btn)',
            border: `1px solid ${more ? 'var(--nav-active-accent)' : 'var(--border)'}`,
            background: more ? 'var(--nav-active-bg)' : 'var(--card)',
            color: more ? 'var(--nav-active-accent)' : 'var(--text2)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.2s ease',
          }}
          className="lift"
        >
          <Icon name="settings" size={14} />
          More Filters
          {picked.length > 0 && (
            <span
              className="figure"
              style={{
                fontSize: 'var(--t-meta)',
                background: 'var(--st-primary-bg)',
                color: 'var(--st-primary-fg)',
                padding: '1px 6px',
                borderRadius: 999,
                fontWeight: 700,
              }}
            >
              {picked.length}
            </span>
          )}
        </button>
      </span>

      {more && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 45,
            width: 'min(760px, calc(100vw - 40px))',
            padding: 18,
            borderRadius: 'var(--r-card)',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-modal)',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
            gap: 16,
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          {MORE_FILTERS.map((g) => (
            <div key={g.group} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                {g.group}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {g.options.map((o) => {
                  const on = picked.includes(o)
                  const dead = UNSUPPORTED_FILTERS.has(o)
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => {
                        if (dead) {
                          showSuccessToast('Filter Pending', `"${o}" filter connects in Phase 3 backend migration.`)
                        } else {
                          toggle(o)
                        }
                      }}
                      aria-pressed={on}
                      aria-disabled={dead ? true : undefined}
                      title={dead ? 'Filter is pending backend query wiring' : undefined}
                      style={{
                        height: 26,
                        padding: '0 10px',
                        borderRadius: 'var(--r-xs)',
                        border: `1px solid ${on ? 'transparent' : 'var(--border)'}`,
                        background: on ? 'var(--st-primary-bg)' : 'var(--card2)',
                        color: dead ? 'var(--muted)' : on ? 'var(--st-primary-fg)' : 'var(--text2)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: on ? 600 : 500,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        opacity: dead ? 0.65 : 1,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {o}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <p style={{ gridColumn: '1 / -1', margin: 0, paddingTop: 6, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5, borderTop: '1px solid var(--border)' }}>
            Status uses the canonical Foundation stages. Dimmed chips indicate pending backend query hooks and display helpful notice on interaction.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Today Operations — the landing page.
 *
 * Owns the period and filter state for the whole page. The chips that set the
 * period render inside `CalendarPanel`, so the state lives here rather than
 * there: every panel reads the one filtered movement list.
 */
export default function Today() {
  const navigate = useNavigate()
  const viewport = useViewport()
  const [period, setPeriod] = useState('Today')
  const [picked, setPicked] = useState<string[]>([])

  /*
   * Log-only subscriptions. Every panel on this page renders the seeded
   * constants from `data/today`, so a completed pickup or return has nothing to
   * refetch; these handlers only trace that the event reached the page.
   */
  useDomainEvent(EVENT_TYPES.RENTAL_PICKED_UP, (payload) => {
    console.log('[EventBus Today] RENTAL_PICKED_UP:', payload)
  })

  useDomainEvent(EVENT_TYPES.RENTAL_RETURNED, (payload) => {
    console.log('[EventBus Today] RENTAL_RETURNED:', payload)
  })

  const money = useCanViewMoney()

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

      {/* §2 — "Three columns fill equal height." `stretch`, not `start`.
          Law 14 — width decides, never a platform check: desktop keeps the
          three-column ratio, tablet pairs Pickups/Returns and wraps Alerts
          to its own row, phone stacks all three single-file. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            viewport === 'desktop'
              ? 'minmax(0,1fr) minmax(0,1fr) minmax(0,0.85fr)'
              : viewport === 'tablet'
                ? 'repeat(2, minmax(0,1fr))'
                : '1fr',
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
          it carries the day list *and* the month. Law 14 — below desktop the
          two panels stack single-file rather than crushing the calendar's day
          list and month side by side into a narrower track. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: viewport === 'desktop' ? 'minmax(0,1fr) minmax(0,1.35fr)' : '1fr',
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
