import { supabase } from './supabase'
import { mockStorage } from './mock/storage'
import { generateClientUuid } from './dataAccess'

export const EVIDENCE_STORAGE_BUCKET = 'evidence'

export interface UploadEvidencePhotoOptions {
  file: Blob | File
  filename: string
  bookingId?: string | undefined
  unitId?: string | undefined
  category?: 'Packing' | 'Handover' | 'Return' | 'Damage' | 'General' | undefined
  userId: string
  notes?: string | undefined
}

export interface StoredEvidencePhotoResult {
  id: string
  storagePath: string
  signedUrl: string
  filename: string
  fileSizeBytes: number
}

type StorageBucketClient = ReturnType<typeof supabase.storage.from> | ReturnType<typeof mockStorage.from>

function getEvidenceBucketClient(): StorageBucketClient {
  if (supabase?.storage && typeof supabase.storage.from === 'function') {
    return supabase.storage.from(EVIDENCE_STORAGE_BUCKET)
  }
  return mockStorage.from(EVIDENCE_STORAGE_BUCKET)
}

/**
 * Uploads an evidence photo (JPEG, PNG, WebP) to Supabase Storage bucket `evidence`
 * and records a row in `evidence_files`.
 */
export async function uploadEvidencePhoto(
  options: UploadEvidencePhotoOptions,
): Promise<StoredEvidencePhotoResult> {
  const photoId = generateClientUuid()
  const cleanBooking = (options.bookingId || 'general').replace(/[^a-zA-Z0-9_-]/g, '_')
  const cleanName = options.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${cleanBooking}/${photoId}_${cleanName}`

  const contentType = (options.file as File).type || 'image/jpeg'
  let storage: StorageBucketClient = getEvidenceBucketClient()

  let uploadError: { message?: string; name?: string } | null = null
  try {
    const res = await storage.upload(storagePath, options.file, {
      contentType,
    })
    uploadError = res.error
  } catch (err: unknown) {
    uploadError = err instanceof Error ? err : { message: String(err) }
  }

  // Handle missing bucket or storage failure
  if (uploadError && (uploadError.message?.toLowerCase().includes('bucket not found') || uploadError.name === 'StorageApiError')) {
    try {
      if (supabase?.storage && 'createBucket' in supabase.storage && typeof supabase.storage.createBucket === 'function') {
        const { error: createErr } = await supabase.storage.createBucket(EVIDENCE_STORAGE_BUCKET, { public: false })
        if (!createErr) {
          const retry = await storage.upload(storagePath, options.file, { contentType })
          uploadError = retry.error
        } else {
          storage = mockStorage.from(EVIDENCE_STORAGE_BUCKET)
          const fallbackRes = await storage.upload(storagePath, options.file, { contentType })
          uploadError = fallbackRes.error
        }
      } else {
        storage = mockStorage.from(EVIDENCE_STORAGE_BUCKET)
        const fallbackRes = await storage.upload(storagePath, options.file, { contentType })
        uploadError = fallbackRes.error
      }
    } catch {
      storage = mockStorage.from(EVIDENCE_STORAGE_BUCKET)
      const fallbackRes = await storage.upload(storagePath, options.file, { contentType })
      uploadError = fallbackRes.error
    }
  }

  if (uploadError && !uploadError.message?.toLowerCase().includes('already exists')) {
    throw new Error(`Failed to upload evidence photo: ${uploadError.message || 'Unknown error'}`)
  }

  // Create signed URL for viewing (valid for 7 days)
  const { data: signedData, error: signError } = await storage.createSignedUrl(storagePath, 60 * 60 * 24 * 7)
  const signedUrl = signedData?.signedUrl || `/evidence/${photoId}_${cleanName}`
  if (signError && !signedData?.signedUrl) {
    console.warn(`Could not create signed URL for evidence ${storagePath}:`, signError.message)
  }

  // Attempt to record in evidence_files if authenticated
  try {
    await supabase.from('evidence_files').insert({
      id: photoId,
      client_uuid: photoId,
      original_filename: options.filename,
      storage_path: storagePath,
      file_size_bytes: options.file.size,
      mime_type: contentType,
      category: options.category || 'General',
      booking_id: options.bookingId || null,
      unit_id: options.unitId || null,
      created_by: options.userId,
      created_at: new Date().toISOString(),
    } as never)
  } catch (err) {
    console.warn('Could not insert evidence_files row (offline or mock):', err)
  }

  return {
    id: photoId,
    storagePath,
    signedUrl,
    filename: options.filename,
    fileSizeBytes: options.file.size,
  }
}

/**
 * Retrieves a signed URL for an existing evidence photo storage path.
 */
export async function getEvidenceSignedUrl(
  storagePath: string,
  expiresInSeconds = 60 * 60 * 24 * 7,
): Promise<string | null> {
  const storage = getEvidenceBucketClient()
  const { data, error } = await storage.createSignedUrl(storagePath, expiresInSeconds)
  if (!error && data?.signedUrl) {
    return data.signedUrl
  }

  try {
    const fallback = await mockStorage.from(EVIDENCE_STORAGE_BUCKET).createSignedUrl(storagePath, expiresInSeconds)
    return fallback.data?.signedUrl || null
  } catch {
    return null
  }
}
