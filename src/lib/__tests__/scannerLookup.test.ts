import { describe, it, expect } from 'vitest'
import { resolveScannedCode } from '../scannerLookup'

describe('AUD-002: Barcode Scanner Truthfulness', () => {
  it('returns unknown_code for empty input', async () => {
    const res = await resolveScannedCode('')
    expect(res.status).toBe('unknown_code')
    expect(res.code).toBe('')
  })

  it('returns unknown_code for unrecognized barcode without claiming verified success', async () => {
    const fakeBarcode = 'RANDOM_9999_NON_EXISTENT'
    const res = await resolveScannedCode(fakeBarcode)
    expect(res.status).toBe('unknown_code')
    expect(res.code).toBe(fakeBarcode)
    if (res.status === 'unknown_code') {
      expect(res.message).toContain('Unknown code')
    }
  })

  it('safely handles UUID strings without throw', async () => {
    const randomUuid = '12345678-1234-1234-1234-123456789abc'
    const res = await resolveScannedCode(randomUuid)
    expect(res.status).toBeDefined()
    // It should not throw or return 'ok' as false positive
    expect(['unknown_code', 'unit_matched', 'booking_matched', 'product_matched', 'query_failed']).toContain(res.status)
  })
})
