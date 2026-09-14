import type { HTMLAttributes, KeyboardEvent, ReactNode } from 'react'

/** Shared scroll and visual contract for established tables that migrate in stages. */
export function DataTableShell({ ariaLabel, children, className, ...props }: HTMLAttributes<HTMLDivElement> & { ariaLabel: string }) {
  return (
    <div className={['data-table-shell', 'rsp-table-scroll', className].filter(Boolean).join(' ')} role="region" aria-label={ariaLabel} {...props}>
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
}: DataTableProps<Row>) {
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

  return (
    <>
      <DataTableShell ariaLabel={ariaLabel}>
        <table className="data-table">
          <thead className="data-table__head">
            <tr>
              {selectable && (
                <th scope="col" style={{ width: 44 }}>
                  <input
                    type="checkbox"
                    aria-label={allSelected ? 'Deselect all rows' : 'Select all rows'}
                    checked={allSelected}
                    onChange={(event) => toggleAll(event.currentTarget.checked)}
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={column.hideOnMobile ? 'rsp-hide-phone' : undefined}
                  style={{ width: column.width, textAlign: column.align ?? 'left' }}
                >
                  <span>{column.header}</span>
                </th>
              ))}
              {rowActions && <th scope="col" aria-label="Actions" style={{ width: 52 }} />}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }, (_, index) => (
                  <tr className="data-table__row" key={`loading-${index}`} aria-hidden="true">
                    {Array.from({ length: columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0) }, (_, cell) => (
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
                      onClick={onRowOpen ? () => onRowOpen(row) : undefined}
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
                      {columns.map((column) => (
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
      {mobileRow && !loading && rows.length > 0 && (
        <div className="data-table__mobile-list" aria-label={`${ariaLabel} mobile list`}>
          {rows.map((row) => <div key={getRowId(row)}>{mobileRow(row)}</div>)}
        </div>
      )}
    </>
  )
}
