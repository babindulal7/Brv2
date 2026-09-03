import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, Button, cardStyle } from '../../components/ui/Page'
import { FloorAside } from '../operations/FloorAside'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { PageBody } from '../../components/ui/PageBody'
import { Unavailable } from '../../components/ui/Unavailable'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { captureError } from '../../lib/monitoring'
import { STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import { statusToken, FLAGS } from '../../lib/workflow'
import type { BookingStatus, JobState } from '../../lib/workflow'
import { BarcodeScannerModal } from '../../components/ui/BarcodeScannerModal'
import { toBs, formatBs, formatAd, formatAdDateTime } from '../../lib/bs'
import { newClientUuid } from '../../lib/supabase'
import { fetchFloorBooking, type FloorBooking, type FloorLine } from '../../lib/queries/bookings'
import type { FloorLineInput } from '../../actions/rentals/floorVerb'
import { CompactButton } from '../../components/ui/TouchTarget'
import { deliveryTypeLabel } from '../../lib/format'

/**
 * **Handover Workspace** — `Handover Workflow.md` v1.1 (Build Locked), wired
 * live on the floor-loop model `PackingWorkspace.tsx` set. Three moves:
 *
 *  1. **Read** — `fetchFloorBooking` (`lib/queries/bookings.ts`, Law 2's one
 *     floor read) resolves `:bookingNo` to the booking head plus its live
 *     `booking_lines` / `booking_line_units` / `product_units`. Every row on
 *     this screen is one of those rows; the `data/handover` seed roster is
 *     gone. A unit whose `unit_state` is already `Picked Up` or `Missing`
 *     was recorded by an EARLIER session and renders as recorded — never
 *     re-dispatched, never re-openable from here (no compensating action
 *     exists; audit gap #12).
 *  2. **Verify** — tick/scan state is local, keyed on the real rows (`marks`),
 *     local until dispatch, committed by the action, never the other way
 *     round. The six §11.1 Session Gates are kept intact, evaluated over real
 *     rows and real local verification state.
 *  3. **Dispatch** — `Complete Session` collapses the marks onto their parent
 *     `booking_lines` (one `FloorLineInput` per line; the line tables carry
 *     `unique (booking_line_id)`) and dispatches `handoverRental` ONCE with
 *     the real ids. Handover is multi-session by design (`0003:129`): a
 *     session that leaves lines untouched closes on its own and the booking
 *     stays `Packed` — `runFloorVerb` reports that truthfully in
 *     `stageHeldBy`. Navigation happens only on the resolved promise.
 *
 * What moved off this file with the seed:
 *  · The per-unit dispatch (`handOver`) and its N-dispatches-per-bulk-scan
 *    fan-out (audit gap #8) — the ONE dispatch is Complete Session, exactly
 *    one `operation_sessions` row per press.
 *  · `Saving is automatic` (audit gap #2) — it never was. The footer now says
 *    what is true: nothing is saved until Complete Session lands.
 *  · The invented receiver/delivery/document/timeline/session records, the
 *    Payment strip cell, the per-case photo counters and the dead
 *    Print/Share/More buttons — removed rather than faked. Evidence follows
 *    the §4.31 ruling: **one photo per BOOKING**, honestly labelled a local
 *    tally.
 *  · The `BookingNotLoaded` guard — every booking loads for real now; unknown
 *    numbers get the not-found empty state, wrong stages get a named refusal
 *    mirroring `runFloorVerb`'s own guard (Handover runs at
 *    `JOBS.Handover.runsAt` = `Packed`).
 *
 * **No money, anywhere** (Law 6 / Foundation §8.3). `fetchFloorBooking` names
 * its columns and asks for none of `booking_lines`' money columns; gates 3
 * and 4 read "Payment required" / "Deposit required" with no amount.
 *
 * §11.4's Manager override on gates 1/3/4 stays **refused**, not implemented
 * — no rule says who may override a session gate and no action records the
 * approver. TODO(decision), unchanged from the seed build; see
 * `OVERRIDE_UNAVAILABLE`.
 */

/** §13 — the workspace primary is `--primary` in light *and* dark. */
/*
 * The primary action's paint. Was `background: 'var(--cat-1)', color: '#fff'`
 * — `--cat-1` is a CHART CATEGORY hue (#3b82d6), not the app's primary, and
 * the ink was a raw literal. Five workspaces carried byte-identical copies, so
 * five primary buttons were an off-palette blue that no token governed and
 * that never followed a theme change.
 *
 * v4.1 §5: primary is `--primary`, one per view. The --btn-primary-* pair is
 * the token that exists for exactly this and carries its own measured ink.
 */
const BLUE_PRIMARY = { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)', border: '1px solid transparent' } as const

/**
 * The reason the Witness row cannot be signed — §9.2 makes the witness
 * optional, and this screen captures no witness identity, so the session is
 * recorded with no witness rather than with a placeholder.
 */
const WITNESS_UNAVAILABLE =
  'No witness identity is captured on this screen, so a witness signature cannot be attested here. §9.2 makes the witness optional — this session is recorded with no witness rather than with a placeholder.'

/**
 * The driver signature, on the same witness precedent: no driver identity is
 * captured anywhere on this screen or in the floor read, and a signature
 * against an invented name is a claim that someone signed. Recorded ABSENT,
 * stated on the control — not silently dropped, and not a placeholder.
 * TODO(decision): where a driver identity comes from (crew? delivery record?)
 * before this row can gate anything.
 */
const DRIVER_UNAVAILABLE =
  'No driver identity is captured on this screen, so a driver signature cannot be attested here. It is recorded as absent — with a named reason — rather than signed with a placeholder.'

/**
 * The three states a row can hold on THIS screen this session. `Ready` is the
 * absence of a mark; `Picked Up` and `Missing` are the two outcomes
 * `FloorLineOutcome` can carry ('done' | 'missing'). The seed build's
 * `Returned` row state belonged to the Return workspace and is gone.
 */
type RowState = 'Ready' | 'Picked Up' | 'Missing'

const FILTERS = ['All', 'Ready', 'Picked Up', 'Missing'] as const

/** Solid green while gear is OUT (Law 11's out/in split), yellow for work not yet done. */
const ROW_TONE: Record<RowState, StatusKey> = {
  Ready: 'progress',
  'Picked Up': 'out',
  Missing: 'danger',
}

const th = { textAlign: 'left' as const, padding: '8px 9px', fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap' as const, borderBottom: '1px solid var(--border)' }
/*
 * `height` on a `<td>` behaves as a MINIMUM, so this is the §7.3 row floor
 * ("rows >= 56px") expressed with the token rather than with padding
 * arithmetic. It gives `--row-min-h` its first consumers; it had none.
 *
 * This is also a DATA-INTEGRITY fix, not a density preference. `CompactButton`
 * (RowAction on all four floor screens) is 22px tall and carries a 44px
 * TouchTarget, so its hit area overhung this row by ~3px at each edge while the
 * row was 8+22+8 = 38px. Vertically adjacent rows therefore overlapped by ~6px,
 * and the later row in the DOM wins a tap in that band — on Return, where the
 * two actions are "Mark Returned" and "Not Returned", a tap near a row boundary
 * could record a return against the WRONG line item.
 *
 * At 56px the 44px target sits inside the row with 6px of margin each side and
 * the overlap is gone. Fixing the row floor and the hit area turned out to be
 * one fix, which is why it is done here rather than by shrinking the target:
 * a smaller target on a gloved-tablet screen is the wrong trade.
 */
const td = { height: 'var(--row-min-h)', padding: '8px 9px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }

/**
 * One checklist row — one physical unit (`booking_line_units` row) on a
 * serialised line, or the whole line for a quantity-tracked line with no unit
 * assignments. `key` is the mark key; `lineId` is what the dispatch collapses
 * onto; `assetId` is `product_units.id`, what `session_line_movements.unit_id`
 * needs (null on quantity rows — a movement row is never invented for them).
 * `prior` is the state an EARLIER session already recorded, off
 * `booking_line_units.unit_state` — such a row is display-only here.
 */
interface HandRow {
  key: string
  lineId: string
  assetId: string | null
  serial: string | null
  name: string
  /** Units this row stands for: 1 per physical unit, `booking_lines.qty` for a quantity row. */
  qty: number
  required: boolean
  location: string | null
  group: string
  prior: 'Picked Up' | 'Missing' | null
}

interface Mark {
  state: 'Picked Up' | 'Missing'
  pickedAtIso?: string
  reason?: string
}

interface Sig {
  name: string
  role: string
  at: string
}

interface GateRow {
  n: number
  label: string
  passing: boolean
  blocking: string | null
  overridable?: boolean
  resolve?: () => void
}

/** Law 10's floor: the DB CHECK behind every `missing_reason` in migration 0003. */
const MIN_REASON = 10

/**
 * §9.2 — the driver signs only when someone drives for us: `Babin Delivery`
 * or `Third Party` (the `delivery_type` enum's own spellings, 0001). A
 * Customer Pickup or Courier booking never had a driver row to show badly.
 */
function driverSignatureRequired(deliveryType: string | null): boolean {
  return deliveryType === 'Babin Delivery' || deliveryType === 'Third Party'
}

/**
 * Flatten the booking's lines into checklist rows — the same shape
 * `PackingWorkspace.buildRows` builds, plus the prior-session state: Handover
 * is multi-session, so a unit an earlier session already took out arrives
 * with `unit_state = 'Picked Up'` and must render as recorded, not as Ready.
 */
function buildRows(floor: FloorBooking): HandRow[] {
  const lineById = new Map(floor.lines.map((l) => [l.id, l]))
  const groupOf = (line: FloorLine): string => {
    const parent = line.parentLineId !== null ? lineById.get(line.parentLineId) : undefined
    const src = parent ?? line
    return src.productName ?? src.description ?? src.lineType
  }

  const rows: HandRow[] = []
  for (const line of floor.lines) {
    const name = line.productName ?? line.description ?? `${line.lineType} line`
    if (line.unitsPresence === 'present' && line.units.length > 0) {
      line.units.forEach((u, i) => {
        rows.push({
          key: u.id,
          lineId: line.id,
          assetId: u.assetId,
          serial: u.serial ?? u.assetTag,
          name: line.units.length > 1 ? `${name} · unit ${i + 1}` : name,
          qty: 1,
          required: u.isRequired,
          location: u.location,
          group: groupOf(line),
          prior: u.unitState === 'Picked Up' ? 'Picked Up' : u.unitState === 'Missing' ? 'Missing' : null,
        })
      })
    } else {
      // A quantity-tracked line (or one whose units are simply unassigned):
      // one row for the whole line, ticked as one. `unitsPresence === 'absent'`
      // is handled before this function is called — an absent embed must never
      // read as "no units" (the defect bookingQuery.ts:110-113 records).
      // No unit state exists for it, so no prior-session fact can be shown.
      rows.push({
        key: `line:${line.id}`,
        lineId: line.id,
        assetId: null,
        serial: null,
        name,
        qty: line.qty,
        required: true,
        location: null,
        group: groupOf(line),
        prior: null,
      })
    }
  }
  return rows
}

/**
 * Collapse the operator's marks back onto booking lines — the dispatch payload.
 *
 * One entry per line (`validateFloorVerb` refuses duplicates), and a line
 * nobody touched THIS session is NOT named: absence is never converted into a
 * state (0003:630) — that is exactly what lets a staggered collection leave
 * the rest for a later session (§2.1). Per line:
 *
 *  - only Missing marks → `outcome: 'missing'` with the operator's reasons
 *    joined (each already ≥ 10 chars by the gate, so the join is too);
 *  - any Picked Up marks → `outcome: 'done'` carrying the scanned
 *    `product_units.id`s (one movement row each) and the moved quantity.
 *    A MIXED line (some out, some missing) lands as 'done' short of its
 *    required qty — `handover_lines.state = 'Remaining'` per 0003 — because
 *    `FloorLineInput` carries one outcome per line and dropping the picked
 *    units' movements would claim less happened than did. The missing units'
 *    reasons ride the session notes so they are not dropped.
 */
function buildHandoverLines(
  lines: readonly FloorLine[],
  rows: readonly HandRow[],
  marks: Record<string, Mark>,
): { payload: FloorLineInput[]; mixedNotes: string[] } {
  const byLine = new Map<string, HandRow[]>()
  for (const r of rows) {
    const bucket = byLine.get(r.lineId)
    if (bucket) bucket.push(r)
    else byLine.set(r.lineId, [r])
  }

  const payload: FloorLineInput[] = []
  const mixedNotes: string[] = []

  for (const line of lines) {
    const lineRows = byLine.get(line.id) ?? []
    const picked = lineRows.filter((r) => marks[r.key]?.state === 'Picked Up')
    const missing = lineRows.filter((r) => marks[r.key]?.state === 'Missing')
    if (picked.length === 0 && missing.length === 0) continue

    if (picked.length === 0) {
      payload.push({
        bookingLineId: line.id,
        outcome: 'missing',
        reason: missing.map((r) => (marks[r.key]?.reason ?? '').trim()).join('; '),
      })
      continue
    }

    const scanned = picked.filter((r) => r.assetId !== null)
    payload.push({
      bookingLineId: line.id,
      ...(scanned.length > 0
        ? {
            unitIds: scanned.map((r) => r.assetId as string),
            serials: scanned.map((r) => r.serial ?? ''),
          }
        : {}),
      qty: picked.reduce((n, r) => n + r.qty, 0),
    })

    if (missing.length > 0) {
      const lineName = line.productName ?? line.description ?? line.id
      mixedNotes.push(
        `${lineName}: ${missing.length} of ${lineRows.length} unit(s) missing — ` +
          missing.map((r) => `${r.serial ?? r.name}: ${(marks[r.key]?.reason ?? '').trim()}`).join('; '),
      )
    }
  }

  return { payload, mixedNotes }
}

/** The AD span between two instants in whole days, floored at 1 (Law 9's days-explicit floor). */
function rentalDays(pickupIso: string, returnIso: string): number {
  const ms = Date.parse(returnIso) - Date.parse(pickupIso)
  if (!Number.isFinite(ms)) return 1
  return Math.max(1, Math.round(ms / 86_400_000))
}

/** BS above AD, and an honest dash outside `bs.ts`'s vouched range. */
function bsLabel(iso: string | null): string {
  if (!iso) return '—'
  const bs = toBs(new Date(iso))
  return bs ? formatBs(bs) : '—'
}

/*
 * ⭐ RULED 12 Aug 2026 (Rulings §3): operations are ROUTES.
 * `/rentals/:bookingNo/handover` is the only mount, and `bookingNo` comes off
 * the route for ANY booking — resolved by `fetchFloorBooking`, not compared
 * against a seed.
 */
export default function HandoverWorkspace() {
  const navigate = useNavigate()
  const { bookingNo } = useParams()
  const id = bookingNo ?? ''
  /** The one identity every dispatch on this screen may act as. No fallback. */
  const { user } = useAuth()
  /* Law 13/14 — width decides, at v4.1 §7.7's 768 / 1280. */
  const viewport = useViewport()
  const desktop = viewport === 'desktop'
  const phone = viewport === 'phone'

  /* ── the read — fetchFloorBooking, same cancellation rule as BookingDetail ── */
  const [floor, setFloor] = useState<FloorBooking | null>(null)
  const [floorLoading, setFloorLoading] = useState(true)
  const [floorError, setFloorError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let cancelled = false
    setFloorLoading(true)
    setFloorError(null)
    fetchFloorBooking(id)
      .then((b) => {
        if (cancelled) return
        setFloor(b)
        setFloorLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setFloorError(err instanceof Error ? err.message : String(err))
        setFloorLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, reload])

  /* ── checklist state, keyed on the real rows ─────────────────────────────
   * `marks` holds only rows the operator touched THIS session; absence is
   * Ready (or a prior session's recorded state). Local until Complete Session
   * dispatches — dispatch-then-commit, where "commit" is the navigation away
   * on the resolved promise. */
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const [showScanner, setShowScanner] = useState(false)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')
  const [query, setQuery] = useState('')
  const [scanLog, setScanLog] = useState<string[]>([])
  const [sessionNotes, setSessionNotes] = useState('')
  /** ⭐ §4.31 — one photo per BOOKING. Local tally; no upload path exists here yet. */
  const [photoCount, setPhotoCount] = useState(0)
  /* §11.1 gate 1 — the receiver's ID and authorization, actually checked. */
  const [govIdVerified, setGovIdVerified] = useState(false)
  const [bookingAuthVerified, setBookingAuthVerified] = useState(false)
  /* §11.1 gates 3 / 4 — booleans, never amounts (Law 6). */
  const [paymentVerified, setPaymentVerified] = useState(false)
  const [depositReceived, setDepositReceived] = useState(false)
  /** §9.2 — captured at session close. Names come off real records only. */
  const [signatures, setSignatures] = useState<{ receiver?: Sig; warehouse?: Sig }>({})
  /**
   * The reason an operator would give for a §11.4 override. Still typed, still
   * shown back, still consumed by nothing — see `OVERRIDE_UNAVAILABLE`.
   */
  const [overrideReason, setOverrideReason] = useState('')
  /** Law 12 — a dispatch failure is inline and persistent, never a toast. */
  const [dispatchError, setDispatchError] = useState<string | null>(null)
  const [dispatching, setDispatching] = useState(false)
  /**
   * Law 8 — the idempotency key for THIS handover session, minted when the
   * booking loads (the point the user starts acting), not at send time. A
   * double-press replays the same key and resolves to the first write.
   */
  const [completionKey, setCompletionKey] = useState(() => newClientUuid())

  const floorId = floor?.id ?? null
  useEffect(() => {
    // A different booking arrived: everything verified belonged to the old one.
    setMarks({})
    setPhotoCount(0)
    setScanLog([])
    setSessionNotes('')
    setGovIdVerified(false)
    setBookingAuthVerified(false)
    setPaymentVerified(false)
    setDepositReceived(false)
    setSignatures({})
    setOverrideReason('')
    setDispatchError(null)
    setDispatching(false)
    setCompletionKey(newClientUuid())
  }, [floorId])

  const rows = useMemo<HandRow[]>(() => (floor ? buildRows(floor) : []), [floor])
  const rowByKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows])
  /** A mark wins over a prior state (the UI never lets a prior row be marked). */
  const stateOf = (key: string): RowState => marks[key]?.state ?? rowByKey.get(key)?.prior ?? 'Ready'

  /* ── derived tallies, all unit-weighted over the real rows ─────────────── */
  const totalUnits = rows.reduce((n, r) => n + r.qty, 0)
  const priorRows = rows.filter((r) => r.prior !== null)
  const pickedRows = rows.filter((r) => marks[r.key]?.state === 'Picked Up')
  const missingRows = rows.filter((r) => marks[r.key]?.state === 'Missing')
  const readyRows = rows.filter((r) => stateOf(r.key) === 'Ready')
  const outUnits = rows.filter((r) => stateOf(r.key) === 'Picked Up').reduce((n, r) => n + r.qty, 0)
  const readyUnits = readyRows.reduce((n, r) => n + r.qty, 0)
  const missingUnits = rows.filter((r) => stateOf(r.key) === 'Missing').reduce((n, r) => n + r.qty, 0)
  const pct = totalUnits > 0 ? Math.round((outUnits / totalUnits) * 100) : 0

  /*
   * §1.5 — Handover runs at status **Packed**; the badge shows the CANONICAL
   * stage (a partial handover stays Packed — `Partial Pickup` is the chip
   * beside it, never a seventh stage name). Mid-handover is the Handover *job*
   * being In Progress — a separate axis, a separate chip.
   */
  const stage = (floor?.stage ?? 'Packed') as BookingStatus
  const touchedCount = pickedRows.length + missingRows.length
  const jobState: JobState =
    touchedCount === 0 && priorRows.length === 0 ? 'Not Started' : readyRows.length === 0 ? 'Complete' : 'In Progress'

  /** §11.2 — the booking condition, information only: does anything remain after this session? */
  const allResolved = rows.length > 0 && readyRows.length === 0

  /* ── §11.1 — the six Session Gates, kept intact, over real state ───────── */
  const shortReasons = missingRows.filter((r) => (marks[r.key]?.reason ?? '').trim().length < MIN_REASON)
  const receiverPassing = govIdVerified && bookingAuthVerified
  const itemsPassing = touchedCount > 0 && shortReasons.length === 0
  const paymentPassing = paymentVerified
  const depositPassing = depositReceived
  const driverNeeded = driverSignatureRequired(floor?.deliveryType ?? null)
  /*
   * Receiver + warehouse gate the close. The driver row (when the delivery
   * method has a driver) and the witness row render, but neither can be
   * captured on this screen — no identity exists to sign as — so both are
   * recorded ABSENT with a named reason rather than blocking every delivery
   * handover forever or signing a placeholder. Same precedent as the witness
   * ruling of 12 Aug 2026.
   */
  const signaturesPassing = Boolean(signatures.receiver) && Boolean(signatures.warehouse)
  const evidencePassing = photoCount > 0

  const gates: GateRow[] = [
    {
      n: 1,
      label: 'Receiver Verified',
      passing: receiverPassing,
      blocking: receiverPassing ? null : 'Government ID and booking authorization not verified',
      overridable: true,
    },
    {
      n: 2,
      label: 'Items Scanned This Session',
      passing: itemsPassing,
      blocking: itemsPassing
        ? null
        : touchedCount === 0
          ? 'Nothing has been scanned or marked in this session yet — a handover session recording nothing is refused'
          : `${shortReasons.length} missing item${shortReasons.length > 1 ? 's' : ''} need a reason of at least ${MIN_REASON} characters`,
    },
    // §13.1 — "the payment and deposit gates render as Payment cleared / Deposit cleared… no amounts."
    // §13 — a Manager or Billing user clears the gate directly; `resolve` stands in for that role's action (no role switch exists in this build).
    { n: 3, label: 'Payment Verified', passing: paymentPassing, blocking: paymentPassing ? null : 'Payment required', overridable: true, ...(paymentVerified ? {} : { resolve: () => setPaymentVerified(true) }) },
    { n: 4, label: 'Deposit Received', passing: depositPassing, blocking: depositPassing ? null : 'Deposit required', overridable: true, ...(depositReceived ? {} : { resolve: () => setDepositReceived(true) }) },
    { n: 5, label: 'Signatures Complete', passing: signaturesPassing, blocking: signaturesPassing ? null : 'Receiver and warehouse signatures not yet captured' },
    {
      n: 6,
      label: 'Evidence Captured',
      passing: evidencePassing,
      blocking: evidencePassing ? null : 'Ruled mandatory (§4.31): one photo per booking before completion',
    },
  ]
  const firstBlockedGate = gates.find((g) => !g.passing) ?? null
  const canComplete = firstBlockedGate === null && !dispatching
  const overridableFailing = !receiverPassing || !paymentPassing || !depositPassing

  /**
   * §0 #2, §12 — one label, computed from whether anything remains after this
   * session, never a second button. The stage move itself is `runFloorVerb`'s
   * call, made from the database's line states, not this label.
   */
  const primaryLabel = allResolved ? 'Complete Handover' : 'Complete Session'
  const caption = allResolved
    ? 'Records this session and sets the booking to On Rent'
    : `Records ${pickedRows.length + missingRows.length} resolved item${pickedRows.length + missingRows.length === 1 ? '' : 's'} — the rest stay for a later session`
  const gateSummary = canComplete ? null : (firstBlockedGate?.blocking ?? null)

  /*
   * ⭐ 12 Aug 2026 — `applyOverride` stays REFUSED. TODO(decision): no rule
   * says who may override a session gate (`canPerformOperations` grants
   * Warehouse, which §11.4 explicitly forbids), and no action persists an
   * override, so applying one would open three gates with nobody named
   * against them. The reason field stays — real input, shown back — but the
   * control states why it cannot act (Law 12, inline and persistent).
   */
  const OVERRIDE_UNAVAILABLE =
    'A manager override cannot be applied: no rule defines who may override a session gate, and no action records the approver, so applying one would open three gates with nobody named against them. Clear the gates themselves instead.'

  const visible = useMemo(
    () =>
      rows.filter((r) => {
        const s = marks[r.key]?.state ?? r.prior ?? 'Ready'
        if (filter !== 'All' && s !== filter) return false
        if (query && !`${r.name} ${r.serial ?? ''}`.toLowerCase().includes(query.toLowerCase())) return false
        return true
      }),
    [rows, marks, filter, query],
  )

  /* ── mark helpers — local until dispatch, never a write on their own ───── */
  const markPicked = (key: string) =>
    setMarks((p) => ({ ...p, [key]: { state: 'Picked Up', pickedAtIso: new Date().toISOString() } }))
  const markMissing = (key: string) => setMarks((p) => ({ ...p, [key]: { state: 'Missing', reason: '' } }))
  const clearMark = (key: string) =>
    setMarks((p) => {
      const next = { ...p }
      delete next[key]
      return next
    })
  const setReason = (key: string, reason: string) =>
    setMarks((p) => ({ ...p, [key]: { ...(p[key] ?? { state: 'Missing' as const }), reason } }))

  /**
   * One scan / tick = one LOCAL mark. The write is Complete Session, once —
   * the seed build dispatched `handoverRental` per unit (and its scanner's
   * modal asserted "handed over" before that dispatch had settled; the scan
   * log here says what is true instead: marked, recorded at session close).
   */
  const pick = (key: string) => {
    const row = rowByKey.get(key)
    if (!row) return
    if (row.prior !== null) {
      setScanLog((p) => [`• ${row.name} was recorded ${row.prior} in an earlier session`, ...p].slice(0, 5))
      return
    }
    if (stateOf(key) === 'Picked Up') {
      setScanLog((p) => [`• ${row.name} already marked Picked Up`, ...p].slice(0, 5))
      return
    }
    markPicked(key)
    setScanLog((p) => [`✓ ${row.name} marked Picked Up — recorded at session close`, ...p].slice(0, 5))
  }

  const pickAllReady = () => {
    const at = new Date().toISOString()
    setMarks((p) => {
      const next = { ...p }
      for (const r of rows) {
        if (r.prior !== null) continue
        if (next[r.key]?.state !== 'Missing') next[r.key] = { state: 'Picked Up', pickedAtIso: at }
      }
      return next
    })
  }

  const scannableUnits = rows
    .filter((r) => r.prior === null)
    .map((r) => ({
      id: r.key,
      name: r.name,
      ...(r.serial ? { serial: r.serial } : {}),
      // Quantity rows have no serial to scan — the modal treats them as accessories.
      isAccessory: r.serial === null,
    }))

  /**
   * §9.2 — the names come off real records only: the booking's client for the
   * receiver, the signed-in operator for warehouse staff. The timestamp is the
   * capture instant, not the literal `'16 Jul 2026, 02:20 PM'` the seed build
   * stamped on every capture (audit gap #7).
   */
  const captureSignature = (role: 'receiver' | 'warehouse') => {
    const name = role === 'receiver' ? floor?.clientName : user?.name
    if (!name) return
    const roleLabel = role === 'receiver' ? 'Receiver' : 'Warehouse'
    setSignatures((p) => ({ ...p, [role]: { name, role: roleLabel, at: formatAdDateTime(new Date().toISOString()) } }))
  }

  /* ── the dispatch — real line ids, once, dispatch-then-commit ──────────── */
  const completeSession = () => {
    if (!canComplete || !floor) return
    // The identity is the signed-in operator or there is no dispatch — never a
    // made-up `{ userId: 'USR-001' }` on a floor record.
    if (!user) {
      setDispatchError('You are not signed in, so this handover cannot be recorded against anyone. Nothing was written.')
      return
    }
    setDispatchError(null)
    setDispatching(true)

    const { payload, mixedNotes } = buildHandoverLines(floor.lines, rows, marks)
    const notes = [sessionNotes.trim(), ...mixedNotes].filter((n) => n !== '').join('\n')

    /*
     * ⚠ `navigate` is INSIDE `.then`. Leaving the workspace is the app's "the
     * write landed" signal — a failed write must never read as a closed
     * handover, and the seed build's Complete Session did exactly that.
     */
    import('../../actions/rentals/index')
      .then((m) =>
        m.handoverRental(
          {
            bookingId: floor.id,
            lines: payload,
            clientUuid: completionKey,
            occurredAt: new Date().toISOString(),
            ...(notes === '' ? {} : { notes }),
          },
          { userId: user.id, role: user.role },
        ),
      )
      .then(() => navigate(`/rentals/${id}`))
      .catch((err: unknown) => {
        captureError(err, { where: 'HandoverWorkspace.close', bookingId: id })
        setDispatchError(err instanceof Error ? err.message : String(err))
        setDispatching(false)
      })
  }

  /* ── honest degradations, before any workspace chrome ──────────────────── */

  const notFound = !floorLoading && floorError === null && floor === null

  /*
   * Handover runs at `Packed` (`JOBS.Handover.runsAt`) — `runFloorVerb` would
   * refuse any other stage by name, so the workspace says so up front instead
   * of letting the operator verify a roster into a guaranteed refusal.
   * Drafted against the pattern Packing set (§4.31 item 4 — drafted, not
   * ruled; correct the wording freely).
   */
  const stageBlock =
    floor === null
      ? null
      : floor.isCancelled
        ? `${floor.bookingNo} is cancelled. Handover does not run on a cancelled booking.`
        : floor.isClosed
          ? `${floor.bookingNo} is Closed. Closed is final — nothing further is recorded.`
          : floor.stage !== 'Packed'
            ? `Handover runs at stage Packed; ${floor.bookingNo} is at ${floor.stage}. ` +
              (floor.stage === 'Booked'
                ? 'This booking has not been packed yet — Complete Packing first.'
                : floor.stage === 'On Rent'
                  ? 'This booking is already on rent — its gear has left the building.'
                  : 'Nothing can be handed over here.')
            : null

  // Floor scale (DEVICES.md item 3) is applied automatically by route in App.tsx's Shell, not here.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageBody
        loading={floorLoading}
        error={floorError}
        onRetry={() => setReload((n) => n + 1)}
        empty={notFound}
        noun={`booking ${id}`}
        skeleton="card"
        emptyTitle={`No booking matches ${id}`}
        emptyMessage="Check the booking number — nothing with this number exists, so there is nothing to hand over."
      >
        {floor !== null && stageBlock !== null && (
          <EmptyState
            title={`Handover is not available for ${floor.bookingNo}`}
            description={stageBlock}
            actionLabel={`Open booking ${floor.bookingNo}`}
            onAction={() => navigate(`/rentals/${id}`)}
          />
        )}

        {floor !== null && stageBlock === null && floor.linesPresence === 'absent' && (
          /* An absent embed is NOT an empty booking — the two must never be
             collapsed (bookingQuery.ts:110-113 records that defect). */
          <ErrorBanner
            title="Could not load this booking's lines"
            message="The booking loaded but its lines did not come back with it, so the checklist cannot be trusted. Retry before handing anything over."
            onRetry={() => setReload((n) => n + 1)}
          />
        )}

        {floor !== null && stageBlock === null && floor.linesPresence === 'present' && rows.length === 0 && (
          <EmptyState
            title={`${floor.bookingNo} has no live lines`}
            description="Every line on this booking is voided or none were added, so there is nothing to hand over."
            actionLabel={`Open booking ${floor.bookingNo}`}
            onAction={() => navigate(`/rentals/${id}`)}
          />
        )}

        {floor !== null && stageBlock === null && floor.linesPresence === 'present' && rows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
            {/* ── header. Rulings §4 — breadcrumbs via the shell, no `←`. ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-lg)', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <h1 style={{ margin: 0, fontSize: 'var(--t-h1)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.015em' }}>
                    Handover Workspace
                  </h1>
                  {/*
                    ⭐ RULED (Rulings §7): the badge shows the CANONICAL stage —
                    a partial handover stays Packed, never a seventh name. The
                    mid-handover signal is the *job* chip beside it, and the
                    Partial Pickup FLAG carries the staggered-collection fact.
                  */}
                  <span
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)', height: 22, padding: '0 9px', borderRadius: 'var(--r-chip)', background: STATUS[statusToken(stage)].bg, color: STATUS[statusToken(stage)].fg, fontSize: 'var(--t-meta)', fontWeight: 700 }}
                  >
                    <Icon name="dot" size={9} />
                    {stage}
                  </span>
                  <span
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)', height: 22, padding: '0 9px', borderRadius: 'var(--r-badge)', border: '1px solid var(--border)', background: 'var(--card2)', color: jobState === 'Complete' ? 'var(--success-text)' : jobState === 'In Progress' ? 'var(--progress-text)' : 'var(--text2)', fontSize: 'var(--t-meta)', fontWeight: 700 }}
                  >
                    <Icon name={jobState === 'Complete' ? 'checklist' : jobState === 'In Progress' ? 'refresh' : 'dot'} size={11} />
                    Handover job: {jobState}
                  </span>
                  {outUnits > 0 && !allResolved && (
                    <span title={FLAGS['Partial Pickup'].effect} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)', height: 22, padding: '0 9px', borderRadius: 'var(--r-chip)', background: STATUS.progress.bg, color: STATUS.progress.fg, fontSize: 'var(--t-meta)', fontWeight: 700 }}>
                      <Icon name="alert_triangle" size={11} />
                      Partial Pickup
                    </span>
                  )}
                </div>
                <p style={{ margin: '5px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  <Link to={`/rentals/${id}`} style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }} className="identifier">
                    {floor.bookingNo}
                  </Link>
                  {floor.project ? ` · ${floor.project}` : ''}
                  {floor.clientName ? ` · ${floor.clientName}` : ''}
                </p>
              </div>

              <div style={{ minWidth: 260, flex: 1 }}>
                <div style={{ display: 'flex', gap: 10, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  <span>Handover Progress</span>
                  <span className="figure" style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text)' }}>
                    {outUnits} / {totalUnits} ({pct}%)
                  </span>
                </div>
                <div aria-hidden style={{ height: 8, borderRadius: 'var(--r-badge)', background: 'var(--card2)', marginTop: 6, overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '100%', background: 'var(--success)', borderRadius: 'var(--r-badge)', transform: `scaleX(${pct / 100})`, transformOrigin: 'left', transition: 'transform var(--dur) ease' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 'var(--t-meta)', color: readyUnits ? 'var(--progress-text)' : 'var(--success-text)', fontWeight: 600 }}>
                  <Icon name={readyUnits ? 'alert_triangle' : 'checklist'} size={12} />
                  {readyUnits ? `${readyUnits} unit${readyUnits > 1 ? 's' : ''} remaining` : 'All items resolved'}
                  {missingUnits > 0 && <span style={{ color: 'var(--danger-text)' }}>· {missingUnits} missing</span>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
                <Link to={`/rentals/${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 12px', borderRadius: 'var(--r-btn)', border: '1px solid var(--btn-secondary-border)', background: 'var(--btn-secondary-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600, textDecoration: 'none' }}>
                  <Icon name="external_link" size={14} />
                  View Booking
                </Link>
              </div>
            </div>

            {/* §5 booking strip — read-only, every cell a real column off
                `fetchFloorBooking`. No money anywhere (Law 6 / §8.3): the seed
                build's Payment cell was local state wearing a strip cell, and
                is gone — gates 3 and 4 carry that fact, amount-free. */}
            <div style={{ ...cardStyle, display: 'flex', gap: 0, flexWrap: 'wrap', overflow: 'hidden' }}>
              {[
                { l: 'Client', v: floor.clientName ?? '—', big: true },
                { l: 'Pickup', v: bsLabel(floor.pickupAtAd), s: floor.pickupAtAd ? formatAd(new Date(floor.pickupAtAd)) : undefined },
                { l: 'Return', v: bsLabel(floor.returnAtAd), s: floor.returnAtAd ? formatAd(new Date(floor.returnAtAd)) : undefined },
                {
                  l: 'Days',
                  v: floor.pickupAtAd && floor.returnAtAd ? String(rentalDays(floor.pickupAtAd, floor.returnAtAd)) : '—',
                  s: 'Rental days',
                },
                { l: 'Stage', v: floor.stage, big: true },
                { l: 'Handover job', v: jobState },
                { l: 'Units', v: String(totalUnits) },
                { l: 'Delivery', v: deliveryTypeLabel(floor.deliveryType) },
              ].map((f) => (
                <div key={f.l} style={{ padding: '11px 14px', borderRight: '1px solid var(--border)', minWidth: 0, flex: '1 1 auto' }}>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{f.l}</div>
                  <div style={{ fontSize: f.big ? 'var(--t-h3)' : 'var(--t-body)', fontWeight: f.big ? 700 : 600, color: 'var(--text)', marginTop: 3, whiteSpace: 'nowrap' }}>
                    {f.v}
                  </div>
                  {f.s && <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{f.s}</div>}
                </div>
              ))}
            </div>

            {/* §3.3 — checklist and gates left, summary rail right at desktop;
                below 1280 the rail REFLOWS beneath (Rulings §7). */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: desktop ? 'minmax(0,1fr) auto' : '1fr',
                gap: 'var(--sp-md)',
                alignItems: 'start',
              }}
            >
              {/* ── main column ────────────────────────────────────────── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
                {/* §6.1 — receiver verification. The seed build printed an
                    invented receiver (name, phone, email, government-ID
                    number); nothing real exists to print until a receiver
                    model lands, so the card carries only the real client and
                    the two verification facts gate 1 needs. */}
                <Card title="Receiver Verification">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <InfoRow label="Client" value={floor.clientName ?? '—'} />
                    <InfoRow label="Delivery" value={deliveryTypeLabel(floor.deliveryType)} />
                  </div>
                  <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <CheckLine label="Government ID Verified" checked={govIdVerified} onToggle={() => setGovIdVerified((v) => !v)} disabled={dispatching} />
                    <CheckLine label="Booking Authorization Verified" checked={bookingAuthVerified} onToggle={() => setBookingAuthVerified((v) => !v)} disabled={dispatching} />
                  </div>
                  <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                    Checked against the receiver&apos;s physical ID at the counter. No receiver identity is stored
                    from this screen — these two facts ride the session as gate 1.
                  </p>
                </Card>

                {/* ── §7 Equipment checklist over the real rows ──────────── */}
                <Card
                  title="Equipment"
                  bodyStyle={{ padding: 0 }}
                  action={
                    <>
                      <Button icon="search" onClick={pickAllReady}>Bulk Scan</Button>
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
                      style={{ flex: 1, minWidth: 180, minHeight: 44, padding: '0 9px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
                    />
                    {FILTERS.map((f) => {
                      const on = filter === f
                      const count = f === 'All' ? rows.length : rows.filter((r) => stateOf(r.key) === f).length
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
                          {f} <span className="figure">{count}</span>
                        </button>
                      )
                    })}
                  </div>

                  {phone ? (
                    /* Shell rule: tables become card rows below 768. One card
                       per row: serial + status + one primary action. */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', padding: 'var(--sp-sm)' }}>
                      {visible.map((r) => {
                        const s = stateOf(r.key)
                        const mark = marks[r.key]
                        const tone = STATUS[ROW_TONE[s]]
                        const recorded = r.prior !== null
                        return (
                          <article key={r.key} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44 }}>
                              <input
                                type="checkbox"
                                checked={s === 'Picked Up'}
                                disabled={recorded}
                                aria-label={`Mark ${r.name} picked up`}
                                title={recorded ? 'Recorded in an earlier session' : undefined}
                                style={{ width: 22, height: 22, marginTop: 2, flexShrink: 0 }}
                                onChange={() => (mark?.state === 'Picked Up' ? clearMark(r.key) : pick(r.key))}
                              />
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 600 }}>{r.name}</span>
                                  {r.qty > 1 && <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>×{r.qty}</span>}
                                  {r.required && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', height: 15, padding: '0 5px', borderRadius: 4, background: 'var(--st-primary-bg)', color: 'var(--st-primary-fg)', fontSize: 'var(--t-meta)', fontWeight: 700 }}>
                                      Required
                                    </span>
                                  )}
                                  <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 'var(--r-badge)', background: tone.bg, color: tone.fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                                    {s}
                                  </span>
                                  {recorded && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>earlier session</span>}
                                </span>
                                {r.serial && (
                                  <Link to={`/inventory/${r.serial}`} className="identifier" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)', textDecoration: 'none', marginTop: 2 }}>
                                    {r.serial}
                                  </Link>
                                )}
                              </span>
                            </label>

                            {(r.location || mark?.pickedAtIso) && (
                              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                                {r.location ?? ''}
                                {mark?.pickedAtIso ? `${r.location ? ' · ' : ''}marked ${formatAdDateTime(mark.pickedAtIso)}` : ''}
                              </span>
                            )}

                            <span style={{ display: 'flex', gap: 'var(--sp-xs)', flexWrap: 'wrap' }}>
                              {!recorded && s === 'Ready' && <RowAction label="Missing" onClick={() => markMissing(r.key)} />}
                              {!recorded && mark && <RowAction label="Undo" onClick={() => clearMark(r.key)} />}
                            </span>
                          </article>
                        )
                      })}
                      {visible.length === 0 && (
                        <EmptyState
                          title="No items match these filters"
                          actionLabel="Clear all filters"
                          onAction={() => { setFilter('All'); setQuery('') }}
                        />
                      )}
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                        <thead>
                          <tr style={{ background: 'var(--th-bg)' }}>
                            {['', 'Equipment', 'Serial', 'Qty', 'Status', 'Location', 'Marked At', ''].map((h, i) => (
                              <th key={h || i} style={th}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map((r) => {
                            const s = stateOf(r.key)
                            const mark = marks[r.key]
                            const tone = STATUS[ROW_TONE[s]]
                            const recorded = r.prior !== null
                            return (
                              <tr key={r.key} style={{ borderBottom: '1px solid var(--border)', opacity: recorded ? 0.7 : 1 }}>
                                <td style={{ ...td, width: 26 }}>
                                  <input
                                    type="checkbox"
                                    checked={s === 'Picked Up'}
                                    disabled={recorded}
                                    aria-label={`Mark ${r.name} picked up`}
                                    title={recorded ? 'Recorded in an earlier session' : undefined}
                                    onChange={() => (mark?.state === 'Picked Up' ? clearMark(r.key) : pick(r.key))}
                                  />
                                </td>
                                <td style={td}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                                    {r.required && (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', height: 15, padding: '0 5px', borderRadius: 4, background: 'var(--st-primary-bg)', color: 'var(--st-primary-fg)', fontSize: 'var(--t-meta)', fontWeight: 700 }}>
                                        Required
                                      </span>
                                    )}
                                  </span>
                                  <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{r.group}</span>
                                </td>
                                <td className="identifier" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                                  {r.serial ? (
                                    <Link to={`/inventory/${r.serial}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                                      {r.serial}
                                    </Link>
                                  ) : (
                                    <span style={{ color: 'var(--muted)' }}>—</span>
                                  )}
                                </td>
                                <td className="figure" style={td}>{r.qty}</td>
                                <td style={td}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 'var(--r-badge)', background: tone.bg, color: tone.fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                                    {s}
                                  </span>
                                  {recorded && <span style={{ marginLeft: 6, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>earlier session</span>}
                                </td>
                                <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{r.location ?? '—'}</td>
                                <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                                  {mark?.pickedAtIso ? formatAdDateTime(mark.pickedAtIso) : '—'}
                                </td>
                                <td style={{ ...td, width: 120 }}>
                                  <span style={{ display: 'flex', gap: 'var(--sp-xs)', justifyContent: 'flex-end' }}>
                                    {!recorded && s === 'Ready' && <RowAction label="Missing" onClick={() => markMissing(r.key)} />}
                                    {!recorded && mark && <RowAction label="Undo" onClick={() => clearMark(r.key)} />}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                          {visible.length === 0 && (
                            <tr>
                              <td colSpan={8} style={{ padding: 'var(--sp-xl)', textAlign: 'center', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                                <EmptyState
                                  title="No items match these filters"
                                  actionLabel="Clear all filters"
                                  onAction={() => { setFilter('All'); setQuery('') }}
                                />
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>

                {/* ── §11 Session Gates, Evidence, Signatures — kept intact ── */}
                <Card title="Session Gates">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                    {gates.map((g) => (
                      <div key={g.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '7px 9px', borderRadius: 'var(--r-sm)', background: g.passing ? 'var(--st-in-bg)' : 'var(--st-progress-bg)' }}>
                        <Icon name={g.passing ? 'checklist' : 'alert_triangle'} size={14} style={{ color: g.passing ? 'var(--st-in-fg)' : 'var(--st-progress-fg)', marginTop: 2, flexShrink: 0 }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: g.passing ? 'var(--st-in-fg)' : 'var(--text)' }}>{g.label}</div>
                          {!g.passing && g.blocking && <div style={{ fontSize: 'var(--t-meta)', color: 'var(--st-progress-fg)', marginTop: 2 }}>{g.blocking}</div>}
                        </div>
                        {!g.passing && g.resolve && (
                          <button type="button" onClick={g.resolve} style={{ minHeight: 44, border: 'none', background: 'transparent', color: 'var(--link)', fontWeight: 600, fontSize: 'var(--t-meta)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                            Mark Cleared →
                          </button>
                        )}
                        {/* §11.4 calls these three overridable; this build cannot record an
                            override, so the marker says so rather than promising a way past. */}
                        {!g.passing && g.overridable && (
                          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', whiteSpace: 'nowrap', alignSelf: 'center' }}>Override unavailable</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* §11.2 — the booking condition is information, never a gate.
                      "Items Handed Over" would have blocked session 1 forever. */}
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>Booking Condition</div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="info" size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                      {allResolved
                        ? 'All items handed over or accounted for — completing this session sets the booking to On Rent.'
                        : `${outUnits} of ${totalUnits} unit${totalUnits === 1 ? '' : 's'} out — partial. The booking stays Packed with Partial Pickup; untouched items remain for a later session.`}
                    </div>
                  </div>

                  {/* §11.4 — Manager override on gates 1, 3, 4 only, and refused until it
                      has an approver and somewhere to be recorded. See OVERRIDE_UNAVAILABLE. */}
                  {overridableFailing && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>Manager Override</div>
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
                        style={{ width: '100%', minHeight: 44, padding: 7, borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', resize: 'vertical' }}
                      />
                      <div style={{ marginTop: 6 }}>
                        <Unavailable reason={OVERRIDE_UNAVAILABLE}>
                          <button
                            id="override-unavailable"
                            type="button"
                            disabled
                            style={{ minHeight: 44, padding: '0 12px', borderRadius: 'var(--r-btn)', fontSize: 'var(--t-meta)', fontWeight: 600, fontFamily: 'inherit', cursor: 'not-allowed', background: 'var(--card2)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                          >
                            Apply Override
                          </button>
                        </Unavailable>
                      </div>
                    </div>
                  )}

                  {/* §9.1 Evidence — ⭐ RULED, PLAN.md §4.31: one photo per
                      BOOKING, not per case (there is no case model). Honest
                      about its own maturity: the count is local, no file is
                      uploaded; capture and storage live in the Evidence
                      Workspace. */}
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', flex: 1 }}>Evidence</span>
                      <Link to={`/rentals/${id}/evidence`} style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}>View All</Link>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--t-meta)' }}>
                      <Icon
                        name={photoCount > 0 ? 'checklist' : 'alert_triangle'}
                        size={13}
                        style={{ color: photoCount > 0 ? 'var(--success-text)' : 'var(--progress-text)', flexShrink: 0 }}
                      />
                      <span style={{ flex: 1, color: 'var(--text2)' }}>Booking photo — required before completion</span>
                      <span className="figure" style={{ color: 'var(--muted)' }}>{photoCount}</span>
                      <RowAction label="Take Photo" onClick={() => setPhotoCount((n) => n + 1)} />
                    </div>
                    <p style={{ margin: '7px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                      Ruled mandatory (§4.31): one photo per booking, not per case. This count is local to this
                      session — no photo is uploaded from here yet.
                    </p>
                  </div>

                  {/* §9.2 Signatures — captured at session close, never before.
                      Names come off real records: the booking's client, the
                      signed-in operator. Timestamps are the capture instant. */}
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Signatures</div>
                    <SigRow
                      label="Receiver"
                      sig={signatures.receiver}
                      onCapture={() => captureSignature('receiver')}
                      required
                      disabled={dispatching}
                      {...(floor.clientName === null
                        ? { unavailable: 'This booking names no client, so there is no receiver identity to sign as.' }
                        : {})}
                    />
                    <SigRow
                      label="Warehouse Staff"
                      sig={signatures.warehouse}
                      onCapture={() => captureSignature('warehouse')}
                      required
                      disabled={dispatching}
                      {...(user === null
                        ? { unavailable: 'You are not signed in, so there is no operator identity to sign as.' }
                        : {})}
                    />
                    {/* Driver renders only when the delivery method has one, and is
                        recorded absent with a named reason — same witness precedent. */}
                    {driverNeeded && <SigRow label="Driver" sig={undefined} required={false} disabled={dispatching} unavailable={DRIVER_UNAVAILABLE} />}
                    {/* §9.2 — optional, and uncapturable: there is no witness identity on this screen to sign as. */}
                    <SigRow label="Witness" sig={undefined} required={false} disabled={dispatching} unavailable={WITNESS_UNAVAILABLE} />
                  </div>
                </Card>
              </div>

              {/* ── right rail ─────────────────────────────────────────── */}
              <FloorAside collapsible={desktop} side="right" width={300} label="Handover summary">
                {/* §10 — no Outstanding, no Deposit Pending here (§13.1). Warehouse sees no money. */}
                <Card title="Handover Summary" action={<span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{pct}%</span>}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)' }}>
                    <Ring pct={pct} />
                    <div>
                      <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                        {outUnits} / {totalUnits}
                      </div>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Units out</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    {([
                      ['Picked Up', outUnits, 'var(--success-text)'],
                      ['Remaining', readyUnits, 'var(--progress-text)'],
                      ['Missing', missingUnits, 'var(--danger-text)'],
                    ] as const).map(([l, v, c]) => (
                      <div key={l} style={{ display: 'flex', gap: 'var(--sp-sm)', padding: '3px 0', fontSize: 'var(--t-meta)' }}>
                        <Icon name="dot" size={9} style={{ color: c, marginTop: 4 }} />
                        <span style={{ flex: 1, color: 'var(--text2)' }}>{l}</span>
                        <span className="figure" style={{ fontWeight: 700 }}>{v}</span>
                      </div>
                    ))}
                    {priorRows.length > 0 && (
                      <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                        {priorRows.length} item{priorRows.length === 1 ? ' was' : 's were'} recorded by an earlier
                        session and {priorRows.length === 1 ? 'is' : 'are'} shown, not re-dispatched.
                      </p>
                    )}
                  </div>
                </Card>

                <Card title="Missing Items">
                  {missingRows.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No missing items this session.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {missingRows.map((r) => (
                        <div key={r.key}>
                          <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{r.name}</div>
                          <input
                            value={marks[r.key]?.reason ?? ''}
                            onChange={(e) => setReason(r.key, e.target.value)}
                            placeholder={`Reason (min ${MIN_REASON} characters)`}
                            aria-label={`Reason ${r.name} is missing`}
                            /* Law 15 — a typed field on a touch device, inside a
                               blocking gate: the Law 10 reason is entered here. */
                            style={{ width: '100%', minHeight: 44, marginTop: 5, padding: '0 8px', borderRadius: 'var(--r-input)', border: `1px solid ${(marks[r.key]?.reason ?? '').trim().length < MIN_REASON ? 'var(--danger)' : 'var(--input-border)'}`, background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
                          />
                          <div style={{ marginTop: 6 }}>
                            <Button icon="refresh" onClick={() => clearMark(r.key)}>Undo</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card title="Session Notes">
                  <textarea
                    value={sessionNotes}
                    onChange={(e) => setSessionNotes(e.target.value)}
                    placeholder="Notes for this handover session (saved onto the session when it completes)…"
                    aria-label="Handover session notes"
                    rows={3}
                    style={{ width: '100%', minHeight: 64, padding: '8px 9px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', resize: 'vertical' }}
                  />
                  <p style={{ margin: '7px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                    Written to <span className="identifier">operation_sessions.notes</span> with the dispatch —
                    nothing is saved until this session completes.
                  </p>
                </Card>

                {/* Law 12 — inline and persistent, never a toast. This is what
                    the operator sees instead of being navigated away from a
                    session that was never recorded. */}
                {dispatchError && <ErrorBanner title="This handover was not recorded" message={dispatchError} />}

                {scanLog.length > 0 && (
                  <div style={{ ...cardStyle, padding: 11 }}>
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Scan log</div>
                    {/* §8.3 — results are announced to screen readers. */}
                    <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
                      {scanLog.map((l, i) => (
                        <span key={i} style={{ fontSize: 'var(--t-meta)', color: l.startsWith('✕') ? 'var(--danger-text)' : 'var(--text2)' }}>{l}</span>
                      ))}
                    </div>
                  </div>
                )}
              </FloorAside>
            </div>

            {/* ── §12 footer — the single EXIT and the single primary. The seed
                build's `Saving is automatic` was false (audit :1094): every
                mark, checkbox and signature here is local until the dispatch
                lands, and the footer now says exactly that. ── */}
            <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', padding: '12px 14px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => navigate(`/rentals/${id}`)}
                style={{ minHeight: 44, padding: '0 14px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--danger-text)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancel Handover
              </button>
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                Nothing is saved until {primaryLabel} — cancelling discards this session
              </span>
              <span style={{ marginLeft: 'auto' }} title={gateSummary ?? undefined}>
                <button
                  type="button"
                  disabled={!canComplete}
                  onClick={completeSession}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    minHeight: 44,
                    padding: '0 16px',
                    borderRadius: 'var(--r-btn)',
                    fontSize: 'var(--t-ui)',
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    cursor: canComplete ? 'pointer' : 'not-allowed',
                    ...(canComplete ? BLUE_PRIMARY : { background: 'var(--card2)', color: 'var(--muted)', border: '1px solid var(--border)' }),
                  }}
                >
                  <Icon name="checklist" size={15} />
                  {dispatching ? 'Recording…' : primaryLabel}
                </button>
              </span>
            </div>
            {/* §5.6 — the disabled button's one-line summary of what is blocking it. */}
            {gateSummary && (
              <p style={{ margin: '-4px 2px 0', textAlign: 'right', fontSize: 'var(--t-meta)', color: 'var(--progress-text)', fontWeight: 600 }}>{gateSummary}</p>
            )}
            <p style={{ margin: '-4px 2px 0', textAlign: 'right', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{caption}</p>

            {/*
              One scan = one local mark; the write is Complete Session. The
              shared BarcodeScannerModal now says exactly that on match
              ("marked — recorded at session close") and emits no domain
              events — the action layer emits them after the write lands.
            */}
            <BarcodeScannerModal
              isOpen={showScanner}
              onClose={() => setShowScanner(false)}
              mode="handover"
              bookingId={id}
              items={scannableUnits}
              onItemScanned={(item) => {
                pick(item.id)
              }}
            />
          </div>
        )}
      </PageBody>
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
    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', minHeight: 44, fontSize: 'var(--t-meta)', color: checked ? 'var(--success-text)' : 'var(--text2)', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} style={{ width: 22, height: 22 }} />
      <Icon name={checked ? 'checklist' : 'alert_triangle'} size={13} />
      {label}
    </label>
  )
}

/**
 * `unavailable` is the reason a row cannot be signed on this screen (Witness
 * and Driver have no identity to capture; Receiver/Warehouse degrade to it
 * when their real record is absent). It takes precedence over `onCapture`:
 * the Capture control renders through `Unavailable`, so the reason reaches a
 * hover device via `title` AND a warehouse tablet via long-press, instead of
 * the row signing a placeholder.
 */
function SigRow({ label, sig, onCapture, required, disabled, unavailable }: { label: string; sig: Sig | undefined; onCapture?: () => void; required: boolean; disabled: boolean; unavailable?: string }) {
  const capture = { minHeight: 44, padding: '0 12px', borderRadius: 'var(--r-xs)', border: '1px solid var(--border)', background: 'var(--card2)', fontSize: 'var(--t-meta)', fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap' } as const
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        {sig ? (
          <div style={{ fontSize: 'var(--t-meta)', color: 'var(--success-text)' }}>
            Signed · {sig.name} · {sig.at}
          </div>
        ) : (
          // §9.2 — an uncapturable row renders as "Optional"/absent, never as "Pending".
          <div style={{ fontSize: 'var(--t-meta)', color: required ? 'var(--progress-text)' : 'var(--muted)' }}>
            {required ? 'Required' : `Optional — no ${label.toLowerCase()} recorded`}
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

/**
 * The floor workspaces' compact row action.
 *
 * Was a private 22px-tall `<button>` with NO hit-area expansion, duplicated
 * byte-for-byte across ReturnWorkspace, PackingWorkspace, HandoverWorkspace and
 * ResetWorkspace — half of Law 15's 44px floor, on the four screens most often
 * used with gloves on a tablet. Replaced 25 Aug 2026 by the shared
 * `CompactButton`, which keeps the 22px paint and adds the 44px target.
 *
 * Aliased rather than renamed so the call sites below read unchanged.
 */
const RowAction = CompactButton

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
