/**
 * SmartHoverShell — one shared card frame for every entity (§3, §5).
 *
 * Sticky header + sticky tabs + scrollable body + sticky footer.
 * Desktop hover card (360 / 380 large) and mobile bottom sheet (≤70vh)
 * share this frame so the information architecture never forks (§10, §17).
 *
 * Babin tokens only. Radius 14 per spec §4. Animation is opacity +
 * scale .985 over ≤150ms (§85) — no bounce, no spring overshoot on
 * frequent table interactions. Blur lives on the fixed sheet backdrop
 * only, never on scrolling content.
 */

import { type CSSProperties, type ReactNode } from 'react'
import { HOVER_DIMS, HOVER_TIMING } from '../../lib/smartHover'

interface ShellProps {
  labelledBy: string
  large?: boolean
  sheet?: boolean
  header: ReactNode
  tabs?: ReactNode
  footer: ReactNode
  children: ReactNode
  onClose: () => void
}

const frame: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--surface-card, var(--card))',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: `${HOVER_DIMS.radius}px`,
  boxShadow: 'var(--shadow-modal)',
  overflow: 'hidden',
  animation: `smart-hover-in ${HOVER_TIMING.animMs}ms cubic-bezier(0.16, 1, 0.3, 1)`,
}

export function SmartHoverShell({ labelledBy, large = false, sheet = false, header, tabs, footer, children, onClose }: ShellProps) {
  const width = large === true ? HOVER_DIMS.widthLarge : HOVER_DIMS.width
  const style: CSSProperties = sheet
    ? {
        ...frame,
        width: 'min(100vw - 32px, 480px)',
        maxHeight: '70vh',
        borderRadius: '16px 16px 0 0',
      }
    : {
        ...frame,
        width: `${width}px`,
        minWidth: `${HOVER_DIMS.minWidth}px`,
        maxWidth: `min(${HOVER_DIMS.maxWidth}px, calc(100vw - 32px))`,
        maxHeight: `min(${HOVER_DIMS.maxHeight}px, calc(100vh - 32px))`,
      }

  return (
    <div role="dialog" aria-modal={sheet} aria-labelledby={labelledBy} data-testid="smart-hover-card" style={style}>
      <style>{`@keyframes smart-hover-in { from { opacity: 0; transform: scale(0.985); } to { opacity: 1; transform: scale(1); } }`}</style>
      <div style={{ flex: '0 0 auto', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
        {sheet ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }} aria-hidden="true">
            <span style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--border2)' }} />
          </div>
        ) : null}
        {header}
        {tabs}
      </div>
      <div style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0, padding: '12px 14px' }}>{children}</div>
      <div style={{ flex: '0 0 auto', borderTop: '1px solid var(--border)', padding: '10px 12px', background: 'var(--card)' }}>
        {footer}
        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          <button type="button" onClick={onClose} aria-label="Close preview (Esc)" tabIndex={-1} />
        </span>
      </div>
    </div>
  )
}

export function SmartHoverTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: ReadonlyArray<{ id: string; label: string; count?: number }>
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div role="tablist" aria-label="Preview sections" style={{ display: 'flex', gap: 2, padding: '0 8px 8px', overflowX: 'auto' }}>
      {tabs.map((t) => {
        const selected = t.id === active
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.id)}
            style={{
              minHeight: 'var(--tap)',
              padding: '8px 10px',
              border: 'none',
              borderBottom: selected ? '2px solid var(--primary)' : '2px solid transparent',
              background: 'transparent',
              color: selected ? 'var(--text)' : 'var(--muted)',
              fontFamily: 'var(--font-display)',
              fontSize: '12px',
              fontWeight: selected ? 700 : 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
            {typeof t.count === 'number' ? <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}> ({t.count})</span> : null}
          </button>
        )
      })}
    </div>
  )
}

export function SmartHoverFooter({
  primary,
  secondary,
  overflow,
}: {
  primary: ReactNode | null
  secondary: ReactNode | null
  overflow: ReactNode | null
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {primary}
      {secondary}
      <span style={{ flex: 1 }} />
      {overflow}
    </div>
  )
}

export function HoverActionButton({
  label,
  icon,
  primary = false,
  onAction,
}: {
  label: string
  icon?: ReactNode
  primary?: boolean
  onAction: () => void
}) {
  return (
    <button
      type="button"
      onClick={onAction}
      data-primary-verb={primary ? true : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 'var(--tap)',
        padding: '10px 14px',
        borderRadius: 999,
        border: primary ? 'none' : '1px solid var(--btn-secondary-border)',
        background: primary ? 'var(--btn-primary-bg)' : 'var(--btn-secondary-bg)',
        color: primary ? 'var(--btn-primary-fg)' : 'var(--text)',
        fontFamily: 'var(--font-display)',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      <span>{label}</span>
      {icon ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: primary ? 'rgba(255,255,255,0.18)' : 'var(--w08)',
          }}
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
    </button>
  )
}
