import { useEffect, useRef, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { useCapability } from '../../lib/device'

const LONG_PRESS_MS = 500
const AUTO_DISMISS_MS = 2600

/**
 * **The disabled-control reason** — "grey it out, but say why" — used across
 * every deep screen. Fourteen files each carried their own copy of this before
 * this file existed, one more of the drifts §11 exists to prevent.
 *
 * `DEVICE/DEVICES.md` §7 build order item 4: "long-press wherever hover
 * carries information, gated on `!hasHover`." A `title` attribute is the
 * reason on a hover device, but it never fires on touch — there is no gesture
 * that reveals it, so a Warehouse tablet tapping a greyed-out button today
 * gets no explanation at all. Below `!hasHover`, a long-press (500ms hold)
 * shows the same reason in a small popover instead, auto-dismissed after a
 * few seconds so nothing gets stuck open.
 *
 * `IntelCard.tsx`'s Glance popover later generalized this exact pattern and,
 * in doing so, hardened three edges this file hadn't closed yet — folded back
 * in here rather than left to drift a second time:
 *  - a drag/scroll cancels an in-progress press (`onTouchMove`), so a page
 *    scroll that starts on a disabled control doesn't pop the reason open;
 *  - a completed long-press also emits a synthetic click on lift; unswallowed
 *    it can fall through to a clickable ancestor (a row that navigates/expands)
 *    the instant the popover opens — the exact defect SCREENS.md logs. A
 *    `suppress` ref + `onClick` guards it here too, defensively, even though
 *    today's children are disabled buttons or inert text;
 *  - Escape and an outside tap dismiss explicitly, and Enter/Space re-summon
 *    the popover on demand — useful once the auto-dismiss timer has fired but
 *    focus never left the control.
 */
export function Unavailable({
  reason,
  children,
  style,
}: {
  reason: string
  children: ReactNode
  style?: CSSProperties
}) {
  const { hasHover } = useCapability()
  const [show, setShow] = useState(false)
  const pressTimer = useRef<number | null>(null)
  const dismissTimer = useRef<number | null>(null)
  const suppress = useRef(false)
  const wrapperRef = useRef<HTMLSpanElement>(null)

  const clearTimers = () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current)
    if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current)
    pressTimer.current = null
    dismissTimer.current = null
  }

  const reveal = () => {
    if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current)
    setShow(true)
    dismissTimer.current = window.setTimeout(() => setShow(false), AUTO_DISMISS_MS)
  }

  const dismiss = () => {
    if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current)
    dismissTimer.current = null
    setShow(false)
  }

  const onTouchStart = () => {
    if (hasHover) return
    suppress.current = false
    pressTimer.current = window.setTimeout(() => {
      suppress.current = true
      reveal()
    }, LONG_PRESS_MS)
  }
  const onTouchEnd = () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current)
    pressTimer.current = null
  }

  useEffect(() => clearTimers, [])

  // Escape and an outside tap dismiss regardless of where focus landed —
  // touch doesn't reliably confer focus, so this can't depend on onBlur alone.
  useEffect(() => {
    if (!show) return
    const away = (e: Event) => {
      if (e.target instanceof Node && wrapperRef.current?.contains(e.target)) return
      dismiss()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [show])

  return (
    <span
      ref={wrapperRef}
      aria-disabled
      aria-label={reason}
      tabIndex={0}
      title={hasHover ? reason : undefined}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchEnd}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onFocus={() => !hasHover && reveal()}
      onBlur={() => dismiss()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          reveal()
        }
      }}
      onClick={(e) => {
        // Swallow the synthetic click a completed long-press emits on lift —
        // see the doc comment above.
        if (suppress.current) {
          suppress.current = false
          e.stopPropagation()
        }
      }}
      style={{ position: 'relative', display: 'inline-flex', cursor: 'not-allowed', ...style }}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 'calc(100% + 7px)',
            transform: 'translateX(-50%)',
            maxWidth: 220,
            width: 'max-content',
            padding: '7px 10px',
            borderRadius: 'var(--r-sm)',
            background: 'var(--dropdown)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-modal)',
            color: 'var(--text)',
            fontSize: 'var(--t-meta)',
            fontWeight: 500,
            lineHeight: 1.4,
            textAlign: 'left',
            zIndex: 40,
            pointerEvents: 'none',
          }}
        >
          {reason}
        </span>
      )}
    </span>
  )
}
