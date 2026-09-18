// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BookingStatus } from '../../../lib/workflow'
import BookingOperationsMenu from '../BookingOperationsMenu'
import { OperationsWorkspaceProvider } from '../../operations/OperationsWorkspaceContext'

vi.mock('../PackingWorkspace', () => ({ default: () => <div>Packing workspace body</div> }))
vi.mock('../HandoverWorkspace', () => ({ default: () => <div>Handover workspace body</div> }))
vi.mock('../ReturnWorkspace', () => ({ default: () => <div>Return workspace body</div> }))
vi.mock('../ResetWorkspace', () => ({ default: () => <div>Reset workspace body</div> }))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let container: HTMLDivElement
let root: Root
let path = ''

function PathProbe() {
  path = useLocation().pathname
  return null
}

async function mount(bookingNo?: string, bookingStatus?: BookingStatus) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/rentals/new']}>
        <PathProbe />
        <OperationsWorkspaceProvider>
          <BookingOperationsMenu
            {...(bookingNo ? { bookingNo } : {})}
            {...(bookingStatus ? { bookingStatus } : {})}
          />
        </OperationsWorkspaceProvider>
      </MemoryRouter>,
    )
  })
}

async function openMenu() {
  const trigger = [...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Operations')
  await act(async () => trigger?.click())
}

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  path = ''
})

describe('booking-level Operations dropdown', () => {
  it('contains exactly the four specified operations', async () => {
    await mount('B-715', 'Booked')
    await openMenu()

    const labels = [...container.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim())
    expect(labels).toEqual(['Packing', 'Handover', 'Return & Inspection', 'Cleaning & Reset'])
  })

  it('opens the selected booking operation in-place', async () => {
    await mount('B-715', 'Booked')
    await openMenu()

    const packing = [...container.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === 'Packing',
    )
    await act(async () => packing?.click())

    expect(path).toBe('/rentals/new')
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('Operations · B-715')
  })

  it('keeps all four choices visible but unavailable before a new booking is saved', async () => {
    await mount()
    await openMenu()

    const items = [...container.querySelectorAll('[role="menuitem"]')]
    expect(items).toHaveLength(4)
    expect(items.every((item) => item.getAttribute('aria-disabled') === 'true')).toBe(true)
    expect(items[0]?.getAttribute('title')).toContain('Save and confirm this booking')
  })
})
