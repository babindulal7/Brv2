import { useState } from 'react'
import type { ReactNode } from 'react'
import { Modal } from './Modal'
import { Button } from './Page'

/**
 * Shared confirm/destructive-action dialog, built on Modal (size="sm").
 *
 * Mirrors the reason-gate UX already hand-rolled in ClientDetail.tsx /
 * ClientsDirectory.tsx's "Block Client" flow and VoidInvoiceModal.tsx: a
 * required textarea with a minimum length, a live character count, and a
 * confirm button that stays disabled until the reason clears the bar.
 */

export interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (reason?: string) => void
  title: string
  /** Body copy — a plain string or richer JSX describing the consequence. */
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** 'danger' renders the confirm button in the destructive/red skin. */
  variant?: 'default' | 'danger'
  /** When set, a required reason textarea gates the confirm button. */
  requireReason?: { minLength: number; label: string }
  /** Disables the confirm button independent of the reason gate (e.g. while a submit is in flight). */
  isSubmitting?: boolean
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  requireReason,
  isSubmitting = false,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('')

  const trimmedLength = reason.trim().length
  const reasonSatisfied = !requireReason || trimmedLength >= requireReason.minLength
  const canConfirm = reasonSatisfied && !isSubmitting

  const handleClose = () => {
    setReason('')
    onClose()
  }

  const handleConfirm = () => {
    if (!canConfirm) return
    onConfirm(requireReason ? reason.trim() : undefined)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      size="sm"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
          <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {description && (
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>{description}</div>
        )}

        {requireReason && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--t-meta)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text2)' }}>{requireReason.label}</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              style={{
                padding: 10,
                borderRadius: 'var(--r-input)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
            <span style={{ color: reasonSatisfied ? 'var(--muted)' : 'var(--danger)' }}>
              {trimmedLength} / {requireReason.minLength} characters minimum
            </span>
          </label>
        )}
      </div>
    </Modal>
  )
}
