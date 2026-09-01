import type { ReactNode } from 'react'
import { Card } from '../../components/ui'
import Icon from '../../components/ui/Icon'

/**
 * The chrome every signed-out screen shares — the centred card, the heading pair
 * and the spacing rhythm.
 *
 * Extracted 15 Aug 2026 when `ForgotPassword` and `ResetPassword` were built.
 * `Login` had carried this markup inline since 11 Aug; copying it twice more
 * would have made the auth flow the one place in the app where three screens
 * drift apart on padding, and the drift only shows up on the screen a locked-out
 * operator sees — the least-visited and worst moment to look unfinished.
 *
 * Deliberately not a `components/ui` primitive: nothing outside `modules/auth`
 * renders a full-viewport centred card, and promoting it would invite screens
 * that should use `PageBody` to reach for this instead.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  /** One sentence under the heading. Says what this screen wants, not what it is. */
  subtitle: string
  children: ReactNode
  /** Optional block below a divider — secondary routes, unavailable flows. */
  footer?: ReactNode
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        /* v4.2 §3 — transparent, same as the app shell: the signed-out screens
           sit on the same body canvas gradient as the shell they lead to. */
        background: 'transparent',
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
          {/* The sidebar's gold BR mark (Sidebar.tsx §4.3.2 wordmark), so the
              signed-out screens carry the same identity as the shell they lead
              to. A tile rather than the bare rail glyph because the card has no
              rail to anchor it. */}
          <span
            aria-hidden
            className="title"
            style={{
              display: 'inline-grid',
              placeItems: 'center',
              width: 44,
              height: 44,
              marginBottom: 16,
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border)',
              color: 'var(--brand-mark)',
              fontWeight: 700,
              fontSize: 'var(--t-h4)',
              lineHeight: 1,
            }}
          >
            BR
          </span>
          <h1
            style={{
              fontSize: 'clamp(20px, 2vw, 24px)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              margin: '0 0 8px',
              color: 'var(--text)',
            }}
          >
            {title}
          </h1>
          <p style={{ margin: 0, color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>{subtitle}</p>
        </div>

        {children}

        {footer && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sp-sm)',
              borderTop: '1px solid var(--border)',
              paddingTop: 'var(--sp-lg)',
            }}
          >
            {footer}
          </div>
        )}
      </Card>
    </div>
  )
}

/**
 * The neutral, non-committal confirmation.
 *
 * §12 gives errors an inline persistent banner and sends successes to a toast.
 * This is neither, and the gap is the point: `ForgotPassword` cannot claim an
 * email was sent (Supabase answers identically for an address with no account —
 * see `requestPasswordReset`), so a green tick would be a fabricated success and
 * a red banner would be a fabricated failure. It reports what is actually known:
 * the request was accepted. Icon + text, never colour alone (Law 11).
 */
export function NoticeBanner({ title, message }: { title: string; message: ReactNode }) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 11,
        padding: '13px 14px',
        borderRadius: 'var(--r-card)',
        background: 'var(--st-primary-bg)',
        border: '1px solid var(--st-primary-bg)',
        color: 'var(--st-primary-fg)',
      }}
    >
      <Icon name="info" size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--t-meta)', fontWeight: 700 }}>{title}</div>
        <div style={{ margin: '2px 0 0', fontSize: 'var(--t-meta)', lineHeight: 1.5 }}>{message}</div>
      </div>
    </div>
  )
}
