import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listDocuments, mapDbRowToDocRow, type DocumentRowDb } from '../documents'
import { supabase } from '../../supabase'

vi.mock('../../supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  }
})

describe('documents queries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mapDbRowToDocRow maps database document row to DocRow', () => {
    const row: DocumentRowDb = {
      id: 'doc-uuid-1',
      client_uuid: 'client-uuid-1',
      document_no: 'DOC-2026-0001',
      document_type: 'Rental Agreement',
      booking_id: 'b-uuid-1234',
      client_id: 'c-uuid-1234',
      lifecycle_status: 'Signed',
      file_url: '/documents/DOC-2026-0001.pdf',
      file_size_bytes: 2048576,
      generated_by: 'user-1',
      signed_at: '2026-08-01T10:00:00Z',
      signed_by_name: 'Babin Shrestha',
      created_at: '2026-08-01T10:00:00Z',
    }

    const doc = mapDbRowToDocRow(row)
    expect(doc.id).toBe('DOC-2026-0001')
    expect(doc.type).toBe('Rental Agreement')
    expect(doc.category).toBe('Rental')
    expect(doc.status).toBe('Signed')
    expect(doc.recordState).toBe('Signed')
    expect(doc.recordTone).toBe('neutral')
  })

  it('mapDbRowToDocRow correctly categorizes Finance documents', () => {
    const row: DocumentRowDb = {
      id: 'doc-uuid-2',
      client_uuid: 'client-uuid-2',
      document_no: 'INV-2026-0001',
      document_type: 'Tax Invoice',
      booking_id: null,
      client_id: null,
      lifecycle_status: 'Issued',
      file_url: '/documents/INV-2026-0001.pdf',
      file_size_bytes: null,
      generated_by: null,
      signed_at: null,
      signed_by_name: null,
      created_at: '2026-08-02T10:00:00Z',
    }

    const doc = mapDbRowToDocRow(row)
    expect(doc.category).toBe('Finance')
    expect(doc.finance).toBe(true)
    expect(doc.status).toBe('Issued')
  })

  it('listDocuments returns database rows when present', async () => {
    const mockSelect = vi.fn().mockReturnThis()
    const mockOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'doc-uuid-1',
          client_uuid: 'client-uuid-1',
          document_no: 'DOC-2026-0001',
          document_type: 'Rental Agreement',
          booking_id: 'b-1',
          client_id: null,
          lifecycle_status: 'Signed',
          file_url: '/documents/DOC-2026-0001.pdf',
          file_size_bytes: 1048576,
          generated_by: null,
          signed_at: null,
          signed_by_name: null,
          created_at: '2026-08-01T10:00:00Z',
        },
      ],
      error: null,
    })

    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
      order: mockOrder,
    })

    const result = await listDocuments()
    expect(result.rows.length).toBe(1)
    expect(result.rows[0]?.id).toBe('DOC-2026-0001')
  })

  it('listDocuments falls back to DOCUMENTS seed when empty or error', async () => {
    const mockSelect = vi.fn().mockReturnThis()
    const mockOrder = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    })

    ;(supabase.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      select: mockSelect,
      order: mockOrder,
    })

    const result = await listDocuments()
    expect(result.rows.length).toBeGreaterThan(0)
    expect(result.rows[0]?.id).toBeDefined()
  })
})
