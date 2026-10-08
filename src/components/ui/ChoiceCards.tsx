import { useId, type ReactNode } from 'react'
import Icon, { type IconName } from './Icon'
import './choice-cards.css'

export interface ChoiceCardOption<T extends string = string> {
  value: T
  label: string
  /** One short line under the label: what the option means, never what it costs. */
  hint?: string
  icon?: IconName
  disabled?: boolean
}

export interface ChoiceCardsProps<T extends string = string> {
  /** The visible group label, rendered as the fieldset's legend. */
  legend: ReactNode
  /** Shared `name` for the radio inputs — one per group on the page. */
  name: string
  options: readonly ChoiceCardOption<T>[]
  value: T
  onChange: (value: T) => void
  required?: boolean
  /** Narrowest a card may get before the grid drops a column. */
  minCardWidth?: string
}

/**
 * # ChoiceCards — a short list of mutually exclusive options as tap cards
 *
 * For a form value with a handful of options, where a `<select>` costs two taps
 * (open, pick) and hides the choices until opened. Every option is on screen and
 * one tap selects it (R-39). Taken from the Miraz Bakery POS payment step.
 *
 * Not `SegmentedControl`: that is a `tablist` for switching views. This is a
 * form value, so it is a `fieldset` of native radios. The browser supplies the
 * keyboard behaviour (Tab into the group, arrows move the choice) and the
 * accessible name, so none of it is re-implemented here.
 *
 * - Law 11: the chosen card shows a check icon and a heavier border, not only a
 *   colour change.
 * - Law 13/14: the grid is `auto-fit`, so it reflows by the width it is given,
 *   with no breakpoint and no platform branch.
 * - Law 15: every card is at least `var(--tap)` tall.
 */
export function ChoiceCards<T extends string = string>({
  legend,
  name,
  options,
  value,
  onChange,
  required = false,
  // 10rem leaves room for the icon, a short label and its hint on one line
  // each (three across in the Record Payment dialog, one column on a phone).
  minCardWidth = '10rem',
}: ChoiceCardsProps<T>) {
  // Each radio gets an id its card's label points at. Wrapping alone would
  // label it too, but an explicit `for` is what every assistive tech honours.
  const baseId = useId()
  return (
    <fieldset className="choice-cards">
      <legend className="choice-cards__legend">
        {legend}
        {required && (
          <>
            {' '}
            <span aria-hidden="true" style={{ color: 'var(--danger)' }}>*</span>
          </>
        )}
      </legend>
      <div
        className="choice-cards__grid"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minCardWidth}), 1fr))` }}
      >
        {options.map((o, i) => {
          const checked = o.value === value
          const inputId = `${baseId}-${i}`
          return (
            <label
              key={o.value}
              htmlFor={inputId}
              className="choice-card"
              data-checked={checked ? 'true' : undefined}
              data-disabled={o.disabled ? 'true' : undefined}
            >
              <input
                id={inputId}
                type="radio"
                className="choice-card__input"
                name={name}
                value={o.value}
                checked={checked}
                disabled={o.disabled}
                required={required}
                onChange={() => onChange(o.value)}
              />
              {o.icon && <Icon name={o.icon} size={18} className="choice-card__icon" />}
              <span className="choice-card__text">
                <span className="choice-card__label">{o.label}</span>
                {o.hint && <span className="choice-card__hint">{o.hint}</span>}
              </span>
              {/* A corner badge, not an inline icon: it takes no width from the
                  label, so choosing a card never re-wraps its text. */}
              {checked && (
                <span className="choice-card__check">
                  <Icon name="check" size={12} fill />
                </span>
              )}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
