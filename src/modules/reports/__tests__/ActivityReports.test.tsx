// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import ActivityReports from '../ActivityReports'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

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

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: [] }),
        }),
      }),
    }),
  },
}))

describe('ActivityReports module', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount()
      })
      container.remove()
    }
    container = null
    root = null
  })

  it('mounts cleanly and renders header and toolbar', async () => {
    await act(async () => {
      root!.render(<ActivityReports />)
    })

    expect(container?.textContent).toContain('Staff & System Activity')
    expect(container?.textContent).toContain('Activity Overview')
    expect(container?.textContent).toContain('Operator Breakdown')
    expect(container?.textContent).toContain('Audit Trail Stream')
  })

  it('switches between tabs on click', async () => {
    await act(async () => {
      root!.render(<ActivityReports />)
    })

    const buttons = Array.from(container?.querySelectorAll('button') ?? [])
    const operatorTabBtn = buttons.find((b) => b.textContent?.includes('Operator Breakdown'))

    expect(operatorTabBtn).toBeDefined()

    await act(async () => {
      operatorTabBtn?.click()
    })

    expect(container?.textContent).toContain('Staff Operator Performance & Activity')
  })
})
