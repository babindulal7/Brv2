import React, { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Card, Button, Input } from '../../components/ui'
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
 * **TODO(decision): PIN and OTP sign-in are not built.** Both appear in the
 * render this screen was ported from, and PIN specifically is the warehouse
 * tablet flow. Neither is implementable without rulings this project has not
 * made: where a PIN is stored and how it maps to a Supabase identity (Supabase
 * has no native PIN factor), which SMS gateway carries the OTP, and whether a
 * shared floor tablet signs in as the device or as the person. Inventing any of
 * that would bake an unmade security decision into a login screen, so both are
 * surfaced as unavailable-with-reason rather than faked. See PLAN.md §4.
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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--app)',
        padding: 20,
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 420,
          padding: '40px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 'clamp(20px, 2vw, 24px)', fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 8px', color: 'var(--text)' }}>
            Welcome to Babin Rentals
          </h1>
          <p style={{ margin: 0, color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
            Sign in with your work email to continue.
          </p>
        </div>

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

        {/* The two flows the render shows but this build cannot honestly provide. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-lg)' }}>
          <Unavailable reason="PIN sign-in is not built: where a PIN is stored and how it maps to a staff identity has not been decided (PLAN.md §4).">
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
        </div>
      </Card>
    </div>
  )
}
