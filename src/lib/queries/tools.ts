import { supabase } from '../supabase'
import { isMoneySurface } from '../../data/nav'
import {
  TOOLS,
  TOOL_GROUPS,
  RENDER_DISPOSITION,
  SEED_ERRORS,
  SENSOR_FORMATS,
  FRAME_RATES,
  sensorFormat,
  frameRate,
  cropFactor,
  fieldOfView,
  coverageAtDistance,
  depthOfField,
  ndStopsFromFactor,
  ndFactorFromDensity,
  exposureValue,
  shutterSecondsFromAngle,
  angleFromShutterDenominator,
  timecodeToFrames,
  framesToTimecode,
  storageGb,
  batteryRuntimeHours,
  batteriesNeeded,
  USABLE_CAPACITY,
  readFavourites,
  writeFavourites,
  type Tool,
  type GroupKey,
  type CalcKey,
  type SensorFormat,
} from '../../data/tools'

export {
  isMoneySurface,
  TOOLS,
  TOOL_GROUPS,
  RENDER_DISPOSITION,
  SEED_ERRORS,
  SENSOR_FORMATS,
  FRAME_RATES,
  sensorFormat,
  frameRate,
  cropFactor,
  fieldOfView,
  coverageAtDistance,
  depthOfField,
  ndStopsFromFactor,
  ndFactorFromDensity,
  exposureValue,
  shutterSecondsFromAngle,
  angleFromShutterDenominator,
  timecodeToFrames,
  framesToTimecode,
  storageGb,
  batteryRuntimeHours,
  batteriesNeeded,
  USABLE_CAPACITY,
  readFavourites,
  writeFavourites,
}

export type { Tool, GroupKey, CalcKey, SensorFormat }

export interface ToolsStatus {
  connected: boolean
  toolCount: number
}

/**
 * Verifies database availability and configuration for tools and calculators.
 */
export async function getToolsStatus(): Promise<ToolsStatus> {
  try {
    const { error } = await supabase
      .from('products_v')
      .select('id')
      .limit(1)

    return {
      connected: !error,
      toolCount: TOOLS.length,
    }
  } catch {
    return {
      connected: false,
      toolCount: TOOLS.length,
    }
  }
}
