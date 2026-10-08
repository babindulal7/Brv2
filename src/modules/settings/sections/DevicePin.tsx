import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { PinPad } from '../../../components/ui/PinPad'
import { ErrorBanner } from '../../../components/ui/StateViews'
import Icon from '../../../components/ui/Icon'
import { useAuth } from '../../../lib/auth'
import type { PinStatus } from '../../../lib/auth'

/**
 * **Settings ▸ System ▸ Security ▸ Device PIN.**
 *
 * The enrolment half of the staff PIN. The verification half is
 * `modules/auth/ScreenLock.tsx`; the rules are `verify_staff_pin` and
 * `set_staff_pin` in migration 0066.
 *
 * ## Why enrolment is two steps and the second one restarts on mismatch
 *
 * A PIN is invisible once typed. A single-field form that reports "incorrect
 * PIN" at the lock screen three days later has no way to tell the operator
 * whether they mistyped now or mistyped at enrolment. Confirming catches it at
 * the only moment it is cheap to catch.
 *
 * On mismatch this restarts at step one rather than clearing step two. "Those
 * did not match" against a value neither field still shows is unactionable —
 * the operator does not know which of the two was the typo, and re-entering
 * only the second half means guessing that the first was right.
 *
 * ## What this component does NOT validate
 *
 * The weak-PIN rules. Six identical digits, six sequential, and the last four
 * of the staff row's mobile are all rejected by `set_staff_pin`, and the
 * rejection sentence comes back from Postgres already written for an operator
 * to read. Restating them here would put the same rule in two places with two
 * wordings, and the browser copy would be the one that could be skipped — the
 * RPC is reachable with a fetch and no numpad.
 *
 * The rules ARE stated on screen before submit, as rules rather than as errors.
 * That is a different thing from enforcing them.
 */

const RULES = [
  'Six digits.',
  'Not six of the same digit, and not six in a row.',
  'Not the last four digits of your mobile number.',
]

export function DevicePinControl() {
  const { setStaffPin, staffPinStatus, revokeOwnStaffPin } = useAuth()

  const [status, setStatus] = useState<PinStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  // Enrolment is a two-step wizard held in one place so cancelling can reset
  // all of it at once — a half-entered credential must not survive a close.
  const [step, setStep] = useState<'enter' | 'confirm'>('enter')
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Settings is a tabbed page: switching tabs unmounts this mid-request. The
  // status read is the one call that starts without the operator asking, so it
  // is the one that can land after the component is gone.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /*
   * `refresh` reads the status function through a ref, and its dep array is
   * EMPTY. That is not a lint dodge — it is the fix for a render loop.
   *
   * The mount effect below depends on `refresh`. If `refresh` depended on
   * `staffPinStatus` instead, then any `useAuth()` whose members are not
   * referentially stable across renders would give `refresh` a new identity
   * every render, re-fire the effect, set state, and render again — forever.
   *
   * `AuthProvider` does memoise these with `useCallback`, so production is
   * stable. But the Settings test suite mocks `useAuth` as a fresh object
   * literal per call, which is a completely reasonable way to mock a context,
   * and that mock turned this component into an infinite loop that presented as
   * a 20-second test timeout rather than as an error. A component should not
   * depend on its context provider's memoisation strategy to terminate.
   */
  const statusFn = useRef(staffPinStatus)
  statusFn.current = staffPinStatus

  const refresh = useCallback(async () => {
    setLoading(true)
    const next = await statusFn.current()
    if (!mounted.current) return
    setStatus(next)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const reset = useCallback(() => {
    setStep('enter')
    setFirst('')
    setSecond('')
    setError(null)
    setBusy(false)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    reset()
  }, [reset])

  const onFirstComplete = useCallback((value: string) => {
    setFirst(value)
    setSecond('')
    setError(null)
    setStep('confirm')
  }, [])

  const onSecondComplete = useCallback(
    async (value: string) => {
      if (value !== first) {
        // Back to step one deliberately — see the header.
        setStep('enter')
        setFirst('')
        setSecond('')
        setError('Those two PINs did not match. Enter the PIN you want, twice.')
        return
      }

      setBusy(true)
      const { error: setError_ } = await setStaffPin(value)
      setBusy(false)

      if (setError_) {
        // The database's own sentence, verbatim.
        setStep('enter')
        setFirst('')
        setSecond('')
        setError(setError_)
        return
      }

      close()
      void refresh()
    },
    [first, setStaffPin, close, refresh],
  )

  const remove = useCallback(async () => {
    setBusy(true)
    const { error: revokeError } = await revokeOwnStaffPin()
    setBusy(false)
    if (revokeError) {
      setError(revokeError)
      return
    }
    void refresh()
  }, [revokeOwnStaffPin, refresh])

  const lockedUntil = status?.lockedUntil ? new Date(status.lockedUntil) : null
  const isLockedOut = Boolean(lockedUntil && lockedUntil.getTime() > Date.now())

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
      {loading ? (
        <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Checking…</span>
      ) : status?.hasPin ? (
        <>
          {/* Law 11 — glyph and word, never colour alone. */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--sp-xs)',
              fontSize: 'var(--t-th)',
              fontWeight: 700,
              /* --danger-text, not --st-danger-fg: this span carries no fill,
                 so it needs the text-safe red its own `else` branch already
                 uses. --st-danger-fg is --on-danger = #ffffff in both themes,
                 which put the locked-out warning as white on the card. */
              color: isLockedOut ? 'var(--danger-text)' : 'var(--success-text)',
            }}
          >
            <Icon name={isLockedOut ? 'lock' : 'check'} size={13} fill />
            {isLockedOut
              ? `Locked until ${lockedUntil?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'PIN active'}
          </span>
          <Button variant="secondary" onClick={() => setOpen(true)} disabled={busy}>
            Change
          </Button>
          <Button variant="ghost" onClick={remove} disabled={busy}>
            Remove
          </Button>
        </>
      ) : (
        <>
          <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>Not set</span>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Set a PIN
          </Button>
        </>
      )}

      <Modal
        isOpen={open}
        onClose={close}
        title={status?.hasPin ? 'Change your PIN' : 'Set a PIN'}
        subtitle={
          step === 'enter'
            ? 'This PIN re-opens a locked session on this account. It is not a password and cannot sign you in.'
            : 'Enter the same six digits again.'
        }
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
          {error && <ErrorBanner title="PIN not set" message={error} />}

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ maxWidth: 280, width: '100%' }}>
              <PinPad
                // Remounting between steps clears the pad's internal
                // fired-once guard, so the confirm step's onComplete fires even
                // when both PINs are identical strings.
                key={step}
                label={step === 'enter' ? 'Choose a six-digit PIN' : 'Confirm your PIN'}
                value={step === 'enter' ? first : second}
                onChange={step === 'enter' ? setFirst : setSecond}
                onComplete={step === 'enter' ? onFirstComplete : onSecondComplete}
                disabled={busy}
              />
            </div>
          </div>

          {step === 'enter' && (
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontSize: 'var(--t-th)',
                color: 'var(--text2)',
              }}
            >
              {RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </span>
  )
}
