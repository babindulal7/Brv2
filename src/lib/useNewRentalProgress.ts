import { useCallback, useState, useRef } from 'react'

/**
 * Tracks which sections of the New Rental form have been visited.
 * 
 * §2/§3/§19 — sections are NOT a wizard (no Previous/Next), but we can still
 * provide a progress overview so the operator always knows where they are
 * in the 6-section workflow: Client → Dates → Equipment → Crew → Delivery → Terms.
 */
export interface SectionProgress {
  id: string
  title: string
  visited: boolean
  completed: boolean
}

/**
 * Returns section progress state and refs for tracking section visits.
 * 
 * @param sectionTitles - The section titles in order (matching NewRental.SECTIONS)
 * @param onChange - Optional callback when progress updates
 */
export function useNewRentalProgress(
  sectionTitles: readonly string[],
  onChange?: (progress: SectionProgress[]) => void
) {
  // Initialize progress: all sections start as unvisited
  const [progress, setProgress] = useState<SectionProgress[]>(() =>
    sectionTitles.map(title => ({
      id: `section-${sectionTitles.indexOf(title)}`,
      title,
      visited: false,
      completed: false,
    }))
  )

  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const handleToggle = useCallback((sectionIndex: number) => {
    setProgress(prev => {
      const updated = [...prev]
      const target = updated[sectionIndex]
      if (target) {
        updated[sectionIndex] = {
          ...target,
          visited: true,
          completed: !target.completed,
        }
      }
      onChange?.(updated)
      return updated
    })
  }, [onChange])

  return { progress, sectionRefs, handleToggle }
}