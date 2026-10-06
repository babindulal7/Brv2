import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Button, Input } from '../../components/ui'
import Icon from '../../components/ui/Icon'
import { AuthCard } from './AuthCard'
import { PasswordInput } from './PasswordInput'
import { Unavailable } from '../../components/ui/Unavailable'
import { ErrorBanner } from '../../components/ui/StateViews'
import { useAuth } from '../../lib/auth'
import { IS_MOCK } from '../../lib/supabase'
import { MOCK_LOGINS } from '../../lib/devQuickLogins'
import './auth.css'

const REMEMBER_EMAIL_KEY = 'babin.auth.remember_email'

/**
 * **Staff sign-in.**
 *
 * Authenticates against Supabase Auth. The role that governs capability checks
 * is read from `users.primary_role` by `AuthProvider`.
 */
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberEmail, setRememberEmail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockoutSeconds, setLockoutSeconds] = useState(0)
  const [busy, setBusy] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const lockoutTimerRef = useRef<number | null>(null)

  // Load remembered work email on mount
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY)
      if (savedEmail) {
        setEmail(savedEmail)
        setRememberEmail(true)
      }
    } catch {
      /* ignore storage access error */
    }
  }, [])

  // Lockout countdown timer ticker
  useEffect(() => {
    if (lockoutSeconds > 0) {
      lockoutTimerRef.current = window.setTimeout(() => {
        setLockoutSeconds((prev) => prev - 1)
      }, 1000)
    } else if (lockoutSeconds === 0 && lockoutTimerRef.current) {
      clearTimeout(lockoutTimerRef.current)
      lockoutTimerRef.current = null
    }

    return () => {
      if (lockoutTimerRef.current) {
        clearTimeout(lockoutTimerRef.current)
      }
    }
  }, [lockoutSeconds])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || lockoutSeconds > 0) return
    setError(null)

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setError('Enter your work email and password.')
      return
    }

    setBusy(true)
    const { error: signInError } = await signIn(trimmedEmail, password)
    setBusy(false)

    if (signInError) {
      // Parse rate limit or lockout cooldowns if returned by Supabase
      const matchSeconds = signInError.match(/after (\d+) seconds/i)
      if (matchSeconds && matchSeconds[1]) {
        const sec = parseInt(matchSeconds[1], 10)
        if (!isNaN(sec) && sec > 0) {
          setLockoutSeconds(sec)
        }
      }

      setError(signInError)
      return
    }

    // Persist or clear remembered email on successful authentication
    try {
      if (rememberEmail) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, trimmedEmail)
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY)
      }
    } catch {
      /* ignore */
    }

    // Return the user to wherever the guard intercepted them, not always /dashboard.
    const from = (location.state as { from?: string } | null)?.from
    navigate(from && from !== '/login' ? from : '/dashboard', { replace: true })
  }

  return (
    <AuthCard
      title="Welcome to Babin Rentals"
      subtitle="Sign in with your work email to continue."
      footer={<LoginFooter />}
    >
      <form onSubmit={handleLogin} noValidate className="auth-form">
        <div className="auth-field">
          <label htmlFor="login-email" className="auth-label">
            Work Email
          </label>
          <Input
            id="login-email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@babinrentals.com"
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'login-error' : undefined}
          />
        </div>

        <div className="auth-field">
          <label htmlFor="login-password" className="auth-label">
            Password
          </label>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'login-error' : undefined}
          />
        </div>

        {/* Remember email checkbox */}
        <label className="auth-remember-row">
          <input
            type="checkbox"
            checked={rememberEmail}
            onChange={(e) => setRememberEmail(e.target.checked)}
            className="auth-remember-checkbox"
          />
          <span className="auth-remember-label">Remember work email on this device</span>
        </label>

        {/* Live lockout countdown feedback */}
        {lockoutSeconds > 0 && (
          <div className="auth-lockout-banner" role="alert" aria-live="assertive">
            <Icon name="alert_circle" size={16} />
            <span>
              Too many sign-in attempts. Please wait{' '}
              <span className="auth-lockout-timer">{lockoutSeconds}s</span> before retrying.
            </span>
          </div>
        )}

        {/* Law 12 — inline persistent error, never a toast */}
        {error && (
          <div id="login-error">
            <ErrorBanner title="Could not sign in" message={error} />
          </div>
        )}

        {/* Mock mode: Quick 1-click role logins (Strictly zero emojis) */}
        {IS_MOCK && (
          <div role="status" className="auth-mock-box">
            <div className="auth-mock-title">Quick Sign-In (Demo / Offline Mode):</div>
            <div className="auth-mock-buttons">
              {MOCK_LOGINS.map((l) => (
                <button
                  key={l.email}
                  type="button"
                  className="auth-mock-btn"
                  onClick={async () => {
                    setEmail(l.email)
                    setPassword('demo1234')
                    setBusy(true)
                    const { error: err } = await signIn(l.email, 'demo1234')
                    setBusy(false)
                    if (err) {
                      setError(err)
                    } else {
                      if (rememberEmail) {
                        try {
                          localStorage.setItem(REMEMBER_EMAIL_KEY, l.email)
                        } catch {
                          /* ignore */
                        }
                      }
                      const from = (location.state as { from?: string } | null)?.from
                      navigate(from && from !== '/login' ? from : '/dashboard', { replace: true })
                    }
                  }}
                  title={`Sign in as ${l.role}`}
                >
                  <Icon
                    name={
                      l.role === 'Owner'
                        ? 'crew'
                        : l.role === 'Warehouse'
                          ? 'package'
                          : 'card'
                    }
                    size={14}
                  />
                  <span>{l.role}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          disabled={busy || lockoutSeconds > 0}
          style={{ minHeight: 44, fontSize: 16 }}
        >
          {busy ? 'Signing in…' : lockoutSeconds > 0 ? `Wait (${lockoutSeconds}s)` : 'Sign In'}
        </Button>
      </form>
    </AuthCard>
  )
}

/**
 * The secondary routes under the divider.
 */
function LoginFooter() {
  return (
    <>
      <Unavailable reason="A PIN re-opens a session that is already signed in — it cannot sign you in, because nothing in Postgres can issue a Supabase session and verifying a PIN in the browser would leave you with no JWT and every screen empty (migration 0066). Set a PIN in Settings ▸ System ▸ Security; it appears on the lock screen, not here. Signing in WITH a PIN needs a server-side verifier and the phone pairing 0001 names — not built.">
        <Button
          type="button"
          variant="secondary"
          disabled
          style={{ width: '100%', minHeight: 44 }}
        >
          Sign in with PIN
        </Button>
      </Unavailable>

      <Link
        to="/forgot-password"
        className="auth-footer-link"
      >
        Forgot password?
      </Link>
    </>
  )
}
