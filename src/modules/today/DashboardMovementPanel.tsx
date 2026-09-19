import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon, { type IconName } from '../../components/ui/Icon'
import { PageBody } from '../../components/ui/PageBody'
import { has, timeOf, type MovementRow } from '../../lib/queries/today'
import type { ListResult } from '../../lib/queries/useList'
import { useOperationsWorkspace } from '../operations/OperationsWorkspaceContext'
import type { BookingStatus, JobName } from '../../lib/workflow'

interface DashboardMovementPanelProps {
  side: 'outgoing' | 'incoming'
  title: string
  subtitle: string
  icon: IconName
  list: ListResult<MovementRow>
  periodLabel: string
  onClearFilters: () => void
  filterControl: ReactNode
  isToday?: boolean
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
}: DashboardMovementPanelProps) {
  const navigate = useNavigate()
  const { openOperations } = useOperationsWorkspace()
  const count = list.loading || list.error ? '—' : String(list.total ?? list.rows.length)
  const noun = side === 'outgoing' ? 'pickups' : 'returns'

  // Visually place overdue returns before normal returns
  const rows = useMemo(() => {
    if (side !== 'incoming') return list.rows
    const overdue: MovementRow[] = []
    const normal: MovementRow[] = []
    for (const r of list.rows) {
      if (has(r, 'Overdue')) overdue.push(r)
      else normal.push(r)
    }
    return [...overdue, ...normal]
  }, [list.rows, side])

  return (
    <section className="movement-panel" aria-labelledby={`${side}-panel-title`}>
      <header className="movement-panel__header">
        <span className="movement-panel__icon" aria-hidden="true">
          <Icon name={icon} size={24} />
        </span>
        <div className="movement-panel__heading">
          <h2 id={`${side}-panel-title`}>
            {title} <span aria-hidden="true">·</span> <span className="figure">{count}</span>
          </h2>
          <p>{subtitle}</p>
        </div>
        <div className="movement-panel__filter">{filterControl}</div>
      </header>

      <div className={`movement-panel__body movement-panel__body--${side}`}>
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
          <div className="movement-cards-list">
            {rows.map((row) => {
              const action = dashboardAction(row, side)
              const isOverdue = has(row, 'Overdue')
              const isReady = row.status === 'Packed'
              const isPartial =
                (row.status ?? '').toLowerCase().includes('partial') ||
                (row.statusNote ?? '').toLowerCase().includes('partial') ||
                (row.statusNote ?? '').toLowerCase().includes('still with client')

              const displayTime =
                side === 'outgoing' ? timeOf(row) : row.due.replace(/^Due\s+/i, '')

              return (
                <article
                  key={row.id}
                  className={`movement-card movement-card--${side} ${
                    isOverdue ? 'movement-card--overdue' : ''
                  }`}
                  tabIndex={0}
                  onClick={() => navigate(`/rentals/${row.bookingNo}`)}
                  onKeyDown={(event) => {
                    if (
                      event.target === event.currentTarget &&
                      (event.key === 'Enter' || event.key === ' ')
                    ) {
                      event.preventDefault()
                      navigate(`/rentals/${row.bookingNo}`)
                    }
                  }}
                  aria-label={`${row.bookingNo}, ${row.client}, ${displayTime}`}
                >
                  <div className="movement-card__top">
                    <span className="movement-card__time figure">{displayTime}</span>
                    <div className="movement-card__badge-wrap">
                      {side === 'outgoing' ? (
                        isReady ? (
                          <span className="status-pill status-pill--success">
                            READY FOR PICKUP
                          </span>
                        ) : (
                          <span className="status-pill status-pill--warning">
                            ⚠ NOT READY
                          </span>
                        )
                      ) : isOverdue ? (
                        <span className="status-pill status-pill--danger">
                          OVERDUE{row.statusNote ? ` · ${row.statusNote}` : ''}
                        </span>
                      ) : isPartial ? (
                        <span className="status-pill status-pill--warning">
                          PARTIAL RETURN
                        </span>
                      ) : (
                        <span className="status-pill status-pill--info">
                          DUE TODAY
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="movement-card__main">
                    <div className="movement-card__title">
                      <Link
                        className="movement-card__number identifier"
                        to={`/rentals/${row.bookingNo}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.bookingNo}
                      </Link>
                      <span className="movement-card__sep">·</span>
                      <strong className="movement-card__client">{row.client}</strong>
                    </div>

                    <div className="movement-card__items-row">
                      <span className="movement-card__items figure">
                        {side === 'outgoing' ? (
                          row.project ? (
                            `${row.project} · ${row.itemCount} ${row.itemCount === 1 ? 'item' : 'items'}`
                          ) : (
                            `${row.itemCount} ${row.itemCount === 1 ? 'item' : 'items'}`
                          )
                        ) : isPartial ? (
                          row.statusNote || `${row.itemCount} items expected`
                        ) : isOverdue ? (
                          `${row.itemCount} items outstanding`
                        ) : (
                          `${row.itemCount} items expected`
                        )}
                      </span>

                      {side === 'outgoing' && !isReady && (
                        <span className="movement-card__subnote">
                          {row.statusNote || `${row.itemCount} items unchecked`}
                        </span>
                      )}
                    </div>

                    {/* Logistics / Delivery pill if applicable */}
                    {row.deliveryType && row.deliveryType !== 'Client Pickup' && (
                      <div className="movement-card__meta-tag">
                        <Icon name="truck" size={12} />
                        <span>{row.deliveryType} · {displayTime}</span>
                      </div>
                    )}
                  </div>

                  <div className="movement-card__footer">
                    <button
                      type="button"
                      className={`movement-card__cta-btn ${
                        (side === 'incoming' || isReady) ? 'is-dominant' : 'is-secondary'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (side === 'outgoing' && !isReady) {
                          navigate(`/rentals/${row.bookingNo}`)
                        } else {
                          const bookingStatus: BookingStatus =
                            (row.status as BookingStatus) ||
                            (side === 'incoming' ? 'On Rent' : 'Booked')
                          openOperations(row.bookingNo, bookingStatus, action.job)
                        }
                      }}
                      aria-label={`${action.label} for ${row.client}, booking ${row.bookingNo}`}
                    >
                      <span>{side === 'outgoing' && !isReady ? 'Open Booking →' : `${action.label} →`}</span>
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </PageBody>
      </div>
    </section>
  )
}
