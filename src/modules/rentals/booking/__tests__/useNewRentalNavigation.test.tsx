// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useNewRentalNavigation,
  type UseNewRentalNavigationOptions,
} from '../useNewRentalNavigation'

type NavigationOptions = Omit<UseNewRentalNavigationOptions, 'setOpen' | 'sections'>

const sections = ['Client', 'Rental period', 'Equipment', 'Crew', 'Delivery', 'Pricing']
const originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')
const scrollIntoView = vi.fn()

let root: Root
let container: HTMLDivElement
let options: NavigationOptions
let animationFrames: FrameRequestCallback[]

function NavigationHarness({ settings }: { settings: NavigationOptions }) {
  const [open, setOpen] = useState([true, true, false, false, false, false])
  const { runNoticeAction } = useNewRentalNavigation({ ...settings, setOpen, sections })

  return (
    <>
      <section id="section-0">
        <input aria-label="Client search" />
        <select aria-label="Project type" aria-hidden="true" tabIndex={-1}>
          <option>Hidden native select bridge</option>
        </select>
        <div hidden>
          <button type="button" role="combobox" aria-label="Project type">Hidden trigger</button>
        </div>
        <button type="button" role="combobox" aria-label="Project type">Select project type</button>
      </section>
      <section id="section-2">
        <div hidden={!open[2]}>
          <input aria-label="Equipment search" />
        </div>
      </section>
      <section id="rail-booking-summary" />
      <button type="button" onClick={() => runNoticeAction('Open Client & Dates')}>
        Open project type requirement
      </button>
    </>
  )
}

async function mount(overrides: Partial<NavigationOptions> = {}) {
  options = { ...options, ...overrides }
  await act(async () => root.render(<NavigationHarness settings={options} />))
}

async function shortcut(key: string, modifiers: Pick<KeyboardEventInit, 'ctrlKey' | 'metaKey'> = { ctrlKey: true }) {
  const event = new KeyboardEvent('keydown', { key, ...modifiers, bubbles: true, cancelable: true })
  await act(async () => {
    window.dispatchEvent(event)
  })
  await flushAnimationFrames()
  return event
}

async function flushAnimationFrames() {
  // Browser animation frames run after React has revealed the target section.
  const pending = animationFrames.splice(0)
  await act(async () => pending.forEach((callback) => callback(0)))
}

beforeEach(() => {
  animationFrames = []
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    animationFrames.push(callback)
    return animationFrames.length
  })
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
  scrollIntoView.mockClear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  options = {
    client: undefined,
    navigate: vi.fn(),
    setQuickViewOpen: vi.fn(),
    saveDraft: vi.fn(),
    saveQuote: vi.fn(),
    confirmBooking: vi.fn(),
    confirmBlocked: false,
    saveState: 'idle',
    onValidationAttempt: vi.fn(),
  }
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  if (originalScroll) Object.defineProperty(Element.prototype, 'scrollIntoView', originalScroll)
  else Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  vi.unstubAllGlobals()
})

describe('New Rental navigation shortcuts', () => {
  it('opens and focuses the first blocking section instead of confirming', async () => {
    await mount({ confirmBlocked: true, firstBlockingAction: 'Open Equipment' })
    const equipment = container.querySelector<HTMLInputElement>('[aria-label="Equipment search"]')!
    expect(equipment.closest('[hidden]')).not.toBeNull()

    const event = await shortcut('Enter')

    expect(event.defaultPrevented).toBe(true)
    expect(options.onValidationAttempt).toHaveBeenCalledOnce()
    expect(options.confirmBooking).not.toHaveBeenCalled()
    expect(equipment.closest('[hidden]')).toBeNull()
    expect(document.activeElement).toBe(equipment)
    expect(scrollIntoView.mock.instances).toContain(container.querySelector('#section-2'))
  })

  it('focuses the visible Project type combobox when its requirement action is used', async () => {
    await mount()
    const action = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Open project type requirement')!

    await act(async () => {
      action.click()
    })
    await flushAnimationFrames()

    const projectType = Array.from(container.querySelectorAll<HTMLButtonElement>('button[role="combobox"]')).find((button) => !button.closest('[hidden]'))!
    expect(document.activeElement).toBe(projectType)
    expect(document.activeElement).not.toBe(container.querySelector('select'))
    expect(options.confirmBooking).not.toHaveBeenCalled()
    expect(scrollIntoView.mock.instances).toContain(container.querySelector('#section-0'))
  })

  it('saves the quote on Ctrl+Enter while editing instead of confirming a new booking', async () => {
    await mount({ editBookingId: 'existing-quote', confirmBlocked: true, firstBlockingAction: 'Open Equipment' })

    const event = await shortcut('Enter')

    expect(event.defaultPrevented).toBe(true)
    expect(options.saveQuote).toHaveBeenCalledOnce()
    expect(options.confirmBooking).not.toHaveBeenCalled()
    expect(options.saveDraft).not.toHaveBeenCalled()
    expect(options.onValidationAttempt).not.toHaveBeenCalled()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it.each([undefined, 'existing-quote'])('prevents duplicate save and confirm shortcuts while saving (edit: %s)', async (editBookingId) => {
    await mount({ saveState: 'saving', editBookingId })

    const events = [
      await shortcut('Enter'),
      await shortcut('s'),
      await shortcut('Enter', { metaKey: true }),
      await shortcut('s', { metaKey: true }),
    ]

    expect(events.every((event) => event.defaultPrevented)).toBe(true)
    expect(options.confirmBooking).not.toHaveBeenCalled()
    expect(options.saveDraft).not.toHaveBeenCalled()
    expect(options.saveQuote).not.toHaveBeenCalled()
    expect(options.onValidationAttempt).not.toHaveBeenCalled()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
