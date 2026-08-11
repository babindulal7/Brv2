/**
 * Hover Intel System v2.1 (Tier 2) — the Crew card.
 *
 * `CrewBooking.tsx` lists one row per *assignment*, not per crew member — the
 * same person can appear on several rows across productions. These builders
 * are person-level: the caller groups `CrewAssignment[]` by `name` before
 * calling either function, and every function here takes that whole group,
 * never a single assignment.
 *
 * Money — day rate, total cost, pending payout — is gated with
 * `canViewMoneyField(gctx, 'asset-finance')`, not `'booking'`. HIS v2.1 §4.1
 * excludes Coordinator from crew pay by name ("no crew pay, no supplier
 * margin"), so this card is stricter than the Booking/Invoice/Payment cards:
 * a Coordinator sees the name, role, schedule and contact — never a rupee.
 *
 * `availableFromAd`/`availableToAd` are optional fields (see the doc comment
 * on `CrewAssignment` in `CrewBooking.tsx`) seeded on two real rows only —
 * every other person's Availability field reads "Not tracked" rather than a
 * guessed date. There is no availability-calendar engine in this build; the
 * two seeded values are the day *after* that person's own most recent
 * Confirmed/Completed assignment ends, not an invented future booking.
 */

import { createElement } from 'react'
import type { ReactNode } from 'react'
import type { CrewAssignment } from './crew'
import { formatMoney } from '../lib/money'
import type { Paisa } from '../lib/money'
import type { GateContext } from '../lib/fieldGating'
import { canViewMoneyField, canViewPII } from '../lib/fieldGating'
import type { IntelGlance, IntelGroup, IntelField, IntelBadge } from '../components/ui/IntelCard'
import { STATUS } from '../lib/status'
import type { StatusKey } from '../lib/status'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthLabel(month: number): string {
  return MONTH_NAMES[month] ?? String(month + 1)
}

/** Tone per assignment status — the same "worst first" idea `equipmentIntel.ts` uses for stock status, sized to Crew's four states (§11 — Cancelled is a flag, not a fifth status, so it isn't a key here). */
const ASSIGN_TONE: Record<CrewAssignment['status'], StatusKey> = {
  Draft: 'neutral',
  Tentative: 'progress',
  Confirmed: 'primary',
  Completed: 'in',
}

/** Worst/most-attention-needing first, mirrors `equipmentIntel.ts`'s `ALARM_ORDER`. */
const STATUS_ALARM_ORDER: CrewAssignment['status'][] = ['Tentative', 'Confirmed', 'Draft', 'Completed']

function dominantAssignmentStatus(
  assignments: CrewAssignment[],
  fallback: CrewAssignment['status'],
  conflictIds: Set<string>,
): CrewAssignment['status'] {
  // A conflict always reads as attention-needed regardless of its own status field.
  if (assignments.some((a) => conflictIds.has(a.id))) return 'Tentative'
  const present = new Set(assignments.map((a) => a.status))
  return STATUS_ALARM_ORDER.find((s) => present.has(s)) ?? fallback
}

/** "25 Jul 2026" -> a UTC Date at midnight, or null if the string doesn't parse. Never throws on a malformed seed value. */
function parseAdDate(s: string): Date | null {
  const [dayStr, monStr, yearStr] = s.trim().split(/\s+/)
  if (!dayStr || !monStr || !yearStr) return null
  const day = Number(dayStr)
  const month = MONTH_NAMES.indexOf(monStr)
  const year = Number(yearStr)
  if (!Number.isFinite(day) || month < 0 || !Number.isFinite(year)) return null
  return new Date(Date.UTC(year, month, day))
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/** The most recent month a person has an assignment *starting* in — the "current" month the mini-Gantt and job count are scoped to. */
function latestMonth(assignments: CrewAssignment[]): { year: number; month: number } | null {
  let best: Date | null = null
  for (const a of assignments) {
    const d = parseAdDate(a.startDateAd)
    if (d && (!best || d.getTime() > best.getTime())) best = d
  }
  return best ? { year: best.getUTCFullYear(), month: best.getUTCMonth() } : null
}

function mostRecentAssignment(assignments: CrewAssignment[], fallback: CrewAssignment): CrewAssignment {
  let best = fallback
  let bestDate = parseAdDate(fallback.startDateAd)
  for (const a of assignments) {
    const d = parseAdDate(a.startDateAd)
    if (d && (!bestDate || d.getTime() > bestDate.getTime())) {
      best = a
      bestDate = d
    }
  }
  return best
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

/** "Free from 30 Jul 2026" / "Free 30 Jul 2026 – 3 Aug 2026" / "Availability not tracked" — grounded in the seeded `availableFromAd`/`availableToAd`, never a guessed date. */
function availabilityLine(assignments: CrewAssignment[]): string {
  const withDate = assignments.find((a) => a.availableFromAd)
  if (!withDate?.availableFromAd) return 'Availability not tracked'
  return withDate.availableToAd
    ? `Free ${withDate.availableFromAd} – ${withDate.availableToAd}`
    : `Free from ${withDate.availableFromAd} (next booking not yet known)`
}

function jobsInMonth(assignments: CrewAssignment[], year: number, month: number): number {
  return assignments.filter((a) => {
    const d = parseAdDate(a.startDateAd)
    return d !== null && d.getUTCFullYear() === year && d.getUTCMonth() === month
  }).length
}

/**
 * A day-by-day strip for one month: a coloured box per day this person is on
 * an assignment (tone matches that assignment's status), a faint box for a
 * free day. Built with `createElement` rather than JSX so this stays a plain
 * `.ts` module.
 */
function monthGanttNode(assignments: CrewAssignment[], year: number, month: number): ReactNode {
  const total = daysInMonth(year, month)
  const boxes: ReactNode[] = []
  for (let day = 1; day <= total; day++) {
    const t = Date.UTC(year, month, day)
    const covering = assignments.find((a) => {
      if (a.cancelled) return false
      const s = parseAdDate(a.startDateAd)
      const e = parseAdDate(a.endDateAd)
      return s !== null && e !== null && t >= s.getTime() && t <= e.getTime()
    })
    const tone = covering ? ASSIGN_TONE[covering.status] : undefined
    boxes.push(
      createElement('span', {
        key: day,
        title: covering
          ? `${day} ${monthLabel(month)} — ${covering.production} (${covering.status})`
          : `${day} ${monthLabel(month)} — free`,
        style: {
          display: 'inline-block',
          width: 7,
          height: 7,
          borderRadius: 2,
          background: tone ? STATUS[tone].fg : 'var(--border)',
          opacity: tone ? 1 : 0.45,
        },
      }),
    )
  }
  return createElement(
    'div',
    { 'aria-hidden': true, style: { display: 'flex', flexWrap: 'wrap', gap: 2, maxWidth: 230 } },
    boxes,
  )
}

export function crewGlance(assignments: CrewAssignment[], gctx: GateContext, conflictIds: Set<string> = new Set()): IntelGlance {
  const first = assignments[0]
  if (!first) {
    return { avatarLabel: '—', title: 'Unknown crew member', lines: ['No assignment on file'] }
  }

  const roles = Array.from(new Set(assignments.map((a) => a.role)))
  const primaryRole = roles[0] ?? first.role
  const isInternalStaff = assignments.some((a) => a.isInternalStaff)
  const anyConflict = assignments.some((a) => conflictIds.has(a.id))
  const status = dominantAssignmentStatus(assignments, first.status, conflictIds)
  const recent = mostRecentAssignment(assignments, first)
  const monthInfo = latestMonth(assignments)
  const jobs = monthInfo ? jobsInMonth(assignments, monthInfo.year, monthInfo.month) : assignments.length

  const badges: IntelBadge[] = [
    { label: primaryRole },
    ...(isInternalStaff ? [{ label: 'Staff' }] : []),
    ...(anyConflict ? [{ label: 'Conflict', tone: 'progress' as StatusKey }] : []),
  ]

  const lines: string[] = [availabilityLine(assignments), `${jobs} job${jobs === 1 ? '' : 's'} this month`]
  // §4.1 — crew pay is 'asset-finance', excluded from Coordinator; this hint
  // line simply is not constructed for a role that can't see it.
  if (canViewMoneyField(gctx, 'asset-finance')) {
    lines.push(`${formatMoney(recent.dayRatePaisa)} / day`)
  }

  return {
    avatarLabel: initials(first.name),
    avatarTone: (ASSIGN_TONE[status] ?? 'neutral') as StatusKey,
    title: first.name,
    statusDot: (anyConflict ? 'danger' : (ASSIGN_TONE[status] ?? 'neutral')) as StatusKey,
    subtitle: recent.production,
    badges,
    lines,
    primaryAction: { label: 'Open booking', to: `/rentals/${recent.linkedBooking}` },
  }
}

export function crewDetailGroups(assignments: CrewAssignment[], gctx: GateContext): IntelGroup[] {
  const groups: IntelGroup[] = []
  const first = assignments[0]
  if (!first) return groups

  const roles = Array.from(new Set(assignments.map((a) => a.role)))
  const isInternalStaff = assignments.some((a) => a.isInternalStaff)

  groups.push({
    title: 'Crew',
    fields: [
      { label: 'Name', value: first.name },
      { label: 'Role', value: roles.join(', ') },
      { label: 'Type', value: isInternalStaff ? 'Internal staff' : 'Freelance / external' },
    ],
  })

  const monthInfo = latestMonth(assignments)
  const scheduleFields: IntelField[] = []
  if (monthInfo) {
    scheduleFields.push(
      { label: `${monthLabel(monthInfo.month)} ${monthInfo.year}`, value: monthGanttNode(assignments, monthInfo.year, monthInfo.month) },
      { label: 'Jobs this month', value: String(jobsInMonth(assignments, monthInfo.year, monthInfo.month)) },
    )
  }
  scheduleFields.push({ label: 'Availability', value: availabilityLine(assignments) })
  groups.push({ title: 'Schedule', fields: scheduleFields })

  groups.push({
    title: 'Assignments',
    fields: assignments.map(
      (a): IntelField => ({
        label: a.linkedBooking,
        value: `${a.production} — ${a.status} · ${a.startDateAd} – ${a.endDateAd} (${a.days} day${a.days === 1 ? '' : 's'})`,
        trigger: { label: 'Open', to: `/rentals/${a.linkedBooking}` },
      }),
    ),
  })

  // §4.2 — phone renders for staff roles; Warehouse/Technician never see it,
  // Driver only inside a delivery context (not applicable on this screen).
  if (canViewPII(gctx)) {
    groups.push({ title: 'Contact', fields: [{ label: 'Phone', value: first.phone }] })
  }

  // §4.1 — 'asset-finance', explicitly excluding Coordinator ("no crew pay").
  if (canViewMoneyField(gctx, 'asset-finance')) {
    const pendingPaisa = assignments
      .filter((a) => a.payoutStatus !== 'Paid')
      .reduce((sum, a) => sum + a.totalCostPaisa, 0) as Paisa

    groups.push({
      title: 'Pay',
      fields: [
        ...assignments.map(
          (a): IntelField => ({
            label: a.linkedBooking,
            value: `${formatMoney(a.dayRatePaisa)} / day · ${formatMoney(a.totalCostPaisa)} total`,
          }),
        ),
        { label: 'Payout accrual (pending + partial)', value: formatMoney(pendingPaisa) },
      ],
    })
  }

  return groups
}
