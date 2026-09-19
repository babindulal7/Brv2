import { supabase } from '../supabase'
import { DAMAGE_FINDINGS, type DamageFinding } from '../../data/damage'

export { DAMAGE_FINDINGS }
export type { DamageFinding }

import { rupees } from '../money'

export async function getDamageFindings(): Promise<DamageFinding[]> {
  try {
    const { data, error } = await supabase
      .from('cases_v')
      .select('id, case_no, title, status, priority, created_at, assessed_amount, deposit_held_amount, charged_to_client_amount, counterparty_name')
      .eq('type', 'Damage')

    if (error) {
      return []
    }

    return (data ?? []).map((c) => ({
      id: c.case_no || c.id,
      unitName: c.title,
      serial: 'SN-UNKNOWN',
      bookingNo: 'B-UNKNOWN',
      client: c.counterparty_name || 'Client',
      raisedBy: 'Staff',
      raisedAtBs: '',
      raisedAtAd: c.created_at ? new Date(c.created_at).toLocaleDateString() : '',
      state: (c.status === 'Settled' || c.status === 'Closed' ? 'Approved' : 'Awaiting Approval') as DamageFinding['state'],
      description: c.title,
      photos: 0,
      replacementPaisa: rupees(Number(c.assessed_amount) || 0),
      chargePaisa: rupees(Number(c.charged_to_client_amount) || 0),
      depositPaisa: rupees(Number(c.deposit_held_amount) || 0),
    }))
  } catch {
    return []
  }
}
