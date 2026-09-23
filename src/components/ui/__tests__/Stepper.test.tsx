// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { Stepper } from '../Stepper'
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

describe('Stepper completion semantics', () => {
  it('does not announce skipped sections as completed; only explicit completion is shown', () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    const steps = [{ id: 'client', label: 'Client' }, { id: 'gear', label: 'Equipment' }, { id: 'review', label: 'Review' }]
    act(() => root.render(<Stepper steps={steps} currentStep={3} onStepClick={() => {}} />))
    expect(host.querySelectorAll('.is-completed')).toHaveLength(0)
    expect(host.querySelector('[aria-current="step"]')?.textContent).toContain('Review')
    act(() => root.render(<Stepper steps={steps} currentStep={3} completedStepIds={['gear']} />))
    expect(host.querySelectorAll('.is-completed')).toHaveLength(1)
    expect(host.querySelector('.is-completed button')?.getAttribute('aria-label')).toContain('Equipment (Completed)')
    act(() => root.unmount())
  })
})
