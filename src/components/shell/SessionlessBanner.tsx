import { useAuth } from '../../lib/auth'

/**
 * Says, on screen, that this session has no JWT behind it.
 *
 * ## Why a banner and not a console warning
 *
 * Both dev doors already log a loud `console.warn` explaining that there is no
 * session, that every query runs as `anon`, and that RLS will return empty
 * results. `auth.tsx` carries forty lines of comment saying the same thing.
 *
 * On 12 Aug 2026 that was not enough. A database holding 120 seeded bookings
 * read as empty through this door — twice — and both times the conclusion drawn
 * was "the seed did not work". The screens were right; the session was wrong.
 *
 * The failure has no symptom. PostgREST answers **200**, and its `Content-Range`
 * header reports zero rows. `PageBody` renders the empty state it is supposed to render. Nothing
 * anywhere is broken, so nothing anywhere complains — and the app draws a
 * header that says "Owner" over a table that says there is nothing to show.
 *
 * A warning in a console nobody has open cannot fix that. The only thing that
 * can is the screen itself, which is the one place the person being misled is
 * definitely looking.
 *
 * This is dev-only by construction: `sessionless` is set exclusively by the two
 * `import.meta.env.DEV` doors, and `vite build` drops both branches, so in a
 * production bundle this component can never render.
 */
export function SessionlessBanner() {
  const { sessionless } = useAuth()
  if (!sessionless) return null

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--sp-sm)',
        padding: '10px 20px',
        // Law 11 — never colour alone. The words carry the meaning; the tone
        // only reinforces it.
        background: 'var(--warning)',
        color: 'var(--warning-text)',
        fontSize: 'var(--t-meta)',
        lineHeight: 1.5,
        borderBottom: '1px solid var(--border)',
      }}
    >
      <strong style={{ flexShrink: 0 }}>Dev sign-in — no database session.</strong>
      <span>
        You are signed in through a development door, so requests go out unauthenticated. Every
        list will be <strong>empty</strong> no matter what the database contains. Sign in with the
        real Supabase password to see data.
      </span>
    </div>
  )
}
