/**
 * **Mock Supabase client — the drop-in.**
 *
 * Structurally replaces the object exported from `lib/supabase.ts`. The real
 * client is created without a `<Database>` generic, so nothing in the app
 * depends on supabase-js's nominal types — only on these shapes.
 *
 * PERSISTENCE. The base corpus is NOT persisted: `buildCorpus()` is pure and
 * deterministic (no `Date.now`, no `Math.random`), so rebuilding it on every
 * boot is byte-identical and costs nothing. Only MUTATIONS are stored, as a
 * small replay log in localStorage. That keeps init synchronous — the store has
 * to be ready before the first `from()` call, and an async IndexedDB open would
 * not be — and it sidesteps the ~5 MB localStorage ceiling a full corpus dump
 * would flirt with.
 *
 * ⚠ Deliberately NOT sharing `offlineQueue.ts`'s Dexie database
 * (`BabinOfflineQueue`), and deliberately NOT reusing supabase-js's
 * localStorage session key (`sb-<host>-auth-token`) — a stale real session
 * sitting under that key must never be read as a mock session, or vice versa.
 */

import { createBuilder, type EngineHooks, type PgError, type Row, type Store } from './engine'
import { buildStore, clientDirectory, VIEW_OF } from './corpus'

const OVERLAY_KEY = 'babin.mock.overlay.v1'
const SESSION_KEY = 'babin.mock.session.v1'

/** Sign-in accepts these three, with ANY password. It is a local mimic with no
 *  security boundary; the banner names them so the login screen stays usable. */
export const MOCK_LOGINS = [
  { email: 'owner@babinrentals.com', role: 'Owner' },
  { email: 'warehouse@babinrentals.com', role: 'Warehouse' },
  { email: 'billing@babinrentals.com', role: 'Accounts' },
] as const

interface Overlay {
  inserts: { table: string; row: Row }[]
  updates: { table: string; id: unknown; patch: Row }[]
  deletes: { table: string; id: unknown }[]
  seq: Record<string, number>
}

function emptyOverlay(): Overlay {
  return { inserts: [], updates: [], deletes: [], seq: {} }
}

function loadOverlay(): Overlay {
  try {
    const raw = localStorage.getItem(OVERLAY_KEY)
    if (!raw) return emptyOverlay()
    const parsed = JSON.parse(raw) as Partial<Overlay>
    return {
      inserts: parsed.inserts ?? [],
      updates: parsed.updates ?? [],
      deletes: parsed.deletes ?? [],
      seq: parsed.seq ?? {},
    }
  } catch {
    return emptyOverlay()
  }
}

function saveOverlay(o: Overlay): void {
  try {
    localStorage.setItem(OVERLAY_KEY, JSON.stringify(o))
  } catch {
    /* quota or private mode — mutations stay in memory for this session only */
  }
}

export function resetMockData(): void {
  try {
    localStorage.removeItem(OVERLAY_KEY)
    localStorage.removeItem(SESSION_KEY)
  } catch { /* ignore */ }
}

/* ── Store + overlay ───────────────────────────────────────────────────── */

const store: Store = buildStore()
const overlay = loadOverlay()

for (const { table, row } of overlay.inserts) (store[table] ??= []).push(row)
for (const { table, id, patch } of overlay.updates) {
  const t = store[table]
  const hit = t?.find((r) => r['id'] === id)
  if (hit) Object.assign(hit, patch)
}
for (const { table, id } of overlay.deletes) {
  const t = store[table]
  if (t) store[table] = t.filter((r) => r['id'] !== id)
}

/** Views are computed on read so they always reflect the latest base rows. */
function read(table: string): Row[] {
  if (table === 'client_directory_v') return clientDirectory(store)
  const base = VIEW_OF[table]
  if (base) return store[base] ?? []
  const rows = store[table]
  if (!rows) {
    // Unknown table: empty, loudly. Never an error — an error here would make a
    // screen show "something went wrong" for a table the corpus simply lacks.
    // eslint-disable-next-line no-console
    console.warn(`[mock] no rows for table "${table}" — returning []`)
    store[table] = []
    return store[table] as Row[]
  }
  return rows
}

function writableTable(table: string): string {
  return VIEW_OF[table] ?? table
}

const hooks: EngineHooks = {
  read,
  insert(table, rows) {
    const target = writableTable(table)
    const existing = (store[target] ??= [])
    const out: Row[] = []
    for (const incoming of rows) {
      const clientUuid = incoming['client_uuid']
      if (clientUuid != null && existing.some((r) => r['client_uuid'] === clientUuid)) {
        // Law 8. Five call sites test exactly this code + this substring.
        return {
          rows: [],
          error: {
            code: '23505',
            message: `duplicate key value violates unique constraint "${target}_client_uuid_key"`,
            details: 'Key (client_uuid) already exists.',
          } satisfies PgError,
        }
      }
      const row: Row = {
        id: incoming['id'] ?? crypto.randomUUID(),
        created_at: incoming['created_at'] ?? new Date().toISOString(),
        ...incoming,
      }
      existing.push(row)
      overlay.inserts.push({ table: target, row })
      out.push(row)
    }
    saveOverlay(overlay)
    return { rows: out, error: null }
  },
  update(table, patch, pred) {
    const target = writableTable(table)
    const hits = (store[target] ?? []).filter(pred)
    for (const r of hits) {
      Object.assign(r, patch)
      overlay.updates.push({ table: target, id: r['id'], patch: { ...patch } })
    }
    if (hits.length) saveOverlay(overlay)
    return hits
  },
  remove(table, pred) {
    const target = writableTable(table)
    const rows = store[target] ?? []
    const hits = rows.filter(pred)
    store[target] = rows.filter((r) => !pred(r))
    for (const r of hits) overlay.deletes.push({ table: target, id: r['id'] })
    if (hits.length) saveOverlay(overlay)
    return hits
  },
}

/* ── Auth ──────────────────────────────────────────────────────────────── */

interface MockSession {
  user: { id: string; email: string }
}

type AuthListener = (event: string, session: MockSession | null) => void
const listeners = new Set<AuthListener>()

function readSession(): MockSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as MockSession) : null
  } catch {
    return null
  }
}

function writeSession(s: MockSession | null): void {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else localStorage.removeItem(SESSION_KEY)
  } catch { /* ignore */ }
  for (const l of listeners) l(s ? 'SIGNED_IN' : 'SIGNED_OUT', s)
}

const auth = {
  async getSession() {
    return { data: { session: readSession() }, error: null }
  },
  onAuthStateChange(cb: AuthListener) {
    listeners.add(cb)
    return {
      data: { subscription: { unsubscribe: () => { listeners.delete(cb) } } },
    }
  },
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const wanted = String(email ?? '').trim().toLowerCase()
    const user = (store['users'] ?? []).find(
      (u) => String(u['email']).toLowerCase() === wanted,
    )
    if (!user) {
      return {
        data: { session: null },
        error: {
          message: `No mock user "${email}". Try ${MOCK_LOGINS.map((l) => l.email).join(', ')}.`,
        },
      }
    }
    if (!password) {
      return { data: { session: null }, error: { message: 'Enter any password — mock mode does not check it.' } }
    }
    const session: MockSession = { user: { id: user['id'] as string, email: user['email'] as string } }
    writeSession(session)
    return { data: { session }, error: null }
  },
  async signOut() {
    writeSession(null)
    return { error: null }
  },
}

/* ── rpc ───────────────────────────────────────────────────────────────── */

const SEQ_PREFIX: Record<string, string> = {
  client: 'C', booking: 'B', invoice: 'INV', payment: 'PAY',
  deposit: 'DEP', expense: 'EXP', equipment: 'EQ',
  CL: 'C', BK: 'B', EQ: 'EQ', PAY: 'PAY', DEP: 'DEP',
}

function nextDocumentNumber(key: string): string {
  const next = (overlay.seq[key] ?? 0) + 1
  overlay.seq[key] = next
  saveOverlay(overlay)
  const prefix = SEQ_PREFIX[key] ?? key.toUpperCase()
  return `${prefix}-2026-${String(next).padStart(4, '0')}`
}

/* ── The client ────────────────────────────────────────────────────────── */

export const mockSupabase = {
  from(table: string) {
    return createBuilder(table, hooks)
  },
  rpc(name: string, args?: Record<string, unknown>) {
    if (name === 'next_document_number') {
      const key = String(args?.['p_sequence_key'] ?? 'doc')
      return Promise.resolve({ data: nextDocumentNumber(key), error: null })
    }
    // eslint-disable-next-line no-console
    console.warn(`[mock] rpc("${name}") is not implemented — returning null`)
    return Promise.resolve({ data: null, error: null })
  },
  auth,
  functions: {
    invoke(name: string) {
      return Promise.resolve({
        data: null,
        error: {
          message: `Edge function "${name}" is unavailable in mock mode (it needs the live project).`,
        },
      })
    },
  },
}

/** Row counts per table, for the banner. */
export function mockStoreSummary(): { table: string; rows: number }[] {
  return Object.entries(store)
    .map(([table, rows]) => ({ table, rows: rows.length }))
    .filter((e) => e.rows > 0)
    .sort((a, b) => b.rows - a.rows)
}
