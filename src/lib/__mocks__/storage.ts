/**
 * **Mock Storage — files, in the browser, with no Supabase and no Docker.**
 *
 * Structurally replaces `supabase.storage`. Composed into the exported client by
 * `lib/supabase.ts` when `VITE_DATA_SOURCE=mock`, so a screen calls
 * `supabase.storage.from('evidence').upload(...)` and neither knows nor cares
 * which one it got.
 *
 * ## Why this exists
 *
 * `storage.buckets` is EMPTY on production — one fact sitting under evidence
 * photos, KYC, client documents and invoice PDFs. Locally there was nothing
 * either: real Supabase Storage is a service the Docker stack provides, and
 * Docker cannot start on this machine (`com.docker.service` is Stopped and an
 * unelevated shell cannot open it). `scripts/local-storage.mjs` covers Node —
 * probes, scripts, the lifecycle gate — but a browser cannot reach a Node
 * filesystem, so an upload button had nowhere to put bytes.
 *
 * ## Why IndexedDB here, when `client.ts` deliberately refuses it
 *
 * `client.ts` keeps its overlay in localStorage precisely because an async
 * IndexedDB open would not be ready before the first synchronous `from()` call.
 * That reasoning does not apply to files: every method of the Storage API is
 * already async, so the open can be awaited inside the call that needs it.
 * Files are also the one thing that would actually breach localStorage's ~5 MB
 * ceiling — a single phone photo is 2–4 MB.
 *
 * Its own database (`babin.mock.storage.v1`), deliberately NOT `offlineQueue.ts`'s
 * `BabinOfflineQueue` and not the mock overlay key, for the same reason
 * `client.ts` gives: two stores that can be confused for each other eventually
 * are.
 *
 * ## Where it diverges from the real API, on purpose
 *
 *   `remove()`     refused. Law 3 — nothing is deleted, an evidence photo least
 *                  of all. Real Supabase would delete; a bucket policy is what
 *                  stops it there, and the audit's Option A says "no update/
 *                  delete". Superseding means a new object at a new path.
 *   `upsert: true` refused, same reason. Real Supabase honours it.
 *   `getPublicUrl` returns a URL that does not resolve. That is FAITHFUL: the
 *                  evidence bucket is private, so the real one returns a URL
 *                  that 400s too. Use `createSignedUrl`.
 *
 * Everything else — argument shapes, `{ data, error }` returns, the
 * `already exists` error on a duplicate path — matches supabase-js, so code
 * written against this ports unchanged.
 */

const DB_NAME = 'babin.mock.storage.v1'
const STORE = 'objects'

export interface StoredObject {
  /** `${bucket}/${path}` — the primary key. */
  key: string
  bucket: string
  path: string
  bytes: ArrayBuffer
  size: number
  mimeType: string
  /** SHA-256, hex. The same provenance `scripts/local-storage.mjs` records. */
  contentHash: string
  createdAt: string
}

export interface StorageBackend {
  get(key: string): Promise<StoredObject | undefined>
  put(object: StoredObject): Promise<void>
  all(): Promise<StoredObject[]>
}

/**
 * The fallback, and the one the tests drive. It is not only for tests: Safari in
 * private mode throws on storage access rather than returning null, and this app
 * has already been broken once by exactly that (`localStorage` on WebKit). A
 * failed IndexedDB open must degrade to a working session, not a white screen.
 */
export function createMemoryBackend(): StorageBackend {
  const map = new Map<string, StoredObject>()
  return {
    get: async (key) => map.get(key),
    put: async (object) => { map.set(object.key, object) },
    all: async () => [...map.values()],
  }
}

function createIndexedDbBackend(): StorageBackend | null {
  if (typeof indexedDB === 'undefined') return null

  let open: Promise<IDBDatabase> | null = null
  const db = () => {
    open ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE, { keyPath: 'key' })
        }
      }
      request.onsuccess = () => { resolve(request.result) }
      request.onerror = () => { reject(request.error ?? new Error('indexedDB.open failed')) }
      request.onblocked = () => { reject(new Error('indexedDB.open blocked')) }
    })
    return open
  }

  const run = <T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> =>
    db().then((database) => new Promise<T>((resolve, reject) => {
      const request = fn(database.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => { resolve(request.result as T) }
      request.onerror = () => { reject(request.error ?? new Error('IndexedDB request failed')) }
    }))

  return {
    get: (key) => run<StoredObject | undefined>('readonly', (s) => s.get(key)),
    put: (object) => run<void>('readwrite', (s) => s.put(object)),
    all: () => run<StoredObject[]>('readonly', (s) => s.getAll()),
  }
}

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', pdf: 'application/pdf', json: 'application/json',
  csv: 'text/csv', txt: 'text/plain', md: 'text/markdown',
}
const mimeOf = (path: string): string =>
  MIME[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'

async function sha256(bytes: ArrayBuffer): Promise<string> {
  /* `crypto.subtle` is absent on an insecure origin and in some test runners.
     The hash is provenance, not security, so a length-and-content marker is a
     usable stand-in — and it is labelled so nobody mistakes it for a digest. */
  if (typeof crypto === 'undefined' || crypto.subtle === undefined) {
    return `nosubtle-${bytes.byteLength}`
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function toArrayBuffer(body: Blob | ArrayBuffer | Uint8Array | string): Promise<ArrayBuffer> {
  if (typeof body === 'string') return new TextEncoder().encode(body).buffer as ArrayBuffer
  if (body instanceof ArrayBuffer) return body
  if (ArrayBuffer.isView(body)) return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
  return body.arrayBuffer()
}

/** supabase-js's error shape, near enough that `error.message` reads the same. */
const fail = (message: string) => ({ data: null, error: { name: 'StorageError', message } })

export interface MockStorage {
  from(bucket: string): {
    upload(path: string, body: Blob | ArrayBuffer | Uint8Array | string, options?: { upsert?: boolean; contentType?: string }): Promise<{ data: { path: string; id: string; fullPath: string } | null; error: { name: string; message: string } | null }>
    download(path: string): Promise<{ data: Blob | null; error: { name: string; message: string } | null }>
    list(prefix?: string): Promise<{ data: Array<{ name: string; id: string; metadata: { size: number; mimetype: string; contentHash: string } }> | null; error: { name: string; message: string } | null }>
    createSignedUrl(path: string, expiresIn?: number): Promise<{ data: { signedUrl: string } | null; error: { name: string; message: string } | null }>
    getPublicUrl(path: string): { data: { publicUrl: string } }
    remove(paths: string[]): Promise<{ data: null; error: { name: string; message: string } }>
  }
}

export function createMockStorage(backend: StorageBackend = createIndexedDbBackend() ?? createMemoryBackend()): MockStorage {
  return {
    from(bucket: string) {
      const keyOf = (path: string) => `${bucket}/${path}`

      return {
        async upload(path, body, options) {
          if (options?.upsert === true) {
            return fail(
              'Law 3: upsert is refused — nothing is overwritten. Write the new version at a new path.',
            )
          }
          const key = keyOf(path)
          if (await backend.get(key) !== undefined) {
            /* supabase-js's own wording for a duplicate, so a caller that
               already branches on it keeps working. */
            return fail('The resource already exists')
          }
          const bytes = await toArrayBuffer(body)
          await backend.put({
            key,
            bucket,
            path,
            bytes,
            size: bytes.byteLength,
            mimeType: options?.contentType ?? mimeOf(path),
            contentHash: await sha256(bytes),
            createdAt: new Date().toISOString(),
          })
          return { data: { path, id: key, fullPath: key }, error: null }
        },

        async download(path) {
          const found = await backend.get(keyOf(path))
          if (found === undefined) return fail('Object not found')
          return { data: new Blob([found.bytes], { type: found.mimeType }), error: null }
        },

        async list(prefix) {
          const all = await backend.all()
          const matched = all
            .filter((o) => o.bucket === bucket && (prefix === undefined || o.path.startsWith(prefix)))
            .sort((a, b) => a.path.localeCompare(b.path))
          return {
            data: matched.map((o) => ({
              name: o.path,
              id: o.key,
              metadata: { size: o.size, mimetype: o.mimeType, contentHash: o.contentHash },
            })),
            error: null,
          }
        },

        async createSignedUrl(path) {
          const found = await backend.get(keyOf(path))
          if (found === undefined) return fail('Object not found')
          if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
            return fail('No URL.createObjectURL in this environment')
          }
          /* A blob: URL, not a signed one — there is no server to sign against.
             It is revoked by the browser when the document unloads, which is a
             shorter life than any expiresIn the caller could ask for, so the
             argument is accepted and ignored rather than faked. */
          return {
            data: { signedUrl: URL.createObjectURL(new Blob([found.bytes], { type: found.mimeType })) },
            error: null,
          }
        },

        getPublicUrl(path) {
          /* Deliberately non-resolving. The evidence bucket is private, so the
             REAL getPublicUrl returns a URL that 400s — returning something that
             worked here would teach the caller a habit production refuses. */
          return { data: { publicUrl: `mock-storage://${bucket}/${path}` } }
        },

        async remove(paths) {
          return {
            data: null,
            error: {
              name: 'StorageError',
              message:
                `Law 3: nothing is deleted. Refused removal of ${paths.length} object(s) from ` +
                `'${bucket}'. Supersede by writing a new object at a new path.`,
            },
          }
        },
      }
    },
  }
}

export const mockStorage = createMockStorage()
