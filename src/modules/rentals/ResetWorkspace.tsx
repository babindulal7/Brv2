import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, Button, cardStyle } from '../../components/ui/Page'
import { FloorAside, floorPlacements } from '../operations/FloorAside'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { PageBody } from '../../components/ui/PageBody'
import { STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import { JOBS, statusToken } from '../../lib/workflow'
import type { BookingStatus, JobState } from '../../lib/workflow'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { captureError } from '../../lib/monitoring'
import { formatBsOrAd, formatAd } from '../../lib/bs'
import { newClientUuid } from '../../lib/supabase'
import { fetchFloorBooking, type FloorBooking, type FloorLine } from '../../lib/queries/bookings'
import type { ResetEntryInput } from '../../actions/rentals/floorVerb'
import { SHARED_CLEAN_TASKS, DAMAGE_TYPES, SEVERITIES, PROBLEM_ROUTE, QUEUE_FILTERS } from '../../data/reset'
import type { QueueState, ProblemState } from '../../data/reset'
import { CompactButton, TouchTarget } from '../../components/ui/TouchTarget'

/**
 * **Reset Workspace** — `04 Operations/Cleaning & Reset Workflow.md` v3.1
 * (Build Locked), wired live on the floor-loop model `PackingWorkspace.tsx`
 * establishes. Three moves, in order:
 *
 *  1. **Read** — `fetchFloorBooking` (`lib/queries/bookings.ts`, Law 2's one
 *     floor read) resolves `:bookingNo` to the booking head plus its live
 *     `booking_lines` / `booking_line_units` / `product_units`. Every row in
 *     the queue below is one of those rows; nothing is seeded any more.
 *  2. **Verify** — the Waiting → Cleaning → QC → Ready ladder is local state
 *     KEYED ON the real rows (`marks`), exactly like Packing's tick list.
 *     Local until dispatch, committed by the action, never the other way round.
 *  3. **Dispatch** — Complete Reset sends `completeReset` the REAL
 *     `product_units.id`s of the units that reached Ready (Reset is recorded
 *     per item, 0003:899 — `cleaning_queue_entries.unit_id` IS the product
 *     unit), with a Law-8 `clientUuid` minted when the booking loaded.
 *     Navigation happens only on the resolved promise; a failure stays inline
 *     in `ErrorBanner` (Law 12). The empty `unitIds: []` this replaces could
 *     never pass the action's own validator — the page now has true ids.
 *
 * **This is the one workspace of the four that does not move the booking.**
 * `JOBS.Reset` is `{ runsAt: 'Returned', sets: null }` (§1.5) — completing it
 * stamps `cleaning_queue_entries.reset_completed_at` per unit and changes no
 * stage. §1.7: "Reset is deliberately not a close gate."
 *
 * Honest degradation, mirroring the model exactly: an unknown booking gets
 * the not-found empty state; cancelled / Closed / any stage other than
 * `Returned` gets a named refusal that mirrors `runFloorVerb`'s own guards
 * (so the operator is refused BEFORE cleaning eighteen items into a
 * guaranteed rejection); an absent lines embed gets an `ErrorBanner`, never
 * conflated with an empty booking (the `bookingQuery.ts:110-113` defect).
 *
 * What was removed rather than faked, in the model's tradition:
 *  · the 18 seeded `UNITS`, their categories, assignees, `waitingMinutes` and
 *    the whole Queue Time column — the floor read carries none of that;
 *  · the per-category checklist extras (`tasksFor`) — they were keyed on the
 *    seed's `Category`, which no real product on this read carries. Until the
 *    §4.31(2) category/bundle join lands in the query layer, every unit gets
 *    the honest shared list (`SHARED_CLEAN_TASKS`) plus the one task that IS
 *    the fact this screen records: the configuration reset. The Clean/Reset
 *    mode toggle went with the split it displayed;
 *  · the `STAFF` dropdown of three invented names — QC-by is now a typed name
 *    defaulting to the signed-in operator, so the §10 self-check rule
 *    (`by === cleanedBy`) can actually fire for work attributed this session;
 *  · the batch notes textarea — `completeReset` carries no notes field
 *    (Reset has no session, 0003:855), so a field that persisted nowhere is
 *    gone rather than left looking saved;
 *  · `jobCompletedAt: '—'` — the "the write landed" signal is now navigation
 *    on the resolved promise, the model's rule.
 *
 * **No money, anywhere** (Law 6): `lib/money.ts` is not imported, the floor
 * read names no money column, and the Damaged flow records a description and
 * a local photo count, never a cost.
 */

/** §13 sibling convention — the workspace primary is blue in both themes. */
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
 * §4.2's five tokens, mapped onto the four queue states. QC's render colour
 * was purple — banned outright. `progress` is the literal definition of
 * `Cleaning`; `in` (soft green, "back in stock") is `Ready`'s natural home.
 */
const TONE: Record<QueueState, StatusKey> = {
  Waiting: 'neutral',
  Cleaning: 'progress',
  QC: 'primary',
  Ready: 'in',
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
 * The per-unit checklist. `SHARED_CLEAN_TASKS` is the subset the module spec
 * itself calls common to every category (§6.1); the last task names the one
 * database fact this workspace exists to record —
 * `cleaning_queue_entries.reset_completed_at`. The per-category extras the
 * seed carried are NOT invented back in: they were keyed on a `Category` no
 * real row on this read has. When §4.31(2)'s category join reaches the floor
 * read, they can return keyed on truth.
 */
const RESET_TASK = 'Reset configuration — settings, storage, presets to house defaults'
const ROW_TASKS: readonly string[] = [...SHARED_CLEAN_TASKS, RESET_TASK]

/**
 * One queue row — one physical unit (`booking_line_units` row) on a
 * serialised line, or the whole line for a quantity-tracked line with no unit
 * assignments. `assetId` is `product_units.id`, which is exactly what
 * `completeReset`'s `unitIds` wants (`cleaning_queue_entries.unit_id`); null
 * on quantity rows — a unit id is never invented for them, so they can be
 * cleaned on screen but never falsely recorded as reset.
 */
interface ResetRow {
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

/** The local, per-row verification state. Absence from `marks` = this. */
interface RowRec {
  queueState: QueueState
  ticks: readonly string[]
  /** Who cleaned it — the §10 self-check compares QC-by against this. */
  cleanedBy?: string
  qcBy?: string
  qcSkipReason?: string
  qcFailReason?: string
  problem: ProblemState
  problemReason?: string
  damageType?: string
  damageSeverity?: string
}

const FRESH: RowRec = { queueState: 'Waiting', ticks: [], problem: 'No Problems' }

interface ProblemDraft {
  type: ProblemState
  reason: string
  damageType: string
  severity: string
  evidence: number
}

/** §7.2 — required fields before a problem can be recorded and the item can leave the batch. */
function problemReady(draft: ProblemDraft): boolean {
  if (draft.type === 'Missing Item' || draft.type === 'Needs Repair') return draft.reason.trim().length >= 5
  if (draft.type === 'Damaged') return draft.damageType !== '' && draft.severity !== '' && draft.reason.trim().length >= 5 && draft.evidence > 0
  return false
}

/**
 * Was `const CURRENT_USER = 'Ramesh Shrestha'`. A reset record names who
 * cleaned a unit and who QC'd it, and the QC gate compares the two — with a
 * module-level constant the comparison could neither pass nor fail
 * meaningfully. There is no honest stand-in for the person who did the work,
 * so there is none: `null` with no session, and the handlers refuse.
 */
function actorName(user: { name: string } | null): string | null {
  const name = user?.name?.trim()
  return name ? name : null
}

/**
 * Flatten the booking's lines into queue rows — the model's `buildRows`,
 * verbatim in shape: one row per physical unit, one per quantity-tracked
 * line, grouped under the bundle parent's name where `parent_line_id` says
 * there is one. Derived from real rows, never invented.
 */
function buildRows(floor: FloorBooking): ResetRow[] {
  const lineById = new Map(floor.lines.map((l) => [l.id, l]))
  const groupOf = (line: FloorLine): string => {
    const parent = line.parentLineId !== null ? lineById.get(line.parentLineId) : undefined
    const src = parent ?? line
    return src.productName ?? src.description ?? src.lineType
  }

  const rows: ResetRow[] = []
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
        })
      })
    } else {
      // A quantity-tracked line (or one whose units are simply unassigned):
      // one row, cleaned as one. `unitsPresence === 'absent'` is handled
      // before this function is called — an absent embed must never read as
      // "no units" (bookingQuery.ts:110-113 records that defect).
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
 * `/rentals/:bookingNo/reset` is the only mount, and `bookingNo` comes off
 * the route for ANY booking — resolved by `fetchFloorBooking`, not compared
 * against a seed. `BookingNotLoaded`'s own copy said the missing piece was
 * this read; the read exists now, so the honest states below replace it.
 */
export default function ResetWorkspace() {
  const navigate = useNavigate()
  const { bookingNo } = useParams()
  const id = bookingNo ?? ''
  /** The one identity every attribution on this screen may act as. No fallback. */
  const { user } = useAuth()
  const actor = actorName(user)
  const NO_ACTOR =
    'Nobody is signed in, so this cleaning work cannot be recorded against anyone. ' +
    'A reset names who cleaned the unit and who QC’d it, and the QC gate compares the two. Sign in and reopen this workspace.'
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

  /* ── verification state, keyed on the real rows ──────────────────────────
   * `marks` holds only rows the operator touched; absence is Waiting with no
   * problem. Local until Complete Reset dispatches — dispatch-then-commit,
   * where "commit" is the navigation away on the resolved promise. */
  const [marks, setMarks] = useState<Record<string, RowRec>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<(typeof QUEUE_FILTERS)[number]>('All')
  const [query, setQuery] = useState('')
  const [problemDraft, setProblemDraft] = useState<Record<string, ProblemDraft>>({})
  const [qcByDraft, setQcByDraft] = useState<Record<string, string>>({})
  const [qcReason, setQcReason] = useState<Record<string, string>>({})
  /** Law 12 — a dispatch failure is inline and persistent, never a toast. */
  const [dispatchError, setDispatchError] = useState<string | null>(null)
  const [dispatching, setDispatching] = useState(false)
  /**
   * Law 8 — the idempotency key for THIS reset session, minted when the
   * booking loads (the point the user starts acting), not at send time. A
   * double-press replays the same key and resolves to the first write.
   */
  const [completionKey, setCompletionKey] = useState(() => newClientUuid())

  const floorId = floor?.id ?? null
  useEffect(() => {
    // A different booking arrived: everything verified belonged to the old one.
    setMarks({})
    setSelected(new Set())
    setProblemDraft({})
    setQcByDraft({})
    setQcReason({})
    setDispatchError(null)
    setDispatching(false)
    setCompletionKey(newClientUuid())
  }, [floorId])

  const rows = useMemo<ResetRow[]>(() => (floor ? buildRows(floor) : []), [floor])
  const recOf = (key: string): RowRec => marks[key] ?? FRESH
  const setRec = (key: string, patch: Partial<RowRec>) =>
    setMarks((p) => ({ ...p, [key]: { ...(p[key] ?? FRESH), ...patch } }))

  /* ── derived tallies, all over the real rows ─────────────────────────── */
  const activeRows = rows.filter((r) => recOf(r.key).problem === 'No Problems')
  const exceptionRows = rows.filter((r) => recOf(r.key).problem !== 'No Problems')
  const counts: Record<QueueState, number> = { Waiting: 0, Cleaning: 0, QC: 0, Ready: 0 }
  activeRows.forEach((r) => {
    counts[recOf(r.key).queueState] += 1
  })

  const readyRows = activeRows.filter((r) => recOf(r.key).queueState === 'Ready')
  /** The dispatch payload — the REAL `product_units.id`s the operator made Ready. */
  const readyAssetIds = readyRows.filter((r) => r.assetId !== null).map((r) => r.assetId as string)
  const readyKeys = new Set(readyRows.map((r) => r.key))
  /**
   * Every row this dispatch will name: the Ready ones and the recorded
   * exceptions. An exception used to be dropped, which is why a unit marked
   * Damaged left no record at all (RS-03); it is work the floor did and it is
   * reported. Both halves need a real `product_units.id` — a reset and a
   * finding are per unit (0003:899, 0003:455).
   */
  const dispatchRows = rows.filter(
    (r) => r.assetId !== null && (readyKeys.has(r.key) || recOf(r.key).problem !== 'No Problems'),
  )
  const remainingCount = counts.Waiting + counts.Cleaning + counts.QC

  const totalUnits = rows.reduce((n, r) => n + r.qty, 0)
  const readyUnits = readyRows.reduce((n, r) => n + r.qty, 0)

  /* §1.5 — Reset job state, derived from the queue, never hand-set and never written to the booking. */
  const untouched = counts.Cleaning + counts.QC + counts.Ready + exceptionRows.length === 0
  const jobState: JobState = remainingCount === 0 && rows.length > 0 ? 'Complete' : untouched ? 'Not Started' : 'In Progress'

  const stage = (floor?.stage ?? JOBS.Reset.runsAt) as BookingStatus

  /* ── the completion gate — a checklist, every condition named ────────────
   * The same conditions `completeReset`'s validate and `completeResetQueue`
   * enforce, evaluated here first so the refusal is readable before it is a
   * rejection. Exceptions do not block completion: a recorded problem routed
   * the item out of this queue, which is a resolution, not pending work. */
  const gates: Array<{ label: string; pass: boolean; detail: string | null }> = [
    {
      label: 'Signed-in operator',
      pass: user !== null,
      detail: user !== null ? null : 'A reset is recorded against a person. Sign in and reopen this workspace.',
    },
    {
      label: 'Every item Ready or recorded as an exception',
      pass: remainingCount === 0,
      detail: remainingCount === 0 ? null : `${remainingCount} item${remainingCount > 1 ? 's' : ''} still in the queue`,
    },
    {
      /* Ready OR a recorded exception: routing a damaged item out of the queue
         is a result, so a queue where everything turned out damaged is still a
         session worth recording (RS-03). */
      label: 'At least one serialised unit to record',
      pass: dispatchRows.length > 0,
      detail:
        dispatchRows.length > 0
          ? null
          : readyRows.length > 0 || exceptionRows.length > 0
            ? 'Only quantity-tracked rows are resolved. Reset is recorded per physical unit (0003:899), and these rows carry no unit id, so there is nothing true to write.'
            : 'Nothing has reached Ready and no exception has been recorded — a reset claiming work on nothing is refused.',
    },
    {
      /* The engine refuses this too — it is checked here so the refusal reads
         before it is a rejection, the same way every other gate on this screen
         does. `damage_findings.description` is NOT NULL (0003:457). */
      label: 'Damaged items carry a description',
      pass: dispatchRows.every((r) => {
        const rec = recOf(r.key)
        return rec.problem !== 'Damaged' || (rec.problemReason ?? '').trim() !== ''
      }),
      detail: 'A unit marked Damaged raises a damage finding, and its description is a database column, not a form field.',
    },
  ]
  const firstBlockedGate = gates.find((g) => !g.pass) ?? null
  const canComplete = firstBlockedGate === null && !dispatching
  const completeReason = firstBlockedGate === null ? null : firstBlockedGate.detail ?? firstBlockedGate.label

  const visible = useMemo(
    () =>
      rows.filter((r) => {
        const rec = marks[r.key] ?? FRESH
        if (filter !== 'All' && (rec.problem !== 'No Problems' || rec.queueState !== filter)) return false
        if (query && !`${r.name} ${r.serial ?? ''}`.toLowerCase().includes(query.toLowerCase())) return false
        return true
      }),
    [rows, marks, filter, query],
  )

  const groups = useMemo(() => {
    const byGroup = new Map<string, ResetRow[]>()
    for (const r of rows) {
      const bucket = byGroup.get(r.group)
      if (bucket) bucket.push(r)
      else byGroup.set(r.group, [r])
    }
    return [...byGroup.entries()].map(([name, groupRows]) => ({ name, rows: groupRows }))
  }, [rows])

  const selRows = rows.filter((r) => selected.has(r.key))
  const overallDone = selRows.reduce((s, r) => s + recOf(r.key).ticks.length, 0)
  const overallTotal = selRows.length * ROW_TASKS.length
  const overallPct = overallTotal ? Math.round((overallDone / overallTotal) * 100) : 0

  const eligibleRows = selRows.filter((r) => {
    const rec = recOf(r.key)
    return (
      rec.problem === 'No Problems' &&
      (rec.queueState === 'Waiting' || rec.queueState === 'Cleaning') &&
      rec.ticks.length === ROW_TASKS.length
    )
  })
  const markCleanReason = eligibleRows.length > 0 ? null : 'No selected item has a completed checklist'

  /* ── selection & row actions ─────────────────────────────────────────── */
  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const selectAllVisible = () =>
    setSelected(new Set(visible.filter((r) => recOf(r.key).problem === 'No Problems').map((r) => r.key)))
  const clearSelection = () => setSelected(new Set())

  const start = (key: string) => {
    if (!actor) {
      setDispatchError(NO_ACTOR)
      return
    }
    setDispatchError(null)
    setRec(key, { queueState: 'Cleaning', cleanedBy: actor })
    setSelected((prev) => new Set(prev).add(key))
  }

  /* ── checklist ticking — shared tasks cascade to every selected item ───── */
  const toggleShared = (task: string) => {
    if (!actor) {
      setDispatchError(NO_ACTOR)
      return
    }
    setDispatchError(null)
    const allDone = selRows.every((r) => recOf(r.key).ticks.includes(task))
    setMarks((prev) => {
      const next = { ...prev }
      selRows.forEach((r) => {
        const rec = next[r.key] ?? FRESH
        const ticks = allDone ? rec.ticks.filter((t) => t !== task) : rec.ticks.includes(task) ? rec.ticks : [...rec.ticks, task]
        next[r.key] = {
          ...rec,
          ticks,
          queueState: rec.queueState === 'Waiting' && ticks.length > 0 ? 'Cleaning' : rec.queueState,
          cleanedBy: rec.cleanedBy ?? actor,
        }
      })
      return next
    })
  }
  const toggleUnitTask = (key: string, task: string) => {
    if (!actor) {
      setDispatchError(NO_ACTOR)
      return
    }
    setDispatchError(null)
    const rec = recOf(key)
    const ticks = rec.ticks.includes(task) ? rec.ticks.filter((t) => t !== task) : [...rec.ticks, task]
    setRec(key, {
      ticks,
      queueState: rec.queueState === 'Waiting' && ticks.length > 0 ? 'Cleaning' : rec.queueState,
      cleanedBy: rec.cleanedBy ?? actor,
    })
  }

  const markCleanMoveToQc = () => {
    if (!actor) {
      setDispatchError(NO_ACTOR)
      return
    }
    setDispatchError(null)
    setMarks((prev) => {
      const next = { ...prev }
      eligibleRows.forEach((r) => {
        const rec = next[r.key] ?? FRESH
        next[r.key] = { ...rec, queueState: 'QC', cleanedBy: rec.cleanedBy ?? actor }
      })
      return next
    })
  }

  /* ── §7.1 — "Any Problems?", per item ────────────────────────────────── */
  const pickProblem = (key: string, type: ProblemState) => {
    setProblemDraft((prev) => ({
      ...prev,
      [key]: {
        type,
        reason: prev[key]?.reason ?? '',
        damageType: prev[key]?.damageType ?? '',
        severity: prev[key]?.severity ?? '',
        evidence: prev[key]?.evidence ?? 0,
      },
    }))
  }
  const changeProblemField = (key: string, patch: Partial<Omit<ProblemDraft, 'type'>>) => {
    setProblemDraft((prev) => {
      const cur = prev[key]
      if (!cur) return prev
      return { ...prev, [key]: { ...cur, ...patch } }
    })
  }
  const confirmProblem = (key: string) => {
    const draft = problemDraft[key]
    if (!draft || !problemReady(draft)) return
    setRec(key, { problem: draft.type, problemReason: draft.reason, damageType: draft.damageType, damageSeverity: draft.severity })
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    setProblemDraft((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }
  const cancelProblem = (key: string) =>
    setProblemDraft((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  const undoProblem = (key: string) => setRec(key, { problem: 'No Problems' })

  /* ── §10 — QC, performed by someone other than the cleaner by default ───── */
  const passQc = (key: string) => {
    const rec = recOf(key)
    const by = (qcByDraft[key] ?? actor ?? '').trim()
    if (by === '') return
    const reason = qcReason[key] ?? ''
    const selfCheck = by === rec.cleanedBy
    if (selfCheck && reason.trim().length < 5) return
    setRec(key, { queueState: 'Ready', qcBy: by, ...(selfCheck ? { qcSkipReason: reason } : {}) })
  }
  const failQc = (key: string) => {
    const reason = qcReason[key] ?? ''
    if (reason.trim().length < 5) return
    setRec(key, { queueState: 'Waiting', qcFailReason: reason })
  }

  /* ── the dispatch — real unit ids, dispatch-then-commit ────────────────── */
  const completeResetJob = () => {
    if (!canComplete || !floor) return
    // The identity is the signed-in operator or there is no dispatch — never a
    // made-up `{ userId: 'USR-001' }` on a floor record.
    if (!user) {
      setDispatchError('You are not signed in, so this reset cannot be recorded against anyone. Nothing was written.')
      return
    }
    setDispatchError(null)
    setDispatching(true)

    /*
     * RS-01 — the record the floor made, not just the ids. `cleaned_by` and
     * `qc_by` are `users.id` uuids and this screen stores NAMES, so the only
     * identity it can send truthfully is the signed-in operator's own: a stored
     * name equal to the actor's maps to `user.id`; any other name is OMITTED,
     * never guessed at. TODO(decision): a `users.id`-backed staff picker is
     * needed before a second person's cleaning or QC can be attributed — until
     * then a typed QC-by name is a screen fact only (the input says so).
     * RS-03 — exception rows are dispatched too. They used to be dropped
     * entirely, so a unit marked Damaged, Missing or Needs Repair left NO
     * record anywhere: `problem_state` has always had a writer in
     * `completeResetQueue`, but the entry was never named, so it was never
     * reached. A Damaged row also carries its type, severity and description,
     * which the engine writes as a `damage_findings` row with
     * `source = 'Cleaning'` (0003:484).
     */
    const selfIdOf = (name: string | undefined): string | undefined =>
      name !== undefined && actor !== null && name === actor ? user.id : undefined
    const resetEntries: ResetEntryInput[] = dispatchRows.map((r) => {
      const rec = recOf(r.key)
      const cleanedBy = selfIdOf(rec.cleanedBy)
      const qcBy = selfIdOf(rec.qcBy)
      const skipReason = rec.qcSkipReason?.trim() ?? ''
      const failReason = rec.qcFailReason?.trim() ?? ''
      const problemReason = rec.problemReason?.trim() ?? ''
      return {
        unitId: r.assetId as string,
        ...(cleanedBy === undefined ? {} : { cleanedBy }),
        ...(qcBy === undefined ? {} : { qcBy }),
        ...(skipReason === '' ? {} : { qcSkipped: true, qcSkipReason: skipReason }),
        ...(failReason === '' ? {} : { qcFailReason: failReason }),
        ...(rec.problem === 'No Problems'
          ? {}
          : {
              problemState: rec.problem,
              ...(problemReason === '' ? {} : { problemReason }),
              ...(rec.damageType === undefined || rec.damageType === '' ? {} : { damageType: rec.damageType }),
              ...(rec.damageSeverity === undefined || rec.damageSeverity === ''
                ? {}
                : { damageSeverity: rec.damageSeverity }),
            }),
      }
    })

    /*
     * ⚠ Success is reported only on the resolved promise — `navigate` is
     * INSIDE `.then`. The action's own guards (unit not queued, reset not
     * required, already reset, wrong stage) surface here as the inline
     * persistent error, never as a fabricated completion stamp. In mock mode
     * `cleaning_queue_entries` is UNSERVED (corpus.ts), so the dispatch is
     * refused by name and the refusal renders below — no success is invented.
     */
    import('../../actions/rentals/index')
      .then((m) =>
        m.completeReset(
          {
            id: floor.id,
            unitIds: readyAssetIds,
            resetEntries,
            clientUuid: completionKey,
          },
          { userId: user.id, role: user.role },
        ),
      )
      .then(() => navigate(`/rentals/${id}`))
      .catch((err) => {
        captureError(err, { where: 'ResetWorkspace.reset', bookingId: id })
        setDispatchError(err instanceof Error ? err.message : String(err))
        setDispatching(false)
      })
  }

  /* ── honest degradations, before any workspace chrome ──────────────────── */

  const notFound = !floorLoading && floorError === null && floor === null

  /*
   * Reset runs at `Returned` (`JOBS.Reset.runsAt`) — `runFloorVerb` would
   * refuse any other stage by name, so the workspace says so up front instead
   * of letting the operator clean eighteen items into a guaranteed refusal.
   * The `BookingNotLoaded` pattern, kept: an honest named state, not an
   * error, and never another state's gear under this number.
   */
  const runsAt = JOBS.Reset.runsAt
  const stageBlock =
    floor === null
      ? null
      : floor.isCancelled
        ? `${floor.bookingNo} is cancelled. Reset does not run on a cancelled booking.`
        : floor.isClosed
          ? `${floor.bookingNo} is Closed. Closed is final — nothing further is recorded.`
          : floor.stage !== runsAt
            ? `Reset runs at stage ${runsAt}; ${floor.bookingNo} is at ${floor.stage}. ` +
              'Gear is cleaned and reset after it comes back — nothing can be reset here yet.'
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
        emptyMessage="Check the booking number — nothing with this number exists, so there is nothing to reset."
      >
        {floor !== null && stageBlock !== null && (
          <EmptyState
            title={`Reset is not available for ${floor.bookingNo}`}
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
            message="The booking loaded but its lines did not come back with it, so the reset queue cannot be trusted. Retry before cleaning anything."
            onRetry={() => setReload((n) => n + 1)}
          />
        )}

        {floor !== null && stageBlock === null && floor.linesPresence === 'present' && rows.length === 0 && (
          <EmptyState
            title={`${floor.bookingNo} has no live lines`}
            description="Every line on this booking is voided or none were added, so there is nothing to clean or reset."
            actionLabel={`Open booking ${floor.bookingNo}`}
            onAction={() => navigate(`/rentals/${id}`)}
          />
        )}

        {floor !== null && stageBlock === null && floor.linesPresence === 'present' && rows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
            {/* ── header — canonical stage badge + the job chip. Two axes, two
                 chips (Rulings §7); no `←`, the shell breadcrumb is the upward
                 affordance (Rulings §4). ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-lg)', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <h1 style={{ margin: 0, fontSize: 'var(--t-h1)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.015em' }}>
                    Reset Workspace
                  </h1>
                  <span
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)', height: 22, padding: '0 9px',
                      borderRadius: 'var(--r-chip)', background: STATUS[statusToken(stage)].bg, color: STATUS[statusToken(stage)].fg,
                      fontSize: 'var(--t-meta)', fontWeight: 700,
                    }}
                  >
                    <Icon name="dot" size={9} />
                    {stage}
                  </span>
                  <span
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)', height: 22, padding: '0 9px',
                      borderRadius: 'var(--r-badge)', border: '1px solid var(--border)', background: 'var(--card2)',
                      color: jobState === 'Complete' ? 'var(--success-text)' : jobState === 'In Progress' ? 'var(--progress-text)' : 'var(--text2)',
                      fontSize: 'var(--t-meta)', fontWeight: 700,
                    }}
                  >
                    <Icon name={jobState === 'Complete' ? 'checklist' : jobState === 'In Progress' ? 'refresh' : 'dot'} size={11} />
                    Reset job: {jobState}
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

              <div style={{ minWidth: 240, flex: 1 }}>
                <div style={{ display: 'flex', gap: 10, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  <span>Reset Progress</span>
                  <span className="figure" style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text)' }}>
                    {readyUnits} / {totalUnits} Ready
                  </span>
                </div>
                <div aria-hidden style={{ height: 8, borderRadius: 'var(--r-badge)', background: 'var(--card2)', marginTop: 6, overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '100%', background: 'var(--success)', borderRadius: 'var(--r-badge)', transform: `scaleX(${totalUnits > 0 ? readyUnits / totalUnits : 0})`, transformOrigin: 'left', transition: 'transform var(--dur) ease' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 'var(--t-meta)', color: remainingCount ? 'var(--progress-text)' : 'var(--success-text)', fontWeight: 600 }}>
                  <Icon name={remainingCount ? 'alert_triangle' : 'checklist'} size={12} />
                  {remainingCount ? `${remainingCount} item${remainingCount > 1 ? 's' : ''} still in the queue` : 'All items Ready'}
                </div>
              </div>
            </div>

            {/* §4 booking summary strip — every cell a real column off
                `fetchFloorBooking`; the seed's Package / fixed-status cells are
                gone rather than faked. BS above AD (Law 7). */}
            <div style={{ ...cardStyle, display: 'flex', gap: 0, flexWrap: 'wrap', overflow: 'hidden' }}>
              {[
                { l: 'Client', v: floor.clientName ?? '—', big: true },
                { l: 'Due back', v: bsLabel(floor.returnAtAd), s: floor.returnAtAd ? formatAd(new Date(floor.returnAtAd)) : undefined },
                {
                  l: 'Actually returned',
                  v: bsLabel(floor.actualReturnAtAd),
                  s: floor.actualReturnAtAd ? formatAd(new Date(floor.actualReturnAtAd)) : undefined,
                },
                { l: 'Status', v: floor.stage, big: true },
                { l: 'Reset job', v: jobState },
                { l: 'Units', v: String(totalUnits) },
                { l: 'Exceptions', v: String(exceptionRows.length), tone: exceptionRows.length ? 'var(--danger-text)' : undefined },
              ].map((f) => (
                <div key={f.l} style={{ padding: '11px 14px', borderRight: '1px solid var(--border)', minWidth: 0, flex: '1 1 auto' }}>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{f.l}</div>
                  <div style={{ fontSize: f.big ? 'var(--t-h3)' : 'var(--t-body)', fontWeight: f.big ? 700 : 600, color: f.tone ?? 'var(--text)', marginTop: 3, whiteSpace: 'nowrap' }}>
                    {f.v}
                  </div>
                  {f.s && <div className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{f.s}</div>}
                </div>
              ))}
            </div>

            {/* §3.1 — chip tiles, one per queue state, counted over the real rows. */}
            <div style={{ display: 'grid', gridTemplateColumns: phone ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
              {([
                { key: 'Waiting', label: 'WAITING', sub: 'Not started', value: counts.Waiting, icon: 'timer' as const, tone: TONE.Waiting },
                { key: 'Cleaning', label: 'CLEANING', sub: 'In progress', value: counts.Cleaning, icon: 'refresh' as const, tone: TONE.Cleaning },
                { key: 'QC', label: 'QC', sub: 'Quality check', value: counts.QC, icon: 'eye' as const, tone: TONE.QC },
                { key: 'Ready', label: 'READY', sub: 'Ready to rent', value: counts.Ready, icon: 'checklist' as const, tone: TONE.Ready },
              ]).map((t) => (
                <div key={t.key} style={{ ...cardStyle, padding: '11px 13px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Icon name={t.icon} size={14} style={{ color: STATUS[t.tone].fg }} />
                    <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text2)' }}>{t.label}</span>
                  </div>
                  <div className="figure" style={{ fontSize: 'var(--t-h2)', fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{t.value}</div>
                  <div style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{t.sub}</div>
                </div>
              ))}
            </div>

            {/* filters — the queue states, and nothing else. Priority stays
                removed (PLAN.md §4.31(3)). */}
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search equipment, serial…"
                aria-label="Search the reset queue"
                style={{ flex: 1, minWidth: 200, minHeight: 44, padding: '0 10px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
              />
              {QUEUE_FILTERS.map((f) => {
                const on = filter === f
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    aria-pressed={on}
                    style={{
                      height: 28, padding: '0 10px', borderRadius: 7, border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                      background: on ? 'var(--nav-active-bg)' : 'transparent', color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                      fontSize: 'var(--t-meta)', fontWeight: on ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {f}
                  </button>
                )
              })}
            </div>

            {/* §3.5 — groups rail · queue · batch panel; the rails reflow rather
                than collapse below 1280 (Rulings §7). */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: desktop ? 'auto minmax(0,1fr) auto' : phone ? '1fr' : 'minmax(0,1fr) 320px',
                gap: 'var(--sp-md)',
                alignItems: 'start',
              }}
            >
              {/* ── left — groups, derived from the bundle tree ─────────────── */}
              <FloorAside collapsible={desktop} side="left" width={220} label="Groups" style={place.tree}>
                <Card title="Groups">
                  {groups.map((g) => {
                    const ready = g.rows.filter((r) => recOf(r.key).queueState === 'Ready' && recOf(r.key).problem === 'No Problems').length
                    return (
                      <div key={g.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', padding: '6px 0' }}>
                        <Icon name={ready === g.rows.length ? 'checklist' : 'box'} size={13} style={{ color: ready === g.rows.length ? 'var(--success-text)' : 'var(--muted)', flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</span>
                        <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{ready}/{g.rows.length}</span>
                      </div>
                    )
                  })}
                  <p style={{ margin: '9px 0 0', paddingTop: 9, borderTop: '1px solid var(--border)', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                    Group counts are derived from the booking&apos;s live lines and always sum to {rows.length}.
                  </p>
                </Card>
              </FloorAside>

              {/* ── centre — the queue, over the real rows ──────────────────── */}
              <div style={{ minWidth: 0, ...place.list }}>
                <Card
                  title="Reset Queue"
                  bodyStyle={{ padding: 0 }}
                  action={<Button icon="checklist" onClick={selectAllVisible}>Select All Visible</Button>}
                >
                  {phone ? (
                    /* Shell rule — "Tables become card rows below 768." One card
                       per unit, carrying the same select box and the same single
                       row action. */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', padding: 'var(--sp-sm)' }}>
                      {visible.map((r) => {
                        const rec = recOf(r.key)
                        const isException = rec.problem !== 'No Problems'
                        const tone = isException ? STATUS.danger : STATUS[TONE[rec.queueState]]
                        return (
                          <article key={r.key} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44 }}>
                              <input
                                type="checkbox"
                                checked={selected.has(r.key)}
                                disabled={isException}
                                aria-label={`Select ${r.name}`}
                                onChange={() => toggleSelect(r.key)}
                                style={{ width: 22, height: 22, marginTop: 2, flexShrink: 0 }}
                              />
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{r.name}</span>
                                  {r.qty > 1 && <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>×{r.qty}</span>}
                                  {r.required && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', height: 15, padding: '0 5px', borderRadius: 4, background: 'var(--st-primary-bg)', color: 'var(--st-primary-fg)', fontSize: 'var(--t-meta)', fontWeight: 700 }}>
                                      Required
                                    </span>
                                  )}
                                  <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 'var(--r-badge)', background: tone.bg, color: tone.fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                                    {isException ? rec.problem : rec.queueState}
                                  </span>
                                </span>
                                {r.serial && (
                                  <Link to={`/inventory/${r.serial}`} className="identifier" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)', textDecoration: 'none', marginTop: 2 }}>
                                    {r.serial}
                                  </Link>
                                )}
                              </span>
                            </label>

                            {isException && (
                              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>
                                {rec.problem} — {PROBLEM_ROUTE[rec.problem as Exclude<ProblemState, 'No Problems'>]}
                              </span>
                            )}

                            <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                              {r.location ?? '—'}
                              {rec.cleanedBy ? ` · cleaned by ${rec.cleanedBy}` : ''}
                            </span>

                            <div>
                              {isException ? (
                                <RowAction label="Undo" onClick={() => undoProblem(r.key)} />
                              ) : rec.queueState === 'Waiting' ? (
                                <RowAction label="Start" onClick={() => start(r.key)} />
                              ) : rec.queueState === 'QC' ? (
                                <QcRowControls
                                  rec={rec}
                                  by={qcByDraft[r.key] ?? actor ?? ''}
                                  reason={qcReason[r.key] ?? ''}
                                  onByChange={(v) => setQcByDraft((pv) => ({ ...pv, [r.key]: v }))}
                                  onReasonChange={(v) => setQcReason((pv) => ({ ...pv, [r.key]: v }))}
                                  onPass={() => passQc(r.key)}
                                  onFail={() => failQc(r.key)}
                                />
                              ) : (
                                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                                  {rec.queueState === 'Ready' ? `QC by ${rec.qcBy ?? '—'}` : `${rec.ticks.length}/${ROW_TASKS.length} ticked`}
                                </span>
                              )}
                            </div>
                          </article>
                        )
                      })}
                      {visible.length === 0 && (
                        <EmptyState
                          title="No items match these filters"
                          actionLabel="Clear filters"
                          onAction={() => { setFilter('All'); setQuery('') }}
                        />
                      )}
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                        <thead>
                          <tr style={{ background: 'var(--th-bg)' }}>
                            {['', 'Equipment', 'Serial / ID', 'Qty', 'Status', 'Location', 'Cleaned by', 'Actions'].map((h, i) => (
                              <th key={h || i} style={th}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {visible.map((r) => {
                            const rec = recOf(r.key)
                            const isException = rec.problem !== 'No Problems'
                            const tone = isException ? STATUS.danger : STATUS[TONE[rec.queueState]]
                            return (
                              <tr key={r.key} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ ...td, width: 26 }}>
                                  <input
                                    type="checkbox"
                                    checked={selected.has(r.key)}
                                    disabled={isException}
                                    aria-label={`Select ${r.name}`}
                                    onChange={() => toggleSelect(r.key)}
                                  />
                                </td>
                                <td style={td}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{r.name}</span>
                                    {r.required && (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', height: 15, padding: '0 5px', borderRadius: 4, background: 'var(--st-primary-bg)', color: 'var(--st-primary-fg)', fontSize: 'var(--t-meta)', fontWeight: 700 }}>
                                        Required
                                      </span>
                                    )}
                                  </span>
                                  {isException && (
                                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--danger-text)', marginTop: 2, whiteSpace: 'normal' }}>
                                      {rec.problem} — {PROBLEM_ROUTE[rec.problem as Exclude<ProblemState, 'No Problems'>]}
                                    </span>
                                  )}
                                </td>
                                <td className="identifier" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                                  {r.serial ? (
                                    <Link to={`/inventory/${r.serial}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.serial}</Link>
                                  ) : (
                                    <span style={{ color: 'var(--muted)' }}>—</span>
                                  )}
                                </td>
                                <td className="figure" style={td}>{r.qty}</td>
                                <td style={td}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 'var(--r-badge)', background: tone.bg, color: tone.fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                                    {isException ? rec.problem : rec.queueState}
                                  </span>
                                </td>
                                <td className="figure" style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{r.location ?? '—'}</td>
                                <td style={{ ...td, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{rec.cleanedBy ?? '—'}</td>
                                <td style={{ ...td, minWidth: 190 }}>
                                  {isException ? (
                                    <RowAction label="Undo" onClick={() => undoProblem(r.key)} />
                                  ) : rec.queueState === 'Waiting' ? (
                                    <RowAction label="Start" onClick={() => start(r.key)} />
                                  ) : rec.queueState === 'QC' ? (
                                    <QcRowControls
                                      rec={rec}
                                      by={qcByDraft[r.key] ?? actor ?? ''}
                                      reason={qcReason[r.key] ?? ''}
                                      onByChange={(v) => setQcByDraft((pv) => ({ ...pv, [r.key]: v }))}
                                      onReasonChange={(v) => setQcReason((pv) => ({ ...pv, [r.key]: v }))}
                                      onPass={() => passQc(r.key)}
                                      onFail={() => failQc(r.key)}
                                    />
                                  ) : (
                                    <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                                      {rec.queueState === 'Ready' ? `QC by ${rec.qcBy ?? '—'}` : `${rec.ticks.length}/${ROW_TASKS.length} ticked`}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                          {visible.length === 0 && (
                            <tr>
                              <td colSpan={8} style={{ padding: 'var(--sp-xl)', textAlign: 'center', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                                <EmptyState
                                  title="No items match these filters"
                                  actionLabel="Clear filters"
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
              </div>

              {/* ── right — the batch panel, the gate checklist ─────────────── */}
              <FloorAside collapsible={desktop} side="right" width={320} label="Reset selected items" style={place.rail}>
                <Card title={`Reset Selected Items (${selected.size})`} action={selected.size > 0 ? <button type="button" onClick={clearSelection} style={{ border: 'none', background: 'transparent', color: 'var(--link)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--t-meta)' }}>Clear</button> : undefined}>
                  {selRows.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>Select items from the queue to work a batch.</p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 10, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                        <span>Overall Progress</span>
                        <span className="figure" style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text)' }}>{overallDone} / {overallTotal}</span>
                      </div>
                      <div aria-hidden style={{ height: 7, borderRadius: 'var(--r-badge)', background: 'var(--card2)', marginTop: 6, overflow: 'hidden' }}>
                        <div style={{ width: '100%', height: '100%', background: 'var(--success)', borderRadius: 'var(--r-badge)', transform: `scaleX(${overallPct / 100})`, transformOrigin: 'left', transition: 'transform var(--dur) ease' }} />
                      </div>

                      {/* Shared tasks cascade to every selected item (§6.1's
                          honest subset — see ROW_TASKS above). */}
                      <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                          APPLIES TO ALL {selRows.length} SELECTED
                        </div>
                        {ROW_TASKS.map((task) => {
                          const doneCount = selRows.filter((r) => recOf(r.key).ticks.includes(task)).length
                          const allDone = doneCount === selRows.length
                          return (
                            <label key={task} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', fontSize: 'var(--t-meta)', color: 'var(--text)', cursor: 'pointer' }}>
                              <input type="checkbox" checked={allDone} onChange={() => toggleShared(task)} />
                              <span style={{ flex: 1 }}>{task}</span>
                              <span className="figure" style={{ color: 'var(--muted)' }}>{doneCount}/{selRows.length}</span>
                            </label>
                          )
                        })}
                      </div>

                      <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
                        {selRows.map((r) => {
                          const rec = recOf(r.key)
                          const draft = problemDraft[r.key]
                          return (
                            <div key={r.key} style={{ paddingBottom: 12, borderBottom: '1px dashed var(--border)' }}>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', flexWrap: 'wrap' }}>
                                {r.name}
                                {r.serial && (
                                  <span className="identifier" style={{ fontWeight: 400, color: 'var(--muted)' }}>
                                    <Link to={`/inventory/${r.serial}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.serial}</Link>
                                  </span>
                                )}
                                <span className="figure" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{rec.ticks.length}/{ROW_TASKS.length}</span>
                              </div>
                              {ROW_TASKS.map((task) => (
                                <label key={task} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', fontSize: 'var(--t-meta)', color: 'var(--text)', cursor: 'pointer' }}>
                                  <input type="checkbox" checked={rec.ticks.includes(task)} onChange={() => toggleUnitTask(r.key, task)} />
                                  {task}
                                </label>
                              ))}

                              {/* §7.1 — set per item, not per batch. */}
                              <div style={{ marginTop: 7 }}>
                                <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Any Problems?</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                                  {(['No Problems', 'Missing Item', 'Needs Repair', 'Damaged'] as ProblemState[]).map((q) => {
                                    const picked = (draft?.type ?? 'No Problems') === q
                                    return (
                                      <button
                                        key={q}
                                        type="button"
                                        onClick={() => pickProblem(r.key, q)}
                                        style={{
                                          /* Law 15 — the floor is the coarse-pointer case. */
                                          minHeight: 44, padding: '0 10px', borderRadius: 'var(--r-xs)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                          border: `1px solid ${picked ? (q === 'No Problems' ? 'var(--st-in-fg)' : 'var(--st-danger-fg)') : 'var(--border)'}`,
                                          background: picked ? (q === 'No Problems' ? 'var(--st-in-bg)' : 'var(--st-danger-bg)') : 'transparent',
                                          color: picked ? (q === 'No Problems' ? 'var(--st-in-fg)' : 'var(--st-danger-fg)') : 'var(--text2)',
                                        }}
                                      >
                                        {q}
                                      </button>
                                    )
                                  })}
                                </div>

                                {draft && draft.type !== 'No Problems' && (
                                  <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {draft.type !== 'Damaged' && (
                                      <input
                                        value={draft.reason}
                                        onChange={(e) => changeProblemField(r.key, { reason: e.target.value })}
                                        placeholder="Reason (min 5 characters)"
                                        aria-label={`Reason ${r.name} is ${draft.type}`}
                                        style={{ minHeight: 44, padding: '0 8px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
                                      />
                                    )}
                                    {draft.type === 'Damaged' && (
                                      <>
                                        <select
                                          value={draft.damageType}
                                          onChange={(e) => changeProblemField(r.key, { damageType: e.target.value })}
                                          aria-label="Damage type"
                                          style={{ minHeight: 44, borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
                                        >
                                          <option value="">Damage type…</option>
                                          {DAMAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                        <textarea
                                          value={draft.reason}
                                          onChange={(e) => changeProblemField(r.key, { reason: e.target.value })}
                                          placeholder="Description (min 5 characters)"
                                          aria-label="Damage description"
                                          style={{ minHeight: 44, padding: 'var(--sp-sm)', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', resize: 'vertical' }}
                                        />
                                        <select
                                          value={draft.severity}
                                          onChange={(e) => changeProblemField(r.key, { severity: e.target.value })}
                                          aria-label="Severity"
                                          style={{ minHeight: 44, borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
                                        >
                                          <option value="">Severity…</option>
                                          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                        <Button icon="camera" onClick={() => changeProblemField(r.key, { evidence: draft.evidence + 1 })}>
                                          Add Evidence Photo ({draft.evidence})
                                        </Button>
                                        <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                                          Required before recording — Warehouse records the finding, never a cost (§8.3). The count is
                                          local to this session; capture and storage live in the Evidence Workspace.
                                        </p>
                                      </>
                                    )}
                                    <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                                      {PROBLEM_ROUTE[draft.type as Exclude<ProblemState, 'No Problems'>]}
                                      {' — the routing is where this finding goes in the workflow; no repair or case record is written from this screen yet, and the item is excluded from the reset dispatch.'}
                                    </p>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      <button type="button" onClick={() => cancelProblem(r.key)} style={{ minHeight: 44, padding: '0 12px', borderRadius: 'var(--r-xs)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!problemReady(draft)}
                                        onClick={() => confirmProblem(r.key)}
                                        style={{
                                          minHeight: 44, padding: '0 12px', borderRadius: 'var(--r-xs)', border: '1px solid transparent', fontSize: 'var(--t-meta)', fontWeight: 600, fontFamily: 'inherit',
                                          cursor: problemReady(draft) ? 'pointer' : 'not-allowed',
                                          background: problemReady(draft) ? 'var(--st-danger-fg)' : 'var(--card2)', color: problemReady(draft) ? 'var(--btn-danger-fg)' : 'var(--muted)',
                                        }}
                                      >
                                        Record &amp; Remove from Batch
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Spec 03 — one primary per workspace, and it is the
                          completion gate in the footer. This stays secondary. */}
                      <button
                        type="button"
                        disabled={markCleanReason !== null}
                        onClick={markCleanMoveToQc}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', minHeight: 44, marginTop: 10,
                          borderRadius: 'var(--r-btn)', fontSize: 'var(--t-ui)', fontWeight: 600, fontFamily: 'inherit',
                          cursor: markCleanReason === null ? 'pointer' : 'not-allowed',
                          ...(markCleanReason === null
                            ? { background: 'var(--btn-secondary-bg)', color: 'var(--text)', border: '1px solid var(--btn-secondary-border)' }
                            : { background: 'var(--card2)', color: 'var(--muted)', border: '1px solid var(--border)' }),
                        }}
                      >
                        <Icon name="checklist" size={15} />
                        Mark Clean &amp; Move to QC
                      </button>
                      {/* Law 12 — the reason is inline and persistent, never a
                          `title` tooltip and never a toast. */}
                      {markCleanReason && (
                        <p role="status" style={{ margin: '6px 0 0', fontSize: 'var(--t-meta)', color: 'var(--progress-text)', fontWeight: 600, lineHeight: 1.45 }}>
                          {markCleanReason}
                        </p>
                      )}
                    </>
                  )}
                </Card>

                {/* The completion gate checklist — every condition named, pass
                    or fail, inline in the rail. A blocked gate is never a toast
                    (Law 12); the reason stays on screen while the block lasts. */}
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
                    <p style={{ margin: '2px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                      Exceptions do not block completion — a recorded problem routed the item out of this queue.
                      Completing writes <span className="identifier">reset_completed_at</span> on {readyAssetIds.length} unit{readyAssetIds.length === 1 ? '' : 's'} and,
                      per §1.5, changes no booking status.
                    </p>
                  </div>
                </Card>
              </FloorAside>
            </div>

            {/* §9.3 — the selection bar shows only the count and Clear Selection. No second primary. */}
            {selected.size > 0 && (
              <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px' }}>
                <span className="figure" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 20, borderRadius: 'var(--r-badge)', background: 'var(--nav-active-bg)', color: 'var(--nav-active-accent)', fontSize: 'var(--t-meta)', fontWeight: 700 }}>
                  {selected.size}
                </span>
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>items selected</span>
                <button type="button" onClick={clearSelection} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--link)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--t-meta)' }}>
                  Clear Selection
                </button>
              </div>
            )}

            {/* §13 — metrics, reconciled against the same population they describe. */}
            <Card title="This Session's Reset Summary">
              <div style={{ display: 'grid', gridTemplateColumns: phone ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10 }}>
                {[
                  { l: 'Ready', v: counts.Ready, tone: 'var(--success-text)' },
                  { l: 'Remaining', v: remainingCount, tone: 'var(--progress-text)' },
                  { l: 'Pending QC', v: counts.QC, tone: 'var(--text)' },
                  { l: 'Exceptions', v: exceptionRows.length, tone: exceptionRows.length ? 'var(--danger-text)' : 'var(--text)' },
                ].map((s) => (
                  <div key={s.l}>
                    <div className="figure" style={{ fontSize: 'var(--t-h2)', fontWeight: 700, color: s.tone }}>{s.v}</div>
                    <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                Ready + Remaining + Exceptions = {counts.Ready + remainingCount + exceptionRows.length} of {rows.length} rows —
                same population, always reconciles. These figures are this session&apos;s, local until Complete Reset lands.
              </p>
            </Card>

            {/* footer — job-level completion. Ungated by money or any booking
                condition (§1.7). One EXIT and one primary, nothing else. */}
            <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', padding: '12px 14px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => navigate(`/rentals/${id}`)}
                style={{ minHeight: 44, padding: '0 14px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Back to Booking
              </button>
              <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                {`Reset job: ${jobState} — does not change ${runsAt} booking status.`}
                {' Nothing is saved until Complete Reset — ticks, QC and exceptions live in this session only.'}
              </span>
              {/* The disabled reason is inline below (Law 12) — never a `title`
                  tooltip, which is inert on touch and for keyboard users. */}
              <span style={{ marginLeft: 'auto' }}>
                <button
                  type="button"
                  disabled={!canComplete}
                  onClick={completeResetJob}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 44, padding: '0 16px', borderRadius: 'var(--r-btn)',
                    fontSize: 'var(--t-ui)', fontWeight: 600, fontFamily: 'inherit', cursor: canComplete ? 'pointer' : 'not-allowed',
                    ...(canComplete ? BLUE_PRIMARY : { background: 'var(--card2)', color: 'var(--muted)', border: '1px solid var(--border)' }),
                  }}
                >
                  <Icon name="checklist" size={15} />
                  {dispatching ? 'Recording…' : 'Complete Reset'}
                </button>
              </span>
            </div>
            {completeReason && (
              <p style={{ margin: '-4px 2px 0', textAlign: 'right', fontSize: 'var(--t-meta)', color: 'var(--progress-text)', fontWeight: 600 }}>{completeReason}</p>
            )}
            {/* Law 12 — inline and persistent, never a toast. This is what the
                operator sees instead of being navigated away from a reset that
                was never recorded. */}
            {dispatchError && <ErrorBanner title="The reset was not recorded" message={dispatchError} />}
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

/**
 * §10 — QC by someone other than the cleaner, by default. The name defaults to
 * the signed-in operator; typing the same name as the cleaner reveals the
 * audited self-QC reason, and `Pass` stays disabled until it is filled. (The
 * seed build's three-name `STAFF` dropdown made the self-check unreachable —
 * a real session's name was never in the list.)
 */
function QcRowControls({
  rec,
  by,
  reason,
  onByChange,
  onReasonChange,
  onPass,
  onFail,
}: {
  rec: RowRec
  by: string
  reason: string
  onByChange: (v: string) => void
  onReasonChange: (v: string) => void
  onPass: () => void
  onFail: () => void
}) {
  const selfCheck = by.trim() !== '' && by.trim() === rec.cleanedBy
  const blocked = by.trim() === '' || (selfCheck && reason.trim().length < 5)
  const failBlocked = reason.trim().length < 5
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
      <input
        value={by}
        onChange={(e) => onByChange(e.target.value)}
        placeholder="QC performed by…"
        aria-label="QC performed by"
        style={{ height: 24, padding: '0 6px', borderRadius: 'var(--r-xs)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
      />
      {/* RS-01 / RS-12 — `qc_by` is a users.id; there is no staff picker yet, so
          only the signed-in operator can be recorded. Said here, not discovered
          after dispatch. */}
      <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.3 }}>
        Only the signed-in operator is recorded as QC. A different name typed here stays on this screen and is not stored.
      </span>
      {selfCheck && (
        <input
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Self-QC reason, audited (min 5)"
          aria-label="Reason for self-performed QC"
          style={{ height: 24, padding: '0 6px', borderRadius: 'var(--r-xs)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
        />
      )}
      {/*
        The QC verdict. Two opposite outcomes, entered on a tablet by someone who
        has just put gloves down, so this pair gets the most careful treatment of
        any control on the floor screens.

        `--sp-sm` (8px) rather than `--sp-xs` (4px): the 44px `TouchTarget` hit
        areas below would otherwise overlap and the later button in the DOM would
        silently win the tap.

        The borders stay `--st-in-fg` / `--st-danger-fg` (both #ffffff). That
        reads wrong out of context, but it is correct HERE: when enabled these
        buttons carry a solid `--st-in-bg` / `--st-danger-bg` fill, so the white
        is on-fill ink doing its job. ⚠ In the DISABLED state the fill drops to
        `--card2` and both borders render white on grey — Pass and Fail then
        differ only by their word. The word is what Law 11 requires and it is
        there, so this is cosmetic rather than a safety defect, but it is a real
        inconsistency and it is NOT fixed here.
      */}
      <div style={{ display: 'flex', gap: 'var(--sp-sm)' }}>
        <button
          type="button"
          disabled={blocked}
          onClick={onPass}
          style={{ position: 'relative', height: 22, padding: '0 8px', borderRadius: 'var(--r-xs)', border: '1px solid var(--st-in-fg)', background: blocked ? 'var(--card2)' : 'var(--st-in-bg)', color: blocked ? 'var(--muted)' : 'var(--st-in-fg)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: blocked ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
        >
          <TouchTarget />
          Pass
        </button>
        <button
          type="button"
          disabled={failBlocked}
          onClick={onFail}
          style={{ position: 'relative', height: 22, padding: '0 8px', borderRadius: 'var(--r-xs)', border: '1px solid var(--st-danger-fg)', background: failBlocked ? 'var(--card2)' : 'var(--st-danger-bg)', color: failBlocked ? 'var(--muted)' : 'var(--st-danger-fg)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: failBlocked ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
        >
          <TouchTarget />
          Fail
        </button>
      </div>
      <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
        Failing returns the item to Waiting with a reason (§10)
      </span>
    </div>
  )
}
