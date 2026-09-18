import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Card, Button, cardStyle } from '../../components/ui/Page'
import { FloorAside, floorPlacements } from '../operations/FloorAside'
import { StickyFloorBar } from '../operations/StickyFloorBar'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { PageBody } from '../../components/ui/PageBody'
import { STATUS, jobStateChip } from '../../lib/status'
import { statusToken } from '../../lib/workflow'
import type { BookingStatus, JobState } from '../../lib/workflow'
import { BarcodeScannerModal, type ScanOutcome } from '../../components/ui/BarcodeScannerModal'
import { Unavailable } from '../../components/ui/Unavailable'
import { CompactButton } from '../../components/ui/TouchTarget'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { captureError } from '../../lib/monitoring'
import { formatBsOrAd, formatAd, formatAdDateTime } from '../../lib/bs'
import { newClientUuid } from '../../lib/supabase'
import { fetchFloorBooking, type FloorBooking, type FloorLine } from '../../lib/queries/bookings'
import type { FloorLineInput } from '../../actions/rentals/floorVerb'
import { deliveryTypeLabel } from '../../lib/format'
import { readServiceDue } from '../../lib/queries/serviceDue'
import { serviceStatus, type ServiceRow } from '../../lib/serviceDue'
import { formatGateError } from '../../lib/gates'
import { clearFloorScan, loadFloorScan, saveFloorScan } from '../../lib/floorScanStorage'
import { rentalDaysBetween } from '../../lib/rentalDays'

/**
 * **Packing Workspace** — `Packing Workflow.md` v2.1 (Build Locked), wired live.
 *
 * THE MODEL IMPLEMENTATION for the floor loop (Handover, Return and Reset copy
 * this file's shape). Three moves, in order:
 *
 *  1. **Read** — `fetchFloorBooking` (`lib/queries/bookings.ts`, Law 2's one
 *     floor read) resolves `:bookingNo` to the booking head plus its live
 *     `booking_lines` and their `booking_line_units` / `product_units`. Every
 *     row on this screen is one of those rows; nothing is seeded.
 *  2. **Verify** — the tick/scan checklist is local state KEYED ON the real
 *     rows (`marks`, one entry per physical unit or per quantity line). Local
 *     until dispatch, committed by the action, never the other way round.
 *  3. **Dispatch** — Complete Packing collapses the marks back onto their
 *     parent `booking_lines` (one `FloorLineInput` per line — the line tables
 *     carry `unique (booking_line_id)`, so `validateFloorVerb` refuses
 *     duplicates) and dispatches `packRental` with the REAL line ids the
 *     operator verified. Navigation happens only on the resolved promise —
 *     leaving the workspace is the app's "the write landed" signal.
 *
 * Honest degradation, in the `BookingNotLoaded` tradition (Rulings §8 — never
 * render one booking's gear under another's number): an unknown booking gets
 * the not-found empty state, a booking past `Booked` gets a named refusal
 * (Pack runs at Booked — `JOBS.Pack.runsAt`), and a read failure gets the
 * PageBody error ladder with Retry. No seeded fallback exists any more, so
 * there is nothing wrong left to render.
 *
 * Evidence gate — ⭐ RULED, PLAN.md §4.31: **one photo per BOOKING**, not one
 * per packed case (there is no packing case model). The count here is still a
 * local tally — no `evidence_files` write path exists on this screen yet — and
 * the panel says so instead of dressing the counter up as an upload.
 */

/** §13 — the workspace primary is `--primary` in light *and* dark. */
const BLUE_PRIMARY = {
  // Was  (#3b82d6, a CHART CATEGORY hue) with a raw '#fff' ink — the
  // comment above already claimed --primary while the code used neither.
  background: 'var(--btn-primary-bg)',
  color: 'var(--btn-primary-fg)',
  border: '1px solid transparent',
} as const

/**
 * The three states a row can hold on this screen. `Pending` is the absence of
 * a mark; `Packed` and `Missing` are the two outcomes `FloorLineOutcome` can
 * carry ('done' | 'missing'). The seed build also drew `Partial` / `Not
 * Required` / `Replaced` — states no control could reach and no dispatch could
 * write, so they are gone rather than rendered as reachable.
 */
type RowState = 'Pending' | 'Packed' | 'Missing'

const FILTERS = ['All', 'Pending', 'Packed', 'Missing'] as const

const LINE_TONE: Record<RowState, { bg: string; fg: string }> = {
  // Pending is work not yet done — yellow, never Packed's green, on the one
  // screen whose entire job is telling packed from unpacked at a glance.
  Pending: { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)' },
  Packed: { bg: 'var(--st-in-bg)', fg: 'var(--st-in-fg)' },
  Missing: { bg: 'var(--st-danger-bg)', fg: 'var(--st-danger-fg)' },
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
 * RULING 2026-09-08 (R-28) — `Service due — still OK to send`.
 *
 * **A warning, and never a gate.** The ruling is explicit: due-ness warns only,
 * the unit stays bookable, and nothing about this line changes what the row can
 * do. The Pack checkbox beside it stays enabled, the row still ticks, the
 * dispatch still runs. The floor is told the camera is due for a clean; the
 * floor decides.
 *
 * That is why the sentence carries `still OK to send` rather than only `Service
 * due`. A bare warning on a packing screen reads as a stop sign at 6 AM, and the
 * one thing this must not do is stop a job.
 *
 * Rendered only where the row IS a physical unit (`assetId`); a quantity row
 * stands for a count with no unit behind it and there is nothing to service.
 */
const ServiceDueLine: React.FC<{ row: ServiceRow | undefined }> = ({ row }) => {
  if (row === undefined) return null
  const status = serviceStatus(row)
  if (status === null) return null
  return (
    <span
      title={status.detail}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
        fontSize: 'var(--t-meta)',
        color: 'var(--st-progress-fg)',
      }}
    >
      <Icon name="tool" size={11} />
      {status.label} — still OK to send
    </span>
  )
}

/**
 * One checklist row — one physical unit (`booking_line_units` row) on a
 * serialised line, or the whole line for a quantity-tracked line with no unit
 * assignments. `key` is the mark key; `lineId` is what the dispatch collapses
 * onto; `assetId` is `product_units.id`, what `session_line_movements.unit_id`
 * needs (null on quantity rows — a movement row is never invented for them).
 */
export interface PackRow {
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
}

export interface Mark {
  state: 'Packed' | 'Missing'
  packedAtIso?: string
  /**
   * PK-07 — how this row reached Packed: a scan through the scanner modal, or
   * a hand mark (the row checkbox, or Mark Pending Packed).
   *
   * **Local to this screen**, and that is the defect rather than the design.
   * The schema has the place for it: `scan_events` (`0003:573`) takes a
   * `context 'packing'` scan with its code, code type, resolved unit, device
   * and result, and `session_line_movements.scan_event_id` (`0003:200`) exists
   * to point a movement at the scan that produced it. **Nothing writes one.**
   * The string `scan_events` appears nowhere in `src/` outside `src/types/`,
   * and `FloorLineInput` carries no channel for a scan event, so this screen
   * has nothing to send even if it minted one. `writePackingLine` says as much about its own
   * stand-in: "the caller named units" is read as "the line was scanned", and
   * its comment admits that is "wrong for a serialised line packed without
   * scanning" — which is exactly the row this flag marks.
   *
   * So the difference is kept where it can be: on this screen, and in the
   * session notes at dispatch. `TODO(decision)`, reported with this batch —
   * who writes `scan_events`, and whether the floor verbs should take the
   * scan event id alongside `unitIds`.
   */
  via?: 'scan' | 'manual'
  reason?: string
}

/** Law 10's floor: the DB CHECK behind every `missing_reason` in migration 0003. */
const MIN_REASON = 10

/**
 * Flatten the booking's lines into checklist rows.
 *
 * Grouping (the bundle tree) — PLAN.md §4.31 rules the group is the bundle the
 * gear was sold under. The floor read carries no bundle join yet, so the
 * closest true fact is used: children of a bundle parent (`parent_line_id`)
 * group under the parent line's name, everything else under its own product.
 * Derived from real rows, never invented.
 *
 * Which lines are packable (PK-02) — `booking_line_type` is Equipment, Bundle,
 * Accessory, Service, Sub-rental or Manual item. Nothing physical travels for
 * a Service, a Sub-rental is another company's gear and a Manual item is a
 * free-text charge: none can be ticked into a case, and a row for one either
 * made Packed unreachable or wrote a fabricated pack row for a service. A
 * Bundle parent whose children are on the booking is a heading, not gear —
 * its children are the packable rows. Equipment, Accessory and a childless
 * Bundle line become rows; `buildPackLines` dispatches only lines that did.
 */
const NON_PACKABLE_LINE_TYPES: ReadonlySet<string> = new Set(['Service', 'Sub-rental', 'Manual item'])

function packableLines(lines: readonly FloorLine[]): FloorLine[] {
  const parentIds = new Set(lines.map((l) => l.parentLineId).filter((p): p is string => p !== null))
  return lines.filter((l) => !NON_PACKABLE_LINE_TYPES.has(l.lineType) && !(l.lineType === 'Bundle' && parentIds.has(l.id)))
}

export function buildRows(floor: FloorBooking): PackRow[] {
  const lineById = new Map(floor.lines.map((l) => [l.id, l]))
  const groupOf = (line: FloorLine): string => {
    const parent = line.parentLineId !== null ? lineById.get(line.parentLineId) : undefined
    const src = parent ?? line
    return src.productName ?? src.description ?? src.lineType
  }

  const rows: PackRow[] = []
  for (const line of packableLines(floor.lines)) {
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
        })
      })
    } else {
      // A quantity-tracked line (or one whose units are simply unassigned):
      // one row for the whole line, ticked as one. `unitsPresence === 'absent'`
      // is handled before this function is called — an absent embed must never
      // read as "no units" (the defect bookingQuery.ts:110-113 records).
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
      })
    }
  }
  return rows
}

/**
 * One line the operator resolved BOTH ways — some units packed, some missing.
 *
 * PK-06's shape, kept so the screen can say so before the dispatch rather than
 * only in a note nobody reads afterwards.
 */
interface MixedLine {
  /** `booking_lines.id` — the stable key; two lines can share a product name. */
  lineId: string
  lineName: string
  missing: number
  total: number
}

/**
 * Collapse the operator's marks back onto booking lines — the dispatch payload.
 *
 * One entry per line (`validateFloorVerb` refuses duplicates), and a line
 * nobody touched is NOT named: absence is never converted into a state
 * (0003:630). Per line:
 *
 *  - only Missing marks → `outcome: 'missing'` with the operator's reasons
 *    joined (each already ≥ 10 chars by the gate, so the join is too);
 *  - any Packed marks → `outcome: 'done'` carrying the scanned
 *    `product_units.id`s (one movement row each) and the moved quantity.
 *
 * ## PK-06 — a mixed line cannot be told to the engine, and this says so
 *
 * `FloorLineInput` carries **one** `outcome` for the whole line, and
 * `validateFloorVerb` refuses the same `bookingLineId` twice ("Each line table
 * holds one row per booking line"), so a line with three units packed and one
 * missing has no truthful encoding today:
 *
 *  - as `'done'` (what this does) `writePackingLine` derives the line's state
 *    from the packed count alone — `'Partial'` wherever that count is short of
 *    `qty_required` (0003:289) — and writes **no** `missing_reason`, while
 *    `writeUnitStates` patches only the units named in `unitIds`, so the
 *    missing unit is left exactly as it was and is never written
 *    `unit_state 'Missing'`. The shortage exists nowhere but the notes.
 *  - as `'missing'` it would be worse: `writeUnitStates`' missing branch takes
 *    the same `unitIds` and would stamp `'Missing'` on the units that were
 *    **packed**, and the movements for them would not be written at all.
 *
 * So the packed units are recorded (they were really packed), the missing ones
 * ride `mixedNotes` where they can at least be read, and `mixed` is returned so
 * the rail can state the gap before the operator dispatches. `TODO(decision)`,
 * reported with this batch: `FloorLineInput` needs a per-unit missing channel
 * (e.g. `missingUnits?: { unitId, reason }[]`) for Pack. Until it exists this
 * page must not pretend the shortage was recorded — and a mixed line left short
 * of its required quantity is `'Partial'`, which is not one of
 * `TERMINAL_LINE_STATES.Pack`, so the booking stays at Booked.
 */
/**
 * How a `JobState` is PAINTED on the Pack header — which is not the same
 * question as what the state IS.
 *
 * `JobState` lives in `lib/workflow.ts` and is shared with Handover, Return and
 * the case list, so "finished with exceptions" is not a member to add for one
 * screen (Law 1). But a pack where every row is resolved and some are MISSING
 * is `'Complete'` by that union — and painting it `--success-text` with a
 * checklist put a green tick in the header directly beside the danger-bordered
 * box this same screen renders to say units are missing. Two answers to one
 * question, in one glance.
 *
 * The state is unchanged; the chip stops calling it a success. Word, icon and
 * tone move together and the count is in the LABEL (Law 11), so nothing here
 * asks the reader to decode a colour.
 */
/** @deprecated Use `jobStateChip` from `lib/status` — kept as this screen's
 *  named wrapper so its tests and call site read the same as before. Return
 *  needed the identical rule on 7 Sep, which is what moved it. */
export function packJobChip(
  state: JobState,
  missingCount: number,
): { tone: string; icon: IconName; label: string } {
  return jobStateChip(state, missingCount, 'missing')
}

export function buildPackLines(
  lines: readonly FloorLine[],
  rows: readonly PackRow[],
  marks: Record<string, Mark>,
): { payload: FloorLineInput[]; mixedNotes: string[]; mixed: MixedLine[] } {
  const byLine = new Map<string, PackRow[]>()
  for (const r of rows) {
    const bucket = byLine.get(r.lineId)
    if (bucket) bucket.push(r)
    else byLine.set(r.lineId, [r])
  }

  const payload: FloorLineInput[] = []
  const mixedNotes: string[] = []
  const mixed: MixedLine[] = []

  for (const line of lines) {
    const lineRows = byLine.get(line.id) ?? []
    // PK-02 — a line that produced no rows (Service, Sub-rental, Manual item,
    // a Bundle heading) is never dispatched, whatever the marks hold.
    if (lineRows.length === 0) continue
    const packed = lineRows.filter((r) => marks[r.key]?.state === 'Packed')
    const missing = lineRows.filter((r) => marks[r.key]?.state === 'Missing')
    if (packed.length === 0 && missing.length === 0) continue

    if (packed.length === 0) {
      payload.push({
        bookingLineId: line.id,
        outcome: 'missing',
        reason: missing.map((r) => (marks[r.key]?.reason ?? '').trim()).join('; '),
      })
      continue
    }

    const scanned = packed.filter((r) => r.assetId !== null)
    /*
     * PK-17 — `serials` used to be `r.serial ?? ''`, writing an EMPTY STRING
     * into `session_line_movements.serial` for a unit that has none. An empty
     * string is not a serial; it is a serial-shaped hole that reads as data.
     *
     * `scannedUnits` pairs the two arrays positionally, so a per-row null is
     * not expressible — the array is sent only when every scanned row has a
     * real serial, and omitted otherwise. Nothing identifying is lost either
     * way: `unitIds` carries `product_units.id`, which is the identity the
     * movement row is keyed on, and the serial is a convenience beside it.
     */
    const serials = scanned.map((r) => r.serial).filter((s): s is string => s !== null && s.trim() !== '')
    const everySerialKnown = serials.length === scanned.length

    /*
     * PK-17 — `location` was read onto every row by `buildRows` and then never
     * sent, so `packing_lines.warehouse_location` was null on every pack this
     * screen has ever dispatched. It is one text column for the whole line, so
     * it is sent only when the packed rows agree on one shelf; two shelves on
     * one line is not a fact this column can hold, and joining them would
     * invent a location string nobody typed.
     */
    const locations = [
      ...new Set(packed.map((r) => r.location).filter((l): l is string => l !== null && l.trim() !== '')),
    ]
    const [onlyLocation] = locations

    payload.push({
      bookingLineId: line.id,
      ...(scanned.length > 0
        ? {
            unitIds: scanned.map((r) => r.assetId as string),
            ...(everySerialKnown ? { serials } : {}),
          }
        : {}),
      qty: packed.reduce((n, r) => n + r.qty, 0),
      ...(locations.length === 1 && onlyLocation !== undefined ? { warehouseLocation: onlyLocation } : {}),
    })

    if (missing.length > 0) {
      const lineName = line.productName ?? line.description ?? line.id
      mixed.push({ lineId: line.id, lineName, missing: missing.length, total: lineRows.length })
      mixedNotes.push(
        `${lineName}: ${missing.length} of ${lineRows.length} unit(s) reported missing on the floor. ` +
          'They are NOT recorded as missing — one outcome per booking line, so this line is written ' +
          'from the packed units only. Units and reasons — ' +
          missing.map((r) => `${r.serial ?? r.name}: ${(marks[r.key]?.reason ?? '').trim()}`).join('; '),
      )
    }
  }

  return { payload, mixedNotes, mixed }
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
 * date, and dashing it hid a known date on every row once the clock left
 * Shrawan 2083. `formatBsOrAd` owns that fallback.
 */
function bsLabel(iso: string | null): string {
  if (!iso) return '—'
  return formatBsOrAd(new Date(iso))
}

/*
 * ⭐ RULED 12 Aug 2026 (Rulings §3): operations are ROUTES.
 * `/rentals/:bookingNo/packing` is the only mount, and `bookingNo` comes off
 * the route for ANY booking — resolved by `fetchFloorBooking`, not compared
 * against a seed.
 */
export interface PackingWorkspaceProps {
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
  }) => void
}

export default function PackingWorkspace({
  bookingNo: bookingNoProp,
  embedded = false,
  onConfirmSuccess,
  onCancel,
  onRegisterActions,
}: PackingWorkspaceProps = {}) {
  const navigate = useNavigate()
  const { bookingNo: bookingNoParam } = useParams()
  const id = bookingNoProp ?? bookingNoParam ?? ''
  /** The one identity every dispatch on this screen may act as. No fallback. */
  const { user } = useAuth()
  /* Law 13/14 — width decides, at v4.1 §7.7's 768 / 1280. */
  const viewport = useViewport()
  const desktop = viewport === 'desktop'
  const phone = viewport === 'phone'
  const place = floorPlacements(desktop, phone)

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

  interface PersistedPackScan {
    marks: Record<string, Mark>
    scanLog: string[]
    sessionNotes: string
    photoCount: number
  }

  /* ── checklist state, keyed on the real rows ─────────────────────────────
   * `marks` holds only rows the operator touched; absence is Pending. Local
   * until Complete Packing dispatches — dispatch-then-commit, where "commit"
   * is the navigation away on the resolved promise. */
  const [marks, setMarks] = useState<Record<string, Mark>>({})
  const [restoredFromStorage, setRestoredFromStorage] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(queryInput)
    }, 200)
    return () => clearTimeout(timer)
  }, [queryInput])
  const [highlight, setHighlight] = useState<string | null>(null)
  const [scanLog, setScanLog] = useState<string[]>([])
  const [sessionNotes, setSessionNotes] = useState('')
  /** ⭐ §4.31 — one photo per BOOKING. Local tally; no upload path exists here yet. */
  const [photoCount, setPhotoCount] = useState(0)
  /**
   * Law 12 — a dispatch failure is inline and persistent, and navigation
   * happens only on a resolved promise. A blocked gate is never a toast.
   */
  const [dispatchError, setDispatchError] = useState<string | null>(null)
  const [dispatching, setDispatching] = useState(false)
  /**
   * PK-01 — the session landed but the stage did not move. `runFloorVerb`
   * reports that as `stage: null` with `stageHeldBy` naming the lines short
   * of a terminal state. It is neither a failure nor a success to leave on, so
   * it stays on screen (Law 12) until the operator goes back to the booking.
   */
  const [stageHeld, setStageHeld] = useState<{ lines: number; movements: number; heldBy: readonly string[] } | null>(null)
  /**
   * Law 8 — the idempotency key for THIS packing session, minted when the
   * booking loads (the point the user starts acting), not at send time. A
   * double-press replays the same key and resolves to the first write.
   */
  const [completionKey, setCompletionKey] = useState(() => newClientUuid())

  const floorId = floor?.id ?? null
  useEffect(() => {
    setDispatchError(null)
    setDispatching(false)
    setStageHeld(null)
    setCompletionKey(newClientUuid())

    if (floorId) {
      const persisted = loadFloorScan<PersistedPackScan>('pack', floorId)
      if (
        persisted &&
        (Object.keys(persisted.payload.marks || {}).length > 0 ||
          (persisted.payload.sessionNotes || '').trim() !== '' ||
          (persisted.payload.photoCount || 0) > 0)
      ) {
        setMarks(persisted.payload.marks || {})
        setPhotoCount(persisted.payload.photoCount || 0)
        setScanLog(persisted.payload.scanLog || [])
        setSessionNotes(persisted.payload.sessionNotes || '')
        setRestoredFromStorage(true)
        return
      }
    }

    // No persisted scans: start fresh
    setMarks({})
    setPhotoCount(0)
    setScanLog([])
    setSessionNotes('')
    setRestoredFromStorage(false)
  }, [floorId])

  // Auto-save active scanning state to local storage
  useEffect(() => {
    if (!floorId) return
    const hasContent = Object.keys(marks).length > 0 || sessionNotes.trim().length > 0 || photoCount > 0
    if (hasContent) {
      saveFloorScan<PersistedPackScan>('pack', floorId, {
        marks,
        scanLog,
        sessionNotes,
        photoCount,
      })
    } else {
      clearFloorScan('pack', floorId)
    }
  }, [floorId, marks, scanLog, sessionNotes, photoCount])

  const discardRestoredScan = () => {
    if (floorId) clearFloorScan('pack', floorId)
    setMarks({})
    setPhotoCount(0)
    setScanLog([])
    setSessionNotes('')
    setRestoredFromStorage(false)
  }

  const rows = useMemo<PackRow[]>(() => (floor ? buildRows(floor) : []), [floor])
  const stateOf = (key: string): RowState => marks[key]?.state ?? 'Pending'

  /* ── derived tallies, all unit-weighted over the real rows ─────────────── */
  const totalUnits = rows.reduce((n, r) => n + r.qty, 0)
  const packedRows = rows.filter((r) => stateOf(r.key) === 'Packed')
  const missingRows = rows.filter((r) => stateOf(r.key) === 'Missing')
  const pendingRows = rows.filter((r) => stateOf(r.key) === 'Pending')
  const packedUnits = packedRows.reduce((n, r) => n + r.qty, 0)
  const pendingUnits = pendingRows.reduce((n, r) => n + r.qty, 0)
  const pct = totalUnits > 0 ? Math.round((packedUnits / totalUnits) * 100) : 0

  /*
   * PK-07 — how the packed rows got there. The two tallies are the only place
   * this distinction survives: see the note on `Mark.via` for why the database
   * cannot tell a scanned unit from a hand-ticked one.
   */
  const scannedRows = packedRows.filter((r) => marks[r.key]?.via === 'scan')
  const handMarkedRows = packedRows.filter((r) => marks[r.key]?.via !== 'scan')
  const handMarkedUnits = handMarkedRows.reduce((n, r) => n + r.qty, 0)

  /*
   * §1.5 — Pack runs at status **Booked**; the badge shows the CANONICAL stage
   * (never a seventh name like "Preparing"). Mid-pack is the Pack *job* being
   * In Progress — a separate axis, a separate chip.
   */
  const stage = (floor?.stage ?? 'Booked') as BookingStatus
  /*
   * PK-17 — this chip states THE CHECKLIST ON THIS SCREEN, and the three §1.5
   * names are used for it: nothing resolved, some rows still pending, every row
   * resolved. It is not read from `operation_sessions`; nothing is recorded
   * until Complete Packing, which the line beneath the chip and the footer both
   * say.
   *
   * Two readings were wrong before. `packedRows.length === 0` answered "Not
   * Started" for a booking where every single unit had been marked MISSING —
   * the operator's whole shift, reported as untouched. And a booking with every
   * row resolved but one of them missing answered "In Progress", because the
   * Complete branch required `missingRows.length === 0` — and it stayed there
   * however the operator resolved the rest of the checklist.
   */
  const jobState: JobState =
    packedRows.length === 0 && missingRows.length === 0
      ? 'Not Started'
      : pendingRows.length > 0
        ? 'In Progress'
        : 'Complete'

  const jobChip = packJobChip(jobState, missingRows.length)

  /* ── the completion gate — a checklist, every condition named ────────────
   * The same conditions `runFloorVerb` and the 0003 close gates enforce,
   * evaluated here first so the refusal is readable before it is a rejection. */
  const shortReasons = missingRows.filter((r) => (marks[r.key]?.reason ?? '').trim().length < MIN_REASON)
  const anythingResolved = packedRows.length > 0 || missingRows.length > 0
  const needsPhoto = packedRows.length > 0 && photoCount === 0

  const gates: Array<{ label: string; pass: boolean; detail: string | null }> = [
    {
      label: 'At least one item verified',
      pass: anythingResolved,
      detail: anythingResolved ? null : 'Nothing has been ticked or scanned yet — a session claiming work on nothing is refused.',
    },
    {
      /*
       * PK-03 — EVERY unit row, not only `is_required` ones. The engine sends
       * `qty: <packed units>` against `required = booking_lines.qty`, so a
       * non-required unit left Pending leaves the line 'Partial' and holds the
       * stage; a gate that let it through promised a Packed the write could not
       * deliver. `required` stays on the row as information only.
       */
      label: 'Every item packed or marked missing',
      pass: pendingRows.length === 0,
      detail:
        pendingRows.length === 0
          ? null
          : `${pendingRows.length} item${pendingRows.length > 1 ? 's' : ''} not yet packed or marked missing — a unit left pending holds the booking at Booked`,
    },
    {
      label: `Missing items carry a reason (≥ ${MIN_REASON} characters)`,
      pass: shortReasons.length === 0,
      detail:
        shortReasons.length === 0
          ? null
          : `${shortReasons.length} missing item${shortReasons.length > 1 ? 's need' : ' needs'} a fuller reason — that is a database CHECK, not a form rule`,
    },
    {
      label: 'Evidence photo taken for this booking',
      pass: !needsPhoto,
      detail: needsPhoto ? 'Ruled mandatory (§4.31): one photo per booking before completion' : null,
    },
  ]
  const firstBlockedGate = gates.find((g) => !g.pass) ?? null
  // PK-01 — once a session is recorded but held, this screen writes nothing
  // more: re-sending the same marks resumes the In Progress session and
  // re-inserts their movements. The way on is the booking.
  const canComplete = firstBlockedGate === null && !dispatching && stageHeld === null

  const visible = useMemo(
    () =>
      rows.filter((r) => {
        const s = marks[r.key]?.state ?? 'Pending'
        if (filter !== 'All' && s !== filter) return false
        if (query && !`${r.name} ${r.serial ?? ''}`.toLowerCase().includes(query.toLowerCase())) return false
        return true
      }),
    [rows, marks, filter, query],
  )

  const groups = useMemo(() => {
    const byGroup = new Map<string, PackRow[]>()
    for (const r of rows) {
      const bucket = byGroup.get(r.group)
      if (bucket) bucket.push(r)
      else byGroup.set(r.group, [r])
    }
    return [...byGroup.entries()].map(([name, groupRows]) => ({ name, rows: groupRows }))
  }, [rows])

  /**
   * The exact payload Complete Packing would send, computed as the operator
   * marks rather than only at dispatch — so the rail can state what will and
   * will not be recorded (PK-06) *before* the write, not in a note discovered
   * afterwards. `completePacking` sends this same value; there is one
   * derivation, so the disclosure and the dispatch cannot disagree.
   */
  const dispatchPlan = useMemo(
    () => (floor ? buildPackLines(floor.lines, rows, marks) : { payload: [], mixedNotes: [], mixed: [] }),
    [floor, rows, marks],
  )

  /* ── mark helpers ────────────────────────────────────────────────────── */
  const markPacked = (key: string, via: 'scan' | 'manual') =>
    setMarks((p) => ({ ...p, [key]: { state: 'Packed', packedAtIso: new Date().toISOString(), via } }))
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
   * Tick one row Packed and say what that did — the SAME answer to the scanner
   * modal and to the log in the rail.
   *
   * PK-09: this used to return nothing, and the modal assumed every identity
   * match was a fresh mark. On a second scan of an already-ticked unit the
   * modal beeped success and said "marked", while this function wrote "already
   * packed" into the rail the modal was covering — the operator was told the
   * opposite of what was recorded, and the record was the one they could not
   * see. The verdict now leaves here once and is rendered wherever it is
   * needed.
   */
  const pack = (key: string, via: 'scan' | 'manual'): ScanOutcome => {
    const row = rows.find((r) => r.key === key)
    if (!row) {
      setScanLog((p) => [`✕ ${key} is not on this checklist`, ...p].slice(0, 5))
      return { ok: false, message: 'is not on this booking checklist — nothing was ticked.' }
    }
    const current = stateOf(key)
    if (current === 'Packed') {
      setScanLog((p) => [`• ${row.name} was already ticked — nothing changed`, ...p].slice(0, 5))
      return { ok: false, message: 'was already ticked packed — nothing changed.' }
    }

    markPacked(key, via)
    const how = via === 'scan' ? 'scanned and ticked packed' : 'ticked packed by hand'

    if (current === 'Missing') {
      // The unit turned up. Say that the reason is gone rather than losing it
      // silently — `markPacked` replaces the whole mark.
      setScanLog((p) => [`✓ ${row.name} ${how} — it was marked missing, so that reason is dropped`, ...p].slice(0, 5))
      return {
        ok: true,
        message: `${how}. It was marked missing, so that reason is dropped. Nothing is recorded until Complete Packing.`,
      }
    }

    setScanLog((p) => [`✓ ${row.name} ${how}`, ...p].slice(0, 5))
    return { ok: true, message: `${how} — nothing is recorded until Complete Packing.` }
  }

  /**
   * PK-07 — this is what the button labelled **"Bulk Scan"** did: mark every
   * row Packed, with no scan, no serial read and no verification of any kind.
   * A control named for scanning that does not scan is a claim about *how* the
   * units were checked, and it was false for every unit it touched.
   *
   * The capability survives — a rack of forty identical cables is a real floor
   * case — under a name that says what it does, and it no longer overwrites a
   * scanned mark: a row someone scanned keeps `via: 'scan'` and its own packed
   * time. Only Pending rows move.
   *
   * Be exact about which half of that is new: leaving a MISSING row alone is
   * not a change, the old `packAll` skipped those too. What changed is the
   * name, and that an existing `'scan'` mark is no longer overwritten with a
   * hand mark.
   */
  const markPendingPacked = () => {
    const at = new Date().toISOString()
    const pending = rows.filter((r) => marks[r.key] === undefined)
    if (pending.length === 0) {
      // Say so rather than doing nothing quietly — a press with no visible
      // effect reads as a control that failed.
      setScanLog((p) => ['• Nothing is pending — no rows changed', ...p].slice(0, 5))
      return
    }
    setMarks((p) => {
      const next = { ...p }
      for (const r of rows) {
        if (next[r.key] === undefined) next[r.key] = { state: 'Packed', packedAtIso: at, via: 'manual' }
      }
      return next
    })
    setScanLog((p) =>
      [`• ${pending.length} row${pending.length === 1 ? '' : 's'} ticked packed by hand — no scan`, ...p].slice(0, 5),
    )
  }

  /* RULING 2026-09-08 (R-28): which of these units are due for a service.
     One read for the whole checklist, keyed by `product_units.id`; quantity rows
     carry no unit and are not asked about. `readServiceDue` never throws — a
     warning that "warns only" must not be able to take the packing screen down,
     and on a project without `0103` applied it simply returns nothing. */
  const [serviceByUnit, setServiceByUnit] = useState<Map<string, ServiceRow>>(new Map())
  useEffect(() => {
    let cancelled = false
    const ids = rows.map((r) => r.assetId).filter((id): id is string => id !== null)
    if (ids.length === 0) {
      setServiceByUnit(new Map())
      return
    }
    void readServiceDue(ids).then((byUnit) => {
      if (!cancelled) setServiceByUnit(byUnit)
    })
    return () => {
      cancelled = true
    }
  }, [rows])

  const scannableUnits = rows.map((r) => ({
    id: r.key,
    name: r.name,
    ...(r.serial ? { serial: r.serial } : {}),
    // Quantity rows have no serial to scan — the modal treats them as accessories.
    isAccessory: r.serial === null,
  }))

  /* ── the dispatch — real line ids, dispatch-then-commit ────────────────── */
  const completePacking = () => {
    if (!canComplete || !floor) return
    // The identity is the signed-in operator or there is no dispatch — never a
    // made-up `{ userId: 'USR-001' }` on a floor record.
    if (!user) {
      setDispatchError('You are not signed in, so this packing session cannot be recorded against anyone. Nothing was written.')
      return
    }
    setDispatchError(null)
    setDispatching(true)

    const { payload, mixedNotes } = dispatchPlan
    /*
     * PK-07 — the session notes are the only column that can hold how the
     * units were verified, so the count goes there rather than nowhere. It is
     * a statement about this session, in the same free-text field the mixed-line
     * shortages already ride (`operation_sessions.notes`, 0003:80).
     * `TODO(decision)`: a real column on `packing_lines` or
     * `session_line_movements` would make it queryable; a note is not.
     */
    const verificationNotes =
      handMarkedRows.length === 0
        ? []
        : [
            /* "without a scan" would be a claim this data cannot make. `pack()`
               returns early on a row that is already Packed, so scanning a row
               that was hand-ticked first never upgrades its `via` to 'scan' —
               such a row WAS scanned and still counts here. The wording says
               what `via` actually records: how the row was FIRST marked. */
            `Verification: ${scannedRows.length} of ${packedRows.length} packed row(s) were first marked by scan; ` +
              `${handMarkedRows.length} row(s) (${handMarkedUnits} unit(s)) were first ticked by hand. ` +
              'A later scan of an already-packed row is not recorded — see Mark.via.',
          ]
    const notes = [sessionNotes.trim(), ...mixedNotes, ...verificationNotes].filter((n) => n !== '').join('\n')

    /*
     * ⚠ `navigate` is INSIDE `.then`, and only when the STAGE MOVED. It used
     * to run synchronously after a dispatch that always failed, closing the
     * workspace as though the session had been recorded; then it ran on any
     * resolved promise, landing the operator on a still-Booked booking with no
     * word of why (PK-01). A held stage now stays here and says so.
     */
    import('../../actions/rentals/index')
      .then((m) =>
        m.packRental(
          {
            id: floor.id,
            lines: payload,
            clientUuid: completionKey,
            ...(notes === '' ? {} : { notes }),
          },
          { userId: user.id, role: user.role },
        ),
      )
      .then((result) => {
        if (result.stage !== null) {
          clearFloorScan('pack', floor.id)
          if (onConfirmSuccess) {
            onConfirmSuccess()
          } else {
            navigate(`/rentals/${id}`)
          }
          return
        }
        setStageHeld({ lines: result.lines, movements: result.movements, heldBy: result.stageHeldBy })
        setDispatching(false)
      })
      .catch((err) => {
        captureError(err, { where: 'PackingWorkspace.pack', bookingId: id })
        setDispatchError(formatGateError(err))
        setDispatching(false)
      })
  }

  const isDirty = Object.keys(marks).length > 0 || sessionNotes.trim().length > 0 || photoCount > 0
  useEffect(() => {
    onRegisterActions?.({
      canComplete,
      dispatching,
      complete: completePacking,
      isDirty,
      label: 'Confirm & Next →',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRegisterActions, canComplete, dispatching, isDirty])

  /* ── honest degradations, before any workspace chrome ──────────────────── */

  const notFound = !floorLoading && floorError === null && floor === null

  /*
   * Pack runs at `Booked` (`JOBS.Pack.runsAt`) — `runFloorVerb` would refuse
   * any other stage by name, so the workspace says so up front instead of
   * letting the operator verify eighteen items into a guaranteed refusal.
   * The `BookingNotLoaded` pattern, kept: an honest named state, not an error,
   * and never another state's gear under this number.
   */
  const stageBlock =
    floor === null
      ? null
      : floor.isCancelled
        ? `${floor.bookingNo} is cancelled. Pack does not run on a cancelled booking.`
        : floor.isClosed
          ? `${floor.bookingNo} is Closed. Closed is final — nothing further is recorded.`
          : floor.stage !== 'Booked'
            ? `Pack runs at stage Booked; ${floor.bookingNo} is at ${floor.stage}. ` +
              (floor.stage === 'Packed' ? 'This booking is already packed.' : 'Nothing can be packed here.')
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
        emptyMessage="Check the booking number — nothing with this number exists, so there is nothing to pack."
      >
        {floor !== null && stageBlock !== null && (
          <EmptyState
            title={`Packing is not available for ${floor.bookingNo}`}
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
            message="The booking loaded but its lines did not come back with it, so the checklist cannot be trusted. Retry before packing anything."
            onRetry={() => setReload((n) => n + 1)}
          />
        )}

        {floor !== null && stageBlock === null && floor.linesPresence === 'present' && rows.length === 0 && (
          <EmptyState
            title={`${floor.bookingNo} has no live lines`}
            description="Every line on this booking is voided, none were added, or every line is a service, sub-rental or manual item — nothing physical to pack."
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
                  <span>Restored in-progress packing session from this device.</span>
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
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-lg)', flexWrap: 'wrap' }}>
              {/*
                §3 — header. No Back, no ✕, and Complete Packing is NOT here.
                Rulings §4: the shell's breadcrumb trail is the upward affordance
                and `Cancel Packing` in the footer is the single exit.
              */}
              {!embedded && (
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                    <h1 style={{ margin: 0, fontSize: 'var(--t-h1)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.015em' }}>
                      Packing Workspace
                    </h1>
                    {/*
                      ⭐ RULED (Rulings §7): the badge shows the CANONICAL stage —
                      never "Preparing", never a seventh name. The mid-pack signal
                      is the *job* chip beside it. Two axes, two chips.
                      Law 11 on both: icon + label + colour.
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
                      Pack job: {jobChip.label}
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

              {/* §3 centre — progress with a message. */}
              <div style={{ minWidth: 260, flex: 1 }}>
                <div style={{ display: 'flex', gap: 10, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  <span>Packing Progress</span>
                  <span className="figure" style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text)' }}>
                    {packedUnits} / {totalUnits} ({pct}%)
                  </span>
                </div>
                <div aria-hidden style={{ height: 8, borderRadius: 'var(--r-badge)', background: 'var(--card2)', marginTop: 6, overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '100%', background: 'var(--success)', borderRadius: 'var(--r-badge)', transform: `scaleX(${pct / 100})`, transformOrigin: 'left', transition: 'transform var(--dur) ease' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 'var(--t-meta)', color: pendingUnits ? 'var(--progress-text)' : 'var(--success-text)', fontWeight: 600 }}>
                  <Icon name={pendingUnits ? 'alert_triangle' : 'checklist'} size={12} />
                  {pendingUnits ? `${pendingUnits} unit${pendingUnits > 1 ? 's' : ''} pending` : 'All items resolved'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
                {/*
                  PK-08 — this carried no `onClick` at all. It painted as a live
                  secondary button, depressed under the `press` class, and did
                  nothing: an operator who pressed it and walked to the printer
                  had no way to tell it from a print that failed.
                  `Unavailable` + `disabled` is the house treatment for an
                  unbuilt control (`Header.tsx`'s Notifications and Help,
                  `Warehouses.tsx`'s Print Labels), and it states the reason on
                  hover AND on a long-press, which is what the warehouse tablet
                  has.
                */}
                <Unavailable reason="Printing a packing list is not built. Nothing in the app generates a packing-list document, and there is no print stylesheet, so this would send the whole workspace — filters, rails and buttons — to the printer instead of a list.">
                  <Button icon="file" disabled>
                    Print Packing List
                  </Button>
                </Unavailable>
                {/*
                 * The identity is the signed-in operator or there is no dispatch.
                 * `saveDraft` is still an unimplemented stub the dispatcher
                 * refuses before `execute` — the refusal is surfaced in
                 * `dispatchError`, the inline persistent line this screen
                 * already renders (Law 12). A draft button that does nothing
                 * and says nothing is indistinguishable from one that saved.
                 */}
                <Button
                  onClick={() => {
                    if (!user) {
                      setDispatchError('You are not signed in, so this draft cannot be saved against anyone. Nothing was written.')
                      return
                    }
                    setDispatchError(null)
                    import('../../actions/rentals/index')
                      .then((m) => m.saveDraft({ id: floor.id }, { userId: user.id, role: user.role }))
                      .catch((err) => {
                        captureError(err, { where: 'PackingWorkspace.saveDraft' })
                        setDispatchError(formatGateError(err))
                      })
                  }}
                >
                  Save Draft
                </Button>
              </div>
            </div>

            {/* §4 — read-only booking summary, one compact row. BS above AD.
                Every cell is a real column off `fetchFloorBooking`; the seed
                build's invented Payment / Crew cells are gone rather than faked. */}
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
                { l: 'Status', v: floor.stage, big: true },
                { l: 'Pack job', v: jobState },
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

            {/*
              §3.2's three layouts, all of them REFLOW rather than hide (Rulings §7):
               · desktop ≥1280 — tree │ list │ progress, three columns;
               · tablet 768–1279 — list and progress side by side, tree beneath;
               · phone <768 — one column: list → progress → tree.
            */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: desktop ? 'auto minmax(0,1fr) auto' : phone ? '1fr' : 'minmax(0,1fr) 320px',
                gap: 'var(--sp-md)',
                alignItems: 'start',
              }}
            >
              {/* ── §5 left — bundle tree, counts derived from the real rows ── */}
              <FloorAside collapsible={desktop} side="left" width={260} label="Bundle / Item Tree" style={place.tree}>
                <Card title="1 · Bundle / Item Tree">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', paddingBottom: 9, borderBottom: '1px solid var(--border)' }}>
                    {/* --ready-text, not --st-progress-fg: this glyph carries no
                        yellow fill behind it, and the fg half of the pair is
                        near-black ink meant to sit ON the yellow block — on the
                        dark card (#15171B) that ink is all but invisible. The
                        text-safe yellow is gated in both themes. */}
                    <Icon name="box" size={17} style={{ color: 'var(--ready-text)' }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                        {floor.project ?? floor.bookingNo}
                      </span>
                      <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                        {totalUnits} units · {floor.lines.length} line{floor.lines.length === 1 ? '' : 's'}
                      </span>
                    </span>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    {groups.map((g) => {
                      const done = g.rows.filter((r) => stateOf(r.key) === 'Packed').length
                      return (
                        <button
                          key={g.name}
                          type="button"
                          onClick={() => setHighlight(highlight === g.name ? null : g.name)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--sp-sm)',
                            width: '100%',
                            padding: '7px 6px',
                            borderRadius: 7,
                            border: 'none',
                            background: highlight === g.name ? 'var(--nav-active-bg)' : 'transparent',
                            color: 'var(--text2)',
                            fontSize: 'var(--t-meta)',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            textAlign: 'left',
                          }}
                        >
                          <Icon
                            name={done === g.rows.length ? 'checklist' : 'box'}
                            size={13}
                            style={{ color: done === g.rows.length ? 'var(--success-text)' : 'var(--muted)', flexShrink: 0 }}
                          />
                          <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</span>
                          <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                            {done}/{g.rows.length}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 7 }}>Bundle Summary</div>
                    {[
                      { l: 'Total Rows', v: rows.length, tone: 'var(--text)' },
                      { l: 'Packed', v: packedRows.length, tone: 'var(--success-text)' },
                      { l: 'Pending', v: pendingRows.length, tone: 'var(--progress-text)' },
                      { l: 'Missing', v: missingRows.length, tone: 'var(--danger-text)' },
                    ].map((r) => (
                      <div key={r.l} style={{ display: 'flex', gap: 'var(--sp-sm)', padding: '3px 0', fontSize: 'var(--t-meta)' }}>
                        <span style={{ flex: 1, color: 'var(--text2)' }}>{r.l}</span>
                        <span className="figure" style={{ fontWeight: 700, color: r.tone }}>{r.v}</span>
                      </div>
                    ))}
                    {/* §5 — the invariant, stated where it is visible. */}
                    <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                      Group counts are derived from the booking&apos;s live lines and always sum to {rows.length}.
                    </p>
                  </div>
                </Card>
              </FloorAside>

              {/* ── §6 centre — checklist over the real rows ─────────────────── */}
              <div style={{ minWidth: 0, ...place.list }}>
                <Card
                  title="2 · Packing Checklist"
                  bodyStyle={{ padding: 0 }}
                  action={
                    phone ? (
                      <Button icon="checklist" onClick={markPendingPacked}>Mark Pending</Button>
                    ) : (
                      <>
                        {/*
                          PK-07 — was `Bulk Scan`, wearing the search glyph and
                          running `packAll`. It scanned nothing, read no serial
                          and checked nothing: one press took 0/3 to 3/3. The
                          name now matches the act, and the act is narrower —
                          only Pending rows move, so a scan is never overwritten
                          by a hand mark. What it does is counted under Packing
                          Summary, where the split is visible before dispatch.
                        */}
                        <Button icon="checklist" onClick={markPendingPacked}>Mark Pending Packed</Button>
                        <Button icon="queues" onClick={() => setShowScanner(true)}>Scan Barcode</Button>
                        <Button icon="queues" onClick={() => setShowScanner(true)}>Scan QR</Button>
                      </>
                    )
                  }
                >
                  <div style={{ display: 'flex', gap: 7, padding: '9px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      value={queryInput}
                      onChange={(e) => setQueryInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setQuery(queryInput)
                        }
                      }}
                      placeholder="Search item, serial…"
                      aria-label="Search items"
                      style={{ flex: 1, minWidth: 180, minHeight: 44, padding: '0 9px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
                    />
                    {FILTERS.map((f) => {
                      const on = filter === f
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFilter(f)}
                          aria-pressed={on}
                          style={{
                            minHeight: phone ? 36 : 26,
                            padding: phone ? '0 12px' : '0 9px',
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
                          {f}
                        </button>
                      )
                    })}
                  </div>

                  {phone ? (
                    /* Shell rule: tables become card rows below 768. One card per
                       row: serial + status + one primary action. */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', padding: 'var(--sp-sm)' }}>
                      {visible.map((r) => {
                        const s = stateOf(r.key)
                        const mark = marks[r.key]
                        const tone = LINE_TONE[s]
                        const dim = highlight !== null && r.group !== highlight
                        return (
                          <article
                            key={r.key}
                            style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 7, opacity: dim ? 0.35 : 1 }}
                          >
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44 }}>
                              <input
                                type="checkbox"
                                checked={s === 'Packed'}
                                aria-label={`Pack ${r.name}`}
                                style={{ width: 22, height: 22, marginTop: 2, flexShrink: 0 }}
                                onChange={() => {
                                  if (s === 'Packed') clearMark(r.key)
                                  else pack(r.key, 'manual')
                                }}
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
                                </span>
                                {r.serial && (
                                  <Link to={`/inventory/${r.serial}`} className="identifier" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)', textDecoration: 'none', marginTop: 2 }}>
                                    {r.serial}
                                  </Link>
                                )}
                                <ServiceDueLine row={r.assetId === null ? undefined : serviceByUnit.get(r.assetId)} />
                              </span>
                            </label>

                            {(r.location || mark?.packedAtIso) && (
                              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                                {r.location ?? ''}
                                {mark?.packedAtIso ? `${r.location ? ' · ' : ''}packed ${formatAdDateTime(mark.packedAtIso)}` : ''}
                              </span>
                            )}

                            <span style={{ display: 'flex', gap: 'var(--sp-xs)', flexWrap: 'wrap' }}>
                              {s === 'Pending' && <RowAction label="Missing" onClick={() => markMissing(r.key)} />}
                              {s === 'Missing' && <RowAction label="Undo" onClick={() => clearMark(r.key)} />}
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
                            {['', 'Item / Accessory', 'Serial / ID', 'Qty', 'Status', 'Location', 'Packed At', ''].map((h, i) => (
                              <th key={h || i} style={th}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map((r) => {
                            const s = stateOf(r.key)
                            const mark = marks[r.key]
                            const tone = LINE_TONE[s]
                            const dim = highlight !== null && r.group !== highlight
                            return (
                              <tr key={r.key} style={{ borderBottom: '1px solid var(--border)', opacity: dim ? 0.35 : 1 }}>
                                <td style={{ ...td, width: 26 }}>
                                  <input
                                    type="checkbox"
                                    checked={s === 'Packed'}
                                    aria-label={`Pack ${r.name}`}
                                    onChange={() => {
                                      if (s === 'Packed') clearMark(r.key)
                                      else pack(r.key, 'manual')
                                    }}
                                  />
                                </td>
                                <td style={{ ...td, whiteSpace: 'normal' }}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                                    {r.required && (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', height: 15, padding: '0 5px', borderRadius: 4, background: 'var(--st-primary-bg)', color: 'var(--st-primary-fg)', fontSize: 'var(--t-meta)', fontWeight: 700 }}>
                                        Required
                                      </span>
                                    )}
                                  </span>
                                  <ServiceDueLine row={r.assetId === null ? undefined : serviceByUnit.get(r.assetId)} />
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
                                </td>
                                <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{r.location ?? '—'}</td>
                                <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                                  {mark?.packedAtIso ? formatAdDateTime(mark.packedAtIso) : '—'}
                                </td>
                                {/* §6 row actions — without these a Required row's
                                    only exit from Pending is the checkbox, and the
                                    gate could dead-end. */}
                                <td style={{ ...td, width: 120 }}>
                                  <span style={{ display: 'flex', gap: 'var(--sp-xs)', justifyContent: 'flex-end' }}>
                                    {s === 'Pending' && <RowAction label="Missing" onClick={() => markMissing(r.key)} />}
                                    {s === 'Missing' && <RowAction label="Undo" onClick={() => clearMark(r.key)} />}
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

                  {/*
                    PK-17 — this read "All items packed successfully. Ready for
                    Pickup / Delivery." while every tick was still local state:
                    no session existed, no line row had been written, and the
                    booking was still at Booked, where no handover can happen.
                    It announced the outcome of a dispatch that had not been
                    attempted — in the success green, on the screen whose whole
                    job is telling recorded from not-recorded.

                    It now states the checklist, in the neutral tone, and names
                    what is still outstanding.
                  */}
                  {pendingRows.length === 0 && missingRows.length === 0 && rows.length > 0 && (
                    <div style={{ margin: 12, padding: '10px 12px', borderRadius: 'var(--r-btn)', background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600, display: 'flex', gap: 7, alignItems: 'center' }}>
                      <Icon name="checklist" size={13} />
                      Every item on this checklist is ticked packed. Nothing is recorded yet — Complete Packing writes
                      the session, and only then does {floor.bookingNo} move to Packed.
                    </div>
                  )}
                </Card>
              </div>

              {/* ── §9 right — progress, the gate checklist, the completion gate ── */}
              <FloorAside collapsible={desktop} side="right" width={300} label="Packing progress" style={place.rail}>
                <Card title="Progress">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)' }}>
                    <Ring pct={pct} />
                    <div style={{ minWidth: 0 }}>
                      <div className="figure" style={{ fontSize: 'var(--t-h3)', fontWeight: 700, color: 'var(--text)' }}>
                        {totalUnits} units · {packedUnits} packed
                      </div>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', marginTop: 2 }}>
                        Pack job: {jobState}
                      </div>
                      {/* PK-17 — the chip counts ticks on this screen. It is
                          not read back from the session, and no session exists
                          until the dispatch lands. */}
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>
                        Ticks on this screen — nothing is recorded until Complete Packing.
                      </div>
                    </div>
                  </div>
                </Card>

                {/*
                  The session gate checklist — every condition named, pass or
                  fail, inline in the rail (spec 03 Notes bullet 2: "Blockers
                  render inline in the rail"). A blocked gate is never a toast
                  (Law 12); the reason stays on screen while the block lasts.
                */}
                <Card title="Blockers">
                  <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {gates.map((g) => (
                      <div key={g.label} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 'var(--t-meta)', lineHeight: 1.45 }}>
                        <Icon
                          name={g.pass ? 'checklist' : 'alert_triangle'}
                          size={13}
                          style={{ color: g.pass ? 'var(--success-text)' : 'var(--progress-text)', flexShrink: 0, marginTop: 1 }}
                        />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 600, color: g.pass ? 'var(--text2)' : 'var(--progress-text)' }}>
                            {g.label}
                          </span>
                          {g.detail && <span style={{ display: 'block', color: 'var(--muted)' }}>{g.detail}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>

                {/*
                  PK-06 — the shortage this dispatch CANNOT record, said before
                  the operator presses the button rather than in a note found
                  afterwards.

                  A `FloorLineInput` carries one outcome for the whole booking
                  line and `validateFloorVerb` refuses the same line id twice,
                  so a line with some units packed and some missing has no
                  truthful encoding: sent as 'done' it records the packed units
                  and writes no `missing_reason` and no `unit_state 'Missing'`;
                  sent as 'missing' it would stamp Missing on the units that
                  were packed. See `buildPackLines` for the full argument.

                  Not a gate — the packed units really were packed and refusing
                  the whole dispatch would lose that. A statement, inline and
                  persistent (Law 12), never a toast.
                */}
                {dispatchPlan.mixed.length > 0 && (
                  <div
                    role="status"
                    style={{ ...cardStyle, padding: 12, border: '1px solid var(--danger)', display: 'flex', flexDirection: 'column', gap: 6 }}
                  >
                    <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                      <Icon name="alert_triangle" size={15} style={{ color: 'var(--danger-text)', flexShrink: 0 }} />
                      <span style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                        Missing units on {dispatchPlan.mixed.length} line
                        {dispatchPlan.mixed.length === 1 ? '' : 's'} will not be recorded as missing
                      </span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--t-meta)', color: 'var(--text)', lineHeight: 1.45 }}>
                      {dispatchPlan.mixed.map((m) => (
                        <li key={m.lineId}>
                          {m.lineName} — {m.missing} of {m.total} unit{m.total === 1 ? '' : 's'} missing
                        </li>
                      ))}
                    </ul>
                    <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
                      A booking line is recorded with one outcome. On these lines the packed units are recorded and the
                      missing ones are not: no unit is marked Missing and no missing reason is stored against them. The
                      reasons you typed are written to the session notes, where they can be read but not counted.
                    </p>
                    <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                      {floor.bookingNo} will stay at {floor.stage} until each of these lines is resolved one way for all
                      of its units — every unit packed, or the whole line marked missing.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  disabled={!canComplete}
                  onClick={completePacking}
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
                  {dispatching ? 'Recording…' : 'Complete Packing'}
                </button>

                {/* Law 12 — inline and persistent, never a toast. This is what
                    the operator sees instead of being navigated away from a
                    session that was never recorded. */}
                {dispatchError && <ErrorBanner title="Packing was not recorded" message={dispatchError} />}

                {/* PK-01 — recorded but held. Inline and persistent (Law 12): the
                    operator is not navigated to a Booked booking as if it were Packed. */}
                {stageHeld && (
                  <div role="status" style={{ ...cardStyle, padding: 12, border: '1px solid var(--st-progress-fg)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                      Session recorded — {floor.bookingNo} is still {floor.stage}
                    </div>
                    <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
                      {stageHeld.lines} line{stageHeld.lines === 1 ? '' : 's'} and {stageHeld.movements} unit movement{stageHeld.movements === 1 ? '' : 's'} were written,
                      but the booking did not advance to Packed — these lines are short of a terminal state (every unit packed, or missing with a reason):
                    </p>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--t-meta)', color: 'var(--text)', lineHeight: 1.45 }}>
                      {stageHeld.heldBy.map((lineId) => {
                        const l = floor.lines.find((x) => x.id === lineId)
                        return <li key={lineId}>{l ? (l.productName ?? l.description ?? l.lineType) : lineId}</li>
                      })}
                    </ul>
                    <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                      Nothing more is written from this screen. The packing session stays In Progress and is resumed when this workspace is reopened.
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

                <Card title="3 · Packing Summary">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)' }}>
                    <Ring pct={pct} />
                    <div>
                      <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
                        {packedUnits} / {totalUnits}
                      </div>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Units packed</div>
                      <div className="figure" style={{ fontSize: 'var(--t-ui)', fontWeight: 700, color: missingRows.length ? 'var(--danger-text)' : 'var(--text)', marginTop: 6 }}>
                        {missingRows.length}
                      </div>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>Missing items</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    {([
                      ['Packed', packedRows.length, 'var(--success-text)'],
                      ['Pending', pendingRows.length, 'var(--progress-text)'],
                      ['Missing', missingRows.length, 'var(--danger-text)'],
                    ] as const).map(([l, v, c]) => (
                      <div key={l} style={{ display: 'flex', gap: 'var(--sp-sm)', padding: '3px 0', fontSize: 'var(--t-meta)' }}>
                        <Icon name="dot" size={9} style={{ color: c, marginTop: 4 }} />
                        <span style={{ flex: 1, color: 'var(--text2)' }}>{l}</span>
                        <span className="figure" style={{ fontWeight: 700 }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {/*
                    PK-07 — how the packed rows were verified, which the record
                    itself will not say. See the note on `Mark.via`: the schema
                    has `scan_events` and `session_line_movements.scan_event_id`
                    for exactly this, nothing in the app writes one, and the
                    payload is identical either way. So the split is shown here
                    while the operator can still act on it, and stated in the
                    session notes at dispatch.
                  */}
                  {packedRows.length > 0 && (
                    <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                        How the packed rows were verified
                      </div>
                      {([
                        ['Scanned', scannedRows.length, 'queues'],
                        ['Ticked by hand, no scan', handMarkedRows.length, 'checklist'],
                      ] as const).map(([l, v, iconName]) => (
                        <div key={l} style={{ display: 'flex', gap: 'var(--sp-sm)', padding: '3px 0', fontSize: 'var(--t-meta)', alignItems: 'center' }}>
                          <Icon name={iconName} size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                          <span style={{ flex: 1, color: 'var(--text2)' }}>{l}</span>
                          <span className="figure" style={{ fontWeight: 700 }}>{v}</span>
                        </div>
                      ))}
                      <p style={{ margin: '7px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                        Both are written as packed units — the record does not say which were scanned, so this split
                        goes into the session notes.
                      </p>
                    </div>
                  )}
                </Card>

                <Card title="Missing Items">
                  {missingRows.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No missing items.</p>
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
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* §9 Evidence — ⭐ §4.31: ONE photo per booking, not per case.
                    Honest about its own maturity: the count is local, no file
                    is uploaded, and the Evidence Workspace owns the real files. */}
                <Card title="Evidence" action={<Link to={`/rentals/${id}/evidence`} style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' }}>View All</Link>}>
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
                  <p style={{ margin: '9px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                    Ruled mandatory (§4.31): one photo per booking, not per case. This count is local to this
                    session — no photo is uploaded from here yet; capture, matching and storage live in the
                    Evidence Workspace.
                  </p>
                </Card>

                <Card title="Packing Notes">
                  <textarea
                    value={sessionNotes}
                    onChange={(e) => setSessionNotes(e.target.value)}
                    placeholder="Notes for this packing session (saved onto the session when packing completes)…"
                    aria-label="Packing session notes"
                    rows={3}
                    style={{ width: '100%', minHeight: 64, padding: '8px 9px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', resize: 'vertical' }}
                  />
                  <p style={{ margin: '7px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                    Written to <span className="identifier">operation_sessions.notes</span> with the dispatch —
                    nothing is saved until Complete Packing lands.
                  </p>
                </Card>

                {scanLog.length > 0 && (
                  <div style={{ ...cardStyle, padding: 11 }}>
                    {/* Not "Scan log": most entries come from `pack`, which is
                        reached from the row checkbox as well as from the
                        scanner, and Mark Pending Packed writes one of its own.
                        Each entry names which it was. */}
                    <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Checklist log</div>
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

            {/* §11 — footer. The single EXIT, and nothing else. */}
            {!embedded && (
              <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', padding: '12px 14px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => (onCancel ? onCancel() : navigate(`/rentals/${id}`))}
                  style={{ minHeight: 44, padding: '0 14px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--danger-text)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Cancel Packing
                </button>
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                  {pendingRows.length
                    ? `${pendingRows.length} item${pendingRows.length > 1 ? 's' : ''} pending`
                    : 'All items resolved'}
                  {' · Nothing is saved until Complete Packing — cancelling discards this session'}
                </span>
              </div>
            )}

            <BarcodeScannerModal
              isOpen={showScanner}
              onClose={() => setShowScanner(false)}
              mode="pack"
              bookingId={id}
              items={scannableUnits}
              /* PK-09 — the modal shows THIS answer: one scan, one verdict,
                 in the place the operator is looking. Returning it is what
                 stops the modal beeping success over a "already packed" the
                 rail behind it recorded. */
              onItemScanned={(item) => pack(item.id, 'scan')}
            />

            {phone && !stageHeld && !embedded && (
              <StickyFloorBar
                progress={{
                  current: packedUnits,
                  total: totalUnits,
                  label: pendingUnits ? `${pendingUnits} pending` : 'All items packed',
                  complete: canComplete,
                }}
                onScan={() => setShowScanner(true)}
                primaryAction={{
                  label: dispatching ? 'Recording…' : 'Complete Packing',
                  onClick: completePacking,
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
    <svg width={64} height={64} role="img" aria-label={`${pct}% packed`} style={{ flexShrink: 0 }}>
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
