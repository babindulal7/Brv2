import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon, { type IconName } from '../../components/ui/Icon'
import { PageBody } from '../../components/ui/PageBody'
import { businessDayAd, has, timeOf, type MovementRow } from '../../lib/queries/today'
import type { ListResult } from '../../lib/queries/useList'
import { useOperationsWorkspace } from '../operations/OperationsWorkspaceContext'
import type { BookingStatus, JobName } from '../../lib/workflow'

interface DashboardMovementPanelProps {
  side: 'outgoing' | 'incoming'
  title: string
  subtitle?: string | undefined
  icon: IconName
  list: ListResult<MovementRow>
  periodLabel: string
  onClearFilters: () => void
  filterControl?: ReactNode
  isToday?: boolean
  onLoadMore?: () => void
  hasMore?: boolean
  globalQuery?: string
  compactEmpty?: boolean
}

export function dashboardAction(row: MovementRow, side: 'outgoing' | 'incoming'): {
  label: string
  job: JobName
} {
  if (side === 'incoming') {
    const stage = (row.status ?? '').toLowerCase()
    const note = (row.statusNote ?? '').toLowerCase()
    if (stage.includes('return') || stage.includes('reset') || note.includes('reset') || note.includes('clean')) {
      return { label: 'Cleaning & Reset', job: 'Reset' }
    }
    return { label: 'Return & Inspect', job: 'Return' }
  }

  // Outgoing
  if (row.status === 'Packed') {
    return { label: 'Handover', job: 'Handover' }
  }
  return { label: 'Start Packing', job: 'Pack' }
}

export default function DashboardMovementPanel({
  side,
  title,
  subtitle,
  icon,
  list,
  periodLabel,
  onClearFilters,
  filterControl,
  onLoadMore,
  hasMore = false,
  globalQuery = '',
  compactEmpty = false,
}: DashboardMovementPanelProps) {
  const { openOperations } = useOperationsWorkspace()
  const count = list.loading || list.error ? '—' : String(list.total ?? list.rows.length)
  const noun = side === 'outgoing' ? 'pickups' : 'returns'
  const panelSubtitle = compactEmpty ? `No ${noun} ${periodLabel}.` : subtitle
  const today = businessDayAd()
  // Visually place overdue returns before normal returns and apply instant search
  const rows = useMemo(() => {
    let baseRows = list.rows
    if (side === 'incoming') {
      const overdue: MovementRow[] = []
      const normal: MovementRow[] = []
      for (const r of list.rows) {
        if (has(r, 'Overdue')) overdue.push(r)
        else normal.push(r)
      }
      baseRows = [...overdue, ...normal]
    }

    const q = (globalQuery || '').trim().toLowerCase()
    if (!q) return baseRows

    return baseRows.filter((r) => {
      const clientMatch = (r.client ?? '').toLowerCase().includes(q)
      const bookingMatch = (r.bookingNo ?? '').toLowerCase().includes(q)
      const projectMatch = (r.project ?? '').toLowerCase().includes(q)
      const deliveryMatch = (r.deliveryType ?? '').toLowerCase().includes(q)
      return clientMatch || bookingMatch || projectMatch || deliveryMatch
    })
  }, [list.rows, side, globalQuery])

  return (
    <section className={`movement-panel movement-panel--${side}${compactEmpty ? ' movement-panel--compact' : ''}`} aria-labelledby={`${side}-panel-title`}>
      <header className="movement-panel__header">
        <span className={`movement-panel__icon movement-panel__icon--${side}`} aria-hidden="true">
          <Icon name={icon} size={24} />
        </span>
        <div className="movement-panel__heading">
          <h2 id={`${side}-panel-title`}>
            {title} <span aria-hidden="true">·</span> <span className="figure">{count}</span>
          </h2>
          {panelSubtitle && <p title={panelSubtitle}>{panelSubtitle}</p>}
        </div>
        {filterControl && <div className="movement-panel__filter">{filterControl}</div>}
      </header>

      {!compactEmpty && <div className={`movement-panel__body movement-panel__body--${side}`}>
        <PageBody
          loading={list.loading}
          error={list.error}
          hasRows={list.rows.length > 0}
          onRetry={list.refetch}
          empty={list.isEmpty}
          emptyIsFiltered={list.isFiltered}
          onClearFilters={onClearFilters}
          noun={noun}
          skeleton="table"
          skeletonRows={3}
          emptyTitle={`No ${noun} ${periodLabel}.`}
          emptyMessage={
            side === 'outgoing'
              ? 'Nothing is scheduled to leave in this period.'
              : 'Nothing is expected back in this period.'
          }
          clearLabel="Back to Today"
        >
          {rows.length === 0 ? (
            <div className="movement-panel__empty-search" role="status">
              <span className="movement-panel__empty-icon" aria-hidden="true">
                <Icon name="search" size={24} />
              </span>
              <p className="movement-panel__empty-title">
                No {noun} match {globalQuery ? `"${globalQuery}"` : 'the active filter'}.
              </p>
              <p className="movement-panel__empty-desc">
                {globalQuery
                  ? 'Check for typos or try clearing the search input.'
                  : 'Try selecting a different date range or clearing filters.'}
              </p>
              <button
                type="button"
                className="movement-panel__search-reset-btn"
                onClick={() => {
                  onClearFilters()
                }}
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="movement-cards-list">
              <div className="movement-cards-list__head" aria-hidden="true">
                <span>Client / project</span>
                <span>Booking</span>
                <span>Pickup</span>
                <span>Return</span>
                <span>Status / next step</span>
              </div>
              {rows.map((row) => {
                const action = dashboardAction(row, side)
                const isOverdue = has(row, 'Overdue')
                const isReady = row.status === 'Packed'
                const actionLabel = action.label
                const isPartial =
                  (row.status ?? '').toLowerCase().includes('partial') ||
                  (row.statusNote ?? '').toLowerCase().includes('partial') ||
                  (row.statusNote ?? '').toLowerCase().includes('still with client')

                const displayTime = side === 'outgoing'
                  ? `${row.atDayAd !== today ? `${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${row.atDayAd}T00:00:00Z`))} · ` : ''}${timeOf(row)}`
                  : row.due.replace(/^Due\s+/i, '')
                const pickupMoment = side === 'outgoing'
                  ? displayTime
                  : (row.duration.split(' → ')[0] ?? '—')
                const returnMoment = side === 'incoming'
                  ? displayTime
                  : row.due.replace(/^Due\s+/i, '')

                return (
                  <article
                    key={row.id}
                    className={`movement-card movement-card--${side} ${
                      isOverdue ? 'movement-card--overdue' : ''
                    }`}
                    aria-label={`${row.bookingNo}, ${row.client}, ${displayTime}`}
                  >
                    <Link className="movement-card__client-link" to={`/rentals/${row.bookingNo}`}>
                      <span className="movement-card__avatar" aria-hidden="true">
                        {row.monogram || (row.client ? row.client.slice(0, 2).toUpperCase() : 'BK')}
                      </span>
                      <span className="movement-card__client-copy">
                        <strong className="movement-card__client">{row.client}</strong>
                        <span className="movement-card__project" title={row.project || 'No project specified'}>{row.project || 'No project specified'}</span>
                        <span className="movement-card__items-count">
                          {row.itemCount} {row.itemCount === 1 ? 'item' : 'items'}{side === 'incoming' ? ' booked' : ''}
                        </span>
                      </span>
                    </Link>

                    <Link className="movement-card__booking-link" to={`/rentals/${row.bookingNo}`}>
                      <span className="movement-card__record-label">Booking</span>
                      <strong className="movement-card__number identifier">{row.bookingNo}</strong>
                    </Link>

                    <div className="movement-card__schedule movement-card__schedule--pickup">
                      <span>Pickup</span>
                      <strong className="movement-card__time figure">{pickupMoment}</strong>
                    </div>
                    <div className="movement-card__schedule movement-card__schedule--return">
                      <span>Return</span>
                      <strong className="figure">{returnMoment}</strong>
                    </div>

                    <div className="movement-card__status-action">
                      {side === 'incoming' && (isOverdue || isPartial) && (
                        <div className="movement-card__badge-wrap">
                          {isOverdue ? (
                            <span className="movement-card__status movement-card__status--overdue">
                              <Icon name="alert_triangle" size={14} />
                              {row.statusNote ? `Overdue · ${row.statusNote}` : 'Overdue'}
                            </span>
                          ) : (
                            <span className="movement-card__status movement-card__status--partial">
                              <Icon name="alert_triangle" size={14} />
                              Partial return
                            </span>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        className={`movement-card__cta-btn ${(side === 'incoming' || isReady) ? 'is-dominant' : 'is-prep'}`}
                        onClick={() => {
                          const bookingStatus: BookingStatus = (row.status as BookingStatus) || (side === 'incoming' ? 'On Rent' : 'Booked')
                          openOperations(row.bookingNo, bookingStatus, action.job)
                        }}
                        aria-label={`${actionLabel} for ${row.client}, booking ${row.bookingNo}`}
                      >
                        <span>{actionLabel}</span><Icon name="arrow_right" size={15} />
                      </button>
                    </div>

                </article>
              )
            })}
          </div>
          )}
          {hasMore && onLoadMore && (
            <div className="movement-panel__load-more">
              <button type="button" className="press" onClick={onLoadMore} aria-label={`Load more ${noun}`}>
                Load more {noun}
              </button>
              <span aria-live="polite">Showing {list.rows.length} of {list.total}</span>
            </div>
          )}
        </PageBody>
      </div>}
    </section>
  )
}
