import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, FooterNote, cardStyle } from '../../components/ui/Page'
import Placeholder from '../Placeholder'
import { STATUS, BRAND } from '../../lib/status'
import type { StatusKey, BrandKey } from '../../lib/status'
import { KPIS, CHIPS, VIEWS, FILTER_GROUPS, ROWS, FOUND, SHOWING } from '../../data/rentals'
import type { RentalRow } from '../../data/rentals'

/**
 * §5.1 declares three tabs on Rentals: Bookings · Productions · Sub-Rental.
 * Only Bookings existed — the screen simply had no tab bar, so Productions and
 * Sub-Rental were unreachable rather than merely unbuilt. `Placeholder` says so
 * honestly instead of a convincing-looking empty table.
 */
const RENTAL_TABS = ['Bookings', 'Productions', 'Sub-Rental'] as const

function Tag({ text, status }: { text: string; status: StatusKey }) {
  const c = STATUS[status]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 18,
        padding: '0 6px',
        borderRadius: 5,
        background: c.bg,
        color: c.fg,
        fontSize: 'var(--t-meta)',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  )
}

/**
 * Four-step pipeline indicator — Booked → Packed → On Rent → Returned.
 *
 * It is never the only signal: the status pill beside it names the state in
 * words, so the dots add glanceable progress without carrying meaning alone.
 */
function Track({ step, tone }: { step: number; tone: BrandKey }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 6 }} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', flex: i < 3 ? 1 : '0 0 auto' }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              flexShrink: 0,
              background: i < step ? BRAND[tone] : 'var(--disabled)',
            }}
          />
          {i < 3 && (
            <span
              style={{ flex: 1, height: 2, background: i < step - 1 ? BRAND[tone] : 'var(--disabled)', minWidth: 8 }}
            />
          )}
        </span>
      ))}
    </span>
  )
}

function Avatar({ row }: { row: RentalRow }) {
  return (
    <span
      aria-hidden
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        background: row.avatarBg,
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        lineHeight: 1.05,
        fontSize: 'var(--t-meta)',
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {/* One token — 12px is the §4.3.6 floor and two lines overflow the circle. */}
      <span>{row.avatar[0]}</span>
    </span>
  )
}

/**
 * Rentals List — built from render `77B52333`.
 *
 * The render is a Generation B shell; only its **page content** is ported. The
 * surrounding chrome is Generation C, which is the settled shell.
 */
import { EmptyState } from '../../components/ui/StateViews'

/**
 * Rentals List — Page Type: List.
 * Follows Phase 6 laws: List page, <=4 KPI cards, <=1 chart, single primary per row.
 */
export default function RentalsList() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<(typeof RENTAL_TABS)[number]>('Bookings')
  const [chip, setChip] = useState('Today')
  const [view, setView] = useState<(typeof VIEWS)[number]>('Table')

  // Dynamic filter based on selected chip
  const filteredRows = ROWS.filter((r) => {
    if (chip === 'Today') return true
    if (chip === 'Overdue') return r.tag?.status === 'danger' || r.flags.includes('Overdue')
    if (chip === 'Payment Due') return !r.payment?.settled || r.payment?.text.includes('Due')
    if (chip === 'On Rent') return r.status === 'On Rent'
    if (chip === 'Returning') return r.status === 'Returned' || r.flags.includes('Due Soon')
    if (chip === 'Completed') return r.status === 'Closed'
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        title="Rentals"
        description="Manage all bookings and their current status"
        actions={
          <>
            <Button icon="plus" variant="primary" onClick={() => navigate('/rentals/new')}>
              New Rental
            </Button>
            <Button icon="download" variant="secondary">Import</Button>
            <Button icon="download" variant="secondary">Export</Button>
          </>
        }
      />

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)' }}>
        {RENTAL_TABS.map((t) => {
          const on = tab === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-current={on ? 'page' : undefined}
              style={{
                height: 36,
                padding: '0 4px',
                marginBottom: -1,
                border: 'none',
                borderBottom: `2px solid ${on ? 'var(--nav-active-accent)' : 'transparent'}`,
                background: 'transparent',
                color: on ? 'var(--text)' : 'var(--text2)',
                fontSize: 'var(--t-ui)',
                fontWeight: on ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t}
            </button>
          )
        })}
      </div>

      {tab === 'Productions' && (
        <Placeholder title="Productions" />
      )}
      {tab === 'Sub-Rental' && (
        <Placeholder title="Sub-Rental" />
      )}
      {tab === 'Bookings' && (
        <>
      <KpiStrip items={KPIS} columns={6} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {CHIPS.map((c) => {
          const on = chip === c.label
          const tint = c.tone === 'danger' ? 'var(--danger-text)' : c.tone === 'progress' ? 'var(--progress-text)' : undefined
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => setChip(c.label)}
              aria-pressed={on}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                height: 32,
                padding: '0 12px',
                borderRadius: 8,
                border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                background: on ? 'var(--nav-active-bg)' : 'var(--card)',
                color: on ? 'var(--nav-active-accent)' : (tint ?? 'var(--text2)'),
                fontSize: 'var(--t-meta)',
                fontWeight: on || tint ? 600 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {c.label === 'Custom' && <Icon name="calendar" size={14} />}
              {c.label}
            </button>
          )
        })}

        <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, padding: 3, borderRadius: 10, background: 'var(--card2)', border: '1px solid var(--border)' }}>
          {VIEWS.map((v) => {
            const on = view === v
            return (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={on}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
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
                <Icon name={v === 'Table' ? 'checklist' : v === 'Cards' ? 'queues' : 'timer'} size={14} />
                {v}
              </button>
            )
          })}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '210px minmax(0,1fr)', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <Card
          title="Filters"
          action={
            <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }} aria-disabled title="Not built yet — see SCREENS.md for what is done">
              Clear all
            </span>
          }
          bodyStyle={{ padding: 8 }}
        >
          {FILTER_GROUPS.map((g) => (
            <button
              key={g.label}
              type="button"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                width: '100%',
                height: 34,
                padding: '0 8px',
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                color: 'var(--text2)',
                fontSize: 'var(--t-meta)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <Icon name={g.icon} size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: 'left' }}>{g.label}</span>
              <Icon name="chevron_down" size={13} style={{ color: 'var(--muted)' }} />
            </button>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
            <Button icon="flag">Save as new filter</Button>
          </div>
        </Card>

        <Card
          title={FOUND}
          action={
            <>
              <Button icon="queues">More Filters</Button>
              <Button icon="flag">Save View</Button>
            </>
          }
          bodyStyle={{ padding: 0 }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1040 }}>
              <thead>
                <tr style={{ background: 'var(--th-bg)' }}>
                  {['', 'Booking', 'Client / Project', 'Package / Items', 'Pickup', 'Return', 'Status', 'Payment', ''].map((h, i) => (
                    <th
                      key={h || `c${i}`}
                      style={{
                        textAlign: 'left',
                        padding: '9px 12px',
                        fontSize: 'var(--t-meta)',
                        fontWeight: 600,
                        color: 'var(--text2)',
                        whiteSpace: 'nowrap',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '24px 16px' }}>
                      <EmptyState
                        title="No bookings match this filter"
                        description={`No rentals found in "${chip}". Try switching to another quick filter.`}
                        actionLabel="Reset to Today"
                        onAction={() => setChip('Today')}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <tr key={r.bookingNo} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...td, width: 30 }}>
                        <input type="checkbox" aria-label={`Select ${r.bookingNo}`} />
                      </td>

                    <td style={td}>
                      {/* Booking Detail exists, so this is a real link. */}
                      <Link
                        to={`/rentals/${r.bookingNo}`}
                        className="identifier"
                        style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--link)', textDecoration: 'none' }}
                      >
                        {r.bookingNo}
                      </Link>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>{r.bookedOn}</div>
                      {r.tag && (
                        <div style={{ marginTop: 4 }}>
                          <Tag text={r.tag.text} status={r.tag.status} />
                        </div>
                      )}
                    </td>

                    <td style={td}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <Avatar row={r} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                            {r.client}
                          </span>
                          <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 1 }}>
                            {r.project}
                          </span>
                          <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 1 }}>
                            {r.location} · {r.crew}
                          </span>
                        </span>
                      </span>
                    </td>

                    <td style={td}>
                      <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{r.kit}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 3 }}>
                        <Icon name="box" size={12} />
                        {r.items}
                      </span>
                    </td>

                    {[r.pickup, r.ret].map((m, i) => (
                      <td key={i} style={td}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                          <Icon name="calendar" size={12} style={{ color: 'var(--muted)' }} />
                          {m.date}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 3 }}>
                          <Icon name="timer" size={12} style={{ color: 'var(--muted)' }} />
                          <span className="figure">{m.time}</span>
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 3 }}>
                          <Icon name="crew" size={12} style={{ color: 'var(--muted)' }} />
                          {m.who}
                        </span>
                      </td>
                    ))}

                    <td style={{ ...td, minWidth: 116 }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          height: 22,
                          padding: '0 9px',
                          borderRadius: 'var(--r-badge)',
                          background: STATUS[r.statusKey].bg,
                          color: STATUS[r.statusKey].fg,
                          fontSize: 'var(--t-meta)',
                          fontWeight: 600,
                        }}
                      >
                        {r.status === 'Returned' ? 'Completed' : r.status}
                      </span>
                      {/* The stage is one of Foundation's 12; anything else the
                          row needs to say — "Overdue", "Due today" — is a note. */}
                      {r.statusNote && (
                        <span
                          style={{
                            display: 'block',
                            marginTop: 4,
                            fontSize: 'var(--t-meta)',
                            fontWeight: 600,
                            color: r.progressTone === 'danger' ? 'var(--danger-text)' : 'var(--text2)',
                          }}
                        >
                          {r.statusNote}
                        </span>
                      )}
                      <Track step={r.progress} tone={r.progressTone} />
                    </td>

                    <td style={td}>
                      <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                        {r.amount}
                      </span>
                      {r.payment && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            height: 19,
                            padding: '0 7px',
                            borderRadius: 5,
                            marginTop: 4,
                            background: r.payment.settled ? 'var(--st-in-bg)' : 'var(--st-progress-bg)',
                            color: r.payment.settled ? 'var(--st-in-fg)' : 'var(--st-progress-fg)',
                            fontSize: 'var(--t-meta)',
                            fontWeight: 700,
                          }}
                        >
                          {r.payment.text}
                        </span>
                      )}
                      {r.deposit && (
                        <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 3 }}>{r.deposit}</span>
                      )}
                    </td>

                    <td style={{ ...td, width: 34 }}>
                      <button
                        type="button"
                        aria-label={`Actions for ${r.bookingNo}`}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--muted)',
                          cursor: 'pointer',
                          width: 26,
                          height: 26,
                          borderRadius: 6,
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Icon name="more_vert" size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            </table>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 14px',
              flexWrap: 'wrap',
              fontSize: 'var(--t-meta)',
              color: 'var(--text2)',
            }}
          >
            <span>{SHOWING}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
              {['‹', '1', '2', '3', '…', '6', '›'].map((p, i) => {
                const on = p === '1'
                return (
                  <button
                    key={`${p}-${i}`}
                    type="button"
                    aria-current={on ? 'page' : undefined}
                    style={{
                      minWidth: 26,
                      height: 26,
                      borderRadius: 7,
                      border: `1px solid ${on ? 'transparent' : 'var(--border)'}`,
                      background: on ? 'var(--btn-primary-bg)' : 'transparent',
                      color: on ? 'var(--btn-primary-fg)' : 'var(--text2)',
                      fontSize: 'var(--t-meta)',
                      fontWeight: on ? 700 : 500,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {p}
                  </button>
                )
              })}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              Rows per page
              <span
                className="figure"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  height: 28,
                  padding: '0 8px',
                  borderRadius: 7,
                  border: '1px solid var(--border)',
                }}
              >
                20
                <Icon name="chevron_down" size={12} style={{ color: 'var(--muted)' }} />
              </span>
            </span>
          </div>
        </Card>
      </div>

      {view !== 'Table' && (
        <div style={{ ...cardStyle, padding: '18px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          The <strong style={{ color: 'var(--text)' }}>{view}</strong> view is not built yet — the render only
          specifies the Table view in detail.
        </div>
      )}
        </>
      )}

      <FooterNote extra={['Cancelled bookings are retained, never deleted']} />
    </div>
  )
}

const td = {
  padding: '11px 12px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  verticalAlign: 'top' as const,
  whiteSpace: 'nowrap' as const,
}
