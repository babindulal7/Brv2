import { supabase } from '../supabase'
import type { ServiceRow } from '../serviceDue'

/**
 * # `product_units_service_v` — the read
 *
 * RULING 2026-09-08 (R-28). The IO half of `lib/serviceDue.ts`: that module
 * decides how a due unit is SAID, this one fetches whether it is due. Neither
 * decides *that* it is due — migration `0103`'s view does, and it is the only
 * place that arithmetic exists.
 *
 * ## Why a view and not a computed column
 *
 * There is no `is_due` column anywhere, deliberately (Bundles v1.1 §1, restated
 * in R-28). A stored flag is wrong the moment the clock moves, and the job that
 * would keep it true is a second writer for a fact three tables already carry.
 * The cost is that this is a read per screen rather than a column on a row
 * already fetched — which is why every function here takes a LIST of unit ids
 * and returns a Map, so a table of forty units costs one round trip.
 *
 * ## Not in the generated types
 *
 * `src/types/supabase.ts` is generated from the live project, and `0103` is not
 * applied there (CLAUDE.md N-5 — Babin applies migrations, after the backup
 * step). So the view has no generated Row type yet and the shape below is
 * declared by hand, named column by column against `0103`'s own `select` list.
 * When the migration lands and the types are regenerated, this interface should
 * be replaced by the generated one and this paragraph deleted.
 *
 * ## Money-free, so every staff role may read it
 *
 * The view carries no money column at all — `0103` asserts that in a
 * post-condition rather than leaving it to a reviewer's eye — so there is no
 * Law 6 mask, no role branch here, and Warehouse and Technician see exactly what
 * a Manager sees. That is the whole reason the badge can appear on the Packing
 * Queue.
 */

/** The view's row, as PostgREST returns it (snake_case). */
interface ServiceViewRow {
  unit_id: string
  product_id: string
  last_service_at: string
  days_since_service: number
  rental_days_since_service: number
  meter_hours_since_service: number | string
  due_at: string | null
  due_reason: 'time' | 'usage' | null
  overdue_days: number | null
  service_interval_days: number | null
  service_interval_rental_days: number | null
  service_interval_meter_hours: number | string | null
  service_grace_days: number
}

const COLUMNS =
  'unit_id, product_id, last_service_at, days_since_service, rental_days_since_service, ' +
  'meter_hours_since_service, due_at, due_reason, overdue_days, service_interval_days, ' +
  'service_interval_rental_days, service_interval_meter_hours, service_grace_days'

/**
 * PostgREST returns `numeric` as a STRING, not a number — it is arbitrary
 * precision and JSON has no type for that. `meter_hours_since_service` and
 * `service_interval_meter_hours` are the two numerics here, and reading either
 * as a number without this conversion makes `42 >= 40` a string comparison that
 * happens to be right and `9 >= 40` a string comparison that is wrong.
 */
function toNumber(value: number | string | null): number {
  if (value === null) return 0
  return typeof value === 'number' ? value : Number.parseFloat(value)
}

function toRow(row: ServiceViewRow): ServiceRow {
  return {
    unitId: row.unit_id,
    productId: row.product_id,
    lastServiceAt: row.last_service_at,
    daysSinceService: row.days_since_service,
    rentalDaysSinceService: row.rental_days_since_service,
    meterHoursSinceService: toNumber(row.meter_hours_since_service),
    dueAt: row.due_at,
    dueReason: row.due_reason,
    overdueDays: row.overdue_days,
    serviceIntervalDays: row.service_interval_days,
    serviceIntervalRentalDays: row.service_interval_rental_days,
    serviceIntervalMeterHours:
      row.service_interval_meter_hours === null ? null : toNumber(row.service_interval_meter_hours),
    serviceGraceDays: row.service_grace_days,
  }
}

/**
 * Service state for a set of units, keyed by unit id.
 *
 * ⚠ **Never throws, and returns an empty Map on failure.** A badge is
 * decoration on a screen whose subject is something else: an inventory list, a
 * packing queue, an asset page. Failing those because a maintenance view could
 * not be read — including because `0103` is not applied to the project this
 * build points at, which is true of production today — would take a warning that
 * "warns only" (R-28) and let it block the work it was meant to inform.
 *
 * The silent-empty is therefore deliberate and is the ONLY silent failure in
 * this module. It is safe in one direction only: a unit that IS due can read as
 * not due. That is the same direction the whole feature already fails in — being
 * due changes nothing about whether a unit may go out.
 */
export async function readServiceDue(unitIds: readonly string[]): Promise<Map<string, ServiceRow>> {
  if (unitIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('product_units_service_v')
    .select(COLUMNS)
    .in('unit_id', [...unitIds])

  if (error) return new Map()

  const byUnit = new Map<string, ServiceRow>()
  for (const row of (data ?? []) as unknown as ServiceViewRow[]) {
    byUnit.set(row.unit_id, toRow(row))
  }
  return byUnit
}

/**
 * Every unit currently due, most overdue first — the `Due for service` saved
 * view on Inventory ▸ Maintenance, and the two counts on Reports ▸ Maintenance.
 *
 * Sorted by `overdue_days` descending, nulls last: a unit past its grace window
 * is the one to act on, and a usage-due unit carries no overdue count at all
 * (`0103` — "overdue by N days" has no meaning against a rental-day threshold).
 *
 * This one DOES surface its error. It is the subject of the screen that calls
 * it, not decoration on one, and an empty list that silently means "the query
 * failed" is how a maintenance backlog disappears.
 */
export async function readUnitsDueForService(): Promise<readonly ServiceRow[]> {
  const { data, error } = await supabase
    .from('product_units_service_v')
    .select(COLUMNS)
    .not('due_reason', 'is', null)
    .order('overdue_days', { ascending: false, nullsFirst: false })

  if (error) {
    throw new Error(`Could not read which units are due for service: ${error.message}`)
  }
  return ((data ?? []) as unknown as ServiceViewRow[]).map(toRow)
}
