import { describe, it, expect } from 'vitest'
import { deterministicUuid, operationSessionId } from '../deterministicId'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const BOOKING_A = '11111111-2222-4333-8444-555555555555'
const BOOKING_B = '99999999-8888-4777-8666-555555555555'

describe('deterministicUuid', () => {
  it('is stable across calls — the whole point', async () => {
    const a = await deterministicUuid('ns', 'name')
    const b = await deterministicUuid('ns', 'name')
    expect(a).toBe(b)
  })

  it('produces a well-formed uuid', async () => {
    expect(await deterministicUuid('ns', 'name')).toMatch(UUID_RE)
  })

  it('stamps version 8 and the RFC variant', async () => {
    const u = await deterministicUuid('ns', 'name')
    expect(u[14]).toBe('8') // version nibble
    expect(['8', '9', 'a', 'b']).toContain(u[19]) // variant 10xx
  })

  it('separates the namespace from the name, so a shifted boundary is a different id', async () => {
    // Without a separator, ('ab','c') and ('a','bc') would hash identically.
    expect(await deterministicUuid('ab', 'c')).not.toBe(await deterministicUuid('a', 'bc'))
  })

  it('changes when either input changes', async () => {
    const base = await deterministicUuid('ns', 'name')
    expect(await deterministicUuid('ns2', 'name')).not.toBe(base)
    expect(await deterministicUuid('ns', 'name2')).not.toBe(base)
  })
})

describe('operationSessionId — two dead-zone devices must agree', () => {
  it('two devices computing the same session land on one id', async () => {
    const deviceA = await operationSessionId(BOOKING_A, 'Packing', 1)
    const deviceB = await operationSessionId(BOOKING_A, 'Packing', 1)
    expect(deviceA).toBe(deviceB)
  })

  it('is a valid uuid, so it can be written to operation_sessions.id', async () => {
    expect(await operationSessionId(BOOKING_A, 'Handover', 2)).toMatch(UUID_RE)
  })

  it('distinguishes the three facts that identify a session', async () => {
    const base = await operationSessionId(BOOKING_A, 'Handover', 1)
    expect(await operationSessionId(BOOKING_B, 'Handover', 1)).not.toBe(base) // other booking
    expect(await operationSessionId(BOOKING_A, 'Return', 1)).not.toBe(base) // other operation
    expect(await operationSessionId(BOOKING_A, 'Handover', 2)).not.toBe(base) // evening collection
  })

  it('keeps the morning and evening collection apart — the case an operational-day key collapses', async () => {
    // §4.43(d).3 proposed keying on (booking, operation, operational_day). Both of
    // these sessions share one operational day, so that key would merge them.
    const morning = await operationSessionId(BOOKING_A, 'Return', 1)
    const evening = await operationSessionId(BOOKING_A, 'Return', 2)
    expect(morning).not.toBe(evening)
  })

  it('does not depend on any clock, setting or device state', async () => {
    // Nothing here reads Date, localStorage or a random source. Called twice with
    // a mutated global clock, the answer must not move.
    const before = await operationSessionId(BOOKING_A, 'Packing', 1)
    const realNow = Date.now
    try {
      Date.now = () => 0
      expect(await operationSessionId(BOOKING_A, 'Packing', 1)).toBe(before)
    } finally {
      Date.now = realNow
    }
  })

  it('refuses a session_no the column could not hold', async () => {
    await expect(operationSessionId(BOOKING_A, 'Packing', 0)).rejects.toThrow(/1-based/)
    await expect(operationSessionId(BOOKING_A, 'Packing', 1.5)).rejects.toThrow(/1-based/)
    await expect(operationSessionId(BOOKING_A, 'Packing', -1)).rejects.toThrow(/1-based/)
  })

  it('refuses missing identifiers rather than hashing an empty string', async () => {
    await expect(operationSessionId('', 'Packing', 1)).rejects.toThrow(/bookings\.id/)
    await expect(operationSessionId(BOOKING_A, '', 1)).rejects.toThrow(/operation_kind/)
  })

  it('is stable against a known value, so a refactor that re-keys every session fails here', async () => {
    // Pinned deliberately: changing the namespace or the join format silently
    // orphans every session already written on a device. That must break a test.
    expect(await operationSessionId(BOOKING_A, 'Packing', 1)).toBe(
      await deterministicUuid(
        'babin.rentals.os/operation_sessions/v1',
        `${BOOKING_A}:Packing:1`,
      ),
    )
  })
})
