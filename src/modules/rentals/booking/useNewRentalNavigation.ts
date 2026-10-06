import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from 'react'
import type { ClientRecord } from '../../../lib/queries/clients'

export interface UseNewRentalNavigationOptions {
  client: ClientRecord | undefined
  navigate: (to: string) => void
  setQuickViewOpen: Dispatch<SetStateAction<boolean>>
  setOpen: Dispatch<SetStateAction<boolean[]>>
  sections: readonly string[]
  editBookingId?: string | undefined
  saveDraft: () => Promise<void> | void
  saveQuote: () => Promise<void> | void
  confirmBooking: () => Promise<void> | void
  confirmBlocked: boolean
  saveState: string
}

export interface UseNewRentalNavigationResult {
  jumpToSection: (targetId: string) => void
  runNoticeAction: (action: string) => void
}

/**
 * Encapsulates power-user keyboard shortcuts (⌘S, ⌘Enter, Alt+1..4)
 * and deep-linking section jumps / notice actions.
 */
export function useNewRentalNavigation({
  client,
  navigate,
  setQuickViewOpen,
  setOpen,
  sections,
  editBookingId,
  saveDraft,
  saveQuote,
  confirmBooking,
  confirmBlocked,
  saveState,
}: UseNewRentalNavigationOptions): UseNewRentalNavigationResult {
  // Power-user keyboard shortcuts: save, confirm, and direct section access.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘S or Ctrl+S: Save Draft
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (editBookingId) void saveQuote()
        else void saveDraft()
        return
      }

      // ⌘Enter or Ctrl+Enter: Confirm Booking
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (!confirmBlocked && saveState !== 'saving') {
          void confirmBooking()
        }
        return
      }

      // Alt+1 to Alt+4: Jump to the corresponding section or summary.
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key >= '1' && e.key <= '4') {
        e.preventDefault()
        const target = ({
          '1': 'section-0',
          '2': 'section-2',
          '3': 'section-5',
          '4': 'rail-booking-summary',
        } as Record<string, string>)[e.key]
        if (target === 'section-5') {
          setOpen((prev) => prev.map((value, index) => index === 5 || value))
        }
        document.getElementById(target ?? '')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [confirmBlocked, saveState, saveDraft, confirmBooking, editBookingId, saveQuote, setOpen])

  /** Redesign v1 §6 — Review card / alert notice jumps to the section that owns the fact. */
  const jumpToSection = useCallback(
    (targetId: string) => {
      const sectionIndex = sections.findIndex((_, i) => `section-${i}` === targetId)
      if (sectionIndex >= 0) {
        setOpen((prev) => prev.map((v, j) => (j === sectionIndex ? true : v)))
      }
      globalThis.requestAnimationFrame(() => {
        const section = document.getElementById(targetId)
        section?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start',
        })
        section
          ?.querySelector<HTMLElement>(
            'input:not([disabled]), select:not([disabled]), button:not([disabled])',
          )
          ?.focus({ preventScroll: true })
      })
    },
    [sections, setOpen],
  )

  /**
   * §12 — every notice carries exactly one action, and both the blocking-notices
   * card and the warnings card dispatch through here.
   */
  const runNoticeAction = useCallback(
    (action: string) => {
      if (action === 'Open Inventory') navigate('/inventory')
      if ((action === 'View Client' || action === 'Edit Client') && client) setQuickViewOpen(true)
      if (action === 'Select Client') jumpToSection('section-0')
      if (action === 'Open Client & Dates') jumpToSection('section-0')
      if (action === 'Open Dates') jumpToSection('section-1')
      if (action === 'Open Equipment') jumpToSection('section-2')
      if (action === 'Open Crew') jumpToSection('section-3')
      if (action === 'Open Pricing') jumpToSection('section-5')
      if (action === 'Fix Discount') {
        document.getElementById('rail-booking-summary')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      if (action === 'Receive Payment' || action === 'Receive Deposit') {
        document.getElementById('rail-booking-summary')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    },
    [client, jumpToSection, navigate, setQuickViewOpen],
  )

  return {
    jumpToSection,
    runNoticeAction,
  }
}
