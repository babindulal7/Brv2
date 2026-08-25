import { useCallback, useEffect, useRef } from 'react'
import Icon from './Icon'

/**
 * **A fixed-length numeric entry pad.**
 *
 * Extracted 24 Aug 2026 from `modules/auth/ScreenLock.tsx`, which held the only
 * copy. It moved because the PIN feature gave it a second and third consumer —
 * enrolment and its confirm step — and a numpad duplicated three ways is how
 * two of them end up with different key sizes and one of them without keyboard
 * support.
 *
 * Nothing here knows what a PIN is. It reports digits; the caller decides what
 * they mean. That is deliberate: the verification path is a database function
 * (`verify_staff_pin`) and this component must not be able to approve anything.
 *
 * ## Why hardware keys are wired even though this is a tablet control
 *
 * The lock screen is reachable on desktop — an idle timeout does not ask what
 * you are holding. A numpad that can only be tapped strands a desktop operator
 * with a keyboard in front of them, and "the lock screen ignored my typing" is
 * indistinguishable from "the lock screen is broken".
 */

const KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

export interface PinPadProps {
  /** How many digits make a complete entry. */
  length?: number
  /** The digits entered so far. Controlled — the caller owns the value. */
  value: string
  onChange: (next: string) => void
  /** Fired once `value` reaches `length`. The caller submits; this pad does not. */
  onComplete?: (value: string) => void
  /** Blocks entry while a verification is in flight, or after a lockout. */
  disabled?: boolean
  /**
   * Flash the dots to signal a rejected entry. Honours
   * `prefers-reduced-motion`: the shake becomes a static border change, because
   * a rejection the operator cannot perceive is a rejection that reads as a
   * frozen screen.
   */
  invalid?: boolean
  /** Labels the pad for assistive tech, e.g. "Enter your PIN". */
  label: string
}

export function PinPad({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  invalid = false,
  label,
}: PinPadProps) {
  // `onComplete` must fire exactly once per completed entry. Without this guard
  // a parent re-render while the value sits at full length fires it again, which
  // on the unlock path means a second verify — and a second failed verify is a
  // second increment of the database attempt counter for one wrong entry.
  const completedFor = useRef<string | null>(null)

  useEffect(() => {
    if (value.length !== length) {
      completedFor.current = null
      return
    }
    if (completedFor.current === value) return
    completedFor.current = value
    onComplete?.(value)
  }, [value, length, onComplete])

  const push = useCallback(
    (digit: string) => {
      if (disabled) return
      if (value.length >= length) return
      onChange(value + digit)
    },
    [disabled, value, length, onChange],
  )

  const pop = useCallback(() => {
    if (disabled) return
    onChange(value.slice(0, -1))
  }, [disabled, value, onChange])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault()
        push(e.key)
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        pop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [disabled, push, pop])

  const keyStyle = {
    height: 64,
    borderRadius: '50%',
    border: '1px solid var(--border)',
    background: 'var(--card2)',
    fontSize: 24,
    fontWeight: 600,
    color: 'var(--text)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    opacity: disabled ? 0.5 : 1,
  } as const

  return (
    <div>
      {/*
        The dots are decoration; the live region below carries the same fact as
        text. A screen reader user counting filled circles is not a design.
      */}
      <div
        aria-hidden
        className={invalid ? 'pinpad-invalid' : undefined}
        style={{ display: 'flex', gap: 'var(--sp-md)', justifyContent: 'center', margin: '0 0 32px' }}
      >
        {Array.from({ length }).map((_, i) => {
          const filled = value.length > i
          return (
            <div
              key={i}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                // Law 11 — fill AND border move together, so the state survives
                // a monochrome display and does not rely on hue alone.
                background: invalid
                  ? 'var(--st-danger-bg)'
                  : filled
                    ? 'var(--input-focus)'
                    : 'var(--input-bg)',
                border: `2px solid ${
                  invalid ? 'var(--st-danger-fg)' : filled ? 'var(--input-focus)' : 'var(--border)'
                }`,
                transition: 'background var(--dur), border-color var(--dur)',
              }}
            />
          )
        })}
      </div>

      {/* Off-screen but in the accessibility tree — no global `.sr-only` exists
          in this build, so the style is inline, as it is in BookingDetail and
          NewRental. */}
      <div
        aria-live="polite"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
      >
        {invalid ? 'Entry rejected.' : `${value.length} of ${length} digits entered.`}
      </div>

      <div
        role="group"
        aria-label={label}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-md)' }}
      >
        {KEYS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => push(String(n))}
            disabled={disabled}
            aria-label={`Digit ${n}`}
            style={keyStyle}
          >
            {n}
          </button>
        ))}
        <div />
        <button
          type="button"
          onClick={() => push('0')}
          disabled={disabled}
          aria-label="Digit 0"
          style={keyStyle}
        >
          0
        </button>
        <button
          type="button"
          onClick={pop}
          disabled={disabled || value.length === 0}
          aria-label="Delete last digit"
          style={{
            height: 64,
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            color: 'var(--text2)',
            cursor: disabled || value.length === 0 ? 'not-allowed' : 'pointer',
            opacity: disabled || value.length === 0 ? 0.4 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="return_arrow" size={28} />
        </button>
      </div>
    </div>
  )
}
