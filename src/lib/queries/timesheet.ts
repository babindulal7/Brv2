/**
 * Staff Timesheet — domain model and weekly view computations.
 *
 * Ported from the standalone's tsData / tsRows / tsStats blocks.
 * Weekly roster with daily hours, pay calculations at hourly rate,
 * and KPI stats (total hours, payroll, logged staff, overtime flags).
 */

// ── Types ────────────────────────────────────────────────────────────

export type TimesheetWeek = 'This Week' | 'Last Week'

export interface TimesheetEntry {
  name: string
  role: string
  rate: number     // daily rate in NPR
  hrs: number[]    // 7 elements: Mon through Sun
}

export interface TimesheetRow {
  name: string
  role: string
  rate: number
  hrs: number[]    // adjusted for week
  totalHrs: number
  pay: number
}

export interface TimesheetStats {
  totalHours: number
  totalPayroll: number
  staffLogged: number
  totalStaff: number
  overtimeFlags: number
}

// ── Constants ────────────────────────────────────────────────────────

export const TIMESHEET_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export const TIMESHEET_DATA: TimesheetEntry[] = [
  { name: 'Bikash Tamang', role: 'Camera Assistant', rate: 3500, hrs: [8, 8, 0, 9, 8, 6, 0] },
  { name: 'Suman Rai', role: 'Gaffer', rate: 4000, hrs: [8, 8, 8, 8, 0, 8, 0] },
  { name: 'Hari KC', role: 'Driver', rate: 2500, hrs: [6, 6, 6, 6, 6, 4, 0] },
  { name: 'Mingma Sherpa', role: 'Lightman', rate: 2800, hrs: [0, 8, 8, 0, 8, 8, 0] },
  { name: 'Rajan Thapa', role: 'Focus Puller', rate: 3200, hrs: [0, 0, 8, 8, 8, 0, 0] },
]

// ── Computed rows ────────────────────────────────────────────────────

export function getTimesheetRows(week: TimesheetWeek): TimesheetRow[] {
  const scale = week === 'Last Week' ? 0.9 : 1

  return TIMESHEET_DATA.map((entry) => {
    const hrs = entry.hrs.map((h) => Math.round(h * scale))
    const totalHrs = hrs.reduce((a, b) => a + b, 0)
    const pay = Math.round(totalHrs * (entry.rate / 8))

    return {
      name: entry.name,
      role: entry.role,
      rate: entry.rate,
      hrs,
      totalHrs,
      pay,
    }
  })
}

// ── KPI stats ────────────────────────────────────────────────────────

export function getTimesheetStats(rows: TimesheetRow[]): TimesheetStats {
  let totalHours = 0
  let totalPayroll = 0
  let staffLogged = 0
  let overtimeFlags = 0

  for (const row of rows) {
    totalHours += row.totalHrs
    totalPayroll += row.pay
    if (row.totalHrs > 0) staffLogged++
    if (row.hrs.some((h) => h > 8)) overtimeFlags++
  }

  return {
    totalHours,
    totalPayroll,
    staffLogged,
    totalStaff: rows.length,
    overtimeFlags,
  }
}

// ── CSV export helper ────────────────────────────────────────────────

export function exportTimesheetCsv(rows: TimesheetRow[], week: TimesheetWeek): void {
  const header = ['Name', 'Role', 'Rate/hr (Rs)', ...TIMESHEET_DAYS, 'Total Hours', 'Total Pay (Rs)']
  const csvRows = rows.map((r) => [
    r.name,
    r.role,
    String(r.rate),
    ...r.hrs.map(String),
    String(r.totalHrs),
    String(r.pay),
  ])

  const csv = [header, ...csvRows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const filename = `payroll-${week === 'Last Week' ? 'lastweek' : 'thisweek'}.csv`

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
