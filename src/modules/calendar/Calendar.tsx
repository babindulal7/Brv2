import { useState, useEffect } from 'react'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, FooterNote, cardStyle, KpiStrip } from '../../components/ui/Page'
import { TODAY, toBs, formatBs, formatAd, eachDay, isWeekend, BS_MONTHS } from '../../lib/bs'
import { VIEWS, ROW_TYPES, ROWS, BAR_STYLE, STATUS_BAR, FILTERS, BULK_ACTIONS, METRICS, SELECTED_EVENT } from '../../data/calendar'
import type { Bar, ResourceRow } from '../../data/calendar'

/** The rendered range. Seven days, generated — §4.1 forbids a hand-written list. */
const RANGE_START = new Date(Date.UTC(2026, 6, 27))
const RANGE_DAYS = 7
const COLUMNS = eachDay(RANGE_START, RANGE_DAYS)

function BarView({ bar, selected, onClick }: { bar: Bar; selected?: boolean; onClick?: (() => void) | undefined }) {
  const s = BAR_STYLE[bar.kind]
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      title={`${bar.kind} · ${bar.label}${bar.note ? ` · ${bar.note}` : ''}`}
      style={{
        gridColumn: `${bar.start + 1} / span ${bar.span}`,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        minWidth: 0,
        height: 26,
        margin: '3px 2px',
        padding: '0 7px',
        borderRadius: 6,
        background: s.outline ? 'transparent' : s.bg,
        border: s.outline ? `1.5px dashed ${s.fg}` : '1px solid transparent',
        color: s.fg,
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: selected ? '0 0 0 2px var(--card), 0 0 0 4px var(--blue)' : 'none',
        zIndex: selected ? 10 : 1,
        position: 'relative'
      }}
    >
      {s.icon && <Icon name={s.icon} size={11} style={{ flexShrink: 0 }} />}
      <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bar.label}</span>
      {bar.note && (
        <span style={{ flexShrink: 0, opacity: 0.85, fontWeight: 500, whiteSpace: 'nowrap' }}>· {bar.note}</span>
      )}
    </span>
  )
}

function ResourceRowView({ row, selectedEventId, onSelectEvent }: { row: ResourceRow; selectedEventId?: string | null; onSelectEvent?: (id: string | null) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `210px repeat(${RANGE_DAYS}, minmax(0,1fr))`, borderTop: '1px solid var(--border)' }}>
      <div style={{ padding: '8px 10px', minWidth: 0, borderRight: '1px solid var(--border)' }}>
        <span
          style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {row.name}
        </span>
      </div>
      {/* Weekend shading sits behind the bars, one cell per generated column. */}
      <div style={{ gridColumn: `2 / span ${RANGE_DAYS}`, position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${RANGE_DAYS}, minmax(0,1fr))` }}>
        {COLUMNS.map((d, i) => (
          <span
            key={i}
            aria-hidden
            style={{
              gridColumn: `${i + 1} / span 1`,
              gridRow: 1,
              borderRight: i < RANGE_DAYS - 1 ? '1px solid var(--border)' : 'none',
              background: isWeekend(d) ? 'var(--card2)' : 'transparent',
            }}
          />
        ))}
        <div style={{ gridColumn: `1 / span ${RANGE_DAYS}`, gridRow: 1, display: 'grid', gridTemplateColumns: `repeat(${RANGE_DAYS}, minmax(0,1fr))` }}>
          {row.bars.map((b, i) => (
            <BarView key={i} bar={b} selected={b.id ? b.id === selectedEventId : false} {...(b.id && onSelectEvent ? { onClick: () => onSelectEvent(b.id!) } : {})} />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * **Calendar Workspace** — spec-derived (`Calendar.md` v3.2, Build Locked).
 * No render in the reference set covers this screen.
 *
 * Three of the spec's corrections are structural here, not cosmetic:
 *  · §4.1 columns are **generated** from a range. The build the spec reviewed
 *    hand-listed them and rendered seven days as eight columns.
 *  · §4.2 every BS date comes from the **one** Date Engine (`lib/bs.ts`), and
 *    every date shows **both** calendars.
 *  · §4.3 one `today` per render — the marker and the summary cannot disagree.
 */
export default function Calendar() {
  const [view, setView] = useState<(typeof VIEWS)[number]>('Resource Timeline')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const todayBs = toBs(TODAY)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedEventId(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="calendar"
        title="Calendar"
        description="Resource timeline across equipment, crew, vehicles and warehouse bays."
        actions={
          <>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                height: 34,
                padding: '0 11px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
              }}
            >
              <Icon name="calendar" size={14} style={{ color: 'var(--muted)' }} />
              {/* §4.3 — the heading reads the same `today` as the marker below. */}
              <span style={{ lineHeight: 1.2, textAlign: 'left' }}>
                <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                  {todayBs ? formatBs(todayBs) : '—'}
                </span>
                <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                  {formatAd(TODAY)}
                </span>
              </span>
            </span>
            <Button icon="plus" variant="primary">
              New Booking
            </Button>
            <Button icon="queues">Saved Views</Button>
            <Button icon="download">Export</Button>
          </>
        }
      />

      <KpiStrip
        columns={4}
        items={[
          {
            label: 'Active Bookings',
            value: String(METRICS.activeBookings.value),
            icon: 'calendar',
            accent: 'primary',
            delta: {
              direction: METRICS.activeBookings.trend.includes('↑') ? 'up' : 'down',
              text: `${METRICS.activeBookings.trend}`,
              good: true
            },
            note: `Across all dates ${METRICS.activeBookings.trendLabel}`
          },
          {
            label: "Today's Operations",
            value: String(METRICS.operations.value),
            icon: 'file',
            accent: 'primary',
            note: METRICS.operations.label
          },
          {
            label: 'Equipment Utilization',
            value: String(METRICS.utilization.value),
            icon: 'chart',
            accent: 'purple',
            note: `This month · ${METRICS.utilization.label}`
          },
          {
            label: 'Schedule Conflicts',
            value: String(METRICS.conflicts.value),
            icon: 'alert_triangle',
            accent: 'danger',
            note: METRICS.conflicts.label
          }
        ]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 280px', gap: 'var(--sp-md)', alignItems: 'start' }}>
        {/* Left Panel: Filters */}
        <Card bodyStyle={{ padding: '20px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700 }}>Filters</div>
            <button style={{ background: 'none', border: 'none', color: 'var(--link)', fontSize: 'var(--t-meta)', cursor: 'pointer', padding: 0 }}>Clear All</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {FILTERS.map((f) => (
              <div key={f}>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 6 }}>{f}</div>
                <button
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    height: 36,
                    padding: '0 12px',
                    borderRadius: 'var(--r-input)',
                    border: '1px solid var(--border)',
                    background: 'var(--card2)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-meta)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  All
                  <Icon name="chevron_down" size={14} style={{ color: 'var(--muted)' }} />
                </button>
              </div>
            ))}
          </div>
        </Card>

        {/* Center Main Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 10, background: 'var(--card2)', border: '1px solid var(--border)' }}>
              {VIEWS.map((v) => {
                const on = view === v
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    aria-pressed={on}
                    style={{
                      height: 28,
                      padding: '0 11px',
                      borderRadius: 7,
                      border: 'none',
                      background: on ? 'var(--card)' : 'transparent',
                      color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                      fontSize: 'var(--t-meta)',
                      fontWeight: on ? 600 : 500,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: on ? 'var(--shadow-card)' : 'none',
                    }}
                  >
                    {v}
                  </button>
                )
              })}
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
               <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Row Type</span>
               <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 28, padding: '0 10px', borderRadius: 'var(--r-input)', border: '1px solid var(--border)', background: 'var(--card2)', fontSize: 'var(--t-meta)' }}>
                 Equipment <Icon name="chevron_down" size={12} style={{ color: 'var(--muted)' }} />
               </button>
            </div>
          </div>

          {view !== 'Resource Timeline' ? (
            <div style={{ ...cardStyle, padding: '40px 24px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 'var(--t-ui)', color: 'var(--text2)' }}>
                The <strong style={{ color: 'var(--text)' }}>{view}</strong> view is not built yet. The spec details it in
                §3; Resource Timeline is the default and was built first.
              </p>
            </div>
          ) : (
            <Card bodyStyle={{ padding: 0 }}>
              {/* §4.1 — one column per generated day; §4.2 — both calendars in every header. */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `210px repeat(${RANGE_DAYS}, minmax(0,1fr))`,
                  background: 'var(--th-bg)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ padding: '9px 10px', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', borderRight: '1px solid var(--border)' }}>
                  Equipment
                </div>
                {COLUMNS.map((d, i) => {
                  const bs = toBs(d)
                  const isToday = d.getTime() === TODAY.getTime()
                  return (
                    <div
                      key={i}
                      aria-current={isToday ? 'date' : undefined}
                      style={{
                        padding: '7px 6px',
                        textAlign: 'center',
                        borderRight: i < RANGE_DAYS - 1 ? '1px solid var(--border)' : 'none',
                        background: isToday ? 'var(--nav-active-bg)' : isWeekend(d) ? 'var(--card2)' : 'transparent',
                      }}
                    >
                      <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: isToday ? 'var(--nav-active-accent)' : 'var(--text)' }}>
                        {bs ? `${bs.day} Shrawan` : '—'}
                      </span>
                      {/* --muted drops to 4.38:1 on the today-column tint, so the
                          highlighted column steps up to --text2. */}
                      <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: isToday ? 'var(--text2)' : 'var(--muted)' }}>
                        {formatAd(d)}
                      </span>
                      <span
                        style={{ display: 'block', fontSize: 'var(--t-meta)', color: isToday ? 'var(--text2)' : (isWeekend(d) ? 'var(--danger-text)' : 'var(--muted)'), letterSpacing: '0.05em' }}
                      >
                        {d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).toUpperCase()}
                      </span>
                    </div>
                  )
                })}
              </div>

              {ROW_TYPES.map((type) => {
                const rows = ROWS.filter((r) => r.type === type)
                if (!rows.length) return null
                return (
                  <div key={type}>
                    {rows.map((r) => (
                      <ResourceRowView key={r.name} row={r} selectedEventId={selectedEventId} onSelectEvent={setSelectedEventId} />
                    ))}
                  </div>
                )
              })}

              {/* §6.3 — every bar type in the legend. The reviewed build ended in "More". */}
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  padding: '10px 12px',
                  borderTop: '1px solid var(--border)',
                }}
              >
                {(Object.keys(BAR_STYLE) as Array<keyof typeof BAR_STYLE>).map((k) => {
                  const s = BAR_STYLE[k]
                  return (
                    <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                      <span
                        aria-hidden
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          background: s.outline ? 'transparent' : s.bg,
                          border: s.outline ? `1.5px dashed ${s.fg}` : `1px solid ${s.fg}`,
                        }}
                      />
                      {k}
                    </span>
                  )
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Right Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
          {selectedEventId === SELECTED_EVENT.id ? (
            <Card bodyStyle={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Selected Event Panel */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginBottom: 4 }}>{SELECTED_EVENT.bookingId}</div>
                  <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700 }}>{SELECTED_EVENT.project}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <span style={{ fontSize: 'var(--t-meta)', padding: '2px 6px', background: 'var(--st-in-bg)', color: 'var(--st-in-fg)', borderRadius: 4, fontWeight: 600 }}>{SELECTED_EVENT.status}</span>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedEventId(null)} 
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', padding: 4 }}
                  title="Close (Esc)"
                >
                  <Icon name="close" size={16} />
                </button>
              </div>

              <div style={{ padding: '12px', background: 'var(--card2)', borderRadius: 'var(--r-card)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, marginBottom: 8 }}>Equipment</div>
                {SELECTED_EVENT.equipment.map((e, i) => (
                  <div key={i} style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                    {e.name} <span style={{ color: 'var(--muted)' }}>· {e.serial}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', marginBottom: 2 }}>Handover Session</div>
                  <div style={{ fontSize: 'var(--t-meta)' }}>{SELECTED_EVENT.handoverSession.date}</div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{SELECTED_EVENT.handoverSession.bs}</div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', marginBottom: 2 }}>Pickup</div>
                  <div style={{ fontSize: 'var(--t-meta)' }}>{SELECTED_EVENT.pickup}</div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{SELECTED_EVENT.pickupBs}</div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', marginBottom: 2 }}>Return</div>
                  <div style={{ fontSize: 'var(--t-meta)' }}>{SELECTED_EVENT.return}</div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{SELECTED_EVENT.returnBs}</div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', marginBottom: 2 }}>Return Session</div>
                  <div style={{ fontSize: 'var(--t-meta)' }}>{SELECTED_EVENT.returnSession.date}</div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{SELECTED_EVENT.returnSession.bs}</div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                 <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>Assignments</div>
                 <div style={{ fontSize: 'var(--t-meta)', marginBottom: 4 }}>Crew: {SELECTED_EVENT.crew.map(c => c.name).join(', ')}</div>
                 <div style={{ fontSize: 'var(--t-meta)' }}>Vehicle: {SELECTED_EVENT.vehicle}</div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                 <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>Notes</div>
                 <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{SELECTED_EVENT.notes}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <Button variant="primary">Edit Booking</Button>
                <Button>More Actions</Button>
              </div>
            </Card>
          ) : (
            <>
              <Card bodyStyle={{ padding: '20px 16px' }}>
                <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, marginBottom: 16 }}>{todayBs ? `${BS_MONTHS[todayBs.month - 1]} ${todayBs.year} BS` : 'Calendar'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', fontSize: 'var(--t-meta)', color: 'var(--muted)', marginBottom: 8 }}>
                  <div>SUN</div><div>MON</div><div>TUE</div><div>WED</div><div>THU</div><div>FRI</div><div style={{ color: 'var(--danger-text)' }}>SAT</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px 0', textAlign: 'center', fontSize: 'var(--t-meta)' }}>
                  {Array.from({length: 31}, (_, i) => (
                     <div key={i} style={{ padding: '4px 0', borderRadius: 16, background: (i+1 === 11) ? 'var(--blue)' : 'transparent', color: (i+1 === 11) ? '#fff' : 'var(--text)' }}>
                       {i+1}
                     </div>
                  ))}
                </div>
              </Card>
              <Card bodyStyle={{ padding: '20px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700 }}>Festivals & Holidays</div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--link)' }}>Manage</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 'var(--t-meta)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text2)' }}>13-15 Shrawan</span>
                    <span style={{ color: 'var(--text)' }}>Dashain</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text2)' }}>24 Shrawan</span>
                    <span style={{ color: 'var(--text)' }}>Buddha Jayanti</span>
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      <div
        style={{
          ...cardStyle,
          display: 'flex',
          gap: 20,
          flexWrap: 'wrap',
          alignItems: 'center',
          padding: '11px 14px',
        }}
      >
        {[
          { l: "Today's Summary", v: STATUS_BAR.summary },
          { l: 'Conflicts', v: STATUS_BAR.conflicts, tone: 'var(--danger-text)' },
          { l: 'Utilization', v: STATUS_BAR.utilization, note: STATUS_BAR.utilizationNote },
          { l: 'Upcoming', v: STATUS_BAR.upcoming },
        ].map((x) => (
          <span key={x.l} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{x.l}</span>
            <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: x.tone ?? 'var(--text)' }}>
              {x.v}
            </span>
            {x.note && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>({x.note})</span>}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {/* §8.2 — no Delete. Bookings are cancelled, never deleted. */}
          {BULK_ACTIONS.map((a) => (
            <Button key={a}>{a}</Button>
          ))}
        </span>
      </div>

      <FooterNote extra={['Bookings are cancelled, never deleted']} />
    </div>
  )
}
