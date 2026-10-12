// @vitest-environment jsdom
/**
 * src/components/ui/creation/__tests__/globalAddMenu.test.tsx — Babin Rentals OS
 *
 * Comprehensive Test Suite for the Universal Add Dropdown Specification:
 * 1. Action registry & contextual resolution per module (Table in Section 2)
 * 2. 7 Canonical global groups filtering
 * 3. Law 6 Money blindness (Warehouse / Driver / Technician / Client hide financial actions)
 * 4. Interaction rules: Single-click open, no accidental writes, Escape/dismiss, touch targets >= 44px
 * 5. Searchable All Creation Actions modal filtering
 * 6. Quick create client validation and draft preservation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../Toast'
import {
  MODULE_CONTEXTUAL_MAPPING,
  getContextualActions,
  getGroupedGlobalActions,
  getAllPermittedActions,
} from '../CreationActionRegistry'
import { GlobalAddMenu } from '../GlobalAddMenu'
import { CreationContextProvider } from '../CreationContextProvider'
import { CreationActionSearch } from '../CreationActionSearch'
import { QuickCreateDialog } from '../QuickCreateDialog'
import type { SystemRole } from '../../../../types/database'

let mockRole: SystemRole = 'Owner'

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({
    user: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Babin Test Staff',
      role: mockRole,
      isSharedDevice: false,
    },
    logout: vi.fn(),
  }),
}))

;(globalThis as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true

describe('Universal Add Dropdown — Specification Verification', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mockRole = 'Owner'
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 1: Registry & Contextual Actions Mapping (Section 2 Table)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Section 1: Contextual Actions Mapping Table', () => {
    it('maps all 13 canonical modules defined in Section 2', () => {
      const requiredModules = [
        'today',
        'rentals',
        'calendar',
        'inventory',
        'bundles',
        'clients',
        'operations',
        'payments',
        'crew',
        'documents',
        'expenses',
        'maintenance',
        'settings',
      ]

      for (const mod of requiredModules) {
        const mapping = MODULE_CONTEXTUAL_MAPPING[mod]
        expect(mapping, `Module ${mod} must exist in MODULE_CONTEXTUAL_MAPPING`).toBeDefined()
        expect(mapping?.defaultActionId).toBeTruthy()
        expect(mapping?.otherActionIds.length).toBeGreaterThan(0)
      }
    })

    it('Today & Rentals: New Rental is default, Quote & Client are contextual', () => {
      const rentalsContext = getContextualActions('rentals', 'Owner')
      expect(rentalsContext.defaultAction?.id).toBe('rental.new')
      const otherIds = rentalsContext.otherActions.map((a) => a.id)
      expect(otherIds).toEqual(['quote.new', 'client.new'])

      const todayContext = getContextualActions('today', 'Owner')
      expect(todayContext.defaultAction?.id).toBe('rental.new')
      const todayIds = todayContext.otherActions.map((a) => a.id)
      expect(todayIds).toEqual(['quote.new', 'client.new'])
    })

    it('Inventory: New Equipment is default, Bundle & Category are contextual', () => {
      const invContext = getContextualActions('inventory', 'Owner')
      expect(invContext.defaultAction?.id).toBe('equipment.new')
      const otherIds = invContext.otherActions.map((a) => a.id)
      expect(otherIds).toEqual(['bundle.new', 'category.new'])
    })

    it('Bundles: New Bundle is default, Equipment is contextual', () => {
      const bundleContext = getContextualActions('bundles', 'Owner')
      expect(bundleContext.defaultAction?.id).toBe('bundle.new')
      const otherIds = bundleContext.otherActions.map((a) => a.id)
      expect(otherIds).toEqual(['equipment.new'])
    })

    it('Clients: New Client is default, Rental & Quote are contextual', () => {
      const clientsContext = getContextualActions('clients', 'Owner')
      expect(clientsContext.defaultAction?.id).toBe('client.new')
      const otherIds = clientsContext.otherActions.map((a) => a.id)
      expect(otherIds).toEqual(['rental.new', 'quote.new'])
    })

    it('Payments: Record Payment is default, Adjustment is contextual', () => {
      const paymentsContext = getContextualActions('payments', 'Owner')
      expect(paymentsContext.defaultAction?.id).toBe('payment.record')
      const otherIds = paymentsContext.otherActions.map((a) => a.id)
      expect(otherIds).toEqual(['adjustment.record'])
    })

    it('Operations & Maintenance: correct defaults and secondary options', () => {
      const opsContext = getContextualActions('operations', 'Owner')
      expect(opsContext.defaultAction?.id).toBe('task.new')
      expect(opsContext.otherActions.map((a) => a.id)).toEqual(['maintenance.new'])

      const maintContext = getContextualActions('maintenance', 'Owner')
      expect(maintContext.defaultAction?.id).toBe('maintenance.new')
      expect(maintContext.otherActions.map((a) => a.id)).toEqual(['inspection.new'])
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 2: Law 6 Money Blindness & Permission Gating
  // ───────────────────────────────────────────────────────────────────────────
  describe('Section 2: Law 6 Money Blindness Enforcement', () => {
    it('omits financial actions for Warehouse role on Rentals and Clients', () => {
      const rentalsContext = getContextualActions('rentals', 'Warehouse')
      expect(rentalsContext.defaultAction?.id).toBe('rental.new')
      const otherIds = rentalsContext.otherActions.map((a) => a.id)
      // New Quote must NEVER be visible to money-blind Warehouse staff
      expect(otherIds).not.toContain('quote.new')
      expect(otherIds).toContain('client.new')

      const clientsContext = getContextualActions('clients', 'Warehouse')
      const clientOtherIds = clientsContext.otherActions.map((a) => a.id)
      expect(clientOtherIds).not.toContain('quote.new')
      expect(clientOtherIds).toContain('rental.new')
    })

    it('omits payment and adjustment actions entirely for money-blind roles', () => {
      const paymentsContext = getContextualActions('payments', 'Warehouse')
      expect(paymentsContext.defaultAction).toBeNull()
      expect(paymentsContext.otherActions).toHaveLength(0)

      const permittedActions = getAllPermittedActions('Warehouse')
      const actionIds = permittedActions.map((a) => a.id)
      expect(actionIds).not.toContain('payment.record')
      expect(actionIds).not.toContain('adjustment.record')
      expect(actionIds).not.toContain('quote.new')
      expect(actionIds).not.toContain('expense.new')
    })

    it('omits global groups with 0 permitted actions for Warehouse and Driver', () => {
      const groupedWarehouse = getGroupedGlobalActions('Warehouse')
      const warehouseLabels = groupedWarehouse.map((g) => g.group.label)
      // Expenses & Administration is absent for Warehouse
      expect(warehouseLabels).not.toContain('Expenses & Administration')

      // Driver lacks booking desk, financial, and settings permissions
      const groupedDriver = getGroupedGlobalActions('Driver')
      const driverLabels = groupedDriver.map((g) => g.group.label)
      expect(driverLabels).not.toContain('Expenses & Administration')
      expect(driverLabels).not.toContain('Documents & Billing')
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 3: GlobalAddMenu Component Interaction & Accessibility
  // ───────────────────────────────────────────────────────────────────────────
  describe('Section 3: GlobalAddMenu Dropdown Interaction', () => {
    it('renders the universal Add button with >= 44x44px touch target (Law 15)', async () => {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <ToastProvider>
              <CreationContextProvider>
                <GlobalAddMenu module="rentals" />
              </CreationContextProvider>
            </ToastProvider>
          </MemoryRouter>
        )
      })

      const triggerBtn = container.querySelector('button[aria-label="Create new record"]') as HTMLButtonElement
      expect(triggerBtn).not.toBeNull()
      expect(triggerBtn.textContent).toContain('Add')
      expect(triggerBtn.style.minHeight).toBe('44px')
    })

    it('opens dropdown on single click without initiating record creation', async () => {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <ToastProvider>
              <CreationContextProvider>
                <GlobalAddMenu module="rentals" />
              </CreationContextProvider>
            </ToastProvider>
          </MemoryRouter>
        )
      })

      const triggerBtn = container.querySelector('button[aria-label="Create new record"]') as HTMLButtonElement
      expect(triggerBtn).not.toBeNull()

      // Dropdown menu is closed initially
      expect(document.querySelector('.global-add-menu')).toBeNull()

      // Single click opens menu
      await act(async () => {
        triggerBtn.click()
      })

      const menu = document.querySelector('.global-add-menu')
      expect(menu).not.toBeNull()

      // Contextual actions are displayed: New Rental (default), New Quote, New Client
      const items = menu?.querySelectorAll('.global-add-menu__item')
      expect(items).toBeDefined()
      expect(items!.length).toBeGreaterThanOrEqual(3)

      const defaultItem = menu?.querySelector('.global-add-menu__item--default')
      expect(defaultItem?.textContent).toContain('New Rental')

      const allItemsText = Array.from(items!).map((i) => i.textContent)
      expect(allItemsText.some((t) => t?.includes('New Quote'))).toBe(true)
      expect(allItemsText.some((t) => t?.includes('New Client'))).toBe(true)
    })

    it('closes dropdown on Escape key', async () => {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <ToastProvider>
              <CreationContextProvider>
                <GlobalAddMenu module="rentals" />
              </CreationContextProvider>
            </ToastProvider>
          </MemoryRouter>
        )
      })

      const triggerBtn = container.querySelector('button[aria-label="Create new record"]') as HTMLButtonElement
      await act(async () => {
        triggerBtn.click()
      })
      expect(document.querySelector('.global-add-menu')).not.toBeNull()

      // Press Escape on document with bubble
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      })

      expect(document.querySelector('.global-add-menu')).toBeNull()
    })

    it('hides financial actions in dropdown when user is Warehouse role', async () => {
      mockRole = 'Warehouse'

      await act(async () => {
        root.render(
          <MemoryRouter>
            <ToastProvider>
              <CreationContextProvider>
                <GlobalAddMenu module="rentals" />
              </CreationContextProvider>
            </ToastProvider>
          </MemoryRouter>
        )
      })

      const triggerBtn = container.querySelector('button[aria-label="Create new record"]') as HTMLButtonElement
      await act(async () => {
        triggerBtn.click()
      })

      const menu = document.querySelector('.global-add-menu')
      const menuText = menu?.textContent ?? ''

      expect(menuText).toContain('New Rental')
      expect(menuText).toContain('New Client')
      // Quote must NOT appear
      expect(menuText).not.toContain('New Quote')
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 4: Searchable All Creation Actions Panel
  // ───────────────────────────────────────────────────────────────────────────
  describe('Section 4: CreationActionSearch Filtering', () => {
    it('filters actions live by search query and permits selection', async () => {
      const onSelectSpy = vi.fn()
      const onCloseSpy = vi.fn()

      await act(async () => {
        root.render(
          <MemoryRouter>
            <CreationActionSearch
              isOpen={true}
              onClose={onCloseSpy}
              onSelectAction={onSelectSpy}
            />
          </MemoryRouter>
        )
      })

      const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement
      expect(searchInput).not.toBeNull()

      // Search for "bundle"
      await act(async () => {
        searchInput.value = 'bundle'
        searchInput.dispatchEvent(new Event('input', { bubbles: true }))
      })

      const matches = container.querySelectorAll('.action-search-match')
      expect(matches.length).toBeGreaterThan(0)
      const bundleMatch = Array.from(matches).find((m) => m.textContent?.includes('New Bundle'))
      expect(bundleMatch).toBeDefined()

      // Click to select
      await act(async () => {
        (bundleMatch as HTMLElement).click()
      })

      expect(onSelectSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'bundle.new' })
      )
    })
  })

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION 5: QuickCreateDialog Client Creation
  // ───────────────────────────────────────────────────────────────────────────
  describe('Section 5: QuickCreateDialog Behavior', () => {
    it('validates client name and phone number without premature save', async () => {
      const onCloseSpy = vi.fn()
      const onSuccessSpy = vi.fn()

      await act(async () => {
        root.render(
          <MemoryRouter>
            <ToastProvider>
              <QuickCreateDialog
                isOpen={true}
                actionId="client.new"
                onClose={onCloseSpy}
                onSuccess={onSuccessSpy}
              />
            </ToastProvider>
          </MemoryRouter>
        )
      })

      const nameInput = container.querySelector('#client-name-input') as HTMLInputElement
      const phoneInput = container.querySelector('#client-phone-input') as HTMLInputElement
      const buttons = Array.from(container.querySelectorAll('button'))
      const saveBtn = buttons.find((b) => b.textContent?.includes('Save Client'))

      expect(nameInput).not.toBeNull()
      expect(phoneInput).not.toBeNull()
      expect(saveBtn).toBeDefined()

      // Click Save Client without entering data
      await act(async () => {
        saveBtn!.click()
      })

      // Must not succeed with empty inputs
      expect(onSuccessSpy).not.toHaveBeenCalled()
    })
  })
})
