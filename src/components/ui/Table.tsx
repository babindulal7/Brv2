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
  className = '',
}: TableProps<T>) {
  const getRowKey = (row: T, idx: number): string => {
    if (typeof keyField === 'function') return keyField(row)
    if (row[keyField] !== undefined) return String(row[keyField])
    return String(idx)
  }

  return (
    <div className={`w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 ${className}`}>
      <table className="w-full text-left text-sm text-slate-300 border-collapse">
        <thead className="bg-slate-950/80 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800 sticky top-0 z-10 backdrop-blur">
          <tr>
            {columns.map((col) => {
              const isSorted = sortColumn === col.key
              return (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={`px-4 py-3.5 select-none ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  } ${col.sortable ? 'cursor-pointer hover:text-white' : ''}`}
                  onClick={() => col.sortable && onSort && onSort(col.key)}
                >
                  <div
                    className={`inline-flex items-center gap-1 ${
                      col.align === 'right' ? 'justify-end w-full' : col.align === 'center' ? 'justify-center w-full' : ''
                    }`}
                  >
                    <span>{col.header}</span>
                    {col.sortable && (
                      <span className="text-slate-500">
                        {isSorted ? (
                          sortDirection === 'asc' ? (
                            <IconChevronUp className="w-3.5 h-3.5 text-blue-400" />
                          ) : (
                            <IconChevronDown className="w-3.5 h-3.5 text-blue-400" />
                          )
                        ) : (
                          <div className="w-3.5 h-3.5 opacity-30">↕</div>
                        )}
                      </span>
                    )}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-800/60">
          {loading ? (
            Array.from({ length: loadingRows }).map((_, i) => (
              <tr key={i} className="animate-pulse">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3.5">
                    <div className="h-4 bg-slate-800 rounded w-3/4"></div>
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-500">
                <div className="flex flex-col items-center justify-center gap-2">
                  <IconInbox className="w-8 h-8 text-slate-600" />
                  <p className="text-sm font-medium">{emptyMessage}</p>
                  {emptyAction && <div className="mt-2">{emptyAction}</div>}
                </div>
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr
                key={getRowKey(row, idx)}
                onClick={() => onRowClick && onRowClick(row)}
                className={`transition-colors ${
                  onRowClick ? 'cursor-pointer hover:bg-slate-800/60' : 'hover:bg-slate-850/40'
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3.5 text-sm ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                    }`}
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
