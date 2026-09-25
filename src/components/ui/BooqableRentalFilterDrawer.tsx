import { useId } from 'react'
import { FilterDrawer, FilterSection } from './FilterDrawer'
import Icon from './Icon'
import { Badge } from './Badge'
import { Button } from './Page'
import { Unavailable } from './Unavailable'
import { STATUS_ORDER } from '../../lib/workflow'
import type { BookingStatus } from '../../lib/workflow'
import type { ChipKey } from '../../lib/queries/bookings'
import { DateRangePresets } from './DateRangePresets'

export interface BooqableRentalFilterDrawerProps {
  /** Render only filter contents when hosted by the shared app panel. */
  embedded?: boolean
  id?: string
  open: boolean
  onClose: () => void
  resultCount: number | null
  activeCount: number
  onClearAll: () => void
  /** Stage facet */
  statusFilter: Set<BookingStatus>
  onToggleStatus: (status: BookingStatus) => void
  /** Quick filter preset */
  quickFilter: ChipKey
  onSelectQuickFilter: (chip: ChipKey) => void
  /** Date range filter and presets */
  dateRange?: { from: string; to: string }
  onChangeDateRange?: (range: { from: string; to: string }) => void
  /** Sub-rental toggle */
  subOn: boolean
  onToggleSub: () => void
  /** Money visibility (Law 6) */
  money?: boolean
  /** Live stage counts */
  stageCounts?: Record<string, number | null>
}

interface PresetOption {
  key: ChipKey
  label: string
  icon: 'queues' | 'box' | 'truck' | 'alert_triangle' | 'invoice' | 'check'
  description?: string
}

const BOOQABLE_PRESETS: PresetOption[] = [
  { key: 'All', label: 'All', icon: 'queues' },
  { key: 'Upcoming', label: 'Upcoming', icon: 'box', description: 'Bookings awaiting warehouse packing' },
  { key: 'Tomorrow', label: 'Tomorrow', icon: 'truck', description: 'Starts tomorrow' },
  { key: 'Returning', label: 'Returning', icon: 'queues', description: 'Expected return' },
  { key: 'On Rent', label: 'On Rent', icon: 'truck', description: 'Gear active with clients' },
  { key: 'Overdue', label: 'Overdue', icon: 'alert_triangle', description: 'Past return deadline and not checked in' },
  { key: 'Payment Due', label: 'Payment Due', icon: 'invoice', description: 'Unpaid or partial deposits' },
]

export function BooqableRentalFilterDrawer({
  embedded = false,
  id,
  open,
  onClose,
  resultCount,
  activeCount,
  onClearAll,
  statusFilter,
  onToggleStatus,
  quickFilter,
  onSelectQuickFilter,
  dateRange,
  onChangeDateRange,
  subOn,
  onToggleSub,
  money = false,
  stageCounts = {},
}: BooqableRentalFilterDrawerProps) {
  const generatedDrawerId = useId()
  const drawerId = id ?? generatedDrawerId

  const content = (
      <div style={{ display: 'grid', gap: 'var(--sp-xs)', paddingBottom: 'var(--sp-md)' }}>
        {/* Section 1: Booqable Quick Presets / Views */}
        <FilterSection
          title="Smart Views & Presets"
          defaultOpen
          action={
            quickFilter !== 'All' ? (
              <button
                type="button"
                onClick={() => onSelectQuickFilter('All')}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--link)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Reset
              </button>
            ) : null
          }
        >
          <div style={{ display: 'grid', gap: 6 }}>
            {BOOQABLE_PRESETS.map((p) => {
              // Hide payment preset if user cannot view money (Law 6)
              if (p.key === 'Payment Due' && !money) return null
              const isSelected = quickFilter === p.key

              return (
                <button
                  key={p.key}
                  type="button"
                  className="tap"
                  aria-pressed={isSelected}
                  onClick={() => onSelectQuickFilter(p.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    minHeight: 44,
                    padding: '0 12px',
                    borderRadius: 'var(--r-sm)',
                    border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                    background: isSelected ? 'var(--hover-card)' : 'var(--card)',
                    color: isSelected ? 'var(--primary)' : 'var(--text)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    transition: 'all 120ms ease',
                  }}
                >
                  <span
                    style={{
                      display: 'grid',
                      placeItems: 'center',
                      width: 28,
                      height: 28,
                      borderRadius: 'var(--r-badge)',
                      background: isSelected ? 'var(--primary)' : 'var(--chip-gray-bg)',
                      color: isSelected ? 'var(--on-brand)' : 'var(--text2)',
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={p.icon} size={15} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--t-ui)', fontWeight: isSelected ? 700 : 500 }}>
                      {p.label}
                    </div>
                  </div>
                  {isSelected && (
                    <Icon name="check" size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                  )}
                </button>
              )
            })}
          </div>
        </FilterSection>

        {/* Section 2: Rental Stage / Status Facets */}
        <FilterSection
          title="Status"
          defaultOpen
          badge={
            statusFilter.size > 0 ? (
              <Badge tone="primary" label={`${statusFilter.size} active`} size="sm" />
            ) : undefined
          }
        >
          <div style={{ display: 'grid', gap: 6 }}>
            {STATUS_ORDER.map((stage) => {
              const isChecked = statusFilter.has(stage)
              const count = stageCounts[stage]

              return (
                <label
                  key={stage}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    minHeight: 44,
                    padding: '0 12px',
                    borderRadius: 'var(--r-sm)',
                    border: `1px solid ${isChecked ? 'var(--primary)' : 'var(--border)'}`,
                    background: isChecked ? 'var(--hover-card)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleStatus(stage)}
                    style={{
                      width: 16,
                      height: 16,
                      flexShrink: 0,
                      accentColor: 'var(--primary)',
                    }}
                  />
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Badge tone={stage === 'Closed' ? 'neutral' : stage === 'Returned' ? 'in' : 'progress'} label={stage} size="sm" />
                  </div>
                  {count !== undefined && count !== null && (
                    <span
                      className="figure"
                      style={{
                        fontSize: 'var(--t-meta)',
                        color: 'var(--muted)',
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 600,
                      }}
                    >
                      {count}
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        </FilterSection>

        {/* Section 3: Booqable Date Range Presets */}
        {onChangeDateRange && (
          <FilterSection
            title="Date"
            defaultOpen
            badge={
              (dateRange?.from || dateRange?.to) ? (
                <Badge tone="primary" label="Filtered" size="sm" />
              ) : undefined
            }
            action={
              (dateRange?.from || dateRange?.to) ? (
                <button
                  type="button"
                  onClick={() => onChangeDateRange({ from: '', to: '' })}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--link)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Reset
                </button>
              ) : null
            }
          >
            <DateRangePresets
              from={dateRange?.from ?? ''}
              to={dateRange?.to ?? ''}
              onChange={onChangeDateRange}
            />
          </FilterSection>
        )}

        {/* Section 4: Sourcing & External Gear */}
        <FilterSection
          title="Fulfillment & Sourcing"
          defaultOpen
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minHeight: 44,
              padding: '0 12px',
              borderRadius: 'var(--r-sm)',
              border: `1px solid ${subOn ? 'var(--primary)' : 'var(--border)'}`,
              background: subOn ? 'var(--hover-card)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={subOn}
              onChange={onToggleSub}
              style={{
                width: 16,
                height: 16,
                flexShrink: 0,
                accentColor: 'var(--primary)',
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 'var(--t-ui)', fontWeight: subOn ? 700 : 500, color: 'var(--text)' }}>
                  Sub-rented Gear Only
                </span>
                <Badge tone="ext" label="External" size="sm" />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: 2 }}>
                Narrows to bookings sourcing equipment from 3rd-party vendors
              </div>
            </div>
          </label>
        </FilterSection>

        {/* Save as new filter */}
        <div style={{ paddingTop: 'var(--sp-xs)' }}>
          <Unavailable reason="Saved filters are not built yet — there is nowhere to store one and nothing settles who it is shared with.">
            <div style={{ width: '100%' }}>
              <Button icon="flag" disabled>
                Save as new filter
              </Button>
            </div>
          </Unavailable>
        </div>
      </div>
  )

  if (embedded) return open ? <>{content}<div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}><Button onClick={onClearAll}>Clear All</Button><Button variant="primary" onClick={onClose}>{resultCount !== null ? `Show ${resultCount} Results` : 'Apply'}</Button></div></> : null

  return <FilterDrawer id={drawerId} open={open} onClose={onClose} side="left" desktopMode="rail" width={320} resultCount={resultCount} noun={resultCount === 1 ? 'rental' : 'rentals'} activeCount={activeCount} onClearAll={onClearAll} standardFooter onApply={onClose} applyLabel={resultCount !== null ? `Show ${resultCount} Results` : 'Apply'}>{content}</FilterDrawer>
}

/**
 * Alias for BooqableRentalFilterDrawer.
 * Wraps the design system's FilterDrawer primitive to provide domain-specific facets
 * (status, presets, date range, sub-rentals) for Rentals.
 */
export const RentalFilterDrawer = BooqableRentalFilterDrawer
export type RentalFilterDrawerProps = BooqableRentalFilterDrawerProps

