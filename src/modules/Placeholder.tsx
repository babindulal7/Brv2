import Icon from '../components/ui/Icon'
import { cardStyle } from '../components/ui/Page'

/**
 * Stands in for a nav destination whose screen has not been built yet.
 *
 * It says so plainly. A convincing-looking empty dashboard would read as a
 * finished screen with no data, which is a different and much more misleading
 * claim than "not built yet".
 */
export default function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ ...cardStyle, padding: '48px 28px', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <div style={{ maxWidth: 420 }}>
        <span
          aria-hidden
          style={{
            width: 44,
            height: 44,
            borderRadius: 'var(--r-btn)',
            display: 'grid',
            placeItems: 'center',
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            margin: '0 auto 14px',
          }}
        >
          <Icon name="tool" size={21} />
        </span>
        <h2 style={{ margin: 0, fontSize: 'var(--fs-h4)', fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
        <p style={{ margin: '8px 0 0', fontSize: 'var(--t-ui)', color: 'var(--text2)', lineHeight: 1.5 }}>
          This screen has not been built yet. Screens are ported one at a time from the reference renders — see{' '}
          <code className="figure" style={{ fontSize: 'var(--t-meta)' }}>
            SCREENS.md
          </code>{' '}
          for the catalogue and what is done.
        </p>
      </div>
    </div>
  )
}
