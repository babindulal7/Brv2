import React from 'react'
import {
  IconCheck,
  IconPackage,
  IconArrowUpRight,
  IconAlertOctagon,
  IconFlame,
} from '@tabler/icons-react'

export interface QuantityBreakdown {
  booked: number
  packed?: number
  pickedUp?: number
  returned?: number
  missing?: number
  damaged?: number
}

export interface QuantityChipProps {
  quantities: QuantityBreakdown
  compact?: boolean
  className?: string
}

export const QuantityChip: React.FC<QuantityChipProps> = ({
  quantities,
  compact = false,
  className = '',
}) => {
  const { booked, packed = 0, pickedUp = 0, returned = 0, missing = 0, damaged = 0 } = quantities

  if (compact) {
    return (
      <div
        className={className || undefined}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 'var(--t-meta)',
          fontFamily: 'var(--font-id, sans-serif)',
          fontVariantNumeric: 'tabular-nums',
          userSelect: 'none',
        }}
      >
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{booked} total</span>
        {returned > 0 && <span style={{ color: 'var(--st-in-fg)' }}>({returned} ret)</span>}
        {pickedUp > 0 && <span style={{ color: 'var(--st-out-fg)' }}>({pickedUp} out)</span>}
        {missing > 0 && <span style={{ color: 'var(--st-danger-fg)', fontWeight: 700 }}>({missing} miss)</span>}
        {damaged > 0 && <span style={{ color: 'var(--st-progress-fg)', fontWeight: 700 }}>({damaged} dmg)</span>}
      </div>
    )
  }

  const chipBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 'var(--r-chip)',
    fontSize: 'var(--t-meta)',
    fontWeight: 500,
    lineHeight: 1.2,
  }

  return (
    <div
      className={className || undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        fontSize: 'var(--t-meta)',
        userSelect: 'none',
      }}
    >
      {/* Booked Total */}
      <span
        style={{
          ...chipBase,
          background: 'var(--card2)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
        }}
      >
        <span>{booked} Booked</span>
      </span>

      {/* Packed */}
      {packed > 0 && (
        <span
          style={{
            ...chipBase,
            background: 'var(--st-progress-bg)',
            border: '1px solid var(--st-progress-border)',
            color: 'var(--st-progress-fg)',
          }}
        >
          <IconPackage size={12} />
          <span>{packed} Packed</span>
        </span>
      )}

      {/* Picked Up (On Rent) */}
      {pickedUp > 0 && (
        <span
          style={{
            ...chipBase,
            background: 'var(--st-out-bg)',
            border: '1px solid var(--st-out-border)',
            color: 'var(--st-out-fg)',
          }}
        >
          <IconArrowUpRight size={12} />
          <span>{pickedUp} Out</span>
        </span>
      )}

      {/* Returned */}
      {returned > 0 && (
        <span
          style={{
            ...chipBase,
            background: 'var(--st-in-bg)',
            border: '1px solid var(--st-in-border)',
            color: 'var(--st-in-fg)',
          }}
        >
          <IconCheck size={12} />
          <span>{returned} In</span>
        </span>
      )}

      {/* Missing */}
      {missing > 0 && (
        <span
          style={{
            ...chipBase,
            background: 'var(--st-danger-bg)',
            border: '1px solid var(--st-danger-border)',
            color: 'var(--st-danger-fg)',
            fontWeight: 700,
          }}
        >
          <IconAlertOctagon size={12} />
          <span>{missing} Missing</span>
        </span>
      )}

      {/* Damaged */}
      {damaged > 0 && (
        <span
          style={{
            ...chipBase,
            background: 'var(--st-progress-bg)',
            border: '1px solid var(--st-progress-border)',
            color: 'var(--st-progress-fg)',
            fontWeight: 700,
          }}
        >
          <IconFlame size={12} />
          <span>{damaged} Damaged</span>
        </span>
      )}
    </div>
  )
}
