import fs from 'fs';

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
  const url = `https://${BOOQABLE_SLUG}.booqable.com/api/4/${endpoint}?page[size]=100`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${endpoint}: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

async function main() {
  console.log('🚀 Generating Full Booqable Sync Script for All Entities...');

  const [productsRes, stockRes, clientsRes, ordersRes, paymentsRes] = await Promise.all([
    fetchBooqableResource('products'),
    fetchBooqableResource('stock_items'),
    fetchBooqableResource('customers'),
    fetchBooqableResource('orders'),
    fetchBooqableResource('payments')
  ]);

  const products = productsRes.data || [];
  const stockItems = stockRes.data || [];
  const customers = clientsRes.data || [];
  const orders = ordersRes.data || [];
  const payments = paymentsRes.data || [];

  console.log(`Summary Fetched:
  - Products: ${products.length}
  - Stock Items: ${stockItems.length}
  - Clients: ${customers.length}
  - Orders: ${orders.length}
  - Payments: ${payments.length}`);

  let sqlQueries = [
    'BEGIN;',
    "DO $$ DECLARE v_cat_id uuid := '00000000-0000-0000-0000-000000000505'; v_branch uuid := '00000000-0000-0000-0000-000000000001'; v_user uuid := '00000000-0000-0000-0000-000000000101'; v_new_id uuid; BEGIN"
  ];

  // 1. PRODUCTS
  let prodIdx = 1000;
  for (const item of products) {
    prodIdx++;
    const attrs = item.attributes || {};
    const extId = item.id;
    const assetCode = escapeSql(`EQ${String(prodIdx).padStart(6, '0')}`);
    const name = escapeSql(attrs.name || 'Untitled Product');
    const brand = escapeSql(attrs.brand || 'Generic');
    const model = escapeSql(attrs.sku || attrs.name || '');
    const desc = escapeSql(attrs.description || '');
    const dailyRate = attrs.base_price_in_cents ? attrs.base_price_in_cents / 100 : 0;
    const trackingMode = escapeSql(attrs.trackable ? 'Serialised' : 'Quantity');

    sqlQueries.push(`
      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '${extId}') THEN
        INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
        VALUES (gen_random_uuid(), v_cat_id, ${assetCode}, ${name}, ${brand}, ${model}, ${desc}, ${dailyRate}, ${trackingMode}, 1, true)
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'products', '${extId}', v_new_id::text);
      END IF;
    `);
  }

  // 2. CLIENTS
  let clientIdx = 1000;
  for (const item of customers) {
    clientIdx++;
    const attrs = item.attributes || {};
    const extId = item.id;
    const clientCode = escapeSql(`C-${clientIdx}`);
    const name = escapeSql(attrs.name || attrs.email || 'Unnamed Client');
    const email = attrs.email ? escapeSql(attrs.email) : 'NULL';
    const phone = escapeSql(`+9779811${String(clientIdx).padStart(5, '0')}`);
    const city = escapeSql(attrs.city || 'Kathmandu');

    sqlQueries.push(`
      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '${extId}') THEN
        INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
        VALUES (gen_random_uuid(), ${clientCode}, ${name}, ${email}, ${phone}, ${city}, 'Active')
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'clients', '${extId}', v_new_id::text);
      END IF;
    `);
  }

  // 3. BOOKINGS
  let bookingIdx = 1000;
  for (const item of orders) {
    bookingIdx++;
    const attrs = item.attributes || {};
    const extId = item.id;
    const bookingNo = escapeSql(`B-${attrs.number || bookingIdx}`);
    const startsAt = attrs.starts_at ? escapeSql(attrs.starts_at) : 'NOW()';
    const stopsAt = attrs.stops_at ? escapeSql(attrs.stops_at) : 'NOW()';
    const stage = escapeSql(attrs.status === 'started' ? 'On Rent' : attrs.status === 'stopped' ? 'Returned' : 'Booked');

    sqlQueries.push(`
      IF NOT EXISTS (SELECT 1 FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '${extId}') THEN
        INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
        VALUES (gen_random_uuid(), v_branch, (SELECT id FROM public.clients LIMIT 1), v_user, v_user, ${bookingNo}, 'Customer Pickup', ${startsAt}, ${stopsAt}, ${stage})
        RETURNING id INTO v_new_id;

        INSERT INTO public.external_refs (provider, entity, external_id, local_id)
        VALUES ('booqable', 'orders', '${extId}', v_new_id::text);
      END IF;
    `);
  }

  sqlQueries.push('END $$;\nCOMMIT;');

  const fullSql = sqlQueries.join('\n');
  fs.writeFileSync('scripts/full_sync.sql', fullSql);
  console.log('✅ Generated scripts/full_sync.sql successfully.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
