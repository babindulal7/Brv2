import type { FC } from 'react'
import Icon, { type IconName } from '../../components/ui/Icon'
import { BAR_BOX } from '../../components/shell/BottomBar'

export interface StickyFloorBarProps {
  progress: {
    current: number
    total: number
    label?: string
    complete?: boolean
  }
  onScan: () => void
  primaryAction: {
    label: string
    onClick: () => void
    disabled?: boolean
    loading?: boolean
    icon?: IconName
  }
  secondaryAction?: {
    label: string
    onClick: () => void
    disabled?: boolean
    icon?: IconName
  }
}

/**
 * **StickyFloorBar — Mobile handheld action bar for warehouse floor operations.**
 *
 * Sits directly above the phone bottom bar (`bottom: BAR_BOX`) to provide:
 * 1. Immediate glanceable progress (counts and percentage) without scrolling.
 * 2. Instant 1-tap thumb access to the barcode/QR scanner modal.
 * 3. Sticky dispatch button (Complete Packing, Complete Session, Complete Handover)
 *    so operators don't have to scroll through 20+ item cards to execute actions.
 *
 * Only rendered on phone viewports (<768px).
 */
export const StickyFloorBar: FC<StickyFloorBarProps> = ({
  progress,
  onScan,
  primaryAction,
  secondaryAction,
}) => {
  const { current, total, label, complete } = progress
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  const isDone = complete ?? (total > 0 && current >= total)

  return (
    <aside
      aria-label="Floor Actions"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: BAR_BOX,
        zIndex: 45,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '8px 14px',
        background: 'var(--card)',
        borderTop: '1px solid var(--border)',
        boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.08)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      {/* ── Left: Compact Progress Pill ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minWidth: 0,
          flexShrink: 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: isDone ? 'var(--st-in-bg)' : 'var(--st-progress-bg)',
              color: isDone ? 'var(--st-in-fg)' : 'var(--st-progress-fg)',
              flexShrink: 0,
            }}
          >
            <Icon name={isDone ? 'check' : 'checklist'} size={13} />
          </span>
          <span
            style={{
              fontSize: 'var(--t-ui)',
              fontWeight: 700,
              color: 'var(--text)',
              whiteSpace: 'nowrap',
            }}
          >
            {current}/{total}
          </span>
          <span
            style={{
              fontSize: 'var(--t-meta)',
              color: 'var(--muted)',
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            ({pct}%)
          </span>
        </div>
        {label && (
          <span
            style={{
              fontSize: 'var(--t-meta)',
              color: 'var(--text2)',
              marginTop: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {label}
          </span>
        )}
      </div>

      {/* ── Right: Handheld Action Buttons ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {secondaryAction && (
          <button
            type="button"
            onClick={secondaryAction.onClick}
            disabled={secondaryAction.disabled}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              minHeight: 44,
              padding: '0 12px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--border)',
              background: 'var(--card2)',
              color: 'var(--text)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: secondaryAction.disabled ? 'not-allowed' : 'pointer',
              opacity: secondaryAction.disabled ? 0.5 : 1,
            }}
          >
            {secondaryAction.icon && <Icon name={secondaryAction.icon} size={15} />}
            {secondaryAction.label}
          </button>
        )}

        {/* Quick Scan trigger */}
        <button
          type="button"
          onClick={onScan}
          aria-label="Scan barcode or QR code"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            minHeight: 44,
            padding: '0 12px',
            borderRadius: 'var(--r-btn)',
            border: '1px solid var(--border)',
            background: 'var(--card2)',
            color: 'var(--text)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          <Icon name="queues" size={16} />
          <span>Scan</span>
        </button>

        {/* Primary Completion trigger */}
        <button
          type="button"
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled || primaryAction.loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            minHeight: 44,
            padding: '0 14px',
            borderRadius: 'var(--r-btn)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: primaryAction.disabled ? 'not-allowed' : 'pointer',
            border: primaryAction.disabled ? '1px solid var(--border)' : '1px solid transparent',
            ...(primaryAction.disabled
              ? {
                  background: 'var(--card2)',
                  color: 'var(--muted)',
                }
              : {
                  background: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-fg)',
                }),
          }}
        >
          <Icon name={primaryAction.icon ?? 'check'} size={15} />
          <span>{primaryAction.label}</span>
        </button>
      </div>
    </aside>
  )
}
