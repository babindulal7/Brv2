import { useState, useEffect } from 'react'
import Icon from './Icon'
import { countUnresolvedConflicts } from '../../lib/offlineQueue'
import { ConflictResolutionModal } from './ConflictResolutionModal'

/**
 * ConflictNotificationBanner — Plan §Phase 9 Conflict Notification
 *
 * Implements:
 * - Surfaces detected sync conflicts prominently so they are never silent.
 * - Opens the interactive ConflictResolutionModal naming both sides.
 * - Adheres to Law 11 (icon + label + colour) and Law 15 (44×44px touch target).
 */
export function ConflictNotificationBanner() {
  const [conflictCount, setConflictCount] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)

  const checkConflicts = async () => {
    try {
      const count = await countUnresolvedConflicts()
      setConflictCount(count)
    } catch {
      // Storage unavailable or checking error
    }
  }

  useEffect(() => {
    void checkConflicts()
    const interval = setInterval(() => void checkConflicts(), 15000)
    return () => clearInterval(interval)
  }, [])

  if (conflictCount === 0) return null

  return (
    <>
      <div
        data-testid="conflict-notification-banner"
        style={{
          background: 'var(--st-danger-bg, rgba(239, 68, 68, 0.15))',
          color: 'var(--st-danger-fg, #ef4444)',
          borderBottom: '1px solid var(--st-danger-fg, #ef4444)',
          padding: '6px 16px',
          fontSize: 'var(--t-meta, 13px)',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="alert_triangle" size={16} />
          <span>
            {conflictCount === 1
              ? '1 offline sync conflict requires review'
              : `${conflictCount} offline sync conflicts require review`}
            {' — a newer server edit was detected during replay.'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          data-testid="review-conflicts-btn"
          style={{
            background: 'var(--st-danger-fg, #ef4444)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--r-btn, 4px)',
            padding: '0 12px',
            minHeight: 44, // Law 15 minimum touch target
            minWidth: 44,
            cursor: 'pointer',
            fontSize: 'var(--t-meta, 12px)',
            fontWeight: 600,
            fontFamily: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Review Conflicts
        </button>
      </div>

      <ConflictResolutionModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false)
          void checkConflicts()
        }}
        onResolved={() => void checkConflicts()}
      />
    </>
  )
}
