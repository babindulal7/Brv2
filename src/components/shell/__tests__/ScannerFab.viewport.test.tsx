// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Viewport } from '../../../lib/device'

let mockViewport: Viewport = 'desktop'

vi.mock('../../../lib/device', () => ({
  useViewport: () => mockViewport,
}))

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class {
    decodeFromVideoDevice = vi.fn().mockReturnValue(new Promise(() => {}))
  },
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        or: () => ({
          maybeSingle: async () => ({ data: null }),
        }),
      }),
    }),
  },
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { default: ScannerFab, toggleScanner } = await import('../ScannerFab')

describe('ScannerFab — AUD-014 Mobile Dual Scanner Collision Resolution', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mockViewport = 'desktop'
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    host?.remove()
    document.body.innerHTML = ''
  })

  it('renders floating trigger button on desktop (width >= 1280px)', async () => {
    mockViewport = 'desktop'
    await act(async () => {
      root.render(<ScannerFab />)
    })

    const fab = host.querySelector<HTMLButtonElement>('button[aria-label="Scanner"]')
    expect(fab).not.toBeNull()
    expect(fab?.style.display).not.toBe('none')
  })

  it('renders floating trigger button on tablet (768px <= width < 1280px)', async () => {
    mockViewport = 'tablet'
    await act(async () => {
      root.render(<ScannerFab />)
    })

    const fab = host.querySelector<HTMLButtonElement>('button[aria-label="Scanner"]')
    expect(fab).not.toBeNull()
  })

  it('hides floating trigger button on phone (< 768px) to prevent dual scanner collision', async () => {
    mockViewport = 'phone'
    await act(async () => {
      root.render(<ScannerFab />)
    })

    // Floating circular button must NOT exist on phone
    const fab = host.querySelector<HTMLButtonElement>('button[aria-label="Scanner"]')
    expect(fab).toBeNull()

    // Panel is not open yet
    expect(host.querySelector('[role="dialog"][aria-label="Scanner"]')).toBeNull()
  })

  it('opens mobile bottom sheet via external toggleScanner() event on phone', async () => {
    mockViewport = 'phone'
    await act(async () => {
      root.render(<ScannerFab />)
    })

    // Dispatch external toggle (fired by BottomBar Scan slot)
    await act(async () => {
      toggleScanner()
    })

    // Scanner modal sheet must now be open
    const sheet = host.querySelector<HTMLDivElement>('[role="dialog"][aria-label="Scanner"]')
    expect(sheet).not.toBeNull()
    expect(sheet?.style.position).toBe('fixed')
    expect(sheet?.style.bottom).toBe('0px')

    // Backdrop overlay is rendered
    const backdrop = host.querySelector('div[aria-hidden="true"]')
    expect(backdrop).not.toBeNull()

    // Clicking backdrop closes the sheet
    await act(async () => {
      backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(host.querySelector('[role="dialog"][aria-label="Scanner"]')).toBeNull()
  })
})
