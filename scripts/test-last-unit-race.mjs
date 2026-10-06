#!/usr/bin/env node
// Spec gate INV-003 "no double reservation" (Babin_Rentals_OS_Deep_Spec_v2, 06-Oct-2026).
// Several bookings contend for the LAST free unit; the database must let exactly one win.
//
// HONEST LIMIT: PGlite is a single connection, so contenders run one after another, not
// interleaved. This proves the constraints (exclusion + capacity ceiling) are what stops the
// second writer regardless of any availability pre-check; it does NOT prove two live
// connections cannot interleave. That needs a real Postgres (see PROGRESS.md 2026-10-06 (g)).
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const MIG = join(HERE, '..', 'supabase', 'migrations')
const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
await db.exec(readFileSync(join(HERE, '..', 'supabase', 'pglite-prelude.sql'), 'utf8'))
for (const f of readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()) await db.exec(readFileSync(join(MIG, f), 'utf8'))

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++ }

const branchId = (await db.query(`select id from branches order by created_at limit 1`)).rows[0].id
const clientId = (await db.query(`select id from clients order by created_at limit 1`)).rows[0].id
const actorId = (await db.query(`select id from users where primary_role in ('Owner','Admin','Manager') limit 1`)).rows[0].id
const prod = (await db.query(`
  select p.id, (select count(*) from product_units u where u.product_id = p.id)::int as units
    from products p where p.tracking_mode = 'Serialised'
     and (select count(*) from product_units u where u.product_id = p.id) between 2 and 4 limit 1`)).rows[0]
const units = (await db.query(`select id from product_units where product_id = $1 order by id`, [prod.id])).rows.map((r) => r.id)

let seq = 980000
async function booking(pickup, ret) {
  const no = String(++seq)
  const b = (await db.query(`
    insert into bookings (client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, stage, delivery_type, created_by, updated_by)
    values (gen_random_uuid(), $1, $2, $3, $4, $5, 'Quote', 'Client Pickup', $6, $6) returning id`,
    [no, clientId, branchId, pickup, ret, actorId])).rows[0].id
  const l = (await db.query(`
    insert into booking_lines (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
    values (gen_random_uuid(), $1, 'Equipment', $2, 'race', 1, 1, 0, $3) returning id`, [b, prod.id, actorId])).rows[0].id
  return { b, l }
}
async function book(bk, unitId) {
  await db.query(`insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by) values (gen_random_uuid(), $1, $2, 1, $3)`, [bk.l, unitId, actorId])
  try {
    await db.query(`insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role)
                    values (gen_random_uuid(), $1, $2, 'Quote', 'Booked', $3, 'Owner')`, [bk.b, branchId, actorId])
    return true
  } catch { return false }
}
const live = async (unitId) => (await db.query(`select count(*)::int n from inventory_reservations where asset_id = $1 and released_at is null and period && tstzrange('2027-01-01', '2028-01-01')`, [unitId])).rows[0].n

// A — identical window, 4 contenders, ONE unit: exactly one wins.
const W = ['2027-03-01 06:00:00+00', '2027-03-04 06:00:00+00']
const results = []
for (let i = 0; i < 4; i++) results.push(await book(await booking(...W), units[0]))
check(results.filter(Boolean).length === 1, `A: 4 contenders, same unit, same window → exactly 1 wins (${results.map((r) => (r ? 'W' : 'L')).join('')})`)
check((await live(units[0])) === 1, 'A: exactly one live reservation row for the unit')

// B — partial overlap on either edge loses; back-to-back (end == start) wins (half-open range).
check(!(await book(await booking('2027-03-03 06:00:00+00', '2027-03-06 06:00:00+00'), units[0])), 'B: overlaps tail by 1 day → rejected')
check(!(await book(await booking('2027-02-27 06:00:00+00', '2027-03-02 06:00:00+00'), units[0])), 'B: overlaps head by 1 day → rejected')
check(!(await book(await booking('2027-03-02 06:00:00+00', '2027-03-03 06:00:00+00'), units[0])), 'B: fully inside → rejected')
check(await book(await booking('2027-03-04 06:00:00+00', '2027-03-06 06:00:00+00'), units[0]), 'B: starts exactly when the first ends → accepted')
check(await book(await booking('2027-02-27 06:00:00+00', '2027-03-01 06:00:00+00'), units[0]), 'B: ends exactly when the first starts → accepted')
check((await live(units[0])) === 3, 'B: three live rows (1 + 2 back-to-back), none from rejected attempts')

// C — a different unit of the same product is unaffected (rejection is per unit, not per product).
if (units.length > 1) check(await book(await booking(...W), units[1]), 'C: same window on a different unit → accepted')

// D — product-level (quantity) holds cannot exceed stock on hand (capacity ceiling, 0045).
const D = ['2027-06-01 06:00:00+00', '2027-06-03 06:00:00+00']
async function qtyHold(n) {
  const bk = await booking(...D)
  try {
    await db.query(`insert into inventory_reservations (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by)
                    values (gen_random_uuid(), $1, $2, $3, $4, tstzrange($5::timestamptz, $6::timestamptz), $7)`, [bk.b, bk.l, prod.id, n, ...D, actorId])
    return true
  } catch { return false }
}
check(await qtyHold(prod.units), `D: holding all ${prod.units} unit(s) by quantity → accepted`)
check(!(await qtyHold(1)), 'D: one more beyond stock on hand → rejected')

console.log(failed ? `\n❌ ${failed} race invariant(s) FAILED` : '\n🎉 LAST-UNIT RACE INVARIANTS VERIFIED (sequential contention; see header for limit)')
process.exit(failed ? 1 : 0)
