import { supabase } from '../supabase'
import { rupees } from '../money'
import type { ListFilters } from './listQuery'
import type { ListQueryResult } from './useList'
import type { Database } from '../../types/supabase'
import {
  CASES,
  type Case,
  type CaseType,
  type CasePriority,
  type CaseStatus,
  type CaseFlag,
  type CounterpartyKind,
  type CaseEvidence,
  type LinkedRecords,
  type TimelineEntry,
  type CaseApproval,
  CASE_TYPES,
  CASE_TYPE_ICON,
  DISPOSITIONS_BY_TYPE,
  CASE_FLAGS,
  CASE_FLAG_META,
  CASE_STATUSES,
  CASE_STATUS_META,
  CASE_PRIORITIES,
  CASE_PRIORITY_META,
  CASE_WORKSPACE_ROUTE,
  statusCounts,
  openCasesCount,
  awaitingDecisionCount,
  exposurePaisa,
  recoveredThisMonthPaisa,
  outstandingOf,
  ageDays,
  isOpenStatus,
  isSettledStatus,
  CASES_EXPORT_UNAVAILABLE_REASON,
  NEW_CASE_UNAVAILABLE_REASON,
} from '../../data/cases'
import { findClientIdByBooking as findClientInFixtures } from '../../data/clients'

export type {
  Case,
  CaseType,
  CasePriority,
  CaseStatus,
  CaseFlag,
  CounterpartyKind,
  CaseEvidence,
  LinkedRecords,
  TimelineEntry,
  CaseApproval,
}

export {
  CASES,
  CASE_TYPES,
  CASE_TYPE_ICON,
  DISPOSITIONS_BY_TYPE,
  CASE_FLAGS,
  CASE_FLAG_META,
  CASE_STATUSES,
  CASE_STATUS_META,
  CASE_PRIORITIES,
  CASE_PRIORITY_META,
  CASE_WORKSPACE_ROUTE,
  statusCounts,
  openCasesCount,
  awaitingDecisionCount,
  exposurePaisa,
  recoveredThisMonthPaisa,
  outstandingOf,
  ageDays,
  isOpenStatus,
  isSettledStatus,
  CASES_EXPORT_UNAVAILABLE_REASON,
  NEW_CASE_UNAVAILABLE_REASON,
}

export function findClientIdByBooking(bookingNo: string | undefined): string | undefined {
  return findClientInFixtures(bookingNo)
}

export type SystemRoleDb = Database['public']['Enums']['system_role']

export const CASES_RESTRICTED_REASON =
  'Incident cases are restricted to internal staff. This is not a statement about whether cases exist.'

export function casesRestriction(role: SystemRoleDb | null | undefined): { restricted: boolean; restrictedReason: string } {
  return {
    restricted: role == null || role === 'Client',
    restrictedReason: CASES_RESTRICTED_REASON,
  }
}

export interface CaseFilters extends ListFilters {
  status?: string | undefined
}

export interface CaseRowDb {
  id: string
  client_uuid: string
  case_no: string
  type: string
  title: string
  counterparty_kind: string
  counterparty_name: string
  priority: string
  status: string
  disposition: string | null
  linked_booking_id: string | null
  assessed_amount: number | null
  deposit_held_amount: number | null
  charged_to_client_amount: number | null
  deposit_applied_amount: number | null
  insurance_claimed_amount: number | null
  warranty_covered_amount: number | null
  recovered_from_partner_amount: number | null
  absorbed_amount: number | null
  owner_id: string | null
  flags: string[] | null
  opened_at: string
  settled_at: string | null
  created_at: string
}

export function mapDbRowToCase(row: CaseRowDb): Case {
  return {
    id: row.case_no || row.id,
    type: (row.type as CaseType) || 'Damage',
    title: row.title || 'Untitled Case',
    counterpartyKind: (row.counterparty_kind as CounterpartyKind) || 'Client',
    counterpartyName: row.counterparty_name || 'Unknown',
    equipment: [],
    priority: (row.priority as CasePriority) || 'Medium',
    status: (row.status as CaseStatus) || 'Open',
    disposition: row.disposition ?? null,
    assessedPaisa: rupees(row.assessed_amount ?? 0),
    depositHeldPaisa: rupees(row.deposit_held_amount ?? 0),
    chargedToClientPaisa: rupees(row.charged_to_client_amount ?? 0),
    depositAppliedPaisa: rupees(row.deposit_applied_amount ?? 0),
    insuranceClaimedPaisa: rupees(row.insurance_claimed_amount ?? 0),
    warrantyCoveredPaisa: rupees(row.warranty_covered_amount ?? 0),
    recoveredFromPartnerPaisa: rupees(row.recovered_from_partner_amount ?? 0),
    absorbedPaisa: rupees(row.absorbed_amount ?? 0),
    openedAd: row.opened_at ? new Date(row.opened_at) : new Date(),
    ...(row.settled_at ? { settledAd: new Date(row.settled_at) } : {}),
    owner: 'Babin Shrestha',
    ownerRole: 'Owner',
    flags: (row.flags as CaseFlag[]) || [],
    linked: {
      linkedRecordKind: 'Booking',
      linkedRecordId: row.linked_booking_id || '',
    },
    evidence: {},
  }
}

/**
 * Reads cases from the Postgres `cases` table.
 * Returns empty records { rows: [], total: 0 } when the database is empty or on error.
 */
const CASE_COLUMNS =
  'id, client_uuid, case_no, type, title, counterparty_kind, counterparty_name, priority, status, disposition, ' +
  'linked_booking_id, assessed_amount, deposit_held_amount, charged_to_client_amount, deposit_applied_amount, ' +
  'insurance_claimed_amount, warranty_covered_amount, recovered_from_partner_amount, absorbed_amount, owner_id, ' +
  'flags, opened_at, settled_at, created_at'

export async function listCases(filters?: CaseFilters): Promise<ListQueryResult<Case>> {
  try {
    let query = supabase
      .from('cases_v')
      .select(CASE_COLUMNS)
      .order('opened_at', { ascending: false })

    if (filters?.search && filters.search.trim().length > 0) {
      const term = filters.search.trim()
      query = query.or(`title.ilike.%${term}%,case_no.ilike.%${term}%,counterparty_name.ilike.%${term}%`)
    }

    if (filters?.status && filters.status !== 'All') {
      query = query.eq('status', filters.status)
    }

    const { data, error } = await query

    if (error) throw error

    const mapped = ((data ?? []) as unknown as CaseRowDb[]).map(mapDbRowToCase)
    return {
      rows: mapped,
      total: mapped.length,
    }
  } catch (error) {
    throw error instanceof Error ? error : new Error('Cases could not be loaded.')
  }
}
