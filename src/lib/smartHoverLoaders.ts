/**
 * Smart Hover preview loaders — §69 preview APIs mapped to live gated queries.
 *
 * Law 1: engines own logic, components only present. This module reads from
 * `lib/queries/*` and builds the preview payloads in `previewTypes.ts` shapes.
 * Money-blind roles receive clearance-only payloads (no amounts) per §68.
 */

import { IS_MOCK, supabase } from './supabase'
import { formatMoney, type Paisa } from './money'
import { toBs, formatBs, formatAdDateTime, formatBookingHoverDateTime, formatAd } from './bs'
import { canViewMoneyField } from './fieldGating'
import {
  fetchFloorBooking,
  listBookings,
  type FloorBooking,
  type FloorLine,
} from './queries/bookings'
import {
  getClientPreviewRecord,
} from './queries/clients'
import {
  getAssetDetail,
} from './queries/inventory'
import { equipmentBookingRelations } from './queries/equipmentRelations'
import { getDocumentPreviewRecord } from './queries/documents'
import { listInvoices, paymentsForBooking, paymentsForClient, paymentsForInvoice, listPayments, type PaymentListRow } from './queries/finance'
import type { GateContext } from './fieldGating'
import {
  type ClientPreview,
  type EquipmentPreview,
  type RentalPreview,
  type InvoicePreview,
  type DocumentPreview,
  type PaymentPreview,
} from '../components/smart-hover/previewTypes'
import {
  type PaymentTransaction,
  type PackingLine,
  type RentalReadiness,
  packingProgress,
  summarizeRentalPayments,
} from './smartHover'
import { rentalDaysBetween } from './rentalDays'

/* ── helpers ──────────────────────────────────────────────────────────────── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function moneyOrNull(paisa: Paisa | null, canSee: boolean): number | undefined {
  return canSee && paisa !== null ? paisa : undefined
}

function adToBs(dateAd: string | null | undefined): string | undefined {
  if (!dateAd) return undefined
  const d = new Date(dateAd)
  if (isNaN(d.getTime())) return undefined
  const bs = toBs(d)
  return bs ? formatBs(bs) : undefined
}

function adWithBs(dateAd: string | null | undefined): string {
  if (!dateAd) return 'Not scheduled'
  const ad = formatAdDateTime(dateAd)
  const bs = adToBs(dateAd)
  return bs ? `${ad} · ${bs}` : ad
}

/* ── Client Preview Loader ────────────────────────────────────────────────── */

export async function loadClientPreview(
  clientRef: string,
  ctx: GateContext
): Promise<ClientPreview> {
  const canSeeMoney = canViewMoneyField(ctx, 'client-balance')
  const record = await getClientPreviewRecord(clientRef, ctx)
  if (!record) throw new Error(`Client not found: ${clientRef}`)
  const dbId = record.id

  const bookings = await listBookings({ chips: { client_id: [dbId] }, sort: { column: 'pickup_at', ascending: false }, page: { index: 0, size: 20 } })
  const current: ClientPreview['current'] = bookings.rows.filter((row) => !row.isCancelled && !row.isClosed).slice(0, 5).map((row) => ({
    rentalId: row.id,
    rentalNo: row.bookingNo,
    stage: row.stage,
    pickupAt: adWithBs(row.pickupAtAd),
    returnAt: adWithBs(row.returnAtAd),
    itemCount: row.itemCount,
  }))
  const history: ClientPreview['history'] = bookings.rows.filter((row) => row.isClosed || row.isCancelled).slice(0, 5).map((row) => ({
    rentalId: row.id,
    rentalNo: row.bookingNo,
    stage: row.stage,
    pickupAt: adWithBs(row.pickupAtAd),
    returnAt: adWithBs(row.returnAtAd),
    itemCount: row.itemCount,
  }))

  const payments = canSeeMoney && record.outstandingPaisa !== undefined && record.depositHeldPaisa !== undefined
    ? await loadClientPayments(dbId, record.outstandingPaisa, record.depositHeldPaisa) : undefined
  const clearance = canSeeMoney ? undefined : { paymentClear: null, depositClear: null }

  const notes = await loadEntityNotes('client', dbId, ctx)

  return {
    id: dbId,
    name: record.name,
    clientNo: record.code,
    ...(record.membership ? { memberTier: record.membership } : {}),
    restricted: record.blocked,
    ...(record.contact ? { contact: { email: record.contact.email ?? undefined, phone: record.contact.phone } } : {}),
    ...(record.sinceAd ? { since: adToBs(record.sinceAd) ?? record.sinceAd } : {}),
    current,
    history,
    ...(payments ? { payments } : {}),
    ...(clearance ? { clearance } : {}),
    // The directory's totalPaid is not revenue or average rental value.
    // Omit finance until a matching authorized aggregate exists.
    notes,
  }
}

async function loadClientPayments(clientId: string, outstandingPaisa: Paisa, depositsHeldPaisa: Paisa): Promise<ClientPreview['payments']> {
  const paymentsResult = await paymentsForClient(clientId)
  const paymentsList = await listPayments(paymentsResult)
  const history = paymentsList.rows.map(toPaymentTx)
  // The directory view owns balances. No overdue aggregate is supplied here.
  return { summary: { outstandingPaisa, depositsHeldPaisa }, history }
}

/* ── Equipment Preview Loader ─────────────────────────────────────────────── */

export async function loadEquipmentPreview(
  ref: string,
  ctx: GateContext
): Promise<EquipmentPreview> {
  const canSeeMoney = canViewMoneyField(ctx, 'asset-finance')
  const detail = await getAssetDetail(ref, { withMoney: canSeeMoney })
  if (!detail) throw new Error(`Equipment not found: ${ref}`)

  const product = detail.product
  const units = detail.units
  const matched = detail.matchedUnitId ? units.find(u => u.id === detail.matchedUnitId) : null
  const presentStates = Object.entries(product.unitsByState).filter(([, count]) => count > 0).map(([state]) => state)
  const statusLabel = matched?.state ?? (presentStates.length === 1 ? presentStates[0] : presentStates.length > 1 ? 'Mixed unit states' : product.trackingMode === 'Serialised' ? 'No units recorded' : 'Quantity tracked')

  const relations = await equipmentBookingRelations(product.id)
  const current: EquipmentPreview['current'] = relations
    .filter((row) => row.stage !== 'Closed' && row.stage !== 'Cancelled')
    .sort((a, b) => a.pickupAtAd.localeCompare(b.pickupAtAd))
    .slice(0, 8)
    .map((row) => ({ rentalId: row.bookingId, rentalNo: row.bookingNo, clientName: row.clientName, pickupAt: adWithBs(row.pickupAtAd), returnAt: adWithBs(row.returnAtAd), qty: row.qty }))
  const history: EquipmentPreview['history'] = relations
    .filter((row) => row.stage === 'Closed' || row.stage === 'Cancelled')
    .sort((a, b) => b.pickupAtAd.localeCompare(a.pickupAtAd))
    .slice(0, 8)
    .map((row) => ({ rentalId: row.bookingId, rentalNo: row.bookingNo, clientName: row.clientName, pickupAt: adWithBs(row.pickupAtAd), returnAt: adWithBs(row.returnAtAd) }))
  const packing = await loadEquipmentPacking(ref, ctx)

  const info = [
    { label: 'SKU', value: product.assetCode },
    { label: 'Category', value: product.category ?? '—' },
    { label: 'Brand / Model', value: `${product.brand ?? ''} ${product.model ?? ''}`.trim() || '—' },
    { label: 'Tracking', value: product.trackingMode },
    { label: 'Condition', value: matched?.condition ?? '—' },
    { label: 'Location', value: matched ? `${matched.rack ?? ''} · ${matched.shelf ?? ''} · ${matched.bin ?? ''}`.replace(/^ · | · $/g, '') : '—' },
  ].filter(f => f.value !== '—')

  const finance = canSeeMoney && product.dailyRate !== null ? [
    { label: 'Daily Rate', value: formatMoney(product.dailyRate) },
    { label: 'Replacement Value', value: product.replacementValue ? formatMoney(product.replacementValue) : '—' },
  ] : undefined

  return {
    id: product.id,
    name: product.name,
    assetCode: product.assetCode,
    ...(matched?.serialNo ? { serial: matched.serialNo } : {}),
    statusLabel: statusLabel ?? 'Status not verified',
    external: false,
    relationsLoaded: true,
    current,
    history,
    ...(packing ? { packing } : {}),
    info,
    ...(finance ? { finance } : {}),
    notes: await loadEntityNotes('equipment', product.id, ctx),
  }
}

async function loadEquipmentPacking(_ref: string, _ctx: GateContext): Promise<EquipmentPreview['packing']> {
  return undefined
}

/* ── Rental Preview Loader ────────────────────────────────────────────────── */

export async function loadRentalPreview(
  bookingRef: string,
  ctx: GateContext
): Promise<RentalPreview> {
  const canSeeMoney = canViewMoneyField(ctx, 'booking')
  const floor = await fetchFloorBooking(bookingRef)
  if (!floor) throw new Error(`Booking not found: ${bookingRef}`)
  const bookingRows = await listBookings({ chips: { id: [floor.id] }, ...(canSeeMoney ? { withTotalAmount: true, withDeposit: true } : {}) })
  const booking = bookingRows.rows[0]
  if (!booking) throw new Error(`Booking header unavailable: ${bookingRef}`)

  const readiness = await computeRentalReadiness(floor, ctx)
  const packingLines = floor.lines.flatMap(lineToPackingLines)
  const progress = packingProgress(packingLines)

  const payments = canSeeMoney && booking.totalAmount !== null && booking.totalAmount !== undefined
    ? await loadRentalPayments(floor.id, booking.totalAmount, booking.depositRequired)
    : undefined
  const clearance: { paymentClear: boolean | null; depositClear: boolean | null } | undefined = canSeeMoney
    ? undefined
    : { paymentClear: readiness.paymentReady, depositClear: readiness.depositReady }

  const notes = await loadEntityNotes('rental', floor.id, ctx)

  return {
    id: floor.id,
    rentalNo: floor.bookingNo,
    stage: floor.stage,
    clientName: floor.clientName ?? '—',
    clientId: booking.clientId,
    pickupAt: formatBookingHoverDateTime(floor.pickupAtAd),
    returnAt: formatBookingHoverDateTime(floor.returnAtAd),
    rentalDays: rentalDaysBetween(floor.pickupAtAd, floor.returnAtAd),
    readiness,
    equipment: floor.lines.map(l => ({ label: l.productName ?? '—', qty: l.qty, packed: l.units.every(u => u.packed) })),
    packing: { status: progress.status, lines: packingLines, updatedAt: undefined, updatedBy: undefined },
    ...(payments ? { payments } : {}),
    ...(clearance ? { clearance } : {}),
    notes,
  }
}

function lineToPackingLines(line: FloorLine): PackingLine[] {
  return line.units.map(u => ({
    id: u.id,
    label: line.productName ?? '—',
    serial: u.serial ?? u.assetTag,
    status: mapUnitStateToPacking(u.unitState, u.packed, u.damaged),
    qtyRequired: 1,
    qtyPacked: u.packed ? 1 : 0,
  }))
}

function mapUnitStateToPacking(state: string, packed: boolean, damaged: boolean): PackingLine['status'] {
  if (damaged) return 'damaged'
  if (packed) return 'packed'
  if (state === 'Missing') return 'missing'
  if (state === 'Returned') return 'required'
  return 'required'
}

async function computeRentalReadiness(floor: FloorBooking, _ctx: GateContext): Promise<RentalReadiness> {
  const allUnits = floor.lines.flatMap(l => l.units)
  const incompleteRelations = floor.linesPresence === 'absent' || floor.lines.some(l => l.unitsPresence === 'absent')
  const unitEvidenceComplete = !incompleteRelations && floor.lines.length > 0 && floor.lines.every((line) => line.trackingMode === 'Serialised' && line.units.length >= line.qty)
  // Quantity/consumable lines use a different reservation path. This read
  // cannot establish their booking-level gate or packing completion.
  const equipmentReady = !unitEvidenceComplete || allUnits.length === 0
    ? null
    : allUnits.every(u => u.assetId !== null)
  const packingReady = !unitEvidenceComplete || allUnits.length === 0
    ? null
    : allUnits.every(u => u.packed)
  // Floor rows cannot establish ledger, contract, or client-flag gates.
  // Unknown must never become a passed gate or an asserted blocker.
  const paymentReady = null
  const depositReady = null
  const contractReady = null
  const clientAllowed = null

  return { equipmentReady, packingReady, paymentReady, depositReady, contractReady, clientAllowed }
}

async function loadRentalPayments(bookingId: string, grandTotal: Paisa, depositRequired: Paisa | null): Promise<RentalPreview['payments']> {
  const filters = paymentsForBooking(bookingId)
  const paymentsList = await listPayments(filters)
  const txs = paymentsList.rows.map(toPaymentTx)
  const summary = summarizeRentalPayments({ grandTotalPaisa: grandTotal, transactions: txs, ...(depositRequired !== null ? { depositRequiredPaisa: depositRequired } : {}) })
  return { summary, history: txs, depositHeldVerified: false }
}

/* ── Invoice Preview Loader ───────────────────────────────────────────────── */

export async function loadDocumentPreview(ref: string, ctx: GateContext): Promise<DocumentPreview> {
  const record = await getDocumentPreviewRecord(ref, canViewMoneyField(ctx, 'booking'), ctx.role)
  if (!record) throw new Error(`Document not found or unavailable: ${ref}`)
  return {
    ...record,
    createdAt: adWithBs(record.createdAt),
    signedAt: record.signedAt ? adWithBs(record.signedAt) : null,
  }
}

export async function loadInvoicePreview(
  invoiceRef: string,
  ctx: GateContext
): Promise<InvoicePreview> {
  const canSeeMoney = canViewMoneyField(ctx, 'booking')
  if (!canSeeMoney) throw new Error('Invoice preview is restricted for this role and context')
  const isUuid = UUID_RE.test(invoiceRef)
  const filters = isUuid ? { chips: { id: [invoiceRef] } } : ({ search: invoiceRef, searchColumns: ['invoice_no'] } as const)
  const result = await listInvoices(filters)
  const invoice = result.rows.find((row) => row.invoiceNo === invoiceRef || row.id === invoiceRef) ?? (result.rows.length === 1 ? result.rows[0] : undefined)
  if (!invoice) throw new Error(`Invoice not found: ${invoiceRef}`)

  const recent = await loadInvoicePayments(invoice.id, canSeeMoney)

  return {
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    clientName: invoice.clientName,
    rentalNo: invoice.bookingNo,
    invoiceDate: formatAd(new Date(invoice.issueDateAd)),
    dueDate: formatAd(new Date(invoice.dueDateAd)),
    ...(canSeeMoney ? {
      subtotalPaisa: moneyOrNull(invoice.subtotal, true),
      vatPaisa: moneyOrNull(invoice.vatAmount, true),
      totalPaisa: moneyOrNull(invoice.totalAmount, true),
      paidPaisa: moneyOrNull(invoice.paidAmount, true),
      duePaisa: moneyOrNull(invoice.outstandingAmount, true),
    } : {}),
    state: invoice.status,
    // An invoice balance alone cannot certify the handover gate.
    handoverClear: null,
    recent,
  }
}

async function loadInvoicePayments(invoiceId: string, canSeeMoney: boolean): Promise<PaymentTransaction[]> {
  if (!canSeeMoney) return []
  const filters = paymentsForInvoice(invoiceId)
  const paymentsList = await listPayments(filters)
  return paymentsList.rows.map(toPaymentTx)
}

export async function loadPaymentPreview(paymentRef: string, ctx: GateContext): Promise<PaymentPreview> {
  if (!canViewMoneyField(ctx, 'booking')) throw new Error('Payment preview is restricted for this role and context')
  const isUuid = UUID_RE.test(paymentRef)
  const result = await listPayments(isUuid ? { chips: { id: [paymentRef] } } : { search: paymentRef, searchColumns: ['payment_no'] })
  const row = result.rows.find((item) => item.paymentNo === paymentRef || item.id === paymentRef) ?? (result.rows.length === 1 ? result.rows[0] : undefined)
  if (!row) throw new Error(`Payment not found: ${paymentRef}`)
  return {
    id: row.id,
    paymentNo: row.paymentNo,
    bookingNo: row.bookingNo,
    clientId: row.clientId,
    clientName: row.clientName,
    invoiceNo: row.invoiceNo,
    amountPaisa: row.amount,
    type: row.paymentType,
    status: row.status,
    method: row.channelGroup,
    paidAt: row.paymentDateAd,
    reference: row.transactionRef,
  }
}

/* ── Shared helpers ───────────────────────────────────────────────────────── */

function toPaymentTx(row: PaymentListRow): PaymentTransaction {
  const paymentType = String(row.paymentType)
  if (paymentType !== 'Advance Payment' && paymentType !== 'Rental' && paymentType !== 'Refund') throw new Error(`Unsupported payment type: ${paymentType}`)
  const method = mapChannelToMethod(row.channelGroup)
  const status = row.status === 'Received' ? 'completed' : row.status === 'Failed' ? 'failed' : row.status === 'Refunded' ? 'refunded' : 'cancelled'
  return {
    id: row.id,
    clientId: row.clientId,
    ...(row.bookingId ? { rentalId: row.bookingId } : {}),
    rentalNo: row.bookingNo,
    ...(row.invoiceId ? { invoiceId: row.invoiceId } : {}),
    type: paymentType === 'Refund' ? 'refund' : 'rental_payment',
    status,
    ...(method ? { method } : {}),
    amountPaisa: row.amount,
    ...(row.transactionRef ? { reference: row.transactionRef } : {}),
    ...(row.paymentDateAd ? { paidAt: row.paymentDateAd } : {}),
    createdAt: row.createdAtAd ?? new Date().toISOString(),
    ...(row.receivedById ? { createdBy: row.receivedById } : {}),
  }
}

function mapChannelToMethod(channel: string | null): PaymentTransaction['method'] | undefined {
  switch (channel) {
    case 'Cash': return 'cash'
    case 'Digital wallets': return 'qr'
    case 'Bank': return 'bank_transfer'
    case 'Cards': return 'card'
    default: return undefined
  }
}

async function loadEntityNotes(entityType: 'client' | 'equipment' | 'rental', entityId: string, ctx: GateContext): Promise<ClientPreview['notes']> {
  if (IS_MOCK || ctx.role === 'Client') return []
  const noteTable = entityType === 'rental' ? 'booking_notes' : 'intel_entity_notes'
  const key = entityType === 'client' ? 'client_id' : entityType === 'equipment' ? 'product_id' : 'booking_id'
  const { data, error } = await supabase
    .from(noteTable)
    .select('id, body, visibility, created_at')
    .eq(key, entityId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw new Error(`Preview notes unavailable: ${error.message}`)
  return (data ?? []).map(n => ({
    id: n.id,
    at: n.created_at,
    by: 'Staff',
    text: n.body,
  }))
}

/* ── Preview loaders map ──────────────────────────────────────────────────── */

export const previewLoaders = {
  client: loadClientPreview,
  equipment: loadEquipmentPreview,
  rental: loadRentalPreview,
  invoice: loadInvoicePreview,
  document: loadDocumentPreview,
  payment: loadPaymentPreview,
} as const

export type PreviewLoaderKey = keyof typeof previewLoaders
