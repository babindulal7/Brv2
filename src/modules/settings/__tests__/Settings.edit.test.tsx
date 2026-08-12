// @vitest-environment jsdom
/**
 * Settings, made editable.
 *
 * The audit's charge was specific: 108 fields, 59 rendered values, **4 inputs
 * in the whole 2,502-line file** — and each of those 59 rendered as a span with
 * a `chevron_down` on it, a select that opened nothing. So the claims worth
 * pinning are:
 *
 * - a value that is genuinely a setting becomes a **real control** on unlock,
 *   and what it saves actually persists (`lib/settingsStore`, localStorage —
 *   the layer `bookingRules.ts` said did not exist);
 * - a value that is a **product law** never gains an input, and says why;
 * - no field anywhere still wears the chevron that promised a menu.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui/Toast'
import { readSettings, resetSettings } from '../../../lib/settingsStore'

const role = { current: 'Owner' as string }

vi.mock('../../../lib/moneyVisibility', () => ({ useCanViewMoney: () => true }))
vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Babin Shrestha', role: role.current, isSharedDevice: false },
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

const { default: Settings } = await import('../Settings')

let container: HTMLDivElement
let root: Root

async function mount(search = '') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/settings${search}`]}>
        <ToastProvider>
          <Settings />
        </ToastProvider>
      </MemoryRouter>,
    )
  })
}

async function unmount() {
  await act(async () => root.unmount())
  container.remove()
}

function buttons(label: string) {
  return [...container.querySelectorAll('button')].filter((b) => b.textContent?.trim() === label)
}

function field(key: string): HTMLInputElement | HTMLSelectElement | null {
  return container.querySelector(`#edit-${key}`)
}

async function click(el: Element | undefined) {
  await act(async () => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function type(el: HTMLInputElement | null, value: string) {
  if (!el) throw new Error('field not rendered')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  await act(async () => {
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const text = () => container.textContent ?? ''

beforeEach(async () => {
  window.localStorage.clear()
  resetSettings()
  role.current = 'Owner'
})

afterEach(async () => {
  await unmount()
})

describe('Settings — the fake selects are gone', () => {
  it('renders no chevron-bearing pseudo-select on a read-only value', async () => {
    await mount('?tab=organization')
    /* The old markup put an `Icon name="chevron_down"` inside every value span.
       Nothing on the page should now promise a menu it does not have. */
    const values = [...container.querySelectorAll('span')].filter((s) =>
      /BS \+ AD \(Default\)|Lakh \/ crore grouping|Metric \(kg, cm\)/.test(s.textContent ?? ''),
    )
    expect(values.length).toBeGreaterThan(0)
    for (const v of values) expect(v.querySelector('svg')?.getAttribute('data-icon')).not.toBe('chevron_down')
  })

  it('a product law says why it is not a setting', async () => {
    await mount('?tab=organization')
    expect(text()).toContain('There is no single-calendar mode to switch to')
    expect(text()).toContain('groups this way and nothing else')
  })
})

describe('Settings — unlock and edit', () => {
  it('offers Edit settings to an Owner', async () => {
    await mount('?tab=financial')
    expect(buttons('Edit settings')).toHaveLength(1)
  })

  it('offers no Edit button to a role that cannot manage settings', async () => {
    role.current = 'Coordinator'
    await mount('?tab=financial')
    expect(buttons('Edit settings')).toHaveLength(0)
  })

  it('one button unlocks the page and VAT becomes a real input', async () => {
    await mount('?tab=financial')
    expect(field('vatRatePercent')).toBeNull()
    await click(buttons('Edit settings')[0])
    expect(field('vatRatePercent')).not.toBeNull()
    expect((field('vatRatePercent') as HTMLInputElement).value).toBe('13')
  })

  it('a product law gains no input even in edit mode', async () => {
    await mount('?tab=organization')
    await click(buttons('Edit settings')[0])
    // `weekStarts` is a real setting on the same card and does get one.
    expect(field('weekStarts')).not.toBeNull()
    // Calendar mode, number format and units have no key, so no control.
    expect(container.querySelector('#edit-calendarMode')).toBeNull()
    expect(container.querySelector('#edit-numberFormat')).toBeNull()
  })

  it('sprouts no Save buttons until something is typed', async () => {
    await mount('?tab=financial')
    await click(buttons('Edit settings')[0])
    expect(buttons('Save')).toHaveLength(0)
    await type(field('vatRatePercent') as HTMLInputElement, '15')
    expect(buttons('Save')).toHaveLength(1)
  })
})

describe('Settings — saving actually persists', () => {
  it('a saved VAT rate reaches the store, not just the screen', async () => {
    await mount('?tab=financial')
    await click(buttons('Edit settings')[0])
    await type(field('vatRatePercent') as HTMLInputElement, '15')
    await click(buttons('Save')[0])

    expect(readSettings().vatRatePercent).toBe(15)
    expect(buttons('Save')).toHaveLength(0)
  })

  it('and survives a full remount — the point of having a store at all', async () => {
    await mount('?tab=financial')
    await click(buttons('Edit settings')[0])
    await type(field('vatRatePercent') as HTMLInputElement, '15')
    await click(buttons('Save')[0])
    await unmount()

    await mount('?tab=financial')
    expect(text()).toContain('15%')
  })

  it('refuses an out-of-range rate inline, and keeps the draft', async () => {
    await mount('?tab=financial')
    await click(buttons('Edit settings')[0])
    await type(field('vatRatePercent') as HTMLInputElement, '140')
    await click(buttons('Save')[0])

    expect(text()).toContain('cannot exceed 100%')
    expect(readSettings().vatRatePercent).toBe(13)
    expect((field('vatRatePercent') as HTMLInputElement).value).toBe('140')
  })

  it('refuses to leave edit mode with unsaved work, and names the setting', async () => {
    await mount('?tab=financial')
    await click(buttons('Edit settings')[0])
    await type(field('vatRatePercent') as HTMLInputElement, '15')
    await click(buttons('Done')[0])

    expect(text()).toContain('Unsaved: vatRatePercent')
    expect(field('vatRatePercent')).not.toBeNull()
  })

  it('Reset to defaults clears an override', async () => {
    await mount('?tab=financial')
    await click(buttons('Edit settings')[0])
    await type(field('vatRatePercent') as HTMLInputElement, '15')
    await click(buttons('Save')[0])
    expect(readSettings().vatRatePercent).toBe(15)

    await click(buttons('Reset to defaults')[0])
    expect(readSettings().vatRatePercent).toBe(13)
  })

  it('one session timeout, surfaced on two tabs, cannot disagree', async () => {
    await mount('?tab=system')
    await click(buttons('Edit settings')[0])
    await type(field('sessionTimeoutMinutes') as HTMLInputElement, '45')
    await click(buttons('Save')[0])
    await unmount()

    // Security ▸ Access shows the same key, so it moved too.
    await mount('?tab=security')
    expect(text()).toContain('45 minutes')
  })
})
