import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon, { type IconName } from '../../components/ui/Icon'
import { PageBody } from '../../components/ui/PageBody'
import { STATUS } from '../../lib/status'
import { has, statusKeyOf, timeOf, type MovementRow } from '../../lib/queries/today'
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

function movementStatus(row: MovementRow) {
  const isOverdue = has(row, 'Overdue')
  const tone = STATUS[isOverdue ? 'danger' : statusKeyOf(row)]
  return { label: isOverdue ? 'Overdue' : row.status, background: tone.bg, color: tone.fg }
}

export function dashboardAction(row: MovementRow, side: 'outgoing' | 'incoming'): { label: string; job: JobName } {
  if (side === 'incoming') {
    const stage = (row.status ?? '').toLowerCase()
    const note = (row.statusNote ?? '').toLowerCase()
    if (stage.includes('return') || stage.includes('reset') || note.includes('reset') || note.includes('clean')) {
      return { label: 'Cleaning & Reset', job: 'Reset' }
    }
    return { label: 'Return & Inspect', job: 'Return' }
  }
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
        <span className="movement-panel__icon" aria-hidden="true"><Icon name={icon} size={25} /></span>
        <div className="movement-panel__heading">
          <h2 id={`${side}-panel-title`}>{title} <span aria-hidden="true">·</span> <span className="figure">{count}</span></h2>
          <p>{subtitle}</p>
        </div>
        <div className="movement-panel__filter">{filterControl}</div>
      </header>

      <div className={`movement-panel__table movement-panel__table--${side}`}>
        <div className="movement-panel__table-head" aria-hidden="true">
          <span>Rental #</span><span>Client</span><span>{side === 'outgoing' ? 'Pickup time' : 'Expected return'}</span><span>Items</span><span>Status</span><span>Action</span>
        </div>
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
          emptyMessage={side === 'outgoing' ? 'Nothing is scheduled to leave in this period.' : 'Nothing is expected back in this period.'}
          clearLabel="Back to Today"
        >
          <div className="movement-panel__rows">
            {rows.map((row) => {
              const action = dashboardAction(row, side)
              const status = movementStatus(row)
              const isOverdue = has(row, 'Overdue')
              return (
                <article
                  key={row.id}
                  className="movement-panel__row"
                  tabIndex={0}
                  onClick={() => navigate(`/rentals/${row.bookingNo}`)}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault()
                      navigate(`/rentals/${row.bookingNo}`)
                    }
                  }}
                >
                  <Link className="movement-panel__number identifier" to={`/rentals/${row.bookingNo}`} onClick={(event) => event.stopPropagation()}>{row.bookingNo}</Link>
                  <div className="movement-panel__client"><strong>{row.client}</strong>{row.project && <span>{row.project}</span>}</div>
                  <span className="movement-panel__date figure">
                    {side === 'outgoing' ? timeOf(row) : row.due.replace(/^Due\s+/i, '')}
                    {isOverdue ? (
                      <small style={{ color: 'var(--danger-text)', fontWeight: 700 }}>Overdue</small>
                    ) : row.statusNote ? (
                      <small>{row.statusNote}</small>
                    ) : null}
                  </span>
                  <span className="movement-panel__items figure">{row.itemCount} <span>{row.itemCount === 1 ? 'item' : 'items'}</span></span>
                  <span className="movement-panel__status" style={{ background: status.background, color: status.color }}>{status.label}</span>
                  <button
                    type="button"
                    className={`movement-panel__action${side === 'outgoing' && row.status !== 'Packed' ? ' movement-panel__action--secondary' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      const bookingStatus: BookingStatus = (row.status as BookingStatus) || (side === 'incoming' ? 'On Rent' : 'Booked')
                      openOperations(row.bookingNo, bookingStatus, action.job)
                    }}
                    aria-label={`${action.label} for ${row.client}, booking ${row.bookingNo}`}
                  >
                    {action.label}
                  </button>
                </article>
              )
            })}
          </div>
        </PageBody>
      </div>
    </section>
  )
}
