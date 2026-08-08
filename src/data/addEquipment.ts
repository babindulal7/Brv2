import { INVENTORY_MODELS, INVENTORY_CATEGORIES, BOX_CATEGORIES, MODEL_BY_ID } from './addBundle'
import type { InventoryModel } from './addBundle'
import { PARENTS } from './inventory'
import { BUNDLES } from './bundles'
import { UNITS as PACKED_UNITS } from './packing'
import { STORAGE_LOCATIONS } from './warehouse'

/**
 * **Add Equipment** seed — `06 Inventory/Add Equipment.md` v3.0 (Build Locked)
 * reconciled against `Add Equipment.PNG`.
 *
 * Nothing here is a new fact. Every list is *derived* from a module that already
 * owns it — the category list from `addBundle`, the container list from the same
 * catalogue, the existing-serial index from `inventory` + `packing`, the bundle
 * membership from `bundles`, the storage tree from `warehouse`. A second copy of
 * any of them is exactly the drift `Add Equipment.md §0 #10` names: *"a category
 * list that exists in two places with two contents."*
 *
 * Where the spec asks for a figure nobody has supplied — container capacity,
 * depreciation lives — this file supplies the **reason it is absent**, never a
 * number. `Add Equipment.md §16` still has those open with Babin.
 */

/* ── §3 · the category list ────────────────────────────────────────────── */

/**
 * §3's seventeen. `addBundle.INVENTORY_CATEGORIES` is the sixteen the Bundles
 * builder needs and is missing `Consumable`, because a bundle cannot contain
 * one — but §5.1 makes Consumable a **tracking mode**, and an item in that mode
 * still needs a category. So the one extra value is added here rather than the
 * whole list being retyped; `SEED_ERRORS` asserts the other sixteen still match
 * the catalogue exactly, so the two cannot drift apart silently.
 */
export const EQUIPMENT_CATEGORIES = [...INVENTORY_CATEGORIES, 'Consumable'].sort((a, b) =>
  a.localeCompare(b),
) as readonly string[]

/* ── §5.1 · tracking, one field ────────────────────────────────────────── */

export type TrackingMode = 'Serialised' | 'Quantity' | 'Consumable'

/**
 * §5.1 — this replaces `Equipment Type`, `Has Serial Number?` and `Tracking
 * Type`, the three controls the render asks the same question with. Three
 * controls for one fact can be set inconsistently; one cannot.
 */
export const TRACKING_MODES: ReadonlyArray<{ mode: TrackingMode; label: string; blurb: string }> = [
  { mode: 'Serialised', label: 'Serialised', blurb: 'One row per unit, each with the manufacturer serial. Stock is the unit count.' },
  { mode: 'Quantity', label: 'Quantity', blurb: 'No units. Stock is a count — cables, adapters, sandbags.' },
  { mode: 'Consumable', label: 'Consumable', blurb: 'A quantity that is consumed on return and never comes back — tape, gels, fluid.' },
]

/** §5.5 — the units a Quantity or Consumable line is counted in. */
export const QUANTITY_UNITS = ['piece', 'metre', 'roll', 'pack'] as const

/**
 * §5.4 — the intake condition, and it is **the same five Return & Inspection
 * v2.1 owns**. `Repair Required` is not one of them: §5.4 rules it a routing
 * outcome of Damaged, not a condition.
 */
export const INTAKE_CONDITIONS = ['Excellent', 'Good', 'Fair', 'Damaged', 'Lost'] as const
export type IntakeCondition = (typeof INTAKE_CONDITIONS)[number]

/* ── §4 · identifiers ──────────────────────────────────────────────────── */

/**
 * The record's Asset Code. §4 collapses the render's two auto identifiers —
 * `SKU EQ-CAM-000234` and `Unique Code EQ000234` — into this one, which is also
 * the SKU and drives the barcode and the QR.
 *
 * Derived from the catalogue count, the same reasoning `AddClient`'s
 * `NEXT_CLIENT_CODE` uses: a number this screen can defend rather than a
 * constant that drifts the moment a model is added.
 */
export const NEXT_ASSET_CODE = `EQ${String(INVENTORY_MODELS.length + 1).padStart(6, '0')}`

/**
 * §4 — the **Asset Tag** is our own printed label, one per unit, and it is the
 * only per-unit identifier that may be generated. The serial is the
 * manufacturer's and is typed or scanned, never minted.
 */
export function assetTagFor(assetCode: string, index: number): string {
  return `${assetCode}-${String(index + 1).padStart(2, '0')}`
}

/* ── §5.2 · serials are unique across the whole system ─────────────────── */

/**
 * Every serial the system already holds, upper-cased, mapped to the record that
 * holds it. §5.2: *"Every serial is unique across the whole system, not just
 * this record. Duplicate detection runs on blur and names the existing record."*
 * Naming it is the whole point, so this is a map and not a set.
 *
 * Two sources, because the system genuinely holds two: the inventory master
 * (`PARENTS`) and the units currently on a packing list (`packing.UNITS`).
 */
export const EXISTING_SERIALS: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>()
  for (const p of PARENTS) {
    for (const c of p.children ?? []) {
      if (c.serial) m.set(c.serial.toUpperCase(), p.name)
    }
  }
  for (const u of PACKED_UNITS) {
    if (u.serial && !m.has(u.serial.toUpperCase())) m.set(u.serial.toUpperCase(), u.name)
  }
  return m
})()

/** §7 — duplicate detection on name + model, not only on serial. */
export function existingModelMatch(name: string, model: string): InventoryModel | null {
  const n = name.trim().toLowerCase()
  const mdl = model.trim().toLowerCase()
  if (n.length < 3 && mdl.length < 3) return null
  return (
    INVENTORY_MODELS.find(
      (m) => m.name.toLowerCase() === n || (mdl.length >= 3 && m.sku.toLowerCase().includes(mdl)),
    ) ?? null
  )
}

/* ── §6 · the three relationship classes ───────────────────────────────── */

/** §6.1 — containment. Only a Case or a Bag can be a container. */
export const CONTAINER_MODELS: readonly InventoryModel[] = INVENTORY_MODELS.filter((m) =>
  BOX_CATEGORIES.has(m.category),
).sort((a, b) => a.name.localeCompare(b.name))

/** Everything attachable as a contained item, a compatible item or a requirement. */
export const ATTACHABLE_MODELS: readonly InventoryModel[] = [...INVENTORY_MODELS].sort((a, b) =>
  a.name.localeCompare(b.name),
)

export const modelName = (id: string): string => MODEL_BY_ID.get(id)?.name ?? id

/**
 * §6.2 — kit membership, read-only here. Bundles are built in the Bundles tab;
 * this only shows where an item is already used, so a retirement's blast radius
 * is visible before it happens.
 */
export function bundlesUsing(name: string): string[] {
  const n = name.trim().toLowerCase()
  if (n.length < 3) return []
  return BUNDLES.filter((b) => b.lines.some((l) => l.model.toLowerCase() === n)).map((b) => b.name)
}

/**
 * §7 — auto-suggest children. *"Adding a Sony FX3 suggests battery, charger,
 * cable, cage, top handle, case, based on what other units of the same category
 * contain."* Derived from the catalogue's own parent/child edges, so the
 * suggestion is always something the warehouse actually stocks.
 */
export function suggestedChildrenFor(brand: string, category: string): InventoryModel[] {
  const b = brand.trim().toLowerCase()
  const c = category.trim().toLowerCase()
  if (!b && !c) return []
  const ids = new Set<string>()
  for (const m of INVENTORY_MODELS) {
    const brandHit = b.length >= 2 && m.brand.toLowerCase() === b
    const catHit = c.length >= 2 && m.category.toLowerCase() === c
    if (!brandHit && !catHit) continue
    for (const child of m.children ?? []) ids.add(child.id)
  }
  return [...ids].map((id) => MODEL_BY_ID.get(id)).filter((m): m is InventoryModel => Boolean(m))
}

/* ── §11 · the storage tree ────────────────────────────────────────────── */

export interface LocationChoice {
  id: string
  warehouseId: string
  room: string
  zone: string
  rack: string
  shelf: string
  bin: string
  capacity: number
  used: number
}

/** Warehouse › Zone › Rack › Shelf › Bin, straight off the warehouse module. */
export const LOCATIONS: readonly LocationChoice[] = STORAGE_LOCATIONS

export function locationsIn(warehouseId: string): LocationChoice[] {
  return LOCATIONS.filter((l) => l.warehouseId === warehouseId)
}

export function locationLabel(l: LocationChoice): string {
  return `${l.room} › ${l.zone} › ${l.rack} › ${l.shelf} › ${l.bin}`
}

/* ── stated absences — §16 is still open on all of these ───────────────── */

export const SAVE_UNAVAILABLE_REASON =
  'Equipment writes are not built yet — there is no data layer behind this form. Both buttons validate the record and report; nothing is stored.'

export const PREVIEW_UNAVAILABLE_REASON =
  'Preview needs a saved record to open. Nothing is stored yet, so there is nothing to preview.'

export const LABEL_PRINT_UNAVAILABLE_REASON =
  'Label printing is not built. Asset tags are generated in Section 2 and shown per unit; the print path is Roadmap (§14).'

export const PACKING_PREVIEW_UNAVAILABLE_REASON =
  'A packing list preview needs a saved record with units. Nothing is stored yet.'

/**
 * §10.1 asks for a depreciation group; §16 ⭐ still asks Babin *"what lives does
 * your accountant use?"*. Seeding a life would be inventing the one fact the
 * question is about, so the control states the gap instead.
 */
export const DEPRECIATION_UNAVAILABLE_REASON =
  'TODO(decision) — depreciation groups are undefined. Add Equipment §16 asks which asset lives the accountant uses; none may be invented here.'

/**
 * §6.1 — *"The container has a capacity; exceeding it warns."* No container in
 * this project's item master carries one, so the warning cannot fire yet.
 */
export const CONTAINER_CAPACITY_REASON =
  'TODO(decision) — no container in the item master carries a capacity, so §6.1’s over-capacity warning cannot be computed. Storage bins do carry one and are checked in Section 4.'

/* ── seed invariants — reported, never thrown ──────────────────────────── */

/**
 * A module-scope `throw` runs before React mounts and blanks the app with no
 * message (see the note in `lib/money.ts`). These are reported and the screen
 * renders them.
 */
export const SEED_ERRORS: string[] = (() => {
  const errs: string[] = []

  for (const c of INVENTORY_CATEGORIES) {
    if (!EQUIPMENT_CATEGORIES.includes(c)) {
      errs.push(`§3: category "${c}" is in the Bundles catalogue but missing from the Add Equipment list.`)
    }
  }

  for (const m of INVENTORY_MODELS) {
    if (!EQUIPMENT_CATEGORIES.includes(m.category)) {
      errs.push(`§3: model ${m.sku} has category "${m.category}", which the Add Equipment list does not offer.`)
    }
  }

  /* §5.2 — a serial that names two different records makes "duplicate detection
     names the existing record" a lie, so the index itself is checked. */
  const seen = new Map<string, string>()
  for (const p of PARENTS) {
    for (const c of p.children ?? []) {
      const key = c.serial.toUpperCase()
      const prior = seen.get(key)
      if (prior && prior !== p.name) {
        errs.push(`§5.2: serial ${c.serial} is held by both "${prior}" and "${p.name}".`)
      }
      seen.set(key, p.name)
    }
  }

  if (!/^EQ\d{6}$/.test(NEXT_ASSET_CODE)) {
    errs.push(`§4: the Asset Code format is EQ + six digits; "${NEXT_ASSET_CODE}" does not match.`)
  }

  for (const l of LOCATIONS) {
    if (l.used > l.capacity) {
      errs.push(`§11: storage bin ${l.bin} reports ${l.used} used against a capacity of ${l.capacity}.`)
    }
  }

  return errs
})()
