import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveDraftConfig, type SaveDraftInput } from '../saveDraft'
import { EVENT_TYPES } from '../../../events/eventBus'

const db = vi.hoisted(() => {
  const state = {
    bookingRow: null as { id: string; booking_no: string } | null,
    updateCalls: [] as Array<{ table: string; id: string; patch: Record<string, unknown>; clientUuid?: string | undefined }>,
    updateError: null as { message: string } | null,
  }

  const builder: Record<string, unknown> = {}
  builder['select'] = () => builder
  builder['eq'] = () => builder
  builder['maybeSingle'] = async () => ({ data: state.bookingRow, error: null })

  return {
    state,
    supabase: {
      from: () => builder,
    },
    safeUpdate: async (table: string, id: string, patch: Record<string, unknown>, clientUuid?: string) => {
      state.updateCalls.push({ table, id, patch, clientUuid })
      if (state.updateError) {
        throw new Error(`[DataAccess] Update failed on ${table}: ${state.updateError.message}`)
      }
      return { data: null, error: null }
    },
  }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
}))

vi.mock('../../../lib/dataAccess', () => ({
  safeUpdate: db.safeUpdate,
}))

describe('SAVE_DRAFT action', () => {
  beforeEach(() => {
    db.state.bookingRow = null
    db.state.updateCalls = []
    db.state.updateError = null
  })

  it('declares implemented: true and permissions: [rental.draft]', () => {
    expect(saveDraftConfig.implemented).toBe(true)
    expect(saveDraftConfig.permissions).toEqual(['rental.draft'])
  })

  it('validates input: requires booking ID', () => {
    expect(() => saveDraftConfig.validate({ id: '' })).toThrow(/Booking ID is required/)
    expect(() => saveDraftConfig.validate({ id: '   ' })).toThrow(/Booking ID is required/)
  })

  it('handles draft-new without calling safeUpdate', async () => {
    const input: SaveDraftInput = { id: 'draft-new' }
    const res = await saveDraftConfig.execute(input, {
      userId: 'user-1',
      role: 'Coordinator',
    })

    expect(res.result.success).toBe(true)
    expect(res.result.bookingId).toBe('draft-new')
    expect(db.state.updateCalls).toHaveLength(0)
    expect(res.events).toHaveLength(1)
    expect(res.events[0]!.type).toBe(EVENT_TYPES.DRAFT_SAVED)
    expect(res.events[0]!.payload).toMatchObject({
      id: 'draft-new',
      userId: 'user-1',
    })
  })

  it('handles persisted booking by UUID through safeUpdate', async () => {
    const input: SaveDraftInput = {
      id: '11111111-1111-4111-8111-111111111111',
      notes: 'Customer requested 2 extra batteries',
      clientUuid: 'action-uuid-save-1',
    }

    const res = await saveDraftConfig.execute(input, {
      userId: 'user-2',
      role: 'Coordinator',
    })

    expect(res.result.success).toBe(true)
    expect(res.result.bookingId).toBe('11111111-1111-4111-8111-111111111111')
    expect(db.state.updateCalls).toHaveLength(1)
    expect(db.state.updateCalls[0]!.table).toBe('bookings')
    expect(db.state.updateCalls[0]!.id).toBe('11111111-1111-4111-8111-111111111111')
    expect(db.state.updateCalls[0]!.patch).toMatchObject({
      notes: 'Customer requested 2 extra batteries',
    })
    expect(db.state.updateCalls[0]!.clientUuid).toBe('action-uuid-save-1')

    expect(res.events).toHaveLength(1)
    expect(res.events[0]!.type).toBe(EVENT_TYPES.DRAFT_SAVED)
  })

  it('resolves bare booking numbers to UUID before safeUpdate', async () => {
    db.state.bookingRow = {
      id: '22222222-2222-4222-8222-222222222222',
      booking_no: '900',
    }

    const input: SaveDraftInput = {
      id: '900',
    }

    const res = await saveDraftConfig.execute(input, {
      userId: 'user-3',
      role: 'Warehouse',
    })

    expect(res.result.bookingId).toBe('22222222-2222-4222-8222-222222222222')
    expect(res.result.bookingNo).toBe('900')
    expect(db.state.updateCalls).toHaveLength(1)
    expect(db.state.updateCalls[0]!.id).toBe('22222222-2222-4222-8222-222222222222')
  })

  it('throws helpful error if booking number cannot be resolved', async () => {
    db.state.bookingRow = null

    const input: SaveDraftInput = {
      id: 'NONEXISTENT',
    }

    await expect(
      saveDraftConfig.execute(input, {
        userId: 'user-1',
        role: 'Coordinator',
      })
    ).rejects.toThrow(/Could not resolve booking number NONEXISTENT/)
  })

  it('propagates safeUpdate errors', async () => {
    db.state.updateError = { message: 'Network connection lost' }

    const input: SaveDraftInput = {
      id: '11111111-1111-4111-8111-111111111111',
    }

    await expect(
      saveDraftConfig.execute(input, {
        userId: 'user-1',
        role: 'Coordinator',
      })
    ).rejects.toThrow(/Update failed on bookings: Network connection lost/)
  })
})
