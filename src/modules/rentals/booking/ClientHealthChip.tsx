/**
 * The two presentational carriers of `clientHealth()` — a labelled chip and the
 * eye control that doubles as the health indicator ("New Booking" spec §11).
 *
 * Both exist here rather than inside the combobox because the combobox row, the
 * field's eye button, the quick-view header and the history drawer all show the
 * same verdict, and three hand-rolled copies of "green dot + maybe a word" is
 * precisely how a colour ends up meaning two different things on one screen.
 *
 * **Never colour alone.** Neither component can be rendered as a bare coloured
 * dot: the icon (three distinct silhouettes — tick / triangle / circle-alert)
 * and the word ("Good" / "Warning" / "Attention Required") are not optional
 * props. There is no icon-only or colour-only mode, on purpose.
 */

import type { CSSProperties } from 'react'
import Icon from '../../../components/ui/Icon'
import { STATUS } from '../../../lib/status'
import type { ClientHealthVerdict } from './clientHealth'

/** CLAUDE.md: 44×44 minimum on every device, desktop included. */
export const TOUCH = 44

/* ── Chip ──────────────────────────────────────────────────────────────── */

export interface ClientHealthChipProps {
  verdict: ClientHealthVerdict
  /** `sm` for dense list rows, `md` for the quick-view header. */
  size?: 'sm' | 'md'
  /** Hover text. Defaults to the full reason list, so the *why* is one hover away. */
  title?: string
  style?: CSSProperties
}

export function ClientHealthChip({ verdict, size = 'sm', title, style }: ClientHealthChipProps) {
  const t = STATUS[verdict.tone]
  const dense = size === 'sm'
  return (
    <span
      title={title ?? verdict.summary}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: dense ? 4 : 6,
        height: dense ? 20 : 26,
        padding: dense ? '0 7px' : '0 10px',
        borderRadius: 'var(--r-badge)',
        background: t.bg,
        color: t.fg,
        ...(t.border ? { border: `1px solid ${t.border}` } : {}),
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <Icon name={verdict.icon} size={dense ? 12 : 14} fill />
      {verdict.label}
    </span>
  )
}

/* ── Reason list ───────────────────────────────────────────────────────── */

/**
 * The sentences behind the colour. §13's strict priority is preserved in the
 * order (`reasons` arrives critical-first), and each row re-states its own
 * severity with a glyph so a reason is never distinguishable by colour alone.
 */
export function ClientHealthReasons({
  verdict,
  max,
}: {
  verdict: ClientHealthVerdict
  /** Truncate to the first N and append a "+N more" line. Omit for all. */
  max?: number
}) {
  if (verdict.reasons.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        No outstanding balance, credit or reliability issues on record.
      </p>
    )
  }
  const shown = max === undefined ? verdict.reasons : verdict.reasons.slice(0, max)
  const hidden = verdict.reasons.length - shown.length
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 5 }}>
      {shown.map((r) => (
        <li
          key={r.code}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            fontSize: 'var(--t-meta)',
            color: r.severity === 'critical' ? 'var(--danger-text)' : 'var(--ready-text)',
          }}
        >
          <span style={{ display: 'inline-flex', paddingTop: 1, flexShrink: 0 }}>
            <Icon name={r.severity === 'critical' ? 'error' : 'alert_triangle'} size={13} />
          </span>
          <span style={{ minWidth: 0 }}>{r.text}</span>
        </li>
      ))}
      {hidden > 0 && (
        <li style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>+{hidden} more</li>
      )}
    </ul>
  )
}

/* ── Eye ───────────────────────────────────────────────────────────────── */

export interface ClientHealthEyeProps {
  verdict: ClientHealthVerdict
  /** Client name, so the accessible name says whose health this is. */
  clientName: string
  onClick: () => void
  /** Drives `aria-expanded` — the drawer is a disclosure, not a navigation. */
  open: boolean
  /** `id` of the panel this control discloses. */
  controls?: string
  disabled?: boolean
}

/**
 * §11 — one control, two jobs: it opens the quick view **and** it is the health
 * indicator. It must not navigate away, so it is a `<button type="button">`,
 * never a `<Link>`.
 *
 * The 44×44 minimum is met by the control's own height and padding rather than
 * by inflating the glyph — the eye stays 18px, the hit area is the button.
 */
export function ClientHealthEye({
  verdict,
  clientName,
  onClick,
  open,
  controls,
  disabled = false,
}: ClientHealthEyeProps) {
  const t = STATUS[verdict.tone]
  return (
    <button
      type="button"
      className="press"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={open}
      {...(controls ? { 'aria-controls': controls } : {})}
      aria-label={`Client health quick view for ${clientName}. ${verdict.summary}`}
      title={verdict.summary}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minHeight: TOUCH,
        minWidth: TOUCH,
        padding: '0 12px',
        borderRadius: 'var(--r-btn)',
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border ?? 'transparent'}`,
        fontFamily: 'inherit',
        fontSize: 'var(--t-meta)',
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Icon name="eye" size={18} />
      <Icon name={verdict.icon} size={14} fill />
      {/* The word travels with the colour — this label is not optional. */}
      <span>{verdict.label}</span>
    </button>
  )
}
