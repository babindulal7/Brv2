import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'
import { Unavailable } from '../../components/ui/Unavailable'
import { JOBS, JOB_ORDER, type BookingStatus, type JobName } from '../../lib/workflow'
import { stepDotState, stepWriteGate, type StepDotState } from '../../data/operationsShell'
import { jobRoute } from '../../data/operations'

/**
 * **Operations launcher.**
 *
 * ⭐ RULED 12 Aug 2026 (`WIREFRAME_RULINGS_2026-08-12.md` §3, from spec 03
 * §3.2–§3.5): *operations are ROUTES, not a modal.* `/rentals/:br/packing`,
 * `…/handover`, `…/return`, `…/reset` are canonical — which is what
 * `App.tsx`'s own route-block comment has said since it was written ("§4.3 —
 * operations are full-screen routes, never modals") while this file did the
 * opposite.
 *
 * So this is no longer a container that mounts four workspace pages inside a
 * `role="dialog"`. It is a **launcher**: four rows that navigate to the four
 * routes, and nothing else. What it keeps is the part that was genuinely its
 * own — the step gating ported in on 11 Aug (`stepWriteGate` /
 * `stepDotState`), so a step that is not open yet is visible-but-unclickable
 * with the reason attached, rather than hidden or silently dead.
 *
 * ## What went with the modal
 *
 * - The `embedded` prop on `PackingWorkspace` / `HandoverWorkspace` /
 *   `ResetWorkspace`. It existed only so a page could suppress its own header
 *   when this shell drew one above it. There is no shell above them any more,
 *   so the prop is gone from all three rather than left as a parameter no
 *   caller passes.
 * - `ResetWorkspace`'s `readOnly` prop, for the same reason. The Closed-booking
 *   case it served is not lost: `ResetWorkspace` now asks `stepWriteGate`
 *   itself, which is the same canonical answer this file used to pass down.
 * - The `<main>` bounds measurement, the scrim, and the body scroll lock —
 *   all of which existed to position a full-height panel over the content
 *   region.
 *
 * ## Why a dialog at all, rather than a menu on the button
 *
 * Booking Workflow §4.2 requires disabled entries to stay **visible** with
 * their reason reachable by hover, focus *and* long-press. That is the
 * `Unavailable` pattern, which needs room for a reason line per row. A native
 * menu cannot carry it. The launcher is small, centred, and closes on Escape,
 * on backdrop click and on navigation.
 *
 * No query is added here (Law 2): booking status arrives as a prop, read from
 * the query `BookingDetail` already made.
 */

const STEP_LABEL: Record<JobName, string> = {
  Pack: 'Packing',
  Handover: 'Handover',
  Return: 'Return & Inspection',
  Reset: 'Reset',
}

const STEP_ICON: Record<JobName, IconName> = {
  Pack: 'box',
  Handover: 'truck',
  Return: 'return_arrow',
  Reset: 'refresh',
}

/**
 * Law 11 — never colour alone. Each dot state carries an icon and a word as
 * well as a tone, so the rail reads the same to a screen reader and in
 * greyscale.
 */
const DOT_META: Record<StepDotState, { icon: IconName; label: string; tone: string }> = {
  'not-started': { icon: 'dot', label: 'Not started', tone: 'var(--muted)' },
  'in-progress': { icon: 'refresh', label: 'In progress', tone: 'var(--progress-text)' },
  done: { icon: 'checklist', label: 'Done', tone: 'var(--success-text)' },
  blocked: { icon: 'lock', label: 'Not open yet', tone: 'var(--muted)' },
}

/**
 * The step a booking at this status is *at*. A lookup against the existing
 * `JOBS` table, not a new rule. `Closed` has no job of its own; Reset is the
 * last one that ran, so it is the sensible landing row — and `stepWriteGate`
 * independently reports it as read-only, which is what the row shows.
 */
function entryStepFor(status: BookingStatus): JobName {
  const found = JOB_ORDER.find((j) => JOBS[j].runsAt === status)
  if (found) return found
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
  const navigate = useNavigate()

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const entryStep = entryStepFor(bookingStatus)

  const open = (job: JobName) => {
    onClose()
    navigate(jobRoute(bookingNo, job))
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--sp-md)',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.6)' }} onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Operations — ${bookingNo}`}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 460,
          maxHeight: '100%',
          overflowY: 'auto',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-card)',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>
            Operations <span className="identifier" style={{ color: 'var(--muted)', fontWeight: 500 }}>· {bookingNo}</span>
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
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <p style={{ margin: 0, padding: '10px 16px 0', fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
          Each step is its own full-screen workspace. Opening one leaves this booking page.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', padding: 'var(--sp-md)' }}>
          {JOB_ORDER.map((job) => {
            /*
             * The canonical gate. `stepDotState` only reads `progress` on the
             * branch that distinguishes not-started / in-progress / done for a
             * step whose writes are ALLOWED — this launcher tracks no item
             * state, so a placeholder goes in and the blocked/done answer,
             * which does not read it, is what gets used.
             */
            const gate = stepWriteGate(job, bookingStatus)
            const dot = stepDotState(job, bookingStatus, { done: 0, total: 1 })
            const meta = DOT_META[dot]
            const blocked = dot === 'blocked'
            const isEntry = job === entryStep

            const row = (
              <button
                type="button"
                disabled={blocked}
                onClick={() => open(job)}
                aria-current={isEntry ? 'step' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-md)',
                  width: '100%',
                  minHeight: 44,
                  padding: '10px 12px',
                  textAlign: 'left',
                  borderRadius: 'var(--r-btn)',
                  border: `1px solid ${isEntry && !blocked ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                  background: isEntry && !blocked ? 'var(--nav-active-bg)' : 'var(--card2)',
                  color: blocked ? 'var(--muted)' : 'var(--text)',
                  fontFamily: 'inherit',
                  fontSize: 'var(--t-ui)',
                  fontWeight: 600,
                  cursor: blocked ? 'not-allowed' : 'pointer',
                  opacity: blocked ? 0.62 : 1,
                }}
              >
                <Icon name={STEP_ICON[job]} size={17} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  {STEP_LABEL[job]}
                  {!gate.allowed && gate.reason && (
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 500, color: 'var(--muted)', lineHeight: 1.4, marginTop: 2 }}>
                      {gate.reason}
                    </span>
                  )}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-xs)', color: meta.tone, fontSize: 'var(--t-meta)', fontWeight: 600, flexShrink: 0 }}>
                  <Icon name={meta.icon} size={13} />
                  {meta.label}
                </span>
              </button>
            )

            return (
              <div key={job}>
                {blocked ? <Unavailable reason={gate.reason ?? `${STEP_LABEL[job]} isn't open yet.`}>{row}</Unavailable> : row}
              </div>
            )
          })}
        </div>

        {/*
          Evidence is deliberately not one of the four rows — spec 03 line 4,
          "Evidence is a viewer, not a verb". It is still reachable, from here
          and from inside Packing and Return, because a photo review belongs
          next to the step that took the photos.
        */}
        <div style={{ padding: '0 var(--sp-md) var(--sp-md)' }}>
          <button
            type="button"
            onClick={() => {
              onClose()
              navigate(`/rentals/${bookingNo}/evidence`)
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--sp-sm)',
              minHeight: 44,
              padding: '0 12px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--btn-secondary-border)',
              background: 'var(--btn-secondary-bg)',
              color: 'var(--text)',
              fontFamily: 'inherit',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Icon name="eye" size={15} />
            Evidence — viewer, not a step
          </button>
        </div>
      </div>
    </div>
  )
}
