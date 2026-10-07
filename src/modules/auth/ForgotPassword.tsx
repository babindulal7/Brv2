import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Input } from '../../components/ui'
import { ErrorBanner } from '../../components/ui/StateViews'
import { Unavailable } from '../../components/ui/Unavailable'
import { useAuth } from '../../lib/auth'
import { AuthCard, NoticeBanner } from './AuthCard'

/**
 * **Request a password-reset link.** Built 15 Aug 2026.
 *
 * ## Why this is email and not the OTP the render draws
 *
 * `Login.tsx` shipped this control as a disabled button reading *"Forgot
 * password? Send OTP"*, because the render it was ported from draws an SMS code
 * and SMS needs decisions nobody has made — which gateway carries it, and
 * whether a shared floor tablet is the device or the person (PLAN.md §4).
 *
 * None of that blocks a reset. Every staff row already carries the email the
 * operator signs in with, `users.email` is NOT NULL on the live project, and
 * Supabase Auth sends and verifies the link itself. So the flow is built on the
 * identity that exists rather than waiting on the one that was drawn. **The OTP
 * button stays, still unavailable and still stating its reason** — it is a
 * second route to the same place, not this one wearing different words.
 *
 * ## The sentence this screen may not say
 *
 * It cannot say "check your inbox". `supabase.auth.resetPasswordForEmail`
 * answers identically whether or not the address has an account — deliberately,
 * so the form is not an account-enumeration oracle — so a confident confirmation
 * would be a claim this screen has no way to check. It says *"if that address
 * has an account"* instead: true in both branches, and it still tells someone
 * who typed their address correctly exactly what to do next. See
 * `lib/auth.requestPasswordReset` for the full note.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const { requestPasswordReset } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)

    if (!email.trim()) {
      setError('Enter the work email you sign in with.')
      return
    }

    setBusy(true)
    const { error: resetError } = await requestPasswordReset(email.trim())
    setBusy(false)

    if (resetError) {
      // §12 — inline and persistent, never a toast. Supabase's own rate-limit
      // message ("For security purposes, you can only request this after N
      // seconds") lands here verbatim, which is more useful than a generic one.
      setError(resetError)
      return
    }

    setSent(true)
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a link to set a new one."
      footer={
        <>
          <Link
            to="/login"
            className="auth-footer-link"
          >
            Back to sign in
          </Link>

          <Unavailable reason={/* SMS reset is not built: no gateway is wired and the shared-device identity rule is undecided (PLAN.md §4). The email link above does the same job. */ "Use the email link above to reset your password."}>
            <Button
              type="button"
              variant="secondary"
              disabled
              style={{
                width: '100%',
                minHeight: 44,
              }}
            >
              Send a code by SMS instead
            </Button>
          </Unavailable>
        </>
      }
    >
      {sent ? (
        <NoticeBanner
          title="Request sent"
          message={
            <>
              If <strong>{email.trim()}</strong> has an account, a reset link is on its way. The link expires,
              so open it soon — and check the spam folder before asking for another.
            </>
          }
        />
      ) : (
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label
              htmlFor="reset-email"
              className="auth-label"
            >
              Work Email
            </label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@babinrentals.com"
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'reset-error' : undefined}
            />
          </div>

          {error && (
            <div id="reset-error">
              <ErrorBanner title="Could not send the link" message={error} />
            </div>
          )}

          <Button type="submit" variant="primary" disabled={busy} style={{ minHeight: 44, fontSize: 16 }}>
            {busy ? 'Sending…' : 'Email me a reset link'}
          </Button>
        </form>
      )}
    </AuthCard>
  )
}
