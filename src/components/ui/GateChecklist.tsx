import React from 'react'
import { IconCheck, IconX, IconAlertTriangle } from '@tabler/icons-react'
import type { Role } from '../../lib/rbac'
import { canViewMoney } from '../../lib/rbac'
import { formatPaisa, type Paisa } from '../../lib/money'

/**
 * ⚠ Not mounted anywhere yet — `components/ui/index.ts` is its only importer.
 * Kept per Law 3, but two defects are fixed here so it cannot be mounted
 * carrying them:
 *
 *  1. **Law 15** — the toggle was `w-6 h-6` (24×24) on a real `<button>`.
 *  2. **Law 6 / Rulings §7** — money surfaces are **omitted**, not disabled
 *     and not masked. The financial column used to render a padlock and the
 *     words "Pending Billing" for a money-blind role, which still tells the
 *     floor there is a billing state to wait on. It is now not constructed at
 *     all for those roles, which is what "the warehouse sees no money" means.
 *
 * ⚠ Still outstanding, and the reason this should not be mounted as-is: every
 * class below is Tailwind, and `components/ui/Button.tsx:5-9` records that
 * Tailwind compiles to nothing in this build — so this would render unstyled.
 * Porting it to the app's inline-style + CSS-variable system is a separate
 * piece of work from the two law breaches above.
 */

export interface GateChecklistItem {
  id: string
  label: string
  passed: boolean
  isFinancial?: boolean
  financialAmount?: Paisa
  note?: string
}

export interface GateChecklistProps {
  type: 'Handover' | 'Closure'
  role: Role
  items: GateChecklistItem[]
  onToggleItem?: (id: string, passed: boolean) => void
  disabled?: boolean
  className?: string
}

export const GateChecklist: React.FC<GateChecklistProps> = ({
  type,
  role,
  items,
  onToggleItem,
  disabled = false,
  className = '',
}) => {
  const userCanSeeMoney = canViewMoney(role)
  const allPassed = items.every((i) => i.passed)

  return (
    <div className={`bg-slate-900/90 border border-slate-800 rounded-xl p-5 ${className}`}>
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <h4 className="font-semibold text-sm text-slate-100 flex items-center gap-2">
            <span>{type === 'Handover' ? 'Dispatch Gate Checklist' : 'Return & Closure Gate'}</span>
            {allPassed ? (
              <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                <IconCheck className="w-3 h-3" /> Ready
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-amber-400 bg-amber-950/60 border border-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                <IconAlertTriangle className="w-3 h-3" /> Blocked
              </span>
            )}
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            {type === 'Handover'
              ? 'All items must pass before handover signature and dispatch.'
              : 'All return inspections, damage reconciliations, and ledgers must clear before closure.'}
          </p>
        </div>
      </div>

      <div className="divide-y divide-slate-800/60 mt-2">
        {items.map((item) => (
          <div key={item.id} className="py-3 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <button
                type="button"
                aria-label={`Mark ${item.label} as ${item.passed ? 'not passed' : 'passed'}`}
                aria-pressed={item.passed}
                disabled={disabled || !onToggleItem}
                onClick={() => onToggleItem && onToggleItem(item.id, !item.passed)}
                /* Law 15 — 44×44 at every width, desktop included. */
                style={{ minWidth: 44, minHeight: 44 }}
                className={`rounded-md flex items-center justify-center border transition-all cursor-pointer ${
                  item.passed
                    ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400'
                    : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600'
                } ${disabled || !onToggleItem ? 'cursor-default' : ''}`}
              >
                {item.passed ? <IconCheck className="w-4 h-4" /> : <IconX className="w-4 h-4 opacity-40" />}
              </button>

              <div>
                <span className={`text-sm ${item.passed ? 'text-slate-200' : 'text-slate-400'}`}>
                  {item.label}
                </span>
                {item.note && <p className="text-xs text-slate-500 mt-0.5">{item.note}</p>}
              </div>
            </div>

            {/* Law 6 — omitted, never masked. A money-blind session does not get
                a padlock and a billing state; it gets no financial cell. */}
            {item.isFinancial && userCanSeeMoney && item.financialAmount !== undefined && (
              <div className="shrink-0 text-right">
                <span className="text-xs font-mono font-semibold text-slate-300">
                  {formatPaisa(item.financialAmount)}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
