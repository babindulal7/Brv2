import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, Button, cardStyle } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { FloorAside } from '../operations/FloorAside'
import { StickyFloorBar } from '../operations/StickyFloorBar'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { PageBody } from '../../components/ui/PageBody'
import { STATUS, jobStateChip } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import { statusToken } from '../../lib/workflow'
import type { BookingStatus, JobState } from '../../lib/workflow'
import { BarcodeScannerModal } from '../../components/ui/BarcodeScannerModal'
import { Input } from '../../components/ui/Input'
import { Unavailable } from '../../components/ui/Unavailable'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { captureError } from '../../lib/monitoring'
import { formatBsOrAd, formatAd, formatAdDateTime } from '../../lib/bs'
/* `lateBand` and its two formatters return no monetary value — that is the
   whole reason they exist. `lib/money.ts` stays unimported here (§8.3). */
import { lateBand, formatOverage, bandConsequence } from '../../lib/lateFee'
import { newClientUuid } from '../../lib/supabase'
import { fetchFloorBooking, type FloorBooking, type FloorLine } from '../../lib/queries/bookings'
/* Law 1 — the engine owns the rule, this screen only renders it. `0003:399`'s
   "unresolved Not Returned" is answered in `floorVerb.ts`; re-listing the three
   decisions here would be a second copy to drift (RT-03). */
import { notReturnedDecisionEndsLine, type FloorLineInput } from '../../actions/rentals/floorVerb'
import type { ItemCondition, NotReturnedDecision } from '../../types/database'
import { CompactButton } from '../../components/ui/TouchTarget'
import { deliveryTypeLabel } from '../../lib/format'
import { formatGateError } from '../../lib/gates'
import { clearFloorScan, loadFloorScan, saveFloorScan } from '../../lib/floorScanStorage'
import { rentalDaysBetween } from '../../lib/rentalDays'
import {
  playScanSuccess,
  playScanError,
  playCaseComplete,
  playDamageAlert,
  unlockAudioContext,
} from '../../lib/acousticFeedback'
import { SignOnGlassModal, type DigitalSignature } from './modals/SignOnGlassModal'
import './rentals.css'


/**
 * **Return & Inspection Workspace** — the floor-loop model
 * (`PackingWorkspace.tsx`) applied to the third floor verb. One screen for
 * receiving and inspecting, per `Inspection Workflow.md`'s own words
 * ("Inspection is not a separate workspace"). Three moves, in order:
 *
 *  1. **Read** — `fetchFloorBooking` (`lib/queries/bookings.ts`, Law 2's one
 *     floor read) resolves `:bookingNo` to the booking head plus its live
 *     `booking_lines` / `booking_line_units` / `product_units`. Every row on
 *     this screen is one of those rows; the 18-unit `data/returnInspection`
 *     seed is gone, and with it the `B-715`-only `BookingNotLoaded` guard.
 *  2. **Verify** — receipt, condition, damage detail, not-returned triage all
 *     live in a `marks` map KEYED ON the real rows. Local until dispatch,
 *     committed by the action, never the other way round.
 *  3. **Dispatch** — Complete Session collapses the marks onto their parent
 *     `booking_lines` (`buildReturnLines`) and dispatches `completeReturn`
 *     with the REAL ids the operator verified — the write that lands
 *     `operation_sessions`, `return_lines` and `session_line_movements`, and
 *     moves the stage to Returned only when every live line is terminal —
 *     which a Not Returned line is only once its decision ends it (`0003:399`;
 *     see the RT-03 note below). It used to send `lines: []`, which `validateFloorVerb`
 *     refuses unconditionally, so the one write on this page always failed.
 *     Navigation happens only on the resolved promise.
 *
 * **Engine constraints made explicit in code** (`FloorLineInput` carries one
 * outcome / one condition / one decision per booking LINE):
 *  · a MIXED line (some units received, some not) dispatches `done` with the
 *    received units' movements — `moved < required` lands the row
 *    `Outstanding` (`0003`, `return_line_state` has no partial member) — and
 *    the missing units' reasons and decisions ride the session notes;
 *  · a line whose received units carry DIFFERENT conditions is recorded at
 *    the WORST of them (erring toward flagging, never toward clearing), with
 *    the per-unit split carried on the session notes;
 *  · a line whose missing units carry different decisions is BLOCKED by a
 *    named gate rather than one decision being silently invented.
 *
 * **Return is multi-session by design** (`0003:129`, staggered collection;
 * `CLOSES_WHILE_INCOMPLETE.Return = true`), so — unlike Packing — "every item
 * resolved" is NOT a gate here. A session that received three of eighteen
 * items completes honestly, the booking stays On Rent, and `runFloorVerb`
 * reports the holding lines in `stageHeldBy`.
 *
 * **"Resolved" is not the same as "finished" (RT-03, 7 Sep 2026.)** A line
 * declared Not Returned with the decision `'Still expected'` is triaged, but
 * the item is by definition still out, so `0003:399` — "any unresolved Not
 * Returned blocks Stage 10 Completed" — keeps the booking at On Rent. The
 * engine decides that (`notReturnedDecisionEndsLine`); this screen imports the
 * answer rather than restating the rule, so its completion copy cannot promise
 * a stage move on the ground the verb will refuse.
 *
 * Be exact about the limit of that, because an earlier draft of this paragraph
 * was not: importing the predicate is NOT a guarantee the two agree. The verb
 * asks it of every live line of the booking — including lines this session
 * never saw — while the screen asks it only of the rows in front of the
 * operator. So a mixed booking can read "completing dispatches the Return" here
 * and still not move, and nothing on the screen corrects that after dispatch.
 * The copy is indicative; `runFloorVerb`'s answer is the one that counts, and
 * `allResolved` is deliberately never a gate.
 *
 * **No money, anywhere.** Foundation §8.3 — this is a warehouse floor screen.
 * `lib/money.ts` is not imported; the overrun renders through `lateBand`,
 * which exists precisely to answer "how late" without a rupee figure.
 *
 * **Signatures** are captured here (returning person by typed name, warehouse
 * staff as the signed-in operator, witness deliberately uncapturable — see
 * `WITNESS_UNAVAILABLE`) and ride the dispatch inside
 * `operation_sessions.notes`. No dedicated signature record exists on this
 * write path yet, and the panel says so instead of implying one.
 */

/** §13 sibling convention — the workspace primary is `--primary` in both themes, never green. */
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

/** Spec 03 — one filled primary per workspace; the scan-first affordance keeps the accent as an outline. */
// Same correction as BLUE_PRIMARY above: --cat-1 is a chart hue, not the app
// primary. The text-safe primary is the readable ink on a card.
const ACCENT_OUTLINE = { background: 'transparent', color: 'var(--primary-text)', border: '1px solid var(--primary)' } as const

/**
 * The reason the Witness row cannot be signed. Stated on the control rather
 * than solved with a name, because the name would be invented — the fabricated
 * `'Bikash Thapa'` witness this file once shipped is the precedent.
 */
const WITNESS_UNAVAILABLE =
  'No witness identity is captured on this screen, so a witness signature cannot be attested here. §9 makes the witness optional — this return is recorded with no witness rather than with an invented one.'

/**
 * The three states a row can hold. `Outstanding` is the absence of a mark;
 * `Returned` and `Not Returned` are the two outcomes `FloorLineOutcome` can
 * carry ('done' | 'missing'). A unit the read reports as already `Returned`
 * (an earlier session's receipt) renders as Returned with no controls and is
 * excluded from this session's dispatch — received once, recorded once.
 */
type RowState = 'Outstanding' | 'Returned' | 'Not Returned'

const FILTERS = ['All', 'Outstanding', 'Returned', 'Not Returned'] as const

const ROW_TONE: Record<RowState, StatusKey> = {
  Outstanding: 'out', // §4.2 — solid green, "still out" with the client.
  Returned: 'in', // soft green, "back in".
  'Not Returned': 'danger',
}

const CONDITION_TONE: Record<ItemCondition, StatusKey> = {
  Excellent: 'in',
  Good: 'in',
  Fair: 'progress',
  Damaged: 'danger',
  Lost: 'danger',
}

/** Ordered mild → severe; `worstCondition` picks the highest index. */
const CONDITIONS: readonly ItemCondition[] = ['Excellent', 'Good', 'Fair', 'Damaged', 'Lost']

/** `0003:378` — mandatory on every Not Returned line. Members of `not_returned_decision`. */
const DECISIONS: readonly NotReturnedDecision[] = [
  'Still expected',
  'Charge replacement',
  'Insurance claim',
  'Write off',
]

/** Law 10's floor: the DB CHECK behind every `not_returned_reason` in migration 0003. */
const MIN_REASON = 10

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
 */
interface ReturnRow {
  key: string
  lineId: string
  assetId: string | null
  serial: string | null
  name: string
  /** Units this row stands for: 1 per physical unit, `booking_lines.qty` for a quantity row. */
  qty: number
  location: string | null
  /** Bundle / flight-case parent grouping tag. */
  group: string
  /**
   * `booking_line_units.unit_state === 'Returned'` — this unit came back in an
   * EARLIER session. Rendered as Returned, offered no controls, and excluded
   * from this session's dispatch so a receipt is never recorded twice.
   */
  alreadyReturned: boolean
}

interface Mark {
  state: 'Returned' | 'Not Returned'
  returnedAtIso?: string
  /** §6.3 — a radio group's single value; supplying it is what marks the line Inspected. */
  condition?: ItemCondition
  damageDescription?: string
  /** A LOCAL tally — no file is uploaded from this screen; the Evidence Workspace owns the files. */
  damagePhotos?: number
  reason?: string
  decision?: NotReturnedDecision
}

/**
 * Flatten the booking's lines into checklist rows — the same shape
 * `PackingWorkspace.buildRows` builds, minus the bundle tree (Return has no
 * left rail; the list is the whole triage surface).
 */
function buildRows(floor: FloorBooking): ReturnRow[] {
  const lineById = new Map(floor.lines.map((l) => [l.id, l]))
  const groupOf = (line: FloorLine): string => {
    const parent = line.parentLineId !== null ? lineById.get(line.parentLineId) : undefined
    const src = parent ?? line
    return src.productName ?? src.description ?? `${src.lineType} bundle`
  }

  const rows: ReturnRow[] = []
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
          location: u.location,
          group: groupOf(line),
          alreadyReturned: u.unitState === 'Returned',
        })
      })
    } else {
      // A quantity-tracked line (or one whose units are simply unassigned):
      // one row for the whole line, triaged as one. `unitsPresence === 'absent'`
      // is handled before this function is called — an absent embed must never
      // read as "no units" (the defect bookingQuery.ts:110-113 records).
      rows.push({
        key: `line:${line.id}`,
        lineId: line.id,
        assetId: null,
        serial: null,
        name,
        qty: line.qty,
        location: null,
        group: groupOf(line),
        alreadyReturned: false,
      })
    }
  }
  return rows
}

/** The most severe of the given conditions, or null when none was recorded. */
function worstCondition(conds: readonly ItemCondition[]): ItemCondition | null {
  let worst: ItemCondition | null = null
  for (const c of conds) {
    if (worst === null || CONDITIONS.indexOf(c) > CONDITIONS.indexOf(worst)) worst = c
  }
  return worst
}

/**
 * Collapse the operator's marks back onto booking lines — the dispatch payload.
 *
 * One entry per line (`validateFloorVerb` refuses duplicates), and a line
 * nobody touched is NOT named: absence is never converted into a state
 * (0003:630). Rows already returned in an earlier session are excluded — their
 * receipt is on record. Per line:
 *
 *  - only Not Returned marks → `outcome: 'missing'` with the reasons joined
 *    (each already ≥ 10 chars by the gate) and the ONE decision the gate
 *    guarantees the line's units share (`0003:378` demands one per line);
 *  - any Returned marks → `outcome: 'done'` carrying the scanned
 *    `product_units.id`s (one movement row each), the received quantity, and
 *    the WORST condition among the received units — `return_lines` carries one
 *    condition per line, and recording the worst errs toward flagging. A
 *    MIXED line (some received, some not) lands `done` short of its required
 *    qty — `return_lines.state = 'Outstanding'` — with the missing units'
 *    reasons and decisions carried on the session notes so nothing is dropped;
 *    the stage is held truthfully, which `runFloorVerb` reports in
 *    `stageHeldBy`.
 *
 * Damage on a serialised unit is now a `damage_findings` row, raised by the
 * verb against the unit and parented on this line's `return_lines` row
 * (BUG_AUDIT_LIFECYCLE RT-02). It used to ride the session notes and vanish
 * into free text. Two things still ride the notes, because they have nowhere
 * else to go: damage on a QUANTITY line, which names no unit and so cannot
 * parent a finding (`damage_findings.unit_id` is NOT NULL), and the photo
 * tally, which is local — pretending it uploaded something would fabricate
 * evidence.
 */
function buildReturnLines(
  lines: readonly FloorLine[],
  rows: readonly ReturnRow[],
  marks: Record<string, Mark>,
): { payload: FloorLineInput[]; extraNotes: string[] } {
  const byLine = new Map<string, ReturnRow[]>()
  for (const r of rows) {
    if (r.alreadyReturned) continue
    const bucket = byLine.get(r.lineId)
    if (bucket) bucket.push(r)
    else byLine.set(r.lineId, [r])
  }

  const payload: FloorLineInput[] = []
  const extraNotes: string[] = []

  for (const line of lines) {
    const lineRows = byLine.get(line.id) ?? []
    const returned = lineRows.filter((r) => marks[r.key]?.state === 'Returned')
    const missing = lineRows.filter((r) => marks[r.key]?.state === 'Not Returned')
    if (returned.length === 0 && missing.length === 0) continue

    const lineName = line.productName ?? line.description ?? line.id

    if (returned.length === 0) {
      const decisions = [...new Set(missing.map((r) => marks[r.key]?.decision).filter((d): d is NotReturnedDecision => d !== undefined))]
      payload.push({
        bookingLineId: line.id,
        outcome: 'missing',
        reason: missing.map((r) => (marks[r.key]?.reason ?? '').trim()).join('; '),
        // The gate blocks a mixed-decision line, so at most one arrives here.
        ...(decisions[0] === undefined ? {} : { notReturnedDecision: decisions[0] }),
      })
      continue
    }

    const conds = returned
      .map((r) => marks[r.key]?.condition)
      .filter((c): c is ItemCondition => c !== undefined)
    const worst = worstCondition(conds)
    const scanned = returned.filter((r) => r.assetId !== null)

    /* One finding per damaged or lost UNIT — `return_lines` carries the line's
       worst condition, which cannot say which unit it was. Only serialised rows
       qualify: a quantity row resolves no `product_units.id`. */
    const damage = returned
      .filter((r) => {
        const c = marks[r.key]?.condition
        return r.assetId !== null && (c === 'Damaged' || c === 'Lost')
      })
      .map((r) => ({
        unitId: r.assetId as string,
        condition: marks[r.key]?.condition as 'Damaged' | 'Lost',
        description: (marks[r.key]?.damageDescription ?? '').trim(),
      }))

    payload.push({
      bookingLineId: line.id,
      ...(scanned.length > 0
        ? {
            unitIds: scanned.map((r) => r.assetId as string),
            serials: scanned.map((r) => r.serial ?? ''),
          }
        : {}),
      qty: returned.reduce((n, r) => n + r.qty, 0),
      ...(worst === null ? {} : { condition: worst }),
      ...(damage.length > 0 ? { damage } : {}),
    })

    if (new Set(conds).size > 1) {
      extraNotes.push(
        `${lineName}: mixed conditions — the line is recorded at the worst (${worst}); per unit: ` +
          returned.map((r) => `${r.serial ?? r.name}: ${marks[r.key]?.condition ?? '—'}`).join('; '),
      )
    }
    if (missing.length > 0) {
      extraNotes.push(
        `${lineName}: ${missing.length} of ${lineRows.length} unit(s) not returned — ` +
          missing
            .map((r) => `${r.serial ?? r.name}: ${(marks[r.key]?.reason ?? '').trim()} (decision: ${marks[r.key]?.decision ?? 'none'})`)
            .join('; '),
      )
    }
  }

  for (const r of rows) {
    const m = marks[r.key]
    if (!m || m.state !== 'Returned') continue
    if (m.condition !== 'Damaged' && m.condition !== 'Lost') continue
    const photos = `${m.damagePhotos ?? 0} photo(s) counted locally on the floor; none uploaded from this screen.`
    extraNotes.push(
      r.assetId === null
        ? `${r.name} returned ${m.condition}: ${(m.damageDescription ?? '').trim()} — this line tracks a quantity, ` +
            `not serialised units, so no damage finding could be raised against a unit and this note is the only ` +
            `record. ${photos}`
        : `${r.name}${r.serial ? ` (${r.serial})` : ''} returned ${m.condition} — a damage finding was raised ` +
            `against the unit, pending approval. ${photos}`,
    )
  }

  return { payload, extraNotes }
}

/** The AD span between two instants in whole days, floored at 1 (Law 9's days-explicit floor). */
function rentalDays(pickupIso: string, returnIso: string): number {
  return rentalDaysBetween(pickupIso, returnIso) ?? 1
}

/**
 * BS where the engine can name it, the **English date** otherwise.
 *
 * The dash survives for `!iso` — no instant, nothing to render. It no longer
 * survives the second case: an instant outside `bs.ts`'s BS table is still a
 * date, and dashing it hid a known return date on every row once the clock left
 * Shrawan 2083. `formatBsOrAd` owns that fallback.
 */
function bsLabel(iso: string | null): string {
  if (!iso) return '—'
  return formatBsOrAd(new Date(iso))
}

/** A local signature capture — name + instant. Rides the session notes on dispatch. */
interface Sig {
  name: string
  atIso: string
  role?: string | undefined
  dataUrl?: string | undefined
  mode?: string | undefined
}


/*
 * ⭐ RULED 12 Aug 2026 (Rulings §3): operations are ROUTES.
 * `/rentals/:bookingNo/return` is the only mount, and `bookingNo` comes off
 * the route for ANY booking — resolved by `fetchFloorBooking`, not compared
 * against a seed.
 */
export interface ReturnWorkspaceProps {
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

/** Determines cinema-specific optical or sensor inspection requirements */
export function getCinemaQcItem(name: string): { label: string; passedLabel: string; failedLabel: string; type: 'sensor' | 'optics' | 'motor' | 'rf' } | null {
  const lower = name.toLowerCase()
  if (lower.includes('fx3') || lower.includes('camera') || lower.includes('body') || lower.includes('sensor') || lower.includes('red') || lower.includes('arri') || lower.includes('komodo')) {
    return { label: 'Sensor QC', passedLabel: 'Sensor Clean ✓', failedLabel: 'Sensor Dust / Scratch ✕', type: 'sensor' }
  }
  if (lower.includes('lens') || lower.includes('zoom') || lower.includes('prime') || lower.includes('anamorphic') || lower.includes('optics') || lower.includes('collimator')) {
    return { label: 'Optics QC', passedLabel: 'Optics Clear ✓', failedLabel: 'Glass Scratched / Hazy ✕', type: 'optics' }
  }
  if (lower.includes('ronin') || lower.includes('gimbal') || lower.includes('stabilizer')) {
    return { label: 'Motor QC', passedLabel: 'Motor Balanced ✓', failedLabel: 'Motor Stalled / Loose ✕', type: 'motor' }
  }
  if (lower.includes('monitor') || lower.includes('wireless') || lower.includes('teradek') || lower.includes('transmitter')) {
    return { label: 'RF QC', passedLabel: 'RF Linked ✓', failedLabel: 'No Link / Broken Antenna ✕', type: 'rf' }
  }
  return null
}

export default function ReturnWorkspace({

  bookingNo: bookingNoProp,
  embedded = false,
  onConfirmSuccess,
  onCancel,
  onRegisterActions,
}: ReturnWorkspaceProps = {}) {
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

  interface PersistedReturnScan {
    marks: Record<string, Mark>
    scanLog: string[]
    sessionNotes: string
    returningName: string
    sigReturning: Sig | null
    sigWarehouse: Sig | null
  }

  /* ── triage state, keyed on the real rows ────────────────────────────────
   * `marks` holds only rows the operator touched; absence is Outstanding.
   * Local until Complete Session dispatches — dispatch-then-commit, where
   * "commit" is the navigation away on the resolved promise. */
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const [restoredFromStorage, setRestoredFromStorage] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')
  const [query, setQuery] = useState('')
  const [scanLog, setScanLog] = useState<string[]>([])
  const [sessionNotes, setSessionNotes] = useState('')
  /** §9 — captured on this screen, written into the session notes with the dispatch. */
  const [returningName, setReturningName] = useState('')
  const [sigReturning, setSigReturning] = useState<Sig | null>(null)
  const [sigWarehouse, setSigWarehouse] = useState<Sig | null>(null)
  /**
   * Law 12 — a dispatch failure is inline and persistent, and navigation
   * happens only on a resolved promise. A blocked gate is never a toast.
   */
  const [dispatchError, setDispatchError] = useState<string | null>(null)
  const [dispatching, setDispatching] = useState(false)
  /**
   * Law 8 — the idempotency key for THIS return session, minted when the
   * booking loads (the point the user starts acting), not at send time. A
   * double-press replays the same key and resolves to the first write.
   */
  const [completionKey, setCompletionKey] = useState(() => newClientUuid())

  const floorId = floor?.id ?? null
  useEffect(() => {
    setDispatchError(null)
    setDispatching(false)
    setCompletionKey(newClientUuid())

    if (floorId) {
      const persisted = loadFloorScan<PersistedReturnScan>('return', floorId)
      if (
        persisted &&
        (Object.keys(persisted.payload.marks || {}).length > 0 ||
          (persisted.payload.sessionNotes || '').trim() !== '' ||
          (persisted.payload.returningName || '').trim() !== '' ||
          persisted.payload.sigReturning !== null ||
          persisted.payload.sigWarehouse !== null)
      ) {
        setMarks(persisted.payload.marks || {})
        setScanLog(persisted.payload.scanLog || [])
        setSessionNotes(persisted.payload.sessionNotes || '')
        setReturningName(persisted.payload.returningName || '')
        setSigReturning(persisted.payload.sigReturning ?? null)
        setSigWarehouse(persisted.payload.sigWarehouse ?? null)
        setRestoredFromStorage(true)
        return
      }
    }

    // No persisted scans: start fresh
    setMarks({})
    setScanLog([])
    setSessionNotes('')
    setReturningName('')
    setSigReturning(null)
    setSigWarehouse(null)
    setRestoredFromStorage(false)
  }, [floorId])

  // Auto-save active scanning state to local storage
  useEffect(() => {
    if (!floorId) return
    const hasContent =
      Object.keys(marks).length > 0 ||
      sessionNotes.trim().length > 0 ||
      returningName.trim().length > 0 ||
      sigReturning !== null ||
      sigWarehouse !== null
    if (hasContent) {
      saveFloorScan<PersistedReturnScan>('return', floorId, {
        marks,
        scanLog,
        sessionNotes,
        returningName,
        sigReturning,
        sigWarehouse,
      })
    } else {
      clearFloorScan('return', floorId)
    }
  }, [floorId, marks, scanLog, sessionNotes, returningName, sigReturning, sigWarehouse])

  const discardRestoredScan = () => {
    if (floorId) clearFloorScan('return', floorId)
    setMarks({})
    setScanLog([])
    setSessionNotes('')
    setReturningName('')
    setSigReturning(null)
    setSigWarehouse(null)
    setRestoredFromStorage(false)
  }

  const rows = useMemo<ReturnRow[]>(() => (floor ? buildRows(floor) : []), [floor])
  const actionable = useMemo(() => rows.filter((r) => !r.alreadyReturned), [rows])
  const stateOf = (r: ReturnRow): RowState => (r.alreadyReturned ? 'Returned' : (marks[r.key]?.state ?? 'Outstanding'))

  /* ── derived tallies, all unit-weighted over the real rows ─────────────── */
  const totalUnits = rows.reduce((n, r) => n + r.qty, 0)
  const returnedRows = actionable.filter((r) => marks[r.key]?.state === 'Returned')
  const missingRows = actionable.filter((r) => marks[r.key]?.state === 'Not Returned')
  const outstandingRows = actionable.filter((r) => marks[r.key] === undefined)
  const backUnits = rows.filter((r) => stateOf(r) === 'Returned').reduce((n, r) => n + r.qty, 0)
  const outstandingUnits = outstandingRows.reduce((n, r) => n + r.qty, 0)
  const pct = totalUnits > 0 ? Math.round((backUnits / totalUnits) * 100) : 0

  const filterCounts = useMemo<Record<(typeof FILTERS)[number], number>>(
    () => ({
      All: rows.length,
      Outstanding: outstandingRows.length,
      Returned: rows.filter((r) => r.alreadyReturned || marks[r.key]?.state === 'Returned').length,
      'Not Returned': missingRows.length,
    }),
    [rows, outstandingRows.length, missingRows.length, marks],
  )

  /*
   * §1.5 — Return runs at status **On Rent**; the badge shows the CANONICAL
   * stage (never a seventh name). Mid-return is the Return *job* being In
   * Progress — a separate axis, a separate chip.
   */
  const stage = (floor?.stage ?? 'On Rent') as BookingStatus
  const jobState: JobState =
    returnedRows.length + missingRows.length === 0 ? 'Not Started' : outstandingRows.length === 0 ? 'Complete' : 'In Progress'
  /**
   * Rows the operator has triaged as Not Returned whose decision does NOT end
   * the line — today that is `'Still expected'`, and the engine is what says so
   * (`notReturnedDecisionEndsLine`, `0003:399`). Their line stays short of
   * terminal, so the booking stays On Rent however completely this session was
   * triaged. RT-03: the screen used to call that "all items resolved" and
   * promise a move to Returned that the verb then made — stranding the item.
   */
  const stillExpectedRows = missingRows.filter((r) => {
    const decision = marks[r.key]?.decision
    return decision !== undefined && !notReturnedDecisionEndsLine(decision)
  })
  /**
   * Will completing this session move the booking to Returned? Local and
   * indicative only — `runFloorVerb` asks the same question of every live line
   * of the booking, including lines this session never saw, and its answer is
   * the one that counts. So this decides WORDING, never a gate.
   */
  const allResolved = actionable.length > 0 && outstandingRows.length === 0 && stillExpectedRows.length === 0

  /*
   * How that job state is PAINTED. `jobState` above answers `'Complete'` once
   * nothing is Outstanding — which is right, the triage IS finished — but a
   * session whose every line is 'Still expected' was then drawn in
   * `--success-text` with a checklist, two lines above the copy this change
   * corrected to say the booking is NOT moving. `jobStateChip` is Packing's
   * fix, shared rather than copied: same rule, the exception word differs.
   */
  const jobChip = jobStateChip(jobState, stillExpectedRows.length, 'still expected')

  /* ── the session gates — a checklist, every condition named ──────────────
   * The conditions `validateFloorVerb` / the 0003 CHECKs enforce, evaluated
   * here first so the refusal is readable before it is a rejection — plus the
   * signature and damage-evidence gates §12.1 keeps on the workspace. "Every
   * item resolved" is deliberately NOT among them: Return is multi-session
   * (0003:129) and a partial session completes honestly. */
  const anythingResolved = returnedRows.length > 0 || missingRows.length > 0
  const conditionMissing = returnedRows.filter((r) => marks[r.key]?.condition === undefined)
  const damagedRows = returnedRows.filter((r) => {
    const c = marks[r.key]?.condition
    return c === 'Damaged' || c === 'Lost'
  })
  const damageIncomplete = damagedRows.filter(
    (r) => (marks[r.key]?.damageDescription ?? '').trim() === '' || (marks[r.key]?.damagePhotos ?? 0) === 0,
  )
  const shortReasons = missingRows.filter((r) => (marks[r.key]?.reason ?? '').trim().length < MIN_REASON)
  const noDecision = missingRows.filter((r) => marks[r.key]?.decision === undefined)
  const decisionsByLine = new Map<string, Set<NotReturnedDecision>>()
  for (const r of missingRows) {
    const d = marks[r.key]?.decision
    if (d === undefined) continue
    const set = decisionsByLine.get(r.lineId) ?? new Set<NotReturnedDecision>()
    set.add(d)
    decisionsByLine.set(r.lineId, set)
  }
  const mixedDecisionLines = [...decisionsByLine.entries()].filter(([, set]) => set.size > 1).map(([lineId]) => lineId)
  const sigMissing: string[] = []
  if (!sigReturning) sigMissing.push('Returning person')
  if (!sigWarehouse) sigMissing.push('Warehouse staff')

  const gates: Array<{ label: string; pass: boolean; detail: string | null }> = [
    {
      label: 'At least one item received or declared Not Returned',
      pass: anythingResolved,
      detail: anythingResolved ? null : 'Nothing has been triaged yet — a session claiming work on nothing is refused.',
    },
    {
      label: 'Every received item carries a condition',
      pass: conditionMissing.length === 0,
      detail:
        conditionMissing.length === 0
          ? null
          : `${conditionMissing.length} item${conditionMissing.length > 1 ? 's' : ''} received but not inspected — supplying the condition is what marks a line Inspected`,
    },
    {
      label: 'Damaged or Lost items carry a description and a photo',
      pass: damageIncomplete.length === 0,
      detail:
        damageIncomplete.length === 0
          ? null
          : `${damageIncomplete.length} damaged/lost item${damageIncomplete.length > 1 ? 's' : ''} without a description or a counted photo`,
    },
    {
      label: `Not Returned items carry a reason (≥ ${MIN_REASON} characters)`,
      pass: shortReasons.length === 0,
      detail:
        shortReasons.length === 0
          ? null
          : `${shortReasons.length} item${shortReasons.length > 1 ? 's need' : ' needs'} a fuller reason — that is a database CHECK, not a form rule`,
    },
    {
      label: 'Not Returned items carry one decision per line',
      pass: noDecision.length === 0 && mixedDecisionLines.length === 0,
      detail:
        noDecision.length > 0
          ? `${noDecision.length} item${noDecision.length > 1 ? 's' : ''} without a decision (0003:378 demands one)`
          : mixedDecisionLines.length > 0
            ? `${mixedDecisionLines.length} line${mixedDecisionLines.length > 1 ? 's carry' : ' carries'} conflicting decisions — the engine records ONE decision per booking line, so its units must agree`
            : null,
    },
    {
      label: 'Returning person and warehouse staff signatures captured',
      pass: sigMissing.length === 0,
      detail: sigMissing.length === 0 ? null : `Missing: ${sigMissing.join(', ')}`,
    },
  ]
  const firstBlockedGate = gates.find((g) => !g.pass) ?? null
  const canComplete = firstBlockedGate === null && !dispatching

  const visible = useMemo(
    () =>
      rows.filter((r) => {
        const s = r.alreadyReturned ? 'Returned' : (marks[r.key]?.state ?? 'Outstanding')
        if (filter !== 'All' && s !== filter) return false
        if (query && !`${r.name} ${r.serial ?? ''}`.toLowerCase().includes(query.toLowerCase())) return false
        return true
      }),
    [rows, marks, filter, query],
  )

  /* ── mark helpers ────────────────────────────────────────────────────── */
  const markReturned = (key: string) =>
    setMarks((p) => ({
      ...p,
      [key]: {
        state: 'Returned',
        returnedAtIso: new Date().toISOString(),
        condition: p[key]?.condition ?? 'Good',
      },
    }))
  const markNotReturned = (key: string) => setMarks((p) => ({ ...p, [key]: { state: 'Not Returned', reason: '' } }))
  const clearMark = (key: string) =>
    setMarks((p) => {
      const next = { ...p }
      delete next[key]
      return next
    })
  const patchMark = (key: string, patch: Partial<Mark>) =>
    setMarks((p) => {
      const cur = p[key]
      if (!cur) return p
      return { ...p, [key]: { ...cur, ...patch } }
    })
  const addDamagePhoto = (key: string) =>
    setMarks((p) => {
      const cur = p[key]
      if (!cur) return p
      return { ...p, [key]: { ...cur, damagePhotos: (cur.damagePhotos ?? 0) + 1 } }
    })

  const [ambientBarcode, setAmbientBarcode] = useState('')
  const [activeSigningRole, setActiveSigningRole] = useState<'returning' | 'warehouse' | null>(null)
  const [scanPulse, setScanPulse] = useState<'success' | 'error' | null>(null)
  const [qcStatusMap, setQcStatusMap] = useState<Record<string, boolean>>({})

  const triggerScanPulse = (verdict: 'success' | 'error') => {
    setScanPulse(verdict)
    setTimeout(() => {
      setScanPulse((cur) => (cur === verdict ? null : cur))
    }, 600)
  }

  const handleSignComplete = (sig: DigitalSignature) => {
    if (!activeSigningRole) return
    const newSig: Sig = {
      name: sig.name,
      atIso: sig.atIso,
      role: sig.role,
      dataUrl: sig.dataUrl,
      mode: sig.mode,
    }
    if (activeSigningRole === 'returning') {
      setSigReturning(newSig)
      setReturningName(sig.name)
    } else {
      setSigWarehouse(newSig)
    }
    setActiveSigningRole(null)
  }

  const toggleQcStatus = (key: string, name: string, passed: boolean) => {
    setQcStatusMap((p) => ({ ...p, [key]: passed }))
    if (passed) {
      triggerScanPulse('success')
      playScanSuccess()
      patchMark(key, { condition: 'Good' })
    } else {
      triggerScanPulse('error')
      playDamageAlert()
      patchMark(key, {
        condition: 'Damaged',
        damageDescription: (marks[key]?.damageDescription || `Optical inspection failure on ${name}. Front/rear element or sensor flagged.`).trim(),
      })
    }
  }

  const handleConditionChange = (key: string, condition: ItemCondition) => {
    if (condition === 'Damaged' || condition === 'Lost') {
      triggerScanPulse('error')
      playDamageAlert()
    } else {
      triggerScanPulse('success')
      playScanSuccess()
    }
    patchMark(key, { condition })
  }

  const handleAmbientBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    unlockAudioContext()
    const code = ambientBarcode.trim().toLowerCase()
    if (!code) return

    // 1. Direct equipment item match
    const match = rows.find(
      (r) =>
        (r.serial && r.serial.toLowerCase() === code) ||
        r.key.toLowerCase() === code ||
        (r.name && r.name.toLowerCase() === code) ||
        (r.assetId && r.assetId.toLowerCase() === code)
    )

    if (match) {
      receive(match.key, 'scan')
      setAmbientBarcode('')
      return
    }

    // 2. Flight Case Master Tag match (Booqable audit §11 & Gemma Option C: Scan-to-Verify)
    const isFlightCaseScan =
      code.startsWith('pel-') ||
      code.startsWith('case-') ||
      rows.some((r) => r.group.toLowerCase().replace(/[^a-z0-9]/g, '').includes(code.replace(/[^a-z0-9]/g, '')))

    if (isFlightCaseScan) {
      const caseRows = rows.filter(
        (r) =>
          r.group.toLowerCase().replace(/[^a-z0-9]/g, '').includes(code.replace(/[^a-z0-9]/g, '')) ||
          code.replace(/[^a-z0-9]/g, '').includes(r.group.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6))
      )
      if (caseRows.length > 0) {
        const pendingInCase = caseRows.filter((r) => !r.alreadyReturned && marks[r.key]?.state !== 'Returned')
        if (pendingInCase.length === 0) {
          triggerScanPulse('error')
          playScanError()
          setScanLog((p) => [`• Flight Case "${caseRows[0]?.group}" is already fully returned`, ...p].slice(0, 5))
        } else {
          triggerScanPulse('success')
          playScanSuccess()
          setScanLog((p) => [
            `📦 Flight Case "${caseRows[0]?.group}" identified (${pendingInCase.length}/${caseRows.length} items to receive). Scan items to inspect.`,
            ...p,
          ].slice(0, 5))
        }
        setAmbientBarcode('')
        return
      }
    }

    triggerScanPulse('error')
    playScanError()
    setScanLog((p) => [`✕ No equipment matching "${ambientBarcode.trim()}" in this booking`, ...p].slice(0, 5))
    setAmbientBarcode('')
  }

  const receive = (key: string, via: 'scan' | 'manual' = 'manual') => {
    unlockAudioContext()
    const row = rows.find((r) => r.key === key)
    if (!row) {
      if (via === 'scan') {
        triggerScanPulse('error')
        playScanError()
      }
      return
    }
    if (row.alreadyReturned) {
      if (via === 'scan') {
        triggerScanPulse('error')
        playScanError()
      }
      setScanLog((p) => [`• ${row.name} was returned in an earlier session — nothing to record`, ...p].slice(0, 5))
      return
    }
    if (marks[key]?.state === 'Returned') {
      if (via === 'scan') {
        triggerScanPulse('error')
        playScanError()
      }
      setScanLog((p) => [`• ${row.name} already received in this session`, ...p].slice(0, 5))
      return
    }
    markReturned(key)
    if (via === 'scan') {
      triggerScanPulse('success')
      const remaining = actionable.filter((r) => r.key !== key && marks[r.key]?.state !== 'Returned')
      if (remaining.length === 0) {
        playCaseComplete()
      } else {
        playScanSuccess()
      }
    }
    setScanLog((p) =>
      [`✓ ${row.name}${row.serial ? ` (${row.serial})` : ''} received — recorded when the session completes`, ...p].slice(0, 5),
    )
  }

  /** 1-Click Quick Check-in: Marks all outstanding actionable items Returned in Good Condition and sets signatures */
  const checkInAllClean = () => {
    unlockAudioContext()
    const at = new Date().toISOString()
    const outstanding = actionable.filter((r) => marks[r.key]?.state !== 'Returned')
    if (outstanding.length === 0) {
      setScanLog((p) => ['• Nothing is outstanding — all items already received', ...p].slice(0, 5))
      return
    }

    setMarks((p) => {
      const next = { ...p }
      for (const r of outstanding) {
        next[r.key] = {
          state: 'Returned',
          returnedAtIso: at,
          condition: next[r.key]?.condition ?? 'Good',
        }
      }
      return next
    })

    // Auto-mark QC passed for any cinema items
    const newQcMap: Record<string, boolean> = { ...qcStatusMap }
    for (const r of outstanding) {
      if (getCinemaQcItem(r.name)) {
        newQcMap[r.key] = true
      }
    }
    setQcStatusMap(newQcMap)

    // Auto-fill signatures if not yet recorded
    if (!sigWarehouse && user?.name) {
      setSigWarehouse({
        name: user.name,
        role: 'Warehouse Staff',
        atIso: at,
      })
    }
    if (!sigReturning) {
      setSigReturning({
        name: returningName || floor?.clientName || 'Returning Person',
        role: 'Returning Person',
        atIso: at,
      })
    }

    triggerScanPulse('success')
    playCaseComplete()
    setScanLog((p) => [
      `⚡ Quick Check-in All: ${outstanding.length} item(s) received in Good Condition`,
      ...p,
    ].slice(0, 5))
  }

  const declareNotReturned = (key: string) => {
    const row = rows.find((r) => r.key === key)
    if (!row || row.alreadyReturned) return
    triggerScanPulse('error')
    playDamageAlert()
    markNotReturned(key)
    setScanLog((p) => [`✕ ${row.name} declared Not Returned — reason and decision required`, ...p].slice(0, 5))
  }

  const captureReturning = () => {
    setActiveSigningRole('returning')
  }

  const captureWarehouse = () => {
    if (!user || user.name.trim() === '') return
    setActiveSigningRole('warehouse')
  }

  const scannableUnits = rows.map((r) => ({
    id: r.key,
    name: r.name,
    ...(r.serial ? { serial: r.serial } : {}),
    // Quantity rows have no serial to scan — the modal treats them as accessories.
    isAccessory: r.serial === null,
  }))

  /* ── the dispatch — real line ids, dispatch-then-commit ────────────────── */
  const completeSession = () => {
    if (!canComplete || !floor) return
    // The identity is the signed-in operator or there is no dispatch — never a
    // made-up `{ userId: 'USR-001' }` on a floor record.
    if (!user) {
      setDispatchError('You are not signed in, so this return cannot be recorded against anyone. Nothing was written.')
      return
    }
    setDispatchError(null)
    setDispatching(true)

    const occurredAt = new Date().toISOString()
    const { payload, extraNotes } = buildReturnLines(floor.lines, rows, marks)
    const sigNotes = [
      sigReturning ? `Returning person signature: ${sigReturning.name} at ${formatAdDateTime(sigReturning.atIso)}` : null,
      sigWarehouse ? `Warehouse staff signature: ${sigWarehouse.name} at ${formatAdDateTime(sigWarehouse.atIso)}` : null,
    ].filter((n): n is string => n !== null)
    const notes = [sessionNotes.trim(), ...sigNotes, ...extraNotes].filter((n) => n !== '').join('\n')

    /*
     * ⚠ `navigate` is INSIDE `.then`. This dispatch used to send `lines: []`,
     * which `validateFloorVerb` refuses unconditionally, so the one write on
     * this page always failed. It now carries the real booking-line ids the
     * operator triaged, and leaving the workspace happens on success only.
     */
    import('../../actions/rentals/index')
      .then((m) =>
        m.completeReturn(
          {
            rentalId: floor.id,
            lines: payload,
            clientUuid: completionKey,
            occurredAt,
            ...(notes === '' ? {} : { notes }),
          },
          { userId: user.id, role: user.role },
        ),
      )
      .then(() => {
        clearFloorScan('return', floor.id)
        if (onConfirmSuccess) {
          onConfirmSuccess()
        } else {
          navigate(`/rentals/${id}`)
        }
      })
      .catch((err: unknown) => {
        captureError(err, { where: 'ReturnWorkspace.return', bookingId: id })
        setDispatchError(formatGateError(err))
        setDispatching(false)
      })
  }

  const isDirty = Object.keys(marks).length > 0 || sessionNotes.trim().length > 0 || sigReturning !== null || sigWarehouse !== null
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
   * Return runs at `On Rent` (`JOBS.Return.runsAt`) — `runFloorVerb` would
   * refuse any other stage by name, so the workspace says so up front instead
   * of letting the operator triage eighteen items into a guaranteed refusal.
   * The `BookingNotLoaded` pattern, kept: an honest named state, not an error,
   * and never another booking's gear under this number.
   */
  const stageBlock =
    floor === null
      ? null
      : floor.isCancelled
        ? `${floor.bookingNo} is cancelled. Return does not run on a cancelled booking.`
        : floor.isClosed
          ? `${floor.bookingNo} is Closed. Closed is final — nothing further is recorded.`
          : floor.stage !== 'On Rent'
            ? `Return runs at stage On Rent; ${floor.bookingNo} is at ${floor.stage}. ` +
              (floor.stage === 'Returned'
                ? 'This booking is already returned.'
                : floor.stage === 'Booked' || floor.stage === 'Packed'
                  ? 'The gear has not been handed over yet, so there is nothing to receive.'
                  : 'Nothing can be received here.')
            : null

  /* Money-free by construction — `lateBand` returns minutes and a band name,
     never a Paisa (§8.3). Computed against the render instant: while the gear
     is still out, "how late" is a question about now. */
  const overrun = floor?.returnAtAd && stageBlock === null ? lateBand(new Date(floor.returnAtAd), new Date()) : null

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
        emptyMessage="Check the booking number — nothing with this number exists, so there is nothing to receive."
      >
        {floor !== null && stageBlock !== null && (
          <EmptyState
            title={`Return is not available for ${floor.bookingNo}`}
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
            message="The booking loaded but its lines did not come back with it, so the checklist cannot be trusted. Retry before receiving anything."
            onRetry={() => setReload((n) => n + 1)}
          />
        )}

        {floor !== null && stageBlock === null && floor.linesPresence === 'present' && rows.length === 0 && (
          <EmptyState
            title={`${floor.bookingNo} has no live lines`}
            description="Every line on this booking is voided or none were added, so there is nothing to receive."
            actionLabel={`Open booking ${floor.bookingNo}`}
            onAction={() => navigate(`/rentals/${id}`)}
          />
        )}

        {floor !== null && stageBlock === null && floor.linesPresence === 'present' && rows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
            {restoredFromStorage && (
              <div
                role="status"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 'var(--r-card)',
                  background: 'color-mix(in srgb, var(--primary) 10%, var(--surface))',
                  border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)',
                  fontSize: 'var(--t-meta)',
                  color: 'var(--text)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="refresh" size={14} style={{ color: 'var(--primary)' }} />
                  <span>Restored in-progress return session from this device.</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={discardRestoredScan}
                  style={{ fontSize: 'var(--t-meta)', height: 28, minHeight: 28, padding: '0 8px' }}
                >
                  Start Fresh
                </Button>
              </div>
            )}
            {/* ── header ─────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-lg)', flexWrap: 'wrap' }}>
              {!embedded && (
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                    <h1 style={{ margin: 0, fontSize: 'var(--t-h1)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.015em' }}>
                      Return &amp; Inspection Workspace
                    </h1>
                    {/*
                      ⭐ RULED (Rulings §7): the badge shows the CANONICAL stage —
                      never a seventh name, and never the seed build's
                      unconditional "Equipment In" chip. The mid-return signal is
                      the *job* chip beside it. Two axes, two chips. Law 11 on
                      both: icon + label + colour.
                    */}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--sp-xs)',
                        height: 22,
                        padding: '0 9px',
                        // §3.3 — a status is --r-chip; --r-badge (999) is for
                        // numeric count badges only.
                        borderRadius: 'var(--r-chip)',
                        background: STATUS[statusToken(stage)].bg,
                        color: STATUS[statusToken(stage)].fg,
                        fontSize: 'var(--t-meta)',
                        fontWeight: 700,
                      }}
                    >
                      <Icon name="dot" size={9} />
                      {stage}
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--sp-xs)',
                        height: 22,
                        padding: '0 9px',
                        borderRadius: 'var(--r-badge)',
                        border: '1px solid var(--border)',
                        background: 'var(--card2)',
                        color: jobChip.tone,
                        fontSize: 'var(--t-meta)',
                        fontWeight: 700,
                      }}
                    >
                      <Icon name={jobChip.icon} size={11} />
                      Return job: {jobChip.label}
                    </span>
                  </div>
                  <p style={{ margin: '5px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                    <Link to={`/rentals/${id}`} style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }} className="identifier">
                      {floor.bookingNo}
                    </Link>
                    {floor.project ? ` · ${floor.project}` : ''}
                    {floor.clientName ? ` · ${floor.clientName}` : ''}
                  </p>
                </div>
              )}

              <div style={{ minWidth: 260, flex: 1 }}>
                <div style={{ display: 'flex', gap: 10, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  <span>Return Progress</span>
                  <span className="figure" style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text)' }}>
                    {backUnits} / {totalUnits} ({pct}%)
                  </span>
                </div>
                <div aria-hidden style={{ height: 8, borderRadius: 'var(--r-badge)', background: 'var(--card2)', marginTop: 6, overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '100%', background: 'var(--success)', borderRadius: 'var(--r-badge)', transform: `scaleX(${pct / 100})`, transformOrigin: 'left', transition: 'transform var(--dur) ease' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 'var(--t-meta)', color: outstandingUnits ? 'var(--progress-text)' : 'var(--success-text)', fontWeight: 600 }}>
                  <Icon name={outstandingUnits ? 'alert_triangle' : 'checklist'} size={12} />
                  {/* "Triaged", not "resolved": every row carries a mark, which
                      is not the same as every line being finished — a Not
                      Returned line is unresolved while it is still expected
                      (0003:399, RT-03). The rail's Session Gates card says which
                      of the two this session is. */}
                  {outstandingUnits ? `${outstandingUnits} unit${outstandingUnits > 1 ? 's' : ''} still outstanding` : 'Every item triaged'}
                  {missingRows.length > 0 && <span style={{ color: 'var(--danger-text)' }}>· {missingRows.length} not returned</span>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center', marginLeft: 'auto', alignSelf: 'flex-start', flexShrink: 0 }}>
                {/*
                  RT-06 / PK-22 — the same dead control PK-08 fixed on Packing,
                  given the same treatment: `Unavailable` + `disabled`, which is
                  the house pattern for an unbuilt control (`Header.tsx`'s
                  Notifications and Help, `Warehouses.tsx`'s Print Labels) and
                  states its reason on hover AND on a long-press, which is what
                  the warehouse tablet has.

                  Each clause of the reason was checked before it was written,
                  on 7 Sep 2026:
                   · nothing generates a return-report document — `grep -rn
                     "@media print" src/` is empty, so `window.print()` would
                     send this workspace's rails, filters and buttons to the
                     printer rather than a report;
                   · no PDF library is in `package.json` (dependencies and
                     devDependencies both scanned for pdf/jspdf/html2canvas/
                     docx/puppeteer — none);
                   · the one document generator that does exist,
                     `lib/printSlip.ts`, is an 80mm thermal RENTAL SLIP that
                     imports `formatMoney` and prints totals, deposit and
                     outstanding. It has no caller in `src/` outside its own
                     test, and wiring it here would put money on a warehouse
                     floor screen — Law 6, and §8.3 is why this file does not
                     import `lib/money` at all.
                */}
                <Unavailable reason="Printing a return report is not built. Nothing in the app generates a return-report document, and there is no print stylesheet, so this would send the whole workspace — filters, rails and buttons — to the printer instead of a report. The one printable document that exists is a money receipt, which a warehouse floor screen may not show.">
                  <Button icon="file" disabled>
                    Print Return Report
                  </Button>
                </Unavailable>
                <Link to={`/rentals/${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 12px', borderRadius: 'var(--r-btn)', border: '1px solid var(--btn-secondary-border)', background: 'var(--btn-secondary-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600, textDecoration: 'none' }}>
                  <Icon name="external_link" size={14} />
                  View Booking
                </Link>
              </div>
            </div>

            {/* ── §4 booking strip — read-only, no money (§8.3). Every cell is
                a real column off `fetchFloorBooking`; the seed build's
                hardcoded 2026-07-19 dates and invented times are gone. ── */}
            <div className="floor-summary-bar">
              {[
                { l: 'Client', v: floor.clientName ?? '—', big: true },
                { l: 'Pickup', v: bsLabel(floor.pickupAtAd), s: floor.pickupAtAd ? formatAd(new Date(floor.pickupAtAd)) : undefined },
                { l: 'Expected Return', v: bsLabel(floor.returnAtAd), s: floor.returnAtAd ? formatAd(new Date(floor.returnAtAd)) : undefined },
                {
                  l: 'Actual Return',
                  v: bsLabel(floor.actualReturnAtAd),
                  s: floor.actualReturnAtAd ? formatAd(new Date(floor.actualReturnAtAd)) : 'not recorded yet',
                },
                {
                  l: 'Days',
                  v: floor.pickupAtAd && floor.returnAtAd ? String(rentalDays(floor.pickupAtAd, floor.returnAtAd)) : '—',
                  s: 'Rental days',
                },
                { l: 'Status', v: floor.stage, big: true },
                { l: 'Return job', v: jobState },
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

            {/* §4 — overrun as informational text, never a fabricated "Late
                Return" flag. Computed by `lib/lateFee.lateBand` against the
                booking's REAL expected-return instant, so the floor and
                Finance can never disagree about how late a return is running.
                No monetary value comes back — that is why `lateBand` exists. */}
            {overrun !== null && overrun.band !== 'None' && (
              <p style={{ margin: '-6px 2px 0', fontSize: 'var(--t-meta)', color: 'var(--danger-text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <Icon name="timer" size={12} />
                {formatOverage(overrun.overageMinutes)} past expected return
                <span style={{ fontWeight: 500, color: 'var(--text2)' }}>· {bandConsequence(overrun)}</span>
              </p>
            )}

            {/* ── §5 scan bar ──────────────────────────────────────────────── */}
            <Card>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {/*
                  RT-08 — one control, because there was only ever one
                  behaviour. This was two buttons, `Scan Barcode` and `Scan QR`,
                  both calling `setShowScanner(true)`: the QR button did not
                  select QR, so one of the two labels was a promise the app did
                  not keep.

                  Checked before choosing which way to fix it, 7 Sep 2026:
                  `BarcodeScannerModalProps` has no initial-mode prop (its
                  `mode` is the workspace — 'pack' | 'handover' | 'return' |
                  'reset'), so no prop added by the packing batch is waiting to
                  be passed; `PackingWorkspace.tsx:1136-1137` still carries the
                  identical pair. And inside the modal the Serial / Barcode / QR
                  segmented control changes the input placeholder and nothing
                  else — `handleScanSubmit` matches on id, serial or asset tag
                  whichever mode is selected. So a QR button here could not have
                  selected a real mode even with a prop to pass; it would have
                  named a distinction that does not exist.

                  One button opens the scanner, where the mode selector lives.
                */}
                <button type="button" onClick={() => setShowScanner(true)} aria-label="Scan an item to mark it received" style={{ ...bigScanBtn, ...ACCENT_OUTLINE }}>
                  <Icon name="queues" size={16} /> Scan Item
                </button>
                <div style={{ flex: 1, minWidth: 180, display: 'flex', alignItems: 'center' }}>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search Equipment"
                    aria-label="Search equipment"
                    style={{ width: '100%', height: 44, padding: '0 12px', borderRadius: 'var(--r-btn)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-ui)', fontFamily: 'inherit' }}
                  />
                </div>
              </div>
              <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                Scan any item to mark it received and record its condition. Nothing is written until the session completes.
              </p>
            </Card>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: desktop ? 'minmax(0,1fr) auto' : '1fr',
                gap: 'var(--sp-md)',
                alignItems: 'start',
              }}
            >
              {/* ── centre — the triage list over the real rows ─────────────── */}
              <div style={{ minWidth: 0 }}>
                <Card
                  title="1 · Equipment Checklist"
                  bodyStyle={{ padding: 0 }}
                  action={
                    phone ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Button icon="zap" onClick={checkInAllClean}>Check In All</Button>
                        <Button icon="camera" onClick={() => setShowScanner(true)}>Scan</Button>
                      </div>
                    ) : (
                      <>
                        <Button icon="zap" onClick={checkInAllClean}>Check In All Clean (1-Click)</Button>
                        <Button icon="camera" onClick={() => setShowScanner(true)}>Scan / Camera</Button>
                      </>
                    )
                  }
                >
                  <div className="floor-scanner-hud">
                    <form
                      onSubmit={handleAmbientBarcodeSubmit}
                      style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)', width: '100%' }}
                    >
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
                        <Input
                          type="text"
                          value={ambientBarcode}
                          onChange={(e) => setAmbientBarcode(e.target.value)}
                          placeholder="Scan or type barcode/serial number to check in gear…"
                          aria-label="Scan or type barcode to receive"
                          className="floor-scanner-input"
                        />
                        <span className="floor-scanner-enter-hint"><kbd>↵</kbd> Check In</span>
                      </div>
                      <Button type="submit" variant="secondary" style={{ minHeight: 44, padding: '0 16px', fontWeight: 600 }}>
                        {/* RULING 2026-09-23: one filled primary per workspace, and it is the completion gate. The ambient scan-to-check-in control is auxiliary — secondary, not primary. */}
                        Check In
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowScanner(true)}
                        style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
                      >
                        <Icon name="camera" size={16} />
                        Camera
                      </Button>
                    </form>
                  </div>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                    <SegmentedControl
                      ariaLabel="Filter return checklist items"
                      size="sm"
                      options={FILTERS.map((f) => ({
                        id: f,
                        label: f,
                        badge: filterCounts[f],
                      }))}
                      value={filter}
                      onChange={(val) => setFilter(val as (typeof FILTERS)[number])}
                    />
                  </div>

                  {phone ? (
                    /* Shell rule: tables become card rows below 768. One card
                       per row: serial + status + full-width triage buttons. */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', padding: 'var(--sp-sm)' }}>
                      {visible.map((r) => {
                        const s = stateOf(r)
                        const mark = marks[r.key]
                        const tone = STATUS[ROW_TONE[s]]
                        return (
                          <article
                            key={r.key}
                            className={`floor-card-item ${s === 'Returned' ? 'is-packed' : s === 'Not Returned' ? 'is-missing' : ''}`}
                            style={{ opacity: r.alreadyReturned ? 0.75 : 1 }}
                          >
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                                {r.name}
                                {r.qty > 1 && <span className="figure" style={{ fontWeight: 500, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}> ×{r.qty}</span>}
                              </div>
                              {r.serial && (
                                <div style={{ marginTop: 4 }}>
                                  <Link to={`/inventory/${r.serial}`} className="floor-serial-badge" style={{ textDecoration: 'none' }}>
                                    <Icon name="barcode" size={11} />
                                    <span>{r.serial}</span>
                                  </Link>
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 8px', borderRadius: 'var(--r-badge)', background: tone.bg, color: tone.fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                                <Icon name={s === 'Not Returned' ? 'alert_triangle' : s === 'Returned' ? 'return_arrow' : 'truck'} size={11} />
                                {s}
                              </span>
                              {r.alreadyReturned && (
                                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', alignSelf: 'center' }}>earlier session</span>
                              )}
                              {mark?.condition && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 8px', borderRadius: 'var(--r-badge)', background: STATUS[CONDITION_TONE[mark.condition]].bg, color: STATUS[CONDITION_TONE[mark.condition]].fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                                  {mark.condition}
                                </span>
                              )}
                            </div>

                            {!r.alreadyReturned && s === 'Outstanding' && (
                              /* Full width, per the drawing: Mark Returned is
                                 the OK half; Not Returned is the Flag half. */
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-sm)' }}>
                                <button
                                  type="button"
                                  onClick={() => receive(r.key)}
                                  style={{ minHeight: 44, borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
                                >
                                  Mark Returned
                                </button>
                                <button
                                  type="button"
                                  onClick={() => declareNotReturned(r.key)}
                                  style={{ minHeight: 44, borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--danger-text)', fontSize: 'var(--t-meta)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
                                >
                                  Not Returned
                                </button>
                              </div>
                            )}
                            {!r.alreadyReturned && s !== 'Outstanding' && (
                              <button
                                type="button"
                                onClick={() => clearMark(r.key)}
                                style={{ minHeight: 44, borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontSize: 'var(--t-meta)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
                              >
                                Undo
                              </button>
                            )}

                            {mark?.state === 'Returned' && (
                              <>
                                {getCinemaQcItem(r.name) && (
                                  <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <button
                                      type="button"
                                      onClick={() => toggleQcStatus(r.key, r.name, qcStatusMap[r.key] !== true)}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 5,
                                        minHeight: 30,
                                        padding: '0 8px',
                                        borderRadius: 6,
                                        border: `1px solid ${qcStatusMap[r.key] === true ? 'var(--success, #22c55e)' : qcStatusMap[r.key] === false ? 'var(--danger, #ef4444)' : 'var(--border)'}`,
                                        background: qcStatusMap[r.key] === true ? 'color-mix(in srgb, var(--success, #22c55e) 15%, transparent)' : qcStatusMap[r.key] === false ? 'color-mix(in srgb, var(--danger, #ef4444) 15%, transparent)' : 'var(--card2)',
                                        color: qcStatusMap[r.key] === true ? 'var(--success-text, #22c55e)' : qcStatusMap[r.key] === false ? 'var(--danger-text, #ef4444)' : 'var(--text2)',
                                        fontSize: 11,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      <Icon name={qcStatusMap[r.key] === true ? 'check' : qcStatusMap[r.key] === false ? 'x' : 'camera'} size={12} />
                                      {qcStatusMap[r.key] === true
                                        ? getCinemaQcItem(r.name)!.passedLabel
                                        : qcStatusMap[r.key] === false
                                        ? getCinemaQcItem(r.name)!.failedLabel
                                        : `${getCinemaQcItem(r.name)!.label} (Tap to verify)`}
                                    </button>
                                  </div>
                                )}
                                <ConditionPicker
                                  value={mark.condition}
                                  onChange={(c) => handleConditionChange(r.key, c)}
                                  name={r.name}
                                />
                              </>
                            )}
                            {mark?.state === 'Returned' && (mark.condition === 'Damaged' || mark.condition === 'Lost') && (
                              <DamagePanel
                                mark={mark}
                                name={r.name}
                                onDescription={(v) => patchMark(r.key, { damageDescription: v })}
                                onAddPhoto={() => addDamagePhoto(r.key)}
                              />
                            )}
                            {mark?.state === 'Returned' && mark.returnedAtIso && (
                              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                                received {formatAdDateTime(mark.returnedAtIso)}
                              </span>
                            )}
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
                    <DataTableShell ariaLabel="Items to return">
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                        <thead>
                          <tr style={{ background: 'var(--th-bg)' }}>
                            {['#', 'Item', 'Serial', 'Qty', 'Status', 'Condition', 'Location', ''].map((h, i) => (
                              <th key={h || i} style={th}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map((r, i) => {
                            const s = stateOf(r)
                            const mark = marks[r.key]
                            const tone = STATUS[ROW_TONE[s]]
                            const damaged = mark?.state === 'Returned' && (mark.condition === 'Damaged' || mark.condition === 'Lost')
                            return (
                              <Fragment key={r.key}>
                                <tr
                                  className={`floor-table-row ${s === 'Returned' ? 'is-packed' : s === 'Not Returned' ? 'is-missing' : ''}`}
                                  style={{ borderBottom: damaged ? undefined : '1px solid var(--border)', opacity: r.alreadyReturned ? 0.75 : 1 }}
                                >
                                  <td className="figure" style={{ ...td, width: 26, color: 'var(--muted)' }}>{i + 1}</td>
                                  <td style={td}>
                                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                                    {getCinemaQcItem(r.name) && mark?.state === 'Returned' && (
                                      <div style={{ marginTop: 4 }}>
                                        <button
                                          type="button"
                                          onClick={() => toggleQcStatus(r.key, r.name, qcStatusMap[r.key] !== true)}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            minHeight: 24,
                                            padding: '1px 6px',
                                            borderRadius: 4,
                                            border: `1px solid ${qcStatusMap[r.key] === true ? 'var(--success, #22c55e)' : qcStatusMap[r.key] === false ? 'var(--danger, #ef4444)' : 'var(--border)'}`,
                                            background: qcStatusMap[r.key] === true ? 'color-mix(in srgb, var(--success, #22c55e) 15%, transparent)' : qcStatusMap[r.key] === false ? 'color-mix(in srgb, var(--danger, #ef4444) 15%, transparent)' : 'var(--card2)',
                                            color: qcStatusMap[r.key] === true ? 'var(--success-text, #22c55e)' : qcStatusMap[r.key] === false ? 'var(--danger-text, #ef4444)' : 'var(--text2)',
                                            fontSize: 10,
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.04em',
                                            cursor: 'pointer',
                                          }}
                                          title="Toggle Optical / Sensor QC pass or flag damage"
                                        >
                                          <Icon name={qcStatusMap[r.key] === true ? 'check' : qcStatusMap[r.key] === false ? 'x' : 'camera'} size={10} />
                                          <span>
                                            {qcStatusMap[r.key] === true
                                              ? getCinemaQcItem(r.name)!.passedLabel
                                              : qcStatusMap[r.key] === false
                                              ? getCinemaQcItem(r.name)!.failedLabel
                                              : getCinemaQcItem(r.name)!.label}
                                          </span>
                                        </button>
                                      </div>
                                    )}
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
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 20, padding: '0 8px', borderRadius: 'var(--r-badge)', background: tone.bg, color: tone.fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                                      <Icon name={s === 'Not Returned' ? 'alert_triangle' : s === 'Returned' ? 'return_arrow' : 'truck'} size={11} />
                                      {s}
                                    </span>
                                    {r.alreadyReturned && (
                                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>earlier session</div>
                                    )}
                                    {mark?.state === 'Returned' && mark.returnedAtIso && (
                                      <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2 }}>
                                        {formatAdDateTime(mark.returnedAtIso)}
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ ...td, minWidth: 150 }}>
                                    {mark?.state === 'Returned' ? (
                                      <ConditionPicker
                                        value={mark.condition}
                                        onChange={(c) => handleConditionChange(r.key, c)}
                                        name={r.name}
                                        compact
                                      />
                                    ) : (
                                      <span style={{ color: 'var(--muted)' }}>—</span>
                                    )}
                                  </td>

                                  <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{r.location ?? '—'}</td>
                                  <td style={{ ...td, width: 186 }}>
                                    {/*
                                      `--sp-sm` (8px), not `--sp-xs` (4px), and the column
                                      widened 170 → 186 to absorb it.

                                      This is the one row in the four floor workspaces that
                                      renders TWO actions at once, and they are opposite
                                      outcomes: "Mark Returned" beside "Not Returned". At 4px
                                      apart their 44px `TouchTarget` hit areas would OVERLAP,
                                      and the later one in the DOM would win the tap — a
                                      worse failure than the small target it replaced,
                                      because it is invisible. The siblings in Packing,
                                      Handover and Reset keep `--sp-xs`: their pairs are
                                      mutually exclusive, so only one ever renders.
                                    */}
                                    <span style={{ display: 'flex', gap: 'var(--sp-sm)', justifyContent: 'flex-end' }}>
                                      {!r.alreadyReturned && s === 'Outstanding' && (
                                        <>
                                          <RowAction label="Mark Returned" onClick={() => receive(r.key)} />
                                          <RowAction label="Not Returned" onClick={() => declareNotReturned(r.key)} />
                                        </>
                                      )}
                                      {!r.alreadyReturned && s !== 'Outstanding' && <RowAction label="Undo" onClick={() => clearMark(r.key)} />}
                                    </span>
                                  </td>
                                </tr>
                                {damaged && mark && (
                                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td colSpan={8} style={{ padding: '0 9px 10px', background: 'var(--card2)' }}>
                                      <DamagePanel
                                        mark={mark}
                                        name={r.name}
                                        onDescription={(v) => patchMark(r.key, { damageDescription: v })}
                                        onAddPhoto={() => addDamagePhoto(r.key)}
                                      />
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            )
                          })}
                          {visible.length === 0 && (
                            <tr>
                              <td colSpan={8} style={{ padding: 'var(--sp-xl)', textAlign: 'center' }}>
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

                  {/* §6.5 — two counters, never merged: units are not accessories.
                      The seed's accessory checklist had no real data source, so
                      the second counter is gone rather than faked. */}
                  <div style={{ margin: 12, padding: '10px 12px', borderRadius: 'var(--r-btn)', background: 'var(--card2)', border: '1px solid var(--border)', display: 'flex', gap: 'var(--sp-xl)', flexWrap: 'wrap', fontSize: 'var(--t-meta)' }}>
                    <span>
                      Items Not Returned: <b className="figure" style={{ color: missingRows.length ? 'var(--danger-text)' : 'var(--text)' }}>{missingRows.length}</b>
                    </span>
                    <span>
                      Damaged / Lost: <b className="figure" style={{ color: damagedRows.length ? 'var(--danger-text)' : 'var(--text)' }}>{damagedRows.length}</b>
                    </span>
                    <span style={{ color: 'var(--muted)' }}>
                      {outstandingRows.length > 0
                        ? `${outstandingRows.length} row(s) still outstanding — the booking stays On Rent until every line is terminal.`
                        : stillExpectedRows.length > 0
                          ? `All rows triaged — but ${stillExpectedRows.length} is still expected, so completing records this session and leaves the booking On Rent.`
                          : 'All rows resolved — completing this session dispatches the Return.'}
                    </span>
                  </div>
                </Card>
              </div>

              {/* ── right rail — progress, the gate checklist, the completion gate ── */}
              <FloorAside collapsible={desktop} side="right" width={300} label="Return summary">
                <Card title="Progress">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)' }}>
                    <Ring pct={pct} />
                    <div style={{ minWidth: 0 }}>
                      <div className="figure" style={{ fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)' }}>
                        {totalUnits} units · {backUnits} back
                      </div>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 2 }}>
                        Return job: {jobChip.label}
                      </div>
                    </div>
                  </div>
                </Card>

                {/*
                  §12.1's session gates — every condition named, pass or fail,
                  inline in the rail. A blocked gate is never a toast (Law 12);
                  the reason stays on screen while the block lasts.
                */}
                <Card title="Session Gates">
                  <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {gates.map((g) => (
                      <div key={g.label} className={`floor-gate-row ${g.pass ? 'is-pass' : 'is-pending'}`}>
                        <Icon
                          name={g.pass ? 'checklist' : 'alert_triangle'}
                          size={14}
                          style={{ color: g.pass ? 'var(--success-text)' : 'var(--progress-text)', flexShrink: 0, marginTop: 1 }}
                        />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontWeight: 600, color: g.pass ? 'var(--text)' : 'var(--progress-text)' }}>
                            {g.label}
                          </span>
                          {g.detail && <span style={{ display: 'block', color: 'var(--muted)', marginTop: 2 }}>{g.detail}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                  {/* §12.2 — information, not a gate: Return is multi-session.
                      RT-03 — the middle branch is the one that was missing: a
                      line declared Not Returned / Still expected is triaged but
                      not finished, and this used to read "All items resolved"
                      and promise a move to Returned. */}
                  <p style={{ margin: '9px 0 0', paddingTop: 9, borderTop: '1px solid var(--border)', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                    {outstandingRows.length > 0
                      ? `${outstandingRows.length} item(s) still outstanding — this session can complete without them; the booking stays On Rent for a later session.`
                      : stillExpectedRows.length > 0
                        ? `${stillExpectedRows.length} item(s) are Not Returned and still expected back — this session completes and records them, and the booking stays On Rent so a later session can receive them. It moves to Returned once they arrive, or once their decision changes to one that ends the line.`
                        : missingRows.some((r) => marks[r.key]?.decision === undefined)
                          ? 'Every row is triaged, but a Not Returned row has no decision yet — choose one before completing, or the line cannot be ended.'
                          : 'Every item is received or its line is ended — completing dispatches the Return and moves the booking to Returned if the write is accepted.'}
                  </p>
                </Card>

                {!embedded && (
                  <button
                    type="button"
                    disabled={!canComplete}
                    onClick={completeSession}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 7,
                      width: '100%',
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
                    {dispatching ? 'Recording…' : allResolved ? 'Complete Return' : 'Complete Session'}
                  </button>
                )}

                {/* Law 12 — inline and persistent, never a toast. This is what
                    the operator sees instead of being navigated away from a
                    session that was never recorded. */}
                {dispatchError && <ErrorBanner title="This return was not recorded" message={dispatchError} />}

                <Card title="Items Not Returned">
                  {missingRows.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No items are Not Returned.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {missingRows.map((r) => {
                        const mark = marks[r.key]
                        const reason = mark?.reason ?? ''
                        return (
                          <div key={r.key}>
                            <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>{r.name}</div>
                            {r.serial && <div className="identifier" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{r.serial}</div>}
                            <input
                              value={reason}
                              onChange={(e) => patchMark(r.key, { reason: e.target.value })}
                              placeholder={`Reason (min ${MIN_REASON} characters)`}
                              aria-label={`Reason ${r.name} was not returned`}
                              /* Law 15 — a typed field on a touch device, inside a
                                 blocking gate: the Law 10 reason is entered here. */
                              style={{ width: '100%', minHeight: 44, marginTop: 5, padding: '0 8px', borderRadius: 'var(--r-input)', border: `1px solid ${reason.trim().length < MIN_REASON ? 'var(--danger)' : 'var(--input-border)'}`, background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
                            />
                            {/* §8.5 — a decision, never a rupee figure, on this screen. */}
                            <select
                              value={mark?.decision ?? ''}
                              onChange={(e) => {
                                if (e.target.value === '') return
                                patchMark(r.key, { decision: e.target.value as NotReturnedDecision })
                              }}
                              aria-label={`Decision for ${r.name}`}
                              style={{ width: '100%', minHeight: 44, marginTop: 6, borderRadius: 'var(--r-input)', border: `1px solid ${mark?.decision ? 'var(--input-border)' : 'var(--danger)'}`, background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
                            >
                              <option value="" disabled>Choose a decision…</option>
                              {DECISIONS.map((d) => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                            {/* RT-03 — what this decision does to the booking,
                                said where it is chosen. Icon + words, never
                                colour alone (Law 11). The engine answers it. */}
                            {mark?.decision !== undefined && !notReturnedDecisionEndsLine(mark.decision) && (
                              <p style={{ margin: '5px 0 0', display: 'flex', gap: 5, alignItems: 'flex-start', fontSize: 'var(--t-meta)', color: 'var(--progress-text)', lineHeight: 1.45 }}>
                                <Icon name="timer" size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                                <span>
                                  “{mark.decision}” keeps this line open, so the booking stays On Rent and a later
                                  session can receive the item. Choose a decision that ends the line instead if it
                                  is not coming back.
                                </span>
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Card>

                <Card title="Signatures">
                  {/* §9 — captured before completion (gate 6); written into the
                      session notes with the dispatch. */}
                  <SigRow
                    label="Returning person (Client / Courier)"
                    sig={sigReturning}
                    required
                    onCapture={captureReturning}
                  />

                  <SigRow
                    label="Warehouse staff"
                    sig={sigWarehouse}
                    required
                    {...(user && user.name.trim() !== ''
                      ? { onCapture: captureWarehouse }
                      : {
                          unavailable:
                            'The signed-in account carries no name, so a warehouse signature cannot be attested. The identity is the signed-in operator or there is no signature.',
                        })}
                  />
                  {/* §9 — optional, and uncapturable: no witness identity exists on this screen to sign as. */}
                  <SigRow label="Witness" sig={null} required={false} unavailable={WITNESS_UNAVAILABLE} />

                  <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                    Signatures are written into <span className="identifier">operation_sessions.notes</span> with the
                    dispatch — digitally attested on glass before return completion.
                  </p>
                </Card>

                <Card title="Return Notes">
                  <textarea
                    value={sessionNotes}
                    onChange={(e) => setSessionNotes(e.target.value)}
                    placeholder="Notes for this return session (saved onto the session when it completes)…"
                    aria-label="Return session notes"
                    rows={3}
                    style={{ width: '100%', minHeight: 64, padding: '8px 9px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', resize: 'vertical' }}
                  />
                  <p style={{ margin: '7px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                    Written to <span className="identifier">operation_sessions.notes</span> with the dispatch —
                    nothing is saved until the session completes.
                  </p>
                </Card>

                {/* Evidence is a viewer, not a verb (spec 03). The damage photo
                    counts on this screen are local tallies; the files live in
                    the Evidence Workspace. */}
                <Card title="Evidence">
                  <Link
                    to={`/rentals/${id}/evidence`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}
                  >
                    <Icon name="external_link" size={14} />
                    Compare in Evidence
                  </Link>
                  <p style={{ margin: '5px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                    Damage photo counts on this screen are local to this session — no file is uploaded from here;
                    capture, matching and storage live in the Evidence Workspace.
                  </p>
                </Card>

                {scanLog.length > 0 && (
                  <div style={{ ...cardStyle, padding: 11 }}>
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Scan log</div>
                    {/* §8.3 — results are announced to screen readers. */}
                    <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
                      {scanLog.map((l, i) => (
                        <span key={i} style={{ fontSize: 'var(--t-meta)', color: l.startsWith('✕') ? 'var(--danger-text)' : 'var(--text2)' }}>
                          {l}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </FloorAside>
            </div>

            {/* §11 — footer. The single EXIT, and nothing else: the completion
                gate lives in the rail beside its blockers (spec 03 — exactly
                one primary per workspace). */}
            {!embedded && (
              <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', padding: '12px 14px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => (onCancel ? onCancel() : navigate(`/rentals/${id}`))}
                  style={{ minHeight: 44, padding: '0 14px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--danger-text)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Cancel Return
                </button>
                {/* Was "Saving is automatic". Nothing on this screen autosaves —
                    triage lives in React state until the session dispatches —
                    and a false persistence claim beside a completion gate is the
                    worst place for one. */}
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                  {/* Same correction as the header strip: this counts marks, not
                      finished lines (RT-03). */}
                  {outstandingRows.length
                    ? `${outstandingRows.length} item${outstandingRows.length > 1 ? 's' : ''} outstanding`
                    : 'Every item triaged'}
                  {' · Nothing is saved until the session completes — cancelling discards this triage'}
                </span>
              </div>
            )}

            <BarcodeScannerModal
              isOpen={showScanner}
              onClose={() => setShowScanner(false)}
              mode="return"
              bookingId={id}
              items={scannableUnits}
              onItemScanned={(item) => {
                receive(item.id, 'scan')
              }}
            />

            {activeSigningRole && (
              <SignOnGlassModal
                isOpen={Boolean(activeSigningRole)}
                onClose={() => setActiveSigningRole(null)}
                role={activeSigningRole}
                defaultName={
                  activeSigningRole === 'returning'
                    ? (returningName || floor?.clientName || '')
                    : (user?.name ?? 'Warehouse Staff')
                }
                bookingNo={floor?.bookingNo ?? id}
                clientName={floor?.clientName}
                deliveryType={floor?.deliveryType}
                onSignComplete={handleSignComplete}
              />
            )}

            {phone && !embedded && (
              <StickyFloorBar
                progress={{
                  current: backUnits,
                  total: totalUnits,
                  label: outstandingUnits ? `${outstandingUnits} remaining` : 'All items returned',
                  complete: allResolved,
                }}
                onScan={() => setShowScanner(true)}
                primaryAction={{
                  label: dispatching ? 'Recording…' : allResolved ? 'Complete Return' : 'Complete Session',
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
    </div>
  )
}

const bigScanBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--sp-sm)', height: 44, padding: '0 18px', borderRadius: 'var(--r-btn)', fontSize: 'var(--t-ui)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' } as const

/**
 * §6.3 — condition is a radio group, one value, never two. Supplying it is
 * what marks the line Inspected on the write side (`return_lines` CHECK :382
 * takes condition, inspector and time together).
 */
function ConditionPicker({
  value,
  onChange,
  name,
  compact,
}: {
  value: ItemCondition | undefined
  onChange: (c: ItemCondition) => void
  name: string
  compact?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={`Condition of ${name}`} style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 4 : 6 }}>
      {CONDITIONS.map((c) => {
        const on = value === c
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(c)}
            style={{
              height: compact ? 24 : 30,
              padding: compact ? '0 7px' : '0 10px',
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
  )
}

/**
 * Damage detail for a Damaged / Lost row. The description and the local photo
 * tally ride the session notes on dispatch; no `evidence_files` write path
 * exists on this screen, and the panel says so instead of dressing the counter
 * up as an upload. The seed build's "Send for Manager Approval" flip is gone:
 * nothing was routed anywhere, and a control that claims routing it does not
 * perform fabricates success.
 */
function DamagePanel({
  mark,
  name,
  onDescription,
  onAddPhoto,
}: {
  mark: Mark
  name: string
  onDescription: (v: string) => void
  onAddPhoto: () => void
}) {
  const photos = mark.damagePhotos ?? 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0 0' }}>
      <textarea
        value={mark.damageDescription ?? ''}
        onChange={(e) => onDescription(e.target.value)}
        placeholder={`Describe the ${mark.condition === 'Lost' ? 'loss' : 'damage'}`}
        aria-label={`Damage description for ${name}`}
        style={{ width: '100%', minHeight: 46, padding: 7, borderRadius: 'var(--r-input)', border: `1px solid ${(mark.damageDescription ?? '').trim() === '' ? 'var(--danger)' : 'var(--input-border)'}`, background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
        <span className="figure" style={{ fontSize: 'var(--t-meta)', color: photos > 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>
          {photos} photo(s)
        </span>
        <RowAction label="Count a Photo" onClick={onAddPhoto} />
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          A local count — the file itself is captured in the Evidence Workspace.
        </span>
      </div>
    </div>
  )
}

/**
 * `unavailable` is the reason a row can never be signed on this screen (the
 * Witness, which has no identity to capture; the Warehouse row when the staff
 * record carries no name). It takes precedence over `onCapture`, which such a
 * row is not given at all — the Capture control renders through `Unavailable`
 * so the reason is attached on hover AND on a warehouse tablet's long-press,
 * rather than the row silently signing someone.
 */
function SigRow({
  label,
  sig,
  onCapture,
  required,
  disabled,
  unavailable,
}: {
  label: string
  sig: Sig | null
  onCapture?: (() => void) | undefined
  required: boolean
  disabled?: boolean | undefined
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
            {required ? 'Required before completion' : unavailable ? 'Optional — no witness recorded' : 'Optional'}
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
      ) : unavailable ? (
        <Unavailable reason={unavailable}>
          <button type="button" disabled style={{ ...capture, color: 'var(--muted)', cursor: 'not-allowed' }}>
            Sign on Glass
          </button>
        </Unavailable>
      ) : (
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
    <svg width={64} height={64} role="img" aria-label={`${pct}% returned`} style={{ flexShrink: 0 }}>
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
