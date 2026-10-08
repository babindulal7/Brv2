// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  computeWarrantyState,
  getWarrantyItems,
  saveWarrantyItems,
  recordWarrantyClaim,
  getWarrantyStats,
  type WarrantyItem,
} from '../warranty'

describe('warranty queries', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  describe('computeWarrantyState', () => {
    const fixedNow = new Date('2026-10-01T00:00:00.000Z')

    it('identifies Active warranty (> 60 days remaining)', () => {
      const res = computeWarrantyState('2026-12-15', fixedNow)
      expect(res.state).toBe('Active')
      expect(res.days).toBeGreaterThan(60)
    })

    it('identifies Expiring warranty (0 to 60 days remaining)', () => {
      const res = computeWarrantyState('2026-10-25', fixedNow)
      expect(res.state).toBe('Expiring')
      expect(res.days).toBe(24)
    })

    it('identifies Expired warranty (< 0 days remaining)', () => {
      const res = computeWarrantyState('2026-09-01', fixedNow)
      expect(res.state).toBe('Expired')
      expect(res.days).toBeLessThan(0)
    })
  })

  describe('getWarrantyItems and localStorage recomputation', () => {
    const fixedNow = new Date('2026-10-01T00:00:00.000Z')

    it('returns seed items with recomputed status when storage is empty', () => {
      const items = getWarrantyItems(fixedNow)
      expect(items.length).toBeGreaterThan(0)
      expect(items[0]?.id).toBe('WAR-01')
      expect(['Active', 'Expiring', 'Expired']).toContain(items[0]?.status)
    })

    it('recomputes dynamic daysRemaining and status even when loaded from localStorage', () => {
      const staleStoredItem: WarrantyItem = {
        id: 'WAR-99',
        name: 'Test Rig',
        serialNo: 'TR-100',
        category: 'Grip',
        provider: 'Local Dealer',
        startDate: '2024-01-01',
        endDate: '2026-09-15', // Past date relative to fixedNow
        termMonths: 24,
        premiumCost: 5000,
        claimsCount: 0,
        claimsRecovered: 0,
        status: 'Active', // stale status in storage!
        daysRemaining: 120, // stale days
      }

      saveWarrantyItems([staleStoredItem])

      const refreshed = getWarrantyItems(fixedNow)
      expect(refreshed.length).toBe(1)
      expect(refreshed[0]?.status).toBe('Expired') // correctly refreshed!
      expect(refreshed[0]?.daysRemaining).toBeLessThan(0)
    })
  })

  describe('recordWarrantyClaim', () => {
    const fixedNow = new Date('2026-10-01T00:00:00.000Z')

    it('updates claim count and recovered amount', () => {
      const items = getWarrantyItems(fixedNow)
      const target = items[0]!
      const initialRecovered = target.claimsRecovered
      const initialCount = target.claimsCount

      const updated = recordWarrantyClaim(target.id, 15000, 'Motor repair')
      const targetUpdated = updated.find((i) => i.id === target.id)!

      expect(targetUpdated.claimsCount).toBe(initialCount + 1)
      expect(targetUpdated.claimsRecovered).toBe(initialRecovered + 15000)
      expect(targetUpdated.notes).toContain('Motor repair')
    })
  })

  describe('getWarrantyStats', () => {
    it('accurately computes summary metrics', () => {
      const mockItems: WarrantyItem[] = [
        {
          id: 'W1',
          name: 'A',
          serialNo: 'S1',
          category: 'C',
          provider: 'P',
          startDate: '2025-01-01',
          endDate: '2027-01-01',
          termMonths: 24,
          premiumCost: 10000,
          claimsCount: 1,
          claimsRecovered: 5000,
          status: 'Active',
          daysRemaining: 400,
        },
        {
          id: 'W2',
          name: 'B',
          serialNo: 'S2',
          category: 'C',
          provider: 'P',
          startDate: '2025-01-01',
          endDate: '2026-10-15',
          termMonths: 21,
          premiumCost: 10000,
          claimsCount: 0,
          claimsRecovered: 0,
          status: 'Expiring',
          daysRemaining: 14,
        },
        {
          id: 'W3',
          name: 'C',
          serialNo: 'S3',
          category: 'C',
          provider: 'P',
          startDate: '2024-01-01',
          endDate: '2026-01-01',
          termMonths: 24,
          premiumCost: 10000,
          claimsCount: 2,
          claimsRecovered: 15000,
          status: 'Expired',
          daysRemaining: -200,
        },
      ]

      const stats = getWarrantyStats(mockItems)
      expect(stats.totalPremiums).toBe(30000)
      expect(stats.totalRecovered).toBe(20000)
      expect(stats.activeCount).toBe(1)
      expect(stats.expiringSoonCount).toBe(1)
      expect(stats.expiredCount).toBe(1)
      expect(stats.recoveryRatePct).toBe(67) // Math.round((20000 / 30000) * 100)
    })
  })
})
