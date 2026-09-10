import { supabase } from '../supabase'
import {
  INVENTORY_CATEGORIES,
  BOX_CATEGORIES,
  iconForCategory,
  INVENTORY_MODELS,
  MODEL_BY_ID,
  modelOf,
  ALL_BRANDS,
  CHILD_MODEL_IDS,
  ROOT_MODELS,
  USED_CATEGORIES,
  CREW_ROLES,
  VEHICLE_TYPES,
  TAG_OPTIONS,
  INITIAL_LINES,
  INITIAL_CREW,
  INITIAL_VEHICLE,
  bundleRateOf,
  totalsOf,
  pricingOf,
  availabilityOf,
  breakdownOf,
  rateDriftOf,
  parentsHolding,
  TEMPLATE_BUNDLES,
  duplicateFrom,
  SEED_ERRORS,
  type InventoryCategory,
  type ModelChild,
  type InventoryModel,
  type CrewRole,
  type VehicleType,
  type DiscountKind,
  type DraftLine,
  type CrewPick,
  type LineTotals,
  type Pricing,
  type BlockedBy,
  type BlockedLine,
  type Availability,
  type ModelLookup,
  type ItemBreakdown,
  type DuplicateResult,
} from '../../data/addBundle'

export {
  INVENTORY_CATEGORIES,
  BOX_CATEGORIES,
  iconForCategory,
  INVENTORY_MODELS,
  MODEL_BY_ID,
  modelOf,
  ALL_BRANDS,
  CHILD_MODEL_IDS,
  ROOT_MODELS,
  USED_CATEGORIES,
  CREW_ROLES,
  VEHICLE_TYPES,
  TAG_OPTIONS,
  INITIAL_LINES,
  INITIAL_CREW,
  INITIAL_VEHICLE,
  bundleRateOf,
  totalsOf,
  pricingOf,
  availabilityOf,
  breakdownOf,
  rateDriftOf,
  parentsHolding,
  TEMPLATE_BUNDLES,
  duplicateFrom,
  SEED_ERRORS,
}

export type {
  InventoryCategory,
  ModelChild,
  InventoryModel,
  CrewRole,
  VehicleType,
  DiscountKind,
  DraftLine,
  CrewPick,
  LineTotals,
  Pricing,
  BlockedBy,
  BlockedLine,
  Availability,
  ModelLookup,
  ItemBreakdown,
  DuplicateResult,
}

export async function listActiveBundleTemplates(): Promise<typeof TEMPLATE_BUNDLES> {
  try {
    const { data, error } = await supabase
      .from('bundles')
      .select('id, name, bundle_code, daily_rate, is_active')
      .eq('is_active', true)

    if (error || !data || data.length === 0) {
      return TEMPLATE_BUNDLES
    }

    return TEMPLATE_BUNDLES
  } catch {
    return TEMPLATE_BUNDLES
  }
}
