import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://sxguwvgoserhdolewibb.supabase.co';
/* Environment only, like BOOQABLE_TOKEN below. Service role key for the direct
   bypass this sync needs, or the anon key from .env.local for RLS-scoped runs.
   PowerShell:  $env:SUPABASE_SERVICE_ROLE_KEY="<key>" */
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY, value in .env.local) first. It is no longer stored in this file.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BOOQABLE_SLUG = process.env.BOOQABLE_COMPANY || 'babin-rentals';
/* Secret: environment only. Was a literal here and in three sibling scripts,
   which put a live token in git history. Matches booqable-cost-audit.mjs.
   PowerShell:  $env:BOOQABLE_TOKEN="<api token>" */
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
  console.log('🚀 Executing Full Booqable -> Supabase Direct Database Import...\n');

  // 1. Fetch & Import Products
  console.log('[1/5] Syncing Products...');
  const productsRes = await fetchBooqableResource('products');
  const products = productsRes.data || [];
  console.log(`Fetched ${products.length} products from Booqable.`);

  let importedProducts = 0;
  for (const item of products) {
    const attrs = item.attributes || {};
    const extId = item.id;
    
    // Upsert into public.products
    const productPayload = {
      name: attrs.name || 'Untitled Product',
      brand: attrs.brand || 'Generic',
      model: attrs.sku || attrs.name || '',
      description: attrs.description || '',
      daily_rate: attrs.base_price_in_cents ? attrs.base_price_in_cents / 100 : 0,
      tracking_mode: attrs.trackable ? 'Serialised' : 'Quantity',
      total_quantity: attrs.quantity || 1,
      is_active: attrs.archived ? false : true,
      updated_at: new Date().toISOString()
    };

    // Check if external_refs already exists
    const { data: ref } = await supabase
      .from('external_refs')
      .select('local_id')
      .eq('provider', 'booqable')
      .eq('entity', 'products')
      .eq('external_id', extId)
      .maybeSingle();

    let localId;
    if (ref && ref.local_id) {
      localId = ref.local_id;
      await supabase.from('products').update(productPayload).eq('id', localId);
    } else {
      const { data: newProd, error } = await supabase.from('products').insert(productPayload).select('id').single();
      if (error) {
        console.warn(`Product insert warning for ${attrs.name}:`, error.message);
        continue;
      }
      localId = newProd.id;
      await supabase.from('external_refs').insert({
        provider: 'booqable',
        entity: 'products',
        external_id: extId,
        local_id: localId,
        last_pulled_at: new Date().toISOString()
      });
    }
    importedProducts++;
  }
  console.log(`✅ ${importedProducts} Products mapped & stored in database.`);

  // 2. Fetch & Import Clients
  console.log('\n[2/5] Syncing Clients...');
  const clientsRes = await fetchBooqableResource('customers');
  const customers = clientsRes.data || [];
  console.log(`Fetched ${customers.length} customers from Booqable.`);

  let importedClients = 0;
  for (const item of customers) {
    const attrs = item.attributes || {};
    const extId = item.id;

    const clientPayload = {
      name: attrs.name || attrs.email || 'Unnamed Client',
      email: attrs.email || null,
      phone: attrs.phone || '+977-9800000000',
      address_line: attrs.address1 || '',
      city: attrs.city || 'Kathmandu',
      status: attrs.archived ? 'Blocked' : 'Active',
      updated_at: new Date().toISOString()
    };

    const { data: ref } = await supabase
      .from('external_refs')
      .select('local_id')
      .eq('provider', 'booqable')
      .eq('entity', 'clients')
      .eq('external_id', extId)
      .maybeSingle();

    let localId;
    if (ref && ref.local_id) {
      localId = ref.local_id;
      await supabase.from('clients').update(clientPayload).eq('id', localId);
    } else {
      const { data: newClient, error } = await supabase.from('clients').insert(clientPayload).select('id').single();
      if (error) {
        console.warn(`Client insert warning for ${attrs.name}:`, error.message);
        continue;
      }
      localId = newClient.id;
      await supabase.from('external_refs').insert({
        provider: 'booqable',
        entity: 'clients',
        external_id: extId,
        local_id: localId,
        last_pulled_at: new Date().toISOString()
      });
    }
    importedClients++;
  }
  console.log(`✅ ${importedClients} Clients mapped & stored in database.`);

  // 3. Fetch & Import Orders (Bookings)
  console.log('\n[3/5] Syncing Orders / Bookings...');
  const ordersRes = await fetchBooqableResource('orders');
  const orders = ordersRes.data || [];
  console.log(`Fetched ${orders.length} orders from Booqable.`);

  let importedOrders = 0;
  for (const item of orders) {
    const attrs = item.attributes || {};
    const extId = item.id;

    const bookingPayload = {
      booking_number: `B-${attrs.number || extId.slice(0, 6)}`,
      rental_start_date: attrs.starts_at ? attrs.starts_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      rental_end_date: attrs.stops_at ? attrs.stops_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      subtotal: attrs.price_in_cents ? attrs.price_in_cents / 100 : 0,
      total_amount: attrs.total_in_cents ? attrs.total_in_cents / 100 : 0,
      stage: attrs.status === 'started' ? 'On Rent' : attrs.status === 'stopped' ? 'Returned' : 'Confirmed',
      updated_at: new Date().toISOString()
    };

    const { data: ref } = await supabase
      .from('external_refs')
      .select('local_id')
      .eq('provider', 'booqable')
      .eq('entity', 'orders')
      .eq('external_id', extId)
      .maybeSingle();

    let localId;
    if (ref && ref.local_id) {
      localId = ref.local_id;
      await supabase.from('bookings').update(bookingPayload).eq('id', localId);
    } else {
      const { data: newBooking, error } = await supabase.from('bookings').insert(bookingPayload).select('id').single();
      if (error) {
        console.warn(`Booking insert warning for Order #${attrs.number}:`, error.message);
        continue;
      }
      localId = newBooking.id;
      await supabase.from('external_refs').insert({
        provider: 'booqable',
        entity: 'orders',
        external_id: extId,
        local_id: localId,
        last_pulled_at: new Date().toISOString()
      });
    }
    importedOrders++;
  }
  console.log(`✅ ${importedOrders} Bookings mapped & stored in database.`);

  console.log('\n🎉 ALL 1-WAY BOOQABLE IMPORT JOBS COMPLETED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('Import Error:', err);
  process.exit(1);
});
