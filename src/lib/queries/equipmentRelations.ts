import { supabase } from '../supabase'

export interface EquipmentBookingRelation {
  bookingId: string
  bookingNo: string
  clientName: string
  stage: string
  pickupAtAd: string
  returnAtAd: string
  qty: number
  lineId: string
}

interface RawRelation {
  id: string
  qty: number
  booking_id: string
  bookings: {
    id: string
    booking_no: string
    stage: string
    pickup_at: string
    return_at: string
    clients: { name: string } | null
  } | null
}

/** Read every visible, non-voided booking line for this product. Pagination
 * prevents a high-use asset from silently losing older or upcoming work. */
export async function equipmentBookingRelations(productId: string): Promise<EquipmentBookingRelation[]> {
  const rows: RawRelation[] = []
  const pageSize = 100
  for (let page = 0; page < 100; page += 1) {
    const { data, error } = (await supabase
      .from('booking_lines')
      .select('id, qty, booking_id, bookings ( id, booking_no, stage, pickup_at, return_at, clients ( name ) )')
      .eq('product_id', productId)
      .is('voided_at', null)
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)) as unknown as { data: RawRelation[] | null; error: { message: string } | null }
    if (error) throw new Error(`Equipment booking relationships unavailable: ${error.message}`)
    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < pageSize) break
    if (page === 99) throw new Error('Equipment booking relationships exceed the preview limit')
  }
  return rows.filter((row): row is RawRelation & { bookings: NonNullable<RawRelation['bookings']> } => row.bookings !== null).map((row) => ({
    bookingId: row.bookings.id,
    bookingNo: row.bookings.booking_no,
    clientName: row.bookings.clients?.name ?? 'Client not joined',
    stage: row.bookings.stage,
    pickupAtAd: row.bookings.pickup_at,
    returnAtAd: row.bookings.return_at,
    qty: row.qty,
    lineId: row.id,
  }))
}
