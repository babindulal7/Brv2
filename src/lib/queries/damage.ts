import { supabase } from '../supabase'
import { DAMAGE_FINDINGS, type DamageFinding } from '../../data/damage'

export { DAMAGE_FINDINGS }
export type { DamageFinding }

export async function getDamageFindings(): Promise<DamageFinding[]> {
  try {
    const { data, error } = await supabase
      .from('cases')
      .select('id, case_number, title, status, severity, created_at')
      .eq('case_type', 'Damage')

    if (error || !data || data.length === 0) {
      return DAMAGE_FINDINGS
    }

    return DAMAGE_FINDINGS
  } catch {
    return DAMAGE_FINDINGS
  }
}
