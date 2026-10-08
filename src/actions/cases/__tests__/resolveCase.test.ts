import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resolveCaseConfig, type ResolveCaseInput } from '../resolveCase'
import { EVENT_TYPES } from '../../../events/eventBus'

const db = vi.hoisted(() => {
  const state = {
    caseRow: null as { id: string; case_no: string; status: string } | null,
    updateCalls: [] as Array<{ table: string; id: string; patch: Record<string, unknown>; clientUuid?: string | undefined }>,
    updateError: null as { message: string } | null,
  }

  const builder: Record<string, unknown> = {}
  builder['select'] = () => builder
  builder['eq'] = () => builder
  builder['maybeSingle'] = async () => ({ data: state.caseRow, error: null })

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

describe('RESOLVE_CASE action', () => {
  beforeEach(() => {
    db.state.caseRow = {
      id: '33333333-3333-4333-8333-333333333333',
      case_no: 'CASE-2026-0001',
      status: 'Open',
    }
    db.state.updateCalls = []
    db.state.updateError = null
  })

  it('declares implemented: true and permissions: [case.resolve]', () => {
    expect(resolveCaseConfig.implemented).toBe(true)
    expect(resolveCaseConfig.permissions).toEqual(['case.resolve'])
  })

  it('validates input: requires caseId', () => {
    expect(() => resolveCaseConfig.validate({ caseId: '' })).toThrow(/Case ID is required/)
    expect(() => resolveCaseConfig.validate({ caseId: '   ' })).toThrow(/Case ID is required/)
  })

  it('validates input: rejects invalid target status', () => {
    expect(() =>
      resolveCaseConfig.validate({ caseId: '123', status: 'Open' as never })
    ).toThrow(/Resolution status must be either Resolved or Closed/)
  })

  it('resolves case by UUID and updates status to Resolved', async () => {
    const input: ResolveCaseInput = {
      caseId: '33333333-3333-4333-8333-333333333333',
      resolution: 'Repair — send to Maintenance',
      chargedToClientAmount: 5000,
      clientUuid: 'action-uuid-case-1',
    }

    const res = await resolveCaseConfig.execute(input, {
      userId: 'user-mgr-1',
      role: 'Manager',
    })

    expect(res.result.success).toBe(true)
    expect(res.result.caseId).toBe('33333333-3333-4333-8333-333333333333')
    expect(res.result.status).toBe('Resolved')
    expect(res.result.disposition).toBe('Repair — send to Maintenance')

    expect(db.state.updateCalls).toHaveLength(1)
    expect(db.state.updateCalls[0]!.table).toBe('cases')
    expect(db.state.updateCalls[0]!.id).toBe('33333333-3333-4333-8333-333333333333')
    expect(db.state.updateCalls[0]!.patch).toMatchObject({
      status: 'Resolved',
      disposition: 'Repair — send to Maintenance',
      charged_to_client_amount: 5000,
    })
    expect(db.state.updateCalls[0]!.clientUuid).toBe('action-uuid-case-1')

    expect(res.events).toHaveLength(1)
    expect(res.events[0]!.type).toBe(EVENT_TYPES.CASE_RESOLVED)
    expect(res.events[0]!.payload).toMatchObject({
      caseId: '33333333-3333-4333-8333-333333333333',
      resolution: 'Repair — send to Maintenance',
      status: 'Resolved',
    })
  })

  it('resolves case by case_no (e.g. CASE-2026-0001)', async () => {
    const input: ResolveCaseInput = {
      caseId: 'CASE-2026-0001',
      status: 'Closed',
      resolution: 'Found and verified in good condition',
    }

    const res = await resolveCaseConfig.execute(input, {
      userId: 'user-owner',
      role: 'Owner',
    })

    expect(res.result.success).toBe(true)
    expect(res.result.caseId).toBe('33333333-3333-4333-8333-333333333333')
    expect(res.result.status).toBe('Closed')
    expect(db.state.updateCalls[0]!.patch).toMatchObject({
      status: 'Closed',
      disposition: 'Found and verified in good condition',
    })
  })

  it('throws helpful error if case cannot be found', async () => {
    db.state.caseRow = null

    const input: ResolveCaseInput = {
      caseId: 'CASE-2026-9999',
    }

    await expect(
      resolveCaseConfig.execute(input, {
        userId: 'user-1',
        role: 'Manager',
      })
    ).rejects.toThrow(/Case CASE-2026-9999 was not found/)
  })

  it('propagates safeUpdate errors', async () => {
    db.state.updateError = { message: 'Database connection failed' }

    const input: ResolveCaseInput = {
      caseId: '33333333-3333-4333-8333-333333333333',
    }

    await expect(
      resolveCaseConfig.execute(input, {
        userId: 'user-1',
        role: 'Manager',
      })
    ).rejects.toThrow(/Update failed on cases: Database connection failed/)
  })
})
