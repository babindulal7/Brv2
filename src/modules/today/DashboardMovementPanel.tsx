import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon, { type IconName } from '../../components/ui/Icon'
import { Badge } from '../../components/ui/Badge'
import { PageBody } from '../../components/ui/PageBody'
import { businessDayAd, has, timeOf, type MovementRow } from '../../lib/queries/today'
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
  onLoadMore?: () => void
  hasMore?: boolean
  globalQuery?: string
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
}: DashboardMovementPanelProps) {
  const { openOperations } = useOperationsWorkspace()
  const count = list.loading || list.error ? '—' : String(list.total ?? list.rows.length)
  const noun = side === 'outgoing' ? 'pickups' : 'returns'
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
    <section className="movement-panel" aria-labelledby={`${side}-panel-title`}>
      <header className="movement-panel__header">
        <span className={`movement-panel__icon movement-panel__icon--${side}`} aria-hidden="true">
          <Icon name={icon} size={24} />
        </span>
        <div className="movement-panel__heading">
          <h2 id={`${side}-panel-title`}>
            {title} <span aria-hidden="true">·</span> <span className="figure">{count}</span>
          </h2>
          <p title={subtitle}>{subtitle}</p>
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

                return (
                  <article
                    key={row.id}
                    className={`movement-card movement-card--${side} ${
                      isOverdue ? 'movement-card--overdue' : ''
                    }`}
                    aria-label={`${row.bookingNo}, ${row.client}, ${displayTime}`}
                  >
                    <div className="movement-card__top">
                      <span className="movement-card__time figure">{displayTime}</span>
                      <div className="movement-card__badge-wrap">
                        {side === 'outgoing' ? (
                          isReady ? (
                            <Badge tone="in" label="Ready for pickup" icon={<Icon name="check" size={14} />} />
                          ) : (
                            <Badge tone="warning" label="Preparation needed" icon={<Icon name="checklist" size={14} />} />
                          )
                        ) : isOverdue ? (
                          <Badge
                            tone="danger"
                            label={row.statusNote ? `Overdue · ${row.statusNote}` : 'Overdue'}
                            icon={<Icon name="alert_triangle" size={14} />}
                          />
                        ) : isPartial ? (
                          <Badge tone="warning" label="Partial return" icon={<Icon name="alert_triangle" size={14} />} />
                        ) : (
                          <Badge tone="primary" label={row.atDayAd === today ? 'Due today' : 'Return scheduled'} icon={<Icon name="timer" size={14} />} />
                        )}
                      </div>
                    </div>

                    <div className="movement-card__main">
                      <div className="movement-card__title">
                        <Link
                          className="movement-card__booking-link"
                          to={`/rentals/${row.bookingNo}`}
                        >
                          <span className="movement-card__avatar" aria-hidden="true">
                            {row.monogram || (row.client ? row.client.slice(0, 2).toUpperCase() : 'BK')}
                          </span>
                          <strong className="movement-card__client">{row.client}</strong>
                          <span className="movement-card__number identifier">#{row.bookingNo}</span>
                        </Link>
                      </div>

                      <div className="movement-card__items-row">
                        {row.project && (
                          <span className="movement-card__project-pill" title={`Project: ${row.project}`}>
                            <Icon name="briefcase" size={12} />
                            <span>{row.project}</span>
                          </span>
                        )}
                        <span className="movement-card__items figure">
                          <Icon name="box" size={12} style={{ marginRight: 3, verticalAlign: -1 }} />
                          {side === 'outgoing' ? (
                            `${row.itemCount} ${row.itemCount === 1 ? 'item' : 'items'}`
                          ) : (
                            `${row.itemCount} ${row.itemCount === 1 ? 'item' : 'items'} booked`
                          )}
                        </span>

                        {side === 'outgoing' && (
                          isReady ? (
                            <span className="movement-card__case-pill is-packed" title="All serialized equipment packed into flight cases">
                              <Icon name="check" size={12} />
                              <span>Cases Packed</span>
                            </span>
                          ) : (
                            <span className="movement-card__case-pill is-prep" title="Prep & packing in progress in gear vault">
                              <Icon name="checklist" size={12} />
                              <span>Prep in Vault</span>
                            </span>
                          )
                        )}

                        <span className="movement-card__deposit-pill" title="Security deposit & KYC verified">
                          <Icon name="card" size={12} />
                          <span>Deposit Clear</span>
                        </span>

                        {side === 'outgoing' && !isReady && row.statusNote && (
                          <span className="movement-card__subnote">
                            {row.statusNote}
                          </span>
                        )}
                      </div>

                      {/* Logistics / Delivery pill if applicable */}
                      {row.deliveryType && row.deliveryType !== 'Client Pickup' && (
                        <div className="movement-card__meta-tag">
                          <Icon name="truck" size={12} />
                          <span>{row.deliveryType}</span>
                        </div>
                      )}
                    </div>

                    <div className="movement-card__footer">
                      {side === 'outgoing' && isReady && (
                        <Link
                          to={`/rentals/${row.bookingNo}`}
                          className="movement-card__manifest-btn"
                          title={`Share Manifest on WhatsApp for #${row.bookingNo}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            minHeight: 44,
                            padding: '0 0.85rem',
                            fontSize: '0.825rem',
                            fontWeight: 500,
                            borderRadius: 'var(--r-btn, 8px)',
                            border: '1px solid var(--w12, var(--border))',
                            color: 'var(--text)',
                            background: 'var(--card2)',
                            textDecoration: 'none',
                          }}
                        >
                          <span style={{ color: '#25D366', display: 'inline-flex', alignItems: 'center' }} aria-hidden="true">
                            <Icon name="phone" size={14} />
                          </span>
                          <span>WhatsApp</span>
                        </Link>
                      )}
                      <Link
                        to={`/rentals/${row.bookingNo}`}
                        className="movement-card__details-btn"
                        title={`Open Flight Cases & Booking Workspace for #${row.bookingNo}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          minHeight: 44,
                          padding: '0 0.85rem',
                          fontSize: '0.825rem',
                          fontWeight: 500,
                          borderRadius: 'var(--r-btn, 8px)',
                          border: '1px solid var(--w12, var(--border))',
                          color: 'var(--text2)',
                          background: 'var(--card2)',
                          textDecoration: 'none',
                        }}
                      >
                        <Icon name="package" size={14} style={{ color: 'var(--accent, var(--primary))' }} />
                        <span>Cases & Gear</span>
                      </Link>
                      <button
                        type="button"
                        className={`movement-card__cta-btn ${
                          (side === 'incoming' || isReady) ? 'is-dominant' : 'is-prep'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation()
                          const bookingStatus: BookingStatus =
                            (row.status as BookingStatus) ||
                            (side === 'incoming' ? 'On Rent' : 'Booked')
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
      </div>
    </section>
  )
}
