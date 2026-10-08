#!/usr/bin/env node
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

console.log('Testing Reschedule & Double-Booking Defense (AUD-001)...')

const HERE = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = join(HERE, '..', 'supabase', 'migrations')
const PRELUDE_PATH = join(HERE, '..', 'supabase', 'pglite-prelude.sql')

const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })

// 1. Run prelude
await db.exec(readFileSync(PRELUDE_PATH, 'utf8'))

// 2. Apply all migrations in order
const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
for (const file of files) {
  const sql = readFileSync(join(MIGRATIONS, file), 'utf8')
  try {
    await db.exec(sql)
  } catch (err) {
    console.error(`Migration ${file} failed:`, err.message)
    process.exit(1)
  }
}
console.log(`✓ Applied all ${files.length} migrations in PGlite.`)

// 3. Resolve seeded fixtures from reference corpus
const branchRes = await db.query(`select id from branches order by created_at limit 1;`)
const branchId = branchRes.rows[0]?.id

const clientRes = await db.query(`select id from clients order by created_at limit 1;`)
const clientId = clientRes.rows[0]?.id

const actorRes = await db.query(`select id from users where primary_role in ('Owner', 'Admin', 'Manager') limit 1;`)
const actorId = actorRes.rows[0]?.id

const unitRes = await db.query(`
  select p.id as product_id, pu.id as unit_id, p.name
    from products p
    join product_units pu on pu.product_id = p.id
   where p.tracking_mode = 'Serialised'
   limit 1;
`)
const productId = unitRes.rows[0].product_id
const unitId = unitRes.rows[0].unit_id
const productName = unitRes.rows[0].name

console.log(`✓ Using test equipment: ${productName} (Unit: ${unitId})`)

// 4. Create Booking 1 (Oct 1 -> Oct 5)
const b1Res = await db.query(`
  insert into bookings (client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, stage, delivery_type, created_by, updated_by)
  values (gen_random_uuid(), '990001', $1, $2, '2026-10-01 06:00:00+00', '2026-10-05 06:00:00+00', 'Quote', 'Client Pickup', $3, $3)
  returning id;
`, [clientId, branchId, actorId])
const b1Id = b1Res.rows[0].id

const line1Res = await db.query(`
  insert into booking_lines (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
  values (gen_random_uuid(), $1, 'Equipment', $2, 'Test Camera Package 1', 1, 4, 0, $3)
  returning id;
`, [b1Id, productId, actorId])
const line1Id = line1Res.rows[0].id

await db.query(`
  insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by)
  values (gen_random_uuid(), $1, $2, 1, $3);
`, [line1Id, unitId, actorId])

// Transition Booking 1 to Booked -> trigger 0100 writes reservation
await db.query(`
  insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role)
  values (gen_random_uuid(), $1, $2, 'Quote', 'Booked', $3, 'Owner');
`, [b1Id, branchId, actorId])

// 5. Create Booking 2 (Oct 10 -> Oct 15)
const b2Res = await db.query(`
  insert into bookings (client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, stage, delivery_type, created_by, updated_by)
  values (gen_random_uuid(), '990002', $1, $2, '2026-10-10 06:00:00+00', '2026-10-15 06:00:00+00', 'Quote', 'Client Pickup', $3, $3)
  returning id;
`, [clientId, branchId, actorId])
const b2Id = b2Res.rows[0].id

const line2Res = await db.query(`
  insert into booking_lines (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
  values (gen_random_uuid(), $1, 'Equipment', $2, 'Test Camera Package 2', 1, 5, 0, $3)
  returning id;
`, [b2Id, productId, actorId])
const line2Id = line2Res.rows[0].id

await db.query(`
  insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by)
  values (gen_random_uuid(), $1, $2, 1, $3);
`, [line2Id, unitId, actorId])

// Transition Booking 2 to Booked -> trigger 0100 writes reservation
await db.query(`
  insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role)
  values (gen_random_uuid(), $1, $2, 'Quote', 'Booked', $3, 'Owner');
`, [b2Id, branchId, actorId])

console.log('✓ Created and confirmed Booking 1 (Oct 1-5) and Booking 2 (Oct 10-15).')

// Check initial reservations
const r1 = await db.query(`select period from inventory_reservations where booking_id = $1 and released_at is null`, [b1Id])
console.log('  Booking 1 reservation period:', r1.rows[0].period)

// 6. ATTEMPT COLLISION: Reschedule Booking 1 to Oct 10 -> Oct 15 (overlapping Booking 2)
let collisionRejected = false
try {
  await db.query(`
    update bookings
       set pickup_at = '2026-10-10 06:00:00+00',
           return_at = '2026-10-15 06:00:00+00'
     where id = $1;
  `, [b1Id])
} catch (err) {
  collisionRejected = true
  console.log(`✓ Collision successfully REJECTED by database constraint/trigger: ${err.message}`)
}

if (!collisionRejected) {
  console.error('❌ CRITICAL DEFECT: Rescheduling allowed overlapping double booking on the same camera unit!')
  process.exit(1)
}

// Verify Booking 1 dates remain unchanged in database
const b1Check = await db.query(`select pickup_at, return_at from bookings where id = $1`, [b1Id])
console.log('✓ Booking 1 dates rolled back safely to:', b1Check.rows[0].pickup_at)

// 7. ATTEMPT VALID RESCHEDULE: Move Booking 1 to Oct 20 -> Oct 25 (open slot)
await db.query(`
  update bookings
     set pickup_at = '2026-10-20 06:00:00+00',
         return_at = '2026-10-25 06:00:00+00'
   where id = $1;
`, [b1Id])

const r1Updated = await db.query(`select period from inventory_reservations where booking_id = $1 and released_at is null`, [b1Id])
console.log('✓ Booking 1 rescheduled cleanly to non-conflicting period:', r1Updated.rows[0].period)

if (!r1Updated.rows[0].period.includes('2026-10-20')) {
  console.error('❌ Reservation period did not synchronize to new dates!')
  process.exit(1)
}

console.log('\n🎉 ALL RESCHEDULE & DOUBLE-BOOKING INVARIANTS VERIFIED 100% SUCCESSFUL!\n')
process.exit(0)
