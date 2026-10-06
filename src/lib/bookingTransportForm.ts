import { parseMoney, rupees, toRupees, type Paisa } from './money'

export interface ReturnPickupForm {
  specialInstructions: string
  returnPickupType?: 'Client Return' | 'Babin Pickup' | undefined
  returnPickupAddress?: string | undefined
  returnPickupTime?: string | undefined
  returnPickupChargePaisa?: number | undefined
}

/** Keep the transport format already written by New Booking readable on edit. */
export function transportInstructions(form: ReturnPickupForm): string | null {
  const pickup = form.returnPickupType === 'Babin Pickup'
    ? `Return Pickup: Babin Pickup from "${form.returnPickupAddress?.trim() || 'Client Location'}" at ${form.returnPickupTime || '18:00'}${(form.returnPickupChargePaisa ?? 0) > 0 ? ` (Return Pickup Fee: Rs ${toRupees(form.returnPickupChargePaisa as Paisa)})` : ''}`
    : null
  return [form.specialInstructions.trim() || null, pickup].filter(Boolean).join(' | ') || null
}

export function readTransportForm(instructions: string, deliveryChargeRupees: number, clientPickup: boolean) {
  const total = rupees(deliveryChargeRupees)
  const match = /(?:^| \| )Return Pickup: Babin Pickup from "(.*)" at (\d{2}:\d{2})(?: \(Return Pickup Fee: Rs ([\d,.]+)\))?$/.exec(instructions)
  const parsedFee = match?.[3] ? parseMoney(match[3]) : (0 as Paisa)
  const recognised = match !== null && parsedFee !== null && parsedFee >= 0 && parsedFee <= total && (!clientPickup || parsedFee === total)
  const fee = recognised ? parsedFee : clientPickup ? total : (0 as Paisa)
  return {
    specialInstructions: recognised ? instructions.slice(0, match.index) : instructions,
    deliveryChargePaisa: (total - fee) as Paisa,
    returnPickupType: recognised || (clientPickup && total > 0) ? 'Babin Pickup' as const : 'Client Return' as const,
    returnPickupAddress: recognised ? match[1] ?? '' : '',
    returnPickupTime: recognised ? match[2] ?? '18:00' : '18:00',
    returnPickupChargePaisa: fee,
  }
}
