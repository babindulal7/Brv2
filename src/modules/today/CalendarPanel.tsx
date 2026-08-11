import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { BRAND } from '../../lib/status'
import type { Movement } from '../../types/today'
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
  CAL_EVENT_DAYS,
  CUSTOM_CHIP,
  PERIOD_CHIPS,
  TODAY_DATE,
  dotTone,
  timeOf,
} from '../../data/today'
import { cardStyle } from '../../components/ui/Page'

const ghostBtn = {
  width: 26,
  height: 26,
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

/**
 * The period chips. The Dashboard render puts them in this card's header rather
 * than on a strip of their own, so that is where they live.
 *
 * They still govern **every** panel on the page, because every panel reads the
 * one movements query (§4) — which is why the columns retitle themselves when
 * the period is not Today, instead of silently showing a different day's rows
 * under a heading that says "Today".
 */
function PeriodChips({ period, setPeriod }: { period: string; setPeriod: (p: string) => void }) {
  const chip = (p: string) => {
    const on = period === p
    return {
      height: 26,
      padding: p === CUSTOM_CHIP ? '0 9px' : '0 10px',
      borderRadius: 7,
      border: on ? '1px solid transparent' : '1px solid var(--border)',
      background: on ? 'var(--st-primary-bg)' : 'transparent',
      color: on ? 'var(--st-primary-fg)' : 'var(--text2)',
      fontSize: 'var(--t-meta)',
      fontWeight: 600,
      cursor: 'pointer',
      fontFamily: 'inherit',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      whiteSpace: 'nowrap' as const,
    }
  }

  return (
    <div
      role="group"
      aria-label="Filter every panel by period"
      style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}
    >
      {PERIOD_CHIPS.filter((p) => p !== CUSTOM_CHIP).map((p) => (
        <button key={p} type="button" onClick={() => setPeriod(p)} aria-pressed={period === p} style={chip(p)}>
          {p}
        </button>
      ))}
      {/* The render separates Custom behind a divider and gives it the calendar
          affordance — it is the one chip that asks for a date, not a shortcut. */}
      <span aria-hidden style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 3px' }} />
      <button
        type="button"
        onClick={() => setPeriod(CUSTOM_CHIP)}
        aria-pressed={period === CUSTOM_CHIP}
        style={chip(CUSTOM_CHIP)}
      >
        <Icon name="calendar" size={13} />
        {CUSTOM_CHIP}
      </button>
    </div>
  )
}

/**
 * Dashboard render — the calendar card: the day's movements on the left, the
 * mini month on the right, period chips in the header.
 *
 * The day list is a **view of the same rows** the Pickups and Returns columns
 * render (§4 Single Source Rule) — merged back into one chronological day and
 * passed in, never fetched here — so a booking cannot carry one time in the
 * column and another in the calendar.
 *
 * Nepal Mode: the BS day leads at full size, the AD day sits small in the
 * corner. BS is rendered here, never stored (Foundation law).
 */
export default function CalendarPanel({
  period,
  setPeriod,
  rows,
  emptyNote,
}: {
  period: string
  setPeriod: (p: string) => void
  rows: Movement[]
  emptyNote: string
}) {
  const navigate = useNavigate()

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
        <PeriodChips period={period} setPeriod={setPeriod} />
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
                {period === 'Today' ? 'Today' : period} · {TODAY_DATE.bs}
              </span>
              <span
                style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {TODAY_DATE.ad}
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
            Capped rather than unbounded: the day carries 25 movements, and a
            list that renders all of them would drag this card — and the
            timeline stretched beside it — to twice the height the row should
            be. It scrolls; the full day is one click away in the Calendar.
          */}
          <div style={{ flex: 1, minHeight: 0, maxHeight: 250, overflowY: 'auto' }}>
            {rows.length === 0 && (
              <p style={{ margin: 0, padding: '18px 2px', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.6 }}>
                {emptyNote}
              </p>
            )}
            {rows.map((m) => (
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
                  {m.client} — {m.kit}
                </span>
              </Link>
            ))}
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
              const hasEvent = CAL_EVENT_DAYS.includes(d.ad)
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
        </div>
      </div>
    </section>
  )
}
