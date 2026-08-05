import type { ReactNode, CSSProperties } from 'react'
import Icon from './Icon'
import type { IconName } from './Icon'
import { BRAND, BRAND_TEXT } from '../../lib/status'
import type { BrandKey } from '../../lib/status'
import { FOOTER_NOTE } from '../../data/nav'

/**
 * Page furniture shared by every Generation C screen.
 *
 * Every deep render in the set repeats the same skeleton — title block, KPI
 * strip, cards, a ~300px right rail, and a footer note bar. Building it once
 * here is what keeps 16 sections looking like one product.
 */

/* ── card ──────────────────────────────────────────────────────────────── */

export const cardStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-card)',
  boxShadow: 'var(--shadow-card)',
  transition: 'background-color var(--dur-theme) ease, border-color var(--dur-theme) ease',
} as const

export function Card({
  title,
  action,
  children,
  style,
  bodyStyle,
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  style?: CSSProperties
  bodyStyle?: CSSProperties
}) {
  return (
    <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', minWidth: 0, ...style }}>
      {title && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 14px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
          {action && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>{action}</div>}
        </div>
      )}
      <div style={{ padding: 14, flex: 1, minWidth: 0, ...bodyStyle }}>{children}</div>
    </section>
  )
}

/* ── page title block ──────────────────────────────────────────────────── */

export function PageHeader({
  icon,
  title,
  description,
  actions,
}: {
  icon?: IconName
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {icon && (
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                display: 'grid',
                placeItems: 'center',
                background: 'var(--nav-active-bg)',
                color: 'var(--nav-active-accent)',
                flexShrink: 0,
              }}
            >
              <Icon name={icon} size={17} fill />
            </span>
          )}
          <h1 style={{ margin: 0, fontSize: 'var(--t-h1)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.015em' }}>
            {title}
          </h1>
        </div>
        {description && (
          <p style={{ margin: '5px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>{description}</p>
        )}
      </div>
      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  )
}

/* ── buttons ───────────────────────────────────────────────────────────── */

export function Button({
  children,
  icon,
  variant = 'secondary',
  onClick,
  className,
  disabled,
}: {
  children: ReactNode
  icon?: IconName
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  onClick?: () => void
  className?: string
  disabled?: boolean
}) {
  const skin =
    variant === 'primary'
      ? { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)', border: '1px solid transparent' }
      : variant === 'danger'
        ? { background: 'var(--btn-danger-bg, #dc2626)', color: '#fff', border: '1px solid transparent' }
        : variant === 'ghost'
          ? { background: 'transparent', color: 'var(--text2)', border: '1px solid transparent' }
          : { background: 'var(--btn-secondary-bg)', color: 'var(--text)', border: '1px solid var(--btn-secondary-border)' }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 34,
        padding: '0 12px',
        borderRadius: 'var(--r-btn)',
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        ...skin,
      }}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  )
}

/* ── KPI strip ─────────────────────────────────────────────────────────── */

export interface Kpi {
  label: string
  value: string
  icon: IconName
  accent: BrandKey
  /** Delta line, e.g. "8.4% vs last month". */
  delta?: { direction: 'up' | 'down'; text: string; good?: boolean }
  note?: string
  /** Sparkline points, 0–100, drawn as a polyline. Optional. */
  spark?: number[]
}

function Spark({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null
  const w = 100
  const h = 26
  const max = Math.max(...points)
  const min = Math.min(...points)
  const span = max - min || 1
  const d = points
    .map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p - min) / span) * (h - 3) - 1.5}`)
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden style={{ width: '100%', height: h, display: 'block' }}>
      <polyline points={d} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function KpiStrip({ items, columns }: { items: Kpi[]; columns?: number }) {
  const cols = columns ?? items.length
  return (
    <section
      aria-label="Key figures"
      style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 'var(--sp-md)' }}
    >
      {items.map((k) => (
        <article key={k.label} className="lift" style={{ ...cardStyle, padding: '13px 14px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: BRAND[k.accent],
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name={k.icon} size={16} fill />
            </span>
            <div
              style={{
                fontSize: 'var(--t-meta)',
                fontWeight: 600,
                color: 'var(--text2)',
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {k.label}
            </div>
          </div>

          {/*
            The value gets the card's full width rather than being indented
            under the icon. Six cards across leaves ~190px, and "Rs 25,00,000"
            does not fit in what is left after a 30px tile — it would either
            wrap (reading as two numbers) or clip.
          */}
          <div
            className="kpi-value"
            style={{
              marginTop: 9,
              fontSize: k.value.length > 8 ? 'clamp(16px, 1.05vw, 20px)' : 'clamp(16px, 1.5vw, 22px)',
              fontWeight: 700,
              color: 'var(--text)',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              whiteSpace: 'nowrap',
              // A figure longer than the card degrades to an ellipsis rather
              // than bleeding past the border.
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {k.value}
          </div>

          {(k.delta || k.note) && (
            <div style={{ marginTop: 7, fontSize: 'var(--t-meta)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {k.delta && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    fontWeight: 600,
                    color: (k.delta.good ?? k.delta.direction === 'up') ? 'var(--success-text)' : 'var(--danger-text)',
                  }}
                >
                  <Icon name={k.delta.direction === 'up' ? 'arrow_up' : 'arrow_down'} size={12} fill />
                  {k.delta.text}
                </span>
              )}
              {k.note && <span style={{ color: 'var(--muted)' }}>{k.note}</span>}
            </div>
          )}

          {k.spark && (
            <div style={{ marginTop: 8 }}>
              <Spark points={k.spark} color={BRAND[k.accent]} />
            </div>
          )}
        </article>
      ))}
    </section>
  )
}

/* ── right rail ────────────────────────────────────────────────────────── */

export function Rail({ children }: { children: ReactNode }) {
  return (
    <aside
      aria-label="Page summary"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}
    >
      {children}
    </aside>
  )
}

/** Label/value rows — the shape every "… Summary" card in the renders uses. */
export function SummaryRows({ rows }: { rows: Array<{ label: string; value: string; tone?: BrandKey }> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 'var(--t-meta)' }}>
          <span style={{ color: 'var(--text2)', minWidth: 0, flex: 1 }}>{r.label}</span>
          <span
            className="figure"
            style={{
              fontWeight: 600,
              color: r.tone ? BRAND_TEXT[r.tone] : 'var(--text)',
              whiteSpace: 'nowrap',
            }}
          >
            {r.value}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ── footer note bar ───────────────────────────────────────────────────── */

export function FooterNote({ extra }: { extra?: string[] }) {
  const parts = [FOOTER_NOTE.dates, FOOTER_NOTE.timezone, ...(extra ?? [])]
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        padding: '11px 2px 0',
        borderTop: '1px solid var(--border)',
        marginTop: 4,
      }}
    >
      <Icon name="info" size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
      {parts.map((p, i) => (
        <span key={p} style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 12 }}>
          {i > 0 && <span aria-hidden style={{ color: 'var(--muted)' }}>|</span>}
          {p}
        </span>
      ))}
      <span className="figure" style={{ marginLeft: 'auto', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
        {FOOTER_NOTE.version}
      </span>
    </div>
  )
}
