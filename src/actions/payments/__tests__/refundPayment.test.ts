import { describe, it, expect, beforeEach, vi } from 'vitest'
import { refundPaymentConfig, type RefundPaymentInput } from '../refundPayment'
import { EVENT_TYPES } from '../../../events/eventBus'

const db = vi.hoisted(() => {
  const payment = { id: '11111111-1111-4111-8111-111111111111', payment_no: 'PAY-2026-0001' }
  const state = { inserts: [] as Array<{ table: string; row: Record<string, unknown>; options?: unknown }> }
  const chain: Record<string, any> = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: payment, error: null }),
  }
  return {
    state,
    supabase: {
      from: () => chain,
      rpc: async () => ({ data: 'REV-2026-0001', error: null }),
    },
    idempotentInsert: async (table: string, row: Record<string, unknown>, options?: unknown) => {
      state.inserts.push({ table, row, options })
      return { data: { id: 'rev-row-uuid-1', ...row }, error: null }
    },
  }
})

vi.mock('../../../lib/supabase', () => ({ supabase: db.supabase }))
vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: db.idempotentInsert,
  generateClientUuid: () => 'generated-client-uuid-refund',
}))

describe('REFUND_PAYMENT action', () => {
  beforeEach(() => { db.state.inserts = [] })

  it('declares the dedicated, documented payment.reverse capability', () => {
    expect(refundPaymentConfig.implemented).toBe(true)
    expect(refundPaymentConfig.permissions).toEqual(['payment.reverse'])
  })

  it('requires one payment, a positive amount, and a durable reason', () => {
    expect(() => refundPaymentConfig.validate({} as RefundPaymentInput)).toThrow(/Payment identifier is required/)
    expect(() => refundPaymentConfig.validate({ paymentId: 'p', amount: 0, reason: 'A valid reason' })).toThrow(/positive number/)
    expect(() => refundPaymentConfig.validate({ paymentId: 'p', amount: 1, reason: 'Short' })).toThrow(/at least 10 characters/)
  })

  it('writes a correction against the selected payment only and emits one event', async () => {
    const input: RefundPaymentInput = {
      paymentId: '11111111-1111-4111-8111-111111111111',
      amount: 2500,
      reason: 'Partial return of lens on day 2',
      clientUuid: 'action-uuid-refund-1',
    }
    const res = await refundPaymentConfig.execute(input, { userId: 'user-manager-1', role: 'Manager' })

    expect(res.result).toMatchObject({
      success: true,
      originalPaymentId: input.paymentId,
      amount: 2500,
      reversalNo: 'REV-2026-0001',
    })
    expect(db.state.inserts).toHaveLength(1)
    expect(db.state.inserts[0]).toMatchObject({
      table: 'payment_reversals',
      row: {
        original_payment_id: input.paymentId,
        amount: 2500,
        reason: input.reason,
        reversed_by: 'user-manager-1',
        approved_by: 'user-manager-1',
        client_uuid: input.clientUuid,
      },
      options: { queueOnFailure: false },
    })
    expect(res.events).toHaveLength(1)
    expect(res.events[0]?.type).toBe(EVENT_TYPES.PAYMENT_REFUNDED)
  })
})
