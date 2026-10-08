// @vitest-environment jsdom
/**
 * # The toast's optional action, driven
 *
 * `WHATSAPP_LINKS_SPEC v1.0` §3 puts "Send receipt" on the payment success
 * toast. Three of the claims made in that change are the ones worth pinning,
 * because each is a silent failure if it regresses:
 *
 *  · **It is an anchor, not a click handler.** The caller composes the URL
 *    after awaiting a query, so a `window.open` fired at that point has left
 *    its user gesture behind and is blocked. A real `<a>` cannot be.
 *  · **`rel` carries both tokens.** `wa.me` is a third-party origin, and a tab
 *    opened without `noopener` can reach back through `window.opener`.
 *  · **An actionable toast outlives a plain one.** At four seconds the row
 *    disappears under the pointer about as often as it is caught.
 */

import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { ToastProvider, useToast } from '../Toast'

let container: HTMLDivElement
let root: Root

function mount(ui: React.ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root.render(ui)
  })
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

/** Raises one toast on mount, with or without an action. */
function Raiser({ withAction }: { withAction: boolean }) {
  const { showSuccessToast } = useToast()
  const fired = React.useRef(false)
  React.useEffect(() => {
    if (fired.current) return
    fired.current = true
    showSuccessToast(
      'Payment Recorded',
      'Rs 5,000 against INV-1',
      withAction ? { label: 'Send receipt on WhatsApp', href: 'https://wa.me/9779841234567?text=hi' } : undefined,
    )
  }, [showSuccessToast, withAction])
  return null
}

const link = () => container.querySelector('a')

describe('a toast carrying an action', () => {
  it('renders it as a real anchor to the composed link', () => {
    mount(
      <ToastProvider>
        <Raiser withAction />
      </ToastProvider>,
    )
    const a = link()
    expect(a).not.toBeNull()
    expect(a?.getAttribute('href')).toBe('https://wa.me/9779841234567?text=hi')
    expect(a?.textContent).toBe('Send receipt on WhatsApp')
  })

  it('opens in a new tab and severs window.opener', () => {
    mount(
      <ToastProvider>
        <Raiser withAction />
      </ToastProvider>,
    )
    const a = link()
    expect(a?.getAttribute('target')).toBe('_blank')
    const rel = a?.getAttribute('rel') ?? ''
    expect(rel).toContain('noopener')
    expect(rel).toContain('noreferrer')
  })

  it('keeps a 44px target — the row is not a bare text link', () => {
    mount(
      <ToastProvider>
        <Raiser withAction />
      </ToastProvider>,
    )
    expect(link()?.style.minHeight).toBe('44px')
  })

  it('still shows the success it is attached to', () => {
    mount(
      <ToastProvider>
        <Raiser withAction />
      </ToastProvider>,
    )
    expect(container.textContent).toContain('Payment Recorded')
    expect(container.textContent).toContain('Rs 5,000 against INV-1')
  })
})

describe('dwell', () => {
  it('outlives a plain toast, so the action can actually be reached', () => {
    vi.useFakeTimers()
    mount(
      <ToastProvider>
        <Raiser withAction />
      </ToastProvider>,
    )
    act(() => {
      vi.advanceTimersByTime(4500)
    })
    /* A plain toast is gone by now; this one must not be. */
    expect(link()).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(8000)
    })
    expect(link()).toBeNull()
  })

  it('leaves a toast WITHOUT an action on its original four seconds', () => {
    vi.useFakeTimers()
    mount(
      <ToastProvider>
        <Raiser withAction={false} />
      </ToastProvider>,
    )
    expect(container.textContent).toContain('Payment Recorded')
    expect(link()).toBeNull()
    act(() => {
      vi.advanceTimersByTime(4500)
    })
    expect(container.textContent).not.toContain('Payment Recorded')
  })
})
