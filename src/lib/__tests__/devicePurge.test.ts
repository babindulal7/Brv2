import { describe, it, expect, afterEach } from 'vitest'
import { purgeDeviceReadCaches } from '../devicePurge'
/* `?raw` rather than `node:fs`: this program has no `@types/node` (tsconfig's
   `lib` is ES2022 + DOM only), and Vite's own `?raw` loader is both typed —
   via `src/vite-env.d.ts`'s `vite/client` reference — and resolved at build
   time, so a renamed or deleted file fails the build instead of the assertion. */
import purgeSource from '../devicePurge.ts?raw'
import viteConfigSource from '../../../vite.config.ts?raw'

/*
 * `vitest.config.ts` runs this suite under `environment: 'node'`, so
 * `indexedDB` is absent and `isIndexedDbAvailable()` is false. That is
 * deliberate here rather than a limitation: it isolates the half of the purge
 * that is actually dangerous — the Cache Storage allowlist — so these tests pin
 * it without a fake-IndexedDB dependency.
 *
 * The rule being defended: deleting Workbox's PRECACHE would trade a money leak
 * for a tablet that cannot open the app with no signal, which is the one thing
 * this build exists to prevent.
 */

type FakeCaches = { delete: (name: string) => Promise<boolean> }
const original = (globalThis as { caches?: FakeCaches }).caches

function stubCaches(impl: FakeCaches | undefined) {
  if (impl === undefined) delete (globalThis as { caches?: FakeCaches }).caches
  else (globalThis as { caches?: FakeCaches }).caches = impl
}

afterEach(() => stubCaches(original))

describe('purgeDeviceReadCaches — the Cache Storage allowlist', () => {
  it('deletes exactly the two PostgREST data caches', async () => {
    const asked: string[] = []
    stubCaches({ delete: async (n) => { asked.push(n); return true } })

    const report = await purgeDeviceReadCaches()

    expect(asked).toEqual(['supabase-reference-data', 'supabase-operational-data'])
    expect(report.cachesDeleted).toEqual(['supabase-reference-data', 'supabase-operational-data'])
    expect(report.failures).toEqual([])
  })

  it('NEVER deletes the Workbox precache — the offline application shell', async () => {
    const asked: string[] = []
    stubCaches({ delete: async (n) => { asked.push(n); return true } })

    await purgeDeviceReadCaches()

    /* A precache entry is named `workbox-precache-v2-<scope>`. If a future edit
       replaces the allowlist with `caches.keys()` + delete-all, this fails. */
    expect(asked.some((n) => n.startsWith('workbox-precache'))).toBe(false)
    expect(asked.some((n) => n.includes('precache'))).toBe(false)
  })

  it('reports only the caches that existed — a miss is not a failure', async () => {
    stubCaches({ delete: async (n) => n === 'supabase-reference-data' })

    const report = await purgeDeviceReadCaches()

    expect(report.cachesDeleted).toEqual(['supabase-reference-data'])
    expect(report.failures).toEqual([])
  })

  it('collects a throwing cache rather than rejecting — sign-out must not be blockable', async () => {
    stubCaches({
      delete: async (n) => {
        if (n === 'supabase-operational-data') throw new Error('QuotaExceeded')
        return true
      },
    })

    const report = await purgeDeviceReadCaches()

    expect(report.cachesDeleted).toEqual(['supabase-reference-data'])
    expect(report.failures).toHaveLength(1)
    expect(report.failures[0]).toContain('supabase-operational-data')
    expect(report.failures[0]).toContain('QuotaExceeded')
  })

  it('is a no-op, not a crash, where Cache Storage does not exist (dev server, insecure context)', async () => {
    stubCaches(undefined)

    const report = await purgeDeviceReadCaches()

    expect(report.cachesDeleted).toEqual([])
    expect(report.failures).toEqual([])
  })
})

describe('purgeDeviceReadCaches — the outbox is spared', () => {
  it('never clears the offline queue: a shift of unsynced warehouse work must survive a sign-out', () => {
    /* Source-level because the behaviour under test is an ABSENCE, and the node
       environment cannot exercise the Dexie branch at all. The import is aliased
       to `outbox`, so any clear/delete against it would read as `outbox.…`. */
    expect(purgeSource).toMatch(/import \{ db as outbox \}/)
    expect(purgeSource).not.toMatch(/outbox\.[A-Za-z.]*\b(clear|delete|bulkDelete)\s*\(/)
    expect(purgeSource).not.toMatch(/deleteDatabase/)

    /* The only permitted touch of the outbox is a count. */
    const outboxTouches: string[] = purgeSource.match(/outbox\.[A-Za-z.]+\(/g) ?? []
    expect(outboxTouches.every((t) => t.includes('count') || t.includes('where') || t.includes('anyOf'))).toBe(true)
  })
})

describe('purgeDeviceReadCaches — the allowlist tracks the service worker', () => {
  it('names exactly the cacheNames vite.config.ts registers, so a rename cannot silently disarm the purge', () => {
    const registered = [...viteConfigSource.matchAll(/cacheName:\s*'([^']+)'/g)].map((m) => m[1]).sort()
    const allowlisted = [...purgeSource.matchAll(/'(supabase-[a-z-]+)'/g)].map((m) => m[1]).sort()

    expect(registered.length).toBeGreaterThan(0)
    expect(allowlisted).toEqual(registered)
  })
})
