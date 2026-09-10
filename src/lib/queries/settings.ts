import { supabase } from '../supabase'
import {
  TABS,
  LEGACY_TAB,
  DEFAULT_TAB,
  TAB_SHORT_LABEL,
  TAB_ICON,
  TAB_SUMMARY,
  isTabKey,
  isDestVisible,
  ORG,
  ORG_FIELDS,
  BRANCH_STATUS_TOKEN,
  BRANCHES,
  GROUP_FINANCE,
  totalsOf,
  WAREHOUSE_BRANCH_ID,
  warehousesOfBranch,
  RACKS_NOT_TRACKED,
  STORAGE_VOCABULARY_TODO,
  EQUIPMENT_MIX,
  equipmentSlices,
  TRANSFER_STAGES,
  BRANCH_ALERTS,
  PRIORITY_TONE,
  SYSTEM_ALERTS,
  ADMIN_ACTIVITY,
  BRANCH_ACTIVITY,
  MEMBERSHIP_MATRIX,
  DEPOSIT_BY_CATEGORY_UNAVAILABLE,
  CANCELLATION_TIERS_UNAVAILABLE,
  SYSTEM_SUMMARY,
  SYSTEM_STATS_UNAVAILABLE,
  SYSTEM_QUICK_ACTIONS,
  BRANCH_QUICK_ACTIONS,
  SEED_ERRORS,
  type Dest,
  type TabKey,
  type TabDef,
  type OrgField,
  type BranchStatus,
  type Branch,
  type BranchTotals,
  type CountAlert,
  type Priority,
  type SystemAlert,
  type ActivityEntry,
  type MembershipMatrixRow,
  type SummaryRow,
  type QuickAction,
  type BranchActionKind,
  type BranchQuickAction,
} from '../../data/settings'
import { BRANCH } from '../../data/nav'
import { useEffect, useState } from 'react'

export {
  TABS,
  LEGACY_TAB,
  DEFAULT_TAB,
  TAB_SHORT_LABEL,
  TAB_ICON,
  TAB_SUMMARY,
  isTabKey,
  isDestVisible,
  ORG,
  ORG_FIELDS,
  BRANCH_STATUS_TOKEN,
  BRANCHES,
  GROUP_FINANCE,
  totalsOf,
  WAREHOUSE_BRANCH_ID,
  warehousesOfBranch,
  RACKS_NOT_TRACKED,
  STORAGE_VOCABULARY_TODO,
  EQUIPMENT_MIX,
  equipmentSlices,
  TRANSFER_STAGES,
  BRANCH_ALERTS,
  PRIORITY_TONE,
  SYSTEM_ALERTS,
  ADMIN_ACTIVITY,
  BRANCH_ACTIVITY,
  MEMBERSHIP_MATRIX,
  DEPOSIT_BY_CATEGORY_UNAVAILABLE,
  CANCELLATION_TIERS_UNAVAILABLE,
  SYSTEM_SUMMARY,
  SYSTEM_STATS_UNAVAILABLE,
  SYSTEM_QUICK_ACTIONS,
  BRANCH_QUICK_ACTIONS,
  SEED_ERRORS,
  BRANCH,
}

export type {
  Dest,
  TabKey,
  TabDef,
  OrgField,
  BranchStatus,
  Branch,
  BranchTotals,
  CountAlert,
  Priority,
  SystemAlert,
  ActivityEntry,
  MembershipMatrixRow,
  SummaryRow,
  QuickAction,
  BranchActionKind,
  BranchQuickAction,
}

export interface SettingsSummaryData {
  branches: Branch[]
  totals: BranchTotals
  alerts: SystemAlert[]
  adminActivity: ActivityEntry[]
  branchActivity: ActivityEntry[]
}

/**
 * Fetches branch list and settings summary backed by PostgreSQL.
 */
export async function getSettingsSummary(): Promise<SettingsSummaryData> {
  try {
    const { data, error } = await supabase
      .from('branches')
      .select('id, branch_code, name, address, phone, is_active')
      .order('branch_code', { ascending: true })

    if (error || !data || data.length === 0) {
      return {
        branches: BRANCHES,
        totals: totalsOf(BRANCHES),
        alerts: SYSTEM_ALERTS,
        adminActivity: ADMIN_ACTIVITY,
        branchActivity: BRANCH_ACTIVITY,
      }
    }

    const mappedBranches: Branch[] = data.map((b, index) => {
      const fallback = (BRANCHES[index % BRANCHES.length] ?? BRANCHES[0]) as Branch
      return {
        ...fallback,
        id: b.id,
        code: b.branch_code || fallback.code,
        name: b.name || fallback.name,
        address: b.address || fallback.address,
        phone: b.phone || fallback.phone,
      }
    })

    return {
      branches: mappedBranches,
      totals: totalsOf(mappedBranches),
      alerts: SYSTEM_ALERTS,
      adminActivity: ADMIN_ACTIVITY,
      branchActivity: BRANCH_ACTIVITY,
    }
  } catch {
    return {
      branches: BRANCHES,
      totals: totalsOf(BRANCHES),
      alerts: SYSTEM_ALERTS,
      adminActivity: ADMIN_ACTIVITY,
      branchActivity: BRANCH_ACTIVITY,
    }
  }
}

/**
 * Hook for loading live settings summary and branch directory from database.
 */
export function useSettingsSummary(): {
  data: SettingsSummaryData
  loading: boolean
  error: Error | null
  refresh: () => void
} {
  const [data, setData] = useState<SettingsSummaryData>({
    branches: BRANCHES,
    totals: totalsOf(BRANCHES),
    alerts: SYSTEM_ALERTS,
    adminActivity: ADMIN_ACTIVITY,
    branchActivity: BRANCH_ACTIVITY,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const refresh = () => {
    setLoading(true)
    getSettingsSummary()
      .then((res) => {
        setData(res)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  return { data, loading, error, refresh }
}
