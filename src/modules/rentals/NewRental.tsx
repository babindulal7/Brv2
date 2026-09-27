import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation, Link, useSearchParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { ConfirmDialog, Input, Select, Modal, PageActions } from '../../components/ui'
import { DataTableShell } from '../../components/ui/DataTable'
import { Card, PageHeader, Rail, FooterNote, cardStyle } from '../../components/ui/Page'
import { Button } from '../../components/ui/Button'
import { PageShell } from '../../components/ui/PageShell'
import { BAR_BOX } from '../../components/shell/BottomBar'
import './rentals.css'
import './new-rental-flow.css'
import { EmptyState, LoadingSkeleton } from '../../components/ui/StateViews'
import { ScannerInput } from '../../components/ui/ScannerInput'
import { useToast } from '../../components/ui/Toast'
import { useViewport } from '../../lib/device'
import { useNetwork } from '../../lib/network'
import { STATUS } from '../../lib/status'
import { statusToken } from '../../lib/workflow'
import type { BookingStatus } from '../../lib/workflow'
import { toBs, formatBs, formatAd, getBusinessToday } from '../../lib/bs'
import { NPT_OFFSET_STRING } from '../../lib/operationalDay'
import { rentalDaysBetween } from '../../lib/rentalDays'
import { validateDiscount } from '../../lib/discount'
import { getSetting } from '../../lib/settingsStore'
import {
  calculatePricingPipeline,
  type PricingPipelineResult,
  DISCOUNT_STACKING_CAP_PERCENT,
  PROMO_CODES,
} from '../../lib/pricingPipeline'
import { formatMoney, rupees, roundHalfUp, toRupees } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import { listClientRecords, type ClientRecord } from '../../lib/queries/clients'
import { updateClient } from '../../actions/clients/updateClient'
import { CREW_ROLES, createRental, deliveryTypeFromLabel, type BookingLineType } from '../../actions/rentals/createRental'
import {
  cancelDraft,
  convertDraft,
  fetchRentalDraft,
  saveDraft as persistRentalDraft,
  type RentalDraftData,
} from '../../actions/rentals/saveDraft'
import type { CrewRoleDb } from '../../types/database'
import { supabase, newClientUuid } from '../../lib/supabase'
import { listInventory, INV_STYLE, type InvStatus } from '../../lib/queries/inventory'
import { readProductAvailability } from '../../lib/queries/productAvailability'
import { listBundleRecords } from '../../lib/queries/bundleRecords'
import type { BundleRecord } from '../../data/bundles'
import { planCreationUnits, type CreationUnitPlan } from '../../lib/queries/availability'
import type { RentalWindow } from '../../lib/availability'
import { bundleResults, equipmentConflicts, equipmentLineDraft, equipmentResultsFrom, type ConflictCheckLine } from './booking/itemCatalogue'
import type {
  AvailabilityVerdict,
  EquipmentAvailabilitySource,
  LiveEquipmentRow,
} from './booking/itemCatalogue'
import { listCrewMembers, CREW_ROSTER, searchRoster, type CrewMember, type CrewRole } from '../../lib/queries/crew'
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

/** JSONB does not preserve object-key order. Canonicalise before dirty checks. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

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
  if (!date || !time) return null
  let isoTime = time.trim()
  if (!/[Z+-]/.test(isoTime)) {
    if (isoTime.length === 5) isoTime = `${isoTime}:00`
    isoTime = `${isoTime}${NPT_OFFSET_STRING}`
  }
  const d = new Date(`${date}T${isoTime}`)
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

interface DiscountPresetMeta {
  readonly pct: number
  readonly label: string
  readonly reason?: string
}

const DISCOUNT_PRESETS: readonly DiscountPresetMeta[] = [
  { pct: 0, label: '0%' },
  { pct: 5, label: '5% (Repeat)', reason: 'Repeat Client Loyalty' },
  { pct: 10, label: '10% (Partner)', reason: 'Production Partner Discount' },
  { pct: 15, label: '15% (Weekly)', reason: 'Long-term / Weekly Production' },
  { pct: 20, label: '20% (Festival)', reason: 'Dashain / Festival Production Privilege' },
  { pct: 25, label: '25% (Promo)', reason: 'Promotional / Sponsorship Booking' },
] as const

const SHOOT_PRESETS = [
  { id: '1-day', label: '1-Day Shoot', icon: 'timer' as const, description: 'Single-day shoot (07:00 → 20:00, 1 rental day)' },
  { id: 'weekend', label: 'Weekend (Fri–Mon)', icon: 'calendar_week' as const, description: 'Weekend shoot (Friday 14:00 → Monday 10:00, 3 rental days)' },
  { id: '3-day', label: '3-Day Commercial', icon: 'video' as const, description: '3-day commercial shoot (08:00 → Day 3 20:00, 3 rental days)' },
  { id: '1-week', label: '1-Week Production', icon: 'calendar_event' as const, description: '7-day production block (08:00 → Day 7 20:00, 7 rental days)' },
] as const

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
  clientUuid?: string | undefined
  parentClientUuid?: string | null | undefined
  /** Inventory lines omit this legacy-safe default; custom work is explicit. */
  lineType?: 'Equipment' | 'Bundle' | 'Accessory' | 'Service' | 'Sub-rental' | 'Manual item' | undefined
  isIncluded?: boolean | undefined
  productId?: string | null | undefined
  bundleId?: string | null | undefined
  bundleCode?: string | undefined
  bundleName?: string | undefined
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
  /**
   * The physical unit's own `inventory_state` - **absent for a live line**.
   *
   * NR-09: a live catalogue row is a PRODUCT and `products` carries no
   * `inventory_state`, so a value here was fabricated from a count of where
   * that product's units sat at that instant. Nothing gates on this any more;
   * availability for the booking's window is `conflictSummary` below.
   * `booking/itemCatalogue.ts`'s `BookingLineDraft.status` is the same field
   * and carries the longer note.
   */
  status?: InvStatus | undefined
  committedTo: string
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
  /** AUD-026: Whether the selected client is flagged as Blocked or On-Stop. */
  clientIsBlocked?: boolean
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
  if (s.clientIsBlocked) {
    out.push({
      text: 'This client is flagged as Blocked from equipment rentals. Quotation or confirmation is restricted without manager override.',
      action: 'View Client',
    })
  }
  if (s.lineCount === 0) {
    out.push({
      text: 'Add at least one equipment item before confirming.',
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
  'Rental period',
  'Equipment, Bundles & Services',
  'Crew',
  'Delivery',
  'Pricing & Terms',
] as const


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
function NumberStepper({ value, min = 1, onChange, disabled, label }: { value: number; min?: number; onChange: (n: number) => void; disabled?: boolean; label: string }) {
  const isMin = value <= min
  return (
    <div className="new-rental-stepper-pill">
      <button
        type="button"
        className="press new-rental-stepper-btn"
        aria-label={`Decrease ${label}`}
        disabled={disabled || isMin}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <TouchInset />
        <Icon name="minus" size={11} />
      </button>
      <span className="figure new-rental-stepper-val" style={{ color: disabled ? 'var(--muted)' : 'var(--text)' }}>
        {value}
      </span>
      <button
        type="button"
        className="press new-rental-stepper-btn"
        aria-label={`Increase ${label}`}
        disabled={disabled}
        onClick={() => onChange(value + 1)}
      >
        <TouchInset />
        <Icon name="plus" size={11} />
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
  badge,
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
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id} className={`new-rental-section-card ${open ? 'is-active' : ''}`} style={{ ...cardStyle, minWidth: 0, padding: 0 }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          background: 'var(--surface)',
          cursor: 'pointer',
          userSelect: 'none',
          minHeight: 48,
          transition: 'background var(--dur-fast) var(--ease)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
          {title}
        </h2>
        {badge}
        {!open && summary && (
          <span
            style={{
              fontSize: 'var(--t-meta)',
              color: 'var(--text2)',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              background: 'var(--surface)',
              padding: '2px 8px',
              borderRadius: 'var(--r-xs)',
              marginLeft: 4,
              border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
            }}
          >
            {summary}
          </span>
        )}
        {/* §6 — toolbars hide when the section is collapsed. */}
        {open && action && (
          <span
            onClick={(e) => e.stopPropagation()}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
          >
            {action}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
          className="press"
          style={{
            marginLeft: open && action ? 6 : 'auto',
            position: 'relative',
            width: 34,
            height: 34,
            borderRadius: 'var(--r-btn)',
            border: 'none',
            background: 'var(--surface)',
            color: 'var(--muted)',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <TouchInset />
          <Icon name={open ? 'chevron_up' : 'chevron_down'} size={15} />
        </button>
      </div>
      <div hidden={!open} style={{ padding: 'var(--sp-md) var(--sp-lg)' }}>{children}</div>
    </section>
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
  onSelectPreset,
}: {
  percent: number
  onPercent: (n: number) => void
  amount: string
  onSelectPreset?: (pct: number, reason?: string) => void
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
        {DISCOUNT_PRESETS.map((p) => {
          const active = percent === p.pct
          return (
            <button
              key={p.pct}
              type="button"
              className="press"
              aria-pressed={active}
              aria-label={`${p.pct}% discount`}
              title={p.reason ? `${p.label} — ${p.reason}` : `${p.pct}% discount`}
              onClick={() => {
                onPercent(p.pct)
                onSelectPreset?.(p.pct, p.reason)
              }}
              style={{
                position: 'relative',
                minHeight: 24,
                padding: '0 9px',
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
              {p.label}
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
  roster = CREW_ROSTER,
}: {
  /** Who is already on the booking. Excluded from the list — nobody is added twice. */
  onBooking: readonly CrewLine[]
  onAdd: (crewId: string) => void
  /** The page's `canCrewMoney`. A money-blind role sees the roster and never a rate. */
  showRates: boolean
  roster?: readonly CrewMember[]
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
  const [open, setOpen] = useState(false)
  const [cursorMoved, setCursorMoved] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const excludeIds = useMemo(() => onBooking.map((c) => c.crewId), [onBooking])
  const options = useMemo(() => searchRoster(query, excludeIds, roster), [query, excludeIds, roster])
  /**
   * Whether anyone is left to find at all, which is a different question from
   * whether this query found someone. The empty state used to answer only the
   * second: with the whole roster already on the booking, typing anything at
   * all said "No one matches …", which is true and beside the point — there
   * was nobody to match. An empty query returns the whole remaining roster, so
   * this is that count.
   */
  const rosterExhausted = useMemo(() => searchRoster('', excludeIds, roster).length === 0, [excludeIds, roster])

  // Clamp the cursor whenever the result set shrinks under it.
  useEffect(() => {
    setActiveIndex((i) => (i >= options.length ? 0 : i))
  }, [options.length])

  const activeId = open && options[activeIndex] ? `${listboxId}-opt-${activeIndex}` : undefined

  useEffect(() => {
    if (!open || !cursorMoved || !activeId) return
    document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [open, cursorMoved, activeId])

  /** Close on outside pointer interaction */
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const commit = (m: CrewMember) => {
    onAdd(m.id)
    setQuery('')
    setActiveIndex(0)
    setOpen(false)
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const count = options.length
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault()
        if (!open) {
          setOpen(true)
          return
        }
        setCursorMoved(true)
        setActiveIndex((i) => (count === 0 ? 0 : e.key === 'ArrowDown' ? (i + 1) % count : (i - 1 + count) % count))
        return
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
        e.preventDefault()
        commit(m)
        return
      }
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
        if (query !== '') {
          setQuery('')
          setActiveIndex(0)
        }
        setCursorMoved(false)
        inputRef.current?.blur()
        return
      default:
    }
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', marginBottom: 'var(--sp-md)' }}>
      <Field label="Add crew" labelId={labelId}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              autoComplete="off"
              spellCheck={false}
              aria-expanded={open}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-labelledby={labelId}
              aria-describedby={hintId}
              {...(activeId ? { 'aria-activedescendant': activeId } : {})}
              placeholder="Search the roster by name or role…"
              value={query}
              onFocus={() => setOpen(true)}
              onClick={() => setOpen(true)}
              onChange={(e) => {
                setQuery(e.target.value)
                setActiveIndex(0)
                if (!open) setOpen(true)
              }}
              onKeyDown={onKeyDown}
              style={{ ...inputStyle, paddingLeft: 32, paddingRight: query ? 32 : 10 }}
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
            {query && (
              <button
                type="button"
                className="press"
                aria-label="Clear search query"
                onClick={() => {
                  setQuery('')
                  setActiveIndex(0)
                  inputRef.current?.focus()
                }}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 4,
                }}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

          <button
            type="button"
            className="press"
            onClick={() => {
              setOpen((o) => {
                const next = !o
                if (next) globalThis.requestAnimationFrame(() => inputRef.current?.focus())
                else inputRef.current?.blur()
                return next
              })
            }}
            aria-expanded={open}
            aria-label={open ? 'Hide crew roster' : 'Browse crew roster'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 38,
              padding: '0 14px',
              borderRadius: 'var(--r-btn)',
              background: open ? 'var(--st-primary-bg)' : 'var(--btn-secondary-bg)',
              color: open ? 'var(--st-primary-fg)' : 'var(--text)',
              border: `1px solid ${open ? 'var(--primary)' : 'var(--btn-secondary-border)'}`,
              fontFamily: 'inherit',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <span>{open ? 'Hide' : 'Browse'}</span>
            <Icon name={open ? 'chevron_up' : 'chevron_down'} size={15} />
          </button>
        </div>
      </Field>

      {open && (
        <div
          role="dialog"
          aria-label="Crew roster search results"
          style={{
            position: 'absolute',
            zIndex: 35,
            top: 'calc(100% + 4px)',
            left: 0,
            width: '100%',
            maxHeight: 260,
            overflowY: 'auto',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-card)',
            background: 'var(--dropdown)',
            boxShadow: 'var(--shadow-modal)',
          }}
        >
          <p id={hintId} style={{ margin: '8px 10px 4px', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            Up and Down to move, Enter to add, Escape to close. Anyone already on this booking is left out of the list.
          </p>

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
                  aria-label={`${m.name}, ${m.role}.${
                    showRates ? ` ${formatMoney(m.dayRatePaisa)} per day.` : ''
                  }${note ? ` ${note}` : ''} Press Enter to add to this booking.`}
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
      )}
    </div>
  )
}

export interface NewRentalProps {
  embedded?: boolean
  onDone?: () => void
}

export default function NewRental({ embedded = false, onDone }: NewRentalProps = {}) {
  const navigate = useNavigate()
  const doExit = useCallback(() => {
    if (onDone) {
      onDone()
    } else {
      navigate('/rentals')
    }
  }, [onDone, navigate])
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

  /**
   * Desktop can work in any section; phones use focused workflow groups.
   *
   * Desktop and tablet open Client · Dates · Equipment · Pricing and leave
   * Crew and Delivery collapsed, which is exactly what 01_NEW_RENTAL §1.1
   * draws ("＋ Crew (collapsed)", "＋ Delivery (collapsed → Client Pickup
   * Rs 0)"). Phone is an accordion with **one open at a time**, per the same
   * spec's phone block; Client is the first section in the guided workflow.
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
  const [open, setOpen] = useState<boolean[]>([true, true, true, false, false, true])
  const toggle = (i: number) =>
    setOpen((p) => p.map((v, j) => (j === i ? !v : v)))

  // Section shortcuts still use these anchors; the booking itself is one page.
  const [currentStep, setCurrentStep] = useState<number>(1)
  const workflowRef = useRef<HTMLDivElement>(null)
  const previousStep = useRef(currentStep)
  useEffect(() => {
    const indices = currentStep === 1 ? [0, 1] : currentStep === 2 ? [2] : currentStep === 3 ? [5] : []
    if (indices.length) {
      setOpen((previous) => previous.map((value, index) => indices.includes(index) || value))
    }
    if (previousStep.current !== currentStep) {
      const targetId = currentStep === 1 ? 'section-0' : currentStep === 2 ? 'section-2' : currentStep === 3 ? 'section-5' : 'rail-booking-summary'
      document.getElementById(targetId)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      previousStep.current = currentStep
    }
  }, [currentStep])


  // Return Pickup Logistics (§3.3)
  const [returnPickupType, setReturnPickupType] = useState<'Client Return' | 'Babin Pickup'>('Client Return')
  const [returnPickupAddress, setReturnPickupAddress] = useState('')
  const [returnPickupTime, setReturnPickupTime] = useState('18:00')
  const [returnPickupChargePaisa, setReturnPickupChargePaisa] = useState<number>(0)

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
  const [clientPool, setClientPool] = useState<ClientRecord[]>([])
  const [clientsAreLive, setClientsAreLive] = useState(false)
  /**
   * The live products, straight off `listInventory`. Their ids are
   * `products.id` uuids, which is the whole point. `null` until the read lands,
   * and the panel falls back to the seed catalogue in the meantime.
   *
   * There was briefly a second `catalogue` state here holding the same rows in
   * `CatalogueItem` shape. It was redundant the moment the panel took a real
   * pool, and two states describing one read is how they drift apart.
   */
  const [liveRows, setLiveRows] = useState<readonly LiveEquipmentRow[] | null>(null)
  const [liveCrew, setLiveCrew] = useState<readonly CrewMember[] | null>(null)
  const [liveBundles, setLiveBundles] = useState<readonly BundleRecord[] | null>(null)
  /*
   * Has the catalogue read FINISHED, whatever it found?
   *
   * `liveRows` cannot answer that: it stays `null` both before the read lands
   * and after a read that returned no active products, because `null` is also
   * the signal that puts the seed catalogue on screen. Without this flag the
   * availability effect below read that second case as "still loading" and
   * pinned the strip at "Checking availability for these dates…" for the life
   * of the page — a check that was not running, reported as in flight, under a
   * panel already saying the sample catalogue is not checked at all.
   */
  const [poolSettled, setPoolSettled] = useState(false)
  /** Why the live read failed, if it did. Law 12 — stated, never swallowed. */
  const [poolError, setPoolError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [clients, inventory, crewResult] = await Promise.all([
          listClientRecords(),
          /* `withMoney` decides whether `dailyRate` comes back AT ALL (Law 6),
             so it is the gate this screen already computed — never a literal.
             A money-blind operator still picks equipment; they just do not see
             the rate, which is why the filter below cannot require one. */
          listInventory({ page: { index: 0, size: 500 }, withMoney: canBookingMoney }),
          listCrewMembers(),
        ])
        if (cancelled) return
        /* Only rows carrying a real uuid are bookable. A client without `dbId`
           came from the seed array and must not silently look selectable. */
        const bookableClients = clients.filter((c) => !!c.dbId)
        setClientPool(bookableClients)
        setClientsAreLive(true)
        /* Active products only. NOT filtered on a rate: `dailyRate` is null for
           every row when `withMoney` is false, so requiring one would hand a
           money-blind operator an empty catalogue — a Law 6 gate turning into a
           missing feature. The rate defaults to zero for display; pricing is
           the engine's, not this screen's. */
        const rows = inventory.rows.filter((r) => r.isActive)
        /* The ROWS, not the catalogue results. The results carry an
           availability verdict that depends on the booking's window, and the
           window changes long after this read lands — so they are derived
           below, where both inputs are in scope, instead of frozen here. */
        if (rows.length > 0) setLiveRows(rows)

        if (crewResult && crewResult.rows && crewResult.rows.length > 0) {
          setLiveCrew(crewResult.rows)
        }
      } catch (e: unknown) {
        if (!cancelled) setPoolError(e instanceof Error ? e.message : String(e))
      } finally {
        /* Settled means ANSWERED, not answered well: a read that returned
           nothing has still finished, and the strip must stop claiming to be
           checking. Set on the failure path too — `poolError` drives its own
           branch, and leaving this false there would strand the flag. */
        if (!cancelled) setPoolSettled(true)
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
  const location = useLocation()
  const quoteBridge = (location.state as { quote?: { lines?: Array<{ label: string; qty: number; days: number; ratePaisa: number }>; discountPct?: number } } | null)?.quote
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    () => searchParams.get('clientId') || searchParams.get('client') || null,
  )
  const client: ClientRecord | undefined = useMemo(
    () => clientPool.find((c) => c.id === selectedClientId || (c.dbId && c.dbId === selectedClientId)),
    [clientPool, selectedClientId],
  )

  /* Connect URL client parameter to selection as soon as client pool loads */
  useEffect(() => {
    const rawParam = searchParams.get('clientId') || searchParams.get('client')
    if (!rawParam) return
    const match = clientPool.find((c) => c.id === rawParam || (c.dbId && c.dbId === rawParam))
    if (match) {
      if (selectedClientId !== match.id) {
        setSelectedClientId(match.id)
      }
      if (match.pan) {
        setGovId(match.pan)
      }
    }
  }, [clientPool, searchParams, selectedClientId])

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
   * **The draft preserves this field, but a confirmed booking still has no
   * dedicated column for it.** `govId` is therefore recoverable from the
   * retained converted draft, while the booking write cannot project it into
   * `bookings`. It also gates Confirm. Its UI readers are the
   * "Missing client ID or PAN" Critical, the Review card's Client row, the
   * input itself and its inline error. `CreateRentalInput` has no field for it,
   * so the converted draft remains its durable booking-time record.
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
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')
  /* Dates default to query parameters if present, otherwise the business day
     (Kathmandu's, `getBusinessToday`) and the day after — a one-day window. */
  const [pickup, setPickup] = useState(() => (fromParam && !Number.isNaN(Date.parse(fromParam)) ? fromParam : getBusinessToday().toISOString().slice(0, 10)))
  const [ret, setRet] = useState(() => (toParam && !Number.isNaN(Date.parse(toParam)) ? toParam : new Date(getBusinessToday().getTime() + DAY).toISOString().slice(0, 10)))
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
   * lock's own wording. The `<option>` carries no explicit `value`, so its text
   * is the value. The durable draft stores that label and `createRental` maps it to the
   * database enum during conversion.
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
  const [lines, setLines] = useState<Line[]>(() => {
    if (quoteBridge?.lines && quoteBridge.lines.length > 0) {
      return quoteBridge.lines.map((ql, idx) => ({
        id: `quote-${idx + 1}-${Date.now()}`,
        name: ql.label || 'Quoted Item',
        serial: '',
        category: 'Equipment',
        lineType: 'Manual item',
        qty: Math.max(1, ql.qty || 1),
        days: Math.max(1, ql.days || 1),
        daysOverridden: true,
        ratePaisa: (ql.ratePaisa || 0) as Paisa,
        discountPct: 0,
        location: 'Main Warehouse',
        committedTo: '—',
      }))
    }
    return []
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
  /* The creation contract has always carried these booking-level facts. Keep
     them with dispatch instead of burying a delivery destination in a note. */
  const [pickupLocation, setPickupLocation] = useState('')
  const [returnLocation, setReturnLocation] = useState('')
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [customLineOpen, setCustomLineOpen] = useState(false)
  const [customLineType, setCustomLineType] = useState<'Service' | 'Manual item'>('Service')
  const [customLineName, setCustomLineName] = useState('')
  const [customLineRate, setCustomLineRate] = useState('')
  const [customLineQty, setCustomLineQty] = useState(1)
  const [customLineError, setCustomLineError] = useState<string | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanNotice, setScanNotice] = useState<{ tone: 'success' | 'warning' | 'danger'; text: string } | null>(null)
  /* 0, not the worked example's 7 — a discount is something someone grants. */
  const [discountPct, setDiscountPct] = useState(() => quoteBridge?.discountPct ?? 0)
  /* `discountReason` / `approver` / `discountPopoverOpen` left with the
     discount gate (31 Aug 2026 — D3, Babin: "don't put any gate on discount"). */
  /**
   * The VAT rate, read from Settings ▸ Financial once per mount. The literal
   * `VAT_PCT = 13` this page used to carry is deleted — see `readVatRatePercent`.
   */
  const [vatRatePercent, setVatRatePercent] = useState<number>(readVatRatePercent)
  /** 01_NEW_RENTAL §1.1 rail — `VAT {rate}%  [on ▢]`. On is the default. */
  const [vatOn, setVatOn] = useState(true)
  const [advancePaisa, setAdvancePaisa] = useState<Paisa>(rupees(0) as Paisa)
  const [womenDopEligible, setWomenDopEligible] = useState(false)
  const [manualDiscountReason, setManualDiscountReason] = useState('')
  const [manualDiscountAuthorizedBy, setManualDiscountAuthorizedBy] = useState('')
  const [promoCodeInput, setPromoCodeInput] = useState('')
  const [promoCodeApplied, setPromoCodeApplied] = useState<string | null>(null)
  const [promoNotice, setPromoNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  const [manualDepositOverride, setManualDepositOverride] = useState(false)
  const [manualDepositAmount, setManualDepositAmount] = useState<string>('')
  const [depositOverrideReason, setDepositOverrideReason] = useState('')
  const [depositAuthorizedBy, setDepositAuthorizedBy] = useState('')

  const [confirmedSuccess, setConfirmedSuccess] = useState<{ bookingId: string; bookingNo: string } | null>(null)

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

  /* ── NR-09 · availability for THESE DATES, through the real engine ────────
   *
   * ⛔ The catalogue used to answer "is this free at this instant" from
   * `unitsByState`, and this page raised a **Critical** from the status it
   * fabricated out of that count — so a booking three weeks out was refused
   * because a camera was on someone else's shoot today. The engine that can
   * answer the real question already existed and is what the Bundles pane uses
   * (`queries/bundleRecords.ts`); `queries/productAvailability.ts` is its
   * equipment sibling, same rules, same half-open bounds.
   *
   * The read is asynchronous and the window moves under it, so the state is
   * modelled with an explicit "no answer" rather than a `Map | null` — an empty
   * map is indistinguishable from "nothing is free", which is precisely the
   * BD-02 / NR-13 defect of drawing a pending read as a settled fact.
   */
  const [availabilitySource, setAvailabilitySource] = useState<EquipmentAvailabilitySource>({
    state: 'checking',
  })

  useEffect(() => {
    /* An invalid window is not a failed read — there is simply nothing to ask.
       `bookingDays` answers 0 for exactly this case and drives its own notice. */
    if (!pickupAt || !returnAt || returnAt.getTime() <= pickupAt.getTime()) {
      setAvailabilitySource({ state: 'no-window' })
      return
    }
    if (poolError !== null) {
      setAvailabilitySource({ state: 'failed', reason: poolError })
      return
    }
    if (liveRows === null) {
      /* The read has finished and produced no live catalogue, so the SEED rows
         are what render. There is nothing in flight and nothing failed — the
         honest answer is a landed read that knows nothing about these products,
         which is what an empty map says: every row falls to the
         `answer === undefined` branch and reads "Not checked", agreeing with
         the sample-catalogue notice above it instead of spinning under it. */
      setAvailabilitySource(poolSettled ? { state: 'ready', byProduct: new Map() } : { state: 'checking' })
      return
    }

    let cancelled = false
    setAvailabilitySource({ state: 'checking' })
    /* Law 7 — the same two instants `days` and the write payload are measured
       over, handed across as AD/UTC ISO strings carrying their offset. */
    const window: RentalWindow = { fromAd: pickupAt.toISOString(), toAd: returnAt.toISOString() }
    void (async () => {
      try {
        const [byProduct, bundles] = await Promise.all([
          readProductAvailability(window, liveRows.map((r) => r.id)),
          listBundleRecords(window, { withMoney: canBookingMoney }),
        ])
        if (!cancelled) {
          setAvailabilitySource({ state: 'ready', byProduct })
          if (bundles && bundles.length > 0) setLiveBundles(bundles)
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setAvailabilitySource({ state: 'failed', reason: e instanceof Error ? e.message : String(e) })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [liveRows, pickupAt, returnAt, poolError, poolSettled, canBookingMoney])

  /**
   * The pool `AddItemPanel` searches — rebuilt whenever the rows OR the
   * windowed answer change, so a verdict on screen is never one measured
   * against a window the operator has since moved.
   */
  const liveEquipment = useMemo(
    () => (liveRows === null ? null : equipmentResultsFrom(liveRows, availabilitySource)),
    [liveRows, availabilitySource],
  )

  const liveBundleResults = useMemo(
    () => bundleResults(bookingWindow, liveBundles ?? undefined),
    [bookingWindow, liveBundles],
  )

  /* ── §10.1 canonical calculation order — via calculatePricingPipeline (Task 6) ── */
  const standaloneEquipmentLines = useMemo(
    () => lines.filter((l) => (l.lineType === undefined || l.lineType === 'Equipment') && !l.isIncluded),
    [lines],
  )
  const equipmentLines = standaloneEquipmentLines

  const bundleLines = useMemo(
    () => lines.filter((l) => l.lineType === 'Bundle'),
    [lines],
  )

  const equipmentPaisa = useMemo(
    () => standaloneEquipmentLines.reduce((s, l) => s + lineAmountPaisa(l), 0) as Paisa,
    [standaloneEquipmentLines],
  )
  const bundlePaisa = useMemo(
    () => bundleLines.reduce((s, l) => s + lineAmountPaisa(l), 0) as Paisa,
    [bundleLines],
  )
  const servicePaisa = useMemo(
    () => lines.filter((l) => l.lineType === 'Service' || l.lineType === 'Manual item').reduce((s, l) => s + lineAmountPaisa(l), 0) as Paisa,
    [lines],
  )
  const crewChargesPaisa = useMemo(
    () => crew.reduce((s, c) => s + c.dayRatePaisa * days + c.overtimePaisa + c.accommodationPaisa + c.mealsPaisa, 0) as Paisa,
    [crew, days],
  )
  // §9.2 — Client Pickup forces both transport charges to zero.
  const clientPickup = deliveryType === 'Client Pickup'
  const outgoingTransportPaisa = clientPickup ? 0 : deliveryChargePaisa + fuelChargePaisa
  const returnTransportPaisa = returnPickupType === 'Client Return' ? 0 : returnPickupChargePaisa
  const transportPaisa = (outgoingTransportPaisa + returnTransportPaisa) as Paisa

  const isStudentBundle = useMemo(
    () => lines.some((l) => l.bundleName?.toLowerCase().includes('student') || l.category?.toLowerCase().includes('student') || l.category?.toLowerCase().includes('college')),
    [lines],
  )

  const recommendedDepositPaisa = useMemo<Paisa>(() => {
    const totalGear = equipmentPaisa + bundlePaisa
    if (totalGear <= 0) return 0 as Paisa
    return Math.max(500000, Math.round(totalGear)) as Paisa
  }, [equipmentPaisa, bundlePaisa])

  const manualDepositPaisa = useMemo<Paisa | null>(() => {
    if (!manualDepositOverride) return null
    const num = Number(manualDepositAmount)
    return Number.isFinite(num) && num >= 0 ? (rupees(num) as Paisa) : null
  }, [manualDepositOverride, manualDepositAmount])

  const pricing = useMemo<PricingPipelineResult>(() => {
    const promoCodeKey = promoCodeApplied ? String(promoCodeApplied).toUpperCase() : null
    const promo = promoCodeKey ? (PROMO_CODES[promoCodeKey] ?? null) : null
    return calculatePricingPipeline({
      equipmentSubtotalPaisa: equipmentPaisa,
      bundleSubtotalPaisa: bundlePaisa,
      servicesSubtotalPaisa: servicePaisa,
      crewSubtotalPaisa: crewChargesPaisa,
      deliveryChargePaisa: ((clientPickup ? 0 : deliveryChargePaisa) + returnTransportPaisa) as Paisa,
      fuelChargePaisa: clientPickup ? (0 as Paisa) : fuelChargePaisa,
      discounts: {
        manualDiscountPercent: discountPct,
        manualDiscountReason: manualDiscountReason.trim() || null,
        manualDiscountAuthorizedBy: manualDiscountAuthorizedBy.trim() || null,
        womenDopEligible,
        promoCode: promo,
        isStudentBundle,
      },
      vatEnabled: vatOn,
      vatRatePercent,
      recommendedDepositPaisa,
      manualDepositOverridePaisa: manualDepositPaisa,
      depositOverrideReason: manualDepositOverride ? depositOverrideReason.trim() || null : null,
      depositAuthorizedBy: manualDepositOverride ? depositAuthorizedBy.trim() || null : null,
      bookingDateAd: pickupAt?.toISOString(),
    })
  }, [
    equipmentPaisa,
    bundlePaisa,
    servicePaisa,
    crewChargesPaisa,
    clientPickup,
    deliveryChargePaisa,
    fuelChargePaisa,
    returnTransportPaisa,
    discountPct,
    manualDiscountReason,
    manualDiscountAuthorizedBy,
    womenDopEligible,
    promoCodeApplied,
    isStudentBundle,
    vatOn,
    vatRatePercent,
    recommendedDepositPaisa,
    manualDepositOverride,
    manualDepositPaisa,
    depositOverrideReason,
    depositAuthorizedBy,
    pickupAt,
  ])

  const breakdown = useMemo(() => ({
    equipment: pricing.equipmentSubtotalPaisa,
    crew: pricing.crewSubtotalPaisa,
    transport: pricing.deliverySubtotalPaisa,
    subtotal: pricing.grossSubtotalPaisa,
    discount: pricing.discounts.discountPaisa,
    taxable: pricing.taxableSubtotalPaisa,
    vat: pricing.vatPaisa,
    rentalTotal: pricing.rentalTotalPaisa,
    outstanding: pricing.rentalTotalPaisa,
  }), [pricing])

  const depositRequiredPaisa = pricing.securityDeposit.requiredPaisa
  const depositReceivedPaisa = rupees(0) as Paisa
  const depositPendingPaisa = depositRequiredPaisa

  /* ── §12 alerts. Critical blocks Confirm; Warning blocks Handover. ─────── */
  /**
   * §03 / §8.5 — a real conflict, for the booking's own dates.
   *
   * ⛔ This was `lines.filter((l) => l.status !== 'In Stock')`. The comment
   * above it claimed it read "the unit's own status/booking, not a fabricated
   * one", and for a live line that was exactly backwards: `status` was
   * synthesised by `equipmentResultsFrom` from a count of where the product's
   * units sit **at this instant**, so a Critical fired — blocking Confirm — for
   * a booking three weeks out whose gear happens to be on a shoot today.
   *
   * `equipmentConflicts` asks the engine instead: fewer units free across the
   * booking's window than the booking wants. That is not a new rule. It is the
   * refusal `confirmRental` already makes downstream — `planAssignment` then
   * `AssignmentIncompleteError` unless every line is covered
   * (`confirmRental.ts:435-436`) — surfaced here instead of after two round
   * trips.
   */
  const conflictSummary = useMemo(
    () => equipmentConflicts(equipmentLines as readonly ConflictCheckLine[], availabilitySource),
    [equipmentLines, availabilitySource],
  )
  const conflictLines = conflictSummary.conflicts
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
    ...conflictLines.map((c) => ({
      text: `Equipment conflict — ${c.text}`,
      severity: 'Critical' as const,
      action: 'Open Inventory',
    })),
    /*
     * A failed availability read is a Warning, not a Critical.
     *
     * Blocking Confirm because a query failed would invent a rule: `confirmRental`
     * plans the assignment itself and refuses by name if anything is short, so
     * the write is protected either way. What is NOT acceptable is silence —
     * Law 12 — so the failure is stated where every other reason is stated.
     */
    ...(availabilitySource.state === 'failed'
      ? [
          {
            text: `Availability could not be checked for these dates: ${availabilitySource.reason}. Confirm will re-check and refuse if anything is short.`,
            severity: 'Warning' as const,
            action: 'Open Equipment',
          },
        ]
      : []),
    ...(!client ? [{ text: 'No client selected', severity: 'Critical' as const, action: 'Select Client' }] : []),
    ...(client && govId.trim().length === 0 ? [{ text: 'Missing client ID or PAN', severity: 'Critical' as const, action: 'Edit Client' }] : []),
    ...(client && (client.isBlocked || client.onStop)
      ? [
          {
            text: `Client is blocked: ${client.blockReason || client.onStop?.reason || 'Account flagged as on-stop'}`,
            severity: 'Critical' as const,
            action: 'View Client',
          },
        ]
      : []),
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
      clientIsBlocked: Boolean(client?.isBlocked || client?.onStop),
      clientsAreLive,
      lineCount: lines.length,
      sampleLineName: equipmentLines.find((l) => !PRODUCT_ID_RE.test(l.productId ?? l.id))?.name ?? null,
      canBookingMoney,
    }),
    ...pricing.discounts.validationErrors.map((err) => ({ text: err, action: 'Open Pricing' })),
    ...pricing.securityDeposit.validationErrors.map((err) => ({ text: err, action: 'Open Pricing' })),
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

  const [collapsedBundles, setCollapsedBundles] = useState<Record<string, boolean>>({})

  const applyShootPreset = useCallback(
    (presetId: (typeof SHOOT_PRESETS)[number]['id']) => {
      const base = new Date(pickup ? `${pickup}T00:00:00` : getBusinessToday().toISOString().slice(0, 10))
      if (Number.isNaN(base.getTime())) return

      if (presetId === '1-day') {
        const pStr = base.toISOString().slice(0, 10)
        setPickup(pStr)
        setPickupTime('07:00')
        setRet(pStr)
        setReturnTime('20:00')
      } else if (presetId === 'weekend') {
        const dayOfWeek = base.getDay()
        const daysUntilFriday = (5 - dayOfWeek + 7) % 7
        const fri = new Date(base.getTime() + daysUntilFriday * DAY)
        const mon = new Date(fri.getTime() + 3 * DAY)
        setPickup(fri.toISOString().slice(0, 10))
        setPickupTime('14:00')
        setRet(mon.toISOString().slice(0, 10))
        setReturnTime('10:00')
      } else if (presetId === '3-day') {
        const pStr = base.toISOString().slice(0, 10)
        const rDate = new Date(base.getTime() + 2 * DAY)
        setPickup(pStr)
        setPickupTime('08:00')
        setRet(rDate.toISOString().slice(0, 10))
        setReturnTime('20:00')
      } else if (presetId === '1-week') {
        const pStr = base.toISOString().slice(0, 10)
        const rDate = new Date(base.getTime() + 6 * DAY)
        setPickup(pStr)
        setPickupTime('08:00')
        setRet(rDate.toISOString().slice(0, 10))
        setReturnTime('20:00')
      }
    },
    [pickup, setPickup, setPickupTime, setRet, setReturnTime],
  )

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

  /**
   * A manual line is deliberately not an inventory item: it has no product id,
   * no serial assignment, and no availability claim. `createRental` already
   * accepts both Service and Manual item lines, so this only exposes an
   * existing supported workflow instead of inventing a side ledger.
   */
  const addCustomLine = useCallback(() => {
    const name = customLineName.trim()
    const rate = Number(customLineRate)
    if (!name) {
      setCustomLineError('Enter a description for this line.')
      return
    }
    if (!Number.isFinite(rate) || rate < 0) {
      setCustomLineError('Enter a rate of Rs 0 or more.')
      return
    }
    setLines((prev) => [
      ...prev,
      {
        id: newClientUuid(),
        lineType: customLineType,
        name,
        serial: '—',
        category: customLineType === 'Service' ? 'Service' : 'Manual charge',
        ratePaisa: rupees(rate) as Paisa,
        days: Math.max(1, days || 1),
        qty: Math.max(1, Math.round(customLineQty) || 1),
        discountPct: 0,
        location: 'Not inventory-tracked',
        committedTo: '—',
      },
    ])
    setCustomLineError(null)
    setCustomLineName('')
    setCustomLineRate('')
    setCustomLineQty(1)
    setCustomLineOpen(false)
  }, [customLineName, customLineRate, customLineQty, customLineType, days])

  /** Resolve a scanned physical-unit code back to its canonical product before
   * adding it. The booking line remains product-based; the normal creation
   * planner remains the one source of serial assignment. */
  const addScannedEquipment = useCallback(async (rawCode: string) => {
    const code = rawCode.trim()
    if (!code) return
    if (!liveEquipment) {
      setScanNotice({ tone: 'warning', text: 'The live catalogue is still loading. Try the scan again in a moment.' })
      return
    }
    setScanNotice(null)
    type ScannedUnit = { product?: { id?: string | null } | null }
    let unit: ScannedUnit | null = null
    try {
      const { data, error } = await supabase
        .from('product_units_v')
        .select('product:products_v (id)')
        .or(`barcode.eq.${code},serial_no.eq.${code},asset_tag.eq.${code}`)
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (data) {
        unit = data as ScannedUnit
      }
    } catch (error: unknown) {
      setScanNotice({ tone: 'danger', text: `We could not look up that code: ${error instanceof Error ? error.message : String(error)}` })
      return
    }

    const productId = unit?.product?.id ?? null
    const match = productId ? liveEquipment.find((item) => item.id === productId) : undefined
    if (!match) {
      setScanNotice({ tone: 'warning', text: 'No rentable catalogue product matches that barcode, serial, or asset tag.' })
      return
    }
    if (lines.some((line) => line.id === match.id)) {
      setScanNotice({ tone: 'warning', text: `${match.name} is already on this booking.` })
      return
    }
    if (match.availability.level === 'unavailable') {
      setScanNotice({ tone: 'danger', text: `${match.name} is unavailable for the selected rental period. Choose different dates or another item.` })
      return
    }
    addDrafts([equipmentLineDraft(match, days || 1)], { kind: match.kind, id: match.id, name: match.name })
    setScanNotice({ tone: 'success', text: `${match.name} was added. Availability remains tied to the selected rental period.` })
  }, [liveEquipment, lines, addDrafts, days])

  const addCrew = (crewId: string) => {
    const rosterPool = liveCrew && liveCrew.length > 0 ? liveCrew : CREW_ROSTER
    const m = rosterPool.find((x) => x.id === crewId)
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

  const updateCrewExtras = (
    crewId: string,
    field: 'overtimePaisa' | 'mealsPaisa' | 'accommodationPaisa',
    valPaisa: Paisa,
  ) => {
    setCrew((p) => p.map((c) => (c.crewId === crewId ? { ...c, [field]: valPaisa } : c)))
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
  const createdQuote = useRef<{ id: string; no: string; stage?: string } | null>(null)
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
    *    transition* on it (`CANCEL_RENTAL_DRAFT`), behind a `ConfirmDialog` with a
   *    reason. It is never a delete.
   */
  const [draftPersisted, setDraftPersisted] = useState(false)
  const [draftId, setDraftId] = useState<string | null>(() => searchParams.get('draft'))
  const [draftBookingNo, setDraftBookingNo] = useState<string | null>(null)
  const [draftLoading, setDraftLoading] = useState<boolean>(() => Boolean(searchParams.get('draft')))
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null)
  const [exitPrompt, setExitPrompt] = useState<'unsaved-new' | 'unsaved-edits' | null>(null)
  const [draftClientDbId, setDraftClientDbId] = useState<string | null>(null)
  const [savedDraftFingerprint, setSavedDraftFingerprint] = useState<string | null>(null)
  const draftCreateKey = useRef<string | null>(null)
  const draftBookingKey = useRef<string | null>(null)
  const loadedDraftId = useRef<string | null>(null)

  const draftData = useMemo<RentalDraftData>(
    () => ({
      version: 1,
      selectedClientId,
      clientDbId: client?.dbId ?? draftClientDbId,
      clientName: client?.name,
      project,
      kind,
      govId,
      pickup,
      pickupTime,
      returnDate: ret,
      returnTime,
      deliveryType,
      pickupLocation,
      returnLocation,
      specialInstructions,
      lines: lines.map((line) => ({
        id: line.id,
        ...(line.lineType !== undefined ? { lineType: line.lineType } : {}),
        name: line.name,
        serial: line.serial,
        category: line.category,
        ratePaisa: Number(line.ratePaisa),
        days: line.days,
        ...(line.daysOverridden !== undefined ? { daysOverridden: line.daysOverridden } : {}),
        qty: line.qty,
        discountPct: line.discountPct,
        location: line.location,
        ...(line.status !== undefined ? { status: line.status } : {}),
        committedTo: line.committedTo,
        ...(line.bundleCode !== undefined ? { bundleCode: line.bundleCode } : {}),
        ...(line.bundleName !== undefined ? { bundleName: line.bundleName } : {}),
      })),
      crew: crew.map((member) => ({
        ...member,
        dayRatePaisa: Number(member.dayRatePaisa),
        overtimePaisa: Number(member.overtimePaisa),
        accommodationPaisa: Number(member.accommodationPaisa),
        mealsPaisa: Number(member.mealsPaisa),
      })),
      deliveryChargePaisa: Number(deliveryChargePaisa),
      fuelChargePaisa: Number(fuelChargePaisa),
      vehicle,
      numberPlate,
      driverContact,
      returnPickupType,
      returnPickupAddress,
      returnPickupTime,
      returnPickupChargePaisa: Number(returnPickupChargePaisa),
      discountPct,
      vatOn,
      vatRatePercent,
      advancePaisa: Number(advancePaisa),
      ...(draftBookingNo ? { bookingNo: draftBookingNo } : {}),
    }),
    [
      selectedClientId, client, draftClientDbId, project, kind, govId, pickup, pickupTime, ret, returnTime, deliveryType,
      pickupLocation, returnLocation, specialInstructions, lines, crew, deliveryChargePaisa, fuelChargePaisa,
      vehicle, numberPlate, driverContact, returnPickupType, returnPickupAddress, returnPickupTime, returnPickupChargePaisa,
      discountPct, vatOn, vatRatePercent, advancePaisa, draftBookingNo,
    ],
  )
  const draftFingerprint = useMemo(() => stableJson(draftData), [draftData])
  const draftHasUnsavedChanges = savedDraftFingerprint !== draftFingerprint

  const handleExit = useCallback(() => {
    if (draftId && draftHasUnsavedChanges) {
      setExitPrompt('unsaved-edits')
      return
    }
    const isDirtyNew = !draftId && Boolean(selectedClientId || lines.length > 0 || project.trim() !== '')
    if (isDirtyNew) {
      setExitPrompt('unsaved-new')
      return
    }
    doExit()
  }, [draftId, draftHasUnsavedChanges, selectedClientId, lines.length, project, doExit])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const isDirty = draftId
        ? draftHasUnsavedChanges
        : Boolean(selectedClientId || lines.length > 0 || project.trim() !== '')
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [draftId, draftHasUnsavedChanges, selectedClientId, lines.length, project])

  useEffect(() => {
    if (client?.dbId) setDraftClientDbId(client.dbId)
  }, [client])

  useEffect(() => {
    const requestedId = searchParams.get('draft')
    if (!requestedId) {
      setDraftLoading(false)
      return
    }
    if (loadedDraftId.current === requestedId) return
    loadedDraftId.current = requestedId
    setDraftLoading(true)
    setDraftLoadError(null)
    setSaveState('saving')
    setActionError(null)
    void fetchRentalDraft(requestedId)
      .then((draft) => {
        if (draft.status !== 'Active') {
          throw new Error(
            draft.status === 'Converted'
              ? 'This draft has already been converted into a booking.'
              : 'This draft was cancelled and is read-only.',
          )
        }
        const data = draft.data
        setDraftId(draft.id)
        draftCreateKey.current = draft.clientUuid
        draftBookingKey.current = draft.bookingClientUuid
        confirmKey.current = draft.bookingClientUuid
        setDraftBookingNo(data.bookingNo ?? null)
        setSelectedClientId(data.selectedClientId)
        setDraftClientDbId(data.clientDbId)
        setProject(data.project)
        setKind(data.kind)
        setGovId(data.govId)
        setPickup(data.pickup)
        setPickupTime(data.pickupTime)
        setRet(data.returnDate)
        setReturnTime(data.returnTime)
        setDeliveryType(data.deliveryType)
        setPickupLocation(data.pickupLocation)
        setReturnLocation(data.returnLocation)
        setSpecialInstructions(data.specialInstructions)
        setLines(
          data.lines.map((line) => ({
            ...line,
            ratePaisa: line.ratePaisa as Paisa,
            status: line.status as InvStatus | undefined,
          })),
        )
        setCrew(
          data.crew.map((member) => ({
            ...member,
            role: member.role as CrewRole,
            dayRatePaisa: member.dayRatePaisa as Paisa,
            overtimePaisa: member.overtimePaisa as Paisa,
            accommodationPaisa: member.accommodationPaisa as Paisa,
            mealsPaisa: member.mealsPaisa as Paisa,
          })),
        )
        setDeliveryChargePaisa(data.deliveryChargePaisa as Paisa)
        setFuelChargePaisa(data.fuelChargePaisa as Paisa)
        setVehicle(data.vehicle)
        setNumberPlate(data.numberPlate)
        setDriverContact(data.driverContact)
        if (data.returnPickupType) setReturnPickupType(data.returnPickupType)
        if (data.returnPickupAddress) setReturnPickupAddress(data.returnPickupAddress)
        if (data.returnPickupTime) setReturnPickupTime(data.returnPickupTime)
        if (typeof data.returnPickupChargePaisa === 'number') {
          setReturnPickupChargePaisa(data.returnPickupChargePaisa)
        }
        setDiscountPct(data.discountPct)
        setVatOn(data.vatOn)
        setVatRatePercent(data.vatRatePercent)
        setAdvancePaisa(data.advancePaisa as Paisa)
        setSavedDraftFingerprint(stableJson(data))
        setDraftPersisted(true)
        setSaveState('saved')
        setDraftLoading(false)
      })
      .catch((err: unknown) => {
        setSaveState('error')
        const msg = err instanceof Error ? err.message : String(err)
        setDraftLoading(false)
        setDraftLoadError(msg)
        setActionError(`Draft not loaded — ${msg}`)
      })
  }, [searchParams])

  const retryLoadDraft = useCallback(() => {
    const requestedId = searchParams.get('draft')
    if (!requestedId) return
    loadedDraftId.current = null
    setDraftLoadError(null)
    setDraftLoading(true)
    setSearchParams(new URLSearchParams(searchParams))
  }, [searchParams, setSearchParams])

  /* A client code may change after a draft is saved. Resolve its immutable DB
     id against the live pool so reopening does not silently drop the client. */
  useEffect(() => {
    if (!draftPersisted || client || !draftClientDbId) return
    const match = clientPool.find((candidate) => candidate.dbId === draftClientDbId)
    if (match) setSelectedClientId(match.id)
  }, [draftPersisted, client, clientPool, draftClientDbId])

  /** null = closed. 'discard' is the pre-save behaviour, 'cancel' the post-save one. */
  const [cancelIntent, setCancelIntent] = useState<'discard' | 'cancel' | null>(null)

  const saveDraft = useCallback(
    (options?: { silent?: boolean }) => {
      if (saveState === 'saving') return
      const ctx = dispatchContext()
      if (!ctx) {
        setActionError('Not saved — you are not signed in, so this draft cannot be attributed to anyone. Sign in and save again.')
        setSaveState('error')
        return
      }
      if (!draftCreateKey.current) draftCreateKey.current = newClientUuid()
      if (!draftBookingKey.current) draftBookingKey.current = newClientUuid()
      setActionError(null)
      setSaveState('saving')
      void persistRentalDraft(
        {
          ...(draftId ? { id: draftId } : {}),
          clientUuid: draftCreateKey.current,
          bookingClientUuid: draftBookingKey.current,
          data: draftData,
        },
        ctx,
      )
        .then((saved) => {
          if (!('data' in saved)) throw new Error('the database did not return a durable New Rental draft')
          setDraftId(saved.id)
          loadedDraftId.current = saved.id
          draftCreateKey.current = saved.clientUuid
          draftBookingKey.current = saved.bookingClientUuid
          confirmKey.current = saved.bookingClientUuid
          setDraftBookingNo(saved.data.bookingNo ?? null)
          const next = new URLSearchParams(searchParams)
          next.set('draft', saved.id)
          setSearchParams(next, { replace: true })
          setSavedDraftFingerprint(draftFingerprint)
          setSaveState('saved')
          // Only a *landed* save flips this. Cancel's second behaviour hangs off
          // it, so setting it optimistically would offer a terminal transition
          // on a row that does not exist.
          setDraftPersisted(true)

          // Requirement 17: Sync PAN to client record if client is selected and 9 digits
          if (client?.dbId && govId.trim().length === 9 && /^[0-9]{9}$/.test(govId.trim()) && client.pan !== govId.trim()) {
            void updateClient({ clientId: client.dbId, patch: { pan: govId.trim() } }, ctx).catch((err) => {
              console.warn('Could not sync PAN to client record:', err)
            })
          }

          if (!options?.silent) {
            const noDisplay = saved.data.bookingNo ? ` #${saved.data.bookingNo}` : ''
            showSuccessToast(`Draft${noDisplay} saved`, 'This booking is saved as a draft. Nothing has been confirmed.')
          }
        })
        .catch((err: unknown) => {
          console.error('save draft failed:', err)
          setSaveState('error')
          setActionError(`Not saved — ${err instanceof Error ? err.message : String(err)}`)
        })
    },
    [saveState, dispatchContext, draftId, draftData, draftFingerprint, searchParams, setSearchParams, showSuccessToast, client, govId],
  )

  useEffect(() => {
    if (!draftId || !draftHasUnsavedChanges || saveState === 'saving') return
    const timer = setTimeout(() => {
      saveDraft({ silent: true })
    }, 2500)
    return () => clearTimeout(timer)
  }, [draftId, draftHasUnsavedChanges, saveState, saveDraft])

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
    if (!confirmKey.current) confirmKey.current = draftBookingKey.current ?? newClientUuid()
    const pressKey: string = confirmKey.current
    /* Which of the two writes is in flight, so the catch can tell the truth
       about what landed. Everything up to and including `createRental` is
       'create' (nothing persisted if it throws); `confirmRental` is 'confirm'. */
    let step: 'save-draft' | 'create' | 'confirm' | 'convert' = 'create'
    void (async () => {
      try {
        /* A saved draft remains the lossless source snapshot. Persist edits
           made since the last Save Draft before creating its booking. */
        if (draftId && draftHasUnsavedChanges) {
          step = 'save-draft'
          const saved = await persistRentalDraft({ id: draftId, data: draftData }, ctx)
          if (!('data' in saved)) throw new Error('the database did not return the updated rental draft')
          setSavedDraftFingerprint(stableJson(saved.data))
        }
        step = 'create'
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

        /* D5 (ruled 30 Aug 2026, REFERENCE_SPEC v2.5 Appendix A0) — serials
           assigned at creation, least-used first. Where availability cannot be
           known locally (or read fails), planCreationUnits falls back to empty
           units (unit-less lines), which Pack confirms or fills. */
        let creationUnitPlan: CreationUnitPlan | null = null
        try {
          creationUnitPlan = await planCreationUnits(
            { fromAd: pickupAt.toISOString(), toAd: returnAt.toISOString() },
            equipmentLines.map((l, i) => ({
              key: l.id ?? `line-${i}`,
              productId: l.productId ?? l.id ?? null,
              qty: l.qty,
              label: l.name ?? `Line ${i + 1}`,
            })),
          )
        } catch {
          creationUnitPlan = null
        }

        const created = await createRental(
          {
            /* Law 8 — one key for this press, so a double-click is one booking. */
            clientUuid: pressKey,
            clientId: clientDbId,
            branchId,
            project: project.trim() ? project.replace(/^'|'$/g, '') : null,
            ...(draftBookingNo ? { bookingNo: draftBookingNo } : {}),
            /* Law 7 — the stored instant is AD/UTC; the pickers hold local
               wall-clock, so they are combined and sent as a full ISO string.
               NR-19 — the SAME two instants the page measured `days` over
               (`bookingInstant`), not a second construction of them. */
            pickupAt: pickupAt.toISOString(),
            returnAt: returnAt.toISOString(),
            /* The UI says "Client Pickup"; the enum stores "Client Pickup"
   (Law 17 lives in the label, not the column). */
            deliveryType: deliveryTypeFromLabel(deliveryType),
            /* NR-02 — the write carries what the rail prices, not equipment
               lines alone. What still has NO home on a Quote and is therefore
               not sent: the VAT switch (`vat_rate` lives on the invoice, which
               does not exist yet) and the advance (a payment settles against
               an invoice — recordPayment refuses without one). Both are
               TODO(decision): where a Quote-time VAT choice and a typed
               advance are recorded before the first invoice. */
            depositRequired: toRupees(pricing.securityDeposit.requiredPaisa),
            ...(pricing.discounts.discountPaisa > 0
              ? {
                  discounts: [
                    {
                      clientUuid: discountKey.current ?? (discountKey.current = newClientUuid()),
                      discountSource: 'Manual',
                      percent: pricing.discounts.appliedPercent,
                      reason: manualDiscountReason.trim() || (womenDopEligible ? 'Women DoP/Director Discount' : 'Quotation Discount'),
                      approverId: manualDiscountAuthorizedBy.trim() || null,
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
            /* §9.2 / §4.58 — Pure Client Pickup/Return carries no transport row.
               If delivery is active OR return is 'Babin Pickup', a transport row is
               persisted to record driver/vehicle and full transport fees (delivery + return pickup). */
            ...(clientPickup && returnPickupType === 'Client Return'
              ? {}
              : {
                  pickupLocation: pickupLocation.trim() || null,
                  returnLocation: returnLocation.trim() || (returnPickupAddress.trim() || null),
                  transport: {
                    clientUuid: transportKey.current ?? (transportKey.current = newClientUuid()),
                    deliveryCharge: toRupees(((clientPickup ? 0 : deliveryChargePaisa) + returnTransportPaisa) as Paisa),
                    fuelCharge: toRupees((clientPickup ? 0 : fuelChargePaisa) as Paisa),
                    /* Empty is NULL, not "". The columns are nullable and an
                       empty string would read back as a vehicle that was named
                       and is blank, rather than one nobody recorded. */
                    vehicle: vehicle.trim() === '' ? null : vehicle.trim(),
                    numberPlate: numberPlate.trim() === '' ? null : numberPlate.trim(),
                    driverContact: driverContact.trim() === '' ? null : driverContact.trim(),
                    specialInstructions: [
                      specialInstructions.trim() || null,
                      returnPickupType === 'Babin Pickup'
                        ? `Return Pickup: Babin Pickup from "${returnPickupAddress.trim() || 'Client Location'}" at ${
                            returnPickupTime || '18:00'
                          }${returnPickupChargePaisa > 0 ? ` (Return Pickup Fee: Rs ${returnPickupChargePaisa / 100})` : ''}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' | ') || null,
                  },
                }),
            lines: lines.map((l, i) => {
              const isBundle = l.lineType === 'Bundle'
              const isIncluded = l.isIncluded ?? false
              const inventoryLine = !isBundle && (l.lineType === undefined || l.lineType === 'Equipment')
              const lineKey = l.id ?? `line-${i}`
              const assigned = inventoryLine && !isIncluded ? creationUnitPlan?.unitsByKey.get(lineKey) : undefined
              return {
                clientUuid: l.clientUuid ?? newClientUuid(),
                parentClientUuid: l.parentClientUuid ?? null,
                lineType: (l.lineType ?? 'Equipment') as BookingLineType,
                isIncluded,
                ...(isBundle ? { bundleId: l.bundleId ?? null, description: l.name } : inventoryLine ? { productId: l.productId ?? l.id } : { description: l.name }),
                qty: l.qty,
                /* Law 9 — days is mandatory and never defaulted. */
                days: l.days,
                /* `booking_lines.rate` is numeric(14,2) rupees; `toRupees` is the
                   engine's paisa→rupees and keeps the paisa the old
                   `Math.round(paisa / 100)` threw away. */
                rate: toRupees(l.ratePaisa),
                sortOrder: i,
                ...(assigned && assigned.length > 0 ? { units: assigned } : {}),
              }
            }),
          },
          ctx,
        )
        createdQuote.current = { id: created.bookingId, no: created.bookingNo, stage: created.stage }
        }

        /* Created as a Quote; confirm it into Booked with the id the database
           just minted — never the `bk-new` placeholder this screen used to send. */
        if (createdQuote.current.stage !== 'Booked') {
          step = 'confirm'
          const mod = await import('../../actions/rentals/confirmRental')
          await mod.confirmRental({ id: createdQuote.current.id }, ctx)
          createdQuote.current.stage = 'Booked'
        }

        if (draftId) {
          step = 'convert'
          await convertDraft({ id: draftId, bookingId: createdQuote.current.id }, ctx)
        }

        const bookedId = createdQuote.current.id
        const bookedNo = createdQuote.current.no

        /* The whole press landed: the next press is a new booking. */
        confirmKey.current = null
        createdQuote.current = null
        discountKey.current = null
        crewKeys.current = []
        transportKey.current = null
        setSaveState('saved')
        /* Transition to confirmed success dialog */
        setConfirmedSuccess({ bookingId: bookedId, bookingNo: bookedNo })
      } catch (err) {
        setSaveState('error')
        const reason = err instanceof Error ? err.message : String(err)
        /* 0132 (Audit-01 P1-02): there is no longer a partial-create branch.
           Crew and transport ride the same `create_booking` transaction as the
           header, lines and discounts, so a create failure means NOTHING was
           written — the generic `step === undefined` message below is now the
           literal truth, and a retry creates the whole booking at once. */
        if (step === 'convert' && createdQuote.current) {
          setActionError(
            `Booking ${createdQuote.current.no} is confirmed, but the draft link did not update: ${reason}. ` +
              'Press Confirm Booking again to finish linking this same draft; no second booking will be created.',
          )
        } else if (step === 'confirm' && createdQuote.current) {
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
    equipmentLines,
    project,
    /* NR-19 — the two instants, not the four picker strings they came from. */
    pickupAt,
    returnAt,
    deliveryType,
    /* NR-02 — the rows written beside the header read these; without them in
       the deps the press sent the INITIAL zero discount and no crew (driven
       3 Sep: 5% on screen, no booking_discounts row in the overlay). */
    pricing,
    manualDiscountReason,
    manualDiscountAuthorizedBy,
    womenDopEligible,
    crew,
    clientPickup,
    deliveryChargePaisa,
    fuelChargePaisa,
    returnPickupType,
    returnPickupAddress,
    returnPickupTime,
    returnPickupChargePaisa,
    returnTransportPaisa,
    /* Same reason as the discount above: the transport row reads these, and a
       stale closure would file a delivery with no vehicle on it. */
    vehicle,
    numberPlate,
    driverContact,
    pickupLocation,
    returnLocation,
    specialInstructions,
    days,
    draftId,
    draftBookingNo,
    draftHasUnsavedChanges,
    draftData,
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
    handleExit()
  }, [handleExit])

  /**
   * The post-save path: `CANCEL_RENTAL_DRAFT`, the named terminal transition,
   * records the dialog's reason on the durable draft row. It never deletes it.
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
      if (!draftId) {
        setActionError('Not cancelled — this saved draft has no database id. Reload it from the saved draft URL and try again.')
        return
      }
      void cancelDraft({ id: draftId, reason: reason ?? '' }, ctx)
        .then(() => handleExit())
        .catch((err: unknown) => {
          console.error('cancel booking failed:', err)
          setActionError(`Not cancelled — ${err instanceof Error ? err.message : String(err)}`)
        })
    },
    [dispatchContext, draftId, handleExit],
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

  // Power-user keyboard shortcuts: ⌘S/Ctrl+S (Save Draft), ⌘B/Ctrl+B (Toggle Scanner), ⌘Enter/Ctrl+Enter (Confirm Booking), Alt+1..5 (Jump Workflow Steps)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘S or Ctrl+S: Save Draft
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveDraft()
        return
      }

      // ⌘B or Ctrl+B: Toggle Scanner
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setScannerOpen((open) => !open)
        return
      }

      // ⌘Enter or Ctrl+Enter: Confirm Booking
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (!confirmBlocked && saveState !== 'saving') {
          void confirmBooking()
        }
        return
      }

      // Alt+1 to Alt+4: Navigate Steps
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key >= '1' && e.key <= '4') {
        e.preventDefault()
        const stepNum = Number(e.key)
        setCurrentStep(stepNum)
        setOpen((prev) => {
          const next = [...prev]
          if (stepNum === 1) {
            next[0] = true
            next[1] = true
          } else if (stepNum === 2) {
            next[2] = true
          } else if (stepNum === 3) {
            next[5] = true
          } else if (stepNum === 4) {
            return next.map(() => true)
          }
          return next
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [confirmBlocked, saveState, saveDraft, confirmBooking, setCurrentStep, setOpen])


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
    if (sectionIndex >= 0) {
      setOpen((prev) => prev.map((v, j) => (j === sectionIndex ? true : v)))
      setCurrentStep(sectionIndex <= 1 || sectionIndex === 3 || sectionIndex === 4 ? 1 : sectionIndex === 2 ? 2 : 3)
    }
    globalThis.requestAnimationFrame(() => {
      const section = document.getElementById(targetId)
      section?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
      section?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), button:not([disabled])')?.focus({ preventScroll: true })
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
      if (action === 'Open Pricing') jumpToSection('section-5')
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
   * What replaces it is the true statement, in the same rail position.
   * Documents are intentionally outside the creation checklist: there is no
   * persisted booking yet for a document to belong to.
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
  /**
   * Section 38's availability pill for one line - icon + label + colour, never
   * the colour alone (Law 11), and never a status the line does not have.
   *
   * Two sources, in this order, because they answer different questions:
   *
   *  - a line that IS a physical unit (seed catalogue, bundle component) has a
   *    real `inventory_state` and shows it, exactly as before;
   *  - a live line is a product with no unit status at all, so it shows the
   *    windowed verdict `conflictSummary` computed - the same computation the
   *    section's conflict strip prints, so a row can never read "Available"
   *    under a strip that names it as a conflict.
   *
   * `rank` is worst-wins, used by the group parent row below.
   */
  const linePill = (
    l: Line,
  ): { label: string; title: string; bg: string; fg: string; icon: IconName; rank: number } => {
    if (l.lineType === 'Service' || l.lineType === 'Manual item') {
      return {
        label: 'Not inventory-tracked',
        title: `${l.lineType} — no serial assignment or availability check applies.`,
        bg: 'var(--st-neutral-bg)',
        fg: 'var(--st-neutral-fg)',
        icon: 'info',
        rank: 0,
      }
    }
    if (l.status) {
      const inv = INV_STYLE[l.status]
      return {
        label: l.status,
        title: l.committedTo !== '—' ? `${l.status} — committed to ${l.committedTo}` : l.status,
        bg: inv.bg === 'transparent' ? 'var(--st-in-bg)' : inv.bg,
        fg: inv.bg === 'transparent' ? 'var(--st-in-fg)' : inv.fg,
        icon: inv.icon,
        rank: l.status === 'In Stock' ? 0 : 3,
      }
    }
    const v: AvailabilityVerdict | undefined = conflictSummary.verdictByLineId.get(l.id)
    if (v === undefined) {
      /* Unreachable while `conflictSummary` is built from `lines` - every line
         gets an entry. Rendered rather than asserted, because a crash in a
         table cell is a worse failure than an honest "we do not know". */
      return {
        label: 'Not checked',
        title: 'No availability answer for this line',
        bg: 'var(--st-neutral-bg)',
        fg: 'var(--st-neutral-fg)',
        icon: 'info',
        rank: 1,
      }
    }
    const t = STATUS[v.tone]
    return {
      label: v.label,
      title: v.detail,
      bg: t.bg,
      fg: t.fg,
      icon: v.icon,
      rank: v.level === 'available' ? 0 : v.level === 'unknown' ? 1 : v.level === 'partial' ? 2 : 3,
    }
  }

  const equipmentRow = (
    l: Line,
    child: boolean,
    groupLabel: string,
    menuItems?: Array<{ label: string; icon: IconName; onClick: () => void }>,
  ) => {
    const pill = linePill(l)
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
            {l.lineType === 'Service' || l.lineType === 'Manual item' ? (
              <span>{l.lineType}</span>
            ) : l.serial !== '—' ? (
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
          <NumberStepper
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
          <NumberStepper
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
            title={pill.title}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--sp-xs)',
              height: 20,
              padding: '0 7px',
              borderRadius: 'var(--r-badge)',
              fontSize: 'var(--t-th)',
              fontWeight: 700,
              background: pill.bg,
              color: pill.fg,
            }}
          >
            <Icon name={pill.icon} size={11} />
            {pill.label}
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
   *     Equipment / Services / Crew / Delivery
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
  /**
   * Part B — Right Rail Simplification
   * One Single Consolidated Card: Booking Summary (Bento 2.0 Architecture)
   */
  const bookingSummaryCard = (
    <Card id="rail-booking-summary" title="Booking Summary">
      <dl className="new-rental-summary-context">
        <div><dt>Client</dt><dd>{client?.name || 'Select a client'}</dd></div>
        <div><dt>Pickup</dt><dd>{pickupAt ? formatAd(new Date(pickupAt)) : 'Choose date'} · {pickupTime || 'Choose time'}</dd></div>
        <div><dt>Return</dt><dd>{returnAt ? formatAd(new Date(returnAt)) : 'Choose date'} · {returnTime || 'Choose time'}</dd></div>
        <div><dt>Equipment</dt><dd>{totalUnits} {totalUnits === 1 ? 'item' : 'items'} · {days > 0 ? `${days} ${dayWord}` : 'Check dates'}</dd></div>
      </dl>
      {canBookingMoney ? (
        <>
          <div className="new-rental-bento-hero-total">
            <div className="new-rental-bento-hero-total-label">
              <span>Estimated Rental Total</span>
              <span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 600, textTransform: 'none' }}>
                {days > 0 ? `${days} ${dayWord}` : 'Dates pending'}
              </span>
            </div>
            <div className="new-rental-bento-hero-total-val">
              {formatMoney(pricing.rentalTotalPaisa)}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <MoneyRow label="Equipment" value={formatMoney(pricing.equipmentSubtotalPaisa)} />
            {pricing.bundleSubtotalPaisa > 0 && <MoneyRow label="Bundles" value={formatMoney(pricing.bundleSubtotalPaisa)} />}
            {pricing.servicesSubtotalPaisa > 0 && <MoneyRow label="Services & custom lines" value={formatMoney(pricing.servicesSubtotalPaisa)} />}
            {canCrewMoney && pricing.crewSubtotalPaisa > 0 && <MoneyRow label="Crew" value={formatMoney(pricing.crewSubtotalPaisa)} />}
            <MoneyRow label="Delivery" value={formatMoney(pricing.deliverySubtotalPaisa)} />
          </div>

          <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <MoneyRow label="Subtotal" value={formatMoney(pricing.grossSubtotalPaisa)} />
            <MoneyRow
              label={
                pricing.discounts.appliedPercent > 0
                  ? `Discount (${pricing.discounts.appliedPercent}%${pricing.discounts.capped ? ' capped' : ''})`
                  : 'Discount'
              }
              value={pricing.discounts.discountPaisa > 0 ? `− ${formatMoney(pricing.discounts.discountPaisa)}` : '—'}
              {...(pricing.discounts.discountPaisa > 0 ? { tone: 'var(--danger-text)' } : {})}
            />
            <MoneyRow
              label={vatOn ? `VAT (${pricing.vatRatePercent}%)` : 'VAT'}
              value={vatOn ? formatMoney(pricing.vatPaisa) : '—'}
              {...(!vatOn ? { tone: 'var(--muted)' } : {})}
            />
          </div>

          <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
            <MoneyRow label="Rental Total" value={formatMoney(pricing.rentalTotalPaisa)} big />
          </div>

          {/* Security Deposit (separate liability guarantee) and Advance Required */}
          <div
            style={{
              marginTop: 10,
              padding: '8px 10px',
              borderRadius: 'var(--r-btn)',
              background: 'var(--card2)',
              border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <MoneyRow
              label="Security Deposit (Refundable)"
              value={formatMoney(pricing.securityDeposit.requiredPaisa)}
              tone="var(--text2)"
            />
            <MoneyRow
              label="Advance Required"
              value={formatMoney(pricing.advanceRequiredPaisa)}
              tone="var(--st-primary-fg)"
              strong
            />
          </div>
        </>
      ) : (
        <p style={{ margin: '0 0 8px', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          Prices are hidden for your role.
        </p>
      )}

      {/* Attention Status */}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        {blockingNotices.length === 0 ? (
          <div
            data-testid="booking-ready-status"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 'var(--r-btn)',
              background: 'var(--st-success-bg, #ecfdf5)',
              border: '1px solid color-mix(in srgb, var(--success, #10b981) 30%, transparent)',
              color: 'var(--st-success-fg, #065f46)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
            }}
          >
            <span className="status-live-dot" style={{ background: 'var(--success, #10b981)' }} />
            <Icon name="check" size={15} style={{ color: 'var(--st-success-fg, #065f46)', flexShrink: 0 }} />
            <span>Ready to confirm</span>
          </div>
        ) : (
          <div
            data-testid="booking-attention-status"
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--r-btn)',
              background: 'var(--st-danger-bg)',
              border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
              color: 'var(--st-danger-fg)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 'var(--t-meta)' }}>
              <Icon name="error" size={14} style={{ flexShrink: 0 }} />
              <span>
                {blockingNotices.length} {blockingNotices.length === 1 ? 'thing needs' : 'things need'} attention:
              </span>
            </div>
            <ul style={{ listStyle: 'disc', margin: '6px 0 0 16px', padding: 0, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--t-meta)' }}>
              {blockingNotices.map((n) => (
                <li key={n.text} style={{ lineHeight: 1.35 }}>
                  <span>{n.text}</span>
                  {n.action && (
                    <button
                      type="button"
                      className="press"
                      onClick={() => runNoticeAction(n.action!)}
                      style={{
                        display: 'inline-block',
                        minHeight: 44,
                        marginLeft: 6,
                        padding: '1px 8px',
                        borderRadius: 'var(--r-badge)',
                        border: '1px solid var(--st-danger-fg)',
                        background: 'transparent',
                        color: 'var(--st-danger-fg)',
                        fontSize: 'var(--t-th)',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {n.action}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Action */}
      <div style={{ marginTop: 14 }}>
        <Button
          icon={saveState === 'saving' ? 'refresh' : 'check'}
          variant="primary"
          onClick={confirmBooking}
          disabled={confirmBlocked || saveState === 'saving'}
          title={blockReasonText}
          style={{ width: '100%', minHeight: 44, justifyContent: 'center', fontWeight: 700 }}
        >
          {saveState === 'saving' ? 'Confirming Booking…' : 'Confirm Booking'}
        </Button>
      </div>
    </Card>
  )

  if (draftLoading) {
    return (
      <div style={{ padding: 'var(--sp-xl)', maxWidth: 1000, margin: '40px auto' }}>
        <LoadingSkeleton type="card" label="Loading draft booking…" />
      </div>
    )
  }

  if (draftLoadError) {
    return (
      <div style={{ padding: 'var(--sp-xl)', maxWidth: 600, margin: '40px auto' }}>
        <Card style={{ padding: 'var(--sp-lg)', textAlign: 'center' }}>
          <EmptyState
            kind="no-results"
            title="Couldn't load this draft"
            description={draftLoadError}
            actionLabel="Back to Rentals"
            onAction={doExit}
          />
          <div style={{ marginTop: 'var(--sp-md)', display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Button variant="secondary" onClick={retryLoadDraft}>
              Retry
            </Button>
            <Button variant="ghost" onClick={doExit}>
              Back to Rentals
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <PageShell
      width="full"
      className="new-rental-shell"
      header={
        <PageHeader
          breadcrumb={
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
              <Link
                to="/rentals"
                onClick={(e) => {
                  if (embedded) {
                    e.preventDefault()
                    handleExit()
                  }
                }}
                style={{ color: 'var(--link)', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <Icon name="chevron_left" size={14} />
                Rentals
              </Link>
              <span>›</span>
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                {draftBookingNo ? `Draft #${draftBookingNo}` : 'New Rental'}
              </span>
            </div>
          }
          title={draftBookingNo ? `Draft #${draftBookingNo}` : 'New Rental'}
          actions={
            <PageActions
              secondary={
                <Button
                  variant="outline"
                  icon="file"
                  onClick={() => saveDraft()}
                  disabled={saveState === 'saving'}
                >
                  {saveState === 'saving' ? 'Saving…' : 'Save as draft'}
                </Button>
              }
              extra={
                <span
                  className="new-rental-status"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 10px', borderRadius: 'var(--r-badge)', background: STATUS[statusToken(status)].bg, color: STATUS[statusToken(status)].fg, fontSize: 'var(--t-meta)', fontWeight: 700 }}
                >
                  <Icon name="file" size={13} />
                  {draftBookingNo ? `Draft #${draftBookingNo}` : `${status} · ${flag}`}
                </span>
              }
            />
          }
        />
      }
    >
      {/* Errors are inline and persistent, never a toast and never an alert(). */}
      {actionError && (
        <p role="status" style={inlineErrorStyle}>
          <Icon name="error" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {actionError}
        </p>
      )}

      {/* Global Inventory Stock Contention Banner */}
      {conflictLines.length > 0 && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--sp-md)',
            padding: '8px 14px',
            borderRadius: 'var(--r-card)',
            background: 'var(--st-danger-bg)',
            color: 'var(--st-danger-fg)',
            border: '1px solid var(--st-danger-fg)',
            marginBottom: 'var(--sp-md)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--t-meta)' }}>
            <Icon name="alert_triangle" size={16} style={{ flexShrink: 0 }} />
            <span>{conflictLines.length} equipment conflict{conflictLines.length > 1 ? 's' : ''}</span>
          </div>
          <Button
            variant="outline"
            onClick={() => setCurrentStep(2)}
            style={{
              whiteSpace: 'nowrap',
              borderColor: 'currentColor',
              color: 'inherit',
              minHeight: 32,
              padding: '0 10px',
              fontSize: 'var(--t-meta)',
            }}
          >
            Review
          </Button>
        </div>
      )}

      {/* 4-Step Guided Wizard Stepper */}
      <nav
        aria-label="Booking steps"
        className="new-rental-stepper-container"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-sm)',
          marginBottom: 'var(--sp-md)',
          overflowX: 'auto',
          paddingBottom: 4,
        }}
      >
        {[
          { step: 1, label: 'Client & Dates', id: 'section-0' },
          { step: 2, label: 'Equipment & Bundles', id: 'section-2' },
          { step: 3, label: 'Price & Payment', id: 'section-5' },
          { step: 4, label: 'Review & Confirm', id: 'rail-booking-summary' },
        ].map((s) => {
          const isActive = currentStep === s.step;
          const isDone = currentStep > s.step;
          return (
            <button
              key={s.step}
              type="button"
              onClick={() => {
                setCurrentStep(s.step);
                if (s.step === 1) setOpen((p) => p.map((v, i) => (i === 0 || i === 1 ? true : v)));
                if (s.step === 2) setOpen((p) => p.map((v, i) => (i === 2 ? true : v)));
                if (s.step === 3) setOpen((p) => p.map((v, i) => (i === 5 ? true : v)));
                if (s.step === 4) setOpen((p) => p.map(() => true));
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                minHeight: 36,
                padding: '6px 12px',
                borderRadius: 'var(--r-badge)',
                border: isActive ? '1px solid var(--primary)' : '1px solid var(--border)',
                background: isActive ? 'var(--primary-subtle, rgba(56, 106, 247, 0.1))' : 'transparent',
                color: isActive ? 'var(--primary)' : isDone ? 'var(--text)' : 'var(--text2)',
                fontWeight: isActive ? 700 : 500,
                fontSize: 'var(--t-meta)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isActive ? 'var(--primary)' : isDone ? 'var(--st-success-fg)' : 'var(--border)',
                  color: isActive || isDone ? '#fff' : 'var(--text2)',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {isDone ? '✓' : s.step}
              </span>
              <span>{s.label}</span>
            </button>
          );
        })}
      </nav>

      <div
        className="new-rental-workspace"
        ref={workflowRef}
        style={{
          display: 'grid',
          gridTemplateColumns: isDesktop ? 'minmax(0,1fr) 320px' : 'minmax(0,1fr)',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        <div className="new-rental-canvas" style={{ minWidth: 0 }}>
          <div className="new-rental-stage new-rental-stage--setup">
            <Section
              id="section-0"
            title={SECTIONS[0]}
            badge={
              client ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 'var(--r-badge)',
                    background: 'var(--st-success-bg)',
                    color: 'var(--st-success-fg)',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  <Icon name="check" size={11} /> {client.name}
                </span>
              ) : null
            }
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

              {/* AUD-026: Client Credit & Blocked Status Warning Banner */}
              {client && (client.isBlocked || client.onStop || (canBookingMoney && client.outstandingPaisa > 0) || health?.level === 'attention') && (
                <div
                  role="alert"
                  data-testid="client-credit-warning"
                  style={{
                    marginTop: 10,
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md, 8px)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    background: (client.isBlocked || client.onStop) ? 'var(--danger-bg, #fef2f2)' : 'var(--warning-bg, #fffbeb)',
                    border: `1px solid ${(client.isBlocked || client.onStop) ? 'var(--danger-border, #fca5a5)' : 'var(--warning-border, #fcd34d)'}`,
                    color: (client.isBlocked || client.onStop) ? 'var(--danger-text, #991b1b)' : 'var(--warning-text, #92400e)',
                    fontSize: 13,
                    lineHeight: 1.4,
                  }}
                >
                  <Icon
                    name={(client.isBlocked || client.onStop) ? 'alert_circle' : 'alert_triangle'}
                    size={18}
                    style={{ flexShrink: 0, marginTop: 1 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>
                      {(client.isBlocked || client.onStop) ? 'Client Account Blocked' : 'Client Credit Warning'}
                    </div>
                    <div>
                      {(client.isBlocked || client.onStop)
                        ? (client.blockReason || client.onStop?.reason || 'This client is currently blocked from equipment rentals. Quotation and booking confirmation cannot proceed without manager override.')
                        : (health?.reasons?.map((r) => r.text).join(' · ') || `Client has outstanding balance of ${formatMoney(client.outstandingPaisa)}.`)}
                    </div>
                  </div>
                </div>
              )}
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(0,1fr))', gap: 11, marginTop: 11 }}>
              <Field label="Project">
                <Input value={project} onChange={(e) => setProject(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Project Type">
                <Input value={kind} onChange={(e) => setKind(e.target.value)} style={inputStyle} />
              </Field>
              <div style={{ gridColumn: isPhone ? 'auto' : '1 / -1' }}>
                <Field
                  label="Government ID / PAN"
                  error={client && govId.trim().length === 0 ? 'Required before confirming. Enter the PAN or citizenship number, or add it on the client record.' : undefined}
                >
                  <Input value={govId} onChange={(e) => setGovId(e.target.value)} style={inputStyle} />
                </Field>
              </div>
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
            badge={
              days > 0 ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 'var(--r-badge)',
                    background: 'var(--st-primary-bg)',
                    color: 'var(--st-primary-fg)',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  <Icon name="calendar" size={11} /> {days} {dayWord}
                </span>
              ) : null
            }
            open={open[1] ?? true}
            onToggle={() => toggle(1)}
            summary={
              days === 0
                ? 'Return must be later than pickup'
                : `${pickupBs ? formatBs(pickupBs) : formatAd(new Date(pickup))} → ${days} ${dayWord}`
            }
          >
            <details className="new-rental-preset-disclosure">
              <summary>Use a shoot preset</summary>
              <div className="new-rental-shoot-presets" role="group" aria-label="Production shoot presets">
                {SHOOT_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="new-rental-preset-chip"
                    onClick={() => applyShootPreset(p.id)}
                    title={p.description}
                  >
                    <Icon name={p.icon} size={12} />
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            </details>

            <div className="new-rental-period-fields" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 11, alignItems: 'start' }}>
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
            </div>
          </Section>


          {!isPhone && (
            <div className="new-rental-stage-next" style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
              <Button
                variant="primary"
                onClick={() => {
                  setCurrentStep(2)
                  setOpen((p) => p.map((v, i) => (i === 2 ? true : v)))
                }}
                style={{ minHeight: 44, padding: '0 24px', fontWeight: 600 }}
              >
                Continue to Equipment →
              </Button>
            </div>
          )}
        </div>

        <div className="new-rental-stage new-rental-stage--equipment">
          <Section
            id="section-2"
            title={SECTIONS[2]}
            badge={
              lines.length > 0 ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 'var(--r-badge)',
                    /* R-40 fix: was --st-info-*, a token pair defined in no
                       stylesheet — the badge computed to transparent ink on
                       nothing. --st-primary-* is the defined blue pair. */
                    background: 'var(--st-primary-bg)',
                    color: 'var(--st-primary-fg)',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {lines.length} {lines.length === 1 ? 'line' : 'lines'} · {totalUnits} {totalUnits === 1 ? 'unit' : 'units'}
                </span>
              ) : null
            }
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
                {...(liveEquipment
                  ? { equipment: liveEquipment, availability: availabilitySource }
                  : {})}
                bundles={liveBundleResults}
                days={days || 1}
                existingLineIds={lines.map((l) => l.id)}
                onAdd={addDrafts}
                showPrices={canBookingMoney}
                inputStyle={inputStyle}
              />
            </div>

            <div style={{ margin: '0 0 12px', paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
              <button
                type="button"
                className="press"
                onClick={() => setScannerOpen((open) => !open)}
                aria-expanded={scannerOpen}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 34, padding: '0 10px', borderRadius: 'var(--r-btn)', border: '1px solid var(--btn-secondary-border)', background: 'var(--btn-secondary-bg)', color: 'var(--text)', fontFamily: 'inherit', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer' }}
              >
                <Icon name="barcode" size={15} />
                <span>Scan barcode or serial</span>
                <span className="new-rental-kbd">⌘B</span>
                <Icon name={scannerOpen ? 'chevron_up' : 'chevron_down'} size={14} />
              </button>
              {scannerOpen && (
                <div style={{ marginTop: 9, maxWidth: 620 }}>
                  <ScannerInput
                    autoFocus
                    placeholder="Scan or enter barcode, serial, or asset tag…"
                    onScan={(code) => void addScannedEquipment(code)}
                  />
                  <p style={{ margin: '7px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
                    The scan finds its canonical product, then checks availability for this rental period before adding it.
                  </p>
                </div>
              )}
              {scanNotice && (
                <p
                  role="status"
                  style={{ margin: '8px 0 0', fontSize: 'var(--t-meta)', lineHeight: 1.45, color: scanNotice.tone === 'danger' ? 'var(--st-danger-fg)' : scanNotice.tone === 'warning' ? 'var(--warn-text)' : 'var(--st-in-fg)' }}
                >
                  {scanNotice.text}
                </p>
              )}
            </div>

            {canBookingMoney && (
              <div style={{ margin: '0 0 12px', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ fontSize: 'var(--t-ui)' }}>Services & custom charges</strong>
                    <p style={{ margin: '2px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                      Add non-inventory work without claiming stock availability or a serial number.
                    </p>
                  </div>
                  <Button icon="plus" variant="secondary" onClick={() => setCustomLineOpen((open) => !open)}>
                    {customLineOpen ? 'Close custom line' : 'Add custom line'}
                  </Button>
                </div>

                {customLineOpen && (
                  <div style={{ marginTop: 10, padding: 12, borderRadius: 'var(--r-card)', background: 'var(--card2)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'minmax(0,1.6fr) minmax(150px,0.7fr) minmax(100px,0.45fr) minmax(130px,0.6fr)', gap: 9, alignItems: 'end' }}>
                      <Field label="Line type">
                        <Select value={customLineType} onChange={(e) => setCustomLineType(e.target.value as typeof customLineType)} style={inputStyle}>
                          <option value="Service">Service</option>
                          <option value="Manual item">Manual charge</option>
                        </Select>
                      </Field>
                      <Field label="Description">
                        <Input value={customLineName} onChange={(e) => setCustomLineName(e.target.value)} placeholder="e.g. Operator overtime" style={inputStyle} />
                      </Field>
                      <Field label="Qty">
                        <Input type="number" min={1} value={customLineQty} onChange={(e) => setCustomLineQty(Math.max(1, Number(e.target.value) || 1))} style={inputStyle} />
                      </Field>
                      <Field label="Rate / day (Rs)">
                        <Input type="number" min={0} value={customLineRate} onChange={(e) => setCustomLineRate(e.target.value)} placeholder="0" style={inputStyle} />
                      </Field>
                    </div>
                    {customLineError && <p role="alert" style={{ margin: '8px 0 0', fontSize: 'var(--t-meta)', color: 'var(--st-danger-fg)' }}>{customLineError}</p>}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                      <Button variant="ghost" onClick={() => { setCustomLineOpen(false); setCustomLineError(null) }}>Cancel</Button>
                      <Button icon="plus" onClick={addCustomLine}>Add line</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* §8.5 — the inline conflict check, re-run on every change to the
                dates or the items. NR-09: it now reports the WINDOWED answer,
                including the two states that are not answers at all, rather
                than claiming "all items available for the selected dates" over
                a check nobody has run. */}
            {(() => {
              const conflicted = conflictSummary.conflicts.length > 0
              const answered = conflictSummary.state === 'ready'
              const tone = conflicted
                ? { bg: 'var(--st-danger-bg)', fg: 'var(--st-danger-fg)', icon: 'error' as IconName }
                : answered
                  ? { bg: 'var(--st-in-bg)', fg: 'var(--st-in-fg)', icon: 'check' as IconName }
                  : { bg: 'var(--st-neutral-bg)', fg: 'var(--st-neutral-fg)', icon: 'timer' as IconName }
              return (
                <div
                  style={{
                    display: 'flex',
                    gap: 7,
                    alignItems: 'center',
                    padding: '7px 10px',
                    borderRadius: 'var(--r-btn)',
                    marginBottom: 10,
                    background: tone.bg,
                    color: tone.fg,
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                  }}
                >
                  <Icon name={tone.icon} size={13} style={{ flexShrink: 0 }} />
                  {conflictSummary.text}
                </div>
              )
            })()}

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

            {lines.length === 0 ? (
              <div className="new-rental-empty-products">
                <Icon name="box" size={22} />
                <h3>This booking is empty</h3>
                <p>Search above to add equipment or a bundle for this rental period.</p>
              </div>
            ) : (
            <DataTableShell ariaLabel="Booking equipment and bundles">
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
                    const isCollapsed = Boolean(collapsedBundles[g.key])
                    const groupUnits = g.lines.reduce((s, l) => s + l.qty, 0)
                    const dayValues = Array.from(new Set(g.lines.map((l) => l.days)))
                    const minDays = Math.min(...dayValues)
                    const maxDays = Math.max(...dayValues)
                    const groupAmountPaisa = g.lines.reduce((s, l) => s + lineAmountPaisa(l), 0) as Paisa
                    /* The parent states the group's WORST availability - one
                       blocked unit blocks the group, and a green pill over a
                       blocked child would be the lie. Same `linePill` the child
                       rows use, so the two can never disagree. */
                    const parentPill = g.lines
                      .map(linePill)
                      .reduce((worst, x) => (x.rank > worst.rank ? x : worst))
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
                                <button
                                  type="button"
                                  className="new-rental-bundle-toggle"
                                  onClick={() => setCollapsedBundles((prev) => ({ ...prev, [g.key]: !prev[g.key] }))}
                                  aria-label={isCollapsed ? `Expand ${g.label}` : `Collapse ${g.label}`}
                                  title={isCollapsed ? 'Expand components' : 'Collapse components'}
                                >
                                  <Icon name={isCollapsed ? 'chevron_right' : 'chevron_down'} size={12} />
                                </button>
                                <Icon name={g.kind === 'bundle' ? 'package' : 'box'} size={13} style={{ color: 'var(--text2)', flexShrink: 0 }} />
                                <span style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.25 }}>{g.label}</span>
                              </span>
                              <span style={{ display: 'block', marginTop: 1, marginLeft: 28, fontSize: 'var(--t-th)', color: 'var(--text2)' }}>
                                {g.kind === 'bundle'
                                  ? `Bundle · ${g.lines.length} component${g.lines.length === 1 ? '' : 's'}${isCollapsed ? ' (collapsed)' : ''}`
                                  : `${g.lines.length} units${isCollapsed ? ' (collapsed)' : ''}`}
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
                                title={parentPill.title}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 'var(--sp-xs)',
                                  height: 20,
                                  padding: '0 7px',
                                  borderRadius: 'var(--r-badge)',
                                  fontSize: 'var(--t-th)',
                                  fontWeight: 700,
                                  background: parentPill.bg,
                                  color: parentPill.fg,
                                }}
                              >
                                <Icon name={parentPill.icon} size={11} />
                                {parentPill.label}
                              </span>
                            </td>
                            <td style={{ ...td, width: 34, textAlign: 'right' }}>
                              <RowMenu label={`Actions for ${g.label}`} items={menuItems} />
                            </td>
                          </tr>
                        ) : null}
                        {(!nested || !isCollapsed) && g.lines.map((l) => equipmentRow(l, nested, g.label, nested ? undefined : menuItems))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </DataTableShell>
            )}

            {/* §39 — items / bundles / rental days / line subtotal. Packed,
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
                  <span style={{ color: 'var(--text2)' }}>Line Subtotal</span>
                  <span className="figure" style={{ fontWeight: 700, fontSize: 'var(--t-ui)' }}>
                    {formatMoney((pricing.equipmentSubtotalPaisa + pricing.bundleSubtotalPaisa + pricing.servicesSubtotalPaisa) as Paisa)}
                  </span>
                </span>
              )}
            </div>
          </Section>

          {!isPhone && (
            <div className="new-rental-stage-next" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }}>
              <Button
                variant="outline"
                onClick={() => {
                  setCurrentStep(1)
                  setOpen((p) => p.map((v, i) => (i === 0 || i === 1 ? true : v)))
                }}
                style={{ minHeight: 44 }}
              >
                ← Back to Client & Dates
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setCurrentStep(3)
                  setOpen((p) => p.map((v, i) => (i === 5 ? true : v)))
                }}
                style={{ minHeight: 44, padding: '0 24px', fontWeight: 600 }}
              >
                Continue to Pricing →
              </Button>
            </div>
          )}
        </div>

          <Section
            id="section-3"
            title={SECTIONS[3]}
            badge={
              crew.length > 0 ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 'var(--r-badge)',
                    background: 'var(--st-primary-bg)',
                    color: 'var(--st-primary-fg)',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {crew.length} {crew.length === 1 ? 'member' : 'members'}
                </span>
              ) : null
            }
            open={open[3] ?? false}
            onToggle={() => toggle(3)}
            summary={crew.length === 0 ? 'Optional / None' : `${crew.length} crew`}
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
              {(!liveCrew || liveCrew.length === 0) && (
                <p style={{ margin: '0 0 var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--warn-text)', lineHeight: 1.5 }}>
                  This is a <strong>sample roster</strong> — the people and the day rates they are priced at are invented in
                  the app, not read from the database. Adding someone puts their name, role and rate on this booking when it
                  is confirmed; it does not link a staff record, and it reserves nobody, because booking a crew member's own
                  calendar is not built yet.
                </p>
              )}
              <CrewSearch
                onBooking={crew}
                onAdd={addCrew}
                showRates={canCrewMoney}
                roster={liveCrew && liveCrew.length > 0 ? liveCrew : CREW_ROSTER}
              />
              <div style={{ minWidth: 0 }}>
                <DataTableShell ariaLabel="Assigned crew">
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
                                      style={{
                                        position: 'relative',
                                        width: 22,
                                        height: 22,
                                        display: 'grid',
                                        placeItems: 'center',
                                        borderRadius: 'var(--r-xs)',
                                        border: 'none',
                                        background: hasExtras ? 'var(--st-primary-bg)' : 'transparent',
                                        color: hasExtras ? 'var(--st-primary-fg)' : expanded ? 'var(--text)' : 'var(--muted)',
                                        cursor: 'pointer',
                                      }}
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
                                <td colSpan={7} style={{ ...td, background: 'var(--card2)', padding: '10px 12px' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(3, minmax(0, 180px))', gap: 12, alignItems: 'center' }}>
                                    <Field label="Overtime (Rs) *">
                                      <Input
                                        type="number"
                                        min={0}
                                        value={c.overtimePaisa > 0 ? c.overtimePaisa / 100 : ''}
                                        placeholder="0"
                                        onChange={(e) => updateCrewExtras(c.crewId, 'overtimePaisa', rupees(Math.max(0, Number(e.target.value) || 0)))}
                                        style={{ ...inputStyle, height: 32, fontSize: 'var(--t-meta)' }}
                                      />
                                    </Field>
                                    <Field label="Meals (Rs) *">
                                      <Input
                                        type="number"
                                        min={0}
                                        value={c.mealsPaisa > 0 ? c.mealsPaisa / 100 : ''}
                                        placeholder="0"
                                        onChange={(e) => updateCrewExtras(c.crewId, 'mealsPaisa', rupees(Math.max(0, Number(e.target.value) || 0)))}
                                        style={{ ...inputStyle, height: 32, fontSize: 'var(--t-meta)' }}
                                      />
                                    </Field>
                                    <Field label="Accommodation (Rs) *">
                                      <Input
                                        type="number"
                                        min={0}
                                        value={c.accommodationPaisa > 0 ? c.accommodationPaisa / 100 : ''}
                                        placeholder="0"
                                        onChange={(e) => updateCrewExtras(c.crewId, 'accommodationPaisa', rupees(Math.max(0, Number(e.target.value) || 0)))}
                                        style={{ ...inputStyle, height: 32, fontSize: 'var(--t-meta)' }}
                                      />
                                    </Field>
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
                </DataTableShell>
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
            badge={
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  borderRadius: 'var(--r-badge)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {deliveryType}
              </span>
            }
            open={open[4] ?? false}
            onToggle={() => toggle(4)}
            summary={clientPickup ? 'Client Pickup · Rs 0' : `Babin Delivery · ${canBookingMoney ? formatMoney(transportPaisa) : 'charged'}`}
          >
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(2, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
              {/* Left Column: Delivery Type & Dispatch Details */}
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

                {clientPickup ? (
                  <div
                    style={{
                      marginTop: 12,
                      padding: '12px 14px',
                      borderRadius: 'var(--r-btn)',
                      background: 'var(--card2)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      fontSize: 'var(--t-meta)',
                      color: 'var(--text2)',
                      lineHeight: 1.45,
                    }}
                  >
                    <span style={{ color: 'var(--muted)', display: 'inline-flex', marginTop: 1, flexShrink: 0 }}>
                      <Icon name="info" size={15} />
                    </span>
                    <div>
                      <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 2 }}>Client Warehouse Pickup</strong>
                      Equipment will be collected and returned at the warehouse by the client. No vehicle or driver is required.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
                    <Field label="Vehicle">
                      <Input
                        value={vehicle}
                        onChange={(e) => setVehicle(e.target.value)}
                        placeholder="Make and model, or the van's name"
                        style={inputStyle}
                      />
                    </Field>
                    <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 9 }}>
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
                    <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 9 }}>
                      <Field label="Delivery location">
                        <Input
                          value={pickupLocation}
                          onChange={(e) => setPickupLocation(e.target.value)}
                          placeholder="Address or venue for delivery"
                          style={inputStyle}
                        />
                      </Field>
                      <Field label="Collection location">
                        <Input
                          value={returnLocation}
                          onChange={(e) => setReturnLocation(e.target.value)}
                          placeholder="Address or venue for collection"
                          style={inputStyle}
                        />
                      </Field>
                    </div>
                    <Field label="Driver instructions">
                      <textarea
                        value={specialInstructions}
                        onChange={(e) => setSpecialInstructions(e.target.value)}
                        placeholder="Access, contact, parking, timing, or loading instructions"
                        rows={3}
                        style={{ ...inputStyle, minHeight: 76, padding: '9px 11px', resize: 'vertical', lineHeight: 1.45 }}
                      />
                    </Field>

                    {/* Return Pickup Logistics (§3.3 / §4.58)
                        Resolved: returnPickupChargePaisa is rolled into the pricing pipeline
                        and the booking transport total (delivery_charge). Logistics instructions,
                        pickup address, and timing are recorded in special_instructions and
                        return_location, and persisted in draft schema. */}
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      <Field label="Return Pickup Option">
                        <Select
                          value={returnPickupType}
                          onChange={(e) => setReturnPickupType(e.target.value as typeof returnPickupType)}
                          style={inputStyle}
                        >
                          {/* RULING 2026-09-22 session: explicit values — option text alone set the state to a display label, so the 'Babin Pickup' branch (address/time/fee) and the fee total never engaged, and the review summary printed the wrong line. */}
                          <option value="Client Return">Client Returns to Warehouse</option>
                          <option value="Babin Pickup">Babin Rentals Pickup from Location</option>
                        </Select>
                      </Field>
                      {returnPickupType === 'Babin Pickup' && (
                        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 9, marginTop: 9 }}>
                          <Field label="Pickup Address">
                            <Input
                              value={returnPickupAddress}
                              onChange={(e) => setReturnPickupAddress(e.target.value)}
                              placeholder="Address or venue for pickup"
                              style={inputStyle}
                            />
                          </Field>
                          <Field label="Return Pickup Time">
                            <Input
                              type="time"
                              value={returnPickupTime}
                              onChange={(e) => setReturnPickupTime(e.target.value)}
                              style={inputStyle}
                            />
                          </Field>
                          <Field label="Return Pickup Fee (Rs)">
                            <Input
                              type="number"
                              min={0}
                              value={returnPickupChargePaisa / 100}
                              onChange={(e) => setReturnPickupChargePaisa(rupees(Math.max(0, Number(e.target.value) || 0)))}
                              placeholder="Fee"
                              style={inputStyle}
                            />
                          </Field>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Transport Charges & Total */}
              <div style={{ ...moneyBlock, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={sub}>Transport Charges</h3>
                  {canBookingMoney ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 6 }}>
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
                  ) : (
                    <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                      Transport rates are hidden for your role.
                    </p>
                  )}

                  {clientPickup && (
                    <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                      Client Pickup forces delivery and fuel charges to Rs 0.
                    </p>
                  )}
                </div>

                {canBookingMoney && (
                  <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <MoneyRow label="Transport Total" value={formatMoney(transportPaisa)} strong />
                  </div>
                )}
              </div>
            </div>
          </Section>

        <div className="new-rental-stage new-rental-stage--pricing">
          {/* Kept deliberately. `WIREFRAME_RULINGS_2026-08-12.md` §1 names
              "New Rental's Pricing & Payments" among the sections that survive
              because no spec removes them in prose — the rail summarises this
              section, it does not replace it. */}
          {/* Part C — Pricing & Terms Simplification */}
          {canBookingMoney && (
            <Section
              id="section-5"
              title={SECTIONS[5]}
              badge={
                pricing.rentalTotalPaisa > 0 ? (
                  <span
                    className="figure"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 8px',
                      borderRadius: 'var(--r-badge)',
                      background: 'var(--st-success-bg)',
                      color: 'var(--st-success-fg)',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {formatMoney(pricing.rentalTotalPaisa)}
                  </span>
                ) : null
              }
              open={open[5] ?? true}
              onToggle={() => toggle(5)}
              summary={`${formatMoney(pricing.rentalTotalPaisa)} total`}
            >
              <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(2, minmax(0,1fr))' : '1fr', gap: 'var(--sp-md)' }}>
                {/* Column 1: Rental Charges Breakdown */}
                <div style={moneyBlock}>
                  <h3 style={sub}>Rental Charges</h3>
                  {[
                    { l: 'Equipment Rental', v: formatMoney(pricing.equipmentSubtotalPaisa) },
                    { l: 'Bundles', v: pricing.bundleSubtotalPaisa > 0 ? formatMoney(pricing.bundleSubtotalPaisa) : '—' },
                    { l: 'Sub-Rental', v: '—' },
                    { l: 'Services & custom lines', v: pricing.servicesSubtotalPaisa > 0 ? formatMoney(pricing.servicesSubtotalPaisa) : '—' },
                    ...(canCrewMoney ? [{ l: 'Crew Charges', v: pricing.crewSubtotalPaisa > 0 ? formatMoney(pricing.crewSubtotalPaisa) : '—' }] : []),
                    { l: 'Transport', v: pricing.deliverySubtotalPaisa > 0 ? formatMoney(pricing.deliverySubtotalPaisa) : '—' },
                  ].map((r) => (
                    <MoneyRow key={r.l} label={r.l} value={r.v} {...(r.v === '—' ? { tone: 'var(--muted)' } : {})} />
                  ))}
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
                    <MoneyRow label="Subtotal" value={formatMoney(pricing.grossSubtotalPaisa)} />
                    <MoneyRow
                      label={
                        pricing.discounts.appliedPercent > 0
                          ? `Discount (${pricing.discounts.appliedPercent}%${pricing.discounts.capped ? ' - CAPPED' : ''})`
                          : 'Discount'
                      }
                      value={pricing.discounts.discountPaisa > 0 ? `− ${formatMoney(pricing.discounts.discountPaisa)}` : '—'}
                      {...(pricing.discounts.discountPaisa > 0 ? { tone: 'var(--danger-text)' } : {})}
                    />
                    <MoneyRow label="Taxable Amount" value={formatMoney(pricing.taxableSubtotalPaisa)} />
                    <MoneyRow
                      label={vatOn ? `VAT (${pricing.vatRatePercent}%)` : 'VAT — off for this booking'}
                      value={vatOn ? formatMoney(pricing.vatPaisa) : '—'}
                      {...(vatOn ? {} : { tone: 'var(--muted)' })}
                    />
                  </div>
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <MoneyRow label="RENTAL TOTAL" value={formatMoney(pricing.rentalTotalPaisa)} big />
                  </div>
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <MoneyRow
                      label="Security Deposit (Refundable)"
                      value={formatMoney(pricing.securityDeposit.requiredPaisa)}
                      tone="var(--text2)"
                    />
                    <p style={{ margin: '2px 0 8px', fontSize: '11px', color: 'var(--muted)' }}>
                      Held as a separate liability guarantee. Not taxable, not rental revenue.
                    </p>
                    <MoneyRow
                      label={`Advance Required (${pricing.advanceRequiredPaisa === pricing.rentalTotalPaisa && pricing.rentalTotalPaisa <= 500000 ? '100%' : pricing.rentalTotalPaisa <= 1000000 ? 'Rs 5,000' : '50%'})`}
                      value={formatMoney(pricing.advanceRequiredPaisa)}
                      tone="var(--st-primary-fg)"
                      strong
                    />
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--muted)' }}>
                      Tier policy: ≤ Rs 5,000 (100%) · ≤ Rs 10,000 (Rs 5,000) · &gt; Rs 10,000 (50%)
                    </p>
                  </div>
                </div>

                {/* Column 2: Discounts, VAT & Security Deposit Policy */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
                  <div style={moneyBlock}>
                    <h3 style={sub}>Discounts & Taxes</h3>
                    <div style={{ marginTop: 8 }}>
                      <Field label="Manual Discount % *">
                        <Input
                          type="number"
                          min={0}
                          max={DISCOUNT_STACKING_CAP_PERCENT}
                          value={discountPct}
                          onChange={(e) => setDiscountPct(Math.min(DISCOUNT_STACKING_CAP_PERCENT, Math.max(0, Number(e.target.value) || 0)))}
                          style={inputStyle}
                        />
                      </Field>
                      <div style={{ marginTop: 8 }}>
                        <DiscountChips
                          percent={discountPct}
                          onPercent={setDiscountPct}
                          amount={formatMoney(pricing.discounts.discountPaisa)}
                          onSelectPreset={(pct, reason) => {
                            setDiscountPct(pct)
                            if (reason && (!manualDiscountReason || manualDiscountReason.trim() === '')) {
                              setManualDiscountReason(reason)
                            }
                          }}
                        />
                      </div>

                      {discountPct > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                          <Field label="Discount Reason *">
                            <Input
                              value={manualDiscountReason}
                              onChange={(e) => setManualDiscountReason(e.target.value)}
                              placeholder="e.g. Director courtesy"
                              style={inputStyle}
                            />
                          </Field>
                          <Field label="Authorized By *">
                            <Input
                              value={manualDiscountAuthorizedBy}
                              onChange={(e) => setManualDiscountAuthorizedBy(e.target.value)}
                              placeholder="e.g. Babin"
                              style={inputStyle}
                            />
                          </Field>
                        </div>
                      )}

                      {/* Women DoP / Director toggle */}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer', fontSize: 'var(--t-meta)' }}>
                        <input
                          type="checkbox"
                          checked={womenDopEligible}
                          onChange={(e) => setWomenDopEligible(e.target.checked)}
                          style={{ cursor: 'pointer', width: 16, height: 16 }}
                        />
                        <span>
                          <strong>Women DoP / Director (+5% discount)</strong>
                          <span style={{ display: 'block', color: 'var(--muted)', fontSize: '11px' }}>
                            Encouraging women cinematographers & filmmakers in Nepal.
                          </span>
                        </span>
                      </label>

                      {/* Student bundle indicator */}
                      {isStudentBundle && (
                        <div style={{ marginTop: 10, padding: '6px 10px', borderRadius: 'var(--r-btn)', background: 'var(--st-info-bg, #eff6ff)', color: 'var(--st-info-fg, #1e40af)', fontSize: '12px' }}>
                          <Icon name="info" size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                          Student/College bundle detected — subsidized flat rate lines are protected from stacking discounts.
                        </div>
                      )}

                      {/* Promo code */}
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                        <Field label="Promo Code *">
                          <div style={{ display: 'flex', gap: 8 }}>
                            <Input
                              value={promoCodeInput}
                              onChange={(e) => {
                                setPromoCodeInput(e.target.value.toUpperCase())
                                setPromoNotice(null)
                              }}
                              placeholder="e.g. NEPALFILM, MONSOON26"
                              style={{ ...inputStyle, textTransform: 'uppercase' }}
                            />
                            <Button
                              variant="secondary"
                              type="button"
                              onClick={() => {
                                const code = promoCodeInput.trim().toUpperCase()
                                if (!code) {
                                  setPromoNotice({ tone: 'danger', text: 'Enter a promo code.' })
                                  return
                                }
                                const promo = PROMO_CODES[code]
                                if (!promo) {
                                  setPromoNotice({ tone: 'danger', text: `Promo code "${code}" is invalid or expired.` })
                                  return
                                }
                                if (!promo.active) {
                                  setPromoNotice({ tone: 'danger', text: `Promo code "${code}" is no longer active.` })
                                  return
                                }
                                if (pickupAt) {
                                  const pickupIso = pickupAt.toISOString()
                                  if (promo.validFrom && pickupIso < promo.validFrom) {
                                    setPromoNotice({ tone: 'danger', text: `Promo code "${code}" is not valid until ${promo.validFrom}.` })
                                    return
                                  }
                                  if (promo.validTo && pickupIso > promo.validTo) {
                                    setPromoNotice({ tone: 'danger', text: `Promo code "${code}" expired on ${promo.validTo}.` })
                                    return
                                  }
                                }
                                if (promo.minSpendPaisa && pricing.grossSubtotalPaisa < promo.minSpendPaisa) {
                                  setPromoNotice({
                                    tone: 'danger',
                                    text: `Promo "${code}" requires minimum rental spend of ${formatMoney(promo.minSpendPaisa)}.`,
                                  })
                                  return
                                }
                                setPromoCodeApplied(code)
                                setPromoNotice({
                                  tone: 'success',
                                  text: `Promo "${code}" applied: ${promo.discountPercent}% off${promo.description ? ` (${promo.description})` : ''}.`,
                                })
                              }}
                            >
                              Apply
                            </Button>
                            {promoCodeApplied && (
                              <Button
                                variant="ghost"
                                type="button"
                                onClick={() => {
                                  setPromoCodeApplied(null)
                                  setPromoCodeInput('')
                                  setPromoNotice(null)
                                }}
                              >
                                Clear
                              </Button>
                            )}
                          </div>
                        </Field>
                        {promoNotice && (
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: '12px',
                              color: promoNotice.tone === 'success' ? 'var(--st-success-fg, #065f46)' : 'var(--danger-text)',
                            }}
                          >
                            {promoNotice.text}
                          </div>
                        )}
                      </div>

                      {/* Stacking cap indicator */}
                      {pricing.discounts.capped && (
                        <div style={{ marginTop: 10, padding: '6px 10px', borderRadius: 'var(--r-btn)', background: 'var(--st-warning-bg, #fffbeb)', color: 'var(--st-warning-fg, #92400e)', fontSize: '12px' }}>
                          <Icon name="alert_triangle" size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                          Discounts capped at 25% maximum per company policy.
                        </div>
                      )}

                      {/* Validation errors */}
                      {pricing.discounts.validationErrors.length > 0 && (
                        <div style={{ marginTop: 9, padding: 10, borderRadius: 'var(--r-btn)', background: 'var(--st-danger-bg)' }}>
                          {pricing.discounts.validationErrors.map((err, i) => (
                            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--st-danger-fg)', lineHeight: 1.4 }}>
                              <Icon name="error" size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                              {err}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      <VatToggle ratePercent={vatRatePercent} on={vatOn} onChange={setVatOn} />
                    </div>
                  </div>

                  {/* Security Deposit Block */}
                  <div style={moneyBlock}>
                    <h3 style={sub}>Security Deposit</h3>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                      <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Recommended Deposit</span>
                      <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600 }}>{formatMoney(pricing.securityDeposit.recommendedPaisa)}</span>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer', fontSize: 'var(--t-meta)' }}>
                      <input
                        type="checkbox"
                        checked={manualDepositOverride}
                        onChange={(e) => {
                          setManualDepositOverride(e.target.checked)
                          if (!e.target.checked) {
                            setManualDepositAmount('')
                            setDepositOverrideReason('')
                            setDepositAuthorizedBy('')
                          } else {
                            setManualDepositAmount(String(toRupees(pricing.securityDeposit.recommendedPaisa)))
                          }
                        }}
                        style={{ cursor: 'pointer', width: 16, height: 16 }}
                      />
                      <span>Manual Deposit Override</span>
                    </label>

                    {manualDepositOverride && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <Field label="Override Amount (Rs) *">
                          <Input
                            type="number"
                            min={0}
                            value={manualDepositAmount}
                            onChange={(e) => setManualDepositAmount(e.target.value)}
                            placeholder="0"
                            style={inputStyle}
                          />
                        </Field>
                        <Field label="Override Reason *">
                          <Input
                            value={depositOverrideReason}
                            onChange={(e) => setDepositOverrideReason(e.target.value)}
                            placeholder="e.g. Low risk repeat client with corporate guarantee"
                            style={inputStyle}
                          />
                        </Field>
                        <Field label="Authorized By *">
                          <Input
                            value={depositAuthorizedBy}
                            onChange={(e) => setDepositAuthorizedBy(e.target.value)}
                            placeholder="e.g. Managing Director Babin"
                            style={inputStyle}
                          />
                        </Field>
                      </div>
                    )}

                    {pricing.securityDeposit.validationErrors.length > 0 && (
                      <div style={{ marginTop: 9, padding: 10, borderRadius: 'var(--r-btn)', background: 'var(--st-danger-bg)' }}>
                        {pricing.securityDeposit.validationErrors.map((err, i) => (
                          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--st-danger-fg)', lineHeight: 1.4 }}>
                            <Icon name="error" size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                            {err}
                          </div>
                        ))}
                      </div>
                    )}

                    <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
                      <strong>Security Deposit Policy:</strong> Any security deposit required is held as a separate liability guarantee.
                      It is never credited towards rental charges and does not reduce rental outstanding.
                    </p>
                    <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
                      <strong>Payment Recording:</strong> New Rental creates the booking reservation.
                      Advance payments and security deposits are officially recorded with receipt numbers directly on the <strong>Booking Detail</strong> page once the booking and invoice are created.
                    </p>
                  </div>
                </div>
              </div>
            </Section>
          )}

          {!isPhone && (
            <div className="new-rental-stage-next" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }}>
              <Button
                variant="outline"
                onClick={() => {
                  setCurrentStep(2)
                  setOpen((p) => p.map((v, i) => (i === 2 ? true : v)))
                }}
                style={{ minHeight: 44 }}
              >
                ← Back to Equipment
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setCurrentStep(4)
                  setOpen((p) => p.map(() => true))
                }}
                style={{ minHeight: 44, padding: '0 24px', fontWeight: 600 }}
              >
                Review Rental →
              </Button>
            </div>
          )}
        </div>

          {/* §58 — the footer reports the database-backed save state and
              nothing else. A fingerprint distinguishes the last successful
              snapshot from edits made after it, so "Draft saved" cannot remain
              on screen once the form diverges from the stored row. */}
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
                  <span style={{ fontWeight: 600, color: 'var(--text2)' }}>
                    {draftPersisted ? 'Unsaved changes' : 'Not saved'}
                  </span>{' '}
                  — {draftPersisted
                    ? 'save this draft again before leaving to keep the latest changes.'
                    : 'this booking exists only in this browser tab. It is written when you save the draft or confirm it.'}
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
          <div style={{ position: 'sticky', top: 12, alignSelf: 'start', maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto', paddingLeft: 14, marginLeft: -14 }}>
            <Rail width={300}>
              {bookingSummaryCard}
            </Rail>
          </div>
        )}
      </div>

      {!isDesktop && (
        <div className="new-rental-inline-summary" style={{ marginTop: 'var(--sp-md)' }}>
          {bookingSummaryCard}
        </div>
      )}

      {isPhone && (
        <nav className="new-rental-mobile-actions" style={{ bottom: BAR_BOX }} aria-label="Rental workflow actions">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 6, gap: 8 }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCancelIntent(draftPersisted ? 'cancel' : 'discard')}
              style={{ minHeight: 36, padding: '0 8px', fontSize: 'var(--t-meta)' }}
            >
              Cancel
            </Button>
            <span className="new-rental-mobile-state">{draftPersisted ? 'Draft' : 'New booking'}</span>
          </div>
          <button type="button" className="new-rental-compact-summary" onClick={() => document.getElementById('rail-booking-summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} aria-label="Review rental summary">
            <span>{client?.name ?? 'No client selected'} · {totalUnits} items</span>
            {canBookingMoney && <strong>{formatMoney(pricing.rentalTotalPaisa)}</strong>}
          </button>
          <div className="new-rental-mobile-action-buttons">
            <Button variant="outline" onClick={() => saveDraft()} disabled={saveState === 'saving'}>
              {saveState === 'saving' ? 'Saving…' : 'Save draft'}
            </Button>
            <Button
              variant="primary"
              onClick={confirmBooking}
              disabled={confirmBlocked || saveState === 'saving'}
              title={blockReasonText}
            >
              {saveState === 'saving' ? 'Confirming…' : 'Confirm booking'}
            </Button>
          </div>
        </nav>
      )}

      {!isPhone && !isDesktop && (
        <aside
          aria-label="Rental confirmation bar"
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 30,
            background: 'color-mix(in srgb, var(--surface, var(--card)) 86%, transparent)',
            borderTop: '1px solid color-mix(in srgb, var(--border) 75%, transparent)',
            padding: '12px 20px',
            margin: 'var(--sp-md) calc(-1 * var(--page-padding)) 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--sp-md)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 -8px 24px rgba(0, 0, 0, 0.08)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          {/* Left: Cancel & Save Draft */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button
              variant="outline"
              onClick={() => setCancelIntent(draftPersisted ? 'cancel' : 'discard')}
              style={{ minHeight: 44, padding: '0 16px' }}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => saveDraft()}
              disabled={saveState === 'saving'}
              style={{ minHeight: 44, padding: '0 16px', fontWeight: 600 }}
            >
              {saveState === 'saving' ? 'Saving…' : 'Save Draft'}
            </Button>
          </div>

          {/* Middle: Clean notices only (summary stats live in right rail) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)' }}>
            {blockingNotices.length > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 12px',
                  borderRadius: 'var(--r-badge)',
                  background: 'var(--st-danger-bg)',
                  border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
                  color: 'var(--st-danger-fg)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                }}
              >
                <Icon name="alert_triangle" size={14} />
                {blockingNotices.length} blocking {blockingNotices.length === 1 ? 'item' : 'items'}
              </span>
            )}
          </div>

          {/* Confirm is always available while the booking stays on one page. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {canBookingMoney && <strong className="new-rental-footer-total">{formatMoney(pricing.rentalTotalPaisa)}</strong>}
            <Button
              variant="primary"
              onClick={confirmBooking}
              disabled={confirmBlocked || saveState === 'saving'}
              title={blockReasonText}
              style={{ minHeight: 44, padding: '0 20px', fontWeight: 600 }}
            >
              {saveState === 'saving' ? 'Confirming…' : 'Confirm Booking'}
            </Button>
          </div>
        </aside>
      )}

      <FooterNote extra={['Move between sections freely. Review the booking before confirming.']} />

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
        deleted, so this is the named terminal transition `CANCEL_RENTAL_DRAFT` with
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

      <ConfirmDialog
        isOpen={exitPrompt === 'unsaved-new'}
        onClose={() => setExitPrompt(null)}
        onConfirm={() => {
          setExitPrompt(null)
          doExit()
        }}
        title="Discard this booking?"
        description="Nothing has been saved yet. Leaving will discard what is on screen."
        confirmLabel="Discard and leave"
        cancelLabel="Keep editing"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={exitPrompt === 'unsaved-edits'}
        onClose={() => setExitPrompt(null)}
        onConfirm={() => {
          setExitPrompt(null)
          doExit()
        }}
        title="Unsaved changes on draft"
        description="You have unsaved changes on this draft. Would you like to leave without saving? Your last saved draft version will remain intact."
        confirmLabel="Leave without saving"
        cancelLabel="Stay here"
        variant="default"
      />

      {/* Confirmed Booking Success Modal */}
      {confirmedSuccess && (
        <Modal
          isOpen={Boolean(confirmedSuccess)}
          onClose={() => setConfirmedSuccess(null)}
          title="Booking Confirmed!"
          size="md"
        >
          <div style={{ textAlign: 'center', padding: '16px 8px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'var(--st-success-bg, #ecfdf5)',
                color: 'var(--st-success-fg, #065f46)',
                marginBottom: 16,
              }}
            >
              <Icon name="check" size={28} />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700 }}>
              Rental {confirmedSuccess.bookingNo} Confirmed
            </h3>
            <p style={{ margin: '0 0 20px', color: 'var(--text2)', fontSize: 'var(--t-body)', lineHeight: 1.5 }}>
              The booking has been successfully recorded in the database and inventory has been reserved.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '0 auto' }}>
              <Button
                variant="primary"
                onClick={() => navigate(`/rentals/${confirmedSuccess.bookingNo}`)}
              >
                Open Rental Detail
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate(`/rentals/${confirmedSuccess.bookingNo}/packing`)}
              >
                Start Packing
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate('/rentals')}
              >
                Back to Rentals List
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </PageShell>
  )
}

export { NewRental }
