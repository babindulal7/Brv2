import { supabase, IS_MOCK } from './supabase'
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

function getEvidenceBucketClient(): StorageBucketClient {
  if (IS_MOCK) {
    throw new Error('Mock mode not supported for evidence storage. Use real Supabase client.')
  }
  const client = supabase!
  if (!client.storage || typeof client.storage.from !== 'function') {
    throw new Error('Supabase storage client not available')
  }
  return client.storage.from(EVIDENCE_STORAGE_BUCKET) as unknown as StorageBucketClient
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
  const storage = getEvidenceBucketClient()

  const { error: uploadError } = await storage.upload(storagePath, options.file, {
    contentType,
  })

  // Handle missing bucket or storage failure
  if (uploadError && (uploadError.message?.toLowerCase().includes('bucket not found') || uploadError.name === 'StorageApiError')) {
    if (supabase?.storage && 'createBucket' in supabase.storage && typeof supabase.storage.createBucket === 'function') {
      const { error: createErr } = await supabase.storage.createBucket(EVIDENCE_STORAGE_BUCKET, { public: false })
      if (!createErr) {
        const retry = await storage.upload(storagePath, options.file, { contentType })
        if (retry.error) {
          throw new Error(`Failed to upload evidence photo: ${retry.error.message}`)
        }
      } else {
        throw new Error(`Failed to upload evidence photo: ${createErr.message}`)
      }
    } else {
      throw new Error(`Failed to upload evidence photo: ${uploadError.message || 'Unknown error'}`)
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
  console.warn(`Could not create signed URL for evidence ${storagePath}:`, error?.message)
  return null
}
