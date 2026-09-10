import React from 'react'
import { IconCheck, IconAlertTriangle } from '@tabler/icons-react'
import type { PriceBreakdown } from '../../lib/money'
import { formatPaisa } from '../../lib/money'
import type { Role } from '../../lib/rbac'
import { canViewMoney } from '../../lib/rbac'

export interface ReconciliationAssertionProps {
  priceBreakdown: PriceBreakdown
  role: Role
  compact?: boolean
  className?: string
}

export const ReconciliationAssertion: React.FC<ReconciliationAssertionProps> = ({
  priceBreakdown,
  role,
  compact = false,
  className = '',
}) => {
  // Law 6: Warehouse sees no money
  if (!canViewMoney(role)) {
    return null
  }

  const { rentalTotal, payments, outstanding, subtotal, discount, taxable, vat } = priceBreakdown

  // Foundation §2.8 reconciliation check
  const subtotalReconciles = taxable === subtotal - discount
  const totalReconciles = rentalTotal === taxable + vat
  const outstandingReconciles = outstanding === rentalTotal - payments

  const isReconciled = subtotalReconciles && totalReconciles && outstandingReconciles

  if (compact) {
    return isReconciled ? (
      <span
        className={className || undefined}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 'var(--t-meta)',
          fontWeight: 600,
          color: 'var(--st-in-fg)',
          background: 'var(--st-in-bg)',
          border: '1px solid var(--st-in-border)',
          padding: '2px 8px',
          borderRadius: 'var(--r-badge)',
          userSelect: 'none',
        }}
        title="All financial lines reconcile to the exact paisa (Foundation §2)"
      >
        <IconCheck size={12} />
        <span>Reconciled</span>
      </span>
    ) : (
      <span
        className={className || undefined}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 'var(--t-meta)',
          fontWeight: 600,
          color: 'var(--st-progress-fg)',
          background: 'var(--st-progress-bg)',
          border: '1px solid var(--st-progress-border)',
          padding: '2px 8px',
          borderRadius: 'var(--r-badge)',
          userSelect: 'none',
        }}
      >
        <IconAlertTriangle size={12} />
        <span>Reconciliation Drift</span>
      </span>
    )
  }

  return (
    <div
      className={className || undefined}
      style={{
        borderRadius: 'var(--r-card)',
        border: isReconciled ? '1px solid var(--st-in-border)' : '1px solid var(--st-progress-border)',
        background: 'var(--card)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              background: isReconciled ? 'var(--st-in-bg)' : 'var(--st-progress-bg)',
              color: isReconciled ? 'var(--st-in-fg)' : 'var(--st-progress-fg)',
              flexShrink: 0,
            }}
          >
            {isReconciled ? <IconCheck size={14} /> : <IconAlertTriangle size={14} />}
          </div>
          <h4
            style={{
              margin: 0,
              fontSize: 'var(--t-meta)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--text)',
            }}
          >
            {isReconciled ? 'Foundation v2.0 Financial Reconciliation' : 'Calculation Discrepancy Detected'}
          </h4>
        </div>

        <span style={{ fontSize: 'var(--t-meta)', fontFamily: 'monospace', color: 'var(--muted)' }}>
          {isReconciled ? 'Zero Drift' : 'Drift Detected'}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: 10,
          fontSize: 'var(--t-meta)',
          paddingTop: 10,
          borderTop: '1px solid var(--border)',
        }}
      >
        <div>
          <span style={{ color: 'var(--muted)', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>Rental Total</span>
          <span style={{ color: 'var(--text)', fontFamily: 'monospace', fontWeight: 600 }}>{formatPaisa(rentalTotal)}</span>
        </div>
        <div>
          <span style={{ color: 'var(--muted)', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>Payments</span>
          <span style={{ color: 'var(--st-in-fg)', fontFamily: 'monospace', fontWeight: 600 }}>{formatPaisa(payments)}</span>
        </div>
        <div>
          <span style={{ color: 'var(--muted)', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>Outstanding</span>
          <span style={{ color: 'var(--st-out-fg)', fontFamily: 'monospace', fontWeight: 600 }}>{formatPaisa(outstanding)}</span>
        </div>
        <div>
          <span style={{ color: 'var(--muted)', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>Status</span>
          <span style={{ color: isReconciled ? 'var(--st-in-fg)' : 'var(--st-progress-fg)', fontWeight: 700 }}>
            {isReconciled ? 'Balanced ✓' : 'Mismatch ✗'}
          </span>
        </div>
      </div>
    </div>
  )
}
