import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { ConfirmDialog, Input, Select } from '../../components/ui'
import { Card, PageHeader, Button, Rail, FooterNote, cardStyle } from '../../components/ui/Page'
import { Unavailable } from '../../components/ui/Unavailable'
import { EmptyState } from '../../components/ui/StateViews'
import { useToast } from '../../components/ui/Toast'
import { useViewport } from '../../lib/device'
import { useNetwork } from '../../lib/network'
import { STATUS } from '../../lib/status'
import { statusToken } from '../../lib/workflow'
import type { BookingStatus } from '../../lib/workflow'
import { toBs, formatBs, formatAd, getBusinessToday } from '../../lib/bs'
import { rentalDaysBetween } from '../../lib/rentalDays'
import { validateDiscount } from '../../lib/discount'
import { getSetting } from '../../lib/settingsStore'
import { price, formatMoney, rupees, roundHalfUp, toRupees } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { CLIENTS_DATA } from '../../data/clients'
import { listClientRecords } from '../../lib/queries/clients'
import { CREW_ROLES, createRental, deliveryTypeFromLabel, CreateRentalPartialError } from '../../actions/rentals/createRental'
import type { CrewRoleDb } from '../../types/database'
import { supabase, newClientUuid } from '../../lib/supabase'
import { listInventory } from '../../lib/queries/inventory'
import { equipmentResultsFrom } from './booking/itemCatalogue'
import type { EquipmentResult } from './booking/itemCatalogue'
import type { ClientRecord } from '../../data/clients'
import { INV_STYLE } from '../../data/inventory'
import type { InvStatus } from '../../data/inventory'
import { CREW_ROSTER, searchRoster } from '../../data/crew'
import type { CrewMember, CrewRole } from '../../data/crew'
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
 * The two pickers of one end of the booking — a `YYYY-MM-DD` date and an
 * `HH:mm` wall-clock time — as a single instant, or `null` if either is
 * unparseable.
 *
 * This is the **same construction `confirmBooking` sends** (`new
 * Date(`${date}T${time}`)`, local wall-clock in, `.toISOString()` — AD/UTC —
 * out, Law 7). It exists so the page cannot measure the booking over one pair
 * of instants and store it over another: before NR-19 the length was computed
 * from the DATES ALONE while the write sent date+time, so the two disagreed by
 * up to a day at every booking whose times were not midnight.
 *
 * `null` rather than a fallback instant: an unparseable value is not midnight,
 * and `DateTimeField` never lets one through anyway — `commitDate` reverts to
 * the last good date and `commitTime` to the last good time, so the guard here
 * is a type-level one rather than a state this screen can reach.
 */
export function bookingInstant(date: string, time: string): Date | null {
  const d = new Date(`${date}T${time}`)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * The booking's length in whole rental days, or `0` for a window that is not a
 * booking at all.
 *
 * The arithmetic is **not** here — `lib/rentalDays.ts` owns it (Law 1), and its
 * header settles which of this repo's three day-counts this is: the priced
 * span, elapsed ms ÷ 86 400 000, rounded half-up, floored at 1. What is here is
 * the page's own gate, and only that: a return at or before the pickup is `0`,
 * which every date-dependent thing on this screen reads as "unset" (an em dash,
 * never a zero — §8.6) and which blocks Confirm.
 *
 * ⛔ NR-19 — the page used to difference the two `YYYY-MM-DD` picker values and
 * ignore the times beside them, so a 09:00 → 18:00 same-day hire measured 0 and
 * was refused for being zero days long. `createRental.validate` refuses only a
 * return strictly BEFORE the pickup, and the write sends date+time, so the page
 * was rejecting bookings its own action would have taken. Measured over the
 * instants that are actually stored, that hire is 9 h → the engine's floor of
 * one rental day.
 *
 * `0` cannot be a stored length: Law 9 and six `days >= 1` CHECKs, and Confirm
 * is blocked while this is 0.
 */
export function bookingDays(pickupAt: Date | null, returnAt: Date | null): number {
  if (!pickupAt || !returnAt || returnAt.getTime() <= pickupAt.getTime()) return 0
  return rentalDaysBetween(pickupAt.toISOString(), returnAt.toISOString()) ?? 0
}

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
 * Common presets, NOT a ceiling. Law 10 as amended 31 Aug 2026 (D3, Babin:
 * "don't put any gate on discount"): no reason, no approver, no cap below
 * 100%. The reason+approver popover the chips used to open left with the
 * gate; `validateDiscount()` still gates Confirm, but only on arithmetic
 * validity (negative, >100%), which no chip can produce.
 */
const DISCOUNT_CHIPS = [0, 5, 10, 15, 20, 25] as const

/*
 * `CatalogueItem` and `EQUIPMENT_CATALOGUE` lived here — the demo catalogue,
 * flattened from `PARENTS` at module load, with product NAMES and unit SERIALS
 * for ids. Both are gone: `AddItemPanel` now searches a pool of real products
 * passed in as `equipment`, and it keeps its own seed fallback in
 * `booking/itemCatalogue.ts` for the moment before the read lands. Keeping a
 * second copy here would be a second definition of what this screen can book.
 */

interface Line {
  id: string
  name: string
  serial: string
  category: string
  ratePaisa: Paisa
  /** §8.3 — Days is mandatory. A per-booking line stores 1 explicitly. */
  days: number
  /**
   * Has the operator set this line's Days by hand?
   *
   * `AddItemPanel` stamps every draft with the booking's length at the moment
   * it is added, and before NR-19 that number was never looked at again: a
   * booking built over 3–5 Sep and then moved to 3–12 Sep kept 2 on every line
   * it already held, and those stale counts are what `booking_lines.days` was
   * written from — the length the client is billed over. The effect beside
   * `lines` re-stamps the booking's length onto its lines when the window
   * changes.
   *
   * This flag is what keeps that re-stamp from being destructive. A line whose
   * Days the operator deliberately shortened (the §36 stepper below) is a
   * per-line fact, not a copy of the header, so it is left exactly where they
   * put it. Absent, never `false`, on a line nobody has touched.
   */
  daysOverridden?: boolean | undefined
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

/**
 * A live catalogue row's id is a `products.id` uuid; a demo row's id is the
 * product NAME. This is the cheapest honest test of which one a line is.
 *
 * Module scope rather than inside the Confirm handler so it is compiled once
 * instead of per render, and so a second caller cannot quietly write a fourth
 * spelling of "is this a uuid".
 *
 * (An earlier note here claimed two places had to agree about it and pointed at
 * `confirmWriteRefusals`. That was wrong: `confirmWriteRefusals` is handed a
 * precomputed `sampleLineName` and never sees the regex — there is exactly one
 * use, the `lines.find` that computes that argument.)
 */
const PRODUCT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * One reason Confirm Booking is refused, in the shape the rail's blocking-
 * notices card renders.
 *
 * `action` is one of `runNoticeAction`'s verbs and is **optional**: a refusal
 * the operator cannot act on from this screen gets no button rather than a
 * button that silently does nothing. (§12's "every alert carries exactly one
 * action" governs `alerts`, and every alert-derived notice still carries one.)
 */
export interface BlockingNotice {
  text: string
  action?: string
}

/** Everything `confirmWriteRefusals` needs to know, and nothing else. */
export interface ConfirmWriteState {
  /** Whether a client is chosen at all. `false` is the alert model's own Critical, not ours. */
  clientSelected: boolean
  /** The chosen client's `clients.id` uuid — `null` when it came from the seed array. */
  clientDbId: string | null
  /** Has the live client read landed? It changes what a missing uuid MEANS. */
  clientsAreLive: boolean
  lineCount: number
  /** The first line whose id is not a `products.id` uuid, by name; `null` if none. */
  sampleLineName: string | null
  /** Law 6 — whether this role is shown equipment rates at all. */
  canBookingMoney: boolean
}

/**
 * ⛔ NR-10 — the four refusals that used to live ONLY inside the Confirm
 * handler, lifted out so one computation answers both the card and the button.
 *
 * The defect: `confirmBlocked` was `critical.length > 0 || days === 0`, and the
 * handler then refused, in its own body and with its own sentences, on a client
 * with no `dbId`, on zero lines, on a money-blind role and on a line id that is
 * not a uuid. None of those four reached `blockingNotices`, so the rail's card
 * said **"Nothing is blocking this booking · Every requirement for Confirm
 * Booking is met"**, the button was enabled, and the press failed into the
 * inline error line. Two lists describing one rule, and they had already
 * drifted.
 *
 * These are the handler's own refusals, verbatim in substance, re-written as
 * standalone sentences so they read correctly in the card as well as after
 * "Not confirmed — " in the error line.
 *
 * Pure and exported for `__tests__/newRentalGuards.test.ts`.
 */
export function confirmWriteRefusals(s: ConfirmWriteState): BlockingNotice[] {
  const out: BlockingNotice[] = []
  /* Only when a client IS chosen: "No client selected" is already a Critical in
     the alert model, and stating it twice is its own defect. */
  if (s.clientSelected && !s.clientDbId) {
    out.push({
      text: s.clientsAreLive
        ? 'The selected client came from sample data and has no database record, so there is nothing to book against. Pick a client from the live list.'
        : 'The client list has not loaded from the database yet, so the selected client is sample data. Wait for it to load, then re-select the client.',
      action: 'Select Client',
    })
  }
  if (s.lineCount === 0) {
    out.push({
      text: 'A booking with no equipment on it is not a booking. Add at least one item first.',
      action: 'Open Equipment',
    })
  }
  /* Law 6 — `listInventory({ withMoney: false })` returns no `dailyRate`, so
     every line this role holds carries `ratePaisa` 0. Sending that would
     persist the display placeholder as the price of the booking. */
  if (!s.canBookingMoney) {
    out.push({
      text: 'Equipment rates are hidden for your role, so this booking cannot be priced from this screen — every line would be saved at Rs 0. Ask a colleague who can see rates to confirm it.',
    })
  }
  if (s.sampleLineName !== null) {
    out.push({
      text: `"${s.sampleLineName}" is a sample row, not a product in the catalogue, so it cannot be saved. Remove it and add the item from the live catalogue.`,
      action: 'Open Equipment',
    })
  }
  return out
}

/** A crew member's charge on this booking. `dayRatePaisa` seeds from `CrewMember.dayRatePaisa` but is editable per booking — a rate can be negotiated differently per job. */
interface CrewLine {
  crewId: string
  name: string
  /* `CrewRole`, not `string`: every line here is seeded from a `CrewMember`,
     and the page has to be able to ask whether the database accepts this role
     (`dbRejectsRole`) — a question only the roster's own vocabulary can
     answer. `string` let that check be called on anything. */
  role: CrewRole
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

/* Law 15 — hit area over paint, number from `--tap`. This object is also handed
   down as the `inputStyle` prop to the discount and crew sub-forms, so raising
   it here raises every field they render too — which is the point: they are the
   same vertical form, split only for readability. */
const inputStyle = {
  width: '100%',
  minHeight: 'var(--tap)',
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
/*
 * `height` on a `<td>` behaves as a MINIMUM, so this is the §7.3 row floor
 * ("rows >= 56px") expressed with the token rather than padding arithmetic.
 * Horizontal padding is untouched and so is every glyph, which is the whole
 * distinction §7.4 and §60 are protecting: a 44px BOX per cell would turn the
 * equipment grid back into the form it moved away from, but a 56px ROW does
 * not paint anything — it only stops the row being shorter than the targets it
 * already contains.
 *
 * And it already contains them. `Stepper`'s `TouchInset` and the row's remove
 * button both stamp `height: var(--tap)` — 44px — on a 20/26px glyph, inside a
 * row that measured 7 + 20 + 7 = 34px. Each of those targets hung ~5px past its
 * own row at each edge, vertically adjacent rows overlapped by ~10px, and an
 * absolutely positioned target wins the hit test with the LATER row in the DOM
 * taking the tap. So a tap near a row boundary changed the WRONG line's qty or
 * days, or removed the WRONG line. Same failure, same fix as commit 7d38cdf on
 * the floor workspaces.
 *
 * A correction to the `Stepper` comment below, in its own spirit: its X half —
 * Qty's "+" and Days's "−" overlapping across 18px of cell padding — stands and
 * is still open, and closing it is a table-layout decision, not a hit-area one.
 * Its Y half ("Y is the free axis here and Y is what is taken") was measured
 * against the two glyphs inside one stepper and stopped at the row's own box,
 * the same way the claim it replaced stopped at the stepper's box. The nearest
 * neighbour on Y is the next ROW. Y is only free once the row is at least 56,
 * which is what this line now guarantees.
 */
const td = { height: 'var(--row-min-h)', padding: '7px 9px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }

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

/** Informational sibling of `inlineErrorStyle` — same shape, muted, never red. */
const inlineInfoStyle = {
  margin: 0,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 7,
  fontSize: 'var(--t-meta)',
  fontWeight: 500,
  color: 'var(--text2)',
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
 *
 * The two 44s were typed in as numbers and now read `var(--tap)`, which is the
 * same 44 with a name: the touch minimum belongs to the theme, and a literal
 * here would keep its old value on the day the token moves. The geometry is
 * untouched, so all fifteen call sites below are unaffected — this is the token
 * discipline the rest of the file already follows, arriving late.
 *
 * `theme.css` has since grown a `.tap` utility doing the same job with a
 * pseudo-element instead of a child span, and that is where this should land
 * eventually. Not in this pass: the class has to be checked against each of the
 * fifteen parents (several sit inside clipping or side-scrolling boxes, and
 * `overflow` cuts a hit area as hard as it cuts paint), and half-migrating would
 * leave two mechanisms doing one job in one file.
 */
function TouchInset() {
  return (
    <span
      aria-hidden="true"
      style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'max(100%, var(--tap))', height: 'var(--tap)' }}
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
  /* ⚠ 20px of glyph. Law 14 is satisfied on Y and NOT on X — stated plainly,
     because the comment that stood here claimed "the target measures 44 on both
     axes" and an adversarial check proved that false.

     What the old claim measured, correctly: the two glyphs INSIDE one stepper.
     10 + 3 + 18 + 3 + 10 = 44, so those two abut exactly and neither steals the
     other. What it stopped at: the stepper's own inline-flex box. The real
     nearest interactive neighbour is in the ADJACENT CELL — the Qty stepper's
     "+" and the Days stepper's "−" are separated only by `td` padding, 9px each
     side = 18px. Two 44px targets across 18px overlap by 26px, and the later
     one in the DOM wins, so a tap near that cell boundary changes the WRONG
     number. `TouchInset` grows the width via `max(100%, var(--tap))`, which is
     precisely what creates that overlap.

     So the width is deliberately left at the glyph's own box. Y is the free
     axis here and Y is what is taken; X needs the columns spaced or the
     steppers redesigned, which is a table-layout decision and not a hit-area
     one. The paint stays 20 because a 44px box per cell would turn the row grid
     back into a form, which is the shape §7.4 moved away from.
     `position: relative` is load-bearing rather than decorative — remove it and
     the inset resolves against some ancestor and lands somewhere else entirely.
     The two glyphs sit 24px apart edge to edge (3 + the 18px value + 3), which is
     exactly what their two targets need to meet without overlapping; anything
     tighter here would have them fighting over the same points. */
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
          // §3.3 — not a count badge, so not the 999 radius.
          // NOTE: this toggle also wears STATUS hues while being a CONTROL;
          // flagged for a ruling rather than changed mid-sweep.
          borderRadius: 'var(--r-btn)',
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
 * The rail's `Discount  chips` row.
 *
 * The Law 10 approval popover this component used to open — reason ≥10 chars,
 * named approver, the "Approval needed" badge — left with the discount gate
 * (D3 ruled 30 Aug 2026; Babin's final word 31 Aug: "don't put any gate on
 * discount"). The chips set a percent and nothing else needs to happen.
 * `validateDiscount()` still gates Confirm, but only on arithmetic validity,
 * which no chip can violate.
 */
function DiscountChips({
  percent,
  onPercent,
  amount,
}: {
  percent: number
  onPercent: (n: number) => void
  amount: string
}) {
  return (
    <div style={{ position: 'relative', padding: '3px 0' }}>
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
              onClick={() => onPercent(p)}
              style={{
                position: 'relative',
                minHeight: 24,
                padding: '0 9px',
                // §3.3 — a filter chip is a control, not a count badge.
                borderRadius: 'var(--r-btn)',
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
      </div>
    </div>
  )
}

/**
 * The add-client control, living **inside the field's trailing slot** — the
 * same slot the §11 health eye takes over once a client is chosen.
 *
 * Babin, 4 Sep 2026: "for costumer the eye button inside search box appears
 * when we add costumer, before that there will be +client icon to add client."
 * So that slot is never empty and never holds two things at once: no client
 * selected → add a client; client selected → their health. The standalone
 * `+ New Client` button that used to sit beside the field is gone, its job
 * moved in here.
 *
 * Babin said **icon**, and this is an icon: a square control on Law 15's 44px
 * touch floor carrying the plus glyph and no word. It borrows the eye's
 * `--r-btn`, its `press` class and the same global `:focus-visible` ring
 * (`theme.css:877`), but not its colour — the eye is tinted by a health
 * verdict, and an add button has no verdict to state, so it takes the neutral
 * secondary treatment.
 *
 * It does **not** claim to match the eye's width. The eye is as wide as its
 * verdict label ("Good", "Watch", "Do not book"), so there was never a fixed
 * geometry to mirror and the row's width changes when the two swap either way.
 *
 * The word survives where a word is useful and costs no room: `aria-label` is
 * the accessible name, and `title` gives a sighted mouse user the same phrase
 * on hover. WCAG 2.5.3 (label in name) does not apply — there is no visible
 * label text to disagree with the accessible name.
 */
function AddClientButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="press"
      onClick={onClick}
      aria-label="Add a new client"
      title="Add a new client"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 'var(--tap)',
        height: 'var(--tap)',
        minWidth: 'var(--tap)',
        minHeight: 'var(--tap)',
        flexShrink: 0,
        padding: 0,
        borderRadius: 'var(--r-btn)',
        background: 'var(--btn-secondary-bg)',
        color: 'var(--text)',
        border: '1px solid var(--btn-secondary-border)',
        lineHeight: 1,
        cursor: 'pointer',
      }}
    >
      <Icon name="plus" size={20} />
    </button>
  )
}

/* ── Section 3 · the crew picker ─────────────────────────────────────────
 *
 * Babin, 4 Sep 2026: **"same for crew and transport"**, said straight after
 * "in new rental equipment bundle & services don't put +add equipment button,
 * i want search button over there directly". So Section 3's header slot no
 * longer carries an `Add Member…` <Select>: the field lives in the section
 * body, and typing a name or a job is the whole interaction.
 *
 * This is deliberately **not** a second `AddItemPanel`. That panel searches
 * three pools across four tabs, filters by category and by availability inside
 * the booking window, and sorts. Crew here is one pool of people — no tabs, no
 * categories, and no availability check on this screen — so it gets a plain
 * combobox rather than a copy of a panel whose complexity it does not have.
 *
 * The matching is `data/crew.ts:searchRoster` (law 1 — the page states the
 * outcome, it does not decide it). That function's own note records that
 * `modules/crew/CrewBooking.tsx:247-251` is a second roster picker with its
 * own rule; this one does not replace it and does not claim to.
 */

/**
 * The roster's role vocabulary is not the database's, and that is a live bug.
 *
 * `createRental`'s `CREW_ROLES` accepts only a `crew_role` enum member
 * (`types/database.ts:43`), and crew rides the booking write — so a booking
 * staffed from one of the roles below would be refused by the action itself:
 * *"…is not a crew_role the database accepts"*. Five of the roster's eight
 * roles are in that state; the three the two vocabularies happen to share —
 * Gaffer, Grip, Sound Recordist — go through. Seven of the twelve people on
 * the roster carry a rejected role.
 *
 * They are still listed and still addable. Hiding them would shrink the roster
 * to five of twelve with no stated reason, and inventing a mapping
 * (`1st AC` → `Focus Puller`? `Director of Photography` → `DoP`? `DIT` → what?)
 * is precisely the product decision CLAUDE.md forbids a page to make — the
 * action says as much itself: *"no mapping is ruled"*. So the row states the
 * consequence and lets the operator decide.
 *
 * The row is not the last word on it. Adding one of these people raises a
 * **Critical** blocking notice naming them (see the `alerts` list), so Confirm
 * is refused with a readable reason rather than throwing the action's message
 * at the operator after the press.
 *
 * TODO(decision) — the roster vocabulary (`data/crew.ts:CrewRole`) and the
 * `crew_role` enum (`0001_enums.sql:313-325`) disagree on five roles. Either
 * the enum grows `1st AC`, `2nd AC` and `DIT` and gains the roster's spelling
 * of DoP and Drone Pilot, or a ruled roster→enum mapping lands in the action.
 * Until one of those, Confirm refuses any booking staffed from those rows.
 * Do not change the enum or the action to unblock this picker.
 *
 * Law 1 — **this page does not hold a list of what the database accepts.** It
 * imports the action's own `CREW_ROLES` and takes the complement against the
 * roster's vocabulary, at compile time for the type and at runtime for the
 * check. Add a role to the enum and to that list and the warning stops firing
 * for it here, with no edit on this page; there is no second copy to drift.
 */
type RoleRejectedByDb = Exclude<CrewRole, (typeof CREW_ROLES)[number]>

const ROLES_ACCEPTED_BY_DB: ReadonlySet<string> = new Set<string>(CREW_ROLES)

function dbRejectsRole(role: CrewRole): role is RoleRejectedByDb {
  return !ROLES_ACCEPTED_BY_DB.has(role)
}

/** One sentence, no jargon, same wording in the row and in its accessible name. */
function rejectionNote(role: CrewRole): string {
  return `The database has no “${role}” role, so Confirm will refuse this booking until that is settled.`
}

function CrewSearch({
  onBooking,
  onAdd,
  showRates,
}: {
  /** Who is already on the booking. Excluded from the list — nobody is added twice. */
  onBooking: readonly CrewLine[]
  onAdd: (crewId: string) => void
  /** The page's `canCrewMoney`. A money-blind role sees the roster and never a rate. */
  showRates: boolean
}) {
  const reactId = useId()
  const labelId = `${reactId}-crew-label`
  const listboxId = `${reactId}-crew-listbox`
  const hintId = `${reactId}-crew-hint`

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  /**
   * The empty query returns the whole remaining roster, so this listbox is full
   * on first render and row 0 is already the active option. An unguarded
   * `scrollIntoView` effect on `activeId` would therefore fire **on mount** and
   * scroll the page to Section 3 the moment it is expanded — `AddItemPanel`
   * never hits this only because its 2-character threshold leaves it empty
   * until someone types. So the effect stays inert until the operator actually
   * moves the cursor with the keyboard, and a hover puts it back to inert —
   * otherwise the first arrow key would arm it for every mouse move after,
   * and the list would scroll itself out from under the pointer.
   */
  const [cursorMoved, setCursorMoved] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const excludeIds = useMemo(() => onBooking.map((c) => c.crewId), [onBooking])
  const options = useMemo(() => searchRoster(query, excludeIds), [query, excludeIds])
  /**
   * Whether anyone is left to find at all, which is a different question from
   * whether this query found someone. The empty state used to answer only the
   * second: with the whole roster already on the booking, typing anything at
   * all said "No one matches …", which is true and beside the point — there
   * was nobody to match. An empty query returns the whole remaining roster, so
   * this is that count.
   */
  const rosterExhausted = useMemo(() => searchRoster('', excludeIds).length === 0, [excludeIds])

  // Clamp the cursor whenever the result set shrinks under it.
  useEffect(() => {
    setActiveIndex((i) => (i >= options.length ? 0 : i))
  }, [options.length])

  const activeId = options[activeIndex] ? `${listboxId}-opt-${activeIndex}` : undefined

  useEffect(() => {
    if (!cursorMoved || !activeId) return
    document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [cursorMoved, activeId])

  const commit = (m: CrewMember) => {
    onAdd(m.id)
    setQuery('')
    setActiveIndex(0)
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const count = options.length
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setCursorMoved(true)
        setActiveIndex((i) => (count === 0 ? 0 : (i + 1) % count))
        return
      case 'ArrowUp':
        e.preventDefault()
        setCursorMoved(true)
        setActiveIndex((i) => (count === 0 ? 0 : (i - 1 + count) % count))
        return
      /*
       * `ClientCombobox` guards these two with `if (!open) return`, so its
       * input always has a state in which Home and End reach the ends of the
       * typed text. This listbox has no closed state — it is rendered
       * throughout — so an unconditional `preventDefault` here meant the caret
       * could never get to either end of what the operator had typed. The
       * equivalent guard is the caret's own: the moment there is text to move
       * through, these keys belong to the input, not to the list. The hint
       * below never offered them for the list in the first place.
       */
      case 'Home':
      case 'End': {
        if (query !== '') return
        e.preventDefault()
        setCursorMoved(true)
        setActiveIndex(e.key === 'Home' ? 0 : Math.max(0, count - 1))
        return
      }
      case 'Enter': {
        const m = options[activeIndex]
        if (!m) return
        // Never let the keystroke that picks a person submit the booking form.
        e.preventDefault()
        commit(m)
        return
      }
      case 'Escape':
        /* Only swallow it when there is something to clear. This listbox has no
           closed state, so an unguarded stopPropagation() would eat Escape for
           the whole document whenever the crew field held focus — the drawers
           and modals above this page listen for it. ClientCombobox guards the
           same keys the same way. */
        if (query === '') return
        e.preventDefault()
        e.stopPropagation()
        setQuery('')
        setActiveIndex(0)
        setCursorMoved(false)
        return
      default:
    }
  }

  return (
    <div style={{ marginBottom: 'var(--sp-md)' }}>
      <Field label="Add crew" labelId={labelId}>
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            aria-expanded
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-labelledby={labelId}
            aria-describedby={hintId}
            {...(activeId ? { 'aria-activedescendant': activeId } : {})}
            placeholder="Search the roster by name or role…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={onKeyDown}
            style={{ ...inputStyle, paddingLeft: 32, paddingRight: 10 }}
          />
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'inline-flex',
              color: 'var(--muted)',
              pointerEvents: 'none',
            }}
          >
            <Icon name="search" size={15} />
          </span>
        </div>
      </Field>

      <p id={hintId} style={{ margin: '4px 0 6px', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
        Up and Down to move, Enter to add, Escape to clear. Anyone already on this booking is left out of the list.
      </p>

      <div style={{ maxHeight: 244, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-btn)' }}>
        <ul id={listboxId} role="listbox" aria-labelledby={labelId} style={{ listStyle: 'none', margin: 0, padding: 4 }}>
          {options.map((m, i) => {
            const active = i === activeIndex
            const rejected = dbRejectsRole(m.role)
            const note = rejected ? rejectionNote(m.role) : ''
            return (
              <li
                key={m.id}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={active}
                /* `m.state` — 'Available' / 'Booked' / 'On Leave' / 'Off Duty'
                   — used to be read out here and printed on the row. It is a
                   static seed property of the person, not an answer about
                   THIS booking's dates, and next to a date-bound picker it
                   reads as exactly the answer it is not. There is no crew
                   availability engine to replace it with, so the row simply
                   does not say it. */
                aria-label={`${m.name}, ${m.role}.${
                  showRates ? ` ${formatMoney(m.dayRatePaisa)} per day.` : ''
                }${note ? ` ${note}` : ''} Press Enter to add to this booking.`}
                /* Disarms the scroll effect as well as moving the active row:
                   the pointer is already on the row it is pointing at, so
                   scrolling to it would only drag the list out from under the
                   mouse. The next arrow key arms it again. */
                onMouseMove={() => {
                  setCursorMoved(false)
                  setActiveIndex(i)
                }}
                onClick={() => commit(m)}
                style={{
                  display: 'grid',
                  gap: 2,
                  minHeight: 'var(--tap)',
                  alignContent: 'center',
                  padding: '7px 9px',
                  borderRadius: 'var(--r-btn)',
                  cursor: 'pointer',
                  background: active ? 'var(--hover-row)' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', minWidth: 0 }}>
                  <span style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--text2)' }}>
                    <Icon name="crew" size={15} />
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--t-ui)',
                      fontWeight: 600,
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {m.name}
                  </span>
                  <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{m.role}</span>
                  {showRates && (
                    <span
                      className="figure"
                      style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}
                    >
                      {formatMoney(m.dayRatePaisa)}/day
                    </span>
                  )}
                </div>
                {note && (
                  /* Law 11 — the glyph and the sentence carry it, never the colour alone. */
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--warn-text)' }}>
                    <span style={{ display: 'inline-flex', paddingTop: 1, flexShrink: 0 }}>
                      <Icon name="alert_triangle" size={13} />
                    </span>
                    <span style={{ minWidth: 0 }}>{note}</span>
                  </div>
                )}
              </li>
            )
          })}
          {options.length === 0 && (
            <li role="presentation" style={{ padding: '10px 9px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              {rosterExhausted
                ? 'Everyone on the roster is already on this booking.'
                : `No one on the roster matches “${query.trim()}”. Names and roles are searched.`}
            </li>
          )}
        </ul>
      </div>
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
  /*
   * Seeded from `phoneAccordion`, not `window.innerWidth`.
   *
   * The comment above claimed this read had already been removed while the
   * initializer directly below still performed it — the comment described the
   * intent and the code kept the bug. `useViewport()` resolves synchronously
   * on its own first render (it seeds from `viewportFor(window.innerWidth)`),
   * so reading the band here is correct at mount AND stays correct afterwards,
   * which the raw width read never did.
   */
  const [open, setOpen] = useState<boolean[]>(() =>
    phoneAccordion
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
  /*
   * ── Phase 2: this screen reads the DATABASE, not the seed arrays ─────────
   *
   * Both pools start from the seed shape so the first paint is not empty, and
   * are replaced by the live rows as they land. That is not cosmetic: the seed
   * rows carry `C-34` codes and product names where the writes need uuids, so
   * a booking built before the read lands would be refused by
   * `createRental.validate`. `clientsAreLive` / `catalogueIsLive` below say
   * which state we are in, and the Confirm button refuses while either is
   * still seed — surfaced-as-unavailable, not silently disabled.
   */
  const [clientPool, setClientPool] = useState<ClientRecord[]>(() => [...CLIENTS_DATA])
  const [clientsAreLive, setClientsAreLive] = useState(false)
  /**
   * The live products, in the shape `AddItemPanel` searches — ids are
   * `products.id` uuids, which is the whole point. `null` until the read lands,
   * and the panel falls back to the seed catalogue in the meantime.
   *
   * There was briefly a second `catalogue` state here holding the same rows in
   * `CatalogueItem` shape. It was redundant the moment the panel took a real
   * pool, and two states describing one read is how they drift apart.
   */
  const [liveEquipment, setLiveEquipment] = useState<readonly EquipmentResult[] | null>(null)
  /** Why the live read failed, if it did. Law 12 — stated, never swallowed. */
  const [poolError, setPoolError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [clients, inventory] = await Promise.all([
          listClientRecords(),
          /* `withMoney` decides whether `dailyRate` comes back AT ALL (Law 6),
             so it is the gate this screen already computed — never a literal.
             A money-blind operator still picks equipment; they just do not see
             the rate, which is why the filter below cannot require one. */
          listInventory({ page: { index: 0, size: 500 }, withMoney: canBookingMoney }),
        ])
        if (cancelled) return
        /* Only rows carrying a real uuid are bookable. A client without `dbId`
           came from the seed array and must not silently look selectable. */
        const bookableClients = clients.filter((c) => !!c.dbId)
        if (bookableClients.length > 0) {
          setClientPool(bookableClients)
          setClientsAreLive(true)
        }
        /* Active products only. NOT filtered on a rate: `dailyRate` is null for
           every row when `withMoney` is false, so requiring one would hand a
           money-blind operator an empty catalogue — a Law 6 gate turning into a
           missing feature. The rate defaults to zero for display; pricing is
           the engine's, not this screen's. */
        const rows = inventory.rows.filter((r) => r.isActive)
        if (rows.length > 0) setLiveEquipment(equipmentResultsFrom(rows))
      } catch (e: unknown) {
        if (!cancelled) setPoolError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canBookingMoney])
  /**
   * **No client.** This was `CLIENTS_DATA[0]?.id ?? null` — a *seed* client
   * preselected on every fresh draft.
   *
   * Two things were wrong with it. First, it contradicts this file's own rule,
   * stated twice below: "A new booking starts EMPTY". Project, kind, lines and
   * crew were all emptied for exactly that reason (register item NR-05,
   * 3 Sep 2026); the client was simply missed. The dates were **not** — they
   * are not blank and were never meant to be, they default to the Kathmandu
   * business day and the day after (see `pickup` / `ret` below), which is a
   * computed one-day window rather than the July 2026 literals they replaced.
   * Second, it was already a
   * latent bug: `client` is looked up in `clientPool`, and the moment the live
   * read replaces the seed pool that seed id is not in it, so the preselected
   * client silently vanishes and the field empties itself with no explanation.
   *
   * Starting at `null` is also the only way the field's no-client state — the
   * add-client control in the trailing slot, §15 — is reachable on purpose
   * rather than by accident.
   */
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const client: ClientRecord | undefined = useMemo(
    () => clientPool.find((c) => c.id === selectedClientId),
    [clientPool, selectedClientId],
  )

  // §11 / §15 / §20 — three disclosures over the workspace. None of them route,
  // so consulting a balance never costs a half-built booking.
  const [quickViewOpen, setQuickViewOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [addClientOpen, setAddClientOpen] = useState(false)
  /** Wraps the client combobox, so the page can hand focus back to its input. */
  const clientFieldRef = useRef<HTMLDivElement | null>(null)
  /**
   * Has the operator been in the Client field and left it again?
   *
   * The "select a client" error below is a refusal to proceed, and a form the
   * operator has not touched yet has not tried to proceed. A fresh draft now
   * starts with **no** client (see `selectedClientId`), so an ungated error
   * painted itself red the instant the page opened, before anyone had done
   * anything. Confirm cannot be the trigger here: it is `disabled` whenever
   * `confirmBlocked`, and "No client selected" is one of the Criticals that
   * blocks it, so the press never reaches a handler. Leaving the field is the
   * moment the operator actually passed it by — which is the other trigger the
   * reviewers named. Until then the rail's blocking-notices card still lists
   * the missing client, so nothing is hidden; it is simply not shouted.
   */
  const [clientFieldTouched, setClientFieldTouched] = useState(false)
  /**
   * One-shot: "the next focus on the client input is not a search".
   *
   * `AddClientModal` records `document.activeElement` when it opens and focuses
   * it again on close (the capture/restore pair in its body-scroll-lock
   * effect). The add-client control lives in the field's trailing slot and is
   * replaced by the health eye the instant the new client is selected — so it
   * is unmounted by the time the modal restores focus, and focus would fall
   * back to `<body>`, stranding a keyboard operator at the top of the document.
   *
   * Focusing the input first (synchronously, before the state change that opens
   * the modal) means the element the modal captures is the one control in that
   * row that survives the swap. But focus is also what opens the client
   * dropdown (§9), and neither of these two focus moves is a search: the first
   * would leave the list open behind the modal, the second would pop it open
   * the moment the modal closed. So both set this flag, and `ClientCombobox`
   * consumes it.
   */
  const suppressClientListOnFocus = useRef(false)
  const focusClientInput = useCallback(() => {
    suppressClientListOnFocus.current = true
    const input = clientFieldRef.current?.querySelector<HTMLInputElement>('input[role="combobox"]')
    if (input) input.focus()
    // Nothing was focused, so nothing consumed the flag — do not leave it armed
    // for whatever the operator focuses next.
    else suppressClientListOnFocus.current = false
  }, [])
  const openAddClient = useCallback(() => {
    focusClientInput()
    setAddClientOpen(true)
  }, [focusClientInput])
  const closeAddClient = useCallback(() => {
    // The modal restores focus to the input on the way out; that focus is not a
    // search either. Armed here, before the close, because the restore happens
    // in the modal's own effect cleanup.
    suppressClientListOnFocus.current = true
    setAddClientOpen(false)
  }, [])
  /* The tablet/phone rail handle is gone. `WIREFRAME_RULINGS_2026-08-12.md` §7:
     "Right rails collapse below 1280" means **reflow, not hide** — the rail's
     cards render inline beneath the workspace at tablet and phone, always
     visible, and only the summary + Confirm move into the sticky bar. A
     collapsed handle hid the blocking notices, which Law 12 forbids. */
  /** redesign v1 §5 — which document the draft-email modal is composing for; null = closed. */
  const [emailDraftDoc, setEmailDraftDoc] = useState<string | null>(null)

  /* A new booking starts EMPTY (see the note further down). These used to be
     demo literals — a named project, a kind, and a July 2026 window — which
     made every fresh draft look priced and dated before anyone touched it. */
  const [project, setProject] = useState('')
  const [kind, setKind] = useState('')
  /**
   * The Government ID / PAN box, seeded from the selected client's `pan`
   * (`clients.pan_vat`, read by `queries/clients.ts`).
   *
   * **TODO(decision) — this field is collected and then dropped, and it gates
   * Confirm on the way.** `govId` has exactly four readers: the
   * "Missing client ID or PAN" Critical, the Review card's Client row, the
   * input itself and its inline error. It is in no write. `CreateRentalInput`
   * has no field for it (`actions/rentals/createRental.ts` — clientUuid,
   * clientId, branchId, contactId, project, the two instants, deliveryType,
   * the two locations, quoteExpiresAt, depositRequired, lines, discounts, crew,
   * transport), and this page dispatches nothing else, so a PAN typed here is
   * lost the moment the page unmounts — while a blank one blocks the booking.
   *
   * Three answers are possible and none of them is mine to pick:
   *  a. write it back to the client record — `clients.pan_vat` exists and
   *     `createClient` already writes it (`panVat`, CHECK: nine digits), so
   *     this would be an `updateClient` on select/confirm;
   *  b. store it per booking — there is no column for it today;
   *  c. drop the gate — it is the only Critical on this page that guards a
   *     value nothing consumes.
   * Whichever it is, (a) and (b) are schema/action work and (c) is a product
   * call, so the gate is left exactly as it is rather than quietly relaxed.
   */
  const [govId, setGovId] = useState(client?.pan ?? '')
  /* Dates default to the business day (Kathmandu's, `getBusinessToday`) and the
     day after — a one-day window, never a hardcoded date. `getBusinessToday`
     returns midnight UTC of the Kathmandu civil date, so `.toISOString()`'s
     date part IS the Kathmandu calendar date. */
  const [pickup, setPickup] = useState(() => getBusinessToday().toISOString().slice(0, 10))
  const [ret, setRet] = useState(() => new Date(getBusinessToday().getTime() + DAY).toISOString().slice(0, 10))
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

  /* `seedLine` lived here and built the three pre-picked demo rows. Both are
     gone: it had no other caller, and a helper whose only job was to
     manufacture unsaveable lines is not worth keeping for a future that would
     not want it. `AddItemPanel`'s `onAdd` is the only way a line arrives now. */
  /*
   * A new booking starts EMPTY.
   *
   * It used to open with three items pre-picked from `EQUIPMENT_CATALOGUE`.
   * That was demo scaffolding, and once this screen started writing for real it
   * became actively wrong: those rows carry product NAMES for ids, so every
   * booking would have opened pre-loaded with three lines that can never be
   * saved, and an operator who did not notice would meet the refusal at the
   * end instead of the start. Nothing is lost — the operator adds what the job
   * actually needs, which is what the panel below is for.
   */
  const [lines, setLines] = useState<Line[]>(() => [])

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

  /*
   * Empty. This opened with three roster members already on the booking
   * (CR-001 / CR-005 / CR-007 — the §10.2 worked example), so a draft with no
   * client and no equipment read Rs 1,54,482 before anyone typed a thing.
   * Money on this screen derives from what the draft holds, and a new draft
   * holds nothing (TODO_SWEEP_2026-09-02.md A8).
   */
  const [crew, setCrew] = useState<CrewLine[]>(() => [])
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
  /*
   * The delivery vehicle, as free text (Babin, 4 Sep 2026).
   *
   * `booking_transport` has carried `vehicle`, `number_plate` and
   * `driver_contact` since `0002:377-380` and `createRental` has accepted all
   * three since the transport row landed — this screen simply never asked for
   * them, so every delivery was filed with a charge and no vehicle. The
   * comment beside the dispatch even said this row is "where the vehicle and
   * driver will be recorded". Now it is.
   *
   * Free TEXT on purpose: there is no vehicle table anywhere in the schema and
   * no roster in seed, so there is nothing to pick from. A picker would need a
   * vehicle record ruled first — `TODO(decision)`. Typing what is on the van
   * is the honest version of that today.
   *
   * `driver_id` (a `users` FK, `0002:379`) is deliberately NOT collected here:
   * a contact string is what the counter knows, and binding a booking to a
   * staff row needs the staff picker that `ResetWorkspace` is also waiting on.
   */
  const [vehicle, setVehicle] = useState('')
  const [numberPlate, setNumberPlate] = useState('')
  const [driverContact, setDriverContact] = useState('')
  /* 0, not the worked example's 7 — a discount is something someone grants. */
  const [discountPct, setDiscountPct] = useState(0)
  /* `discountReason` / `approver` / `discountPopoverOpen` left with the
     discount gate (31 Aug 2026 — D3, Babin: "don't put any gate on discount"). */
  /**
   * The VAT rate, read from Settings ▸ Financial once per mount. The literal
   * `VAT_PCT = 13` this page used to carry is deleted — see `readVatRatePercent`.
   */
  const [vatRatePercent] = useState<number>(readVatRatePercent)
  /** 01_NEW_RENTAL §1.1 rail — `VAT {rate}%  [on ▢]`. On is the default. */
  const [vatOn, setVatOn] = useState(true)
  /*
   * All three were the §10.2 worked example (15,000 / 50,000 / 25,000) and
   * rendered on a blank draft as if money had already moved. Nothing has: the
   * advance is typed below, and how the required deposit is derived is still
   * unruled (0002_bookings.sql, `deposit_required` — TODO(decision)), so both
   * deposit figures are honestly zero until a ruling makes them a calculation.
   */
  const [advancePaisa, setAdvancePaisa] = useState<Paisa>(rupees(0) as Paisa)
  const depositRequiredPaisa = rupees(0) as Paisa
  const depositReceivedPaisa = rupees(0) as Paisa

  /** Pickup and return as instants — see `bookingInstant`. */
  const pickupAt = useMemo(() => bookingInstant(pickup, pickupTime), [pickup, pickupTime])
  const returnAt = useMemo(() => bookingInstant(ret, returnTime), [ret, returnTime])

  /**
   * The booking's length in whole rental days — `bookingDays`, which is where
   * NR-19 and the Law 1 delegation to `lib/rentalDays.ts` are written up.
   *
   * The page stays fractionally stricter than `createRental.validate` in one
   * respect, on purpose: a return exactly equal to the pickup is refused here
   * though `validate` allows it, because a zero-length hire would still be
   * floored to one billed day and nobody types a booking with no duration
   * deliberately.
   */
  const days = useMemo(() => bookingDays(pickupAt, returnAt), [pickupAt, returnAt])

  /*
   * "1 days". Pre-existing — three summaries hardcoded the plural — but NR-19
   * is what made it the page's OPENING state: a fresh booking defaults to one
   * date, which used to measure 0 days ("0 days", grammatical by luck) and now
   * correctly measures 1. Computed once here rather than a fourth time inline;
   * `formatRentalDays` is not used because these three read "rental days" and
   * "→ N days" in lower case, and it renders "N Days".
   */
  const dayWord = days === 1 ? 'day' : 'days'

  /**
   * NR-19, second half — the booking's length reaches the lines it already has.
   *
   * A line's Days is stamped once, by `AddItemPanel`, from the `days` prop this
   * page passes it. Change the window afterwards and every line already on the
   * booking kept the old number: the Days column, the line amounts, the
   * Equipment Subtotal and — the part that matters — `booking_lines.days` in
   * `confirmBooking`'s payload were all measured over a window that is no
   * longer the booking's. Nothing on screen said so, because the header's Days
   * figure updated and the lines' did not.
   *
   * Only lines nobody has edited move: `daysOverridden` (set by the Days
   * stepper) marks a per-line decision, and re-stamping over it would be the
   * same defect pointing the other way. `days === 0` is the invalid-window
   * gate, not a length — nothing is re-stamped from it.
   */
  useEffect(() => {
    if (days === 0) return
    setLines((prev) => {
      let changed = false
      const next = prev.map((l) => {
        if (l.daysOverridden === true || l.days === days) return l
        changed = true
        return { ...l, days }
      })
      return changed ? next : prev
    })
  }, [days])

  /**
   * §32 — availability is answered for *these* dates, not for today.
   *
   * ⛔ This differenced the two `YYYY-MM-DD` picker values and threw the TIMES
   * away, which stopped mattering the moment NR-19 let a same-day booking
   * through: for a 09:00→18:00 hire on one date both bounds were the same
   * midnight, and `itemCatalogue.ts`'s `validWindow` returns `null` for
   * `to <= from`. So the booking Confirm now accepts was the booking
   * availability could not be answered for — every unit fell back to its
   * unwindowed reading, silently.
   *
   * It reads the same two instants `days` and the write payload use
   * (`bookingInstant`), so the window a unit is checked against and the window
   * that reaches `booking_lines` cannot disagree.
   */
  const bookingWindow = useMemo<BookingWindow>(
    () => ({ pickupAd: pickupAt, returnAd: returnAt }),
    [pickupAt, returnAt],
  )

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
   * Law 10 as amended 31 Aug 2026, through the engine rather than a
   * re-derivation on the page. The gate is GONE (D3, Babin: "don't put any
   * gate on discount") — `validateDiscount` now refuses only a negative
   * percent (a price rise) and >100% (a negative price), and no chip or
   * clamp on this page can produce either. The verdict still gates Confirm
   * so the arithmetic refusals surface if state is ever set another way.
   */
  const discountVerdict = validateDiscount(discountPct)
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
      ? [{ text: discountVerdict.error ?? 'Discount is not a valid percentage.', severity: 'Critical' as const, action: 'Fix Discount' }]
      : []),
    /*
     * The roster's role vocabulary is not the `crew_role` enum (see
     * `dbRejectsRole`), and `createRental` refuses the whole booking by name
     * the moment one of those roles is sent. The picker states that on the row
     * it applies to — but a row-level note is forgotten the instant the person
     * is added, and until now the next mention of it was an exception thrown
     * out of Confirm. Carried forward here so Confirm is refused, in the same
     * list as every other reason, with the person named.
     */
    ...crew
      .filter((c) => dbRejectsRole(c.role))
      .map((c) => ({
        text: `${c.name}'s role — ${c.role} — is not one the database accepts, so this booking cannot be confirmed while they are on it`,
        severity: 'Critical' as const,
        action: 'Open Crew',
      })),
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
     *
     * ⚠ WIDENED by the BUG-004 fix (2 Sep 2026). The rail's money pair is now
     * `disabled` + `Unavailable` for **every** role on this screen, because the
     * draft has no booking row to attach a payment to (see the block at the
     * Summary card). So the mismatch this TODO describes is no longer a
     * money-permission edge — it is the ordinary path: any user who presses a
     * notice labelled "Receive Payment" is scrolled to a button that cannot be
     * pressed.
     *
     * That is deliberately left as-is rather than patched, and the reason is
     * worth stating: the destination now *explains itself* — it names why the
     * payment cannot be taken and what to do instead (Confirm the booking).
     * A notice that leads to a stated reason is honest; a notice relabelled by
     * me would be invented copy. The decision is unchanged in kind and now
     * simply applies to everyone: does the notice keep the verb, or does it
     * read "View Balance", or does §12's one-action rule get a third answer?
     */
    ...(canBookingMoney && depositRequiredPaisa > depositReceivedPaisa
      ? [{ text: `Deposit ${formatMoney(depositPendingPaisa)} pending`, severity: 'Warning' as const, action: 'Receive Deposit' }]
      : []),
    ...(canBookingMoney && breakdown.outstanding > 0 ? [{ text: 'Rental outstanding', severity: 'Warning' as const, action: 'Receive Payment' }] : []),
  ]
  const critical = alerts.filter((a) => a.severity === 'Critical')
  /** Warnings and information — the criticals live in the blocking-notices card. */
  const nonBlockingAlerts = alerts.filter((a) => a.severity !== 'Critical')

  /**
   * 01_NEW_RENTAL §1.1 — the rail's `⚠ blocking notices (inline, persists)`.
   *
   * **Every** reason Confirm is refused, in full, in one list — and since NR-10
   * that is the literal truth rather than the intention. Three sources feed it
   * and there is no fourth anywhere on this page:
   *
   *  1. the date window, which blocks Confirm and has no home in the alert
   *     model, so it read only as a sentence under the page header;
   *  2. the Criticals from `alerts`;
   *  3. `confirmWriteRefusals` — the refusals the Confirm handler used to keep
   *     to itself. See that function.
   *
   * Law 12 — inline and persistent. This never becomes a toast and is never
   * truncated into the sticky bar; at tablet and phone the card detaches from
   * the rail and renders immediately above that bar instead.
   */
  const blockingNotices: BlockingNotice[] = [
    /* "date" was dropped from this sentence with NR-19: the times are part of
       the comparison now, so a same-day window with the return time earlier
       than the pickup time lands here too, and the dates are not what is
       wrong with it. */
    ...(days === 0 ? [{ text: 'The return must be later than the pickup — check the times as well as the dates.', action: 'Open Dates' }] : []),
    ...critical.map((a) => ({ text: a.text, action: a.action })),
    ...confirmWriteRefusals({
      clientSelected: Boolean(client),
      clientDbId: client?.dbId ?? null,
      clientsAreLive,
      lineCount: lines.length,
      sampleLineName: lines.find((l) => !PRODUCT_ID_RE.test(l.id))?.name ?? null,
      canBookingMoney,
    }),
  ]
  /**
   * ONE predicate. The card lists `blockingNotices`, this disables the button
   * on the same array, and `confirmBooking` refuses the press on it too — so
   * the card can no longer read "nothing is blocking this booking" while the
   * next press fails.
   */
  const confirmBlocked = blockingNotices.length > 0
  const blockReasonText = confirmBlocked
    ? `Blocked — ${blockingNotices.length} ${blockingNotices.length === 1 ? 'notice' : 'notices'} must be resolved before this booking can be confirmed.`
    : undefined

  const pickupBs = toBs(new Date(pickup))
  const returnBs = toBs(new Date(ret))

  /* ── §24 / §34 — the Add Item panel hands back ready lines; the page appends
   *    them and every existing pricing / availability path recomputes as it
   *    already did. Nothing about how a line is priced changed (§67). ─────── */
  /**
   * What the last bundle add did and did not do — the engine's own sentences
   * (`AddBundleResult.notes` / `skipped`, itemCatalogue.ts), which this page used
   * to drop on the floor: an operator picked a bundle advertised at one rate and
   * saw fewer lines at a higher total with nothing on screen saying why. Shown
   * inline above the lines table; cleared by the next add or by the operator.
   * Information, not an error — no toast, no red (Law 12).
   */
  const [bundleNotice, setBundleNotice] = useState<{
    name: string
    notes: readonly string[]
    skipped: ReadonlyArray<{ model: string; reason: string }>
  } | null>(null)

  const addDrafts = useCallback((drafts: readonly BookingLineDraft[], source: AddItemSource) => {
    setBundleNotice(
      source.kind === 'bundle' && source.bundle
        ? { name: source.name, notes: source.bundle.notes, skipped: source.bundle.skipped }
        : null,
    )
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

  /** Take one person off the booking. `CrewSearch` offers them again immediately. */
  const removeCrew = (crewId: string) => {
    setCrew((p) => p.filter((c) => c.crewId !== crewId))
    setExpandedCrew((p) => {
      const next = new Set(p)
      next.delete(crewId)
      return next
    })
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
   *
   *    'saved' is the INITIAL value and does not mean anything has been saved —
   *    NR-13 renamed what the footer says about it, because nothing on this
   *    page persists a draft. 'error' exists so a rejected save cannot fall
   *    back into that quiet state; see the footer's own note. */
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  /**
   * **Law 8.** One key per Confirm press, reused by every retry of that press
   * (the pattern `AddClientModal`'s `saveKey` uses), so a double-click or a
   * retry after a failure replays the same `create_booking` instead of minting
   * a second Quote. Cleared only when the whole press has landed.
   */
  const confirmKey = useRef<string | null>(null)
  /**
   * The Quote `createRental` already committed for this press, if any. A
   * Confirm press is TWO writes — create (lands a Quote) then `confirmRental` —
   * and the second can fail after the first landed. Holding the id means a
   * retry confirms the SAME booking rather than creating another, and the
   * error line can say what is actually true.
   */
  const createdQuote = useRef<{ id: string; no: string } | null>(null)
  /* NR-02 — Law 8 keys for the rows written beside the header, one per row,
     minted on the first press and reused on a retry so the same press lands
     the same rows once. Cleared with `confirmKey` when the whole press lands. */
  const discountKey = useRef<string | null>(null)
  const crewKeys = useRef<string[]>([])
  const transportKey = useRef<string | null>(null)
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
    /*
     * `saveState === 'saving'` is the double-click Law 8 exists for — a press
     * while the previous one is still in flight. Both Confirm buttons are
     * `disabled` on this same expression.
     *
     * ⛔ NR-10 — and the other half of it is ONE predicate.
     *
     * Four refusals used to be written out AGAIN in this body — a client with
     * no uuid, zero lines, a money-blind role, a line id that is not a uuid —
     * each with its own sentence, and none of them in `blockingNotices`. So the
     * rail's card said "Nothing is blocking this booking · Every requirement
     * for Confirm Booking is met", both Confirm buttons stayed enabled, and the
     * press failed into the inline error line. They live in that list now
     * (`confirmWriteRefusals`), `confirmBlocked` IS that list being non-empty,
     * and both buttons are `disabled` on the same expression — so the notice is
     * on screen, persistently, before the press instead of after it (Law 12).
     */
    if (confirmBlocked || saveState === 'saving') return
    const ctx = dispatchContext()
    if (!ctx) {
      setActionError('Not confirmed — you are not signed in, so this booking cannot be attributed to anyone. Sign in and confirm again.')
      return
    }
    /*
     * ── Phase 2 landed: this dispatches CREATE_RENTAL for real ──────────────
     *
     * Three uuids have to be real or the write is refused by name rather than
     * failing an FK three layers down — client, every product, and the branch.
     * The first two now come from `lib/queries/*`; the branch is read from the
     * signed-in user's own row, the same way `approveDailyClosing` reads it,
     * because this screen has no branch picker and defaulting to the first
     * branch would file one branch's booking under another.
     *
     * A booking is created as a **Quote** (`createRental` always returns that
     * stage) and confirmed by a second call — `confirmRental`, which is what
     * `BookingDetail`'s own confirm dispatches. Both are sent here so the
     * button does what it says.
     */
    /*
     * The three values the payload cannot be built without. Each is already
     * guaranteed by a blocking notice: `client.dbId` by "No client selected"
     * (the alert model) together with `confirmWriteRefusals`' no-uuid case, and
     * `pickupAt` / `returnAt` by the `days === 0` notice — `bookingDays`
     * answers 0 for exactly `!pickupAt || !returnAt || returnAt <= pickupAt`.
     * So this is the type narrowing rather than a fifth rule, and it states a
     * reason instead of returning blank in the case that cannot arise.
     */
    const clientDbId = client?.dbId
    if (!clientDbId || !pickupAt || !returnAt) {
      setActionError('Not confirmed — this booking has no client record or no usable dates. Nothing was written.')
      return
    }

    setActionError(null)
    setSaveState('saving')
    /* Minted at the press, not per attempt: a retry of THIS press reuses it. */
    if (!confirmKey.current) confirmKey.current = newClientUuid()
    const pressKey: string = confirmKey.current
    /* Which of the two writes is in flight, so the catch can tell the truth
       about what landed. Everything up to and including `createRental` is
       'create' (nothing persisted if it throws); `confirmRental` is 'confirm'. */
    let step: 'create' | 'confirm' = 'create'
    void (async () => {
      try {
        /* A retry after a half-success: the Quote exists, so skip straight to
           confirming it rather than creating a second one.
           TODO(decision): if the operator EDITS lines/dates after the Quote
           landed and before the retry, this confirms the Quote as first written,
           not the screen as it now reads. Whether to lock the form, re-route to
           the Quote's BookingDetail, or something else is a product call. */
        if (!createdQuote.current) {
        const { data: userRow, error: userErr } = await supabase
          .from('users')
          .select('branch_id')
          .eq('id', ctx.userId)
          .maybeSingle()
        if (userErr) throw new Error(`the operating branch could not be read (${userErr.message})`)
        const branchId = (userRow as { branch_id?: string | null } | null)?.branch_id
        if (!branchId) {
          throw new Error(
            'your staff record carries no branch, and a booking is filed per branch. Ask an Owner to set your branch first',
          )
        }

        const created = await createRental(
          {
            /* Law 8 — one key for this press, so a double-click is one booking. */
            clientUuid: pressKey,
            clientId: clientDbId,
            branchId,
            project: project.trim() ? project.replace(/^'|'$/g, '') : null,
            /* Law 7 — the stored instant is AD/UTC; the pickers hold local
               wall-clock, so they are combined and sent as a full ISO string.
               NR-19 — the SAME two instants the page measured `days` over
               (`bookingInstant`), not a second construction of them. */
            pickupAt: pickupAt.toISOString(),
            returnAt: returnAt.toISOString(),
            /* The UI says "Client Pickup"; the enum stores "Customer Pickup"
               (Law 17 lives in the label, not the column). */
            deliveryType: deliveryTypeFromLabel(deliveryType),
            /* NR-02 — the write carries what the rail prices, not equipment
               lines alone. What still has NO home on a Quote and is therefore
               not sent: the VAT switch (`vat_rate` lives on the invoice, which
               does not exist yet) and the advance (a payment settles against
               an invoice — recordPayment refuses without one). Both are
               TODO(decision): where a Quote-time VAT choice and a typed
               advance are recorded before the first invoice. */
            depositRequired: toRupees(depositRequiredPaisa),
            ...(discountPct > 0
              ? {
                  discounts: [
                    {
                      clientUuid: discountKey.current ?? (discountKey.current = newClientUuid()),
                      discountSource: 'Manual',
                      percent: discountPct,
                    },
                  ],
                }
              : {}),
            ...(crew.length > 0
              ? {
                  crew: crew.map((c, i) => ({
                    clientUuid: crewKeys.current[i] ?? (crewKeys.current[i] = newClientUuid()),
                    name: c.name,
                    /* The roster's role vocabulary is not the crew_role enum;
                       the action refuses a role the enum lacks, by name. */
                    role: c.role as CrewRoleDb,
                    phone: c.phone,
                    dayRate: toRupees(c.dayRatePaisa),
                    days: days || 1,
                    overtime: toRupees(c.overtimePaisa),
                    accommodation: toRupees(c.accommodationPaisa),
                    meals: toRupees(c.mealsPaisa),
                  })),
                }
              : {}),
            /* §9.2 — Client Pickup carries no transport row; a delivery does,
               even at zero charge, because the row is where the vehicle and
               driver will be recorded. */
            ...(clientPickup
              ? {}
              : {
                  transport: {
                    clientUuid: transportKey.current ?? (transportKey.current = newClientUuid()),
                    deliveryCharge: toRupees(deliveryChargePaisa),
                    fuelCharge: toRupees(fuelChargePaisa),
                    /* Empty is NULL, not "". The columns are nullable and an
                       empty string would read back as a vehicle that was named
                       and is blank, rather than one nobody recorded. */
                    vehicle: vehicle.trim() === '' ? null : vehicle.trim(),
                    numberPlate: numberPlate.trim() === '' ? null : numberPlate.trim(),
                    driverContact: driverContact.trim() === '' ? null : driverContact.trim(),
                  },
                }),
            lines: lines.map((l, i) => ({
              clientUuid: newClientUuid(),
              lineType: 'Equipment' as const,
              productId: l.id,
              qty: l.qty,
              /* Law 9 — days is mandatory and never defaulted. */
              days: l.days,
              /* `booking_lines.rate` is numeric(14,2) rupees; `toRupees` is the
                 engine's paisa→rupees and keeps the paisa the old
                 `Math.round(paisa / 100)` threw away. */
              rate: toRupees(l.ratePaisa),
              sortOrder: i,
            })),
          },
          ctx,
        )
        createdQuote.current = { id: created.bookingId, no: created.bookingNo }
        }

        /* Created as a Quote; confirm it into Booked with the id the database
           just minted — never the `bk-new` placeholder this screen used to send. */
        step = 'confirm'
        const mod = await import('../../actions/rentals/confirmRental')
        await mod.confirmRental({ id: createdQuote.current.id }, ctx)

        /* The whole press landed: the next press is a new booking. */
        confirmKey.current = null
        createdQuote.current = null
        discountKey.current = null
        crewKeys.current = []
        transportKey.current = null
        setSaveState('saved')
        /* Landing on the rentals list is this app's universal "the write
           landed" signal — now it has. */
        navigate('/rentals')
      } catch (err) {
        setSaveState('error')
        const reason = err instanceof Error ? err.message : String(err)
        if (err instanceof CreateRentalPartialError) {
          /* The header, lines and discounts landed; a crew or transport row
             did not. The Quote is named and a retry confirms it AS IT IS — the
             rows that failed are not retried, and the message says so. */
          createdQuote.current = { id: err.bookingId, no: err.bookingNo }
          setActionError(
            `Booking saved as a Quote (${err.bookingNo}), but ${reason} Press Confirm Booking again to confirm that Quote without the missing rows, or open it from the Rentals list to add them.`,
          )
          return
        }
        if (step === 'confirm' && createdQuote.current) {
          /* The create landed and the confirm did not. "Nothing was written"
             would be false here — a Quote exists, and it is named so the
             operator can find it. A retry confirms that same Quote. */
          setActionError(
            `Booking saved as a Quote (${createdQuote.current.no}); Confirm did not land: ${reason}. Press Confirm Booking again to confirm that same Quote — no second booking will be created.`,
          )
        } else {
          setActionError(
            `Not confirmed — ${reason}. Nothing was written, and nothing entered here has been lost.`,
          )
        }
      }
    })()
  }, [
    /* NR-10 — one boolean, and it is `blockingNotices.length > 0`. The four
       refusals this handler used to carry are in that list, so refusing on it
       refuses on them. */
    confirmBlocked,
    saveState,
    dispatchContext,
    client,
    lines,
    project,
    /* NR-19 — the two instants, not the four picker strings they came from. */
    pickupAt,
    returnAt,
    deliveryType,
    /* NR-02 — the rows written beside the header read these; without them in
       the deps the press sent the INITIAL zero discount and no crew (driven
       3 Sep: 5% on screen, no booking_discounts row in the overlay). */
    discountPct,
    crew,
    clientPickup,
    deliveryChargePaisa,
    fuelChargePaisa,
    /* Same reason as the discount above: the transport row reads these, and a
       stale closure would file a delivery with no vehicle on it. */
    vehicle,
    numberPlate,
    driverContact,
    days,
    depositRequiredPaisa,
    navigate,
  ])

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
    /*
     * ⛔ NR-14 — this was `if (c.pan) setGovId(c.pan)`, and the guard was the
     * bug. Choosing a client with a PAN and then switching to one without left
     * the FIRST client's PAN sitting in the field: the operator saw a filled
     * Government ID / PAN box, the "Missing client ID or PAN" Critical stayed
     * clear, and the document on screen belonged to somebody else.
     *
     * `?? ''` is not a new rule invented here — it is what the page's two other
     * client-selection sites already do (`onClientCreated` below, and
     * `AddClientModal`'s `onUseExisting` at the bottom of the file). Three
     * client-selection paths write this field; two cleared it and one did not,
     * which is the whole defect. They agree now, on the version that cannot
     * carry a stale value.
     */
    setGovId(c.pan ?? '')
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
      /* NR-10 — both equipment refusals settle in the Equipment section: one
         wants a first item added, the other wants a sample row removed and
         re-added from the live catalogue. Same destination, one verb. */
      if (action === 'Open Equipment') jumpToSection('section-2')
      // A rejected crew role is settled where the crew is: remove the person,
      // or wait for the roster/enum mismatch to be ruled.
      if (action === 'Open Crew') jumpToSection('section-3')
      if (action === 'Fix Discount') {
        // The approval popover this used to open left with the discount gate
        // (31 Aug 2026); the fix for an arithmetic refusal is the percent
        // field itself, which lives in the Summary card.
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
    /* Not unconditionally true any more: a crew member whose role the database
       refuses is a Critical, and §11 forbids an all-green Review while one is
       open. Crew is otherwise optional, so an empty crew list is still fine. */
    { label: 'Crew', ok: crew.every((c) => !dbRejectsRole(c.role)), targetId: 'section-3' },
    { label: 'Delivery', ok: true, targetId: 'section-4' },
    { label: 'Pricing', ok: !discountUnapproved && breakdown.rentalTotal > 0, targetId: 'section-5' },
    { label: 'Payments', ok: breakdown.outstanding <= 0, targetId: 'section-5' },
    { label: 'Documents', ok: false, targetId: 'rail-documents' },
  ]
  const reviewCompleteCount = reviewItems.filter((r) => r.ok).length

  /*
   * ⛔ NR-12 — `documentTiles` lived here and is gone. It listed five documents
   * with a `ready` flag and a stage each becomes available at, and all three
   * halves of that were invented:
   *
   *  1. `{ n: 'Quote', ready: true }` — "Available", on a booking that does not
   *     exist. Nothing in this build generates a document of any kind:
   *     `actions/documents/createDocument.ts` declares `implemented: false` and
   *     has no caller in `src/` (its only mention is a comment in
   *     `modules/documents/Documents.tsx`), `data/documents.ts` states it in
   *     one line — "document storage, generation and delivery are unwired" —
   *     and this page's own Send Quote menu already disables Download PDF with
   *     "No PDF generator is connected in this build."
   *  2. The `from` vocabulary — "At Confirmed", "At Preparing", "At Dispatched"
   *     — is not this system's. `lib/workflow.ts` §1.2 has six statuses (Quote ·
   *     Booked · Packed · On Rent · Returned · Closed); Confirmed, Preparing and
   *     Dispatched are members of the RETIRED v1.x list that `§1.4`'s `RETIRED`
   *     map exists to translate away, and the type holding them is deliberately
   *     not exported so a retired stage cannot reach a component. These reached
   *     one as string literals.
   *  3. The ✉ on the Quote tile opened a client email whose body said the
   *     document was attached. See the `DraftEmailModal` call site below.
   *
   * What replaces it is the true statement, in the same card, in the same rail
   * position. `reviewItems`' Documents row is unchanged — it was already
   * `ok: false`, and it still jumps here.
   */

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
        {/* §8.3 — Days is mandatory and explicit on every line, now a stepper.
            Editing it marks the line (NR-19): the booking's own length is
            re-stamped onto lines that have not been set by hand, and this is
            the hand. */}
        <td style={{ ...td, textAlign: 'right' }}>
          <Stepper
            value={l.days}
            label={`days for ${l.name}`}
            onChange={(n) => setLines((p) => p.map((x) => (x.id === l.id ? { ...x, days: n, daysOverridden: true } : x)))}
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
        <DiscountChips percent={discountPct} onPercent={setDiscountPct} amount={formatMoney(breakdown.discount)} />
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
          {/*
            BUG-004 — both of these were enabled, styled as live secondary
            actions, and carried no `onClick`. A money-taking affordance that
            silently does nothing is worse than an absent one.

            They are NOT blocked on the policy question the audit raised ("can
            money be taken against an unconfirmed booking?"). They are blocked
            one layer below it: **this screen never persists a booking.**
            `Confirm Booking` does not dispatch `createRental` yet either — see
            the ⛔ block at :1485 — so there is no `bookings.id`, no invoice, and
            nothing for `RecordPaymentModal` (which resolves an `invoiceId` out
            of an `invoices` list) to attach a payment to. That holds whichever
            way the policy is ruled.

            Disabled with the reason rather than removed: the money buttons are
            where §1 of the redesign puts them, and hiding them here would read
            as "this role cannot take payment", which is the Law 6 meaning and
            not what is true — `canTakePayment` already passed to render this.

            The same action, wired, lives on Booking Detail once the booking
            exists (`canBookingMoney && canTakePayment`).
          */}
          <Unavailable reason="This booking does not exist yet — Confirm creates it, and a payment needs an invoice to record against. Receive payment from the booking once it is confirmed.">
            <Button icon="dollar" variant="secondary" disabled>Receive Payment</Button>
          </Unavailable>
          <Unavailable reason="This booking does not exist yet — Confirm creates it, and a deposit needs a booking to be held against. Receive the deposit from the booking once it is confirmed.">
            <Button icon="dollar" variant="secondary" disabled>Receive Deposit</Button>
          </Unavailable>
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
          {blockingNotices.map((n) => {
            /* Hoisted so the guard below narrows it for the click handler too —
               a property read would not stay narrowed inside the closure. */
            const action = n.action
            return (
              <li key={n.text} style={{ padding: '8px 9px', borderRadius: 'var(--r-btn)', background: 'var(--st-danger-bg)' }}>
                <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                  <Icon name="error" size={13} style={{ color: 'var(--st-danger-fg)', flexShrink: 0, marginTop: 2 }} />
                  {/* The full sentence, never clipped — Law 12. */}
                  <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--st-danger-fg)', lineHeight: 1.4 }}>
                    <span style={srOnly}>Blocking: </span>
                    {n.text}
                  </span>
                </div>
                {/* NR-10 — a notice with nowhere to send the operator gets no
                    button. The money-blind refusal is the one: its fix is another
                    person, not another section, and `runNoticeAction` matches no
                    branch for it, so a button here would do nothing at all. */}
                {action !== undefined && (
                  <button
                    type="button"
                    className="press"
                    onClick={() => runNoticeAction(action)}
                    style={{ position: 'relative', marginTop: 5, marginLeft: 20, minHeight: 26, padding: '0 8px', borderRadius: 'var(--r-btn)', border: '1px solid var(--st-danger-fg)', background: 'transparent', color: 'var(--st-danger-fg)', fontFamily: 'inherit', fontSize: 'var(--t-th)', fontWeight: 700, cursor: 'pointer' }}
                  >
                    <TouchInset />
                    {action}
                  </button>
                )}
              </li>
            )
          })}
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
   * Rendered by the desktop rail only; below 1280 the sticky bar owns it, so
   * there is exactly one Confirm at every width.
   */
  const confirmBlock = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} title={blockReasonText}>
      <Button icon="check" variant="primary" onClick={confirmBooking} disabled={confirmBlocked || saveState === 'saving'}>
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
          {/*
            BUG-004 — `Share` and `More` had no `onClick`, and their `title` /
            `aria-label` actively PROMISED the behaviour ("Share this draft
            booking", "More actions for this booking"). The tooltip was the
            harm: a dead button is a puzzle, a dead button that describes what
            it does is a lie, and on a screen reader the promise was the only
            thing announced.

            `Print` is real (`window.print()`) and is left alone. The other two
            carry their reason instead of their promise, and are disabled so the
            press does not read as "nothing happened".
          */}
          {([
            { label: 'Print', icon: 'file' as IconName, hint: 'Print this draft booking', why: null },
            { label: 'Share', icon: 'arrow_right' as IconName, hint: null, why: 'Sharing is not built yet — no destination is settled (a client portal link, an email, or a PDF hand-off).' },
            { label: 'More', icon: 'more_vert' as IconName, hint: null, why: 'No further actions are built for a draft booking yet — the ones that exist are Print, and Confirm at the foot of the page.' },
          ]).map((a) => {
            const tile = (
              <button
                key={a.label}
                type="button"
                className={a.why ? undefined : 'press'}
                title={a.hint ?? undefined}
                aria-label={a.hint ?? a.label}
                disabled={a.why !== null}
                onClick={a.label === 'Print' ? () => window.print() : undefined}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 56, padding: '10px 4px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: a.why ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: a.why ? 0.6 : 1, width: '100%' }}
              >
                <Icon name={a.icon} size={17} style={{ color: 'var(--text2)' }} />
                {a.label}
              </button>
            )
            return a.why ? (
              <Unavailable key={a.label} reason={a.why} style={{ display: 'block' }}>
                {tile}
              </Unavailable>
            ) : (
              tile
            )
          })}
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
              /* Grown, not coated. These rows were minHeight 30 with a
                 `TouchInset` on top, which is the vertical-overlap trap: a 44px
                 target on a 30px row in a GAPLESS column overhangs 7px each
                 side, so adjacent rows overlapped by 14px and the later one in
                 the DOM won — a tap near a boundary jumped to the wrong
                 section. Full-width rows have no horizontal neighbour to
                 collide with, so the box grows to the floor and the inset is
                 not needed at all: the row IS the target. */
              style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center', width: '100%', minHeight: 'var(--tap)', padding: '4px 2px', border: 'none', background: 'transparent', textAlign: 'left', fontFamily: 'inherit', fontSize: 'var(--t-meta)', cursor: 'pointer' }}
            >
              <Icon name={r.ok ? 'check' : 'alert_triangle'} size={13} style={{ color: r.ok ? 'var(--success-text)' : 'var(--progress-text)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, color: 'var(--text2)' }}>{r.label}</span>
              <span style={{ fontWeight: 600, color: r.ok ? 'var(--text)' : 'var(--progress-text)' }}>{r.ok ? 'Complete' : 'Pending'}</span>
              <Icon name="chevron_right" size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </Card>

      {/* redesign v1 §6 — Documents also moved from Section 5 into the rail.
          §11 — nothing is pre-generated on a Draft. NR-12: and nothing is
          generated *after* one either, so the card says so rather than listing
          five documents with an availability each. See the note where
          `documentTiles` used to be built. */}
      <Card id="rail-documents" title="Documents">
        <EmptyState
          title="No documents"
          description="This booking has no documents: it has not been created, and no document — quote, agreement, packing list, delivery note or invoice — is generated anywhere in this build yet. There is nothing to open, download or send."
        />
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

      {/* §57 — Activity Timeline last.

          ⛔ NR-20 — this card listed two events, and neither had happened:

           - `{ at: 'Just now', what: 'Draft created', who: 'by Ramesh Dulal' }`
             — a literal, and demo data at that: that name is a seed CREW roster
             member (`data/crew.ts`, CR-007, a Grip), not the person at the
             keyboard, whom this component has had all along in `useAuth()`.
             Worse than the wrong name is the event: no draft is created by this
             page. `saveDraft` dispatches an action declared
             `implemented: false`, so it rejects; the first row this screen can
             write is the Quote `confirmBooking` creates, and that navigates
             away.
           - `'Items added'` counted the lines currently on screen and stamped
             them "Just now" — a running total dressed as a past event, at an
             instant nothing occurred.

          Naming the real actor would not have fixed it: there is no event for
          an actor to have performed. A booking's history begins when the
          booking does, so this states that instead. The card is kept rather
          than dropped — `WIREFRAME_RULINGS_2026-08-12.md` §1 keeps the rail
          cards the wireframe does not draw, and the operator should find the
          same rail here as on a saved booking.

          `BookingDetail.tsx`'s own Activity Timeline says the matching thing
          for a booking that DOES exist: `booking_stage_transitions` holds the
          history and has no query module yet. */}
      <Card title="Activity Timeline">
        <EmptyState
          title="No activity yet"
          description="Nothing has happened to this booking — it has not been created. Its history starts at the moment it is confirmed, and is kept against the booking itself, not against this screen."
        />
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
          support={`${days} rental ${dayWord} · ${lines.length} items · ${crew.length} crew`}
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
            summary={client ? `${client.name} · ${days} ${dayWord}` : 'No client selected'}
          >
            {/* §7–11 — one Client row: the searchable combobox, one control in
                its trailing slot (add a client, or that client's health eye —
                never both, never neither), and Client History retained. */}
            <Field label="Client" labelId="new-rental-client-label">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                <div
                  ref={clientFieldRef}
                  /* "Focused and left" — the moment the operator passed this
                     field by without choosing anyone, and the moment the
                     refusal below stops being premature. `focusout` bubbles,
                     so this fires for the input, the list rows and the
                     trailing control alike; the containment check keeps a move
                     between them from counting as leaving. */
                  onBlur={(e) => {
                    /* Not while Add Client is open: that dialog takes focus to
                       its own first field, which is outside this wrapper, so
                       opening it would otherwise count as passing the field by
                       and raise the refusal under an untouched form. */
                    if (addClientOpen) return
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setClientFieldTouched(true)
                  }}
                  style={{ flex: '1 1 260px', minWidth: 0 }}
                >
                  {/* The client half IS live once this flips — a selected
                      client then carries `dbId`, the uuid a booking is filed
                      against. Until then the list is sample data and Confirm
                      refuses by name. */}
                  <ClientCombobox
                    clients={clientPool}
                    selectedClientId={selectedClientId}
                    onSelect={selectClient}
                    onCreateNew={openAddClient}
                    onViewAll={() => navigate('/clients')}
                    inputStyle={inputStyle}
                    labelledBy="new-rental-client-label"
                    showOutstanding={canClientBalance}
                    suppressNextFocusOpen={suppressClientListOnFocus}
                    /* Only once the operator has actually been here and moved
                       on. An untouched form does not shout — see
                       `clientFieldTouched`. */
                    {...(client || !clientFieldTouched
                      ? {}
                      : { error: 'Select a client before confirming this booking.' })}
                    /* §11 + §15 in one slot. `client && health` is the whole
                       condition: with a client there is always a verdict, so
                       there is no third state where the slot is empty. */
                    trailing={
                      client && health ? (
                        <ClientHealthEye
                          verdict={health}
                          clientName={client.name}
                          open={quickViewOpen}
                          controls="new-rental-client-quick-view"
                          onClick={() => setQuickViewOpen((o) => !o)}
                        />
                      ) : (
                        <AddClientButton onClick={openAddClient} />
                      )
                    }
                  />
                </div>
                {/* §10 — the combobox's own "Create New Client" row is still
                    there; it and the slot control open the same modal. */}
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
                : `${pickupBs ? formatBs(pickupBs) : formatAd(new Date(pickup))} → ${days} ${dayWord}`
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(0,1fr)) auto', gap: 11, alignItems: 'start' }}>
              {/* `DateTimeField` renders its own label and its own BS line, so
                  it is not wrapped in `Field` (that would double the label).
                  `lib/bs.ts` is the one Date Engine — nothing here hand-writes
                  a BS date. */}
              <DateTimeField label="Out" dateValue={pickup} timeValue={pickupTime} onDateChange={setPickup} onTimeChange={setPickupTime} />
              {/* §7 — return must be later than pickup. NR-19: "later" is
                  measured over the date AND the time, so a same-day booking is
                  a booking and this no longer tells the operator to change a
                  date that is already correct. */}
              <DateTimeField
                label="Return"
                dateValue={ret}
                timeValue={returnTime}
                onDateChange={setRet}
                onTimeChange={setReturnTime}
                error={days === 0 ? 'Return must be later than pickup. Change the return date or its time.' : undefined}
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
                answers availability for the booking's own dates (§32).

                4 Sep 2026: and it is now `inline`, so the field itself is what
                the operator sees — which is what §1.1's "search gear…" drew in
                the first place. ⌘K still lands in it. */}
            <div style={{ marginBottom: 10 }}>
              {/*
                * Law 12 — the truth about what this panel is serving, stated
                * before the operator spends time on it rather than as a refusal
                * at Confirm.
                *
                * `AddItemPanel` reads `booking/itemCatalogue.ts`, which is built
                * on five seed modules (`data/inventory`, `data/addBundle`,
                * `data/bundles`, `data/addEquipment`). Those rows have product
                * names for ids, so a line added from them cannot be saved. The
                * client half of this screen IS live; the equipment half is the
                * next slice of PLAN.md Phase 2.
                */}
              {/* Gated on `liveEquipment` — the pool the panel is ACTUALLY
                  searching — not on this screen's separate catalogue read. An
                  earlier version watched the wrong one and hid the warning
                  exactly while it was still true; the lesson is that a notice
                  about a source must read that source. */}
              {!liveEquipment && (
                <p style={{ margin: '0 0 var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--warn-text)', lineHeight: 1.5 }}>
                  This panel is still listing <strong>sample equipment</strong> — the live catalogue has not loaded, so
                  items added here cannot be saved and Confirm will say so rather than writing a booking with products
                  that do not exist.
                </p>
              )}
              {poolError && (
                <p role="alert" style={{ margin: '0 0 var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--st-danger-fg)', lineHeight: 1.5 }}>
                  The live catalogue and client list could not be read: {poolError}
                </p>
              )}

              <AddItemPanel
                /* Babin, 4 Sep 2026 — no "+ Add Item" button here: the search
                   field IS the control. Adding gear is what this section is
                   for, so a button that only reveals a search box was a click
                   in front of the job. */
                inline
                window={bookingWindow}
                {...(liveEquipment ? { equipment: liveEquipment } : {})}
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

            {bundleNotice && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '8px 10px',
                  marginBottom: 8,
                  borderRadius: 'var(--r-card)',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <p style={{ ...inlineInfoStyle, fontWeight: 600, color: 'var(--text)' }}>
                  <Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{bundleNotice.name}</span>
                </p>
                {bundleNotice.notes.map((n) => (
                  <p key={n} style={inlineInfoStyle}>
                    <span aria-hidden="true" style={{ flexShrink: 0 }}>·</span>
                    <span>{n}</span>
                  </p>
                ))}
                {/* One line per reason, models joined — the engine's reason text verbatim. */}
                {Array.from(
                  bundleNotice.skipped.reduce((m, x) => {
                    m.set(x.reason, [...(m.get(x.reason) ?? []), x.model])
                    return m
                  }, new Map<string, string[]>()),
                ).map(([reason, models]) => (
                  <p key={reason} style={inlineInfoStyle}>
                    <span aria-hidden="true" style={{ flexShrink: 0 }}>·</span>
                    <span>
                      Not added — {models.join(', ')}: {reason}
                    </span>
                  </p>
                ))}
                <div style={{ marginTop: 2 }}>
                  <Button variant="ghost" onClick={() => setBundleNotice(null)}>
                    Dismiss
                  </Button>
                </div>
              </div>
            )}

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
                          description="Search above for bundles, equipment and accessories — availability is answered for these dates."
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
          >
            <div>
              {/* Babin, 4 Sep 2026 — "same for crew and transport": no
                  `Add Member…` dropdown in the header slot, the search field is
                  the control and it sits in the section itself. */}
              {/*
                * Law 12, and the same notice Section 2 carries for its
                * equipment pool: say what the list actually is before the
                * operator spends time on it.
                *
                * `CREW_ROSTER` is an array literal in `data/crew.ts` — the
                * twelve people, their phone numbers and every `dayRatePaisa`
                * on this screen are invented there, and nothing on this page
                * reads a crew table. What Confirm *does* write is stated
                * exactly: `createRental` sends each row's name, role, phone
                * and rate to `booking_crew_lines`, with `crew_member_id` null
                * (this page has no staff id to send), and `actions/crew/
                * bookCrew.ts` — the action that would reserve a person — is a
                * stub the dispatcher refuses. So the booking gets priced crew;
                * nobody's own calendar hears about it.
                */}
              <p style={{ margin: '0 0 var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--warn-text)', lineHeight: 1.5 }}>
                This is a <strong>sample roster</strong> — the people and the day rates they are priced at are invented in
                the app, not read from the database. Adding someone puts their name, role and rate on this booking when it
                is confirmed; it does not link a staff record, and it reserves nobody, because booking a crew member's own
                calendar is not built yet.
              </p>
              <CrewSearch onBooking={crew} onAdd={addCrew} showRates={canCrewMoney} />
              <div style={{ minWidth: 0 }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                    <thead>
                      <tr style={{ background: 'var(--th-bg)' }}>
                        {(canCrewMoney ? ['Name', 'Role', 'Day Rate', 'Days', 'Amount', '', ''] : ['Name', 'Role', '']).map((h, i) => (
                          <th key={h === '' ? `blank-${i}` : h} scope="col" style={{ ...th, textAlign: i >= 2 && i <= 4 ? 'right' : 'left' }}>
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
                              {/* Off the booking, one at a time.
                                  `Clear crew` below empties the whole list, and
                                  `CrewSearch` hides anyone already added, so
                                  without this a single wrong pick — a role the
                                  database rejects, say — could be blocked but
                                  not undone. Rendered in both money bands: a
                                  money-blind operator staffs a booking too. */}
                              <td style={{ ...td, width: 30, textAlign: 'right' }}>
                                <button
                                  type="button"
                                  className="press"
                                  aria-label={`Remove ${c.name} from this booking`}
                                  title={`Remove ${c.name}`}
                                  onClick={() => removeCrew(c.crewId)}
                                  style={{ position: 'relative', width: 22, height: 22, display: 'grid', placeItems: 'center', borderRadius: 'var(--r-xs)', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
                                >
                                  <TouchInset />
                                  <Icon name="close" size={13} />
                                </button>
                              </td>
                            </tr>
                            {canCrewMoney && expanded && (
                              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <td colSpan={7} style={{ ...td, background: 'var(--card2)' }}>
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
                {/* The delivery's own facts. Shown only for a Babin Delivery,
                    which is exactly when a transport row is written — Client
                    Pickup sends none, so a vehicle typed under it would be
                    collected and dropped. Not money, so no `canBookingMoney`
                    gate: a money-blind operator still books the van. */}
                {!clientPickup && (
                  <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(0,1fr))', gap: 9, marginTop: 9 }}>
                    <Field label="Vehicle">
                      <Input
                        value={vehicle}
                        onChange={(e) => setVehicle(e.target.value)}
                        placeholder="Make and model, or the van's name"
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Number Plate">
                      <Input
                        value={numberPlate}
                        onChange={(e) => setNumberPlate(e.target.value)}
                        placeholder="e.g. BA 2 CHA 1234"
                        style={inputStyle}
                      />
                    </Field>
                    <Field label="Driver Contact">
                      <Input
                        value={driverContact}
                        onChange={(e) => setDriverContact(e.target.value)}
                        placeholder="Name and phone"
                        style={inputStyle}
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
                        max={100}
                        value={discountPct}
                        /* The old clamp-to-25 left with the gate (31 Aug 2026 —
                           D3, no gate). 0–100 is arithmetic validity, not a
                           chosen cap: negative is a price rise, >100% a
                           negative price. */
                        onChange={(e) => setDiscountPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                        style={inputStyle}
                      />
                    </Field>
                    {/* Law 12 — an arithmetic refusal (should state ever carry
                        one) surfaces inline with the engine's own words. The
                        reason/approver inputs that lived here left with the
                        gate. */}
                    {!discountVerdict.valid && (
                      <div style={{ marginTop: 9, padding: 10, borderRadius: 'var(--r-btn)', background: 'var(--st-danger-bg)' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--st-danger-fg)', lineHeight: 1.4 }}>
                          <Icon name="error" size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                          {discountVerdict.error}
                        </div>
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
              here read as a second primary and had to go.

              ⛔ NR-13 — two of the four branches claimed a save that had not
              happened, and one of them named a store that does not exist:

               - the default branch read **"All changes saved"**. `saveState`
                 *initialises* to `'saved'`, so that sentence was on screen from
                 first paint, before anything had been typed, on a page that
                 persists nothing until Confirm Booking. Nothing on this screen
                 writes a draft: `saveDraft` dispatches
                 `actions/rentals/saveDraft.ts`, which declares
                 `implemented: false`, and `createAction` fails closed on that
                 flag (`actions/core.ts`), so the dispatch rejects today.

                 Two code paths set `'saved'` after an attempt, not one:
                 `saveDraft`'s `.then()` and `confirmBooking`'s success path.
                 Neither can leave this sentence standing on an unsaved booking
                 TODAY — the first is unreachable while the stub rejects, and
                 the second navigates to `/rentals` and unmounts this line. But
                 the first becomes reachable the moment `saveDraft` is
                 implemented (NR-15), and at that point this branch must say
                 something different again. Written down because the previous
                 version of this note said `confirmBooking` was the only path
                 and would have made that change look unnecessary.
               - the `!online` branch read **"Offline · Changes saved locally"**.
                 There is no local store: this file contains no `localStorage`,
                 no `sessionStorage` and no IndexedDB write of any kind, and the
                 booking lives entirely in React state in this tab.

              So the default now states the true position — unsaved, tab-local —
              and the offline case adds what offline actually changes here:
              `createRental.execute` refuses outright when
              `ctx.isOnline === false || navigator.onLine === false`, because a
              create is one RPC and the outbox (`lib/dataAccess.ts`'s
              `enqueueMutation`) queues table inserts and updates, nothing else.

              `saving` and `error` are unchanged; both are genuinely reachable
              (Save Draft rejects into `error`, and `confirmBooking` sets both). */}
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
            ) : (
              /* Never colour alone — the words carry it, the glyph decorates. */
              <>
                <Icon name={online ? 'info' : 'plug'} size={13} style={{ color: 'var(--text2)' }} />
                <span style={{ lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text2)' }}>Not saved</span> — this
                  booking exists only in this browser tab. It is written when you confirm it.
                  {!online && ' You are offline, and confirming a booking is refused until you are back online.'}
                </span>
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

        `WIREFRAME_RULINGS_2026-08-12.md` §7 — "Right rails collapse below 1280"
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
        no room for a notice. So below 1280 the notices card **detaches from the
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
            <Button icon="check" variant="primary" onClick={confirmBooking} disabled={confirmBlocked || saveState === 'saving'}>
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
        onClose={closeAddClient}
        onCreated={onClientCreated}
        /* NR-16 — the LIVE pool, the same one `ClientCombobox` above reads and
           the same one `client` is resolved from. The prop's own doc explains
           why it is filtered to `dbId`-confirmed rows inside the modal; what it
           cannot do is filter a pool it was never handed. Dropping the old
           `= CLIENTS_DATA` default without wiring this line left the check
           running over `[]` — no false positives from seed rows, and no true
           positives either. */
        clients={clientPool}
        /* The modal closes itself after this fires — do not close it here too. */
        onUseExisting={(c) => {
          setSelectedClientId(c.id)
          setGovId(c.pan ?? '')
        }}
      />

      {/* redesign v1 §5 — draft-only. Fired from the Send Quote split button.
          (The rail Documents tiles that also raised it are gone — NR-12.) The
          modal's send control is Unavailable with a named reason (no email
          backend exists in this build), so this call site no longer answers a
          send that cannot happen — the "Email queued" toast it used to fire
          here was a success for a write that never landed.

          ⛔ NR-12, the serious half — the prefilled body read "Please find the
          {document} for your booking attached." No document is attached and
          none can be: nothing in this build generates one (see the note where
          `documentTiles` was built), and this modal has no attachment control
          at all — `DraftEmailModal`'s props are to / subject / body. An
          operator who copied that draft into their own mail client would have
          told a client to look for an attachment that does not exist. The body
          now says what is true, and says it in brackets so it reads as a note
          to the operator rather than a sentence to leave in. */}
      <DraftEmailModal
        isOpen={emailDraftDoc !== null}
        onClose={() => setEmailDraftDoc(null)}
        documentName={emailDraftDoc ?? ''}
        toEmail={client?.email ?? ''}
        subject={`${emailDraftDoc ?? 'Document'} — ${client?.name ?? 'New Rental'}`}
        body={
          `Dear ${client?.name ?? 'Client'},\n\n` +
          `This is about the ${emailDraftDoc ?? 'document'} for your booking with Babin Rentals.\n\n` +
          `[Nothing is attached to this draft — ${emailDraftDoc ?? 'document'} documents are not generated by this system yet. ` +
          `Write the details in below, or attach your own copy, and delete this note.]\n\n` +
          `Regards,\nBabin Rentals`
        }
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
