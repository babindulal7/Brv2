import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import Icon from '../../components/ui/Icon'
import { PageHeader, PageActions, Button } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useDomainEvent } from '../../events/useDomainEvent'
import { EVENT_TYPES } from '../../events/eventBus'
import { toBs, formatBs, BS_MONTHS } from '../../lib/bs'
import { businessDayAd, businessNowAd, overDays, pickupsQuery, toMovementRow, type MovementRow } from '../../lib/queries/today'
import { listBookings, operationQueue, todaysOutgoing } from '../../lib/queries/bookings'
import type { ListFilters } from '../../lib/queries/listQuery'
import { useList, type ListQueryResult, type ListResult } from '../../lib/queries/useList'
import { useViewport } from '../../lib/device'
import { useOperationsWorkspace } from '../operations/OperationsWorkspaceContext'
import type { BookingStatus } from '../../lib/workflow'
import RawDashboardMovementPanel from './DashboardMovementPanel'
import './dashboard.css'

const DashboardMovementPanel = RawDashboardMovementPanel as React.ComponentType<
  React.ComponentProps<typeof RawDashboardMovementPanel> & {
    noun?: 'pickup' | 'return'
    date?: string
  }
>

type QuickPeriod = 'Today' | 'Tomorrow' | 'Next 7 Days'
type DateFilter = { kind: 'quick'; period: QuickPeriod } | { kind: 'custom'; from: string; to: string }

const QUICK_PERIODS: readonly QuickPeriod[] = ['Today', 'Tomorrow', 'Next 7 Days']
const STORAGE_DISPATCH = 'dashboard.dispatchDateFilter'
const STORAGE_PICKUPS = 'dashboard.pickupDateFilter'
const STORAGE_RETURNS = 'dashboard.returnDateFilter'

function shiftDay(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function isCalendarDay(day: unknown): day is string {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const date = new Date(`${day}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day
}

function readStoredFilter(key?: string): DateFilter {
  if (typeof window === 'undefined') return { kind: 'quick', period: 'Today' }
  try {
    const raw = key
      ? window.sessionStorage.getItem(key)
      : (window.sessionStorage.getItem(STORAGE_DISPATCH) ??
         window.sessionStorage.getItem(STORAGE_PICKUPS) ??
         window.sessionStorage.getItem(STORAGE_RETURNS))
    const parsed = JSON.parse(raw ?? 'null') as DateFilter | null
    if (parsed?.kind === 'quick' && QUICK_PERIODS.includes(parsed.period)) return parsed
    if (parsed?.kind === 'custom' && isCalendarDay(parsed.from) && isCalendarDay(parsed.to) && parsed.from <= parsed.to) return parsed
  } catch {
    // Stale browser storage should not break dispatch board
  }
  return { kind: 'quick', period: 'Today' }
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

import { useCurrentLanguage } from '../../lib/i18n'

const QUICK_PERIOD_LABELS: Record<'en' | 'ne', Record<QuickPeriod, string>> = {
  en: {
    Today: 'Today',
    Tomorrow: 'Tomorrow',
    'Next 7 Days': 'Next 7 Days',
  },
  ne: {
    Today: 'आज',
    Tomorrow: 'भोलि',
    'Next 7 Days': 'यो हप्ता (७ दिन)',
  },
}

const NE_WEEKDAYS = ['आइत', 'सोम', 'मंगल', 'बुध', 'बिही', 'शुक्र', 'शनि'] as const
const EN_WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const

function compactDate(day: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00.000Z`))
}

function filterLabel(filter: DateFilter, lang: 'en' | 'ne' = 'en'): string {
  if (filter.kind === 'quick') return QUICK_PERIOD_LABELS[lang][filter.period]
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

function formatMasterDispatchDate(filter: DateFilter, today: string, lang: 'en' | 'ne' = 'en'): string {
  if (filter.kind === 'quick' && filter.period === 'Next 7 Days') {
    return QUICK_PERIOD_LABELS[lang]['Next 7 Days']
  }
  const day = filter.kind === 'custom' ? filter.from : rangeFor(filter, today).from
  if (filter.kind === 'custom' && filter.from !== filter.to) {
    return filterLabel(filter, lang)
  }
  const dateObj = new Date(`${day}T00:00:00.000Z`)
  const adMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(dateObj)
  const adDay = dateObj.getUTCDate()
  const adPart = `${adMonth} ${adDay}`

  const bs = toBs(dateObj)
  const bsPart = bs ? `${BS_MONTHS[bs.month - 1]} ${bs.day}` : ''
  const dual = bsPart ? `${adPart} / ${bsPart}` : adPart

  const isToday = day === today
  const isTomorrow = day === shiftDay(today, 1)

  if (isToday) {
    const todayPrefix = lang === 'ne' ? 'आज' : 'Today'
    return `${todayPrefix} · ${dual}`
  }
  if (isTomorrow) {
    const tomorrowPrefix = lang === 'ne' ? 'भोलि' : 'Tomorrow'
    return `${tomorrowPrefix} · ${dual}`
  }
  return dual
}

function DateFilterControl({
  noun,
  filter,
  onChange,
  today,
}: {
  noun: 'pickup' | 'return' | 'dispatch'
  filter: DateFilter
  onChange: (filter: DateFilter) => void
  today: string
}) {
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

  useEffect(() => {
    if (open) dialog.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const closeAway = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false)
        setRangeStart(null)
      }
    }
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
    <div
      className="dashboard-date-filter"
      ref={root}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false)
          setRangeStart(null)
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="dashboard-date-filter__button"
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${noun}-date-dialog` : undefined}
        onClick={() => {
          setRangeStart(null)
          if (!open) setMonth(new Date(Date.UTC(initialDate.getUTCFullYear(), initialDate.getUTCMonth(), 1)))
          setOpen((value) => !value)
        }}
      >
        <span className="dashboard-date-filter__calendar" aria-hidden="true"><Icon name="calendar" size={18} /></span>
        <span className="dashboard-date-filter__label">{filterLabel(filter)}</span>
        <Icon name="chevron_down" size={15} />
      </button>

      {open && (
        <div id={`${noun}-date-dialog`} className="dashboard-calendar" role="dialog" aria-label={dialogLabel} tabIndex={-1} ref={dialog}>
          <div className="dashboard-calendar__quick" role="group" aria-label="Quick date filters">
            {QUICK_PERIODS.map((period) => (
              <button
                key={period}
                type="button"
                aria-pressed={filter.kind === 'quick' && filter.period === period}
                onClick={() => selectQuick(period)}
              >
                {period}
              </button>
            ))}
          </div>
          <div className="dashboard-calendar__month-row">
            <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))}>
              <Icon name="chevron_left" size={17} />
            </button>
            <strong>{monthName}</strong>
            <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))}>
              <Icon name="chevron_right" size={17} />
            </button>
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
                <button
                  key={day}
                  type="button"
                  data-calendar-day={day}
                  className={selected ? 'is-selected' : inRange ? 'is-in-range' : undefined}
                  aria-label={compactDate(day)}
                  aria-pressed={selected || inRange}
                  onClick={() => selectDay(day)}
                  onKeyDown={(event) => onDayKeyDown(event, day)}
                >
                  {Number(day.slice(-2))}
                </button>
              )
            })}
          </div>
          <div className="dashboard-calendar__footer">
            <button type="button" aria-pressed={rangeMode} onClick={() => { setRangeMode(!rangeMode); setRangeStart(null) }}>
              {rangeMode ? 'Date range' : 'Single date'}
            </button>
            <span aria-live="polite">{rangeStart ? 'Choose an end date.' : rangeMode ? 'Select start and end dates' : 'Select a date'}</span>
            {rangeStart && <button type="button" onClick={useSingleDay}>Use {compactDate(rangeStart)}</button>}
            <button type="button" className="dashboard-calendar__close" onClick={close}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

function MasterDispatchDateControl({
  filter,
  onChange,
  today,
  onStepDay,
}: {
  filter: DateFilter
  onChange: (filter: DateFilter) => void
  today: string
  onStepDay: (delta: number) => void
}) {
  const lang = useCurrentLanguage()
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
    const closeAway = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false)
        setRangeStart(null)
      }
    }
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
  const masterLabel = formatMasterDispatchDate(filter, today, lang)
  const isToday = filter.kind === 'quick' && filter.period === 'Today'

  return (
    <div
      className="dashboard-master-date-control"
      ref={root}
      role="group"
      aria-label="Master dispatch date"
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false)
          setRangeStart(null)
        }
      }}
    >
      <span className="dashboard-header-controls__label" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', fontWeight: 500, marginRight: 4 }}>
        Sync dispatch day:
      </span>
      <button
        type="button"
        className="dashboard-master-date-control__btn"
        aria-label="Previous day"
        title="Previous day (Shortcut: [ or P)"
        onClick={() => onStepDay(-1)}
      >
        <Icon name="chevron_left" size={16} />
      </button>

      <button
        type="button"
        className={`dashboard-master-date-control__btn dashboard-day-pager__btn--today ${isToday ? 'is-today' : ''}`}
        aria-label="Today"
        onClick={() => onChange({ kind: 'quick', period: 'Today' })}
      >
        Today
      </button>

      <button
        ref={trigger}
        type="button"
        className={`dashboard-master-date-control__date-btn ${isToday ? 'is-today' : ''}`}
        aria-label="Choose dispatch date filter"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? 'dispatch-date-dialog' : undefined}
        onClick={() => {
          setRangeStart(null)
          if (!open) setMonth(new Date(Date.UTC(initialDate.getUTCFullYear(), initialDate.getUTCMonth(), 1)))
          setOpen((v) => !v)
        }}
      >
        <span className="dashboard-master-date-control__label">{masterLabel}</span>
      </button>

      <button
        type="button"
        className="dashboard-master-date-control__btn"
        aria-label="Next day"
        title="Next day (Shortcut: ] or N)"
        onClick={() => onStepDay(1)}
      >
        <Icon name="chevron_right" size={16} />
      </button>

      <button
        type="button"
        className="dashboard-master-date-control__calendar-btn"
        aria-label="Dispatch calendar"
        title="Open calendar (📅)"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setRangeStart(null)
          if (!open) setMonth(new Date(Date.UTC(initialDate.getUTCFullYear(), initialDate.getUTCMonth(), 1)))
          setOpen((v) => !v)
        }}
      >
        <Icon name="calendar" size={18} />
      </button>

      {open && (
        <div id="dispatch-date-dialog" className="dashboard-calendar" role="dialog" aria-label="Dispatch date filter" tabIndex={-1} ref={dialog}>
          <div className="dashboard-calendar__quick" role="group" aria-label="Quick date filters">
            {QUICK_PERIODS.map((period) => (
              <button key={period} type="button" aria-pressed={filter.kind === 'quick' && filter.period === period} onClick={() => selectQuick(period)}>
                {QUICK_PERIOD_LABELS[lang][period]}
              </button>
            ))}
          </div>
          <div className="dashboard-calendar__month-row">
            <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))}><Icon name="chevron_left" size={17} /></button>
            <strong>{monthName}</strong>
            <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))}><Icon name="chevron_right" size={17} /></button>
          </div>
          <div className="dashboard-calendar__weekdays" aria-hidden="true">
            {(lang === 'ne' ? NE_WEEKDAYS : EN_WEEKDAYS).map((day) => <span key={day}>{day}</span>)}
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
            <button type="button" aria-pressed={rangeMode} onClick={() => { setRangeMode(!rangeMode); setRangeStart(null) }}>
              {rangeMode ? (lang === 'ne' ? 'मिति दायरा' : 'Date range') : (lang === 'ne' ? 'एकल मिति' : 'Single date')}
            </button>
            <span aria-live="polite">
              {rangeStart ? (lang === 'ne' ? 'अन्त्य मिति चयन गर्नुहोस्।' : 'Choose an end date.') : rangeMode ? (lang === 'ne' ? 'सुरु र अन्त्य मिति छान्नुहोस्' : 'Select start and end dates') : (lang === 'ne' ? 'मिति छान्नुहोस्' : 'Select a date')}
            </span>
            {rangeStart && (
              <button type="button" onClick={useSingleDay}>
                {lang === 'ne' ? `${compactDate(rangeStart)} प्रयोग गर्नुहोस्` : `Use ${compactDate(rangeStart)}`}
              </button>
            )}
            <button type="button" className="dashboard-calendar__close" onClick={close}>
              {lang === 'ne' ? 'बन्द गर्नुहोस्' : 'Close'}
            </button>
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

  const [pickupDateFilter, setPickupDateFilter] = useState<DateFilter>(() => readStoredFilter(STORAGE_PICKUPS))
  const [returnDateFilter, setReturnDateFilter] = useState<DateFilter>(() => readStoredFilter(STORAGE_RETURNS))

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_PICKUPS, JSON.stringify(pickupDateFilter))
      window.sessionStorage.setItem(STORAGE_RETURNS, JSON.stringify(returnDateFilter))
      window.sessionStorage.setItem(STORAGE_DISPATCH, JSON.stringify(pickupDateFilter))
    } catch {
      // Persistence is optional in privacy-restricted browser sessions.
    }
  }, [pickupDateFilter, returnDateFilter])

  const [pickupPage, setPickupPage] = useState(0)
  const [returnPage, setReturnPage] = useState(0)
  const dayAd = businessDayAd()

  const syncBothPanels = useCallback((nextFilter: DateFilter) => {
    setPickupPage(0)
    setReturnPage(0)
    setPickupDateFilter(nextFilter)
    setReturnDateFilter(nextFilter)
  }, [])

  const dispatchDate = useMemo(() => {
    if (pickupDateFilter.kind === 'custom') return pickupDateFilter.from
    return rangeFor(pickupDateFilter, dayAd).from
  }, [pickupDateFilter, dayAd])

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
  const isPickupFiltered = pickupDateFilter.kind !== 'quick' || pickupDateFilter.period !== 'Today'
  const isReturnFiltered = returnDateFilter.kind !== 'quick' || returnDateFilter.period !== 'Today'
  const pickups: ListResult<MovementRow> = useList(fetchPickups, pickupFilters, { isFilteredOverride: isPickupFiltered })
  const returns: ListResult<MovementRow> = useList(fetchReturns, returnFilters, { isFilteredOverride: isReturnFiltered })
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

  const isDispatchToday = pickupDateFilter.kind === 'quick' && pickupDateFilter.period === 'Today'
  const isReturnToday = returnDateFilter.kind === 'quick' && returnDateFilter.period === 'Today'
  const pickupCount = pickups.loading || pickups.error ? undefined : pickups.total ?? pickups.rows.length
  const returnCount = returns.loading || returns.error ? undefined : returns.total ?? returns.rows.length

  const overdueCount = useMemo(
    () => returns.rows.filter((r) => r.flags.includes('Overdue') || (r.statusNote && r.statusNote.includes('late'))).length,
    [returns.rows]
  )

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
              key="today-actions"
              extra={
                <MasterDispatchDateControl
                  filter={pickupDateFilter}
                  onChange={syncBothPanels}
                  today={dayAd}
                  onStepDay={stepDay}
                />
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
      {/* Universal Express Counter Bar (Quick Search / Barcode Scanner) */}
      <div className="dashboard-counter-bar" role="search" aria-label="Express Counter Lookup">
        <div className="dashboard-counter-bar__search">
          <Icon name="search" size={16} className="dashboard-counter-bar__icon" />
          <input
            ref={counterInputRef}
            type="search"
            className="dashboard-counter-bar__input"
            placeholder="Search or scan…"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            onKeyDown={handleGlobalSearchKeyDown}
            aria-label="Search or scan bookings, clients, serials"
          />
          {globalSearch && (
            <button
              type="button"
              className="dashboard-counter-bar__clear"
              onClick={() => {
                setGlobalSearch('')
                counterInputRef.current?.focus()
              }}
              aria-label="Clear search"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Condensed Overdue Alert (⚠ N overdue returns [View Returns]) */}
      {overdueCount > 0 && (
        <div
          role="alert"
          className="dashboard-alert dashboard-alert--overdue"
        >
          <div className="dashboard-alert__content">
            <Icon name="alert_circle" size={18} />
            <span>{overdueCount} overdue {overdueCount > 1 ? 'returns' : 'return'}</span>
          </div>
          <button
            type="button"
            className="dashboard-alert__action"
            onClick={() => {
              if (isPhone) setMobileTab('returns')
              const returnsHeading = document.getElementById('incoming-panel-title')
              returnsHeading?.scrollIntoView({ behavior: 'smooth' })
              returnsHeading?.focus()
            }}
          >
            View Returns
          </button>
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
            noun="pickup"
            date={dispatchDate}
            title="Pickups"
            subtitle="Rentals scheduled for pickup"
            icon="truck"
            list={pickups}
            periodLabel={filterLabel(pickupDateFilter).toLowerCase()}
            globalQuery={globalSearch}
            onClearFilters={() => { setPickupPage(0); setPickupDateFilter({ kind: 'quick', period: 'Today' }) }}
            onLoadMore={() => setPickupPage((page) => page + 1)}
            hasMore={pickups.total !== null && pickups.rows.length < pickups.total}
            isToday={isDispatchToday}
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
            noun="return"
            date={dispatchDate}
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
