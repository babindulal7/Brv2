/**
 * **Mock corpus — the data half of the local mimic.**
 *
 * Turns `seed.ts`'s `buildCorpus()` (camelCase domain objects, money in Paisa,
 * identity by natural key) into snake_case DB rows with uuid `id`s, exactly as
 * PostgREST would return them. Views are synthesised from base rows on read.
 *
 * Three conversions are load-bearing and each is a silent defect if missed:
 *
 * 1. **Paisa → rupees.** Computed money in the corpus is `Paisa` (integer
 *    hundredths); DB columns are `numeric(14,2)` in RUPEES. `seed.ts` and
 *    `seedCompact.ts` both convert on the way out. Skipping it makes every
 *    figure 100× too large.
 * 2. **Ids.** No corpus row has an `id` — identity is `clientUuid` plus natural
 *    keys, and both SQL emitters resolve FKs by subquery. The app joins on
 *    `id`, so ids are minted here with `seedUuid` under an `id:` namespace so
 *    they stay stable across rebuilds and never collide with the row's own
 *    `client_uuid` (which carries a UNIQUE constraint).
 * 3. **Dates → ISO strings.** `gte`/`lte` compare against ISO instants for
 *    timestamptz columns and bare `YYYY-MM-DD` for date columns.
 *
 * WHAT IS NOT SERVED. `buildCorpus()` covers 13 tables. Everything else is
 * either reference data (reproduced below from migration 0012) or genuinely
 * absent — listed in {@link UNSERVED} and surfaced to the user, because an
 * unexplained empty screen is the exact failure this mimic exists to avoid.
 */

import { buildCorpus, seedUuid, INVOICE_ISSUED_STATUS } from '../seed'
import { toRupees, type Paisa } from '../money'
import type { Row, Store } from './engine'

/** Tables the app queries that the corpus cannot fill. Shown in the banner. */
export const UNSERVED = [
  'expenses',
  'membership_plans',
  'operation_sessions',
  'cleaning_queue_entries',
  'client_flags',
  'payment_reversals',
  'external_refs',
  'external_invoices',
  'sync_conflicts',
  'sync_outbox',
] as const

const id = (key: string) => seedUuid(`id:${key}`)
const money = (p: Paisa) => Number(toRupees(p).toFixed(2))
const iso = (d: Date) => d.toISOString()
const day = (d: Date) => iso(d).slice(0, 10)

/* ── Reference data (migration 0012) ───────────────────────────────────── */

const BRANCH_ID = id('branch:BR-KTM-01')
const WAREHOUSE_ID = id('warehouse:WH-KTM-01')

/**
 * `users` is not in the corpus but auth cannot boot without it: `loadProfile`
 * selects `id, full_name, primary_role` and, on error, silently degrades to the
 * portal-only role `Client`. Serving a real row is what keeps mock mode from
 * reproducing that defect.
 */
const USERS: Row[] = [
  { id: id('user:owner'), client_uuid: seedUuid('user:owner'), email: 'owner@babinrentals.com', full_name: 'Babin Dulal', primary_role: 'Owner', is_active: true, branch_id: BRANCH_ID, created_at: iso(new Date('2026-01-01T00:00:00Z')) },
  { id: id('user:warehouse'), client_uuid: seedUuid('user:warehouse'), email: 'warehouse@babinrentals.com', full_name: 'Ram Thapa', primary_role: 'Warehouse', is_active: true, branch_id: BRANCH_ID, created_at: iso(new Date('2026-01-01T00:00:00Z')) },
  { id: id('user:billing'), client_uuid: seedUuid('user:billing'), email: 'billing@babinrentals.com', full_name: 'Sita Sharma', primary_role: 'Accounts', is_active: true, branch_id: BRANCH_ID, created_at: iso(new Date('2026-01-01T00:00:00Z')) },
]

const BRANCHES: Row[] = [
  { id: BRANCH_ID, client_uuid: seedUuid('branch:BR-KTM-01'), branch_code: 'BR-KTM-01', name: 'Kathmandu Main', city: 'Kathmandu', is_active: true, created_at: iso(new Date('2026-01-01T00:00:00Z')) },
]

const WAREHOUSES: Row[] = [
  { id: WAREHOUSE_ID, client_uuid: seedUuid('warehouse:WH-KTM-01'), code: 'WH-KTM-01', name: 'Kathmandu Main Hub (HQ)', branch_id: BRANCH_ID, is_active: true },
]

/**
 * Verbatim from migration `0012_seed_data.sql:117-122`, ids included — the six
 * codes `seed.ts` actually emits are lowercase (`camera`, `lens`, …), not the
 * three-letter shorthand used elsewhere in the product. Reusing 0012's real
 * uuids means a row minted here has the same `category_id` it would have live.
 */
const CATEGORIES: Row[] = [
  ['camera', 'Camera', 'Cinema & Mirrorless Cameras'],
  ['lens', 'Lens', 'Cinema Primes, Zooms, Anamorphic'],
  ['lighting', 'Lighting', 'Continuous LED, COB, Softboxes'],
  ['audio', 'Audio', 'Wireless Mics, Boom, Field Recorders'],
  ['grip', 'Grip', 'C-Stands, Jibs, Heavy Grip'],
  ['support', 'Support', 'Tripods, Gimbals, Sliders'],
].map(([code, name, description], i) => ({
  id: `00000000-0000-0000-0000-00000000050${i + 1}`,
  client_uuid: `20000000-0000-0000-0000-00000000050${i + 1}`,
  code,
  name,
  description,
  sort_order: i + 1,
  display_order: i + 1,
  is_active: true,
}))

const CATEGORY_ID_BY_CODE = new Map(CATEGORIES.map((c) => [c['code'] as string, c['id'] as string]))

const ZONES: Row[] = ['ZONE-CAM-A', 'ZONE-LENS-B', 'ZONE-GRIP-C'].map((code, i) => ({
  id: id(`zone:${code}`),
  client_uuid: seedUuid(`zone:${code}`),
  code,
  name: code,
  warehouse_id: WAREHOUSE_ID,
  sort_order: i + 1,
  is_active: true,
}))

const EXPENSE_CATEGORIES: Row[] = [
  ['EXP-FUEL', 'Fuel & Transport'], ['EXP-REP', 'Repairs & Maintenance'],
  ['EXP-RENT', 'Rent & Utilities'], ['EXP-SAL', 'Salaries & Wages'],
  ['EXP-MISC', 'Miscellaneous'],
].map(([code, name], i) => ({
  id: id(`expcat:${code}`),
  client_uuid: seedUuid(`expcat:${code}`),
  code, name, display_order: i + 1, is_active: true,
}))

/* ── Corpus → rows ─────────────────────────────────────────────────────── */

export function buildStore(): Store {
  const corpus = buildCorpus()

  const clients: Row[] = corpus.clients.map((c) => {
    const code = `C-${c.seq}`
    return {
      id: id(`client:${code}`),
      client_uuid: seedUuid(`client:${code}`),
      client_code: code,
      name: c.name,
      type_parent: c.typeParent,
      org_subtype: c.orgSubtype,
      phone: c.phone,
      email: c.email,
      address_line: c.addressLine,
      city: c.city,
      district: c.district,
      country: 'Nepal',
      segments: c.segments,
      payment_terms: c.paymentTerms,
      client_since: c.since,
      status: 'Active',
      pan_vat: null,
      business_registration: null,
      website: null,
      approved_credit_limit: null,
      deactivated_at: null,
      created_at: `${c.since}T04:15:00.000Z`,
    }
  })
  const clientByCode = new Map(clients.map((c) => [c['client_code'] as string, c]))

  const products: Row[] = corpus.products.map((p) => {
    const assetCode = `EQ${String(p.seq).padStart(6, '0')}`
    return {
      id: id(`product:${assetCode}`),
      client_uuid: seedUuid(`product:${assetCode}`),
      asset_code: assetCode,
      name: p.name,
      short_name: p.name.length > 24 ? `${p.name.slice(0, 21)}…` : p.name,
      brand: p.brand,
      model: p.model,
      manufacturer: p.brand,
      category_id: CATEGORY_ID_BY_CODE.get(p.categoryCode) ?? null,
      tracking_mode: 'Serialised',
      status: 'Active',
      total_quantity: p.units,
      reorder_level: 0,
      quantity_unit: 'unit',
      daily_rate: p.dailyRateRupees,
      replacement_value: p.replacementValueRupees,
      weekly_rate: null, monthly_rate: null, hourly_rate: null, weekend_rate: null,
      purchase_price: null, purchase_date: null,
      deposit_percent: null, deposit_fixed: null,
      min_rental_days: 1,
      rental_enabled: true,
      is_subrental_only: false,
      is_active: true,
      description: null, thumbnail_url: null, supplier_id: null,
      notes_internal: null, notes_warehouse: null, notes_rental: null,
      created_at: iso(new Date('2026-02-01T04:15:00Z')),
    }
  })

  const productUnits: Row[] = []
  for (const p of corpus.products) {
    const assetCode = `EQ${String(p.seq).padStart(6, '0')}`
    for (let n = 0; n < p.units; n++) {
      const tag = `${assetCode}-U${String(n + 1).padStart(2, '0')}`
      productUnits.push({
        id: id(`product_unit:${tag}`),
        client_uuid: seedUuid(`product_unit:${tag}`),
        product_id: id(`product:${assetCode}`),
        asset_tag: tag,
        serial_no: `SN-${p.serialTag}-${String(p.serialFrom + n).padStart(4, '0')}`,
        barcode: tag,
        qr_code: tag,
        // `product_units_v.status` — the live vocabulary is In Stock ·
        // Reserved · Packed · On Rent · Returning · Inspection · Cleaning ·
        // Maintenance · Missing · Retired (queries/inventory.ts:195). "Available"
        // is a DERIVED band in the UI, never a stored status.
        status: 'In Stock',
        condition: 'Good',
        branch_id: BRANCH_ID,
        warehouse_id: WAREHOUSE_ID,
        storage_zone_id: id(`zone:${p.zoneCode}`),
        replacement_value: p.replacementValueRupees,
        purchase_price: null,
        rack: null, shelf: null, bin: null, container_id: null,
        retired_at: null,
        created_at: iso(new Date('2026-02-01T04:15:00Z')),
      })
    }
  }

  const bookings: Row[] = []
  const bookingLines: Row[] = []
  /**
   * `booking_line_units` — one row per physical unit on a booking line.
   *
   * ⚠ HONESTY NOTE, carried forward from `seed.ts:762-770`. That file
   * deliberately REFUSES to assign units to generated bookings, on the grounds
   * that index-assignment would put the same physical unit on two
   * date-overlapping bookings — "a lie the floor screens would render as fact".
   * Synthesising these rows reintroduces exactly that lie, **in mock mode only**.
   *
   * It is the right trade here — a floor workspace that renders nothing is worse
   * than one that renders a plausible unit — but it is a trade, not a fix. Mock
   * mode already states on every screen that its data is not real, and no unit
   * assignment made here may ever be treated as an availability fact.
   */
  const bookingLineUnits: Row[] = []
  const crewLines: Row[] = []
  const invoices: Row[] = []
  const payments: Row[] = []
  const deposits: Row[] = []
  const transitions: Row[] = []

  const productBySeq = new Map(corpus.products.map((p) => [p.seq, p]))

  for (const b of corpus.bookings) {
    const bId = id(`booking:${b.bookingNo}`)
    const client = clientByCode.get(b.clientCode)
    const clientId = (client?.['id'] as string | undefined) ?? null
    const stage = b.spec.stage

    bookings.push({
      id: bId,
      client_uuid: seedUuid(`booking:${b.bookingNo}`),
      booking_no: b.bookingNo,
      client_id: clientId,
      project: b.spec.project,
      stage,
      pickup_at: iso(b.spec.pickupAt),
      return_at: iso(b.spec.returnAt),
      actual_return_at: stage === 'Returned' || stage === 'Closed' ? iso(b.spec.returnAt) : null,
      delivery_type: 'Pickup',
      pickup_location: 'Kathmandu Main',
      return_location: 'Kathmandu Main',
      quote_expires_at: stage === 'Quote' ? iso(new Date(b.spec.pickupAt.getTime() - 3 * 86_400_000)) : null,
      cancelled_at: null,
      closed_at: stage === 'Closed' ? iso(b.spec.returnAt) : null,
      branch_id: BRANCH_ID,
      deposit_required: money(b.depositPending),
      rental_total: money(b.breakdown.rentalTotal),
      outstanding_amount: money(b.breakdown.outstanding),
      created_at: iso(new Date(b.spec.pickupAt.getTime() - 7 * 86_400_000)),
    })

    for (const l of b.lines) {
      bookingLines.push({
        id: id(`booking_line:${b.bookingNo}:${l.assetCode}`),
        client_uuid: l.clientUuid,
        booking_id: bId,
        product_id: id(`product:${l.assetCode}`),
        description: l.description,
        qty: l.qty,
        days: l.days,
        rate: l.rateRupees,
        line_total: money(l.lineTotal),
        sort_order: l.sortOrder,
        voided_at: null,
      })
    }

    // Units, grouped onto the line that carries the same asset_code. `SeedUnit`
    // has no line pointer, so the asset code is the join — the same key both SQL
    // emitters use. A unit whose product is not on any line is dropped rather
    // than attached to an arbitrary line.
    const lineByAsset = new Map(b.lines.map((l) => [l.assetCode, l]))
    for (const u of b.units) {
      const line = lineByAsset.get(u.assetCode)
      if (!line) continue
      bookingLineUnits.push({
        id: id(`blu:${b.bookingNo}:${u.assetTag}`),
        client_uuid: u.clientUuid,
        booking_id: bId,
        booking_line_id: id(`booking_line:${b.bookingNo}:${u.assetCode}`),
        asset_id: id(`product_unit:${u.assetTag}`),
        qty: 1,
        // `item_quantity_state` (0001) — Ready · Picked Up · Returned · Missing
        // · Damaged. Derived from the booking's stage so a Returned booking does
        // not render units still waiting to be collected.
        unit_state:
          stage === 'Closed' || stage === 'Returned'
            ? 'Returned'
            : stage === 'On Rent'
              ? 'Picked Up'
              : 'Ready',
        is_required: true,
        packed: stage !== 'Quote' && stage !== 'Booked',
        damaged: false,
        condition: null,
        created_at: iso(b.spec.pickupAt),
      })
    }

    for (const c of b.crew) {
      crewLines.push({
        id: id(`crew_line:${b.bookingNo}:${c.name}`),
        client_uuid: c.clientUuid,
        booking_id: bId,
        crew_name: c.name,
        role: c.role,
        day_rate: c.dayRateRupees,
        days: c.days,
        line_total: money(c.lineTotal),
        voided_at: null,
      })
    }

    invoices.push({
      id: id(`invoice:${b.invoiceNo}`),
      client_uuid: seedUuid(`invoice:${b.invoiceNo}`),
      invoice_no: b.invoiceNo,
      booking_id: bId,
      client_id: clientId,
      /*
       * ⛔ This wrote `'Issued'`, which is not a member of `invoice_status`
       * (Draft · Sent · Partially Paid · Paid · Overdue · Void, 0001) — it
       * belongs to `document_lifecycle_status`, a different enum for a different
       * table (X-07). Finance's unsettled set is `['Sent', 'Partially Paid']`,
       * so it matched nothing: the Finance dashboard and the Daily Closing both
       * read "Outstanding Rs 0 · every issued invoice has been settled" while
       * Booking Detail showed Rs 25,934 owed on one of those same invoices. Two
       * screens, one invoice, two answers about what a client is billed.
       *
       * The status is now DERIVED from the figures beside it, mirroring
       * `sync_payment_to_invoice()` (0010) — which is what sets it live, and
       * which the mock engine does not run. `INVOICE_ISSUED_STATUS` is `seed.ts`'s
       * own constant for "raised, nothing paid", so the mimic and the SQL
       * emitter cannot answer differently.
       */
      status:
        b.breakdown.payments === 0
          ? INVOICE_ISSUED_STATUS
          : b.breakdown.outstanding === 0
            ? 'Paid'
            : 'Partially Paid',
      subtotal: money(b.breakdown.subtotal),
      discount_amount: money(b.breakdown.discount),
      taxable_amount: money(b.breakdown.taxable),
      vat_amount: money(b.breakdown.vat),
      total_amount: money(b.breakdown.rentalTotal),
      paid_amount: money(b.breakdown.payments),
      outstanding_amount: money(b.breakdown.outstanding),
      issue_date: day(b.spec.pickupAt),
      due_date: day(new Date(b.spec.pickupAt.getTime() + 15 * 86_400_000)),
      voided_at: null,
      created_at: iso(b.spec.pickupAt),
    })

    if (b.paymentNo) {
      payments.push({
        id: id(`payment:${b.paymentNo}`),
        client_uuid: seedUuid(`payment:${b.paymentNo}`),
        payment_no: b.paymentNo,
        booking_id: bId,
        invoice_id: id(`invoice:${b.invoiceNo}`),
        client_id: clientId,
        amount: money(b.breakdown.payments),
        payment_type: 'Rental',
        method: 'Bank Transfer',
        status: 'Received',
        payment_date: day(b.spec.pickupAt),
        reference: b.bookingNo,
        reversed_at: null,
        created_at: iso(b.spec.pickupAt),
      })
    }

    if (b.depositNo) {
      deposits.push({
        id: id(`deposit:${b.depositNo}`),
        client_uuid: seedUuid(`deposit:${b.depositNo}`),
        deposit_no: b.depositNo,
        booking_id: bId,
        client_id: clientId,
        required_amount: b.spec.depositRequiredRupees,
        received_amount: b.spec.depositReceivedRupees,
        refunded_amount: 0,
        applied_amount: 0,
        status: b.spec.depositReceivedRupees > 0 ? 'Held' : 'Pending',
        created_at: iso(b.spec.pickupAt),
      })
    }

    for (const t of b.transitions) {
      transitions.push({
        id: id(`transition:${b.bookingNo}:${t.to}`),
        client_uuid: t.clientUuid,
        booking_id: bId,
        from_stage: t.from,
        to_stage: t.to,
        occurred_at: iso(t.occurredAt),
        actor_id: USERS[0]?.['id'] ?? null,
        created_at: iso(t.occurredAt),
      })
    }
    void productBySeq // spec lines already carry assetCode; map retained for clarity
  }

  /* ── Bundles (migration 0004) ────────────────────────────────────────────
     Three kits built over REAL `products` rows, so `/inventory?tab=bundles`
     has something to read and its availability can actually be exercised
     against a window. One is archived (`is_active: false`) so the Archived
     shelf is not permanently empty.

     Deliberately small: the pane derives every figure it prints from these
     rows (§1 — "every number is computed at render"), so three bundles are
     enough to prove the derivations and cheap enough to read in a diff. */
  const bundles: Row[] = []
  const bundleItems: Row[] = []
  {
    const kits = [
      { code: 'BND-001', name: 'Documentary Camera Kit', daily: 18000, active: true, take: [0, 1, 2] },
      { code: 'BND-002', name: 'Lighting Starter Kit', daily: 9000, active: true, take: [3, 4] },
      { code: 'BND-003', name: 'Retired Podcast Kit', daily: 6000, active: false, take: [5] },
    ]
    for (const kit of kits) {
      const members = kit.take.map((i) => products[i]).filter((row): row is Row => row !== undefined)
      if (members.length === 0) continue
      const bundleId = id(`bundle:${kit.code}`)
      bundles.push({
        id: bundleId,
        client_uuid: seedUuid(`bundle:${kit.code}`),
        bundle_code: kit.code,
        name: kit.name,
        description: null,
        category_id: members[0]?.['category_id'] ?? null,
        daily_rate: kit.daily,
        weekly_rate: kit.daily * 5,
        is_active: kit.active,
        created_at: '2026-08-01T04:00:00.000Z',
        created_by: USERS[0]?.['id'] ?? null,
        updated_at: '2026-08-01T04:00:00.000Z',
        updated_by: null,
      })
      members.forEach((product, index) => {
        bundleItems.push({
          id: id(`bundle_item:${kit.code}:${index}`),
          client_uuid: seedUuid(`bundle_item:${kit.code}:${index}`),
          bundle_id: bundleId,
          product_id: product['id'],
          quantity: index === 0 ? 1 : 2,
          days: 1,
          is_mandatory: index === 0,
          sort_order: index,
          created_at: '2026-08-01T04:00:00.000Z',
          created_by: USERS[0]?.['id'] ?? null,
        })
      })
    }
  }

  /* ── Reservations (migration 0004 / `inventory_reservations`) ────────────
     Holds are what make availability WINDOW-relative (PLAN.md §4.44). Without
     a single row here every window returns the same answer, and the Bundles
     pane's date control would look wired while proving nothing.

     Every unit of BND-002's last component is held for a week in November,
     against a real booking so the conflict can be named. The effect is exactly
     the one the ruling is about: that kit reads `Available` for a job next
     week and `Partially Available` for one in November. */
  const reservations: Row[] = []
  {
    const kitB = bundles.find((b) => b['bundle_code'] === 'BND-002')
    const lastItem = bundleItems.filter((i) => i['bundle_id'] === kitB?.['id']).at(-1)
    const held = productUnits.filter((u) => u['product_id'] === lastItem?.['product_id'])
    const booking = bookings[0]
    held.forEach((unit, index) => {
      reservations.push({
        id: id(`reservation:nov:${index}`),
        client_uuid: seedUuid(`reservation:nov:${index}`),
        booking_id: booking?.['id'] ?? null,
        asset_id: unit['id'],
        /* Postgres's own text form for a tstzrange — a space rather than `T`
           and `+00` rather than `Z`, which is what `parseTstzRange` normalises. */
        period: '["2026-11-10 04:00:00+00","2026-11-17 04:00:00+00")',
        released_at: null,
        created_at: '2026-08-01T04:00:00.000Z',
      })
    })
  }

  /* ── Suppliers + purchase requests (migration 0004) ──────────────────────
     `/inventory/purchase-requests` read a hand-written array while its
     approve/reject decisions wrote to Postgres, so an approval never changed
     the list. These rows are what the wired screen reads.

     Deliberately spread across four of the seven `purchase_request_status`
     members so the status tabs and the KPI tiles have something to separate;
     `Rejected` carries a `rejection_reason` because that is the only column the
     decision panel can show. */
  const suppliers: Row[] = [
    { id: id('supplier:SUP-001'), client_uuid: seedUuid('supplier:SUP-001'), supplier_code: 'SUP-001', name: 'Everest Broadcast Supply', created_at: '2026-01-10T04:00:00.000Z' },
    { id: id('supplier:SUP-002'), client_uuid: seedUuid('supplier:SUP-002'), supplier_code: 'SUP-002', name: 'Kathmandu Camera House', created_at: '2026-01-10T04:00:00.000Z' },
  ]

  const purchaseRequests: Row[] = []
  {
    const specs = [
      { no: 'PR-2026-0001', take: 0, qty: 2, unit: 185000, status: 'Submitted', reason: 'Demand exceeded', urgency: 'High', supplier: 0, rejected: null },
      { no: 'PR-2026-0002', take: 1, qty: 1, unit: 92000, status: 'Approved', reason: 'Sub-rent event', urgency: 'Normal', supplier: 1, rejected: null },
      { no: 'PR-2026-0003', take: 2, qty: 4, unit: 15500, status: 'Draft', reason: 'Manual', urgency: 'Low', supplier: null, rejected: null },
      { no: 'PR-2026-0004', take: 3, qty: 1, unit: 240000, status: 'Rejected', reason: 'Demand exceeded', urgency: 'Normal', supplier: 0, rejected: 'too expensive' },
    ]
    specs.forEach((spec, index) => {
      const product = products[spec.take]
      if (product === undefined) return
      const supplier = spec.supplier === null ? null : suppliers[spec.supplier]
      purchaseRequests.push({
        id: id(`purchase_request:${spec.no}`),
        client_uuid: seedUuid(`purchase_request:${spec.no}`),
        pr_no: spec.no,
        product_id: product['id'],
        supplier_id: supplier?.['id'] ?? null,
        quantity: spec.qty,
        estimated_unit_cost: spec.unit,
        total_estimated_cost: spec.unit * spec.qty,
        reason_type: spec.reason,
        urgency: spec.urgency,
        status: spec.status,
        requested_by: USERS[0]?.['id'] ?? null,
        approved_by: spec.status === 'Approved' || spec.status === 'Rejected' ? (USERS[0]?.['id'] ?? null) : null,
        rejection_reason: spec.rejected,
        created_at: `2026-08-${String(10 + index).padStart(2, '0')}T04:00:00.000Z`,
        created_by: USERS[0]?.['id'] ?? null,
        updated_at: `2026-08-${String(10 + index).padStart(2, '0')}T04:00:00.000Z`,
        updated_by: null,
      })
    })
  }

  const store: Store = {
    users: USERS,
    branches: BRANCHES,
    warehouses: WAREHOUSES,
    inventory_categories: CATEGORIES,
    storage_zones: ZONES,
    expense_categories: EXPENSE_CATEGORIES,
    clients,
    products,
    product_units: productUnits,
    bookings,
    booking_lines: bookingLines,
    booking_line_units: bookingLineUnits,
    booking_crew_lines: crewLines,
    invoices,
    payments,
    security_deposits: deposits,
    booking_stage_transitions: transitions,
    bundles,
    bundle_items: bundleItems,
    inventory_reservations: reservations,
    suppliers,
    purchase_requests: purchaseRequests,
  }
  for (const t of UNSERVED) store[t] = []
  store['probe'] = []
  return store
}

/* ── Views ─────────────────────────────────────────────────────────────────
   Synthesised on read from base rows. The money gate (`auth_can_view_money()`)
   is NOT applied: mock mode always signs in as Owner, for whom the live view
   would return the figures anyway.
   ------------------------------------------------------------------------ */

export const VIEW_OF: Record<string, string> = {
  clients_v: 'clients',
  products_v: 'products',
  product_units_v: 'product_units',
  booking_lines_v: 'booking_lines',
  membership_plans_v: 'membership_plans',
}

/** `client_directory_v` — 31 columns over `clients` with six aggregates. */
export function clientDirectory(store: Store): Row[] {
  const invoices = store['invoices'] ?? []
  const payments = store['payments'] ?? []
  const deposits = store['security_deposits'] ?? []
  const bookings = store['bookings'] ?? []

  const sum = (rows: Row[], key: string, clientId: unknown) =>
    rows.reduce((n, r) => (r['client_id'] === clientId ? n + Number(r[key] ?? 0) : n), 0)

  return (store['clients'] ?? []).map((c) => {
    const cid = c['id']
    const mine = bookings.filter((b) => b['client_id'] === cid)
    const active = mine.filter((b) => b['stage'] !== 'Closed' && b['cancelled_at'] == null)
    const pickups = mine
      .map((b) => b['pickup_at'])
      .filter((v): v is string => typeof v === 'string')
      .sort()
    return {
      ...c,
      outstanding_amount: Number(sum(invoices, 'outstanding_amount', cid).toFixed(2)),
      deposit_held_amount: Number(
        deposits
          .filter((d) => d['client_id'] === cid)
          .reduce(
            (n, d) =>
              n +
              Math.max(
                Number(d['received_amount'] ?? 0) -
                  Number(d['refunded_amount'] ?? 0) -
                  Number(d['applied_amount'] ?? 0),
                0,
              ),
            0,
          )
          .toFixed(2),
      ),
      total_paid_amount: Number(
        payments
          .filter((p) => p['client_id'] === cid && p['status'] === 'Received')
          .reduce((n, p) => n + Number(p['amount'] ?? 0), 0)
          .toFixed(2),
      ),
      active_bookings_count: active.length,
      total_bookings_count: mine.length,
      last_pickup_at: pickups.length ? pickups[pickups.length - 1] : null,
      // No corpus rows exist for contacts, memberships or KYC documents, so
      // these are null/0 in mock mode exactly as they would be in a live DB
      // whose child tables are empty — not a mock artefact.
      contact_name: null,
      contact_designation: null,
      contact_phone: null,
      membership_level: null,
      kyc_docs_count: 0,
      kyc_verified_count: 0,
      is_blocked: false,
    }
  })
}
