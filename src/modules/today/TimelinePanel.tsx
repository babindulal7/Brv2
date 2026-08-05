import { Link } from 'react-router-dom'
import { STATUS, BRAND } from '../../lib/status'
import type { Movement } from '../../types/today'
import { TIMELINE, NOW, MOVE_TOTAL, timeOf, statusKeyOf, dotTone } from '../../data/today'
import { cardStyle } from '../../components/ui/Page'

/**
 * Dashboard.md §9 — the day's movements on a rail.
 *
 * The rows are the *same objects* the Pickups and Returns columns render (§4
 * Single Source Rule), so a booking cannot appear here at a different time,
 * with a different package, or at a different stage. The reference render did
 * exactly that: ABC Films' pickup sat at 09:00 AM in the column and 06:00 AM on
 * the timeline, Ready in one and Completed in the other.
 *
 * Statuses are Foundation §01 stages — **not** the six Dashboard.md §9 lists,
 * three of which ("Booked", "Packed", "Returned") are not statuses at all.
 * §9's other rule still holds and is still obeyed: **purple is never used
 * here.** §4.2 bans the hue outright — it is not reserved for the Utilization
 * KPI or for anything else, and that KPI wears the commercial blue.
 */

/**
 * §9 — "status-coloured dots". The dot reads the *same* source as the badge
 * beside it (the Foundation stage category), so the two cannot disagree; an
 * overdue row is the one override, because being late is a fact about the row
 * that its stage does not carry. `dotTone` lives in `data/today` because the
 * calendar card's day list draws the same dots for the same rows.
 */

/** §9 is chronological, and a day has 25 movements. Show the ones around now. */
const WINDOW = 8

/**
 * The rail takes its rows from the page rather than reading the seed directly,
 * so the period chips govern it too — a filter that moves three panels out of
 * four is a filter that lies about its scope.
 */
export default function TimelinePanel({
  title = "Today's Timeline",
  rows = TIMELINE,
  emptyNote,
}: {
  title?: string
  rows?: Movement[]
  emptyNote: string
}) {
  const first = rows.findIndex((m) => m.at >= NOW)
  const start = Math.max(0, Math.min(first < 0 ? rows.length : first - 2, rows.length - WINDOW))
  const ROWS = rows.slice(start, start + WINDOW)

  return (
    <section style={{ ...cardStyle, minWidth: 0, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '13px 15px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
        <span className="figure" style={{ marginLeft: 8, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          {ROWS.length} of {rows.length === MOVE_TOTAL ? MOVE_TOTAL : rows.length}
        </span>
        <Link
          to="/calendar"
          style={{ marginLeft: 'auto', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}
        >
          View full timeline
        </Link>
      </div>

      <div style={{ padding: '12px 15px 14px', position: 'relative' }}>
        {ROWS.length > 0 && (
          <span
            aria-hidden
            style={{ position: 'absolute', left: 21, top: 20, bottom: 22, width: 1.5, background: 'var(--border)' }}
          />
        )}

        {ROWS.length === 0 && (
          <p style={{ margin: 0, padding: '20px 2px', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.6 }}>
            {emptyNote}
          </p>
        )}

        {ROWS.map((t) => {
          const dot = BRAND[dotTone(t)]
          const st = STATUS[statusKeyOf(t)]
          // The current moment is the first movement not yet passed.
          const current = t.at >= NOW && !ROWS.some((o) => o.at >= NOW && o.at < t.at)
          return (
            <Link
              key={t.id}
              to={`/rentals/${t.bookingNo}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '13px 72px 68px minmax(0,1fr) auto',
                gap: 10,
                alignItems: 'center',
                padding: '5px 0',
                position: 'relative',
                textDecoration: 'none',
              }}
            >
              {/* The current moment is a ring, not a bigger dot — reads at a glance. */}
              <span
                aria-hidden
                style={{
                  width: current ? 12 : 9,
                  height: current ? 12 : 9,
                  borderRadius: 999,
                  background: current ? 'var(--card)' : dot,
                  border: current ? `3px solid ${dot}` : 'none',
                  justifySelf: 'center',
                  zIndex: 1,
                }}
              />
              <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>
                {timeOf(t)}
              </span>
              <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{t.kind}</span>
              <span
                style={{
                  fontSize: 'var(--t-meta)',
                  color: 'var(--text2)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <span aria-hidden style={{ color: 'var(--muted)', marginRight: 7 }}>•</span>
                {t.client} — {t.kit}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 21,
                  padding: '0 8px',
                  borderRadius: 'var(--r-badge)',
                  background: st.bg,
                  color: st.fg,
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {t.status}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
