import { useState } from 'react'
import { Modal, Button } from '../../components/ui'
import { ErrorBanner } from '../../components/ui/StateViews'
import { Unavailable } from '../../components/ui/Unavailable'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'

/**
 * **Shift handover sheet** — an accountability record: it states who ended a
 * shift and who received it. Three of the things it stated were invented.
 *
 *  1. `userName = 'Ramesh'` and `userRole = 'Warehouse'` were DEFAULT PARAMETER
 *     values, and `Header` passes `userName={user?.name}`. A null session
 *     therefore substituted a literal person *invisibly* — nothing at the call
 *     site shows the substitution, which is what makes this shape worse than an
 *     explicit `??`. The identity now comes from `useAuth()` and nowhere else,
 *     and with no session the sheet REFUSES to render rather than naming
 *     someone. A degrading fallback would be no better: "shift ended by
 *     Unknown" still asserts that a shift was ended and attributed.
 *  2. The incoming-shift picker offered `Sita` and `Hari` as hardcoded
 *     `<option>`s, presented as the staff who could receive the handover. No
 *     query in `src/lib/queries/` reads `users` at all, so there is no roster to
 *     offer — a build gap, not a product decision. The control is `Unavailable`
 *     with that reason attached.
 *  3. The summary counters (14 packed · 11 returned · 3 jobs open) and the three
 *     open jobs (B-1043 · B-1051 · B-1060) were literals in this component,
 *     rendered as the signed-in operator's own shift. Nothing reads a shift, so
 *     the sheet no longer claims one.
 *
 * `handoverRental` in `src/actions/rentals/` is the equipment handover to a
 * client — a different verb. There is no shift-handover action anywhere, so
 * "Hand over & log out" could never write what its label announced; it renders
 * through `Unavailable`, and Skip logs out without claiming a handover.
 */

const NO_SHIFT_SOURCE =
  'This build does not record shifts, so what you packed, returned, or are leaving open cannot be shown here.'

const NO_ROSTER =
  'There is no staff list in this build — nothing reads the users table, so no colleague can be named here.'

const NO_HANDOVER_ACTION =
  'Recording a shift handover needs a wired action and this build has none. Skip logs you out without recording one.'

export default function HandoverSheet({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
  /**
   * Still accepted so `Header`'s existing call site typechecks, and ignored on
   * purpose — the signed-in session is the only identity this sheet will name.
   * @deprecated drop once `Header` stops passing it.
   */
  userName?: string | undefined
  /** @deprecated see `userName`. */
  userRole?: string | undefined
}) {
  const [note, setNote] = useState('')
  const navigate = useNavigate()
  /** The one identity this sheet may state. No fallback, not even a degrading one. */
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // No session, no sheet. Law 12 — the refusal is inline and persistent.
  if (!user) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Ending your shift"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" onClick={handleLogout}>
              Log out
            </Button>
          </>
        }
      >
        <ErrorBanner
          title="No signed-in session — this sheet cannot be filled in"
          message="A handover states who ended the shift and who received it, and nothing here knows who you are. Nothing has been recorded. Sign in again to end a shift on the record, or log out — logging out now hands over nothing."
        />
      </Modal>
    )
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Ending your shift — ${user.name}, ${user.role}`}
      footer={
        <>
          <Button variant="secondary" onClick={handleLogout}>
            Skip
          </Button>
          <Unavailable reason={NO_HANDOVER_ACTION}>
            <Button variant="primary" disabled>
              Hand over & log out
            </Button>
          </Unavailable>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xl)', paddingTop: 'var(--sp-sm)' }}>
        {/*
          Was: three counters (14 packed · 11 returned · 3 jobs open) and three
          hardcoded bookings under "Open jobs you are leaving". Every figure was
          a literal in this file, shown as the signed-in operator's own shift —
          a number nobody entered, attributed to a real person the moment the
          identity above became real.
        */}
        <div>
          <h4 style={{ margin: '0 0 6px', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Your shift so far
          </h4>
          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
            {NO_SHIFT_SOURCE}
          </p>
        </div>

        <div>
          <h4 style={{ margin: '0 0 4px', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Anything the next shift should know?
          </h4>
          {/* Nothing stores this note, and no button on this sheet can. Say so
              rather than let it be typed and silently dropped at log out. */}
          <p style={{ margin: '0 0 8px', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
            {NO_HANDOVER_ACTION} A note typed here is not kept.
          </p>
          <textarea
            value={note}
            aria-label="Optional notes for the next shift"
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional notes for the next shift..."
            style={{
              width: '100%',
              minHeight: 80,
              padding: '10px 12px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--text)',
              fontFamily: 'inherit',
              fontSize: 'var(--t-base)',
              resize: 'vertical',
            }}
          />
        </div>

        <div>
          <h4 style={{ margin: '0 0 8px', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Hand over to <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
          </h4>
          <Unavailable reason={NO_ROSTER} style={{ display: 'flex', width: '100%' }}>
            <button
              type="button"
              disabled
              style={{
                width: '100%',
                minHeight: 44,
                padding: '0 12px',
                textAlign: 'left',
                borderRadius: 'var(--r-btn)',
                border: '1px dashed var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--muted)',
                fontFamily: 'inherit',
                fontSize: 'var(--t-base)',
                cursor: 'not-allowed',
              }}
            >
              No staff list in this build — nobody can be named here
            </button>
          </Unavailable>
        </div>
      </div>
    </Modal>
  )
}
