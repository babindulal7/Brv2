// @vitest-environment jsdom
/**
 * Inline edit on Booking Detail.
 *
 * Two claims worth pinning here rather than on the hook:
 *
 * 1. The **Transport & Delivery** card's Edit button used to be
 *    `<Button variant="ghost">Edit</Button>` with no `onClick` at all — a
 *    control that did nothing when pressed. It now unlocks the page.
 * 2. Payments and deposit movements are **immutable** (`dataAccess.ts:102`), so
 *    no pencil is offered on either and the card says which correction is.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'

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

const { default: BookingDetail } = await import('../BookingDetail')

let container: HTMLDivElement
let root: Root

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/rentals/B-715']}>
        <ToastProvider>
          <Routes>
            <Route path="/rentals/:bookingNo" element={<BookingDetail />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    )
  })
}

function buttons(label: string) {
  return [...container.querySelectorAll('button')].filter((b) => b.textContent?.trim() === label)
}

function field(key: string): HTMLInputElement | HTMLTextAreaElement | null {
  return container.querySelector(`#edit-${key}`)
}

async function click(el: Element | undefined) {
  await act(async () => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function type(el: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  if (!el) throw new Error('field not rendered')
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
  await act(async () => {
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const text = () => container.textContent ?? ''

beforeEach(async () => {
  await mount()
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('BookingDetail — inline edit', () => {
  it("the Transport card's Edit button actually does something now", async () => {
    const edit = buttons('Edit')
    expect(edit.length).toBe(1)
    expect(field('vehicle')).toBeNull()

    await click(edit[0])
    expect(field('vehicle')).not.toBeNull()
    expect(field('deliveryType')).not.toBeNull()
  })

  it('unlocks the whole page, not just the card that was pressed', async () => {
    await click(buttons('Edit')[0])
    // Block 1's fields live in a different card and unlock with the same press.
    expect(field('place')).not.toBeNull()
    expect(field('days')).not.toBeNull()
  })

  it('sprouts no Save buttons until something is typed', async () => {
    await click(buttons('Edit')[0])
    expect(buttons('Save')).toHaveLength(0)

    await type(field('place'), 'Pokhara')
    expect(buttons('Save')).toHaveLength(1)
  })

  it('saves a field and shows the new value in read mode', async () => {
    await click(buttons('Edit')[0])
    await type(field('place'), 'Pokhara')
    await click(buttons('Save')[0])
    await click(buttons('Done')[0])

    expect(field('place')).toBeNull()
    expect(text()).toContain('Pokhara')
  })

  it('refuses fewer than one rental day', async () => {
    await click(buttons('Edit')[0])
    await type(field('days'), '0')
    await click(buttons('Save')[0])
    expect(text()).toContain('Rental days must be at least 1')
  })

  it('vehicle and driver save as one write — a delivery is not half a delivery', async () => {
    await click(buttons('Edit')[0])
    await type(field('driver'), 'Ramesh')
    await type(field('vehicle'), '')
    await click(buttons('Save')[0])
    // The failing sibling blocks the group; both stay dirty.
    expect(text()).toContain('Name the vehicle')
    expect(buttons('Save').length).toBeGreaterThan(0)
  })

  it('refuses to leave edit mode with unsaved work, and names it', async () => {
    await click(buttons('Edit')[0])
    await type(field('place'), 'Chitwan')
    await click(buttons('Done')[0])
    expect(text()).toContain('Unsaved: place')
    expect(field('place')).not.toBeNull()
  })

  it('offers no pencil on payments or deposits, and names the real correction', () => {
    expect(field('payment')).toBeNull()
    expect(text()).toContain('Payments and deposit movements are immutable')
    expect(text()).toContain('reversal row or a credit note')
  })

  it('says plainly that nothing is persisted yet', async () => {
    await click(buttons('Edit')[0])
    expect(text()).toContain('not persisted yet')
  })
})
