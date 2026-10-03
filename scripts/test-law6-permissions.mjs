import { createClient } from '@supabase/supabase-js'

import { readFileSync, existsSync } from 'node:fs'

function readEnv(files = ['.env.local', '.env']) {
  for (const f of files) {
    if (!existsSync(f)) continue
    const out = {}
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
    if (out.VITE_SUPABASE_URL || out.VITE_SUPABASE_ANON_KEY) return out
  }
  return {}
}

const env = readEnv()
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || 'https://sxguwvgoserhdolewibb.supabase.co'
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_ANON_KEY) {
  console.error('Set VITE_SUPABASE_ANON_KEY or configure .env.local to run this check.')
  process.exit(1)
}

// N-8: credentials never live in the repo. Run with:
//   $env:BABIN_STAFF_TEST_PASSWORD = '...'
const STAFF_PASSWORD = process.env.BABIN_STAFF_TEST_PASSWORD
if (!STAFF_PASSWORD) {
  console.error('Set BABIN_STAFF_TEST_PASSWORD to run this check.')
  process.exit(1)
}

async function run() {
  console.log('Testing Law 6 & Permissions on Live Supabase...\n')

  const warehouseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Sign in as warehouse
  const { error: whAuthErr } = await warehouseClient.auth.signInWithPassword({
    email: 'warehouse@babinrentals.com',
    password: STAFF_PASSWORD,
  })
  if (whAuthErr) throw new Error(`Warehouse sign-in failed: ${whAuthErr.message}`)

  console.log('1. Warehouse signed in.')

  // Probe 1: products_v returns NULL for money columns
  const { data: prodV, error: prodVErr } = await warehouseClient
    .from('products_v')
    .select('id, name, daily_rate, purchase_price')
    .limit(1)

  if (prodVErr) throw new Error(`products_v query failed: ${prodVErr.message}`)
  if (prodV && prodV.length > 0) {
    if (prodV[0].daily_rate !== null || prodV[0].purchase_price !== null) {
      throw new Error(`LEAK: products_v revealed money to Warehouse! daily_rate=${prodV[0].daily_rate}`)
    }
    console.log(`✅ [PASS] products_v masks daily_rate and purchase_price to null for Warehouse (${prodV[0].name})`)
  }

  // Probe 2: booking_lines_v returns NULL for rate
  const { data: linesV, error: linesVErr } = await warehouseClient
    .from('booking_lines_v')
    .select('id, description, rate, discount_amount')
    .limit(1)

  if (linesVErr) throw new Error(`booking_lines_v query failed: ${linesVErr.message}`)
  if (linesV && linesV.length > 0) {
    if (linesV[0].rate !== null || linesV[0].discount_amount !== null) {
      throw new Error(`LEAK: booking_lines_v revealed rate to Warehouse! rate=${linesV[0].rate}`)
    }
    console.log(`✅ [PASS] booking_lines_v masks rate and discount_amount to null for Warehouse`)
  }

  // Probe 3: bookings_deposit_v returns NULL for deposit_required
  const { data: depV, error: depVErr } = await warehouseClient
    .from('bookings_deposit_v')
    .select('id, deposit_required')
    .limit(1)

  if (depVErr) throw new Error(`bookings_deposit_v query failed: ${depVErr.message}`)
  if (depV && depV.length > 0) {
    if (depV[0].deposit_required !== null) {
      throw new Error(`LEAK: bookings_deposit_v revealed deposit to Warehouse! deposit=${depV[0].deposit_required}`)
    }
    console.log(`✅ [PASS] bookings_deposit_v masks deposit_required to null for Warehouse`)
  }

  // Probe 4: Base table products daily_rate is rejected (42501)
  const { data: rawProd, error: rawProdErr } = await warehouseClient
    .from('products')
    .select('daily_rate')
    .limit(1)

  if (!rawProdErr) {
    throw new Error(`LEAK: Direct select on products.daily_rate succeeded! Returned: ${JSON.stringify(rawProd)}`)
  }
  console.log(`✅ [PASS] Direct select on products.daily_rate strictly denied: ${rawProdErr.message}`)

  // Probe 5: Base table bookings deposit_required is rejected (42501)
  const { data: rawBk, error: rawBkErr } = await warehouseClient
    .from('bookings')
    .select('deposit_required')
    .limit(1)

  if (!rawBkErr) {
    throw new Error(`LEAK: Direct select on bookings.deposit_required succeeded! Returned: ${JSON.stringify(rawBk)}`)
  }
  console.log(`✅ [PASS] Direct select on bookings.deposit_required strictly denied: ${rawBkErr.message}`)

  // Probe 6: Invoices & Payments return 0 rows
  const { data: invData, error: invErr } = await warehouseClient
    .from('invoices')
    .select('id, invoice_no, total_amount')

  if (invErr) {
    console.log(`✅ [PASS] Direct select on invoices denied: ${invErr.message}`)
  } else if (invData.length === 0) {
    console.log(`✅ [PASS] Invoices table returns 0 rows for Warehouse via RLS`)
  } else {
    throw new Error(`LEAK: Warehouse was able to read ${invData.length} invoices!`)
  }

  // Probe 7: Now sign in as Owner and verify Owner CAN see money
  const ownerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error: ownerAuthErr } = await ownerClient.auth.signInWithPassword({
    email: 'owner@babinrentals.com',
    password: STAFF_PASSWORD,
  })
  if (ownerAuthErr) throw new Error(`Owner sign-in failed: ${ownerAuthErr.message}`)

  const { data: ownerProd, error: ownerProdErr } = await ownerClient
    .from('products_v')
    .select('id, name, daily_rate')
    .not('daily_rate', 'is', null)
    .limit(1)

  if (ownerProdErr) throw new Error(`Owner products_v query failed: ${ownerProdErr.message}`)
  if (ownerProd && ownerProd.length > 0) {
    if (ownerProd[0].daily_rate === null) {
      throw new Error(`Owner daily_rate unexpectedly null!`)
    }
    console.log(`✅ [PASS] Owner sees daily_rate on products_v: ${ownerProd[0].daily_rate} NPR (${ownerProd[0].name})`)
  }

  console.log('\nAll Law 6 permissions and column-level masking checks PASSED on live Supabase!')
}

run().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
