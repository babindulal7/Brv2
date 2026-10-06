// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { RentalFinancialRail } from '../RentalFinancialRail'
import type {
  AppliedDiscountBreakdown,
  PricingPipelineResult,
  SecurityDepositDetails,
} from '../../../../lib/pricingPipeline'
import { formatMoney, rupees } from '../../../../lib/money'

function samplePricing(): PricingPipelineResult {
  const discounts: AppliedDiscountBreakdown = {
    rawTotalPercent: 10,
    appliedPercent: 10,
    capped: false,
    discountPaisa: rupees(5000),
    sources: [],
    validationErrors: [],
  }
  const securityDeposit: SecurityDepositDetails = {
    recommendedPaisa: rupees(20000),
    overridden: false,
    requiredPaisa: rupees(20000),
    overrideReason: null,
    authorizedBy: null,
    validationErrors: [],
  }
  return {
    equipmentSubtotalPaisa: rupees(40000),
    bundleSubtotalPaisa: rupees(0),
    subRentalSubtotalPaisa: rupees(0),
    servicesSubtotalPaisa: rupees(5000),
    crewSubtotalPaisa: rupees(10000),
    deliverySubtotalPaisa: rupees(2000),
    grossSubtotalPaisa: rupees(57000),
    discounts,
    taxableSubtotalPaisa: rupees(52000),
    vatRatePercent: 13,
    vatPaisa: rupees(6760),
    rentalTotalPaisa: rupees(58760),
    securityDeposit,
    advanceRequiredPaisa: rupees(29380),
    grandTotalRequirementPaisa: rupees(88140),
  }
}

function baseProps(pricing: PricingPipelineResult) {
  return {
    pricing,
    vatOn: true,
    vatRatePercent: 13,
    onToggleVat: vi.fn(),
    canCrewMoney: true,
    canViewMoney: true,
    isDesktop: true,
    inputStyle: {},
    discountPct: 10,
    discountCap: 25,
    onDiscountPct: vi.fn(),
    onSelectDiscountPreset: vi.fn(),
    manualDiscountReason: 'Repeat client',
    onManualDiscountReason: vi.fn(),
    manualDiscountAuthorizedBy: 'Babin',
    onManualDiscountAuthorizedBy: vi.fn(),
    womenDopEligible: false,
    onWomenDopEligible: vi.fn(),
    isStudentBundle: false,
    promoCodeInput: '',
    onPromoCodeInput: vi.fn(),
    promoCodeApplied: null as string | null,
    onApplyPromo: vi.fn(),
    onRemovePromo: vi.fn(),
    promoNotice: null as { tone: 'success' | 'danger'; text: string } | null,
    manualDepositOverride: false,
    onManualDepositOverrideChange: vi.fn(),
    manualDepositAmount: '',
    onManualDepositAmount: vi.fn(),
    depositOverrideReason: '',
    onDepositOverrideReason: vi.fn(),
    depositAuthorizedBy: '',
    onDepositAuthorizedBy: vi.fn(),
  }
}

function renderRail(props: ReturnType<typeof baseProps>) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(<RentalFinancialRail {...props} />)
  })
  return { host, root }
}

describe('RentalFinancialRail (NewRental Section 5 extraction)', () => {
  it('renders charge breakdown, rental total, and an isolated deposit card (Law 5)', () => {
    const pricing = samplePricing()
    const { host, root } = renderRail(baseProps(pricing))
    try {
      expect(host.textContent).toContain('Rental Charges')
      expect(host.textContent).toContain('RENTAL TOTAL')
      expect(host.textContent).toContain(formatMoney(pricing.rentalTotalPaisa))
      expect(host.textContent).toContain('Security Deposit (Refundable)')
      expect(host.textContent).toContain(formatMoney(pricing.securityDeposit.requiredPaisa))
      expect(host.textContent).toContain('never credited towards rental charges')
    } finally {
      act(() => root.unmount())
      host.remove()
    }
  })

  it('renders nothing for money-blind roles (Law 6: absent, not masked)', () => {
    const props = { ...baseProps(samplePricing()), canViewMoney: false }
    const { host, root } = renderRail(props)
    try {
      expect(host.textContent).toBe('')
      expect(host.querySelector('input')).toBeNull()
    } finally {
      act(() => root.unmount())
      host.remove()
    }
  })

  it('omits the Crew Charges row when crew money is denied', () => {
    const props = { ...baseProps(samplePricing()), canCrewMoney: false }
    const { host, root } = renderRail(props)
    try {
      expect(host.textContent).not.toContain('Crew Charges')
      expect(host.textContent).toContain('Equipment Rental')
    } finally {
      act(() => root.unmount())
      host.remove()
    }
  })

  it('forwards VAT toggle changes to the orchestrator', () => {
    const props = baseProps(samplePricing())
    const { host, root } = renderRail(props)
    try {
      const toggle = host.querySelector('[role="switch"]') as HTMLElement | null
      expect(toggle).not.toBeNull()
      act(() => {
        toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(props.onToggleVat).toHaveBeenCalledWith(false)
    } finally {
      act(() => root.unmount())
      host.remove()
    }
  })

  it('forwards promo apply and clear without validating (orchestrator validates)', () => {
    const props = { ...baseProps(samplePricing()), promoCodeInput: 'NEPALFILM' }
    const { host, root } = renderRail(props)
    try {
      const apply = Array.from(host.querySelectorAll('button')).find(
        (b) => b.textContent === 'Apply',
      ) as HTMLButtonElement | undefined
      expect(apply).toBeDefined()
      act(() => {
        apply?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(props.onApplyPromo).toHaveBeenCalledWith('NEPALFILM')
    } finally {
      act(() => root.unmount())
      host.remove()
    }
  })
})
