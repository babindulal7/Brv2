// @vitest-environment jsdom
/**
 * # ChoiceCards — a form value as tap cards
 *
 * Pins what the component promises: one native radio group (so the browser owns
 * keyboard and accessible name), one tap picks a value, and the chosen card is
 * marked by a check icon as well as colour (Law 11).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ChoiceCards, type ChoiceCardOption } from '../ChoiceCards'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

type Pick = 'a' | 'b' | 'c'
const OPTIONS: readonly ChoiceCardOption<Pick>[] = [
  { value: 'a', label: 'Alpha', hint: 'First', icon: 'cash' },
  { value: 'b', label: 'Beta', icon: 'bank' },
  { value: 'c', label: 'Gamma', disabled: true },
]

let container: HTMLDivElement
let root: Root
let changes: Pick[]

function Harness({ initial }: { initial: Pick }) {
  const [value, setValue] = useState<Pick>(initial)
  return (
    <ChoiceCards<Pick>
      legend="Choose one"
      name="pick"
      options={OPTIONS}
      value={value}
      onChange={(v) => {
        changes.push(v)
        setValue(v)
      }}
      required
    />
  )
}

const radio = (v: Pick) => container.querySelector(`input[name="pick"][value="${v}"]`) as HTMLInputElement
const card = (v: Pick) => radio(v).closest('label') as HTMLLabelElement

beforeEach(() => {
  changes = []
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<Harness initial="a" />))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('ChoiceCards', () => {
  it('renders one radio group inside a fieldset named by its legend', () => {
    const fieldset = container.querySelector('fieldset')!
    expect(fieldset.querySelector('legend')!.textContent).toContain('Choose one')
    const radios = fieldset.querySelectorAll('input[type="radio"]')
    expect(Array.from(radios).map((r) => (r as HTMLInputElement).value)).toEqual(['a', 'b', 'c'])
    expect(Array.from(radios).every((r) => (r as HTMLInputElement).name === 'pick')).toBe(true)
  })

  it('shows the label and the hint on the card', () => {
    expect(card('a').textContent).toContain('Alpha')
    expect(card('a').textContent).toContain('First')
  })

  it('picks a value with one tap anywhere on the card', () => {
    act(() => card('b').click())
    expect(changes).toEqual(['b'])
    expect(radio('b').checked).toBe(true)
    expect(radio('a').checked).toBe(false)
  })

  it('marks the chosen card with a check icon, not colour alone (Law 11)', () => {
    expect(card('a').hasAttribute('data-checked')).toBe(true)
    expect(card('a').querySelector('.choice-card__check')).not.toBeNull()
    expect(card('b').hasAttribute('data-checked')).toBe(false)
    expect(card('b').querySelector('.choice-card__check')).toBeNull()

    act(() => card('b').click())
    expect(card('a').querySelector('.choice-card__check')).toBeNull()
    expect(card('b').querySelector('.choice-card__check')).not.toBeNull()
  })

  it('does not pick a disabled option', () => {
    expect(radio('c').disabled).toBe(true)
    act(() => card('c').click())
    expect(changes).toEqual([])
    expect(radio('a').checked).toBe(true)
  })
})
