import { describe, expect, it } from 'vitest'
import {
  clearanceForBlind,
  defaultTabForContext,
  depositHeldFrom,
  derivePackingStatus,
  getHoverActions,
  handoverBlockedReason,
  packingProgress,
  sortTxNewestFirst,
  summarizeRentalPayments,
  type PackingLine,
  type PaymentTransaction,
} from '../smartHover'

function line(id: string, status: PackingLine['status'], qtyRequired = 1, qtyPacked = 0): PackingLine {
  return { id, label: id, status, qtyRequired, qtyPacked }
}

function tx(partial: Partial<PaymentTransaction> & { id: string; amountPaisa: number }): PaymentTransaction {
  return {
    clientId: 'c1',
    type: 'rental_payment',
    status: 'completed',
    method: 'cash',
    createdAt: '2026-09-29T10:00:00Z',
    createdBy: 'Sonam',
    ...partial,
  }
}

describe('derivePackingStatus (§37)', () => {
  it('empty is not_started', () => {
    expect(derivePackingStatus([])).toBe('not_started')
  })
  it('blocking item wins over progress', () => {
    expect(derivePackingStatus([line('a', 'packed'), line('b', 'missing')])).toBe('blocked')
  })
  it('all packed is packed', () => {
    expect(derivePackingStatus([line('a', 'packed'), line('b', 'packed')])).toBe('packed')
  })
  it('partial progress is partially_packed', () => {
    expect(derivePackingStatus([line('a', 'packed'), line('b', 'required')])).toBe('partially_packed')
  })
  it('qty-based packed counts', () => {
    expect(derivePackingStatus([line('a', 'required', 4, 4)])).toBe('packed')
    expect(derivePackingStatus([line('a', 'required', 4, 2)])).toBe('partially_packed')
  })
})

describe('packingProgress (§62)', () => {
  it('counts packed/blocked/pending separately', () => {
    const p = packingProgress([line('a', 'packed'), line('b', 'missing'), line('c', 'required')])
    expect(p).toMatchObject({ total: 3, packed: 1, blocked: 1, pending: 1, status: 'blocked' })
  })
})

describe('handover readiness (§34)', () => {
  it('blocked until every gate passes', () => {
    const base = { equipmentReady: true, packingReady: true, paymentReady: true, depositReady: true, contractReady: true, clientAllowed: true }
    expect(handoverBlockedReason(base)).toBeNull()
    expect(handoverBlockedReason({ ...base, depositReady: false })).toBe('Security deposit missing')
  })
})

describe('summarizeRentalPayments (§44 Law 5, §45 TDS)', () => {
  it('derives paid/due from ledger, deposits excluded', () => {
    const s = summarizeRentalPayments({
      grandTotalPaisa: 4860000,
      transactions: [tx({ id: 'p1', amountPaisa: 2500000 }), tx({ id: 'd1', type: 'deposit', amountPaisa: 3000000 })],
    })
    expect(s.paidPaisa).toBe(2500000)
    expect(s.duePaisa).toBe(2360000)
    expect(s.state).toBe('PARTIALLY_PAID')
  })
  it('tds settles part of the due', () => {
    const s = summarizeRentalPayments({
      grandTotalPaisa: 10000000,
      transactions: [tx({ id: 't1', type: 'tds', amountPaisa: 150000 }), tx({ id: 'p1', amountPaisa: 9850000 })],
    })
    expect(s.duePaisa).toBe(0)
    expect(s.state).toBe('PAID')
  })
  it('refunds reduce paid', () => {
    const s = summarizeRentalPayments({
      grandTotalPaisa: 4860000,
      transactions: [tx({ id: 'p1', amountPaisa: 2500000 }), tx({ id: 'r1', type: 'refund', amountPaisa: 500000 })],
    })
    expect(s.paidPaisa).toBe(2000000)
  })
})

describe('depositHeldFrom (§46)', () => {
  it('received minus refunded', () => {
    expect(depositHeldFrom([tx({ id: 'd1', type: 'deposit', amountPaisa: 5000000 }), tx({ id: 'r1', type: 'deposit_refund', amountPaisa: 5000000 })])).toBe(0)
  })
})

describe('sortTxNewestFirst (§103)', () => {
  it('newest first, invalid last', () => {
    const a = tx({ id: 'a', createdAt: '2026-09-20T00:00:00Z', amountPaisa: 1 })
    const b = tx({ id: 'b', createdAt: '2026-09-29T00:00:00Z', amountPaisa: 1 })
    expect(sortTxNewestFirst([a, b]).map((t) => t.id)).toEqual(['b', 'a'])
  })
})

describe('clearanceForBlind (§22)', () => {
  it('carries no amounts', () => {
    const v = clearanceForBlind({ paymentReady: false, depositReady: false })
    expect(v).toEqual({ kind: 'blocked', reasons: ['Payment required', 'Security deposit required'] })
    expect(JSON.stringify(v)).not.toMatch(/[0-9]{4,}/)
  })
})

describe('getHoverActions (§51–§52)', () => {
  it('packing rental continues packing', () => {
    const a = getHoverActions({ entityType: 'rental', context: 'packing', role: 'Warehouse', stage: 'Booked', packingStatus: 'partially_packed' })
    expect(a.primary).toBe('continue_packing')
    expect(a.overflow.length).toBeLessThanOrEqual(6)
  })
  it('money actions absent for floor roles', () => {
    const a = getHoverActions({ entityType: 'invoice', context: 'payments', role: 'Warehouse' })
    expect(a.primary).not.toBe('record_payment')
    expect(a.overflow).not.toContain('record_payment')
  })
  it('money roles keep record_payment', () => {
    const a = getHoverActions({ entityType: 'invoice', context: 'payments', role: 'Accounts' })
    expect(a.primary).toBe('record_payment')
  })
})

describe('defaultTabForContext (§61)', () => {
  it('packing page defaults to packing/current', () => {
    expect(defaultTabForContext('rental', 'packing')).toBe('packing')
    expect(defaultTabForContext('equipment', 'packing')).toBe('packing')
    expect(defaultTabForContext('client', 'payments')).toBe('payments')
  })
})
