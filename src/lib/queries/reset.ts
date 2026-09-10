import { supabase } from '../supabase'
import {
  SHARED_CLEAN_TASKS,
  DAMAGE_TYPES,
  SEVERITIES,
  PROBLEM_ROUTE,
  QUEUE_FILTERS,
  type QueueState,
  type ProblemState,
} from '../../data/reset'

export {
  SHARED_CLEAN_TASKS,
  DAMAGE_TYPES,
  SEVERITIES,
  PROBLEM_ROUTE,
  QUEUE_FILTERS,
}

export type { QueueState, ProblemState }

export interface CleaningQueueSummary {
  total: number
  inCleaning: number
  inQc: number
  ready: number
}

/**
 * Loads current cleaning queue counts from PostgreSQL database.
 */
export async function getCleaningQueueSummary(): Promise<CleaningQueueSummary> {
  try {
    const { data, error } = await supabase
      .from('cleaning_queue_entries')
      .select('state')

    if (error || !data) {
      return { total: 0, inCleaning: 0, inQc: 0, ready: 0 }
    }

    let inCleaning = 0
    let inQc = 0
    let ready = 0

    for (const row of data) {
      if (row.state === 'Cleaning') inCleaning++
      else if (row.state === 'QC') inQc++
      else if (row.state === 'Ready') ready++
    }

    return {
      total: data.length,
      inCleaning,
      inQc,
      ready,
    }
  } catch {
    return { total: 0, inCleaning: 0, inQc: 0, ready: 0 }
  }
}
