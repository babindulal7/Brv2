#!/usr/bin/env node
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

console.log('Testing AUD-005 Close Gate & Reopen Invariants...')

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

// 3. Resolve or insert seeded fixtures
const branchRes = await db.query(`select id from branches order by created_at limit 1;`)
const branchId = branchRes.rows[0]?.id

const clientRes = await db.query(`select id from clients order by created_at limit 1;`)
const clientId = clientRes.rows[0]?.id

const ownerId = '00000000-0000-0000-0000-000000000101'
const managerId = '00000000-0000-0000-0000-000000000102'
const whId = '00000000-0000-0000-0000-000000000103'

for (const [id, role, email, name] of [
  [ownerId, 'Owner', 'owner@babinrentals.com', 'Owner'],
  [managerId, 'Manager', 'manager@babinrentals.com', 'Manager'],
  [whId, 'Warehouse', 'warehouse@babinrentals.com', 'Warehouse'],
]) {
  await db.query(`
    insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
    values ($1, gen_random_uuid(), $2, $3, $4, '+977-9800000000', $5, $6, true, $1)
    on conflict (id) do update set primary_role = $5;
  `, [id, `EMP-${role}`, email, name, role, branchId])
}

const prodRes = await db.query(`select id from products limit 1;`)
const productId = prodRes.rows[0]?.id

// Set session user to Owner
await db.exec(`select set_config('app.current_user_id', '${ownerId}', false);`)

// 4. Create a test booking at 'Returned' stage
const bRes = await db.query(`
  insert into bookings (
    client_uuid, booking_no, client_id, branch_id, stage,
    pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by
  ) values (
    gen_random_uuid(), '990101', $1, $2, 'Returned',
    '2026-11-01 10:00:00+00', '2026-11-03 10:00:00+00', 'Client Pickup', 0, $3, $3
  ) returning id;
`, [clientId, branchId, ownerId])
const bookingId = bRes.rows[0].id

const lineRes = await db.query(`
  insert into booking_lines (
    client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by
  ) values (
    gen_random_uuid(), $1, 'Equipment', $2, 'Test Product', 1, 2, 2500, $3
  ) returning id;
`, [bookingId, productId, ownerId])
const lineId = lineRes.rows[0].id

// ---------------------------------------------------------------------------
// Probe 1: Gate 5a — No invoice exists
// ---------------------------------------------------------------------------
try {
  await db.query(`
    insert into booking_stage_transitions (
      client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at
    ) values (
      gen_random_uuid(), $1, $2, 'Returned', 'Closed', $3, 'Owner', now()
    );
  `, [bookingId, branchId, ownerId])
  throw new Error('Probe 1 failed: close succeeded without invoice')
} catch (err) {
  if (!err.message.includes('GATE:gate.close.no_invoice')) {
    throw err
  }
  console.log('✓ Probe 1: Closed without invoice rejected (gate.close.no_invoice)')
}

// ---------------------------------------------------------------------------
// Probe 2: Gate 5b — Unsettled invoice exists (outstanding_amount > 0)
// ---------------------------------------------------------------------------
const invRes = await db.query(`
  insert into invoices (
    client_uuid, invoice_no, issue_date, due_date, booking_id, client_id, branch_id, status,
    subtotal, discount_amount, taxable_amount, vat_amount, total_amount,
    paid_amount, outstanding_amount, created_by
  ) values (
    gen_random_uuid(), 'INV-990101', CURRENT_DATE, CURRENT_DATE + 7, $1, $2, $3, 'Sent',
    5000, 0, 5000, 650, 5650, 0, 5650, $4
  ) returning id;
`, [bookingId, clientId, branchId, ownerId])
const invoiceId = invRes.rows[0].id

try {
  await db.query(`
    insert into booking_stage_transitions (
      client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at
    ) values (
      gen_random_uuid(), $1, $2, 'Returned', 'Closed', $3, 'Owner', now()
    );
  `, [bookingId, branchId, ownerId])
  throw new Error('Probe 2 failed: close succeeded with unsettled invoice')
} catch (err) {
  if (!err.message.includes('GATE:gate.close.invoice_unsettled')) {
    throw err
  }
  console.log('✓ Probe 2: Closed with unsettled invoice rejected (gate.close.invoice_unsettled)')
}

// Settle invoice
await db.query(`update invoices set status = 'Paid', paid_amount = 5650, outstanding_amount = 0 where id = $1`, [invoiceId])

// ---------------------------------------------------------------------------
// Probe 3: Gate 5c — Unresolved security deposit
// ---------------------------------------------------------------------------
await db.query(`update bookings set deposit_required = 10000 where id = $1`, [bookingId])

try {
  await db.query(`
    insert into booking_stage_transitions (
      client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at
    ) values (
      gen_random_uuid(), $1, $2, 'Returned', 'Closed', $3, 'Owner', now()
    );
  `, [bookingId, branchId, ownerId])
  throw new Error('Probe 3 failed: close succeeded with missing deposit record')
} catch (err) {
  if (!err.message.includes('GATE:gate.close.deposit_unresolved')) {
    throw err
  }
  console.log('✓ Probe 3a: Closed with missing deposit row rejected (gate.close.deposit_unresolved)')
}

await db.query(`
  insert into security_deposits (
    client_uuid, deposit_no, booking_id, client_id, branch_id, required_amount,
    received_amount, refunded_amount, applied_amount, pending_amount, created_by
  ) values (
    gen_random_uuid(), 'DEP-990101', $1, $2, $3, 10000,
    10000, 0, 0, 0, $4
  );
`, [bookingId, clientId, branchId, ownerId])

try {
  await db.query(`
    insert into booking_stage_transitions (
      client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at
    ) values (
      gen_random_uuid(), $1, $2, 'Returned', 'Closed', $3, 'Owner', now()
    );
  `, [bookingId, branchId, ownerId])
  throw new Error('Probe 3b failed: close succeeded with unrefunded deposit')
} catch (err) {
  if (!err.message.includes('GATE:gate.close.deposit_unresolved')) {
    throw err
  }
  console.log('✓ Probe 3b: Closed with unrefunded deposit rejected (gate.close.deposit_unresolved)')
}

// Resolve deposit
await db.query(`update security_deposits set refunded_amount = 10000 where booking_id = $1`, [bookingId])

// ---------------------------------------------------------------------------
// Probe 4: Gate 5d — Open case exists
// ---------------------------------------------------------------------------
const caseRes = await db.query(`
  insert into cases (
    client_uuid, case_no, title, linked_booking_id, owner_id,
    type, status, priority, counterparty_kind, counterparty_name, created_by
  ) values (
    gen_random_uuid(), 'CASE-2026-9901', 'Test damage case',
    $1, $2, 'Damage', 'Open', 'High', 'Client', 'Test Client', $2
  ) returning id;
`, [bookingId, ownerId])
const caseId = caseRes.rows[0].id

try {
  await db.query(`
    insert into booking_stage_transitions (
      client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at
    ) values (
      gen_random_uuid(), $1, $2, 'Returned', 'Closed', $3, 'Owner', now()
    );
  `, [bookingId, branchId, ownerId])
  throw new Error('Probe 4 failed: close succeeded with open case')
} catch (err) {
  if (!err.message.includes('GATE:gate.close.open_case')) {
    throw err
  }
  console.log('✓ Probe 4: Closed with open case rejected (gate.close.open_case)')
}

// Resolve case
await db.query(`update cases set status = 'Resolved', settled_at = now() where id = $1`, [caseId])

// ---------------------------------------------------------------------------
// Probe 5: Gate 5e — Live inventory reservation exists
// ---------------------------------------------------------------------------
const resHold = await db.query(`
  insert into inventory_reservations (
    client_uuid, booking_id, booking_line_id, product_id,
    period, qty, created_by
  ) values (
    gen_random_uuid(), $1, $2, $3,
    tstzrange('2026-11-01 10:00:00+00', '2026-11-03 10:00:00+00', '[)'), 1, $4
  ) returning id;
`, [bookingId, lineId, productId, ownerId])
const resId = resHold.rows[0].id

try {
  await db.query(`
    insert into booking_stage_transitions (
      client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at
    ) values (
      gen_random_uuid(), $1, $2, 'Returned', 'Closed', $3, 'Owner', now()
    );
  `, [bookingId, branchId, ownerId])
  throw new Error('Probe 5 failed: close succeeded with live reservation')
} catch (err) {
  if (!err.message.includes('GATE:gate.close.reservation_live')) {
    throw err
  }
  console.log('✓ Probe 5: Closed with live reservation rejected (gate.close.reservation_live)')
}

// Release reservation with mandatory reason
await db.query(`update inventory_reservations set released_at = now(), released_reason = 'Completed' where id = $1`, [resId])

// ---------------------------------------------------------------------------
// Probe 6: All gates pass — Successful transition to Closed
// ---------------------------------------------------------------------------
await db.query(`
  insert into booking_stage_transitions (
    client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at
  ) values (
    gen_random_uuid(), $1, $2, 'Returned', 'Closed', $3, 'Owner', now()
  );
`, [bookingId, branchId, ownerId])

const closedBooking = await db.query(`select stage, closed_at from bookings where id = $1`, [bookingId])
if (closedBooking.rows[0].stage !== 'Closed' || !closedBooking.rows[0].closed_at) {
  throw new Error('Probe 6 failed: booking not updated to Closed with closed_at set')
}
console.log('✓ Probe 6: Booking cleanly transitioned to Closed with closed_at timestamp')

// ---------------------------------------------------------------------------
// Probe 7: Reopen discipline (R-05)
// ---------------------------------------------------------------------------
// 7a: Non-manager cannot reopen
await db.exec(`select set_config('app.current_user_id', '${whId}', false);`)
try {
  await db.query(`
    insert into booking_stage_transitions (
      client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at, reason
    ) values (
      gen_random_uuid(), $1, $2, 'Closed', 'Returned', $3, 'Warehouse', now(),
      'Reopening to fix missing lens caps'
    );
  `, [bookingId, branchId, whId])
  throw new Error('Probe 7a failed: warehouse reopened closed booking')
} catch (err) {
  if (!err.message.includes('GATE:gate.reopen.role')) {
    throw err
  }
  console.log('✓ Probe 7a: Warehouse cannot reopen closed booking (gate.reopen.role)')
}

// 7b: Manager without reason cannot reopen
await db.exec(`select set_config('app.current_user_id', '${managerId}', false);`)
try {
  await db.query(`
    insert into booking_stage_transitions (
      client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at, reason
    ) values (
      gen_random_uuid(), $1, $2, 'Closed', 'Returned', $3, 'Manager', now(),
      'short'
    );
  `, [bookingId, branchId, managerId])
  throw new Error('Probe 7b failed: manager reopened with short reason')
} catch (err) {
  if (!err.message.includes('GATE:gate.reopen.reason_missing')) {
    throw err
  }
  console.log('✓ Probe 7b: Manager reopen without adequate reason rejected (gate.reopen.reason_missing)')
}

// 7c: Manager with valid reason CAN reopen
await db.query(`
  insert into booking_stage_transitions (
    client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at, reason
  ) values (
    gen_random_uuid(), $1, $2, 'Closed', 'Returned', $3, 'Manager', now(),
    'Valid reason: client returned extra item found on set'
  );
`, [bookingId, branchId, managerId])

const reopenedBooking = await db.query(`select stage, closed_at from bookings where id = $1`, [bookingId])
if (reopenedBooking.rows[0].stage !== 'Returned' || reopenedBooking.rows[0].closed_at !== null) {
  throw new Error('Probe 7c failed: booking not reset to Returned with closed_at cleared')
}
console.log('✓ Probe 7c: Manager cleanly reopened Closed -> Returned with closed_at cleared')

console.log('\n✅ All AUD-005 Close Gate & Reopen Invariants passed successfully!')
await db.close()
