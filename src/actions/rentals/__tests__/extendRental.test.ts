import { describe, it, expect, beforeEach, vi } from 'vitest'
import { extendRentalConfig, type ExtendRentalInput } from '../extendRental'
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

describe('EXTEND_RENTAL action', () => {
  beforeEach(() => {
    db.state.bookingRow = null
    db.state.rpcResult = {
      booking_id: '11111111-1111-4111-8111-111111111111',
      booking_no: 'BK-2026-0001',
      old_return_at: '2026-09-12T10:00:00.000Z',
      new_return_at: '2026-09-14T10:00:00.000Z',
      days_added: 2,
    }
    db.state.rpcError = null
    db.state.rpcCalls = []
  })

  it('declares implemented: true and permissions: [rental.extend]', () => {
    expect(extendRentalConfig.implemented).toBe(true)
    expect(extendRentalConfig.permissions).toEqual(['rental.extend'])
  })

  it('validates input: requires booking ID', () => {
    expect(() =>
      extendRentalConfig.validate({ id: '', reason: 'Client requested extra shooting days' })
    ).toThrow(/Booking ID is required/)
  })

  it('validates input: requires days to be an integer >= 1 if provided', () => {
    expect(() =>
      extendRentalConfig.validate({
        id: '11111111-1111-4111-8111-111111111111',
        days: 0,
        reason: 'Client requested extra shooting days',
      })
    ).toThrow(/Extension days must be a whole number of at least 1/)

    expect(() =>
      extendRentalConfig.validate({
        id: '11111111-1111-4111-8111-111111111111',
        days: 1.5,
        reason: 'Client requested extra shooting days',
      })
    ).toThrow(/Extension days must be a whole number of at least 1/)
  })

  it('validates input: requires reason >= 10 characters', () => {
    expect(() =>
      extendRentalConfig.validate({
        id: '11111111-1111-4111-8111-111111111111',
        days: 2,
        reason: 'too short',
      })
    ).toThrow(/Extension reason of at least ten characters is required/)
  })

  it('calls extend_booking RPC with booking UUID, days, and actor ID', async () => {
    const input: ExtendRentalInput = {
      id: '11111111-1111-4111-8111-111111111111',
      days: 2,
      reason: 'Director requested additional shooting schedule',
      clientUuid: 'action-uuid-extend-1',
    }

    const res = await extendRentalConfig.execute(input, {
      userId: 'user-actor-coord',
      role: 'Coordinator',
    })

    expect(res.result.success).toBe(true)
    expect(res.result.bookingId).toBe('11111111-1111-4111-8111-111111111111')
    expect(res.result.daysAdded).toBe(2)
    expect(res.result.newReturnAt).toBe('2026-09-14T10:00:00.000Z')

    expect(db.state.rpcCalls).toHaveLength(1)
    expect(db.state.rpcCalls[0]!.fn).toBe('extend_booking')
    expect(db.state.rpcCalls[0]!.args).toEqual({
      p_payload: {
        booking_id: '11111111-1111-4111-8111-111111111111',
        days: 2,
        reason: 'Director requested additional shooting schedule',
        actor_id: 'user-actor-coord',
        client_uuid: 'action-uuid-extend-1',
      },
    })

    expect(res.events).toHaveLength(1)
    expect(res.events[0]!.type).toBe(EVENT_TYPES.RENTAL_EXTENDED)
    expect(res.events[0]!.payload).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      daysAdded: 2,
      reason: 'Director requested additional shooting schedule',
      userId: 'user-actor-coord',
    })
  })

  it('resolves bare booking numbers to UUID before calling RPC', async () => {
    db.state.bookingRow = {
      id: '22222222-2222-4222-8222-222222222222',
      booking_no: '900',
    }

    const input: ExtendRentalInput = {
      id: '900',
      days: 1,
      reason: 'Weather delay pushed wrap time',
    }

    const res = await extendRentalConfig.execute(input, {
      userId: 'user-mgr-1',
      role: 'Manager',
    })

    expect(res.result.bookingId).toBe('22222222-2222-4222-8222-222222222222')
    expect(db.state.rpcCalls).toHaveLength(1)
    expect(db.state.rpcCalls[0]!.args.p_payload).toMatchObject({
      booking_id: '22222222-2222-4222-8222-222222222222',
      days: 1,
    })
  })

  it('throws helpful error if booking number cannot be resolved', async () => {
    db.state.bookingRow = null

    const input: ExtendRentalInput = {
      id: 'NONEXISTENT',
      days: 1,
      reason: 'Valid extension reason for missing booking',
    }

    await expect(
      extendRentalConfig.execute(input, {
        userId: 'user-1',
        role: 'Coordinator',
      })
    ).rejects.toThrow(/Could not resolve booking number NONEXISTENT/)
  })

  it('propagates RPC errors directly from Postgres', async () => {
    db.state.rpcError = {
      message: 'extend_booking: conflicting key value violates exclusion constraint "inventory_reservations_no_double_booking"',
    }

    const input: ExtendRentalInput = {
      id: '11111111-1111-4111-8111-111111111111',
      days: 3,
      reason: 'Extended shoot schedule requested',
    }

    await expect(
      extendRentalConfig.execute(input, {
        userId: 'user-1',
        role: 'Coordinator',
      })
    ).rejects.toThrow(/Failed to extend booking: extend_booking: conflicting key value violates exclusion constraint/)
  })
})
