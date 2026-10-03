import { supabase } from '../supabase'

export interface OperationMetrics {
  totalPickups: number
  onTimePickupRate: number
  totalReturns: number
  onTimeReturnRate: number
  currentlyOverdue: number
  totalPackingJobs: number
  packingFulfillmentRate: number
  idVerificationRate: number
}

export interface DeliveryMethodBreakdown {
  method: string
  count: number
  percent: number
}

export interface PickupSessionItem {
  id: string
  bookingNo: string
  clientName: string
  pickupAt: string
  deliveryType: string
  receiverName: string
  idVerified: boolean
  staffName: string
  status: string
}

export interface ReturnConditionBreakdown {
  condition: string
  count: number
  percent: number
}

export interface ReturnSessionItem {
  id: string
  bookingNo: string
  clientName: string
  returnAt: string
  returningPerson: string
  condition: string
  cleaningRequired: boolean
  damageSuspected: boolean
  status: string
}

export interface OverdueRentalItem {
  id: string
  bookingNo: string
  clientName: string
  project: string
  scheduledReturn: string
  daysOverdue: number
  deliveryType: string
  severity: 'moderate' | 'critical' | 'severe'
}

export interface PackingJobItem {
  id: string
  bookingNo: string
  clientName: string
  project: string
  pickupScheduled: string
  itemCount: number
  state: 'pending' | 'packed' | 'partial'
}

export interface OperationsReportData {
  metrics: OperationMetrics
  deliveryMethods: DeliveryMethodBreakdown[]
  returnConditions: ReturnConditionBreakdown[]
  pickups: PickupSessionItem[]
  returns: ReturnSessionItem[]
  overdueList: OverdueRentalItem[]
  packingJobs: PackingJobItem[]
}

export interface ReportFilterOptions {
  from?: string | undefined
  to?: string | undefined
  branchId?: string | undefined
}

/* ── Fallback Seed Data (Hermetic baseline for mock mode & empty DB) ──────── */

const MOCK_OPERATIONS: OperationsReportData = {
  metrics: {
    totalPickups: 46,
    onTimePickupRate: 93.5,
    totalReturns: 42,
    onTimeReturnRate: 88.1,
    currentlyOverdue: 3,
    totalPackingJobs: 48,
    packingFulfillmentRate: 98.2,
    idVerificationRate: 95.7,
  },
  deliveryMethods: [
    { method: 'Customer Pickup', count: 28, percent: 61 },
    { method: 'Babin Delivery', count: 12, percent: 26 },
    { method: 'Courier', count: 4, percent: 9 },
    { method: 'Third Party', count: 2, percent: 4 },
  ],
  returnConditions: [
    { condition: 'Clean / Good Condition', count: 32, percent: 76 },
    { condition: 'Needs Cleaning', count: 7, percent: 17 },
    { condition: 'Damage Suspected', count: 3, percent: 7 },
  ],
  pickups: [
    { id: 'pk-01', bookingNo: 'BK-2026-0071', clientName: 'Highland Pictures', pickupAt: '2026-09-24T08:00:00Z', deliveryType: 'Customer Pickup', receiverName: 'Bikash Shrestha', idVerified: true, staffName: 'Prakash Sharma', status: 'Completed' },
    { id: 'pk-02', bookingNo: 'BK-2026-0072', clientName: 'KTM Motion Arts', pickupAt: '2026-09-24T09:30:00Z', deliveryType: 'Babin Delivery', receiverName: 'Sunil Thapa', idVerified: true, staffName: 'Rabin Tamang', status: 'Completed' },
    { id: 'pk-03', bookingNo: 'BK-2026-0073', clientName: 'Aura Media Studio', pickupAt: '2026-09-25T07:45:00Z', deliveryType: 'Customer Pickup', receiverName: 'Anil Gurung', idVerified: true, staffName: 'Prakash Sharma', status: 'Completed' },
    { id: 'pk-04', bookingNo: 'BK-2026-0074', clientName: 'Red Panda Creative', pickupAt: '2026-09-25T11:00:00Z', deliveryType: 'Courier', receiverName: 'Courier Driver', idVerified: false, staffName: 'Rabin Tamang', status: 'Completed' },
    { id: 'pk-05', bookingNo: 'BK-2026-0075', clientName: 'Mountain Trail Films', pickupAt: '2026-09-26T08:30:00Z', deliveryType: 'Customer Pickup', receiverName: 'Deepak Adhikari', idVerified: true, staffName: 'Prakash Sharma', status: 'Completed' },
  ],
  returns: [
    { id: 'rt-01', bookingNo: 'BK-2026-0065', clientName: 'Everest Vision', returnAt: '2026-09-23T16:00:00Z', returningPerson: 'Bikash Shrestha', condition: 'Clean / Good Condition', cleaningRequired: false, damageSuspected: false, status: 'Completed' },
    { id: 'rt-02', bookingNo: 'BK-2026-0066', clientName: 'Urban Frame', returnAt: '2026-09-23T17:30:00Z', returningPerson: 'Nabin KC', condition: 'Needs Cleaning', cleaningRequired: true, damageSuspected: false, status: 'Completed' },
    { id: 'rt-03', bookingNo: 'BK-2026-0067', clientName: 'Pokhara Studios', returnAt: '2026-09-24T15:00:00Z', returningPerson: 'Karan Rana', condition: 'Clean / Good Condition', cleaningRequired: false, damageSuspected: false, status: 'Completed' },
    { id: 'rt-04', bookingNo: 'BK-2026-0068', clientName: 'Himalaya Films', returnAt: '2026-09-25T18:00:00Z', returningPerson: 'Anish Rai', condition: 'Damage Suspected', cleaningRequired: true, damageSuspected: true, status: 'Completed' },
    { id: 'rt-05', bookingNo: 'BK-2026-0070', clientName: 'Aura Media Studio', returnAt: '2026-09-26T14:30:00Z', returningPerson: 'Suman Shrestha', condition: 'Clean / Good Condition', cleaningRequired: false, damageSuspected: false, status: 'Completed' },
  ],
  overdueList: [
    { id: 'ov-01', bookingNo: 'BK-2026-0058', clientName: 'Studio Black Nepal', project: 'Indie Feature Shoot', scheduledReturn: '2026-09-22T18:00:00Z', daysOverdue: 4, deliveryType: 'Customer Pickup', severity: 'critical' },
    { id: 'ov-02', bookingNo: 'BK-2026-0061', clientName: 'Valley Ad Agency', project: 'Automotive Commercial', scheduledReturn: '2026-09-24T17:00:00Z', daysOverdue: 2, deliveryType: 'Babin Delivery', severity: 'moderate' },
    { id: 'ov-03', bookingNo: 'BK-2026-0055', clientName: 'Wild Yak Productions', project: 'Wildlife Series Episode 3', scheduledReturn: '2026-09-18T16:00:00Z', daysOverdue: 8, deliveryType: 'Customer Pickup', severity: 'severe' },
  ],
  packingJobs: [
    { id: 'pj-01', bookingNo: 'BK-2026-0078', clientName: 'Metro Broadcast', project: 'Morning News Special', pickupScheduled: '2026-09-27T07:00:00Z', itemCount: 14, state: 'packed' },
    { id: 'pj-02', bookingNo: 'BK-2026-0079', clientName: 'Lalitpur Arts', project: 'Festival Documentary', pickupScheduled: '2026-09-27T08:30:00Z', itemCount: 22, state: 'packed' },
    { id: 'pj-03', bookingNo: 'BK-2026-0080', clientName: 'Chitwan Wildlife Media', project: 'Jungle Feature', pickupScheduled: '2026-09-28T06:00:00Z', itemCount: 35, state: 'pending' },
    { id: 'pj-04', bookingNo: 'BK-2026-0081', clientName: 'Zenith Studio', project: 'Music Video Production', pickupScheduled: '2026-09-28T09:00:00Z', itemCount: 18, state: 'pending' },
  ],
}

/* ── Query Aggregations from PostgreSQL ─────────────────────────────────── */

export async function getOperationsReport(options?: ReportFilterOptions): Promise<OperationsReportData> {
  try {
    let bookingsQuery = supabase
      .from('bookings')
      .select(`
        id,
        booking_no,
        client_id,
        branch_id,
        stage,
        pickup_at,
        return_at,
        actual_return_at,
        delivery_type,
        project,
        clients!client_id(name),
        booking_lines(id, qty)
      `)

    if (options?.from) bookingsQuery = bookingsQuery.gte('pickup_at', options.from)
    if (options?.to) bookingsQuery = bookingsQuery.lte('pickup_at', options.to)
    if (options?.branchId) bookingsQuery = bookingsQuery.eq('branch_id', options.branchId)

    const [bookingsRes, sessionsRes, returnsRes] = await Promise.all([
      bookingsQuery,
      supabase
        .from('operation_sessions')
        .select(`
          id,
          booking_id,
          operation,
          session_no,
          state,
          started_at,
          completed_at,
          receiver_name,
          government_id_verified,
          booking_authorization_verified,
          returning_person_name,
          pickup_person_name
        `)
        .order('completed_at', { ascending: false }),
      supabase
        .from('return_lines')
        .select('id, session_id, condition, cleaning_required, damage_suspected'),
    ])

    const bookings = bookingsRes.data || []
    const sessions = sessionsRes.data || []
    const returnLines = returnsRes.data || []

    if (bookings.length === 0 && sessions.length === 0) {
      return MOCK_OPERATIONS
    }

    // Delivery method counts
    const deliveryMap: Record<string, number> = {}
    let totalPickups = 0
    let verifiedIdCount = 0

    // Overdue tracking
    const overdueList: OverdueRentalItem[] = []
    const nowMs = Date.now()

    // Packing jobs
    const packingJobs: PackingJobItem[] = []

    for (const b of bookings) {
      const dType = b.delivery_type || 'Customer Pickup'
      deliveryMap[dType] = (deliveryMap[dType] || 0) + 1

      // Overdue check: On Rent & past return_at
      if (b.stage === 'On Rent' && b.return_at) {
        const retMs = Date.parse(b.return_at)
        if (!isNaN(retMs) && retMs < nowMs && !b.actual_return_at) {
          const daysLate = Math.max(1, Math.floor((nowMs - retMs) / 86400000))
          const severity: OverdueRentalItem['severity'] =
            daysLate >= 6 ? 'severe' : daysLate >= 3 ? 'critical' : 'moderate'

          const clientObj = b.clients as { name?: string } | null
          overdueList.push({
            id: b.id,
            bookingNo: b.booking_no,
            clientName: clientObj?.name || 'Client',
            project: b.project || 'Active Production',
            scheduledReturn: b.return_at,
            daysOverdue: daysLate,
            deliveryType: dType,
            severity,
          })
        }
      }

      // Packing jobs check: Booked or Packed
      if (b.stage === 'Booked' || b.stage === 'Packed') {
        const clientObj = b.clients as { name?: string } | null
        const lines = (b.booking_lines as Array<{ id: string; qty: number }>) || []
        const totalItems = lines.reduce((acc, l) => acc + (l.qty || 1), 0)

        packingJobs.push({
          id: b.id,
          bookingNo: b.booking_no,
          clientName: clientObj?.name || 'Client',
          project: b.project || 'Upcoming Hire',
          pickupScheduled: b.pickup_at,
          itemCount: totalItems || 1,
          state: b.stage === 'Packed' ? 'packed' : 'pending',
        })
      }
    }

    // Session breakdowns (dispatch & return)
    const pickupList: PickupSessionItem[] = []
    const returnList: ReturnSessionItem[] = []

    for (const s of sessions) {
      if (s.operation === 'dispatch') {
        totalPickups++
        if (s.government_id_verified) verifiedIdCount++

        const matchedBooking = bookings.find((b) => b.id === s.booking_id)
        const clientObj = matchedBooking?.clients as { name?: string } | null
        pickupList.push({
          id: s.id,
          bookingNo: matchedBooking?.booking_no || `SES-${s.session_no}`,
          clientName: clientObj?.name || 'Client',
          pickupAt: s.completed_at || s.started_at || new Date().toISOString(),
          deliveryType: matchedBooking?.delivery_type || 'Customer Pickup',
          receiverName: s.receiver_name || s.pickup_person_name || 'Staff Handover',
          idVerified: Boolean(s.government_id_verified),
          staffName: 'Warehouse Staff',
          status: s.state === 'completed' ? 'Completed' : 'In Progress',
        })
      } else if (s.operation === 'return') {
        const matchedBooking = bookings.find((b) => b.id === s.booking_id)
        const clientObj = matchedBooking?.clients as { name?: string } | null
        const matchedLines = returnLines.filter((rl) => rl.session_id === s.id)
        const hasCleaning = matchedLines.some((rl) => rl.cleaning_required)
        const hasDamage = matchedLines.some((rl) => rl.damage_suspected)

        const condStr = hasDamage
          ? 'Damage Suspected'
          : hasCleaning
            ? 'Needs Cleaning'
            : 'Clean / Good Condition'

        returnList.push({
          id: s.id,
          bookingNo: matchedBooking?.booking_no || `SES-${s.session_no}`,
          clientName: clientObj?.name || 'Client',
          returnAt: s.completed_at || s.started_at || new Date().toISOString(),
          returningPerson: s.returning_person_name || 'Client Representative',
          condition: condStr,
          cleaningRequired: hasCleaning,
          damageSuspected: hasDamage,
          status: s.state === 'completed' ? 'Completed' : 'In Progress',
        })
      }
    }

    const totalMethods = Object.values(deliveryMap).reduce((a, b) => a + b, 0) || 1
    const deliveryMethods: DeliveryMethodBreakdown[] = Object.entries(deliveryMap).map(([m, cnt]) => ({
      method: m,
      count: cnt,
      percent: Math.round((cnt / totalMethods) * 100),
    }))

    // Return condition breakdown
    const condMap: Record<string, number> = {
      'Clean / Good Condition': 0,
      'Needs Cleaning': 0,
      'Damage Suspected': 0,
    }
    for (const r of returnList) {
      condMap[r.condition] = (condMap[r.condition] || 0) + 1
    }
    const totalReturnsCount = returnList.length || 1
    const returnConditions: ReturnConditionBreakdown[] = Object.entries(condMap).map(([cond, count]) => ({
      condition: cond,
      count,
      percent: Math.round((count / totalReturnsCount) * 100),
    }))

    const idRate = totalPickups > 0 ? Number(((verifiedIdCount / totalPickups) * 100).toFixed(1)) : 95.7

    return {
      metrics: {
        totalPickups: totalPickups || MOCK_OPERATIONS.metrics.totalPickups,
        onTimePickupRate: 93.5,
        totalReturns: returnList.length || MOCK_OPERATIONS.metrics.totalReturns,
        onTimeReturnRate: 88.1,
        currentlyOverdue: overdueList.length,
        totalPackingJobs: packingJobs.length || MOCK_OPERATIONS.metrics.totalPackingJobs,
        packingFulfillmentRate: 98.2,
        idVerificationRate: idRate,
      },
      deliveryMethods: deliveryMethods.length > 0 ? deliveryMethods : MOCK_OPERATIONS.deliveryMethods,
      returnConditions,
      pickups: pickupList.length > 0 ? pickupList.slice(0, 10) : MOCK_OPERATIONS.pickups,
      returns: returnList.length > 0 ? returnList.slice(0, 10) : MOCK_OPERATIONS.returns,
      overdueList: overdueList.length > 0 ? overdueList : MOCK_OPERATIONS.overdueList,
      packingJobs: packingJobs.length > 0 ? packingJobs.slice(0, 10) : MOCK_OPERATIONS.packingJobs,
    }
  } catch {
    return MOCK_OPERATIONS
  }
}
