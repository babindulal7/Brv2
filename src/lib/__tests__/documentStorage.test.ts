import { describe, it, expect } from 'vitest'
import {
  buildPdfByteArray,
  generateDocumentPdfBlob,
  uploadDocumentToStorage,
  generateAndStoreDocumentPdf,
  getDocumentSignedUrl,
  downloadDocumentFromStorage,
} from '../documentStorage'

describe('AUD-010: Document Storage & PDF Generation', () => {
  describe('1. buildPdfByteArray & generateDocumentPdfBlob', () => {
    it('produces a valid binary PDF byte array with standard PDF structure', () => {
      const bytes = buildPdfByteArray([
        '### BABIN RENTALS OS',
        '## TAX INVOICE: INV-2026-0001',
        '---',
        'Document No: INV-2026-0001',
        'Client: Himalayan Films',
        'Total: NPR 45,000',
      ])

      expect(bytes).toBeInstanceOf(Uint8Array)
      expect(bytes.byteLength).toBeGreaterThan(150)

      const text = new TextDecoder().decode(bytes)
      expect(text.startsWith('%PDF-1.4\n')).toBe(true)
      expect(text.includes('/Type /Catalog')).toBe(true)
      expect(text.includes('/Type /Page')).toBe(true)
      expect(text.includes('/Font')).toBe(true)
      expect(text.includes('Helvetica')).toBe(true)
      expect(text.includes('stream')).toBe(true)
      expect(text.includes('endstream')).toBe(true)
      expect(text.includes('xref')).toBe(true)
      expect(text.includes('trailer')).toBe(true)
      expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    })

    it('generates a typed PDF blob with correct MIME type', async () => {
      const blob = generateDocumentPdfBlob({
        documentNo: 'INV-2026-0042',
        title: 'Commercial Film Production Invoice',
        docType: 'Tax Invoice',
        party: 'Vision Production',
        bookingNo: 'B-715',
        lines: [
          { description: 'ARRI Alexa Mini LF Package', qty: 1, rate: 45000, total: 45000 },
          { description: 'NiSi Athena Prime Set', qty: 1, rate: 9000, total: 9000 },
        ],
        totalAmount: '54,000',
      })

      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('application/pdf')
      expect(blob.size).toBeGreaterThan(200)

      const text = await blob.text()
      expect(text).toContain('BABIN RENTALS OS')
      expect(text).toContain('INV-2026-0042')
      expect(text).toContain('TAX INVOICE')
      expect(text).toContain('ARRI Alexa Mini LF Package')
    })
  })

  describe('2. uploadDocumentToStorage & signed URLs', () => {
    it('uploads a document to documents bucket and returns signed storage URL', async () => {
      const res = await uploadDocumentToStorage({
        docType: 'Quotation',
        documentNo: 'Q-2026-0881',
        content: 'Sample quotation binary payload',
      })

      expect(res.documentNo).toBe('Q-2026-0881')
      expect(res.docType).toBe('Quotation')
      expect(res.storagePath).toBe('quotation/Q-2026-0881.pdf')
      expect(res.signedUrl).toBeDefined()
      expect(typeof res.signedUrl).toBe('string')
      expect(res.fileSizeBytes).toBeGreaterThan(0)

      // Verify file is retrievable from storage
      const download = await downloadDocumentFromStorage(res.storagePath)
      expect(download.error).toBeNull()
      expect(download.data).toBeDefined()
    })

    it('honors Law 3 immutability when uploading same path', async () => {
      const payload = {
        docType: 'Rental Agreement',
        documentNo: 'RA-2026-0999',
        content: 'Original agreement terms',
      }

      const first = await uploadDocumentToStorage(payload)
      expect(first.storagePath).toBe('rental_agreement/RA-2026-0999.pdf')

      // Second call does not throw
      const second = await uploadDocumentToStorage(payload)
      expect(second.storagePath).toBe('rental_agreement/RA-2026-0999.pdf')
      expect(second.signedUrl).toBeDefined()
    })
  })

  describe('3. generateAndStoreDocumentPdf end-to-end', () => {
    it('generates PDF and stores in Supabase Storage with signed URL in one call', async () => {
      const res = await generateAndStoreDocumentPdf({
        documentNo: 'INV-2026-1055',
        title: 'Equipment Rental Invoice — Everest Cine',
        docType: 'Tax Invoice',
        party: 'Everest Cine',
        bookingNo: 'B-720',
        totalAmount: '124,500',
        lines: [
          { description: 'Sony FX6 Cinema Camera', qty: 2, rate: 8000, total: 16000 },
          { description: 'Blazar Mantis Anamorphic Set', qty: 1, rate: 14000, total: 14000 },
        ],
      })

      expect(res.documentNo).toBe('INV-2026-1055')
      expect(res.docType).toBe('Tax Invoice')
      expect(res.storagePath).toBe('tax_invoice/INV-2026-1055.pdf')
      expect(res.fileSizeBytes).toBeGreaterThan(200)
      expect(res.signedUrl).toBeDefined()

      // Verify signed URL resolution
      const freshSignedUrl = await getDocumentSignedUrl(res.storagePath)
      expect(freshSignedUrl).toBeDefined()
      expect(typeof freshSignedUrl).toBe('string')
    })
  })
})

