import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { PageHeader, Button, FooterNote, KpiStrip, type Kpi } from '../../components/ui/Page'
import MovementList from './MovementList'
import AlertsPanel from './AlertsPanel'
import TimelinePanel from './TimelinePanel'
import CalendarPanel from './CalendarPanel'
import {
  TODAY_DATE,
  MORE_FILTERS,
  FILTER_SUPPORT,
  mergeByTime,
  CAL_TODAY_ISO,
  NOW_AD,
  ACTIVE_RENTALS_FILTERS,
  pickupsQuery,
  returnsQuery,
  toMovementRow,
  overdueAlert,
  quoteLapsedAlert,
  type LivePeriod,
  type MovementRow,
} from '../../data/today'
import { listBookings, overdue, quotesExpiring, type BookingListRow } from '../../lib/queries/bookings'
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
        <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.01em' }}>
          {TODAY_DATE.bs}
        </span>
        <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', fontWeight: 500 }}>{TODAY_DATE.ad}</span>
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
                  const support = FILTER_SUPPORT[o]
                  const reason = support?.kind === 'stage' ? null : (support?.reason ?? 'No column behind this filter.')
                  const on = picked.includes(o)

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
                  // goes on the wrapper. The reason is also in the accessible
                  // name, because a title attribute is not reachable by keyboard.
                  return reason ? (
                    <span key={o} title={reason} style={{ display: 'inline-flex' }}>
                      <button type="button" disabled aria-label={`${o} — unavailable. ${reason}`} style={style}>
                        {o}
                      </button>
                    </span>
                  ) : (
                    <button key={o} type="button" onClick={() => toggle(o)} aria-pressed={on} style={style}>
                      {o}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <p style={{ gridColumn: '1 / -1', margin: 0, paddingTop: 6, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5, borderTop: '1px solid var(--border)' }}>
            Status uses the canonical Foundation stages and filters in the database. A dimmed chip is unavailable, not
            pending — hover it for the column or join it would need.
          </p>
        </div>
      )}
    </div>
  )
}

/* ── the phone segmented control ───────────────────────────────────────── */

/**
 * Spec 02's phone layout — `[Out][In][Alerts]`, one panel at a time.
 *
 * Law 14: this is a WIDTH decision (`useViewport()`), never a platform one. The
 * same three panels sit side by side at desktop and stacked at tablet; below
 * 768 there is not room for three columns of card rows and a segmented control
 * is the locked alternative.
 */
const SEGMENTS = [
  { key: 'out', label: 'Out' },
  { key: 'in', label: 'In' },
  { key: 'alerts', label: 'Alerts' },
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
      role="tablist"
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
            role="tab"
            aria-selected={on}
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
 * | `pickupsQuery(period, picked)` | Outgoing list · Timeline · Calendar day list · Outgoing KPI |
 * | `returnsQuery(period, picked)` | Incoming list · Timeline · Calendar day list · Incoming KPI |
 * | `overdue(NOW_AD)` | Alerts (Critical) · Overdue KPI · the Incoming list's badge |
 * | `quotesExpiring(NOW_AD)` | Alerts (High) |
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
 *  - **Desktop ≥1180** — two tracks: the two lists stacked on the left, the two
 *    rail cards stacked on the right.
 *  - **Tablet 768–1179** — one track. The rail *reflows* beneath the lists; it
 *    is NOT hidden and is deliberately not wrapped in `CollapsibleAside`
 *    (rulings §7 — "collapse below 1180 means reflow, not hide", and other
 *    pages depend on that component's defaults).
 *  - **Phone <768** — the `[Out][In][Alerts]` segmented control shows one of
 *    the three at a time, as card rows.
 */
export default function Today() {
  const navigate = useNavigate()
  const viewport = useViewport()
  const money = useCanViewMoney()
  const [period, setPeriod] = useState<LivePeriod>('Today')
  const [picked, setPicked] = useState<string[]>([])
  const [segment, setSegment] = useState<Segment>('out')
  const [allKpis, setAllKpis] = useState(false)

  const pickupSet = pickupsQuery(period, picked)
  const returnSet = returnsQuery(period, picked)

  /*
   * Did the OPERATOR narrow this? `useList`'s heuristic cannot answer it here:
   * every named set in `bookings.ts` carries `presence: { cancelled_at: false }`
   * and a `chips.stage`, which are what "Today ▸ Outgoing" MEANS rather than
   * anything anyone clicked, so the heuristic answers true unconditionally.
   *
   * This is the same boolean that decides whether the empty state's "Clear
   * filters" button is worth offering — and `clearFilters` below is what it
   * clears, which is why the period counts: a page sitting on "Tomorrow" with
   * nothing scheduled needs the way back, not an "add one" prompt.
   */
  const isFiltered = picked.length > 0 || period !== 'Today'

  const clearFilters = useCallback(() => {
    setPicked([])
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

  const pickups: ListResult<MovementRow> = useList(fetchPickups, pickupSet.filters, { isFilteredOverride: isFiltered })
  const returns: ListResult<MovementRow> = useList(fetchReturns, returnSet.filters, { isFilteredOverride: isFiltered })

  /* The Alerts panel, the Overdue KPI and the Incoming badge, from one query. */
  const alerts = useList(listBookings, overdue(NOW_AD), { isFilteredOverride: false })
  const quotes = useList(listBookings, quotesExpiring(NOW_AD), { isFilteredOverride: false })

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
  const refetchAll = useCallback(() => {
    pickups.refetch()
    returns.refetch()
    alerts.refetch()
    quotes.refetch()
    active.refetch()
  }, [pickups.refetch, returns.refetch, alerts.refetch, quotes.refetch, active.refetch])

  useDomainEvent(EVENT_TYPES.RENTAL_PICKED_UP, refetchAll)
  useDomainEvent(EVENT_TYPES.RENTAL_RETURNED, refetchAll)

  /*
   * §4 — the Timeline and the Calendar day list are VIEWS of the two lists'
   * rows, merged chronologically. Never a third fetch, so a booking cannot
   * carry one time in a list and another on the rail.
   */
  const day = mergeByTime(pickups.rows, returns.rows)
  const dayError = pickups.error ?? returns.error
  const dayLoading = pickups.loading || returns.loading

  /*
   * ⛔ The two badges used to read module constants over the UNFILTERED seed.
   * Filter to one row and the header still said "8 Pending". Both are now
   * counted off the rows the list is showing.
   */
  const overdueReturns = returns.rows.filter((r) => r.flags.includes('Overdue')).length

  /*
   * §8 — priority sorted, and every alert carries its own primary action. Both
   * priorities are already fetched; `AlertsPanel` orders them.
   *
   * ⚠ This is the change spec 02 forces. `AlertsPanel` used to render the
   * Critical rows ONLY, citing §5.6's "Critical Alerts KPI … must equal the
   * Alerts column count" as its authority. Spec 02's KPI strip is
   * Out · In · Overdue · Cash due — there is no Critical Alerts card for that
   * invariant to hold against, so the filter would have been left with a
   * dangling justification, quietly hiding every High-priority row for a reason
   * no longer stated anywhere. The panel now shows ALL alerts, priority-sorted,
   * and the reachable "Alerts" KPI below counts exactly what the panel renders
   * — so §5.6's card-equals-column rule survives in the only form spec 02
   * leaves room for.
   */
  const alertRows = [
    ...alerts.rows.map((r: BookingListRow) => overdueAlert(r, NOW_AD)),
    ...quotes.rows.map((r: BookingListRow) => quoteLapsedAlert(r)),
  ]
  const alertsState = { loading: alerts.loading || quotes.loading, error: alerts.error ?? quotes.error }

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
  const specKpis: Kpi[] = [
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
  ]

  const reachableKpis: Kpi[] = [
    {
      label: 'Active Rentals',
      value: countOf(active, active.total),
      icon: 'briefcase',
      accent: 'primary',
      note: 'On Rent now',
    },
    {
      label: 'Alerts',
      value: countOf(alertsState, alertRows.length),
      icon: 'bell',
      accent: 'danger',
      note: 'Exactly what the Alerts panel lists',
    },
  ]

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
      onClearFilters={clearFilters}
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
      onClearFilters={clearFilters}
    />
  )

  const alertsPanel = (
    <AlertsPanel alerts={alertRows} loading={alertsState.loading} error={alertsState.error} onRetry={refetchAll} />
  )

  const calendar = (
    <CalendarPanel
      period={period}
      rows={day}
      loading={dayLoading}
      error={dayError}
      isFiltered={isFiltered}
      onRetry={refetchAll}
      onClearFilters={clearFilters}
      periodLabel={phrase}
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
      isFiltered={isFiltered}
      onRetry={refetchAll}
      onClearFilters={clearFilters}
      periodLabel={phrase}
    />
  )

  const stack = { display: 'flex', flexDirection: 'column' as const, gap: 'var(--sp-md)', minWidth: 0 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {/* §3 — the title is "Today". No number prefix, in the page or the sidebar.
          Breadcrumbs live in the shell; rulings §4 — no Back button here. */}
      <PageHeader
        title="Today"
        description="Today's jobs. Every other day lives in Operation."
        actions={
          <>
            <DatePill />
            <PeriodControl period={period} setPeriod={setPeriod} />
            <MoreFilters picked={picked} setPicked={setPicked} />
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
          {allKpis ? 'Fewer figures' : `${reachableKpis.length} more figures`}
        </button>
      </div>

      {viewport === 'desktop' ? (
        /* §2.1 Desktop — lists left, ALERTS + CALENDAR mini in the right rail. */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,1fr)',
            gap: 'var(--sp-md)',
            alignItems: 'start',
          }}
        >
          <div style={stack}>
            {outgoing}
            {incoming}
          </div>
          <div style={stack}>
            {alertsPanel}
            {calendar}
          </div>
        </div>
      ) : viewport === 'tablet' ? (
        /* §2.1 Tablet — "OUTGOING rows · INCOMING rows · ALERTS full-width
           below". The rail REFLOWS beneath the lists (rulings §7): its cards
           render inline, at full width, and are not hidden behind a handle. */
        <div style={stack}>
          {outgoing}
          {incoming}
          {alertsPanel}
          {calendar}
        </div>
      ) : (
        /* §2.1 Phone — one of the three at a time. The calendar mini follows
           beneath: no prose removes it, and it is the only date affordance left
           once the three lists are behind a control. */
        <div style={stack}>
          <SegmentedControl
            segment={segment}
            setSegment={setSegment}
            counts={{
              out: countOf(pickups, pickups.rows.length),
              in: countOf(returns, returns.rows.length),
              alerts: countOf(alertsState, alertRows.length),
            }}
          />
          {segment === 'out' ? outgoing : segment === 'in' ? incoming : alertsPanel}
          {calendar}
        </div>
      )}

      {timeline}

      <FooterNote />
    </div>
  )
}
