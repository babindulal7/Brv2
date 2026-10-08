import { describe, it, expect, beforeEach, vi } from 'vitest'
import { cancelRentalConfig, type CancelRentalInput } from '../cancelRental'
import { EVENT_TYPES } from '../../../events/eventBus'

const db = vi.hoisted(() => {
  const state = {
    bookingRow: null as { id: string; booking_no: string } | null,
    rpcResult: null as Record<string, unknown> | null,
    rpcError: null as { message: string } | null,
    rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  }

  const builder: Record<string, unknown> = {}
  builder['select'] = () => builder
  builder['eq'] = () => builder
  builder['maybeSingle'] = async () => ({ data: state.bookingRow, error: null })

  return {
    state,
    supabase: {
      from: () => builder,
      rpc: async (fn: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ fn, args })
        if (state.rpcError) {
          return { data: null, error: state.rpcError }
        }
        return { data: state.rpcResult, error: null }
      },
    },
  }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
}))

describe('CANCEL_RENTAL action', () => {
  beforeEach(() => {
    db.state.bookingRow = null
    db.state.rpcResult = {
      booking_id: '11111111-1111-4111-8111-111111111111',
      booking_no: 'BK-2026-0001',
      cancelled_at: '2026-09-09T14:00:00.000Z',
    }
    db.state.rpcError = null
    db.state.rpcCalls = []
  })

  it('declares implemented: true and permissions: [rental.cancel]', () => {
    expect(cancelRentalConfig.implemented).toBe(true)
    expect(cancelRentalConfig.permissions).toEqual(['rental.cancel'])
  })

  it('validates input: requires booking ID', () => {
    expect(() =>
      cancelRentalConfig.validate({ id: '', reason: 'Customer requested cancellation' })
    ).toThrow(/Booking ID is required/)
  })

  it('validates input: requires reason >= 10 chars for real booking', () => {
    expect(() =>
      cancelRentalConfig.validate({ id: '11111111-1111-4111-8111-111111111111', reason: 'too short' })
    ).toThrow(/Cancellation reason of at least ten characters is required/)
  })

  it('allows draft-new without 10-char reason constraint', () => {
    expect(() =>
      cancelRentalConfig.validate({ id: 'draft-new', reason: null })
    ).not.toThrow()
  })

  it('handles draft-new without calling RPC', async () => {
    const input: CancelRentalInput = {
      id: 'draft-new',
      reason: null,
    }

    const res = await cancelRentalConfig.execute(input, {
      userId: 'user-1',
      role: 'Coordinator',
    })

    expect(res.result.success).toBe(true)
    expect(res.result.bookingId).toBe('draft-new')
    expect(db.state.rpcCalls).toHaveLength(0)
    expect(res.events).toHaveLength(1)
    expect(res.events[0]!.type).toBe(EVENT_TYPES.RENTAL_CANCELLED)
  })

  it('calls cancel_booking RPC with booking UUID and actor ID', async () => {
    const input: CancelRentalInput = {
      id: '11111111-1111-4111-8111-111111111111',
      reason: 'Shoot cancelled due to adverse weather conditions',
      clientUuid: 'action-uuid-1',
    }

    const res = await cancelRentalConfig.execute(input, {
      userId: 'user-actor-99',
      role: 'Manager',
    })

    expect(res.result.success).toBe(true)
    expect(res.result.bookingId).toBe('11111111-1111-4111-8111-111111111111')
    expect(res.result.bookingNo).toBe('BK-2026-0001')

    expect(db.state.rpcCalls).toHaveLength(1)
    expect(db.state.rpcCalls[0]!.fn).toBe('cancel_booking')
    expect(db.state.rpcCalls[0]!.args).toEqual({
      p_payload: {
        booking_id: '11111111-1111-4111-8111-111111111111',
        reason: 'Shoot cancelled due to adverse weather conditions',
        actor_id: 'user-actor-99',
        client_uuid: 'action-uuid-1',
      },
    })

    expect(res.events).toHaveLength(1)
    const ev = res.events[0]!
    expect(ev.type).toBe(EVENT_TYPES.RENTAL_CANCELLED)
    const evPayload = ev.payload as { id: string; bookingNo: string; reason: string }
    expect(evPayload.id).toBe('11111111-1111-4111-8111-111111111111')
    expect(evPayload.bookingNo).toBe('BK-2026-0001')
    expect(evPayload.reason).toBe('Shoot cancelled due to adverse weather conditions')
  })

  it('resolves human booking_no to UUID before calling RPC', async () => {
    db.state.bookingRow = {
      id: 'resolved-booking-uuid',
      booking_no: 'BK-2026-0042',
    }

    const input: CancelRentalInput = {
      id: 'BK-2026-0042',
      reason: 'Production postponed indefinitely by client',
    }

    const res = await cancelRentalConfig.execute(input, {
      userId: 'user-actor-99',
      role: 'Manager',
    })

    expect(res.result.success).toBe(true)
    expect(db.state.rpcCalls).toHaveLength(1)
    const callArgs = db.state.rpcCalls[0]!.args as { p_payload: { booking_id: string } }
    expect(callArgs.p_payload.booking_id).toBe('resolved-booking-uuid')
  })

  it('propagates RPC errors cleanly', async () => {
    db.state.rpcError = {
      message: 'cancel_booking: booking BK-2026-0001 is Packed. Cancelling a Packed booking requires Manager, Admin or Owner authority.',
    }

    const input: CancelRentalInput = {
      id: '11111111-1111-4111-8111-111111111111',
      reason: 'Coordinator attempting to cancel packed booking',
    }

    await expect(
      cancelRentalConfig.execute(input, {
        userId: 'coord-1',
        role: 'Coordinator',
      })
    ).rejects.toThrow(/Cancelling a Packed booking requires Manager, Admin or Owner authority/)
  })
})
