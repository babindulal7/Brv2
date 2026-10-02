import { useState } from 'react'
import Icon from '../ui/Icon'
import { useSchemaGuard } from '../../lib/schemaGuard'

/**
 * **The schema-behind banner — blocking, and not dismissible.**
 *
 * The audit's A1 asks for "a blocking banner instead of failing mid-action".
 * Both halves are load-bearing and this component implements both:
 *
 *   * **Blocking** — there is no dismiss control. The whole point is that the
 *     operator must not be able to acknowledge the warning and then discover the
 *     failure halfway through a Handover, with no statement of why. This is the
 *     same rule `MockBanner` states for itself in `App.tsx` ("not dismissible, on
 *     every screen, at every width"), for the same reason: a disclosure the
 *     operator can wave away is a disclosure that gets waved away, and this one
 *     would be waved away with a failure still queued up behind it.
 *
 *   * **No hardcoded migration range.** An earlier version read "applying
 *     migrations 0125–0147". That was wrong the moment it was written — the live
 *     ledger ends at `0089`, so the unapplied set starts before 0125 — and a
 *     range typed into a string cannot be kept true as migrations are added. The
 *     banner now names only what it actually probed, and says so.
 *
 * Two states, because they are different facts and the operator acts on them
 * differently:
 *
 *   * `isBehind` — a probe proved an object is absent. Action: apply migrations.
 *   * `isUnverified` — a probe never reached the database (offline, timeout). The
 *     schema may be current, may not, and this run cannot say. Reporting "in
 *     sync" here would be a false all-clear from a guard whose entire value is
 *     being trusted when the answer is inconvenient.
 */
export function SchemaGuardBanner() {
  const { isBehind, isUnverified, missing, unverified } = useSchemaGuard()
  const [showDetails, setShowDetails] = useState(false)

  if (!isBehind && !isUnverified) return null

  const tone = isBehind ? 'danger' : 'progress'
  const named = (isBehind ? missing : unverified).map((m) => `${m.name} (${m.migration})`)
  const migrations = Array.from(new Set((isBehind ? missing : unverified).map((m) => m.migration)))
    .sort()
    .join(', ')

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        background: `var(--st-${tone}-bg)`,
        color: `var(--st-${tone}-fg)`,
        borderBottom: '1px solid var(--border)',
        padding: '8px 16px',
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        zIndex: 50,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Icon name="alert_triangle" size={16} />
        <span style={{ minWidth: 0 }}>
          {isBehind ? (
            <>
              Database schema is behind this build. {missing.length} checked object
              {missing.length === 1 ? '' : 's'} could not be found
              {migrations ? ` (migration ${migrations})` : ''}. Actions that need{' '}
              {Array.from(new Set(missing.map((m) => m.impact))).join(', ')} will fail until the
              database is migrated — ask Babin to apply the pending migrations, then reload.
            </>
          ) : (
            <>
              Could not verify the database schema. This device could not reach the database for{' '}
              {unverified.length} of the checks
              {migrations ? ` (migration ${migrations})` : ''}, so the app cannot tell you whether it
              is current. Check the connection and reload before starting work.
            </>
          )}
        </span>
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          aria-expanded={showDetails}
          style={{
            background: 'transparent',
            border: '1px solid currentColor',
            color: 'inherit',
            minHeight: 44,
            padding: '0 12px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 'inherit',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          {showDetails ? 'Hide details' : `What is missing (${named.length})`}
        </button>
      </div>

      {showDetails && (
        <ul style={{ margin: 0, paddingLeft: 24, fontSize: 'var(--t-caption)', fontWeight: 500 }}>
          {(isBehind ? missing : unverified).map((item) => (
            <li key={`${item.migration}-${item.name}`}>
              <strong>Migration {item.migration}</strong> — {item.name} ({item.kind}). Blocks:{' '}
              {item.impact}.
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}