import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../../components/ui/Icon'
import { CalendarPopover } from '../../components/ui/DateField'
import { PageHeader, PageActions } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useDomainEvent } from '../../events/useDomainEvent'
import { EVENT_TYPES } from '../../events/eventBus'
import { toBs, formatAd, formatBs } from '../../lib/bs'
import { businessDayAd, businessNowAd, overDays, pickupsQuery, toMovementRow, type MovementRow } from '../../lib/queries/today'
import { listBookings, operationQueue, todaysOutgoing } from '../../lib/queries/bookings'
import type { ListFilters } from '../../lib/queries/listQuery'
import { useList, type ListQueryResult, type ListResult } from '../../lib/queries/useList'
import { useViewport } from '../../lib/device'
import { useOperationsWorkspace } from '../operations/OperationsWorkspaceContext'
import type { BookingStatus } from '../../lib/workflow'
import RawDashboardMovementPanel from './DashboardMovementPanel'
import ShiftHandoverPanel from './ShiftHandoverPanel'
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

function compactDate(day: string): string {
  return formatAd(new Date(`${day}T00:00:00.000Z`))
}

function filterLabel(filter: DateFilter, lang: 'en' | 'ne' = 'en'): string {
  if (filter.kind === 'quick') return QUICK_PERIOD_LABELS[lang][filter.period]
  if (filter.from === filter.to) return compactDate(filter.from)
  return `${compactDate(filter.from)} – ${compactDate(filter.to)}`
}

const AD_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/**
 * The date control's two visible lines (8 Oct 2026, RULINGS-2026-10-08.md):
 * a short name for the day ("Today", "Tomorrow", "Yesterday", or the weekday)
 * over the BS and AD dates, with years only when the day is in another year.
 * The button's accessible name is built from the same two parts (WCAG 2.5.3).
 */
function masterDispatchParts(filter: DateFilter, today: string, lang: 'en' | 'ne' = 'en'): { primary: string; secondary: string } {
  if (filter.kind === 'quick' && filter.period === 'Next 7 Days') {
    const range = rangeFor(filter, today)
    return { primary: QUICK_PERIOD_LABELS[lang]['Next 7 Days'], secondary: `${compactDate(range.from)} – ${compactDate(range.to)}` }
  }
  if (filter.kind === 'custom' && filter.from !== filter.to) {
    return { primary: lang === 'ne' ? 'मिति दायरा' : 'Date range', secondary: filterLabel(filter, lang) }
  }
  const day = filter.kind === 'custom' ? filter.from : rangeFor(filter, today).from
  const dateObj = new Date(`${day}T00:00:00.000Z`)
  const bs = toBs(dateObj)
  // Years only when the day is in another year than today — nearby days need none.
  const otherYear = day.slice(0, 4) !== today.slice(0, 4)
  const adPart = `${dateObj.getUTCDate()} ${AD_MONTHS[dateObj.getUTCMonth()]}${otherYear ? ` ${dateObj.getUTCFullYear()}` : ''}`
  const bsPart = bs ? `${formatBs(bs)}${otherYear ? ` ${bs.year}` : ''}` : ''
  const secondary = bsPart ? `${bsPart} · ${adPart}` : adPart
  const named: Record<string, [string, string]> = {
    [today]: ['Today', 'आज'],
    [shiftDay(today, 1)]: ['Tomorrow', 'भोलि'],
    [shiftDay(today, -1)]: ['Yesterday', 'हिजो'],
  }
  const primary = named[day]
    ? named[day][lang === 'ne' ? 1 : 0]
    : new Intl.DateTimeFormat(lang === 'ne' ? 'ne-NP' : 'en-GB', { weekday: 'long', timeZone: 'UTC' }).format(dateObj)
  return { primary, secondary }
}

/**
 * Dashboard calendars used to render inline (`position: absolute`) inside the
 * page header and the movement-panel headers. Ancestors there sit under
 * transformed parents (`.animate-entrance` keeps a set transform), and a
 * non-none transform makes an ancestor a stacking context — so an open
 * calendar painted UNDER the panels below it. Portaling to `document.body`
 * with `position: fixed` escapes every ancestor context; `--z-dropdown` keeps
 * it above panels and tables. Position tracks the trigger (re-measured on
 * scroll/resize). On phone widths the stylesheet turns `.dashboard-calendar`
 * into a bottom sheet, so only the stacking is overridden there.
 */
function CalendarPortal({
  triggerRef,
  dialogRef,
  id,
  label,
  children,
}: {
  triggerRef: React.RefObject<HTMLButtonElement>
  dialogRef: React.RefObject<HTMLDivElement>
  id: string
  label: string
  children: React.ReactNode
}) {
  const viewport = useViewport()
  const [rect, setRect] = useState<DOMRect | null>(null)
  const focused = useRef(false)
  const adjusted = useRef(false)
  useEffect(() => {
    const measure = () => {
      const el = triggerRef.current
      if (!el) return
      adjusted.current = false
      setRect(el.getBoundingClientRect())
    }
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [triggerRef])
  // The panel renders one beat after the trigger opens (rect starts null),
  // so the opener's focus effect fires before the dialog exists — focus here,
  // when the portaled panel actually lands in the document.
  useEffect(() => {
    if (rect && !focused.current) {
      focused.current = true
      dialogRef.current?.focus()
    }
  }, [rect, dialogRef])
  // Pull the panel up when it would run past the viewport bottom — a card
  // filter near the fold would otherwise open its calendar off-screen.
  useLayoutEffect(() => {
    if (!rect || viewport === 'phone' || adjusted.current) return
    const panel = dialogRef.current
    if (!panel) return
    const overflow = panel.getBoundingClientRect().bottom - window.innerHeight + 8
    if (overflow > 0) {
      adjusted.current = true
      const el = triggerRef.current
      if (el) {
        const r = el.getBoundingClientRect()
        setRect(new DOMRect(r.x, r.y - overflow, r.width, r.height))
      }
    }
  }, [rect, viewport, dialogRef, triggerRef])
  if (!rect) return null
  const style: React.CSSProperties =
    viewport === 'phone'
      ? { zIndex: 'var(--z-dropdown)' }
      : {
          position: 'fixed',
          top: rect.bottom + 10,
          right: Math.max(12, window.innerWidth - rect.right),
          zIndex: 'var(--z-dropdown)',
        }
  return createPortal(
    <div id={id} className="dashboard-calendar" role="dialog" aria-label={label} tabIndex={-1} ref={dialogRef} style={style}>
      {children}
    </div>,
    document.body,
  )
}

function DashboardCalendarContent({
  title,
  filter,
  onChange,
  onClose,
  today,
  lang = 'en',
}: {
  title: string
  filter: DateFilter
  onChange: (filter: DateFilter) => void
  onClose: () => void
  today: string
  lang?: 'en' | 'ne'
}) {
  const selected = rangeFor(filter, today)
  const initialRange = selected.from !== selected.to
  const [rangeMode, setRangeMode] = useState(initialRange)
  const [rangeStart, setRangeStart] = useState<string | null>(null)
  const [draft, setDraft] = useState(() => initialRange
    ? selected
    : { from: '', to: '' })

  const commit = (next: DateFilter) => {
    onChange(next)
    onClose()
  }

  return (
    <>
      <div className="dashboard-calendar__heading">
        <div>
          <strong>{title}</strong>
          <span aria-live="polite">
            {rangeStart
              ? (lang === 'ne' ? 'अन्त्य मिति छान्नुहोस्' : 'Choose an end date')
              : (lang === 'ne' ? 'मिति छान्नुहोस्' : 'Choose a date or range')}
          </span>
        </div>
        <button type="button" aria-label="Close calendar" onClick={onClose}><Icon name="close" size={18} /></button>
      </div>
      <div className="dashboard-calendar__quick" role="group" aria-label="Quick date filters">
        {QUICK_PERIODS.map((period) => (
          <button key={period} type="button" aria-pressed={filter.kind === 'quick' && filter.period === period} onClick={() => commit({ kind: 'quick', period })}>
            {QUICK_PERIOD_LABELS[lang][period]}
          </button>
        ))}
      </div>
      <div className="dashboard-calendar__mode" role="group" aria-label="Calendar selection mode">
        <button type="button" aria-pressed={!rangeMode} onClick={() => { setRangeMode(false); setRangeStart(null) }}>
          {lang === 'ne' ? 'एक दिन' : 'Single day'}
        </button>
        <button type="button" aria-pressed={rangeMode} onClick={() => { setRangeMode(true); setRangeStart(null); setDraft({ from: '', to: '' }) }}>
          {lang === 'ne' ? 'मिति दायरा' : 'Date range'}
        </button>
      </div>
      <CalendarPopover
        embedded
        showHeader={false}
        title={title}
        value={selected.from}
        range={rangeMode ? draft : undefined}
        todayDate={today}
        shadePastDates={false}
        onSelect={rangeMode ? undefined : (day) => commit({ kind: 'custom', from: day, to: day })}
        onSelectRange={rangeMode ? ({ from, to }) => {
          if (rangeStart) {
            commit({ kind: 'custom', from, to })
          } else {
            setRangeStart(from)
            setDraft({ from, to })
          }
        } : undefined}
        onDismiss={() => {
          if (rangeStart) commit({ kind: 'custom', from: rangeStart, to: rangeStart })
          else onClose()
        }}
      />
    </>
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
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const closeAway = (event: PointerEvent) => {
      const target = event.target as Node
      if (dialog.current?.contains(target) || root.current?.contains(target)) return
      setOpen(false)
    }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    document.addEventListener('pointerdown', closeAway)
    document.addEventListener('keydown', closeEscape)
    return () => {
      document.removeEventListener('pointerdown', closeAway)
      document.removeEventListener('keydown', closeEscape)
    }
  }, [open])

  const parts = masterDispatchParts(filter, today, lang)
  const isToday = filter.kind === 'quick' && filter.period === 'Today'

  return (
    <div
      className="dashboard-master-date-control"
      ref={root}
      role="group"
      aria-label="Dispatch day for pickups and returns"
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null
        if (next && (event.currentTarget.contains(next) || dialog.current?.contains(next))) return
        if (event.relatedTarget) setOpen(false)
      }}
    >
      {/* Only offered away from today, and LEFT of ‹ so the arrows never move under a thumb
          when it appears (the group is right-aligned) — the booqable branch's 7 Oct detail. */}
      {!isToday && (
        <button
          type="button"
          className="dashboard-master-date-control__btn dashboard-day-pager__btn--today"
          aria-label="Today"
          title="Back to today"
          onClick={() => onChange({ kind: 'quick', period: 'Today' })}
        >
          {lang === 'ne' ? 'आज' : 'Today'}
        </button>
      )}
      <button
        type="button"
        className="dashboard-master-date-control__btn"
        aria-label="Previous day"
        title="Previous day (Shortcut: [ or P)"
        onClick={() => onStepDay(-1)}
      >
        <Icon name="chevron_left" size={16} />
      </button>
      {/* One door to the picker: the date itself (the separate calendar icon opened the same dialog). */}
      <button
        ref={trigger}
        type="button"
        className={`dashboard-master-date-control__date-btn ${isToday ? 'is-today' : ''}`}
        aria-label={`${parts.primary} · ${parts.secondary} — choose dispatch date filter`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? 'dispatch-date-dialog' : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="calendar" size={16} className="dashboard-master-date-control__cal" />
        <span className="dashboard-master-date-control__text">
          <span className="dashboard-master-date-control__primary">{parts.primary}</span>
          {/* Keeps the button's text equal to its spoken name (WCAG 2.5.3) though the lines stack. */}
          <span className="sr-only"> · </span>
          <span className="dashboard-master-date-control__secondary">{parts.secondary}</span>
        </span>
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
      {open && (
        <CalendarPortal triggerRef={trigger} dialogRef={dialog} id="dispatch-date-dialog" label="Dispatch date filter">
          <DashboardCalendarContent
            title={lang === 'ne' ? 'डिस्प्याच मिति' : 'Dispatch date'}
            filter={filter}
            onChange={onChange}
            onClose={close}
            today={today}
            lang={lang}
          />
        </CalendarPortal>
      )}
    </div>
  )
}

export default function Today() {
  const viewport = useViewport()
  const isPhone = viewport === 'phone'
  const [mobileTab, setMobileTab] = useState<'pickups' | 'returns'>('pickups')
  const mobileTabChosenRef = useRef(false)
  const { openOperations } = useOperationsWorkspace()
  const [globalSearch, setGlobalSearch] = useState('')
  const counterInputRef = useRef<HTMLInputElement>(null)

  const [pickupDateFilter, setPickupDateFilter] = useState<DateFilter>(() => readStoredFilter())
  const [returnDateFilter, setReturnDateFilter] = useState<DateFilter>(() => readStoredFilter())

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
  const panelFocus = pickupCount === 0 && (returnCount ?? 0) > 0
    ? 'returns-focus'
    : returnCount === 0 && (pickupCount ?? 0) > 0
      ? 'pickups-focus'
      : null

  useEffect(() => {
    if (isPhone && !mobileTabChosenRef.current && pickupCount === 0 && (returnCount ?? 0) > 0) {
      setMobileTab('returns')
      mobileTabChosenRef.current = true
    }
  }, [isPhone, pickupCount, returnCount])

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

  return (
    <PageShell
      className="rental-dashboard"
      header={
        <PageHeader
          title="Today"
          actions={
            <PageActions
              key="today-actions"
              className="dashboard-date-actions"
              extra={
                <MasterDispatchDateControl
                  filter={pickupDateFilter}
                  onChange={syncBothPanels}
                  today={dayAd}
                  onStepDay={stepDay}
                />
              }
            />
          }
        />
      }
    >
      <div className="dashboard-workbar">
        {/* The day in one line (ruled 8 Oct 2026, RULINGS-2026-10-08.md) — the
            same counts the Pickups/Returns badges show, said as a sentence. */}
        <div className="dashboard-workbar__intro">
          <span>{masterDispatchParts(pickupDateFilter, dayAd).primary}</span>
          <p>
            {pickupCount === undefined || returnCount === undefined
              ? 'Movement board'
              : `${pickupCount} going out · ${returnCount} coming back`}
          </p>
        </div>
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
              <span>Overdue returns need attention</span>
            </div>
            <button
              type="button"
              className="dashboard-alert__action"
              onClick={() => {
                if (isPhone) {
                  mobileTabChosenRef.current = true
                  setMobileTab('returns')
                }
                const returnsHeading = document.getElementById('incoming-panel-title')
                returnsHeading?.scrollIntoView({ behavior: 'smooth' })
                returnsHeading?.focus()
              }}
            >
              View Returns
            </button>
          </div>
        )}
      </div>

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
            onChange={(nextTab) => {
              mobileTabChosenRef.current = true
              setMobileTab(nextTab)
            }}
          />
        </div>
      )}

      {/* Both queues stay visible; an empty side condenses so active work has room. */}
      <div className={`rental-dashboard__panels${panelFocus ? ` rental-dashboard__panels--${panelFocus}` : ''}`}>
        {(!isPhone || mobileTab === 'pickups') && (
          <DashboardMovementPanel
            side="outgoing"
            noun="pickup"
            date={dispatchDate}
            title="Pickups"
            subtitle="Scheduled departures"
            icon="truck"
            list={pickups}
            periodLabel={filterLabel(pickupDateFilter).toLowerCase()}
            globalQuery={globalSearch}
            onClearFilters={() => syncBothPanels({ kind: 'quick', period: 'Today' })}
            onLoadMore={() => setPickupPage((page) => page + 1)}
            hasMore={pickups.total !== null && pickups.rows.length < pickups.total}
            compactEmpty={!isPhone && panelFocus === 'returns-focus'}
            isToday={isDispatchToday}
          />
        )}

        {(!isPhone || mobileTab === 'returns') && (
          <DashboardMovementPanel
            side="incoming"
            noun="return"
            date={dispatchDate}
            title="Returns"
            subtitle={isReturnToday ? 'Today · Overdue included' : undefined}
            icon="return_arrow"
            list={returns}
            periodLabel={filterLabel(returnDateFilter).toLowerCase()}
            isToday={isReturnToday}
            globalQuery={globalSearch}
            onClearFilters={() => syncBothPanels({ kind: 'quick', period: 'Today' })}
            onLoadMore={() => setReturnPage((page) => page + 1)}
            hasMore={returns.total !== null && returns.rows.length < returns.total}
            compactEmpty={!isPhone && panelFocus === 'pickups-focus'}
          />
        )}
      </div>
      <ShiftHandoverPanel />
    </PageShell>
  )
}
