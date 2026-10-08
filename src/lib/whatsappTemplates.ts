/**
 * **The WhatsApp message registry — `WHATSAPP_LINKS_SPEC_v1.0` §2.**
 *
 * Every template is a **pure formatter**. It receives figures already read from
 * a canonical query and returns a string; it never fetches, never totals and
 * never derives a money figure of its own. That is Law 2 stated as a type: the
 * input objects below have no room for a number this module could invent, so a
 * wrong figure in a message is a wrong figure in the query that produced it,
 * which is where it can actually be fixed.
 *
 * The registry is **transport-agnostic on purpose** (spec §1, §6.3). Today the
 * only transport is a `wa.me` compose link; when the Communication Center's
 * Cloud API lands it becomes the second transport and these bodies migrate
 * unchanged.
 *
 * ## Law 6 is enforced here, not only on the button
 *
 * Three templates carry money — `payment_receipt`, `balance_due`,
 * `daily_digest`. Each is marked `money: true`, and {@link templatesForStage}
 * omits them for a money-blind role. Spec §4 requires that assertion at the
 * registry level rather than at the button, because a button is one screen's
 * decision and this list is every screen's. A money-blind session should also
 * never have been handed the figures in the first place — that is the data
 * layer's job — so this is the second of two independent gates, not the only
 * one.
 *
 * ## Language
 *
 * English first (ruled 31 Aug), with the courtesy frame the market expects:
 * `Namaste {firstName},` opening and `Dhanyabad,\n{businessName}` closing. The
 * festival calendar was ruled OUT entirely — there is deliberately no seasonal
 * greeting hook here for a later session to "just add".
 */

import { formatMoney, type Paisa } from './money'
import { formatAd, toBs, formatBs } from './bs'
import type { SystemRole } from '../types/database'
import { canViewMoney } from './rbac'

/**
 * The canonical six (`booking_stage`, 0015). Declared structurally so this
 * module does not depend on the generated database types — it is a formatter,
 * not a query.
 */
export type WaStage = 'Quote' | 'Booked' | 'Packed' | 'On Rent' | 'Returned' | 'Closed'

export type WaTemplateId =
  | 'booking_confirmed'
  | 'gear_ready'
  | 'pickup_tomorrow'
  | 'return_reminder'
  | 'overdue'
  | 'payment_receipt'
  | 'balance_due'
  | 'daily_digest'
  | 'dispatch_manifest'
  | 'return_receipt'

/* ────────────────────────────────────────────────────────────────────────────
   Formatting primitives
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * `"12 Sep 2026 (27 Bhadra)"` — AD with BS beside it (spec §2).
 *
 * The parenthetical is **dropped, not faked**, when `lib/bs` cannot vouch for
 * the day: `toBs` covers one anchored month and returns `null` outside it
 * (`BS_UNSUPPORTED_NOTE`). A guessed BS date inside a message to a client is a
 * wrong date in writing that we cannot retract, so the AD date stands alone
 * rather than carrying an invented Nepali one. The ` BS` suffix is suppressed
 * because the bracket already says what it is.
 */
export function adBs(iso: string): string {
  const ad = new Date(iso)
  if (Number.isNaN(ad.getTime())) return '—'
  const bs = toBs(ad)
  return bs ? formatAd(ad) + ' (' + formatBs(bs, { suffix: false }) + ')' : formatAd(ad)
}

/**
 * The client's first name for the greeting.
 *
 * A company booking ("Sagarmatha Pictures Pvt. Ltd.") has no first name, and
 * the first token is the right read in both cases — it is how the counter
 * already addresses them. Falls back to the whole string rather than to an
 * empty greeting.
 */
export function firstName(clientName: string): string {
  const first = clientName.trim().split(/\s+/)[0]
  return first && first.length > 0 ? first : clientName.trim()
}

/**
 * Money for a message body. `formatMoney` already carries the `Rs ` prefix and
 * omits decimals on a whole-rupee amount, which every engine total is
 * (`money.ts:toWholeRupee` rounds VAT) — so spec §4's "whole rupees, no paisa"
 * holds without this module suppressing a paisa that genuinely exists. A
 * template that hid a real 50 paisa from a receipt would be a small lie about
 * money, which Law 4's spirit does not allow even when the digits are tiny.
 */
const money = (p: Paisa): string => formatMoney(p)

/** Business identity every template closes with. */
export interface WaBusiness {
  businessName: string
  /** Only `overdue` uses it; still required, so a template cannot silently omit a contact route. */
  businessPhone: string
}

/* ────────────────────────────────────────────────────────────────────────────
   Template inputs — one shape per message
   ──────────────────────────────────────────────────────────────────────────── */

export interface WaBookingBase {
  clientName: string
  bookingNo: string
  /** ISO AD/UTC as stored (Law 7). Rendered in Kathmandu by `adBs`. */
  startIso: string
  endIso: string
}

export interface WaBookingConfirmed extends WaBookingBase {
  lineCount: number
  /** A few line descriptions for the summary. Empty is fine and prints nothing. */
  topLines: string[]
  total: Paisa
  /** Omitted as a LINE when absent or zero — never "Advance paid: Rs 0". */
  advance?: Paisa | null
  deposit?: Paisa | null
  pickupTime: string
}

export interface WaGearReady extends WaBookingBase {
  pickupWindow: string
}

export interface WaPickupTomorrow extends WaBookingBase {
  pickupTime: string
}

export interface WaReturnReminder extends WaBookingBase {
  returnTime: string
}

export type WaOverdue = WaBookingBase

export interface WaDispatchManifest extends WaBookingBase {
  readonly itemCount: number
  readonly topItems?: string[]
  readonly manifestUrl?: string | null
}

export interface WaReturnReceipt extends WaBookingBase {
  readonly itemCount: number
  readonly hasDamagedOrLost: boolean
  readonly damageCount?: number | undefined
  readonly lostCount?: number | undefined
  readonly depositRefundPaisa?: Paisa | null | undefined
  readonly balanceDuePaisa?: Paisa | null | undefined
  readonly receiptUrl?: string | null | undefined
}

export interface WaPaymentReceipt {
  clientName: string
  bookingNo: string
  amount: Paisa
  method: string
  /** Zero prints "fully paid"; a positive figure prints the remaining balance. */
  balance: Paisa
}

export interface WaBalanceDue {
  clientName: string
  bookingNo: string
  balance: Paisa
}

export interface WaDailyDigest {
  businessDateIso: string
  pickupsCount: number
  returnsCount: number
  newCount: number
  cashTotal: Paisa
  bankTotal: Paisa
  cardTotal: Paisa
  otherTotal: Paisa
  receivablesTotal: Paisa
  depositsHeld: Paisa
  /**
   * Already-worded variance ("balanced", "Rs 500 short"). The closing screen
   * owns that wording because it owns the count; this module formats nothing
   * it cannot see.
   */
  varianceLine: string
}

/* ────────────────────────────────────────────────────────────────────────────
   The templates
   ──────────────────────────────────────────────────────────────────────────── */

const open = (clientName: string): string => 'Namaste ' + firstName(clientName) + ','
const close = (b: WaBusiness): string => 'Dhanyabad,\n' + b.businessName

export function bookingConfirmed(i: WaBookingConfirmed, b: WaBusiness): string {
  /* "3 items — Alexa Mini, Sachtler tripod". The list is a courtesy, so when
     there is nothing to name the count stands alone rather than trailing an
     empty dash. */
  const itemsLine =
    i.topLines.length > 0
      ? i.lineCount + ' items — ' + i.topLines.join(', ')
      : i.lineCount + ' items'

  /* Both are conditional LINES, not conditional values: an advance of zero
     means none was taken, which is said by silence rather than by "Rs 0". */
  const advanceLine = i.advance != null && i.advance > 0 ? 'Advance paid: ' + money(i.advance) + '\n' : ''
  const depositLine = i.deposit != null && i.deposit > 0 ? 'Deposit: ' + money(i.deposit) + '\n' : ''

  return [
    open(i.clientName),
    '',
    'Your booking with ' + b.businessName + ' is confirmed. ✅',
    '',
    'Booking: ' + i.bookingNo,
    'Period: ' + adBs(i.startIso) + ' → ' + adBs(i.endIso),
    'Items: ' + itemsLine,
    'Total: ' + money(i.total),
    advanceLine + depositLine + 'Pickup from ' + i.pickupTime + ' at our Boudha office.',
    '',
    close(b),
  ].join('\n')
}

export function gearReady(i: WaGearReady, b: WaBusiness): string {
  return [
    open(i.clientName),
    '',
    'Your gear for booking ' + i.bookingNo + ' is packed and ready for pickup. 🎬',
    'Pickup window: ' + i.pickupWindow + ', ' + adBs(i.startIso) + '.',
    '',
    close(b),
  ].join('\n')
}

export function pickupTomorrow(i: WaPickupTomorrow, b: WaBusiness): string {
  return [
    open(i.clientName),
    '',
    'A reminder that your rental ' + i.bookingNo + ' starts tomorrow, ' + adBs(i.startIso) + '.',
    'Pickup from ' + i.pickupTime + '.',
    '',
    close(b),
  ].join('\n')
}

export function returnReminder(i: WaReturnReminder, b: WaBusiness): string {
  return [
    open(i.clientName),
    '',
    'Your rental ' + i.bookingNo + ' is due back on ' + adBs(i.endIso) + ' by ' + i.returnTime + '.',
    'Returning on time keeps your account in good standing.',
    '',
    close(b),
  ].join('\n')
}

export function overdue(i: WaOverdue, b: WaBusiness): string {
  return [
    open(i.clientName),
    '',
    'Booking ' + i.bookingNo + ' was due back on ' + adBs(i.endIso) + ' and is now overdue.',
    'Please return the equipment or call us at ' + b.businessPhone + ' to extend.',
    '',
    close(b),
  ].join('\n')
}

export function dispatchManifest(i: WaDispatchManifest, b: WaBusiness): string {
  const itemsLine =
    i.topItems && i.topItems.length > 0
      ? `${i.itemCount} items packed & verified (${i.topItems.join(', ')})`
      : `${i.itemCount} items packed & verified`

  const manifestDoc = i.manifestUrl ? `\n📄 View dispatch manifest:\n${i.manifestUrl}\n` : ''

  return [
    open(i.clientName),
    '',
    `Your equipment dispatch for Booking #${i.bookingNo} has left our warehouse. 📦`,
    '',
    `📦 ${itemsLine}.`,
    manifestDoc,
    'Please reply with "CONFIRMED" upon delivery inspection.',
    '',
    close(b),
  ].filter((line) => line !== null).join('\n')
}


export function returnReceipt(i: WaReturnReceipt, b: WaBusiness): string {
  const statusLine = i.hasDamagedOrLost
    ? `⚠️ Return logged with items flagged for review: ${[
        i.damageCount ? `${i.damageCount} damaged` : null,
        i.lostCount ? `${i.lostCount} missing` : null,
      ]
        .filter(Boolean)
        .join(', ')}.`
    : `✅ All ${i.itemCount} items returned in good order.`

  const depositLine =
    i.depositRefundPaisa != null
      ? i.depositRefundPaisa > 0
        ? `Deposit release: ${money(i.depositRefundPaisa)} refunded.`
        : 'Deposit held: fully reconciled against charges.'
      : null

  const balanceLine =
    i.balanceDuePaisa != null && i.balanceDuePaisa > 0
      ? `Outstanding balance: ${money(i.balanceDuePaisa)}.`
      : null

  const docLine = i.receiptUrl ? `📄 View return receipt:\n${i.receiptUrl}` : null

  return [
    open(i.clientName),
    '',
    `Your equipment return for Booking #${i.bookingNo} has been processed. 🎬`,
    '',
    statusLine,
    depositLine,
    balanceLine,
    docLine,
    '',
    close(b),
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

export function paymentReceipt(i: WaPaymentReceipt, b: WaBusiness): string {
  const balanceLine =
    i.balance > 0 ? 'Remaining balance: ' + money(i.balance) : 'Status: fully paid ✅'
  return [
    open(i.clientName),
    '',
    'Payment received — thank you. 🙏',
    '',
    'Booking: ' + i.bookingNo,
    'Amount: ' + money(i.amount) + ' (' + i.method + ')',
    balanceLine,
    '',
    close(b),
  ].join('\n')
}

export function balanceDue(i: WaBalanceDue, b: WaBusiness): string {
  return [
    open(i.clientName),
    '',
    'A reminder that booking ' + i.bookingNo + ' has an outstanding balance of ' + money(i.balance) + '.',
    'You can pay by cash or bank transfer at pickup or return.',
    '',
    close(b),
  ].join('\n')
}

/** Owner-to-owner: no greeting frame, because it is not a message to a client. */
export function dailyDigest(i: WaDailyDigest, b: WaBusiness): string {
  return [
    b.businessName + ' — ' + adBs(i.businessDateIso),
    '',
    'Out today: ' + i.pickupsCount + ' bookings',
    'Returned today: ' + i.returnsCount,
    'New bookings: ' + i.newCount,
    '',
    'Collected: ' +
      money(i.cashTotal) +
      ' cash · ' +
      money(i.bankTotal) +
      ' bank · ' +
      money(i.cardTotal) +
      ' card · ' +
      money(i.otherTotal) +
      ' other',
    'Outstanding: ' + money(i.receivablesTotal),
    'Deposits held: ' + money(i.depositsHeld),
    '',
    'Closing variance: ' + i.varianceLine,
  ].join('\n')
}

/* ────────────────────────────────────────────────────────────────────────────
   Stage-awareness (spec §3, §4)
   ──────────────────────────────────────────────────────────────────────────── */

export interface WaTemplateMeta {
  id: WaTemplateId
  /** What the overflow menu shows. */
  label: string
  /** Law 6 — omitted entirely for a money-blind role. */
  money: boolean
}

const REGISTRY: Readonly<Record<WaTemplateId, WaTemplateMeta>> = {
  booking_confirmed: { id: 'booking_confirmed', label: 'Send booking confirmation', money: false },
  gear_ready: { id: 'gear_ready', label: 'Send gear-ready notice', money: false },
  pickup_tomorrow: { id: 'pickup_tomorrow', label: 'Send pickup reminder', money: false },
  return_reminder: { id: 'return_reminder', label: 'Send return reminder', money: false },
  overdue: { id: 'overdue', label: 'Send overdue notice', money: false },
  payment_receipt: { id: 'payment_receipt', label: 'Send payment receipt', money: true },
  balance_due: { id: 'balance_due', label: 'Send balance reminder', money: true },
  daily_digest: { id: 'daily_digest', label: 'Send daily digest', money: true },
  dispatch_manifest: { id: 'dispatch_manifest', label: 'Send dispatch manifest', money: false },
  return_receipt: { id: 'return_receipt', label: 'Send return receipt', money: false },
}

export function templateMeta(id: WaTemplateId): WaTemplateMeta {
  return REGISTRY[id]
}

/** Every id in the registry, for tests and for the Law 6 sweep. */
export const ALL_TEMPLATE_IDS = Object.keys(REGISTRY) as WaTemplateId[]

/**
 * Which templates a booking may offer right now, most likely first (spec §3).
 *
 * Ordering is the point: the overflow's top entry should be the message the
 * staff member actually opened the menu to send. A **Quote offers nothing** —
 * there is no confirmed booking to write to a client about, and a "quote
 * follow-up" would be a CRM template, which v1 deliberately excludes.
 *
 * `Returned` and `Closed` offer only a money reminder, and only when one is
 * owed: chasing equipment that is already back is the single message most
 * likely to be sent by mistake, so the stage list simply cannot produce it.
 */
export function templatesForStage(args: {
  stage: WaStage
  role: SystemRole
  isOverdue?: boolean
  hasBalance?: boolean
}): WaTemplateMeta[] {
  const { stage, role, isOverdue = false, hasBalance = false } = args

  const ids: WaTemplateId[] = []
  switch (stage) {
    case 'Quote':
      break
    case 'Booked':
      ids.push('booking_confirmed', 'pickup_tomorrow')
      break
    case 'Packed':
      ids.push('gear_ready', 'dispatch_manifest', 'pickup_tomorrow')
      break
    case 'On Rent':
      ids.push('return_reminder', 'dispatch_manifest')
      break
    case 'Returned':
      ids.push('return_receipt')
      break
    case 'Closed':
      break
  }

  /* Overdue is a flag, not a stage — it rides on top of On Rent and takes the
     first slot, because once a booking is late it is the only message anyone
     opens this menu to send. */
  if (isOverdue) ids.unshift('overdue')

  if (hasBalance) ids.push('balance_due')

  const visible = ids.map((id) => REGISTRY[id])
  return canViewMoney(role) ? visible : visible.filter((t) => !t.money)
}
