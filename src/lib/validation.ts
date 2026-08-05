/**
 * Validation Engine — Law 9 & Causal Ordering
 *
 * Enforces business rules across booking creation, operations gates, and closure.
 */

export interface DateRangeValidation {
  valid: boolean
  days: number
  error: string | null
}

/**
 * Validates causal pickup/return timestamps in UTC/AD.
 */
export function validateRentalDates(pickupIso: string, returnIso: string): DateRangeValidation {
  const pickup = new Date(pickupIso)
  const returnDate = new Date(returnIso)

  if (isNaN(pickup.getTime()) || isNaN(returnDate.getTime())) {
    return { valid: false, days: 0, error: 'Invalid date format provided.' }
  }

  if (returnDate <= pickup) {
    return {
      valid: false,
      days: 0,
      error: 'Return date/time must be strictly after pickup date/time.',
    }
  }

  const diffMs = returnDate.getTime() - pickup.getTime()
  const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))

  return { valid: true, days, error: null }
}

/**
 * Validates Handover gate checklist
 */
export function validateHandoverReadiness(params: {
  equipmentPacked: boolean
  receiverVerified: boolean
  signaturesCollected: boolean
  depositPendingPaisa: number
  outstandingPaymentPaisa: number
  hasCreditOverride: boolean
}): { ready: boolean; blockingReasons: string[] } {
  const blockingReasons: string[] = []

  if (!params.equipmentPacked) {
    blockingReasons.push('Equipment packing has not been completed.')
  }
  if (!params.receiverVerified) {
    blockingReasons.push('Receiver identity has not been verified.')
  }
  if (!params.signaturesCollected) {
    blockingReasons.push('Handover signatures are incomplete.')
  }
  if (params.depositPendingPaisa > 0 && !params.hasCreditOverride) {
    blockingReasons.push('Security deposit is pending and no credit limit override exists.')
  }
  if (params.outstandingPaymentPaisa > 0 && !params.hasCreditOverride) {
    blockingReasons.push('Rental payment is outstanding and no credit limit override exists.')
  }

  return {
    ready: blockingReasons.length === 0,
    blockingReasons,
  }
}
