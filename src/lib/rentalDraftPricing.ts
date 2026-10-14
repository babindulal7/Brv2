import type { RentalDraftData } from '../actions/rentals/saveDraft'
import { roundHalfUp, type Paisa } from './money'
import { calculatePricingPipeline } from './pricingPipeline'
import { rentalDaysBetween } from './rentalDays'

export function draftInstant(day: string, time: string): string | null {
  if (!day || !time) return null
  const value = new Date(`${day}T${time}:00+05:45`)
  return Number.isFinite(value.getTime()) ? value.toISOString() : null
}

/** Price only persisted draft terms, through the New Rental financial engine. */
export function calculateDraftTotal(data: RentalDraftData): Paisa {
  const pickup = draftInstant(data.pickup, data.pickupTime)
  const days = rentalDaysBetween(pickup, draftInstant(data.returnDate, data.returnTime)) ?? 1
  const sum = (types: readonly string[], excludeIncluded = false) => data.lines.reduce((total, line) =>
    total + (types.includes(line.lineType ?? 'Equipment') && (!excludeIncluded || !line.isIncluded)
      ? roundHalfUp(line.qty * line.days * line.ratePaisa * (1 - line.discountPct / 100)) : 0), 0) as Paisa
  return calculatePricingPipeline({
    equipmentSubtotalPaisa: sum(['Equipment'], true),
    bundleSubtotalPaisa: sum(['Bundle']),
    subRentalSubtotalPaisa: sum(['Sub-rental']),
    servicesSubtotalPaisa: sum(['Service', 'Manual item']),
    crewSubtotalPaisa: data.crew.reduce((total, crew) => total + crew.dayRatePaisa * (crew.days ?? days) + crew.overtimePaisa + crew.accommodationPaisa + crew.mealsPaisa, 0) as Paisa,
    deliveryChargePaisa: ((data.deliveryType === 'Babin Delivery' ? data.deliveryChargePaisa : 0) + (data.returnPickupChargePaisa ?? 0)) as Paisa,
    fuelChargePaisa: data.fuelChargePaisa as Paisa,
    discounts: { manualDiscountPercent: data.discountPct, isStudentBundle: data.lines.some(line => /student|college/i.test(`${line.bundleName ?? ''} ${line.category}`)) },
    vatEnabled: data.vatOn,
    vatRatePercent: data.vatRatePercent,
    ...(pickup ? { bookingDateAd: pickup } : {}),
  }).rentalTotalPaisa
}
