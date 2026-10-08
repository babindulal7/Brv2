// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DataAgeBadge } from '../DataAgeBadge'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

async function mount(props: React.ComponentProps<typeof DataAgeBadge>) {
  await act(async () => {
    root.render(<DataAgeBadge {...props} />)
  })
}

describe('DataAgeBadge — Phase 9 Staleness & Offline Observability', () => {
  it('renders "Live" status when data was just fetched and network is online', async () => {
    const now = new Date()
    await mount({ timestamp: now, isOffline: false })

    expect(container.textContent).toContain('Live · Just now')
    const badge = container.querySelector('[role="status"]')
    expect(badge).toBeTruthy()
    expect(badge?.getAttribute('aria-label')).toBe('Data status: Live · Just now')
  })

  it('renders "Offline" when network is offline', async () => {
    const timestamp = new Date(Date.now() - 60000) // 1m ago
    await mount({ timestamp, isOffline: true })

    expect(container.textContent).toContain('Offline · 1m ago')
    const badge = container.querySelector('[role="status"]')
    expect(badge).toBeTruthy()
    expect(badge?.getAttribute('aria-label')).toBe('Data status: Offline · 1m ago')
  })

  it('renders "Cached" when age exceeds stale threshold', async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
    await mount({ timestamp: tenMinutesAgo, isOffline: false, staleThresholdSeconds: 300 })

    expect(container.textContent).toContain('Cached · 10m ago')
    const badge = container.querySelector('[role="status"]')
    expect(badge?.getAttribute('aria-label')).toBe('Data status: Cached · 10m ago')
  })

  it('renders a 44x44px touch target refresh button when onRefresh is provided (Law 15)', async () => {
    const onRefresh = vi.fn()
    await mount({ timestamp: new Date(), onRefresh, isOffline: false })

    const refreshBtn = container.querySelector('button[aria-label="Refresh operational data"]') as HTMLButtonElement | null
    expect(refreshBtn).toBeTruthy()
    expect(refreshBtn?.style.minWidth).toBe('44px')
    expect(refreshBtn?.style.minHeight).toBe('44px')

    await act(async () => {
      refreshBtn?.click()
    })
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('omits refresh button when offline', async () => {
    const onRefresh = vi.fn()
    await mount({ timestamp: new Date(), onRefresh, isOffline: true })

    const refreshBtn = container.querySelector('button[aria-label="Refresh operational data"]')
    expect(refreshBtn).toBeNull()
  })

  it('returns null if no timestamp is provided', async () => {
    await mount({ timestamp: null })
    expect(container.innerHTML).toBe('')
  })
})
