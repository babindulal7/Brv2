// @vitest-environment jsdom
/**
 * # BarcodeScannerModal Test Suite (Phase 8 Hardware Hardening)
 *
 * Verifies:
 * - Matching scannable items by serial, tag, ID, or name
 * - Emitting domain events and firing onItemScanned callback
 * - Enforcing the Child Accessories Rule (accessories are checklist only, not scannable)
 * - Handling unknown barcodes with clear operator feedback
 * - Law 15 minimum 44px target requirements for all controls
 * - Timing instrumentation recorded per scan (<2s per item)
 * - Continuous mode toggle and auto-close behavior
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BarcodeScannerModal, type ScannableItem } from '../BarcodeScannerModal'
import { DomainEvents, EVENT_TYPES } from '../../../events/eventBus'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

// Mock BrowserMultiFormatReader from @zxing/browser
vi.mock('@zxing/browser', () => {
  return {
    BrowserMultiFormatReader: vi.fn().mockImplementation(() => ({
      decodeFromVideoDevice: vi.fn().mockReturnValue(Promise.resolve()),
      reset: vi.fn(),
    })),
  }
})

let container: HTMLDivElement
let root: Root

const SAMPLE_ITEMS: ScannableItem[] = [
  { id: 'item-1', name: 'Sony FX3 Body', serial: 'SN-FX3-991', assetTag: 'TAG-101' },
  { id: 'item-2', name: 'Sony 24-70mm GM II', serial: 'SN-GM-442', assetTag: 'TAG-102' },
  { id: 'item-3', name: 'Lens Cap 82mm', serial: 'SN-CAP-001', isAccessory: true },
]

function typeIntoInput(input: HTMLInputElement, text: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set
  nativeInputValueSetter?.call(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

async function mount(node: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(node)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
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
})

afterEach(async () => {
  if (root) {
    await act(async () => root.unmount())
  }
  container?.remove()
})

describe('BarcodeScannerModal — Phase 8 Hardware & Scanning', () => {
  it('scans and matches an item by serial number', async () => {
    const onItemScanned = vi.fn()
    const emitSpy = vi.spyOn(DomainEvents, 'emit')

    await mount(
      <BarcodeScannerModal
        isOpen={true}
        onClose={vi.fn()}
        mode="pack"
        bookingId="B-715"
        items={SAMPLE_ITEMS}
        onItemScanned={onItemScanned}
      />
    )

    const input = container.querySelector('input[type="text"]') as HTMLInputElement
    expect(input).not.toBeNull()

    await act(async () => {
      typeIntoInput(input, 'SN-FX3-991')
    })

    const scanBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Scan')
    await act(async () => {
      scanBtn?.click()
    })

    expect(onItemScanned).toHaveBeenCalledTimes(1)
    expect(onItemScanned).toHaveBeenCalledWith(SAMPLE_ITEMS[0])

    expect(emitSpy).toHaveBeenCalledWith(
      EVENT_TYPES.INVENTORY_PACKED,
      expect.objectContaining({
        itemId: 'item-1',
        serial: 'SN-FX3-991',
        bookingId: 'B-715',
      })
    )

    expect(container.textContent).toContain('Successfully packed: Sony FX3 Body')
  })

  it('rejects child accessories per Child Accessories Rule', async () => {
    const onItemScanned = vi.fn()
    const emitSpy = vi.spyOn(DomainEvents, 'emit')

    await mount(
      <BarcodeScannerModal
        isOpen={true}
        onClose={vi.fn()}
        mode="pack"
        bookingId="B-715"
        items={SAMPLE_ITEMS}
        onItemScanned={onItemScanned}
      />
    )

    const input = container.querySelector('input[type="text"]') as HTMLInputElement
    await act(async () => {
      typeIntoInput(input, 'SN-CAP-001')
    })

    const scanBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Scan')
    await act(async () => {
      scanBtn?.click()
    })

    expect(onItemScanned).not.toHaveBeenCalled()
    expect(emitSpy).not.toHaveBeenCalled()
    expect(container.textContent).toContain('is a child accessory. Accessories are checklist items only')
  })

  it('reports error when scanning an item not in booking', async () => {
    const onItemScanned = vi.fn()

    await mount(
      <BarcodeScannerModal
        isOpen={true}
        onClose={vi.fn()}
        mode="handover"
        bookingId="B-715"
        items={SAMPLE_ITEMS}
        onItemScanned={onItemScanned}
      />
    )

    const input = container.querySelector('input[type="text"]') as HTMLInputElement
    await act(async () => {
      typeIntoInput(input, 'UNKNOWN-SERIAL-999')
    })

    const scanBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Scan')
    await act(async () => {
      scanBtn?.click()
    })

    expect(onItemScanned).not.toHaveBeenCalled()
    expect(container.textContent).toContain('is not in this booking (B-715)')
  })

  it('closes modal upon scan when continuous mode is unticked', async () => {
    const onClose = vi.fn()
    const onItemScanned = vi.fn()

    await mount(
      <BarcodeScannerModal
        isOpen={true}
        onClose={onClose}
        mode="return"
        bookingId="B-715"
        items={SAMPLE_ITEMS}
        onItemScanned={onItemScanned}
      />
    )

    // Uncheck continuous mode
    const continuousCheck = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(continuousCheck.checked).toBe(true)

    await act(async () => {
      continuousCheck.click()
    })
    expect(continuousCheck.checked).toBe(false)

    // Scan item
    const input = container.querySelector('input[type="text"]') as HTMLInputElement
    await act(async () => {
      typeIntoInput(input, 'SN-GM-442')
    })

    const scanBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Scan')
    await act(async () => {
      scanBtn?.click()
    })

    expect(onItemScanned).toHaveBeenCalledWith(SAMPLE_ITEMS[1])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('enforces Law 15 minimum 44px hit areas across inputs and buttons', async () => {
    await mount(
      <BarcodeScannerModal
        isOpen={true}
        onClose={vi.fn()}
        mode="reset"
        bookingId="B-715"
        items={SAMPLE_ITEMS}
        onItemScanned={vi.fn()}
      />
    )

    const input = container.querySelector('input[type="text"]') as HTMLInputElement
    expect(input.style.height).toBe('44px')

    const buttons = container.querySelectorAll('button')
    for (const btn of Array.from(buttons)) {
      expect(btn.style.minHeight).toBe('44px')
    }
  })

  it('records timing measurement in session scan history', async () => {
    await mount(
      <BarcodeScannerModal
        isOpen={true}
        onClose={vi.fn()}
        mode="pack"
        bookingId="B-715"
        items={SAMPLE_ITEMS}
        onItemScanned={vi.fn()}
      />
    )

    const input = container.querySelector('input[type="text"]') as HTMLInputElement
    await act(async () => {
      typeIntoInput(input, 'TAG-101')
    })

    const scanBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Scan')
    await act(async () => {
      scanBtn?.click()
    })

    // History header should show 1 scan and latency tag
    expect(container.textContent).toContain('Session Scan History (1)')
    expect(container.textContent).toContain('⏱')
    expect(container.textContent).toContain('Target: <2s/item')
  })
})
