import { supabase, IS_MOCK } from './supabase'

/**
 * =============================================================================
 * documentStorage.ts — AUD-010 (P2)
 *
 * Connect PDF generation to Supabase Storage bucket `documents`.
 * Generates compliant PDF blobs for commercial/operational documents
 * (Tax Invoices, Rental Agreements, Quotations, Delivery Notes, etc.)
 * and uploads them to Supabase Storage with signed URL generation.
 * =============================================================================
 */

export const DOCUMENTS_STORAGE_BUCKET = 'documents'

export interface GeneratePdfOptions {
  documentNo: string
  title: string
  docType: string
  party?: string | undefined
  bookingNo?: string | undefined
  dateStr?: string | undefined
  lines?: Array<{
    description: string
    qty?: number | undefined
    rate?: string | number | undefined
    total?: string | number | undefined
  }> | undefined
  totalAmount?: string | number | undefined
}

export interface StoredDocumentResult {
  documentNo: string
  docType: string
  storagePath: string
  signedUrl: string
  fileSizeBytes: number
  publicUrl?: string | undefined
}

/**
 * Escapes characters for PDF literal strings `( ... )`.
 */
function escapePdfText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]+/g, ' ')
}

/**
 * Builds a clean, compliant PDF 1.4 binary byte array.
 * Contains page dimensions, Helvetica font definitions, and formatted stream text.
 */
export function buildPdfByteArray(lines: string[]): Uint8Array {
  // Build stream content: text drawing instructions
  // Origin is bottom-left (0,0), standard 8.5x11 inch page = 612 x 792 points.
  let streamBody = 'BT\n/F1 12 Tf\n54 738 Td\n18 TL\n'
  for (const line of lines) {
    if (line.startsWith('### ')) {
      streamBody += `/F1 16 Tf (${escapePdfText(line.slice(4))}) Tj /F1 12 Tf T*\n`
    } else if (line.startsWith('## ')) {
      streamBody += `/F1 14 Tf (${escapePdfText(line.slice(3))}) Tj /F1 12 Tf T*\n`
    } else if (line.startsWith('---')) {
      streamBody += '0 -6 Td (______________________________________________________________________________) Tj 0 6 Td T*\n'
    } else if (line.trim() === '') {
      streamBody += 'T*\n'
    } else {
      streamBody += `(${escapePdfText(line)}) Tj T*\n`
    }
  }
  streamBody += 'ET\n'

  const encoder = new TextEncoder()
  const streamBytes = encoder.encode(streamBody)

  // PDF Structure:
  // Obj 1: Catalog
  // Obj 2: Pages
  // Obj 3: Page
  // Obj 4: Font (Helvetica)
  // Obj 5: Stream Content
  const header = '%PDF-1.4\n'

  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'
  const obj3 =
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>\nendobj\n'
  const obj4 = '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'

  const obj5Prefix = `5 0 obj\n<< /Length ${streamBytes.byteLength} >>\nstream\n`
  const obj5Suffix = '\nendstream\nendobj\n'

  const partsBeforeStream = encoder.encode(header + obj1 + obj2 + obj3 + obj4 + obj5Prefix)
  const partsAfterStreamText = obj5Suffix

  // Calculate offsets for xref
  const offset1 = encoder.encode(header).byteLength
  const offset2 = offset1 + encoder.encode(obj1).byteLength
  const offset3 = offset2 + encoder.encode(obj2).byteLength
  const offset4 = offset3 + encoder.encode(obj3).byteLength
  const offset5 = offset4 + encoder.encode(obj4).byteLength

  const streamEndOffset = partsBeforeStream.byteLength + streamBytes.byteLength + encoder.encode(partsAfterStreamText).byteLength

  const xref =
    `xref\n0 6\n` +
    `0000000000 65535 f \n` +
    `${String(offset1).padStart(10, '0')} 00000 n \n` +
    `${String(offset2).padStart(10, '0')} 00000 n \n` +
    `${String(offset3).padStart(10, '0')} 00000 n \n` +
    `${String(offset4).padStart(10, '0')} 00000 n \n` +
    `${String(offset5).padStart(10, '0')} 00000 n \n`

  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${streamEndOffset}\n%%EOF\n`

  const trailerBytes = encoder.encode(xref + trailer)

  // Concatenate all bytes
  const totalLength = partsBeforeStream.byteLength + streamBytes.byteLength + encoder.encode(partsAfterStreamText).byteLength + trailerBytes.byteLength
  const result = new Uint8Array(totalLength)

  let offset = 0
  result.set(partsBeforeStream, offset)
  offset += partsBeforeStream.byteLength

  result.set(streamBytes, offset)
  offset += streamBytes.byteLength

  const afterBytes = encoder.encode(partsAfterStreamText)
  result.set(afterBytes, offset)
  offset += afterBytes.byteLength

  result.set(trailerBytes, offset)
  return result
}

/**
 * Generates a document PDF Blob from metadata and line items.
 */
export function generateDocumentPdfBlob(options: GeneratePdfOptions): Blob {
  const dateStr = options.dateStr || new Date().toISOString().split('T')[0]
  const contentLines: string[] = [
    '============================================================',
    `                 BABIN RENTALS OS — ${options.docType.toUpperCase()}`,
    '============================================================',
    '',
    `Document Number: ${options.documentNo}`,
    `Date of Issue:   ${dateStr}`,
    options.bookingNo ? `Booking Ref:     ${options.bookingNo}` : '',
    options.party ? `Party:           ${options.party}` : '',
    `Title:           ${options.title}`,
    '',
    '------------------------------------------------------------',
    'DESCRIPTION                     QTY      RATE         TOTAL',
    '------------------------------------------------------------',
  ]

  if (options.lines && options.lines.length > 0) {
    for (const line of options.lines) {
      const desc = (line.description || 'Item').padEnd(30).substring(0, 30)
      const qty = String(line.qty ?? 1).padStart(4)
      const rate = String(line.rate ?? 0).padStart(9)
      const total = String(line.total ?? 0).padStart(12)
      contentLines.push(`${desc} ${qty}  ${rate}  ${total}`)
    }
  } else {
    contentLines.push('No line items recorded.')
  }

  contentLines.push('---')
  if (options.totalAmount !== undefined) {
    contentLines.push(`Total Amount:   NPR ${options.totalAmount}`)
    contentLines.push('---')
  }

  contentLines.push('')
  contentLines.push('Authorized Signature: _______________________      Date: _______________')
  contentLines.push('')
  contentLines.push('Babin Rentals · Kathmandu, Nepal · info@babinrentals.com')

  const byteArray = buildPdfByteArray(contentLines.filter((l) => l !== undefined))
  return new Blob([byteArray as unknown as BlobPart], { type: 'application/pdf' })
}

interface StorageBucketClient {
  upload: (path: string, file: Blob | ArrayBuffer | string, options?: { contentType?: string; upsert?: boolean; cacheControl?: string; duplex?: 'half' | 'full' }) => Promise<{ data: { path: string; fullPath: string; id?: string } | null; error: Error | null }>
  createSignedUrl: (path: string, expiresIn: number, options?: { download?: boolean; transform?: { width: number; height: number; resize: 'cover' | 'contain' | 'fill' } }) => Promise<{ data: { signedUrl: string } | null; error: Error | null }>
  download: (path: string, options?: { transform?: { width: number; height: number; resize: 'cover' | 'contain' | 'fill' } }) => Promise<{ data: Blob | null; error: Error | null }>
  getPublicUrl: (path: string) => { data: { publicUrl: string } }
  list: (folder?: string, options?: { limit?: number; offset?: number; sortBy?: { column: string; order: 'asc' | 'desc' } }) => Promise<{ data: Array<{ name: string; id: string; updated_at: string; created_at: string; last_accessed_at: string; metadata: Record<string, unknown> }> | null; error: Error | null }>
  remove: (paths: string[]) => Promise<{ data: Array<{ name: string }> | null; error: Error | null }>
  move: (fromPath: string, toPath: string) => Promise<{ data: { path: string } | null; error: Error | null }>
  copy: (fromPath: string, toPath: string) => Promise<{ data: { path: string } | null; error: Error | null }>
}

function getBucketStorageClient(): StorageBucketClient {
  if (IS_MOCK) {
    throw new Error('Mock mode not supported for document storage. Use real Supabase client.')
  }
  const client = supabase!
  if (!client.storage || typeof client.storage.from !== 'function') {
    throw new Error('Supabase storage client not available')
  }
  return client.storage.from(DOCUMENTS_STORAGE_BUCKET) as unknown as StorageBucketClient
}

/**
 * Uploads a document payload to Supabase Storage bucket `documents`
 * and creates a signed URL.
 */
export async function uploadDocumentToStorage(options: {
  docType: string
  documentNo: string
  content: Blob | ArrayBuffer | string
  mimeType?: string | undefined
}): Promise<StoredDocumentResult> {
  const prefix = options.docType.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  const cleanDocNo = options.documentNo.replace(/[^a-zA-Z0-9_-]/g, '_')
  const storagePath = `${prefix}/${cleanDocNo}.pdf`

  const contentType = options.mimeType || 'application/pdf'
  const storage = getBucketStorageClient()

  // 1. Upload to Supabase Storage
  const { error: uploadError } = await storage.upload(storagePath, options.content, {
    contentType,
  })

  // If bucket not found, try creating it once
  if (uploadError && !uploadError.message?.toLowerCase().includes('already exists')) {
    if (supabase?.storage && 'createBucket' in supabase.storage && typeof supabase.storage.createBucket === 'function') {
      const { error: createErr } = await supabase.storage.createBucket(DOCUMENTS_STORAGE_BUCKET, { public: false })
      if (!createErr) {
        const retry = await storage.upload(storagePath, options.content, { contentType })
        if (retry.error) {
          throw new Error(`Failed to upload document to storage: ${retry.error.message}`)
        }
      } else {
        throw new Error(`Failed to upload document to storage: ${createErr.message}`)
      }
    } else {
      throw new Error(`Failed to upload document to storage: ${uploadError.message || 'Unknown upload failure'}`)
    }
  }

  // Law 3: If already exists, that is acceptable per immutability
  if (uploadError && !uploadError.message?.toLowerCase().includes('already exists')) {
    throw new Error(`Failed to upload document to storage: ${uploadError.message || 'Unknown upload failure'}`)
  }

  // 2. Generate signed URL (valid for 7 days = 604,800 seconds)
  const { data: signedData, error: signError } = await storage.createSignedUrl(
    storagePath,
    60 * 60 * 24 * 7,
  )

  const signedUrl = signedData?.signedUrl || `/documents/${cleanDocNo}.pdf`
  if (signError && !signedData?.signedUrl) {
    console.warn(`Could not create signed URL for ${storagePath}:`, signError.message)
  }

  let fileSizeBytes = 0
  if (options.content instanceof Blob) {
    fileSizeBytes = options.content.size
  } else if (typeof options.content === 'string') {
    fileSizeBytes = new TextEncoder().encode(options.content).byteLength
  } else if (options.content instanceof ArrayBuffer) {
    fileSizeBytes = options.content.byteLength
  }

  // 3. Resolve public URL for reference
  const { data: publicData } = storage.getPublicUrl(storagePath)

  return {
    documentNo: options.documentNo,
    docType: options.docType,
    storagePath,
    signedUrl,
    fileSizeBytes,
    publicUrl: publicData?.publicUrl,
  }
}

/**
 * Generates PDF bytes and uploads directly to Supabase Storage in one step.
 */
export async function generateAndStoreDocumentPdf(
  options: GeneratePdfOptions,
): Promise<StoredDocumentResult> {
  const pdfBlob = generateDocumentPdfBlob(options)
  return uploadDocumentToStorage({
    docType: options.docType,
    documentNo: options.documentNo,
    content: pdfBlob,
    mimeType: 'application/pdf',
  })
}

/**
 * Retrieves a fresh signed URL for an existing storage path.
 */
export async function getDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds = 60 * 60 * 24 * 7,
): Promise<string | null> {
  const storage = getBucketStorageClient()
  const { data, error } = await storage.createSignedUrl(storagePath, expiresInSeconds)
  if (!error && data?.signedUrl) {
    return data.signedUrl
  }
  console.warn(`Could not create signed URL for ${storagePath}:`, error?.message)
  return null
}

/**
 * Downloads a document from Supabase Storage.
 */
export async function downloadDocumentFromStorage(
  storagePath: string,
): Promise<{ data: Blob | null; error: Error | { message: string } | null }> {
  const storage = getBucketStorageClient()
  return storage.download(storagePath)
}

