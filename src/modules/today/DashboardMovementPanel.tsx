import { formatAd } from '../../lib/bs'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon, { type IconName } from '../../components/ui/Icon'
import { PageBody } from '../../components/ui/PageBody'
import { businessDayAd, has, timeOf, type MovementRow } from '../../lib/queries/today'
import type { ListResult } from '../../lib/queries/useList'
import { useOperationsWorkspace } from '../operations/OperationsWorkspaceContext'
import { useAuth } from '../../lib/auth'
import { gateContext } from '../../lib/fieldGating'
import { IntelCard } from '../../components/ui/IntelCard'
import { movementGlance, movementDetail } from '../../data/movementIntel'
import { ClientIntelFromId } from '../../components/intel/ClientIntelFromId'
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

/*
 * Meaningful rows (ruled 8 Oct 2026, RULINGS-2026-10-08.md). Each visual names a
 * fact staff act on, derived only from fields the row already carries:
 *   · the time column is WHEN it moves — or how late it is, for an overdue return;
 *   · the readiness tag reads the stage (Booked = not packed yet, Packed = packed);
 *   · the mode tag reads `delivery_type`.
 * Every tag pairs an icon with words, so none of it is colour alone.
 */
type TagTone = 'todo' | 'ready' | 'due' | 'mode'
interface RowTag { tone: TagTone; icon: IconName; label: string }

const MODE_TAG: Record<string, { icon: IconName; label: string }> = {
  'Babin Delivery': { icon: 'truck', label: 'Delivery' },
  'Client Pickup': { icon: 'user', label: 'Client pickup' },
  Courier: { icon: 'package', label: 'Courier' },
  'Third Party': { icon: 'person', label: 'Third party' },
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** "Tue 22 Sep" for a Kathmandu calendar day `YYYY-MM-DD`. Fixed names: ICU builds disagree on "Sep"/"Sept". */
function shortDay(dayAd: string): string {
  const d = new Date(`${dayAd}T00:00:00Z`)
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

function rowTags(row: MovementRow, side: 'outgoing' | 'incoming', isTodayRow: boolean, isOverdue: boolean, isPartial: boolean): RowTag[] {
  const tags: RowTag[] = []
  if (side === 'outgoing') {
    tags.push(row.status === 'Packed'
      ? { tone: 'ready', icon: 'check', label: 'Packed' }
      : { tone: 'todo', icon: 'package', label: 'Not packed yet' })
    const mode = row.deliveryType ? MODE_TAG[row.deliveryType] : undefined
    if (mode) tags.push({ tone: 'mode', ...mode })
  } else if (!isOverdue && !isPartial) {
    tags.push({ tone: 'due', icon: 'return_arrow', label: isTodayRow ? 'Due back today' : `Due back ${shortDay(row.atDayAd)}` })
  }
  return tags
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
  const { user } = useAuth()
  const intelGate = useMemo(() => gateContext(user?.role ?? 'Client'), [user?.role])
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
            <span>{title}</span>{' '}<span className="figure">{count}</span>
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
          noun={noun}
          skeleton="movement"
          skeletonRows={3}
        >
          {list.isEmpty ? (
            <div className="movement-panel__empty" role="status">
              <span className="movement-panel__empty-mark" aria-hidden="true">
                <Icon name={icon} size={22} />
              </span>
              <div className="movement-panel__empty-copy">
                <p className="movement-panel__empty-title">No {noun} {periodLabel}.</p>
                <p className="movement-panel__empty-desc">
                  {side === 'outgoing'
                    ? 'Nothing is scheduled to leave in this period.'
                    : 'Nothing is expected back in this period.'}
                </p>
                {list.isFiltered && (
                  <button type="button" className="movement-panel__empty-reset" onClick={onClearFilters}>
                    Back to Today <Icon name="arrow_right" size={15} />
                  </button>
                )}
              </div>
            </div>
          ) : rows.length === 0 ? (
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
              {rows.map((row, rowIndex) => {
                const action = dashboardAction(row, side)
                const isOverdue = has(row, 'Overdue')
                const isReady = row.status === 'Packed'
                const actionLabel = action.label
                const isPartial =
                  (row.status ?? '').toLowerCase().includes('partial') ||
                  (row.statusNote ?? '').toLowerCase().includes('partial') ||
                  (row.statusNote ?? '').toLowerCase().includes('still with client')

                const isTodayRow = row.atDayAd === today
                const [clock, meridiem] = timeOf(row).split(' ')
                const lateDays = isOverdue ? (row.statusNote?.match(/\d+/)?.[0] ?? null) : null
                const tags = rowTags(row, side, isTodayRow, isOverdue, isPartial)

                const displayTime = side === 'outgoing'
                  ? `${row.atDayAd !== today ? `${formatAd(new Date(`${row.atDayAd}T00:00:00Z`))} · ` : ''}${timeOf(row)}`
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
                    style={{ '--row-i': Math.min(rowIndex, 12) } as React.CSSProperties}
                  >
                    {/* Visual anchor only — the article's label and the dates below carry the same facts for assistive tech. */}
                    <div className={`movement-card__when${isOverdue ? ' movement-card__when--late' : ''}`} aria-hidden="true">
                      {isOverdue
                        ? <><strong>{lateDays ? `${lateDays}d` : 'Late'}</strong><span>{lateDays ? 'late' : 'overdue'}</span></>
                        : <><strong>{clock}</strong><span>{meridiem}{isTodayRow ? '' : ` · ${shortDay(row.atDayAd)}`}</span></>}
                    </div>
                    <ClientIntelFromId clientId={row.clientId} name={row.client} context="dashboard" gateContext={intelGate} actionContext={user ? { userId: user.id, role: user.role } : null}>
                    <Link className="movement-card__client-link" to={`/clients/${row.clientId}`}>
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
                    </ClientIntelFromId>

                    <div className="movement-card__booking-link">
                      <span className="movement-card__record-label">Booking</span>
                      <IntelCard
                        glance={movementGlance(row, side)}
                        detail={movementDetail(row)}
                        detailTitle={row.bookingNo}
                        detailSubtitle={`${row.client} · ${row.status}`}
                        entityType="rental"
                        entityId={row.id}
                        context="dashboard"
                        gateContext={intelGate}
                        actionContext={user ? { userId: user.id, role: user.role } : null}
                      >
                        <Link to={`/rentals/${row.bookingNo}`}><strong className="movement-card__number identifier">{row.bookingNo}</strong></Link>
                      </IntelCard>
                    </div>

                    <div className="movement-card__schedule movement-card__schedule--pickup">
                      <span>Pickup</span>
                      <strong className="movement-card__time figure" style={{ color: 'var(--booking-date-text)' }}>{pickupMoment}</strong>
                    </div>
                    <div className="movement-card__schedule movement-card__schedule--return">
                      <span>Return</span>
                      <strong className="figure" style={{ color: 'var(--booking-date-text)' }}>{returnMoment}</strong>
                    </div>

                    <div className="movement-card__status-action">
                      <div className="movement-card__badge-wrap">
                        {side === 'incoming' && isOverdue && (
                          <span className="movement-card__status movement-card__status--overdue">
                            <Icon name="alert_triangle" size={14} />
                            {row.statusNote ? `Overdue · ${row.statusNote}` : 'Overdue'}
                          </span>
                        )}
                        {side === 'incoming' && !isOverdue && isPartial && (
                          <span className="movement-card__status movement-card__status--partial">
                            <Icon name="alert_triangle" size={14} />
                            Partial return
                          </span>
                        )}
                        {tags.map((tag) => (
                          <span key={tag.label} className={`movement-card__tag movement-card__tag--${tag.tone}`}>
                            <Icon name={tag.icon} size={14} />
                            {tag.label}
                          </span>
                        ))}
                      </div>
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
