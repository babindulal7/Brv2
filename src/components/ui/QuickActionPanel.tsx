import type { ReactNode } from 'react'
import Icon from './Icon'
import type { IconName } from './Icon'

export interface QuickActionItem {
  id: string
  label: string
  icon: IconName
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'accent'
  disabled?: boolean
  title?: string
  shortcut?: string
}

export interface QuickActionBarProps {
  actions: QuickActionItem[]
  extra?: ReactNode
}

/**
 * High-frequency speed verbs panel inspired by Booqable's top operational bar.
 * Gives immediate 1-click access to New Booking, Fast Return, Record Payment, and Scan.
 */
export function QuickActionBar({ actions, extra }: QuickActionBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Quick operations"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--sp-sm)',
      }}
    >
      {actions.map((act) => {
        const isPrimary = act.variant === 'primary'
        const isAccent = act.variant === 'accent'
        return (
          <button
            key={act.id}
            type="button"
            className="press tap"
            onClick={act.onClick}
            disabled={act.disabled}
            title={act.title ?? act.label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              minHeight: 44,
              padding: '0 14px',
              borderRadius: 'var(--r-btn)',
              border: isPrimary
                ? '1px solid transparent'
                : isAccent
                  ? '1px solid var(--accent, #f59e0b)'
                  : '1px solid var(--btn-secondary-border)',
              background: isPrimary
                ? 'var(--primary)'
                : isAccent
                  ? 'var(--hover-card)'
                  : 'var(--card)',
              color: isPrimary
                ? 'var(--on-brand)'
                : isAccent
                  ? 'var(--text)'
                  : 'var(--text)',
              fontFamily: 'inherit',
              fontSize: 'var(--t-ui)',
              fontWeight: 600,
              cursor: act.disabled ? 'not-allowed' : 'pointer',
              opacity: act.disabled ? 0.5 : 1,
              whiteSpace: 'nowrap',
              boxShadow: isPrimary ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
              transition: 'background 120ms ease, border-color 120ms ease, transform 80ms ease',
            }}
          >
            <Icon
              name={act.icon}
              size={15}
              style={{
                color: isPrimary ? 'var(--on-brand)' : isAccent ? 'var(--accent, #f59e0b)' : 'var(--muted)',
                flexShrink: 0,
              }}
            />
            <span>{act.label}</span>
            {act.shortcut && (
              <kbd
                style={{
                  display: 'inline-block',
                  fontSize: '11px',
                  fontWeight: 500,
                  opacity: 0.75,
                  padding: '1px 5px',
                  borderRadius: 4,
                  background: isPrimary ? 'rgba(255,255,255,0.2)' : 'var(--bg-muted, rgba(0,0,0,0.06))',
                  border: isPrimary ? 'none' : '1px solid var(--border)',
                  marginLeft: 2,
                }}
              >
                {act.shortcut}
              </kbd>
            )}
          </button>
        )
      })}
      {extra}
    </div>
  )
}

export interface BulkActionItem {
  id: string
  label: string
  icon: IconName
  onClick: () => void
  disabled?: boolean
  variant?: 'default' | 'danger' | 'primary'
}

export interface FloatingBulkActionBarProps {
  selectedCount: number
  totalCount?: number
  onClearSelection: () => void
  actions: BulkActionItem[]
  noun?: string
}

/**
 * Floating docked toolbar displayed when 1 or more items are selected in the table.
 * Centered at bottom with elevation, glassmorphism, count badge, and batch operations.
 */
export function FloatingBulkActionBar({
  selectedCount,
  totalCount,
  onClearSelection,
  actions,
  noun = 'items',
}: FloatingBulkActionBarProps) {
  if (selectedCount <= 0) return null

  return (
    <aside
      role="region"
      aria-label="Bulk actions for selected items"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 55,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-sm)',
        padding: '8px 12px 8px 16px',
        borderRadius: 'var(--r-modal)',
        background: 'var(--card)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 30px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.12)',
        maxWidth: 'calc(100vw - 32px)',
        overflowX: 'auto',
        animation: 'drawer-in-up 180ms cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      {/* Selection count badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingRight: 10,
          borderRight: '1px solid var(--border)',
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            display: 'inline-grid',
            placeItems: 'center',
            minWidth: 24,
            height: 24,
            padding: '0 7px',
            borderRadius: 'var(--r-badge)',
            background: 'var(--primary)',
            color: 'var(--on-brand)',
            fontSize: 'var(--t-meta)',
            fontWeight: 700,
          }}
        >
          {selectedCount}
        </span>
        <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
          {selectedCount} {selectedCount === 1 ? noun.replace(/s$/, '') : noun} selected
          {totalCount !== undefined ? ` (of ${totalCount})` : ''}
        </span>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {actions.map((act) => {
          const isPrimary = act.variant === 'primary'
          const isDanger = act.variant === 'danger'
          return (
            <button
              key={act.id}
              type="button"
              className="press tap"
              onClick={act.onClick}
              disabled={act.disabled}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                minHeight: 44,
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: isPrimary
                  ? '1px solid transparent'
                  : isDanger
                    ? '1px solid var(--danger-border, #f87171)'
                    : '1px solid var(--border)',
                background: isPrimary
                  ? 'var(--primary)'
                  : isDanger
                    ? 'var(--danger-bg, #fef2f2)'
                    : 'transparent',
                color: isPrimary
                  ? 'var(--on-brand)'
                  : isDanger
                    ? 'var(--danger, #dc2626)'
                    : 'var(--text)',
                fontFamily: 'inherit',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
                cursor: act.disabled ? 'not-allowed' : 'pointer',
                opacity: act.disabled ? 0.45 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              <Icon
                name={act.icon}
                size={14}
                style={{
                  color: isPrimary ? 'var(--on-brand)' : isDanger ? 'var(--danger, #dc2626)' : 'var(--muted)',
                }}
              />
              <span>{act.label}</span>
            </button>
          )
        })}

        {/* Clear selection button */}
        <button
          type="button"
          className="press tap"
          onClick={onClearSelection}
          aria-label="Clear selection"
          title="Deselect all"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: 'var(--r-btn)',
            border: 'none',
            background: 'transparent',
            color: 'var(--muted)',
            cursor: 'pointer',
          }}
        >
          <Icon name="close" size={15} />
        </button>
      </div>
    </aside>
  )
}
