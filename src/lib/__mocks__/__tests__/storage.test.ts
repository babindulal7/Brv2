import { describe, it, expect } from 'vitest'
import { createMockStorage, createMemoryBackend } from '../storage'

/**
 * The mock Storage shim, driven through its memory backend.
 *
 * The backend is injected rather than detected so these run the SAME code path
 * a browser takes — only the two-line get/put/all layer differs. That layer is
 * the part IndexedDB owns, and it is deliberately the only part not covered
 * here: jsdom ships no IndexedDB, and a hand-rolled fake would be testing the
 * fake.
 */
const storage = () => createMockStorage(createMemoryBackend())

const PATH = 'bookings/900/front.jpg'

describe('mock storage — the happy path matches supabase-js', () => {
  it('uploads and reads the same bytes back', async () => {
    const s = storage()
    const up = await s.from('evidence').upload(PATH, 'hello evidence')
    expect(up.error).toBeNull()
    expect(up.data?.path).toBe(PATH)
    expect(up.data?.fullPath).toBe(`evidence/${PATH}`)

    const down = await s.from('evidence').download(PATH)
    expect(down.error).toBeNull()
    expect(await down.data?.text()).toBe('hello evidence')
  })

  it('accepts a Blob, an ArrayBuffer, a Uint8Array and a string alike', async () => {
    const s = storage()
    const bodies: Array<[string, Blob | ArrayBuffer | Uint8Array | string]> = [
      ['a.txt', 'plain string'],
      ['b.txt', new TextEncoder().encode('a uint8array')],
      ['c.txt', new TextEncoder().encode('an arraybuffer').buffer as ArrayBuffer],
      ['d.txt', new Blob(['a blob'])],
    ]
    for (const [name, body] of bodies) {
      const r = await s.from('evidence').upload(name, body)
      expect(r.error, name).toBeNull()
    }
    expect((await s.from('evidence').list()).data).toHaveLength(4)
    expect(await (await s.from('evidence').download('b.txt')).data?.text()).toBe('a uint8array')
  })

  it('derives a mime type from the extension, and lets contentType override it', async () => {
    const s = storage()
    await s.from('evidence').upload('x.jpg', 'j')
    await s.from('evidence').upload('y.bin', 'b', { contentType: 'image/png' })
    const listed = (await s.from('evidence').list()).data ?? []
    expect(listed.find((o) => o.name === 'x.jpg')?.metadata.mimetype).toBe('image/jpeg')
    expect(listed.find((o) => o.name === 'y.bin')?.metadata.mimetype).toBe('image/png')
  })

  it('records a content hash and a size, the provenance scripts/local-storage.mjs also keeps', async () => {
    const s = storage()
    await s.from('evidence').upload(PATH, 'hello evidence')
    const [object] = (await s.from('evidence').list()).data ?? []
    expect(object?.metadata.size).toBe(14)
    expect(object?.metadata.contentHash).toMatch(/^[0-9a-f]{64}$|^nosubtle-\d+$/)
  })

  it('lists by prefix, and buckets do not leak into each other', async () => {
    const s = storage()
    await s.from('evidence').upload('bookings/900/a.jpg', '1')
    await s.from('evidence').upload('bookings/901/b.jpg', '2')
    await s.from('kyc').upload('bookings/900/c.jpg', '3')

    expect((await s.from('evidence').list('bookings/900/')).data?.map((o) => o.name))
      .toEqual(['bookings/900/a.jpg'])
    expect((await s.from('evidence').list()).data).toHaveLength(2)
    expect((await s.from('kyc').list()).data?.map((o) => o.name)).toEqual(['bookings/900/c.jpg'])
  })

  it('reports a missing object rather than throwing', async () => {
    const s = storage()
    const r = await s.from('evidence').download('nope.jpg')
    expect(r.data).toBeNull()
    expect(r.error?.message).toBe('Object not found')
  })
})

describe('mock storage — Law 3, which is where it diverges on purpose', () => {
  it('refuses a second upload to the same path, in supabase-js’s own words', async () => {
    const s = storage()
    await s.from('evidence').upload(PATH, 'first')
    const again = await s.from('evidence').upload(PATH, 'second')

    expect(again.data).toBeNull()
    expect(again.error?.message).toBe('The resource already exists')
    /* And the first version is still the one on the shelf. */
    expect(await (await s.from('evidence').download(PATH)).data?.text()).toBe('first')
  })

  it('refuses upsert, which the real client would honour', async () => {
    const s = storage()
    await s.from('evidence').upload(PATH, 'first')
    const forced = await s.from('evidence').upload(PATH, 'second', { upsert: true })

    expect(forced.error?.message).toMatch(/^Law 3/)
    expect(await (await s.from('evidence').download(PATH)).data?.text()).toBe('first')
  })

  it('refuses remove, and says how to supersede instead', async () => {
    const s = storage()
    await s.from('evidence').upload(PATH, 'first')
    const removed = await s.from('evidence').remove([PATH])

    expect(removed.error.message).toMatch(/^Law 3: nothing is deleted/)
    expect(removed.error.message).toContain('new object at a new path')
    /* The object survives its own deletion — the whole point. */
    expect((await s.from('evidence').list()).data).toHaveLength(1)
  })
})

describe('mock storage — the URLs', () => {
  it('getPublicUrl returns a URL that does not resolve, because the bucket is private', async () => {
    const s = storage()
    await s.from('evidence').upload(PATH, 'x')
    const { publicUrl } = s.from('evidence').getPublicUrl(PATH).data

    /* Faithful, not broken: the real getPublicUrl on a private bucket returns a
       URL that 400s. A working one here would teach a habit production refuses. */
    expect(publicUrl).toBe(`mock-storage://evidence/${PATH}`)
    expect(publicUrl.startsWith('http')).toBe(false)
  })

  it('createSignedUrl reports a missing object rather than minting a dead URL', async () => {
    const s = storage()
    const r = await s.from('evidence').createSignedUrl('nope.jpg')
    expect(r.data).toBeNull()
    expect(r.error?.message).toBe('Object not found')
  })
})
