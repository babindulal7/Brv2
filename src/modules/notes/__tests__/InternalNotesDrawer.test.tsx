// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import InternalNotesDrawer from '../InternalNotesDrawer'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({ user: { id: 'usr-1', name: 'Babin Dulal', role: 'Operations Lead' } }),
}))

vi.mock('../../../components/ui/Toast', () => ({
  useOptionalToast: () => ({
    showSuccessToast: vi.fn(),
    showErrorToast: vi.fn(),
  }),
}))

let root: Root | null = null

function render(ui: React.ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(ui)
  })
  return container
}

describe('InternalNotesDrawer', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
      root = null
    }
    document.body.innerHTML = ''
  })

  it('renders nothing when isOpen is false', () => {
    const container = render(
      <MemoryRouter>
        <InternalNotesDrawer isOpen={false} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    expect(container.textContent).toBe('')
  })

  it('renders the drawer dialog, header, and notes feed when isOpen is true', () => {
    const container = render(
      <MemoryRouter>
        <InternalNotesDrawer isOpen={true} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    expect(container.textContent).toContain('Team Internal Notes')
    expect(container.textContent).toContain('Full Page')
    expect(container.textContent).toContain('Shift Handover')
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    const container = render(
      <MemoryRouter>
        <InternalNotesDrawer isOpen={true} onClose={onClose} />
      </MemoryRouter>,
    )

    const closeBtn = container.querySelector('button[aria-label="Close drawer"]') as HTMLButtonElement
    expect(closeBtn).toBeDefined()
    act(() => {
      closeBtn.click()
    })
    expect(onClose).toHaveBeenCalled()
  })
})
