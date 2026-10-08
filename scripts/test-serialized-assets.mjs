#!/usr/bin/env node
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

console.log('Testing AUD-020 Transition Key Cinema Assets to Serialized Mode...')

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

// 3. Verify that all 14 cinema products are 'Serialised' and have units
const cinemaCodes = [
  'EQ000066', 'EQ000128', 'EQ000129', 'EQ000130', 'EQ000189', 'EQ000191', 'EQ000192', 'EQ000193',
  'EQ000035', 'EQ000036', 'EQ000049', 'EQ000050', 'EQ000112', 'EQ000113'
]

for (const code of cinemaCodes) {
  const pRes = await db.query(`select id, name, tracking_mode, total_quantity from products where asset_code = $1;`, [code])
  if (pRes.rows.length === 0) {
    console.error(`FAIL: Product ${code} not found!`)
    process.exit(1)
  }
  const prod = pRes.rows[0]
  if (prod.tracking_mode !== 'Serialised') {
    console.error(`FAIL: Product ${code} tracking_mode is ${prod.tracking_mode}, expected 'Serialised'!`)
    process.exit(1)
  }

  const uRes = await db.query(`select count(*) as cnt from product_units where product_id = $1 and status <> 'Retired';`, [prod.id])
  const cnt = Number(uRes.rows[0].cnt)
  if (cnt < 2) {
    console.error(`FAIL: Product ${code} has ${cnt} units, expected at least 2!`)
    process.exit(1)
  }
  if (Number(prod.total_quantity) !== cnt) {
    console.error(`FAIL: Product ${code} total_quantity (${prod.total_quantity}) does not match unit count (${cnt})!`)
    process.exit(1)
  }
}
console.log(`✓ Verified all 14 cinema camera bodies and cinema lenses are 'Serialised' with active units.`)

// 4. Test Serialized Unit Reservation & Exclusion Constraint on RED KOMODO 6K (EQ000128)
const branchRes = await db.query(`select id from branches order by created_at limit 1;`)
const branchId = branchRes.rows[0].id

const clientRes = await db.query(`select id from clients order by created_at limit 1;`)
const clientId = clientRes.rows[0].id

const coordinatorId = '00000000-0000-0000-0000-000000000201'
await db.query(`
  insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  values ($1, gen_random_uuid(), 'EMP-Coord2', 'coord2@babinrentals.com', 'Coordinator Two', '+977-9800000003', 'Coordinator', $2, true, $1)
  on conflict (id) do update set primary_role = 'Coordinator';
`, [coordinatorId, branchId])

await db.exec(`select set_config('app.current_user_id', '${coordinatorId}', false);`)

const unitRes = await db.query(`
  select u.id, u.asset_tag, u.product_id
  from product_units u
  join products p on p.id = u.product_id
  where p.asset_code = 'EQ000128'
  order by u.asset_tag limit 1;
`)
const redUnit = unitRes.rows[0]
console.log(`Targeting cinema unit: ${redUnit.asset_tag} (${redUnit.id})`)

// Create Booking 1: 2026-11-01 10:00 to 2026-11-05 18:00
const b1Res = await db.query(`
  insert into bookings (
    client_uuid, booking_no, client_id, branch_id, stage,
    pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by, project
  ) values (
    gen_random_uuid(), '990401', $1, $2, 'Booked',
    '2026-11-01 10:00:00+05:45', '2026-11-05 18:00:00+05:45', 'Client Pickup', 0, $3, $3, 'Cinema Commercial 1'
  ) returning id;
`, [clientId, branchId, coordinatorId])
const b1Id = b1Res.rows[0].id

const line1Res = await db.query(`
  insert into booking_lines (
    client_uuid, booking_id, line_type, product_id, sort_order, qty, days, rate, created_by
  ) values (
    gen_random_uuid(), $1, 'Equipment', $2, 0, 1, 4, 15000, $3
  ) returning id;
`, [b1Id, redUnit.product_id, coordinatorId])
const line1Id = line1Res.rows[0].id

// Reserve unit for Booking 1
await db.query(`
  insert into inventory_reservations (
    client_uuid, booking_id, booking_line_id, asset_id, period, created_by
  ) values (
    gen_random_uuid(), $1, $2, $3,
    tstzrange('2026-11-01 10:00:00+05:45', '2026-11-05 18:00:00+05:45', '[)'),
    $4
  );
`, [b1Id, line1Id, redUnit.id, coordinatorId])
console.log(`✓ Booking 1 successfully reserved unit ${redUnit.asset_tag} for [2026-11-01 10:00, 2026-11-05 18:00).`)

// Create Booking 2: Overlapping period (2026-11-03 10:00 to 2026-11-07 18:00)
const b2Res = await db.query(`
  insert into bookings (
    client_uuid, booking_no, client_id, branch_id, stage,
    pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by, project
  ) values (
    gen_random_uuid(), '990402', $1, $2, 'Booked',
    '2026-11-03 10:00:00+05:45', '2026-11-07 18:00:00+05:45', 'Client Pickup', 0, $3, $3, 'Cinema Commercial 2'
  ) returning id;
`, [clientId, branchId, coordinatorId])
const b2Id = b2Res.rows[0].id

const line2Res = await db.query(`
  insert into booking_lines (
    client_uuid, booking_id, line_type, product_id, sort_order, qty, days, rate, created_by
  ) values (
    gen_random_uuid(), $1, 'Equipment', $2, 0, 1, 4, 15000, $3
  ) returning id;
`, [b2Id, redUnit.product_id, coordinatorId])
const line2Id = line2Res.rows[0].id

// 5. Attempt overlapping reservation on the SAME unit -> MUST FAIL with GiST exclusion
let overlapRefused = false
try {
  await db.query(`
    insert into inventory_reservations (
      client_uuid, booking_id, booking_line_id, asset_id, period, created_by
    ) values (
      gen_random_uuid(), $1, $2, $3,
      tstzrange('2026-11-03 10:00:00+05:45', '2026-11-07 18:00:00+05:45', '[)'),
      $4
    );
  `, [b2Id, line2Id, redUnit.id, coordinatorId])
} catch (err) {
  if (err.message.includes('inventory_reservations_no_double_booking') || err.message.includes('conflicting key value violates exclusion constraint')) {
    overlapRefused = true
  } else {
    console.error('Unexpected error on overlapping reservation:', err.message)
  }
}

if (!overlapRefused) {
  console.error('FAIL: Overlapping reservation on serialized cinema unit was NOT refused!')
  process.exit(1)
}
console.log('✓ Overlapping reservation on serialized unit was strictly refused by GiST exclusion constraint (inventory_reservations_no_double_booking).')

// 6. Test half-open turnaround: Booking 3 starts EXACTLY at return instant of Booking 1 (2026-11-05 18:00:00+05:45)
const b3Res = await db.query(`
  insert into bookings (
    client_uuid, booking_no, client_id, branch_id, stage,
    pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by, project
  ) values (
    gen_random_uuid(), '990403', $1, $2, 'Booked',
    '2026-11-05 18:00:00+05:45', '2026-11-08 18:00:00+05:45', 'Client Pickup', 0, $3, $3, 'Cinema Commercial 3'
  ) returning id;
`, [clientId, branchId, coordinatorId])
const b3Id = b3Res.rows[0].id

const line3Res = await db.query(`
  insert into booking_lines (
    client_uuid, booking_id, line_type, product_id, sort_order, qty, days, rate, created_by
  ) values (
    gen_random_uuid(), $1, 'Equipment', $2, 0, 1, 3, 15000, $3
  ) returning id;
`, [b3Id, redUnit.product_id, coordinatorId])
const line3Id = line3Res.rows[0].id

await db.query(`
  insert into inventory_reservations (
    client_uuid, booking_id, booking_line_id, asset_id, period, created_by
  ) values (
    gen_random_uuid(), $1, $2, $3,
    tstzrange('2026-11-05 18:00:00+05:45', '2026-11-08 18:00:00+05:45', '[)'),
    $4
  );
`, [b3Id, line3Id, redUnit.id, coordinatorId])
console.log(`✓ Back-to-back same-instant turnaround reservation [2026-11-05 18:00, 2026-11-08 18:00) on ${redUnit.asset_tag} was accepted (half-open range [)).`)

console.log('\nALL AUD-020 SERIALIZED ASSET TRANSITION TESTS PASSED!')
