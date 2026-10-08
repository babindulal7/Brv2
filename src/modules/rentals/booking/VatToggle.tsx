import Icon from '../../../components/ui/Icon'
import { TouchInset } from './BookingFormWidgets'

export interface VatToggleProps {
  ratePercent: number
  on: boolean
  onChange: (v: boolean) => void
}

/**
 * The rail's `VAT {rate}%  [on ▢]` control.
 *
 * Law 11 — never colour alone: the switch carries an icon and the words On /
 * Off beside it, so the state is readable with no colour perception at all.
 * The *rate* is the caller's, read from Settings; this component never knows
 * a number.
 */
export function VatToggle({ ratePercent, on, onChange }: VatToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="press"
      onClick={() => onChange(!on)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        width: '100%',
        minHeight: 30,
        padding: '3px 2px',
        border: 'none',
        background: 'transparent',
        color: 'var(--text2)',
        fontFamily: 'inherit',
        fontSize: 'var(--t-meta)',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <TouchInset />
      <span style={{ flex: 1, minWidth: 0 }}>VAT {ratePercent}%</span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: 20,
          padding: '0 7px',
          borderRadius: 'var(--r-btn)',
          background: on ? 'var(--st-in-bg)' : 'var(--st-neutral-bg)',
          color: on ? 'var(--st-in-fg)' : 'var(--st-neutral-fg)',
          fontSize: 'var(--t-th)',
          fontWeight: 700,
        }}
      >
        <Icon name={on ? 'check' : 'close'} size={11} />
        {on ? 'On' : 'Off'}
      </span>
    </button>
  )
}
