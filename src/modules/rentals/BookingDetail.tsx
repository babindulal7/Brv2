import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, Rail, SummaryRows, FooterNote, cardStyle } from '../../components/ui/Page'
import { STATUS, BRAND_TEXT } from '../../lib/status'
import { statusToken } from '../../lib/workflow'
import {
  BOOKING,
  SUMMARY,
  ITEMS,
  ITEM_TALLY,
  EQUIPMENT_SUBTOTAL,
  OPERATIONS,
  CREW,
  CREW_SUBTOTAL,
  TRANSPORT,
  CHARGES,
  TOTALS,
  RENTAL_TOTAL,
  DEPOSIT_LEDGER,
  RENTAL_PAYMENTS,
  PAYMENT_HISTORY,
  DOCUMENTS,
  REVIEW,
  NOTES,
  NOTES_BY,
  NOTES_AT,
  ALERTS,
  TIMELINE,
} from '../../data/booking'

/** Bundle / Required / count marker beside an item name. */
function ItemBadge({ text, kind }: { text: string; kind: 'bundle' | 'required' | 'count' }) {
  const skin =
    kind === 'bundle'
      ? { background: 'var(--st-progress-bg)', color: 'var(--st-progress-fg)' }
      : kind === 'required'
        ? { background: 'var(--st-primary-bg)', color: 'var(--st-primary-fg)' }
        : { background: 'var(--card2)', color: 'var(--text2)' }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 16,
        padding: '0 5px',
        borderRadius: 4,
        fontSize: 'var(--t-meta)',
        fontWeight: 700,
        flexShrink: 0,
        ...skin,
      }}
    >
      {text}
    </span>
  )
}

/**
 * Operations menu — Booking Workflow §4.
 *
 * §4.2: each entry is enabled only at specific stages, and **disabled entries
 * stay visible and greyed with the reason on hover and focus** rather than
 * being hidden. §4.3: they open full-screen routes, never modals.
 */
function OperationsMenu({ primary, bookingNo }: { primary: boolean; bookingNo: string }) {
  const [open, setOpen] = useState(false)
  const stage = BOOKING.status
  return (
    <span style={{ position: 'relative' }}>
      <Button icon="chevron_down" variant={primary ? 'primary' : 'secondary'} onClick={() => setOpen((o) => !o)}>
        Operations
      </Button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            top: 40,
            minWidth: 232,
            padding: 6,
            borderRadius: 'var(--r-btn)',
            background: 'var(--dropdown)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-modal)',
            zIndex: 30,
          }}
        >
          {OPERATIONS.map((o) => {
            const enabled = o.enabledAt.includes(stage)
            const why = `Available at ${o.enabledAt.join(' or ')} — this booking is ${stage}`
            const row = (
              <>
                <Icon name={o.icon} size={15} style={{ color: enabled ? 'var(--text2)' : 'var(--disabled)' }} />
                <span style={{ flex: 1 }}>{o.label}</span>
                {!enabled && <Icon name="close" size={12} style={{ color: 'var(--disabled)' }} />}
              </>
            )
            const style = {
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              width: '100%',
              height: 34,
              padding: '0 9px',
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              color: enabled ? 'var(--text)' : 'var(--muted)',
              fontSize: 'var(--t-meta)',
              fontFamily: 'inherit',
              textAlign: 'left' as const,
              textDecoration: 'none',
              cursor: enabled ? 'pointer' : 'not-allowed',
            }
            return enabled ? (
              <Link
                key={o.label}
                to={`/rentals/${bookingNo}/${o.path}`}
                role="menuitem"
                style={style}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-card)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {row}
              </Link>
            ) : (
              <span key={o.label} role="menuitem" aria-disabled title={why} tabIndex={0} style={style}>
                {row}
              </span>
            )
          })}
        </div>
      )}
    </span>
  )
}

/** Numbered block header — the render splits the page into five of these. */
function Block({ no, title, children, action }: { no: string; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section style={{ ...cardStyle, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <span
          className="figure"
          aria-hidden
          style={{
            width: 20,
            height: 20,
            borderRadius: 5,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--btn-primary-bg)',
            color: 'var(--btn-primary-fg)',
            fontSize: 'var(--t-meta)',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {no}
        </span>
        <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
        {action && <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>{action}</span>}
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </section>
  )
}

const th = {
  textAlign: 'left' as const,
  padding: '8px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
const td = { padding: '9px 10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }

/**
 * Booking Detail — built from render `05AFD275`.
 *
 * The header strip carries the money figures because Foundation keeps deposit
 * and rental separate: a deposit is a **liability**, never part of Rental Total
 * or Outstanding. The two columns in the summary card stay separate for that
 * reason and must not be summed into one "balance".
 */
export default function BookingDetail() {
  /*
   * The route is `/rentals/:bookingNo` and this screen ignored it — every
   * booking link in the app opened BK-2026-0715's data under BK-2026-0715's
   * title, so a list of 120 rentals had one destination. Until the repository
   * layer exists there is still only one seeded record, but the *identity*
   * shown now comes from the URL, so a wrong link is visible as a mismatch
   * rather than silently serving the wrong booking's money.
   */
  const { bookingNo } = useParams()
  const id = bookingNo ?? BOOKING.no
  const isSeeded = id === BOOKING.no
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {!isSeeded && (
        <p
          role="status"
          style={{
            margin: 0,
            padding: '9px 12px',
            borderRadius: 'var(--r-btn)',
            background: 'var(--st-progress-bg)',
            color: 'var(--st-progress-fg)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
          }}
        >
          Showing the seeded record for {BOOKING.no}. Only that booking exists until the repository layer lands —
          this is stated rather than silently serving another booking&apos;s money.
        </p>
      )}

      <PageHeader
        title={id}
        description={`${BOOKING.client} · ${BOOKING.kind} · ${BOOKING.place}`}
        actions={
          <>
            {/*
              §4.1 — the primary action is stage-driven, and there is only ever
              one. At Quote it is Send Quote; at Draft, Confirm Booking; at
              stages 2–9 **Operations is the primary** and Confirm is gone.
            */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 30,
                padding: '0 10px',
                borderRadius: 'var(--r-badge)',
                background: STATUS[statusToken(BOOKING.status)].bg,
                color: STATUS[statusToken(BOOKING.status)].fg,
                fontSize: 'var(--t-meta)',
                fontWeight: 700,
              }}
            >
              {BOOKING.status}
            </span>
            <Button>Save Draft</Button>
            {BOOKING.status === 'Quote' && <Button icon="arrow_right" variant="primary">Send Quote</Button>}
            {/* §1.4 — the retired `Draft` is now status Quote carrying a Draft flag. */}
            {BOOKING.flags.includes('Draft') && <Button icon="plus" variant="primary">Confirm Booking</Button>}
            <OperationsMenu primary={!['Quote', 'Closed'].includes(BOOKING.status)} bookingNo={id} />
          </>
        }
      />

      {/* Facts strip — schedule on the left, money on the right. */}
      <div
        style={{
          ...cardStyle,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0,1fr)) minmax(0,1.1fr)',
          alignItems: 'stretch',
        }}
      >
        <Fact icon="users" label="Client">
          <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{BOOKING.client}</span>
          {BOOKING.vip && (
            <span
              style={{
                marginLeft: 6,
                display: 'inline-flex',
                alignItems: 'center',
                height: 17,
                padding: '0 6px',
                borderRadius: 4,
                background: 'var(--st-progress-bg)',
                color: 'var(--st-progress-fg)',
                fontSize: 'var(--t-meta)',
                fontWeight: 700,
              }}
            >
              VIP
            </span>
          )}
        </Fact>

        {[
          { label: 'Pickup', d: BOOKING.pickup },
          { label: 'Return', d: BOOKING.ret },
        ].map((m) => (
          <Fact key={m.label} icon="calendar" label={m.label}>
            <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
              {m.d.ad}
            </span>
            <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              {m.d.time}
            </span>
            <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{m.d.bs}</span>
          </Fact>
        ))}

        <Fact icon="timer" label="Rental Days">
          <span className="figure" style={{ fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)' }}>
            {BOOKING.days}
          </span>
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginLeft: 5 }}>Days</span>
          <span style={{ display: 'block', marginTop: 6 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 21,
                padding: '0 9px',
                borderRadius: 'var(--r-badge)',
                background: STATUS.primary.bg,
                color: STATUS.primary.fg,
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
              }}
            >
              {BOOKING.status}
            </span>
          </span>
        </Fact>

        <div style={{ padding: '14px 16px', borderRadius: '0 var(--r-card) var(--r-card) 0' }}>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Outstanding</div>
          <div className="figure" style={{ fontSize: 'var(--t-h2)', fontWeight: 700, color: 'var(--danger-text)', letterSpacing: '-0.02em' }}>
            {BOOKING.outstanding}
          </div>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 6 }}>
            Deposit Pending{' '}
            <span className="figure" style={{ color: 'var(--progress-text)', fontWeight: 600 }}>
              {BOOKING.depositPending}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <Block no="1" title="Client & Schedule" action={<Icon name="chevron_down" size={16} style={{ color: 'var(--muted)' }} />}>
            <SummaryRows
              rows={[
                { label: 'Client', value: BOOKING.client },
                { label: 'Project Type', value: BOOKING.kind },
                { label: 'Location', value: BOOKING.place },
                { label: 'Rental Days', value: `${BOOKING.days} Days` },
              ]}
            />
          </Block>

          <Block
            no="2"
            title="Equipment, Bundles & Services"
            action={
              <>
                <Button icon="search">Search</Button>
                <Button icon="queues">Filters</Button>
                <Button icon="plus" variant="primary">
                  Add Item
                </Button>
              </>
            }
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    {['Item / Accessory', 'Serial / ID', 'Qty', 'Status', 'Availability', 'Location', 'Rate / Day', 'Total', ''].map(
                      (h, i) => (
                        <th key={h || i} style={{ ...th, textAlign: i === 2 || i >= 6 ? 'right' : 'left' }}>
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {ITEMS.map((it, i) => (
                    <tr key={`${it.name}-${i}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...td, paddingLeft: 10 + it.depth * 18 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {/* Depth is shown by a disclosure caret plus indent, not indent alone. */}
                          <Icon
                            name={it.depth === 2 ? 'dot' : 'chevron_down'}
                            size={it.depth === 2 ? 8 : 13}
                            style={{ color: 'var(--muted)', flexShrink: 0 }}
                          />
                          <span style={{ fontWeight: it.depth === 0 ? 700 : it.depth === 1 ? 600 : 500 }}>{it.name}</span>
                          {it.badge && <ItemBadge {...it.badge} />}
                        </span>
                        {it.serial && it.depth === 0 && (
                          <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2, paddingLeft: 19 }}>
                            {it.serial}
                          </span>
                        )}
                      </td>
                      <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                        {it.depth === 0 ? '' : (it.serial ?? '')}
                      </td>
                      <td className="figure" style={{ ...td, textAlign: 'right' }}>{it.qty}</td>
                      <td style={td}>
                        {it.packed && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 'var(--t-meta)',
                              fontWeight: 600,
                              color: it.packed === 'Packed' ? 'var(--success-text)' : 'var(--progress-text)',
                            }}
                          >
                            <Icon name={it.packed === 'Packed' ? 'dot' : 'alert_triangle'} size={11} />
                            {it.packed}
                          </span>
                        )}
                      </td>
                      <td style={td}>
                        {it.availability && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              height: 19,
                              padding: '0 7px',
                              borderRadius: 5,
                              fontSize: 'var(--t-meta)',
                              fontWeight: 600,
                              background:
                                it.availability.key === 'in'
                                  ? 'var(--st-in-bg)'
                                  : it.availability.key === 'primary'
                                    ? 'var(--st-primary-bg)'
                                    : 'var(--st-danger-bg)',
                              color:
                                it.availability.key === 'in'
                                  ? 'var(--st-in-fg)'
                                  : it.availability.key === 'primary'
                                    ? 'var(--st-primary-fg)'
                                    : 'var(--st-danger-fg)',
                            }}
                          >
                            {it.availability.text}
                          </span>
                        )}
                      </td>
                      <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{it.location ?? ''}</td>
                      <td className="figure" style={{ ...td, textAlign: 'right' }}>
                        {it.wasRate && (
                          <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', textDecoration: 'line-through' }}>
                            {it.wasRate}
                          </span>
                        )}
                        {it.rate ?? ''}
                      </td>
                      <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{it.total ?? ''}</td>
                      <td style={{ ...td, width: 26, color: 'var(--muted)' }}>
                        <Icon name="more_vert" size={14} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Roll-up. Zero counts stay visible — "0 Missing" is the reassurance. */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                flexWrap: 'wrap',
                marginTop: 10,
                paddingTop: 10,
                borderTop: '1px solid var(--border)',
                fontSize: 'var(--t-meta)',
              }}
            >
              {ITEM_TALLY.map((t) => (
                <span key={t.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span className="figure" style={{ fontWeight: 700, color: BRAND_TEXT[t.tone] }}>
                    {t.value}
                  </span>
                  <span style={{ color: 'var(--text2)' }}>{t.label}</span>
                </span>
              ))}
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <span style={{ color: 'var(--text2)' }}>Equipment Subtotal</span>
                <span className="figure" style={{ fontWeight: 700, color: 'var(--text)' }}>
                  {EQUIPMENT_SUBTOTAL}
                </span>
              </span>
            </div>
          </Block>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
            <Block no="3" title="Crew & Transport" action={<Button icon="plus">Add Member</Button>}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    {['Name', 'Role', 'Day Rate', 'Days', 'Amount (Rs)'].map((h, i) => (
                      <th key={h} style={{ ...th, textAlign: i >= 2 ? 'right' : 'left' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CREW.map((c) => (
                    <tr key={c.name} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={td}>{c.name}</td>
                      <td style={{ ...td, color: 'var(--text2)' }}>{c.role}</td>
                      <td className="figure" style={{ ...td, textAlign: 'right' }}>{c.rate}</td>
                      <td className="figure" style={{ ...td, textAlign: 'right' }}>{c.days}</td>
                      <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{c.amount}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4} style={{ ...td, fontWeight: 600, color: 'var(--text2)' }}>
                      Crew Subtotal
                    </td>
                    <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                      {CREW_SUBTOTAL}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Block>

            <Card title="Transport & Delivery" action={<Button variant="ghost">Edit</Button>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {TRANSPORT.map((t) => (
                  <div key={t.label} style={{ display: 'flex', gap: 10, fontSize: 'var(--t-meta)', alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--text2)', flex: 1, minWidth: 0 }}>{t.label}</span>
                    {t.pill ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          height: 20,
                          padding: '0 8px',
                          borderRadius: 'var(--r-badge)',
                          background: STATUS.in.bg,
                          color: STATUS.in.fg,
                          fontSize: 'var(--t-meta)',
                          fontWeight: 600,
                        }}
                      >
                        {t.value}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text)', textAlign: 'right', maxWidth: 170 }}>{t.value}</span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Block no="4" title="Pricing & Payments">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
              <div>
                <h3 style={sub}>Rental Charges</h3>
                {CHARGES.map((c) => (
                  <div key={c.label} style={{ display: 'flex', gap: 8, padding: '6px 0', fontSize: 'var(--t-meta)' }}>
                    <span style={{ color: 'var(--text2)', flex: 1, minWidth: 0 }}>{c.label}</span>
                    <span className="figure" style={{ fontWeight: 600 }}>{c.amount}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
                  {TOTALS.map((t) => (
                    <div key={t.label} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 'var(--t-meta)' }}>
                      <span style={{ color: 'var(--text2)', flex: 1 }}>{t.label}</span>
                      <span className="figure" style={{ fontWeight: 600, color: t.tone ? BRAND_TEXT[t.tone] : 'var(--text)' }}>
                        {t.value}
                      </span>
                    </div>
                  ))}
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      marginTop: 6,
                      paddingTop: 8,
                      borderTop: '1px solid var(--border)',
                      fontSize: 'var(--t-ui)',
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ flex: 1 }}>Rental Total</span>
                    <span className="figure">{RENTAL_TOTAL}</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 style={sub}>Deposit</h3>
                <SummaryRows rows={DEPOSIT_LEDGER} />
                <h3 style={{ ...sub, marginTop: 16 }}>Payments (Rental Only)</h3>
                <SummaryRows rows={RENTAL_PAYMENTS} />
              </div>

              <div>
                <h3 style={sub}>Payment History (Rental)</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Date', 'Type', 'Amount', 'Method', 'Status'].map((h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PAYMENT_HISTORY.map((p) => (
                      <tr key={p.type} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)' }}>{p.date}</td>
                        <td style={{ ...td, fontSize: 'var(--t-meta)' }}>{p.type}</td>
                        <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)' }}>{p.amount}</td>
                        <td style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{p.method}</td>
                        <td style={{ ...td, fontSize: 'var(--t-meta)' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              height: 19,
                              alignItems: 'center',
                              padding: '0 7px',
                              borderRadius: 5,
                              background: STATUS.in.bg,
                              color: STATUS.in.fg,
                              fontSize: 'var(--t-meta)',
                              fontWeight: 600,
                            }}
                          >
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 10 }}>
                  <Button icon="dollar" variant="primary">
                    Record Payment
                  </Button>
                </div>
              </div>
            </div>
          </Block>

          <Block no="5" title="Documents & Review">
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,0.8fr) minmax(0,1fr)', gap: 'var(--sp-md)' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {DOCUMENTS.map((d) => (
                  <div
                    key={d.name}
                    style={{
                      width: 96,
                      padding: '11px 9px',
                      borderRadius: 'var(--r-btn)',
                      border: '1px solid var(--border)',
                      background: 'var(--card2)',
                      textAlign: 'center',
                    }}
                  >
                    <Icon
                      name="file"
                      size={19}
                      style={{ color: d.ready ? 'var(--link)' : 'var(--disabled)' }}
                    />
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginTop: 6, lineHeight: 1.25 }}>
                      {d.name}
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>{d.kind}</div>
                  </div>
                ))}
                <button
                  type="button"
                  style={{
                    width: 96,
                    padding: '11px 9px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px dashed var(--border)',
                    background: 'transparent',
                    color: 'var(--link)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <Icon name="plus" size={17} />
                  <div style={{ marginTop: 6 }}>Add Document</div>
                </button>
              </div>

              <div>
                <h3 style={sub}>Review Summary</h3>
                {REVIEW.map((r) => (
                  <div key={r.label} style={{ display: 'flex', gap: 8, padding: '5px 0', fontSize: 'var(--t-meta)', alignItems: 'center' }}>
                    <Icon
                      name={r.ok ? 'dot' : 'alert_triangle'}
                      size={12}
                      style={{ color: r.ok ? 'var(--success-text)' : 'var(--progress-text)', flexShrink: 0 }}
                    />
                    <span style={{ color: 'var(--text2)', flex: 1, minWidth: 0 }}>{r.label}</span>
                    <span style={{ color: r.ok ? 'var(--text)' : 'var(--progress-text)', fontWeight: 600 }}>{r.value}</span>
                  </div>
                ))}
              </div>

              <div>
                <h3 style={sub}>Notes</h3>
                <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>{NOTES}</p>
                <p style={{ margin: '8px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                  {NOTES_BY}
                  <br />
                  {NOTES_AT}
                </p>
              </div>
            </div>
          </Block>
        </div>

        <Rail>
          <Card title="Booking Summary">
            <SummaryRows rows={SUMMARY} />
            <div style={{ marginTop: 12 }}>
              <Button icon="dollar" variant="primary">
                Receive Payment
              </Button>
            </div>
          </Card>

          <Card title="Quick Actions">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {(['Print', 'Share', 'More'] as const).map((a, i) => (
                <button
                  key={a}
                  type="button"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    padding: '12px 4px',
                    borderRadius: 'var(--r-btn)',
                    border: '1px solid var(--border)',
                    background: 'var(--card2)',
                    color: 'var(--text)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <Icon name={i === 0 ? 'file' : i === 1 ? 'arrow_right' : 'more_vert'} size={17} style={{ color: 'var(--text2)' }} />
                  {a}
                </button>
              ))}
            </div>
          </Card>

          <Card title={`Alerts (${ALERTS.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ALERTS.map((a) => (
                <div
                  key={a.text}
                  style={{
                    padding: 10,
                    borderRadius: 'var(--r-btn)',
                    background: a.tone === 'danger' ? 'var(--st-danger-bg)' : 'var(--st-progress-bg)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 7, fontSize: 'var(--t-meta)', alignItems: 'flex-start' }}>
                    <Icon
                      name="alert_triangle"
                      size={13}
                      style={{ color: a.tone === 'danger' ? 'var(--st-danger-fg)' : 'var(--st-progress-fg)', flexShrink: 0, marginTop: 1 }}
                    />
                    <span style={{ color: a.tone === 'danger' ? 'var(--st-danger-fg)' : 'var(--st-progress-fg)', fontWeight: 500 }}>
                      {a.text}
                    </span>
                  </div>
                  <div style={{ marginTop: 7 }}>
                    <Button>{a.action}</Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Activity Timeline">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {TIMELINE.map((t) => (
                <div key={t.what} style={{ display: 'flex', gap: 9 }}>
                  <span
                    aria-hidden
                    style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--link)', flexShrink: 0, marginTop: 4 }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                      {t.at}
                    </span>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginTop: 1 }}>
                      {t.what}
                    </span>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{t.who}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </Rail>
      </div>

      <FooterNote extra={['Deposits are liabilities and never offset Rental Outstanding']} />
    </div>
  )
}

function Fact({ icon, label, children }: { icon: 'users' | 'calendar' | 'timer'; label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '14px 16px', borderRight: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 6 }}>
        <Icon name={icon} size={14} style={{ color: 'var(--muted)' }} />
        {label}
      </div>
      <div>{children}</div>
    </div>
  )
}

const sub = {
  margin: '0 0 8px',
  fontSize: 'var(--t-meta)',
  fontWeight: 700,
  color: 'var(--text)',
} as const
