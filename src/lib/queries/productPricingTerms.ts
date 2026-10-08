import { supabase } from '../supabase'
import { rupees } from '../money'
import type { PricingRule, PricingStructure } from '../pricingStructures'

/**
 * A product's structure and ruleset, read for the quote engine (`lib/pricingStructures.ts`, G3 / 0160).
 *
 * RLS (0160) returns nothing to a money-blind role, so for them `fetchProductPricingTerms` is an empty map
 * and the screen falls back to the flat rate — which is also all they could see.
 * Retired tiles and rules are dropped here; nothing is deleted, it is simply no longer priced from.
 */
export interface ProductPricingTerms {
  readonly structure: PricingStructure | null
  readonly rules: readonly PricingRule[]
}

interface TileRow { duration_days: number; amount: number | string; retired_at: string | null }
interface StructureRow { id: string; extra_day_amount: number | string | null; retired_at: string | null; tiles: TileRow[] | null }
interface RuleRow {
  sort_order: number; kind: 'charge' | 'price'; name: string; charge_action: string | null
  pickup_after: string | null; return_before: string | null; percent: number | string | null
  weekdays: number[] | null; valid_from: string | null; valid_to: string | null
  apply_when: 'overlaps' | 'fits_within' | 'spans'; stack: boolean; retired_at: string | null
}
interface RulesetRow { id: string; retired_at: string | null; rules: RuleRow[] | null }

const hhmm = (t: string | null): string | undefined => (t ? t.slice(0, 5) : undefined)

export function structureFromRow(row: StructureRow): PricingStructure | null {
  if (row.retired_at) return null
  const tiles = (row.tiles ?? [])
    .filter((t) => !t.retired_at)
    .map((t) => ({ days: t.duration_days, pricePaisa: rupees(Number(t.amount)) as number }))
  if (tiles.length === 0) return null
  return {
    tiles,
    extraDayPaisa: row.extra_day_amount === null || row.extra_day_amount === undefined ? null : (rupees(Number(row.extra_day_amount)) as number),
  }
}

export function rulesFromRow(row: RulesetRow): PricingRule[] {
  if (row.retired_at) return []
  return (row.rules ?? [])
    .filter((r) => !r.retired_at)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r): PricingRule => {
      if (r.kind === 'charge') {
        const pickupAfter = hhmm(r.pickup_after)
        const returnBefore = hhmm(r.return_before)
        return {
          kind: 'charge',
          action: r.charge_action === 'skip_return_day' ? 'skip_return_day' : 'skip_pickup_day',
          ...(pickupAfter ? { pickupAfter } : {}),
          ...(returnBefore ? { returnBefore } : {}),
        }
      }
      return {
        kind: 'price',
        name: r.name,
        percent: Number(r.percent ?? 0),
        applyWhen: r.apply_when,
        stack: r.stack,
        ...(r.weekdays && r.weekdays.length > 0 ? { weekdays: r.weekdays } : {}),
        ...(r.valid_from ? { from: r.valid_from } : {}),
        ...(r.valid_to ? { to: r.valid_to } : {}),
      }
    })
}

export async function fetchProductPricingTerms(productIds: readonly string[]): Promise<Map<string, ProductPricingTerms>> {
  const out = new Map<string, ProductPricingTerms>()
  if (productIds.length === 0) return out
  const { data, error } = await supabase
    .from('products')
    .select(
      'id, structure:pricing_structures ( id, extra_day_amount, retired_at, tiles:pricing_structure_tiles ( duration_days, amount, retired_at ) ), ' +
        'ruleset:pricing_rulesets ( id, retired_at, rules:pricing_rules ( sort_order, kind, name, charge_action, pickup_after, return_before, percent, weekdays, valid_from, valid_to, apply_when, stack, retired_at ) )',
    )
    .in('id', [...productIds])
  if (error) throw new Error(`Could not read product pricing terms: ${error.message}`)
  for (const row of (data ?? []) as unknown as Array<{ id: string; structure: StructureRow | null; ruleset: RulesetRow | null }>) {
    const structure = row.structure ? structureFromRow(row.structure) : null
    const rules = row.ruleset ? rulesFromRow(row.ruleset) : []
    if (structure || rules.length > 0) out.set(row.id, { structure, rules })
  }
  return out
}
