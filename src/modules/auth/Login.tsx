import React, { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Button, Input } from '../../components/ui'
import { AuthCard } from './AuthCard'
import { Unavailable } from '../../components/ui/Unavailable'
import { ErrorBanner } from '../../components/ui/StateViews'
import { useAuth } from '../../lib/auth'
import { IS_MOCK } from '../../lib/supabase'
import { MOCK_LOGINS } from '../../lib/mock/client'

/**
 * **Staff sign-in.**
 *
 * Rewritten 11 Aug 2026. The previous build was a numeric PIN pad whose submit
 * handler was `navigate('/today')` under a `// Mock login success` comment —
 * any six digits, or none, signed anyone in as Owner. That is the whole reason
 * `Shell`'s `if (!user)` guard never fired.
 *
 * This form authenticates against Supabase Auth for real. The role that governs
 * every capability check is then read from `users.primary_role` by
 * `AuthProvider` — the same row migration 0041's request hook feeds to every RLS
 * policy, so the UI and the database agree by construction.
 *
 * ## 24 Aug 2026 — two of the three PIN rulings are now made
 *
 * This header used to say PIN sign-in needed rulings "this project has not
 * made: where a PIN is stored and how it maps to a Supabase identity, which SMS
 * gateway carries the OTP, and whether a shared floor tablet signs in as the
 * device or as the person."
 *
 * Storage and identity: decided. `staff_auth_pins` holds a bcrypt hash keyed by
 * `users.id`, which is `auth.users.id` (0041's contract), and 0066 is the
 * migration.
 *
 * Device or person: decided — **the person**. The PIN travels with the staff
 * row, so it survives a tablet swap. The compensating control for a shared
 * device is that the lock screen names whose session it is holding, so the
 * wrong operator is told to sign out rather than locking a colleague's account
 * out with five wrong guesses.
 *
 * What that bought is a real lock screen, NOT a sign-in. A PIN re-opens a
 * session that already holds a JWT; it cannot create one, so this screen is
 * unchanged where it matters and `LoginFooter` below explains the rest.
 *
 * **Still not built:** OTP (no SMS gateway ruling) and PIN-as-primary sign-in
 * (needs a server-side verifier holding the service key). Both stay
 * surfaced-as-unavailable rather than faked. See PLAN.md §4.
 */
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)

    if (!email.trim() || !password) {
      setError('Enter your work email and password.')
      return
    }

    setBusy(true)
    const { error: signInError } = await signIn(email.trim(), password)
    setBusy(false)

    if (signInError) {
      // §12 — errors are inline and persistent. Never a toast.
      setError(signInError)
      return
    }

    // Return the user to wherever the guard intercepted them, not always /today.
    const from = (location.state as { from?: string } | null)?.from
    navigate(from && from !== '/login' ? from : '/today', { replace: true })
  }

  return (
    /*
     * `AuthCard` rather than the inline copy this screen carried since 11 Aug.
     *
     * The duplication was byte-for-byte — same `minHeight: '100vh'` wrapper,
     * same `maxWidth: 420` / `padding: '40px 32px'` / `gap: 28`, same heading
     * pair — and `AuthCard` was extracted FROM it on 15 Aug precisely so the
     * three auth screens could not drift apart on padding. `ForgotPassword` and
     * `ResetPassword` consumed it; the screen it was copied from did not, which
     * left the drift live in the one place it was created to prevent.
     */
    <AuthCard
      title="Welcome to Babin Rentals"
      subtitle="Sign in with your work email to continue."
      footer={<LoginFooter />}
    >
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-lg)' }}>
          <div style={{ textAlign: 'left' }}>
            <label
              htmlFor="login-email"
              style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}
            >
              Work Email
            </label>
            <Input
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@babinrentals.com"
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>

          <div style={{ textAlign: 'left' }}>
            <label
              htmlFor="login-password"
              style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}
            >
              Password
            </label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>

          {/* §12 — inline, persistent, never a toast; icon + text, never colour
              alone. Reuses the shared banner rather than a local copy. */}
          {error && (
            <div id="login-error">
              <ErrorBanner title="Could not sign in" message={error} />
            </div>
          )}

          {/* Mock mode only. This screen is mounted OUTSIDE Shell (App.tsx), so
              the global MockBanner does not reach it — and without the account
              list there is no way to discover a working sign-in. */}
          {IS_MOCK && (
            <div
              role="status"
              style={{
                textAlign: 'left',
                background: 'var(--st-progress-bg)',
                color: 'var(--st-progress-fg)',
                padding: '9px 12px',
                borderRadius: 'var(--r-btn)',
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <span>Mock data — local corpus, no Supabase project.</span>
              <span style={{ fontWeight: 500 }}>
                Sign in as {MOCK_LOGINS.map((l) => l.email).join(' · ')} with any password.
              </span>
            </div>
          )}

        <Button type="submit" variant="primary" disabled={busy} style={{ height: 44, fontSize: 16 }}>
          {busy ? 'Signing in…' : 'Sign In'}
        </Button>
      </form>
    </AuthCard>
  )
}

/**
 * The secondary routes under the divider.
 *
 * ## Why there is still no "Sign in with PIN" button here
 *
 * The PIN was built on 24 Aug 2026 — `staff_auth_pins`, `verify_staff_pin`, and
 * a real lock screen that no longer opens for any six digits. It is deliberately
 * **not** offered on this screen, and the reason is worth stating in full
 * because the design spec for the feature got it wrong first:
 *
 * The spec said this button should become a conditional "Unlock this device",
 * shown when a lockable session exists. On THIS screen that condition can never
 * be true. `Shell` sends a visitor here precisely because `user` is null, and
 * `AuthProvider` restores any session it can find before that decision is made
 * — so a session that could be unlocked would have kept the operator on
 * `/today` and never rendered this component. A conditional button whose
 * condition is unreachable is a button that does not exist, wearing a
 * plausible-looking guard.
 *
 * So the affordance stays surfaced-as-unavailable, which is this codebase's
 * established answer, but the REASON is now the decided one rather than the
 * undecided one it carried since 11 Aug. The old text said storage and identity
 * mapping "has not been decided (PLAN.md §4)". Both are decided: the hash lives
 * in `staff_auth_pins` keyed by `users.id`, and 0066's header explains why that
 * still cannot produce a session.
 *
 * What genuinely remains unbuilt is PIN-as-PRIMARY sign-in, which needs a
 * server-side verifier holding the service key plus the phone pairing
 * `authentication_method` (0001) already names. That is a real feature and its
 * absence is what this reason now describes.
 */
function LoginFooter() {
  return (
    <>
      <Unavailable reason="A PIN re-opens a session that is already signed in — it cannot sign you in, because nothing in Postgres can issue a Supabase session and verifying a PIN in the browser would leave you with no JWT and every screen empty (migration 0066). Set a PIN in Settings ▸ System ▸ Security; it appears on the lock screen, not here. Signing in WITH a PIN needs a server-side verifier and the phone pairing 0001 names — not built.">
        <button
          type="button"
          disabled
          style={{
            width: '100%',
            minHeight: 44,
            borderRadius: 'var(--r-btn)',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--muted)',
            fontSize: 'var(--t-meta)',
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'not-allowed',
          }}
        >
          Sign in with PIN
        </button>
      </Unavailable>

      {/*
        Was a disabled button reading "Forgot password? Send OTP", because
        the render draws an SMS code and SMS is undecided. Built 15 Aug 2026
        as an EMAIL reset instead — see `ForgotPassword.tsx`. The OTP half is
        still unbuilt and still says so, one screen further in; what changed
        is that being locked out is no longer a dead end.
      */}
      <Link
        to="/forgot-password"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          minHeight: 44,
          borderRadius: 'var(--r-btn)',
          border: 'none',
          background: 'transparent',
          color: 'var(--primary-text)',
          fontSize: 'var(--t-meta)',
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Forgot password?
      </Link>
    </>
  )
}
