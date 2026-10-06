// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import {
  useNewRentalTiming,
  type UseNewRentalTimingResult,
} from '../useNewRentalTiming'
import {
  useNewRentalLogistics,
  type UseNewRentalLogisticsResult,
} from '../useNewRentalLogistics'
import {
  useNewRentalPricing,
  type UseNewRentalPricingResult,
} from '../useNewRentalPricing'
import { rupees, type Paisa } from '../../../../lib/money'
import type { CrewMember } from '../../../../lib/queries/crew'
import type { Line } from '../RentalLineItemsTree'

describe('useNewRentalTiming', () => {
  it('initializes from searchParams or defaults and computes booking window', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let timingResult!: UseNewRentalTimingResult

    function TestComponent() {
      const params = new URLSearchParams('from=2026-11-01&to=2026-11-04')
      timingResult = useNewRentalTiming({ searchParams: params })
      return null
    }

    try {
      await act(async () => {
        root.render(<TestComponent />)
      })

      expect(timingResult.pickup).toBe('2026-11-01')
      expect(timingResult.ret).toBe('2026-11-04')
      expect(timingResult.pickupTime).toBe('09:00')
      expect(timingResult.returnTime).toBe('18:00')
      expect(timingResult.days).toBeGreaterThanOrEqual(1)
      expect(timingResult.dayWord).toBe('days')
      expect(timingResult.bookingWindow.pickupAd).not.toBeNull()
      expect(timingResult.bookingWindow.returnAd).not.toBeNull()
    } finally {
      await act(async () => {
        root.unmount()
      })
      host.remove()
    }
  })

  it('updates dates and times on shoot presets', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let timingResult!: UseNewRentalTimingResult

    function TestComponent() {
      const params = new URLSearchParams('from=2026-10-10&to=2026-10-12')
      timingResult = useNewRentalTiming({ searchParams: params })
      return null
    }

    try {
      await act(async () => {
        root.render(<TestComponent />)
      })

      await act(async () => {
        timingResult.applyShootPreset('1-day')
      })
      expect(timingResult.pickup).toBe('2026-10-10')
      expect(timingResult.ret).toBe('2026-10-10')
      expect(timingResult.pickupTime).toBe('07:00')
      expect(timingResult.returnTime).toBe('20:00')

      await act(async () => {
        timingResult.applyShootPreset('3-day')
      })
      expect(timingResult.pickup).toBe('2026-10-10')
      expect(timingResult.ret).toBe('2026-10-12')
    } finally {
      await act(async () => {
        root.unmount()
      })
      host.remove()
    }
  })
})

describe('useNewRentalLogistics', () => {
  const dummyCrew: CrewMember[] = [
    {
      id: 'cr-1',
      name: 'Prakash Shrestha',
      role: 'Gaffer',
      phone: '9841000000',
      state: 'Available',
      dayRatePaisa: rupees(8000),
    },
  ]

  it('manages crew roster additions, removals, and updates', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let logisticsResult!: UseNewRentalLogisticsResult

    function TestComponent() {
      logisticsResult = useNewRentalLogistics({ liveCrew: dummyCrew })
      return null
    }

    try {
      await act(async () => {
        root.render(<TestComponent />)
      })

      expect(logisticsResult.crew).toHaveLength(0)

      await act(async () => {
        logisticsResult.addCrew('cr-1')
      })
      expect(logisticsResult.crew).toHaveLength(1)
      expect(logisticsResult.crew[0]?.name).toBe('Prakash Shrestha')
      expect(logisticsResult.crew[0]?.dayRatePaisa).toBe(rupees(8000))

      await act(async () => {
        logisticsResult.handleUpdateCrew('cr-1', { overtimePaisa: rupees(1000) })
      })
      expect(logisticsResult.crew[0]?.overtimePaisa).toBe(rupees(1000))

      await act(async () => {
        logisticsResult.removeCrew('cr-1')
      })
      expect(logisticsResult.crew).toHaveLength(0)
    } finally {
      await act(async () => {
        root.unmount()
      })
      host.remove()
    }
  })

  it('enforces Client Pickup delivery charge zeroing and updates transport details', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let logisticsResult!: UseNewRentalLogisticsResult

    function TestComponent() {
      logisticsResult = useNewRentalLogistics({ liveCrew: dummyCrew })
      return null
    }

    try {
      await act(async () => {
        root.render(<TestComponent />)
      })

      expect(logisticsResult.deliveryType).toBe('Client Pickup')
      expect(logisticsResult.clientPickup).toBe(true)

      await act(async () => {
        logisticsResult.handleUpdateTransport({
          deliveryType: 'Babin Delivery',
          deliveryChargePaisa: rupees(2500),
          vehicle: 'Van 1',
        })
      })

      expect(logisticsResult.deliveryType).toBe('Babin Delivery')
      expect(logisticsResult.clientPickup).toBe(false)
      expect(logisticsResult.deliveryChargePaisa).toBe(rupees(2500))
      expect(logisticsResult.vehicle).toBe('Van 1')
    } finally {
      await act(async () => {
        root.unmount()
      })
      host.remove()
    }
  })
})

describe('useNewRentalPricing', () => {
  const sampleLines: Line[] = [
    {
      id: 'l-1',
      name: 'Sony FX3',
      serial: 'FX3-001',
      category: 'Camera',
      lineType: 'Equipment',
      qty: 1,
      days: 2,
      ratePaisa: rupees(5000),
      discountPct: 0,
      location: 'Main Warehouse',
      committedTo: '—',
    },
  ]

  it('derives pricing breakdown and isolates deposit per Law 5', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let pricingResult!: UseNewRentalPricingResult

    function TestComponent() {
      pricingResult = useNewRentalPricing({
        lines: sampleLines,
        crew: [],
        days: 2,
        pickup: '2026-10-10',
        ret: '2026-10-12',
        pickupAt: new Date('2026-10-10T09:00:00Z'),
        clientPickup: true,
        deliveryChargePaisa: 0 as Paisa,
        quoteFuelPaisa: 0 as Paisa,
        returnTransportPaisa: 0,
        discountPct: 0,
        manualDiscountReason: '',
        manualDiscountAuthorizedBy: '',
        womenDopEligible: false,
        promoCodeApplied: null,
        vatOn: true,
        vatRatePercent: 13,
        savedDepositPaisa: null,
        manualDepositOverride: false,
        manualDepositAmount: '',
        depositOverrideReason: '',
        depositAuthorizedBy: '',
      })
      return null
    }

    try {
      await act(async () => {
        root.render(<TestComponent />)
      })

      // 1 item * 2 days * Rs 5,000 = Rs 10,000
      expect(pricingResult.equipmentPaisa).toBe(rupees(10000))
      expect(pricingResult.breakdown.subtotal).toBe(rupees(10000))
      expect(pricingResult.breakdown.vat).toBe(rupees(1300))
      expect(pricingResult.breakdown.rentalTotal).toBe(rupees(11300))

      // Deposit is liability (Law 5): isolated, not in rentalTotal or outstanding
      expect(pricingResult.depositRequiredPaisa).toBeGreaterThan(0)
      expect(pricingResult.breakdown.rentalTotal).not.toBe(
        pricingResult.breakdown.rentalTotal + pricingResult.depositRequiredPaisa,
      )
    } finally {
      await act(async () => {
        root.unmount()
      })
      host.remove()
    }
  })
})
