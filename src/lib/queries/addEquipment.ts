import { supabase } from '../supabase'
import {
  EQUIPMENT_CATEGORIES,
  TRACKING_MODES,
  QUANTITY_UNITS,
  INTAKE_CONDITIONS,
  NEXT_ASSET_CODE,
  ASSET_CODE_ON_SAVE,
  assetTagFor,
  EXISTING_SERIALS,
  existingModelMatch,
  CONTAINER_MODELS,
  ATTACHABLE_MODELS,
  modelName,
  bundlesUsing,
  suggestedChildrenFor,
  LOCATIONS,
  locationsIn,
  locationLabel,
  SAVE_UNAVAILABLE_REASON,
  PREVIEW_UNAVAILABLE_REASON,
  LABEL_PRINT_UNAVAILABLE_REASON,
  PACKING_PREVIEW_UNAVAILABLE_REASON,
  DEPRECIATION_UNAVAILABLE_REASON,
  CONTAINER_CAPACITY_REASON,
  SEED_ERRORS,
  type TrackingMode,
  type IntakeCondition,
  type LocationChoice,
} from '../../data/addEquipment'

export {
  EQUIPMENT_CATEGORIES,
  TRACKING_MODES,
  QUANTITY_UNITS,
  INTAKE_CONDITIONS,
  NEXT_ASSET_CODE,
  ASSET_CODE_ON_SAVE,
  assetTagFor,
  EXISTING_SERIALS,
  existingModelMatch,
  CONTAINER_MODELS,
  ATTACHABLE_MODELS,
  modelName,
  bundlesUsing,
  suggestedChildrenFor,
  LOCATIONS,
  locationsIn,
  locationLabel,
  SAVE_UNAVAILABLE_REASON,
  PREVIEW_UNAVAILABLE_REASON,
  LABEL_PRINT_UNAVAILABLE_REASON,
  PACKING_PREVIEW_UNAVAILABLE_REASON,
  DEPRECIATION_UNAVAILABLE_REASON,
  CONTAINER_CAPACITY_REASON,
  SEED_ERRORS,
}

export type {
  TrackingMode,
  IntakeCondition,
  LocationChoice,
}

export interface EquipmentCreationMeta {
  nextAssetCode: string
  existingSerialsCount: number
}

/**
 * Reads live metadata for equipment creation from the database.
 */
export async function getEquipmentCreationMeta(): Promise<EquipmentCreationMeta> {
  try {
    const { count, error } = await supabase
      .from('product_units_v')
      .select('*', { count: 'exact', head: true })

    return {
      nextAssetCode: NEXT_ASSET_CODE,
      existingSerialsCount: error || count === null ? EXISTING_SERIALS.size : count,
    }
  } catch {
    return {
      nextAssetCode: NEXT_ASSET_CODE,
      existingSerialsCount: EXISTING_SERIALS.size,
    }
  }
}
