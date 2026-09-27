import { useState, useMemo, useEffect, useRef } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, PageActions, Button, FooterNote, cardStyle } from '../../components/ui/Page'
import { SearchInput } from '../../components/ui'
import { PageShell } from '../../components/ui/PageShell'
import { PageBody } from '../../components/ui/PageBody'
import { DataAgeBadge } from '../../components/ui/DataAgeBadge'
import { FastReturnModal } from '../rentals/modals/FastReturnModal'
import { BarcodeLookupModal } from '../rentals/modals/BarcodeLookupModal'
import { CasesWorkspace } from './CasesWorkspace'
import { STATUS } from '../../lib/status'
import { statusToken, JOBS as JOBS_META, type JobName } from '../../lib/workflow'
import { listBookings, overdue, quotesExpiring, type BookingListRow } from '../../lib/queries/bookings'
import { useList, type ListResult } from '../../lib/queries/useList'
import type { ListFilters } from '../../lib/queries/listQuery'
import {
  QUEUES,
  GROUP_LABEL,
  URL_KEY,
  formatDueAt,
  groupFromParam,
  jobListFilters,
  jobRoute,
  queueCountFilters,
  queueFromParam,
  toJobRow,
  businessNowAd,
  overdueAlert,
  quoteLapsedAlert,
  periodRange,
  CASES,
  isOpenStatus,
  type JobRow,
  type Queue,
} from '../../lib/queries/operations'
import AlertsPanel from '../today/AlertsPanel'
import { useViewport } from '../../lib/device'
import { kathmanduCivil, NPT_OFFSET_MIN, getBusinessToday } from '../../lib/bs'
import { CalendarPopover, DateField } from '../../components/ui/DateField'
import { FilterButton, FilterSection } from '../../components/ui/FilterDrawer'
import { AppSidePanel } from '../../components/shell/AppSidePanel'
import { WorkspaceLeftPanel } from '../../components/shell/WorkspacePortal'
import { AppPageToolbar } from '../../components/ui/AppPageToolbar'
import { Pagination } from '../../components/ui/Pagination'
import { DataTableShell } from '../../components/ui/DataTable'
import './operations.css'
import { useOperationsWorkspace } from './OperationsWorkspaceContext'


const th = {
  textAlign: 'left' as const,
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
/*
 * `height` on a `<td>` behaves as a MINIMUM, so this is the §7.3 row floor
 * ("rows >= 56px") expressed with the token rather than with padding
 * arithmetic; the horizontal padding is left alone.
 *
 * These rows already clear 56 today — but by accident, not by rule. The Action
 * cell holds a primary `Button`, `Page.tsx` gives that `minHeight: 44`, and 44
 * plus this cell's 10px padding is the only thing holding the row open.
 * Nothing states it, and the cell beside it would be the first casualty: it is
 * a 44x44 overflow `Link`, so quieten or drop the verb button and the row falls
 * to ~38px, at which point that 44px target overhangs its neighbours by ~3px
 * top and bottom, the rows touch, and the later row in the DOM wins a tap in
 * the overlap band. The Link goes to `/rentals/:bookingNo` and this queue is
 * time-ordered, so the row above and the row below are two different bookings
 * due minutes apart — the wrong one is a plausible-looking wrong one.
 *
 * Stating the floor here makes the height a property of the row rather than of
 * one control that happens to be tall.
 */
const td = { height: 'var(--row-min-h)', padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }

/**
 * **Floor** — spec 03 §3.1, `/operations`.
 *
 * > *"queue chips filter one time-ordered list"*
 *
 * That sentence is the whole screen, and it is what this rebuild implements.
 * The chip row selects a predicate; the list underneath is always the same
 * list, ordered by the instant each job is due. Three layouts:
 *
 *  - **desktop ≥1280** — chips, then the table, then a right rail;
 *  - **tablet 768–1279** — chips, then the same table, then the rail's content
 *    **inline beneath it**. Rulings §7: *"right rails collapse below 1280"
 *    means reflow, not hide* — so the rail is not wrapped in `Rail`
 *    (`CollapsibleAside`) at this width, because that hides it behind a 28px
 *    handle, which is not what §3.1's tablet drawing shows;
 *  - **phone <768** — the table becomes card rows, rail content still inline.
 *
 * ## Consolidated 22 Sep 2026 (owner review)
 *
 * The day scope, client and project filters had grown three surfaces — a
 * topline row, a filters row, and the drawer — so the same control appeared
 * two or three times on one screen. There is now exactly one of each: the
 * header holds page actions only (Scan, More), the chip row selects the
 * queue, and one toolbar below it carries day scope, search, client,
 * project and the drawer's Filters button. The drawer keeps only what has
 * no toolbar home (queue side, exception facets, alerts). The dead
 * "All staff" select — one option, no handler — was removed rather than
 * shipped as a disabled promise.
 *
 * ## What changed on 12 Aug, and why
 *
 * 1. **Five KPI-sized queue CARDS became five chips.** §3.1 draws
 *    `(Packing 6) (Handover 4) (Return 5) (Reset 3)` on one line above one
 *    list. Nothing is lost — a chip carries the same queried count the card
 *    did — so this is the arrangement change the wireframe specifies, not a
 *    content deletion (Rulings §1).
 * 2. **A day scope appeared** — `[Today] [Tomorrow] [Custom ▾]`, drawn in the
 *    §3.1 header at all three widths. `data/operations.ts` recorded that
 *    `operationQueue`'s `fromAd`/`toAd` were never passed because *"there is
 *    no date control on this screen to bind them to, and inventing one would
 *    be a product decision"*. The spec now supplies the control, so the
 *    arguments have a source and are bound. Custom with no dates picked is
 *    every day — that is where "one Floor page for **all** days" (spec line 3)
 *    lives, rather than in a fourth chip the drawing does not have.
 * 3. **Cases left the chip row.** See CASES below.
 *
 * ## Law 6 — this screen asks for no money
 *
 * `listBookings` is called without `withDeposit`, so `deposit_required` is not
 * in the select at all. That is not a formality: the column is unmasked on the
 * base table and `bookings_select` is `auth_is_staff()`, which includes the
 * three money-blind roles, so the query refusing to ask is the only thing
 * standing between the floor and a rupee figure.
 */

/*
 * ── CASES ──────────────────────────────────────────────────────────────────
 *
 * TODO(decision): spec 03 §3.1 draws **five** chips — the four verbs plus
 * `(Cases 1)` — over "one time-ordered list". The audit
 * (`CONFLICTS.md` 03 §8) offered exactly two lawful readings and forbade the
 * third, which is what this file used to do: swap `<CasesQueue />` in for the
 * whole list when the chip was pressed, so the chip *replaced* the list
 * instead of filtering it.
 *
 * **Taken: drop Cases from the chip row; it keeps its own route.** The
 * projection was considered and rejected on three counts, each of which would
 * have meant inventing a value:
 *
 *  - **time** — the shared row is ordered by the instant a job is due
 *    (`pickup_at` / `return_at`). A `Case` (`data/cases.ts:234`) carries
 *    `openedAd`, which is when the incident was raised, not when anything is
 *    due. Sorting the two together orders one list by two different clocks.
 *  - **client** — the row's client column is the booking's client. A Case
 *    carries `counterpartyName`, which is a client *or a vendor or an
 *    insurer* (`counterpartyKind`). Rendering a vendor under "client" is a
 *    wrong label, not a projection.
 *  - **one query** — the four verb queues are server-side predicates over
 *    `bookings`. `CASES` is a seeded array in `data/cases.ts`. A merged list
 *    cannot be time-ordered by one query, and re-introducing an in-memory
 *    merge is the exact thing this file was rewritten to remove.
 *
 * The Cases page lives at `/inventory/cases` (see `CASES_ROUTE` below;
 * `/operations/cases` replace-redirects) and is linked from the chip strip,
 * so nothing is unreachable. Revisit if Cases gains a due instant and a
 * booking link.
 */
/* Open cases, off the same seed the Cases page lists — chip equals page. */
const openCases = CASES.filter((c) => isOpenStatus(c.status)).length

/**
 * The four verb chips. `QUEUES` still declares Cases; it is filtered out here,
 * not deleted there — `Queue.job` stays `JobName | 'Cases'` so nothing else
 * that reads the queue vocabulary has to change.
 */
type VerbQueue = Omit<Queue, 'job'> & { job: JobName }
const CHIPS: VerbQueue[] = QUEUES.filter((q): q is VerbQueue => q.job !== 'Cases')

/* ── Day scope ────────────────────────────────────────────────────────────
 *
 * §3.1's `[Today] [Tomorrow] [Custom ▾]`.
 *
 * Law 7: instants are stored AD/UTC and rendered in NPT, so a "day" on this
 * screen is a Kathmandu civil day converted back to a bounded instant range.
 * The offset string is FORMATTED from `bs.ts`'s `NPT_OFFSET_MIN` rather than
 * typed again — `queries/bookings.ts:657` does the same arithmetic for its own
 * private `startOfDay`/`endOfDay`, which are not exported.
 */
const NPT_OFFSET = `${NPT_OFFSET_MIN < 0 ? '-' : '+'}${String(Math.floor(Math.abs(NPT_OFFSET_MIN) / 60)).padStart(2, '0')}:${String(Math.abs(NPT_OFFSET_MIN) % 60).padStart(2, '0')}`

/** A `Date` → the Kathmandu civil day it falls on, `YYYY-MM-DD`. */
function nepalDay(ad: Date): string {
  return new Date(kathmanduCivil(ad)).toISOString().slice(0, 10)
}

/**
 * ⛔ This read a module-scope `TODAY = getBusinessToday()` (X-05). The day scope
 * is resolved once per import, so a tablet left on this screen across midnight
 * kept querying yesterday under chips reading Today and Tomorrow.
 * `getBusinessToday()` is called here instead, on every evaluation.
 */
function dayOffsetFromToday(days: number): string {
  return nepalDay(new Date(getBusinessToday().getTime() + days * 86_400_000))
}

export type DayScope = 'today' | 'tomorrow' | 'week' | 'next7' | 'custom'

const SCOPE_LABEL: Record<DayScope, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This Week',
  next7: 'Next 7 Days',
  custom: 'Custom',
}
/** The compact Operations picker intentionally keeps the four operational presets. */
const DISPLAY_SCOPE_ORDER: DayScope[] = ['today', 'tomorrow', 'next7', 'custom']

function scopeFromParam(param: string | null): DayScope {
  return param === 'tomorrow' || param === 'week' || param === 'next7' || param === 'custom' ? param : 'today'
}

/**
 * The scope as a `dateRange`, or `null` for "no constraint".
 *
 * Custom with neither end picked is deliberately `null` rather than an
 * open-ended range: it is the "all days" the page's own subtitle promises, and
 * an unbounded `dateRange` would be a filter that filters nothing while
 * telling `useList` the list is filtered.
 */
function scopeRange(scope: DayScope, from: string, to: string): { fromAd: string; toAd: string } | null {
  if (scope === 'today') {
    const d = dayOffsetFromToday(0)
    return { fromAd: `${d}T00:00:00.000${NPT_OFFSET}`, toAd: `${d}T23:59:59.999${NPT_OFFSET}` }
  }
  if (scope === 'tomorrow') {
    const d = dayOffsetFromToday(1)
    return { fromAd: `${d}T00:00:00.000${NPT_OFFSET}`, toAd: `${d}T23:59:59.999${NPT_OFFSET}` }
  }
  /*
   * The two multi-day scopes (added 30 Aug) delegate to `data/today.ts`'s
   * `periodRange`, which already states the app's two conventions in one
   * correctable place: This Week runs Monday→Sunday (CAL_WEEKDAYS starts on
   * MON; Saturday is the weekend day off, not the week's start), and Next 7
   * Days is today plus six — seven days INCLUDING today. Re-deriving either
   * here would be a second opinion waiting to disagree.
   */
  if (scope === 'week' || scope === 'next7') {
    const r = periodRange(scope === 'week' ? 'This Week' : 'Next 7 Days', dayOffsetFromToday(0))
    if (!r) return null
    return { fromAd: `${r.from}T00:00:00.000${NPT_OFFSET}`, toAd: `${r.to}T23:59:59.999${NPT_OFFSET}` }
  }
  if (!from && !to) return null
  return {
    ...(from ? { fromAd: `${from}T00:00:00.000${NPT_OFFSET}` } : {}),
    ...(to ? { toAd: `${to}T23:59:59.999${NPT_OFFSET}` } : {}),
  } as { fromAd: string; toAd: string }
}

/**
 * Bind the scope onto a filter set.
 *
 * The column is whichever the set already sorts by — `jobListFilters` picks
 * `pickup_at` for the two jobs that put gear out and `return_at` for the two
 * that bring it back, and the Due cell reads the same column. Filtering on the
 * sort column is what keeps "Today" meaning the same thing as the instant in
 * the row.
 */
function withScope(filters: ListFilters, range: { fromAd?: string; toAd?: string } | null): ListFilters {
  if (!range) return filters
  const column = filters.sort?.column ?? 'pickup_at'
  return { ...filters, dateRange: { column, ...range } }
}

/**
 * The one fetcher both the list and the four chip counts use.
 *
 * `withCount: true` on every call is what makes "one number, one source" true:
 * the number on a chip and the number in the list header are the same
 * server-side count of the same set, not two constants that can disagree.
 * **No `withDeposit`** — see Law 6 above.
 */
const fetchBookings = (filters: ListFilters) => listBookings({ ...filters, withCount: true })
const fetchQueueCount = (filters: ListFilters) => listBookings({ ...filters, headOnly: true })

/** One chip's count, scoped to the same day range the list is showing (pure HEAD count, no row joins). */
function useQueueCount(job: JobName, range: { fromAd?: string; toAd?: string } | null): ListResult<BookingListRow> {
  return useList<BookingListRow>(fetchQueueCount, withScope(queueCountFilters(job), range), { isFilteredOverride: false })
}

/* ── Law L3: The four-way exception facet group ─────────────────────────── */

export type ExceptionFacet = 'starting_today' | 'ending_today' | 'overdue_start' | 'overdue_end'

export const EXCEPTION_FACETS: Array<{ key: ExceptionFacet; label: string; icon: 'truck' | 'return_arrow' | 'alert_triangle' | 'timer' }> = [
  { key: 'starting_today', label: 'Starting today', icon: 'truck' },
  { key: 'ending_today', label: 'Ending today', icon: 'return_arrow' },
  { key: 'overdue_start', label: 'Overdue start', icon: 'alert_triangle' },
  { key: 'overdue_end', label: 'Overdue end', icon: 'timer' },
]

export function exceptionFilters(facet: ExceptionFacet, nowAd: string, todayAd: string): ListFilters {
  const dayStart = `${todayAd}T00:00:00.000${NPT_OFFSET}`
  const dayEnd = `${todayAd}T23:59:59.999${NPT_OFFSET}`

  switch (facet) {
    case 'starting_today':
      return {
        dateRange: { column: 'pickup_at', fromAd: dayStart, toAd: dayEnd },
        chips: { stage: ['Booked', 'Packed'] },
        presence: { cancelled_at: false },
        sort: { column: 'pickup_at', ascending: true },
      }
    case 'ending_today':
      return {
        dateRange: { column: 'return_at', fromAd: dayStart, toAd: dayEnd },
        chips: { stage: ['On Rent'] },
        presence: { cancelled_at: false },
        sort: { column: 'return_at', ascending: true },
      }
    case 'overdue_start':
      return {
        dateRange: { column: 'pickup_at', toAd: nowAd },
        chips: { stage: ['Booked', 'Packed'] },
        presence: { cancelled_at: false },
        sort: { column: 'pickup_at', ascending: true },
      }
    case 'overdue_end':
      return {
        dateRange: { column: 'return_at', toAd: nowAd },
        chips: { stage: ['On Rent'] },
        presence: { cancelled_at: false, actual_return_at: false },
        sort: { column: 'return_at', ascending: true },
      }
  }
}

/* ── Chips ─────────────────────────────────────────────────────────────── */

function chipStyle(on: boolean) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-sm)',
    minHeight: 44,
    padding: '0 14px',
    borderRadius: 'var(--r-btn)',
    border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
    background: on ? 'var(--nav-active-bg)' : 'var(--card)',
    color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
    fontSize: 'var(--t-meta)',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  }
}

interface QueueChipProps {
  queue: VerbQueue
  active: boolean
  total: number | null
  loading: boolean
  error: string | null
  onToggle: () => void
}

function QueueChip({ queue, active, total, loading, error, onToggle }: QueueChipProps) {
  const tok = queue.job === 'Reset' ? STATUS.progress : STATUS[statusToken(JOBS_META[queue.job].runsAt)]

  /*
   * The count, or an explicit non-value. `—` is not a zero and must not be
   * mistakable for one: it means this chip has no number to show, which
   * happens while a count query is in flight for the first time and when one
   * has failed. Never a plausible default.
   */
  const countText = loading && total === null ? '…' : total === null ? '—' : String(total)
  const countLabel =
    total === null ? `${queue.title}: no count available` : `${queue.title}: ${total} ${total === 1 ? 'job' : 'jobs'}`

  return (
    <button type="button" onClick={onToggle} aria-pressed={active} style={chipStyle(active)} {...(error ? { title: error } : {})}>
      {/* Law 11 — the queue's stage tone never carries the meaning alone; the icon and the word are both present. */}
      <Icon name={queue.icon} size={15} style={{ color: tok.fg, flexShrink: 0 }} />
      {queue.title}
      <span
        className="figure"
        aria-label={countLabel}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 22,
          height: 20,
          padding: '0 6px',
          borderRadius: 'var(--r-badge)',
          background: tok.bg,
          color: tok.fg,
          fontSize: 'var(--t-meta)',
          fontWeight: 700,
        }}
      >
        {countText}
      </span>
    </button>
  )
}

/** The stage badge — Law 11: icon **and** label **and** colour, never colour alone. */
function StageBadge({ stage }: { stage: JobRow['stage'] }) {
  const tok = STATUS[statusToken(stage)]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-xs)',
        height: 20,
        padding: '0 8px',
        borderRadius: 'var(--r-badge)',
        background: tok.bg,
        color: tok.fg,
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
      }}
    >
      <Icon name="dot" size={9} />
      {stage}
    </span>
  )
}

export default function OperationsQueues() {
  const { openOperations } = useOperationsWorkspace()
  const routeNavigate = useNavigate()
  // Keep the existing dense table render readable while changing its action
  // from URL navigation to the global modal host.
  const navigate = (route: string) => {
    const match = route.match(/^\/rentals\/([^/]+)\/(packing|handover|return|reset)$/)
    if (!match) { routeNavigate(route); return }
    const row = jobs.find((candidate) => candidate.bookingNo === match[1])
    if (row) openOperations(row.bookingNo, row.stage, row.job)
  }
  const [params, setParams] = useSearchParams()
  const [fastReturnOpen, setFastReturnOpen] = useState(false)
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [showDateMenu, setShowDateMenu] = useState(false)
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [selectedBookingNos, setSelectedBookingNos] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const queueSearchRef = useRef<HTMLInputElement | null>(null)
  const dateMenuRef = useRef<HTMLDivElement | null>(null)
  /* Law 13/14 — width decides, at v4.1 §7.7's 768 / 1280. */
  const viewport = useViewport()
  const tabular = viewport !== 'phone'

  /* The URL is the state (§5.1). `?queue=packing` and `?quick=pickup` are
     mutually exclusive — setting either clears the other — so a queue is
     linkable, shareable and survives a reload, and the sidebar child and the
     chip cannot disagree about which queue is open. `?day=` carries the scope
     alongside either. */
  const selected = queueFromParam(params.get('queue'))
  const group = groupFromParam(params.get('quick'))
  const scope = scopeFromParam(params.get('day'))
  const customFrom = params.get('from') ?? ''
  const customTo = params.get('to') ?? ''
  const exceptionParam = params.get('exception') as ExceptionFacet | null
  const exception = exceptionParam && ['starting_today', 'ending_today', 'overdue_start', 'overdue_end'].includes(exceptionParam) ? exceptionParam : null
  /* `queueFromParam` can still answer 'Cases' from a bookmarked URL. It is no
     longer a chip, so it selects nothing rather than swapping the list out. */
  const activeJob: JobName | null = selected === 'Cases' ? null : selected
  const range = scopeRange(scope, customFrom, customTo)
  const isFiltered = activeJob !== null || group !== null || range !== null || exception !== null

  const patch = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null) merged.delete(k)
      else merged.set(k, v)
    }
    setParams(merged)
  }

  const setActive = (job: JobName | null) => patch({ queue: job ? URL_KEY[job] : null, quick: null, exception: null })
  const setQuick = (q: 'pickup' | 'return') => patch({ quick: group === q ? null : q, queue: null, exception: null })
  const setScope = (s: DayScope) => patch({ day: s, ...(s === 'custom' ? {} : { from: null, to: null }) })
  const clearAllFilters = () => setParams(new URLSearchParams())
  const clearOperationFilters = () => {
    clearAllFilters()
    setSearchInput('')
    setSearch('')
    setClientFilter('all')
    setProjectFilter('all')
    setSelectedBookingNos(new Set())
  }

  /* Queue search stays local to the already server-filtered operation set and
     waits briefly between keystrokes, so scanning a booking number does not
     cause a render for every physical key press. */
  useEffect(() => {
    const timeout = window.setTimeout(() => setSearch(searchInput), 250)
    return () => window.clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowDateMenu(false)
        setShowMoreFilters(false)
      }
      if (event.key === '/' && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement)) {
        event.preventDefault()
        queueSearchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!showDateMenu) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!dateMenuRef.current?.contains(target)) setShowDateMenu(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [showDateMenu])

  const nowAd = businessNowAd()
  const todayNepal = dayOffsetFromToday(0)

  const activeFilters = useMemo(() => {
    if (exception) {
      return exceptionFilters(exception, nowAd, todayNepal)
    }
    return withScope(jobListFilters(activeJob, group), range)
  }, [exception, nowAd, todayNepal, activeJob, group, range])

  /*
   * The one list. Every predicate server-side: a queue chip → that queue's
   * stage; a group chip → the stage union of its two jobs; an exception facet →
   * the 4-way L3 exception filter; neither → all four verbs. The day scope
   * binds onto whichever of those is active.
   */
  const list = useList<BookingListRow>(fetchBookings, activeFilters, {
    isFilteredOverride: isFiltered,
  })

  /*
   * One count query per chip, four fixed calls in a fixed order — never a loop
   * over `CHIPS`, so the hook order cannot change between renders. Each asks
   * for a single row and reads `total`, so the cost is four counts, not four
   * lists.
   */
  const packCount = useQueueCount('Pack', range)
  const handoverCount = useQueueCount('Handover', range)
  const returnCount = useQueueCount('Return', range)
  const resetCount = useQueueCount('Reset', range)
  const counts: Record<JobName, ListResult<BookingListRow>> = {
    Pack: packCount,
    Handover: handoverCount,
    Return: returnCount,
    Reset: resetCount,
  }

  const alertsQ = useList<BookingListRow>(fetchBookings, overdue(nowAd), { isFilteredOverride: false })
  const quotesQ = useList<BookingListRow>(fetchBookings, quotesExpiring(nowAd), { isFilteredOverride: false })
  const alertRows = [
    ...alertsQ.rows.map((r) => overdueAlert(r, nowAd)),
    ...quotesQ.rows.map((r) => quoteLapsedAlert(r)),
  ]
  const retryAlerts = () => {
    alertsQ.refetch()
    quotesQ.refetch()
  }

  const refreshAll = () => {
    list.refetch()
    packCount.refetch()
    handoverCount.refetch()
    returnCount.refetch()
    resetCount.refetch()
    /* The Alerts panel lives on this page now — the header's Refresh must not
       leave it quoting stale exceptions beside a fresh queue list. */
    alertsQ.refetch()
    quotesQ.refetch()
  }

  const [lastLoadedAt, setLastLoadedAt] = useState<number>(() => Date.now())
  useEffect(() => {
    if (!list.loading) {
      setLastLoadedAt(Date.now())
    }
  }, [list.loading])

  /* Resolved once per render, and passed in, so the row mapping stays pure. */
  const now = Date.now()
  const jobs: JobRow[] = list.rows.flatMap((row) => {
    const j = toJobRow(row, now)
    return j ? [j] : []
  })
  const visibleJobs = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return jobs.filter((job) =>
      (clientFilter === 'all' || job.clientId === clientFilter) &&
      (projectFilter === 'all' || job.project === projectFilter) &&
      (!term || [job.bookingNo, job.clientName, job.project ?? '', job.stage, job.job].some((value) => value.toLocaleLowerCase().includes(term))),
    )
  }, [jobs, search, clientFilter, projectFilter])
  const clients = useMemo(() => Array.from(new Map(jobs.map((job) => [job.clientId, job.clientName])).entries()), [jobs])
  const projects = useMemo(() => Array.from(new Set(jobs.flatMap((job) => job.project ? [job.project] : []))).sort(), [jobs])
  const pageCount = Math.max(1, Math.ceil(visibleJobs.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const pagedJobs = visibleJobs.slice(currentPage * pageSize, currentPage * pageSize + pageSize)
  const allVisibleSelected = pagedJobs.length > 0 && pagedJobs.every((job) => selectedBookingNos.has(job.bookingNo))
  const operationFilterCount = [
    scope !== 'today',
    group !== null,
    exception !== null,
    clientFilter !== 'all',
    projectFilter !== 'all',
    search.trim() !== '',
  ].filter(Boolean).length
  useEffect(() => {
    setPage(0)
  }, [search, clientFilter, projectFilter, selected, group, exception, scope, pageSize])
  const toggleBooking = (bookingNo: string) => {
    setSelectedBookingNos((current) => {
      const next = new Set(current)
      if (next.has(bookingNo)) next.delete(bookingNo)
      else next.add(bookingNo)
      return next
    })
  }
  const toggleVisibleBookings = () => {
    setSelectedBookingNos((current) => {
      const next = new Set(current)
      if (allVisibleSelected) pagedJobs.forEach((job) => next.delete(job.bookingNo))
      else pagedJobs.forEach((job) => next.add(job.bookingNo))
      return next
    })
  }

  const listLabel = exception
    ? (EXCEPTION_FACETS.find((ef) => ef.key === exception)?.label ?? exception)
    : activeJob
      ? (CHIPS.find((q) => q.job === activeJob)?.title ?? activeJob)
      : group
        ? GROUP_LABEL[group]
        : 'All jobs'
  const scopeLabel = scope === 'custom' && !range ? 'all days' : SCOPE_LABEL[scope].toLowerCase()
  const emptyTitle = isFiltered ? `Nothing in ${listLabel} for ${scopeLabel}` : 'No jobs right now'
  const emptyMessage = activeJob
    ? 'This queue is clear for the selected days — widen the day scope or check back once the next booking reaches this stage.'
    : group
      ? 'Both queues on this side are clear for the selected days.'
      : 'No booking is sitting at a stage that has floor work in this range.'

  return (
    <PageShell width="full">
      <div
        className="operations-v2"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr)',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
      <div style={{ gridColumn: '1 / -1' }}>
        <PageHeader
          leading={
            <FilterButton
              onClick={() => setShowMoreFilters((open) => !open)}
              activeCount={operationFilterCount}
              controls="operations-filters"
              expanded={showMoreFilters}
            />
          }
          title="Operations"
          actions={
            <PageActions
              secondary={[
                <Button
                  key="sub-rentals"
                  variant="outline"
                  icon="box"
                  onClick={() => routeNavigate('/operations/sub-rental')}
                >
                  Sub-Rentals
                </Button>,
              ]}
              extra={<DataAgeBadge loadedAt={lastLoadedAt} onRefresh={refreshAll} loading={list.loading} />}
            />
          }
        />
      </div>

      <div
        style={{
          gridColumn: 1,
          gridRow: 2,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-md)',
        }}
      >

      <div className="operations-v2__queues" role="group" aria-label="Operational queues">
        {CHIPS.map((q) => <QueueChip key={q.job} queue={q} active={selected === q.job} total={counts[q.job].total} loading={counts[q.job].loading} error={counts[q.job].error} onToggle={() => setActive(selected === q.job ? null : q.job)} />)}
        <Link to="/inventory/cases" onClick={(event) => { event.preventDefault(); patch({ queue: selected === 'Cases' ? null : 'cases', quick: null }) }} aria-pressed={selected === 'Cases'} className="operations-v2__queue" style={{ ...chipStyle(selected === 'Cases'), textDecoration: 'none' }}>
          <Icon name="eye" size={15} style={{ color: STATUS.danger.fg }} /> Cases
          <span className="figure" style={{ minWidth: 22, padding: '1px 6px', borderRadius: 'var(--r-badge)', background: STATUS.danger.bg, color: STATUS.danger.fg, textAlign: 'center' }}>{openCases}</span>
        </Link>
      </div>

      <div className="operations-v2__filters" aria-label="Operations filters">
        <div ref={dateMenuRef} className="operations-v2__date-wrap">
          <Button variant="outline" icon="calendar" iconRight={<Icon name={showDateMenu ? 'chevron_up' : 'chevron_down'} size={14} />} onClick={() => setShowDateMenu((open) => !open)} aria-expanded={showDateMenu} aria-controls="operations-date-menu">
            {scope === 'custom' ? 'Custom range' : `${SCOPE_LABEL[scope]} · ${todayNepal}`}
          </Button>
          {showDateMenu && (
            <div id="operations-date-menu" className="operations-v2__popover operations-v2__date-popover">
              <div className="operations-v2__date-options" role="group" aria-label="Date range">
                {DISPLAY_SCOPE_ORDER.map((item) => <Button key={item} variant={scope === item ? 'secondary' : 'ghost'} size="sm" className="operations-v2__date-option" onClick={() => { setScope(item); setShowDateMenu(item === 'custom') }}>{SCOPE_LABEL[item]}</Button>)}
              </div>
              <div className="operations-v2__calendar-range">
                {scope === 'custom' ? <>
                  <CalendarPopover embedded showHeader={false} title="Custom range" range={{ from: customFrom, to: customTo }} onSelectRange={({ from, to }) => patch({ from: from || null, to: to || null })} onDismiss={() => setShowDateMenu(false)} />
                  <div className="operations-v2__custom-range">
                    <label>From<DateField ariaLabel="Queue from this day" value={customFrom} onChange={(value) => patch({ from: value || null })} showBs={false} clearable /></label>
                    <label>To<DateField ariaLabel="Queue up to this day" value={customTo} onChange={(value) => patch({ to: value || null })} showBs={false} clearable align="right" /></label>
                  </div>
                </> : <CalendarPopover embedded showHeader={false} title="Select a day" value={todayNepal} onSelect={(value) => patch({ day: 'custom', from: value, to: value })} onDismiss={() => setShowDateMenu(false)} />}
              </div>
            </div>
          )}
        </div>
        <div style={{ flex: '1 1 240px', minWidth: 180 }}>
          <SearchInput
            ref={queueSearchRef}
            value={searchInput}
            onChange={setSearchInput}
            onClear={() => setSearchInput('')}
            placeholder="Search ID, client, project…"
            aria-label="Search ID, client, project"
          />
        </div>
        <FilterButton
          onClick={() => setShowMoreFilters((open) => !open)}
          activeCount={operationFilterCount}
          controls="operations-filters"
          expanded={showMoreFilters}
        />
        {(isFiltered || search || clientFilter !== 'all' || projectFilter !== 'all') && <Button variant="ghost" onClick={clearOperationFilters}>Clear filters</Button>}
      </div>

      <AppPageToolbar
        bulkActions={selectedBookingNos.size > 0 ? <span className="figure">{selectedBookingNos.size} selected</span> : undefined}
        pagination={
          <Pagination
            page={currentPage + 1}
            total={visibleJobs.length}
            pageSize={pageSize}
            pageSizeOptions={[20, 50, 100]}
            onPageChange={(nextPage) => setPage(nextPage - 1)}
            onPageSizeChange={setPageSize}
          />
        }
      />

      {selected === 'Cases' ? <CasesWorkspace embedded /> : (
        <Card style={{ overflow: 'hidden' }} bodyStyle={{ padding: 0 }}>
          <PageBody
            loading={list.loading}
            error={list.error}
            onRetry={refreshAll}
            hasRows={jobs.length > 0}
            empty={list.isEmpty}
            emptyIsFiltered={list.isFiltered}
            onClearFilters={clearOperationFilters}
            noun="jobs"
            skeleton="table"
            skeletonRows={6}
            emptyTitle={emptyTitle}
            emptyMessage={emptyMessage}
          >
            {!tabular && (
              <div style={{ padding: 'var(--sp-sm)', display: 'grid', gap: 'var(--sp-sm)' }}>
                {pagedJobs.map((job) => (
                  <article
                    key={job.id}
                    style={{
                      ...cardStyle,
                      padding: '12px 14px',
                      display: 'grid',
                      gap: 8,
                      borderLeft: job.isPastDue ? '3px solid var(--danger)' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <Link to={`/rentals/${job.bookingNo}`} className="identifier" style={{ color: 'var(--link)', fontWeight: 700, textDecoration: 'none' }}>
                        {job.bookingNo}
                      </Link>
                      <StageBadge stage={job.stage} />
                    </div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>
                      <span style={{ fontWeight: 600 }}>{job.clientName}</span>
                      {job.project && <span style={{ color: 'var(--text2)' }}> · {job.project}</span>}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                      <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                        <span className="figure" style={{ fontWeight: job.isPastDue ? 700 : 500, color: job.isPastDue ? 'var(--danger-text)' : 'inherit' }}>
                          {formatDueAt(job.dueAtAd)}
                        </span>
                        {' · '}
                        <span className="figure">{job.itemCount}</span> items
                      </span>
                      <Button size="sm" variant="secondary" onClick={() => navigate(jobRoute(job.bookingNo, job.job))}>
                        {job.job}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {tabular && (
              <DataTableShell ariaLabel="Operations queues" data-table-scroll style={{ overflowX: 'auto' }}>
                <table className="operations-v2__table">
                  <thead>
                    <tr>
                      <th style={{ ...th, width: 44 }}>
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleVisibleBookings}
                          aria-label="Select visible bookings"
                        />
                      </th>
                      {['Booking', 'Client', 'Items', 'Stage', 'Time', 'Action', ''].map((heading, index) => (
                        <th key={heading || index} style={th}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedJobs.map((job) => (
                      <tr key={job.id} style={{ borderLeft: job.isPastDue ? '2px solid var(--danger)' : '2px solid transparent' }}>
                        <td style={{ ...td, width: 44 }}>
                          <input
                            type="checkbox"
                            checked={selectedBookingNos.has(job.bookingNo)}
                            onChange={() => toggleBooking(job.bookingNo)}
                            aria-label={`Select ${job.bookingNo}`}
                          />
                        </td>
                        <td style={td}>
                          <Link to={`/rentals/${job.bookingNo}`} className="identifier" style={{ color: 'var(--link)', fontWeight: 700, textDecoration: 'none' }}>
                            {job.bookingNo}
                          </Link>
                        </td>
                        <td style={td}>
                          <Link to={`/clients/${job.clientId}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
                            {job.clientName}
                          </Link>
                          {job.project && (
                            <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: 2 }}>
                              {job.project}
                            </div>
                          )}
                        </td>
                        <td className="figure" style={{ ...td, fontWeight: 600 }}>{job.itemCount}</td>
                        <td style={td}>
                          <StageBadge stage={job.stage} />
                        </td>
                        <td className="figure" style={{ ...td, fontWeight: job.isPastDue ? 700 : 500, color: job.isPastDue ? 'var(--danger-text)' : 'var(--text)' }}>
                          {formatDueAt(job.dueAtAd)}
                        </td>
                        <td style={td}>
                          <Button size="sm" variant="secondary" onClick={() => navigate(jobRoute(job.bookingNo, job.job))}>
                            {job.job}
                          </Button>
                        </td>
                        <td style={{ ...td, width: 44 }}>
                          <Link to={`/rentals/${job.bookingNo}`} aria-label={`More for booking ${job.bookingNo}`} style={{ color: 'var(--muted)', display: 'inline-flex', alignItems: 'center' }}>
                            <Icon name="chevron_right" size={18} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {jobs.length > 0 && visibleJobs.length === 0 && (
                  <div className="operations-v2__empty-search">No jobs match “{search}”.</div>
                )}
              </DataTableShell>
            )}
          </PageBody>
          <div style={{ padding: 'var(--sp-md)', borderTop: '1px solid var(--border)' }}>
            <Pagination
              page={currentPage + 1}
              total={visibleJobs.length}
              pageSize={pageSize}
              pageSizeOptions={[20, 50, 100]}
              onPageChange={(nextPage) => setPage(nextPage - 1)}
              onPageSizeChange={setPageSize}
            />
          </div>
        </Card>
      )}
      </div>

      <FastReturnModal isOpen={fastReturnOpen} onClose={() => setFastReturnOpen(false)} onSuccess={refreshAll} />
      <BarcodeLookupModal isOpen={barcodeModalOpen} onClose={() => setBarcodeModalOpen(false)} />
      <WorkspaceLeftPanel>
      <AppSidePanel
        id="operations-filters"
        side="left"
        title={`Filters · ${visibleJobs.length} ${visibleJobs.length === 1 ? 'job' : 'jobs'}`}
        isOpen={showMoreFilters}
        onClose={() => setShowMoreFilters(false)}
        footer={
          <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
            <Button onClick={clearOperationFilters} disabled={operationFilterCount === 0}>Reset</Button>
            <Button variant="primary" onClick={() => setShowMoreFilters(false)}>Apply</Button>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 'var(--sp-xs)' }}>
          <FilterSection title="Date range">
            <div className="operations-v2__facet-grid">
              {DISPLAY_SCOPE_ORDER.map((item) => (
                <Button
                  key={item}
                  variant={scope === item ? 'secondary' : 'ghost'}
                  size="sm"
                  className="operations-v2__facet"
                  onClick={() => setScope(item)}
                >
                  {SCOPE_LABEL[item]}
                </Button>
              ))}
            </div>
            {scope === 'custom' && (
              <div className="operations-v2__custom-range" style={{ marginTop: 'var(--sp-sm)' }}>
                <label>From<DateField ariaLabel="Queue from this day" value={customFrom} onChange={(value) => patch({ from: value || null })} showBs={false} clearable /></label>
                <label>To<DateField ariaLabel="Queue up to this day" value={customTo} onChange={(value) => patch({ to: value || null })} showBs={false} clearable align="right" /></label>
              </div>
            )}
          </FilterSection>

          <FilterSection title="Queue side">
            <div className="operations-v2__facet-grid">
              {(['pickup', 'return'] as const).map((item) => (
                <Button key={item} variant={group === item ? 'secondary' : 'ghost'} size="sm" className="operations-v2__facet" onClick={() => setQuick(item)}>
                  {GROUP_LABEL[item]}
                </Button>
              ))}
            </div>
          </FilterSection>

          <FilterSection title="Client and project">
            <div style={{ display: 'grid', gap: 'var(--sp-sm)' }}>
              <label style={{ display: 'grid', gap: 4, color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
                Client
                <select className="operations-v2__filter-select" aria-label="Drawer client filter" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
                  <option value="all">All clients</option>
                  {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
                Project
                <select className="operations-v2__filter-select" aria-label="Drawer project filter" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
                  <option value="all">All projects</option>
                  {projects.map((project) => <option key={project} value={project}>{project}</option>)}
                </select>
              </label>
            </div>
          </FilterSection>

          <FilterSection title="Attention required">
            <div className="operations-v2__facet-grid">
              {EXCEPTION_FACETS.map((facet) => {
                const isActive = exception === facet.key
                return (
                  <Button
                    key={facet.key}
                    variant={isActive ? 'secondary' : 'ghost'}
                    size="sm"
                    className="operations-v2__facet"
                    icon={facet.icon}
                    onClick={() => patch({ exception: isActive ? null : facet.key, queue: null, quick: null })}
                  >
                    {facet.label}
                  </Button>
                )
              })}
            </div>
          </FilterSection>

          <FilterSection title="Alerts" defaultOpen={false}>
            <AlertsPanel alerts={alertRows} loading={alertsQ.loading || quotesQ.loading} error={alertsQ.error ?? quotesQ.error} onRetry={retryAlerts} />
          </FilterSection>
        </div>
      </AppSidePanel>
      </WorkspaceLeftPanel>
      <div style={{ gridColumn: '1 / -1' }}>
        <FooterNote extra={['Queues are stages — no page defines its own status names']} />
      </div>
    </div>
    </PageShell>
  )
}
