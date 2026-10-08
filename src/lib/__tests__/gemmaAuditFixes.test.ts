import { describe, it, expect } from 'vitest'
import {
  parseMoney,
  rupees,
} from '../money'
import {
  NON_MONEY_RETURNING_COLUMNS,
  safeUpdate,
} from '../dataAccess'
import {
  db,
  resetStaleSyncingMutations,
} from '../offlineQueue'

describe('Gemma Audit Post-Remediation Tests', () => {
  describe('Domain 1 & 4: Non-Money Column Grants & Safe Update Fail-Closed', () => {
    it('defines explicit non-money column grants for the 4 tables locked by migration 0062', () => {
      expect(NON_MONEY_RETURNING_COLUMNS.bookings).toBeDefined()
      expect(NON_MONEY_RETURNING_COLUMNS.booking_lines).toBeDefined()
      expect(NON_MONEY_RETURNING_COLUMNS.products).toBeDefined()
      expect(NON_MONEY_RETURNING_COLUMNS.product_units).toBeDefined()

      // Verify that money columns are NOT in the default non-money returning lists
      expect(NON_MONEY_RETURNING_COLUMNS.bookings).not.toContain('deposit_required')
      expect(NON_MONEY_RETURNING_COLUMNS.booking_lines).not.toContain('rate')
      expect(NON_MONEY_RETURNING_COLUMNS.products).not.toContain('daily_rate')
    })

    it('rejects immutable tables when calling safeUpdate', async () => {
      await expect(
        // @ts-expect-error testing runtime guard
        safeUpdate('payments', 'pay-123', { amount_paisa: 1000 }),
      ).rejects.toThrow('Mutation Law 4 Violation: payments is immutable')

      await expect(
        // @ts-expect-error testing runtime guard
        safeUpdate('booking_stage_transitions', 'trans-123', { stage: 'Packed' }),
      ).rejects.toThrow('Mutation Law 4 Violation: booking_stage_transitions is immutable')
    })
  })

  describe('Domain 2: Financial Precision & Parsing Safety', () => {
    it('parses typical and edge-case currency strings into exact integer Paisa', () => {
      expect(parseMoney('19.99')).toBe(1999)
      expect(parseMoney('0.01')).toBe(1)
      expect(parseMoney('0.00')).toBe(0)
      expect(parseMoney('-0.50')).toBe(-50)
      expect(parseMoney('Rs 2,50,000')).toBe(25_000_000)
      expect(parseMoney('1,39,506.75')).toBe(13_950_675)
    })

    it('handles rounding on 3+ decimal fractions half-up', () => {
      expect(parseMoney('10.555')).toBe(1056)
      expect(parseMoney('10.554')).toBe(1055)
      expect(parseMoney('-10.555')).toBe(-1056)
    })

    it('safeguards rupees(n) from IEEE 754 precision drift', () => {
      expect(rupees(19.99)).toBe(1999)
      expect(rupees(0.1 + 0.2)).toBe(30)
      expect(rupees(NaN)).toBe(0)
      expect(rupees(Infinity)).toBe(0)
    })
  })

  describe('Domain 4: In-flight Mutation Recovery (E-P1-2)', () => {
    it('resets stranded syncing mutations back to pending for replay', async () => {
      if (typeof indexedDB === 'undefined') return // Skip in environments without Dexie IndexedDB

      const mutationId = await db.mutations.add({
        clientUuid: 'test-syncing-uuid',
        table: 'notes',
        action: 'insert',
        payload: { text: 'Test note' },
        timestamp: new Date().toISOString(),
        status: 'syncing',
      })

      const recoveredCount = await resetStaleSyncingMutations()
      expect(recoveredCount).toBeGreaterThanOrEqual(1)

      const updated = await db.mutations.get(mutationId)
      expect(updated?.status).toBe('pending')

      await db.mutations.delete(mutationId)
    })
  })
})
