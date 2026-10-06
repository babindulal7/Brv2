import { useMemo } from 'react'
import {
  calculatePricingPipeline,
  type PricingPipelineResult,
  PROMO_CODES,
} from '../../../lib/pricingPipeline'
import { rupees, type Paisa } from '../../../lib/money'
import { rentalDaysBetween } from '../../../lib/rentalDays'
import { lineAmountPaisa, type Line } from './RentalLineItemsTree'
import type { CrewLine } from './CrewSection'

export interface UseNewRentalPricingOptions {
  lines: Line[]
  crew: CrewLine[]
  days: number
  pickup: string
  ret: string
  pickupAt: Date | null
  clientPickup: boolean
  deliveryChargePaisa: Paisa
  quoteFuelPaisa: Paisa
  returnTransportPaisa: number
  discountPct: number
  manualDiscountReason: string
  manualDiscountAuthorizedBy: string
  womenDopEligible: boolean
  promoCodeApplied: string | null
  vatOn: boolean
  vatRatePercent: number
  savedDepositPaisa: Paisa | null
  manualDepositOverride: boolean
  manualDepositAmount: string
  depositOverrideReason: string
  depositAuthorizedBy: string
}

export interface PricingBreakdown {
  equipment: Paisa
  crew: Paisa
  transport: Paisa
  subtotal: Paisa
  discount: Paisa
  taxable: Paisa
  vat: Paisa
  rentalTotal: Paisa
  outstanding: Paisa
}

export interface UseNewRentalPricingResult {
  standaloneEquipmentLines: Line[]
  equipmentLines: Line[]
  bundleLines: Line[]
  subRentalLines: Line[]
  equipmentPaisa: Paisa
  bundlePaisa: Paisa
  subRentalPaisa: Paisa
  servicePaisa: Paisa
  crewChargesPaisa: Paisa
  isStudentBundle: boolean
  recommendedDepositPaisa: Paisa
  manualDepositPaisa: Paisa | null
  pricing: PricingPipelineResult
  breakdown: PricingBreakdown
  depositRequiredPaisa: Paisa
  depositReceivedPaisa: Paisa
  depositPendingPaisa: Paisa
  pricingHints: Record<number, Paisa>
}

/**
 * Pure calculation hook for the New Rental pricing pipeline (Law 1 engine authority).
 * Encapsulates equipment line grouping, gear totals, crew charges, transport additions,
 * deposit liability calculation (Law 5), promo/discounts, and duration pricing hints.
 */
export function useNewRentalPricing({
  lines,
  crew,
  days,
  pickup,
  ret,
  pickupAt,
  clientPickup,
  deliveryChargePaisa,
  quoteFuelPaisa,
  returnTransportPaisa,
  discountPct,
  manualDiscountReason,
  manualDiscountAuthorizedBy,
  womenDopEligible,
  promoCodeApplied,
  vatOn,
  vatRatePercent,
  savedDepositPaisa,
  manualDepositOverride,
  manualDepositAmount,
  depositOverrideReason,
  depositAuthorizedBy,
}: UseNewRentalPricingOptions): UseNewRentalPricingResult {
  const standaloneEquipmentLines = useMemo(
    () => lines.filter((l) => (l.lineType === undefined || l.lineType === 'Equipment') && !l.isIncluded),
    [lines],
  )
  const equipmentLines = standaloneEquipmentLines

  const bundleLines = useMemo(
    () => lines.filter((l) => l.lineType === 'Bundle'),
    [lines],
  )

  const equipmentPaisa = useMemo(
    () => standaloneEquipmentLines.reduce((s, l) => s + lineAmountPaisa(l), 0) as Paisa,
    [standaloneEquipmentLines],
  )
  const bundlePaisa = useMemo(
    () => bundleLines.reduce((s, l) => s + lineAmountPaisa(l), 0) as Paisa,
    [bundleLines],
  )
  const subRentalLines = useMemo(
    () => lines.filter((l) => l.lineType === 'Sub-rental'),
    [lines],
  )
  const subRentalPaisa = useMemo(
    () => subRentalLines.reduce((s, l) => s + lineAmountPaisa(l), 0) as Paisa,
    [subRentalLines],
  )
  const servicePaisa = useMemo(
    () =>
      lines
        .filter((l) => l.lineType === 'Service' || l.lineType === 'Manual item')
        .reduce((s, l) => s + lineAmountPaisa(l), 0) as Paisa,
    [lines],
  )
  const crewChargesPaisa = useMemo(
    () =>
      crew.reduce(
        (s, c) =>
          s +
          c.dayRatePaisa * (c.days ?? days) +
          c.overtimePaisa +
          c.accommodationPaisa +
          c.mealsPaisa,
        0,
      ) as Paisa,
    [crew, days],
  )

  const isStudentBundle = useMemo(
    () =>
      lines.some(
        (l) =>
          l.bundleName?.toLowerCase().includes('student') ||
          l.category?.toLowerCase().includes('student') ||
          l.category?.toLowerCase().includes('college'),
      ),
    [lines],
  )

  const recommendedDepositPaisa = useMemo<Paisa>(() => {
    const totalGear = equipmentPaisa + bundlePaisa + subRentalPaisa
    if (totalGear <= 0) return 0 as Paisa
    return Math.max(500000, Math.round(totalGear)) as Paisa
  }, [equipmentPaisa, bundlePaisa, subRentalPaisa])

  const manualDepositPaisa = useMemo<Paisa | null>(() => {
    if (!manualDepositOverride) return null
    const num = Number(manualDepositAmount)
    return Number.isFinite(num) && num >= 0 ? (rupees(num) as Paisa) : null
  }, [manualDepositOverride, manualDepositAmount])

  const pricing = useMemo<PricingPipelineResult>(() => {
    const promoCodeKey = promoCodeApplied ? String(promoCodeApplied).toUpperCase() : null
    const promo = promoCodeKey ? (PROMO_CODES[promoCodeKey] ?? null) : null
    return calculatePricingPipeline({
      equipmentSubtotalPaisa: equipmentPaisa,
      bundleSubtotalPaisa: bundlePaisa,
      subRentalSubtotalPaisa: subRentalPaisa,
      servicesSubtotalPaisa: servicePaisa,
      crewSubtotalPaisa: crewChargesPaisa,
      deliveryChargePaisa: ((clientPickup ? 0 : deliveryChargePaisa) + returnTransportPaisa) as Paisa,
      fuelChargePaisa: quoteFuelPaisa,
      discounts: {
        manualDiscountPercent: discountPct,
        manualDiscountReason: manualDiscountReason.trim() || null,
        manualDiscountAuthorizedBy: manualDiscountAuthorizedBy.trim() || null,
        womenDopEligible,
        promoCode: promo,
        isStudentBundle,
      },
      vatEnabled: vatOn,
      vatRatePercent,
      recommendedDepositPaisa: savedDepositPaisa ?? recommendedDepositPaisa,
      manualDepositOverridePaisa: manualDepositPaisa,
      depositOverrideReason: manualDepositOverride ? depositOverrideReason.trim() || null : null,
      depositAuthorizedBy: manualDepositOverride ? depositAuthorizedBy.trim() || null : null,
      bookingDateAd: pickupAt?.toISOString(),
    })
  }, [
    equipmentPaisa,
    bundlePaisa,
    subRentalPaisa,
    servicePaisa,
    crewChargesPaisa,
    clientPickup,
    deliveryChargePaisa,
    quoteFuelPaisa,
    returnTransportPaisa,
    discountPct,
    manualDiscountReason,
    manualDiscountAuthorizedBy,
    womenDopEligible,
    promoCodeApplied,
    isStudentBundle,
    vatOn,
    vatRatePercent,
    recommendedDepositPaisa,
    savedDepositPaisa,
    manualDepositOverride,
    manualDepositPaisa,
    depositOverrideReason,
    depositAuthorizedBy,
    pickupAt,
  ])

  const breakdown = useMemo<PricingBreakdown>(
    () => ({
      equipment: pricing.equipmentSubtotalPaisa,
      crew: pricing.crewSubtotalPaisa,
      transport: pricing.deliverySubtotalPaisa,
      subtotal: pricing.grossSubtotalPaisa,
      discount: pricing.discounts.discountPaisa,
      taxable: pricing.taxableSubtotalPaisa,
      vat: pricing.vatPaisa,
      rentalTotal: pricing.rentalTotalPaisa,
      outstanding: pricing.rentalTotalPaisa,
    }),
    [pricing],
  )

  const depositRequiredPaisa = pricing.securityDeposit.requiredPaisa
  const depositReceivedPaisa = rupees(0) as Paisa
  const depositPendingPaisa = depositRequiredPaisa

  const pricingHints = useMemo(() => {
    const hints: Record<number, Paisa> = {}
    const rentalDays = rentalDaysBetween(pickup, ret) ?? 1
    if (rentalDays > 0 && pricing.rentalTotalPaisa > 0) {
      const dailyRate = Math.round(pricing.rentalTotalPaisa / rentalDays)
      for (const d of [1, 3, 7]) {
        hints[d] = (dailyRate * d) as Paisa
      }
    }
    return hints
  }, [pricing.rentalTotalPaisa, pickup, ret])

  return {
    standaloneEquipmentLines,
    equipmentLines,
    bundleLines,
    subRentalLines,
    equipmentPaisa,
    bundlePaisa,
    subRentalPaisa,
    servicePaisa,
    crewChargesPaisa,
    isStudentBundle,
    recommendedDepositPaisa,
    manualDepositPaisa,
    pricing,
    breakdown,
    depositRequiredPaisa,
    depositReceivedPaisa,
    depositPendingPaisa,
    pricingHints,
  }
}
