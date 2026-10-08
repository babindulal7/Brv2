import { describe, it, expect, vi, beforeEach } from 'vitest'
import { uploadEvidencePhoto, getEvidenceSignedUrl, EVIDENCE_STORAGE_BUCKET } from '../evidenceStorage'

// Mock supabase for tests
vi.mock('../supabase', () => {
  const mockStorage = {
    from: vi.fn(() => ({
      upload: vi.fn().mockResolvedValue({ data: { path: 'test/path.jpg' }, error: null }),
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://example.com/signed-url' }, error: null }),
      download: vi.fn().mockResolvedValue({ data: new Blob(['test']), error: null }),
    })),
  }

  const mockQueryBuilder = {
    insert: vi.fn().mockResolvedValue({ error: null }),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  }

  return {
    supabase: {
      storage: mockStorage,
      from: vi.fn(() => mockQueryBuilder),
      ...mockQueryBuilder,
    },
    IS_MOCK: false,
  }
})

describe('AUD-004: Evidence Storage & Photo Upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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
    expect(typeof result.signedUrl).toBe('string')
    expect(result.fileSizeBytes).toBe(fakeImageBlob.size)

    // Verify retrieving signed URL for the uploaded photo
    const signedUrl = await getEvidenceSignedUrl(result.storagePath)
    expect(signedUrl).toBeDefined()
    expect(typeof signedUrl).toBe('string')
  })

  it('returns signed URL even for non-existent path (mock always succeeds)', async () => {
    const result = await getEvidenceSignedUrl('general/non_existent_file.jpg')
    // Mock always returns a signed URL regardless of path existence
    expect(result).toBeDefined()
    expect(typeof result).toBe('string')
  })
})