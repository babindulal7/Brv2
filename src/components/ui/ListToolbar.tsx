import type { ReactNode } from 'react'
import Icon from './Icon'
import { Button } from './Button'
import { SearchInput } from './SearchInput'
import { useViewport } from '../../lib/device'

export interface ListToolbarProps {
  /** Search input value */
  search?: string
  /** Search change handler */
  onSearchChange?: (val: string) => void
  /** Search placeholder */
  searchPlaceholder?: string
  /** Search input ref for keyboard shortcuts */
  searchInputRef?: React.Ref<HTMLInputElement> | undefined
  /** Primary inline filters (e.g. Status Select, Date Picker) */
  filters?: ReactNode
  /** Handler to open 'More Filters' drawer */
  onOpenMoreFilters?: () => void
  /** Number of active filters in drawer */
  moreFiltersCount?: number
  /** Is the 'More Filters' drawer currently open */
  isMoreFiltersOpen?: boolean
  /** View toggle or secondary controls */
  viewControl?: ReactNode
  /** Active filter chips rendered below the main controls row */
  activeChips?: ReactNode
  /** Count string (e.g. "42 rentals") */
  resultCount?: ReactNode
  /** Secondary actions on the right */
  actions?: ReactNode
  /** Class name */
  className?: string
}

/**
 * Standardized ListToolbar primitive for Babin Rentals OS.
 * Follows OS7 layout directive §8:
 * [ Search... ] [ Status ▾ ] [ Date ▾ ] [ More Filters (N) ]       [ View / Count ]
 * Active: [ Filter × ] [ Filter × ]
 */
export function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  searchInputRef,
  filters,
  onOpenMoreFilters,
  moreFiltersCount = 0,
  isMoreFiltersOpen = false,
  viewControl,
  activeChips,
  resultCount,
  actions,
  className = '',
}: ListToolbarProps) {
  const vp = useViewport()
  const isPhone = vp === 'phone'

  return (
    <div
      className={`list-toolbar ${className}`.trim()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-3)',
      }}
    >
      {/* Primary controls row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          flexWrap: isPhone ? 'wrap' : 'nowrap',
          width: '100%',
        }}
      >
        {/* Search */}
        {onSearchChange && (
          <div
            style={{
              position: 'relative',
              flex: isPhone ? '1 1 100%' : '1 1 auto',
              minWidth: isPhone ? '100%' : 260,
              maxWidth: isPhone ? '100%' : 480,
            }}
          >
            <SearchInput
              ref={searchInputRef}
              value={search ?? ''}
              onChange={onSearchChange}
              onClear={() => onSearchChange('')}
              placeholder={searchPlaceholder}
            />
          </div>
        )}

        {/* Inline Filters slot */}
        {filters && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              flexWrap: isPhone ? 'wrap' : 'nowrap',
              flexShrink: 0,
            }}
          >
            {filters}
          </div>
        )}

        {/* More Filters Drawer Trigger */}
        {onOpenMoreFilters && (
          <Button
            type="button"
            variant={moreFiltersCount > 0 || isMoreFiltersOpen ? 'primary' : 'secondary'}
            icon={<Icon name="filter" size={15} />}
            onClick={onOpenMoreFilters}
            aria-expanded={isMoreFiltersOpen}
            aria-label={`More filters${moreFiltersCount > 0 ? ` (${moreFiltersCount} active)` : ''}`}
            style={{
              flexShrink: 0,
              minHeight: 'var(--control-height)',
            }}
          >
            Filters
            {moreFiltersCount > 0 && (
              <span
                style={{
                  marginLeft: 4,
                  padding: '1px 6px',
                  borderRadius: 'var(--r-badge)',
                  background: isMoreFiltersOpen ? 'rgba(255,255,255,0.25)' : 'var(--primary)',
                  color: 'var(--on-primary)',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                {moreFiltersCount}
              </span>
            )}
          </Button>
        )}

        {/* Right slot: View control, result count, actions */}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flexShrink: 0,
          }}
        >
          {resultCount && (
            <span
              className="figure"
              style={{
                fontSize: 'var(--t-meta)',
                color: 'var(--muted)',
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
            >
              {resultCount}
            </span>
          )}

          {viewControl}
          {actions}
        </div>
      </div>

      {/* Active chips row */}
      {activeChips && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flexWrap: 'wrap',
            paddingTop: 'var(--space-1)',
          }}
        >
          {activeChips}
        </div>
      )}
    </div>
  )
}
export default ListToolbar
