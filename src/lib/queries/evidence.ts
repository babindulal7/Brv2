import { supabase } from '../supabase'
import {
  PHOTOS,
  matchState,
  THRESHOLDS,
  CATEGORY_NAMES,
  UPLOAD_SOURCES,
  UPLOAD_ROADMAP,
  STEPS,
  BULK_ACTIONS,
  LIMITS,
  type MatchState,
  type MatchSource,
  type Photo,
} from '../../data/evidence'

export {
  PHOTOS,
  matchState,
  THRESHOLDS,
  CATEGORY_NAMES,
  UPLOAD_SOURCES,
  UPLOAD_ROADMAP,
  STEPS,
  BULK_ACTIONS,
  LIMITS,
}

export type { MatchState, MatchSource, Photo }

export interface EvidenceSummary {
  photos: Photo[]
  total: number
  matched: number
  review: number
  unmatched: number
}

/**
 * Loads evidence files and summary for an operation or booking.
 */
export async function getEvidenceSummary(): Promise<EvidenceSummary> {
  try {
    const { data, error } = await supabase
      .from('evidence_files')
      .select('id, match_state, match_source, category, processing_step')

    if (error) {
      return {
        photos: [],
        total: 0,
        matched: 0,
        review: 0,
        unmatched: 0,
      }
    }

    const rows = data ?? []
    let matched = 0
    let review = 0
    let unmatched = 0

    for (const d of rows) {
      if (d.match_state === 'Matched') matched++
      else if (d.match_state === 'Review') review++
      else unmatched++
    }

    return {
      photos: [],
      total: rows.length,
      matched,
      review,
      unmatched,
    }
  } catch {
    return {
      photos: [],
      total: 0,
      matched: 0,
      review: 0,
      unmatched: 0,
    }
  }
}
