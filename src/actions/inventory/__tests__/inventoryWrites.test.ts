/**
 * The three inventory writes brought to life together (Phase 1 item 1.1):
 * CREATE_EQUIPMENT, CREATE_STOCK_TRANSFER, APPROVE_PURCHASE_REQUEST.
 * Extended (Phase 2 item 2.6a) with CREATE_BUNDLE — the same seams, pinning
 * the three corruption fixes: seed ids/names resolved to real uuids by
 * SELECT, screen-computed pricing written via toRupees instead of zero, and
 * the code taken from next_document_number('bundle') instead of clock digits.
 *
 * Every assertion pins a failure that is INVISIBLE on screen — a dropped form
 * field, a clock-minted identifier, a queued write reported as saved, a
 * decision recorded over a stale status. The seams mocked are `lib/dataAccess`
 * (the writes — which also captures `lib/audit`'s rows, since `logAuditEvent`
 * inserts through the same seam) and `lib/supabase` (lookups + the number
 * allocator) — the same two `createClient`'s suite mocks. Nothing about the
 * actions' own logic is stubbed.
 *
 * `validate`/`execute` are driven through the exported configs; the role gate
 * is pinned separately through each dispatched action. `purchase.approve` is
 * pinned at the 0064 narrowing (finance/admin five, applied 23 Aug 2026) —
 * the deliberate §4.29 breadth pin this header used to describe did its job
 * and was flipped the day the policy landed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { rupees } from '../../../lib/money'
import type { CreateEquipmentInput } from '../createEquipment'
import type { CreateStockTransferInput } from '../createStockTransfer'
import type { ApprovePurchaseRequestInput } from '../approvePurchaseRequest'
import type { CreateBundleInput } from '../createBundle'

const access = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; id: string; patch: Record<string, unknown>; clientUuid: string | undefined }>,
  /** Per-table `idempotentInsert` results; `insertThrows[table]` throws instead. */
  insertResults: {} as Record<string, { data: unknown; error: unknown }>,
  insertThrows: {} as Record<string, string>,
  updateResult: { data: {} as unknown, error: null as unknown },
  updateThrows: null as string | null,
}))

vi.mock('../../../lib/dataAccess', () => ({
  idempotentInsert: async (table: string, payload: Record<string, unknown>) => {
    access.inserts.push({ table, payload })
    const boom = access.insertThrows[table]
    if (boom) throw new Error(boom)
    return access.insertResults[table] ?? { data: { id: `${table}-id` }, error: null }
  },
  safeUpdate: async (table: string, id: string, patch: Record<string, unknown>, clientUuid?: string) => {
    access.updates.push({ table, id, patch, clientUuid })
    if (access.updateThrows) throw new Error(access.updateThrows)
    return access.updateResult
  },
}))

const db = vi.hoisted(() => {
  const state = {
    /** Rows the chainable `from().select().eq().maybeSingle()` serves. */
    tables: {} as Record<string, Array<Record<string, unknown>>>,
    rpc: { data: 'EQ000123' as unknown, error: null as { message: string } | null },
    rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  }
  const supabase = {
    from(table: string) {
      return {
        select() {
          return {
            eq(col: string, val: unknown) {
              const rows = (state.tables[table] ?? []).filter((r) => r[col] === val)
              return {
                async maybeSingle() {
                  return { data: rows[0] ?? null, error: null }
                },
              }
            },
          }
        },
      }
    },
    rpc: async (fn: string, args: unknown) => {
      state.rpcCalls.push({ fn, args })
      return state.rpc
    },
  }
  return { state, supabase }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
  IS_MOCK: false,
}))

const { createEquipmentConfig, createEquipment } = await import('../createEquipment')
const { createStockTransferConfig, createStockTransfer } = await import('../createStockTransfer')
const { approvePurchaseRequestConfig, approvePurchaseRequest } = await import('../approvePurchaseRequest')
const { createBundleConfig, createBundle } = await import('../createBundle')

const CTX = { userId: 'aaaaaaaa-0000-4000-8000-000000000001', role: 'Owner' as const, isOnline: true }

const EQ_INPUT: CreateEquipmentInput = {
  clientUuid: '11111111-1111-4111-8111-111111111111',
  name: '  Sony FX6 Cinema Camera  ',
  category: 'Camera',
  brand: 'Sony',
  tracking: 'Serialised',
  units: [
    { serial: ' SN-FX6-001 ', condition: 'Excellent', purchaseDateIso: '2026-08-01', clientUuid: '22222222-2222-4222-8222-222222222221' },
    { serial: 'SN-FX6-002', condition: 'Good', purchaseDateIso: '2026-08-01', clientUuid: '22222222-2222-4222-8222-222222222222' },
  ],
  warehouseId: 'wh-vault-uuid',
  location: { rack: 'Rack 01', shelf: 'Shelf 02', bin: 'Bin A-1' },
  status: 'Active',
  dailyRatePaisa: rupees(4500),
  replacementValuePaisa: rupees(465000),
  minRentalDays: 1,
}

const TR_INPUT: CreateStockTransferInput = {
  clientUuid: '33333333-3333-4333-8333-333333333331',
  lineClientUuid: '33333333-3333-4333-8333-333333333332',
  transferType: 'Branch Transfer',
  sourceWarehouseId: 'wh-vault-uuid',
  destinationWarehouseId: 'wh-lakeside-uuid',
  productId: 'prod-fx3-uuid',
  serial: 'SN-FX3-003',
  notes: 'Lakeside shoot, back Friday',
}

const PR_INPUT: ApprovePurchaseRequestInput = {
  prNo: 'PR-2026-0012',
  decision: 'Approved',
  clientUuid: '44444444-4444-4444-8444-444444444441',
}

const BND_INPUT: CreateBundleInput = {
  clientUuid: '55555555-5555-4555-8555-555555555551',
  name: '  Sony FX3 Documentary Kit  ',
  categoryId: 'cat-camera-uuid',
  description: 'Camera, lenses and support in one kit.',
  items: [
    {
      modelId: 'M-FX3-BODY',
      productId: 'prod-fx3-uuid',
      qty: 1,
      discountPct: 10,
      clientUuid: '55555555-5555-4555-8555-555555555552',
    },
    {
      modelId: 'M-NISI-35',
      productId: 'prod-nisi35-uuid',
      qty: 2,
      discountPct: 0,
      clientUuid: '55555555-5555-4555-8555-555555555553',
    },
  ],
  itemCount: 3,
  isDraft: false,
  dailyRatePaisa: rupees(18000),
}

const insertsInto = (table: string) => access.inserts.filter((i) => i.table === table)

beforeEach(() => {
  access.inserts.length = 0
  access.updates.length = 0
  access.insertThrows = {}
  access.insertResults = {
    products: { data: { id: 'prod-new-uuid', asset_code: 'EQ000123' }, error: null },
    product_units: { data: { id: 'unit-new-uuid' }, error: null },
    stock_transfers: { data: { id: 'transfer-new-uuid', transfer_no: 'TRANSFER-2026-0001' }, error: null },
    stock_transfer_lines: { data: { id: 'line-new-uuid' }, error: null },
    audit_events: { data: null, error: null },
    /* createBundle inserts with { returnRow: false } — its persistence proof
       is the narrow re-select served from db.state.tables['bundles'] below. */
    bundles: { data: null, error: null },
    bundle_items: { data: { id: 'bundle-item-new-uuid' }, error: null },
  }
  access.updateThrows = null
  access.updateResult = {
    data: { id: 'pr-row-uuid', pr_no: 'PR-2026-0012', status: 'Approved' },
    error: null,
  }
  db.state.rpc = { data: 'EQ000123', error: null }
  db.state.rpcCalls.length = 0
  db.state.tables = {
    inventory_categories: [{ id: 'cat-camera-uuid', name: 'Camera' }],
    warehouses: [
      /* The two rows `warehouses` actually holds. They were the four seed
         facility names until 6 Sep, which let this suite certify a picker
         whose every option was unresolvable in production. */
      { id: 'wh-vault-uuid', branch_id: 'br-ktm-uuid', name: 'Central Camera Vault' },
      { id: 'wh-lakeside-uuid', branch_id: 'br-pkr-uuid', name: 'Lakeside Equipment Hub' },
    ],
    products: [
      { id: 'prod-fx3-uuid', name: 'Sony FX3 Full-Frame Camera' },
      { id: 'prod-nisi35-uuid', name: 'NISI Athena 35mm' },
    ],
    product_units: [{ id: 'unit-fx3-uuid', product_id: 'prod-fx3-uuid', serial_no: 'SN-FX3-003' }],
    purchase_requests: [{ id: 'pr-row-uuid', pr_no: 'PR-2026-0012', status: 'Submitted' }],
    /* The row the narrow read-back finds after the (mocked) bundles insert. */
    bundles: [{ id: 'bundle-new-uuid', bundle_code: 'BND-7', client_uuid: BND_INPUT.clientUuid }],
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/* ═══════════════════════ CREATE_EQUIPMENT ═══════════════════════ */

describe('CREATE_EQUIPMENT — validate', () => {
  const check = (patch: Partial<CreateEquipmentInput> = {}) => createEquipmentConfig.validate({ ...EQ_INPUT, ...patch })

  it('refuses a record with no name — products.name is NOT NULL', () => {
    expect(() => check({ name: '  ' })).toThrow(/name/i)
  })

  it('refuses a record with no category or brand — both NOT NULL, whatever the page ruling stopped gating', () => {
    expect(() => check({ category: '' })).toThrow(/category/i)
    expect(() => check({ brand: '' })).toThrow(/brand/i)
  })

  it('refuses a submit with no idempotency key — Law 8', () => {
    expect(() => check({ clientUuid: '' })).toThrow(/idempotency key/i)
  })

  it('refuses a unit without its own per-row key — Law 8 is one per ROW', () => {
    const units = [{ serial: 'S1', condition: 'Good' as const, clientUuid: '' }]
    expect(() => check({ units })).toThrow(/per row/i)
  })

  it('refuses a serial entered twice, case-insensitively', () => {
    const units = [
      { serial: 'sn-1', condition: 'Good' as const, clientUuid: 'k1' },
      { serial: 'SN-1', condition: 'Good' as const, clientUuid: 'k2' },
    ]
    expect(() => check({ units })).toThrow(/twice/i)
  })

  it('refuses serialised units with no warehouse — product_units.warehouse_id is NOT NULL, a draft included', () => {
    expect(() => check({ warehouseId: undefined, warehouseName: undefined, location: undefined })).toThrow(
      /warehouse/i,
    )
  })

  it('refuses a quantity record with no quantity', () => {
    expect(() => check({ tracking: 'Quantity', units: undefined, quantity: 0 })).toThrow(/at least 1/i)
  })

  it('refuses a deposit percentage outside 0–100 — products_deposit_pct_range', () => {
    expect(() => check({ depositPercent: 150 })).toThrow(/0 to 100/)
  })
})

describe('CREATE_EQUIPMENT — the write', () => {
  const run = (patch: Partial<CreateEquipmentInput> = {}) => createEquipmentConfig.execute({ ...EQ_INPUT, ...patch }, CTX)

  it('takes the asset code from next_document_number(equipment), never from the clock', async () => {
    const { result } = await run()
    expect(db.state.rpcCalls).toContainEqual({ fn: 'next_document_number', args: { p_sequence_key: 'equipment' } })
    expect(result.assetCode).toBe('EQ000123')
  })

  it('writes the products row under the caller’s client_uuid with the resolved category and the actor', async () => {
    await run()
    const [row] = insertsInto('products')
    expect(row?.payload['client_uuid']).toBe(EQ_INPUT.clientUuid)
    expect(row?.payload['category_id']).toBe('cat-camera-uuid')
    expect(row?.payload['created_by']).toBe(CTX.userId)
    expect(row?.payload['name']).toBe('Sony FX6 Cinema Camera')
  })

  it('crosses money exactly once — Paisa in the input, rupees in the payload', async () => {
    await run()
    const [row] = insertsInto('products')
    expect(row?.payload['daily_rate']).toBe(4500)
    expect(row?.payload['replacement_value']).toBe(465000)
    // Blank money fields are ABSENT, never zeroed.
    expect(row?.payload).not.toHaveProperty('weekly_rate')
    expect(row?.payload).not.toHaveProperty('deposit_fixed')
  })

  it('derives asset tags from the code the database issued — the “Assigned on save” placeholder can never land', async () => {
    await run()
    const units = insertsInto('product_units')
    expect(units.map((u) => u.payload['asset_tag'])).toEqual(['EQ000123-01', 'EQ000123-02'])
    expect(units[0]?.payload['serial_no']).toBe('SN-FX6-001')
    expect(units[0]?.payload['client_uuid']).toBe('22222222-2222-4222-8222-222222222221')
    expect(units[0]?.payload['warehouse_id']).toBe('wh-vault-uuid')
    expect(units[0]?.payload['branch_id']).toBe('br-ktm-uuid')
  })

  it('never writes a unit status — inventory_state is engine-owned and defaults to In Stock', async () => {
    await run()
    for (const u of insertsInto('product_units')) expect(u.payload).not.toHaveProperty('status')
  })

  it('logs the products row through lib/audit — the table has no audit trigger', async () => {
    await run()
    const audits = insertsInto('audit_events')
    expect(audits.length).toBe(1)
    expect(audits[0]?.payload['table_name']).toBe('products')
    expect(audits[0]?.payload['action']).toBe('Create')
  })

  it('refuses a category the database does not hold, naming the two-universes gap', async () => {
    await expect(run({ category: 'Underwater Housing' })).rejects.toThrow(/not a category|different universe/i)
    expect(access.inserts.length).toBe(0)
  })

  it('refuses a warehouse id the database does not hold BEFORE anything is written', async () => {
    await expect(run({ warehouseId: 'wh-decommissioned-uuid' })).rejects.toThrow(/not a warehouse/i)
    expect(access.inserts.length).toBe(0)
  })

  it('still resolves a NAME when the caller sends no id — the fallback the transfer screen uses', async () => {
    await run({ warehouseId: undefined, warehouseName: 'Lakeside Equipment Hub' })
    const units = insertsInto('product_units')
    expect(units[0]?.payload['warehouse_id']).toBe('wh-lakeside-uuid')
    expect(units[0]?.payload['branch_id']).toBe('br-pkr-uuid')
  })

  /*
   * The regression this whole change exists for. Add Equipment's picker was
   * built from `data/warehouse.ts`'s four seed facilities, and NOT ONE of them
   * is a row in `warehouses`. `product_units.warehouse_id` is NOT NULL, so
   * every serialised save was refused here — after the form had already
   * reported "Ready to Rent — all gates clear". The picker now reads the table
   * (`lib/queries/warehouses.ts`), and these four names must stay unresolvable
   * so that reverting the picker to the seed list fails loudly.
   */
  it('refuses every one of the four seed facility names the picker used to offer', async () => {
    const seedFacilities = [
      'Kathmandu Main Hub (HQ)',
      'Patan Studio Depository',
      'Pokhara Regional Hub',
      'Bhaktapur Heavy Grip & Rigging',
    ]
    for (const name of seedFacilities) {
      await expect(run({ warehouseId: undefined, warehouseName: name })).rejects.toThrow(/not a warehouse/i)
    }
    expect(access.inserts.length).toBe(0)
  })

  it('refuses when the allocator fails, rather than inventing a code', async () => {
    db.state.rpc = { data: null, error: { message: 'Number sequence equipment does not exist' } }
    await expect(run()).rejects.toThrow(/could not allocate/i)
    expect(access.inserts.length).toBe(0)
  })

  it('treats a queued insert as NOT saved — the echoed payload has no id', async () => {
    access.insertResults['products'] = { data: { name: 'echo, no id' }, error: null }
    await expect(run()).rejects.toThrow(/queued rather than written/i)
  })

  it('a unit failure names what DID land and that a resubmit resolves to it — Law 8', async () => {
    access.insertThrows['product_units'] = 'duplicate key value violates unique constraint "product_units_serial_no_key"'
    await expect(run()).rejects.toThrow(/WAS created as EQ000123[\s\S]*already belongs/i)
  })

  it('refuses offline instead of queueing a record with no code the registry issued', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    await expect(run()).rejects.toThrow(/offline/i)
    expect(access.inserts.length).toBe(0)
  })
})

/* ═══════════════════════ CREATE_STOCK_TRANSFER ═══════════════════════ */

describe('CREATE_STOCK_TRANSFER — validate', () => {
  const check = (patch: Partial<CreateStockTransferInput> = {}) => createStockTransferConfig.validate({ ...TR_INPUT, ...patch })

  it('refuses a transfer from a warehouse to itself', () => {
    expect(() => check({ destinationWarehouseId: TR_INPUT.sourceWarehouseId })).toThrow(/different warehouses/i)
  })

  it('refuses a facility named but not identified, and vice versa — one of each pair is required', () => {
    expect(() => check({ sourceWarehouseId: undefined })).toThrow(/source warehouse is required/i)
    expect(() => check({ destinationWarehouseId: undefined })).toThrow(/destination warehouse is required/i)
  })

  it('cannot tell an id from a name here — which is why execute re-checks after resolving', () => {
    /* Endpoints are compared like with like, so identifying the SAME facility
       once by uuid and once by name gets past this gate. `validate` has no
       database, so it cannot know the two denote one warehouse; the write
       refuses it after both rows resolve (see the execute test below). */
    expect(() =>
      check({ destinationWarehouseId: undefined, destinationWarehouse: 'Central Camera Vault' }),
    ).not.toThrow()
  })

  it('refuses a transfer that moves nothing — stock_transfer_lines.product_id is NOT NULL', () => {
    expect(() => check({ productId: undefined, assetName: '  ' })).toThrow(/cannot move nothing/i)
  })

  it('refuses missing Law 8 keys, header and line separately', () => {
    expect(() => check({ clientUuid: '' })).toThrow(/idempotency key/i)
    expect(() => check({ lineClientUuid: '' })).toThrow(/per row/i)
  })

  it('refuses a label transfer_kind has no member for', () => {
    expect(() => check({ transferType: 'Sideways Shuffle' as never })).toThrow(/not a transfer type/i)
  })
})

describe('CREATE_STOCK_TRANSFER — the write', () => {
  const run = (patch: Partial<CreateStockTransferInput> = {}) => createStockTransferConfig.execute({ ...TR_INPUT, ...patch }, CTX)

  beforeEach(() => {
    db.state.rpc = { data: 'TRANSFER-2026-0001', error: null }
  })

  it('takes the number from next_document_number(transfer) and returns what the database issued', async () => {
    const { result } = await run()
    expect(db.state.rpcCalls).toContainEqual({ fn: 'next_document_number', args: { p_sequence_key: 'transfer' } })
    expect(result.transferNo).toBe('TRANSFER-2026-0001')
    expect(result.status).toBe('Pending')
  })

  it('resolves both facilities to uuids and translates the UI label onto the plural enum member', async () => {
    await run()
    const [header] = insertsInto('stock_transfers')
    expect(header?.payload['source_warehouse_id']).toBe('wh-vault-uuid')
    expect(header?.payload['source_branch_id']).toBe('br-ktm-uuid')
    expect(header?.payload['destination_warehouse_id']).toBe('wh-lakeside-uuid')
    expect(header?.payload['transfer_type']).toBe('Branch Transfers')
    expect(header?.payload['requested_by']).toBe(CTX.userId)
    expect(header?.payload['notes']).toBe('Lakeside shoot, back Friday')
    // Status is the column default — never sent, so a created transfer opens Pending.
    expect(header?.payload).not.toHaveProperty('status')
  })

  it('writes the line under its OWN Law 8 key, carrying the resolved product and unit', async () => {
    await run()
    const [line] = insertsInto('stock_transfer_lines')
    expect(line?.payload['client_uuid']).toBe(TR_INPUT.lineClientUuid)
    expect(line?.payload['product_id']).toBe('prod-fx3-uuid')
    expect(line?.payload['product_unit_id']).toBe('unit-fx3-uuid')
    expect(line?.payload['requested_quantity']).toBe(1)
  })

  it('refuses an asset name the catalogue cannot resolve, writing nothing', async () => {
    await expect(run({ productId: undefined, assetName: 'Mystery Box' })).rejects.toThrow(/matches no product/i)
    expect(access.inserts.length).toBe(0)
  })

  it('refuses a product id the catalogue no longer holds, and says the catalogue moved', async () => {
    await expect(run({ productId: 'prod-deleted-uuid' })).rejects.toThrow(/no product has id/i)
    expect(access.inserts.length).toBe(0)
  })

  it('still resolves facilities and asset by NAME when no ids are sent', async () => {
    await run({
      sourceWarehouseId: undefined,
      destinationWarehouseId: undefined,
      productId: undefined,
      sourceWarehouse: 'Central Camera Vault',
      destinationWarehouse: 'Lakeside Equipment Hub',
      assetName: 'Sony FX3 Full-Frame Camera',
    })
    const [header] = insertsInto('stock_transfers')
    expect(header?.payload['source_warehouse_id']).toBe('wh-vault-uuid')
    expect(header?.payload['destination_warehouse_id']).toBe('wh-lakeside-uuid')
  })

  /*
   * The regression this change exists for. The transfer form defaulted its
   * endpoints to `data/warehouse.ts`'s seed facilities and sent the NAME, and
   * none of the four is a row in `warehouses` — so every transfer save was
   * refused on the source lookup. These names must stay unresolvable.
   */
  it('refuses every one of the four seed facility names the form used to send', async () => {
    const seedFacilities = [
      'Kathmandu Main Hub (HQ)',
      'Patan Studio Depository',
      'Pokhara Regional Hub',
      'Bhaktapur Heavy Grip & Rigging',
    ]
    for (const name of seedFacilities) {
      await expect(
        run({ sourceWarehouseId: undefined, sourceWarehouse: name }),
      ).rejects.toThrow(/is not a warehouse the database knows/i)
    }
    expect(access.inserts.length).toBe(0)
  })

  it('refuses a transfer whose endpoints RESOLVE to one facility, however they were named', async () => {
    await expect(
      run({ destinationWarehouseId: undefined, destinationWarehouse: 'Central Camera Vault' }),
    ).rejects.toThrow(/both Central Camera Vault/i)
    expect(access.inserts.length).toBe(0)
  })

  it('refuses a serial that belongs to a different product', async () => {
    db.state.tables['products'] = [
      ...(db.state.tables['products'] ?? []),
      { id: 'prod-other-uuid', name: 'DJI RS3 Pro' },
    ]
    db.state.tables['product_units'] = [{ id: 'unit-x', product_id: 'prod-other-uuid', serial_no: 'SN-FX3-003' }]
    await expect(run()).rejects.toThrow(/different product/i)
    expect(access.inserts.length).toBe(0)
  })

  it('surfaces the missing transfer sequence as a migration, not a retry — the TR-vs-TRF TODO(decision)', async () => {
    db.state.rpc = { data: null, error: { message: 'Number sequence transfer does not exist' } }
    await expect(run()).rejects.toThrow(/migration, not a retry/i)
    expect(access.inserts.length).toBe(0)
  })

  it('a line failure names the header that DID land and the Law 8 retry path', async () => {
    access.insertThrows['stock_transfer_lines'] = 'network hiccup'
    await expect(run()).rejects.toThrow(/TRANSFER-2026-0001 WAS raised/i)
  })
})

/* ═══════════════════════ APPROVE_PURCHASE_REQUEST ═══════════════════════ */

describe('APPROVE_PURCHASE_REQUEST — validate', () => {
  const check = (patch: Partial<ApprovePurchaseRequestInput> = {}) =>
    approvePurchaseRequestConfig.validate({ ...PR_INPUT, ...patch })

  it('refuses a decision this action does not record', () => {
    expect(() => check({ decision: 'Cancelled' as never })).toThrow(/not a decision/i)
  })

  it('refuses a decision with no idempotency key — Law 8', () => {
    expect(() => check({ clientUuid: '' })).toThrow(/idempotency key/i)
  })
})

describe('APPROVE_PURCHASE_REQUEST — the write', () => {
  const run = (patch: Partial<ApprovePurchaseRequestInput> = {}) =>
    approvePurchaseRequestConfig.execute({ ...PR_INPUT, ...patch }, CTX)

  it('resolves the PR by its number and updates under the caller’s Law 8 key', async () => {
    const { result } = await run()
    const [update] = access.updates
    expect(update?.table).toBe('purchase_requests')
    expect(update?.id).toBe('pr-row-uuid')
    expect(update?.clientUuid).toBe(PR_INPUT.clientUuid)
    expect(update?.patch['status']).toBe('Approved')
    expect(result.prId).toBe('pr-row-uuid')
  })

  it('stamps approved_by with the session on Approve — and never on Ordered, keeping the approver intact', async () => {
    await run()
    expect(access.updates[0]?.patch['approved_by']).toBe(CTX.userId)

    access.updates.length = 0
    db.state.tables['purchase_requests'] = [{ id: 'pr-row-uuid', pr_no: 'PR-2026-0012', status: 'Approved' }]
    access.updateResult = { data: { id: 'pr-row-uuid', pr_no: 'PR-2026-0012', status: 'Ordered' }, error: null }
    await run({ decision: 'Ordered' })
    expect(access.updates[0]?.patch).not.toHaveProperty('approved_by')
  })

  it('refuses an illegal move by name — purchase_request_status is forward-only', async () => {
    await expect(run({ decision: 'Ordered' })).rejects.toThrow(/only reachable from Approved/i)
    expect(access.updates.length).toBe(0)
  })

  it('refuses a PR number the database does not hold — the seed register’s honest outcome today', async () => {
    await expect(run({ prNo: 'PR-2026-9999' })).rejects.toThrow(/does not exist in the database/i)
    expect(access.updates.length).toBe(0)
  })

  it('treats an optimistic echo as NOT recorded — it carries no pr_no read back from the store', async () => {
    access.updateResult = { data: { id: 'pr-row-uuid', status: 'Approved' }, error: null }
    await expect(run()).rejects.toThrow(/queued rather than written/i)
  })

  it('logs the decision with old and new status — purchase_requests has no audit trigger', async () => {
    await run()
    const audits = insertsInto('audit_events')
    expect(audits[0]?.payload['action']).toBe('Approve')
    expect(audits[0]?.payload['old_values']).toEqual({ status: 'Submitted' })
    expect(audits[0]?.payload['new_values']).toEqual({ status: 'Approved' })
  })

  it('refuses offline instead of queueing a decision onto a state nobody looked at', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    await expect(run()).rejects.toThrow(/offline/i)
    expect(access.updates.length).toBe(0)
  })
})

/* ═══════════════════════ CREATE_BUNDLE ═══════════════════════ */

describe('CREATE_BUNDLE — validate', () => {
  const check = (patch: Partial<CreateBundleInput> = {}) => createBundleConfig.validate({ ...BND_INPUT, ...patch })

  it('refuses a bundle with no name — bundles.name is NOT NULL', () => {
    expect(() => check({ name: '  ' })).toThrow(/name/i)
  })

  it('refuses a submit with no idempotency key — Law 8', () => {
    expect(() => check({ clientUuid: '' })).toThrow(/idempotency key/i)
  })

  it('refuses a line without its own per-row key — Law 8 is one per ROW', () => {
    const items = [{ modelId: 'M-X', productName: 'X', qty: 1, clientUuid: '' }]
    expect(() => check({ items })).toThrow(/per row/i)
  })

  it('refuses a line quantity below 1 — bundle_items_qty_positive', () => {
    const items = [{ modelId: 'M-X', productName: 'X', qty: 0, clientUuid: 'k1' }]
    expect(() => check({ items })).toThrow(/below 1/i)
  })

  it('accepts an over-10% discount with no reason or approver — the gate is gone (Law 10 amended 31 Aug 2026)', () => {
    const items = [{ modelId: 'M-X', productName: 'X', qty: 1, discountPct: 15, clientUuid: 'k1' }]
    expect(() => check({ items })).not.toThrow()
  })

  it('still refuses an arithmetic non-discount — negative, or past 100%', () => {
    expect(() => check({ items: [{ modelId: 'M-X', productName: 'X', qty: 1, discountPct: -5, clientUuid: 'k1' }] })).toThrow(/negative/i)
    expect(() => check({ items: [{ modelId: 'M-X', productName: 'X', qty: 1, discountPct: 140, clientUuid: 'k1' }] })).toThrow(/negative price/i)
  })
})

describe('CREATE_BUNDLE — the write', () => {
  const run = (patch: Partial<CreateBundleInput> = {}) => createBundleConfig.execute({ ...BND_INPUT, ...patch }, CTX)

  beforeEach(() => {
    db.state.rpc = { data: 'BND-7', error: null }
  })

  it('takes the bundle code from next_document_number(bundle), never from clock digits', async () => {
    const { result } = await run()
    expect(db.state.rpcCalls).toContainEqual({ fn: 'next_document_number', args: { p_sequence_key: 'bundle' } })
    expect(result.bundleCode).toBe('BND-7')
    expect(result.bundleId).toBe('bundle-new-uuid')
  })

  it('writes the resolved category uuid into category_id — never the display name', async () => {
    await run()
    const [row] = insertsInto('bundles')
    expect(row?.payload['category_id']).toBe('cat-camera-uuid')
    expect(row?.payload['client_uuid']).toBe(BND_INPUT.clientUuid)
    expect(row?.payload['created_by']).toBe(CTX.userId)
    expect(row?.payload['name']).toBe('Sony FX3 Documentary Kit')
    expect(row?.payload['bundle_code']).toBe('BND-7')
  })

  it('omits category_id entirely when a draft has no category — never an empty string', async () => {
    // `exactOptionalPropertyTypes` — an absent category is ABSENT, not undefined.
    const { categoryId: _droppedId, category: _dropped, ...noCategory } = BND_INPUT
    const { result } = await createBundleConfig.execute({ ...noCategory, isDraft: true }, CTX)
    const [row] = insertsInto('bundles')
    expect(row?.payload).not.toHaveProperty('category_id')
    expect(row?.payload['is_active']).toBe(false)
    expect(result.bundleCode).toBe('BND-7')
  })

  it('crosses money exactly once — Paisa in the input, rupees in the payload, absent stays absent', async () => {
    await run()
    const [row] = insertsInto('bundles')
    expect(row?.payload['daily_rate']).toBe(18000)
    // The screen collects no weekly rate; the column default speaks, not a fabricated zero.
    expect(row?.payload).not.toHaveProperty('weekly_rate')
  })

  it('writes each line under its OWN Law 8 key with the RESOLVED products uuid — the seed id can never land', async () => {
    await run()
    const rows = insertsInto('bundle_items')
    expect(rows.map((r) => r.payload['product_id'])).toEqual(['prod-fx3-uuid', 'prod-nisi35-uuid'])
    expect(rows.map((r) => r.payload['client_uuid'])).toEqual([
      '55555555-5555-4555-8555-555555555552',
      '55555555-5555-4555-8555-555555555553',
    ])
    expect(rows.map((r) => r.payload['sort_order'])).toEqual([0, 1])
    expect(rows[0]?.payload['bundle_id']).toBe('bundle-new-uuid')
    expect(rows[0]?.payload['days']).toBe(1)
    for (const r of rows) expect(String(r.payload['product_id'])).not.toMatch(/^M-/)
  })

  it('refuses a line the products table cannot resolve, naming the line and the FK, writing nothing', async () => {
    const items = [{ modelId: 'M-GHOST', productName: 'Phantom Rig 3000', qty: 1, clientUuid: 'k1' }]
    await expect(run({ items })).rejects.toThrow(
      /Phantom Rig 3000[\s\S]*M-GHOST[\s\S]*match a products row exactly/i,
    )
    expect(access.inserts.length).toBe(0)
  })

  it('refuses a product id the catalogue no longer holds, and says the catalogue moved', async () => {
    const items = [{ modelId: 'M-X', productId: 'prod-deleted-uuid', qty: 1, clientUuid: 'k1' }]
    await expect(run({ items })).rejects.toThrow(/no product has id/i)
    expect(access.inserts.length).toBe(0)
  })

  it('refuses a line that names no product at all — bundle_items.product_id is NOT NULL', () => {
    expect(() =>
      createBundleConfig.validate({ ...BND_INPUT, items: [{ modelId: 'M-X', qty: 1, clientUuid: 'k1' }] }),
    ).toThrow(/names no product/i)
  })

  it('still resolves a category and a line by NAME when no ids are sent', async () => {
    await run({
      categoryId: undefined,
      category: 'Camera',
      items: [{ modelId: 'M-FX3-BODY', productName: 'Sony FX3 Full-Frame Camera', qty: 1, clientUuid: 'k1' }],
    })
    const [row] = insertsInto('bundles')
    expect(row?.payload['category_id']).toBe('cat-camera-uuid')
    const lines = insertsInto('bundle_items')
    expect(lines[0]?.payload['product_id']).toBe('prod-fx3-uuid')
  })

  it('refuses a category the database does not hold BEFORE anything is written', async () => {
    await expect(run({ categoryId: undefined, category: 'DIT' })).rejects.toThrow(/not a category/i)
    expect(access.inserts.length).toBe(0)
  })

  it('refuses when the allocator fails, rather than inventing a code', async () => {
    db.state.rpc = { data: null, error: { message: 'Number sequence bundle does not exist' } }
    await expect(run()).rejects.toThrow(/could not allocate/i)
    expect(access.inserts.length).toBe(0)
  })

  it('turns a bundle_code collision into a sentence naming the sequence, not a retry', async () => {
    access.insertThrows['bundles'] = 'duplicate key value violates unique constraint "bundles_code_key"'
    await expect(run()).rejects.toThrow(/sequence.*behind|behind the codes/i)
  })

  it('treats a write the re-select cannot find as NOT saved — the queued/echo branches confirm nothing', async () => {
    db.state.tables['bundles'] = []
    await expect(run()).rejects.toThrow(/queued rather than written/i)
    expect(insertsInto('bundle_items').length).toBe(0)
  })

  it('a line failure names what DID land and that a resubmit resolves to it — Law 8', async () => {
    access.insertThrows['bundle_items'] = 'network hiccup'
    await expect(run()).rejects.toThrow(/WAS created as BND-7[\s\S]*Law 8/i)
  })

  it('refuses offline instead of queueing a bundle with no code the registry issued', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    await expect(run()).rejects.toThrow(/offline/i)
    expect(access.inserts.length).toBe(0)
  })
})

/* ═══════════════════════ the dispatcher gates ═══════════════════════ */

describe('the dispatcher — capability gates, as mapped (never widened here)', () => {
  it('denies inventory.create to Warehouse — canCreateBundle is Owner/Admin/Manager', async () => {
    await expect(
      createEquipment(EQ_INPUT, { userId: 'u-1', role: 'Warehouse', isOnline: true }),
    ).rejects.toThrow(/cannot perform "CREATE_EQUIPMENT"/i)
    await expect(
      createBundle(BND_INPUT, { userId: 'u-1', role: 'Warehouse', isOnline: true }),
    ).rejects.toThrow(/cannot perform "CREATE_BUNDLE"/i)
  })

  it('runs CREATE_BUNDLE end-to-end for a permitted role — implemented is TRUE and the body writes', async () => {
    db.state.rpc = { data: 'BND-7', error: null }
    const result = await createBundle(BND_INPUT, CTX)
    expect(result.bundleCode).toBe('BND-7')
    expect(insertsInto('bundles').length).toBe(1)
    expect(insertsInto('bundle_items').length).toBe(2)
  })

  it('denies inventory.transfer to Coordinator — the FLOOR set, desk excluded', async () => {
    await expect(
      createStockTransfer(TR_INPUT, { userId: 'u-1', role: 'Coordinator', isOnline: true }),
    ).rejects.toThrow(/cannot perform "CREATE_STOCK_TRANSFER"/i)
  })

  it('denies purchase.approve to the external Client role', async () => {
    await expect(
      approvePurchaseRequest(PR_INPUT, { userId: 'u-1', role: 'Client', isOnline: true }),
    ).rejects.toThrow(/cannot perform "APPROVE_PURCHASE_REQUEST"/i)
  })

  it('DENIES Driver, Technician and Warehouse purchase.approve — 0064 applied 23 Aug 2026', async () => {
    /* The old pin here ADMITTED Driver on purpose, to fail loudly the day the
       RLS narrowed. That day was 23 Aug 2026: purchase_requests_approval_rank
       (0064, RESTRICTIVE) is live, purchase.approve moved to
       canApprovePurchase (the finance/admin five), and this test now pins the
       narrow rule the same way the old one pinned the broad one. */
    for (const role of ['Driver', 'Technician', 'Warehouse'] as const) {
      await expect(
        approvePurchaseRequest(PR_INPUT, { userId: 'u-1', role, isOnline: true }),
      ).rejects.toThrow(/cannot perform "APPROVE_PURCHASE_REQUEST"/i)
    }
  })

  /* 0069 (25 Aug 2026) narrowed the verb again, to Owner and Manager only:
     Accounts may see the cost but no longer commits the business to it. */
  it('ADMITS Owner and Manager to purchase.approve — mirroring 0069', async () => {
    for (const role of ['Owner', 'Manager'] as const) {
      const result = await approvePurchaseRequest(PR_INPUT, { userId: 'u-1', role, isOnline: true })
      expect(result.status).toBe('Approved')
    }
  })

  it('DENIES Admin, Coordinator and Accounts purchase.approve — mirroring 0069', async () => {
    for (const role of ['Admin', 'Coordinator', 'Accounts'] as const) {
      await expect(
        approvePurchaseRequest(PR_INPUT, { userId: 'u-1', role, isOnline: true }),
      ).rejects.toThrow(/cannot perform "APPROVE_PURCHASE_REQUEST"/i)
    }
  })

  it('runs end-to-end for a permitted role — implemented is TRUE and the body writes', async () => {
    const result = await createEquipment(EQ_INPUT, CTX)
    expect(result.assetCode).toBe('EQ000123')
    expect(insertsInto('products').length).toBe(1)
    expect(insertsInto('product_units').length).toBe(2)
  })
})
