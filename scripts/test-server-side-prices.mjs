import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

const SUPABASE_URL = 'https://sxguwvgoserhdolewibb.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4Z3V3dmdvc2VyaGRvbGV3aWJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNTk3OTksImV4cCI6MjA5MzgzNTc5OX0.1KX30S4B78yKO4l2bG-hhgQVflr4REAUISTa2B1YY3I'

// N-8: credentials never live in the repo. Run with:
//   $env:BABIN_STAFF_TEST_PASSWORD = '...'
const STAFF_PASSWORD = process.env.BABIN_STAFF_TEST_PASSWORD
if (!STAFF_PASSWORD) {
  console.error('Set BABIN_STAFF_TEST_PASSWORD to run this check.')
  process.exit(1)
}

async function run() {
  console.log('Testing AUD-004 Server-Side Price Lookup on Live...\n')

  const warehouseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Sign in as warehouse@babinrentals.com
  const { data: authData, error: authError } = await warehouseClient.auth.signInWithPassword({
    email: 'warehouse@babinrentals.com',
    password: STAFF_PASSWORD,
  })
  if (authError || !authData.session) {
    throw new Error(`Failed to sign in as warehouse: ${authError?.message}`)
  }
  console.log('1. Signed in as warehouse@babinrentals.com')

  // 2. Verify role and money permissions
  const { data: role } = await warehouseClient.rpc('auth_user_role')
  const { data: canViewMoney } = await warehouseClient.rpc('auth_can_view_money')
  console.log(`2. auth_user_role(): ${role}, auth_can_view_money(): ${canViewMoney}`)
  if (canViewMoney !== false) {
    throw new Error(`Expected auth_can_view_money to be false for Warehouse, got ${canViewMoney}`)
  }

  // 3. Create booking with tampered rate: rate = 1.00 instead of 2000.00
  const bookingClientUuid = crypto.randomUUID()
  const lineClientUuid = crypto.randomUUID()
  const payload = {
    client_uuid: bookingClientUuid,
    branch_id: '00000000-0000-0000-0000-000000000001',
    client_id: '20000000-0000-0000-0000-000000000064',
    created_by: '00000000-0000-0000-0000-000000000103',
    project: 'AUD-004 Price Verification Test',
    pickup_at: '2026-11-20T10:00:00Z',
    return_at: '2026-11-21T10:00:00Z',
    delivery_type: 'Client Pickup',
    lines: [
      {
        client_uuid: lineClientUuid,
        product_id: '10000000-0000-0000-0000-000000000008',
        line_type: 'Equipment',
        description: '7Artisans 37mm Lens (AUD-004 test)',
        qty: 1,
        days: 1,
        rate: 1.0, // Modified / tampered rate! Catalog rate is 2000.00
      },
    ],
  }

  const { data: bookingResult, error: bookingError } = await warehouseClient.rpc('create_booking', {
    p_payload: payload,
  })
  if (bookingError) {
    throw new Error(`create_booking failed: ${bookingError.message}`)
  }

  const bookingId = bookingResult?.id
  const bookingNo = bookingResult?.booking_no
  console.log(`3. Booking created successfully: ${bookingNo} (id: ${bookingId})`)

  // 4. Check that direct insert with rate is BLOCKED for warehouse caller outside create_booking
  const directInsertUuid = crypto.randomUUID()
  const { error: directInsertError } = await warehouseClient.from('booking_lines').insert({
    client_uuid: directInsertUuid,
    booking_id: bookingId,
    line_type: 'Equipment',
    product_id: '10000000-0000-0000-0000-000000000008',
    description: 'Direct insert attempt with money figure',
    qty: 1,
    days: 1,
    rate: 500, // Non-zero rate
  })

  if (!directInsertError) {
    throw new Error('Expected direct insert on booking_lines with rate > 0 to be blocked by guard_booking_lines_money_blind()!')
  }
  console.log(`4. Direct insert blocked as expected: ${directInsertError.message}`)

  // Output details for SQL verification
  console.log(JSON.stringify({ bookingId, lineClientUuid }))
}

run().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
