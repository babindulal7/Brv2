import { forwardRef, useState } from 'react'
import { Input } from '../../components/ui'
import type { InputProps } from '../../components/ui/Input'
import Icon from '../../components/ui/Icon'

export interface PasswordInputProps
  extends Omit<InputProps, 'type' | 'iconRight' | 'onClear' | 'label' | 'error' | 'helperText'> {
  showCapsLockWarning?: boolean
}

/**
 * The shared `Input` with a show/hide toggle and Caps Lock detection,
 * for every password field in the auth flow (`Login`, `ResetPassword`).
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ style, showCapsLockWarning = true, onKeyDown, onKeyUp, onFocus, onBlur, ...props }, ref) {
    const [visible, setVisible] = useState(false)
    const [capsLock, setCapsLock] = useState(false)
    const [focused, setFocused] = useState(false)

    const checkCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (typeof e.getModifierState === 'function') {
        setCapsLock(e.getModifierState('CapsLock'))
      }
    }

    return (
      <div className="auth-password-wrapper" style={{ position: 'relative' }}>
        <Input
          ref={ref}
          aria-label={props['aria-label'] || 'Password'}
          type={visible ? 'text' : 'password'}
          style={{ paddingRight: 44, ...style }}
          onKeyDown={(e) => {
            checkCapsLock(e)
            onKeyDown?.(e)
          }}
          onKeyUp={(e) => {
            checkCapsLock(e)
            onKeyUp?.(e)
          }}
          onFocus={(e) => {
            setFocused(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            onBlur?.(e)
          }}
          {...props}
        />
        <button
          type="button"
          className="auth-password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          tabIndex={-1}
        >
          <Icon name={visible ? 'eye_off' : 'eye'} size={18} />
        </button>

        {showCapsLockWarning && capsLock && focused && (
          <div className="auth-capslock-hint" role="status" aria-live="polite">
            <Icon name="alert_circle" size={14} />
            <span>Caps Lock is ON</span>
          </div>
        )}
      </div>
    )
  }
)
