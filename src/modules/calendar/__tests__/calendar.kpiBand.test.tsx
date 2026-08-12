// @vitest-environment jsdom
/**
 * # Calendar's KPI band — Rulings §1's Kept column, pinned by a gate
 *
 * `src/modules/calendar/` had no test file at all, which is exactly why the
 * 12 Aug rebuild could delete the four-card KPI band while `tsc --noEmit` and
 * 1794 passing tests stayed green. Rulings §1 lists *"Calendar's KPI band"* by
 * name among the panels that survive because no spec removes them in prose, and
 * the band's replacement note claimed the figures had moved into Full View —
 * a mode gated on `fullChoice && desktop`, so at tablet and phone they had
 * moved nowhere.
 *
 * This file makes the next removal fail a gate instead of an audit. It asserts
 * two things and nothing about styling:
 *
 *  1. the four labels render, at all three widths (Law 14 — width decides);
 *  2. Rulings §8 — Utilization renders "not tracked yet" rather than the
 *     render's hand-typed 84%, and no `52` / `18` / `84%` literal comes back.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({}) }) },
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => true }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: 'Owner', isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

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
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const Calendar = (await import('../Calendar')).default

let container: HTMLDivElement
let root: Root

/** Foundation's locked breakpoints — 768 and 1180. Width only (Law 14). */
async function mount(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/calendar']}>
        <Calendar />
      </MemoryRouter>,
    )
  })
}

afterEach(async () => {
  if (root) await act(async () => root.unmount())
  container?.remove()
})

const band = () => container.querySelector('section[aria-label="Key figures"]')

describe('Rulings §1 — the KPI band survives, at every width', () => {
  for (const [name, width] of [
    ['desktop', 1280],
    ['tablet', 900],
    ['phone', 375],
  ] as const) {
    it(`renders all four labels at ${name}`, async () => {
      await mount(width)
      const t = band()?.textContent ?? ''
      expect(t).toContain('Active Bookings')
      expect(t).toContain("Today's Operations")
      expect(t).toContain('Equipment Utilization')
      expect(t).toContain('Schedule Conflicts')
    })
  }
})

describe('Rulings §8 — derived or "not tracked yet", never a plausible default', () => {
  it('states Utilization is not tracked rather than printing the render’s 84%', async () => {
    await mount(1280)
    const t = band()?.textContent ?? ''
    expect(t).toContain('not tracked yet')
    expect(t).not.toContain('84%')
  })

  it('does not reinstate the hand-typed Active Bookings / Today’s Operations figures', async () => {
    await mount(1280)
    const t = band()?.textContent ?? ''
    // The old band read 52 and 18 against a seed that contains neither.
    expect(t).not.toMatch(/\b52\b/)
    expect(t).not.toMatch(/8% /)
  })
})
