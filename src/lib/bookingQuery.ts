/**
 * Single Booking Query Engine — Law 2 (Single Query Rule)
 *
 * "One booking query serves every surface. Hard acceptance gate:
 * Two different screens rendering the same booking cannot disagree."
 */

import { supabase } from './supabase'
import { calculatePrice, rupees, toRupees, type PriceBreakdown, type Paisa } from './money'
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

  return {
    id: String(booking.id),
    bookingNo: String(booking.booking_no),
    stage: booking.stage as BookingStage,
    stageNumber: Number(booking.stage_number) || 1,
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
      itemsHandedOver: booking.stage === 'On Rent' || booking.stage === 'Completed' || booking.stage === 'Closed',
      outstandingPayment: totals.outstanding,
      depositPending: rupees(depositPending),
    },
  }
}
