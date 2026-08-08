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

  const clearTimers = () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current)
    if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current)
    pressTimer.current = null
    dismissTimer.current = null
  }

  const reveal = () => {
    setShow(true)
    dismissTimer.current = window.setTimeout(() => setShow(false), AUTO_DISMISS_MS)
  }

  const onTouchStart = () => {
    if (hasHover) return
    pressTimer.current = window.setTimeout(reveal, LONG_PRESS_MS)
  }
  const onTouchEnd = () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current)
    pressTimer.current = null
  }

  useEffect(() => clearTimers, [])

  return (
    <span
      aria-disabled
      aria-label={reason}
      tabIndex={0}
      title={hasHover ? reason : undefined}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onFocus={() => !hasHover && reveal()}
      onBlur={() => setShow(false)}
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
            borderRadius: 8,
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
