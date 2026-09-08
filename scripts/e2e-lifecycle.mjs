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

  /* One Serialised product with three units, and one Quantity product with a
     stock of three. The 0047 corpus is 56 products and ALL Serialised, while
     production is 204 and ALL Quantity — so a script that borrowed the corpus
     would exercise the GiST exclusion and never the capacity ceiling, which is
     the half that matters on live. Both are seeded here. */
  await q(
    `insert into products (id, client_uuid, asset_code, name, category_id, brand, tracking_mode, total_quantity, daily_rate, created_by)
     values ($1, gen_random_uuid(), $5, 'Lifecycle Serialised Camera', $4, 'Lifecycle', 'Serialised', 3, 3500, $3),
            ($2, gen_random_uuid(), $6, 'Lifecycle Bulk Cable',        $4, 'Lifecycle', 'Quantity',   3, 250,  $3)
     on conflict (id) do nothing`,
    [
      SERIAL_PRODUCT,
      QTY_PRODUCT,
      U.Owner,
      CATEGORY,
      await one("select next_document_number('equipment')"),
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
    delivery_type: 'Customer Pickup',
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

/* ── The thirteen steps ───────────────────────────────────────────────────── */

let invoiceId = null

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
    expect: 'red',
    red: 'The stage-gate trigger is not built. `validate_booking_gates` guards only On Rent and Closed and checks money, not floor rows, so a Warehouse session walks Booked → Packed → On Rent with no packing session, no handover, and nothing packed. P1, unruled as a migration.',
    async run() {
      await as('Warehouse', async () => {
        await transition('a', 'Booked', 'Packed', 'Warehouse')
        await transition('a', 'Packed', 'On Rent', 'Warehouse')
      })
      assertEq(await stageOf('a'), 'On Rent', 'the walk happened')

      const sessions = Number(
        await one('select count(*) from operation_sessions where booking_id = $1', [bookingIds.a]),
      )
      assert(
        sessions > 0,
        'a booking reached On Rent with NO operation_sessions row: no packing session, no handover, nothing packed. ' +
          'The stage gate that would refuse this does not exist.',
      )
    },
  },

  {
    id: 'L7',
    title: 'A partial return: one unit back, one missing',
    expect: 'red',
    red: 'Return does not write the case. Marking a unit missing sets booking_line_units.missing_reason, and nothing opens a `cases` row of type Missing from it — that lives in floorVerb.ts, app-side, and R-26 releases every hold at Returned including the missing unit\'s.',
    async run() {
      await as('Warehouse', async () => {
        await q(
          `update booking_line_units
              set returned_at = now(), condition = 'Good'
            where asset_id = $1
              and booking_line_id in (select id from booking_lines where booking_id = $2)`,
          [UNITS[0], bookingIds.a],
        )
        await transition('a', 'On Rent', 'Returned', 'Warehouse')
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
    title: 'Accounts raises the invoice: 7,000 − 700 = 6,300 + 819 VAT = 7,119',
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
    },
  },

  {
    id: 'L9',
    title: 'Four payments that must all be refused',
    expect: 'red',
    red: 'Nothing refuses an overpayment and nothing scopes a payment to its own client. `payments` carries CHECK (amount > 0) and CHECK (payment_type <> \'Security Deposit\') and that is the whole of it — no over-outstanding guard, no cross-client guard, and the money-blind refusal is RLS silently matching no row rather than a stated rule. MONEY, unbuilt.',
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
    /* R-27's L10 also names `status Paid`, and that is NOT asserted here — it
       cannot be reached. `issue_invoice` (SPEC-P0-1 §3.3) is not written, so an
       invoice never leaves Draft: it can be fully paid and still be a Draft with
       no number, forever. Asserting it would make this step permanently red and
       hide the two figures that ARE right; leaving it unmentioned would be
       worse. It is stated as a shortfall, printed on every run, and carried into
       the R-29 Remaining list. */
    shortfall:
      'a fully paid invoice stays Draft — `issue_invoice` is not written, so nothing ever sets Sent/Paid on the status column.',
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
        /* Not `assertEq(row.status, 'Paid')` — see this step's `shortfall`. What
           IS asserted is that the status has not gone somewhere unexpected. */
        assert(
          row.status === 'Paid' || row.status === 'Draft',
          `invoice status is ${String(row.status)}, which is neither the Paid it should be nor the Draft it is stuck at`,
        )
      })
    },
  },

  {
    id: 'L11',
    title: 'Closed needs a settled invoice',
    expect: 'red',
    red: 'A booking closes with NO INVOICE AT ALL. `validate_booking_gates` fires on the transition into Closed and checks the invoices that exist; a booking that was never invoiced has nothing to check, so the gate passes over it. That is one of the four failures this script was written for.',
    async run() {
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
        await as('Coordinator', async () => {
          await transition('c', 'Booked', 'Packed', 'Coordinator')
          await transition('c', 'Packed', 'On Rent', 'Coordinator')
          await transition('c', 'On Rent', 'Returned', 'Coordinator')
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
