// @vitest-environment jsdom
/**
 * # The toolbar is wired to the rows
 *
 * `ReportToolbar` has its own suite, and it proves the control emits the right
 * `ListFilters`. That is only half the claim. The half that matters to whoever
 * reads this report is that the ledger underneath OBEYS what the control
 * emitted — and the defect this whole task exists to remove was precisely a
 * control that emitted state nothing consumed.
 *
 * So this file drives the real page: pick a range, count the rows; pick a
 * branch, count the rows. A regression that unhooks the toolbar from the
 * `useMemo` leaves every pixel where it was and only these numbers change.
 *
 * The fourth test is the Law 6 half: a money-blind session must get RESTRICTED
 * *and no export control*, because a CSV button over a gated report is a way to
 * read in a file what the screen refuses to draw.
 *
 * Environment pragma per `vitest.config.ts`; auth mocked at the same boundary
 * `modules/finance/__tests__/Finance.restricted.test.tsx` mocks it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

/**
 * jsdom implements no `matchMedia`, and `lib/device.ts` subscribes to two media
 * queries in an effect. Stubbed rather than mocked away so the real `Rail` and
 * `KpiStrip` still render: jsdom reports `innerWidth` 1024, which is the tablet
 * band, and this answers both queries the way that width would.
 */
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

/** The signed-in role, mutable between mounts — `useCanViewMoney` reads it. */
const auth = vi.hoisted(() => ({ role: 'Owner' as string }))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-TEST', name: 'Tester', role: auth.role, isSharedDevice: false } }),
}))

const { default: ExpenseReports } = await import('../ExpenseReports')

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ExpenseReports />
      </MemoryRouter>,
    )
  })
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  auth.role = 'Owner'
})

function need<T extends HTMLElement>(label: string): T {
  const el = container.querySelector<T>(`[aria-label="${label}"]`)
  if (!el) throw new Error(`No control labelled "${label}" is on screen`)
  return el
}

/**
 * Set one of the Custom range's date inputs.
 *
 * The narrowing tests below used to reach for the `last7` preset, whose window
 * ends on the operating day. That worked only while `lib/bs.ts` froze the
 * operating day at 31 Jul 2026, inside the seeded expenses' own July dates:
 * against the real clock `last7` is a window with no seeded row in it, and the
 * suite went red for a product that was behaving correctly. The seed corpus is
 * fixed in July, so the window that exercises the toolbar is stated outright.
 */
async function typeDate(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (!setter) throw new Error('no value setter')
  await act(async () => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

/** 25–31 Jul 2026 — the window `last7` covered on the day this suite was written. */
const SEEDED_WEEK = { from: '2026-07-25', to: '2026-07-31' }

async function pickSeededWeek() {
  await change(need<HTMLSelectElement>('Date range'), 'custom')
  await typeDate(need<HTMLInputElement>('From date'), SEEDED_WEEK.from)
  await typeDate(need<HTMLInputElement>('To date'), SEEDED_WEEK.to)
}

async function change(el: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  if (!setter) throw new Error('no value setter')
  await act(async () => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

/** The table card titles itself with its own row count — the number under test. */
function rowCount(): number {
  const match = (container.textContent ?? '').match(/(\d+) expenses?/)
  if (!match?.[1]) throw new Error('No row count on screen')
  return Number(match[1])
}

describe('ExpenseReports · the shared toolbar drives the ledger', () => {
  it('opens on the seeded period with every recorded expense', async () => {
    // The page used to print `1 Jul 2026 – 31 Jul 2026` as fixed text. The
    // toolbar now starts on exactly that range, so adopting it changed no
    // figure — all 27 rows are still in scope on arrival.
    await mount()
    expect(rowCount()).toBe(27)
  })

  it('narrows the rows when the date range narrows', async () => {
    await mount()
    await pickSeededWeek()
    expect(rowCount()).toBe(10)

    // …and widening it again brings every row back, rather than latching.
    await change(need<HTMLSelectElement>('Date range'), 'all')
    expect(rowCount()).toBe(27)
  })

  it('narrows the rows when the branch narrows', async () => {
    // §11.2 — two branches are defined, so the control exists at all. Three of
    // the 27 seeded expenses were booked to Thamel.
    await mount()
    await change(need<HTMLSelectElement>('Branch'), 'Thamel Branch')
    expect(rowCount()).toBe(3)

    await change(need<HTMLSelectElement>('Branch'), '')
    expect(rowCount()).toBe(27)
  })

  it('combines the two rather than letting the later one replace the earlier', async () => {
    // A toolbar that rebuilt the filter object from scratch on each change would
    // pass this suite's other tests and fail this one.
    await mount()
    await change(need<HTMLSelectElement>('Branch'), 'Thamel Branch')
    await pickSeededWeek()
    const both = rowCount()
    expect(both).toBeLessThanOrEqual(3)

    await change(need<HTMLSelectElement>('Branch'), '')
    expect(rowCount()).toBe(10)
  })

  it('gives a money-blind role the restricted state and no export at all', async () => {
    // Law 6. Not an empty table, not a toolbar with a live CSV button over it.
    auth.role = 'Warehouse'
    await mount()

    const text = container.textContent ?? ''
    expect(text).toContain('Access restricted')
    expect(text).toContain('Requires Owner, Admin, Coordinator or Accounts')
    expect(container.querySelector('[aria-label="Date range"]')).toBeNull()
    expect(container.querySelector('[aria-label="Branch"]')).toBeNull()
    expect([...container.querySelectorAll('button')].some((b) => b.textContent?.includes('CSV'))).toBe(false)
    expect([...container.querySelectorAll('button')].some((b) => b.textContent?.includes('Print'))).toBe(false)
  })
})
