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
    <div
      className={className || undefined}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-card)',
        padding: 18,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 12,
          borderBottom: '1px solid var(--border)',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div>
          <h4
            style={{
              margin: 0,
              fontWeight: 700,
              fontSize: 'var(--t-ui)',
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>{type === 'Handover' ? 'Dispatch Gate Checklist' : 'Return & Closure Gate'}</span>
            {allPassed ? (
              <span
                style={{
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  color: 'var(--st-in-fg)',
                  background: 'var(--st-in-bg)',
                  border: '1px solid var(--st-in-border)',
                  padding: '2px 8px',
                  borderRadius: 'var(--r-badge)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <IconCheck size={12} /> Ready
              </span>
            ) : (
              <span
                style={{
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  color: 'var(--st-progress-fg)',
                  background: 'var(--st-progress-bg)',
                  border: '1px solid var(--st-progress-border)',
                  padding: '2px 8px',
                  borderRadius: 'var(--r-badge)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <IconAlertTriangle size={12} /> Blocked
              </span>
            )}
          </h4>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            {type === 'Handover'
              ? 'All items must pass before handover signature and dispatch.'
              : 'All return inspections, damage reconciliations, and ledgers must clear before closure.'}
          </p>
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        {items.map((item, idx) => (
          <div
            key={item.id}
            style={{
              padding: '12px 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
              <button
                type="button"
                aria-label={`Mark ${item.label} as ${item.passed ? 'not passed' : 'passed'}`}
                aria-pressed={item.passed}
                disabled={disabled || !onToggleItem}
                onClick={() => onToggleItem && onToggleItem(item.id, !item.passed)}
                /* Law 15 — 44×44 at every width, desktop included. */
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  width: 44,
                  height: 44,
                  borderRadius: 'var(--r-sm)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: item.passed ? '1px solid var(--st-in-border)' : '1px solid var(--border)',
                  background: item.passed ? 'var(--st-in-bg)' : 'var(--card2)',
                  color: item.passed ? 'var(--st-in-fg)' : 'var(--muted)',
                  cursor: disabled || !onToggleItem ? 'default' : 'pointer',
                  flexShrink: 0,
                  transition: 'all var(--dur) var(--ease)',
                }}
              >
                {item.passed ? <IconCheck size={16} /> : <IconX size={16} style={{ opacity: 0.4 }} />}
              </button>

              <div style={{ minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 'var(--t-ui)',
                    fontWeight: item.passed ? 600 : 400,
                    color: item.passed ? 'var(--text)' : 'var(--text2)',
                  }}
                >
                  {item.label}
                </span>
                {item.note && (
                  <p style={{ margin: '2px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{item.note}</p>
                )}
              </div>
            </div>

            {/* Law 6 — omitted, never masked. A money-blind session does not get
                a padlock and a billing state; it gets no financial cell. */}
            {item.isFinancial && userCanSeeMoney && item.financialAmount !== undefined && (
              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                <span style={{ fontSize: 'var(--t-meta)', fontFamily: 'var(--font-id, sans-serif)', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--text)' }}>
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
