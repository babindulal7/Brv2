import { useEffect } from 'react'
import { FilterSection } from './FilterDrawer'
import { canViewMoney, type Role as SystemRole } from '../../lib/rbac'

export type CanonicalStage = 'quote' | 'booked' | 'packed' | 'on_rent' | 'returned' | 'closed'
export type PaymentFilter = 'unpaid' | 'advance_paid' | 'paid' | 'overpaid' | 'deposit_held'
export type ClientTier = 'purple' | 'blue' | 'green' | 'yellow' | 'red'

export interface FilterState {
  stages: Set<CanonicalStage>
  paymentStatuses: Set<PaymentFilter>
  clientTiers: Set<ClientTier>
  datePreset: string
  highAltitudeOnly: boolean
  caretakerOnly: boolean
}

export interface StageCountMap {
  quote?: number
  booked?: number
  packed?: number
  on_rent?: number
  returned?: number
  closed?: number
}

export interface GlobalFilterDrawerProps {
  open: boolean
  onClose: () => void
  filterState: FilterState
  onChange: (newState: FilterState) => void
  onClearAll: () => void
  totalMatches: number
  stageCounts?: StageCountMap
  userRole?: SystemRole | 'owner' | 'manager' | 'rental_agent' | 'warehouse' | 'crew'
  isDesktop?: boolean
  className?: string
}

/**
 * GlobalFilterDrawer — Authoritative Filter Engine for Babin Rentals OS.
 * Supports inline rail mode (≥1180px) and slide-over drawer mode (<1180px).
 * Strictly enforces Law 6 (Warehouse Sees No Money), Law 11 (Never Colour Alone), and Law 15 (Touch Targets).
 */
export function GlobalFilterDrawer({
  open,
  onClose,
  filterState,
  onChange,
  onClearAll,
  totalMatches,
  stageCounts = {},
  userRole = 'Coordinator',
  isDesktop = true,
  className = '',
}: GlobalFilterDrawerProps) {
  // Law 6: Warehouse and money-blind roles are barred from viewing financial facets
  const canViewFinancials =
    userRole === 'warehouse' || userRole === 'crew'
      ? false
      : canViewMoney(userRole as SystemRole)

  // Calculate total active filters
  const activeCount =
    filterState.stages.size +
    (canViewFinancials ? filterState.paymentStatuses.size : 0) +
    filterState.clientTiers.size +
    (filterState.datePreset !== 'all_time' ? 1 : 0) +
    (filterState.highAltitudeOnly ? 1 : 0) +
    (filterState.caretakerOnly ? 1 : 0)

  // Stage toggle helper
  const toggleStage = (stage: CanonicalStage) => {
    const next = new Set(filterState.stages)
    if (next.has(stage)) next.delete(stage)
    else next.add(stage)
    onChange({ ...filterState, stages: next })
  }

  // Payment status toggle helper
  const togglePayment = (pay: PaymentFilter) => {
    const next = new Set(filterState.paymentStatuses)
    if (next.has(pay)) next.delete(pay)
    else next.add(pay)
    onChange({ ...filterState, paymentStatuses: next })
  }

  // Client tier toggle helper
  const toggleTier = (tier: ClientTier) => {
    const next = new Set(filterState.clientTiers)
    if (next.has(tier)) next.delete(tier)
    else next.add(tier)
    onChange({ ...filterState, clientTiers: next })
  }

  // Handle Escape key for slide-over drawer mode
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && open && !isDesktop) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, isDesktop, onClose])

  if (!open && !isDesktop) return null

  const content = (
    <div
      className={`filter-container ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: isDesktop ? '260px' : '320px',
        background: 'var(--surface, #FFFFFF)',
        borderRight: isDesktop ? '1px solid var(--border, #E2E8F0)' : 'none',
        padding: '16px',
        overflowY: 'auto',
        boxSizing: 'border-box',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border, #E2E8F0)',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary, #0F172A)' }}>
            Filters
          </span>
          {activeCount > 0 && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                background: '#2563EB',
                color: '#FFFFFF',
                borderRadius: '10px',
                padding: '1px 7px',
              }}
            >
              {activeCount}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#2563EB',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Clear all
            </button>
          )}

          {!isDesktop && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close filters"
              style={{
                border: 'none',
                background: 'transparent',
                color: '#64748B',
                cursor: 'pointer',
                padding: '4px',
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Match Count Indicator */}
      <div
        style={{
          fontSize: '12px',
          color: '#64748B',
          marginBottom: '16px',
          fontWeight: 500,
        }}
      >
        Showing <strong style={{ color: '#0F172A' }}>{totalMatches}</strong> matching bookings
      </div>

      {/* Section 1: Canonical Operational Stages (Law 11) */}
      <FilterSection
        title="Stage"
        defaultOpen
        badge={
          filterState.stages.size > 0 && (
            <span style={{ fontSize: '11px', color: '#2563EB', fontWeight: 700 }}>
              ({filterState.stages.size})
            </span>
          )
        }
      >
        {[
          { id: 'quote' as const, label: 'Quote', color: '#2563EB', count: stageCounts.quote },
          { id: 'booked' as const, label: 'Booked', color: '#4F46E5', count: stageCounts.booked },
          { id: 'packed' as const, label: 'Packed', color: '#F97316', count: stageCounts.packed },
          { id: 'on_rent' as const, label: 'On Rent', color: '#16A34A', count: stageCounts.on_rent },
          { id: 'returned' as const, label: 'Returned', color: '#D97706', count: stageCounts.returned },
          { id: 'closed' as const, label: 'Closed', color: '#64748B', count: stageCounts.closed },
        ].map((item) => {
          const checked = filterState.stages.has(item.id)
          return (
            <label
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minHeight: '36px',
                padding: '4px 6px',
                borderRadius: '4px',
                cursor: 'pointer',
                background: checked ? 'rgba(37,99,235,0.06)' : 'transparent',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleStage(item.id)}
                style={{ width: '16px', height: '16px', accentColor: item.color }}
              />
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: item.color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: checked ? 600 : 400,
                  color: checked ? '#0F172A' : '#334155',
                  flex: 1,
                }}
              >
                {item.label}
              </span>
              {item.count !== undefined && (
                <span style={{ fontSize: '12px', color: '#94A3B8', fontVariantNumeric: 'tabular-nums' }}>
                  {item.count}
                </span>
              )}
            </label>
          )
        })}
      </FilterSection>

      {/* Section 2: Payment Status (Law 6 Guarded) */}
      {canViewFinancials && (
        <FilterSection
          title="Payment Status"
          defaultOpen
          badge={
            filterState.paymentStatuses.size > 0 && (
              <span style={{ fontSize: '11px', color: '#2563EB', fontWeight: 700 }}>
                ({filterState.paymentStatuses.size})
              </span>
            )
          }
        >
          {[
            { id: 'unpaid' as const, label: 'Payment Due' },
            { id: 'advance_paid' as const, label: 'Advance Paid (Gate §R1)' },
            { id: 'paid' as const, label: 'Paid in Full' },
            { id: 'deposit_held' as const, label: 'Security Deposit Held' },
          ].map((item) => {
            const checked = filterState.paymentStatuses.has(item.id)
            return (
              <label
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  minHeight: '36px',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  background: checked ? 'rgba(37,99,235,0.06)' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => togglePayment(item.id)}
                  style={{ width: '16px', height: '16px', accentColor: '#2563EB' }}
                />
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: checked ? 600 : 400,
                    color: checked ? '#0F172A' : '#334155',
                    flex: 1,
                  }}
                >
                  {item.label}
                </span>
              </label>
            )
          })}
        </FilterSection>
      )}

      {/* Section 3: Date Range Dimensions */}
      <FilterSection title="Rental Window" defaultOpen>
        <div style={{ display: 'grid', gap: '6px' }}>
          {[
            { id: 'all_time', label: 'All Time' },
            { id: 'today', label: 'Shooting Today' },
            { id: 'tomorrow', label: 'Starts Tomorrow' },
            { id: 'returning_today', label: 'Returning Today' },
            { id: 'overdue', label: 'Overdue Window' },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange({ ...filterState, datePreset: preset.id })}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: '6px',
                border: filterState.datePreset === preset.id ? '1px solid #2563EB' : '1px solid #E2E8F0',
                background: filterState.datePreset === preset.id ? 'rgba(37,99,235,0.06)' : '#FFFFFF',
                color: filterState.datePreset === preset.id ? '#2563EB' : '#334155',
                fontSize: '12px',
                fontWeight: filterState.datePreset === preset.id ? 600 : 400,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span>{preset.label}</span>
              {filterState.datePreset === preset.id && <span>✓</span>}
            </button>
          ))}
        </div>
      </FilterSection>

      {/* Section 4: Client Loyalty Tiers (Law 17) */}
      <FilterSection title="Client Tier">
        {[
          { id: 'purple' as const, label: 'VIP (500k+)', color: '#9333EA' },
          { id: 'blue' as const, label: 'Trusted (200k+)', color: '#2563EB' },
          { id: 'green' as const, label: 'Regular (50k+)', color: '#16A34A' },
          { id: 'yellow' as const, label: 'New Client', color: '#CA8A04' },
          { id: 'red' as const, label: 'Payment Risk', color: '#DC2626' },
        ].map((item) => {
          const checked = filterState.clientTiers.has(item.id)
          return (
            <label
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minHeight: '34px',
                padding: '4px 6px',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleTier(item.id)}
                style={{ width: '16px', height: '16px', accentColor: item.color }}
              />
              <span style={{ fontSize: '13px', color: '#334155' }}>{item.label}</span>
            </label>
          )
        })}
      </FilterSection>
    </div>
  )

  if (isDesktop) {
    return content
  }

  // Mobile / Tablet Slide-over Modal with Backdrop
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(2px)',
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 101,
          height: '100%',
          boxShadow: '-4px 0 25px rgba(0,0,0,0.15)',
        }}
      >
        {content}
      </div>
    </div>
  )
}
export default GlobalFilterDrawer
