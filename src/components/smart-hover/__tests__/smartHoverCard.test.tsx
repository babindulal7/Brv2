// @vitest-environment jsdom
/**
 * Smart hover acceptance — §68 DOM omission, §76 placement, §34 readiness.
 *
 * A money-blind role must find no figure in the invoice card's DOM:
 * the payload carries clearance, never amounts (PERMISSIONS P4).
 */
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { placeHoverCard } from '../hooks'
import { SmartHoverCard } from '../SmartHoverCard'
import { RentalHoverCard } from '../cards/RentalHoverCard'
import { summarizeRentalPayments } from '../../../lib/smartHover'
import type { InvoicePreview, RentalPreview } from '../previewTypes'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

async function mountText(node: React.ReactNode): Promise<{ text: string; root: Root; container: HTMLDivElement }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(node)
  })
  const text = container.textContent ?? ''
  return { text, root, container }
}

describe('placeHoverCard (§76)', () => {
  it('prefers right and stays inside the viewport', () => {
    const p = placeHoverCard({ top: 100, left: 100, width: 120, height: 24 }, 360, 400, 1280, 800)
    expect(p.placement).toBe('right')
    expect(p.left + 360).toBeLessThanOrEqual(1280 - 16)
    expect(p.top).toBeGreaterThanOrEqual(16)
  })
  it('falls to the left near the right edge', () => {
    const p = placeHoverCard({ top: 100, left: 1200, width: 60, height: 24 }, 360, 400, 1280, 800)
    expect(p.placement).toBe('left')
    expect(p.left).toBeGreaterThanOrEqual(16)
  })
})

describe('rental decisions and complete tabs', () => {
  function preview(): RentalPreview {
    const history = Array.from({ length: 9 }, (_, index) => ({ id: `pay-${index}`, clientId: 'c1', type: 'rental_payment' as const,
      status: 'completed' as const, method: 'cash' as const, amountPaisa: 10000, createdAt: '2026-10-13T00:00:00Z', reference: `REF-${index + 1}` }))
    return { id: 'r1', rentalNo: 'B-1', stage: 'Booked', clientId: 'c1', clientName: 'Client', pickupAt: 'Today', returnAt: 'Tomorrow', rentalDays: 1,
      readiness: { clientAllowed: false, equipmentReady: false, packingReady: null, paymentReady: null, depositReady: null, contractReady: null },
      equipment: Array.from({ length: 12 }, (_, index) => ({ label: `Equipment ${index + 1}`, qty: 1 })),
      packing: { status: 'not_started', lines: [] }, notes: [{ id: 'n1', at: 'Today', by: 'Staff', text: 'Private note' }],
      payments: { summary: summarizeRentalPayments({ grandTotalPaisa: 1234500, transactions: history }), history },
    }
  }
  it('shows all items and total, leads with client restriction, and mounts notes only in Notes', async () => {
    const { root, container } = await mountText(<RentalHoverCard preview={preview()} canViewFinance defaultTab="overview" notesContent={<label>Note composer<textarea /></label>} />)
    expect(container.querySelectorAll('[aria-label="Rental items"] li')).toHaveLength(12)
    expect(container.textContent).toContain('Rs 12,345')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Client restricted')
    expect(container.querySelector('textarea')).toBeNull()
    expect(container.textContent).not.toContain('Private note')
    const clickTab = async (name: string) => {
      const button = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(tab => tab.textContent?.startsWith(name))
      expect(button).toBeDefined()
      await act(async () => button?.click())
    }
    await clickTab('Payments')
    expect(container.querySelectorAll('li')).toHaveLength(9)
    expect(container.textContent).toContain('REF-9')
    await clickTab('Notes')
    expect(container.querySelector('textarea')).not.toBeNull()
    await clickTab('Packing')
    expect(container.querySelector('textarea')).toBeNull()
    expect(container.textContent).toContain('No assigned unit packing data')
    expect(container.textContent).not.toContain('0 / 0')
    await act(async () => root.unmount()); container.remove()
  })
  it('omits financial figures from the DOM for a restricted role', async () => {
    const { root, container } = await mountText(<RentalHoverCard preview={preview()} canViewFinance={false} defaultTab="overview" />)
    expect(container.textContent).not.toContain('Rental total')
    expect(container.textContent).not.toMatch(/Rs\s|12,345/)
    await act(async () => root.unmount()); container.remove()
  })
})

describe('invoice card money-blind (§68)', () => {
  it('renders clearance with no figures for Warehouse', async () => {
    const preview: InvoicePreview = {
      id: 'inv1',
      invoiceNo: 'INV-0218',
      clientName: 'Jazz Production Pvt Ltd',
      invoiceDate: '29 Sep 2026',
      dueDate: '30 Sep 2026',
      state: 'PARTIALLY PAID',
      handoverClear: null,
      recent: [{ id: 'p1', clientId: 'c1', type: 'rental_payment', status: 'completed', method: 'cash', amountPaisa: 4860000, createdAt: '2026-09-29T10:00:00Z', createdBy: 'u1' }],
    }
    const { text, root, container } = await mountText(
      <SmartHoverCard
        entityType="invoice"
        context="payments"
        role="Warehouse"
        preview={preview}
        canViewFinance={false}
        onClose={() => undefined}
        onAction={() => undefined}
      />,
    )
    expect(text).toContain('INV-0218')
    expect(text).not.toMatch(/Rs\s/)
    expect(text).not.toMatch(/1,85,000|48,600|25,000/)
    expect(text).not.toContain('Recent payments')
    expect(text).not.toContain('Payment cleared')
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })
})

describe('rental card readiness (§34)', () => {
  it('names the blocking gate instead of a bare colour', async () => {
    const preview: RentalPreview = {
      id: 'r1',
      rentalNo: 'BR-1057',
      stage: 'Booked',
      clientName: 'Jazz Production Pvt Ltd',
      clientId: 'c1',
      pickupAt: '30 Sep 06:00',
      returnAt: '02 Oct 06:00',
      rentalDays: 2,
      readiness: { equipmentReady: true, packingReady: true, paymentReady: true, depositReady: false, contractReady: true, clientAllowed: true },
      equipment: [{ label: 'Sony FX3', qty: 1, packed: true }],
      packing: { status: 'packed', lines: [{ id: 'l1', label: 'Sony FX3', status: 'packed', qtyRequired: 1, qtyPacked: 1 }] },
      notes: [],
    }
    const { text, root, container } = await mountText(
      <SmartHoverCard
        entityType="rental"
        context="dashboard"
        role="Manager"
        preview={preview}
        canViewFinance
        stage="Booked"
        packingStatus="packed"
        onClose={() => undefined}
        onAction={() => undefined}
      />,
    )
    expect(text).toMatch(/Handover blocked/)
    expect(text).toMatch(/Security deposit missing/)
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })
})
