import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rupees } from '../../money'

const uploadedFiles = new Set<string>()

// Mock Supabase storage at top level with realistic collision simulation
vi.mock('../../supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockImplementation(async (path: string) => {
          if (uploadedFiles.has(path)) {
            return { data: null, error: { message: 'The resource already exists' } }
          }
          uploadedFiles.add(path)
          return { data: { path }, error: null }
        }),
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://example.com/signed' }, error: null }),
        download: vi.fn().mockImplementation(async (path: string) => {
          if (uploadedFiles.has(path)) {
            return { data: new Blob(['test']), error: null }
          }
          return { data: null, error: { message: 'Not found' } }
        }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/public' } }),
      })),
    },
    from: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
  IS_MOCK: false,
}))

import { exportInvoicePdf, exportDocumentPdf } from '../exportPdf'
import { supabase } from '../../supabase'

describe('exportPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    uploadedFiles.clear()
  })

  it('exports invoice PDF, uploads to documents bucket and retrieves signed URL', async () => {
    const res = await exportInvoicePdf(
      {
        invoiceNo: 'INV-2026-9001',
        status: 'Sent',
        bookingNo: 'B-750',
        client: { name: 'Kailash Films' },
        lines: [
          {
            description: 'Sony BURANO 8K Cinema Camera',
            quantity: 1,
            rentalDays: 2,
            ratePaisa: rupees(25000),
            totalPaisa: rupees(50000),
          },
        ],
        subtotalPaisa: rupees(50000),
        taxablePaisa: rupees(50000),
        vatPaisa: rupees(6500),
        totalPaisa: rupees(56500),
      },
      {
        uploadToStorage: true,
      },
    )

    expect(res.blob).toBeInstanceOf(Blob)
    expect(res.bytes).toBeInstanceOf(Uint8Array)
    expect(res.fileSizeBytes).toBeGreaterThan(500)
    expect(res.filename).toBe('INV-2026-9001.pdf')
    expect(res.storagePath).toBe('invoices/INV-2026-9001.pdf')
    expect(res.signedUrl).toBeDefined()
    expect(typeof res.signedUrl).toBe('string')

    const downloaded = await supabase.storage.from('documents').download(res.storagePath!)
    expect(downloaded.error).toBeNull()
    expect(downloaded.data).toBeDefined()
  })

  it('honors Law 3 by writing timestamped revision when file already exists', async () => {
    const invoiceData = {
      invoiceNo: 'INV-2026-9002',
      status: 'Paid',
      bookingNo: 'B-751',
      client: { name: 'Muktinath Media' },
      lines: [
        {
          description: 'DJI Ronin 4D 6K',
          quantity: 1,
          totalPaisa: rupees(18000),
        },
      ],
      subtotalPaisa: rupees(18000),
      taxablePaisa: rupees(18000),
      vatPaisa: rupees(2340),
      totalPaisa: rupees(20340),
    }

    const first = await exportInvoicePdf(invoiceData)
    expect(first.storagePath).toBe('invoices/INV-2026-9002.pdf')

    const second = await exportInvoicePdf(invoiceData)
    expect(second.storagePath).toMatch(/^invoices\/INV-2026-9002_\d+\.pdf$/)
    expect(second.signedUrl).toBeDefined()
  })

  it('exports general document to registry path with signed URL', async () => {
    const res = await exportDocumentPdf({
      documentNo: 'DOC-2026-8800',
      title: 'Commercial Quote for Feature Film',
      docType: 'Quotation',
      clientName: 'Annapurna Studios',
    })

    expect(res.filename).toBe('DOC-2026-8800.pdf')
    expect(res.storagePath).toBe('registry/DOC-2026-8800.pdf')
    expect(res.signedUrl).toBeDefined()
  })
})