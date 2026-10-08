import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui'
import { ErrorBanner } from '../../components/ui/StateViews'
import { useAuth } from '../../lib/auth'
import { AuthCard } from './AuthCard'
import { PasswordInput } from './PasswordInput'
import './auth.css'

/**
 * **Set a new password.** Where the emailed reset link lands. Built 15 Aug 2026.
 *
 * ## There is no "current password" field, and that is not an oversight
 *
 * Supabase establishes a session when the recovery link is followed, and
 * possession of a link sent to the address on the staff row IS the proof of
 * identity. Asking for the old password would ask the one thing the person on
 * this screen has already said they do not have.
 *
 * ## Why `isPasswordRecovery` is checked rather than `user`
 *
 * `updateUser({ password })` succeeds for ANY live session, including an
 * ordinary signed-in one. Gating on `user` would therefore turn this URL into a
 * change-password screen that any unattended, unlocked desk could reach — a
 * different feature, with a different threat model, that nobody asked for. The
 * flag is set only by Supabase's `PASSWORD_RECOVERY` event, which only a
 * recovery link raises.
 *
 * ## The link's own failures arrive in the URL fragment, not as an exception
 *
 * An expired or already-used link does not throw; Supabase redirects here with
 * `#error=access_denied&error_code=otp_expired&error_description=…` and no
 * session at all. Without reading that fragment this screen would render its
 * generic refusal and the operator would be told to request a link they had just
 * requested. It is read below and stated in words.
 */
export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { updatePassword, isPasswordRecovery } = useAuth()
  const navigate = useNavigate()

  /**
   * Read once at mount: the fragment is cleared by supabase-js as it consumes
   * the token, so a later read finds nothing. `useMemo` with an empty dep list
   * rather than `useState` because it is derived, never set.
   */
  const linkError = useMemo(() => {
    if (typeof window === 'undefined') return null
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
    if (!hash) return null
    const params = new URLSearchParams(hash)
    const code = params.get('error_code')
    if (!code && !params.get('error')) return null
    if (code === 'otp_expired') {
      return 'That reset link has expired. Request a new one — links are deliberately short-lived.'
    }
    return (
      params.get('error_description')?.replace(/\+/g, ' ') ??
      'That reset link is no longer valid. Request a new one.'
    )
  }, [])

  /* Clear the fragment so a refresh does not re-render a stale failure, and so a
     token never sits in the address bar longer than the moment it is used. */
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)

    if (!password || !confirm) {
      setError('Enter the new password twice.')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }

    /*
     * No minimum length is checked here. How strong a staff password must be is
     * a product decision this repo has not made, and Supabase's project setting
     * already holds one — inventing a second rule in the client would let the
     * two disagree, and the client's copy would be the one nobody updates.
     * A password the project refuses comes back as a message from the server,
     * which is shown verbatim below.
     */
    setBusy(true)
    const { error: updateError } = await updatePassword(password)
    setBusy(false)

    if (updateError) {
      setError(updateError)
      return
    }

    // The recovery session is a real session — they are signed in as themselves.
    navigate('/dashboard', { replace: true })
  }

  if (!isPasswordRecovery) {
    return (
      <AuthCard
        title="This link is not active"
        subtitle="Open the most recent link from your email to set a new password."
        footer={
          <Link
            to="/forgot-password"
            className="auth-footer-link"
          >
            Request a new link
          </Link>
        }
      >
        <ErrorBanner
          title={linkError ? 'That link cannot be used' : 'No reset in progress'}
          message={
            linkError ??
            'This page only works when you arrive from a password-reset email. Nothing has been changed.'
          }
        />
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Set a new password" subtitle="Choose a password you have not used here before.">
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="auth-field">
          <label
            htmlFor="new-password"
            className="auth-label"
          >
            New Password
          </label>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'new-password-error' : undefined}
          />
        </div>

        <div className="auth-field">
          <label
            htmlFor="confirm-password"
            className="auth-label"
          >
            Confirm New Password
          </label>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'new-password-error' : undefined}
          />
        </div>

        {error && (
          <div id="new-password-error">
            <ErrorBanner title="Could not set the password" message={error} />
          </div>
        )}

        <Button type="submit" variant="primary" disabled={busy} style={{ minHeight: 44, fontSize: 16 }}>
          {busy ? 'Saving…' : 'Set password and sign in'}
        </Button>
      </form>
    </AuthCard>
  )
}
