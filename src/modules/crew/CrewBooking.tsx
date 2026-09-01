import { Fragment, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import type { CSSProperties, ReactNode } from 'react'
import { Card, Button, PageHeader, Rail, SummaryRows, cardStyle } from '../../components/ui/Page'
import { thStyle } from '../../components/ui/TableHeaderCell'
import { Input } from '../../components/ui/Input'
import { EmptyState } from '../../components/ui/StateViews'
import { Unavailable } from '../../components/ui/Unavailable'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { formatMoney, crewBilling } from '../../lib/money'
import { useAuth } from '../../lib/auth'
import { gateContext, canViewMoneyField, canViewPII } from '../../lib/fieldGating'
import { IntelCard } from '../../components/ui/IntelCard'
import type { IntelGlance, IntelGroup } from '../../components/ui/IntelCard'
import { crewGlance, crewDetailGroups } from '../../data/crewIntel'
import { STATUS, STATUS_ICON } from '../../lib/status'
import { Badge } from '../../components/ui/Badge'
import type { StatusKey } from '../../lib/status'
import { useViewport } from '../../lib/device'
import { getBusinessToday } from '../../lib/bs'
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
} from '../../data/crew'
import type { CrewAssignment, PayoutStatus, RosterChip, CrewMember } from '../../data/crew'

/*
 * The operating day, resolved once when this module loads, from the real
 * clock in Kathmandu (`lib/bs.ts`'s `getBusinessToday`). It replaced an
 * imported `TODAY` constant frozen at 31 Jul 2026.
 */
const TODAY = getBusinessToday()


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

function onShootToday(a: CrewAssignment): boolean {
  if (a.cancelled || a.status !== 'Confirmed') return false
  const s = parseAdDay(a.startDateAd)
  const e = parseAdDay(a.endDateAd)
  const t = TODAY.getTime()
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
 * TODO(decision): where the crew-booking flow lives — a `/crew/new` workspace,
 * a modal on this screen, or an entry point on the booking itself — and which
 * record it attaches to. A page may not answer that (CLAUDE.md).
 */
const BOOK_CREW_UNAVAILABLE =
  'Not built yet — booking crew needs a booking to attach to, a person and dates, and nothing here collects them'

/**
 * §13 — call sheets are unbuilt, and this button said so **through a success
 * toast** (`showSuccessToast('Create Call Sheet', 'Call sheets are not built
 * yet — spec §13')`). The words were honest; the channel was not. Law 12:
 * toasts are for successes only, and a control that cannot act says so where it
 * stands rather than congratulating the operator for pressing it.
 */
const CALL_SHEET_UNAVAILABLE = 'Not built yet — call sheets are spec §13'

/**
 * `Export` toasted "Generating crew payroll report…" and generated nothing —
 * no file, no download, no report, no dispatch. Same honest-gap shape
 * `NewRental.tsx`'s Send Quote menu uses for the artefacts it cannot produce
 * ("No PDF generator is connected in this build").
 *
 * Deliberately **not** replaced with a client-side CSV of the visible table:
 * the label promises a payroll report, half these columns are `asset-finance`
 * money behind `canCrewMoney` (Law 6), and quietly redefining what an operator
 * gets when they press Export is its own kind of untruth.
 */
const EXPORT_UNAVAILABLE = 'Not built yet — no payroll-report generator is connected in this build'

/**
 * §6.1 draws `[date range ▾]` beside the chip row. No assignment-date filter
 * model exists on this screen — `CREW_ROSTER` carries no availability calendar
 * (`data/crew.ts:59` says so outright), so a range picker here would filter
 * nothing. Stated where it stands rather than drawn as a working control.
 */
const DATE_RANGE_UNAVAILABLE =
  'Not built yet — the roster carries no availability calendar to filter a date range against'

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
const TIMESHEETS_UNAVAILABLE = 'Not built yet — planned/actual/overtime capture is spec 06 §8'
const PAYOUTS_UNAVAILABLE =
  'Not built yet — gross is in the rail’s payout ledger; TDS and net need a ruled rate (PLAN.md §4.12)'

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
  // §6.1's chip row is roster availability, not assignment status. `data/crew.ts`
  // owns the three-chips-over-four-states union (law 1), so the count and the
  // predicate can never drift apart.
  const [rosterChip, setRosterChip] = useState<RosterChip>('All')
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())

  // HIS v2.1 Crew card is person-level; this screen lists one row per
  // *assignment*. Group by name so the hover card can show a person's full
  // schedule/pay even though the table itself stays assignment-per-row.
  const crewByName = useMemo(() => {
    const map = new Map<string, CrewAssignment[]>()
    for (const c of CREW_DATA) {
      const list = map.get(c.name) ?? []
      list.push(c)
      map.set(c.name, list)
    }
    return map
  }, [])

  // §5.1 — conflicts are derived, never stored.
  const conflicts = useMemo(() => detectConflicts(CREW_DATA), [])
  const conflictIds = useMemo(() => conflictedAssignmentIds(conflicts), [conflicts])
  const travelWarnings = useMemo(() => detectTravelWarnings(CREW_DATA), [])
  const roster = useMemo(() => rosterSummary(CREW_ROSTER), [])
  const crewDays = useMemo(() => crewDaysBooked(CREW_DATA), [])
  const fill = useMemo(() => fillRate(CREW_DATA, OPEN_ROLE_REQUESTS), [])

  const billing = useMemo(() => {
    const payoutsPaisa = CREW_DATA.filter((a) => !a.cancelled).reduce((sum, a) => sum + a.totalCostPaisa, 0) as CrewAssignment['totalCostPaisa']
    return crewBilling({
      crewDays,
      payoutsPaisa,
      feePerCrewDayPaisa: FEE_PER_CREW_DAY_PAISA,
      expensesPaisa: CREW_EXPENSES_THIS_MONTH_PAISA,
      rechargeExpenses: true, // §2.3 Model A — recharge at cost (spec's recommendation)
    })
  }, [crewDays])

  const crewBookedToday = useMemo(() => CREW_DATA.filter((a) => onShootToday(a)).length, [])
  const ledger = useMemo(() => payoutLedger(CREW_DATA), [])

  const chipCounts = useMemo(() => rosterChipCounts(CREW_ROSTER), [])

  /** §6.1's CREW list — roster people, filtered by the chip row and the search box. */
  const filteredRoster = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return CREW_ROSTER.filter((m) => {
      if (!matchesRosterChip(m, rosterChip)) return false
      if (!q) return true
      return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q)
    })
  }, [searchQuery, rosterChip])

  /** §6.1's ASSIGNMENTS list. Search only — the chips above govern the roster. */
  const filteredCrew = useMemo(() => {
    return CREW_DATA.filter((c) => {
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
  }, [searchQuery])

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

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedRowIds(new Set(filteredCrew.map((c) => c.id)))
    else setSelectedRowIds(new Set())
  }

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedRowIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedRowIds(next)
  }

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
      <RailSection title="Roster summary" badge={roster.reconciles ? undefined : 'invariant failed'}>
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

      <RailSection title="Alerts" badge={String(railAlertCount(conflicts.length, travelWarnings.length, OPEN_ROLE_REQUESTS.length, CREW_DATA))}>
        <AlertsList
          conflicts={conflicts}
          travelWarnings={travelWarnings}
          openRoles={OPEN_ROLE_REQUESTS}
          assignments={CREW_DATA}
        />
      </RailSection>

      <RailSection title="Quick actions">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
          {/* `Unavailable` is `inline-flex`, which would collapse these to
              content width beside a full-width button. `display: grid` makes the
              single child a grid item, which stretches — one stack again. */}
          <Unavailable reason={BOOK_CREW_UNAVAILABLE} style={{ display: 'grid', width: '100%' }}>
            <Button variant="primary" icon="plus" disabled>
              Book Crew
            </Button>
          </Unavailable>
          <Unavailable reason={CALL_SHEET_UNAVAILABLE} style={{ display: 'grid', width: '100%' }}>
            <Button variant="secondary" icon="calendar" disabled>
              Create Call Sheet
            </Button>
          </Unavailable>
          <Unavailable reason={TIMESHEETS_UNAVAILABLE} style={{ display: 'grid', width: '100%' }}>
            <Button variant="secondary" icon="receipt" disabled>
              Open Timesheets
            </Button>
          </Unavailable>
          <Unavailable reason={PAYOUTS_UNAVAILABLE} style={{ display: 'grid', width: '100%' }}>
            <Button variant="secondary" icon="card" disabled>
              Open Payouts
            </Button>
          </Unavailable>
        </div>
      </RailSection>
    </>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="crew"
        // The nav item (`data/nav.ts:73`), the route breadcrumb (`App.tsx:264`)
        // and spec 06's own heading all read "Crew Assist". The `<h1>` said
        // "Crew Booking"; three surfaces against one is not a naming question.
        title="Crew Assist"
        description="Book, coordinate and reconcile production crew — schedule, cost and payouts in one place."
        actions={
          <Unavailable reason={BOOK_CREW_UNAVAILABLE}>
            <Button variant="primary" icon="plus" disabled>
              Book Crew
            </Button>
          </Unavailable>
        }
      />

      {/*
        The Booking/Directory/Timesheets/Payouts tab strip that used to sit here
        is removed by Rulings §1's binding table ("06 §6.1 draws none"), and
        three of its four tabs rendered nothing but "— not built yet". §6.1 is a
        single surface: chips, CREW, ASSIGNMENTS, rail.
      */}
      <>
          {/* KPI row — §10, exactly six cards. Money cards omitted (not hidden) without asset-finance.
              Clamped per band the way `KpiStrip` (Page.tsx:204) does: six 1fr
              columns on a 375px phone is six unreadable slivers. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${kpiColumns(canCrewMoney ? 6 : 5, viewport)}, minmax(0,1fr))`,
              gap: 'var(--sp-md)',
            }}
          >
            <KpiTile label="Crew Booked Today" value={String(crewBookedToday)} note="Confirmed, shoot day is today" icon="crew" accent="primary" />
            <KpiTile label="Available Today" value={String(roster.available)} note={`${roster.total} on the roster`} icon="check" accent="in" />
            <KpiTile
              label="Conflicts"
              value={String(conflicts.length + travelWarnings.length)}
              note="Double bookings + travel warnings, next 7 days"
              icon="alert_triangle"
              accent={conflicts.length > 0 ? 'danger' : 'neutral'}
            />
            <KpiTile label="Timesheets Outstanding" value="—" note="Not tracked yet — see Timesheets tab" icon="calendar" accent="neutral" />
            {canCrewMoney && <BillingKpiTile billing={billing} />}
            <KpiTile
              label="Crew-Days · Fill Rate"
              value={`${crewDays} · ${fill.pct}%`}
              note={`${fill.filled} of ${fill.requested} roles filled this month`}
              icon="users"
              accent="primary"
            />
          </div>

          {/* Toolbar & filter chips — §6.1 draws `(All)(Available)(Booked)(Unavailable)`,
              roster availability rather than assignment status. The union and its
              counts live in `data/crew.ts` so the chip and its number cannot drift. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--sp-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
              {ROSTER_CHIPS.map((label) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={rosterChip === label}
                  onClick={() => setRosterChip(label)}
                  style={{
                    // Law 15 — 44×44 at every width, desktop included.
                    minHeight: 44,
                    padding: '6px 14px',
                    borderRadius: 'var(--r-modal)',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    border: rosterChip === label ? '1px solid var(--nav-active-accent)' : '1px solid var(--border)',
                    background: rosterChip === label ? 'var(--nav-active-bg)' : 'var(--card)',
                    color: rosterChip === label ? 'var(--nav-active-accent)' : 'var(--text)',
                  }}
                >
                  {label} <span className="figure" style={{ opacity: 0.85, marginLeft: 'var(--sp-xs)' }}>{chipCounts[label]}</span>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ width: phone ? '100%' : 240 }}>
                <Input
                  placeholder="Search crew, role, production…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Unavailable reason={DATE_RANGE_UNAVAILABLE}>
                <Button variant="secondary" icon="calendar" disabled>
                  Date range
                </Button>
              </Unavailable>
              <Unavailable reason={EXPORT_UNAVAILABLE}>
                <Button variant="secondary" icon="download" disabled>
                  Export
                </Button>
              </Unavailable>
            </div>
          </div>

          {/* Calendar + tables (left) · rail (right).
              One column below 1280 so the rail's sections reflow beneath the
              list rather than squeezing `minmax(0,1fr)` to nothing. */}
          <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'minmax(0,1fr) auto' : '1fr', gap: 'var(--sp-md)', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
              <WeekCalendar assignments={CREW_DATA} conflictIds={conflictIds} />

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
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
                      <thead>
                        <tr style={{ background: 'var(--card2)', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 'var(--t-th)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          <th style={thStyle}>Name</th>
                          <th style={thStyle}>Role</th>
                          <th style={thStyle}>Availability</th>
                          {canCrewMoney && <th style={thStyle}>Day rate</th>}
                          <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRoster.map((m) => {
                          const tone = STATUS[ROSTER_STATE_TONE[m.state]]
                          return (
                            <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text)' }}>{m.name}</td>
                              <td style={{ padding: '12px 14px', color: 'var(--text2)' }}>{m.role}</td>
                              <td style={{ padding: '12px 14px' }}>
                                <StateChip label={m.state} tone={ROSTER_STATE_TONE[m.state]} />
                              </td>
                              {canCrewMoney && (
                                <td className="figure" style={{ padding: '12px 14px', color: tone.fg === '' ? undefined : 'var(--text)' }}>
                                  {formatMoney(m.dayRatePaisa)} / day
                                </td>
                              )}
                              <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                <Unavailable reason={BOOK_CREW_UNAVAILABLE}>
                                  <Button variant="secondary" disabled>
                                    Book
                                  </Button>
                                </Unavailable>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
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
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-meta)' }}>
                      <thead>
                        <tr style={{ background: 'var(--card2)', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: 'var(--t-th)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          <th style={{ ...thStyle, width: 36 }}>
                            <input
                              type="checkbox"
                              checked={selectedRowIds.size === filteredCrew.length && filteredCrew.length > 0}
                              onChange={(e) => handleSelectAll(e.target.checked)}
                              style={{ accentColor: 'var(--nav-active-accent)' }}
                            />
                          </th>
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
                              style={{ borderBottom: '1px solid var(--border)', background: inConflict ? 'var(--st-danger-bg)' : 'transparent' }}
                            >
                              <td style={{ padding: '12px 14px' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedRowIds.has(c.id)}
                                  onChange={() => handleToggleRow(c.id)}
                                  style={{ accentColor: 'var(--nav-active-accent)' }}
                                />
                              </td>
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
                                      <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>{c.phone}</div>
                                    )}
                                  </div>
                                </IntelCard>
                              </td>
                              {desktop && (
                                <td style={{ padding: '12px 14px' }}>
                                  <div style={{ fontWeight: 500, color: 'var(--text)' }}>{c.production}</div>
                                  <Link to={`/rentals/${c.linkedBooking}`} className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--link)', marginTop: 2, display: 'block', textDecoration: 'none' }}>
                                    {c.linkedBooking}
                                  </Link>
                                </td>
                              )}
                              <td style={{ padding: '12px 14px' }}>
                                <div className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>
                                  {c.startDateBs} — {c.endDateBs}
                                </div>
                                <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>
                                  {c.startDateAd} — {c.endDateAd} ({c.days} day{c.days === 1 ? '' : 's'})
                                </div>
                              </td>
                              {desktop && canCrewMoney && (
                                <td style={{ padding: '12px 14px' }}>
                                  <div className="figure" style={{ fontWeight: 600, color: 'var(--text)' }}>{formatMoney(c.totalCostPaisa)}</div>
                                  <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>{formatMoney(c.dayRatePaisa)} / day</div>
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
                                  View
                                </Button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
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
  )
}

/**
 * Six KPI cards across a 375px phone is six unreadable slivers. Same clamp
 * `KpiStrip` applies at `Page.tsx:204`, kept local because this screen's tiles
 * are bespoke (`BillingKpiTile` carries three linked figures).
 */
function kpiColumns(count: number, viewport: 'phone' | 'tablet' | 'desktop'): number {
  if (viewport === 'phone') return Math.min(count, 2)
  if (viewport === 'tablet') return Math.min(count, 3)
  return count
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
    <article style={{ ...cardStyle, padding: 'var(--sp-sm) var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-sm)' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{member.name}</div>
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{member.role}</div>
        </div>
        <StateChip label={member.state} tone={ROSTER_STATE_TONE[member.state]} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-sm)' }}>
        {showRate ? (
          <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            {formatMoney(member.dayRatePaisa)} / day
          </span>
        ) : (
          <span />
        )}
        <Unavailable reason={BOOK_CREW_UNAVAILABLE}>
          <Button variant="primary" disabled>
            Book
          </Button>
        </Unavailable>
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
      <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
        {c.linkedBooking} · {c.startDateAd} — {c.endDateAd} ({c.days} day{c.days === 1 ? '' : 's'})
      </div>
      {showMoney && (
        <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
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

/* ── KPI tiles ────────────────────────────────────────────────────────── */

function KpiTile({ label, value, note, icon, accent }: { label: string; value: string; note: string; icon: IconName; accent: StatusKey }) {
  const c = STATUS[accent]
  return (
    <article className="lift" style={{ ...cardStyle, padding: '13px 14px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ width: 30, height: 30, borderRadius: 'var(--r-sm)', background: c.bg, color: c.fg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name={icon} size={16} fill />
        </span>
        <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      </div>
      <div className="figure" style={{ marginTop: 9, fontSize: 'clamp(16px, 1.5vw, 22px)', fontWeight: 700, color: 'var(--text)' }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 'var(--t-meta)', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note}</div>
    </article>
  )
}

/**
 * §2.4 — Billed · Cost · Margin, side by side, from the Financial Engine.
 * No `Kpi` shape fits three linked numbers, so this is bespoke — the same
 * move `Finance.tsx`'s `PL_CHAIN` makes for its P&L chain.
 */
function BillingKpiTile({ billing }: { billing: ReturnType<typeof crewBilling> }) {
  return (
    <article className="lift" style={{ ...cardStyle, padding: '13px 14px', minWidth: 0 }}>
      <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)' }}>Billed · Cost · Margin</div>
      <div style={{ marginTop: 9, display: 'flex', gap: 'var(--sp-md)' }}>
        <MoneyStat label="Billed" value={billing.billedPaisa} />
        <MoneyStat label="Cost" value={billing.costPaisa} />
        {/* MoneyStat spends `tone` as a bare `color:` on the figure (see its
            definition below), so it takes the TEXT-safe pair. --st-danger-fg /
            --st-in-fg are --on-danger / --on-success — both #ffffff in BOTH
            themes, ink for a solid fill — and this card has no fill, so the
            Margin figure rendered white on the card and was invisible either
            side of zero on the now-default light theme. */}
        <MoneyStat label="Margin" value={billing.marginPaisa} tone={billing.marginPaisa !== null && billing.marginPaisa < 0 ? 'var(--danger-text)' : 'var(--success-text)'} />
      </div>
      <div style={{ marginTop: 6, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>This month</div>
    </article>
  )
}

function MoneyStat({ label, value, tone }: { label: string; value: number | null; tone?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{label}</div>
      <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: tone ?? 'var(--text)' }}>
        {value === null ? 'Not configured' : formatMoney(value as never)}
      </div>
    </div>
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
  const weekStart = useMemo(() => mondayOf(TODAY), [])
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
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px repeat(7, minmax(110px,1fr))', minWidth: 940 }}>
            <div />
            {days.map((d) => {
              const isToday = d.getTime() === Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), TODAY.getUTCDate())
              return (
                <div
                  key={d.getTime()}
                  className="figure"
                  style={{
                    padding: '6px 8px',
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                    color: isToday ? 'var(--nav-active-accent)' : 'var(--text2)',
                    textAlign: 'center',
                    borderBottom: `2px solid ${isToday ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                  }}
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
                          aria-label={`${block.production} — ${block.status}${conflictIds.has(block.id) ? ', conflict' : ''}`}
                          title={`${block.production} — ${block.status}${conflictIds.has(block.id) ? ' · CONFLICT' : ''}`}
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
 *    role request, and the flow that would fill one is itself unbuilt — see
 *    `BOOK_CREW_UNAVAILABLE`, which already states that gap on this screen. So
 *    the row is rendered as what it is: information, no anchor, no pointer
 *    cursor, nothing to click.
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
            <Link key={i} to={r.to} style={ALERT_ROW_LAYOUT}>
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
              className="press"
              style={{ ...ALERT_ROW_LAYOUT, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
            >
              {body}
            </button>
          )
        }
        return (
          <div key={i} style={ALERT_ROW_LAYOUT}>
            {body}
          </div>
        )
      })}
    </div>
  )
}
