import Icon from './Icon'
import './pagination.css'

export interface PaginationProps {
  page: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: readonly number[]
}

/** One pager for full tables and narrow cards, without changing the data source. */
export function Pagination({ page, total, pageSize, onPageChange, onPageSizeChange, pageSizeOptions = [25, 50, 100] }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(Math.max(page, 1), totalPages)
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const end = Math.min(currentPage * pageSize, total)
  const pages: (number | string)[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else if (currentPage <= 4) {
    pages.push(1, 2, 3, 4, 5, '...', totalPages)
  } else if (currentPage >= totalPages - 3) {
    pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
  } else {
    pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages)
  }
  const sizes = [...new Set([...pageSizeOptions, pageSize])].sort((a, b) => a - b)
  if (total <= pageSize && page <= 1) return null

  return (
    <nav className="app-pagination" aria-label="Pagination">
      <div className="app-pagination__layout">
        <span className="app-pagination__range">Showing {start}–{end} of {total}</span>
        <div className="app-pagination__controls">
          <button type="button" className="app-pagination__edge" onClick={() => onPageChange(1)} disabled={currentPage === 1} aria-label="First page">
            <Icon name="chevron_left" size={14} /><Icon name="chevron_left" size={14} />
          </button>
          <button type="button" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} aria-label="Previous page">
            <Icon name="chevron_left" size={14} /><span className="app-pagination__compact">Previous</span>
          </button>
          <span className="app-pagination__compact app-pagination__position">Page {currentPage} of {totalPages}</span>
          <div className="app-pagination__numbers">
            {pages.map((p, i) => typeof p === 'string' ? (
              <span className="app-pagination__ellipsis" key={`dots-${i}`}>…</span>
            ) : (
              <button type="button" key={p} onClick={() => onPageChange(p)} aria-label={`Page ${p}`} aria-current={p === currentPage ? 'page' : undefined}>{p}</button>
            ))}
          </div>
          <button type="button" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Next page">
            <span className="app-pagination__compact">Next</span><Icon name="chevron_right" size={14} />
          </button>
          <button type="button" className="app-pagination__edge" onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages} aria-label="Last page">
            <Icon name="chevron_right" size={14} /><Icon name="chevron_right" size={14} />
          </button>
        </div>
        {onPageSizeChange && (
          <label className="app-pagination__size">
            <span>Rows per page</span>
            <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))} aria-label="Rows per page">
              {sizes.map(size => <option key={size} value={size}>{size} / page</option>)}
            </select>
          </label>
        )}
      </div>
    </nav>
  )
}
