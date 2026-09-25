import { supabase } from '../../lib/supabase'
import { toRupees } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import type { DamageDisposition } from '../../types/database'
import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'

export interface ResolveDamageParams {
  findingId: string
  disposition: DamageDisposition
  chargePaisa: Paisa
  clientUuid?: string | undefined
}

export type ResolveDamageInput = ResolveDamageParams

export interface ResolveDamageResult {
  success: boolean
  findingId: string
  disposition: DamageDisposition
  chargeRupees: number
  approvedAt?: string | undefined
  approvedBy?: string | undefined
}

/**
 * FORMS-05 — Resolves a pending damage finding.
 * Writes `approval_state = 'Approved'`, records the disposition, and the actual charge amount.
 * The `trg_damage_approver_is_actor` trigger will automatically record `approved_by` = auth.uid()
 * and `approved_at` = now().
 */
export async function resolveDamageFinding(params: ResolveDamageParams) {
  // We use estimated_cost to store the approved charge amount.
  // It is conceptually the operator's decision on the charge.
  const { data, error } = await supabase
    .from('damage_findings')
    .update({
      approval_state: 'Approved',
      disposition: params.disposition,
      estimated_cost: toRupees(params.chargePaisa),
    })
    .eq('id', params.findingId)
    .select('id, approval_state, disposition, approved_at, approved_by')
    .single()

  if (error) {
    throw error
  }

  return data
}

export const resolveDamageConfig: ActionConfig<ResolveDamageInput, ResolveDamageResult> = {
  name: 'RESOLVE_DAMAGE',
  permissions: ['case.resolve'],
  implemented: true,

  validate: (input) => {
    if (!input.findingId || typeof input.findingId !== 'string') {
      throw new Error('findingId is required')
    }
    if (!input.disposition) {
      throw new Error('disposition is required')
    }
    if (typeof input.chargePaisa !== 'number' || input.chargePaisa < 0 || !Number.isFinite(input.chargePaisa)) {
      throw new Error('chargePaisa must be a non-negative finite number')
    }
  },

  execute: async (input: ResolveDamageInput, ctx: ActionContext) => {
    const data = await resolveDamageFinding(input)

    const chargeRupees = toRupees(input.chargePaisa)
    const approvedAt = (data as { approved_at?: string } | null)?.approved_at
    const approvedBy = (data as { approved_by?: string } | null)?.approved_by

    return {
      result: {
        success: true,
        findingId: input.findingId,
        disposition: input.disposition,
        chargeRupees,
        approvedAt,
        approvedBy,
      },
      events: [
        {
          type: EVENT_TYPES.CASE_RESOLVED,
          payload: {
            findingId: input.findingId,
            disposition: input.disposition,
            chargeRupees,
            approvedAt,
            approvedBy,
            userId: ctx.userId,
          },
        },
      ],
    }
  },
}

export const resolveDamage = createAction(resolveDamageConfig)
