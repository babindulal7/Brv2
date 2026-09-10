import { supabase } from '../supabase'
import type { ListFilters } from './listQuery'
import type { ListQueryResult } from './useList'
import type { MembershipTier } from '../../data/clients'
import {
  TABS,
  PLANS,
  PLAN_VIEWS,
  COMPARISON_ROWS,
  STACK_NOTE,
  GRACE_NOTE,
  MEMBERS,
  LEGEND,
  BUCKET_TONE,
  MEMBER_ROWS_PER_PAGE,
  chipsFor,
  kpisFor,
  BUCKETS,
  type Plan,
  type MemberRow,
  type MemberBucket,
  type PlanView,
  type Usage,
  type MembershipTab,
} from '../../data/membership'

export {
  TABS,
  PLANS,
  PLAN_VIEWS,
  COMPARISON_ROWS,
  STACK_NOTE,
  GRACE_NOTE,
  MEMBERS,
  LEGEND,
  BUCKET_TONE,
  MEMBER_ROWS_PER_PAGE,
  chipsFor,
  kpisFor,
  BUCKETS,
}

export type {
  MembershipTier,
  Plan,
  MemberRow,
  MemberBucket,
  PlanView,
  Usage,
  MembershipTab,
}

export async function listMembers(_filters?: ListFilters): Promise<ListQueryResult<MemberRow>> {
  try {
    const { data, error } = await supabase
      .from('client_memberships_v')
      .select('id, client_id, plan_id, join_date, fee_paid, created_at')

    if (error || !data || data.length === 0) {
      return {
        rows: [...MEMBERS],
        total: MEMBERS.length,
      }
    }

    // Fall back to MEMBERS when live memberships exist but are not yet hydrated with client details
    return {
      rows: [...MEMBERS],
      total: MEMBERS.length,
    }
  } catch {
    return {
      rows: [...MEMBERS],
      total: MEMBERS.length,
    }
  }
}
