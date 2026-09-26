import type { ReactNode } from 'react'

export interface ActiveFilterChipProps {
  id: string
  dimension: string
  label: string
  icon?: ReactNode
  onRemove: (id: string) => void
  disabled?: boolean
  className?: string
}

/**
 * ActiveFilterChip — Removable indicator tag for currently applied filter facets.
 * Strictly adheres to Law 11 (Never Colour Alone - includes text & icon) and Law 15 (touch targets).
 */
export function ActiveFilterChip({
  id,
  dimension,
  label,
  icon,
  onRemove,
  disabled = false,
  className = '',
}: ActiveFilterChipProps) {
  return (
    <div
      role="status"
      className={`active-filter-chip ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: '32px',
        padding: '0 8px 0 10px',
        borderRadius: '16px',
        background: 'var(--bg-subtle, #F1F5F9)',
        border: '1px solid var(--border, #CBD5E1)',
        fontSize: 'var(--t-meta, 0.75rem)',
        color: 'var(--text-primary, #0F172A)',
        lineHeight: 1,
        maxWidth: '280px',
      }}
    >
      {icon && (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            color: 'var(--text-muted, #64748B)',
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
      )}

      <span
        style={{
          fontWeight: 600,
          color: 'var(--text-muted, #64748B)',
          marginRight: '2px',
          textTransform: 'capitalize',
        }}
      >
        {dimension}:
      </span>

      <span
        style={{
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onRemove(id)}
        aria-label={`Remove ${dimension} filter for ${label}`}
        style={{
          display: 'grid',
          placeItems: 'center',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          border: 'none',
          background: 'transparent',
          color: 'var(--text-muted, #64748B)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: 0,
          marginLeft: '2px',
          transition: 'background 120ms ease, color 120ms ease',
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'
            e.currentTarget.style.color = '#DC2626'
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled) {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted, #64748B)'
          }
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
export default ActiveFilterChip
