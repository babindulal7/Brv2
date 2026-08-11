import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Icon from '../../../components/ui/Icon'
import { useViewport } from '../../../lib/device'
import { useNetwork } from '../../../lib/network'
import type { BookingStatus, JobName } from '../../../lib/workflow'
import {
  SEED_ITEMS,
  SHELL_STEPS,
  entryStepFor,
  stepDotState,
  stepWriteGate,
  packItem,
  lockPacking,
  correctPackedItem,
  receiveReturn,
  type OperationItem,
  type CorrectionEntry,
  type StepDotState,
} from '../../../data/operationsShell'
import PackingStep from './steps/PackingStep'
import HandoverStep from './steps/HandoverStep'
import ReturnStep from './steps/ReturnStep'
import ResetStep from './steps/ResetStep'

/**
 * Operations Popup Shell — spec v1.0, received 9 Aug (`PLAN.md §4.6`).
 *
 * Built on mock data by the user's own call — same contract as every other
 * screen this session (Phase 2's real data layer doesn't exist for anything
 * yet). Two deliberate departures from the spec's literal text, both logged
 * in `PLAN.md §4.6` rather than decided quietly:
 *
 *  - **4 steps, not 5.** `lib/workflow.ts` (Foundation v2.0 §1.5, already
 *    locked): "Reset absorbs Cleaning." The rail below is Packing/Handover/
 *    Return/Reset.
 *  - **Breakpoint at 1180, not the spec's 1024.** Law 14 already locks this
 *    app's only two breakpoints at 768/1180 ("Never orientation," and by
 *    extension never a third number). The spec's two-band request (desktop
 *    overlay vs. full-screen) maps onto this app's `desktop` band (≥1180)
 *    vs. `phone`+`tablet` combined (<1180), not a new 1024 line.
 *
 * Positioning (§3): rendered inline in the calling page's own tree inside a
 * `position: relative` wrapper, sized to that page's content column — never
 * a `document.body` portal. A portal covering the viewport is exactly what
 * "anchored to the content region, scrim never dims the nav" rules out; an
 * absolutely-positioned child of the content column achieves it for free,
 * without needing to know the sidebar's (collapsible) width.
 *
 * Revised after an adversarial review pass caught two things my own
 * click-driven browser testing missed by not simulating real per-keystroke
 * typing: (1) the keyboard handler excluded the scan field itself from
 * `inTextField`, so digits in a scanned/typed serial (every seeded serial
 * contains one) fired the 1-4 step-jump mid-keystroke; (2) the same
 * "refocus scan on any key" fallback fired on Tab, dragging focus back to
 * scan before the browser could compute where Tab should land — an
 * effective keyboard trap. Both are fixed below, along with the launcher's
 * progress subtitle (was reading the frozen `SEED_ITEMS` constant, never the
 * shell's live state) via `onProgressChange`.
 */

export interface OperationsShellProgress {
  step: JobName
  done: number
  total: number
}

export interface OperationsShellProps {
  bookingNo: string
  bookingStatus: BookingStatus
  isOpen: boolean
  onClose: () => void
  /** Lets the launcher button (outside this component) show live progress —
   *  this component's own state is otherwise not visible to its caller. */
  onProgressChange?: (progress: OperationsShellProgress) => void
}

const UNDO_WINDOW_SECONDS = 10 // operations.undo.window_seconds, §10 — no settings store to read yet
const MAX_UNDO_QUEUE = 3

export interface UndoAction {
  id: string
  label: string
  run: () => void
}

const DOT_META: Record<StepDotState, { icon: 'check' | 'timer' | 'close' | 'dot'; label: string }> = {
  done: { icon: 'check', label: 'done' },
  'in-progress': { icon: 'timer', label: 'in progress' },
  blocked: { icon: 'close', label: 'blocked' },
  'not-started': { icon: 'dot', label: 'not started' },
}

export default function OperationsShell({ bookingNo, bookingStatus, isOpen, onClose, onProgressChange }: OperationsShellProps) {
  const viewport = useViewport()
  const isOnline = useNetwork()
  const fullScreen = viewport !== 'desktop' // §3 — mapped onto this app's locked breakpoints, see file header

  const [step, setStep] = useState<JobName>(() => entryStepFor(bookingStatus) ?? 'Pack')
  const [items, setItems] = useState<OperationItem[]>(SEED_ITEMS)
  const [corrections, setCorrections] = useState<CorrectionEntry[]>([])
  // Lifted out of ResetStep — a local useState there was lost on every step
  // navigation, since panels are exclusively mounted (`{step === 'Reset' &&
  // ...}`) and unmount the moment you leave the tab. Lifting it here, beside
  // `items`/`corrections`, keeps it alive for the life of the session like
  // everything else does.
  const [resetDone, setResetDone] = useState<Set<string>>(new Set())
  const [queuedCount, setQueuedCount] = useState(0)
  const [undoQueue, setUndoQueue] = useState<UndoAction[]>([])
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const undoTimers = useRef<Map<string, number>>(new Map())

  const scanRef = useRef<HTMLInputElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)

  // §6.1 — reconnecting flushes the queue. There is no real server to sync
  // against (mock data), so this is a genuine, honest simulation: it clears
  // the counter and nothing more, disclosed rather than dressed up.
  useEffect(() => {
    if (isOnline && queuedCount > 0) {
      const t = window.setTimeout(() => setQueuedCount(0), 600)
      return () => window.clearTimeout(t)
    }
    return undefined
  }, [isOnline, queuedCount])

  function raiseUndo(action: Omit<UndoAction, 'id'>) {
    const id = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const entry: UndoAction = { ...action, id }
    // §8: "every destructive action is undo, not confirm" — a small queue
    // (capped, oldest drops first) rather than one slot, so scanning several
    // returns back-to-back doesn't silently discard an earlier action's
    // undo window before it expires.
    setUndoQueue((prev) => [...prev, entry].slice(-MAX_UNDO_QUEUE))
    const timer = window.setTimeout(() => {
      setUndoQueue((prev) => prev.filter((u) => u.id !== id))
      undoTimers.current.delete(id)
    }, UNDO_WINDOW_SECONDS * 1000)
    undoTimers.current.set(id, timer)
  }

  function resolveUndo(id: string) {
    const timer = undoTimers.current.get(id)
    if (timer) window.clearTimeout(timer)
    undoTimers.current.delete(id)
    setUndoQueue((prev) => prev.filter((u) => u.id !== id))
  }

  function noteWrite() {
    if (!isOnline) setQueuedCount((n) => n + 1)
  }

  useEffect(
    () => () => {
      undoTimers.current.forEach((t) => window.clearTimeout(t))
    },
    [],
  )

  // §8, Keyboard: 1–4 jump steps, / focuses scan, Esc closes (or closes just
  // the evidence slide-over, if that's open — never both at once).
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      // Fixed: the scan field is a text field like any other for the
      // purposes of this gate. It used to be excluded so that "any keystroke
      // goes to scan" could redirect into it — but that same exclusion meant
      // digits *typed into the already-focused scan field* fell through to
      // the 1-4 step-jump branch below instead of being treated as scan
      // input, corrupting the very serials (SN102, RS3-0091, ...) this field
      // exists to accept.
      const inTextField = Boolean(target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      if (e.key === 'Escape') {
        if (evidenceOpen) {
          setEvidenceOpen(false)
          return
        }
        onClose()
        return
      }
      if (inTextField) return
      if (e.key === '/') {
        e.preventDefault()
        scanRef.current?.focus()
        return
      }
      const n = Number(e.key)
      if (n >= 1 && n <= SHELL_STEPS.length) {
        setStep(SHELL_STEPS[n - 1]!.key)
        return
      }
      // §8 — "the scan field holds focus permanently. Any keystroke... goes
      // to it unless a text input is deliberately focused." Restricted to
      // single printable characters: `e.key.length === 1` excludes Tab,
      // Shift, arrow keys, etc. — the earlier version redirected on *every*
      // non-shortcut key, which stole focus back from Tab before the browser
      // could compute where it should land, an effective keyboard trap.
      if (e.key.length === 1 && document.activeElement !== scanRef.current) {
        scanRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose, evidenceOpen])

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const progressFor = (job: JobName): { done: number; total: number } => {
    if (job === 'Pack') return { done: items.filter((i) => i.packState !== 'Pending').length, total: items.length }
    if (job === 'Return') return { done: items.filter((i) => i.returnState !== 'Pending').length, total: items.length }
    if (job === 'Handover') {
      const packed = items.filter((i) => i.packState !== 'Pending').length
      return { done: items.some((i) => i.lockedAt) ? packed : 0, total: items.length }
    }
    // Reset's own progress is the checklist itself, not the return states
    // feeding it — the rail dot used to read `returnState === 'Returned'`,
    // which meant it could show "done" the instant Return finished, before a
    // single reset checkbox had actually been ticked.
    const returned = items.filter((i) => i.returnState === 'Returned')
    return { done: returned.filter((i) => resetDone.has(i.id)).length, total: returned.length || items.length }
  }

  // The launcher button outside this component previously read the frozen
  // SEED_ITEMS constant to show "Operations · Handover 3/8" — always 0/8,
  // since this component's own state never touched that module-level array.
  useEffect(() => {
    if (!isOpen) return
    const p = progressFor(step)
    onProgressChange?.({ step, done: p.done, total: p.total })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, step, items, resetDone])

  if (!isOpen) return null

  const gate = stepWriteGate(step, bookingStatus)

  const shellChrome: ReactNode = (
    <div
      ref={shellRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Operations — ${bookingNo}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: 'var(--card)',
        border: fullScreen ? 'none' : '1px solid var(--border)',
        borderRadius: fullScreen ? 0 : 'var(--r-card)',
        boxShadow: fullScreen ? 'none' : 'var(--shadow-modal)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {fullScreen && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close operations"
            style={{ border: 'none', background: 'transparent', color: 'var(--text)', cursor: 'pointer', display: 'grid', placeItems: 'center', width: 44, height: 44, marginLeft: -8 }}
          >
            <Icon name="chevron_left" size={22} />
          </button>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
            Operations <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· {bookingNo}</span>
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 'var(--t-th)', color: 'var(--muted)' }}>
            {SHELL_STEPS.find((s) => s.key === step)?.label} · {progressFor(step).done}/{progressFor(step).total}
          </p>
        </div>
        {!isOnline && (
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 9px', borderRadius: 'var(--r-badge)', background: 'var(--st-progress-bg)', color: 'var(--st-progress-fg)', fontSize: 'var(--t-th)', fontWeight: 600 }}
          >
            <Icon name="error" size={12} />
            Offline{queuedCount > 0 ? ` · ${queuedCount} queued` : ''}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close operations"
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--muted)',
            cursor: 'pointer',
            width: 44,
            height: 44,
            borderRadius: 'var(--r-sm)',
            display: fullScreen ? 'none' : 'grid',
            placeItems: 'center',
          }}
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      {/* Step rail */}
      <div
        role="tablist"
        aria-label="Operations steps"
        style={{
          display: 'flex',
          gap: 6,
          padding: fullScreen ? '8px 10px' : '10px 16px',
          borderBottom: '1px solid var(--border)',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        {SHELL_STEPS.map((s, i) => {
          const dot = stepDotState(s.key, bookingStatus, progressFor(s.key))
          const dotMeta = DOT_META[dot]
          const active = step === s.key
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              onClick={() => setStep(s.key)}
              aria-current={active ? 'step' : undefined}
              aria-selected={active}
              aria-label={`${s.label}, ${dotMeta.label}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-sm)',
                height: 48,
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: `1px solid ${active ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                background: active ? 'var(--nav-active-bg)' : 'transparent',
                color: active ? 'var(--nav-active-accent)' : 'var(--text)',
                fontWeight: active ? 700 : 500,
                fontSize: 'var(--t-meta)',
                fontFamily: 'inherit',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {/* "Never colour alone" (law 11) — the dot used to be a plain
                  coloured circle with nothing else distinguishing its 4
                  states. Now an icon (check/timer/×/dot) carries the state;
                  colour reinforces it rather than being the only signal. */}
              <Icon
                name={dotMeta.icon}
                size={11}
                aria-hidden
                style={{
                  flexShrink: 0,
                  color: dot === 'done' ? 'var(--success)' : dot === 'in-progress' ? 'var(--progress)' : dot === 'blocked' ? 'var(--danger)' : 'var(--disabled)',
                }}
              />
              <Icon name={s.icon} size={15} />
              {s.label}
              <span className="figure" style={{ fontSize: 'var(--t-th)', color: 'inherit', opacity: 0.75 }}>
                {i + 1}
              </span>
            </button>
          )
        })}
      </div>

      {/* Blocked-write banner — inline, never a toast (§4.1 / §8) */}
      {!gate.allowed && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', padding: '9px 16px', background: 'var(--st-neutral-bg)', color: 'var(--text2)', fontSize: 'var(--t-meta)', flexShrink: 0 }}>
          <Icon name="info" size={14} style={{ flexShrink: 0 }} />
          {gate.reason} You can still view this step.
        </div>
      )}

      {/* Step content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-lg)', position: 'relative' }}>
        {step === 'Pack' && (
          <PackingStep
            items={items}
            readOnly={!gate.allowed}
            scanRef={scanRef}
            onPack={(itemId, input) => {
              setItems((prev) => packItem(prev, itemId, { ...input, packedBy: 'Ramesh', packedAt: 'just now' }))
              noteWrite()
            }}
          />
        )}
        {step === 'Handover' && (
          <HandoverStep
            items={items}
            readOnly={!gate.allowed}
            evidenceOpen={evidenceOpen}
            onEvidenceOpenChange={setEvidenceOpen}
            onSign={() => {
              setItems((prev) => lockPacking(prev, 'just now (handover signature)'))
              noteWrite()
            }}
            onAttemptEditLocked={(itemId, newQty, reason) => {
              const res = correctPackedItem(items, corrections, itemId, newQty, reason, 'Ramesh', 'just now')
              setCorrections(res.corrections)
              noteWrite()
            }}
          />
        )}
        {step === 'Return' && (
          <ReturnStep
            items={items}
            corrections={corrections}
            readOnly={!gate.allowed}
            scanRef={scanRef}
            evidenceOpen={evidenceOpen}
            onEvidenceOpenChange={setEvidenceOpen}
            onReceive={(itemId, input) => {
              const before = items.find((i) => i.id === itemId)
              setItems((prev) => receiveReturn(prev, corrections, itemId, { ...input, returnedBy: 'Hari', returnedAt: 'just now' }))
              noteWrite()
              raiseUndo({
                label: `Marked ${before?.name} as ${input.condition === 'Damaged' ? 'damaged' : 'returned'}`,
                run: () =>
                  setItems((prev) =>
                    prev.map((i) => (i.id === itemId ? { ...i, returnState: 'Pending', qtyReturned: 0, returnCondition: undefined } : i)),
                  ),
              })
            }}
          />
        )}
        {step === 'Reset' && (
          <ResetStep
            items={items}
            readOnly={!gate.allowed}
            resetDone={resetDone}
            onToggleReset={(itemId) => {
              setResetDone((prev) => {
                const next = new Set(prev)
                if (next.has(itemId)) next.delete(itemId)
                else next.add(itemId)
                return next
              })
              noteWrite()
            }}
          />
        )}
      </div>

      {/* Undo queue — §8: "every destructive action is undo, not confirm." */}
      {undoQueue.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          {undoQueue.map((u) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-md)', padding: '10px 16px', background: 'var(--st-neutral-bg)' }}>
              <span style={{ flex: 1, fontSize: 'var(--t-meta)', color: 'var(--text)' }}>{u.label}</span>
              <button
                type="button"
                onClick={() => {
                  u.run()
                  resolveUndo(u.id)
                }}
                style={{ minHeight: 44, padding: '0 10px', border: 'none', background: 'transparent', color: 'var(--link)', fontWeight: 700, fontSize: 'var(--t-meta)', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Undo
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  if (fullScreen) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'var(--card)' }}>
        {shellChrome}
      </div>
    )
  }

  // §3 — anchored to the content region: position: absolute within the
  // caller's own position:relative wrapper, never a viewport-covering portal.
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        minHeight: '100%',
        zIndex: 40,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '24px 0',
      }}
    >
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.6)', borderRadius: 'var(--r-card)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* §3 — "~90% of the content area." Width is 90% of *this wrapper*,
          which is already bounded to the content column (not the viewport) —
          padding stays vertical-only so it doesn't double-discount the 90%. */}
      <div style={{ position: 'relative', width: '90%', maxWidth: 1200, height: '100%', minHeight: 520 }}>
        {shellChrome}
      </div>
    </div>
  )
}
