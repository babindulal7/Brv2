import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://sxguwvgoserhdolewibb.supabase.co';
/* Environment only, like BOOQABLE_TOKEN below. Falls back to the anon key
   from .env.local for RLS-scoped runs.
   PowerShell:  $env:SUPABASE_SERVICE_ROLE_KEY="<key>" */
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY, value in .env.local) first. It is no longer stored in this file.');
  process.exit(1);
}

const BOOQABLE_SLUG = process.env.BOOQABLE_COMPANY || 'babin-rentals';
/*
 * The token is a SECRET and comes from the environment only. It was a literal
 * here and in three sibling scripts, which is how a live credential reached git
 * history. `booqable-cost-audit.mjs` already read it this way; these four were
 * the outliers. The slug above is not a secret, so it keeps its default.
 *
 *   PowerShell:  $env:BOOQABLE_TOKEN="<api token>"   # Booqable ▸ Settings ▸ Account
 */
const BOOQABLE_TOKEN = process.env.BOOQABLE_TOKEN;
if (!BOOQABLE_TOKEN) {
  console.error('Set BOOQABLE_TOKEN first (Booqable ▸ Settings ▸ Account). It is no longer stored in this file.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${BOOQABLE_TOKEN}`,
  Accept: 'application/json'
};

async function fetchBooqableResource(endpoint) {
  const url = `https://${BOOQABLE_SLUG}.booqable.com/api/4/${endpoint}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${endpoint}: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

async function main() {
  console.log('--- Starting Booqable 1-Way Direct Import Sync ---');
  
  // 1. Fetch products
  console.log('\n[1/5] Fetching Booqable Products...');
  const productsData = await fetchBooqableResource('products');
  console.log(`Found ${productsData.data?.length || 0} products in Booqable.`);

  // 2. Fetch stock items
  console.log('\n[2/5] Fetching Booqable Stock Items...');
  const stockData = await fetchBooqableResource('stock_items');
  console.log(`Found ${stockData.data?.length || 0} stock items in Booqable.`);

  // 3. Fetch customers / clients
  console.log('\n[3/5] Fetching Booqable Customers...');
  const clientsData = await fetchBooqableResource('customers');
  console.log(`Found ${clientsData.data?.length || 0} clients in Booqable.`);

  // 4. Fetch orders / bookings
  console.log('\n[4/5] Fetching Booqable Orders...');
  const ordersData = await fetchBooqableResource('orders');
  console.log(`Found ${ordersData.data?.length || 0} orders in Booqable.`);

  // 5. Fetch payments
  console.log('\n[5/5] Fetching Booqable Payments...');
  const paymentsData = await fetchBooqableResource('payments');
  console.log(`Found ${paymentsData.data?.length || 0} payments in Booqable.`);

  console.log('\n--- Fetch completed successfully! ---');
  console.log('Sample Product:', productsData.data[0]?.attributes?.name || productsData.data[0]?.id);
  console.log('Sample Customer:', clientsData.data[0]?.attributes?.name || clientsData.data[0]?.id);
  console.log('Sample Order:', ordersData.data[0]?.attributes?.number || ordersData.data[0]?.id);
}

main().catch(err => {
  console.error('Sync Error:', err);
  process.exit(1);
});
