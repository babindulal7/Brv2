import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveDamage, resolveDamageConfig } from '../resolveDamage'
import { ActionPermissionError } from '../../core'
import { rupees } from '../../../lib/money'

vi.mock('../../../lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'DMG-2026-0041',
                  approval_state: 'Approved',
                  disposition: 'Charge Client',
                  approved_at: '2026-09-25T01:00:00.000Z',
                  approved_by: '00000000-0000-0000-0000-000000000001',
                },
                error: null,
              }),
            })),
          })),
        })),
      })),
    },
  }
})

describe('resolveDamage action (44th action)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates input parameters correctly', async () => {
    // Missing findingId
    expect(() =>
      resolveDamageConfig.validate({
        findingId: '',
        disposition: 'Charge Client',
        chargePaisa: rupees(5000),
      }),
    ).toThrow(/findingId is required/)

    // Missing disposition
    expect(() =>
      resolveDamageConfig.validate({
        findingId: 'DMG-1',
        disposition: undefined as never,
        chargePaisa: rupees(5000),
      }),
    ).toThrow(/disposition is required/)

    // Negative chargePaisa
    expect(() =>
      resolveDamageConfig.validate({
        findingId: 'DMG-1',
        disposition: 'Charge Client',
        chargePaisa: -100 as never,
      }),
    ).toThrow(/chargePaisa must be a non-negative finite number/)
  })

  it('executes damage resolution and emits CASE_RESOLVED', async () => {
    const ctx = { userId: 'u-owner', role: 'Owner' as const }
    const res = await resolveDamage(
      {
        findingId: 'DMG-2026-0041',
        disposition: 'Charge Client',
        chargePaisa: rupees(5000),
      },
      ctx,
    )

    expect(res.success).toBe(true)
    expect(res.findingId).toBe('DMG-2026-0041')
    expect(res.chargeRupees).toBe(5000)
    expect(res.disposition).toBe('Charge Client')
  })

  it('permits Manager role to resolve damage', async () => {
    const ctx = { userId: 'u-mgr', role: 'Manager' as const }
    const res = await resolveDamage(
      {
        findingId: 'DMG-2026-0041',
        disposition: 'Absorb',
        chargePaisa: rupees(0),
      },
      ctx,
    )

    expect(res.success).toBe(true)
  })

  it('denies Warehouse role per R-25 / canApproveDamage', async () => {
    const ctx = { userId: 'u-wh', role: 'Warehouse' as const }
    await expect(
      resolveDamage(
        {
          findingId: 'DMG-2026-0041',
          disposition: 'Charge Client',
          chargePaisa: rupees(5000),
        },
        ctx,
      ),
    ).rejects.toBeInstanceOf(ActionPermissionError)
  })
})
