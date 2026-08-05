import { createClient } from '@supabase/supabase-js'

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

const url = import.meta.env['VITE_SUPABASE_URL']
const anonKey = import.meta.env['VITE_SUPABASE_ANON_KEY']

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill it in.',
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    headers: { 'x-application-name': 'babin-rentals-os' },
  },
})

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
