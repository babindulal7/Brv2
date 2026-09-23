import { supabase } from '../supabase'
import { rupees } from '../money'
import type { ListFilters } from './listQuery'
import type { ListQueryResult } from './useList'
import {
  CREW_DATA,
  CREW_ROSTER,
  OPEN_ROLE_REQUESTS,
  FEE_PER_CREW_DAY_PAISA,
  CREW_EXPENSES_THIS_MONTH_PAISA,
  ROSTER_CHIPS,
  detectConflicts,
  conflictedAssignmentIds,
  detectTravelWarnings,
  rosterSummary,
  rosterChipCounts,
  matchesRosterChip,
  payoutLedger,
  crewDaysBooked,
  fillRate,
  searchRoster,
  type CrewRole,
  type AssignmentStatus,
  type PayoutStatus,
  type RosterState,
  type CrewAssignment,
  type CrewMember,
  type OpenRoleRequest,
  type RosterChip,
} from '../../data/crew'
import { crewGlance, crewDetailGroups } from '../../data/crewIntel'

export {
  CREW_DATA,
  CREW_ROSTER,
  OPEN_ROLE_REQUESTS,
  FEE_PER_CREW_DAY_PAISA,
  CREW_EXPENSES_THIS_MONTH_PAISA,
  ROSTER_CHIPS,
  detectConflicts,
  conflictedAssignmentIds,
  detectTravelWarnings,
  rosterSummary,
  rosterChipCounts,
  matchesRosterChip,
  payoutLedger,
  crewDaysBooked,
  fillRate,
  crewGlance,
  crewDetailGroups,
  searchRoster,
}

export type {
  CrewRole,
  AssignmentStatus,
  PayoutStatus,
  RosterState,
  CrewAssignment,
  CrewMember,
  OpenRoleRequest,
  RosterChip,
}

interface CrewBookingDbRow {
  id: string
  crew_booking_no: string
  production_id: string | null
  booking_id: string | null
  crew_member_id: string | null
  position: string
  day_rate: number | null
  days: number
  start_date: string
  end_date: string
  location: string | null
  state: string
  payout_state: string
  cancelled_at: string | null
  created_at: string
}

interface CrewMemberDbRow {
  id: string
  full_name: string
  position: string
  phone: string | null
  engagement_type: string
  day_rate: number | null
  deactivated_at: string | null
}

export async function listCrewAssignments(_filters?: ListFilters): Promise<ListQueryResult<CrewAssignment>> {
  try {
    const { data: bookingRows, error: bookingErr } = await supabase
      .from('crew_bookings_v')
      .select('id, crew_booking_no, production_id, booking_id, crew_member_id, position, day_rate, days, start_date, end_date, location, state, payout_state, cancelled_at, created_at')
      .order('start_date', { ascending: false })

    if (bookingErr || !bookingRows || bookingRows.length === 0) {
      return {
        rows: [...CREW_DATA],
        total: CREW_DATA.length,
      }
    }

    const { data: memberRows } = await supabase
      .from('crew_members_v')
      .select('id, full_name, position, phone, engagement_type, day_rate, deactivated_at')

    const memberMap = new Map<string, CrewMemberDbRow>()
    if (memberRows) {
      for (const m of memberRows as unknown as CrewMemberDbRow[]) {
        memberMap.set(m.id, m)
      }
    }

    const rows: CrewAssignment[] = (bookingRows as unknown as CrewBookingDbRow[]).map((b) => {
      const member = b.crew_member_id ? memberMap.get(b.crew_member_id) : undefined
      const dayRate = b.day_rate ?? member?.day_rate ?? 0
      const days = b.days || 1
      const isInternal = member?.engagement_type === 'Permanent' || member?.engagement_type === 'Retainer'

      let status: AssignmentStatus = 'Draft'
      if (b.state === 'Confirmed') status = 'Confirmed'
      else if (b.state === 'Tentative') status = 'Tentative'
      else if (b.state === 'Completed') status = 'Completed'

      let payoutStatus: PayoutStatus = 'Not due'
      if (b.payout_state === 'Due') payoutStatus = 'Due'
      else if (b.payout_state === 'Paid') payoutStatus = 'Paid'

      return {
        id: b.crew_booking_no,
        crewId: b.crew_member_id || 'CR-UNKNOWN',
        name: member?.full_name || 'Unassigned Crew',
        role: (b.position || member?.position || 'Grip') as CrewRole,
        phone: member?.phone || '+977 980-0000000',
        production: 'Production Job',
        linkedBooking: b.booking_id ? `B-${b.booking_id.slice(0, 4)}` : 'B-715',
        location: b.location || 'Kathmandu',
        startDateBs: '2083/04/10',
        endDateBs: '2083/04/14',
        startDateAd: b.start_date || '25 Jul 2026',
        endDateAd: b.end_date || '29 Jul 2026',
        days,
        dayRatePaisa: rupees(dayRate),
        totalCostPaisa: rupees(dayRate * days),
        status,
        cancelled: Boolean(b.cancelled_at),
        payoutStatus,
        isInternalStaff: isInternal,
      }
    })

    return {
      rows,
      total: rows.length,
    }
  } catch {
    return {
      rows: [...CREW_DATA],
      total: CREW_DATA.length,
    }
  }
}

export async function listCrewMembers(_filters?: ListFilters): Promise<ListQueryResult<CrewMember>> {
  try {
    const { data: memberRows, error } = await supabase
      .from('crew_members_v')
      .select('id, full_name, position, phone, day_rate, deactivated_at')

    if (error || !memberRows || memberRows.length === 0) {
      return {
        rows: [...CREW_ROSTER],
        total: CREW_ROSTER.length,
      }
    }

    const rows: CrewMember[] = (memberRows as unknown as CrewMemberDbRow[]).map((m) => ({
      id: m.id,
      name: m.full_name,
      role: (m.position || 'Grip') as CrewRole,
      phone: m.phone || '+977 980-0000000',
      state: m.deactivated_at ? 'Off Duty' : 'Available',
      dayRatePaisa: rupees(m.day_rate ?? 12000),
    }))

    return {
      rows,
      total: rows.length,
    }
  } catch {
    return {
      rows: [...CREW_ROSTER],
      total: CREW_ROSTER.length,
    }
  }
}
