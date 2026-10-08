import { supabase } from '../supabase'
import type { ListFilters } from './listQuery'
import type { ListQueryResult } from './useList'
import {
  ACTIVITY_MODULES,
  ACTIVITY_ROWS,
  ACTIVITY_TIMELINE,
  ACTIVITY_METRICS,
  RETENTION_NOTE,
  ACTIVITY_USERS,
  ACTIVITY_MODULES_PRESENT,
  ACTIVITY_DAYS,
  targetLabel,
  type ActivityModule,
  type ActivityStatus,
  type ActivityTarget,
  type ActivityRow,
} from '../../data/activityLog'

export {
  ACTIVITY_MODULES,
  ACTIVITY_ROWS,
  ACTIVITY_TIMELINE,
  ACTIVITY_METRICS,
  RETENTION_NOTE,
  ACTIVITY_USERS,
  ACTIVITY_MODULES_PRESENT,
  ACTIVITY_DAYS,
  targetLabel,
}

export type {
  ActivityModule,
  ActivityStatus,
  ActivityTarget,
  ActivityRow,
}

interface AuditEventRowDb {
  id: string
  created_at: string
  action: string
  module: string
  status: string
  record_id: string | null
  table_name: string | null
  ip_address: string | null
}

function mapModuleToActivityModule(m: string | null | undefined): ActivityModule {
  switch (m) {
    case 'Rentals':
    case 'Finance':
    case 'Inventory':
    case 'Clients':
    case 'Crew Assist':
    case 'Operations':
    case 'Tools':
    case 'Settings':
    case 'Authentication':
      return m
    default:
      return 'Operations'
  }
}

export async function listActivityEvents(_filters?: ListFilters): Promise<ListQueryResult<ActivityRow>> {
  try {
    const { data, error } = await supabase
      .from('audit_events')
      .select('id, created_at, action, module, status, record_id, table_name, ip_address')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      return {
        rows: [],
        total: 0,
      }
    }

    const rows: ActivityRow[] = ((data ?? []) as unknown as AuditEventRowDb[]).map((e, idx) => ({
      id: `ACT-${String(idx + 1).padStart(3, '0')}`,
      timestamp: e.created_at,
      user: 'Staff Member',
      action: e.action || 'Performed action',
      module: mapModuleToActivityModule(e.module),
      target: e.table_name ? { kind: e.table_name, code: null, ...(e.record_id ? { label: e.record_id } : {}) } : null,
      where: `${e.module || 'System'} ▸ ${e.action || 'Activity'}`,
      status: e.status === 'failure' || e.status === 'Failed' ? 'Failed' : 'Success',
      ip: e.ip_address || '127.0.0.1',
      location: 'Kathmandu, NP',
    }))

    return {
      rows,
      total: rows.length,
    }
  } catch {
    return {
      rows: [],
      total: 0,
    }
  }
}
