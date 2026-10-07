import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { cardStyle } from '../../components/ui/Page'

/**
 * **The floor workspaces are parameterised in name only.**
 *
 * `/rentals/:bookingNo/packing` (and handover, return, reset, evidence) read
 * `bookingNo` out of the URL, use it for the title and the breadcrumb, and then
 * render `data/packing`'s single hardcoded booking regardless of which one was
 * asked for. That is reachable in normal use, not just by typing a URL: the
 * Floor queue on `/operations` navigates with each row's own booking number, so
 * every row landed the operator on the same seeded package under a different
 * number.
 *
 * Spec 03's Notes are explicit — *"Routes are parameterised — these must work
 * for any BR#, not one seeded booking"* — and Rulings §8 forbids exactly this
 * class: a screen asserting a subject it has no source for. Until these
 * workspaces are converted onto `lib/queries/bookings.ts` and render the
 * booking's own lines, a foreign booking number gets this state instead of
 * another booking's items wearing its number.
 *
 * It is deliberately **not** an error: nothing went wrong, and nothing is
 * broken. It states which query is missing, so the gap reads as unbuilt rather
 * than as a fault the operator could have caused.
 */
export function BookingNotLoaded({
  bookingNo,
  job,
  seededBookingNo,
}: {
  bookingNo: string
  /** "Packing", "Handover", "Return", "Reset", "Evidence" — named so the message is about this screen. */
  job: string
  /** The one booking this build actually holds floor data for. */
  seededBookingNo: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <div
        style={{
          ...cardStyle,
          padding: 'var(--sp-xl)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-sm)',
          alignItems: 'flex-start',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 44,
            height: 44,
            borderRadius: 'var(--r-sm)',
            background: 'var(--card2)',
            color: 'var(--text2)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Icon name="info" size={20} />
        </span>
        {/* This card IS the page when it renders — it replaces the workspace
            wholesale — so its title is the route's `<h1>`, not a sub-heading. */}
        <h1 style={{ margin: 0, fontSize: 'var(--t-h2)', fontWeight: 700, color: 'var(--text)' }}>
          {job} for <span className="identifier">{bookingNo}</span> is not loaded yet
        </h1>
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', maxWidth: '62ch', lineHeight: 1.5 }}>
          This workspace has no per-booking query behind it yet. Its items, sessions and evidence come from a
          single seeded booking, so showing them here would put another booking&apos;s gear under this number —
          which is worse than showing nothing. Spec 03 requires these routes to work for any booking; the
          missing piece is a floor-lines read on <span className="identifier">{/* lib/queries/bookings.ts */}shared tools </span>,
          not this screen.
        </p>
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          Floor data exists in this build only for <span className="identifier">{seededBookingNo}</span>.
        </p>
        <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap', marginTop: 'var(--sp-sm)' }}>
          <Link
            to={`/rentals/${bookingNo}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 44,
              padding: '0 14px',
              borderRadius: 'var(--r-btn)',
              background: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-fg)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Open booking {bookingNo}
          </Link>
          <Link
            to="/operations"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 44,
              padding: '0 14px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Back to Operations
          </Link>
        </div>
      </div>
    </div>
  )
}
