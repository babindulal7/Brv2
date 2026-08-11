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
        className={`inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 px-2 py-0.5 rounded-full select-none ${className}`}
        title="All financial lines reconcile to the exact paisa (Foundation §2)"
      >
        <IconCheck className="w-3 h-3" />
        <span>Reconciled</span>
      </span>
    ) : (
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-950/60 border border-amber-800 px-2 py-0.5 rounded-full select-none animate-pulse ${className}`}
      >
        <IconAlertTriangle className="w-3 h-3" />
        <span>Reconciliation Drift</span>
      </span>
    )
  }

  return (
    <div
      className={`rounded-xl border p-4 flex flex-col gap-2.5 ${
        isReconciled
          ? 'bg-emerald-950/20 border-emerald-800/50 text-emerald-50'
          : 'bg-amber-950/40 border-amber-800 text-amber-100'
      } ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isReconciled ? (
            <div className="p-1 rounded-full bg-emerald-500/20 text-emerald-400">
              <IconCheck className="w-4 h-4" />
            </div>
          ) : (
            <div className="p-1 rounded-full bg-amber-500/20 text-amber-400">
              <IconAlertTriangle className="w-4 h-4" />
            </div>
          )}
          <h4 className="text-xs font-semibold uppercase tracking-wider">
            {isReconciled ? 'Foundation v2.0 Financial Reconciliation' : 'Calculation Discrepancy Detected'}
          </h4>
        </div>

        <span className="text-xs font-mono text-slate-400">
          {isReconciled ? 'Zero Drift' : 'Drift Detected'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono pt-2 border-t border-slate-800/60">
        <div>
          <span className="text-slate-400 block text-[10px]">Rental Total</span>
          <span className="text-slate-200 font-semibold">{formatPaisa(rentalTotal)}</span>
        </div>
        <div>
          <span className="text-slate-400 block text-[10px]">Payments</span>
          <span className="text-emerald-400 font-semibold">{formatPaisa(payments)}</span>
        </div>
        <div>
          <span className="text-slate-400 block text-[10px]">Outstanding</span>
          <span className="text-blue-300 font-semibold">{formatPaisa(outstanding)}</span>
        </div>
        <div>
          <span className="text-slate-400 block text-[10px]">Status</span>
          <span className={isReconciled ? 'text-emerald-400' : 'text-amber-400 font-bold'}>
            {isReconciled ? 'Balanced ✓' : 'Mismatch ✗'}
          </span>
        </div>
      </div>
    </div>
  )
}
