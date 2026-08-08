import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, Rail, FooterNote, cardStyle } from '../../components/ui/Page'
import { STATUS } from '../../lib/status'
import { statusToken } from '../../lib/workflow'
import type { BookingStatus } from '../../lib/workflow'
import { toBs, formatBs, formatAd } from '../../lib/bs'

/**
 * **New Rental — Booking Workspace**, built from render `6989CD12` and
 * `04 Operations/Booking Workflow.md` v2.3 (Build Locked).
 *
 * §2 / §3 / §19: **the five sections are not a wizard.** Any section may be
 * worked at any time, in any order. There is no Previous, no Next, and exactly
 * **one** primary action on the page. An earlier build of this screen was a
 * Back/Next stepper, which is the specific thing §0 corrects.
 *
 * §4.1 — at stage `Draft` the primary is `Confirm Booking` and Operations is
 * disabled. §5.1 — breadcrumb only, no Back button.
 */

const DAY = 86400000
/** §10.1 — round half up at each displayed step. Math.round is half-up for positives. */
const half = (n: number) => Math.round(n)
const rs = (n: number) => `Rs ${half(n).toLocaleString('en-IN')}`

const VAT_PCT = 13

interface Line {
  id: string
  name: string
  serial: string
  category: string
  qty: number
  rate: number
  /** §8.3 — Days is mandatory. A per-booking line stores 1 explicitly. */
  days: number
  discountPct: number
  location: string
  availability: 'Available' | 'Low Stock' | 'Conflict'
}

const CATALOGUE: Omit<Line, 'qty' | 'days' | 'discountPct'>[] = [
  { id: 'FX6', name: 'Sony FX6 Camera', serial: 'FX6-0123', category: 'Camera', rate: 6000, location: 'A2-01', availability: 'Available' },
  { id: 'SG24', name: 'Sigma 24-70mm f/2.8 DG DN', serial: 'SG2470-001', category: 'Lens', rate: 1500, location: 'C1-02', availability: 'Available' },
  { id: 'DR4D', name: 'DJI Ronin 4D', serial: 'DR4D-004', category: 'Gimbal', rate: 4500, location: 'B2-04', availability: 'Available' },
  { id: 'ATH', name: 'NISI Athena Prime Set', serial: 'ATH-0012', category: 'Lens', rate: 4000, location: 'C1-02', availability: 'Conflict' },
  { id: 'AP6', name: 'Aputure 600D Pro', serial: 'AP6-0201', category: 'Lighting', rate: 1700, location: 'C3-01', availability: 'Low Stock' },
]

interface Crew {
  id: string
  name: string
  role: string
  phone: string
  dayRate: number
  overtime: number
  accommodation: number
  meals: number
}

const CREW_POOL: Crew[] = [
  { id: 'c1', name: 'Bikash Thapa', role: 'Director', phone: '+977 9841 000 111', dayRate: 9000, overtime: 0, accommodation: 0, meals: 0 },
  { id: 'c2', name: 'Sagar Maharjan', role: 'DoP', phone: '+977 9841 000 222', dayRate: 9000, overtime: 0, accommodation: 0, meals: 0 },
  { id: 'c3', name: 'Ramesh Dulal', role: 'Camera Assistant', phone: '+977 9841 000 333', dayRate: 6000, overtime: 0, accommodation: 0, meals: 0 },
]

const SECTIONS = [
  'Client & Schedule',
  'Equipment, Bundles & Services',
  'Crew & Transport',
  'Pricing & Payments',
  'Documents & Review',
] as const

const inputStyle = {
  width: '100%',
  height: 32,
  padding: '0 9px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
  outline: 'none',
} as const

const th = { textAlign: 'left' as const, padding: '8px 9px', fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap' as const, borderBottom: '1px solid var(--border)' }
const td = { padding: '8px 9px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', marginBottom: 3 }}>{label}</span>
      {children}
    </label>
  )
}

/** Numbered, collapsible section. Equipment is expanded by default (§6). */
function Section({
  no,
  title,
  open,
  onToggle,
  action,
  children,
}: {
  no: number
  title: string
  open: boolean
  onToggle: () => void
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section style={{ ...cardStyle, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', borderBottom: open ? '1px solid var(--border)' : 'none' }}>
        <span
          className="figure"
          aria-hidden
          style={{ width: 20, height: 20, borderRadius: 5, display: 'grid', placeItems: 'center', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)', fontSize: 'var(--t-meta)', fontWeight: 700, flexShrink: 0 }}
        >
          {no}
        </span>
        <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
        {/* §6 — toolbars hide when the section is collapsed. */}
        {open && action && <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>{action}</span>}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
          style={{ marginLeft: open && action ? 0 : 'auto', width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
        >
          <Icon name={open ? 'chevron_up' : 'chevron_down'} size={15} />
        </button>
      </div>
      {open && <div style={{ padding: 13 }}>{children}</div>}
    </section>
  )
}

export default function NewRental() {
  const navigate = useNavigate()
  // §1.4 — the retired `Draft` stage is status Quote plus a Draft flag.
  const status: BookingStatus = 'Quote'
  const flag = 'Draft'

  // Any section, any order — all open by default except Client, which §6 says
  // collapses after confirmation (so it stays open on a Draft).
  const [open, setOpen] = useState<boolean[]>([true, true, true, true, true])
  const toggle = (i: number) => setOpen((p) => p.map((v, j) => (j === i ? !v : v)))

  const [client, setClient] = useState('Himalayan Films Pvt. Ltd.')
  const [project, setProject] = useState("'Echoes of Mustang'")
  const [kind, setKind] = useState('Documentary Film')
  const [govId, setGovId] = useState('PAN 601234567')
  const [pickup, setPickup] = useState('2026-07-16')
  const [ret, setRet] = useState('2026-07-19')
  const [deliveryType, setDeliveryType] = useState<'Customer Pickup' | 'Babin Delivery'>('Customer Pickup')

  const [lines, setLines] = useState<Line[]>([
    { ...(CATALOGUE[0] as Omit<Line, 'qty' | 'days' | 'discountPct'>), qty: 2, days: 3, discountPct: 5 },
    { ...(CATALOGUE[1] as Omit<Line, 'qty' | 'days' | 'discountPct'>), qty: 2, days: 3, discountPct: 5 },
    { ...(CATALOGUE[2] as Omit<Line, 'qty' | 'days' | 'discountPct'>), qty: 1, days: 3, discountPct: 5 },
  ])
  const [crew, setCrew] = useState<Crew[]>(CREW_POOL)
  const [deliveryCharge, setDeliveryCharge] = useState(0)
  const [fuelCharge, setFuelCharge] = useState(0)
  const [discountPct, setDiscountPct] = useState(7)
  const [discountReason, setDiscountReason] = useState('')
  const [approver, setApprover] = useState('')
  const [advance, setAdvance] = useState(15000)
  const depositRequired = 50000
  const depositReceived = 25000

  const days = useMemo(() => {
    const a = Date.parse(pickup)
    const b = Date.parse(ret)
    if (Number.isNaN(a) || Number.isNaN(b)) return 0
    return Math.max(0, Math.round((b - a) / DAY))
  }, [pickup, ret])

  /* ── §10.1 calculation order, in order. ────────────────────────────────── */
  const lineAmount = (l: Line) => half(l.qty * l.rate * l.days * (1 - l.discountPct / 100))
  const equipment = lines.reduce((s, l) => s + lineAmount(l), 0)
  const crewCharges = crew.reduce((s, c) => s + c.dayRate * days + c.overtime + c.accommodation + c.meals, 0)
  // §9.2 — Customer Pickup forces both transport charges to zero.
  const customerPickup = deliveryType === 'Customer Pickup'
  const transport = customerPickup ? 0 : deliveryCharge + fuelCharge
  const subtotal = equipment + crewCharges + transport
  const discount = half(subtotal * (discountPct / 100))
  const taxable = subtotal - discount
  const vat = half(taxable * (VAT_PCT / 100))
  const rentalTotal = taxable + vat
  /** §10.3 — deposits never reduce this. */
  const rentalOutstanding = rentalTotal - advance

  /** §10.4, as ruled: this is the *invoice* state, not a payment status. */
  const invoiceState = advance <= 0 ? 'Unpaid' : advance < rentalTotal ? 'Partially Paid' : 'Paid'

  /* ── §12 alerts. Critical blocks Confirm; Warning blocks Handover. ─────── */
  const conflictLines = lines.filter((l) => l.availability === 'Conflict')
  // §10.8 — above 10% needs a reason of at least 10 characters AND a named
  // approver. No bypass, including Owner.
  const discountUnapproved = discountPct > 10 && (discountReason.trim().length < 10 || approver.trim().length === 0)

  const alerts: Array<{ text: string; severity: 'Critical' | 'Warning' | 'Information'; action: string }> = [
    ...conflictLines.map((l) => ({ text: `Equipment conflict — ${l.name}`, severity: 'Critical' as const, action: 'Open Inventory' })),
    ...(govId.trim() ? [] : [{ text: 'Missing client ID or PAN', severity: 'Critical' as const, action: 'Edit Client' }]),
    ...(discountUnapproved ? [{ text: 'Discount above 10% unapproved', severity: 'Critical' as const, action: 'Request Approval' }] : []),
    ...(lines.some((l) => l.availability === 'Low Stock') ? [{ text: 'Low stock on a booked line', severity: 'Warning' as const, action: 'Open Inventory' }] : []),
    ...(depositRequired > depositReceived ? [{ text: `Deposit ${rs(depositRequired - depositReceived)} pending`, severity: 'Warning' as const, action: 'Receive Deposit' }] : []),
    ...(rentalOutstanding > 0 ? [{ text: 'Rental outstanding', severity: 'Warning' as const, action: 'Receive Payment' }] : []),
  ]
  const critical = alerts.filter((a) => a.severity === 'Critical')
  const confirmBlocked = critical.length > 0 || days === 0

  const pickupBs = toBs(new Date(pickup))
  const returnBs = toBs(new Date(ret))

  const addLine = (id: string) => {
    const c = CATALOGUE.find((x) => x.id === id)
    if (!c || lines.some((l) => l.id === id)) return
    setLines((p) => [...p, { ...c, qty: 1, days: days || 1, discountPct: 0 }])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {/* §5.1 — breadcrumb only (in the shell), one primary, Operations gated. */}
      <PageHeader
        title="New Rental"
        description={`${client} · ${kind}`}
        actions={
          <>
            <span
              style={{ display: 'inline-flex', alignItems: 'center', height: 30, padding: '0 10px', borderRadius: 'var(--r-badge)', background: STATUS[statusToken(status)].bg, color: STATUS[statusToken(status)].fg, fontSize: 'var(--t-meta)', fontWeight: 700 }}
            >
              {status}
            </span>
            <Button>Save Draft</Button>
            <Button icon="arrow_right">Send Quote</Button>
            {/* §4.1 — Operations is disabled at Draft, visible and greyed with the reason. */}
            <span title="Operations become available once the booking is Confirmed" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
              <Button icon="chevron_down">Operations</Button>
            </span>
            <span title={confirmBlocked ? `Blocked: ${critical[0]?.text ?? 'return must be after pickup'}` : undefined}>
              <Button icon="plus" variant="primary" onClick={() => !confirmBlocked && navigate('/rentals')}>
                Confirm Booking
              </Button>
            </span>
          </>
        }
      />

      {/* §5.2 — summary bar. Outstanding is the largest figure and the only red one. */}
      <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr)) minmax(0,1.1fr)' }}>
        {[
          { l: 'Client', v: client, sub: kind },
          { l: 'Pickup', v: pickupBs ? formatBs(pickupBs) : '—', sub: Number.isNaN(Date.parse(pickup)) ? '—' : formatAd(new Date(pickup)) },
          { l: 'Return', v: returnBs ? formatBs(returnBs) : '—', sub: Number.isNaN(Date.parse(ret)) ? '—' : formatAd(new Date(ret)) },
          { l: 'Status', v: `${status} · ${flag}`, sub: `${days} rental days · ${lines.length} items · ${crew.length} crew` },
        ].map((f) => (
          <div key={f.l} style={{ padding: '13px 15px', borderRight: '1px solid var(--border)', minWidth: 0 }}>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 4 }}>{f.l}</div>
            <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {f.v}
            </div>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {f.sub}
            </div>
          </div>
        ))}
        <div style={{ padding: '13px 15px', background: 'var(--danger-soft)', borderRadius: '0 var(--r-card) var(--r-card) 0' }}>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Outstanding</div>
          <div className="figure" style={{ fontSize: 'var(--t-h2)', fontWeight: 700, color: 'var(--danger-text)', letterSpacing: '-0.02em' }}>
            {rs(rentalOutstanding)}
          </div>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 4 }}>
            Deposit pending{' '}
            <span className="figure" style={{ color: 'var(--progress-text)', fontWeight: 600 }}>
              {rs(depositRequired - depositReceived)}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <Section
            no={1}
            title={SECTIONS[0]}
            open={open[0] ?? true}
            onToggle={() => toggle(0)}
            action={
              <>
                <Button icon="users">Select Client</Button>
                <Button icon="plus">New Client</Button>
                <Button icon="eye">Client History</Button>
              </>
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 11 }}>
              <Field label="Client">
                <input value={client} onChange={(e) => setClient(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Project">
                <input value={project} onChange={(e) => setProject(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Project Type">
                <input value={kind} onChange={(e) => setKind(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Government ID / PAN">
                <input value={govId} onChange={(e) => setGovId(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Pickup">
                <input type="date" value={pickup} onChange={(e) => setPickup(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Return">
                <input type="date" value={ret} onChange={(e) => setRet(e.target.value)} style={inputStyle} />
              </Field>
            </div>
            {/* §7 — return must be later than pickup. */}
            {days === 0 && (
              <p style={{ margin: '11px 0 0', display: 'flex', gap: 6, fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--danger-text)' }}>
                <Icon name="alert_triangle" size={13} />
                Return must be later than pickup.
              </p>
            )}
          </Section>

          <Section
            no={2}
            title={SECTIONS[1]}
            open={open[1] ?? true}
            onToggle={() => toggle(1)}
            action={
              <select
                aria-label="Add item"
                onChange={(e) => {
                  addLine(e.target.value)
                  e.currentTarget.selectedIndex = 0
                }}
                style={{ ...inputStyle, width: 'auto', height: 28, fontSize: 'var(--t-meta)' }}
              >
                <option>Add Item…</option>
                {CATALOGUE.filter((c) => !lines.some((l) => l.id === c.id)).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            }
          >
            {/* §8.5 — inline conflict check on every change to dates or items. */}
            <div
              style={{
                display: 'flex',
                gap: 7,
                alignItems: 'center',
                padding: '8px 10px',
                borderRadius: 'var(--r-btn)',
                marginBottom: 11,
                background: conflictLines.length ? 'var(--st-danger-bg)' : 'var(--st-in-bg)',
                color: conflictLines.length ? 'var(--st-danger-fg)' : 'var(--st-in-fg)',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
              }}
            >
              <Icon name={conflictLines.length ? 'alert_triangle' : 'checklist'} size={13} />
              {conflictLines.length
                ? `${conflictLines.length} conflict${conflictLines.length > 1 ? 's' : ''} — ${conflictLines[0]?.name} is committed to BK-2026-0699`
                : 'All items available for the selected dates. No conflicts found.'}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    {['Item / Accessory', 'Serial / ID', 'Category', 'Qty', 'Days', 'Rate', 'Discount', 'Amount', 'Availability', 'Location', ''].map((h, i) => (
                      <th key={h || i} style={{ ...th, textAlign: i >= 3 && i <= 7 ? 'right' : 'left' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...td, fontWeight: 600 }}>{l.name}</td>
                      <td className="identifier" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{l.serial}</td>
                      <td style={{ ...td, color: 'var(--text2)' }}>{l.category}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <input
                          type="number"
                          min={1}
                          value={l.qty}
                          aria-label={`Quantity for ${l.name}`}
                          onChange={(e) => setLines((p) => p.map((x) => (x.id === l.id ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))}
                          style={{ ...inputStyle, width: 52, height: 25, textAlign: 'right' }}
                        />
                      </td>
                      {/* §8.3 — Days is mandatory and explicit on every line. */}
                      <td style={{ ...td, textAlign: 'right' }}>
                        <input
                          type="number"
                          min={1}
                          value={l.days}
                          aria-label={`Days for ${l.name}`}
                          onChange={(e) => setLines((p) => p.map((x) => (x.id === l.id ? { ...x, days: Math.max(1, Number(e.target.value) || 1) } : x)))}
                          style={{ ...inputStyle, width: 52, height: 25, textAlign: 'right' }}
                        />
                      </td>
                      <td className="figure" style={{ ...td, textAlign: 'right' }}>{rs(l.rate)}</td>
                      <td className="figure" style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>{l.discountPct}%</td>
                      <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{rs(lineAmount(l))}</td>
                      <td style={td}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            height: 19,
                            padding: '0 7px',
                            borderRadius: 5,
                            fontSize: 'var(--t-meta)',
                            fontWeight: 600,
                            background: l.availability === 'Available' ? 'var(--st-in-bg)' : l.availability === 'Low Stock' ? 'var(--st-progress-bg)' : 'var(--st-danger-bg)',
                            color: l.availability === 'Available' ? 'var(--st-in-fg)' : l.availability === 'Low Stock' ? 'var(--st-progress-fg)' : 'var(--st-danger-fg)',
                          }}
                        >
                          {l.availability}
                        </span>
                      </td>
                      <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{l.location}</td>
                      <td style={{ ...td, width: 28 }}>
                        <button
                          type="button"
                          aria-label={`Remove ${l.name}`}
                          onClick={() => setLines((p) => p.filter((x) => x.id !== l.id))}
                          style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
                        >
                          <Icon name="close" size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={11} style={{ padding: 20, textAlign: 'center', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                        No equipment on this booking yet. Add an item to begin.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* §8.6 — unset values render an em dash, never zero. */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 'var(--t-meta)' }}>
              {[
                { l: 'Total Items', v: String(lines.reduce((s, l) => s + l.qty, 0)) },
                { l: 'Packed', v: '—' },
                { l: 'Missing', v: '—' },
                { l: 'Cases', v: '—' },
                { l: 'Weight', v: '—' },
              ].map((x) => (
                <span key={x.l} style={{ display: 'inline-flex', gap: 5 }}>
                  <span style={{ color: 'var(--text2)' }}>{x.l}</span>
                  <span className="figure" style={{ fontWeight: 700, color: x.v === '—' ? 'var(--muted)' : 'var(--text)' }}>{x.v}</span>
                </span>
              ))}
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 7 }}>
                <span style={{ color: 'var(--text2)' }}>Equipment Subtotal</span>
                <span className="figure" style={{ fontWeight: 700 }}>{rs(equipment)}</span>
              </span>
            </div>
          </Section>

          <Section no={3} title={SECTIONS[2]} open={open[2] ?? true} onToggle={() => toggle(2)} action={<Button icon="plus">Add Member</Button>}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', gap: 14 }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Name', 'Role', 'Day Rate', 'Days', 'Overtime', 'Meals', 'Amount'].map((h, i) => (
                        <th key={h} style={{ ...th, textAlign: i >= 2 ? 'right' : 'left' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {crew.map((c) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={td}>{c.name}</td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{c.role}</td>
                        <td className="figure" style={{ ...td, textAlign: 'right' }}>{c.dayRate.toLocaleString('en-IN')}</td>
                        <td className="figure" style={{ ...td, textAlign: 'right' }}>{days}</td>
                        <td className="figure" style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>{c.overtime || '—'}</td>
                        <td className="figure" style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>{c.meals || '—'}</td>
                        <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                          {rs(c.dayRate * days + c.overtime + c.accommodation + c.meals)}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={6} style={{ ...td, fontWeight: 600, color: 'var(--text2)' }}>Crew Subtotal</td>
                      <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{rs(crewCharges)}</td>
                    </tr>
                  </tbody>
                </table>
                {crew.length === 0 && <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No crew assigned.</p>}
                {crew.length > 0 && (
                  <div style={{ marginTop: 9 }}>
                    <Button onClick={() => setCrew([])}>Clear crew</Button>
                  </div>
                )}
              </div>

              <div>
                <Field label="Delivery Type">
                  <select
                    value={deliveryType}
                    onChange={(e) => setDeliveryType(e.target.value as typeof deliveryType)}
                    style={inputStyle}
                  >
                    <option>Customer Pickup</option>
                    <option>Babin Delivery</option>
                  </select>
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 9 }}>
                  <Field label="Delivery Charge">
                    <input
                      type="number"
                      min={0}
                      disabled={customerPickup}
                      value={customerPickup ? 0 : deliveryCharge}
                      onChange={(e) => setDeliveryCharge(Math.max(0, Number(e.target.value) || 0))}
                      style={{ ...inputStyle, opacity: customerPickup ? 0.55 : 1 }}
                    />
                  </Field>
                  <Field label="Fuel Charge">
                    <input
                      type="number"
                      min={0}
                      disabled={customerPickup}
                      value={customerPickup ? 0 : fuelCharge}
                      onChange={(e) => setFuelCharge(Math.max(0, Number(e.target.value) || 0))}
                      style={{ ...inputStyle, opacity: customerPickup ? 0.55 : 1 }}
                    />
                  </Field>
                </div>
                {/* §9.2 — Customer Pickup forces both to zero. */}
                {customerPickup && (
                  <p style={{ margin: '8px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                    Customer Pickup forces delivery and fuel charges to Rs 0. Overriding writes to audit.
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 11, paddingTop: 9, borderTop: '1px solid var(--border)', fontSize: 'var(--t-meta)' }}>
                  <span style={{ flex: 1, color: 'var(--text2)' }}>Transport Total</span>
                  <span className="figure" style={{ fontWeight: 700 }}>{rs(transport)}</span>
                </div>
              </div>
            </div>
          </Section>

          <Section no={4} title={SECTIONS[3]} open={open[3] ?? true} onToggle={() => toggle(3)}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 14 }}>
              <div>
                <h3 style={sub}>Rental Charges</h3>
                {/* §10.1 in order — the displayed column sums to the displayed total. */}
                {[
                  { l: 'Equipment Rental', v: rs(equipment) },
                  { l: 'Sub-Rental', v: '—' },
                  { l: 'Services', v: '—' },
                  { l: 'Crew Charges', v: rs(crewCharges) },
                  { l: 'Transport', v: rs(transport) },
                ].map((r) => (
                  <div key={r.l} style={{ display: 'flex', gap: 9, padding: '5px 0', fontSize: 'var(--t-meta)' }}>
                    <span style={{ flex: 1, color: 'var(--text2)' }}>{r.l}</span>
                    <span className="figure" style={{ fontWeight: 600, color: r.v === '—' ? 'var(--muted)' : 'var(--text)' }}>{r.v}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
                  {[
                    { l: 'Subtotal', v: rs(subtotal) },
                    { l: `Discount (${discountPct}%)`, v: `− ${rs(discount)}`, tone: true },
                    { l: 'Taxable Amount', v: rs(taxable) },
                    { l: `VAT (${VAT_PCT}%)`, v: rs(vat) },
                  ].map((r) => (
                    <div key={r.l} style={{ display: 'flex', gap: 9, padding: '4px 0', fontSize: 'var(--t-meta)' }}>
                      <span style={{ flex: 1, color: 'var(--text2)' }}>{r.l}</span>
                      <span className="figure" style={{ fontWeight: 600, color: r.tone ? 'var(--danger-text)' : 'var(--text)' }}>{r.v}</span>
                    </div>
                  ))}
                  {/* §14 — Grand Total is body text; only Outstanding is red. */}
                  <div style={{ display: 'flex', gap: 9, marginTop: 6, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 'var(--t-ui)', fontWeight: 700 }}>
                    <span style={{ flex: 1 }}>Rental Total</span>
                    <span className="figure">{rs(rentalTotal)}</span>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <Field label="Discount %">
                    <input
                      type="number"
                      min={0}
                      max={25}
                      value={discountPct}
                      onChange={(e) => setDiscountPct(Math.min(25, Math.max(0, Number(e.target.value) || 0)))}
                      style={inputStyle}
                    />
                  </Field>
                  {/* §10.8 — hard block: ≥10 characters of reason AND a named approver. */}
                  {discountPct > 10 && (
                    <div style={{ marginTop: 9, padding: 10, borderRadius: 'var(--r-btn)', background: 'var(--st-danger-bg)' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--st-danger-fg)' }}>
                        <Icon name="alert_triangle" size={12} />
                        Above 10% — reason (min 10 chars) and a named approver. No bypass.
                      </div>
                      <input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="Reason" aria-label="Discount reason" style={{ ...inputStyle, marginTop: 7 }} />
                      <input value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="Approver" aria-label="Discount approver" style={{ ...inputStyle, marginTop: 6 }} />
                    </div>
                  )}
                </div>
              </div>

              <div>
                {/* §10.3 — deposits sit in their own panel, outside the breakdown. */}
                <h3 style={sub}>Deposit</h3>
                {[
                  { l: 'Deposit Required', v: rs(depositRequired) },
                  { l: 'Deposit Received', v: rs(depositReceived), tone: 'var(--success-text)' },
                  { l: 'Deposit Pending', v: rs(depositRequired - depositReceived), tone: 'var(--progress-text)' },
                ].map((r) => (
                  <div key={r.l} style={{ display: 'flex', gap: 9, padding: '5px 0', fontSize: 'var(--t-meta)' }}>
                    <span style={{ flex: 1, color: 'var(--text2)' }}>{r.l}</span>
                    <span className="figure" style={{ fontWeight: 600, color: r.tone ?? 'var(--text)' }}>{r.v}</span>
                  </div>
                ))}
                <p style={{ margin: '8px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                  Deposits are liabilities. They never enter Rental Total and never reduce Rental Outstanding.
                </p>

                <h3 style={{ ...sub, marginTop: 16 }}>Payments (Rental Only)</h3>
                <Field label="Advance Payment">
                  <input type="number" min={0} value={advance} onChange={(e) => setAdvance(Math.max(0, Number(e.target.value) || 0))} style={inputStyle} />
                </Field>
                <div style={{ display: 'flex', gap: 9, padding: '7px 0 0', fontSize: 'var(--t-meta)' }}>
                  <span style={{ flex: 1, color: 'var(--text2)' }}>Rental Outstanding</span>
                  <span className="figure" style={{ fontWeight: 700, color: rentalOutstanding > 0 ? 'var(--danger-text)' : 'var(--text)' }}>
                    {rs(rentalOutstanding)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 9, padding: '5px 0', fontSize: 'var(--t-meta)' }}>
                  <span style={{ flex: 1, color: 'var(--text2)' }}>Invoice State</span>
                  <span style={{ fontWeight: 600 }}>{invoiceState}</span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                  <strong style={{ color: 'var(--text2)' }}>Partially Paid</strong> is an invoice state, not a payment
                  status — a payment is Received in full or it is not.
                </p>
              </div>

              <div>
                <h3 style={sub}>Payment History</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Date', 'Type', 'Amount', 'Method', 'Collected By'].map((h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { d: '16 Jul 2026', t: 'Deposit', a: '25,000', m: 'Cash', by: 'Sagar Maharjan' },
                      { d: '10 Jul 2026', t: 'Advance', a: '15,000', m: 'eSewa', by: 'Sagar Maharjan' },
                    ].map((r) => (
                      <tr key={r.t} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)' }}>{r.d}</td>
                        <td style={{ ...td, fontSize: 'var(--t-meta)' }}>{r.t}</td>
                        <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)' }}>{r.a}</td>
                        <td style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{r.m}</td>
                        <td style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{r.by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
                  <Button icon="dollar" variant="primary">Receive Payment</Button>
                  <Button>Receive Deposit</Button>
                </div>
                {/* §10.7 — immutable; corrections are reversal entries. */}
                <p style={{ margin: '8px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                  Payments are immutable — no Edit, no Void. A mistake is corrected by a reversal entry referencing
                  the original.
                </p>
              </div>
            </div>
          </Section>

          <Section no={5} title={SECTIONS[4]} open={open[4] ?? true} onToggle={() => toggle(4)}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 14 }}>
              <div>
                <h3 style={sub}>Documents</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {/* §11 — nothing is pre-generated on a Draft. */}
                  {[
                    { n: 'Quote', from: '0 Quote', ready: true },
                    { n: 'Rental Agreement', from: '2 Confirmed', ready: false },
                    { n: 'Packing List', from: '3 Preparing', ready: false },
                    { n: 'Delivery Note', from: '5 Dispatched', ready: false },
                    { n: 'Invoice', from: 'invoice generated', ready: false },
                  ].map((d) => (
                    <div
                      key={d.n}
                      style={{ width: 108, padding: '11px 9px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card2)', textAlign: 'center' }}
                    >
                      <Icon name="file" size={18} style={{ color: d.ready ? 'var(--link)' : 'var(--disabled)' }} />
                      <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginTop: 5, lineHeight: 1.25 }}>{d.n}</div>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>{d.ready ? 'Available' : 'Not available'}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 style={sub}>Review Summary</h3>
                {/* §11 — never all green while a Critical alert is open. */}
                {[
                  { l: 'Client', ok: client.trim().length > 0 && govId.trim().length > 0 },
                  { l: 'Equipment', ok: lines.length > 0 && conflictLines.length === 0 },
                  { l: 'Crew', ok: true },
                  { l: 'Pricing', ok: !discountUnapproved && rentalTotal > 0 },
                  { l: 'Payments', ok: rentalOutstanding <= 0 },
                  { l: 'Documents', ok: false },
                ].map((r) => (
                  <div key={r.l} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', fontSize: 'var(--t-meta)' }}>
                    <Icon name={r.ok ? 'checklist' : 'alert_triangle'} size={13} style={{ color: r.ok ? 'var(--success-text)' : 'var(--progress-text)', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: 'var(--text2)' }}>{r.l}</span>
                    <span style={{ fontWeight: 600, color: r.ok ? 'var(--text)' : 'var(--progress-text)' }}>{r.ok ? 'Complete' : 'Pending'}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* §5.1 footer strip — no second Confirm, no Previous. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 2px', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            <Icon name="checklist" size={13} style={{ color: 'var(--success-text)' }} />
            All changes saved
            <span style={{ marginLeft: 'auto' }}>
              <Button>Save Draft</Button>
            </span>
          </div>
        </div>

        <Rail width={300}>
          {/* §13 — summary, one button, no payment history here. */}
          <Card title="Booking Summary">
            {[
              { l: 'Rental Total', v: rs(rentalTotal) },
              { l: 'Rental Paid', v: rs(advance), tone: 'var(--success-text)' },
              { l: 'Rental Outstanding', v: rs(rentalOutstanding), tone: 'var(--danger-text)' },
              { l: 'Deposit Required', v: rs(depositRequired) },
              { l: 'Deposit Received', v: rs(depositReceived), tone: 'var(--success-text)' },
              { l: 'Deposit Pending', v: rs(depositRequired - depositReceived), tone: 'var(--progress-text)' },
            ].map((r) => (
              <div key={r.l} style={{ display: 'flex', gap: 9, padding: '4px 0', fontSize: 'var(--t-meta)' }}>
                <span style={{ flex: 1, color: 'var(--text2)' }}>{r.l}</span>
                <span className="figure" style={{ fontWeight: 600, color: r.tone ?? 'var(--text)' }}>{r.v}</span>
              </div>
            ))}
            <div style={{ marginTop: 11 }}>
              <Button icon="dollar" variant="primary">Receive Payment</Button>
            </div>
          </Card>

          {/* §13 — exactly three tiles. */}
          <Card title="Quick Actions">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {(['Print', 'Share', 'More'] as const).map((a, i) => (
                <button
                  key={a}
                  type="button"
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 4px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <Icon name={i === 0 ? 'file' : i === 1 ? 'arrow_right' : 'more_vert'} size={17} style={{ color: 'var(--text2)' }} />
                  {a}
                </button>
              ))}
            </div>
          </Card>

          <Card title={`Alerts (${alerts.length})`}>
            {alerts.length === 0 ? (
              <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No open alerts.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {alerts.map((a) => {
                  const crit = a.severity === 'Critical'
                  return (
                    <div key={a.text} style={{ padding: 10, borderRadius: 'var(--r-btn)', background: crit ? 'var(--st-danger-bg)' : 'var(--st-progress-bg)' }}>
                      <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 'var(--t-meta)' }}>
                        <Icon name="alert_triangle" size={13} style={{ color: crit ? 'var(--st-danger-fg)' : 'var(--st-progress-fg)', flexShrink: 0, marginTop: 1 }} />
                        <span style={{ flex: 1, color: crit ? 'var(--st-danger-fg)' : 'var(--st-progress-fg)', fontWeight: 500 }}>{a.text}</span>
                        <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: crit ? 'var(--st-danger-fg)' : 'var(--st-progress-fg)', flexShrink: 0 }}>
                          {a.severity}
                        </span>
                      </div>
                      {/* §12 — every alert carries exactly one primary action. */}
                      <div style={{ marginTop: 7 }}>
                        <Button>{a.action}</Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
              Critical blocks Confirm. Warning blocks Handover, not Confirm.
            </p>
          </Card>

          <Card title="Activity Timeline">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {[
                { at: 'Just now', what: 'Draft created', who: 'by Ramesh Dulal' },
                { at: 'Just now', what: 'Items added', who: `${lines.length} lines` },
              ].map((t) => (
                <div key={t.what} style={{ display: 'flex', gap: 9 }}>
                  <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--link)', flexShrink: 0, marginTop: 4 }} />
                  <span style={{ minWidth: 0 }}>
                    <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{t.at}</span>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{t.what}</span>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{t.who}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </Rail>
      </div>

      <FooterNote extra={['Sections are not a wizard — any order, one Confirm']} />
    </div>
  )
}

const sub = { margin: '0 0 8px', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' } as const
