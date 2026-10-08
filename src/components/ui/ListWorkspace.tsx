import type { ReactNode } from 'react'
import './list-workspace.css'

/** The shared, presentational order for a record list. Domain filters and writes stay in the page. */
export function ListWorkspace({
  controls,
  quickFilters,
  activeFilters,
  results,
  children,
  className = '',
}: {
  controls?: ReactNode
  quickFilters?: ReactNode
  activeFilters?: ReactNode
  results?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`list-workspace ${className}`.trim()}>
      {controls}
      {quickFilters && <div className="list-workspace__quick-filters">{quickFilters}</div>}
      {activeFilters}
      {results}
      {children}
    </section>
  )
}

/** Search and filtering lead; sorting and the view choice stay on the right. */
export function ListControlRow({
  search,
  filters,
  sort,
  view,
  extras,
}: {
  search?: ReactNode
  filters?: ReactNode
  sort?: ReactNode
  view?: ReactNode
  extras?: ReactNode
}) {
  return (
    <div className="list-workspace__controls" role="group" aria-label="List display controls">
      {search && <div className="list-workspace__search">{search}</div>}
      {filters}
      {extras}
      <div className="list-workspace__controls-end">
        {sort}
        {view}
      </div>
    </div>
  )
}
