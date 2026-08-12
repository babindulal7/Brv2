// @vitest-environment jsdom
/**
 * **Law 6 on nav item 10, driven rather than read.**
 *
 * Tools became a nav item in the wireframe rewrite, which put a labelled route
 * to two money screens — Depreciation (`10_TOOLS.md` §10.2, "purchase date ·
 * price … opening │ dep │ WDV") and Pricing (§10.3, "rate / discount chips ·
 * VAT") — into the sidebar, the tablet rail and the phone More sheet of every
 * money-blind role. `data/nav.test.ts` proves the predicate; this proves the
 * page applies it, and that the four admin cards the spec restricts for nobody
 * are still there.
 *
 * `rbac.ts`: forbidden items are **absent**, not disabled — so the assertions
 * are about what is not in the document, not about a disabled attribute.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { Viewport } from '../../../lib/device'

let viewport: Viewport = 'desktop'
let money = true

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => viewport,
}))
vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => money }))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: ToolsLanding } = await import('../ToolsLanding')

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ToolsLanding />
      </MemoryRouter>,
    )
  })
}

const hrefs = (): string[] =>
  [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '')

beforeEach(() => {
  viewport = 'desktop'
  money = true
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('Tools landing — Law 6', () => {
  it('shows all six cards to a role that may see money', async () => {
    await mount()
    expect(hrefs()).toEqual(
      expect.arrayContaining([
        '/tools/depreciation',
        '/tools/pricing',
        '/tools/audit-log',
        '/tools/activity-log',
        '/tools/numbering',
        '/tools/backup',
      ]),
    )
    expect(container.textContent).toContain('Calculators')
  })

  it('omits both calculators for a money-blind role', async () => {
    money = false
    await mount()
    expect(hrefs()).not.toContain('/tools/pricing')
    expect(hrefs()).not.toContain('/tools/depreciation')
    expect(container.textContent).not.toContain('Depreciation')
    expect(container.textContent).not.toContain('Pricing')
  })

  it('drops the emptied group rather than leaving a heading over nothing', async () => {
    money = false
    await mount()
    expect(container.textContent).not.toContain('Calculators')
  })

  it('keeps the four admin cards — 10_TOOLS.md restricts none of them', async () => {
    money = false
    await mount()
    expect(hrefs()).toEqual(
      expect.arrayContaining([
        '/tools/audit-log',
        '/tools/activity-log',
        '/tools/numbering',
        '/tools/backup',
      ]),
    )
  })
})

/**
 * `WIREFRAME_RULINGS_2026-08-12.md` §6 closes the open question this page's
 * header used to carry: the cinematography suite is **kept**, it gets its own
 * group as a seventh card, and it lives at `/tools/cinematography` —
 * *"pick `/tools/cinematography`, redirect the old path, and note it."*
 *
 * Both halves are asserted, because both are reversible by accident: a session
 * reading spec 10's "Six cards… Nothing else" would delete the card, and a
 * session reading the suite's own "Settings ▸ Tools" header would move it back.
 */
describe('Tools landing — Rulings §6, the cinematography suite', () => {
  it('keeps the suite as a seventh card, in its own group', async () => {
    await mount()
    expect(container.textContent).toContain('Cinematography suite')
    expect(hrefs()).toContain('/tools/cinematography')
  })

  it('no longer points at /settings/tools, which spec 11 has no section for', async () => {
    await mount()
    expect(hrefs()).not.toContain('/settings/tools')
  })

  it('is not a money surface — the floor keeps its camera calculators', async () => {
    money = false
    await mount()
    expect(hrefs()).toContain('/tools/cinematography')
  })

  it('does not advertise either calculator as unbuilt now that both exist', async () => {
    await mount()
    expect(container.textContent).not.toContain('Not built yet')
  })
})
