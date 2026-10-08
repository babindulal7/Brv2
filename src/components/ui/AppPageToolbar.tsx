import { ReactNode } from 'react'

interface AppPageToolbarProps {
  /** Left slot: bulk actions (e.g. 3 models selected [Clear]) */
  bulkActions?: ReactNode
  /** Center slot: active filters display */
  filterChips?: ReactNode
  /** Right slot: Result count, columns, view toggles */
  rightSlot?: ReactNode
  /** Pagination component */
  pagination?: ReactNode
}

/**
 * Standardized global page toolbar. Sits above tables and grids.
 */
export function AppPageToolbar({ bulkActions, filterChips, rightSlot }: AppPageToolbarProps) {
  if (!bulkActions && !filterChips && !rightSlot) return null
  return (
    <div className="app-page-toolbar" role="group" aria-label="List controls">
      <div className="app-page-toolbar__start">
        {bulkActions}
        {filterChips}
      </div>

      <div className="app-page-toolbar__end">
        {rightSlot}
      </div>
    </div>
  )
}
