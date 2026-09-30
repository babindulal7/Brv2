// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IntelCard } from '../IntelCard'

const capability = vi.hoisted(() => ({ hasHover: true }))
vi.mock('../../../lib/device', () => ({
  useCapability: () => ({ hasHover: capability.hasHover, coarsePointer: !capability.hasHover, reducedMotion: true, standalone: false }),
  useViewport: () => 'desktop',
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

afterEach(() => {
  capability.hasHover = true
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('direct Intel card', () => {
  it('shows the full record on hover without a Peek step, then closes on Escape', async () => {
    vi.useFakeTimers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => root.render(
      <MemoryRouter>
        <IntelCard
          glance={{ avatarLabel: 'BK', title: 'B-715', primaryAction: { label: 'Open booking', to: '/rentals/B-715' } }}
          detailTitle="B-715"
          detail={[{ title: 'Booking', fields: [{ label: 'Stage', value: 'Booked' }] }]}
        >
          <span data-intel-identifier>B-715</span>
        </IntelCard>
      </MemoryRouter>,
    ))

    const identifier = host.querySelector('[data-intel-identifier]') as HTMLElement
    await act(async () => identifier.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    expect(document.body.querySelector('[data-intel-overlay]')).toBeNull()
    await act(async () => vi.advanceTimersByTime(250))
    const card = document.body.querySelector('[data-intel-overlay]') as HTMLElement
    expect(card).not.toBeNull()
    expect(card.getAttribute('role')).toBe('dialog')
    expect(card.textContent).toContain('Stage')
    expect(card.textContent).toContain('Booked')
    expect(card.textContent).not.toContain('Detail Peek')
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.body.querySelector('[data-intel-overlay]')).toBeNull()
    await act(async () => root.unmount())
    host.remove()
  })

  it('opens the same record directly in a sheet after a touch long press', async () => {
    capability.hasHover = false
    vi.useFakeTimers()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => root.render(
      <MemoryRouter>
        <IntelCard glance={{ avatarLabel: 'BK', title: 'B-716' }} detailTitle="B-716" detail={[{ title: 'Booking', fields: [{ label: 'Stage', value: 'Packed' }] }]}>
          <span data-intel-identifier>B-716</span>
        </IntelCard>
      </MemoryRouter>,
    ))
    const identifier = host.querySelector('[data-intel-row]') as HTMLElement
    await act(async () => identifier.dispatchEvent(new Event('touchstart', { bubbles: true })))
    await act(async () => vi.advanceTimersByTime(500))
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Packed')
    expect(document.body.textContent).not.toContain('Detail Peek')
    await act(async () => root.unmount())
    host.remove()
  })
})
