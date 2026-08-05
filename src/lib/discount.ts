/**
 * Discount Engine — Law 10
 *
 * "Discount > 10% needs reason ≥10 chars and a named approver;
 * 25% hard cap; no role bypass, including Owner."
 */

export interface DiscountValidationResult {
  valid: boolean
  requiresApproval: boolean
  error: string | null
}

/**
 * Validates discount parameters against Law 10.
 */
export function validateDiscount(
  percent: number,
  reason?: string | null,
  approverId?: string | null
): DiscountValidationResult {
  if (percent < 0) {
    return { valid: false, requiresApproval: false, error: 'Discount percent cannot be negative' }
  }

  if (percent === 0) {
    return { valid: true, requiresApproval: false, error: null }
  }

  if (percent > 25) {
    return {
      valid: false,
      requiresApproval: true,
      error: 'Discount exceeds 25% hard cap (Law 10). Maximum allowed is 25%.',
    }
  }

  if (percent > 10) {
    const cleanReason = (reason || '').trim()
    if (cleanReason.length < 10) {
      return {
        valid: false,
        requiresApproval: true,
        error: 'Discount >10% requires a detailed reason of at least 10 characters.',
      }
    }

    if (!approverId) {
      return {
        valid: false,
        requiresApproval: true,
        error: 'Discount >10% requires a named authorizing approver (Manager or Owner).',
      }
    }

    return { valid: true, requiresApproval: true, error: null }
  }

  // percent <= 10
  return { valid: true, requiresApproval: false, error: null }
}
