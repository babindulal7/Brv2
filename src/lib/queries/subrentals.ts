import { supabase } from '../supabase'
import { rupees, type Paisa } from '../money'
import type { ListFilters } from './listQuery'
import type { ListQueryResult } from './useList'
import {
  groupByCounterparty,
  supplierGlance,
  supplierDetailGroups,
  supplierDirectoryRow,
  type SupplierGroup,
  type SupplierDirectoryRow,
} from '../../data/supplierIntel'

export type SubRentalDirection = 'Borrowing' | 'Lending'
export type SubRentalStatus = 'Reserved' | 'Picked Up' | 'On Rent' | 'Returned' | 'Checked In' | 'Cancelled'

export interface SubRentalRecord {
  id: string
  counterparty: string
  linkedBooking?: string
  direction: SubRentalDirection
  equipment: string
  quantity: number
  startDateBs: string
  endDateBs: string
  startDateAd: string
  endDateAd: string
  rentalValuePaisa: Paisa
  revenuePaisa: Paisa
  costPaisa: Paisa
  status: SubRentalStatus
  isOverdue: boolean
}

export const SUB_RENTAL_DATA: SubRentalRecord[] = [
  {
    id: 'SR-2026-0032',
    counterparty: 'GearHouse KTM',
    linkedBooking: 'B-715',
    direction: 'Borrowing',
    equipment: 'RED V-Raptor 8K VV',
    quantity: 1,
    startDateBs: '2083/03/10',
    endDateBs: '2083/03/15',
    startDateAd: '24 Jun 2026',
    endDateAd: '29 Jun 2026',
    rentalValuePaisa: rupees(120000),
    revenuePaisa: rupees(120000),
    costPaisa: rupees(91500),
    status: 'On Rent',
    isOverdue: false,
  },
  {
    id: 'SR-2026-0033',
    counterparty: 'Kathmandu Cinema Works',
    direction: 'Lending',
    equipment: 'ARRI SkyPanel S60-C',
    quantity: 2,
    startDateBs: '2083/03/12',
    endDateBs: '2083/03/14',
    startDateAd: '26 Jun 2026',
    endDateAd: '28 Jun 2026',
    rentalValuePaisa: rupees(30000),
    revenuePaisa: rupees(30000),
    costPaisa: rupees(0),
    status: 'Returned',
    isOverdue: true,
  },
  {
    id: 'SR-2026-0034',
    counterparty: 'Pokhara Light & Grip',
    linkedBooking: 'B-718',
    direction: 'Borrowing',
    equipment: 'Cooke S4/i 5-Lens Set',
    quantity: 1,
    startDateBs: '2083/03/15',
    endDateBs: '2083/03/20',
    startDateAd: '29 Jun 2026',
    endDateAd: '04 Jul 2026',
    rentalValuePaisa: rupees(180000),
    revenuePaisa: rupees(180000),
    costPaisa: rupees(135000),
    status: 'Reserved',
    isOverdue: false,
  },
  {
    id: 'SR-2026-0035',
    counterparty: 'Himalayan Film Equipment',
    direction: 'Lending',
    equipment: 'Sony FX6 Cinema Line',
    quantity: 1,
    startDateBs: '2083/03/16',
    endDateBs: '2083/03/18',
    startDateAd: '30 Jun 2026',
    endDateAd: '02 Jul 2026',
    rentalValuePaisa: rupees(24000),
    revenuePaisa: rupees(24000),
    costPaisa: rupees(0),
    status: 'Picked Up',
    isOverdue: false,
  },
]

export {
  groupByCounterparty,
  supplierGlance,
  supplierDetailGroups,
  supplierDirectoryRow,
  type SupplierGroup,
  type SupplierDirectoryRow,
}

export function mapStageToSubRentalStatus(stage: string | null | undefined): SubRentalStatus {
  switch (stage) {
    case 'Draft':
    case 'Quote':
    case 'Booked':
      return 'Reserved'
    case 'Packed':
      return 'Picked Up'
    case 'On Rent':
      return 'On Rent'
    case 'Returned':
      return 'Returned'
    case 'Closed':
      return 'Checked In'
    default:
      return 'Reserved'
  }
}

interface BookingLineRowDb {
  id: string
  booking_id: string
  item_description: string | null
  rate: number | null
  supplier_cost: number | null
  qty: number | null
  days: number | null
  line_type: string
  created_at: string
}

export async function listSubRentals(_filters?: ListFilters): Promise<ListQueryResult<SubRentalRecord>> {
  try {
    const { data, error } = await supabase
      .from('booking_lines_v')
      .select('id, booking_id, item_description, rate, supplier_cost, qty, days, line_type, created_at')
      .eq('line_type', 'Sub-rental')

    if (error || !data || data.length === 0) {
      return {
        rows: [...SUB_RENTAL_DATA],
        total: SUB_RENTAL_DATA.length,
      }
    }

    const rows = (data as unknown as BookingLineRowDb[]).map((line, idx) => {
      const rentalVal = line.rate ?? 0
      const costVal = line.supplier_cost ?? 0
      return {
        id: `SR-2026-${String(idx + 1).padStart(4, '0')}`,
        counterparty: 'Partner Supplier',
        linkedBooking: `B-${line.booking_id.slice(0, 4)}`,
        direction: 'Borrowing' as SubRentalDirection,
        equipment: line.item_description || 'Sub-rental gear',
        quantity: line.qty ?? 1,
        startDateBs: '2083/03/10',
        endDateBs: '2083/03/15',
        startDateAd: '24 Jun 2026',
        endDateAd: '29 Jun 2026',
        rentalValuePaisa: rupees(rentalVal),
        revenuePaisa: rupees(rentalVal),
        costPaisa: rupees(costVal),
        status: 'Reserved' as SubRentalStatus,
        isOverdue: false,
      }
    })

    return {
      rows,
      total: rows.length,
    }
  } catch {
    return {
      rows: [...SUB_RENTAL_DATA],
      total: SUB_RENTAL_DATA.length,
    }
  }
}
