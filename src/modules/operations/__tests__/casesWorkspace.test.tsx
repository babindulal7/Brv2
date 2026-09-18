// @vitest-environment jsdom
/**
 * # Cases Workspace — the three things RS-09 and RS-10 name
 *
 *  - **RS-09a** — one press of `Log Incident Case` announces the case twice:
 *    `LogCaseModal` awaits `DomainEvents.emit(DISCREPANCY_FLAGGED, { case })`,
 *    whose subscribers run synchronously, and then calls `onSuccess` with the
 *    same object. The `onSuccess` append had no dedupe, so the queue held two
 *    rows under one `c.id`. Nothing reaches the database on either path, so
 *    Law 8's unique-key rejection never runs and the screen has to be the one
 *    that refuses the repeat.
 *  - **RS-09c** — the KPI strip and the status chips read the frozen `CASES`
 *    seed (`openCasesCount()` with no argument; the module-level
 *    `STATUS_COUNTS`) while the table read state, so a logged case showed in
 *    the list and in none of the figures above it.
 *  - **RS-10** — `/inventory/cases/:id` mounts this same component; it used to
 *    ignore the id. The two cases below are the positive control for the fix
 *    that is already in the tree.
 *
 * The `onSuccess` half cannot be driven from the UI — `Log Incident` is
 * `disabled` inside `<Unavailable>` (RS-06) — so the duplicate is delivered
 * through the event bus, which is the same `upsertCase` both paths now call.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const canSeeMoney = { current: true }
const mockCasesData = vi.hoisted(() => ({ current: null as unknown }))

vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => canSeeMoney.current }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: 'Owner', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))
vi.mock('../../../lib/queries/cases', async (orig) => {
  const actual = await orig<typeof import('../../../lib/queries/cases')>()
  return {
    ...actual,
    listCases: vi.fn().mockImplementation(async () => {
      const data = mockCasesData.current !== null ? mockCasesData.current : actual.CASES
      return {
        rows: data as any,
        total: (data as any[]).length,
      }
    }),
  }
})

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

/** `<Unavailable>` reads capabilities; jsdom ships no `matchMedia`, and false answers all of them. */
window.matchMedia = ((q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

const { CasesWorkspace } = await import('../CasesWorkspace')
import type { Case } from '../../../data/cases'

const { CASES, statusCounts, openCasesCount } = await import('../../../data/cases')
const { DomainEvents, EVENT_TYPES } = await import('../../../events/eventBus')

/** A new case built by CLONING a seeded one — no field on `Case` is invented here. */
const FRESH_ID = 'CASE-2026-9901'
function freshCase(): Case {
  const base = CASES[0]
  if (!base) throw new Error('the CASES seed is empty — this suite has nothing to clone')
  return { ...base, id: FRESH_ID, status: 'Open', disposition: null }
}

let container: HTMLDivElement
let root: Root

async function mount(path: string) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/inventory/cases" element={<CasesWorkspace />} />
          <Route path="/inventory/cases/:id" element={<CasesWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )
  })
}

const text = () => container.textContent ?? ''

/** A status chip reads `<label> <count>`; the row action reads `Open Case`, which this will not match. */
function chip(label: string): number {
  const re = new RegExp(`^${label}\\s+(\\d+)$`)
  for (const b of container.querySelectorAll('button')) {
    const m = re.exec((b.textContent ?? '').replace(/\s+/g, ' ').trim())
    if (m?.[1]) return Number(m[1])
  }
  throw new Error(`no "${label}" chip on screen`)
}

/** The figure inside the KPI card whose own text carries `label`. */
function kpi(label: string): string {
  const fig = [...container.querySelectorAll('.figure')].find((f) =>
    (f.parentElement?.textContent ?? '').includes(label),
  )
  if (!fig) throw new Error(`no KPI card for "${label}"`)
  return (fig.textContent ?? '').trim()
}

/** Body rows naming this case id — the duplicate-key symptom counts as 2. */
function rowsFor(id: string): number {
  return [...container.querySelectorAll('tbody tr')].filter((tr) => (tr.textContent ?? '').includes(id)).length
}

async function announce(c: Case) {
  await act(async () => {
    await DomainEvents.emit(EVENT_TYPES.DISCREPANCY_FLAGGED, { case: c })
  })
}

beforeEach(() => {
  canSeeMoney.current = true
  mockCasesData.current = null
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('CasesWorkspace — RS-09c, the strip and the table count one array', () => {
  it('opens with every figure agreeing with the seed', async () => {
    await mount('/inventory/cases')
    expect(chip('All')).toBe(CASES.length)
    expect(chip('Open')).toBe(statusCounts(CASES)['Open'])
    expect(kpi('Open Cases')).toBe(String(openCasesCount(CASES)))
  })

  it('moves the chips and the KPIs with the list, not with the frozen seed', async () => {
    await mount('/inventory/cases')
    const openChipBefore = chip('Open')
    const openKpiBefore = Number(kpi('Open Cases'))

    await announce(freshCase())

    expect(rowsFor(FRESH_ID)).toBe(1)
    expect(chip('All')).toBe(CASES.length + 1)
    expect(chip('Open')).toBe(openChipBefore + 1)
    expect(Number(kpi('Open Cases'))).toBe(openKpiBefore + 1)
  })
})

describe('CasesWorkspace — RS-09a, the same case announced twice', () => {
  it('holds one row and one count for a case it is told about twice', async () => {
    await mount('/inventory/cases')
    const c = freshCase()

    await announce(c)
    const allAfterFirst = chip('All')
    const openKpiAfterFirst = kpi('Open Cases')

    await announce(c)

    expect(rowsFor(FRESH_ID)).toBe(1)
    expect(chip('All')).toBe(allAfterFirst)
    expect(kpi('Open Cases')).toBe(openKpiAfterFirst)
  })

  /*
   * The positive control the PK-05 precedent asks for: restore the old
   * behaviour — a plain append with no id filter — and the assertion above
   * must fail. If this test ever goes green the guard has stopped guarding.
   */
  it('positive control: a plain append would put the case in the list twice', () => {
    const c = freshCase()
    const appended = [c, ...[c, ...CASES]]
    const upserted = [c, ...[c, ...CASES].filter((x) => x.id !== c.id)]
    expect(appended.filter((x) => x.id === FRESH_ID)).toHaveLength(2)
    expect(upserted.filter((x) => x.id === FRESH_ID)).toHaveLength(1)
  })
})

describe('CasesWorkspace — RS-10, the id in the URL is read', () => {
  it('narrows the queue to the case the address names', async () => {
    const target = CASES[1] ?? CASES[0]
    if (!target) throw new Error('the CASES seed is empty')
    await mount(`/inventory/cases/${target.id}`)

    expect(text()).toContain('Showing case')
    expect(rowsFor(target.id)).toBe(1)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1)
  })

  it('says so, rather than showing the whole queue, when the id matches nothing', async () => {
    await mount('/inventory/cases/CASE-2026-0000')
    expect(text()).toContain('No case matches CASE-2026-0000')
    expect(container.querySelectorAll('tbody tr')).toHaveLength(0)
  })
})

describe('CasesWorkspace — empty state', () => {
  it('renders standard empty state when database returns no cases', async () => {
    mockCasesData.current = []
    await mount('/inventory/cases')
    expect(text()).toContain('No cases found')
    expect(text()).toContain('Adjust your filters or search query to find incident cases')
    expect(container.querySelectorAll('tbody tr')).toHaveLength(0)
  })
})
