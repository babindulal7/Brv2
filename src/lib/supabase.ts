import { createClient } from '@supabase/supabase-js'
import { getSecureAuthStorage } from './secureStorage'

/**
 * Supabase client.
 *
 * SECURITY — Platform Build Instructions §7:
 *   "Never ship Supabase service keys. Anon key only; Row Level Security
 *    enforces access."
 *
 * The anon key is the ONLY key that may reach this file. Anything privileged
 * runs in an Edge Function, which is also the only place a secret is held —
 * secrets live in Supabase Vault, never in the integrations table, and the
 * client never receives one.
 *
 * Tokens must not sit in localStorage inside a native shell (Capacitor / Tauri);
 * that path uses Keychain / Keystore / Stronghold instead. `storage` is left at
 * its default here because this entry point is the browser build.
 */

/**
 * DATA SOURCE — `live` (default) or `mock`.
 *
 * `mock` swaps this module's export for a local corpus served by
 * `lib/__mocks__/client.ts`: no network, no project, no credentials. It exists so
 * the app can be driven offline and so a fresh clone runs without anyone's
 * keys. Set `VITE_DATA_SOURCE=mock` in `.env.local` and restart Vite.
 *
 * ⚠ This is NOT the dev auth bypass removed on 12 Aug 2026 (see `auth.tsx`).
 * That one faked the React `user` while queries still went out as `anon`, so
 * RLS denied them and the app showed "Owner" over empty lists. Here the whole
 * backend is local, so data genuinely arrives — and `MockBanner` states on
 * every screen that it is mock data, because a `console.warn` was already
 * proven insufficient.
 *
 * The switch is deliberately ABOVE the credential guard below: mock mode must
 * not require `VITE_SUPABASE_URL`, and that guard throws during module
 * evaluation — before React mounts and outside any error boundary.
 *
 * Default is `live` so a production build can never ship mock data by omission.
 */
export const IS_MOCK = import.meta.env['VITE_DATA_SOURCE'] === 'mock'

function createLiveClient() {
  const url = import.meta.env['VITE_SUPABASE_URL']
  const anonKey = import.meta.env['VITE_SUPABASE_ANON_KEY']

  if (!url || !anonKey) {
    throw new Error(
      'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill it in — or set VITE_DATA_SOURCE=mock to run against the local corpus.',
    )
  }

  return createClient(url, anonKey, {
    auth: {
      storage: getSecureAuthStorage(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: { 'x-application-name': 'babin-rentals-os' },
    },
  })
}

/**
 * In production builds, `VITE_DATA_SOURCE` is inlined as `'live'` (the default),
 * so `IS_MOCK` becomes `false` and the mock branch is dead-code eliminated.
 * In `dev:mock`, it is inlined as `'mock'` and the mock client is used.
 *
 * The mock imports are inside the conditional so they are tree-shaken out of
 * production bundles.
 */
let _supabase: ReturnType<typeof createLiveClient> | null = null

let _mockClientPromise: Promise<ReturnType<typeof createLiveClient>> | null = null

async function createMockClient(): Promise<ReturnType<typeof createLiveClient>> {
  if (_mockClientPromise) return _mockClientPromise
  _mockClientPromise = (async () => {
    const [{ mockSupabase }, { mockStorage }] = await Promise.all([
      import('./__mocks__/client'),
      import('./__mocks__/storage'),
    ])
    return { ...mockSupabase, storage: mockStorage } as unknown as ReturnType<typeof createLiveClient>
  })()
  return _mockClientPromise
}

/**
 * Get the Supabase client. In production (IS_MOCK=false), returns the live client synchronously.
 * In mock mode (IS_MOCK=true), throws — use getSupabaseClient() instead for async access.
 */
export function getSupabaseClient(): ReturnType<typeof createLiveClient> {
  if (IS_MOCK) {
    throw new Error('Mock mode requires async client. Use getSupabaseClientAsync() instead.')
  }
  if (!_supabase) _supabase = createLiveClient()
  return _supabase
}

/**
 * Async version for mock mode. In production, returns the live client immediately.
 */
export async function getSupabaseClientAsync(): Promise<ReturnType<typeof createLiveClient>> {
  if (IS_MOCK) {
    return createMockClient()
  }
  return getSupabaseClient()
}

let _mockClient: ReturnType<typeof createLiveClient> | null = null

/**
 * Mock mode only: `main.tsx` awaits this before it renders, so every
 * `supabase.*` call below finds the client loaded. A no-op in live mode.
 */
export async function loadMockClient(): Promise<void> {
  if (IS_MOCK && !_mockClient) _mockClient = await createMockClient()
}

/**
 * The synchronous client 150+ modules import directly.
 *
 * In mock mode it is a forwarder to the dynamically imported mock client, so the
 * corpus stays out of live bundles (the import() above is dead code there). It
 * must not throw at module evaluation: from 6 Oct 2026 it did, and mock mode
 * rendered a blank page before React mounted.
 */
export const supabase: ReturnType<typeof createLiveClient> = IS_MOCK
  ? new Proxy({} as ReturnType<typeof createLiveClient>, {
      get(_target, key) {
        if (!_mockClient) throw new Error('Mock client used before loadMockClient() resolved')
        return Reflect.get(_mockClient, key)
      },
    })
  : createLiveClient()

/**
 * Idempotency key for every write.
 *
 * Foundation / Platform Build Instructions §4.2:
 *   "every queued write carries a client-generated UUID; the server rejects a
 *    duplicate UUID. A packing scan replayed twice must not pack the item twice."
 *
 * Generate once at the point the user acts, not at send time — the whole point
 * is that a replay of the SAME action carries the SAME key.
 */
export function newClientUuid(): string {
  return crypto.randomUUID()
}