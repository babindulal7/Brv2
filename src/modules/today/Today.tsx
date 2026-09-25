import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { PageHeader, PageActions, Button } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useDomainEvent } from '../../events/useDomainEvent'
import { EVENT_TYPES } from '../../events/eventBus'
import { toBs, formatBs } from '../../lib/bs'
import { businessDayAd, businessNowAd, overDays, pickupsQuery, toMovementRow, type MovementRow } from '../../lib/queries/today'
import { listBookings, operationQueue, todaysOutgoing } from '../../lib/queries/bookings'
import type { ListFilters } from '../../lib/queries/listQuery'
import { useList, type ListQueryResult, type ListResult } from '../../lib/queries/useList'
import { useViewport } from '../../lib/device'
import { useOperationsWorkspace } from '../operations/OperationsWorkspaceContext'
import type { BookingStatus } from '../../lib/workflow'
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
  const { openOperations } = useOperationsWorkspace()
  const [globalSearch, setGlobalSearch] = useState('')
  const counterInputRef = useRef<HTMLInputElement>(null)

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

  const overdueCount = useMemo(
    () => returns.rows.filter((r) => r.flags.includes('Overdue') || (r.statusNote && r.statusNote.includes('late'))).length,
    [returns.rows]
  )

  const readyPickupsCount = useMemo(() => pickups.rows.filter((r) => r.status === 'Packed').length, [pickups.rows])
  const prepPickupsCount = useMemo(() => pickups.rows.filter((r) => r.status !== 'Packed').length, [pickups.rows])
  const todayBs = useMemo(() => {
    const d = new Date(dayAd ? `${dayAd}T00:00:00Z` : Date.now())
    return Number.isNaN(d.getTime()) ? null : toBs(d)
  }, [dayAd])

  const isDispatchToday = pickupDateFilter.kind === 'quick' && pickupDateFilter.period === 'Today'

  const syncBothPanels = useCallback((nextFilter: DateFilter) => {
    setPickupPage(0)
    setReturnPage(0)
    setPickupDateFilter(nextFilter)
    setReturnDateFilter(nextFilter)
  }, [setPickupDateFilter, setReturnDateFilter])

  const goToToday = useCallback(() => {
    syncBothPanels({ kind: 'quick', period: 'Today' })
  }, [syncBothPanels])

  const stepDay = useCallback((delta: number) => {
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
  }, [dayAd, pickupDateFilter, syncBothPanels])

  const handleGlobalSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const q = globalSearch.trim().toLowerCase()
      if (!q) return
      // Check if there is an exact booking number match in pickups or returns
      const exactPickup = pickups.rows.find((r) => r.bookingNo.toLowerCase() === q || r.bookingNo.toLowerCase() === `b-${q}`)
      if (exactPickup) {
        const isReady = exactPickup.status === 'Packed'
        openOperations(exactPickup.bookingNo, (exactPickup.status as BookingStatus) || 'Booked', isReady ? 'Handover' : 'Pack')
        return
      }
      const exactReturn = returns.rows.find((r) => r.bookingNo.toLowerCase() === q || r.bookingNo.toLowerCase() === `b-${q}`)
      if (exactReturn) {
        openOperations(exactReturn.bookingNo, (exactReturn.status as BookingStatus) || 'On Rent', 'Return')
        return
      }
    }
  }

  // Rapid keyboard navigation for dispatch operators: [ (prev), ] (next), t (today), / (search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null
      if (
        target &&
        (target.matches('input, textarea, select') ||
          (target as HTMLElement).isContentEditable ||
          target.closest?.('[role="dialog"]'))
      ) {
        return
      }

      if (e.key === '/') {
        e.preventDefault()
        counterInputRef.current?.focus()
      } else if (e.key === '[' || e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        stepDay(-1)
      } else if (e.key === ']' || e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        stepDay(1)
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        goToToday()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToToday, stepDay])

  const dualDateLabel = useMemo(() => {
    try {
      const ad = compactDate(dayAd)
      const bs = toBs(new Date(`${dayAd}T00:00:00.000Z`))
      return bs ? `${ad} (${formatBs(bs, { suffix: true })})` : ad
    } catch {
      return dayAd
    }
  }, [dayAd])

  return (
    <PageShell
      className="rental-dashboard"
      header={
        <PageHeader
          title="Today"
          description={`Prepare pickups, receive returns, and keep equipment moving. · ${dualDateLabel}`}
          actions={
            <PageActions
              extra={
                <div className="dashboard-header-controls">
                  <span className="dashboard-header-controls__label">Sync dispatch day:</span>
                  <div className="dashboard-day-pager" role="group" aria-label="Quick day navigation">
                    <button
                      type="button"
                      className="dashboard-day-pager__btn"
                      aria-label="Previous day"
                      title="Previous day (Shortcut: [ or P)"
                      onClick={() => stepDay(-1)}
                    >
                      <Icon name="chevron_left" size={16} />
                    </button>
                    <button
                      type="button"
                      className={`dashboard-day-pager__btn dashboard-day-pager__btn--today ${isDispatchToday ? 'is-current' : ''}`}
                      aria-label="Today"
                      title="Today (Shortcut: T)"
                      onClick={goToToday}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      className="dashboard-day-pager__btn"
                      aria-label="Next day"
                      title="Next day (Shortcut: ] or N)"
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
              secondary={[
                <Button
                  key="barcode"
                  variant="secondary"
                  icon="barcode"
                  onClick={() => counterInputRef.current?.focus()}
                  title="Quick barcode / serial lookup (/)"
                >
                  Quick Scan
                </Button>,
              ]}
            />
          }
        />
      }
    >
      {/* Bento 2.0 Operational Movement Snapshot */}
      <section className="dashboard-bento-strip" aria-label="Daily Movement Snapshot">
        {/* Tile 1: Dual Calendar & Date Context */}
        <div className="dashboard-bento-tile">
          <div className="dashboard-bento-tile__header">
            <span className="dashboard-bento-tile__label">Operational Day</span>
            <span className="status-live-dot" title="Live movement sync" />
          </div>
          <div className="dashboard-bento-tile__value" style={{ fontSize: '1.25rem' }}>
            {compactDate(dayAd)}
          </div>
          <div className="dashboard-bento-tile__sub">
            {todayBs ? (
              <span className="dashboard-bento-tile__sub-pill" style={{ background: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-text, #d97706)', fontWeight: 700 }}>
                BS {formatBs(todayBs)}
              </span>
            ) : null}
            <span style={{ color: 'var(--text-muted, #71717a)', fontSize: 11 }}>
              {isDispatchToday ? 'Today (Active Shift)' : 'Scheduled Shift'}
            </span>
          </div>
        </div>

        {/* Tile 2: Outgoing Pickups Readiness */}
        <div className="dashboard-bento-tile">
          <div className="dashboard-bento-tile__header">
            <span className="dashboard-bento-tile__label">Pickups Today</span>
            <Icon name="truck" size={15} style={{ color: 'var(--accent, #2563eb)' }} />
          </div>
          <div className="dashboard-bento-tile__value">
            {pickups.loading ? '—' : (pickups.total ?? pickups.rows.length)}
          </div>
          <div className="dashboard-bento-tile__sub">
            <span className="dashboard-bento-tile__sub-pill" style={{ background: 'var(--success-bg, rgba(16, 185, 129, 0.1))', color: 'var(--success-text, #059669)' }}>
              {readyPickupsCount} Ready
            </span>
            <span className="dashboard-bento-tile__sub-pill" style={{ background: 'var(--warning-bg, rgba(245, 158, 11, 0.1))', color: 'var(--warning-text, #d97706)' }}>
              {prepPickupsCount} In Prep
            </span>
          </div>
        </div>

        {/* Tile 3: Inbound Returns & Overdue */}
        <div className="dashboard-bento-tile">
          <div className="dashboard-bento-tile__header">
            <span className="dashboard-bento-tile__label">Returns Due</span>
            <Icon name="return_arrow" size={15} style={{ color: overdueCount > 0 ? 'var(--danger, #dc2626)' : 'var(--text-muted, #71717a)' }} />
          </div>
          <div className="dashboard-bento-tile__value">
            {returns.loading ? '—' : (returns.total ?? returns.rows.length)}
          </div>
          <div className="dashboard-bento-tile__sub">
            {overdueCount > 0 ? (
              <span className="dashboard-bento-tile__sub-pill" style={{ background: 'var(--danger-bg, rgba(239, 68, 68, 0.12))', color: 'var(--danger-text, #dc2626)', fontWeight: 600 }}>
                {overdueCount} Overdue
              </span>
            ) : (
              <span className="dashboard-bento-tile__sub-pill" style={{ background: 'var(--success-bg, rgba(16, 185, 129, 0.1))', color: 'var(--success-text, #059669)' }}>
                All On Track
              </span>
            )}
          </div>
        </div>

        {/* Tile 4: Quick Warehouse Floor Shortcuts */}
        <div className="dashboard-bento-tile">
          <div className="dashboard-bento-tile__header">
            <span className="dashboard-bento-tile__label">Floor Shortcuts</span>
            <Icon name="zap" size={15} style={{ color: 'var(--accent, #2563eb)' }} />
          </div>
          <div className="dashboard-bento-tile__sub" style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link
              to="/rentals/new"
              className="btn btn--sm btn--primary"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none', minHeight: 38, fontSize: 13, fontWeight: 600, borderRadius: 'var(--r-btn, 8px)' }}
            >
              <Icon name="plus" size={15} /> New Rental Quote
            </Link>
            <button
              type="button"
              className="btn btn--sm btn--secondary"
              style={{ minHeight: 36, fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 'var(--r-btn, 8px)' }}
              onClick={() => counterInputRef.current?.focus()}
            >
              <Icon name="barcode" size={14} /> Quick Barcode <kbd className="new-rental-kbd" style={{ fontSize: 10, padding: '1px 5px' }}>/</kbd>
            </button>
          </div>
        </div>
      </section>

      {/* Universal Express Counter Bar (Quick Search / Barcode Scanner) */}
      <div className="dashboard-counter-bar" role="search" aria-label="Express Counter Lookup">
        <div className="dashboard-counter-bar__search">
          <Icon name="search" size={16} className="dashboard-counter-bar__icon" />
          <input
            ref={counterInputRef}
            type="search"
            className="dashboard-counter-bar__input"
            placeholder="Scan barcode, serial #, or search client / booking # across pickups and returns..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            onKeyDown={handleGlobalSearchKeyDown}
            aria-label="Universal express counter search"
          />
          {globalSearch && (
            <button
              type="button"
              className="dashboard-counter-bar__clear"
              onClick={() => {
                setGlobalSearch('')
                counterInputRef.current?.focus()
              }}
              aria-label="Clear counter search"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        <div className="dashboard-counter-bar__hint" aria-hidden="true">
          <span className="dashboard-counter-bar__kbd-hint">
            <kbd className="new-rental-kbd">/</kbd> search <kbd className="new-rental-kbd">↵</kbd> select
          </span>
        </div>
      </div>

      {/* Critical Overdue Warning Alert */}
      {overdueCount > 0 && (
        <div
          role="alert"
          className="dashboard-alert dashboard-alert--overdue"
        >
          <span className="status-live-dot is-danger" style={{ marginRight: 8, flexShrink: 0 }} />
          <span className="dashboard-alert__icon" aria-hidden="true">
            <Icon name="alert_circle" size={18} />
          </span>
          <div className="dashboard-alert__body">
            <strong className="dashboard-alert__title">Action Required:</strong>
            <span className="dashboard-alert__text">
              {overdueCount} rental return{overdueCount > 1 ? 's are' : ' is'} overdue. Follow up with client or initiate return check-in.
            </span>
          </div>
        </div>
      )}

      {/* Spec §31: Mobile Segmented Control */}
      {isPhone && (
        <div className="dashboard-mobile-nav">
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
            globalQuery={globalSearch}
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
            globalQuery={globalSearch}
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
