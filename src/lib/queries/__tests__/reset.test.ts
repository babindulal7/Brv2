import { describe, it, expect } from 'vitest'
import {
  getCleaningQueueSummary,
  SHARED_CLEAN_TASKS,
  DAMAGE_TYPES,
  SEVERITIES,
  PROBLEM_ROUTE,
  QUEUE_FILTERS,
} from '../reset'

describe('reset queries', () => {
  it('re-exports canonical reset checklist tasks and problem routes', () => {
    expect(SHARED_CLEAN_TASKS.length).toBeGreaterThan(0)
    expect(DAMAGE_TYPES.length).toBeGreaterThan(0)
    expect(SEVERITIES.length).toBeGreaterThan(0)
    expect(QUEUE_FILTERS.length).toBeGreaterThan(0)
    expect(PROBLEM_ROUTE['Missing Item']).toBeDefined()
  })

  it('queries cleaning queue summary with non-negative counts', async () => {
    const summary = await getCleaningQueueSummary()
    expect(summary.total).toBeGreaterThanOrEqual(0)
    expect(summary.inCleaning).toBeGreaterThanOrEqual(0)
    expect(summary.inQc).toBeGreaterThanOrEqual(0)
    expect(summary.ready).toBeGreaterThanOrEqual(0)
  })
})
