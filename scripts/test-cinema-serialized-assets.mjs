#!/usr/bin/env node
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

console.log('Testing AUD-020 Transition Key Cinema Assets to Serialized Mode & Unit Exclusion Constraint...')

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

// 3. Verify Key Cinema Assets exist and are tracking_mode = 'Serialised'
const cinemaCodes = [
  'EQ000066', 'EQ000128', 'EQ000129', 'EQ000130', 'EQ000189', 'EQ000191', 'EQ000192', 'EQ000193',
  'EQ000035', 'EQ000036', 'EQ000049', 'EQ000050', 'EQ000112', 'EQ000113'
]

const cinemaProductsRes = await db.query(`
  select p.id, p.asset_code, p.name, p.tracking_mode, count(pu.id) as unit_count
  from products p
  left join product_units pu on pu.product_id = p.id
  where p.asset_code = any($1)
  group by p.id, p.asset_code, p.name, p.tracking_mode
  order by p.asset_code;
`, [cinemaCodes])

if (cinemaProductsRes.rows.length !== cinemaCodes.length) {
  console.error(`FAIL: Expected ${cinemaCodes.length} cinema products, found ${cinemaProductsRes.rows.length}`)
  process.exit(1)
}

for (const row of cinemaProductsRes.rows) {
  if (row.tracking_mode !== 'Serialised') {
    console.error(`FAIL: Product ${row.asset_code} (${row.name}) tracking_mode is ${row.tracking_mode}, expected 'Serialised'`)
    process.exit(1)
  }
  if (Number(row.unit_count) < 2) {
    console.error(`FAIL: Product ${row.asset_code} has ${row.unit_count} units, expected at least 2`)
    process.exit(1)
  }
}
console.log(`✓ Verified all ${cinemaCodes.length} key cinema camera bodies and lenses are Serialised with active product_units.`)

// 4. Test Serialized Unit Reservation and Double-Booking Exclusion Constraint
const branchRes = await db.query(`select id from branches order by created_at limit 1;`)
const branchId = branchRes.rows[0]?.id

const clientRes = await db.query(`select id from clients order by created_at limit 1;`)
const clientId = clientRes.rows[0]?.id

const actorRes = await db.query(`select id from users where primary_role in ('Owner', 'Admin', 'Manager') limit 1;`)
const actorId = actorRes.rows[0]?.id

// Pick Sony FX3 unit 1
const fx3UnitRes = await db.query(`
  select p.id as product_id, p.name, pu.id as unit_id, pu.asset_tag, pu.serial_no
  from products p
  join product_units pu on pu.product_id = p.id
  where p.asset_code = 'EQ000191'
  order by pu.created_at
  limit 1;
`)
const fx3 = fx3UnitRes.rows[0]
console.log(`✓ Testing reservation with physical asset: ${fx3.name} (${fx3.asset_tag}, Serial: ${fx3.serial_no})`)

// Booking A: 2026-11-01 to 2026-11-05
const b1Res = await db.query(`
  insert into bookings (client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, stage, delivery_type, created_by, updated_by)
  values (gen_random_uuid(), '990501', $1, $2, '2026-11-01 06:00:00+05:45', '2026-11-05 06:00:00+05:45', 'Quote', 'Client Pickup', $3, $3)
  returning id;
`, [clientId, branchId, actorId])
const b1Id = b1Res.rows[0].id

const line1Res = await db.query(`
  insert into booking_lines (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
  values (gen_random_uuid(), $1, 'Equipment', $2, 'Sony FX3 Cinema Camera', 1, 4, 0, $3)
  returning id;
`, [b1Id, fx3.product_id, actorId])
const line1Id = line1Res.rows[0].id

await db.query(`
  insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by)
  values (gen_random_uuid(), $1, $2, 1, $3);
`, [line1Id, fx3.unit_id, actorId])

// Transition Booking A to Booked -> creates inventory_reservation for fx3.unit_id
await db.query(`
  insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role)
  values (gen_random_uuid(), $1, $2, 'Quote', 'Booked', $3, 'Owner');
`, [b1Id, branchId, actorId])

const res1 = await db.query(`
  select * from inventory_reservations where booking_id = $1 and asset_id = $2 and released_at is null;
`, [b1Id, fx3.unit_id])

if (res1.rows.length !== 1) {
  console.error('FAIL: Expected 1 active inventory_reservation for Booking A, got', res1.rows.length)
  process.exit(1)
}
console.log('✓ Booking A successfully reserved Sony FX3 unit 1 (Nov 1 - Nov 5).')

// Booking B: 2026-11-03 to 2026-11-07 (Overlapping with Booking A)
const b2Res = await db.query(`
  insert into bookings (client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, stage, delivery_type, created_by, updated_by)
  values (gen_random_uuid(), '990502', $1, $2, '2026-11-03 06:00:00+05:45', '2026-11-07 06:00:00+05:45', 'Quote', 'Client Pickup', $3, $3)
  returning id;
`, [clientId, branchId, actorId])
const b2Id = b2Res.rows[0].id

const line2Res = await db.query(`
  insert into booking_lines (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
  values (gen_random_uuid(), $1, 'Equipment', $2, 'Sony FX3 Cinema Camera', 1, 4, 0, $3)
  returning id;
`, [b2Id, fx3.product_id, actorId])
const line2Id = line2Res.rows[0].id

await db.query(`
  insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by)
  values (gen_random_uuid(), $1, $2, 1, $3);
`, [line2Id, fx3.unit_id, actorId])

let conflictBlocked = false
try {
  // Transition Booking B to Booked -> should be blocked by exclusion constraint
  await db.query(`
    insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role)
    values (gen_random_uuid(), $1, $2, 'Quote', 'Booked', $3, 'Owner');
  `, [b2Id, branchId, actorId])
} catch (err) {
  if (err.message.includes('inventory_reservations_no_double_booking') || err.message.includes('conflicts with existing key')) {
    conflictBlocked = true
  } else {
    console.error('Unexpected error during conflict test:', err.message)
    process.exit(1)
  }
}

if (!conflictBlocked) {
  console.error('FAIL: Overlapping reservation for the same serial unit was NOT blocked!')
  process.exit(1)
}
console.log('✓ Overlapping reservation of the same serial unit was blocked by GiST exclusion constraint (inventory_reservations_no_double_booking).')

// Booking C: 2026-11-08 to 2026-11-12 (Non-overlapping with Booking A)
const b3Res = await db.query(`
  insert into bookings (client_uuid, booking_no, client_id, branch_id, pickup_at, return_at, stage, delivery_type, created_by, updated_by)
  values (gen_random_uuid(), '990503', $1, $2, '2026-11-08 06:00:00+05:45', '2026-11-12 06:00:00+05:45', 'Quote', 'Client Pickup', $3, $3)
  returning id;
`, [clientId, branchId, actorId])
const b3Id = b3Res.rows[0].id

const line3Res = await db.query(`
  insert into booking_lines (client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by)
  values (gen_random_uuid(), $1, 'Equipment', $2, 'Sony FX3 Cinema Camera', 1, 4, 0, $3)
  returning id;
`, [b3Id, fx3.product_id, actorId])
const line3Id = line3Res.rows[0].id

await db.query(`
  insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by)
  values (gen_random_uuid(), $1, $2, 1, $3);
`, [line3Id, fx3.unit_id, actorId])

await db.query(`
  insert into booking_stage_transitions (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role)
  values (gen_random_uuid(), $1, $2, 'Quote', 'Booked', $3, 'Owner');
`, [b3Id, branchId, actorId])

const res3 = await db.query(`
  select * from inventory_reservations where booking_id = $1 and asset_id = $2 and released_at is null;
`, [b3Id, fx3.unit_id])

if (res3.rows.length !== 1) {
  console.error('FAIL: Expected 1 active inventory_reservation for Booking C, got', res3.rows.length)
  process.exit(1)
}
console.log('✓ Non-overlapping reservation for Booking C succeeded without clash.')

console.log('\nALL AUD-020 CINEMA SERIALIZED ASSETS TESTS PASSED!')

