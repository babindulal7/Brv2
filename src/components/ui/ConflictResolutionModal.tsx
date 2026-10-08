import { useState, useEffect } from 'react'
import { Modal } from './Modal'
import { Button } from './Page'
import Icon from './Icon'
import { ErrorBanner } from './StateViews'
import {
  getUnresolvedConflicts,
  resolveConflict,
  type QueuedConflict,
} from '../../lib/offlineQueue'
import { useAuth } from '../../lib/auth'

export interface ConflictResolutionModalProps {
  isOpen: boolean
  onClose: () => void
  onResolved?: () => void
}

/**
 * ConflictResolutionModal — Plan §Phase 9 Conflict UI
 *
 * Implements:
 * - "Conflict UI naming both sides — never silent"
 * - Displays both local offline changes and remote server state side-by-side
 * - Lets the operator make an explicit resolution decision (Keep Server vs Force Local)
 * - 44×44px touch targets on all interactive controls (Law 15)
 * - Persistent inline error messages on resolution failures (Law 12)
 */
export function ConflictResolutionModal({
  isOpen,
  onClose,
  onResolved,
}: ConflictResolutionModalProps) {
  const { user } = useAuth()
  const [conflicts, setConflicts] = useState<QueuedConflict[]>([])
  const [loading, setLoading] = useState(true)
  const [activeIdx, setActiveIdx] = useState(0)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    let alive = true
    setLoading(true)
    setError(null)
    getUnresolvedConflicts()
      .then((list) => {
        if (!alive) return
        setConflicts(list)
        setActiveIdx((i) => Math.min(i, Math.max(0, list.length - 1)))
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [isOpen])

  const currentConflict = conflicts[activeIdx]

  const handleResolve = async (resolution: 'keep_server' | 'force_local') => {
    if (!currentConflict || currentConflict.id === undefined) return
    setResolving(true)
    setError(null)

    try {
      await resolveConflict(currentConflict.id, resolution, user?.name || user?.id)
      const updated = await getUnresolvedConflicts()
      setConflicts(updated)
      if (onResolved) onResolved()
      if (updated.length === 0) {
        onClose()
      } else {
        setActiveIdx((prev) => Math.min(prev, updated.length - 1))
      }
    } catch (err) {
      setError(
        `Failed to resolve conflict: ${err instanceof Error ? err.message : String(err)}. ` +
          'The conflict remains unresolved so no data was lost.',
      )
    } finally {
      setResolving(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Offline Sync Conflicts"
      subtitle={
        conflicts.length > 0
          ? `Reviewing conflict ${activeIdx + 1} of ${conflicts.length}: naming both sides so no change is silently overwritten.`
          : 'No unresolved conflicts.'
      }
      size="lg"
      footer={
        conflicts.length > 0 ? (
          <div style={{ display: 'flex', gap: 'var(--sp-sm)', width: '100%', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 'var(--sp-xs)' }}>
              <Button
                variant="secondary"
                disabled={activeIdx === 0 || resolving}
                onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={activeIdx >= conflicts.length - 1 || resolving}
                onClick={() => setActiveIdx((i) => Math.min(conflicts.length - 1, i + 1))}
              >
                Next
              </Button>
            </div>
            <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
              <Button
                variant="secondary"
                disabled={resolving}
                onClick={() => void handleResolve('keep_server')}
              >
                Keep Server Version
              </Button>
              <Button
                variant="primary"
                disabled={resolving}
                onClick={() => void handleResolve('force_local')}
              >
                Apply Local Offline Changes
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {error && (
          <div data-testid="conflict-error-banner">
            {/* Law 12 — inline and persistent, through the kit's own banner. */}
            <ErrorBanner title="Could not resolve this conflict" message={error} />
          </div>
        )}

        {loading ? (
          <div style={{ padding: 'var(--sp-lg)', textAlign: 'center', color: 'var(--muted)' }}>
            Loading conflicts…
          </div>
        ) : !currentConflict ? (
          <div style={{ padding: 'var(--sp-lg)', textAlign: 'center', color: 'var(--text2)' }}>
            All offline mutations are synced and no conflicts require review.
          </div>
        ) : (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'var(--card2)',
                borderRadius: 'var(--r-card)',
                marginBottom: 'var(--sp-md)',
                fontSize: 'var(--t-meta)',
              }}
            >
              <div>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>Table: </span>
                <code style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{currentConflict.table}</code>
                <span style={{ marginLeft: 12, fontWeight: 600, color: 'var(--text)' }}>Record ID: </span>
                <code style={{ fontFamily: 'monospace' }}>{currentConflict.recordId}</code>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 'var(--t-th)' }}>
                Detected: {new Date(currentConflict.detectedAt).toLocaleTimeString()}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 'var(--sp-md)',
              }}
            >
              {/* Local Offline Attempt */}
              <div
                data-testid="local-conflict-side"
                style={{
                  border: '1px solid var(--warn-text)',
                  borderRadius: 'var(--r-card)',
                  padding: 'var(--sp-md)',
                  background: 'var(--card)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 600,
                    color: 'var(--warn-text)',
                    marginBottom: 'var(--sp-sm)',
                    fontSize: 'var(--t-body)',
                  }}
                >
                  <Icon name="timer" size={16} />
                  <span>Local Offline Edit</span>
                </div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginBottom: 'var(--sp-sm)' }}>
                  Queued on this device while offline
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: '8px 10px',
                    borderRadius: '4px',
                    background: 'var(--app)',
                    fontSize: 'var(--t-th)',
                    fontFamily: 'monospace',
                    overflowX: 'auto',
                    maxHeight: 220,
                    border: '1px solid var(--border)',
                  }}
                >
                  {JSON.stringify(currentConflict.localChanges, null, 2)}
                </pre>
              </div>

              {/* Remote Server State */}
              <div
                data-testid="remote-conflict-side"
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-card)',
                  padding: 'var(--sp-md)',
                  background: 'var(--card)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 600,
                    color: 'var(--text)',
                    marginBottom: 'var(--sp-sm)',
                    fontSize: 'var(--t-body)',
                  }}
                >
                  <Icon name="check" size={16} />
                  <span>Server Version</span>
                </div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginBottom: 'var(--sp-sm)' }}>
                  Current state in database (updated after offline edit)
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: '8px 10px',
                    borderRadius: '4px',
                    background: 'var(--app)',
                    fontSize: 'var(--t-th)',
                    fontFamily: 'monospace',
                    overflowX: 'auto',
                    maxHeight: 220,
                    border: '1px solid var(--border)',
                  }}
                >
                  {JSON.stringify(currentConflict.remoteState, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
