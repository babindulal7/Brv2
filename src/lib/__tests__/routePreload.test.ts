// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installRoutePreload } from '../routePreload'

let cleanup = () => {}
afterEach(() => { cleanup(); document.body.innerHTML = '' })

function point(href: string, event = 'pointerover') {
  const a = document.createElement('a')
  a.href = href
  const child = document.createElement('span')
  a.append(child)
  document.body.append(a)
  child.dispatchEvent(new Event(event, { bubbles: true }))
}

describe('navigation code preloading', () => {
  it('loads on pointer or keyboard intent once, without intercepting clicks', async () => {
    const load = vi.fn().mockResolvedValue({})
    cleanup = installRoutePreload(document, { '/rentals': load })
    point('/rentals')
    point('/rentals', 'focusin')
    await Promise.resolve()
    expect(load).toHaveBeenCalledTimes(1)
    cleanup()
    point('/rentals', 'pointerdown')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('ignores external links and resolves the embedded new-rental destination', async () => {
    const list = vi.fn().mockResolvedValue({})
    const form = vi.fn().mockResolvedValue({})
    cleanup = installRoutePreload(document, { '/rentals': list, '/rentals/new': form })
    point('https://example.org/rentals')
    point('/rentals?action=new', 'focusin')
    await Promise.resolve()
    expect(list).not.toHaveBeenCalled()
    expect(form).toHaveBeenCalledOnce()
  })

  it('retries a failed speculative download on later intent', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({})
    cleanup = installRoutePreload(document, { '/rentals': load })
    point('/rentals')
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    point('/rentals', 'focusin')
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2))
  })
})
