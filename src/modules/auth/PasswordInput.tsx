import { forwardRef, useState } from 'react'
import { Input } from '../../components/ui'
import type { InputProps } from '../../components/ui/Input'
import Icon from '../../components/ui/Icon'

/**
 * The shared `Input` with a show/hide toggle, for every password field in the
 * auth flow (`Login`, `ResetPassword` twice).
 *
 * Lives in `modules/auth` rather than `components/ui` for the same reason
 * `AuthCard` does: nothing outside the signed-out screens renders a password,
 * and a `ui` primitive would invite one to appear where a PIN or a session
 * should be doing the work.
 *
 * The toggle is a real button, not `Input`'s `iconRight` slot — that slot is
 * `pointer-events: none` by design (it decorates, `onClear` interacts), and
 * widening its contract for one consumer would change every read-only icon in
 * the app. `aria-pressed` carries the state; the glyph swap (`eye`/`eye_off`)
 * carries it visually, so the state never depends on colour (Law 11).
 */
/**
 * `label`/`error`/`helperText` are omitted, not just unused: the toggle is
 * anchored to the top of `Input`'s wrapper, which is the input row only while
 * `Input` renders nothing above it. The auth screens all label externally.
 */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<InputProps, 'type' | 'iconRight' | 'onClear' | 'label' | 'error' | 'helperText'>
>(
  function PasswordInput({ style, ...props }, ref) {
    const [visible, setVisible] = useState(false)

    return (
      <div style={{ position: 'relative' }}>
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          style={{ paddingRight: 44, ...style }}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            height: 44,
            width: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            color: 'var(--muted)',
            cursor: 'pointer',
            borderRadius: 'var(--r-input)',
          }}
        >
          <Icon name={visible ? 'eye_off' : 'eye'} size={18} />
        </button>
      </div>
    )
  }
)
