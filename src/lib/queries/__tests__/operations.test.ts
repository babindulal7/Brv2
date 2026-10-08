import { describe, it, expect } from 'vitest'
import {
  QUEUES,
  GROUP_LABEL,
  queueFromParam,
  groupFromParam,
  jobRoute,
} from '../operations'

describe('operations query layer', () => {
  it('exports valid queues array', () => {
    expect(QUEUES.length).toBeGreaterThan(0)
  })

  it('maps queue parameter', () => {
    expect(queueFromParam('packing')).toBeDefined()
  })

  it('provides group labels', () => {
    expect(GROUP_LABEL['pickup']).toBeDefined()
    expect(GROUP_LABEL['return']).toBeDefined()
    expect(groupFromParam('pickup')).toBe('pickup')
  })

  it('resolves job route', () => {
    expect(jobRoute('B-100', 'Pack')).toBe('/rentals/B-100/packing')
  })
})
