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
  event_timestamp: string
  actor_name: string | null
  action: string
  module: string
  status: string
  target_id: string | null
  target_type: string | null
  client_ip: string | null
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
      .select('id, event_timestamp, actor_name, action, module, status, target_id, target_type, client_ip')
      .order('event_timestamp', { ascending: false })
      .limit(100)

    if (error || !data || data.length === 0) {
      return {
        rows: [...ACTIVITY_TIMELINE],
        total: ACTIVITY_TIMELINE.length,
      }
    }

    const rows: ActivityRow[] = (data as unknown as AuditEventRowDb[]).map((e, idx) => ({
      id: `ACT-${String(idx + 1).padStart(3, '0')}`,
      timestamp: e.event_timestamp,
      user: e.actor_name || 'System User',
      action: e.action || 'Performed action',
      module: mapModuleToActivityModule(e.module),
      target: e.target_type ? { kind: e.target_type, code: null, ...(e.target_id ? { label: e.target_id } : {}) } : null,
      where: `${e.module || 'System'} ▸ ${e.action || 'Activity'}`,
      status: e.status === 'failure' || e.status === 'Failed' ? 'Failed' : 'Success',
      ip: e.client_ip || '127.0.0.1',
      location: 'Kathmandu, NP',
    }))

    return {
      rows,
      total: rows.length,
    }
  } catch {
    return {
      rows: [...ACTIVITY_TIMELINE],
      total: ACTIVITY_TIMELINE.length,
    }
  }
}
