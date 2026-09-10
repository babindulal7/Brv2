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

    if (error || !data || data.length === 0) {
      let matched = 0
      let review = 0
      let unmatched = 0
      for (const p of PHOTOS) {
        const s = matchState(p)
        if (s === 'Matched') matched++
        else if (s === 'Review') review++
        else unmatched++
      }
      return {
        photos: PHOTOS,
        total: PHOTOS.length,
        matched,
        review,
        unmatched,
      }
    }

    let matched = 0
    let review = 0
    let unmatched = 0

    for (const d of data) {
      if (d.match_state === 'Matched') matched++
      else if (d.match_state === 'Review') review++
      else unmatched++
    }

    return {
      photos: PHOTOS,
      total: data.length,
      matched,
      review,
      unmatched,
    }
  } catch {
    return {
      photos: PHOTOS,
      total: PHOTOS.length,
      matched: PHOTOS.filter((p) => matchState(p) === 'Matched').length,
      review: PHOTOS.filter((p) => matchState(p) === 'Review').length,
      unmatched: PHOTOS.filter((p) => matchState(p) === 'Unmatched').length,
    }
  }
}
