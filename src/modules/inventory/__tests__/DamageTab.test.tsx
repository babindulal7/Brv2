// @vitest-environment jsdom
/**
 * The Damage tab's wiring. `lib/__tests__/damage.test.ts` pins the rules; this
 * pins that the screen reads them rather than computing its own — and that the
 * money half stays behind `useCanViewMoney`, because the finding is raised on a
 * Warehouse screen that Foundation §8.3 keeps every Rs figure off.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

const role = { current: 'Owner' as string }
const canSeeMoney = { current: true }

vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => canSeeMoney.current }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: role.current, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { DamageTab } = await import('../DamageTab')

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter>
        <DamageTab />
      </MemoryRouter>,
    )
  })
}

const text = () => container.textContent ?? ''

function buttons(re: RegExp) {
  return [...container.querySelectorAll('button')].filter((b) => re.test(b.textContent ?? ''))
}

async function click(el: Element | undefined) {
  await act(async () => el?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

async function typeCharge(id: string, value: string) {
  const el = container.querySelector<HTMLInputElement>(`#damage-charge-${id}`)
  if (!el) throw new Error(`no charge field for ${id}`)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  await act(async () => el.dispatchEvent(new Event('input', { bubbles: true })))
}

beforeEach(() => {
  role.current = 'Owner'
  canSeeMoney.current = true
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('DamageTab — the money half', () => {
  it('routes a sub-threshold charge to a Manager and an over-threshold one to the Owner', async () => {
    await mount()
    // DMG-0041 is Rs 8,000; DMG-0042 is Rs 1,85,000.
    expect(text()).toContain('Manager approves')
    expect(text()).toContain('Owner approves')
  })

  it('labels the replacement value as a reference, never as the charge', async () => {
    await mount()
    expect(text()).toContain('(reference only)')
  })

  it('re-routes to the Owner as soon as the charge crosses the threshold', async () => {
    await mount()
    expect(text()).toContain('Manager approves')
    await typeCharge('DMG-2026-0041', '25000')
    // Same finding, now at exactly the threshold — the boundary is inclusive.
    const managerChips = text().match(/Manager approves/g) ?? []
    expect(managerChips).toHaveLength(0)
  })

  it('derives the refund and never shows a negative one', async () => {
    await mount()
    // DMG-0041: deposit 50,000 − charge 8,000 = 42,000 refund.
    expect(text()).toContain('42,000')
    // DMG-0042: deposit 1,50,000 − charge 1,85,000 → refund 0, shortfall 35,000.
    expect(text()).toContain('Not covered by the deposit')
    expect(text()).not.toMatch(/-\s?Rs/)
  })

  it('says the accountant confirms before the refund is issued', async () => {
    await mount()
    expect(text()).toContain('accountant confirms before the refund is issued')
  })

  it('warns when the charge exceeds replacement value without blocking approval', async () => {
    await mount()
    await typeCharge('DMG-2026-0041', '90000')
    expect(text()).toContain("above the asset's replacement value")
    const approve = buttons(/Approve as/)[0] as HTMLButtonElement
    expect(approve.disabled).toBe(false)
  })

  it('approving moves the unit to Maintenance and out of booking', async () => {
    await mount()
    await click(buttons(/Approve as/)[0])
    expect(text()).toContain('moved to Maintenance and is no longer available for booking')
  })
})

describe('DamageTab — approval authority', () => {
  it('a Manager cannot approve an over-threshold finding, and is told why', async () => {
    role.current = 'Manager'
    await mount()
    expect(text()).toContain('needs Owner approval')
    expect(text()).toContain('Your role is Manager')
  })

  it('a Manager can still approve a sub-threshold finding', async () => {
    role.current = 'Manager'
    await mount()
    const enabled = buttons(/Approve as Manager/).filter((b) => !(b as HTMLButtonElement).disabled)
    expect(enabled.length).toBeGreaterThan(0)
  })
})

describe('DamageTab — §8.3', () => {
  it('shows a money-blind role the damage but not the charges', async () => {
    canSeeMoney.current = false
    role.current = 'Warehouse'
    await mount()
    expect(text()).toContain('Centre column locking collar cracked')
    expect(text()).toContain('Charges and deposit settlement are not shown to this role')
    expect(text()).not.toContain('Replacement value')
    expect(text()).not.toContain('Deposit held')
  })
})
