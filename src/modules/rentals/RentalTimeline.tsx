import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Badge } from '../../components/ui/Badge'
import { useViewport } from '../../lib/device'
import type { RentalListRow } from '../../lib/queries/bookings'
import './rental-timeline.css'

const DAY_MS = 86_400_000
const DAY_WIDTH = 76
const MAX_DAYS = 45

function rowTime(date: string, time: string): number | null {
  if (!date) return null
  const normalizedTime = time?.trim() ? (time.length === 5 ? `${time}:00` : time) : '00:00:00'
  const isoStr = `${date}T${normalizedTime}`
  const value = Date.parse(isoStr)
  if (Number.isFinite(value)) return value
  const fallback = Date.parse(`${date} ${time}`)
  return Number.isFinite(fallback) ? fallback : null
}

function rentalRowHref(row: RentalListRow): string {
  if ((row.status as string) === 'Draft') {
    return `/rentals?action=new&draft=${row.id}`
  }
  return `/rentals/${row.bookingNo}`
}

function dayStart(value: number): number {
  const date = new Date(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export interface TimelineWindow {
  start: number
  end: number
  dayCount: number
  clipped: boolean
}

export function buildTimelineWindow(rows: readonly RentalListRow[], now = Date.now()): TimelineWindow {
  const starts = rows.map((row) => rowTime(row.pickup.date, row.pickup.time)).filter((value): value is number => value !== null)
  const ends = rows.map((row) => rowTime(row.ret.date, row.ret.time)).filter((value): value is number => value !== null)
  const earliest = starts.length > 0 ? Math.min(...starts) : now
  const latest = ends.length > 0 ? Math.max(...ends) : earliest + DAY_MS
  const start = dayStart(earliest)
  const naturalDays = Math.max(1, Math.ceil((latest - start) / DAY_MS))
  const dayCount = Math.min(MAX_DAYS, naturalDays)
  return { start, end: start + dayCount * DAY_MS, dayCount, clipped: naturalDays > MAX_DAYS }
}

function dateLabel(value: number, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-NP', options).format(new Date(value))
}

function PhoneTimeline({ rows }: { rows: readonly RentalListRow[] }) {
  return (
    <div className="rental-timeline-phone" aria-label="Rental timeline">
      {rows.map((row) => (
        <article key={row.id} className="rental-timeline-phone__card">
          <div className="rental-timeline-phone__head">
            <div>
              <Link to={rentalRowHref(row)} className="rental-timeline__booking">{row.bookingNo}</Link>
              <div className="rental-timeline__client">{row.client}</div>
              <div className="rental-timeline__project">{row.project ?? 'No project'}</div>
            </div>
            <Badge tone={row.statusKey} label={row.status} size="sm" />
          </div>
          <div className="rental-timeline-phone__journey">
            <div className="rental-timeline-phone__event">
              <span className="rental-timeline-phone__dot"><Icon name="calendar" size={14} /></span>
              <span><strong>Pickup</strong>{row.pickup.date} · {row.pickup.time}</span>
            </div>
            <span className="rental-timeline-phone__line" aria-hidden="true" />
            <div className="rental-timeline-phone__event">
              <span className="rental-timeline-phone__dot"><Icon name="return_arrow" size={14} /></span>
              <span><strong>Return</strong>{row.ret.date} · {row.ret.time}</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

export function RentalTimeline({ rows }: { rows: readonly RentalListRow[] }) {
  const viewport = useViewport()
  const timelineWindow = buildTimelineWindow(rows)
  const now = Date.now()
  const nowInside = now >= timelineWindow.start && now <= timelineWindow.end
  const days = Array.from({ length: timelineWindow.dayCount }, (_, index) => timelineWindow.start + index * DAY_MS)

  if (viewport === 'phone') return <PhoneTimeline rows={rows} />

  return (
    <section className="rental-timeline" aria-label="Rental timeline">
      <header className="rental-timeline__summary">
        <div>
          <strong>{dateLabel(timelineWindow.start, { day: 'numeric', month: 'short' })}</strong>
          <span aria-hidden="true"> → </span>
          <strong>{dateLabel(timelineWindow.end - DAY_MS, { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
          <span> · {rows.length} bookings on this page</span>
        </div>
        <div className="rental-timeline__legend" aria-label="Timeline legend">
          <span><i className="rental-timeline__legend-pickup" />Pickup</span>
          <span><i className="rental-timeline__legend-return" />Return</span>
        </div>
      </header>

      {timelineWindow.clipped && (
        <div className="rental-timeline__notice">
          <Icon name="info" size={15} /> Showing the first {MAX_DAYS} days. Narrow the date filters to inspect a smaller window.
        </div>
      )}

      <div className="rental-timeline__scroll" tabIndex={0} aria-label="Scroll rental schedule horizontally">
        <div className="rental-timeline__canvas" style={{ '--timeline-width': `${timelineWindow.dayCount * DAY_WIDTH}px` } as React.CSSProperties}>
          <div className="rental-timeline__corner">Booking</div>
          <div className="rental-timeline__days">
            {days.map((day) => (
              <div key={day} className="rental-timeline__day" style={{ width: DAY_WIDTH }}>
                <span>{dateLabel(day, { weekday: 'short' })}</span>
                <strong>{dateLabel(day, { day: 'numeric', month: 'short' })}</strong>
              </div>
            ))}
          </div>

          {rows.map((row) => {
            const pickup = rowTime(row.pickup.date, row.pickup.time) ?? timelineWindow.start
            const ret = rowTime(row.ret.date, row.ret.time) ?? pickup + DAY_MS
            const left = Math.max(0, ((pickup - timelineWindow.start) / DAY_MS) * DAY_WIDTH)
            const right = Math.min(timelineWindow.dayCount * DAY_WIDTH, ((ret - timelineWindow.start) / DAY_MS) * DAY_WIDTH)
            const width = Math.max(28, right - left)
            return (
              <div key={row.id} className="rental-timeline__row">
                <div className="rental-timeline__identity">
                  <Link to={rentalRowHref(row)} className="rental-timeline__booking">{row.bookingNo}</Link>
                  <div className="rental-timeline__client">{row.client}</div>
                  <div className="rental-timeline__project">{row.project ?? 'No project'}</div>
                </div>
                <div className="rental-timeline__track">
                  {days.map((day) => <span key={day} className="rental-timeline__gridline" style={{ width: DAY_WIDTH }} aria-hidden="true" />)}
                  {nowInside && <span className="rental-timeline__today" style={{ left: `${((now - timelineWindow.start) / DAY_MS) * DAY_WIDTH}px` }} aria-label="Today" />}
                  <Link
                    to={rentalRowHref(row)}
                    className="rental-timeline__bar"
                    data-status={row.status}
                    style={{ left, width }}
                    title={`${row.bookingNo}: ${row.pickup.date} ${row.pickup.time} to ${row.ret.date} ${row.ret.time}`}
                  >
                    <span className="rental-timeline__endpoint rental-timeline__endpoint--pickup" aria-hidden="true" />
                    <span className="rental-timeline__bar-label">{row.status}</span>
                    <span className="rental-timeline__endpoint rental-timeline__endpoint--return" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
