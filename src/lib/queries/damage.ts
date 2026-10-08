import { formatAd } from '../bs'
import { supabase } from '../supabase'
import { DAMAGE_FINDINGS, type DamageFinding } from '../../data/damage'
import { rupees } from '../money'

export { DAMAGE_FINDINGS }
export type { DamageFinding }

export async function getDamageFindings(): Promise<DamageFinding[]> {
  try {
    // We select pending and recently approved findings.
    // The query relies on PostgREST's ability to navigate FKs.
    const { data, error } = await supabase
      .from('damage_findings')
      .select(`
        id,
        description,
        estimated_cost,
        approval_state,
        created_at,
        approved_by_user:users!damage_findings_approved_by_fk(name),
        creator:users!damage_findings_created_by_fk(name),
        unit:product_units(serial_number, product:products(name, replacement_value)),
        return_line:return_lines(booking_line:booking_lines(booking:bookings(booking_no, client:clients(name)))),
        cleaning_entry:cleaning_queue_entries(booking:bookings(booking_no, client:clients(name)))
      `)
      .is('voided_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('getDamageFindings query error:', error)
      return []
    }

interface DamageFindingRow {
  id: string
  description: string
  estimated_cost: number | string | null
  approval_state: string
  created_at: string
  approved_by_user?: { name: string } | null
  creator?: { name: string } | null
  unit?: {
    serial_number: string
    product?: {
      name: string
      replacement_value: number | string | null
    } | null
  } | null
  return_line?: {
    booking_line?: {
      booking?: {
        booking_no: string
        client?: { name: string } | null
      } | null
    } | null
  } | null
  cleaning_entry?: {
    booking?: {
      booking_no: string
      client?: { name: string } | null
    } | null
  } | null
}

    return ((data as unknown as DamageFindingRow[]) ?? []).map((row: DamageFindingRow) => {
      // Resolve booking/client path from either return_lines or cleaning_queue_entries
      const bookingPath = row.return_line?.booking_line?.booking || row.cleaning_entry?.booking
      
      const depositHeld = 0 // Deposit isn't directly joined here, but would be fetched via bookings. 
      // For the UI, we just map what we can. The original mock used assessed_amount.

      return {
        id: row.id,
        unitName: row.unit?.product?.name || 'Unknown Unit',
        serial: row.unit?.serial_number || 'Unknown SN',
        bookingNo: bookingPath?.booking_no || 'Unknown Booking',
        client: bookingPath?.client?.name || 'Unknown Client',
        raisedBy: row.creator?.name || 'Staff',
        raisedAtBs: '',
        raisedAtAd: row.created_at ? formatAd(new Date(row.created_at)) : '',
        state: row.approval_state === 'Approved' ? 'Approved' : 'Awaiting Approval',
        description: row.description,
        photos: 1, // Assumption as photos are stored externally or via another relation
        replacementPaisa: rupees(Number(row.unit?.product?.replacement_value) || 0),
        chargePaisa: rupees(Number(row.estimated_cost) || 0),
        depositPaisa: rupees(depositHeld),
        approvedBy: row.approved_by_user?.name,
      }
    })
  } catch (err) {
    console.error('getDamageFindings exception:', err)
    return []
  }
}
