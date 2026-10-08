// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { SmartHoverTrigger } from '../SmartHoverTrigger'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('SmartHoverTrigger shared session', () => {
  it('keeps one preview open across identifiers', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<>
        <SmartHoverTrigger label="BR-1001" entityType="rental" entityId="r1" context="rental-list" renderCard={() => <div data-preview="r1">First preview</div>} />
        <SmartHoverTrigger label="BR-1002" entityType="rental" entityId="r2" context="rental-list" renderCard={() => <div data-preview="r2">Second preview</div>} />
      </>)
    })
    const triggers = host.querySelectorAll('button')
    await act(async () => { triggers[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(document.body.querySelector('[data-preview="r1"]')).not.toBeNull()
    await act(async () => { triggers[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(document.body.querySelector('[data-preview="r1"]')).toBeNull()
    expect(document.body.querySelector('[data-preview="r2"]')).not.toBeNull()
    await act(async () => { root.unmount() })
    host.remove()
  })

  it('keeps a short touch tap as the identifier action', async () => {
    const openEntity = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<SmartHoverTrigger label="BR-1003" entityType="rental" entityId="r3" context="rental-list" onOpenEntity={openEntity} renderCard={() => <div>Preview</div>} />)
    })
    const trigger = host.querySelector('button')
    await act(async () => {
      trigger?.dispatchEvent(new Event('touchstart', { bubbles: true }))
      trigger?.dispatchEvent(new Event('touchend', { bubbles: true, cancelable: true }))
    })
    expect(openEntity).toHaveBeenCalledOnce()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    await act(async () => { root.unmount() })
    host.remove()
  })
})
