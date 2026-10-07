// @vitest-environment jsdom
/**
 * `ReportToolbar`, driven rather than read.
 *
 * Two classes of defect are what this suite exists to catch, and neither is
 * visible in review:
 *
 * 1. **A control that renders but emits nothing.** That is the exact state the
 *    reports module was in — six Export buttons and two Compare buttons with no
 *    handler, three chip rows that set `useState` and filtered nothing. A
 *    screenshot of the broken version and the fixed version are identical, so
 *    every control below is asserted by what it puts into `onChange`, never by
 *    the fact that it is on screen.
 * 2. **A date bound that is a bare day.** `2026-07-31` reaches Postgres as
 *    midnight UTC, which is 05:45 in Kathmandu, so `lte` drops all but the first
 *    six hours of the last day. The window looks right and quietly under-reports.
 *
 * Environment pragma per `vitest.config.ts`, matching `PageBody.test.tsx`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  ReportToolbar,
  buildReportCsv,
  reportCsvFilename,
  reportDateRange,
  withinReportRange,
  type ReportFilters,
  type ReportToolbarProps,
} from '../ReportToolbar'
import { NPT_OFFSET_MIN, getBusinessToday } from '../../../lib/bs'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

/* The offset is recomputed here from `bs.ts`'s one constant rather than typed as
   `+05:45`, so this suite cannot pass a toolbar that hardcoded its own copy. */
const OFFSET = `${NPT_OFFSET_MIN < 0 ? '-' : '+'}${String(Math.floor(Math.abs(NPT_OFFSET_MIN) / 60)).padStart(
  2,
  '0',
)}:${String(Math.abs(NPT_OFFSET_MIN) % 60).padStart(2, '0')}`

/* The operating day the toolbar itself resolved, from the same function it
   calls — so this suite cannot pass a toolbar that read the runner's local
   date instead of Kathmandu's. */
const TODAY_DAY = getBusinessToday().toISOString().slice(0, 10)

const DAY_MS = 86_400_000
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10)

let container: HTMLDivElement
let root: Root
/** The last value `onChange` produced — the whole point of every filter test. */
let emitted: ReportFilters | null = null

type HarnessProps = Omit<ReportToolbarProps, 'value' | 'onChange'> & { initial?: ReportFilters }

/**
 * The toolbar is controlled, so a test that never re-renders it with the value
 * it emitted is testing a component nobody ships. This holds the state exactly
 * as a report page does.
 */
function Harness({ initial = {}, ...rest }: HarnessProps) {
  const [filters, setFilters] = useState<ReportFilters>(initial)
  return (
    <ReportToolbar
      {...rest}
      value={filters}
      onChange={(next) => {
        emitted = next
        setFilters(next)
      }}
    />
  )
}

async function mount(props: HarnessProps) {
  emitted = null
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<Harness {...props} />)
  })
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

function control<T extends HTMLElement>(label: string): T | null {
  return container.querySelector<T>(`[aria-label="${label}"]`)
}

function need<T extends HTMLElement>(label: string): T {
  const el = control<T>(label)
  if (!el) throw new Error(`No control labelled "${label}" is on screen`)
  return el
}

function buttonNamed(text: string): HTMLButtonElement | null {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) ?? null
}

/** Sets a controlled field the way a user would, through React's own change plumbing. */
async function change(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (!setter) throw new Error('no value setter')
  await act(async () => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

/**
 * Sets a `DateField` the way an operator does: type, then leave the field.
 *
 * The date bounds stopped being `<input type="date">` on 4 Sep 2026 — they are
 * `components/ui/DateField` now, so the whole app shows one calendar with the
 * BS date on it instead of whatever the browser ships. Two consequences the
 * tests below encode:
 *
 *  · **It commits on blur, not on change.** Typing "2026-07-1" would otherwise
 *    parse as a half-finished date on every keystroke, so nothing is committed
 *    until the field is left (React's `onBlur` is `focusout`). Same contract
 *    `DateTimeField` has had since the redesign.
 *  · **It displays "1 Jul 2026", not "2026-07-01".** The model value stays ISO;
 *    only the presentation changed. Assertions on the emitted range are
 *    therefore unchanged, and assertions on `.value` read the display.
 */
async function typeDate(el: HTMLInputElement, value: string) {
  await change(el, value)
  await act(async () => {
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/**
 * jsdom implements neither `URL.createObjectURL` nor `revokeObjectURL`, so they
 * cannot be spied — they have to be defined first. Returns the recorded
 * download so a test can assert the filename without a real navigation.
 */
function stubDownload(): { urls: number; downloads: string[] } {
  const record = { urls: 0, downloads: [] as string[] }
  Object.defineProperty(URL, 'createObjectURL', {
    value: () => {
      record.urls += 1
      return 'blob:stub'
    },
    configurable: true,
    writable: true,
  })
  Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true, writable: true })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    record.downloads.push(this.download)
  })
  return record
}

const BASE: HarnessProps = { title: 'Expenses' }

/* ── which controls exist at all ───────────────────────────────────────── */

describe('ReportToolbar renders a control only when the page can honour it', () => {
  it('draws no date control without a dateColumn', async () => {
    await mount(BASE)
    expect(control('Date range')).toBeNull()
    expect(control('From date')).toBeNull()
  })

  it('draws no branch control for a single branch', async () => {
    // §11.2 — a single-location business is never asked which branch.
    await mount({ ...BASE, branches: ['Boudha (Head Office)'] })
    expect(control('Branch')).toBeNull()
  })

  it('draws the branch control once there is a choice to make', async () => {
    await mount({ ...BASE, branches: ['Boudha (Head Office)', 'Thamel Branch'] })
    expect(control('Branch')).not.toBeNull()
  })

  it('draws no compare control without a handler', async () => {
    // Compare is the report's calculation. A toolbar that offered it regardless
    // would put a live-looking select over a page with no prior period.
    await mount({ ...BASE, compare: 'previous' })
    expect(control('Comparison')).toBeNull()
  })

  it('draws no filter control when the page gave it nowhere to put the answer', async () => {
    // A page that names a date column but passes no `onChange` would otherwise
    // get a picker that moves and reports nothing — the precise defect the
    // reports module already had six times over.
    emitted = null
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(<ReportToolbar title="Staff Performance" dateColumn="worked_on" branches={['A', 'B']} />)
    })
    expect(control('Date range')).toBeNull()
    expect(control('Branch')).toBeNull()
    // Export still works — it needs nothing from the filter set.
    expect(buttonNamed('Print')).not.toBeNull()
  })

  it('draws no CSV button without a csv spec', async () => {
    await mount(BASE)
    expect(buttonNamed('CSV')).toBeNull()
  })

  it('always draws Print, which needs nothing from the page', async () => {
    await mount(BASE)
    expect(buttonNamed('Print')).not.toBeNull()
  })
})

/* ── the date range ────────────────────────────────────────────────────── */

describe('ReportToolbar date range', () => {
  it('emits Nepal day boundaries, never a bare day', async () => {
    await mount({ ...BASE, dateColumn: 'expense_date' })
    await change(need<HTMLSelectElement>('Date range'), 'last7')

    expect(emitted?.dateRange).toEqual({
      column: 'expense_date',
      fromAd: `${shift(TODAY_DAY, -6)}T00:00:00.000${OFFSET}`,
      toAd: `${TODAY_DAY}T23:59:59.999${OFFSET}`,
    })
  })

  it('makes a rolling window inclusive at both ends', async () => {
    // "Last 7 days" is seven days including today, not eight. `applyListFilters`
    // compares gte/lte, so an off-by-one here silently widens every report.
    await mount({ ...BASE, dateColumn: 'expense_date' })
    await change(need<HTMLSelectElement>('Date range'), 'last30')
    expect(emitted?.dateRange?.fromAd?.slice(0, 10)).toBe(shift(TODAY_DAY, -29))
    expect(emitted?.dateRange?.toAd?.slice(0, 10)).toBe(TODAY_DAY)
  })

  it('ends every window on the app-wide operating day, in Kathmandu', async () => {
    // Reading `Date.now()` here would put the toolbar on a different day from
    // every other date the app renders.
    await mount({ ...BASE, dateColumn: 'expense_date' })
    await change(need<HTMLSelectElement>('Date range'), 'last90')
    expect(emitted?.dateRange?.toAd?.slice(0, 10)).toBe(TODAY_DAY)
  })

  it('drops dateRange entirely on All dates', async () => {
    // Not `{ fromAd: undefined, toAd: undefined }` — `useList`'s narrowingKey
    // would still see a dateRange key and the empty state would offer a Clear
    // filters button that clears nothing.
    await mount({
      ...BASE,
      dateColumn: 'expense_date',
      initial: { dateRange: { column: 'expense_date', fromAd: `2026-07-01T00:00:00.000${OFFSET}` } },
    })
    await change(need<HTMLSelectElement>('Date range'), 'all')
    expect(emitted).toEqual({})
    expect('dateRange' in (emitted ?? {})).toBe(false)
  })

  it('derives the selected preset from the range instead of storing it', async () => {
    const window7 = {
      column: 'expense_date',
      fromAd: `${shift(TODAY_DAY, -6)}T00:00:00.000${OFFSET}`,
      toAd: `${TODAY_DAY}T23:59:59.999${OFFSET}`,
    }
    await mount({ ...BASE, dateColumn: 'expense_date', initial: { dateRange: window7 } })
    expect(need<HTMLSelectElement>('Date range').value).toBe('last7')
  })

  it('reads a range no preset produces as Custom, with both ends filled in', async () => {
    await mount({
      ...BASE,
      dateColumn: 'expense_date',
      initial: {
        dateRange: {
          column: 'expense_date',
          fromAd: `2026-07-01T00:00:00.000${OFFSET}`,
          toAd: `2026-07-31T23:59:59.999${OFFSET}`,
        },
      },
    })
    expect(need<HTMLSelectElement>('Date range').value).toBe('custom')
    // DateField renders the day for a human; the model value stays ISO.
    expect(need<HTMLInputElement>('From date').value).toBe('1/7/2026')
    expect(need<HTMLInputElement>('To date').value).toBe('31/7/2026')
  })

  it('emits a hand-typed custom bound with the same day boundaries', async () => {
    await mount({ ...BASE, dateColumn: 'expense_date' })
    await change(need<HTMLSelectElement>('Date range'), 'custom')
    await typeDate(need<HTMLInputElement>('From date'), '2026-07-16')

    expect(emitted?.dateRange?.fromAd).toBe(`2026-07-16T00:00:00.000${OFFSET}`)
    // The other end is preserved rather than dropped when only one is edited.
    expect(emitted?.dateRange?.toAd).toBe(`${TODAY_DAY}T23:59:59.999${OFFSET}`)
  })

  it('says an inverted range selects nothing, inline and persistently', async () => {
    // Law 12 — not a toast, and not swallowed. The range is still emitted,
    // because an empty table is the truthful answer to it.
    await mount({ ...BASE, dateColumn: 'expense_date' })
    await change(need<HTMLSelectElement>('Date range'), 'custom')
    await typeDate(need<HTMLInputElement>('From date'), '2026-07-31')
    await typeDate(need<HTMLInputElement>('To date'), '2026-07-01')

    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('selects nothing')
    expect(emitted?.dateRange?.fromAd?.slice(0, 10)).toBe('2026-07-31')
    expect(emitted?.dateRange?.toAd?.slice(0, 10)).toBe('2026-07-01')
  })
})

/* ── branch ────────────────────────────────────────────────────────────── */

describe('ReportToolbar branch', () => {
  const BRANCHES = ['Boudha (Head Office)', 'Thamel Branch']

  it('emits the choice as a chip group', async () => {
    await mount({ ...BASE, branches: BRANCHES })
    await change(need<HTMLSelectElement>('Branch'), 'Thamel Branch')
    expect(emitted?.chips).toEqual({ branch: ['Thamel Branch'] })
  })

  it('emits an EMPTY group for All, which applyListFilters reads as no constraint', async () => {
    // Not a missing key and not a match-nothing sentinel — `applyListFilters`
    // skips a zero-length group, which is exactly what "All" means.
    await mount({ ...BASE, branches: BRANCHES, initial: { chips: { branch: ['Thamel Branch'] } } })
    await change(need<HTMLSelectElement>('Branch'), '')
    expect(emitted?.chips).toEqual({ branch: [] })
  })

  it('emits under the column the page names, not a hardcoded one', async () => {
    await mount({ ...BASE, branches: BRANCHES, branchGroup: 'branch_id' })
    await change(need<HTMLSelectElement>('Branch'), 'Thamel Branch')
    expect(emitted?.chips).toEqual({ branch_id: ['Thamel Branch'] })
  })

  it('leaves other chip groups alone', async () => {
    await mount({ ...BASE, branches: BRANCHES, initial: { chips: { status: ['Paid'] } } })
    await change(need<HTMLSelectElement>('Branch'), 'Thamel Branch')
    expect(emitted?.chips).toEqual({ status: ['Paid'], branch: ['Thamel Branch'] })
  })
})

/* ── compare ───────────────────────────────────────────────────────────── */

describe('ReportToolbar compare', () => {
  it('reports the choice to the page that owns the calculation', async () => {
    const onCompareChange = vi.fn()
    await mount({ ...BASE, compare: 'previous', onCompareChange })
    await change(need<HTMLSelectElement>('Comparison'), 'off')
    expect(onCompareChange).toHaveBeenCalledWith('off')

    await change(need<HTMLSelectElement>('Comparison'), 'previous')
    expect(onCompareChange).toHaveBeenLastCalledWith('previous')
  })
})

/* ── CSV ───────────────────────────────────────────────────────────────── */

describe('buildReportCsv', () => {
  const NOW = new Date(Date.UTC(2026, 6, 31, 4, 0)) // 09:45 in Kathmandu

  it('heads every export with the provenance §11 asks for', async () => {
    const text = buildReportCsv({
      title: 'Expenses',
      filters: {
        dateRange: { column: 'expense_date', fromAd: `2026-07-01T00:00:00.000${OFFSET}`, toAd: `2026-07-31T23:59:59.999${OFFSET}` },
        chips: { branch: ['Thamel Branch'] },
      },
      body: [['Expense ID', 'Amount'], ['EXP-2026-0723', 'Rs 85,000']],
      generatedBy: 'Babin Shrestha',
      now: NOW,
    })

    expect(text.split('\r\n')).toEqual([
      'Report,Expenses',
      'Period,1/7/2026 – 31/7/2026',
      'Branch,Thamel Branch',
      'Generated,31/7/2026 09:45 NPT',
      'Generated by,Babin Shrestha',
      '',
      'Expense ID,Amount',
      // `csvCell` quotes only what needs it — the amount carries a comma, the id does not.
      'EXP-2026-0723,"Rs 85,000"',
    ])
  })

  it('says All dates rather than inventing a period', async () => {
    const text = buildReportCsv({ title: 'Staff Performance', filters: {}, body: [], now: NOW })
    expect(text).toContain('Period,All dates')
  })

  it('omits Generated by rather than guessing the operator', async () => {
    const text = buildReportCsv({ title: 'Cash Flow', filters: {}, body: [], now: NOW })
    expect(text).not.toContain('Generated by')
  })

  it('prints Compare only for a report that actually has the control', async () => {
    const withControl = buildReportCsv({ title: 'Pulse', filters: {}, compare: 'off', body: [], now: NOW })
    expect(withControl).toContain('Compare,Off')

    const without = buildReportCsv({ title: 'Inventory Reports', filters: {}, body: [], now: NOW })
    expect(without).not.toContain('Compare')
  })

  it('quotes through lib/csv rather than a second hand-rolled rule', async () => {
    // The value below breaks a naive quoter three different ways at once.
    const text = buildReportCsv({
      title: 'Expenses',
      filters: {},
      body: [['Sunrise Complex, Pvt. Ltd.', 'said "no"', 'two\nlines']],
      now: NOW,
    })
    expect(text).toContain('"Sunrise Complex, Pvt. Ltd.","said ""no""","two\nlines"')
  })

  it('names an empty chip group All rather than dropping the line', async () => {
    const text = buildReportCsv({ title: 'Expenses', filters: { chips: { branch: [] } }, body: [], now: NOW })
    expect(text).toContain('Branch,All')
  })
})

describe('reportCsvFilename', () => {
  const NOW = new Date(Date.UTC(2026, 6, 31, 4, 0))

  it('carries the selected range', () => {
    expect(
      reportCsvFilename('expenses', { column: 'expense_date', fromAd: `2026-07-01T00:00:00.000${OFFSET}`, toAd: `2026-07-31T23:59:59.999${OFFSET}` }),
    ).toBe('expenses-2026-07-01-to-2026-07-31.csv')
  })

  it('falls back to the generation day when nothing narrowed it', () => {
    expect(reportCsvFilename('staff', undefined, NOW)).toBe('staff-2026-07-31.csv')
  })
})

describe('ReportToolbar CSV button', () => {
  it('builds the body on click, not on render', async () => {
    // A report table serialised into a string on every keystroke is a real cost
    // on the pages this toolbar is meant for.
    const build = vi.fn(() => [['Figure', 'Value']] as string[][])
    await mount({ ...BASE, csv: { filename: 'expenses', build } })
    expect(build).not.toHaveBeenCalled()

    const record = stubDownload()
    await click(buttonNamed('CSV') as HTMLElement)

    expect(build).toHaveBeenCalled()
    expect(record.urls).toBe(1)
    expect(record.downloads).toHaveLength(1)
  })

  it('names the file from the stem and the live range', async () => {
    const record = stubDownload()

    await mount({ ...BASE, dateColumn: 'expense_date', csv: { filename: 'expenses', build: () => [] } })
    await change(need<HTMLSelectElement>('Date range'), 'last7')
    await click(buttonNamed('CSV') as HTMLElement)

    expect(record.downloads).toEqual([`expenses-${shift(TODAY_DAY, -6)}-to-${TODAY_DAY}.csv`])
  })
})

/* ── the two helpers a page needs to agree with the toolbar ────────────── */

describe('reportDateRange', () => {
  it('produces exactly what the toolbar itself emits for the same two days', async () => {
    // The point of exporting it: a page starting on a period must not build its
    // own `{ fromAd: period.from.toISOString() }`, which is a bare UTC instant
    // and a different window from the one the control produces.
    await mount({ ...BASE, dateColumn: 'expense_date' })
    await change(need<HTMLSelectElement>('Date range'), 'last7')

    expect(reportDateRange('expense_date', new Date(Date.parse(`${shift(TODAY_DAY, -6)}T00:00:00Z`)), new Date(Date.parse(`${TODAY_DAY}T00:00:00Z`)))).toEqual(
      emitted?.dateRange,
    )
  })

  it('is undefined when neither end is given, so no key is emitted at all', () => {
    expect(reportDateRange('expense_date', null, null)).toBeUndefined()
  })

  it('accepts a bound it emitted earlier without shifting the day', () => {
    expect(reportDateRange('expense_date', `2026-07-16T00:00:00.000${OFFSET}`, null)).toEqual({
      column: 'expense_date',
      fromAd: `2026-07-16T00:00:00.000${OFFSET}`,
    })
  })
})

describe('withinReportRange', () => {
  const range = reportDateRange('date', '2026-07-16', '2026-07-31')

  it('includes both ends of the day, not just its first instant', () => {
    // The defect this exists to stop: a bare-day bound excludes everything after
    // 00:00, so the last day of every report silently loses its rows.
    expect(withinReportRange(new Date('2026-07-16T00:10:00+05:45'), range)).toBe(true)
    expect(withinReportRange(new Date('2026-07-31T23:30:00+05:45'), range)).toBe(true)
  })

  it('excludes the days either side', () => {
    expect(withinReportRange(new Date('2026-07-15T23:30:00+05:45'), range)).toBe(false)
    expect(withinReportRange(new Date('2026-08-01T00:10:00+05:45'), range)).toBe(false)
  })

  it('constrains nothing when there is no range', () => {
    expect(withinReportRange(new Date('1999-01-01T00:00:00Z'), undefined)).toBe(true)
  })
})

describe('ReportToolbar print', () => {
  it('prints the page', async () => {
    const print = vi.fn()
    Object.defineProperty(window, 'print', { value: print, configurable: true, writable: true })
    await mount(BASE)
    await click(buttonNamed('Print') as HTMLElement)
    expect(print).toHaveBeenCalled()
  })
})
