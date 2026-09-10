import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listCases, mapDbRowToCase, casesRestriction, type CaseRowDb } from '../cases'
import { supabase } from '../../supabase'

vi.mock('../../supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  }
})

describe('cases queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('casesRestriction restricts Client and null roles', () => {
    expect(casesRestriction('Client').restricted).toBe(true)
    expect(casesRestriction(null).restricted).toBe(true)
    expect(casesRestriction(undefined).restricted).toBe(true)
    expect(casesRestriction('Owner').restricted).toBe(false)
    expect(casesRestriction('Warehouse').restricted).toBe(false)
    expect(casesRestriction('Coordinator').restricted).toBe(false)
  })

  it('mapDbRowToCase maps all database fields to canonical Case type', () => {
    const dbRow: CaseRowDb = {
      id: 'uuid-1234',
      client_uuid: 'client-uuid-1',
      case_no: 'CASE-2026-0001',
      type: 'Damage',
      title: 'Cracked Lens Element',
      counterparty_kind: 'Client',
      counterparty_name: 'Apex Cinema',
      priority: 'High',
      status: 'Open',
      disposition: null,
      linked_booking_id: 'booking-uuid-1',
      assessed_amount: 5000,
      deposit_held_amount: 10000,
      charged_to_client_amount: 0,
      deposit_applied_amount: 0,
      insurance_claimed_amount: 0,
      warranty_covered_amount: 0,
      recovered_from_partner_amount: 0,
      absorbed_amount: 0,
      owner_id: 'user-uuid-1',
      flags: ['Under Investigation'],
      opened_at: '2026-08-01T10:00:00Z',
      settled_at: null,
      created_at: '2026-08-01T10:00:00Z',
    }

    const c = mapDbRowToCase(dbRow)
    expect(c.id).toBe('CASE-2026-0001')
    expect(c.type).toBe('Damage')
    expect(c.title).toBe('Cracked Lens Element')
    expect(c.counterpartyKind).toBe('Client')
    expect(c.counterpartyName).toBe('Apex Cinema')
    expect(c.priority).toBe('High')
    expect(c.status).toBe('Open')
    expect(c.assessedPaisa).toBe(500000)
    expect(c.depositHeldPaisa).toBe(1000000)
    expect(c.openedAd).toEqual(new Date('2026-08-01T10:00:00Z'))
  })

  it('listCases returns database rows when Supabase returns data', async () => {
    const mockSelect = vi.fn().mockReturnThis()
    const mockOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'uuid-1',
          client_uuid: 'client-uuid-1',
          case_no: 'CASE-2026-0001',
          type: 'Damage',
          title: 'Cracked Lens',
          counterparty_kind: 'Client',
          counterparty_name: 'Kathmandu Film',
          priority: 'High',
          status: 'Open',
          disposition: null,
          linked_booking_id: null,
          assessed_amount: 12000,
          deposit_held_amount: 15000,
          charged_to_client_amount: 0,
          deposit_applied_amount: 0,
          insurance_claimed_amount: 0,
          warranty_covered_amount: 0,
          recovered_from_partner_amount: 0,
          absorbed_amount: 0,
          owner_id: null,
          flags: [],
          opened_at: '2026-08-10T12:00:00Z',
          settled_at: null,
          created_at: '2026-08-10T12:00:00Z',
        },
      ],
      error: null,
    })

    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
      order: mockOrder,
    })

    const result = await listCases()
    expect(result.rows.length).toBe(1)
    expect(result.rows[0]?.id).toBe('CASE-2026-0001')
    expect(result.rows[0]?.assessedPaisa).toBe(1200000)
  })

  it('listCases falls back to seeded CASES when Supabase returns error or empty', async () => {
    const mockSelect = vi.fn().mockReturnThis()
    const mockOrder = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    })

    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
      order: mockOrder,
    })

    const result = await listCases()
    expect(result.rows.length).toBeGreaterThan(0)
    expect(result.rows[0]?.id).toBeDefined()
  })
})
