import { useEffect, useLayoutEffect, useState } from 'react'
import type { ReactNode } from 'react'
import Icon from '../../components/ui/Icon'
import { Unavailable } from '../../components/ui/Unavailable'
import { useViewport } from '../../lib/device'
import { JOBS, JOB_ORDER, type BookingStatus, type JobName } from '../../lib/workflow'
import { stepDotState, stepWriteGate } from '../../data/operationsShell'
import PackingWorkspace from '../rentals/PackingWorkspace'
import HandoverWorkspace from '../rentals/HandoverWorkspace'
import ReturnWorkspace from '../rentals/ReturnWorkspace'
import ResetWorkspace from '../rentals/ResetWorkspace'

/**
 * Operations popup shell — a container only. It mounts one of the four
 * existing, already-built operation workspace pages unchanged (each now
 * accepts `embedded` to suppress its own duplicate header) and adds nothing
 * of its own beyond a step rail and a close control. No item tables, gates,
 * evidence grids, signatures or checklists live here — those already live
 * inside the pages this mounts.
 *
 * Evidence is deliberately not a rail step: it stays reachable the way it
 * already is today, via the link each workspace page renders internally to
 * `/rentals/:id/evidence`, which is a real standalone route — clicking it
 * navigates away and closes this shell like any other route change.
 *
 * Each mounted page still gets its booking id the same way it always has —
 * `useParams()` inside the page itself — because this shell renders inline
 * inside `BookingDetail`'s own subtree of the already-matched
 * `/rentals/:bookingNo` route, so the param is already in scope. No id is
 * passed down, and no query is added here (Single Query Rule) — booking
 * status comes in as a prop, read from the query the Booking page already
 * made.
 */

const STEP_LABEL: Record<JobName, string> = {
  Pack: 'Packing',
  Handover: 'Handover',
  Return: 'Return & Inspection',
  Reset: 'Reset',
}

const STEP_ICON: Record<JobName, 'box' | 'truck' | 'return_arrow' | 'refresh'> = {
  Pack: 'box',
  Handover: 'truck',
  Return: 'return_arrow',
  Reset: 'refresh',
}

// `readOnly` is only meaningful to `ResetWorkspace` today (the Closed-booking
// case below) — the other three pages simply ignore an extra optional prop
// they don't declare, same as they already ignore any other prop absent from
// their own signature.
const STEP_COMPONENT: Record<JobName, (props: { embedded?: boolean; readOnly?: boolean }) => ReactNode> = {
  Pack: PackingWorkspace,
  Handover: HandoverWorkspace,
  Return: ReturnWorkspace,
  Reset: ResetWorkspace,
}

/** Entry step from booking status — a lookup against the existing `JOBS` table, not a new rule. */
function entryStepFor(status: BookingStatus): JobName {
  const found = JOB_ORDER.find((j) => JOBS[j].runsAt === status)
  if (found) return found
  // Closed has no job of its own; Reset opens read-only. Backed for real now:
  // `stepWriteGate('Reset', bookingStatus)` is false once the booking is
  // Closed (Reset's own `runsAt` is Returned, and Closed sorts after it), and
  // that result is what gets passed down as `ResetWorkspace`'s `readOnly`
  // prop below — not a promise left to the page's own (nonexistent) gates.
  if (status === 'Closed') return 'Reset'
  return 'Pack'
}

export interface OperationsShellProps {
  bookingNo: string
  bookingStatus: BookingStatus
  isOpen: boolean
  onClose: () => void
}

export default function OperationsShell({ bookingNo, bookingStatus, isOpen, onClose }: OperationsShellProps) {
  const viewport = useViewport()
  const fullScreen = viewport !== 'desktop' // Law 14 — width decides 768/1180, never orientation.

  const [step, setStep] = useState<JobName>(() => entryStepFor(bookingStatus))
  // §3's "anchored to the content region" needs the content column's own
  // live left-edge/width — the sidebar is collapsible, so no fixed number
  // stays correct. `<main>` is the one page-content landmark `Shell` (in
  // App.tsx) always renders, so it's measured directly rather than adding a
  // prop just to carry a number down from a layout component two levels up.
  const [contentBounds, setContentBounds] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    if (!isOpen || fullScreen) return
    const main = document.querySelector('main')
    if (!main) return
    const measure = () => {
      const r = main.getBoundingClientRect()
      setContentBounds({ left: r.left, width: r.width })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(main)
    return () => ro.disconnect()
  }, [isOpen, fullScreen])

  useEffect(() => {
    if (isOpen) setStep(entryStepFor(bookingStatus))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const StepComponent = STEP_COMPONENT[step]
  // Same canonical gate the tab rail already reads below — "always viewable,
  // write actions gate on status" (spec §4.1). A step can be the *current*
  // one (so its tab isn't `blocked`) and still have `allowed: false`, which
  // is exactly the Closed-booking/Reset case: `entryStepFor` opens Reset on
  // Closed, but Reset's own `runsAt` is Returned, so the gate reads false.
  const currentStepGate = stepWriteGate(step, bookingStatus)

  const shellChrome: ReactNode = (
    <div
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
        <h2 style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
          Operations <span style={{ color: 'var(--muted)', fontWeight: 500 }}>· {bookingNo}</span>
        </h2>
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
        {JOB_ORDER.map((job) => {
          const active = step === job
          // Canonical gate — `stepWriteGate`/`stepDotState` (data/operationsShell.ts)
          // both read `JOBS`/`BOOKING_STATUS` from lib/workflow.ts, not a new rule
          // invented here. Progress is irrelevant to the blocked/not-blocked call
          // (it only shades the *current* step's dot between not-started/in-progress/
          // done, which this container-only shell doesn't track item state for), so
          // a placeholder is passed — `stepDotState` never reads it on the branch
          // that decides `blocked`.
          const gate = stepWriteGate(job, bookingStatus)
          const blocked = stepDotState(job, bookingStatus, { done: 0, total: 1 }) === 'blocked'
          const tab = (
            <button
              type="button"
              role="tab"
              aria-selected={active}
              aria-current={active ? 'step' : undefined}
              disabled={blocked}
              onClick={() => setStep(job)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-sm)',
                height: 44,
                padding: '0 14px',
                borderRadius: 'var(--r-btn)',
                border: `1px solid ${active ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                background: active ? 'var(--nav-active-bg)' : 'transparent',
                color: active ? 'var(--nav-active-accent)' : blocked ? 'var(--muted)' : 'var(--text)',
                fontWeight: active ? 700 : 500,
                fontSize: 'var(--t-meta)',
                fontFamily: 'inherit',
                cursor: blocked ? 'not-allowed' : 'pointer',
                opacity: blocked ? 0.55 : 1,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <Icon name={STEP_ICON[job]} size={15} />
              {STEP_LABEL[job]}
            </button>
          )
          // Genuinely unclickable (native `disabled`), not just dimmed — matching
          // the `Unavailable` reason-on-hover/focus/long-press pattern this codebase
          // already uses for gated-but-visible controls (see `OperationsLauncher`
          // in BookingDetail.tsx). Reason text comes straight from `stepWriteGate`.
          return (
            <div key={job} style={{ display: 'contents' }}>
              {blocked ? <Unavailable reason={gate.reason ?? `${STEP_LABEL[job]} isn't open yet.`}>{tab}</Unavailable> : tab}
            </div>
          )
        })}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <StepComponent embedded readOnly={!currentStepGate.allowed} />
      </div>
    </div>
  )

  if (fullScreen) {
    return <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'var(--card)' }}>{shellChrome}</div>
  }

  // §3 — anchored to the content region, not viewport-centered. `position:
  // fixed` + `<main>`'s measured left/width (not `position: absolute` inside
  // the page's own flow) — BookingDetail's wrapper is exactly as tall as its
  // content, not the viewport, so `inset: 0` inside it stretched this panel
  // to the page's full scroll height instead of the visible screen. Fixed
  // positioning, sized from `<main>`'s own box, is viewport-correct
  // regardless of scroll position while still excluding the sidebar. Left
  // nav is outside `<main>`, so it stays visible and clickable; the scrim
  // below dims only this wrapper's own bounds.
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        bottom: 0,
        left: contentBounds?.left ?? 0,
        width: contentBounds?.width ?? '100%',
        zIndex: 40,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '24px 0',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.6)', borderRadius: 'var(--r-card)' }} onClick={onClose} aria-hidden="true" />
      <div style={{ position: 'relative', width: '90%', maxWidth: 1200, height: '100%', minHeight: 520 }}>{shellChrome}</div>
    </div>
  )
}
