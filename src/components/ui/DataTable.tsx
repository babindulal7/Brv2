import type { HTMLAttributes, KeyboardEvent, ReactNode } from 'react'
import { useViewport } from '../../lib/device'

/** Shared scroll and visual contract for established tables that migrate in stages. */
export function DataTableShell({ ariaLabel, children, className, ...props }: HTMLAttributes<HTMLDivElement> & { ariaLabel: string }) {
  return (
    <div className={['data-table-shell', 'rsp-table-scroll', className].filter(Boolean).join(' ')} role="region" aria-label={ariaLabel} tabIndex={0} {...props}>
      {children}
    </div>
  )
}

export interface DataTableColumn<Row> {
  /** Stable key for testability and responsive column targeting. */
  id: string
  header: ReactNode
  cell: (row: Row) => ReactNode
  align?: 'left' | 'right'
  width?: string | number
  /** Hide low-priority columns on narrow screens without hiding the identity column. */
  hideOnMobile?: boolean
  sortable?: boolean
  /** Text used as the compact record's field label. */
  mobileLabel?: string
}

export interface DataTableProps<Row> {
  ariaLabel: string
  columns: readonly DataTableColumn<Row>[]
  rows: readonly Row[]
  getRowId: (row: Row) => string
  selectedIds?: ReadonlySet<string>
  onSelectedIdsChange?: (ids: Set<string>) => void
  onRowOpen?: (row: Row) => void
  rowActions?: (row: Row) => ReactNode
  emptyState?: ReactNode
  loading?: boolean
  error?: ReactNode
  density?: 'compact' | 'comfortable'
  visibleColumnIds?: readonly string[]
  sort?: { columnId: string; direction: 'asc' | 'desc' }
  onSortChange?: (sort: { columnId: string; direction: 'asc' | 'desc' }) => void
  /** Keeps a compact mobile alternative opt-in instead of shrinking a desktop table. */
  mobileRow?: (row: Row) => ReactNode
}

/**
 * Shared, presentation-only operational table.
 *
 * It owns selection, keyboard row opening, sticky semantic headers and predictable
 * empty/loading states. Sorting, filtering, pagination and record mutations stay
 * with the page that owns the data.
 */
export function DataTable<Row>({
  ariaLabel,
  columns,
  rows,
  getRowId,
  selectedIds = new Set<string>(),
  onSelectedIdsChange,
  onRowOpen,
  rowActions,
  emptyState,
  loading = false,
  mobileRow,
  error,
  density = 'comfortable',
  visibleColumnIds,
  sort,
  onSortChange,
}: DataTableProps<Row>) {
  const phone = useViewport() === 'phone'
  const visibleColumns = visibleColumnIds ? columns.filter((column) => visibleColumnIds.includes(column.id)) : columns
  const selectable = Boolean(onSelectedIdsChange)
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(getRowId(row)))

  const setRowSelected = (id: string, selected: boolean) => {
    if (!onSelectedIdsChange) return
    const next = new Set(selectedIds)
    if (selected) next.add(id)
    else next.delete(id)
    onSelectedIdsChange(next)
  }

  const toggleAll = (selected: boolean) => {
    if (!onSelectedIdsChange) return
    const next = new Set(selectedIds)
    rows.forEach((row) => {
      const id = getRowId(row)
      if (selected) next.add(id)
      else next.delete(id)
    })
    onSelectedIdsChange(next)
  }

  const openFromKeyboard = (event: KeyboardEvent<HTMLTableRowElement>, row: Row) => {
    if (!onRowOpen || (event.target as HTMLElement).closest('button,input,a,select,textarea')) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onRowOpen(row)
    }
  }

  if (error) return <div className="data-table__empty" role="alert">{error}</div>

  if (phone) return (
    <section className="data-table__records" aria-label={ariaLabel} aria-busy={loading}>
      {loading ? <div className="data-table__empty" role="status">Loading records…</div> : rows.length === 0
        ? <div className="data-table__empty" role="status">{emptyState ?? 'No records found.'}</div>
        : rows.map((row) => {
          const id = getRowId(row)
          return <article className="data-table__record" key={id}>
            {selectable && <label className="data-table__record-select"><input type="checkbox" checked={selectedIds.has(id)} onChange={(event) => setRowSelected(id, event.currentTarget.checked)} />Select {id}</label>}
            {mobileRow ? mobileRow(row) : <dl>{visibleColumns.filter((column) => !column.hideOnMobile).map((column) => <div key={column.id}><dt>{column.mobileLabel ?? column.header}</dt><dd>{column.cell(row)}</dd></div>)}</dl>}
            {(onRowOpen || rowActions) && <div className="data-table__record-actions">
              {onRowOpen && <button type="button" className="data-table__sort" onClick={() => onRowOpen(row)}>Open {id}</button>}
              {rowActions?.(row)}
            </div>}
          </article>
        })}
    </section>
  )

  return (
    <>
      <DataTableShell ariaLabel={ariaLabel} aria-busy={loading}>
        <table className={`data-table data-table--${density}`}>
          <caption className="sr-only">{ariaLabel}</caption>
          <thead className="data-table__head">
            <tr>
              {selectable && (
                <th scope="col" style={{ width: 44 }}>
                  <input
                    type="checkbox"
                    aria-label={allSelected ? 'Deselect all rows' : 'Select all rows'}
                    checked={allSelected}
                    ref={(input) => { if (input) input.indeterminate = !allSelected && rows.some((row) => selectedIds.has(getRowId(row))) }}
                    onChange={(event) => toggleAll(event.currentTarget.checked)}
                  />
                </th>
              )}
              {visibleColumns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={sort?.columnId === column.id ? sort.direction === 'asc' ? 'ascending' : 'descending' : undefined}
                  className={column.hideOnMobile ? 'rsp-hide-phone' : undefined}
                  style={{ width: column.width, textAlign: column.align ?? 'left' }}
                >
                  {column.sortable && onSortChange ? <button type="button" className="data-table__sort" onClick={() => onSortChange({ columnId: column.id, direction: sort?.columnId === column.id && sort.direction === 'asc' ? 'desc' : 'asc' })}>{column.header}<span aria-hidden="true">{sort?.columnId === column.id ? sort.direction === 'asc' ? '↑' : '↓' : '↕'}</span></button> : <span>{column.header}</span>}
                </th>
              ))}
              {rowActions && <th scope="col" aria-label="Actions" style={{ width: 52 }} />}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }, (_, index) => (
                  <tr className="data-table__row" key={`loading-${index}`} aria-hidden="true">
                    {Array.from({ length: visibleColumns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0) }, (_, cell) => (
                      <td className="data-table__skeleton" key={cell}>&nbsp;</td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => {
                  const id = getRowId(row)
                  const interactive = Boolean(onRowOpen)
                  return (
                    <tr
                      key={id}
                      className={`data-table__row${interactive ? ' data-table__row--interactive' : ''}`}
                      aria-selected={selectable ? selectedIds.has(id) : undefined}
                      tabIndex={interactive ? 0 : undefined}
                      onClick={onRowOpen ? (event) => { if (!(event.target as HTMLElement).closest('button,input,a,select,textarea,label')) onRowOpen(row) } : undefined}
                      onKeyDown={(event) => openFromKeyboard(event, row)}
                    >
                      {selectable && (
                        <td onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select row ${id}`}
                            checked={selectedIds.has(id)}
                            onChange={(event) => setRowSelected(id, event.currentTarget.checked)}
                          />
                        </td>
                      )}
                      {visibleColumns.map((column) => (
                        <td
                          key={column.id}
                          className={column.hideOnMobile ? 'rsp-hide-phone' : undefined}
                          style={{ textAlign: column.align ?? 'left' }}
                        >
                          {column.cell(row)}
                        </td>
                      ))}
                      {rowActions && <td onClick={(event) => event.stopPropagation()}>{rowActions(row)}</td>}
                    </tr>
                  )
                })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && (
          <div className="data-table__empty" role="status">{emptyState ?? 'No records found.'}</div>
        )}
      </DataTableShell>
    </>
  )
}
