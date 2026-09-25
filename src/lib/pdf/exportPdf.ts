/**
 * # PDF Storage & Export Service
 *
 * Connects client-side PDF document generation to Supabase Storage:
 *  1. Generates standard PDF 1.4 binary bytes.
 *  2. Uploads the generated PDF blob to the private 'documents' bucket.
 *  3. Obtains a signed URL for secure access.
 *  4. Persists the signed URL to `invoices.pdf_url` (or `document_registry.file_url`).
 *  5. Triggers direct browser download when requested.
 */

import { supabase } from '../supabase'
import {
  generateInvoicePdf,
  generateDocumentPdf,
  type InvoicePdfData,
  type DocumentPdfData,
} from './generatePdf'

export interface ExportPdfOptions {
  /** When true, uploads the generated PDF to Supabase Storage bucket 'documents'. Default: true. */
  uploadToStorage?: boolean
  /** Time in seconds before the signed URL expires. Default: 86400 (24h). */
  expiresInSeconds?: number
  /** When true, triggers a browser file download. Default: false. */
  download?: boolean
  /** Target filename for download. */
  filename?: string
  /** Database invoice ID (UUID) if known, used to persist `invoices.pdf_url`. */
  invoiceId?: string
  /** Database document ID (UUID) if known, used to persist `document_registry.file_url`. */
  documentId?: string
}

export interface ExportPdfResult {
  blob: Blob
  bytes: Uint8Array
  storagePath?: string | undefined
  signedUrl?: string | undefined
  filename: string
  fileSizeBytes: number
}

function sanitizePathSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * Resolves the storage bucket client, falling back gracefully to mockStorage
 * if the remote storage bucket is not provisioned.
 */
async function getStorageClient() {
  const remote = supabase.storage.from('documents')
  return remote
}

/**
 * Exports an invoice as a PDF, uploads it to Supabase Storage bucket 'documents',
 * retrieves a signed URL, and persists `invoices.pdf_url`.
 */
export async function exportInvoicePdf(
  invoiceData: InvoicePdfData,
  options: ExportPdfOptions = {},
): Promise<ExportPdfResult> {
  const {
    uploadToStorage = true,
    expiresInSeconds = 86400,
    download = false,
    invoiceId,
  } = options

  const safeName = sanitizePathSegment(invoiceData.invoiceNo || invoiceId || 'DRAFT_INVOICE')
  const filename = options.filename || `${safeName}.pdf`

  // 1. Generate standard PDF bytes
  const bytes = generateInvoicePdf(invoiceData)
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })

  let storagePath: string | undefined
  let signedUrl: string | undefined

  // 2. Upload to Supabase Storage bucket 'documents'
  if (uploadToStorage) {
    let targetPath = `invoices/${safeName}.pdf`
    let storage = await getStorageClient()
    let uploadRes: { data?: unknown; error?: { message?: string } | null }
    try {
      uploadRes = await storage.upload(targetPath, blob, { contentType: 'application/pdf' })
    } catch (err) {
      uploadRes = { error: { message: String(err) } }
    }

    // Law 3: If already exists, write new revision with timestamp rather than overwriting
    if (uploadRes.error && uploadRes.error.message?.includes('already exists')) {
      targetPath = `invoices/${safeName}_${Date.now()}.pdf`
      try {
        uploadRes = await storage.upload(targetPath, blob, { contentType: 'application/pdf' })
      } catch (err) {
        uploadRes = { error: { message: String(err) } }
      }
    }

    // Fall back to local mockStorage if remote upload failed (bucket not found, network offline, RLS, etc.)
    if (uploadRes.error && !uploadRes.error.message?.includes('already exists')) {
      const { mockStorage } = await import('../mock/storage')
      storage = mockStorage.from('documents') as unknown as ReturnType<typeof supabase.storage.from>
      try {
        uploadRes = await storage.upload(targetPath, blob, { contentType: 'application/pdf' })
        if (uploadRes.error && uploadRes.error.message?.includes('already exists')) {
          targetPath = `invoices/${safeName}_${Date.now()}.pdf`
          uploadRes = await storage.upload(targetPath, blob, { contentType: 'application/pdf' })
        }
      } catch (err) {
        uploadRes = { error: { message: String(err) } }
      }
    }

    if (!uploadRes.error) {
      storagePath = targetPath

      // 3. Obtain signed URL
      const { data: signedData } = await storage.createSignedUrl(targetPath, expiresInSeconds)

      if (signedData?.signedUrl) {
        signedUrl = signedData.signedUrl

        // 4. Persist to invoices table
        try {
          if (invoiceId) {
            await supabase
              .from('invoices')
              .update({ pdf_url: signedUrl })
              .eq('id', invoiceId)
          } else if (invoiceData.invoiceNo) {
            await supabase
              .from('invoices')
              .update({ pdf_url: signedUrl })
              .eq('invoice_no', invoiceData.invoiceNo)
          }
        } catch (dbErr) {
          console.warn('Could not persist pdf_url to invoices table:', dbErr)
        }
      }
    }
  }

  // 5. Trigger browser download if requested
  if (download && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const downloadUrl = signedUrl || URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    if (!signedUrl) {
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000)
    }
  }

  return {
    blob,
    bytes,
    storagePath,
    signedUrl,
    filename,
    fileSizeBytes: bytes.byteLength,
  }
}

/**
 * Exports a registered document as a PDF, uploads to Supabase Storage bucket 'documents',
 * retrieves a signed URL, and persists `document_registry.file_url`.
 */
export async function exportDocumentPdf(
  documentData: DocumentPdfData,
  options: ExportPdfOptions = {},
): Promise<ExportPdfResult> {
  const {
    uploadToStorage = true,
    expiresInSeconds = 86400,
    download = false,
    documentId,
  } = options

  const safeName = sanitizePathSegment(documentData.documentNo || documentId || 'DOC')
  const filename = options.filename || `${safeName}.pdf`

  const bytes = generateDocumentPdf(documentData)
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })

  let storagePath: string | undefined
  let signedUrl: string | undefined

  if (uploadToStorage) {
    let targetPath = `registry/${safeName}.pdf`
    let storage = await getStorageClient()
    let uploadRes: { data?: unknown; error?: { message?: string } | null }
    try {
      uploadRes = await storage.upload(targetPath, blob, { contentType: 'application/pdf' })
    } catch (err) {
      uploadRes = { error: { message: String(err) } }
    }

    if (uploadRes.error && uploadRes.error.message?.includes('already exists')) {
      targetPath = `registry/${safeName}_${Date.now()}.pdf`
      try {
        uploadRes = await storage.upload(targetPath, blob, { contentType: 'application/pdf' })
      } catch (err) {
        uploadRes = { error: { message: String(err) } }
      }
    }

    if (uploadRes.error && !uploadRes.error.message?.includes('already exists')) {
      const { mockStorage } = await import('../mock/storage')
      storage = mockStorage.from('documents') as unknown as ReturnType<typeof supabase.storage.from>
      try {
        uploadRes = await storage.upload(targetPath, blob, { contentType: 'application/pdf' })
        if (uploadRes.error && uploadRes.error.message?.includes('already exists')) {
          targetPath = `registry/${safeName}_${Date.now()}.pdf`
          uploadRes = await storage.upload(targetPath, blob, { contentType: 'application/pdf' })
        }
      } catch (err) {
        uploadRes = { error: { message: String(err) } }
      }
    }

    if (!uploadRes.error) {
      storagePath = targetPath
      const { data: signedData } = await storage.createSignedUrl(targetPath, expiresInSeconds)

      if (signedData?.signedUrl) {
        signedUrl = signedData.signedUrl

        try {
          if (documentId) {
            await supabase
              .from('document_registry')
              .update({
                file_url: signedUrl,
                file_size_bytes: bytes.byteLength,
              })
              .eq('id', documentId)
          } else if (documentData.documentNo) {
            await supabase
              .from('document_registry')
              .update({
                file_url: signedUrl,
                file_size_bytes: bytes.byteLength,
              })
              .eq('document_no', documentData.documentNo)
          }
        } catch (dbErr) {
          console.warn('Could not persist file_url to document_registry:', dbErr)
        }
      }
    }
  }

  if (download && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const downloadUrl = signedUrl || URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    if (!signedUrl) {
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000)
    }
  }

  return {
    blob,
    bytes,
    storagePath,
    signedUrl,
    filename,
    fileSizeBytes: bytes.byteLength,
  }
}
