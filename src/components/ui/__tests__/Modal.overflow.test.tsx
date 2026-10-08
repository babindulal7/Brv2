// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Viewport } from '../../../lib/device'

let mockViewport: Viewport = 'phone'

vi.mock('../../../lib/device', () => ({
  useViewport: () => mockViewport,
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

const { Modal } = await import('../Modal')

describe('Modal — AUD-016 Virtual Keyboard Overflow Prevention', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mockViewport = 'phone'
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

  it('constrains dialog to 85dvh on mobile viewport to prevent virtual keyboard overflow', async () => {
    mockViewport = 'phone'
    await act(async () => {
      root.render(
        <Modal
          isOpen
          onClose={vi.fn()}
          title="Edit Booking"
          footer={<button type="button">Save Changes</button>}
        >
          <div>
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" defaultValue="Initial notes" />
          </div>
        </Modal>,
      )
    })

    const dialog = host.querySelector<HTMLDivElement>('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.style.maxHeight).toBe('85dvh')

    // Header must have flexShrink: 0
    const header = dialog?.firstElementChild as HTMLElement
    expect(header?.style.flexShrink).toBe('0')

    // Content container must have flex: 1 and overflowY: auto
    const content = dialog?.children[1] as HTMLElement
    expect(content?.style.overflowY).toBe('auto')
    expect(content?.style.flex).toBe('1 1 0%')

    // Footer with action button must have flexShrink: 0
    const footer = dialog?.children[2] as HTMLElement
    expect(footer?.style.flexShrink).toBe('0')

    const saveBtn = footer?.querySelector('button')
    expect(saveBtn).not.toBeNull()
    expect(saveBtn?.textContent).toBe('Save Changes')
  })

  it('uses 85dvh for bottom sheets on mobile as well', async () => {
    mockViewport = 'phone'
    await act(async () => {
      root.render(
        <Modal
          isOpen
          sheet
          onClose={vi.fn()}
          title="Quick Actions"
          footer={<button type="button">Apply</button>}
        >
          <div>Options</div>
        </Modal>,
      )
    })

    const dialog = host.querySelector<HTMLDivElement>('[role="dialog"]')
    expect(dialog?.style.maxHeight).toBe('85dvh')
  })
})
