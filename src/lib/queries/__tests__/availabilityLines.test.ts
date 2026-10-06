import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssignmentPlan } from '../availability'

/* ── The database mock ─────────────────────────────────────────────────── */

const db = vi.hoisted(() => {
  interface Call {
    table: string
    columns: string
    ops: Array<[string, ...unknown[]]>
  }

  const state = {
    calls: [] as Call[],
    responses: {} as Record<string, unknown[][]>,
    updates: [] as Array<{ table: string; payload: unknown; ops: Array<[string, ...unknown[]]> }>,
  }

  function nextRows(table: string): unknown[] {
    const queue = state.responses[table]
    if (queue === undefined || queue.length === 0) return []
    return queue.length === 1 ? (queue[0] as unknown[]) : (queue.shift() as unknown[])
  }

  function from(table: string) {
    const call: Call = { table, columns: '', ops: [] }
    state.calls.push(call)

    const builder: Record<string, unknown> = {
      select(columns: string) {
        call.columns = columns
        return builder
      },
      eq(...a: unknown[]) {
        call.ops.push(['eq', ...a])
        return builder
      },
      in(...a: unknown[]) {
        call.ops.push(['in', ...a])
        return builder
      },
      is(...a: unknown[]) {
        call.ops.push(['is', ...a])
        return builder
      },
      order(...a: unknown[]) {
        call.ops.push(['order', ...a])
        return builder
      },
      update(payload: unknown) {
        state.updates.push({ table, payload, ops: call.ops })
        return builder
      },
      maybeSingle() {
        const rows = nextRows(table)
        return Promise.resolve({ data: rows[0] ?? null, error: null })
      },
      then(onOk: unknown, onErr: unknown) {
        return Promise.resolve({ data: nextRows(table), error: null }).then(onOk as never, onErr as never)
      },
    }
    return builder
  }

  function reset(): void {
    state.calls = []
    state.responses = {}
    state.updates = []
  }

  return { state, from, reset }
})

vi.mock('../../supabase', () => ({
  supabase: { from: db.from },
  newClientUuid: () => 'test-client-uuid',
}))

const dataAccess = vi.hoisted(() => {
  const state = {
    inserted: [] as Array<{ table: string; payload: Record<string, unknown> }>,
    failOnTable: null as string | null,
    failMessage: 'Simulated insert error',
    idSeq: 0,
  }

  function reset(): void {
    state.inserted = []
    state.failOnTable = null
    state.failMessage = 'Simulated insert error'
    state.idSeq = 0
  }

  return { state, reset }
})

vi.mock('../../dataAccess', () => ({
  insertViaSourceSwitch: async (table: string, payload: Record<string, unknown>) => {
    if (dataAccess.state.failOnTable === table) {
      return { data: null, error: { message: dataAccess.state.failMessage } }
    }
    const id = `${table}-row-${++dataAccess.state.idSeq}`
    dataAccess.state.inserted.push({ table, payload: { id, ...payload } })
    return { data: { id, ...payload }, error: null }
  },
}))

const { readLines, createBookingLineUnits, releaseBookingLineUnits, reserveAssignedUnits } =
  await import('../availability')

describe('readLines — bundle expansion and assignment lines', () => {
  beforeEach(() => {
    db.reset()
    dataAccess.reset()
  })

  it('collects direct product lines as assignable', async () => {
    db.state.responses['booking_lines'] = [
      [
        {
          id: 'line-1',
          product_id: 'prod-fx3',
          qty: 2,
          line_type: 'Product',
          description: 'Sony FX3 Cinema Camera',
          bundle_id: null,
          parent_line_id: null,
        },
      ],
    ]

    const { assignable, skipped } = await readLines('booking-123')

    expect(skipped).toEqual([])
    expect(assignable).toEqual([
      {
        lineId: 'line-1',
        productId: 'prod-fx3',
        label: 'Sony FX3 Cinema Camera',
        qty: 2,
      },
    ])
  })

  it('expands standalone bundle lines into member products using bundle_items and products_v', async () => {
    // 1 bundle line (qty 2) pointing to bundle-podcast
    db.state.responses['booking_lines'] = [
      [
        {
          id: 'line-bundle-1',
          product_id: null,
          qty: 2,
          line_type: 'Bundle',
          description: 'Podcast 2-Mic Kit',
          bundle_id: 'bundle-podcast',
          parent_line_id: null,
        },
      ],
    ]

    // bundle_items for bundle-podcast has 2 items: 1x mic (prod-sm7b) and 2x cable (prod-xlr)
    db.state.responses['bundle_items'] = [
      [
        { id: 'bi-1', bundle_id: 'bundle-podcast', product_id: 'prod-sm7b', quantity: 1 },
        { id: 'bi-2', bundle_id: 'bundle-podcast', product_id: 'prod-xlr', quantity: 2 },
      ],
    ]

    // products_v lookup for names
    db.state.responses['products_v'] = [
      [
        { id: 'prod-sm7b', name: 'Shure SM7B Vocal Mic' },
        { id: 'prod-xlr', name: 'Mogami XLR Cable 10ft' },
      ],
    ]

    const { assignable, skipped } = await readLines('booking-123')

    expect(skipped).toEqual([])
    expect(assignable).toHaveLength(2)
    // 2 kits * 1 mic = 2 mics
    expect(assignable[0]).toEqual({
      lineId: 'line-bundle-1',
      productId: 'prod-sm7b',
      label: 'Podcast 2-Mic Kit · Shure SM7B Vocal Mic',
      qty: 2,
    })
    // 2 kits * 2 cables = 4 cables
    expect(assignable[1]).toEqual({
      lineId: 'line-bundle-1',
      productId: 'prod-xlr',
      label: 'Podcast 2-Mic Kit · Mogami XLR Cable 10ft',
      qty: 4,
    })
  })

  it('skips parent bundle line when child lines already exist in booking, keeping child lines', async () => {
    // Parent line and 2 child lines
    db.state.responses['booking_lines'] = [
      [
        {
          id: 'line-parent',
          product_id: null,
          qty: 1,
          line_type: 'Bundle',
          description: 'Studio Lighting Kit',
          bundle_id: 'bundle-lights',
          parent_line_id: null,
        },
        {
          id: 'line-child-1',
          product_id: 'prod-aputure-300',
          qty: 1,
          line_type: 'Product',
          description: 'Aputure 300d II',
          bundle_id: 'bundle-lights',
          parent_line_id: 'line-parent',
        },
        {
          id: 'line-child-2',
          product_id: 'prod-aputure-60',
          qty: 2,
          line_type: 'Product',
          description: 'Aputure 60x',
          bundle_id: 'bundle-lights',
          parent_line_id: 'line-parent',
        },
      ],
    ]

    const { assignable, skipped } = await readLines('booking-123')

    // Parent is marked skipped as parent-only line
    expect(skipped).toEqual([
      {
        lineId: 'line-parent',
        label: 'Studio Lighting Kit',
        reason: 'Bundle parent line — individual member items are assigned on child lines.',
      },
    ])

    // Child lines are directly assignable
    expect(assignable).toEqual([
      {
        lineId: 'line-child-1',
        productId: 'prod-aputure-300',
        label: 'Aputure 300d II',
        qty: 1,
      },
      {
        lineId: 'line-child-2',
        productId: 'prod-aputure-60',
        label: 'Aputure 60x',
        qty: 2,
      },
    ])
  })

  it('marks standalone bundle line as skipped if no bundle_items are configured', async () => {
    db.state.responses['booking_lines'] = [
      [
        {
          id: 'line-empty-bundle',
          product_id: null,
          qty: 1,
          line_type: 'Bundle',
          description: 'Empty Custom Kit',
          bundle_id: 'bundle-empty',
          parent_line_id: null,
        },
      ],
    ]

    db.state.responses['bundle_items'] = [[]]

    const { assignable, skipped } = await readLines('booking-123')

    expect(assignable).toEqual([])
    expect(skipped).toEqual([
      {
        lineId: 'line-empty-bundle',
        label: 'Empty Custom Kit',
        reason: 'Bundle has no member items configured in bundle_items.',
      },
    ])
  })

  it('marks service and custom non-product lines as skipped', async () => {
    db.state.responses['booking_lines'] = [
      [
        {
          id: 'line-srv',
          product_id: null,
          qty: 1,
          line_type: 'Service',
          description: 'Camera Operator Day Rate',
          bundle_id: null,
          parent_line_id: null,
        },
      ],
    ]

    const { assignable, skipped } = await readLines('booking-123')

    expect(assignable).toEqual([])
    expect(skipped).toEqual([
      {
        lineId: 'line-srv',
        label: 'Camera Operator Day Rate',
        reason: 'Service lines name no product, so no serial can be assigned to them here.',
      },
    ])
  })
})

describe('createBookingLineUnits and releaseBookingLineUnits', () => {
  beforeEach(() => {
    db.reset()
    dataAccess.reset()
  })

  const mockPlan: AssignmentPlan = {
    bookingId: 'booking-uuid-1',
    bookingNo: 'B-800',
    window: { fromAd: '2026-08-20T09:00:00+05:45', toAd: '2026-08-22T18:00:00+05:45' },
    lines: [
      {
        line: { lineId: 'line-1', productId: 'prod-1', label: 'Sony A7S III', qty: 1 },
        outcome: {
          assigned: [
            {
              unitId: 'unit-u1',
              assetTag: 'EQ000100-U01',
              serialNo: 'SN1234',
              productId: 'prod-1',
              state: 'Available',
              retiredAt: null,
            },
          ],
          rejected: [],
          shortfall: 0,
        },
        problem: null,
      },
      {
        line: { lineId: 'line-2', productId: 'prod-2', label: 'Sony 24-70mm', qty: 1 },
        outcome: {
          assigned: [
            {
              unitId: 'unit-u2',
              assetTag: 'EQ000200-U01',
              serialNo: 'SN5678',
              productId: 'prod-2',
              state: 'Available',
              retiredAt: null,
            },
          ],
          rejected: [],
          shortfall: 0,
        },
        problem: null,
      },
    ],
    complete: true,
    skipped: [],
  }

  it('creates booking_line_units with Ready state and is_required true', async () => {
    const ids = await createBookingLineUnits(mockPlan, { userId: 'usr-warehouse' })

    expect(ids).toHaveLength(2)
    expect(dataAccess.state.inserted).toHaveLength(2)

    const first = dataAccess.state.inserted[0]!
    expect(first.table).toBe('booking_line_units')
    expect(first.payload['booking_line_id']).toBe('line-1')
    expect(first.payload['asset_id']).toBe('unit-u1')
    expect(first.payload['qty']).toBe(1)
    expect(first.payload['unit_state']).toBe('Ready')
    expect(first.payload['is_required']).toBe(true)
    expect(first.payload['packed']).toBe(false)
    expect(first.payload['created_by']).toBe('usr-warehouse')
  })

  it('rolls back previously created unit rows on failure via releaseBookingLineUnits', async () => {
    dataAccess.state.failOnTable = 'booking_line_units'

    await expect(createBookingLineUnits(mockPlan, { userId: 'usr-warehouse' })).rejects.toThrow(
      /Could not create unit assignment row/,
    )
  })

  it('releases booking_line_units via UPDATE without issuing DELETE (Law 3)', async () => {
    await releaseBookingLineUnits(['blu-1', 'blu-2'], 'Rolled back test')

    expect(db.state.updates).toHaveLength(2)
    for (const update of db.state.updates) {
      expect(update.table).toBe('booking_line_units')
      expect(update.payload).toEqual({
        asset_id: null,
        is_required: false,
      })
    }
  })
})

describe('reserveAssignedUnits — reservations and floor projection', () => {
  beforeEach(() => {
    db.reset()
    dataAccess.reset()
  })

  const mockPlan: AssignmentPlan = {
    bookingId: 'booking-uuid-1',
    bookingNo: 'B-800',
    window: { fromAd: '2026-08-20T09:00:00+05:45', toAd: '2026-08-22T18:00:00+05:45' },
    lines: [
      {
        line: { lineId: 'line-1', productId: 'prod-1', label: 'Sony A7S III', qty: 1 },
        outcome: {
          assigned: [
            {
              unitId: 'unit-u1',
              assetTag: 'EQ000100-U01',
              serialNo: 'SN1234',
              productId: 'prod-1',
              state: 'Available',
              retiredAt: null,
            },
          ],
          rejected: [],
          shortfall: 0,
        },
        problem: null,
      },
    ],
    complete: true,
    skipped: [],
  }

  it('writes both inventory_reservations and booking_line_units', async () => {
    const result = await reserveAssignedUnits(mockPlan, { userId: 'usr-warehouse' })

    expect(result.units).toBe(1)
    expect(result.reservationIds).toHaveLength(1)
    expect(result.unitRowIds).toHaveLength(1)

    // Check inventory_reservations insert
    const resInsert = dataAccess.state.inserted.find((i) => i.table === 'inventory_reservations')
    expect(resInsert).toBeDefined()
    expect(resInsert?.payload['asset_id']).toBe('unit-u1')
    expect(resInsert?.payload['period']).toContain('2026-08-20T09:00:00+05:45')

    // Check booking_line_units insert
    const bluInsert = dataAccess.state.inserted.find((i) => i.table === 'booking_line_units')
    expect(bluInsert).toBeDefined()
    expect(bluInsert?.payload['asset_id']).toBe('unit-u1')
    expect(bluInsert?.payload['unit_state']).toBe('Ready')
  })
})
