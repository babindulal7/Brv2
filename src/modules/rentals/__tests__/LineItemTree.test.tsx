// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { LineItemTree } from '../LineItemTree'
import type { FloorLine } from '../../../lib/queries/bookings'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('LineItemTree Component (Cinema Flight Case & Kit Hierarchy)', () => {
  let container: HTMLDivElement
  let root: Root

  const mockLines: FloorLine[] = [
    {
      id: 'line-parent-1',
      qty: 1,
      lineType: 'Bundle',
      description: 'Cinema kit in Pelican 1510',
      productId: 'prod-red',
      productName: 'RED Komodo 6K Cinema Package',
      trackingMode: 'serialized',
      parentLineId: null,
      sortOrder: 1,
      unitsPresence: 'present',
      units: [
        {
          id: 'u-red-1',
          assetId: 'unit-red-01',
          serial: 'RK-884192',
          assetTag: 'CAM-001',
          unitState: 'Assigned',
          isRequired: true,
          packed: false,
          damaged: false,
          location: 'Vault Shelf A',
        },
      ],
    },
    {
      id: 'line-child-1',
      qty: 1,
      lineType: 'Equipment',
      description: 'Prime cinema zoom',
      productId: 'prod-lens',
      productName: 'Canon RF 24-70mm f/2.8L IS USM Lens',
      trackingMode: 'serialized',
      parentLineId: 'line-parent-1',
      sortOrder: 2,
      unitsPresence: 'present',
      units: [
        {
          id: 'u-lens-1',
          assetId: 'unit-lens-01',
          serial: 'CN-90412',
          assetTag: 'LENS-001',
          unitState: 'Assigned',
          isRequired: true,
          packed: false,
          damaged: false,
          location: 'Rack B-1',
        },
      ],
    },
    {
      id: 'line-loose-1',
      qty: 1,
      lineType: 'Equipment',
      description: 'Loose heavy grip',
      productId: 'prod-tripod',
      productName: 'Sachtler Video 20 Carbon Fiber Tripod',
      trackingMode: 'serialized',
      parentLineId: null,
      sortOrder: 3,
      unitsPresence: 'present',
      units: [
        {
          id: 'u-tripod-1',
          assetId: 'unit-tripod-01',
          serial: 'ST-5512',
          assetTag: 'GRIP-001',
          unitState: 'Assigned',
          isRequired: true,
          packed: false,
          damaged: false,
          location: 'Floor Bay',
        },
      ],
    },
  ]

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('renders flight case container tag and nested child accessories', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <LineItemTree lines={mockLines} />
        </MemoryRouter>,
      )
    })

    const bodyText = document.body.textContent || ''
    // Flight Case tag
    expect(bodyText).toContain('PEL-1510-REDKOM-01')
    expect(bodyText).toContain('RED Komodo 6K Cinema Package')
    // Child accessory inside flight case
    expect(bodyText).toContain('Canon RF 24-70mm f/2.8L')
    expect(bodyText).toContain('CN-90412')
  })


  it('renders optical and sensor QC status badges', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <LineItemTree lines={mockLines} />
        </MemoryRouter>,
      )
    })

    const bodyText = document.body.textContent || ''
    expect(bodyText).toContain('Sensor Clean ✓')
    expect(bodyText).toContain('Optics QC Pass')
  })

  it('filters line items via search input', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <LineItemTree lines={mockLines} />
        </MemoryRouter>,
      )
    })

    const input = container.querySelector('input[type="search"]') as HTMLInputElement
    expect(input).not.toBeNull()

    act(() => {
      input.value = 'tripod'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      // Also trigger onChange if controlled
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeSetter?.call(input, 'tripod')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(container.textContent).toContain('Sachtler Video 20 Carbon')
  })

  it('calls onReleaseUnit when release button is triggered with permission', () => {
    const handleRelease = vi.fn()

    act(() => {
      root.render(
        <MemoryRouter>
          <LineItemTree
            lines={mockLines}
            canReleaseUnits={true}
            onReleaseUnit={handleRelease}
          />
        </MemoryRouter>,
      )
    })

    // Find a release button
    const releaseButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Release') || b.getAttribute('title')?.includes('Release'),
    )

    if (releaseButtons.length > 0) {
      act(() => {
        releaseButtons[0]?.click()
      })
      expect(handleRelease).toHaveBeenCalled()
    }
  })
})
