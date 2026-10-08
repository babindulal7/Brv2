import { createAction, type ActionContext, type ActionConfig } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { idempotentInsert, generateClientUuid } from '../../lib/dataAccess'
import { supabase } from '../../lib/supabase'

/** A correction always names one immutable receipt; invoices are never a reversal target. */
export type RefundPaymentInput = {
  paymentId: string
  /** Amount to reverse in rupees. The database also caps cumulative reversals. */
  amount: number
  /** Law 4 requires a meaningful, durable correction reason. */
  reason: string
  /** Law 8 idempotency key. A caller may omit it only outside an interactive form. */
  clientUuid?: string
}

export type RefundPaymentResult = {
  success: true
  id: string
  reversalNo: string
  originalPaymentId: string
  amount: number
}

export const refundPaymentConfig: ActionConfig<RefundPaymentInput, RefundPaymentResult> = {
  name: 'REFUND_PAYMENT',
  // docs/PERMISSIONS.md F-a: Owner · Admin · Manager only.
  permissions: ['payment.reverse'],
  implemented: true,

  validate: (input) => {
    if (!input.paymentId?.trim()) throw new Error('Payment identifier is required to process a reversal.')
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error('Reversal amount must be a positive number greater than 0.')
    }
    if (!input.reason?.trim() || input.reason.trim().length < 10) {
      throw new Error('Reversal reason must be at least 10 characters (Law 4).')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const paymentId = input.paymentId.trim()
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('id, payment_no')
      .eq('id', paymentId)
      .maybeSingle()

    if (paymentError) throw new Error(`Could not read the original payment: ${paymentError.message}`)
    if (!payment) throw new Error('The original payment no longer exists or is not available to this session.')

    /*
     * `next_document_number` serializes allocation in Postgres. A retry can
     * consume a number before its idempotency key resolves, so gaps are normal;
     * duplicate correction rows are not.
     */
    const { data: reversalNo, error: numberError } = await supabase.rpc('next_document_number', {
      p_sequence_key: 'payment_reversal',
    })
    if (numberError) throw new Error(`Could not allocate a reversal number, so nothing was recorded: ${numberError.message}`)
    if (!reversalNo) throw new Error('next_document_number returned no reversal number, so nothing was recorded.')

    const now = new Date().toISOString()
    const result = await idempotentInsert('payment_reversals' as never, {
      client_uuid: input.clientUuid || generateClientUuid(),
      reversal_no: reversalNo as string,
      original_payment_id: payment.id,
      amount: input.amount,
      reason: input.reason.trim(),
      reversed_by: ctx.userId,
      approved_by: ctx.userId,
      reversed_at: now,
    } as never, { queueOnFailure: false })

    if (result.error) throw new Error(`Could not record the reversal: ${result.error.message}`)
    const persisted = result.data as { id?: string; reversal_no?: string } | null
    if (!persisted?.id || !persisted.reversal_no) {
      throw new Error('The reversal could not be confirmed as recorded. Nothing was reported as complete.')
    }

    return {
      result: {
        success: true,
        id: persisted.id,
        reversalNo: persisted.reversal_no,
        originalPaymentId: payment.id,
        amount: input.amount,
      },
      events: [{
        type: EVENT_TYPES.PAYMENT_REFUNDED,
        payload: {
          id: persisted.id,
          reversalNo: persisted.reversal_no,
          originalPaymentId: payment.id,
          amount: input.amount,
          reason: input.reason.trim(),
          timestamp: now,
          userId: ctx.userId,
        },
      }],
    }
  },
}

export const refundPayment = createAction<RefundPaymentInput, RefundPaymentResult>(refundPaymentConfig)
