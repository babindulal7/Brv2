import { Link } from 'react-router-dom'
import { STATUS, BRAND } from '../../lib/status'
import type { BrandKey } from '../../lib/status'
import type { Movement } from '../../types/today'
import type { BookingStatus } from '../../lib/workflow'
import { TIMELINE, NOW, MOVE_TOTAL, timeOf, statusKeyOf, has } from '../../data/today'
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
 * here** — purple is reserved for the Utilization KPI, so its appearance stays
 * meaningful.
 */

/**
 * §9 — "status-coloured dots". The dot reads the *same* source as the badge
 * beside it (the Foundation stage category), so the two cannot disagree; an
 * overdue row is the one override, because being late is a fact about the row
 * that its stage does not carry.
 */
const STATUS_DOT: Record<BookingStatus, BrandKey> = {
  Quote: 'neutral',
  Booked: 'primary',
  Packed: 'progress',
  'On Rent': 'success',
  Returned: 'progress',
  Closed: 'neutral',
}

function dotTone(m: Movement): BrandKey {
  // §1.9 — Overdue is Critical and outranks the status wherever it appears.
  if (has(m, 'Overdue')) return 'danger'
  return STATUS_DOT[m.status]
}

/** §9 is chronological, and a day has 25 movements. Show the ones around now. */
const WINDOW = 8
const start = Math.max(0, Math.min(TIMELINE.findIndex((m) => m.at >= NOW) - 2, TIMELINE.length - WINDOW))
const ROWS = TIMELINE.slice(start, start + WINDOW)

export default function TimelinePanel() {
  return (
    <section style={{ ...cardStyle, minWidth: 0, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '13px 15px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>Today&apos;s Timeline</h2>
        <span className="figure" style={{ marginLeft: 8, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          {ROWS.length} of {MOVE_TOTAL}
        </span>
        <Link
          to="/calendar"
          style={{ marginLeft: 'auto', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}
        >
          View full timeline
        </Link>
      </div>

      <div style={{ padding: '12px 15px 14px', position: 'relative' }}>
        <span
          aria-hidden
          style={{ position: 'absolute', left: 21, top: 20, bottom: 22, width: 1.5, background: 'var(--border)' }}
        />

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
