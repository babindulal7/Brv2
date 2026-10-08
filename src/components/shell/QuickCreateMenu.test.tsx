// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { quickCreateActions } from './QuickCreateMenu'

describe('quickCreateActions', () => {
  it('only exposes flows granted to the user role', () => {
    expect(quickCreateActions('Client')).toEqual([])
    expect(quickCreateActions('Warehouse').map((action) => action.id)).toEqual(['rental', 'client', 'purchase-request'])
    expect(quickCreateActions('Owner').map((action) => action.to)).toEqual([
      '/rentals/new',
      '/clients/new',
      '/inventory/new',
      '/inventory/purchase-requests',
    ])
  })
})
