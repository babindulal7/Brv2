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
