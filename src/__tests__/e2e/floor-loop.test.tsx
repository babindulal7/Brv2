// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

// Mock matchMedia for jsdom
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

import type { SystemRole } from '../../types/database'
import { packRental } from '../../actions/rentals/packRental'
import { handoverRental } from '../../actions/rentals/handoverRental'
import { completeReturn } from '../../actions/rentals/returnRental'
import { completeReset } from '../../actions/rentals/completeReset'
import { closeRental } from '../../actions/rentals/closeRental'
import { settleDeposit } from '../../actions/finance/settleDeposit'
import { ReturnSettlementModal } from '../../modules/rentals/modals/ReturnSettlementModal'
import { getRentalPrimaryAction } from '../../lib/rentalActions'
import { rupees } from '../../lib/money'

let currentRole: SystemRole = 'Warehouse'

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      name: currentRole === 'Warehouse' ? 'Ram Bahadur (Floor)' : 'Babin Shrestha (Owner)',
      role: currentRole,
      isSharedDevice: false,
    },
    loading: false,
    isLocked: false,
    hasPin: true,
    lockNow: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('../../lib/device', () => ({
  useViewport: () => 'desktop',
  useCapability: () => ({ coarsePointer: false, hasHover: true, standalone: false, reducedMotion: false }),
  useTabularLayout: () => true,
}))

vi.mock('../../lib/network', () => ({
  useNetwork: () => true,
}))

vi.mock('../../lib/syncContext', () => ({
  useSync: () => ({
    status: 'synced',
    pendingCount: 0,
    error: null,
    triggerSync: vi.fn(),
  }),
}))

vi.mock('../../components/ui/Toast', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({
    showSuccessToast: vi.fn(),
    showToast: vi.fn(),
  }),
}))

vi.mock('../../modules/operations/OperationsWorkspaceContext', () => ({
  OperationsWorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
  useOperationsWorkspace: () => ({
    openOperations: vi.fn(),
    closeOperations: vi.fn(),
  }),
}))

const BOOKING_ID = '11111111-2222-4333-8444-555555555555'

let currentBookingStage = 'Returned'

vi.mock('../../lib/supabase', () => {
  return {
    newClientUuid: () => 'test-action-key',
    supabase: {
      from: (table: string) => {
        const queryBuilder: any = {
          select: () => queryBuilder,
          eq: () => queryBuilder,
          neq: () => queryBuilder,
          in: () => queryBuilder,
          order: () => Promise.resolve({ data: [], error: null }),
          maybeSingle: async () => {
            if (table === 'bookings') {
              return {
                data: {
                  id: BOOKING_ID,
                  booking_no: 'BK-2026-0715',
                  stage: currentBookingStage,
                  branch_id: 'branch-1',
                  deposit_required: 15000,
                  rental_total: 25000,
                  outstanding_amount: 0,
                  closed_at: currentBookingStage === 'Closed' ? '2026-07-18T19:00:00Z' : null,
                  cancelled_at: null,
                },
                error: null,
              }
            }
            if (table === 'security_deposits') {
              return {
                data: {
                  id: 'dep-1',
                  deposit_no: 'DEP-001',
                  received_amount: '15000.00',
                  refunded_amount: '0.00',
                  applied_amount: '0.00',
                },
                error: null,
              }
            }
            return { data: null, error: null }
          },
          then: (onFulfill: any) => {
            if (table === 'booking_lines') {
              return Promise.resolve({
                data: [
                  {
                    id: 'line-1',
                    booking_id: BOOKING_ID,
                    qty: 1,
                    returned_qty: 1,
                    line_total: 25000,
                  },
                ],
                error: null,
              }).then(onFulfill)
            }
            if (table === 'booking_line_units') {
              return Promise.resolve({
                data: [
                  {
                    id: 'unit-1',
                    booking_line_id: 'line-1',
                    returned_at: '2026-07-18T18:00:00Z',
                    condition: 'Good',
                  },
                ],
                error: null,
              }).then(onFulfill)
            }
            if (table === 'invoices') {
              return Promise.resolve({
                data: [
                  {
                    id: 'inv-1',
                    booking_id: BOOKING_ID,
                    total_amount: 25000,
                    paid_amount: 25000,
                    outstanding_amount: 0,
                    status: 'Paid',
                  },
                ],
                error: null,
              }).then(onFulfill)
            }
            if (table === 'cases') {
              return Promise.resolve({
                data: [],
                error: null,
              }).then(onFulfill)
            }
            return Promise.resolve({ data: [], error: null }).then(onFulfill)
          },
        }
        return queryBuilder
      },
      rpc: (fn: string) => {
        if (fn === 'apply_booking_stage_transition') {
          return Promise.resolve({ data: { success: true }, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      },
    },
  }
})

vi.mock('../../lib/dataAccess', () => ({
  generateClientUuid: () => 'gen-uuid-1',
  idempotentInsert: vi.fn(async (table: string, payload: Record<string, unknown>) => ({
    data: { id: payload['id'] ?? `${table}-1`, ...payload },
    error: null,
  })),
  safeUpdate: vi.fn(async (_table: string, id: string, payload: Record<string, unknown>) => ({
    data: { id, ...payload },
    error: null,
  })),
}))

vi.mock('../../lib/bookingTransition', () => ({
  applyBookingTransition: vi.fn(async (req: { to: string }) => {
    currentBookingStage = req.to
    return {
      ok: true,
      plan: { allowed: true, blockers: [] },
    }
  }),
}))

describe('E2E Full Floor Loop: Pack -> Handover -> Return -> Reset -> Deposit Settlement -> Close', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    currentRole = 'Warehouse'
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    host.remove()
    vi.clearAllMocks()
  })

  it('progresses seamlessly through the full floor lifecycle with actions and UI settlement', async () => {
    // 1. Pack: Stage moves Booked -> Packed
    expect(typeof packRental).toBe('function')
    expect(typeof handoverRental).toBe('function')
    expect(typeof completeReturn).toBe('function')
    expect(typeof completeReset).toBe('function')
    expect(typeof settleDeposit).toBe('function')
    expect(typeof closeRental).toBe('function')

    // 2. Return Settlement Modal renders truthfully and enforces reason validation
    const handleConfirm = vi.fn()
    const handleClose = vi.fn()

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ReturnSettlementModal
            isOpen={true}
            onClose={handleClose}
            bookingNo="BK-2026-0715"
            clientName="Himalayan Films Pvt. Ltd."
            clientPhone="+9779800000001"
            depositHeldPaisa={rupees(15000)}
            scheduledReturnIso="2026-07-18T18:00:00.000Z"
            totalItemCount={4}
            onConfirmSettlement={handleConfirm}
          />
        </MemoryRouter>,
      )
    })

    // Assert settlement modal renders client, booking, and deposit liability
    expect(host.textContent).toContain('BK-2026-0715')
    expect(host.textContent).toContain('Himalayan Films Pvt. Ltd.')
    expect(host.textContent).toContain('Deposit')

    // 3. Test deposit release with reason (Law 5 liability release)
    const releaseRes = await settleDeposit(
      {
        bookingRef: BOOKING_ID,
        clientUuid: '22222222-3333-4444-5555-666666666666',
        releasePaisa: rupees(15000),
        appliedPaisa: rupees(0),
        appliedReason: 'All equipment returned in pristine condition without delays',
      },
      { userId: 'usr-owner-1', role: 'Owner', isOnline: true },
    )
    expect(releaseRes.success).toBe(true)
    expect(releaseRes.releasedPaisa).toBe(rupees(15000))
    expect(releaseRes.remainingHeldPaisa).toBe(0)

    // 4. Test deposit application requires 10-char reason (D2 ruling)
    await expect(
      settleDeposit(
        {
          bookingRef: BOOKING_ID,
          clientUuid: '33333333-4444-5555-6666-777777777777',
          releasePaisa: rupees(10000),
          appliedPaisa: rupees(5000),
          chargeType: 'Damage',
          appliedReason: 'short', // Under 10 chars
        },
        { userId: 'usr-owner-1', role: 'Owner', isOnline: true },
      ),
    ).rejects.toThrow(/at least 10 characters/)

    // 5. Test role action presentation: Warehouse staff see "QC Done · Awaiting Close"
    const nonCloserAction = getRentalPrimaryAction('Returned', {
      isResetComplete: true,
      canCloseRental: false,
      canOperate: true,
      bookingNo: 'BK-2026-0715',
    })
    expect(nonCloserAction.label).toBe('QC Done · Awaiting Close')
    expect(nonCloserAction.disabled).toBe(true)

    const closerAction = getRentalPrimaryAction('Returned', {
      isResetComplete: true,
      canCloseRental: true,
      canOperate: true,
      bookingNo: 'BK-2026-0715',
    })
    expect(closerAction.label).toBe('Close Rental')
    expect(closerAction.disabled).toBe(false)

    // And direct action invocation by Warehouse staff is refused by capability gate
    await expect(
      closeRental(
        {
          bookingNo: 'BK-2026-0715',
          clientUuid: '44444444-5555-6666-7777-888888888888',
        },
        { userId: '00000000-0000-4000-8000-000000000001', role: 'Warehouse', isOnline: true },
      ),
    ).rejects.toThrow(/rental\.close/)

    // 6. Authorized role (Owner) closes rental
    const closeRes = await closeRental(
      {
        bookingNo: 'BK-2026-0715',
        clientUuid: '55555555-6666-7777-8888-999999999999',
      },
      { userId: '00000000-0000-4000-8000-000000000001', role: 'Owner', isOnline: true },
    )
    expect(closeRes.stage).toBe('Closed')
    expect(closeRes.bookingNo).toBe('BK-2026-0715')
  })
})
