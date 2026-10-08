import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fulfillServiceRental } from '../fulfillServiceRental'
import type { ActionContext } from '../../core'

const state = vi.hoisted(() => ({
  booking: null as Record<string, unknown> | null,
  lines: [] as Array<Record<string, unknown>>,
  transitions: [] as Array<Record<string, unknown>>,
  transitionOk: true,
  safeUpdateCalls: [] as Array<Record<string, unknown>>,
  auditEvents: [] as Array<Record<string, unknown>>,
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          is: () => Promise.resolve({ data: state.lines, error: null }),
          maybeSingle: () => Promise.resolve({ data: state.booking, error: null }),
        }),
      }),
    }),
  },
}))

vi.mock('../../../lib/bookingTransition', () => ({
  applyBookingTransition: async (args: Record<string, unknown>) => {
    state.transitions.push(args)
    if (!state.transitionOk) {
      return { ok: false, plan: { blockers: ['Gate blocked'] } }
    }
    return { ok: true, plan: { blockers: [] } }
  },
}))

vi.mock('../../../lib/dataAccess', () => ({
  generateClientUuid: () => 'test-client-uuid-0000-000000000000',
  safeUpdate: async (table: string, id: string, patch: Record<string, unknown>, uuid: string) => {
    state.safeUpdateCalls.push({ table, id, patch, uuid })
    return { ok: true }
  },
}))

vi.mock('../../../lib/audit', () => ({
  logAuditEvent: async (args: Record<string, unknown>) => {
    state.auditEvents.push(args)
  },
}))

const adminCtx: ActionContext = {
  userId: 'user-admin-1',
  role: 'Admin',
}

const techCtx: ActionContext = {
  userId: 'user-tech-1',
  role: 'Technician',
}

describe('fulfillServiceRental', () => {
  beforeEach(() => {
    state.booking = {
      id: 'booking-uuid-1',
      booking_no: 'BK-2026-0001',
      branch_id: 'branch-1',
      stage: 'Booked',
      cancelled_at: null,
      closed_at: null,
    }
    state.lines = [
      { id: 'line-1', line_type: 'Service' },
      { id: 'line-2', line_type: 'Manual item' },
    ]
    state.transitions = []
    state.transitionOk = true
    state.safeUpdateCalls = []
    state.auditEvents = []
  })

  it('rejects unauthenticated requests or unauthorized roles', async () => {
    await expect(
      fulfillServiceRental({ bookingNo: 'BK-2026-0001' }, { userId: null, role: null } as unknown as ActionContext),
    ).rejects.toThrow(/Not fulfilled — an active authenticated session is required/)

    await expect(fulfillServiceRental({ bookingNo: 'BK-2026-0001' }, techCtx)).rejects.toThrow(
      /Role Technician is not permitted/,
    )
  })

  it('rejects empty bookingNo', async () => {
    await expect(fulfillServiceRental({ bookingNo: '' }, adminCtx)).rejects.toThrow(/A booking number is required/)
  })

  it('rejects cancelled or closed bookings', async () => {
    state.booking = { ...state.booking!, cancelled_at: '2026-10-01T12:00:00Z' }
    await expect(fulfillServiceRental({ bookingNo: 'BK-2026-0001' }, adminCtx)).rejects.toThrow(
      /is cancelled\. Fulfill does not run on cancelled bookings/,
    )

    state.booking = { ...state.booking!, cancelled_at: null, closed_at: '2026-10-01T12:00:00Z', stage: 'Closed' }
    await expect(fulfillServiceRental({ bookingNo: 'BK-2026-0001' }, adminCtx)).rejects.toThrow(
      /Closed is final — nothing further is recorded/,
    )
  })

  it('rejects bookings containing physical equipment lines', async () => {
    state.lines = [
      { id: 'line-1', line_type: 'Service' },
      { id: 'line-2', line_type: 'Serialized' },
    ]
    await expect(fulfillServiceRental({ bookingNo: 'BK-2026-0001' }, adminCtx)).rejects.toThrow(
      /contains physical equipment lines and must follow warehouse Pack, Handover, and Return workflows/,
    )
  })

  it('advances service-only booking from Booked through Packed and On Rent to Returned', async () => {
    const res = await fulfillServiceRental({ bookingNo: 'BK-2026-0001' }, adminCtx)
    expect(res.success).toBe(true)
    expect(res.fromStage).toBe('Booked')
    expect(res.toStage).toBe('Returned')

    expect(state.transitions).toHaveLength(3)
    expect(state.transitions[0]!.from).toBe('Booked')
    expect(state.transitions[0]!.to).toBe('Packed')
    expect(state.transitions[1]!.from).toBe('Packed')
    expect(state.transitions[1]!.to).toBe('On Rent')
    expect(state.transitions[2]!.from).toBe('On Rent')
    expect(state.transitions[2]!.to).toBe('Returned')

    // Verified safeUpdate stamped actual_return_at
    expect(state.safeUpdateCalls).toHaveLength(1)
    expect(state.safeUpdateCalls[0]!.table).toBe('bookings')
    expect(state.safeUpdateCalls[0]!.id).toBe('booking-uuid-1')

    // Verified audit event logged
    expect(state.auditEvents).toHaveLength(1)
    expect(state.auditEvents[0]!.category).toBe('Rentals')
  })

  it('handles booking already at Returned as a no-op success', async () => {
    state.booking = { ...state.booking!, stage: 'Returned' }
    const res = await fulfillServiceRental({ bookingNo: 'BK-2026-0001' }, adminCtx)
    expect(res.success).toBe(true)
    expect(res.toStage).toBe('Returned')
    expect(state.transitions).toHaveLength(0)
  })
})
