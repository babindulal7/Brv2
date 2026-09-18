#!/usr/bin/env node
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

console.log('Testing AUD-017 Universal Audit Trigger across bookings, invoices, and payments...')

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

// 3. Resolve seeded fixtures
const branchRes = await db.query(`select id from branches order by created_at limit 1;`)
const branchId = branchRes.rows[0]?.id

const clientsRes = await db.query(`select id from clients order by created_at limit 1;`)
const clientId = clientsRes.rows[0]?.id

const coordinatorId = '00000000-0000-0000-0000-000000000201'
await db.query(`
  insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  values ($1, gen_random_uuid(), 'EMP-Coord', 'coordinator@babinrentals.com', 'Coordinator', '+977-9800000001', 'Coordinator', $2, true, $1)
  on conflict (id) do update set primary_role = 'Coordinator';
`, [coordinatorId, branchId])

// Set session user to Coordinator
await db.exec(`select set_config('app.current_user_id', '${coordinatorId}', false);`)

// 4. Test Direct INSERT on bookings -> verify audit_events
const bRes = await db.query(`
  insert into bookings (
    client_uuid, booking_no, client_id, branch_id, stage,
    pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by, project
  ) values (
    gen_random_uuid(), '990301', $1, $2, 'Quote',
    '2026-10-01 10:00:00+05:45', '2026-10-03 18:00:00+05:45', 'Client Pickup', 0, $3, $3, 'Initial Feature Film'
  ) returning id;
`, [clientId, branchId, coordinatorId])
const bookingId = bRes.rows[0].id

const auditInsertBooking = await db.query(`
  select * from audit_events
  where table_name = 'bookings' and record_id = $1 and action = 'Create'
`, [bookingId])

if (auditInsertBooking.rows.length !== 1) {
  console.error('FAIL: Expected 1 Create audit_event for booking insert, got', auditInsertBooking.rows.length)
  process.exit(1)
}
console.log('✓ Booking insert generated Create audit_event row.')

// 5. Test Direct UPDATE on bookings -> verify audit_events
await db.query(`
  update bookings
  set project = 'Updated Documentary Project'
  where id = $1;
`, [bookingId])

const auditUpdateBooking = await db.query(`
  select * from audit_events
  where table_name = 'bookings' and record_id = $1 and action = 'Update'
  order by created_at desc limit 1;
`, [bookingId])

if (auditUpdateBooking.rows.length !== 1) {
  console.error('FAIL: Expected 1 Update audit_event for booking update, got', auditUpdateBooking.rows.length)
  process.exit(1)
}

const updateRow = auditUpdateBooking.rows[0]
if (updateRow.old_values?.project !== 'Initial Feature Film' || updateRow.new_values?.project !== 'Updated Documentary Project') {
  console.error('FAIL: Old/New values did not capture project change:', updateRow.old_values?.project, '->', updateRow.new_values?.project)
  process.exit(1)
}
console.log('✓ Direct UPDATE on bookings generated Update audit_event with captured old/new values.')

const auditLogsViewRes = await db.query(`
  select * from audit_logs
  where table_name = 'bookings' and record_id = $1 and action = 'Update'
  order by created_at desc limit 1;
`, [bookingId])

if (auditLogsViewRes.rows.length !== 1 || auditLogsViewRes.rows[0].id !== updateRow.id) {
  console.error('FAIL: audit_logs view failed to return matching audit record!')
  process.exit(1)
}
console.log('✓ audit_logs compatibility view resolved matching audit row seamlessly.')

const accountsId = '00000000-0000-0000-0000-000000000301'
await db.query(`
  insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  values ($1, gen_random_uuid(), 'EMP-Acct', 'accounts@babinrentals.com', 'Accounts User', '+977-9800000002', 'Accounts', $2, true, $1)
  on conflict (id) do update set primary_role = 'Accounts';
`, [accountsId, branchId])

await db.exec(`select set_config('app.current_user_id', '${accountsId}', false);`)

// 6. Test Direct INSERT on invoices -> verify audit_events
const invRes = await db.query(`
  insert into invoices (
    client_uuid, invoice_no, booking_id, client_id, branch_id,
    issue_date, due_date, subtotal, discount_amount, taxable_amount, vat_amount, total_amount, outstanding_amount,
    status, created_by, updated_by
  ) values (
    gen_random_uuid(), 'INV-990301', $1, $2, $3,
    '2026-10-01', '2026-10-10', 10000, 0, 10000, 1300, 11300, 11300,
    'Sent', $4, $4
  ) returning id;
`, [bookingId, clientId, branchId, accountsId])
const invoiceId = invRes.rows[0].id

const auditInsertInvoice = await db.query(`
  select * from audit_events
  where table_name = 'invoices' and record_id = $1 and action = 'Create'
`, [invoiceId])

if (auditInsertInvoice.rows.length !== 1) {
  console.error('FAIL: Expected 1 Create audit_event for invoice insert, got', auditInsertInvoice.rows.length)
  process.exit(1)
}
console.log('✓ Invoice insert generated Create audit_event row.')

// 7. Test Direct INSERT on payments -> verify audit_events
const payRes = await db.query(`
  insert into payments (
    client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id,
    amount, payment_type, status, received_by
  ) values (
    gen_random_uuid(), 'PAY-990301', $1, $2, $3, $4,
    5000, 'Advance Payment', 'Received', $5
  ) returning id;
`, [bookingId, invoiceId, clientId, branchId, accountsId])
const paymentId = payRes.rows[0].id

const auditInsertPayment = await db.query(`
  select * from audit_events
  where table_name = 'payments' and record_id = $1 and action = 'Create'
`, [paymentId])

if (auditInsertPayment.rows.length !== 1) {
  console.error('FAIL: Expected 1 Create audit_event for payment insert, got', auditInsertPayment.rows.length)
  process.exit(1)
}
console.log('✓ Payment insert generated Create audit_event row.')

// 8. Verify Law 3 / Law 4: audit_events cannot be modified or deleted
let updateRefused = false
try {
  await db.query(`update audit_events set reason = 'tampered' where id = $1`, [updateRow.id])
} catch {
  updateRefused = true
}

if (!updateRefused) {
  console.error('FAIL: audit_events UPDATE was not refused!')
  process.exit(1)
}
console.log('✓ audit_events UPDATE strictly refused by Law 4 immutability trigger.')

let deleteRefused = false
try {
  await db.query(`delete from audit_events where id = $1`, [updateRow.id])
} catch {
  deleteRefused = true
}

if (!deleteRefused) {
  console.error('FAIL: audit_events DELETE was not refused!')
  process.exit(1)
}
console.log('✓ audit_events DELETE strictly refused by Law 3 / Law 4 triggers.')

console.log('\nALL AUD-017 UNIVERSAL AUDIT TRIGGER TESTS PASSED!')
