import { useEffect, useState, useRef } from 'react'

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
  const [progress, setProgress] = useState<SectionProgress[]>(
    sectionTitles.map(title => ({
      id: `section-${sectionTitles.indexOf(title)}`,
      title,
      visited: false,
      completed: false,
    }))
  )

  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  useEffect(() => {
    // Mark sections as visited when they become visible via toggle
    const handleToggle = (sectionIndex: number) => {
      setProgress(prev => {
        const updated = [...prev]
        updated[sectionIndex].visited = true
        updated[sectionIndex].completed = !updated[sectionIndex].completed // toggle completed state
        onChange?.(updated)
        return updated
      })
    }

    // We'll attach toggle handlers via the Section component's onToggle prop
    // The refs are available after render for intersection observation if needed
    onChange?.(progress)

    return () => {}
  }, [progress, onChange])

  return { progress, sectionRefs, handleToggle }
}