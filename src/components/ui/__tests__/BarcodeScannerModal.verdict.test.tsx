// @vitest-environment jsdom
/**
 * # The scanner modal — one scan, one verdict
 *
 * **PK-09.** This modal used to beep success and print its own `matchLabel`
 * ("marked — recorded at session close, nothing saved yet") for every identity
 * match, then hand the item to the consuming screen and never look at what
 * happened there. On a second scan of an already-ticked unit,
 * `PackingWorkspace.pack` wrote "already packed" into the rail behind the open
 * modal: the operator was told the opposite of what was recorded, and the
 * record was the one they could not see. The consumer now answers with a
 * `ScanOutcome`, and this suite pins that the answer is what reaches the
 * screen — banner and session log alike.
 *
 * **PK-07.** The "Available Items for Test Scanning" chips shipped in every
 * build: a list of every scannable unit and its serial, one tap from filling
 * the scan field, on a production floor. They are now behind
 * `import.meta.env.DEV`, which `vite build` folds to `false`.
 *
 * Environment pragma per `vitest.config.ts`, which keeps the suite on `node`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BarcodeScannerModal, type ScanOutcome, type ScannableItem } from '../BarcodeScannerModal'

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => 'desktop' as const,
}))
;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

window.matchMedia = ((query: string) =>
  ({
    matches: query.includes('hover: hover'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList) as typeof window.matchMedia

const ITEMS: ScannableItem[] = [
  { id: 'row-1', name: 'Sony FX3', serial: 'SN-102' },
  { id: 'row-2', name: 'Gaffer tape', isAccessory: true },
]

let root: Root | null = null
let host: HTMLDivElement | null = null

let mockNow = 1700000000000
beforeEach(() => {
  mockNow = 1700000000000
  vi.spyOn(Date, 'now').mockImplementation(() => {
    mockNow += 3000
    return mockNow
  })
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function mount(onItemScanned: (item: ScannableItem) => ScanOutcome | void) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root?.render(
      <BarcodeScannerModal
        isOpen
        onClose={() => {}}
        mode="pack"
        bookingId="B-901"
        items={ITEMS}
        onItemScanned={onItemScanned}
      />,
    )
  })
}

const text = () => host?.textContent ?? ''

/** Type into the controlled scan field the way React's onChange will see it. */
async function scan(code: string) {
  const input = host?.querySelector('input[type="text"]') as HTMLInputElement
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setValue?.call(input, code)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const scanButton = [...(host?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Scan')
  await act(async () => {
    scanButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('PK-09 — the consumer decides what the operator is told', () => {
  it('shows the consumer’s refusal instead of a success it did not earn', async () => {
    let seen = 0
    await mount(() => {
      seen += 1
      return seen === 1
        ? { ok: true, message: 'scanned and ticked packed — nothing is recorded until Complete Packing.' }
        : { ok: false, message: 'was already ticked packed — nothing changed.' }
    })

    await scan('SN-102')
    expect(text()).toContain('scanned and ticked packed')

    await scan('SN-102')
    expect(seen).toBe(2)
    expect(text()).toContain('was already ticked packed — nothing changed.')
    // The default would have claimed a mark on a scan that made none.
    expect(text()).not.toContain('marked — recorded at session close')
  })

  it('carries the same verdict into the session log, not a different one', async () => {
    await mount(() => ({ ok: false, message: 'was already ticked packed — nothing changed.' }))
    await scan('SN-102')
    // Once in the result banner, once in the log below it — one answer, twice.
    const occurrences = text().split('was already ticked packed').length - 1
    expect(occurrences).toBe(2)
  })

  it('names the unit that was scanned, so the verdict is attributable', async () => {
    await mount(() => ({ ok: false, message: 'was already ticked packed — nothing changed.' }))
    await scan('SN-102')
    expect(text()).toContain('Sony FX3 (SN-102)')
  })

  it('falls back to matchLabel for a consumer that answers nothing', async () => {
    await mount(() => undefined)
    await scan('SN-102')
    expect(text()).toContain('marked — recorded at session close, nothing saved yet')
  })

  it('refuses an unscannable row for the reason the flag actually carries', async () => {
    let called = 0
    await mount(() => {
      called += 1
    })
    // `isAccessory` is set by every floor workspace from "no serial and no
    // asset tag" — the refusal used to call such a row "a child accessory",
    // which is a classification nobody supplied.
    await scan('row-2')
    expect(called).toBe(0)
    expect(text()).toContain('has no serial or asset tag to scan')
    expect(text()).not.toContain('child accessory')
  })

  it('still refuses a code that matches nothing, before the consumer is called', async () => {
    let called = 0
    await mount(() => {
      called += 1
    })
    await scan('SN-999')
    expect(called).toBe(0)
    expect(text()).toContain('does not match any scannable item in this booking (B-901)')
  })
})

describe('PK-07 — the test affordance does not ship', () => {
  it('is gone from a production build', async () => {
    vi.stubEnv('DEV', false)
    await mount(() => undefined)
    expect(text()).not.toContain('Test Scanning')
    expect(text()).not.toContain('Development build only')
    // The chip carried the unit's serial — that is what must not be tappable.
    expect(text()).not.toContain('Sony FX3 (SN-102)')
  })

  it('says what it is in a development build, rather than posing as a scan', async () => {
    await mount(() => undefined)
    expect(text()).toContain('Development build only — fills the scan field, does not scan')
    // The heading it replaced invited an operator to scan by tapping.
    expect(text()).not.toContain('Available Items for Test Scanning')
  })
})

describe('Phase 8 — Camera controls & Law 15 accessibility', () => {
  it('renders a camera toggle and continuous mode option', async () => {
    await mount(() => undefined)
    const cameraBtn = [...(host?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.includes('Camera Scan'))
    expect(cameraBtn).toBeDefined()
    expect(text()).toContain('Continuous mode')
  })

  it('keeps the manual entry input at 44px minHeight (Law 15)', async () => {
    await mount(() => undefined)
    const input = host?.querySelector('input[type="text"]') as HTMLInputElement
    expect(input.style.minHeight).toBe('44px')
  })

  it('toggles camera state when the camera button is clicked', async () => {
    await mount(() => undefined)
    const cameraBtn = [...(host?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.includes('Camera Scan'))
    await act(async () => {
      cameraBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const stopBtn = [...(host?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.includes('Stop Camera'))
    expect(stopBtn).toBeDefined()
  })
})
