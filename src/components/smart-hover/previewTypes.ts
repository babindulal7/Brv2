/**
 * Smart hover preview payloads — §70–§72.
 *
 * Loaders return only fields the caller's role may see (§68–§69):
 * money-blind callers receive clearance booleans, never amounts.
 */

import type { PackingLine, PackingStatus, PaymentTransaction, RentalPaymentSummary, RentalReadiness } from '../../lib/smartHover'

export interface ClientPreview {
  id: string
  name: string
  company?: string | undefined
  clientNo: string
  memberTier?: string | undefined
  restricted: boolean
  restrictionNote?: string | undefined
  contact?: { email?: string | undefined; phone?: string | undefined } | undefined
  since?: string | undefined
  current: Array<{
    rentalId: string
    rentalNo: string
    stage: string
    pickupAt: string
    returnAt: string
    itemCount: number
    packing?: { packed: number; total: number } | undefined
    paymentClear?: boolean | undefined
  }>
  history: Array<{ rentalId: string; rentalNo: string; stage: string; pickupAt: string; returnAt: string; itemCount: number }>
  payments?: { summary: { outstandingPaisa: number; depositsHeldPaisa: number; overduePaisa: number }; history: PaymentTransaction[] } | undefined
  /** Money-blind: operational clearance only, no amounts (§22). */
  clearance?: { paymentClear: boolean; depositClear: boolean } | undefined
  finance?: { revenuePaisa: number; avgPaisa: number; outstandingPaisa: number; creditLimitPaisa: number } | undefined
  notes: Array<{ id: string; at: string; by: string; text: string }>
}

export interface EquipmentPreview {
  id: string
  name: string
  assetCode: string
  serial?: string | undefined
  statusLabel: string
  external?: boolean | undefined
  current: Array<{
    rentalId: string
    rentalNo: string
    clientName: string
    pickupAt: string
    returnAt: string
    qty: number
    packingLabel?: string | undefined
  }>
  history: Array<{ rentalId: string; rentalNo: string; clientName: string; pickupAt: string; returnAt: string; note?: string | undefined }>
  packing?: { rentalId: string; rentalNo: string; lines: PackingLine[]; packedBy?: string | undefined; updatedAt?: string | undefined } | undefined
  info: Array<{ label: string; value: string }>
  finance?: Array<{ label: string; value: string }> | undefined
  notes: Array<{ id: string; at: string; by: string; text: string }>
}

export interface RentalPreview {
  id: string
  rentalNo: string
  stage: string
  clientName: string
  clientId: string
  pickupAt: string
  returnAt: string
  rentalDays: number
  readiness: RentalReadiness
  equipment: Array<{ label: string; qty: number; packed?: boolean | undefined }>
  packing: { status: PackingStatus; lines: PackingLine[]; updatedAt?: string | undefined; updatedBy?: string | undefined }
  payments?: { summary: RentalPaymentSummary; history: PaymentTransaction[] } | undefined
  clearance?: { paymentClear: boolean; depositClear: boolean } | undefined
  notes: Array<{ id: string; at: string; by: string; text: string }>
}

export interface InvoicePreview {
  id: string
  invoiceNo: string
  clientName: string
  rentalNo?: string | undefined
  invoiceDate: string
  dueDate: string
  subtotalPaisa?: number | undefined
  vatPaisa?: number | undefined
  totalPaisa?: number | undefined
  paidPaisa?: number | undefined
  duePaisa?: number | undefined
  state?: string | undefined
  handoverClear?: boolean | undefined
  recent: PaymentTransaction[]
}

export type AnyPreview = ClientPreview | EquipmentPreview | RentalPreview | InvoicePreview
