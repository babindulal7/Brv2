import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Button, PageHeader } from '../../components/ui/Page'
import { useDomainEvent } from '../../events/useDomainEvent'
import { EVENT_TYPES } from '../../events/eventBus'
import { businessDayAd, businessNowAd, overDays, pickupsQuery, toMovementRow, type MovementRow } from '../../lib/queries/today'
import { listBookings, operationQueue, todaysOutgoing } from '../../lib/queries/bookings'
import type { ListFilters } from '../../lib/queries/listQuery'
import { useList, type ListQueryResult, type ListResult } from '../../lib/queries/useList'
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
    if (parsed?.kind === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.from) && /^\d{4}-\d{2}-\d{2}$/.test(parsed.to)) return parsed
  } catch {
    // A stale browser value should never prevent the movement board from opening.
  }
  return { kind: 'quick', period: 'Today' }
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

function DateFilterControl({ noun, filter, onChange, today }: { noun: 'pickup' | 'return'; filter: DateFilter; onChange: (filter: DateFilter) => void; today: string }) {
  const [open, setOpen] = useState(false)
  const [rangeStart, setRangeStart] = useState<string | null>(null)
  const [rangeMode, setRangeMode] = useState(false)
  const initialDay = filter.kind === 'custom' ? filter.from : rangeFor(filter, today).from
  const initialDate = new Date(`${initialDay}T00:00:00.000Z`)
  const [month, setMonth] = useState(() => new Date(Date.UTC(initialDate.getUTCFullYear(), initialDate.getUTCMonth(), 1)))
  const root = useRef<HTMLDivElement>(null)
  const days = useMemo(() => calendarDays(month), [month])

  useEffect(() => {
    if (!open) return
    const closeAway = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { setOpen(false); setRangeStart(null) } }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        setRangeStart(null)
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
    setRangeStart(null)
    setOpen(false)
  }

  const selectDay = (day: string) => {
    if (!rangeMode) {
      onChange({ kind: 'custom', from: day, to: day })
      setRangeStart(null)
      setOpen(false)
      return
    }
    if (!rangeStart) {
      setRangeStart(day)
      return
    }
    onChange({ kind: 'custom', from: day < rangeStart ? day : rangeStart, to: day < rangeStart ? rangeStart : day })
    setRangeStart(null)
    setOpen(false)
  }

  const useSingleDay = () => {
    if (!rangeStart) return
    onChange({ kind: 'custom', from: rangeStart, to: rangeStart })
    setRangeStart(null)
    setOpen(false)
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

  return (
    <div className="dashboard-date-filter" ref={root}>
      <button type="button" className="dashboard-date-filter__button" aria-label={`Choose ${noun} date filter`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="dashboard-date-filter__calendar" aria-hidden="true"><Icon name="calendar" size={18} /></span>
        <span className="dashboard-date-filter__label">{filterLabel(filter)}</span>
        <Icon name="chevron_down" size={15} />
      </button>

      {open && (
        <div className="dashboard-calendar" role="dialog" aria-label={`${noun} date filter`}>
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
            <span>{rangeStart ? 'Choose an end date.' : rangeMode ? 'Select start and end dates' : 'Select a date'}</span>
            {rangeStart && <button type="button" onClick={useSingleDay}>Use {compactDate(rangeStart)}</button>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Today() {
  const navigate = useNavigate()
  const [pickupDateFilter, setPickupDateFilter] = useStoredFilter(STORAGE_PICKUPS)
  const [returnDateFilter, setReturnDateFilter] = useStoredFilter(STORAGE_RETURNS)
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

  const pickups: ListResult<MovementRow> = useList(fetchPickups, pickupSet.filters, { isFilteredOverride: pickupDateFilter.kind !== 'quick' || pickupDateFilter.period !== 'Today' })
  const returns: ListResult<MovementRow> = useList(fetchReturns, returnSet, { isFilteredOverride: returnDateFilter.kind !== 'quick' || returnDateFilter.period !== 'Today' })
  const { refetch: refetchPickups } = pickups
  const { refetch: refetchReturns } = returns
  const refetchMovement = useCallback(() => { refetchPickups(); refetchReturns() }, [refetchPickups, refetchReturns])

  useDomainEvent(EVENT_TYPES.RENTAL_PICKED_UP, refetchMovement)
  useDomainEvent(EVENT_TYPES.RENTAL_RETURNED, refetchMovement)

  return (
    <div className="rental-dashboard">
      <PageHeader title="Dashboard" description="Pickups and returns at a glance." actions={<Button icon="plus" variant="primary" aria-label="New Rental" onClick={() => navigate('/rentals/new')}>New Rental</Button>} />
      <div className="rental-dashboard__panels">
        <DashboardMovementPanel side="outgoing" title="Pickups" subtitle="Rentals scheduled for pickup" icon="truck" list={pickups} periodLabel={filterLabel(pickupDateFilter).toLowerCase()} onClearFilters={() => setPickupDateFilter({ kind: 'quick', period: 'Today' })} filterControl={<DateFilterControl noun="pickup" filter={pickupDateFilter} onChange={setPickupDateFilter} today={dayAd} />} />
        <DashboardMovementPanel side="incoming" title="Returns" subtitle="Rentals expected to be returned" icon="return_arrow" list={returns} periodLabel={filterLabel(returnDateFilter).toLowerCase()} onClearFilters={() => setReturnDateFilter({ kind: 'quick', period: 'Today' })} filterControl={<DateFilterControl noun="return" filter={returnDateFilter} onChange={setReturnDateFilter} today={dayAd} />} />
      </div>
    </div>
  )
}
