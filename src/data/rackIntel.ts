/**
 * Hover Intel System v2.1 — the Rack card.
 *
 * Unlike `clientIntel.ts` / `equipmentIntel.ts` / `bookingIntel.ts` /
 * `supplierIntel.ts`, there is no existing "this rack's contents" object
 * anywhere in the seed. `warehouse.ts`'s `StorageLocation` is a **bin-level**
 * record (one row = one Zone/Room/Rack/Shelf/Bin combination with its own
 * `capacity`/`used`); `inventory.ts`'s `ChildRow.location` and
 * `stockCheck.ts`'s `ExpectedUnit.location` are both free-text strings
 * authored independently of `StorageLocation.rack` — neither carries a
 * foreign key back to it. Everything below is therefore a **real join over
 * two unrelated string vocabularies**, not a lookup.
 *
 * Verified against the seed as it stands: not one `ChildRow.location` string
 * contains the word "Rack" (they read "Shelf A1", "Prep Bay 2", "With Client
 * › Vision Production", …), so `itemsInRack()` returns an empty array for
 * every rack today. That is the correct output of an honest join across two
 * vocabularies nobody has reconciled yet — not a bug in the join, and not a
 * reason to loosen the match until something lights up.
 *
 * JUDGMENT CALL: `ChildRow` carries no warehouse identifier at all, so
 * `itemsInRack` can only match on the rack id string, not on
 * (warehouse, rack) together. `STORAGE_LOCATIONS` shows "Rack 01" reused
 * across three different warehouses, so a future seed edit that put a
 * literal "Rack 01" substring into a `ChildRow.location` could in principle
 * match the wrong warehouse's Rack 01. Disambiguating that would mean adding
 * a `warehouseId` to `ChildRow`, which is a schema change this task's scope
 * (read-only join across existing files) does not license — flagged here
 * rather than silently assumed away. `binsInRack` and `lastStockCheckOf`,
 * which both key off a real `warehouseId`/`warehouse` name, do not have this
 * gap.
 */

import type { StorageLocation } from './warehouse'
import { WAREHOUSES, STORAGE_LOCATIONS } from './warehouse'
import type { ParentRow, ChildRow } from './inventory'
import { PARENTS } from './inventory'
import type { StockCheckSession, ExpectedUnit } from './stockCheck'
import { SAMPLE_STOCK_CHECKS } from './stockCheck'
import type { GateContext } from '../lib/fieldGating'
import type { IntelGlance, IntelGroup, IntelField } from '../components/ui/IntelCard'
import type { StatusKey } from '../lib/status'
import { formatAd } from '../lib/bs'

/**
 * Every `StorageLocation` (bin) that shares this row's `rack` id within the
 * same warehouse — a real StorageLocation→StorageLocation join on
 * `(warehouseId, rack)`, which is the closest thing this schema has to a
 * "rack" record of its own. Kathmandu HQ's "Rack 01" is two seeded bins
 * (`loc-01`, `loc-02`); most racks are a single bin.
 */
export function binsInRack(rack: StorageLocation): StorageLocation[] {
  return STORAGE_LOCATIONS.filter((l) => l.warehouseId === rack.warehouseId && l.rack === rack.rack)
}

/**
 * Catalogue units whose free-text `location` mentions this rack's id. See
 * the file header for why this is a substring match and why it is expected
 * to come back empty for most racks against today's seed.
 */
export function itemsInRack(rack: StorageLocation): ChildRow[] {
  const needle = rack.rack.toLowerCase()
  const matches: ChildRow[] = []
  for (const parent of PARENTS) {
    for (const child of parent.children ?? []) {
      if (child.location.toLowerCase().includes(needle)) matches.push(child)
    }
  }
  return matches
}

/** The catalogue parent a matched unit belongs to, for display only. */
export function parentOfChild(child: ChildRow): ParentRow | undefined {
  return PARENTS.find((p) => p.children?.includes(child))
}

/**
 * The most recent stock-check session that (a) ran in this rack's warehouse
 * and (b) logged at least one unit whose `location` mentions this rack —
 * a real join on `StockCheckSession.warehouse` (name) → `Warehouse.name` via
 * `warehouseId`, then `ExpectedUnit.location` substring on the rack id.
 * `SAMPLE_STOCK_CHECKS`'s completed "Full Warehouse" session (`sc-02`) has an
 * empty `units` array, so it cannot honestly confirm any specific rack —
 * it is correctly excluded rather than assumed to cover everything.
 */
export function lastStockCheckOf(rack: StorageLocation): { session: StockCheckSession; unit: ExpectedUnit } | undefined {
  const warehouse = WAREHOUSES.find((w) => w.id === rack.warehouseId)
  if (!warehouse) return undefined
  const needle = rack.rack.toLowerCase()

  let best: { session: StockCheckSession; unit: ExpectedUnit } | undefined
  for (const session of SAMPLE_STOCK_CHECKS) {
    if (session.warehouse !== warehouse.name) continue
    const unit = session.units.find((u) => u.location.toLowerCase().includes(needle))
    if (!unit) continue
    if (!best) {
      best = { session, unit }
      continue
    }
    const bestDate = best.session.completedAtAD ?? best.session.startedAtAD
    const thisDate = session.completedAtAD ?? session.startedAtAD
    if (thisDate.localeCompare(bestDate) > 0) best = { session, unit }
  }
  return best
}

/** "2026-08-06 09:00" → "6 Aug 2026 · 09:00". */
function formatCheckDate(session: StockCheckSession): string {
  const raw = session.completedAtAD ?? session.startedAtAD
  const [datePart, timePart] = raw.split(' ')
  const label = datePart ? formatAd(new Date(`${datePart}T00:00:00Z`)) : raw
  return timePart ? `${label} · ${timePart}` : label
}

export function rackGlance(rack: StorageLocation, _gctx: GateContext): IntelGlance {
  const warehouse = WAREHOUSES.find((w) => w.id === rack.warehouseId)
  const bins = binsInRack(rack)
  const capacity = bins.reduce((a, b) => a + b.capacity, 0)
  const used = bins.reduce((a, b) => a + b.used, 0)

  const items = itemsInRack(rack)
  const stored = items.filter((c) => c.booking === '—').length
  const out = items.filter((c) => c.status === 'On Rent').length
  const hasMissing = items.some((c) => c.status === 'Missing')
  const tone: StatusKey = hasMissing ? 'danger' : items.length > 0 ? 'in' : 'neutral'

  const check = lastStockCheckOf(rack)

  const lines: string[] = [
    items.length > 0
      ? `${stored} item${stored === 1 ? '' : 's'} stored · ${out} currently out`
      : 'No items currently logged against this rack',
    `Bin fill ${used}/${capacity} across ${bins.length} bin${bins.length === 1 ? '' : 's'}`,
    check ? `Last stock check ${formatCheckDate(check.session)} (${check.session.status})` : 'Not checked yet',
  ]

  return {
    avatarLabel: rack.rack.replace(/[^0-9]/g, '') || rack.rack.slice(0, 2).toUpperCase(),
    avatarIcon: 'queues',
    avatarTone: tone,
    title: rack.rack,
    statusDot: tone,
    subtitle: warehouse ? `${warehouse.name} · ${rack.zone}` : rack.zone,
    badges: [{ label: `${bins.length} bin${bins.length === 1 ? '' : 's'} seeded` }],
    lines,
  }
}

export function rackDetailGroups(rack: StorageLocation, _gctx: GateContext): IntelGroup[] {
  const warehouse = WAREHOUSES.find((w) => w.id === rack.warehouseId)
  const bins = binsInRack(rack)
  const capacity = bins.reduce((a, b) => a + b.capacity, 0)
  const used = bins.reduce((a, b) => a + b.used, 0)
  const items = itemsInRack(rack)
  const check = lastStockCheckOf(rack)

  const groups: IntelGroup[] = []

  groups.push({
    title: 'Location',
    fields: [
      { label: 'Warehouse', value: warehouse?.name ?? rack.warehouseId },
      { label: 'Room', value: rack.room },
      { label: 'Zone', value: rack.zone },
      { label: 'Rack', value: rack.rack },
      {
        label: 'Bins on this rack',
        value: bins.map((b) => `${b.shelf} · ${b.bin} (${b.used}/${b.capacity})`).join(', '),
      },
      { label: 'Rack fill', value: `${used}/${capacity} slots across ${bins.length} seeded bin${bins.length === 1 ? '' : 's'}` },
    ],
  })

  groups.push({
    title: 'Items in this rack',
    fields:
      items.length > 0
        ? items.map((c): IntelField => {
            const parent = parentOfChild(c)
            return {
              label: c.internalRef ? `${c.serial} (${c.internalRef})` : c.serial,
              value: `${parent?.name ?? 'Unknown item'} · ${c.status}`,
              trigger: { label: 'Open', to: `/inventory/${encodeURIComponent(c.serial)}` },
            }
          })
        : [{ label: 'Contents', value: 'No items currently logged against this rack' }],
  })

  groups.push({
    title: 'Stock check',
    fields: [
      {
        label: 'Last stock check',
        value: check
          ? `${formatCheckDate(check.session)} · ${check.session.status} (${check.session.sessionNo}) — logged at ${check.unit.location}`
          : 'Not checked yet',
        ...(check ? { trigger: { label: 'Open Stock Check', to: '/inventory/stock-check' } } : {}),
      },
    ],
  })

  return groups
}
