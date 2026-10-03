// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import InternalNotesPage from '../InternalNotesPage'

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

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

describe('InternalNotesPage', () => {
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

  it('renders the header title and ops metrics', () => {
    const container = render(
      <MemoryRouter>
        <InternalNotesPage />
      </MemoryRouter>,
    )

    expect(container.textContent).toContain('Team Dispatch & Shift Notes')
    expect(container.textContent).toContain('Gear Alerts')
    expect(container.textContent).toContain('Shift Handovers')
    expect(container.textContent).toContain('Resolved Today')
  })

  it('renders the composer and quick template chips', () => {
    const container = render(
      <MemoryRouter>
        <InternalNotesPage />
      </MemoryRouter>,
    )

    expect(container.textContent).toContain('Post Internal Dispatch Note')
    expect(container.textContent).toContain('🚨 Gear Defect')
    expect(container.textContent).toContain('🔄 Shift Handover')
    expect(container.textContent).toContain('🚚 Dispatch Route')
  })

  it('clicking a template button pre-fills the composer textarea', () => {
    const container = render(
      <MemoryRouter>
        <InternalNotesPage />
      </MemoryRouter>,
    )

    const buttons = Array.from(container.querySelectorAll('button'))
    const tmplBtn = buttons.find(b => b.textContent?.includes('🚨 Gear Defect'))
    expect(tmplBtn).toBeDefined()

    act(() => {
      tmplBtn?.click()
    })

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea.value).toContain('EQ-SONY-FX6-01')
  })

  it('posts a new note to the feed', () => {
    const container = render(
      <MemoryRouter>
        <InternalNotesPage />
      </MemoryRouter>,
    )

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
    act(() => {
      nativeSetter?.call(textarea, 'Emergency: BR-9999 battery swap required at Gokarna')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      textarea.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const submitBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Post to Dispatch Log'),
    )
    expect(submitBtn).toBeDefined()

    act(() => {
      submitBtn?.click()
    })

    expect(container.textContent).toContain('BR-9999 battery swap required at Gokarna')
  })

  it('toggles resolution of a note', () => {
    const container = render(
      <MemoryRouter>
        <InternalNotesPage />
      </MemoryRouter>,
    )

    const doneButtons = Array.from(container.querySelectorAll('button')).filter(b =>
      b.textContent?.includes('Mark as Done'),
    )
    expect(doneButtons.length).toBeGreaterThan(0)

    act(() => {
      doneButtons[0]?.click()
    })

    expect(container.textContent).toContain('RESOLVED')
  })
})
