// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { WhatsAppShareButton } from '../WhatsAppShareButton'
import type { WaBookingFacts } from '../../../lib/whatsappActions'
import type { Paisa } from '../../../lib/money'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'test-user', role: 'Owner' },
  }),
}))

describe('WhatsAppShareButton Component', () => {
  let host: HTMLDivElement
  let root: Root

  const mockFacts: WaBookingFacts = {
    clientName: 'Sagarmatha Films',
    bookingNo: 'B-2026-0888',
    stage: 'Booked',
    startIso: '2026-10-01T10:00:00Z',
    endIso: '2026-10-04T18:00:00Z',
    itemCount: 4,
    topLines: ['RED KOMODO-X', 'Canon RF 24-70mm'],
    isOverdue: false,
    total: 4500000 as Paisa,
    advance: 1500000 as Paisa,
    deposit: 0 as Paisa,
    balance: 3000000 as Paisa,
  }

  beforeEach(() => {
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

  it('renders WhatsApp button when actions are available for stage', async () => {
    await act(async () => {
      root.render(
        <WhatsAppShareButton
          facts={mockFacts}
          clientPhone="9841234567"
        />,
      )
    })

    const btn = host.querySelector('button')
    expect(btn).not.toBeNull()
    expect(btn?.textContent).toContain('WhatsApp')
  })

  it('opens dropdown menu on click', async () => {
    await act(async () => {
      root.render(
        <WhatsAppShareButton
          facts={mockFacts}
          clientPhone="9841234567"
        />,
      )
    })

    const btn = host.querySelector('button')
    expect(btn).not.toBeNull()

    await act(async () => {
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const menu = host.querySelector('[role="menu"]')
    expect(menu).not.toBeNull()
    expect(host.textContent).toContain('Send booking confirmation')
  })

  it('disables item when phone number is missing', async () => {
    await act(async () => {
      root.render(
        <WhatsAppShareButton
          facts={mockFacts}
          clientPhone={null}
        />,
      )
    })

    const btn = host.querySelector('button')
    await act(async () => {
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const menuItems = host.querySelectorAll('[role="menuitem"]')
    expect(menuItems.length).toBeGreaterThan(0)
    const firstItem = menuItems[0] as HTMLButtonElement
    expect(firstItem.disabled).toBe(true)
  })
})
