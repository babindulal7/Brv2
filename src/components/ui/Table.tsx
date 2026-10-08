import React from 'react'
import { IconChevronUp, IconChevronDown, IconInbox } from '@tabler/icons-react'

export interface Column<T> {
  key: string
  header: string
  render?: (row: T, index: number) => React.ReactNode
  sortable?: boolean
  align?: 'left' | 'center' | 'right'
  width?: string
}

export interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyField?: keyof T | ((row: T) => string)
  loading?: boolean
  loadingRows?: number
  emptyMessage?: string
  emptyAction?: React.ReactNode
  sortColumn?: string
  sortDirection?: 'asc' | 'desc'
  onSort?: (key: string) => void
  onRowClick?: (row: T) => void
  /** Accessible name for the table when no visible caption is present. */
  ariaLabel?: string
  /** Optional concise name announced when a clickable row receives focus. */
  rowLabel?: (row: T, index: number) => string
  className?: string
}

export function Table<T extends Record<string, unknown>>({
  columns,
  data,
  keyField = 'id',
  loading = false,
  loadingRows = 5,
  emptyMessage = 'No records found',
  emptyAction,
  sortColumn,
  sortDirection,
  onSort,
  onRowClick,
  ariaLabel,
  rowLabel,
  className = '',
}: TableProps<T>) {
  const getRowKey = (row: T, idx: number): string => {
    if (typeof keyField === 'function') return keyField(row)
    if (row[keyField] !== undefined) return String(row[keyField])
    return String(idx)
  }

  const activateRow = (row: T, event: React.SyntheticEvent) => {
    if (!onRowClick) return
    const target = event.target
    if (target instanceof Element) {
      const nestedControl = target.closest('a, button, input, select, textarea, [role="button"], [role="link"]')
      if (nestedControl && nestedControl !== event.currentTarget) return
    }
    onRowClick(row)
  }

  return (
    <div
      className={['data-table-shell', 'rsp-table-scroll', className].filter(Boolean).join(' ')}
      style={{
        width: '100%',
        overflowX: 'auto',
        borderRadius: 'var(--r-card)',
        border: '1px solid var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-card), var(--specular-rim)',
      }}
    >
      <table
        className="data-table operations-table"
        aria-label={ariaLabel}
        style={{ width: '100%', textAlign: 'left', fontSize: 'var(--t-ui)', color: 'var(--text)', borderCollapse: 'collapse' }}
      >
        <thead
          className="data-table__head"
          style={{
            background: 'var(--card2)',
            fontSize: 'var(--t-th)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--muted)',
            borderBottom: '1px solid var(--border)',
            position: 'sticky',
            top: 0,
            zIndex: 10,
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <tr>
            {columns.map((col) => {
              const isSorted = sortColumn === col.key
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={col.sortable ? (isSorted ? (sortDirection === 'desc' ? 'descending' : 'ascending') : 'none') : undefined}
                  style={{
                    width: col.width,
                    padding: '12px 14px',
                    userSelect: 'none',
                    textAlign: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left',
                  }}
                  onClick={() => col.sortable && onSort?.(col.key)}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      className="data-table__sort"
                      aria-label={`Sort by ${col.header}${isSorted ? `, currently ${sortDirection === 'desc' ? 'descending' : 'ascending'}` : ''}`}
                      style={{
                        justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start',
                        width: col.align ? '100%' : 'auto',
                      }}
                    >
                      <span>{col.header}</span>
                      <span style={{ color: isSorted ? 'var(--nav-active-accent)' : 'var(--muted)', display: 'inline-flex' }}>
                        {isSorted ? (
                          sortDirection === 'asc' ? (
                            <IconChevronUp size={14} />
                          ) : (
                            <IconChevronDown size={14} />
                          )
                        ) : (
                          <span style={{ opacity: 0.35, fontSize: 12 }}>↕</span>
                        )}
                      </span>
                    </button>
                  ) : (
                    <span>{col.header}</span>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {loading ? (
            Array.from({ length: loadingRows }).map((_, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                {columns.map((col) => (
                  <td key={col.key} style={{ padding: '12px 14px' }}>
                    <div
                      className="data-table__skeleton"
                      style={{
                        height: 14,
                        background: 'var(--border)',
                        borderRadius: 'var(--r-sm)',
                        width: '75%',
                        opacity: 0.6,
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text2)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <IconInbox size={32} style={{ color: 'var(--muted)' }} />
                  <p style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 500 }}>{emptyMessage}</p>
                  {emptyAction && <div style={{ marginTop: 8 }}>{emptyAction}</div>}
                </div>
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr
                key={getRowKey(row, idx)}
                className={onRowClick ? 'data-table__row data-table__row--interactive' : 'data-table__row'}
                tabIndex={onRowClick ? 0 : undefined}
                aria-label={onRowClick && rowLabel ? rowLabel(row, idx) : undefined}
                onClick={(event) => activateRow(row, event)}
                onKeyDown={(event) => {
                  if (!onRowClick || event.target !== event.currentTarget) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    activateRow(row, event)
                  }
                }}
                style={{
                  borderBottom: idx < data.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: onRowClick ? 'pointer' : 'default',
                  transition: 'background-color var(--dur) var(--ease)',
                }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: '12px 14px',
                      fontSize: 'var(--t-ui)',
                      color: 'var(--text)',
                      textAlign: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left',
                    }}
                  >
                    {col.render ? col.render(row, idx) : ((row[col.key] as React.ReactNode) ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
