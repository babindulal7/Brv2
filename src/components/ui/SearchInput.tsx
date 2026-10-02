import { forwardRef, useEffect, useId, useRef } from 'react'
import type { InputHTMLAttributes, CSSProperties } from 'react'
import Icon from './Icon'

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: string
  onChange: (value: string) => void
  onClear?: () => void
  onSearchSubmit?: (value: string) => void
  placeholder?: string
  shortcutHint?: string
  autoFocusShortcut?: boolean
  wrapperStyle?: CSSProperties
  clearAriaLabel?: string
}

/**
 * Standardized SearchInput primitive for Babin Rentals OS.
 * Guarantees Law 15 (44px touch targets), consistent search iconography (size 15),
 * accessible clear button (44×44px hit target + Escape key support), and protected
 * padding insets so search text never collides with icons.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  {
    value,
    onChange,
    onClear,
    onSearchSubmit,
    placeholder = 'Search…',
    shortcutHint,
    autoFocusShortcut = false,
    wrapperStyle,
    clearAriaLabel,
    className,
    style,
    id,
    disabled,
    readOnly,
    onKeyDown,
    'aria-label': ariaLabel,
    ...props
  },
  forwardedRef
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const internalRef = useRef<HTMLInputElement | null>(null)

  const setRefs = (element: HTMLInputElement | null) => {
    internalRef.current = element
    if (typeof forwardedRef === 'function') {
      forwardedRef(element)
    } else if (forwardedRef) {
      forwardedRef.current = element
    }
  }

  // Optional global '/' shortcut to focus search when not typing in another input
  useEffect(() => {
    if (!autoFocusShortcut || disabled || readOnly) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null
      if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return
      if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return
      // A page shortcut must not pull focus out of an open modal workflow.
      const dialog = document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')
      if (dialog && !dialog.contains(internalRef.current)) return
      if (e.key === '/') {
        e.preventDefault()
        internalRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [autoFocusShortcut, disabled, readOnly])

  const handleClear = () => {
    if (disabled || readOnly) return
    if (onClear) {
      onClear()
    } else {
      onChange('')
    }
    internalRef.current?.focus()
  }

  const showClear = Boolean(!disabled && !readOnly && value)
  const showHint = Boolean(!showClear && shortcutHint)

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        minWidth: 0,
        ...wrapperStyle,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 12,
          display: 'grid',
          placeItems: 'center',
          pointerEvents: 'none',
          color: 'var(--muted)',
          flexShrink: 0,
          zIndex: 1,
        }}
      >
        <Icon name="search" size={15} />
      </span>

      <input
        id={inputId}
        ref={setRefs}
        type="search"
        role="searchbox"
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className={['ui-input', className].filter(Boolean).join(' ')}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault()
            e.stopPropagation()
            handleClear()
          } else if (e.key === 'Enter' && onSearchSubmit) {
            e.preventDefault()
            onSearchSubmit(value)
          }
          onKeyDown?.(e)
        }}
        style={{
          width: '100%',
          height: 44,
          padding: '0 14px',
          fontSize: 'var(--t-ui)',
          borderRadius: 'var(--r-input)',
          background: 'var(--input-bg)',
          border: '1px solid var(--input-border)',
          color: 'var(--text)',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          outline: 'none',
          transition: 'border-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease)',
          ...style,
          // Re-assert structural invariants so spread styles cannot break touch target or clearance
          minHeight: 44,
          paddingLeft: 38,
          paddingRight: showClear ? 44 : showHint ? 44 : 14,
        }}
        {...props}
      />

      {showClear ? (
        <button
          type="button"
          onClick={handleClear}
          aria-label={clearAriaLabel ?? 'Clear search'}
          title="Clear search"
          style={{
            position: 'absolute',
            right: 0,
            width: 44, // Law 15 — 44px hit target
            height: 44,
            minWidth: 44,
            minHeight: 44,
            display: 'grid',
            placeItems: 'center',
            background: 'transparent',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            padding: 0,
            borderRadius: 'var(--r-input)',
            zIndex: 1,
          }}
        >
          <Icon name="close" size={15} />
        </button>
      ) : showHint ? (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: 12,
            display: 'inline-flex',
            alignItems: 'center',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <kbd
            className="figure"
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--muted)',
              padding: '2px 6px',
              borderRadius: 'var(--r-xs)',
              background: 'var(--card2)',
              border: '1px solid var(--border)',
            }}
          >
            {shortcutHint}
          </kbd>
        </span>
      ) : null}
    </div>
  )
})

SearchInput.displayName = 'SearchInput'
