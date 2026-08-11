import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Input, Select } from '../../components/ui'
import { Card, PageHeader, Button, Rail, FooterNote, cardStyle } from '../../components/ui/Page'
import { EmptyState } from '../../components/ui/StateViews'
import { useToast } from '../../components/ui/Toast'
import { BREAKPOINT, useViewport } from '../../lib/device'
import { useNetwork } from '../../lib/network'
import { STATUS } from '../../lib/status'
import { statusToken } from '../../lib/workflow'
import type { BookingStatus } from '../../lib/workflow'
import { toBs, formatBs, formatAd } from '../../lib/bs'
import { price, formatMoney, rupees, roundHalfUp } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { CLIENTS_DATA } from '../../data/clients'
import type { ClientRecord } from '../../data/clients'
import { PARENTS, INV_STYLE } from '../../data/inventory'
import type { InvStatus } from '../../data/inventory'
import { CREW_ROSTER } from '../../data/crew'
import type { CrewMember } from '../../data/crew'
import { useAuth } from '../../lib/auth'
import type { ActionContext } from '../../actions/core'
import { gateContext, canViewMoneyField } from '../../lib/fieldGating'
import {
  AddClientModal,
  AddItemPanel,
  ClientCombobox,
  ClientHealthEye,
  ClientHistoryDrawer,
  ClientQuickView,
  clientHealth,
} from './booking'
import type { AddItemSource, BookingLineDraft, BookingWindow } from './booking'

/**
 * **New Rental — Booking Workspace**, built from render `6989CD12` and
 * `04 Operations/Booking Workflow.md` v2.3 (Build Locked), then refined
 * against the "New Booking" spec v1.0 (10 Aug 2026).
 *
 * §2 / §3 / §19: **the five sections are not a wizard.** Any section may be
 * worked at any time, in any order. There is no Previous, no Next, and exactly
 * **one** primary action on the page. An earlier build of this screen was a
 * Back/Next stepper, which is the specific thing §0 corrects. The refinement
 * pass below is deliberately a *refinement*: spec §2 and §70 both say "do not
 * rebuild the New Booking page", so every section, every figure, every write
 * and every blocking rule survives it unchanged (§67).
 *
 * §4.1 — at stage `Draft` the primary is `Confirm Booking` and Operations is
 * disabled. §5.1 — breadcrumb only, no Back button.
 *
 * **Cross-module connection — "New Booking" spec v1.0, 10 Aug 2026.** Client,
 * Equipment and Crew previously came from local, independently-invented
 * arrays that duplicated (and drifted from) the real `data/clients.ts` /
 * `data/inventory.ts` / `data/crew.ts` this app already has — the exact
 * defect the spec's §34 "never duplicate master data" rule names. Pricing
 * likewise duplicated `lib/money.ts`'s canonical `price()` by hand. All four
 * are now real connections.
 *
 * **What the v1.0 refinement changed** (structure, sections, workflow, data,
 * business logic, buttons, operations and integrations all held constant):
 * the client `<select>` became `ClientCombobox` + the §11 health eye + the
 * §15/§18 `AddClientModal` + the §20 `ClientHistoryDrawer`; the `Add Item…`
 * `<select>` became the §23–35 `AddItemPanel`; the header gained a real
 * button hierarchy (§4); the equipment table, the financial blocks, the
 * alerts and the rail were re-typeset for density and hierarchy (§36–60);
 * and the page became responsive on the existing `useViewport()` bands (§65).
 */

const DAY = 86400000
const VAT_PCT = 13

/** A bookable equipment row, flattened from `PARENTS`' parent/child tree — one row per serialized unit, or per non-serialized SKU. */
interface CatalogueItem {
  id: string
  name: string
  serial: string
  category: string
  ratePaisa: Paisa
  location: string
  status: InvStatus
  /** Real `booking` field off the source unit — '—' when free. Used for an honest "already committed to X" note instead of a fabricated conflict. */
  committedTo: string
}

/** Flattened once at module load — `PARENTS` is a static import, this never changes at runtime. */
const EQUIPMENT_CATALOGUE: CatalogueItem[] = PARENTS.flatMap((p) => {
  const ratePaisa = p.dailyRatePaisa ?? (rupees(0) as Paisa)
  if (!p.children || p.children.length === 0) {
    return [
      {
        id: p.name,
        name: p.name,
        serial: '—',
        category: p.category,
        ratePaisa,
        location: p.location,
        status: p.breakdown[0]?.status ?? 'In Stock',
        committedTo: '—',
      },
    ]
  }
  return p.children.map((c) => ({
    id: c.serial,
    name: p.name,
    serial: c.serial,
    category: p.category,
    ratePaisa,
    location: c.location,
    status: c.status,
    committedTo: c.booking,
  }))
})

interface Line {
  id: string
  name: string
  serial: string
  category: string
  ratePaisa: Paisa
  /** §8.3 — Days is mandatory. A per-booking line stores 1 explicitly. */
  days: number
  qty: number
  discountPct: number
  location: string
  status: InvStatus
  committedTo: string
  /**
   * §34 — set when the line arrived as part of a bundle, so the footer can
   * count bundles honestly and the row can say where it came from. A line
   * added on its own genuinely has no bundle, so this is absent, never ''.
   */
  bundleCode?: string | undefined
  bundleName?: string | undefined
}

/** §10.1 — line amount, rounded once at the end (half-up), same convention `lib/money.ts`'s `price()` uses internally. */
function lineAmountPaisa(l: Line): Paisa {
  return roundHalfUp(l.qty * l.days * l.ratePaisa * (1 - l.discountPct / 100)) as Paisa
}

/** A crew member's charge on this booking. `dayRatePaisa` seeds from `CrewMember.dayRatePaisa` but is editable per booking — a rate can be negotiated differently per job. */
interface CrewLine {
  crewId: string
  name: string
  role: string
  phone: string
  dayRatePaisa: Paisa
  overtimePaisa: Paisa
  accommodationPaisa: Paisa
  mealsPaisa: Paisa
}

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
} as const

/**
 * §60 — one table vocabulary for the whole page. Column headers sit at the
 * `--t-th` floor in `--text2` (7.0:1 on `--th-bg`), rows at `--t-meta`, and
 * rows carry a single hairline rule rather than a box each.
 */
const th = { textAlign: 'left' as const, padding: '7px 9px', fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--text2)', letterSpacing: '0.03em', textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const, borderBottom: '1px solid var(--border)' }
const td = { padding: '7px 9px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }

/** §59 / §60 — the one sub-heading used inside every section body. */
const sub = { margin: '0 0 8px', fontSize: 'var(--t-th)', fontWeight: 700, color: 'var(--text2)', letterSpacing: '0.04em', textTransform: 'uppercase' } as const

/** §43–47 — the block shell that separates Rental Charges / Deposit / Payments without drawing another box around them. */
const moneyBlock = { background: 'var(--card2)', borderRadius: 'var(--r-card)', padding: 'var(--sp-md)', minWidth: 0 } as const

/**
 * Law 12 — **the** inline error line for this page, lifted out of the block-reason
 * paragraph below so a failed dispatch can reuse the affordance that already
 * exists instead of a second one being invented for it. Toasts on this codebase
 * are success-only (`useToast()` exposes `showSuccessToast` and nothing else),
 * so an error has exactly one place to go and it is here.
 */
const inlineErrorStyle = {
  margin: 0,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 7,
  fontSize: 'var(--t-meta)',
  fontWeight: 600,
  color: 'var(--danger-text)',
  lineHeight: 1.4,
} as const

/**
 * A transparent 44×44 hit area centred on a control that is visually smaller.
 * The touch minimum applies on desktop too, and inflating a table's remove
 * glyph or a section chevron to 44px tall would wreck the density §60 asks
 * for — so the *target* grows and the glyph does not. The parent must be
 * `position: relative`.
 *
 * Same shape as `booking/AddItemPanel.tsx`'s private `TouchInset`; it is not
 * exported from that module, and re-declaring nine lines is better than
 * widening another agent's public surface mid-flight.
 */
function TouchInset() {
  return (
    <span
      aria-hidden="true"
      style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'max(100%, 44px)', height: 44 }}
    />
  )
}

function Field({
  label,
  children,
  error,
  helper,
  labelId,
}: {
  label: string
  children: React.ReactNode
  /** When set, renders below children in the danger tone. Field can't reach into
   *  arbitrary children to stamp aria-invalid/aria-describedby on the input itself
   *  (children are caller-supplied), so callers that want full a11y wiring should
   *  point their input's aria-describedby at this span's id themselves.
   *  `| undefined` is explicit because tsconfig sets exactOptionalPropertyTypes:
   *  callers pass ternaries like `cond ? '...' : undefined`. */
  error?: string | undefined
  /** Muted helper text shown below children when there is no error. */
  helper?: string | undefined
  /**
   * When set the wrapper becomes a `<div>` with an `id`-carrying label span
   * instead of a `<label>`. A `<label>` around a composite widget (the client
   * combobox is an input *plus* a listbox *plus* the health eye) steals clicks
   * meant for the eye, so those callers wire `aria-labelledby` instead.
   */
  labelId?: string | undefined
}) {
  const errorId = error ? `field-error-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined
  const body = (
    <>
      <span id={labelId} style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', marginBottom: 3 }}>{label}</span>
      {children}
      {error ? (
        <span id={errorId} role="alert" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--danger-text)', marginTop: 3 }}>
          {error}
        </span>
      ) : helper ? (
        <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 3 }}>{helper}</span>
      ) : null}
    </>
  )
  if (labelId) return <div style={{ display: 'block', minWidth: 0 }}>{body}</div>
  return <label style={{ display: 'block', minWidth: 0 }}>{body}</label>
}

/**
 * §59 — **the** section header. All five sections render through this one
 * component; there is no second heading style anywhere on the page, which is
 * what stops Section 4 slowly drifting away from Section 1.
 *
 * Equipment is expanded by default (§6); on a phone the lower sections start
 * collapsed (§65) and their header carries a one-line summary so a collapsed
 * section is still informative.
 */
function Section({
  no,
  title,
  open,
  onToggle,
  action,
  summary,
  children,
}: {
  no: number
  title: string
  open: boolean
  onToggle: () => void
  action?: React.ReactNode
  /** Shown in the header when collapsed, so collapsing never hides the facts. */
  summary?: string
  children: React.ReactNode
}) {
  return (
    <section style={{ ...cardStyle, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderBottom: open ? '1px solid var(--border)' : 'none' }}>
        <span
          className="figure"
          aria-hidden
          style={{ width: 20, height: 20, borderRadius: 5, display: 'grid', placeItems: 'center', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)', fontSize: 'var(--t-th)', fontWeight: 700, flexShrink: 0 }}
        >
          {no}
        </span>
        <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{title}</h2>
        {!open && summary && (
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {summary}
          </span>
        )}
        {/* §6 — toolbars hide when the section is collapsed. */}
        {open && action && <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>{action}</span>}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
          className="press"
          style={{ marginLeft: open && action ? 0 : 'auto', position: 'relative', width: 26, height: 26, borderRadius: 'var(--r-xs)', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}
        >
          <TouchInset />
          <Icon name={open ? 'chevron_up' : 'chevron_down'} size={15} />
        </button>
      </div>
      {open && <div style={{ padding: 'var(--sp-md)' }}>{children}</div>}
    </section>
  )
}

/**
 * §4 — Operations is a *menu*, not a fourth equal-weight button.
 *
 * §4.1's rule is unchanged: at `Draft` it is disabled, visible and greyed,
 * and it states why. The menu therefore never opens on this screen today; it
 * is built as a menu so the shape is right the moment a Confirmed booking
 * renders through the same header.
 */
function OperationsMenu({ disabled, reason, items }: { disabled: boolean; reason: string; items: Array<{ label: string; icon: IconName }> }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node | null)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} style={{ position: 'relative' }} title={disabled ? reason : undefined}>
      <button
        type="button"
        className="press"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={disabled ? `Operations — unavailable. ${reason}` : 'Operations'}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 34,
          padding: '0 12px',
          borderRadius: 'var(--r-btn)',
          background: 'transparent',
          color: 'var(--text2)',
          border: '1px solid var(--btn-secondary-border)',
          fontFamily: 'inherit',
          fontSize: 'var(--t-meta)',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        Operations
        <Icon name="chevron_down" size={14} />
      </button>
      {open && !disabled && (
        <div
          role="menu"
          aria-label="Operations"
          style={{
            position: 'absolute',
            zIndex: 40,
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 200,
            padding: 5,
            background: 'var(--dropdown)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            boxShadow: 'var(--shadow-modal)',
          }}
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className="press"
              onClick={() => setOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-sm)',
                width: '100%',
                minHeight: 40,
                padding: '0 9px',
                borderRadius: 'var(--r-btn)',
                border: 'none',
                background: 'transparent',
                color: 'var(--text)',
                fontFamily: 'inherit',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <Icon name={it.icon} size={15} style={{ color: 'var(--text2)' }} />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** §6 — one strip cell: small label, large value, small support line. */
function StripCell({ label, value, support, tone, big, style }: { label: string; value: string; support?: string | undefined; tone?: string | undefined; big?: boolean | undefined; style?: React.CSSProperties | undefined }) {
  return (
    <div style={{ padding: '11px 14px', minWidth: 0, ...style }}>
      <div style={{ fontSize: 'var(--t-th)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text2)' }}>{label}</div>
      <div
        className={big ? 'figure' : undefined}
        style={{
          marginTop: 3,
          fontSize: big ? 'var(--t-h2)' : 'var(--t-ui)',
          fontWeight: 700,
          lineHeight: 1.15,
          letterSpacing: big ? '-0.02em' : undefined,
          color: tone ?? 'var(--text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
      {support && (
        <div style={{ marginTop: 2, fontSize: 'var(--t-meta)', color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {support}
        </div>
      )}
    </div>
  )
}

/** §37 / §52 — a money row. Label left, figure right, aligned on the same right edge everywhere. */
function MoneyRow({ label, value, tone, strong, big }: { label: string; value: string; tone?: string; strong?: boolean; big?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, padding: big ? '6px 0 2px' : '3px 0' }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: big ? 'var(--t-meta)' : 'var(--t-meta)', fontWeight: big ? 700 : 400, color: big ? 'var(--text)' : 'var(--text2)' }}>{label}</span>
      <span
        className="figure"
        style={{
          fontSize: big ? 'var(--t-h3)' : 'var(--t-meta)',
          fontWeight: big || strong ? 700 : 600,
          letterSpacing: big ? '-0.02em' : undefined,
          color: tone ?? 'var(--text)',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  )
}

export default function NewRental() {
  const navigate = useNavigate()
  const viewport = useViewport()
  const isDesktop = viewport === 'desktop'
  const isPhone = viewport === 'phone'
  const online = useNetwork()
  const { showSuccessToast } = useToast()
  // Law 6 / P0-3, BUG_SWEEP_REGISTER_v1.0; mirrors BookingDetail — gated money is
  // never built into the DOM: 'booking' covers booking/payment money (Coordinator
  // included), 'asset-finance' covers crew pay (Coordinator excluded, HIS v2.1 §4.1
  // "no crew pay"), 'client-balance' covers the client's credit/outstanding figures.
  const { user } = useAuth()
  const role = user?.role ?? 'Client'
  const gctx = useMemo(() => gateContext(role), [role])
  const canBookingMoney = canViewMoneyField(gctx, 'booking')
  const canCrewMoney = canViewMoneyField(gctx, 'asset-finance')
  const canClientBalance = canViewMoneyField(gctx, 'client-balance')
  // §1.4 — the retired `Draft` stage is status Quote plus a Draft flag.
  const status: BookingStatus = 'Quote'
  const flag = 'Draft'

  // Any section, any order — all open by default except on a phone, where §65
  // wants expandable sections rather than one endless scroll. Equipment stays
  // expanded there because §6 makes it the section the operator lands in.
  const [open, setOpen] = useState<boolean[]>(() =>
    typeof window !== 'undefined' && window.innerWidth < BREAKPOINT.phone
      ? [true, true, false, false, false]
      : [true, true, true, true, true],
  )
  const toggle = (i: number) => setOpen((p) => p.map((v, j) => (j === i ? !v : v)))

  // §02 — the client selector reads data/clients.ts, the same source
  // ClientsDirectory/ClientDetail read, instead of a free-text field. §18 — a
  // client created from the booking is appended here so the combobox can
  // resolve the selection immediately, with no second search.
  const [clientPool, setClientPool] = useState<ClientRecord[]>(() => [...CLIENTS_DATA])
  const [selectedClientId, setSelectedClientId] = useState<string | null>(CLIENTS_DATA[0]?.id ?? null)
  const client: ClientRecord | undefined = useMemo(
    () => clientPool.find((c) => c.id === selectedClientId),
    [clientPool, selectedClientId],
  )

  // §11 / §15 / §20 — three disclosures over the workspace. None of them route,
  // so consulting a balance never costs a half-built booking.
  const [quickViewOpen, setQuickViewOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [addClientOpen, setAddClientOpen] = useState(false)

  const [project, setProject] = useState("'Echoes of Mustang'")
  const [kind, setKind] = useState('Documentary Film')
  const [govId, setGovId] = useState(client?.pan ?? '')
  const [pickup, setPickup] = useState('2026-07-16')
  const [ret, setRet] = useState('2026-07-19')
  /**
   * Law 17 (PLAN.md §6.1) — the UI reads **Client Pickup**, which is the 27 Jul
   * lock's own wording. This union is private to the page and is never written:
   * `saveDraft` and `confirmBooking` send an id and nothing else, so no value
   * from here reaches a `delivery_type` column and the rename moves no stored
   * data. The `<option>` carries no explicit `value`, so its text *is* the
   * value — label and literal have to move together or the §9.2 comparison
   * below silently stops matching.
   *
   * TODO(decision) — the Postgres `delivery_type` / `delivery_method` enums
   * still spell this member `'Customer Pickup'` (`0001_enums.sql:34,280`), and
   * `types/database.ts`, `data/handover.ts` and `booqable/map/orders.ts` mirror
   * that wire value on purpose, exactly as `booqable/types.ts` does for
   * `customers`. Whoever wires this screen to a real write must map label →
   * enum value, or land the coordinated schema-wide rename `AUDIT_FINDINGS.md`
   * P3 already logged. Do not "correct" those mirrors to match this line.
   */
  const [deliveryType, setDeliveryType] = useState<'Client Pickup' | 'Babin Delivery'>('Client Pickup')

  const seedLine = (item: CatalogueItem, qty: number, discountPct: number): Line => ({
    id: item.id,
    name: item.name,
    serial: item.serial,
    category: item.category,
    ratePaisa: item.ratePaisa,
    location: item.location,
    status: item.status,
    committedTo: item.committedTo,
    qty,
    days: 3,
    discountPct,
  })

  // One default line per distinct SKU, not three units of the same serial —
  // a serialized row is one physical unit, quantity only makes sense on
  // non-serialized bulk stock (cables, batteries).
  const [lines, setLines] = useState<Line[]>(() => {
    const seen = new Set<string>()
    const picks: CatalogueItem[] = []
    for (const item of EQUIPMENT_CATALOGUE) {
      if (seen.has(item.name) || item.status !== 'In Stock') continue
      seen.add(item.name)
      picks.push(item)
      if (picks.length === 3) break
    }
    return picks.map((item) => seedLine(item, item.serial === '—' ? 2 : 1, 5))
  })

  const seedCrewLine = (m: CrewMember): CrewLine => ({
    crewId: m.id,
    name: m.name,
    role: m.role,
    phone: m.phone,
    dayRatePaisa: m.dayRatePaisa,
    overtimePaisa: rupees(0) as Paisa,
    accommodationPaisa: rupees(0) as Paisa,
    mealsPaisa: rupees(0) as Paisa,
  })

  const [crew, setCrew] = useState<CrewLine[]>(() =>
    CREW_ROSTER.filter((m) => ['CR-001', 'CR-005', 'CR-007'].includes(m.id)).map(seedCrewLine),
  )
  const [deliveryChargePaisa, setDeliveryChargePaisa] = useState<Paisa>(rupees(0) as Paisa)
  const [fuelChargePaisa, setFuelChargePaisa] = useState<Paisa>(rupees(0) as Paisa)
  const [discountPct, setDiscountPct] = useState(7)
  const [discountReason, setDiscountReason] = useState('')
  const [approver, setApprover] = useState('')
  const [advancePaisa, setAdvancePaisa] = useState<Paisa>(rupees(15000) as Paisa)
  const depositRequiredPaisa = rupees(50000) as Paisa
  const depositReceivedPaisa = rupees(25000) as Paisa

  const days = useMemo(() => {
    const a = Date.parse(pickup)
    const b = Date.parse(ret)
    if (Number.isNaN(a) || Number.isNaN(b)) return 0
    return Math.max(0, Math.round((b - a) / DAY))
  }, [pickup, ret])

  /** §32 — availability is answered for *these* dates, not for today. */
  const bookingWindow = useMemo<BookingWindow>(() => {
    const a = Date.parse(pickup)
    const b = Date.parse(ret)
    return {
      pickupAd: Number.isNaN(a) ? null : new Date(a),
      returnAd: Number.isNaN(b) ? null : new Date(b),
    }
  }, [pickup, ret])

  /* ── §10.1 calculation order — via lib/money.ts's canonical price(), not a local re-derivation. ── */
  const equipmentPaisa = useMemo(() => lines.reduce((s, l) => s + lineAmountPaisa(l), 0) as Paisa, [lines])
  const crewChargesPaisa = useMemo(
    () => crew.reduce((s, c) => s + c.dayRatePaisa * days + c.overtimePaisa + c.accommodationPaisa + c.mealsPaisa, 0) as Paisa,
    [crew, days],
  )
  // §9.2 — Client Pickup forces both transport charges to zero.
  const clientPickup = deliveryType === 'Client Pickup'
  const transportPaisa = (clientPickup ? 0 : deliveryChargePaisa + fuelChargePaisa) as Paisa

  const breakdown = useMemo(
    () =>
      price({
        equipment: equipmentPaisa,
        crew: crewChargesPaisa,
        transport: transportPaisa,
        discountPercent: discountPct,
        vatPercent: VAT_PCT,
        payments: advancePaisa,
      }),
    [equipmentPaisa, crewChargesPaisa, transportPaisa, discountPct, advancePaisa],
  )

  /** §10.4, as ruled: this is the *invoice* state, not a payment status. */
  const invoiceState = advancePaisa <= 0 ? 'Unpaid' : advancePaisa < breakdown.rentalTotal ? 'Partially Paid' : 'Paid'

  const depositPendingPaisa = (depositRequiredPaisa - depositReceivedPaisa) as Paisa

  /* ── §12 alerts. Critical blocks Confirm; Warning blocks Handover. ─────── */
  // §03 — a real conflict reads the unit's own status/booking, not a fabricated one.
  const conflictLines = lines.filter((l) => l.status !== 'In Stock')
  // §10.8 — above 10% needs a reason of at least 10 characters AND a named
  // approver. No bypass, including Owner.
  const discountUnapproved = discountPct > 10 && (discountReason.trim().length < 10 || approver.trim().length === 0)

  const alerts: Array<{ text: string; severity: 'Critical' | 'Warning' | 'Information'; action: string }> = [
    ...conflictLines.map((l) => ({
      text: l.committedTo !== '—' ? `Equipment conflict — ${l.name} committed to ${l.committedTo}` : `Equipment conflict — ${l.name} is ${l.status}`,
      severity: 'Critical' as const,
      action: 'Open Inventory',
    })),
    ...(!client ? [{ text: 'No client selected', severity: 'Critical' as const, action: 'Select Client' }] : []),
    ...(client && govId.trim().length === 0 ? [{ text: 'Missing client ID or PAN', severity: 'Critical' as const, action: 'Edit Client' }] : []),
    ...(discountUnapproved ? [{ text: 'Discount above 10% unapproved', severity: 'Critical' as const, action: 'Request Approval' }] : []),
    // §02 — client financial warning. Booking may still proceed; this is a warning, not a block.
    ...(canBookingMoney && client && client.outstandingPaisa > 0
      ? [{ text: `Client has ${formatMoney(client.outstandingPaisa)} outstanding`, severity: 'Warning' as const, action: 'View Client' }]
      : []),
    ...(canBookingMoney && depositRequiredPaisa > depositReceivedPaisa
      ? [{ text: `Deposit ${formatMoney(depositPendingPaisa)} pending`, severity: 'Warning' as const, action: 'Receive Deposit' }]
      : []),
    ...(canBookingMoney && breakdown.outstanding > 0 ? [{ text: 'Rental outstanding', severity: 'Warning' as const, action: 'Receive Payment' }] : []),
  ]
  const critical = alerts.filter((a) => a.severity === 'Critical')
  const confirmBlocked = critical.length > 0 || days === 0
  const blockReasonText = confirmBlocked
    ? `Blocked — ${critical[0]?.text ?? 'the return date must be later than the pickup date'}. Resolve it in the alerts panel, then Confirm.`
    : undefined

  const pickupBs = toBs(new Date(pickup))
  const returnBs = toBs(new Date(ret))

  /* ── §24 / §34 — the Add Item panel hands back ready lines; the page appends
   *    them and every existing pricing / availability path recomputes as it
   *    already did. Nothing about how a line is priced changed (§67). ─────── */
  const addDrafts = useCallback((drafts: readonly BookingLineDraft[], source: AddItemSource) => {
    setLines((prev) => {
      const have = new Set(prev.map((l) => l.id))
      const fresh = drafts
        .filter((d) => !have.has(d.id))
        .map<Line>((d) => ({
          ...d,
          ...(source.kind === 'bundle' ? { bundleCode: source.id, bundleName: source.name } : {}),
        }))
      return fresh.length === 0 ? prev : [...prev, ...fresh]
    })
  }, [])

  const addCrew = (crewId: string) => {
    const m = CREW_ROSTER.find((x) => x.id === crewId)
    if (!m || crew.some((c) => c.crewId === crewId)) return
    setCrew((p) => [...p, seedCrewLine(m)])
  }

  /**
   * The last dispatch failure, shown in the page's own inline error line.
   * Law 12 — errors are inline and persistent; there is no error toast to reach
   * for, and one is not invented here. Cleared when a dispatch is re-attempted.
   */
  const [actionError, setActionError] = useState<string | null>(null)

  /**
   * Both writes on this page refuse to run without a signed-in session.
   *
   * They previously dispatched `{ userId: 'USR-001', role: 'Manager' }` — a
   * staff id that exists nowhere in this repo, and a role asserted about
   * whoever happened to be at the keyboard. `RecordPaymentModal.tsx` records the
   * same pair being removed from the payment path. (Its comment adds that
   * business-9 retired `Manager`; per `types/database.ts:80` migration 0017
   * restored it, so the string is a valid `SystemRole` today — but a *fabricated*
   * one is the defect either way, valid or not.)
   *
   * Same refusal shape as `today/MovementList.tsx`'s `runMovementAction`: no
   * session, no dispatch, and no substitute identity.
   */
  const dispatchContext = useCallback((): ActionContext | null => {
    if (!user) return null
    // `isOnline` is passed because this screen already knows it and `lib/rbac`'s
    // offline degradation refuses several approvals offline. Omitting it lets
    // `ActionContext` default to online — the fail-open direction.
    return { userId: user.id, role: user.role, isOnline: online }
  }, [user, online])

  /* ── §58 — the save-state line. The header owns the Save Draft action; the
   *    footer only ever reports state, so there is one Save Draft on the page.
   *    'error' exists because 'saved' is a success claim: the footer reads
   *    "All changes saved", and it may not say that after a save that failed. */
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const saveDraft = useCallback(() => {
    const ctx = dispatchContext()
    if (!ctx) {
      setActionError('Not saved — you are not signed in, so this draft cannot be attributed to anyone. Sign in and save again.')
      setSaveState('error')
      return
    }
    setActionError(null)
    setSaveState('saving')
    void import('../../actions/rentals/index')
      .then((m) => m.saveDraft({ id: 'draft-new' }, ctx))
      /*
       * This `showSuccessToast` used to hang off `.finally()`, which runs on
       * rejection exactly as it does on resolution. `saveDraft` is still an
       * unimplemented stub, so the dispatcher rejects it before `execute` and
       * the operator was told "Draft saved" about a draft that was never
       * written — then navigated away and lost it. Success reporting now lives
       * on the resolved path and nowhere else.
       *
       * `{ id: 'draft-new' }` is still a placeholder: this screen holds the
       * whole booking in local state and has no persisted row to name. Left as
       * found rather than guessed at — see the report / TODO(decision) on
       * wiring a real draft id.
       */
      .then(() => {
        setSaveState('saved')
        showSuccessToast('Draft saved', 'This booking is saved as a draft. Nothing has been confirmed.')
      })
      .catch((err: unknown) => {
        console.error('save draft failed:', err)
        setSaveState('error')
        setActionError(`Not saved — ${err instanceof Error ? err.message : String(err)}`)
      })
  }, [dispatchContext, showSuccessToast])

  const confirmBooking = useCallback(() => {
    if (confirmBlocked) return
    const ctx = dispatchContext()
    if (!ctx) {
      setActionError('Not confirmed — you are not signed in, so this booking cannot be attributed to anyone. Sign in and confirm again.')
      return
    }
    setActionError(null)
    /*
     * `navigate('/rentals')` used to run unconditionally on the line after a
     * fire-and-forget dispatch with no `.catch()`. Landing on the rentals list
     * is this app's universal "the write landed" signal, so a rejected confirm
     * looked exactly like a confirmed booking. The navigation is now on the
     * resolved path only; a rejection stays on the page and says why.
     */
    void import('../../actions/rentals/index')
      .then((m) => m.confirmRental({ id: 'bk-new' }, ctx))
      .then(() => navigate('/rentals'))
      .catch((err: unknown) => {
        console.error('confirm booking failed:', err)
        setActionError(`Not confirmed — ${err instanceof Error ? err.message : String(err)}`)
      })
  }, [confirmBlocked, dispatchContext, navigate])

  /* ── §7–20 — client selection handlers. ───────────────────────────────── */
  const selectClient = useCallback((c: ClientRecord) => {
    setSelectedClientId(c.id)
    if (c.pan) setGovId(c.pan)
  }, [])

  /** §18 — auto-select the created client. The operator never searches for it. */
  const onClientCreated = useCallback(
    (created: ClientRecord) => {
      setClientPool((prev) => (prev.some((c) => c.id === created.id) ? prev : [created, ...prev]))
      setSelectedClientId(created.id)
      setGovId(created.pan ?? '')
      showSuccessToast('Client added', `${created.name} is selected on this booking.`)
    },
    [showSuccessToast],
  )

  const health = useMemo(() => (client ? clientHealth(client) : null), [client])

  // §5.2 summary bar — the 5-up strip only has room on desktop; below that
  // every value (client name, "Rs 1,19,069" outstanding) ellipsizes into
  // unreadable fragments, so it collapses to fewer columns per Law 14.
  const summaryCols = isDesktop
    ? canBookingMoney
      ? 'repeat(4, minmax(0,1fr)) minmax(0,1.15fr)'
      : 'repeat(4, minmax(0,1fr))'
    : viewport === 'tablet'
      ? 'repeat(2, minmax(0,1fr))'
      : '1fr'
  const summaryDivider = isDesktop ? { borderRight: '1px solid var(--border)' } : { borderBottom: '1px solid var(--border)' }

  const bundleCount = useMemo(() => new Set(lines.map((l) => l.bundleCode).filter(Boolean)).size, [lines])
  const totalUnits = lines.reduce((s, l) => s + l.qty, 0)

  /* ── §36–38 — the equipment table's columns, declared once so the header,
   *    the alignment and the empty-state colSpan cannot drift apart. ─────── */
  const equipmentColumns: Array<{ key: string; align: 'left' | 'right' }> = canBookingMoney
    ? [
        { key: 'Item', align: 'left' },
        { key: 'Category', align: 'left' },
        { key: 'Qty', align: 'right' },
        { key: 'Days', align: 'right' },
        { key: 'Rate / day', align: 'right' },
        { key: 'Disc.', align: 'right' },
        { key: 'Amount', align: 'right' },
        { key: 'Availability', align: 'left' },
        { key: 'Location', align: 'left' },
        { key: '', align: 'right' },
      ]
    : [
        { key: 'Item', align: 'left' },
        { key: 'Category', align: 'left' },
        { key: 'Qty', align: 'right' },
        { key: 'Days', align: 'right' },
        { key: 'Availability', align: 'left' },
        { key: 'Location', align: 'left' },
        { key: '', align: 'right' },
      ]

  const railCards = (
    <>
      {/* §51 — Booking Summary first. §52 — large type is reserved for Rental
          Total and Rental Outstanding; everything else is a --t-meta row.
          Law 5 / §47 — rental and deposit are two blocks with two labels and
          are never summed into a single "balance". */}
      {canBookingMoney && (
        <Card title="Booking Summary">
          <div style={moneyBlock}>
            <h3 style={sub}>Rental</h3>
            <MoneyRow label="Rental Total" value={formatMoney(breakdown.rentalTotal)} big />
            <MoneyRow label="Rental Paid" value={formatMoney(advancePaisa)} tone="var(--success-text)" />
            <MoneyRow
              label="Rental Outstanding"
              value={formatMoney(breakdown.outstanding)}
              tone={breakdown.outstanding > 0 ? 'var(--danger-text)' : 'var(--success-text)'}
              big
            />
          </div>

          <div style={{ ...moneyBlock, marginTop: 10 }}>
            <h3 style={sub}>Deposit — held as a liability</h3>
            <MoneyRow label="Deposit Required" value={formatMoney(depositRequiredPaisa)} />
            <MoneyRow label="Deposit Received" value={formatMoney(depositReceivedPaisa)} tone="var(--success-text)" />
            <MoneyRow label="Deposit Pending" value={formatMoney(depositPendingPaisa)} tone="var(--progress-text)" strong />
            <p style={{ margin: '7px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
              Never added to Rental Outstanding — these are two separate obligations.
            </p>
          </div>

          <div style={{ marginTop: 11 }}>
            <Button icon="dollar" variant="primary">Receive Payment</Button>
          </div>
        </Card>
      )}

      {/* §53 / §13 — exactly three tiles. */}
      <Card title="Quick Actions">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--sp-sm)' }}>
          {([
            { label: 'Print', icon: 'file' as IconName, hint: 'Print this draft booking' },
            { label: 'Share', icon: 'arrow_right' as IconName, hint: 'Share this draft booking' },
            { label: 'More', icon: 'more_vert' as IconName, hint: 'More actions for this booking' },
          ]).map((a) => (
            <button
              key={a.label}
              type="button"
              className="press"
              title={a.hint}
              aria-label={a.hint}
              onClick={a.label === 'Print' ? () => window.print() : undefined}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 56, padding: '10px 4px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <Icon name={a.icon} size={17} style={{ color: 'var(--text2)' }} />
              {a.label}
            </button>
          ))}
        </div>
      </Card>

      {/* §54–56 — compact alerts. Severity is a labelled chip, not a colour;
          the blocking rules themselves are untouched (§67): Critical blocks
          Confirm, Warning blocks Handover, Information blocks nothing. */}
      <Card title={`Alerts (${alerts.length})`}>
        {alerts.length === 0 ? (
          <EmptyState title="No open alerts" description="This booking has no critical or warning alerts." />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {alerts.map((a) => {
              const tone = a.severity === 'Critical' ? 'danger' : a.severity === 'Warning' ? 'progress' : 'primary'
              const t = STATUS[tone]
              const icon: IconName = a.severity === 'Critical' ? 'error' : a.severity === 'Warning' ? 'alert_triangle' : 'info'
              return (
                <li key={a.text} style={{ padding: '8px 9px', borderRadius: 'var(--r-btn)', background: t.bg }}>
                  <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 'var(--t-meta)' }}>
                    <Icon name={icon} size={13} style={{ color: t.fg, flexShrink: 0, marginTop: 2 }} />
                    <span style={{ flex: 1, minWidth: 0, color: t.fg, fontWeight: 500, lineHeight: 1.35 }}>{a.text}</span>
                    <span
                      style={{ flexShrink: 0, fontSize: 'var(--t-th)', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: t.fg }}
                    >
                      {a.severity}
                    </span>
                  </div>
                  {/* §12 — every alert carries exactly one primary action. */}
                  <button
                    type="button"
                    className="press"
                    onClick={() => {
                      if (a.action === 'Open Inventory') navigate('/inventory')
                      // §11 — inspecting the client is a disclosure, not a route
                      // change; a half-built booking must survive it.
                      if ((a.action === 'View Client' || a.action === 'Edit Client') && client) setQuickViewOpen(true)
                      if (a.action === 'Select Client') setAddClientOpen(false)
                    }}
                    style={{
                      position: 'relative',
                      marginTop: 5,
                      marginLeft: 20,
                      minHeight: 26,
                      padding: '0 8px',
                      borderRadius: 'var(--r-btn)',
                      border: `1px solid ${t.fg}`,
                      background: 'transparent',
                      color: t.fg,
                      fontFamily: 'inherit',
                      fontSize: 'var(--t-th)',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <TouchInset />
                    {a.action}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
          Critical blocks Confirm. Warning blocks Handover, not Confirm. Information blocks nothing.
        </p>
      </Card>

      {/* §57 — Activity Timeline last. */}
      <Card title="Activity Timeline">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { at: 'Just now', what: 'Draft created', who: 'by Ramesh Dulal' },
            { at: 'Just now', what: 'Items added', who: `${lines.length} line${lines.length === 1 ? '' : 's'}` },
          ].map((t) => (
            <div key={t.what} style={{ display: 'flex', gap: 9 }}>
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: 'var(--r-badge)', background: 'var(--link)', flexShrink: 0, marginTop: 5 }} />
              <span style={{ minWidth: 0 }}>
                <span className="figure" style={{ display: 'block', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{t.at}</span>
                <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{t.what}</span>
                <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{t.who}</span>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {/* §5.1 — breadcrumb only (in the shell), one primary, Operations gated.
          §4 — and one hierarchy: Confirm Booking is the only filled button,
          Send Quote is outlined, Save Draft is text, Operations is a menu. */}
      <PageHeader
        title="New Rental"
        description={`${client?.name ?? 'No client selected'} · ${kind}`}
        actions={
          <>
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 10px', borderRadius: 'var(--r-badge)', background: STATUS[statusToken(status)].bg, color: STATUS[statusToken(status)].fg, fontSize: 'var(--t-meta)', fontWeight: 700 }}
            >
              <Icon name="file" size={13} />
              {status} · {flag}
            </span>
            <Button variant="ghost" onClick={saveDraft} disabled={saveState === 'saving'}>
              {saveState === 'saving' ? 'Saving…' : 'Save Draft'}
            </Button>
            {/* §4.1 — Operations is disabled at Draft, visible and greyed with the reason. */}
            <OperationsMenu
              disabled
              reason="Operations become available once the booking is Confirmed."
              items={[
                { label: 'Assign Crew', icon: 'crew' },
                { label: 'Extend Rental', icon: 'calendar_event' },
                { label: 'Create Sub-Rental', icon: 'truck' },
              ]}
            />
            <Button icon="arrow_right">Send Quote</Button>
            <span title={blockReasonText}>
              <Button icon="check" variant="primary" onClick={confirmBooking} disabled={confirmBlocked}>
                Confirm Booking
              </Button>
            </span>
          </>
        }
      />
      {/* Errors are inline and persistent, never a toast and never an alert().
          Two independent facts share the one affordance: what blocks Confirm,
          and what the last dispatch did instead of succeeding. They are separate
          paragraphs because a Save Draft can fail while Confirm is also blocked,
          and collapsing them would drop one of the two. */}
      {blockReasonText && (
        <p role="status" style={inlineErrorStyle}>
          <Icon name="error" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {blockReasonText}
        </p>
      )}
      {actionError && (
        <p role="status" style={inlineErrorStyle}>
          <Icon name="error" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {actionError}
        </p>
      )}

      {/* §6 — the booking status strip: small label, large value, small
          support line. Outstanding is the largest figure and the only red one. */}
      <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: summaryCols }}>
        <StripCell label="Client" value={client?.name ?? 'Not selected'} support={client ? (client.company ?? kind) : 'Choose a client to continue'} style={summaryDivider} />
        <StripCell
          label="Pickup"
          value={pickupBs ? formatBs(pickupBs) : '—'}
          support={Number.isNaN(Date.parse(pickup)) ? '—' : formatAd(new Date(pickup))}
          style={summaryDivider}
        />
        <StripCell
          label="Return"
          value={returnBs ? formatBs(returnBs) : '—'}
          support={Number.isNaN(Date.parse(ret)) ? '—' : formatAd(new Date(ret))}
          style={summaryDivider}
        />
        <StripCell
          label="Booking"
          value={`${status} · ${flag}`}
          support={`${days} rental days · ${lines.length} items · ${crew.length} crew`}
          style={canBookingMoney ? summaryDivider : undefined}
        />
        {canBookingMoney && (
          <StripCell
            label="Rental Outstanding"
            value={formatMoney(breakdown.outstanding)}
            support={`Deposit pending ${formatMoney(depositPendingPaisa)} — tracked separately`}
            tone="var(--danger-text)"
            big
            style={{
              gridColumn: isDesktop ? undefined : '1 / -1',
              borderRadius: isDesktop ? '0 var(--r-card) var(--r-card) 0' : '0 0 var(--r-card) var(--r-card)',
            }}
          />
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isDesktop ? 'minmax(0,1fr) auto' : 'minmax(0,1fr)',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <Section
            no={1}
            title={SECTIONS[0]}
            open={open[0] ?? true}
            onToggle={() => toggle(0)}
            summary={client ? `${client.name} · ${days} days` : 'No client selected'}
          >
            {/* §7–11 — one Client row: the searchable combobox, the health eye
                that is also the quick-view trigger, + New Client beside it, and
                Client History retained. */}
            <Field label="Client" labelId="new-rental-client-label">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <ClientCombobox
                    clients={clientPool}
                    selectedClientId={selectedClientId}
                    onSelect={selectClient}
                    onCreateNew={() => setAddClientOpen(true)}
                    onViewAll={() => navigate('/clients')}
                    inputStyle={inputStyle}
                    labelledBy="new-rental-client-label"
                    showOutstanding={canClientBalance}
                    {...(client ? {} : { error: 'Select a client before confirming this booking.' })}
                    {...(client && health
                      ? {
                          trailing: (
                            <ClientHealthEye
                              verdict={health}
                              clientName={client.name}
                              open={quickViewOpen}
                              controls="new-rental-client-quick-view"
                              onClick={() => setQuickViewOpen((o) => !o)}
                            />
                          ),
                        }
                      : {})}
                  />
                </div>
                {/* §15 — directly beside the field, never buried in a toolbar. */}
                <Button icon="plus" onClick={() => setAddClientOpen(true)}>New Client</Button>
                {/* §20 — retained, and now a drawer instead of a route change. */}
                {client && <Button icon="activity" onClick={() => setHistoryOpen(true)}>Client History</Button>}
              </div>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : viewport === 'tablet' ? 'repeat(2, minmax(0,1fr))' : 'repeat(3, minmax(0,1fr))', gap: 11, marginTop: 11 }}>
              <Field label="Project">
                <Input value={project} onChange={(e) => setProject(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Project Type">
                <Input value={kind} onChange={(e) => setKind(e.target.value)} style={inputStyle} />
              </Field>
              <Field
                label="Government ID / PAN"
                error={client && govId.trim().length === 0 ? 'Required before confirming. Enter the PAN or citizenship number, or add it on the client record.' : undefined}
              >
                <Input value={govId} onChange={(e) => setGovId(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Pickup">
                <Input type="date" value={pickup} onChange={(e) => setPickup(e.target.value)} style={inputStyle} />
              </Field>
              {/* §7 — return must be later than pickup. */}
              <Field label="Return" error={days === 0 ? 'Return must be later than pickup. Pick a later return date.' : undefined}>
                <Input type="date" value={ret} onChange={(e) => setRet(e.target.value)} style={inputStyle} />
              </Field>
              {/* §60 "no duplicate information" — Delivery Type is *not* repeated
                  here. It lives once, in Section 3, beside the delivery and fuel
                  charges it drives (§9.2). */}
            </div>

            {/* §02 / §12 — real client fields, loaded from the same record
                ClientDetail.tsx reads. Health travels as icon + label + colour. */}
            {client && (
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 'var(--t-meta)' }}>
                <span style={{ color: 'var(--text2)' }}>
                  Phone <span className="figure" style={{ color: 'var(--text)', fontWeight: 600 }}>{client.phone}</span>
                </span>
                <span style={{ color: 'var(--text2)' }}>
                  Email <span style={{ color: 'var(--text)', fontWeight: 600 }}>{client.email}</span>
                </span>
                {canClientBalance && (
                  <span style={{ color: 'var(--text2)' }}>
                    Credit limit{' '}
                    <span className="figure" style={{ color: 'var(--text)', fontWeight: 600 }}>{formatMoney(client.creditLimitPaisa)}</span>
                  </span>
                )}
                {canClientBalance && client.outstandingPaisa > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--danger-text)', fontWeight: 600 }}>
                    <Icon name="alert_triangle" size={12} />
                    <span className="figure">{formatMoney(client.outstandingPaisa)}</span> outstanding
                  </span>
                )}
                <button
                  type="button"
                  className="press"
                  onClick={() => setQuickViewOpen(true)}
                  style={{ position: 'relative', marginLeft: 'auto', minHeight: 30, padding: '0 9px', borderRadius: 'var(--r-btn)', border: '1px solid var(--btn-secondary-border)', background: 'transparent', color: 'var(--text2)', fontFamily: 'inherit', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer' }}
                >
                  <TouchInset />
                  Client health details
                </button>
              </div>
            )}
          </Section>

          <Section
            no={2}
            title={SECTIONS[1]}
            open={open[1] ?? true}
            onToggle={() => toggle(1)}
            summary={`${lines.length} lines · ${conflictLines.length} conflicts`}
            /* §24 — the Add Item… <select> is replaced by the §23–35 search
               panel. It still lives in this section's toolbar, at the same
               height, and it still only raises a callback (§34). */
            action={
              <AddItemPanel
                window={bookingWindow}
                days={days || 1}
                existingLineIds={lines.map((l) => l.id)}
                onAdd={addDrafts}
                showPrices={canBookingMoney}
                inputStyle={inputStyle}
              />
            }
          >
            {/* §8.5 — inline conflict check on every change to dates or items, read from each unit's own real status/booking, never fabricated. */}
            <div
              style={{
                display: 'flex',
                gap: 7,
                alignItems: 'center',
                padding: '7px 10px',
                borderRadius: 'var(--r-btn)',
                marginBottom: 10,
                background: conflictLines.length ? 'var(--st-danger-bg)' : 'var(--st-in-bg)',
                color: conflictLines.length ? 'var(--st-danger-fg)' : 'var(--st-in-fg)',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
              }}
            >
              <Icon name={conflictLines.length ? 'error' : 'check'} size={13} style={{ flexShrink: 0 }} />
              {conflictLines.length
                ? `${conflictLines.length} conflict${conflictLines.length > 1 ? 's' : ''} — ${conflictLines[0]?.name} is ${conflictLines[0]?.status}${conflictLines[0]?.committedTo !== '—' ? ` (${conflictLines[0]?.committedTo})` : ''}`
                : 'All items available for the selected dates. No conflicts found.'}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    {equipmentColumns.map((c, i) => (
                      <th key={c.key || `col-${i}`} scope="col" style={{ ...th, textAlign: c.align }}>
                        {c.key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const inv = INV_STYLE[l.status]
                    return (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        {/* §36 — item name strong, serial small and secondary underneath it. */}
                        <td style={{ ...td, whiteSpace: 'normal', maxWidth: 260 }}>
                          <span style={{ display: 'block', fontSize: 'var(--t-ui)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.25 }}>{l.name}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                            {l.serial !== '—' ? (
                              <Link className="identifier" to={`/inventory/${l.serial}`} style={{ color: 'inherit', textDecoration: 'none' }} title={`Open unit ${l.serial} in Inventory`}>
                                {l.serial}
                              </Link>
                            ) : (
                              <span>Bulk stock — no serial</span>
                            )}
                            {l.bundleName && (
                              <span
                                title={`Added as part of the ${l.bundleName} bundle`}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '0 5px', borderRadius: 'var(--r-badge)', background: 'var(--st-primary-bg)', color: 'var(--st-primary-fg)', fontWeight: 700 }}
                              >
                                <Icon name="package" size={10} />
                                {l.bundleName}
                              </span>
                            )}
                          </span>
                        </td>
                        {/* §36 — category muted. */}
                        <td style={{ ...td, color: 'var(--text2)' }}>{l.category}</td>
                        {/* §36 — qty compact. A serialized row is one physical unit; quantity only varies for non-serialized bulk stock. */}
                        <td style={{ ...td, textAlign: 'right' }}>
                          <Input
                            type="number"
                            min={1}
                            value={l.qty}
                            disabled={l.serial !== '—'}
                            title={l.serial !== '—' ? 'One serialized unit per row' : undefined}
                            aria-label={`Quantity for ${l.name}`}
                            onChange={(e) => setLines((p) => p.map((x) => (x.id === l.id ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))}
                            style={{ ...inputStyle, width: 48, height: 26, padding: '0 6px', textAlign: 'right', opacity: l.serial !== '—' ? 0.55 : 1, cursor: l.serial !== '—' ? 'not-allowed' : 'text' }}
                          />
                        </td>
                        {/* §8.3 — Days is mandatory and explicit on every line. */}
                        <td style={{ ...td, textAlign: 'right' }}>
                          <Input
                            type="number"
                            min={1}
                            value={l.days}
                            aria-label={`Days for ${l.name}`}
                            onChange={(e) => setLines((p) => p.map((x) => (x.id === l.id ? { ...x, days: Math.max(1, Number(e.target.value) || 1) } : x)))}
                            style={{ ...inputStyle, width: 48, height: 26, padding: '0 6px', textAlign: 'right' }}
                          />
                        </td>
                        {canBookingMoney && (
                          <>
                            {/* §37 — rate right-aligned, discount a compact badge, amount bold. */}
                            <td className="figure" style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>{formatMoney(l.ratePaisa)}</td>
                            <td style={{ ...td, textAlign: 'right' }}>
                              {l.discountPct > 0 ? (
                                <span
                                  className="figure"
                                  title={`${l.discountPct}% line discount`}
                                  style={{ display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 6px', borderRadius: 'var(--r-badge)', background: 'var(--st-neutral-bg)', color: 'var(--st-neutral-fg)', fontSize: 'var(--t-th)', fontWeight: 700 }}
                                >
                                  −{l.discountPct}%
                                </span>
                              ) : (
                                <span style={{ color: 'var(--muted)' }}>—</span>
                              )}
                            </td>
                            <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{formatMoney(lineAmountPaisa(l))}</td>
                          </>
                        )}
                        {/* §38 — availability is a status pill: icon + label + colour, never colour alone. */}
                        <td style={td}>
                          <span
                            title={l.committedTo !== '—' ? `${l.status} — committed to ${l.committedTo}` : l.status}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 'var(--sp-xs)',
                              height: 20,
                              padding: '0 7px',
                              borderRadius: 'var(--r-badge)',
                              fontSize: 'var(--t-th)',
                              fontWeight: 700,
                              background: inv.bg === 'transparent' ? 'var(--st-in-bg)' : inv.bg,
                              color: inv.bg === 'transparent' ? 'var(--st-in-fg)' : inv.fg,
                            }}
                          >
                            <Icon name={inv.icon} size={11} />
                            {l.status}
                          </span>
                        </td>
                        <td style={{ ...td, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>{l.location}</td>
                        <td style={{ ...td, width: 34, textAlign: 'right' }}>
                          <button
                            type="button"
                            className="press"
                            aria-label={`Remove ${l.name} from this booking`}
                            title={`Remove ${l.name}`}
                            onClick={() => setLines((p) => p.filter((x) => x.id !== l.id))}
                            style={{ position: 'relative', width: 26, height: 26, display: 'grid', placeItems: 'center', borderRadius: 'var(--r-xs)', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
                          >
                            <TouchInset />
                            <Icon name="close" size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={equipmentColumns.length} style={{ padding: 20 }}>
                        <EmptyState
                          title="No equipment on this booking yet"
                          description="Use Add Item to search bundles, equipment and accessories for these dates."
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* §39 — items / bundles / rental days / Equipment Subtotal. Packed,
                Missing, Cases and Weight are Packing's fields, not booking
                creation's; they were reporting an em dash on every draft here.
                §8.6 — an unset value is still an em dash, never a zero. */}
            <div style={{ display: 'flex', gap: 'var(--sp-lg)', flexWrap: 'wrap', alignItems: 'baseline', marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border)', fontSize: 'var(--t-meta)' }}>
              {[
                { l: 'Items', v: lines.length === 0 ? '—' : `${totalUnits}` },
                { l: 'Bundles', v: bundleCount === 0 ? '—' : String(bundleCount) },
                { l: 'Rental Days', v: days === 0 ? '—' : String(days) },
              ].map((x) => (
                <span key={x.l} style={{ display: 'inline-flex', gap: 5 }}>
                  <span style={{ color: 'var(--text2)' }}>{x.l}</span>
                  <span className="figure" style={{ fontWeight: 700, color: x.v === '—' ? 'var(--muted)' : 'var(--text)' }}>{x.v}</span>
                </span>
              ))}
              {canBookingMoney && (
                <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 7, alignItems: 'baseline' }}>
                  <span style={{ color: 'var(--text2)' }}>Equipment Subtotal</span>
                  <span className="figure" style={{ fontWeight: 700, fontSize: 'var(--t-ui)' }}>{formatMoney(equipmentPaisa)}</span>
                </span>
              )}
            </div>
          </Section>

          <Section
            no={3}
            title={SECTIONS[2]}
            open={open[2] ?? true}
            onToggle={() => toggle(2)}
            summary={`${crew.length} crew · ${deliveryType}`}
            action={
              <Select
                aria-label="Add crew"
                onChange={(e) => {
                  addCrew(e.target.value)
                  e.currentTarget.selectedIndex = 0
                }}
                style={{ ...inputStyle, width: 'auto', height: 34, fontSize: 'var(--t-meta)' }}
              >
                <option>Add Member…</option>
                {CREW_ROSTER.filter((m) => !crew.some((c) => c.crewId === m.id)).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.role}
                  </option>
                ))}
              </Select>
            }
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isDesktop
                  ? 'minmax(0,1.35fr) minmax(0,1fr)'
                  : viewport === 'tablet'
                    ? 'repeat(2, minmax(0,1fr))'
                    : 'minmax(0,1fr)',
                gap: 14,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                    <thead>
                      <tr style={{ background: 'var(--th-bg)' }}>
                        {(canCrewMoney ? ['Name', 'Role', 'Day Rate', 'Days', 'Overtime', 'Meals', 'Amount'] : ['Name', 'Role']).map((h, i) => (
                          <th key={h} scope="col" style={{ ...th, textAlign: i >= 2 ? 'right' : 'left' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {crew.map((c) => (
                        <tr key={c.crewId} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ ...td, fontWeight: 600 }}>
                            <Link to={`/crew`} style={{ color: 'inherit', textDecoration: 'none' }} title={`Open ${c.name} in Crew Assist`}>
                              {c.name}
                            </Link>
                          </td>
                          <td style={{ ...td, color: 'var(--text2)' }}>{c.role}</td>
                          {canCrewMoney && (
                            <>
                              <td className="figure" style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>{formatMoney(c.dayRatePaisa)}</td>
                              <td className="figure" style={{ ...td, textAlign: 'right' }}>{days}</td>
                              <td className="figure" style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>{c.overtimePaisa > 0 ? formatMoney(c.overtimePaisa) : '—'}</td>
                              <td className="figure" style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>{c.mealsPaisa > 0 ? formatMoney(c.mealsPaisa) : '—'}</td>
                              <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                                {formatMoney((c.dayRatePaisa * days + c.overtimePaisa + c.accommodationPaisa + c.mealsPaisa) as Paisa)}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                      {canCrewMoney && (
                        <tr>
                          <td colSpan={6} style={{ ...td, fontWeight: 700, color: 'var(--text2)' }}>Crew Subtotal</td>
                          <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{formatMoney(crewChargesPaisa)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {crew.length === 0 && (
                  <div style={{ marginTop: 10 }}>
                    <EmptyState title="No crew assigned" description="Add a crew member to staff this booking." />
                  </div>
                )}
                {crew.length > 0 && (
                  <div style={{ marginTop: 9 }}>
                    <Button onClick={() => setCrew([])}>Clear crew</Button>
                  </div>
                )}
              </div>

              <div style={{ minWidth: 0 }}>
                <h3 style={sub}>Transport</h3>
                <Field label="Delivery Type">
                  <Select
                    value={deliveryType}
                    onChange={(e) => setDeliveryType(e.target.value as typeof deliveryType)}
                    style={inputStyle}
                  >
                    <option>Client Pickup</option>
                    <option>Babin Delivery</option>
                  </Select>
                </Field>
                {canBookingMoney && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 9 }}>
                    <Field label="Delivery Charge">
                      <Input
                        type="number"
                        min={0}
                        disabled={clientPickup}
                        value={clientPickup ? 0 : deliveryChargePaisa / 100}
                        onChange={(e) => setDeliveryChargePaisa(rupees(Math.max(0, Number(e.target.value) || 0)))}
                        style={{ ...inputStyle, opacity: clientPickup ? 0.55 : 1, cursor: clientPickup ? 'not-allowed' : 'text' }}
                      />
                    </Field>
                    <Field label="Fuel Charge">
                      <Input
                        type="number"
                        min={0}
                        disabled={clientPickup}
                        value={clientPickup ? 0 : fuelChargePaisa / 100}
                        onChange={(e) => setFuelChargePaisa(rupees(Math.max(0, Number(e.target.value) || 0)))}
                        style={{ ...inputStyle, opacity: clientPickup ? 0.55 : 1, cursor: clientPickup ? 'not-allowed' : 'text' }}
                      />
                    </Field>
                  </div>
                )}
                {/* §9.2 — Client Pickup forces both to zero. */}
                {clientPickup && (
                  <p style={{ margin: '8px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                    Client Pickup forces delivery and fuel charges to Rs 0. Overriding writes to audit.
                  </p>
                )}
                {canBookingMoney && (
                  <div style={{ marginTop: 11, paddingTop: 9, borderTop: '1px solid var(--border)' }}>
                    <MoneyRow label="Transport Total" value={formatMoney(transportPaisa)} strong />
                  </div>
                )}
              </div>
            </div>
          </Section>

          {canBookingMoney && (
            <Section
              no={4}
              title={SECTIONS[3]}
              open={open[3] ?? true}
              onToggle={() => toggle(3)}
              summary={`${formatMoney(breakdown.rentalTotal)} total · ${formatMoney(breakdown.outstanding)} outstanding`}
            >
              {/* §43–47 — three visually separate blocks: Rental Charges,
                  Deposit, Payment History. RENTAL TOTAL is the dominant figure;
                  Rental Outstanding and Deposit Pending never combine. */}
              <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(3, minmax(0,1fr))' : isPhone ? '1fr' : 'repeat(2, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
                <div style={moneyBlock}>
                  <h3 style={sub}>Rental Charges</h3>
                  {/* §10.1 in order — the displayed column sums to the displayed total. */}
                  {[
                    { l: 'Equipment Rental', v: formatMoney(equipmentPaisa) },
                    { l: 'Sub-Rental', v: '—' },
                    { l: 'Services', v: '—' },
                    { l: 'Crew Charges', v: formatMoney(crewChargesPaisa) },
                    { l: 'Transport', v: formatMoney(transportPaisa) },
                  ].map((r) => (
                    <MoneyRow key={r.l} label={r.l} value={r.v} {...(r.v === '—' ? { tone: 'var(--muted)' } : {})} />
                  ))}
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
                    <MoneyRow label="Subtotal" value={formatMoney(breakdown.subtotal)} />
                    <MoneyRow label={`Discount (${discountPct}%)`} value={`− ${formatMoney(breakdown.discount)}`} tone="var(--danger-text)" />
                    <MoneyRow label="Taxable Amount" value={formatMoney(breakdown.taxable)} />
                    <MoneyRow label={`VAT (${VAT_PCT}%)`} value={formatMoney(breakdown.vat)} />
                  </div>
                  {/* §45 — Rental Total is the dominant figure in this block. */}
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <MoneyRow label="RENTAL TOTAL" value={formatMoney(breakdown.rentalTotal)} big />
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <Field label="Discount %">
                      <Input
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
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--st-danger-fg)', lineHeight: 1.4 }}>
                          <Icon name="error" size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                          Above 10% — enter a reason of at least 10 characters and a named approver. No bypass.
                        </div>
                        <Input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="Reason" aria-label="Discount reason" style={{ ...inputStyle, marginTop: 7 }} />
                        <Input value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="Approver" aria-label="Discount approver" style={{ ...inputStyle, marginTop: 6 }} />
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
                  {/* §10.3 / §46 — deposits sit in their own block, outside the breakdown. */}
                  <div style={moneyBlock}>
                    <h3 style={sub}>Deposit — liability</h3>
                    <MoneyRow label="Deposit Required" value={formatMoney(depositRequiredPaisa)} />
                    <MoneyRow label="Deposit Received" value={formatMoney(depositReceivedPaisa)} tone="var(--success-text)" />
                    <MoneyRow label="Deposit Pending" value={formatMoney(depositPendingPaisa)} tone="var(--progress-text)" strong />
                    <p style={{ margin: '8px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                      Deposits are liabilities. They never enter Rental Total and never reduce Rental Outstanding.
                    </p>
                  </div>

                  {/* §47 — rental payments are their own block with their own label. */}
                  <div style={moneyBlock}>
                    <h3 style={sub}>Payments — rental only</h3>
                    <Field label="Advance Payment">
                      <Input
                        type="number"
                        min={0}
                        value={advancePaisa / 100}
                        onChange={(e) => setAdvancePaisa(rupees(Math.max(0, Number(e.target.value) || 0)))}
                        style={inputStyle}
                      />
                    </Field>
                    <div style={{ marginTop: 7 }}>
                      <MoneyRow
                        label="Rental Outstanding"
                        value={formatMoney(breakdown.outstanding)}
                        tone={breakdown.outstanding > 0 ? 'var(--danger-text)' : 'var(--success-text)'}
                        strong
                      />
                      <div style={{ display: 'flex', gap: 9, padding: '3px 0', fontSize: 'var(--t-meta)' }}>
                        <span style={{ flex: 1, color: 'var(--text2)' }}>Invoice State</span>
                        <span style={{ fontWeight: 600 }}>{invoiceState}</span>
                      </div>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                      <strong style={{ color: 'var(--text2)' }}>Partially Paid</strong> is an invoice state, not a payment
                      status — a payment is Received in full or it is not.
                    </p>
                  </div>
                </div>

                <div style={moneyBlock}>
                  <h3 style={sub}>Payment History</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--th-bg)' }}>
                          {['Date', 'Type', 'Amount', 'Method', 'Collected By'].map((h, i) => (
                            <th key={h} scope="col" style={{ ...th, textAlign: i === 2 ? 'right' : 'left' }}>
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
                            <td className="figure" style={td}>{r.d}</td>
                            <td style={td}>{r.t}</td>
                            <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{r.a}</td>
                            <td style={{ ...td, color: 'var(--text2)' }}>{r.m}</td>
                            <td style={{ ...td, color: 'var(--text2)' }}>{r.by}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
          )}

          <Section
            no={5}
            title={SECTIONS[4]}
            open={open[4] ?? true}
            onToggle={() => toggle(4)}
            summary="1 of 5 documents available"
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isDesktop
                  ? 'minmax(0,1.4fr) minmax(0,1fr)'
                  : viewport === 'tablet'
                    ? 'repeat(2, minmax(0,1fr))'
                    : 'minmax(0,1fr)',
                gap: 14,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h3 style={sub}>Documents</h3>
                <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                  {/* §11 — nothing is pre-generated on a Draft. */}
                  {[
                    { n: 'Quote', from: 'Quote', ready: true },
                    { n: 'Rental Agreement', from: 'Confirmed', ready: false },
                    { n: 'Packing List', from: 'Preparing', ready: false },
                    { n: 'Delivery Note', from: 'Dispatched', ready: false },
                    { n: 'Invoice', from: 'invoice generated', ready: false },
                  ].map((d) => (
                    <div
                      key={d.n}
                      title={d.ready ? `${d.n} is available now` : `${d.n} becomes available at ${d.from}`}
                      style={{ width: 104, padding: '10px 9px', borderRadius: 'var(--r-btn)', background: 'var(--card2)', textAlign: 'center' }}
                    >
                      <Icon name="file" size={18} style={{ color: d.ready ? 'var(--link)' : 'var(--disabled)' }} />
                      <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', marginTop: 5, lineHeight: 1.25 }}>{d.n}</div>
                      <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', marginTop: 2 }}>{d.ready ? 'Available' : `At ${d.from}`}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <h3 style={sub}>Review Summary</h3>
                {/* §11 — never all green while a Critical alert is open. */}
                {[
                  { l: 'Client', ok: Boolean(client) && govId.trim().length > 0 },
                  { l: 'Equipment', ok: lines.length > 0 && conflictLines.length === 0 },
                  { l: 'Crew', ok: true },
                  { l: 'Pricing', ok: !discountUnapproved && breakdown.rentalTotal > 0 },
                  { l: 'Payments', ok: breakdown.outstanding <= 0 },
                  { l: 'Documents', ok: false },
                ].map((r) => (
                  <div key={r.l} style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center', padding: '4px 0', fontSize: 'var(--t-meta)' }}>
                    <Icon name={r.ok ? 'check' : 'alert_triangle'} size={13} style={{ color: r.ok ? 'var(--success-text)' : 'var(--progress-text)', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: 'var(--text2)' }}>{r.l}</span>
                    <span style={{ fontWeight: 600, color: r.ok ? 'var(--text)' : 'var(--progress-text)' }}>{r.ok ? 'Complete' : 'Pending'}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* §58 — the footer reports the save state and nothing else. The one
              real Save Draft action lives in the header; a second large button
              here read as a second primary and had to go. */}
          <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 2px', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            {saveState === 'saving' ? (
              <>
                <Icon name="refresh" size={13} style={{ color: 'var(--text2)' }} />
                Saving…
              </>
            ) : saveState === 'error' ? (
              /* "All changes saved" is a success claim, and it was being made
                 one tick after a save that rejected. The detail lives in the
                 inline error line above; this only stops the claim. */
              <>
                <Icon name="error" size={13} style={{ color: 'var(--danger-text)' }} />
                <span style={{ color: 'var(--danger-text)', fontWeight: 600 }}>Not saved</span>
              </>
            ) : !online ? (
              <>
                <Icon name="plug" size={13} style={{ color: 'var(--progress-text)' }} />
                Offline · Changes saved locally
              </>
            ) : (
              <>
                <Icon name="check" size={13} style={{ color: 'var(--success-text)' }} />
                All changes saved
              </>
            )}
          </div>
        </div>

        {/* §65 — desktop: main plus a sticky rail. The negative-margin/padding
            pair keeps the rail's collapse handle (which sits at left:-12)
            inside the sticky box instead of clipped by it. */}
        {isDesktop && (
          <div style={{ position: 'sticky', top: 12, alignSelf: 'start', maxHeight: 'calc(100vh - 24px)', overflowY: 'auto', paddingLeft: 14, marginLeft: -14 }}>
            <Rail width={300}>{railCards}</Rail>
          </div>
        )}
      </div>

      {/* §65 — tablet and phone: the rail's cards become a full-width panel
          below the workspace, and the summary follows as a sticky bottom bar.
          Width decides this, never orientation and never a platform check. */}
      {!isDesktop && (
        <div style={{ display: 'grid', gridTemplateColumns: viewport === 'tablet' ? 'repeat(2, minmax(0,1fr))' : '1fr', gap: 'var(--sp-md)', alignItems: 'start' }}>
          {railCards}
        </div>
      )}

      <FooterNote extra={['Sections are not a wizard — any order, one Confirm']} />

      {/* §65 — the sticky bottom summary + primary action for tablet and phone,
          where the rail is no longer beside the work. */}
      {!isDesktop && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-md)',
            padding: '9px 12px',
            marginTop: 4,
            background: 'var(--card)',
            borderTop: '1px solid var(--border)',
            borderRadius: 'var(--r-card) var(--r-card) 0 0',
            boxShadow: '0 -4px 16px rgba(0,0,0,0.10)',
          }}
        >
          {canBookingMoney && (
            <div style={{ display: 'flex', gap: 14, minWidth: 0, flex: 1 }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 'var(--t-th)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text2)' }}>Rental Total</span>
                <span className="figure" style={{ display: 'block', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{formatMoney(breakdown.rentalTotal)}</span>
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 'var(--t-th)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text2)' }}>Outstanding</span>
                <span className="figure" style={{ display: 'block', fontSize: 'var(--t-ui)', fontWeight: 700, color: breakdown.outstanding > 0 ? 'var(--danger-text)' : 'var(--success-text)' }}>
                  {formatMoney(breakdown.outstanding)}
                </span>
              </span>
            </div>
          )}
          <span style={{ marginLeft: canBookingMoney ? 0 : 'auto' }} title={blockReasonText}>
            <Button icon="check" variant="primary" onClick={confirmBooking} disabled={confirmBlocked}>
              Confirm Booking
            </Button>
          </span>
        </div>
      )}

      {/* ── Disclosures. None of these route; the booking stays behind them. ── */}
      {client && (
        <ClientQuickView
          id="new-rental-client-quick-view"
          client={client}
          open={quickViewOpen}
          onClose={() => setQuickViewOpen(false)}
          onViewClient={(c) => navigate(`/clients/${c.id}`)}
          showMoney={canClientBalance}
        />
      )}
      {client && (
        <ClientHistoryDrawer
          id="new-rental-client-history"
          client={client}
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          onOpenBooking={(bookingNo) => navigate(`/rentals/${bookingNo}`)}
          onViewClient={(c) => navigate(`/clients/${c.id}`)}
          showMoney={canClientBalance}
        />
      )}
      {/* §15 / §18 — Add Client reuses the Clients module's own record shape and
          auto-selects on create, so the operator never searches for the client
          they just typed in. */}
      <AddClientModal
        isOpen={addClientOpen}
        onClose={() => setAddClientOpen(false)}
        onCreated={onClientCreated}
        /* The modal closes itself after this fires — do not close it here too. */
        onUseExisting={(c) => {
          setSelectedClientId(c.id)
          setGovId(c.pan ?? '')
        }}
      />
    </div>
  )
}
