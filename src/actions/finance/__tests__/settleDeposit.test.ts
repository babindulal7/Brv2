import { describe, it, expect, vi, beforeEach } from 'vitest'
import { settleDeposit, settleDepositConfig } from '../settleDeposit'
import { rupees } from '../../../lib/money'
import type { ActionContext } from '../../core'

const rpcMock = vi.fn()
const selectMock = vi.fn()

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: (...args: unknown[]) => selectMock(table, ...args),
    }),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}))

vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: vi.fn(async (_table: string, payload: Record<string, unknown>) => ({
    data: { id: 'mov-1', ...payload },
    error: null,
  })),
}))

const ACCOUNTS: ActionContext = {
  userId: 'usr-accounts-1',
  role: 'Accounts',
  isOnline: true,
}

describe('settleDeposit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('declares name, permissions, and implementation', () => {
    expect(settleDepositConfig.name).toBe('SETTLE_DEPOSIT')
    expect(settleDepositConfig.permissions).toEqual(['deposit.release'])
    expect(settleDepositConfig.implemented).toBe(true)
  })

  it('validates required fields', async () => {
    await expect(
      settleDeposit({ bookingRef: '', releasePaisa: rupees(100), clientUuid: 'k' }, ACCOUNTS),
    ).rejects.toThrow(/booking reference is required/)

    await expect(
      settleDeposit({ bookingRef: 'B-715', releasePaisa: rupees(100), clientUuid: '' }, ACCOUNTS),
    ).rejects.toThrow(/idempotency key/)

    await expect(
      settleDeposit({ bookingRef: 'B-715', releasePaisa: rupees(0), clientUuid: 'k' }, ACCOUNTS),
    ).rejects.toThrow(/non-zero release or applied amount/)
  })

  it('requires chargeType and appliedReason (>= 10 chars) when applying deposit to charges', async () => {
    await expect(
      settleDeposit(
        {
          bookingRef: 'B-715',
          releasePaisa: rupees(0),
          appliedPaisa: rupees(500),
          clientUuid: 'k',
        },
        ACCOUNTS,
      ),
    ).rejects.toThrow(/charge type.*is required/)

    await expect(
      settleDeposit(
        {
          bookingRef: 'B-715',
          releasePaisa: rupees(0),
          appliedPaisa: rupees(500),
          chargeType: 'Damage',
          appliedReason: 'bad note',
          clientUuid: 'k',
        },
        ACCOUNTS,
      ),
    ).rejects.toThrow(/at least 10 characters/)
  })

  it('refuses when total to settle exceeds held balance', async () => {
    selectMock.mockImplementation((table: string) => {
      if (table === 'bookings') {
        return {
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'book-uuid-1', booking_no: 'B-715' },
              error: null,
            }),
          }),
        }
      }
      if (table === 'security_deposits') {
        return {
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'dep-uuid-1',
                deposit_no: 'DEP-1',
                received_amount: '25000.00',
                refunded_amount: '0.00',
                applied_amount: '0.00',
              },
              error: null,
            }),
          }),
        }
      }
      return { eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }
    })

    await expect(
      settleDeposit(
        {
          bookingRef: 'B-715',
          releasePaisa: rupees(30000), // more than 25,000 held
          clientUuid: 'test-uuid-1',
        },
        ACCOUNTS,
      ),
    ).rejects.toThrow(/Cannot settle Rs 30,000; only Rs 25,000 is currently held/)
  })

  it('records settlement successfully and mints movements', async () => {
    selectMock.mockImplementation((table: string, ..._args: unknown[]) => {
      if (table === 'bookings') {
        return {
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'book-uuid-1', booking_no: 'B-715' },
              error: null,
            }),
          }),
        }
      }
      if (table === 'security_deposits') {
        return {
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'dep-uuid-1',
                deposit_no: 'DEP-1',
                received_amount: '25000.00',
                refunded_amount: '0.00',
                applied_amount: '0.00',
              },
              error: null,
            }),
          }),
        }
      }
      if (table === 'deposit_movements') {
        return {
          eq: async () => ({
            count: 1, // DEP-1-M1 already exists
            error: null,
          }),
        }
      }
      return { eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }
    })

    const result = await settleDeposit(
      {
        bookingRef: 'B-715',
        releasePaisa: rupees(20000),
        appliedPaisa: rupees(5000),
        chargeType: 'Damage',
        appliedReason: 'Scratch on lens front element',
        clientUuid: 'client-key-1',
      },
      ACCOUNTS,
    )

    expect(result.success).toBe(true)
    expect(result.depositId).toBe('dep-uuid-1')
    expect(result.bookingNo).toBe('B-715')
    expect(result.releasedPaisa).toBe(rupees(20000))
    expect(result.appliedPaisa).toBe(rupees(5000))
    expect(result.remainingHeldPaisa).toBe(rupees(0))
    expect(result.movementNos).toEqual(['DEP-1-M2', 'DEP-1-M3'])
  })
})
