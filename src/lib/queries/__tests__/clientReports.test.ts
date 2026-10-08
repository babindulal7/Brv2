import { describe, it, expect } from 'vitest'
import {
  getClientReportsSummary,
  KPIS,
  GROWTH,
  CLIENTS,
  SUMMARY,
} from '../clientReports'

describe('clientReports queries', () => {
  it('returns valid client reports summary with positive counts', async () => {
    const summary = await getClientReportsSummary()
    expect(summary).toBeDefined()
    expect(summary.totalClients).toBeGreaterThan(0)
    expect(summary.activeClients).toBeGreaterThan(0)
    expect(summary.kpis.length).toBeGreaterThan(0)
    expect(summary.clients.length).toBeGreaterThan(0)
  })

  it('exposes baseline fixtures and charts data correctly', () => {
    expect(KPIS.length).toBe(4)
    expect(GROWTH.series.length).toBe(3)
    expect(CLIENTS.length).toBeGreaterThan(0)
    expect(SUMMARY.length).toBe(6)
  })
})
