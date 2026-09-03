import { useCallback, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { PageHeader, Button, FooterNote, KpiStrip, Rail, Card, type Kpi } from '../../components/ui/Page'
import MovementList from './MovementList'
import TimelinePanel from './TimelinePanel'
import {
  TODAY_DATE,
  MORE_FILTERS,
  FILTER_SUPPORT,
  LIST_STAGES,
  mergeByTime,
  CAL_TODAY_ISO,
  NOW_AD,
  ACTIVE_RENTALS_FILTERS,
  pickupsQuery,
  returnsQuery,
  toMovementRow,
  type LivePeriod,
  type MovementRow,
} from '../../data/today'
import { BS_UNSUPPORTED_NOTE } from '../../lib/bs'
import { listBookings, overdue } from '../../lib/queries/bookings'
import type { ListFilters } from '../../lib/queries/listQuery'
import { useList, type ListQueryResult, type ListResult } from '../../lib/queries/useList'
import { useDomainEvent } from '../../events/useDomainEvent'
import { EVENT_TYPES } from '../../events/eventBus'
import { useViewport } from '../../lib/device'
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
        {/* BS leads and AD sits beneath (Law 9) — but only while the Date
            Engine can name the BS day. Outside its table `TODAY_DATE.bs` is
            null and the English date takes the lead line alone, because the
            alternative shipped an em dash in the bold slot above the date the
            app actually knew. `title` names the gap rather than leaving a
            silently one-line pill. */}
        <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.01em' }}>
          {TODAY_DATE.bs ?? TODAY_DATE.ad}
        </span>
        {TODAY_DATE.bs ? (
          <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 500 }}>{TODAY_DATE.ad}</span>
        ) : (
          <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 500 }} title={BS_UNSUPPORTED_NOTE}>
            Nepali date unavailable
          </span>
        )}
      </span>
    </button>
  )
}

/* ── the period control ────────────────────────────────────────────────── */

/**
 * Spec 02 §2.1 — the header carries `[Today▾][Tomorrow]`, and it governs every
 * panel on the page because every panel reads the one movements query (§4).
 *
 * TODO(decision) — PLAN.md §4: which periods does Today offer? Spec 02 line 3
 * says "Today's jobs only. All other days live in Operation", while its own
 * desktop header draws [Today▾][Tomorrow] and its tablet header draws [Today▾].
 * `data/today.ts`'s `PERIOD_CHIPS` still ships seven — All · Today · Tomorrow ·
 * Next 7 Days · This Week · Next Month · Custom — and six of them are real
 * server-side ranges. Today and Tomorrow are built because the header draws
 * both; the other five are left untouched in the data and are NOT offered from
 * this screen, because shipping all seven is the one reading no side of the
 * spec supports (spec 03 already gives Operation its own Custom ▾). If "today's
 * jobs only" is meant literally, Tomorrow goes too and spec 02 line 37 is the
 * error — that is the ruling this TODO is waiting on.
 *
 * The `▾` the wireframe draws is not rendered: it has no menu behind it, and a
 * disclosure caret over nothing is the same defect as a filter chip that
 * silently no-ops.
 */
const OFFERED_PERIODS = ['Today', 'Tomorrow'] as const satisfies readonly LivePeriod[]

function PeriodControl({ period, setPeriod }: { period: LivePeriod; setPeriod: (p: LivePeriod) => void }) {
  return (
    <div
      role="group"
      aria-label="Which day's jobs to show"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: 3,
        borderRadius: 'var(--r-btn)',
        background: 'var(--card2)',
        border: '1px solid var(--border)',
      }}
    >
      {OFFERED_PERIODS.map((p) => {
        const on = period === p
        return (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            aria-pressed={on}
            style={{
              height: 34,
              padding: '0 14px',
              borderRadius: 'var(--r-xs)',
              border: '1px solid transparent',
              background: on ? 'var(--st-primary-bg)' : 'transparent',
              color: on ? 'var(--st-primary-fg)' : 'var(--text2)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {p}
          </button>
        )
      })}
    </div>
  )
}

/**
 * §11 — everything that is not a period chip lives behind **one** entry point.
 *
 * ## The 31 options, and which of them are real
 *
 * ⛔ Every option used to be a client-side predicate over a fetched array, and
 * 21 of the 31 fired a `showSuccessToast('Filter Pending', …)` — a *success*
 * toast for something that did not happen, on a chip that stayed clickable.
 *
 * Now: an option that maps to `bookings.stage` toggles and reaches Postgres
 * inside `chips.stage`. Every other option is a genuinely `disabled` control
 * carrying, in its tooltip and its accessible name, the exact column or join it
 * would need. `data/today.ts`'s `FILTER_SUPPORT` is where those sentences live,
 * one per option — nothing here decides availability, it only renders it.
 */
function MoreFilters({
  list,
  picked,
  setPicked,
}: {
  list: 'Outgoing' | 'Incoming'
  picked: string[]
  setPicked: (fn: (p: string[]) => string[]) => void
}) {
  const [more, setMore] = useState(false)

  const toggle = (o: string) => setPicked((p) => (p.includes(o) ? p.filter((x) => x !== o) : [...p, o]))

  return (
    /* Full-width so the panel below can anchor to the LIST COLUMN's edges, not
       the trigger's. Anchored to the trigger (`right: 0` + a 760px sheet) the
       Outgoing column's panel ran off the left viewport edge — its right edge
       sits mid-page, and 760px of sheet has nowhere to go but off-screen. */
    <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {picked.length > 0 && (
          <button
            type="button"
            aria-label={`Clear ${list.toLowerCase()} list filters (${picked.length})`}
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
          aria-label={`More filters for the ${list.toLowerCase()} list`}
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
                // A real numeric count badge — the one case §3.3 allows 999
                // for. Spelled as the token so it cannot drift from the rule.
                borderRadius: 'var(--r-badge)',
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
            left: 0,
            right: 0,
            zIndex: 45,
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
              {/* Law 14 / v4.1 §7.3 — the rows sit 20px apart while the columns
                  stay at 6, and that asymmetry is the tap areas talking, not the
                  layout. Each live chip below is painted 26px but hit at 44, so
                  its target reaches 9px past its own top and bottom edge; at the
                  old symmetric 6px gap a group that wrapped — and every group
                  here wraps once this panel is on a laptop, let alone a phone —
                  had its second line's targets 12px inside its first line's,
                  where the later chip in the DOM silently wins the click. 20 is
                  the first step on the 4px grid that clears the 18px the two
                  overhangs need. Sideways nothing grows: every label but `VIP`
                  is already wider than 44 and `VIP` lands on it. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 6, rowGap: 20 }}>
                {g.options.map((o) => {
                  const support = FILTER_SUPPORT[o]
                  /*
                   * A stage chip is live ONLY where its stage intersects this
                   * list's structural set (`LIST_STAGES` — read off the named
                   * queries, so it cannot drift). `narrowStages` intersects,
                   * never replaces, so picking `Quote` over a list that MEANS
                   * Booked-or-Packed can only ever render the empty state — a
                   * chip like that is not a filter, it is a clear-screen button
                   * wearing a filter's face. It joins the disabled chips and
                   * says why, in the same sentence shape they use.
                   */
                  const reachable = LIST_STAGES[list]
                  const reason =
                    support?.kind === 'stage'
                      ? reachable.includes(support.stage)
                        ? null
                        : `The ${list} list means stage ${reachable.join(' or ')} — ${
                            support.stage === o ? o : `${o} (stage ${support.stage})`
                          } never intersects it, so picking it could only empty the list.`
                      : (support?.reason ?? 'No column behind this filter.')
                  const on = picked.includes(o)

                  /* The 26px paint stays and `.tap` (theme.css) carries the 44px
                     target under it — §5's dense-strip trade, taken here because
                     this panel is a floating popover with no max-height and no
                     scroller of its own: growing five groups of chips to a real
                     44 adds the better part of 200px to a sheet that already has
                     to fit under its trigger on a phone. Only the live chips get
                     the class; a `disabled` button fires no pointer events, so a
                     target around one would be a hit area over nothing. */
                  const style = {
                    height: 26,
                    padding: '0 10px',
                    borderRadius: 'var(--r-xs)',
                    border: `1px solid ${on ? 'transparent' : 'var(--border)'}`,
                    background: on ? 'var(--st-primary-bg)' : 'var(--card2)',
                    color: reason ? 'var(--muted)' : on ? 'var(--st-primary-fg)' : 'var(--text2)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: on ? 600 : 500,
                    cursor: reason ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    opacity: reason ? 0.65 : 1,
                    transition: 'all 0.15s ease',
                  }

                  // A `disabled` button fires no pointer events, so the tooltip
                  // goes on the wrapper. By relying on the wrapper's title, we avoid 
                  // duplicate screen reader announcements that happen when both title 
                  // and aria-label are present.
                  return reason ? (
                    <span key={o} title={`${o} — unavailable. ${reason}`} style={{ display: 'inline-flex' }}>
                      <button type="button" disabled style={style}>
                        {o}
                      </button>
                    </span>
                  ) : (
                    <button key={o} type="button" className="tap" onClick={() => toggle(o)} aria-pressed={on} style={style}>
                      {o}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <p style={{ gridColumn: '1 / -1', margin: 0, paddingTop: 6, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5, borderTop: '1px solid var(--border)' }}>
            Status uses the canonical Foundation stages and filters in the database. A dimmed chip is unavailable, not
            pending — hover it for the reason: the column or join it would need, or the stage this list can never show.
          </p>
        </div>
      )}
    </div>
  )
}

/* ── the phone segmented control ───────────────────────────────────────── */

/**
 * Phone layout — `[Out][In]`, one list at a time. Was `[Out][In][Alerts]`
 * until 30 Aug, when the Alerts panel moved to /operations with the rest of
 * the floor's exceptions.
 *
 * Law 14: this is a WIDTH decision (`useViewport()`), never a platform one.
 * Below 768 there is not room for two columns of card rows and a segmented
 * control is the locked alternative.
 */
const SEGMENTS = [
  { key: 'out', label: 'Out' },
  { key: 'in', label: 'In' },
] as const

type Segment = (typeof SEGMENTS)[number]['key']

function SegmentedControl({
  segment,
  setSegment,
  counts,
}: {
  segment: Segment
  setSegment: (s: Segment) => void
  counts: Record<Segment, string>
}) {
  return (
    <div
      role="group"
      aria-label="Which list to show"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${SEGMENTS.length}, minmax(0,1fr))`,
        gap: 3,
        padding: 3,
        borderRadius: 'var(--r-btn)',
        background: 'var(--card2)',
        border: '1px solid var(--border)',
      }}
    >
      {SEGMENTS.map((s) => {
        const on = segment === s.key
        return (
          <button
            key={s.key}
            type="button"
            aria-pressed={on}
            onClick={() => setSegment(s.key)}
            style={{
              /* Law 15 — 44px on the one layout that is only ever touched. */
              height: 44,
              borderRadius: 'var(--r-xs)',
              border: '1px solid transparent',
              background: on ? 'var(--st-primary-bg)' : 'transparent',
              color: on ? 'var(--st-primary-fg)' : 'var(--text2)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              minWidth: 0,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
            <span className="figure" style={{ fontWeight: 700, opacity: 0.85 }}>
              {counts[s.key]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Completes the sentence in an unfiltered empty state — "No pickups today".
 *
 * A `Record` rather than a template, so a new chip cannot be added without a
 * phrase for it.
 */
const PERIOD_PHRASE: Record<LivePeriod, string> = {
  All: 'at all',
  Today: 'today',
  Tomorrow: 'tomorrow',
  'Next 7 Days': 'in the next 7 days',
  'This Week': 'this week',
  'Next Month': 'next month',
}

/**
 * A figure, or an explicit non-value while it is unknown.
 *
 * A KPI reading `0` during the first load, or after the query failed, is a
 * wrong figure rather than a missing one — and "0 pickups today" is a sentence
 * the floor would act on.
 */
function countOf(list: { loading: boolean; error: string | null }, value: number | null): string {
  return list.loading || list.error !== null || value === null ? '—' : String(value)
}

/**
 * ⚠ **Never a plausible default and never a zero.**
 *
 * WIREFRAME_RULINGS_2026-08-12.md §8: "A number with no real source renders
 * 'not tracked yet'." Spec 02 draws a `Cash due` KPI and this repo has no
 * derivation for it anywhere — see the TODO(decision) at the call site.
 */
const NOT_TRACKED = 'Not tracked yet'

/**
 * Today Operations — the landing page.
 *
 * Owns the period and filter state for the whole page, and runs every query
 * this screen makes. §4's Single Source Rule is that all four panels read the
 * SAME rows, and the only way to guarantee that is for one component to fetch
 * them.
 *
 * ## The five queries, and why each one exists
 *
 * | Query | Feeds |
 * |---|---|
 * | `pickupsQuery(period, pickedOut)` | Outgoing list · Timeline · Outgoing KPI |
 * | `returnsQuery(period, pickedIn)` | Incoming list · Timeline · Incoming KPI |
 * | `overdue(NOW_AD)` | Overdue KPI |
 * | `ACTIVE_RENTALS_FILTERS` | Active Rentals KPI (count only — one row fetched) |
 *
 * Every one is `listBookings`, Law 2's one booking query. There is no second
 * opinion about what a booking is anywhere on this page.
 *
 * ## The arrangement, and the three layouts
 *
 * Spec 02 §2.1 draws KPI strip → OUTGOING and INCOMING in time order on the
 * left → ALERTS and a CALENDAR mini on the right rail.
 *
 *  - **Desktop/tablet ≥768** — the two lists side by side; the Timeline
 *    full-width beneath. The old lower rail (Alerts · mini Calendar) was
 *    removed 30 Aug: Alerts lives on /operations now, and the mini Calendar is
 *    gone — the date pill already opens /calendar at today.
 *  - **Phone <768** — the `[Out][In]` segmented control shows one of the two
 *    lists at a time, as card rows.
 */
export default function Today() {
  const navigate = useNavigate()
  const viewport = useViewport()
  const money = useCanViewMoney()
  const [period, setPeriod] = useState<LivePeriod>('Today')
  /*
   * Per-list filters (30 Aug, Booqable-shape rework): Outgoing and Incoming
   * each own their picked set, so narrowing pickups can no longer silently
   * narrow returns. The period stays PAGE-level — it governs the Timeline's
   * merged rows, and two lists on two different days merged into one timeline
   * would be a lie with a heading.
   */
  const [pickedOut, setPickedOut] = useState<string[]>([])
  const [pickedIn, setPickedIn] = useState<string[]>([])
  const [segment, setSegment] = useState<Segment>('out')
  const [allKpis, setAllKpis] = useState(false)

  const pickupSet = pickupsQuery(period, pickedOut)
  const returnSet = returnsQuery(period, pickedIn)

  /*
   * Did the OPERATOR narrow this? `useList`'s heuristic cannot answer it here:
   * every named set in `bookings.ts` carries `presence: { cancelled_at: false }`
   * and a `chips.stage`, which are what "Today ▸ Outgoing" MEANS rather than
   * anything anyone clicked, so the heuristic answers true unconditionally.
   *
   * This is the same boolean that decides whether the empty state's "Clear
   * filters" button is worth offering — and `clearOut`/`clearIn` below are what
   * it clears, which is why the period counts: a page sitting on "Tomorrow" with
   * nothing scheduled needs the way back, not an "add one" prompt.
   */
  const outFiltered = pickedOut.length > 0 || period !== 'Today'
  const inFiltered = pickedIn.length > 0 || period !== 'Today'

  /* Each list's "Clear filters" clears ITS chips; the period resets with either
     because a page sitting on "Tomorrow" with nothing scheduled needs the way
     back, not an "add one" prompt. */
  const clearOut = useCallback(() => {
    setPickedOut([])
    setPeriod('Today')
  }, [])
  const clearIn = useCallback(() => {
    setPickedIn([])
    setPeriod('Today')
  }, [])
  /* The Timeline merges BOTH lists, so its clear clears both sets. */
  const clearBoth = useCallback(() => {
    setPickedOut([])
    setPickedIn([])
    setPeriod('Today')
  }, [])

  /*
   * ⚠ `impossible` is why these two wrap `listBookings` instead of being it.
   *
   * When the operator's Status chips do not intersect the column's own stages
   * (picking "Quote" over an Outgoing list that means Booked-or-Packed), the
   * honest answer is no rows. `applyListFilters` cannot express that — an empty
   * chip array is "no constraint", so sending it would return EVERY stage — so
   * the filter set is not sent at all and the empty state renders instead.
   *
   * `useList` holds the fetcher in a ref and re-reads it on every render, so the
   * flag is never stale: the chip change that sets it also changes the filter
   * key, which is what triggers the fetch.
   */
  const fetchPickups = useCallback(
    async (filters: ListFilters): Promise<ListQueryResult<MovementRow>> => {
      if (pickupSet.impossible) return { rows: [], total: 0 }
      const res = await listBookings(filters)
      return { rows: res.rows.map((r) => toMovementRow(r, 'outgoing', NOW_AD)), total: res.total ?? null }
    },
    [pickupSet.impossible],
  )

  const fetchReturns = useCallback(
    async (filters: ListFilters): Promise<ListQueryResult<MovementRow>> => {
      if (returnSet.impossible) return { rows: [], total: 0 }
      const res = await listBookings(filters)
      return { rows: res.rows.map((r) => toMovementRow(r, 'incoming', NOW_AD)), total: res.total ?? null }
    },
    [returnSet.impossible],
  )

  const pickups: ListResult<MovementRow> = useList(fetchPickups, pickupSet.filters, { isFilteredOverride: outFiltered })
  const returns: ListResult<MovementRow> = useList(fetchReturns, returnSet.filters, { isFilteredOverride: inFiltered })

  /* The Overdue KPI's query. The Alerts panel itself moved to /operations
     (30 Aug) and fetches there; this page keeps only the count it renders. */
  const alerts = useList(listBookings, overdue(NOW_AD), { isFilteredOverride: false })

  /*
   * Count only. One row is fetched purely because PostgREST needs a range to
   * return an exact count against; `total` is the figure, `rows` is discarded.
   */
  const fetchActive = useCallback(
    (filters: ListFilters) => listBookings({ ...filters, withCount: true, page: { index: 0, size: 1 } }),
    [],
  )
  const active = useList(fetchActive, ACTIVE_RENTALS_FILTERS, { isFilteredOverride: false })

  /*
   * ⚠ Every query this screen runs. It is also the `onRetry` the Timeline and
   * Calendar panels are given, and a Retry that refreshes four of five panels
   * leaves the fifth quoting a count from before the failure.
   */
  /* `useList` memoises `refetch`; naming them keeps the callback keyed on
     the functions rather than on the whole list objects, which are fresh
     literals every render (react-hooks/exhaustive-deps, TODO_SWEEP A13). */
  const { refetch: refetchPickups } = pickups
  const { refetch: refetchReturns } = returns
  const { refetch: refetchAlerts } = alerts
  const { refetch: refetchActive } = active
  const refetchAll = useCallback(() => {
    refetchPickups()
    refetchReturns()
    refetchAlerts()
    refetchActive()
  }, [refetchPickups, refetchReturns, refetchAlerts, refetchActive])

  useDomainEvent(EVENT_TYPES.RENTAL_PICKED_UP, refetchAll)
  useDomainEvent(EVENT_TYPES.RENTAL_RETURNED, refetchAll)

  /*
   * §4 — the Timeline and the Calendar day list are VIEWS of the two lists'
   * rows, merged chronologically. Never a third fetch, so a booking cannot
   * carry one time in a list and another on the rail.
   */
  const day = useMemo(() => mergeByTime(pickups.rows, returns.rows), [pickups.rows, returns.rows])
  const dayError = pickups.error ?? returns.error
  const dayLoading = pickups.loading || returns.loading

  /*
   * ⛔ The two badges used to read module constants over the UNFILTERED seed.
   * Filter to one row and the header still said "8 Pending". Both are now
   * counted off the rows the list is showing.
   */
  const overdueReturns = returns.rows.filter((r) => r.flags.includes('Overdue')).length

  /*
   * §5.8 — "card counts must equal the counts shown on the panels below." Each
   * card reads the same `useList` result the panel under it reads, so the two
   * cannot drift; there is no separate KPI query to disagree.
   *
   * ## Four cards, or six?
   *
   * TODO(decision) — PLAN.md §4: how many KPI cards may Today carry? PLAN.md
   * §4.0 (line 454) declares the "4-KPI cap" **superseded**, while Phase 6
   * (line 338) still lists "Today ships a 6-KPI strip against a ≤4 cap" as a
   * live violation, and `data/today.ts`:186-200 carries a ruling marked SETTLED
   * 6 Aug 2026 for six cards. An implementer can cite either source and be
   * right. Until one wins: spec 02's four render first, and the two of the six
   * that still have a real query behind them — Active Rentals and Alerts — stay
   * reachable behind the disclosure below rather than being deleted by either
   * reading. Revenue and Utilization are not resurrected here; no query in
   * `lib/queries/` produces either, and both already live in Reports ▸ Pulse,
   * which is where `data/today.ts`'s two seeded constants still go.
   */
  const specKpis: Kpi[] = useMemo(() => [
    {
      label: period === 'Today' ? 'Outgoing today' : `Outgoing · ${period}`,
      value: countOf(pickups, pickups.rows.length),
      icon: 'truck',
      accent: 'primary',
      note: 'Booked and Packed',
    },
    {
      label: period === 'Today' ? 'Incoming today' : `Incoming · ${period}`,
      value: countOf(returns, returns.rows.length),
      icon: 'return_arrow',
      accent: 'progress',
      // Scoped to the period on screen, and says so — the card beside it counts
      // every overdue booking on any day, and two bare "overdue" figures side
      // by side that legitimately differ is how a screen loses an operator's
      // trust in both.
      note: `${countOf(returns, overdueReturns)} overdue in this period`,
    },
    {
      label: 'Overdue',
      value: countOf(alerts, alerts.rows.length),
      icon: 'alert_triangle',
      accent: 'danger',
      note: 'Any day · due back, still out',
    },
    /*
     * §2.1 Notes — "KPI strip hides money entirely for floor roles — omitted,
     * not blanked." Law 6, and `moneyVisibility.ts`'s own instruction: call
     * sites must OMIT the card, never mask it. A money-blind session gets a
     * three-card strip; there is no fourth card in its DOM to inspect, and the
     * strip does not leave a hole where one was.
     *
     * TODO(decision) — PLAN.md §4: what derives "Cash due"? Spec 02 draws it as
     * the fourth KPI and nothing in this repo computes it. `payments`
     * (0006:176) is not joined by `listBookings`, `bookings.deposit_required`
     * is the figure REQUIRED rather than the figure owed, and a paid-vs-due
     * total is the Financial Engine's to compute, never a page's. Per rulings
     * §8 it renders "Not tracked yet" and does NOT borrow
     * `REVENUE_TODAY_PAISA`, which is a seeded Pulse constant for a different
     * quantity entirely.
     */
    ...(money
      ? ([
          {
            label: 'Cash due',
            value: NOT_TRACKED,
            icon: 'dollar',
            accent: 'neutral',
            note: 'No derivation exists in this build',
          },
        ] satisfies Kpi[])
      : []),
  ], [period, pickups, returns, alerts, money, overdueReturns])

  const reachableKpis: Kpi[] = useMemo(() => [
    {
      label: 'Active Rentals',
      value: countOf(active, active.total),
      icon: 'briefcase',
      accent: 'primary',
      note: 'On Rent now',
    },
  ], [active])

  /*
   * The lists title themselves "Outgoing today" / "Incoming today". That is only
   * true while the period *is* Today — a heading that keeps saying "today" over
   * tomorrow's rows is the one way this layout could mislead.
   */
  const on = (noun: string) => (period === 'Today' ? `${noun} Today` : `${noun} · ${period}`)
  const phrase = PERIOD_PHRASE[period]

  const outgoing = (
    <MovementList
      title={on('Outgoing')}
      badge={`${countOf(pickups, pickups.rows.length)} Pending`}
      badgeStatus="primary"
      list={pickups}
      side="outgoing"
      noun="pickups"
      periodLabel={phrase}
      viewAll="/operations"
      onClearFilters={clearOut}
      filteredByChips={pickedOut.length > 0}
    />
  )

  const incoming = (
    <MovementList
      title={on('Incoming')}
      badge={`${countOf(returns, overdueReturns)} Overdue`}
      badgeStatus="danger"
      list={returns}
      side="incoming"
      noun="returns"
      periodLabel={phrase}
      viewAll="/operations"
      onClearFilters={clearIn}
      filteredByChips={pickedIn.length > 0}
    />
  )

  /*
   * Drawn in no spec-02 wireframe and kept deliberately.
   * WIREFRAME_RULINGS_2026-08-12.md §1: "a panel survives unless a spec removes
   * it in prose", and the register names this one — "Today's `TimelinePanel` …
   * is drawn in no wireframe. Leave it; raise separately. `Dashboard.md` §9
   * still asks for it." It sits full-width beneath the arrangement rather than
   * inside either track, so the wireframe's four regions read as drawn.
   */
  const timeline = (
    <TimelinePanel
      title={period === 'Today' ? "Today's Timeline" : `Timeline · ${period}`}
      rows={day}
      loading={dayLoading}
      error={dayError}
      isFiltered={outFiltered || inFiltered}
      filteredByChips={pickedOut.length > 0 || pickedIn.length > 0}
      onRetry={refetchAll}
      onClearFilters={clearBoth}
      periodLabel={phrase}
    />
  )

  const stack = { display: 'flex', flexDirection: 'column' as const, gap: 'var(--sp-md)', minWidth: 0 }

  /*
   * The right quick panel (30 Aug, Booqable-shape rework) — `Rail`, so it
   * collapses to a 44px handle and remembers the choice per route.
   *
   * Quick Actions are LINKS to the four verbs an operator reaches for from
   * here; nothing on this panel computes. Record Payment is money-gated the
   * §2.1 way — OMITTED for a money-blind session, never blanked (Law 6).
   *
   * Quick Info re-reads the SAME query results the KPI strip reads (`active`,
   * `alerts`), so the two surfaces cannot quote different figures (§5.8).
   */
  const quickPanel = (
    <div style={stack}>
      <Card title="Quick Actions">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          <Button icon="plus" variant="primary" onClick={() => navigate('/rentals/new')}>
            New Rental
          </Button>
          {money && (
            <Button icon="dollar" onClick={() => navigate('/finance/payments')}>
              Record Payment
            </Button>
          )}
          <Button icon="queues" onClick={() => navigate('/operations')}>
            Open Operation
          </Button>
          <Button icon="calendar" onClick={() => navigate(`/calendar?d=${CAL_TODAY_ISO}`)}>
            Open Calendar
          </Button>
        </div>
      </Card>
      <Card title="Quick Info">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text2)' }}>
            <span>Active rentals</span>
            <span className="figure" style={{ fontWeight: 700, color: 'var(--text)' }}>{countOf(active, active.total)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text2)' }}>
            <span>Overdue</span>
            {/* --danger-text, not --st-danger-fg: the fg half of a status pair
                is white ink for a SOLID red fill, so bare on this card it was
                white-on-white and the figure disappeared under the light
                default. The Active rentals figure above is the pattern. */}
            <span className="figure" style={{ fontWeight: 700, color: 'var(--danger-text)' }}>{countOf(alerts, alerts.rows.length)}</span>
          </div>
        </div>
      </Card>
    </div>
  )

  /* One per-list filter row — the SAME `MoreFilters` control, now owned by a
     single list instead of the page. Right-aligned above its list. `list`
     names the owner two ways: it keys the row, so on the phone the panel
     REMOUNTS (closed) when the segment flips instead of silently rebinding an
     open panel to the other list's chips; and it reaches the buttons'
     accessible names, because two bare "More Filters" buttons on one page
     give a screen-reader user no way to say which list they are narrowing. */
  const filterRow = (list: 'Outgoing' | 'Incoming', picked: string[], setPicked: (fn: (p: string[]) => string[]) => void) => (
    <div key={list} style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <MoreFilters list={list} picked={picked} setPicked={setPicked} />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {/* §3 — the title is "Today". No number prefix, in the page or the sidebar.
          Breadcrumbs live in the shell; rulings §4 — no Back button here. */}
      <PageHeader
        title="Dashboard"
        description="Today's jobs at a glance. Alerts and every other day live in Operation."
        actions={
          <>
            <DatePill />
            <PeriodControl period={period} setPeriod={setPeriod} />
            <Button icon="plus" variant="primary" onClick={() => navigate('/rentals/new')}>
              New Rental
            </Button>
          </>
        }
      />

      {/* `columns={4}` pins the spec's 4-up shape, so revealing the two
          reachable cards wraps them onto a second row instead of squeezing the
          strip to six across. `KpiStrip` clamps to 3 at tablet and 2 at phone;
          spec 02's tablet drawing asks for 4-up, and that clamp lives in
          `components/ui/Page.tsx`, which ~25 other call sites share. */}
      <KpiStrip items={allKpis ? [...specKpis, ...reachableKpis] : specKpis} columns={4} />
      <div style={{ display: 'flex', marginTop: 'calc(-1 * var(--sp-sm))' }}>
        <button
          type="button"
          onClick={() => setAllKpis((v) => !v)}
          aria-expanded={allKpis}
          style={{
            marginLeft: 'auto',
            border: 'none',
            background: 'transparent',
            color: 'var(--link)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            padding: '4px 2px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <Icon name={allKpis ? 'chevron_up' : 'chevron_down'} size={13} />
          {allKpis ? 'Fewer figures' : `${reachableKpis.length} more figure${reachableKpis.length === 1 ? '' : 's'}`}
        </button>
      </div>

      {/* Booqable-shape body (30 Aug): main column | quick panel. The quick
          panel is a `Rail`, so it collapses to a handle (default-collapsed at
          tablet width) and never squeezes the two lists. Phone gets no rail —
          the bottom bar already carries the same destinations. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: viewport === 'phone' ? '1fr' : 'minmax(0, 1fr) auto',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        <div style={stack}>
          {viewport !== 'phone' ? (
            /* Main 2-Column Grid — each column: its own filter row, then its list. */
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 'var(--sp-md)',
                alignItems: 'start',
              }}
            >
              <div style={stack}>
                {filterRow('Outgoing', pickedOut, setPickedOut)}
                {outgoing}
              </div>
              <div style={stack}>
                {filterRow('Incoming', pickedIn, setPickedIn)}
                {incoming}
              </div>
            </div>
          ) : (
            /* Phone (<768px) — segmented control; the filter row follows the
               segment, so the chips on screen always govern the list on screen. */
            <div style={stack}>
              <SegmentedControl
                segment={segment}
                setSegment={setSegment}
                counts={{
                  out: countOf(pickups, pickups.rows.length),
                  in: countOf(returns, returns.rows.length),
                }}
              />
              {segment === 'out' ? filterRow('Outgoing', pickedOut, setPickedOut) : filterRow('Incoming', pickedIn, setPickedIn)}
              {segment === 'out' ? outgoing : incoming}
            </div>
          )}

          {timeline}
        </div>

        {viewport !== 'phone' && (
          <Rail label="Quick actions" width={272}>
            {quickPanel}
          </Rail>
        )}
      </div>

      <FooterNote />
    </div>
  )
}
