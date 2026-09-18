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

    if (error) {
      return {
        branches: [],
        totals: totalsOf([]),
        alerts: [],
        adminActivity: [],
        branchActivity: [],
      }
    }

    const mappedBranches: Branch[] = (data ?? []).map((b) => {
      return {
        id: b.id,
        code: b.branch_code || '',
        name: b.name || '',
        address: b.address || '',
        phone: b.phone || '',
        // Fields not yet exposed by the DB query — stubs, not seed values.
        // When the DB view adds these columns, map them here.
        city: '',
        manager: '',
        warehouses: 0,
        staff: 0,
        equipment: 0,
        revenue: 0 as import('../money').Paisa,
        utilization: 0,
        growthPercent: 0,
        status: (b.is_active ? 'Active' : 'Inactive') as import('../../data/settings').BranchStatus,
      }
    })

    return {
      branches: mappedBranches,
      totals: totalsOf(mappedBranches),
      alerts: [],
      adminActivity: [],
      branchActivity: [],
    }
  } catch {
    return {
      branches: [],
      totals: totalsOf([]),
      alerts: [],
      adminActivity: [],
      branchActivity: [],
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
    branches: [],
    totals: totalsOf([]),
    alerts: [],
    adminActivity: [],
    branchActivity: [],
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
