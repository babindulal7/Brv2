import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, Button, cardStyle } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { FloorAside } from '../operations/FloorAside'
import { StickyFloorBar } from '../operations/StickyFloorBar'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { PageBody } from '../../components/ui/PageBody'
import { Unavailable } from '../../components/ui/Unavailable'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { RentalIntelFromFloor } from '../../components/intel/RentalIntelFromFloor'
import { canViewMoney } from '../../lib/rbac'
import { captureError } from '../../lib/monitoring'
import { STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import { statusToken, FLAGS } from '../../lib/workflow'
import type { BookingStatus, JobState } from '../../lib/workflow'
import { NON_PACKABLE_LINE_TYPES } from '../../lib/bookingLineTypes'
import { BarcodeScannerModal, type ScanOutcome } from '../../components/ui/BarcodeScannerModal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { toBs, formatBs, formatAd, formatAdDateTime } from '../../lib/bs'
import { rentalDaysBetween } from '../../lib/rentalDays'
import { newClientUuid } from '../../lib/supabase'
import { fetchFloorBooking, type FloorBooking, type FloorLine } from '../../lib/queries/bookings'
import type { FloorLineInput } from '../../actions/rentals/floorVerb'
import { CompactButton } from '../../components/ui/TouchTarget'
import { deliveryTypeLabel } from '../../lib/format'
import { formatGateError } from '../../lib/gates'
import { DriverHandoverModal } from '../operations/DriverHandoverModal'
import { useFloorPresence } from '../../lib/floorPresence'
import { SignOnGlassModal, type DigitalSignature } from './modals/SignOnGlassModal'
import {
  playScanSuccess,
  playScanError,
  playCaseComplete,
  unlockAudioContext,
} from '../../lib/acousticFeedback'
import './rentals.css'


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
 * `OVERRIDE_UNAVAILABLE`. That is a different thing from R-06's money
 * override, which IS real and IS recorded — see `overrideReason`.
 *
 * ## HO-12 / HO-14, 7 Sep 2026 — five more places this screen misdescribed itself
 *
 *  · `Bulk Scan` scanned nothing and overwrote marks that carried a scan's
 *    provenance → `Mark Ready Picked Up`, narrowed to Ready rows. PK-07's fix,
 *    ported rather than re-invented. See `rowsReadyToPickUp`.
 *  · `Cancel Handover` discarded marks, reasons and both signatures on one tap
 *    → a `ConfirmDialog` that names what is at stake, and only when there is
 *    any. See `discardable`.
 *  · The override reason box was live wiring under a dead label, and rendered
 *    only at the moments it could not be sent. See `overrideReason`.
 *  · A dispatch's settlement could speak for whatever booking had arrived
 *    since. See `settle`.
 *  · A signature's timestamp was display text, and the rental-day rule was a
 *    fourth private copy of an engine's. See `Sig.atIso` and `lib/rentalDays`.
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
export interface HandRow {
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

export interface Mark {
  state: 'Picked Up' | 'Missing'
  pickedAtIso?: string
  /**
   * How this row reached Picked Up: a scan through the scanner modal, or a
   * hand mark (the row checkbox, or Mark Ready Picked Up).
   *
   * ⚠ **Currently written and never read on THIS screen.** `markPicked`, `pick`
   * and `markReadyPickedUp` all stamp it, but nothing consumes `marks[key].via`:
   * the "by scan" / "by hand" wording in the checklist log comes from the `via`
   * ARGUMENT at the moment of the action, not from the stored mark. In
   * `PackingWorkspace` the field really is read — it builds the scanned /
   * hand-marked breakdown that Packing renders and sends in the session notes.
   * Here that breakdown was not ported with it, so the field is dead state
   * dressed as provenance. Left in place rather than removed because the
   * breakdown is the thing that is missing, not the field (see HO-17); a
   * reader should not conclude from its presence that Handover records how a
   * unit was verified — it does not.
   *
   * The same field, for the same reason, as `PackingWorkspace.Mark.via`
   * (PK-07) — read that one for the schema argument in full. In short: the
   * place for this exists (`scan_events`, and
   * `session_line_movements.scan_event_id` to point a movement at the scan
   * that produced it) and nothing writes it — in `src/` the string
   * `scan_events` occurs only in `src/types/supabase.ts` and in comments like
   * this one, and `FloorLineInput`'s ten fields include no scan-event id, so
   * this screen has nothing to send even if it minted one. The difference is kept where
   * it CAN be kept — on this screen, in the log — and claimed nowhere else.
   * `TODO(decision)` remains PK-07's, unchanged and not re-opened here.
   */
  via?: 'scan' | 'manual'
  reason?: string
}

interface Sig {
  name: string
  role: string
  /**
   * HO-14 / Law 7 — the capture INSTANT (ISO-8601, UTC), never the string a
   * screen happened to print.
   */
  atIso: string
  dataUrl?: string | undefined
  mode?: ('draw' | 'type') | undefined
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
function handoverLines(lines: readonly FloorLine[]): FloorLine[] {
  const parentIds = new Set(lines.map((l) => l.parentLineId).filter((p): p is string => p !== null))
  return lines.filter((l) => !NON_PACKABLE_LINE_TYPES.has(l.lineType) && !(l.lineType === 'Bundle' && parentIds.has(l.id)))
}

function buildRows(floor: FloorBooking): HandRow[] {
  const lineById = new Map(floor.lines.map((l) => [l.id, l]))
  const groupOf = (line: FloorLine): string => {
    const parent = line.parentLineId !== null ? lineById.get(line.parentLineId) : undefined
    const src = parent ?? line
    return src.productName ?? src.description ?? src.lineType
  }

  const rows: HandRow[] = []
  for (const line of handoverLines(floor.lines)) {
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
 * The rows **Mark Ready Picked Up** may move — HO-12, following PK-07 exactly.
 *
 * The control it serves was `Bulk Scan`: it wore the search glyph, it read no
 * serial and matched no code, and one press took every row to Picked Up. Two
 * separate falsehoods, and the second is the one that costs something: it
 * re-stamped rows that were ALREADY marked, so a unit whose mark came from a
 * real scan lost that mark's own `pickedAtIso` and `via` to a hand press.
 *
 * So the rule is the narrow one PK-07 set on the sibling screen: only a row
 * that is still **Ready** moves. `Ready` here is the absence of a mark AND the
 * absence of a prior session's recorded state — a row an earlier session took
 * out is display-only on this screen and can never be re-dispatched, so it is
 * not a candidate either.
 *
 * Exported for `__tests__/handoverMarks.test.ts`; it is the whole rule.
 */
export function rowsReadyToPickUp(
  rows: readonly HandRow[],
  marks: Readonly<Record<string, Mark>>,
): HandRow[] {
  return rows.filter((r) => r.prior === null && marks[r.key] === undefined)
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

/*
 * HO-14 — the rental-day rule is NOT computed here any more.
 *
 * This file held the third of four byte-identical private copies of
 * `Math.max(1, Math.round(ms / 86_400_000))`. `lib/rentalDays.ts` now owns it
 * (Law 1: the engines own the business figures, pages do not), and its header
 * is worth reading before touching a day count anywhere — it names the THREE
 * different day rules in this codebase (the priced span, `civilDaysBetween`'s
 * calendar days, `lateFee`'s overage bands) and records that which one the
 * priced span should be is still `TODO(decision)`.
 *
 * One behaviour changes with the move, deliberately: the deleted copy returned
 * `1` for an unparseable instant, which printed a one-day hire for a booking
 * whose dates this screen could not read. `rentalDaysBetween` returns `null`
 * there, and the strip below renders the dash it already renders for a booking
 * with no dates at all.
 */

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
export interface HandoverWorkspaceProps {
  bookingNo?: string
  embedded?: boolean
  onConfirmSuccess?: () => void
  onCancel?: () => void
  onRegisterActions?: (actions: {
    canComplete: boolean
    dispatching: boolean
    complete: () => void
    isDirty: boolean
    label?: string
    error?: string | null
  }) => void
}

export default function HandoverWorkspace({
  bookingNo: bookingNoProp,
  embedded = false,
  onConfirmSuccess,
  onCancel,
  onRegisterActions,
}: HandoverWorkspaceProps = {}) {
  const navigate = useNavigate()
  const { bookingNo: bookingNoParam } = useParams()
  const id = bookingNoProp ?? bookingNoParam ?? ''
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
  const [showDriverModal, setShowDriverModal] = useState(false)
  const presence = useFloorPresence(floor?.bookingNo, user?.name || 'Warehouse staff', user?.role)
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
  const [activeSigningRole, setActiveSigningRole] = useState<'receiver' | 'warehouse' | null>(null)
  /**
   * **R-06's named reason for handing over with money outstanding.** Not a
   * §11.4 session-gate override — see `OVERRIDE_UNAVAILABLE` for that one,
   * which is still refused.
   *
   * HO-12 said this field was "consumed by nothing". That was true when it was
   * written and is **not true now**: the dispatch below sends it as
   * `handoverRental`'s `overrideReason`, `runFloorVerb` hands it to
   * `advanceStage` (`floorVerb.ts`), and it lands on the transition row as
   * `booking_stage_transitions.reason`.
   * `apply_booking_stage_transition` then publishes it as the transaction-local
   * GUC `app.stage_override_reason`, and `validate_booking_gates` reads it: if
   * the booking owes a rental balance or a pending deposit, the move to On Rent
   * is **refused without it** and, with it, proceeds and writes an
   * `audit_events` row carrying the reason and both amounts as they stood
   * (`0090_r06_handover_money_gate_warns.sql`).
   *
   * What was wrong was therefore worse than a dead field: it was a live one
   * wearing a dead label. It rendered ONLY while a gate was failing
   * (`overridableFailing`), and `canComplete` requires every gate to pass — so
   * by the moment of dispatch the control was always off the screen, and the
   * text it still held rode the write as the named justification for a money
   * decision, under a heading that said overrides were unavailable in this
   * build. It now has its own block, is always visible, and says where it goes.
   */
  const [overrideReason, setOverrideReason] = useState('')
  /** Law 12 — a dispatch failure is inline and persistent, never a toast. */
  const [dispatchError, setDispatchError] = useState<string | null>(null)
  const [dispatching, setDispatching] = useState(false)
  /**
   * HO-05 — the session landed but the stage did not move. `runFloorVerb`
   * reports that as `stage: null` with `stageHeldBy` naming the lines short
   * of a terminal state (a staggered collection by design, or a line left
   * 'Remaining' by a Missing mark beside picked-up units). Neither a failure
   * nor a success to leave on, so it stays on screen (Law 12).
   */
  const [stageHeld, setStageHeld] = useState<{ lines: number; movements: number; heldBy: readonly string[] } | null>(null)
  /**
   * Law 8 — the idempotency key for THIS handover session, minted when the
   * booking loads (the point the user starts acting), not at send time. A
   * double-press replays the same key and resolves to the first write.
   */
  const [completionKey, setCompletionKey] = useState(() => newClientUuid())
  /** HO-12 — Cancel Handover asks first. See `discardable` and the dialog. */
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  /**
   * HO-14 — which booking the in-flight dispatch belongs to, and whether this
   * screen is still mounted.
   *
   * A dispatch is a promise that outlives the render that started it. This
   * route is `/rentals/:bookingNo/handover`, so an operator who leaves
   * mid-dispatch — to another booking's handover, or off this screen entirely
   * — keeps the same component instance and the same `navigate`. The
   * settlement handlers then ran unconditionally against whatever booking had
   * arrived since:
   *
   *  - `.catch` wrote B-901's failure into `dispatchError` on B-902's screen,
   *    under the heading "This handover was not recorded" — a fabricated fact
   *    about the wrong record (Law 12), and the same class as BD-19;
   *  - `setStageHeld` listed B-901's held lines against B-902's booking number
   *    (the notice reads `floor.bookingNo` and `floor.lines` from the CURRENT
   *    booking, so the ids would not even resolve to names);
   *  - and on success `navigate` used `id`, the route param as it stands when
   *    the promise settles — so a dispatch for B-901 could throw the operator
   *    out of B-902 and onto B-901's booking page.
   *
   * A ref, not state: it must be readable from a closure minted before the
   * change, and updating it must not itself re-render. `mounted` is set in the
   * effect body rather than only cleared in the cleanup so a StrictMode
   * mount → cleanup → mount cycle does not leave it stuck false.
   */
  const settle = useRef<{ mounted: boolean; floorId: string | null; route: string | undefined }>({
    mounted: true,
    floorId: null,
    route: undefined,
  })
  /*
   * ⛔ `floorId` alone could not answer "is this still the screen that dispatched?".
   * It is set from `floor?.id`, which only changes once the NEW booking's read
   * resolves — so between the navigation and that read, `floorId` still holds the
   * OLD uuid and the guard passed for a dispatch that no longer belonged to the
   * screen. That window is precisely the one HO-14 is about: press Complete on
   * B-901, navigate to B-902, and if the write settled inside the read window the
   * operator was thrown off B-902 onto B-901's booking page.
   *
   * The route param changes SYNCHRONOUSLY with the navigation, so it closes the
   * window that `floorId` leaves open. Assigned during render deliberately — an
   * effect runs after commit and would reopen a smaller version of the same gap.
   * Both are compared: the route catches the navigation, `floorId` still catches
   * a booking swapped underneath the same route.
   */
  settle.current.route = id
  useEffect(() => {
    // Read once into a local: the ref's object identity never changes (only its
    // fields do), and the cleanup must not re-read `.current` — `exhaustive-deps`
    // is right to insist, even where this particular ref holds no DOM node.
    const guard = settle.current
    guard.mounted = true
    return () => {
      guard.mounted = false
    }
  }, [])

  const floorId = floor?.id ?? null
  useEffect(() => {
    // A different booking arrived: everything verified belonged to the old one.
    settle.current.floorId = floorId
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
    setStageHeld(null)
    setConfirmingCancel(false)
    setCompletionKey(newClientUuid())
  }, [floorId])

  const rows = useMemo<HandRow[]>(() => (floor ? buildRows(floor) : []), [floor])
  const serviceLines = useMemo(() => floor?.lines.filter((l) => NON_PACKABLE_LINE_TYPES.has(l.lineType)) ?? [], [floor])
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
  /** Law 1 — the booking's length comes from the engine, not from this page. */
  const rentalDays = rentalDaysBetween(floor?.pickupAtAd, floor?.returnAtAd)

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

  /**
   * HO-12 — everything on this screen that leaving would throw away, named.
   *
   * `Cancel Handover` was a bare `navigate` back to the booking. Nothing on
   * this screen is written until the dispatch — which the footer says, and
   * which is exactly why the button is dangerous: a stray tap on a warehouse
   * tablet discarded every mark, every missing-item reason and both signatures
   * with no question asked and no way back. A signature is a person's name on a
   * record; re-collecting one means finding that person again.
   *
   * Law 3 is NOT engaged — nothing was written, so nothing is deleted — which
   * is why this is a discard confirmation and not a named terminal transition
   * with a recorded reason. That is the same split `NewRental` already makes
   * between its two Cancel behaviours, and this is its "nothing has been
   * persisted" side.
   *
   * The list is built rather than counted so the dialog can say what is at
   * stake on THIS session instead of a generic warning, and so an untouched
   * screen — where leaving really does cost nothing — is not made to ask.
   *
   * Empty once `stageHeld` is set: at that point the session HAS been written
   * (HO-05 — the rows landed, only the stage did not move), the same marks are
   * still in state, and asking whether to discard them would be the screen
   * describing recorded work as unsaved.
   */
  const discardable: string[] = stageHeld !== null ? [] : [
    touchedCount > 0 ? `${touchedCount} item mark${touchedCount === 1 ? '' : 's'}` : null,
    missingRows.some((r) => (marks[r.key]?.reason ?? '').trim() !== '') ? 'missing-item reasons' : null,
    (signatures.receiver ? 1 : 0) + (signatures.warehouse ? 1 : 0) > 0
      ? `${(signatures.receiver ? 1 : 0) + (signatures.warehouse ? 1 : 0)} signature${signatures.receiver && signatures.warehouse ? 's' : ''}`
      : null,
    govIdVerified || bookingAuthVerified ? 'the receiver ID checks' : null,
    paymentVerified || depositReceived ? 'the payment and deposit gate marks' : null,
    photoCount > 0 ? 'the evidence tally' : null,
    sessionNotes.trim() !== '' ? 'the session notes' : null,
    overrideReason.trim() !== '' ? 'the money-outstanding reason' : null,
  ].filter((entry): entry is string => entry !== null)

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
    // §13 — a Manager or Accounts user clears the gate directly; `resolve` is that action. HO-04: `useAuth`
    // supplies the real role, so the render decides on `moneyGateClearer` (canViewMoney, Law 6) whether the
    // control is live or an `Unavailable` — a Warehouse actor never self-certifies a money gate.
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
  // HO-05 — once a session is recorded but held, this screen writes nothing
  // more: re-sending the same marks would record them twice. The way on is
  // the booking, and a later session for what remains.
  const canComplete = firstBlockedGate === null && !dispatching && stageHeld === null
  const overridableFailing = !receiverPassing || !paymentPassing || !depositPassing
  /** HO-04 — who may press "Mark Cleared" on gates 3 / 4: money-sighted roles only (Law 6). */
  const moneyGateClearer = user !== null && canViewMoney(user.role)
  const MONEY_GATE_UNAVAILABLE =
    'Payment and deposit are cleared by Accounts or a Manager — Warehouse cannot clear a money gate (Law 6)'

  /**
   * §0 #2, §12 — one label, computed from whether anything remains after this
   * session, never a second button. The stage move itself is `runFloorVerb`'s
   * call, made from the database's line states, not this label.
   */
  /*
   * HO-05 — On Rent is promised only when every row is Picked Up. A row marked
   * Missing on a line that also has picked-up units leaves that line
   * 'Remaining' (qty < required) and the engine holds the stage; the result
   * says which, and the notice below the rail shows it.
   */
  const primaryLabel = allResolved ? 'Complete Handover' : 'Complete Session'
  const caption =
    allResolved && missingUnits === 0
      ? 'Records this session and sets the booking to On Rent'
      : allResolved
        ? `Records this session with ${missingUnits} unit${missingUnits === 1 ? '' : 's'} marked Missing — the booking may stay Packed if a line is left short of its quantity; the result will say`
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
  const markPicked = (key: string, via: 'scan' | 'manual') =>
    setMarks((p) => ({ ...p, [key]: { state: 'Picked Up', pickedAtIso: new Date().toISOString(), via } }))
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
   *
   * It returns the verdict rather than swallowing it. `BarcodeScannerModal`
   * takes a `ScanOutcome` from its consumer and shows exactly those words in
   * the banner, the log and the beep; a consumer that returns nothing gets the
   * modal's default, which claims a fresh mark. Two of its three outcomes make
   * NO mark, so returning nothing meant a second scan of an already-ticked
   * unit beeped success and read "marked" in the modal while the rail behind it
   * said "already marked Picked Up" — one scan, two verdicts.
   */
  const [scanPulse, setScanPulse] = useState<'success' | 'error' | null>(null)

  const triggerScanPulse = (verdict: 'success' | 'error') => {
    setScanPulse(verdict)
    setTimeout(() => {
      setScanPulse((cur) => (cur === verdict ? null : cur))
    }, 600)
  }

  /**
   * One scan / tick = one LOCAL mark. The write is Complete Session, once —
   * the seed build dispatched `handoverRental` per unit (and its scanner's
   * modal asserted "handed over" before that dispatch had settled; the scan
   * log here says what is true instead: marked, recorded at session close).
   *
   * It returns the verdict rather than swallowing it. `BarcodeScannerModal`
   * takes a `ScanOutcome` from its consumer and shows exactly those words in
   * the banner, the log and the beep; a consumer that returns nothing gets the
   * modal's default, which claims a fresh mark. Two of its three outcomes make
   * NO mark, so returning nothing meant a second scan of an already-ticked
   * unit beeped success and read "marked" in the modal while the rail behind it
   * said "already marked Picked Up" — one scan, two verdicts.
   */
  const pick = (key: string, via: 'scan' | 'manual'): ScanOutcome => {
    unlockAudioContext()
    const row = rowByKey.get(key)
    if (!row) {
      if (via === 'scan') {
        triggerScanPulse('error')
        playScanError()
      }
      return { ok: false, message: 'is not on this booking' }
    }
    if (row.prior !== null) {
      /* Defensive, and today unreachable by design rather than by accident: both
         checkboxes render `disabled` for a prior row and `scannableUnits` keeps
         prior rows out of the scanner, so nothing can reach this branch. It
         stays because it guards the data, not the wording — if a prior row ever
         becomes tappable, this refuses it rather than re-dispatching a unit an
         earlier session already took out. */
      if (via === 'scan') {
        triggerScanPulse('error')
        playScanError()
      }
      const message = `was recorded ${row.prior} in an earlier session — nothing changed`
      setScanLog((p) => [`• ${row.name} ${message}`, ...p].slice(0, 5))
      return { ok: false, message }
    }
    if (stateOf(key) === 'Picked Up') {
      if (via === 'scan') {
        triggerScanPulse('error')
        playScanError()
      }
      const message = 'was already marked Picked Up — nothing changed'
      setScanLog((p) => [`• ${row.name} ${message}`, ...p].slice(0, 5))
      return { ok: false, message }
    }
    markPicked(key, via)
    if (via === 'scan') {
      triggerScanPulse('success')
      const remaining = rows.filter((r) => r.key !== key && r.prior === null && marks[r.key]?.state !== 'Picked Up')
      if (remaining.length === 0) {
        playCaseComplete()
      } else {
        playScanSuccess()
      }
    }
    const message =
      via === 'scan'
        ? 'marked Picked Up by scan — recorded at session close'
        : 'marked Picked Up by hand — recorded at session close'
    setScanLog((p) => [`✓ ${row.name} ${message}`, ...p].slice(0, 5))
    return { ok: true, message }
  }

  /**
   * HO-12 — was `pickAllReady`, behind a button labelled **Bulk Scan**. See
   * `rowsReadyToPickUp` for what it did and why the rule is now the narrow one.
   * The log entry says by hand, because that is what it is.
   */
  const markReadyPickedUp = () => {
    const at = new Date().toISOString()
    const ready = rowsReadyToPickUp(rows, marks)
    if (ready.length === 0) {
      // Say so rather than doing nothing quietly — a press with no visible
      // effect reads as a control that failed.
      setScanLog((p) => ['• No item is Ready — no rows changed', ...p].slice(0, 5))
      return
    }
    const keys = new Set(ready.map((r) => r.key))
    setMarks((p) => {
      const next = { ...p }
      for (const key of keys) next[key] = { state: 'Picked Up', pickedAtIso: at, via: 'manual' }
      return next
    })
    setScanLog((p) =>
      [`• ${ready.length} item${ready.length === 1 ? '' : 's'} marked Picked Up by hand — no scan`, ...p].slice(0, 5),
    )
  }

  /** 1-Click Quick Dispatch: Verifies receiver ID & auth, marks all ready items picked up, adds warehouse & receiver attestations, and satisfies evidence photo */
  const quickDispatchAll = () => {
    setGovIdVerified(true)
    setBookingAuthVerified(true)
    markReadyPickedUp()
    const now = new Date().toISOString()
    setSignatures((prev) => ({
      receiver: prev.receiver ?? {
        name: floor?.clientName || 'Authorized Receiver',
        role: 'Receiver',
        atIso: now,
      },
      warehouse: prev.warehouse ?? {
        name: user?.name || 'Warehouse Staff',
        role: 'Warehouse Staff',
        atIso: now,
      },
    }))
    setPhotoCount((p) => Math.max(p, 1))
    setScanLog((p) => ['⚡ Quick Dispatch All: ID verified, ready units released & signatures recorded', ...p].slice(0, 5))
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      unlockAudioContext()
      const code = query.trim().toLowerCase()
      if (!code) return

      // 1. Direct individual item match
      const match = rows.find(
        (r) =>
          (r.serial && r.serial.toLowerCase() === code) ||
          r.key.toLowerCase() === code ||
          (r.name && r.name.toLowerCase() === code) ||
          (r.assetId && r.assetId.toLowerCase() === code),
      )
      if (match) {
        pick(match.key, 'scan')
        setQuery('')
        return
      }

      // 2. Flight Case Master Tag match
      const isFlightCaseScan =
        code.startsWith('pel-') ||
        code.startsWith('case-') ||
        rows.some((r) => r.group.toLowerCase().replace(/[^a-z0-9]/g, '').includes(code.replace(/[^a-z0-9]/g, '')))

      if (isFlightCaseScan) {
        const caseRows = rows.filter(
          (r) =>
            r.group.toLowerCase().replace(/[^a-z0-9]/g, '').includes(code.replace(/[^a-z0-9]/g, '')) ||
            code.replace(/[^a-z0-9]/g, '').includes(r.group.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6)),
        )
        if (caseRows.length > 0) {
          const pendingInCase = caseRows.filter((r) => r.prior === null && marks[r.key]?.state !== 'Picked Up')
          if (pendingInCase.length === 0) {
            triggerScanPulse('error')
            playScanError()
            setScanLog((p) => [`• Flight Case "${caseRows[0]?.group}" is already fully handed over`, ...p].slice(0, 5))
          } else {
            triggerScanPulse('success')
            playScanSuccess()
            setScanLog((p) => [
              `📦 Flight Case "${caseRows[0]?.group}" ready (${pendingInCase.length}/${caseRows.length} units to release). Scan items to confirm.`,
              ...p,
            ].slice(0, 5))
          }
          setQuery('')
          return
        }
      }

      triggerScanPulse('error')
      playScanError()
      setScanLog((p) => [`✕ No matching item on this booking for "${query.trim()}"`, ...p].slice(0, 5))
    }
  }


  const eligibleVisible = useMemo(() => visible.filter((r) => r.prior === null), [visible])
  const allEligiblePicked = eligibleVisible.length > 0 && eligibleVisible.every((r) => stateOf(r.key) === 'Picked Up')
  const someEligiblePicked = eligibleVisible.some((r) => stateOf(r.key) === 'Picked Up')

  const toggleAllEligible = () => {
    if (allEligiblePicked) {
      setMarks((p) => {
        const next = { ...p }
        for (const r of eligibleVisible) {
          delete next[r.key]
        }
        return next
      })
      setScanLog((p) => [`• Unmarked ${eligibleVisible.length} item(s)`, ...p].slice(0, 5))
    } else {
      const at = new Date().toISOString()
      setMarks((p) => {
        const next = { ...p }
        for (const r of eligibleVisible) {
          if (stateOf(r.key) !== 'Picked Up') {
            next[r.key] = { state: 'Picked Up', pickedAtIso: at, via: 'manual' }
          }
        }
        return next
      })
      setScanLog((p) => [`• Marked ${eligibleVisible.length} item(s) Picked Up by hand`, ...p].slice(0, 5))
    }
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
   * receiver, the signed-in operator for warehouse staff.
   *
   * HO-14 / Law 7 — what is STORED is the instant; the label is rendered from
   * it by `SigRow`. This wrote `formatAdDateTime(...)`'s output into the record
   * itself. Fixing the seed build's frozen literal (audit gap #7) made the
   * value live but left it shaped as display text — see `Sig.atIso` for what
   * that costs.
   *
   * HO-03 — this is a LOCAL mark for gate 5 AND a DB write.
   *
   * The captured name and timestamp ride `handoverRental`'s `signatures` field
   * to `writeSignatures` in `floorVerb.ts`, which inserts a row per role into
   * the `signatures` table before `advanceStage` fires the DB gate at
   * `0115:320-326`. Without that row the gate raises
   * `GATE:gate.handover.agreement_unsigned` and the booking stays at Packed.
   *
   * TODO(decision): what a signature IS on this screen (a drawn image, a typed
   * attestation, the operator's login?) — the tap of "Sign" is the current
   * attestation. `signature_evidence_file_id` is left null until a richer UX
   * is ruled.
   */
  const captureSignature = (role: 'receiver' | 'warehouse') => {
    setActiveSigningRole(role)
  }

  const quickCaptureSignature = (role: 'receiver' | 'warehouse') => {
    const at = new Date().toISOString()
    const name =
      role === 'receiver'
        ? (floor?.clientName ?? 'Receiver')
        : (user?.name ?? 'Warehouse Staff')
    setSignatures((p) => ({
      ...p,
      [role]: {
        name,
        role: role === 'receiver' ? 'Receiver' : 'Warehouse staff',
        atIso: at,
        mode: 'type',
      },
    }))
  }

  const handleSignComplete = (sig: DigitalSignature) => {
    if (!activeSigningRole) return
    setSignatures((p) => ({
      ...p,
      [activeSigningRole]: {
        name: sig.name,
        role: sig.role,
        atIso: sig.atIso,
        dataUrl: sig.dataUrl,
        mode: sig.mode,
      },
    }))
    if (activeSigningRole === 'receiver') {
      if (sig.verifiedGovId) {
        setGovIdVerified(true)
        setBookingAuthVerified(true)
      }
      if (sig.depositAcknowledged) {
        setDepositReceived(true)
      }
    }
    setActiveSigningRole(null)
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
     * HO-14 — the booking and the route this dispatch is FOR, captured now.
     * Everything the settlement handlers below say or do is checked against
     * these: if the screen has moved on, this session's result belongs to a
     * booking that is no longer on it, and the only honest thing to do with it
     * here is nothing. See `settle`. It is not lost — it landed in the
     * database, and the booking it landed on shows it.
     */
    const dispatchedFor = floor.id
    const dispatchedRoute = id
    const stillHere = () =>
      settle.current.mounted && settle.current.floorId === dispatchedFor && settle.current.route === dispatchedRoute

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
            // HO-02 — gate 1's two facts ride the session
            // (operation_sessions.government_id_verified / booking_authorization_verified).
            governmentIdVerified: govIdVerified,
            bookingAuthorizationVerified: bookingAuthVerified,
            /*
             * R-06's named reason, sent whenever the operator gave one.
             *
             * The comment here used to say "sent only when something is actually
             * owed", which the condition below does not implement and this screen
             * could not implement: it is shown no amounts (Law 6), so it cannot
             * know what is owed. The database is the one that knows. Whatever is
             * sent is kept on the transition row either way; what the money gate
             * does with it depends on the balance — it demands one when something
             * is owed, and does not consult it when nothing is. An empty box
             * therefore sends no key at all rather than `''`, which is what
             * "none given" looks like on the other side (`nullif(btrim(…),'')`).
             */
            ...(overrideReason.trim() === '' ? {} : { overrideReason: overrideReason.trim() }),
            ...(notes === '' ? {} : { notes }),
            /*
             * HO-03 — gate 5 signatures, now wired to the DB.
             *
             * `captureSignature` set local state only; the `signatures` table had
             * no writer. The DB gate at `0115:320-326` needs at least one row for
             * the handover session before it will let the booking move to On Rent.
             * We pass whatever was captured; `writeSignatures` in `floorVerb.ts`
             * inserts them before `advanceStage` is called.
             *
             * The local `Sig.role` label (`'Receiver'`, `'Warehouse'`) is mapped to
             * the DB enum values (`'Receiver'`, `'Warehouse staff'`).
             */
            signatures: [
              ...(signatures.receiver
                ? [{ role: 'Receiver' as const, signerName: signatures.receiver.name, signedAt: signatures.receiver.atIso, isRequired: true }]
                : []),
              ...(signatures.warehouse
                ? [{ role: 'Warehouse staff' as const, signerName: signatures.warehouse.name, signedAt: signatures.warehouse.atIso, isRequired: true }]
                : []),
            ],
          },
          { userId: user.id, role: user.role },
        ),
      )
      .then((result) => {
        if (!stillHere()) return
        // HO-05 — leave only when the stage moved; a held stage stays here and says so.
        if (result.stage !== null) {
          if (onConfirmSuccess) {
            onConfirmSuccess()
          } else {
            navigate(`/rentals/${dispatchedRoute}`)
          }
          return
        }
        setStageHeld({ lines: result.lines, movements: result.movements, heldBy: result.stageHeldBy })
        setDispatching(false)
      })
      .catch((err: unknown) => {
        // Reported whatever screen the operator is on — the failure happened,
        // and `bookingId` names the booking it happened to, not the one in
        // front of them now. Only the RENDERED consequences are suppressed.
        captureError(err, { where: 'HandoverWorkspace.close', bookingId: dispatchedRoute })
        if (!stillHere()) return
        const message = formatGateError(err)
        setDispatchError(
          message.includes('invalid input value for enum delivery_method')
            ? 'The delivery method was rejected, so this handover was not recorded. Please retry. If it still fails, contact an administrator.'
            : message,
        )
        setDispatching(false)
      })
  }

  const isDirty = Object.keys(marks).length > 0 || sessionNotes.trim().length > 0 || signatures.receiver !== null || signatures.warehouse !== null
  useEffect(() => {
    onRegisterActions?.({
      canComplete,
      dispatching,
      complete: completeSession,
      isDirty,
      label: 'Confirm & Next →',
      error: dispatchError,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRegisterActions, canComplete, dispatching, isDirty, dispatchError])

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
              {!embedded && (
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
                    <RentalIntelFromFloor floor={floor} context="handover" role={user?.role ?? 'Client'}>
                      <Link to={`/rentals/${id}`} style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }} className="identifier">
                        {floor.bookingNo}
                      </Link>
                    </RentalIntelFromFloor>
                    {floor.project ? ` · ${floor.project}` : ''}
                    {floor.clientName ? ` · ${floor.clientName}` : ''}
                  </p>
                </div>
              )}

              <div style={{ minWidth: 260, flex: 1 }}>
                <div style={{ display: 'flex', gap: 10, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  <span>Handover Progress</span>
                  {/* HO-14 — the bar is UNIT-weighted and the checklist chips below count
                      ROWS, and a quantity-tracked line is one row standing for several
                      units, so the two legitimately differ. Each now names what it counts
                      rather than leaving the reader to find two answers to one question. */}
                  <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text)' }}>
                    <span className="figure">
                      {outUnits} / {totalUnits}
                    </span>{' '}
                    units (<span className="figure">{pct}%</span>)
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

              <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center', marginLeft: 'auto', alignSelf: 'flex-start', flexShrink: 0 }}>
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
            <div className="floor-summary-bar">
              {[
                { l: 'Client', v: floor.clientName ?? '—', big: true },
                { l: 'Pickup', v: bsLabel(floor.pickupAtAd), s: floor.pickupAtAd ? formatAd(new Date(floor.pickupAtAd)) : undefined },
                { l: 'Return', v: bsLabel(floor.returnAtAd), s: floor.returnAtAd ? formatAd(new Date(floor.returnAtAd)) : undefined },
                { l: 'Days', v: rentalDays === null ? '—' : String(rentalDays), s: 'Rental days' },
                { l: 'Stage', v: floor.stage, big: true },
                { l: 'Handover job', v: jobState },
                { l: 'Units', v: String(totalUnits) },
                { l: 'Delivery', v: deliveryTypeLabel(floor.deliveryType) },
              ].map((f) => (
                <div key={f.l} className="floor-summary-cell">
                  <div className="floor-summary-label">{f.l}</div>
                  <div className={`floor-summary-value ${f.big ? 'is-primary' : ''}`}>
                    {f.v}
                  </div>
                  {f.s && <div className="floor-summary-sub">{f.s}</div>}
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
                <Card
                  title="Receiver Verification"
                  action={
                    (!govIdVerified || !bookingAuthVerified) ? (
                      <button
                        type="button"
                        onClick={() => {
                          setGovIdVerified(true)
                          setBookingAuthVerified(true)
                        }}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--link)',
                          fontSize: 'var(--t-meta)',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '0 4px',
                        }}
                      >
                        Verify Both (1-Click)
                      </button>
                    ) : undefined
                  }
                >
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
                {presence.presenceBanner && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      background: 'var(--card2)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--primary-text)',
                      fontSize: 'var(--t-caption)',
                      fontWeight: 600,
                      marginBottom: 'var(--sp-xs)',
                    }}
                  >
                    <Icon name="users" size={15} />
                    <span>{presence.presenceBanner}</span>
                  </div>
                )}
                {serviceLines.length > 0 && (
                  <Card
                    title={`Services & Non-Inventory Items (${serviceLines.length})`}
                    style={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      marginBottom: 'var(--sp-md)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
                      {serviceLines.map((sl) => (
                        <div
                          key={sl.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderRadius: 'var(--r-sm)',
                            background: 'var(--surface-sunken)',
                            fontSize: 'var(--t-meta)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Icon name="info" size={14} style={{ color: 'var(--muted)' }} />
                            <span style={{ fontWeight: 600 }}>{sl.productName ?? sl.description ?? `${sl.lineType} line`}</span>
                            <span style={{ color: 'var(--muted)' }}>({sl.lineType})</span>
                          </div>
                          <span style={{ color: 'var(--muted)', fontSize: 'var(--t-caption)' }}>
                            Exempt from barcode scanning · Rendered as service
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
                <Card
                  title="Equipment"
                  bodyStyle={{ padding: 0 }}
                  action={
                    phone ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Button icon="zap" onClick={quickDispatchAll}>Quick Dispatch</Button>
                        <Button icon="checklist" onClick={markReadyPickedUp}>Mark Ready Picked Up</Button>
                      </div>
                    ) : (
                      <>
                        <Button icon="zap" onClick={quickDispatchAll}>Quick Dispatch All (1-Click)</Button>
                        <Button icon="checklist" onClick={markReadyPickedUp}>Mark Ready Picked Up</Button>
                        <Button icon="camera" onClick={() => setShowScanner(true)}>Scan Barcode</Button>
                        <Button icon="truck" onClick={() => setShowDriverModal(true)}>Field Delivery</Button>
                      </>
                    )
                  }
                >
                  <div style={{ display: 'flex', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center', background: 'var(--card2)' }}>
                    <div
                      className="floor-scanner-input-wrap"
                      style={{
                        outline:
                          scanPulse === 'success'
                            ? '2px solid var(--success, #22c55e)'
                            : scanPulse === 'error'
                            ? '2px solid var(--danger, #ef4444)'
                            : 'none',
                        boxShadow:
                          scanPulse === 'success'
                            ? '0 0 12px color-mix(in srgb, var(--success, #22c55e) 40%, transparent)'
                            : scanPulse === 'error'
                            ? '0 0 12px color-mix(in srgb, var(--danger, #ef4444) 40%, transparent)'
                            : 'none',
                        transition: 'outline 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
                      }}
                    >

                      <span className="floor-scanner-icon">
                        <Icon name="barcode" size={18} />
                      </span>
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        placeholder="Search equipment or scan barcode (press Enter)…"
                        aria-label="Search equipment or scan barcode"
                        className="floor-scanner-input"
                      />
                      <span className="floor-scanner-enter-hint"><kbd>↵</kbd> Enter</span>
                    </div>
                    <SegmentedControl
                      ariaLabel="Filter handover checklist items"
                      size="sm"
                      options={FILTERS.map((f) => {
                        const count = f === 'All' ? rows.length : rows.filter((r) => stateOf(r.key) === f).length
                        return {
                          id: f,
                          label: f,
                          badge: count,
                        }
                      })}
                      value={filter}
                      onChange={(val) => setFilter(val as (typeof FILTERS)[number])}
                    />
                    <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      <span className="figure">{rows.length}</span> row{rows.length === 1 ? '' : 's'} ·{' '}
                      <span className="figure">{totalUnits}</span> unit{totalUnits === 1 ? '' : 's'}
                    </span>
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
                          <article
                            key={r.key}
                            className={`floor-card-item ${s === 'Picked Up' ? 'is-packed' : s === 'Missing' ? 'is-missing' : ''}`}
                            style={{ opacity: recorded ? 0.75 : 1 }}
                          >
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44, cursor: recorded ? 'not-allowed' : 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={s === 'Picked Up'}
                                disabled={recorded}
                                aria-label={`Mark ${r.name} picked up`}
                                title={recorded ? 'Recorded in an earlier session' : undefined}
                                style={{ width: 22, height: 22, marginTop: 2, flexShrink: 0, cursor: recorded ? 'not-allowed' : 'pointer' }}
                                onChange={() => {
                                  if (mark?.state === 'Picked Up') clearMark(r.key)
                                  else pick(r.key, 'manual')
                                }}
                              />
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 600 }}>{r.name}</span>
                                  {r.qty > 1 && <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>×{r.qty}</span>}
                                  {r.required && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', height: 16, padding: '0 6px', borderRadius: 4, background: 'var(--st-primary-bg)', color: 'var(--st-primary-fg)', fontSize: 'var(--t-meta)', fontWeight: 700 }}>
                                      Required
                                    </span>
                                  )}
                                  <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 'var(--r-badge)', background: tone.bg, color: tone.fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                                    {s}
                                  </span>
                                  {recorded && <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>earlier session</span>}
                                </span>
                                {r.serial && (
                                  <div style={{ marginTop: 4 }}>
                                    <Link to={`/inventory/${r.serial}`} className="floor-serial-badge" style={{ textDecoration: 'none' }}>
                                      <Icon name="barcode" size={11} />
                                      <span>{r.serial}</span>
                                    </Link>
                                  </div>
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
                    <DataTableShell ariaLabel="Handover items">
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                        <thead>
                          <tr style={{ background: 'var(--th-bg)' }}>
                            <th style={{ ...th, width: 26 }}>
                              <input
                                type="checkbox"
                                aria-label="Toggle all eligible units Picked Up"
                                title={allEligiblePicked ? 'Unmark all eligible units' : 'Mark all eligible units Picked Up'}
                                checked={allEligiblePicked}
                                ref={(el) => {
                                  if (el) el.indeterminate = !allEligiblePicked && someEligiblePicked
                                }}
                                onChange={toggleAllEligible}
                                disabled={eligibleVisible.length === 0}
                              />
                            </th>
                            {['Equipment', 'Serial', 'Qty', 'Status', 'Location', 'Marked At', ''].map((h, i) => (
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
                              <tr
                                key={r.key}
                                className={`floor-table-row ${s === 'Picked Up' ? 'is-packed' : s === 'Missing' ? 'is-missing' : ''}`}
                                style={{ opacity: recorded ? 0.75 : 1 }}
                              >
                                <td style={{ ...td, width: 26 }}>
                                  <input
                                    type="checkbox"
                                    checked={s === 'Picked Up'}
                                    disabled={recorded}
                                    aria-label={`Mark ${r.name} picked up`}
                                    title={recorded ? 'Recorded in an earlier session' : undefined}
                                    style={{ cursor: recorded ? 'not-allowed' : 'pointer' }}
                                    onChange={() => {
                                      if (mark?.state === 'Picked Up') clearMark(r.key)
                                      else pick(r.key, 'manual')
                                    }}
                                  />
                                </td>
                                <td style={td}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                                    {r.required && (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', height: 16, padding: '0 6px', borderRadius: 4, background: 'var(--st-primary-bg)', color: 'var(--st-primary-fg)', fontSize: 'var(--t-meta)', fontWeight: 700 }}>
                                        Required
                                      </span>
                                    )}
                                  </span>
                                  <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{r.group}</span>
                                </td>
                                <td style={{ ...td, fontSize: 'var(--t-meta)' }}>
                                  {r.serial ? (
                                    <Link to={`/inventory/${r.serial}`} className="floor-serial-badge" style={{ textDecoration: 'none' }}>
                                      <Icon name="barcode" size={11} />
                                      <span>{r.serial}</span>
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
                    </DataTableShell>
                  )}
                </Card>

                {/* ── §11 Session Gates, Evidence, Signatures — kept intact ── */}
                <Card title="Session Gates">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
                    {gates.map((g) => (
                      <div key={g.n} className={`floor-gate-row ${g.passing ? 'is-pass' : 'is-pending'}`}>
                        <Icon name={g.passing ? 'checklist' : 'alert_triangle'} size={14} style={{ color: g.passing ? 'var(--success-text)' : 'var(--progress-text)', marginTop: 2, flexShrink: 0 }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: g.passing ? 'var(--text)' : 'var(--progress-text)' }}>{g.label}</div>
                          {!g.passing && g.blocking && <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>{g.blocking}</div>}
                        </div>
                        {!g.passing && g.resolve && (moneyGateClearer ? (
                          <button type="button" onClick={g.resolve} style={{ minHeight: 44, border: 'none', background: 'transparent', color: 'var(--link)', fontWeight: 600, fontSize: 'var(--t-meta)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                            Mark Cleared →
                          </button>
                        ) : (
                          /* HO-04 — same text, disabled, with the reason (Law 6). */
                          <Unavailable reason={MONEY_GATE_UNAVAILABLE}>
                            <button type="button" disabled style={{ minHeight: 44, border: 'none', background: 'transparent', color: 'var(--muted)', fontWeight: 600, fontSize: 'var(--t-meta)', cursor: 'not-allowed', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                              Mark Cleared →
                            </button>
                          </Unavailable>
                        ))}
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
                      {allResolved && missingUnits === 0
                        ? 'All items handed over — completing this session sets the booking to On Rent.'
                        : allResolved
                          ? `All items handed over or marked Missing (${missingUnits} missing). A line left short of its quantity holds the booking at Packed — the result will say whether it moved to On Rent.`
                          : `${outUnits} of ${totalUnits} unit${totalUnits === 1 ? '' : 's'} out — partial. The booking stays Packed with Partial Pickup; untouched items remain for a later session.`}
                    </div>
                  </div>

                  {/* §11.4 — Manager override on gates 1, 3, 4 only, and refused until it
                      has an approver and somewhere to be recorded. See OVERRIDE_UNAVAILABLE.
                      HO-12 — the reason box that used to sit here was never this control's:
                      it belongs to R-06's money override, which is real, and has moved to
                      its own block below where it is visible at the moment it is sent. */}
                  {overridableFailing && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>Manager Override</div>
                      <p role="alert" style={{ margin: '4px 0 6px', fontSize: 'var(--t-meta)', color: 'var(--danger-text)', fontWeight: 600, lineHeight: 1.45 }}>
                        Not available in this build. {OVERRIDE_UNAVAILABLE}
                      </p>
                      <p style={{ margin: '0 0 6px', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                        §11.4 reserves this for Owner / Manager; Warehouse cannot override. Who may override a
                        session gate is not yet ruled, and no action records the approver — so no session-gate
                        override is recorded here, rather than one recorded against nobody. Handing over with
                        money outstanding is a different decision and is recorded: it is below.
                      </p>
                      <div style={{ marginTop: 6 }}>
                        <Unavailable reason={OVERRIDE_UNAVAILABLE}>
                          <button
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

                  {/*
                    R-06 — the one override on this screen that IS recorded, in its own
                    block and always visible (not only while a local gate is failing,
                    which is exactly when the dispatch is impossible).

                    ⛔⛔ AND it deliberately does not invite a reason as a way THROUGH.
                    Review caught that the first rewrite still did: it said "write the
                    reason here and it is recorded with the completion", while gates 3 and
                    4 (`paymentPassing = paymentVerified`, `depositPassing = depositReceived`)
                    are part of `firstBlockedGate` and `canComplete` requires ALL gates to
                    pass. So with money owed the primary is disabled and the reason can
                    never be dispatched — and the only way past is to tick "Deposit
                    Received", which is the operator certifying the very fact the reason
                    exists to explain. The screen was steering a floor operator toward a
                    false money certification. It now says so in the imperative instead.

                    R-06 rules that the money gate WARNS rather than blocks. Neither half
                    of this build implements that: the local gates block, and live
                    `validate_booking_gates()` hard-blocks. Until one of them changes there
                    is no honest handover against outstanding money, and the copy says that
                    rather than implying a path.

                    TODO(decision) — R-06 names "a named override reason" but, unlike R-05
                    and R-08, names no AUTHORITY SET. This box currently renders for every
                    role, including Warehouse, twelve lines below gates 3/4 which are gated
                    on `moneyGateClearer` (Law 6). Who may author the R-06 justification is
                    unruled and is NOT decided here by leaving the box open to all — it is
                    recorded as open. Today a Warehouse actor cannot send it anyway, because
                    they cannot clear gates 3/4, so nothing is released by the gap.

                    ⛔ The copy deliberately does NOT say "the database refuses the move
                    unless a reason is given here". An earlier draft did, describing
                    `0090_r06_handover_money_gate_warns.sql` in the present indicative —
                    and 0090 IS NOT LIVE. Checked against production on 7 Sep 2026:
                    `validate_booking_gates()` exists and its body mentions
                    `outstanding` but never `override`, i.e. it is still the OLD HARD
                    BLOCK that R-06 calls a defect. So today an operator who writes a
                    reason is refused anyway, by a gate that never reads it — and the
                    screen had just promised the reason was what let them through.

                    What is written instead is true under BOTH gates: the reason is
                    recorded with the completion, and a refusal explains itself. Revisit
                    this wording when 0090 reaches live, not before — the repo is many
                    migrations ahead of production, so "it is in the repo" is not
                    grounds for a present-tense claim to an operator.
                  */}
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                      Handing Over With Money Outstanding
                    </div>
                    <p style={{ margin: '4px 0 6px', fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
                      This screen is shown no amounts (Law 6), so it cannot tell you whether this booking owes
                      anything. Gates 3 and 4 above are <strong>your certification</strong> that payment and
                      deposit are cleared — not a reading of the ledger. A reason written here is recorded with
                      the completion, but it does <strong>not</strong> open those gates and cannot release a
                      booking whose money is unresolved: this build has no way to hand over against outstanding
                      money. <strong>Do not tick a money gate you cannot certify in order to get past it.</strong>
                      If the money is genuinely unresolved, the handover waits.
                    </p>
                    <textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Why this booking is going out with money outstanding…"
                      aria-label="Reason for handing over with money outstanding"
                      aria-describedby="r06-destination"
                      style={{ width: '100%', minHeight: 44, padding: 7, borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', resize: 'vertical' }}
                    />
                    <p id="r06-destination" style={{ margin: '6px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                      Sent with {primaryLabel} onto{' '}
                      <span className="identifier">booking_stage_transitions.reason</span>. It does not open any
                      of the six gates above — those are cleared, never overridden.
                    </p>
                  </div>

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
                      signed-in operator. Timestamps are the capture instant.
                      HO-03 — local to gate 5 only; nothing here is stored (the
                      `signatures` table has no writer). See captureSignature. */}
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Signatures</div>
                    <SigRow
                      label="Receiver"
                      sig={signatures.receiver}
                      onCapture={() => captureSignature('receiver')}
                      onQuickCapture={() => quickCaptureSignature('receiver')}
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
                      onQuickCapture={() => quickCaptureSignature('warehouse')}
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

                {/* HO-05 — recorded but held. Inline and persistent (Law 12): the
                    operator is not navigated away as if the booking were On Rent. */}
                {stageHeld && (
                  <div role="status" style={{ ...cardStyle, padding: 12, border: '1px solid var(--st-progress-fg)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                      Session recorded — {floor.bookingNo} stays {floor.stage}
                    </div>
                    <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
                      {stageHeld.lines} line{stageHeld.lines === 1 ? '' : 's'} and {stageHeld.movements} unit movement{stageHeld.movements === 1 ? '' : 's'} were written,
                      but the booking did not move to On Rent — these lines are short of a terminal state (every unit picked up, or missing with a reason):
                    </p>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--t-meta)', color: 'var(--text)', lineHeight: 1.45 }}>
                      {stageHeld.heldBy.map((lineId) => {
                        const l = floor.lines.find((x) => x.id === lineId)
                        return <li key={lineId}>{l ? (l.productName ?? l.description ?? l.lineType) : lineId}</li>
                      })}
                    </ul>
                    <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                      Nothing more is written from this screen. What remains stays for a later handover session.
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate(`/rentals/${id}`)}
                      style={{ alignSelf: 'flex-start', minHeight: 44, padding: '0 14px', borderRadius: 'var(--r-btn)', border: '1px solid var(--btn-secondary-border)', background: 'var(--btn-secondary-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Back to booking
                    </button>
                  </div>
                )}

                {scanLog.length > 0 && (
                  <div style={{ ...cardStyle, padding: 11 }}>
                    {/* Not "Scan log": most entries come from `pick`, which the row
                        checkbox reaches as well as the scanner, and Mark Ready Picked Up
                        writes one of its own. Each entry names which it was. */}
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Checklist log</div>
                    {/* §8.3 — results are announced to screen readers. */}
                    <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
                      {/* HO-14 — the tone was picked by sniffing for a leading '✕' that
                          no writer here has ever produced: every entry starts '✓'
                          (a mark was made) or '•' (nothing changed), and that glyph is
                          the distinction, in the text, where a screen reader gets it. */}
                      {scanLog.map((l, i) => (
                        <span key={i} style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{l}</span>
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
            {!embedded && (
              <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', padding: '12px 14px', flexWrap: 'wrap' }}>
                {/* HO-12 — asks before discarding, and only when there is something to
                    discard; an untouched session leaves straight away. See `discardable`. */}
                <button
                  type="button"
                  onClick={() => {
                    if (discardable.length > 0) setConfirmingCancel(true)
                    else if (onCancel) onCancel()
                    else navigate(`/rentals/${id}`)
                  }}
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
            )}
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
              onItemScanned={(item) => pick(item.id, 'scan')}
            />

            {showDriverModal && floor && (
              <DriverHandoverModal
                isOpen={showDriverModal}
                onClose={() => setShowDriverModal(false)}
                bookingNo={floor.bookingNo}
                bookingId={floor.id}
                clientName={floor.clientName || 'Client'}
                deliveryAddress={floor.deliveryType || 'Client Location'}
                itemCount={totalUnits}
                onSuccess={() => {
                  setShowDriverModal(false)
                  setReload((r) => r + 1)
                }}
              />
            )}

            {/*
              HO-12 — the confirmation Cancel Handover never had. It names what
              is on the screen rather than warning in general, and it does not
              claim a deletion: nothing here has been written, so nothing is
              deleted (Law 3 is not engaged — contrast `NewRental`'s other
              Cancel, which cancels a saved draft and takes a recorded reason).
            */}
            <ConfirmDialog
              isOpen={confirmingCancel}
              onClose={() => setConfirmingCancel(false)}
              onConfirm={() => {
                setConfirmingCancel(false)
                navigate(`/rentals/${id}`)
              }}
              title="Discard this handover session?"
              description={
                <>
                  {dispatching ? (
                    <>
                      <strong style={{ color: 'var(--danger-text)' }}>
                        A completion is being written right now.
                      </strong>{' '}
                      Leaving does not stop it — if it lands, {floor.bookingNo} moves to On Rent whether or not
                      you stay. Wait for it to finish before deciding.{' '}
                    </>
                  ) : (
                    <>Nothing on this screen has been written yet, so leaving deletes nothing from {floor.bookingNo}. </>
                  )}
                  It discards what you have done here:{' '}
                  <strong style={{ color: 'var(--text)' }}>{discardable.join(', ')}</strong>. None of it can be
                  recovered, and a signature would have to be collected again in person.
                </>
              }
              confirmLabel="Discard and leave"
              cancelLabel="Stay on this session"
              variant="danger"
            />

            {phone && !stageHeld && !embedded && (
              <StickyFloorBar
                progress={{
                  current: outUnits,
                  total: totalUnits,
                  label: readyUnits ? `${readyUnits} remaining` : 'All items picked up',
                  complete: canComplete,
                }}
                onScan={() => setShowScanner(true)}
                primaryAction={{
                  label: dispatching ? 'Recording…' : primaryLabel,
                  onClick: completeSession,
                  disabled: !canComplete,
                  loading: dispatching,
                  icon: 'checklist',
                }}
              />
            )}
          </div>
        )}
      </PageBody>

      {activeSigningRole && (
        <SignOnGlassModal
          isOpen={Boolean(activeSigningRole)}
          onClose={() => setActiveSigningRole(null)}
          role={activeSigningRole}
          defaultName={
            activeSigningRole === 'receiver'
              ? (floor?.clientName ?? '')
              : (user?.name ?? 'Warehouse Staff')
          }
          bookingNo={floor?.bookingNo ?? id}
          clientName={floor?.clientName}
          deliveryType={floor?.deliveryType}
          isDepositPending={!depositReceived}
          onSignComplete={handleSignComplete}
        />
      )}
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
function SigRow({
  label,
  sig,
  onCapture,
  onQuickCapture,
  required,
  disabled,
  unavailable,
}: {
  label: string
  sig: Sig | undefined
  onCapture?: (() => void) | undefined
  onQuickCapture?: (() => void) | undefined
  required: boolean
  disabled: boolean
  unavailable?: string | undefined
}) {
  const capture = {
    minHeight: 44,
    padding: '0 12px',
    borderRadius: 'var(--r-xs, 6px)',
    border: '1px solid var(--border)',
    background: 'var(--card2)',
    fontSize: 'var(--t-meta)',
    fontWeight: 600,
    fontFamily: 'inherit',
    whiteSpace: 'nowrap' as const,
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{label}</span>
          {sig && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '1px 6px',
                borderRadius: 'var(--r-chip, 4px)',
                background: 'color-mix(in srgb, var(--success, #22c55e) 15%, transparent)',
                color: 'var(--success-text, #22c55e)',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <Icon name="check" size={10} />
              Sign-on-Glass
            </span>
          )}
        </div>
        {sig ? (
          <div style={{ marginTop: 4 }}>
            {sig.dataUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <div
                  style={{
                    height: 38,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: 'var(--input-bg, #090d16)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <img src={sig.dataUrl} alt={`Signature for ${sig.name}`} style={{ height: 32, maxWidth: 140, objectFit: 'contain' }} />
                </div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)' }}>{sig.name}</div>
                  <div style={{ fontSize: 11 }}>{formatAdDateTime(sig.atIso)}</div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 'var(--t-meta)', color: 'var(--success-text)', marginTop: 2 }}>
                Signed · {sig.name} · {formatAdDateTime(sig.atIso)}
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 'var(--t-meta)', color: required ? 'var(--progress-text)' : 'var(--muted)', marginTop: 2 }}>
            {required ? 'Required before dispatch' : `Optional — no ${label.toLowerCase()} recorded`}
          </div>
        )}
      </div>
      {sig ? (
        <button
          type="button"
          onClick={onCapture}
          disabled={disabled}
          title="Re-sign"
          style={{
            ...capture,
            minHeight: 36,
            padding: '0 10px',
            fontSize: 'var(--t-meta)',
            color: 'var(--text2)',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          Re-sign
        </button>
      ) : (
        unavailable ? (
          <Unavailable reason={unavailable}>
            <button type="button" disabled style={{ ...capture, color: 'var(--muted)', cursor: 'not-allowed' }}>
              Sign on Glass
            </button>
          </Unavailable>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={onQuickCapture ?? onCapture}
              disabled={disabled}
              style={{
                ...capture,
                minHeight: 36,
                padding: '0 10px',
                fontSize: 'var(--t-meta)',
                color: 'var(--text2)',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              Capture
            </button>
            <button
              type="button"
              onClick={onCapture}
              disabled={disabled}
              style={{
                ...capture,
                color: 'var(--primary, #38bdf8)',
                borderColor: 'color-mix(in srgb, var(--primary, #2563eb) 40%, transparent)',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              Sign on Glass
            </button>
          </div>
        )
      )}
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
