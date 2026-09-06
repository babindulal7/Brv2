// @vitest-environment jsdom
/**
 * # Packing Workspace — what the dispatch actually says happened
 *
 * `buildRows` and `buildPackLines` are the whole distance between the marks an
 * operator makes on the floor and the rows the database ends up holding. Every
 * case here is a defect the screen shipped, and each one is invisible on screen:
 * the checklist looked right in all of them.
 *
 *  - **PK-06** — a MIXED line (some units packed, some missing) is dispatched
 *    as `'done'`, because `FloorLineInput` carries one outcome per booking line
 *    and `validateFloorVerb` refuses the same line id twice. `writePackingLine`
 *    then writes no `missing_reason` and `writeUnitStates` patches only the
 *    units named in `unitIds`, so no unit is recorded Missing. The engine
 *    cannot express this today; what is pinned here is that the page does not
 *    pretend otherwise — it reports the gap in `mixed` (rendered in the rail)
 *    and carries the reasons in `mixedNotes` rather than dropping them.
 *  - **PK-17a** — `serials` was `r.serial ?? ''`, writing an EMPTY STRING into
 *    `session_line_movements.serial` for a unit that has none. The arrays are
 *    paired positionally by `scannedUnits`, so the array is now sent only when
 *    every scanned row has a real serial.
 *  - **PK-17b** — `PackRow.location` was read by `buildRows` and never sent, so
 *    `packing_lines.warehouse_location` was null on every pack this screen has
 *    ever dispatched.
 *
 * The environment pragma is per `vitest.config.ts` (the suite defaults to
 * `node`); nothing here renders, but importing the module pulls in the whole
 * component tree, and jsdom is the cheap way to keep that import honest.
 */
import { describe, expect, it } from 'vitest'
import { buildRows, buildPackLines, packJobChip, type Mark, type PackRow } from '../PackingWorkspace'
import type { FloorBooking, FloorLine, FloorUnit } from '../../../lib/queries/bookings'

/* ── fixtures ────────────────────────────────────────────────────────────── */

function unit(over: Partial<FloorUnit> & { id: string }): FloorUnit {
  return {
    assetId: `asset-${over.id}`,
    serial: `SN-${over.id}`,
    assetTag: null,
    unitState: 'Ready',
    isRequired: true,
    packed: false,
    damaged: false,
    location: 'A2-01',
    ...over,
  }
}

function line(over: Partial<FloorLine> & { id: string }): FloorLine {
  return {
    qty: 1,
    lineType: 'Equipment',
    description: null,
    productId: 'p-1',
    productName: 'Sony FX3',
    trackingMode: 'Serialised',
    parentLineId: null,
    sortOrder: 1,
    unitsPresence: 'present',
    units: [],
    ...over,
  }
}

function booking(lines: FloorLine[]): FloorBooking {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    bookingNo: 'B-901',
    stage: 'Booked',
    clientName: 'Himalayan Films',
    project: 'Documentary',
    pickupAtAd: null,
    returnAtAd: null,
    actualReturnAtAd: null,
    deliveryType: 'Customer Pickup',
    isCancelled: false,
    isClosed: false,
    linesPresence: 'present',
    lines,
  }
}

/** Mark by row key, so a test states its marks in the screen's own terms. */
function marksOf(rows: readonly PackRow[], spec: Record<number, Mark>): Record<string, Mark> {
  const out: Record<string, Mark> = {}
  for (const [i, mark] of Object.entries(spec)) {
    const row = rows[Number(i)]
    if (row === undefined) throw new Error(`fixture names row ${i}, which does not exist`)
    out[row.key] = mark
  }
  return out
}

const PACKED: Mark = { state: 'Packed', packedAtIso: '2026-09-06T04:00:00.000Z', via: 'scan' }
const HAND: Mark = { state: 'Packed', packedAtIso: '2026-09-06T04:00:00.000Z', via: 'manual' }
const MISSING: Mark = { state: 'Missing', reason: 'not on the shelf, cage was empty' }

/* ── PK-06 ───────────────────────────────────────────────────────────────── */

describe('PK-06 — a line resolved both ways', () => {
  const floor = booking([
    line({
      id: 'l-1',
      qty: 2,
      units: [unit({ id: 'u1' }), unit({ id: 'u2' })],
    }),
  ])
  const rows = buildRows(floor)
  const marks = marksOf(rows, { 0: PACKED, 1: MISSING })
  const plan = buildPackLines(floor.lines, rows, marks)

  it('sends ONE entry for the line, carrying only the packed unit', () => {
    expect(plan.payload).toHaveLength(1)
    const [entry] = plan.payload
    expect(entry?.bookingLineId).toBe('l-1')
    // Not 'missing': that outcome would stamp Missing on the packed unit too,
    // because `writeUnitStates` scopes its missing patch to the same `unitIds`.
    expect(entry?.outcome).toBeUndefined()
    expect(entry?.unitIds).toEqual(['asset-u1'])
    expect(entry?.qty).toBe(1)
  })

  it('reports the shortage it cannot record, rather than swallowing it', () => {
    expect(plan.mixed).toEqual([{ lineId: 'l-1', lineName: 'Sony FX3', missing: 1, total: 2 }])
    expect(plan.mixedNotes).toHaveLength(1)
    expect(plan.mixedNotes[0]).toContain('NOT recorded as missing')
    expect(plan.mixedNotes[0]).toContain('not on the shelf, cage was empty')
    expect(plan.mixedNotes[0]).toContain('SN-u2')
  })

  it('does not name the missing unit as packed anywhere in the payload', () => {
    expect(JSON.stringify(plan.payload)).not.toContain('asset-u2')
  })
})

describe('PK-06 — a line that is entirely missing IS expressible', () => {
  const floor = booking([line({ id: 'l-1', qty: 2, units: [unit({ id: 'u1' }), unit({ id: 'u2' })] })])
  const rows = buildRows(floor)
  const plan = buildPackLines(floor.lines, rows, marksOf(rows, { 0: MISSING, 1: MISSING }))

  it('goes out as outcome missing with the reasons joined, and raises no mixed warning', () => {
    expect(plan.payload).toHaveLength(1)
    expect(plan.payload[0]?.outcome).toBe('missing')
    expect(plan.payload[0]?.reason).toBe('not on the shelf, cage was empty; not on the shelf, cage was empty')
    expect(plan.mixed).toEqual([])
    expect(plan.mixedNotes).toEqual([])
  })
})

describe('a line nobody touched is never named', () => {
  it('leaves an unmarked line out of the payload entirely (0003:630)', () => {
    const floor = booking([
      line({ id: 'l-1', units: [unit({ id: 'u1' })] }),
      line({ id: 'l-2', productName: 'Tripod', units: [unit({ id: 'u3' })] }),
    ])
    const rows = buildRows(floor)
    const plan = buildPackLines(floor.lines, rows, marksOf(rows, { 0: PACKED }))
    expect(plan.payload.map((p) => p.bookingLineId)).toEqual(['l-1'])
  })
})

/* ── PK-17 ───────────────────────────────────────────────────────────────── */

describe('PK-17 — an empty string is not a serial', () => {
  it('omits `serials` when any packed unit has none, rather than sending ""', () => {
    const floor = booking([
      line({
        id: 'l-1',
        qty: 2,
        units: [unit({ id: 'u1' }), unit({ id: 'u2', serial: null, assetTag: null })],
      }),
    ])
    const rows = buildRows(floor)
    const plan = buildPackLines(floor.lines, rows, marksOf(rows, { 0: PACKED, 1: HAND }))
    const [entry] = plan.payload
    // Both units still move — only the serial column stays honest.
    expect(entry?.unitIds).toEqual(['asset-u1', 'asset-u2'])
    expect(entry?.serials).toBeUndefined()
    expect(JSON.stringify(plan.payload)).not.toContain('""')
  })

  it('sends the serials when every packed unit has one', () => {
    const floor = booking([
      line({ id: 'l-1', qty: 2, units: [unit({ id: 'u1' }), unit({ id: 'u2' })] }),
    ])
    const rows = buildRows(floor)
    const plan = buildPackLines(floor.lines, rows, marksOf(rows, { 0: PACKED, 1: PACKED }))
    expect(plan.payload[0]?.serials).toEqual(['SN-u1', 'SN-u2'])
  })

  it('falls back to the asset tag, which is a real identifier', () => {
    const floor = booking([line({ id: 'l-1', units: [unit({ id: 'u1', serial: null, assetTag: 'EQ000001-U01' })] })])
    const rows = buildRows(floor)
    const plan = buildPackLines(floor.lines, rows, marksOf(rows, { 0: PACKED }))
    expect(plan.payload[0]?.serials).toEqual(['EQ000001-U01'])
  })
})

describe('PK-17 — the shelf the gear came off', () => {
  it('sends warehouseLocation when the packed units agree on one location', () => {
    const floor = booking([
      line({ id: 'l-1', qty: 2, units: [unit({ id: 'u1' }), unit({ id: 'u2' })] }),
    ])
    const rows = buildRows(floor)
    const plan = buildPackLines(floor.lines, rows, marksOf(rows, { 0: PACKED, 1: PACKED }))
    expect(plan.payload[0]?.warehouseLocation).toBe('A2-01')
  })

  it('sends none when they came off two shelves — one text column cannot hold both', () => {
    const floor = booking([
      line({ id: 'l-1', qty: 2, units: [unit({ id: 'u1' }), unit({ id: 'u2', location: 'B7-14' })] }),
    ])
    const rows = buildRows(floor)
    const plan = buildPackLines(floor.lines, rows, marksOf(rows, { 0: PACKED, 1: PACKED }))
    expect(plan.payload[0]?.warehouseLocation).toBeUndefined()
  })

  it('sends none for a quantity line, which resolves no shelf at all', () => {
    const floor = booking([line({ id: 'l-1', qty: 4, trackingMode: 'Quantity', units: [] })])
    const rows = buildRows(floor)
    const plan = buildPackLines(floor.lines, rows, marksOf(rows, { 0: HAND }))
    expect(plan.payload[0]?.warehouseLocation).toBeUndefined()
    expect(plan.payload[0]?.unitIds).toBeUndefined()
    expect(plan.payload[0]?.qty).toBe(4)
  })
})

/* ── PK-02, still true after the rewrite ─────────────────────────────────── */

describe('PK-02 — only packable lines are dispatched', () => {
  it('produces no row and no payload entry for a Service line', () => {
    const floor = booking([
      line({ id: 'l-1', lineType: 'Service', productName: 'Operator day rate', units: [] }),
    ])
    const rows = buildRows(floor)
    expect(rows).toEqual([])
    expect(buildPackLines(floor.lines, rows, {}).payload).toEqual([])
  })
})

/**
 * # PK-17c — the header chip and the danger box must not disagree
 *
 * A pack where every row is resolved and some units are MISSING is `'Complete'`
 * by `lib/workflow.ts`'s shared `JobState`. The header painted that state in
 * `--success-text` with a checklist icon — a green tick sitting directly beside
 * the danger-bordered box this same screen renders to say units are missing.
 *
 * The state is not the bug and is unchanged; the paint was.
 */
describe('PK-17c — a pack with missing units is not painted as a success', () => {
  it('does not use the success tone or the checklist when anything is missing', () => {
    const chip = packJobChip('Complete', 2)
    expect(chip.tone).not.toBe('var(--success-text)')
    expect(chip.icon).not.toBe('checklist')
  })

  it('says how many are missing in the LABEL, so the colour is never the only carrier', () => {
    expect(packJobChip('Complete', 2).label).toBe('Complete · 2 missing')
    expect(packJobChip('Complete', 1).label).toBe('Complete · 1 missing')
  })

  it('still reads as a plain success when nothing is missing', () => {
    const chip = packJobChip('Complete', 0)
    expect(chip).toEqual({ tone: 'var(--success-text)', icon: 'checklist', label: 'Complete' })
  })

  it('leaves the other two states alone — this changed one branch, not the chip', () => {
    expect(packJobChip('In Progress', 0).label).toBe('In Progress')
    expect(packJobChip('Not Started', 0).label).toBe('Not Started')
    // A count cannot arrive on a job nobody has touched, but if it did the
    // state would still be the honest answer rather than a missing-count.
    expect(packJobChip('Not Started', 3).label).toBe('Not Started')
  })
})
