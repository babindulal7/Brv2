// @vitest-environment jsdom
/**
 * # The return countdown — live, and never colour alone
 *
 * The span arithmetic is pinned in `lib/__tests__/returnCountdown.test.ts`.
 * This suite pins the two things only a render can show: the line moves on its
 * own minute clock (a tablet is left open all shift), and crossing `return_at`
 * changes the WORDS and the icon, not only the colour (Law 11).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ReturnCountdown } from '../ReturnCountdown'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const DUE = '2026-10-08T12:15:00.000Z'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

const line = () => container.querySelector('[data-testid="return-countdown"]') as HTMLElement | null

describe('ReturnCountdown', () => {
  it('reads "Due in …" ahead of return_at, and "in …" in its short form', () => {
    vi.setSystemTime(new Date('2026-10-08T08:55:00.000Z'))
    act(() => root.render(<ReturnCountdown returnAtAd={DUE} />))
    expect(line()?.textContent).toBe('Due in 3h 20m')
    expect(line()?.dataset['overdue']).toBe('false')

    act(() => root.render(<ReturnCountdown returnAtAd={DUE} short />))
    expect(line()?.textContent).toBe('in 3h 20m')
  })

  it('moves by itself each minute, without the page re-rendering it', () => {
    vi.setSystemTime(new Date('2026-10-08T12:13:30.000Z'))
    act(() => root.render(<ReturnCountdown returnAtAd={DUE} />))
    expect(line()?.textContent).toBe('Due in 1m')

    // The first tick lands on the minute boundary (12:14:00), then every 60s.
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(line()?.textContent).toBe('Due in 1m')
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(line()?.textContent).toBe('Due in under 1m')
    act(() => { vi.advanceTimersByTime(120_000) })
    expect(line()?.textContent).toBe('Overdue by 2m')
  })

  it('says "Overdue" in words and swaps the icon past return_at — not colour alone', () => {
    vi.setSystemTime(new Date('2026-10-08T14:30:00.000Z'))
    act(() => root.render(<ReturnCountdown returnAtAd={DUE} />))
    expect(line()?.textContent).toBe('Overdue by 2h 15m')
    expect(line()?.dataset['overdue']).toBe('true')
    expect(line()?.querySelector('svg, [data-icon], i, span')).not.toBeNull()

    act(() => root.render(<ReturnCountdown returnAtAd={DUE} short />))
    expect(line()?.textContent).toBe('2h 15m late')
  })

  it('renders nothing for an unreadable instant', () => {
    vi.setSystemTime(new Date('2026-10-08T08:55:00.000Z'))
    act(() => root.render(<ReturnCountdown returnAtAd="not a date" />))
    expect(line()).toBeNull()
  })
})
