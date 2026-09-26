import { useEffect, type ReactNode, type CSSProperties } from 'react'
import Icon from './Icon'
import type { IconName } from './Icon'
import { InfoTooltip } from './InfoTooltip'
import { BRAND, BRAND_ON, BRAND_TEXT } from '../../lib/status'
import type { BrandKey } from '../../lib/status'
import { FOOTER_NOTE } from '../../data/nav'
import { CollapsibleAside } from './CollapsibleAside'
import { useViewport } from '../../lib/device'
import { Button as SharedButton, type ButtonProps } from './Button'
import { Card as SharedCard } from './Card'
import { useOptionalWorkspace } from '../../lib/workspaceContext'

/**
 * Page furniture shared by every Generation C screen.
 *
 * Every deep render in the set repeats the same skeleton — title block, KPI
 * strip, cards, a ~300px right rail, and a footer note bar. Building it once
 * here is what keeps 16 sections looking like one product.
 */

/* ── card ──────────────────────────────────────────────────────────────── */

export const cardStyle = {
  background: 'var(--surface-card, var(--card))',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-card)',
  boxShadow: 'var(--shadow-card), var(--specular-rim)',
  transition: 'transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease), background-color var(--dur-theme) var(--ease), border-color var(--dur-theme) var(--ease)',
} as const

export function Card({
  id,
  title,
  action,
  children,
  style,
  bodyStyle,
}: {
  id?: string
  title?: string
  action?: ReactNode
  children: ReactNode
  style?: CSSProperties
  bodyStyle?: CSSProperties
}) {
  return (
    <SharedCard
      as="section"
      headingLevel="h2"
      padding="sm"
      {...(id !== undefined ? { id } : {})}
      {...(title !== undefined ? { title, action } : {})}
      {...(style !== undefined ? { style } : {})}
      {...(bodyStyle !== undefined ? { bodyStyle } : {})}
    >
      {children}
    </SharedCard>
  )
}

/* ── page title block ──────────────────────────────────────────────────── */

export function PageHeader({
  leading,
  icon,
  title,
  eyebrow,
  description,
  actions,
  breadcrumb,
  status,
}: {
  leading?: ReactNode
  icon?: IconName
  title: string
  eyebrow?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  breadcrumb?: ReactNode
  status?: ReactNode
}) {
  const ws = useOptionalWorkspace()

  useEffect(() => {
    if (ws && description) {
      ws.setPageInfo(description)
      return () => ws.setPageInfo(null)
    }
  }, [ws, description])

  const resolvedEyebrow = eyebrow

  return (
    <header className="page-header animate-entrance" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
      <div className="page-header__copy" style={{ minWidth: 0, flex: '1 1 16rem' }}>
        {breadcrumb && <div style={{ marginBottom: 'var(--space-2)' }}>{breadcrumb}</div>}
        {resolvedEyebrow && (
          <div style={{ marginBottom: 'var(--space-2)' }}>
            {typeof resolvedEyebrow === 'string' ? <span className="eyebrow-pill">{resolvedEyebrow}</span> : resolvedEyebrow}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {leading}
          {icon && (
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--r-sm)',
                display: 'grid',
                placeItems: 'center',
                background: 'var(--nav-active-bg)',
                color: 'var(--nav-active-accent)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
                flexShrink: 0,
              }}
            >
              <Icon name={icon} size={17} fill />
            </span>
          )}
          <h1
            style={{
              margin: 0,
              fontSize: 'clamp(22px, 2vw, 28px)',
              fontWeight: 600,
              color: 'var(--text)',
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
              fontFamily: 'var(--font-display, inherit)',
            }}
          >
            {title}
          </h1>
          {!ws && description && <InfoTooltip content={description} size={16} />}
          {status}
        </div>
      </div>
      {actions && (
        <div
          className="page-header__actions"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-sm)',
            flexWrap: 'wrap',
            maxWidth: '100%',
            marginLeft: 'auto',
            alignSelf: 'flex-start',
            flexShrink: 0,
          }}
        >
          {actions}
        </div>
      )}
    </header>
  )
}

/* ── buttons ───────────────────────────────────────────────────────────── */

/**
 * The app's most-imported button. 67 module files take it from here rather than
 * from `components/ui/Button`, so its height is the single largest lever on
 * **Law 15 — 44×44 on every device, desktop included.** It used to be a fixed
 * `height: 34`, which put every one of those call sites 10px under the floor at
 * every width; `minHeight` rather than `height` so a wrapped label grows the
 * button instead of overflowing it.
 */
export function Button({
  children,
  icon,
  variant = 'secondary',
  ...props
}: Omit<ButtonProps, 'icon'> & {
  children: ReactNode
  icon?: IconName | undefined
}) {
  return (
    <SharedButton
      type="button"
      size="sm"
      variant={variant}
      icon={icon ? <Icon name={icon} size={16} /> : undefined}
      {...props}
    >
      {children}
    </SharedButton>
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
  /** Law L1 — Every money tile carries its one-line definition tooltip (§9.3, §15.1) */
  definition?: string
  /** Law L2 — Every computed figure resolving to zero or less explains itself (§10.3) */
  zeroExplanation?: string
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
  // Law 13/14 — a caller's `columns` (or the `items.length` fallback) is
  // chosen for desktop width and, uncapped, squeezes every card's icon,
  // label and value into an unreadable sliver at tablet/phone widths. This
  // is the one place every KpiStrip caller renders through, so clamping
  // here fixes the squeeze everywhere at once instead of asking each of the
  // ~25 call sites to pass its own responsive column count.
  const viewport = useViewport()
  const requested = columns ?? items.length
  const cols = viewport === 'phone' ? Math.min(requested, 2) : viewport === 'tablet' ? Math.min(requested, 3) : requested
  return (
    <section
      aria-label="Key figures"
      style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 'var(--sp-md)' }}
    >
      {items.map((k) => {
        const isZero = k.value === '0' || k.value === 'Rs 0' || k.value === 'Rs. 0' || k.value === 'Rs 0.00' || k.value === '—'
        return (
          <article key={k.label} className="surface-card kpi-tile lift" style={{ ...cardStyle, padding: '13px 14px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 'var(--r-sm)',
                  background: BRAND[k.accent],
                  color: BRAND_ON[k.accent],
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon name={k.icon} size={16} fill />
              </span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  minWidth: 0,
                  flex: 1,
                }}
              >
                <span
                  className="kpi-tile__label"
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    color: 'var(--muted)',
                    minWidth: 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {k.label}
                </span>
                {k.definition && (
                  <span
                    title={k.definition}
                    aria-label={k.definition}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: 'var(--card2, rgba(0,0,0,0.06))',
                      border: '1px solid var(--border)',
                      color: 'var(--muted)',
                      fontSize: '10px',
                      fontWeight: 700,
                      cursor: 'help',
                      flexShrink: 0,
                    }}
                  >
                    i
                  </span>
                )}
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
                fontSize: k.value.length > 8 ? 'clamp(16px, 1.05vw, var(--t-kpi, 22px))' : 'clamp(16px, 1.5vw, var(--t-kpi, 22px))',
                fontWeight: 700,
                fontFamily: 'var(--font-display)',
                color: 'var(--text)',
                lineHeight: 1.15,
                letterSpacing: '-0.025em',
                whiteSpace: 'nowrap',
                // A figure longer than the card degrades to an ellipsis rather
                // than bleeding past the border.
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {k.value}
            </div>

            {(k.delta || k.note || (isZero && k.zeroExplanation)) && (
              <div style={{ marginTop: 7, fontSize: 'var(--t-meta)', display: 'flex', alignItems: 'center', gap: 'var(--sp-xs)' }}>
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
                {k.note ? (
                  <span style={{ color: 'var(--muted)' }}>{k.note}</span>
                ) : isZero && k.zeroExplanation ? (
                  <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>{k.zeroExplanation}</span>
                ) : null}
              </div>
            )}

            {k.spark && (
              <div style={{ marginTop: 'var(--sp-sm)' }}>
                <Spark points={k.spark} color={BRAND[k.accent]} />
              </div>
            )}
          </article>
        )
      })}
    </section>
  )
}

/* ── side rails ────────────────────────────────────────────────────────── */

/**
 * The right-hand summary/detail rail every deep screen carries. Collapsible —
 * the parent grid's rail track must be sized `auto` (not a fixed px) so the
 * column actually shrinks when this collapses to its handle. `width` should
 * match whatever px the track used before switching to `auto`, so the
 * expanded layout is pixel-identical to before.
 */
export function Rail({
  children,
  id,
  width = 288,
  label = 'Page summary',
}: {
  children: ReactNode
  id?: string
  width?: number
  label?: string
}) {
  return (
    <CollapsibleAside side="right" width={width} label={label} {...(id !== undefined ? { id } : {})}>
      {children}
    </CollapsibleAside>
  )
}

/**
 * `Rail` at desktop; the same children as a plain column below 1280.
 *
 * Rulings §7 (binding): *"'Right rails collapse below 1280' means **reflow**,
 * not **hide**… Do not wrap those in `CollapsibleAside`, and do not change its
 * default: other pages depend on it."* (The ruling was written against the old
 * 1180 line; v4.1 §7.7 moved it to 1280 and the rule itself is unchanged.)
 * `Rail` **is** `CollapsibleAside`, which defaults to collapsed at tablet *and*
 * phone, so any screen that renders `<Rail>` unconditionally puts its rail
 * content behind a handle on the warehouse tablet this product targets.
 *
 * The pages that got this right hand-rolled the same three lines each
 * (`Finance.tsx`, `OperationsQueues.tsx`, `Payments.tsx`). This is that shape
 * once, so a screen only has to pick the right component rather than remember
 * the rule. The parent grid still has to drop its rail track below 1280 —
 * `RailGrid` below does that half.
 */
export function ReflowRail({
  children,
  id,
  width = 288,
  label = 'Page summary',
}: {
  children: ReactNode
  id?: string
  width?: number
  label?: string
}) {
  const viewport = useViewport()
  if (viewport === 'desktop') {
    return (
      <Rail width={width} label={label} {...(id !== undefined ? { id } : {})}>
        {children}
      </Rail>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>{children}</div>
  )
}

/**
 * The other half of `ReflowRail`: the `content | rail` grid's own tracks. The
 * rail track has to disappear below 1280, or the reflowed column lands in a
 * second column that is still there and the content is squeezed anyway.
 *
 * A hook rather than a wrapper component because the screens that need it
 * already own their grid `<div>` (with their own margins, gaps and
 * `alignItems`); this changes only the one property that has to change.
 */
export function useRailGridColumns(): string {
  return useViewport() === 'desktop' ? 'minmax(0,1fr) auto' : 'minmax(0,1fr)'
}

/**
 * `KpiStrip`'s column clamp (2 at phone, 3 at tablet), for the screens that
 * hand-roll their own `<section aria-label="Key figures">` grid instead of
 * going through it. Same rule in one place rather than a magic number per page.
 */
export function useBandColumns(): (n: number) => number {
  const viewport = useViewport()
  return (n: number) => (viewport === 'phone' ? Math.min(n, 2) : viewport === 'tablet' ? Math.min(n, 3) : n)
}

/**
 * The left-hand filter/navigation rail a handful of list screens carry.
 * Same collapse mechanics as `Rail`, mirrored to the left edge.
 */
export function SideRail({
  children,
  id,
  width = 210,
  label = 'Filters',
}: {
  children: ReactNode
  id?: string
  width?: number
  label?: string
}) {
  return (
    <CollapsibleAside side="left" width={width} label={label} {...(id !== undefined ? { id } : {})}>
      {children}
    </CollapsibleAside>
  )
}

/** Label/value rows — the shape every "… Summary" card in the renders uses. */
export function SummaryRows({ rows }: { rows: Array<{ label: string; value: React.ReactNode; tone?: BrandKey }> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)' }}>
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
      className="footer-note"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-md)',
        flexWrap: 'wrap',
        padding: '11px 2px 0',
        borderTop: '1px solid var(--border)',
        marginTop: 'var(--sp-xs)',
      }}
    >
      <Icon name="info" size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
      {parts.map((p, i) => (
        <span key={p} style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 'var(--sp-md)' }}>
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

export { PageActions, type PageActionsProps } from './PageActions'
export { ScreenHeader, type ScreenHeaderProps } from './ScreenHeader'
export { OverflowMenu, type OverflowMenuItem, type OverflowMenuProps } from './OverflowMenu'
