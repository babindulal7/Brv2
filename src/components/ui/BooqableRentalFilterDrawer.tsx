import { useId } from 'react'
import { FilterDrawer } from './FilterDrawer'
import Icon from './Icon'
import { Badge } from './Badge'
import { Button } from './Page'
import { Unavailable } from './Unavailable'
import { STATUS_ORDER } from '../../lib/workflow'
import type { BookingStatus } from '../../lib/workflow'
import type { ChipKey } from '../../lib/queries/bookings'

export interface BooqableRentalFilterDrawerProps {
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
  { key: 'All', label: 'All Rentals', icon: 'queues' },
  { key: 'Upcoming', label: 'Needs Packing / Upcoming', icon: 'box', description: 'Bookings awaiting warehouse packing' },
  { key: 'Tomorrow', label: 'Pickup Tomorrow', icon: 'truck', description: 'Starts tomorrow' },
  { key: 'Returning', label: 'Due for Return', icon: 'queues', description: 'Expected return' },
  { key: 'On Rent', label: 'Currently On Rent', icon: 'truck', description: 'Gear active with clients' },
  { key: 'Overdue', label: 'Overdue Returns', icon: 'alert_triangle', description: 'Past return deadline and not checked in' },
  { key: 'Payment Due', label: 'Awaiting Payment', icon: 'invoice', description: 'Unpaid or partial deposits' },
]

export function BooqableRentalFilterDrawer({
  open,
  onClose,
  resultCount,
  activeCount,
  onClearAll,
  statusFilter,
  onToggleStatus,
  quickFilter,
  onSelectQuickFilter,
  subOn,
  onToggleSub,
  money = false,
  stageCounts = {},
}: BooqableRentalFilterDrawerProps) {
  const drawerId = useId()

  return (
    <FilterDrawer
      id={drawerId}
      open={open}
      onClose={onClose}
      side="right"
      width={400}
      resultCount={resultCount}
      noun={resultCount === 1 ? 'rental' : 'rentals'}
      activeCount={activeCount}
      onClearAll={onClearAll}
    >
      <div style={{ display: 'grid', gap: 'var(--sp-lg)', paddingBottom: 'var(--sp-md)' }}>
        {/* Section 1: Booqable Quick Presets / Views */}
        <section aria-labelledby="preset-views-heading">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3
              id="preset-views-heading"
              style={{
                margin: 0,
                fontSize: 'var(--t-meta)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--muted)',
              }}
            >
              Smart Views & Presets
            </h3>
            {quickFilter !== 'All' && (
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
                Reset preset
              </button>
            )}
          </div>

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
                      background: isSelected ? 'var(--primary)' : 'var(--chip-neutral-bg, rgba(0,0,0,0.04))',
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
        </section>

        {/* Section 2: Rental Stage / Status Facets */}
        <section aria-labelledby="stage-facets-heading">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3
              id="stage-facets-heading"
              style={{
                margin: 0,
                fontSize: 'var(--t-meta)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--muted)',
              }}
            >
              Lifecycle Stage
            </h3>
            {statusFilter.size > 0 && (
              <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--primary)' }}>
                {statusFilter.size} active
              </span>
            )}
          </div>

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
        </section>

        {/* Section 3: Sourcing & External Gear */}
        <section aria-labelledby="sourcing-heading">
          <h3
            id="sourcing-heading"
            style={{
              margin: '0 0 8px',
              fontSize: 'var(--t-meta)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--muted)',
            }}
          >
            Fulfillment & Sourcing
          </h3>

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
        </section>

        {/* Save as new filter & Apply & Show Results button */}
        <div style={{ paddingTop: 'var(--sp-sm)', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Unavailable reason="Saved filters are not built yet — there is nowhere to store one and nothing settles who it is shared with.">
            <Button icon="flag" disabled>
              Save as new filter
            </Button>
          </Unavailable>
          <button
            type="button"
            className="press tap"
            onClick={onClose}
            style={{
              width: '100%',
              minHeight: 44,
              borderRadius: 'var(--r-btn)',
              border: '1px solid transparent',
              background: 'var(--primary)',
              color: 'var(--on-brand)',
              fontFamily: 'inherit',
              fontSize: 'var(--t-ui)',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Icon name="check" size={16} />
            <span>Show {resultCount !== null ? `${resultCount} ` : ''}Results</span>
          </button>
        </div>
      </div>
    </FilterDrawer>
  )
}
