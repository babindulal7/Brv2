import { Link } from 'react-router-dom'
import { STATUS, BRAND } from '../../lib/status'
import { clockNowMinutes, timeOf, statusKeyOf, dotTone, type MovementRow } from '../../data/today'
import { cardStyle } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'

/**
 * Dashboard.md §9 — the day's movements on a rail.
 *
 * ## Why this panel is still here after spec 02
 *
 * Spec 02 §2.1 draws four regions — KPI strip, OUTGOING, INCOMING, and a right
 * rail of ALERTS + CALENDAR mini — and no timeline at any of the three widths.
 * It removes nothing in words, and `WIREFRAME_RULINGS_2026-08-12.md` §1 is
 * explicit that **"a panel survives unless a spec removes it in prose"**; §1
 * then names this panel among the two judgement calls it flagged rather than
 * deleted: *"Today's `TimelinePanel` duplicates the calendar card's day list and
 * is drawn in no wireframe. Leave it; raise separately. `Dashboard.md` §9 still
 * asks for it."* So it stays, full-width beneath the arrangement rather than
 * inside either of spec 02's two tracks, and the duplication question is raised
 * rather than answered here.
 *
 * The rows are the *same objects* the Outgoing and Incoming lists render (§4
 * Single Source Rule), merged by `mergeByTime` in `Today.tsx` — one query pair,
 * not a third fetch — so a booking cannot appear here at a different time, with
 * a different package, or at a different stage. The reference render did exactly
 * that: ABC Films' pickup sat at 09:00 AM in the column and 06:00 AM on the
 * timeline, Ready in one and Completed in the other.
 *
 * Statuses are Foundation §01 stages — **not** the six Dashboard.md §9 lists,
 * three of which ("Booked", "Packed", "Returned") are not statuses at all.
 * §9's other rule still holds and is still obeyed: **purple is never used
 * here.** §4.2 bans the hue outright.
 *
 * §9 — "status-coloured dots". The dot reads the *same* source as the badge
 * beside it (the Foundation stage category), so the two cannot disagree; an
 * overdue row is the one override, because being late is a fact about the row
 * that its stage does not carry. `dotTone` lives in `data/today` because the
 * calendar card's day list draws the same dots for the same rows.
 *
 * ⛔ The row used to read `{client} — {kit}`. `kit` was the package name and
 * `bookings` has no column for it; it now reads `bookings.project`, the
 * booking's own title, with an explicit non-value when it is null.
 */

/** §9 is chronological, and a busy day carries more rows than fit. Show the ones around now. */
const WINDOW = 8

export default function TimelinePanel({
  title = "Today's Timeline",
  rows,
  loading,
  error,
  isFiltered,
  filteredByChips,
  onRetry,
  onClearFilters,
  periodLabel,
}: {
  title?: string
  rows: MovementRow[]
  loading: boolean
  error: string | null
  isFiltered: boolean
  /** Chips picked on either list, as opposed to only the period moving —
   *  decides whether the empty state may blame "these filters" (1 Sep #7). */
  filteredByChips: boolean
  onRetry: () => void
  onClearFilters: () => void
  periodLabel: string
}) {
  /* The clock position this render sits at (AR-03). It was a module-scope
     constant built from a day marker, so it was 05:45 all day: the rail opened
     on the first movement after 05:45 and ringed it as "now" at 4pm. Read once
     per render so the window and the ring below cannot disagree with each other. */
  const nowMinutes = clockNowMinutes()
  const first = rows.findIndex((m) => m.at >= nowMinutes)
  const start = Math.max(0, Math.min(first < 0 ? rows.length : first - 2, rows.length - WINDOW))
  const ROWS = rows.slice(start, start + WINDOW)

  return (
    <section style={{ ...cardStyle, minWidth: 0, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '13px 15px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
        {/* ⛔ This read `{rows.length === MOVE_TOTAL ? MOVE_TOTAL : rows.length}`
            — both branches the same value, a leftover from the seed era. */}
        <span className="figure" style={{ marginLeft: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          {ROWS.length} of {rows.length}
        </span>
        <Link
          to="/calendar"
          style={{ marginLeft: 'auto', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}
        >
          View full timeline
        </Link>
      </div>

      <div style={{ padding: '12px 15px 14px', position: 'relative' }}>
        <PageBody
          loading={loading}
          error={error}
          hasRows={rows.length > 0}
          onRetry={onRetry}
          empty={!loading && error === null && rows.length === 0}
          emptyIsFiltered={isFiltered}
          onClearFilters={onClearFilters}
          noun="movements"
          skeleton="table"
          skeletonRows={WINDOW}
          {...(isFiltered && filteredByChips
            ? {} // chips narrowed a list — "match these filters" is true
            : isFiltered
              ? {
                  /* Only the period moved — same honesty rule as MovementList. */
                  emptyTitle: `No movements ${periodLabel}`,
                  emptyMessage: 'Nothing is scheduled in this period.',
                  clearLabel: 'Back to Today',
                }
              : { emptyTitle: `No movements ${periodLabel}`, emptyMessage: 'Nothing is scheduled in this period.' })}
        >
          {ROWS.length > 0 && (
            <span
              aria-hidden
              style={{ position: 'absolute', left: 21, top: 20, bottom: 22, width: 1.5, background: 'var(--border)' }}
            />
          )}

          {ROWS.map((t) => {
            const dot = BRAND[dotTone(t)]
            const st = STATUS[statusKeyOf(t)]
            // The current moment is the first movement not yet passed.
            const current = t.at >= nowMinutes && !ROWS.some((o) => o.at >= nowMinutes && o.at < t.at)
            return (
              <Link
                key={t.id}
                to={`/rentals/${t.bookingNo}`}
                className="lift"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '13px 72px 68px minmax(0,1fr) auto',
                  gap: 10,
                  alignItems: 'center',
                  padding: '6px 8px',
                  borderRadius: 'var(--r-xs)',
                  position: 'relative',
                  textDecoration: 'none',
                  transition: 'background-color 0.15s ease',
                }}
              >
                {/* The current moment is a ring, not a bigger dot — reads at a glance. */}
                <span
                  aria-hidden
                  style={{
                    width: current ? 12 : 9,
                    height: current ? 12 : 9,
                    borderRadius: 'var(--r-badge)',
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
                  {t.client} — {t.project ?? '—'}
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
        </PageBody>
      </div>
    </section>
  )
}
