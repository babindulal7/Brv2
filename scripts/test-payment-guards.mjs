#!/usr/bin/env node
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

console.log('Testing AUD-006 Payment Validation Guards & Payment Ceiling...')

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

const clientsRes = await db.query(`select id from clients order by created_at limit 2;`)
const clientId = clientsRes.rows[0]?.id
const otherClientId = clientsRes.rows[1]?.id

const ownerId = '00000000-0000-0000-0000-000000000101'
await db.query(`
  insert into users (id, client_uuid, employee_code, email, full_name, mobile, primary_role, branch_id, is_active, created_by)
  values ($1, gen_random_uuid(), 'EMP-Owner', 'owner@babinrentals.com', 'Owner', '+977-9800000000', 'Owner', $2, true, $1)
  on conflict (id) do update set primary_role = 'Owner';
`, [ownerId, branchId])

const prodRes = await db.query(`select id from products limit 1;`)
const productId = prodRes.rows[0]?.id

// Set session user to Owner
await db.exec(`select set_config('app.current_user_id', '${ownerId}', false);`)

// 4. Create primary test booking: 1 unit, 2 days @ 2500 = 5000 + 13% VAT (650) = 5650
const b1Res = await db.query(`
  insert into bookings (
    client_uuid, booking_no, client_id, branch_id, stage,
    pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by
  ) values (
    gen_random_uuid(), '990201', $1, $2, 'Quote',
    '2026-11-05 10:00:00+00', '2026-11-07 10:00:00+00', 'Client Pickup', 0, $3, $3
  ) returning id;
`, [clientId, branchId, ownerId])
const bookingId = b1Res.rows[0].id

await db.query(`
  insert into booking_lines (
    client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by
  ) values (
    gen_random_uuid(), $1, 'Equipment', $2, 'Camera Body', 1, 2, 2500, $3
  );
`, [bookingId, productId, ownerId])

// Create second booking for other client
const b2Res = await db.query(`
  insert into bookings (
    client_uuid, booking_no, client_id, branch_id, stage,
    pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by
  ) values (
    gen_random_uuid(), '990202', $1, $2, 'Quote',
    '2026-11-05 10:00:00+00', '2026-11-07 10:00:00+00', 'Client Pickup', 0, $3, $3
  ) returning id;
`, [otherClientId, branchId, ownerId])
const otherBookingId = b2Res.rows[0].id

// Create active invoice for primary booking: outstanding = 5650
const invRes = await db.query(`
  insert into invoices (
    client_uuid, invoice_no, issue_date, due_date, booking_id, client_id, branch_id, status,
    subtotal, discount_amount, taxable_amount, vat_amount, total_amount,
    paid_amount, outstanding_amount, created_by
  ) values (
    gen_random_uuid(), 'INV-990201', CURRENT_DATE, CURRENT_DATE + 7, $1, $2, $3, 'Sent',
    5000, 0, 5000, 650, 5650, 0, 5650, $4
  ) returning id;
`, [bookingId, clientId, branchId, ownerId])
const invoiceId = invRes.rows[0].id

// Create void invoice
const voidInvRes = await db.query(`
  insert into invoices (
    client_uuid, invoice_no, issue_date, due_date, booking_id, client_id, branch_id, status,
    subtotal, discount_amount, taxable_amount, vat_amount, total_amount,
    paid_amount, outstanding_amount, created_by
  ) values (
    gen_random_uuid(), 'INV-990202', CURRENT_DATE, CURRENT_DATE + 7, $1, $2, $3, 'Void',
    5000, 0, 5000, 650, 5650, 0, 0, $4
  ) returning id;
`, [bookingId, clientId, branchId, ownerId])
const voidInvoiceId = voidInvRes.rows[0].id

// ---------------------------------------------------------------------------
// Probe 1: Negative payment rejected
// ---------------------------------------------------------------------------
try {
  await db.query(`
    insert into payments (
      client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id,
      amount, payment_type, payment_date, received_by
    ) values (
      gen_random_uuid(), 'PAY-990201', $1, $2, $3, $4, -100, 'Advance Payment', now(), $5
    );
  `, [bookingId, invoiceId, clientId, branchId, ownerId])
  throw new Error('Probe 1 failed: negative payment was accepted')
} catch (err) {
  if (!err.message.includes('payments_amount_positive')) {
    throw err
  }
  console.log('✓ Probe 1: Negative payment rejected by payments_amount_positive constraint')
}

// ---------------------------------------------------------------------------
// Probe 2: Zero payment rejected
// ---------------------------------------------------------------------------
try {
  await db.query(`
    insert into payments (
      client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id,
      amount, payment_type, payment_date, received_by
    ) values (
      gen_random_uuid(), 'PAY-990202', $1, $2, $3, $4, 0, 'Advance Payment', now(), $5
    );
  `, [bookingId, invoiceId, clientId, branchId, ownerId])
  throw new Error('Probe 2 failed: zero payment was accepted')
} catch (err) {
  if (!err.message.includes('payments_amount_positive')) {
    throw err
  }
  console.log('✓ Probe 2: Zero payment rejected by payments_amount_positive constraint')
}

// ---------------------------------------------------------------------------
// Probe 3: Client mismatch on booking
// ---------------------------------------------------------------------------
try {
  await db.query(`
    insert into payments (
      client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id,
      amount, payment_type, payment_date, received_by
    ) values (
      gen_random_uuid(), 'PAY-990203', $1, $2, $3, $4, 1000, 'Advance Payment', now(), $5
    );
  `, [bookingId, invoiceId, otherClientId, branchId, ownerId])
  throw new Error('Probe 3 failed: client mismatch payment was accepted')
} catch (err) {
  if (!err.message.includes('gate.payment.client_mismatch') && !err.message.includes('does not match booking client')) {
    throw err
  }
  console.log('✓ Probe 3: Client mismatch on booking rejected (gate.payment.client_mismatch)')
}

// ---------------------------------------------------------------------------
// Probe 4: Booking mismatch on invoice
// ---------------------------------------------------------------------------
try {
  await db.query(`
    insert into payments (
      client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id,
      amount, payment_type, payment_date, received_by
    ) values (
      gen_random_uuid(), 'PAY-990204', $1, $2, $3, $4, 1000, 'Advance Payment', now(), $5
    );
  `, [otherBookingId, invoiceId, otherClientId, branchId, ownerId])
  throw new Error('Probe 4 failed: booking mismatch payment was accepted')
} catch (err) {
  if (!err.message.includes('gate.payment.client_mismatch') && !err.message.includes('belongs to booking')) {
    throw err
  }
  console.log('✓ Probe 4: Booking mismatch on invoice rejected (gate.payment.client_mismatch)')
}

// ---------------------------------------------------------------------------
// Probe 5: Payment against Void invoice rejected
// ---------------------------------------------------------------------------
try {
  await db.query(`
    insert into payments (
      client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id,
      amount, payment_type, payment_date, received_by
    ) values (
      gen_random_uuid(), 'PAY-990205', $1, $2, $3, $4, 1000, 'Advance Payment', now(), $5
    );
  `, [bookingId, voidInvoiceId, clientId, branchId, ownerId])
  throw new Error('Probe 5 failed: payment against void invoice was accepted')
} catch (err) {
  if (!err.message.includes('gate.payment.over_invoice') && !err.message.includes('invoice is void')) {
    throw err
  }
  console.log('✓ Probe 5: Payment against void invoice rejected (gate.payment.over_invoice)')
}

// ---------------------------------------------------------------------------
// Probe 6: Payment exceeding invoice outstanding amount (5,650)
// ---------------------------------------------------------------------------
try {
  await db.query(`
    insert into payments (
      client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id,
      amount, payment_type, payment_date, received_by
    ) values (
      gen_random_uuid(), 'PAY-990206', $1, $2, $3, $4, 6000, 'Advance Payment', now(), $5
    );
  `, [bookingId, invoiceId, clientId, branchId, ownerId])
  throw new Error('Probe 6 failed: payment exceeding invoice outstanding was accepted')
} catch (err) {
  if (!err.message.includes('gate.payment.over_invoice') && !err.message.includes('exceeds invoice outstanding amount')) {
    throw err
  }
  console.log('✓ Probe 6: Payment exceeding invoice outstanding rejected (gate.payment.over_invoice)')
}

// ---------------------------------------------------------------------------
// Probe 7: Payment without invoice exceeding booking estimate (5,650)
// ---------------------------------------------------------------------------
try {
  await db.query(`
    insert into payments (
      client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id,
      amount, payment_type, payment_date, received_by
    ) values (
      gen_random_uuid(), 'PAY-990207', $1, null, $2, $3, 7000, 'Advance Payment', now(), $4
    );
  `, [bookingId, clientId, branchId, ownerId])
  throw new Error('Probe 7 failed: payment exceeding booking estimate was accepted')
} catch (err) {
  if (!err.message.includes('gate.payment.over_booking')) {
    throw err
  }
  console.log('✓ Probe 7: Payment without invoice exceeding booking estimate rejected (gate.payment.over_booking)')
}

// ---------------------------------------------------------------------------
// Probe 8: Valid payments within ceiling settle invoice
// ---------------------------------------------------------------------------
await db.query(`
  insert into payments (
    client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id,
    amount, payment_type, payment_date, received_by
  ) values (
    gen_random_uuid(), 'PAY-990208', $1, $2, $3, $4, 3000, 'Advance Payment', now(), $5
  );
`, [bookingId, invoiceId, clientId, branchId, ownerId])

await db.query(`
  insert into payments (
    client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id,
    amount, payment_type, payment_date, received_by
  ) values (
    gen_random_uuid(), 'PAY-990209', $1, $2, $3, $4, 2650, 'Advance Payment', now(), $5
  );
`, [bookingId, invoiceId, clientId, branchId, ownerId])

const settledInv = await db.query(`select status, outstanding_amount, paid_amount from invoices where id = $1;`, [invoiceId])
if (settledInv.rows[0].status !== 'Paid' || Number(settledInv.rows[0].outstanding_amount) !== 0 || Number(settledInv.rows[0].paid_amount) !== 5650) {
  throw new Error(`Probe 8 failed: invoice not settled to Paid. Got: ${JSON.stringify(settledInv.rows[0])}`)
}
console.log('✓ Probe 8: Valid payments settled invoice to Paid with 0 outstanding amount')

console.log('\n✅ All AUD-006 Payment Validation Guards & Ceiling passed successfully!')
await db.close()
