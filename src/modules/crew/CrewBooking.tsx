import { Fragment, useMemo, useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import type { CSSProperties, ReactNode } from 'react'
import { Card, Button, PageHeader, Rail, SummaryRows, cardStyle, KpiStrip } from '../../components/ui/Page'
import { PageShell } from '../../components/ui/PageShell'
import { DataTableShell } from '../../components/ui/DataTable'
import { thStyle } from '../../components/ui/TableHeaderCell'
import { SearchInput } from '../../components/ui/SearchInput'
import { FilterButton, FilterDrawer } from '../../components/ui/FilterDrawer'
import { Select } from '../../components/ui/Select'
import { EmptyState } from '../../components/ui/StateViews'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { formatMoney } from '../../lib/money'
import { useAuth } from '../../lib/auth'
import { gateContext, canViewMoneyField, canViewPII } from '../../lib/fieldGating'
import { IntelCard } from '../../components/ui/IntelCard'
import type { IntelGlance, IntelGroup } from '../../components/ui/IntelCard'
import { STATUS, STATUS_ICON } from '../../lib/status'
import { Badge } from '../../components/ui/Badge'
import type { StatusKey } from '../../lib/status'
import { useViewport } from '../../lib/device'
import { getBusinessToday } from '../../lib/bs'
import { canAssignPricedCrew } from '../../lib/crewAssignment'
import { BookCrewFlow } from './BookCrewFlow'
import './crew.css'
import {
  listCrewAssignments,
  listCrewMembers,
  CREW_DATA,
  CREW_ROSTER,
  OPEN_ROLE_REQUESTS,
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
  type CrewAssignment,
  type PayoutStatus,
  type RosterChip,
  type CrewMember,
} from '../../lib/queries/crew'


/** §11.1 — Tentative and Confirmed share one tone (blue); "on shoot today" is the derived solid-green override. */
function assignmentTone(a: CrewAssignment, onShootToday: boolean): StatusKey {
  if (a.cancelled) return 'neutral'
  if (onShootToday) return 'out'
  switch (a.status) {
    case 'Draft':
      return 'neutral'
    case 'Completed':
      return 'in'
    default:
      return 'primary'
  }
}

const PAYOUT_TONE: Record<PayoutStatus, StatusKey> = {
  'Not due': 'neutral',
  Due: 'progress',
  Paid: 'in',
}

/** "25 Jul 2026" -> a UTC day number, or NaN if the string doesn't parse. Never throws on a malformed seed value. */
function parseAdDay(s: string): number {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [d, mon, y] = s.trim().split(/\s+/)
  const month = mon ? MONTHS.indexOf(mon) : -1
  if (!d || month < 0 || !y) return NaN
  return Date.UTC(Number(y), month, Number(d))
}

/* `getBusinessToday()` per call rather than a module-scope `TODAY` (X-05): the
   "on shoot today" badge was measured against the day this module was imported,
   so it kept flagging yesterday's shoots on a tablet nobody had reloaded. */
function onShootToday(a: CrewAssignment): boolean {
  if (a.cancelled || a.status !== 'Confirmed') return false
  const s = parseAdDay(a.startDateAd)
  const e = parseAdDay(a.endDateAd)
  const t = getBusinessToday().getTime()
  return !Number.isNaN(s) && !Number.isNaN(e) && t >= s && t <= e
}

/**
 * **The four buttons on this screen that reported work nobody did.**
 *
 * `SUCCESS_FABRICATION_REGISTER_2026-08-12.md` names the class: a screen tells
 * the operator a write succeeded when nothing was written. It is silent by
 * construction — no error anywhere, and the operator's picture of what the
 * system knows quietly stops matching reality.
 *
 * The header's `Book Crew` was the worst of the four. It fired
 * `bookCrew({ crewIds: … })` with no `ActionContext` and no `.catch()`, and
 * `showSuccessToast('Book Crew', 'Opening crew booking flow')` ran
 * **synchronously on the next line** — a success claim with no relationship to
 * the dispatch, for a flow that never opened. Two further inventions rode
 * inside that one call:
 *
 *  1. **A fabricated subject.** With nothing selected the id list fell back to
 *     `['CRW-101']`. No such id exists anywhere in this repo — the roster is
 *     `CR-001…` (`data/crew.ts:103`) — so it was an invented identifier in an
 *     invented *format*, asserted on a write. Had the action been implemented,
 *     a crew member the operator never chose would have been booked. This is
 *     the same treatment `today/MovementList.tsx` gave `equipmentIds:
 *     ['EQP-101']`: a button pressed with no selection must **refuse**, never
 *     substitute a subject.
 *  2. **The wrong subject even when there was one.** `selectedRowIds` holds
 *     ASSIGNMENT ids (`CB-2026-0001`), and they were passed as `crewIds`, which
 *     `BookCrewInput` reads as roster people.
 *
 * Nothing honest is left to dispatch from here. `BookCrewInput` also wants a
 * `bookingId` — which booking the crew is being booked *onto* — and this screen
 * never knows one; a real booking additionally needs dates, a role and a rate,
 * and no form on this page and no route in `App.tsx` collects any of them. So
 * the button states the gap where it stands instead of miming a flow. The row
 * checkboxes are deliberately left in place: the selection is the input the
 * real flow will want, and removing working UI is not this fix.
 *
 * Resolved 6 Oct 2026: the flow lives as a header entry point on this screen —
 * `BookCrewFlow` asks which open booking first, then hands off to the existing
 * `AssignCrewModal` (rentals), which already collects member, role, rate,
 * call/wrap and days and dispatches the real `bookCrew` with an `ActionContext`
 * and an idempotency key. No second copy of that form lives here. The header
 * button renders only for roles `canAssignPricedCrew` admits (Owner/Admin/
 * Manager); everyone else never sees an action they cannot complete.
 */

/**
 * §13 — call sheets are unbuilt, and this button said so **through a success
 * toast** (`showSuccessToast('Create Call Sheet', 'Call sheets are not built
 * yet — spec §13')`). The words were honest; the channel was not. Law 12:
 * toasts are for successes only, and a control that cannot act says so where it
 * stands rather than congratulating the operator for pressing it.
 */


/**
 * Rulings §1 removes the Booking/Directory/Timesheets/Payouts tab strip
 * ("06 §6.1 draws none"), and three of its four tabs rendered nothing but an
 * `EmptyState`. Two rail buttons and one alert row used to navigate into those
 * dead tabs; with the strip gone they have no destination, so they state the
 * gap rather than moving the operator somewhere that says the same thing one
 * click later. The payout figures that *do* exist were not lost with the tab —
 * `payoutLedger()` renders them in the rail's PAYOUT LEDGER section, which is
 * where §6.1 draws them.
 */

const ROSTER_STATE_TONE: Record<CrewMember['state'], StatusKey> = {
  Available: 'in',
  Booked: 'primary',
  'On Leave': 'progress',
  'Off Duty': 'neutral',
}

export function CrewBooking() {
  const navigate = useNavigate()
  const { user } = useAuth()
  // gateContext() returns a fresh object literal on every call (see
  // lib/fieldGating.ts) — memoize it here so it has a stable reference
  // across renders. Without this, rowsWithIntel below would recompute on
  // every render regardless of its own deps, since gctx is one of them.
  const gctx = useMemo(() => gateContext(user?.role ?? 'Client'), [user?.role])
  // §4.1 — crew day-rate/payout is 'asset-finance', explicitly excluding
  // Coordinator ("no crew pay"). Stricter than the 'booking' gate Booking/
  // Invoice/Payment screens use — that is correct, not a mistake.
  const canCrewMoney = canViewMoneyField(gctx, 'asset-finance')

  // Shell rule, repeated at the top of all eleven specs: tables become card
  // rows below 768, right rails collapse below 1280 — and Rulings §7 reads
  // "collapse" as REFLOW, naming spec 06 explicitly. Both need the band, not a
  // phone/not-phone boolean, because the tablet layout differs from both.
  const viewport = useViewport()
  const desktop = viewport === 'desktop'
  const phone = viewport === 'phone'

  const [searchQuery, setSearchQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState('')
  // §6.1's chip row is roster availability, not assignment status. `data/crew.ts`
  // owns the three-chips-over-four-states union (law 1), so the count and the
  // predicate can never drift apart.
  const [rosterChip, setRosterChip] = useState<RosterChip>('All')
  const [crewAssignments, setCrewAssignments] = useState<CrewAssignment[]>(CREW_DATA)
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>(CREW_ROSTER)
  /* A failed read, never swallowed: the seed stays on screen behind the banner,
     and the banner says the data did not load live. */
  const [rosterLoadError, setRosterLoadError] = useState<string | null>(null)
  // Book-crew entry point. `bookCrew` assigns crew onto a booking, and this
  // screen never knows one, so the button opens a booking picker first and the
  // existing AssignCrewModal does the assignment — no second copy of that form.
  const [bookCrewOpen, setBookCrewOpen] = useState(false)
  // Bumped after an assignment lands so the roster/assignment lists re-read.
  const [crewRefreshKey, setCrewRefreshKey] = useState(0)
  // Priced assignments need crew-pay access; the modal states the same gate for
  // anyone who reaches it another way.
  const canBookCrew = !!user && canAssignPricedCrew(user.role)

  useEffect(() => {
    let active = true
    listCrewAssignments().then((res) => {
      if (active && res.rows.length > 0) {
        setCrewAssignments(res.rows)
      }
    }).catch((err: unknown) => {
      if (active) setRosterLoadError(err instanceof Error ? err.message : String(err))
    })

    listCrewMembers().then((res) => {
      if (active && res.rows.length > 0) {
        setCrewMembers(res.rows)
      }
    }).catch((err: unknown) => {
      if (active) setRosterLoadError(err instanceof Error ? err.message : String(err))
    })

    return () => {
      active = false
    }
  }, [crewRefreshKey])

  // HIS v2.1 Crew card is person-level; this screen lists one row per
  // *assignment*. Group by name so the hover card can show a person's full
  // schedule/pay even though the table itself stays assignment-per-row.
  const crewByName = useMemo(() => {
    const map = new Map<string, CrewAssignment[]>()
    for (const c of crewAssignments) {
      const list = map.get(c.name) ?? []
      list.push(c)
      map.set(c.name, list)
    }
    return map
  }, [crewAssignments])

  // §5.1 — conflicts are derived, never stored.
  const conflicts = useMemo(() => detectConflicts(crewAssignments), [crewAssignments])
  const conflictIds = useMemo(() => conflictedAssignmentIds(conflicts), [conflicts])
  const travelWarnings = useMemo(() => detectTravelWarnings(crewAssignments), [crewAssignments])
  const roster = useMemo(() => rosterSummary(crewMembers), [crewMembers])
  const crewDays = useMemo(() => crewDaysBooked(crewAssignments), [crewAssignments])
  const fill = useMemo(() => fillRate(crewAssignments, OPEN_ROLE_REQUESTS), [crewAssignments])

  const crewBookedToday = useMemo(() => crewAssignments.filter((a) => onShootToday(a)).length, [crewAssignments])
  const ledger = useMemo(() => payoutLedger(crewAssignments), [crewAssignments])

  const chipCounts = useMemo(() => rosterChipCounts(crewMembers), [crewMembers])
  const roles = useMemo(() => [...new Set([...crewMembers.map((member) => member.role), ...crewAssignments.map((assignment) => assignment.role)])].sort(), [crewMembers, crewAssignments])

  /** §6.1's CREW list — roster people, filtered by the chip row and the search box. */
  const filteredRoster = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return crewMembers.filter((m) => {
      if (!matchesRosterChip(m, rosterChip)) return false
      if (selectedRole && m.role !== selectedRole) return false
      if (!q) return true
      return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q)
    })
  }, [crewMembers, searchQuery, rosterChip, selectedRole])

  /** §6.1's ASSIGNMENTS list. Search only — the chips above govern the roster. */
  const filteredCrew = useMemo(() => {
    return crewAssignments.filter((c) => {
      if (selectedRole && c.role !== selectedRole) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          c.id.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.role.toLowerCase().includes(q) ||
          c.production.toLowerCase().includes(q) ||
          c.linkedBooking.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [crewAssignments, searchQuery, selectedRole])

  // HIS builders (crewGlance/crewDetailGroups) construct a full field-gated
  // object graph per row — compute them once per relevant dependency change
  // instead of on every render inside the table's .map().
  const rowsWithIntel = useMemo(
    () =>
      filteredCrew.map((c) => {
        const crewGroup = crewByName.get(c.name) ?? [c]
        const glance: IntelGlance = crewGlance(crewGroup, gctx, conflictIds)
        const detail: IntelGroup[] = crewDetailGroups(crewGroup, gctx)
        return { row: c, crewGroup, glance, detail }
      }),
    [filteredCrew, crewByName, gctx, conflictIds]
  )

  /**
   * Rulings §7 — "right rails collapse below 1280" means **reflow**, not hide,
   * and the ruling names spec 06 by number: its tablet drawing puts the day
   * strip and the payout ledger *below the list*, still visible. So the rail's
   * sections are hoisted into one variable and rendered either inside `Rail`
   * (desktop) or as a plain column beneath the list (tablet and phone).
   * `CollapsibleAside`'s collapse defaults are NOT changed — other pages depend
   * on them, and the ruling says so explicitly.
   */
  const railContent = (
    <>
      <RailSection title="Roster summary" badge={roster.reconciles ? undefined : 'Counts mismatch — refresh'}>
        <SummaryRows
          rows={[
            { label: 'Available', value: String(roster.available) },
            { label: 'Booked', value: String(roster.booked) },
            { label: 'On leave', value: String(roster.onLeave) },
            { label: 'Off duty', value: String(roster.offDuty) },
            { label: 'Conflicts', value: String(conflicts.length), ...(conflicts.length > 0 ? { tone: 'danger' as const } : {}) },
            { label: 'Timesheets outstanding', value: '—' },
          ]}
        />
      </RailSection>

      {/* §6.1's PAYOUT LEDGER — "(money roles only)", so it is OMITTED rather
          than masked for a money-blind role (Law 6). Gross is real; TDS and net
          are `null` in the engine because no rate is ruled (PLAN.md §4.12), and
          the card says "not tracked yet" rather than seeding a plausible one. */}
      {canCrewMoney && (
        <RailSection title="Payout ledger" badge={`${ledger.count} assignment${ledger.count === 1 ? '' : 's'}`}>
          <SummaryRows
            rows={[
              { label: 'Gross', value: formatMoney(ledger.grossPaisa) },
              ...ledger.byStatus.map((s) => ({ label: s.status, value: `${s.count} · ${formatMoney(s.grossPaisa)}` })),
              { label: 'TDS withheld', value: 'Not tracked yet' },
              { label: 'Net payable', value: 'Not tracked yet' },
            ]}
          />
          <div style={{ marginTop: 8, fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            TDS needs a ruled rate — PLAN.md §4.12. Never derived from an assumed one.
          </div>
        </RailSection>
      )}

      <RailSection title="Alerts" badge={String(railAlertCount(conflicts.length, travelWarnings.length, OPEN_ROLE_REQUESTS.length, crewAssignments))}>
        <AlertsList
          conflicts={conflicts}
          travelWarnings={travelWarnings}
          openRoles={OPEN_ROLE_REQUESTS}
          assignments={crewAssignments}
        />
      </RailSection>

    </>
  )

  return (
    <>
    <PageShell width="full">
      <div className="crew-v2">
        <PageHeader
          icon="crew"
          title="Crew Assist"
          leading={<FilterButton onClick={() => setFiltersOpen((open) => !open)} controls="crew-filters" expanded={filtersOpen} activeCount={Number(Boolean(selectedRole))} />}
          description="Roster management, shoot-day assignments, and conflict detection."
          actions={canBookCrew ? (
            <Button variant="primary" icon="plus" onClick={() => setBookCrewOpen(true)}>
              Book Crew
            </Button>
          ) : undefined}
        />
        <FilterDrawer id="crew-filters" open={filtersOpen} onClose={() => setFiltersOpen(false)} resultCount={filteredRoster.length} noun="crew members" activeCount={Number(Boolean(selectedRole))} onClearAll={() => setSelectedRole('')} standardFooter onApply={() => setFiltersOpen(false)}>
          <label style={{ display: 'grid', gap: 8, fontWeight: 600 }}>Role
            <Select aria-label="Filter crew by role" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)} style={{ minHeight: 44, width: '100%' }}>
              <option value="">All roles</option>
              {roles.map((role) => <option key={role} value={role}>{role}</option>)}
            </Select>
          </label>
        </FilterDrawer>

      {rosterLoadError && (
        <p
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 7,
            margin: 0,
            padding: '9px 11px',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--danger)',
            background: 'var(--st-danger-bg)',
            fontSize: 'var(--t-meta)',
            color: 'var(--danger-text)',
            lineHeight: 1.5,
          }}
        >
          <Icon name="alert_triangle" size={13} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            The live crew roster could not be loaded, so the roster and assignments below are the built-in
            reference set — not a live record. {rosterLoadError}
          </span>
        </p>
      )}

      {/*
        The Booking/Directory/Timesheets/Payouts tab strip that used to sit here
        is removed by Rulings §1's binding table ("06 §6.1 draws none"), and
        three of its four tabs rendered nothing but "— not built yet". §6.1 is a
        single surface: chips, CREW, ASSIGNMENTS, rail.
      */}
      <>
          {/* Toolbar & filter chips — §6.1 draws `(All)(Available)(Booked)(Unavailable)`,
              roster availability rather than assignment status. The union and its
              counts live in `data/crew.ts` so the chip and its number cannot drift. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--sp-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: phone ? 'wrap' : 'nowrap', width: phone ? '100%' : 'auto', flexShrink: 0, order: 0 }}>
              <div style={{ flex: phone ? '1 1 100%' : '1 1 320px', width: phone ? '100%' : 320, minWidth: phone ? '100%' : 240, maxWidth: 440 }}>
                <SearchInput
                  placeholder="Search crew, role, production…"
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onClear={() => setSearchQuery('')}
                />
              </div>
            </div>
            <div
              className="crew-chip-track rsp-chip-scroll"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-sm)',
                flexWrap: 'nowrap',
                overflowX: 'auto',
                width: phone ? '100%' : 'auto',
                maxWidth: phone ? '100%' : 'calc(100% - 400px)',
                paddingBottom: phone ? 4 : 0,
                order: 2,
              }}
            >
              {ROSTER_CHIPS.map((label) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={rosterChip === label}
                  onClick={() => setRosterChip(label)}
                  className={`crew-filter-chip ${rosterChip === label ? 'is-active' : ''}`}
                  style={{
                    // Law 15 — 44×44 at every width, desktop included.
                    minHeight: 44,
                    padding: '6px 14px',
                    borderRadius: 'var(--r-modal)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    border: rosterChip === label ? '1px solid var(--nav-active-accent)' : '1px solid var(--border)',
                    background: rosterChip === label ? 'var(--nav-active-bg)' : 'var(--card)',
                    color: rosterChip === label ? 'var(--nav-active-accent)' : 'var(--text)',
                  }}
                >
                  {label} <span className="crew-chip-badge">{chipCounts[label]}</span>
                </button>
              ))}
            </div>

          </div>

          <KpiStrip
            items={[
              { label: 'Booked Today', value: String(crewBookedToday), note: 'Confirmed, shoot day is today', icon: 'crew', accent: 'primary' },
              { label: 'Available', value: String(roster.available), note: `${roster.total} on the roster`, icon: 'check', accent: 'success' },
              {
                label: 'Conflicts',
                value: String(conflicts.length + travelWarnings.length),
                note: 'Next 7 days',
                icon: 'alert_triangle',
                accent: conflicts.length > 0 ? 'danger' : 'neutral',
              },
              {
                label: 'Fill Rate',
                value: `${crewDays} days · ${fill.pct}%`,
                note: `${fill.filled} of ${fill.requested} roles filled`,
                icon: 'users',
                accent: 'primary',
              },
            ]}
            columns={4}
          />

          {/* Calendar + tables (left) · rail (right).
              One column below 1280 so the rail's sections reflow beneath the
              list rather than squeezing `minmax(0,1fr)` to nothing. */}
          <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'minmax(0,1fr) auto' : '1fr', gap: 'var(--sp-md)', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
              <WeekCalendar assignments={crewAssignments} conflictIds={conflictIds} />

              {/* §6.1's CREW list — `name │ role │ rate │ [Book] ⋮`. */}
              <Card title="Crew" style={{ overflow: 'hidden' }}>
                {filteredRoster.length === 0 ? (
                  <EmptyState
                    title="Nobody matches this filter"
                    description="Adjust the availability chips or the search box."
                    actionLabel="Clear Filters"
                    onAction={() => {
                      setRosterChip('All')
                      setSearchQuery('')
                    }}
                  />
                ) : phone ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                    {filteredRoster.map((m) => (
                      <RosterCard key={m.id} member={m} showRate={canCrewMoney} />
                    ))}
                  </div>
                ) : (
                  <DataTableShell ariaLabel="Crew roster" data-table-scroll className="crew-table-shell" style={{ overflowX: 'auto' }}>
                    <table className="crew-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
                      <thead>
                        <tr style={{ background: 'var(--card2)', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 'var(--t-th)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          <th style={thStyle}>Name</th>
                          <th style={thStyle}>Role</th>
                          <th style={thStyle}>Availability</th>
                          {canCrewMoney && <th style={thStyle}>Day rate</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRoster.map((m) => {
                          const tone = STATUS[ROSTER_STATE_TONE[m.state]]
                          return (
                            <tr key={m.id} className="crew-row" style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text)' }}>{m.name}</td>
                              <td style={{ padding: '12px 14px', color: 'var(--text2)' }}>{m.role}</td>
                              <td style={{ padding: '12px 14px' }}>
                                <StateChip label={m.state} tone={ROSTER_STATE_TONE[m.state]} />
                              </td>
                              {canCrewMoney && (
                                <td className="figure crew-mono" style={{ padding: '12px 14px', color: tone.fg === '' ? undefined : 'var(--text)' }}>
                                  {formatMoney(m.dayRatePaisa)} / day
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </DataTableShell>
                )}
              </Card>

              <Card title="Assignments" style={{ overflow: 'hidden' }}>
                {filteredCrew.length === 0 ? (
                  <EmptyState
                    title="No crew assignments found"
                    description="Adjust your search query to find crew assignments."
                    actionLabel="Clear Filters"
                    onAction={() => {
                      setRosterChip('All')
                      setSearchQuery('')
                    }}
                  />
                ) : phone ? (
                  /* Shell rule — below 768 a table is a horizontal scrollbar, not
                     a layout. §6.1's phone drawing is `name · role / rate [Book]`:
                     one card per assignment, one primary action. */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                    {rowsWithIntel.map(({ row: c }) => (
                      <AssignmentCard
                        key={c.id}
                        assignment={c}
                        inConflict={conflictIds.has(c.id)}
                        showMoney={canCrewMoney}
                        onOpen={() => navigate(`/rentals/${c.linkedBooking}`)}
                      />
                    ))}
                  </div>
                ) : (
                  <DataTableShell ariaLabel="Crew assignments" data-table-scroll className="crew-table-shell" style={{ overflowX: 'auto' }}>
                    <table className="crew-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
                      <thead>
                        <tr style={{ background: 'var(--card2)', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 'var(--t-th)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          <th style={thStyle}>Crew Member</th>
                          {/* Tablet drops the three widest columns — §6.1's tablet
                              drawing is `name │ role │ [Book] ⋮`, and eight columns
                              in 768–1279px is a sideways scroll, not a layout. */}
                          {desktop && <th style={thStyle}>Production</th>}
                          <th style={thStyle}>Dates &amp; Duration</th>
                          {desktop && canCrewMoney && <th style={thStyle}>Financials (Cost)</th>}
                          <th style={thStyle}>Assignment Status</th>
                          {desktop && <th style={thStyle}>Payout Status</th>}
                          <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rowsWithIntel.map(({ row: c, crewGroup, glance, detail }) => {
                          const inConflict = conflictIds.has(c.id)
                          const tone = STATUS[assignmentTone(c, onShootToday(c))]
                          const payoutTone = STATUS[PAYOUT_TONE[c.payoutStatus]]
                          return (
                            <tr
                              key={c.id}
                              className={`crew-row ${inConflict ? 'is-conflict' : ''}`}
                              style={{ borderBottom: '1px solid var(--border)', background: inConflict ? 'var(--st-danger-bg)' : undefined }}
                            >
                              <td style={{ padding: '12px 14px' }}>
                                <IntelCard
                                  glance={glance}
                                  detail={detail}
                                  detailTitle={c.name}
                                  detailSubtitle={crewGroup.length > 1 ? `${crewGroup.length} assignments` : c.role}
                                >
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{c.name}</div>
                                      {c.isInternalStaff && <Tag label="STAFF" tone="neutral" />}
                                      {inConflict && <Tag label="CONFLICT" tone="danger" />}
                                    </div>
                                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>{c.role}</div>
                                    {/* HIS v2.1 §4.2 — was unconditional; the hover card's own
                                        Contact group already gated the same phone number. */}
                                    {canViewPII(gctx) && (
                                      <div className="figure crew-mono" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>{c.phone}</div>
                                    )}
                                  </div>
                                </IntelCard>
                              </td>
                              {desktop && (
                                <td style={{ padding: '12px 14px' }}>
                                  <div style={{ fontWeight: 500, color: 'var(--text)' }}>{c.production}</div>
                                  <Link to={`/rentals/${c.linkedBooking}`} className="figure crew-mono" style={{ fontSize: 'var(--t-meta)', color: 'var(--link)', marginTop: 2, display: 'block', textDecoration: 'none' }}>
                                    {c.linkedBooking}
                                  </Link>
                                </td>
                              )}
                              <td style={{ padding: '12px 14px' }}>
                                <div className="figure crew-mono" style={{ fontWeight: 600, color: 'var(--text)' }}>
                                  {c.startDateBs} — {c.endDateBs}
                                </div>
                                <div className="figure crew-mono" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>
                                  {c.startDateAd} — {c.endDateAd} ({c.days} day{c.days === 1 ? '' : 's'})
                                </div>
                              </td>
                              {desktop && canCrewMoney && (
                                <td style={{ padding: '12px 14px' }}>
                                  <div className="figure crew-mono" style={{ fontWeight: 600, color: 'var(--text)' }}>{formatMoney(c.totalCostPaisa)}</div>
                                  <div className="figure crew-mono" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>{formatMoney(c.dayRatePaisa)} / day</div>
                                </td>
                              )}
                              <td style={{ padding: '12px 14px' }}>
                                {/* Law 11 — the dot is colour, so the glyph and the
                                    word carry the state as well. */}
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: tone.fg, fontWeight: 600 }}>
                                  <Icon name={STATUS_ICON[assignmentTone(c, onShootToday(c))]} size={12} />
                                  {c.status}
                                  {c.cancelled && ' · Cancelled'}
                                </span>
                              </td>
                              {desktop && (
                                <td style={{ padding: '12px 14px' }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--t-meta)', fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-xs)', background: payoutTone.bg, color: payoutTone.fg }}>
                                    <Icon name={STATUS_ICON[PAYOUT_TONE[c.payoutStatus]]} size={11} />
                                    {c.payoutStatus}
                                  </span>
                                </td>
                              )}
                              <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                <Button variant="secondary" onClick={() => navigate(`/rentals/${c.linkedBooking}`)}>
                                  View booking
                                </Button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </DataTableShell>
                )}
              </Card>
            </div>

            {/* Right rail — §12. Rulings §7: rendered as a rail only at desktop;
                below 1280 the same sections reflow into the column beneath the
                lists, still visible, never behind a handle. */}
            {desktop ? (
              <Rail width={320} label="Crew summary">
                {railContent}
              </Rail>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>{railContent}</div>
            )}
          </div>
        </>
      </div>
    </PageShell>
    <BookCrewFlow
      open={bookCrewOpen}
      onClose={() => setBookCrewOpen(false)}
      onAssigned={() => setCrewRefreshKey((k) => k + 1)}
    />
    </>
  )
}


/** Law 11 — colour + icon + label, never colour alone. */
function StateChip({ label, tone }: { label: string; tone: StatusKey }) {
  const c = STATUS[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 'var(--r-xs)',
        background: c.bg,
        color: c.fg,
        ...(c.border ? { border: `1px solid ${c.border}` } : {}),
      }}
    >
      <Icon name={STATUS_ICON[tone]} size={11} />
      {label}
    </span>
  )
}

/** §6.1's phone drawing for the CREW list: `name · role / rate [Book]`. */
function RosterCard({ member, showRate }: { member: CrewMember; showRate: boolean }) {
  return (
    <article className="crew-card-item" style={{ ...cardStyle, padding: 'var(--sp-sm) var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-sm)' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{member.name}</div>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{member.role}</div>
        </div>
        <StateChip label={member.state} tone={ROSTER_STATE_TONE[member.state]} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-sm)' }}>
        {showRate ? (
          <span className="figure crew-mono" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            {formatMoney(member.dayRatePaisa)} / day
          </span>
        ) : (
          <span />
        )}
      </div>
    </article>
  )
}

/** One assignment as a card row, one primary action — the sub-768 alternative to the table. */
function AssignmentCard({
  assignment: c,
  inConflict,
  showMoney,
  onOpen,
}: {
  assignment: CrewAssignment
  inConflict: boolean
  showMoney: boolean
  onOpen: () => void
}) {
  const toneKey = assignmentTone(c, onShootToday(c))
  return (
    <article
      className={`crew-card-item ${inConflict ? 'is-conflict' : ''}`}
      style={{
        ...cardStyle,
        padding: 'var(--sp-sm) var(--sp-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        ...(inConflict ? { background: 'var(--st-danger-bg)' } : {}),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{c.name}</span>
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>· {c.role}</span>
        {c.isInternalStaff && <Tag label="STAFF" tone="neutral" />}
        {inConflict && <Tag label="CONFLICT" tone="danger" />}
      </div>
      <div className="figure crew-mono" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
        {c.linkedBooking} · {c.startDateAd} — {c.endDateAd} ({c.days} day{c.days === 1 ? '' : 's'})
      </div>
      {showMoney && (
        <div className="figure crew-mono" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          {formatMoney(c.totalCostPaisa)} · {formatMoney(c.dayRatePaisa)} / day
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <StateChip label={c.cancelled ? `${c.status} · Cancelled` : c.status} tone={toneKey} />
          <StateChip label={c.payoutStatus} tone={PAYOUT_TONE[c.payoutStatus]} />
        </div>
        <Button variant="primary" onClick={onOpen}>
          View booking
        </Button>
      </div>
    </article>
  )
}


/**
 * Law 11 — colour + icon + label — now satisfied by delegating to <Badge>.
 * DESIGN_DIRECTION_SPEC_v4.1 §8 step 2: "one component rendering the §4 map
 * from lib/status; every screen inherits. No screen colours a status itself."
 *
 * The hand-rolled version read `STATUS[tone]` and then wrote its own anatomy
 * over it: radius 4 where §3.3 says `--r-chip` (6), weight 700 where §4 says
 * 800, sentence-case padding where §4 says 0.04em uppercase. It also indexed
 * `STATUS_ICON`, typed `Record<StatusKey, string>`, and cast the result to
 * `IconName` — two of that map's seven values name glyphs the `Icon` REGISTRY
 * does not carry, so the cast compiles and renders `undefined`. <Badge>
 * resolves its own glyph, so the cast goes away with the paint.
 *
 * The wrapper is KEPT and its call sites are untouched — STAFF and CONFLICT
 * still read `<Tag label=… tone=… />` in both the card list and the row list.
 * Note this file still has three other places that paint a status by hand
 * (the assignment chip, the accent bar and the payout chip); they are outside
 * this pass and are flagged rather than half-converted.
 */
function Tag({ label, tone }: { label: string; tone: StatusKey }) {
  return <Badge tone={tone} label={label} size="sm" />
}

/* ── week calendar — §9, real assignment blocks, Week view only ─────────── */

const DAY_MS = 86400000

function mondayOf(d: Date): Date {
  const day = d.getUTCDay() // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day
  return new Date(d.getTime() + diff * DAY_MS)
}

function WeekCalendar({ assignments, conflictIds }: { assignments: CrewAssignment[]; conflictIds: Set<string> }) {
  /* The week shown, and the column the grid highlights, both come from ONE
     reading of the clock taken while this renders (X-05). They were derived
     from a module-scope `TODAY`, so the grid kept last-loaded week's columns
     with the highlight stuck on a day that had passed. */
  const todayUtc = getBusinessToday().getTime()
  const weekStart = useMemo(() => mondayOf(new Date(todayUtc)), [todayUtc])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS)), [weekStart])
  const weekEnd = days[6] as Date

  // One row per roster person with at least one assignment touching this week.
  const rows = useMemo(() => {
    const byName = new Map<string, CrewAssignment[]>()
    for (const a of assignments) {
      if (a.cancelled) continue
      const s = parseAdDay(a.startDateAd)
      const e = parseAdDay(a.endDateAd)
      if (Number.isNaN(s) || Number.isNaN(e)) continue
      if (e < weekStart.getTime() || s > weekEnd.getTime()) continue
      const list = byName.get(a.name) ?? []
      list.push(a)
      byName.set(a.name, list)
    }
    return Array.from(byName.entries())
  }, [assignments, weekStart, weekEnd])

  const monthDay = (d: Date) => `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`
  const weekday = (d: Date) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1]

  return (
    <Card title="Crew Calendar" action={<span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Week view</span>}>
      {rows.length === 0 ? (
        <EmptyState title="No bookings this week" description="Nobody on the roster has an assignment overlapping this week." />
      ) : (
        <div className="crew-calendar-shell">
          <div style={{ display: 'grid', gridTemplateColumns: '160px repeat(7, minmax(110px,1fr))', minWidth: 940 }}>
            <div />
            {days.map((d) => {
              /* `getBusinessToday()` already returns midnight UTC of the
                 Kathmandu civil day, so this is a plain instant comparison. */
              const isToday = d.getTime() === todayUtc
              return (
                <div
                  key={d.getTime()}
                  className={`figure crew-mono crew-calendar-day-header ${isToday ? 'is-today' : ''}`}
                >
                  {weekday(d)} {monthDay(d)}
                </div>
              )
            })}

            {rows.map(([name, list]) => (
              <Fragment key={name}>
                <div style={{ padding: '10px 8px', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)', borderTop: '1px solid var(--border)' }}>
                  {name}
                  <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', fontWeight: 500 }}>{list[0]?.role}</div>
                </div>
                {days.map((d) => {
                  const dayStart = d.getTime()
                  const block = list.find((a) => {
                    const s = parseAdDay(a.startDateAd)
                    const e = parseAdDay(a.endDateAd)
                    return dayStart >= s && dayStart <= e
                  })
                  const tone = block ? STATUS[assignmentTone(block, onShootToday(block))] : null
                  return (
                    <div key={`${name}-${d.getTime()}`} style={{ padding: 'var(--sp-xs)', borderTop: '1px solid var(--border)' }}>
                      {block && (
                        // Law 11 — the block used to carry its status ONLY in the
                        // fill colour plus a `title`, which is not an accessible
                        // name and is unreachable by touch. The status now has a
                        // glyph, and the whole block has an `aria-label` stating
                        // production, status and conflict in words — the treatment
                        // `Calendar.tsx:755` gives its day cells.
                        <div
                          role="img"
                          aria-label={`${block.production} — ${block.status}${conflictIds.has(block.id) ? ', conflict' : ''}`}
                          title={`${block.production} — ${block.status}${conflictIds.has(block.id) ? ' · CONFLICT' : ''}`}
                          className="crew-calendar-block"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '6px 7px',
                            borderRadius: 'var(--r-xs)',
                            background: tone?.bg,
                            color: tone?.fg,
                            fontSize: 'var(--t-th)',
                            fontWeight: 600,
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            /* --danger, the LINE colour, not --st-danger-fg.
                               This ring is drawn against `tone.bg` — whichever
                               status fill the block already carries, which is
                               never guaranteed to be the red one — so it needs
                               a hue that stands on its own. --st-danger-fg is
                               --on-danger = #ffffff in both themes, so the
                               conflict ring was white on a light chip and the
                               conflict signal disappeared entirely. Matches
                               `data/calendar.ts`, which already names
                               `line: 'var(--danger)'` for the same purpose. */
                            border: conflictIds.has(block.id) ? '1px solid var(--danger)' : undefined,
                          }}
                        >
                          <Icon
                            name={
                              conflictIds.has(block.id)
                                ? STATUS_ICON.danger
                                : STATUS_ICON[assignmentTone(block, onShootToday(block))]
                            }
                            size={10}
                          />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{block.production}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

/* ── right rail helpers, matching CasesQueue.tsx's local pattern ────────── */

function RailSection({ title, children, badge }: { title: string; children: ReactNode; badge?: string | undefined }) {
  return (
    <section style={{ ...cardStyle, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
        {badge && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{badge}</span>}
      </div>
      {children}
    </section>
  )
}

function railAlertCount(conflictCount: number, travelCount: number, openRoleCount: number, assignments: CrewAssignment[]): number {
  const payoutDue = assignments.filter((a) => !a.cancelled && a.payoutStatus === 'Due').length > 0 ? 1 : 0
  return conflictCount + travelCount + openRoleCount + payoutDue
}

const ALERT_ROW_LAYOUT: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '26px minmax(0,1fr)',
  gap: 'var(--sp-sm)',
  padding: '7px 6px',
  borderRadius: 'var(--r-sm)',
  textDecoration: 'none',
  textAlign: 'left',
  width: '100%',
  color: 'inherit',
}

/**
 * **Two of these four alert kinds went nowhere.** The conflict and travel rows
 * link to the booking they are about — a real route. The unfilled-role rows and
 * the payout row were `<Link to="#">`, visually identical to the two beside
 * them: a click landed back on the same page with nothing said, and the
 * operator came away believing they had looked at the thing being flagged.
 *
 * Each kind is now rendered as whatever actually exists behind it:
 *
 *  - **Payout due** has a real destination on this very screen — the Payouts
 *    tab, the same place the rail's `Open Payouts` button goes. It is a tab,
 *    not a route, so it is a button rather than a `Link`; the tab states its
 *    own unbuilt-ness once it gets there, which is honest and visible.
 *  - **Unfilled role** has none. `OpenRoleRequest` carries a production *name*,
 *    not a booking number (`data/crew.ts`), no route in `App.tsx` addresses a
 *    role request, and the row is rendered as what it is: information, no
 *    anchor, no pointer cursor, nothing to click. (The crew-booking flow itself
 *    is built — header `Book Crew` → booking picker → `AssignCrewModal` — but
 *    it assigns chosen people onto a chosen booking, which is not the same as
 *    resolving a named open role, so the row still gets no control.)
 *
 * `to` is optional and never `'#'`. A row with no destination does not get one.
 */
function AlertsList({
  conflicts,
  travelWarnings,
  openRoles,
  assignments,
}: {
  conflicts: ReturnType<typeof detectConflicts>
  travelWarnings: ReturnType<typeof detectTravelWarnings>
  openRoles: typeof OPEN_ROLE_REQUESTS
  assignments: CrewAssignment[]
}) {
  const payoutsDue = assignments.filter((a) => !a.cancelled && a.payoutStatus === 'Due')

  type Row = {
    title: string
    detail: string
    severity: 'Critical' | 'Warning'
    icon: IconName
    /** A route this row really opens. Omitted when none exists. */
    to?: string | undefined
    /** An in-page destination (a tab on this screen) for rows whose home is not a route. */
    onSelect?: (() => void) | undefined
  }
  const rows: Row[] = [
    ...conflicts.map((c): Row => ({
      title: 'Double booking',
      detail: `${c.name} — ${c.a.linkedBooking} × ${c.b.linkedBooking}`,
      to: `/rentals/${c.a.linkedBooking}`,
      severity: c.severity === 'Critical' ? 'Critical' : 'Warning',
      icon: 'alert_triangle',
    })),
    ...openRoles.map((r): Row => ({
      title: `${r.role} unfilled`,
      detail: `${r.production} — needed from ${r.neededFromAd}`,
      severity: 'Critical',
      icon: 'users',
    })),
    ...travelWarnings.map((w): Row => ({
      title: 'Travel infeasible',
      detail: `${w.name} — ${w.from.location} → ${w.to.location}, ${w.gapDays}d gap`,
      to: `/rentals/${w.to.linkedBooking}`,
      severity: 'Warning',
      icon: 'calendar',
    })),
    // The Payouts tab this row used to open is removed by Rulings §1. Its gross
    // figures now sit in the rail's PAYOUT LEDGER on this same screen, so the
    // row is information rather than a link to nowhere — the treatment this
    // file already documents for the unfilled-role rows.
    ...(payoutsDue.length > 0
      ? [
          {
            title: 'Payout due',
            detail: `${payoutsDue.length} crew payout${payoutsDue.length === 1 ? '' : 's'} awaiting release`,
            severity: 'Warning' as const,
            icon: 'card' as const,
          },
        ]
      : []),
  ]

  if (rows.length === 0) {
    return <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No alerts right now.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((r, i) => {
        const tone = STATUS[r.severity === 'Critical' ? 'danger' : 'progress']
        const body = (
          <>
            <span style={{ width: 26, height: 26, borderRadius: 7, background: tone.bg, color: tone.fg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon name={r.icon} size={13} />
            </span>
            <span style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>{r.title}</div>
              <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.detail}</div>
            </span>
          </>
        )

        if (r.to) {
          return (
            <Link key={i} to={r.to} className="crew-alert-row" style={ALERT_ROW_LAYOUT}>
              {body}
            </Link>
          )
        }
        if (r.onSelect) {
          return (
            <button
              key={i}
              type="button"
              onClick={r.onSelect}
              className="press crew-alert-row"
              style={{ ...ALERT_ROW_LAYOUT, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
            >
              {body}
            </button>
          )
        }
        return (
          <div key={i} className="crew-alert-row" style={ALERT_ROW_LAYOUT}>
            {body}
          </div>
        )
      })}
    </div>
  )
}
