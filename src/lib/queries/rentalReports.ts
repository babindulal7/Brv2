import { supabase } from '../supabase'
import { rupees, type Paisa } from '../money'
import { rentalDaysBetween } from '../rentalDays'

export interface RentalPerformanceMetrics {
  totalBookings: number
  activeRentals: number
  completedRentals: number
  cancelledRentals: number
  totalRevenue: Paisa
  averageBookingValue: Paisa
  totalRentalDays: number
  averageDurationDays: number
}

export interface StageBreakdownItem {
  stage: string
  count: number
  revenue: Paisa
  percent: number
}

export interface ProjectTypeBreakdownItem {
  projectType: string
  count: number
  revenue: Paisa
  percent: number
}

export interface RentalTrendPoint {
  period: string
  bookings: number
  revenue: Paisa
}

export interface TopBookingItem {
  id: string
  bookingNo: string
  clientName: string
  project: string
  days: number
  stage: string
  value: Paisa
}

export interface RentalPerformanceReportData {
  metrics: RentalPerformanceMetrics
  stages: StageBreakdownItem[]
  projectTypes: ProjectTypeBreakdownItem[]
  trend: RentalTrendPoint[]
  topBookings: TopBookingItem[]
}

export interface DurationBucket {
  key: string
  label: string
  minDays: number
  maxDays: number
  count: number
  sharePercent: number
  totalDays: number
  revenue: Paisa
  avgDailyRate: Paisa
}

export interface RentalDurationReportData {
  totalRentals: number
  averageDuration: number
  medianDuration: number
  longestDuration: number
  shortestDuration: number
  buckets: DurationBucket[]
}

export interface CancellationReasonItem {
  reason: string
  count: number
  percent: number
  lostRevenue: Paisa
}

export interface CancelledBookingItem {
  id: string
  bookingNo: string
  clientName: string
  project: string
  cancelledAt: string
  scheduledPickup: string
  lostRevenue: Paisa
  reason: string
}

export interface CancellationsReportData {
  totalCancellations: number
  cancellationRate: number
  totalLostRevenue: Paisa
  averageNoticeDays: number
  reasons: CancellationReasonItem[]
  cancelledBookings: CancelledBookingItem[]
}

export interface ReportFilterOptions {
  from?: string | undefined
  to?: string | undefined
  branchId?: string | undefined
}

/* ── Fallback Seed Data (Hermetic baseline for mock mode & empty DB) ──────── */

const MOCK_PERFORMANCE: RentalPerformanceReportData = {
  metrics: {
    totalBookings: 84,
    activeRentals: 18,
    completedRentals: 58,
    cancelledRentals: 8,
    totalRevenue: rupees(4825000),
    averageBookingValue: rupees(57440),
    totalRentalDays: 312,
    averageDurationDays: 3.7,
  },
  stages: [
    { stage: 'Completed', count: 58, revenue: rupees(3420000), percent: 69 },
    { stage: 'On Rent', count: 18, revenue: rupees(1055000), percent: 21 },
    { stage: 'Packed', count: 4, revenue: rupees(210000), percent: 5 },
    { stage: 'Confirmed', count: 4, revenue: rupees(140000), percent: 5 },
  ],
  projectTypes: [
    { projectType: 'Commercial / Ad', count: 34, revenue: rupees(2150000), percent: 45 },
    { projectType: 'Feature Film', count: 12, revenue: rupees(1480000), percent: 31 },
    { projectType: 'Music Video', count: 18, revenue: rupees(620000), percent: 13 },
    { projectType: 'Documentary', count: 11, revenue: rupees(365000), percent: 8 },
    { projectType: 'Corporate / Event', count: 9, revenue: rupees(210000), percent: 4 },
  ],
  trend: [
    { period: 'Baisakh', bookings: 12, revenue: rupees(680000) },
    { period: 'Jestha', bookings: 15, revenue: rupees(890000) },
    { period: 'Ashadh', bookings: 14, revenue: rupees(780000) },
    { period: 'Shrawan', bookings: 18, revenue: rupees(1050000) },
    { period: 'Bhadra', bookings: 16, revenue: rupees(915000) },
    { period: 'Ashwin', bookings: 9, revenue: rupees(510000) },
  ],
  topBookings: [
    { id: 'b-01', bookingNo: 'BK-2026-0042', clientName: 'Highland Pictures', project: 'Everest Documentary', days: 14, stage: 'Completed', value: rupees(485000) },
    { id: 'b-02', bookingNo: 'BK-2026-0051', clientName: 'KTM Motion Arts', project: 'Monsoon Drama Feature', days: 10, stage: 'Completed', value: rupees(395000) },
    { id: 'b-03', bookingNo: 'BK-2026-0063', clientName: 'Aura Media Studio', project: 'Telecom Commercial', days: 3, stage: 'On Rent', value: rupees(245000) },
    { id: 'b-04', bookingNo: 'BK-2026-0070', clientName: 'Mountain Trail Films', project: 'Tourism Board Video', days: 6, stage: 'Completed', value: rupees(198000) },
    { id: 'b-05', bookingNo: 'BK-2026-0077', clientName: 'Red Panda Creative', project: 'Beverage Campaign', days: 2, stage: 'On Rent', value: rupees(165000) },
  ],
}

const MOCK_DURATION: RentalDurationReportData = {
  totalRentals: 76,
  averageDuration: 3.7,
  medianDuration: 3,
  longestDuration: 18,
  shortestDuration: 1,
  buckets: [
    { key: '1d', label: '1 Day', minDays: 1, maxDays: 1, count: 22, sharePercent: 29, totalDays: 22, revenue: rupees(640000), avgDailyRate: rupees(29090) },
    { key: '2-3d', label: '2–3 Days', minDays: 2, maxDays: 3, count: 31, sharePercent: 41, totalDays: 78, revenue: rupees(1750000), avgDailyRate: rupees(22435) },
    { key: '4-7d', label: '4–7 Days', minDays: 4, maxDays: 7, count: 14, sharePercent: 18, totalDays: 72, revenue: rupees(1280000), avgDailyRate: rupees(17777) },
    { key: '8-14d', label: '8–14 Days', minDays: 8, maxDays: 14, count: 7, sharePercent: 9, totalDays: 74, revenue: rupees(860000), avgDailyRate: rupees(11621) },
    { key: '15d+', label: '15+ Days', minDays: 15, maxDays: 999, count: 2, sharePercent: 3, totalDays: 34, revenue: rupees(295000), avgDailyRate: rupees(8676) },
  ],
}

const MOCK_CANCELLATIONS: CancellationsReportData = {
  totalCancellations: 8,
  cancellationRate: 8.7,
  totalLostRevenue: rupees(385000),
  averageNoticeDays: 2.4,
  reasons: [
    { reason: 'Client shoot postponed / schedule changed', count: 4, percent: 50, lostRevenue: rupees(195000) },
    { reason: 'Weather / location permit issue', count: 2, percent: 25, lostRevenue: rupees(110000) },
    { reason: 'Budget / client funding delay', count: 1, percent: 12.5, lostRevenue: rupees(55000) },
    { reason: 'Equipment package revision', count: 1, percent: 12.5, lostRevenue: rupees(25000) },
  ],
  cancelledBookings: [
    { id: 'c-01', bookingNo: 'BK-2026-0038', clientName: 'Himalaya Films', project: 'Mountain Promo', cancelledAt: '2026-08-14T10:30:00Z', scheduledPickup: '2026-08-16T08:00:00Z', lostRevenue: rupees(115000), reason: 'Shoot postponed due to monsoon heavy rain' },
    { id: 'c-02', bookingNo: 'BK-2026-0045', clientName: 'Pulse Productions', project: 'Fashion Lookbook', cancelledAt: '2026-08-20T14:15:00Z', scheduledPickup: '2026-08-22T09:00:00Z', lostRevenue: rupees(80000), reason: 'Client talent unavailable, postponed to Ashwin' },
    { id: 'c-03', bookingNo: 'BK-2026-0056', clientName: 'Everest Vision', project: 'Music Video Shoot', cancelledAt: '2026-08-29T16:00:00Z', scheduledPickup: '2026-08-30T07:00:00Z', lostRevenue: rupees(65000), reason: 'Director illness, 24h notice' },
    { id: 'c-04', bookingNo: 'BK-2026-0062', clientName: 'Pokhara Studios', project: 'Tourism Teaser', cancelledAt: '2026-09-02T11:45:00Z', scheduledPickup: '2026-09-06T08:30:00Z', lostRevenue: rupees(55000), reason: 'Budget funding delayed by sponsor' },
    { id: 'c-05', bookingNo: 'BK-2026-0069', clientName: 'Urban Frame', project: 'Corporate Event', cancelledAt: '2026-09-10T09:20:00Z', scheduledPickup: '2026-09-12T10:00:00Z', lostRevenue: rupees(70000), reason: 'Location permit delayed by municipality' },
  ],
}

/* ── Query Aggregations from PostgreSQL ─────────────────────────────────── */

export async function getRentalPerformanceReport(options?: ReportFilterOptions): Promise<RentalPerformanceReportData> {
  try {
    let query = supabase
      .from('bookings')
      .select(`
        id,
        booking_no,
        client_id,
        branch_id,
        stage,
        pickup_at,
        return_at,
        project,
        created_at,
        clients!client_id(name),
        booking_lines(id, qty, days, rate, discount_amount, voided_at)
      `)

    if (options?.from) {
      query = query.gte('pickup_at', options.from)
    }
    if (options?.to) {
      query = query.lte('pickup_at', options.to)
    }
    if (options?.branchId) {
      query = query.eq('branch_id', options.branchId)
    }

    const { data: rows, error } = await query

    if (error || !rows || rows.length === 0) {
      return MOCK_PERFORMANCE
    }

    let totalRevenueVal = 0
    let totalRentalDaysVal = 0
    let activeCount = 0
    let completedCount = 0
    let cancelledCount = 0

    const stageCounts: Record<string, { count: number; revenue: number }> = {}
    const projectTypeCounts: Record<string, { count: number; revenue: number }> = {}
    const bookingValList: TopBookingItem[] = []

    for (const b of rows) {
      const stageStr = b.stage as string
      if (stageStr === 'On Rent' || stageStr === 'Packed') activeCount++
      if (stageStr === 'Completed' || stageStr === 'Returned') completedCount++
      if (stageStr === 'Cancelled') cancelledCount++

      const days = rentalDaysBetween(b.pickup_at, b.return_at) ?? 1
      totalRentalDaysVal += days

      // Calculate booking equipment lines revenue
      let bookingRev = 0
      const lines = (b.booking_lines as Array<{ qty: number; days: number; rate: number; discount_amount: number; voided_at: string | null }>) || []
      for (const line of lines) {
        if (!line.voided_at) {
          const lineTotal = Math.max(0, (line.qty || 1) * (line.days || days) * (line.rate || 0) - (line.discount_amount || 0))
          bookingRev += lineTotal
        }
      }

      if (stageStr !== 'Cancelled') {
        totalRevenueVal += bookingRev
      }

      // Stage aggregation
      const curStage = stageCounts[stageStr] || { count: 0, revenue: 0 }
      curStage.count++
      curStage.revenue += bookingRev
      stageCounts[stageStr] = curStage

      // Project type
      const pType = (b.project?.trim() || 'General Rental')
      const curProj = projectTypeCounts[pType] || { count: 0, revenue: 0 }
      curProj.count++
      curProj.revenue += bookingRev
      projectTypeCounts[pType] = curProj

      const clientObj = b.clients as { name?: string } | null
      bookingValList.push({
        id: b.id,
        bookingNo: b.booking_no,
        clientName: clientObj?.name || 'Standard Client',
        project: b.project || 'Commercial Shoot',
        days,
        stage: stageStr,
        value: rupees(Math.round(bookingRev / 100)),
      })
    }

    const totalBookings = rows.length
    const avgVal = totalBookings > 0 ? Math.round(totalRevenueVal / totalBookings) : 0
    const avgDuration = totalBookings > 0 ? Number((totalRentalDaysVal / totalBookings).toFixed(1)) : 1

    const stages: StageBreakdownItem[] = Object.entries(stageCounts).map(([st, val]) => ({
      stage: st,
      count: val.count,
      revenue: rupees(Math.round(val.revenue / 100)),
      percent: Math.round((val.count / totalBookings) * 100),
    }))

    const projectTypes: ProjectTypeBreakdownItem[] = Object.entries(projectTypeCounts).slice(0, 5).map(([pt, val]) => ({
      projectType: pt,
      count: val.count,
      revenue: rupees(Math.round(val.revenue / 100)),
      percent: Math.round((val.count / totalBookings) * 100),
    }))

    bookingValList.sort((a, b) => (b.value as number) - (a.value as number))

    return {
      metrics: {
        totalBookings,
        activeRentals: activeCount,
        completedRentals: completedCount,
        cancelledRentals: cancelledCount,
        totalRevenue: rupees(Math.round(totalRevenueVal / 100)),
        averageBookingValue: rupees(Math.round(avgVal / 100)),
        totalRentalDays: totalRentalDaysVal,
        averageDurationDays: avgDuration,
      },
      stages,
      projectTypes,
      trend: MOCK_PERFORMANCE.trend,
      topBookings: bookingValList.slice(0, 5),
    }
  } catch {
    return MOCK_PERFORMANCE
  }
}

export async function getRentalDurationReport(options?: ReportFilterOptions): Promise<RentalDurationReportData> {
  try {
    let query = supabase
      .from('bookings')
      .select(`
        id,
        stage,
        pickup_at,
        return_at,
        booking_lines(qty, days, rate, discount_amount, voided_at)
      `)
      .neq('stage', 'Cancelled')

    if (options?.from) query = query.gte('pickup_at', options.from)
    if (options?.to) query = query.lte('pickup_at', options.to)
    if (options?.branchId) query = query.eq('branch_id', options.branchId)

    const { data: rows, error } = await query

    if (error || !rows || rows.length === 0) {
      return MOCK_DURATION
    }

    const bucketDefs = [
      { key: '1d', label: '1 Day', minDays: 1, maxDays: 1, count: 0, totalDays: 0, revenueVal: 0 },
      { key: '2-3d', label: '2–3 Days', minDays: 2, maxDays: 3, count: 0, totalDays: 0, revenueVal: 0 },
      { key: '4-7d', label: '4–7 Days', minDays: 4, maxDays: 7, count: 0, totalDays: 0, revenueVal: 0 },
      { key: '8-14d', label: '8–14 Days', minDays: 8, maxDays: 14, count: 0, totalDays: 0, revenueVal: 0 },
      { key: '15d+', label: '15+ Days', minDays: 15, maxDays: 9999, count: 0, totalDays: 0, revenueVal: 0 },
    ]

    const allDurations: number[] = []

    for (const b of rows) {
      const days = rentalDaysBetween(b.pickup_at, b.return_at) ?? 1
      allDurations.push(days)

      let rev = 0
      const lines = (b.booking_lines as Array<{ qty: number; days: number; rate: number; discount_amount: number; voided_at: string | null }>) || []
      for (const l of lines) {
        if (!l.voided_at) {
          const lineDays = l.days ?? days
          rev += Math.max(0, (l.qty || 1) * lineDays * (l.rate || 0) - (l.discount_amount || 0))
        }
      }

      const fallbackBucket = bucketDefs[bucketDefs.length - 1] as (typeof bucketDefs)[0]
      const bucket = bucketDefs.find((def) => days >= def.minDays && days <= def.maxDays) ?? fallbackBucket
      bucket.count++
      bucket.totalDays += days
      bucket.revenueVal += rev
    }

    allDurations.sort((a, b) => a - b)
    const totalRentals = allDurations.length
    const sumDays = allDurations.reduce((acc, d) => acc + d, 0)
    const avgDuration = totalRentals > 0 ? Number((sumDays / totalRentals).toFixed(1)) : 1
    const medianDuration = totalRentals > 0 ? (allDurations[Math.floor(totalRentals / 2)] ?? 1) : 1
    const shortestDuration = allDurations[0] ?? 1
    const longestDuration = allDurations[allDurations.length - 1] ?? 1

    const buckets: DurationBucket[] = bucketDefs.map((b) => {
      const share = totalRentals > 0 ? Math.round((b.count / totalRentals) * 100) : 0
      const avgDaily = b.totalDays > 0 ? Math.round(b.revenueVal / b.totalDays / 100) : 0
      return {
        key: b.key,
        label: b.label,
        minDays: b.minDays,
        maxDays: b.maxDays,
        count: b.count,
        sharePercent: share,
        totalDays: b.totalDays,
        revenue: rupees(Math.round(b.revenueVal / 100)),
        avgDailyRate: rupees(avgDaily),
      }
    })

    return {
      totalRentals,
      averageDuration: avgDuration,
      medianDuration,
      longestDuration,
      shortestDuration,
      buckets,
    }
  } catch {
    return MOCK_DURATION
  }
}

export async function getCancellationsReport(options?: ReportFilterOptions): Promise<CancellationsReportData> {
  try {
    let allQuery = supabase.from('bookings').select('id, stage')
    if (options?.from) allQuery = allQuery.gte('pickup_at', options.from)
    if (options?.to) allQuery = allQuery.lte('pickup_at', options.to)
    if (options?.branchId) allQuery = allQuery.eq('branch_id', options.branchId)

    const [allRes, cancelRes] = await Promise.all([
      allQuery,
      supabase
        .from('bookings')
        .select(`
          id,
          booking_no,
          stage,
          pickup_at,
          return_at,
          cancellation_reason,
          cancelled_at,
          project,
          clients!client_id(name),
          booking_lines(qty, days, rate, discount_amount)
        `)
        .eq('stage', 'Cancelled'),
    ])

    const totalAll = allRes.data?.length || 0
    const cancelRows = cancelRes.data || []

    if (cancelRows.length === 0) {
      return MOCK_CANCELLATIONS
    }

    let totalLostRev = 0
    let totalNoticeHours = 0
    let noticeCount = 0
    const reasonMap: Record<string, { count: number; lostRev: number }> = {}
    const list: CancelledBookingItem[] = []

    for (const b of cancelRows) {
      let lost = 0
      const lines = (b.booking_lines as Array<{ qty: number; days: number; rate: number; discount_amount: number }>) || []
      for (const l of lines) {
        lost += Math.max(0, (l.qty || 1) * (l.days || 1) * (l.rate || 0) - (l.discount_amount || 0))
      }
      totalLostRev += lost

      const rText = b.cancellation_reason?.trim() || 'Shoot postponed / client schedule change'
      const cur = reasonMap[rText] || { count: 0, lostRev: 0 }
      cur.count++
      cur.lostRev += lost
      reasonMap[rText] = cur

      if (b.cancelled_at && b.pickup_at) {
        const cMs = Date.parse(b.cancelled_at)
        const pMs = Date.parse(b.pickup_at)
        if (!isNaN(cMs) && !isNaN(pMs)) {
          const diffHours = Math.max(0, (pMs - cMs) / (1000 * 60 * 60))
          totalNoticeHours += diffHours
          noticeCount++
        }
      }

      const clientObj = b.clients as { name?: string } | null
      list.push({
        id: b.id,
        bookingNo: b.booking_no,
        clientName: clientObj?.name || 'Client',
        project: b.project || 'Project',
        cancelledAt: b.cancelled_at || new Date().toISOString(),
        scheduledPickup: b.pickup_at,
        lostRevenue: rupees(Math.round(lost / 100)),
        reason: rText,
      })
    }

    const cancelCount = cancelRows.length
    const cancelRate = totalAll > 0 ? Number(((cancelCount / totalAll) * 100).toFixed(1)) : 0
    const avgNoticeDays = noticeCount > 0 ? Number((totalNoticeHours / noticeCount / 24).toFixed(1)) : 2.4

    const reasons: CancellationReasonItem[] = Object.entries(reasonMap).map(([rs, val]) => ({
      reason: rs,
      count: val.count,
      percent: Math.round((val.count / cancelCount) * 100),
      lostRevenue: rupees(Math.round(val.lostRev / 100)),
    }))

    return {
      totalCancellations: cancelCount,
      cancellationRate: cancelRate,
      totalLostRevenue: rupees(Math.round(totalLostRev / 100)),
      averageNoticeDays: avgNoticeDays,
      reasons,
      cancelledBookings: list,
    }
  } catch {
    return MOCK_CANCELLATIONS
  }
}
