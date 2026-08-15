import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { ConfirmDialog, Input, Select } from '../../components/ui'
import { Card, PageHeader, Button, Rail, FooterNote, cardStyle } from '../../components/ui/Page'
import { EmptyState } from '../../components/ui/StateViews'
import { useToast } from '../../components/ui/Toast'
import { BREAKPOINT, useViewport } from '../../lib/device'
import { useNetwork } from '../../lib/network'
import { STATUS } from '../../lib/status'
import { statusToken } from '../../lib/workflow'
import type { BookingStatus } from '../../lib/workflow'
import { toBs, formatBs, formatAd } from '../../lib/bs'
import { validateDiscount } from '../../lib/discount'
import type { DiscountValidationResult } from '../../lib/discount'
import { getSetting } from '../../lib/settingsStore'
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
import { canRecordPayment } from '../../lib/rbac'
import {
  AddClientModal,
  AddItemPanel,
  ClientCombobox,
  ClientHealthEye,
  ClientHistoryDrawer,
  ClientQuickView,
  DateTimeField,
  DraftEmailModal,
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

/**
 * The VAT rate is **read from Settings**, never a literal.
 *
 * `VAT_PCT = 13` used to live here and is deleted: `PLAN.md` §5 Conventions
 * bans "a hardcoded VAT rate", and `WIREFRAME_RULINGS_2026-08-12.md` §7 rules
 * that spec 01's drawn `VAT 13%` is read as `VAT {rate}%` off
 * `settingsStore`'s `vatRatePercent`. Read once per mount — the same shape
 * every other consumer of `getSetting` uses; a rate changed in another tab
 * lands on the next mount, not mid-booking.
 */
function readVatRatePercent(): number {
  const n = Number(getSetting('vatRatePercent'))
  return Number.isFinite(n) ? n : 0
}

/**
 * 01_NEW_RENTAL §1.1 rail — `Discount  chips`.
 *
 * Law 10 caps discounts at 25%, so **no chip may exceed 25** and none does.
 * Anything above 10 opens the reason + approver popover before it can be
 * applied; `lib/discount.ts`'s `validateDiscount()` is what actually gates
 * Confirm, so a chip can never quietly authorise itself.
 */
const DISCOUNT_CHIPS = [0, 5, 10, 15, 20, 25] as const

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

// redesign v1 §6 — "Documents & Review" is no longer a section in the body;
// it moved into the rail as the Review + Documents cards, so the checklist
// that decides whether Confirm is ready sits beside Confirm instead of a
// screen away from it.
/**
 * 01_NEW_RENTAL §1.1 draws five boxes down the main column — CLIENT · DATES ·
 * EQUIPMENT · ＋Crew · ＋Delivery — so Client & Schedule splits into Client and
 * Dates, and Crew & Transport splits into Crew and Delivery. Pricing &
 * Payments is **not** in the drawing and stays anyway: the wireframes are a
 * layout spec, not a content inventory (`WIREFRAME_RULINGS_2026-08-12.md` §1
 * names this section explicitly as kept), and the rail is a summary of it
 * rather than a replacement for it.
 */
const SECTIONS = [
  'Client',
  'Dates',
  'Equipment, Bundles & Services',
  'Crew',
  'Delivery',
  'Pricing & Payments',
] as const

/** redesign v1 §6 — one review item per fact, shared by the rail's Review
 *  card and the id each maps to. Payments and Documents don't have their own
 *  body section any more; Payments jumps to Pricing & Payments and Documents
 *  jumps to the rail's own Documents card. */
interface ReviewItem {
  label: string
  ok: boolean
  targetId: string
}

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

/**
 * redesign v1 §7.4 — qty and days as steppers rather than boxed number
 * inputs, so the equipment table reads as a table again instead of a form
 * embedded in one. Each glyph button keeps the 44×44 hit area via
 * `TouchInset` while staying visually compact for table density.
 */
function Stepper({ value, min = 1, onChange, disabled, label }: { value: number; min?: number; onChange: (n: number) => void; disabled?: boolean; label: string }) {
  const btnStyle = (dis: boolean) => ({
    position: 'relative' as const,
    width: 20,
    height: 20,
    display: 'grid' as const,
    placeItems: 'center' as const,
    borderRadius: 'var(--r-xs)',
    border: '1px solid var(--border)',
    background: 'var(--card2)',
    color: 'var(--text2)',
    cursor: dis ? 'not-allowed' : 'pointer',
    opacity: dis ? 0.5 : 1,
  })
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <button type="button" className="press" aria-label={`Decrease ${label}`} disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - 1))} style={btnStyle(Boolean(disabled) || value <= min)}>
        <TouchInset />
        <Icon name="minus" size={10} />
      </button>
      <span className="figure" style={{ minWidth: 18, textAlign: 'center', fontSize: 'var(--t-meta)', fontWeight: 600, color: disabled ? 'var(--muted)' : 'var(--text)' }}>{value}</span>
      <button type="button" className="press" aria-label={`Increase ${label}`} disabled={disabled} onClick={() => onChange(value + 1)} style={btnStyle(Boolean(disabled))}>
        <TouchInset />
        <Icon name="plus" size={10} />
      </button>
    </div>
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
 * §59 — **the** section header. All sections render through this one
 * component; there is no second heading style anywhere on the page, which is
 * what stops Section 4 slowly drifting away from Section 1.
 *
 * redesign v1 §7.1 — plain heading and its collapse chevron only, no numbered
 * pill. A numbered circle reads as step one of a wizard, and the footer says
 * explicitly "Sections are not a wizard" — the pills contradicted the note.
 *
 * Equipment is expanded by default (§6); on a phone the lower sections start
 * collapsed (§65) and their header carries a one-line summary so a collapsed
 * section is still informative.
 */
function Section({
  id,
  title,
  open,
  onToggle,
  action,
  summary,
  children,
}: {
  /** Scroll target for the rail's Review card — see `jumpToSection`. */
  id?: string
  title: string
  open: boolean
  onToggle: () => void
  action?: React.ReactNode
  /** Shown in the header when collapsed, so collapsing never hides the facts. */
  summary?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} style={{ ...cardStyle, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderBottom: open ? '1px solid var(--border)' : 'none' }}>
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

/**
 * redesign v1 §5 — `Send Quote` becomes a split button: `[Send Quote ▾]` →
 * Email to client · Download PDF · Copy link · Print. Same shell as
 * `OperationsMenu` above (outside-click + Escape close), but each item
 * carries a real handler — Operations' items are inert by design (§4.1,
 * nothing to dispatch to at Draft); this menu's are not.
 *
 * Download PDF and Copy link have no generator/link service in this build —
 * disabled with the reason stated, the same "honest gap" shape
 * `itemCatalogue.ts`'s `SERVICES_UNAVAILABLE_REASON` and Settings.tsx's `N()`
 * destinations already use, rather than a button that does nothing.
 */
function SendQuoteMenu({ onEmail }: { onEmail: () => void }) {
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

  const items: Array<{ label: string; icon: IconName; onClick?: () => void; disabledReason?: string }> = [
    { label: 'Email to client', icon: 'mail', onClick: onEmail },
    { label: 'Download PDF', icon: 'download', disabledReason: 'No PDF generator is connected in this build.' },
    { label: 'Copy link', icon: 'external_link', disabledReason: 'No shareable-link service is connected in this build.' },
    { label: 'Print', icon: 'file', onClick: () => window.print() },
  ]

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="press"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Send Quote"
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
          cursor: 'pointer',
        }}
      >
        Send Quote
        <Icon name="chevron_down" size={14} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Send Quote options"
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
              disabled={!it.onClick}
              title={it.disabledReason}
              onClick={() => {
                it.onClick?.()
                setOpen(false)
              }}
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
                cursor: it.onClick ? 'pointer' : 'not-allowed',
                opacity: it.onClick ? 1 : 0.5,
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

/** Off-screen but in the accessibility tree — no global `.sr-only` exists in this build. */
const srOnly = {
  position: 'absolute' as const,
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap' as const,
  border: 0,
}

/* ── Equipment grouping — 01_NEW_RENTAL Notes: "Equipment list renders
 *    parent-first with children nested." ─────────────────────────────────── */

interface LineGroup {
  key: string
  kind: 'bundle' | 'model'
  /** The parent row's name — a bundle name, or the model name off its units. */
  label: string
  lines: Line[]
}

/**
 * Parent-first grouping. The key already exists in the data — a line added as
 * part of a bundle carries `bundleCode`/`bundleName` (stamped in `addDrafts`),
 * and every serialised unit of one model shares that model's `name`. Only the
 * *rendering* was flat, so this derives the tree and invents nothing.
 *
 * Insertion order is preserved: a group takes the position of its first line,
 * so adding a second unit of a model never reshuffles the table.
 */
function groupLines(lines: readonly Line[]): LineGroup[] {
  const order: string[] = []
  const byKey = new Map<string, LineGroup>()
  for (const l of lines) {
    const key = l.bundleCode ? `bundle:${l.bundleCode}` : `model:${l.name}`
    let g = byKey.get(key)
    if (!g) {
      g = {
        key,
        kind: l.bundleCode ? 'bundle' : 'model',
        label: l.bundleCode ? (l.bundleName ?? l.bundleCode) : l.name,
        lines: [],
      }
      byKey.set(key, g)
      order.push(key)
    }
    g.lines.push(l)
  }
  return order.map((k) => byKey.get(k)).filter((g): g is LineGroup => g !== undefined)
}

/**
 * A bundle always nests (parent → children is what a bundle *is*). A model
 * nests once it holds more than one physical unit; a single line would
 * otherwise be a parent row with one identical child under it.
 */
function isNested(g: LineGroup): boolean {
  return g.kind === 'bundle' || g.lines.length > 1
}

/**
 * The `⋮` the wireframe draws on every parent row. Only real actions appear —
 * there is no third "…" entry standing in for something unbuilt.
 */
function RowMenu({ label, items }: { label: string; items: Array<{ label: string; icon: IconName; onClick: () => void }> }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node | null)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="press"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        style={{ position: 'relative', width: 26, height: 26, display: 'grid', placeItems: 'center', borderRadius: 'var(--r-xs)', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
      >
        <TouchInset />
        <Icon name="more_vert" size={15} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          style={{ position: 'absolute', zIndex: 40, top: 'calc(100% + 4px)', right: 0, minWidth: 210, padding: 5, background: 'var(--dropdown)', border: '1px solid var(--border)', borderRadius: 'var(--r-card)', boxShadow: 'var(--shadow-modal)' }}
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className="press"
              onClick={() => {
                it.onClick()
                setOpen(false)
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', width: '100%', minHeight: 40, padding: '0 9px', borderRadius: 'var(--r-btn)', border: 'none', background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: 'var(--t-meta)', fontWeight: 600, textAlign: 'left', cursor: 'pointer' }}
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

/**
 * The rail's `VAT {rate}%  [on ▢]` control.
 *
 * Law 11 — never colour alone: the switch carries an icon and the words On /
 * Off beside it, so the state is readable with no colour perception at all.
 * The *rate* is the caller's, read from Settings; this component never knows
 * a number.
 */
function VatToggle({ ratePercent, on, onChange }: { ratePercent: number; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="press"
      onClick={() => onChange(!on)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        width: '100%',
        minHeight: 30,
        padding: '3px 2px',
        border: 'none',
        background: 'transparent',
        color: 'var(--text2)',
        fontFamily: 'inherit',
        fontSize: 'var(--t-meta)',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <TouchInset />
      <span style={{ flex: 1, minWidth: 0 }}>VAT {ratePercent}%</span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: 20,
          padding: '0 7px',
          borderRadius: 'var(--r-badge)',
          background: on ? 'var(--st-in-bg)' : 'var(--st-neutral-bg)',
          color: on ? 'var(--st-in-fg)' : 'var(--st-neutral-fg)',
          fontSize: 'var(--t-th)',
          fontWeight: 700,
        }}
      >
        <Icon name={on ? 'check' : 'close'} size={11} />
        {on ? 'On' : 'Off'}
      </span>
    </button>
  )
}

/**
 * The rail's `Discount  chips` row, plus the Law 10 popover it opens.
 *
 * `WIREFRAME_RULINGS_2026-08-12.md` §7: *"Chips open a popover carrying both
 * fields; `validateDiscount()` gates Confirm; no chip above 25%."* A 300px rail
 * has nowhere to put a ten-character reason and a named approver inline, and
 * the chip row on its own cannot satisfy Law 10 — so a chip above 10% opens
 * the popover and the popover carries both fields.
 *
 * The chips do **not** authorise anything. They set the percent; the page's
 * `validateDiscount()` verdict is what blocks Confirm, and it stays blocked
 * until the reason and the approver are real.
 */
function DiscountChips({
  percent,
  onPercent,
  reason,
  onReason,
  approver,
  onApprover,
  verdict,
  amount,
  open,
  onOpenChange,
  inputStyle: fieldStyle,
}: {
  percent: number
  onPercent: (n: number) => void
  reason: string
  onReason: (v: string) => void
  approver: string
  onApprover: (v: string) => void
  verdict: DiscountValidationResult
  amount: string
  open: boolean
  onOpenChange: (v: boolean) => void
  inputStyle: React.CSSProperties
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node | null)) onOpenChange(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  return (
    <div ref={rootRef} style={{ position: 'relative', padding: '3px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Discount</span>
        <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: percent > 0 ? 'var(--danger-text)' : 'var(--text)', whiteSpace: 'nowrap' }}>
          {percent > 0 ? `− ${amount}` : amount}
        </span>
      </div>
      <div role="group" aria-label="Discount percentage" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
        {DISCOUNT_CHIPS.map((p) => {
          const active = percent === p
          return (
            <button
              key={p}
              type="button"
              className="press"
              aria-pressed={active}
              aria-label={`${p}% discount`}
              onClick={() => {
                onPercent(p)
                // Law 10 — anything above the threshold needs a reason and an
                // approver, so the fields open with the chip rather than the
                // operator having to find them.
                onOpenChange(p > 10)
              }}
              style={{
                position: 'relative',
                minHeight: 24,
                padding: '0 9px',
                borderRadius: 'var(--r-badge)',
                border: `1px solid ${active ? 'var(--st-primary-fg)' : 'var(--border)'}`,
                background: active ? 'var(--st-primary-bg)' : 'var(--card2)',
                color: active ? 'var(--st-primary-fg)' : 'var(--text2)',
                fontFamily: 'inherit',
                fontSize: 'var(--t-th)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <TouchInset />
              {p}%
            </button>
          )
        })}
        {/* The chips are presets, not the whole range — a 7% booking must still
            be reachable, and it is, from Pricing & Payments' own field. This
            button is how the operator gets from the rail to that field's
            approval pair without leaving the summary. */}
        {percent > 10 && (
          <button
            type="button"
            className="press"
            aria-expanded={open}
            aria-label={verdict.valid ? 'Edit discount approval' : 'Discount approval required'}
            onClick={() => onOpenChange(!open)}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              minHeight: 24,
              padding: '0 9px',
              borderRadius: 'var(--r-badge)',
              border: `1px solid ${verdict.valid ? 'var(--st-in-fg)' : 'var(--st-danger-fg)'}`,
              background: verdict.valid ? 'var(--st-in-bg)' : 'var(--st-danger-bg)',
              color: verdict.valid ? 'var(--st-in-fg)' : 'var(--st-danger-fg)',
              fontFamily: 'inherit',
              fontSize: 'var(--t-th)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <TouchInset />
            <Icon name={verdict.valid ? 'check' : 'error'} size={11} />
            {verdict.valid ? 'Approved' : 'Approval needed'}
          </button>
        )}
      </div>

      {open && (
        <div
          role="group"
          aria-label="Discount approval"
          style={{
            position: 'absolute',
            zIndex: 40,
            top: 'calc(100% + 6px)',
            right: 0,
            left: 0,
            padding: 10,
            background: 'var(--dropdown)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            boxShadow: 'var(--shadow-modal)',
          }}
        >
          <p style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--danger-text)', lineHeight: 1.4 }}>
            <Icon name="error" size={12} style={{ flexShrink: 0, marginTop: 2 }} />
            {verdict.error ?? 'Above 10% — a reason of at least 10 characters and a named approver. No bypass, including Owner.'}
          </p>
          <Input
            value={reason}
            onChange={(e) => onReason(e.target.value)}
            placeholder="Reason (10 characters minimum)"
            aria-label="Discount reason"
            style={{ ...fieldStyle, marginTop: 7 }}
          />
          <Input
            value={approver}
            onChange={(e) => onApprover(e.target.value)}
            placeholder="Approver"
            aria-label="Discount approver"
            style={{ ...fieldStyle, marginTop: 6 }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        </div>
      )}
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
  /*
   * Money VISIBILITY (`canBookingMoney`, above) is not permission to move
   * money. The rail's `Receive Payment` / `Receive Deposit` pair is the same
   * action `RecordPaymentModal` performs elsewhere, and `rbac.canRecordPayment`
   * — Owner / Coordinator / Accounts — is the rule `actions/core.ts` resolves
   * `payment.create` through. Admin and Manager pass the visibility gate and
   * fail this one, which is exactly the gap that put a refusable button in
   * front of them on Finance and BookingDetail.
   *
   * ⚠ These two buttons are inert in this build (no `onClick`), so nothing is
   * refused today. The gate is here so that whoever wires them up inherits the
   * permission rather than reopening the hole. Absent, not disabled —
   * `MovementList.tsx`'s row menu drops the entry it cannot offer.
   */
  const canTakePayment = user ? canRecordPayment(user.role) : false
  // §1.4 — the retired `Draft` stage is status Quote plus a Draft flag.
  const status: BookingStatus = 'Quote'
  const flag = 'Draft'

  /**
   * Any section, any order — never a wizard.
   *
   * Desktop and tablet open Client · Dates · Equipment · Pricing and leave
   * Crew and Delivery collapsed, which is exactly what 01_NEW_RENTAL §1.1
   * draws ("＋ Crew (collapsed)", "＋ Delivery (collapsed → Client Pickup
   * Rs 0)"). Phone is an accordion with **one open at a time**, per the same
   * spec's phone block; Equipment is the one it lands on.
   */
  /*
   * Read from `viewport`, not `window.innerWidth`.
   *
   * This used to call `window.innerWidth < BREAKPOINT.phone` twice — once in
   * the lazy initializer and once inside `toggle` — which is an imperative
   * read of a value `lib/device` already publishes reactively off
   * `matchMedia` change events. It gave the right answer only at mount:
   * narrowing a desktop window past 768 left four sections open where §1.1's
   * phone block wants one, and the first paint before layout settles could
   * pick the wrong band and never correct it. The effect below is what makes
   * a band change actually reach the accordion.
   */
  const phoneAccordion = viewport === 'phone'
  const [open, setOpen] = useState<boolean[]>(() =>
    typeof window !== 'undefined' && window.innerWidth < BREAKPOINT.phone
      ? [false, false, true, false, false, false]
      : [true, true, true, false, false, true],
  )
  useEffect(() => {
    if (!phoneAccordion) return
    // Crossing into the phone band collapses to one open section, keeping the
    // first one already open (Equipment by default) rather than closing them
    // all and leaving a wall of headers.
    setOpen((p) => {
      const openCount = p.filter(Boolean).length
      if (openCount <= 1) return p
      const first = p.indexOf(true)
      return p.map((_, j) => j === first)
    })
  }, [phoneAccordion])
  const toggle = (i: number) =>
    setOpen((p) =>
      // Phone: opening a section closes the others. Width decides, never
      // orientation and never a platform check (Law 13/14).
      phoneAccordion
        ? p.map((v, j) => (j === i ? !v : false))
        : p.map((v, j) => (j === i ? !v : v)),
    )

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
  /* The tablet/phone rail handle is gone. `WIREFRAME_RULINGS_2026-08-12.md` §7:
     "Right rails collapse below 1180" means **reflow, not hide** — the rail's
     cards render inline beneath the workspace at tablet and phone, always
     visible, and only the summary + Confirm move into the sticky bar. A
     collapsed handle hid the blocking notices, which Law 12 forbids. */
  /** redesign v1 §5 — which document the draft-email modal is composing for; null = closed. */
  const [emailDraftDoc, setEmailDraftDoc] = useState<string | null>(null)

  const [project, setProject] = useState("'Echoes of Mustang'")
  const [kind, setKind] = useState('Documentary Film')
  const [govId, setGovId] = useState(client?.pan ?? '')
  const [pickup, setPickup] = useState('2026-07-16')
  const [ret, setRet] = useState('2026-07-19')
  // redesign v1 §4 — the rental day runs 06:00→06:00, so a booking with no
  // time cannot be priced correctly at the boundary. Defaults are 09:00
  // pickup / 18:00 return, editable, never blank. Day-count pricing still
  // reads dates only (unchanged engine behaviour, §67) — capturing the time
  // here is the UI half of the fix; teaching `price()` the 06:00 boundary is
  // a pricing-engine change, out of scope for a layout-and-behaviour redesign.
  const [pickupTime, setPickupTime] = useState('09:00')
  const [returnTime, setReturnTime] = useState('18:00')
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
  /** redesign v1 §7.5 — Overtime and Meals were clipped at this table's width;
   *  they now live behind a per-row expand instead of two columns of their own. */
  const [expandedCrew, setExpandedCrew] = useState<Set<string>>(new Set())
  const toggleCrewExpanded = (crewId: string) =>
    setExpandedCrew((prev) => {
      const next = new Set(prev)
      if (next.has(crewId)) next.delete(crewId)
      else next.add(crewId)
      return next
    })
  const [deliveryChargePaisa, setDeliveryChargePaisa] = useState<Paisa>(rupees(0) as Paisa)
  const [fuelChargePaisa, setFuelChargePaisa] = useState<Paisa>(rupees(0) as Paisa)
  const [discountPct, setDiscountPct] = useState(7)
  const [discountReason, setDiscountReason] = useState('')
  const [approver, setApprover] = useState('')
  /** The rail's chip row opens this when a chip above 10% is chosen (Law 10). */
  const [discountPopoverOpen, setDiscountPopoverOpen] = useState(false)
  /**
   * The VAT rate, read from Settings ▸ Financial once per mount. The literal
   * `VAT_PCT = 13` this page used to carry is deleted — see `readVatRatePercent`.
   */
  const [vatRatePercent] = useState<number>(readVatRatePercent)
  /** 01_NEW_RENTAL §1.1 rail — `VAT {rate}%  [on ▢]`. On is the default. */
  const [vatOn, setVatOn] = useState(true)
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
        // The rail's VAT switch: off means the rate is 0 for this booking, not
        // that the configured rate changed. The rate itself is Settings'.
        vatPercent: vatOn ? vatRatePercent : 0,
        payments: advancePaisa,
      }),
    [equipmentPaisa, crewChargesPaisa, transportPaisa, discountPct, vatOn, vatRatePercent, advancePaisa],
  )

  /** §10.4, as ruled: this is the *invoice* state, not a payment status. */
  const invoiceState = advancePaisa <= 0 ? 'Unpaid' : advancePaisa < breakdown.rentalTotal ? 'Partially Paid' : 'Paid'

  const depositPendingPaisa = (depositRequiredPaisa - depositReceivedPaisa) as Paisa

  /* ── §12 alerts. Critical blocks Confirm; Warning blocks Handover. ─────── */
  // §03 — a real conflict reads the unit's own status/booking, not a fabricated one.
  const conflictLines = lines.filter((l) => l.status !== 'In Stock')
  /**
   * Law 10, through the engine rather than a re-derivation on the page.
   *
   * This used to be a hand-written `discountPct > 10 && (reason < 10 ||
   * !approver)` here — the same rule `lib/discount.ts` already owns, which is
   * exactly the Law 1 duplication that lets one copy drift. `validateDiscount`
   * is now the single source, it is what gates Confirm, and its own message is
   * what the operator reads.
   */
  const discountVerdict = validateDiscount(discountPct, discountReason, approver.trim() || null)
  const discountUnapproved = !discountVerdict.valid

  const alerts: Array<{ text: string; severity: 'Critical' | 'Warning' | 'Information'; action: string }> = [
    ...conflictLines.map((l) => ({
      text: l.committedTo !== '—' ? `Equipment conflict — ${l.name} committed to ${l.committedTo}` : `Equipment conflict — ${l.name} is ${l.status}`,
      severity: 'Critical' as const,
      action: 'Open Inventory',
    })),
    ...(!client ? [{ text: 'No client selected', severity: 'Critical' as const, action: 'Select Client' }] : []),
    ...(client && govId.trim().length === 0 ? [{ text: 'Missing client ID or PAN', severity: 'Critical' as const, action: 'Edit Client' }] : []),
    ...(discountUnapproved
      ? [{ text: discountVerdict.error ?? 'Discount is not authorised.', severity: 'Critical' as const, action: 'Request Approval' }]
      : []),
    // §02 — client financial warning. Booking may still proceed; this is a warning, not a block.
    ...(canBookingMoney && client && client.outstandingPaisa > 0
      ? [{ text: `Client has ${formatMoney(client.outstandingPaisa)} outstanding`, severity: 'Warning' as const, action: 'View Client' }]
      : []),
    /*
     * These two notices are NOT gated on `canTakePayment`, deliberately.
     *
     * Their button does not record anything — `runNoticeAction` scrolls to the
     * rail's Summary card (redesign v1 §1: "a notice never repeats the money
     * buttons"). The notice TEXT is a warning a Manager is entitled to read,
     * and §12 requires every alert to carry exactly one action, so dropping
     * either the row or its button would break a spec invariant to fix a label.
     *
     * TODO(decision): for a role that may see booking money but may not record
     * a payment (Admin, Manager), these notices still say "Receive Payment" /
     * "Receive Deposit" while the rail card they scroll to now has no such
     * button. What the notice should say instead — "View Balance"? nothing? —
     * is a copy/product decision and is not invented here.
     */
    ...(canBookingMoney && depositRequiredPaisa > depositReceivedPaisa
      ? [{ text: `Deposit ${formatMoney(depositPendingPaisa)} pending`, severity: 'Warning' as const, action: 'Receive Deposit' }]
      : []),
    ...(canBookingMoney && breakdown.outstanding > 0 ? [{ text: 'Rental outstanding', severity: 'Warning' as const, action: 'Receive Payment' }] : []),
  ]
  const critical = alerts.filter((a) => a.severity === 'Critical')
  /** Warnings and information — the criticals live in the blocking-notices card. */
  const nonBlockingAlerts = alerts.filter((a) => a.severity !== 'Critical')
  const confirmBlocked = critical.length > 0 || days === 0

  /**
   * 01_NEW_RENTAL §1.1 — the rail's `⚠ blocking notices (inline, persists)`.
   *
   * Every reason Confirm is refused, in full, in one list. The bad date is in
   * here too: it blocks Confirm and had no home in the alert model, so it read
   * only as a sentence under the page header.
   *
   * Law 12 — inline and persistent. This never becomes a toast and is never
   * truncated into the sticky bar; at tablet and phone the card detaches from
   * the rail and renders immediately above that bar instead.
   */
  const blockingNotices: Array<{ text: string; action: string }> = [
    ...(days === 0 ? [{ text: 'The return date must be later than the pickup date.', action: 'Open Dates' }] : []),
    ...critical.map((a) => ({ text: a.text, action: a.action })),
  ]
  const blockReasonText = confirmBlocked
    ? `Blocked — ${blockingNotices.length} ${blockingNotices.length === 1 ? 'notice' : 'notices'} must be resolved before this booking can be confirmed.`
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
  /**
   * Has a Save Draft actually landed? This is what makes `[Cancel]` two
   * behaviours instead of one (Law 3, and `WIREFRAME_RULINGS_2026-08-12.md` §7):
   *
   *  - **false** — nothing was persisted, so Cancel discards local state and
   *    navigates away. No law is engaged; there is no row to delete.
   *  - **true** — a draft row exists, so Cancel is a *named terminal
   *    transition* on it (`CANCEL_RENTAL`), behind a `ConfirmDialog` with a
   *    reason. It is never a delete.
   */
  const [draftPersisted, setDraftPersisted] = useState(false)
  /** null = closed. 'discard' is the pre-save behaviour, 'cancel' the post-save one. */
  const [cancelIntent, setCancelIntent] = useState<'discard' | 'cancel' | null>(null)
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
        // Only a *landed* save flips this. Cancel's second behaviour hangs off
        // it, so setting it optimistically would offer a terminal transition
        // on a row that does not exist.
        setDraftPersisted(true)
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
    /*
     * ⛔ This used to dispatch `confirmRental({ id: 'bk-new' }, ctx)`.
     *
     * `'bk-new'` is not a booking. This screen holds the whole booking in local
     * state and has never persisted a row — `saveDraft` and `createRental` are
     * both still stubs — so there is no `bookings.id` and no `B-` number to
     * name. CONFIRM_RENTAL is now a real write (`actions/rentals/confirmRental.ts`):
     * it resolves the reference against `bookings` and moves the stage
     * `Quote → Booked` by inserting a `booking_stage_transitions` row. Sent a
     * placeholder, it refuses with "No booking matches bk-new" — truthful, but
     * it reports a reference the operator never typed and hides the actual gap.
     *
     * So the gap is stated instead, and no fabricated id is sent. Confirm is a
     * transition on a SAVED Quote; this page's job is to create one first.
     * TODO: when CREATE_RENTAL persists a booking, dispatch it here and pass the
     * returned `bookings.id` (or its `booking_no`) straight into `confirmRental`
     * with a `clientUuid` minted at this press — see `BookingDetail.tsx`'s
     * `confirmBooking`, which is the wired version of exactly that call.
     *
     * `navigate('/rentals')` is deliberately not called: landing on the rentals
     * list is this app's universal "the write landed" signal, and nothing
     * landed.
     */
    setActionError(
      'Not confirmed — this booking has not been saved yet, so there is nothing to confirm. Confirm moves a ' +
        'SAVED quote from Quote to Booked; creating the booking row is CREATE_RENTAL, which is not built yet ' +
        '(src/actions/rentals/createRental.ts). Nothing was written, and nothing entered here has been lost.',
    )
  }, [confirmBlocked, dispatchContext])

  /**
   * `[Cancel]` — **two behaviours, never one**.
   *
   * `WIREFRAME_RULINGS_2026-08-12.md` §7 rules spec 01's single `[Cancel]`
   * against Law 3 ("Nothing is deleted"): a Cancel that discards a *saved*
   * draft is a delete. So the button asks which situation it is in first.
   *
   * The discard path touches nothing persisted, so it just leaves. It still
   * confirms, because a half-built booking is real work even when no row
   * exists for it — but it takes no reason and dispatches nothing.
   */
  const discardDraft = useCallback(() => {
    setCancelIntent(null)
    navigate('/rentals')
  }, [navigate])

  /**
   * The post-save path: `CANCEL_RENTAL`, the named terminal transition, with
   * the reason the dialog collected. The action is not marked `implemented`
   * (see `SUCCESS_FABRICATION_REGISTER_2026-08-12.md` — no page agent may mark
   * one, doing so turns a lie into a wrong write), so `actions/core.ts` refuses
   * it and the operator reads *why* instead of a fabricated success.
   */
  const cancelDraftBooking = useCallback(
    (reason?: string) => {
      setCancelIntent(null)
      const ctx = dispatchContext()
      if (!ctx) {
        setActionError('Not cancelled — you are not signed in, so this cancellation cannot be attributed to anyone. Sign in and try again.')
        return
      }
      setActionError(null)
      /*
       * TODO(decision) — `CancelRentalInput` (`actions/rentals/cancelRental.ts`,
       * not this agent's file) is `{ id: string }` and carries no `reason`
       * field, so the reason the dialog collects rides along in the payload
       * without a declared home. Widening that input, and where the reason is
       * stored, belongs to whoever owns the actions layer. It is sent rather
       * than dropped so the fix is a schema change, not a re-collection.
       *
       * `id: 'draft-new'` is the same placeholder `saveDraft` uses — this
       * screen holds the booking in local state and has no persisted row to
       * name. Left as found rather than guessed at.
       */
      const input = { id: 'draft-new', reason: reason ?? null }
      void import('../../actions/rentals/index')
        .then((m) => m.cancelRental(input, ctx))
        .then(() => navigate('/rentals'))
        .catch((err: unknown) => {
          console.error('cancel booking failed:', err)
          setActionError(`Not cancelled — ${err instanceof Error ? err.message : String(err)}`)
        })
    },
    [dispatchContext, navigate],
  )

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

  // §5.2 / redesign v1 §7.6 — Pickup and Return merged into one Dates cell,
  // so the strip is four cells on desktop (Client · Dates · Stage ·
  // Outstanding), not five. Below desktop every value still ellipsizes into
  // unreadable fragments, so it collapses to fewer columns per Law 14.
  const summaryCols = isDesktop
    ? canBookingMoney
      ? 'repeat(3, minmax(0,1fr)) minmax(0,1.15fr)'
      : 'repeat(3, minmax(0,1fr))'
    : viewport === 'tablet'
      ? 'repeat(2, minmax(0,1fr))'
      : '1fr'
  const summaryDivider = isDesktop ? { borderRight: '1px solid var(--border)' } : { borderBottom: '1px solid var(--border)' }

  const bundleCount = useMemo(() => new Set(lines.map((l) => l.bundleCode).filter(Boolean)).size, [lines])
  const totalUnits = lines.reduce((s, l) => s + l.qty, 0)
  /** 01_NEW_RENTAL Notes — "renders parent-first with children nested". */
  const lineGroups = useMemo(() => groupLines(lines), [lines])

  /** redesign v1 §6 — the rail's Review card jumps to the section that owns
   *  the fact, opening it first if it was collapsed (§65 collapses lower
   *  sections on a phone by default) so the jump never lands on an empty view. */
  const jumpToSection = useCallback((targetId: string) => {
    // Derived from SECTIONS rather than a hand-listed array, so splitting
    // Client & Schedule into Client + Dates (and Crew & Transport into Crew +
    // Delivery) cannot leave a stale id behind.
    const sectionIndex = SECTIONS.findIndex((_, i) => `section-${i}` === targetId)
    if (sectionIndex >= 0) setOpen((prev) => prev.map((v, j) => (j === sectionIndex ? true : v)))
    globalThis.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  /**
   * §12 — every notice carries exactly one action, and both the blocking-notices
   * card and the warnings card dispatch through here. Lifted out of an inline
   * `onClick` so the two panels cannot drift into meaning different things by
   * the same button label.
   */
  const runNoticeAction = useCallback(
    (action: string) => {
      if (action === 'Open Inventory') navigate('/inventory')
      // §11 — inspecting the client is a disclosure, not a route change; a
      // half-built booking must survive it.
      if ((action === 'View Client' || action === 'Edit Client') && client) setQuickViewOpen(true)
      // Was `setAddClientOpen(false)` — a "Select Client" button whose only
      // effect was closing a dialog that was not open. Selection happens in the
      // Client section, so that is where it goes.
      if (action === 'Select Client') jumpToSection('section-0')
      if (action === 'Open Dates') jumpToSection('section-1')
      if (action === 'Request Approval') {
        setDiscountPopoverOpen(true)
        document.getElementById('rail-booking-summary')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      // redesign v1 §1 / §7.3 — a notice never repeats the money buttons; it
      // links to the one place they live, in the rail's Summary card.
      if (action === 'Receive Payment' || action === 'Receive Deposit') {
        document.getElementById('rail-booking-summary')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    },
    [client, jumpToSection, navigate],
  )

  // §11 — never all green while a Critical alert is open. Documents has no
  // body section of its own any more (§6), so it jumps to the rail's own
  // Documents card rather than a section.
  const reviewItems: ReviewItem[] = [
    { label: 'Client', ok: Boolean(client) && govId.trim().length > 0, targetId: 'section-0' },
    { label: 'Dates', ok: days > 0, targetId: 'section-1' },
    { label: 'Equipment', ok: lines.length > 0 && conflictLines.length === 0, targetId: 'section-2' },
    { label: 'Crew', ok: true, targetId: 'section-3' },
    { label: 'Delivery', ok: true, targetId: 'section-4' },
    { label: 'Pricing', ok: !discountUnapproved && breakdown.rentalTotal > 0, targetId: 'section-5' },
    { label: 'Payments', ok: breakdown.outstanding <= 0, targetId: 'section-5' },
    { label: 'Documents', ok: false, targetId: 'rail-documents' },
  ]
  const reviewCompleteCount = reviewItems.filter((r) => r.ok).length

  /** redesign v1 §5 — nothing is pre-generated on a Draft (§11). Quote,
   *  Rental Agreement, Invoice and Delivery Note are client-facing and gain
   *  a ✉ action (§7); Packing List is warehouse-internal and does not. */
  const documentTiles: Array<{ n: string; from: string; ready: boolean; emailable: boolean }> = [
    { n: 'Quote', from: 'Quote', ready: true, emailable: true },
    { n: 'Rental Agreement', from: 'Confirmed', ready: false, emailable: true },
    { n: 'Packing List', from: 'Preparing', ready: false, emailable: false },
    { n: 'Delivery Note', from: 'Dispatched', ready: false, emailable: true },
    { n: 'Invoice', from: 'invoice generated', ready: false, emailable: true },
  ]

  /* ── §36–38 — the equipment table's columns, declared once so the header,
   *    the alignment and the empty-state colSpan cannot drift apart. ─────── */
  // redesign v1 §7.4 — Location no longer has its own column; it moved onto
  // the Item cell's second line, where it has room to read in full instead
  // of truncating.
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
        { key: '', align: 'right' },
      ]
    : [
        { key: 'Item', align: 'left' },
        { key: 'Category', align: 'left' },
        { key: 'Qty', align: 'right' },
        { key: 'Days', align: 'right' },
        { key: 'Availability', align: 'left' },
        { key: '', align: 'right' },
      ]

  /**
   * One equipment line as a table row.
   *
   * `child` is what the wireframe draws as `└ child tick`: the row indents
   * under its parent and drops the bundle chip (the parent row already carries
   * the bundle's name). The `└` itself is `aria-hidden` decoration — a glyph is
   * not an accessible name — and the relationship is stated in words for
   * assistive tech instead.
   *
   * A row that is *not* nested is a parent in its own right, so it carries the
   * wireframe's `⋮`; a nested child carries the compact remove, because
   * "remove all of these" already lives on the group's menu.
   */
  const equipmentRow = (
    l: Line,
    child: boolean,
    groupLabel: string,
    menuItems?: Array<{ label: string; icon: IconName; onClick: () => void }>,
  ) => {
    const inv = INV_STYLE[l.status]
    return (
      <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
        {/* §36 — item name strong, serial small and secondary underneath it.
            redesign v1 §7.4 — Location sits on the row's second line rather
            than a column of its own that truncated at this width. */}
        <td style={{ ...td, whiteSpace: 'normal', maxWidth: 260, paddingLeft: child ? 26 : 9 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            {child && (
              <span aria-hidden="true" style={{ color: 'var(--muted)', fontSize: 'var(--t-th)', flexShrink: 0 }}>
                └
              </span>
            )}
            <span style={{ fontSize: child ? 'var(--t-meta)' : 'var(--t-ui)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.25 }}>
              {child && <span style={srOnly}>Part of {groupLabel}: </span>}
              {l.name}
            </span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1, fontSize: 'var(--t-th)', color: 'var(--text2)', flexWrap: 'wrap' }}>
            {l.serial !== '—' ? (
              <Link className="identifier" to={`/inventory/${l.serial}`} style={{ color: 'inherit', textDecoration: 'none' }} title={`Open unit ${l.serial} in Inventory`}>
                {l.serial}
              </Link>
            ) : (
              <span>Bulk stock — no serial</span>
            )}
            <span aria-hidden style={{ opacity: 0.5 }}>·</span>
            <span>{l.location}</span>
            {/* Nested under its bundle already — repeating the bundle name on
                every child was the same word five times in one card. */}
            {l.bundleName && !child && (
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
        {/* redesign v1 §7.4 — qty as a stepper, not a boxed input. A serialized
            row is one physical unit; quantity only varies for bulk stock. */}
        <td style={{ ...td, textAlign: 'right' }} title={l.serial !== '—' ? 'One serialized unit per row' : undefined}>
          <Stepper
            value={l.qty}
            disabled={l.serial !== '—'}
            label={`quantity for ${l.name}`}
            onChange={(n) => setLines((p) => p.map((x) => (x.id === l.id ? { ...x, qty: n } : x)))}
          />
        </td>
        {/* §8.3 — Days is mandatory and explicit on every line, now a stepper. */}
        <td style={{ ...td, textAlign: 'right' }}>
          <Stepper
            value={l.days}
            label={`days for ${l.name}`}
            onChange={(n) => setLines((p) => p.map((x) => (x.id === l.id ? { ...x, days: n } : x)))}
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
        <td style={{ ...td, width: 34, textAlign: 'right' }}>
          {menuItems ? (
            <RowMenu label={`Actions for ${l.name}`} items={menuItems} />
          ) : (
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
          )}
        </td>
      </tr>
    )
  }

  /**
   * 01_NEW_RENTAL §1.1 — the rail's SUMMARY card, in the spec's own order:
   *
   *     Gear subtotal / Crew / Delivery
   *     ───────────────────────────────
   *     Discount  chips
   *     VAT {rate}%  [on ▢]
   *     ───────────────────────────────
   *     TOTAL / Deposit (separate) / Advance due
   *
   * This *is* the old "Booking Summary" card, re-typeset — nothing was dropped.
   * Rental Paid, Rental Outstanding, the Law 5 deposit-liability note and both
   * money buttons all still live here; they follow the drawn rows rather than
   * replacing them.
   *
   * Law 6 — the whole card is booking money, so a money-blind role never gets
   * it in the DOM at all; the Crew row is separately `asset-finance`, which is
   * the one figure a Coordinator may not see.
   */
  const summaryCard = canBookingMoney ? (
    <Card id="rail-booking-summary" title="Summary">
      <MoneyRow label="Gear subtotal" value={formatMoney(equipmentPaisa)} />
      {canCrewMoney && <MoneyRow label="Crew" value={formatMoney(crewChargesPaisa)} />}
      <MoneyRow label="Delivery" value={formatMoney(transportPaisa)} />

      <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
        <DiscountChips
          percent={discountPct}
          onPercent={setDiscountPct}
          reason={discountReason}
          onReason={setDiscountReason}
          approver={approver}
          onApprover={setApprover}
          verdict={discountVerdict}
          amount={formatMoney(breakdown.discount)}
          open={discountPopoverOpen}
          onOpenChange={setDiscountPopoverOpen}
          inputStyle={inputStyle}
        />
        <VatToggle ratePercent={vatRatePercent} on={vatOn} onChange={setVatOn} />
        <MoneyRow label={vatOn ? `VAT at ${vatRatePercent}%` : 'VAT not applied'} value={formatMoney(breakdown.vat)} />
      </div>

      <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
        <MoneyRow label="TOTAL" value={formatMoney(breakdown.rentalTotal)} big />
        <MoneyRow label="Rental paid" value={formatMoney(advancePaisa)} tone="var(--success-text)" />
        <MoneyRow
          label="Rental outstanding"
          value={formatMoney(breakdown.outstanding)}
          tone={breakdown.outstanding > 0 ? 'var(--danger-text)' : 'var(--success-text)'}
          strong
        />
      </div>

      {/* Law 5 — the deposit is a separate obligation and the spec draws it as
          "Deposit (separate)". It never enters TOTAL and never reduces
          Outstanding, which is why it sits below its own rule with its own
          words rather than as a fourth line in the block above. */}
      <div style={{ ...moneyBlock, marginTop: 10 }}>
        <h3 style={sub}>Deposit — separate, held as a liability</h3>
        <MoneyRow label="Required" value={formatMoney(depositRequiredPaisa)} />
        <MoneyRow label="Received" value={formatMoney(depositReceivedPaisa)} tone="var(--success-text)" />
        <MoneyRow label="Pending" value={formatMoney(depositPendingPaisa)} tone="var(--progress-text)" strong />
        <p style={{ margin: '7px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
          Never added to Rental Outstanding — these are two separate obligations.
        </p>
      </div>

      {/*
        "Advance due" is the amount of advance a booking is *required* to carry
        before pickup. Nothing in this build derives it: there is no advance
        policy in `settingsStore`, none in `lib/money.ts`, and no column for
        one. `WIREFRAME_RULINGS_2026-08-12.md` §8 — "Never seed a plausible
        default" — so it says so rather than borrowing Rental Outstanding,
        which is a different number for a different obligation.

        TODO(decision) — where does the required advance come from? A
        percentage of Rental Total in Settings ▸ Financial, a per-client credit
        term, or a per-booking figure the coordinator types? Until that is
        ruled this row has no source.
      */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 10, padding: '3px 0' }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Advance due</span>
        <span
          title="No advance policy is configured, so the required advance has no source in this build."
          style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap' }}
        >
          not tracked yet
        </span>
      </div>

      {/* The rail is where redesign v1 §1 puts the two money buttons, once.
          They are the same action as `RecordPaymentModal`'s, so they carry its
          permission — see `canTakePayment` where it is defined. The rest of
          this Summary card (the figures) stays on `canBookingMoney`. */}
      {canTakePayment && (
        <div style={{ marginTop: 11, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          <Button icon="dollar" variant="secondary">Receive Payment</Button>
          <Button icon="dollar" variant="secondary">Receive Deposit</Button>
        </div>
      )}
    </Card>
  ) : null

  /**
   * 01_NEW_RENTAL §1.1 — `⚠ blocking notices (inline, persists)`.
   *
   * One card, every reason Confirm is refused, in full. Law 12 keeps it inline
   * and persistent: it is never a toast, and at tablet/phone it detaches from
   * the rail and renders immediately above the sticky bar rather than being
   * truncated into it.
   *
   * Law 11 — icon + label + colour on each row, never the tone alone.
   */
  const noticesCard = (
    <Card
      id="rail-blocking-notices"
      title={blockingNotices.length === 0 ? 'Blocking notices' : `Blocking notices (${blockingNotices.length})`}
    >
      {blockingNotices.length === 0 ? (
        <EmptyState title="Nothing is blocking this booking" description="Every requirement for Confirm Booking is met." />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {blockingNotices.map((n) => (
            <li key={n.text} style={{ padding: '8px 9px', borderRadius: 'var(--r-btn)', background: 'var(--st-danger-bg)' }}>
              <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                <Icon name="error" size={13} style={{ color: 'var(--st-danger-fg)', flexShrink: 0, marginTop: 2 }} />
                {/* The full sentence, never clipped — Law 12. */}
                <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--st-danger-fg)', lineHeight: 1.4 }}>
                  <span style={srOnly}>Blocking: </span>
                  {n.text}
                </span>
              </div>
              <button
                type="button"
                className="press"
                onClick={() => runNoticeAction(n.action)}
                style={{ position: 'relative', marginTop: 5, marginLeft: 20, minHeight: 26, padding: '0 8px', borderRadius: 'var(--r-btn)', border: '1px solid var(--st-danger-fg)', background: 'transparent', color: 'var(--st-danger-fg)', fontFamily: 'inherit', fontSize: 'var(--t-th)', fontWeight: 700, cursor: 'pointer' }}
              >
                <TouchInset />
                {n.action}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )

  /**
   * 01_NEW_RENTAL §1.1 — `[ Confirm Booking ]` lives at the bottom of the rail,
   * not in the header. Moving it also closes an existing defect: at tablet and
   * phone the header button and the sticky bar's button were two primaries for
   * one action on one screen.
   *
   * Rendered by the desktop rail only; below 1180 the sticky bar owns it, so
   * there is exactly one Confirm at every width.
   */
  const confirmBlock = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} title={blockReasonText}>
      <Button icon="check" variant="primary" onClick={confirmBooking} disabled={confirmBlocked}>
        Confirm Booking
      </Button>
      {blockReasonText && (
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--danger-text)', fontWeight: 600, lineHeight: 1.4 }}>
          {blockReasonText}
        </span>
      )}
    </div>
  )

  const railCards = (
    <>
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

      {/* redesign v1 §6 — Review moved from the bottom-of-page Section 5 into
          the rail, so the checklist that decides whether Confirm is ready
          sits beside Confirm instead of a screen away from it. Each row jumps
          to the section that owns the fact. */}
      <Card title={`Review · ${reviewCompleteCount}/${reviewItems.length}`}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {reviewItems.map((r) => (
            <button
              key={r.label}
              type="button"
              className="press"
              onClick={() => jumpToSection(r.targetId)}
              style={{ position: 'relative', display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center', width: '100%', minHeight: 30, padding: '4px 2px', border: 'none', background: 'transparent', textAlign: 'left', fontFamily: 'inherit', fontSize: 'var(--t-meta)', cursor: 'pointer' }}
            >
              <TouchInset />
              <Icon name={r.ok ? 'check' : 'alert_triangle'} size={13} style={{ color: r.ok ? 'var(--success-text)' : 'var(--progress-text)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, color: 'var(--text2)' }}>{r.label}</span>
              <span style={{ fontWeight: 600, color: r.ok ? 'var(--text)' : 'var(--progress-text)' }}>{r.ok ? 'Complete' : 'Pending'}</span>
              <Icon name="chevron_right" size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </Card>

      {/* redesign v1 §6 — Documents also moved from Section 5 into the rail.
          §11 — nothing is pre-generated on a Draft. */}
      <Card id="rail-documents" title="Documents">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {documentTiles.map((d) => (
            <div
              key={d.n}
              title={d.ready ? `${d.n} is available now` : `${d.n} becomes available at ${d.from}`}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', padding: '6px 2px', fontSize: 'var(--t-meta)' }}
            >
              <Icon name="file" size={16} style={{ color: d.ready ? 'var(--link)' : 'var(--disabled)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.n}</span>
              <span style={{ flexShrink: 0, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{d.ready ? 'Available' : `At ${d.from}`}</span>
              {/* redesign v1 §5 — every client-facing document tile gains a ✉
                  action once it is actually available; Packing List stays
                  internal (documentTiles.emailable) and none fire on click. */}
              {d.emailable && d.ready && (
                <button
                  type="button"
                  className="press"
                  aria-label={`Email ${d.n} to client`}
                  onClick={() => setEmailDraftDoc(d.n)}
                  style={{ position: 'relative', flexShrink: 0, width: 22, height: 22, display: 'grid', placeItems: 'center', borderRadius: 'var(--r-xs)', border: 'none', background: 'transparent', color: 'var(--link)', cursor: 'pointer' }}
                >
                  <TouchInset />
                  <Icon name="mail" size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* §54–56 — compact alerts. Severity is a labelled chip, not a colour;
          the blocking rules themselves are untouched (§67): Critical blocks
          Confirm, Warning blocks Handover, Information blocks nothing.

          Criticals are **not** repeated here: they are the rail's blocking-
          notices card now (01_NEW_RENTAL §1.1), with the same action button.
          Rendering them in both places would have put the same sentence twice
          in one rail. Nothing was removed — the row moved home. */}
      <Card title={`Warnings & information (${nonBlockingAlerts.length})`}>
        {nonBlockingAlerts.length === 0 ? (
          <EmptyState title="No open warnings" description="This booking has no warning or information alerts." />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {nonBlockingAlerts.map((a) => {
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
                    onClick={() => runNoticeAction(a.action)}
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
          Warning blocks Handover, not Confirm. Information blocks nothing. What blocks Confirm is in
          Blocking notices, above.
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
      {/*
        Breadcrumb only (in the shell) — no Back button. Spec 01 draws a `←` at
        all three widths; `WIREFRAME_RULINGS_2026-08-12.md` §4 rules that glyph
        as shorthand for "this is a sub-page", and PLAN.md Phase 5's
        "Breadcrumbs, no Back buttons" stands.

        01_NEW_RENTAL §1.1 header — `[Save Draft]  [Cancel]`. **Confirm Booking
        has moved to the rail**, which is where the spec draws it and which also
        ends a real defect: at tablet and phone the header primary and the
        sticky bar's primary were two filled buttons for one action.

        Operations and Send Quote stay. Neither is drawn, but the wireframes are
        a layout spec, not a content inventory (Rulings §1), and no prose
        removes them.
      */}
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
            <SendQuoteMenu onEmail={() => setEmailDraftDoc('Quote')} />
            {/* Two behaviours behind one label — see `discardDraft` /
                `cancelDraftBooking`. Which one runs depends on whether a draft
                row exists, never on which button was pressed. */}
            <Button icon="close" onClick={() => setCancelIntent(draftPersisted ? 'cancel' : 'discard')}>
              Cancel
            </Button>
          </>
        }
      />
      {/* Errors are inline and persistent, never a toast and never an alert().
          What *blocks Confirm* is no longer repeated here: it is the rail's
          blocking-notices card, which spec 01 draws and which now states each
          reason in full. This line is only ever what the last dispatch did
          instead of succeeding — a different fact, which can be true while
          Confirm is also blocked. */}
      {actionError && (
        <p role="status" style={inlineErrorStyle}>
          <Icon name="error" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {actionError}
        </p>
      )}

      {/* §6 / redesign v1 §1 §7.6 — the booking status strip: small label,
          large value, small support line. Four cells, not five — Pickup and
          Return share one Dates cell, and Outstanding drops the deposit
          footnote (the rail is its one home now). Outstanding is the largest
          figure and the only red one. */}
      <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: summaryCols }}>
        <StripCell label="Client" value={client?.name ?? 'Not selected'} support={client ? (client.company ?? kind) : 'Choose a client to continue'} style={summaryDivider} />
        <StripCell
          label="Dates"
          value={`${pickupBs ? formatBs(pickupBs) : '—'} → ${returnBs ? formatBs(returnBs) : '—'}`}
          support={`${Number.isNaN(Date.parse(pickup)) ? '—' : formatAd(new Date(pickup))} → ${Number.isNaN(Date.parse(ret)) ? '—' : formatAd(new Date(ret))}`}
          style={summaryDivider}
        />
        <StripCell
          label="Stage"
          value={`${status} · ${flag}`}
          support={`${days} rental days · ${lines.length} items · ${crew.length} crew`}
          style={canBookingMoney ? summaryDivider : undefined}
        />
        {canBookingMoney && (
          <StripCell
            label="Rental Outstanding"
            value={formatMoney(breakdown.outstanding)}
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
            id="section-0"
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
              {/* §60 "no duplicate information" — Delivery Type is *not* repeated
                  here. It lives once, in the Delivery section, beside the
                  delivery and fuel charges it drives (§9.2). */}
            </div>
            {/* redesign v1 §1 — the footer row (phone, email, credit limit,
                outstanding, "Client health details") is gone entirely. Every
                one of those facts is already one hover away on the client
                chip's health eye, and the link duplicated the ⚠ Attention
                Required alert action sitting above it. */}
          </Section>

          {/* 01_NEW_RENTAL §1.1 DATES box — `Out ▾  Return ▾   Days: 2`, with
              BS above AD on both. Split out of Client & Schedule because the
              wireframe draws it as its own box at all three widths, and on a
              phone as its own accordion. */}
          <Section
            id="section-1"
            title={SECTIONS[1]}
            open={open[1] ?? true}
            onToggle={() => toggle(1)}
            summary={
              days === 0
                ? 'Return must be later than pickup'
                : `${pickupBs ? formatBs(pickupBs) : formatAd(new Date(pickup))} → ${days} days`
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(0,1fr)) auto', gap: 11, alignItems: 'start' }}>
              {/* `DateTimeField` renders its own label and its own BS line, so
                  it is not wrapped in `Field` (that would double the label).
                  `lib/bs.ts` is the one Date Engine — nothing here hand-writes
                  a BS date. */}
              <DateTimeField label="Out" dateValue={pickup} timeValue={pickupTime} onDateChange={setPickup} onTimeChange={setPickupTime} />
              {/* §7 — return must be later than pickup. */}
              <DateTimeField
                label="Return"
                dateValue={ret}
                timeValue={returnTime}
                onDateChange={setRet}
                onTimeChange={setReturnTime}
                error={days === 0 ? 'Return must be later than pickup. Pick a later return date.' : undefined}
              />
              {/* §8.6 — an unset value is an em dash, never a zero. */}
              <div style={{ minWidth: 0, alignSelf: 'end', paddingBottom: 8 }}>
                <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', marginBottom: 3 }}>Days</span>
                <span className="figure" style={{ fontSize: 'var(--t-h3)', fontWeight: 700, color: days === 0 ? 'var(--muted)' : 'var(--text)' }}>
                  {days === 0 ? '—' : days}
                </span>
              </div>
            </div>
          </Section>

          <Section
            id="section-2"
            title={SECTIONS[2]}
            open={open[2] ?? true}
            onToggle={() => toggle(2)}
            summary={`${lines.length} lines · ${conflictLines.length} conflicts`}
          >
            {/* 01_NEW_RENTAL §1.1 EQUIPMENT box — `search gear…` is drawn as the
                **first row inside the card**, above the list, not as a control
                in the section header. Moved off the header's `action` slot; it
                is the same panel, raising the same callback (§34), and it still
                answers availability for the booking's own dates (§32). */}
            <div style={{ marginBottom: 10 }}>
              <AddItemPanel
                window={bookingWindow}
                days={days || 1}
                existingLineIds={lines.map((l) => l.id)}
                onAdd={addDrafts}
                showPrices={canBookingMoney}
                inputStyle={inputStyle}
              />
            </div>

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
                  {/* 01_NEW_RENTAL Notes — "Equipment list renders parent-first
                      with children nested." The key already exists in the data:
                      a bundle stamps `bundleCode`/`bundleName` on every line it
                      contributes, and each serialised unit of one model shares
                      that model's name. Only the rendering was flat. */}
                  {lineGroups.map((g) => {
                    const nested = isNested(g)
                    const groupUnits = g.lines.reduce((s, l) => s + l.qty, 0)
                    const dayValues = Array.from(new Set(g.lines.map((l) => l.days)))
                    const minDays = Math.min(...dayValues)
                    const maxDays = Math.max(...dayValues)
                    const groupAmountPaisa = g.lines.reduce((s, l) => s + lineAmountPaisa(l), 0) as Paisa
                    // The parent row states the group's *worst* availability —
                    // one blocked unit blocks the group, and saying "In Stock"
                    // over a blocked child would be the lie.
                    const blocked = g.lines.find((l) => l.status !== 'In Stock')
                    const parentStatus: InvStatus = blocked?.status ?? g.lines[0]?.status ?? 'In Stock'
                    const parentInv = INV_STYLE[parentStatus]
                    const menuItems = [
                      {
                        label: nested ? `Remove all ${g.lines.length} lines` : 'Remove from this booking',
                        icon: 'close' as IconName,
                        onClick: () => setLines((p) => p.filter((x) => !g.lines.some((y) => y.id === x.id))),
                      },
                      ...(!nested && g.lines[0] && g.lines[0].serial !== '—'
                        ? [{ label: 'Open in Inventory', icon: 'external_link' as IconName, onClick: () => navigate(`/inventory/${g.lines[0]?.serial ?? ''}`) }]
                        : []),
                    ]

                    return (
                      <Fragment key={g.key}>
                        {nested ? (
                          <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--card2)' }}>
                            <td style={{ ...td, whiteSpace: 'normal', maxWidth: 260 }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Icon name={g.kind === 'bundle' ? 'package' : 'box'} size={13} style={{ color: 'var(--text2)', flexShrink: 0 }} />
                                <span style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.25 }}>{g.label}</span>
                              </span>
                              <span style={{ display: 'block', marginTop: 1, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                                {g.kind === 'bundle'
                                  ? `Bundle · ${g.lines.length} component${g.lines.length === 1 ? '' : 's'}`
                                  : `${g.lines.length} units`}
                              </span>
                            </td>
                            <td style={{ ...td, color: 'var(--text2)' }}>{g.lines[0]?.category ?? '—'}</td>
                            <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{groupUnits}</td>
                            <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                              {minDays === maxDays ? minDays : `${minDays}–${maxDays}`}
                            </td>
                            {canBookingMoney && (
                              <>
                                <td style={{ ...td, textAlign: 'right', color: 'var(--muted)' }}>—</td>
                                <td style={{ ...td, textAlign: 'right', color: 'var(--muted)' }}>—</td>
                                <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{formatMoney(groupAmountPaisa)}</td>
                              </>
                            )}
                            {/* Law 11 — icon + label + colour, never the colour alone. */}
                            <td style={td}>
                              <span
                                title={blocked ? `${blocked.name} is ${blocked.status}` : parentStatus}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 'var(--sp-xs)',
                                  height: 20,
                                  padding: '0 7px',
                                  borderRadius: 'var(--r-badge)',
                                  fontSize: 'var(--t-th)',
                                  fontWeight: 700,
                                  background: parentInv.bg === 'transparent' ? 'var(--st-in-bg)' : parentInv.bg,
                                  color: parentInv.bg === 'transparent' ? 'var(--st-in-fg)' : parentInv.fg,
                                }}
                              >
                                <Icon name={parentInv.icon} size={11} />
                                {parentStatus}
                              </span>
                            </td>
                            <td style={{ ...td, width: 34, textAlign: 'right' }}>
                              <RowMenu label={`Actions for ${g.label}`} items={menuItems} />
                            </td>
                          </tr>
                        ) : null}
                        {g.lines.map((l) => equipmentRow(l, nested, g.label, nested ? undefined : menuItems))}
                      </Fragment>
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

          {/* 01_NEW_RENTAL §1.1 — `＋ Crew (collapsed)` is its own box, so Crew
              & Transport splits here. Delivery follows as its own box below. */}
          <Section
            id="section-3"
            title={SECTIONS[3]}
            open={open[3] ?? false}
            onToggle={() => toggle(3)}
            summary={crew.length === 0 ? 'No crew assigned' : `${crew.length} crew`}
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
            <div>
              <div style={{ minWidth: 0 }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                    <thead>
                      <tr style={{ background: 'var(--th-bg)' }}>
                        {(canCrewMoney ? ['Name', 'Role', 'Day Rate', 'Days', 'Amount', ''] : ['Name', 'Role']).map((h, i) => (
                          <th key={h || 'expand'} scope="col" style={{ ...th, textAlign: i >= 2 && i <= 4 ? 'right' : 'left' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {crew.map((c) => {
                        const expanded = expandedCrew.has(c.crewId)
                        const hasExtras = c.overtimePaisa > 0 || c.mealsPaisa > 0 || c.accommodationPaisa > 0
                        return (
                          <Fragment key={c.crewId}>
                            <tr style={{ borderBottom: expanded ? 'none' : '1px solid var(--border)' }}>
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
                                  <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                                    {formatMoney((c.dayRatePaisa * days + c.overtimePaisa + c.accommodationPaisa + c.mealsPaisa) as Paisa)}
                                  </td>
                                  {/* redesign v1 §7.5 — Overtime/Meals/Accommodation live behind this
                                      per-row expand instead of two columns clipped at this width. */}
                                  <td style={{ ...td, width: 30, textAlign: 'right' }}>
                                    <button
                                      type="button"
                                      className="press"
                                      aria-label={`${expanded ? 'Hide' : 'Show'} overtime, meals and accommodation for ${c.name}`}
                                      aria-expanded={expanded}
                                      onClick={() => toggleCrewExpanded(c.crewId)}
                                      style={{ position: 'relative', width: 22, height: 22, display: 'grid', placeItems: 'center', borderRadius: 'var(--r-xs)', border: 'none', background: 'transparent', color: hasExtras ? 'var(--text2)' : 'var(--muted)', cursor: 'pointer' }}
                                    >
                                      <TouchInset />
                                      <Icon name={expanded ? 'chevron_up' : 'chevron_down'} size={13} />
                                    </button>
                                  </td>
                                </>
                              )}
                            </tr>
                            {canCrewMoney && expanded && (
                              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <td colSpan={6} style={{ ...td, background: 'var(--card2)' }}>
                                  <div style={{ display: 'flex', gap: 'var(--sp-lg)', flexWrap: 'wrap', fontSize: 'var(--t-meta)' }}>
                                    <span style={{ display: 'inline-flex', gap: 5 }}>
                                      <span style={{ color: 'var(--text2)' }}>Overtime</span>
                                      <span className="figure" style={{ fontWeight: 600 }}>{c.overtimePaisa > 0 ? formatMoney(c.overtimePaisa) : '—'}</span>
                                    </span>
                                    <span style={{ display: 'inline-flex', gap: 5 }}>
                                      <span style={{ color: 'var(--text2)' }}>Meals</span>
                                      <span className="figure" style={{ fontWeight: 600 }}>{c.mealsPaisa > 0 ? formatMoney(c.mealsPaisa) : '—'}</span>
                                    </span>
                                    <span style={{ display: 'inline-flex', gap: 5 }}>
                                      <span style={{ color: 'var(--text2)' }}>Accommodation</span>
                                      <span className="figure" style={{ fontWeight: 600 }}>{c.accommodationPaisa > 0 ? formatMoney(c.accommodationPaisa) : '—'}</span>
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                      {canCrewMoney && (
                        <tr>
                          <td colSpan={4} style={{ ...td, fontWeight: 700, color: 'var(--text2)' }}>Crew Subtotal</td>
                          <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{formatMoney(crewChargesPaisa)}</td>
                          <td style={td} />
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
            </div>
          </Section>

          {/* 01_NEW_RENTAL §1.1 — `＋ Delivery (collapsed → Client Pickup Rs 0)`.
              Its own box, and its summary states the default the wireframe
              annotates so a collapsed section still carries the fact. */}
          <Section
            id="section-4"
            title={SECTIONS[4]}
            open={open[4] ?? false}
            onToggle={() => toggle(4)}
            summary={clientPickup ? 'Client Pickup · Rs 0' : `Babin Delivery · ${canBookingMoney ? formatMoney(transportPaisa) : 'charged'}`}
          >
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(0,1fr))', gap: 14 }}>
              <div style={{ minWidth: 0 }}>
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

          {/* Kept deliberately. `WIREFRAME_RULINGS_2026-08-12.md` §1 names
              "New Rental's Pricing & Payments" among the sections that survive
              because no spec removes them in prose — the rail summarises this
              section, it does not replace it. */}
          {canBookingMoney && (
            <Section
              id="section-5"
              title={SECTIONS[5]}
              open={open[5] ?? true}
              onToggle={() => toggle(5)}
              summary={`${formatMoney(breakdown.rentalTotal)} total · ${formatMoney(breakdown.outstanding)} outstanding`}
            >
              {/* §43–47 — three visually separate blocks: Rental Charges,
                  Deposit, Payment History. RENTAL TOTAL is the dominant figure;
                  Rental Outstanding and Deposit Pending never combine. */}
              <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(3, minmax(0,1fr))' : isPhone ? '1fr' : 'repeat(2, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
                <div style={moneyBlock}>
                  <h3 style={sub}>Rental Charges</h3>
                  {/* §10.1 in order — the displayed column sums to the displayed total.
                      Crew Charges is `asset-finance` money: HIS v2.1 §4.1 gives a
                      Coordinator booking money but explicitly "no crew pay", and this
                      row was leaking it while the crew table one section up hid the
                      same figure. Law 6 — omitted, not masked. */}
                  {[
                    { l: 'Equipment Rental', v: formatMoney(equipmentPaisa) },
                    { l: 'Sub-Rental', v: '—' },
                    { l: 'Services', v: '—' },
                    ...(canCrewMoney ? [{ l: 'Crew Charges', v: formatMoney(crewChargesPaisa) }] : []),
                    { l: 'Transport', v: formatMoney(transportPaisa) },
                  ].map((r) => (
                    <MoneyRow key={r.l} label={r.l} value={r.v} {...(r.v === '—' ? { tone: 'var(--muted)' } : {})} />
                  ))}
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
                    <MoneyRow label="Subtotal" value={formatMoney(breakdown.subtotal)} />
                    <MoneyRow label={`Discount (${discountPct}%)`} value={`− ${formatMoney(breakdown.discount)}`} tone="var(--danger-text)" />
                    <MoneyRow label="Taxable Amount" value={formatMoney(breakdown.taxable)} />
                    {/* The rate is Settings', and the switch that turns it off is
                        the rail's. Both facts are stated so this block never
                        reads as a silent 0%. */}
                    <MoneyRow
                      label={vatOn ? `VAT (${vatRatePercent}%)` : 'VAT — off for this booking'}
                      value={formatMoney(breakdown.vat)}
                      {...(vatOn ? {} : { tone: 'var(--muted)' })}
                    />
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
                    {/* Law 10 — hard block: ≥10 characters of reason AND a named
                        approver. The message is `validateDiscount()`'s own, so the
                        rail's popover and this block cannot state different rules. */}
                    {discountPct > 10 && (
                      <div style={{ marginTop: 9, padding: 10, borderRadius: 'var(--r-btn)', background: 'var(--st-danger-bg)' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--st-danger-fg)', lineHeight: 1.4 }}>
                          <Icon name="error" size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                          {discountVerdict.error ?? 'Above 10% — a reason of at least 10 characters and a named approver. No bypass, including Owner.'}
                        </div>
                        <Input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="Reason" aria-label="Discount reason" style={{ ...inputStyle, marginTop: 7 }} />
                        <Input value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="Approver" aria-label="Discount approver" style={{ ...inputStyle, marginTop: 6 }} />
                      </div>
                    )}
                  </div>
                </div>

                {/* redesign v1 §1 — the Deposit block is gone from here entirely.
                    The rail's Booking Summary card is its one home now; repeating
                    it here was the same three figures shown twice on one screen. */}
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
                  {/* redesign v1 §1 — Rental Outstanding is not repeated here; it
                      already has a home in the header strip and the rail. Invoice
                      State is the one fact this block adds that lives nowhere else. */}
                  <div style={{ display: 'flex', gap: 9, padding: '7px 0 3px', fontSize: 'var(--t-meta)' }}>
                    <span style={{ flex: 1, color: 'var(--text2)' }}>Invoice State</span>
                    <span style={{ fontWeight: 600 }}>{invoiceState}</span>
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                    <strong style={{ color: 'var(--text2)' }}>Partially Paid</strong> is an invoice state, not a payment
                    status — a payment is Received in full or it is not.
                  </p>
                </div>

                <div style={moneyBlock}>
                  <h3 style={sub}>Payment History</h3>
                  {/*
                   * ⛔ **What stood here.** A hardcoded two-row table asserting
                   * that *Sagar Maharjan collected Rs 25,000 in cash on 16 Jul
                   * 2026* and took a *Rs 15,000 eSewa advance on 10 Jul 2026* —
                   * rendered against whatever booking the operator happened to
                   * be building, and identical on every one of them. A
                   * fabricated collector and two fabricated figures, on a money
                   * panel: the record named an actor nobody signed in as and an
                   * amount nobody entered.
                   *
                   * A NEW rental has no payment history by definition. A payment
                   * references a booking, and this screen has never persisted
                   * one — `confirmBooking` above says exactly that ("this
                   * booking has not been saved yet"). So there is no figure to
                   * degrade to and no collector to fall back on; the honest
                   * render is the empty state.
                   *
                   * `EmptyState` rather than an empty table, and rather than
                   * dropping the panel: it is the affordance this screen already
                   * uses for a section that is real but not yet applicable
                   * (Equipment before the first line, Crew before the first
                   * assignment), and a header row over nothing still frames the
                   * panel as a ledger that has been consulted.
                   *
                   * Law 6 is untouched — this block sits inside Section 5, which
                   * only renders behind `canBookingMoney`.
                   */}
                  <EmptyState
                    title="No payments on this booking"
                    description="Payments are recorded against a saved booking. Once this rental exists, every payment and deposit taken on it is listed here with its date, method and the person who collected it."
                  />
                  {/* redesign v1 §1 — Receive Payment / Receive Deposit are not
                      repeated here. Both money buttons live once, in the rail. */}
                  <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                    Payments are immutable — no Edit, no Void. A mistake is corrected by a reversal entry referencing
                    the original.
                  </p>
                </div>
              </div>
            </Section>
          )}

          {/* redesign v1 §6 — Section 5 "Documents & Review" is gone from the
              body entirely. It is now the rail's Review + Documents cards,
              below, which stay beside Confirm Booking instead of a screen away. */}

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

        {/*
          Desktop: main plus a sticky rail, in 01_NEW_RENTAL §1.1's order —
          SUMMARY, then the blocking notices, then `[ Confirm Booking ]`.

          The cards the wireframe does not draw (Quick Actions, Review,
          Documents, warnings, Activity Timeline) follow *below* Confirm rather
          than being deleted: Rulings §1 keeps them, and putting them after the
          button is the only arrangement that leaves the three drawn blocks
          adjacent and in order.

          The negative-margin/padding pair keeps the rail's collapse handle
          (which sits at left:-12) inside the sticky box instead of clipped.
        */}
        {isDesktop && (
          <div style={{ position: 'sticky', top: 12, alignSelf: 'start', maxHeight: 'calc(100vh - 24px)', overflowY: 'auto', paddingLeft: 14, marginLeft: -14 }}>
            <Rail width={300}>
              {summaryCard}
              {noticesCard}
              {confirmBlock}
              {railCards}
            </Rail>
          </div>
        )}
      </div>

      {/*
        Tablet and phone: the rail **reflows**, it does not hide.

        `WIREFRAME_RULINGS_2026-08-12.md` §7 — "Right rails collapse below 1180"
        means the rail's content moves below the list and stays visible. The
        collapsed "Review n/n" handle that used to sit here hid the blocking
        notices behind a tap, which Law 12 forbids outright.

        `CollapsibleAside` is deliberately not used and its defaults are not
        touched — other pages depend on them.
      */}
      {!isDesktop && (
        <div style={{ display: 'grid', gridTemplateColumns: viewport === 'tablet' ? 'repeat(2, minmax(0,1fr))' : '1fr', gap: 'var(--sp-md)', alignItems: 'start' }}>
          {summaryCard}
          {railCards}
        </div>
      )}

      <FooterNote extra={['Sections are not a wizard — any order, one Confirm']} />

      {/*
        01_NEW_RENTAL Notes — "Blocking notices sit inline in the rail and
        persist — never a toast."

        The tablet and phone bars the spec draws are `Total …… [Confirm]`, with
        no room for a notice. So below 1180 the notices card **detaches from the
        rail and renders immediately above the sticky bar**, in full: not
        truncated into the bar, not a toast, and not behind a disclosure. It is
        the last thing above the button it is refusing.
      */}
      {!isDesktop && <div style={{ marginTop: 'var(--sp-md)' }}>{noticesCard}</div>}

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

      {/* redesign v1 §5 — draft-only, review-before-send. Fired from the
          Send Quote split button and each rail Documents tile's ✉ action. */}
      <DraftEmailModal
        isOpen={emailDraftDoc !== null}
        onClose={() => setEmailDraftDoc(null)}
        documentName={emailDraftDoc ?? ''}
        toEmail={client?.email ?? ''}
        subject={`${emailDraftDoc ?? 'Document'} — ${client?.name ?? 'New Rental'}`}
        body={`Dear ${client?.name ?? 'Client'},\n\nPlease find the ${emailDraftDoc ?? 'document'} for your booking attached.\n\nRegards,\nBabin Rentals`}
        onSend={() => showSuccessToast('Email queued', `${emailDraftDoc} will be sent to ${client?.email ?? 'the client'}.`)}
      />

      {/*
        `[Cancel]`, behaviour one — nothing has been persisted, so leaving
        deletes nothing and no law is engaged. It still asks, because a
        half-built booking is real work; it takes no reason and dispatches
        nothing.
      */}
      <ConfirmDialog
        isOpen={cancelIntent === 'discard'}
        onClose={() => setCancelIntent(null)}
        onConfirm={discardDraft}
        title="Discard this booking?"
        description="Nothing has been saved yet, so there is no draft to cancel — leaving simply discards what is on screen. The client, dates, equipment and crew entered here will be lost."
        confirmLabel="Discard and leave"
        cancelLabel="Keep editing"
        variant="danger"
      />

      {/*
        `[Cancel]`, behaviour two — a draft row exists. Law 3: nothing is
        deleted, so this is the named terminal transition `CANCEL_RENTAL` with
        a recorded reason, not a discard.
      */}
      <ConfirmDialog
        isOpen={cancelIntent === 'cancel'}
        onClose={() => setCancelIntent(null)}
        onConfirm={cancelDraftBooking}
        title="Cancel this draft booking?"
        description="The draft has been saved, so it is not discarded — it is moved to Cancelled and stays on the record with the reason below. Nothing is deleted."
        confirmLabel="Cancel booking"
        cancelLabel="Keep the draft"
        variant="danger"
        requireReason={{ minLength: 10, label: 'Why is this booking being cancelled?' }}
      />
    </div>
  )
}
