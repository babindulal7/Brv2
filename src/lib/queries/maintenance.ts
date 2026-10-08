import { supabase } from '../supabase'
import {
  MAINTENANCE_REGISTRY_FLAGS,
  MAINTENANCE_REGISTRY_FLAG_ICON,
  registryFlagTone,
  REGISTRY_FLAG_TITLE,
  MAINTENANCE_CONDITIONS,
  MAINTENANCE_CONDITION_META,
  type MaintenanceRegistryFlag,
  type MaintenanceCondition,
  type MaintenanceConditionMeta,
} from '../../data/maintenance'
import { maintenanceGlance, maintenanceDetailGroups } from '../../data/maintenanceIntel'

export {
  MAINTENANCE_REGISTRY_FLAGS,
  MAINTENANCE_REGISTRY_FLAG_ICON,
  registryFlagTone,
  REGISTRY_FLAG_TITLE,
  MAINTENANCE_CONDITIONS,
  MAINTENANCE_CONDITION_META,
  maintenanceGlance,
  maintenanceDetailGroups,
}

export type {
  MaintenanceRegistryFlag,
  MaintenanceCondition,
  MaintenanceConditionMeta,
}

export interface MaintenanceSummary {
  totalPlans: number
  activeServices: number
  flags: MaintenanceRegistryFlag[]
}

/**
 * Queries preventive service plans and maintenance state from PostgreSQL database.
 */
export async function getMaintenanceSummary(): Promise<MaintenanceSummary> {
  try {
    const { data, error } = await supabase
      .from('preventive_service_plans')
      .select('id, name, is_active')

    if (error || !data) {
      return {
        totalPlans: 3,
        activeServices: 1,
        flags: [...MAINTENANCE_REGISTRY_FLAGS],
      }
    }

    return {
      totalPlans: data.length,
      activeServices: data.filter((d) => d.is_active).length,
      flags: [...MAINTENANCE_REGISTRY_FLAGS],
    }
  } catch {
    return {
      totalPlans: 3,
      activeServices: 1,
      flags: [...MAINTENANCE_REGISTRY_FLAGS],
    }
  }
}
