// @vitest-environment jsdom
/**
 * # Law 6 on the Cases queue — the gate is the session, and nothing on the page can move it
 *
 * `CasesQueue.tsx` used to compute `money` from `canViewMoney(role)` where
 * `role` was a **local `useState`** driven by a "Viewing as" `<select>` in the
 * page header. That is not a gate. A Warehouse session — is_staff true,
 * can_view_money **false** at the database — could pick `Owner` from the box
 * and the screen would draw Exposure, Recovered This Month, the Assessed and
 * Outstanding columns and the whole Financial Impact rail. A control that
 * changes what money a session sees is a privilege-escalation control however
 * it is labelled, so the dropdown is gone and the gate is `useCanViewMoney()`.
 *
 * These tests therefore assert two different things, and both matter:
 *
 *  1. **The four money-blind roles, and a signed-out visitor, reach no money.**
 *     Not masked, not `••••` — absent, per Foundation §8.3 and `rbac.ts`'s
 *     "forbidden items are ABSENT from UI / Data".
 *  2. **No control rendered on this surface can turn money on.** Every button
 *     and every `<select>` on the page is driven while signed in as Warehouse,
 *     and the screen still carries no rupee figure afterwards. That is the
 *     assertion the old dropdown fails, and it fails it without needing to know
 *     the dropdown ever existed — so it also catches the next one.
 *
 * `lib/moneyVisibility` is deliberately **not** mocked. Mocking it would test
 * the mock; the point is that the real `useAuth → canViewMoney` path runs.
 * Only the session underneath it is replaced.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { Role } from '../../../lib/rbac'

/** The signed-in session under test. `null` is a signed-out / not-yet-resolved visitor. */
let sessionRole: Role | null = 'Owner'

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user:
      sessionRole === null
        ? null
        : { id: '00000000-0000-0000-0000-0000000001ff', name: 'Test Session', role: sessionRole, isSharedDevice: false },
    loading: false,
    signIn: async () => ({ error: null }),
    logout: () => {},
    isLocked: false,
    setLocked: () => {},
  }),
}))

window.matchMedia = ((q: string) => ({
  matches: q.includes('hover: hover'),
  media: q,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: CasesQueue } = await import('../CasesQueue')

let container: HTMLDivElement
let root: Root

async function mount(width = 1280) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/operations?queue=cases']}>
        <CasesQueue />
      </MemoryRouter>,
    )
  })
}

const text = () => container.textContent ?? ''
const headers = () => [...container.querySelectorAll('th')].map((h) => h.textContent?.trim() ?? '')
const railTitles = () => [...container.querySelectorAll('h3')].map((h) => h.textContent?.trim() ?? '')
const kpiCards = () => container.querySelector('section[aria-label="Key figures"]')?.children.length ?? 0

/**
 * `formatMoney` renders `Rs 1,39,506` — the space-then-digit is what makes this
 * safe against a stray "Rs" inside prose. One match anywhere is one rupee too
 * many for a money-blind session.
 */
const RUPEES = /Rs\s\d/

beforeEach(() => {
  sessionRole = 'Owner'
})

/**
 * Unmount + detach. Called from `afterEach` where a block mounts per test, and
 * from `afterAll` where a block shares one mount — see the note below.
 */
async function teardown() {
  if (root) await act(async () => root.unmount())
  container?.remove()
}

/**
 * ## Why the money-blind block mounts ONCE per role
 *
 * `CasesQueue.tsx` is 1023 lines and a full mount costs 2.4-6.1s under jsdom.
 * With four assertions per role and five roles this file was paying for twenty
 * mounts, and the first assertion of each role regularly crossed vitest's 5000ms
 * default — `Warehouse: no rupee figure is rendered anywhere on the page` failed
 * roughly one run in five with `Test timed out in 5000ms`, in isolation, on an
 * otherwise idle machine.
 *
 * A Law 6 test that fails one run in five is worse than no test: it trains
 * whoever sees it red to re-run rather than to look. The fix is to stop paying
 * the cost, not to widen the allowance — the four assertions are read-only, so
 * they can share one render without weakening any of them. Twenty mounts become
 * five, and each assertion is still its own `it` with its own name.
 *
 * The two blocks below that DRIVE the page (clicking every button, changing
 * every select) still mount per test, because they mutate what they measure.
 */


/** `rbac.ts`'s `MONEY_BLIND`, plus the signed-out case. */
const MONEY_BLIND: Array<Role | null> = ['Warehouse', 'Technician', 'Driver', 'Client', null]

describe('Law 6 — the money-blind floor reaches no money on Cases', () => {
  for (const role of MONEY_BLIND) {
    const name = role ?? 'signed out'

    describe(`${name}`, () => {
      // One render per role, shared by the four read-only assertions below.
      beforeAll(async () => {
        sessionRole = role
        await mount()
      })
      afterAll(teardown)

      it(`${name}: no rupee figure is rendered anywhere on the page`, () => {
        expect(text()).not.toMatch(RUPEES)
      })

      it(`${name}: Assessed and Outstanding are absent columns, not masked ones`, () => {
        expect(headers()).not.toContain('Assessed')
        expect(headers()).not.toContain('Outstanding')
        // Absent, not blanked: the row keeps the columns it is allowed to have.
        expect(headers()).toContain('Status')
      })

      it(`${name}: the Financial Impact rail section is not built`, () => {
        expect(railTitles()).not.toContain('Financial Impact')
        // The rail itself still renders — this is a money gate, not a blank screen.
        expect(railTitles()).toContain('Timeline')
      })

      it(`${name}: the KPI strip drops to the two non-money figures`, () => {
        expect(kpiCards()).toBe(2)
      })
    })
  }
})

describe('a money-capable session still sees the figures (so the tests above can fail)', () => {
  afterEach(teardown)

  it('Owner gets four KPI cards, both money columns, and Financial Impact', async () => {
    sessionRole = 'Owner'
    await mount()
    expect(kpiCards()).toBe(4)
    expect(headers()).toContain('Assessed')
    expect(headers()).toContain('Outstanding')
    expect(railTitles()).toContain('Financial Impact')
    expect(text()).toMatch(RUPEES)
  })

  it('Accounts sees money too — the gate is the rule, not an Owner special case', async () => {
    sessionRole = 'Accounts'
    await mount()
    expect(text()).toMatch(RUPEES)
    expect(headers()).toContain('Assessed')
  })
})

describe('no control on this surface can change what money the session sees', () => {
  // These two mutate what they measure, so each needs its own render.
  afterEach(teardown)

  it('Warehouse: there is no role switcher — no select offers a role, and nothing says "Viewing as"', async () => {
    sessionRole = 'Warehouse'
    await mount()

    expect(text()).not.toContain('Viewing as')
    const roleNames = ['Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver']
    for (const select of container.querySelectorAll('select')) {
      const options = [...select.querySelectorAll('option')].map((o) => o.value)
      for (const r of roleNames) expect(options).not.toContain(r)
    }
  })

  it('Warehouse: driving every button and select on the page leaves the screen money-free', async () => {
    sessionRole = 'Warehouse'
    await mount()

    // Every enabled button, in order. Chips, flags, pager, rows-per-page, the
    // row `⋮` menus — whatever a user can reach without leaving this screen.
    const buttons = [...container.querySelectorAll('button')].filter((b) => !b.disabled)
    for (const b of buttons) {
      await act(async () => {
        b.click()
      })
    }

    // And every option of every select, since a `<select>` was the original hole.
    for (const select of container.querySelectorAll('select')) {
      for (const option of [...select.querySelectorAll('option')]) {
        await act(async () => {
          select.value = option.value
          select.dispatchEvent(new Event('change', { bubbles: true }))
        })
      }
    }

    expect(text()).not.toMatch(RUPEES)
    expect(headers()).not.toContain('Assessed')
    expect(headers()).not.toContain('Outstanding')
    expect(railTitles()).not.toContain('Financial Impact')
    expect(kpiCards()).toBe(2)
    /*
     * 20s, not the 5000ms default. This test clicks every enabled button and
     * every option of every select, each inside its own `act()`, so it pays for
     * a re-render of a 1023-line component per interaction — it measured 5175ms
     * on the run that timed out. The budget is raised here and ONLY here,
     * because this test's cost is inherent to what it does; the assertions are
     * unchanged. Widening the default for the whole file would have hidden the
     * mount cost that the block above actually fixed.
     */
  }, 20_000)
})
