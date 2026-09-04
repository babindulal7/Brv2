import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import Icon from './Icon'
import { Button } from './Page'
import { DateField } from './DateField'
import { csvCell } from '../../lib/csv'
import { NPT_OFFSET_MIN, getBusinessToday, kathmanduCivil, toBs, formatBs, formatAd } from '../../lib/bs'
import type { ListFilters } from '../../lib/queries/listQuery'

/*
 * The operating day, resolved once when this module loads, from the real
 * clock in Kathmandu (`lib/bs.ts`'s `getBusinessToday`). It replaced an
 * imported `TODAY` constant frozen at 31 Jul 2026.
 */
const TODAY = getBusinessToday()


/**
 * # The one report toolbar — `date range · branch · compare · CSV · print`
 *
 * `09_FINANCE.md` §9.7: *"Toolbar is shared. Building it once gives all 45
 * filters and export."* Before this file there were six Export buttons with no
 * `onClick`, two Compare buttons with no `onClick`, three chip rows that set
 * `useState` and filtered nothing, and exactly one working export (`Pulse`'s,
 * with its own hand-rolled CSV quoter). Every one of those is a control that
 * says it does something and does not.
 *
 * ## The rule this component is built on
 *
 * **A control renders only when the page has given it something real to do.**
 * There is no `showDateRange` boolean and no `disabled` styling: pass
 * `dateColumn` and the date control exists, omit it and the toolbar simply has
 * no date control. That is why the props are shaped as capabilities rather than
 * flags — a page cannot accidentally ask for a filter it cannot honour, and a
 * reader of a report cannot be shown a filter that moves nothing.
 *
 * It is also why several of the adopting screens pass only `csv` and print
 * today: their figures are single pre-aggregated constants in `src/data/` with
 * no date or branch dimension to filter on. A date picker over those would
 * change the label and not one number on the page. When those reports read
 * Postgres they gain the filters by passing two more props, and this file does
 * not change.
 *
 * ## What it emits
 *
 * `ListFilters`-shaped output — `dateRange` and `chips`, the two members of
 * `lib/queries/listQuery`'s filter set that a report toolbar owns — so a screen
 * hands it straight to `useList`:
 *
 * ```ts
 * const [filters, setFilters] = useState<ReportFilters>({})
 * const list = useList(listExpenses, { ...base, ...filters }, { baseline: base })
 * <ReportToolbar title="Expenses" value={filters} onChange={setFilters} dateColumn="expense_date" … />
 * ```
 *
 * Controlled on purpose. The page needs the filter values anyway (it queries
 * with them), so a second copy inside the toolbar could only ever disagree with
 * the first. The *preset* is likewise not stored — it is derived from the range,
 * so a page that restores a saved range gets the matching preset selected for
 * free and an arbitrary one reads as "Custom range".
 *
 * ## Law 7 — one offset, and only day windows
 *
 * `fromAd`/`toAd` are emitted as **Nepal day-boundary instants**
 * (`2026-07-01T00:00:00.000+05:45`), not bare `YYYY-MM-DD`. A bare day is read
 * by Postgres as midnight UTC, which is 05:45 in Kathmandu, so `lte(col,
 * '2026-07-31')` silently drops all but the first six hours of the last day —
 * the exact defect `queries/bookings.ts` documents at its `startOfDay` /
 * `endOfDay` pair. The `+05:45` string is FORMATTED from `bs.ts`'s one
 * `NPT_OFFSET_MIN` rather than typed again, the same way
 * `modules/operations/OperationsQueues.tsx` does it.
 *
 * The presets are deliberately **rolling day windows only** — 7 / 30 / 90 days
 * and Custom. `PERIOD_CHIPS` in `data/expenseReports.ts` also lists "This
 * Month", "This Quarter", "Financial Year"; none of those can be computed
 * correctly here. This business runs on BS months and a BS fiscal year (the
 * header pill says FY 2083/84), and `lib/bs.ts` can only vouch for Shrawan 2083
 * — `toBs` returns `null` everywhere else. Offering "This Month" would mean
 * silently substituting an AD calendar month for the BS one the operator meant.
 * A day window is calendar-system-neutral and cannot be wrong either way.
 *
 * TODO(decision): BS month / quarter / fiscal-year presets. They need a BS
 * calendar table wider than one month before they can be offered at all; adding
 * them as AD months in the meantime is the substitution described above.
 *
 * ## Not here
 *
 * **Compare is a toggle, not a calculation.** The toolbar renders the control
 * and reports the choice; producing the comparison figures is the report's own
 * work, because only the report knows what "previous period" means for its
 * data. `Pulse` has `previousPeriod()` and so passes the control; a report with
 * no prior-period source does not pass it, and therefore does not offer it.
 *
 * **Saved views and Schedule report** are not built. `ClientReports` drew both
 * as dead buttons; they are removed rather than carried across.
 */

/* ── the emitted shape ─────────────────────────────────────────────────── */

/**
 * The two members of `ListFilters` a report toolbar owns. Assignable straight
 * into a `useList` filter set — `{ ...baseline, ...filters }`.
 */
export type ReportFilters = Pick<ListFilters, 'dateRange' | 'chips'>

/** Compare is off, or against the period immediately before this one. */
export type ReportCompare = 'off' | 'previous'

/** One CSV line, before quoting. Numbers are stringified by `csvCell`. */
export type ReportCsvRow = readonly (string | number)[]

export interface ReportCsvSpec {
  /**
   * Filename stem. The toolbar appends the selected range (or the generation
   * day when the range is All dates) and `.csv`.
   */
  filename: string
  /**
   * Builds the body, on click rather than on render — a report table should not
   * be serialised into a string on every keystroke in the search box.
   *
   * Return the rows exactly as they should appear, header rows included. An
   * empty row (`[]`) becomes a blank line, which is how a multi-section export
   * separates its sections.
   */
  build: () => ReportCsvRow[]
  /**
   * Who pressed the button, for the provenance header. Omitted rather than
   * guessed when the screen has no session in hand — a CSV that names the wrong
   * operator is worse than one that names none.
   */
  generatedBy?: string | undefined
}

/* ── day arithmetic ────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000

/**
 * `+05:45`, formatted from `bs.ts`'s one `NPT_OFFSET_MIN`. Law 7: never a second
 * literal. `queries/bookings.ts`, `queries/finance.ts` and `OperationsQueues`
 * all derive it the same way.
 */
const NPT_OFFSET = `${NPT_OFFSET_MIN < 0 ? '-' : '+'}${String(Math.floor(Math.abs(NPT_OFFSET_MIN) / 60)).padStart(
  2,
  '0',
)}:${String(Math.abs(NPT_OFFSET_MIN) % 60).padStart(2, '0')}`

/** An instant → the `YYYY-MM-DD` it falls on **in Kathmandu**. */
function civilDay(ad: Date): string {
  return new Date(kathmanduCivil(ad)).toISOString().slice(0, 10)
}

function shiftDays(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + delta * DAY_MS).toISOString().slice(0, 10)
}

/**
 * The day a bound refers to. Both shapes this toolbar can receive — its own
 * `2026-07-01T00:00:00.000+05:45` and a plain `2026-07-01` a page might hold —
 * start with the Nepal day, so the first ten characters are it.
 */
function dayOf(bound: string | undefined): string | null {
  if (!bound) return null
  const day = bound.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

const startOfNepalDay = (day: string) => `${day}T00:00:00.000${NPT_OFFSET}`
const endOfNepalDay = (day: string) => `${day}T23:59:59.999${NPT_OFFSET}`

/** A `YYYY-MM-DD` back to the `Date` the label formatters take. */
function dayToDate(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00.000Z`))
}

/* ── helpers a report page needs to agree with the toolbar ─────────────── */

/** A `Date`, a bound this toolbar emitted, or a bare day → the Kathmandu day. */
function anyToDay(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? civilDay(value) : dayOf(value)
}

/**
 * Builds the same `dateRange` the toolbar emits, for a screen that needs to
 * START on a range rather than on All dates.
 *
 * Exported because the alternative is a page hand-writing
 * `{ fromAd: period.from.toISOString() }`, which is a bare UTC instant and
 * therefore a different window from the one the toolbar produces for the same
 * two days — the two would disagree the moment the operator touched the control.
 */
export function reportDateRange(
  column: string,
  from: Date | string | null | undefined,
  to: Date | string | null | undefined,
): ListFilters['dateRange'] {
  const fromDay = anyToDay(from)
  const toDayValue = anyToDay(to)
  if (!fromDay && !toDayValue) return undefined
  return {
    column,
    ...(fromDay ? { fromAd: startOfNepalDay(fromDay) } : {}),
    ...(toDayValue ? { toAd: endOfNepalDay(toDayValue) } : {}),
  }
}

/**
 * Whether an instant falls inside a toolbar range.
 *
 * For the reports that still filter an in-memory array from `src/data/` rather
 * than querying Postgres. `applyListFilters` compares gte/lte on the server;
 * this is the identical comparison on the client, in one place, so a screen
 * cannot quietly implement a half-open version of the same window.
 */
export function withinReportRange(when: Date, range: ListFilters['dateRange']): boolean {
  if (!range) return true
  const t = when.getTime()
  if (range.fromAd && t < Date.parse(range.fromAd)) return false
  if (range.toAd && t > Date.parse(range.toAd)) return false
  return true
}

/* ── presets ───────────────────────────────────────────────────────────── */

/**
 * Rolling windows ending on the app's one `TODAY` (`lib/bs.ts`), which is the
 * seeded operating day and becomes the real clock when data is wired. Reading
 * the system clock here instead would put every preset on a different day from
 * every other date on the screen.
 */
export const REPORT_RANGE_PRESETS = [
  { key: 'all', label: 'All dates', days: null },
  { key: 'last7', label: 'Last 7 days', days: 7 },
  { key: 'last30', label: 'Last 30 days', days: 30 },
  { key: 'last90', label: 'Last 90 days', days: 90 },
] as const

export type ReportRangePresetKey = (typeof REPORT_RANGE_PRESETS)[number]['key'] | 'custom'

function presetWindow(days: number): { fromDay: string; toDay: string } {
  const toDay = civilDay(TODAY)
  // Inclusive at both ends, so "Last 7 days" is seven days including today, not
  // eight. `applyListFilters` compares with gte/lte for the same reason.
  return { fromDay: shiftDays(toDay, -(days - 1)), toDay }
}

/**
 * Which preset produced this range — derived rather than stored, so there is no
 * second copy of the selection to fall out of step with the range itself.
 */
function presetOf(range: ReportFilters['dateRange']): ReportRangePresetKey {
  const fromDay = dayOf(range?.fromAd)
  const toDay = dayOf(range?.toAd)
  if (!fromDay && !toDay) return 'all'
  for (const preset of REPORT_RANGE_PRESETS) {
    if (preset.days === null) continue
    const window = presetWindow(preset.days)
    if (window.fromDay === fromDay && window.toDay === toDay) return preset.key
  }
  return 'custom'
}

/* ── labels ────────────────────────────────────────────────────────────── */

/** Plain-text period, for the CSV provenance header. */
function periodText(range: ReportFilters['dateRange']): string {
  const fromDay = dayOf(range?.fromAd)
  const toDay = dayOf(range?.toAd)
  if (!fromDay && !toDay) return 'All dates'
  if (fromDay && !toDay) return `${formatAd(dayToDate(fromDay))} onwards`
  if (!fromDay && toDay) return `up to ${formatAd(dayToDate(toDay))}`
  return `${formatAd(dayToDate(fromDay as string))} – ${formatAd(dayToDate(toDay as string))}`
}

/**
 * BS leads, AD follows — Foundation §03, the same pair `Pulse` draws. When the
 * Date Engine cannot vouch for the BS side of a bound it says so rather than
 * letting a guessed Nepali date take the lead line.
 */
function periodLines(range: ReportFilters['dateRange']): { lead: string; sub: string } {
  const ad = periodText(range)
  const fromDay = dayOf(range?.fromAd)
  const toDay = dayOf(range?.toAd)
  if (!fromDay || !toDay) return { lead: ad, sub: fromDay || toDay ? 'BS unavailable for an open-ended range' : 'every dated record' }

  const fromBs = toBs(dayToDate(fromDay))
  const toBs_ = toBs(dayToDate(toDay))
  if (!fromBs || !toBs_) return { lead: ad, sub: 'BS unavailable for this range' }
  return { lead: `${formatBs(fromBs, { suffix: false })} – ${formatBs(toBs_)}`, sub: ad }
}

/* ── CSV ───────────────────────────────────────────────────────────────── */

/**
 * The whole file, as text.
 *
 * Split out from the download so the export can be asserted character for
 * character in a test without stubbing `Blob`, `URL.createObjectURL` and an
 * anchor click — and so nothing in this module hand-rolls a quoting rule.
 * `csvCell` from `lib/csv.ts` is the only quoter; `Pulse` used to carry its own
 * copy of it.
 *
 * The header block is §11's requirement — *"every export prints the period, the
 * comparison range, the filters applied and the generation timestamp, so a
 * printed report can be verified later"*. Every adopting report gets it for
 * free, which is the point of doing this once.
 */
export function buildReportCsv({
  title,
  filters,
  compare,
  body,
  generatedBy,
  now = new Date(),
}: {
  title: string
  filters: ReportFilters
  /** Omitted when the report has no compare control — never printed as "Off" by default. */
  compare?: ReportCompare | undefined
  body: ReportCsvRow[]
  generatedBy?: string | undefined
  /** Injectable only so the provenance line is assertable. */
  now?: Date
}): string {
  const stamp = `${formatAd(now)} ${now.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kathmandu',
    hour: '2-digit',
    minute: '2-digit',
  })} NPT`

  const chipLines: ReportCsvRow[] = Object.entries(filters.chips ?? {}).map(([group, values]) => [
    group.charAt(0).toUpperCase() + group.slice(1),
    values && values.length > 0 ? values.join(' | ') : 'All',
  ])

  const rows: ReportCsvRow[] = [
    ['Report', title],
    ['Period', periodText(filters.dateRange)],
    ...chipLines,
    ...(compare ? [['Compare', compare === 'previous' ? 'Previous period' : 'Off'] as ReportCsvRow] : []),
    ['Generated', stamp],
    ...(generatedBy ? [['Generated by', generatedBy] as ReportCsvRow] : []),
    [],
    ...body,
  ]

  // CRLF per RFC 4180, matching every other export in this app.
  return rows.map((cells) => cells.map(csvCell).join(',')).join('\r\n')
}

/** `expenses-2026-07-01-to-2026-07-31.csv`, or the generation day when unbounded. */
export function reportCsvFilename(stem: string, range: ReportFilters['dateRange'], now = new Date()): string {
  const fromDay = dayOf(range?.fromAd)
  const toDay = dayOf(range?.toAd)
  if (fromDay && toDay) return `${stem}-${fromDay}-to-${toDay}.csv`
  if (fromDay) return `${stem}-from-${fromDay}.csv`
  if (toDay) return `${stem}-to-${toDay}.csv`
  return `${stem}-${civilDay(now)}.csv`
}

function download(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/* ── styles ────────────────────────────────────────────────────────────── */

// Law 15 — 44×44 at every width, desktop included. This one object is spread
// onto the date-range select, both date inputs and the branch select, on every
// report screen; `Input.tsx:71` and `Select.tsx:71` already use 44 for the same
// job elsewhere in the app.
const controlStyle: CSSProperties = {
  minHeight: 44,
  padding: '0 8px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--border)',
  background: 'var(--card2)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
}

const barStyle: CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-card)',
  boxShadow: 'var(--shadow-card)',
  padding: 11,
  display: 'flex',
  gap: 'var(--sp-sm)',
  alignItems: 'center',
  flexWrap: 'wrap',
}

/* ── the component ─────────────────────────────────────────────────────── */

export interface ReportToolbarProps {
  /** The report's own name. Heads the CSV and is not rendered — `PageHeader` already says it. */
  title: string
  /** The live filter set. Defaults to empty for a report that only exports. */
  value?: ReportFilters
  /**
   * Where the filters go. **A filter control is drawn only when this is
   * present**, alongside its own capability prop — a page that describes a date
   * column but has nowhere to put the answer gets no picker rather than a dead
   * one.
   */
  onChange?: ((next: ReportFilters) => void) | undefined
  /**
   * The AD column the range constrains, e.g. `expense_date`. **Omit and no date
   * control is drawn** — which is correct for a report whose figures have no
   * date dimension to filter on.
   */
  dateColumn?: string | undefined
  /**
   * Branch names, exactly as they appear in the rows being filtered.
   *
   * §11.2 of `Expenses.md`: Branch renders **only when more than one is
   * defined**. A single-location business is never asked which branch bought the
   * drinking water, so one name (or none) draws no control.
   */
  branches?: readonly string[] | undefined
  /** Chip group the branch selection is emitted under. Must match the queried column. */
  branchGroup?: string
  /** Current compare choice. Rendered only alongside `onCompareChange`. */
  compare?: ReportCompare | undefined
  /** Omit and no compare control is drawn — see the header: compare is the report's calculation, not the toolbar's. */
  onCompareChange?: ((next: ReportCompare) => void) | undefined
  /** Omit and no CSV button is drawn. */
  csv?: ReportCsvSpec | undefined
  /** Page-specific controls, rendered inline between the branch and compare controls. */
  children?: ReactNode
}

export function ReportToolbar({
  title,
  value = {},
  onChange,
  dateColumn,
  branches,
  branchGroup = 'branch',
  compare,
  onCompareChange,
  csv,
  children,
}: ReportToolbarProps) {
  const [isCustomMode, setIsCustomMode] = useState(false)
  const calculatedPreset = presetOf(value.dateRange)
  const preset = isCustomMode ? 'custom' : calculatedPreset
  const fromDay = dayOf(value.dateRange?.fromAd)
  const toDay = dayOf(value.dateRange?.toAd)
  const lines = useMemo(() => periodLines(value.dateRange), [value.dateRange])

  // A range whose start is after its end selects nothing. It is emitted anyway —
  // an empty table is the truthful answer to it — and said inline and
  // persistently rather than swallowed or toasted (Law 12).
  const inverted = fromDay !== null && toDay !== null && fromDay > toDay

  const setRange = (next: { fromDay?: string | null; toDay?: string | null }) => {
    if (!dateColumn || !onChange) return
    const from = next.fromDay === undefined ? fromDay : next.fromDay
    const to = next.toDay === undefined ? toDay : next.toDay
    if (!from && !to) {
      setIsCustomMode(false)
      const { dateRange: _dropped, ...rest } = value
      onChange(rest)
      return
    }
    onChange({
      ...value,
      dateRange: {
        column: dateColumn,
        ...(from ? { fromAd: startOfNepalDay(from) } : {}),
        ...(to ? { toAd: endOfNepalDay(to) } : {}),
      },
    })
  }

  const pickPreset = (key: string) => {
    if (key === 'custom') {
      setIsCustomMode(true)
      // Custom starts from whatever is already selected, falling back to the
      // narrowest honest thing there is — today.
      const day = civilDay(TODAY)
      setRange({ fromDay: fromDay ?? day, toDay: toDay ?? day })
      return
    }
    setIsCustomMode(false)
    const chosen = REPORT_RANGE_PRESETS.find((p) => p.key === key)
    if (!chosen) return
    if (chosen.days === null) {
      setRange({ fromDay: null, toDay: null })
      return
    }
    const rolling = presetWindow(chosen.days)
    setRange({ fromDay: rolling.fromDay, toDay: rolling.toDay })
  }

  const branchValue = value.chips?.[branchGroup]?.[0] ?? ''
  const pickBranch = (name: string) => {
    if (!onChange) return
    onChange({
      ...value,
      // `applyListFilters` reads an empty group as "no constraint", not as
      // "match nothing" — which is exactly what the All option means.
      chips: { ...value.chips, [branchGroup]: name ? [name] : [] },
    })
  }

  const exportCsv = () => {
    if (!csv) return
    const now = new Date()
    download(
      reportCsvFilename(csv.filename, value.dateRange, now),
      buildReportCsv({
        title,
        filters: value,
        ...(onCompareChange ? { compare: compare ?? 'off' } : {}),
        body: csv.build(),
        ...(csv.generatedBy ? { generatedBy: csv.generatedBy } : {}),
        now,
      }),
    )
  }

  return (
    <div style={barStyle} role="group" aria-label={`${title} report controls`}>
      {dateColumn && onChange && (
        <>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '4px 10px',
              borderRadius: 'var(--r-input)',
              border: '1px solid var(--border)',
              background: 'var(--card2)',
              minWidth: 0,
            }}
          >
            <Icon name="calendar" size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, minWidth: 0 }}>
              <span className="figure" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
                {lines.lead}
              </span>
              <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                {lines.sub}
              </span>
            </span>
          </span>

          <select value={preset} onChange={(e) => pickPreset(e.target.value)} aria-label="Date range" style={controlStyle}>
            {REPORT_RANGE_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom range</option>
          </select>

          {preset === 'custom' && (
            <>
              {/* `showBs={false}` — these are query bounds in a filter bar, not
                  a business date being shown to the operator, and the Date
                  Engine covers one month, so a BS line here would read "BS not
                  available for this date" on every report. The BS date is still
                  in the calendar itself. See `DateFieldProps.showBs`. */}
              <DateField
                value={fromDay ?? ''}
                onChange={(v) => setRange({ fromDay: v || null })}
                ariaLabel="From date"
                showBs={false}
                clearable
                style={controlStyle}
              />
              <DateField
                value={toDay ?? ''}
                onChange={(v) => setRange({ toDay: v || null })}
                ariaLabel="To date"
                showBs={false}
                clearable
                align="right"
                style={controlStyle}
              />
            </>
          )}
        </>
      )}

      {branches && branches.length > 1 && onChange && (
        <select value={branchValue} onChange={(e) => pickBranch(e.target.value)} aria-label="Branch" style={controlStyle}>
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      )}

      {/*
        The page's own controls sit between branch and compare rather than after
        it. §9.7's order is `date · branch · compare · … · CSV · Print`, and a
        report that brings its OWN period control (Pulse does) puts it in this
        slot — placing children last would leave that page's period picker on the
        far side of the compare select it belongs beside.
      */}
      {children}

      {onCompareChange && (
        <select
          value={compare ?? 'off'}
          onChange={(e) => onCompareChange(e.target.value === 'previous' ? 'previous' : 'off')}
          aria-label="Comparison"
          style={controlStyle}
        >
          <option value="previous">Compare: previous period</option>
          <option value="off">Compare: off</option>
        </select>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
        {csv && (
          <Button icon="download" onClick={exportCsv}>
            CSV
          </Button>
        )}
        {/* Print is the one control every report can honour without any data of
            its own — it prints what is on screen. */}
        <Button icon="file" onClick={() => window.print()}>
          Print
        </Button>
      </div>

      {inverted && (
        <p role="alert" style={{ width: '100%', margin: 0, fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>
          From is after To — this range selects nothing. Swap the two dates.
        </p>
      )}
    </div>
  )
}
