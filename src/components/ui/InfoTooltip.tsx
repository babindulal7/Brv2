import { useState, useRef, useEffect, useCallback, type ReactNode, type CSSProperties } from 'react'
import Icon from './Icon'

export interface InfoTooltipProps {
  /** The informational text or markup to display inside the tooltip popover. */
  content: ReactNode
  /** Accessible label for the icon trigger (screen reader text). Defaults to 'More info'. */
  label?: string
  /** Size of the info icon glyph in px. Default is 14. */
  size?: number
  /** Additional styling for the trigger wrapper. */
  style?: CSSProperties
}

/**
 * Standard InfoTooltip component.
 * Renders an accessible (i) icon that reveals extra details / explanatory notes
 * on hover, focus, or tap, keeping the primary UI uncluttered.
 */
export function InfoTooltip({ content, label = 'More info', size = 14, style }: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; placeAbove: boolean }>({ top: 0, left: 0, placeAbove: true })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const placeAbove = rect.top > 120 // place above unless too close to viewport top

    // Center horizontally on trigger, bounded within screen
    const tooltipWidth = Math.min(280, viewportWidth - 32)
    let left = rect.left + rect.width / 2 - tooltipWidth / 2
    if (left < 16) left = 16
    if (left + tooltipWidth > viewportWidth - 16) left = viewportWidth - 16 - tooltipWidth

    const top = placeAbove ? rect.top - 8 : rect.bottom + 8
    setCoords({ top, left, placeAbove })
  }, [])

  const handleOpen = () => {
    updatePosition()
    setIsOpen(true)
  }

  const handleClose = () => {
    setIsOpen(false)
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isOpen) {
      updatePosition()
    }
    setIsOpen((prev) => !prev)
  }

  // Handle click outside and Escape key
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    const handleScrollOrResize = () => {
      updatePosition()
    }

    document.addEventListener('mousedown', handleClickOutside, true)
    document.addEventListener('touchstart', handleClickOutside, true)
    document.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize, true)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true)
      document.removeEventListener('touchstart', handleClickOutside, true)
      document.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize, true)
    }
  }, [isOpen, updatePosition])

  if (!content) return null

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
        position: 'relative',
        marginLeft: 4,
        ...style,
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={isOpen}
        onClick={handleToggle}
        onMouseEnter={handleOpen}
        onMouseLeave={handleClose}
        onFocus={handleOpen}
        onBlur={handleClose}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 2,
          margin: 0,
          background: isOpen ? 'var(--st-neutral-bg, rgba(255,255,255,0.08))' : 'transparent',
          border: 'none',
          borderRadius: '50%',
          color: isOpen ? 'var(--primary, #3b82f6)' : 'var(--muted, #94a3b8)',
          cursor: 'pointer',
          lineHeight: 1,
          transition: 'color 0.15s ease, background 0.15s ease',
          outline: 'none',
        }}
      >
        <Icon name="info" size={size} />
      </button>

      {isOpen && (
        <div
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            transform: coords.placeAbove ? 'translateY(-100%)' : 'none',
            maxWidth: 280,
            width: 'max-content',
            padding: '8px 12px',
            borderRadius: 'var(--r-sm, 6px)',
            background: 'var(--card, #1c222b)',
            border: '1px solid var(--border2, #333d4b)',
            boxShadow: 'var(--shadow-modal, 0 10px 25px -5px rgba(0, 0, 0, 0.4))',
            color: 'var(--text, #f1f5f9)',
            fontSize: 'var(--t-meta, 12px)',
            fontWeight: 400,
            lineHeight: 1.45,
            zIndex: 9999,
            pointerEvents: 'auto',
            wordBreak: 'break-word',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          {content}
        </div>
      )}
    </span>
  )
}

export default InfoTooltip
