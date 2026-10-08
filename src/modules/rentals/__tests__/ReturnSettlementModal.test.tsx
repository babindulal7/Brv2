// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  ReturnSettlementModal,
  type ReturnSettlementDamageItem,
  type ReturnSettlementSummary,
} from '../modals/ReturnSettlementModal'
import { rupees } from '../../../lib/money'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'USR-001', name: 'Babin Shrestha', role: 'Owner' },
  }),
}))

function setNativeValue(element: HTMLElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set
  const prototype = Object.getPrototypeOf(element)
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value)
  } else if (valueSetter) {
    valueSetter.call(element, value)
  } else {
    ;(element as HTMLInputElement).value = value
  }
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('ReturnSettlementModal (Deposit Reconciliation & Damage Invoicing)', () => {
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
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    bookingNo: 'BK-2026-0801',
    clientName: 'Sagarmatha Films',
    clientPhone: '9841234567',
    depositHeldPaisa: rupees(20000),
    scheduledReturnIso: '2026-08-05T06:00:00.000Z',
    actualReturnIso: '2026-08-05T06:00:00.000Z', // on time
    dayRatePaisa: rupees(5000),
    dayRateBasis: 'Equipment Day Rate',
    totalItemCount: 6,
    itemsWithIssues: [] as ReturnSettlementDamageItem[],
    onConfirmSettlement: vi.fn(),
  }

  it('renders deposit held tile and cleanly refunds full deposit when no issues', () => {
    act(() => {
      root.render(<ReturnSettlementModal {...baseProps} />)
    })

    const text = document.body.textContent || ''
    expect(text).toContain('Return Settlement & Deposit Reconciliation')
    expect(text).toContain('Security Deposit Held')
    expect(text).toContain('Rs 20,000')
    expect(text).toContain('Net Deposit Refund')
  })

  it('calculates late fee when return is overdue and allows charging it', () => {
    const overdueProps = {
      ...baseProps,
      actualReturnIso: '2026-08-05T09:15:00.000Z',
    }

    act(() => {
      root.render(<ReturnSettlementModal {...overdueProps} />)
    })

    const text = document.body.textContent || ''
    expect(text).toContain('Late Return Duration: 3h 15m')
    expect(text).toContain('Charge Late Fee')
    // Net refund should now be 20,000 - 5,000 = 15,000
    expect(text).toContain('Rs 15,000')
  })

  it('enforces waiver policy (min 10 chars) when waiving late fee', async () => {
    const overdueProps = {
      ...baseProps,
      actualReturnIso: '2026-08-05T09:15:00.000Z',
    }

    act(() => {
      root.render(<ReturnSettlementModal {...overdueProps} />)
    })

    // Select Waive Late Fee radio button
    const radios = [...document.body.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
    const waiveRadio = radios.find((r) => r.value === 'Waive' || r.nextSibling?.textContent?.includes('Waive'))
    expect(waiveRadio).toBeTruthy()

    act(() => {
      waiveRadio?.click()
    })

    expect(document.body.textContent).toContain('Waiver Authorization')

    // Try to record settlement without entering a valid reason
    const buttons = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
    const submitBtn = buttons.find((b) => b.textContent?.includes('Record Settlement'))
    expect(submitBtn).toBeTruthy()

    act(() => {
      submitBtn?.click()
    })

    expect(document.body.textContent).toContain('Say why this fee is being waived — at least 10 characters')
    expect(overdueProps.onConfirmSettlement).not.toHaveBeenCalled()

    // Enter valid reason >= 10 chars
    const textarea = document.body.querySelector<HTMLTextAreaElement>('textarea')
    expect(textarea).toBeTruthy()

    act(() => {
      if (textarea) {
        setNativeValue(textarea, 'Traffic roadblock delayed crew return')
      }
    })

    act(() => {
      submitBtn?.click()
    })

    expect(overdueProps.onConfirmSettlement).toHaveBeenCalledTimes(1)
    const callArgs = overdueProps.onConfirmSettlement.mock.calls[0]
    expect(callArgs).toBeDefined()
    const summary = callArgs![0] as ReturnSettlementSummary
    expect(summary.lateFeeChargedPaisa).toBe(rupees(0))
    expect(summary.lateFeeWaiver?.reason).toBe('Traffic roadblock delayed crew return')
    expect(summary.lateFeeWaiver?.approverName).toBe('Babin Shrestha')
  })

  it('computes balance owed by client when damage charges exceed deposit held', () => {
    const damagedProps = {
      ...baseProps,
      depositHeldPaisa: rupees(10000),
      itemsWithIssues: [
        {
          key: 'item-1',
          name: 'RED Komodo-X Sensor Glass',
          serial: 'SN-KOM-01',
          condition: 'Scratched Optical Element',
          isMissing: false,
          notes: 'Deep scratch near centre of sensor filter',
        },
      ],
    }

    act(() => {
      root.render(<ReturnSettlementModal {...damagedProps} />)
    })

    expect(document.body.textContent).toContain('RED Komodo-X Sensor Glass')
    const estimateInput = document.body.querySelector<HTMLInputElement>('input[placeholder="0"]')
    expect(estimateInput).toBeTruthy()

    // Type 25,000 Rs repair estimate
    act(() => {
      if (estimateInput) {
        setNativeValue(estimateInput, '25000')
      }
    })

    // Total deductions = 25,000. Deposit held = 10,000. Balance Owed = 15,000.
    const text = document.body.textContent || ''
    expect(text).toContain('Balance Owed by Client')
    expect(text).toContain('Rs 15,000')
  })

  it('renders WhatsApp return receipt share button', () => {
    act(() => {
      root.render(<ReturnSettlementModal {...baseProps} />)
    })

    const links = [...document.body.querySelectorAll<HTMLAnchorElement>('a')]
    const waLink = links.find((l) => l.textContent?.includes('Send Return Receipt'))
    expect(waLink).toBeTruthy()
    expect(waLink?.getAttribute('href')).toContain('https://wa.me/9779841234567')
  })
})
