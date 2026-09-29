import React, { forwardRef, useState, useRef, useEffect, useId, useCallback, ReactNode, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import { InfoTooltip } from './InfoTooltip'

export interface SelectOption {
  value: string
  label: ReactNode
  disabled?: boolean
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'options'> {
  label?: string
  error?: string | null
  helperText?: string
  info?: ReactNode
  options?: SelectOption[]
  icon?: React.ReactNode
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, info, options, icon, children, className, style, id, value, defaultValue, onChange, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)
    const reactId = useId()
    /* Stable ids for the ARIA wiring. The native select keeps `selectId`
       untouched (tests and any getElementById callers depend on it); the
       trigger and listbox derive their own. */
    const baseId = selectId ?? `select-${reactId}`
    const triggerId = `${baseId}-trigger`
    const labelId = `${baseId}-label`
    const listboxId = `${baseId}-listbox`
    const optionId = (i: number) => `${baseId}-opt-${i}`

    const [isOpen, setIsOpen] = useState(false)
    const [highlight, setHighlight] = useState(-1)
    const containerRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const nativeSelectRef = useRef<HTMLSelectElement>(null)
    const listboxRef = useRef<HTMLDivElement>(null)
    /* Floating position of the portaled listbox. Measured from the trigger
       when the menu opens and re-measured on scroll/resize so it tracks. */
    const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
    const typeahead = useRef({ query: '', at: 0 })

    // Forward ref manually so we can still use the local ref if needed
    useImperativeHandle(ref, () => nativeSelectRef.current as HTMLSelectElement)

    // Parse options from children if `options` is not provided
    const parsedOptions: SelectOption[] = options || React.Children.toArray(children).map(child => {
      if (React.isValidElement(child) && child.type === 'option') {
        /* RULING 2026-09-23 (visual pass): bare `<option>Label</option>` children
           carried no `value`, so the native shadow select mounted them with
           `key={undefined}` — React's unique-key warning on every screen — and
           the trigger's open-value comparison read undefined. A bare option's
           value is its text content (that's how a native select answers it),
           so the parse does exactly that. */
        return {
          value: child.props.value ?? String(child.props.children),
          label: child.props.children,
          disabled: child.props.disabled
        }
      }
      return null
    }).filter(Boolean) as SelectOption[]

    // Controlled vs uncontrolled state for internal tracking
    const [internalValue, setInternalValue] = useState<string | number | readonly string[] | undefined>(value ?? defaultValue)
    const activeValue = value !== undefined ? value : internalValue

    const selectedIndex = parsedOptions.findIndex(o => String(o.value) === String(activeValue))
    const selectedOption = selectedIndex >= 0 ? parsedOptions[selectedIndex] : undefined
    const displayLabel = selectedOption ? selectedOption.label : (activeValue || '')

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node
        // The open listbox is portaled to document.body — a pointer inside
        // it is logically inside, even though it is outside `containerRef`.
        if (listboxRef.current?.contains(target)) return
        if (containerRef.current && !containerRef.current.contains(target)) {
          setIsOpen(false)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    /* Keep the keyboard highlight visible as it moves through a long list. */
    useEffect(() => {
      if (!isOpen || highlight < 0) return
      document.getElementById(optionId(highlight))?.scrollIntoView({ block: 'nearest' })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, highlight])

    /* Measures the trigger and places the floating listbox: below it when
       there is room, above it when the viewport bottom is tight. */
    const measureMenu = useCallback(() => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const MENU_GAP = 6
      const MENU_MAX = 300
      const roomBelow = window.innerHeight - r.bottom - MENU_GAP - 8
      const roomAbove = r.top - MENU_GAP - 8
      const openUp = roomBelow < 160 && roomAbove > roomBelow
      setMenuPos(
        openUp
          ? { top: Math.max(8, r.top - MENU_GAP - Math.min(MENU_MAX, roomAbove)), left: r.left, width: r.width, maxHeight: Math.min(MENU_MAX, Math.max(120, roomAbove)) }
          : { top: r.bottom + MENU_GAP, left: r.left, width: r.width, maxHeight: MENU_MAX },
      )
    }, [])

    /* Re-track the trigger while open so scrolling never detaches the menu. */
    useEffect(() => {
      if (!isOpen) return
      window.addEventListener('scroll', measureMenu, true)
      window.addEventListener('resize', measureMenu)
      return () => {
        window.removeEventListener('scroll', measureMenu, true)
        window.removeEventListener('resize', measureMenu)
      }
    }, [isOpen, measureMenu])

    const openMenu = () => {
      if (props.disabled) return
      setHighlight(selectedIndex >= 0 ? selectedIndex : nextEnabled(-1, 1))
      measureMenu()
      setIsOpen(true)
    }

    const closeMenu = () => {
      setIsOpen(false)
      setHighlight(-1)
    }

    /* First enabled index walking from `from` in `dir` (1 or -1); -1 if none. */
    const nextEnabled = (from: number, dir: 1 | -1): number => {
      for (let i = from + dir; i >= 0 && i < parsedOptions.length; i += dir) {
        const o = parsedOptions[i]
        if (o && !o.disabled) return i
      }
      return -1
    }

    const handleSelect = (val: string) => {
      if (value === undefined) {
        setInternalValue(val)
      }
      closeMenu()

      // Trigger native select change event so React hook form / standard onChange handlers work properly
      if (nativeSelectRef.current) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set
        nativeInputValueSetter?.call(nativeSelectRef.current, val)
        const event = new Event('change', { bubbles: true })
        nativeSelectRef.current.dispatchEvent(event)
      }
      if (onChange) {
        // Fallback synthetic event just in case
        onChange({
          target: { value: val },
          currentTarget: { value: val }
        } as React.ChangeEvent<HTMLSelectElement>)
      }
    }

    /* Single-character typeahead: successive keystrokes within a second build
       a prefix; only string labels participate (ReactNode labels can't). */
    const handleTypeahead = (char: string) => {
      const now = Date.now()
      const t = typeahead.current
      t.query = now - t.at > 1000 ? char : t.query + char
      t.at = now
      const q = t.query.toLowerCase()
      const start = isOpen && highlight >= 0 ? highlight : selectedIndex
      const n = parsedOptions.length
      for (let step = 1; step <= n; step += 1) {
        const i = (start + step + n) % n
        const opt = parsedOptions[i]
        if (!opt || opt.disabled || typeof opt.label !== 'string') continue
        if (opt.label.toLowerCase().startsWith(q)) {
          if (isOpen) setHighlight(i)
          else handleSelect(opt.value)
          return
        }
      }
    }

    const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (props.disabled) return
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openMenu()
          return
        }
        if (e.key.length === 1 && !e.altKey && !e.ctrlKey && !e.metaKey) {
          handleTypeahead(e.key)
        }
        return
      }
      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          /* The dropdown consumes its own Escape. Without this, Modal's
             window-level listener also fired and closed the surrounding form. */
          e.stopPropagation()
          closeMenu()
          return
        case 'ArrowDown': {
          e.preventDefault()
          const next = nextEnabled(highlight, 1)
          if (next !== -1) setHighlight(next)
          return
        }
        case 'ArrowUp': {
          e.preventDefault()
          const prev = nextEnabled(highlight, -1)
          if (prev !== -1) setHighlight(prev)
          return
        }
        case 'Home': {
          e.preventDefault()
          const first = nextEnabled(-1, 1)
          if (first !== -1) setHighlight(first)
          return
        }
        case 'End': {
          e.preventDefault()
          const last = nextEnabled(parsedOptions.length, -1)
          if (last !== -1) setHighlight(last)
          return
        }
        case 'Enter':
        case ' ': {
          e.preventDefault()
          const chosen = highlight >= 0 ? parsedOptions[highlight] : undefined
          if (chosen && !chosen.disabled) {
            handleSelect(chosen.value)
          } else {
            closeMenu()
          }
          return
        }
        case 'Tab':
          // Tab commits nothing and moves on — close so the popup doesn't
          // linger over whatever gets focus next.
          closeMenu()
          return
        default:
          if (e.key.length === 1 && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            handleTypeahead(e.key)
          }
      }
    }
    return (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {label && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <label
              id={labelId}
              /* Points at the TRIGGER now, not the invisible native select —
                 clicking the label focuses the control a user can actually see. */
              htmlFor={triggerId}
              style={{
                fontSize: 'var(--t-th)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--muted)',
              }}
            >
              {label}
              {props.required && <span style={{ color: 'var(--danger-text)', marginLeft: 'var(--sp-xs)' }}>*</span>}
            </label>
            {info && <InfoTooltip content={info} />}
          </div>
        )}

        <div ref={containerRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>

          {/* Hidden native select — the form/test bridge. Out of the tab order
              and the accessibility tree; the trigger below is the control. */}
          <select
            id={selectId}
            ref={nativeSelectRef}
            value={activeValue}
            onChange={onChange}
            tabIndex={-1}
            aria-hidden="true"
            style={{ opacity: 0, position: 'absolute', pointerEvents: 'none', width: 0, height: 0, zIndex: -1 }}
            {...props}
          >
            {parsedOptions.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {typeof opt.label === 'string' || typeof opt.label === 'number' ? opt.label : opt.value}
              </option>
            ))}
          </select>

          {icon && (
            <div
              style={{
                position: 'absolute',
                left: 12,
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'none',
                color: 'var(--muted)',
                zIndex: 2,
              }}
            >
              {icon}
            </div>
          )}

          {/* Trigger button */}
          <button
            id={triggerId}
            ref={triggerRef}
            type="button"
            className={className}
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-controls={isOpen ? listboxId : undefined}
            aria-activedescendant={isOpen && highlight >= 0 ? optionId(highlight) : undefined}
            /* Label + own content, so a screen reader hears "Payment method,
               Cash, combobox" rather than the label alone. */
            aria-labelledby={label ? `${labelId} ${triggerId}` : undefined}
            aria-invalid={error ? true : undefined}
            onClick={() => {
              if (props.disabled) return
              if (isOpen) closeMenu()
              else openMenu()
            }}
            onKeyDown={handleTriggerKeyDown}
            style={{
              width: '100%',
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 14px',
              paddingLeft: icon ? 38 : 14,
              paddingRight: 38,
              fontSize: 'var(--t-body)',
              borderRadius: 'var(--r-input)',
              background: 'var(--input-bg)',
              border: '1px solid',
              borderColor: error ? 'var(--danger)' : isOpen ? 'var(--input-focus)' : 'var(--input-border)',
              color: activeValue !== undefined && activeValue !== '' ? 'var(--text)' : 'var(--muted)',
              transition: 'border-color 0.15s ease',
              cursor: props.disabled ? 'not-allowed' : 'pointer',
              opacity: props.disabled ? 0.5 : 1,
              ...style,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayLabel || (props.placeholder ? props.placeholder : 'Select...')}
            </span>
            <div
              style={{
                position: 'absolute',
                right: 12,
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'none',
                color: 'var(--muted)',
                transform: isOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s ease',
              }}
            >
              <Icon name="chevron_down" size={16} />
            </div>
          </button>

          {/* Dropdown Menu — portaled to document.body so table scroll
              containers, drawers and modals can never clip it. Position is
              measured from the trigger (see measureMenu). */}
          {isOpen && menuPos && createPortal(
            <div
              id={listboxId}
              ref={listboxRef}
              role="listbox"
              aria-labelledby={label ? labelId : undefined}
              style={{
                position: 'fixed',
                top: menuPos.top,
                left: menuPos.left,
                width: menuPos.width,
                zIndex: 'var(--z-dropdown)',
                maxHeight: menuPos.maxHeight,
                overflowY: 'auto',
                background: 'var(--dropdown)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid var(--border2)',
                borderRadius: 'var(--r-card)',
                boxShadow: 'var(--shadow-xl)',
                padding: '6px',
                animation: 'modal-scale-in 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {parsedOptions.map((opt, i) => {
                const isSelected = String(activeValue) === String(opt.value)
                const isHighlighted = i === highlight
                return (
                  /* role="option", not <button>: focus never leaves the trigger
                     (select-only combobox pattern), the highlight travels via
                     aria-activedescendant instead. */
                  <div
                    key={opt.value}
                    id={optionId(i)}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled || undefined}
                    onClick={() => {
                      if (!opt.disabled) handleSelect(opt.value)
                    }}
                    onMouseEnter={() => {
                      if (!opt.disabled) setHighlight(i)
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 12px',
                      fontSize: 'var(--t-body)',
                      background: isSelected
                        ? 'var(--st-primary-bg)'
                        : isHighlighted
                          ? 'var(--surface-card-hover)' // RULING 2026-09-23: --st-hover never existed; its rgba(0,0,0,.05) fallback is invisible on the dark theme
                          : 'transparent',
                      color: isSelected ? 'var(--st-primary-fg)' : opt.disabled ? 'var(--muted)' : 'var(--text)',
                      borderRadius: 'var(--r-xs)',
                      border: 'none',
                      cursor: opt.disabled ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background 0.1s ease',
                    }}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Icon name="check" size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
                  </div>
                )
              })}
              {parsedOptions.length === 0 && (
                <div style={{ padding: '12px', color: 'var(--muted)', fontSize: 'var(--t-meta)', textAlign: 'center' }}>
                  No options
                </div>
              )}
            </div>,
            document.body,
          )}
        </div>

        {error ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 'var(--t-meta)',
              color: 'var(--danger-text)',
            }}
          >
            <Icon name="error" size={14} />
            <span>{error}</span>
          </div>
        ) : helperText ? (
          <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{helperText}</span>
        ) : null}
      </div>
    )
  }
)

Select.displayName = 'Select'
