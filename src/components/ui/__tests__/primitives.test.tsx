// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'
import {
  Table,
  GateChecklist,
  MoneyField,
  ScannerInput,
  QuantityChip,
  EvidenceThumbnail,
  ReconciliationAssertion,
} from '../index'
import { rupees } from '../../../lib/money'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

let container: HTMLDivElement
let root: Root

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
})

async function mount(node: React.ReactNode) {
  await act(async () => {
    root.render(node)
  })
  return container
}

async function change(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (!setter) throw new Error('no value setter')
  await act(async () => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('Ported Design System UI Primitives', () => {
  describe('Table', () => {
    const columns = [
      { key: 'id', header: 'ID', sortable: true },
      { key: 'name', header: 'Name', sortable: true },
    ]
    const data = [
      { id: '1', name: 'Item A' },
      { id: '2', name: 'Item B' },
    ]

    it('renders column headers and row data', async () => {
      const el = await mount(<Table columns={columns} data={data} />)
      expect(el.textContent).toContain('ID')
      expect(el.textContent).toContain('Name')
      expect(el.textContent).toContain('Item A')
      expect(el.textContent).toContain('Item B')
    })

    it('triggers sort callback on click of sortable header', async () => {
      const onSort = vi.fn()
      const el = await mount(<Table columns={columns} data={data} onSort={onSort} />)
      const th = el.querySelectorAll('th')[0]
      await act(async () => {
        th?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onSort).toHaveBeenCalledWith('id')
    })

    it('renders empty message when data is empty', async () => {
      const el = await mount(<Table columns={columns} data={[]} emptyMessage="No records in database" />)
      expect(el.textContent).toContain('No records in database')
    })
  })

  describe('GateChecklist', () => {
    const items = [
      { id: '1', label: 'Safety check', passed: true },
      { id: '2', label: 'Payment clearance', passed: false, isFinancial: true, financialAmount: rupees(500) },
    ]

    it('renders checklist items and fires toggle callback', async () => {
      const onToggle = vi.fn()
      const el = await mount(<GateChecklist type="Handover" role="Admin" items={items} onToggleItem={onToggle} />)
      expect(el.textContent).toContain('Dispatch Gate Checklist')
      expect(el.textContent).toContain('Safety check')

      const toggleButtons = el.querySelectorAll('button')
      expect(toggleButtons.length).toBeGreaterThan(0)
      const firstToggle = toggleButtons[0]
      expect(firstToggle).toBeDefined()
      if (firstToggle) {
        await act(async () => {
          firstToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        })
      }
      expect(onToggle).toHaveBeenCalledWith('1', false)
    })

    it('omits financial amount for money-blind roles (Law 6)', async () => {
      const el = await mount(<GateChecklist type="Handover" role="Warehouse" items={items} />)
      expect(el.textContent).not.toContain('500')

      await mount(<GateChecklist type="Handover" role="Admin" items={items} />)
      expect(el.textContent).toContain('500')
    })
  })

  describe('MoneyField', () => {
    it('completely omits money field for money-blind roles (Law 6)', async () => {
      const el = await mount(<MoneyField label="Charge" value={rupees(100)} role="Warehouse" />)
      expect(el.firstElementChild).toBeNull()
    })

    it('renders input and calls onChange with Paisa for authorized roles', async () => {
      const onChange = vi.fn()
      const el = await mount(<MoneyField label="Charge" value={rupees(100)} role="Admin" onChange={onChange} />)
      expect(el.textContent).toContain('Charge')
      const input = el.querySelector('input') as HTMLInputElement
      expect(input).toBeDefined()
      await change(input, '250')
      expect(onChange).toHaveBeenCalledWith(rupees(250))
    })
  })

  describe('ScannerInput', () => {
    it('fires onScan on submit and clears input', async () => {
      const onScan = vi.fn()
      const el = await mount(<ScannerInput onScan={onScan} placeholder="Scan barcode" />)
      const input = el.querySelector('input') as HTMLInputElement
      await change(input, 'BAR-12345')
      const btn = el.querySelector('button[type="submit"]') as HTMLButtonElement
      await act(async () => {
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onScan).toHaveBeenCalledWith('BAR-12345')
    })
  })

  describe('QuantityChip', () => {
    it('renders compact mode with text labels', async () => {
      const el = await mount(<QuantityChip quantities={{ booked: 5, returned: 2, missing: 1 }} compact />)
      expect(el.textContent).toContain('5 total')
      expect(el.textContent).toContain('(2 ret)')
      expect(el.textContent).toContain('(1 miss)')
    })

    it('renders full mode with individual status tags', async () => {
      const el = await mount(<QuantityChip quantities={{ booked: 5, packed: 3, pickedUp: 2 }} />)
      expect(el.textContent).toContain('5 Booked')
      expect(el.textContent).toContain('3 Packed')
      expect(el.textContent).toContain('2 Out')
    })
  })

  describe('EvidenceThumbnail', () => {
    const item = {
      id: 'e-1',
      url: 'https://example.com/photo.jpg',
      title: 'Handover Signature',
      category: 'signature' as const,
      capturedAt: new Date().toISOString(),
    }

    it('renders thumbnail and opens modal on click', async () => {
      const el = await mount(<EvidenceThumbnail evidence={item} />)
      expect(el.textContent).toContain('signature')
      const img = el.querySelector('img') as HTMLImageElement
      expect(img).toBeDefined()
      await act(async () => {
        img.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(el.textContent).toContain('Category: signature')
      expect(el.querySelector('button[aria-label="Close evidence viewer"]')).toBeDefined()
    })
  })

  describe('ReconciliationAssertion', () => {
    const balanced = {
      subtotal: rupees(1000),
      discount: rupees(100),
      taxable: rupees(900),
      vat: rupees(117),
      rentalTotal: rupees(1017),
      payments: rupees(1017),
      outstanding: rupees(0),
    }

    it('omits for money-blind roles (Law 6)', async () => {
      const el = await mount(<ReconciliationAssertion priceBreakdown={balanced} role="Warehouse" />)
      expect(el.firstElementChild).toBeNull()
    })

    it('renders balanced status for authorized roles', async () => {
      const el = await mount(<ReconciliationAssertion priceBreakdown={balanced} role="Admin" />)
      expect(el.textContent).toContain('Zero Drift')
      expect(el.textContent).toContain('Balanced ✓')
    })
  })
})
