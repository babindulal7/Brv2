import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import Icon from '../../components/ui/Icon'
import { PageHeader } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useDomainEvent } from '../../events/useDomainEvent'
import { EVENT_TYPES } from '../../events/eventBus'
import { businessDayAd, businessNowAd, overDays, pickupsQuery, toMovementRow, type MovementRow } from '../../lib/queries/today'
import { listBookings, operationQueue, todaysOutgoing } from '../../lib/queries/bookings'
import type { ListFilters } from '../../lib/queries/listQuery'
import { useList, type ListQueryResult, type ListResult } from '../../lib/queries/useList'
import { useViewport } from '../../lib/device'
import DashboardMovementPanel from './DashboardMovementPanel'
import './dashboard.css'

type QuickPeriod = 'Today' | 'Tomorrow' | 'Next 7 Days'
type DateFilter = { kind: 'quick'; period: QuickPeriod } | { kind: 'custom'; from: string; to: string }

const QUICK_PERIODS: readonly QuickPeriod[] = ['Today', 'Tomorrow', 'Next 7 Days']
const STORAGE_PICKUPS = 'dashboard.pickupDateFilter'
const STORAGE_RETURNS = 'dashboard.returnDateFilter'

function shiftDay(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function readStoredFilter(key: string): DateFilter {
  if (typeof window === 'undefined') return { kind: 'quick', period: 'Today' }
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(key) ?? 'null') as DateFilter | null
    if (parsed?.kind === 'quick' && QUICK_PERIODS.includes(parsed.period)) return parsed
    if (parsed?.kind === 'custom' && isCalendarDay(parsed.from) && isCalendarDay(parsed.to) && parsed.from <= parsed.to) return parsed
  } catch {
    // A stale browser value should never prevent the movement board from opening.
  }
  return { kind: 'quick', period: 'Today' }
}

function isCalendarDay(day: unknown): day is string {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const date = new Date(`${day}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day
}

function useStoredFilter(key: string): [DateFilter, (filter: DateFilter) => void] {
  const [filter, setFilter] = useState<DateFilter>(() => readStoredFilter(key))
  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(filter))
    } catch {
      // Persistence is optional in privacy-restricted browser sessions.
    }
  }, [filter, key])
  return [filter, setFilter]
}

function rangeFor(filter: DateFilter, today: string): { from: string; to: string } {
  if (filter.kind === 'custom') return { from: filter.from, to: filter.to }
  if (filter.period === 'Tomorrow') {
    const tomorrow = shiftDay(today, 1)
    return { from: tomorrow, to: tomorrow }
  }
  if (filter.period === 'Next 7 Days') return { from: today, to: shiftDay(today, 6) }
  return { from: today, to: today }
}

function pickupFilter(filter: DateFilter, today: string) {
  if (filter.kind === 'quick') return pickupsQuery(filter.period, [], today)
  return { filters: overDays(todaysOutgoing, { from: filter.from, to: filter.to }, today), impossible: false }
}

function returnFilter(filter: DateFilter, today: string): ListFilters {
  const range = rangeFor(filter, today)
  // Today intentionally has no lower bound so unresolved overdue returns remain visible.
  return operationQueue('return', filter.kind === 'quick' && filter.period === 'Today' ? undefined : range.from, range.to)
}

function compactDate(day: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00.000Z`))
}

function filterLabel(filter: DateFilter): string {
  if (filter.kind === 'quick') return filter.period
  if (filter.from === filter.to) return compactDate(filter.from)
  const from = new Date(`${filter.from}T00:00:00.000Z`)
  const to = new Date(`${filter.to}T00:00:00.000Z`)
  if (from.getUTCFullYear() === to.getUTCFullYear() && from.getUTCMonth() === to.getUTCMonth()) {
    const month = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(to)
    return `${from.getUTCDate()}–${to.getUTCDate()} ${month}`
  }
  return `${compactDate(filter.from)} – ${compactDate(filter.to)}`
}

function calendarDays(month: Date): Array<string | null> {
  const year = month.getUTCFullYear()
  const monthIndex = month.getUTCMonth()
  const result: Array<string | null> = Array.from({ length: new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() }, () => null)
  const count = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  for (let day = 1; day <= count; day += 1) result.push(new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10))
  return result
}

function DateFilterControl({ noun, filter, onChange, today }: { noun: 'pickup' | 'return' | 'dispatch'; filter: DateFilter; onChange: (filter: DateFilter) => void; today: string }) {
  const [open, setOpen] = useState(false)
  const [rangeStart, setRangeStart] = useState<string | null>(null)
  const [rangeMode, setRangeMode] = useState(false)
  const initialDay = filter.kind === 'custom' ? filter.from : rangeFor(filter, today).from
  const initialDate = new Date(`${initialDay}T00:00:00.000Z`)
  const [month, setMonth] = useState(() => new Date(Date.UTC(initialDate.getUTCFullYear(), initialDate.getUTCMonth(), 1)))
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const days = useMemo(() => calendarDays(month), [month])
  const close = () => {
    setOpen(false)
    setRangeStart(null)
    trigger.current?.focus()
  }

  // Move focus into the dialog when it opens — a keyboard user otherwise stays
  // on the trigger after it closes over.
  useEffect(() => {
    if (open) dialog.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const closeAway = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { setOpen(false); setRangeStart(null) } }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        setRangeStart(null)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeAway)
    document.addEventListener('keydown', closeEscape)
    return () => {
      document.removeEventListener('pointerdown', closeAway)
      document.removeEventListener('keydown', closeEscape)
    }
  }, [open])

  const selectQuick = (period: QuickPeriod) => {
    onChange({ kind: 'quick', period })
    close()
  }

  const selectDay = (day: string) => {
    if (!rangeMode) {
      onChange({ kind: 'custom', from: day, to: day })
      close()
      return
    }
    if (!rangeStart) {
      setRangeStart(day)
      return
    }
    onChange({ kind: 'custom', from: day < rangeStart ? day : rangeStart, to: day < rangeStart ? rangeStart : day })
    close()
  }

  const useSingleDay = () => {
    if (!rangeStart) return
    onChange({ kind: 'custom', from: rangeStart, to: rangeStart })
    close()
  }

  const onDayKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, day: string) => {
    const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -7 : event.key === 'ArrowDown' ? 7 : 0
    if (!delta) return
    event.preventDefault()
    const target = shiftDay(day, delta)
    const targetDate = new Date(`${target}T00:00:00.000Z`)
    if (targetDate.getUTCMonth() !== month.getUTCMonth() || targetDate.getUTCFullYear() !== month.getUTCFullYear()) {
      setMonth(new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), 1)))
      window.setTimeout(() => root.current?.querySelector<HTMLButtonElement>(`[data-calendar-day="${target}"]`)?.focus(), 0)
    } else {
      root.current?.querySelector<HTMLButtonElement>(`[data-calendar-day="${target}"]`)?.focus()
    }
  }

  const currentFrom = filter.kind === 'custom' ? filter.from : null
  const currentTo = filter.kind === 'custom' ? filter.to : null
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(month)

  const triggerLabel = noun === 'dispatch' ? 'Sync dispatch day' : `Choose ${noun} date filter`
  const dialogLabel = noun === 'dispatch' ? 'Dispatch date filter' : `${noun} date filter`

  return (
    <div className="dashboard-date-filter" ref={root} onBlur={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) {
        setOpen(false)
        setRangeStart(null)
      }
    }}>
      <button ref={trigger} type="button" className="dashboard-date-filter__button" aria-label={triggerLabel} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${noun}-date-dialog` : undefined} onClick={() => {
        setRangeStart(null)
        if (!open) setMonth(new Date(Date.UTC(initialDate.getUTCFullYear(), initialDate.getUTCMonth(), 1)))
        setOpen((value) => !value)
      }}>
        <span className="dashboard-date-filter__calendar" aria-hidden="true"><Icon name="calendar" size={18} /></span>
        <span className="dashboard-date-filter__label">{filterLabel(filter)}</span>
        <Icon name="chevron_down" size={15} />
      </button>

      {open && (
        <div id={`${noun}-date-dialog`} className="dashboard-calendar" role="dialog" aria-label={dialogLabel} tabIndex={-1} ref={dialog}>
          <div className="dashboard-calendar__quick" role="group" aria-label="Quick date filters">
            {QUICK_PERIODS.map((period) => (
              <button key={period} type="button" aria-pressed={filter.kind === 'quick' && filter.period === period} onClick={() => selectQuick(period)}>{period}</button>
            ))}
          </div>
          <div className="dashboard-calendar__month-row">
            <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))}><Icon name="chevron_left" size={17} /></button>
            <strong>{monthName}</strong>
            <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))}><Icon name="chevron_right" size={17} /></button>
          </div>
          <div className="dashboard-calendar__weekdays" aria-hidden="true">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="dashboard-calendar__days">
            {days.map((day, index) => {
              if (!day) return <span key={`blank-${index}`} />
              const selected = day === rangeStart || day === currentFrom || day === currentTo
              const inRange = !!currentFrom && !!currentTo && day > currentFrom && day < currentTo
              return (
                <button key={day} type="button" data-calendar-day={day} className={selected ? 'is-selected' : inRange ? 'is-in-range' : undefined} aria-label={compactDate(day)} aria-pressed={selected || inRange} onClick={() => selectDay(day)} onKeyDown={(event) => onDayKeyDown(event, day)}>
                  {Number(day.slice(-2))}
                </button>
              )
            })}
          </div>
          <div className="dashboard-calendar__footer">
            <button type="button" aria-pressed={rangeMode} onClick={() => { setRangeMode(!rangeMode); setRangeStart(null) }}>{rangeMode ? 'Date range' : 'Single date'}</button>
            <span aria-live="polite">{rangeStart ? 'Choose an end date.' : rangeMode ? 'Select start and end dates' : 'Select a date'}</span>
            {rangeStart && <button type="button" onClick={useSingleDay}>Use {compactDate(rangeStart)}</button>}
            <button type="button" className="dashboard-calendar__close" onClick={close}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Today() {
  const viewport = useViewport()
  const isPhone = viewport === 'phone'
  const [mobileTab, setMobileTab] = useState<'pickups' | 'returns'>('pickups')

  const [pickupDateFilter, setPickupDateFilter] = useStoredFilter(STORAGE_PICKUPS)
  const [returnDateFilter, setReturnDateFilter] = useStoredFilter(STORAGE_RETURNS)
  const [pickupPage, setPickupPage] = useState(0)
  const [returnPage, setReturnPage] = useState(0)
  const dayAd = businessDayAd()
  const pickupSet = pickupFilter(pickupDateFilter, dayAd)
  const returnSet = returnFilter(returnDateFilter, dayAd)

  const fetchPickups = useCallback(async (filters: ListFilters): Promise<ListQueryResult<MovementRow>> => {
    if (pickupSet.impossible) return { rows: [], total: 0 }
    const result = await listBookings(filters)
    const now = businessNowAd()
    return { rows: result.rows.map((row) => toMovementRow(row, 'outgoing', now)), total: result.total ?? null }
  }, [pickupSet.impossible])
  const fetchReturns = useCallback(async (filters: ListFilters): Promise<ListQueryResult<MovementRow>> => {
    const result = await listBookings(filters)
    const now = businessNowAd()
    return { rows: result.rows.map((row) => toMovementRow(row, 'incoming', now)), total: result.total ?? null }
  }, [])

  const pickupFilters = { ...pickupSet.filters, page: { index: 0, size: (pickupPage + 1) * 50 } }
  const returnFilters = { ...returnSet, page: { index: 0, size: (returnPage + 1) * 50 } }
  const pickups: ListResult<MovementRow> = useList(fetchPickups, pickupFilters, { isFilteredOverride: pickupDateFilter.kind !== 'quick' || pickupDateFilter.period !== 'Today' })
  const returns: ListResult<MovementRow> = useList(fetchReturns, returnFilters, { isFilteredOverride: returnDateFilter.kind !== 'quick' || returnDateFilter.period !== 'Today' })
  const { refetch: refetchPickups } = pickups
  const { refetch: refetchReturns } = returns
  const refetchMovement = useCallback(() => { refetchPickups(); refetchReturns() }, [refetchPickups, refetchReturns])

  useDomainEvent(EVENT_TYPES.RENTAL_PACKED, refetchMovement)
  useDomainEvent(EVENT_TYPES.RENTAL_PICKED_UP, refetchMovement)
  useDomainEvent(EVENT_TYPES.RENTAL_HANDED_OVER, refetchMovement)
  useDomainEvent(EVENT_TYPES.RENTAL_RETURN_STARTED, refetchMovement)
  useDomainEvent(EVENT_TYPES.RENTAL_RETURNED, refetchMovement)
  useDomainEvent(EVENT_TYPES.RENTAL_RESET_COMPLETED, refetchMovement)
  useDomainEvent(EVENT_TYPES.RENTAL_CLOSED, refetchMovement)
  useDomainEvent(EVENT_TYPES.RENTAL_CONFIRMED, refetchMovement)
  useDomainEvent(EVENT_TYPES.RENTAL_CANCELLED, refetchMovement)

  const isReturnToday = returnDateFilter.kind === 'quick' && returnDateFilter.period === 'Today'
  const pickupCount = pickups.loading || pickups.error ? undefined : pickups.total ?? pickups.rows.length
  const returnCount = returns.loading || returns.error ? undefined : returns.total ?? returns.rows.length

  const readyForHandoverCount = useMemo(
    () => pickups.rows.filter((r) => r.status === 'Packed' || r.status?.toLowerCase().includes('packed')).length,
    [pickups.rows]
  )
  const overdueCount = useMemo(
    () => returns.rows.filter((r) => r.flags.includes('Overdue') || (r.statusNote && r.statusNote.includes('late'))).length,
    [returns.rows]
  )

  const [kpiFilter, setKpiFilter] = useState<'all' | 'ready' | 'overdue'>('all')

  const isDispatchToday = pickupDateFilter.kind === 'quick' && pickupDateFilter.period === 'Today'

  const goToToday = () => {
    syncBothPanels({ kind: 'quick', period: 'Today' })
  }

  const stepDay = (delta: number) => {
    let currentDay = dayAd
    if (pickupDateFilter.kind === 'custom') {
      currentDay = pickupDateFilter.from
    } else if (pickupDateFilter.kind === 'quick') {
      if (pickupDateFilter.period === 'Tomorrow') {
        currentDay = shiftDay(dayAd, 1)
      } else if (pickupDateFilter.period === 'Next 7 Days') {
        currentDay = dayAd
      }
    }
    const nextDay = shiftDay(currentDay, delta)
    if (nextDay === dayAd) {
      syncBothPanels({ kind: 'quick', period: 'Today' })
    } else {
      syncBothPanels({ kind: 'custom', from: nextDay, to: nextDay })
    }
  }

  const syncBothPanels = (nextFilter: DateFilter) => {
    setPickupPage(0)
    setReturnPage(0)
    setPickupDateFilter(nextFilter)
    setReturnDateFilter(nextFilter)
  }

  return (
    <PageShell
      className="rental-dashboard"
      header={
        <PageHeader
          title="Dashboard"
          description="Prepare pickups, receive returns, and keep equipment moving."
          actions={
            <div className="dashboard-header-controls">
              <span className="dashboard-header-controls__label">Sync dispatch day:</span>
              <div className="dashboard-day-pager" role="group" aria-label="Quick day navigation">
                <button
                  type="button"
                  className="dashboard-day-pager__btn"
                  aria-label="Previous day"
                  onClick={() => stepDay(-1)}
                >
                  <Icon name="chevron_left" size={16} />
                </button>
                <button
                  type="button"
                  className={`dashboard-day-pager__btn dashboard-day-pager__btn--today ${isDispatchToday ? 'is-current' : ''}`}
                  aria-label="Today"
                  onClick={goToToday}
                >
                  Today
                </button>
                <button
                  type="button"
                  className="dashboard-day-pager__btn"
                  aria-label="Next day"
                  onClick={() => stepDay(1)}
                >
                  <Icon name="chevron_right" size={16} />
                </button>
              </div>
              <DateFilterControl
                noun="dispatch"
                filter={pickupDateFilter}
                onChange={syncBothPanels}
                today={dayAd}
              />
            </div>
          }
        />
      }
    >
      {/* Critical Overdue Warning Alert */}
      {overdueCount > 0 && (
        <div
          role="alert"
          style={{
            marginBottom: 'var(--sp-md)',
            padding: '12px 16px',
            background: 'var(--st-danger-bg)',
            border: '1px solid var(--st-danger-fg)',
            borderRadius: 'var(--r-card)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-sm)',
            color: 'var(--st-danger-fg)',
          }}
        >
          <Icon name="alert_circle" size={18} />
          <span style={{ fontWeight: 700 }}>Action Required:</span>
          <span>
            {overdueCount} rental return{overdueCount > 1 ? 's are' : ' is'} overdue. Follow up with client or initiate return check-in.
          </span>
        </div>
      )}

      {/* Operational KPI Metric Strip */}
      <div
        className="dashboard-kpi-strip"
        role="region"
        aria-label="Movement KPI summary"
      >
        <button
          type="button"
          className={`dashboard-kpi-card ${kpiFilter === 'all' ? 'is-active' : ''}`}
          onClick={() => setKpiFilter('all')}
          aria-pressed={kpiFilter === 'all'}
          aria-label={`Scheduled Pickups: ${pickupCount ?? 'none'}. Click to view all.`}
        >
          <span className="dashboard-kpi-card__label">Scheduled Pickups</span>
          <span className="dashboard-kpi-card__val figure">{pickupCount ?? '—'}</span>
        </button>
        <button
          type="button"
          className={`dashboard-kpi-card ${kpiFilter === 'ready' ? 'is-active' : ''}`}
          onClick={() => setKpiFilter((prev) => (prev === 'ready' ? 'all' : 'ready'))}
          aria-pressed={kpiFilter === 'ready'}
          aria-label={`Ready for Handover: ${readyForHandoverCount}. Click to filter ready pickups.`}
        >
          <span className="dashboard-kpi-card__label">Ready for Handover</span>
          <span className="dashboard-kpi-card__val dashboard-kpi-card__val--success figure">{readyForHandoverCount}</span>
        </button>
        <button
          type="button"
          className={`dashboard-kpi-card ${kpiFilter === 'all' ? 'is-active' : ''}`}
          onClick={() => setKpiFilter('all')}
          aria-pressed={kpiFilter === 'all'}
          aria-label={`Expected Returns: ${returnCount ?? 'none'}. Click to view all.`}
        >
          <span className="dashboard-kpi-card__label">Expected Returns</span>
          <span className="dashboard-kpi-card__val figure">{returnCount ?? '—'}</span>
        </button>
        <button
          type="button"
          className={`dashboard-kpi-card ${overdueCount > 0 ? 'dashboard-kpi-card--danger' : ''} ${kpiFilter === 'overdue' ? 'is-active' : ''}`}
          onClick={() => setKpiFilter((prev) => (prev === 'overdue' ? 'all' : 'overdue'))}
          aria-pressed={kpiFilter === 'overdue'}
          aria-label={`Overdue Returns: ${overdueCount}. Click to filter overdue returns.`}
        >
          <span className="dashboard-kpi-card__label">Overdue Returns</span>
          <span className="dashboard-kpi-card__val dashboard-kpi-card__val--danger figure">{overdueCount}</span>
        </button>
      </div>

      {/* Spec §31: Mobile Segmented Control */}
      {isPhone && (
        <div style={{ marginBottom: 'var(--sp-md)' }}>
          <SegmentedControl
            fullWidth
            ariaLabel="Dashboard Movements"
            options={[
              { id: 'pickups', label: 'Pickups', badge: pickupCount },
              { id: 'returns', label: 'Returns', badge: returnCount },
            ]}
            value={mobileTab}
            onChange={setMobileTab}
          />
        </div>
      )}

      {/* Main 2-Column Movement Panels */}
      <div className="rental-dashboard__panels">
        {(!isPhone || mobileTab === 'pickups') && (
          <DashboardMovementPanel
            side="outgoing"
            title="Pickups"
            subtitle="Rentals scheduled for pickup"
            icon="truck"
            list={pickups}
            periodLabel={filterLabel(pickupDateFilter).toLowerCase()}
            kpiFilter={kpiFilter}
            onClearFilters={() => { setPickupPage(0); setPickupDateFilter({ kind: 'quick', period: 'Today' }) }}
            onLoadMore={() => setPickupPage((page) => page + 1)}
            hasMore={pickups.total !== null && pickups.rows.length < pickups.total}
            filterControl={
              <DateFilterControl
                noun="pickup"
                filter={pickupDateFilter}
                onChange={(next) => { setPickupPage(0); setPickupDateFilter(next) }}
                today={dayAd}
              />
            }
          />
        )}

        {(!isPhone || mobileTab === 'returns') && (
          <DashboardMovementPanel
            side="incoming"
            title="Returns"
            subtitle={isReturnToday ? 'Today · Overdue included' : 'Rentals expected to be returned'}
            icon="return_arrow"
            list={returns}
            periodLabel={filterLabel(returnDateFilter).toLowerCase()}
            isToday={isReturnToday}
            kpiFilter={kpiFilter}
            onClearFilters={() => { setReturnPage(0); setReturnDateFilter({ kind: 'quick', period: 'Today' }) }}
            onLoadMore={() => setReturnPage((page) => page + 1)}
            hasMore={returns.total !== null && returns.rows.length < returns.total}
            filterControl={
              <DateFilterControl
                noun="return"
                filter={returnDateFilter}
                onChange={(next) => { setReturnPage(0); setReturnDateFilter(next) }}
                today={dayAd}
              />
            }
          />
        )}
      </div>
    </PageShell>
  )
}
