import type { BookingStatus, JobName } from '../lib/workflow'

/**
 * Operations Queues seed data.
 *
 * ⚠ **Spec-derived** — `04 Operations/README.md` (the canonical 12-stage
 * workflow) plus the workflow docs beside it. No render covers this screen.
 *
 * §README: "No page defines its own status names." Every queue here **is** a
 * Foundation stage, so the queue list and the workflow cannot drift apart.
 */

export interface Queue {
  /**
   * §1.5 — a queue is a **job**, not a status. The retired build keyed six
   * queues on stage, including a separate Cleaning workspace (absorbed into
   * Reset) and a "Prep Bay" that §5.1 deletes outright. Four verbs plus Cases,
   * matching the sidebar children exactly so the two cannot drift.
   */
  job: JobName | 'Cases'
  title: string
  /** What the operator actually does here. */
  action: string
  count: number
  /** Jobs past their expected handling time. */
  overdue: number
  icon: 'box' | 'checklist' | 'truck' | 'return_arrow' | 'eye' | 'sparkles'
}

export const QUEUES: Queue[] = [
  { job: 'Pack', title: 'Packing', action: 'Pack against the list', count: 8, overdue: 1, icon: 'box' },
  { job: 'Handover', title: 'Handover', action: 'Complete the handover', count: 5, overdue: 2, icon: 'truck' },
  { job: 'Return', title: 'Return & Inspection', action: 'Receive, count and inspect', count: 11, overdue: 4, icon: 'return_arrow' },
  { job: 'Reset', title: 'Reset', action: 'Clean, reset, re-shelf', count: 9, overdue: 0, icon: 'sparkles' },
  { job: 'Cases', title: 'Cases', action: 'Resolve missing and damage', count: 3, overdue: 1, icon: 'eye' },
]

export interface Job {
  id: string
  /** Which of the four verbs this job is (§1.5). */
  job: JobName
  /** The booking's status while that job runs — derived, never typed twice. */
  status: BookingStatus
  booking: string
  client: string
  kit: string
  items: string
  assignee: string
  due: string
  overdue?: boolean
}

export const JOBS: Job[] = [
  { id: 'J-1041', job: 'Pack', status: 'Booked', booking: 'BK-2026-0715', client: 'ABC Films', kit: 'RED Komodo X Package', items: '18 items', assignee: 'Ramesh', due: '09:00 AM' },
  { id: 'J-1042', job: 'Pack', status: 'Booked', booking: 'BK-2026-0717', client: 'Mountain Stories', kit: 'Ronin 4D 6K Package', items: '12 items', assignee: 'Sanu', due: '12:00 PM' },
  { id: 'J-1039', job: 'Handover', status: 'Packed', booking: 'BK-2026-0716', client: 'Creative Studio', kit: 'Sony FX6 Kit', items: '16 items', assignee: 'Hari', due: '10:30 AM', overdue: true },
  { id: 'J-1035', job: 'Return', status: 'On Rent', booking: 'BK-2026-0709', client: 'Mountain Stories', kit: 'Sony FX6 Package', items: '12 items', assignee: 'Hari', due: '06:00 AM', overdue: true },
  { id: 'J-1036', job: 'Return', status: 'On Rent', booking: 'BK-2026-0710', client: 'Vision Production', kit: 'NISI Athena Set', items: '10 items', assignee: 'Sanu', due: '01:00 PM' },
  { id: 'J-1031', job: 'Return', status: 'Returned', booking: 'BK-2026-0711', client: 'Inside Out Films', kit: 'Aputure 600D Pro Kit', items: '14 items', assignee: 'Ramesh', due: '02:30 PM' },
  { id: 'J-1028', job: 'Reset', status: 'Returned', booking: 'BK-2026-0712', client: 'White Peak Docs', kit: 'Glacier Lines Package', items: '18 items', assignee: 'Sanu', due: '04:00 PM' },
]

export const CREW_LOAD = [
  { name: 'Ramesh Dulal', role: 'Warehouse', open: 4, capacity: 6 },
  { name: 'Hari Shrestha', role: 'Warehouse', open: 5, capacity: 6 },
  { name: 'Sanu Maharjan', role: 'Warehouse', open: 3, capacity: 6 },
  { name: 'Bikash Thapa', role: 'Driver', open: 2, capacity: 4 },
]

/**
 * Warehouse sees no money — Foundation, and one of the rules `CLAUDE.md` calls
 * most easily broken. This screen is warehouse-facing, so it carries **no**
 * monetary column anywhere. Enforced by RLS in production, not by the UI, but
 * the UI must not ask for it either.
 */
export const NO_MONEY_NOTE = 'Warehouse view — no monetary values are shown or requested on this screen.'
