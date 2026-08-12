import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, Button, cardStyle } from '../../components/ui/Page'
import { EmptyState, ErrorBanner } from '../../components/ui/StateViews'
import { STATUS } from '../../lib/status'
import type { StatusKey } from '../../lib/status'
import { JOBS, BOOKING_STATUS } from '../../lib/workflow'
import type { JobState } from '../../lib/workflow'
import { useViewport } from '../../lib/device'
import { useAuth } from '../../lib/auth'
import { stepWriteGate } from '../../data/operationsShell'
import { BOOKING } from '../../data/booking'
import { FloorAside, floorPlacements } from '../operations/FloorAside'
import { PACKAGE } from '../../data/packing'
import {
  UNITS,
  CATEGORIES,
  TOTAL_ITEMS,
  STAFF,
  QUEUE_FILTERS,
  SHARED_CLEAN_TASKS,
  DAMAGE_TYPES,
  SEVERITIES,
  PROBLEM_ROUTE,
  SEED_CLEANING,
  SEED_QC,
  SEED_READY,
  tasksFor,
  allTasksFor,
  isPriority,
  queueTimeTone,
  defaultQcBy,
} from '../../data/reset'
import type { Unit, QueueState, ProblemState } from '../../data/reset'
import { BookingNotLoaded } from '../operations/BookingNotLoaded'

/**
 * **Reset Workspace** — `04 Operations/Cleaning & Reset Workflow.md` v3.1
 * (Build Locked), built from the module's own §0 corrections table rather
 * than the reference render, exactly as `PackingWorkspace.tsx` was.
 *
 * ⚠ **Foundation §1.5 overrides the render and the module title alike.**
 * "Reset absorbs Cleaning. There are four operations, not five." One
 * workspace, no `Clean All` sub-page and no separate Cleaning tab beside a
 * Reset tab — the module's own §8 says the same: "One workspace, two modes."
 * The mode toggle below switches which half of a unit's checklist is on
 * display; it never switches screens.
 *
 * **This is the one workspace of the four that does not move the booking.**
 * `JOBS.Reset.sets` is `null` (`lib/workflow.ts` §1.5) — Reset runs at status
 * **Returned** and completing it sets nothing. §1.7: "Reset is deliberately
 * not a close gate." So unlike `PackingWorkspace`'s `Complete Packing`, the
 * primary button here only finalises the Reset **job state** (derived, per
 * §1.5, "never written onto the booking") — it does not call `canAdvance`,
 * does not touch `BookingStatus`, and is gated only by the job's own
 * checklist, never by money or by any other booking-level condition (§1.7).
 * The booking-status badge in the header is therefore the fixed label
 * `JOBS.Reset.runsAt` ("Returned"), not a value this screen can change.
 *
 * §0 corrections carried from the render:
 *  · Priority chip kept out of the state sum (§3.2) — see `data/reset.ts`.
 *  · One checklist per category, not one shared list for every category
 *    (§6.1) — a lens here is never asked to `Charge Batteries`.
 *  · `Mark Clean & Move to QC` is disabled at 0 qualifying items, and names
 *    the reason (§9.2), not enabled at `0 / 30` like the render.
 *  · One primary action, owned by the right panel — the selection bar at the
 *    bottom shows only the count and `Clear Selection` (§9.3).
 *  · The "Any Problems?" quad is **per item** (§7.1); each selected unit gets
 *    its own quad in the right panel instead of the render's single control
 *    for the whole batch.
 *  · `Next Priority Items` lists `Waiting` items only (§4.3) — an item
 *    already `Cleaning` cannot offer a `Start` no-op.
 *  · `Total Queue Time` becomes `Longest wait` (§13.2); the summary panel's
 *    two counts are derived from the same population so they always
 *    reconcile (§13.1).
 *  · QC's render colour was purple, which Foundation §4.2 bans outright ("the
 *    5-colour law"). Re-mapped onto the five approved tokens — see `TONE`.
 *
 * **No money, anywhere** (Foundation §8.3, §12 role table's "See cost" column
 * for Warehouse: "—"). `lib/money.ts` is not imported. The Damaged flow
 * records a description and a photo, never a cost.
 */

/** §13 sibling convention — the workspace primary is blue in both themes. */
const BLUE_PRIMARY = { background: 'var(--cat-1)', color: '#fff', border: '1px solid transparent' } as const

/**
 * §4.2's five tokens, mapped onto the four queue states. QC's render colour
 * was purple — banned outright ("purple, cyan, teal, indigo and violet are
 * gone from the token layer"). `progress` ("Yellow — … work in progress") is
 * the literal definition of `Cleaning`; `in` (soft green, "back in stock")
 * is `Ready`'s natural home.
 */
const TONE: Record<QueueState, StatusKey> = {
  Waiting: 'neutral',
  Cleaning: 'progress',
  QC: 'primary',
  Ready: 'in',
}

/**
 * Was `const CURRENT_USER = 'Ramesh Shrestha'`, stamped as `actor` on every
 * cleaning and QC record this screen creates (four call sites below).
 *
 * A reset record names who cleaned a unit and who QC'd it, and the QC gate
 * compares those two — `selfCheck` at the QC panel refuses a self-check by
 * testing `by === rec.actor`. With a module-level constant, EVERY operator was
 * that same name, so the self-check rule compared a literal against itself and
 * could neither pass nor fail meaningfully.
 *
 * There is no honest stand-in for the person who did the work, so there is none:
 * `actorName(user)` returns `null` with no session, and the callers refuse
 * rather than substituting.
 */
function actorName(user: { name: string } | null): string | null {
  const name = user?.name?.trim()
  return name ? name : null
}

interface LineRec {
  queueState: QueueState
  ticks: Set<string>
  problem: ProblemState
  actor?: string
  actedAt?: string
  qcBy?: string
  qcAt?: string
  qcSkipReason?: string
  qcFailReason?: string
  problemReason?: string
  damageType?: string
  damageSeverity?: string
}

interface ProblemDraft {
  type: ProblemState
  reason: string
  damageType: string
  severity: string
  evidence: number
}

function seedStateFor(u: Unit): QueueState {
  if (SEED_CLEANING.includes(u.id)) return 'Cleaning'
  if (SEED_QC.includes(u.id)) return 'QC'
  if (SEED_READY.includes(u.id)) return 'Ready'
  return 'Waiting'
}

function buildInitialLines(): Record<string, LineRec> {
  return Object.fromEntries(
    UNITS.map((u) => {
      const qs = seedStateFor(u)
      const full = allTasksFor(u)
      const ticks = new Set<string>(qs === 'Waiting' ? [] : qs === 'Cleaning' ? full.slice(0, 1) : full)
      const rec: LineRec = {
        queueState: qs,
        ticks,
        problem: 'No Problems',
        ...(qs !== 'Waiting' ? { actor: u.assignedTo, actedAt: '09:40 AM' } : {}),
        ...(qs === 'Ready' ? { qcBy: defaultQcBy(u.assignedTo), qcAt: '09:55 AM' } : {}),
      }
      return [u.id, rec]
    }),
  )
}

function fmtMinutes(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

/** §7.2 — required fields before a problem can be recorded and the item can leave the batch. */
function problemReady(draft: ProblemDraft): boolean {
  if (draft.type === 'Missing Item' || draft.type === 'Needs Repair') return draft.reason.trim().length >= 5
  if (draft.type === 'Damaged') return draft.damageType !== '' && draft.severity !== '' && draft.reason.trim().length >= 5 && draft.evidence > 0
  return false
}

/*
 * ⭐ RULED 12 Aug 2026 (Rulings §3): operations are ROUTES, so `embedded` and
 * `readOnly` are both gone — they existed only to serve the operations modal.
 *
 * `readOnly` is not lost with them. It carried one real behaviour: a Closed
 * booking opens Reset for reading and writes nothing. That answer came from
 * `stepWriteGate('Reset', bookingStatus)`, which this page can ask directly,
 * so it is now derived here instead of passed in — the same canonical gate,
 * one caller closer to the thing it gates.
 */
export default function ResetWorkspace() {
  const navigate = useNavigate()
  const { bookingNo } = useParams()
  const id = bookingNo ?? BOOKING.no
  /** The one identity this screen's dispatch may act as. No fallback. */
  const { user } = useAuth()
  /**
   * The name written into `actor` on a cleaning or QC record. `null` with no
   * session — the four handlers below refuse rather than stamping a literal.
   */
  const actor = actorName(user)
  const NO_ACTOR =
    'Nobody is signed in, so this cleaning work cannot be recorded against anyone. ' +
    'A reset names who cleaned the unit and who QC’d it, and the QC gate compares the two. Sign in and reopen this workspace.'
  /* Law 13/14 — width decides, at Foundation's locked 768 / 1180. */
  const viewport = useViewport()
  const desktop = viewport === 'desktop'
  const phone = viewport === 'phone'
  const place = floorPlacements(desktop, phone)
  /*
   * The Closed-booking read-only case the shell used to pass in as a prop.
   * `stepWriteGate` is the canonical answer and supplies the banner's wording.
   *
   * Only the *backward* half of the gate is enforced as read-only: a booking
   * that has moved past Reset's own stage can no longer be reset.
   * TODO(decision): the forward half — a booking that has not reached
   * `Returned` yet — is left writable, which is what this route has always
   * done. Enforcing it would lock the workspace on every booking before
   * return, and whether the floor may pre-stage a reset is a product call, not
   * something to settle while relocating a prop.
   */
  const resetGate = stepWriteGate('Reset', BOOKING.status)
  const readOnly = BOOKING_STATUS[BOOKING.status].order > BOOKING_STATUS[JOBS.Reset.runsAt].order

  const [lines, setLines] = useState<Record<string, LineRec>>(buildInitialLines)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(SEED_CLEANING))
  const [mode, setMode] = useState<'Clean' | 'Reset'>('Clean')
  const [filter, setFilter] = useState<(typeof QUEUE_FILTERS)[number]>('All')
  const [priorityOnly, setPriorityOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [note, setNote] = useState('')
  const [problemDraft, setProblemDraft] = useState<Record<string, ProblemDraft>>({})
  const [qcBy, setQcByDraft] = useState<Record<string, string>>({})
  const [qcReason, setQcReason] = useState<Record<string, string>>({})
  const [jobCompletedAt, setJobCompletedAt] = useState<string | null>(null)
  /**
   * Why a dispatch failure needs somewhere to be rendered.
   *
   * `completeReset` is a real write now, and its failure used to be reported
   * only by `console.error('reset failed:', err)` on a floating promise — while
   * `setJobCompletedAt('—')` ran unconditionally on the line below it. The header
   * then rendered "Reset job completed at —" and `canCompleteJob` went false, so
   * from the operator's seat the job was done and the button was spent, whether
   * or not a single `cleaning_queue_entries` row was touched. Today none ever is
   * (the empty `unitIds` list is refused by `validate`).
   *
   * Law 12 — the failure is inline and persistent, and the completion stamp is
   * set only on a resolved promise.
   */
  const [dispatchError, setDispatchError] = useState<string | null>(null)

  const set = (uid: string, patch: Partial<LineRec>) => setLines((p) => ({ ...p, [uid]: { ...(p[uid] as LineRec), ...patch } }))

  /* ── §3.1 / §3.2 — chip counts, Priority kept out of the sum ────────────── */
  const active = UNITS.filter((u) => (lines[u.id] as LineRec).problem === 'No Problems')
  const exceptions = UNITS.filter((u) => (lines[u.id] as LineRec).problem !== 'No Problems')
  const counts: Record<QueueState, number> = { Waiting: 0, Cleaning: 0, QC: 0, Ready: 0 }
  active.forEach((u) => { counts[(lines[u.id] as LineRec).queueState] += 1 })
  const priorityCount = UNITS.filter(isPriority).length

  /* §1.5 — Reset job state, derived from the queue, never hand-set and never written to the booking. */
  const untouched = counts.Cleaning + counts.QC + counts.Ready + exceptions.length === 0
  const finished = counts.Waiting + counts.Cleaning + counts.QC === 0
  const jobState: JobState = finished ? 'Complete' : untouched ? 'Not Started' : 'In Progress'
  const remainingCount = counts.Waiting + counts.Cleaning + counts.QC
  const completeReason = remainingCount > 0 ? `${remainingCount} item${remainingCount > 1 ? 's' : ''} not yet Ready` : readOnly ? 'This booking is closed — read only' : null
  const canCompleteJob = completeReason === null && jobCompletedAt === null

  /* §4.3 — Next Priority lists Waiting items only; a started item is not "next". */
  const nextPriority = useMemo(
    () =>
      UNITS.filter((u) => isPriority(u) && (lines[u.id] as LineRec).problem === 'No Problems' && (lines[u.id] as LineRec).queueState === 'Waiting')
        .sort((a, b) => b.waitingMinutes - a.waitingMinutes)
        .slice(0, 3),
    [lines],
  )

  /* §13.2 — one honest number instead of a sum of independent waits. */
  const longestWaitMinutes = Math.max(
    0,
    ...UNITS.filter((u) => (lines[u.id] as LineRec).problem === 'No Problems' && (lines[u.id] as LineRec).queueState !== 'Ready').map((u) => u.waitingMinutes),
  )

  /* §13.1 — both figures read the same population, so they always reconcile. */
  const completedToday = counts.Ready
  const remainingToday = counts.Waiting + counts.Cleaning + counts.QC

  const visible = useMemo(
    () =>
      UNITS.filter((u) => {
        const rec = lines[u.id] as LineRec
        if (priorityOnly && !isPriority(u)) return false
        if (filter !== 'All' && (rec.problem !== 'No Problems' || rec.queueState !== filter)) return false
        if (query && !`${u.name} ${u.serial}`.toLowerCase().includes(query.toLowerCase())) return false
        return true
      }),
    [lines, filter, priorityOnly, query],
  )

  const selUnits = UNITS.filter((u) => selected.has(u.id))
  const overallDone = selUnits.reduce((s, u) => s + (lines[u.id] as LineRec).ticks.size, 0)
  const overallTotal = selUnits.reduce((s, u) => s + allTasksFor(u).length, 0)
  const overallPct = overallTotal ? Math.round((overallDone / overallTotal) * 100) : 0

  const selCategoryBreakdown = CATEGORIES.filter((c) => selUnits.some((u) => u.category === c.name)).map((c) => {
    const units = selUnits.filter((u) => u.category === c.name)
    const done = units.reduce((s, u) => s + (lines[u.id] as LineRec).ticks.size, 0)
    const total = units.reduce((s, u) => s + allTasksFor(u).length, 0)
    return { name: c.name, count: units.length, done, total }
  })

  const eligibleUnits = selUnits.filter((u) => {
    const rec = lines[u.id] as LineRec
    const total = allTasksFor(u).length
    return rec.problem === 'No Problems' && total > 0 && rec.ticks.size === total
  })
  const markCleanReason = readOnly ? 'This booking is closed — read only' : eligibleUnits.length > 0 ? null : 'No item has a completed checklist'

  /* ── selection & row actions ─────────────────────────────────────────── */
  const toggleSelect = (uid: string) => {
    if (readOnly) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }
  const selectAllVisible = () => {
    if (readOnly) return
    setSelected(new Set(visible.filter((u) => (lines[u.id] as LineRec).problem === 'No Problems').map((u) => u.id)))
  }
  const clearSelection = () => setSelected(new Set())

  const start = (uid: string) => {
    if (readOnly) return
    const rec = lines[uid] as LineRec
    // An existing `actor` is a real prior worker from the seeded queue; only a
    // NEW attribution needs a session.
    const attributed = rec.actor ?? actor
    if (!attributed) {
      setDispatchError(NO_ACTOR)
      return
    }
    setDispatchError(null)
    set(uid, { queueState: 'Cleaning', actor: attributed, actedAt: '—' })
    setSelected((prev) => new Set(prev).add(uid))
  }

  /* ── checklist ticking — shared tasks cascade to every selected item ────── */
  const toggleShared = (task: string) => {
    if (readOnly) return
    // Ticking a task attributes the cleaning to whoever is doing it.
    if (!actor && selUnits.some((u) => !(lines[u.id] as LineRec).actor)) {
      setDispatchError(NO_ACTOR)
      return
    }
    setDispatchError(null)
    const allDone = selUnits.every((u) => (lines[u.id] as LineRec).ticks.has(task))
    setLines((prev) => {
      const next = { ...prev }
      selUnits.forEach((u) => {
        const rec = next[u.id] as LineRec
        const attributed = rec.actor ?? actor
        // Unreachable — the guard above returns when any selected unit would
        // need an attribution there is no session to supply. Kept so the
        // invariant is enforced here too, not just asserted upstream.
        if (!attributed) return
        const ticks = new Set(rec.ticks)
        if (allDone) ticks.delete(task)
        else ticks.add(task)
        next[u.id] = { ...rec, ticks, queueState: rec.queueState === 'Waiting' && ticks.size > 0 ? 'Cleaning' : rec.queueState, actor: attributed }
      })
      return next
    })
  }
  const toggleUnitTask = (uid: string, task: string) => {
    if (readOnly) return
    const rec = lines[uid] as LineRec
    const attributed = rec.actor ?? actor
    if (!attributed) {
      setDispatchError(NO_ACTOR)
      return
    }
    setDispatchError(null)
    const ticks = new Set(rec.ticks)
    if (ticks.has(task)) ticks.delete(task)
    else ticks.add(task)
    set(uid, { ticks, queueState: rec.queueState === 'Waiting' && ticks.size > 0 ? 'Cleaning' : rec.queueState, actor: attributed })
  }

  const markCleanMoveToQc = () => {
    if (readOnly) return
    if (!actor && eligibleUnits.some((u) => !(lines[u.id] as LineRec).actor)) {
      setDispatchError(NO_ACTOR)
      return
    }
    setDispatchError(null)
    setLines((prev) => {
      const next = { ...prev }
      eligibleUnits.forEach((u) => {
        const rec = next[u.id] as LineRec
        const attributed = rec.actor ?? actor
        // Unreachable — guarded above. See `toggleShared`.
        if (!attributed) return
        next[u.id] = { ...rec, queueState: 'QC', actor: attributed, actedAt: rec.actedAt ?? '—' }
      })
      return next
    })
  }

  /* ── §7.1 — "Any Problems?", per item ────────────────────────────────── */
  const pickProblem = (uid: string, type: ProblemState) => {
    if (readOnly) return
    setProblemDraft((prev) => ({
      ...prev,
      [uid]: { type, reason: prev[uid]?.reason ?? '', damageType: prev[uid]?.damageType ?? '', severity: prev[uid]?.severity ?? '', evidence: prev[uid]?.evidence ?? 0 },
    }))
  }
  const changeProblemField = (uid: string, patch: Partial<Omit<ProblemDraft, 'type'>>) => {
    if (readOnly) return
    setProblemDraft((prev) => {
      const cur = prev[uid]
      if (!cur) return prev
      return { ...prev, [uid]: { ...cur, ...patch } }
    })
  }
  const confirmProblem = (uid: string) => {
    if (readOnly) return
    const draft = problemDraft[uid]
    if (!draft || !problemReady(draft)) return
    set(uid, { problem: draft.type, problemReason: draft.reason, damageType: draft.damageType, damageSeverity: draft.severity })
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(uid)
      return next
    })
    setProblemDraft((prev) => {
      const next = { ...prev }
      delete next[uid]
      return next
    })
  }
  const cancelProblem = (uid: string) =>
    setProblemDraft((prev) => {
      const next = { ...prev }
      delete next[uid]
      return next
    })
  const undoProblem = (uid: string) => {
    if (readOnly) return
    set(uid, { problem: 'No Problems' })
  }

  /* ── §10 — QC, performed by someone other than the cleaner by default ───── */
  const passQc = (uid: string) => {
    if (readOnly) return
    const rec = lines[uid] as LineRec
    const by = qcBy[uid] ?? defaultQcBy(rec.actor ?? '')
    const reason = qcReason[uid] ?? ''
    const selfCheck = by === rec.actor
    if (selfCheck && reason.trim().length < 5) return
    set(uid, { queueState: 'Ready', qcBy: by, qcAt: '—', ...(selfCheck ? { qcSkipReason: reason } : {}) })
  }
  const failQc = (uid: string) => {
    if (readOnly) return
    const reason = qcReason[uid] ?? ''
    if (reason.trim().length < 5) return
    set(uid, { queueState: 'Waiting', qcFailReason: reason })
  }

  const jobsReset = JOBS.Reset

  /*
   * Spec 03 Notes — "Routes are parameterised — these must work for any BR#,
   * not one seeded booking." This workspace's items come from a single seeded
   * booking, so any OTHER booking number gets the honest not-loaded state
   * rather than that booking's gear wearing this number (Rulings §8). Placed
   * after every hook, so the hook order is identical on both branches.
   */
  if (bookingNo !== undefined && bookingNo !== BOOKING.no) {
    return <BookingNotLoaded bookingNo={bookingNo} job="Reset" seededBookingNo={BOOKING.no} />
  }

  // Floor scale (DEVICES.md item 3) is applied automatically by route in App.tsx's Shell, not here.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      {/* Closed bookings — the route still opens so the queue stays viewable
          (§4.1 "every step is always viewable"), but every write/checkbox/save control below
          is disabled. Icon + text, never colour alone (Law 11). Inline and persistent,
          never a toast (Law 12). */}
      {readOnly && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', padding: '10px 14px', borderRadius: 'var(--r-btn)', background: 'var(--st-neutral-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600 }}>
          <Icon name="lock" size={14} style={{ flexShrink: 0, color: 'var(--muted)' }} />
          {resetGate.reason ?? 'This booking is closed — read only.'}
        </div>
      )}
      {/* ── header — booking status is fixed at Returned; only the job state moves.
           Rulings §4: no `←`; the shell breadcrumb is the upward affordance. ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-lg)', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <h1 style={{ margin: 0, fontSize: 'var(--t-h1)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.015em' }}>
              Reset Workspace
            </h1>
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 'var(--r-badge)',
                background: STATUS.in.bg, color: STATUS.in.fg, fontSize: 'var(--t-meta)', fontWeight: 700,
              }}
              title={`Reset runs at status ${jobsReset.runsAt} and, per §1.5, does not change it`}
            >
              {jobsReset.runsAt}
            </span>
          </div>
          <p style={{ margin: '5px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            <Link to={`/rentals/${id}`} style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'none' }} className="identifier">
              {id}
            </Link>
            {' · '}
            {PACKAGE.name} · {BOOKING.client}
          </p>
        </div>

        <div style={{ minWidth: 240, flex: 1 }}>
          <div style={{ display: 'flex', gap: 10, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            <span>Reset Progress</span>
            <span className="figure" style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text)' }}>
              {counts.Ready} / {TOTAL_ITEMS} Ready
            </span>
          </div>
          <div aria-hidden style={{ height: 8, borderRadius: 'var(--r-badge)', background: 'var(--card2)', marginTop: 6, overflow: 'hidden' }}>
            <div style={{ width: '100%', height: '100%', background: 'var(--success)', borderRadius: 'var(--r-badge)', transform: `scaleX(${counts.Ready / TOTAL_ITEMS})`, transformOrigin: 'left', transition: 'transform var(--dur) ease' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 'var(--t-meta)', color: remainingCount ? 'var(--progress-text)' : 'var(--success-text)', fontWeight: 600 }}>
            <Icon name={remainingCount ? 'alert_triangle' : 'checklist'} size={12} />
            {remainingCount ? `${remainingCount} item${remainingCount > 1 ? 's' : ''} still in the queue` : 'All items Ready'}
          </div>
        </div>
      </div>

      {/* §4 booking summary strip, same shape as the sibling workspaces. */}
      <div style={{ ...cardStyle, display: 'flex', gap: 0, flexWrap: 'wrap', overflow: 'hidden' }}>
        {[
          { l: 'Client', v: BOOKING.client, big: true },
          { l: 'Booking Status', v: jobsReset.runsAt, big: true },
          { l: 'Reset job', v: jobState },
          { l: 'Items in queue', v: String(TOTAL_ITEMS) },
          { l: 'Exceptions', v: String(exceptions.length), tone: exceptions.length ? 'var(--danger-text)' : undefined },
          { l: 'Longest wait', v: fmtMinutes(longestWaitMinutes) },
          { l: 'Mode', v: mode },
        ].map((f) => (
          <div key={f.l} style={{ padding: '11px 14px', borderRight: '1px solid var(--border)', minWidth: 0, flex: '1 1 auto' }}>
            <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{f.l}</div>
            <div style={{ fontSize: f.big ? 'var(--t-h3)' : 'var(--t-body)', fontWeight: f.big ? 700 : 600, color: f.tone ?? 'var(--text)', marginTop: 3, whiteSpace: 'nowrap' }}>
              {f.v}
            </div>
          </div>
        ))}
      </div>

      {/* §3.2 — chip tiles. Priority is styled apart and does not enter the state sum. */}
      <div style={{ display: 'grid', gridTemplateColumns: phone ? 'repeat(2, minmax(0,1fr))' : 'repeat(5, minmax(0,1fr))', gap: 'var(--sp-md)' }}>
        {([
          { key: 'priority', label: 'PRIORITY', sub: 'Older than 4 hrs or urgent', value: priorityCount, icon: 'flag' as const, tone: 'danger' as StatusKey },
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

      {/* filters — Priority is a separate flag toggle, never a sixth state chip (§3.2). */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Scan barcode / search equipment…"
          aria-label="Search the reset queue"
          style={{ flex: 1, minWidth: 200, height: 32, padding: '0 10px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', outline: 'none' }}
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
        <button
          type="button"
          onClick={() => setPriorityOnly((p) => !p)}
          aria-pressed={priorityOnly}
          title="Priority is a flag, not a queue state — filters on top of whichever state chip is active"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, height: 28, padding: '0 10px', borderRadius: 'var(--r-badge)',
            border: `1px solid ${priorityOnly ? 'var(--st-danger-fg)' : 'var(--border)'}`,
            background: priorityOnly ? STATUS.danger.bg : 'transparent', color: priorityOnly ? STATUS.danger.fg : 'var(--text2)',
            fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <Icon name="flag" size={12} />
          Priority {priorityCount}
        </button>
      </div>

      {/* §3.5 draws Reset as one column at desktop AND tablet and a single stack
          at phone. The categories rail and the batch panel reflow rather than
          collapse below 1180 (Rulings §7), same primitive the sibling
          workspaces use. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: desktop ? 'auto minmax(0,1fr) auto' : phone ? '1fr' : 'minmax(0,1fr) 320px',
          gap: 'var(--sp-md)',
          alignItems: 'start',
        }}
      >
        {/* ── left — categories, derived counts ──────────────────────────── */}
        <FloorAside collapsible={desktop} side="left" width={220} label="Categories" style={place.tree}>
        <Card title="Categories">
          {CATEGORIES.map((c) => {
            const units = UNITS.filter((u) => u.category === c.name)
            const ready = units.filter((u) => (lines[u.id] as LineRec).queueState === 'Ready' && (lines[u.id] as LineRec).problem === 'No Problems').length
            return (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', padding: '6px 0' }}>
                <Icon name={ready === c.count ? 'checklist' : 'box'} size={13} style={{ color: ready === c.count ? 'var(--success-text)' : 'var(--muted)', flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                <span className="figure" style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{ready}/{c.count}</span>
              </div>
            )
          })}
          <p style={{ margin: '9px 0 0', paddingTop: 9, borderTop: '1px solid var(--border)', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
            Category counts are derived from the queue and always sum to {TOTAL_ITEMS}.
          </p>
        </Card>
        </FloorAside>

        {/* ── centre — the queue ──────────────────────────────────────────── */}
        <div style={{ minWidth: 0, ...place.list }}>
        <Card
          title="Reset Queue"
          bodyStyle={{ padding: 0 }}
          action={<Button icon="checklist" onClick={selectAllVisible} disabled={readOnly}>Select All Visible</Button>}
        >
          {phone ? (
            /*
              Shell rule — "Tables become card rows below 768." Eight columns
              at 860px hid the serial, the queue state and the row's one action
              behind a horizontal scrollbar on the floor's own device. One card
              per unit, carrying the same select box and the same single
              primary action the row had.
            */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', padding: 'var(--sp-sm)' }}>
              {visible.map((u) => {
                const rec = lines[u.id] as LineRec
                const isException = rec.problem !== 'No Problems'
                const tone = isException ? STATUS.danger : STATUS[TONE[rec.queueState]]
                const timeTone = STATUS[queueTimeTone(u.waitingMinutes)]
                return (
                  <article key={u.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44 }}>
                      <input
                        type="checkbox"
                        checked={selected.has(u.id)}
                        disabled={isException || readOnly}
                        aria-label={`Select ${u.name}`}
                        onChange={() => toggleSelect(u.id)}
                        style={{ width: 22, height: 22, marginTop: 2, flexShrink: 0 }}
                      />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{u.name}</span>
                          {u.required && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', height: 15, padding: '0 5px', borderRadius: 4, background: 'var(--st-primary-bg)', color: 'var(--st-primary-fg)', fontSize: 'var(--t-meta)', fontWeight: 700 }}>
                              Required
                            </span>
                          )}
                          {isPriority(u) && <Icon name="flag" size={11} style={{ color: 'var(--st-danger-fg)' }} label="Priority" />}
                          <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 'var(--r-badge)', background: tone.bg, color: tone.fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                            {isException ? rec.problem : rec.queueState}
                          </span>
                        </span>
                        <Link to={`/inventory/${u.serial}`} className="identifier" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)', textDecoration: 'none', marginTop: 2 }}>
                          {u.serial}
                        </Link>
                      </span>
                    </label>

                    {isException && (
                      <span style={{ fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>
                        {rec.problem} — {PROBLEM_ROUTE[rec.problem as Exclude<ProblemState, 'No Problems'>]}
                      </span>
                    )}

                    <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                      {u.category} · {rec.actor ?? u.assignedTo} ·{' '}
                      <span className="figure" style={{ color: timeTone.fg, fontWeight: 600 }}>{fmtMinutes(u.waitingMinutes)}</span>
                    </span>

                    <div>
                      {isException ? (
                        <RowAction label="Undo" onClick={() => undoProblem(u.id)} disabled={readOnly} />
                      ) : rec.queueState === 'Waiting' ? (
                        <RowAction label="Start" onClick={() => start(u.id)} disabled={readOnly} />
                      ) : rec.queueState === 'QC' ? (
                        <QcRowControls
                          unit={u}
                          rec={rec}
                          by={qcBy[u.id] ?? defaultQcBy(rec.actor ?? '')}
                          reason={qcReason[u.id] ?? ''}
                          readOnly={readOnly}
                          onByChange={(v) => setQcByDraft((pv) => ({ ...pv, [u.id]: v }))}
                          onReasonChange={(v) => setQcReason((pv) => ({ ...pv, [u.id]: v }))}
                          onPass={() => passQc(u.id)}
                          onFail={() => failQc(u.id)}
                        />
                      ) : (
                        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                          {rec.queueState === 'Ready' ? `QC by ${rec.qcBy ?? '—'}` : `${rec.ticks.size}/${allTasksFor(u).length} ticked`}
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
                  onAction={() => { setFilter('All'); setPriorityOnly(false); setQuery('') }}
                />
              )}
            </div>
          ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead>
                <tr style={{ background: 'var(--th-bg)' }}>
                  {['', 'Equipment', 'Serial', 'Category', 'Status', 'Assigned To', 'Queue Time', 'Actions'].map((h, i) => (
                    <th key={h || i} style={{ textAlign: 'left', padding: '8px 9px', fontSize: 'var(--t-th)', fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => {
                  const rec = lines[u.id] as LineRec
                  const isException = rec.problem !== 'No Problems'
                  const tone = isException ? STATUS.danger : STATUS[TONE[rec.queueState]]
                  const timeTone = STATUS[queueTimeTone(u.waitingMinutes)]
                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 9px', width: 26 }}>
                        <input
                          type="checkbox"
                          checked={selected.has(u.id)}
                          disabled={isException || readOnly}
                          aria-label={`Select ${u.name}`}
                          onChange={() => toggleSelect(u.id)}
                        />
                      </td>
                      <td style={{ padding: '8px 9px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{u.name}</span>
                          {u.required && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', height: 15, padding: '0 5px', borderRadius: 4, background: 'var(--st-primary-bg)', color: 'var(--st-primary-fg)', fontSize: 'var(--t-meta)', fontWeight: 700 }}>
                              Required
                            </span>
                          )}
                          {isPriority(u) && <Icon name="flag" size={11} style={{ color: 'var(--st-danger-fg)' }} label="Priority" />}
                        </span>
                        {isException && (
                          <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--danger-text)', marginTop: 2 }}>
                            {rec.problem} — {PROBLEM_ROUTE[rec.problem as Exclude<ProblemState, 'No Problems'>]}
                          </span>
                        )}
                      </td>
                      <td className="identifier" style={{ padding: '8px 9px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                        <Link to={`/inventory/${u.serial}`} style={{ color: 'inherit', textDecoration: 'none' }}>{u.serial}</Link>
                      </td>
                      <td style={{ padding: '8px 9px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{u.category}</td>
                      <td style={{ padding: '8px 9px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 'var(--r-badge)', background: tone.bg, color: tone.fg, fontSize: 'var(--t-meta)', fontWeight: 600 }}>
                          {isException ? rec.problem : rec.queueState}
                        </span>
                      </td>
                      <td style={{ padding: '8px 9px', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{rec.actor ?? u.assignedTo}</td>
                      <td className="figure" style={{ padding: '8px 9px', fontSize: 'var(--t-meta)', color: timeTone.fg, fontWeight: 600 }}>{fmtMinutes(u.waitingMinutes)}</td>
                      <td style={{ padding: '8px 9px', minWidth: 190 }}>
                        {isException ? (
                          <RowAction label="Undo" onClick={() => undoProblem(u.id)} disabled={readOnly} />
                        ) : rec.queueState === 'Waiting' ? (
                          <RowAction label="Start" onClick={() => start(u.id)} disabled={readOnly} />
                        ) : rec.queueState === 'QC' ? (
                          <QcRowControls
                            unit={u}
                            rec={rec}
                            by={qcBy[u.id] ?? defaultQcBy(rec.actor ?? '')}
                            reason={qcReason[u.id] ?? ''}
                            readOnly={readOnly}
                            onByChange={(v) => setQcByDraft((p) => ({ ...p, [u.id]: v }))}
                            onReasonChange={(v) => setQcReason((p) => ({ ...p, [u.id]: v }))}
                            onPass={() => passQc(u.id)}
                            onFail={() => failQc(u.id)}
                          />
                        ) : (
                          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                            {rec.queueState === 'Ready' ? `QC by ${rec.qcBy ?? '—'}` : `${rec.ticks.size}/${allTasksFor(u).length} ticked`}
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
                        onAction={() => { setFilter('All'); setPriorityOnly(false); setQuery('') }}
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

        {/* ── right — the batch action panel ─────────────────────────────── */}
        <FloorAside collapsible={desktop} side="right" width={320} label="Reset selected items" style={place.rail}>
        <Card title={`Reset Selected Items (${selected.size})`} action={selected.size > 0 ? <button type="button" onClick={clearSelection} style={{ border: 'none', background: 'transparent', color: 'var(--link)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--t-meta)' }}>Clear</button> : undefined}>
          {selUnits.length === 0 ? (
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

              {selCategoryBreakdown.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 'var(--sp-sm)', marginTop: 11 }}>
                  {selCategoryBreakdown.map((c) => (
                    <div key={c.name} style={{ ...cardStyle, padding: '8px 10px' }}>
                      <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{c.name} × {c.count}</div>
                      <div className="figure" style={{ fontSize: 'var(--t-body)', fontWeight: 700, color: 'var(--text)' }}>{c.done} / {c.total}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* §8 — one workspace, two modes. Display filter only; §9.1's gate always reads both. */}
              <div style={{ display: 'flex', gap: 6, marginTop: 11 }}>
                {(['Clean', 'Reset'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    style={{
                      flex: 1, height: 30, borderRadius: 'var(--r-btn)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${mode === m ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                      background: mode === m ? 'var(--nav-active-bg)' : 'transparent', color: mode === m ? 'var(--nav-active-accent)' : 'var(--text2)',
                    }}
                  >
                    {m} Mode
                  </button>
                ))}
                {/* Display-only filter (§8) — left enabled even read-only, it changes nothing about the booking. */}
              </div>
              <p style={{ margin: '5px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                {mode === 'Clean' ? 'Physical cleaning — bodies, elements, screens, ports, cases.' : 'Configuration — format cards, reset settings, timecode, presets, firmware.'}
              </p>

              {mode === 'Clean' && (
                <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                    APPLIES TO ALL {selUnits.length} SELECTED
                  </div>
                  {SHARED_CLEAN_TASKS.map((task) => {
                    const doneCount = selUnits.filter((u) => (lines[u.id] as LineRec).ticks.has(task)).length
                    const allDone = doneCount === selUnits.length
                    return (
                      <label key={task} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', fontSize: 'var(--t-meta)', color: 'var(--text)', cursor: readOnly ? 'default' : 'pointer' }}>
                        <input type="checkbox" checked={allDone} disabled={readOnly} onChange={() => toggleShared(task)} />
                        <span style={{ flex: 1 }}>{task}</span>
                        <span className="figure" style={{ color: 'var(--muted)' }}>{doneCount}/{selUnits.length}</span>
                      </label>
                    )
                  })}
                </div>
              )}

              <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
                {selUnits.map((u) => {
                  const rec = lines[u.id] as LineRec
                  const full = allTasksFor(u)
                  const shown = tasksFor(u, mode).filter((t) => mode === 'Reset' || !(SHARED_CLEAN_TASKS as readonly string[]).includes(t))
                  const draft = problemDraft[u.id]
                  return (
                    <div key={u.id} style={{ paddingBottom: 12, borderBottom: '1px dashed var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 'var(--t-meta)', fontWeight: 700, color: 'var(--text)' }}>
                        {u.category} — {u.name}
                        <span className="identifier" style={{ fontWeight: 400, color: 'var(--muted)' }}>
                          <Link to={`/inventory/${u.serial}`} style={{ color: 'inherit', textDecoration: 'none' }}>{u.serial}</Link>
                        </span>
                        <span className="figure" style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{rec.ticks.size}/{full.length}</span>
                      </div>
                      {shown.length === 0 ? (
                        <p style={{ margin: '4px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>No {mode.toLowerCase()} tasks for this item.</p>
                      ) : (
                        shown.map((task) => (
                          <label key={task} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', fontSize: 'var(--t-meta)', color: 'var(--text)', cursor: readOnly ? 'default' : 'pointer' }}>
                            <input type="checkbox" checked={rec.ticks.has(task)} disabled={readOnly} onChange={() => toggleUnitTask(u.id, task)} />
                            {task}
                          </label>
                        ))
                      )}

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
                                disabled={readOnly}
                                onClick={() => pickProblem(u.id, q)}
                                style={{
                                  // Law 15 — a floor workspace is the coarse-pointer case
                                  // `lib/device.ts` was written for; these were 26px.
                                  minHeight: 44, padding: '0 10px', borderRadius: 'var(--r-xs)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: readOnly ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                                  border: `1px solid ${picked ? (q === 'No Problems' ? 'var(--st-in-fg)' : 'var(--st-danger-fg)') : 'var(--border)'}`,
                                  background: picked ? (q === 'No Problems' ? 'var(--st-in-bg)' : 'var(--st-danger-bg)') : 'transparent',
                                  color: picked ? (q === 'No Problems' ? 'var(--st-in-fg)' : 'var(--st-danger-fg)') : 'var(--text2)',
                                  opacity: readOnly ? 0.6 : 1,
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
                                onChange={(e) => changeProblemField(u.id, { reason: e.target.value })}
                                placeholder="Reason (min 5 characters)"
                                aria-label={`Reason ${u.name} is ${draft.type}`}
                                style={{ height: 28, padding: '0 8px', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', outline: 'none' }}
                              />
                            )}
                            {draft.type === 'Damaged' && (
                              <>
                                <select
                                  value={draft.damageType}
                                  onChange={(e) => changeProblemField(u.id, { damageType: e.target.value })}
                                  aria-label="Damage type"
                                  style={{ height: 28, borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
                                >
                                  <option value="">Damage type…</option>
                                  {DAMAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <textarea
                                  value={draft.reason}
                                  onChange={(e) => changeProblemField(u.id, { reason: e.target.value })}
                                  placeholder="Description (min 5 characters)"
                                  aria-label="Damage description"
                                  style={{ minHeight: 44, padding: 'var(--sp-sm)', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', resize: 'vertical' }}
                                />
                                <select
                                  value={draft.severity}
                                  onChange={(e) => changeProblemField(u.id, { severity: e.target.value })}
                                  aria-label="Severity"
                                  style={{ height: 28, borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
                                >
                                  <option value="">Severity…</option>
                                  {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <Button icon="camera" onClick={() => changeProblemField(u.id, { evidence: draft.evidence + 1 })}>
                                  Add Evidence Photo ({draft.evidence})
                                </Button>
                                <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
                                  Required before Complete — Warehouse records the finding, never a cost (§8.3).
                                </p>
                              </>
                            )}
                            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{PROBLEM_ROUTE[draft.type as Exclude<ProblemState, 'No Problems'>]}</p>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button type="button" onClick={() => cancelProblem(u.id)} style={{ minHeight: 44, padding: '0 12px', borderRadius: 'var(--r-xs)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={!problemReady(draft)}
                                onClick={() => confirmProblem(u.id)}
                                style={{
                                  minHeight: 44, padding: '0 12px', borderRadius: 'var(--r-xs)', border: '1px solid transparent', fontSize: 'var(--t-meta)', fontWeight: 600, fontFamily: 'inherit',
                                  cursor: problemReady(draft) ? 'pointer' : 'not-allowed',
                                  background: problemReady(draft) ? 'var(--st-danger-fg)' : 'var(--card2)', color: problemReady(draft) ? '#fff' : 'var(--muted)',
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

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={readOnly}
                placeholder="Notes (optional)"
                aria-label="Batch notes"
                style={{ width: '100%', minHeight: 44, marginTop: 4, padding: 'var(--sp-sm)', borderRadius: 'var(--r-input)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit', resize: 'vertical' }}
              />

              {/*
                ⭐ FIXED 12 Aug 2026 — this page shipped TWO blue primaries:
                this one and `Complete Reset` in the footer. Spec 03's closing
                notes allow exactly one per workspace, **and it is the
                completion gate**, so this batch action is now a secondary.

                Nothing else about it changes: it is still the batch panel's
                own action, still disabled with its reason named (§9.2), and
                `Complete Reset` is still the one filled button on the page.
              */}
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
              {/* Law 12 — the reason is inline and persistent, never a `title`
                  tooltip (inert on touch and for keyboard users) and never a toast. */}
              {markCleanReason && (
                <p role="status" style={{ margin: '6px 0 0', fontSize: 'var(--t-meta)', color: 'var(--progress-text)', fontWeight: 600, lineHeight: 1.45 }}>
                  {markCleanReason}
                </p>
              )}
            </>
          )}
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

      {/* §13 — metrics, reconciled against the same population they describe.
          Below 768 they stack rather than squeeze into two columns (Law 14). */}
      <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : '1fr 1fr', gap: 'var(--sp-md)' }}>
        <Card title="Today's Reset Summary">
          <div style={{ display: 'grid', gridTemplateColumns: phone ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10 }}>
            {[
              { l: 'Completed today', v: completedToday, tone: 'var(--success-text)' },
              { l: 'Remaining', v: remainingToday, tone: 'var(--progress-text)' },
              { l: 'Pending QC', v: counts.QC, tone: 'var(--text)' },
              { l: 'Exceptions', v: exceptions.length, tone: exceptions.length ? 'var(--danger-text)' : 'var(--text)' },
            ].map((s) => (
              <div key={s.l}>
                <div className="figure" style={{ fontSize: 'var(--t-h2)', fontWeight: 700, color: s.tone }}>{s.v}</div>
                <div style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{s.l}</div>
              </div>
            ))}
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
            Completed + Remaining + Exceptions = {completedToday + remainingToday + exceptions.length} of {TOTAL_ITEMS} — same population, always reconciles.
          </p>
        </Card>

        <Card title="Next Priority Items">
          {nextPriority.length === 0 ? (
            <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              {priorityCount > 0 ? 'All priority items are already in progress.' : 'No priority items in this queue.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
              {nextPriority.map((u, i) => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', fontSize: 'var(--t-meta)' }}>
                  <Icon name="flag" size={12} style={{ color: 'var(--st-danger-fg)' }} />
                  <span className="figure" style={{ color: 'var(--muted)' }}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</span>
                  <span className="figure" style={{ color: STATUS[queueTimeTone(u.waitingMinutes)].fg }}>{fmtMinutes(u.waitingMinutes)}</span>
                  <RowAction label="Start" onClick={() => start(u.id)} disabled={readOnly} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* footer — job-level completion. Ungated by money or any booking condition (§1.7). */}
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', padding: '12px 14px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => navigate(`/rentals/${id}`)}
          style={{ height: 34, padding: '0 14px', borderRadius: 'var(--r-btn)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Back to Booking
        </button>
        <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          {jobCompletedAt ? `Reset job completed at ${jobCompletedAt}` : `Reset job: ${jobState} — does not change ${jobsReset.runsAt} booking status`}
        </span>
        <span style={{ marginLeft: 'auto' }} title={completeReason ?? undefined}>
          <button
            type="button"
            disabled={!canCompleteJob}
            onClick={() => {
              if (!canCompleteJob) return
              // The identity is the signed-in one or there is no dispatch. The
              // `{ userId: 'USR-001', role: 'Manager' }` this replaces stamped a
              // made-up operator on every reset — and on a table whose own
              // comment (0003:906) is that WHO did the work is the point.
              if (!user) {
                setDispatchError('You are not signed in, so this reset cannot be recorded against anyone. Nothing was written.')
                return
              }
              setDispatchError(null)
              // `unitIds` is deliberately empty: this workspace's item ids come
              // from `data/reset`'s hardcoded UNITS, not from
              // `cleaning_queue_entries.unit_id`, so there is nothing true to
              // send and `completeReset`'s own `validate` refuses it. Reset is
              // recorded per item (0003:899); a booking id alone cannot say
              // which items were reset.
              // ⚠ `setJobCompletedAt` is INSIDE `.then`. It used to sit after this
              // block, firing synchronously on every press, so the header claimed
              // the reset job was complete while the write was still in flight and,
              // today, always failing.
              import('../../actions/rentals/index')
                .then(m => m.completeReset({ id: id!, unitIds: [] }, { userId: user.id, role: user.role }))
                .then(() => setJobCompletedAt('—'))
                .catch((err) => {
                  console.error('reset failed:', err);
                  setDispatchError(err instanceof Error ? err.message : String(err));
                });
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 16px', borderRadius: 'var(--r-btn)',
              fontSize: 'var(--t-ui)', fontWeight: 600, fontFamily: 'inherit', cursor: canCompleteJob ? 'pointer' : 'not-allowed',
              ...(canCompleteJob ? BLUE_PRIMARY : { background: 'var(--card2)', color: 'var(--muted)', border: '1px solid var(--border)' }),
            }}
          >
            <Icon name="checklist" size={15} />
            Complete Reset
          </button>
        </span>
      </div>
      {completeReason && !jobCompletedAt && (
        <p style={{ margin: '-4px 2px 0', textAlign: 'right', fontSize: 'var(--t-meta)', color: 'var(--progress-text)', fontWeight: 600 }}>{completeReason}</p>
      )}
      {/* Law 12 — inline and persistent, never a toast. It replaces a completion
          stamp the operator used to get whether or not anything was written. */}
      {dispatchError && <ErrorBanner title="The reset was not recorded" message={dispatchError} />}
    </div>
  )
}

function RowAction({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 22, padding: '0 7px', borderRadius: 'var(--r-xs)', border: '1px solid var(--border)',
        background: 'var(--card2)', color: disabled ? 'var(--muted)' : 'var(--text2)',
        fontSize: 'var(--t-meta)', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  )
}

/**
 * §10 — QC by someone other than the cleaner, by default. Choosing the same
 * person reveals the audited reason a self-check requires; `Pass` stays
 * disabled until it is filled.
 */
function QcRowControls({
  rec,
  by,
  reason,
  onByChange,
  onReasonChange,
  onPass,
  onFail,
  readOnly = false,
}: {
  unit: Unit
  rec: LineRec
  by: string
  reason: string
  onByChange: (v: string) => void
  onReasonChange: (v: string) => void
  onPass: () => void
  onFail: () => void
  readOnly?: boolean
}) {
  const selfCheck = by === rec.actor
  const blocked = readOnly || (selfCheck && reason.trim().length < 5)
  const failBlocked = readOnly || reason.trim().length < 5
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
      <select
        value={by}
        onChange={(e) => onByChange(e.target.value)}
        disabled={readOnly}
        aria-label="QC performed by"
        style={{ height: 24, borderRadius: 'var(--r-xs)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
      >
        {STAFF.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      {selfCheck && (
        <input
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          disabled={readOnly}
          placeholder="Self-QC reason, audited (min 5)"
          aria-label="Reason for self-performed QC"
          style={{ height: 24, padding: '0 6px', borderRadius: 'var(--r-xs)', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 'var(--t-meta)', fontFamily: 'inherit' }}
        />
      )}
      <div style={{ display: 'flex', gap: 'var(--sp-xs)' }}>
        <button
          type="button"
          disabled={blocked}
          onClick={onPass}
          style={{ height: 22, padding: '0 8px', borderRadius: 'var(--r-xs)', border: '1px solid var(--st-in-fg)', background: blocked ? 'var(--card2)' : 'var(--st-in-bg)', color: blocked ? 'var(--muted)' : 'var(--st-in-fg)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: blocked ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
        >
          Pass
        </button>
        <button
          type="button"
          disabled={failBlocked}
          onClick={onFail}
          title="Failing returns the item to Waiting with a reason (§10)"
          style={{ height: 22, padding: '0 8px', borderRadius: 'var(--r-xs)', border: '1px solid var(--st-danger-fg)', background: failBlocked ? 'var(--card2)' : 'var(--st-danger-bg)', color: failBlocked ? 'var(--muted)' : 'var(--st-danger-fg)', fontSize: 'var(--t-meta)', fontWeight: 600, cursor: failBlocked ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
        >
          Fail
        </button>
      </div>
    </div>
  )
}
