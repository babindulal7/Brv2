import fs from 'fs';

const BOOQABLE_SLUG = 'babin-rentals';
const BOOQABLE_TOKEN = 'BOOQABLE_TOKEN_REDACTED';

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

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

async function main() {
  console.log('--- Generating Import SQL Script ---');

  const productsRes = await fetchBooqableResource('products');
  const products = productsRes.data || [];

  const clientsRes = await fetchBooqableResource('customers');
  const customers = clientsRes.data || [];

  const ordersRes = await fetchBooqableResource('orders');
  const orders = ordersRes.data || [];

  let sqlQueries = ['BEGIN;'];

  const defaultCategory = "'00000000-0000-0000-0000-000000000505'";
  const defaultBranch = "'00000000-0000-0000-0000-000000000001'";
  const defaultUser = "'00000000-0000-0000-0000-000000000101'";

  // 1. Products SQL
  console.log(`Processing ${products.length} Products...`);
  let prodIdx = 400;
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
      DO $$ 
      DECLARE 
        v_product_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_product_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'products' AND external_id = '${extId}';
        IF v_product_id IS NULL THEN
          INSERT INTO public.products (client_uuid, category_id, asset_code, name, brand, model, description, daily_rate, tracking_mode, total_quantity, is_active)
          VALUES (gen_random_uuid(), ${defaultCategory}, ${assetCode}, ${name}, ${brand}, ${model}, ${desc}, ${dailyRate}, ${trackingMode}, 1, true)
          RETURNING id INTO v_product_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'products', '${extId}', v_product_id::text);
        ELSE
          UPDATE public.products SET name = ${name}, brand = ${brand}, model = ${model}, daily_rate = ${dailyRate} WHERE id = v_product_id;
        END IF;
      END $$;
    `);
  }

  // 2. Clients SQL
  console.log(`Processing ${customers.length} Clients...`);
  let clientIdx = 600;
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
      DO $$ 
      DECLARE 
        v_client_id uuid;
      BEGIN
        SELECT local_id::uuid INTO v_client_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'clients' AND external_id = '${extId}';
        IF v_client_id IS NULL THEN
          INSERT INTO public.clients (client_uuid, client_code, name, email, phone, city, status)
          VALUES (gen_random_uuid(), ${clientCode}, ${name}, ${email}, ${phone}, ${city}, 'Active')
          RETURNING id INTO v_client_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'clients', '${extId}', v_client_id::text);
        ELSE
          UPDATE public.clients SET name = ${name}, email = ${email}, phone = ${phone} WHERE id = v_client_id;
        END IF;
      END $$;
    `);
  }

  // 3. Orders / Bookings SQL
  console.log(`Processing ${orders.length} Orders...`);
  for (const item of orders) {
    const attrs = item.attributes || {};
    const extId = item.id;
    const bookingNo = escapeSql(`B-${attrs.number || extId.slice(0, 6)}`);
    const startsAt = attrs.starts_at ? escapeSql(attrs.starts_at) : 'NOW()';
    const stopsAt = attrs.stops_at ? escapeSql(attrs.stops_at) : 'NOW()';
    const stage = escapeSql(attrs.status === 'started' ? 'On Rent' : attrs.status === 'stopped' ? 'Returned' : 'Booked');

    sqlQueries.push(`
      DO $$ 
      DECLARE 
        v_booking_id uuid;
        v_client_id uuid;
      BEGIN
        SELECT id INTO v_client_id FROM public.clients LIMIT 1;
        SELECT local_id::uuid INTO v_booking_id FROM public.external_refs WHERE provider = 'booqable' AND entity = 'orders' AND external_id = '${extId}';
        IF v_booking_id IS NULL THEN
          INSERT INTO public.bookings (client_uuid, branch_id, client_id, created_by, updated_by, booking_no, delivery_type, pickup_at, return_at, stage)
          VALUES (gen_random_uuid(), ${defaultBranch}, v_client_id, ${defaultUser}, ${defaultUser}, ${bookingNo}, 'Customer Pickup', ${startsAt}, ${stopsAt}, ${stage})
          RETURNING id INTO v_booking_id;

          INSERT INTO public.external_refs (provider, entity, external_id, local_id)
          VALUES ('booqable', 'orders', '${extId}', v_booking_id::text);
        ELSE
          UPDATE public.bookings SET stage = ${stage} WHERE id = v_booking_id;
        END IF;
      END $$;
    `);
  }

  sqlQueries.push('COMMIT;');

  const fullSql = sqlQueries.join('\n');
  fs.writeFileSync('scripts/generated_import.sql', fullSql);
  console.log('✅ Generated scripts/generated_import.sql successfully.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
