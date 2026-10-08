// @vitest-environment jsdom
/**
 * # Operational Floor Workspaces — 5-State PageBody Hardening Tests
 *
 * Phase 6 Operational Workspaces Hardening:
 * Tests the 5 states rendered via PageBody for:
 *   - PackingWorkspace.tsx
 *   - HandoverWorkspace.tsx
 *   - ReturnWorkspace.tsx
 *   - ResetWorkspace.tsx
 *   - EvidenceWorkspace.tsx
 *   - CasesWorkspace.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { ReactNode } from 'react'

let userRole = 'Warehouse'

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'USR-FLOOR', name: 'Floor Technician', role: userRole, isSharedDevice: false },
    loading: false,
    isLocked: false,
  }),
}))

vi.mock('../../../lib/device', async (orig) => ({
  ...(await orig<typeof import('../../../lib/device')>()),
  useViewport: () => 'desktop',
}))

window.matchMedia = ((q: string) => ({
  matches: false,
  media: q,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

import { ToastProvider } from '../../../components/ui/Toast'

const { default: PackingWorkspace } = await import('../../rentals/PackingWorkspace')
const { default: HandoverWorkspace } = await import('../../rentals/HandoverWorkspace')
const { default: ReturnWorkspace } = await import('../../rentals/ReturnWorkspace')
const { default: ResetWorkspace } = await import('../../rentals/ResetWorkspace')
const { default: EvidenceWorkspace } = await import('../../rentals/EvidenceWorkspace')
const { CasesWorkspace } = await import('../CasesWorkspace')

let container: HTMLDivElement
let root: Root

async function mountAt(entry: string, element: ReactNode, pattern: string, as = 'Warehouse') {
  userRole = as
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <ToastProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path={pattern} element={element} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    )
  })
}

describe('Operational Floor Workspaces — 5-State PageBody Hardening', () => {
  beforeEach(() => {
    userRole = 'Warehouse'
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    container?.remove()
  })

  describe('PackingWorkspace', () => {
    it('renders loading skeleton when loading=true', async () => {
      await mountAt('/rentals/B-715/packing', <PackingWorkspace loading />, '/rentals/:bookingNo/packing')
      expect(container.textContent).toContain('Loading packing checklist…')
    })

    it('renders ErrorBanner and invokes onRetry', async () => {
      const onRetry = vi.fn()
      await mountAt('/rentals/B-715/packing', <PackingWorkspace error="Could not load checklist" onRetry={onRetry} />, '/rentals/:bookingNo/packing')
      expect(container.textContent).toContain('Could not load packing checklist')
      expect(container.textContent).toContain('Could not load checklist')

      const retryBtn = container.querySelector('[role="alert"] button')
      expect(retryBtn).toBeTruthy()
      await act(async () => {
        ;(retryBtn as HTMLButtonElement)?.click()
      })
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('renders RestrictedState for Client role', async () => {
      await mountAt('/rentals/B-715/packing', <PackingWorkspace />, '/rentals/:bookingNo/packing', 'Client')
      expect(container.textContent).toContain('Requires Staff')
      expect(container.textContent).toContain('Floor packing workspace is for Babin Rentals staff only')
    })
  })

  describe('HandoverWorkspace', () => {
    it('renders loading skeleton when loading=true', async () => {
      await mountAt('/rentals/B-715/handover', <HandoverWorkspace loading />, '/rentals/:bookingNo/handover')
      expect(container.textContent).toContain('Loading handover session…')
    })

    it('renders ErrorBanner and invokes onRetry', async () => {
      const onRetry = vi.fn()
      await mountAt('/rentals/B-715/handover', <HandoverWorkspace error="Handover read timed out" onRetry={onRetry} />, '/rentals/:bookingNo/handover')
      expect(container.textContent).toContain('Could not load handover session')
      expect(container.textContent).toContain('Handover read timed out')

      const retryBtn = container.querySelector('[role="alert"] button')
      expect(retryBtn).toBeTruthy()
      await act(async () => {
        ;(retryBtn as HTMLButtonElement)?.click()
      })
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('renders RestrictedState for Client role', async () => {
      await mountAt('/rentals/B-715/handover', <HandoverWorkspace />, '/rentals/:bookingNo/handover', 'Client')
      expect(container.textContent).toContain('Requires Staff')
      expect(container.textContent).toContain('Floor handover workspace is for Babin Rentals staff only')
    })
  })

  describe('ReturnWorkspace', () => {
    it('renders loading skeleton when loading=true', async () => {
      await mountAt('/rentals/B-715/return', <ReturnWorkspace loading />, '/rentals/:bookingNo/return')
      expect(container.textContent).toContain('Loading return inspection…')
    })

    it('renders ErrorBanner and invokes onRetry', async () => {
      const onRetry = vi.fn()
      await mountAt('/rentals/B-715/return', <ReturnWorkspace error="Return record corrupted" onRetry={onRetry} />, '/rentals/:bookingNo/return')
      expect(container.textContent).toContain('Could not load return inspection')
      expect(container.textContent).toContain('Return record corrupted')

      const retryBtn = container.querySelector('[role="alert"] button')
      expect(retryBtn).toBeTruthy()
      await act(async () => {
        ;(retryBtn as HTMLButtonElement)?.click()
      })
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('renders RestrictedState for Client role', async () => {
      await mountAt('/rentals/B-715/return', <ReturnWorkspace />, '/rentals/:bookingNo/return', 'Client')
      expect(container.textContent).toContain('Requires Staff')
      expect(container.textContent).toContain('Return & inspection workspace is for Babin Rentals staff only')
    })
  })

  describe('ResetWorkspace', () => {
    it('renders loading skeleton when loading=true', async () => {
      await mountAt('/rentals/B-715/reset', <ResetWorkspace loading />, '/rentals/:bookingNo/reset')
      expect(container.textContent).toContain('Loading cleaning and reset…')
    })

    it('renders ErrorBanner and invokes onRetry', async () => {
      const onRetry = vi.fn()
      await mountAt('/rentals/B-715/reset', <ResetWorkspace error="Failed to fetch reset queue" onRetry={onRetry} />, '/rentals/:bookingNo/reset')
      expect(container.textContent).toContain('Could not load cleaning and reset')
      expect(container.textContent).toContain('Failed to fetch reset queue')

      const retryBtn = container.querySelector('[role="alert"] button')
      expect(retryBtn).toBeTruthy()
      await act(async () => {
        ;(retryBtn as HTMLButtonElement)?.click()
      })
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('renders RestrictedState for Client role', async () => {
      await mountAt('/rentals/B-715/reset', <ResetWorkspace />, '/rentals/:bookingNo/reset', 'Client')
      expect(container.textContent).toContain('Requires Staff')
      expect(container.textContent).toContain('Cleaning & reset workspace is for Babin Rentals staff only')
    })
  })

  describe('EvidenceWorkspace', () => {
    it('renders loading skeleton when loading=true', async () => {
      await mountAt('/rentals/B-715/evidence', <EvidenceWorkspace loading />, '/rentals/:bookingNo/evidence')
      expect(container.textContent).toContain('Loading evidence gallery…')
    })

    it('renders ErrorBanner and invokes onRetry', async () => {
      const onRetry = vi.fn()
      await mountAt('/rentals/B-715/evidence', <EvidenceWorkspace error="Evidence bucket unreachable" onRetry={onRetry} />, '/rentals/:bookingNo/evidence')
      expect(container.textContent).toContain('Could not load evidence gallery')
      expect(container.textContent).toContain('Evidence bucket unreachable')

      const retryBtn = container.querySelector('[role="alert"] button')
      expect(retryBtn).toBeTruthy()
      await act(async () => {
        ;(retryBtn as HTMLButtonElement)?.click()
      })
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('renders RestrictedState for Client role', async () => {
      await mountAt('/rentals/B-715/evidence', <EvidenceWorkspace />, '/rentals/:bookingNo/evidence', 'Client')
      expect(container.textContent).toContain('Requires Staff')
      expect(container.textContent).toContain('Evidence workspace is for Babin Rentals staff only')
    })
  })

  describe('CasesWorkspace', () => {
    it('renders loading skeleton when loading=true', async () => {
      await mountAt('/operations/cases', <CasesWorkspace loading />, '/operations/cases')
      expect(container.textContent).toContain('Loading cases…')
    })

    it('renders ErrorBanner and invokes onRetry', async () => {
      const onRetry = vi.fn()
      await mountAt('/operations/cases', <CasesWorkspace error="Failed to fetch cases" onRetry={onRetry} />, '/operations/cases')
      expect(container.textContent).toContain('Could not refresh cases')
      expect(container.textContent).toContain('Failed to fetch cases')

      const retryBtn = container.querySelector('[role="alert"] button')
      expect(retryBtn).toBeTruthy()
      await act(async () => {
        ;(retryBtn as HTMLButtonElement)?.click()
      })
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('renders RestrictedState for Client role', async () => {
      await mountAt('/operations/cases', <CasesWorkspace />, '/operations/cases', 'Client')
      expect(container.textContent).toContain('Requires Staff')
      expect(container.textContent).toContain('Incident and damage cases are for Babin Rentals staff only')
    })
  })
})
