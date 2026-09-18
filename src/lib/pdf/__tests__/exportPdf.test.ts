import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportInvoicePdf, exportDocumentPdf } from '../exportPdf'
import { supabase } from '../../supabase'
import { mockStorage } from '../../mock/storage'
import { rupees } from '../../money'

describe('exportPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

    // Verify it is retrievable from storage (remote or mock)
    let downloaded: any = await supabase.storage.from('documents').download(res.storagePath!)
    if (downloaded.error && downloaded.error.message?.includes('Bucket not found')) {
      downloaded = await mockStorage.from('documents').download(res.storagePath!)
    }
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

    // Second export of the same invoice
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
