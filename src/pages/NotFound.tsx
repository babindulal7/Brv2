import { Link } from 'react-router-dom'
import Icon from '../components/ui/Icon'

export default function NotFound() {
  return (
    <div style={{ maxWidth: 440, margin: '80px auto', textAlign: 'center', padding: 'var(--sp-lg)' }}>
      <div style={{
        width: 80,
        height: 80,
        margin: '0 auto var(--sp-lg)',
        borderRadius: 'var(--r-badge)',
        background: 'var(--card2)',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <Icon name="alert_circle" size={36} color="var(--danger)" />
      </div>

      <h1 style={{
        fontSize: 'var(--t-h2)',
        fontWeight: 700,
        color: 'var(--text)',
        marginBottom: 'var(--sp-md)',
        fontFamily: 'var(--font-display)',
      }}>
        Page not found
      </h1>

      <p style={{
        color: 'var(--muted)',
        marginBottom: 'var(--sp-xl)',
        lineHeight: 1.6
      }}>
        The URL you requested doesn't exist in Babin Rentals OS.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', alignItems: 'center' }}>
        <Link
          to="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--sp-sm)',
            padding: '12px 24px',
            borderRadius: 'var(--r-btn)',
            background: 'var(--primary)',
            color: 'var(--on-primary)',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 'var(--t-ui)',
            fontFamily: 'inherit',
            transition: 'transform var(--dur-fast) var(--ease), filter var(--dur-fast) var(--ease)',
            minHeight: 'var(--tap)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
        >
          <Icon name="home" size={18} />
          Return to Today
        </Link>

        <Link
          to="/rentals"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--sp-sm)',
            padding: '12px 24px',
            borderRadius: 'var(--r-btn)',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text)',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 'var(--t-ui)',
            fontFamily: 'inherit',
            transition: 'background-color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease)',
            minHeight: 'var(--tap)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-card)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <Icon name="box" size={18} />
          Browse Rentals
        </Link>
      </div>
    </div>
  )
}