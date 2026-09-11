import { describe, it, expect } from 'vitest'
import { parseGateError, formatGateError, getGateDefinition } from '../gates'

describe('Gate Registry & Error Parser', () => {
  it('parses raw GATE string exceptions from PostgreSQL', () => {
    const raw = 'error: GATE:gate.pack.session_missing|Booked to Packed requires a completed pack session'
    const parsed = parseGateError(raw)
    expect(parsed.isGate).toBe(true)
    expect(parsed.gateId).toBe('gate.pack.session_missing')
    expect(parsed.cleanMessage).toBe('Booked to Packed requires a completed pack session')
    expect(parsed.definition).toBeDefined()
    expect(parsed.definition?.category).toBe('pack')
  })

  it('parses Error instances containing GATE exception strings', () => {
    const err = new Error('P0001: GATE:gate.close.invoice_unsettled|Invoices must be settled before closing')
    const parsed = parseGateError(err)
    expect(parsed.isGate).toBe(true)
    expect(parsed.gateId).toBe('gate.close.invoice_unsettled')
    expect(parsed.cleanMessage).toBe('Invoices must be settled before closing')
    expect(parsed.definition?.category).toBe('close')
  })

  it('parses PostgREST error object shapes', () => {
    const postgrestErr = {
      code: 'P0001',
      details: null,
      hint: null,
      message: 'GATE:gate.handover.agreement_unsigned|Cannot release without signed rental agreement',
    }
    const parsed = parseGateError(postgrestErr)
    expect(parsed.isGate).toBe(true)
    expect(parsed.gateId).toBe('gate.handover.agreement_unsigned')
    expect(parsed.cleanMessage).toBe('Cannot release without signed rental agreement')
    expect(parsed.definition?.category).toBe('handover')
  })

  it('parses legacy Gate Check Failure strings gracefully', () => {
    const legacy = 'Gate Check Failure: booking is Closed; no further stage transition is accepted.'
    const parsed = parseGateError(legacy)
    expect(parsed.isGate).toBe(true)
    expect(parsed.gateId).toBeNull()
    expect(parsed.cleanMessage).toBe('booking is Closed; no further stage transition is accepted.')
  })

  it('returns isGate: false for non-gate errors', () => {
    const plainErr = new Error('Connection refused at 127.0.0.1:5432')
    const parsed = parseGateError(plainErr)
    expect(parsed.isGate).toBe(false)
    expect(parsed.gateId).toBeNull()
    expect(parsed.cleanMessage).toBe('Connection refused at 127.0.0.1:5432')
  })

  it('formats known gate errors in English with operational guidance', () => {
    const err = 'GATE:gate.invoice.void_paid|Invoice has payments'
    const formattedEn = formatGateError(err, 'en')
    expect(formattedEn).toContain('Credit Note Required for Paid Invoice')
    expect(formattedEn).toContain('Issue a credit note for the paid amount before voiding the invoice.')
  })

  it('formats known gate errors in Nepali with Devanagari guidance', () => {
    const err = 'GATE:gate.invoice.void_paid|Invoice has payments'
    const formattedNe = formatGateError(err, 'ne')
    expect(formattedNe).toContain('क्रेडिट नोट आवश्यक')
    expect(formattedNe).toContain('क्रेडिट नोट जारी गर्नुहोस्')
  })

  it('falls back cleanly for unknown gate IDs', () => {
    const unknownGate = 'GATE:gate.custom.unknown_rule|Something failed custom check'
    const formatted = formatGateError(unknownGate, 'en')
    expect(formatted).toBe('Something failed custom check')
  })

  it('passes through non-gate errors untouched in formatGateError', () => {
    const nonGate = 'Duplicate key value violates unique constraint'
    expect(formatGateError(nonGate, 'en')).toBe(nonGate)
  })

  it('has all 28+ required stage gates registered with bilingual strings', () => {
    const requiredGates = [
      'gate.pack.session_missing',
      'gate.pack.units_unassigned',
      'gate.pack.units_unpacked',
      'gate.handover.session_missing',
      'gate.handover.units_unhanded',
      'gate.handover.agreement_unsigned',
      'gate.handover.payment_outstanding',
      'gate.return.session_missing',
      'gate.return.units_unaccounted',
      'gate.cancel.stage_too_late',
      'gate.cancel.reason_missing',
      'gate.reopen.role',
      'gate.close.no_invoice',
      'gate.close.invoice_unsettled',
      'gate.close.deposit_unresolved',
      'gate.close.open_case',
      'gate.close.reservation_live',
      'gate.invoice.void_reason',
      'gate.invoice.void_role',
      'gate.invoice.void_paid',
      'gate.invoice.void_immutable',
      'gate.payment.over_invoice',
      'gate.payment.over_booking',
      'gate.payment.booking_client_mismatch',
      'gate.unit_status.direct_write',
      'gate.users.role_ceiling',
      'gate.users.immutable',
      'gate.price.money_blind_override',
      'gate.booking_lines.money_blind_insert',
      'gate.discount.money_blind',
    ]

    for (const gid of requiredGates) {
      const def = getGateDefinition(gid)
      expect(def, `gate definition for ${gid} must exist`).toBeDefined()
      expect(def?.title.en).toBeTruthy()
      expect(def?.title.ne).toBeTruthy()
      expect(def?.message.en).toBeTruthy()
      expect(def?.message.ne).toBeTruthy()
      expect(def?.howToResolve.en).toBeTruthy()
      expect(def?.howToResolve.ne).toBeTruthy()
    }
  })
})
