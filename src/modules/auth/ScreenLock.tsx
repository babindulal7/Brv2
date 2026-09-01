import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../../components/ui/Icon'
import { PinPad } from '../../components/ui/PinPad'
import { ErrorBanner } from '../../components/ui/StateViews'
import { useAuth } from '../../lib/auth'
import type { PinVerdict } from '../../lib/auth'

/**
 * **The session lock.**
 *
 * Rewritten 24 Aug 2026. What was here before accepted **any six digits**:
 *
 * ```ts
 * if (newPin.length === 6) {
 *   // Mock unlock on any 6 digit pin
 *   setTimeout(() => onUnlock(), 200)
 * }
 * ```
 *
 * — and offered "Sign out as Ramesh", a name belonging to nobody, over a button
 * that set `window.location.href = '/login'` without signing out at all. So the
 * lock could be opened by a stranger typing 000000, and the escape hatch left
 * the session live and merely navigated away from it. Both are the shape
 * `SUCCESS_FABRICATION_REGISTER_2026-08-12.md` exists to catch.
 *
 * ## What this is, precisely
 *
 * Session RE-ENTRY. The session never ended: the JWT and refresh token are
 * still held, `AuthProvider` still has the user, and nothing was signed out.
 * This overlay is a curtain, and the PIN opens the curtain.
 *
 * It is emphatically NOT a sign-in. `verifyStaffPin` cannot mint a session —
 * see its comment in `lib/auth.tsx` and 0066's header for why a PIN that
 * *appeared* to sign someone in would rebuild the `VITE_DEV_AUTH_BYPASS`
 * outage: React user set, no JWT, every read denied by RLS, empty screens under
 * a header saying "Owner".
 *
 * ## Why it names who is signed in
 *
 * This runs on shared warehouse tablets. The person who walks up is very often
 * not the person who walked away, and every row written after an unlock carries
 * the unlocked session's identity as `created_by`. Without the name on screen,
 * B unlocks A's session with B's PIN — impossible, since the PIN is checked
 * against A's row — but more importantly B *tries*, fails five times, and locks
 * A's account out. Naming the session turns that into "not mine, sign out".
 */
export default function ScreenLock({ onUnlock }: { onUnlock: () => void }) {
  const { user, verifyStaffPin, logout } = useAuth()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [verdict, setVerdict] = useState<PinVerdict | null>(null)
  const [invalid, setInvalid] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const invalidTimer = useRef<number | null>(null)

  // Cleared on a TIMER, never on `animationend`. Under
  // `prefers-reduced-motion` the shake animation is suppressed globally
  // (theme.css) and that event never fires, which would leave the pad stuck in
  // its rejected state — the same trap the filter drawer documents.
  const flashInvalid = useCallback(() => {
    setInvalid(true)
    if (invalidTimer.current !== null) window.clearTimeout(invalidTimer.current)
    invalidTimer.current = window.setTimeout(() => setInvalid(false), 400)
  }, [])

  useEffect(() => () => {
    if (invalidTimer.current !== null) window.clearTimeout(invalidTimer.current)
  }, [])

  // Focus lands inside the overlay so the first Tab cannot reach the page
  // behind it, and so a screen reader announces the dialog rather than whatever
  // the operator was last on.
  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  /*
   * A minimal focus trap. Tab cycles within the overlay; nothing behind the
   * curtain is reachable.
   *
   * Escape is deliberately NOT bound. On every other dialog in the app Escape
   * dismisses, and muscle memory would make dismissing a lock screen the
   * fastest way to defeat it. The only ways out are the correct PIN and
   * signing out — both explicit.
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const root = containerRef.current
      if (!root) return

      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>('button:not([disabled])'),
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  const lockedUntil = verdict?.reason === 'locked' ? verdict.lockedUntil : null
  const isLockedOut = Boolean(lockedUntil && new Date(lockedUntil).getTime() > Date.now())
  // 'no_pin' means this identity never enrolled one. The honest response is to
  // refuse, not to accept anything — the old build's exact mistake.
  const noPin = verdict?.reason === 'no_pin'
  const unavailable = verdict?.reason === 'unavailable'

  const submit = useCallback(
    async (entered: string) => {
      if (busy) return
      setBusy(true)
      const result = await verifyStaffPin(entered)
      setBusy(false)
      setVerdict(result)

      if (result.ok) {
        onUnlock()
        return
      }

      setPin('')
      flashInvalid()

      /*
       * The fifth failure ends the session rather than merely blocking the pad.
       *
       * Leaving a locked-out session sitting on the device would leave a live
       * JWT behind a curtain that no longer has a key, for fifteen minutes, on
       * a tablet somebody is holding. Signing out is both safer and the honest
       * next step, since the only way back in is now the password.
       */
      if (result.reason === 'locked') logout()
    },
    [busy, verifyStaffPin, onUnlock, flashInvalid, logout],
  )

  const unlockTime = lockedUntil
    ? new Date(lockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Session locked"
      tabIndex={-1}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--bg)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--sp-lg)',
        outline: 'none',
        overflowY: 'auto',
      }}
    >
      <div style={{ maxWidth: 320, width: '100%', textAlign: 'center' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--st-neutral-bg)',
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <Icon name="lock" size={32} />
        </div>

        <h2 style={{ fontSize: 'clamp(20px, 2vw, 24px)', fontWeight: 600, margin: '0 0 8px', color: 'var(--text)' }}>
          Session Locked
        </h2>

        {/*
          The identity line. `user.name` is the empty string when the staff row
          carries no name — `loadProfile` guarantees that rather than inventing a
          placeholder — so this falls back to naming the state, never to a
          fabricated person. It must never read like a name that is not one.
        */}
        <p style={{ margin: '0 0 4px', color: 'var(--text)', fontSize: 'var(--t-meta)', fontWeight: 600 }}>
          {user?.name ? `Signed in as ${user.name}` : 'This session has no named staff row'}
        </p>
        <p style={{ margin: '0 0 28px', color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
          {isLockedOut
            ? 'Too many incorrect attempts.'
            : noPin
              ? 'No PIN is set for this account.'
              : 'Enter your PIN to resume this session'}
        </p>

        {(noPin || unavailable) && (
          <div style={{ margin: '0 0 24px', textAlign: 'left' }}>
            <ErrorBanner
              title={noPin ? 'No PIN is set' : 'Cannot check your PIN right now'}
              message={
                noPin
                  ? 'This account has no PIN. Set one in Settings ▸ System ▸ Security once you are back in. Sign out and use your password to continue.'
                  : (verdict?.message ??
                    'The PIN could not be verified. Sign out and use your password to continue.')
              }
            />
          </div>
        )}

        {isLockedOut ? (
          <p
            role="alert"
            style={{
              margin: '0 0 24px',
              padding: '13px 14px',
              borderRadius: 'var(--r-card)',
              background: 'var(--st-danger-bg)',
              color: 'var(--st-danger-fg)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              textAlign: 'left',
            }}
          >
            PIN locked until {unlockTime}. Sign in with your password.
          </p>
        ) : (
          <PinPad
            label="Enter your PIN to resume this session"
            value={pin}
            onChange={setPin}
            onComplete={submit}
            disabled={busy || noPin || unavailable}
            invalid={invalid}
          />
        )}

        {/* Attempts remaining, in words. Never a colour, never a shrinking bar.

            --danger-text, not --st-danger-fg: unlike the locked-out banner
            above, these two alerts carry NO fill of their own, and the fg half
            of a status pair is white ink meant for a solid red block. Bare on
            this overlay (--bg, #fafaf8 under the light default) it was white on
            near-white — the attempt counter was announced to screen readers but
            invisible to the operator holding the tablet. */}
        {verdict?.reason === 'incorrect' && typeof verdict.attemptsRemaining === 'number' && (
          <p role="alert" style={{ margin: '16px 0 0', fontSize: 'var(--t-meta)', color: 'var(--danger-text)', fontWeight: 600 }}>
            Incorrect PIN — {verdict.attemptsRemaining}{' '}
            {verdict.attemptsRemaining === 1 ? 'attempt' : 'attempts'} left
          </p>
        )}

        {verdict?.reason === 'inactive' && (
          <p role="alert" style={{ margin: '16px 0 0', fontSize: 'var(--t-meta)', color: 'var(--danger-text)', fontWeight: 600 }}>
            This staff account is no longer active. Sign out to continue.
          </p>
        )}

        {/*
          A real sign-out, not a navigation. The old build set
          `window.location.href = '/login'`, which left the session live — a
          shared tablet showing the login screen over a signed-in Owner.
        */}
        <button
          type="button"
          onClick={logout}
          style={{
            marginTop: 'var(--sp-3xl)',
            minHeight: 44,
            background: 'transparent',
            border: 'none',
            color: 'var(--danger)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Sign out instead
        </button>
      </div>
    </div>
  )
}
