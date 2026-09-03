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
    console.warn(`[mock] no rows for table "${table}" — returning []`)
    store[table] = []
    return store[table] as Row[]
  }
  return rows
}

function writableTable(table: string): string {
  return VIEW_OF[table] ?? table
}

/**
 * The ONE database trigger this store emulates.
 *
 * `bookings.stage` is a read model: "Written ONLY by that table's trigger; a
 * direct UPDATE is rejected" (0002:81, the trigger itself in
 * `0021_forward_only_stage_transitions.sql`). Without this, every floor verb
 * and Confirm Booking in dev:mock wrote its `booking_stage_transitions` row and
 * the booking never moved — Complete Packing on B-716 landed the session, the
 * lines, the movements, the audit rows and a Booked→Packed transition, and the
 * detail page reloaded as BOOKED (BUG_AUDIT_LIFECYCLE X-02, 2 Sep 2026). A
 * driven pass could not tell a working verb from a broken one.
 *
 * Only the read-model write is emulated; the forward-only CHECK that 0021 also
 * enforces stays with the engine's own `planTransition`, which runs before the
 * insert. The patch goes through the overlay so it survives a reload exactly
 * as the inserted transition does.
 */
function applyTriggers(table: string, row: Row): void {
  if (table !== 'booking_stage_transitions') return
  const bookingId = row['booking_id']
  const to = row['to_stage']
  if (typeof bookingId !== 'string' || typeof to !== 'string') return
  const bookings = store['bookings'] ?? []
  for (const b of bookings) {
    if (b['id'] !== bookingId) continue
    const patch: Row = { stage: to, updated_at: row['occurred_at'] ?? row['created_at'] ?? new Date().toISOString() }
    Object.assign(b, patch)
    overlay.updates.push({ table: 'bookings', id: b['id'], patch })
  }
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
      applyTriggers(target, row)
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

/**
 * Sequences whose identifiers are constrained by a database CHECK, and the
 * pattern each must satisfy.
 *
 * ⛔ Every identifier this function minted used to carry a year segment —
 * `B-2026-0001`. **That is rejected by the live database.** `0055` ruled
 * `bookings_booking_no_format` to `^B-[0-9]+$` and `clients_client_code_format`
 * to `^C-[0-9]+$`, and both are applied (all 121 live bookings conform).
 * `B-2026-0001` fails the booking pattern on the hyphen.
 *
 * That did not matter while the mock was a display fixture. It matters now that
 * the local store is the source of truth and the stated plan is to rebuild the
 * same data in Supabase later: every booking and client created locally would
 * have been rejected on the way in, discovered only at migration time with real
 * operating data behind it.
 *
 * Ruled sequences mint the bare `PREFIX-N` form. Everything else keeps the
 * year segment, because nothing constrains those and `INV-2026-0001` is the
 * form the invoice screens already render.
 */
const RULED_FORMAT: Record<string, RegExp> = {
  booking: /^B-[0-9]+$/,
  BK: /^B-[0-9]+$/,
  client: /^C-[0-9]+$/,
  CL: /^C-[0-9]+$/,
}

function nextDocumentNumber(key: string): string {
  const next = (overlay.seq[key] ?? 0) + 1
  overlay.seq[key] = next
  saveOverlay(overlay)
  const prefix = SEQ_PREFIX[key] ?? key.toUpperCase()

  const ruled = RULED_FORMAT[key]
  const value = ruled ? `${prefix}-${next}` : `${prefix}-2026-${String(next).padStart(4, '0')}`

  if (ruled && !ruled.test(value)) {
    // Unreachable by construction; here so a future edit to the format above
    // cannot quietly start minting identifiers Postgres will refuse.
    throw new Error(`[mock] minted "${value}" for sequence "${key}", which violates ${String(ruled)}`)
  }
  return value
}

/**
 * `create_booking(jsonb)` — the local half of migration 0063.
 *
 * The real function exists so that a booking header, its lines, and any
 * discount (whose `audit_event_id` is NOT NULL, so it needs an audit row
 * written and read back first) all land in **one transaction**. The reason is
 * different here — there is no network to half-fail across — but the OUTCOME
 * must be identical, because `createRental` calls one `.rpc('create_booking')`
 * in both modes and there must not be two implementations of what a booking is.
 *
 * Kept deliberately in step with `supabase/migrations/0063_create_booking_function.sql`
 * as revised by 0070 (parent linkage) and 0071 (units at creation — D5):
 * same payload shape, same return shape, same Law 8 replay behaviour. If one
 * changes, both change.
 *
 * Prices nothing (Law 1 — `lib/money.ts` owns the order). Sets no stage: a new
 * booking is a Quote, and Confirm is a separate act.
 */
function createBooking(payload: Record<string, unknown>): { data: Row | null; error: PgError | null } {
  const clientUuid = payload['client_uuid'] as string | undefined
  if (!clientUuid) {
    return { data: null, error: { code: '23502', message: 'create_booking: client_uuid is required (Law 8)', details: '', hint: '' } }
  }
  const actor = payload['created_by'] as string | undefined
  if (!actor) {
    return { data: null, error: { code: '23502', message: 'create_booking: created_by is required; there is no system actor', details: '', hint: '' } }
  }

  // Law 8 replay check, before any write and before the counter moves.
  const existing = (store['bookings'] ?? []).find((r) => r['client_uuid'] === clientUuid)
  if (existing) {
    return {
      data: {
        booking_id: existing['id'],
        booking_no: existing['booking_no'],
        stage: existing['stage'],
        replayed: true,
      } as Row,
      error: null,
    }
  }

  const bookingNo = nextDocumentNumber('booking')
  const bookingId = crypto.randomUUID()
  const now = new Date().toISOString()

  const header: Row = {
    id: bookingId,
    client_uuid: clientUuid,
    booking_no: bookingNo,
    branch_id: payload['branch_id'] ?? null,
    client_id: payload['client_id'] ?? null,
    contact_id: payload['contact_id'] ?? null,
    project: payload['project'] ?? null,
    stage: 'Quote',
    pickup_at: payload['pickup_at'] ?? null,
    return_at: payload['return_at'] ?? null,
    delivery_type: payload['delivery_type'] ?? null,
    pickup_location: payload['pickup_location'] ?? null,
    return_location: payload['return_location'] ?? null,
    quote_expires_at: payload['quote_expires_at'] ?? null,
    deposit_required: payload['deposit_required'] ?? 0,
    version: 1,
    created_at: now,
    created_by: actor,
    updated_at: now,
    updated_by: actor,
  }

  const lines = Array.isArray(payload['lines']) ? (payload['lines'] as Array<Record<string, unknown>>) : []
  const built: Row[] = []
  /* D5 (0071) — creation-time unit assignments, one booking_line_units row per
     entry. Built beside the lines and committed with them, so a refused unit
     leaves no header behind — the local stand-in for the transaction. */
  const builtUnits: Row[] = []
  const seenAssets = new Set<string>()
  for (const [i, line] of lines.entries()) {
    if (!line['client_uuid']) {
      return { data: null, error: { code: '23502', message: 'create_booking: every line needs its own client_uuid (one per ROW, not per action)', details: '', hint: '' } }
    }
    if (line['days'] === undefined || line['days'] === null) {
      return { data: null, error: { code: '23502', message: `create_booking: line ${String(line['client_uuid'])} has no days; Law 9 requires it stated, not defaulted`, details: '', hint: '' } }
    }
    const units = Array.isArray(line['units']) ? (line['units'] as Array<Record<string, unknown>>) : []
    const qty = Number(line['qty'] ?? 1)
    if (units.length > qty) {
      return {
        data: null,
        error: {
          code: '23514',
          message: `create_booking: line ${String(line['client_uuid'])} carries more units (${units.length}) than its qty (${qty}). Nothing was created.`,
          details: '',
          hint: '',
        },
      }
    }
    for (const unit of units) {
      if (!unit['client_uuid']) {
        return { data: null, error: { code: '23502', message: 'create_booking: every unit needs its own client_uuid (Law 8, one per ROW)', details: '', hint: '' } }
      }
      if (!unit['asset_id']) {
        return { data: null, error: { code: '23502', message: `create_booking: a unit entry on line ${String(line['client_uuid'])} names no asset_id`, details: '', hint: '' } }
      }
      if (seenAssets.has(String(unit['asset_id']))) {
        return {
          data: null,
          error: {
            code: '23514',
            message: `create_booking: the same physical unit (${String(unit['asset_id'])}) appears twice across this booking's units. Nothing was created.`,
            details: '',
            hint: '',
          },
        }
      }
      seenAssets.add(String(unit['asset_id']))
      // The mis-scan check, mirrored from 0071: a serial from another product
      // is refused whole. Only checkable when the line names a product and the
      // local corpus holds the unit — both halves match the SQL's behaviour.
      if (line['product_id']) {
        const known = (store['product_units'] ?? []).find((r) => r['id'] === unit['asset_id'])
        if (!known) {
          return {
            data: null,
            error: { code: '23503', message: `create_booking: unit ${String(unit['asset_id'])} on line ${String(line['client_uuid'])} names no known product_unit`, details: '', hint: '' },
          }
        }
        if (known['product_id'] !== line['product_id']) {
          return {
            data: null,
            error: {
              code: '23514',
              message: `create_booking: unit ${String(unit['asset_id'])} belongs to a different product than line ${String(line['client_uuid'])}. Nothing was created.`,
              details: '',
              hint: '',
            },
          }
        }
      }
    }
    built.push({
      id: crypto.randomUUID(),
      client_uuid: line['client_uuid'],
      booking_id: bookingId,
      line_type: line['line_type'] ?? 'Equipment',
      parent_line_id: line['parent_line_id'] ?? null,
      product_id: line['product_id'] ?? null,
      bundle_id: line['bundle_id'] ?? null,
      description: line['description'] ?? null,
      qty: line['qty'] ?? 1,
      days: line['days'],
      rate: line['rate'] ?? 0,
      discount_amount: line['discount_amount'] ?? 0,
      is_included: line['is_included'] ?? false,
      service_basis: line['service_basis'] ?? null,
      supplier_id: line['supplier_id'] ?? null,
      supplier_cost: line['supplier_cost'] ?? null,
      markup_amount: line['markup_amount'] ?? null,
      line_note: line['line_note'] ?? null,
      sort_order: line['sort_order'] ?? i,
      voided_at: null,
      created_at: now,
      created_by: actor,
    })
  }

  /*
   * PARENT LINKAGE — the local half of migration 0070.
   *
   * `booking_lines.id` is generated in here, so a caller building the payload
   * cannot fill `parent_line_id` for a bundle child. A child names its parent by
   * that parent's own `client_uuid` instead (`parent_client_uuid`), and the ids
   * are resolved after every row has been given one. Postgres has to do this as
   * a dependency-ordered insert loop because the FK is checked per statement;
   * here every id already exists, so one pass over the map is enough — the
   * OUTCOME is identical, which is the only thing the seam requires.
   *
   * A dangling reference is refused whole, exactly as 0070 raises: a bundle
   * silently flattened into loose lines is the failure both halves exist to end.
   */
  const idByClientUuid = new Map<string, string>()
  for (const row of built) idByClientUuid.set(String(row['client_uuid']), String(row['id']))
  for (const [i, line] of lines.entries()) {
    const parentKey = line['parent_client_uuid']
    if (parentKey === undefined || parentKey === null || parentKey === '') continue
    const parentId = idByClientUuid.get(String(parentKey))
    if (parentId === undefined) {
      return {
        data: null,
        error: {
          code: '23503',
          message:
            `create_booking: line ${String(line['client_uuid'])} names parent_client_uuid ${String(parentKey)}, ` +
            'which is not a line on this booking. Nothing was created.',
          details: '',
          hint: '',
        },
      }
    }
    if (parentId === String(built[i]?.['id'])) {
      return {
        data: null,
        error: { code: '23514', message: 'create_booking: a line cannot be its own parent. Nothing was created.', details: '', hint: '' },
      }
    }
    const row = built[i]
    if (row) row['parent_line_id'] = parentId
  }

  /* D5 (0071) — the unit rows, built once the line ids exist. The serial chips
     of spec §10.2: one row per assigned unit, qty 1, removable later by
     deleting the ROW, never by editing the line. */
  for (const [i, line] of lines.entries()) {
    const parentRow = built[i]
    if (!parentRow) continue
    const units = Array.isArray(line['units']) ? (line['units'] as Array<Record<string, unknown>>) : []
    for (const unit of units) {
      builtUnits.push({
        id: crypto.randomUUID(),
        client_uuid: unit['client_uuid'],
        booking_line_id: parentRow['id'],
        asset_id: unit['asset_id'],
        qty: 1,
        unit_state: 'Ready',
        is_required: true,
        packed: false,
        damaged: false,
        created_at: now,
        created_by: actor,
      })
    }
  }

  // Nothing is committed to the store until every line has validated, so a bad
  // line cannot leave a header with no lines behind it — the local stand-in for
  // the transaction the real function gets from Postgres.
  /* The discounts, as `create_booking` (0065:166-210) writes them — with the
     two CHECKs of `booking_discounts` (0002:593-600) the real function meets:
     a hard cap of 25%, and above 10% a reason AND an approver. D3 (31 Aug)
     removed the gate from the APP; the schema still carries it, and a driven
     pass has to meet the same refusal production would. TODO(decision): PLAN
     records D3 and the schema disagree — one of them has to move. */
  const discounts = Array.isArray(payload['discounts']) ? (payload['discounts'] as Array<Record<string, unknown>>) : []
  const builtDiscounts: Row[] = []
  for (const d of discounts) {
    if (!d['client_uuid']) {
      return { data: null, error: { code: '23502', message: 'create_booking: every discount needs its own client_uuid (Law 8, one per ROW)', details: '', hint: '' } }
    }
    const pct = Number(d['percent'])
    if (!Number.isFinite(pct) || pct < 0 || pct > 25) {
      return { data: null, error: { code: '23514', message: `new row for relation "booking_discounts" violates check constraint "booking_discounts_hard_cap" (percent ${String(d['percent'])})`, details: '', hint: '' } }
    }
    if (pct > 10 && (!d['reason'] || !d['approver_id'])) {
      return { data: null, error: { code: '23514', message: 'new row for relation "booking_discounts" violates check constraint "booking_discounts_over_ten_needs_reason_and_approver"', details: '', hint: '' } }
    }
    builtDiscounts.push({
      id: crypto.randomUUID(),
      client_uuid: d['client_uuid'],
      booking_id: bookingId,
      branch_id: payload['branch_id'] ?? null,
      discount_source: d['discount_source'] ?? 'Manual',
      percent: pct,
      reason: d['reason'] ?? null,
      approver_id: d['approver_id'] ?? null,
      applied_by: actor,
      applied_at: now,
      coupon_id: d['coupon_id'] ?? null,
      audit_event_id: crypto.randomUUID(),
      created_at: now,
    })
  }

  ;(store['bookings'] ??= []).push(header)
  overlay.inserts.push({ table: 'bookings', row: header })
  for (const d of builtDiscounts) {
    ;(store['booking_discounts'] ??= []).push(d)
    overlay.inserts.push({ table: 'booking_discounts', row: d })
  }
  for (const row of built) {
    ;(store['booking_lines'] ??= []).push(row)
    overlay.inserts.push({ table: 'booking_lines', row })
  }
  for (const row of builtUnits) {
    ;(store['booking_line_units'] ??= []).push(row)
    overlay.inserts.push({ table: 'booking_line_units', row })
  }
  saveOverlay(overlay)

  return {
    data: {
      booking_id: bookingId,
      booking_no: bookingNo,
      stage: 'Quote',
      line_count: built.length,
      unit_count: builtUnits.length,
      replayed: false,
    } as Row,
    error: null,
  }
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
    if (name === 'create_booking') {
      const payload = (args?.['p_payload'] ?? {}) as Record<string, unknown>
      return Promise.resolve(createBooking(payload))
    }
    /* ⛔ Was `{ data: null, error: null }` — a silent null that every caller
     * would read as success with an empty result. That is the
     * success-fabrication class this repo has a register for, sitting in the
     * one place a missing RPC should be loudest. An unimplemented function is
     * now an ERROR, so a caller fails visibly instead of continuing on null. */
    console.warn(`[mock] rpc("${name}") is not implemented`)
    return Promise.resolve({
      data: null,
      error: { code: '42883', message: `[mock] rpc("${name}") is not implemented in the local store`, details: '', hint: 'Implement it in src/lib/mock/client.ts beside create_booking.' } as PgError,
    })
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
