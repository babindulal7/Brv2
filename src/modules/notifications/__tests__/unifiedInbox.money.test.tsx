// @vitest-environment jsdom
/**
 * # Law 6 on the Unified Inbox — the gate is the whole money-blind set, not one role
 *
 * `UnifiedInbox.tsx` enforced Law 6 with a hand-rolled equality:
 *
 * ```ts
 * // Role permissions (Law 6)
 * const isWarehouse = user?.role === 'Warehouse'
 * ```
 *
 * `MONEY_BLIND` in `lib/rbac` is **Warehouse, Technician, Driver and Client**.
 * So three of the four roles the law names read the client's Lifetime Spend,
 * Rental Outstanding and Deposit Held in full, on a screen whose own comment
 * claimed "Strict Law 6 compliance" — and the Client role read them in the
 * external portal. A technician holding a tablet in front of a client is the
 * exact situation the rule was widened to cover.
 *
 * There is no browser route to this: the dev auth bypass signs in as Owner and
 * the app has no role switcher, so the money-blind render of this screen is
 * reachable only from here. That is why this file exists.
 *
 * Two surfaces are asserted, because the audit found the second one while
 * chasing the first:
 *
 *  1. **The Account Summary rail.** Absent figures, not masked ones — `rbac.ts`
 *     says "forbidden items are ABSENT from UI / Data" and `lib/moneyVisibility`
 *     tells call sites to omit rather than mask. The old italic
 *     "Monetary amounts masked for Warehouse role per Law 6" was both.
 *  2. **The message templates.** "Outstanding Payment Notice" interpolates the
 *     client's balance into the composer. It was gated by nothing at all, so it
 *     leaked money to the same three roles by a different door.
 *
 * `lib/moneyVisibility` is deliberately **not** mocked — mocking it would test
 * the mock. The real `useAuth → canViewMoney` path runs and only the session
 * underneath it is replaced, so if `MONEY_BLIND` ever changes, these tests move
 * with it.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { Role } from '../../../lib/rbac'

/** The signed-in session. `null` is a signed-out / not-yet-resolved visitor. */
const auth = vi.hoisted(() => ({ role: 'Owner' as Role | null }))

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user:
      auth.role === null
        ? null
        : { id: '00000000-0000-0000-0000-0000000001ff', name: 'Test Session', role: auth.role, isSharedDevice: false },
    loading: false,
    signIn: async () => ({ error: null }),
    logout: () => {},
    isLocked: false,
    setLocked: () => {},
  }),
}))

/**
 * The screen imports `RecordPaymentModal`, which pulls the Supabase client in at
 * module load. Nothing in this file reaches a database — the inbox renders from
 * `data/inbox` seed constants — so the boundary is stubbed rather than exercised.
 */
vi.mock('../../../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ then: (f: (v: unknown) => unknown) => f({ data: [], error: null, count: 0 }) }) }) },
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
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

const { default: UnifiedInbox } = await import('../UnifiedInbox')

let container: HTMLDivElement
let root: Root

async function mount(width = 1280) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/notifications/inbox']}>
        <UnifiedInbox />
      </MemoryRouter>,
    )
  })
}

async function teardown() {
  if (root) await act(async () => root.unmount())
  container?.remove()
}

const text = () => container.textContent ?? ''

/**
 * A button's own label.
 *
 * ⚠ Not `textContent`. `components/ui/Button` types `icon` as `ReactNode` and
 * renders it raw, while this screen passes the icon NAME — `icon="checklist"` —
 * so the string renders as literal text and `textContent` reads
 * "checklistTemplates". (`components/ui/Page` exports a DIFFERENT `Button`
 * typed `icon?: IconName` that renders an SVG, which is why the Finance suite's
 * equivalent helper can anchor on `textContent` and this one cannot.) That
 * mis-typed call site is a real defect on this screen and is reported, but it is
 * not this pass's defect class and is left alone.
 *
 * `Button` always renders `<span>{children}</span>` last for a button with no
 * `iconRight`, so the last element child is the label.
 */
const labelOf = (b: Element) => (b.lastElementChild?.textContent ?? b.textContent ?? '').trim()

const byLabel = (re: RegExp) => [...container.querySelectorAll('button')].find((b) => re.test(labelOf(b)))

/** Opens the Templates picker, which is where the second money surface lives. */
async function openTemplates() {
  const btn = byLabel(/^Templates$/)
  expect(btn).toBeDefined()
  await act(async () => {
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/**
 * `formatMoney` renders `Rs 1,39,506` — requiring a digit after the space keeps
 * this from tripping on the word "Rs" inside prose or on the template body's
 * un-substituted `Rs {{outstanding_amount}}`. One match is one rupee too many.
 */
const RUPEES = /Rs\s\d/

/** `rbac.ts`'s `MONEY_BLIND`, plus the signed-out case that must not fail open. */
const MONEY_BLIND: Array<Role | null> = ['Warehouse', 'Technician', 'Driver', 'Client', null]

describe('Law 6 — the money-blind floor reaches no money on the Unified Inbox', () => {
  for (const role of MONEY_BLIND) {
    const name = role ?? 'signed out'

    describe(`${name}`, () => {
      // One render per role, shared by the read-only assertions below.
      beforeAll(async () => {
        auth.role = role
        await mount()
      })
      afterAll(teardown)

      it(`${name}: no rupee figure is rendered anywhere on the page`, () => {
        expect(text()).not.toMatch(RUPEES)
      })

      it(`${name}: the three money rows are absent, not masked`, () => {
        expect(text()).not.toContain('Lifetime Spend')
        expect(text()).not.toContain('Rental Outstanding')
        expect(text()).not.toContain('Deposit Held')
      })

      it(`${name}: the booking COUNT stays — this is a money gate, not a blank rail`, () => {
        expect(text()).toContain('Account Summary')
        expect(text()).toContain('Total Bookings')
        // The rest of the rail is untouched by a money gate.
        expect(text()).toContain('Client Identity')
        expect(text()).toContain('Consent Status')
      })

      it(`${name}: the old Warehouse-only mask notice is gone`, () => {
        // It named one role to four, and masked where Law 6 says omit.
        expect(text()).not.toContain('masked for Warehouse role')
        expect(text()).not.toContain('Financial Summary')
      })

      it(`${name}: no payment launcher — seeing money and moving it are both refused`, () => {
        expect(byLabel(/^Receive Payment$/)).toBeUndefined()
      })

      it(`${name}: the money template is absent from the picker, the others are not`, async () => {
        await openTemplates()
        expect(text()).toContain('Approved Message Templates')
        // The one template body that interpolates a rupee figure.
        expect(text()).not.toContain('Outstanding Payment Notice')
        expect(text()).not.toContain('outstanding rental balance')
        // Omitted, not emptied: the non-money templates are still offered.
        expect(text()).toContain('Booking Pickup Confirmation')
        expect(text()).toContain('Damage Inspection Note')
        expect(text()).not.toMatch(RUPEES)
      })
    })
  }
})

/**
 * The other half. Without these, a gate that hid money from EVERY role would
 * satisfy every assertion above and still be wrong.
 */
describe('a money-capable session still sees the figures', () => {
  afterEach(teardown)

  it('Owner gets the three money rows, a real figure, and the payment template', async () => {
    auth.role = 'Owner'
    await mount()

    expect(text()).toContain('Account Summary')
    expect(text()).toContain('Total Bookings')
    expect(text()).toContain('Lifetime Spend')
    expect(text()).toContain('Rental Outstanding')
    expect(text()).toContain('Deposit Held')
    expect(text()).toMatch(RUPEES)

    await openTemplates()
    expect(text()).toContain('Outstanding Payment Notice')
  })

  /**
   * Coordinator is the case that proves the two questions stayed separate:
   * `canViewMoney` admits Coordinator, so the figures stand, and
   * `canRecordPayment` admits Coordinator too, so the launcher stands. Warehouse
   * above loses both. A gate that had collapsed visibility into permission would
   * pass one of these blocks and fail the other.
   */
  it('Coordinator keeps both the figures and the Receive Payment launcher', async () => {
    auth.role = 'Coordinator'
    await mount()
    expect(text()).toMatch(RUPEES)
    expect(byLabel(/^Receive Payment$/)).toBeDefined()
  })
})

/**
 * The fabricated figure the templates used to carry.
 *
 * `handleApplyTemplate` substituted the literal `'45,000'` for
 * `{{outstanding_amount}}`, producing "…has an outstanding rental balance of
 * Rs 45,000" in a message addressed to a named client and one Send click from
 * reaching them.
 *
 * ⚠ **Why it survived every review of this screen:** Rs 45,000 is exactly the
 * outstanding balance of `SEED_CONVERSATIONS[0]`, the thread the inbox opens on.
 * Anyone who opened the screen, clicked Templates and read the draft saw a
 * correct number. It goes wrong the moment the operator clicks a different
 * conversation first — which is the normal way to use an inbox.
 *
 * So the test deliberately does NOT use the default thread. It selects Kantipur
 * TV Network (Rs 1,20,000 outstanding) and asserts the draft quotes Kantipur's
 * balance. Under the old constant this draft told Kantipur they owed Mandala
 * Film Productions' money.
 */
describe('the payment template quotes the selected thread, not a constant', () => {
  afterEach(teardown)

  it('quotes the SELECTED client’s balance — the case the seed default hid', async () => {
    auth.role = 'Owner'
    await mount()

    /*
     * The conversation list is the first place the client's name appears in
     * document order (Col 2 precedes the thread header in Col 3 and the rail in
     * Col 4), so the first exact match is the list row. React delegates at the
     * root, so a bubbling click on the name reaches the row's handler.
     */
    const row = [...container.querySelectorAll('span')].find(
      (s) => s.textContent?.trim() === 'Kantipur TV Network',
    )
    expect(row).toBeDefined()
    await act(async () => {
      row!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    // The rail followed the click — otherwise the assertion below would be
    // measuring the default thread and would pass for the wrong reason.
    expect(text()).toContain('Rs 1,20,000')

    await openTemplates()
    const card = [...container.querySelectorAll('div')].find(
      (d) => d.textContent?.trim().startsWith('Outstanding Payment Notice'),
    )
    expect(card).toBeDefined()
    await act(async () => {
      card!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const composer = container.querySelector('textarea')
    expect(composer).not.toBeNull()
    const draft = composer!.value

    expect(draft).toContain('balance of Rs 1,20,000')
    // The constant, and another client's money in Kantipur's message.
    expect(draft).not.toContain('45,000')
    expect(draft).not.toContain('{{outstanding_amount}}')
  })
})
