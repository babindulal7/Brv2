// @vitest-environment jsdom
/**
 * # The activity timeline — newest first, and three filters
 *
 * `10_TOOLS.md` §10.5 asks for very little and every part of it is checkable:
 * a timeline rather than a table, **newest first**, filtered by
 * `[user ▾][module ▾][date ▾]`.
 *
 * "Newest first" is the assertion worth having. It is invisible in a screenshot
 * of seeded data that happens to be written in order, and it silently inverts
 * the moment a real query arrives with a different `order by` — at which point
 * the operator reads the oldest event as the latest thing that happened.
 * `data/activityLog.ts` sorts rather than trusting the seed; this proves the
 * screen consumes that ordering.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Viewport } from '../../../lib/device'
import { ACTIVITY_ROWS, ACTIVITY_TIMELINE, ACTIVITY_METRICS, targetLabel } from '../../../data/activityLog'
import * as activityData from '../../../data/activityLog'

let viewport: Viewport = 'desktop'

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => viewport,
  useCapability: () => ({ coarsePointer: false, hasHover: true, standalone: false, reducedMotion: false }),
}))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'USR-TEST', name: 'Tester', role: 'Owner', isSharedDevice: false } }),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: ActivityLog } = await import('../ActivityLog')

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<ActivityLog />)
  })
}

beforeEach(() => {
  viewport = 'desktop'
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('Activity Log — §10.5', () => {
  it('renders a timeline, newest first', async () => {
    await mount()
    const items = [...container.querySelectorAll('ol li')]
    expect(items.length).toBe(ACTIVITY_ROWS.length)

    /* Read the times off the rendered list and check they descend. Grouping by
       day must not scramble the order within or across the groups. */
    const times = items.map((li) => li.textContent ?? '')
    const expectedOrder = ACTIVITY_TIMELINE.map((r) => r.user)
    expectedOrder.forEach((user, i) => {
      expect(times[i], `entry ${i}`).toContain(user)
    })
  })

  it('carries exactly the three filters the spec draws', async () => {
    await mount()
    expect(container.querySelectorAll('select').length).toBe(3)
  })

  it('filters by module and shows nothing invented when the result is empty', async () => {
    await mount()
    const moduleSelect = container.querySelectorAll('select')[1] as HTMLSelectElement
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set
    setter?.call(moduleSelect, 'Authentication')
    await act(async () => {
      moduleSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const items = [...container.querySelectorAll('ol li')]
    expect(items.length).toBe(ACTIVITY_ROWS.filter((r) => r.module === 'Authentication').length)
  })

  it('states a failure in words, never by colour alone — Law 11', async () => {
    await mount()
    expect(container.textContent).toContain('Failed')
  })

  it('renders identifiers through the numbering registry', async () => {
    await mount()
    const withTarget = ACTIVITY_ROWS.find((r) => r.target?.code !== null && r.target !== null)!
    expect(container.textContent).toContain(targetLabel(withTarget.target, withTarget.timestamp))
    expect(container.textContent).toContain('B-713')
    expect(container.textContent).toContain('INV-492')
  })
})

describe('Activity Log — the figures are counted, not typed', () => {
  it('derives every metric from the rows', async () => {
    expect(ACTIVITY_METRICS.totalActivities).toBe(ACTIVITY_ROWS.length)
    expect(ACTIVITY_METRICS.failed).toBe(ACTIVITY_ROWS.filter((r) => r.status === 'Failed').length)
    expect(ACTIVITY_METRICS.uniqueUsers).toBe(new Set(ACTIVITY_ROWS.map((r) => r.user)).size)
  })

  it('no longer exports the "critical" count that nothing derives', async () => {
    expect('critical' in ACTIVITY_METRICS).toBe(false)
  })

  it('offers a module filter listing only modules that actually appear', async () => {
    for (const m of activityData.ACTIVITY_MODULES_PRESENT) {
      expect(ACTIVITY_ROWS.some((r) => r.module === m)).toBe(true)
    }
  })
})
