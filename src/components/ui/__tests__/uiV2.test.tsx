// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from '../Button'
import { Button as PageButton, Card as PageCard } from '../Page'
import { Card } from '../Card'
import { Input } from '../Input'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('V2 compatibility and accessible controls', () => {
  it('preserves card section semantics, body overrides, and standalone footer support', () => {
    act(() => root.render(<><PageCard title="Equipment" bodyStyle={{ padding: 0 }}>Kit</PageCard><Card title="Summary" subtitle="Rental" footer="Saved">Details</Card></>))
    expect(host.querySelector('section h2')!.textContent).toBe('Equipment')
    expect(host.querySelector<HTMLElement>('section .surface-card__body')!.style.padding).toBe('0px')
    expect(host.querySelector('h3')!.textContent).toBe('Summary')
    expect(host.textContent).toContain('Saved')
  })
  it('preserves Page button non-submit default and forwards accessible names/events', () => {
    const submit = vi.fn((e: React.FormEvent) => e.preventDefault())
    const click = vi.fn()
    act(() => root.render(<form onSubmit={submit}><PageButton icon="plus" aria-label="New Rental" onClick={click}>{''}</PageButton></form>))
    const button = host.querySelector('button')!
    expect(button.type).toBe('button')
    expect(button.getAttribute('aria-label')).toBe('New Rental')
    expect(button.classList.contains('ui-button--secondary')).toBe(true)
    act(() => button.click())
    expect(click).toHaveBeenCalledOnce()
    expect(submit).not.toHaveBeenCalled()
  })

  it('allows an explicit submit through the compatibility adapter', () => {
    const submit = vi.fn((e: React.FormEvent) => e.preventDefault())
    act(() => root.render(<form onSubmit={submit}><PageButton type="submit">Save</PageButton></form>))
    act(() => host.querySelector('button')!.click())
    expect(submit).toHaveBeenCalledOnce()
  })

  it('keeps label and icon slots while loading and blocks repeat clicks', () => {
    const click = vi.fn()
    act(() => root.render(<Button loading onClick={click} icon={<i>Left</i>} iconRight={<i>Right</i>}>Save rental</Button>))
    const button = host.querySelector('button')!
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(host.querySelectorAll('.ui-button__slot')).toHaveLength(2)
    const label = host.querySelector<HTMLElement>('.ui-button__label')!
    expect(label.textContent).toBe('Save rental')
    expect(label.style.visibility).not.toBe('hidden')
    act(() => button.click())
    expect(click).not.toHaveBeenCalled()
  })

  it('gives repeated labels unique IDs and associates errors plus caller descriptions', () => {
    act(() => root.render(<><p id="policy">Required for delivery</p><Input label="Phone" /><Input label="Phone" error="Enter a valid phone number" aria-describedby="policy" /></>))
    const inputs = host.querySelectorAll('input')
    expect(inputs[0]!.id).not.toBe(inputs[1]!.id)
    expect(host.querySelectorAll('label')[1]!.htmlFor).toBe(inputs[1]!.id)
    expect(inputs[1]!.getAttribute('aria-invalid')).toBe('true')
    const ids = inputs[1]!.getAttribute('aria-describedby')!.split(' ')
    expect(ids).toContain('policy')
    expect(document.getElementById(ids[1]!)!.textContent).toContain('Enter a valid phone number')
  })

  it('retains explicit input IDs and disables clear on read-only fields', () => {
    const clear = vi.fn()
    act(() => root.render(<Input id="client-name" label="Client" value="Himalayan Films" readOnly onClear={clear} helperText="Selected client" />))
    const input = host.querySelector('input')!
    expect(input.id).toBe('client-name')
    expect(document.getElementById(input.getAttribute('aria-describedby')!)!.textContent).toBe('Selected client')
    const button = host.querySelector('button')!
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-label')).toBe('Clear Client')
    act(() => button.click())
    expect(clear).not.toHaveBeenCalled()
  })
})
