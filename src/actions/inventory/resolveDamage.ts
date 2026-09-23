import { supabase } from '../../lib/supabase'
import { toRupees } from '../../lib/money'
import type { Paisa } from '../../lib/money'
import type { DamageDisposition } from '../../types/database'

export interface ResolveDamageParams {
  findingId: string
  disposition: DamageDisposition
  chargePaisa: Paisa
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
    .select()
    .single()

  if (error) {
    throw error
  }

  return data
}
