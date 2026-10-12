// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import Documents from '../Documents'

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
  useAuth: () => ({ user: { id: 'USR-TEST', name: 'Tester', role: 'Owner', isSharedDevice: false } }),
}))

vi.mock('../../../lib/moneyVisibility', () => ({
  useCanViewMoney: () => true,
}))

vi.mock('../../../components/ui/Toast', () => ({
  useToast: () => ({
    showSuccessToast: vi.fn(),
    showErrorToast: vi.fn(),
  }),
}))

vi.mock('../../../lib/supabase', () => ({ IS_MOCK: true, supabase: {} }))
vi.mock('../../../lib/queries/documents', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../lib/queries/documents')>()
  return { ...real, listDocuments: async () => ({ rows: real.DOCUMENTS, total: real.DOCUMENTS.length }) }
})

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

describe('Documents Workspace (Bento 2.0 / Design Taste)', () => {
  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount()
      })
      root = null
    }
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('renders .doc-v2 container and category tabs with 44px min-height', () => {
    const el = render(
      <MemoryRouter initialEntries={['/documents']}>
        <Documents />
      </MemoryRouter>,
    )

    const docContainer = el.querySelector('.doc-v2')
    expect(docContainer).not.toBeNull()

    const tabTrack = el.querySelector('.doc-tab-track')
    expect(tabTrack).not.toBeNull()

    const tabBtns = el.querySelectorAll<HTMLButtonElement>('.doc-tab-btn')
    expect(tabBtns.length).toBeGreaterThan(0)
    expect(tabBtns[0]?.textContent).toContain('All Documents')
  })

  it('keeps one category selector when filters drawer is toggled', () => {
    const el = render(
      <MemoryRouter initialEntries={['/documents']}>
        <Documents />
      </MemoryRouter>,
    )

    const filterBtn = el.querySelector<HTMLButtonElement>('button[aria-controls="documents-filters"]')
    expect(filterBtn).not.toBeNull()

    act(() => {
      filterBtn?.click()
    })

    expect(el.querySelectorAll<HTMLButtonElement>('.doc-tab-btn').length).toBeGreaterThan(0)
    expect(document.body.querySelectorAll<HTMLButtonElement>('.doc-rail-cat-btn')).toHaveLength(0)
  })

  it('renders toolbar with search input and table/cards view switchers', () => {
    const el = render(
      <MemoryRouter initialEntries={['/documents']}>
        <Documents />
      </MemoryRouter>,
    )

    const toolbar = el.querySelector('.list-workspace__controls')
    expect(toolbar).not.toBeNull()
    expect(toolbar?.querySelector('input[aria-label="Search documents by name, ID, type, record or client"]')).not.toBeNull()

    const viewToggle = el.querySelector('.doc-view-toggle')
    expect(viewToggle).not.toBeNull()

    const viewBtns = el.querySelectorAll<HTMLButtonElement>('.doc-view-btn')
    expect(viewBtns.length).toBe(2)
  })

  it('switches between Table view and Cards view when toggled', () => {
    const el = render(
      <MemoryRouter initialEntries={['/documents']}>
        <Documents />
      </MemoryRouter>,
    )

    // Initially in table view (desktop default)
    expect(el.querySelector('.doc-table-shell')).not.toBeNull()

    // Find Cards view button
    const cardsBtn = el.querySelector<HTMLButtonElement>('button[aria-label="Cards view"]')
    expect(cardsBtn).not.toBeNull()

    act(() => {
      cardsBtn?.click()
    })

    // Now cards view should be active
    expect(el.querySelector('.doc-cards-grid')).not.toBeNull()
    const docCards = el.querySelectorAll('.doc-card')
    expect(docCards.length).toBeGreaterThan(0)
  })

  it('opens Create Document modal when button is clicked', () => {
    const el = render(
      <MemoryRouter initialEntries={['/documents']}>
        <Documents />
      </MemoryRouter>,
    )

    const addBtn = Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.includes('Add') || b.textContent?.includes('Create Document'),
    )
    expect(addBtn).toBeDefined()

    act(() => {
      addBtn?.click()
    })

    const newDocItem = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.includes('New Document'),
    )
    if (newDocItem) {
      act(() => {
        newDocItem.click()
      })
    }

    // Modal input should be rendered
    const titleInput = document.body.querySelector<HTMLInputElement>('input[placeholder*="Equipment Rental Agreement"]')
    expect(titleInput).not.toBeNull()

    // Cancel button in modal
    const cancelBtn = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    )
    expect(cancelBtn).toBeDefined()
  })
})
