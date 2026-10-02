import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listMembers } from '../membership'

const state = vi.hoisted(() => ({ mode: 'rows' as 'rows' | 'empty' | 'error' }))

vi.mock('../../supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'membership_plans_v') return {
        select: vi.fn().mockResolvedValue({ data: [{ id: 'plan-1', level: 'Creator' }], error: null }),
      }
      if (table === 'client_memberships_v') return {
        select: () => ({
          is: () => ({
            order: () => ({
              range: vi.fn().mockImplementation(() => state.mode === 'error'
                ? { data: null, error: new Error('permission denied') }
                : { data: state.mode === 'empty' ? [] : [{ id: 'membership-1', client_id: 'client-1', plan_id: 'plan-1', join_date: '2026-02-10', fee_paid: 1250 }], error: null }),
            }),
          }),
        }),
      }
      if (table === 'clients_v') return {
        select: () => ({
          in: vi.fn().mockResolvedValue({ data: [{ id: 'client-1', name: 'Asha Rai', type_parent: 'Individual' }], error: null }),
        }),
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  },
}))

describe('listMembers', () => {
  beforeEach(() => { state.mode = 'rows' })

  it('maps a current membership using its client and plan', async () => {
    const rows = await listMembers()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'membership-1', clientId: 'client-1', name: 'Asha Rai',
      level: 'Creator', joinedIso: '2026-02-10', feePaidPaisa: 125000,
    })
  })

  it('returns an honest empty list when the table is empty', async () => {
    state.mode = 'empty'
    await expect(listMembers()).resolves.toEqual([])
  })

  it('surfaces a read error instead of reporting zero members', async () => {
    state.mode = 'error'
    await expect(listMembers()).rejects.toThrow(/permission denied/)
  })
})
