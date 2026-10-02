import { beforeEach, describe, expect, it, vi } from 'vitest'

const { from, select, typeFilter, eq, maybeSingle } = vi.hoisted(() => ({
  from: vi.fn(), select: vi.fn(), typeFilter: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(),
}))

vi.mock('../../supabase', () => ({ IS_MOCK: false, supabase: { from } }))

import { getDocumentPreviewRecord, mapDbRowToDocRow } from '../documents'

beforeEach(() => {
  vi.clearAllMocks()
  const query = { in: typeFilter, eq, maybeSingle }
  from.mockReturnValue({ select })
  select.mockReturnValue(query)
  typeFilter.mockReturnValue(query)
  eq.mockReturnValue(query)
  maybeSingle.mockResolvedValue({ data: {
    id: '11111111-1111-4111-8111-111111111111', document_no: 'RA-1',
    document_type: 'Rental Agreement', lifecycle_status: 'Signed',
    booking_id: '22222222-2222-4222-8222-222222222222',
    created_at: '2026-09-29T09:00:00Z', signed_at: '2026-09-30T09:00:00Z',
  }, error: null })
})

describe('document preview projection', () => {
  it('keeps a supplied booking reference intact in the list and card action', () => {
    const row = mapDbRowToDocRow({
      id: '11111111-1111-4111-8111-111111111111', client_uuid: '33333333-3333-4333-8333-333333333333',
      document_no: 'RA-1', document_type: 'Rental Agreement', booking_id: 'B-716', client_id: null,
      lifecycle_status: 'Signed', file_url: '', file_size_bytes: null,
      generated_by: null, signed_at: null, signed_by_name: null, created_at: '2026-09-29T09:00:00Z',
    })
    expect(row.relatedTo).toBe('B-716')
  })

  it('requests only operational types for a money-blind role', async () => {
    const record = await getDocumentPreviewRecord('RA-1', false)
    expect(from).toHaveBeenCalledWith('document_registry')
    expect(select.mock.calls[0]?.[0]).not.toMatch(/file_url|signed_by_name|amount/)
    expect(typeFilter).toHaveBeenCalledOnce()
    const allowed = typeFilter.mock.calls[0]?.[1] as string[]
    expect(allowed).toContain('Rental Agreement')
    expect(allowed).not.toContain('Tax Invoice')
    expect(allowed).not.toContain('Receipt')
    expect(eq).toHaveBeenCalledWith('document_no', 'RA-1')
    expect(record).not.toHaveProperty('fileUrl')
  })

  it('limits Warehouse to its three document types and refuses Driver reads', async () => {
    await getDocumentPreviewRecord('RA-1', false, 'Warehouse')
    expect(typeFilter.mock.calls[0]?.[1]).toEqual(['Rental Agreement', 'Packing List', 'Delivery Note'])
    vi.clearAllMocks()
    expect(await getDocumentPreviewRecord('RA-1', false, 'Driver')).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it('allows an authorized finance document by UUID without claiming invoice ledger data', async () => {
    maybeSingle.mockResolvedValueOnce({ data: {
      id: '11111111-1111-4111-8111-111111111111', document_no: 'INV-1',
      document_type: 'Tax Invoice', lifecycle_status: 'Issued',
      booking_id: null, created_at: '2026-09-29T09:00:00Z', signed_at: null,
    }, error: null })
    const record = await getDocumentPreviewRecord('11111111-1111-4111-8111-111111111111', true)
    expect(typeFilter).not.toHaveBeenCalled()
    expect(eq).toHaveBeenCalledWith('id', '11111111-1111-4111-8111-111111111111')
    expect(record?.documentNo).toBe('INV-1')
    expect(record).not.toHaveProperty('totalPaisa')
  })
})
