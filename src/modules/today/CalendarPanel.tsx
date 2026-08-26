import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { BRAND } from '../../lib/status'
import {
  CAL_MONTH,
  CAL_WEEKDAYS,
  CAL_LEADING,
  CAL_DAYS,
  CAL_TRAILING,
  CAL_TODAY_AD,
  CAL_TODAY_ISO,
  CAL_PREV_ISO,
  CAL_NEXT_ISO,
  TODAY_DATE,
  TODAY_DAY_AD,
  dotTone,
  eventDaysOf,
  periodRange,
  timeOf,
  type LivePeriod,
  type MovementRow,
} from '../../data/today'
import { formatAd } from '../../lib/bs'
import { cardStyle } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'

// Law 15 — 44×44 at every width. Spread onto the previous/next day and
// previous/next month buttons, whose 15px chevrons had no hit area around them.
const ghostBtn = {
  minWidth: 44,
  minHeight: 44,
  borderRadius: 7,
  border: 'none',
  background: 'transparent',
  color: 'var(--muted)',
  cursor: 'pointer',
  display: 'grid',
  placeItems: 'center',
} as const

/**
 * The full Calendar, opened at one day.
 *
 * It takes an ISO key the Date Engine generated rather than assembling one from
 * a day number: `2026-07-${31 + 1}` is `2026-07-32`, which is what the ◀ / ▶
 * controls emitted on the last day of a month.
 */
const dayHref = (iso: string) => `/calendar?d=${iso}`

/**
 * The heading over the day list — the dates the rows underneath actually cover.
 *
 * ⛔ It used to read `TODAY_DATE` unconditionally, so selecting "Next Month"
 * left next month's rows sitting under "16 Shrawan 2083 · 31 Jul 2026". A date
 * label that contradicts the rows below it is the same class of defect as an
 * invented figure: the operator has no way to tell which of the two is the lie.
 *
 * `Today` keeps the BS-leading pill (`TODAY_DATE` is built by the one Date
 * Engine), `All` states that it is unbounded, and every other chip states its
 * own resolved AD range — the same range `periodRange` handed to the query, so
 * the label cannot drift from what was fetched.
 */
function periodDates(period: LivePeriod): { lead: string; sub: string } {
  if (period === 'Today') return { lead: `Today · ${TODAY_DATE.bs}`, sub: TODAY_DATE.ad }
  const range = periodRange(period, TODAY_DAY_AD)
  if (!range) return { lead: 'All', sub: 'Every scheduled date' }
  const from = formatAd(new Date(`${range.from}T00:00:00.000Z`))
  const to = formatAd(new Date(`${range.to}T00:00:00.000Z`))
  return { lead: period, sub: from === to ? from : `${from} → ${to}` }
}

/** Out-of-month days — leading and trailing spill, greyed and non-interactive. */
function SpillDay({ ad }: { ad: number }) {
  return (
    <span
      aria-hidden
      className="figure"
      /* `--disabled` measured 2.54:1 here. Spill days are still a date someone
         reads, so they wear `--muted` — dimmer than a real day, but AA. */
      style={{ height: 30, display: 'grid', placeItems: 'center', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}
    >
      {ad}
    </span>
  )
}

/*
 * ⛔ `PeriodChips` was deleted here — the control, not the periods.
 *
 * The Dashboard render put seven chips (All · Today · Tomorrow · Next 7 Days ·
 * This Week · Next Month · Custom) in this card's header. Spec 02 §2.1 puts the
 * period control in the PAGE header and draws exactly `[Today▾][Tomorrow]`,
 * with line 3 reading "Today's jobs only. All other days live in Operation" —
 * so a seven-chip rail on a card is now the wrong shape in both readings, and
 * spec 03 already gives Operation its own `[Today][Tomorrow][Custom ▾]`.
 *
 * Nothing was removed from `data/today.ts`: `PERIOD_CHIPS`, `CUSTOM_CHIP`,
 * `PERIOD_UNAVAILABLE` and all six `periodRange` cases are untouched and still
 * exported, so whichever way the TODO(decision) in `Today.tsx` is ruled, the
 * ranges are there. This card still RECEIVES the period, because the heading
 * over its day list has to state the dates those rows actually cover.
 */

/**
 * A movement's Pickup/Return bucket — Delivery counts as Pickup-side (gear
 * going out), matching which of the two queries the row came out of, so this
 * chip can never disagree with what the Pickups/Returns columns call the same
 * row.
 */
type Kind = 'all' | 'pickup' | 'return'
const kindOf = (m: MovementRow): 'pickup' | 'return' => (m.kind === 'Return' || m.kind === 'Inspection' ? 'return' : 'pickup')

/**
 * A second, narrower chip row: which side of the day this list shows, not
 * which day. Deliberately independent of `PeriodChips` — this only narrows the
 * *view* this one card renders (§4: "a view of the same rows"), it does not
 * change which period the rest of the page is on.
 *
 * It is the one filter on this screen that stays client-side, and legitimately:
 * both sides are ALREADY fetched (the columns above render them), and the
 * distinction is which of the two queries a row came from rather than a column
 * `bookings` carries — `delivery_type` separates Pickup from Delivery and says
 * nothing at all about returns.
 */
function KindChips({ kind, setKind }: { kind: Kind; setKind: (k: Kind) => void }) {
  /* Law 14 / v4.1 §7.3 — 26px of paint, 44px of target. These three chips had
     neither: 26px is below the touch minimum on every axis, and nothing around
     them made up the difference.

     They keep the compact paint rather than growing to 44, which is the trade §5
     licenses for a dense strip ("the law is the HIT AREA, not the paint"). This
     is the narrow secondary control on a rail card — the card's day list is
     already capped at 250px and scrolls, so 18px more chrome would come straight
     out of the rows an operator is trying to read, to make a chip that only
     narrows the view beside it look like a primary action. `.tap` (theme.css)
     grows both axes underneath instead; the row does not wrap and every chip is
     ~44 wide or more, so no target here reaches into its neighbour. */
  const chip = (k: Kind) => {
    const on = kind === k
    return {
      height: 26,
      padding: '0 10px',
      borderRadius: 7,
      border: on ? '1px solid transparent' : '1px solid var(--border)',
      background: on ? 'var(--st-primary-bg)' : 'transparent',
      color: on ? 'var(--st-primary-fg)' : 'var(--text2)',
      fontSize: 'var(--t-meta)',
      fontWeight: 600,
      cursor: 'pointer',
      fontFamily: 'inherit',
      whiteSpace: 'nowrap' as const,
    }
  }

  return (
    <div role="group" aria-label="Show only pickups or only returns" style={{ display: 'flex', gap: 5 }}>
      <button type="button" className="tap" onClick={() => setKind('pickup')} aria-pressed={kind === 'pickup'} style={chip('pickup')}>
        Pickups
      </button>
      <button type="button" className="tap" onClick={() => setKind('return')} aria-pressed={kind === 'return'} style={chip('return')}>
        Returns
      </button>
      {kind !== 'all' && (
        <button type="button" className="tap" onClick={() => setKind('all')} aria-pressed={false} style={chip('all')}>
          All
        </button>
      )}
    </div>
  )
}

/**
 * Spec 02 §2.1 — the CALENDAR mini, second card in the right rail: the day's
 * movements on the left, the mini month on the right.
 *
 * The day list is a **view of the same rows** the Outgoing and Incoming lists
 * render (§4 Single Source Rule) — merged back into one chronological day and
 * passed in, never fetched here — so a booking cannot carry one time in the
 * list and another in the calendar.
 *
 * Nepal Mode: the BS day leads at full size, the AD day sits small in the
 * corner. BS is rendered here, never stored (Foundation law).
 *
 * ⚠ The mini month's GRID is still generated from `CAL_DAYS` (July 2026, from
 * the Date Engine's one `TODAY`) — a month-wide movements query does not exist,
 * because `listBookings` is a list and marking 31 days needs a grouped count.
 *
 * Its event dots, however, are no longer seed. They were `[3, 8, 14, 22, 27]`,
 * five day numbers with nothing behind them, announced to a screen reader as
 * "has movements" inside the same card as a queried day list. They now come from
 * `eventDaysOf(rows)` — the Kathmandu days the fetched rows actually fall on —
 * so every dot is a booking. Days outside the selected period carry no dot,
 * which is why the legend under the grid names the period: an absent dot means
 * "not in what was asked for", not "nothing scheduled".
 */
export default function CalendarPanel({
  period,
  rows,
  loading,
  error,
  isFiltered,
  onRetry,
  onClearFilters,
  periodLabel,
}: {
  /**
   * Read-only here. The control that SETS it lives in the page header (spec 02
   * §2.1); this card only needs it to label the day list with the dates those
   * rows actually cover — a heading that says "Today" over tomorrow's rows is
   * the one way this card could mislead.
   */
  period: LivePeriod
  rows: MovementRow[]
  loading: boolean
  error: string | null
  isFiltered: boolean
  onRetry: () => void
  onClearFilters: () => void
  periodLabel: string
}) {
  const navigate = useNavigate()
  const [kind, setKind] = useState<Kind>('all')
  const visibleRows = kind === 'all' ? rows : rows.filter((m) => kindOf(m) === kind)
  /* Every dot is a booking the screen fetched — see the header. Derived from
     `visibleRows` rather than `rows` so the Pickups/Returns chip narrows the
     month exactly as it narrows the list beside it. */
  const eventDays = eventDaysOf(visibleRows)
  const dates = periodDates(period)

  return (
    <section style={{ ...cardStyle, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '11px 15px',
          borderBottom: '1px solid var(--border)',
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>Calendar</h2>
        <Link
          to={dayHref(CAL_TODAY_ISO)}
          style={{ marginLeft: 'auto', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}
        >
          Open Calendar
        </Link>
      </div>

      <div
        style={{
          display: 'flex',
          padding: '9px 15px 0',
        }}
      >
        <KindChips kind={kind} setKind={setKind} />
      </div>

      {/*
        Flex rather than a two-column grid, and deliberately: the page owns no
        stylesheet of its own, so a media query is not available here. A wrapping
        flex row gives the same 60/40 split while the card is wide and drops the
        month below the day list when it is not — a fixed grid track would have
        crushed both instead.
      */}
      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-lg)', padding: '12px 15px 14px', flex: 1, minHeight: 0 }}
      >
        {/* ── the day's movements ─────────────────────────────────────── */}
        <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)', marginBottom: 'var(--sp-sm)' }}>
            <button
              type="button"
              aria-label="Previous day in the full Calendar"
              onClick={() => navigate(dayHref(CAL_PREV_ISO))}
              style={ghostBtn}
            >
              <Icon name="chevron_left" size={15} />
            </button>
            <Link to={dayHref(CAL_TODAY_ISO)} style={{ lineHeight: 1.25, textDecoration: 'none', minWidth: 0, overflow: 'hidden' }}>
              <span
                className="figure"
                style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {dates.lead}
              </span>
              <span
                style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {dates.sub}
              </span>
            </Link>
            <button
              type="button"
              aria-label="Next day in the full Calendar"
              onClick={() => navigate(dayHref(CAL_NEXT_ISO))}
              style={{ ...ghostBtn, marginLeft: 'auto' }}
            >
              <Icon name="chevron_right" size={15} />
            </button>
          </div>

          {/*
            Capped rather than unbounded: a busy day carries more movements than
            this card can hold, and a list that rendered all of them would drag
            the card — and the timeline stretched beside it — to twice the height
            the row should be. It scrolls; the full day is one click away.
          */}
          <div style={{ flex: 1, minHeight: 0, maxHeight: 250, overflowY: 'auto' }}>
            <PageBody
              loading={loading}
              error={error}
              hasRows={visibleRows.length > 0}
              onRetry={onRetry}
              empty={!loading && error === null && visibleRows.length === 0}
              // A kind chip is a narrowing the operator chose too, so the empty
              // state offers Clear whenever either control is doing something.
              emptyIsFiltered={isFiltered || kind !== 'all'}
              onClearFilters={() => {
                setKind('all')
                onClearFilters()
              }}
              noun="movements"
              skeleton="table"
              skeletonRows={4}
              {...(isFiltered || kind !== 'all'
                ? {}
                : { emptyTitle: `No movements ${periodLabel}`, emptyMessage: 'Nothing is scheduled in this period.' })}
            >
              {visibleRows.map((m) => (
                <Link
                  key={m.id}
                  to={`/rentals/${m.bookingNo}`}
                  className="lift"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '9px 66px 62px minmax(0,1fr)',
                    gap: 9,
                    alignItems: 'center',
                    padding: '6px 8px',
                    borderRadius: 'var(--r-xs)',
                    textDecoration: 'none',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <span
                    aria-hidden
                    style={{ width: 9, height: 9, borderRadius: 'var(--r-badge)', background: BRAND[dotTone(m)] }}
                  />
                  <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>
                    {timeOf(m)}
                  </span>
                  <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{m.kind}</span>
                  <span
                    style={{
                      fontSize: 'var(--t-meta)',
                      color: 'var(--text2)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {/* Was `{client} — {kit}`; `kit` had no column. */}
                    {m.client} — {m.project ?? '—'}
                  </span>
                </Link>
              ))}
            </PageBody>
          </div>
        </div>

        {/* ── the mini month ──────────────────────────────────────────── */}
        <div style={{ flex: '0 1 262px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 'var(--sp-sm)' }}>
            <span style={{ lineHeight: 1.25 }}>
              <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{CAL_MONTH.bs}</span>
              <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{CAL_MONTH.ad}</span>
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              {/*
                Month paging is the full Calendar's job — this card is a jump
                target, not a second calendar. Both arrows land on a real month
                view rather than silently redrawing 31 days of seed.
              */}
              <button
                type="button"
                aria-label="Previous month in the full Calendar"
                onClick={() => navigate('/calendar?d=2026-06-01')}
                style={ghostBtn}
              >
                <Icon name="chevron_left" size={15} />
              </button>
              <button
                type="button"
                aria-label="Next month in the full Calendar"
                onClick={() => navigate('/calendar?d=2026-08-01')}
                style={ghostBtn}
              >
                <Icon name="chevron_right" size={15} />
              </button>
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1, textAlign: 'center' }}>
            {CAL_WEEKDAYS.map((d) => (
              <span
                key={d}
                style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em', paddingBottom: 'var(--sp-xs)' }}
              >
                {d}
              </span>
            ))}

            {CAL_LEADING.map((d) => (
              <SpillDay key={`lead-${d}`} ad={d} />
            ))}

            {CAL_DAYS.map((d) => {
              const isToday = d.ad === CAL_TODAY_AD
              const hasEvent = eventDays.includes(d.ad)
              return (
                <button
                  key={d.ad}
                  type="button"
                  /* §10 — "Click a day → full Calendar at that date." */
                  onClick={() => navigate(dayHref(d.iso))}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={
                    (d.bs ? `${d.bs} ${CAL_MONTH.bs} — ` : '') +
                    `${d.ad} ${CAL_MONTH.ad}${hasEvent ? ', has movements' : ''}`
                  }
                  style={{
                    position: 'relative',
                    height: 30,
                    border: 'none',
                    borderRadius: 'var(--r-sm)',
                    background: isToday ? 'var(--btn-primary-bg)' : 'transparent',
                    color: isToday ? 'var(--btn-primary-fg)' : 'var(--text)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {/* BS leads — large, centred. Days before 1 Shrawan show AD alone. */}
                  <span
                    className="figure"
                    style={{
                      fontSize: 'var(--t-meta)',
                      fontWeight: isToday ? 700 : 500,
                      color: d.bs ? undefined : 'var(--text2)',
                    }}
                  >
                    {d.bs ?? d.ad}
                  </span>
                  {/* AD trails — small, corner. */}
                  {d.bs && (
                    <span
                      className="figure"
                      style={{
                        position: 'absolute',
                        top: 1,
                        right: 3,
                        fontSize: 'var(--t-meta)',
                        fontWeight: 600,
                        color: isToday ? 'var(--btn-primary-fg)' : 'var(--muted)',
                        opacity: isToday ? 0.75 : 1,
                      }}
                    >
                      {d.ad}
                    </span>
                  )}
                  {hasEvent && (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        bottom: 2,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 4,
                        height: 4,
                        borderRadius: 'var(--r-badge)',
                        background: isToday ? 'var(--btn-primary-fg)' : 'var(--primary)',
                      }}
                    />
                  )}
                </button>
              )
            })}

            {CAL_TRAILING.map((d) => (
              <SpillDay key={`trail-${d}`} ad={d} />
            ))}
          </div>

          {/*
            Says what a dot means AND what its absence does not mean. The dots
            are derived from the rows this screen fetched, so they only ever
            cover the selected period — without this line an undotted day reads
            as "nothing scheduled", which the screen has not established.
          */}
          <p style={{ margin: '8px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
            A dot marks a day with movements {periodLabel}. Days this period does not cover are not marked — open the
            Calendar for the full month.
          </p>
        </div>
      </div>
    </section>
  )
}
