import { supabase } from '../supabase'
import { formatAd, formatBsOrAd } from '../bs'
import { rupees, type Paisa } from '../money'
import type { MembershipTier } from '../../data/clients'

/** Only values backed by the current membership, client and plan views. */
export interface MemberListRow {
  id: string
  clientId: string
  name: string
  kind: string
  level: MembershipTier
  joinedIso: string
  joinedAd: string
  joinedBs: string
  feePaidPaisa: Paisa | null
}

/** Current memberships only. History remains in the database, not the directory. */
export async function listMembers(): Promise<MemberListRow[]> {
  const { data: plans, error: plansError } = await supabase
    .from('membership_plans_v')
    .select('id, level')
  if (plansError) throw new Error(`listMembers plans failed: ${plansError.message}`)
  const planById = new Map((plans ?? []).map((plan) => [plan.id, plan.level]))

  const members: MemberListRow[] = []
  const batchSize = 100
  for (let offset = 0; ; offset += batchSize) {
    const { data: memberships, error } = await supabase
      .from('client_memberships_v')
      .select('id, client_id, plan_id, join_date, fee_paid')
      .is('superseded_at', null)
      .order('id', { ascending: true })
      .range(offset, offset + batchSize - 1)
    if (error) throw new Error(`listMembers failed: ${error.message}`)
    const batch = memberships ?? []
    if (batch.length === 0) break

    const clientIds = [...new Set(batch.map((member) => member.client_id).filter((id): id is string => id !== null))]
    const { data: clients, error: clientsError } = await supabase
      .from('clients_v')
      .select('id, name, type_parent')
      .in('id', clientIds)
    if (clientsError) throw new Error(`listMembers clients failed: ${clientsError.message}`)
    const clientById = new Map((clients ?? []).map((client) => [client.id, client]))

    for (const member of batch) {
      const client = clientById.get(member.client_id)
      const level = planById.get(member.plan_id)
      if (!member.id || !member.client_id || !member.join_date || !client?.name || !level) {
        throw new Error('listMembers failed: a membership has missing client, plan or join date data')
      }
      const joined = new Date(`${member.join_date}T00:00:00Z`)
      members.push({
        id: member.id,
        clientId: member.client_id,
        name: client.name,
        kind: client.type_parent ?? 'Client',
        level,
        joinedIso: member.join_date,
        joinedAd: formatAd(joined),
        joinedBs: formatBsOrAd(joined, { suffix: true }),
        feePaidPaisa: member.fee_paid === null ? null : rupees(member.fee_paid),
      })
    }
    if (batch.length < batchSize) break
  }
  return members
}
