import React, { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react'
import Icon from '../../../components/ui/Icon'
import type { IconName } from '../../../components/ui/Icon'
import { cardStyle } from '../../../components/ui/Page'

/**
 * A transparent 44×44 hit area centred on a control that is visually smaller.
 * The touch minimum applies on desktop too, and inflating a table's remove
 * glyph or a section chevron to 44px tall would wreck density — so the *target*
 * grows and the glyph does not. The parent must be `position: relative`.
 */
export function TouchInset() {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'max(100%, var(--tap))',
        height: 'var(--tap)',
      }}
    />
  )
}

/**
 * Common input styling conforming to Law 15 touch minimums and theme tokens.
 */
export const inputStyle = {
  width: '100%',
  minHeight: 'var(--tap)',
  padding: '0 9px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
} as const

/**
 * Off-screen but in the accessibility tree — no global `.sr-only` exists in this build.
 */
export const srOnly = {
  position: 'absolute' as const,
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap' as const,
  border: 0,
}

/**
 * redesign v1 §7.4 — qty and days as steppers rather than boxed number
 * inputs, so the equipment table reads as a table again instead of a form
 * embedded in one. Each glyph button keeps the 44×44 hit area via
 * `TouchInset` while staying visually compact for table density.
 */
export function NumberStepper({
  value,
  min = 1,
  onChange,
  disabled,
  label,
}: {
  value: number
  min?: number
  onChange: (n: number) => void
  disabled?: boolean
  label: string
}) {
  const isMin = value <= min
  return (
    <div className="new-rental-stepper-pill">
      <button
        type="button"
        className="press new-rental-stepper-btn"
        aria-label={`Decrease ${label}`}
        disabled={disabled || isMin}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <TouchInset />
        <Icon name="minus" size={11} />
      </button>
      <span className="figure new-rental-stepper-val" style={{ color: disabled ? 'var(--muted)' : 'var(--text)' }}>
        {value}
      </span>
      <button
        type="button"
        className="press new-rental-stepper-btn"
        aria-label={`Increase ${label}`}
        disabled={disabled}
        onClick={() => onChange(value + 1)}
      >
        <TouchInset />
        <Icon name="plus" size={11} />
      </button>
    </div>
  )
}

export function Field({
  label,
  children,
  error,
  helper,
  labelId,
  id,
}: {
  label: string
  children: React.ReactNode
  /** When set, renders below children in the danger tone. Field can't reach into
   *  arbitrary children to stamp aria-invalid/aria-describedby on the input itself
   *  (children are caller-supplied), so callers that want full a11y wiring should
   *  point their input's aria-describedby at this span's id themselves.
   *  `| undefined` is explicit because tsconfig sets exactOptionalPropertyTypes:
   *  callers pass ternaries like `cond ? '...' : undefined`. */
  error?: string | undefined
  /** Muted helper text shown below children when there is no error. */
  helper?: string | undefined
  /**
   * When set the wrapper becomes a `<div>` with an `id`-carrying label span
   * instead of a `<label>`. A `<label>` around a composite widget (the client
   * combobox is an input *plus* a listbox *plus* the health eye) steals clicks
   * meant for the eye, so those callers wire `aria-labelledby` instead.
   */
  labelId?: string | undefined
  id?: string | undefined
}) {
  const generatedId = useId()
  const fieldId = id || `field-${generatedId}`
  const errorId = error ? `field-error-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined

  const childElem = isValidElement<Record<string, unknown>>(children) ? children : null
  const enhancedChildren = childElem
    ? cloneElement(childElem, {
        id: (childElem.props['id'] as string | undefined) || fieldId,
        'aria-label': (childElem.props['aria-label'] as string | undefined) || label,
      })
    : children

  const body = (
    <>
      <span id={labelId} style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--muted)', marginBottom: 3 }}>{label}</span>
      {enhancedChildren}
      {error ? (
        <span id={errorId} role="alert" style={{ display: 'block', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--danger-text)', marginTop: 3 }}>
          {error}
        </span>
      ) : helper ? (
        <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)', marginTop: 3 }}>{helper}</span>
      ) : null}
    </>
  )
  if (labelId) return <div style={{ display: 'block', minWidth: 0 }}>{body}</div>
  return <label htmlFor={fieldId} style={{ display: 'block', minWidth: 0 }}>{body}</label>
}

/**
 * §59 — the section header. All sections render through this one
 * component; there is no second heading style anywhere on the page, which is
 * what stops Section 4 slowly drifting away from Section 1.
 *
 * redesign v1 §7.1 — plain heading and its collapse chevron only, no numbered
 * pill. A numbered circle reads as step one of a wizard, and the footer says
 * explicitly "Sections are not a wizard" — the pills contradicted the note.
 */
export function Section({
  id,
  title,
  open,
  onToggle,
  action,
  summary,
  badge,
  children,
}: {
  /** Scroll target for the rail's Review card — see `jumpToSection`. */
  id?: string
  title: string
  open: boolean
  onToggle: () => void
  action?: React.ReactNode
  /** Shown in the header when collapsed, so collapsing never hides the facts. */
  summary?: string
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id} className={`new-rental-section-card ${open ? 'is-active' : ''}`} style={{ ...cardStyle, minWidth: 0, padding: 0 }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`Toggle ${title} section`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          background: 'var(--surface)',
          cursor: 'pointer',
          userSelect: 'none',
          minHeight: 48,
          transition: 'background var(--dur-fast) var(--ease)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
          {title}
        </h2>
        {badge}
        {!open && summary && (
          <span
            style={{
              fontSize: 'var(--t-meta)',
              color: 'var(--text2)',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              background: 'var(--surface)',
              padding: '2px 8px',
              borderRadius: 'var(--r-xs)',
              marginLeft: 4,
              border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
            }}
          >
            {summary}
          </span>
        )}
        {open && action && (
          <span
            onClick={(e) => e.stopPropagation()}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
          >
            {action}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
          style={srOnly}
        >
          {open ? 'Collapse' : 'Expand'} {title}
        </button>
      </div>
      <div hidden={!open} style={{ padding: 'var(--sp-md) var(--sp-lg)' }}>{children}</div>
    </section>
  )
}

/** §37 / §52 — a money row. Label left, figure right, aligned on the same right edge everywhere. */
export function MoneyRow({
  label,
  value,
  tone,
  strong,
  big,
}: {
  label: string
  value: string
  tone?: string
  strong?: boolean
  big?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, padding: big ? '6px 0 2px' : '3px 0' }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: big ? 'var(--t-meta)' : 'var(--t-meta)', fontWeight: big ? 700 : 400, color: big ? 'var(--text)' : 'var(--text2)' }}>{label}</span>
      <span
        className="figure"
        style={{
          fontSize: big ? 'var(--t-h3)' : 'var(--t-meta)',
          fontWeight: big || strong ? 700 : 600,
          letterSpacing: big ? '-0.02em' : undefined,
          color: tone ?? 'var(--text)',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * The `⋮` menu on parent rows.
 */
export function RowMenu({
  label,
  items,
}: {
  label: string
  items: Array<{ label: string; icon: IconName; onClick: () => void }>
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node | null)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="press"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        style={{ position: 'relative', width: 26, height: 26, display: 'grid', placeItems: 'center', borderRadius: 'var(--r-xs)', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
      >
        <TouchInset />
        <Icon name="more_vert" size={15} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          style={{ position: 'absolute', zIndex: 40, top: 'calc(100% + 4px)', right: 0, minWidth: 210, padding: 5, background: 'var(--dropdown)', border: '1px solid var(--border)', borderRadius: 'var(--r-card)', boxShadow: 'var(--shadow-modal)' }}
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className="press"
              onClick={() => {
                it.onClick()
                setOpen(false)
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)', width: '100%', minHeight: 44, padding: '0 9px', borderRadius: 'var(--r-btn)', border: 'none', background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: 'var(--t-meta)', fontWeight: 600, textAlign: 'left', cursor: 'pointer' }}
            >
              <Icon name={it.icon} size={15} style={{ color: 'var(--text2)' }} />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The add-client control, living inside the client field's trailing slot.
 */
export function AddClientButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="press"
      onClick={onClick}
      aria-label="Add a new client"
      title="Add a new client"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 'var(--tap)',
        height: 'var(--tap)',
        minWidth: 'var(--tap)',
        minHeight: 'var(--tap)',
        flexShrink: 0,
        padding: 0,
        borderRadius: 'var(--r-btn)',
        background: 'var(--btn-secondary-bg)',
        color: 'var(--text)',
        border: '1px solid var(--btn-secondary-border)',
        lineHeight: 1,
        cursor: 'pointer',
      }}
    >
      <Icon name="plus" size={20} />
    </button>
  )
}
