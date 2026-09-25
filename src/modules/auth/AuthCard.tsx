import type { ReactNode } from 'react'
import { Card } from '../../components/ui'
import Icon from '../../components/ui/Icon'
import './auth.css'

/**
 * The chrome every signed-out screen shares — the centred card, the heading pair
 * and the spacing rhythm.
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
    <div className="auth-wrapper">
      <Card className="auth-card">
        <div className="auth-header">
          {/* Gold BR monogram tile matching the app identity */}
          <span aria-hidden className="auth-brand-mark title">
            BR
          </span>
          <h1 className="auth-title">{title}</h1>
          <p className="auth-subtitle">{subtitle}</p>
        </div>

        {children}

        {footer && (
          <div className="auth-footer">
            <div className="auth-footer-divider" />
            {footer}
            <div className="auth-security-badge">
              <Icon name="lock" size={12} />
              <span>Encrypted Session · Babin Rentals OS</span>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

/**
 * The neutral, non-committal confirmation.
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
        borderRadius: 'var(--r-card, 8px)',
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
