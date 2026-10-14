import { businessDayAd, kathmanduMinutes } from '../../data/today'
import { IS_MOCK } from '../supabase'
import { canPerformOperations, canViewMoney } from '../rbac'
import type { SystemRole } from '../../types/database'

export interface DeliveryWriteContext {
  role: SystemRole | null
  isOnline: boolean
}

export function deliveryReadRefusal(role: SystemRole | null): string | null {
  if (!role || role === 'Client') return 'Internal delivery records are not available to this session.'
  if (role === 'Driver') return 'Assigned delivery records are unavailable until verified trip assignment access is connected.'
  if (!IS_MOCK) return 'Delivery records are unavailable: a server-backed delivery query and action are not connected. No live deliveries were loaded and nothing has been saved.'
  return null
}

/** This local preview has no delivery server action. Never report a live save. */
export function deliveryMutationRefusal(context: DeliveryWriteContext): string | null {
  if (!context.role || !canPerformOperations(context.role) || !canViewMoney(context.role)) {
    return 'Your role cannot change delivery records.'
  }
  if (!IS_MOCK) {
    return 'Delivery changes are unavailable until a server-backed delivery action is connected. Nothing has been saved.'
  }
  if (!context.isOnline) return 'This device is offline. Delivery changes are not queued. Reconnect before trying again.'
  return null
}

function requireDeliveryMutation(context: DeliveryWriteContext): void {
  const refusal = deliveryMutationRefusal(context)
  if (refusal) throw new Error(refusal)
}

/**
 * One instant, rendered as `YYYY-MM-DD HH:MM`, both halves in **Kathmandu**.
 *
 * The bug this replaces: `new Date().toISOString().slice(0, 10)` for the date
 * and `new Date().toTimeString().slice(0, 5)` for the time. `toISOString` is
 * UTC and `toTimeString` is the device's own zone, so the two halves of one
 * stamp came from two different clocks — and Kathmandu is UTC+05:45, so between
 * 00:00 and 05:45 local every dispatch and delivery was stamped with YESTERDAY
 * and a time 5h45m ahead of the moment it recorded. `Finance.tsx` calls the
 * shape out by name; this is the same defect, reached the other way.
 *
 * Both halves now come from `data/today.ts`, the one place the offset lives.
 */
function kathmanduStamp(now: Date = new Date()): string {
  const minutes = kathmanduMinutes(now.toISOString())
  return `${businessDayAd(now)} ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export type DeliveryStatus = 'Scheduled' | 'Ready' | 'In Transit' | 'Delivered' | 'Failed'
export type DeliveryMode = 'Babin Delivery' | 'Courier / Rider' | 'Self Pickup'

export interface DeliveryRecord {
  id: string
  bookingNo: string
  clientName: string
  clientPhone: string
  address: string
  neighborhood: string
  mode: DeliveryMode
  driverName?: string
  driverPhone?: string
  vehiclePlate?: string
  status: DeliveryStatus
  scheduledDate: string
  scheduledTime: string
  dispatchedAt?: string
  deliveredAt?: string
  deliveryFeeNpr: number
  notes?: string
  recipientName?: string
  packageSealNo?: string
  gatePassNo?: string
}

export const INITIAL_DELIVERIES: DeliveryRecord[] = [
  {
    id: 'DEL-2601',
    bookingNo: 'BR-2613',
    clientName: 'Himalayan Films Pvt. Ltd.',
    clientPhone: '+977 9841234567',
    address: 'Bakhundole, Lalitpur (Near Summit Hotel)',
    neighborhood: 'Sanepa / Bakhundole',
    mode: 'Babin Delivery',
    driverName: 'Suman Rai',
    driverPhone: '+977 9851098765',
    vehiclePlate: 'Ba 3 Cha 8821 (Scorpio Van)',
    status: 'In Transit',
    scheduledDate: '2026-07-14',
    scheduledTime: '09:30',
    dispatchedAt: '2026-07-14 08:45',
    deliveryFeeNpr: 3500,
    notes: 'Fragile: 2 Pelican cases (ARRI Alexa Mini LF + NiSi Cine Primes). Handle with extreme care.',
    packageSealNo: 'BR-SEAL-882',
    gatePassNo: 'GP-0412',
  },
  {
    id: 'DEL-2602',
    bookingNo: 'BR-2611',
    clientName: 'Kathmandu Ad Lab',
    clientPhone: '+977 9801122334',
    address: 'Naxal, Kathmandu (Opposite Narayanhiti Gate 3)',
    neighborhood: 'Naxal',
    mode: 'Courier / Rider',
    driverName: 'Ramesh Thapa (Pathao Rider)',
    driverPhone: '+977 9813009988',
    vehiclePlate: 'Ba 92 Pa 3314',
    status: 'Ready',
    scheduledDate: '2026-07-14',
    scheduledTime: '11:00',
    deliveryFeeNpr: 1500,
    notes: 'Collect advance Rs 24,500 before equipment release.',
    packageSealNo: 'BR-SEAL-883',
    gatePassNo: 'GP-0413',
  },
  {
    id: 'DEL-2603',
    bookingNo: 'BR-2609',
    clientName: 'Studio Nine Creations',
    clientPhone: '+977 9818776655',
    address: 'Jhamsikhel, Lalitpur',
    neighborhood: 'Jhamsikhel',
    mode: 'Babin Delivery',
    driverName: 'Suman Rai',
    driverPhone: '+977 9851098765',
    vehiclePlate: 'Ba 3 Cha 8821 (Scorpio Van)',
    status: 'Delivered',
    scheduledDate: '2026-07-14',
    scheduledTime: '07:30',
    dispatchedAt: '2026-07-14 07:05',
    deliveredAt: '2026-07-14 07:34',
    recipientName: 'Anil Gurung (Production Manager)',
    deliveryFeeNpr: 3500,
    notes: 'Handed over on set at Studio Nine soundstage.',
    packageSealNo: 'BR-SEAL-880',
    gatePassNo: 'GP-0410',
  },
  {
    id: 'DEL-2604',
    bookingNo: 'BR-2614',
    clientName: 'White Peak Documentaries',
    clientPhone: '+977 9849988776',
    address: 'Baluwatar, Kathmandu',
    neighborhood: 'Baluwatar',
    mode: 'Babin Delivery',
    status: 'Scheduled',
    scheduledDate: '2026-07-15',
    scheduledTime: '08:00',
    deliveryFeeNpr: 3500,
    notes: 'RED V-Raptor kit + heavy-duty Sachtler tripod.',
  },
  {
    id: 'DEL-2605',
    bookingNo: 'BR-2615',
    clientName: 'Pokhara Mountain Sets',
    clientPhone: '+977 9856012345',
    address: 'Kalanki Highway Cargo Hub, Kathmandu',
    neighborhood: 'Kalanki',
    mode: 'Courier / Rider',
    status: 'Scheduled',
    scheduledDate: '2026-07-15',
    scheduledTime: '14:00',
    deliveryFeeNpr: 2000,
    notes: 'Consignment shipment to Pokhara via Night Express Courier.',
  },
]

const STORAGE_KEY = 'babin_rentals_deliveries_v1'

export function getDeliveries(role: SystemRole | null): DeliveryRecord[] {
  // Local sample records cannot stand in for live deliveries.
  if (deliveryReadRefusal(role)) return []
  if (typeof window === 'undefined') return INITIAL_DELIVERIES
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DELIVERIES))
      return INITIAL_DELIVERIES
    }
    return JSON.parse(raw) as DeliveryRecord[]
  } catch {
    return INITIAL_DELIVERIES
  }
}

export function saveDeliveries(list: DeliveryRecord[], context: DeliveryWriteContext): void {
  requireDeliveryMutation(context)
  if (typeof window === 'undefined') throw new Error('Delivery storage is unavailable. Nothing has been saved.')
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export function updateDeliveryStatus(
  id: string,
  status: DeliveryStatus,
  context: DeliveryWriteContext,
  extra?: { recipientName?: string; notes?: string }
): DeliveryRecord[] {
  requireDeliveryMutation(context)
  const current = getDeliveries(context.role)
  const timeStr = kathmanduStamp()

  const next = current.map((d) => {
    if (d.id !== id) return d
    const updated: DeliveryRecord = { ...d, status }
    if (status === 'In Transit' && !d.dispatchedAt) {
      updated.dispatchedAt = timeStr
    }
    if (status === 'Delivered') {
      updated.deliveredAt = timeStr
      if (extra?.recipientName) updated.recipientName = extra.recipientName
    }
    if (extra?.notes) {
      updated.notes = updated.notes ? `${updated.notes} · ${extra.notes}` : extra.notes
    }
    return updated
  })

  saveDeliveries(next, context)
  return next
}

export function assignDeliveryRider(
  id: string,
  driverName: string,
  driverPhone: string,
  vehiclePlate: string,
  context: DeliveryWriteContext
): DeliveryRecord[] {
  requireDeliveryMutation(context)
  const current = getDeliveries(context.role)
  const next = current.map((d) => {
    if (d.id !== id) return d
    return {
      ...d,
      driverName,
      driverPhone,
      vehiclePlate,
      status: d.status === 'Scheduled' ? ('Ready' as DeliveryStatus) : d.status,
    }
  })
  saveDeliveries(next, context)
  return next
}

/**
 * The next `DEL-nnnn`, derived from the HIGHEST number in use rather than from
 * the length of the list.
 *
 * `DEL-${2600 + current.length + 1}` reads as though it cannot collide, and it
 * can: the suffix tracked the array's size, so any deletion handed the same
 * number to a second dispatch. Two records then shared an id, and every later
 * lookup by id — assign a rider, mark in transit, mark delivered — silently
 * updated whichever came first in the array and left the other untouched.
 *
 * A number that is already taken is stepped past, so a legacy record carrying a
 * non-numeric or absent id cannot make this reissue one either.
 */
function nextDeliveryId(existing: readonly DeliveryRecord[]): string {
  let highest = 2600
  for (const d of existing) {
    const n = Number(d.id.replace(/^DEL-/, ''))
    if (Number.isFinite(n) && n > highest) highest = Math.floor(n)
  }
  let candidate = highest + 1
  const taken = new Set(existing.map((d) => d.id))
  while (taken.has(`DEL-${candidate}`)) candidate += 1
  return `DEL-${candidate}`
}

export function createDeliveryRecord(payload: Omit<DeliveryRecord, 'id'>, context: DeliveryWriteContext): DeliveryRecord {
  requireDeliveryMutation(context)
  const current = getDeliveries(context.role)
  const created: DeliveryRecord = { ...payload, id: nextDeliveryId(current) }
  const next = [created, ...current]
  saveDeliveries(next, context)
  return created
}
