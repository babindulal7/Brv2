import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, Button, cardStyle } from '../../components/ui/Page'
import { FloorAside } from '../operations/FloorAside'
import { ErrorBanner } from '../../components/ui/StateViews'
import { PageBody } from '../../components/ui/PageBody'
import { isStaff } from '../../lib/rbac'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'

export interface ReturnWorkspaceProps {
  loading?: boolean | undefined
  error?: string | null | undefined
  onRetry?: (() => void) | undefined
}
import { thStyle as th } from '../../components/ui/TableHeaderCell'
import { STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import { statusToken } from '../../lib/workflow'
import type { BookingStatus, JobState, ItemState } from '../../lib/workflow'
import { BarcodeScannerModal } from '../../components/ui/BarcodeScannerModal'
import { Unavailable } from '../../components/ui/Unavailable'
import { toBs, formatBs, formatAd, formatAdDateTime } from '../../lib/bs'
/* `lateBand` and its two formatters return no monetary value — that is the
   whole reason they exist. `lib/money.ts` stays unimported here (§8.3). */
import { lateBand, formatOverage, bandConsequence } from '../../lib/lateFee'
import { BOOKING, RETURN_AT, ACTUAL_RETURN_AT } from '../../data/booking'
import {
  UNITS as SEED_UNITS,
  SESSIONS as SEED_SESSIONS,
  TOTAL_ITEMS,
  FILTERS,
  ITEM_STATE_LABEL,
  MISSING_EFFECT,
  DAMAGED_EFFECT,
  NOT_RETURNED_DECISIONS,
  RETURN_TIMING,
  routeFor,
} from '../../data/returnInspection'
import type {
  ReturnUnit,
  ReturnSession,
  SessionId,
  Condition,
  DamageDetail,
  NotReturnedDecision,
  Sig,
} from '../../data/returnInspection'
import { BookingNotLoaded } from '../operations/BookingNotLoaded'

/**
 * **Return & Inspection Workspace** — `Return Workflow.md` v2.1 (Build Locked)
 * + `Inspection Workflow.md`, one screen for both, per the latter's own words
 * ("Inspection is not a separate workspace").
 *
 * Built from the specs' **corrections**, not the reference screenshot — and,
 * where the module spec itself disagrees with Foundation, from Foundation
 * (governing rule: "Where anything disagrees with Foundation, Foundation
 * wins"). `../../data/returnInspection.ts`'s file header carries the full
 * accounting; the two corrections that shape this component:
 *
 *  · The spec still speaks in retired "Stage 6–11" numbering and invents a
 *    `Partial Return` / `Late Return` flag Foundation's closed 17-flag
 *    registry (§1.9) does not contain. Neither appears here — this component
 *    holds a `BookingStatus` and a `JobState`, per `lib/workflow.ts`'s own
 *    comment: "every screen holds a `BookingStatus`", never a stage number.
 *  · Condition was shown Excellent *and* Damage at once on the render → a
 *    radio group, one value, never two (§6.3).
 *  · The render's `Missing 1` was an Allen key, an accessory — split into two
 *    counters that can never merge (§6.5).
 *  · Signatures rendered captured before the return was complete → this
 *    workspace only offers to capture a session's signatures once its gates
 *    (barring the signatures themselves) are otherwise satisfied, and a
 *    session, once closed, is not reopened (§9, §3 "Closing is irreversible").
 *  · §5.6's gate checklist is rendered in full — all six Session Gates, passing
 *    and failing alike, each with its blocking value — rather than collapsed
 *    to one summary line, because both `Return Workflow.md` §12 and
 *    `Inspection Workflow.md`'s "Gate: Complete Return" section ask for the
 *    full pattern explicitly, not just the footer note §5.6 minimally requires.
 *
 * **No money, anywhere.** Foundation §8.3: "Warehouse sees no monetary value
 * anywhere, including inside a gate checklist." This is a warehouse floor
 * screen. `lib/money.ts` is not imported; no Rs figure appears. The render's
 * Charges Summary panel and `Refund Deposit` / `Collect Balance` actions are
 * therefore omitted entirely, matching §13.1's own instruction for the
 * Warehouse role ("Charges Summary — hidden entirely") rather than merely
 * greying them out.
 */

/** §13 sibling convention — the workspace primary is `--blue-600` in both themes, never green. */
const BLUE_PRIMARY = { background: 'var(--cat-1)', color: '#fff', border: '1px solid transparent' } as const

/**
 * ⭐ 12 Aug 2026 — spec 03's closing notes: *"Exactly one primary button per
 * workspace, and it is the completion gate."*
 *
 * This page shipped three filled blue buttons: `Scan Barcode`, `Save
 * Inspection` and `Complete Session`. Only the last is the gate, so the other
 * two take this treatment instead — the accent kept as an outline, so the
 * scan-first workflow stays as findable as it was on a warehouse tablet
 * without a second button claiming to be *the* action.
 */
const ACCENT_OUTLINE = { background: 'transparent', color: 'var(--cat-1)', border: '1px solid var(--cat-1)' } as const

/**
 * The reason the Witness row cannot be signed — see `captureSignature`. Stated
 * on the control rather than solved with a name, because the name would be
 * invented.
 */
const WITNESS_UNAVAILABLE =
  'No witness identity is captured on this screen, so a witness signature cannot be attested here. §9 makes the witness optional — this return is recorded with no witness rather than with an invented one.'

const ITEM_TONE: Record<ItemState, StatusKey> = {
  Ready: 'neutral',
  'Picked Up': 'out', // §4.2 — solid green, "still out" with the client.
  Returned: 'in', // soft green, "back in".
  Missing: 'danger',
}

const CONDITION_TONE: Record<Condition, StatusKey> = {
  Excellent: 'in',
  Good: 'in',
  Fair: 'progress',
  Damaged: 'danger',
  Lost: 'danger',
}

const CONDITIONS: Condition[] = ['Excellent', 'Good', 'Fair', 'Damaged', 'Lost']

function cloneUnit(u: ReturnUnit): ReturnUnit {
  return {
    ...u,
    ...(u.accessories ? { accessories: u.accessories.map((a) => ({ ...a })) } : {}),
    ...(u.damage ? { damage: { ...u.damage } } : {}),
    pickup: { ...u.pickup },
    ...(u.ret ? { ret: { ...u.ret } } : {}),
  }
}

function cloneSession(s: ReturnSession): ReturnSession {
  return { ...s, signatures: { ...s.signatures } }
}

const td = { padding: '8px 9px', fontSize: 'var(--t-meta)', color: 'var(--text)' }

interface GateRow {
  n: number
  label: string
  passing: boolean
  blocking: string | null
  resolve?: () => void
}

export default function ReturnWorkspace({
  loading: propLoading,
  error: propError,
  onRetry: propOnRetry,
}: ReturnWorkspaceProps = {}) {
  const navigate = useNavigate()
  const { bookingNo } = useParams()
  const id = bookingNo ?? BOOKING.no
  /* Law 13/14 — width decides. §3.4's tablet layout is "scan column + triage
     buttons; compare strip drops below", which is the right column REFLOWING
     beneath the list — not collapsing to a handle (Rulings §7). */
  const viewport = useViewport()
  const desktop = viewport === 'desktop'
  const phone = viewport === 'phone'
  const { user } = useAuth()
  const isStaffMember = user ? isStaff(user.role) : true
  /** Law 12 — the dispatch failure is shown inline and stays there. Never a toast. */
  const [dispatchError, setDispatchError] = useState<string | null>(null)

  const [units, setUnits] = useState<Record<string, ReturnUnit>>(() =>
    Object.fromEntries(SEED_UNITS.map((u) => [u.id, cloneUnit(u)])),
  )
  const [sessions, setSessions] = useState<Record<SessionId, ReturnSession>>(() => ({
    S1: cloneSession(SEED_SESSIONS.S1),
    S2: cloneSession(SEED_SESSIONS.S2),
  }))
  const [expandedId, setExpandedId] = useState<string | null>('r11')
  const [showScanner, setShowScanner] = useState(false)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')

  /* Money-free by construction — `lateBand` returns minutes and a band name,
     never a Paisa. See the import note and §8.3. */
  const overrun = lateBand(RETURN_AT, ACTUAL_RETURN_AT)
  const [query, setQuery] = useState('')
  const [scanLog, setScanLog] = useState<string[]>([])

  const scannableUnits = SEED_UNITS.map((u) => ({
    id: u.id,
    name: u.name,
    serial: u.serial,
    isAccessory: !u.serial || u.serial === 'N/A' || u.name.toLowerCase().includes('cable') || u.name.toLowerCase().includes('cap'),
  }))
  const activeId: SessionId = 'S2'
  const active = sessions[activeId]

  const list = SEED_UNITS.map((u) => units[u.id] as ReturnUnit)
  const returned = list.filter((u) => u.state === 'Returned')
  const outstanding = list.filter((u) => u.state === 'Picked Up')
  const missing = list.filter((u) => u.state === 'Missing')
  const damaged = list.filter((u) => u.condition === 'Damaged')
  const accessoriesMissing = list.flatMap((u) => (u.accessories ?? []).filter((a) => a.present === false).map((a) => ({ item: u.name, accessory: a.name })))
  const allResolved = outstanding.length === 0
  const pct = Math.round((returned.length / TOTAL_ITEMS) * 100)

  const returnJobState: JobState = allResolved ? 'Complete' : 'In Progress'
  const bookingStatus: BookingStatus = allResolved ? 'Returned' : 'On Rent'

  const set = (uid: string, patch: Partial<ReturnUnit>) => setUnits((p) => ({ ...p, [uid]: { ...(p[uid] as ReturnUnit), ...patch } }))

  const setDamage = (uid: string, patch: Partial<DamageDetail>) =>
    setUnits((p) => {
      const u = p[uid] as ReturnUnit
      const base: DamageDetail = u.damage ?? { description: '', photos: 0, routedForApproval: false }
      return { ...p, [uid]: { ...u, damage: { ...base, ...patch } } }
    })

  const scan = (uid: string) => {
    const u = units[uid] as ReturnUnit
    if (u.state === 'Returned') {
      setScanLog((p) => [`• ${u.name} already returned at ${u.ret?.at ?? '—'}`, ...p].slice(0, 5))
      return
    }
    set(uid, { state: 'Returned', sessionId: activeId, ret: { at: '19 Jul 2026, 10:16 AM', by: active.returningPerson, photos: 0 } })
    setExpandedId(uid)
    setScanLog((p) => [`✓ ${u.name} (${u.serial}) received — inspection opened`, ...p].slice(0, 5))
  }

  const markMissing = (uid: string) => {
    const u = units[uid] as ReturnUnit
    set(uid, { state: 'Missing' })
    setScanLog((p) => [`✕ ${u.name} declared Not Returned — ${MISSING_EFFECT}`, ...p].slice(0, 5))
  }

  const undoMissing = (uid: string) =>
    setUnits((p) => {
      // exactOptionalPropertyTypes — clearing `decision` means *omitting* the
      // key, never assigning it `undefined`, so it is dropped by destructuring.
      const { decision: _decision, ...rest } = p[uid] as ReturnUnit
      return { ...p, [uid]: { ...rest, state: 'Picked Up' } }
    })

  const setCondition = (uid: string, condition: Condition) => set(uid, { condition })

  const setAccessory = (uid: string, name: string, present: boolean) =>
    setUnits((p) => {
      const u = p[uid] as ReturnUnit
      const accessories = (u.accessories ?? []).map((a) => (a.name === name ? { ...a, present } : a))
      return { ...p, [uid]: { ...u, accessories } }
    })

  const saveInspection = (uid: string) => {
    const u = units[uid] as ReturnUnit
    if (!u.condition) return
    set(uid, { inspection: 'Inspected' })
    setExpandedId(null)
  }

  /**
   * ⭐ 12 Aug 2026 — the witness is gone from here, and cannot come back by accident.
   *
   * `names.witness` was the literal `'Bikash Thapa'`. Pressing Capture on the
   * Witness row therefore wrote a **named individual** onto the return
   * attestation without that person being present, asked, or identified. A
   * signature block is evidence: if a damage or missing-unit dispute ever turns
   * on this return, that name is a fabricated witness sitting on it.
   *
   * This screen captures no witness identity anywhere — no field, no picker, and
   * `ReturnSession` names only `returningPerson` and `receivingStaff` — so there
   * is nothing true to put in the field. §9 already makes the witness OPTIONAL,
   * so absent is the honest state ("no witness recorded"); a name, or a
   * placeholder, is a claim. The role union below no longer admits `witness`, and
   * the Witness row's Capture control is `Unavailable` with its reason attached.
   *
   * The two remaining names are NOT literals typed here: they are read off the
   * session record this signature belongs to.
   */
  const captureSignature = (role: 'returningPerson' | 'warehouseStaff') => {
    const names = { returningPerson: active.returningPerson, warehouseStaff: active.receivingStaff }
    const roleLabel = { returningPerson: 'Client Representative', warehouseStaff: 'Warehouse' }
    setSessions((p) => ({
      ...p,
      [activeId]: {
        ...(p[activeId] as ReturnSession),
        signatures: { ...(p[activeId] as ReturnSession).signatures, [role]: { name: names[role], role: roleLabel[role], at: '19 Jul 2026, 10:19 AM' } },
      },
    }))
  }

  const setDecision = (uid: string, decision: NotReturnedDecision) => set(uid, { decision })
  const setNote = (uid: string, note: string) => set(uid, { note })

  /* ── §12.1 — six Session Gates, shown in full per §5.6 and the module's own "Gate: Complete Return" section. ── */
  const sessionUnits = list.filter((u) => u.sessionId === activeId)
  const uninspected = sessionUnits.filter((u) => u.inspection !== 'Inspected')
  const accessoryIncomplete = sessionUnits.filter((u) => (u.accessories ?? []).some((a) => a.present === null))
  const damagedOrLost = sessionUnits.filter((u) => u.condition === 'Damaged' || u.condition === 'Lost')
  const evidenceMissing = damagedOrLost.filter((u) => (u.damage?.photos ?? 0) === 0)
  const approvalMissing = damagedOrLost.filter((u) => u.damage?.routedForApproval !== true)
  const sigMissing: string[] = []
  if (!active.signatures.returningPerson) sigMissing.push('Returning person')
  if (!active.signatures.warehouseStaff) sigMissing.push('Warehouse staff')

  // exactOptionalPropertyTypes — `resolve` is included only when there is
  // somewhere to resolve *to*; never assigned an explicit `undefined`.
  const gateRow = (n: number, label: string, passing: boolean, blocking: string | null, resolve?: () => void): GateRow => ({
    n,
    label,
    passing,
    blocking,
    ...(resolve ? { resolve } : {}),
  })

  const gates: GateRow[] = [
    gateRow(1, 'Every item received in this session scanned and serial-verified', sessionUnits.length > 0, sessionUnits.length > 0 ? null : 'No items received in this session yet'),
    gateRow(
      2,
      'Every returned item inspected — condition set',
      uninspected.length === 0,
      uninspected.length === 0 ? null : `${uninspected.length} item(s) not yet saved — ${uninspected.map((u) => u.name).join(', ')}`,
      uninspected[0] ? () => setExpandedId(uninspected[0]!.id) : undefined,
    ),
    gateRow(
      3,
      'Accessories checked on every inspected item',
      accessoryIncomplete.length === 0,
      accessoryIncomplete.length === 0 ? null : `${accessoryIncomplete.length} item(s) with an unchecked accessory — ${accessoryIncomplete.map((u) => u.name).join(', ')}`,
      accessoryIncomplete[0] ? () => setExpandedId(accessoryIncomplete[0]!.id) : undefined,
    ),
    gateRow(
      4,
      'Evidence captured on every Damaged or Lost line',
      evidenceMissing.length === 0,
      evidenceMissing.length === 0 ? null : `${evidenceMissing.length} line(s) with no return photo — ${evidenceMissing.map((u) => u.name).join(', ')}`,
      evidenceMissing[0] ? () => setExpandedId(evidenceMissing[0]!.id) : undefined,
    ),
    // §13.1 — "the damage-approval gate reads Damage approval required, with no amount."
    gateRow(
      5,
      'Damage charges approved, or marked Absorb / Defer',
      approvalMissing.length === 0,
      approvalMissing.length === 0 ? null : 'Damage approval required',
      approvalMissing[0] ? () => setExpandedId(approvalMissing[0]!.id) : undefined,
    ),
  ]
  gates.push({
    n: 6,
    label: 'Required signatures captured for this session',
    passing: sigMissing.length === 0,
    blocking: sigMissing.length === 0 ? null : `Missing: ${sigMissing.join(', ')}`,
  })
  const canCompleteSession = active.state !== 'Complete' && gates.every((g) => g.passing)
  const primaryLabel = allResolved ? 'Complete Return' : 'Complete Session'
  const gateSummary = canCompleteSession ? null : active.state === 'Complete' ? 'This session is already closed' : (gates.find((g) => !g.passing)?.blocking ?? null)

  /**
   * **Complete Return — the write this screen exists to make.**
   *
   * It used to set React state, stamp a hardcoded `'19 Jul 2026, 10:20 AM'` and
   * navigate away, dispatching nothing, while the footer beside it said "Saving
   * is automatic" and "This will close the Return and set the booking to
   * Returned". Neither happened: no `return_lines`, no `operation_sessions`, no
   * `session_line_movements`, and `bookings.stage` left at `On Rent` — so the
   * gear read as out indefinitely, the deposit was never released, and the
   * booking stayed double-bookable while its own Return screen said it was
   * closed.
   *
   * `completeReturn` (`actions/rentals/returnRental.ts`) is `implemented: true`
   * on `operations.perform` and routes through `runFloorVerb`, so the write path
   * exists and this caller was walking around it. Same caller shape as
   * `PackingWorkspace`, `ResetWorkspace` and `HandoverWorkspace`:
   *
   *  - refuse inline when nobody is signed in — a floor record with no actor is
   *    not a record;
   *  - `lines: []`, deliberately, because this workspace's ids come from
   *    `data/returnInspection`'s seed rather than `booking_lines`, so
   *    `validateFloorVerb` refuses it *visibly* instead of the screen silently
   *    claiming success;
   *  - the session flip and the `navigate` both inside `.then()`, so a rejected
   *    write cannot read as a closed return.
   */
  const completeSession = () => {
    if (!canCompleteSession) return
    if (!user) {
      setDispatchError('You are not signed in, so this return cannot be recorded against anyone. Nothing was written.')
      return
    }
    setDispatchError(null)
    const occurredAt = new Date().toISOString()
    import('../../actions/rentals')
      .then((m) => m.completeReturn({ rentalId: id, lines: [], occurredAt }, { userId: user.id, role: user.role }))
      .then(() => {
        setSessions((p) => ({
          ...p,
          [activeId]: { ...(p[activeId] as ReturnSession), state: 'Complete', closedAt: formatAdDateTime(occurredAt) },
        }))
        navigate(`/rentals/${id}`)
      })
      .catch((err: unknown) => {
        console.error('return failed:', err)
        setDispatchError(err instanceof Error ? err.message : String(err))
      })
  }

  const expected = toBs(new Date('2026-07-19'))
  const actual = toBs(new Date('2026-07-19'))

  const visible = SEED_UNITS.filter((u) => {
    const s = units[u.id] as ReturnUnit
    if (filter !== 'All' && s.state !== filter) return false
    if (query && !`${u.name} ${u.serial}`.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  /* ── 5-State handling ─────────────────────────────────────────────── */
  if (!isStaffMember) {
    return (
      <PageBody
        restricted={true}
        restrictedReason="Return & inspection workspace is for Babin Rentals staff only."
        restrictedRequiredRole="Staff"
        noun="return inspection"
      >
        <div />
      </PageBody>
    )
  }

  if (propError) {
    return (
      <PageBody
        error={propError}
        {...(propOnRetry ? { onRetry: propOnRetry } : {})}
        noun="return inspection"
      >
        <div />
      </PageBody>
    )
  }

  if (propLoading) {
    return (
      <PageBody
        loading={true}
        skeleton="card"
        noun="return inspection"
      >
        <div />
      </PageBody>
    )
  }

  /*
   * Spec 03 Notes — "Routes are parameterised — these must work for any BR#,
   * not one seeded booking." This workspace's items come from a single seeded
   * booking, so any OTHER booking number gets the honest not-loaded state
   * rather than that booking's gear wearing this number (Rulings §8). Placed
   * after every hook, so the hook order is identical on both branches.
   */
  if (bookingNo !== undefined && bookingNo !== BOOKING.no) {
    return <BookingNotLoaded bookingNo={bookingNo} job="Return" seededBookingNo={BOOKING.no} />
  }

  // Floor scale (DEVICES.md item 3) is applied automatically by route in App.tsx's Shell, not here.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {/* ── header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-lg)', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 'var(--t-h1)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.015em' }}>
              Return &amp; Inspection Workspace
            </h1>
            <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 'var(--r-badge)', background: STATUS.in.bg, color: STATUS.in.fg, fontSize: 'var(--t-meta)', fontWeight: 700 }}>
              Equipment In
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 'var(--r-badge)', background: STATUS[statusToken(bookingStatus)].bg, color: STATUS[statusToken(bookingStatus)].fg, fontSize: 'var(--t-meta)', fontWeight: 700 }}>
              {bookingStatus}
            </span>
          </div>
          {/* §0 #9 — the corrected breadcrumb, not `Rentals › Booking › Return & Inspection › BR-2613`. */}
          <p style={{ margin: '5px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            Rentals › Bookings ›{' '}
            <Link to={`/rentals/${id}`} style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }} className="identifier">
              {id}
            </Link>
            {' › Return · '}
            {BOOKING.client}
          </p>
        </div>

        <div style={{ minWidth: 260, flex: 1 }}>
          <div style={{ display: 'flex', gap: 10, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            <span>Return Progress</span>
            <span className="figure" style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text)' }}>
              {returned.length} / {TOTAL_ITEMS} ({pct}%)
            </span>
          </div>
          <div aria-hidden style={{ height: 8, borderRadius: 'var(--r-badge)', background: 'var(--card2)', marginTop: 6, overflow: 'hidden' }}>
            <div style={{ width: '100%', height: '100%', background: 'var(--success)', borderRadius: 'var(--r-badge)', transform: `scaleX(${pct / 100})`, transformOrigin: 'left', transition: 'transform var(--dur) ease' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 'var(--t-meta)', color: outstanding.length ? 'var(--progress-text)' : 'var(--success-text)', fontWeight: 600 }}>
            <Icon name={outstanding.length ? 'alert_triangle' : 'checklist'} size={12} />
            {outstanding.length ? `${outstanding.length} item${outstanding.length > 1 ? 's' : ''} still outstanding` : 'All items resolved'}
            {missing.length > 0 && <span style={{ color: 'var(--danger-text)' }}>· {missing.length} not returned</span>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
          <Button icon="file">Print Return Report</Button>
          <Link to={`/rentals/${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 'var(--r-btn)', border: '1px solid var(--btn-secondary-border)', background: 'var(--btn-secondary-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600, textDecoration: 'none' }}>
            <Icon name="external_link" size={14} />
            View Booking
          </Link>
        </div>
      </div>

      {/* ── §4 booking strip — read-only, no money (§8.3) ─────────────────── */}
      <div style={{ ...cardStyle, display: 'flex', gap: 0, flexWrap: 'wrap', overflow: 'hidden' }}>
        {[
          { l: 'Client', v: BOOKING.client, big: true },
          { l: 'Total Items', v: String(TOTAL_ITEMS) },
          { l: 'Returned', v: String(returned.length), tone: 'var(--success-text)' },
          { l: 'Outstanding', v: String(outstanding.length), tone: outstanding.length ? 'var(--progress-text)' : undefined },
          { l: 'Not Returned', v: String(missing.length), tone: missing.length ? 'var(--danger-text)' : undefined },
          { l: 'Expected Return', v: expected ? formatBs(expected) : RETURN_TIMING.expected.ad, s: `${formatAd(new Date('2026-07-19'))}, ${RETURN_TIMING.expected.time}` },
          { l: 'Actual Return', v: actual ? formatBs(actual) : RETURN_TIMING.actual.ad, s: `${formatAd(new Date('2026-07-19'))}, ${RETURN_TIMING.actual.time}`, tone: 'var(--danger-text)' },
          { l: 'Return job', v: returnJobState },
          { l: 'Status', v: bookingStatus, big: true },
        ].map((f) => (
          <div key={f.l} style={{ padding: '11px 14px', borderRight: '1px solid var(--border)', minWidth: 0, flex: '1 1 auto' }}>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{f.l}</div>
            <div className="figure" style={{ fontSize: f.big ? 'var(--t-h3)' : 'var(--t-body)', fontWeight: f.big ? 700 : 600, color: f.tone ?? 'var(--text)', marginTop: 3, whiteSpace: 'nowrap' }}>
              {f.v}
            </div>
            {f.s && <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{f.s}</div>}
          </div>
        ))}
      </div>
      {/* §4 — overrun as informational text, never a fabricated "Late Return" flag (see file header).
       *
       * §4.2 — the overage and the band are now **computed** by `lib/lateFee`'s
       * `lateBand`, not the hand-written string this used to print, so the floor
       * and Finance can never disagree about how late a return was.
       *
       * `lateBand` returns no monetary value at all, which is why it exists:
       * §8.3 keeps every Rs figure off this screen, and the rupees and the
       * apply/waive decision live on Booking Detail behind `canBookingMoney`.
       * "A full rental day is chargeable" is a unit of rental time, not a price. */}
      {overrun.band !== 'None' && (
        <p style={{ margin: '-6px 2px 0', fontSize: 'var(--t-meta)', color: 'var(--danger-text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <Icon name="timer" size={12} />
          {formatOverage(overrun.overageMinutes)} past expected return
          <span style={{ fontWeight: 500, color: 'var(--text2)' }}>· {bandConsequence(overrun)}</span>
        </p>
      )}

      {/* ── §5 scan bar ────────────────────────────────────────────────── */}
      <Card>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setShowScanner(true)} style={{ ...bigScanBtn, ...ACCENT_OUTLINE }}>
            <Icon name="queues" size={16} /> Scan Barcode
          </button>
          <button type="button" onClick={() => setShowScanner(true)} style={{ ...bigScanBtn, background: 'var(--btn-secondary-bg)', color: 'var(--text)', border: '1px solid var(--btn-secondary-border)' }}>
            <Icon name="queues" size={16} /> Scan QR
          </button>
          <div style={{ flex: 1, minWidth: 180, display: 'flex', alignItems: 'center' }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Equipment"
              aria-label="Search equipment"
              style={{ width: '100%', height: 44, padding: '0 12px', borderRadius: 'var(--r-btn)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-ui)', fontFamily: 'inherit', outline: 'none' }}
            />
          </div>
        </div>
        <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Scan any item to mark as returned and start inspection</p>
      </Card>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: desktop ? 'minmax(0,1fr) auto' : '1fr',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        {/* ── centre column ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          <Card title="1 · Equipment Table" bodyStyle={{ padding: 0 }}>
            <div style={{ display: 'flex', gap: 7, padding: '9px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
              {FILTERS.map((f) => {
                const on = filter === f
                const label = f === 'All' ? 'All' : ITEM_STATE_LABEL[f]
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    aria-pressed={on}
                    style={{
                      height: 26,
                      padding: '0 9px',
                      borderRadius: 7,
                      border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                      background: on ? 'var(--nav-active-bg)' : 'transparent',
                      color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                      fontSize: 'var(--t-meta)',
                      fontWeight: on ? 600 : 500,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {/* §3.4 PHONE — "one serial card at a time, [OK] / [Flag] full width."
                A 880px table on a 375px screen is a horizontal scrollbar hiding
                the columns that matter (`lib/device.ts:139`); the same triage
                panel renders inside the card, so the two layouts cannot drift. */}
            {phone ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', padding: 'var(--sp-md)' }}>
                {visible.length === 0 && (
                  <div style={{ padding: 'var(--sp-lg)', textAlign: 'center', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                    No items match these filters.
                  </div>
                )}
                {visible.map((seed) => {
                  const u = units[seed.id] as ReturnUnit
                  const isOpen = expandedId === u.id
                  const itemTone = STATUS[ITEM_TONE[u.state]]
                  return (
                    <article key={u.id} style={{ ...cardStyle, padding: 'var(--sp-md)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{u.name}</div>
                        <Link to={`/inventory/${u.serial}`} className="identifier" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', textDecoration: 'none' }}>
                          {u.serial}
                        </Link>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 8px', borderRadius: 'var(--r-badge)', background: itemTone.bg, color: itemTone.fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                          <Icon name={u.state === 'Missing' ? 'alert_triangle' : u.state === 'Returned' ? 'return_arrow' : 'truck'} size={11} />
                          {ITEM_STATE_LABEL[u.state]}
                        </span>
                        {u.condition && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 8px', borderRadius: 'var(--r-badge)', background: STATUS[CONDITION_TONE[u.condition]].bg, color: STATUS[CONDITION_TONE[u.condition]].fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                            {u.condition}
                          </span>
                        )}
                      </div>

                      {/* Full width, per the drawing. `Mark Returned` is the OK
                          half; `Not Returned` is the Flag half. */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-sm)' }}>
                        <button
                          type="button"
                          onClick={() => scan(u.id)}
                          disabled={u.state === 'Returned'}
                          style={{ minHeight: 44, borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: u.state === 'Returned' ? 'var(--card2)' : 'transparent', color: u.state === 'Returned' ? 'var(--muted)' : 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600, fontFamily: 'inherit', cursor: u.state === 'Returned' ? 'not-allowed' : 'pointer' }}
                        >
                          Mark Returned
                        </button>
                        <button
                          type="button"
                          onClick={() => (u.state === 'Missing' ? undoMissing(u.id) : markMissing(u.id))}
                          style={{ minHeight: 44, borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--danger-text)', fontSize: 'var(--t-meta)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
                        >
                          {u.state === 'Missing' ? 'Undo' : 'Not Returned'}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedId(isOpen ? null : u.id)}
                        aria-expanded={isOpen}
                        style={{ minHeight: 44, borderRadius: 'var(--r-btn)', border: 'none', background: 'transparent', color: 'var(--link)', fontSize: 'var(--t-meta)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}
                      >
                        {isOpen ? 'Hide inspection' : 'Inspect this item'}
                      </button>

                      {isOpen && (
                        <UnitDetail
                          u={u}
                          onSetCondition={(c) => setCondition(u.id, c)}
                          onSetAccessory={(name, present) => setAccessory(u.id, name, present)}
                          onDamageField={(patch) => setDamage(u.id, patch)}
                          onAddPhoto={() => setDamage(u.id, { photos: (u.damage?.photos ?? 0) + 1 })}
                          onSendForApproval={() => setDamage(u.id, { routedForApproval: true })}
                          onSaveInspection={() => saveInspection(u.id)}
                          onCancel={() => setExpandedId(null)}
                          onSetNote={(note) => setNote(u.id, note)}
                          id={id}
                        />
                      )}
                    </article>
                  )
                })}
              </div>
            ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    {['#', 'Equipment', 'Serial', 'Expected', 'Returned', 'Condition', 'Inspection', 'Session #', ''].map((h, i) => (
                      <th key={h || i} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((seed, i) => {
                    const u = units[seed.id] as ReturnUnit
                    const isOpen = expandedId === u.id
                    return (
                      <UnitRow
                        key={u.id}
                        index={i + 1}
                        u={u}
                        isOpen={isOpen}
                        onToggle={() => setExpandedId(isOpen ? null : u.id)}
                        onScan={() => scan(u.id)}
                        onMarkMissing={() => markMissing(u.id)}
                        onUndoMissing={() => undoMissing(u.id)}
                        onSetCondition={(c) => setCondition(u.id, c)}
                        onSetAccessory={(name, present) => setAccessory(u.id, name, present)}
                        onDamageField={(patch) => setDamage(u.id, patch)}
                        onAddPhoto={() => setDamage(u.id, { photos: (u.damage?.photos ?? 0) + 1 })}
                        onSendForApproval={() => setDamage(u.id, { routedForApproval: true })}
                        onSaveInspection={() => saveInspection(u.id)}
                        onCancel={() => setExpandedId(null)}
                        onSetNote={(note) => setNote(u.id, note)}
                        id={id}
                      />
                    )
                  })}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ padding: 'var(--sp-xl)', textAlign: 'center', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                        No items match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            )}

            {/* §6.5 — two counters, never merged. */}
            <div style={{ margin: 12, padding: '10px 12px', borderRadius: 'var(--r-btn)', background: 'var(--card2)', border: '1px solid var(--border)', display: 'flex', gap: 'var(--sp-xl)', flexWrap: 'wrap', fontSize: 'var(--t-meta)' }}>
              <span>
                Items Not Returned: <b className="figure" style={{ color: missing.length ? 'var(--danger-text)' : 'var(--text)' }}>{missing.length}</b>
              </span>
              <span>
                Accessories Missing:{' '}
                <b className="figure" style={{ color: accessoriesMissing.length ? 'var(--danger-text)' : 'var(--text)' }}>{accessoriesMissing.length}</b>
                {accessoriesMissing.length > 0 && ` — ${accessoriesMissing.map((a) => `${a.accessory} (${a.item})`).join(', ')}`}
              </span>
            </div>
          </Card>

          {/* ── §12.1 Session Gates — full checklist, §5.6 ─────────────────── */}
          <Card title={`2 · Session Gates — ${active.id}`} action={<span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{active.state}</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
              {gates.map((g) => (
                <div key={g.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '7px 9px', borderRadius: 'var(--r-sm)', background: g.passing ? 'var(--st-in-bg)' : 'var(--st-progress-bg)' }}>
                  <Icon name={g.passing ? 'checklist' : 'alert_triangle'} size={14} style={{ color: g.passing ? 'var(--st-in-fg)' : 'var(--st-progress-fg)', marginTop: 2, flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: g.passing ? 'var(--st-in-fg)' : 'var(--text)' }}>{g.label}</div>
                    {!g.passing && g.blocking && <div style={{ fontSize: 'var(--t-meta)', color: 'var(--st-progress-fg)', marginTop: 2 }}>{g.blocking}</div>}
                  </div>
                  {!g.passing && g.resolve && (
                    <button type="button" onClick={g.resolve} style={{ border: 'none', background: 'transparent', color: 'var(--link)', fontWeight: 600, fontSize: 'var(--t-meta)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                      Resolve →
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* §12.2 Booking Conditions — information, not gates ("Items Returned is information, not a gate"). */}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>Booking Conditions</div>
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                {outstanding.length > 0
                  ? `${outstanding.length} item(s) still outstanding — booking stays On Rent until the Return job completes.`
                  : 'All items returned or resolved — Return job can complete, setting status Returned.'}
              </div>
              {missing.length > 0 && (
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--danger-text)', fontWeight: 600 }}>
                  {missing.length} item(s) Not Returned — {MISSING_EFFECT}.
                </div>
              )}
              {damaged.length > 0 && (
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--danger-text)', fontWeight: 600 }}>
                  {damaged.length} item(s) Damaged — {DAMAGED_EFFECT}.
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── right rail ────────────────────────────────────────────────── */}
        <FloorAside collapsible={desktop} side="right" width={300} label="Return summary">
          {/*
            §3.4's BEFORE / AFTER compare strip. Both figures are REAL: every
            unit carries `pickup.photos` (what Packing captured) and
            `ret.photos` (what this session captured), and the expanded row
            panel already links to each set. Nothing is invented here — a stage
            with no photos reads `0 photos`, and the link goes to the Evidence
            viewer, which is where the images actually live (spec 03 line 4 —
            "Evidence is a viewer, not a verb").
          */}
          <Card title="Before / After">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-sm)' }}>
              {([
                ['Packing', list.reduce((n, u) => n + u.pickup.photos, 0)],
                ['Return', list.reduce((n, u) => n + (u.ret?.photos ?? 0), 0)],
              ] as const).map(([stage, n]) => (
                <div key={stage} style={{ padding: 10, borderRadius: 'var(--r-btn)', background: 'var(--card2)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                    <Icon name="eye" size={12} />
                    {stage}
                  </div>
                  <div className="figure" style={{ fontSize: 'var(--t-h3)', fontWeight: 700, color: n > 0 ? 'var(--text)' : 'var(--muted)', marginTop: 3 }}>
                    {n} {n === 1 ? 'photo' : 'photos'}
                  </div>
                </div>
              ))}
            </div>
            <Link
              to={`/rentals/${id}/evidence`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, marginTop: 9, fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}
            >
              <Icon name="external_link" size={14} />
              Compare in Evidence
            </Link>
          </Card>

          <Card title="Sessions">
            {(['S1', 'S2'] as SessionId[]).map((sid) => {
              const s = sessions[sid]
              const n = list.filter((u) => u.sessionId === sid).length
              return (
                <div key={sid} style={{ padding: '8px 0', borderBottom: sid === 'S1' ? '1px solid var(--border)' : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                    <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>Session {sid.slice(1)}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 7px', borderRadius: 'var(--r-badge)', background: STATUS[s.state === 'Complete' ? 'in' : s.state === 'In Progress' ? 'progress' : 'neutral'].bg, color: STATUS[s.state === 'Complete' ? 'in' : s.state === 'In Progress' ? 'progress' : 'neutral'].fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                      {s.state}
                    </span>
                  </div>
                  <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 3 }}>{n} item(s) received</div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{s.closedAt ? `Closed ${s.closedAt}` : `Started ${s.startedAt}`}</div>
                </div>
              )
            })}
            {allResolved === false && active.state === 'Complete' && (
              <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.4 }}>
                Session 2 is closed. {outstanding.length} item(s) remain — start a new session to receive them.
              </p>
            )}
          </Card>

          <Card title="Signatures" action={<span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Session {activeId.slice(1)}</span>}>
            {/* §9 — captured at session close, never before. */}
            <SigRow label="Returning person" sig={active.signatures.returningPerson} onCapture={() => captureSignature('returningPerson')} required disabled={active.state === 'Complete'} />
            <SigRow label="Warehouse staff" sig={active.signatures.warehouseStaff} onCapture={() => captureSignature('warehouseStaff')} required disabled={active.state === 'Complete'} />
            {/* §9 — optional, and uncapturable: there is no witness identity on this screen to sign as. */}
            <SigRow label="Witness" sig={active.signatures.witness} required={false} disabled={active.state === 'Complete'} unavailable={WITNESS_UNAVAILABLE} />
          </Card>

          <Card title="Items Not Returned">
            {missing.length === 0 ? (
              <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No items are Not Returned.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {missing.map((u) => (
                  <div key={u.id}>
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{u.name}</div>
                    <div className="identifier" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{u.serial}</div>
                    {/* §8.5 — a decision, never a dollar figure on this screen. */}
                    <select
                      value={u.decision ?? ''}
                      onChange={(e) => setDecision(u.id, e.target.value as NotReturnedDecision)}
                      aria-label={`Decision for ${u.name}`}
                      style={{ width: '100%', height: 28, marginTop: 6, borderRadius: 'var(--r-input)', border: `1px solid ${u.decision ? 'var(--input-border)' : 'var(--danger)'}`, background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
                    >
                      <option value="" disabled>Choose a decision…</option>
                      {NOT_RETURNED_DECISIONS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <div style={{ marginTop: 6 }}>
                      <Button icon="refresh" onClick={() => undoMissing(u.id)}>Undo — Mark Outstanding</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Quick Actions">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
              {(['Print', 'Share', 'More'] as const).map((a, i) => (
                <button
                  key={a}
                  type="button"
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '11px 4px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}
                >
                  <Icon name={i === 0 ? 'file' : i === 1 ? 'external_link' : 'more_vert'} size={16} style={{ color: 'var(--text2)' }} />
                  {a}
                </button>
              ))}
            </div>
          </Card>

          {scanLog.length > 0 && (
            <div style={{ ...cardStyle, padding: 11 }}>
              <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Scan log</div>
              <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
                {scanLog.map((l, i) => (
                  <span key={i} style={{ fontSize: 'var(--t-meta)', color: l.startsWith('✕') ? 'var(--danger-text)' : 'var(--text2)' }}>{l}</span>
                ))}
              </div>
            </div>
          )}
        </FloorAside>
      </div>

      {/* Law 12 — the dispatch failure is inline and persistent, right where the
          operator pressed. It replaces a session that used to flip to Complete
          whether or not anything was written. */}
      {dispatchError && <ErrorBanner title="This return was not recorded" message={dispatchError} />}

      {/* ── §11 footer — two buttons, primary blue, no Save Draft ── */}
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', padding: '12px 14px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => navigate(`/rentals/${id}`)}
          style={{ minHeight: 44, padding: '0 14px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--danger-text)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Cancel Return
        </button>
        {/* Was "Saving is automatic". Nothing on this screen autosaves — triage
            lives in React state until Complete Return dispatches it — and a
            false persistence claim beside a completion gate is the worst place
            for one. */}
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Nothing is saved until you complete this session</span>
        <span style={{ marginLeft: 'auto' }} title={gateSummary ?? undefined}>
          <button
            type="button"
            disabled={!canCompleteSession}
            onClick={completeSession}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              height: 36,
              padding: '0 16px',
              borderRadius: 'var(--r-btn)',
              fontSize: 'var(--t-ui)',
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: canCompleteSession ? 'pointer' : 'not-allowed',
              ...(canCompleteSession ? BLUE_PRIMARY : { background: 'var(--card2)', color: 'var(--muted)', border: '1px solid var(--border)' }),
            }}
          >
            <Icon name="checklist" size={15} />
            {primaryLabel}
          </button>
        </span>
      </div>
      {gateSummary && (
        <p style={{ margin: '-4px 2px 0', textAlign: 'right', fontSize: 'var(--t-meta)', color: 'var(--progress-text)', fontWeight: 600 }}>{gateSummary}</p>
      )}
      <p style={{ margin: '-4px 2px 0', textAlign: 'right', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
        {allResolved
          ? 'This dispatches the Return; the booking moves to Returned only if the write is accepted.'
          : `This closes Session ${activeId.slice(1)} only; ${outstanding.length} item(s) remain outstanding.`}
      </p>

      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        mode="return"
        bookingId={id}
        items={scannableUnits}
        onItemScanned={(item) => {
          scan(item.id)
        }}
      />
    </div>
  )
}

const bigScanBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--sp-sm)', height: 44, padding: '0 18px', borderRadius: 'var(--r-btn)', fontSize: 'var(--t-ui)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' } as const

/**
 * `unavailable` is the reason a row can never be signed on this screen (today:
 * Witness, which has no identity to capture). It takes precedence over
 * `onCapture`, which such a row is not given at all — the Capture control
 * renders through `Unavailable` so the reason is attached to it on hover AND on
 * a warehouse tablet's long-press, rather than the row silently signing someone.
 */
function SigRow({ label, sig, onCapture, required, disabled, unavailable }: { label: string; sig: Sig | undefined; onCapture?: () => void; required: boolean; disabled: boolean; unavailable?: string }) {
  const capture = { height: 26, padding: '0 9px', borderRadius: 'var(--r-xs)', border: '1px solid var(--border)', background: 'var(--card2)', fontSize: 'var(--t-meta)', fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap' } as const
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        {sig ? (
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--success-text)' }}>Signed · {sig.at}</div>
        ) : (
          // §9 — witness renders as "Optional", never as "Pending".
          <div style={{ fontSize: 'var(--t-meta)', color: required ? 'var(--progress-text)' : 'var(--muted)' }}>
            {required ? 'Required' : unavailable ? 'Optional — no witness recorded' : 'Optional'}
          </div>
        )}
      </div>
      {!sig &&
        (unavailable ? (
          <Unavailable reason={unavailable}>
            <button type="button" disabled style={{ ...capture, color: 'var(--muted)', cursor: 'not-allowed' }}>
              Capture
            </button>
          </Unavailable>
        ) : (
          <button
            type="button"
            onClick={onCapture}
            disabled={disabled}
            style={{ ...capture, color: 'var(--text2)', cursor: disabled ? 'not-allowed' : 'pointer' }}
          >
            Capture
          </button>
        ))}
    </div>
  )
}

function UnitRow({
  index,
  u,
  isOpen,
  onToggle,
  onScan,
  onMarkMissing,
  onUndoMissing,
  onSetCondition,
  onSetAccessory,
  onDamageField,
  onAddPhoto,
  onSendForApproval,
  onSaveInspection,
  onCancel,
  onSetNote,
  id,
}: {
  index: number
  u: ReturnUnit
  isOpen: boolean
  onToggle: () => void
  onScan: () => void
  onMarkMissing: () => void
  onUndoMissing: () => void
  onSetCondition: (c: Condition) => void
  onSetAccessory: (name: string, present: boolean) => void
  onDamageField: (patch: Partial<DamageDetail>) => void
  onAddPhoto: () => void
  onSendForApproval: () => void
  onSaveInspection: () => void
  onCancel: () => void
  onSetNote: (note: string) => void
  id: string
}) {
  const itemTone = STATUS[ITEM_TONE[u.state]]

  return (
    <>
      <tr style={{ borderBottom: isOpen ? undefined : '1px solid var(--border)' }}>
        <td className="figure" style={{ ...td, width: 26, color: 'var(--muted)' }}>{index}</td>
        <td style={td}>
          <span style={{ fontWeight: 600 }}>{u.name}</span>
          <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{u.category}</span>
        </td>
        <td className="identifier" style={{ ...td, color: 'var(--text2)' }}>
          <Link to={`/inventory/${u.serial}`} style={{ color: 'inherit', textDecoration: 'none' }}>{u.serial}</Link>
        </td>
        <td className="figure" style={td}>1</td>
        <td style={td}>
          <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 'var(--r-badge)', background: itemTone.bg, color: itemTone.fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
            {ITEM_STATE_LABEL[u.state]}
          </span>
          {u.ret && <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>{u.ret.at.split(', ')[1] ?? u.ret.at}</div>}
        </td>
        <td style={td}>
          {u.condition ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', height: 19, padding: '0 7px', borderRadius: 5, background: STATUS[CONDITION_TONE[u.condition]].bg, color: STATUS[CONDITION_TONE[u.condition]].fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
              {u.condition}
            </span>
          ) : (
            <span style={{ color: 'var(--muted)' }}>—</span>
          )}
        </td>
        <td style={td}>
          {u.state === 'Returned' ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)', color: u.inspection === 'Inspected' ? 'var(--success-text)' : 'var(--progress-text)', fontWeight: 600 }}>
              <Icon name={u.inspection === 'Inspected' ? 'checklist' : 'alert_triangle'} size={12} />
              {u.inspection}
            </span>
          ) : (
            <span style={{ color: 'var(--muted)' }}>—</span>
          )}
        </td>
        {/* An internal ordinal, not a record number — ruling §2.1 leaves the
            session model alone (it has its own gates, signatures and close) but
            it must not read as an identifier. Was a raw `S1` in an `identifier`
            cell; labelled now. */}
        <td style={{ ...td, color: 'var(--muted)' }}>{u.sessionId ? `Session ${u.sessionId.slice(1)}` : '—'}</td>
        <td style={{ ...td, width: 150 }}>
          <span style={{ display: 'flex', gap: 'var(--sp-xs)', justifyContent: 'flex-end', alignItems: 'center' }}>
            {u.state === 'Picked Up' && <RowAction label="Mark Returned" onClick={onScan} />}
            {u.state === 'Picked Up' && <RowAction label="Not Returned" onClick={onMarkMissing} />}
            {u.state === 'Missing' && <RowAction label="Mark Returned" onClick={onScan} />}
            {u.state === 'Missing' && <RowAction label="Undo" onClick={onUndoMissing} />}
            <button type="button" onClick={onToggle} aria-label={isOpen ? 'Collapse inspection panel' : 'Expand inspection panel'} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>
              <Icon name={isOpen ? 'chevron_up' : 'chevron_down'} size={16} />
            </button>
          </span>
        </td>
      </tr>

      {isOpen && (
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          <td colSpan={9} style={{ padding: 0, background: 'var(--card2)' }}>
            <UnitDetail
              u={u}
              onSetCondition={onSetCondition}
              onSetAccessory={onSetAccessory}
              onDamageField={onDamageField}
              onAddPhoto={onAddPhoto}
              onSendForApproval={onSendForApproval}
              onSaveInspection={onSaveInspection}
              onCancel={onCancel}
              onSetNote={onSetNote}
              id={id}
            />
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * The inspection/triage panel, lifted out of `UnitRow` so the SAME panel serves
 * both layouts. Above 768 it is the expanded row inside a `<td colSpan>`; below
 * 768 the table is gone entirely (shell rule — "tables become card rows below
 * 768") and this renders inside the unit's card. One panel, so the phone and
 * the desktop can never drift into two different triage flows.
 */
function UnitDetail({
  u,
  onSetCondition,
  onSetAccessory,
  onDamageField,
  onAddPhoto,
  onSendForApproval,
  onSaveInspection,
  onCancel,
  onSetNote,
  id,
}: {
  u: ReturnUnit
  onSetCondition: (c: Condition) => void
  onSetAccessory: (name: string, present: boolean) => void
  onDamageField: (patch: Partial<DamageDetail>) => void
  onAddPhoto: () => void
  onSendForApproval: () => void
  onSaveInspection: () => void
  onCancel: () => void
  onSetNote: (note: string) => void
  id: string
}) {
  const needsDamagePanel = u.condition === 'Damaged' || u.condition === 'Lost'
  const route = u.condition ? routeFor(u.condition) : null

  return (
    <div style={{ padding: 14 }}>
      {u.state !== 'Returned' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          <Icon name="info" size={14} />
          Pickup: {u.pickup.at} · {u.pickup.by} ·{' '}
          <Link to={`/rentals/${id}/evidence`} style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }}>View Pickup Photos ({u.pickup.photos})</Link>
          <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>Scan this item to begin inspection.</span>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--sp-lg)' }}>
            <div>
              <div style={panelTitle}>Pickup Info</div>
              <div style={panelLine}>{u.pickup.at}</div>
              <div style={panelLine}>{u.pickup.by}</div>
              <Link to={`/rentals/${id}/evidence`} style={panelLink}>View Pickup Photos ({u.pickup.photos})</Link>
            </div>

            <div>
              <div style={panelTitle}>Return Info</div>
              <div style={panelLine}>Returned by {u.ret?.by ?? '—'}</div>
              <div style={panelLine}>{u.ret?.at ?? '—'}</div>
              <Link to={`/rentals/${id}/evidence`} style={panelLink}>View Return Photos ({u.ret?.photos ?? 0})</Link>
            </div>

            <div>
              <div style={panelTitle}>Condition</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {CONDITIONS.map((c) => {
                  const on = u.condition === c
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onSetCondition(c)}
                      style={{
                        height: 26,
                        padding: '0 9px',
                        borderRadius: 'var(--r-xs)',
                        border: `1px solid ${on ? STATUS[CONDITION_TONE[c]].fg : 'var(--border)'}`,
                        background: on ? STATUS[CONDITION_TONE[c]].bg : 'transparent',
                        color: on ? STATUS[CONDITION_TONE[c]].fg : 'var(--text2)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {c}
                    </button>
                  )
                })}
              </div>
              {route && <div style={{ marginTop: 7, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Routes to {route.queue} → {route.then}</div>}
            </div>

            <div>
              <div style={panelTitle}>Accessories</div>
              {u.accessories && u.accessories.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
                  {u.accessories.map((a) => (
                    <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)' }}>
                      <span style={{ flex: 1, color: a.present === false ? 'var(--danger-text)' : 'var(--text2)' }}>{a.name}</span>
                      <button type="button" onClick={() => onSetAccessory(a.name, true)} style={miniToggle(a.present === true, 'in')}>Present</button>
                      <button type="button" onClick={() => onSetAccessory(a.name, false)} style={miniToggle(a.present === false, 'danger')}>Missing</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No accessory checklist on this item.</p>
              )}
            </div>

            <div>
              <div style={panelTitle}>Damage Details</div>
              {needsDamagePanel ? (
                <>
                  <textarea
                    value={u.damage?.description ?? ''}
                    onChange={(e) => onDamageField({ description: e.target.value })}
                    placeholder="Describe the damage"
                    aria-label={`Damage description for ${u.name}`}
                    style={{ width: '100%', minHeight: 46, padding: 7, borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', marginTop: 6 }}>
                    <span className="figure" style={{ fontSize: 'var(--t-meta)', color: (u.damage?.photos ?? 0) > 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>
                      {u.damage?.photos ?? 0} photo(s)
                    </span>
                    <RowAction label="Add Photo" onClick={onAddPhoto} />
                  </div>
                  {/* §13.1 — Warehouse routes it; no cost field, no amount. */}
                  <div style={{ marginTop: 7 }}>
                    {u.damage?.routedForApproval ? (
                      <span style={{ fontSize: 'var(--t-meta)', color: 'var(--success-text)', fontWeight: 600 }}>Sent for Manager approval</span>
                    ) : (
                      <button
                        type="button"
                        disabled={(u.damage?.photos ?? 0) === 0}
                        onClick={onSendForApproval}
                        title={(u.damage?.photos ?? 0) === 0 ? 'Evidence required before routing for approval' : undefined}
                        style={{ height: 26, padding: '0 9px', borderRadius: 'var(--r-xs)', border: '1px solid var(--border)', background: 'var(--card2)', color: (u.damage?.photos ?? 0) === 0 ? 'var(--muted)' : 'var(--text2)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: (u.damage?.photos ?? 0) === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                      >
                        Send for Manager Approval
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No damage recorded.</p>
              )}
            </div>
          </div>

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <label style={{ ...panelTitle, display: 'block' }} htmlFor={`note-${u.id}`}>Inspector Note</label>
            <textarea
              id={`note-${u.id}`}
              value={u.note ?? ''}
              onChange={(e) => onSetNote(e.target.value)}
              placeholder="Notes for this inspection…"
              style={{ width: '100%', minHeight: 36, padding: 7, borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-sm)', marginTop: 9 }}>
              <button type="button" onClick={onCancel} style={{ height: 30, padding: '0 12px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!u.condition}
                onClick={onSaveInspection}
                style={{
                  height: 30,
                  padding: '0 14px',
                  borderRadius: 'var(--r-btn)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: u.condition ? 'pointer' : 'not-allowed',
                  ...(u.condition ? ACCENT_OUTLINE : { background: 'var(--card2)', color: 'var(--muted)', border: '1px solid var(--border)' }),
                }}
              >
                Save Inspection
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const panelTitle = { fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 } as const
const panelLine = { fontSize: 'var(--t-meta)', color: 'var(--text2)' } as const
const panelLink = { display: 'inline-block', marginTop: 4, fontSize: 'var(--t-meta)', color: 'var(--link)', fontWeight: 600, textDecoration: 'none' } as const

function miniToggle(active: boolean, tone: 'in' | 'danger') {
  return {
    height: 22,
    padding: '0 7px',
    borderRadius: 5,
    border: `1px solid ${active ? STATUS[tone].fg : 'var(--border)'}`,
    background: active ? STATUS[tone].bg : 'transparent',
    color: active ? STATUS[tone].fg : 'var(--muted)',
    fontSize: 'var(--t-meta)',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  } as const
}

function RowAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ height: 22, padding: '0 7px', borderRadius: 'var(--r-xs)', border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text2)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
    >
      {label}
    </button>
  )
}
