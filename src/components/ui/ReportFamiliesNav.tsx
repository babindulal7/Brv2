import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useCanViewMoney } from '../../lib/moneyVisibility'

export interface ReportFamilyItem {
  label: string
  to: string | null
  money: boolean
}

export const REPORT_FAMILIES: readonly ReportFamilyItem[] = [
  { label: 'Dashboard', to: '/reports/pulse', money: false },
  { label: 'Revenue', to: '/reports/revenue', money: true },
  { label: 'Rentals', to: '/reports/rentals', money: false },
  { label: 'Inventory', to: '/reports/inventory', money: false },
  { label: 'Clients', to: '/reports/clients', money: true },
  { label: 'Operations', to: '/reports/operations', money: false },
  { label: 'Finance', to: '/reports/cash-flow', money: true },
  { label: 'Maintenance', to: '/reports/damage-maintenance', money: false },
  { label: 'Cases', to: '/reports/cases', money: false },
  { label: 'Staff', to: '/reports/staff', money: false },
  { label: 'Custom', to: '/reports/custom', money: false },
] as const

const tabStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 30,
  padding: '0 11px',
  borderRadius: 'var(--r-badge)',
  fontSize: 'var(--t-meta)',
  fontWeight: 600,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}

interface ReportFamiliesNavProps {
  current: string
}

export function ReportFamiliesNav({ current }: ReportFamiliesNavProps) {
  const money = useCanViewMoney()

  const tabs = REPORT_FAMILIES.map((t) => ({
    label: t.label,
    current: t.label.toLowerCase() === current.toLowerCase(),
    to: t.to === null ? null : t.money && !money ? null : t.to,
    gated: t.to !== null && t.money && !money,
  }))

  const unbuiltTabs = tabs.filter((t) => t.to === null && !t.gated).map((t) => t.label)
  const gatedTabs = tabs.filter((t) => t.gated).map((t) => t.label)

  return (
    <nav aria-label="Report families" style={{ marginTop: 'var(--sp-xs)', marginBottom: 'var(--sp-sm)' }}>
      <div
        style={{
          display: 'flex',
          columnGap: 6,
          rowGap: 'var(--sp-lg)',
          flexWrap: 'wrap',
          borderBottom: '1px solid var(--border)',
          paddingBottom: 8,
        }}
      >
        {tabs.map((t) =>
          t.to ? (
            <Link
              key={t.label}
              to={t.to}
              className="tap"
              aria-current={t.current ? 'page' : undefined}
              style={{
                ...tabStyle,
                border: `1px solid ${t.current ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                background: t.current ? 'var(--nav-active-bg)' : 'var(--card)',
                color: t.current ? 'var(--nav-active-accent)' : 'var(--text2)',
              }}
            >
              {t.label}
            </Link>
          ) : (
            <span
              key={t.label}
              aria-disabled="true"
              style={{
                ...tabStyle,
                border: '1px dashed var(--border)',
                background: 'transparent',
                color: 'var(--muted)',
                cursor: 'not-allowed',
              }}
            >
              {t.label}
            </span>
          ),
        )}
      </div>
      {(unbuiltTabs.length > 0 || gatedTabs.length > 0) && (
        <p style={{ margin: '7px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
          {unbuiltTabs.length > 0 && (
            <>
              Not built: {unbuiltTabs.join(' · ')} — Reports §8 names these families; nothing behind them exists in this
              build yet.{' '}
            </>
          )}
          {gatedTabs.length > 0 && <>Not in your role&rsquo;s view: {gatedTabs.join(' · ')}.</>}
        </p>
      )}
    </nav>
  )
}
