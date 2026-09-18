import { describe, it, expect } from 'vitest'
import { uploadEvidencePhoto, getEvidenceSignedUrl, EVIDENCE_STORAGE_BUCKET } from '../evidenceStorage'

describe('AUD-004: Evidence Storage & Photo Upload', () => {
  it('exports the canonical bucket name', () => {
    expect(EVIDENCE_STORAGE_BUCKET).toBe('evidence')
  })

  it('uploads a photo blob and returns signed storage URL', async () => {
    const fakeImageBlob = new Blob(['fake image content'], { type: 'image/jpeg' })
    const result = await uploadEvidencePhoto({
      file: fakeImageBlob,
      filename: 'lens_scratch.jpg',
      bookingId: 'B-2026-0042',
      category: 'Damage',
      userId: '00000000-0000-0000-0000-000000000001',
    })

    expect(result.id).toBeDefined()
    expect(result.filename).toBe('lens_scratch.jpg')
    expect(result.storagePath).toContain('B-2026-0042')
    expect(result.storagePath).toContain('lens_scratch.jpg')
    expect(result.signedUrl).toBeDefined()
    expect(result.fileSizeBytes).toBe(fakeImageBlob.size)

    // Verify retrieving signed URL for the uploaded photo
    const signedUrl = await getEvidenceSignedUrl(result.storagePath)
    expect(signedUrl).toBeDefined()
    expect(typeof signedUrl).toBe('string')
  })

  it('returns null for non-existent storage path', async () => {
    const missing = await getEvidenceSignedUrl('general/non_existent_file.jpg')
    expect(missing).toBeNull()
  })
})
