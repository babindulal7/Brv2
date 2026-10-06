#!/usr/bin/env node
/**
 * `npm run check:lifecycle` — drive one booking's whole life through a REAL
 * Postgres and assert at every step.
 *
 * RULING 2026-09-08 (R-27).
 *
 * ## Why this exists
 *
 * 2,834 unit tests were green while the database accepted:
 *
 *   · a double booking — two bookings, one camera, overlapping dates, both
 *     confirmed, `inventory_reservations` still at zero rows;
 *   · **every discounted booking refused outright** — `create_booking` wrote an
 *     audit class `'data change'` that `audit_event_class` has never had, so the
 *     enum cast raised 22P02 and rolled the whole create back (0099);
 *   · a stage walk with no floor rows behind it;
 *   · a close with no invoice.
 *
 * None of those is visible to a unit test, and not because the tests are bad.
 * They mock `lib/supabase` or drive `lib/mock/client.ts`, and every one of the
 * four failures above lives on the far side of that seam — in an enum cast, a
 * trigger, a policy, a constraint. A suite that cannot execute plpgsql cannot
 * see them. This script executes plpgsql.
 *
 * ## What it is, and what it is not
 *
 * PGlite: Postgres 18 compiled to WASM, running in this process. A real planner,
 * real plpgsql, real constraints, real triggers, real RLS.
 *
 * ✅ RLS **is** exercised. Every step that names a role runs `set role
 *    authenticated` with `app.current_user_id` set to that user, which is
 *    exactly the shape `auth_user_role()` reads and the shape `0094`'s own
 *    post-conditions use. `authenticated` is not the table owner, so policies
 *    apply.
 *
 * ❌ It is **not** Supabase. No JWT, no PostgREST, no `auth.uid()`, no column
 *    grants as production has them, no connection pooling. A green run here is a
 *    NECESSARY condition for the lifecycle working on production, never a
 *    sufficient one. The same script takes `--live` later (unimplemented) to run
 *    against `sxguwvgoserhdolewibb` with a real seat.
 *
 * ❌ It is not a drift test. This builds an EMPTY database and seeds its own
 *    corpus, so it cannot reproduce a failure that depends on production's rows.
 *
 * ## Known-red steps
 *
 * Some of the thirteen steps assert behaviour that is ruled and NOT BUILT. They
 * carry `expect: 'red'` and a reason. A `red` step that fails is reported and
 * does **not** fail the run; a `red` step that PASSES fails the run loudly,
 * because that means the thing was built and the marker is now a lie. R-27 asks
 * for exactly this ("the script records the current behaviour as a known-red row
 * rather than skipping it") — a skipped step is invisible, a red one is a
 * standing bill.
 *
 *   node scripts/e2e-lifecycle.mjs           # run everything
 *   node scripts/e2e-lifecycle.mjs --only L3 # one step (plus its prerequisites)
 *   node scripts/e2e-lifecycle.mjs --verbose # print every SQL error in full
 *
 * Exit 0 only when every `green` step passed and every `red` step is still red.
 * Writes `.lifecycle-result.json` for `npm run completion` (R-29) to read.
 */
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

const args = process.argv.slice(2)
const verbose = args.includes('--verbose')
const onlyIdx = args.indexOf('--only')
const only = onlyIdx === -1 ? null : args[onlyIdx + 1]

/* ── The corpus this script seeds ─────────────────────────────────────────
 *
 * Fixed uuids so a failure names a row you can find, and so a re-run is
 * byte-identical. Nine users, one per `system_role`, because Law 6 and every
 * capability question below is "which role", and borrowing the 0047 corpus's
 * five would leave Accounts, Technician, Driver and Client untested — which is
 * exactly the gap `four-of-five-staff-cannot-sign-in` describes on production.
 */
const U = {
  Owner: '00000000-0000-4000-8000-00000000e001',
  Admin: '00000000-0000-4000-8000-00000000e002',
  Manager: '00000000-0000-4000-8000-00000000e003',
  Coordinator: '00000000-0000-4000-8000-00000000e004',
  Warehouse: '00000000-0000-4000-8000-00000000e005',
  Accounts: '00000000-0000-4000-8000-00000000e006',
  Technician: '00000000-0000-4000-8000-00000000e007',
  Driver: '00000000-0000-4000-8000-00000000e008',
  Client: '00000000-0000-4000-8000-00000000e009',
}
const SERIAL_PRODUCT = '00000000-0000-4000-8000-00000000f001'
const QTY_PRODUCT = '00000000-0000-4000-8000-00000000f002'
const CONSUMABLE_PRODUCT = '00000000-0000-4000-8000-00000000f003'
const UNITS = [
  '00000000-0000-4000-8000-00000000f101',
  '00000000-0000-4000-8000-00000000f102',
  '00000000-0000-4000-8000-00000000f103',
]
const CLIENT = '00000000-0000-4000-8000-00000000f201'
const OTHER_CLIENT = '00000000-0000-4000-8000-00000000f202'

/** Rental windows, far enough out that no seeded corpus row overlaps them. */
const W = {
  /* #900 · 10-12 Sep */ a: ['2099-09-10T04:00:00Z', '2099-09-12T04:00:00Z'],
  /* #901 · 11-13 Sep — overlaps a */ b: ['2099-09-11T04:00:00Z', '2099-09-13T04:00:00Z'],
  /* #902 · 12-14 Sep — same-day turnaround with a */ c: ['2099-09-12T04:00:00Z', '2099-09-14T04:00:00Z'],
  /* the quantity probes */ d: ['2099-10-01T04:00:00Z', '2099-10-03T04:00:00Z'],
  /* the consumable probe: clear of every other window */ e: ['2099-11-01T04:00:00Z', '2099-11-03T04:00:00Z'],
}

let BRANCH = null

/* ── Plumbing ─────────────────────────────────────────────────────────────── */

const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })

/** Run as a signed-in staff member: the role `authenticated`, identified. */
async function as(role, fn) {
  await db.exec(`set role authenticated; select set_config('app.current_user_id', '${U[role]}', false);`)
  try {
    return await fn()
  } finally {
    /* Defensive: a refused statement leaves the session in an aborted
       transaction, and this cleanup would then throw "current transaction is
       aborted" OVER the real error — which is how L9 spent one run reporting a
       transaction state instead of the four payments it was asking about. */
    try {
      await db.exec(`reset role; select set_config('app.current_user_id', '', false);`)
    } catch {
      await db.exec('rollback;')
      await db.exec(`reset role; select set_config('app.current_user_id', '', false);`)
    }
  }
}

/**
 * Run a block and UNDO it, whatever it did.
 *
 * A step that probes what the database wrongly ACCEPTS leaves those rows behind,
 * and every later step then measures the wreckage instead of its own subject —
 * L9's accepted overpayment turned L10's 7,119 into 15,238 and L13's two
 * payments into three. Law 3 forbids deleting the evidence afterwards, and a
 * step should not need a clean-up path that the product does not have. So the
 * probe runs inside a transaction that is always rolled back.
 */
async function undone(fn) {
  await db.exec('begin;')
  try {
    return await fn()
  } finally {
    try {
      await db.exec('rollback; reset role;')
    } catch {
      /* already aborted */
    }
  }
}

/** Run as the migration owner — seeding, and reading past RLS to assert. */
async function asOwnerOfTheDatabase(fn) {
  await db.exec('reset role;')
  return fn()
}

const q = (text, params) => db.query(text, params)

/** One value, or null. */
async function one(text, params) {
  const r = await q(text, params)
  const row = r.rows[0]
  if (row === undefined) return null
  return Object.values(row)[0]
}

class Refused extends Error {}

/** Assert a statement is REFUSED, and by the right thing. */
async function refuses(what, text, params, matcher) {
  let message = null
  try {
    await q(text, params)
  } catch (e) {
    message = String(e.message)
  }
  if (message === null) throw new Refused(`${what}: the database ACCEPTED it. It must not.`)
  if (matcher !== undefined && !matcher.test(message)) {
    throw new Refused(`${what}: refused, but by the wrong thing — ${message.split('\n')[0]}`)
  }
  return message
}

function assert(condition, what) {
  if (!condition) throw new Refused(what)
}

function assertEq(actual, expected, what) {
  if (String(actual) !== String(expected)) {
    throw new Refused(`${what} — expected ${String(expected)}, got ${String(actual)}`)
  }
}

/* ── Apply the chain ──────────────────────────────────────────────────────── */

console.log((await one('select version()')).split(',')[0])

try {
  await db.exec(readFileSync(join(ROOT, 'supabase', 'pglite-prelude.sql'), 'utf8'))
} catch (e) {
  console.error(`PRELUDE FAILED — ${String(e.message).split('\n')[0]}`)
  process.exit(2)
}

for (const f of readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()) {
  try {
    await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
  } catch (e) {
    console.error(`\nMIGRATION FAILED — ${f}\n  ${String(e.message).split('\n')[0]}`)
    console.error('The chain does not build. `npm run check:pglite` is the tool for that; this script needs it green first.')
    process.exit(2)
  }
}

/* ── Seed ─────────────────────────────────────────────────────────────────── */

async function seed() {
  BRANCH = await one('select id from branches order by created_at limit 1')
  assert(BRANCH !== null, 'seed: the migration chain left no branch to attach anything to.')
  const WAREHOUSE = await one('select id from warehouses order by warehouse_code limit 1')
  assert(WAREHOUSE !== null, 'seed: no warehouse — product_units.warehouse_id is NOT NULL.')
  const CATEGORY = await one('select id from inventory_categories order by name limit 1')
  assert(CATEGORY !== null, 'seed: no inventory_category — products.category_id is NOT NULL.')

  /* Every NOT NULL column with no default is named. `fixtures-invented-reference-data`
     is a whole bug class in this repo: a fixture that invents its own warehouse
     or category keeps a suite green while the real action resolves the label
     against a real table and is refused. So the two lookups above READ the
     corpus rather than minting anything. */
  for (const [n, [role, id]] of Object.entries(U).entries()) {
    await q(
      `insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
       values ($1, gen_random_uuid(), $2, $3, $4, $5, $6, $7, true, $1)
       on conflict (id) do nothing`,
      [
        id,
        `LC-${String(n + 1).padStart(3, '0')}`,
        `lifecycle-${role.toLowerCase()}@babinrentals.test`,
        `Lifecycle ${role}`,
        `98000000${String(n + 1).padStart(2, '0')}`,
        role,
        BRANCH,
      ],
    )
  }

  for (const [n, [id, name]] of [
    [CLIENT, 'Lifecycle Films Pvt. Ltd.'],
    [OTHER_CLIENT, 'Someone Else Pictures'],
  ].entries()) {
    await q(
      `insert into clients (id, client_uuid, client_code, name, phone, created_by)
       values ($1, gen_random_uuid(), $2, $3, $4, $5)
       on conflict (id) do nothing`,
      [id, await one("select next_document_number('client')"), name, `+977980000000${String(n + 1)}`, U.Owner],
    )
  }

  await q(
    `insert into auth.users (id, email, email_confirmed_at)
     values ($1, $2, now())
     on conflict (id) do nothing`,
    [U.Client, 'lifecycle-client@babinrentals.test'],
  )

  await q(
    `insert into portal_users (client_uuid, client_id, auth_user_id, email, status, self_registered_at)
     values (gen_random_uuid(), $1, $2, $3, 'Active', now())
     on conflict do nothing`,
    [CLIENT, U.Client, 'lifecycle-client@babinrentals.test'],
  )

  await q(
    `insert into bookings (client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, delivery_type, stage, created_by, updated_by)
     values (gen_random_uuid(), $4, $1, $2, '2099-12-01T04:00:00Z', '2099-12-03T04:00:00Z', 'Client Pickup', 'Quote', $3, $3)
     on conflict do nothing`,
    [OTHER_CLIENT, BRANCH, U.Owner, await one("select next_document_number('booking')")],
  )

  /* One Serialised product with three units, one Quantity product with a
     stock of three, and one Consumable product with a stock of ten. The 0047
     corpus is 56 products and ALL Serialised, while production is 204 and ALL
     Quantity — so a script that borrowed the corpus would exercise the GiST
     exclusion and never the capacity ceiling, which is the half that matters
     on live. Both are seeded here. The consumable is seeded for L21. */
  await q(
    `insert into products (id, client_uuid, asset_code, name, category_id, brand, tracking_mode, total_quantity, daily_rate, created_by)
     values ($1, gen_random_uuid(), $5, 'Lifecycle Serialised Camera', $4, 'Lifecycle', 'Serialised', 3, 3500, $3),
            ($2, gen_random_uuid(), $6, 'Lifecycle Bulk Cable',        $4, 'Lifecycle', 'Quantity',   3, 250,  $3),
            ($7, gen_random_uuid(), $8, 'Lifecycle Gaffer Tape',       $4, 'Lifecycle', 'Consumable', 10, 150, $3)
     on conflict (id) do nothing`,
    [
      SERIAL_PRODUCT,
      QTY_PRODUCT,
      U.Owner,
      CATEGORY,
      await one("select next_document_number('equipment')"),
      await one("select next_document_number('equipment')"),
      CONSUMABLE_PRODUCT,
      await one("select next_document_number('equipment')"),
    ],
  )

  for (const [n, id] of UNITS.entries()) {
    await q(
      `insert into product_units (id, client_uuid, product_id, asset_tag, serial_no, status, branch_id, warehouse_id, created_by)
       values ($1, gen_random_uuid(), $2, $3, $4, 'In Stock', $5, $6, $7)
       on conflict (id) do nothing`,
      [id, SERIAL_PRODUCT, `LC-SER-001-U0${String(n + 1)}`, `LCSN-00${String(n + 1)}`, BRANCH, WAREHOUSE, U.Owner],
    )
  }
}

/* ── The booking-shaped payloads ──────────────────────────────────────────── */

let bookingIds = {}

function createPayload({ key, window, actor, lines, discountPercent }) {
  const payload = {
    client_uuid: crypto.randomUUID(),
    created_by: U[actor],
    branch_id: BRANCH,
    client_id: CLIENT,
    pickup_at: window[0],
    return_at: window[1],
    delivery_type: 'Client Pickup',
    lines: lines.map((line) => ({
      client_uuid: crypto.randomUUID(),
      line_type: 'Equipment',
      product_id: line.productId,
      description: line.description,
      qty: line.qty,
      days: line.days,
      rate: line.rate,
      ...(line.units === undefined
        ? {}
        : { units: line.units.map((assetId) => ({ client_uuid: crypto.randomUUID(), asset_id: assetId })) }),
    })),
  }
  if (discountPercent !== undefined) {
    payload.discounts = [
      {
        client_uuid: crypto.randomUUID(),
        audit_client_uuid: crypto.randomUUID(),
        client_id: CLIENT,
        discount_source: 'Manual',
        percent: discountPercent,
        reason: 'Repeat client, agreed on the phone',
      },
    ]
  }
  return { key, payload }
}

async function createBooking(spec) {
  const { key, payload } = createPayload(spec)
  const result = await one('select create_booking($1::jsonb)', [JSON.stringify(payload)])
  bookingIds[key] = result.booking_id
  return result
}

/** One stage transition, as `applyBookingTransition` writes it. */
async function transition(key, from, to, actor, extra = {}) {
  await q(
    `insert into booking_stage_transitions
       (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at, reason)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now(), $7)`,
    [bookingIds[key], BRANCH, from, to, U[actor], actor, extra.reason ?? null],
  )
}

async function liveHolds(key) {
  return Number(
    await one('select count(*) from inventory_reservations where booking_id = $1 and released_at is null', [
      bookingIds[key],
    ]),
  )
}

async function stageOf(key) {
  return one('select stage::text from bookings where id = $1', [bookingIds[key]])
}

/**
 * Action layer wrappers mirroring application actions in `src/actions/rentals/`.
 * These encapsulate operational multi-table transactions (sessions, movements,
 * sign-offs, deposits, gates, transitions) so tests drive the domain actions
 * instead of loose, ad-hoc SQL statements.
 */
async function actionPackRental({ key, actor, units }) {
  const bookingId = bookingIds[key]
  const currentStage = await stageOf(key)
  assert(currentStage === 'Booked', `actionPackRental: booking ${key} must be Booked, got ${currentStage}`)
  const packingSessionId = crypto.randomUUID()
  await q(
    `insert into operation_sessions (id, client_uuid, booking_id, operation, session_no, state, warehouse_staff_id, created_by)
     values ($1, gen_random_uuid(), $2, 'Packing', 1, 'In Progress', $3, $3)`,
    [packingSessionId, bookingId, U[actor]],
  )
  for (const unit of units) {
    await q(
      `insert into session_line_movements (client_uuid, session_id, booking_line_id, unit_id, serial, qty, moved_at, created_by)
       values (gen_random_uuid(), $1, (select id from booking_lines where booking_id = $2 limit 1), $3, $4, 1, now(), $5)`,
      [packingSessionId, bookingId, unit.id ?? unit, unit.serial ?? 'SN-A1', U[actor]],
    )
  }
  await transition(key, 'Booked', 'Packed', actor)
  await q(`update operation_sessions set state = 'Completed' where id = $1`, [packingSessionId])
  return { sessionId: packingSessionId }
}

async function actionHandoverRental({ key, actor, signerName = 'Lifecycle Client Signer', deliveryMethod = 'Client Pickup' }) {
  const bookingId = bookingIds[key]
  const currentStage = await stageOf(key)
  assert(currentStage === 'Packed', `actionHandoverRental: booking ${key} must be Packed, got ${currentStage}`)
  const handoverSessionId = crypto.randomUUID()
  await q(
    `insert into operation_sessions (id, client_uuid, booking_id, operation, session_no, state, delivery_method, warehouse_staff_id, created_by)
     values ($1, gen_random_uuid(), $2, 'Handover', 1, 'In Progress', $3, $4, $4)`,
    [handoverSessionId, bookingId, deliveryMethod, U[actor]],
  )
  await q(
    `insert into handover_lines (client_uuid, booking_line_id, state, qty_required, first_session_id, completed_session_id, created_by)
     values (gen_random_uuid(), (select id from booking_lines where booking_id = $1 limit 1), 'Picked Up', 1, $2, $2, $3)`,
    [bookingId, handoverSessionId, U[actor]],
  )
  await q(
    `insert into signatures (client_uuid, session_id, signature_role, signer_name, signed_at, device, is_required, created_by)
     values (gen_random_uuid(), $1, 'Receiver', $2, now(), 'iPad-1', true, $3)`,
    [handoverSessionId, signerName, U[actor]],
  )
  await transition(key, 'Packed', 'On Rent', actor)
  await q(`update operation_sessions set state = 'Completed' where id = $1`, [handoverSessionId])
  return { sessionId: handoverSessionId }
}

async function actionReturnRental({ key, actor, returnedUnits = [], missingUnits = [] }) {
  const bookingId = bookingIds[key]
  const currentStage = await stageOf(key)
  assert(currentStage === 'On Rent', `actionReturnRental: booking ${key} must be On Rent, got ${currentStage}`)
  for (const u of returnedUnits) {
    await q(
      `update booking_line_units
          set returned_at = now(), condition = 'Good'
        where asset_id = $1
          and booking_line_id in (select id from booking_lines where booking_id = $2)`,
      [u.id ?? u, bookingId],
    )
  }
  for (const m of missingUnits) {
    await q(
      `insert into booking_line_units
         (client_uuid, booking_line_id, asset_id, qty, unit_state, missing_reason, created_by)
       values
         (gen_random_uuid(), (select id from booking_lines where booking_id = $1 limit 1), $2, 1, 'Missing', $3, $4)`,
      [bookingId, m.id ?? m, m.reason ?? 'Lost on location during shoot', U[actor]],
    )
  }
  const returnSessionId = crypto.randomUUID()
  await q(
    `insert into operation_sessions (id, client_uuid, booking_id, operation, session_no, state, warehouse_staff_id, created_by)
     values ($1, gen_random_uuid(), $2, 'Return', 1, 'In Progress', $3, $3)`,
    [returnSessionId, bookingId, U[actor]],
  )
  await q(
    `insert into return_lines (client_uuid, booking_line_id, state, qty_expected, session_id, returned_at, created_by)
     values (gen_random_uuid(), (select id from booking_lines where booking_id = $1 limit 1), 'Returned', 1, $2, now(), $3)`,
    [bookingId, returnSessionId, U[actor]],
  )
  await transition(key, 'On Rent', 'Returned', actor)
  await q(`update operation_sessions set state = 'Completed' where id = $1`, [returnSessionId])
  return { sessionId: returnSessionId }
}

async function actionCompleteReset({ key, actor }) {
  const bookingId = bookingIds[key]
  const currentStage = await stageOf(key)
  assert(currentStage === 'Returned', `actionCompleteReset: booking ${key} must be Returned, got ${currentStage}`)
  await q(
    `insert into cleaning_queue_entries (client_uuid, booking_id, unit_id, status, created_by)
     values (gen_random_uuid(), $1, $2, 'Inspected', $3)
     on conflict do nothing`,
    [bookingId, UNITS[0], U[actor]],
  )
}

async function actionCloseRental({ key, actor }) {
  await transition(key, 'Returned', 'Closed', actor)
}

/* ── The thirteen steps ───────────────────────────────────────────────────── */

let invoiceId = null

/* Editor RPC helpers (0146/0147). Each call runs as a signed-in role so the
   function's own role ceiling, revision lock and receipt table are what answer. */
/** s() plus the JWT subject uth.uid() reads - the editor RPCs identify the actor with it. */
const asJwt = (role, fn) =>
  as(role, async () => {
    await q(`select set_config('request.jwt.claim.sub', $1, false)`, [U[role]])
    try {
      return await fn()
    } finally {
      await q(`select set_config('request.jwt.claim.sub', '', false)`)
    }
  })
const rpcAs = (role, text, params) =>
  asJwt(role, async () => {
    const r = await q(text, params)
    return Object.values(r.rows[0] ?? {})[0] ?? null
  })
const editorRead = (role, kind, id) => rpcAs(role, 'select read_record_editor($1, $2)', [kind, id])
const editorSave = (role, kind, id, rev, key, values, rows) =>
  rpcAs(role, 'select save_record_editor($1, $2::uuid, $3, $4::uuid, $5::jsonb, $6::jsonb)', [
    kind, id, rev, key, JSON.stringify(values), JSON.stringify(rows),
  ])
const refusesAs = (role, what, text, params, matcher) => asJwt(role, () => refuses(what, text, params, matcher))
const refusesSave = (role, what, kind, id, rev, key, values, rows, matcher) =>
  refusesAs(
    role,
    what,
    'select save_record_editor($1, $2::uuid, $3, $4::uuid, $5::jsonb, $6::jsonb)',
    [kind, id, rev, key, JSON.stringify(values), JSON.stringify(rows)],
    matcher,
  )
const QUOTE_VALUE_KEYS = ['client_id', 'project', 'project_type', 'project_type_other', 'pickup_at', 'return_at', 'delivery_type', 'pickup_location', 'return_location', 'deposit_required']
const quotePayload = (snap, change = (p) => p) => {
  const values = Object.fromEntries(QUOTE_VALUE_KEYS.filter((k) => k in snap.values).map((k) => [k, snap.values[k]]))
  return change({ values, lines: snap.lines, crew: snap.crew, transport: snap.transport ?? {}, discount_percent: snap.discounts.reduce((s, d) => s + Number(d.percent), 0) })
}
const quoteSave = (role, id, rev, key, payload) =>
  rpcAs(role, 'select update_rental_quote($1::uuid, $2, $3::uuid, $4::jsonb)', [id, rev, key, JSON.stringify(payload)])
const refusesQuote = (role, what, id, rev, key, payload, matcher) =>
  refusesAs(role, what, 'select update_rental_quote($1::uuid, $2, $3::uuid, $4::jsonb)', [id, rev, key, JSON.stringify(payload)], matcher)

const STEPS = [
  {
    id: 'L1',
    title: 'Coordinator creates a booking: 1 unit, 2 days, 10% discount',
    expect: 'green',
    async run() {
      await as('Coordinator', async () => {
        const created = await createBooking({
          key: 'a',
          window: W.a,
          actor: 'Coordinator',
          discountPercent: 10,
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Lifecycle Serialised Camera',
              qty: 1,
              days: 2,
              rate: 3500,
              units: [UNITS[0]],
            },
          ],
        })
        assertEq(created.stage, 'Quote', 'a new booking starts at Quote')
        assertEq(created.line_count, 1, 'the line was written')
        assertEq(created.unit_count, 1, 'the serial was assigned at creation (D5)')
      })

      await asOwnerOfTheDatabase(async () => {
        assertEq(
          await one('select count(*) from booking_discounts where booking_id = $1', [bookingIds.a]),
          1,
          'the discount row exists — this is the assertion 0099 fixed',
        )
        assertEq(
          await one(
            `select event_class::text from audit_events
              where table_name = 'booking_discounts' and record_id = $1`,
            [bookingIds.a],
          ),
          'discount',
          "the discount's audit row is class 'discount'",
        )
      })
    },
  },

  {
    id: 'L2',
    title: 'Quote → Booked writes exactly one reservation (R-26)',
    expect: 'green',
    async run() {
      await as('Coordinator', async () => {
        await transition('a', 'Quote', 'Booked', 'Coordinator')
      })
      assertEq(await stageOf('a'), 'Booked', 'the booking moved')
      assertEq(await liveHolds('a'), 1, 'the Booked transition placed one hold')
      assertEq(
        await one(
          'select asset_id from inventory_reservations where booking_id = $1 and released_at is null',
          [bookingIds.a],
        ),
        UNITS[0],
        'the hold names the unit the booking was given at creation',
      )
    },
  },

  {
    id: 'L3',
    title: 'A conflicting booking — same unit, overlapping dates — is REFUSED',
    expect: 'green',
    async run() {
      const before = Number(await one('select count(*) from inventory_reservations'))

      await as('Coordinator', async () => {
        await createBooking({
          key: 'b',
          window: W.b,
          actor: 'Coordinator',
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Lifecycle Serialised Camera',
              qty: 1,
              days: 2,
              rate: 3500,
              units: [UNITS[0]],
            },
          ],
        })

        await refuses(
          'the second booking taking a unit already held over an overlapping window',
          `insert into booking_stage_transitions
             (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
           values (gen_random_uuid(), $1, $2, 'Quote', 'Booked', $3, 'Coordinator', now())`,
          [bookingIds.b, BRANCH, U.Coordinator],
          /no_double_booking|exclusion/i,
        )
      })

      assertEq(await stageOf('b'), 'Quote', 'the refused booking stayed a Quote')
      assertEq(await liveHolds('b'), 0, 'and holds nothing')
      assertEq(
        Number(await one('select count(*) from inventory_reservations')),
        before,
        'the reservation count is unchanged — the whole transaction rolled back',
      )
    },
  },

  {
    id: 'L4',
    title: 'A same-day turnaround is ACCEPTED (half-open bounds)',
    expect: 'green',
    async run() {
      await as('Coordinator', async () => {
        await createBooking({
          key: 'c',
          window: W.c,
          actor: 'Coordinator',
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Lifecycle Serialised Camera',
              qty: 1,
              days: 2,
              rate: 3500,
              units: [UNITS[0]],
            },
          ],
        })
        await transition('c', 'Quote', 'Booked', 'Coordinator')
      })
      assertEq(await stageOf('c'), 'Booked', 'a booking starting when the last one ends is accepted')
      assertEq(await liveHolds('c'), 1, 'and holds the same unit for its own window')
    },
  },

  {
    id: 'L5',
    title: 'A quantity line beyond stock on hand is REFUSED by the capacity ceiling (0045)',
    expect: 'green',
    async run() {
      await as('Coordinator', async () => {
        /* The whole shelf: 3 of 3. Accepted. */
        await createBooking({
          key: 'qty-ok',
          window: W.d,
          actor: 'Coordinator',
          lines: [{ productId: QTY_PRODUCT, description: 'Lifecycle Bulk Cable', qty: 3, days: 2, rate: 250 }],
        })
        await transition('qty-ok', 'Quote', 'Booked', 'Coordinator')

        /* One more than exists, same window. Refused. */
        await createBooking({
          key: 'qty-over',
          window: W.d,
          actor: 'Coordinator',
          lines: [{ productId: QTY_PRODUCT, description: 'Lifecycle Bulk Cable', qty: 1, days: 2, rate: 250 }],
        })
        await refuses(
          'a quantity hold beyond stock on hand',
          `insert into booking_stage_transitions
             (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
           values (gen_random_uuid(), $1, $2, 'Quote', 'Booked', $3, 'Coordinator', now())`,
          [bookingIds['qty-over'], BRANCH, U.Coordinator],
          /Reservation rejected.*stock on hand/i,
        )
      })

      assertEq(await liveHolds('qty-ok'), 1, 'the whole shelf is one product-level hold, not three')
      assertEq(
        await one(
          'select qty from inventory_reservations where booking_id = $1 and released_at is null',
          [bookingIds['qty-ok']],
        ),
        3,
        'carrying the line qty',
      )
      assertEq(await stageOf('qty-over'), 'Quote', 'the over-capacity booking stayed a Quote')
    },
  },

  {
    id: 'L6',
    title: 'Booked → Packed → On Rent as Warehouse requires the session rows each stage needs',
    expect: 'green',
    async run() {
      await as('Warehouse', async () => {
        // 1. Moving to Packed without a Packing session is refused
        await refuses(
          'moving to Packed with no Packing session',
          `insert into booking_stage_transitions
             (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
           values (gen_random_uuid(), $1, $2, 'Booked', 'Packed', $3, 'Warehouse', now())`,
          [bookingIds.a, BRANCH, U.Warehouse],
          /gate\.pack\.session_missing/,
        )

        // 2. Complete Pack through action
        await actionPackRental({
          key: 'a',
          actor: 'Warehouse',
          units: [{ id: UNITS[0], serial: 'SN-A1' }],
        })
        assertEq(await stageOf('a'), 'Packed', 'the booking moved to Packed once Packing session and movements exist')

        // Cancellation guard checks at Packed
        await undone(async () => {
          await refuses(
            'cancel at Packed by Warehouse is refused',
            `update bookings set cancelled_at = now(), cancellation_reason = 'Cancelled by warehouse staff without manager authorization' where id = $1`,
            [bookingIds.a],
            /gate\.cancel\.stage_too_late/,
          )
        })

        // 3. Moving to On Rent without a Handover session is refused
        await refuses(
          'moving to On Rent with no Handover session',
          `insert into booking_stage_transitions
             (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
           values (gen_random_uuid(), $1, $2, 'Packed', 'On Rent', $3, 'Warehouse', now())`,
          [bookingIds.a, BRANCH, U.Warehouse],
          /gate\.handover\.session_missing/,
        )

        // 4. Complete Handover through action
        await actionHandoverRental({
          key: 'a',
          actor: 'Warehouse',
          signerName: 'Lifecycle Client Signer',
        })
      })

      assertEq(await stageOf('a'), 'On Rent', 'the walk to On Rent completed')

      const sessions = Number(
        await one('select count(*) from operation_sessions where booking_id = $1', [bookingIds.a]),
      )
      assertEq(sessions, 2, 'both Packing and Handover sessions exist for the booking')
    },
  },

  {
    id: 'L7',
    title: 'A partial return: one unit back, one missing',
    expect: 'green',
    async run() {
      await as('Warehouse', async () => {
        // Refuse moving to Returned with no Return session
        await refuses(
          'moving to Returned with no Return session',
          `insert into booking_stage_transitions
             (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
           values (gen_random_uuid(), $1, $2, 'On Rent', 'Returned', $3, 'Warehouse', now())`,
          [bookingIds.a, BRANCH, U.Warehouse],
          /gate\.return\.session_missing/,
        )

        // Complete partial return through action: 1 unit back, 1 missing
        await actionReturnRental({
          key: 'a',
          actor: 'Warehouse',
          returnedUnits: [UNITS[0]],
          missingUnits: [{ id: UNITS[1], reason: 'Lost on location during shoot' }],
        })
      })

      assertEq(await stageOf('a'), 'Returned', 'the booking returned')

      const stillHeld = await liveHolds('a')
      assertEq(stillHeld, 0, 'every hold on a returned booking is released (R-26)')

      const cases = Number(
        await one("select count(*) from cases where linked_booking_id = $1 and type = 'Missing'", [bookingIds.a]),
      )
      assert(cases > 0, 'no Missing case was opened for the unit that did not come back')
    },
  },

  {
    id: 'L8',
    title: 'Accounts raises and issues the invoice: figures snapshot and become immutable (R-15, Law 4)',
    expect: 'green',
    async run() {
      await as('Accounts', async () => {
        const result = await one('select create_invoice($1::jsonb)', [
          JSON.stringify({
            client_uuid: crypto.randomUUID(),
            created_by: U.Accounts,
            booking_id: bookingIds.a,
            vat_rate: 0.13,
          }),
        ])
        invoiceId = result.invoice_id
        assert(invoiceId !== undefined && invoiceId !== null, 'create_invoice returned no invoice id')
      })

      await asOwnerOfTheDatabase(async () => {
        const row = (
          await q(
            'select subtotal, discount_amount, taxable_amount, vat_amount, total_amount, status::text from invoices where id = $1',
            [invoiceId],
          )
        ).rows[0]

        /* Recomputed here from rate x qty x days, never read back and compared
           with itself — R-27. 1 x 2 x 3500 = 7000; 10% of that is 700; 13% of
           6300 is 819; the total is 7119. */
        const subtotal = 1 * 2 * 3500
        const discount = Math.round(subtotal * 0.1)
        const taxable = subtotal - discount
        const vat = Math.round(taxable * 0.13)

        assertEq(Number(row.subtotal), subtotal, 'invoice subtotal')
        assertEq(Number(row.discount_amount), discount, 'invoice discount')
        assertEq(Number(row.taxable_amount), taxable, 'invoice taxable amount')
        assertEq(Number(row.vat_amount), vat, 'invoice VAT')
        assertEq(Number(row.total_amount), taxable + vat, 'invoice total')
        assertEq(row.status, 'Draft', 'a new invoice is a Draft')
      })

      /* Issue the invoice: mints invoice_no (R-15), sets issue_date, and advances status to Sent */
      await as('Accounts', async () => {
        const issued = await one('select issue_invoice($1::jsonb)', [
          JSON.stringify({
            invoice_id: invoiceId,
            issued_by: U.Accounts,
          }),
        ])
        assert(issued.invoice_no !== null && typeof issued.invoice_no === 'string', 'issued invoice has no number')
        assert(issued.invoice_no.startsWith('INV-'), `issued invoice number is unexpected: ${issued.invoice_no}`)
        assertEq(issued.status, 'Sent', 'newly issued invoice without payments has status Sent')
      })

      /* Law 4 / reject_invoice_edit_after_issue: once issued, figures are immutable */
      await as('Accounts', async () => {
        let editFailed = false
        try {
          await q('update invoices set subtotal = 9999 where id = $1', [invoiceId])
        } catch (err) {
          editFailed = true
          assert(
            String(err).includes('figures are immutable'),
            `expected immutability rejection, got: ${String(err)}`,
          )
        }
        assert(editFailed, 'direct update to issued invoice subtotal was unexpectedly accepted')
      })
    },
  },

  {
    id: 'L9',
    title: 'Four payments that must all be refused',
    expect: 'green',
    async run() {
      const insert = `insert into payments
          (client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id, amount, payment_type, payment_date, received_by)
        values (gen_random_uuid(), next_document_number('payment'), $1, $2, $3, $4, $5, 'Advance Payment', now(), $6)`

      /* Every probe here is UNDONE — see `undone`. One of these four IS accepted
         today, and left in place it would silently change L10's arithmetic and
         L13's row count. */
      const accepted = await undone(async () => {
        const outstanding = Number(await one('select outstanding_amount from invoices where id = $1', [invoiceId]))
        const taken = []

        const attempts = [
          ['larger than the outstanding amount', 'Accounts', [bookingIds.a, invoiceId, CLIENT, BRANCH, outstanding + 1000, U.Accounts]],
          ['of zero', 'Accounts', [bookingIds.a, invoiceId, CLIENT, BRANCH, 0, U.Accounts]],
          ["naming another client's booking", 'Accounts', [bookingIds.a, invoiceId, OTHER_CLIENT, BRANCH, 100, U.Accounts]],
          ['taken by Warehouse — Law 6', 'Warehouse', [bookingIds.a, invoiceId, CLIENT, BRANCH, 100, U.Warehouse]],
        ]

        /* One SAVEPOINT per attempt. A refused statement aborts the whole
           transaction — every later attempt then fails with "current transaction
           is aborted", which reads exactly like a refusal and is not one. The
           savepoint is what keeps four independent probes independent. */
        for (const [n, [what, role, params]] of attempts.entries()) {
          const sp = `l9_${String(n)}`
          await db.exec(`savepoint ${sp};`)
          await as(role, async () => {
            try {
              const result = await q(insert, params)
              if ((result.affectedRows ?? 0) > 0) taken.push(what)
            } catch {
              /* refused, which is what this step wants */
            }
            /* Inside the role block, BEFORE it resets the role: the rollback is
               what clears an aborted transaction, and the reset needs a live one. */
            await db.exec(`rollback to savepoint ${sp};`)
          })
        }
        return taken
      })

      assert(
        accepted.length === 0,
        `the database ACCEPTED ${String(accepted.length)} payment(s) it must refuse: ${accepted.join('; ')}`,
      )
    },
  },

  {
    id: 'L10',
    title: 'Two payments settle the invoice: 3,000 then 4,119',
    expect: 'green',
    async run() {
      await as('Accounts', async () => {
        for (const amount of [3000, 4119]) {
          await q(
            `insert into payments
               (client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id, amount, payment_type, payment_date, received_by)
             values (gen_random_uuid(), next_document_number('payment'), $1, $2, $3, $4, $5, 'Advance Payment', now(), $6)`,
            [bookingIds.a, invoiceId, CLIENT, BRANCH, amount, U.Accounts],
          )
        }
      })

      await asOwnerOfTheDatabase(async () => {
        const row = (
          await q('select paid_amount, outstanding_amount, status::text from invoices where id = $1', [invoiceId])
        ).rows[0]
        assertEq(Number(row.paid_amount), 7119, 'paid_amount')
        assertEq(Number(row.outstanding_amount), 0, 'outstanding_amount')
        assertEq(row.status, 'Paid', 'invoice status is Paid')
      })
    },
  },

  {
    id: 'L11',
    title: 'Closed needs a settled invoice',
    expect: 'green',
    async run() {
      /* Refused while open cases exist (Gate 3e) */
      let closeWithOpenCaseRefused = false
      try {
        await as('Coordinator', async () => {
          await transition('a', 'Returned', 'Closed', 'Coordinator')
        })
      } catch (err) {
        closeWithOpenCaseRefused = true
        assert(
          String(err).includes('open cases'),
          `expected open cases gate rejection, got: ${String(err)}`,
        )
      }
      assert(closeWithOpenCaseRefused, 'booking closed while open cases were still pending')

      /* Manager resolves the missing item case so the booking can lawfully close */
      await as('Manager', async () => {
        await q(
          `update cases set status = 'Resolved', settled_at = now() where linked_booking_id = $1 and type = 'Missing'`,
          [bookingIds.a],
        )
      })

      /* The ACCEPTED half, on the booking this script has settled. */
      await as('Coordinator', async () => {
        await transition('a', 'Returned', 'Closed', 'Coordinator')
      })
      assertEq(await stageOf('a'), 'Closed', 'a settled booking closes')
      assert(
        (await one('select closed_at from bookings where id = $1', [bookingIds.a])) !== null,
        'closed_at was set by the transition',
      )

      /* The REFUSED half, on booking `c` — Booked, and never invoiced. Undone,
         because walking a second booking to Closed for the sake of an assertion
         would leave a closed booking in the corpus and Closed is final. */
      const closedWithNoInvoice = await undone(async () => {
        await as('Warehouse', async () => {
          await actionPackRental({ key: 'c', actor: 'Warehouse', units: [{ id: UNITS[0], serial: 'SN-C1' }] })
          await actionHandoverRental({ key: 'c', actor: 'Warehouse', signerName: 'Lifecycle Client Signer' })
          await actionReturnRental({ key: 'c', actor: 'Warehouse', returnedUnits: [{ id: UNITS[0] }] })
        })
        await as('Coordinator', async () => {
          try {
            await transition('c', 'Returned', 'Closed', 'Coordinator')
          } catch {
            return
          }
        })
        return (await stageOf('c')) === 'Closed'
      })

      assert(
        closedWithNoInvoice !== true,
        'a booking with NO invoice and nothing paid walked all the way to Closed. The close gate never asked whether it had been billed.',
      )
    },
  },

  {
    id: 'L12',
    title: 'Money-blind roles read no money and write none',
    expect: 'green',
    async run() {
      /* ⚠ The trap this step was written wrong into once, kept as a comment
         because it is the single easiest way to fabricate a passing Law 6 test.
         An UPDATE whose WHERE clause matches no VISIBLE row is not refused — it
         succeeds, affecting zero rows. So `refuses(...)` reports "the database
         ACCEPTED it", and a naive reading calls that a Law 6 hole when it is in
         fact RLS working exactly as designed.

         The honest assertion is about the OUTCOME, not the error: the write
         touched nothing, and the figure is unchanged when read by someone who
         can see it. Both are checked, and the read-back is done as the database
         owner so a masked read cannot pass by returning nothing. */
      const before = Number(
        await asOwnerOfTheDatabase(() => one('select total_amount from invoices where id = $1', [invoiceId])),
      )

      for (const role of ['Warehouse', 'Technician', 'Driver', 'Client']) {
        await as(role, async () => {
          for (const table of ['invoices', 'payments', 'security_deposits']) {
            const n = Number(await one(`select count(*) from ${table}`))
            assertEq(n, 0, `${role} can see ${String(n)} row(s) of ${table}; Law 6 says none`)
          }

          let touched = 0
          try {
            const result = await q('update invoices set total_amount = total_amount + 1 where id = $1', [invoiceId])
            touched = result.affectedRows ?? 0
          } catch {
            touched = 0 /* refused outright, which is the stronger outcome */
          }
          assertEq(touched, 0, `${role} changed ${String(touched)} invoice row(s); Law 6 says none`)
        })
      }

      const after = Number(
        await asOwnerOfTheDatabase(() => one('select total_amount from invoices where id = $1', [invoiceId])),
      )
      assertEq(after, before, 'the invoice total after four money-blind roles tried to raise it')
    },
  },

  {
    id: 'L13',
    title: 'Even the Owner cannot rewrite the audit log or delete a payment',
    expect: 'green',
    async run() {
      await as('Owner', async () => {
        await refuses(
          'an Owner updating an audit row',
          "update audit_events set reason = 'rewritten' where id = (select id from audit_events limit 1)",
          [],
          /./,
        )
        await refuses(
          'an Owner deleting a payment',
          'delete from payments where invoice_id = $1',
          [invoiceId],
          /./,
        )
      })
      assertEq(
        Number(await one('select count(*) from payments where invoice_id = $1', [invoiceId])),
        2,
        'both payments are still there',
      )
    },
  },

  {
    id: 'L14',
    title: 'Client portal user sees only their own rows, never another client\'s',
    expect: 'green',
    async run() {
      await as('Client', async () => {
        // 1. clients table: sees own client row, cannot see OTHER_CLIENT
        const myClients = await q('select id, name from clients')
        assertEq(myClients.rows.length, 1, 'Client sees exactly their own client row')
        assertEq(myClients.rows[0].id, CLIENT, 'The one visible client is their own')

        const otherClientVisible = Number(
          await one('select count(*) from clients where id = $1', [OTHER_CLIENT]),
        )
        assertEq(otherClientVisible, 0, 'Client cannot see another client\'s row')

        // 2. bookings table: sees own bookings (a, b, c), cannot see OTHER_CLIENT's bookings
        const myBookings = await q('select id, client_id from bookings')
        assert(myBookings.rows.length > 0, 'Client sees their own bookings')
        for (const b of myBookings.rows) {
          assertEq(b.client_id, CLIENT, 'Visible booking belongs to own client')
        }

        const otherBookingVisible = Number(
          await one('select count(*) from bookings where client_id = $1', [OTHER_CLIENT]),
        )
        assertEq(otherBookingVisible, 0, 'Client cannot see another client\'s bookings')

        // 3. booking_lines table: sees lines for own bookings only
        const myLines = await q('select id, booking_id from booking_lines')
        assert(myLines.rows.length > 0, 'Client sees booking lines for own bookings')

        // 4. Staff directory view exists and is blocked to Client (0148: P9)
        const staff = await q('select count(*) from staff_directory_v')
        assertEq(Number(staff.rows[0].count), 0, 'Client cannot read internal staff directory (0148 / P9)')
      })

      // Verify that staff can read the staff directory
      await as('Coordinator', async () => {
        const staff = await q('select count(*) from staff_directory_v')
        assert(Number(staff.rows[0].count) > 0, 'Staff directory view exists and lists staff for staff roles')
      })
    },
  },

  {
    id: 'L15',
    title: 'Unit status is owned by the engine; direct write is refused (S1-5)',
    expect: 'green',
    async run() {
      // 1. Direct update to status as Owner is refused by gate.unit_status.direct_write
      await asOwnerOfTheDatabase(async () => {
        await refuses(
          'direct update to product_units.status',
          "update product_units set status = 'On Rent' where id = $1",
          [UNITS[0]],
          /gate\.unit_status\.direct_write/,
        )
      })

      // 2. Status recomputed: active maintenance record sets status to 'Maintenance'
      const maintId = crypto.randomUUID()
      await asOwnerOfTheDatabase(async () => {
        await q(
          `insert into maintenance_records (id, client_uuid, record_no, product_unit_id, maintenance_type, description, scheduled_date, created_by)
           values ($1, gen_random_uuid(), 'MR-L15-01', $2, 'Cleaning', 'Routine scheduled cleaning', now(), $3)`,
          [maintId, UNITS[0], U.Owner],
        )
      })
      const unit0StatusMaint = await one('select status::text from product_units where id = $1', [UNITS[0]])
      assertEq(unit0StatusMaint, 'Maintenance', 'Unit with active maintenance record has status Maintenance')

      // 3. Complete the maintenance record -> status recomputes back to 'In Stock'
      await asOwnerOfTheDatabase(async () => {
        await q(
          `update maintenance_records set status = 'Completed', completed_at = now() where id = $1`,
          [maintId],
        )
      })
      const unit0StatusStock = await one('select status::text from product_units where id = $1', [UNITS[0]])
      assertEq(unit0StatusStock, 'In Stock', 'Unit with completed maintenance recomputes to In Stock')
    },
  },

  {
    id: 'L16',
    title: 'Invoice void discipline: role check, reason, credit note requirement (S1-3)',
    expect: 'green',
    async run() {
      // In L10, invoiceId is Paid (paid_amount: 7119).
      // 1. Coordinator cannot void (gate.invoice.void_role)
      await asOwnerOfTheDatabase(async () => {
        await db.exec(`select set_config('app.current_user_id', '${U.Coordinator}', false);`)
        try {
          await refuses(
            'void by Coordinator',
            "update invoices set status = 'Void', void_reason = 'Cancelled by client agreement' where id = $1",
            [invoiceId],
            /gate\.invoice\.void_role/,
          )
        } finally {
          await db.exec("select set_config('app.current_user_id', '', false);")
        }
      })

      // 2. Void without reason (or reason < 10 chars) by Accounts is refused (gate.invoice.void_reason)
      await as('Accounts', async () => {
        await refuses(
          'void without reason',
          "update invoices set status = 'Void' where id = $1",
          [invoiceId],
          /gate\.invoice\.void_reason/,
        )
        await refuses(
          'void with short reason',
          "update invoices set status = 'Void', void_reason = 'mistake' where id = $1",
          [invoiceId],
          /gate\.invoice\.void_reason/,
        )
      })

      // 3. Void of a paid invoice without a credit note is refused (gate.invoice.void_paid)
      await as('Accounts', async () => {
        await refuses(
          'void of paid invoice without credit note',
          "update invoices set status = 'Void', void_reason = 'Customer requested full refund' where id = $1",
          [invoiceId],
          /gate\.invoice\.void_paid/,
        )
      })

      // 4. Issue a credit note for this invoice, then void succeeds
      await as('Accounts', async () => {
        await q(
          `insert into credit_notes (client_uuid, credit_note_no, invoice_id, amount, reason, created_by)
           values (gen_random_uuid(), next_document_number('credit_note'), $1, 7119, 'Full refund credit note issued', $2)`,
          [invoiceId, U.Accounts],
        )

        await q(
          `update invoices
              set status = 'Void',
                  void_reason = 'Cancelled and refunded with credit note'
            where id = $1`,
          [invoiceId],
        )
      })

      const voidRow = (await q('select status::text, voided_by, voided_at from invoices where id = $1', [invoiceId])).rows[0]
      assertEq(voidRow.status, 'Void', 'invoice status is Void')
      assert(voidRow.voided_by !== null, 'voided_by was stamped by trigger')
      assert(voidRow.voided_at !== null, 'voided_at was stamped by trigger')

      // 5. Unvoiding or modifying voided invoice is refused (gate.invoice.void_immutable)
      await as('Accounts', async () => {
        await refuses(
          'unvoiding voided invoice',
          "update invoices set status = 'Draft' where id = $1",
          [invoiceId],
          /gate\.invoice\.void_immutable/,
        )
      })
    },
  },

  {
    id: 'L17',
    title: 'Server-side prices for money-blind callers, line guard, role ceiling & user immutability (S1-6, S1-7)',
    expect: 'green',
    async run() {
      // 1. Warehouse create_booking with rate: 1 on a Rs 3,500 model sets line rate 3500, rate_overridden = false, audit row present
      let whBookingId
      await as('Warehouse', async () => {
        const res = await createBooking({
          key: 'wh-booking',
          window: W.d,
          actor: 'Warehouse',
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Warehouse created booking',
              qty: 1,
              days: 1,
              rate: 1,
            },
          ],
        })
        whBookingId = res.booking_id
      })

      const lineRow = (
        await q(
          'select rate, rate_overridden from booking_lines where booking_id = $1',
          [whBookingId],
        )
      ).rows[0]
      assertEq(Number(lineRow.rate), 3500, 'line rate was set to server product daily_rate 3500')
      assertEq(lineRow.rate_overridden, false, 'rate_overridden is false')

      const auditCount = Number(
        await one(
          "select count(*) from audit_events where record_id = $1 and action = 'price.server_applied'",
          [whBookingId],
        ),
      )
      assert(auditCount > 0, 'audit_events row for price.server_applied was written')

      // 2. Coordinator create_booking with rate: 3000 sets rate 3000, rate_overridden = true
      let coordBookingId
      await as('Coordinator', async () => {
        const res = await createBooking({
          key: 'coord-booking',
          window: W.d,
          actor: 'Coordinator',
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Coordinator created override booking',
              qty: 1,
              days: 1,
              rate: 3000,
            },
          ],
        })
        coordBookingId = res.booking_id
      })

      const coordLineRow = (
        await q(
          'select rate, rate_overridden from booking_lines where booking_id = $1',
          [coordBookingId],
        )
      ).rows[0]
      assertEq(Number(coordLineRow.rate), 3000, 'Coordinator line rate is 3000')
      assertEq(coordLineRow.rate_overridden, true, 'rate_overridden is true')

      // 3. Warehouse direct insert into booking_lines with rate is refused (gate.booking_lines.money_blind_insert)
      await as('Warehouse', async () => {
        await refuses(
          'direct insert into booking_lines by Warehouse',
          `insert into booking_lines
             (client_uuid, booking_id, line_type, product_id, qty, days, rate, created_by)
           values (gen_random_uuid(), $1, 'Equipment', $2, 1, 1, 3500, $3)`,
          [whBookingId, SERIAL_PRODUCT, U.Warehouse],
          /gate\.booking_lines\.money_blind_insert/,
        )
      })

      // 4. Money-blind caller attempting discounts in create_booking is refused (gate.discount.money_blind)
      await as('Warehouse', async () => {
        await refuses(
          'create_booking with discounts by money-blind caller',
          'select create_booking($1::jsonb)',
          [
            JSON.stringify({
              client_uuid: crypto.randomUUID(),
              created_by: U.Warehouse,
              branch_id: BRANCH,
              client_id: CLIENT,
              pickup_at: W.d[0],
              return_at: W.d[1],
              delivery_type: 'Client Pickup',
              lines: [
                {
                  client_uuid: crypto.randomUUID(),
                  product_id: SERIAL_PRODUCT,
                  qty: 1,
                  days: 1,
                },
              ],
              discounts: [
                {
                  client_uuid: crypto.randomUUID(),
                  discount_source: 'Commercial Negotiation',
                  percent: 10,
                  reason: 'Test discount',
                },
              ],
            }),
          ],
          /gate\.discount\.money_blind/,
        )
      })

      // 5. Admin assigning Owner or Admin role is refused by role ceiling (gate.users.role_ceiling)
      await as('Admin', async () => {
        await refuses(
          'Admin setting role to Admin',
          "update users set primary_role = 'Admin' where id = $1",
          [U.Coordinator],
          /gate\.users\.role_ceiling/,
        )
      })

      // 6. Deleting from users is refused (gate.users.immutable)
      await asOwnerOfTheDatabase(async () => {
        await refuses(
          'Owner deleting from users',
          'delete from users where id = $1',
          [U.Coordinator],
          /gate\.users\.immutable/,
        )
      })
    },
  },

  {
    id: 'L18',
    title: 'Booking schedule changes cannot desynchronise reservations',
    expect: 'green',
    async run() {
      const firstWindow = ['2100-01-01T04:00:00Z', '2100-01-03T04:00:00Z']
      const secondWindow = ['2100-01-03T04:00:00Z', '2100-01-05T04:00:00Z']

      await as('Coordinator', async () => {
        for (const [key, window] of [
          ['schedule-a', firstWindow],
          ['schedule-b', secondWindow],
        ]) {
          await createBooking({
            key,
            window,
            actor: 'Coordinator',
            lines: [
              {
                productId: SERIAL_PRODUCT,
                description: 'Schedule ownership camera',
                qty: 1,
                days: 2,
                rate: 3500,
                units: [UNITS[1]],
              },
            ],
          })
          await transition(key, 'Quote', 'Booked', 'Coordinator')
        }

        await refuses(
          'a direct booking date update whose synchronized reservation would overlap the next booking',
          'update bookings set return_at = $2 where id = $1',
          [bookingIds['schedule-a'], '2100-01-04T04:00:00Z'],
          /no_double_booking|exclusion/i,
        )
      })

      assertEq(
        await one('select return_at = $2::timestamptz from bookings where id = $1', [
          bookingIds['schedule-a'],
          firstWindow[1],
        ]),
        true,
        'the refused direct write left the booking schedule unchanged',
      )
      assertEq(
        await one(
          'select upper(period) = $2::timestamptz from inventory_reservations where booking_id = $1 and released_at is null',
          [bookingIds['schedule-a'], firstWindow[1]],
        ),
        true,
        'the reservation still ends with the booking',
      )

      await as('Coordinator', async () => {
        await q('update bookings set pickup_at = $2 where id = $1', [
          bookingIds['schedule-a'],
          '2099-12-31T04:00:00Z',
        ])
      })
      assertEq(
        await one(
          'select lower(period) = $2::timestamptz from inventory_reservations where booking_id = $1 and released_at is null',
          [bookingIds['schedule-a'], '2099-12-31T04:00:00Z'],
        ),
        true,
        'a safe direct schedule change moved the reservation in the same transaction',
      )

      await as('Coordinator', async () => {
        await refuses(
          'the official extension path when its new period overlaps the next booking',
          'select extend_booking($1::uuid, 1, $2, $3::uuid)',
          [bookingIds['schedule-a'], 'Client requested one more rental day', U.Coordinator],
          /no_double_booking|exclusion/i,
        )
      })

      assertEq(
        await one('select return_at = $2::timestamptz from bookings where id = $1', [
          bookingIds['schedule-a'],
          firstWindow[1],
        ]),
        true,
        'the refused extension rolled the booking date back',
      )
    },
  },

  {
    id: 'L19',
    title: 'A payment reversal cannot exceed the receipt across partial corrections',
    expect: 'green',
    async run() {
      /* Keep the probe reversible: this proves the ledger guard without changing
         the settled lifecycle record L10/L11 established above. */
      await undone(async () => {
        await as('Manager', async () => {
          const paymentId = await one(
            `select id from payments where booking_id = $1 and amount = 3000 order by created_at limit 1`,
            [bookingIds.a],
          )
          assert(paymentId !== null, 'L19 needs L10\'s Rs 3,000 receipt.')

          await q(
            `insert into payment_reversals
               (client_uuid, reversal_no, original_payment_id, amount, reason, reversed_by, approved_by)
             values (gen_random_uuid(), 'REV-L19-0001', $1, 2500, 'Lifecycle partial correction', $2, $2)`,
            [paymentId, U.Manager],
          )

          await refuses(
            'a second partial reversal beyond the remaining Rs 500',
            `insert into payment_reversals
               (client_uuid, reversal_no, original_payment_id, amount, reason, reversed_by, approved_by)
             values (gen_random_uuid(), 'REV-L19-0002', $1, 501, 'Lifecycle excess correction', $2, $2)`,
            [paymentId, U.Manager],
            /remaining reversible amount|exceeds/i,
          )
        })
      })
    },
  },
  {
    id: 'L20',
    title: 'Bulk stock adjustment is atomic, idempotent, reasoned, and Manager-only',
    expect: 'green',
    async run() {
      await undone(async () => {
        const refusesInProbe = async (what, sql, params, matcher) => {
          await db.exec('savepoint stock_probe;')
          try {
            await refuses(what, sql, params, matcher)
          } finally {
            await db.exec('rollback to savepoint stock_probe; release savepoint stock_probe;')
          }
        }
        const key = '00000000-0000-4000-8000-00000000a140'
        await as('Manager', async () => {
          await q("select set_config('request.jwt.claim.sub', $1, true)", [U.Manager])
          const before = await one('select total_quantity from products where id = $1', [QTY_PRODUCT])
          const first = await q(
            'select * from adjust_stock($1, 2, $2, $3, $4)',
            [QTY_PRODUCT, 'Found two extra units during count', U.Manager, key],
          )
          assertEq(first.rows[0].quantity_before, before, 'adjustment records prior quantity')
          assertEq(first.rows[0].quantity_after, before + 2, 'adjustment records new quantity')
          await q('select * from adjust_stock($1, 2, $2, $3, $4)',
            [QTY_PRODUCT, 'Found two extra units during count', U.Manager, key])
          assertEq(await one('select total_quantity from products where id = $1', [QTY_PRODUCT]), before + 2,
            'retry does not apply the delta twice')
          await refusesInProbe('stock below zero', 'select * from adjust_stock($1, -999, $2, $3, gen_random_uuid())',
            [QTY_PRODUCT, 'Physical count found missing stock', U.Manager], /below zero/i)
          await refusesInProbe('serialised bulk adjustment', 'select * from adjust_stock($1, 1, $2, $3, gen_random_uuid())',
            [SERIAL_PRODUCT, 'Physical count found an extra unit', U.Manager], /Serialised products/i)
          await refusesInProbe('direct quantity update', 'update products set total_quantity = total_quantity + 1 where id = $1',
            [QTY_PRODUCT], /audited stock adjustment action/i)
        })
        await as('Warehouse', async () => {
          await q("select set_config('request.jwt.claim.sub', $1, true)", [U.Warehouse])
          await refusesInProbe('Warehouse stock adjustment', 'select * from adjust_stock($1, 1, $2, $3, gen_random_uuid())',
            [QTY_PRODUCT, 'Physical count found an extra unit', U.Warehouse], /Only Owner, Admin, or Manager/i)
        })
      })
    },
  },
  {
    id: 'L21',
    title: 'A consumable line deducts stock at Handover and needs no return receipt (0141/0142)',
    expect: 'green',
    async run() {
      await as('Coordinator', async () => {
        await createBooking({
          key: 'cons',
          window: W.e,
          actor: 'Coordinator',
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Consumable-probe camera',
              qty: 1,
              days: 2,
              rate: 3500,
              units: [UNITS[2]],
            },
            {
              productId: CONSUMABLE_PRODUCT,
              description: 'Lifecycle Gaffer Tape',
              qty: 2,
              days: 2,
              rate: 150,
            },
          ],
        })
        await transition('cons', 'Quote', 'Booked', 'Coordinator')
      })
      assertEq(await liveHolds('cons'), 2, 'the consumable line holds quantity like any non-serialised line')

      await as('Warehouse', async () => {
        const packingSessionId = crypto.randomUUID()
        await q(
          `insert into operation_sessions (id, client_uuid, booking_id, operation, session_no, state, warehouse_staff_id, created_by)
           values ($1, gen_random_uuid(), $2, 'Packing', 1, 'In Progress', $3, $3)`,
          [packingSessionId, bookingIds.cons, U.Warehouse],
        )
        await q(
          `insert into session_line_movements (client_uuid, session_id, booking_line_id, unit_id, serial, qty, moved_at, created_by)
           values (gen_random_uuid(), $1, (select id from booking_lines where booking_id = $2 and product_id = $3), $4, 'LCSN-003', 1, now(), $5)`,
          [packingSessionId, bookingIds.cons, SERIAL_PRODUCT, UNITS[2], U.Warehouse],
        )
        await transition('cons', 'Booked', 'Packed', 'Warehouse')

        const handoverSessionId = crypto.randomUUID()
        await q(
          `insert into operation_sessions (id, client_uuid, booking_id, operation, session_no, state, delivery_method, warehouse_staff_id, created_by)
           values ($1, gen_random_uuid(), $2, 'Handover', 1, 'In Progress', 'Client Pickup', $3, $3)`,
          [handoverSessionId, bookingIds.cons, U.Warehouse],
        )
        // Handover still receipts every line including the consumable — the
        // exemption is Return-only.
        for (const [productId, qty] of [[SERIAL_PRODUCT, 1], [CONSUMABLE_PRODUCT, 2]]) {
          await q(
            `insert into handover_lines (client_uuid, booking_line_id, state, qty_required, first_session_id, completed_session_id, created_by)
             values (gen_random_uuid(), (select id from booking_lines where booking_id = $1 and product_id = $2), 'Picked Up', $3, $4, $4, $5)`,
            [bookingIds.cons, productId, qty, handoverSessionId, U.Warehouse],
          )
        }
        await q(
          `insert into signatures (client_uuid, session_id, signature_role, signer_name, signed_at, device, is_required, created_by)
           values (gen_random_uuid(), $1, 'Receiver', 'Lifecycle Client Signer', now(), 'iPad-1', true, $2)`,
          [handoverSessionId, U.Warehouse],
        )
        await transition('cons', 'Packed', 'On Rent', 'Warehouse')
      })

      assertEq(await stageOf('cons'), 'On Rent', 'handover completed with the consumable line aboard')

      // 0142: the Handover deducted 2 tapes from the shelf of 10.
      await asOwnerOfTheDatabase(async () => {
        const movement = (
          await q(
            `select qty, quantity_before, quantity_after
               from consumable_stock_movements
              where booking_id = $1`,
            [bookingIds.cons],
          )
        ).rows[0]
        assert(movement !== undefined, 'no consumable movement was recorded at Handover')
        assertEq(movement.qty, 2, 'movement qty')
        assertEq(movement.quantity_before, 10, 'movement quantity_before')
        assertEq(movement.quantity_after, 8, 'movement quantity_after')
        assertEq(
          await one('select total_quantity from products where id = $1', [CONSUMABLE_PRODUCT]),
          8,
          'the shelf count moved exactly once',
        )
      })

      await as('Warehouse', async () => {
        // The camera comes back in this session's books.
        await q(
          `update booking_line_units
              set returned_at = now(), condition = 'Good'
            where asset_id = $1
              and booking_line_id in (select id from booking_lines where booking_id = $2)`,
          [UNITS[2], bookingIds.cons],
        )
        const returnSessionId = crypto.randomUUID()
        await q(
          `insert into operation_sessions (id, client_uuid, booking_id, operation, session_no, state, warehouse_staff_id, created_by)
           values ($1, gen_random_uuid(), $2, 'Return', 1, 'In Progress', $3, $3)`,
          [returnSessionId, bookingIds.cons, U.Warehouse],
        )

        // The exemption is narrow: the serialised line still needs its receipt.
        await refuses(
          'moving to Returned with the camera unreceipted',
          `insert into booking_stage_transitions
             (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at)
           values (gen_random_uuid(), $1, $2, 'On Rent', 'Returned', $3, 'Warehouse', now())`,
          [bookingIds.cons, BRANCH, U.Warehouse],
          /gate\.return\.units_unaccounted/,
        )

        await q(
          `insert into return_lines (client_uuid, booking_line_id, state, qty_expected, session_id, returned_at, created_by)
           values (gen_random_uuid(), (select id from booking_lines where booking_id = $1 and product_id = $2), 'Returned', 1, $3, now(), $4)`,
          [bookingIds.cons, SERIAL_PRODUCT, returnSessionId, U.Warehouse],
        )

        // 0141: no return line for the gaffer tape, and the move is accepted.
        await transition('cons', 'On Rent', 'Returned', 'Warehouse')
      })

      assertEq(await stageOf('cons'), 'Returned', 'the booking returned without a consumable receipt')
      assertEq(await liveHolds('cons'), 0, 'every hold released, quantity holds included (R-26)')
      assertEq(
        await one(
          "select count(*) from cases where linked_booking_id = $1 and type = 'Missing'",
          [bookingIds.cons],
        ),
        0,
        'the consumed line opens no Missing case',
      )

      // The one-per-line UNIQUE is the re-run guard, not a bare not-exists.
      // As owner: RLS has no INSERT policy on this table by design (only the
      // trigger writes), so the probe must bypass RLS to reach the constraint.
      await undone(async () => {
        await asOwnerOfTheDatabase(async () => {
          await refuses(
            'a second deduction for the same booking line',
            `insert into consumable_stock_movements
               (client_uuid, booking_id, booking_line_id, product_id, qty, quantity_before, quantity_after, created_by)
             values (gen_random_uuid(), $1,
               (select id from booking_lines where booking_id = $1 and product_id = $2),
               $2, 2, 8, 6, $3)`,
            [bookingIds.cons, CONSUMABLE_PRODUCT, U.Warehouse],
            /duplicate|unique/i,
          )
        })
      })
    },
  },
  {
    id: 'L22',
    title: 'Smart Intel note visibility and classified values are filtered by RLS for every role',
    expect: 'green',
    run: async () => {
      await undone(async () => {
        await asOwnerOfTheDatabase(async () => {
          for (const visibility of ['all_staff', 'operations', 'management']) {
            await q(
              `insert into intel_entity_notes (client_uuid, entity_type, client_id, body, visibility, created_by)
               values (gen_random_uuid(), 'client', $1, $2, $3, $4)`,
              [CLIENT, `Intel ${visibility}`, visibility, U.Owner],
            )
            await q(
              `insert into booking_notes (client_uuid, booking_id, note_type, body, visibility, created_by)
               values (gen_random_uuid(), $1, 'Internal', $2, $3, $4)`,
              [bookingIds.a, `Intel ${visibility}`, visibility, U.Owner],
            )
          }
          for (const classification of ['operational', 'personal', 'financial']) {
            const definitionId = crypto.randomUUID()
            await q(
              `insert into intel_field_definitions
                 (id, client_uuid, entity_type, field_key, label, classification, high_priority, created_by)
               values ($1, gen_random_uuid(), 'client', $2, $3, $4, true, $5)`,
              [definitionId, `lifecycle_${classification}`, `Lifecycle ${classification}`, classification, U.Owner],
            )
            await q(
              `insert into intel_field_values
                 (client_uuid, definition_id, client_id, value_text, created_by)
               values (gen_random_uuid(), $1, $2, $3, $4)`,
              [definitionId, CLIENT, `SECRET_${classification}`, U.Owner],
            )
          }
        })
        for (const role of Object.keys(U)) {
          const noteCount = ['Owner', 'Admin', 'Manager'].includes(role) ? 3 : role === 'Accounts' ? 1 : role === 'Client' ? 0 : 2
          const fieldCount = ['Owner', 'Admin', 'Manager', 'Accounts'].includes(role) ? 3 : role === 'Coordinator' ? 2 : role === 'Client' ? 0 : 1
          await as(role, async () => {
            assertEq(await one('select count(*) from intel_entity_notes where client_id = $1', [CLIENT]), noteCount, `${role} client note visibility`)
            assertEq(await one('select count(*) from booking_notes where booking_id = $1 and body like $2', [bookingIds.a, 'Intel %']), noteCount, `${role} booking note visibility`)
            assertEq(await one('select count(*) from intel_field_values where client_id = $1', [CLIENT]), fieldCount, `${role} classified field visibility`)
            if (!['Owner', 'Admin', 'Manager', 'Accounts'].includes(role)) {
              assertEq(await one("select count(*) from intel_field_values where value_text = 'SECRET_financial'"), 0, `${role} financial payload absence`)
            }
          })
        }
      })
    },
  },
  {
    id: 'L23',
    title: 'extend_booking RPC extends return dates, increments line days, and updates reservations (AUD D5)',
    expect: 'green',
    run: async () => {
      // 1. Create a dedicated test booking in Quote -> Booked stage
      await as('Coordinator', async () => {
        await createBooking({
          key: 'ext_test',
          window: ['2105-06-01T04:00:00Z', '2105-06-03T04:00:00Z'],
          actor: 'Coordinator',
          lines: [
            {
              productId: SERIAL_PRODUCT,
              description: 'Extension Lifecycle Test Camera',
              qty: 1,
              days: 2,
              rate: 3500,
              units: [UNITS[2]],
            },
          ],
        })
        await transition('ext_test', 'Quote', 'Booked', 'Coordinator')
      })

      // 2. Refuses extension by unauthorized role (e.g. Client)
      await as('Client', async () => {
        await refuses(
          'extension by Client',
          `select extend_booking(jsonb_build_object(
            'booking_id', $1::uuid,
            'days', 2,
            'reason', 'Unauthorized client extension attempt'
          ))`,
          [bookingIds['ext_test']],
          /42501|may not extend/i,
        )
      })

      // 3. Coordinator extends booking by 2 days via extend_booking RPC
      let rpcResult
      await as('Coordinator', async () => {
        const res = await q(
          `select extend_booking(jsonb_build_object(
            'booking_id', $1::uuid,
            'days', 2,
            'reason', 'Production shoot schedule extended by two operational days'
          )) as data`,
          [bookingIds['ext_test']],
        )
        rpcResult = res.rows[0].data
      })

      assertEq(rpcResult.success, true, 'extend_booking RPC succeeded')
      assertEq(rpcResult.days_added, 2, 'two days added in result')

      // 4. Verify bookings.return_at advanced by 2 days
      const newReturnAt = await one('select return_at from bookings where id = $1', [bookingIds['ext_test']])
      const diffMs = new Date(newReturnAt).getTime() - new Date('2105-06-03T04:00:00Z').getTime()
      assertEq(diffMs, 2 * 24 * 60 * 60 * 1000, 'return_at moved forward exactly 2 days')

      // 5. Verify booking_lines.days incremented by 2 (2 + 2 = 4)
      const newDays = Number(
        await one(
          'select days from booking_lines where booking_id = $1 and voided_at is null limit 1',
          [bookingIds['ext_test']],
        ),
      )
      assertEq(newDays, 4, 'line days incremented to 4')

      // 6. Verify inventory_reservations period upper boundary matches new return_at
      const reservationUpper = await one(
        'select upper(period) from inventory_reservations where booking_id = $1 and released_at is null',
        [bookingIds['ext_test']],
      )
      assertEq(
        new Date(reservationUpper).toISOString(),
        new Date(newReturnAt).toISOString(),
        'reservation period matches new return date',
      )

      // 7. Verify audit event was recorded with actor Coordinator
      const auditCount = Number(
        await one(
          "select count(*) from audit_events where record_id = $1 and reason like '%extended by two operational days%' and actor_id = $2",
          [bookingIds['ext_test'], U.Coordinator],
        ),
      )
      assert(auditCount >= 1, 'extend_booking emitted audit event attributed to Coordinator')
    },
  },
  {
    id: 'L24',
    title: 'void_invoice RPC atomically issues credit note for paid amounts and voids invoice (AUD D6)',
    expect: 'green',
    run: async () => {
      // 1. Create a dedicated test booking and partially paid invoice
      const voidTestBookingId = crypto.randomUUID()
      await as('Coordinator', async () => {
        await q(
          `insert into bookings (id, client_uuid, booking_no, client_id, branch_id, project_type, delivery_type, stage, pickup_at, return_at, created_by, updated_by)
           values ($1, gen_random_uuid(), next_document_number('booking'), $2, $3, 'Commercial / Advertisement', 'Client Pickup', 'Quote', now(), now() + interval '2 days', $4, $4)`,
          [voidTestBookingId, CLIENT, BRANCH, U.Coordinator],
        )
      })

      const voidTestInvoiceId = crypto.randomUUID()
      await as('Accounts', async () => {
        await q(
          `insert into invoices (id, client_uuid, invoice_no, booking_id, client_id, branch_id, status, subtotal, total_amount, paid_amount, outstanding_amount, issue_date, due_date, created_by)
           values ($1, gen_random_uuid(), next_document_number('invoice'), $2, $3, $4, 'Partially Paid', 10000, 10000, 4000, 6000, current_date, current_date + 7, $5)`,
          [voidTestInvoiceId, voidTestBookingId, CLIENT, BRANCH, U.Accounts],
        )
      })

      // 2. Refuses void by unauthorized role (e.g. Technician)
      await as('Technician', async () => {
        await refuses(
          'void by Technician',
          `select void_invoice(jsonb_build_object(
            'invoice_id', $1::uuid,
            'reason', 'Technician attempting unauthorized invoice void'
          ))`,
          [voidTestInvoiceId],
          /gate\.invoice\.void_role/i,
        )
      })

      // 3. Accounts voids invoice via void_invoice RPC
      let voidResult
      await as('Accounts', async () => {
        const res = await q(
          `select void_invoice(jsonb_build_object(
            'invoice_id', $1::uuid,
            'reason', 'Client cancelled shoot with agreed refund credit note'
          )) as data`,
          [voidTestInvoiceId],
        )
        voidResult = res.rows[0].data
      })

      assertEq(voidResult.status, 'Void', 'void_invoice returned status Void')
      assert(voidResult.credit_note_no !== null, 'credit note number returned')

      // 4. Verify credit_notes row created for 4000 paid amount
      const creditRow = (
        await q('select amount, reason from credit_notes where invoice_id = $1', [voidTestInvoiceId])
      ).rows[0]
      assertEq(Number(creditRow.amount), 4000, 'credit note created for exact paid amount')

      // 5. Verify invoice status in DB is Void
      const invStatus = await one('select status::text from invoices where id = $1', [voidTestInvoiceId])
      assertEq(invStatus, 'Void', 'invoice status in DB is Void')

      // 6. Verify audit event written
      const auditCount = Number(
        await one(
          "select count(*) from audit_events where record_id = $1 and table_name = 'invoices' and actor_id = $2",
          [voidTestInvoiceId, U.Accounts],
        ),
      )
      assert(auditCount >= 1, 'void_invoice emitted audit event attributed to Accounts')
    },
  },
  {
    id: 'L25',
    title: 'Client Save changes is one atomic, idempotent, revision-locked write; contact removal keeps history (0146)',
    expect: 'green',
    async run() {
      const key = crypto.randomUUID()
      const values = { type_parent: 'Organisation', org_subtype: 'Production House', name: 'Editor Test Films', phone: '+9779801234567', country: 'Nepal' }
      const rows = [{ full_name: 'Sita Rai', phone: '+9779801234568' }]
      const created = await editorSave('Coordinator', 'client', null, null, key, values, rows)
      assert(created.id && created.revision, 'create returns the new record and its revision')
      const replay = await editorSave('Coordinator', 'client', null, null, key, values, rows)
      assertEq(replay.id, created.id, 'replaying the same key returns the same client')
      assertEq(await one("select count(*) from clients where phone = '+9779801234567'"), 1, 'a retry created no duplicate')
      await refusesSave('Coordinator', 'same key, different change', 'client', null, null, key, { ...values, name: 'Other' }, rows, /different change/i)

      const opened = await editorRead('Coordinator', 'client', created.id)
      assertEq(opened.values.name, 'Editor Test Films', 'edit loads the stored value')
      assertEq(opened.rows.length, 1, 'edit loads the primary contact')
      const edited = await editorSave('Coordinator', 'client', created.id, opened.revision, crypto.randomUUID(), { ...opened.values, name: 'Editor Test Films Ltd' }, opened.rows)
      assert(edited.revision !== opened.revision, 'a save moves the revision')
      assertEq(await one('select name from clients where id = $1', [created.id]), 'Editor Test Films Ltd', 'the edit persisted on the same row')
      assertEq(await one("select count(*) from clients where phone = '+9779801234567'"), 1, 'editing created no second client')

      await refusesSave('Coordinator', 'stale revision', 'client', created.id, opened.revision, crypto.randomUUID(), { ...opened.values, name: 'Stale write' }, opened.rows, /changed since you opened/i)
      assertEq(await one('select name from clients where id = $1', [created.id]), 'Editor Test Films Ltd', 'the stale write changed nothing')
      await refusesSave('Coordinator', 'credit override through generic save', 'client', created.id, edited.revision, crypto.randomUUID(), { ...edited.values, approved_credit_limit: 999999 }, edited.rows, /cannot be edited/i)
      for (const role of ['Warehouse', 'Accounts', 'Technician', 'Driver']) {
        await refusesSave(role, `${role} client edit`, 'client', created.id, edited.revision, crypto.randomUUID(), edited.values, edited.rows, /Permission denied/i)
      }

      await refusesSave('Coordinator', 'duplicate phone', 'client', null, null, crypto.randomUUID(), { ...values, name: 'Twin' }, [], /already exists/i)
      const walkIn = await editorSave('Warehouse', 'client', null, null, crypto.randomUUID(), { type_parent: 'Individual', name: 'Floor Walk-in', phone: '+9779801234569' }, [])
      assert(walkIn.id, 'Warehouse may still create a client (canCreateClient parity)')
      await refusesSave('Warehouse', 'Warehouse editing the walk-in', 'client', walkIn.id, walkIn.revision, crypto.randomUUID(), walkIn.values, [], /Permission denied/i)

      const cleared = await editorSave('Coordinator', 'client', created.id, edited.revision, crypto.randomUUID(), edited.values, [])
      assertEq(cleared.rows.length, 0, 'removing the contact leaves no active primary')
      assertEq(await one("select count(*) from client_contacts where client_id = $1 and status = 'Deactivated'", [created.id]), 1, 'the removed contact is deactivated, never deleted (Law 3)')
    },
  },
  {
    id: 'L26',
    title: 'Equipment Save changes edits catalogue, rates and unit location only; stock, custody and identity are refused (0146)',
    expect: 'green',
    async run() {
      const stripCreateOnly = (snap) => {
        const { tracking_mode: _t, total_quantity: _q, ...values } = snap.values
        return { ...snap, values }
      }
      const opened = stripCreateOnly(await editorRead('Manager', 'equipment', SERIAL_PRODUCT))
      assertEq(opened.rows.length, 3, 'edit loads every unit')
      const stockBefore = await one('select total_quantity from products where id = $1', [SERIAL_PRODUCT])
      const relocated = opened.rows.map((r, i) => (i === 0 ? { ...r, rack: 'R-EDIT', shelf: 'S1' } : r))
      const saved = stripCreateOnly(await editorSave('Manager', 'equipment', SERIAL_PRODUCT, opened.revision, crypto.randomUUID(), { ...opened.values, name: 'Lifecycle Serialised Camera II', daily_rate: 4100, notes_internal: 'edited' }, relocated))
      assertEq(await one('select name from products where id = $1', [SERIAL_PRODUCT]), 'Lifecycle Serialised Camera II', 'catalogue edit persisted')
      assertEq(Number(await one('select daily_rate from products where id = $1', [SERIAL_PRODUCT])), 4100, 'permitted rate persisted')
      assertEq(await one('select rack from product_units where id = $1', [UNITS[0]]), 'R-EDIT', 'unit location persisted')
      assertEq(await one('select total_quantity from products where id = $1', [SERIAL_PRODUCT]), stockBefore, 'stock is unchanged by a generic edit')
      assertEq(await one('select count(*) from product_units where product_id = $1', [SERIAL_PRODUCT]), 3, 'no unit was added or removed')

      await refusesSave('Manager', 'stale revision', 'equipment', SERIAL_PRODUCT, opened.revision, crypto.randomUUID(), opened.values, opened.rows, /changed since you opened/i)
      await refusesSave('Manager', 'tracking mode change', 'equipment', SERIAL_PRODUCT, saved.revision, crypto.randomUUID(), { ...saved.values, tracking_mode: 'Quantity' }, saved.rows, /cannot be edited/i)
      await refusesSave('Manager', 'stock quantity change', 'equipment', SERIAL_PRODUCT, saved.revision, crypto.randomUUID(), { ...saved.values, total_quantity: 99 }, saved.rows, /cannot be edited/i)
      await refusesSave('Manager', 'unit condition change', 'equipment', SERIAL_PRODUCT, saved.revision, crypto.randomUUID(), saved.values, saved.rows.map((r, i) => (i === 1 ? { ...r, condition: 'Poor' } : r)), /operational workflow/i)
      await refusesSave('Manager', 'unit custody change', 'equipment', SERIAL_PRODUCT, saved.revision, crypto.randomUUID(), saved.values, saved.rows.map((r, i) => (i === 1 ? { ...r, status: 'Retired' } : r)), /operational workflow/i)
      await refusesSave('Manager', 'unit removal', 'equipment', SERIAL_PRODUCT, saved.revision, crypto.randomUUID(), saved.values, saved.rows.slice(1), /cannot be removed/i)
      await refusesSave('Manager', 'unit addition', 'equipment', SERIAL_PRODUCT, saved.revision, crypto.randomUUID(), saved.values, [...saved.rows, { serial_no: 'NEW', warehouse_id: saved.rows[0].warehouse_id }], /intake/i)
      for (const role of ['Coordinator', 'Warehouse', 'Accounts']) {
        await refusesSave(role, `${role} equipment edit`, 'equipment', SERIAL_PRODUCT, saved.revision, crypto.randomUUID(), saved.values, saved.rows, /Permission denied/i)
      }
      assertEq(await one('select name from products where id = $1', [SERIAL_PRODUCT]), 'Lifecycle Serialised Camera II', 'every refusal left the saved record untouched')
    },
  },
  {
    id: 'L27',
    title: 'Bundle Save changes preserves component identity and soft-deactivates removed components (0146)',
    expect: 'green',
    async run() {
      const key = crypto.randomUUID()
      const rows = [
        { product_id: SERIAL_PRODUCT, quantity: 1, days: 1, is_mandatory: true, sort_order: 0 },
        { product_id: QTY_PRODUCT, quantity: 2, days: 1, is_mandatory: false, sort_order: 1 },
      ]
      const created = await editorSave('Manager', 'bundle', null, null, key, { name: 'Editor Test Kit', daily_rate: 5000, weekly_rate: 25000 }, rows)
      assertEq(created.rows.length, 2, 'both components saved')
      const [first, second] = created.rows
      const edited = await editorSave('Manager', 'bundle', created.id, created.revision, crypto.randomUUID(), { ...created.values, name: 'Editor Test Kit v2' }, [{ ...first, quantity: 3 }, second])
      const kept = edited.rows.find((r) => r.id === first.id)
      assert(kept !== undefined && Number(kept.quantity) === 3, 'the component kept its identity and took the new quantity')
      assertEq(edited.rows.find((r) => r.id === second.id)?.is_mandatory, false, 'the optional flag survived the edit')

      const removed = await editorSave('Manager', 'bundle', created.id, edited.revision, crypto.randomUUID(), edited.values, [edited.rows.find((r) => r.id === first.id)])
      assertEq(removed.rows.length, 1, 'the editor shows one active component')
      assertEq(await one('select count(*) from bundle_items where bundle_id = $1', [created.id]), 2, 'the removed component row still exists')
      assertEq(await one('select is_active from bundle_items where id = $1', [second.id]), false, 'removal is a soft deactivation (Law 3)')
      assert((await one('select deactivated_at from bundle_items where id = $1', [second.id])) !== null, 'the deactivation is timestamped')

      await refusesSave('Manager', 'stale revision', 'bundle', created.id, edited.revision, crypto.randomUUID(), edited.values, edited.rows, /changed since you opened/i)
      await refusesSave('Manager', 'empty bundle', 'bundle', created.id, removed.revision, crypto.randomUUID(), removed.values, [], /at least one component/i)
      await refusesSave('Manager', 'resurrecting a removed component', 'bundle', created.id, removed.revision, crypto.randomUUID(), removed.values, [...removed.rows, second], /removed|Reload/i)
      for (const role of ['Coordinator', 'Warehouse', 'Accounts']) {
        await refusesSave(role, `${role} bundle edit`, 'bundle', created.id, removed.revision, crypto.randomUUID(), removed.values, removed.rows, /Permission denied/i)
      }
    },
  },
  {
    id: 'L28',
    title: 'Quote Save changes is atomic, revision-locked, quote-only and invoice-safe; it makes no reservations (0147)',
    expect: 'green',
    async run() {
      await as('Coordinator', async () => {
        await createBooking({
          key: 'qe',
          window: ['2099-12-10T04:00:00Z', '2099-12-12T04:00:00Z'],
          actor: 'Coordinator',
          lines: [
            { productId: SERIAL_PRODUCT, description: 'Editable camera', qty: 1, days: 2, rate: 3500 },
            { productId: QTY_PRODUCT, description: 'Editable cable', qty: 2, days: 2, rate: 250 },
          ],
        })
      })
      const id = bookingIds.qe
      const snap = await rpcAs('Coordinator', 'select read_quote_editor($1)', [id])
      assertEq(snap.lines.length, 2, 'the editor loads both lines')
      const bookingNo = await one('select booking_no from bookings where id = $1', [id])
      const holdsBefore = await liveHolds('qe')

      const bumped = quotePayload(snap, (p) => ({ ...p, values: { ...p.values, project: 'Edited project' }, lines: p.lines.map((l) => (l.description === 'Editable cable' ? { ...l, qty: 3 } : l)) }))
      const key = crypto.randomUUID()
      const saved = await quoteSave('Coordinator', id, snap.revision, key, bumped)
      assert(saved.revision !== snap.revision, 'the save moves the revision')
      assertEq(await one('select booking_no from bookings where id = $1', [id]), bookingNo, 'the booking number is retained')
      assertEq(await stageOf('qe'), 'Quote', 'the stage is retained')
      assertEq(await one('select project from bookings where id = $1', [id]), 'Edited project', 'the header edit persisted')
      assertEq(await one("select qty from booking_lines where booking_id = $1 and description = 'Editable cable' and voided_at is null", [id]), 3, 'the line edit persisted on the same row')
      assertEq(await liveHolds('qe'), holdsBefore, 'editing a quote makes no reservations')
      assert(Number(await one('select count(*) from audit_events where client_uuid = $1', [key])) >= 1, 'the edit is audited')
      const replay = await quoteSave('Coordinator', id, snap.revision, key, bumped)
      assertEq(replay.revision, saved.revision, 'replaying the same key is a no-op')

      await refusesQuote('Coordinator', 'stale revision', id, snap.revision, crypto.randomUUID(), bumped, /changed since you opened/i)

      const fresh = await rpcAs('Coordinator', 'select read_quote_editor($1)', [id])
      const dropped = quotePayload(fresh, (p) => ({ ...p, lines: p.lines.filter((l) => l.description !== 'Editable camera') }))
      const afterDrop = await quoteSave('Coordinator', id, fresh.revision, crypto.randomUUID(), dropped)
      assertEq(afterDrop.lines.length, 1, 'the editor shows the remaining line')
      assertEq(await one("select count(*) from booking_lines where booking_id = $1 and description = 'Editable camera'", [id]), 1, 'the removed line still exists (voided, never deleted)')
      assert((await one("select voided_at from booking_lines where booking_id = $1 and description = 'Editable camera'", [id])) !== null, 'the removed line is voided')

      for (const role of ['Warehouse', 'Technician', 'Driver', 'Accounts']) {
        await refusesAs(role, `${role} reads the quote editor`, 'select read_quote_editor($1)', [id], /cannot edit/i)
        await refusesQuote(role, `${role} edits a quote`, id, afterDrop.revision, crypto.randomUUID(), dropped, /cannot edit/i)
      }
      await refusesQuote('Coordinator', 'unknown header field', id, afterDrop.revision, crypto.randomUUID(), { ...dropped, values: { ...dropped.values, stage: 'Booked' } }, /cannot be edited/i)

      const later = bookingIds.a
      assert((await stageOf('a')) !== 'Quote', 'fixture: booking a has left Quote')
      await refusesAs('Coordinator', 'reading a confirmed booking', 'select read_quote_editor($1)', [later], /Only unconfirmed quotes/i)
      await refusesQuote('Coordinator', 'editing a confirmed booking', later, 'x', crypto.randomUUID(), dropped, /Only unconfirmed quotes/i)

      // Draft invoice: refused, and the refusal must roll back the header write that ran first.
      const invoiceId = crypto.randomUUID()
      await as('Accounts', async () => {
        await q(
          `insert into invoices (id, client_uuid, invoice_no, booking_id, client_id, branch_id, status, subtotal, total_amount, paid_amount, outstanding_amount, issue_date, due_date, created_by)
           values ($1, gen_random_uuid(), next_document_number('invoice'), $2, $3, $4, 'Draft', 1000, 1000, 0, 1000, current_date, current_date + 7, $5)`,
          [invoiceId, id, CLIENT, BRANCH, U.Accounts],
        )
      })
      const withInvoice = await rpcAs('Coordinator', 'select read_quote_editor($1)', [id])
      await refusesQuote('Coordinator', 'draft invoice present', id, withInvoice.revision, crypto.randomUUID(), quotePayload(withInvoice, (p) => ({ ...p, values: { ...p.values, project: 'Must roll back' } })), /draft invoice/i)
      assertEq(await one('select project from bookings where id = $1', [id]), 'Edited project', 'a refused save leaves no partial write (atomic)')

      await asOwnerOfTheDatabase(async () => {
        await q("update invoices set status = 'Partially Paid', paid_amount = 400, outstanding_amount = 600 where id = $1", [invoiceId])
      })
      const issued = await rpcAs('Coordinator', 'select read_quote_editor($1)', [id])
      await refusesQuote('Coordinator', 'issued invoice present', id, issued.revision, crypto.randomUUID(), quotePayload(issued), /issued financial document/i)
      assertEq(Number(await one('select paid_amount from invoices where id = $1', [invoiceId])), 400, 'payments and issued invoices are never rewritten')
    },
  },
  {
    id: 'L29',
    title: 'update_bundle applies patch, line edits, adds and soft-deactivations in ONE transaction (0153)',
    expect: 'green',
    async run() {
      const created = await editorSave('Manager', 'bundle', null, null, crypto.randomUUID(), { name: 'Atomic Kit', daily_rate: 1000, weekly_rate: 5000 }, [
        { product_id: SERIAL_PRODUCT, quantity: 1, days: 1, is_mandatory: true, sort_order: 0 },
        { product_id: QTY_PRODUCT, quantity: 2, days: 1, is_mandatory: false, sort_order: 1 },
      ])
      const [a, b] = created.rows
      const ub = (role, rev, key, payload) => rpcAs(role, 'select update_bundle($1::uuid, $2, $3::uuid, $4::jsonb)', [created.id, rev, key, JSON.stringify(payload)])
      const refusesUb = (role, what, rev, key, payload, matcher) =>
        refusesAs(role, what, 'select update_bundle($1::uuid, $2, $3::uuid, $4::jsonb)', [created.id, rev, key, JSON.stringify(payload)], matcher)

      const bad = { patch: { name: 'Must roll back' }, edits: [{ id: a.id, quantity: 9 }], deactivations: [{ id: crypto.randomUUID() }] }
      await refusesUb('Manager', 'one bad row poisons the whole save', created.revision, crypto.randomUUID(), bad, /no longer belongs/i)
      assertEq(await one('select name from bundles where id = $1', [created.id]), 'Atomic Kit', 'the header write rolled back')
      assertEq(Number(await one('select quantity from bundle_items where id = $1', [a.id])), 1, 'the line edit rolled back')

      const key = crypto.randomUUID()
      const good = { patch: { name: 'Atomic Kit v2', weekly_rate: 6000 }, edits: [{ id: a.id, quantity: 4, is_mandatory: false }], adds: [{ product_id: CONSUMABLE_PRODUCT, quantity: 1, days: 1 }], deactivations: [{ id: b.id }] }
      const saved = await ub('Manager', created.revision, key, good)
      assertEq(await one('select name from bundles where id = $1', [created.id]), 'Atomic Kit v2', 'header persisted')
      assertEq(Number(await one('select quantity from bundle_items where id = $1', [a.id])), 4, 'line edit persisted on the same row')
      assertEq(saved.rows.length, 2, 'active components: edited one + the new one')
      assertEq(await one('select is_active from bundle_items where id = $1', [b.id]), false, 'removal is a soft deactivation')
      assertEq(await one('select count(*) from bundle_items where bundle_id = $1', [created.id]), 3, 'no component row was deleted')
      assertEq((await ub('Manager', created.revision, key, good)).revision, saved.revision, 'replaying the same key is a no-op')
      assertEq(await one('select count(*) from bundle_items where bundle_id = $1', [created.id]), 3, 'the replay added nothing')

      await refusesUb('Manager', 'stale revision', created.revision, crypto.randomUUID(), good, /changed since you opened/i)
      await refusesUb('Manager', 'unknown header field', saved.revision, crypto.randomUUID(), { patch: { bundle_code: 'X' } }, /cannot be edited/i)
      await refusesUb('Coordinator', 'Coordinator', saved.revision, crypto.randomUUID(), { patch: { name: 'Nope' } }, /Permission denied/i)
      await refusesUb('Manager', 'emptying an active bundle', saved.revision, crypto.randomUUID(), { deactivations: saved.rows.map((r) => ({ id: r.id })) }, /at least one component/i)
    },
  },
]

/* ── Run ──────────────────────────────────────────────────────────────────── */

await seed()

const results = []
let hardFailure = null

for (const step of STEPS) {
  if (only !== null && step.id !== only && results.length > 0 && STEPS.findIndex((s) => s.id === only) < STEPS.indexOf(step)) {
    break
  }
  let outcome
  let detail = ''
  try {
    await step.run()
    outcome = step.expect === 'green' ? 'pass' : 'unexpectedly-green'
  } catch (e) {
    detail = String(e.message).split('\n')[0]
    outcome = step.expect === 'red' ? 'still-red' : 'FAIL'
    /* A statement that raised inside an implicit transaction leaves the session
       aborted; clear it so the next step reports its own result rather than the
       cascade. */
    try {
      await db.exec('rollback; reset role;')
    } catch {
      /* not in a transaction */
    }
  }
  results.push({
    id: step.id,
    title: step.title,
    expect: step.expect,
    outcome,
    detail,
    ...(step.shortfall === undefined ? {} : { shortfall: step.shortfall }),
  })

  const mark = { pass: '  ok  ', 'still-red': ' red  ', FAIL: ' FAIL ', 'unexpectedly-green': ' GREEN' }[outcome]
  console.log(`${mark} ${step.id}  ${step.title}`)
  if (outcome === 'FAIL' || verbose) {
    if (detail !== '') console.log(`        ${detail}`)
  }
  if (outcome === 'still-red' && verbose) console.log(`        (expected: ${step.red})`)
  /* A green step with a shortfall is green about what it asserts and honest
     about what it does not. Printed every run, not only under --verbose. */
  if (outcome === 'pass' && step.shortfall !== undefined) console.log(`        note: ${step.shortfall}`)
  if (outcome === 'unexpectedly-green') {
    console.log(`        This step is marked known-red and it PASSED. The behaviour was built — delete the marker.`)
    console.log(`        Marker said: ${step.red}`)
  }
  if (outcome === 'FAIL' && hardFailure === null) hardFailure = step.id
}

await db.close()

const green = results.filter((r) => r.outcome === 'pass').length
const red = results.filter((r) => r.outcome === 'still-red').length
const failed = results.filter((r) => r.outcome === 'FAIL' || r.outcome === 'unexpectedly-green')

console.log(`\n${String(green)}/${String(results.length)} green, ${String(red)} known-red, ${String(failed.length)} failed`)

writeFileSync(
  join(ROOT, '.lifecycle-result.json'),
  `${JSON.stringify({ at: new Date().toISOString(), green, red, total: results.length, results }, null, 2)}\n`,
)

if (failed.length > 0) {
  console.log('\nFailures:')
  for (const r of failed) console.log(`  ${r.id}  ${r.title}\n     ${r.detail || r.outcome}`)
  process.exit(1)
}
console.log('The lifecycle holds. (PGlite, not Supabase — no JWT and no PostgREST. See this file’s header.)')
