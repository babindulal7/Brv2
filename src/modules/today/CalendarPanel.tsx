import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import {
  CAL_MONTH,
  CAL_WEEKDAYS,
  CAL_LEADING,
  CAL_DAYS,
  CAL_TRAILING,
  CAL_TODAY_AD,
  CAL_EVENT_DAYS,
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

/** Out-of-month days — leading and trailing spill, greyed and non-interactive. */
function SpillDay({ ad }: { ad: number }) {
  return (
    <span
      aria-hidden
      className="figure"
      /* `--disabled` measured 2.54:1 here. Spill days are still a date someone
         reads, so they wear `--muted` — dimmer than a real day, but AA. */
      style={{ height: 34, display: 'grid', placeItems: 'center', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}
    >
      {ad}
    </span>
  )
}

/**
 * Dashboard.md §10 — **mini-month only**. The event list that used to sit
 * beside it is deleted: it duplicated the Timeline directly below, and two
 * lists of the same movements is worse than one.
 *
 * Nepal Mode: the BS day leads at full size, the AD day sits small in the
 * corner. BS is rendered here, never stored (Foundation law).
 */
export default function CalendarPanel() {
  const navigate = useNavigate()

  return (
    <section style={{ ...cardStyle, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '13px 15px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>Calendar</h2>
        {/* §11's period chips are page filters, not calendar chrome — they moved
            to the filter bar above, where they govern every panel. */}
        <span style={{ marginLeft: 'auto', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)' }}>
          <button
            type="button"
            onClick={() => navigate('/calendar')}
            style={{ border: 'none', background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}
          >
            Open Calendar
          </button>
        </span>
      </div>

      <div style={{ padding: '13px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ lineHeight: 1.25 }}>
            <span style={{ display: 'block', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{CAL_MONTH.bs}</span>
            <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{CAL_MONTH.ad}</span>
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
            <button type="button" aria-label="Previous month" style={ghostBtn}>
              <Icon name="chevron_left" size={15} />
            </button>
            <button type="button" aria-label="Next month" style={ghostBtn}>
              <Icon name="chevron_right" size={15} />
            </button>
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, textAlign: 'center' }}>
          {CAL_WEEKDAYS.map((d) => (
            <span
              key={d}
              style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em', paddingBottom: 5 }}
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
                onClick={() => navigate(`/calendar?d=2026-07-${String(d.ad).padStart(2, '0')}`)}
                aria-current={isToday ? 'date' : undefined}
                aria-label={
                  (d.bs ? `${d.bs} ${CAL_MONTH.bs} — ` : '') +
                  `${d.ad} ${CAL_MONTH.ad}${hasEvent ? ', has movements' : ''}`
                }
                style={{
                  position: 'relative',
                  height: 34,
                  border: 'none',
                  borderRadius: 9,
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
                      top: 2,
                      right: 4,
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
                      bottom: 3,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 4,
                      height: 4,
                      borderRadius: 999,
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
    </section>
  )
}
