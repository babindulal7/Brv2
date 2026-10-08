import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, Button, cardStyle } from '../../components/ui/Page'
import { FloorAside } from '../operations/FloorAside'
import { ErrorBanner } from '../../components/ui/StateViews'
import { PageBody } from '../../components/ui/PageBody'
import { isStaff } from '../../lib/rbac'
import { Unavailable } from '../../components/ui/Unavailable'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'

export interface HandoverWorkspaceProps {
  loading?: boolean | undefined
  error?: string | null | undefined
  onRetry?: (() => void) | undefined
}
import { STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import { statusToken } from '../../lib/workflow'
import type { BookingStatus, Flag, ItemState } from '../../lib/workflow'
import { BarcodeScannerModal } from '../../components/ui/BarcodeScannerModal'
import { toBs, formatBs, formatAd, formatAdDateTime as formatClosedAt } from '../../lib/bs'
import { BOOKING } from '../../data/booking'
import { PACKAGE } from '../../data/packing'
import {
  UNITS as SEED_UNITS,
  SESSIONS as SEED_SESSIONS,
  TOTAL_ITEMS,
  CASES,
  FILTERS,
  ITEM_STATE_LABEL,
  DELIVERY,
  DELIVERY_FIELDS,
  driverSignatureRequired,
  RECEIVER,
  DOCUMENTS,
  TIMELINE,
  PARTIAL_PICKUP_EFFECT,
  EVIDENCE_MIN_PHOTOS_PER_CASE,
  ACTIVE_SESSION,
} from '../../data/handover'
import type { HandoverUnit, HandoverSession, SessionId, Sig } from '../../data/handover'
import { BookingNotLoaded } from '../operations/BookingNotLoaded'

/**
 * **Handover Workspace** — `Handover Workflow.md` v1.1 (Build Locked).
 *
 * Built from the module's own §0 corrections, not the reference render, per
 * Foundation §0 ("a render is evidence of intent, not authority") — the same
 * rule `PackingWorkspace.tsx` and `ReturnWorkspace.tsx` already build from.
 * `../../data/handover.ts`'s file header carries the full accounting; the
 * corrections that shape this component:
 *
 *  · **Gates split in two (§0 #1, §11).** `Items Handed Over` cannot gate
 *    `Complete Session` — session 1 could never close otherwise. This
 *    component keeps the six Session Gates (§11.1) separate from the booking
 *    condition (§11.2), which is rendered as information, never a gate.
 *  · **Primary button reads `Complete Session`, becoming `Complete Handover`
 *    on the session that takes the last item out** (§0 #2, §12) — one label,
 *    computed from whether anything remains after this session, never a
 *    second button.
 *  · **§14 — timeline chronology.** The render times `Booking Confirmed`
 *    after `Packing Completed` the same morning. `handover.ts`'s `TIMELINE`
 *    is seeded in true order and asserted ascending at load; this component
 *    only reverses it for *display*.
 *  · **§6.2 — inapplicable delivery fields hidden everywhere, including the
 *    summary.** The render prints `Vehicle –` on a Customer Pickup. Nothing
 *    here has a vehicle value to show badly — `DELIVERY_FIELDS` decides what
 *    renders, and a Customer Pickup was never given a vehicle field at all.
 *  · **§0 #8 — ungenerated documents carry no action.** Delivery Note shows
 *    its state and nothing else while `Not Generated`.
 *
 * **No money, anywhere.** Foundation §8.3: *"Warehouse sees no monetary value
 * anywhere, including inside a gate checklist."* This is a warehouse floor
 * screen, matching `ReturnWorkspace.tsx`'s identical rule for this booking's
 * other session-based job. `lib/money.ts` is not imported; no Rs figure
 * appears anywhere. The render's Payment Summary card and the `Outstanding`
 * rupee figure in the booking strip are **omitted entirely**, not masked —
 * the 5 Aug whole-app review named exactly this class of defect: a money
 * field shown as "(masked)" still violates §8.3, which requires the field
 * **absent**. `paymentVerified` / `depositReceived` below are booleans; the
 * failing-gate text reads "Payment required" / "Deposit required" with no
 * amount, per §5.6's role-masking note and §13.1's exact wording for these
 * two gates. Invoice and Receipt are not in `DOCUMENTS` at all, for the same
 * reason (§13.1: hidden for Warehouse; there is no role switch in this build
 * to hide them behind, so they were never modelled).
 *
 * §11.4's Manager override on gates 1/3/4 is **refused**, not implemented. It
 * was a plain reason field with no role check and no approver: `overrideApplied`
 * flipped three gates open and nothing recorded who opened them. §8.2's role set
 * has since landed (`lib/rbac`'s business 9), but no rule there covers *this*
 * override — `canPerformOperations` grants Warehouse, which §11.4 explicitly
 * forbids, and the other two are money-approval rules for other decisions — and
 * no action persists an override at all. TODO(decision): rule who may override a
 * session gate, then add the rbac predicate and a `session.override` capability
 * to `actions/core.ts`. Until then the control states why it cannot act. See the
 * long note at `OVERRIDE_UNAVAILABLE`.
 */

const BLUE_PRIMARY = { background: 'var(--cat-1)', color: '#fff', border: '1px solid transparent' } as const

/**
 * The reason the Witness row cannot be signed — see `captureSignature`. Stated on
 * the control rather than solved with a name, because the name would be invented.
 */
const WITNESS_UNAVAILABLE =
  'No witness identity is captured on this screen, so a witness signature cannot be attested here. §9.2 makes the witness optional — this session is recorded with no witness rather than with a placeholder.'

/** Same tone choice `ReturnWorkspace.tsx` makes for the identical Foundation type — solid green while a line is still out, soft green once back (§4.2). `Ready` reuses Packing's Pending yellow: work not yet done. */
const ITEM_TONE: Record<ItemState, StatusKey> = {
  Ready: 'progress',
  'Picked Up': 'out',
  Returned: 'in',
  Missing: 'danger',
}

const th = { textAlign: 'left' as const, padding: '8px 9px', fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap' as const, borderBottom: '1px solid var(--border)' }
const td = { padding: '8px 9px', fontSize: 'var(--t-meta)', color: 'var(--text)' }

interface GateRow {
  n: number
  label: string
  passing: boolean
  blocking: string | null
  overridable?: boolean
  resolve?: () => void
}

/*
 * ⭐ RULED 12 Aug 2026 (Rulings §3): operations are ROUTES, so the `embedded`
 * prop is gone with the modal it served. `/rentals/:bookingNo/handover` is the
 * only mount and works for ANY booking number.
 */
export default function HandoverWorkspace({
  loading: propLoading,
  error: propError,
  onRetry: propOnRetry,
}: HandoverWorkspaceProps = {}) {
  const navigate = useNavigate()
  const { bookingNo } = useParams()
  const id = bookingNo ?? BOOKING.no
  /** The one identity this screen's dispatches may act as. No fallback. */
  const { user } = useAuth()
  const isStaffMember = user ? isStaff(user.role) : true
  /* Law 13/14 — width decides. §3.3's tablet layout is "checklist left,
     signature full-width beneath, client as a bar on top": the client card is
     already a full-width band above the split, and the summary rail must
     REFLOW below the list rather than collapse (Rulings §7). */
  const viewport = useViewport()
  const desktop = viewport === 'desktop'
  const phone = viewport === 'phone'

  const [units, setUnits] = useState<Record<string, HandoverUnit>>(() =>
    Object.fromEntries(SEED_UNITS.map((u) => [u.id, { ...u }])),
  )
  const [showScanner, setShowScanner] = useState(false)
  const [sessions, setSessions] = useState<Record<SessionId, HandoverSession>>(() => ({
    S1: { ...SEED_SESSIONS.S1, signatures: { ...SEED_SESSIONS.S1.signatures } },
    S2: { ...SEED_SESSIONS.S2, signatures: { ...SEED_SESSIONS.S2.signatures } },
  }))
  const [casePhotos, setCasePhotos] = useState<Record<string, number>>(() => Object.fromEntries(CASES.map((c) => [c, 0])))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [govIdVerified, setGovIdVerified] = useState(false)
  const [bookingAuthVerified, setBookingAuthVerified] = useState(false)
  const [paymentVerified, setPaymentVerified] = useState(false)
  const [depositReceived, setDepositReceived] = useState(false)
  /**
   * The reason an operator would give for a §11.4 override. It is still typed
   * here, and still shown back, but nothing consumes it — see
   * `OVERRIDE_UNAVAILABLE` and the block above `applyOverride`'s former home.
   * There is deliberately no `overrideApplied` state any more: it was the flag
   * three gates fell open on with nobody named against it.
   */
  const [overrideReason, setOverrideReason] = useState('')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')
  const [query, setQuery] = useState('')
  const [scanLog, setScanLog] = useState<string[]>([])
  /**
   * Why a dispatch failure needs somewhere to be rendered.
   *
   * `handoverRental` is a real write now, and its failure used to be reported
   * only by `console.error('handover failed:', err)` on a floating promise —
   * while `handOver` flipped the unit to `'Picked Up'` and wrote
   * `✓ … handed over` into the scan log SYNCHRONOUSLY, before the dispatch had
   * settled. So a unit read as handed over, with a timestamp, on a screen whose
   * write had failed — and today it always fails (the empty `lines` list is
   * refused by `validate`). Gear leaving the building is exactly the fact this
   * must not assert on its own authority.
   *
   * Law 12 — the failure is inline and persistent, and the unit flips only on a
   * resolved promise.
   */
  const [dispatchError, setDispatchError] = useState<string | null>(null)

  const activeId: SessionId = ACTIVE_SESSION
  const active = sessions[activeId]

  const list = SEED_UNITS.map((u) => units[u.id] as HandoverUnit)
  const pickedUp = list.filter((u) => u.state === 'Picked Up')
  const remaining = list.filter((u) => u.state === 'Ready')
  const missing = list.filter((u) => u.state === 'Missing')
  const missingResolved = missing.filter((u) => (u.reason ?? '').trim().length >= 10)
  /** §11.2 — the booking condition, information only: does anything remain after this session? */
  const allResolved = remaining.length === 0 && missing.length === missingResolved.length
  const pct = Math.round((pickedUp.length / TOTAL_ITEMS) * 100)

  const bookingStatus: BookingStatus = allResolved ? 'On Rent' : 'Packed'
  const flags: Flag[] = allResolved ? [] : ['Partial Pickup']
  const paymentState = paymentVerified && depositReceived ? 'Cleared' : 'Due'

  /*
   * §11.1 gate 2 — "Every item **in this session** scanned, or marked Missing
   * with a reason." Not every item on the booking: an item nobody has
   * touched yet just stays Remaining for a later session (§2.1 — staggered
   * collection "must not require a second booking"). Only lines this session
   * has actually resolved (`sessionId === activeId`) can fail this gate, and
   * only by carrying too short a reason.
   */
  const sessionTouched = list.filter((u) => u.sessionId === activeId)
  const sessionMissingShort = sessionTouched.filter((u) => u.state === 'Missing' && (u.reason ?? '').trim().length < 10)
  const itemsPassing = sessionMissingShort.length === 0

  const casesNeeded = CASES.filter((c) => remaining.some((u) => u.case === c) || sessionTouched.some((u) => u.case === c))
  const casesWithoutPhoto = casesNeeded.filter((c) => (casePhotos[c] ?? 0) < EVIDENCE_MIN_PHOTOS_PER_CASE)

  const driverNeeded = driverSignatureRequired(DELIVERY.method)
  /*
   * ⭐ 12 Aug 2026 — `|| overrideApplied` is gone from all three.
   *
   * These gates now pass only on the fact each one is about: the receiver's ID
   * and authorization actually checked, payment actually cleared, deposit
   * actually received. An override can no longer stand in for any of them,
   * because the override recorded nobody — see `OVERRIDE_UNAVAILABLE`.
   *
   * Nothing is bricked by this: gate 1 is cleared by the two verification
   * checkboxes above, and gates 3 and 4 keep their `Mark Cleared →` resolve.
   */
  const receiverPassing = govIdVerified && bookingAuthVerified
  const paymentPassing = paymentVerified
  const depositPassing = depositReceived
  const signaturesPassing = Boolean(active.signatures.receiver) && Boolean(active.signatures.warehouse) && (!driverNeeded || Boolean(active.signatures.driver))
  const evidencePassing = casesWithoutPhoto.length === 0

  const set = (uid: string, patch: Partial<HandoverUnit>) => setUnits((p) => ({ ...p, [uid]: { ...(p[uid] as HandoverUnit), ...patch } }))

  const handOver = (uid: string) => {
    const u = units[uid] as HandoverUnit
    if (u.state === 'Picked Up') {
      setScanLog((p) => [`• ${u.name} already handed over at ${u.handoverAt ?? '—'}`, ...p].slice(0, 5))
      return
    }
    // ⚠ The flip and the log line are INSIDE `.then`. They used to bracket the
    // dispatch synchronously, so the unit read as handed over before the write
    // had settled — and stayed that way when it failed.
    dispatchHandover()
      .then(() => {
        set(uid, { state: 'Picked Up', sessionId: activeId, handoverAt: '02:15 PM' })
        setScanLog((p) => [`✓ ${u.name} (${u.serial}) handed over`, ...p].slice(0, 5))
      })
      .catch((err: unknown) => {
        console.error('handover failed:', err)
        const message = err instanceof Error ? err.message : String(err)
        setDispatchError(message)
        setScanLog((p) => [`✕ ${u.name} (${u.serial}) NOT handed over — nothing was recorded`, ...p].slice(0, 5))
      })
  }

  /*
   * ⚠ This used to be two dispatches per bulk action, not one: `handOverMany`
   * called `handOver` for every id — each of which fired its own
   * `handoverRental` — and THEN fired a second one for the whole array. Four
   * selected units produced five dispatches covering the same units. While the
   * action was a stub that was five identical refusals; now that it writes, it
   * would be a real double count in `session_line_movements`. The bulk path
   * therefore no longer dispatches at all — `handOver` is the single writer.
   *
   * `lines` is deliberately empty, and `unitIds`/`sessionId` are gone from the
   * input entirely. This workspace's unit ids come from `data/handover`'s
   * hardcoded UNITS, not from `booking_lines`/`product_units`, so there is
   * nothing true to send and `handoverRental`'s own `validate` refuses it —
   * the same shape, and the same reason, as `MovementList`'s empty unit list.
   * `sessionId` was never the caller's to choose either: `operation_sessions`
   * is opened by the action, and `session_no` is read from the booking's
   * existing sessions (0003:85). Supplying real ids needs this screen converted
   * onto `useList`, which is its own task.
   */
  const dispatchHandover = (occurredAt?: string): Promise<unknown> => {
    if (!user) {
      // Rejected rather than swallowed: the caller decides what the operator
      // sees, and "no session" must not read as a completed handover.
      return Promise.reject(
        new Error('You are not signed in, so this handover cannot be recorded against anyone. Nothing was written.'),
      )
    }
    setDispatchError(null)
    return import('../../actions/rentals').then((m) =>
      m.handoverRental(
        { bookingId: id, lines: [], ...(occurredAt === undefined ? {} : { occurredAt }) },
        { userId: user.id, role: user.role },
      ),
    )
  }

  const handOverMany = (ids: string[]) => {
    ids.forEach((uid) => handOver(uid))
    setSelected(new Set())
  }

  const markMissing = (uid: string) => {
    const u = units[uid] as HandoverUnit
    set(uid, { state: 'Missing', sessionId: activeId })
    setScanLog((p) => [`✕ ${u.name} marked Missing — reason required`, ...p].slice(0, 5))
  }

  const undo = (uid: string) =>
    setUnits((p) => {
      // exactOptionalPropertyTypes — clearing session/handover/reason means
      // *omitting* the keys, never assigning them `undefined` (same pattern
      // `ReturnWorkspace.tsx`'s `undoMissing` uses).
      const { sessionId: _sessionId, handoverAt: _handoverAt, reason: _reason, ...rest } = p[uid] as HandoverUnit
      return { ...p, [uid]: { ...rest, state: 'Ready' as ItemState } }
    })

  const setReason = (uid: string, reason: string) => set(uid, { reason })

  const toggleSelect = (uid: string) =>
    setSelected((p) => {
      const next = new Set(p)
      next.has(uid) ? next.delete(uid) : next.add(uid)
      return next
    })

  /**
   * ⭐ 12 Aug 2026 — the witness is gone from here, and cannot come back by accident.
   *
   * `names.witness` was the literal string `'Witness'`. Pressing Capture on the
   * Witness row therefore signed the handover attestation with a placeholder, so
   * the session read as **witnessed** when nobody witnessed it. A placeholder in
   * a signature block is not a blank: it is a claim that someone stood there.
   *
   * This screen captures no witness identity anywhere — no field, no picker, and
   * `HandoverSession` names only the receiver, the warehouse staff and (when the
   * delivery method needs one) the driver. §9.2 already makes the witness
   * OPTIONAL, so absent is the honest state; the role union below no longer
   * admits `witness`, and the Witness row's Capture control is `Unavailable`
   * with its reason attached.
   *
   * The three remaining names are read off real records — the booking's receiver,
   * the session's warehouse staff, the delivery's pickup person — never typed here.
   */
  const captureSignature = (role: 'receiver' | 'warehouse' | 'driver') => {
    const names: Record<typeof role, string> = { receiver: RECEIVER.receiver, warehouse: active.warehouseStaff, driver: DELIVERY.pickupPerson }
    const roleLabel: Record<typeof role, string> = { receiver: 'Receiver', warehouse: 'Warehouse', driver: 'Driver' }
    setSessions((p) => ({
      ...p,
      [activeId]: {
        ...(p[activeId] as HandoverSession),
        signatures: { ...(p[activeId] as HandoverSession).signatures, [role]: { name: names[role], role: roleLabel[role], at: '16 Jul 2026, 02:20 PM' } },
      },
    }))
  }

  /*
   * ⭐ 12 Aug 2026 — `applyOverride` is REFUSED, not repaired. TODO(decision).
   *
   * It used to read, in full:
   *
   *     const applyOverride = () => {
   *       if (overrideReason.trim().length < 10) return
   *       setOverrideApplied(true)
   *       setScanLog((p) => [`⚠ Manager override applied — ${reason}`, ...p])
   *     }
   *
   * — no approver identity, no dispatch, no write. Three session gates (Receiver
   * Verified, Payment Verified, Deposit Received) fell open on that one boolean,
   * and the log line said "Manager override applied" without naming a manager.
   * An override IS an accountability record: naming who authorised bypassing a
   * gate is its entire purpose. Gates that fall open with no record are worse
   * than gates that stay shut, so they now stay shut.
   *
   * Two things are missing, and neither may be invented here (CLAUDE.md: "Never
   * invent a product decision to unblock yourself"):
   *
   *  1. **No rule says who may override a session gate.** `lib/rbac` holds
   *     `canOverrideCreditLimit` (a *client credit limit*), `canApproveDiscount`
   *     (a *discount percentage*) and `canPerformOperations` — and that last one
   *     grants Warehouse and Technician, which §11.4 printed on this very screen
   *     explicitly forbids ("Owner / Manager only… Warehouse cannot override").
   *     Borrowing the credit-limit rule would be ruling that credit-limit
   *     authority IS handover-gate authority. That is a ruling, not a fix.
   *     TODO(decision): rule who may override a session gate; then add the rbac
   *     predicate and a `session.override` capability to `checkCapability` in
   *     `src/actions/core.ts`, which today denies any capability it has no rule for.
   *  2. **Nothing persists an override.** There is no override action anywhere
   *     under `src/actions/`, so an applied override lived only in this
   *     component's state for as long as the tab stayed open. The helper text's
   *     "written to audit" was simply false, and is corrected below.
   *
   * The reason field stays — it is real input, and an operator can still see what
   * they would be recording — but the control refuses and says why (Law 12,
   * inline and persistent), rather than opening three gates against nobody.
   */
  const OVERRIDE_UNAVAILABLE =
    'A manager override cannot be applied: no rule defines who may override a session gate, and no action records the approver, so applying one would open three gates with nobody named against them. Clear the gates themselves instead.'

  /* ── §11.1 — all six Session Gates, shown in full per §5.6, none of them a money amount ── */
  const gates: GateRow[] = [
    { n: 1, label: 'Receiver Verified', passing: receiverPassing, blocking: receiverPassing ? null : 'Government ID and booking authorization not verified', overridable: true },
    {
      n: 2,
      label: 'Items Scanned This Session',
      passing: itemsPassing,
      blocking: itemsPassing ? null : `${sessionMissingShort.length} missing item${sessionMissingShort.length > 1 ? 's' : ''} need a reason of at least 10 characters`,
    },
    // §13.1 — "the payment and deposit gates render as Payment cleared / Deposit cleared… no amounts."
    // §13 — a Manager or Billing user clears the gate directly; `resolve` stands in for that role's action (no role switch exists in this build). A Manager can also override (below) rather than clear.
    { n: 3, label: 'Payment Verified', passing: paymentPassing, blocking: paymentPassing ? null : 'Payment required', overridable: true, ...(paymentVerified ? {} : { resolve: () => setPaymentVerified(true) }) },
    { n: 4, label: 'Deposit Received', passing: depositPassing, blocking: depositPassing ? null : 'Deposit required', overridable: true, ...(depositReceived ? {} : { resolve: () => setDepositReceived(true) }) },
    { n: 5, label: 'Signatures Complete', passing: signaturesPassing, blocking: signaturesPassing ? null : 'Required signatures not yet captured' },
    {
      n: 6,
      label: 'Evidence Captured',
      passing: evidencePassing,
      blocking: evidencePassing ? null : `${casesWithoutPhoto.length} case${casesWithoutPhoto.length > 1 ? 's' : ''} need a photo — ${casesWithoutPhoto.join(', ')}`,
    },
  ]
  const canCompleteSession = active.state !== 'Complete' && gates.every((g) => g.passing)
  const primaryLabel = allResolved ? 'Complete Handover' : 'Complete Session'
  const newlyHandedOver = sessionTouched.filter((u) => u.state === 'Picked Up').length
  const caption = allResolved ? 'Mark items as On Rent and close the handover' : `Mark ${newlyHandedOver} item${newlyHandedOver === 1 ? '' : 's'} as On Rent`
  const gateSummary = canCompleteSession ? null : active.state === 'Complete' ? 'This session is already closed' : (gates.find((g) => !g.passing)?.blocking ?? null)
  const overridableFailing = !receiverPassing || !paymentPassing || !depositPassing

  /**
   * **The button an operator presses to finish the job.**
   *
   * It used to set React state and navigate away — no dispatch of any kind —
   * while the caption beside it said "Mark items as On Rent and close the
   * handover" and the footer said "Saving is automatic". Neither was true: the
   * stage stayed at `Packed`, no `handover_lines` row existed, and the screen
   * and the database disagreed permanently with only the database right. The
   * per-unit `handOver` above was repaired and this, the primary write, was
   * not.
   *
   * `handoverRental` is `implemented: true` on a capability that resolves, so
   * the write path exists and this is the caller that was skipping it. The
   * session flip and the `navigate` are inside `.then()` for the same reason
   * they are in `handOver`: a failed write must not read as a closed handover.
   * The failure surfaces in the existing inline `ErrorBanner` (Law 12), never a
   * toast.
   *
   * `closedAt` is the timestamp actually sent to the write, not a literal.
   * `'16 Jul 2026, 02:25 PM'` was hardcoded here and would have rendered as the
   * closing time of every handover this build ever performed.
   */
  const completeSession = () => {
    if (!canCompleteSession) return
    const occurredAt = new Date().toISOString()
    dispatchHandover(occurredAt)
      .then(() => {
        setSessions((p) => ({
          ...p,
          [activeId]: { ...(p[activeId] as HandoverSession), state: 'Complete', closedAt: formatClosedAt(occurredAt) },
        }))
        navigate(`/rentals/${id}`)
      })
      .catch((err: unknown) => {
        console.error('handover session close failed:', err)
        setDispatchError(err instanceof Error ? err.message : String(err))
      })
  }

  const pickupBs = toBs(new Date('2026-07-16'))
  const returnBs = toBs(new Date('2026-07-19'))

  const visible = SEED_UNITS.filter((u) => {
    const s = units[u.id] as HandoverUnit
    if (filter !== 'All' && s.state !== filter) return false
    if (query && !`${u.name} ${u.serial}`.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  /* ── 5-State handling ─────────────────────────────────────────────── */
  if (!isStaffMember) {
    return (
      <PageBody
        restricted={true}
        restrictedReason="Floor handover workspace is for Babin Rentals staff only."
        restrictedRequiredRole="Staff"
        noun="handover"
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
        noun="handover session"
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
        noun="handover session"
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
    return <BookingNotLoaded bookingNo={bookingNo} job="Handover" seededBookingNo={BOOKING.no} />
  }

  // Floor scale (DEVICES.md item 3) is applied automatically by route in App.tsx's Shell, not here.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {/* ── header. Rulings §4 — breadcrumbs, no `←`. ───────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-lg)', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 'var(--t-h1)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.015em' }}>
              Handover Workspace
            </h1>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)', height: 22, padding: '0 9px', borderRadius: 'var(--r-badge)', background: STATUS.out.bg, color: STATUS.out.fg, fontSize: 'var(--t-meta)', fontWeight: 700 }}>
              <Icon name="truck" size={12} />
              Equipment Out
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 'var(--r-badge)', background: STATUS[statusToken(bookingStatus)].bg, color: STATUS[statusToken(bookingStatus)].fg, fontSize: 'var(--t-meta)', fontWeight: 700 }}>
              {bookingStatus}
            </span>
            {flags.includes('Partial Pickup') && (
              <span title={PARTIAL_PICKUP_EFFECT} style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 'var(--r-badge)', background: STATUS.progress.bg, color: STATUS.progress.fg, fontSize: 'var(--t-meta)', fontWeight: 700 }}>
                Partial Pickup
              </span>
            )}
          </div>
          <p style={{ margin: '5px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            Rentals › Bookings ›{' '}
            <Link to={`/rentals/${id}`} style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }} className="identifier">
              {id}
            </Link>
            {' › Handover · '}
            {PACKAGE.name} · {BOOKING.client}
          </p>
        </div>

        <div style={{ minWidth: 260, flex: 1 }}>
          <div style={{ display: 'flex', gap: 10, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            <span>Handover Progress</span>
            <span className="figure" style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text)' }}>
              {pickedUp.length} / {TOTAL_ITEMS} ({pct}%)
            </span>
          </div>
          <div aria-hidden style={{ height: 8, borderRadius: 'var(--r-badge)', background: 'var(--card2)', marginTop: 6, overflow: 'hidden' }}>
            <div style={{ width: '100%', height: '100%', background: 'var(--success)', borderRadius: 'var(--r-badge)', transform: `scaleX(${pct / 100})`, transformOrigin: 'left', transition: 'transform var(--dur) ease' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 'var(--t-meta)', color: remaining.length ? 'var(--progress-text)' : 'var(--success-text)', fontWeight: 600 }}>
            <Icon name={remaining.length ? 'alert_triangle' : 'checklist'} size={12} />
            {remaining.length ? `${remaining.length} item${remaining.length > 1 ? 's' : ''} remaining` : 'All items handed over'}
            {missing.length > 0 && <span style={{ color: 'var(--danger-text)' }}>· {missing.length} missing</span>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
          <Link to={`/rentals/${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 'var(--r-btn)', border: '1px solid var(--btn-secondary-border)', background: 'var(--btn-secondary-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600, textDecoration: 'none' }}>
            <Icon name="external_link" size={14} />
            View Booking
          </Link>
        </div>
      </div>

      {/* ── §5 booking strip — read-only, no money (§8.3) ───────────────── */}
      <div style={{ ...cardStyle, display: 'flex', gap: 0, flexWrap: 'wrap', overflow: 'hidden' }}>
        {[
          { l: 'Client', v: BOOKING.client, big: true },
          // §5 names this slot "Outstanding"; it is a state, never an amount, on this screen (§8.3).
          { l: 'Payment', v: paymentState, tone: paymentState === 'Due' ? 'var(--danger-text)' : 'var(--success-text)' },
          { l: 'Pickup', v: pickupBs ? formatBs(pickupBs) : '—', s: `${formatAd(new Date('2026-07-16'))}, 06:00 AM` },
          { l: 'Return', v: returnBs ? formatBs(returnBs) : '—', s: `${formatAd(new Date('2026-07-19'))}, 06:00 AM` },
          { l: 'Stage', v: bookingStatus, big: true },
          { l: 'Project', v: BOOKING.kind },
          { l: 'Days', v: BOOKING.days },
          { l: 'Items', v: String(TOTAL_ITEMS) },
          { l: 'Delivery', v: DELIVERY.method },
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

      {/* ── §6.1 / §6.2 — Client & Receiver, Delivery Details ───────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--sp-md)' }}>
        <Card title="Client & Receiver">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <InfoRow label="Authorized By" value={RECEIVER.authorizedBy} />
            <InfoRow label="Receiver" value={RECEIVER.receiver} />
            <InfoRow label="Phone" value={RECEIVER.phone} />
            <InfoRow label="Email" value={RECEIVER.email} />
            <InfoRow label="Government ID" value={RECEIVER.govId} mono />
          </div>
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>Verification — Session {activeId.slice(1)}</div>
            <CheckLine label="Government ID Verified" checked={govIdVerified} onToggle={() => setGovIdVerified((v) => !v)} disabled={active.state === 'Complete'} />
            <CheckLine label="Booking Authorization Verified" checked={bookingAuthVerified} onToggle={() => setBookingAuthVerified((v) => !v)} disabled={active.state === 'Complete'} />
          </div>
        </Card>

        <Card title="Delivery / Pickup Details">
          <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px', borderRadius: 'var(--r-badge)', background: STATUS.primary.bg, color: STATUS.primary.fg, fontSize: 'var(--t-meta)', fontWeight: 700, marginBottom: 9 }}>
            {DELIVERY.method}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* §6.2 — a field with no possible value for this method is not rendered at all. */}
            {DELIVERY_FIELDS[DELIVERY.method].pickupPerson && <InfoRow label="Pickup Person" value={DELIVERY.pickupPerson} />}
            {DELIVERY_FIELDS[DELIVERY.method].pickupPerson && <InfoRow label="Phone" value={DELIVERY.pickupPersonPhone} />}
            {DELIVERY_FIELDS[DELIVERY.method].warehouseStaff && <InfoRow label="Warehouse Staff" value={DELIVERY.warehouseStaff} />}
          </div>
          {/* §0 "Landed in the build" — warehouse map replaced by an explanation card. */}
          <div style={{ marginTop: 10, padding: 10, borderRadius: 'var(--r-btn)', background: 'var(--card2)', border: '1px solid var(--border)', display: 'flex', gap: 'var(--sp-sm)', alignItems: 'flex-start' }}>
            <Icon name="info" size={14} style={{ marginTop: 1, flexShrink: 0, color: 'var(--muted)' }} />
            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{DELIVERY.note}</span>
          </div>
        </Card>
      </div>

      {/* §3.3 — gate checklist and signature on the left, client/summary on the
          right at desktop; below 1180 the right column REFLOWS beneath the
          checklist rather than collapsing to a handle (Rulings §7). */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: desktop ? 'minmax(0,1fr) auto' : '1fr',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        {/* ── main column ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
          {/* ── §7 Equipment Table ──────────────────────────────────────── */}
          <Card
            title="Equipment"
            bodyStyle={{ padding: 0 }}
            action={
              <>
                {selected.size > 0 && <Button icon="checklist" onClick={() => handOverMany([...selected])}>Hand Over Selected ({selected.size})</Button>}
                <Button icon="queues" onClick={() => setSelected(new Set(remaining.map((u) => u.id)))}>Select All Remaining</Button>
                <Button icon="queues" onClick={() => handOverMany(remaining.map((u) => u.id))}>Bulk Scan</Button>
                <Button icon="queues" onClick={() => setShowScanner(true)}>Scan Barcode</Button>
              </>
            }
          >
            <div style={{ display: 'flex', gap: 7, padding: '9px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search equipment, serial…"
                aria-label="Search equipment"
                style={{ flex: 1, minWidth: 180, height: 30, padding: '0 9px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', outline: 'none' }}
              />
              {FILTERS.map((f) => {
                const on = filter === f
                const label = f === 'All' ? 'All' : ITEM_STATE_LABEL[f]
                const count = f === 'All' ? TOTAL_ITEMS : list.filter((u) => u.state === f).length
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
                    {label} <span className="figure">{count}</span>
                  </button>
                )
              })}
            </div>

            {phone ? (
              /*
                Shell rule — "Tables become card rows below 768." Nine columns
                at 860px behind `overflowX` put the serial, the state and the
                Hand Over action off-screen on the device spec 03 calls "the
                real device here". One card per unit, one primary action.
              */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', padding: 'var(--sp-sm)' }}>
                {visible.map((seed) => {
                  const u = units[seed.id] as HandoverUnit
                  const tone = STATUS[ITEM_TONE[u.state]]
                  const canUndo = u.state !== 'Ready' && u.sessionId === activeId
                  return (
                    <article key={u.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44 }}>
                        <input
                          type="checkbox"
                          checked={selected.has(u.id)}
                          disabled={u.state !== 'Ready'}
                          onChange={() => toggleSelect(u.id)}
                          aria-label={`Select ${u.name}`}
                          style={{ width: 22, height: 22, marginTop: 2, flexShrink: 0 }}
                        />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600 }}>{u.name}</span>
                            {u.required && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', height: 15, padding: '0 5px', borderRadius: 4, background: 'var(--st-primary-bg)', color: 'var(--st-primary-fg)', fontSize: 'var(--t-meta)', fontWeight: 700 }}>
                                Required
                              </span>
                            )}
                            <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 'var(--r-badge)', background: tone.bg, color: tone.fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                              {ITEM_STATE_LABEL[u.state]}
                            </span>
                          </span>
                          <Link to={`/inventory/${u.serial}`} className="identifier" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)', textDecoration: 'none', marginTop: 2 }}>
                            {u.serial}
                          </Link>
                        </span>
                      </label>

                      <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                        {u.group}
                        {u.sessionId ? ` · Session ${u.sessionId.slice(1)}` : ''}
                        {u.state === 'Picked Up' ? ` · ${u.handoverAt}` : ''}
                      </span>

                      <span style={{ display: 'flex', gap: 'var(--sp-xs)', flexWrap: 'wrap' }}>
                        {u.state === 'Ready' && <RowAction label="Hand Over" onClick={() => handOver(u.id)} />}
                        {u.state === 'Ready' && <RowAction label="Missing" onClick={() => markMissing(u.id)} />}
                        {canUndo && <RowAction label="Undo" onClick={() => undo(u.id)} />}
                      </span>
                    </article>
                  )
                })}
                {visible.length === 0 && (
                  <p style={{ margin: 0, padding: 'var(--sp-lg)', textAlign: 'center', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                    No items match these filters.
                  </p>
                )}
              </div>
            ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                <thead>
                  <tr style={{ background: 'var(--th-bg)' }}>
                    {['', 'Equipment', 'Serial', 'Qty', 'Handover', 'Status', 'Evidence', 'Session #', ''].map((h, i) => (
                      <th key={h || i} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((seed) => {
                    const u = units[seed.id] as HandoverUnit
                    const tone = STATUS[ITEM_TONE[u.state]]
                    const canUndo = u.state !== 'Ready' && u.sessionId === activeId
                    return (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...td, width: 26 }}>
                          <input
                            type="checkbox"
                            checked={selected.has(u.id)}
                            disabled={u.state !== 'Ready'}
                            onChange={() => toggleSelect(u.id)}
                            aria-label={`Select ${u.name}`}
                          />
                        </td>
                        <td style={td}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600 }}>{u.name}</span>
                            {u.required && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', height: 15, padding: '0 5px', borderRadius: 4, background: 'var(--st-primary-bg)', color: 'var(--st-primary-fg)', fontSize: 'var(--t-meta)', fontWeight: 700 }}>
                                Required
                              </span>
                            )}
                          </span>
                          <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{u.group}</span>
                        </td>
                        <td className="identifier" style={{ ...td, color: 'var(--text2)' }}>
                          <Link to={`/inventory/${u.serial}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                            {u.serial}
                          </Link>
                        </td>
                        <td className="figure" style={td}>1</td>
                        <td style={td}>
                          {u.state === 'Picked Up' ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)', color: 'var(--success-text)', fontWeight: 600 }}>
                              <Icon name="checklist" size={12} />
                              {u.handoverAt}
                            </span>
                          ) : u.state === 'Ready' ? (
                            <RowAction label="Hand Over" onClick={() => handOver(u.id)} />
                          ) : (
                            <span style={{ color: 'var(--danger-text)', fontWeight: 600 }}>Missing</span>
                          )}
                        </td>
                        <td style={td}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 'var(--r-badge)', background: tone.bg, color: tone.fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                            {ITEM_STATE_LABEL[u.state]}
                          </span>
                        </td>
                        <td style={td}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)', fontSize: 'var(--t-meta)', color: (casePhotos[u.case] ?? 0) > 0 ? 'var(--link)' : 'var(--muted)' }}>
                            <Icon name="eye" size={12} />
                            {casePhotos[u.case] ?? 0}
                          </span>
                        </td>
                        {/* A session is a real sub-operation with its own gates,
                            signatures and close — not a booking under another
                            name — so ruling §2.1 leaves it. What it did wrong was
                            print `S1` stripped to a bare "1" in an `identifier`
                            cell inside a booking workspace, which reads exactly
                            like a record number. Labelled instead; it never gains
                            a prefix and never reaches a route. */}
                        <td style={{ ...td, color: 'var(--muted)' }}>{u.sessionId ? `Session ${u.sessionId.slice(1)}` : '—'}</td>
                        <td style={{ ...td, width: 110 }}>
                          <span style={{ display: 'flex', gap: 'var(--sp-xs)', justifyContent: 'flex-end', alignItems: 'center' }}>
                            {u.state === 'Ready' && <RowAction label="Missing" onClick={() => markMissing(u.id)} />}
                            {canUndo && <RowAction label="Undo" onClick={() => undo(u.id)} />}
                            <Icon name="more_vert" size={14} style={{ color: 'var(--muted)', alignSelf: 'center' }} />
                          </span>
                        </td>
                      </tr>
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
          </Card>

          {/* ── §11 Session Gates, Evidence, Signatures ─────────────────── */}
          <Card title={`Session Gates — Session ${activeId.slice(1)}`} action={<span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{active.state}</span>}>
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
                      Mark Cleared →
                    </button>
                  )}
                  {/* §11.4 calls these three overridable; this build cannot record an
                      override, so the marker says so rather than promising a way past. */}
                  {!g.passing && g.overridable && (
                    <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Override unavailable</span>
                  )}
                </div>
              ))}
            </div>

            {/* §11.2 — the booking condition is information, never a gate. "Items Handed Over" would have blocked session 1 forever if it were one. */}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>Booking Condition</div>
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="info" size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                {allResolved
                  ? 'All items handed over or accounted for — this session sets the booking to On Rent.'
                  : `${pickedUp.length} of ${TOTAL_ITEMS} handed over — partial. Booking stays Packed with Partial Pickup until the rest leave.`}
              </div>
            </div>

            {/* §11.4 — Manager override on gates 1, 3, 4 only, and refused until it
                has an approver and somewhere to be recorded. See OVERRIDE_UNAVAILABLE. */}
            {overridableFailing && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>Manager Override</div>
                {/* Law 12 — inline, persistent, and states what happened, why, and what to do instead.
                    The previous copy claimed the reason was "written to audit"; nothing wrote it. */}
                <p role="alert" style={{ margin: '4px 0 6px', fontSize: 'var(--t-meta)', color: 'var(--danger-text)', fontWeight: 600, lineHeight: 1.45 }}>
                  Not available in this build. {OVERRIDE_UNAVAILABLE}
                </p>
                <p style={{ margin: '0 0 6px', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                  §11.4 reserves this for Owner / Manager; Warehouse cannot override. Who may override a
                  session gate is not yet ruled, and no action records the approver — so no override is
                  recorded here, rather than one recorded against nobody.
                </p>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Reason for override (min 10 characters)"
                  aria-label="Manager override reason"
                  aria-describedby="override-unavailable"
                  style={{ width: '100%', minHeight: 40, padding: 7, borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', resize: 'vertical' }}
                />
                {/* Spec 03 Notes bullet 1 — one primary per workspace, and it is the
                    completion gate. `Apply Override` is a secondary; the only filled
                    button on this page is `Complete Session` / `Complete Handover`. */}
                <div style={{ marginTop: 6 }}>
                  <Unavailable reason={OVERRIDE_UNAVAILABLE}>
                    <button
                      id="override-unavailable"
                      type="button"
                      disabled
                      style={{
                        minHeight: 44,
                        padding: '0 12px',
                        borderRadius: 'var(--r-btn)',
                        fontSize: 'var(--t-meta)',
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        cursor: 'not-allowed',
                        background: 'var(--card2)',
                        color: 'var(--muted)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      Apply Override
                    </button>
                  </Unavailable>
                </div>
              </div>
            )}

            {/* §9.1 Evidence — ⭐ TODO(decision), see handover.ts EVIDENCE_MIN_PHOTOS_PER_CASE. */}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Evidence — Session {activeId.slice(1)}</div>
              {casesNeeded.length === 0 ? (
                <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Nothing left to load in this session.</p>
              ) : (
                casesNeeded.map((c) => {
                  const has = casePhotos[c] ?? 0
                  const ok = has >= EVIDENCE_MIN_PHOTOS_PER_CASE
                  return (
                    <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', fontSize: 'var(--t-meta)' }}>
                      <Icon name={ok ? 'checklist' : 'alert_triangle'} size={12} style={{ color: ok ? 'var(--success-text)' : 'var(--progress-text)', flexShrink: 0 }} />
                      <span style={{ flex: 1, color: 'var(--text2)' }}>{c}</span>
                      <span className="figure" style={{ color: 'var(--muted)' }}>{has}</span>
                      <RowAction label="Take Photo" onClick={() => setCasePhotos((p) => ({ ...p, [c]: (p[c] ?? 0) + 1 }))} />
                    </div>
                  )
                })
              )}
              <p style={{ margin: '7px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                ⭐ Proposed, not yet ruled (§17) — one photo per case with something leaving this session.
              </p>
            </div>

            {/* §9.2 Signatures — captured at session close, never before. */}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Signatures — Session {activeId.slice(1)}</div>
              <SigRow label="Receiver" sig={active.signatures.receiver} onCapture={() => captureSignature('receiver')} required disabled={active.state === 'Complete'} />
              <SigRow label="Warehouse Staff" sig={active.signatures.warehouse} onCapture={() => captureSignature('warehouse')} required disabled={active.state === 'Complete'} />
              {driverNeeded && <SigRow label="Driver" sig={active.signatures.driver} onCapture={() => captureSignature('driver')} required disabled={active.state === 'Complete'} />}
              {/* §9.2 — optional, and uncapturable: there is no witness identity on this screen to sign as. */}
              <SigRow label="Witness" sig={active.signatures.witness} required={false} disabled={active.state === 'Complete'} unavailable={WITNESS_UNAVAILABLE} />
            </div>
          </Card>
        </div>

        {/* ── right rail ───────────────────────────────────────────────── */}
        <FloorAside collapsible={desktop} side="right" width={300} label="Handover summary">
          {/* §10 — no Outstanding, no Deposit Pending here (§13.1). Warehouse sees no money. */}
          <Card title="Handover Summary" action={<span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{pct}%</span>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)' }}>
              <Ring pct={pct} />
              <div>
                <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                  {pickedUp.length} / {TOTAL_ITEMS}
                </div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Items handed over</div>
              </div>
            </div>
            <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              {([
                ['Picked Up', pickedUp.length, 'var(--success-text)'],
                ['Remaining', remaining.length, 'var(--progress-text)'],
                ['Missing', missing.length, 'var(--danger-text)'],
              ] as const).map(([l, v, c]) => (
                <div key={l} style={{ display: 'flex', gap: 'var(--sp-sm)', padding: '3px 0', fontSize: 'var(--t-meta)' }}>
                  <Icon name="dot" size={9} style={{ color: c, marginTop: 4 }} />
                  <span style={{ flex: 1, color: 'var(--text2)' }}>{l}</span>
                  <span className="figure" style={{ fontWeight: 700 }}>{v}</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 'var(--sp-sm)', padding: '3px 0', fontSize: 'var(--t-meta)' }}>
                <span style={{ flex: 1, color: 'var(--text2)' }}>Sessions</span>
                <span className="figure" style={{ fontWeight: 700 }}>2</span>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-sm)', padding: '3px 0', fontSize: 'var(--t-meta)' }}>
                <span style={{ flex: 1, color: 'var(--text2)' }}>Cases</span>
                <span className="figure" style={{ fontWeight: 700 }}>{CASES.length}</span>
              </div>
            </div>
          </Card>

          <Card title="Sessions">
            {(['S1', 'S2'] as SessionId[]).map((sid) => {
              const s = sessions[sid]
              const n = list.filter((u) => u.sessionId === sid).length
              const tone = STATUS[s.state === 'Complete' ? 'in' : s.state === 'In Progress' ? 'progress' : 'neutral']
              return (
                <div key={sid} style={{ padding: '8px 0', borderBottom: sid === 'S1' ? '1px solid var(--border)' : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                    <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>Session {sid.slice(1)}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 7px', borderRadius: 'var(--r-badge)', background: tone.bg, color: tone.fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                      {s.state}
                    </span>
                  </div>
                  <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 3 }}>{n} item(s) handed over</div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{s.closedAt ? `Closed ${s.closedAt}` : `Started ${s.startedAt}`}</div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Receiver: {s.receiver}</div>
                </div>
              )
            })}
            {/* §2.1 — "Sessions count in the summary shows sessions created, not sessions completed." */}
            <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Sessions created: 2</p>
          </Card>

          <Card title="Missing Items">
            {missing.length === 0 ? (
              <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No missing items.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {missing.map((u) => (
                  <div key={u.id}>
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{u.name}</div>
                    <input
                      value={u.reason ?? ''}
                      onChange={(e) => setReason(u.id, e.target.value)}
                      placeholder="Reason (min 10 characters)"
                      aria-label={`Reason ${u.name} is missing`}
                      style={{ width: '100%', height: 28, marginTop: 5, padding: '0 8px', borderRadius: 'var(--r-input)', border: `1px solid ${(u.reason ?? '').trim().length < 10 ? 'var(--danger)' : 'var(--input-border)'}`, background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', outline: 'none' }}
                    />
                    {u.sessionId === activeId && (
                      <div style={{ marginTop: 6 }}>
                        <Button icon="refresh" onClick={() => undo(u.id)}>Undo</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* §10 Documents — no Invoice, no Receipt (§13.1). Ungenerated rows carry no action (§0 #8). */}
          <Card title="Documents">
            {DOCUMENTS.map((d) => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 'var(--t-meta)' }}>
                <span style={{ flex: 1, color: 'var(--text)' }}>{d.name}</span>
                <span style={{ color: d.state === 'Generated' ? 'var(--success-text)' : 'var(--muted)', fontWeight: 600 }}>{d.state}</span>
                {d.state === 'Generated' && <Icon name="download" size={14} style={{ color: 'var(--muted)' }} />}
              </div>
            ))}
          </Card>

          <Card title="Timeline">
            {[...TIMELINE].reverse().map((e) => {
              const bs = toBs(e.at)
              return (
                <div key={e.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{e.what}</div>
                  <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{bs ? formatBs(bs) : '—'} · {formatAd(e.at)}</div>
                  {e.who && <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{e.who}</div>}
                </div>
              )
            })}
          </Card>

          <Card title="Quick Actions">
            {/* Law 15 — 44×44 at every width, so three across is two across below 768. */}
            <div style={{ display: 'grid', gridTemplateColumns: phone ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: 7 }}>
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

          {/* Law 12 — inline and persistent, never a toast. It replaces a unit
              that used to flip to Picked Up whether or not the write landed. */}
          {dispatchError && <ErrorBanner title="This handover was not recorded" message={dispatchError} />}

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

      {/* ── §12 footer — two buttons, autosave, no Save Draft, no Previous ── */}
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', padding: '12px 14px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => navigate(`/rentals/${id}`)}
          style={{ height: 34, padding: '0 14px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--danger-text)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Cancel Handover
        </button>
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Saving is automatic</span>
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
      {/* §5.6 — the disabled button's one-line summary of what is blocking it. */}
      {gateSummary && (
        <p style={{ margin: '-4px 2px 0', textAlign: 'right', fontSize: 'var(--t-meta)', color: 'var(--progress-text)', fontWeight: 600 }}>{gateSummary}</p>
      )}
      <p style={{ margin: '-4px 2px 0', textAlign: 'right', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{caption}</p>

      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        mode="handover"
        bookingId={id}
        items={SEED_UNITS.map((u) => ({
          id: u.id,
          name: u.name,
          serial: u.serial,
          assetTag: u.id,
        }))}
        onItemScanned={(item) => {
          handOverMany([item.id])
        }}
      />
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)' }}>
      <span style={{ color: 'var(--text2)', minWidth: 100, flexShrink: 0 }}>{label}</span>
      <span className={mono ? 'identifier' : undefined} style={{ color: 'var(--text)', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
  )
}

function CheckLine({ label, checked, onToggle, disabled }: { label: string; checked: boolean; onToggle: () => void; disabled: boolean }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)', color: checked ? 'var(--success-text)' : 'var(--text2)', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
      <Icon name={checked ? 'checklist' : 'alert_triangle'} size={13} />
      {label}
    </label>
  )
}

/**
 * `unavailable` is the reason a row can never be signed on this screen (today:
 * Witness, which has no identity to capture). It takes precedence over
 * `onCapture`, which such a row is not given at all — the Capture control renders
 * through `Unavailable`, so the reason reaches a hover device via `title` AND a
 * warehouse tablet via long-press, instead of the row signing a placeholder.
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
          // §9.2 — witness renders as "Optional", never as "Pending".
          <div style={{ fontSize: 'var(--t-meta)', color: required ? 'var(--progress-text)' : 'var(--muted)' }}>{required ? 'Required' : 'Optional — no witness recorded'}</div>
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

function Ring({ pct }: { pct: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <svg width={64} height={64} role="img" aria-label={`${pct}% handed over`} style={{ flexShrink: 0 }}>
      <circle cx={32} cy={32} r={r} fill="none" stroke="var(--card2)" strokeWidth={7} />
      <circle
        cx={32}
        cy={32}
        r={r}
        fill="none"
        stroke="var(--success)"
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 32 32)"
      />
      <text x={32} y={36} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--text)">
        {pct}%
      </text>
    </svg>
  )
}
