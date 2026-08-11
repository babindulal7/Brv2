/**
 * Single Booking Query Engine — Law 2 (Single Query Rule)
 *
 * "One booking query serves every surface. Hard acceptance gate:
 * Two different screens rendering the same booking cannot disagree."
 *
 * ⚠⚠⚠ DO NOT USE THIS MODULE YET — WRONG TABLES ⚠⚠⚠
 * `fetchCanonicalBooking` currently selects BASE tables (`booking_lines`,
 * `security_deposits`, `invoices`, `payments` — not the `*_v` masking views
 * from 0019_column_level_money_masking.sql). Serving base tables would leak
 * money columns to roles the 0019 views exist to mask. This module is imported
 * by NOTHING (verified 10 Aug 2026) and MUST be repointed at the 0019 views
 * before first use. The repointing is deliberately not done here: nested-embed
 * behaviour (`bookings` → view joins) needs live-Supabase verification first.
 */

import { supabase } from './supabase'
import { calculatePrice, rupees, toRupees, type PriceBreakdown, type Paisa } from './money'
import { BOOKING_STATUS, type StatusMeta } from './workflow'
import type { BookingStage, DeliveryMethod, ItemQuantityState, LineKind } from '../types/database'

export interface CanonicalBookingLine {
  id: string
  lineKind: LineKind
  description: string
  quantity: number
  days: number
  dailyRate: Paisa
  discountPercent: number
  lineTotal: Paisa
  itemState: ItemQuantityState
}

export interface CanonicalClient {
  id: string
  clientNo: string
  fullName: string
  companyName: string | null
  email: string
  mobile: string
  panVatNo: string | null
  typeParent: 'Organisation' | 'Individual'
  isVip: boolean
  creditLimit: Paisa
}

export interface CanonicalDeposit {
  required: Paisa
  received: Paisa
  refunded: Paisa
  applied: Paisa
  pending: Paisa
}

export interface CanonicalBooking {
  id: string
  bookingNo: string
  stage: BookingStage
  stageNumber: number
  pickupDatetime: string
  returnDatetime: string
  days: number
  deliveryMethod: DeliveryMethod
  deliveryAddress: string | null
  projectTitle: string | null
  shootType: string | null
  location: string | null
  notes: string | null
  client: CanonicalClient
  lines: CanonicalBookingLine[]
  totals: PriceBreakdown
  deposit: CanonicalDeposit
  completionChecklist: {
    receiverVerified: boolean
    equipmentPacked: boolean
    documentsReady: boolean
    signaturesComplete: boolean
    itemsHandedOver: boolean
    outstandingPayment: Paisa
    depositPending: Paisa
  }
}

/**
 * 1-based ordinal over the canonical six — derived from workflow.ts §1.2's
 * `order` (the single source of stage order) rather than re-declared here.
 * Falls back to 1 (Quote) if the DB ever hands back a pre-0015 stage string
 * the cast at the call site let through.
 */
function stageNumberOf(stage: BookingStage): number {
  const meta: StatusMeta | undefined = BOOKING_STATUS[stage]
  return meta ? meta.order + 1 : 1
}

/**
 * Fetches canonical booking and computes all derived figures through the Financial Engine.
 */
export async function fetchCanonicalBooking(bookingIdOrNo: string): Promise<CanonicalBooking | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingIdOrNo)

  const query = supabase
    .from('bookings')
    .select(`
      *,
      clients (*),
      booking_lines (*),
      security_deposits (*),
      invoices (*),
      payments (*)
    `)

  const { data: booking, error } = isUuid
    ? await query.eq('id', bookingIdOrNo).maybeSingle()
    : await query.eq('booking_no', bookingIdOrNo).maybeSingle()

  if (error || !booking) {
    return null
  }

  // Aggregate line categories
  const lines: CanonicalBookingLine[] = ((booking.booking_lines as Array<Record<string, unknown>>) || []).map((l) => ({
    id: String(l.id),
    lineKind: l.line_kind as LineKind,
    description: String(l.description),
    quantity: Number(l.quantity) || 1,
    days: Number(l.days) || 1,
    dailyRate: rupees(Number(l.daily_rate) || 0),
    discountPercent: Number(l.discount_percent) || 0,
    lineTotal: rupees(Number(l.line_total) || 0),
    itemState: (l.item_state as ItemQuantityState) || 'Ready',
  }))

  let equipPaisa = 0
  let subRentalPaisa = 0
  let servicesPaisa = 0
  let crewPaisa = 0
  let transportPaisa = 0

  for (const line of lines) {
    const amount = toRupees(line.lineTotal)
    if (line.lineKind === 'Equipment Rental') equipPaisa += amount
    else if (line.lineKind === 'Sub-Rental') subRentalPaisa += amount
    else if (line.lineKind === 'Services') servicesPaisa += amount
    else if (line.lineKind === 'Crew Charges') crewPaisa += amount
    else if (line.lineKind === 'Transport') transportPaisa += amount
  }

  // Aggregate payments (immutable)
  const paymentsList = (booking.payments as Array<{ amount: number; status: string }>) || []
  const totalPaidRupees = paymentsList
    .filter((p) => p.status === 'Received')
    .reduce((sum, p) => sum + Number(p.amount), 0)

  // Invoice discount & VAT defaults
  const invoice = Array.isArray(booking.invoices) && booking.invoices.length > 0 ? booking.invoices[0] : null
  const discountPercent = invoice ? Number(invoice.discount_percent) || 0 : 0
  const vatPercent = invoice ? Number(invoice.vat_rate) || 13 : 13

  // Execute Financial Engine calculation order
  const totals = calculatePrice({
    equipment: rupees(equipPaisa),
    subRental: rupees(subRentalPaisa),
    services: rupees(servicesPaisa),
    crew: rupees(crewPaisa),
    /*
     * ⚠ `'Customer Pickup'` below is a **Postgres enum member, not UI copy.**
     *
     * `bookings.delivery_method` is the `delivery_method` enum:
     * 'Customer Pickup' | 'Babin Delivery' | 'Courier' | 'Third Party'
     * (`supabase/migrations/0001_enums.sql:34`, sibling `delivery_type` at :280,
     * mirrored at `src/types/database.ts:23`). 'Client Pickup' is NOT a member
     * and never has been, so a comparison against it can never be true.
     *
     * Law 17 ("the word customer appears nowhere in the UI") governs what the
     * operator READS — `NewRental.tsx` correctly labels this option
     * **Client Pickup** — but it does not govern what Postgres STORES. On
     * 11 Aug 2026 that screen rename leaked in here as an extra
     * `|| booking.delivery_method === 'Client Pickup'` disjunct. It was harmless
     * only because the real half still matched; its danger was as a booby trap.
     * The next reader "finishing the rename" deletes the 'Customer Pickup' half
     * as apparently stale, `transport` then stops being zeroed for client-pickup
     * bookings, and every one of them silently gains a transport charge in its
     * Rental Total — a money defect with no error anywhere to find it.
     *
     * So: do not rename this literal to match the label. Renaming it requires a
     * migration that ALTERs the enum (plus the `types/database.ts`,
     * `data/handover.ts` and `booqable/map/orders.ts` mirrors, and the stored
     * rows) — the coordinated rename `AUDIT_FINDINGS.md` P3 already logs.
     */
    transport: booking.delivery_method === 'Customer Pickup' ? rupees(0) : rupees(transportPaisa),
    discountPercent,
    vatPercent,
    payments: rupees(totalPaidRupees),
  })

  // Deposit Liability Isolation
  const depositRecord = Array.isArray(booking.security_deposits) && booking.security_deposits.length > 0
    ? booking.security_deposits[0]
    : null

  const depositReq = depositRecord ? Number(depositRecord.required_amount) || 0 : 0
  const depositRec = depositRecord ? Number(depositRecord.received_amount) || 0 : 0
  const depositRef = depositRecord ? Number(depositRecord.refunded_amount) || 0 : 0
  const depositApp = depositRecord ? Number(depositRecord.applied_amount) || 0 : 0
  const depositPending = Math.max(0, depositReq - depositRec)

  const clientData = booking.clients as Record<string, unknown>

  // Fallback 'Quote' per 0015: it is both bookings.stage's DB default and
  // where the retired 'Draft' maps (Draft → Quote + Flag 'Draft').
  const currentStage = (booking.stage as BookingStage) || 'Quote'

  return {
    id: String(booking.id),
    bookingNo: String(booking.booking_no),
    stage: currentStage,
    stageNumber: stageNumberOf(currentStage),
    pickupDatetime: String(booking.pickup_datetime),
    returnDatetime: String(booking.return_datetime),
    days: Number(booking.days) || 1,
    deliveryMethod: booking.delivery_method as DeliveryMethod,
    deliveryAddress: booking.delivery_address ? String(booking.delivery_address) : null,
    projectTitle: booking.project_title ? String(booking.project_title) : null,
    shootType: booking.shoot_type ? String(booking.shoot_type) : null,
    location: booking.location ? String(booking.location) : null,
    notes: booking.notes ? String(booking.notes) : null,
    client: {
      id: String(clientData.id),
      clientNo: String(clientData.client_no),
      fullName: String(clientData.full_name),
      companyName: clientData.company_name ? String(clientData.company_name) : null,
      email: String(clientData.email),
      mobile: String(clientData.mobile),
      panVatNo: clientData.pan_vat_no ? String(clientData.pan_vat_no) : null,
      typeParent: (clientData.type_parent as 'Organisation' | 'Individual') || 'Individual',
      isVip: Boolean(clientData.is_vip),
      creditLimit: rupees(Number(clientData.credit_limit) || 0),
    },
    lines,
    totals,
    deposit: {
      required: rupees(depositReq),
      received: rupees(depositRec),
      refunded: rupees(depositRef),
      applied: rupees(depositApp),
      pending: rupees(depositPending),
    },
    completionChecklist: {
      receiverVerified: true,
      equipmentPacked: true,
      documentsReady: true,
      signaturesComplete: true,
      // Pre-0015 this read On Rent | Completed | Closed; 0015 maps
      // Completed → Returned, so this is "On Rent or later" in the six.
      itemsHandedOver: currentStage === 'On Rent' || currentStage === 'Returned' || currentStage === 'Closed',
      outstandingPayment: totals.outstanding,
      depositPending: rupees(depositPending),
    },
  }
}
