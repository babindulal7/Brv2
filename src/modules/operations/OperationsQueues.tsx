import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, Rail, FooterNote, cardStyle } from '../../components/ui/Page'
import { PageBody } from '../../components/ui/PageBody'
import { STATUS } from '../../lib/status'
import { statusToken, JOBS as JOBS_META, type JobName } from '../../lib/workflow'
import { listBookings, type BookingListRow } from '../../lib/queries/bookings'
import { useList, type ListResult } from '../../lib/queries/useList'
import type { ListFilters } from '../../lib/queries/listQuery'
import {
  QUEUES,
  GROUP_LABEL,
  NO_MONEY_NOTE,
  URL_KEY,
  formatDueAt,
  groupFromParam,
  jobListFilters,
  jobRoute,
  queueCountFilters,
  queueFromParam,
  toJobRow,
  type JobRow,
  type Queue,
} from '../../data/operations'
import { useViewport } from '../../lib/device'
import { kathmanduCivil, NPT_OFFSET_MIN, TODAY } from '../../lib/bs'

const th = {
  textAlign: 'left' as const,
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
const td = { padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }

/**
 * **Floor** — spec 03 §3.1, `/operations`.
 *
 * > *"queue chips filter one time-ordered list"*
 *
 * That sentence is the whole screen, and it is what this rebuild implements.
 * The chip row selects a predicate; the list underneath is always the same
 * list, ordered by the instant each job is due. Three layouts:
 *
 *  - **desktop ≥1180** — chips, then the table, then a right rail;
 *  - **tablet 768–1179** — chips, then the same table, then the rail's content
 *    **inline beneath it**. Rulings §7: *"right rails collapse below 1180"
 *    means reflow, not hide* — so the rail is not wrapped in `Rail`
 *    (`CollapsibleAside`) at this width, because that hides it behind a 28px
 *    handle, which is not what §3.1's tablet drawing shows;
 *  - **phone <768** — the table becomes card rows, rail content still inline.
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
 * `/operations/cases` already exists (`App.tsx:364`) and is linked from the
 * header below, so nothing is unreachable. Revisit if Cases gains a due
 * instant and a booking link.
 */
const CASES_ROUTE = '/operations/cases'

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

function dayOffsetFromToday(days: number): string {
  return nepalDay(new Date(TODAY.getTime() + days * 86_400_000))
}

export type DayScope = 'today' | 'tomorrow' | 'custom'

const SCOPE_LABEL: Record<DayScope, string> = { today: 'Today', tomorrow: 'Tomorrow', custom: 'Custom' }
const SCOPE_ORDER: DayScope[] = ['today', 'tomorrow', 'custom']

function scopeFromParam(param: string | null): DayScope {
  return param === 'tomorrow' || param === 'custom' ? param : 'today'
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

/** One chip's count, scoped to the same day range the list is showing. */
function useQueueCount(job: JobName, range: { fromAd?: string; toAd?: string } | null): ListResult<BookingListRow> {
  return useList<BookingListRow>(fetchBookings, withScope(queueCountFilters(job), range), { isFilteredOverride: false })
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
  const tok = STATUS[statusToken(JOBS_META[queue.job].runsAt)]

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
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  /* Law 13/14 — width decides, at Foundation's locked 768 / 1180. */
  const viewport = useViewport()
  const tabular = viewport !== 'phone'
  const railBesideList = viewport === 'desktop'

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
  /* `queueFromParam` can still answer 'Cases' from a bookmarked URL. It is no
     longer a chip, so it selects nothing rather than swapping the list out. */
  const activeJob: JobName | null = selected === 'Cases' ? null : selected
  const range = scopeRange(scope, customFrom, customTo)
  const isFiltered = activeJob !== null || group !== null || range !== null

  const patch = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null) merged.delete(k)
      else merged.set(k, v)
    }
    setParams(merged)
  }

  const setActive = (job: JobName | null) => patch({ queue: job ? URL_KEY[job] : null, quick: null })
  const setQuick = (q: 'pickup' | 'return') => patch({ quick: group === q ? null : q, queue: null })
  const setScope = (s: DayScope) => patch({ day: s, ...(s === 'custom' ? {} : { from: null, to: null }) })
  const clearAllFilters = () => setParams(new URLSearchParams())

  /*
   * The one list. Every predicate server-side: a queue chip → that queue's
   * stage; a group chip → the stage union of its two jobs; neither → all four
   * verbs. The day scope binds onto whichever of those is active.
   *
   * `isFilteredOverride` is the same boolean that decides whether "Clear
   * filter" is live, and it is required rather than optional here: selecting a
   * chip REPLACES the whole filter set rather than adding to one, so a
   * baseline comparison cannot answer the question.
   */
  const list = useList<BookingListRow>(fetchBookings, withScope(jobListFilters(activeJob, group), range), {
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

  const refreshAll = () => {
    list.refetch()
    packCount.refetch()
    handoverCount.refetch()
    returnCount.refetch()
    resetCount.refetch()
  }

  /* Resolved once per render, and passed in, so the row mapping stays pure. */
  const now = Date.now()
  const jobs: JobRow[] = list.rows.flatMap((row) => {
    const j = toJobRow(row, now)
    return j ? [j] : []
  })

  const listLabel = activeJob
    ? (CHIPS.find((q) => q.job === activeJob)?.title ?? activeJob)
    : group
      ? GROUP_LABEL[group]
      : 'All jobs'
  const scopeLabel = scope === 'custom' && !range ? 'all days' : SCOPE_LABEL[scope].toLowerCase()
  /* No count until one has arrived: `total` is null on a first load, and
     "— 0 jobs" over a skeleton is a claim, not a placeholder. */
  const countSuffix = list.total === null ? '' : ` — ${list.total} ${list.total === 1 ? 'job' : 'jobs'}`

  const emptyTitle = isFiltered ? `Nothing in ${listLabel} for ${scopeLabel}` : 'No jobs right now'
  const emptyMessage = activeJob
    ? 'This queue is clear for the selected days — widen the day scope or check back once the next booking reaches this stage.'
    : group
      ? 'Both queues on this side are clear for the selected days.'
      : 'No booking is sitting at a stage that has floor work in this range.'

  const railContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
      {/*
        Rulings §8 words the remedy for an invented figure as *"each renders
        'not tracked yet' until a real source exists"* — and §1 keeps a panel
        no spec removes in prose. `CREW_LOAD`'s four invented people with
        invented open/capacity figures were rightly diagnosed (see
        `data/operations.ts`), but the card was deleted rather than emptied,
        which is the one place this rebuild answered a fabrication by removal
        instead of honesty. Restored as the empty state, naming what it needs,
        so the operator learns the gap rather than losing the panel silently.
        Finance's P&L rows and Calendar's Utilization tile carry exactly this
        treatment.
      */}
      <Card title="Crew Load">
        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
          Not tracked yet — a per-person warehouse-job load needs an assignment this schema does not carry.
          {' '}
          <code style={{ fontFamily: 'inherit' }}>booking_crew_lines</code> is priced crew hired for the shoot, and
          {' '}
          <code style={{ fontFamily: 'inherit' }}>cleaning_queue_entries.assigned_to</code> covers cleaning only.
          Neither says who is working a Packing, Handover, Return or Reset job.
        </p>
      </Card>

      <div
        style={{
          ...cardStyle,
          padding: 'var(--sp-md)',
          display: 'flex',
          gap: 7,
          alignItems: 'flex-start',
          fontSize: 'var(--t-meta)',
          color: 'var(--muted)',
          lineHeight: 1.5,
        }}
      >
        <Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        {NO_MONEY_NOTE}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="queues"
        title="Operation"
        description="One floor list for every day. Queue chips filter it; they never replace it."
        actions={
          <>
            {/* §3.1 header — the day scope. */}
            <div role="group" aria-label="Day scope" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SCOPE_ORDER.map((s) => (
                <button key={s} type="button" onClick={() => setScope(s)} aria-pressed={scope === s} style={chipStyle(scope === s)}>
                  {SCOPE_LABEL[s]}
                  {s === 'custom' && <Icon name="chevron_down" size={13} />}
                </button>
              ))}
            </div>
            <Button icon="refresh" onClick={refreshAll}>
              Refresh
            </Button>
          </>
        }
      />

      {scope === 'custom' && (
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', padding: '10px 14px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            From
            <input
              type="date"
              value={customFrom}
              onChange={(e) => patch({ from: e.target.value || null })}
              style={{ minHeight: 44, padding: '0 9px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            To
            <input
              type="date"
              value={customTo}
              onChange={(e) => patch({ to: e.target.value || null })}
              style={{ minHeight: 44, padding: '0 9px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
            />
          </label>
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
            {range ? 'Dates are Kathmandu civil days; the stored instants are UTC.' : 'No dates picked — showing every day.'}
          </span>
        </div>
      )}

      {/*
        Two shortcuts across the chip row: Pickup Today groups Pack + Handover
        (gear going out), Return Today groups Return + Reset (gear coming
        back). Despite the labels these are NOT a date filter — that is the day
        scope above — they are a stage union, and they are sent to the server
        as one.
      */}
      <div role="group" aria-label="Group queues by pickup or return side" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['pickup', 'return'] as const).map((q) => (
          <button key={q} type="button" onClick={() => setQuick(q)} aria-pressed={group === q} style={chipStyle(group === q)}>
            {GROUP_LABEL[q]}
          </button>
        ))}
      </div>

      {/* §3.1 — the chip row. One list below it, always. */}
      <div
        role="group"
        aria-label="Queues"
        style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: tabular ? 'wrap' : 'nowrap', overflowX: tabular ? 'visible' : 'auto', paddingBottom: tabular ? 0 : 4 }}
      >
        {CHIPS.map((q) => (
          <QueueChip
            key={q.job}
            queue={q}
            active={selected === q.job}
            total={counts[q.job].total}
            loading={counts[q.job].loading}
            error={counts[q.job].error}
            onToggle={() => setActive(selected === q.job ? null : q.job)}
          />
        ))}
        {/* Cases is a queue with its own owner and its own route — see the CASES note above. */}
        <Link to={CASES_ROUTE} style={{ ...chipStyle(false), textDecoration: 'none' }}>
          <Icon name="eye" size={15} style={{ flexShrink: 0 }} />
          Cases
          <Icon name="external_link" size={13} />
        </Link>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: railBesideList ? 'minmax(0,1fr) auto' : '1fr',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        <Card
          title={`${listLabel}${countSuffix}`}
          action={isFiltered ? <Button onClick={clearAllFilters}>Clear filter</Button> : undefined}
          bodyStyle={{ padding: tabular ? 0 : 10 }}
        >
          {/*
            Fixed ladder: restricted → error → loading → empty → children.

            `hasRows` is what keeps a failed REFRESH from blanking a queue
            someone is working: with rows on screen the banner renders above
            them instead of replacing them.
          */}
          <PageBody
            loading={list.loading}
            error={list.error}
            onRetry={refreshAll}
            hasRows={jobs.length > 0}
            empty={list.isEmpty}
            emptyIsFiltered={list.isFiltered}
            onClearFilters={clearAllFilters}
            noun="jobs"
            skeleton="table"
            skeletonRows={5}
            emptyTitle={emptyTitle}
            emptyMessage={emptyMessage}
          >
            {/* PHONE <768 — the table becomes card rows, one primary action each. */}
            {!tabular && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                {jobs.map((j) => (
                  <article
                    key={j.id}
                    style={{
                      ...cardStyle,
                      padding: 'var(--sp-md)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      borderLeft: j.isPastDue ? '2px solid var(--danger)' : '1px solid var(--border)',
                    }}
                  >
                    {/* §3.1 phone card — time, then BR#, then client, then badge + action. */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-sm)' }}>
                      <span
                        className="figure"
                        style={{ fontWeight: 700, color: j.isPastDue ? 'var(--danger-text)' : 'var(--text)' }}
                      >
                        {formatDueAt(j.dueAtAd)}
                      </span>
                      {/* The verb, not a second identifier. Ruling §2.1 — the booking's
                          own number is the only number this card carries. */}
                      <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>{j.job}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)' }}>
                      <Link to={`/rentals/${j.bookingNo}`} className="identifier" style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }}>
                        {j.bookingNo}
                      </Link>
                      <span style={{ color: 'var(--muted)' }}>·</span>
                      {/* The client id comes off the booking row itself, so the link is
                          the booking's own client rather than a lookup that can miss. */}
                      <Link to={`/clients/${j.clientId}`} style={{ color: 'inherit', textDecoration: 'none', minWidth: 0 }}>
                        <span style={{ color: 'var(--text2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {j.clientName}
                        </span>
                      </Link>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                      <StageBadge stage={j.stage} />
                      <span style={{ color: 'var(--muted)' }}>
                        {j.itemCount} {j.itemCount === 1 ? 'item' : 'items'}
                      </span>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.project ?? '—'}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => navigate(jobRoute(j.bookingNo, j.job))}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        minHeight: 44,
                        marginTop: 2,
                        borderRadius: 'var(--r-btn)',
                        border: '1px solid transparent',
                        background: 'var(--btn-primary-bg)',
                        color: 'var(--btn-primary-fg)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      {j.job}
                    </button>
                  </article>
                ))}
              </div>
            )}

            {/* DESKTOP + TABLET — time │ BR# │ client │ items │ stage badge │ [verb] ⋮ */}
            {tabular && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      {['Time', 'Booking', 'Client', 'Project', 'Items', 'Stage', 'Action', ''].map((h, i) => (
                        <th key={h || i} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((j) => (
                      <tr
                        key={j.id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          borderLeft: j.isPastDue ? '2px solid var(--danger)' : '2px solid transparent',
                        }}
                      >
                        <td
                          className="figure"
                          style={{ ...td, color: j.isPastDue ? 'var(--danger-text)' : 'var(--text)', fontWeight: j.isPastDue ? 700 : 600 }}
                        >
                          {formatDueAt(j.dueAtAd)}
                        </td>
                        <td style={td}>
                          <Link to={`/rentals/${j.bookingNo}`} className="identifier" style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none', fontSize: 'var(--t-meta)' }}>
                            {j.bookingNo}
                          </Link>
                        </td>
                        <td style={td}>
                          <Link to={`/clients/${j.clientId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                            {j.clientName}
                          </Link>
                        </td>
                        {/* `project` is nullable (0002:28). A null renders as an explicit
                            non-value — never as a kit name, which is what this column
                            used to invent. */}
                        <td style={{ ...td, color: 'var(--text2)' }}>{j.project ?? '—'}</td>
                        <td className="figure" style={{ ...td, color: 'var(--text2)' }}>{j.itemCount}</td>
                        <td style={td}>
                          <StageBadge stage={j.stage} />
                        </td>
                        <td style={td}>
                          <Button variant="primary" onClick={() => navigate(jobRoute(j.bookingNo, j.job))}>
                            {j.job}
                          </Button>
                        </td>
                        <td style={{ ...td, width: 44 }}>
                          <Link
                            to={`/rentals/${j.bookingNo}`}
                            aria-label={`More for booking ${j.bookingNo}`}
                            style={{ display: 'inline-grid', placeItems: 'center', width: 44, height: 44, color: 'var(--muted)' }}
                          >
                            <Icon name="more_vert" size={16} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PageBody>
        </Card>

        {/* Rulings §7 — below 1180 the rail REFLOWS beneath the list; it does not
            hide behind `CollapsibleAside`'s handle. */}
        {railBesideList ? <Rail>{railContent}</Rail> : railContent}
      </div>

      <FooterNote extra={['Queues are stages — no page defines its own status names']} />
    </div>
  )
}
